// node backend/checar-ordens-compra.js
//
// Só lê o banco. Não altera nada, não chama o OPP ao vivo (lê a tabela
// OrdensCompra_OPP, que o cron do server.js já mantém sincronizada a cada 2h).
//
// Confere se a tabela está populada e se a "Ordem de Compra" que vem do
// ClickUp em cada Terceirizado realmente bate com um ID_OC real sincronizado.

const { Pool } = require('pg')
const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://postgres.xklllcoqkreobaghdivw:402814Leo%4023@aws-1-us-east-1.pooler.supabase.com:5432/postgres',
  ssl: { rejectUnauthorized: false },
})

async function main() {
  const { rows: ocs } = await pool.query(`SELECT * FROM "OrdensCompra_OPP"`)
  console.log(`Total de Ordens de Compra sincronizadas (OrdensCompra_OPP): ${ocs.length}`)
  if (ocs.length === 0) {
    console.log('\nTabela vazia! Isso significa que o sync automático (a cada 2h) ainda não rodou')
    console.log('desde que o servidor foi ligado pela última vez, ou está falhando silenciosamente.')
    console.log('Pode forçar rodando o sync manual (botão de sincronizar do OPP no sistema, perfil Admin/Financeiro/Diretoria/Coordenador)')
    console.log('ou esperar o próximo ciclo do cron.')
    return pool.end()
  }

  console.log('\n=== Amostra (10 primeiras) ===')
  for (const oc of ocs.slice(0, 10)) {
    console.log(`  ID_OC="${oc.ID_OC}" | Fornecedor="${oc.Nome_Fornecedor}" | Valor_Total="${oc.Valor_Total}" | Valor_Liquidado="${oc.Valor_Liquidado}" | Situacao="${oc.Situacao}"`)
  }

  const { rows: terc } = await pool.query(`SELECT * FROM "Terceirizados" WHERE "Status" != 'Cancelado' AND "OC" IS NOT NULL AND "OC" != ''`)
  console.log(`\nTerceirizados ativos com OC preenchida: ${terc.length}`)

  const porOC = Object.fromEntries(ocs.map(o => [String(o.ID_OC).trim(), o]))
  let bateu = 0, naoBateu = 0
  for (const t of terc) {
    const ocLimpo = String(t.OC).trim()
    if (porOC[ocLimpo]) {
      bateu++
    } else {
      naoBateu++
    }
  }
  console.log(`\nResumo: ${bateu} de ${terc.length} OCs do ClickUp bateram com uma Ordem de Compra real sincronizada do OPP.`)
  console.log(`${naoBateu} não bateram.`)

  if (naoBateu > 0) {
    console.log('\n=== Amostra das que não bateram (10 primeiras) ===')
    let mostrados = 0
    for (const t of terc) {
      const ocLimpo = String(t.OC).trim()
      if (!porOC[ocLimpo] && mostrados < 10) {
        console.log(`  Servico="${t.Servico}" | OC do ClickUp="${ocLimpo}"`)
        mostrados++
      }
    }
  }

  pool.end()
}

main().catch(e => { console.error('Erro:', e.message); pool.end() })
