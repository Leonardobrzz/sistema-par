// node backend/checar-linked-tasks.js
//
// Só lê a API do ClickUp. Não grava nada.
//
// "linked_tasks" apareceu em 50 de 102 tarefas de Terceirizados — cada uma
// aponta (task_id) pra outra tarefa em algum lugar do ClickUp. A hipótese é
// que essa tarefa ligada esteja dentro da lista do projeto de verdade (a
// mesma lista cujo ID fica salvo em Projetos_Contratos.ID_ClickUp). Esse
// script busca o detalhe de algumas dessas tarefas ligadas pra confirmar.

require('dotenv').config({ path: require('path').join(__dirname, '.env') });
const axios = require('axios');
const { Pool } = require('pg');
const { getSpaces, getLists } = require('./src/services/clickupService');

const BASE_URL = 'https://api.clickup.com/api/v2';
function getHeaders() { return { Authorization: process.env.CLICKUP_API_TOKEN }; }

async function getFolders(spaceId) {
  const res = await axios.get(`${BASE_URL}/space/${spaceId}/folder?archived=false`, { headers: getHeaders() });
  return res.data.folders || [];
}
async function getTasks(listId) {
  const all = [];
  let page = 0;
  while (true) {
    const res = await axios.get(`${BASE_URL}/list/${listId}/task`, { headers: getHeaders(), params: { archived: false, include_closed: true, subtasks: true, page } });
    const batch = res.data.tasks || [];
    all.push(...batch);
    if (batch.length < 100) break;
    page++;
  }
  return all;
}
async function getTaskDetail(taskId) {
  const res = await axios.get(`${BASE_URL}/task/${taskId}`, { headers: getHeaders() });
  return res.data;
}

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://postgres.xklllcoqkreobaghdivw:402814Leo%4023@aws-1-us-east-1.pooler.supabase.com:5432/postgres',
  ssl: { rejectUnauthorized: false },
});

async function main() {
  const { rows: projetos } = await pool.query(`SELECT "ID_Projeto", "Nome", "ID_ClickUp" FROM "Projetos_Contratos" WHERE "ID_ClickUp" IS NOT NULL AND "ID_ClickUp" != ''`);
  const projByClickUpList = Object.fromEntries(projetos.map(p => [String(p.ID_ClickUp), p]));
  console.log(`Projetos com ID_ClickUp cadastrado: ${projetos.length}\n`);

  const teamId = process.env.CLICKUP_TEAM_ID;
  const spaces = await getSpaces(teamId);
  const norm = s => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  const gestaoSpace = spaces.find(s => norm(s.name) === 'gestao') || spaces.find(s => norm(s.name).includes('gestao'));
  const folders = await getFolders(gestaoSpace.id);
  const tercFolder = folders.find(f => f.name?.toLowerCase().includes('terceiriz'));
  const LISTAS_ALVO = ['solicitação', 'contratação', 'execução', 'execucao', 'pagamento'];
  const allLists = await getLists(tercFolder.id);
  const lists = allLists.filter(l => LISTAS_ALVO.some(kw => l.name?.toLowerCase().includes(kw)));

  const allTasks = [];
  for (const list of lists) allTasks.push(...(await getTasks(list.id)));

  const comLink = allTasks.filter(t => t.linked_tasks && t.linked_tasks.length > 0);
  console.log(`Tarefas com linked_tasks: ${comLink.length} de ${allTasks.length}\n`);

  let bateuComProjeto = 0, naoBateu = 0, erro = 0;
  const amostraDetalhada = [];
  for (const t of comLink.slice(0, 20)) {
    const linkedId = t.linked_tasks[0].task_id;
    try {
      const detalhe = await getTaskDetail(linkedId);
      const listId = detalhe.list?.id;
      const folderId = detalhe.folder?.id;
      const projMatch = projByClickUpList[listId] || projByClickUpList[folderId];
      if (projMatch) {
        bateuComProjeto++;
        amostraDetalhada.push(`  OK: Tarefa "${t.name}" -> linked task "${detalhe.name}" (lista "${detalhe.list?.name}") -> projeto PAR: "${projMatch.Nome}"`);
      } else {
        naoBateu++;
        amostraDetalhada.push(`  SEM MATCH: Tarefa "${t.name}" -> linked task "${detalhe.name}" (lista "${detalhe.list?.name}", list_id=${listId}, folder_id=${folderId}) — não achei esse list_id/folder_id em nenhum Projetos_Contratos.ID_ClickUp`);
      }
    } catch (e) {
      erro++;
      amostraDetalhada.push(`  ERRO ao buscar linked task ${linkedId}: ${e.message}`);
    }
  }

  console.log('=== Resultado (amostra de até 20 tarefas com linked_tasks) ===');
  for (const linha of amostraDetalhada) console.log(linha);
  console.log(`\nResumo da amostra: ${bateuComProjeto} bateram com projeto real, ${naoBateu} não bateram, ${erro} deram erro.`);

  pool.end();
}

main().catch(e => { console.error('Erro:', e.message); console.error(e.stack); pool.end(); });
