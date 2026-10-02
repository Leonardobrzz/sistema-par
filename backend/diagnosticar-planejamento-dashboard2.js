// node backend/diagnosticar-planejamento-dashboard2.js
//
// Só lê (não grava nada). Continuação do diagnóstico anterior: daquela vez eu
// contei "setor" só pelo prefixo do nome (ARQ-/SAN-/INF-), mas sem aplicar o
// MESMO filtro que a API /projetos realmente usa (que também exclui qualquer
// projeto cujo nome não comece com ARQ-/INF-/SAN- e não seja o caso de
// exceção "CENTRO ESPECIALIZADO DE REABILITA..."). Isso explicava os 352
// "Administrativo/Outro" — são linhas que o sistema nunca mostra em lugar
// nenhum (nem Dashboard, nem Planejamento Físico, nem Financeiro).
//
// Esse script replica exatamente o filtro da API, pra achar os números REAIS
// que aparecem no sistema: total de projetos ativos "de verdade" (os que a
// tela usa), quantos têm Planejamento Aprovado, e quantos ainda não têm —
// SEM restringir ao status "Em Andamento".

require('dotenv').config({ path: require('path').join(__dirname, '.env') });

function passaFiltroAPI(nome) {
  const n = nome || '';
  const temPrefixo = /^(ARQ|INF|SAN)-/i.test(n);
  const excecao = /CENTRO ESPECIALIZADO DE REABILITA/i.test(n);
  return temPrefixo || excecao;
}

async function main() {
  const db = require('./src/services/postgresService');
  const [projetos, planejamentos] = await Promise.all([
    db.readSheet('Projetos_Contratos'),
    db.readSheet('Planejamentos'),
  ]);

  const projMap = new Map(projetos.map((p) => [p.ID_Projeto, p]));

  // Exatamente o que a API /projetos (sem incluirTodos) devolve pro front:
  const visiveisNoApp = projetos.filter((p) => passaFiltroAPI(p.Nome) && p.Status !== 'Concluído' && p.Status !== 'Arquivado');

  const emAndamento = visiveisNoApp.filter((p) => (p.Status || '').includes('Em Andamento'));

  const aprovados = planejamentos.filter((pl) => pl.Status === 'Aprovado');
  const idsVisiveis = new Set(visiveisNoApp.map((p) => p.ID_Projeto));
  const aprovadosVisiveis = aprovados.filter((pl) => idsVisiveis.has(pl.ID_Projeto));
  const idsAprovados = new Set(aprovadosVisiveis.map((pl) => pl.ID_Projeto));

  const visiveisComAprovado = visiveisNoApp.filter((p) => idsAprovados.has(p.ID_Projeto));
  const visiveisSemAprovado = visiveisNoApp.filter((p) => !idsAprovados.has(p.ID_Projeto));

  console.log('### Universo real (o que a API /projetos mostra: prefixo ARQ/INF/SAN + exceção, sem Concluído/Arquivado) ###');
  console.log(`Total de projetos "visíveis no app": ${visiveisNoApp.length}`);
  console.log(`  dos quais "Em Andamento": ${emAndamento.length}`);
  console.log(`  dos quais outros status (Backlog, Pendência, Aguardando Faturamento, A Planejar, Planejado, Em Análise, Paralisado): ${visiveisNoApp.length - emAndamento.length}`);

  console.log('\n### Planejamento Aprovado, dentro desse universo real ###');
  console.log(`Com Planejamento Aprovado: ${visiveisComAprovado.length}`);
  console.log(`SEM Planejamento Aprovado ainda: ${visiveisSemAprovado.length}`);
  console.log(`(soma: ${visiveisComAprovado.length + visiveisSemAprovado.length} — deve bater com o total de "visíveis no app" acima)`);

  console.log('\nBreakdown de "SEM Planejamento Aprovado" por status atual:');
  const porStatus = {};
  visiveisSemAprovado.forEach((p) => { const s = p.Status || '(vazio)'; porStatus[s] = (porStatus[s] || 0) + 1; });
  Object.entries(porStatus).sort((a, b) => b[1] - a[1]).forEach(([s, n]) => console.log(`  - ${s}: ${n}`));

  console.log('\nFim.');
  process.exit(0);
}

main().catch((e) => { console.error('Erro:', e.message); console.error(e.stack); process.exit(1); });
