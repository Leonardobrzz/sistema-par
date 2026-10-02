// node backend/inspecionar-campos-os-opp.js
//
// Só lê (não grava nada). Pra montar o link direto de cada Ordem de Serviço
// pro OPP (formato visto no navegador:
// https://erp.opportune.com.br/index.php?Secao=Servicos.Ordem&Modulo=Servicos#!editar/15869533)
// preciso saber qual campo da API retorna esse número grande (15869533) —
// hoje só guardamos o "id_pedido" (que é um número pequeno, tipo 49, 92,
// 164...) e ele claramente não é o mesmo número da URL. Esse script busca
// algumas Ordens de Serviço direto da API e imprime TODOS os campos brutos
// de cada uma (não só os que o sistema já guarda), pra eu achar qual campo
// bate com o número da URL.

require('dotenv').config({ path: require('path').join(__dirname, '.env') });

async function main() {
  const { oppRequest } = require('./src/services/oppService');
  const data = await oppRequest('GET', '/ordens-servico?limit=5&offset=0');
  const lista = Array.isArray(data) ? data : (data?.data || []);

  if (!lista.length) {
    console.log('Nenhuma O.S. retornada pela API (confere limites/offset).');
    process.exit(1);
  }

  console.log(`### ${lista.length} Ordens de Serviço (todos os campos brutos da API) ###\n`);
  lista.forEach((o, i) => {
    console.log(`--- Registro ${i + 1} (id_pedido = ${o.id_pedido}) ---`);
    console.log(JSON.stringify(o, null, 2));
    console.log('');
  });

  process.exit(0);
}

main().catch((e) => { console.error('Erro:', e.message); console.error(e.stack); process.exit(1); });
