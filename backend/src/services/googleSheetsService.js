const { google } = require('googleapis');
const fs = require('fs');
const path = require('path');

let sheets = null;
let spreadsheetId = null;

// Cache em memória para reduzir requisições ao Sheets (quota: 60 req/min)
const cache = new Map(); // sheetName -> { data, ts }
const CACHE_TTL = 3 * 60 * 1000; // 3 minutos (era 30s — aumentado para reduzir GC pressure)

function getCached(sheetName) {
  const entry = cache.get(sheetName);
  if (entry && Date.now() - entry.ts < CACHE_TTL) return entry.data;
  return null;
}

function setCached(sheetName, data) {
  cache.set(sheetName, { data, ts: Date.now() });
}

function invalidateCache(sheetName) {
  cache.delete(sheetName);
}

// Limpeza periódica de entradas expiradas para evitar memory leak
setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of cache.entries()) {
    if (now - entry.ts > CACHE_TTL) cache.delete(key);
  }
}, 5 * 60 * 1000); // roda a cada 5 minutos

/**
 * Inicializa o cliente do Google Sheets com as credenciais da Service Account.
 */
async function initialize() {
  if (sheets) return sheets;

  spreadsheetId = process.env.GOOGLE_SPREADSHEET_ID;
  if (!spreadsheetId) {
    throw new Error('GOOGLE_SPREADSHEET_ID não configurado no .env');
  }

  let credentials;

  // Opção 1: Arquivo de credenciais local
  const keyFile = process.env.GOOGLE_SERVICE_ACCOUNT_KEY_FILE;
  if (keyFile) {
    const absolutePath = path.resolve(__dirname, '../..', keyFile);
    if (fs.existsSync(absolutePath)) {
      credentials = JSON.parse(fs.readFileSync(absolutePath, 'utf8'));
    }
  }

  // Opção 2: Credenciais em base64 (produção)
  if (!credentials && process.env.GOOGLE_SERVICE_ACCOUNT_KEY_BASE64) {
    credentials = JSON.parse(
      Buffer.from(process.env.GOOGLE_SERVICE_ACCOUNT_KEY_BASE64, 'base64').toString('utf8')
    );
  }

  if (!credentials) {
    throw new Error('Credenciais Google não encontradas. Configure GOOGLE_SERVICE_ACCOUNT_KEY_FILE ou GOOGLE_SERVICE_ACCOUNT_KEY_BASE64 no .env');
  }

  const auth = new google.auth.GoogleAuth({
    credentials,
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  });

  const authClient = await auth.getClient();
  sheets = google.sheets({ version: 'v4', auth: authClient });
  console.log('[Google Sheets] Conectado com sucesso.');
  return sheets;
}

/**
 * Garante que todas as abas necessárias existam na planilha.
 */
