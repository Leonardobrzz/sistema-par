// node backend/investigar-centro-custo.js
//
// Só lê a API do OPP. Não altera nada.
//
// O chefe confirmou que EXISTE um campo de centro de custo visível no site do
// OPP. No código do Par, o campo que a gente lia (`centro_custos_rec`) sempre
// vem vazio pela API — mas pode ser que o dado exista só que com outro nome
// de campo, ou dentro de um lançamento específico, ou que venha só quando o
// lançamento já foi "conciliado"/pago. Este script:
//
//  1) Pega o lançamento de Contas a Receber de uma OS que a gente já sabe que
//     é 100% certa (OS 116, da Ferraznópolis) e imprime TODOS os campos que a
//     API devolve, sem filtrar nada — pra ver se tem algum campo de centro de
//     custo (com qualquer nome) que a gente não tava lendo.
//
//  2) Tenta buscar a lista de Ordens de Serviço (/ordens-servico, sem ID) —
//     antes só tinha testado /ordens-servico/:id (que deu 403). Talvez a
//     LISTA funcione mesmo se buscar por ID não funcionar, e o centro de
//     custo esteja lá, ligado direto na OS (que seria o lugar mais lógico,
//     já que é aí que o projeto/centro de custo nasce).
//
//  3) Tenta alguns endpoints prováveis de "centro de custo" separados, só
//     pra ver se algum existe (não tem problema se der 403/404 nesses).

require('dotenv').config()
const { oppRequest } = require('./src/services/oppService')

async function tentar(label, fn) {
  console.log(`\n${'='.repeat(70)}\n${label}\n${'='.repeat(70)}`)
  try {
    const r = await fn()
    console.log(JSON.stringify(r, null, 2).slice(0, 4000))
  } catch (e) {
    console.log(`ERRO: ${e.message}`)
  }
}

async function main() {
  // 1) Lançamento cru da OS 116 (Ferraznópolis, já confirmada)
  await tentar('1) Contas a Receber — procurando o lançamento da OS 116 (cru, todos os campos)', async () => {
    let offset = 0
    while (offset <= 2000) {
      const r = await oppRequest('GET', `/contas-receber?limit=250&offset=${offset}&lixeira=Nao`)
      const lista = Array.isArray(r) ? r : (r?.data || [])
      if (lista.length === 0) break
      const achado = lista.find(x => (x.observacoes_rec || '').includes('OS nro. 116'))
      if (achado) return achado
      if (lista.length < 250) break
      offset += 250
    }
    return '(não achei o lançamento da OS 116)'
  })

  // 2) Lista de Ordens de Serviço (não por ID)
  await tentar('2) GET /ordens-servico (lista, sem ID)', async () => {
    return await oppRequest('GET', '/ordens-servico?limit=5')
  })

  // 3) Endpoints prováveis de centro de custo
  for (const path of ['/centros-custo', '/centro-custos', '/centro_custo', '/rateios', '/rateio-centro-custo']) {
    await tentar(`3) GET ${path}`, async () => {
      return await oppRequest('GET', `${path}?limit=5`)
    })
  }
}

main().catch(e => console.error('Erro geral:', e.message))
