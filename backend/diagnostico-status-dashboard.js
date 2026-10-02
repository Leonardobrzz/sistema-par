// node backend/diagnostico-status-dashboard.js
//
// Só lê. Não grava nada.
//
// O chef pediu pro gráfico "Projetos por Status" do Dashboard usar só os
// status que vêm do ClickUp. Esse script confere: quais status existem hoje
// em Projetos_Contratos, quais desses são de fato derivados do ClickUp (a
// lógica em clickupService.js só produz: Concluído, Backlog, Paralisado,
// Em Análise, Arquivado, Aguardando Faturamento, Pendência, Em Andamento,
// Em Andamento (Atrasado)) e quais NÃO são (ex: "Planejado", que
// backend/src/routes/planejamento.js grava direto ao aprovar um
// planejamento, sem passar pelo ClickUp) — e, pros que não são, se têm
// ID_ClickUp (e portanto algum dia o sync corrige sozinho) ou não (ficam
// errados pra sempre).

require('dotenv').config({ path: require('path').join(__dirname, '.env') });

const STATUS_CLICKUP_VALIDOS = new Set([
  'Concluído', 'Backlog', 'Paralisado', 'Em Análise', 'Arquivado',
  'Aguardando Faturamento', 'Pendência', 'Em Andamento', 'Em Andamento (Atrasado)',
]);

async function main() {
  const db = require('./src/services/postgresService');

  const projetos = await db.readSheet('Projetos_Contratos');
  // O dashboard considera só os projetos "ativos" na tela (confirmar filtro exato
  // não é crítico aqui — o que importa é o universo de Status existentes)
  const porStatus = {};
  for (const p of projetos) {
    const s = (p.Status || '(vazio)').replace(' (Atrasado)', '').trim() || '(vazio)';
    (porStatus[s] = porStatus[s] || []).push(p);
  }

  console.log('Status existentes em Projetos_Contratos (contagem):\n');
  Object.entries(porStatus).sort((a, b) => b[1].length - a[1].length).forEach(([s, lista]) => {
    const valido = STATUS_CLICKUP_VALIDOS.has(s) ? '✅ vem do ClickUp' : '⚠️  NÃO é um status do ClickUp';
    console.log(`  "${s}": ${lista.length}  ${valido}`);
  });

  console.log('\nDetalhe dos status que NÃO vêm do ClickUp:\n');
  for (const [s, lista] of Object.entries(porStatus)) {
    if (STATUS_CLICKUP_VALIDOS.has(s)) continue;
    console.log(`"${s}" (${lista.length} projeto(s)):`);
    for (const p of lista) {
      console.log(`   "${p.Nome}" | ID_ClickUp: ${p.ID_ClickUp || '(vazio — nunca vai se auto-corrigir)'}`);
    }
    console.log('');
  }

  process.exit(0);
}

main().catch(e => { console.error('Erro:', e.message); console.error(e.stack); process.exit(1); });
