// node backend/diagnosticar-centro-custo-detalhe.js
//
// Só lê (não grava nada). O diagnóstico anterior (diagnosticar-recebido-
// projeto.js) mostrou que ~98% do valor liquidado em /contas-receber (lista)
// vem com id_centro_custos=0 e centro_custos_rec="null" — mesmo em contas de
// clientes que claramente batem com projetos acompanhados (ex.: PREFEITURA
// MUNICIPAL DE FORTIM). Antes de inventar um casamento por nome de cliente
// (arriscado, porque clientes como EMBASA/CORREIOS/CODEVASF têm VÁRIOS
// projetos diferentes), checa uma hipótese mais simples: será que o
// endpoint de DETALHE de uma conta específica (/contas-receber/:id) traz o
// centro de custo que a LISTAGEM paginada omite? (igual descobrimos antes
// que /contas-pagar e /ordens-compra às vezes se comportam diferente entre
// lista e detalhe.)

require('dotenv').config({ path: require('path').join(__dirname, '.env') });

async function main() {
  const { oppRequest } = require('./src/services/oppService');

  console.log('=== Pegando algumas contas a receber liquidadas com id_centro_custos=0 ===\n');
  let offset = 0, amostra = [];
  while (amostra.length < 5) {
    const r = await oppRequest('GET', `/contas-receber?limit=100&offset=${offset}`);
    const lista = Array.isArray(r) ? r : (r?.data || []);
    if (lista.length === 0) break;
    const semCC = lista.filter((x) => x.liquidado_rec === 'Sim' && (!x.id_centro_custos || x.id_centro_custos === 0) && String(x.nome_cliente || '').toUpperCase().includes('FORTIM'));
    amostra.push(...semCC);
    offset += 100;
    if (offset > 3000) break;
  }
  console.log(`Encontradas ${amostra.length} contas da FORTIM sem centro de custo na listagem.\n`);

  for (const conta of amostra.slice(0, 3)) {
    console.log(`--- Listagem: id_conta_rec=${conta.id_conta_rec} ---`);
    console.log(`  centro_custos_rec="${conta.centro_custos_rec}" | id_centro_custos=${conta.id_centro_custos}`);
    try {
      const detalhe = await oppRequest('GET', `/contas-receber/${conta.id_conta_rec}`);
      console.log('  Detalhe (GET /contas-receber/:id):');
      console.log('  ' + JSON.stringify(detalhe));
    } catch (e) {
      console.log(`  Erro ao buscar detalhe: ${e.message}`);
    }
    console.log('');
  }

  process.exit(0);
}

main().catch((e) => { console.error('Erro:', e.message); console.error(e.stack); process.exit(1); });
