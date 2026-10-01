// node backend/resolver-com-centro-custo.js
//
// Só lê a API do OPP. Não altera nada.
//
// Agora que sabemos que quase todo lançamento de Contas a Receber tem
// id_centro_custos preenchido (bem mais confiável que ler texto de
// observação), usa isso pra resolver de vez as dúvidas que ainda estavam
// em aberto: as duas escolas de Nova Mamoré, a OS 105 (Croatá), a OS 153
// (Mulungu) e a OS 91 (CODEVASF).

require('dotenv').config()
const { oppRequest } = require('./src/services/oppService')

// id_centro_custos de interesse (tirados da lista completa de /centros-custo)
const ALVOS = {
  229270: 'ARQ NOVA MAMORÉ ESCOLA MUN ONORINA DE SOUZA',
  229271: 'ARQ NOVA MAMORÉ ESCOLA MUN OZEIAS MARTINS SIL',
  229272: 'ARQ NOVA MAMORÉ ESCOLA MUN EDUARDO VALVERDE',
  228987: 'INF CROATÁ TERMINAL RODOVIÁRIO',
  224838: 'ARQ MULUNGU PÓRTCO DE ENTRADA',
  230758: 'ARQ MULUNGU MIRANTE DE NOSSA SENHORA APARECID',
  224825: 'ARQ CODEVASF UNDADE DE PESCADOS',
  224826: 'ARQ CODEVASF UNIDADE DE LEITE',
  224827: 'ARQ CODEVASF PRODUÇÃO DE ABELHAS',
  235282: 'INF CROATÁ PASSAGENS MOLHADAS 993599',
  235283: 'INF CROATÁ PAV. ESTRADA 993598',
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
  console.log('Buscando todos os lançamentos de Contas a Receber...')
  const receitas = await buscarTodasReceitas()
  console.log(`${receitas.length} lançamentos carregados.\n`)

  const osRegex = /(?:OS\s+nro?\.\s*|ordem de servi[cç]o\s*n[º°]?\s*)(\d+)/i

  for (const [id, desc] of Object.entries(ALVOS)) {
    console.log(`${'='.repeat(70)}`)
    console.log(`Centro de custo ${id} — ${desc}`)
    console.log('='.repeat(70))
    const lancs = receitas.filter(r => String(r.id_centro_custos) === id)
    if (lancs.length === 0) {
      console.log('  (nenhum lançamento com esse centro de custo)\n')
      continue
    }
    let total = 0
    for (const l of lancs) {
      const m = (l.observacoes_rec || '').match(osRegex)
      const osNum = m ? m[1] : '(sem OS no texto)'
      total += parseFloat(l.valor_rec || 0)
      console.log(`  OS ${osNum} | R$ ${l.valor_rec} | ${l.liquidado_rec === 'Sim' ? 'Recebido' : 'Pendente'} | ${l.data_emissao || '—'}`)
      console.log(`    obs: "${(l.observacoes_rec || '').replace(/\s+/g, ' ').trim()}"`)
    }
    console.log(`  TOTAL: R$ ${total.toFixed(2)} (${lancs.length} lançamento(s))\n`)
  }
}

main().catch(e => console.error('Erro:', e.message))
