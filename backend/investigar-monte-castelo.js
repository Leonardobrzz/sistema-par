// node backend/investigar-monte-castelo.js
//
// Só lê. Não grava nada.
//
// "URBANIZAÇÃO DO CAMPO MONTE CASTELO" apareceu com o real (O.S. no OPP) o
// DOBRO do planejado no Par (R$ 252.698 x R$ 124.719). Esse projeto é o
// único aprovado do cliente dele, então a comparação devia ser 100%
// confiável — por isso vale abrir e olhar O.S. por O.S. pra entender se é
// reajuste/aditivo real, ou se tem O.S. de outra coisa entrando no meio.

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

  const projetos = await db.readSheet('Projetos_Contratos');
  const planejamentos = await db.readSheet('Planejamentos');

  const projeto = projetos.find((p) => p.Nome === 'ARQ-2025-4-URBANIZAÇÃO DO CAMPO MONTE CASTELO');
  if (!projeto) { console.log('Projeto não encontrado pelo nome exato.'); return process.exit(1); }
  console.log(`Projeto: "${projeto.Nome}"`);
  console.log(`Cliente (Par): "${projeto.Cliente}" | ID_OPP_Cliente: ${projeto.ID_OPP_Cliente}\n`);

  const plan = planejamentos.find((p) => p.ID_Projeto === projeto.ID_Projeto && p.Status === 'Aprovado');
  if (plan) {
    let dados = {};
    try { dados = JSON.parse(plan.Dados_JSON || '{}'); } catch {}
    const d = dados._baseline || dados;
    const medsPlan = d.medicoesCronograma || dados.medicoes || [];
    console.log(`Valor do contrato no planejamento: R$ ${pBR(d.valorContrato || plan.Valor_Contrato).toFixed(2)}`);
    console.log(`Cronograma planejado (${medsPlan.length} etapa(s)):`);
    for (const m of medsPlan) {
      console.log(`   "${m.etapa || m.descricao}" — ${m.percentual}% — R$ ${pBR(m.valor || m.valorPlanejado).toFixed(2)} — prevista p/ ${m.dataPrevisao || m.dataPrevista || '?'}`);
    }
  }

  console.log(`\nBuscando TODAS as O.S. do cliente ${projeto.ID_OPP_Cliente} no OPP...\n`);
  const LIMIT = 200;
  let offset = 0, todas = [];
  while (true) {
    const data = await oppRequest('GET', `/ordens-servico?limit=${LIMIT}&offset=${offset}&id_cliente=${projeto.ID_OPP_Cliente}`);
    const lista = Array.isArray(data) ? data : (data?.data || []);
    if (lista.length === 0) break;
    todas.push(...lista);
    if (lista.length < LIMIT) break;
    offset += LIMIT;
    if (offset > 5000) break;
  }

  // Caso a API ignore o filtro id_cliente, filtra localmente também
  let doCliente = todas.filter((o) => String(o.id_cliente) === String(projeto.ID_OPP_Cliente));
  if (doCliente.length === 0 && todas.length > 0) {
    console.log('(API pode ter ignorado o filtro id_cliente — filtrando localmente)');
    doCliente = todas;
  }

  const validas = doCliente.filter((o) => o.lixeira !== 'Sim');
  console.log(`Total de O.S. desse cliente (fora da lixeira): ${validas.length}\n`);

  let somaTotal = 0;
  for (const o of validas.sort((a, b) => (a.data_pedido || '').localeCompare(b.data_pedido || ''))) {
    somaTotal += pBR(o.valor_total_os || 0);
    console.log(`  [id_pedido ${o.id_pedido}] ref="${o.referencia_ordem}" | problema="${o.problema_ordem}" | valor=${o.valor_total_os} | status=${o.status_pedido} | data=${o.data_pedido}`);
  }
  console.log(`\nSoma de TODAS as O.S. desse cliente: R$ ${somaTotal.toFixed(2)}`);

  process.exit(0);
}

main().catch((e) => { console.error('Erro:', e.message); console.error(e.stack); process.exit(1); });
