// node backend/resolver-centro-custo-chef.js [--apply]
//
// Usa as respostas que o chef deu na planilha de pendências de Centro de
// Custo pra casar cada projeto do Par com o Centro de Custo certo no OPP
// (busca em /centros-custo pelo nome exato que ele informou) e grava em
// Planejamentos.ID_Centro_Custo_OPP — o mesmo campo que o resto do sistema
// já usa como vínculo confiável (ver medicoes.js, opp.js, baseline-real.js).
//
// Só grava com --apply, e só quando acha EXATAMENTE 1 projeto no Par e
// EXATAMENTE 1 Centro de Custo no OPP pro nome informado — sem isso, só
// lista o problema e não mexe em nada.
//
// Os itens sem resposta do chef, e a decisão de unificar Lajedão III +
// SAN-23 (isso é estrutural, não só um campo), ficam listados no final
// pra vocês decidirem — este script não mexe neles.

require('dotenv').config({ path: require('path').join(__dirname, '.env') });
const APPLY = process.argv.includes('--apply');

const RESPOSTAS = [
  { projetoContem: 'NRS CENTRO NORTE JACOBINA', ccNome: 'ARQ SESAB NRS CENTRO NORTE JACOBINA' },
  { projetoContem: 'AGENCIA DE CORREIOS DE ANANINDEUA', ccNome: 'ARQ CORREIOS PA ANANINDEUA' },
  { projetoContem: 'HOSPITAL ANA NERY', ccNome: 'ARQ SESAB HOSPITAL ANA NERY' },
  { projetoContem: 'LACEN', ccNome: 'ARQ SESAB LACEN' },
  { projetoContem: 'SANTA CRUZ DA VITORIA', ccNome: 'SAN EMBASA SANTA CRUZ DA VITORIA' },
  { projetoContem: 'LEVANTAMENTOS TOPOGRAFICOS PARA PAVIMENTA', ccNome: 'APUIARES LEV TOP. PARA PAVIMENT E TERRENO' },
  { projetoContem: 'NRS JUAZEIRO', ccNome: 'ARQ SESAB NRS JUAZEIRO' },
];

