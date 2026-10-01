// node backend/diagnostico-despesas-lixeira.js
//
// Só lê. O diagnóstico anterior achou TODAS as 5250 despesas com lixeira
// marcado (0 sobraram depois do filtro lixeira !== 'Sim') — isso é estranho
// demais pra ser verdade (significaria que toda despesa dos últimos 18 meses
// foi excluída no OPP). Mais provável: o campo lixeira vem num formato
// diferente do esperado (boolean, número, string diferente de "Sim" com
// espaço/maiúscula etc). Este script só imprime os valores crus, sem filtrar
// nada, pra eu ver exatamente o que tem lá.

require('dotenv').config({ path: require('path').join(__dirname, '.env') });

async function main() {
  const opp = require('./src/services/oppService');

  const agora = new Date();
  const inicio = new Date(agora);
  inicio.setMonth(inicio.getMonth() - 1); // só 1 mês, pra ser rápido

  const fmt = (d) => d.toISOString().split('T')[0];
  const despesas = await opp.listarDespesas({ data_inicio: fmt(inicio), data_fim: fmt(agora) });
  const lista = Array.isArray(despesas) ? despesas : (despesas?.data || []);

  console.log(`Total no último mês: ${lista.length}\n`);

  // Conta valores distintos do campo lixeira (valor + tipo)
  const contagem = {};
  lista.forEach(d => {
    const chave = `${JSON.stringify(d.lixeira)} (tipo: ${typeof d.lixeira})`;
    contagem[chave] = (contagem[chave] || 0) + 1;
  });
  console.log('Valores distintos de "lixeira":');
  Object.entries(contagem).forEach(([k, v]) => console.log(`  ${k}: ${v}`));

  console.log('\nPrimeiro registro completo (todos os campos):');
  console.log(JSON.stringify(lista[0], null, 2));

  console.log('\nAmostra de 5 — id_centro_custos e campos parecidos:');
  lista.slice(0, 5).forEach(d => {
    const camposCC = Object.keys(d).filter(k => k.toLowerCase().includes('centro') || k.toLowerCase().includes('custo'));
    console.log(`  nome_conta="${d.nome_conta}" | lixeira=${JSON.stringify(d.lixeira)} | campos com "centro/custo": ${JSON.stringify(camposCC)}`);
    camposCC.forEach(c => console.log(`      ${c} = ${JSON.stringify(d[c])}`));
  });

  process.exit(0);
}

main().catch(e => { console.error('Erro:', e.message); console.error(e.stack); process.exit(1); });
