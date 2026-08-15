import { useState, useEffect, useMemo } from "react"
import { useNavigate } from "react-router-dom"
import { toast } from "react-hot-toast"
import api from "../utils/api"
import { useTheme } from "../contexts/ThemeContext"

const fmt = (v) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v || 0)
const fmtN = (v, dec = 1) => Number(v || 0).toFixed(dec)

function useColors() {
  const { isDark } = useTheme()
  return {
    bg:        isDark ? '#0F172A' : '#F8FAFC',
    surface:   isDark ? '#1E293B' : '#ffffff',
    surface2:  isDark ? '#253348' : '#F8FAFC',
    border:    isDark ? '#334155' : '#E2E8F0',
    borderSoft:isDark ? '#2A3A52' : '#F1F5F9',
    text:      isDark ? '#F1F5F9' : '#0F172A',
    textMuted: isDark ? '#94A3B8' : '#475569',
    textFaint: isDark ? '#64748B' : '#94A3B8',
    inputBg:   isDark ? '#1E293B' : '#F8FAFC',
    hover:     isDark ? '#253348' : '#F8FAFC',
  }
}

function KpiCard({ label, value, sub, style = "none", c }) {
  const styles = {
    ok:   { bg: isDarkBg(c) ? '#14532D' : '#F0FDF4', border: isDarkBg(c) ? '#166534' : '#86EFAC', color: '#4ADE80' },
    warn: { bg: isDarkBg(c) ? '#78350F' : '#FFFBEB', border: isDarkBg(c) ? '#92400E' : '#FDE68A', color: '#FCD34D' },
    bad:  { bg: isDarkBg(c) ? '#7F1D1D' : '#FEF2F2', border: isDarkBg(c) ? '#991B1B' : '#FECACA', color: '#F87171' },
    none: { bg: c.surface,                            border: c.border,                             color: c.textMuted },
  }
  const s = styles[style] || styles.none
  return (
    <div style={{ background: s.bg, border: `1px solid ${s.border}`, borderRadius: 12, padding: "14px 18px" }}>
      <div style={{ fontSize: 10, fontWeight: 700, color: c.textFaint, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 16, fontWeight: 900, color: s.color, wordBreak: "break-word", lineHeight: 1.2 }}>{value}</div>
      {sub && <div style={{ fontSize: 11, color: c.textFaint, marginTop: 4 }}>{sub}</div>}
    </div>
  )
}

function isDarkBg(c) {
  return c.surface === '#1E293B'
}

function BarOC({ contratado, budget, entregue }) {
  if (!budget) return <span style={{ fontSize: 12, color: "#94A3B8" }}>Sem orçamento</span>
  const percContratado = Math.min((contratado / budget) * 100, 100)
  const percEntregue = Math.min((entregue / budget) * 100, 100)
  const over = contratado > budget
  return (
    <div style={{ width: "100%" }}>
      <div style={{ height: 8, background: "#334155", borderRadius: 4, overflow: "hidden", position: "relative" }}>
        <div style={{ position: "absolute", left: 0, top: 0, height: "100%", width: `${percEntregue}%`, background: "#15803D", borderRadius: 4 }} />
        <div style={{ position: "absolute", left: `${percEntregue}%`, top: 0, height: "100%", width: `${Math.max(percContratado - percEntregue, 0)}%`, background: over ? "#DC2626" : "#FCD34D", borderRadius: 4 }} />
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", marginTop: 4, fontSize: 10, color: "#94A3B8" }}>
        <span>Entregue: {fmt(entregue)}</span>
        <span style={{ color: over ? "#F87171" : "#94A3B8" }}>Contratado: {fmt(contratado)} / Budget: {fmt(budget)}</span>
      </div>
    </div>
  )
}

