import { useState, useEffect, useMemo } from "react"
import { useNavigate } from "react-router-dom"
import { toast } from "react-hot-toast"
import api from "../utils/api"

const fmt = (v) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v || 0)
const fmtN = (v, dec = 1) => Number(v || 0).toFixed(dec)

const STATUS_PAR = {
  ok:   { bg: "#F0FDF4", border: "#86EFAC", color: "#15803D" },
  warn: { bg: "#FFFBEB", border: "#FDE68A", color: "#92400E" },
  bad:  { bg: "#FEF2F2", border: "#FECACA", color: "#991B1B" },
  none: { bg: "#F8FAFC", border: "#E2E8F0", color: "#64748B" },
}

function KpiCard({ label, value, sub, style = "none" }) {
  const s = STATUS_PAR[style]
  return (
    <div style={{ background: s.bg, border: `1px solid ${s.border}`, borderRadius: 12, padding: "14px 18px" }}>
      <div style={{ fontSize: 10, fontWeight: 700, color: "#64748B", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 22, fontWeight: 900, color: s.color }}>{value}</div>
      {sub && <div style={{ fontSize: 11, color: "#94A3B8", marginTop: 2 }}>{sub}</div>}
    </div>
  )
}

function BarOC({ contratado, budget, entregue }) {
  if (!budget) return <span style={{ fontSize: 12, color: "#94A3B8" }}>Sem orçamento</span>
  const percContratado = Math.min((contratado / budget) * 100, 100)
  const percEntregue = Math.min((entregue / budget) * 100, 100)
  const over = contratado > budget
  return (
    <div style={{ width: "100%" }}>
      <div style={{ height: 8, background: "#F1F5F9", borderRadius: 4, overflow: "hidden", position: "relative" }}>
        <div style={{ position: "absolute", left: 0, top: 0, height: "100%", width: `${percEntregue}%`, background: "#15803D", borderRadius: 4 }} />
        <div style={{ position: "absolute", left: `${percEntregue}%`, top: 0, height: "100%", width: `${Math.max(percContratado - percEntregue, 0)}%`, background: over ? "#DC2626" : "#FCD34D", borderRadius: 4 }} />
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", marginTop: 4, fontSize: 10, color: "#64748B" }}>
        <span>Entregue: {fmt(entregue)}</span>
        <span style={{ color: over ? "#DC2626" : "#475569" }}>Contratado: {fmt(contratado)} / Budget: {fmt(budget)}</span>
      </div>
    </div>
  )
}

