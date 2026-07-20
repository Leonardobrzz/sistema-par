import { useState, useEffect, useCallback } from 'react'
import { toast } from 'react-hot-toast'
import { DocumentChartBarIcon } from '@heroicons/react/24/outline'
import api from '../utils/api'
import { useTheme } from '../contexts/ThemeContext'

const fV = (v) => Number(v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 })
const fN = (v, d = 1) => Number(v || 0).toFixed(d)
const mL = (ym) => {
  if (!ym) return ''
  const [y, m] = ym.split('-')
  return ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'][parseInt(m)-1]+'/'+y.slice(2)
}

// ─── Utilitários de PDF ────────────────────────────────────────────────────

function htmlBase(titulo, subtitulo, body) {
  const origem = window.location.origin
  const emissao = new Date().toLocaleString('pt-BR')
  return `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="utf-8"><title>${titulo}</title>
<style>
*{box-sizing:border-box;margin:0;padding:0;font-family:Arial,sans-serif}
body{font-size:11px;color:#1e293b;background:#fff}
.page{padding:16px 20px 110px;min-height:100vh}
.header{display:flex;justify-content:space-between;align-items:center;border-bottom:2.5px solid #1e4d8c;padding-bottom:10px;margin-bottom:14px}
.header img{height:68px;object-fit:contain}
.hinfo{text-align:right;font-size:9px;color:#1e4d8c;line-height:1.6}
.titulo{font-size:17px;font-weight:900;color:#1e4d8c;margin-bottom:3px}
.sub{font-size:10px;color:#64748b;margin-bottom:14px}
table{width:100%;border-collapse:collapse;margin-bottom:14px;font-size:10px}
th{background:#1e4d8c;color:#fff;padding:6px 8px;font-size:9px;text-transform:uppercase;letter-spacing:.05em;text-align:left}
td{padding:6px 8px;border-bottom:1px solid #e2e8f0}
tr:nth-child(even) td{background:#f8fafc}
.sec{font-size:10px;font-weight:800;color:#1e4d8c;text-transform:uppercase;letter-spacing:.08em;margin:14px 0 7px;border-left:3px solid #1e4d8c;padding-left:7px}
.kpi-g{display:flex;gap:8px;margin-bottom:14px;flex-wrap:wrap}
.kpi{flex:1;min-width:110px;background:#f0f6ff;border:1px solid #bfdbfe;border-radius:7px;padding:9px 11px;border-top:3px solid #1e4d8c}
.kpi-l{font-size:8px;font-weight:700;color:#3b82f6;text-transform:uppercase;letter-spacing:.07em;margin-bottom:2px}
.kpi-v{font-size:15px;font-weight:900;color:#1e4d8c}
.kpi-s{font-size:9px;color:#64748b;margin-top:2px}
.chip{display:inline-block;font-size:9px;font-weight:700;padding:2px 7px;border-radius:20px}
.wave{position:fixed;bottom:0;left:0;right:0;line-height:0}
@page{size:A4;margin:8mm}
@media print{.wave{position:fixed;bottom:0}}
</style></head><body><div class="page">
<div class="header">
  <img src="${origem}/image.png" alt="Jota Barros" onerror="this.style.display='none'"/>
  <div class="hinfo">
    <strong style="font-size:10.5px">Jota Barros Projetos e Assessoria Técnica LTDA - EPP</strong><br/>
    CNPJ: 07.279.410/0001-62 – Insc. Estadual: 06.179.720-0<br/>
    Matriz: Rua João Barbosa, 281, Bairro Centro, Maranguape, Ceará – CEP: 61.940-025<br/>
    (Escritório e Correspondência: Rua Tabelião Joaquim Coelho, 622, Sapiranga, Fortaleza, Ceará – CEP: 60.833-261)<br/>
    contato@jbarrosprojetos.com.br / adm@jbarrosprojetos.com.br – (85) 2138.7366 – www.jbarrosprojetos.com.br
  </div>
</div>
<div class="titulo">${titulo}</div>
<div class="sub">${subtitulo} · Emitido em ${emissao}</div>
${body}
<div class="wave">
  <svg viewBox="0 0 800 110" style="width:100%;display:block" preserveAspectRatio="none">
    <path d="M0,55 Q120,10 280,45 Q440,82 600,28 Q720,0 800,38 L800,110 L0,110 Z" fill="#c8dff0" opacity="0.55"/>
    <path d="M0,70 Q180,28 380,62 Q560,94 760,42 L800,110 L0,110 Z" fill="#a0c4dc" opacity="0.65"/>
    <path d="M0,88 Q220,58 420,80 Q620,100 800,68 L800,110 L0,110 Z" fill="#6fa8c8"/>
  </svg>
</div>
</div></body></html>`
}

