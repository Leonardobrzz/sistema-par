// node backend/auditar-vinculos-os-multiplos.js
//
// Só lê (não grava nada). O chef notou que vários projetos aparecem com
// mais de uma O.S. coladas no campo Nr_OS_OPP (ex.: "49,50,65",
// "43,62,63", "104,105,170", etc.) e pediu pra conferir se isso tá
// certo — já achamos um caso real de link errado (O.S. 50 da SEDUC
// colada por engano no projeto de urbanização de Solonópole, que é
// outro contrato/secretaria).
//
// Esse script generaliza aquela checagem pra TODOS os projetos:
//  1) Pega cada Planejamento que tem mais de uma O.S. no Nr_OS_OPP.
//  2) Pra cada O.S. do grupo, busca ela na tabela já sincronizada
//     OrdensServico_OPP (cliente, valor, referência).
//  3) Confere se o valor dessa O.S. bate (R$0,50 de tolerância) com
//     ALGUMA etapa do cronograma DESSE MESMO projeto.
//  4) Se não bater com nenhuma etapa aqui, procura em TODOS os outros
//     projetos se o valor bate com alguma etapa de lá — pra sugerir onde
//     essa O.S. deveria estar de verdade.
//
// Isso não prova sozinho que tá errado (pode ser uma O.S. de uma etapa
// antiga/já faturada que não está mais no cronograma, por exemplo), mas
// toda vez que aparecer ⚠️ vale a pena um humano olhar a referência e
// decidir.

require('dotenv').config({ path: require('path').join(__dirname, '.env') });

const pBR = (v) => {
  const s = String(v || 0).trim().replace(/R\$\s*/g, '').trim();
  if (s.includes(',')) return parseFloat(s.replace(/\./g, '').replace(',', '.')) || 0;
  const partes = s.split('.');
  if (partes.length === 2 && partes[1].length <= 2) return parseFloat(s) || 0;
  return parseFloat(s.replace(/\./g, '')) || 0;
};

function getStageValues(plan) {
  let dados = {};
  try { dados = JSON.parse(plan.Dados_JSON || '{}'); } catch {}
  const d = dados._baseline || dados;
  const meds = d.medicoesCronograma || dados.medicoes || [];
  return meds.map((m) => ({
    etapa: m.etapa || m.descricao || '(sem nome)',
    valor: pBR(m.valor || m.valorPlanejado || 0),
  }));
}

async function main() {
  const db = require('./src/services/postgresService');
  const [projetos, planejamentos, ordensOS] = await Promise.all([
    db.readSheet('Projetos_Contratos'),
    db.readSheet('Planejamentos'),
    db.readSheet('OrdensServico_OPP'),
  ]);

  const projMap = new Map(projetos.map((p) => [p.ID_Projeto, p]));
  const osMap = new Map(ordensOS.map((o) => [String(o.ID_OS_OPP), o]));

  // pré-calcula as etapas de TODO planejamento, pra poder procurar "onde
  // mais essa O.S. bateria" quando não bater no próprio projeto
  const stagesPorPlanejamento = planejamentos.map((pl) => ({
    pl,
    proj: projMap.get(pl.ID_Projeto),
    stages: getStageValues(pl),
  }));

  const grupos = planejamentos.filter((pl) => (pl.Nr_OS_OPP || '').includes(','));
  console.log(`Encontrados ${grupos.length} planejamento(s) com mais de uma O.S. coladas no Nr_OS_OPP.\n`);

  let totalSuspeitas = 0;

  for (const pl of grupos) {
    const proj = projMap.get(pl.ID_Projeto);
    const nomeProj = proj ? proj.Nome : `(projeto não encontrado — ID ${pl.ID_Projeto})`;
    const osList = pl.Nr_OS_OPP.split(',').map((s) => s.trim()).filter(Boolean);
    const stages = getStageValues(pl);

    const linhas = [];
    let temSuspeita = false;

    for (const osNum of osList) {
      const os = osMap.get(osNum);
      if (!os) {
        linhas.push(`  ⚠️  O.S. ${osNum}: não encontrada na tabela sincronizada (confere se ainda existe no OPP).`);
        temSuspeita = true;
        continue;
      }
      const valorOS = pBR(os.Valor_Total);
      const bateAqui = stages.find((s) => Math.abs(s.valor - valorOS) <= 0.5);
      if (bateAqui) {
        linhas.push(`  ✅ O.S. ${osNum} (R$ ${valorOS.toFixed(2)}) — bate com a etapa "${bateAqui.etapa}" deste projeto. Referência: "${os.Referencia || '(vazio)'}"`);
        continue;
      }

      // não bateu aqui — procura em outros projetos
      let sugestao = null;
      for (const outro of stagesPorPlanejamento) {
        if (outro.pl.ID === pl.ID) continue;
        const achou = outro.stages.find((s) => Math.abs(s.valor - valorOS) <= 0.5);
        if (achou) { sugestao = { projeto: outro.proj ? outro.proj.Nome : '(?)', etapa: achou.etapa }; break; }
      }
      temSuspeita = true;
      totalSuspeitas++;
      const sugestaoTxt = sugestao
        ? `poderia ser do projeto "${sugestao.projeto}" (etapa "${sugestao.etapa}")`
        : 'não achei o valor batendo em nenhum outro projeto também — pode ser etapa antiga/já faturada fora do cronograma atual';
      linhas.push(`  ⚠️  O.S. ${osNum} (R$ ${valorOS.toFixed(2)}) — NÃO bate com nenhuma etapa deste projeto. Cliente: "${os.Nome_Cliente}". Referência: "${os.Referencia || '(vazio)'}". Sugestão: ${sugestaoTxt}`);
    }

    if (temSuspeita) {
      console.log(`### ${nomeProj} (Planejamento ${pl.ID}) — Nr_OS_OPP: "${pl.Nr_OS_OPP}" ###`);
      linhas.forEach((l) => console.log(l));
      console.log('');
    }
  }

  console.log(`\nTotal de O.S. suspeitas (não batem com nenhuma etapa do próprio projeto): ${totalSuspeitas}`);
  console.log('(Projetos onde TODAS as O.S. do grupo bateram certinho não foram listados acima — só os que têm pelo menos uma suspeita.)');

  process.exit(0);
}

main().catch((e) => { console.error('Erro:', e.message); console.error(e.stack); process.exit(1); });
