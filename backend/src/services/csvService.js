const { parse } = require('csv-parse/sync');
const XLSX = require('xlsx');
const db = process.env.USE_POSTGRES === 'true' ? require('./postgresService') : require('./googleSheetsService');
const { v4: uuidv4 } = require('uuid');

/**
 * Colunas reais exportadas pelo Opportune (Relatório de Contas a Pagar/Receber):
 * Vencimento | Fornecedor | Nome da Despesa | Categoria | Situação |
 * Valor Original | Valor Baixado | Juros | Acréscimo | Desconto | Taxa | Valor Pago
 */

/**
 * Faz parse do CSV exportado do Opportune.
 * Aceita tanto ponto-e-vírgula quanto vírgula como delimitador.
 */
function parseCSV(buffer) {
  const content = buffer.toString('utf8');
  const delimiter = content.includes(';') ? ';' : ',';

  const records = parse(content, {
    delimiter,
    columns: true,
    skip_empty_lines: true,
    trim: true,
    bom: true,
  });

  return records;
}

/**
 * Faz parse de XLSX ou XLS exportado do Opportune usando SheetJS.
 * Suporta .xlsx, .xls, e até arquivos HTML/CSV com extensão errada.
 */
function parseXLSX(buffer) {
  const workbook = XLSX.read(buffer, { type: 'buffer', cellDates: true });

  const sheetName = workbook.SheetNames[0];
  if (!sheetName) throw new Error('Planilha vazia ou inválida.');

  const worksheet = workbook.Sheets[sheetName];
  const rows = XLSX.utils.sheet_to_json(worksheet, {
    defval: '',
    raw: false, // formata datas como strings
    dateNF: 'dd/mm/yyyy',
  });

  return rows;
}

/**
 * Normaliza e valida os registros do CSV real do Opportune.
 * Colunas disponíveis (selecionar ao exportar):
 * Vencimento, Fornecedor, Nome da Despesa, Emissão, Documento,
 * Centro de Custos ← OBRIGATÓRIO marcar na exportação,
 * Categoria, Situação, Valor Original, Valor Baixado,
 * Juros, Acréscimo, Desconto, Taxa, Valor Pago
 */
function normalizeRecords(records) {
  const normalized = [];
  const errors = [];

  records.forEach((row, idx) => {
    const lineNum = idx + 2;

    const descricao      = row['Nome da Despesa'] || row['Descrição'] || row['Descricao'] || '';
    const fornecedor     = row['Fornecedor'] || row['Fornecedor / Cliente'] || '';
    const dataVenc       = row['Vencimento'] || row['Data Lançamento'] || '';
    const emissao        = row['Emissão'] || row['Emissao'] || '';
    const documento      = row['Documento'] || row['Nº Documento'] || '';
    const centroCustos   = row['Centro de Custos'] || row['Centro de Custo'] || row['CentroCusto'] || '';
    const categoria      = row['Categoria'] || '';
    const contaBancaria  = row['Conta Bancária'] || row['Conta Bancaria'] || '';
    const situacao       = row['Situação'] || row['Situacao'] || row['Tipo'] || '';
    const valorStr       = row['Valor Original'] || row['Valor Lançado'] || row['Valor'] || '0';
    const valorPagoStr   = row['Valor Pago'] || row['Valor Baixado'] || '0';
    const jurosStr       = row['Juros'] || '0';
    const acrescimoStr   = row['Acréscimo'] || row['Acrescimo'] || '0';
    const descontoStr    = row['Desconto'] || '0';
    const taxaStr        = row['Taxa'] || '0';

    // Extrai tipo da Situação ("Pago (02/04/2026)" → "Pago", "Em aberto" → "A Pagar")
    let tipo = 'A Pagar';
    const sit = situacao.toLowerCase();
    if (sit.includes('pago') || sit.includes('baixado') || sit.includes('realizado') || sit.includes('liquidado')) tipo = 'Pago';
    else if (sit.includes('receber') || sit.includes('recebido')) tipo = 'A Receber';
    else if (sit.includes('aberto') || sit.includes('pagar') || sit.includes('vencido') || sit.includes('agendado')) tipo = 'A Pagar';

    function parseValor(str) {
      const limpo = String(str).replace(/\./g, '').replace(',', '.').replace(/[^0-9.-]/g, '');
      return parseFloat(limpo) || 0;
    }

    if (!descricao && !fornecedor) {
      errors.push({ linha: lineNum, campo: 'Nome da Despesa', erro: 'Linha sem dados relevantes.' });
      return;
    }

    normalized.push({
      Centro_Custo_CSV: centroCustos.trim(),   // vem do CSV se o usuário marcou a coluna
      Descricao:        descricao.trim(),
      Fornecedor_Cliente: fornecedor.trim(),
      Data_Lancamento:  dataVenc.trim(),
      Emissao:          emissao.trim(),
      Nr_Documento:     documento.trim(),
      Conta_Bancaria:   contaBancaria.trim(),
      Categoria:        categoria.trim(),
      Tipo:             tipo,
      Situacao_Original: situacao.trim(),
      Valor_Lancado:    parseValor(valorStr),
      Valor_Pago:       parseValor(valorPagoStr),
      Juros:            parseValor(jurosStr),
      Acrescimo:        parseValor(acrescimoStr),
      Desconto:         parseValor(descontoStr),
      Taxa:             parseValor(taxaStr),
    });
  });

  return { normalized, errors };
}

/**
 * Vincula registros aos projetos.
 * Prioridade:
 *  1. Centro_Custo_CSV (se o usuário exportou com a coluna "Centro de Custos") → match automático
 *  2. idProjeto manual (selecionado pelo usuário na tela)
 *  3. Sem vínculo
 */
