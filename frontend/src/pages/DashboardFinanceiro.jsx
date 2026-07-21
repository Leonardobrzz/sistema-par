import { useState, useEffect } from "react"
import {
  AreaChart, Area, BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, Legend,
} from "recharts"
import { TrendingUp, Download, RefreshCw, AlertTriangle, DollarSign, Clock, CheckCircle } from "lucide-react"
import api from "../utils/api"
import { useTheme } from "../contexts/ThemeContext"

const fmtR = (v) => Number(v || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 })
const fmtN = (v, d = 1) => Number(v || 0).toFixed(d)
const mesCurto = (ym) => {
  if (!ym) return ""
  const [y, m] = ym.split("-")
  return `${["Jan","Fev","Mar","Abr","Mai","Jun","Jul","Ago","Set","Out","Nov","Dez"][parseInt(m)-1]}/${y.slice(2)}`
}

function KPI({ label, value, sub, icon: Icon, cor = "#7C3AED", ok = true }) {
  const { isDark } = useTheme()
  const T = { card: isDark ? "#1E293B" : "#fff", border: isDark ? "#334155" : "#E2E8F0", text1: isDark ? "#F1F5F9" : "#0F172A", text2: isDark ? "#94A3B8" : "#64748B" }
  return (
    <div style={{ background: T.card, borderRadius: 14, padding: "18px 20px", border: `1.5px solid ${T.border}`, flex: 1, minWidth: 180 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 10 }}>
        <span style={{ fontSize: 11, fontWeight: 700, color: T.text2, textTransform: "uppercase", letterSpacing: "0.06em" }}>{label}</span>
        <div style={{ padding: 8, borderRadius: 10, background: `${cor}18` }}>
          <Icon size={16} color={cor} />
        </div>
      </div>
      <div style={{ fontSize: 22, fontWeight: 900, color: ok ? T.text1 : "#DC2626" }}>{value}</div>
      {sub && <div style={{ fontSize: 11, color: T.text2, marginTop: 4 }}>{sub}</div>}
    </div>
  )
}

function Secao({ titulo, children, T }) {
  return (
    <div style={{ background: T.card, borderRadius: 14, padding: "20px 24px", border: `1.5px solid ${T.border}` }}>
      <div style={{ fontSize: 11, fontWeight: 800, color: T.text2, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 16, borderBottom: `1px solid ${T.border}`, paddingBottom: 10 }}>
        {titulo}
      </div>
      {children}
    </div>
  )
}

