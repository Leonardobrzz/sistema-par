const express = require('express');
const { v4: uuidv4 } = require('uuid');
const db = process.env.USE_POSTGRES === 'true' ? require('../services/postgresService') : require('../services/googleSheetsService');
const { authMiddleware } = require('../middleware/auth');

const router = express.Router();
router.use(authMiddleware);

// GET /api/projetos — lista todos os projetos com filtros
router.get('/', async (req, res, next) => {
  try {
    const { status, setor, cliente, busca } = req.query;
    let projects = (await db.readSheet('Projetos_Contratos')).filter((p) => /^(ARQ|INF|SAN)-\d{4}-/i.test(p.Nome || '') && p.Status !== 'Concluído' && p.Status !== 'Arquivado');

    if (status) {
      const statusArr = status.split(',');
      projects = projects.filter((p) => statusArr.some((s) => p.Status?.includes(s)));
    }
    if (setor) projects = projects.filter((p) => (p.Setor || '').trim().toLowerCase() === setor.trim().toLowerCase());
    if (cliente) projects = projects.filter((p) => p.Cliente?.toLowerCase().includes(cliente.toLowerCase()));
    if (busca) {
      const q = busca.toLowerCase().trim();
      projects = projects.filter((p) =>
        p.Nome?.toLowerCase().includes(q) ||
        p.Cliente?.toLowerCase().includes(q) ||
        p.Centro_Custo_OPP?.toLowerCase().includes(q)
      );
    }

    // Enriquece com dados de planejamento
    const planejamentos = await db.readSheet('Planejamentos');
    const medicoes = await db.readSheet('Medicoes');
    const terceirizados = await db.readSheet('Terceirizados');
    const logHoras = await db.readSheet('Log_Horas');
    const alertasAtivos = await db.readSheet('Alertas');

    const enriched = projects.map((p) => {
      const plan = planejamentos.find((pl) => pl.ID_Projeto === p.ID_Projeto);
      const meds = medicoes.filter((m) => m.ID_Projeto === p.ID_Projeto);
      const tercs = terceirizados.filter((t) => t.ID_Projeto === p.ID_Projeto && t.Status !== 'Cancelado');
      const horas = logHoras.filter((l) => l.ID_Projeto === p.ID_Projeto);

      const valorGlobal = parseFloat(p.Valor_Global || 0);
      const totalTerceiros = tercs.reduce((s, t) => s + parseFloat(t.Valor_Contratado || 0), 0);
      const percTerceiros = valorGlobal > 0 ? (totalTerceiros / valorGlobal) * 100 : 0;

      const medicoesConcluidas = meds.filter((m) => m.Status_Financeiro === 'Recebido').length;
      const totalMedicoes = meds.length;

      const horasLogadas = horas.reduce((s, l) => s + parseFloat(l.Horas_Logadas || 0), 0);
      const horasEstimadas = plan ? (horas.reduce((s, l) => s + parseFloat(l.Horas_Estimadas || 0), 0)) : 0;

      const alertasProj = alertasAtivos.filter(
        (a) => a.ID_Projeto === p.ID_Projeto && a.Status?.toLowerCase() === 'ativo'
      );
      const temSemResponsavel = alertasProj.some((a) => a.Tipo_Alerta === 'SEM_RESPONSAVEL');
      const temAtrasada = alertasProj.some((a) => a.Tipo_Alerta === 'TAREFA_ATRASADA');
      const temVenceAmanha = alertasProj.some((a) => a.Tipo_Alerta === 'VENCE_AMANHA');
      const totalAlertas = alertasProj.length;

      const setorNorm = (() => {
        const s = (p.Setor || p.Nome || '').toUpperCase()
        if (/SAN/.test(p.Nome || '') || /SANEAMENTO/.test(s)) return 'Saneamento'
        if (/ARQ/.test(p.Nome || '') || /ARQUITETURA/.test(s)) return 'Arquitetura'
        if (/INF/.test(p.Nome || '') || /INFRAESTRUTURA/.test(s)) return 'Infraestrutura'
        return p.Setor || ''
      })()

      const valorPlanejamento = parseFloat(plan?.Valor_Contrato || 0);
      const valorExibido = valorPlanejamento > 0 ? valorPlanejamento : parseFloat(p.Valor_Global || 0);

      return {
        ...p,
        Valor_Global: String(valorExibido),
        Setor: setorNorm,
        temPlanejamento: !!plan,
        statusPlanejamento: plan?.Status || null,
        percTerceiros: percTerceiros.toFixed(1),
        medicoesConcluidas,
        totalMedicoes,
        horasLogadas: parseFloat(horasLogadas.toFixed(1)),
        horasEstimadas: parseFloat(horasEstimadas.toFixed(1)),
        temSemResponsavel,
        temAtrasada,
        temVenceAmanha,
        totalAlertas,
      };
    });

    const limit = req.query.limit ? parseInt(req.query.limit) : null;
    const limited = limit ? enriched.slice(0, limit) : enriched;

    res.json({ projetos: limited, total: enriched.length });
  } catch (err) {
    next(err);
  }
});

