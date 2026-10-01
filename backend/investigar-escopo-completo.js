// node backend/investigar-escopo-completo.js
//
// Só lê (API do OPP + banco). Não altera nada.
//
// Antes de mudar o sistema inteiro pra usar centro de custo como fonte
// principal (em vez de ler texto de observação), preciso confirmar 3 coisas:
//
//  1) O que o campo "Nr_Contrato_OS" do Par realmente guarda hoje (pra saber
//     se já dá pra reaproveitar ele, ou se precisa de um campo novo).
//
//  2) Se o Contas a Pagar do OPP também tem centro de custo preenchido que
//     nem o Contas a Receber (achamos 97% de cobertura lá).
//
//  3) Quantos dos ~189 centros de custo cadastrados no OPP batem, por nome,
//     com algum projeto do Par (pra ter uma ideia do tamanho do trabalho de
//     mapear projeto <-> centro de custo).

require('dotenv').config()
const { Pool } = require('pg')
const { oppRequest } = require('./src/services/oppService')

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://postgres.xklllcoqkreobaghdivw:402814Leo%4023@aws-1-us-east-1.pooler.supabase.com:5432/postgres',
  ssl: { rejectUnauthorized: false },
})

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
  return todos
}

async function buscarTudoPaginado(path, extra = '') {
  let offset = 0, todos = []
  while (true) {
    const r = await oppRequest('GET', `${path}?limit=250&offset=${offset}${extra}`)
    const lista = Array.isArray(r) ? r : (r?.data || [])
    if (lista.length === 0) break
    todos.push(...lista)
    if (lista.length < 250) break
    offset += 250
    if (offset > 10000) break
  }
  return todos
}

function normalizar(s) {
  return (s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase()
}

async function main() {
  // 1) O que tem no campo Nr_Contrato_OS hoje
  console.log('='.repeat(70))
  console.log('1) Amostra do campo Nr_Contrato_OS em Planejamentos')
  console.log('='.repeat(70))
  const { rows: amostra } = await pool.query(
    `SELECT "Nome_Projeto", "Nr_OS_OPP", "Nr_Contrato_OS" FROM "Planejamentos" WHERE "Nr_Contrato_OS" IS NOT NULL AND "Nr_Contrato_OS" != '' LIMIT 15`
  )
  for (const r of amostra) console.log(`  "${r.Nome_Projeto}" | Nr_OS_OPP: "${r.Nr_OS_OPP}" | Nr_Contrato_OS: "${r.Nr_Contrato_OS}"`)
  const { rows: totalComContrato } = await pool.query(`SELECT COUNT(*) FROM "Planejamentos" WHERE "Nr_Contrato_OS" IS NOT NULL AND "Nr_Contrato_OS" != ''`)
  const { rows: totalPlan } = await pool.query(`SELECT COUNT(*) FROM "Planejamentos"`)
  console.log(`\n${totalComContrato[0].count} de ${totalPlan[0].count} projetos têm Nr_Contrato_OS preenchido.`)

  // 2) Contas a Pagar: tem centro de custo igual o Receber?
  console.log(`\n${'='.repeat(70)}`)
  console.log('2) Contas a Pagar — cobertura de centro de custo')
  console.log('='.repeat(70))
  const pagar = await buscarTudoPaginado('/contas-pagar', '&lixeira=Nao')
  console.log(`${pagar.length} lançamentos de Contas a Pagar carregados.`)
  if (pagar.length > 0) {
    console.log('\nExemplo de um lançamento cru (todos os campos):')
    console.log(JSON.stringify(pagar[0], null, 2).slice(0, 2500))
    const comCentro = pagar.filter(p => p.id_centro_custos && Number(p.id_centro_custos) !== 0)
    console.log(`\nCom id_centro_custos preenchido: ${comCentro.length} de ${pagar.length}`)
  }

  // 3) Quantos centros de custo batem por nome com algum projeto do Par
  console.log(`\n${'='.repeat(70)}`)
  console.log('3) Quantos centros de custo dá pra casar automaticamente por nome')
  console.log('='.repeat(70))
  const centros = await buscarTodosCentrosCusto()
  const { rows: projetos } = await pool.query(`SELECT "Nome_Projeto" FROM "Planejamentos"`)
  const nomesProjetos = projetos.map(p => normalizar(p.Nome_Projeto))

  let bateram = 0
  for (const c of centros) {
    const descNorm = normalizar(c.desc_centro_custos)
    const palavras = descNorm.split(/\s+/).filter(w => w.length > 3 && !['ARQ', 'SAN', 'INF', 'ADM'].includes(w))
    const achou = nomesProjetos.some(nome => palavras.filter(p => nome.includes(p)).length >= 2)
    if (achou) bateram++
  }
  console.log(`${bateram} de ${centros.length} centros de custo têm um projeto no Par com nome parecido (batendo em pelo menos 2 palavras-chave).`)
  console.log('(Isso é só uma estimativa grosseira — o mapeamento de verdade precisa ser conferido caso a caso.)')

  pool.end()
}

main().catch(e => { console.error('Erro:', e.message); pool.end() })