function gerarRelatorio(dados) {
  if (!dados) return
  const { kpis, receitaMensal, rentabilidade, aging, fluxoCaixa90, setores } = dados
  const fV = (v) => Number(v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 })
  const fN = (v, d = 1) => Number(v || 0).toFixed(d)
  const mL = (ym) => { if (!ym) return ''; const [y, m] = ym.split('-'); return ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'][parseInt(m)-1]+'/'+y.slice(2) }
  const emissao = new Date().toLocaleString('pt-BR')

  const pBar = (perc, cor) =>
    '<div style="height:8px;background:#E2E8F0;border-radius:99px;overflow:hidden;margin-top:4px"><div style="height:100%;width:'+Math.min(perc,100)+'%;background:'+cor+';border-radius:99px"></div></div>'

  const kpiCard = (label, value, cor, sub) =>
    '<div style="flex:1;min-width:130px;background:#fff;border:1.5px solid #E2E8F0;border-radius:10px;padding:16px 18px;border-top:4px solid '+cor+'">'+
    '<div style="font-size:9px;font-weight:700;color:#94A3B8;text-transform:uppercase;letter-spacing:.08em;margin-bottom:6px">'+label+'</div>'+
    '<div style="font-size:20px;font-weight:900;color:'+cor+'">'+value+'</div>'+
    (sub ? '<div style="font-size:10px;color:#64748B;margin-top:3px">'+sub+'</div>' : '')+
    '</div>'

  const section = (title, acento, body) =>
    '<div style="margin-bottom:24px;background:#fff;border-radius:12px;border:1px solid #E2E8F0;overflow:hidden">'+
    '<div style="background:'+acento+';padding:10px 18px">'+
    '<span style="font-size:10px;font-weight:800;color:#fff;text-transform:uppercase;letter-spacing:.08em">'+title+'</span></div>'+
    '<div style="padding:18px">'+body+'</div></div>'

  const barSVG = (items, keyVal, keyLabel, cor) => {
    const max = Math.max(...items.map(i => i[keyVal]), 1)
    const W = 500, H = 90, bw = Math.max(6, Math.floor((W-40)/items.length)-6)
    const bars = items.map((item, i) => {
      const x = 20 + i * ((W-40)/items.length) + 2
      const h = Math.max(2, (item[keyVal]/max)*(H-16))
      const y = H - h - 12
      return '<rect x="'+x+'" y="'+y+'" width="'+bw+'" height="'+h+'" rx="3" fill="'+cor+'"/>'+
             '<text x="'+(x+bw/2)+'" y="'+H+'" text-anchor="middle" font-size="8" fill="#64748B">'+mL(item[keyLabel])+'</text>'
    }).join('')
    return '<svg viewBox="0 0 '+W+' '+(H+4)+'" style="width:100%;overflow:visible">'+bars+'</svg>'
  }

  const percRecebido = kpis.totalCarteira > 0 ? (kpis.totalRecebido / kpis.totalCarteira * 100) : 0

  const agingRows = [
    { label: 'Até 30 dias',      valor: aging.ate30,   cor: '#F59E0B' },
    { label: '31 a 60 dias',     valor: aging.de31a60, cor: '#EF4444' },
    { label: '61 a 90 dias',     valor: aging.de61a90, cor: '#DC2626' },
    { label: 'Acima de 90 dias', valor: aging.acima90, cor: '#7F1D1D' },
  ].map(a =>
    '<div style="margin-bottom:10px">'+
    '<div style="display:flex;justify-content:space-between;font-size:11px;margin-bottom:3px">'+
    '<span style="color:#475569">'+a.label+'</span>'+
    '<strong style="color:'+(a.valor>0?a.cor:'#94A3B8')+'">'+fV(a.valor)+'</strong></div>'+
    pBar((a.valor/(aging.total||1))*100, a.cor)+'</div>'
  ).join('')

  const setoresHtml = setores.map(s => {
    const ok = s.margemMedia >= 23
    return '<div style="display:flex;align-items:center;justify-content:space-between;padding:10px 14px;background:#F8FAFC;border-radius:8px;border:1px solid #E2E8F0;margin-bottom:8px">'+
      '<div><div style="font-weight:800;font-size:12px;color:#0F172A">'+s.setor+'</div>'+
      '<div style="font-size:10px;color:#64748B;margin-top:2px">'+s.qtd+' projeto(s) · '+fV(s.carteira)+'</div></div>'+
      '<div style="text-align:right"><div style="font-size:18px;font-weight:900;color:'+(ok?'#15803D':'#DC2626')+'">'+fN(s.margemMedia)+'%</div>'+
      '<div style="font-size:9px;color:#64748B">margem média</div></div></div>'
  }).join('')

  const fluxoCards = fluxoCaixa90.map(f =>
    '<div style="flex:1;min-width:90px;background:#EFF6FF;border:1.5px solid #BFDBFE;border-radius:10px;padding:12px;text-align:center">'+
    '<div style="font-size:10px;font-weight:700;color:#1D4ED8;margin-bottom:4px">'+mL(f.mes)+'</div>'+
    '<div style="font-size:15px;font-weight:900;color:#1E40AF">'+fV(f.valor)+'</div>'+
    '<div style="font-size:9px;color:#3B82F6;margin-top:2px">'+f.qtd+' medição(ões)</div></div>'
  ).join('')

  const tabelaRows = rentabilidade.map((r, i) => {
    const ok = r.margemPerc >= 23
    return '<tr style="background:'+(i%2===0?'#fff':'#F8FAFC')+'">'+
      '<td style="padding:7px 10px;font-weight:600;font-size:10px;max-width:220px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">'+r.nome+'</td>'+
      '<td style="padding:7px 10px"><span style="background:#EDE9FE;color:#7C3AED;padding:2px 8px;border-radius:20px;font-weight:700;font-size:9px">'+r.setor+'</span></td>'+
      '<td style="padding:7px 10px;font-size:10px;font-weight:600">'+fV(r.valorContrato)+'</td>'+
      '<td style="padding:7px 10px;font-size:10px">'+fV(r.lucroEstimado)+'</td>'+
      '<td style="padding:7px 10px;font-size:10px;font-weight:700;color:'+(ok?'#15803D':'#DC2626')+'">'+fN(r.margemPerc)+'%</td>'+
      '<td style="padding:7px 10px;font-size:10px">'+fV(r.recebido)+'</td>'+
      '<td style="padding:7px 10px;font-size:10px;color:#64748B">'+fN(r.percRecebido)+'%</td></tr>'
  }).join('')

  const origem = window.location.origin
  const html = '<!DOCTYPE html><html lang="pt-BR"><head><meta charset="utf-8">'+
    '<title>Relatório Financeiro — Jota Barros Projetos</title>'+
    '<style>*{box-sizing:border-box;margin:0;padding:0}body{font-family:Arial,sans-serif;font-size:11px;color:#0F172A;background:#fff}.page{max-width:900px;margin:0 auto;padding:28px}table{width:100%;border-collapse:collapse}th{background:#1E293B;color:#fff;padding:8px 10px;text-align:left;font-size:9px;text-transform:uppercase;letter-spacing:.06em}td{border-bottom:1px solid #F1F5F9}@page{size:A4;margin:10mm}@media print{body{background:#fff}}</style></head>'+
    '<body><div class="page">'+

    '<div style="display:flex;justify-content:space-between;align-items:center;border-bottom:2.5px solid #1e4d8c;padding-bottom:10px;margin-bottom:18px">'+
    '<img src="'+origem+'/image.png" alt="Jota Barros" style="height:68px;object-fit:contain" onerror="this.style.display=\'none\'"/>'+
    '<div style="text-align:right;font-size:9px;color:#1e4d8c;line-height:1.6">'+
    '<strong style="font-size:10.5px">Jota Barros Projetos e Assessoria Técnica LTDA - EPP</strong><br/>'+
    'CNPJ: 07.279.410/0001-62 – Insc. Estadual: 06.179.720-0<br/>'+
    'Matriz: Rua João Barbosa, 281, Bairro Centro, Maranguape, Ceará – CEP: 61.940-025<br/>'+
    '(Escritório: Rua Tabelião Joaquim Coelho, 622, Sapiranga, Fortaleza, Ceará – CEP: 60.833-261)<br/>'+
    '</div></div>'+

    '<div style="margin-bottom:18px">'+
    '<div style="font-size:17px;font-weight:900;color:#1e4d8c">Relatório Financeiro Gerencial</div>'+
    '<div style="font-size:10px;color:#64748B;margin-top:3px">Emitido em '+emissao+'</div></div>'+

    '<div style="display:flex;gap:12px;flex-wrap:wrap;margin-bottom:24px">'+
    kpiCard('Carteira Aprovada', fV(kpis.totalCarteira), '#7C3AED', kpis.qtdAprovados+' projeto(s) aprovado(s)')+
    kpiCard('Total Recebido', fV(kpis.totalRecebido), '#16A34A', fN(percRecebido)+'% da carteira')+
    kpiCard('A Receber', fV(kpis.totalAReceber), '#2563EB', '')+
    kpiCard('Em Atraso', fV(kpis.totalAtrasado), kpis.totalAtrasado>0?'#DC2626':'#16A34A', kpis.totalAtrasado>0?'Medições vencidas':'Sem inadimplência')+
    '</div>'+

    '<div style="margin-bottom:24px;padding:14px 18px;background:#fff;border-radius:10px;border:1px solid #E2E8F0">'+
    '<div style="display:flex;justify-content:space-between;font-size:11px;margin-bottom:8px">'+
    '<span style="color:#64748B;font-weight:600">Progresso de Recebimento da Carteira</span>'+
    '<strong style="color:#7C3AED">'+fN(percRecebido)+'% recebido</strong></div>'+
    pBar(percRecebido, 'linear-gradient(90deg,#7C3AED,#3B82F6)')+'</div>'+

    '<div style="display:grid;grid-template-columns:1fr 1fr;gap:16px">'+
    section('Projeção de Caixa — Próximos 90 Dias', '#1D4ED8',
      fluxoCaixa90.length===0
        ? '<div style="color:#94A3B8;font-size:12px;padding:8px 0">Nenhuma medição prevista nos próximos 90 dias</div>'
        : '<div style="margin-bottom:12px">'+barSVG(fluxoCaixa90,'valor','mes','#3B82F6')+'</div><div style="display:flex;gap:8px;flex-wrap:wrap">'+fluxoCards+'</div>'
    )+
    section('Rentabilidade por Setor', '#15803D', setoresHtml || '<div style="color:#94A3B8">Nenhum planejamento aprovado</div>')+
    '</div>'+

    (aging.total>0
      ? section('Inadimplência — Valores em Atraso', '#DC2626',
          agingRows+'<div style="margin-top:12px;padding:10px 14px;background:#FEF2F2;border-radius:8px;border:1px solid #FECACA;display:flex;justify-content:space-between">'+
          '<span style="font-weight:700;color:#DC2626">Total em atraso</span>'+
          '<strong style="font-size:14px;color:#DC2626">'+fV(aging.total)+'</strong></div>')
      : '<div style="margin-bottom:24px;padding:14px 18px;background:#F0FDF4;border-radius:10px;border:1px solid #86EFAC;display:flex;align-items:center;gap:10px">'+
        '<span style="font-size:18px">✅</span><span style="font-weight:700;color:#15803D">Nenhum valor em atraso — carteira em dia!</span></div>'
    )+

    section('Rentabilidade por Projeto ('+rentabilidade.length+' projetos)', '#7C3AED',
      '<table><thead><tr><th>Projeto</th><th>Setor</th><th>Contrato</th><th>Lucro Est.</th><th>Margem</th><th>Recebido</th><th>% Rec.</th></tr></thead>'+
      '<tbody>'+tabelaRows+'</tbody></table>'
    )+

    '<div style="height:1px;background:linear-gradient(90deg,#7C3AED,#3B82F6,transparent);margin:20px 0"></div>'+
    '<div style="display:flex;justify-content:space-between;font-size:9px;color:#94A3B8">'+
    '<span>Sistema PAR · Jota Barros Projetos · Confidencial</span><span>Emitido em '+emissao+'</span></div>'+
    '</div></body></html>'

  const janela = window.open('', '_blank')
  janela.document.write(html)
  janela.document.close()
  janela.focus()
  setTimeout(() => janela.print(), 700)
}


