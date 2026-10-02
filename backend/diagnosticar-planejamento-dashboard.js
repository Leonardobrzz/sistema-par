// node backend/diagnosticar-planejamento-dashboard.js
//
// Só lê (não grava nada). O gráfico "Projetos em Planejamento" do Dashboard
// deu números que não bateram com o esperado (chef via 47 no total, mas
// "Planejamentos Aprovados (61)" aparece em outra tela, e o card "Projetos
// em Andamento" mostra ~111). Esse script confere, direto no banco, os
// números de cada pedaço pra entender onde exatamente a conta diverge antes
// de mexer de novo no código do Dashboard.

require('dotenv').config({ path: require('path').join(__dirname, '.env') });

function setorDoNome(nome) {
  const n = (nome || '').toUpperCase();
  if (n.startsWith('ARQ-')) return 'Arquitetura';
  if (n.startsWith('SAN-')) return 'Saneamento';
  if (n.startsWith('INF-')) return 'Infraestrutura';
  return 'Administrativo/Outro';
}

async function main() {
  const db = require('./src/services/postgresService');
  const [projetos, planejamentos] = await Promise.all([
    db.readSheet('Projetos_Contratos'),
    db.readSheet('Planejamentos'),
  ]);

  const projMap = new Map(projetos.map((p) => [p.ID_Projeto, p]));

  const ativos = projetos.filter((p) => p.Status !== 'Concluído' && p.Status !== 'Arquivado');
  const emAndamento = ativos.filter((p) => (p.Status || '').includes('Em Andamento'));

  const aprovados = planejamentos.filter((pl) => pl.Status === 'Aprovado');
  const aprovadosComProjetoAtivo = aprovados.filter((pl) => {
    const p = projMap.get(pl.ID_Projeto);
    return p && p.Status !== 'Concluído' && p.Status !== 'Arquivado';
  });
  const aprovadosSemProjetoEncontrado = aprovados.filter((pl) => !projMap.has(pl.ID_Projeto));

  const idsAprovados = new Set(aprovadosComProjetoAtivo.map((pl) => pl.ID_Projeto));
  const emAndamentoComAprovado = emAndamento.filter((p) => idsAprovados.has(p.ID_Projeto));
  const emAndamentoSemAprovado = emAndamento.filter((p) => !idsAprovados.has(p.ID_Projeto));
  const aprovadosForaDoEmAndamento = aprovadosComProjetoAtivo.filter((pl) => {
    const p = projMap.get(pl.ID_Projeto);
    return !(p.Status || '').includes('Em Andamento');
  });

  console.log('### Totais gerais ###');
  console.log(`Projetos ativos (sem Concluído/Arquivado): ${ativos.length}`);
  console.log(`  dos quais "Em Andamento": ${emAndamento.length}`);
  console.log(`Planejamentos com Status = Aprovado (TODOS, qualquer setor): ${aprovados.length}`);
  console.log(`  desses, com projeto ainda ativo: ${aprovadosComProjetoAtivo.length}`);
  console.log(`  desses, sem projeto correspondente encontrado em Projetos_Contratos (ID_Projeto órfão): ${aprovadosSemProjetoEncontrado.length}`);
  if (aprovadosSemProjetoEncontrado.length) {
    aprovadosSemProjetoEncontrado.slice(0, 10).forEach((pl) => console.log(`    - Planejamento ${pl.ID} | ID_Projeto: ${pl.ID_Projeto} | Nome_Projeto: ${pl.Nome_Projeto || '(vazio)'}`));
  }

  console.log('\n### Cruzamento Aprovado x Em Andamento ###');
  console.log(`"Em Andamento" com Planejamento Aprovado: ${emAndamentoComAprovado.length}`);
  console.log(`"Em Andamento" SEM Planejamento Aprovado (= "a planejar" dentro do Em Andamento): ${emAndamentoSemAprovado.length}`);
  console.log(`Aprovados cujo projeto NÃO está com Status "Em Andamento" agora (está em Backlog/Pendência/etc.): ${aprovadosForaDoEmAndamento.length}`);
  if (aprovadosForaDoEmAndamento.length) {
    const porStatus = {};
    aprovadosForaDoEmAndamento.forEach((pl) => {
      const p = projMap.get(pl.ID_Projeto);
      const s = p.Status || '(vazio)';
      porStatus[s] = (porStatus[s] || 0) + 1;
    });
    console.log('  Status atual desses projetos aprovados (que não estão em "Em Andamento"):');
    Object.entries(porStatus).sort((a, b) => b[1] - a[1]).forEach(([s, n]) => console.log(`    - ${s}: ${n}`));
  }

  console.log('\n### Por setor (pra ver se bate com algum filtro aplicado no Dashboard) ###');
  const setores = ['Arquitetura', 'Saneamento', 'Infraestrutura', 'Administrativo/Outro'];
  for (const s of setores) {
    const emAndS = emAndamento.filter((p) => setorDoNome(p.Nome) === s);
    const aprovS = aprovadosComProjetoAtivo.filter((pl) => setorDoNome((projMap.get(pl.ID_Projeto) || {}).Nome) === s);
    const emAndComAprovS = emAndS.filter((p) => idsAprovados.has(p.ID_Projeto));
    console.log(`${s}: Em Andamento = ${emAndS.length} | Aprovados (ativos) = ${aprovS.length} | Em Andamento com Aprovado = ${emAndComAprovS.length}`);
  }

  console.log('\nFim.');
  process.exit(0);
}

main().catch((e) => { console.error('Erro:', e.message); console.error(e.stack); process.exit(1); });
