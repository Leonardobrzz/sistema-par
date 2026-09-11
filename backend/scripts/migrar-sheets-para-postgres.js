// Migração Google Sheets → PostgreSQL
// Executa: node backend/scripts/migrar-sheets-para-postgres.js
//
// Requisitos: variáveis de ambiente com credenciais de AMBOS os serviços.
// No Railway: rode localmente com as vars do Railway via railway run, ou crie um
// endpoint temporário /api/migrar que chame este script no servidor.

require('dotenv').config({ path: require('path').join(__dirname, '../.env') })

const sheets  = require('../src/services/googleSheetsService')
const pg      = require('../src/services/postgresService')

// Ordem importa: tabelas com FK devem vir depois das referenciadas
const TABELAS = [
  { name: 'USER',               pk: 'ID' },
  { name: 'Projetos_Contratos', pk: 'ID_Projeto' },
  { name: 'Planejamentos',      pk: 'ID' },
  { name: 'Medicoes',           pk: 'ID_Medicao' },
  { name: 'Terceirizados',      pk: 'ID' },
  { name: 'Equipe_Planejamento',pk: 'ID' },
  { name: 'Despesas_Planejamento', pk: 'ID' },
  { name: 'Log_Horas',          pk: 'ID' },
  { name: 'Custos_OPP',         pk: 'ID' },
  { name: 'Alertas',            pk: 'ID' },
  { name: 'Log_Importacoes',    pk: 'ID' },
  { name: 'Configuracoes',      pk: 'Chave' },
  { name: 'Financeiro_OPP',     pk: 'ID_OPP' },
  { name: 'OrdensCompra_OPP',   pk: 'ID_OC' },
]

async function migrar() {
  console.log('=== Migração Google Sheets → PostgreSQL ===\n')

  // Garante que todas as tabelas existem no PG
  console.log('Criando tabelas no PostgreSQL...')
  await pg.ensureSheetsExist()
  console.log('Tabelas OK.\n')

  let totalMigrado = 0
  let totalErros   = 0

  for (const tabela of TABELAS) {
    process.stdout.write(`[${tabela.name}] Lendo Sheets... `)
    let rows
    try {
      rows = await sheets.readSheet(tabela.name)
    } catch (e) {
      console.log(`ERRO ao ler: ${e.message}`)
      totalErros++
      continue
    }

    // Filtra linhas sem PK
    const validas = rows.filter(r => r[tabela.pk] && String(r[tabela.pk]).trim())
    process.stdout.write(`${validas.length} registros. Inserindo no PG... `)

    if (validas.length === 0) {
      console.log('vazio, pulando.')
      continue
    }

    try {
      await pg.insertManyRows(tabela.name, validas)
      console.log('OK')
      totalMigrado += validas.length
    } catch (e) {
      console.log(`ERRO ao inserir: ${e.message}`)
      totalErros++
    }
  }

  console.log(`\n=== Concluído ===`)
  console.log(`Total migrado: ${totalMigrado} registros`)
  console.log(`Tabelas com erro: ${totalErros}`)
  console.log('\nPróximo passo: setar USE_POSTGRES=true no Railway.')
  process.exit(0)
}

migrar().catch(e => { console.error('FALHA GERAL:', e); process.exit(1) })