function CategoriaRow({ label, nivel, total, lista, cor }) {
  const [open, setOpen] = useState(false)
  return (
    <div style={{ borderRadius: 10, border: "1px solid #F1F5F9", overflow: "hidden", marginBottom: 6 }}>
      <div onClick={() => lista.length > 0 && setOpen(!open)} style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 14px", background: "#F8FAFC", cursor: lista.length > 0 ? "pointer" : "default" }}>
        <span style={{ fontSize: 11, fontWeight: 800, padding: "2px 8px", borderRadius: 6, background: cor.bg, color: cor.color, border: `1px solid ${cor.border}`, whiteSpace: "nowrap" }}>{nivel}</span>
        <span style={{ fontSize: 13, fontWeight: 600, color: "#475569", flex: 1 }}>{label}</span>
        <span style={{ fontSize: 14, fontWeight: 800, color: cor.color }}>{fmt(total)}</span>
        {lista.length > 0 && <span style={{ fontSize: 11, color: "#94A3B8" }}>{open ? "▲" : "▼"} {lista.length} lançamentos</span>}
      </div>
      {open && lista.length > 0 && (
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ background: "#FAFAFA" }}>
                {["Descrição", "Profissional", "Valor", "Vencimento", "Situação"].map(h => (
                  <th key={h} style={{ padding: "7px 12px", fontSize: 10, fontWeight: 700, color: "#94A3B8", textAlign: "left", textTransform: "uppercase" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {lista.map((l, i) => (
                <tr key={i} style={{ borderTop: "1px solid #F1F5F9" }}>
                  <td style={{ padding: "8px 12px", fontSize: 12, color: "#334155" }}>{l.Descricao || "—"}</td>
                  <td style={{ padding: "8px 12px", fontSize: 11, color: "#7C3AED", fontWeight: 700 }}>{l.Profissional || "—"}</td>
                  <td style={{ padding: "8px 12px", fontSize: 12, fontWeight: 700, color: "#0F172A" }}>{fmt(l.Valor)}</td>
                  <td style={{ padding: "8px 12px", fontSize: 11, color: "#94A3B8" }}>{l.Data_Vencimento || "—"}</td>
                  <td style={{ padding: "8px 12px" }}>
                    <span style={{ fontSize: 10, fontWeight: 700, padding: "2px 6px", borderRadius: 5, background: l.Situacao === "Liquidado" ? "#DCFCE7" : "#FEF3C7", color: l.Situacao === "Liquidado" ? "#15803D" : "#D97706" }}>
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

function PvECard({ grupo }) {
  const [open, setOpen] = useState(false)
  const { label, cor, planejado, executado, variacao, percExec, detalhes, tipo } = grupo
  const isReceita = tipo === 'receita'
  const overBudget = !isReceita && variacao > 0
  const underReceita = isReceita && variacao < 0
  const alert = overBudget || underReceita
  const ok = !alert && (planejado > 0 || executado > 0)
  const execPct = percExec != null ? Math.min(percExec, 200) : 0

  return (
    <div style={{ borderRadius: 12, border: `1.5px solid ${alert ? '#FECACA' : ok ? '#BBF7D0' : '#E2E8F0'}`, overflow: 'hidden', marginBottom: 8 }}>
      <div onClick={() => detalhes.length > 0 && setOpen(!open)}
        style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px', background: alert ? '#FEF2F2' : ok ? '#F0FDF4' : '#F8FAFC', cursor: detalhes.length > 0 ? 'pointer' : 'default' }}>
        <span style={{ width: 10, height: 10, borderRadius: '50%', background: cor, flexShrink: 0 }} />
        <span style={{ flex: 1, fontSize: 13, fontWeight: 700, color: '#0F172A' }}>{label}</span>
        <div style={{ display: 'flex', gap: 24, alignItems: 'center' }}>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: 10, color: '#94A3B8', fontWeight: 600, textTransform: 'uppercase' }}>Planejado</div>
            <div style={{ fontSize: 13, fontWeight: 700, color: '#475569' }}>{fmt(planejado)}</div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: 10, color: '#94A3B8', fontWeight: 600, textTransform: 'uppercase' }}>Executado</div>
            <div style={{ fontSize: 13, fontWeight: 800, color: executado > 0 ? '#0F172A' : '#94A3B8' }}>{fmt(executado)}</div>
          </div>
          <div style={{ textAlign: 'right', minWidth: 80 }}>
            <div style={{ fontSize: 10, color: '#94A3B8', fontWeight: 600, textTransform: 'uppercase' }}>Variação</div>
            <div style={{ fontSize: 13, fontWeight: 800, color: alert ? '#DC2626' : ok ? '#15803D' : '#475569' }}>
              {variacao >= 0 ? '+' : ''}{fmt(variacao)}
            </div>
          </div>
          <div style={{ width: 64, textAlign: 'right' }}>
            <div style={{ fontSize: 10, color: '#94A3B8', fontWeight: 600, textTransform: 'uppercase' }}>%</div>
            <div style={{ fontSize: 12, fontWeight: 700, color: alert ? '#DC2626' : '#475569' }}>
              {percExec != null ? `${percExec.toFixed(0)}%` : '—'}
            </div>
          </div>
          {percExec != null && (
            <div style={{ width: 80 }}>
              <div style={{ height: 6, background: '#E2E8F0', borderRadius: 3, overflow: 'hidden' }}>
                <div style={{ height: '100%', width: `${execPct / 2}%`, background: alert ? '#EF4444' : ok ? '#22C55E' : '#94A3B8', borderRadius: 3, transition: 'width 0.3s' }} />
              </div>
            </div>
          )}
        </div>
        {detalhes.length > 0 && <span style={{ fontSize: 11, color: '#94A3B8', marginLeft: 8 }}>{open ? '▲' : '▼'} {detalhes.length}</span>}
      </div>
      {open && (
        <div style={{ overflowX: 'auto', borderTop: '1px solid #F1F5F9' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: '#FAFAFA' }}>
                {['Categoria', 'Descrição', 'Valor', 'Data', 'Situação'].map(h => (
                  <th key={h} style={{ padding: '6px 12px', fontSize: 10, fontWeight: 700, color: '#94A3B8', textAlign: 'left', textTransform: 'uppercase' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {detalhes.map((d, i) => (
                <tr key={i} style={{ borderTop: '1px solid #F1F5F9' }}>
                  <td style={{ padding: '7px 12px', fontSize: 11, fontWeight: 600, color: '#7C3AED' }}>{d.categoria || '—'}</td>
                  <td style={{ padding: '7px 12px', fontSize: 12, color: '#334155' }}>{d.descricao || '—'}</td>
                  <td style={{ padding: '7px 12px', fontSize: 12, fontWeight: 700, color: '#0F172A' }}>{fmt(d.valor)}</td>
                  <td style={{ padding: '7px 12px', fontSize: 11, color: '#94A3B8' }}>{d.data || '—'}</td>
                  <td style={{ padding: '7px 12px' }}>
                    <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 5,
                      background: d.situacao === 'Liquidado' ? '#DCFCE7' : '#FEF3C7',
                      color:      d.situacao === 'Liquidado' ? '#15803D'  : '#D97706' }}>
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

  return (
    <div style={{ padding: "28px 32px", maxWidth: 1400, margin: "0 auto" }}>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 24 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 22, fontWeight: 800, color: "#0F172A" }}>Extrato Financeiro por Projeto</h1>
          <p style={{ margin: "6px 0 0", fontSize: 13, color: "#64748B" }}>
            Receitas (1.0) · Custos Diretos (2.0) · Despesas Operacionais (3.0) — agrupado por Centro de Custo (campo Profissional do OPP)
          </p>
        </div>
        <button onClick={syncOPP} disabled={syncing} style={{ padding: "9px 18px", borderRadius: 10, border: "1px solid #E2E8F0", background: "#fff", color: syncing ? "#94A3B8" : "#475569", fontWeight: 700, fontSize: 13, cursor: syncing ? "wait" : "pointer" }}>
          {syncing ? "Sincronizando..." : "Sync OPP"}
        </button>
      </div>

      {loading && <div style={{ textAlign: "center", padding: 80, color: "#94A3B8" }}>Carregando extrato...</div>}

      {!loading && data && !proj && (
        <>
          {/* KPIs globais */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))", gap: 12, marginBottom: 20 }}>
            <KpiCard label="Projetos Analisados" value={data.stats.total} sub={`${data.stats.comDados} com dados OPP`} />
            <KpiCard label="Total Receitas (1.0)" value={fmt(data.stats.totalReceitas)} style="ok" />
            <KpiCard label="Total Despesas (2.0+3.0)" value={fmt(data.stats.totalDespesas)} style="bad" />
            <KpiCard label="Saldo" value={fmt(data.stats.totalReceitas - data.stats.totalDespesas)} style={data.stats.totalReceitas >= data.stats.totalDespesas ? "ok" : "bad"} />
            <KpiCard label="Sem dados OPP" value={data.stats.semDados} sub="Centro de custo não vinculado" style={data.stats.semDados > 0 ? "warn" : "none"} />
          </div>

          {/* Filtros */}
          <div style={{ background: "#fff", borderRadius: 12, padding: "12px 16px", border: "1px solid #E2E8F0", marginBottom: 16, display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
            <input value={busca} onChange={e => setBusca(e.target.value)} placeholder="Buscar por projeto, cliente ou centro de custo..."
              style={{ flex: 1, minWidth: 220, padding: "7px 12px", borderRadius: 8, border: "1.5px solid #E2E8F0", fontSize: 13, fontFamily: "inherit", outline: "none", background: "#F8FAFC", color: "#0F172A" }} />
            <select value={filtroStatus} onChange={e => setFiltroStatus(e.target.value)}
              style={{ padding: "7px 12px", borderRadius: 8, border: "1.5px solid #E2E8F0", fontSize: 13, fontFamily: "inherit", outline: "none", background: "#F8FAFC", color: "#0F172A" }}>
              <option value="">Todos os status</option>
              {statusList.map(s => <option key={s}>{s}</option>)}
            </select>
            <span style={{ fontSize: 12, color: "#94A3B8", fontWeight: 600 }}>{projetos.length} projetos</span>
          </div>

          {/* Tabela resumo */}
          <div style={{ background: "#fff", borderRadius: 14, border: "1px solid #E2E8F0", overflow: "hidden" }}>
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead>
                  <tr style={{ background: "#F8FAFC" }}>
                    {["Projeto", "Centro de Custo", "Status", "1.0 Receitas", "2.0 Custos Dir.", "3.0 Desp. Op.", "Saldo", "O.C. Budget", "O.C. Contratado", "Margem"].map(h => (
                      <th key={h} style={{ padding: "10px 14px", textAlign: "left", fontSize: 10, fontWeight: 700, color: "#94A3B8", textTransform: "uppercase", whiteSpace: "nowrap" }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {projetos.length === 0 ? (
                    <tr><td colSpan={10} style={{ padding: "48px 0", textAlign: "center", color: "#94A3B8" }}>Nenhum projeto encontrado</td></tr>
                  ) : projetos.map((p, i) => {
                    const saldoOk = p.financeiro.saldo >= 0
                    const margemOk = p.financeiro.margemReal != null && p.financeiro.margemReal >= 23
                    const ocOverBudget = p.ocs.budget > 0 && p.ocs.contratado > p.ocs.budget
                    return (
                      <tr key={p.id} onClick={() => setProjetoSel(p.id)} style={{ borderTop: "1px solid #F1F5F9", cursor: "pointer" }}
                        onMouseEnter={e => e.currentTarget.style.background = "#F8FAFC"}
                        onMouseLeave={e => e.currentTarget.style.background = i % 2 === 0 ? "#fff" : "#FAFAFA"}>
                        <td style={{ padding: "11px 14px" }}>
                          <div style={{ fontSize: 13, fontWeight: 700, color: "#0F172A" }}>{p.nome}</div>
                          <div style={{ fontSize: 11, color: "#94A3B8" }}>{p.cliente}</div>
                        </td>
                        <td style={{ padding: "11px 14px", fontSize: 11, color: "#7C3AED", fontWeight: 700 }}>
                          {p.centroCusto === "—" ? <span style={{ color: "#DC2626" }}>⚠ Não definido</span> : p.centroCusto}
                        </td>
                        <td style={{ padding: "11px 14px" }}>
                          <span style={{ fontSize: 10, fontWeight: 700, padding: "2px 7px", borderRadius: 6, background: "#F1F5F9", color: "#475569" }}>{p.status}</span>
                        </td>
                        <td style={{ padding: "11px 14px", fontSize: 12, fontWeight: 700, color: "#15803D" }}>{fmt(p.financeiro.receitas10.total)}</td>
                        <td style={{ padding: "11px 14px", fontSize: 12, color: "#475569" }}>{fmt(p.financeiro.custosDiretos20.total)}</td>
                        <td style={{ padding: "11px 14px", fontSize: 12, color: "#475569" }}>{fmt(p.financeiro.despesasOp30.total)}</td>
                        <td style={{ padding: "11px 14px", fontSize: 12, fontWeight: 700, color: saldoOk ? "#15803D" : "#DC2626" }}>{fmt(p.financeiro.saldo)}</td>
                        <td style={{ padding: "11px 14px", fontSize: 12, color: "#475569" }}>{p.ocs.budget > 0 ? fmt(p.ocs.budget) : "—"}</td>
                        <td style={{ padding: "11px 14px", fontSize: 12, fontWeight: 700, color: ocOverBudget ? "#DC2626" : "#475569" }}>{p.ocs.contratado > 0 ? fmt(p.ocs.contratado) : "—"}</td>
                        <td style={{ padding: "11px 14px" }}>
                          {p.financeiro.margemReal != null
                            ? <span style={{ fontSize: 12, fontWeight: 800, color: margemOk ? "#15803D" : "#DC2626" }}>{fmtN(p.financeiro.margemReal)}%</span>
                            : <span style={{ fontSize: 11, color: "#94A3B8" }}>—</span>}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>

          <div style={{ marginTop: 12, fontSize: 12, color: "#94A3B8" }}>
            💡 Clique em um projeto para ver o extrato detalhado com lançamentos e O.C.s.
          </div>
        </>
      )}

      {/* Detalhe do projeto */}
      {!loading && proj && (
        <>
          <button onClick={() => setProjetoSel(null)} style={{ marginBottom: 20, padding: "8px 16px", borderRadius: 9, border: "1px solid #E2E8F0", background: "#fff", color: "#475569", fontWeight: 700, fontSize: 13, cursor: "pointer" }}>
            ← Voltar à lista
          </button>

          {/* Header do projeto */}
          <div style={{ background: "#fff", borderRadius: 14, padding: "20px 24px", border: "1px solid #E2E8F0", marginBottom: 20 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 12 }}>
              <div>
                <div style={{ fontSize: 20, fontWeight: 900, color: "#0F172A" }}>{proj.nome}</div>
                <div style={{ fontSize: 13, color: "#64748B", marginTop: 4 }}>
                  {proj.cliente} · <strong style={{ color: "#7C3AED" }}>Centro de Custo: {proj.centroCusto}</strong> · {proj.status}
                </div>
                <div style={{ fontSize: 13, color: "#64748B", marginTop: 4 }}>
                  Contrato: <strong>{fmt(proj.valorContrato)}</strong>
                </div>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 10, minWidth: 300 }}>
                <KpiCard label="Receitas (1.0)" value={fmt(proj.financeiro.receitas10.total)} style="ok" />
                <KpiCard label="Despesas (2.0+3.0)" value={fmt(proj.financeiro.totalDespesas)} style="bad" />
                <KpiCard label="Saldo" value={fmt(proj.financeiro.saldo)} style={proj.financeiro.saldo >= 0 ? "ok" : "bad"} />
                <KpiCard label="Margem Real" value={proj.financeiro.margemReal != null ? `${fmtN(proj.financeiro.margemReal)}%` : "—"} style={proj.financeiro.margemReal >= 23 ? "ok" : proj.financeiro.margemReal != null ? "bad" : "none"} sub={proj.financeiro.margemReal != null ? (proj.financeiro.margemReal >= 23 ? "✓ Conforme PAR" : "⚠ Abaixo de 23%") : "Sem dados"} />
              </div>
            </div>
          </div>

          {/* Lançamentos por categoria */}
          <div style={{ background: "#fff", borderRadius: 14, padding: "20px 24px", border: "1px solid #E2E8F0", marginBottom: 20 }}>
            <div style={{ fontWeight: 800, fontSize: 15, color: "#0F172A", marginBottom: 14 }}>Lançamentos OPP por Categoria</div>
            {proj.semDados ? (
              <div style={{ textAlign: "center", padding: 40, background: "#FFFBEB", borderRadius: 12, border: "1px solid #FDE68A", color: "#92400E" }}>
                <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 6 }}>⚠ Sem lançamentos vinculados no OPP</div>
                <div style={{ fontSize: 12 }}>Verifique se o campo <strong>Centro_Custo_OPP</strong> do projeto bate com o campo <strong>Profissional</strong> lançado no OPP.</div>
                <div style={{ marginTop: 8, fontSize: 11, color: "#D97706" }}>Centro de Custo cadastrado: <strong>{proj.centroCusto}</strong></div>
              </div>
            ) : (
              <>
                <CategoriaRow nivel="1.0" label="Receitas" total={proj.financeiro.receitas10.total} lista={proj.financeiro.receitas10.lista} cor={{ bg: "#F0FDF4", border: "#86EFAC", color: "#15803D" }} />
                <CategoriaRow nivel="2.0" label="Custos Diretos de Projetos" total={proj.financeiro.custosDiretos20.total} lista={proj.financeiro.custosDiretos20.lista} cor={{ bg: "#FEF2F2", border: "#FECACA", color: "#991B1B" }} />
                <CategoriaRow nivel="3.0" label="Despesas Operacionais" total={proj.financeiro.despesasOp30.total} lista={proj.financeiro.despesasOp30.lista} cor={{ bg: "#FFFBEB", border: "#FDE68A", color: "#92400E" }} />
              </>
            )}
          </div>

          {/* Planejado x Executado */}
          <div style={{ background: "#fff", borderRadius: 14, padding: "20px 24px", border: "1px solid #E2E8F0", marginBottom: 20 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
              <div>
                <div style={{ fontWeight: 800, fontSize: 15, color: "#0F172A" }}>Planejado × Executado</div>
                <div style={{ fontSize: 12, color: "#64748B", marginTop: 2 }}>Baseline do PAR vs. lançamentos reais no OPP</div>
              </div>
              {pve && (
                <div style={{ display: "flex", gap: 10 }}>
                  <span style={{ fontSize: 12, fontWeight: 700, padding: "4px 10px", borderRadius: 8, background: "#F0FDF4", color: "#15803D", border: "1px solid #BBF7D0" }}>
                    Margem Plano: {pve.totais.margemPlano != null ? `${pve.totais.margemPlano.toFixed(1)}%` : "—"}
                  </span>
                  <span style={{ fontSize: 12, fontWeight: 700, padding: "4px 10px", borderRadius: 8,
                    background: pve.totais.margemReal != null && pve.totais.margemReal >= 23 ? "#F0FDF4" : "#FEF2F2",
                    color:      pve.totais.margemReal != null && pve.totais.margemReal >= 23 ? "#15803D"  : "#DC2626",
                    border:     `1px solid ${pve.totais.margemReal != null && pve.totais.margemReal >= 23 ? "#BBF7D0" : "#FECACA"}` }}>
                    Margem Real: {pve.totais.margemReal != null ? `${pve.totais.margemReal.toFixed(1)}%` : "—"}
                  </span>
                </div>
              )}
            </div>
            {pveLoading && <div style={{ textAlign: "center", padding: 32, color: "#94A3B8" }}>Carregando comparativo...</div>}
            {!pveLoading && !pve && (
              <div style={{ textAlign: "center", padding: 32, background: "#FFFBEB", borderRadius: 10, border: "1px solid #FDE68A", color: "#92400E", fontSize: 13 }}>
                Sem baseline cadastrado — salve um Planejamento Financeiro para este projeto para ver o comparativo.
              </div>
            )}
            {!pveLoading && pve && pve.grupos.length === 0 && (
              <div style={{ textAlign: "center", padding: 32, color: "#94A3B8", fontSize: 13 }}>
                Nenhum dado disponível (baseline vazio e sem lançamentos OPP vinculados).
              </div>
            )}
            {!pveLoading && pve && pve.grupos.length > 0 && (
              <>
                <div style={{ display: "flex", gap: 8, padding: "0 16px 10px", borderBottom: "1px solid #F1F5F9", marginBottom: 10 }}>
                  <span style={{ flex: 1, fontSize: 11, fontWeight: 700, color: "#475569", textTransform: "uppercase" }}>Categoria</span>
                  <span style={{ width: 130, fontSize: 11, fontWeight: 700, color: "#475569", textTransform: "uppercase", textAlign: "right" }}>Planejado</span>
                  <span style={{ width: 130, fontSize: 11, fontWeight: 700, color: "#475569", textTransform: "uppercase", textAlign: "right" }}>Executado</span>
                  <span style={{ width: 130, fontSize: 11, fontWeight: 700, color: "#475569", textTransform: "uppercase", textAlign: "right" }}>Variação</span>
                  <span style={{ width: 55, fontSize: 11, fontWeight: 700, color: "#475569", textTransform: "uppercase", textAlign: "right" }}>% exec</span>
                  <span style={{ width: 80 }} />
                  <span style={{ width: 36 }} />
                </div>
                {pve.grupos.map(g => <PvECard key={g.key} grupo={g} />)}
                <div style={{ marginTop: 14, display: "flex", gap: 12, flexWrap: "wrap" }}>
                  <div style={{ padding: "8px 14px", borderRadius: 8, background: "#F0FDF4", border: "1px solid #BBF7D0", fontSize: 12, color: "#15803D", fontWeight: 700 }}>
                    Receita exec.: {fmt(pve.totais.totalReceita)}
                  </div>
                  <div style={{ padding: "8px 14px", borderRadius: 8, background: "#FEF2F2", border: "1px solid #FECACA", fontSize: 12, color: "#DC2626", fontWeight: 700 }}>
                    Custos exec.: {fmt(pve.totais.totalCustos)}
                  </div>
                  <div style={{ padding: "8px 14px", borderRadius: 8,
                    background: pve.totais.totalReceita - pve.totais.totalCustos >= 0 ? "#F0FDF4" : "#FEF2F2",
                    border: `1px solid ${pve.totais.totalReceita - pve.totais.totalCustos >= 0 ? "#BBF7D0" : "#FECACA"}`,
                    fontSize: 12, fontWeight: 700,
                    color: pve.totais.totalReceita - pve.totais.totalCustos >= 0 ? "#15803D" : "#DC2626" }}>
                    Saldo real: {fmt(pve.totais.totalReceita - pve.totais.totalCustos)}
                  </div>
                  <div style={{ padding: "8px 14px", borderRadius: 8, background: "#F8FAFC", border: "1px solid #E2E8F0", fontSize: 12, color: "#64748B" }}>
                    {pve.totalLancamentos} lançamentos OPP vinculados
                  </div>
                </div>
              </>
            )}
          </div>

          {/* O.C.s — Ordens de Compra */}
          <div style={{ background: "#fff", borderRadius: 14, padding: "20px 24px", border: "1px solid #E2E8F0", marginBottom: 20 }}>
            <div style={{ fontWeight: 800, fontSize: 15, color: "#0F172A", marginBottom: 14 }}>Ordens de Compra (O.C.) — Terceirizados</div>
            {proj.ocs.lista.length === 0 ? (
              <div style={{ textAlign: "center", padding: 32, color: "#94A3B8", fontSize: 13 }}>Nenhuma O.C. registrada para este projeto.</div>
            ) : (
              <>
                <div style={{ marginBottom: 16 }}>
                  <BarOC contratado={proj.ocs.contratado} budget={proj.ocs.budget} entregue={proj.ocs.entregue} />
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 10, marginBottom: 14 }}>
                  <KpiCard label="Budget Terceirizados" value={fmt(proj.ocs.budget)} />
                  <KpiCard label="O.C.s Contratadas" value={fmt(proj.ocs.contratado)} style={proj.ocs.percBudget > 100 ? "bad" : proj.ocs.percBudget > 80 ? "warn" : "ok"} sub={`${fmtN(proj.ocs.percBudget)}% do budget`} />
                  <KpiCard label="Pendente Entrega" value={fmt(proj.ocs.pendente)} style={proj.ocs.pendente > 0 ? "warn" : "ok"} />
                </div>
                <div style={{ overflowX: "auto" }}>
                  <table style={{ width: "100%", borderCollapse: "collapse" }}>
                    <thead>
                      <tr style={{ background: "#F8FAFC" }}>
                        {["Fornecedor", "Serviço", "O.C.", "Valor", "Status"].map(h => (
                          <th key={h} style={{ padding: "9px 14px", textAlign: "left", fontSize: 10, fontWeight: 700, color: "#94A3B8", textTransform: "uppercase" }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {proj.ocs.lista.map((oc, i) => (
                        <tr key={i} style={{ borderTop: "1px solid #F1F5F9" }}>
                          <td style={{ padding: "10px 14px", fontSize: 13, fontWeight: 600, color: "#0F172A" }}>{oc.fornecedor || "—"}</td>
                          <td style={{ padding: "10px 14px", fontSize: 12, color: "#475569" }}>{oc.servico || "—"}</td>
                          <td style={{ padding: "10px 14px", fontSize: 12, fontWeight: 700, color: "#7C3AED" }}>{oc.oc}</td>
                          <td style={{ padding: "10px 14px", fontSize: 13, fontWeight: 700, color: "#0F172A" }}>{fmt(oc.valor)}</td>
                          <td style={{ padding: "10px 14px" }}>
                            <span style={{ fontSize: 11, fontWeight: 700, padding: "3px 8px", borderRadius: 6,
                              background: oc.status === "Entregue" ? "#DCFCE7" : oc.status === "Cancelado" ? "#FEE2E2" : oc.status === "Solicitado" ? "#FEF3C7" : "#EEF2FF",
                              color: oc.status === "Entregue" ? "#15803D" : oc.status === "Cancelado" ? "#DC2626" : oc.status === "Solicitado" ? "#D97706" : "#4338CA"
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
          <div style={{ display: "flex", gap: 10 }}>
            <button onClick={() => navigate(`/planejamento/${proj.id}`)} style={{ padding: "10px 20px", borderRadius: 10, border: "1px solid #E2E8F0", background: "#EEF2FF", color: "#4338CA", fontWeight: 700, fontSize: 13, cursor: "pointer" }}>
              Ver Planejamento
            </button>
            <button onClick={() => navigate(`/acompanhamento?projeto=${proj.id}`)} style={{ padding: "10px 20px", borderRadius: 10, border: "1px solid #E2E8F0", background: "#F0FDF4", color: "#15803D", fontWeight: 700, fontSize: 13, cursor: "pointer" }}>
              Ver Acompanhamento
            </button>
            <button onClick={() => navigate(`/checklist`)} style={{ padding: "10px 20px", borderRadius: 10, border: "1px solid #E2E8F0", background: "#FFFBEB", color: "#D97706", fontWeight: 700, fontSize: 13, cursor: "pointer" }}>
              Checklist
            </button>
          </div>
        </>
      )}
    </div>
  )
}
