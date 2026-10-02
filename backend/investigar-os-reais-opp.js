// node backend/investigar-os-reais-opp.js
//
// Só lê. Não grava nada.
//
// Achado da 1ª rodada: TODOS os 62 projetos aprovados têm ZERO registros na
// tabela real "Medicoes" — ou seja, a tela Medições & Faturamento hoje só
// mostra uma PRÉVIA calculada a partir do cronograma planejado, nunca um
// dado de verdade conferido contra o OPP linha a linha. E a amostra de uma
// O.S. real do OPP mostrou um campo de valor de verdade (valor_total_os) e
// uma referência tipo "2ª MEDIÇÃO - NF_Nº 417" — sugerindo que, na prática,
// cada medição vira uma O.S. própria no OPP, com seu próprio valor. O Par
// hoje só guarda UM número de O.S. por projeto (Planejamentos.Nr_OS_OPP),
// não um por medição — por isso os valores não têm como bater.
//
// Este script busca TODAS as O.S. reais do OPP, isola as que parecem ser de
// medição (texto "medição"/"medicao" na referência/observação/problema),
// e tenta casar por cliente (ID_OPP_Cliente) com os projetos do Par, pra
// comparar valor real x valor planejado por projeto.

require('dotenv').config({ path: require('path').join(__dirname, '.env') });

const pBR = (v) => {
  const s = String(v || 0).trim();
  if (s.includes(',')) return parseFloat(s.replace(/\./g, '').replace(',', '.')) || 0;
  const parts = s.split('.');
  if (parts.length === 2 && parts[1].length <= 2) return parseFloat(s) || 0;
  return parseFloat(s.replace(/\./g, '')) || 0;
};