function abrirPDF(html) {
  const w = window.open('', '_blank')
  w.document.write(html)
  w.document.close()
  w.focus()
  setTimeout(() => w.print(), 700)
}

function barSVG(items, corBarra = '#1e4d8c') {
  if (!items.length) return ''
  const max = Math.max(...items.map(i => i.v), 1)
  const n = items.length
  const W = 520
  const LABEL_H = 14
  const AXIS_H  = 16
  const BAR_MAX = 90
  const H = LABEL_H + BAR_MAX + AXIS_H
  const cols = Math.max(n, 5)          // mínimo 5 colunas para evitar barras enormes
  const colW = (W - 40) / cols
  const bw = Math.min(44, colW * 0.6)
  const bars = items.map((item, i) => {
    const cx = 20 + i * ((W - 40) / cols) + ((W - 40) / cols) / 2
    const barH = item.v > 0 ? Math.max(4, (item.v / max) * BAR_MAX) : 0
    const barY = LABEL_H + BAR_MAX - barH
    const valLabel = item.v > 0 ? fV(item.v).replace('R$','').trim() : '—'
    return [
      item.v > 0
        ? `<rect x="${cx - bw/2}" y="${barY}" width="${bw}" height="${barH}" rx="4" fill="${corBarra}"/>`
        : `<line x1="${cx}" y1="${LABEL_H + BAR_MAX - 2}" x2="${cx}" y2="${LABEL_H + BAR_MAX}" stroke="#cbd5e1" stroke-width="1"/>`,
      `<text x="${cx}" y="${barY - 3}" text-anchor="middle" font-size="8" fill="${item.v > 0 ? corBarra : '#94a3b8'}" font-weight="600">${valLabel}</text>`,
      `<text x="${cx}" y="${H}" text-anchor="middle" font-size="9" fill="#475569">${item.l}</text>`,
    ].join('')
  }).join('')
  // linha de base
  const baseY = LABEL_H + BAR_MAX
  return `<svg viewBox="0 0 ${W} ${H + 2}" style="width:100%;margin-bottom:12px">
  <line x1="16" y1="${baseY}" x2="${W-16}" y2="${baseY}" stroke="#e2e8f0" stroke-width="1"/>
  ${bars}
</svg>`
}

// ─── Relatório 1: Resumo por Setor ────────────────────────────────────────