const REQUIRED_SHEETS = [
  { name: 'USER', headers: ['ID', 'Nome', 'Email', 'Senha_Hash', 'Perfil', 'Empresa', 'Ativo', 'Criado_Em', 'Ultimo_Login'] },
  { name: 'Projetos_Contratos', headers: ['ID_Projeto', 'Nome', 'Cliente', 'Valor_Global', 'Teto_Terc_Perc', 'Teto_Terc_Valor', 'ID_ClickUp', 'Centro_Custo_OPP', 'Status', 'Progresso_Perc', 'Data_Inicio', 'Data_Entrega_Contrato', 'Data_Entrega_Planejada', 'Empresa', 'Setor', 'Tipologia', 'Link_ClickUp', 'Criado_Em', 'Atualizado_Em', 'Responsavel'] },
  { name: 'Planejamentos', headers: ['ID', 'ID_Projeto', 'Nome_Projeto', 'Cliente', 'Nr_Contrato_OS', 'Resp_Planejamento', 'Resp_Aprovacao', 'Setor', 'Tipologia', 'Empresa', 'Link_ClickUp', 'Valor_Contrato', 'Impostos_Perc', 'Taxa_Adm_Perc', 'Comissao_Perc', 'Data_Inicio_OS', 'Data_Entrega_Contrato', 'Data_Entrega_Planejada', 'Status', 'Justificativa', 'Criado_Por', 'Criado_Em', 'Aprovado_Por', 'Aprovado_Em', 'Dados_JSON'] },
  { name: 'Medicoes', headers: ['ID_Medicao', 'ID_Projeto', 'Etapa', 'Percentual', 'Valor', 'Data_Previsao', 'Data_Realizacao', 'Status_Fisico', 'Status_Financeiro', 'ID_Tarefa_ClickUp', 'Nr_NF', 'Data_Emissao_NF', 'Data_Vencimento', 'Data_Recebimento', 'Observacao'] },
  { name: 'Terceirizados', headers: ['ID', 'ID_Projeto', 'Servico', 'Fornecedor', 'Valor_Contratado', 'Valor_Pago', 'Status', 'ID_Tarefa_ClickUp', 'ID_Medicao_Vinculada', 'Percentual_do_Total', 'Data_Entrega_Prevista', 'Data_Entrega_Real', 'Observacao', 'Aprovado_Por', 'Criado_Em', 'OC', 'Status_ClickUp', 'Etapa_ClickUp', 'Responsavel'] },
  { name: 'Equipe_Planejamento', headers: ['ID', 'ID_Planejamento', 'Colaborador', 'Media_Hora', 'Horas_Estimadas', 'Total'] },
  { name: 'Despesas_Planejamento', headers: ['ID', 'ID_Planejamento', 'Descricao', 'Valor'] },
  { name: 'Log_Horas', headers: ['ID', 'ID_Projeto', 'Colaborador', 'Horas_Estimadas', 'Horas_Logadas', 'Custo_Calculado', 'Data', 'ID_TimeEntry_ClickUp'] },
  { name: 'Custos_OPP', headers: ['ID', 'ID_Projeto', 'Centro_Custo', 'Descricao', 'Valor_Lancado', 'Data_Lancamento', 'Tipo', 'Fornecedor_Cliente', 'Nr_Documento', 'ID_Importacao'] },
  { name: 'Alertas', headers: ['ID', 'Tipo_Alerta', 'ID_Projeto', 'Mensagem', 'Data_Geracao', 'Setor_Destino', 'Visto_Por', 'Status', 'Nivel', 'Link_ClickUp'] },
  { name: 'Log_Importacoes', headers: ['ID', 'Data_Upload', 'Arquivo', 'Usuario', 'Registros_Processados', 'Erros', 'Status', 'Detalhes'] },
  { name: 'Configuracoes', headers: ['Chave', 'Valor', 'Descricao'] },
  { name: 'Financeiro_OPP', headers: ['ID_OPP', 'Tipo', 'Profissional', 'Categoria', 'Descricao', 'Valor', 'Data_Vencimento', 'Data_Competencia', 'Situacao', 'ID_Cliente_OPP', 'Nome_Cliente', 'Nr_Documento', 'Nr_OS_OPP', 'OC', 'Sincronizado_Em'] },
  { name: 'OrdensCompra_OPP', headers: ['ID_OC', 'ID_Ordem_OPP', 'Nome_Fornecedor', 'Valor_Total', 'Data_Pedido', 'Situacao', 'Observacao', 'Sincronizado_Em'] },
];

async function ensureSheetsExist() {
  const client = await initialize();
  const spreadsheet = await client.spreadsheets.get({ spreadsheetId });
  const existing = spreadsheet.data.sheets.map((s) => s.properties.title);

  const requests = [];
  for (const sheet of REQUIRED_SHEETS) {
    if (!existing.includes(sheet.name)) {
      requests.push({ addSheet: { properties: { title: sheet.name } } });
    }
  }

  if (requests.length > 0) {
    await client.spreadsheets.batchUpdate({ spreadsheetId, requestBody: { requests } });
    // Adiciona cabeçalhos
    for (const sheet of REQUIRED_SHEETS) {
      if (!existing.includes(sheet.name)) {
        await client.spreadsheets.values.update({
          spreadsheetId,
          range: `${sheet.name}!A1`,
          valueInputOption: 'RAW',
          requestBody: { values: [sheet.headers] },
        });
      }
    }
    console.log('[Google Sheets] Abas criadas com sucesso.');
  }
}

