// node backend/limpar-terceirizados-fantasma.js           (dry-run, só mostra o que mudaria)
// node backend/limpar-terceirizados-fantasma.js --apply    (aplica de verdade)
//
// Zera o ID_Projeto de registros de Terceirizados que hoje apontam pra um dos
// 8 projetos "fantasma" (listas internas do ClickUp - pasta Gestão/Terceirizados -
// que foram importadas por engano como se fossem projeto de cliente, em algum
// sync antigo antes do filtro de espaço existir). Depois de rodar isso, esses
// registros voltam a aparecer como "sem projeto" até que um link de verdade
// seja encontrado (o campo ID_Projeto fica vazio, igual quando a tarefa nunca
// teve o campo "Local da Tarefa no projeto" preenchido no ClickUp).
//
// Não mexe em nenhum outro campo (Fornecedor, OC, Status, etc.) - só no vínculo
// de projeto errado.

const { Pool } = require('pg')
const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://postgres.xklllcoqkreobaghdivw:402814Leo%4023@aws-1-us-east-1.pooler.supabase.com:5432/postgres',
  ssl: { rejectUnauthorized: false },
})

const APPLY = process.argv.includes('--apply')

// IDs confirmados no diagnóstico como "fantasma" (nome de lista interna do
// ClickUp, Setor vazio ou "Contratação", nunca um dos 3 setores reais)
const FANTASMA_IDS = [
  'b7066994-b616-4af1-84bd-17afdc208fc8',
  '8b27fc00-bca1-4941-9934-5dd43723960a',
  '5918f2ba-2701-4bd9-b65a-7da5d8b38a99',
  '1a337b27-9760-4ebe-b6d6-b623ec4d65db',
  '68135632-d444-4dd7-b589-e7078173b8d1',
  'f82568a0-7465-47e5-83f1-1fdb04ff9b3e',
  '2ddbdecd-e4f4-493c-bb3f-d84189635d84',
  '2d6a39fe-a880-4e13-830f-d9fc66944b0f',
]

async function main() {
  const { rows: afetados } = await pool.query(
    `SELECT t."ID", t."Servico", t."Fornecedor", t."Responsavel", t."ID_Projeto", p."Nome" AS "NomeProjetoFantasma"
     FROM "Terceirizados" t
     LEFT JOIN "Projetos_Contratos" p ON p."ID_Projeto" = t."ID_Projeto"
     WHERE t."ID_Projeto" = ANY($1::text[])`,
    [FANTASMA_IDS]
  )

  console.log(`Modo: ${APPLY ? 'APLICANDO DE VERDADE' : 'DRY-RUN (nada será alterado)'}`)
  console.log(`Encontrados ${afetados.length} registros de Terceirizados apontando pra projeto fantasma:\n`)

  for (const r of afetados) {
    console.log(`  ID=${r.ID} | Servico="${r.Servico || ''}" | Fornecedor/Responsavel="${r.Fornecedor || r.Responsavel || ''}" | projeto fantasma="${r.NomeProjetoFantasma || '(nome não encontrado)'}"`)
  }

  if (afetados.length === 0) {
    console.log('\nNada a fazer.')
    return pool.end()
  }

  if (!APPLY) {
    console.log(`\nRode de novo com --apply pra zerar o ID_Projeto desses ${afetados.length} registros.`)
    return pool.end()
  }

  const ids = afetados.map(r => r.ID)
  const { rowCount } = await pool.query(
    `UPDATE "Terceirizados" SET "ID_Projeto" = NULL WHERE "ID" = ANY($1::text[])`,
    [ids]
  )
  console.log(`\n${rowCount} registros atualizados (ID_Projeto zerado).`)
  pool.end()
}

main().catch(e => { console.error('Erro:', e.message); pool.end() })
