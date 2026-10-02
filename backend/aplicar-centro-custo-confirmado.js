// Modo seguro por padrão: node backend/aplicar-centro-custo-confirmado.js
// Gravar de verdade:        node backend/aplicar-centro-custo-confirmado.js --apply
//
// Dos 8 vínculos confirmados pelo chef na planilha de revisão, 7 já estavam
// gravados no Planejamento (só não apareciam nas telas porque o Planejamento
// desses projetos não está "Aprovado"/"Pendente Aprovação" — decisão: deixar
// como está por enquanto, sem mexer na regra das telas). Só o
// SAN-2025-01-AMP. SAA SEDE estava realmente vazio (Planejamento em
// "Rascunho"). Esse script grava só esse, direto nesse Planejamento em
// Rascunho mesmo (é o único que existe pra esse projeto) — não reescreve os
// outros 7, que já estão certos.

require('dotenv').config({ path: require('path').join(__dirname, '.env') });

const APLICAR = process.argv.includes('--apply');

const CONFIRMADOS = [
  { nome: 'SAN-2025-01-AMP. SAA SEDE', ccId: '224810', obs: '' },
];

async function main() {
  const db = require('./src/services/postgresService');

  const [projetos, planejamentos] = await Promise.all([
    db.readSheet('Projetos_Contratos'),
    db.readSheet('Planejamentos'),
  ]);

  const projPorNome = Object.fromEntries(projetos.map(p => [p.Nome, p]));

  console.log(APLICAR ? '=== Gravando no banco ===\n' : '=== Modo de conferência (nada será gravado — rode com --apply pra gravar) ===\n');

  let aplicados = 0, pulados = 0;

  for (const item of CONFIRMADOS) {
    const proj = projPorNome[item.nome];
    if (!proj) {
      console.log(`❌ Projeto não encontrado em Projetos_Contratos: "${item.nome}"`);
      pulados++;
      continue;
    }

    const plan = planejamentos.find(p => p.ID_Projeto === proj.ID_Projeto);
    if (!plan) {
      console.log(`❌ Nenhum Planejamento encontrado pro projeto "${item.nome}" (ID_Projeto=${proj.ID_Projeto})`);
      pulados++;
      continue;
    }

    const atual = plan.ID_Centro_Custo_OPP || '(vazio)';
    console.log(`${item.nome}`);
    console.log(`   ID_Projeto=${proj.ID_Projeto} | Planejamento ID=${plan.ID}`);
    console.log(`   ID_Centro_Custo_OPP: ${atual} → ${item.ccId}${item.obs ? '  ⚠ ' + item.obs : ''}`);

    if (APLICAR) {
      await db.updateRowById('Planejamentos', 'ID', plan.ID, { ...plan, ID_Centro_Custo_OPP: item.ccId });
      console.log('   ✅ gravado');
    }
    console.log('');
    aplicados++;
  }

  console.log(`\nTotal: ${aplicados} ${APLICAR ? 'gravados' : 'prontos pra gravar'}, ${pulados} pulados (não encontrados).`);
  if (!APLICAR && aplicados > 0) {
    console.log('\nConferiu e tá tudo certo? Roda de novo com --apply pra gravar de verdade:');
    console.log('  node backend/aplicar-centro-custo-confirmado.js --apply');
  }

  process.exit(0);
}

main().catch(e => { console.error('Erro:', e.message); console.error(e.stack); process.exit(1); });
