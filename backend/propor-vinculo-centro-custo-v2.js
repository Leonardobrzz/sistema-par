// node backend/propor-vinculo-centro-custo-v2.js
//
// Só lê (API do OPP + banco). Não altera nada, só PROPÕE um vínculo.
//
// Versão 2: em vez de contar palavra por palavra igual, dá peso MAIOR pra
// palavras raras (tipo nome de cidade ou de escola, que só aparecem em 1 ou 2
// centros de custo) e peso MENOR pra palavras comuns (tipo "SAN", "EMBASA",
// "ARQ", "SESAB", "BA", "NRS", "CORREIOS", que aparecem em dezenas). Isso evita
// o erro da v1, que casava projetos com cidade errada só por causa de palavras
// genéricas em comum.

require('dotenv').config()
const { Pool } = require('pg')
const { oppRequest } = require('./src/services/oppService')

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://postgres.xklllcoqkreobaghdivw:402814Leo%4023@aws-1-us-east-1.pooler.supabase.com:5432/postgres',
  ssl: { rejectUnauthorized: false },
})

function normalizar(s) {
  return (s || '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function palavras(s) {
  return normalizar(s).split(' ').filter(w => w.length > 2)
}

async function buscarTodosCentrosCusto() {
  let offset = 0, todos = []
  while (true) {
    const r = await oppRequest('GET', `/centros-custo?limit=250&offset=${offset}`)
    const lista = Array.isArray(r) ? r : (r?.data || [])
    if (lista.length === 0) break
    todos.push(...lista)
    if (lista.length < 250) break
    offset += 250
    if (offset > 5000) break
  }
  return todos.filter(c => c.lixeira !== 'Sim')
}

async function main() {
  const centros = await buscarTodosCentrosCusto()
  const { rows: planejamentos } = await pool.query(`SELECT "ID", "ID_Projeto", "Nome_Projeto", "Nr_Contrato_OS", "Nr_OS_OPP" FROM "Planejamentos" ORDER BY "Nome_Projeto"`)

  // Calcula, pra cada palavra que aparece nas descrições de centro de custo,
  // em quantos centros de custo DIFERENTES ela aparece (document frequency).
  const df = {}
  const palavrasPorCentro = centros.map(c => new Set(palavras(c.desc_centro_custos)))
  for (const set of palavrasPorCentro) {
    for (const w of set) df[w] = (df[w] || 0) + 1
  }
  const N = centros.length
  const peso = (w) => Math.log((N + 1) / (df[w] || 1)) // palavra rara = peso alto, palavra comum = peso baixo

  function score(textoA, setB) {
    const wa = palavras(textoA)
    if (wa.length === 0) return { s: 0, comuns: [] }
    let soma = 0, somaTotalA = 0, comuns = []
    for (const w of wa) {
      const p = peso(w)
      somaTotalA += p
      if (setB.has(w)) { soma += p; comuns.push(w) }
    }
    return { s: somaTotalA > 0 ? soma / somaTotalA : 0, comuns }
  }

  const boas = [], duvidosas = [], semTexto = []

  for (const plan of planejamentos) {
    const textoBase = plan.Nr_Contrato_OS && plan.Nr_Contrato_OS.trim() ? plan.Nr_Contrato_OS : plan.Nome_Projeto
    if (!textoBase || !textoBase.trim() || textoBase.trim().toLowerCase() === 'null') { semTexto.push(plan); continue }

    let melhor = null, melhorInfo = null
    for (let i = 0; i < centros.length; i++) {
      const { s, comuns } = score(textoBase, palavrasPorCentro[i])
      if (!melhorInfo || s > melhorInfo.s) { melhor = centros[i]; melhorInfo = { s, comuns } }
    }

    const linha = { plan, melhor, melhorInfo }
    // exige score alto E pelo menos 1 palavra rara (peso > 1.5, ou seja, aparece em poucos centros) em comum
    const temPalavraRara = melhorInfo && melhorInfo.comuns.some(w => peso(w) > 1.5)
    if (melhor && melhorInfo.s >= 0.55 && temPalavraRara) boas.push(linha)
    else duvidosas.push(linha)
  }

  console.log(`${'='.repeat(70)}\nVÍNCULOS COM BOA CONFIANÇA (${boas.length})\n${'='.repeat(70)}`)
  for (const { plan, melhor, melhorInfo } of boas) {
    console.log(`  "${plan.Nome_Projeto}"`)
    console.log(`    -> id ${melhor.id_centro_custos} "${melhor.desc_centro_custos}" (score ${melhorInfo.s.toFixed(2)}, bateu em: ${melhorInfo.comuns.join(', ')})`)
  }

  console.log(`\n${'='.repeat(70)}\nPRECISAM DE REVISÃO MANUAL (${duvidosas.length})\n${'='.repeat(70)}`)
  for (const { plan, melhor, melhorInfo } of duvidosas) {
    console.log(`  "${plan.Nome_Projeto}" (Nr_Contrato_OS: "${plan.Nr_Contrato_OS || '—'}")`)
    if (melhor) console.log(`    melhor candidato: id ${melhor.id_centro_custos} "${melhor.desc_centro_custos}" (score ${melhorInfo.s.toFixed(2)}, bateu em: ${melhorInfo.comuns.join(', ') || '(nada de específico)'})`)
    else console.log('    (nenhum candidato achado)')
  }

  if (semTexto.length > 0) {
    console.log(`\n${'='.repeat(70)}\nSEM TEXTO PRA COMPARAR (${semTexto.length})\n${'='.repeat(70)}`)
    for (const plan of semTexto) console.log(`  "${plan.Nome_Projeto}"`)
  }

  console.log(`\nResumo: ${boas.length} boas, ${duvidosas.length} precisam revisão, ${semTexto.length} sem texto. Total: ${planejamentos.length} projetos.`)
  pool.end()
}

main().catch(e => { console.error('Erro:', e.message); pool.end() })
