// node backend/diagnosticar-origem-numero-os.js
//
// Só lê (não grava nada). O diagnóstico anterior mostrou que /ordens-servico
// só tem 183 registros (id_pedido de 1 a 183), mas a observação das contas a
// receber cita "ordem de serviço nº 1777" — número bem maior. Esse script
// testa duas hipóteses pra achar de onde vem esse número:
//   1) Será que "ordem de serviço" no texto do OPP, na verdade, é o mesmo
//      contador de id_pedido usado em /ordens-compra (que já vimos ter
//      números bem maiores)?
//   2) Será que existe um outro endpoint/campo (tipo id_ordem, não
//      id_pedido) que bate com esse número?

require('dotenv').config({ path: require('path').join(__dirname, '.env') });

async function main() {
  const { oppRequest } = require('./src/services/oppService');

  console.log('=== Faixa de id_pedido em /ordens-compra ===\n');
  let offset = 0, ocs = [];
  while (true) {
    const r = await oppRequest('GET', `/ordens-compra?limit=250&offset=${offset}&lixeira=Nao`);
    const lista = Array.isArray(r) ? r : (r?.data || []);
    if (lista.length === 0) break;
    ocs.push(...lista);
    if (lista.length < 250) break;
    offset += 250;
    if (offset > 5000) break;
  }
  const idsPedidoOC = ocs.map((o) => parseInt(o.id_pedido, 10)).filter((n) => !isNaN(n));
  console.log(`Total de O.C.: ${ocs.length}`);
  console.log(`id_pedido mínimo: ${Math.min(...idsPedidoOC)} | máximo: ${Math.max(...idsPedidoOC)}`);
  const achadoOC = ocs.find((o) => String(o.id_pedido) === '1777');
  console.log(achadoOC ? `\nid_pedido=1777 ENCONTRADO em /ordens-compra:\n  ${JSON.stringify(achadoOC)}` : '\nid_pedido=1777 NÃO está em /ordens-compra.');

  console.log('\n=== Testando GET /ordens-servico/1777 (detalhe direto) ===');
  try {
    const d = await oppRequest('GET', '/ordens-servico/1777');
    console.log('  ' + JSON.stringify(d));
  } catch (e) {
    console.log(`  Erro: ${e.message}`);
  }

  console.log('\n=== Testando GET /ordens-compra/1777 (detalhe direto) ===');
  try {
    const d = await oppRequest('GET', '/ordens-compra/1777');
    console.log('  ' + JSON.stringify(d));
  } catch (e) {
    console.log(`  Erro: ${e.message}`);
  }

  // Verifica se, batendo o VALOR da conta a receber (12230.85) contra as
  // O.C., aparece alguma coisa (mesmo não fazendo sentido de negócio, só
  // pra eliminar a hipótese por completo)
  console.log('\n=== Batendo valor 12230.85 contra id_pedido de ordens-compra (só eliminação) ===');
  const bateValor = ocs.filter((o) => Math.abs(parseFloat(o.valor_total_nota || 0) - 12230.85) < 0.5);
  console.log(bateValor.length ? JSON.stringify(bateValor) : 'nenhuma O.C. com esse valor.');

  process.exit(0);
}

main().catch((e) => { console.error('Erro:', e.message); console.error(e.stack); process.exit(1); });
