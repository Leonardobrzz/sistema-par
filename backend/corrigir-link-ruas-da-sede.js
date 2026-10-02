// Modo seguro por padrão: node backend/corrigir-link-ruas-da-sede.js
// Gravar de verdade:        node backend/corrigir-link-ruas-da-sede.js --apply
//
// O projeto "INF-2026-7.LEVANTAMENTO TOPOGRÁFICO EM RUAS DA SEDE" (Apuiarés,
// contrato R$ 28.980,00) está vinculado ao CC #228131 "INF NOVA MAMORÉ
// LEVANTAMENTO TOPOGRÁFICO" — outro cliente (Rondônia), nada a ver com
// Apuiarés. É por isso que a tela mostrava R$ 171.140,00 recebido: esse
// dinheiro é de Nova Mamoré, não desse projeto.
//
// O CC certo parece ser o #237093 "INF APUIARES LEV. TOP. RUAS DA SEDE" —
// nome bate com o projeto e o cliente, e o valor movimentado nos últimos 18
// meses (R$ 28.980,00) é idêntico ao valor do contrato no Par. Esse script
// corrige só esse vínculo.

require('dotenv').config({ path: require('path').join(__dirname, '.env') });

const APLICAR = process.argv.includes('--apply');

const CORRECAO = { nome: 'INF-2026-7.LEVANTAMENTO TOPOGRÁFICO EM RUAS DA SEDE', ccIdEsperado: '228131', ccIdCorreto: '237093' };

async function main() {
  const db = require('./src/services/postgresService');

  const [projetos, planejamentos] = await Promise.all([
    db.readSheet('Projetos_Contratos'),
    db.readSheet('Planejamentos'),
  ]);

  const proj = projetos.find(p => p.Nome === CORRECAO.nome);
  if (!proj) { console.log(`❌ Projeto não encontrado: "${CORRECAO.nome}"`); process.exit(1); }

  const plan = planejamentos.find(p => p.ID_Projeto === proj.ID_Projeto);
  if (!plan) { console.log(`❌ Nenhum Planejamento encontrado pro projeto (ID_Projeto=${proj.ID_Projeto})`); process.exit(1); }

  const atual = plan.ID_Centro_Custo_OPP || '(vazio)';
  console.log(APLICAR ? '=== Gravando no banco ===\n' : '=== Modo de conferência (nada será gravado — rode com --apply pra gravar) ===\n');
  console.log(`${CORRECAO.nome}`);
  console.log(`   ID_Projeto=${proj.ID_Projeto} | Planejamento ID=${plan.ID}`);
  console.log(`   ID_Centro_Custo_OPP atual: ${atual}`);
  if (atual !== CORRECAO.ccIdEsperado) {
    console.log(`   ⚠ Aviso: esperava encontrar "${CORRECAO.ccIdEsperado}" gravado, mas achei "${atual}". Confira antes de aplicar.`);
  }
  console.log(`   ID_Centro_Custo_OPP novo: ${CORRECAO.ccIdCorreto}`);

  if (APLICAR) {
    await db.updateRowById('Planejamentos', 'ID', plan.ID, { ...plan, ID_Centro_Custo_OPP: CORRECAO.ccIdCorreto });
    console.log('   ✅ gravado');
  } else {
    console.log('\nConferiu e tá tudo certo? Roda de novo com --apply pra gravar de verdade:');
    console.log('  node backend/corrigir-link-ruas-da-sede.js --apply');
  }

  process.exit(0);
}

main().catch(e => { console.error('Erro:', e.message); console.error(e.stack); process.exit(1); });
