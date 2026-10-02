// Modo seguro por padrão: node backend/limpar-cadastro-terceirizados.js
// Apagar de verdade:        node backend/limpar-cadastro-terceirizados.js --apply
//
// Remove da tabela Terceirizados os registros que vieram da lista "Cadastro
// de Terceirizados" do ClickUp — não são demandas de serviço de verdade (é um
// catálogo de fornecedores), mas foram importados um dia e ficaram marcados
// "Cancelado" pra sempre, inflando a tela de Demandas de Terceirização com
// ~2020 linhas que não deveriam estar lá. O sync já foi corrigido pra nunca
// mais trazer essa lista.

require('dotenv').config({ path: require('path').join(__dirname, '.env') });

const APLICAR = process.argv.includes('--apply');

async function main() {
  const db = require('./src/services/postgresService');

  const tercs = await db.readSheet('Terceirizados');
  const alvo = tercs.filter(t => t.Etapa_ClickUp === 'Cadastro de Terceirizados');

  console.log(APLICAR ? '=== Apagando do banco ===\n' : '=== Modo de conferência (nada será apagado — rode com --apply pra apagar) ===\n');
  console.log(`Total em Terceirizados: ${tercs.length}`);
  console.log(`Registros vindos de "Cadastro de Terceirizados" (a remover): ${alvo.length}`);
  console.log(`Ficariam depois da limpeza: ${tercs.length - alvo.length}\n`);

  // Mostra uma amostra antes de decidir
  console.log('Amostra de quem seria removido:');
  alvo.slice(0, 10).forEach(t => console.log(`  "${t.Servico || t.ID}" | Status atual: ${t.Status}`));

  // Confere se sobra algum registro "de verdade" (não vindo do cadastro) com
  // Status diferente de Solicitado/Confirmado, só pra não remover nada errado
  const outrosStatus = tercs.filter(t => t.Etapa_ClickUp !== 'Cadastro de Terceirizados');
  const statusCount = {};
  for (const t of outrosStatus) statusCount[t.Status] = (statusCount[t.Status] || 0) + 1;
  console.log('\nStatus de quem NÃO é do cadastro (fica intacto):', JSON.stringify(statusCount));

  if (APLICAR) {
    let apagados = 0;
    for (const t of alvo) {
      await db.deleteRowById('Terceirizados', 'ID', t.ID);
      apagados++;
    }
    console.log(`\n✅ ${apagados} registros removidos.`);
  } else {
    console.log('\nConferiu e tá tudo certo? Roda de novo com --apply pra apagar de verdade:');
    console.log('  node backend/limpar-cadastro-terceirizados.js --apply');
  }

  process.exit(0);
}

main().catch(e => { console.error('Erro:', e.message); console.error(e.stack); process.exit(1); });
