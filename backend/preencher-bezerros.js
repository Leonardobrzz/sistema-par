// node backend/preencher-bezerros.js
//
// Preenche o ID_OPP_Cliente do projeto de drenagem urbana de Bezerros-PE,
// confirmado direto na conta a receber real (NF 119, id_cliente=41793058,
// "SECRETARIA DE EDUCACAO BEZERROS") — não é mais por nome parecido, é o
// vínculo de verdade que já existe no OPP.

require('dotenv').config({ path: require('path').join(__dirname, '.env') });

const ID_PROJETO = 'a735b236-7828-4fbf-85e7-6d5314d207f4'; // INF-2026-01 - DRENAGEM URBANA GAMELEIRA (BEZERROS-PE)
const ID_OPP_CLIENTE = '41793058';

async function main() {
  const db = require('./src/services/postgresService');

  const atual = await db.findOne('Projetos_Contratos', (p) => p.ID_Projeto === ID_PROJETO);
  if (!atual) { console.log('Não achei o projeto — abortei sem gravar nada.'); process.exit(1); }
  console.log(`Projeto: ${atual.Nome}`);
  console.log(`ID_OPP_Cliente atual: "${atual.ID_OPP_Cliente || '(vazio)'}"`);
  if (atual.ID_OPP_Cliente && String(atual.ID_OPP_Cliente).trim()) {
    console.log('Já tem valor — não sobrescrevi.');
    process.exit(0);
  }

  await db.updateRowById('Projetos_Contratos', 'ID_Projeto', ID_PROJETO, { ID_OPP_Cliente: ID_OPP_CLIENTE });

  const depois = await db.findOne('Projetos_Contratos', (p) => p.ID_Projeto === ID_PROJETO);
  console.log(`[OK] ID_OPP_Cliente agora = "${depois.ID_OPP_Cliente}"`);
  process.exit(0);
}

main().catch((e) => { console.error('Erro:', e.message); console.error(e.stack); process.exit(1); });
