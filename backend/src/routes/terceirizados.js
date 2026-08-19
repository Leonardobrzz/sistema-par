const express = require('express');
const { v4: uuidv4 } = require('uuid');
const db = process.env.USE_POSTGRES === 'true'
  ? require('../services/postgresService')
  : require('../services/googleSheetsService');
const { authMiddleware } = require('../middleware/auth');
const { createAlert } = require('../services/alertService');
const { auditMiddleware } = require('../middleware/audit');

const router = express.Router();
router.use(authMiddleware);
const audit = auditMiddleware('Terceirizados');

const TETO_AVISO = parseFloat(process.env.TETO_TERCEIROS_AVISO || '15');
const TETO_BLOQUEIO = parseFloat(process.env.TETO_TERCEIROS_BLOQUEIO || '20');

// Calcula % total de terceirizados de um projeto
async function calcPercTerceiros(idProjeto, valorGlobal, excludeId = null) {
  const tercs = await db.findRows('Terceirizados', (t) =>
    t.ID_Projeto === idProjeto && t.Status !== 'Cancelado' && (excludeId ? t.ID !== excludeId : true)
  );
  const total = tercs.reduce((s, t) => s + parseFloat(t.Valor_Contratado || 0), 0);
  const perc = valorGlobal > 0 ? (total / valorGlobal) * 100 : 0;
  return { total, perc, count: tercs.length };
}

// Busca contas-pagar do OPP ao vivo
// centro_custos_pag é sempre vazio no OPP — matching por OC (observacoes_pag) ou nome_fornecedor
async function fetchDespesasOPP() {
  try {
    const { oppRequest } = require('../services/oppService');
    let offset = 0, despesas = [];
    while (true) {
      const r = await oppRequest('GET', `/contas-pagar?limit=250&offset=${offset}&lixeira=Nao`);
      const lista = Array.isArray(r) ? r : (r?.data || []);
      if (lista.length === 0) break;
      despesas.push(...lista);
      if (lista.length < 250) break;
      offset += 250;
      if (offset > 10000) break;
    }

    // Mapa por OC (extraído de observacoes_pag: "Ref. a ordem de compra nº 1234...")
    const porOC = {};
    // Mapa por nome_fornecedor (normalizado)
    const porForn = {};

    const ocRegex = /ordem de compra\s*n[º°]?\s*(\d+)/i;

    for (const d of despesas) {
      if (d.lixeira === 'Sim') continue;
      if ((d.situacao || '').toLowerCase().includes('estornada')) continue;
      const vTotal = parseFloat(d.valor_pag || 0);
      const vPago  = parseFloat(d.valor_pago || 0);
      if (vTotal === 0 && vPago === 0) continue;

      // Tenta extrair OC das observações
      const obs = d.observacoes_pag || '';
      const matchOC = obs.match(ocRegex);
      if (matchOC) {
        const ocNum = matchOC[1];
        if (!porOC[ocNum]) porOC[ocNum] = { total: 0, pago: 0, nome_fornecedor: d.nome_fornecedor || '' };
        porOC[ocNum].total += vTotal;
        porOC[ocNum].pago  += vPago;
      }

      // Agrupa por fornecedor (fallback)
      const forn = (d.nome_fornecedor || '').toLowerCase().trim();
      if (forn) {
        if (!porForn[forn]) porForn[forn] = { total: 0, pago: 0 };
        porForn[forn].total += vTotal;
        porForn[forn].pago  += vPago;
      }
    }

    return { porOC, porForn };
  } catch { return { porOC: {}, porForn: {} }; }
}

