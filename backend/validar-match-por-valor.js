// node backend/validar-match-por-valor.js
//
// Só lê. Não grava nada.
//
// Roda a MESMA lógica nova que acabou de entrar em medicoes.js (casar O.S.
// real do OPP com etapa do cronograma planejado pelo VALOR, não só pelo
// cliente) sobre os dados de verdade, pra você conferir os números antes de
// reiniciar o servidor e olhar a tela.

require('dotenv').config({ path: require('path').join(__dirname, '.env') });

const pBR = (v) => {
  const s = String(v || 0).trim();
  if (s.includes(',')) return parseFloat(s.replace(/\./g, '').replace(',', '.')) || 0;
  const parts = s.split('.');
  if (parts.length === 2 && parts[1].length <= 2) return parseFloat(s) || 0;
  return parseFloat(s.replace(/\./g, '')) || 0;
};

async function main() {
  const db = require('./src/services/postgresService');

  const [projetos, planejamentos, ordensServicoOPP] = await Promise.all([
    db.readSheet('Projetos_Contratos'),
    db.readSheet('Planejamentos'),
    db.readSheet('OrdensServico_OPP').catch(() => []),
  ]);

  if (ordensServicoOPP.length === 0) {
    console.log('A tabela OrdensServico_OPP está vazia — rode o "Sync OPP" na tela (ou POST /api/opp/sync) antes deste script.');
    return process.exit(0);
  }
  console.log(`${ordensServicoOPP.length} O.S. sincronizadas na tabela.\n`);

  const projMap = {};
  for (const p of projetos) projMap[p.ID_Projeto] = p;

  const reMedicao = /medi[cç][aã]o/i;
  const osDeMedicao = ordensServicoOPP.filter((o) =>
    reMedicao.test(o.Referencia || '') || reMedicao.test(o.Observacao || '') || reMedicao.test(o.Problema || '')
  );
  const osPorIdClienteOPP = {};
  for (const o of osDeMedicao) {
    const idCli = String(o.ID_Cliente_OPP || '');
    if (!idCli || idCli === '0') continue;
    (osPorIdClienteOPP[idCli] = osPorIdClienteOPP[idCli] || []).push(o);
  }

  const etapasPorIdClienteOPP = {};
  let totalEtapas = 0;
  for (const pl of planejamentos) {
    if (pl.Status !== 'Aprovado' || !pl.ID_Projeto) continue;
    const proj = projMap[pl.ID_Projeto];
    const idCli = proj?.ID_OPP_Cliente ? String(proj.ID_OPP_Cliente) : '';
    if (!idCli) continue;
    let dados = {};
    try { dados = JSON.parse(pl.Dados_JSON || '{}'); } catch {}
    const d = dados._baseline || dados;
    const meds = d.medicoesCronograma || dados.medicoes || [];
    meds.forEach((m, idx) => {
      const valor = pBR(m.valor || m.valorPlanejado || 0);
      if (valor <= 0) return;
      totalEtapas++;
      (etapasPorIdClienteOPP[idCli] = etapasPorIdClienteOPP[idCli] || []).push({
        idProjeto: pl.ID_Projeto, nome: proj.Nome, etapa: m.etapa || m.descricao || `Medição ${idx + 1}`, etapaIdx: idx, valor,
      });
    });
  }
  console.log(`${totalEtapas} etapa(s) planejada(s) no total, entre projetos com ID_OPP_Cliente confirmado.\n`);

  const tolerancia = () => 0.5; // mesma tolerância apertada do medicoes.js
  const etapasUsadas = new Set();
  const matches = [];
  const ambiguos = [];

  for (const [idCli, etapas] of Object.entries(etapasPorIdClienteOPP)) {
    const osDoCliente = osPorIdClienteOPP[idCli];
    if (!osDoCliente) continue;
    for (const o of osDoCliente) {
      const valorOS = pBR(o.Valor_Total);
      if (valorOS <= 0) continue;
      const candidatas = etapas.filter((e) =>
        !etapasUsadas.has(`${e.idProjeto}_${e.etapaIdx}`) && Math.abs(e.valor - valorOS) <= tolerancia(e.valor)
      );
      if (candidatas.length === 1) {
        etapasUsadas.add(`${candidatas[0].idProjeto}_${candidatas[0].etapaIdx}`);
        matches.push({ os: o, etapa: candidatas[0] });
      } else if (candidatas.length > 1) {
        ambiguos.push({ os: o, candidatas });
      }
    }
  }

  console.log(`=== RESULTADO ===`);
  console.log(`Etapas planejadas casadas com O.S. real (match único de valor): ${matches.length} de ${totalEtapas}`);
  console.log(`Casos ambíguos (O.S. bateu em mais de uma etapa — nenhuma foi usada): ${ambiguos.length}\n`);

  console.log('Amostra de matches (até 20):');
  for (const m of matches.slice(0, 20)) {
    console.log(`  "${m.etapa.nome}" — etapa "${m.etapa.etapa}" (R$ ${m.etapa.valor.toFixed(2)}) ← O.S. [id ${m.os.ID_OS_OPP}] "${m.os.Referencia}" (R$ ${pBR(m.os.Valor_Total).toFixed(2)})`);
  }

  if (ambiguos.length > 0) {
    console.log('\nAmostra de ambíguos (até 10):');
    for (const a of ambiguos.slice(0, 10)) {
      console.log(`  O.S. [id ${a.os.ID_OS_OPP}] "${a.os.Referencia}" (R$ ${pBR(a.os.Valor_Total).toFixed(2)}) bateu em: ${a.candidatas.map((c) => `"${c.nome}"/"${c.etapa}"`).join(' | ')}`);
    }
  }

  // Conferência específica do Monte Castelo
  const monteCastelo = Object.values(projMap).find((p) => p.Nome === 'ARQ-2025-4-URBANIZAÇÃO DO CAMPO MONTE CASTELO');
  if (monteCastelo) {
    const matchesMC = matches.filter((m) => m.etapa.idProjeto === monteCastelo.ID_Projeto);
    console.log(`\n=== Conferência: "URBANIZAÇÃO DO CAMPO MONTE CASTELO" ===`);
    console.log(`Etapas casadas com O.S. real: ${matchesMC.length}`);
    for (const m of matchesMC) {
      console.log(`  "${m.etapa.etapa}" (R$ ${m.etapa.valor.toFixed(2)}) ← O.S. [id ${m.os.ID_OS_OPP}] "${m.os.Referencia}"`);
    }
  }

  process.exit(0);
}

main().catch((e) => { console.error('Erro:', e.message); console.error(e.stack); process.exit(1); });
