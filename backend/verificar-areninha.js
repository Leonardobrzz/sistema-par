// node backend/verificar-areninha.js
//
// Só lê. Corrige a busca da Parte 1 do script anterior, que pegou os
// projetos errados pra "Areninha São Francisco" (tem mais de um "Areninha"
// e mais de um "São Francisco" cadastrado). Aqui filtra pelo cliente
// "APUIARÉS" certinho.

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
function palavrasSignificativas(s) { return norm(s).split(' ').filter(w => w.length > 2 && !IGNORAR.has(w)); }
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
  const inicio = new Date(agora); inicio.setMonth(inicio.getMonth() - 18);
  const fmt = (d) => d.toISOString().split('T')[0];

  const [projetos, ccRaw, receitasOPP, despesasOPP] = await Promise.all([
    db.readSheet('Projetos_Contratos'),
    opp.oppRequest('GET', '/centros-custo?limit=500'),
    opp.listarReceitas({ data_inicio: fmt(inicio), data_fim: fmt(agora) }),
    opp.listarDespesas({ data_inicio: fmt(inicio), data_fim: fmt(agora) }),
  ]);

  const listaCC = (Array.isArray(ccRaw) ? ccRaw : (ccRaw?.data || []))
    .map(c => ({ id: String(c.id_centro_custos || c.id || ''), nome: c.desc_centro_custos || c.nome || c.descricao || '' }))
    .filter(c => c.id && c.nome);

  const limpar = (lista) => (Array.isArray(lista) ? lista : (lista?.data || [])).filter(x => x.lixeira !== 'Sim');
  const recR = limpar(receitasOPP), desR = limpar(despesasOPP);
  const totalPorCC = {};
  for (const r of recR) { const id = String(r.id_centro_custos || ''); if (id && id !== '0') totalPorCC[id] = (totalPorCC[id] || 0) + parseFloat(r.valor_rec || 0); }
  for (const d of desR) { const id = String(d.id_centro_custos || ''); if (id && id !== '0') totalPorCC[id] = (totalPorCC[id] || 0) + parseFloat(d.valor_pag || 0); }

  function sugerir(nomeProjeto, cliente, valorGlobal) {
    const palavrasProjeto = [...new Set([...palavrasSignificativas(nomeProjeto), ...palavrasSignificativas(cliente)])];
    const candidatos = [];
    for (const cc of listaCC) {
      const palavrasCC = palavrasSignificativas(cc.nome);
      let comuns = 0;
      for (const w of palavrasProjeto) if (palavrasCC.includes(w)) comuns++;
      if (comuns < 1) continue;
      const movimentado = totalPorCC[cc.id] || 0;
      let scoreValor = 0;
      if (valorGlobal > 0 && movimentado > 0) {
        const diff = Math.abs(movimentado - valorGlobal) / valorGlobal;
        if (diff < 0.1) scoreValor = 3; else if (diff < 0.3) scoreValor = 1;
      }
      candidatos.push({ id: cc.id, nome: cc.nome, palavrasComuns: comuns, movimentado, score: comuns * 2 + scoreValor });
    }
    candidatos.sort((a, b) => b.score - a.score);
    return candidatos.slice(0, 5);
  }

  console.log('Todos os projetos cujo Cliente é APUIARÉS:\n');
  const candidatosProjeto = projetos.filter(p => norm(p.Cliente || '') === norm('APUIARÉS'));
  candidatosProjeto.forEach(p => console.log(`  ${p.Nome}  (valor: R$ ${pBR(p.Valor_Global || 0).toFixed(2)})`));

  const alvo = candidatosProjeto.find(p => norm(p.Nome || '').includes('ARENINHA'));
  console.log(`\nAlvo identificado: ${alvo ? alvo.Nome : '(não achei nenhum "Areninha" com cliente Apuiarés)'}\n`);

  if (alvo) {
    const valor = pBR(alvo.Valor_Global || 0);
    const sugestoes = sugerir(alvo.Nome, alvo.Cliente, valor);
    console.log(`${alvo.Nome}  (contrato: R$ ${valor.toFixed(2)})`);
    if (sugestoes.length === 0) console.log('   → Nenhum Centro de Custo do OPP com nome parecido.');
    else sugestoes.forEach(s => console.log(`   → candidato: CC #${s.id} "${s.nome}" | ${s.palavrasComuns} palavra(s) em comum | movimentado (18m): R$ ${s.movimentado.toFixed(2)} | score ${s.score}`));
  }

  process.exit(0);
}

main().catch(e => { console.error('Erro:', e.message); console.error(e.stack); process.exit(1); });
