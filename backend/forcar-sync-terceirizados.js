// node backend/forcar-sync-terceirizados.js
//
// Roda o sync de Terceirizados do ClickUp agora, sem esperar o cron (que roda
// a cada 15 min) nem precisar reiniciar o servidor. Já usa o vínculo novo via
// linked_tasks.

require('dotenv').config({ path: require('path').join(__dirname, '.env') });

async function main() {
  const { syncTerceirizadosClickUp } = require('./src/services/clickupService');
  console.log('Rodando sync de Terceirizados...');
  const total = await syncTerceirizadosClickUp();
  console.log(`\nSync concluído. Total de tarefas processadas: ${total}`);

  const db = require('./src/services/postgresService');
  const terc = await db.readSheet('Terceirizados');
  const ativos = terc.filter(t => t.Status !== 'Cancelado');
  const comProjeto = ativos.filter(t => t.ID_Projeto);
  console.log(`\nTerceirizados ativos: ${ativos.length}`);
  console.log(`Com ID_Projeto preenchido agora: ${comProjeto.length} (${((comProjeto.length / ativos.length) * 100).toFixed(1)}%)`);
  process.exit(0);
}

main().catch(e => { console.error('Erro:', e.message); console.error(e.stack); process.exit(1); });
