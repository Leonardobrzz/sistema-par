// node backend/confirmar-cliente-por-cc.js
//
// Pros 3 projetos que faltam ID_OPP_Cliente mas JÁ têm centro de custo
// cadastrado (Polícia Federal, Bezerros-PE, Distrito Federal), não precisa
// adivinhar por nome — a própria conta a receber do OPP já tem id_cliente/
// nome_cliente gravado nela. Esse script busca as contas a receber de cada
// um desses centros de custo e mostra o cliente de verdade, direto da
// fonte. Só lê, não grava nada.

require('dotenv').config({ path: require('path').join(__dirname, '.env') });

const PROJETOS = [
  { nome: 'DELEGACIA DE POLÍCIA FEDERAL DE CAMPINA GRANDE/PB', cc: '224847' },
  { nome: 'INF-2026-01 - DRENAGEM URBANA NO BAIRRO DA GAMELEIRA (BEZERROS-PE)', cc: '230748' },
  { nome: 'INF-2026-01 - TÚNEL RODOVIÁRIO DE TAGUATINGA (DISTRITO FEDERAL)', cc: '237908' },
];

async function main() {
  const { oppRequest } = require('./src/services/oppService');

  let offset = 0, receitasOPP = [];
  while (true) {
    const r = await oppRequest('GET', `/contas-receber?limit=250&offset=${offset}&lixeira=Nao`);
    const lista = Array.isArray(r) ? r : (r?.data || []);
    if (lista.length === 0) break;
    receitasOPP.push(...lista);
    if (lista.length < 250) break;
    offset += 250;
    if (offset > 10000) break;
  }

  for (const p of PROJETOS) {
    console.log('='.repeat(90));
    console.log(`PROJETO: ${p.nome} | centro de custo=${p.cc}`);
    const contas = receitasOPP.filter((r) => String(r.id_centro_custos || '') === p.cc);
    if (contas.length === 0) {
      console.log('  Nenhuma conta a receber achada com esse centro de custo (sem lixeira).');
      continue;
    }
    contas.forEach((c) => {
      console.log(`  conta=${c.id_conta_rec} | NF=${c.n_documento_rec} | id_cliente=${c.id_cliente} | nome_cliente="${c.nome_cliente}" | valor=${c.valor_rec} | liquidado=${c.liquidado_rec}`);
    });
  }

  process.exit(0);
}

main().catch((e) => { console.error('Erro:', e.message); console.error(e.stack); process.exit(1); });
