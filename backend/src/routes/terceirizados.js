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
    const projMap = Object.fromEntries(projetos.map(p => [p.ID_Projeto, p]));
    const ocMap = Object.fromEntries(ocs.map(o => [String(o.ID_OC), o]));

    rows = rows.map(r => {
      const proj = projMap[r.ID_Projeto];
      const oc = r.OC ? ocMap[String(r.OC)] : null;
      return {
        ...r,
        nomeProjeto: proj?.Nome || r.ID_Projeto || '',
        Descricao_Servico: r.Descricao_Servico || r.Servico || '',
        Fornecedor: oc?.Nome_Fornecedor || r.Fornecedor || '',
        Valor_Contratado: oc?.Valor_Total || r.Valor_Contratado || '',
        Valor_Estimado: r.Valor_Estimado || r.Valor_Contratado || '',
        Percentual_Contrato: r.Percentual_Contrato || r.Percentual_do_Total || '0',
        Data_Vencimento: r.Data_Vencimento || r.Data_Entrega_Prevista || '',
        ID_Terceirizado: r.ID_Terceirizado || r.ID || '',
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
    const { idProjeto, servico, fornecedor, valorContratado, idTarefaClickUp, idMedicaoVinculada, dataEntregaPrevista, observacao } = req.body;

    if (!idProjeto || !servico || !fornecedor) {
      return res.status(400).json({ error: 'Projeto, serviço e fornecedor são obrigatórios.' });
    }

    const project = await db.findOne('Projetos_Contratos', (p) => p.ID_Projeto === idProjeto);
    if (!project) return res.status(404).json({ error: 'Projeto não encontrado.' });

    const valor = parseFloat(valorContratado || 0);
    const valorGlobal = parseFloat(project.Valor_Global || 0);

    // Verifica teto ANTES de inserir
    const { total, perc } = await calcPercTerceiros(idProjeto, valorGlobal);
    const novoPerc = valorGlobal > 0 ? ((total + valor) / valorGlobal) * 100 : 0;

    if (novoPerc > TETO_BLOQUEIO) {
      await createAlert({
        tipo: 'TETO_TERCEIROS_BLOQUEIO',
        idProjeto,
        mensagem: `Tentativa bloqueada: adicionar ${fornecedor} elevaria terceirizados para ${novoPerc.toFixed(1)}% (limite: ${TETO_BLOQUEIO}%).`,
        nivel: 'error',
        setorDestino: ['PO', 'Comercial', 'Coordenador'],
      });
      return res.status(400).json({ error: `Terceirizados ultrapassariam ${TETO_BLOQUEIO}% do contrato (${novoPerc.toFixed(1)}%). Operação bloqueada.` });
    }

    // Verifica se o Agente Comercial tenta contratar o mesmo fornecedor duas vezes
    if (req.user.perfil === 'Comercial') {
      const duplicado = await db.findOne('Terceirizados', (t) =>
        t.ID_Projeto === idProjeto &&
        t.Fornecedor?.toLowerCase() === fornecedor.toLowerCase() &&
        t.Status !== 'Cancelado'
      );
      if (duplicado) {
        return res.status(400).json({
          error: `Fornecedor "${fornecedor}" já possui serviço ativo neste projeto. Aprovação do PO e Coordenador é necessária para novo contrato com o mesmo fornecedor.`,
        });
      }
    }

    const percTotal = valorGlobal > 0 ? ((total + valor) / valorGlobal) * 100 : 0;

    const terceirizado = {
      ID: uuidv4(),
      ID_Projeto: idProjeto,
      Servico: servico,
      Fornecedor: fornecedor,
      Valor_Contratado: String(valor),
      Valor_Pago: '0',
      Status: 'Backlog',
      ID_Tarefa_ClickUp: idTarefaClickUp || '',
      ID_Medicao_Vinculada: idMedicaoVinculada || '',
      Percentual_do_Total: percTotal.toFixed(2),
      Data_Entrega_Prevista: dataEntregaPrevista || '',
      Data_Entrega_Real: '',
      Observacao: observacao || '',
      Aprovado_Por: '',
      Criado_Em: new Date().toISOString(),
    };

    await db.insertRow('Terceirizados', terceirizado);

    // Emite aviso preventivo se >= 15%
    if (novoPerc >= TETO_AVISO && novoPerc < TETO_BLOQUEIO) {
      await createAlert({
        tipo: 'TETO_TERCEIROS_AVISO',
        idProjeto,
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
