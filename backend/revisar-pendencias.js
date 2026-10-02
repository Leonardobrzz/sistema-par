// node backend/revisar-pendencias.js [--apply]
//
// Só lê — a menos que rode com --apply, aí só grava os 2 casos ambíguos
// (JOTA BARROS e SERGIPE), que dá pra decidir com segurança pelo nome do
// próprio projeto do Par. Nada mais é gravado.
//
// 1) Mostra os candidatos dos 2 clientes ambíguos no backfill de
//    ID_OPP_Cliente, com a escolha sugerida e o motivo.
// 2) Lista os clientes "sem match" que ainda sobraram, separando rótulo
//    interno do Par (não é cliente de verdade, pode ignorar sempre) de
//    possível cliente real só não encontrado no OPP.
// 3) Re-confere os grupos agregados que tinham divergência grande
//    (Apuiarés, Fortim/Barro Vermelho, CODEVASF/Agroindústria) usando a
//    MESMA lógica de casamento por etapa (valor exato), não só o total do
//    cliente inteiro — pra mostrar exatamente quais etapas batem e quais
//    ficam divergentes de verdade.

require('dotenv').config({ path: require('path').join(__dirname, '.env') });

const APPLY = process.argv.includes('--apply');

const pBR = (v) => {
  const s = String(v || 0).trim();
  if (s.includes(',')) return parseFloat(s.replace(/\./g, '').replace(',', '.')) || 0;
  const parts = s.split('.');
  if (parts.length === 2 && parts[1].length <= 2) return parseFloat(s) || 0;
  return parseFloat(s.replace(/\./g, '')) || 0;
};

