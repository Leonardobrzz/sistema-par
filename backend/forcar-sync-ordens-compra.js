// node backend/forcar-sync-ordens-compra.js
//
// Aplica a migração que faltava (coluna Valor_Liquidado) e roda o sync de
// Ordens de Compra uma vez, na hora — sem precisar reiniciar o servidor nem
// esperar o próximo ciclo do cron (que só roda nas horas pares).

require('dotenv').config({ path: require('path').join(__dirname, '.env') });

async function main() {
  const db = require('./src/services/postgresService');
  const { syncOrdensCompra } = require('./src/services/oppService');

  console.log('Aplicando migrações do banco (inclui a coluna Valor_Liquidado que faltava)...');
  await db.initialize();
  await db.ensureSheetsExist();
  console.log('Migrações aplicadas.\n');

  console.log('Rodando sync de Ordens de Compra...');
  await syncOrdensCompra(db);

  const ocs = await db.readSheet('OrdensCompra_OPP');
  console.log(`\nOrdensCompra_OPP agora tem ${ocs.length} registro(s).`);
  if (ocs.length > 0) {
    console.log('\nAmostra (5 primeiras):');
    for (const oc of ocs.slice(0, 5)) {
      console.log(`  ID_OC="${oc.ID_OC}" | Fornecedor="${oc.Nome_Fornecedor}" | Valor_Total="${oc.Valor_Total}" | Valor_Liquidado="${oc.Valor_Liquidado}"`);
    }
  }
  process.exit(0);
}

main().catch(e => { console.error('Erro:', e.message); console.error(e.stack); process.exit(1); });
