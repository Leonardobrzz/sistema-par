// node backend/diagnostico-os-duplicada.js
//
// Só lê, não altera nada.
//
// Cada projeto no Par tem um "Nr_OS_OPP" (o número da Ordem de Serviço no OPP).
// O "Total Recebido" que aparece nos relatórios é calculado somando tudo que o
// OPP registrou como recebido para aquele número de OS. Se dois projetos
// diferentes estiverem cadastrados com o MESMO número de OS (erro de digitação,
// copia-e-cola, ou os dois vinculados à OS errada), o Par soma o dinheiro de um
// projeto dentro do outro — e aí "bate" tudo errado, mesmo sem nenhum bug de
// parser. Foi isso que parece ter acontecido com a ESCOLA MUNICIPAL EDUARDO
// VALVERDE (mostrando quase o dobro do contrato como recebido).

const { Pool } = require('pg')
const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://postgres.xklllcoqkreobaghdivw:402814Leo%4023@aws-1-us-east-1.pooler.supabase.com:5432/postgres',
  ssl: { rejectUnauthorized: false },
})

async function main() {
  const { rows } = await pool.query(
    'SELECT "ID_Projeto", "Nome_Projeto", "Status", "Nr_OS_OPP", "Nr_Contrato_OS" FROM "Planejamentos"'
  )

  const porOS = {}
  for (const p of rows) {
    const osNums = String(p.Nr_OS_OPP || '').split(',').map(s => s.trim()).filter(Boolean)
    for (const os of osNums) {
      if (!porOS[os]) porOS[os] = []
      porOS[os].push(p)
    }
  }

  const duplicadas = Object.entries(porOS).filter(([, lista]) => lista.length > 1)

  if (duplicadas.length === 0) {
    console.log('Nenhuma OS duplicada entre projetos diferentes. Tudo certo nesse ponto.')
  } else {
    console.log(`\nEncontradas ${duplicadas.length} OS usadas em mais de um projeto:\n`)
    for (const [os, lista] of duplicadas) {
      console.log(`OS "${os}" — usada por ${lista.length} projetos:`)
      for (const p of lista) {
        console.log(`   [${p.Status}] ${p.Nome_Projeto}  (Centro de Custo: "${p.Nr_Contrato_OS || '—'}")`)
      }
      console.log('')
    }
  }

  pool.end()
}

main().catch(e => { console.error('Erro:', e.message); pool.end() })
