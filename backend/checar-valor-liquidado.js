// node backend/checar-valor-liquidado.js
//
// As Ordens de Compra sincronizaram (1065), mas a amostra mostrou Valor_Liquidado
// sempre "0". Esse script confere se isso é real (nenhuma paga ainda) ou se o
// filtro /contas-pagar?id_pedido=X não está funcionando como o código espera.

require('dotenv').config({ path: require('path').join(__dirname, '.env') });
const { Pool } = require('pg');
const { oppRequest } = require('./src/services/oppService');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL?.includes('supabase') ? { rejectUnauthorized: false } : false,
});

async function main() {
  const { rows: ocs } = await pool.query(`SELECT * FROM "OrdensCompra_OPP"`);
  const comPago = ocs.filter(o => parseFloat(o.Valor_Liquidado || 0) > 0);
  console.log(`Total de OCs: ${ocs.length}`);
  console.log(`Com Valor_Liquidado > 0: ${comPago.length}`);

  // Pega uma OC "Atendido" (deveria, na teoria, ter mais chance de estar paga) pra testar o filtro direto na API
  const ocTeste = ocs.find(o => o.Situacao === 'Atendido') || ocs[0];
  console.log(`\nTestando filtro /contas-pagar?id_pedido=${ocTeste.ID_OC} direto na API (OC "${ocTeste.Nome_Fornecedor}", Valor_Total=${ocTeste.Valor_Total})...`);
  try {
    const r = await oppRequest('GET', `/contas-pagar?id_pedido=${ocTeste.ID_OC}&limit=100`);
    const lista = Array.isArray(r) ? r : (r?.data || []);
    console.log(`Retornou ${lista.length} lançamento(s) com esse filtro.`);
    if (lista.length > 0) {
      console.log('\nPrimeiro lançamento completo:');
      console.log(JSON.stringify(lista[0], null, 2));
    } else {
      console.log('\nNenhum lançamento retornado. Testando SEM o filtro id_pedido, pra ver se o campo existe nos lançamentos em geral...');
      const r2 = await oppRequest('GET', `/contas-pagar?limit=10`);
      const lista2 = Array.isArray(r2) ? r2 : (r2?.data || []);
      console.log(`Amostra de ${lista2.length} lançamentos (sem filtro) — olhando se tem campo "id_pedido":`);
      for (const d of lista2.slice(0, 5)) {
        console.log(`  id_conta_pag=${d.id_conta_pag} | id_pedido="${d.id_pedido}" | liquidado_pag="${d.liquidado_pag}" | valor_pago="${d.valor_pago}"`);
      }
    }
  } catch (e) {
    console.log('ERRO:', e.message);
  }

  pool.end();
}

main().catch(e => { console.error('Erro:', e.message); pool.end(); });
