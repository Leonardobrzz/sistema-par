require('dotenv').config();
const express = require('express');
const cors = require('cors');
const http = require('http');
const cron = require('node-cron');
const path = require('path');

const { initWebSocket } = require('./src/services/websocketService');
const { syncClickUp } = require('./src/services/clickupService');
const { checkAllAlerts } = require('./src/services/alertService');
const errorHandler = require('./src/middleware/errorHandler');

// Rotas
const authRoutes = require('./src/routes/auth');
const projectsRoutes = require('./src/routes/projects');
const planejamentoRoutes = require('./src/routes/planejamento');
const terceirizadosRoutes = require('./src/routes/terceirizados');
const medicoesRoutes = require('./src/routes/medicoes');
const clickupRoutes = require('./src/routes/clickup');
const opportuneRoutes = require('./src/routes/opportune');
const oppRoutes = require('./src/routes/opp');
const alertasRoutes = require('./src/routes/alertas');
const relatoriosRoutes = require('./src/routes/relatorios');
const relatorioFinalRoutes = require('./src/routes/relatorio-final');
const clickupDashboardsRoutes = require('./src/routes/clickup-dashboards');
const checklistRoutes = require('./src/routes/checklist');
const extratoRoutes = require('./src/routes/extrato');

const app = express();
const server = http.createServer(app);

// ── Middlewares globais ──────────────────────────────────────────────────────
app.use(cors({
  origin: (origin, cb) => cb(null, true),
  credentials: true,
}));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Pasta de uploads temporários
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// ── Rotas da API ─────────────────────────────────────────────────────────────
app.use('/api/auth', authRoutes);
app.use('/api/projetos', projectsRoutes);
app.use('/api/planejamento', planejamentoRoutes);
app.use('/api/terceirizados', terceirizadosRoutes);
app.use('/api/medicoes', medicoesRoutes);
app.use('/api/clickup/dashboards', clickupDashboardsRoutes); // antes de /api/clickup
app.use('/api/clickup', clickupRoutes);
app.use('/api/opportune', opportuneRoutes);
app.use('/api/opp', oppRoutes);
app.use('/api/alertas', alertasRoutes);
app.use('/api/relatorios', relatoriosRoutes);
app.use('/api/relatorio-final', relatorioFinalRoutes);
app.use('/api/checklist', checklistRoutes);
app.use('/api/extrato', extratoRoutes);

// Debug público: inspeciona custom_fields das tarefas de Terceirizados no ClickUp
app.get('/api/debug-clickup-campos', async (req, res) => {
  try {
    const axios = require('axios');
    const TOKEN = process.env.CLICKUP_API_TOKEN;
    const teamId = process.env.CLICKUP_TEAM_ID;
    const headers = { Authorization: TOKEN };
    // Busca espaços do time
    const spacesRes = await axios.get(`https://api.clickup.com/api/v2/team/${teamId}/space`, { headers });
    const spaces = spacesRes.data.spaces || [];
    const norm = s => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
    const gestao = spaces.find(s => norm(s.name) === 'gestao') || spaces.find(s => norm(s.name).includes('gestao') && !norm(s.name).includes('demanda')) || spaces[0];
    // Busca pastas do espaço
    const foldersRes = await axios.get(`https://api.clickup.com/api/v2/space/${gestao.id}/folder`, { headers });
    const folders = foldersRes.data.folders || [];
    const tercFolder = folders.find(f => f.name?.toLowerCase().includes('terceiriz'));
    if (!tercFolder) return res.json({ espacos: spaces.map(s=>s.name), pastas: folders.map(f=>f.name), erro: 'Pasta Terceirizados não encontrada' });
    // Busca listas da pasta
    const listsRes = await axios.get(`https://api.clickup.com/api/v2/folder/${tercFolder.id}/list`, { headers });
    const lists = listsRes.data.lists || [];
    const list = lists[0];
    if (!list) return res.json({ pastas: folders.map(f=>f.name), listas: [], erro: 'Sem listas' });
    // Busca tarefas com custom_fields
    const tasksRes = await axios.get(`https://api.clickup.com/api/v2/list/${list.id}/task?include_closed=true&custom_fields=true&limit=3`, { headers });
    const tasks = tasksRes.data.tasks || [];
    const amostra = tasks.map(t => ({
      name: t.name,
      custom_fields: (t.custom_fields || []).map(f => ({ name: f.name, type: f.type, value: f.value }))
    }));
    res.json({ espaco: gestao.name, pasta: tercFolder.name, lista: list.name, totalTasks: tasks.length, amostra });
  } catch (err) { res.status(500).json({ erro: err.message }); }
});

// Debug público: inspeciona OSs do OPP
app.get('/api/debug-os-opp', async (req, res) => {
  try {
    const opp = require('./src/services/oppService');
    const data = await opp.oppRequest('GET', '/ordens-servico?limit=5');
    res.json({ amostra: data });
  } catch (err) { res.status(500).json({ erro: err.message, stack: err.stack }); }
});

