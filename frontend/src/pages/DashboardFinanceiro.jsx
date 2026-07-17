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

function exportarExcel(dados) {
  if (!dados) return
  const { kpis, receitaMensal, rentabilidade, aging, fluxoCaixa90, setores } = dados

  const csvBlocks = []

  csvBlocks.push("KPIs FINANCEIROS")
  csvBlocks.push("Carteira Aprovada;Recebido;A Receber;Em Atraso")
  csvBlocks.push([kpis.totalCarteira, kpis.totalRecebido, kpis.totalAReceber, kpis.totalAtrasado].join(";"))
  csvBlocks.push("")

  csvBlocks.push("RECEITA MENSAL (18 meses)")
  csvBlocks.push("Mês;Recebido (R$);Previsto (R$)")
  receitaMensal.forEach(r => csvBlocks.push(`${r.mes};${r.recebido};${r.previsto}`))
  csvBlocks.push("")

  csvBlocks.push("FLUXO DE CAIXA - PRÓXIMOS 90 DIAS")
  csvBlocks.push("Mês;Valor (R$);Qtd Medições")
  fluxoCaixa90.forEach(f => csvBlocks.push(`${f.mes};${f.valor};${f.qtd}`))
  csvBlocks.push("")

  csvBlocks.push("INADIMPLÊNCIA / AGING")
  csvBlocks.push("Faixa;Valor (R$)")
  csvBlocks.push(`Até 30 dias;${aging.ate30}`)
  csvBlocks.push(`31 a 60 dias;${aging.de31a60}`)
  csvBlocks.push(`61 a 90 dias;${aging.de61a90}`)
  csvBlocks.push(`Acima de 90 dias;${aging.acima90}`)
  csvBlocks.push("")

  csvBlocks.push("RENTABILIDADE POR SETOR")
  csvBlocks.push("Setor;Qtd Projetos;Carteira (R$);Lucro Est. (R$);Margem Média (%)")
  setores.forEach(s => csvBlocks.push(`${s.setor};${s.qtd};${s.carteira};${s.lucro};${s.margemMedia}`))
  csvBlocks.push("")

  csvBlocks.push("RENTABILIDADE POR PROJETO")
  csvBlocks.push("Projeto;Setor;Contrato (R$);Lucro Est. (R$);Margem (%);Recebido (R$);% Recebido")
  rentabilidade.forEach(r => csvBlocks.push(`${r.nome};${r.setor};${r.valorContrato};${r.lucroEstimado};${r.margemPerc};${r.recebido};${r.percRecebido}`))

  const csv = "﻿" + csvBlocks.join("\n")
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" })
  const url = URL.createObjectURL(blob)
  const a = document.createElement("a")
  a.href = url; a.download = `Dashboard_Financeiro_${new Date().toISOString().slice(0,10)}.csv`; a.click()
  URL.revokeObjectURL(url)
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
        <button onClick={() => exportarExcel(dados)}
          style={{ display: "flex", alignItems: "center", gap: 6, padding: "7px 14px", borderRadius: 8, border: "1.5px solid #BBF7D0", background: "#F0FDF4", color: "#15803D", fontWeight: 700, fontSize: 13, cursor: "pointer" }}>
          <Download size={14} /> Exportar CSV
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
