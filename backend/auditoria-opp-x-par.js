// node backend/auditoria-opp-x-par.js
//
// Só lê (API do OPP + banco). Não altera nada.
//
// Relatório de conferência: pra cada projeto aprovado do Par, mostra o que o
// OPP diz (pelo centro de custo, quando confirmado) sobre receita recebida,
// pendente e despesa paga — pra bater o olho e ver se faz sentido, e achar
// qualquer coisa estranha (valor recebido maior que o contrato, despesa muito
// alta, etc.) antes mesmo de abrir o Par.

require('dotenv').config()
const { Pool } = require('pg')
const { oppRequest } = require('./src/services/oppService')

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://postgres.xklllcoqkreobaghdivw:402814Leo%4023@aws-1-us-east-1.pooler.supabase.com:5432/postgres',
  ssl: { rejectUnauthorized: false },
})

const pBR = (v) => {
  const s = String(v || 0).trim()
  if (s.includes(',')) return parseFloat(s.replace(/\./g, '').replace(',', '.')) || 0
  const parts = s.split('.')
  if (parts.length === 2 && parts[1].length <= 2) return parseFloat(s) || 0
  return parseFloat(s.replace(/\./g, '')) || 0
}

async function paginar(endpoint) {
  let offset = 0, todos = []
  while (true) {
    const r = await oppRequest('GET', `${endpoint}?limit=250&offset=${offset}&lixeira=Nao`)
    const lista = Array.isArray(r) ? r : (r?.data || [])
    if (lista.length === 0) break
    todos.push(...lista)
    if (lista.length < 250) break
    offset += 250
    if (offset > 10000) break
  }
  return todos
}

function fmt(v) {
  return 'R$ ' + v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

async function main() {
  const { rows: planejamentos } = await pool.query(
    `SELECT "ID_Projeto", "Nome_Projeto", "Status", "Valor_Contrato", "Dados_JSON", "ID_Centro_Custo_OPP", "Nr_OS_OPP" FROM "Planejamentos" WHERE "Status" = 'Aprovado' ORDER BY "Nome_Projeto"`
  )

  console.log('Buscando Contas a Receber e Contas a Pagar no OPP...')
  const [receitas, despesas] = await Promise.all([paginar('/contas-receber'), paginar('/contas-pagar')])
  console.log(`${receitas.length} receitas, ${despesas.length} despesas carregadas.\n`)

  const recebidoPorCC = {}, pendentePorCC = {}, pagoPorCC = {}
  for (const r of receitas) {
    if (r.lixeira === 'Sim') continue
    const ccId = String(r.id_centro_custos || '')
    if (!ccId || ccId === '0') continue
    const v = parseFloat(r.valor_rec || 0)
    if (r.liquidado_rec === 'Sim') recebidoPorCC[ccId] = (recebidoPorCC[ccId] || 0) + v
    else pendentePorCC[ccId] = (pendentePorCC[ccId] || 0) + v
  }
  for (const d of despesas) {
    if (d.lixeira === 'Sim') continue
    const ccId = String(d.id_centro_custos || '')
    if (!ccId || ccId === '0') continue
    pagoPorCC[ccId] = (pagoPorCC[ccId] || 0) + parseFloat(d.valor_pago || 0)
  }

  let comVinculo = 0, semVinculo = 0
  const alertas = []

  console.log('='.repeat(100))
  for (const plan of planejamentos) {
    let V = pBR(plan.Valor_Contrato)
    try {
      const dados = JSON.parse(plan.Dados_JSON || '{}')
      const d = dados._baseline || dados
      if (d.valorContrato) V = pBR(d.valorContrato)
    } catch {}

    const ccId = plan.ID_Centro_Custo_OPP ? String(plan.ID_Centro_Custo_OPP) : null
    if (ccId) comVinculo++; else semVinculo++

    const recebido = ccId ? (recebidoPorCC[ccId] || 0) : null
    const pendente = ccId ? (pendentePorCC[ccId] || 0) : null
    const pago = ccId ? (pagoPorCC[ccId] || 0) : null

    console.log(`\n${plan.Nome_Projeto}`)
    console.log(`  Vínculo centro de custo: ${ccId || '(NÃO CONFIRMADO — usando método antigo por OS)'}`)
    console.log(`  Valor do contrato:  ${fmt(V)}`)
    if (ccId) {
      console.log(`  Recebido (OPP):     ${fmt(recebido)}  ${V > 0 ? '(' + (recebido / V * 100).toFixed(1) + '% do contrato)' : ''}`)
      console.log(`  Pendente (OPP):     ${fmt(pendente)}`)
      console.log(`  Pago em despesas:   ${fmt(pago)}`)

      if (V > 0 && recebido > V * 1.05) {
        alertas.push(`"${plan.Nome_Projeto}": recebeu ${fmt(recebido)} mas o contrato é só ${fmt(V)} — recebeu MAIS que o contrato!`)
      }
      if (V > 0 && pago > V) {
        alertas.push(`"${plan.Nome_Projeto}": pagou ${fmt(pago)} em despesas, mais que o próprio valor do contrato (${fmt(V)}).`)
      }
    } else {
      console.log(`  Nr_OS_OPP atual: "${plan.Nr_OS_OPP || '—'}"`)
    }
  }

  console.log(`\n${'='.repeat(100)}`)
  console.log(`RESUMO: ${comVinculo} projetos com centro de custo confirmado, ${semVinculo} ainda no método antigo.`)
  if (alertas.length > 0) {
    console.log(`\n${alertas.length} ALERTA(S) — coisas que merecem uma olhada:`)
    for (const a of alertas) console.log(`  - ${a}`)
  } else {
    console.log('\nNenhum alerta — nada saltou aos olhos como errado.')
  }

  pool.end()
}

main().catch(e => { console.error('Erro:', e.message); pool.end() })