function rel1Setores(df, filtroSetor = 'Todos') {
  const { setores, kpis, rentabilidade } = df
  const TODOS = ['Arquitetura','Infraestrutura','Saneamento']
  const SETORES = filtroSetor === 'Todos' ? TODOS : [filtroSetor]

  const linhasTabela = SETORES.map(nome => {
    const s = setores.find(x => (x.setor||'').toLowerCase().includes(nome.toLowerCase().slice(0,4))) || {}
    const ok = (s.margemMedia||0) >= 23
    return `<tr>
      <td><strong>${nome}</strong></td>
      <td>${s.qtd||0}</td>
      <td>${fV(s.carteira||0)}</td>
      <td>${fV(s.lucro||0)}</td>
      <td><span class="chip" style="background:${ok?'#dcfce7':'#fee2e2'};color:${ok?'#15803d':'#dc2626'}">${fN(s.margemMedia||0)}%</span></td>
    </tr>`
  }).join('')

  const chartData = SETORES.map(nome => {
    const s = setores.find(x => (x.setor||'').toLowerCase().includes(nome.toLowerCase().slice(0,4))) || {}
    return { v: s.carteira||0, l: nome.slice(0,4).toUpperCase() }
  })

  const projetosPorSetor = SETORES.map(setor => {
    const projs = rentabilidade.filter(r => (r.setor||'').toLowerCase().includes(setor.toLowerCase().slice(0,4)))
    if (!projs.length) return ''
    const rows = projs.map(r => {
      const ok = r.margemPerc >= 23
      return `<tr>
        <td style="font-weight:600">${r.nome}</td>
        <td>${fV(r.valorContrato)}</td>
        <td>${fV(r.lucroEstimado)}</td>
        <td><span class="chip" style="background:${ok?'#dcfce7':'#fee2e2'};color:${ok?'#15803d':'#dc2626'}">${fN(r.margemPerc)}%</span></td>
        <td>${fV(r.recebido)}</td>
        <td>${fN(r.percRecebido)}%</td>
      </tr>`
    }).join('')
    const sub = projs.reduce((s,r)=>s+r.valorContrato,0)
    return `<div class="sec">${setor} — ${fV(sub)} · ${projs.length} projeto(s)</div>
    <table><thead><tr><th>Projeto</th><th>Contrato</th><th>Lucro Est.</th><th>Margem</th><th>Recebido</th><th>% Rec.</th></tr></thead>
    <tbody>${rows}</tbody></table>`
  }).join('')

  const percRec = kpis.totalCarteira > 0 ? kpis.totalRecebido/kpis.totalCarteira*100 : 0
  const kpiCards = `<div class="kpi-g">
    <div class="kpi"><div class="kpi-l">Carteira Total</div><div class="kpi-v">${fV(kpis.totalCarteira)}</div><div class="kpi-s">${kpis.qtdAprovados} projetos aprovados</div></div>
    <div class="kpi"><div class="kpi-l">Total Recebido</div><div class="kpi-v" style="color:#15803d">${fV(kpis.totalRecebido)}</div><div class="kpi-s">${fN(percRec)}% da carteira</div></div>
    <div class="kpi"><div class="kpi-l">A Receber</div><div class="kpi-v">${fV(kpis.totalAReceber)}</div></div>
    <div class="kpi"><div class="kpi-l">Em Atraso</div><div class="kpi-v" style="color:${kpis.totalAtrasado>0?'#dc2626':'#15803d'}">${fV(kpis.totalAtrasado)}</div></div>
  </div>`

  const body = kpiCards +
    `<div class="sec">Carteira por Setor</div>` + barSVG(chartData) +
    `<table><thead><tr><th>Setor</th><th>Projetos</th><th>Carteira (R$)</th><th>Lucro Est. (R$)</th><th>Margem Média</th></tr></thead>
    <tbody>${linhasTabela}</tbody></table>` +
    `<div class="sec">Detalhamento por Setor</div>` + projetosPorSetor

  const subtitulo = filtroSetor === 'Todos' ? 'ARQ · INFRA · SAN — Todos os projetos aprovados' : `${filtroSetor} — Projetos aprovados`
  abrirPDF(htmlBase('Resumo Financeiro por Setor', subtitulo, body))
}

// ─── Relatório 2: Planejamento x Real ─────────────────────────────────────

