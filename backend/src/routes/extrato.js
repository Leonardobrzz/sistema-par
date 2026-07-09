const express = require('express');
const { authMiddleware } = require('../middleware/auth');
const db = process.env.USE_POSTGRES === 'true'
  ? require('../services/postgresService')
  : require('../services/googleSheetsService');

const router = express.Router();
router.use(authMiddleware);

// Classifica uma categoria OPP em grupo financeiro
function classificarCategoria(categoria) {
  const c = (categoria || '').trim();
  if (!c || c.toLowerCase() === 'sem categoria') return 'outros';

  // Por prefixo numérico do manual
  if (/^1\./.test(c)) return 'receitas';
  if (/^2\./.test(c)) return 'custos_diretos';
  if (/^3\.1/.test(c)) return 'pessoal';
  if (/^3\./.test(c)) return 'despesas_operacionais';
  if (/^4\./.test(c)) return 'investimentos';
  if (/^5\./.test(c)) return 'impostos';
  if (/^6\./.test(c)) return 'movimentacoes';

  // Por nome livre (OPP sem código)
  const cl = c.toLowerCase();
  if (cl.includes('recebimento') || cl.includes('receita') || cl.includes('faturamento') ||
      cl.includes('serviço') || cl.includes('serviços') || cl.includes('serviço') ||
      cl.includes('venda') || cl.includes('rendimento') || cl.includes('parcial') ||
      cl.includes('integral') || cl.includes('saneamento') || cl.includes('infraestrutura') ||
      cl.includes('arquitetura') || cl.includes('engenharia') || cl.includes('licitaç'))
    return 'receitas';
  if (cl.includes('fornecedor') || cl.includes('terceirizado') || cl.includes('subcontrat'))
    return 'custos_diretos';
  if (cl.includes('salário') || cl.includes('salario') || cl.includes('comissão') ||
      cl.includes('comissao') || cl.includes('pró-labore') || cl.includes('prolabore') ||
      cl.includes('devolução') || cl.includes('ressarcimento'))
    return 'pessoal';
  if (cl.includes('empréstimo') || cl.includes('emprestimo') || cl.includes('bancári') ||
      cl.includes('juros') || cl.includes('rendimento'))
    return 'movimentacoes';
  if (cl.includes('imposto') || cl.includes('taxa') || cl.includes('simples') || cl.includes('iof'))
    return 'impostos';
  if (cl.includes('água') || cl.includes('agua') || cl.includes('internet') ||
      cl.includes('aluguel') || cl.includes('aluguei') || cl.includes('combustível'))
    return 'despesas_operacionais';

  return 'outros';
}

const GRUPOS_META = {
  receitas:             { label: 'Receitas',               cor: '#22C55E', tipo: 'receita' },
  custos_diretos:       { label: 'Custos Diretos (Terc.)', cor: '#EF4444', tipo: 'despesa' },
  pessoal:              { label: 'Pessoal',                cor: '#F59E0B', tipo: 'despesa' },
  despesas_operacionais:{ label: 'Despesas Operacionais',  cor: '#8B5CF6', tipo: 'despesa' },
  impostos:             { label: 'Impostos e Taxas',       cor: '#EC4899', tipo: 'despesa' },
  investimentos:        { label: 'Investimentos (CAPEX)',  cor: '#06B6D4', tipo: 'despesa' },
  movimentacoes:        { label: 'Movimentações Financ.',  cor: '#64748B', tipo: 'neutro'  },
  outros:               { label: 'Outros',                 cor: '#94A3B8', tipo: 'neutro'  },
};

// GET /api/extrato — lista projetos com centro de custo vinculado
router.get('/', async (req, res, next) => {
  try {
    const projetos = await db.readSheet('Projetos_Contratos');
    const planos = await db.readSheet('Planejamento_Financeiro');

    const planoMap = {};
    for (const p of planos) {
      if (!planoMap[p.ID_Projeto]) planoMap[p.ID_Projeto] = p;
    }

    const lista = projetos
      .filter(p => planoMap[p.ID_Projeto]?.nrContratoOS)
      .map(p => ({
        ID_Projeto: p.ID_Projeto,
        Nome: p.Nome,
        Setor: p.Setor,
        Status: p.Status,
        Cliente: p.Cliente || '',
        centroCusto: planoMap[p.ID_Projeto]?.nrContratoOS || '',
        planTravado: planoMap[p.ID_Projeto]?.Plan_Travado === 'true' || planoMap[p.ID_Projeto]?.Plan_Travado === true,
      }));

    res.json({ projetos: lista });
  } catch (err) { next(err); }
});

