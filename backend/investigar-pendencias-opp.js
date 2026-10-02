// node backend/investigar-pendencias-opp.js
//
// Só lê (OPP + banco). Não grava nada em lugar nenhum.
//
// Tenta resolver via API, antes de perguntar pro chef:
// (1) sugestão de Centro de Custo pros 7 projetos que ainda não têm nenhum
//     achado no OPP;
// (2) o que tem por trás dos dois Centros de Custo compartilhados (NRS
//     Juazeiro / Hospital Regional de Juazeiro e Lajedão III / SAN-23) —
//     lista cada lançamento, pra ver se dá pra saber se é mesma obra ou não;
// (3) o detalhe completo dos lançamentos do Levantamento Topográfico de Nova
//     Mamoré e da SAA Comandatuba, pra tentar entender os valores estranhos.

require('dotenv').config({ path: require('path').join(__dirname, '.env') });

function norm(s) {
  return (s || '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9 ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

const IGNORAR = new Set(['ARQ', 'SAN', 'INF', 'DE', 'DA', 'DO', 'DOS', 'DAS', 'E', 'EM', 'NO', 'NA', 'PARA', 'COM', 'GRUPO']);

function palavrasSignificativas(s) {
  return norm(s).split(' ').filter(w => w.length > 2 && !IGNORAR.has(w));
}

const pBR = (v) => {
  const s = String(v || 0).trim();
  if (s.includes(',')) return parseFloat(s.replace(/\./g, '').replace(',', '.')) || 0;
  const parts = s.split('.');
  if (parts.length === 2 && parts[1].length <= 2) return parseFloat(s) || 0;
  return parseFloat(s.replace(/\./g, '')) || 0;
};

async function main() {
  const opp = require('./src/services/oppService');
  const db = require('./src/services/postgresService');

  const agora = new Date();
  const inicioRecente = new Date(agora); inicioRecente.setMonth(inicioRecente.getMonth() - 18);
  const inicioAmplo = new Date('2015-01-01');
  const fmt = (d) => d.toISOString().split('T')[0];

  console.log('Buscando dados do OPP (pode demorar um pouco)...\n');

  const [projetos, planejamentos, ccRaw, receitasRecentes, despesasRecentes, receitasAmplo, despesasAmplo] = await Promise.all([
    db.readSheet('Projetos_Contratos'),
    db.readSheet('Planejamentos'),
    opp.oppRequest('GET', '/centros-custo?limit=500'),
    opp.listarReceitas({ data_inicio: fmt(inicioRecente), data_fim: fmt(agora) }),
    opp.listarDespesas({ data_inicio: fmt(inicioRecente), data_fim: fmt(agora) }),
    opp.listarReceitas({ data_inicio: fmt(inicioAmplo), data_fim: fmt(agora) }),
    opp.listarDespesas({ data_inicio: fmt(inicioAmplo), data_fim: fmt(agora) }),
  ]);

  const listaCC = (Array.isArray(ccRaw) ? ccRaw : (ccRaw?.data || []))
    .map(c => ({ id: String(c.id_centro_custos || c.id || ''), nome: c.desc_centro_custos || c.nome || c.descricao || '' }))
    .filter(c => c.id && c.nome);
  const nomePorCCId = Object.fromEntries(listaCC.map(c => [c.id, c.nome]));

  const limpar = (lista) => (Array.isArray(lista) ? lista : (lista?.data || [])).filter(x => x.lixeira !== 'Sim');
  const recR = limpar(receitasRecentes), desR = limpar(despesasRecentes);
  const recA = limpar(receitasAmplo), desA = limpar(despesasAmplo);

  const totalPorCC = {};
  for (const r of recR) { const id = String(r.id_centro_custos || ''); if (id && id !== '0') totalPorCC[id] = (totalPorCC[id] || 0) + parseFloat(r.valor_rec || 0); }
  for (const d of desR) { const id = String(d.id_centro_custos || ''); if (id && id !== '0') totalPorCC[id] = (totalPorCC[id] || 0) + parseFloat(d.valor_pag || 0); }

  const planMapTodos = {};
  for (const pl of planejamentos) planMapTodos[pl.ID_Projeto] = planMapTodos[pl.ID_Projeto] || pl; // pega o primeiro, sem filtrar status (só pra achar CC já gravado)
  for (const pl of planejamentos) if (pl.ID_Centro_Custo_OPP) planMapTodos[pl.ID_Projeto] = pl; // prioriza quem já tem CC

  function sugerir(nomeProjeto, cliente, valorGlobal) {
    const palavrasProjeto = [...new Set([...palavrasSignificativas(nomeProjeto), ...palavrasSignificativas(cliente)])];
    const candidatos = [];
    for (const cc of listaCC) {
      const palavrasCC = palavrasSignificativas(cc.nome);
      let comuns = 0;
      for (const w of palavrasProjeto) if (palavrasCC.includes(w)) comuns++;
      if (comuns < 2) continue;
      const movimentado = totalPorCC[cc.id] || 0;
      let scoreValor = 0;
      if (valorGlobal > 0 && movimentado > 0) {
        const diff = Math.abs(movimentado - valorGlobal) / valorGlobal;
        if (diff < 0.1) scoreValor = 3;
        else if (diff < 0.3) scoreValor = 1;
      }
      candidatos.push({ id: cc.id, nome: cc.nome, palavrasComuns: comuns, movimentado, score: comuns * 2 + scoreValor });
    }
    candidatos.sort((a, b) => b.score - a.score);
    return candidatos.slice(0, 3);
  }

  // ============ PARTE 1: sugestão de CC pros 7 sem vínculo ============
  console.log('========================================================');
  console.log('PARTE 1 — Sugestão de Centro de Custo (candidatos no OPP)');
  console.log('========================================================\n');

  const PALAVRAS_CHAVE = [
    'JACOBINA', 'ANANINDEUA', 'ANA NERY', 'LACEN', 'ARENINHA', 'FRANCISCO',
    'TOPOGR', 'SANTA CRUZ DA VITORIA',
  ];

  for (const palavra of PALAVRAS_CHAVE) {
    const p = projetos.find(pr => norm(pr.Nome || '').includes(norm(palavra)));
    if (!p) {
      console.log(`"${palavra}" → não achei nenhum projeto em Projetos_Contratos com esse termo no nome.\n`);
      continue;
    }
    const valor = pBR(p.Valor_Global || 0);
    const sugestoes = sugerir(p.Nome, p.Cliente, valor);
    console.log(`${p.Nome}  (cliente: ${p.Cliente || '—'} | contrato: R$ ${valor.toFixed(2)})`);
    if (sugestoes.length === 0) {
      console.log('   → Nenhum Centro de Custo do OPP com nome parecido. Provavelmente ainda não foi criado lá.');
    } else {
      sugestoes.forEach(s => console.log(`   → candidato: CC #${s.id} "${s.nome}" | ${s.palavrasComuns} palavra(s) em comum | movimentado (18m): R$ ${s.movimentado.toFixed(2)} | score ${s.score}`));
    }
    console.log('');
  }

  // ============ PARTE 2: os dois CC compartilhados ============
  console.log('\n========================================================');
  console.log('PARTE 2 — Detalhe dos Centros de Custo compartilhados');
  console.log('========================================================\n');

  const COMPARTILHADOS = [
    { ccId: '224851', label: 'CC #224851 — NRS Juazeiro / Hospital Regional de Juazeiro' },
    { ccId: '224799', label: 'CC #224799 — Lajedão III / SAN-23' },
  ];

  for (const { ccId, label } of COMPARTILHADOS) {
    console.log(`${label}`);
    console.log(`   Nome oficial no OPP: "${nomePorCCId[ccId] || '(não achei na lista)'}"`);
    const lancsR = recA.filter(r => String(r.id_centro_custos || '') === ccId);
    const lancsD = desA.filter(d => String(d.id_centro_custos || '') === ccId);
    console.log(`   Lançamentos: ${lancsR.length} receita(s), ${lancsD.length} despesa(s)`);
    lancsR.forEach(r => console.log(`      [receita] ${r.data_vencimento_rec || r.data_pagamento || '?'} | R$ ${r.valor_rec} | ${r.observacoes_rec || '(sem observação)'}`));
    lancsD.forEach(d => console.log(`      [despesa] ${d.data_vencimento_pag || d.data_pagamento || '?'} | R$ ${d.valor_pag} | ${d.observacoes_pag || '(sem observação)'}`));
    console.log('');
  }

  // ============ PARTE 3: Nova Mamoré + Comandatuba ============
  console.log('\n========================================================');
  console.log('PARTE 3 — Levantamento Topográfico (Nova Mamoré) e SAA Comandatuba');
  console.log('========================================================\n');

  const CASOS = ['LEVANTAMENTO TOPOGRAFICO EM RUAS DA SEDE', 'COMANDATUBA'];

  for (const termo of CASOS) {
    const p = projetos.find(pr => norm(pr.Nome || '').includes(norm(termo)));
    if (!p) {
      console.log(`"${termo}" → não achei o projeto em Projetos_Contratos.\n`);
      continue;
    }
    const plan = planMapTodos[p.ID_Projeto];
    const ccId = plan?.ID_Centro_Custo_OPP ? String(plan.ID_Centro_Custo_OPP) : null;
    console.log(`${p.Nome}`);
    console.log(`   Cliente: ${p.Cliente || '—'} | Valor do contrato no PAR: R$ ${pBR(p.Valor_Global || 0).toFixed(2)}`);
    console.log(`   Centro de Custo vinculado: ${ccId ? `#${ccId} "${nomePorCCId[ccId] || '?'}"` : '(nenhum)'}`);
    if (!ccId) { console.log(''); continue; }

    const lancsR = recA.filter(r => String(r.id_centro_custos || '') === ccId);
    const lancsD = desA.filter(d => String(d.id_centro_custos || '') === ccId);
    const totalR = lancsR.reduce((s, r) => s + parseFloat(r.valor_rec || 0), 0);
    const totalD = lancsD.reduce((s, d) => s + parseFloat(d.valor_pag || 0), 0);
    console.log(`   Total recebido (todo o histórico): R$ ${totalR.toFixed(2)} em ${lancsR.length} lançamento(s)`);
    console.log(`   Total pago (todo o histórico): R$ ${totalD.toFixed(2)} em ${lancsD.length} lançamento(s)`);
    console.log('   Lançamentos de receita:');
    lancsR.forEach(r => console.log(`      ${r.data_vencimento_rec || r.data_pagamento || '?'} | R$ ${r.valor_rec} | liquidado: ${r.liquidado_rec} | ${r.observacoes_rec || '(sem observação)'}`));
    console.log('   Lançamentos de despesa:');
    lancsD.forEach(d => console.log(`      ${d.data_vencimento_pag || d.data_pagamento || '?'} | R$ ${d.valor_pag} | ${d.observacoes_pag || '(sem observação)'}`));
    console.log('');
  }

  process.exit(0);
}

main().catch(e => { console.error('Erro:', e.message); console.error(e.stack); process.exit(1); });