const norm = (s) => (s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().trim();

async function main() {
  const db = require('./src/services/postgresService');
  const { oppRequest } = require('./src/services/oppService');

  const [projetos, planejamentos] = await Promise.all([
    db.readSheet('Projetos_Contratos'),
    db.readSheet('Planejamentos'),
  ]);

  console.log('=== 1) CASOS AMBÍGUOS ===\n');

  let offset = 0, clientesOPP = [];
  while (true) {
    const r = await oppRequest('GET', `/clientes?limit=250&offset=${offset}`);
    const lista = Array.isArray(r) ? r : (r?.data || []);
    if (lista.length === 0) break;
    clientesOPP.push(...lista.filter((c) => c.lixeira !== 'Sim'));
    if (lista.length < 250) break;
    offset += 250;
    if (offset > 10000) break;
  }
  console.log(`${clientesOPP.length} clientes carregados do OPP.\n`);

  const jota = clientesOPP.filter((c) => norm(c.razao_cliente).includes('JOTA BARROS') || norm(c.fantasia_cliente).includes('JOTA BARROS'));
  console.log('JOTA BARROS — candidatos no OPP:');
  for (const c of jota) console.log(`  id ${c.id_cliente} | razão: "${c.razao_cliente}" | fantasia: "${c.fantasia_cliente}"`);
  const jotaEscolhido = jota.find((c) => /PROJETOS|ASSESSORIA/i.test(c.razao_cliente || ''));
  console.log(jotaEscolhido
    ? `  → Escolha: id ${jotaEscolhido.id_cliente} — é a empresa de projetos/assessoria de verdade, não "fundo fixo" (isso é conta interna de caixa, não cliente)`
    : '  → Não achei candidato óbvio — não vou aplicar nada aqui.');

  console.log('\nSERGIPE — candidatos no OPP:');
  const sergipe = clientesOPP.filter((c) => norm(c.razao_cliente).includes('SERGIPE') || norm(c.fantasia_cliente).includes('SERGIPE') || /\bDER\b/.test(norm(c.razao_cliente)) || /\bDER\b/.test(norm(c.fantasia_cliente)));
  for (const c of sergipe) console.log(`  id ${c.id_cliente} | razão: "${c.razao_cliente}" | fantasia: "${c.fantasia_cliente}"`);
  const sergipeEscolhido = sergipe.find((c) => /\bDER\b/.test(norm(c.razao_cliente)) || /\bDER\b/.test(norm(c.fantasia_cliente)));
  console.log(sergipeEscolhido
    ? `  → Escolha: id ${sergipeEscolhido.id_cliente} — o projeto do Par é literalmente "...SEDE DO DER/SE", bate com esse`
    : '  → Não achei candidato óbvio — não vou aplicar nada aqui.');

  if (APPLY) {
    let atualizados = 0;
    for (const [nomeParCliente, escolhido] of [['JOTA BARROS', jotaEscolhido], ['SERGIPE', sergipeEscolhido]]) {
      if (!escolhido) continue;
      for (const p of projetos) {
        if (norm(p.Cliente) === nomeParCliente) {
          await db.updateRowById('Projetos_Contratos', 'ID_Projeto', p.ID_Projeto, { ...p, ID_OPP_Cliente: String(escolhido.id_cliente) });
          atualizados++;
        }
      }
    }
    console.log(`\n✅ ${atualizados} projeto(s) atualizado(s) com o ID_OPP_Cliente escolhido.`);
  } else {
    console.log('\nModo de conferência — nada foi gravado. Rode com --apply pra gravar essas 2 escolhas (só essas 2).');
  }

  console.log('\n=== 2) CLIENTES SEM MATCH (ainda sem ID_OPP_Cliente) ===\n');
  const porCliente = {};
  for (const p of projetos) {
    if (p.ID_OPP_Cliente) continue;
    const c = (p.Cliente || '').trim();
    if (!c) continue;
    (porCliente[c] = porCliente[c] || []).push(p.ID_Projeto);
  }
  const ROTULOS_INTERNOS = new Set(['PAINEL DE PROJETOS', 'EXECUCAO DE PROJETOS', '0_PADRONIZACOES', 'FINANCEIRO', 'COMPRAS', 'ADMINISTRATIVO', 'COMERCIAL', 'ARQUITETURA']);
  const internos = [], reais = [];
  for (const [cliente, ids] of Object.entries(porCliente)) {
    (ROTULOS_INTERNOS.has(norm(cliente)) ? internos : reais).push({ cliente, qtd: ids.length });
  }
  console.log(`Rótulos internos do Par (não são clientes de verdade — pode ignorar sempre): ${internos.length}`);
  for (const i of internos) console.log(`  "${i.cliente}" (${i.qtd} projeto(s))`);
  console.log(`\nPossíveis clientes reais, só não encontrados no OPP (nome pode estar diferente lá, ou o cliente não está cadastrado): ${reais.length}`);
  for (const r of reais.sort((a, b) => b.qtd - a.qtd)) console.log(`  "${r.cliente}" (${r.qtd} projeto(s))`);

  console.log('\n=== 3) CASOS AGREGADOS — conferência por etapa (não só total do cliente) ===\n');
  const ordensServicoOPP = await db.readSheet('OrdensServico_OPP').catch(() => []);
  const reMedicao = /medi[cç][aã]o/i;
  const osDeMedicao = ordensServicoOPP.filter((o) => reMedicao.test(o.Referencia || '') || reMedicao.test(o.Observacao || '') || reMedicao.test(o.Problema || ''));
  const osPorIdCliente = {};
  for (const o of osDeMedicao) {
    const idCli = String(o.ID_Cliente_OPP || '');
    if (!idCli || idCli === '0') continue;
    (osPorIdCliente[idCli] = osPorIdCliente[idCli] || []).push(o);
  }
  const projMap = {};
  for (const p of projetos) projMap[p.ID_Projeto] = p;

  function etapasDoCliente(nomeClienteContains) {
    const idsCli = [...new Set(projetos.filter((p) => norm(p.Cliente).includes(norm(nomeClienteContains)) && p.ID_OPP_Cliente).map((p) => String(p.ID_OPP_Cliente)))];
    const etapas = [];
    for (const pl of planejamentos) {
      if (pl.Status !== 'Aprovado' || !pl.ID_Projeto) continue;
      const proj = projMap[pl.ID_Projeto];
      if (!proj || !idsCli.includes(String(proj.ID_OPP_Cliente || ''))) continue;
      let dados = {};
      try { dados = JSON.parse(pl.Dados_JSON || '{}'); } catch {}
      const d = dados._baseline || dados;
      const meds = d.medicoesCronograma || dados.medicoes || [];
      meds.forEach((m, idx) => {
        const valor = pBR(m.valor || m.valorPlanejado || 0);
        if (valor <= 0) return;
        etapas.push({ idProjeto: pl.ID_Projeto, nome: proj.Nome, etapa: m.etapa || m.descricao || `Medição ${idx + 1}`, valor });
      });
    }
    return { idsCli, etapas };
  }

  function conferir(label, nomeClienteContains) {
    const { idsCli, etapas } = etapasDoCliente(nomeClienteContains);
    console.log(`--- ${label} (ID_OPP_Cliente: ${idsCli.join(', ') || 'nenhum'}) ---`);
    console.log(`${etapas.length} etapa(s) planejada(s) no total.`);
    const usadas = new Set();
    for (const idCli of idsCli) {
      const osDoCliente = osPorIdCliente[idCli] || [];
      for (const o of osDoCliente) {
        const valorOS = pBR(o.Valor_Total);
        if (valorOS <= 0) continue;
        const candidata = etapas.find((e) => !usadas.has(e) && Math.abs(e.valor - valorOS) <= 0.5);
        if (candidata) usadas.add(candidata);
      }
    }
    const naoBatidas = etapas.filter((e) => !usadas.has(e));
    console.log(`Bateram com O.S. real (valor exato): ${usadas.size}`);
    console.log(`NÃO bateram (ficam como prévia — pode ser etapa ainda não medida, ou reajuste de valor real):`);
    for (const e of naoBatidas.slice(0, 40)) console.log(`  "${e.nome}" — "${e.etapa}" (R$ ${e.valor.toFixed(2)})`);
    console.log('');
  }

  conferir('APUIARÉS', 'APUIARES');
  conferir('FORTIM (inclui Barro Vermelho/Volta Grande)', 'FORTIM');
  conferir('CODEVASF (Agroindústria)', 'CODEVASF');

  process.exit(0);
}

main().catch((e) => { console.error('Erro:', e.message); console.error(e.stack); process.exit(1); });