// Debug público: diagnóstico valor planejamento via OC
app.get('/api/debug-valor-oc', async (req, res) => {
  try {
    const db = process.env.USE_POSTGRES === 'true'
      ? require('./src/services/postgresService')
      : require('./src/services/googleSheetsService');
    const [terceirizados, ocs] = await Promise.all([
      db.readSheet('Terceirizados'),
      db.readSheet('OrdensCompra_OPP'),
    ]);
    const ocValorMap = {};
    for (const oc of ocs) {
      if ((oc.Situacao || '').toLowerCase() !== 'cancelado') {
        ocValorMap[String(oc.ID_OC)] = parseFloat(oc.Valor_Total || 0);
      }
    }
    const tercComOC = terceirizados.filter(t => t.OC && t.ID_Projeto);
    const valorOCPorProjeto = {};
    for (const t of tercComOC) {
      const val = ocValorMap[String(t.OC)];
      if (val > 0) valorOCPorProjeto[t.ID_Projeto] = (valorOCPorProjeto[t.ID_Projeto] || 0) + val;
    }
    res.json({
      totalOCs: ocs.length,
      totalTerceirizados: terceirizados.length,
      tercComOC: tercComOC.length,
      amostrasOC: ocs.slice(0, 5).map(o => ({ ID_OC: o.ID_OC, Valor_Total: o.Valor_Total, Situacao: o.Situacao })),
      amostrasTercOC: tercComOC.slice(0, 10).map(t => ({ ID_Projeto: t.ID_Projeto, OC: t.OC, valEncontrado: ocValorMap[String(t.OC)] })),
      projetosComValor: Object.keys(valorOCPorProjeto).length,
      amostraProjetosValor: Object.entries(valorOCPorProjeto).slice(0, 5),
    });
  } catch (err) { res.status(500).json({ erro: err.message }); }
});

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', version: '1.0.0', timestamp: new Date().toISOString() });
});

// ── WebSocket ─────────────────────────────────────────────────────────────────
initWebSocket(server);

// ── Sincronização automática com ClickUp ──────────────────────────────────────
const syncInterval = parseInt(process.env.SYNC_INTERVAL_MINUTES || '15');
cron.schedule(`*/${syncInterval} * * * *`, async () => {
  try {
    console.log(`[CRON] Iniciando sync com ClickUp — ${new Date().toLocaleString('pt-BR')}`);
    await syncClickUp();
    await checkAllAlerts();
    console.log('[CRON] Sync concluído.');
  } catch (err) {
    console.error('[CRON] Erro na sincronização:', err.message);
  }
});

// Sync automático OPP a cada 2 horas
const { syncReceitasDespesas, syncOrdensCompra } = require('./src/services/oppService');
const db = process.env.USE_POSTGRES === 'true'
  ? require('./src/services/postgresService')
  : require('./src/services/googleSheetsService');

// Inicializa banco de dados
db.initialize().then(() => {
  return db.ensureSheetsExist();
}).then(() => {
  const nome = process.env.USE_POSTGRES === 'true' ? 'PostgreSQL' : 'Google Sheets';
  console.log(`[Startup] Banco (${nome}) verificado/conectado.`);
}).catch(err => {
  console.error('[Startup] Erro ao inicializar banco:', err.message);
});

cron.schedule('0 */2 * * *', async () => {
  try {
    console.log(`[CRON] Iniciando sync OPP — ${new Date().toLocaleString('pt-BR')}`);
    const [result] = await Promise.all([
      syncReceitasDespesas(db),
      syncOrdensCompra(db),
    ]);
    console.log(`[CRON] Sync OPP concluído: ${result.totalReceitas} receitas, ${result.totalDespesas} despesas, ${result.medicoesReconciliadas} medições.`);
  } catch (err) {
    console.error('[CRON] Erro no sync OPP:', err.message);
  }
});

// Verificação diária de alertas às 08h
cron.schedule('0 8 * * 1-5', async () => {
  try {
    console.log('[CRON] Verificação diária de alertas...');
    await checkAllAlerts();
  } catch (err) {
    console.error('[CRON] Erro na verificação de alertas:', err.message);
  }
});

// ── Serve frontend (build de produção) ───────────────────────────────────────
const frontendDist = path.join(__dirname, '../frontend/dist');
if (require('fs').existsSync(frontendDist)) {
  app.use(express.static(frontendDist));
  app.get('*', (req, res) => {
    if (!req.path.startsWith('/api')) {
      res.sendFile(path.join(frontendDist, 'index.html'));
    }
  });
}

// ── Tratamento de erros ───────────────────────────────────────────────────────
app.use(errorHandler);

// ── Inicialização ─────────────────────────────────────────────────────────────
const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
  console.log(`
  ╔══════════════════════════════════════════════════════╗
  ║   Sistema PAR — Cérebro Central de Gestão            ║
  ║   Jota Barros Projetos | Engenharia & Arquitetura    ║
  ╠══════════════════════════════════════════════════════╣
  ║   Backend rodando em: http://localhost:${PORT}          ║
  ║   Ambiente: ${process.env.NODE_ENV || 'development'}                         ║
  ╚══════════════════════════════════════════════════════╝
  `);
  console.log('[Startup] Servidor pronto. Use "Sync ClickUp" no dashboard ou aguarde o cron automático.');
});
