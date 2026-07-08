const express = require('express');
const { v4: uuidv4 } = require('uuid');
const db = process.env.USE_POSTGRES === 'true' ? require('../services/postgresService') : require('../services/googleSheetsService');
const { authMiddleware } = require('../middleware/auth');
const { createAlert } = require('../services/alertService');

const router = express.Router();
router.use(authMiddleware);

// GET /api/medicoes/oc/:oc — busca medição pelo campo O.C. (chave OPP)
router.get('/oc/:oc', async (req, res, next) => {
  try {
    const medicao = await db.findOne('Medicoes', (m) => m.OC === req.params.oc);
    if (!medicao) return res.status(404).json({ error: 'Medição com este O.C. não encontrada.' });
    res.json(medicao);
  } catch (err) {
    next(err);
  }
});

// GET /api/medicoes?projeto=ID
router.get('/', async (req, res, next) => {
  try {
    const { projeto, status } = req.query;
    let rows = await db.readSheet('Medicoes');
    if (projeto) rows = rows.filter((r) => r.ID_Projeto === projeto);
    if (status) rows = rows.filter((r) => r.Status_Financeiro === status);

    // Enriquece com nome do projeto, cliente e setor
    const projects = await db.readSheet('Projetos_Contratos');
    const projMap = {};
    for (const p of projects) { projMap[p.ID_Projeto] = p; }

    const enriched = rows.map((m) => {
      const proj = projMap[m.ID_Projeto] || {};
      return {
        ...m,
        nomeProjeto: proj.Nome || m.nomeProjeto || '',
        cliente: proj.Cliente || proj.Nome_Cliente || '',
        setor: proj.Setor || '',
        atrasada: m.Status_Financeiro !== 'Recebido' && m.Data_Previsao && new Date(m.Data_Previsao) < new Date(),
      };
    });

    res.json(enriched);
  } catch (err) {
    next(err);
  }
});

// POST /api/medicoes — cria medição
router.post('/', async (req, res, next) => {
  try {
    const { idProjeto, etapa, percentual, valor, dataPrevisao, idTarefaClickUp, observacao } = req.body;

    if (!idProjeto || !etapa) {
      return res.status(400).json({ error: 'Projeto e etapa são obrigatórios.' });
    }

    const medicao = {
      ID_Medicao: uuidv4(),
      ID_Projeto: idProjeto,
      Etapa: etapa,
      Percentual: String(percentual || 0),
      Valor: String(valor || 0),
      Data_Previsao: dataPrevisao || '',
      Data_Realizacao: '',
      Status_Fisico: 'Pendente',
      Status_Financeiro: 'Pendente',
      ID_Tarefa_ClickUp: idTarefaClickUp || '',
      Nr_NF: '',
      Data_Emissao_NF: '',
      Data_Vencimento: '',
      Data_Recebimento: '',
      OC: req.body.oc || '',  // Ordem de Compra — chave de vínculo com OPP
      Nr_OS_OPP: req.body.nrOsOpp || '',
      Observacao: observacao || '',
    };

    await db.insertRow('Medicoes', medicao);
    res.status(201).json(medicao);
  } catch (err) {
    next(err);
  }
});

// PUT /api/medicoes/:id — atualiza medição (NF, datas, status)
router.put('/:id', async (req, res, next) => {
  try {
    const medicao = await db.findOne('Medicoes', (m) => m.ID_Medicao === req.params.id);
    if (!medicao) return res.status(404).json({ error: 'Medição não encontrada.' });

    const updated = { ...medicao, ...req.body, ID_Medicao: medicao.ID_Medicao };

    // Quando NF é emitida, registra data automática
    if (req.body.nrNF && !medicao.Nr_NF) {
      updated.Nr_NF = req.body.nrNF;
      updated.Data_Emissao_NF = req.body.dataEmissaoNF || new Date().toISOString().split('T')[0];
      updated.Status_Financeiro = 'Faturado';
    }

    // Quando recebimento é registrado
    if (req.body.dataRecebimento) {
      updated.Data_Recebimento = req.body.dataRecebimento;
      updated.Status_Financeiro = 'Recebido';

      // Cancela alertas relacionados a esta medição
      const alertas = await db.findRows('Alertas', (a) =>
        a.ID_Projeto === medicao.ID_Projeto &&
        a.Mensagem?.includes(medicao.Etapa) &&
        a.Status?.toLowerCase() === 'ativo'
      );
      for (const alerta of alertas) {
        await db.updateRowById('Alertas', 'ID', alerta.ID, { ...alerta, Status: 'resolvido' });
      }
    }

    await db.updateRowById('Medicoes', 'ID_Medicao', req.params.id, updated);
    res.json(updated);
  } catch (err) {
    next(err);
  }
});

// GET /api/medicoes/previsao/recebiveis — previsão de recebimentos por mês
router.get('/previsao/recebiveis', async (req, res, next) => {
  try {
    const medicoes = await db.readSheet('Medicoes');
    const projects = await db.readSheet('Projetos_Contratos');
    const projectMap = {};
    for (const p of projects) { projectMap[p.ID_Projeto] = p.Nome; }

    const pendentes = medicoes.filter((m) => m.Status_Financeiro !== 'Recebido' && m.Data_Previsao);

    // Agrupa por mês
    const porMes = {};
    for (const m of pendentes) {
      const mes = m.Data_Previsao.slice(0, 7); // YYYY-MM
      if (!porMes[mes]) porMes[mes] = { mes, valor: 0, medicoes: [] };
      porMes[mes].valor += parseFloat(m.Valor || 0);
      porMes[mes].medicoes.push({ ...m, nomeProjeto: projectMap[m.ID_Projeto] || '' });
    }

    const resultado = Object.values(porMes).sort((a, b) => a.mes.localeCompare(b.mes));
    res.json(resultado);
  } catch (err) {
    next(err);
  }
});

module.exports = router;
