// node backend/verificar-valverde-e-os153.js
//
// Só lê (API do OPP + banco). Não altera nada.
//
// 1) Confere qual(is) número(s) de OS estão cadastrados hoje no Par pra
//    ESCOLA MUNICIPAL EDUARDO VALVERDE, ESCOLA ONORINA e ESCOLA OZEIAS —
//    e busca no OPP, pelo texto da observação, a que projeto essas OS's
//    REALMENTE pertencem (já que o centro de custo delas não tem nenhum
//    lançamento, o "Total Recebido" que aparece deve estar vindo de uma OS
//    errada).
//
// 2) Acha o lançamento exato da OS 153 e mostra o id_centro_custos/
//    centro_custos_rec dele (nenhum dos meus 2 candidatos do Mulungu bateu).

require('dotenv').config()
const { Pool } = require('pg')
const { oppRequest } = require('./src/services/oppService')

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://postgres.xklllcoqkreobaghdivw:402814Leo%4023@aws-1-us-east-1.pooler.supabase.com:5432/postgres',
  ssl: { rejectUnauthorized: false },
})

async function buscarTodasReceitas() {
  let offset = 0, todos = []
  while (true) {
    const r = await oppRequest('GET', `/contas-receber?limit=250&offset=${offset}&lixeira=Nao`)
    const lista = Array.isArray(r) ? r : (r?.data || [])
    if (lista.length === 0) break
    todos.push(...lista)
    if (lista.length < 250) break
    offset += 250
    if (offset > 10000) break
  }
  return todos
}

async function main() {
  const { rows } = await pool.query(
    `SELECT "ID", "Nome_Projeto", "Nr_OS_OPP" FROM "Planejamentos" WHERE "Nome_Projeto" ILIKE $1 OR "Nome_Projeto" ILIKE $2 OR "Nome_Projeto" ILIKE $3`,
    ['%VALVERDE%', '%OZEIAS%', '%ONORINA%']
  )
  console.log('Cadastro atual no Par:')
  for (const r of rows) console.log(`  "${r.Nome_Projeto}" -> Nr_OS_OPP: "${r.Nr_OS_OPP}"`)

  console.log('\nBuscando todos os lançamentos de Contas a Receber...')
  const receitas = await buscarTodasReceitas()
  console.log(`${receitas.length} lançamentos carregados.\n`)

  const osRegex = /(?:OS\s+nro?\.\s*|ordem de servi[cç]o\s*n[º°]?\s*)(\d+)/i

  console.log('='.repeat(70))
  console.log('A que projeto pertence, de verdade, cada OS cadastrada nessas escolas:')
  console.log('='.repeat(70))
  for (const r of rows) {
    const osNums = String(r.Nr_OS_OPP || '').split(',').map(s => s.trim()).filter(Boolean)
    for (const osNum of osNums) {
      const lancs = receitas.filter(x => {
        const m = (x.observacoes_rec || '').match(osRegex)
        return m && m[1] === osNum
      })
      console.log(`\n"${r.Nome_Projeto}" tem cadastrada a OS ${osNum}:`)
      if (lancs.length === 0) console.log('  (nenhum lançamento encontrado com essa OS)')
      for (const l of lancs) {
        console.log(`  R$ ${l.valor_rec} | centro de custo: "${l.centro_custos_rec}" (id ${l.id_centro_custos})`)
        console.log(`  obs: "${(l.observacoes_rec || '').replace(/\s+/g, ' ').trim()}"`)
      }
    }
  }

  console.log(`\n${'='.repeat(70)}`)
  console.log('OS 153 — lançamento(s) encontrado(s):')
  console.log('='.repeat(70))
  const lancs153 = receitas.filter(x => {
    const m = (x.observacoes_rec || '').match(osRegex)
    return m && m[1] === '153'
  })
  if (lancs153.length === 0) console.log('  (nenhum lançamento com OS 153)')
  for (const l of lancs153) {
    console.log(`  R$ ${l.valor_rec} | ${l.liquidado_rec === 'Sim' ? 'Recebido' : 'Pendente'} | centro de custo: "${l.centro_custos_rec}" (id ${l.id_centro_custos})`)
    console.log(`  obs: "${(l.observacoes_rec || '').replace(/\s+/g, ' ').trim()}"`)
  }

  pool.end()
}

main().catch(e => { console.error('Erro:', e.message); pool.end() })
