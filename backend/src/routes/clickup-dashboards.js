const express = require('express');
const { authMiddleware } = require('../middleware/auth');

const router = express.Router();
router.use(authMiddleware);

const TEAM_ID = '36936702';

const PAINEIS = [
  { id: 'arq',      dashboardId: '1376zy-3053', nome: 'Arquitetura',    area: 'Arquitetura'    },
  { id: 'san',      dashboardId: '1376zy-3173', nome: 'Saneamento',     area: 'Saneamento'     },
  { id: 'inf',      dashboardId: '1376zy-3193', nome: 'Infraestrutura', area: 'Infraestrutura' },
];

async function fetchClickUp(path) {
  const token = process.env.CLICKUP_API_TOKEN;
  if (!token) throw new Error('CLICKUP_API_TOKEN não configurado');

  const res = await fetch(`https://api.clickup.com/api/v2${path}`, {
    headers: { Authorization: token, 'Content-Type': 'application/json' },
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`ClickUp API ${res.status}: ${text.slice(0, 200)}`);
  }
  return res.json();
}

// GET /api/clickup/dashboards — lista painéis com link e metadata
router.get('/', (req, res) => {
  const paineis = PAINEIS.map(p => ({
    ...p,
    url: `https://app.clickup.com/${TEAM_ID}/dashboards/${p.dashboardId}`,
  }));
  res.json({ paineis, teamId: TEAM_ID });
});

// GET /api/clickup/dashboards/:id/tarefas — tarefas recentes da área (via time entries)
router.get('/:id/tarefas', async (req, res, next) => {
  try {
    const painel = PAINEIS.find(p => p.id === req.params.id);
    if (!painel) return res.status(404).json({ error: 'Painel não encontrado' });

    // Busca time entries recentes do time (últimos 30 dias) filtradas por área
    const agora = Date.now();
    const trintaDiasAtras = agora - 30 * 24 * 60 * 60 * 1000;

    const data = await fetchClickUp(
      `/team/${TEAM_ID}/time_entries?start_date=${trintaDiasAtras}&end_date=${agora}&limit=100`
    );

    const entries = (data.data || []).filter(e => {
      const spaceName = e.task_location?.space_name || '';
      return spaceName.toLowerCase().includes(painel.area.toLowerCase());
    });

    const totalHoras = entries.reduce((s, e) => s + (parseInt(e.duration) || 0), 0) / 3600000;
    const porColaborador = {};
    for (const e of entries) {
      const nome = e.user?.username || e.user?.email || 'Desconhecido';
      if (!porColaborador[nome]) porColaborador[nome] = { nome, horas: 0, tarefas: 0 };
      porColaborador[nome].horas += (parseInt(e.duration) || 0) / 3600000;
      porColaborador[nome].tarefas += 1;
    }

    res.json({
      painel: { ...painel, url: `https://app.clickup.com/${TEAM_ID}/dashboards/${painel.dashboardId}` },
      totalHoras: +totalHoras.toFixed(1),
      totalEntries: entries.length,
      porColaborador: Object.values(porColaborador)
        .sort((a, b) => b.horas - a.horas)
        .map(c => ({ ...c, horas: +c.horas.toFixed(1) })),
    });
  } catch (err) {
    next(err);
  }
});

// GET /api/clickup/dashboards/:id/resumo — tarefas abertas/concluídas da área (via tasks)
router.get('/:id/resumo', async (req, res, next) => {
  try {
    const painel = PAINEIS.find(p => p.id === req.params.id);
    if (!painel) return res.status(404).json({ error: 'Painel não encontrado' });

    // Busca spaces do time para encontrar o espaço correspondente à área
    const spacesData = await fetchClickUp(`/team/${TEAM_ID}/space?archived=false`);
    const spaces = spacesData.spaces || [];
    const space = spaces.find(s =>
      s.name.toLowerCase().includes(painel.area.toLowerCase())
    );

    if (!space) {
      return res.json({
        painel: { ...painel, url: `https://app.clickup.com/${TEAM_ID}/dashboards/${painel.dashboardId}` },
        spaceEncontrado: false,
        mensagem: `Nenhum space encontrado para a área "${painel.area}"`,
        spaces: spaces.map(s => s.name),
      });
    }

    // Busca tasks do space (abertas)
    const [abertas, concluidas] = await Promise.all([
      fetchClickUp(`/space/${space.id}/task?status=open&page=0&limit=100`).catch(() => ({ tasks: [] })),
      fetchClickUp(`/space/${space.id}/task?status=closed&page=0&limit=100`).catch(() => ({ tasks: [] })),
    ]);

    const abertasCount = (abertas.tasks || []).length;
    const concluidasCount = (concluidas.tasks || []).length;
    const total = abertasCount + concluidasCount;

    // Tarefas em atraso
    const agora = Date.now();
    const atrasadas = (abertas.tasks || []).filter(t => t.due_date && parseInt(t.due_date) < agora);

    res.json({
      painel: { ...painel, url: `https://app.clickup.com/${TEAM_ID}/dashboards/${painel.dashboardId}` },
      space: { id: space.id, nome: space.name },
      spaceEncontrado: true,
      resumo: {
        abertas: abertasCount,
        concluidas: concluidasCount,
        total,
        atrasadas: atrasadas.length,
        percentualConcluido: total > 0 ? +((concluidasCount / total) * 100).toFixed(1) : 0,
      },
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
module.exports.PAINEIS = PAINEIS;
module.exports.TEAM_ID = TEAM_ID;
