// node backend/diagnosticar-sem-id-opp-cliente.js
//
// Levantamento pedido pelo chef: quantos projetos Aprovados estão sem
// ID_OPP_Cliente cadastrado em Projetos_Contratos. Sem esse campo, o motor
// de O.S./NF (medicoesService.js) não consegue nem tentar casar por valor —
// só sobra o centro de custo (ID_Centro_Custo_OPP, no Planejamento) como
// única via de casamento. Esse script só lê e lista — não grava nada.
//
// Pra cada projeto Aprovado, mostra: se tem ID_OPP_Cliente, se tem
// ID_Centro_Custo_OPP, e classifica em 3 grupos:
//   OK           — tem ID_OPP_Cliente (motor completo disponível)
//   SÓ_CC        — sem ID_OPP_Cliente, mas tem centro de custo (ainda dá
//                  pra casar, só que só por essa via)
//   DESPROTEGIDO — sem ID_OPP_Cliente E sem centro de custo (nenhuma via de
//                  casamento — qualquer pagamento desse projeto no OPP
//                  nunca vai aparecer como Recebido aqui, não importa o que
//                  aconteça lá)

require('dotenv').config({ path: require('path').join(__dirname, '.env') });

async function main() {
  const db = require('./src/services/postgresService');

  const [projetos, planejamentos] = await Promise.all([
    db.readSheet('Projetos_Contratos'),
    db.readSheet('Planejamentos'),
  ]);

  const projMap = {};
  for (const p of projetos) projMap[p.ID_Projeto] = p;

  const aprovados = planejamentos.filter((p) => p.Status === 'Aprovado' && p.ID_Projeto);

  const grupos = { OK: [], SO_CC: [], DESPROTEGIDO: [] };

  for (const plan of aprovados) {
    const proj = projMap[plan.ID_Projeto] || {};
    const temCliente = !!(proj.ID_OPP_Cliente && String(proj.ID_OPP_Cliente).trim());
    const temCC = !!(plan.ID_Centro_Custo_OPP && String(plan.ID_Centro_Custo_OPP).trim());
    const info = {
      id: plan.ID_Projeto,
      nome: proj.Nome || plan.Nome_Projeto || '(sem nome)',
      cliente: proj.Cliente || proj.Nome_Cliente || '(sem cliente cadastrado)',
      idOppCliente: proj.ID_OPP_Cliente || '',
      idCC: plan.ID_Centro_Custo_OPP || '',
    };
    if (temCliente) grupos.OK.push(info);
    else if (temCC) grupos.SO_CC.push(info);
    else grupos.DESPROTEGIDO.push(info);
  }

  console.log(`Total de projetos Aprovados: ${aprovados.length}\n`);

  console.log(`=== OK — tem ID_OPP_Cliente (${grupos.OK.length}) ===`);
  console.log('(motor completo disponível pra esses — nenhuma ação necessária)\n');

  console.log(`=== SÓ_CC — SEM ID_OPP_Cliente, mas TEM centro de custo (${grupos.SO_CC.length}) ===`);
  console.log('(funciona hoje via centro de custo, mas sem 2ª via — vale preencher o cliente quando der)\n');
  grupos.SO_CC.forEach((p) => {
    console.log(`  ${p.id} | ${p.nome} | cliente="${p.cliente}" | CC=${p.idCC}`);
  });

  console.log(`\n=== DESPROTEGIDO — SEM ID_OPP_Cliente E SEM centro de custo (${grupos.DESPROTEGIDO.length}) ===`);
  console.log('(NENHUMA via de casamento — esses nunca vão mostrar Recebido, mesmo se já tiverem sido pagos no OPP. PRIORIDADE pra preencher.)\n');
  grupos.DESPROTEGIDO.forEach((p) => {
    console.log(`  ${p.id} | ${p.nome} | cliente="${p.cliente}" | CC=${p.idCC || '(vazio)'}`);
  });

  console.log(`\n=== RESUMO ===`);
  console.log(`OK (tem cliente):                    ${grupos.OK.length} / ${aprovados.length}`);
  console.log(`Só centro de custo (sem cliente):    ${grupos.SO_CC.length} / ${aprovados.length}`);
  console.log(`Desprotegido (sem as duas):           ${grupos.DESPROTEGIDO.length} / ${aprovados.length}`);

  process.exit(0);
}

main().catch((e) => { console.error('Erro:', e.message); console.error(e.stack); process.exit(1); });
