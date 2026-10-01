// node backend/diagnostico-ordens-compra.js
//
// Só lê a API do OPP (não grava nada, não roda o sync de verdade).
//
// A tabela OrdensCompra_OPP está vazia. Esse script busca os dados crus de
// /ordens-compra pra ver: (1) se a API responde normal, (2) o formato real
// dos campos (o código espera "id_pedido", "valor_total_nota", etc. — pode
// ser que o nome real seja outro nesse OPP), e (3) tenta rodar a função de
// sync de verdade só uma vez, direto, pra capturar o erro exato se ela falhar
// (o cron engole o erro no log do servidor, que você não tem acesso fácil).

require('dotenv').config({ path: require('path').join(__dirname, '.env') });
const { oppRequest } = require('./src/services/oppService');

async function main() {
  console.log('Buscando /ordens-compra (primeiras 5, cru)...\n');
  try {
    const r = await oppRequest('GET', '/ordens-compra?limit=5&offset=0');
    const lista = Array.isArray(r) ? r : (r?.data || []);
    console.log(`Retornou ${lista.length} registro(s).`);
    if (lista.length === 0) {
      console.log('A API respondeu, mas sem nenhum registro. Resposta bruta completa:');
      console.log(JSON.stringify(r, null, 2).slice(0, 2000));
    } else {
      console.log('\nPrimeiro registro completo (todos os campos, pra ver os nomes reais):');
      console.log(JSON.stringify(lista[0], null, 2));
      console.log(`\nTem campo "id_pedido"? ${lista[0].id_pedido !== undefined ? 'SIM: ' + lista[0].id_pedido : 'NÃO'}`);
    }
  } catch (e) {
    console.log('ERRO ao buscar /ordens-compra:', e.message);
  }

  console.log('\n\n=== Tentando rodar o sync de verdade (syncOrdensCompra) pra ver o erro exato, se houver ===');
  try {
    const db = require('./src/services/postgresService');
    const { syncOrdensCompra } = require('./src/services/oppService');
    const resultado = await syncOrdensCompra(db);
    console.log('Sync rodou sem erro. Resultado:', resultado);
    const ocs = await db.readSheet('OrdensCompra_OPP');
    console.log(`Depois do sync, OrdensCompra_OPP tem ${ocs.length} registro(s).`);
  } catch (e) {
    console.log('ERRO ao rodar syncOrdensCompra:', e.message);
    console.log(e.stack);
  }
}

main().catch(e => console.error('Erro geral:', e.message));