// GET /api/extrato/:idProjeto — comparativo Planejado x Executado
router.get('/:idProjeto', async (req, res, next) => {
  try {
    const { idProjeto } = req.params;

    // 1. Projeto
    const projetos = await db.readSheet('Projetos_Contratos');
    const projeto = projetos.find(p => p.ID_Projeto === idProjeto);
    if (!projeto) return res.status(404).json({ error: 'Projeto não encontrado' });

    // 2. Planejamento + baseline
    const planos = await db.readSheet('Planejamento_Financeiro');
    const plano = planos.find(p => p.ID_Projeto === idProjeto);
    let baseline = null;
    let centroCusto = plano?.nrContratoOS || '';
    if (plano?.Dados_JSON) {
      try {
        const dados = JSON.parse(plano.Dados_JSON);
        baseline = dados._baseline || null;
      } catch {}
    }

    // 3. Financeiro OPP filtrado pelo centro de custo
    const financeiro = await db.readSheet('Financeiro_OPP');
    const ccLower = centroCusto.toLowerCase().trim();
    const lancamentos = !ccLower ? [] : financeiro.filter(r => {
      const prof = (r.Profissional || '').toLowerCase().trim();
      return prof === ccLower || prof.includes(ccLower) || ccLower.includes(prof);
    });

    // 4. Agrupa por categoria
    const gruposExec = {};
    const detalhesPorGrupo = {};
    for (const l of lancamentos) {
      const grupo = classificarCategoria(l.Categoria);
      if (!gruposExec[grupo]) { gruposExec[grupo] = 0; detalhesPorGrupo[grupo] = []; }
      const val = parseFloat(l.Valor || 0);
      gruposExec[grupo] += val;
      detalhesPorGrupo[grupo].push({
        categoria: l.Categoria,
        descricao: l.Descricao,
        valor: val,
        data: l.Data_Competencia || l.Data_Vencimento,
        situacao: l.Situacao,
        cliente: l.Nome_Cliente,
      });
    }

    // 5. Planejado: extrai do baseline
    const planejado = {};
    if (baseline) {
      const valorContrato = parseFloat(baseline.valorContrato || plano?.Valor_Contrato || projeto?.Valor_Global || 0);
      const impostosPerc  = parseFloat(baseline.impostosPerc || 16.33) / 100;
      const taxaAdmPerc   = parseFloat(baseline.taxaAdmPerc  || 12)    / 100;
      const comissaoPerc  = parseFloat(baseline.comissaoPerc || 7.5)   / 100;

      planejado.receitas              = valorContrato;
      planejado.impostos              = valorContrato * impostosPerc;
      planejado.despesas_operacionais = valorContrato * taxaAdmPerc;
      planejado.custos_diretos        = (baseline.terceirizados || []).reduce((s, t) => s + parseFloat(t.custo || 0), 0);
      planejado.pessoal               = baseline.totalCustoEquipe || (baseline.horasPorColaborador || []).reduce((s, e) => s + parseFloat(e.custoEstimado || 0), 0);
      planejado.movimentacoes         = (baseline.despesas || []).reduce((s, d) => s + parseFloat(d.valor || 0), 0);
    }

    // 6. Monta resultado final por grupo
    const grupos = Object.keys(GRUPOS_META).map(key => {
      const meta = GRUPOS_META[key];
      const exec = gruposExec[key] || 0;
      const plan = planejado[key] || 0;
      const variacao = exec - plan;
      const percExec = plan > 0 ? (exec / plan) * 100 : null;
      return {
        key,
        label: meta.label,
        cor: meta.cor,
        tipo: meta.tipo,
        planejado: plan,
        executado: exec,
        variacao,
        percExec,
        detalhes: (detalhesPorGrupo[key] || []).sort((a, b) => b.valor - a.valor),
      };
    }).filter(g => g.planejado > 0 || g.executado > 0);

    // 7. Totais
    const totalReceita  = gruposExec['receitas'] || 0;
    const totalCustos   = Object.entries(gruposExec)
      .filter(([k]) => k !== 'receitas' && k !== 'movimentacoes')
      .reduce((s, [, v]) => s + v, 0);
    const margemReal    = totalReceita > 0 ? ((totalReceita - totalCustos) / totalReceita) * 100 : null;
    const margemPlano   = baseline ? (() => {
      const v = parseFloat(baseline.valorContrato || 0);
      const custos = (planejado.custos_diretos || 0) + (planejado.pessoal || 0) +
                     (planejado.impostos || 0) + (planejado.despesas_operacionais || 0);
      return v > 0 ? ((v - custos) / v) * 100 : null;
    })() : null;

    res.json({
      projeto: { ...projeto, centroCusto },
      plano: plano ? { nrContratoOS: plano.nrContratoOS, planTravado: plano.Plan_Travado, Valor_Contrato: plano.Valor_Contrato } : null,
      baseline,
      totalLancamentos: lancamentos.length,
      grupos,
      totais: { totalReceita, totalCustos, margemReal, margemPlano },
    });
  } catch (err) { next(err); }
});

module.exports = router;
