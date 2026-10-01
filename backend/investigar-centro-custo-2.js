// node backend/investigar-centro-custo-2.js
//
// Só lê a API do OPP. Não altera nada.
//
// Achamos que existe, sim, um vínculo de centro de custo em cada lançamento
// de Contas a Receber (id_centro_custos / centro_custos_rec), e que existe um
// cadastro completo em /centros-custo. Este script:
//
//  1) Lista TODOS os centros de custo cadastrados no OPP (id + descrição),
//     pra gente conseguir casar cada um com o projeto certo do Par.
//
//  2) Confere, em TODOS os lançamentos de Contas a Receber, quantos já têm
//     id_centro_custos preenchido e quantos ainda estão sem (0 ou vazio) —
//     pra saber se dá pra confiar nesse campo pra tudo, ou só pros mais
//     recentes.

require('dotenv').config()
const { oppRequest } = require('./src/services/oppService')

async function buscarTodosCentrosCusto() {
  let offset = 0, todos = []
  while (true) {
    const r = await oppRequest('GET', `/centros-custo?limit=250&offset=${offset}`)
    const lista = Array.isArray(r) ? r : (r?.data || [])
    if (lista.length === 0) break
    todos.push(...lista)
    if (lista.length < 250) break
    offset += 250
    if (offset > 5000) break
  }
  return todos
}

async function buscarTodasReceitas() {
  let offset = 0, todos = []
  while (true) {
    const r = await oppRequest('GET', `/contas-receber?limit=250&offset=${offset}&lixeira=Nao`)
    const lista = Array.isArray(r) ? r : (r?.data || [])
    if (lista.length === 0) break
    todos.push(...lista)
    if (lista.length < 250) break
    offset += 250
    if (offset > 10000) break
  }
  return todos
}

async function main() {
  console.log('Buscando todos os Centros de Custo cadastrados no OPP...')
  const centros = await buscarTodosCentrosCusto()
  console.log(`\n${centros.length} centros de custo cadastrados:\n`)
  for (const c of centros) {
    console.log(`  id ${c.id_centro_custos} | ${c.status_centro_custos}${c.lixeira === 'Sim' ? ' (LIXEIRA)' : ''} | ${c.desc_centro_custos}`)
  }

  console.log('\nBuscando todos os lançamentos de Contas a Receber (pode demorar)...')
  const receitas = await buscarTodasReceitas()
  console.log(`${receitas.length} lançamentos carregados.\n`)

  const comCentro = receitas.filter(r => r.id_centro_custos && Number(r.id_centro_custos) !== 0)
  const semCentro = receitas.filter(r => !r.id_centro_custos || Number(r.id_centro_custos) === 0)

  console.log(`Com id_centro_custos preenchido: ${comCentro.length}`)
  console.log(`Sem id_centro_custos (0 ou vazio): ${semCentro.length}`)

  if (semCentro.length > 0) {
    console.log('\nAlguns exemplos SEM centro de custo (pra ver se são só lançamentos antigos ou de outro tipo):')
    for (const l of semCentro.slice(0, 10)) {
      console.log(`  ${l.data_emissao || '—'} | ${l.nome_cliente || '(sem cliente)'} | R$ ${l.valor_rec} | obs: "${(l.observacoes_rec || '').slice(0, 80)}"`)
    }
  }

  // Quantos centros de custo distintos aparecem de fato nos lançamentos (uso real)
  const usados = new Set(comCentro.map(r => r.id_centro_custos))
  console.log(`\nCentros de custo distintos realmente usados em lançamentos: ${usados.size} de ${centros.length} cadastrados.`)
}

main().catch(e => console.error('Erro:', e.message))
