// node backend/gravar-vinculo-centro-custo.js            → dry-run
// node backend/gravar-vinculo-centro-custo.js --apply     → aplica
//
// Cria a coluna "ID_Centro_Custo_OPP" em Planejamentos (se não existir) e
// grava o vínculo confirmado entre cada projeto do Par e o centro de custo
// real do OPP. São os 56 que bateram automaticamente com boa confiança
// (revisados um por um), MENOS "NRS Juazeiro" (que caiu no mesmo id do
// "Hospital Regional de Juazeiro" — ambíguo, fica de fora até confirmar se é
// a mesma obra), MAIS 3 que resolvi manualmente comparando com o nome real
// do projeto (Onorina, Clube dos Servidores, Túnel Rodoviário Taguatinga).
//
// Esse campo NÃO substitui o Nr_OS_OPP ainda — é só o vínculo. O cálculo do
// sistema continua usando o método antigo até a gente reescrever a lógica
// (próximo passo, depois de confirmar que esse vínculo está certo).

const { Pool } = require('pg')
const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://postgres.xklllcoqkreobaghdivw:402814Leo%4023@aws-1-us-east-1.pooler.supabase.com:5432/postgres',
  ssl: { rejectUnauthorized: false },
})

const APPLY = process.argv.includes('--apply')

const VINCULOS = {
  'ARQ-2025-06-REFORMA DA SEDE DO DER/SE': 224848,
  'ARQ-2025-1-DELEGACIA DE POLÍCIA FEDERAL DE CAMPINA GRANDE/PB': 224847,
  'ARQ-2025-1-HOSPITAL REGIONAL DE SANTO ANTÔNIO DE JESUS': 224849,
  'ARQ-2025-1-URB MIRANTE DO CAMARÁ': 230758,
  'ARQ-2025-2-HOSPITAL GERAL MANOEL VICTORINO': 224850,
  'ARQ-2025-2-UNIDADE DE AGROINDUSTRIA-1-GRUPO 1-1. UNIDADE DE PRODUÇÃO DE DERIVADOS DA MANDIOCA': 224828,
  'ARQ-2025-2-UNIDADE DE AGROINDUSTRIA-1-GRUPO 1-2. UNIDADE DE BENEFICIAMENTO DE FRUTAS': 224829,
  'ARQ-2025-2-UNIDADE DE AGROINDUSTRIA-1-GRUPO 1-3. COZINHA INDUSTRIAL DA AGRICULTURA FAMILIAR': 224830,
  'ARQ-2025-2-UNIDADE DE AGROINDUSTRIA-1-GRUPO 2-1-UNID. PESCADOS': 224825,
  'ARQ-2025-2-UNIDADE DE AGROINDUSTRIA-1-GRUPO 2-2-UNID. DE LEITE': 224826,
  'ARQ-2025-2-UNIDADE DE AGROINDUSTRIA-1-GRUPO 2-3-PRODUÇÃO DE ABELHAS': 224827,
  'ARQ-2025-2-UNIDADE DE AGROINDUSTRIA-3-GRUPO 3-1. MERCADO DO PRODUTOR': 224831,
  'ARQ-2025-2-UNIDADE DE AGROINDUSTRIA-4-GRUPO 4_3. 1. ABATEDOURO FRIGORÍFICO DE CAPRINOS E OVINOS': 224832,
  'ARQ-2025-2-UNIDADE DE AGROINDUSTRIA-5-GRUPO 5_1. ABATEDOURO FRIGORÍFICO DE BOVINOS': 224833,
  'ARQ-2025-3 CASAS POPULARES': 224837,
  'ARQ-2025-3-HOSPITAL REGIONAL DE JUAZEIRO': 224851,
  'ARQ-2025-4-URBANIZAÇÃO DO CAMPO MONTE CASTELO': 224853,
  'ARQ-2025-6-PORTICO DE ENTRADA': 224838,
  'ARQ-2026-1-AGÊNCIA DE CORREIOS DE CHAVES': 237002,
  'ARQ-2026-1-BRS IRECÊ': 237910,
  'ARQ-2026-1-CENTRO DE ENTREGA DE ENCOMENDAS DE ARACAJU': 237763,
  'ARQ-2026-1-LABORATÓRIO DER/SE': 237921,
  'ARQ-2026-1-URBANIZAÇÃO DO CANAL DO AMBRÓSIO': 224843,
  'ARQ-2026-2-AGÊNCIA DE CORREIOS DE MARABÁ': 237003,
  'ARQ-2026-2-BRS PAULO AFONSO': 238495,
  'ARQ-2026-2-CENTRO DE TRATAMENTO DE CARTAS E ENCOMENDAS DE ARACAJU': 237764,
  'ARQ-2026-2-ESCOLA MUNICIPAL ONORINA DE SOUZA': 229270, // manual — Nr_Contrato_OS tava com texto errado
  'ARQ-2026-3-AGÊNCIA DE CORREIOS DE SALINÓPOLIS': 237004,
  'ARQ-2026-3-BRS SENHOR DO BONFIM': 238496,
  'ARQ-2026-3-ESCOLA 5 SALAS (CE-065)': 230757,
  'ARQ-2026-3-ESCOLA MUNICIPAL OZEIAS MARTINS DA SILVA': 229271,
  'ARQ-2026-4- ESCOLA MUNICIPAL EDUARDO VALVERDE': 229272,
  'ARQ-2026-4-AGÊNCIA DE CORREIOS DE SANTARÉM': 237001,
  'ARQ-2026-4-CALÇADÃO DA RUA JOSÉ LOPES FILHO': 234581,
  'ARQ-2026-4-REFORMA E.E.F. EMÍLIA QUEIROZ': 231898,
  'ARQ-2026-5-ESPAÇO ALTERNATIVO': 230588,
  'ARQ-2026-6-CLUBE DOS SERVIDORES': 233689, // manual — Nr_Contrato_OS tava com texto errado
  'ARQ-2026-7-LEVANTAMENTOS TOPOGRÁFICOS LOC. DE BARRO VERMELHO E TAPUIO': 233489,
  'ARQ-2026-8-MANUTENÇÃO DE ARENINHAS NAS LOC. DE BARRO VERMELHO E VOLTA GRANDE': 235341,
  'INF-2026-01 - ELABORAÇÃO DE ESTUDOS E PROJETOS EXECUTIVOS DE DRENAGEM URBANA NO BAIRRO DA GAMELEIRA': 230748,
  'INF-2026-01 - INFRAESTRUTURA VIARIA E PATAMARIZAÇÃO DO CENTRO DE TREINAMENTO DE AGUA BOA-MT': 230759,
  'INF-2026-01 -TUNEL RODOVIÁRIO E BOULEVARD DA AVENIDA CENTRAL DE TAGUATINGA': 237908, // manual — score baixo mas bate no nome
  'INF-2026-01 PAVIMENTAÇÃO E TERRAPLANAGEM - LOTE 05 - ORLA PONTA DOS MANGUES': 232512,
  'INF-2026-02 - PAV DE EST VIC DESTINADAS AO ESCOAMENTO PRODUTIVO CV 993598-2026': 235283,
  'INF-2026-03 - CONSTRUÇÃO DE PASSAGEM MOLHADA CV 993599-2026': 235282,
  'INF-2026-1- PAVIMENTAÇÃO E PASSAGEM MOLHADA NO TRECHO QUE LIGA CANAPI Á FORQUILHA': 224791,
  'INF-2026-6.PP014275-2026 PAVIMENTAÇÃO NA ZONA RURAL DO MUNICÍPIO': 233906,
  'INF-2026-7.LEVANTAMENTO TOPOGRÁFICO EM RUAS DA SEDE': 228131,
  'SAN-01 SAA AURORA': 234696,
  'SAN-01 SAA UMARI': 236751,
  'SAN-09-SAA RIO REAL / JANDAÍRA - EMBASA': 224794,
  'SAN-20-SAA LAFAIETE COUTINHO': 224797,
  'SAN-23-SIAA FERRAZNÓPOLIS,JURACITABA,IBIRAPUÃ E LAJEDÃO - EMBASA': 224799,
  'SAN-24-SIAA SANTANA - EMBASA': 224800,
  'SAN-25-SAA INEMA E PIMENTEIRA': 224801,
  'SAN-26-SAA COMANDATUBA': 224802,
  'SAN-27-SAA WENCESLAU': 228936,
  'SAN-28-SAA URANDI': 237543,
}

