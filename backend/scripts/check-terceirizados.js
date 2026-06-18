require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const db = require('../src/services/postgresService');

async function check() {
  await db.initialize();
  const tercs = await db.readSheet('Terceirizados');
  console.log('Total:', tercs.length);
  console.log('\nAmostra:');
  tercs.slice(0, 3).forEach(t => console.log(JSON.stringify(t, null, 2)));

  const semProjeto = tercs.filter(t => !t.ID_Projeto);
  const semServico = tercs.filter(t => !t.Servico);
  console.log(`\nSem ID_Projeto: ${semProjeto.length}`);
  console.log(`Sem Serviço: ${semServico.length}`);
}

check().catch(console.error);
