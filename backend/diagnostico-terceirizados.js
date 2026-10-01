// node backend/diagnostico-terceirizados.js
//
// Só lê o banco. Não altera nada.
//
// Investiga a causa exata dos problemas na tela "Serviços Terceirizados":
// nome de projeto estranho, cliente/setor vazios, fornecedor com nome de
// pessoa, valores vazios, status desatualizado.

const { Pool } = require('pg')
const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://postgres.xklllcoqkreobaghdivw:402814Leo%4023@aws-1-us-east-1.pooler.supabase.com:5432/postgres',
  ssl: { rejectUnauthorized: false },
})

async function main() {
  const { rows: terc } = await pool.query(`SELECT * FROM "Terceirizados" ORDER BY "Criado_Em" DESC NULLS LAST`)
  const { rows: projs } = await pool.query(`SELECT "ID_Projeto", "Nome", "Cliente", "Setor", "ID_ClickUp" FROM "Projetos_Contratos"`)
  const projMap = {}
  for (const p of projs) projMap[p.ID_Projeto] = p

  console.log(`Total Terceirizados: ${terc.length}`)
  console.log(`Total Projetos_Contratos: ${projs.length}\n`)

  // 1. Projetos_Contratos com nome suspeito (lista interna, não cliente real)
  const suspeitos = projs.filter(p => /execu[cç][aã]o\s*&?\s*pagamento|solicita[cç][aã]o|contrata[cç][aã]o|gest[aã]o contratual/i.test(p.Nome || ''))
  console.log(`=== Projetos_Contratos com nome suspeito (pasta interna, não cliente) ===`)
  if (suspeitos.length === 0) console.log('  Nenhum encontrado.')
  for (const p of suspeitos) console.log(`  ID_Projeto="${p.ID_Projeto}" Nome="${p.Nome}" Cliente="${p.Cliente}" Setor="${p.Setor}" ID_ClickUp="${p.ID_ClickUp}"`)

  // 2. Terceirizados: ID_Projeto vazio vs preenchido vs preenchido-mas-não-existe
  let vazio = 0, existeOk = 0, naoExiste = 0
  for (const t of terc) {
    if (!t.ID_Projeto) { vazio++; continue }
    if (projMap[t.ID_Projeto]) existeOk++
    else naoExiste++
  }
  console.log(`\n=== Vínculo ID_Projeto nos registros de Terceirizados ===`)
  console.log(`  Vazio: ${vazio} | Aponta pra projeto que existe: ${existeOk} | Aponta pra ID que NÃO existe em Projetos_Contratos: ${naoExiste}`)

  // 3. Amostra bruta das primeiras 15 linhas (campos crus, sem enriquecimento do backend)
  console.log(`\n=== Amostra bruta (15 primeiras linhas) ===`)
  for (const t of terc.slice(0, 15)) {
    const proj = projMap[t.ID_Projeto]
    console.log(`\nServico: "${t.Servico || t.Descricao_Servico || ''}"`)
    console.log(`  ID_Projeto (cru): "${t.ID_Projeto || ''}" -> projeto encontrado: ${proj ? `"${proj.Nome}" (Cliente: "${proj.Cliente}", Setor: "${proj.Setor}")` : 'NÃO ENCONTRADO'}`)
    console.log(`  Fornecedor (cru): "${t.Fornecedor || ''}" | Responsavel (cru): "${t.Responsavel || ''}"`)
    console.log(`  OC: "${t.OC || ''}" | Valor_Contratado: "${t.Valor_Contratado || ''}" | Valor_Pago: "${t.Valor_Pago || ''}" | Valor_Estimado: "${t.Valor_Estimado || ''}"`)
    console.log(`  Status (PAR): "${t.Status || ''}" | Status_ClickUp: "${t.Status_ClickUp || ''}" | Etapa_ClickUp: "${t.Etapa_ClickUp || ''}"`)
    console.log(`  ID_Tarefa_ClickUp: "${t.ID_Tarefa_ClickUp || ''}"`)
  }

  // 4. Preenchimento de campos-chave (visão geral, todos os registros ativos)
  const ativos = terc.filter(t => t.Status !== 'Cancelado')
  const comOC = ativos.filter(t => t.OC && String(t.OC).trim() !== '')
  const comValorContratado = ativos.filter(t => t.Valor_Contratado && parseFloat(String(t.Valor_Contratado).replace(',', '.')) > 0)
  const comFornecedorPreenchido = ativos.filter(t => t.Fornecedor && t.Fornecedor.trim() !== '')
  const fornecedorIgualResponsavel = ativos.filter(t => t.Fornecedor && t.Responsavel && t.Fornecedor.trim() === t.Responsavel.trim())
  console.log(`\n=== Preenchimento (${ativos.length} registros ativos, não cancelados) ===`)
  console.log(`  Com OC preenchida: ${comOC.length}`)
  console.log(`  Com Valor_Contratado > 0: ${comValorContratado.length}`)
  console.log(`  Com Fornecedor preenchido: ${comFornecedorPreenchido.length}`)
  console.log(`  Fornecedor == Responsavel (nome de pessoa no lugar de empresa): ${fornecedorIgualResponsavel.length}`)

  // 5. Status PAR (simplificado) vs Etapa_ClickUp atual — pra ver desatualização
  console.log(`\n=== Status PAR (simplificado) x Etapa_ClickUp atual ===`)
  const combinacoes = {}
  for (const t of ativos) {
    const chave = `${t.Status || '(vazio)'} | ${t.Etapa_ClickUp || '(vazio)'}`
    combinacoes[chave] = (combinacoes[chave] || 0) + 1
  }
  for (const [k, v] of Object.entries(combinacoes).sort((a,b) => b[1]-a[1])) console.log(`  ${v}x — Status="${k.split(' | ')[0]}" / Etapa_ClickUp="${k.split(' | ')[1]}"`)

  pool.end()
}

main().catch(e => { console.error('Erro:', e.message); pool.end() })
