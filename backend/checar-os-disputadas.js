// node backend/checar-os-disputadas.js
//
// Só lê (API do OPP + banco). Não altera nada.
//
// Pra cada O.S. disputada (cadastrada em mais de um projeto no Par), mostra:
//  1) quais projetos do Par estão usando esse número
//  2) quais lançamentos de Contas a Receber no OPP mencionam essa OS na
//     observação (é assim que o Par calcula "Total Recebido" hoje — não existe
//     uma tela de "Ordens de Serviço" separada sendo usada de verdade)
//
// Com isso dá pra ver, pelo nome do cliente e valor de cada lançamento, qual
// dos projetos do Par realmente bate com o que está no OPP.

require('dotenv').config()
const { Pool } = require('pg')
const { oppRequest } = require('./src/services/oppService')

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
})

const OS_A_CHECAR = ['77', '91', '92', '93', '94', '95', '105', '120', '153', '164']

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
  const { rows: planejamentos } = await pool.query(
    'SELECT "ID_Projeto", "Nome_Projeto", "Nr_OS_OPP", "Nr_Contrato_OS", "Status" FROM "Planejamentos"'
  )

  console.log('Buscando Contas a Receber no OPP (pode demorar um pouco)...')
  const receitas = await buscarTodasReceitas()
  console.log(`${receitas.length} lançamentos carregados.\n`)

  const osRegex = /(?:OS\s+nro?\.\s*|ordem de servi[cç]o\s*n[º°]?\s*)(\d+)/i

  for (const osNum of OS_A_CHECAR) {
    console.log(`${'='.repeat(70)}`)
    console.log(`OS ${osNum}`)
    console.log('='.repeat(70))

    const projetosPar = planejamentos.filter(p =>
      String(p.Nr_OS_OPP || '').split(',').map(s => s.trim()).includes(osNum)
    )
    console.log(`\nCadastrado no Par (${projetosPar.length} projeto(s)):`)
    for (const p of projetosPar) {
      console.log(`  - [${p.Status}] ${p.Nome_Projeto}  (Centro de Custo: "${p.Nr_Contrato_OS || '—'}")`)
    }

    const lancamentos = receitas.filter(r => {
      const m = (r.observacoes_rec || '').match(osRegex)
      return m && m[1] === osNum
    })
    console.log(`\nLançamentos no OPP (Contas a Receber) mencionando "OS ${osNum}" (${lancamentos.length}):`)
    if (lancamentos.length === 0) console.log('  (nenhum lançamento encontrado com esse número na observação)')
    for (const l of lancamentos) {
      console.log(`  - ${l.nome_cliente || '(sem cliente)'} | R$ ${l.valor_rec} | ${l.liquidado_rec === 'Sim' ? 'Recebido' : 'Pendente'} | ${l.data_pagamento || l.data_rec || '—'}`)
      console.log(`    obs: "${l.observacoes_rec}"`)
    }
    console.log('')
  }

  pool.end()
}

main().catch(e => { console.error('Erro:', e.message); pool.end() })
