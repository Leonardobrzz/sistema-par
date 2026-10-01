// Script para aplicar mapeamentos OS OPP nos planejamentos
// Executa: node backend/scripts/aplicar-vinculos-os.js
require('dotenv').config({ path: require('path').join(__dirname, '../../.env') })
if (!process.env.GOOGLE_SHEET_ID) require('dotenv').config({ path: require('path').join(__dirname, '../.env') })
const db = require('../src/services/googleSheetsService')

// Mapeamentos confirmados: nome parcial do projeto → OS(s) do OPP
const MAPEAMENTOS = [
  { nome: 'PAVIMENTAÇÃO E PASSAGEM MOLHADA NO TRECHO QUE LIGA CANAPI',  os: '79' },
  { nome: 'ABATEDOURO FRIGORÍFICO DE BOVINOS',                           os: '95' },
  { nome: 'DELEGACIA DE POLÍCIA FEDERAL DE CAMPINA GRANDE',              os: '90' },
  { nome: 'SAA INEMA E PIMENTEIRA',                                      os: '78' },
  { nome: 'SAA WENCESLAU',                                               os: '115' },
  { nome: 'SAA RIO REAL',                                                os: '72' },
  { nome: 'SAA LAFAIETE COUTINHO',                                       os: '73' },
  { nome: 'HOSPITAL REGIONAL DE JUAZEIRO',                               os: '40' },
  { nome: 'HOSPITAL REGIONAL DE SANTO ANTÔNIO DE JESUS',                 os: '38' },
  { nome: 'HOSPITAL GERAL MANOEL VICTORINO',                             os: '39' },
  { nome: 'REFORMA E.E.F. EMÍLIA QUEIROZ',                               os: '127' },
  { nome: 'LEVANTAMENTOS TOPOGRÁFICOS LOC. DE BARRO VERMELHO',          os: '155' },
  { nome: 'MANUTENÇÃO DE ARENINHAS',                                     os: '161' },
  { nome: 'CALÇADÃO DA RUA JOSÉ LOPES FILHO',                           os: '152' },
  { nome: 'LEVANTAMENTO TOPOGRÁFICO EM RUAS DA SEDE',                   os: '164' },
  { nome: 'CLUBE DOS SERVIDORES',                                        os: '145' },
  { nome: 'ESPAÇO ALTERNATIVO',                                          os: '117' },
  { nome: 'DRENAGEM URBANA NO BAIRRO DA GAMELEIRA',                     os: '119' },
  { nome: 'INFRAESTRUTURA VIARIA E PATAMARIZAÇÃO DO CENTRO DE TREINAMENTO DE AGUA BOA', os: '149' },
  { nome: 'REFORMA DA SEDE DO DER',                                      os: '43,62,63' },
  { nome: 'SIAA SANTANA',                                                os: '3' },
  { nome: 'SIAA FERRAZNÓPOLIS',                                          os: '77' },
  { nome: 'SAA WENCESLAU',                                               os: '115' },
  { nome: 'MERCADO DO PRODUTOR',                                         os: '93' },
  { nome: 'REFORMA E ESCOLA MUNICIPAL ONORINA',                          os: '120' },
  { nome: 'REFORMA E ESCOLA MUNICIPAL OZEIAS',                           os: '120' },
  { nome: 'ESCOLA MUNICIPAL EDUARDO VALVERDE',                           os: '98' },
  { nome: 'ESCOLA 5 SALAS',                                              os: '162' },
]

async function main() {
  console.log('Lendo planejamentos...')
  const rows = await db.readSheet('Planejamentos')
  const aprovados = rows.filter(p => p.Status === 'Aprovado')
  console.log(`${aprovados.length} planejamentos aprovados\n`)

  let atualizados = 0, ignorados = 0

  for (const map of MAPEAMENTOS) {
    const nomeNorm = map.nome.toLowerCase()
    const proj = aprovados.find(p => (p.Nome_Projeto || '').toLowerCase().includes(nomeNorm))
    if (!proj) {
      console.log(`  ⚠ Não encontrado: "${map.nome}"`)
      ignorados++
      continue
    }
    const osAtual = proj.Nr_OS_OPP || ''
    if (osAtual === map.os) {
      console.log(`  = Já correto: ${proj.Nome_Projeto} → OS ${map.os}`)
      continue
    }
    console.log(`  ✓ ${proj.Nome_Projeto}`)
    console.log(`    OS: ${osAtual || '(vazio)'} → ${map.os}`)
    await db.updateRowById('Planejamentos', 'ID', proj.ID, { ...proj, Nr_OS_OPP: map.os })
    atualizados++
  }

  console.log(`\nConcluído: ${atualizados} atualizados, ${ignorados} não encontrados`)
}

main().catch(console.error)