function CategoriaRow({ label, nivel, total, lista, cor, c }) {
  const [open, setOpen] = useState(false)
  return (
    <div style={{ borderRadius: 10, border: `1px solid ${c.borderSoft}`, overflow: "hidden", marginBottom: 6 }}>
      <div onClick={() => lista.length > 0 && setOpen(!open)}
        style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 14px", background: c.surface2, cursor: lista.length > 0 ? "pointer" : "default" }}>
        <span style={{ fontSize: 11, fontWeight: 800, padding: "2px 8px", borderRadius: 6, background: cor.bg, color: cor.color, border: `1px solid ${cor.border}`, whiteSpace: "nowrap" }}>{nivel}</span>
        <span style={{ fontSize: 13, fontWeight: 600, color: c.textMuted, flex: 1 }}>{label}</span>
        <span style={{ fontSize: 14, fontWeight: 800, color: cor.color }}>{fmt(total)}</span>
        {lista.length > 0 && <span style={{ fontSize: 11, color: c.textFaint }}>{open ? "▲" : "▼"} {lista.length} lançamentos</span>}
      </div>
      {open && lista.length > 0 && (
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ background: c.surface2 }}>
                {["Descrição", "Profissional", "Valor", "Vencimento", "Situação"].map(h => (
                  <th key={h} style={{ padding: "7px 12px", fontSize: 10, fontWeight: 700, color: c.textFaint, textAlign: "left", textTransform: "uppercase" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {lista.map((l, i) => (
                <tr key={i} style={{ borderTop: `1px solid ${c.borderSoft}` }}>
                  <td style={{ padding: "8px 12px", fontSize: 12, color: c.text }}>{l.Descricao || "—"}</td>
                  <td style={{ padding: "8px 12px", fontSize: 11, color: "#7C3AED", fontWeight: 700 }}>{l.Profissional || "—"}</td>
                  <td style={{ padding: "8px 12px", fontSize: 12, fontWeight: 700, color: c.text }}>{fmt(l.Valor)}</td>
                  <td style={{ padding: "8px 12px", fontSize: 11, color: c.textFaint }}>{l.Data_Vencimento || "—"}</td>
                  <td style={{ padding: "8px 12px" }}>
                    <span style={{ fontSize: 10, fontWeight: 700, padding: "2px 6px", borderRadius: 5,
                      background: l.Situacao === "Liquidado" ? "#14532D" : "#78350F",
                      color:      l.Situacao === "Liquidado" ? "#4ADE80" : "#FCD34D" }}>
                      {l.Situacao || "—"}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

function PvECard({ grupo, c }) {
  const [open, setOpen] = useState(false)
  const { label, cor, planejado, executado, variacao, percExec, detalhes, tipo } = grupo
  const isReceita = tipo === 'receita'
  const overBudget = !isReceita && variacao > 0
  const underReceita = isReceita && variacao < 0
  const alert = overBudget || underReceita
  const ok = !alert && (planejado > 0 || executado > 0)
  const execPct = percExec != null ? Math.min(percExec, 200) : 0

  const cardBg    = alert ? '#7F1D1D' : ok ? '#14532D' : c.surface2
  const cardBorder= alert ? '#991B1B' : ok ? '#166534' : c.border

  return (
    <div style={{ borderRadius: 12, border: `1.5px solid ${cardBorder}`, overflow: 'hidden', marginBottom: 8 }}>
      <div onClick={() => detalhes.length > 0 && setOpen(!open)}
        style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px', background: cardBg, cursor: detalhes.length > 0 ? 'pointer' : 'default', flexWrap: 'wrap' }}>
        <span style={{ width: 10, height: 10, borderRadius: '50%', background: cor, flexShrink: 0 }} />
        <span style={{ flex: 1, fontSize: 13, fontWeight: 700, color: c.text, minWidth: 120 }}>{label}</span>
        <div style={{ display: 'flex', gap: 16, alignItems: 'center', flexWrap: 'wrap' }}>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: 10, color: c.textFaint, fontWeight: 600, textTransform: 'uppercase' }}>Planejado</div>
            <div style={{ fontSize: 12, fontWeight: 700, color: c.textMuted }}>{fmt(planejado)}</div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: 10, color: c.textFaint, fontWeight: 600, textTransform: 'uppercase' }}>Executado</div>
            <div style={{ fontSize: 12, fontWeight: 800, color: executado > 0 ? c.text : c.textFaint }}>{fmt(executado)}</div>
          </div>
          <div style={{ textAlign: 'right', minWidth: 80 }}>
            <div style={{ fontSize: 10, color: c.textFaint, fontWeight: 600, textTransform: 'uppercase' }}>Variação</div>
            <div style={{ fontSize: 12, fontWeight: 800, color: alert ? '#F87171' : ok ? '#4ADE80' : c.textMuted }}>
              {variacao >= 0 ? '+' : ''}{fmt(variacao)}
            </div>
          </div>
          <div style={{ width: 48, textAlign: 'right' }}>
            <div style={{ fontSize: 10, color: c.textFaint, fontWeight: 600, textTransform: 'uppercase' }}>%</div>
            <div style={{ fontSize: 12, fontWeight: 700, color: alert ? '#F87171' : c.textMuted }}>
              {percExec != null ? `${percExec.toFixed(0)}%` : '—'}
            </div>
          </div>
          {percExec != null && (
            <div style={{ width: 60 }}>
              <div style={{ height: 6, background: c.border, borderRadius: 3, overflow: 'hidden' }}>
                <div style={{ height: '100%', width: `${execPct / 2}%`, background: alert ? '#EF4444' : ok ? '#22C55E' : '#94A3B8', borderRadius: 3, transition: 'width 0.3s' }} />
              </div>
            </div>
          )}
        </div>
        {detalhes.length > 0 && <span style={{ fontSize: 11, color: c.textFaint, marginLeft: 4 }}>{open ? '▲' : '▼'} {detalhes.length}</span>}
      </div>
      {open && (
        <div style={{ overflowX: 'auto', borderTop: `1px solid ${c.border}` }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: c.surface2 }}>
                {['Categoria', 'Descrição', 'Valor', 'Data', 'Situação'].map(h => (
                  <th key={h} style={{ padding: '6px 12px', fontSize: 10, fontWeight: 700, color: c.textFaint, textAlign: 'left', textTransform: 'uppercase' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {detalhes.map((d, i) => (
                <tr key={i} style={{ borderTop: `1px solid ${c.borderSoft}` }}>
                  <td style={{ padding: '7px 12px', fontSize: 11, fontWeight: 600, color: '#A78BFA' }}>{d.categoria || '—'}</td>
                  <td style={{ padding: '7px 12px', fontSize: 12, color: c.text }}>{d.descricao || '—'}</td>
                  <td style={{ padding: '7px 12px', fontSize: 12, fontWeight: 700, color: c.text }}>{fmt(d.valor)}</td>
                  <td style={{ padding: '7px 12px', fontSize: 11, color: c.textFaint }}>{d.data || '—'}</td>
                  <td style={{ padding: '7px 12px' }}>
                    <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 5,
                      background: d.situacao === 'Liquidado' ? '#14532D' : '#78350F',
                      color:      d.situacao === 'Liquidado' ? '#4ADE80'  : '#FCD34D' }}>
                      {d.situacao || '—'}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

export default function ExtratoProjeto() {
  const navigate = useNavigate()
  const c = useColors()
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [projetoSel, setProjetoSel] = useState(null)
  const [busca, setBusca] = useState("")
  const [filtroStatus, setFiltroStatus] = useState("")
  const [syncing, setSyncing] = useState(false)
  const [pve, setPve] = useState(null)
  const [pveLoading, setPveLoading] = useState(false)

  const carregar = () => {
    setLoading(true)
    api.get("/opp/extrato-por-projeto")
      .then(r => setData(r.data))
      .catch(() => toast.error("Erro ao carregar extrato"))
      .finally(() => setLoading(false))
  }

  useEffect(() => { carregar() }, [])

  useEffect(() => {
    if (!projetoSel) { setPve(null); return }
    setPveLoading(true)
    api.get(`/extrato/${projetoSel}`)
      .then(r => setPve(r.data))
      .catch(() => setPve(null))
      .finally(() => setPveLoading(false))
  }, [projetoSel])

  async function syncOPP() {
    setSyncing(true)
    try {
      await api.post("/opp/sync")
      toast.success("Sync concluído!")
      carregar()
    } catch { toast.error("Erro ao sincronizar") }
    finally { setSyncing(false) }
  }

  const projetos = useMemo(() => {
    if (!data?.projetos) return []
    return data.projetos.filter(p => {
      if (busca) {
        const q = busca.toLowerCase()
        if (!(p.nome || "").toLowerCase().includes(q) && !(p.centroCusto || "").toLowerCase().includes(q) && !(p.cliente || "").toLowerCase().includes(q)) return false
      }
      if (filtroStatus && p.status !== filtroStatus) return false
      return true
    })
  }, [data, busca, filtroStatus])

  const statusList = useMemo(() => [...new Set((data?.projetos || []).map(p => p.status).filter(Boolean))].sort(), [data])
  const proj = projetoSel ? data?.projetos?.find(p => p.id === projetoSel) : null

  const inputStyle = {
    padding: "7px 12px", borderRadius: 8, border: `1.5px solid ${c.border}`,
    fontSize: 13, fontFamily: "inherit", outline: "none",
    background: c.inputBg, color: c.text
  }

  return (
    <div style={{ padding: "28px 32px", maxWidth: 1400, margin: "0 auto" }}>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 24, flexWrap: "wrap", gap: 12 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 22, fontWeight: 800, color: c.text }}>Extrato Financeiro por Projeto</h1>
          <p style={{ margin: "6px 0 0", fontSize: 13, color: c.textFaint }}>
            Receitas (1.0) · Custos Diretos (2.0) · Despesas Operacionais (3.0) — agrupado por Centro de Custo (campo Profissional do OPP)
          </p>
        </div>
        <button onClick={syncOPP} disabled={syncing}
          style={{ padding: "9px 18px", borderRadius: 10, border: `1px solid ${c.border}`, background: c.surface, color: syncing ? c.textFaint : c.textMuted, fontWeight: 700, fontSize: 13, cursor: syncing ? "wait" : "pointer" }}>
          {syncing ? "Sincronizando..." : "Sync OPP"}
        </button>
      </div>

      {loading && <div style={{ textAlign: "center", padding: 80, color: c.textFaint }}>Carregando extrato...</div>}

      {!loading && data && !proj && (
        <>
          {/* KPIs globais */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))", gap: 12, marginBottom: 20 }}>
            <KpiCard c={c} label="Projetos Analisados" value={data.stats.total} sub={`${data.stats.comDados} com dados OPP`} />
            <KpiCard c={c} label="Total Receitas (1.0)" value={fmt(data.stats.totalReceitas)} style="ok" />
            <KpiCard c={c} label="Total Despesas" value={fmt(data.stats.totalDespesas)} style="bad" />
            <KpiCard c={c} label="Saldo" value={fmt(data.stats.totalReceitas - data.stats.totalDespesas)} style={data.stats.totalReceitas >= data.stats.totalDespesas ? "ok" : "bad"} />
            <KpiCard c={c} label="Sem dados OPP" value={data.stats.semDados} sub="CC não vinculado" style={data.stats.semDados > 0 ? "warn" : "none"} />
          </div>

          {/* Filtros */}
          <div style={{ background: c.surface, borderRadius: 12, padding: "12px 16px", border: `1px solid ${c.border}`, marginBottom: 16, display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
            <input value={busca} onChange={e => setBusca(e.target.value)} placeholder="Buscar por projeto, cliente ou centro de custo..."
              style={{ ...inputStyle, flex: 1, minWidth: 200 }} />
            <select value={filtroStatus} onChange={e => setFiltroStatus(e.target.value)} style={inputStyle}>
              <option value="">Todos os status</option>
              {statusList.map(s => <option key={s}>{s}</option>)}
            </select>
            <span style={{ fontSize: 12, color: c.textFaint, fontWeight: 600 }}>{projetos.length} projetos</span>
          </div>

          {/* Tabela resumo */}
          <div style={{ background: c.surface, borderRadius: 14, border: `1px solid ${c.border}`, overflow: "hidden" }}>
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 800 }}>
                <thead>
                  <tr style={{ background: c.surface2 }}>
                    {["Projeto", "Centro de Custo", "Status", "1.0 Receitas", "2.0 Custos Dir.", "3.0 Desp. Op.", "Saldo", "O.C. Budget", "O.C. Contratado", "Margem"].map(h => (
                      <th key={h} style={{ padding: "10px 14px", textAlign: "left", fontSize: 10, fontWeight: 700, color: c.textFaint, textTransform: "uppercase", whiteSpace: "nowrap" }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {projetos.length === 0 ? (
                    <tr><td colSpan={10} style={{ padding: "48px 0", textAlign: "center", color: c.textFaint }}>Nenhum projeto encontrado</td></tr>
                  ) : projetos.map((p, i) => {
                    const saldoOk = p.financeiro.saldo >= 0
                    const margemOk = p.financeiro.margemReal != null && p.financeiro.margemReal >= 23
                    const ocOverBudget = p.ocs.budget > 0 && p.ocs.contratado > p.ocs.budget
                    const rowBg = i % 2 === 0 ? c.surface : c.surface2
                    return (
                      <tr key={p.id} onClick={() => setProjetoSel(p.id)}
                        style={{ borderTop: `1px solid ${c.borderSoft}`, cursor: "pointer", background: rowBg }}
                        onMouseEnter={e => e.currentTarget.style.background = c.hover}
                        onMouseLeave={e => e.currentTarget.style.background = rowBg}>
                        <td style={{ padding: "11px 14px", maxWidth: 240 }}>
                          <div style={{ fontSize: 13, fontWeight: 700, color: c.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.nome}</div>
                          <div style={{ fontSize: 11, color: c.textFaint }}>{p.cliente}</div>
                        </td>
                        <td style={{ padding: "11px 14px", fontSize: 11, fontWeight: 700, whiteSpace: "nowrap" }}>
                          {p.centroCusto === "—"
                            ? <span style={{ color: "#F87171" }}>⚠ Não definido</span>
                            : <span style={{ color: "#A78BFA" }}>{p.centroCusto}</span>}
                        </td>
                        <td style={{ padding: "11px 14px" }}>
                          <span style={{ fontSize: 10, fontWeight: 700, padding: "2px 7px", borderRadius: 6, background: c.surface2, color: c.textMuted, border: `1px solid ${c.border}` }}>{p.status}</span>
                        </td>
                        <td style={{ padding: "11px 14px", fontSize: 12, fontWeight: 700, color: "#4ADE80", whiteSpace: "nowrap" }}>{fmt(p.financeiro.receitas10.total)}</td>
                        <td style={{ padding: "11px 14px", fontSize: 12, color: c.textMuted, whiteSpace: "nowrap" }}>{fmt(p.financeiro.custosDiretos20.total)}</td>
                        <td style={{ padding: "11px 14px", fontSize: 12, color: c.textMuted, whiteSpace: "nowrap" }}>{fmt(p.financeiro.despesasOp30.total)}</td>
                        <td style={{ padding: "11px 14px", fontSize: 12, fontWeight: 700, color: saldoOk ? "#4ADE80" : "#F87171", whiteSpace: "nowrap" }}>{fmt(p.financeiro.saldo)}</td>
                        <td style={{ padding: "11px 14px", fontSize: 12, color: c.textMuted, whiteSpace: "nowrap" }}>{p.ocs.budget > 0 ? fmt(p.ocs.budget) : "—"}</td>
                        <td style={{ padding: "11px 14px", fontSize: 12, fontWeight: 700, color: ocOverBudget ? "#F87171" : c.textMuted, whiteSpace: "nowrap" }}>{p.ocs.contratado > 0 ? fmt(p.ocs.contratado) : "—"}</td>
                        <td style={{ padding: "11px 14px" }}>
                          {p.financeiro.margemReal != null
                            ? <span style={{ fontSize: 12, fontWeight: 800, color: margemOk ? "#4ADE80" : "#F87171" }}>{fmtN(p.financeiro.margemReal)}%</span>
                            : <span style={{ fontSize: 11, color: c.textFaint }}>—</span>}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>

          <div style={{ marginTop: 12, fontSize: 12, color: c.textFaint }}>
            Clique em um projeto para ver o extrato detalhado com lançamentos e O.C.s.
          </div>
        </>
      )}

      {/* Detalhe do projeto */}
      {!loading && proj && (
        <>
          <button onClick={() => setProjetoSel(null)}
            style={{ marginBottom: 20, padding: "8px 16px", borderRadius: 9, border: `1px solid ${c.border}`, background: c.surface, color: c.textMuted, fontWeight: 700, fontSize: 13, cursor: "pointer" }}>
            ← Voltar à lista
          </button>

          {/* Header do projeto */}
          <div style={{ background: c.surface, borderRadius: 14, padding: "20px 24px", border: `1px solid ${c.border}`, marginBottom: 20 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 12 }}>
              <div style={{ flex: 1, minWidth: 200 }}>
                <div style={{ fontSize: 20, fontWeight: 900, color: c.text }}>{proj.nome}</div>
                <div style={{ fontSize: 13, color: c.textMuted, marginTop: 4 }}>
                  {proj.cliente} · <strong style={{ color: "#A78BFA" }}>CC: {proj.centroCusto}</strong> · {proj.status}
                </div>
                <div style={{ fontSize: 13, color: c.textMuted, marginTop: 4 }}>
                  Contrato: <strong style={{ color: c.text }}>{fmt(proj.valorContrato)}</strong>
                </div>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 10, minWidth: 260 }}>
                <KpiCard c={c} label="Receitas (1.0)" value={fmt(proj.financeiro.receitas10.total)} style="ok" />
                <KpiCard c={c} label="Despesas" value={fmt(proj.financeiro.totalDespesas)} style="bad" />
                <KpiCard c={c} label="Saldo" value={fmt(proj.financeiro.saldo)} style={proj.financeiro.saldo >= 0 ? "ok" : "bad"} />
                <KpiCard c={c} label="Margem Real" value={proj.financeiro.margemReal != null ? `${fmtN(proj.financeiro.margemReal)}%` : "—"}
                  style={proj.financeiro.margemReal >= 23 ? "ok" : proj.financeiro.margemReal != null ? "bad" : "none"}
                  sub={proj.financeiro.margemReal != null ? (proj.financeiro.margemReal >= 23 ? "✓ Conforme PAR" : "⚠ Abaixo de 23%") : "Sem dados"} />
              </div>
            </div>
          </div>

          {/* Lançamentos por categoria */}
          <div style={{ background: c.surface, borderRadius: 14, padding: "20px 24px", border: `1px solid ${c.border}`, marginBottom: 20 }}>
            <div style={{ fontWeight: 800, fontSize: 15, color: c.text, marginBottom: 14 }}>Lançamentos OPP por Categoria</div>
            {proj.semDados ? (
              <div style={{ textAlign: "center", padding: 40, background: "#78350F", borderRadius: 12, border: "1px solid #92400E", color: "#FCD34D" }}>
                <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 6 }}>⚠ Sem lançamentos vinculados no OPP</div>
                <div style={{ fontSize: 12 }}>Verifique se o <strong>Centro_Custo_OPP</strong> do projeto bate com o campo <strong>Profissional</strong> no OPP.</div>
                <div style={{ marginTop: 8, fontSize: 11 }}>Centro de Custo cadastrado: <strong>{proj.centroCusto}</strong></div>
              </div>
            ) : (
              <>
                <CategoriaRow c={c} nivel="1.0" label="Receitas" total={proj.financeiro.receitas10.total} lista={proj.financeiro.receitas10.lista} cor={{ bg: "#14532D", border: "#166534", color: "#4ADE80" }} />
                <CategoriaRow c={c} nivel="2.0" label="Custos Diretos de Projetos" total={proj.financeiro.custosDiretos20.total} lista={proj.financeiro.custosDiretos20.lista} cor={{ bg: "#7F1D1D", border: "#991B1B", color: "#F87171" }} />
                <CategoriaRow c={c} nivel="3.0" label="Despesas Operacionais" total={proj.financeiro.despesasOp30.total} lista={proj.financeiro.despesasOp30.lista} cor={{ bg: "#78350F", border: "#92400E", color: "#FCD34D" }} />
              </>
            )}
          </div>

          {/* Planejado x Executado */}
          <div style={{ background: c.surface, borderRadius: 14, padding: "20px 24px", border: `1px solid ${c.border}`, marginBottom: 20 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16, flexWrap: "wrap", gap: 8 }}>
              <div>
                <div style={{ fontWeight: 800, fontSize: 15, color: c.text }}>Planejado × Executado</div>
                <div style={{ fontSize: 12, color: c.textFaint, marginTop: 2 }}>Baseline do PAR vs. lançamentos reais no OPP</div>
              </div>
              {pve && (
                <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                  <span style={{ fontSize: 12, fontWeight: 700, padding: "4px 10px", borderRadius: 8, background: "#14532D", color: "#4ADE80", border: "1px solid #166534" }}>
                    Margem Plano: {pve.totais.margemPlano != null ? `${pve.totais.margemPlano.toFixed(1)}%` : "—"}
                  </span>
                  <span style={{ fontSize: 12, fontWeight: 700, padding: "4px 10px", borderRadius: 8,
                    background: pve.totais.margemReal != null && pve.totais.margemReal >= 23 ? "#14532D" : "#7F1D1D",
                    color:      pve.totais.margemReal != null && pve.totais.margemReal >= 23 ? "#4ADE80"  : "#F87171",
                    border:     `1px solid ${pve.totais.margemReal != null && pve.totais.margemReal >= 23 ? "#166534" : "#991B1B"}` }}>
                    Margem Real: {pve.totais.margemReal != null ? `${pve.totais.margemReal.toFixed(1)}%` : "—"}
                  </span>
                </div>
              )}
            </div>
            {pveLoading && <div style={{ textAlign: "center", padding: 32, color: c.textFaint }}>Carregando comparativo...</div>}
            {!pveLoading && !pve && (
              <div style={{ textAlign: "center", padding: 32, background: "#78350F", borderRadius: 10, border: "1px solid #92400E", color: "#FCD34D", fontSize: 13 }}>
                Sem baseline cadastrado — salve um Planejamento Financeiro para ver o comparativo.
              </div>
            )}
            {!pveLoading && pve && pve.grupos.length === 0 && (
              <div style={{ textAlign: "center", padding: 32, color: c.textFaint, fontSize: 13 }}>
                Nenhum dado disponível (baseline vazio e sem lançamentos OPP vinculados).
              </div>
            )}
            {!pveLoading && pve && pve.grupos.length > 0 && (
              <>
                <div style={{ display: "flex", gap: 8, padding: "0 16px 10px", borderBottom: `1px solid ${c.border}`, marginBottom: 10 }}>
                  <span style={{ flex: 1, fontSize: 11, fontWeight: 700, color: c.textMuted, textTransform: "uppercase" }}>Categoria</span>
                  <span style={{ width: 110, fontSize: 11, fontWeight: 700, color: c.textMuted, textTransform: "uppercase", textAlign: "right" }}>Planejado</span>
                  <span style={{ width: 110, fontSize: 11, fontWeight: 700, color: c.textMuted, textTransform: "uppercase", textAlign: "right" }}>Executado</span>
                  <span style={{ width: 110, fontSize: 11, fontWeight: 700, color: c.textMuted, textTransform: "uppercase", textAlign: "right" }}>Variação</span>
                  <span style={{ width: 50, fontSize: 11, fontWeight: 700, color: c.textMuted, textTransform: "uppercase", textAlign: "right" }}>%</span>
                  <span style={{ width: 60 }} />
                  <span style={{ width: 36 }} />
                </div>
                {pve.grupos.map(g => <PvECard key={g.key} grupo={g} c={c} />)}
                <div style={{ marginTop: 14, display: "flex", gap: 12, flexWrap: "wrap" }}>
                  <div style={{ padding: "8px 14px", borderRadius: 8, background: "#14532D", border: "1px solid #166534", fontSize: 12, color: "#4ADE80", fontWeight: 700 }}>
                    Receita exec.: {fmt(pve.totais.totalReceita)}
                  </div>
                  <div style={{ padding: "8px 14px", borderRadius: 8, background: "#7F1D1D", border: "1px solid #991B1B", fontSize: 12, color: "#F87171", fontWeight: 700 }}>
                    Custos exec.: {fmt(pve.totais.totalCustos)}
                  </div>
                  <div style={{ padding: "8px 14px", borderRadius: 8,
                    background: pve.totais.totalReceita - pve.totais.totalCustos >= 0 ? "#14532D" : "#7F1D1D",
                    border: `1px solid ${pve.totais.totalReceita - pve.totais.totalCustos >= 0 ? "#166534" : "#991B1B"}`,
                    fontSize: 12, fontWeight: 700,
                    color: pve.totais.totalReceita - pve.totais.totalCustos >= 0 ? "#4ADE80" : "#F87171" }}>
                    Saldo real: {fmt(pve.totais.totalReceita - pve.totais.totalCustos)}
                  </div>
                  <div style={{ padding: "8px 14px", borderRadius: 8, background: c.surface2, border: `1px solid ${c.border}`, fontSize: 12, color: c.textFaint }}>
                    {pve.totalLancamentos} lançamentos OPP vinculados
                  </div>
                </div>
              </>
            )}
          </div>

          {/* O.C.s */}
          <div style={{ background: c.surface, borderRadius: 14, padding: "20px 24px", border: `1px solid ${c.border}`, marginBottom: 20 }}>
            <div style={{ fontWeight: 800, fontSize: 15, color: c.text, marginBottom: 14 }}>Ordens de Compra (O.C.) — Terceirizados</div>
            {proj.ocs.lista.length === 0 ? (
              <div style={{ textAlign: "center", padding: 32, color: c.textFaint, fontSize: 13 }}>Nenhuma O.C. registrada para este projeto.</div>
            ) : (
              <>
                <div style={{ marginBottom: 16 }}>
                  <BarOC contratado={proj.ocs.contratado} budget={proj.ocs.budget} entregue={proj.ocs.entregue} />
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 10, marginBottom: 14 }}>
                  <KpiCard c={c} label="Budget Terceirizados" value={fmt(proj.ocs.budget)} />
                  <KpiCard c={c} label="O.C.s Contratadas" value={fmt(proj.ocs.contratado)} style={proj.ocs.percBudget > 100 ? "bad" : proj.ocs.percBudget > 80 ? "warn" : "ok"} sub={`${fmtN(proj.ocs.percBudget)}% do budget`} />
                  <KpiCard c={c} label="Pendente Entrega" value={fmt(proj.ocs.pendente)} style={proj.ocs.pendente > 0 ? "warn" : "ok"} />
                </div>
                <div style={{ overflowX: "auto" }}>
                  <table style={{ width: "100%", borderCollapse: "collapse" }}>
                    <thead>
                      <tr style={{ background: c.surface2 }}>
                        {["Fornecedor", "Serviço", "O.C.", "Valor", "Status"].map(h => (
                          <th key={h} style={{ padding: "9px 14px", textAlign: "left", fontSize: 10, fontWeight: 700, color: c.textFaint, textTransform: "uppercase" }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {proj.ocs.lista.map((oc, i) => (
                        <tr key={i} style={{ borderTop: `1px solid ${c.borderSoft}` }}>
                          <td style={{ padding: "10px 14px", fontSize: 13, fontWeight: 600, color: c.text }}>{oc.fornecedor || "—"}</td>
                          <td style={{ padding: "10px 14px", fontSize: 12, color: c.textMuted }}>{oc.servico || "—"}</td>
                          <td style={{ padding: "10px 14px", fontSize: 12, fontWeight: 700, color: "#A78BFA" }}>{oc.oc}</td>
                          <td style={{ padding: "10px 14px", fontSize: 13, fontWeight: 700, color: c.text }}>{fmt(oc.valor)}</td>
                          <td style={{ padding: "10px 14px" }}>
                            <span style={{ fontSize: 11, fontWeight: 700, padding: "3px 8px", borderRadius: 6,
                              background: oc.status === "Entregue" ? "#14532D" : oc.status === "Cancelado" ? "#7F1D1D" : oc.status === "Solicitado" ? "#78350F" : "#1E1B4B",
                              color:      oc.status === "Entregue" ? "#4ADE80"  : oc.status === "Cancelado" ? "#F87171"  : oc.status === "Solicitado" ? "#FCD34D"  : "#A5B4FC"
                            }}>{oc.status || "—"}</span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </div>

          {/* Ações */}
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <button onClick={() => navigate(`/planejamento/${proj.id}`)}
              style={{ padding: "10px 20px", borderRadius: 10, border: "1px solid #3730A3", background: "#1E1B4B", color: "#A5B4FC", fontWeight: 700, fontSize: 13, cursor: "pointer" }}>
              Ver Planejamento
            </button>
            <button onClick={() => navigate(`/acompanhamento?projeto=${proj.id}`)}
              style={{ padding: "10px 20px", borderRadius: 10, border: "1px solid #166534", background: "#14532D", color: "#4ADE80", fontWeight: 700, fontSize: 13, cursor: "pointer" }}>
              Ver Acompanhamento
            </button>
            <button onClick={() => navigate(`/checklist`)}
              style={{ padding: "10px 20px", borderRadius: 10, border: "1px solid #92400E", background: "#78350F", color: "#FCD34D", fontWeight: 700, fontSize: 13, cursor: "pointer" }}>
              Checklist
            </button>
          </div>
        </>
      )}
    </div>
  )
}
