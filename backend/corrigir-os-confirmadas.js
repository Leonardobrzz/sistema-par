// node backend/corrigir-os-confirmadas.js            → dry-run
// node backend/corrigir-os-confirmadas.js --apply     → aplica
//
// Aplica só os casos que já foram 100% confirmados comparando o texto das
// observações do Contas a Receber do OPP com o nome de cada projeto:
//
//  1) SAN-23-SIAA FERRAZNÓPOLIS,JURACITABA,IBIRAPUÃ E LAJEDÃO - EMBASA
//     A descrição bate palavra por palavra com o projeto, mas o número de OS
//     foi mudando a cada medição (mesmo contrato Nº 460022041). Números reais:
//     83, 86, 116, 129, 159, 168, 169. Define a lista inteira (substitui a OS
//     77 errada, que é da SIAA SANTANA).
//
//  2) INF-2026-03 - CONSTRUÇÃO DE PASSAGEM MOLHADA CV 993599-2026
//     Achada a OS 171 ("PROJETO DE CONSTRUÇÃO DE PASSAGEM MOLHADA (PP N°
//     5657/2026)"), que bate com o nome do projeto. Adiciona a OS 171 à lista
//     que já existe (mantém a 105, que ainda está em aberto pra confirmar com
//     o chefe — não é removida aqui).

const { Pool } = require('pg')
const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://postgres.xklllcoqkreobaghdivw:402814Leo%4023@aws-1-us-east-1.pooler.supabase.com:5432/postgres',
  ssl: { rejectUnauthorized: false },
})

const APPLY = process.argv.includes('--apply')

async function definirLista(nome, novaLista) {
  const { rows } = await pool.query(
    'SELECT "ID", "Nr_OS_OPP" FROM "Planejamentos" WHERE "Nome_Projeto" = $1',
    [nome]
  )
  if (rows.length !== 1) {
    console.log(`[PULEI] "${nome}" — encontrei ${rows.length} registro(s), esperava 1.`)
    return
  }
  const plan = rows[0]
  console.log(`"${nome}"`)
  console.log(`  Nr_OS_OPP: "${plan.Nr_OS_OPP}" → "${novaLista}"`)
  if (APPLY) {
    await pool.query('UPDATE "Planejamentos" SET "Nr_OS_OPP" = $1 WHERE "ID" = $2', [novaLista, plan.ID])
    console.log('  -> aplicado.')
  }
}

async function adicionarNaLista(nome, osAdicionar) {
  const { rows } = await pool.query(
    'SELECT "ID", "Nr_OS_OPP" FROM "Planejamentos" WHERE "Nome_Projeto" = $1',
    [nome]
  )
  if (rows.length !== 1) {
    console.log(`[PULEI] "${nome}" — encontrei ${rows.length} registro(s), esperava 1.`)
    return
  }
  const plan = rows[0]
  const atuais = String(plan.Nr_OS_OPP || '').split(',').map(s => s.trim()).filter(Boolean)
  if (atuais.includes(osAdicionar)) {
    console.log(`[JÁ OK] "${nome}" — já tem a OS ${osAdicionar} (Nr_OS_OPP: "${plan.Nr_OS_OPP}").`)
    return
  }
  const novaLista = [...atuais, osAdicionar].join(',')
  console.log(`"${nome}"`)
  console.log(`  Nr_OS_OPP: "${plan.Nr_OS_OPP}" → "${novaLista}"`)
  if (APPLY) {
    await pool.query('UPDATE "Planejamentos" SET "Nr_OS_OPP" = $1 WHERE "ID" = $2', [novaLista, plan.ID])
    console.log('  -> aplicado.')
  }
}

async function main() {
  await definirLista('SAN-23-SIAA FERRAZNÓPOLIS,JURACITABA,IBIRAPUÃ E LAJEDÃO - EMBASA', '83,86,116,129,159,168,169')
  await adicionarNaLista('INF-2026-03 - CONSTRUÇÃO DE PASSAGEM MOLHADA CV 993599-2026', '171')

  if (!APPLY) console.log('\nModo dry-run — nada foi alterado. Rode com --apply pra gravar.')
  else console.log('\nConcluído.')
  pool.end()
}

main().catch(e => { console.error('Erro:', e.message); pool.end() })
