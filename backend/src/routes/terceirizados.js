const express = require('express');
const { v4: uuidv4 } = require('uuid');
const db = process.env.USE_POSTGRES === 'true'
  ? require('../services/postgresService')
  : require('../services/googleSheetsService');
const { authMiddleware } = require('../middleware/auth');
const { createAlert } = require('../services/alertService');

const router = express.Router();
router.use(authMiddleware);

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

// GET /api/terceirizados?projeto=ID
router.get('/', async (req, res, next) => {
  try {
    const { projeto, idProjeto, status } = req.query;
    const filtroId = projeto || idProjeto;
    let rows = await db.readSheet('Terceirizados');
    if (filtroId) rows = rows.filter((r) => r.ID_Projeto === filtroId);
    if (status) rows = rows.filter((r) => r.Status === status);

    // Enriquece com nome do projeto e nome do fornecedor via OC
    const projetos = await db.readSheet('Projetos_Contratos');
    const ocs = await db.readSheet('OrdensCompra_OPP');
    const financeiro = await db.readSheet('Financeiro_OPP');
    const projMap = Object.fromEntries(projetos.map(p => [p.ID_Projeto, p]));
    const ocMap = Object.fromEntries(ocs.map(o => [String(o.ID_OC), o]));

    // Mapa OC -> valor já liquidado:
    // Fonte 1: Financeiro_OPP com OC preenchido e Situacao=Liquidado
    const liquidadoMap = {};
    for (const f of financeiro) {
      if (f.OC && (f.Situacao === 'Liquidado' || f.Situacao === 'Pago')) {
        const key = String(f.OC);
        liquidadoMap[key] = (liquidadoMap[key] || 0) + parseFloat(f.Valor || 0);
      }
    }
    // Fonte 2: OrdensCompra_OPP — quando a OC está liquidada/entregue, usa Valor_Total
    for (const oc of ocs) {
      const key = String(oc.ID_OC);
      if (!liquidadoMap[key]) {
        const sit = (oc.Situacao || '').toLowerCase();
        if (sit.includes('liquid') || sit.includes('pago') || sit.includes('entregue') ||
            sit.includes('conclu') || sit.includes('aprovado')) {
          liquidadoMap[key] = parseFloat(oc.Valor_Total || 0);
        }
      }
    }

    rows = rows.map(r => {
      const proj = projMap[r.ID_Projeto];
      const oc = r.OC ? ocMap[String(r.OC)] : null;
      // OPP tem prioridade quando há OC vinculada — fonte mais confiável
      const valorContratado = parseFloat(oc?.Valor_Total || r.Valor_Contratado || 0);
      const valorEstimado = parseFloat(r.Valor_Estimado || r.Valor_Contratado || oc?.Valor_Total || 0);
      const valorGlobal = parseFloat(proj?.Valor_Global || 0);
      const percCalc = valorGlobal > 0 && valorContratado > 0
        ? ((valorContratado / valorGlobal) * 100).toFixed(2)
        : (r.Percentual_Contrato || r.Percentual_do_Total || '0');
      // Fornecedor: OPP (quando tem OC) > manual > ClickUp responsável
      const fornecedor = (oc ? oc.Nome_Fornecedor : null) || r.Fornecedor || r.Responsavel || '';
      const valorLiquidado = r.OC ? (liquidadoMap[String(r.OC)] || 0) : 0;
      const saldo = valorContratado - valorLiquidado;
      return {
        ...r,
        nomeProjeto: proj?.Nome || r.ID_Projeto || '',
        Cliente: r.Cliente || proj?.Cliente || proj?.Nome_Cliente || '',
        Setor: proj?.Setor || r.Setor || '',
        Descricao_Servico: r.Descricao_Servico || r.Servico || '',
        Fornecedor: fornecedor,
        Valor_Contratado: String(valorContratado || ''),
        Valor_Liquidado: String(valorLiquidado),
        Saldo: String(saldo),
        Valor_Estimado: String(valorEstimado || ''),
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
router.post('/', async (req, res, next) => {
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
router.put('/:id', async (req, res, next) => {
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
router.delete('/:id', async (req, res, next) => {
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
