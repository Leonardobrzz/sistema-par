// node backend/checar-data-invalida.js
//
// Só lê o banco. Não altera nada.
//
// Mostra o cronograma de medições planejadas (dentro do Dados_JSON) do
// projeto SAN-01 SAA UMARI, pra achar exatamente qual campo de data está
// com formato inválido (causando o "Invalid Date" na tela).

const { Pool } = require('pg')
const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://postgres.xklllcoqkreobaghdivw:402814Leo%4023@aws-1-us-east-1.pooler.supabase.com:5432/postgres',
  ssl: { rejectUnauthorized: false },
})

async function main() {
  const { rows } = await pool.query(`SELECT "ID", "Nome_Projeto", "Dados_JSON" FROM "Planejamentos" WHERE "Nome_Projeto" = 'SAN-01 SAA UMARI'`)
  if (rows.length === 0) { console.log('Projeto não encontrado.'); pool.end(); return }

  for (const r of rows) {
    console.log(`"${r.Nome_Projeto}" (ID: ${r.ID})`)
    let dados = {}
    try { dados = JSON.parse(r.Dados_JSON || '{}') } catch (e) { console.log('  Erro ao parsear Dados_JSON:', e.message); continue }
    const d = dados._baseline || dados
    const meds = d.medicoesCronograma || d.medicoes || []
    console.log(`  ${meds.length} medição(ões) no cronograma planejado:`)
    meds.forEach((m, i) => {
      const dataRaw = m.dataPrevisao ?? m.dataPrevista ?? '(sem campo de data)'
      const parsed = new Date(dataRaw + 'T00:00:00')
      const valido = !isNaN(parsed.getTime())
      console.log(`    [${i}] etapa: "${m.etapa || m.descricao || '—'}" | data crua: ${JSON.stringify(dataRaw)} | válida? ${valido ? 'sim' : 'NÃO — ESSA AQUI'}`)
    })
  }
  pool.end()
}

main().catch(e => { console.error('Erro:', e.message); pool.end() })
