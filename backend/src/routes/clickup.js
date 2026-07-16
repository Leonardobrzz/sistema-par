const express = require('express');
const crypto = require('crypto');
const axios = require('axios');
const db = process.env.USE_POSTGRES === 'true' ? require('../services/postgresService') : require('../services/googleSheetsService');
const { authMiddleware } = require('../middleware/auth');
const { processWebhookEvent } = require('../services/clickupService');

const router = express.Router();

// POST /api/clickup/webhook — recebe eventos do ClickUp (sem auth JWT, usa assinatura HMAC)
router.post('/webhook', async (req, res) => {
  try {
    const signature = req.headers['x-signature'];
    const secret = process.env.CLICKUP_WEBHOOK_SECRET;

    // Valida assinatura HMAC se o secret estiver configurado
    if (secret && signature) {
      const rawBody = JSON.stringify(req.body);
      const expected = crypto
        .createHmac('sha256', secret)
        .update(rawBody)
        .digest('hex');
      if (signature !== expected) {
        console.warn('[ClickUp Webhook] Assinatura inválida — evento descartado.');
        return res.status(200).json({ ok: false, reason: 'invalid_signature' });
      }
    }

    await processWebhookEvent(req.body);
    res.status(200).json({ ok: true });
  } catch (err) {
    console.error('[ClickUp Webhook]', err.message);
    res.status(200).json({ ok: false }); // sempre 200 para não gerar reenvio do ClickUp
  }
});

// Rotas abaixo exigem auth
router.use(authMiddleware);

// GET /api/clickup/spaces — lista os spaces configurados
router.get('/spaces', async (req, res, next) => {
  try {
    const { getSpaces } = require('../services/clickupService');
    const teamId = process.env.CLICKUP_TEAM_ID;
    if (!teamId) return res.status(400).json({ error: 'CLICKUP_TEAM_ID não configurado.' });
    const spaces = await getSpaces(teamId);
    res.json(spaces);
  } catch (err) {
    next(err);
  }
});

// POST /api/clickup/sync — força sincronização manual
router.post('/sync', async (req, res, next) => {
  try {
    const { syncClickUp, isSyncing } = require('../services/clickupService');
    const { checkAllAlerts } = require('../services/alertService');
    const { idProjeto } = req.body;

    const alreadySyncing = isSyncing();

    if (!alreadySyncing) {
      // Roda o sync ClickUp em background — pode demorar minutos com 689+ listas
      syncClickUp(idProjeto)
        .then(() => checkAllAlerts())
        .then(() => console.log('[Sync Manual] Concluído em background.'))
        .catch(err => console.error('[Sync Manual]', err.message));
    }

    // checkAllAlerts roda imediatamente (alertas PAR não dependem do sync ClickUp)
    await checkAllAlerts();

    res.json({
      message: alreadySyncing
        ? 'Alertas PAR atualizados. Sync ClickUp já em andamento — alertas de tarefas atualizam ao concluir.'
        : 'Alertas PAR atualizados. Sync ClickUp iniciado em background — alertas de tarefas chegam em breve via notificação.',
      timestamp: new Date().toISOString(),
      syncStarted: !alreadySyncing,
    });
  } catch (err) {
    next(err);
  }
});

// POST /api/clickup/sync-terceirizados — sync rápido só da pasta Terceirizados
router.post('/sync-terceirizados', async (req, res, next) => {
  try {
    const { syncTerceirizadosClickUp } = require('../services/clickupService');
    const total = await syncTerceirizadosClickUp();
    res.json({ message: `Sync concluído: ${total} tarefas processadas.`, total });
  } catch (err) {
    next(err);
  }
});