async function main() {
  await pool.query(`ALTER TABLE "Planejamentos" ADD COLUMN IF NOT EXISTS "ID_Centro_Custo_OPP" INTEGER`)
  console.log('Coluna "ID_Centro_Custo_OPP" confirmada/criada em Planejamentos.\n')

  let ok = 0, pulados = 0
  for (const [nome, idCentro] of Object.entries(VINCULOS)) {
    const { rows } = await pool.query('SELECT "ID", "ID_Centro_Custo_OPP" FROM "Planejamentos" WHERE "Nome_Projeto" = $1', [nome])
    if (rows.length !== 1) {
      console.log(`[PULEI] "${nome}" — encontrei ${rows.length} registro(s), esperava 1.`)
      pulados++
      continue
    }
    const plan = rows[0]
    if (Number(plan.ID_Centro_Custo_OPP) === idCentro) {
      console.log(`[JÁ OK] "${nome}" -> ${idCentro}`)
    } else {
      console.log(`"${nome}"\n  ID_Centro_Custo_OPP: ${plan.ID_Centro_Custo_OPP || '—'} -> ${idCentro}`)
      if (APPLY) {
        await pool.query('UPDATE "Planejamentos" SET "ID_Centro_Custo_OPP" = $1 WHERE "ID" = $2', [idCentro, plan.ID])
        console.log('  -> aplicado.')
      }
    }
    ok++
  }

  console.log(`\n${ok} vínculos processados, ${pulados} pulados.`)
  if (!APPLY) console.log('\nModo dry-run — nada foi alterado. Rode com --apply pra gravar.')
  else console.log('\nConcluído.')
  pool.end()
}

main().catch(e => { console.error('Erro:', e.message); pool.end() })
