// node backend/investigar-medicoes-faturamento.js
//
// Só lê. Não grava nada.
//
// O chef reclamou que a tela "Medições & Faturamento" tem valores que não
// batem nem com a O.S. no OPP, nem com o planejamento financeiro feito no
// Par. Este script confere, com dados reais, as hipóteses mais prováveis:
//
//  PARTE 1 — a O.S. é criada automaticamente no OPP quando o chef aprova um
//            planejamento (oppService.criarOSDoPlano), mas o payload enviado
//            NUNCA inclui um valor. Confere se a O.S. de verdade no OPP tem
//            algum campo de valor preenchido, e se existe.
//  PARTE 2 — a tela "Baseline x Real" (e a lógica equivalente) casa a
//            medição planejada [i] com a medição real [i] só pela ORDEM do
//            array, não por nome/etapa/data. Se a contagem ou a ordem não
//            baterem, cada linha compara a coisa errada.
//  PARTE 3 — a tela Medições calcula "acumulado" (pra decidir se o OPP já
//            cobriu aquela medição = Recebido) somando na ordem que o banco
//            devolve as linhas — não na ordem cronológica real. Confere se
//            isso muda a conta em algum projeto.
//  PARTE 4 — confere se o bug antigo de valor ÷1000 (que tinha scripts de
//            correção prontos: fix-medicoes-baseline.js e
//            fix-medicoes-tabela-1000x.js) ainda está presente — ou seja,
//            se aquelas correções chegaram a ser aplicadas.
//  PARTE 5 — resumo por projeto aprovado: valor do contrato x total
//            planejado no cronograma x total das medições reais cadastradas
//            x total recebido no OPP (pelo centro de custo confirmado) —
//            pra ver de cara onde a maior divergência está.

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
  const { oppRequest } = require('./src/services/oppService');

  const [planejamentos, medicoes, projetos] = await Promise.all([
    db.readSheet('Planejamentos'),
    db.readSheet('Medicoes'),
    db.readSheet('Projetos_Contratos'),
  ]);

  const nomePorProjeto = {};
  for (const p of projetos) nomePorProjeto[p.ID_Projeto] = p.Nome;

  const medsPorProjeto = {};
  for (const m of medicoes) {
    if (!medsPorProjeto[m.ID_Projeto]) medsPorProjeto[m.ID_Projeto] = [];
    medsPorProjeto[m.ID_Projeto].push(m);
  }

  const aprovados = planejamentos.filter((p) => p.Status === 'Aprovado');

  // ─────────────────────────────────────────────────────────────────────
  console.log('\n========== PARTE 1 — Campos reais de uma O.S. no OPP ==========\n');
  try {
    const data = await oppRequest('GET', '/ordens-servico?limit=5');
    const lista = Array.isArray(data) ? data : (data?.data || []);
    if (!lista.length) {
      console.log('API não devolveu nenhuma O.S. (lista vazia ou formato inesperado).');
    } else {
      console.log(`Campos disponíveis numa O.S. (${lista.length} amostradas):`, Object.keys(lista[0]).join(', '));
      console.log('\nCampos que parecem ser de valor/preço:');
      const chavesValor = Object.keys(lista[0]).filter((k) => /valor|preco|preço|total/i.test(k));
      if (chavesValor.length === 0) {
        console.log('  NENHUM campo com "valor"/"preço"/"total" no nome encontrado.');
      } else {
        for (const k of chavesValor) console.log(`  ${k}`);
      }
      console.log('\nAmostra completa da 1ª O.S. (JSON):');
      console.log(JSON.stringify(lista[0], null, 2));
    }
  } catch (e) {
    console.log('Erro ao buscar /ordens-servico:', e.message);
  }

  // ─────────────────────────────────────────────────────────────────────
  console.log('\n\n========== PARTE 2 — Cronograma planejado x real: contagem e ordem ==========\n');
  console.log('(Isso é o que a tela "Baseline x Real" compara linha a linha, casando só pela posição no array)\n');
  let divergenciasContagem = 0;
  for (const plan of aprovados) {
    let dados = {};
    try { dados = JSON.parse(plan.Dados_JSON || '{}'); } catch { continue; }
    const d = dados._baseline || dados;
    const medsPlan = d.medicoesCronograma || dados.medicoes || [];
    const medsReais = medsPorProjeto[plan.ID_Projeto] || [];
    if (medsPlan.length === 0 && medsReais.length === 0) continue;
    if (medsPlan.length !== medsReais.length) {
      divergenciasContagem++;
      console.log(`[CONTAGEM DIFERENTE] "${plan.Nome_Projeto}": ${medsPlan.length} planejada(s) x ${medsReais.length} real(is) cadastrada(s)`);
      console.log(`   → qualquer comparação linha-a-linha por posição já embaralha tudo a partir daqui.`);
    } else if (medsPlan.length > 1) {
      // mesma contagem — confere se a ORDEM também bate (por valor aproximado)
      const valoresPlan = medsPlan.map((m) => pBR(m.valor || m.valorPlanejado || 0));
      const valoresReais = medsReais.map((m) => pBR(m.Valor_Medicao || m.Valor || 0));
      let ordemBate = true;
      for (let i = 0; i < valoresPlan.length; i++) {
        if (valoresPlan[i] > 0 && Math.abs(valoresPlan[i] - valoresReais[i]) > valoresPlan[i] * 0.05) { ordemBate = false; break; }
      }
      if (!ordemBate) {
        console.log(`[ORDEM SUSPEITA] "${plan.Nome_Projeto}": mesma contagem (${medsPlan.length}), mas os valores não casam posição-a-posição`);
        console.log(`   Planejado: [${valoresPlan.map((v) => v.toFixed(2)).join(', ')}]`);
        console.log(`   Real:      [${valoresReais.map((v) => v.toFixed(2)).join(', ')}]`);
      }
    }
  }
  console.log(`\nTotal de projetos aprovados com contagem planejado≠real: ${divergenciasContagem}`);

  // ─────────────────────────────────────────────────────────────────────
  console.log('\n\n========== PARTE 3 — Ordem de inserção x ordem cronológica (tela Medições) ==========\n');
  console.log('(A tela soma "acumulado" na ordem que o banco devolve — não necessariamente a ordem das datas)\n');
  let projetosComOrdemTrocada = 0;
  for (const [idProjeto, meds] of Object.entries(medsPorProjeto)) {
    if (meds.length < 2) continue;
    const comData = meds.filter((m) => m.Data_Previsao || m.Data_Realizacao);
    if (comData.length < 2) continue;
    const ordemBanco = meds.map((m) => m.ID_Medicao);
    const ordenadoPorData = [...meds].sort((a, b) => {
      const da = a.Data_Realizacao || a.Data_Previsao || '9999';
      const db_ = b.Data_Realizacao || b.Data_Previsao || '9999';
      return da.localeCompare(db_);
    }).map((m) => m.ID_Medicao);
    if (JSON.stringify(ordemBanco) !== JSON.stringify(ordenadoPorData)) {
      projetosComOrdemTrocada++;
      console.log(`[ORDEM TROCADA] "${nomePorProjeto[idProjeto] || idProjeto}": a ordem salva no banco não é a ordem cronológica das datas`);
      console.log(`   → o cálculo de "acumulado" (que decide o status Recebido) pode estar somando na ordem errada.`);
    }
  }
  console.log(`\nTotal de projetos com ordem banco ≠ ordem cronológica: ${projetosComOrdemTrocada}`);

  // ─────────────────────────────────────────────────────────────────────
  console.log('\n\n========== PARTE 4 — Bug antigo de valor ÷1000 ainda presente? ==========\n');
  let suspeitos1000x = 0;
  const contratoPorProjeto = {};
  for (const p of projetos) { const v = pBR(p.Valor_Global || 0); if (v > 0) contratoPorProjeto[p.ID_Projeto] = v; }
  for (const plan of planejamentos) {
    if (!plan.ID_Projeto) continue;
    let dados = {};
    try { dados = JSON.parse(plan.Dados_JSON || '{}'); } catch {}
    const d = dados._baseline || dados;
    const v = pBR(d.valorContrato || plan.Valor_Contrato || 0);
    if (v > 0) contratoPorProjeto[plan.ID_Projeto] = v;
  }
  for (const m of medicoes) {
    const contrato = contratoPorProjeto[m.ID_Projeto];
    if (!contrato || contrato <= 1000) continue;
    const valorAtual = pBR(m.Valor_Medicao || m.Valor || 0);
    if (valorAtual > 0 && valorAtual < 1000 && valorAtual * 1000 <= contrato * 1.15) {
      suspeitos1000x++;
      console.log(`[SUSPEITO ÷1000] "${nomePorProjeto[m.ID_Projeto] || m.ID_Projeto}" — "${m.Etapa || m.Descricao}": R$ ${valorAtual.toFixed(2)} (contrato R$ ${contrato.toFixed(2)}) → seria R$ ${(valorAtual * 1000).toFixed(2)}?`);
    }
  }
  console.log(`\nTotal de registros ainda suspeitos de ÷1000: ${suspeitos1000x}`);
  if (suspeitos1000x === 0) console.log('(Se já tinha corrigido isso antes, confirma que ficou corrigido.)');

  // ─────────────────────────────────────────────────────────────────────
  console.log('\n\n========== PARTE 5 — Resumo por projeto: contrato x planejado x real x recebido OPP ==========\n');

  async function fetchReceitasOPP() {
    try {
      let offset = 0, todos = [];
      while (true) {
        const r = await oppRequest('GET', `/contas-receber?limit=250&offset=${offset}&lixeira=Nao`);
        const lista = Array.isArray(r) ? r : (r?.data || []);
        if (lista.length === 0) break;
        todos.push(...lista);
        if (lista.length < 250) break;
        offset += 250;
        if (offset > 10000) break;
      }
      return todos;
    } catch { return []; }
  }
  const receitasOPP = await fetchReceitasOPP();
  const recebidoPorCCId = {};
  for (const r of receitasOPP) {
    if (r.liquidado_rec !== 'Sim') continue;
    const ccIdNum = String(r.id_centro_custos || '');
    if (!ccIdNum || ccIdNum === '0') continue;
    recebidoPorCCId[ccIdNum] = (recebidoPorCCId[ccIdNum] || 0) + parseFloat(r.valor_rec || 0);
  }

  const resumo = [];
  for (const plan of aprovados) {
    let dados = {};
    try { dados = JSON.parse(plan.Dados_JSON || '{}'); } catch {}
    const d = dados._baseline || dados;
    const contrato = pBR(d.valorContrato || plan.Valor_Contrato || 0);
    const medsPlan = d.medicoesCronograma || dados.medicoes || [];
    const totalPlan = medsPlan.reduce((s, m) => s + pBR(m.valor || m.valorPlanejado || 0), 0);
    const medsReais = medsPorProjeto[plan.ID_Projeto] || [];
    const totalReal = medsReais.reduce((s, m) => s + pBR(m.Valor_Medicao || m.Valor || 0), 0);
    const totalRecebidoOPP = plan.ID_Centro_Custo_OPP ? (recebidoPorCCId[String(plan.ID_Centro_Custo_OPP)] || 0) : null;

    resumo.push({ nome: plan.Nome_Projeto, contrato, totalPlan, totalReal, totalRecebidoOPP, temCC: !!plan.ID_Centro_Custo_OPP });
  }

  resumo.sort((a, b) => {
    const divA = Math.abs(a.contrato - a.totalPlan) + Math.abs(a.contrato - a.totalReal);
    const divB = Math.abs(b.contrato - b.totalPlan) + Math.abs(b.contrato - b.totalReal);
    return divB - divA;
  });

  console.log('Ordenado pela maior divergência (contrato x planejado x real):\n');
  for (const r of resumo.slice(0, 25)) {
    console.log(`"${r.nome}"`);
    console.log(`   Contrato:........... R$ ${r.contrato.toFixed(2)}`);
    console.log(`   Total planejado:.... R$ ${r.totalPlan.toFixed(2)}  ${r.totalPlan === 0 ? '(sem cronograma)' : ''}`);
    console.log(`   Total medições reais R$ ${r.totalReal.toFixed(2)}  ${r.totalReal === 0 ? '(nenhuma medição cadastrada ainda)' : ''}`);
    console.log(`   Recebido no OPP:.... ${r.totalRecebidoOPP === null ? 'sem centro de custo confirmado' : 'R$ ' + r.totalRecebidoOPP.toFixed(2)}`);
    console.log('');
  }

  process.exit(0);
}

main().catch((e) => { console.error('Erro:', e.message); console.error(e.stack); process.exit(1); });