const norm = (s) => (s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().replace(/[^A-Z0-9. ]/g, ' ').replace(/\s+/g, ' ').trim();

async function main() {
  const db = require('./src/services/postgresService');
  const { oppRequest } = require('./src/services/oppService');

  const [projetos, planejamentos] = await Promise.all([
    db.readSheet('Projetos_Contratos'),
    db.readSheet('Planejamentos'),
  ]);

  const ccData = await oppRequest('GET', '/centros-custo?limit=500');
  const ccLista = Array.isArray(ccData) ? ccData : (ccData?.data || []);
  console.log(`${ccLista.length} centros de custo carregados do OPP.\n`);

  function acharCC(nomeExato) {
    const alvo = norm(nomeExato);
    return ccLista.filter((c) => norm(c.desc_centro_custos || c.nome || c.descricao || '') === alvo);
  }

  // Fallback por aproximação: quando o nome exato não bate (texto digitado
  // na planilha pode diferir um pouco do cadastro real do OPP), procura CCs
  // que contenham TODAS as palavras significativas (4+ letras) do nome.
  function acharCCAproximado(nomeAlvo) {
    const palavras = norm(nomeAlvo).split(' ').filter((w) => w.length >= 4 && w !== 'PARA');
    return ccLista.filter((c) => {
      const nomeCC = norm(c.desc_centro_custos || c.nome || c.descricao || '');
      return palavras.every((w) => nomeCC.includes(w));
    });
  }

  const planPorProjeto = {};
  for (const pl of planejamentos) {
    if (!pl.ID_Projeto) continue;
    if (!planPorProjeto[pl.ID_Projeto] || pl.Status === 'Aprovado') planPorProjeto[pl.ID_Projeto] = pl;
  }

  console.log('=== Vínculos a partir das respostas do chef ===\n');
  for (const r of RESPOSTAS) {
    const candidatosProjeto = projetos.filter((p) => norm(p.Nome || '').includes(norm(r.projetoContem)));
    console.log(`Procurando projeto: "${r.projetoContem}"`);
    if (candidatosProjeto.length === 0) { console.log('  → Não achei esse projeto no Par.\n'); continue; }
    if (candidatosProjeto.length > 1) {
      console.log(`  → Achei ${candidatosProjeto.length} projetos com esse nome — ambíguo, não aplico:`);
      for (const p of candidatosProjeto) console.log(`     - "${p.Nome}" (${p.ID_Projeto})`);
      console.log('');
      continue;
    }
    const proj = candidatosProjeto[0];
    console.log(`  → Projeto: "${proj.Nome}"`);

    let candidatosCC = acharCC(r.ccNome);
    console.log(`  Procurando CC no OPP: "${r.ccNome}"`);
    if (candidatosCC.length === 0) {
      const aprox = acharCCAproximado(r.ccNome);
      if (aprox.length === 0) { console.log('  → Não achei esse Centro de Custo no OPP, nem por aproximação.\n'); continue; }
      if (aprox.length > 1) {
        console.log(`  → Nome exato não bateu, mas achei ${aprox.length} parecidos — ambíguo, não aplico:`);
        for (const c of aprox) console.log(`     - id ${c.id_centro_custos}: "${c.desc_centro_custos || c.nome || c.descricao}"`);
        console.log('');
        continue;
      }
      console.log(`  → Nome exato não bateu, mas achei 1 por aproximação: "${aprox[0].desc_centro_custos || aprox[0].nome || aprox[0].descricao}"`);
      candidatosCC = aprox;
    }
    if (candidatosCC.length > 1) {
      console.log(`  → Achei ${candidatosCC.length} CCs com esse nome — ambíguo, não aplico.\n`);
      continue;
    }
    const cc = candidatosCC[0];
    console.log(`  → CC achado: id ${cc.id_centro_custos} ("${cc.desc_centro_custos || cc.nome || cc.descricao}")`);

    const plan = planPorProjeto[proj.ID_Projeto];
    if (!plan) { console.log('  → Esse projeto não tem nenhum Planejamento no Par ainda — não dá pra gravar.\n'); continue; }
    console.log(`  Planejamento encontrado (status: ${plan.Status || '(sem status)'}).`);
    if (plan.ID_Centro_Custo_OPP && String(plan.ID_Centro_Custo_OPP) !== String(cc.id_centro_custos)) {
      console.log(`  ⚠ Esse planejamento já tem outro ID_Centro_Custo_OPP gravado (${plan.ID_Centro_Custo_OPP}) — não sobrescrevo sem confirmação.\n`);
      continue;
    }
    if (String(plan.ID_Centro_Custo_OPP || '') === String(cc.id_centro_custos)) {
      console.log('  (já estava gravado certo, nada a fazer)\n');
      continue;
    }
    if (APPLY) {
      await db.updateRowById('Planejamentos', 'ID', plan.ID, { ...plan, ID_Centro_Custo_OPP: String(cc.id_centro_custos) });
      console.log('  ✅ Gravado.\n');
    } else {
      console.log('  (modo conferência — não gravado ainda)\n');
    }
  }

  console.log('=== Ainda sem resposta do chef (não mexi em nada) ===');
  console.log('- ARQ-2026-Areninha São Francisco (Apuiarés): já foi cadastrado no OPP? Com que nome/PP?');
  console.log('- ARQ-2026-5-Agência de Correios de Ananindeua: qual o valor certo do contrato (está R$ 0,00 no Par)?');
  console.log('- INF-2026-5-Levantamentos Topográficos para Pavimentações e Terreno: qual o valor certo do contrato (está R$ 0,00 no Par)?');
  console.log('- SAN-26-SAA Comandatuba: qual o valor total certo do contrato (Par tem R$ 12.719,79; OPP mostra contrato 460023058 com ~R$ 73 mil já faturados)?');
  console.log('- INF-2026-3-Levantamentos Topográficos (Cores Vale): a resposta "ARRAIA PROJETOS" não deixa claro se já foi cadastrado no OPP com esse nome — confirmar.');

  console.log('\n=== Decisão estrutural pendente (não mexi) ===');
  console.log('- SAN-30-SIAA Lajedão III + SAN-23: chef confirmou "pode unificar". Isso é juntar dois projetos em um só no Par (arquivar um, manter o outro, ou criar um novo) — não é só um campo, então não fiz isso automaticamente. Avisa quando quiser que eu faça.');

  console.log('\n=== ARQ-2026-5-NRS Juazeiro — NÃO é duplicata ===');
  console.log('Chef confirmou que são 2 Centros de Custo DIFERENTES no OPP:');
  console.log('  1) "ARQ SESAB BA HOSPITAL REGIONAL DE JUAZEIRO" — projeto já existente no Par');
  console.log('  2) "ARQ SESAB NRS JUAZEIRO" — este projeto (NRS Juazeiro)');
  console.log('Então NÃO arquiva nada — o NRS Juazeiro já foi vinculado ao CC dele acima (se achado).');

  process.exit(0);
}

main().catch((e) => { console.error('Erro:', e.message); console.error(e.stack); process.exit(1); });