/**
 * Lê todos os registros de uma aba. Retorna array de objetos.
 */
async function readSheet(sheetName) {
  const cached = getCached(sheetName);
  if (cached) return cached;

  const client = await initialize();
  const res = await client.spreadsheets.values.get({
    spreadsheetId,
    range: sheetName,
  });

  const rows = res.data.values || [];
  if (rows.length < 2) {
    setCached(sheetName, []);
    return [];
  }

  const headers = rows[0];
  const data = rows.slice(1).map((row) => {
    const obj = {};
    headers.forEach((h, i) => {
      obj[h] = row[i] !== undefined ? row[i] : '';
    });
    return obj;
  });

  setCached(sheetName, data);
  return data;
}

/**
 * Encontra registros que satisfazem uma condição.
 */
async function findRows(sheetName, condition) {
  const rows = await readSheet(sheetName);
  return rows.filter(condition);
}

/**
 * Encontra um único registro.
 */
async function findOne(sheetName, condition) {
  const rows = await readSheet(sheetName);
  return rows.find(condition) || null;
}

/**
 * Insere um novo registro no final da aba.
 * Retorna o objeto inserido.
 */
async function insertRow(sheetName, data) {
  const client = await initialize();
  const headers = await getHeaders(sheetName);
  const row = headers.map((h) => data[h] !== undefined ? String(data[h]) : '');

  await client.spreadsheets.values.append({
    spreadsheetId,
    range: `${sheetName}!A1`,
    valueInputOption: 'RAW',
    insertDataOption: 'INSERT_ROWS',
    requestBody: { values: [row] },
  });

  invalidateCache(sheetName);
  return data;
}

/**
 * Atualiza um registro existente pela posição da linha (1-based, sem contar cabeçalho).
 */
async function updateRowByIndex(sheetName, rowIndex, data) {
  const client = await initialize();
  const headers = await getHeaders(sheetName);
  const sheetRow = rowIndex + 1; // +1 para o cabeçalho, +1 para 1-based
  const row = headers.map((h) => data[h] !== undefined ? String(data[h]) : '');

  await client.spreadsheets.values.update({
    spreadsheetId,
    range: `${sheetName}!A${sheetRow + 1}`,
    valueInputOption: 'RAW',
    requestBody: { values: [row] },
  });
}

/**
 * Atualiza um registro encontrado pelo campo ID.
 */
async function updateRowById(sheetName, idField, idValue, newData) {
  const client = await initialize();
  const res = await client.spreadsheets.values.get({ spreadsheetId, range: sheetName });
  const rows = res.data.values || [];
  if (rows.length < 2) return null;

  const headers = rows[0];
  const idIndex = headers.indexOf(idField);
  if (idIndex === -1) throw new Error(`Campo ${idField} não encontrado na aba ${sheetName}`);

  let targetRowNum = -1;
  for (let i = 1; i < rows.length; i++) {
    if (rows[i][idIndex] === String(idValue)) {
      targetRowNum = i + 1; // 1-based sheet row
      break;
    }
  }

  if (targetRowNum === -1) return null;

  const currentRow = {};
  headers.forEach((h, i) => { currentRow[h] = rows[targetRowNum - 1][i] || ''; });
  const mergedRow = { ...currentRow, ...newData };
  const updatedRow = headers.map((h) => mergedRow[h] !== undefined ? String(mergedRow[h]) : '');

  await client.spreadsheets.values.update({
    spreadsheetId,
    range: `${sheetName}!A${targetRowNum}`,
    valueInputOption: 'RAW',
    requestBody: { values: [updatedRow] },
  });

  invalidateCache(sheetName);
  return mergedRow;
}

/**
 * Deleta uma linha pelo ID.
 */
