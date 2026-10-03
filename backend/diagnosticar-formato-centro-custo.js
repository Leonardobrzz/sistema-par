// node backend/diagnosticar-formato-centro-custo.js
//
// Só lê (não grava nada). Filtrar a lixeira (lixeira=Nao) não mudou o total
// Recebido NADA (ficou exatamente R$ 1.233.818 igual antes) — ou seja, os
// registros removidos (lixeira) já estavam sendo ignorados mesmo (porque não
// tinham centro de custo), então não eram a causa do problema de verdade.
//
// O chef mostrou print do OPP com "Centro de custos" preenchido como TEXTO
// livre (ex.: "SAN AGUAS DO SERTÃO AURORA E"), não um dropdown com ID fixo.
// Hipótese nova: o campo que realmente importa pra bater com nosso cadastro
// é o TEXTO (centro_custos_rec), não o id_centro_custos (que pode ficar 0
// mesmo com texto preenchido, se for campo livre sem vínculo a uma lista).
// E nosso Planejamentos.ID_Centro_Custo_OPP pode estar cadastrado num
// formato que não bate com esse texto.
//
// Esse script: 1) mostra os campos reais de centro de custo (id E texto) de
// uma amostra de contas ATIVAS e liquidadas; 2) mostra como o
// ID_Centro_Custo_OPP está cadastrado nos nossos Planejamentos Aprovados,
// pra comparar os dois formatos lado a lado.

require('dotenv').config({ path: require('path').join(__dirname, '.env') });

async function main() {
  const { oppRequest } = require('./src/services/oppService');
  const db = require('./src/services/postgresService');

  const planejamentos = await db.readSheet('Planejamentos');
  const aprovados = planejamentos.filter((p) => p.Status === 'Aprovado');

  console.log('=== Como ID_Centro_Custo_OPP está cadastrado nos Planejamentos Aprovados (amostra de 15) ===\n');
  aprovados.slice(0, 15).forEach((p) => {
    console.log(`  ${p.ID_Projeto} | ID_Centro_Custo_OPP="${p.ID_Centro_Custo_OPP}" | Nr_Contrato_OS="${p.Nr_Contrato_OS || ''}"`);
  });

  let offset = 0, ativas = [];
  while (true) {
    const r = await oppRequest('GET', `/contas-receber?limit=250&offset=${offset}&lixeira=Nao`);
    const lista = Array.isArray(r) ? r : (r?.data || []);
    if (lista.length === 0) break;
    ativas.push(...lista);
    if (lista.length < 250) break;
    offset += 250;
    if (offset > 10000) break;
  }
  const liquidadasAtivas = ativas.filter((r) => r.liquidado_rec === 'Sim');
  console.log(`\nTotal de contas ATIVAS liquidadas: ${liquidadasAtivas.length}\n`);

  console.log('=== Campos de centro de custo de 20 contas ATIVAS liquidadas (amostra) ===\n');
  liquidadasAtivas.slice(0, 20).forEach((r) => {
    console.log(`  id_conta_rec=${r.id_conta_rec} | id_centro_custos=${r.id_centro_custos} | centro_custos_rec="${r.centro_custos_rec}" | nome_cliente="${r.nome_cliente}" | valor_rec=${r.valor_rec}`);
  });

  // Conta quantas têm id_centro_custos != 0 vs quantas têm só o texto
  const comId = liquidadasAtivas.filter((r) => r.id_centro_custos && r.id_centro_custos !== 0);
  const comTextoSemId = liquidadasAtivas.filter((r) => (!r.id_centro_custos || r.id_centro_custos === 0) && r.centro_custos_rec && r.centro_custos_rec !== 'null');
  console.log(`\nCom id_centro_custos preenchido (numérico): ${comId.length}`);
  console.log(`Com SÓ o texto (centro_custos_rec) preenchido, sem id: ${comTextoSemId.length}`);

  // Pega os IDs de centro de custo registrados nos planejamentos e checa
  // quantos realmente aparecem no universo de contas ativas liquidadas
  const idsRegistrados = new Set(aprovados.filter((p) => p.ID_Centro_Custo_OPP).map((p) => String(p.ID_Centro_Custo_OPP)));
  const idsNasContas = new Set(liquidadasAtivas.map((r) => String(r.id_centro_custos || '')).filter((x) => x && x !== '0'));
  let bateram = 0;
  idsRegistrados.forEach((id) => { if (idsNasContas.has(id)) bateram++; });
  console.log(`\nIDs de centro de custo registrados nos Planejamentos: ${idsRegistrados.size}`);
  console.log(`Desses, quantos aparecem de fato em alguma conta ativa liquidada: ${bateram}`);

  process.exit(0);
}

main().catch((e) => { console.error('Erro:', e.message); console.error(e.stack); process.exit(1); });
