import { useState, useEffect } from "react"
import { useSearchParams, useNavigate } from "react-router-dom"
import api from "../utils/api"

const fmt = (v) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v || 0)
const fmtN = (v, dec = 1) => Number(v || 0).toFixed(dec)
const fmtDate = (d) => d ? new Date(d).toLocaleDateString("pt-BR") : "—"
const fmtH = (h) => { const hh = Math.floor(h || 0); const mm = Math.round(((h || 0) - hh) * 60); return mm > 0 ? `${hh}h${mm}min` : `${hh}h` }

function DesvioCard({ label, planejado, real, unit = "", isCurrency = false, invertBad = false }) {
  const diff = real - planejado
  const diffPerc = planejado !== 0 ? (diff / Math.abs(planejado)) * 100 : 0
  const bad = invertBad ? diff < 0 : diff > 0
  const color = Math.abs(diff) < 0.01 ? "#64748B" : bad ? "#DC2626" : "#15803D"
  const bg = Math.abs(diff) < 0.01 ? "#F8FAFC" : bad ? "#FEF2F2" : "#F0FDF4"
  const border = Math.abs(diff) < 0.01 ? "#E2E8F0" : bad ? "#FECACA" : "#86EFAC"
  return (
    <div style={{ background: bg, borderRadius: 12, padding: "16px 18px", border: `1px solid ${border}` }}>
      <div style={{ fontSize: 11, fontWeight: 700, color: "#64748B", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 10 }}>{label}</div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8 }}>
        <div><div style={{ fontSize: 10, color: "#94A3B8", fontWeight: 600 }}>PLANEJADO</div><div style={{ fontSize: 15, fontWeight: 800, color: "#475569" }}>{isCurrency ? fmt(planejado) : `${fmtN(planejado,0)}${unit}`}</div></div>
        <div><div style={{ fontSize: 10, color: "#94A3B8", fontWeight: 600 }}>REAL</div><div style={{ fontSize: 15, fontWeight: 800, color: "#0F172A" }}>{isCurrency ? fmt(real) : `${fmtN(real,0)}${unit}`}</div></div>
        <div><div style={{ fontSize: 10, color: "#94A3B8", fontWeight: 600 }}>DESVIO</div><div style={{ fontSize: 15, fontWeight: 800, color }}>{diff >= 0 ? "+" : ""}{isCurrency ? fmt(diff) : `${fmtN(diff,0)}${unit}`}{Math.abs(diffPerc) > 0.1 && <span style={{ fontSize: 11, marginLeft: 4 }}>({diff >= 0 ? "+" : ""}{fmtN(diffPerc)}%)</span>}</div></div>
      </div>
    </div>
  )
}

function StatusBadge({ status }) {
  const map = { "Recebido": { bg: "#DCFCE7", color: "#15803D" }, "NF Emitida": { bg: "#EFF6FF", color: "#2563EB" }, "Pendente": { bg: "#F1F5F9", color: "#64748B" }, "Cancelado": { bg: "#FEE2E2", color: "#DC2626" }, "Entregue": { bg: "#DCFCE7", color: "#15803D" }, "Confirmado": { bg: "#EFF6FF", color: "#2563EB" }, "Solicitado": { bg: "#FEF3C7", color: "#D97706" } }
  const s = map[status] || { bg: "#F1F5F9", color: "#64748B" }
  return <span style={{ fontSize: 11, fontWeight: 700, padding: "3px 8px", borderRadius: 6, background: s.bg, color: s.color }}>{status || "—"}</span>
}

const CUSTO_HORA = 36.40

