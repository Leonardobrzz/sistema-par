// node backend/corrigir-os-solonopole.js [--apply]
//
// Corrige o vínculo de O.S. do projeto "ARQ-2025-4-URBANIZAÇÃO DO CAMPO
// MONTE CASTELO" (Solonópole). Hoje o campo Nr_OS_OPP desse Planejamento
// está "49,50,65", mas já confirmamos (lendo a Referência de cada O.S.
// direto no OPP, via OrdensServico_OPP sincronizada):
//   - O.S. 49: "31ª MEDIÇÃO - NF 361 - SEINFRA" — bate com a etapa
//     "Projeto Executivo" (R$ 77.785,12). Pertence mesmo a este projeto.
//   - O.S. 50: "11ª MEDIÇÃO - NF 371 - SEDUC" — SEDUC é Secretaria de
//     Educação, outro contrato, nada a ver com urbanização/SEINFRA.
//   - O.S. 65: "NF 400" — sem pista de secretaria, mas no mesmo grupo
//     suspeito da 50, então tira também por segurança.
//
// Hoje não existe nenhum outro projeto no Par com cronograma batendo no
// valor dessas duas O.S. — ou seja, não tem pra onde mover a 50/65 ainda.
// Esse script só REMOVE elas do Nr_OS_OPP deste projeto (deixando só a
// "49", que é a única confirmada). Não apaga nada do OPP, só corrige o
// campo de vínculo aqui no Par.

require('dotenv').config({ path: require('path').join(__dirname, '.env') });
const APPLY = process.argv.includes('--apply');

const ID_PLANEJAMENTO = '8c6a4e0b-49c4-4265-8518-3c7a13297e36';
const NR_OS_OPP_ANTIGO = '49,50,65';
const NR_OS_OPP_NOVO = '49';

async function main() {
  const db = require('./src/services/postgresService');
  const planejamentos = await db.readSheet('Planejamentos');
  const plan = planejamentos.find((p) => p.ID === ID_PLANEJAMENTO);

  if (!plan) {
    console.log('Não achei o Planejamento pelo ID esperado — abortando sem mexer em nada.');
    process.exit(1);
  }

  console.log(`Planejamento encontrado (projeto Solonópole/Urbanização).`);
  console.log(`Nr_OS_OPP atual: "${plan.Nr_OS_OPP}"`);

  if (plan.Nr_OS_OPP !== NR_OS_OPP_ANTIGO) {
    console.log(`\n⚠️  O valor atual não é mais "${NR_OS_OPP_ANTIGO}" como esperado (pode já ter sido alterado por outro processo).`);
    console.log('Abortando por segurança — confere manualmente antes de rodar de novo.');
    process.exit(1);
  }

  console.log(`\nVai mudar para: "${NR_OS_OPP_NOVO}" (tira a O.S. 50 e a 65, mantém só a 49, que é a confirmada).`);

  if (APPLY) {
    await db.updateRowById('Planejamentos', 'ID', plan.ID, { ...plan, Nr_OS_OPP: NR_OS_OPP_NOVO });
    console.log('\n✅ Corrigido — Nr_OS_OPP agora é "49".');
    console.log('As O.S. 50 e 65 continuam existindo no OPP normalmente, só não aparecem mais coladas nesse projeto de urbanização.');
  } else {
    console.log('\nModo de conferência — nada foi gravado ainda. Roda de novo com --apply pra aplicar de verdade.');
  }

  process.exit(0);
}

main().catch((e) => { console.error('Erro:', e.message); console.error(e.stack); process.exit(1); });
