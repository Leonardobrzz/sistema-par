// node backend/diagnosticar-vencimento-nf2.js
//
// Só lê (não grava nada). O primeiro diagnóstico confirmou o problema do
// sufixo (ex.: "503" vs "503 - 1") pra 12 das 17 NFs testadas — já dá pra
// corrigir isso. Mas 5 NFs (503, 428, 524, 361, 511) não acharam NADA, nem
// exato nem composto, usando os últimos 12 meses (listarReceitas). Só que o
// medicoes.js de produção busca SEM limite de data (todas as contas a
// receber, não só 12 meses) — esse script repete a busca por essas 5 do
// mesmo jeito que o medicoes.js faz de verdade, pra confirmar se elas
// existem mas são mais antigas, ou se realmente não foram lançadas ainda no
// Contas a Receber do OPP.

require('dotenv').config({ path: require('path').join(__dirname, '.env') });

const NFS_BARE = ['503', '428', '524', '361', '511'];

async function main() {
  const { oppRequest } = require('./src/services/oppService');
  let offset = 0, todos = [];
  while (true) {
    const r = await oppRequest('GET', `/contas-receber?limit=250&offset=${offset}&lixeira=Nao`);
    const lista = Array.isArray(r) ? r : (r?.data || []);
    if (lista.length === 0) break;
    todos.push(...lista);
    if (lista.length < 250) break;
    offset += 250;
    if (offset > 10000) break;
  }
  console.log(`Total de contas a receber carregadas (SEM limite de data, igual o medicoes.js real): ${todos.length}\n`);

  for (const nfBare of NFS_BARE) {
    const exatos = todos.filter((x) => String(x.n_documento_rec || '').trim() === nfBare);
    const compostos = todos.filter((x) => {
      const doc = String(x.n_documento_rec || '').trim();
      const base = doc.split(/\s*-\s*/)[0].trim();
      return base === nfBare && doc !== nfBare;
    });
    console.log(`NF "${nfBare}": ${exatos.length} exato, ${compostos.length} composto`);
    [...exatos, ...compostos].forEach((x) => console.log(`   → n_documento_rec="${x.n_documento_rec}" vencimento=${x.vencimento_rec} id_conta_rec=${x.id_conta_rec} emissao=${x.data_emissao} cliente=${x.nome_cliente}`));
    if (!exatos.length && !compostos.length) console.log('   (realmente não existe nenhuma conta a receber com esse número no OPP)');
    console.log('');
  }

  process.exit(0);
}

main().catch((e) => { console.error('Erro:', e.message); console.error(e.stack); process.exit(1); });