function rel2PlanejaXReal(projetos, filtroSetor = 'Todos') {
  if (filtroSetor !== 'Todos') projetos = projetos.filter(p => (p.setor||'') === filtroSetor)
  const total = {
    plan: projetos.reduce((s,p)=>s+p.valorContrato,0),
    real: projetos.reduce((s,p)=>s+p.totalRecebido,0),
    pend: projetos.reduce((s,p)=>s+p.totalPendente,0),
  }
  const perc = total.plan > 0 ? total.real/total.plan*100 : 0

  const kpiCards = `<div class="kpi-g">
    <div class="kpi"><div class="kpi-l">Carteira Aprovada</div><div class="kpi-v">${fV(total.plan)}</div><div class="kpi-s">${projetos.length} projetos</div></div>
    <div class="kpi"><div class="kpi-l">Total Recebido</div><div class="kpi-v" style="color:#15803d">${fV(total.real)}</div><div class="kpi-s">${fN(perc)}% executado</div></div>
    <div class="kpi"><div class="kpi-l">A Receber</div><div class="kpi-v">${fV(total.pend)}</div></div>
    <div class="kpi"><div class="kpi-l">Execução Geral</div><div class="kpi-v">${fN(perc)}%</div></div>
  </div>`

  const top12 = [...projetos].slice(0,12)
  const chart = barSVG(top12.map((p,i)=>({ v: p.valorContrato, l: `#${i+1}` })))

  const rows = projetos.map(p => {
    const ok = p.percRecebido >= 50
    const icon = p.percRecebido===100?'✅':p.percRecebido>0?'🔄':'⏳'
    return `<tr>
      <td style="font-weight:600">${p.nome}</td>
      <td><span class="chip" style="background:#ede9fe;color:#7c3aed">${p.setor||'—'}</span></td>
      <td>${fV(p.valorContrato)}</td>
      <td style="color:#15803d;font-weight:700">${fV(p.totalRecebido)}</td>
      <td><span class="chip" style="background:${ok?'#dcfce7':'#fef3c7'};color:${ok?'#15803d':'#b45309'}">${fN(p.percRecebido)}%</span></td>
      <td>${icon}</td>
    </tr>`
  }).join('')

  const body = kpiCards +
    `<div class="sec">Carteira por Projeto (top 12)</div>` + chart +
    `<div class="sec">Todos os Projetos — Planejado x Real</div>
    <table><thead><tr><th>Projeto</th><th>Setor</th><th>Planejado (R$)</th><th>Recebido (R$)</th><th>% Exec.</th><th></th></tr></thead>
    <tbody>${rows}</tbody></table>`

  const subtitulo2 = filtroSetor === 'Todos' ? 'Comparativo de execução — projetos aprovados' : `${filtroSetor} — Comparativo de execução`
  abrirPDF(htmlBase('Planejamento Financeiro x Real', subtitulo2, body))
}

// ─── Relatório 3: Recebimentos mês a mês ──────────────────────────────────

function rel3Mensal(df) {
  const { receitaMensal, fluxoCaixa90 } = df
  const ult6 = receitaMensal.slice(-6)
  const tot = {
    rec: ult6.reduce((s,m)=>s+m.recebido,0),
    prev: ult6.reduce((s,m)=>s+m.previsto,0),
    fluxo: fluxoCaixa90.reduce((s,f)=>s+f.valor,0),
  }

  const kpiCards = `<div class="kpi-g">
    <div class="kpi"><div class="kpi-l">Recebido (6 meses)</div><div class="kpi-v" style="color:#15803d">${fV(tot.rec)}</div></div>
    <div class="kpi"><div class="kpi-l">Previsto (6 meses)</div><div class="kpi-v">${fV(tot.prev)}</div></div>
    <div class="kpi"><div class="kpi-l">Projeção 90 dias</div><div class="kpi-v">${fV(tot.fluxo)}</div></div>
    <div class="kpi"><div class="kpi-l">Total período</div><div class="kpi-v">${fV(tot.rec+tot.prev)}</div></div>
  </div>`

  const chart = barSVG(ult6.map(m=>({ v: m.recebido+m.previsto, l: mL(m.mes) })))

  const rowsMes = ult6.map(m => {
    return `<tr>
      <td><strong>${mL(m.mes)}</strong></td>
      <td style="color:#15803d;font-weight:700">${fV(m.recebido)}</td>
      <td style="color:#d97706;font-weight:700">${fV(m.previsto)}</td>
      <td style="font-weight:700">${fV(m.recebido+m.previsto)}</td>
    </tr>`
  }).join('')

  const fluxoRows = fluxoCaixa90.length ? fluxoCaixa90.map(f=>
    `<tr><td><strong>${mL(f.mes)}</strong></td><td style="color:#1e4d8c;font-weight:700">${fV(f.valor)}</td><td>${f.qtd}</td></tr>`
  ).join('') : '<tr><td colspan="3" style="color:#94a3b8;font-style:italic">Nenhuma medição prevista nos próximos 90 dias</td></tr>'

  const body = kpiCards +
    `<div class="sec">Recebimentos Mensais — Últimos 6 Meses</div>` + chart +
    `<table><thead><tr><th>Mês</th><th>Recebido (R$)</th><th>Previsto/A Faturar (R$)</th><th>Total (R$)</th></tr></thead>
    <tbody>${rowsMes}
    <tr style="font-weight:800;background:#f0f6ff">
      <td>TOTAL 6 MESES</td><td>${fV(tot.rec)}</td><td>${fV(tot.prev)}</td><td>${fV(tot.rec+tot.prev)}</td>
    </tr></tbody></table>` +
    `<div class="sec">Projeção de Caixa — Próximos 90 Dias</div>
    <table><thead><tr><th>Mês</th><th>Valor Previsto (R$)</th><th>Qtd. Medições</th></tr></thead>
    <tbody>${fluxoRows}</tbody></table>`

  abrirPDF(htmlBase('Recebimentos Mês a Mês', 'Histórico dos últimos 6 meses + projeção de caixa 90 dias', body))
}

