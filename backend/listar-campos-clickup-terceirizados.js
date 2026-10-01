// node backend/listar-campos-clickup-terceirizados.js
//
// Só lê a API do ClickUp. Não grava nada.
//
// Hoje o vínculo de projeto em Terceirizados depende só do campo "Local da
// Tarefa no projeto", que quase nunca vem preenchido (só ~2% das tarefas).
// Esse script lista TODOS os campos personalizados que existem nas tarefas
// das 3 listas de Terceirizados (Solicitação, Contratação, Execução &
// Pagamento), e a taxa de preenchimento de cada um — pra ver se existe algum
// outro campo mais confiável pra linkar a tarefa ao projeto certo.

require('dotenv').config({ path: require('path').join(__dirname, '.env') });
const axios = require('axios');
const { getSpaces, getLists } = require('./src/services/clickupService');

const BASE_URL = 'https://api.clickup.com/api/v2';
function getHeaders() { return { Authorization: process.env.CLICKUP_API_TOKEN }; }

async function getFolders(spaceId) {
  const res = await axios.get(`${BASE_URL}/space/${spaceId}/folder?archived=false`, { headers: getHeaders() });
  return res.data.folders || [];
}

async function getTasks(listId) {
  const allTasks = [];
  let page = 0;
  while (true) {
    const res = await axios.get(`${BASE_URL}/list/${listId}/task`, {
      headers: getHeaders(),
      params: { archived: false, include_closed: true, subtasks: true, page },
    });
    const batch = res.data.tasks || [];
    allTasks.push(...batch);
    if (batch.length < 100) break;
    page++;
  }
  return allTasks;
}

async function main() {
  const teamId = process.env.CLICKUP_TEAM_ID;
  const spaces = await getSpaces(teamId);
  const norm = s => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  const gestaoSpace = spaces.find(s => norm(s.name) === 'gestao') || spaces.find(s => norm(s.name).includes('gestao'));
  if (!gestaoSpace) { console.log('Espaço Gestão não encontrado.'); return; }

  const folders = await getFolders(gestaoSpace.id);
  const tercFolder = folders.find(f => f.name?.toLowerCase().includes('terceiriz'));
  if (!tercFolder) { console.log('Pasta Terceirizados não encontrada.'); return; }

  const LISTAS_ALVO = ['solicitação', 'contratação', 'execução', 'execucao', 'pagamento'];
  const allLists = await getLists(tercFolder.id);
  const lists = allLists.filter(l => LISTAS_ALVO.some(kw => l.name?.toLowerCase().includes(kw)));
  console.log(`Listas: ${lists.map(l => l.name).join(', ')}\n`);

  const allTasks = [];
  for (const list of lists) {
    const tasks = await getTasks(list.id);
    allTasks.push(...tasks);
  }
  console.log(`Total de tarefas: ${allTasks.length}\n`);

  // Conta preenchimento de cada campo personalizado existente
  const camposInfo = {}; // nome -> { tipo, preenchidos, total, amostraValores: [] }
  for (const t of allTasks) {
    for (const f of (t.custom_fields || [])) {
      if (!camposInfo[f.name]) camposInfo[f.name] = { tipo: f.type, preenchidos: 0, total: 0, amostra: [] };
      camposInfo[f.name].total++;
      const preenchido = f.value !== null && f.value !== undefined && f.value !== '';
      if (preenchido) {
        camposInfo[f.name].preenchidos++;
        if (camposInfo[f.name].amostra.length < 5) {
          let v = f.value;
          if (Array.isArray(v)) v = JSON.stringify(v).slice(0, 150);
          else if (typeof v === 'object') v = JSON.stringify(v).slice(0, 150);
          camposInfo[f.name].amostra.push(v);
        }
      }
    }
  }

  console.log('=== Campos personalizados encontrados (ordenado por taxa de preenchimento) ===\n');
  const ordenado = Object.entries(camposInfo).sort((a, b) => (b[1].preenchidos / b[1].total) - (a[1].preenchidos / a[1].total));
  for (const [nome, info] of ordenado) {
    const pct = ((info.preenchidos / info.total) * 100).toFixed(1);
    console.log(`"${nome}" (tipo: ${info.tipo}) — preenchido em ${info.preenchidos}/${info.total} (${pct}%)`);
    console.log(`  Amostra: ${info.amostra.map(v => `"${v}"`).join(' | ')}`);
  }

  // Também mostra se as tarefas têm "linked_tasks" ou "parent" que poderiam apontar pro projeto
  const comLinkedTasks = allTasks.filter(t => t.linked_tasks && t.linked_tasks.length > 0);
  const comParent = allTasks.filter(t => t.parent);
  console.log(`\nTarefas com linked_tasks preenchido: ${comLinkedTasks.length}`);
  console.log(`Tarefas com parent (subtarefa de outra): ${comParent.length}`);
  if (comLinkedTasks.length > 0) {
    console.log('Amostra de linked_tasks:', JSON.stringify(comLinkedTasks[0].linked_tasks).slice(0, 300));
  }
}

main().catch(e => { console.error('Erro:', e.message); console.error(e.stack); });