// GET /api/terceirizados?projeto=ID
router.get('/', async (req, res, next) => {
  try {
    const { projeto, idProjeto, status } = req.query;
    const filtroId = projeto || idProjeto;

    const [rows0, projetos, oppData] = await Promise.all([
      db.readSheet('Terceirizados'),
      db.readSheet('Projetos_Contratos'),
      fetchDespesasOPP(),
    ]);

    let rows = rows0;
    if (filtroId) rows = rows.filter((r) => r.ID_Projeto === filtroId);
    if (status) rows = rows.filter((r) => r.Status === status);

    const projMap = Object.fromEntries(projetos.map(p => [p.ID_Projeto, p]));
    const { porOC, porForn } = oppData;
    const pBR = (v) => parseFloat(String(v || 0).replace(/\./g, '').replace(',', '.')) || 0;

    rows = rows.map(r => {
      const proj = projMap[r.ID_Projeto];

      // Match 1: por OC (mais preciso)
      let oppEntry = r.OC ? (porOC[String(r.OC).trim()] || null) : null;

      // Match 2: por nome do fornecedor (fallback, soma todos os pagamentos desse fornecedor)
      if (!oppEntry) {
        const fornNorm = (r.Fornecedor || r.Responsavel || '').toLowerCase().trim();
        if (fornNorm) {
          oppEntry = porForn[fornNorm] || null;
          if (!oppEntry) {
            // fuzzy match
            for (const [k, v] of Object.entries(porForn)) {
              if (fornNorm.includes(k) || k.includes(fornNorm)) { oppEntry = v; break; }
            }
          }
        }
      }

      const valorContratadoOPP = oppEntry?.total || 0;
      const valorPagoOPP       = oppEntry?.pago  || 0;
      const valorContratadoPAR = pBR(r.Valor_Contratado || r.Valor_Estimado || 0);

      const valorContratado = valorContratadoOPP || valorContratadoPAR;
      const valorLiquidado  = valorPagoOPP;
      const saldo = Math.max(0, valorContratado - valorLiquidado);

      const valorGlobal = parseFloat(proj?.Valor_Global || 0);
      const percCalc = valorGlobal > 0 && valorContratado > 0
        ? ((valorContratado / valorGlobal) * 100).toFixed(2)
        : (r.Percentual_Contrato || r.Percentual_do_Total || '0');

      return {
        ...r,
        nomeProjeto: proj?.Nome || r.ID_Projeto || '',
        Cliente: r.Cliente || proj?.Cliente || proj?.Nome_Cliente || '',
        Setor: proj?.Setor || r.Setor || '',
        Descricao_Servico: r.Descricao_Servico || r.Servico || '',
        Fornecedor: r.Fornecedor || r.Responsavel || '',
        Valor_Contratado: String(valorContratado),
        Valor_Liquidado: String(valorLiquidado),
        Saldo: String(saldo),
        Percentual_Contrato: percCalc,
        Data_Vencimento: r.Data_Vencimento || r.Data_Entrega_Prevista || '',
        ID_Terceirizado: r.ID_Terceirizado || r.ID || '',
        Link_Contrato: r.Link_Contrato || '',
        Nr_Contrato: r.Nr_Contrato || '',
      };
    });

    res.json(rows);
  } catch (err) {
    next(err);
  }
});

// GET /api/terceirizados/:id
router.get('/:id', async (req, res, next) => {
  try {
    const row = await db.findOne('Terceirizados', (r) => r.ID === req.params.id);
    if (!row) return res.status(404).json({ error: 'Terceirizado não encontrado.' });
    res.json(row);
  } catch (err) {
    next(err);
  }
});

