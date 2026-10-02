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

    // IMPORTANTE: não dá pra tratar todo valor como texto em formato BR
    // (ponto = milhar). Os valores do cronograma do Par vêm como texto
    // "77.785,12" (precisa dessa regra), mas os valores que vêm do OPP
    // (o.Valor_Total da tabela OrdensServico_OPP) chegam como "77785.12"
    // (ponto decimal de verdade, sem vírgula) — aplicar a regra cega neles
    // tirava o ponto e multiplicava o valor por 100, fazendo o casamento
    // por valor (O.S. real × etapa planejada) nunca bater. Só trata como
    // milhar quando o texto tem vírgula (formato BR de verdade) ou quando
    // o ponto não parece ser decimal.
    const pBR = (v) => {
      const s = String(v || 0).trim();
      if (s.includes(',')) return parseFloat(s.replace(/\./g, '').replace(',', '.')) || 0;
      const partes = s.split('.');
      if (partes.length === 2 && partes[1].length <= 2) return parseFloat(s) || 0;
      return parseFloat(s.replace(/\./g, '')) || 0;
    };

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
    // reais. MAS: um mesmo cliente (ex.: uma prefeitura) pode ter O.S. de
    // OUTRAS secretarias/serviços (SEINFRA, SEDUC, SAÚDE...) que não têm
    // nada a ver com o contrato específico do Par — confirmado com dados
    // reais em investigar-monte-castelo.js (cliente com só 1 projeto no Par,
    // mas 18 O.S. no OPP, a maioria de outras coisas). Então "casar só pelo
    // cliente" NÃO é seguro o suficiente.
    //
    // O sinal confiável de verdade é o VALOR: no mesmo exemplo, a O.S. real
    // "31ª MEDIÇÃO - NF 361 - SEINFRA" tem valor R$ 77.785,12 — exatamente
    // igual à etapa planejada "MEDIÇÃO - PROJETO EXECUTIVO" do cronograma
    // desse projeto. Por isso, cada O.S. real só vira uma linha de medição
    // de verdade quando o valor bate (com pequena tolerância) com uma única
    // etapa ainda não usada do cronograma de algum projeto aprovado DAQUELE
    // MESMO cliente. Sem esse match de valor, a O.S. fica de fora — melhor
    // não mostrar do que mostrar vinculada ao projeto errado.
    const reMedicao = /medi[cç][aã]o/i;
    const osDeMedicao = (ordensServicoOPP || []).filter((o) =>
      reMedicao.test(o.Referencia || '') || reMedicao.test(o.Observacao || '') || reMedicao.test(o.Problema || '')
    );
    // Mapa direto por número de O.S. — usado pra buscar o nome/NF reais do
    // OPP sempre que a linha já sabe qual é a O.S. (vínculo único, sem
    // ambiguidade), mesmo quando essa linha não passou pelo casamento por
    // valor acima (ex.: um projeto com 4 etapas planejadas mas só 1 O.S. real
    // cobrindo o valor somado das 4 — não dá pra casar por valor em cada
    // etapa, mas já sabemos qual O.S. é, então não tem motivo pra mostrar um
    // nome inventado pelo planejamento em vez do nome real do OPP).
    const osPorNumero = {};
    for (const o of (ordensServicoOPP || [])) osPorNumero[String(o.ID_OS_OPP)] = o;
    const osPorIdClienteOPP = {};
    for (const o of osDeMedicao) {
      const idCli = String(o.ID_Cliente_OPP || '');
      if (!idCli || idCli === '0') continue;
      (osPorIdClienteOPP[idCli] = osPorIdClienteOPP[idCli] || []).push(o);
    }
    // Lista achatada de TODAS as etapas planejadas (de todos os projetos
    // aprovados), agrupada por cliente do OPP
    const etapasPorIdClienteOPP = {};
    for (const pl of planejamentos) {
      if (pl.Status !== 'Aprovado' || !pl.ID_Projeto) continue;
      const projDoPlano = projMap[pl.ID_Projeto];
      const idCli = projDoPlano?.ID_OPP_Cliente ? String(projDoPlano.ID_OPP_Cliente) : '';
      if (!idCli) continue;
      let dadosPlano = {};
      try { dadosPlano = JSON.parse(pl.Dados_JSON || '{}'); } catch {}
      const dPlano = dadosPlano._baseline || dadosPlano;
      const medsPlanejadas = dPlano.medicoesCronograma || dadosPlano.medicoes || [];
      medsPlanejadas.forEach((m, idx) => {
        const valorEtapa = pBR(m.valor || m.valorPlanejado || 0);
        if (valorEtapa <= 0) return;
        (etapasPorIdClienteOPP[idCli] = etapasPorIdClienteOPP[idCli] || []).push({
          idProjeto: pl.ID_Projeto, plan: pl, etapaIdx: idx, valor: valorEtapa,
        });
      });
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
    // Tolerância BEM pequena e fixa (não percentual) — só pra cobrir
    // arredondamento de centavos. Se o valor real for diferente do planejado
    // por reajuste ou qualquer outro motivo, é melhor NÃO casar: assim a
    // etapa continua aparecendo como prévia (pendente) em vez de esconder
    // uma divergência de valor que é exatamente o que o chef quer enxergar.
    const tolerancia = () => 0.5;

    const etapasUsadas = new Set(); // `${idProjeto}_${etapaIdx}` já casada com uma O.S. real
    const realRows = [];
    for (const [idCli, etapas] of Object.entries(etapasPorIdClienteOPP)) {
      const osDoCliente = osPorIdClienteOPP[idCli];
      if (!osDoCliente || osDoCliente.length === 0) continue;
      for (const o of osDoCliente) {
        const valorOS = pBR(o.Valor_Total);
        if (valorOS <= 0) continue;
        const candidatas = etapas.filter((e) =>
          !etapasUsadas.has(`${e.idProjeto}_${e.etapaIdx}`) && Math.abs(e.valor - valorOS) <= tolerancia(e.valor)
        );
        if (candidatas.length !== 1) continue; // sem match ou ambíguo (bateu em mais de uma etapa) — não arrisca
        const e = candidatas[0];
        etapasUsadas.add(`${e.idProjeto}_${e.etapaIdx}`);
        const proj = projMap[e.idProjeto] || {};

        const nfMatch = (o.Referencia || '').match(reNF);
        const nf = nfMatch ? nfMatch[1] : '';
        const liquidado = !!nf && receitaPorNF[nf] === true;
        const dataRef = o.Data_Entrega || o.Data_Pedido || '';
        const isAtrasadaOS = !liquidado && !!dataRef && new Date(dataRef) < hoje;
        const statusFin = liquidado ? 'Recebido' : (nf ? 'Faturado' : (isAtrasadaOS ? 'Atrasado' : 'Pendente'));
        realRows.push({
          ID_Medicao: `os_${o.ID_OS_OPP}`,
          ID_Projeto: e.idProjeto,
          nomeProjeto: proj.Nome || e.plan.Nome_Projeto || '',
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

      // O.S. única e confirmada deste projeto (se o campo não tiver vírgula)
      // — usada como fonte mais confiável de NF do que o "primeiro NF achado
      // pro projeto" (nfPorProjeto), que é a mesma aproximação pra todas as
      // linhas do projeto e pode não ser o NF de verdade desta medição.
      const nrOsResolvido = (plan.Nr_OS_OPP && !String(plan.Nr_OS_OPP).includes(',')) ? plan.Nr_OS_OPP : '';
      const osReal = nrOsResolvido ? osPorNumero[String(nrOsResolvido)] : null;
      const nfDoOSReal = osReal ? ((String(osReal.Referencia || '').match(reNF) || [])[1] || '') : '';

      const nrNF = m.Nr_NF || nfDoOSReal || (cobertoPeloOPP ? (nfPorProjeto[m.ID_Projeto] || '') : '');

      return {
        ...m,
        nomeProjeto: proj.Nome || m.nomeProjeto || planNomeMap[m.ID_Projeto] || '',
        cliente: proj.Cliente || proj.Nome_Cliente || '',
        setor: proj.Setor || '',
        atrasada: statusFin !== 'Recebido' && isAtrasada,
        valorRecebidoOPP: cobertoPeloOPP ? pBR(m.Valor_Medicao || m.Valor || 0) : 0,
        Nr_NF: nrNF,
        // NUNCA mostra o Nr_OS_OPP do projeto quando ele tem mais de uma O.S.
        // colada (texto com vírgula) — esse campo é do contrato inteiro, não
        // dessa medição específica, e um contrato grande pode ter várias O.S.
        // de coisas totalmente diferentes (já confirmamos um caso real: O.S.
        // de outra secretaria colada por engano). Só é seguro mostrar aqui
        // quando sobra exatamente UMA O.S. sem ambiguidade; com mais de uma,
        // melhor não mostrar nada do que arriscar colar a O.S. errada nesta
        // linha — a linha de medição real (casada por valor, acima) já cobre
        // o caso de saber exatamente qual O.S. é de qual etapa.
        Nr_OS_OPP: nrOsResolvido,
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
      if (!plan.ID_Projeto || idsNaTabela.has(plan.ID_Projeto)) continue;
      const proj = projMap[plan.ID_Projeto] || {};
      let dados;
      try { dados = JSON.parse(plan.Dados_JSON || '{}'); } catch { continue; }
      const meds = dados.medicoes || dados._baseline?.medicoesCronograma || [];
      const totalRecebido = totalRecebidoPorProjeto[plan.ID_Projeto] || 0;
      let acumulado = 0;

      // Mesma regra da linha "enriched": só confia no Nr_OS_OPP do projeto
      // quando não tem vírgula (uma O.S. só, sem ambiguidade). Com essa O.S.
      // em mãos, busca o nome/NF REAIS dela no OPP em vez de usar o nome que
      // foi digitado no cronograma planejado do Par — que pode ter sido
      // escrito diferente do que está no OPP de verdade (ex.: Par chama de
      // "MEDIÇÃO - ETAPA 01" uma coisa que no OPP se chama "MEDIÇÃO* ÚNICA").
      // Isso vale pra TODAS as etapas desse planejamento, não só a "Recebido"
      // — o nome/NF da O.S. não muda com o status de pagamento da etapa.
      const nrOsResolvidoPlano = (plan.Nr_OS_OPP && !String(plan.Nr_OS_OPP).includes(',')) ? plan.Nr_OS_OPP : '';
      const osRealPlano = nrOsResolvidoPlano ? osPorNumero[String(nrOsResolvidoPlano)] : null;
      const nfDoOSRealPlano = osRealPlano ? ((String(osRealPlano.Referencia || '').match(reNF) || [])[1] || '') : '';

      meds.forEach((m, idx) => {
        // Essa etapa específica já tem uma O.S. real casada por valor —
        // não mostra a prévia duplicada, a linha real já cobre ela.
        if (etapasUsadas.has(`${plan.ID_Projeto}_${idx}`)) return;
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
          Descricao: (osRealPlano && osRealPlano.Referencia) ? osRealPlano.Referencia : (m.descricao || m.etapa || `Medição ${idx + 1}`),
          Status_Financeiro: statusFin,
          atrasada: statusFin !== 'Recebido' && isAtrasada,
          valorRecebidoOPP: cobertoPeloOPP ? valorMed : 0,
          Nr_NF: nfDoOSRealPlano || (cobertoPeloOPP ? (nfPorProjeto[plan.ID_Projeto] || '') : ''),
          // Mesma regra da linha "enriched" acima: nunca cola mais de uma
          // O.S. numa etapa de prévia. Com mais de uma O.S. no projeto, essa
          // etapa específica ainda não tem uma O.S. confirmada — fica em
          // branco até a medição real bater por valor (vira uma realRow).
          Nr_OS_OPP: nrOsResolvidoPlano,
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
