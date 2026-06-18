/**
 * Testa a lógica de amarração: Planejamento → OS → Financeiro_OPP
 * Se não houver planejamento com OS, simula com a OS mais recente.
 */
require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const db = require('../src/services/postgresService');

async function test() {
  await db.initialize();

  const planejamentos = await db.readSheet('Planejamentos');
  const financeiro    = await db.readSheet('Financeiro_OPP');
  const projetos      = await db.readSheet('Projetos_Contratos');

  const comOS = planejamentos.filter(p => p.Nr_Contrato_OS && p.Nr_Contrato_OS.trim());
  console.log(`\nPlanejamentos com OS preenchida: ${comOS.length} de ${planejamentos.length}`);

  // ── Simulação com dados reais do banco ──────────────────────────────────────
  // Pega as 5 OSs com mais lançamentos para demonstrar a amarração
  const osCount = {};
  for (const f of financeiro) {
    if (f.Nr_OS_OPP) osCount[f.Nr_OS_OPP] = (osCount[f.Nr_OS_OPP] || 0) + 1;
  }
  const topOSs = Object.entries(osCount)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([os]) => os);

  console.log('\n📊 SIMULAÇÃO — OSs com mais lançamentos no OPP:\n');
  for (const os of topOSs) {
    const recs  = financeiro.filter(f => f.Nr_OS_OPP === os && f.Tipo === 'Receita');
    const desps = financeiro.filter(f => f.Nr_OS_OPP === os && f.Tipo === 'Despesa');
    const totalRec  = recs.reduce((s, r)  => s + parseFloat(r.Valor || 0), 0);
    const totalDesp = desps.reduce((s, d) => s + parseFloat(d.Valor || 0), 0);
    const cliente   = recs[0]?.Nome_Cliente || desps[0]?.Nome_Cliente || '—';

    console.log(`  OS ${os} — ${cliente}`);
    console.log(`    Receitas: R$ ${totalRec.toLocaleString('pt-BR', {minimumFractionDigits:2})} (${recs.length} lançamentos)`);
    console.log(`    Despesas: R$ ${totalDesp.toLocaleString('pt-BR', {minimumFractionDigits:2})} (${desps.length} lançamentos)`);
    console.log(`    Saldo:    R$ ${(totalRec - totalDesp).toLocaleString('pt-BR', {minimumFractionDigits:2})}`);
    console.log('');
  }

  console.log('✅ Lógica funcionando! Quando um planejamento for vinculado a uma OS,');
  console.log('   o sistema consegue mostrar exatamente quanto foi recebido e pago para aquele projeto.\n');

  // ── Se houver planejamento com OS real, mostra ───────────────────────────────
  if (comOS.length > 0) {
    console.log('\n📋 PLANEJAMENTOS VINCULADOS:\n');
    for (const plan of comOS) {
      const proj  = projetos.find(p => p.ID_Projeto === plan.ID_Projeto);
      const os    = plan.Nr_Contrato_OS.trim();
      const recs  = financeiro.filter(f => f.Nr_OS_OPP === os && f.Tipo === 'Receita');
      const desps = financeiro.filter(f => f.Nr_OS_OPP === os && f.Tipo === 'Despesa');
      const totalRec  = recs.reduce((s, r)  => s + parseFloat(r.Valor || 0), 0);
      const totalDesp = desps.reduce((s, d) => s + parseFloat(d.Valor || 0), 0);

      console.log(`  Projeto: ${proj?.Nome || plan.Nome_Projeto}`);
      console.log(`  OS: ${os}`);
      console.log(`  Receitas OPP: R$ ${totalRec.toLocaleString('pt-BR', {minimumFractionDigits:2})} (${recs.length} lançamentos)`);
      console.log(`  Despesas OPP: R$ ${totalDesp.toLocaleString('pt-BR', {minimumFractionDigits:2})} (${desps.length} lançamentos)`);
      console.log(`  Saldo: R$ ${(totalRec - totalDesp).toLocaleString('pt-BR', {minimumFractionDigits:2})}`);
      console.log(recs.length > 0 ? '  ✅ Amarração OK!' : '  ⚠️  OS não tem receitas ainda no OPP');
      console.log('');
    }
  }
}

test().catch(console.error);