async function linkToProjects(normalized, idProjetoManual) {
  const projects = await db.readSheet('Projetos_Contratos');

  // Mapa: Centro_Custo_OPP (lowercase) → { ID_Projeto, Nome, Centro_Custo_OPP }
  const byCC = {};
  for (const p of projects) {
    if (p.Centro_Custo_OPP) byCC[p.Centro_Custo_OPP.trim().toLowerCase()] = p;
    // também tenta pelo nome do projeto
    if (p.Nome) byCC[p.Nome.trim().toLowerCase()] = p;
  }

  // Projeto manual selecionado (fallback)
  const projetoManual = idProjetoManual
    ? projects.find(p => p.ID_Projeto === idProjetoManual)
    : null;

  const linked   = [];
  const unlinked = [];

  for (const record of normalized) {
    let projeto = null;

    // 1. Tenta vincular pelo Centro de Custos do CSV
    if (record.Centro_Custo_CSV) {
      projeto = byCC[record.Centro_Custo_CSV.toLowerCase()];
    }

    // 2. Fallback: projeto selecionado manualmente
    if (!projeto && projetoManual) {
      projeto = projetoManual;
    }

    if (projeto) {
      linked.push({
        ...record,
        ID_Projeto:   projeto.ID_Projeto,
        Centro_Custo: record.Centro_Custo_CSV || projeto.Centro_Custo_OPP || projeto.Nome,
      });
    } else {
      unlinked.push({ ...record, Centro_Custo: record.Centro_Custo_CSV || '' });
    }
  }

  return { linked, unlinked };
}

/**
 * Importa registros validados para o Google Sheets (aba Custos_OPP).
 */
async function importToSheets(linked, importId) {
  const rows = linked.map((r) => ({
    ID:                uuidv4(),
    ID_Projeto:        r.ID_Projeto,
    Centro_Custo:      r.Centro_Custo,
    Descricao:         r.Descricao,
    Valor_Lancado:     String(r.Valor_Lancado),
    Data_Lancamento:   r.Data_Lancamento,
    Tipo:              r.Tipo,
    Fornecedor_Cliente: r.Fornecedor_Cliente,
    Nr_Documento:      r.Nr_Documento || '',
    Categoria:         r.Categoria || '',
    Valor_Pago:        String(r.Valor_Pago || 0),
    Situacao_Original: r.Situacao_Original || '',
    Emissao:           r.Emissao || '',
    Conta_Bancaria:    r.Conta_Bancaria || '',
    Juros:             String(r.Juros || 0),
    Acrescimo:         String(r.Acrescimo || 0),
    Desconto:          String(r.Desconto || 0),
    Taxa:              String(r.Taxa || 0),
    ID_Importacao:     importId,
  }));

  await db.insertManyRows('Custos_OPP', rows);
  return rows.length;
}

/**
 * Processo completo de importação do CSV do Opportune.
 * @param {Buffer} fileBuffer
 * @param {string} filename
 * @param {string} userId
 * @param {string|null} idProjeto — projeto selecionado manualmente (fallback se CSV não tiver Centro de Custos)
 * @param {boolean} importarSemVinculo — se true, importa registros sem vínculo de projeto também
 */
async function processOpportuneCSV(fileBuffer, filename, userId, idProjeto, importarSemVinculo = false) {
  const importId = uuidv4();
  await db.insertRow('Log_Importacoes', {
    ID: importId,
    Data_Upload: new Date().toISOString(),
    Arquivo: filename,
    Usuario: userId,
    ID_Projeto: idProjeto || '',
    Registros_Processados: '0',
    Erros: '0',
    Status: 'processando',
    Detalhes: '',
  });

  let records;
  try {
    const isXlsx = filename.toLowerCase().endsWith('.xlsx') || filename.toLowerCase().endsWith('.xls');
    records = isXlsx ? parseXLSX(fileBuffer) : parseCSV(fileBuffer);
  } catch (err) {
    await db.updateRowById('Log_Importacoes', 'ID', importId, {
      Status: 'erro',
      Detalhes: `Erro ao parsear arquivo: ${err.message}`,
    });
    throw new Error(`Erro ao ler o arquivo: ${err.message}`);
  }

  const { normalized, errors } = normalizeRecords(records);
  const { linked, unlinked }   = await linkToProjects(normalized, idProjeto);

  // Se importarSemVinculo, inclui os não vinculados com ID_Projeto vazio
  const toImport = importarSemVinculo
    ? [...linked, ...unlinked.map(r => ({ ...r, ID_Projeto: '', Centro_Custo: r.Centro_Custo || r.Centro_Custo_CSV || '' }))]
    : linked;

  let importedCount = 0;
  if (toImport.length > 0) {
    importedCount = await importToSheets(toImport, importId);
  }

  const details = {
    total: records.length,
    importados: importedCount,
    nao_vinculados: unlinked.map((r) => r.Centro_Custo || '(sem centro de custos)'),
    erros_linha: errors,
  };

  await db.updateRowById('Log_Importacoes', 'ID', importId, {
    Registros_Processados: String(importedCount),
    Erros: String(errors.length + unlinked.length),
    Status: errors.length > 0 || unlinked.length > 0 ? 'parcial' : 'sucesso',
    Detalhes: JSON.stringify(details),
  });

  return {
    importId,
    total: records.length,
    importados: importedCount,
    erros: errors,
    nao_vinculados: unlinked.map((r) => r.Centro_Custo || '(sem centro de custos)'),
    total_nao_vinculados: unlinked.length,
  };
}

module.exports = { processOpportuneCSV, parseCSV, parseXLSX, normalizeRecords };