export default function RelatorioFinal() {
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const [projetos, setProjetos] = useState([])
  const [projetoId, setProjetoId] = useState(searchParams.get("projeto") || "")
  const [relatorio, setRelatorio] = useState(null)
  const [loading, setLoading] = useState(false)
  const [loadingProjetos, setLoadingProjetos] = useState(true)

  useEffect(() => { api.get("/projetos").then(r => setProjetos(r.data?.projetos || r.data || [])).catch(() => []).finally(() => setLoadingProjetos(false)) }, [])
  useEffect(() => {
    if (!projetoId) return
    setLoading(true); setRelatorio(null)
    api.get(`/relatorio-final/${projetoId}`).then(r => setRelatorio(r.data)).catch(() => setRelatorio(null)).finally(() => setLoading(false))
  }, [projetoId])

  const lucroOk = relatorio?.financeiro?.real?.lucroPerc >= 23
  const medicoes = relatorio?.medicoes?.lista || []
  const colaboradores = relatorio?.horas?.porColaborador || []

  return (
    <div style={{ padding: "28px 32px", maxWidth: 1280, margin: "0 auto" }}>
      <div style={{ marginBottom: 28, display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 22, fontWeight: 800, color: "#0F172A" }}>Relatorio Final de Projeto</h1>
          <p style={{ margin: "6px 0 0", fontSize: 13, color: "#64748B" }}>Fechamento completo com auditoria de desvios e consolidacao PAR</p>
        </div>
        {projetoId && <button onClick={() => navigate(`/acompanhamento?projeto=${projetoId}`)} style={{ padding: "10px 18px", borderRadius: 10, border: "1px solid #E2E8F0", background: "#fff", color: "#475569", fontWeight: 700, fontSize: 13, cursor: "pointer" }}>Voltar ao Acompanhamento</button>}
      </div>

      <div style={{ background: "#fff", borderRadius: 14, padding: "20px 24px", border: "1px solid #E2E8F0", marginBottom: 24 }}>
        <label style={{ fontWeight: 700, fontSize: 13, color: "#0F172A", display: "block", marginBottom: 8 }}>Selecionar Projeto</label>
        <select value={projetoId} onChange={e => setProjetoId(e.target.value)} disabled={loadingProjetos} style={{ width: "100%", padding: "10px 14px", borderRadius: 10, border: "1.5px solid #E2E8F0", fontSize: 14, color: "#0F172A", fontFamily: "inherit", outline: "none", background: "#fff" }}>
          <option value="">— Selecione um projeto —</option>
          {projetos.map(p => <option key={p.ID_Projeto} value={p.ID_Projeto}>{p.Nome} {p.Cliente ? `· ${p.Cliente}` : ""} [{p.Status}]</option>)}
        </select>
      </div>

      {loading && <div style={{ textAlign: "center", padding: 60, color: "#94A3B8" }}>Gerando relatorio...</div>}
      {!projetoId && !loading && <div style={{ textAlign: "center", padding: 60, background: "#F8FAFC", borderRadius: 16, border: "2px dashed #E2E8F0", color: "#94A3B8" }}><div style={{ fontWeight: 700, fontSize: 16, color: "#475569" }}>Selecione um projeto para gerar o relatorio</div></div>}

      {relatorio && (
        <>
          {/* Header */}
          <div style={{ background: lucroOk ? "linear-gradient(135deg,#F0FDF4,#DCFCE7)" : "linear-gradient(135deg,#FEF2F2,#FEE2E2)", borderRadius: 16, padding: "24px 28px", marginBottom: 24, border: `2px solid ${lucroOk ? "#86EFAC" : "#FECACA"}` }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 16 }}>
              <div>
                <div style={{ fontSize: 20, fontWeight: 900, color: "#0F172A" }}>{relatorio.projeto.nome}</div>
                <div style={{ fontSize: 14, color: "#64748B", marginTop: 4 }}>{relatorio.projeto.cliente} · {relatorio.projeto.setor} · {relatorio.projeto.nrContrato || "Sem OS"}</div>
                <div style={{ display: "flex", gap: 16, marginTop: 12, fontSize: 13 }}>
                  <span>Valor: <strong>{fmt(relatorio.projeto.valorContrato)}</strong></span>
                  <span>Entrega: <strong>{fmtDate(relatorio.projeto.dataEntregaContrato)}</strong></span>
                </div>
              </div>
              <div style={{ textAlign: "right" }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: "#64748B", marginBottom: 4 }}>MARGEM REAL</div>
                <div style={{ fontSize: 36, fontWeight: 900, color: lucroOk ? "#15803D" : "#DC2626" }}>{fmtN(relatorio.financeiro?.real?.lucroPerc || 0)}%</div>
                <div style={{ fontSize: 12, color: lucroOk ? "#15803D" : "#DC2626", fontWeight: 700 }}>{lucroOk ? "Conforme PAR (>= 23%)" : "Abaixo do minimo (23%)"}</div>
              </div>
            </div>
          </div>

          {/* Analise Financeira */}
          <div style={{ background: "#fff", borderRadius: 16, padding: "22px 24px", border: "1px solid #E2E8F0", marginBottom: 20 }}>
            <div style={{ fontWeight: 800, fontSize: 15, color: "#0F172A", marginBottom: 16 }}>Analise Financeira</div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(280px,1fr))", gap: 12 }}>
              <DesvioCard label="Custo Equipe" planejado={relatorio.financeiro?.planejado?.custoEquipe || 0} real={relatorio.financeiro?.real?.custoEquipe || 0} isCurrency />
              <DesvioCard label="Custo Terceiros" planejado={relatorio.financeiro?.planejado?.custoTerceiros || 0} real={relatorio.financeiro?.real?.custoTerceiros || 0} isCurrency />
              <DesvioCard label="Custo Total" planejado={relatorio.financeiro?.planejado?.custoTotal || 0} real={relatorio.financeiro?.real?.custoTotal || 0} isCurrency />
              <DesvioCard label="Lucro" planejado={relatorio.financeiro?.planejado?.lucro || 0} real={relatorio.financeiro?.real?.lucro || 0} isCurrency invertBad />
            </div>
          </div>

          {/* Horas — resumo + por colaborador */}
          {relatorio.horas && (
            <div style={{ background: "#fff", borderRadius: 16, padding: "22px 24px", border: "1px solid #E2E8F0", marginBottom: 20 }}>
              <div style={{ fontWeight: 800, fontSize: 15, color: "#0F172A", marginBottom: 16 }}>Horas e Custo por Colaborador</div>
              <div style={{ marginBottom: 16 }}>
                <DesvioCard label="Total de Horas" planejado={relatorio.horas.planejadas} real={relatorio.horas.rastreadas} unit="h" />
              </div>

              {colaboradores.length > 0 && (
                <div style={{ overflowX: "auto" }}>
                  <table style={{ width: "100%", borderCollapse: "collapse" }}>
                    <thead>
                      <tr style={{ background: "#F8FAFC" }}>
                        {["Colaborador", "Horas Plan.", "Horas Real", "R$/h", "Custo Plan.", "Custo Real", "Desvio (R$)"].map(h => (
                          <th key={h} style={{ padding: "10px 14px", textAlign: "left", fontSize: 11, fontWeight: 700, color: "#94A3B8", textTransform: "uppercase", whiteSpace: "nowrap" }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {colaboradores.map((c, i) => {
                        const custoPlan = (c.horasPlanejadas || 0) * CUSTO_HORA
                        const custoReal = (c.horasRastreadas || 0) * CUSTO_HORA
                        const desvio = custoReal - custoPlan
                        return (
                          <tr key={i} style={{ borderTop: "1px solid #F1F5F9" }}>
                            <td style={{ padding: "11px 14px", fontSize: 13, fontWeight: 700, color: "#0F172A" }}>
                              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                                <div style={{ width: 28, height: 28, borderRadius: "50%", background: "#EEF2FF", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 800, color: "#4338CA", flexShrink: 0 }}>
                                  {(c.colaborador || c.nome || "?").charAt(0).toUpperCase()}
                                </div>
                                {c.colaborador || c.nome || "—"}
                              </div>
                            </td>
                            <td style={{ padding: "11px 14px", fontSize: 13, color: "#475569" }}>{fmtH(c.horasPlanejadas || 0)}</td>
                            <td style={{ padding: "11px 14px", fontSize: 13, fontWeight: 700, color: "#0F172A" }}>{fmtH(c.horasRastreadas || c.horas || 0)}</td>
                            <td style={{ padding: "11px 14px", fontSize: 13, color: "#64748B" }}>{fmt(CUSTO_HORA)}</td>
                            <td style={{ padding: "11px 14px", fontSize: 13, color: "#475569" }}>{fmt(custoPlan)}</td>
                            <td style={{ padding: "11px 14px", fontSize: 13, fontWeight: 700, color: "#0F172A" }}>{fmt(custoReal)}</td>
                            <td style={{ padding: "11px 14px", fontSize: 13, fontWeight: 700, color: desvio > 0 ? "#DC2626" : desvio < 0 ? "#15803D" : "#64748B" }}>
                              {desvio >= 0 ? "+" : ""}{fmt(desvio)}
                            </td>
                          </tr>
                        )
                      })}
                      {/* Totals row */}
                      <tr style={{ borderTop: "2px solid #E2E8F0", background: "#F8FAFC" }}>
                        <td style={{ padding: "11px 14px", fontSize: 13, fontWeight: 800, color: "#0F172A" }}>TOTAL</td>
                        <td style={{ padding: "11px 14px", fontSize: 13, fontWeight: 700, color: "#475569" }}>{fmtH(relatorio.horas.planejadas)}</td>
                        <td style={{ padding: "11px 14px", fontSize: 13, fontWeight: 700, color: "#0F172A" }}>{fmtH(relatorio.horas.rastreadas)}</td>
                        <td style={{ padding: "11px 14px" }}></td>
                        <td style={{ padding: "11px 14px", fontSize: 13, fontWeight: 700, color: "#475569" }}>{fmt(relatorio.horas.planejadas * CUSTO_HORA)}</td>
                        <td style={{ padding: "11px 14px", fontSize: 13, fontWeight: 700, color: "#0F172A" }}>{fmt(relatorio.horas.rastreadas * CUSTO_HORA)}</td>
                        <td style={{ padding: "11px 14px", fontSize: 13, fontWeight: 700, color: (relatorio.horas.rastreadas - relatorio.horas.planejadas) * CUSTO_HORA > 0 ? "#DC2626" : "#15803D" }}>
                          {((relatorio.horas.rastreadas - relatorio.horas.planejadas) * CUSTO_HORA) >= 0 ? "+" : ""}{fmt((relatorio.horas.rastreadas - relatorio.horas.planejadas) * CUSTO_HORA)}
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {/* Medicoes */}
          {medicoes.length > 0 && (
            <div style={{ background: "#fff", borderRadius: 16, border: "1px solid #E2E8F0", overflow: "hidden", marginBottom: 20 }}>
              <div style={{ padding: "18px 24px", borderBottom: "1px solid #F1F5F9", fontWeight: 800, fontSize: 15, color: "#0F172A" }}>
                Medicoes ({medicoes.length})
                <span style={{ marginLeft: 12, fontSize: 12, fontWeight: 600, color: "#64748B" }}>
                  Recebidas: {relatorio.medicoes?.recebidas || 0} · Pendentes: {relatorio.medicoes?.pendentes || 0}
                </span>
              </div>
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse" }}>
                  <thead>
                    <tr style={{ background: "#F8FAFC" }}>
                      {["Etapa / Descricao", "% Contrato", "Valor", "O.C.", "OS OPP", "Prev. Entrega", "Realizado", "Status Fisico", "Financeiro"].map(h => (
                        <th key={h} style={{ padding: "10px 14px", textAlign: "left", fontSize: 11, fontWeight: 700, color: "#94A3B8", textTransform: "uppercase", whiteSpace: "nowrap" }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {medicoes.map((m, i) => (
                      <tr key={i} style={{ borderTop: "1px solid #F1F5F9" }}>
                        <td style={{ padding: "12px 14px", fontSize: 13, fontWeight: 600, color: "#0F172A" }}>{m.etapa || m.descricao || "—"}</td>
                        <td style={{ padding: "12px 14px", fontSize: 13, color: "#475569" }}>{m.percentual != null ? `${fmtN(m.percentual)}%` : "—"}</td>
                        <td style={{ padding: "12px 14px", fontSize: 13, fontWeight: 700, color: "#7C3AED" }}>{fmt(m.valor)}</td>
                        <td style={{ padding: "12px 14px", fontSize: 12, color: "#475569" }}>{m.oc || "—"}</td>
                        <td style={{ padding: "12px 14px", fontSize: 12, color: "#475569" }}>{m.nrOsOpp || "—"}</td>
                        <td style={{ padding: "12px 14px", fontSize: 12, color: "#475569" }}>{fmtDate(m.dataPrevisao)}</td>
                        <td style={{ padding: "12px 14px", fontSize: 12, color: "#475569" }}>{fmtDate(m.dataRealizacao)}</td>
                        <td style={{ padding: "12px 14px" }}><StatusBadge status={m.statusFisico} /></td>
                        <td style={{ padding: "12px 14px" }}><StatusBadge status={m.statusFinanceiro || "Pendente"} /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Veredicto PAR */}
          <div style={{ padding: "24px 28px", borderRadius: 16, textAlign: "center", background: lucroOk ? "linear-gradient(135deg,#F0FDF4,#DCFCE7)" : "linear-gradient(135deg,#FEF2F2,#FEE2E2)", border: `2px solid ${lucroOk ? "#86EFAC" : "#FECACA"}` }}>
            <div style={{ fontSize: 22, fontWeight: 900, color: lucroOk ? "#15803D" : "#DC2626", marginBottom: 4 }}>{lucroOk ? "APROVADO — Metodologia PAR" : "REPROVADO — Abaixo do minimo PAR"}</div>
            <div style={{ fontSize: 15, color: "#64748B" }}>Margem Real: {fmtN(relatorio.financeiro?.real?.lucroPerc || 0)}% {lucroOk ? "(>= 23% OK)" : "(minimo 23% nao atingido)"}</div>
          </div>
        </>
      )}
    </div>
  )
}
