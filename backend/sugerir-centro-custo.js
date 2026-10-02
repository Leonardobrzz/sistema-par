// node backend/sugerir-centro-custo.js
//
// Só lê (OPP + banco). Não grava nada em lugar nenhum.
//
// Pergunta: dá pra adivinhar sozinho o Centro de Custo certo desses 20
// projetos, sem precisar perguntar pro chef? Esse script tenta — usando o
// mesmo tipo de heurística que já existe em /opp/os-para-vincular (casamento
// de palavras do nome/cliente do projeto contra o nome de cada Centro de
// Custo do OPP, com bônus se o valor movimentado bater com o valor do
// contrato). Mas isso é só SUGESTÃO pra você conferir — NÃO aplica nada
// sozinho. Casamento por texto já causou bug sério nessa tela antes (a
// duplicação de receita da CODEVASF), então aqui a régua é mais alta: só
// mostra candidato com pelo menos 2 palavras em comum, e nunca escreve nada
// no banco.

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

async function main() {
  const opp = require('./src/services/oppService');
  const db = require('./src/services/postgresService');

  const agora = new Date();
  const inicio = new Date(agora);
  inicio.setMonth(inicio.getMonth() - 18);
  const fmt = (d) => d.toISOString().split('T')[0];

  console.log('Buscando centros de custo e lançamentos do OPP (pode demorar)...\n');

  const [projetos, planejamentos, ccRaw, receitasOPP, despesasOPP] = await Promise.all([
    db.readSheet('Projetos_Contratos'),
    db.readSheet('Planejamentos'),
    opp.oppRequest('GET', '/centros-custo?limit=500'),
    opp.listarReceitas({ data_inicio: fmt(inicio), data_fim: fmt(agora) }),
    opp.listarDespesas({ data_inicio: fmt(inicio), data_fim: fmt(agora) }),
  ]);

  const listaCC = (Array.isArray(ccRaw) ? ccRaw : (ccRaw?.data || []))
    .map(c => ({ id: String(c.id_centro_custos || c.id || ''), nome: c.desc_centro_custos || c.nome || c.descricao || '' }))
    .filter(c => c.id && c.nome);

  const listaReceitas = (Array.isArray(receitasOPP) ? receitasOPP : (receitasOPP?.data || [])).filter(r => r.lixeira !== 'Sim');
  const listaDespesas = (Array.isArray(despesasOPP) ? despesasOPP : (despesasOPP?.data || [])).filter(d => d.lixeira !== 'Sim');

  const totalPorCC = {};
  for (const r of listaReceitas) {
    const id = String(r.id_centro_custos || '');
    if (!id || id === '0') continue;
    totalPorCC[id] = (totalPorCC[id] || 0) + parseFloat(r.valor_rec || 0);
  }
  for (const d of listaDespesas) {
    const id = String(d.id_centro_custos || '');
    if (!id || id === '0') continue;
    totalPorCC[id] = (totalPorCC[id] || 0) + parseFloat(d.valor_pag || 0);
  }

  const pBR = (v) => {
    const s = String(v || 0).trim();
    if (s.includes(',')) return parseFloat(s.replace(/\./g, '').replace(',', '.')) || 0;
    const parts = s.split('.');
    if (parts.length === 2 && parts[1].length <= 2) return parseFloat(s) || 0;
    return parseFloat(s.replace(/\./g, '')) || 0;
  };

  const planMap = {};
  for (const pl of planejamentos) {
    if (pl.Status === 'Aprovado' || pl.Status === 'Pendente Aprovação') planMap[pl.ID_Projeto] = pl;
  }

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
    return candidatos.slice(0, 2);
  }

  const semCC = [
    'SAN-29-SIAA SANTA CRUZ DA VITÓRIA|EMBASA',
    'ARQ-2026-6-HOSPITAL ANA NERY|SECRETARIA DA SAÚDE DO ESTADO DA BAHIA - SESAB',
    'SAN-30-SIAA LAJEDÃO III|EMBASA',
    'SAN-2025-01-AMP. SAA SEDE|AIUABA',
    'ARQ-2025-2-UNIDADE DE AGROINDUSTRIA-4-GRUPO 4_3. 1. ABATEDOURO FRIGORÍFICO DE CAPRINOS E OVINOS|CODEVASF',
    'INF-2026-3 LEVANTAMENTOS TOPOGRÁFICOS|CORES VALE',
    'ARQ-2026-1-URBANIZAÇÃO DO CANAL DO AMBRÓSIO|NOVA MAMORÉ-RO',
    'ARQ-2026-7-LACEN|SECRETARIA DA SAÚDE DO ESTADO DA BAHIA - SESAB',
    'SAN-20-SAA LAFAIETE COUTINHO|EMBASA',
    'ARQ-2026-ARENINHA SÃO FRANCISCO|APUIARÉS',
    'ARQ-2025-2-UNIDADE DE AGROINDUSTRIA-1-GRUPO 1-2. UNIDADE DE BENEFICIAMENTO DE FRUTAS|CODEVASF',
    'ARQ-2026-5-NRS JUAZEIRO|SECRETARIA DA SAÚDE DO ESTADO DA BAHIA - SESAB',
    'ARQ-2026-4-NRS CENTRO NORTE JACOBINA|SECRETARIA DA SAÚDE DO ESTADO DA BAHIA - SESAB',
    'ARQ-2026-1-AGÊNCIA DE CORREIOS DE CHAVES|CORREIOS - PA',
  ].map(s => { const [nome, cliente] = s.split('|'); return { nome, cliente }; });

  console.log('=== Sugestões pra quem NUNCA teve Centro de Custo vinculado ===\n');
  for (const { nome, cliente } of semCC) {
    const p = projetos.find(pr => pr.Nome === nome);
    const valor = p ? pBR(p.Valor_Global || 0) : 0;
    const sugestoes = sugerir(nome, cliente, valor);
    console.log(`${nome}  (contrato: R$ ${valor.toFixed(2)})`);
    if (sugestoes.length === 0) {
      console.log('   → Nenhum Centro de Custo do OPP tem nome parecido. Provavelmente ainda não foi criado lá.');
    } else {
      sugestoes.forEach(s => console.log(`   → candidato: CC #${s.id} "${s.nome}" | ${s.palavrasComuns} palavra(s) em comum | movimentado (18m): R$ ${s.movimentado.toFixed(2)} | score ${s.score}`));
    }
    console.log('');
  }

  const comCC = [
    ['INF-2026-01 -TUNEL RODOVIÁRIO E BOULEVARD DA AVENIDA CENTRAL DE TAGUATINGA', 'DISTRITO FEDERAL', '237908'],
    ['ARQ-2025-2-UNIDADE DE AGROINDUSTRIA-1-GRUPO 2-3-PRODUÇÃO DE ABELHAS', 'CODEVASF', '224827'],
    ['ARQ-2025-2-UNIDADE DE AGROINDUSTRIA-1-GRUPO 2-2-UNID. DE LEITE', 'CODEVASF', '224826'],
    ['ARQ-2026-2-BRS PAULO AFONSO', 'SECRETARIA DA SAÚDE DO ESTADO DA BAHIA - SESAB', '238495'],
    ['ARQ-2026-3-BRS SENHOR DO BONFIM', 'SECRETARIA DA SAÚDE DO ESTADO DA BAHIA - SESAB', '238496'],
    ['ARQ-2026-1-BRS IRECÊ', 'SECRETARIA DA SAÚDE DO ESTADO DA BAHIA - SESAB', '237910'],
  ];

  console.log('\n=== Já têm Centro de Custo vinculado — conferindo se não seria outro ID ===\n');
  for (const [nome, cliente, ccAtual] of comCC) {
    const p = projetos.find(pr => pr.Nome === nome);
    const valor = p ? pBR(p.Valor_Global || 0) : 0;
    const sugestoes = sugerir(nome, cliente, valor).filter(s => s.id !== ccAtual);
    const nomeAtual = (listaCC.find(c => c.id === ccAtual) || {}).nome || '(não achei na lista atual)';
    console.log(`${nome}  (contrato: R$ ${valor.toFixed(2)})`);
    console.log(`   CC atual: #${ccAtual} "${nomeAtual}" | movimentado (18m): R$ ${(totalPorCC[ccAtual] || 0).toFixed(2)}`);
    if (sugestoes.length === 0) {
      console.log('   → Não achei outro Centro de Custo com nome mais parecido. O vínculo atual parece ser mesmo o único candidato razoável.');
    } else {
      sugestoes.forEach(s => console.log(`   → possível alternativa: CC #${s.id} "${s.nome}" | ${s.palavrasComuns} palavra(s) em comum | movimentado (18m): R$ ${s.movimentado.toFixed(2)} | score ${s.score}`));
    }
    console.log('');
  }

  process.exit(0);
}

main().catch(e => { console.error('Erro:', e.message); console.error(e.stack); process.exit(1); });
