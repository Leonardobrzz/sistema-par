// node backend/diagnosticar-valor-pago-oc.js
//
// Só lê (não grava nada). Pedido do chefe: ver se dá pra trazer o "Valor
// pago" de cada Ordem de Compra (o painel "Detalhes dos pagamentos" que
// aparece dentro da própria O.C. no site do OPP) pra coluna "Valor Liquid."
// da tela de Terceirizados do Par.
//
// Já tem um comentário no código (syncOrdensCompra, em oppService.js)
// dizendo que /contas-pagar?id_pedido=X foi testado antes e a API do OPP
// IGNORA esse parâmetro (devolve uma lista genérica, sempre a mesma,
// não importa a OC pedida) — por isso Valor_Liquidado fica sempre vazio
// hoje. Esse script confere 3 hipóteses diferentes pra ver se tem algum
// jeito confiável de pegar esse valor:
//
//  1) GET /ordens-compra/:id (um registro só, não a lista) — talvez o
//     detalhe de uma O.C. específica traga campos extras de pagamento que
//     não aparecem na listagem.
//  2) Testar de novo o filtro ?id_pedido=X em /contas-pagar, pra confirmar
//     se continua sendo ignorado.
//  3) Baixar TODAS as contas a pagar (sem limite de data, do jeito que a
//     produção buscaria) e olhar os nomes de campo de verdade, pra ver se
//     tem algum campo (tipo id_pedido, id_ordem_compra, numero_pedido)
//     realmente preenchido com valores diferentes por registro — e não
//     sempre vazio/igual como já foi confirmado antes.

require('dotenv').config({ path: require('path').join(__dirname, '.env') });

async function main() {
  const { oppRequest } = require('./src/services/oppService');

  // 1) Pega uma amostra de Ordens de Compra (primeira página) pra ter IDs reais
  console.log('=== 1) Amostra de /ordens-compra (primeira página) ===\n');
  const ocRes = await oppRequest('GET', '/ordens-compra?limit=10&offset=0&lixeira=Nao');
  const ocs = Array.isArray(ocRes) ? ocRes : (ocRes?.data || []);
  console.log(`Total nesta página: ${ocs.length}\n`);
  ocs.forEach((o) => {
    console.log(`  id_pedido=${o.id_pedido} | fornecedor="${o.nome_cliente}" | valor_total_nota=${o.valor_total_nota} | situacao=${o.situacao_pedido || o.status_pedido}`);
  });

  // 2) Pega o detalhe de UM registro específico (não a lista) pra comparar os campos
  const idTeste = ocs[0]?.id_pedido;
  if (idTeste) {
    console.log(`\n=== 2) GET /ordens-compra/${idTeste} (registro único) ===\n`);
    try {
      const detalhe = await oppRequest('GET', `/ordens-compra/${idTeste}`);
      console.log(JSON.stringify(detalhe, null, 2));
    } catch (e) {
      console.log(`Erro ao buscar registro único: ${e.message}`);
    }
  }

  // 3) Testa de novo o filtro id_pedido em /contas-pagar (pra confirmar se
  // ainda é ignorado, usando o MESMO id_pedido do passo 2 e um outro bem
  // diferente, pra ver se o resultado muda ou é sempre a mesma lista)
  if (idTeste) {
    console.log(`\n=== 3) GET /contas-pagar?id_pedido=${idTeste} ===\n`);
    const r1 = await oppRequest('GET', `/contas-pagar?id_pedido=${idTeste}&lixeira=Nao&limit=5`);
    const l1 = Array.isArray(r1) ? r1 : (r1?.data || []);
    console.log(`Total retornado: ${l1.length}`);
    l1.slice(0, 3).forEach((c) => console.log(`   id_conta_pag=${c.id_conta_pag} nome_conta="${c.nome_conta}" valor_pag=${c.valor_pag}`));

    const idOutro = ocs[ocs.length - 1]?.id_pedido;
    if (idOutro && idOutro !== idTeste) {
      const r2 = await oppRequest('GET', `/contas-pagar?id_pedido=${idOutro}&lixeira=Nao&limit=5`);
      const l2 = Array.isArray(r2) ? r2 : (r2?.data || []);
      console.log(`\nMesma busca com id_pedido=${idOutro} (outra OC) — total: ${l2.length}`);
      l2.slice(0, 3).forEach((c) => console.log(`   id_conta_pag=${c.id_conta_pag} nome_conta="${c.nome_conta}" valor_pag=${c.valor_pag}`));
      const mesmaLista = JSON.stringify(l1.map(c => c.id_conta_pag)) === JSON.stringify(l2.map(c => c.id_conta_pag));
      console.log(mesmaLista
        ? '\n⚠️  Confirmado: é a MESMA lista nos dois casos — o filtro id_pedido continua sendo ignorado pela API do OPP.'
        : '\n✅ Listas DIFERENTES — o filtro id_pedido parece funcionar agora! Vale investigar mais.');
    }
  }

  // 4) Baixa todas as contas a pagar (sem limite de data) e lista os nomes
  // de campo reais de uma amostra, procurando qualquer coisa que pareça
  // ligar ao pedido/O.C.
  console.log('\n=== 4) Campos reais de /contas-pagar (amostra de 5, sem limite de data) ===\n');
  let offset = 0, todas = [];
  while (todas.length < 5) {
    const r = await oppRequest('GET', `/contas-pagar?limit=5&offset=${offset}&lixeira=Nao`);
    const lista = Array.isArray(r) ? r : (r?.data || []);
    if (lista.length === 0) break;
    todas.push(...lista);
    offset += 5;
    if (offset > 50) break; // segurança, só queremos uma amostra
  }
  todas.slice(0, 5).forEach((c, i) => {
    console.log(`--- Registro ${i + 1} ---`);
    console.log(JSON.stringify(c, null, 2));
  });

  process.exit(0);
}

main().catch((e) => { console.error('Erro:', e.message); console.error(e.stack); process.exit(1); });
