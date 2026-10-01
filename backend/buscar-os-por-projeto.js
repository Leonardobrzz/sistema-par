// node backend/buscar-os-por-projeto.js
//
// Só lê. Não altera nada.
//
// Procura, em TODOS os lançamentos de Contas a Receber do OPP (independente de
// já terem "OS nro. X" reconhecido ou não), qualquer observação que mencione
// palavras-chave dos projetos que ficaram sem OS depois da limpeza
// (limpar-os-incorretas.js): FERRAZNÓPOLIS/JURACITABA/IBIRAPUÃ/LAJEDÃO,
// Escola Ozeias Martins da Silva e Escola Onorina de Souza.
//
// Serve pra achar o número de OS correto de cada um, direto no texto que o
// próprio OPP já tem cadastrado — sem precisar abrir o site e procurar manual.

require('dotenv').config()
const { oppRequest } = require('./src/services/oppService')

const BUSCAS = [
  { projeto: 'SAN-23-SIAA FERRAZNÓPOLIS,JURACITABA,IBIRAPUÃ E LAJEDÃO - EMBASA', palavras: ['FERRAZNOP', 'FERRAZNÓP', 'JURACITABA', 'IBIRAPU', 'LAJEDAO', 'LAJEDÃO'] },
  { projeto: 'ARQ-2026-3-ESCOLA MUNICIPAL OZEIAS MARTINS DA SILVA', palavras: ['OZEIAS', 'MARTINS DA SILVA'] },
  { projeto: 'ARQ-2026-2-ESCOLA MUNICIPAL ONORINA DE SOUZA', palavras: ['ONORINA'] },
  // Bônus: ajuda a decidir a OS 105 (Pavimentação x Passagem Molhada, Croatá)
  { projeto: 'INF-2026-03 - CONSTRUÇÃO DE PASSAGEM MOLHADA CV 993599-2026', palavras: ['PASSAGEM MOLHADA', '993599'] },
  { projeto: 'INF-2026-02 - PAV DE EST VIC DESTINADAS AO ESCOAMENTO PRODUTIVO CV 993598-2026', palavras: ['ESTRADAS VICINAIS', 'ESCOAMENTO PRODUTIVO', '993598'] },
]

function normalizar(s) {
  return (s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase()
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
  console.log('Buscando Contas a Receber no OPP (pode demorar um pouco)...')
  const receitas = await buscarTodasReceitas()
  console.log(`${receitas.length} lançamentos carregados.\n`)

  const osRegex = /(?:OS\s+nro?\.\s*|ordem de servi[cç]o\s*n[º°]?\s*)(\d+)/i

  for (const busca of BUSCAS) {
    console.log(`${'='.repeat(70)}`)
    console.log(`Procurando: ${busca.projeto}`)
    console.log(`Palavras-chave: ${busca.palavras.join(', ')}`)
    console.log('='.repeat(70))

    const palavrasNorm = busca.palavras.map(normalizar)
    const encontrados = receitas.filter(r => {
      const obsNorm = normalizar(r.observacoes_rec || '')
      return palavrasNorm.some(p => obsNorm.includes(p))
    })

    if (encontrados.length === 0) {
      console.log('  Nenhum lançamento encontrado com essas palavras-chave.\n')
      continue
    }

    for (const l of encontrados) {
      const m = (l.observacoes_rec || '').match(osRegex)
      const osNum = m ? m[1] : '(não achou número de OS no texto)'
      console.log(`  OS ${osNum} | ${l.nome_cliente || '(sem cliente)'} | R$ ${l.valor_rec} | ${l.liquidado_rec === 'Sim' ? 'Recebido' : 'Pendente'}`)
      console.log(`    obs: "${(l.observacoes_rec || '').replace(/\s+/g, ' ').trim()}"`)
    }
    console.log('')
  }

  // As duas escolas de Nova Mamoré não apareceram pelo nome — lista TODOS os
  // lançamentos do cliente "Nova Mamoré" pra você conferir visualmente qual
  // pode ser cada escola (procure pelo número do contrato/PP, se souber).
  console.log(`${'='.repeat(70)}`)
  console.log('Todos os lançamentos de "PREFEITURA MUNICIPAL DE NOVA MAMORÉ" (pra achar as escolas manualmente)')
  console.log('='.repeat(70))
  const novaMamore = receitas.filter(r => normalizar(r.nome_cliente || '').includes('NOVA MAMOR'))
  for (const l of novaMamore) {
    const m = (l.observacoes_rec || '').match(osRegex)
    const osNum = m ? m[1] : '(sem número no texto)'
    console.log(`  OS ${osNum} | R$ ${l.valor_rec} | ${l.liquidado_rec === 'Sim' ? 'Recebido' : 'Pendente'}`)
    console.log(`    obs: "${(l.observacoes_rec || '').replace(/\s+/g, ' ').trim()}"`)
  }
}

main().catch(e => console.error('Erro:', e.message))
