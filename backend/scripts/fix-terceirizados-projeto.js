require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const axios = require('axios');
const db = require('../src/services/postgresService');

const TOKEN = process.env.CLICKUP_API_TOKEN;
const BASE  = 'https://api.clickup.com/api/v2';

async function run() {
  await db.initialize();

  const tercs    = await db.readSheet('Terceirizados');
  const projetos = await db.readSheet('Projetos_Contratos');
  const projetoByClickUp = {};
  for (const p of projetos) if (p.ID_ClickUp) projetoByClickUp[p.ID_ClickUp] = p;

  let vinculados = 0, semMatch = 0;

  for (const t of tercs) {
    if (!t.ID_Tarefa_ClickUp) continue;

    try {
      const r    = await axios.get(`${BASE}/task/${t.ID_Tarefa_ClickUp}`, { headers: { Authorization: TOKEN } });
      const task = r.data;

      // Extrai list ID do campo "Local da Tarefa no projeto"
      const localField = (task.custom_fields || []).find(f => f.name === 'Local da Tarefa no projeto');
      const url = localField?.value || '';
      const matchUrl = url.match(/\/li\/(\d+)/);
      const listId = matchUrl ? matchUrl[1] : task.list?.id;

      const proj = listId ? projetoByClickUp[listId] : null;

      if (proj) {
        await db.updateRowById('Terceirizados', 'ID', t.ID, { ...t, ID_Projeto: proj.ID_Projeto });
        console.log(`✅ "${t.Servico?.slice(0,50)}" → ${proj.Nome?.slice(0,50)}`);
        vinculados++;
      } else {
        console.log(`❌ Sem match: "${t.Servico?.slice(0,50)}" | listId: ${listId}`);
        semMatch++;
      }

      await new Promise(r => setTimeout(r, 300));
    } catch (e) {
      console.log(`⚠️  Erro ${t.ID_Tarefa_ClickUp}: ${e.message}`);
    }
  }

  console.log(`\nConcluído: ${vinculados} vinculados, ${semMatch} sem match.`);
}

run().catch(console.error);
