// node backend/listar-sem-dados-opp.js
//
// Só lê (OPP + banco). Não grava nada.
//
// Reproduz exatamente o mesmo cálculo da tela "Extrato Financeiro por
// Projeto" (GET /api/opp/extrato-por-projeto) pra listar, com certeza, quais
// projetos caem em "Sem dados OPP" — e por quê: (A) nunca tiveram um Centro
// de Custo do OPP confirmado no Planejamento, ou (B) já têm o Centro de
// Custo confirmado, mas nenhum lançamento (receita ou despesa) bateu com ele
// no período analisado (últimos 18 meses).

require('dotenv').config({ path: require('path').join(__dirname, '.env') });

async function main() {
  const opp = require('./src/services/oppService');
  const db = require('./src/services/postgresService');

  const agora = new Date();
  const inicio = new Date(agora);
  inicio.setMonth(inicio.getMonth() - 18);
  const fmt = (d) => d.toISOString().split('T')[0];

  console.log('Buscando dados (pode demorar um pouco)...\n');

  const [projetos, planejamentos, receitasOPP, despesasOPP] = await Promise.all([
    db.readSheet('Projetos_Contratos'),
    db.readSheet('Planejamentos'),
    opp.listarReceitas({ data_inicio: fmt(inicio), data_fim: fmt(agora) }),
    opp.listarDespesas({ data_inicio: fmt(inicio), data_fim: fmt(agora) }),
  ]);

  const listaReceitas = (Array.isArray(receitasOPP) ? receitasOPP : (receitasOPP?.data || [])).filter(r => r.lixeira !== 'Sim');
  const listaDespesas = (Array.isArray(despesasOPP) ? despesasOPP : (despesasOPP?.data || [])).filter(d => d.lixeira !== 'Sim');

  const idsCC = new Set([
    ...listaReceitas.map(r => String(r.id_centro_custos || '')).filter(Boolean),
    ...listaDespesas.map(d => String(d.id_centro_custos || '')).filter(Boolean),
  ]);

  const planMap = {};
  for (const pl of planejamentos) {
    if (pl.Status === 'Aprovado' || pl.Status === 'Pendente Aprovação') planMap[pl.ID_Projeto] = pl;
  }

  const pBR = (v) => {
    const s = String(v || 0).trim();
    if (s.includes(',')) return parseFloat(s.replace(/\./g, '').replace(',', '.')) || 0;
    const parts = s.split('.');
    if (parts.length === 2 && parts[1].length <= 2) return parseFloat(s) || 0;
    return parseFloat(s.replace(/\./g, '')) || 0;
  };

  const semCC = [];
  const comCCSemLancamento = [];

  projetos
    .filter(p => /^(ARQ|SAN|INF)-/i.test(p.Nome || '') && p.Status !== 'Arquivado')
    .filter(p => pBR(p.Valor_Global || 0) > 0)
    .forEach(p => {
      const plan = planMap[p.ID_Projeto];
      const ccId = plan?.ID_Centro_Custo_OPP ? String(plan.ID_Centro_Custo_OPP) : null;
      if (!ccId) {
        semCC.push({ nome: p.Nome, cliente: p.Cliente || '—', valor: pBR(p.Valor_Global || 0) });
      } else if (!idsCC.has(ccId)) {
        comCCSemLancamento.push({ nome: p.Nome, cliente: p.Cliente || '—', ccId, valor: pBR(p.Valor_Global || 0) });
      }
    });

  console.log(`=== (A) Sem Centro de Custo do OPP confirmado no Planejamento: ${semCC.length} ===\n`);
  semCC
    .sort((a, b) => b.valor - a.valor)
    .forEach(p => console.log(`  ${p.nome}  |  ${p.cliente}  |  R$ ${p.valor.toFixed(2)}`));

  console.log(`\n=== (B) Centro de Custo confirmado, mas sem lançamento no OPP nos últimos 18 meses: ${comCCSemLancamento.length} ===\n`);
  comCCSemLancamento
    .sort((a, b) => b.valor - a.valor)
    .forEach(p => console.log(`  ${p.nome}  |  ${p.cliente}  |  CC #${p.ccId}  |  R$ ${p.valor.toFixed(2)}`));

  console.log(`\nTotal "Sem dados OPP": ${semCC.length + comCCSemLancamento.length}`);

  process.exit(0);
}

main().catch(e => { console.error('Erro:', e.message); console.error(e.stack); process.exit(1); });
