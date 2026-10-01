// node backend/diagnostico-terceirizados-valores.js
//
// Só lê (banco + OPP). Não altera nada.
//
// Investiga por que Valor_Contratado / Valor_Liquidado / Saldo nunca aparecem
// preenchidos na tela de Terceirizados. O match hoje é feito só pela "Ordem de
// Compra" (OC): o número que vem do ClickUp (campo "Ordem de Compra" da
// tarefa) precisa aparecer dentro do texto de observacoes_pag de algum
// lançamento em /contas-pagar no OPP, no formato "...ordem de compra nº 1234...".
//
// Esse script mostra: (1) quantos Terceirizados ativos têm OC preenchida,
// (2) uma amostra de observacoes_pag reais do OPP pra ver o formato de verdade,
// (3) se a regex atual bate com esse formato, e (4) pra cada OC existente em
// Terceirizados, se existe (e quanto vale) o lançamento correspondente no OPP.

// Carrega o .env de dentro da pasta backend/ (onde ele realmente mora),
// independente de onde o comando for rodado — ex: você rodou da raiz do
// projeto (automatizarfluxo>), então o dotenv sem caminho explícito procurava
// o .env na raiz e não achava as variáveis do OPP.
require('dotenv').config({ path: require('path').join(__dirname, '.env') });
const { Pool } = require('pg');
const { oppRequest } = require('./src/services/oppService');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://postgres.xklllcoqkreobaghdivw:402814Leo%4023@aws-1-us-east-1.pooler.supabase.com:5432/postgres',
  ssl: { rejectUnauthorized: false },
});

const ocRegex = /ordem de compra\s*n[º°]?\s*(\d+)/i;

async function buscarContasPagar() {
  let offset = 0, despesas = [];
  while (true) {
    const r = await oppRequest('GET', `/contas-pagar?limit=250&offset=${offset}&lixeira=Nao`);
    const lista = Array.isArray(r) ? r : (r?.data || []);
    if (lista.length === 0) break;
    despesas.push(...lista);
    if (lista.length < 250) break;
    offset += 250;
    if (offset > 10000) break;
  }
  return despesas;
}

async function main() {
  const { rows: terc } = await pool.query(`SELECT * FROM "Terceirizados" WHERE "Status" != 'Cancelado'`);
  console.log(`Terceirizados ativos: ${terc.length}`);

  const comOC = terc.filter(t => t.OC && String(t.OC).trim() !== '');
  console.log(`Com OC preenchida: ${comOC.length}\n`);

  console.log('=== Amostra de OCs vindas do ClickUp (10 primeiras) ===');
  for (const t of comOC.slice(0, 10)) {
    console.log(`  Servico="${t.Servico}" | OC="${t.OC}"`);
  }

  console.log('\nBuscando contas-pagar no OPP (pode demorar um pouco)...');
  const despesas = await buscarContasPagar();
  console.log(`Total de lançamentos em /contas-pagar: ${despesas.length}\n`);

  console.log('=== Amostra de observacoes_pag reais do OPP (15 primeiras não vazias) ===');
  const comObs = despesas.filter(d => d.observacoes_pag && d.observacoes_pag.trim() !== '');
  console.log(`(${comObs.length} de ${despesas.length} lançamentos têm observacoes_pag preenchido)\n`);
  for (const d of comObs.slice(0, 15)) {
    const bateRegex = ocRegex.test(d.observacoes_pag);
    console.log(`  observacoes_pag="${d.observacoes_pag}" | bate com a regex atual? ${bateRegex ? 'SIM' : 'não'}`);
  }

  // Quantos lançamentos batem com a regex no total
  const comMatch = despesas.filter(d => ocRegex.test(d.observacoes_pag || ''));
  console.log(`\nTotal de lançamentos cujo observacoes_pag bate com a regex "ordem de compra nº <num>": ${comMatch.length} de ${despesas.length}`);

  // Monta o mapa por OC igual o backend faz, pra cruzar com os Terceirizados reais
  const porOC = {};
  for (const d of comMatch) {
    const m = d.observacoes_pag.match(ocRegex);
    const ocNum = m[1];
    if (!porOC[ocNum]) porOC[ocNum] = { total: 0, pago: 0 };
    porOC[ocNum].total += parseFloat(d.valor_pag || 0);
    porOC[ocNum].pago += parseFloat(d.valor_pago || 0);
  }
  console.log(`OCs distintas encontradas no OPP via essa regex: ${Object.keys(porOC).length}\n`);

  console.log('=== Cruzamento: cada OC do ClickUp existe no OPP (pela regex atual)? ===');
  let bateu = 0, naoBateu = 0;
  for (const t of comOC) {
    const ocLimpo = String(t.OC).trim();
    const encontrado = porOC[ocLimpo];
    if (encontrado) {
      bateu++;
      console.log(`  OC="${ocLimpo}" (Servico="${t.Servico}") -> ENCONTRADO no OPP: total=${encontrado.total.toFixed(2)} pago=${encontrado.pago.toFixed(2)}`);
    } else {
      naoBateu++;
    }
  }
  console.log(`\nResumo: ${bateu} de ${comOC.length} OCs do ClickUp encontraram lançamento correspondente no OPP pela regex atual. ${naoBateu} não encontraram.`);

  if (naoBateu > 0) {
    console.log('\n=== Amostra de OCs do ClickUp que NÃO bateram (10 primeiras) — pra comparar formato ===');
    let mostrados = 0;
    for (const t of comOC) {
      const ocLimpo = String(t.OC).trim();
      if (!porOC[ocLimpo] && mostrados < 10) {
        console.log(`  OC do ClickUp="${ocLimpo}" (tipo: ${typeof t.OC}, bruto: "${t.OC}")`);
        mostrados++;
      }
    }
  }

  pool.end();
}

main().catch(e => { console.error('Erro:', e.message); pool.end(); });
