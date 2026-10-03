// Motor de cálculo das Medições & Faturamento, reaproveitado por mais de uma
// tela (originalmente só vivia dentro da rota GET /api/medicoes, em
// medicoes.js). Extraído pra cá pra poder ser usado também pelo
// dashboard-financeiro.js, no cálculo do "Recebido" por projeto da tabela
// Rentabilidade por Projeto — que até então usava um casamento bem mais
// fraco, só por centro de custo do OPP (confirmado com
// diagnosticar-formato-centro-custo.js: só 15 dos 61 projetos aprovados
// tinham algum recebimento batendo por centro de custo; a maioria das contas
// a receber "liquidadas" no OPP nem é de projeto — é lançamento
// administrativo tipo juros de banco). O motor abaixo casa pagamento com
// projeto pela O.S./NF (como já era feito na tela de Medições), que cobre
// muito mais casos.
//
// IMPORTANTE: esse arquivo é uma extração 1:1 da lógica que já existia
// dentro de medicoes.js — não muda nenhum comportamento da tela de Medições,
// só deixa essa lógica reaproveitável. Qualquer ajuste futuro no motor de
// casamento afeta as duas telas igual, o que é o comportamento certo (evita
// as duas telas mostrarem números diferentes pro mesmo projeto).

async function calcularMedicoesComOPP(db, filtros = {}) {
  const { projeto, status } = filtros;
  let rows = await db.readSheet('Medicoes');
  if (projeto) rows = rows.filter((r) => r.ID_Projeto === projeto);
  if (status) rows = rows.filter((r) => r.Status_Financeiro === status);

  // Busca receitas do OPP via API (todos os registros, sem limite de 12 meses)
  async function fetchReceitasOPP() {
    try {
      const { oppRequest } = require('./oppService');
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
  // Data de vencimento real da NF, direto do Contas a Receber do OPP
  // (campo vencimento_rec) — pedido do chefe pra aparecer na tela de
  // Medições & Faturamento. Só existe quando já sabemos o Nº da NF.
  const vencimentoPorNF = {};
  // ID interno da Conta a Receber (id_conta_rec) — usado pro link direto
  // dela no OPP (#!editar/<id_conta_rec>, confirmado com URL real). É
  // diferente do número da NF (n_documento_rec) que a gente mostra na
  // tela.
  const idContaReceberPorNF = {};
  for (const r of receitasOPP) {
    const nf = String(r.n_documento_rec || '').trim();
    if (!nf) continue;
    if (r.liquidado_rec === 'Sim') receitaPorNF[nf] = true;
    else if (!(nf in receitaPorNF)) receitaPorNF[nf] = false;
    if (!vencimentoPorNF[nf] && r.vencimento_rec) vencimentoPorNF[nf] = r.vencimento_rec;
    if (!idContaReceberPorNF[nf] && r.id_conta_rec) idContaReceberPorNF[nf] = r.id_conta_rec;
  }
  // O OPP frequentemente grava o Nº da NF em formato composto
  // "NÚMERO - PARCELA" (ex.: "503 - 1"), mas o número que a gente extrai
  // do texto da O.S./Referência (reNF, abaixo) é só a parte da frente, sem
  // a parcela (ex.: "503"). Isso fazia a busca exata acima (receitaPorNF,
  // vencimentoPorNF, idContaReceberPorNF) nunca bater pra maioria das
  // linhas — confirmado com dados reais (diagnosticar-vencimento-nf.js):
  // 12 de 17 NFs testadas só existiam no formato composto. Esse mapa
  // agrupa por "número base" (antes do " - ") pra servir de reserva.
  const porBaseNF = {};
  for (const r of receitasOPP) {
    const doc = String(r.n_documento_rec || '').trim();
    if (!doc) continue;
    const base = doc.split(/\s*-\s*/)[0].trim();
    if (!base) continue;
    (porBaseNF[base] = porBaseNF[base] || []).push(r);
  }
  // Só usa a reserva por base quando é seguro: se sobrar mais de um
  // registro com a mesma base mas vencimento/conta DIFERENTES entre si
  // (confirmado com dados reais pras NFs "91" e "95" — parcelas com datas
  // diferentes sob o mesmo número base), fica ambíguo e não arrisca
  // escolher a errada — melhor deixar em branco.
  function resolverPorBaseNF(nfBase) {
    const lista = porBaseNF[nfBase];
    if (!lista || lista.length === 0) return null;
    if (lista.length === 1) return lista[0];
    const vencs = new Set(lista.map((x) => x.vencimento_rec || ''));
    const contas = new Set(lista.map((x) => x.id_conta_rec || ''));
    if (vencs.size === 1 && contas.size === 1) return lista[0];
    return null;
  }
  function vencimentoDoNF(nf) {
    if (!nf) return '';
    if (vencimentoPorNF[nf]) return vencimentoPorNF[nf];
    const r = resolverPorBaseNF(nf);
    return r ? (r.vencimento_rec || '') : '';
  }
  function idContaReceberDoNF(nf) {
    if (!nf) return '';
    if (idContaReceberPorNF[nf]) return idContaReceberPorNF[nf];
    const r = resolverPorBaseNF(nf);
    return r ? (r.id_conta_rec || '') : '';
  }
  function liquidadoDoNF(nf) {
    if (!nf) return false;
    if (nf in receitaPorNF) return receitaPorNF[nf] === true;
    const r = resolverPorBaseNF(nf);
    return r ? r.liquidado_rec === 'Sim' : false;
  }
  // Só pra mostrar na tela POR QUE uma NF ficou sem Vencimento — não muda
  // nenhum valor usado em nenhum outro lugar. Dois motivos possíveis:
  // "nao_encontrado" = essa NF realmente não existe ainda no Contas a
  // Receber do OPP (confirmado com dados reais pras NFs 503/428/524/361/
  // 511 — a O.S. existe, mas a Roberta ainda não lançou a parte financeira
  // lá); "ambiguo" = existe mais de uma parcela com esse número base, mas
  // com vencimento/conta diferentes entre si, e não dá pra saber qual é a
  // certa sem arriscar (confirmado pras NFs 91 e 95).
  function motivoSemVencimentoDoNF(nf) {
    if (!nf) return '';
    if (vencimentoPorNF[nf]) return '';
    const lista = porBaseNF[nf];
    if (!lista || lista.length === 0) return 'nao_encontrado';
    if (lista.length === 1) return '';
    const vencs = new Set(lista.map((x) => x.vencimento_rec || ''));
    const contas = new Set(lista.map((x) => x.id_conta_rec || ''));
    if (vencs.size === 1 && contas.size === 1) return '';
    return 'ambiguo';
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
      const liquidado = !!nf && liquidadoDoNF(nf);
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
        // ID_Ordem_OPP é o número grande usado no link direto do OPP
        // (#!editar/<id_ordem>) — diferente do ID_OS_OPP (id_pedido, o
        // número pequeno que aparece na tela). Confirmado com URL real.
        ID_Ordem_OPP: o.ID_Ordem_OPP || '',
        Nr_NF: nf,
        Data_Vencimento: vencimentoDoNF(nf),
        ID_Conta_Receber_OPP: idContaReceberDoNF(nf),
        NF_Sem_Vencimento_Motivo: motivoSemVencimentoDoNF(nf),
        Status_Financeiro: statusFin,
        atrasada: statusFin !== 'Recebido' && isAtrasadaOS,
        valorRecebidoOPP: statusFin === 'Recebido' ? pBR(o.Valor_Total) : 0,
        Link_Produto: '',
      });
    }
  }

  // O.S. que já foi casada com certeza (por valor) numa etapa ESPECÍFICA de
  // um projeto. Importante pra não repetir o nome/NF dessa O.S. em OUTRAS
  // etapas do mesmo projeto: se a O.S. 49 já é confirmada como "Projeto
  // Executivo", ela não pode também aparecer como se fosse de
  // "Levantamento Topográfico" só porque as duas compartilham o mesmo
  // campo de O.S. do projeto.
  const osJaConsumidaPorProjeto = new Set(realRows.map((r) => `${r.ID_Projeto}_${r.Nr_OS_OPP}`));

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
    let nrOsResolvido = (plan.Nr_OS_OPP && !String(plan.Nr_OS_OPP).includes(',')) ? plan.Nr_OS_OPP : '';
    if (nrOsResolvido && osJaConsumidaPorProjeto.has(`${m.ID_Projeto}_${nrOsResolvido}`)) nrOsResolvido = '';
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
      // Data de vencimento real da NF no OPP (Contas a Receber). Prioriza o
      // que já estiver gravado manualmente na medição; só usa a do OPP como
      // reserva.
      Data_Vencimento: m.Data_Vencimento || vencimentoDoNF(nrNF),
      // ID interno da Conta a Receber — pro link direto dela no OPP.
      ID_Conta_Receber_OPP: idContaReceberDoNF(nrNF),
      // Só preenche o motivo quando realmente não achou nenhuma data (se já
      // tem Data_Vencimento gravada manualmente, não tem motivo nenhum).
      NF_Sem_Vencimento_Motivo: (m.Data_Vencimento || vencimentoDoNF(nrNF)) ? '' : motivoSemVencimentoDoNF(nrNF),
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
      // Número grande usado no link direto da O.S. no OPP (#!editar/<id>).
      ID_Ordem_OPP: osReal ? (osReal.ID_Ordem_OPP || '') : '',
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
    let nrOsResolvidoPlano = (plan.Nr_OS_OPP && !String(plan.Nr_OS_OPP).includes(',')) ? plan.Nr_OS_OPP : '';
    if (nrOsResolvidoPlano && osJaConsumidaPorProjeto.has(`${plan.ID_Projeto}_${nrOsResolvidoPlano}`)) nrOsResolvidoPlano = '';
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
      const nfDaEtapa = nfDoOSRealPlano || (cobertoPeloOPP ? (nfPorProjeto[plan.ID_Projeto] || '') : '');
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
        Nr_NF: nfDaEtapa,
        Data_Vencimento: vencimentoDoNF(nfDaEtapa),
        ID_Conta_Receber_OPP: idContaReceberDoNF(nfDaEtapa),
        NF_Sem_Vencimento_Motivo: motivoSemVencimentoDoNF(nfDaEtapa),
        // Mesma regra da linha "enriched" acima: nunca cola mais de uma
        // O.S. numa etapa de prévia. Com mais de uma O.S. no projeto, essa
        // etapa específica ainda não tem uma O.S. confirmada — fica em
        // branco até a medição real bater por valor (vira uma realRow).
        Nr_OS_OPP: nrOsResolvidoPlano,
        // Número grande usado no link direto da O.S. no OPP (#!editar/<id>).
        ID_Ordem_OPP: osRealPlano ? (osRealPlano.ID_Ordem_OPP || '') : '',
        Link_Produto: '',
        _doPlanejamento: true,
      });
    });
  }

  return [...enriched, ...realRows, ...doPlanejamento];
}

module.exports = { calcularMedicoesComOPP };