// POST /api/clickup/sync-horas/:idProjeto — sync rápido só das time entries de um projeto
router.post('/sync-horas/:idProjeto', async (req, res, next) => {
  try {
    const { getTimeEntries, getTimeEntriesByList, syncTimeEntries, syncHorasDoTimespent, getTasks } = require('../services/clickupService');
    const projeto = await db.findOne('Projetos_Contratos', (p) => p.ID_Projeto === req.params.idProjeto);
    if (!projeto) return res.status(404).json({ error: 'Projeto não encontrado' });

    // Se não tem ID_ClickUp, tenta extrair de Link_ClickUp (projeto ou planejamento)
    if (!projeto.ID_ClickUp) {
      let link = projeto.Link_ClickUp || '';
      // Fallback: busca no Dados_JSON do planejamento
      if (!link) {
        const plan = await db.findOne('Planejamentos', (p) => p.ID_Projeto === req.params.idProjeto);
        if (plan?.Dados_JSON) {
          try { link = JSON.parse(plan.Dados_JSON).linkClickUp || ''; } catch {}
        }
      }
      if (link) {
        const match = String(link).match(/\/li\/(\d+)/) ||
                      String(link).match(/\/v\/li\/(\d+)/) ||
                      String(link).match(/^(\d+)$/);
        if (match) {
          projeto.ID_ClickUp = match[1];
          console.log(`[sync-horas] ID_ClickUp extraído do link para ${projeto.Nome}: ${projeto.ID_ClickUp}`);
        }
      }
    }

    const teamId = process.env.CLICKUP_TEAM_ID;
    // Tenta buscar entries direto da lista (mais confiável); fallback por equipe
    let timeEntries = [];
    if (projeto.ID_ClickUp) {
      timeEntries = await getTimeEntriesByList(projeto.ID_ClickUp);
      console.log(`[sync-horas] entries da lista ${projeto.ID_ClickUp}: ${timeEntries.length}`);
    }
    if (timeEntries.length === 0) {
      timeEntries = await getTimeEntries(teamId);
      console.log(`[sync-horas] fallback equipe: ${timeEntries.length} entries`);
    }
    await syncTimeEntries(timeEntries, [projeto]);

    // Fallback: busca time_spent direto das tasks da lista (horas manuais)
    if (projeto.ID_ClickUp) {
      const tasks = await getTasks(projeto.ID_ClickUp);
      await syncHorasDoTimespent(tasks, projeto);
      console.log(`[sync-horas] Fallback time_spent: ${tasks.length} tasks da lista ${projeto.ID_ClickUp}`);
    }

    const logs = await db.findRows('Log_Horas', (l) => l.ID_Projeto === req.params.idProjeto);
    const total = logs.reduce((s, l) => s + parseFloat(l.Horas_Logadas || 0), 0);
    res.json({ ok: true, idClickUp: projeto.ID_ClickUp || null, totalEntries: logs.length, totalHoras: parseFloat(total.toFixed(2)) });
  } catch (err) {
    next(err);
  }
});

// GET /api/clickup/horas/:idProjeto — horas estimadas vs logadas por projeto
router.get('/horas/:idProjeto', async (req, res, next) => {
  try {
    const logs = await db.findRows('Log_Horas', (l) => l.ID_Projeto === req.params.idProjeto);
    const plan = await db.findOne('Planejamentos', (p) => p.ID_Projeto === req.params.idProjeto);

    let horasEstimadasTotal = 0;
    if (plan?.Dados_JSON) {
      try {
        const dados = JSON.parse(plan.Dados_JSON);
        horasEstimadasTotal = (dados.equipe || []).reduce((s, e) => s + parseFloat(e.horas || 0), 0);
      } catch {}
    }

    const horasLogadas = logs.reduce((s, l) => s + parseFloat(l.Horas_Logadas || 0), 0);

    // Por colaborador
    const porColaborador = {};
    for (const l of logs) {
      const nome = l.Colaborador || 'Desconhecido';
      if (!porColaborador[nome]) porColaborador[nome] = { nome, horasLogadas: 0, horasEstimadas: 0 };
      porColaborador[nome].horasLogadas += parseFloat(l.Horas_Logadas || 0);
    }

    res.json({
      horasEstimadasTotal: horasEstimadasTotal.toFixed(2),
      horasLogadas: horasLogadas.toFixed(2),
      desvioHoras: (horasLogadas - horasEstimadasTotal).toFixed(2),
      porColaborador: Object.values(porColaborador),
    });
  } catch (err) {
    next(err);
  }
});

// GET /api/clickup/lista-info?url=https://app.clickup.com/...
// Retorna nome, cliente, setor e data de entrega de uma lista do ClickUp pelo link ou ID
router.get('/lista-info', async (req, res, next) => {
  try {
    const { url } = req.query;
    if (!url) return res.status(400).json({ error: 'url obrigatória' });

    // Extrai o list ID da URL ou usa direto se for só número
    const match = url.match(/\/li\/(\d+)/) || url.match(/\/v\/li\/(\d+)/) || url.match(/^(\d+)$/);
    if (!match) return res.status(400).json({ error: 'Não foi possível extrair o ID da lista do link informado' });

    const listId = match[1];
    const TOKEN = process.env.CLICKUP_API_TOKEN;

    const r = await axios.get(`https://api.clickup.com/api/v2/list/${listId}`, {
      headers: { Authorization: TOKEN },
      timeout: 8000,
    });

    const list = r.data;
    const nomeProjeto = list.name || '';
    const cliente = list.folder?.name || '';
    const dueDateRaw = list.due_date ? new Date(parseInt(list.due_date)).toISOString().split('T')[0] : '';

    // Detecta setor pelo prefixo do nome
    const n = nomeProjeto.toUpperCase();
    const setor = n.startsWith('ARQ') ? 'Arquitetura'
      : n.startsWith('SAN') ? 'Saneamento'
      : n.startsWith('INF') ? 'Infraestrutura'
      : n.startsWith('ADM') ? 'Administrativo'
      : '';

    res.json({ listId, nomeProjeto, cliente, setor, dataEntregaContrato: dueDateRaw });
  } catch (err) {
    if (err.response?.status === 404) return res.status(404).json({ error: 'Lista não encontrada no ClickUp' });
    next(err);
  }
});

module.exports = router;