// ─── Relatório 4: Comparativo Planejado x Executado por Setor ─────────────

function rel4Comparativo(projetos, filtroSetor = 'Todos') {
  if (filtroSetor !== 'Todos') projetos = projetos.filter(p => (p.setor||'') === filtroSetor)
  const setores = [...new Set(projetos.map(p=>p.setor||'Outros'))].sort()

  const totalGeral = {
    plan: projetos.reduce((s,p)=>s+p.valorContrato,0),
    real: projetos.reduce((s,p)=>s+p.totalRecebido,0),
  }
  const percGeral = totalGeral.plan > 0 ? totalGeral.real/totalGeral.plan*100 : 0

  const kpiCards = `<div class="kpi-g">
    <div class="kpi"><div class="kpi-l">Total Planejado</div><div class="kpi-v">${fV(totalGeral.plan)}</div><div class="kpi-s">${projetos.length} projetos</div></div>
    <div class="kpi"><div class="kpi-l">Total Executado</div><div class="kpi-v" style="color:#15803d">${fV(totalGeral.real)}</div></div>
    <div class="kpi"><div class="kpi-l">% Execução Geral</div><div class="kpi-v">${fN(percGeral)}%</div></div>
    <div class="kpi"><div class="kpi-l">Setores Ativos</div><div class="kpi-v">${setores.length}</div></div>
  </div>`

  const chartSetores = barSVG(setores.map(s => ({
    v: projetos.filter(p=>(p.setor||'Outros')===s).reduce((acc,p)=>acc+p.valorContrato,0),
    l: s.slice(0,4).toUpperCase()
  })))

  const corpo = setores.map(setor => {
    const projs = projetos.filter(p=>(p.setor||'Outros')===setor)
    const tPlan = projs.reduce((s,p)=>s+p.valorContrato,0)
    const tReal = projs.reduce((s,p)=>s+p.totalRecebido,0)
    const pSetor = tPlan > 0 ? tReal/tPlan*100 : 0

    const rows = projs.map(p => {
      const dev = p.totalRecebido - p.valorContrato
      const ok = p.percRecebido >= 50
      return `<tr>
        <td style="font-weight:600">${p.nome}</td>
        <td>${fV(p.valorContrato)}</td>
        <td><span class="chip" style="background:${p.margemPlan>=23?'#dcfce7':'#fee2e2'};color:${p.margemPlan>=23?'#15803d':'#dc2626'}">${fN(p.margemPlan)}%</span></td>
        <td style="color:#15803d;font-weight:700">${fV(p.totalRecebido)}</td>
        <td><span class="chip" style="background:${ok?'#dcfce7':'#fef3c7'};color:${ok?'#15803d':'#b45309'}">${fN(p.percRecebido)}%</span></td>
        <td style="color:${dev>=0?'#15803d':'#dc2626'};font-weight:700">${dev>=0?'+':''}${fV(dev)}</td>
      </tr>`
    }).join('')

    return `<div class="sec">${setor} — ${fV(tPlan)} planejado · ${fN(pSetor)}% executado</div>
    <table><thead><tr><th>Projeto</th><th>Contrato (R$)</th><th>Margem Plan.</th><th>Recebido (R$)</th><th>% Exec.</th><th>Desvio (R$)</th></tr></thead>
    <tbody>${rows}
    <tr style="font-weight:800;background:#f0f6ff">
      <td>Subtotal ${setor}</td>
      <td>${fV(tPlan)}</td><td>—</td>
      <td>${fV(tReal)}</td>
      <td><span class="chip" style="background:#dbeafe;color:#1e4d8c">${fN(pSetor)}%</span></td>
      <td style="color:${tReal>=tPlan?'#15803d':'#dc2626'}">${tReal>=tPlan?'+':''}${fV(tReal-tPlan)}</td>
    </tr></tbody></table>`
  }).join('')

  const body = kpiCards +
    `<div class="sec">Carteira por Setor</div>` + chartSetores + corpo

  const subtitulo4 = filtroSetor === 'Todos' ? 'Análise de execução financeira agrupada por setor e projeto' : `${filtroSetor} — Análise de execução financeira`
  abrirPDF(htmlBase('Comparativo Planejado x Executado por Setor', subtitulo4, body))
}

