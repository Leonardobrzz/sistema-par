// node backend/diagnostico-planejamento-status.js
//
// Só lê. Pra cada um dos 6 projetos que o script anterior não achou
// Planejamento "Aprovado"/"Pendente Aprovação", mostra TODOS os
// Planejamentos existentes pra esse ID_Projeto (qualquer status), ou confirma
// que não existe nenhum.

require('dotenv').config({ path: require('path').join(__dirname, '.env') });

const NOMES = [
  'SAN-2025-01-AMP. SAA SEDE',
  'ARQ-2025-2-UNIDADE DE AGROINDUSTRIA-4-GRUPO 4_3. 1. ABATEDOURO FRIGORÍFICO DE CAPRINOS E OVINOS',
  'ARQ-2026-1-URBANIZAÇÃO DO CANAL DO AMBRÓSIO',
  'SAN-20-SAA LAFAIETE COUTINHO',
  'ARQ-2025-2-UNIDADE DE AGROINDUSTRIA-1-GRUPO 1-2. UNIDADE DE BENEFICIAMENTO DE FRUTAS',
  'ARQ-2026-1-AGÊNCIA DE CORREIOS DE CHAVES',
];

async function main() {
  const db = require('./src/services/postgresService');

  const [projetos, planejamentos] = await Promise.all([
    db.readSheet('Projetos_Contratos'),
    db.readSheet('Planejamentos'),
  ]);

  const projPorNome = Object.fromEntries(projetos.map(p => [p.Nome, p]));

  for (const nome of NOMES) {
    const proj = projPorNome[nome];
    console.log(`\n${nome}`);
    if (!proj) { console.log('   ❌ Nem o projeto existe em Projetos_Contratos.'); continue; }
    console.log(`   ID_Projeto=${proj.ID_Projeto} | Status do projeto: ${proj.Status}`);

    const plans = planejamentos.filter(p => p.ID_Projeto === proj.ID_Projeto);
    if (plans.length === 0) {
      console.log('   → Nenhum Planejamento cadastrado pra esse projeto (nenhum, de nenhum status).');
    } else {
      plans.forEach(p => console.log(`   → Planejamento ID=${p.ID} | Status="${p.Status}" | ID_Centro_Custo_OPP=${p.ID_Centro_Custo_OPP || '(vazio)'}`));
    }
  }

  process.exit(0);
}

main().catch(e => { console.error('Erro:', e.message); console.error(e.stack); process.exit(1); });