// POST /api/terceirizados — cria novo terceirizado
router.post('/', audit, async (req, res, next) => {
  try {
    const {
      idProjeto, ID_Projeto,
      servico, Servico, Descricao_Servico,
      fornecedor, Fornecedor,
      cnpjCpf, CNPJ_CPF,
      valorContratado, Valor_Contratado,
      valorEstimado, Valor_Estimado,
      idTarefaClickUp, dataEntregaPrevista, Data_Vencimento,
      observacao, Observacoes,
      Nr_NF, Data_Pagamento,
      Link_Contrato, Nr_Contrato,
      Status,
    } = req.body;

    const _idProjeto = idProjeto || ID_Projeto;
    const _servico = servico || Servico || Descricao_Servico;
    const _fornecedor = fornecedor || Fornecedor;

    if (!_idProjeto || !_servico || !_fornecedor) {
      return res.status(400).json({ error: 'Projeto, serviço e fornecedor são obrigatórios.' });
    }

    const idProjetoFinal = _idProjeto;
    const servicoFinal = _servico;
    const fornecedorFinal = _fornecedor;

    const project = await db.findOne('Projetos_Contratos', (p) => p.ID_Projeto === idProjetoFinal);
    if (!project) return res.status(404).json({ error: 'Projeto não encontrado.' });

    const valor = parseFloat(valorContratado || Valor_Contratado || 0);
    const valorEst = parseFloat(valorEstimado || Valor_Estimado || valor || 0);
    const valorGlobal = parseFloat(project.Valor_Global || 0);

    // Verifica teto ANTES de inserir
    const { total, perc } = await calcPercTerceiros(idProjetoFinal, valorGlobal);
    const novoPerc = valorGlobal > 0 ? ((total + valor) / valorGlobal) * 100 : 0;

    if (novoPerc > TETO_BLOQUEIO) {
      await createAlert({
        tipo: 'TETO_TERCEIROS_BLOQUEIO',
        idProjeto: idProjetoFinal,
        mensagem: `Tentativa bloqueada: adicionar ${fornecedorFinal} elevaria terceirizados para ${novoPerc.toFixed(1)}% (limite: ${TETO_BLOQUEIO}%).`,
        nivel: 'error',
        setorDestino: ['PO', 'Comercial', 'Coordenador'],
      });
      return res.status(400).json({ error: `Terceirizados ultrapassariam ${TETO_BLOQUEIO}% do contrato (${novoPerc.toFixed(1)}%). Operação bloqueada.` });
    }

    if (req.user.perfil === 'Comercial') {
      const duplicado = await db.findOne('Terceirizados', (t) =>
        t.ID_Projeto === idProjetoFinal &&
        t.Fornecedor?.toLowerCase() === fornecedorFinal.toLowerCase() &&
        t.Status !== 'Cancelado'
      );
      if (duplicado) {
        return res.status(400).json({
          error: `Fornecedor "${fornecedorFinal}" já possui serviço ativo neste projeto.`,
        });
      }
    }

    const percTotal = valorGlobal > 0 ? ((total + valor) / valorGlobal) * 100 : 0;

    const terceirizado = {
      ID: uuidv4(),
      ID_Projeto: idProjetoFinal,
      Servico: servicoFinal,
      Descricao_Servico: servicoFinal,
      Fornecedor: fornecedorFinal,
      CNPJ_CPF: cnpjCpf || CNPJ_CPF || '',
      Nr_Contrato: Nr_Contrato || '',
      Valor_Estimado: String(valorEst),
      Valor_Contratado: String(valor),
      Valor_Pago: '0',
      Status: Status || 'Backlog',
      ID_Tarefa_ClickUp: idTarefaClickUp || '',
      ID_Medicao_Vinculada: '',
      Percentual_do_Total: percTotal.toFixed(2),
      Data_Entrega_Prevista: dataEntregaPrevista || Data_Vencimento || '',
      Data_Vencimento: dataEntregaPrevista || Data_Vencimento || '',
      Data_Entrega_Real: '',
      Observacao: observacao || Observacoes || '',
      Nr_NF: Nr_NF || '',
      Data_Pagamento: Data_Pagamento || '',
      Link_Contrato: Link_Contrato || '',
      Aprovado_Por: '',
      Criado_Em: new Date().toISOString(),
    };

    await db.insertRow('Terceirizados', terceirizado);

    // Emite aviso preventivo se >= 15%
    if (novoPerc >= TETO_AVISO && novoPerc < TETO_BLOQUEIO) {
      await createAlert({
        tipo: 'TETO_TERCEIROS_AVISO',
        idProjeto: idProjetoFinal,
        mensagem: `Aviso: terceirizados do projeto "${project.Nome}" agora em ${novoPerc.toFixed(1)}% (aviso: ${TETO_AVISO}%).`,
        nivel: 'warning',
        setorDestino: ['PO', 'Comercial'],
      });
    }

    res.status(201).json(terceirizado);
  } catch (err) {
    next(err);
  }
});

// PUT /api/terceirizados/:id — atualiza status ou dados
router.put('/:id', audit, async (req, res, next) => {
  try {
    const row = await db.findOne('Terceirizados', (r) => r.ID === req.params.id);
    if (!row) return res.status(404).json({ error: 'Terceirizado não encontrado.' });

    const WORKFLOW = [
      'Backlog', 'Autorizado', 'Em Negociação', 'Ordem de Compra',
      'Em Andamento', 'Análise Técnica', 'Aguardando Aprovação Externa',
      'Contas a Pagar', 'Concluído', 'Cancelado',
    ];

    const updated = { ...row, ...req.body, ID: row.ID, ID_Projeto: row.ID_Projeto };

    // Pagamento só após análise técnica aprovada
    if (updated.Status === 'Contas a Pagar' && row.Status !== 'Aguardando Aprovação Externa' && row.Status !== 'Análise Técnica') {
      if (!['PO', 'Coordenador', 'Admin'].includes(req.user.perfil)) {
        return res.status(400).json({ error: 'Pagamento só pode ser liberado após análise técnica aprovada.' });
      }
    }

    await db.updateRowById('Terceirizados', 'ID', req.params.id, updated);
    res.json(updated);
  } catch (err) {
    next(err);
  }
});

// DELETE /api/terceirizados/:id — cancela (soft delete)
router.delete('/:id', audit, async (req, res, next) => {
  try {
    const row = await db.findOne('Terceirizados', (r) => r.ID === req.params.id);
    if (!row) return res.status(404).json({ error: 'Terceirizado não encontrado.' });

    await db.updateRowById('Terceirizados', 'ID', req.params.id, { ...row, Status: 'Cancelado' });
    res.json({ message: 'Terceirizado cancelado.' });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
