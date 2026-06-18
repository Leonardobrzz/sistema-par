const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { authMiddleware } = require('../middleware/auth');
const { processOpportuneCSV } = require('../services/csvService');
const db = process.env.USE_POSTGRES === 'true' ? require('../services/postgresService') : require('../services/googleSheetsService');

const router = express.Router();
router.use(authMiddleware);

// Configuração do multer para upload de CSV
const uploadsDir = path.join(__dirname, '../../uploads');
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });

const storage = multer.memoryStorage(); // mantém em memória, não salva disco desnecessariamente
const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
  fileFilter: (req, file, cb) => {
    const name = file.originalname.toLowerCase();
    const validMime = ['text/csv', 'application/vnd.ms-excel',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'];
    if (validMime.includes(file.mimetype) || name.endsWith('.csv') || name.endsWith('.xlsx') || name.endsWith('.xls')) {
      cb(null, true);
    } else {
      cb(new Error('Apenas arquivos CSV ou XLSX são aceitos.'));
    }
  },
});

// POST /api/opportune/import — importa CSV do Opportune
router.post('/import', upload.single('arquivo'), async (req, res, next) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'Nenhum arquivo enviado.' });
    }

    const resultado = await processOpportuneCSV(
      req.file.buffer,
      req.file.originalname,
      req.user.id,
      req.body.idProjeto || null,
      req.body.importarSemVinculo === 'true'
    );

    res.json({
      message: `Importação concluída. ${resultado.importados} registros processados.`,
      ...resultado,
    });
  } catch (err) {
    next(err);
  }
});

// GET /api/opportune/logs — histórico de importações
router.get('/logs', async (req, res, next) => {
  try {
    const logs = await db.readSheet('Log_Importacoes');
    const sorted = logs.sort((a, b) => new Date(b.Data_Upload) - new Date(a.Data_Upload));
    res.json(sorted);
  } catch (err) {
    next(err);
  }
});

// GET /api/opportune/custos?projeto=ID — custos importados do Opportune
router.get('/custos', async (req, res, next) => {
  try {
    const { projeto, tipo, dataInicio, dataFim } = req.query;
    let custos = await db.readSheet('Custos_OPP');

    if (projeto) custos = custos.filter((c) => c.ID_Projeto === projeto);
    if (tipo) custos = custos.filter((c) => c.Tipo === tipo);
    if (dataInicio) custos = custos.filter((c) => c.Data_Lancamento >= dataInicio);
    if (dataFim) custos = custos.filter((c) => c.Data_Lancamento <= dataFim);

    res.json(custos);
  } catch (err) {
    next(err);
  }
});

// GET /api/opportune/resumo/:idProjeto — resumo financeiro do projeto pelo Opportune
router.get('/resumo/:idProjeto', async (req, res, next) => {
  try {
    const custos = await db.findRows('Custos_OPP', (c) => c.ID_Projeto === req.params.idProjeto);

    const aPagar = custos.filter((c) => c.Tipo?.toLowerCase().includes('pagar'));
    const aReceber = custos.filter((c) => c.Tipo?.toLowerCase().includes('receber'));
    const realizado = custos.filter((c) => c.Tipo?.toLowerCase().includes('realizado') || c.Tipo?.toLowerCase().includes('pago'));

    res.json({
      totalAPagar: aPagar.reduce((s, c) => s + parseFloat(c.Valor_Lancado || 0), 0),
      totalAReceber: aReceber.reduce((s, c) => s + parseFloat(c.Valor_Lancado || 0), 0),
      totalRealizado: realizado.reduce((s, c) => s + parseFloat(c.Valor_Lancado || 0), 0),
      lancamentos: custos,
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
