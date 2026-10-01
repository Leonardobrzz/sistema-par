// node backend/limpar-os-incorretas.js            → modo dry-run (só mostra o que mudaria)
// node backend/limpar-os-incorretas.js --apply     → aplica (limpa o campo Nr_OS_OPP)
//
// Baseado na conferência feita com o Contas a Receber do OPP (checar-os-disputadas.js):
// esses 3 números de OS estão cadastrados no projeto ERRADO no Par. A observação
// do lançamento no OPP cita explicitamente outro projeto (ou nenhum dos dois, no
// caso da OS 120). Isso faz o Par somar dinheiro de um projeto dentro de outro.
//
// Este script só REMOVE o número errado do campo Nr_OS_OPP do projeto errado
// (não apaga o projeto, não mexe em mais nada, não inventa um número novo).
// Depois disso, alguém vai precisar achar e cadastrar a OS correta desses
// projetos manualmente, pra eles voltarem a aparecer com "Total Recebido" certo.
//
// Casos:
//  - OS 77  → é da SIAA SANTANA (confirmado pela observação). Remover da
//             FERRAZNÓPOLIS,JURACITABA,IBIRAPUÃ E LAJEDÃO.
//  - OS 164 → é do LEVANTAMENTO TOPOGRÁFICO (confirmado pela observação).
//             Remover da PAVIMENTAÇÃO NA ZONA RURAL DO MUNICÍPIO.
//  - OS 120 → é de um projeto terceiro ("Urbanização do Canal do Ambrósio"),
//             não é de nenhuma das duas escolas. Remover das duas.

const { Pool } = require('pg')
const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://postgres.xklllcoqkreobaghdivw:402814Leo%4023@aws-1-us-east-1.pooler.supabase.com:5432/postgres',
  ssl: { rejectUnauthorized: false },
})

const APPLY = process.argv.includes('--apply')

const REMOCOES = [
  { nome: 'SAN-23-SIAA FERRAZNÓPOLIS,JURACITABA,IBIRAPUÃ E LAJEDÃO - EMBASA', osRemover: '77' },
  { nome: 'INF-2026-6.PP014275-2026 PAVIMENTAÇÃO NA ZONA RURAL DO MUNICÍPIO', osRemover: '164' },
  { nome: 'ARQ-2026-3-ESCOLA MUNICIPAL OZEIAS MARTINS DA SILVA', osRemover: '120' },
  { nome: 'ARQ-2026-2-ESCOLA MUNICIPAL ONORINA DE SOUZA', osRemover: '120' },
]

async function main() {
  for (const r of REMOCOES) {
    const { rows } = await pool.query(
      'SELECT "ID", "ID_Projeto", "Nome_Projeto", "Nr_OS_OPP" FROM "Planejamentos" WHERE "Nome_Projeto" = $1',
      [r.nome]
    )

    if (rows.length === 0) {
      console.log(`[NÃO ENCONTRADO] "${r.nome}" — nenhum planejamento com esse nome exato.`)
      continue
    }
    if (rows.length > 1) {
      console.log(`[AMBÍGUO] "${r.nome}" — ${rows.length} registros com esse nome, pulei por segurança.`)
      continue
    }

    const plan = rows[0]
    const atuais = String(plan.Nr_OS_OPP || '').split(',').map(s => s.trim()).filter(Boolean)
    if (!atuais.includes(r.osRemover)) {
      console.log(`[JÁ OK] "${r.nome}" — não tem mais a OS ${r.osRemover} cadastrada (Nr_OS_OPP atual: "${plan.Nr_OS_OPP}").`)
      continue
    }

    const novos = atuais.filter(os => os !== r.osRemover)
    const novoValor = novos.join(',')
    console.log(`"${r.nome}"`)
    console.log(`  Nr_OS_OPP: "${plan.Nr_OS_OPP}" → "${novoValor}"`)

    if (APPLY) {
      await pool.query('UPDATE "Planejamentos" SET "Nr_OS_OPP" = $1 WHERE "ID" = $2', [novoValor, plan.ID])
      console.log('  -> aplicado.')
    }
  }

  if (!APPLY) {
    console.log('\nModo dry-run — nada foi alterado. Rode com --apply pra gravar.')
  } else {
    console.log('\nConcluído.')
  }
  pool.end()
}

main().catch(e => { console.error('Erro:', e.message); pool.end() })
