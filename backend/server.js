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

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', version: '1.0.0', timestamp: new Date().toISOString() });
});

// Diagnóstico público: mostra TODOS os campos de contas-pagar do OPP
// TEMPORÁRIO — remover após uso
app.get('/api/criar-leonardo', async (req, res) => {
  try {
    const bcrypt = require('bcryptjs');
    const { v4: uuidv4 } = require('uuid');
    const existe = await db.findOne('USER', u => (u.Email||'').toLowerCase() === 'arraiamidas@gmail.com');
    if (existe) return res.json({ ok: false, msg: 'Usuário já existe.' });
    const hash = await bcrypt.hash('teste1234', 12);
    await db.insertRow('USER', { ID: uuidv4(), Nome: 'Leonardo', Email: 'arraiamidas@gmail.com', Senha_Hash: hash, Perfil: 'Admin', Empresa: 'Jota Barros Projetos', Ativo: 'true', Criado_Em: new Date().toISOString(), Ultimo_Login: '' });
    res.json({ ok: true, msg: 'Usuário Leonardo criado!' });
  } catch(err) { res.status(500).json({ erro: err.message }); }
});

app.get('/api/diagnostico-opp', async (req, res) => {
  try {
    const { oppRequest } = require('./src/services/oppService');
    const ccId = req.query.ccId || '230748';
    const dataInicio = new Date(); dataInicio.setFullYear(dataInicio.getFullYear() - 2);
    const fmt = d => d.toISOString().split('T')[0];
    // Busca primeiros 100 com filtro de data
    const r = await oppRequest('GET', `/contas-pagar?limit=100&offset=0&data_inicio=${fmt(dataInicio)}&data_fim=${fmt(new Date())}`);
    const lista = Array.isArray(r) ? r : (r?.data || []);
    // Filtra pelo ccId no campo centro_custo (array)
    const filtrados = lista.filter(d => {
      const arr = Array.isArray(d.centro_custo) ? d.centro_custo : [];
      return arr.some(c => String(c.id_centro_custos || '') === ccId);
    });
    res.json({
      total_buscados: lista.length,
      total_filtrados_cc: filtrados.length,
      ccId_buscado: ccId,
      amostra_centro_custo_primeiro_registro: lista[0]?.centro_custo ?? 'campo ausente',
      campos_disponiveis: lista[0] ? Object.keys(lista[0]) : [],
      registros_encontrados: filtrados.slice(0, 3),
    });
  } catch (err) {
    res.status(500).json({ erro: err.message });
  }
});

// Exporta todos os centros de custo do OPP
app.get('/api/diagnostico-opp/centros-custo', async (req, res) => {
  try {
    const { oppRequest } = require('./src/services/oppService');
    const r = await oppRequest('GET', '/centros-custo?limit=500');
    const lista = Array.isArray(r) ? r : (r?.data || []);
    if (req.query.formato === 'csv') {
      const linhas = ['ID;Descrição;Status;Lixeira;Criado Em'];
      lista.forEach(c => linhas.push(`${c.id_centro_custos};"${c.desc_centro_custos}";${c.status_centro_custos};${c.lixeira};${c.data_cad_centro}`));
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', 'attachment; filename="centros-custo-opp.csv"');
      return res.send('﻿' + linhas.join('\n'));
    }
    res.json({ total: lista.length, data: lista });
  } catch (err) {
    res.status(500).json({ erro: err.message });
  }
});

// Exporta base completa de contas a pagar do OPP (pagina automaticamente)
app.get('/api/diagnostico-opp/contas-pagar', async (req, res) => {
  try {
    const { oppRequest } = require('./src/services/oppService');
    let offset = 0, todos = [];
    while (true) {
      const r = await oppRequest('GET', `/contas-pagar?limit=250&offset=${offset}&lixeira=Nao`);
      const lista = Array.isArray(r) ? r : (r?.data || []);
      if (lista.length === 0) break;
      todos.push(...lista);
      if (lista.length < 250) break;
      offset += 250;
      if (offset > 5000) break;
    }
    if (req.query.formato === 'csv') {
      const linhas = ['ID;Registro;Nome da Conta;Fornecedor;Vencimento;Valor;Valor Pago;Situação;Liquidado;Centro de Custo ID;Centro de Custo;Categoria;Data Emissão'];
      todos.forEach(d => linhas.push([
        d.id_conta_pag, d.id_registro,
        `"${(d.nome_conta||'').replace(/"/g,'')}"`,
        `"${(d.nome_fornecedor||'').replace(/"/g,'')}"`,
        d.vencimento_pag, d.valor_pag, d.valor_pago,
        `"${(d.situacao||'').replace(/"/g,'')}"`,
        d.liquidado_pag, d.id_centro_custos,
        `"${(d.centro_custos_pag||'').replace(/"/g,'')}"`,
        `"${(d.categoria_pag||'').replace(/"/g,'')}"`,
        d.data_emissao
      ].join(';')));
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', 'attachment; filename="contas-pagar-opp.csv"');
      return res.send('﻿' + linhas.join('\n'));
    }
    res.json({ total: todos.length, data: todos });
  } catch (err) {
    res.status(500).json({ erro: err.message });
  }
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
