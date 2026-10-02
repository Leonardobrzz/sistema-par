// node backend/diagnostico-terceirizados-cancelado.js
//
// Só lê (ClickUp + banco). Não grava nada.
//
// Investiga por que a aba "Demandas de Terceirização" mostra 2021 de 2123
// como "Cancelado". Hipótese: o sync do ClickUp (syncTerceirizadosClickUp,
// em clickupService.js) tem um bug de paginação — chama getTasks(list.id, page)
// mas getTasks() já pagina sozinho e ignora esse segundo argumento, então pra
// qualquer lista com 100+ tarefas, a função interna já devolve TODAS de uma
// vez, e o "if (tasks.length < 100) break" nunca é verdadeiro -> o loop
// externo não para direito. Se isso travar/der erro no meio de uma lista
// grande, "allTasks" fica incompleto, e qualquer tarefa que não entrou nessa
// leva é marcada "Cancelado" pra sempre (e o código nunca desfaz isso depois,
// mesmo que a tarefa reapareça num sync completo).
//
// Esse script refaz a busca CERTA (sem o bug) e compara com o que está
// gravado como "Cancelado" hoje, pra confirmar quantos são cancelamento de
// verdade vs. vítima do bug.

require('dotenv').config({ path: require('path').join(__dirname, '.env') });

async function main() {
  const axios = require('axios');
  const clickup = require('./src/services/clickupService');
  const db = require('./src/services/postgresService');

  const BASE_URL = 'https://api.clickup.com/api/v2';
  const headers = { Authorization: process.env.CLICKUP_API_TOKEN };

  const teamId = process.env.CLICKUP_TEAM_ID;
  if (!teamId) { console.log('❌ CLICKUP_TEAM_ID não configurado no .env'); process.exit(1); }

  let gestaoSpaceId = process.env.CLICKUP_GESTAO_SPACE_ID;
  if (!gestaoSpaceId) {
    const spaces = await clickup.getSpaces(teamId);
    const norm = s => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
    const gestaoSpace = spaces.find(s => norm(s.name) === 'gestao') || spaces.find(s => norm(s.name).includes('gestao'));
    if (!gestaoSpace) { console.log('❌ Espaço "Gestão" não encontrado no ClickUp.'); process.exit(1); }
    gestaoSpaceId = gestaoSpace.id;
  }
  console.log(`Espaço Gestão: ${gestaoSpaceId}\n`);

  const foldersRes = await axios.get(`${BASE_URL}/space/${gestaoSpaceId}/folder?archived=false`, { headers });
  const folders = foldersRes.data.folders || [];
  const tercFolder = folders.find(f => f.name?.toLowerCase().includes('terceiriz'));
  if (!tercFolder) { console.log('❌ Pasta Terceirizados não encontrada.'); process.exit(1); }
  console.log(`Pasta Terceirizados: ${tercFolder.name} (${tercFolder.id})\n`);

  const LISTAS_ALVO = ['solicitação', 'contratação', 'execução', 'execucao', 'pagamento'];
  const allLists = await clickup.getLists(tercFolder.id);
  const lists = allLists.filter(l => LISTAS_ALVO.some(kw => l.name?.toLowerCase().includes(kw)));
  console.log(`Listas-alvo encontradas: ${lists.map(l => `${l.name} (${l.task_count ?? '?'} tarefas)`).join(', ')}\n`);

  console.log('Buscando todas as tarefas de cada lista (do jeito certo, sem duplicar)...\n');
  const allTasks = [];
  for (const list of lists) {
    const tasks = await clickup.getTasks(list.id); // getTasks já pagina sozinho até trazer tudo
    tasks.forEach(t => { t._listName = list.name; });
    allTasks.push(...tasks);
    console.log(`  ${list.name}: ${tasks.length} tarefas`);
  }
  console.log(`\nTotal de tarefas ativas encontradas no ClickUp agora: ${allTasks.length}`);

  const taskIdsAlvo = new Set(allTasks.map(t => t.id));

  const existentes = await db.readSheet('Terceirizados');
  const cancelados = existentes.filter(r => r.Status === 'Cancelado');
  console.log(`\nTotal de registros em Terceirizados: ${existentes.length}`);
  console.log(`Marcados "Cancelado" hoje: ${cancelados.length}`);

  let falsosCancelados = 0, semTarefaDeFato = 0, semIdTarefa = 0;
  const amostraFalsos = [];
  for (const r of cancelados) {
    if (!r.ID_Tarefa_ClickUp) { semIdTarefa++; continue; }
    if (taskIdsAlvo.has(r.ID_Tarefa_ClickUp)) {
      falsosCancelados++;
      if (amostraFalsos.length < 15) amostraFalsos.push(r);
    } else {
      semTarefaDeFato++;
    }
  }

  console.log(`\n  Têm uma tarefa VIVA no ClickUp agora, nas listas certas (ou seja, foram cancelados por ENGANO pelo bug): ${falsosCancelados}`);
  console.log(`  Não têm tarefa correspondente nas listas-alvo (cancelamento real ou tarefa movida/excluída): ${semTarefaDeFato}`);
  console.log(`  Não têm ID_Tarefa_ClickUp registrado (não dá pra checar): ${semIdTarefa}`);

  console.log('\nAmostra de registros cancelados por engano (tarefa existe e está ativa agora):');
  for (const r of amostraFalsos) {
    const taskAtual = allTasks.find(t => t.id === r.ID_Tarefa_ClickUp);
    console.log(`  "${r.Servico || r.ID}" | lista atual no ClickUp: "${taskAtual?._listName}" | status ClickUp: "${taskAtual?.status?.status}"`);
  }

  process.exit(0);
}

main().catch(e => { console.error('Erro:', e.message); console.error(e.stack); process.exit(1); });