// ─── Componente principal ──────────────────────────────────────────────────

export default function RelatoriosGerenciais() {
  const { isDark } = useTheme()
  const T = {
    bg:      isDark ? '#0F172A' : '#F8FAFC',
    card:    isDark ? '#1E293B' : '#ffffff',
    cardAlt: isDark ? '#162032' : '#F8FAFC',
    border:  isDark ? '#334155' : '#E2E8F0',
    text1:   isDark ? '#F1F5F9' : '#0F172A',
    text2:   isDark ? '#94A3B8' : '#64748B',
    text3:   isDark ? '#475569' : '#94A3B8',
  }

  const [df, setDf]   = useState(null)
  const [br, setBr]   = useState(null)
  const [loading, setLoading] = useState(true)
  const SETORES_OPCOES = ['Todos','Arquitetura','Infraestrutura','Saneamento']
  const [setor1, setSetor1] = useState('Todos')
  const [setor2, setSetor2] = useState('Todos')
  const [setor4, setSetor4] = useState('Todos')

  const carregar = useCallback(async () => {
    setLoading(true)
    try {
      const [r1, r2] = await Promise.all([
        api.get('/dashboard-financeiro'),
        api.get('/baseline-real'),
      ])
      setDf(r1.data)
      setBr(r2.data?.projetos || [])
    } catch { toast.error('Erro ao carregar dados') }
    finally { setLoading(false) }
  }, [])

  useEffect(() => { carregar() }, [carregar])

  function SetorSelector({ value, onChange, cor }) {
    return (
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        {SETORES_OPCOES.map(s => {
          const ativo = value === s
          return (
            <button key={s} onClick={() => onChange(s)} style={{
              padding: '4px 12px', borderRadius: 20, border: `1.5px solid ${ativo ? cor : T.border}`,
              background: ativo ? cor : 'transparent', color: ativo ? '#fff' : T.text2,
              fontSize: 11, fontWeight: 700, cursor: 'pointer', transition: 'all .15s',
            }}>{s === 'Todos' ? 'Todos' : s.slice(0,3).toUpperCase()}</button>
          )
        })}
      </div>
    )
  }

  return (
    <div className="space-y-5 fade-in">
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 4 }}>
        <DocumentChartBarIcon style={{ width: 24, height: 24, color: '#1e4d8c' }} />
        <h1 className="page-title">Relatórios Gerenciais</h1>
        {!loading && (
          <span style={{ fontSize: 11, color: T.text3 }}>
            {df?.kpis?.qtdAprovados || 0} projetos · dados atualizados
          </span>
        )}
        <button onClick={carregar} style={{ marginLeft: 'auto', padding: '6px 14px', borderRadius: 8, border: `1.5px solid ${T.border}`, background: T.card, color: T.text2, fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>
          🔄 Atualizar
        </button>
      </div>

      {loading ? (
        <div style={{ padding: 60, textAlign: 'center', color: T.text3 }}>Carregando dados...</div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>

          {/* Card 1 — Resumo por Setor */}
          <div style={{ background: isDark?'rgba(30,77,140,.15)':'#EFF6FF', border: `1.5px solid ${isDark?'rgba(30,77,140,.4)':'#BFDBFE'}`, borderRadius: 14, padding: '22px 24px', display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
              <span style={{ fontSize: 28, lineHeight: 1 }}>📊</span>
              <div>
                <div style={{ fontSize: 15, fontWeight: 900, color: '#1e4d8c', marginBottom: 4 }}>Resumo por Setor</div>
                <div style={{ fontSize: 12, color: T.text2, lineHeight: 1.6 }}>Carteira, lucro estimado e margem média, com tabela detalhada de todos os projetos do setor.</div>
              </div>
            </div>
            <SetorSelector value={setor1} onChange={setSetor1} cor="#1e4d8c" />
            <button onClick={() => df ? rel1Setores(df, setor1) : toast.error('Dados ainda carregando')}
              style={{ alignSelf:'flex-start', padding:'9px 20px', borderRadius:9, border:'none', background:'#1e4d8c', color:'#fff', fontWeight:700, fontSize:13, cursor:'pointer', display:'flex', alignItems:'center', gap:8, boxShadow:'0 2px 10px rgba(30,77,140,.35)' }}>
              <DocumentChartBarIcon style={{ width:15, height:15 }} /> Gerar PDF
            </button>
          </div>

          {/* Card 2 — Planejamento x Real */}
          <div style={{ background: isDark?'rgba(124,58,237,.15)':'#F5F3FF', border: `1.5px solid ${isDark?'rgba(124,58,237,.4)':'#DDD6FE'}`, borderRadius: 14, padding: '22px 24px', display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
              <span style={{ fontSize: 28, lineHeight: 1 }}>📈</span>
              <div>
                <div style={{ fontSize: 15, fontWeight: 900, color: '#7C3AED', marginBottom: 4 }}>Planejamento x Real</div>
                <div style={{ fontSize: 12, color: T.text2, lineHeight: 1.6 }}>Comparativo entre contrato planejado e valor efetivamente recebido, com percentual de execução.</div>
              </div>
            </div>
            <SetorSelector value={setor2} onChange={setSetor2} cor="#7C3AED" />
            <button onClick={() => br?.length ? rel2PlanejaXReal(br, setor2) : toast.error('Dados ainda carregando')}
              style={{ alignSelf:'flex-start', padding:'9px 20px', borderRadius:9, border:'none', background:'#7C3AED', color:'#fff', fontWeight:700, fontSize:13, cursor:'pointer', display:'flex', alignItems:'center', gap:8, boxShadow:'0 2px 10px rgba(124,58,237,.35)' }}>
              <DocumentChartBarIcon style={{ width:15, height:15 }} /> Gerar PDF
            </button>
          </div>

          {/* Card 3 — Recebimentos Mês a Mês (sem filtro de setor) */}
          <div style={{ background: isDark?'rgba(8,145,178,.15)':'#ECFEFF', border: `1.5px solid ${isDark?'rgba(8,145,178,.4)':'#A5F3FC'}`, borderRadius: 14, padding: '22px 24px', display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
              <span style={{ fontSize: 28, lineHeight: 1 }}>📅</span>
              <div>
                <div style={{ fontSize: 15, fontWeight: 900, color: '#0891B2', marginBottom: 4 }}>Recebimentos Mês a Mês</div>
                <div style={{ fontSize: 12, color: T.text2, lineHeight: 1.6 }}>Histórico dos últimos 6 meses de recebimentos realizados e previstos, mais projeção de caixa 90 dias.</div>
              </div>
            </div>
            <button onClick={() => df ? rel3Mensal(df) : toast.error('Dados ainda carregando')}
              style={{ alignSelf:'flex-start', padding:'9px 20px', borderRadius:9, border:'none', background:'#0891B2', color:'#fff', fontWeight:700, fontSize:13, cursor:'pointer', display:'flex', alignItems:'center', gap:8, boxShadow:'0 2px 10px rgba(8,145,178,.35)' }}>
              <DocumentChartBarIcon style={{ width:15, height:15 }} /> Gerar PDF
            </button>
          </div>

          {/* Card 4 — Comparativo por Setor */}
          <div style={{ background: isDark?'rgba(21,128,61,.15)':'#F0FDF4', border: `1.5px solid ${isDark?'rgba(21,128,61,.4)':'#86EFAC'}`, borderRadius: 14, padding: '22px 24px', display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
              <span style={{ fontSize: 28, lineHeight: 1 }}>⚖️</span>
              <div>
                <div style={{ fontSize: 15, fontWeight: 900, color: '#15803D', marginBottom: 4 }}>Comparativo por Setor</div>
                <div style={{ fontSize: 12, color: T.text2, lineHeight: 1.6 }}>Planejado vs. executado por projeto com margem planejada, % de execução e desvio em reais.</div>
              </div>
            </div>
            <SetorSelector value={setor4} onChange={setSetor4} cor="#15803D" />
            <button onClick={() => br?.length ? rel4Comparativo(br, setor4) : toast.error('Dados ainda carregando')}
              style={{ alignSelf:'flex-start', padding:'9px 20px', borderRadius:9, border:'none', background:'#15803D', color:'#fff', fontWeight:700, fontSize:13, cursor:'pointer', display:'flex', alignItems:'center', gap:8, boxShadow:'0 2px 10px rgba(21,128,61,.35)' }}>
              <DocumentChartBarIcon style={{ width:15, height:15 }} /> Gerar PDF
            </button>
          </div>

        </div>
      )}

      {/* Preview do cabeçalho */}
      <div style={{ background: T.card, border: `1.5px solid ${T.border}`, borderRadius: 12, padding: '16px 20px' }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: T.text3, textTransform: 'uppercase', letterSpacing: '.08em', marginBottom: 10 }}>
          Cabeçalho dos Relatórios
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: `2px solid #1e4d8c`, paddingBottom: 10 }}>
          <img src="/image.png" alt="JB" style={{ height: 52, objectFit: 'contain' }} onError={e => { e.target.style.display = 'none' }} />
          <div style={{ textAlign: 'right', fontSize: 9, color: '#1e4d8c', lineHeight: 1.6 }}>
            <strong style={{ fontSize: 10 }}>Jota Barros Projetos e Assessoria Técnica LTDA - EPP</strong><br/>
            CNPJ: 07.279.410/0001-62 – Insc. Estadual: 06.179.720-0<br/>
            Matriz: Rua João Barbosa, 281, Bairro Centro, Maranguape, Ceará – CEP: 61.940-025<br/>
            (Escritório: Rua Tabelião Joaquim Coelho, 622, Sapiranga, Fortaleza, Ceará – CEP: 60.833-261)<br/>
            contato@jbarrosprojetos.com.br / adm@jbarrosprojetos.com.br – (85) 2138.7366 – www.jbarrosprojetos.com.br
          </div>
        </div>
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 6 }}>
          <div style={{ fontSize: 9, color: T.text3 }}>+ onda azul no rodapé de cada página</div>
        </div>
      </div>
    </div>
  )
}
