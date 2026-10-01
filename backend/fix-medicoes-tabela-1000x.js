// node backend/fix-medicoes-tabela-1000x.js            → modo dry-run (só mostra o que mudaria)
// node backend/fix-medicoes-tabela-1000x.js --apply     → aplica as correções na tabela Medicoes
//
// Problema: alguns registros da tabela "Medicoes" (a que alimenta a tela
// Medições & Faturamento, com dados ao vivo do OPP) foram gravados com o
// campo Valor dividido por 1000 (ex.: contrato de R$ 64.500,00 com a
// medição de 100% gravada como "64,50" ao invés de "64.500,00").
//
// Isso é DIFERENTE do bug de parseFloat (já corrigido nas rotas do backend
// em outra etapa) — aqui o valor já está errado dentro do banco, então só
// corrigir o parser não resolve; é preciso corrigir o dado gravado.
//
// Já existe uma correção parecida em backend/src/routes/opp.js
// (POST /api/opp/corrigir-medicoes), mas ela só corrige o JSON de
// planejamento (Planejamentos.Dados_JSON), nunca a tabela real "Medicoes"
// que aparece nesta tela — por isso os problemas continuam aparecendo lá.
//
// Este script usa a MESMA regra de segurança já validada no projeto:
//   - valor atual > 0 e < 1000
//   - valor atual × 1000 fica dentro de 15% do valor do contrato do projeto
// Só corrige quando as duas condições batem, para não alterar valores que
// já estão corretos (ex.: parcelas pequenas legítimas).

const { Pool } = require('pg')
const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://postgres.xklllcoqkreobaghdivw:402814Leo%4023@aws-1-us-east-1.pooler.supabase.com:5432/postgres',
  ssl: { rejectUnauthorized: false },
})

const APPLY = process.argv.includes('--apply')

// mesmo parser BR usado no resto do projeto (backend/src/routes/*.js)
const pBR = (v) => {
  const s = String(v || 0).trim()
  if (s.includes(',')) return parseFloat(s.replace(/\./g, '').replace(',', '.')) || 0
  const parts = s.split('.')
  if (parts.length === 2 && parts[1].length <= 2) return parseFloat(s) || 0
  return parseFloat(s.replace(/\./g, '')) || 0
}

async function main() {
  const [medicoes, planejamentos, projetos] = await Promise.all([
    pool.query('SELECT "ID_Medicao", "ID_Projeto", "Etapa", "Valor", "Status_Financeiro" FROM "Medicoes"'),
    pool.query('SELECT "ID_Projeto", "Nome_Projeto", "Valor_Contrato", "Dados_JSON" FROM "Planejamentos"'),
    pool.query('SELECT "ID_Projeto", "Nome", "Valor_Global" FROM "Projetos_Contratos"'),
  ])

  // Mapa ID_Projeto -> valor do contrato (prioridade: Planejamento > Projetos_Contratos)
  const contratoPorProjeto = {}
  const nomePorProjeto = {}
  for (const p of projetos.rows) {
    nomePorProjeto[p.ID_Projeto] = p.Nome
    const v = pBR(p.Valor_Global || 0)
    if (v > 0) contratoPorProjeto[p.ID_Projeto] = v
  }
  for (const plan of planejamentos.rows) {
    if (!plan.ID_Projeto) continue
    if (plan.Nome_Projeto) nomePorProjeto[plan.ID_Projeto] = plan.Nome_Projeto
    let dados = {}
    try { dados = JSON.parse(plan.Dados_JSON || '{}') } catch {}
    const d = dados._baseline || dados
    const v = pBR(d.valorContrato || plan.Valor_Contrato || 0)
    if (v > 0) contratoPorProjeto[plan.ID_Projeto] = v // planejamento tem prioridade
  }

  const candidatos = []
  for (const m of medicoes.rows) {
    const contrato = contratoPorProjeto[m.ID_Projeto]
    if (!contrato || contrato <= 1000) continue
    const valorAtual = pBR(m.Valor)
    if (valorAtual > 0 && valorAtual < 1000 && (valorAtual * 1000) <= contrato * 1.15) {
      candidatos.push({
        ID_Medicao: m.ID_Medicao,
        ID_Projeto: m.ID_Projeto,
        nome: nomePorProjeto[m.ID_Projeto] || '(desconhecido)',
        etapa: m.Etapa,
        status: m.Status_Financeiro,
        valorAtual,
        valorCorrigido: parseFloat((valorAtual * 1000).toFixed(2)),
        contrato,
      })
    }
  }

  console.log(`\nEncontrados ${candidatos.length} registro(s) na tabela Medicoes com suspeita de valor ÷1000:\n`)
  for (const c of candidatos) {
    console.log(
      `  [${c.ID_Medicao}] ${c.nome} — "${c.etapa}" (${c.status})\n` +
      `      R$ ${c.valorAtual.toFixed(2)}  →  R$ ${c.valorCorrigido.toFixed(2)}   (contrato: R$ ${c.contrato.toFixed(2)})`
    )
  }

  if (!APPLY) {
    console.log('\nModo dry-run — nada foi alterado. Revise a lista acima e rode novamente com --apply para gravar as correções.')
    return pool.end()
  }

  console.log('\nAplicando correções...')
  for (const c of candidatos) {
    await pool.query('UPDATE "Medicoes" SET "Valor" = $1 WHERE "ID_Medicao" = $2', [String(c.valorCorrigido), c.ID_Medicao])
  }
  console.log(`\n${candidatos.length} registro(s) corrigido(s) na tabela Medicoes.`)
  pool.end()
}

main().catch(e => { console.error('Erro:', e.message); pool.end() })