async function deleteRowById(sheetName, idField, idValue) {
  const client = await initialize();
  const spreadsheet = await client.spreadsheets.get({ spreadsheetId });
  const sheetMeta = spreadsheet.data.sheets.find((s) => s.properties.title === sheetName);
  if (!sheetMeta) throw new Error(`Aba ${sheetName} não encontrada.`);

  const sheetId = sheetMeta.properties.sheetId;
  const res = await client.spreadsheets.values.get({ spreadsheetId, range: sheetName });
  const rows = res.data.values || [];
  const headers = rows[0];
  const idIndex = headers.indexOf(idField);

  let targetRowIndex = -1;
  for (let i = 1; i < rows.length; i++) {
    if (rows[i][idIndex] === String(idValue)) {
      targetRowIndex = i;
      break;
    }
  }

  if (targetRowIndex === -1) return false;

  await client.spreadsheets.batchUpdate({
    spreadsheetId,
    requestBody: {
      requests: [{
        deleteDimension: {
          range: { sheetId, dimension: 'ROWS', startIndex: targetRowIndex, endIndex: targetRowIndex + 1 },
        },
      }],
    },
  });

  return true;
}

/**
 * Retorna os cabeçalhos de uma aba.
 */
async function getHeaders(sheetName) {
  const client = await initialize();
  const res = await client.spreadsheets.values.get({
    spreadsheetId,
    range: `${sheetName}!1:1`,
  });
  return res.data.values?.[0] || [];
}

/**
 * Insere múltiplas linhas de uma vez.
 */
async function insertManyRows(sheetName, dataArray) {
  if (!dataArray || dataArray.length === 0) return;
  const client = await initialize();
  const headers = await getHeaders(sheetName);
  const rows = dataArray.map((data) => headers.map((h) => data[h] !== undefined ? String(data[h]) : ''));

  await client.spreadsheets.values.append({
    spreadsheetId,
    range: `${sheetName}!A1`,
    valueInputOption: 'RAW',
    insertDataOption: 'INSERT_ROWS',
    requestBody: { values: rows },
  });

  invalidateCache(sheetName);
}

/**
 * Atualiza em lote todas as linhas que passam no filtro, aplicando newData.
 * Faz apenas 1 leitura + 1 escrita batchUpdate, independente da quantidade.
 */
async function updateManyRowsWhere(sheetName, filterFn, newData) {
  const client = await initialize();
  const res = await client.spreadsheets.values.get({ spreadsheetId, range: sheetName });
  const rows = res.data.values || [];
  if (rows.length < 2) return 0;

  const headers = rows[0];
  const updateRanges = [];

  for (let i = 1; i < rows.length; i++) {
    const rowObj = {};
    headers.forEach((h, j) => { rowObj[h] = rows[i][j] || ''; });

    if (!filterFn(rowObj)) continue;

    const merged = { ...rowObj, ...newData };
    const updatedValues = headers.map(h => merged[h] !== undefined ? String(merged[h]) : '');
    const sheetRowNum = i + 1; // 1-based

    updateRanges.push({
      range: `${sheetName}!A${sheetRowNum}`,
      values: [updatedValues],
    });
  }

  if (updateRanges.length === 0) return 0;

  await client.spreadsheets.values.batchUpdate({
    spreadsheetId,
    requestBody: { valueInputOption: 'RAW', data: updateRanges },
  });

  invalidateCache(sheetName);
  return updateRanges.length;
}

/**
 * Limpa todos os dados (mantém cabeçalho) de uma aba.
 * Usa values.clear para apagar fisicamente todas as linhas, depois restaura o cabeçalho.
 */
async function clearSheetData(sheetName) {
  const client = await initialize();
  const res = await client.spreadsheets.values.get({ spreadsheetId, range: sheetName });
  const rows = res.data.values || [];
  if (rows.length === 0) return;

  const headers = rows[0];

  // Apaga TODOS os valores da aba (inclusive as linhas extras que values.update não apagaria)
  await client.spreadsheets.values.clear({ spreadsheetId, range: sheetName });

  // Restaura apenas o cabeçalho
  await client.spreadsheets.values.update({
    spreadsheetId,
    range: `${sheetName}!A1`,
    valueInputOption: 'RAW',
    requestBody: { values: [headers] },
  });

  invalidateCache(sheetName);
}

module.exports = {
  initialize,
  ensureSheetsExist,
  readSheet,
  findRows,
  findOne,
  insertRow,
  updateRowByIndex,
  updateRowById,
  updateManyRowsWhere,
  deleteRowById,
  insertManyRows,
  clearSheetData,
};
