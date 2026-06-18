/**
 * Script one-shot: popula o campo Responsavel em Projetos_Contratos
 * buscando assignees de cada lista ativa no ClickUp.
 * Roda com: node scripts/sync-responsaveis.js
 */
require('dotenv').config();
const path = require('path');
const db = require(path.join(__dirname, '../src/services/googleSheetsService'));

const TOKEN = process.env.CLICKUP_API_TOKEN;

async function fetchTasks(listId) {
  const url = `https://api.clickup.com/api/v2/list/${listId}/task?include_closed=false&fields=assignees&limit=100`;
  const r = await fetch(url, { headers: { Authorization: TOKEN } });
  if (!r.ok) return [];
  const d = await r.json();
  return d.tasks || [];
}

const sleep = (ms) => new Promise(res => setTimeout(res, ms));

async function main() {
  const projetos = await db.readSheet('Projetos_Contratos');
  const ativos = projetos.filter(p =>
    p.ID_ClickUp &&
    p.Status &&
    !['Concluído', 'Cancelado', 'Arquivado'].includes(p.Status)
  );

  console.log(`[Sync] ${ativos.length} projetos ativos para verificar responsáveis`);

  let atualizados = 0;
  for (let i = 0; i < ativos.length; i++) {
    const p = ativos[i];
    try {
      const tasks = await fetchTasks(p.ID_ClickUp);
      const responsaveisSet = new Set();
      for (const t of tasks) {
        for (const a of (t.assignees || [])) {
          if (a.username) responsaveisSet.add(a.username);
        }
      }
      const responsavel = [...responsaveisSet].join(', ');
      const atual = p.Responsavel || '';
      if (responsavel !== atual) {
        await db.updateRowById('Projetos_Contratos', 'ID_Projeto', p.ID_Projeto, {
          ...p,
          Responsavel: responsavel,
          Atualizado_Em: new Date().toISOString(),
        });
        atualizados++;
        console.log(`[${i+1}/${ativos.length}] "${p.Nome}" → ${responsavel || '(sem)'}`);
      } else {
        process.stdout.write(`\r[${i+1}/${ativos.length}] sem mudança...`);
      }
    } catch (err) {
      console.error(`\n[ERRO] ${p.Nome}: ${err.message}`);
    }
    await sleep(300);
  }

  console.log(`\n[Sync] Concluído. ${atualizados} projetos atualizados.`);
}

main().catch(console.error);
