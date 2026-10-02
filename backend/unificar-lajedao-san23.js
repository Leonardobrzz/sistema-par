// node backend/unificar-lajedao-san23.js [--apply]
//
// Funde o "SAN-30-SIAA LAJEDÃO III" dentro do "SAN-23-SIAA
// FERRAZNÓPOLIS,JURACITABA,IBIRAPUÃ E LAJEDÃO - EMBASA", confirmado pelo
// chef ("pode unificar") — o Centro de Custo real no OPP cobre os 4
// municípios juntos, sem separar por cidade, então manter os dois como
// projetos separados no Par só confunde.
//
// O que faz (só com --apply; sem a flag só mostra o que faria):
//  1) Copia as 12 etapas do cronograma do SAN-30 pro final do cronograma
//     do SAN-23 — não perde o planejamento que já foi feito pra Lajedão.
//  2) Remove do cronograma do SAN-23 uma etapa quebrada que já tinha lá
//     (sem nome, sem valor — sobra de edição antiga).
//  3) Muda o Planejamento do SAN-30 de "Aprovado" pra "Arquivado". Sem
//     isso, ele continuaria sendo lido pelas telas que pegam todo
//     planejamento Aprovado (Medições, casamento por valor com O.S. real
//     do OPP) — ia aparecer uma cópia duplicada do cronograma rodando ao
//     lado da versão já unificada no SAN-23.
//  4) Marca o projeto SAN-30 como Arquivado em Projetos_Contratos (mesmo
//     campo que o resto do sistema já usa pra esconder projeto encerrado
//     das listas ativas).
//
// Já conferimos antes (investigar-lajedao-san23.js): não existe NENHUMA
// medição real nem O.S. vinculada a nenhum dos dois ainda — só mexe em
// planejamento, nada de dado financeiro real é tocado ou perdido.

require('dotenv').config({ path: require('path').join(__dirname, '.env') });
const APPLY = process.argv.includes('--apply');

const ID_SAN23_PROJETO = '54685614-9a76-4d64-981a-0de93efacb0b';
const ID_SAN23_PLAN = '6789afad-a366-454e-8994-f9631e78d87c';
const ID_SAN30_PROJETO = '667b6633-9c06-4944-be39-bee661fb43ba';
const ID_SAN30_PLAN = '64a3ac23-20d0-4b18-b0f1-c5ac3f25241b';

function getMeds(dadosRaw) {
  if (dadosRaw._baseline && Array.isArray(dadosRaw._baseline.medicoesCronograma)) {
    return { arr: dadosRaw._baseline.medicoesCronograma, loc: 'baseline' };
  }
  if (Array.isArray(dadosRaw.medicoesCronograma)) return { arr: dadosRaw.medicoesCronograma, loc: 'flatCronograma' };
  if (Array.isArray(dadosRaw.medicoes)) return { arr: dadosRaw.medicoes, loc: 'medicoes' };
  return { arr: [], loc: dadosRaw._baseline ? 'baseline' : 'flatCronograma' };
}

function setMeds(dadosRaw, loc, novoArr) {
  const copia = JSON.parse(JSON.stringify(dadosRaw));
  if (loc === 'baseline') { copia._baseline = copia._baseline || {}; copia._baseline.medicoesCronograma = novoArr; }
  else if (loc === 'flatCronograma') copia.medicoesCronograma = novoArr;
  else copia.medicoes = novoArr;
  return copia;
}

async function main() {
  const db = require('./src/services/postgresService');

  const [projetos, planejamentos] = await Promise.all([
    db.readSheet('Projetos_Contratos'),
    db.readSheet('Planejamentos'),
  ]);

  const projSan23 = projetos.find((p) => p.ID_Projeto === ID_SAN23_PROJETO);
  const projSan30 = projetos.find((p) => p.ID_Projeto === ID_SAN30_PROJETO);
  const planSan23 = planejamentos.find((p) => p.ID === ID_SAN23_PLAN);
  const planSan30 = planejamentos.find((p) => p.ID === ID_SAN30_PLAN);

  if (!projSan23 || !projSan30 || !planSan23 || !planSan30) {
    console.log('Não achei um dos 4 registros esperados (IDs fixos do que vimos no diagnóstico) — abortando sem mexer em nada.');
    console.log({ projSan23: !!projSan23, projSan30: !!projSan30, planSan23: !!planSan23, planSan30: !!planSan30 });
    process.exit(1);
  }

  let dadosSan23 = {}; try { dadosSan23 = JSON.parse(planSan23.Dados_JSON || '{}'); } catch {}
  let dadosSan30 = {}; try { dadosSan30 = JSON.parse(planSan30.Dados_JSON || '{}'); } catch {}

  const { arr: meds23, loc: loc23 } = getMeds(dadosSan23);
  const { arr: meds30 } = getMeds(dadosSan30);

  console.log(`SAN-23 tem ${meds23.length} etapa(s) hoje.`);
  console.log(`SAN-30 tem ${meds30.length} etapa(s) hoje.\n`);

  const meds23Limpas = meds23.filter((m) => {
    const valor = parseFloat(String(m.valor ?? m.valorPlanejado ?? '0').replace(',', '.'));
    const nome = m.etapa || m.descricao;
    const ok = !!nome && nome !== 'undefined' && valor > 0;
    if (!ok) console.log(`  Removendo etapa quebrada do SAN-23 (sem nome/valor válido): ${JSON.stringify(m)}`);
    return ok;
  });

  const cronogramaFinal = [...meds23Limpas, ...meds30];
  console.log(`\nCronograma final do SAN-23 depois da fusão: ${cronogramaFinal.length} etapa(s) (${meds23Limpas.length} que já tinha + ${meds30.length} vindas do SAN-30).`);

  if (APPLY) {
    const novoDadosSan23 = setMeds(dadosSan23, loc23, cronogramaFinal);
    await db.updateRowById('Planejamentos', 'ID', planSan23.ID, { ...planSan23, Dados_JSON: JSON.stringify(novoDadosSan23) });
    console.log('✅ Cronograma do SAN-23 atualizado com as etapas do SAN-30.');

    await db.updateRowById('Planejamentos', 'ID', planSan30.ID, { ...planSan30, Status: 'Arquivado' });
    console.log('✅ Planejamento do SAN-30 marcado como Arquivado (não entra mais em paralelo nas telas que leem Aprovado).');

    await db.updateRowById('Projetos_Contratos', 'ID_Projeto', projSan30.ID_Projeto, { ...projSan30, Status: 'Arquivado' });
    console.log('✅ Projeto "SAN-30-SIAA LAJEDÃO III" marcado como Arquivado.');

    console.log('\nPronto — o contrato único (4 municípios) agora vive só no SAN-23, com as etapas do Lajedão III somadas ao cronograma dele.');
  } else {
    console.log('\nModo de conferência — nada foi gravado ainda. Confere os números acima e roda de novo com --apply pra aplicar de verdade.');
  }

  process.exit(0);
}

main().catch((e) => { console.error('Erro:', e.message); console.error(e.stack); process.exit(1); });