// GET /api/projetos/stats/dashboard — KPIs para o dashboard
router.get('/stats/dashboard', async (req, res, next) => {
  try {
    const allProjects = await db.readSheet('Projetos_Contratos');
    // Apenas projetos do espaço PROJETOS 2025 (prefixo ARQ, INF ou SAN no nome)
    const projects = allProjects.filter((p) => /^(ARQ|INF|SAN)[-_]/i.test(p.Nome || '') && p.Status !== 'Concluído' && p.Status !== 'Arquivado');
    const alertas = await db.findRows('Alertas', (a) => a.Status?.toLowerCase() === 'ativo');
    const medicoes = await db.readSheet('Medicoes');

    const stats = {
      total: projects.length,
      emAndamento: projects.filter((p) => p.Status?.includes('Em Andamento') || p.Status === 'Backlog').length,
      aguardando: projects.filter((p) => p.Status === 'Aguardando').length,
      paralisado: projects.filter((p) => p.Status === 'Paralisado').length,
      concluido: projects.filter((p) => p.Status === 'Concluído').length,
      aPlanejar: projects.filter((p) => p.Status === 'A Planejar').length,
      alertasAtivos: alertas.length,
      alertasErro: alertas.filter((a) => a.Nivel === 'error').length,
      medicoesPendentes: medicoes.filter((m) => m.Status_Financeiro === 'Pendente').length,
      medicoesAtrasadas: medicoes.filter((m) => {
        if (!m.Data_Previsao || m.Status_Financeiro === 'Recebido') return false;
        return new Date(m.Data_Previsao) < new Date();
      }).length,
    };

    res.json(stats);
  } catch (err) {
    next(err);
  }
});

// GET /api/projetos/:id — detalhe de um projeto
router.get('/:id', async (req, res, next) => {
  try {
    const project = await db.findOne('Projetos_Contratos', (p) => p.ID_Projeto === req.params.id);
    if (!project) return res.status(404).json({ error: 'Projeto não encontrado.' });

    const medicoes = await db.findRows('Medicoes', (m) => m.ID_Projeto === project.ID_Projeto);
    const terceirizados = await db.findRows('Terceirizados', (t) => t.ID_Projeto === project.ID_Projeto);
    const planejamento = await db.findOne('Planejamentos', (p) => p.ID_Projeto === project.ID_Projeto);
    const alertas = await db.findRows('Alertas', (a) => a.ID_Projeto === project.ID_Projeto && a.Status?.toLowerCase() === 'ativo');

    // Horas logadas
    const logHoras = await db.findRows('Log_Horas', (l) => l.ID_Projeto === project.ID_Projeto);
    const totalHorasLogadas = logHoras.reduce((s, l) => s + parseFloat(l.Horas_Logadas || 0), 0);

    // Custos reais (Opportune)
    const custosOPP = await db.findRows('Custos_OPP', (c) => c.ID_Projeto === project.ID_Projeto);
    const totalCustosReais = custosOPP
      .filter((c) => c.Tipo?.toLowerCase().includes('pago') || c.Tipo?.toLowerCase().includes('realizado'))
      .reduce((s, c) => s + parseFloat(c.Valor_Lancado || 0), 0);

    res.json({
      ...project,
      medicoes,
      terceirizados,
      planejamento,
      alertas,
      totalHorasLogadas: totalHorasLogadas.toFixed(2),
      totalCustosReais: totalCustosReais.toFixed(2),
    });
  } catch (err) {
    next(err);
  }
});

// POST /api/projetos — cria novo projeto
router.post('/', async (req, res, next) => {
  try {
    const { nome, cliente, valorGlobal, centroCusto, idClickUp, setor, tipologia, empresa, dataInicio, dataEntregaContrato, dataEntregaPlanejada, linkClickUp } = req.body;

    if (!nome || !cliente) {
      return res.status(400).json({ error: 'Nome e cliente são obrigatórios.' });
    }

    const valor = parseFloat(valorGlobal || 0);
    const tetoPerc = parseFloat(process.env.TETO_TERCEIROS_BLOQUEIO || '20');

    const project = {
      ID_Projeto: uuidv4(),
      Nome: nome,
      Cliente: cliente,
      Valor_Global: String(valor),
      Teto_Terc_Perc: String(tetoPerc),
      Teto_Terc_Valor: String(valor * tetoPerc / 100),
      ID_ClickUp: idClickUp || '',
      Centro_Custo_OPP: centroCusto || '',
      Status: 'A Planejar',
      Data_Inicio: dataInicio || '',
      Data_Entrega_Contrato: dataEntregaContrato || '',
      Data_Entrega_Planejada: dataEntregaPlanejada || '',
      Empresa: empresa || req.user.empresa || '',
      Setor: setor || '',
      Tipologia: tipologia || '',
      Link_ClickUp: linkClickUp || '',
      Criado_Em: new Date().toISOString(),
      Atualizado_Em: new Date().toISOString(),
    };

    await db.insertRow('Projetos_Contratos', project);
    res.status(201).json(project);
  } catch (err) {
    next(err);
  }
});

// PUT /api/projetos/:id — atualiza projeto
router.put('/:id', async (req, res, next) => {
  try {
    const project = await db.findOne('Projetos_Contratos', (p) => p.ID_Projeto === req.params.id);
    if (!project) return res.status(404).json({ error: 'Projeto não encontrado.' });

    const updated = {
      ...project,
      ...req.body,
      ID_Projeto: project.ID_Projeto,
      Atualizado_Em: new Date().toISOString(),
    };

    await db.updateRowById('Projetos_Contratos', 'ID_Projeto', req.params.id, updated);
    res.json(updated);
  } catch (err) {
    next(err);
  }
});



module.exports = router;
