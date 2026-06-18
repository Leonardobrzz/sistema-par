const express = require('express');
const db = process.env.USE_POSTGRES === 'true' ? require('../services/postgresService') : require('../services/googleSheetsService');
const { checkAllAlerts } = require('../services/alertService');
const { authMiddleware } = require('../middleware/auth');


const router = express.Router();
router.use(authMiddleware);

// GET /api/alertas — lista alertas para o usuário atual
router.get('/', async (req, res, next) => {
  try {
    const { status, nivel } = req.query;
    let alertas = await db.readSheet('Alertas');

    // Filtra por perfil do usuário
    const perfil = req.user.perfil;
    if (perfil !== 'Admin') {
      alertas = alertas.filter((a) => {
        const setores = a.Setor_Destino?.split(',') || [];
        return setores.some((s) => s.trim() === perfil || s.trim() === 'Todos');
      });
    }

    if (status) alertas = alertas.filter((a) => a.Status?.toLowerCase() === status.toLowerCase());
    else alertas = alertas.filter((a) => a.Status?.toLowerCase() === 'ativo');
    if (nivel) alertas = alertas.filter((a) => a.Nivel === nivel);

    // Enriquece com nome do projeto
    const projects = await db.readSheet('Projetos_Contratos');
    const map = {};
    for (const p of projects) { map[p.ID_Projeto] = p.Nome; }

    const enriched = alertas.map((a) => ({ ...a, nomeProjeto: map[a.ID_Projeto] || '' }));
    const sorted = enriched.sort((a, b) => new Date(b.Data_Geracao) - new Date(a.Data_Geracao));

    res.json(sorted);
  } catch (err) {
    next(err);
  }
});

// PUT /api/alertas/:id/visto — marca alerta como visto
router.put('/:id/visto', async (req, res, next) => {
  try {
    const alerta = await db.findOne('Alertas', (a) => a.ID === req.params.id);
    if (!alerta) return res.status(404).json({ error: 'Alerta não encontrado.' });

    const vistosPor = alerta.Visto_Por ? alerta.Visto_Por.split(',') : [];
    if (!vistosPor.includes(req.user.id)) vistosPor.push(req.user.id);

    await db.updateRowById('Alertas', 'ID', req.params.id, {
      ...alerta,
      Visto_Por: vistosPor.join(','),
    });

    res.json({ message: 'Alerta marcado como visto.' });
  } catch (err) {
    next(err);
  }
});

// PUT /api/alertas/:id/resolver — resolve alerta manualmente
router.put('/:id/resolver', async (req, res, next) => {
  try {
    const alerta = await db.findOne('Alertas', (a) => a.ID === req.params.id);
    if (!alerta) return res.status(404).json({ error: 'Alerta não encontrado.' });

    await db.updateRowById('Alertas', 'ID', req.params.id, { ...alerta, Status: 'resolvido' });
    res.json({ message: 'Alerta resolvido.' });
  } catch (err) {
    next(err);
  }
});

// GET /api/alertas/count — contagem de alertas não vistos por perfil
router.get('/count', async (req, res, next) => {
  try {
    const alertas = await db.readSheet('Alertas');
    const perfil = req.user.perfil;

    const relevantes = alertas.filter((a) => {
      if (a.Status?.toLowerCase() !== 'ativo') return false;
      if (perfil === 'Admin') return true;
      const setores = a.Setor_Destino?.split(',') || [];
      return setores.some((s) => s.trim() === perfil || s.trim() === 'Todos');
    });

    const naoVistos = relevantes.filter((a) => {
      const vistos = a.Visto_Por?.split(',') || [];
      return !vistos.includes(req.user.id);
    });

    res.json({ total: relevantes.length, naoVistos: naoVistos.length });
  } catch (err) {
    next(err);
  }
});

// POST /api/alertas/limpar — resolve todos ativos em lote e reprocessa (Admin only)
router.post('/limpar', async (req, res, next) => {
  try {
    if (req.user.perfil !== 'Admin') return res.status(403).json({ error: 'Apenas Admin pode executar limpeza.' });

    // 1 leitura + 1 escrita em lote para todos os alertas ativos (normaliza case)
    const resolvidos = await db.updateManyRowsWhere(
      'Alertas',
      a => a.Status === 'ativo' || a.Status === 'Ativo',
      { Status: 'Resolvido' }
    );

    // Reprocessa para criar apenas alertas válidos agora
    await checkAllAlerts();

    const novos = await db.findRows('Alertas', a => a.Status === 'ativo');
    res.json({ resolvidos, novosAlertas: novos.length });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