export default function DashboardFinanceiro() {
  const { isDark } = useTheme()
  const T = {
    bg:      isDark ? "#0F172A" : "#F8FAFC",
    card:    isDark ? "#1E293B" : "#ffffff",
    cardAlt: isDark ? "#0F172A" : "#F8FAFC",
    border:  isDark ? "#334155" : "#E2E8F0",
    text1:   isDark ? "#F1F5F9" : "#0F172A",
    text2:   isDark ? "#94A3B8" : "#64748B",
    text3:   isDark ? "#475569" : "#94A3B8",
    grid:    isDark ? "#1E293B" : "#F1F5F9",
  }

  const [dados, setDados] = useState(null)
  const [loading, setLoading] = useState(true)

  async function carregar() {
    setLoading(true)
    try {
      const { data } = await api.get("/dashboard-financeiro")
      setDados(data)
    } catch (e) {
      console.error(e)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { carregar() }, [])

  const tooltipStyle = { background: T.card, border: `1px solid ${T.border}`, borderRadius: 8, fontSize: 12, color: T.text1 }

  if (loading) return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: 300, color: T.text2, fontSize: 14 }}>
      Carregando dados financeiros...
    </div>
  )

  if (!dados) return null

  const { kpis, receitaMensal, fluxoCaixa90, aging, rentabilidade, setores } = dados

  return (
    <div style={{ paddingBottom: 60 }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 24, flexWrap: "wrap" }}>
        <TrendingUp size={22} color="#7C3AED" />
        <span style={{ fontWeight: 900, fontSize: 18, color: T.text1, textTransform: "uppercase", letterSpacing: "0.06em", flex: 1 }}>
          Dashboard Financeiro
        </span>
        <button onClick={() => gerarRelatorio(dados)}
          style={{ display: "flex", alignItems: "center", gap: 6, padding: "7px 14px", borderRadius: 8, border: "1.5px solid #C4B5FD", background: "#F5F3FF", color: "#7C3AED", fontWeight: 700, fontSize: 13, cursor: "pointer" }}>
          <Download size={14} /> Gerar Relatório PDF
        </button>
        <button onClick={carregar}
          style={{ display: "flex", alignItems: "center", gap: 6, padding: "7px 14px", borderRadius: 8, border: `1.5px solid ${T.border}`, background: T.card, color: T.text2, fontWeight: 600, fontSize: 13, cursor: "pointer" }}>
          <RefreshCw size={14} /> Atualizar
        </button>
      </div>

      {/* KPIs */}
      <div style={{ display: "flex", gap: 14, flexWrap: "wrap", marginBottom: 24 }}>
        <KPI label="Carteira Aprovada"  value={fmtR(kpis.totalCarteira)}  icon={DollarSign}    cor="#7C3AED" sub={`${kpis.qtdAprovados} projeto(s) aprovado(s)`} />
        <KPI label="Total Recebido"     value={fmtR(kpis.totalRecebido)}  icon={CheckCircle}   cor="#16A34A" sub={`${kpis.totalCarteira > 0 ? fmtN(kpis.totalRecebido / kpis.totalCarteira * 100) : 0}% da carteira`} />
        <KPI label="A Receber"          value={fmtR(kpis.totalAReceber)}  icon={Clock}         cor="#2563EB" />
        <KPI label="Em Atraso"          value={fmtR(kpis.totalAtrasado)}  icon={AlertTriangle} cor="#DC2626" ok={kpis.totalAtrasado === 0} sub={kpis.totalAtrasado > 0 ? "Medições vencidas não recebidas" : "Sem inadimplência"} />
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20, marginBottom: 20 }}>
        {/* Receita vs Previsto por mês */}
        <Secao titulo="Receita — Recebido vs Previsto (18 meses)" T={T}>
          <ResponsiveContainer width="100%" height={240}>
            <AreaChart data={receitaMensal} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id="gradRecebido" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%"  stopColor="#7C3AED" stopOpacity={0.25} />
                  <stop offset="95%" stopColor="#7C3AED" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="gradPrevisto" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%"  stopColor="#22C55E" stopOpacity={0.2} />
                  <stop offset="95%" stopColor="#22C55E" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke={T.grid} />
              <XAxis dataKey="mes" tickFormatter={mesCurto} tick={{ fill: T.text2, fontSize: 10 }} />
              <YAxis tickFormatter={v => v >= 1000 ? `${(v/1000).toFixed(0)}k` : v} tick={{ fill: T.text2, fontSize: 10 }} />
              <Tooltip contentStyle={tooltipStyle} formatter={(v, n) => [fmtR(v), n === "recebido" ? "Recebido" : "Previsto"]} labelFormatter={mesCurto} />
              <Legend formatter={v => v === "recebido" ? "Recebido" : "Previsto"} wrapperStyle={{ fontSize: 11, color: T.text2 }} />
              <Area type="monotone" dataKey="recebido" stroke="#7C3AED" fill="url(#gradRecebido)" strokeWidth={2} dot={false} />
              <Area type="monotone" dataKey="previsto" stroke="#22C55E" fill="url(#gradPrevisto)" strokeWidth={2} dot={false} strokeDasharray="4 2" />
            </AreaChart>
          </ResponsiveContainer>
        </Secao>

        {/* Fluxo de caixa 90 dias */}
        <Secao titulo="Projeção de Caixa — Próximos 90 Dias" T={T}>
          {fluxoCaixa90.length === 0 ? (
            <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: 240, color: T.text3, fontSize: 13 }}>
              Nenhuma medição prevista nos próximos 90 dias
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={fluxoCaixa90} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={T.grid} />
                <XAxis dataKey="mes" tickFormatter={mesCurto} tick={{ fill: T.text2, fontSize: 10 }} />
                <YAxis tickFormatter={v => `${(v/1000).toFixed(0)}k`} tick={{ fill: T.text2, fontSize: 10 }} />
                <Tooltip contentStyle={tooltipStyle} formatter={(v, n) => [fmtR(v), "A Receber"]} labelFormatter={mesCurto} />
                <Bar dataKey="valor" fill="#3B82F6" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
          <div style={{ display: "flex", gap: 12, marginTop: 12, flexWrap: "wrap" }}>
            {fluxoCaixa90.map(f => (
              <div key={f.mes} style={{ flex: 1, minWidth: 100, padding: "8px 12px", background: T.cardAlt, borderRadius: 8, border: `1px solid ${T.border}` }}>
                <div style={{ fontSize: 10, color: T.text2, fontWeight: 700 }}>{mesCurto(f.mes)}</div>
                <div style={{ fontSize: 14, fontWeight: 800, color: "#3B82F6" }}>{fmtR(f.valor)}</div>
                <div style={{ fontSize: 10, color: T.text3 }}>{f.qtd} medição(ões)</div>
              </div>
            ))}
          </div>
        </Secao>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20, marginBottom: 20 }}>
        {/* Inadimplência / Aging */}
        <Secao titulo="Inadimplência — Valores em Atraso" T={T}>
          {aging.total === 0 ? (
            <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "20px 0", color: "#16A34A" }}>
              <CheckCircle size={20} />
              <span style={{ fontWeight: 700 }}>Nenhum valor em atraso</span>
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {[
                { label: "Até 30 dias",       valor: aging.ate30,   cor: "#F59E0B" },
                { label: "31 a 60 dias",       valor: aging.de31a60, cor: "#EF4444" },
                { label: "61 a 90 dias",       valor: aging.de61a90, cor: "#DC2626" },
                { label: "Acima de 90 dias",   valor: aging.acima90, cor: "#7F1D1D" },
              ].map(({ label, valor, cor }) => {
                const perc = aging.total > 0 ? (valor / aging.total) * 100 : 0
                return (
                  <div key={label}>
                    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4, fontSize: 12 }}>
                      <span style={{ color: T.text2 }}>{label}</span>
                      <span style={{ fontWeight: 700, color: valor > 0 ? cor : T.text3 }}>{fmtR(valor)}</span>
                    </div>
                    <div style={{ height: 8, background: T.grid, borderRadius: 99 }}>
                      <div style={{ height: "100%", width: `${perc}%`, background: cor, borderRadius: 99 }} />
                    </div>
                  </div>
                )
              })}
              <div style={{ marginTop: 8, padding: "8px 12px", background: "#FEF2F2", borderRadius: 8, border: "1px solid #FECACA", fontSize: 12, fontWeight: 700, color: "#DC2626" }}>
                Total em atraso: {fmtR(aging.total)}
              </div>
            </div>
          )}
        </Secao>

        {/* Rentabilidade por setor */}
        <Secao titulo="Rentabilidade por Setor" T={T}>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {setores.length === 0 && <div style={{ color: T.text3, fontSize: 13 }}>Nenhum planejamento aprovado</div>}
            {setores.map(s => {
              const margemOk = s.margemMedia >= 23
              return (
                <div key={s.setor} style={{ padding: "12px 16px", background: T.cardAlt, borderRadius: 10, border: `1px solid ${T.border}` }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                    <span style={{ fontWeight: 800, fontSize: 13, color: T.text1 }}>{s.setor}</span>
                    <span style={{ fontSize: 10, fontWeight: 700, color: "#7C3AED", background: "#EDE9FE", padding: "2px 8px", borderRadius: 20 }}>
                      {s.qtd} projeto(s)
                    </span>
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8, fontSize: 11 }}>
                    <div>
                      <div style={{ color: T.text3, marginBottom: 2 }}>Carteira</div>
                      <div style={{ fontWeight: 700, color: T.text1 }}>{fmtR(s.carteira)}</div>
                    </div>
                    <div>
                      <div style={{ color: T.text3, marginBottom: 2 }}>Lucro Est.</div>
                      <div style={{ fontWeight: 700, color: T.text1 }}>{fmtR(s.lucro)}</div>
                    </div>
                    <div>
                      <div style={{ color: T.text3, marginBottom: 2 }}>Margem</div>
                      <div style={{ fontWeight: 700, color: margemOk ? "#16A34A" : "#DC2626" }}>{fmtN(s.margemMedia)}%</div>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        </Secao>
      </div>

      {/* Rentabilidade por projeto */}
      <Secao titulo={`Rentabilidade por Projeto (${rentabilidade.length} projetos aprovados)`} T={T}>
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
            <thead>
              <tr style={{ background: T.cardAlt }}>
                {["Projeto", "Setor", "Contrato", "Lucro Est.", "Margem", "Recebido", "% Rec."].map(h => (
                  <th key={h} style={{ padding: "8px 12px", textAlign: "left", fontWeight: 700, color: T.text2, fontSize: 11, textTransform: "uppercase", borderBottom: `1px solid ${T.border}`, whiteSpace: "nowrap" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rentabilidade.map((r, i) => {
                const margemOk = r.margemPerc >= 23
                return (
                  <tr key={r.id} style={{ borderBottom: `1px solid ${T.border}`, background: i % 2 === 0 ? "transparent" : T.cardAlt }}>
                    <td style={{ padding: "9px 12px", color: T.text1, fontWeight: 600, maxWidth: 280 }}>
                      <div style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.nome}</div>
                    </td>
                    <td style={{ padding: "9px 12px" }}>
                      <span style={{ fontSize: 10, fontWeight: 700, color: "#7C3AED", background: "#EDE9FE", padding: "2px 8px", borderRadius: 20 }}>{r.setor}</span>
                    </td>
                    <td style={{ padding: "9px 12px", color: T.text1, fontWeight: 600, whiteSpace: "nowrap" }}>{fmtR(r.valorContrato)}</td>
                    <td style={{ padding: "9px 12px", color: T.text1, whiteSpace: "nowrap" }}>{fmtR(r.lucroEstimado)}</td>
                    <td style={{ padding: "9px 12px", fontWeight: 700, color: margemOk ? "#16A34A" : "#DC2626", whiteSpace: "nowrap" }}>{fmtN(r.margemPerc)}%</td>
                    <td style={{ padding: "9px 12px", color: T.text1, whiteSpace: "nowrap" }}>{fmtR(r.recebido)}</td>
                    <td style={{ padding: "9px 12px", whiteSpace: "nowrap" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <div style={{ width: 60, height: 6, background: T.grid, borderRadius: 99 }}>
                          <div style={{ height: "100%", width: `${Math.min(r.percRecebido, 100)}%`, background: "#7C3AED", borderRadius: 99 }} />
                        </div>
                        <span style={{ color: T.text2 }}>{fmtN(r.percRecebido)}%</span>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </Secao>
    </div>
  )
}
