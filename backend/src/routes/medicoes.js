const express = require('express');
const { v4: uuidv4 } = require('uuid');
const db = process.env.USE_POSTGRES === 'true' ? require('../services/postgresService') : require('../services/googleSheetsService');
const { authMiddleware } = require('../middleware/auth');
const { createAlert } = require('../services/alertService');
const { auditMiddleware } = require('../middleware/audit');

const router = express.Router();
router.use(authMiddleware);
const audit = auditMiddleware('Medicoes');

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

    // Busca receitas do OPP via API (todos os registros, sem limite de 12 meses)
    async function fetchReceitasOPP() {
      try {
        const { oppRequest } = require('../services/oppService');
        let offset = 0, todos = [];
        while (true) {
          const r = await oppRequest('GET', `/contas-receber?limit=250&offset=${offset}&lixeira=Nao`);
          const lista = Array.isArray(r) ? r : (r?.data || []);
          if (lista.length === 0) break;
          todos.push(...lista);
          if (lista.length < 250) break;
          offset += 250;
          if (offset > 10000) break;
        }
        return todos;
      } catch { return []; }
    }

    // Carrega projetos, planejamentos e receitas OPP em paralelo
    const [projects, planejamentos, receitasOPP, ordensServicoOPP] = await Promise.all([
      db.readSheet('Projetos_Contratos'),
      db.readSheet('Planejamentos'),
      fetchReceitasOPP(),
      db.readSheet('OrdensServico_OPP').catch(() => []),
    ]);
    const projMap = {};
    for (const p of projects) { projMap[p.ID_Projeto] = p; }
    // Mapa de planejamento por projeto (Nr_Contrato_OS fica aqui, não em Projetos_Contratos)
    const planMap = {};
    const planNomeMap = {};
    for (const pl of planejamentos) {
      if (!pl.ID_Projeto) continue;
      if (!planMap[pl.ID_Projeto]) planMap[pl.ID_Projeto] = pl;
      if (pl.Nome_Projeto) planNomeMap[pl.ID_Projeto] = pl.Nome_Projeto;
    }

    const pBR = (v) => parseFloat(String(v || 0).replace(/\./g, '').replace(',', '.')) || 0;

    // Mapa por id_centro_custos (fonte principal e confiável — mesmo vínculo
    // usado no Baseline x Real) e por texto de descrição (reserva, método
    // antigo) → totalRecebido / NF
    const recebidoPorCCId = {};
    const nfPorCCId = {};
    const recebidoPorCC = {};
    const nfPorCC = {};
    for (const r of receitasOPP) {
      if (r.liquidado_rec !== 'Sim') continue;
      const v = parseFloat(r.valor_rec || 0);

      const ccIdNum = String(r.id_centro_custos || '');
      if (ccIdNum && ccIdNum !== '0') {
        recebidoPorCCId[ccIdNum] = (recebidoPorCCId[ccIdNum] || 0) + v;
        if (!nfPorCCId[ccIdNum] && r.n_documento_rec) nfPorCCId[ccIdNum] = r.n_documento_rec;
      }

      const cc = (r.centro_custos_rec || r.centro_custo || '').toLowerCase().trim();
      if (!cc) continue;
      recebidoPorCC[cc] = (recebidoPorCC[cc] || 0) + v;
      if (!nfPorCC[cc] && r.n_documento_rec) nfPorCC[cc] = r.n_documento_rec;
    }

    // Total recebido do OPP por projeto. Prioridade: centro de custo
    // confirmado (ID_Centro_Custo_OPP, revisado manualmente contra o cadastro
    // real do OPP). Só cai pro casamento por texto (Nr_Contrato_OS) pros
    // projetos que ainda não têm esse vínculo confirmado.
    const totalRecebidoPorProjeto = {};
    const nfPorProjeto = {};
    for (const plan of planejamentos) {
      if (!plan.ID_Projeto) continue;

      if (plan.ID_Centro_Custo_OPP) {
        const ccIdNum = String(plan.ID_Centro_Custo_OPP);
        totalRecebidoPorProjeto[plan.ID_Projeto] = recebidoPorCCId[ccIdNum] || 0;
        if (nfPorCCId[ccIdNum]) nfPorProjeto[plan.ID_Projeto] = nfPorCCId[ccIdNum];
        continue;
      }

      const cc = (plan.Nr_Contrato_OS || '').trim().toLowerCase();
      if (!cc) continue;
      let total = recebidoPorCC[cc] || 0;
      if (!total) {
        // fuzzy match
        for (const [k, v] of Object.entries(recebidoPorCC)) {
          if (cc.includes(k) || k.includes(cc)) { total = v; break; }
        }
      }
      totalRecebidoPorProjeto[plan.ID_Projeto] = total;
      if (nfPorCC[cc]) nfPorProjeto[plan.ID_Projeto] = nfPorCC[cc];
    }

    // Agrupa medições por projeto para aplicar lógica de cobertura acumulada
    const medsPorProjeto = {};
    for (const m of rows) {
      if (!medsPorProjeto[m.ID_Projeto]) medsPorProjeto[m.ID_Projeto] = [];
      medsPorProjeto[m.ID_Projeto].push(m);
    }

    const hoje = new Date();

    // ── O.S. reais do OPP ────────────────────────────────────────────────
    // Cada medição de verdade é sua própria O.S. no OPP, com valor e NF
    // reais (bem diferente do único Nr_OS_OPP por projeto que o Par guardava
    // até agora — ver investigar-os-reais-opp.js). Só dá pra casar com
    // confiança quando o cliente do OPP tem exatamente 1 projeto aprovado no
    // Par: com mais de um, a O.S. não diz a qual contrato pertence, então
    // esses continuam usando a prévia do planejamento (loop mais abaixo).
    const reMedicao = /medi[cç][aã]o/i;
    const osDeMedicao = (ordensServicoOPP || []).filter((o) =>
      reMedicao.test(o.Referencia || '') || reMedicao.test(o.Observacao || '') || reMedicao.test(o.Problema || '')
    );
    const osPorIdClienteOPP = {};
    for (const o of osDeMedicao) {
      const idCli = String(o.ID_Cliente_OPP || '');
      if (!idCli || idCli === '0') continue;
      (osPorIdClienteOPP[idCli] = osPorIdClienteOPP[idCli] || []).push(o);
    }
    const aprovadosPorIdClienteOPP = {};
    for (const pl of planejamentos) {
      if (pl.Status !== 'Aprovado' || !pl.ID_Projeto) continue;
      const projDoPlano = projMap[pl.ID_Projeto];
      const idCli = projDoPlano?.ID_OPP_Cliente ? String(projDoPlano.ID_OPP_Cliente) : '';
      if (!idCli) continue;
      (aprovadosPorIdClienteOPP[idCli] = aprovadosPorIdClienteOPP[idCli] || []).push({ idProjeto: pl.ID_Projeto, plan: pl });
    }
    // Extrai o número da NF do texto da referência (ex.: "2ª MEDIÇÃO - NF_Nº 417")
    const reNF = /NF[_\s]*N?º?\s*(\d+)/i;
    const receitaPorNF = {};
    for (const r of receitasOPP) {
      const nf = String(r.n_documento_rec || '').trim();
      if (!nf) continue;
      if (r.liquidado_rec === 'Sim') receitaPorNF[nf] = true;
      else if (!(nf in receitaPorNF)) receitaPorNF[nf] = false;
    }

    const idsProjetoComOSReal = new Set();
    const realRows = [];
    for (const [idCli, lista] of Object.entries(aprovadosPorIdClienteOPP)) {
      if (lista.length !== 1) continue; // cliente com vários projetos — ambíguo, não dá pra casar sem palpite
      const osDoCliente = osPorIdClienteOPP[idCli];
      if (!osDoCliente || osDoCliente.length === 0) continue; // ainda sem O.S. real — mantém a prévia normal
      const { idProjeto, plan } = lista[0];
      const proj = projMap[idProjeto] || {};
      idsProjetoComOSReal.add(idProjeto);
      for (const o of osDoCliente) {
        const nfMatch = (o.Referencia || '').match(reNF);
        const nf = nfMatch ? nfMatch[1] : '';
        const liquidado = !!nf && receitaPorNF[nf] === true;
        const dataRef = o.Data_Entrega || o.Data_Pedido || '';
        const isAtrasadaOS = !liquidado && !!dataRef && new Date(dataRef) < hoje;
        const statusFin = liquidado ? 'Recebido' : (nf ? 'Faturado' : (isAtrasadaOS ? 'Atrasado' : 'Pendente'));
        realRows.push({
          ID_Medicao: `os_${o.ID_OS_OPP}`,
          ID_Projeto: idProjeto,
          nomeProjeto: proj.Nome || plan.Nome_Projeto || '',
          cliente: proj.Cliente || proj.Nome_Cliente || '',
          setor: proj.Setor || '',
          Etapa: o.Referencia || o.Problema || 'Medição',
          Valor_Medicao: o.Valor_Total,
          Data_Previsao: dataRef,
          Data_Realizacao: o.Data_Realizacao || (o.Status === 'Atendido' ? o.Data_Pedido : ''),
          Nr_OS_OPP: o.ID_OS_OPP,
          Nr_NF: nf,
          Status_Financeiro: statusFin,
          atrasada: statusFin !== 'Recebido' && isAtrasadaOS,
          valorRecebidoOPP: statusFin === 'Recebido' ? pBR(o.Valor_Total) : 0,
          Link_Produto: '',
        });
      }
    }

    const enriched = rows.map((m) => {
      const proj = projMap[m.ID_Projeto] || {};
      const plan = planMap[m.ID_Projeto] || {};
      const totalRecebido = totalRecebidoPorProjeto[m.ID_Projeto] || 0;

      // Calcula acumulado até esta medição (ordem de inserção)
      const medsOrdenadas = medsPorProjeto[m.ID_Projeto] || [];
      let acumulado = 0;
      for (const med of medsOrdenadas) {
        acumulado += pBR(med.Valor_Medicao || med.Valor || 0);
        if (med === m || med.ID_Medicao === m.ID_Medicao) break;
      }

      // Status: Recebido se já foi marcado manualmente OU se OPP cobre o acumulado
      let statusFin = m.Status_Financeiro || '';
      const cobertoPeloOPP = totalRecebido > 0 && acumulado <= totalRecebido + 0.5;
      const isAtrasada = m.Data_Previsao && new Date(m.Data_Previsao) < hoje;
      if (cobertoPeloOPP) {
        statusFin = 'Recebido';
      } else if (!statusFin || statusFin === 'Pendente') {
        statusFin = isAtrasada ? 'Atrasado' : 'Pendente';
      }

      const nrNF = m.Nr_NF || (cobertoPeloOPP ? (nfPorProjeto[m.ID_Projeto] || '') : '');

      return {
        ...m,
        nomeProjeto: proj.Nome || m.nomeProjeto || planNomeMap[m.ID_Projeto] || '',
        cliente: proj.Cliente || proj.Nome_Cliente || '',
        setor: proj.Setor || '',
        atrasada: statusFin !== 'Recebido' && isAtrasada,
        valorRecebidoOPP: cobertoPeloOPP ? pBR(m.Valor_Medicao || m.Valor || 0) : 0,
        Nr_NF: nrNF,
        Nr_OS_OPP: plan.Nr_OS_OPP || m.Nr_OS_OPP || '',
        Status_Financeiro: statusFin,
        Link_Produto: m.Link_Produto || m.Link_Contrato || '',
      };
    });

    // Projetos aprovados sem NENHUMA linha real na tabela Medicoes ainda —
    // mostra o cronograma planejado (Dados_JSON.medicoes) como prévia, igual
    // o frontend já fazia antes. Mas agora reaproveita o mesmo
    // totalRecebidoPorProjeto/nfPorProjeto calculados acima (por
    // ID_Centro_Custo_OPP confirmado) em vez de uma versão mais fraca —
    // assim Nº NF e Nº OS Interna saem certos aqui também, não só pros
    // projetos que já têm medição real cadastrada.
    const idsNaTabela = new Set(rows.map((m) => m.ID_Projeto));
    const hojeZero = new Date(); hojeZero.setHours(0, 0, 0, 0);
    const doPlanejamento = [];
    for (const plan of planejamentos) {
      if (plan.Status !== 'Aprovado') continue;
      if (!plan.ID_Projeto || idsNaTabela.has(plan.ID_Projeto) || idsProjetoComOSReal.has(plan.ID_Projeto)) continue;
      const proj = projMap[plan.ID_Projeto] || {};
      let dados;
      try { dados = JSON.parse(plan.Dados_JSON || '{}'); } catch { continue; }
      const meds = dados.medicoes || dados._baseline?.medicoesCronograma || [];
      const totalRecebido = totalRecebidoPorProjeto[plan.ID_Projeto] || 0;
      let acumulado = 0;
      meds.forEach((m, idx) => {
        const dataPrevisao = m.dataPrevisao || m.dataPrevista || '';
        const valorMed = pBR(m.valor || m.valorPlanejado || 0);
        acumulado += valorMed;
        const cobertoPeloOPP = totalRecebido > 0 && acumulado <= totalRecebido + 0.5;
        const isAtrasada = dataPrevisao && new Date(dataPrevisao + 'T00:00:00') < hojeZero;
        const statusFin = cobertoPeloOPP ? 'Recebido' : (isAtrasada ? 'Atrasado' : 'Pendente');
        doPlanejamento.push({
          ID_Medicao: `plan_${plan.ID_Projeto}_${idx}`,
          ID_Projeto: plan.ID_Projeto,
          nomeProjeto: proj.Nome || plan.Nome_Projeto || '(projeto não encontrado)',
          cliente: proj.Cliente || proj.Nome_Cliente || '',
          setor: proj.Setor || '',
          Data_Previsao: dataPrevisao,
          Valor: valorMed,
          Descricao: m.descricao || m.etapa || `Medição ${idx + 1}`,
          Status_Financeiro: statusFin,
          atrasada: statusFin !== 'Recebido' && isAtrasada,
          valorRecebidoOPP: cobertoPeloOPP ? valorMed : 0,
          Nr_NF: cobertoPeloOPP ? (nfPorProjeto[plan.ID_Projeto] || '') : '',
          Nr_OS_OPP: plan.Nr_OS_OPP || '',
          Link_Produto: '',
          _doPlanejamento: true,
        });
      });
    }

    res.json([...enriched, ...realRows, ...doPlanejamento]);
  } catch (err) {
    next(err);
  }
});

// POST /api/medicoes — cria medição
router.post('/', audit, async (req, res, next) => {
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
router.put('/:id', audit, async (req, res, next) => {
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
