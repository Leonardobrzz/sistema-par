// node backend/diagnosticar-projetos-zerados.js
//
// O chef pediu pra confirmar se os projetos que aparecem com Recebido R$ 0
// na tabela de Rentabilidade (depois da troca pro motor de O.S./NF da tela
// de Medições) estão zerados DE VERDADE (nenhum pagamento ainda no OPP) ou
// se é o casamento por valor/NF que tá falhando em algum caso.
//
// Esse script não grava nada — só mostra, pra uma lista de projetos
// suspeitos, tudo que o motor de casamento usa pra decidir: o cliente do
// OPP vinculado, as O.S. desse cliente (valor, referência, status), as
// etapas planejadas do cronograma (valor), e se bateu ou não — e por quê.

require('dotenv').config({ path: require('path').join(__dirname, '.env') });

// Ajuste essa lista se quiser checar outros projetos — são os que apareceram
// com R$ 0 na tabela e valem a pena olhar (maiores contratos + alguns
// aleatórios).
const PROJETOS_SUSPEITOS = [
  'ARQ-2026-4-AGÊNCIA DE CORREIOS DE SANTARÉM',
  'INF-2026-01 -TUNEL RODOVIÁRIO E BOULEVARD DA AVENIDA CENTRAL DE TAGUATINGA',
  'SAN-28-SAA URANDI',
  'SAN-01 SAA AURORA',
  'ARQ-2026-6-HOSPITAL ANA NERY',
  'ARQ-2025-3-HOSPITAL REGIONAL DE JUAZEIRO',
  'ARQ-2025-1-HOSPITAL REGIONAL DE SANTO ANTÔNIO DE JESUS',
];

const pBR = (v) => {
  const s = String(v || 0).trim();
  if (s.includes(',')) return parseFloat(s.replace(/\./g, '').replace(',', '.')) || 0;
  const partes = s.split('.');
  if (partes.length === 2 && partes[1].length <= 2) return parseFloat(s) || 0;
  return parseFloat(s.replace(/\./g, '')) || 0;
};

async function main() {
  const { oppRequest } = require('./src/services/oppService');
  const db = require('./src/services/postgresService');

  const [projetos, planejamentos, ordensServicoOPP] = await Promise.all([
    db.readSheet('Projetos_Contratos'),
    db.readSheet('Planejamentos'),
    db.readSheet('OrdensServico_OPP').catch(() => []),
  ]);

  // Mesma busca de contas a receber usada pelo motor de verdade
  let offset = 0, receitasOPP = [];
  while (true) {
    const r = await oppRequest('GET', `/contas-receber?limit=250&offset=${offset}&lixeira=Nao`);
    const lista = Array.isArray(r) ? r : (r?.data || []);
    if (lista.length === 0) break;
    receitasOPP.push(...lista);
    if (lista.length < 250) break;
    offset += 250;
    if (offset > 10000) break;
  }

  const projMap = {};
  for (const p of projetos) projMap[p.ID_Projeto] = p;

  for (const nomeOuId of PROJETOS_SUSPEITOS) {
    console.log('\n' + '='.repeat(90));
    const plan = planejamentos.find((p) => p.ID_Projeto === nomeOuId || p.Nome_Projeto === nomeOuId)
      || planejamentos.find((p) => (p.Nome_Projeto || '').toUpperCase().includes(nomeOuId.toUpperCase().slice(0, 15)));
    if (!plan) { console.log(`"${nomeOuId}" — NÃO achei o planejamento (nome/ID não bateu).`); continue; }

    const proj = projMap[plan.ID_Projeto] || {};
    console.log(`PROJETO: ${plan.ID_Projeto} | ${proj.Nome || plan.Nome_Projeto}`);
    console.log(`  ID_Centro_Custo_OPP: ${plan.ID_Centro_Custo_OPP || '(vazio)'}`);
    console.log(`  Nr_OS_OPP (cadastrado): ${plan.Nr_OS_OPP || '(vazio)'}`);
    console.log(`  ID_OPP_Cliente (do Projetos_Contratos): ${proj.ID_OPP_Cliente || '(vazio)'}`);

    // Etapas planejadas do cronograma
    let dadosPlano = {};
    try { dadosPlano = JSON.parse(plan.Dados_JSON || '{}'); } catch {}
    const dPlano = dadosPlano._baseline || dadosPlano;
    const etapas = dPlano.medicoesCronograma || dadosPlano.medicoes || [];
    console.log(`  Etapas planejadas (${etapas.length}):`);
    etapas.forEach((e, i) => {
      const v = pBR(e.valor || e.valorPlanejado || 0);
      console.log(`    [${i}] valor=${v.toFixed(2)} | ${e.descricao || e.etapa || ''}`);
    });

    // O.S. do mesmo cliente OPP
    const idCli = proj.ID_OPP_Cliente ? String(proj.ID_OPP_Cliente) : '';
    if (!idCli) {
      console.log('  >>> SEM ID_OPP_Cliente cadastrado no Projetos_Contratos — motor não tem como achar O.S. desse cliente.');
    } else {
      const osDoCliente = (ordensServicoOPP || []).filter((o) => String(o.ID_Cliente_OPP || '') === idCli);
      console.log(`  O.S. do cliente OPP (id_cliente=${idCli}): ${osDoCliente.length}`);
      osDoCliente.forEach((o) => {
        const v = pBR(o.Valor_Total);
        const matchouEtapa = etapas.some((e) => Math.abs(pBR(e.valor || e.valorPlanejado || 0) - v) <= 0.5);
        console.log(`    OS ${o.ID_OS_OPP} | valor=${v.toFixed(2)} | status=${o.Status} | ref="${o.Referencia || ''}" | bate_com_alguma_etapa=${matchouEtapa}`);
      });
      if (osDoCliente.length === 0) {
        console.log('  >>> Esse cliente não tem NENHUMA O.S. no OPP ainda — não tem o que casar, é zero de verdade (ou o ID_OPP_Cliente tá errado).');
      }
    }

    // Reserva: centro de custo
    if (plan.ID_Centro_Custo_OPP) {
      const ccId = String(plan.ID_Centro_Custo_OPP);
      const receitasDoCC = receitasOPP.filter((r) => String(r.id_centro_custos || '') === ccId);
      console.log(`  Contas a receber com esse centro de custo (${ccId}): ${receitasDoCC.length}`);
      receitasDoCC.forEach((r) => {
        console.log(`    conta ${r.id_conta_rec} | NF=${r.n_documento_rec} | valor=${r.valor_rec} | liquidado=${r.liquidado_rec} | venc=${r.vencimento_rec}`);
      });
    }
  }

  process.exit(0);
}

main().catch((e) => { console.error('Erro:', e.message); console.error(e.stack); process.exit(1); });
