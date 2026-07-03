import { useState, useEffect, useMemo } from "react"
import { useNavigate } from "react-router-dom"
import { DocumentArrowDownIcon, TableCellsIcon, ClipboardDocumentCheckIcon, ArrowTopRightOnSquareIcon, ExclamationTriangleIcon, FunnelIcon, XMarkIcon } from '@heroicons/react/24/outline'
import api from "../utils/api"

const fmt = (v) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v || 0)

const STATUS_COLOR = {
  "Em Andamento":           { bg: "#DCFCE7", color: "#15803D" },
  "Em Andamento (Atrasado)":{ bg: "#FEE2E2", color: "#DC2626" },
  "A Planejar":             { bg: "#FEF3C7", color: "#D97706" },
  "Paralisado":             { bg: "#F1F5F9", color: "#64748B" },
  "Aguardando Aprovação":   { bg: "#EFF6FF", color: "#2563EB" },
  "Aguardando Cliente":     { bg: "#FDF4FF", color: "#7E22CE" },
}

const PROBLEMA_COLOR = {
  campo:       { bg: "#FEF3C7", color: "#92400E", border: "#FDE68A" },
  planejamento:{ bg: "#FEF2F2", color: "#991B1B", border: "#FECACA" },
  medicao:     { bg: "#EFF6FF", color: "#1E40AF", border: "#BFDBFE" },
  horas:       { bg: "#F0FDF4", color: "#166534", border: "#86EFAC" },
}

function Badge({ label, type = "campo" }) {
  const c = PROBLEMA_COLOR[type]
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 11, fontWeight: 700, padding: "3px 8px", borderRadius: 6, background: c.bg, color: c.color, border: `1px solid ${c.border}`, whiteSpace: "nowrap" }}>
      {label}
    </span>
  )
}

function KpiCard({ label, value, color = "#DC2626", bg = "#FEF2F2", border = "#FECACA" }) {
  return (
    <div style={{ background: bg, borderRadius: 12, padding: "16px 20px", border: `1px solid ${border}` }}>
      <div style={{ fontSize: 11, fontWeight: 700, color: "#64748B", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 6 }}>{label}</div>
      <div style={{ fontSize: 28, fontWeight: 900, color }}>{value}</div>
    </div>
  )
}

const FILTROS_TIPO = ["Todos", "Campo Vazio", "Sem Planejamento", "Medição sem O.C.", "Sem Data Entrega"]

