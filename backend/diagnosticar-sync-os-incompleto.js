// node backend/diagnosticar-sync-os-incompleto.js
//
// Só lê (não grava nada). A tabela local OrdensServico_OPP só tem 171
// registros, mas as observações das contas a receber citam O.S. até nº 1777+
// (ex.: "ordem de serviço nº 1777" pra uma conta da FORTIM) — ou seja, o
// sync (syncOrdensServico, em oppService.js) está trazendo só uma fração do
// que existe de verdade no OPP. Esse script busca direto na API do OPP (sem
// usar a tabela local) pra: 1) contar quantas O.S. existem de verdade (sem
// lixeira), 2) achar especificamente o id_pedido=1777 (e 1775/1776) e ver
// os campos reais dele, principalmente "referencia_ordem" (pra checar se
// cita a NF, do jeito que o medicoes.js espera) e qualquer campo de centro
// de custo/projeto.

require('dotenv').config({ path: require('path').join(__dirname, '.env') });

async function main() {
  const { oppRequest } = require('./src/services/oppService');

  console.log('=== Buscando TODAS as Ordens de Serviço direto da API (sem limite de segurança baixo) ===\n');
  const LIMIT = 200;
  let offset = 0, todas = [], primeiraIdAnterior = null, paginas = 0;
  while (true) {
    const data = await oppRequest('GET', `/ordens-servico?limit=${LIMIT}&offset=${offset}`);
    const lista = Array.isArray(data) ? data : (data?.data || []);
    paginas++;
    console.log(`  página offset=${offset}: ${lista.length} registros | primeiro id_pedido=${lista[0]?.id_pedido} último id_pedido=${lista[lista.length-1]?.id_pedido}`);
    if (lista.length === 0) break;
    if (primeiraIdAnterior !== null && lista[0]?.id_pedido === primeiraIdAnterior) {
      console.log('  → MESMA primeira linha da página anterior: offset está sendo ignorado pela API, parando.');
      break;
    }
    primeiraIdAnterior = lista[0]?.id_pedido;
    todas.push(...lista);
    if (lista.length < LIMIT) break;
    offset += LIMIT;
    if (offset > 20000) break;
    if (paginas > 60) break; // segurança extra só deste diagnóstico
  }
  console.log(`\nTotal bruto recebido: ${todas.length}`);
  const semLixeira = todas.filter((o) => o.lixeira !== 'Sim');
  console.log(`Sem lixeira: ${semLixeira.length}`);
  const comIdPedido = semLixeira.filter((o) => o.id_pedido != null && String(o.id_pedido).trim() !== '');
  console.log(`Com id_pedido válido: ${comIdPedido.length}\n`);

  console.log('=== Procurando id_pedido 1775, 1776, 1777 (citados nas contas da FORTIM) ===\n');
  [1775, 1776, 1777].forEach((num) => {
    const achado = todas.find((o) => String(o.id_pedido) === String(num));
    if (achado) {
      console.log(`id_pedido=${num} ENCONTRADO:`);
      console.log('  ' + JSON.stringify(achado));
    } else {
      console.log(`id_pedido=${num} NÃO encontrado nos ${todas.length} registros buscados.`);
    }
  });

  process.exit(0);
}

main().catch((e) => { console.error('Erro:', e.message); console.error(e.stack); process.exit(1); });
