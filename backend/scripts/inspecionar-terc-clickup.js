require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const axios = require('axios');
const db = require('../src/services/postgresService');

const TOKEN = process.env.CLICKUP_API_TOKEN;
const BASE  = 'https://api.clickup.com/api/v2';

async function run() {
  await db.initialize();
  const tercs = await db.readSheet('Terceirizados');

  for (const t of tercs.slice(0, 3)) {
    if (!t.ID_Tarefa_ClickUp) continue;
    const r = await axios.get(`${BASE}/task/${t.ID_Tarefa_ClickUp}`, { headers: { Authorization: TOKEN } });
    const task = r.data;
    console.log('=== Serviço:', t.Servico?.slice(0, 60));
    console.log('    Lista:', task.list?.name, '| Pasta:', task.folder?.name);
    console.log('    Space:', task.space?.id);
    const cfs = (task.custom_fields || []).filter(f => f.value !== null && f.value !== undefined && f.value !== '');
    console.log('    Custom fields com valor:', cfs.map(f => `${f.name}=${JSON.stringify(f.value)}`).join(' | '));
    console.log('');
    await new Promise(r => setTimeout(r, 300));
  }
}

run().catch(console.error);
