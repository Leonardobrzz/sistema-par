// node backend/diagnosticar-valor-pago-oc2.js
//
// Só lê (não grava nada). Continuação do diagnosticar-valor-pago-oc.js:
// já confirmamos que (a) /contas-pagar?id_pedido=X é ignorado pela API do
// OPP (sempre devolve a mesma lista genérica) e (b) os registros de Contas
// a Pagar não têm NENHUM campo que aponte de volta pra uma Ordem de Compra
// (sem id_pedido, id_ordem_compra, etc. — só "identificacao" tipo
// "CUSTOFIXO", que é só uma etiqueta de categoria, não um vínculo).
//
// Mas a amostra anterior pegou os primeiros registros de contas a pagar do
// OPP inteiro (despesa de contabilidade, seguro, aluguel...) — nada a ver
// com as Ordens de Compra de Terceirizados de verdade. Esse script tenta
// uma última hipótese, usando a MESMA estratégia que já funcionou pra
// Medições (casar pelo VALOR, já que não tem ID confiável): busca, pra um
// punhado de fornecedores reais de O.C. de Terceirizados, se existe alguma
// conta a pagar com esse MESMO fornecedor e um valor_pag/valor_pago igual
// (ou bem próximo) ao valor_total_nota da O.C. Se achar exatamente 1 conta
// com fornecedor+valor batendo, é um bom sinal de que dá pra confiar nesse
// casamento (sem ID, só por fornecedor+valor, com cuidado pra não casar
// errado quando o mesmo fornecedor tem várias contas parecidas).

require('dotenv').config({ path: require('path').join(__dirname, '.env') });

async function main() {
  const { oppRequest } = require('./src/services/oppService');

  console.log('=== Baixando TODAS as Ordens de Compra (sem limite) ===\n');
  let offset = 0, ocs = [];
  while (true) {
    const r = await oppRequest('GET', `/ordens-compra?limit=250&offset=${offset}&lixeira=Nao`);
    const lista = Array.isArray(r) ? r : (r?.data || []);
    if (lista.length === 0) break;
    ocs.push(...lista);
    if (lista.length < 250) break;
    offset += 250;
    if (offset > 5000) break;
  }
  console.log(`Total de O.C. carregadas: ${ocs.length}`);

  // Só olha O.C. já "Atendidas" (finalizadas) — são as que fazem mais
  // sentido já terem sido pagas. Pega até 8 pra não demorar demais.
  const amostra = ocs.filter(o => (o.situacao_pedido || o.status_pedido || '').toLowerCase().includes('atendid')).slice(0, 8);
  console.log(`Testando ${amostra.length} O.C. atendidas como amostra.\n`);

  console.log('=== Baixando TODAS as Contas a Pagar (sem limite de data) ===\n');
  offset = 0;
  let contas = [];
  while (true) {
    const r = await oppRequest('GET', `/contas-pagar?limit=250&offset=${offset}&lixeira=Nao`);
    const lista = Array.isArray(r) ? r : (r?.data || []);
    if (lista.length === 0) break;
    contas.push(...lista);
    if (lista.length < 250) break;
    offset += 250;
    if (offset > 10000) break;
  }
  console.log(`Total de contas a pagar carregadas: ${contas.length}\n`);

  const norm = (s) => (s || '').toString().toLowerCase().trim().normalize('NFD').replace(/[̀-ͯ]/g, '');
  const tolerancia = 0.5;

  console.log('=== Tentando casar cada O.C. por FORNECEDOR + VALOR ===\n');
  for (const oc of amostra) {
    const fornecedorOC = norm(oc.nome_cliente);
    const valorOC = parseFloat(oc.valor_total_nota || 0);
    const candidatas = contas.filter((c) => {
      const fornecedorConta = norm(c.nome_fornecedor);
      if (!fornecedorConta || !fornecedorOC) return false;
      if (!(fornecedorConta.includes(fornecedorOC) || fornecedorOC.includes(fornecedorConta))) return false;
      const valorConta = parseFloat(c.valor_pag || 0);
      return Math.abs(valorConta - valorOC) <= tolerancia;
    });
    console.log(`O.C. id_pedido=${oc.id_pedido} | fornecedor="${oc.nome_cliente}" | valor=${valorOC}`);
    if (candidatas.length === 0) {
      console.log('   → nenhuma conta a pagar com esse fornecedor+valor encontrada.');
    } else if (candidatas.length === 1) {
      const c = candidatas[0];
      console.log(`   ✅ 1 match único → id_conta_pag=${c.id_conta_pag} valor_pag=${c.valor_pag} valor_pago=${c.valor_pago} liquidado_pag=${c.liquidado_pag} data_pagamento=${c.data_pagamento}`);
    } else {
      console.log(`   ⚠️  ${candidatas.length} contas bateram fornecedor+valor — ambíguo, não dá pra confiar:`);
      candidatas.forEach((c) => console.log(`      id_conta_pag=${c.id_conta_pag} valor_pag=${c.valor_pag} data_pagamento=${c.data_pagamento}`));
    }
    console.log('');
  }

  process.exit(0);
}

main().catch((e) => { console.error('Erro:', e.message); console.error(e.stack); process.exit(1); });
