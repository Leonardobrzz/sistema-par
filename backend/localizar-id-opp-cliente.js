// node backend/localizar-id-opp-cliente.js
//
// Levantamento pedido pelo chef: achar o ID_OPP_Cliente de 11 nomes de
// cliente (10 dos 27 projetos "só centro de custo" + o 1 "desprotegido"),
// consolidados porque vários projetos Par são do MESMO cliente no mundo
// real (ex.: 10 projetos da SESAB, 5 de Nova Mamoré-RO, 4 dos Correios-PA).
//
// Esse script SÓ LÊ — busca a lista completa de clientes do OPP
// (listarClientes, já paginada) e mostra, pra cada nome, os candidatos mais
// parecidos (por sobreposição de palavras no nome, sem acento). NÃO grava
// nada em lugar nenhum — o chef confirma visualmente qual ID é o certo pra
// cada cliente antes de eu preencher qualquer coisa no Projetos_Contratos.

require('dotenv').config({ path: require('path').join(__dirname, '.env') });

// Os 11 nomes a localizar, exatamente como estão hoje em Projetos_Contratos.Cliente
const NOMES_A_LOCALIZAR = [
  'NOVA MAMORÉ-RO',
  'SECRETARIA DA SAÚDE DO ESTADO DA BAHIA - SESAB',
  'CORREIOS - PA',
  'CORREIOS - SE',
  'ÁGUAS DO SERTÃO - CONTRATO 12 - 2026',
  'ÁGUAS DO SERTÃO - CONTRATO 13 - 2026 (UMARI)',
  'POLÍCIA FEDERAL',
  'BEZERROS - PE',
  'DESENVOLVE-SE SERGIPE',
  'DISTRITO FEDERAL',
  'CORES VALE',
];

function normalizar(s) {
  return String(s || '')
    .toUpperCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '') // remove acentos
    .replace(/[^A-Z0-9]+/g, ' ')
    .trim();
}

// Palavras muito genéricas que não ajudam a diferenciar cliente (ignoradas no score)
const STOPWORDS = new Set(['DE', 'DA', 'DO', 'DOS', 'DAS', 'E', 'A', 'O', 'SE', 'PA', 'PE', 'RO', 'CONTRATO', '2026', '2025']);

function palavras(s) {
  return normalizar(s).split(' ').filter((w) => w && !STOPWORDS.has(w));
}

function score(nomeAlvo, candidato) {
  const alvo = new Set(palavras(nomeAlvo));
  const cand = new Set(palavras(candidato));
  if (alvo.size === 0 || cand.size === 0) return 0;
  let comuns = 0;
  for (const w of alvo) if (cand.has(w)) comuns++;
  return comuns / alvo.size; // % das palavras do nome alvo que aparecem no candidato
}

async function main() {
  const { listarClientes } = require('./src/services/oppService');

  console.log('Buscando lista completa de clientes do OPP (pode demorar um pouco)...\n');
  const clientes = await listarClientes();
  console.log(`Total de clientes ativos no OPP: ${clientes.length}\n`);

  for (const nome of NOMES_A_LOCALIZAR) {
    console.log('='.repeat(90));
    console.log(`PROCURANDO: "${nome}"`);

    const candidatos = clientes
      .map((c) => {
        const nomeCompleto = `${c.razao_cliente || ''} ${c.fantasia_cliente || ''}`;
        return { c, s: score(nome, nomeCompleto) };
      })
      .filter((x) => x.s > 0)
      .sort((a, b) => b.s - a.s)
      .slice(0, 5);

    if (candidatos.length === 0) {
      console.log('  >>> NENHUM candidato achado — pode ser que o nome no OPP seja bem diferente do nosso cadastro.');
      continue;
    }
    candidatos.forEach(({ c, s }) => {
      console.log(`  [score=${(s * 100).toFixed(0)}%] id_cliente=${c.id_cliente} | razao="${c.razao_cliente || ''}" | fantasia="${c.fantasia_cliente || ''}" | cidade="${c.cidade_cliente || ''}" | uf=${c.uf_cliente || ''} | situacao=${c.situacao_cliente || ''}`);
    });
  }

  console.log('\n' + '='.repeat(90));
  console.log('Nenhum dado foi alterado. Confirma os IDs certos (ou corrige se nenhum candidato bateu) que eu preencho o ID_OPP_Cliente em Projetos_Contratos pra todos os projetos daquele cliente.');

  process.exit(0);
}

main().catch((e) => { console.error('Erro:', e.message); console.error(e.stack); process.exit(1); });
