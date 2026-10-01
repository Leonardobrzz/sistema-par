// node backend/propor-vinculo-centro-custo.js
//
// Só lê (API do OPP + banco). Não altera nada, só PROPÕE um vínculo.
//
// Pra cada projeto do Par, tenta achar o centro de custo certo do OPP
// comparando o texto de "Nr_Contrato_OS" (que já guarda algo parecido com o
// nome do centro de custo) com a lista real de /centros-custo. Mostra o
// melhor candidato e um score de confiança, pra gente revisar antes de
// gravar qualquer coisa.

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

const PARAR_PALAVRAS = new Set(['ARQ', 'SAN', 'INF', 'ADM', 'DE', 'DA', 'DO', 'E', 'EM', 'NA', 'NO', 'PARA', 'PA'])

function palavrasSignificativas(s) {
  return normalizar(s).split(' ').filter(w => w.length > 2 && !PARAR_PALAVRAS.has(w))
}

// score simples: quantas palavras significativas do texto A aparecem em B (e vice-versa), + bônus por prefixo igual (SAN/ARQ/INF)
function score(a, b) {
  const wa = palavrasSignificativas(a)
  const wb = palavrasSignificativas(b)
  if (wa.length === 0 || wb.length === 0) return 0
  const setB = new Set(wb)
  const bateram = wa.filter(w => setB.has(w)).length
  const prefixoA = normalizar(a).split(' ')[0]
  const prefixoB = normalizar(b).split(' ')[0]
  const bonusPrefixo = (prefixoA && prefixoA === prefixoB) ? 0.5 : 0
  return bateram / Math.max(wa.length, wb.length) + bonusPrefixo
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

  const boas = [], duvidosas = [], semTexto = []

  for (const plan of planejamentos) {
    const textoBase = plan.Nr_Contrato_OS && plan.Nr_Contrato_OS.trim() ? plan.Nr_Contrato_OS : plan.Nome_Projeto
    if (!textoBase || !textoBase.trim()) { semTexto.push(plan); continue }

    let melhor = null, melhorScore = 0
    for (const c of centros) {
      const s = score(textoBase, c.desc_centro_custos)
      if (s > melhorScore) { melhorScore = s; melhor = c }
    }

    const linha = { plan, melhor, melhorScore }
    if (melhor && melhorScore >= 0.7) boas.push(linha)
    else duvidosas.push(linha)
  }

  console.log(`${'='.repeat(70)}`)
  console.log(`VÍNCULOS COM BOA CONFIANÇA (${boas.length})`)
  console.log('='.repeat(70))
  for (const { plan, melhor, melhorScore } of boas) {
    console.log(`  "${plan.Nome_Projeto}"`)
    console.log(`    -> id ${melhor.id_centro_custos} "${melhor.desc_centro_custos}" (score ${melhorScore.toFixed(2)})`)
  }

  console.log(`\n${'='.repeat(70)}`)
  console.log(`PRECISAM DE REVISÃO MANUAL (${duvidosas.length})`)
  console.log('='.repeat(70))
  for (const { plan, melhor, melhorScore } of duvidosas) {
    console.log(`  "${plan.Nome_Projeto}" (Nr_Contrato_OS: "${plan.Nr_Contrato_OS || '—'}")`)
    if (melhor) console.log(`    melhor candidato: id ${melhor.id_centro_custos} "${melhor.desc_centro_custos}" (score ${melhorScore.toFixed(2)})`)
    else console.log('    (nenhum candidato achado)')
  }

  if (semTexto.length > 0) {
    console.log(`\n${'='.repeat(70)}`)
    console.log(`SEM NENHUM TEXTO PRA COMPARAR (${semTexto.length})`)
    console.log('='.repeat(70))
    for (const plan of semTexto) console.log(`  "${plan.Nome_Projeto}"`)
  }

  console.log(`\nResumo: ${boas.length} boas, ${duvidosas.length} precisam revisão, ${semTexto.length} sem texto. Total: ${planejamentos.length} projetos.`)
  pool.end()
}

main().catch(e => { console.error('Erro:', e.message); pool.end() })
