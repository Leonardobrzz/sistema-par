// node backend/checar-listas-terceirizados.js
//
// Só lê. Mostra TODAS as listas que existem dentro da pasta "Terceirizados"
// no ClickUp (não só as 3-4 que o sync hoje considera), pra ver se tem
// alguma lista de "Concluído"/"Entregue"/"Finalizado" que o filtro atual
// (LISTAS_ALVO = solicitação/contratação/execução/pagamento) está deixando
// de fora. Se existir, qualquer tarefa que foi concluída e movida pra lá
// está sendo marcada "Cancelado" por engano no sync.

require('dotenv').config({ path: require('path').join(__dirname, '.env') });

async function main() {
  const axios = require('axios');
  const clickup = require('./src/services/clickupService');
  const db = require('./src/services/postgresService');

  const BASE_URL = 'https://api.clickup.com/api/v2';
  const headers = { Authorization: process.env.CLICKUP_API_TOKEN };
  const teamId = process.env.CLICKUP_TEAM_ID;

  let gestaoSpaceId = process.env.CLICKUP_GESTAO_SPACE_ID;
  if (!gestaoSpaceId) {
    const spaces = await clickup.getSpaces(teamId);
    const norm = s => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
    const gestaoSpace = spaces.find(s => norm(s.name) === 'gestao') || spaces.find(s => norm(s.name).includes('gestao'));
    gestaoSpaceId = gestaoSpace.id;
  }

  const foldersRes = await axios.get(`${BASE_URL}/space/${gestaoSpaceId}/folder?archived=false`, { headers });
  const folders = foldersRes.data.folders || [];
  const tercFolder = folders.find(f => f.name?.toLowerCase().includes('terceiriz'));

  const allLists = await clickup.getLists(tercFolder.id);
  console.log(`Todas as listas dentro da pasta "${tercFolder.name}":\n`);
  allLists.forEach(l => console.log(`  "${l.name}"  (${l.task_count ?? '?'} tarefas, id=${l.id})`));

  // Também testa se existem listas ARQUIVADAS (archived=true) com tarefas antigas
  const foldersArquivadosRes = await axios.get(`${BASE_URL}/space/${gestaoSpaceId}/folder?archived=true`, { headers }).catch(() => null);
  if (foldersArquivadosRes) {
    const tercFolderArq = (foldersArquivadosRes.data.folders || []).find(f => f.name?.toLowerCase().includes('terceiriz'));
    if (tercFolderArq) console.log(`\n⚠ Existe uma pasta "Terceirizados" ARQUIVADA também: ${tercFolderArq.name} (${tercFolderArq.id})`);
  }
  const listasArquivadasRes = await axios.get(`${BASE_URL}/folder/${tercFolder.id}/list?archived=true`, { headers }).catch(() => null);
  if (listasArquivadasRes) {
    const listasArq = listasArquivadasRes.data.lists || [];
    if (listasArq.length > 0) {
      console.log(`\nListas ARQUIVADAS dentro da pasta "${tercFolder.name}":`);
      listasArq.forEach(l => console.log(`  "${l.name}"  (${l.task_count ?? '?'} tarefas, id=${l.id})`));
    } else {
      console.log('\nNenhuma lista arquivada encontrada dentro da pasta.');
    }
  }

  // Amostra: de onde vieram os registros "Cancelado"? Olha o Etapa_ClickUp
  // gravado da última vez que cada um foi sincronizado de verdade.
  const existentes = await db.readSheet('Terceirizados');
  const cancelados = existentes.filter(r => r.Status === 'Cancelado');
  const porEtapa = {};
  for (const r of cancelados) {
    const et = r.Etapa_ClickUp || '(vazio)';
    porEtapa[et] = (porEtapa[et] || 0) + 1;
  }
  console.log(`\nDos ${cancelados.length} marcados "Cancelado", de qual etapa/lista eles vieram da última vez que foram vistos no ClickUp:`);
  Object.entries(porEtapa).sort((a, b) => b[1] - a[1]).forEach(([et, n]) => console.log(`  "${et}": ${n}`));

  // Datas: quando foram criados/vistos pela última vez
  const comData = cancelados.filter(r => r.Criado_Em).map(r => r.Criado_Em).sort();
  if (comData.length > 0) {
    console.log(`\nData de criação do registro mais antigo marcado Cancelado: ${comData[0]}`);
    console.log(`Data de criação do registro mais recente marcado Cancelado: ${comData[comData.length - 1]}`);
  }

  process.exit(0);
}

main().catch(e => { console.error('Erro:', e.message); console.error(e.stack); process.exit(1); });