export default function ChecklistIntegridade() {
  const navigate = useNavigate()
  const [aba, setAba] = useState("checklist")

  // ── Checklist state ──
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [filtro, setFiltro] = useState("Todos")
  const [busca, setBusca] = useState("")

  // ── Auditoria state ──
  const [auditData, setAuditData] = useState(null)
  const [loadingAudit, setLoadingAudit] = useState(false)
  const [auditError, setAuditError] = useState(null)
  const [filtroCliente, setFiltroCliente] = useState("")
  const [filtroSetor, setFiltroSetor] = useState("")
  const [filtroStatus, setFiltroStatus] = useState("")
  const [ocultarConcluidas, setOcultarConcluidas] = useState(false)
  const [sortBy, setSortBy] = useState("nome")

  useEffect(() => {
    setLoading(true)
    api.get("/checklist")
      .then(r => setData(r.data))
      .catch(() => setData(null))
      .finally(() => setLoading(false))
  }, [])

  async function loadAudit() {
    setLoadingAudit(true); setAuditError(null)
    try {
      const res = await api.get("/relatorios/auditoria", { timeout: 60000 })
      setAuditData(res.data)
    } catch (err) {
      setAuditError(err.response?.data?.error || err.message || "Erro ao carregar auditoria")
    } finally { setLoadingAudit(false) }
  }

  async function downloadAuditExcel() {
    try {
      const res = await api.get("/relatorios/auditoria/excel", { responseType: "blob" })
      const a = document.createElement("a"); a.href = URL.createObjectURL(res.data)
      a.download = `Auditoria_${new Date().toLocaleDateString("pt-BR").replace(/\//g, "-")}.xlsx`; a.click()
    } catch { alert("Erro ao gerar Excel") }
  }

  async function downloadAuditPDF() {
    try {
      const res = await api.get("/relatorios/auditoria/pdf", { responseType: "blob" })
      const a = document.createElement("a"); a.href = URL.createObjectURL(res.data)
      a.download = `Auditoria_${new Date().toLocaleDateString("pt-BR").replace(/\//g, "-")}.pdf`; a.click()
    } catch { alert("Erro ao gerar PDF") }
  }

  const projetosAudit = useMemo(() => {
    if (!auditData) return []
    let list = [...auditData.projetos]
    if (ocultarConcluidas) list = list.filter(p => p.Status !== "Concluído")
    if (filtroCliente) list = list.filter(p => p.Cliente === filtroCliente)
    if (filtroSetor) list = list.filter(p => p.Setor === filtroSetor)
    if (filtroStatus) list = list.filter(p => p.Status === filtroStatus)
    if (sortBy === "nome") list.sort((a, b) => (a.Nome || "").localeCompare(b.Nome || ""))
    else if (sortBy === "data") list.sort((a, b) => new Date(a.Vencimento || 0) - new Date(b.Vencimento || 0))
    else if (sortBy === "perc") list.sort((a, b) => b.Progresso - a.Progresso)
    return list
  }, [auditData, ocultarConcluidas, filtroCliente, filtroSetor, filtroStatus, sortBy])

  const projetosFiltrados = useMemo(() => {
    if (!data?.projetos) return []
    return data.projetos.filter(p => {
      if (busca) {
        const q = busca.toLowerCase()
        if (!(p.nome || "").toLowerCase().includes(q) && !(p.cliente || "").toLowerCase().includes(q)) return false
      }
      if (filtro === "Campo Vazio" && p.camposFaltando.length === 0) return false
      if (filtro === "Sem Planejamento" && !p.problemasPlanejamento.some(x => x.includes("Sem planejamento"))) return false
      if (filtro === "Medição sem O.C." && p.medsSemOC === 0) return false
      if (filtro === "Sem Data Entrega" && !p.camposFaltando.includes("Data de Entrega")) return false
      return true
    })
  }, [data, filtro, busca])

  return (
    <div style={{ padding: "28px 32px" }}>
      {/* Header */}
      <div style={{ marginBottom: 20 }}>
        <h1 style={{ margin: 0, fontSize: 22, fontWeight: 800, color: "#0F172A" }}>Checklist & Auditoria</h1>
        <p style={{ margin: "6px 0 0", fontSize: 13, color: "#64748B" }}>Integridade dos dados e auditoria do portfólio de projetos</p>
      </div>

      {/* Abas */}
      <div style={{ display: "flex", gap: 4, background: "#F1F5F9", borderRadius: 10, padding: 4, width: "fit-content", marginBottom: 24 }}>
        {[{ key: "checklist", label: "Checklist de Integridade" }, { key: "auditoria", label: "Auditoria do Portfólio" }].map(t => (
          <button key={t.key} onClick={() => setAba(t.key)} style={{ padding: "8px 20px", borderRadius: 8, border: "none", cursor: "pointer", fontWeight: 700, fontSize: 13, background: aba === t.key ? "#fff" : "transparent", color: aba === t.key ? "#0F172A" : "#64748B", boxShadow: aba === t.key ? "0 1px 4px rgba(0,0,0,0.08)" : "none", transition: "all 0.18s" }}>
            {t.label}
          </button>
        ))}
      </div>

      {/* ── ABA AUDITORIA ── */}
      {aba === "auditoria" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 10 }}>
            <div>
              <p style={{ fontSize: 13, fontWeight: 700, color: "#64748B", margin: 0 }}>
                {auditData ? `${projetosAudit.length} / ${auditData.projetos.length} projetos` : "Analisa todo o portfólio: prazos, terceirizados e inconformidades"}
              </p>
              {auditData && <p style={{ fontSize: 12, color: "#94A3B8", margin: "2px 0 0" }}>Atualizado às {new Date(auditData.geradoEm).toLocaleTimeString("pt-BR")}</p>}
            </div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <button onClick={loadAudit} disabled={loadingAudit}
                style={{ padding: "9px 18px", borderRadius: 8, border: "1.5px solid #E2E8F0", background: "#fff", color: "#475569", fontWeight: 700, fontSize: 13, cursor: "pointer", display: "flex", alignItems: "center", gap: 6 }}>
                <ClipboardDocumentCheckIcon style={{ width: 15, height: 15 }} />
                {loadingAudit ? "Processando..." : auditData ? "Rodar novamente" : "Iniciar Auditoria"}
              </button>
              {auditData && <>
                <button onClick={downloadAuditExcel} style={{ padding: "9px 16px", borderRadius: 8, border: "1.5px solid #BBF7D0", background: "#F0FDF4", color: "#15803D", fontWeight: 700, fontSize: 13, cursor: "pointer", display: "flex", alignItems: "center", gap: 6 }}>
                  <TableCellsIcon style={{ width: 15, height: 15 }} /> Excel
                </button>
                <button onClick={downloadAuditPDF} style={{ padding: "9px 16px", borderRadius: 8, border: "none", background: "#7C3AED", color: "#fff", fontWeight: 700, fontSize: 13, cursor: "pointer", display: "flex", alignItems: "center", gap: 6 }}>
                  <DocumentArrowDownIcon style={{ width: 15, height: 15 }} /> PDF
                </button>
              </>}
            </div>
          </div>

          {loadingAudit && (
            <div style={{ background: "#fff", borderRadius: 16, border: "1px solid #E2E8F0", padding: "80px 0", textAlign: "center" }}>
              <div style={{ width: 44, height: 44, borderRadius: "50%", border: "4px solid #EDE9FE", borderTopColor: "#7C3AED", animation: "spin 1s linear infinite", margin: "0 auto 16px" }} />
              <p style={{ fontWeight: 700, color: "#0F172A", marginBottom: 4 }}>Processando Auditoria</p>
              <p style={{ fontSize: 12, color: "#94A3B8" }}>Analisando cronogramas, terceirizados e alertas...</p>
            </div>
          )}

          {auditError && !loadingAudit && (
            <div style={{ background: "#FEF2F2", border: "1.5px solid #FECACA", borderRadius: 16, padding: 40, textAlign: "center" }}>
              <ExclamationTriangleIcon style={{ width: 40, height: 40, color: "#DC2626", margin: "0 auto 12px" }} />
              <p style={{ fontSize: 15, fontWeight: 700, color: "#DC2626" }}>Falha na Análise</p>
              <p style={{ fontSize: 13, color: "#7F1D1D", marginTop: 6 }}>{auditError}</p>
              <button onClick={loadAudit} style={{ marginTop: 16, padding: "8px 20px", borderRadius: 8, border: "1.5px solid #E2E8F0", background: "#fff", color: "#475569", fontWeight: 700, cursor: "pointer" }}>Tentar novamente</button>
            </div>
          )}

          {!auditData && !loadingAudit && !auditError && (
            <div style={{ background: "#fff", borderRadius: 16, border: "2px dashed #E2E8F0", padding: "80px 0", textAlign: "center" }}>
              <ClipboardDocumentCheckIcon style={{ width: 48, height: 48, color: "#CBD5E1", margin: "0 auto 16px" }} />
              <p style={{ fontSize: 15, fontWeight: 800, color: "#0F172A", marginBottom: 6 }}>Auditoria do Portfólio</p>
              <p style={{ fontSize: 13, color: "#94A3B8" }}>Clique em "Iniciar Auditoria" para analisar todos os projetos</p>
            </div>
          )}

          {auditData && !loadingAudit && (
            <>
              {/* KPIs */}
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 12 }}>
                {[
                  { label: "Projetos", val: auditData.projetos.length, bg: "#EFF6FF", border: "#BFDBFE", color: "#1D4ED8" },
                  { label: "Inconformidades", val: auditData.projetos.filter(p => p.Auditoria === "ERRO").length, bg: "#FEF2F2", border: "#FECACA", color: "#DC2626" },
                  { label: "Terc. Pendentes", val: auditData.projetos.reduce((s, p) => s + (p.TercPendentes || 0), 0), bg: "#FFFBEB", border: "#FDE68A", color: "#B45309" },
                  { label: "Com Terceirizados", val: auditData.projetos.filter(p => p.TercTotal > 0).length, bg: "#F0FDF4", border: "#BBF7D0", color: "#15803D" },
                ].map(k => (
                  <div key={k.label} style={{ background: k.bg, border: `1.5px solid ${k.border}`, borderRadius: 12, padding: "14px 18px" }}>
                    <div style={{ fontSize: 26, fontWeight: 900, color: k.color }}>{k.val}</div>
                    <div style={{ fontSize: 11, fontWeight: 700, color: "#64748B", textTransform: "uppercase", letterSpacing: "0.06em", marginTop: 2 }}>{k.label}</div>
                  </div>
                ))}
              </div>

              {/* Filtros auditoria */}
              <div style={{ background: "#F8FAFC", border: "1.5px solid #E2E8F0", borderRadius: 12, padding: "12px 16px", display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                <FunnelIcon style={{ width: 15, height: 15, color: "#94A3B8" }} />
                {[
                  { val: filtroCliente, set: setFiltroCliente, opts: [...new Set(auditData.projetos.map(p => p.Cliente).filter(Boolean))].sort(), placeholder: "Todos os clientes" },
                  { val: filtroSetor, set: setFiltroSetor, opts: [...new Set(auditData.projetos.map(p => p.Setor).filter(Boolean))].sort(), placeholder: "Todos os setores" },
                  { val: filtroStatus, set: setFiltroStatus, opts: ["Backlog", "Em Andamento", "Em Andamento (Atrasado)", "Concluído", "Paralisado"], placeholder: "Todos os status" },
                ].map((f, i) => (
                  <select key={i} value={f.val} onChange={e => f.set(e.target.value)} style={{ padding: "6px 10px", borderRadius: 8, border: "1.5px solid #E2E8F0", fontSize: 12, fontFamily: "inherit", background: "#fff", color: "#0F172A" }}>
                    <option value="">{f.placeholder}</option>
                    {f.opts.map(o => <option key={o} value={o}>{o}</option>)}
                  </select>
                ))}
                <div style={{ display: "flex", gap: 4 }}>
                  {[{ id: "nome", l: "A-Z" }, { id: "data", l: "Data" }, { id: "perc", l: "%" }].map(s => (
                    <button key={s.id} onClick={() => setSortBy(s.id)} style={{ padding: "5px 10px", borderRadius: 7, border: "1.5px solid", borderColor: sortBy === s.id ? "#7C3AED" : "#E2E8F0", background: sortBy === s.id ? "#EDE9FE" : "#fff", color: sortBy === s.id ? "#7C3AED" : "#475569", fontWeight: 700, fontSize: 12, cursor: "pointer" }}>{s.l}</button>
                  ))}
                </div>
                <label style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 12, fontWeight: 600, color: "#475569", cursor: "pointer", marginLeft: "auto" }}>
                  <input type="checkbox" checked={ocultarConcluidas} onChange={e => setOcultarConcluidas(e.target.checked)} />
                  Ocultar concluídas
                </label>
                {(filtroCliente || filtroSetor || filtroStatus) && (
                  <button onClick={() => { setFiltroCliente(""); setFiltroSetor(""); setFiltroStatus("") }} style={{ display: "flex", alignItems: "center", gap: 4, padding: "5px 10px", borderRadius: 7, border: "1.5px solid #FECACA", background: "#FEF2F2", color: "#DC2626", fontWeight: 700, fontSize: 11, cursor: "pointer" }}>
                    <XMarkIcon style={{ width: 12, height: 12 }} /> Limpar
                  </button>
                )}
              </div>

              {/* Tabela auditoria */}
              <div style={{ background: "#fff", borderRadius: 14, border: "1px solid #E2E8F0", overflow: "hidden" }}>
                <div style={{ overflowX: "auto" }}>
                  <table style={{ width: "100%", borderCollapse: "collapse", whiteSpace: "nowrap" }}>
                    <thead>
                      <tr style={{ background: "#F8FAFC", borderBottom: "1px solid #E2E8F0" }}>
                        {["Cliente", "Projeto", "Setor", "Status", "Vencimento", "Progresso", "Terc.", "Alertas", "Audit."].map(h => (
                          <th key={h} style={{ padding: "10px 14px", fontSize: 10, fontWeight: 800, color: "#94A3B8", textTransform: "uppercase", letterSpacing: "0.08em" }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {projetosAudit.map((p, i) => {
                        const vencido = p.Auditoria === "ERRO" && (p.Erros || []).some(e => e.includes("vencido"))
                        const barColor = p.Progresso >= 100 ? "#22C55E" : p.Progresso >= 50 ? "#3B82F6" : "#7C3AED"
                        const sc = p.Status === "Concluído" ? { bg: "#DCFCE7", c: "#15803D" } : p.Status?.includes("Atrasado") ? { bg: "#FEE2E2", c: "#DC2626" } : p.Status === "Paralisado" ? { bg: "#FEF3C7", c: "#B45309" } : { bg: "#EFF6FF", c: "#1D4ED8" }
                        return (
                          <tr key={p.ID_Projeto} style={{ borderTop: i > 0 ? "1px solid #F1F5F9" : "none", background: p.Auditoria === "ERRO" ? "rgba(220,38,38,0.02)" : "transparent" }}>
                            <td style={{ padding: "10px 14px", fontSize: 12, color: "#475569", fontWeight: 600 }}>{p.Cliente || "—"}</td>
                            <td style={{ padding: "10px 14px" }}>
                              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                                <span style={{ fontSize: 13, fontWeight: 700, color: "#0F172A" }}>{p.Nome}</span>
                                {p.Link_ClickUp && <a href={p.Link_ClickUp} target="_blank" rel="noreferrer" style={{ color: "#94A3B8" }}><ArrowTopRightOnSquareIcon style={{ width: 13, height: 13 }} /></a>}
                              </div>
                            </td>
                            <td style={{ padding: "10px 14px", fontSize: 11, color: "#7C3AED", fontWeight: 700 }}>{p.Setor || "—"}</td>
                            <td style={{ padding: "10px 14px" }}><span style={{ fontSize: 11, fontWeight: 700, padding: "3px 9px", borderRadius: 6, background: sc.bg, color: sc.c }}>{p.Status || "—"}</span></td>
                            <td style={{ padding: "10px 14px", fontSize: 11, fontWeight: 700, color: vencido ? "#DC2626" : "#475569" }}>{p.Vencimento ? new Date(p.Vencimento).toLocaleDateString("pt-BR") : "—"}</td>
                            <td style={{ padding: "10px 14px" }}>
                              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                                <div style={{ width: 72, height: 6, background: "#E2E8F0", borderRadius: 4, overflow: "hidden" }}>
                                  <div style={{ width: `${Math.min(p.Progresso, 100)}%`, height: "100%", background: barColor, borderRadius: 4 }} />
                                </div>
                                <span style={{ fontSize: 11, fontWeight: 800, color: "#475569" }}>{p.Progresso}%</span>
                              </div>
                            </td>
                            <td style={{ padding: "10px 14px", textAlign: "center" }}>
                              <span style={{ fontSize: 12, fontWeight: 700, color: p.TercPendentes > 0 ? "#B45309" : "#94A3B8" }}>{p.TercPendentes}</span>
                              <span style={{ fontSize: 10, color: "#CBD5E1" }}> / {p.TercTotal}</span>
                            </td>
                            <td style={{ padding: "10px 14px", textAlign: "center" }}>
                              {p.AlertasAtivos > 0 ? <span style={{ fontSize: 11, fontWeight: 700, padding: "3px 8px", borderRadius: 6, background: "#FFFBEB", color: "#B45309" }}>{p.AlertasAtivos}</span> : <span style={{ color: "#CBD5E1", fontSize: 11 }}>—</span>}
                            </td>
                            <td style={{ padding: "10px 14px", textAlign: "center" }}>
                              <span style={{ fontSize: 11, fontWeight: 800, padding: "3px 10px", borderRadius: 6, background: p.Auditoria === "ERRO" ? "#FEE2E2" : "#DCFCE7", color: p.Auditoria === "ERRO" ? "#DC2626" : "#15803D" }}>
                                {p.Auditoria === "ERRO" ? "ERRO" : "OK"}
                              </span>
                            </td>
                          </tr>
                        )
                      })}
                      {projetosAudit.length === 0 && <tr><td colSpan={9} style={{ padding: 40, textAlign: "center", color: "#94A3B8" }}>Nenhum projeto encontrado.</td></tr>}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Inconformidades */}
              {projetosAudit.filter(p => p.Auditoria === "ERRO").length > 0 && (
                <div style={{ background: "#FEF2F2", border: "1.5px solid #FECACA", borderRadius: 14, padding: 18 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
                    <ExclamationTriangleIcon style={{ width: 17, height: 17, color: "#DC2626" }} />
                    <span style={{ fontSize: 12, fontWeight: 800, color: "#DC2626", textTransform: "uppercase", letterSpacing: "0.06em" }}>
                      Inconformidades — {projetosAudit.filter(p => p.Auditoria === "ERRO").length} projeto(s)
                    </span>
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                    {projetosAudit.filter(p => p.Auditoria === "ERRO").map(p => (
                      <div key={p.ID_Projeto} style={{ background: "#fff", borderRadius: 10, padding: "10px 14px", border: "1px solid #FECACA" }}>
                        <p style={{ fontSize: 12, fontWeight: 700, color: "#0F172A", marginBottom: 5 }}><span style={{ color: "#94A3B8" }}>{p.Cliente} / </span>{p.Nome}</p>
                        <ul style={{ margin: 0, padding: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: 3 }}>
                          {(p.Erros || []).map((e, i) => <li key={i} style={{ fontSize: 12, color: "#DC2626", fontWeight: 500 }}>• {e}</li>)}
                        </ul>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* ── ABA CHECKLIST ── */}
      {aba === "checklist" && loading && (
        <div style={{ textAlign: "center", padding: 80, color: "#94A3B8", fontSize: 14 }}>Analisando projetos...</div>
      )}

      {aba === "checklist" && !loading && data && (
        <>
          {/* KPIs */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))", gap: 12, marginBottom: 24 }}>
            <KpiCard label="Projetos c/ Problemas" value={data.stats.total} color="#DC2626" bg="#FEF2F2" border="#FECACA" />
            <KpiCard label="Sem Setor" value={data.stats.semSetor} color="#D97706" bg="#FFFBEB" border="#FDE68A" />
            <KpiCard label="Sem Planejamento" value={data.stats.semPlanejamento} color="#DC2626" bg="#FEF2F2" border="#FECACA" />
            <KpiCard label="Medição sem O.C." value={data.stats.medsSemOC} color="#2563EB" bg="#EFF6FF" border="#BFDBFE" />
            <KpiCard label="Sem Data Entrega" value={data.stats.semDataEntrega} color="#7E22CE" bg="#FDF4FF" border="#E9D5FF" />
          </div>

          {data.stats.total === 0 ? (
            <div style={{ textAlign: "center", padding: 80, background: "#F0FDF4", borderRadius: 16, border: "2px solid #86EFAC" }}>
              <div style={{ fontSize: 40, marginBottom: 12 }}>✅</div>
              <div style={{ fontSize: 18, fontWeight: 800, color: "#15803D" }}>Todos os projetos estão íntegros!</div>
              <div style={{ fontSize: 13, color: "#64748B", marginTop: 6 }}>Nenhum campo crítico faltando nos projetos ativos.</div>
            </div>
          ) : (
            <>
              {/* Filtros */}
              <div style={{ background: "#fff", borderRadius: 12, padding: "14px 18px", border: "1px solid #E2E8F0", marginBottom: 16, display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                {FILTROS_TIPO.map(f => (
                  <button key={f} onClick={() => setFiltro(f)} style={{
                    padding: "5px 14px", borderRadius: 8, border: `1.5px solid ${filtro === f ? "#7C3AED" : "#E2E8F0"}`,
                    background: filtro === f ? "#EDE9FE" : "#F8FAFC",
                    color: filtro === f ? "#7C3AED" : "#64748B",
                    fontWeight: 700, fontSize: 12, cursor: "pointer",
                  }}>{f}</button>
                ))}
                <div style={{ flex: 1, minWidth: 180, position: "relative" }}>
                  <input value={busca} onChange={e => setBusca(e.target.value)} placeholder="Buscar projeto ou cliente..."
                    style={{ width: "100%", padding: "6px 12px", borderRadius: 8, border: "1.5px solid #E2E8F0", fontSize: 13, fontFamily: "inherit", outline: "none", background: "#F8FAFC", color: "#0F172A", boxSizing: "border-box" }} />
                </div>
                <span style={{ fontSize: 12, color: "#94A3B8", fontWeight: 600 }}>{projetosFiltrados.length} de {data.stats.total}</span>
              </div>

              {/* Tabela */}
              <div style={{ background: "#fff", borderRadius: 14, border: "1px solid #E2E8F0", overflow: "hidden" }}>
                <div style={{ overflowX: "auto" }}>
                  <table style={{ width: "100%", borderCollapse: "collapse" }}>
                    <thead>
                      <tr style={{ background: "#F8FAFC" }}>
                        {["Projeto", "Cliente", "Setor", "Status", "Valor", "Problemas Identificados", "Ações"].map(h => (
                          <th key={h} style={{ padding: "10px 16px", textAlign: "left", fontSize: 11, fontWeight: 700, color: "#94A3B8", textTransform: "uppercase", whiteSpace: "nowrap" }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {projetosFiltrados.length === 0 ? (
                        <tr><td colSpan={7} style={{ padding: "48px 0", textAlign: "center", color: "#94A3B8" }}>Nenhum projeto encontrado com este filtro.</td></tr>
                      ) : projetosFiltrados.map((p, i) => {
                        const sc = STATUS_COLOR[p.status] || { bg: "#F1F5F9", color: "#64748B" }
                        return (
                          <tr key={p.id} style={{ borderTop: "1px solid #F1F5F9", background: i % 2 === 0 ? "#fff" : "#FAFAFA" }}>
                            {/* Projeto */}
                            <td style={{ padding: "12px 16px", maxWidth: 220 }}>
                              <div style={{ fontSize: 13, fontWeight: 700, color: "#0F172A", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.nome}</div>
                              <div style={{ fontSize: 10, color: "#94A3B8", marginTop: 2 }}>{p.id}</div>
                            </td>
                            {/* Cliente */}
                            <td style={{ padding: "12px 16px", fontSize: 13, color: "#475569", whiteSpace: "nowrap" }}>{p.cliente}</td>
                            {/* Setor */}
                            <td style={{ padding: "12px 16px", fontSize: 12, color: p.camposFaltando.includes("Setor") ? "#DC2626" : "#475569", fontWeight: p.camposFaltando.includes("Setor") ? 700 : 400 }}>
                              {p.setor === "—" ? <span style={{ color: "#DC2626" }}>⚠ Sem setor</span> : p.setor}
                            </td>
                            {/* Status */}
                            <td style={{ padding: "12px 16px" }}>
                              <span style={{ fontSize: 11, fontWeight: 700, padding: "3px 8px", borderRadius: 6, background: sc.bg, color: sc.color, whiteSpace: "nowrap" }}>{p.status}</span>
                            </td>
                            {/* Valor */}
                            <td style={{ padding: "12px 16px", fontSize: 13, fontWeight: 700, color: p.valorGlobal === 0 ? "#DC2626" : "#0F172A", whiteSpace: "nowrap" }}>
                              {p.valorGlobal === 0 ? <span style={{ color: "#DC2626" }}>⚠ Sem valor</span> : fmt(p.valorGlobal)}
                            </td>
                            {/* Problemas */}
                            <td style={{ padding: "12px 16px" }}>
                              <div style={{ display: "flex", gap: 4, flexWrap: "wrap", maxWidth: 420 }}>
                                {p.camposFaltando.map(c => <Badge key={c} label={`Campo: ${c}`} type="campo" />)}
                                {p.problemasPlanejamento.map(c => <Badge key={c} label={c} type="planejamento" />)}
                                {p.medsSemOC > 0 && <Badge label={`${p.medsSemOC} medição(ões) sem O.C.`} type="medicao" />}
                                {p.horasSemProfissional > 0 && <Badge label={`${p.horasSemProfissional} hora(s) sem profissional`} type="horas" />}
                              </div>
                            </td>
                            {/* Ações */}
                            <td style={{ padding: "12px 16px", whiteSpace: "nowrap" }}>
                              <div style={{ display: "flex", gap: 6 }}>
                                <button
                                  onClick={() => navigate(`/planejamento/${p.id}`)}
                                  style={{ padding: "5px 12px", borderRadius: 7, border: "1px solid #E2E8F0", background: "#EEF2FF", color: "#4338CA", fontSize: 12, fontWeight: 700, cursor: "pointer" }}>
                                  Planejamento
                                </button>
                                {p.linkClickUp && (
                                  <a href={p.linkClickUp} target="_blank" rel="noreferrer"
                                    style={{ padding: "5px 12px", borderRadius: 7, border: "1px solid #E2E8F0", background: "#F0FDF4", color: "#15803D", fontSize: 12, fontWeight: 700, cursor: "pointer", textDecoration: "none" }}>
                                    ClickUp
                                  </a>
                                )}
                              </div>
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Legenda */}
              <div style={{ marginTop: 16, display: "flex", gap: 12, flexWrap: "wrap", alignItems: "center" }}>
                <span style={{ fontSize: 11, color: "#94A3B8", fontWeight: 700 }}>LEGENDA:</span>
                {[["campo", "Campo Vazio"], ["planejamento", "Problema de Planejamento"], ["medicao", "Medição sem O.C."], ["horas", "Hora sem Profissional"]].map(([type, label]) => {
                  const c = PROBLEMA_COLOR[type]
                  return <span key={type} style={{ fontSize: 11, fontWeight: 700, padding: "3px 8px", borderRadius: 6, background: c.bg, color: c.color, border: `1px solid ${c.border}` }}>{label}</span>
                })}
              </div>
            </>
          )}
        </>
      )}

      {!loading && !data && (
        <div style={{ textAlign: "center", padding: 60, color: "#DC2626" }}>Erro ao carregar checklist. Verifique a conexão com o backend.</div>
      )}
    </div>
  )
}
