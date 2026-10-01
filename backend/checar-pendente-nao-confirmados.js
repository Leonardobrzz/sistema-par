// node backend/checar-pendente-nao-confirmados.js
//
// Só lê o banco + a API do OPP. Não altera nada.
//
// Pega os projetos aprovados que AINDA NÃO têm o vínculo de centro de custo
// confirmado (ID_Centro_Custo_OPP) e calcula, pra cada um, quanto o método
// antigo (Nr_OS_OPP + regex na observação) e o casamento por texto
// (Nr_Contrato_OS vs. descrição do centro de custo) dizem que falta receber
// — pra ver se esse "buraco" no A Receber do Dashboard é relevante ou não
// enquanto essa lista não é confirmada com o chefe.

require('dotenv').config()
const { Pool } = require('pg')
const { oppRequest } = require('./src/services/oppService')

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://postgres.xklllcoqkreobaghdivw:402814Leo%4023@aws-1-us-east-1.pooler.supabase.com:5432/postgres',
  ssl: { rejectUnauthorized: false },
})

function fmt(v) {
  return 'R$ ' + (v || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
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

async function main() {
  const { rows: aprovados } = await pool.query(
    `SELECT "ID_Projeto", "Nome_Projeto", "Valor_Contrato", "Nr_OS_OPP", "Nr_Contrato_OS", "ID_Centro_Custo_OPP"
     FROM "Planejamentos" WHERE "Status" = 'Aprovado' ORDER BY "Nome_Projeto"`
  )
  const naoConfirmados = aprovados.filter(p => !p.ID_Centro_Custo_OPP)

  console.log(`${aprovados.length} projetos aprovados no total, ${naoConfirmados.length} ainda SEM centro de custo confirmado:\n`)
  naoConfirmados.forEach(p => console.log(`  - "${p.Nome_Projeto}" | Nr_OS_OPP: "${p.Nr_OS_OPP || '—'}" | Nr_Contrato_OS: "${p.Nr_Contrato_OS || '—'}"`))

  console.log('\nBuscando Contas a Receber e lista de Centros de Custo no OPP...')
  const [receitas, todosCC] = await Promise.all([
    paginar('/contas-receber'),
    oppRequest('GET', '/centros-custo?limit=500'),
  ])
  const listaCC = Array.isArray(todosCC) ? todosCC : (todosCC?.data || [])
  console.log(`${receitas.length} receitas, ${listaCC.length} centros de custo carregados.\n`)

  // Método antigo 1: regex na observação, casado por número de OS
  const osRegex = /(?:OS\s+nro?\.\s*|ordem de servi[cç]o\s*n[º°]?\s*)(\d+)/i
  const pendentesPorOS = {}
  const recebidoPorOS = {}
  for (const r of receitas) {
    if (r.lixeira === 'Sim') continue
    const v = parseFloat(r.valor_rec || 0)
    const liquidado = r.liquidado_rec === 'Sim'
    const obs = r.observacoes_rec || ''
    const match = obs.match(osRegex)
    if (!match) continue
    const osNum = match[1]
    if (liquidado) recebidoPorOS[osNum] = (recebidoPorOS[osNum] || 0) + v
    else pendentesPorOS[osNum] = (pendentesPorOS[osNum] || 0) + v
  }

  // Método antigo 2: casamento por texto (Nr_Contrato_OS vs. descrição do CC)
  function findCC(nome) {
    if (!nome) return null
    const norm = nome.toLowerCase().trim()
    return listaCC.find(c => {
      const desc = (c.desc_centro_custos || '').toLowerCase().trim()
      return desc === norm || desc.includes(norm) || norm.includes(desc)
    }) || null
  }
  const pendentePorCCId = {}
  const recebidoPorCCId = {}
  for (const r of receitas) {
    if (r.lixeira === 'Sim') continue
    const v = parseFloat(r.valor_rec || 0)
    const ccId = String(r.id_centro_custos || '')
    if (!ccId || ccId === '0') continue
    if (r.liquidado_rec === 'Sim') recebidoPorCCId[ccId] = (recebidoPorCCId[ccId] || 0) + v
    else pendentePorCCId[ccId] = (pendentePorCCId[ccId] || 0) + v
  }

  console.log('='.repeat(100))
  let totalPendenteOS = 0
  let totalPendenteFuzzy = 0
  let qtdComAlgumaPista = 0

  for (const p of naoConfirmados) {
    const osNums = String(p.Nr_OS_OPP || '').split(',').map(s => s.trim()).filter(Boolean)
    const pendenteOS = osNums.reduce((s, n) => s + (pendentesPorOS[n] || 0), 0)
    const recebidoOS = osNums.reduce((s, n) => s + (recebidoPorOS[n] || 0), 0)

    const ccFuzzy = findCC(p.Nr_Contrato_OS || '')
    const ccIdFuzzy = ccFuzzy ? String(ccFuzzy.id_centro_custos) : null
    const pendenteFuzzy = ccIdFuzzy ? (pendentePorCCId[ccIdFuzzy] || 0) : 0
    const recebidoFuzzy = ccIdFuzzy ? (recebidoPorCCId[ccIdFuzzy] || 0) : 0

    totalPendenteOS += pendenteOS
    totalPendenteFuzzy += pendenteFuzzy
    if (pendenteOS || pendenteFuzzy || recebidoOS || recebidoFuzzy) qtdComAlgumaPista++

    console.log(`\n"${p.Nome_Projeto}"`)
    console.log(`  Valor do contrato: ${fmt(parseFloat(String(p.Valor_Contrato || 0).replace(/\./g,'').replace(',','.')) || 0)}`)
    console.log(`  Via Nr_OS_OPP ("${p.Nr_OS_OPP || '—'}"):        pendente ${fmt(pendenteOS)}  | recebido ${fmt(recebidoOS)}`)
    console.log(`  Via texto (Nr_Contrato_OS → "${ccFuzzy ? ccFuzzy.desc_centro_custos : 'sem match'}"): pendente ${fmt(pendenteFuzzy)}  | recebido ${fmt(recebidoFuzzy)}`)
  }

  console.log(`\n${'='.repeat(100)}`)
  console.log(`RESUMO — ${naoConfirmados.length} projetos aprovados ainda sem vínculo confirmado:`)
  console.log(`  ${qtdComAlgumaPista} deles têm ALGUMA pista de valor no OPP (via OS ou texto).`)
  console.log(`  Total pendente estimado (método OS):    ${fmt(totalPendenteOS)}`)
  console.log(`  Total pendente estimado (método texto):  ${fmt(totalPendenteFuzzy)}`)
  console.log(`\n(Esses valores NÃO entram no "A Receber" do Dashboard hoje pra quem não tiver Nr_OS_OPP preenchido corretamente — servem só pra dar uma ideia do tamanho do buraco.)`)

  pool.end()
}

main().catch(e => { console.error('Erro:', e.message); pool.end() })