async function main() {
  const db = require('./src/services/postgresService');
  const { oppRequest } = require('./src/services/oppService');

  console.log('Buscando todas as Ordens de Serviço do OPP (pode demorar um pouco)...\n');

  const LIMIT = 200;
  let offset = 0;
  const todas = [];
  let primeiraIdPaginaAnterior = null;
  while (true) {
    const data = await oppRequest('GET', `/ordens-servico?limit=${LIMIT}&offset=${offset}`);
    const lista = Array.isArray(data) ? data : (data?.data || []);
    if (lista.length === 0) break;
    // segurança: se a API ignorar "offset" e devolver sempre a mesma página, para
    if (primeiraIdPaginaAnterior !== null && lista[0]?.id_pedido === primeiraIdPaginaAnterior) {
      console.log('(API parece ignorar "offset" — parando paginação pra não duplicar.)');
      break;
    }
    primeiraIdPaginaAnterior = lista[0]?.id_pedido;
    todas.push(...lista);
    if (lista.length < LIMIT) break;
    offset += LIMIT;
    if (offset > 20000) break; // segurança
  }

  const validas = todas.filter((o) => o.lixeira !== 'Sim');
  console.log(`Total de O.S. recebidas: ${todas.length} (${validas.length} fora da lixeira)\n`);

  const reMedicao = /medi[cç][aã]o/i;
  const deMedicao = validas.filter((o) =>
    reMedicao.test(o.referencia_ordem || '') || reMedicao.test(o.obs_pedido || '') || reMedicao.test(o.problema_ordem || '')
  );
  console.log(`O.S. que parecem ser de medição (texto "medição" na referência/obs/problema): ${deMedicao.length}\n`);

  console.log('Amostra (até 20):');
  for (const o of deMedicao.slice(0, 20)) {
    console.log(`  [id_pedido ${o.id_pedido}] cliente="${o.nome_cliente}" | ref="${o.referencia_ordem}" | valor_total_os=${o.valor_total_os} | status=${o.status_pedido} | data=${o.data_pedido}`);
  }

  // ─────────────────────────────────────────────────────────────────────
  console.log('\n\n========== Preenchimento de Projetos_Contratos.ID_OPP_Cliente ==========\n');
  const projetos = await db.readSheet('Projetos_Contratos');
  const planejamentos = await db.readSheet('Planejamentos');
  const comId = projetos.filter((p) => p.ID_OPP_Cliente);
  console.log(`${comId.length} de ${projetos.length} projetos têm ID_OPP_Cliente preenchido.`);
  if (comId.length === 0) {
    console.log('Nenhum projeto tem esse vínculo preenchido — não dá pra casar O.S. por cliente ainda. Pulando a comparação por projeto.');
    process.exit(0);
  }

  // ─────────────────────────────────────────────────────────────────────
  console.log('\n\n========== Comparação por projeto: valor real das O.S. de medição x planejado ==========\n');

  const idOppClientePorProjeto = {};
  const nomePorProjeto = {};
  for (const p of projetos) {
    nomePorProjeto[p.ID_Projeto] = p.Nome;
    if (p.ID_OPP_Cliente) idOppClientePorProjeto[p.ID_Projeto] = String(p.ID_OPP_Cliente);
  }

  // Soma valor_total_os das O.S. de medição por id_cliente do OPP
  const valorRealPorIdCliente = {};
  const osPorIdCliente = {};
  for (const o of deMedicao) {
    const idCli = String(o.id_cliente || '');
    if (!idCli || idCli === '0') continue;
    valorRealPorIdCliente[idCli] = (valorRealPorIdCliente[idCli] || 0) + pBR(o.valor_total_os || 0);
    (osPorIdCliente[idCli] = osPorIdCliente[idCli] || []).push(o);
  }

  const planPorProjeto = {};
  for (const pl of planejamentos) {
    if (pl.ID_Projeto && pl.Status === 'Aprovado') planPorProjeto[pl.ID_Projeto] = pl;
  }

  // Agrupa projetos aprovados por id_cliente do OPP — importante porque um
  // mesmo cliente (ex.: uma prefeitura) pode ter VÁRIOS projetos/contratos
  // com o Par ao mesmo tempo. A O.S. no OPP só identifica o cliente, não diz
  // a qual contrato especificamente pertence — então só dá pra comparar
  // valor por PROJETO quando o cliente tem exatamente 1 projeto aprovado.
  // Com mais de 1, só dá pra comparar o total agregado do cliente.
  const projetosAprovadosPorIdCliente = {};
  for (const [idProjeto, idCli] of Object.entries(idOppClientePorProjeto)) {
    const plan = planPorProjeto[idProjeto];
    if (!plan) continue;
    (projetosAprovadosPorIdCliente[idCli] = projetosAprovadosPorIdCliente[idCli] || []).push({ idProjeto, plan });
  }

  function totalPlanDoPlano(plan) {
    let dados = {};
    try { dados = JSON.parse(plan.Dados_JSON || '{}'); } catch {}
    const d = dados._baseline || dados;
    return (d.medicoesCronograma || dados.medicoes || []).reduce((s, m) => s + pBR(m.valor || m.valorPlanejado || 0), 0);
  }

  const comparacaoUnica = [];   // cliente com 1 só projeto aprovado — comparação direta e confiável
  const comparacaoAgregada = []; // cliente com vários projetos — só dá pra comparar o total do cliente

  for (const [idCli, lista] of Object.entries(projetosAprovadosPorIdCliente)) {
    const valorReal = valorRealPorIdCliente[idCli] || 0;
    const qtdOS = (osPorIdCliente[idCli] || []).length;
    if (lista.length === 1) {
      const totalPlan = totalPlanDoPlano(lista[0].plan);
      if (totalPlan === 0 && valorReal === 0) continue;
      comparacaoUnica.push({ nome: nomePorProjeto[lista[0].idProjeto], totalPlan, valorReal, qtdOS, diferenca: Math.abs(totalPlan - valorReal) });
    } else {
      const totalPlan = lista.reduce((s, item) => s + totalPlanDoPlano(item.plan), 0);
      if (totalPlan === 0 && valorReal === 0) continue;
      comparacaoAgregada.push({
        nomes: lista.map((item) => nomePorProjeto[item.idProjeto]),
        totalPlan, valorReal, qtdOS, diferenca: Math.abs(totalPlan - valorReal),
      });
    }
  }

  comparacaoUnica.sort((a, b) => b.diferenca - a.diferenca);
  console.log(`\n--- Clientes com 1 único projeto aprovado (comparação direta e confiável) — ${comparacaoUnica.length} ---\n`);
  if (comparacaoUnica.length === 0) {
    console.log('Nenhum caso encontrado.');
  } else {
    for (const c of comparacaoUnica.slice(0, 25)) {
      console.log(`"${c.nome}"`);
      console.log(`   Total planejado (Par):....... R$ ${c.totalPlan.toFixed(2)}`);
      console.log(`   Total real (O.S. no OPP):..... R$ ${c.valorReal.toFixed(2)}  (${c.qtdOS} O.S. de medição encontrada(s))`);
      console.log(`   Diferença:.................... R$ ${c.diferenca.toFixed(2)}`);
      console.log('');
    }
  }

  comparacaoAgregada.sort((a, b) => b.diferenca - a.diferenca);
  console.log(`\n--- Clientes com VÁRIOS projetos aprovados (só dá pra comparar o total do cliente, não por projeto) — ${comparacaoAgregada.length} ---\n`);
  if (comparacaoAgregada.length === 0) {
    console.log('Nenhum caso encontrado.');
  } else {
    for (const c of comparacaoAgregada.slice(0, 15)) {
      console.log(`Cliente com ${c.nomes.length} projeto(s): ${c.nomes.slice(0, 5).join(', ')}${c.nomes.length > 5 ? ', ...' : ''}`);
      console.log(`   Total planejado (soma de todos):... R$ ${c.totalPlan.toFixed(2)}`);
      console.log(`   Total real (O.S. no OPP):.......... R$ ${c.valorReal.toFixed(2)}  (${c.qtdOS} O.S. de medição encontrada(s))`);
      console.log(`   Diferença:.......................... R$ ${c.diferenca.toFixed(2)}`);
      console.log('');
    }
  }

  process.exit(0);
}

main().catch((e) => { console.error('Erro:', e.message); console.error(e.stack); process.exit(1); });
