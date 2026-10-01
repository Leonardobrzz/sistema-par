// node backend/checar-detalhe-oc.js
//
// O filtro /contas-pagar?id_pedido=X não funciona de verdade (a API ignora
// o parâmetro e devolve uma lista genérica, sem relação com a OC pedida) —
// por isso Valor_Liquidado sempre fica 0 (ou errado). Esse script busca o
// DETALHE de uma Ordem de Compra específica (/ordens-compra/<id>) pra ver se
// o pagamento já vem embutido ali dentro (campo "contas_pedido" sugere que sim).

require('dotenv').config({ path: require('path').join(__dirname, '.env') });
const { oppRequest } = require('./src/services/oppService');

async function main() {
  // OC #1 (JOAQUIM LOPES FEITOSA, Valor_Total 1752.50) — mesma usada nos testes anteriores
  const idTeste = '1';
  console.log(`Buscando detalhe de /ordens-compra/${idTeste}...\n`);
  try {
    const r = await oppRequest('GET', `/ordens-compra/${idTeste}`);
    console.log(JSON.stringify(r, null, 2));
  } catch (e) {
    console.log('ERRO:', e.message);
  }

  console.log('\n\n=== Tentando /ordens-compra/<id>/pagamentos ===');
  try {
    const r2 = await oppRequest('GET', `/ordens-compra/${idTeste}/pagamentos`);
    console.log(JSON.stringify(r2, null, 2));
  } catch (e) {
    console.log('ERRO:', e.message);
  }

  console.log('\n\n=== Tentando /ordens-compra/<id>/contas ===');
  try {
    const r3 = await oppRequest('GET', `/ordens-compra/${idTeste}/contas`);
    console.log(JSON.stringify(r3, null, 2));
  } catch (e) {
    console.log('ERRO:', e.message);
  }
}

main().catch(e => console.error('Erro geral:', e.message));
