import { useState, useEffect, useCallback, useMemo } from "react"
import { toast } from "react-hot-toast"
import { ArrowPathIcon, XMarkIcon, BuildingOffice2Icon, BanknotesIcon, FolderIcon } from "@heroicons/react/24/outline"
import api from "../utils/api"

const fmt = (v) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v || 0)

function Chip({ label, active, onClick }) {
  return (
    <button onClick={onClick} style={{
      padding: "5px 12px", borderRadius: 20, border: `1.5px solid ${active ? "#7C3AED" : "#E2E8F0"}`,
      background: active ? "#EEF2FF" : "#F8FAFC", color: active ? "#7C3AED" : "#64748B",
      fontWeight: active ? 700 : 600, fontSize: 12, cursor: "pointer", transition: "all 0.15s",
    }}>{label}</button>
  )
}

function StatCard({ label, value, color = "#7C3AED" }) {
  return (
    <div style={{ background: "#fff", borderRadius: 12, padding: "16px 20px", border: "1px solid #E2E8F0", boxShadow: "0 1px 4px rgba(0,0,0,0.04)" }}>
      <div style={{ fontSize: 11, fontWeight: 700, color: "#64748B", textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 6 }}>{label}</div>
      <div style={{ fontSize: 26, fontWeight: 900, color }}>{value}</div>
    </div>
  )
}

const STATUS_TERC_WORKFLOW = ["Backlog", "Autorizado", "Em Negociação", "Ordem de Compra", "Em Andamento", "Análise Técnica", "Aguardando Aprovação Externa", "Contas a Pagar", "Concluído", "Solicitado", "Confirmado", "Entregue", "Cancelado"]

export default function Comercial() {
  const [clientes, setClientes] = useState([])
  const [terceirizados, setTerceirizados] = useState([])
  const [loading, setLoading] = useState(true)
  const [loadingTerc, setLoadingTerc] = useState(false)
  const [syncLoading, setSyncLoading] = useState(false)
  const [aba, setAba] = useState("clientes")
  const [clienteSelecionado, setClienteSelecionado] = useState(null)
  const [detalhe, setDetalhe] = useState(null)
  const [detalheLoading, setDetalheLoading] = useState(false)

  // Clientes filters
  const [busca, setBusca] = useState("")
  const [filtroSituacao, setFiltroSituacao] = useState("")
  const [filtroTipo, setFiltroTipo] = useState("")

  // Terceirizados filters
  const [buscaTerc, setBuscaTerc] = useState("")
  const [filtroStatusTerc, setFiltroStatusTerc] = useState("")

  const carregarClientes = useCallback(async () => {
    setLoading(true)
    try {
      const r = await api.get("/opp/clientes")
      const lista = Array.isArray(r.data) ? r.data : r.data?.data || []
      setClientes(lista)
    } catch { toast.error("Erro ao carregar clientes OPP") }
    finally { setLoading(false) }
  }, [])

  const carregarTerceirizados = useCallback(async () => {
    setLoadingTerc(true)
    try {
      const r = await api.get("/terceirizados")
      setTerceirizados(r.data?.terceirizados || r.data || [])
    } catch { toast.error("Erro ao carregar terceirizados") }
    finally { setLoadingTerc(false) }
  }, [])

  useEffect(() => { carregarClientes() }, [carregarClientes])
  useEffect(() => { if (aba === "terceirizados") carregarTerceirizados() }, [aba, carregarTerceirizados])

  async function syncOPP() {
    setSyncLoading(true)
    try {
      const res = await api.post("/opp/sync")
      toast.success(`Sync concluido: ${res.data.totalReceitas || 0} receitas, ${res.data.totalDespesas || 0} despesas`)
    } catch { toast.error("Erro ao sincronizar OPP") }
    finally { setSyncLoading(false) }
  }

  const tiposCadastro = useMemo(() => [...new Set(clientes.map(c => c.tipo_cadastro).filter(Boolean))].sort(), [clientes])

  const clientesFiltrados = useMemo(() => clientes.filter(c => {
    const q = busca.toLowerCase()
    const matchBusca = !q || (c.razao_cliente || "").toLowerCase().includes(q) || (c.fantasia_cliente || "").toLowerCase().includes(q) || (c.cidade_cliente || "").toLowerCase().includes(q)
    const matchSituacao = !filtroSituacao || c.situacao_cliente === filtroSituacao
    const matchTipo = !filtroTipo || c.tipo_cadastro === filtroTipo
    return matchBusca && matchSituacao && matchTipo
  }), [clientes, busca, filtroSituacao, filtroTipo])

  const tercFiltrados = useMemo(() => terceirizados.filter(t => {
    const q = buscaTerc.toLowerCase()
    const matchBusca = !q || (t.nomeProjeto || "").toLowerCase().includes(q) || (t.Fornecedor || "").toLowerCase().includes(q) || (t.Descricao_Servico || "").toLowerCase().includes(q)
    const matchStatus = !filtroStatusTerc || t.Status === filtroStatusTerc
    return matchBusca && matchStatus
  }), [terceirizados, buscaTerc, filtroStatusTerc])

  const statusTercOptions = useMemo(() => {
    const presentes = [...new Set(terceirizados.map(t => t.Status).filter(Boolean))]
    return STATUS_TERC_WORKFLOW.filter(s => presentes.includes(s)).concat(presentes.filter(s => !STATUS_TERC_WORKFLOW.includes(s)))
  }, [terceirizados])
  const statusTercCount = (status) => terceirizados.filter(t => t.Status === status).length
  const hasClienteFilters = busca || filtroSituacao || filtroTipo
  const hasTercFilters = buscaTerc || filtroStatusTerc

  async function abrirDetalhe(cliente) {
    setClienteSelecionado(cliente)
    setDetalhe(null)
    setDetalheLoading(true)
    try {
      const nomeCliente = (cliente.razao_cliente || cliente.fantasia_cliente || "").toLowerCase()
      const [finRes, projRes] = await Promise.all([
        api.get(`/opp/financeiro-cliente?nome=${encodeURIComponent(nomeCliente)}`).catch(() => ({ data: { receitas: [], despesas: [] } })),
        api.get(`/projetos`).catch(() => ({ data: { projetos: [] } })),
      ])
      // Agrupa por Nr_Documento (mesma NF pode ter múltiplas baixas no OPP)
      const agrupar = (lista) => {
        const mapa = {}
        for (const t of lista) {
          const chave = t.Nr_Documento || t.ID_OPP
          if (!mapa[chave]) { mapa[chave] = { ...t, Valor: parseFloat(t.Valor) || 0 } }
          else { mapa[chave].Valor += parseFloat(t.Valor) || 0 }
        }
        return Object.values(mapa).map(t => ({ ...t, Valor: t.Valor.toString() }))
      }
      const receitas = agrupar(finRes.data?.receitas || [])
      const despesas = agrupar(finRes.data?.despesas || [])
      const projetos = (projRes.data?.projetos || []).filter(p => {
        const pc = (p.Cliente || "").toLowerCase().trim()
        return pc.length > 0 && (pc.includes(nomeCliente) || nomeCliente.includes(pc))
      })
      setDetalhe({ receitas, despesas, projetos })
    } catch {
      toast.error("Erro ao carregar detalhes")
    } finally {
      setDetalheLoading(false)
    }
  }

  return (
    <div style={{ padding: "28px 32px", maxWidth: 1400, margin: "0 auto" }}>
      {/* Header */}
      <div style={{ marginBottom: 24, display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 22, fontWeight: 800, color: "#0F172A" }}>Comercial / OPP</h1>
          <p style={{ margin: "6px 0 0", fontSize: 13, color: "#64748B" }}>Clientes e demandas de terceirizacao</p>
        </div>
        <button onClick={syncOPP} disabled={syncLoading} style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 18px", borderRadius: 10, border: "1px solid #E2E8F0", background: "#fff", color: "#475569", fontWeight: 700, fontSize: 13, cursor: syncLoading ? "wait" : "pointer" }}>
          <ArrowPathIcon style={{ width: 16, height: 16, animation: syncLoading ? "spin 1s linear infinite" : "none" }} />
          {syncLoading ? "Sincronizando..." : "Sync OPP"}
        </button>
      </div>

      {/* Tabs */}
      <div style={{ display: "flex", gap: 4, background: "#F1F5F9", borderRadius: 10, padding: 4, width: "fit-content", marginBottom: 20 }}>
        {[{ key: "clientes", label: "Clientes OPP" }, { key: "terceirizados", label: "Demandas de Terceirizacao" }].map(tab => (
          <button key={tab.key} onClick={() => setAba(tab.key)} style={{
            padding: "8px 20px", borderRadius: 8, border: "none", cursor: "pointer", fontWeight: 700, fontSize: 13,
            background: aba === tab.key ? "#fff" : "transparent",
            color: aba === tab.key ? "#7C3AED" : "#64748B",
            boxShadow: aba === tab.key ? "0 1px 4px rgba(0,0,0,0.08)" : "none",
            transition: "all 0.18s",
          }}>{tab.label}</button>
        ))}
      </div>

      {/* CLIENTES TAB */}
      {aba === "clientes" && (
        <>
          {/* Search & Filters */}
          <div style={{ background: "#fff", borderRadius: 14, padding: "16px 20px", border: "1px solid #E2E8F0", marginBottom: 16 }}>
            <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
              <div style={{ flex: 1, position: "relative" }}>
                <svg style={{ position: "absolute", left: 11, top: "50%", transform: "translateY(-50%)", width: 15, height: 15, color: "#94A3B8" }} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
                <input value={busca} onChange={e => setBusca(e.target.value)} placeholder="Buscar por nome, fantasia ou cidade..." style={{ width: "100%", padding: "9px 12px 9px 34px", borderRadius: 8, border: "1.5px solid #E2E8F0", fontSize: 13, color: "#0F172A", fontFamily: "inherit", outline: "none", background: "#F8FAFC", boxSizing: "border-box" }} />
              </div>
            </div>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
              <span style={{ fontSize: 12, fontWeight: 700, color: "#94A3B8", marginRight: 2 }}>SITUACAO:</span>
              <Chip label="Todos" active={!filtroSituacao} onClick={() => setFiltroSituacao("")} />
              <Chip label="Ativo" active={filtroSituacao === "Ativo"} onClick={() => setFiltroSituacao(filtroSituacao === "Ativo" ? "" : "Ativo")} />
              <Chip label="Inativo" active={filtroSituacao === "Inativo"} onClick={() => setFiltroSituacao(filtroSituacao === "Inativo" ? "" : "Inativo")} />
              {tiposCadastro.length > 0 && (
                <>
                  <span style={{ fontSize: 12, fontWeight: 700, color: "#94A3B8", marginLeft: 8, marginRight: 2 }}>TIPO:</span>
                  {tiposCadastro.map(t => <Chip key={t} label={t} active={filtroTipo === t} onClick={() => setFiltroTipo(filtroTipo === t ? "" : t)} />)}
                </>
              )}
              {hasClienteFilters && (
                <button onClick={() => { setBusca(""); setFiltroSituacao(""); setFiltroTipo("") }} style={{ marginLeft: 8, fontSize: 12, fontWeight: 700, color: "#DC2626", background: "none", border: "none", cursor: "pointer" }}>✕ Limpar</button>
              )}
              <span style={{ marginLeft: "auto", fontSize: 12, color: "#94A3B8", fontWeight: 600 }}>{clientesFiltrados.length} de {clientes.length}</span>
            </div>
          </div>

          <div style={{ background: "#fff", borderRadius: 14, border: "1px solid #E2E8F0", overflow: "hidden" }}>
            {loading ? (
              <div style={{ padding: 48, textAlign: "center", color: "#94A3B8" }}>Carregando clientes do OPP...</div>
            ) : (
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse" }}>
                  <thead>
                    <tr style={{ background: "#F8FAFC" }}>
                      {["Razao Social", "Fantasia", "Tipo", "Situacao", "Contato", "Cidade/UF"].map(h => (
                        <th key={h} style={{ padding: "10px 16px", textAlign: "left", fontSize: 11, fontWeight: 700, color: "#94A3B8", textTransform: "uppercase", whiteSpace: "nowrap" }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {clientesFiltrados.length === 0 ? (
                      <tr><td colSpan={6} style={{ padding: "48px 0", textAlign: "center", color: "#94A3B8" }}>Nenhum cliente encontrado</td></tr>
                    ) : clientesFiltrados.slice(0, 100).map((c, i) => (
                      <tr key={i} onClick={() => abrirDetalhe(c)} style={{ borderTop: "1px solid #F1F5F9", cursor: "pointer", transition: "background 0.12s" }}
                        onMouseEnter={e => e.currentTarget.style.background = "#F8FAFC"}
                        onMouseLeave={e => e.currentTarget.style.background = ""}>
                        <td style={{ padding: "12px 16px", fontSize: 13, fontWeight: 700, color: "#0F172A" }}>{c.razao_cliente || "—"}</td>
                        <td style={{ padding: "12px 16px", fontSize: 13, color: "#334155" }}>{c.fantasia_cliente || "—"}</td>
                        <td style={{ padding: "12px 16px", fontSize: 13, color: "#475569" }}>{c.tipo_cadastro || "—"}</td>
                        <td style={{ padding: "12px 16px" }}>
                          <span style={{ fontSize: 11, fontWeight: 700, padding: "3px 8px", borderRadius: 6, background: c.situacao_cliente === "Ativo" ? "#DCFCE7" : "#F1F5F9", color: c.situacao_cliente === "Ativo" ? "#15803D" : "#64748B" }}>{c.situacao_cliente || "—"}</span>
                        </td>
                        <td style={{ padding: "12px 16px", fontSize: 13, color: "#475569" }}>
                          <div>{c.contato_cliente || c.email_cliente || "—"}</div>
                          {(c.fone_cliente || c.celular_cliente) && <div style={{ fontSize: 11, color: "#94A3B8", marginTop: 2 }}>{c.fone_cliente || c.celular_cliente}</div>}
                        </td>
                        <td style={{ padding: "12px 16px", fontSize: 13, color: "#475569" }}>{[c.cidade_cliente, c.uf_cliente].filter(Boolean).join("/") || "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {clientesFiltrados.length > 100 && <div style={{ padding: "12px 20px", fontSize: 12, color: "#94A3B8" }}>Exibindo 100 de {clientesFiltrados.length} clientes</div>}
              </div>
            )}
          </div>
        </>
      )}

      {/* TERCEIRIZADOS TAB */}
      {aba === "terceirizados" && (
        <>
          <div style={{ display: "grid", gridTemplateColumns: `repeat(${Math.min(statusTercOptions.length, 5)},1fr)`, gap: 12, marginBottom: 16 }}>
            {statusTercOptions.map(s => {
              const color = s === "Cancelado" ? "#DC2626" : s === "Concluído" || s === "Entregue" ? "#15803D" : s === "Em Andamento" || s === "Confirmado" ? "#2563EB" : s === "Contas a Pagar" ? "#D97706" : "#64748B"
              return <StatCard key={s} label={s} value={statusTercCount(s)} color={color} />
            })}
          </div>

          {/* Terceirizados Filters */}
          <div style={{ background: "#fff", borderRadius: 14, padding: "16px 20px", border: "1px solid #E2E8F0", marginBottom: 16 }}>
            <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
              <div style={{ flex: 1, position: "relative" }}>
                <svg style={{ position: "absolute", left: 11, top: "50%", transform: "translateY(-50%)", width: 15, height: 15, color: "#94A3B8" }} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
                <input value={buscaTerc} onChange={e => setBuscaTerc(e.target.value)} placeholder="Buscar por projeto, fornecedor ou servico..." style={{ width: "100%", padding: "9px 12px 9px 34px", borderRadius: 8, border: "1.5px solid #E2E8F0", fontSize: 13, color: "#0F172A", fontFamily: "inherit", outline: "none", background: "#F8FAFC", boxSizing: "border-box" }} />
              </div>
            </div>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
              <span style={{ fontSize: 12, fontWeight: 700, color: "#94A3B8", marginRight: 2 }}>STATUS:</span>
              <Chip label="Todos" active={!filtroStatusTerc} onClick={() => setFiltroStatusTerc("")} />
              {statusTercOptions.map(s => <Chip key={s} label={s} active={filtroStatusTerc === s} onClick={() => setFiltroStatusTerc(filtroStatusTerc === s ? "" : s)} />)}
              {hasTercFilters && (
                <button onClick={() => { setBuscaTerc(""); setFiltroStatusTerc("") }} style={{ marginLeft: 8, fontSize: 12, fontWeight: 700, color: "#DC2626", background: "none", border: "none", cursor: "pointer" }}>✕ Limpar</button>
              )}
              <span style={{ marginLeft: "auto", fontSize: 12, color: "#94A3B8", fontWeight: 600 }}>{tercFiltrados.length} de {terceirizados.length}</span>
            </div>
          </div>

          <div style={{ background: "#fff", borderRadius: 14, border: "1px solid #E2E8F0", overflow: "hidden" }}>
            {loadingTerc ? (
              <div style={{ padding: 48, textAlign: "center", color: "#94A3B8" }}>Carregando demandas...</div>
            ) : (
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse" }}>
                  <thead>
                    <tr style={{ background: "#F8FAFC" }}>
                      {["Setor", "Projeto", "Serviço", "Fornecedor", "Responsável", "Valor", "Status"].map(h => (
                        <th key={h} style={{ padding: "10px 16px", textAlign: "left", fontSize: 11, fontWeight: 700, color: "#94A3B8", textTransform: "uppercase", whiteSpace: "nowrap" }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {tercFiltrados.length === 0 ? (
                      <tr><td colSpan={7} style={{ padding: "48px 0", textAlign: "center", color: "#94A3B8" }}>Nenhuma demanda encontrada</td></tr>
                    ) : tercFiltrados.map((t, i) => (
                      <tr key={i} style={{ borderTop: "1px solid #F1F5F9" }}>
                        <td style={{ padding: "12px 16px", fontSize: 11, fontWeight: 700, color: "#7C3AED" }}>
                          {/^(ARQ|INF|SAN)/i.test(t.nomeProjeto || '') ? (t.nomeProjeto || '').match(/^(ARQ|INF|SAN)/i)?.[0].toUpperCase() : "—"}
                        </td>
                        <td style={{ padding: "12px 16px", fontSize: 12, fontWeight: 700, color: "#0F172A", maxWidth: 180, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={t.nomeProjeto}>{t.nomeProjeto || t.ID_Projeto || "—"}</td>
                        <td style={{ padding: "12px 16px", fontSize: 12, color: "#475569", maxWidth: 220, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={t.Descricao_Servico}>{t.Descricao_Servico || "—"}</td>
                        <td style={{ padding: "12px 16px", fontSize: 13, color: "#334155" }}>{t.Fornecedor || "—"}</td>
                        <td style={{ padding: "12px 16px", fontSize: 13, color: "#475569" }}>{t.Responsavel || "—"}</td>
                        <td style={{ padding: "12px 16px", fontSize: 13, fontWeight: 700, color: "#7C3AED" }}>{fmt(t.Valor_Contratado || t.Valor_Estimado)}</td>
                        <td style={{ padding: "12px 16px" }}>
                          <span style={{ fontSize: 11, fontWeight: 700, padding: "3px 8px", borderRadius: 6,
                            background: ["Concluído","Entregue"].includes(t.Status) ? "#DCFCE7" : t.Status === "Cancelado" ? "#FEE2E2" : ["Backlog","Solicitado"].includes(t.Status) ? "#FEF3C7" : ["Em Andamento","Confirmado"].includes(t.Status) ? "#DBEAFE" : t.Status === "Contas a Pagar" ? "#FEF9C3" : "#EEF2FF",
                            color: ["Concluído","Entregue"].includes(t.Status) ? "#15803D" : t.Status === "Cancelado" ? "#DC2626" : ["Backlog","Solicitado"].includes(t.Status) ? "#D97706" : ["Em Andamento","Confirmado"].includes(t.Status) ? "#1D4ED8" : t.Status === "Contas a Pagar" ? "#854D0E" : "#4338CA"
                          }}>{t.Status || "—"}</span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}

      {/* DRAWER: Detalhe do Cliente */}
      {clienteSelecionado && (
        <>
          {/* Overlay */}
          <div onClick={() => setClienteSelecionado(null)} style={{ position: "fixed", inset: 0, background: "rgba(15,23,42,0.35)", zIndex: 40, backdropFilter: "blur(2px)" }} />
          {/* Panel */}
          <div style={{ position: "fixed", top: 0, right: 0, bottom: 0, width: 560, background: "#fff", zIndex: 50, boxShadow: "-8px 0 40px rgba(0,0,0,0.15)", display: "flex", flexDirection: "column", overflowY: "auto" }}>
            {/* Header do drawer */}
            <div style={{ padding: "20px 24px 16px", borderBottom: "1px solid #E2E8F0", display: "flex", justifyContent: "space-between", alignItems: "flex-start", position: "sticky", top: 0, background: "#fff", zIndex: 1 }}>
              <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
                <div style={{ width: 40, height: 40, borderRadius: 10, background: "#EEF2FF", display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <BuildingOffice2Icon style={{ width: 22, height: 22, color: "#7C3AED" }} />
                </div>
                <div>
                  <h2 style={{ margin: 0, fontSize: 16, fontWeight: 800, color: "#0F172A" }}>{clienteSelecionado.razao_cliente || "Cliente"}</h2>
                  {clienteSelecionado.fantasia_cliente && <p style={{ margin: "2px 0 0", fontSize: 12, color: "#64748B" }}>{clienteSelecionado.fantasia_cliente}</p>}
                </div>
              </div>
              <button onClick={() => setClienteSelecionado(null)} style={{ background: "none", border: "none", cursor: "pointer", padding: 4, borderRadius: 6, color: "#94A3B8" }}>
                <XMarkIcon style={{ width: 20, height: 20 }} />
              </button>
            </div>

            <div style={{ padding: "20px 24px", flex: 1 }}>
              {/* Info do cliente */}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 20 }}>
                {[
                  ["CNPJ/CPF", clienteSelecionado.cnpj_cliente || clienteSelecionado.cpf_cliente],
                  ["Situacao", clienteSelecionado.situacao_cliente],
                  ["Tipo", clienteSelecionado.tipo_cadastro],
                  ["Cidade/UF", [clienteSelecionado.cidade_cliente, clienteSelecionado.uf_cliente].filter(Boolean).join("/")],
                  ["Telefone", clienteSelecionado.telefone_cliente || clienteSelecionado.celular_cliente],
                  ["Email", clienteSelecionado.email_cliente],
                ].filter(([, v]) => v).map(([label, value]) => (
                  <div key={label} style={{ background: "#F8FAFC", borderRadius: 8, padding: "10px 12px" }}>
                    <div style={{ fontSize: 10, fontWeight: 700, color: "#94A3B8", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 3 }}>{label}</div>
                    <div style={{ fontSize: 13, fontWeight: 600, color: "#334155" }}>{value}</div>
                  </div>
                ))}
              </div>

              {detalheLoading ? (
                <div style={{ padding: "40px 0", textAlign: "center", color: "#94A3B8" }}>Carregando historico financeiro...</div>
              ) : detalhe ? (
                <>
                  {/* Resumo financeiro */}
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10, marginBottom: 20 }}>
                    <div style={{ background: "#F0FDF4", borderRadius: 10, padding: "12px 14px", border: "1px solid #BBF7D0" }}>
                      <div style={{ fontSize: 10, fontWeight: 700, color: "#15803D", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 4 }}>Receitas OPP</div>
                      <div style={{ fontSize: 20, fontWeight: 900, color: "#15803D" }}>{fmt(detalhe.receitas.reduce((s, t) => s + (parseFloat(t.Valor) || 0), 0))}</div>
                      <div style={{ fontSize: 11, color: "#4ADE80" }}>{detalhe.receitas.length} lancamentos</div>
                    </div>
                    <div style={{ background: "#FFF7ED", borderRadius: 10, padding: "12px 14px", border: "1px solid #FED7AA" }}>
                      <div style={{ fontSize: 10, fontWeight: 700, color: "#C2410C", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 4 }}>Despesas OPP</div>
                      <div style={{ fontSize: 20, fontWeight: 900, color: "#C2410C" }}>{fmt(detalhe.despesas.reduce((s, t) => s + (parseFloat(t.Valor) || 0), 0))}</div>
                      <div style={{ fontSize: 11, color: "#FB923C" }}>{detalhe.despesas.length} lancamentos</div>
                    </div>
                    <div style={{ background: "#EEF2FF", borderRadius: 10, padding: "12px 14px", border: "1px solid #C7D2FE" }}>
                      <div style={{ fontSize: 10, fontWeight: 700, color: "#4338CA", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 4 }}>Projetos PAR</div>
                      <div style={{ fontSize: 20, fontWeight: 900, color: "#4338CA" }}>{detalhe.projetos.length}</div>
                      <div style={{ fontSize: 11, color: "#818CF8" }}>vinculados</div>
                    </div>
                  </div>

                  {/* Projetos PAR */}
                  {detalhe.projetos.length > 0 && (
                    <div style={{ marginBottom: 20 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
                        <FolderIcon style={{ width: 15, height: 15, color: "#7C3AED" }} />
                        <span style={{ fontSize: 12, fontWeight: 700, color: "#475569", textTransform: "uppercase", letterSpacing: "0.06em" }}>Projetos no Sistema PAR</span>
                      </div>
                      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                        {detalhe.projetos.map((p, i) => (
                          <div key={i} style={{ background: "#F8FAFC", borderRadius: 8, padding: "10px 14px", border: "1px solid #E2E8F0", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                            <div>
                              <div style={{ fontSize: 13, fontWeight: 700, color: "#0F172A" }}>{p.Nome || p.ID_Projeto}</div>
                              <div style={{ fontSize: 11, color: "#64748B" }}>{[p.Setor, p.Status_Projeto].filter(Boolean).join(" · ")}</div>
                            </div>
                            <div style={{ fontSize: 13, fontWeight: 700, color: "#7C3AED" }}>{fmt(p.Valor_Contrato)}</div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Historico financeiro */}
                  {(detalhe.receitas.length > 0 || detalhe.despesas.length > 0) && (
                    <div>
                      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
                        <BanknotesIcon style={{ width: 15, height: 15, color: "#7C3AED" }} />
                        <span style={{ fontSize: 12, fontWeight: 700, color: "#475569", textTransform: "uppercase", letterSpacing: "0.06em" }}>Historico Financeiro OPP</span>
                      </div>
                      <div style={{ borderRadius: 10, overflow: "hidden", border: "1px solid #E2E8F0" }}>
                        <table style={{ width: "100%", borderCollapse: "collapse" }}>
                          <thead>
                            <tr style={{ background: "#F8FAFC" }}>
                              {["Tipo", "Descricao", "Vencimento", "Valor", "Status"].map(h => (
                                <th key={h} style={{ padding: "8px 12px", fontSize: 10, fontWeight: 700, color: "#94A3B8", textTransform: "uppercase", textAlign: "left" }}>{h}</th>
                              ))}
                            </tr>
                          </thead>
                          <tbody>
                            {[...detalhe.receitas, ...detalhe.despesas].sort((a, b) => new Date(b.Data_Vencimento || 0) - new Date(a.Data_Vencimento || 0)).slice(0, 30).map((t, i) => (
                              <tr key={i} style={{ borderTop: "1px solid #F1F5F9" }}>
                                <td style={{ padding: "8px 12px" }}>
                                  <span style={{ fontSize: 10, fontWeight: 700, padding: "2px 6px", borderRadius: 4, background: (t.Tipo || '').toLowerCase() === "receita" ? "#DCFCE7" : "#FEE2E2", color: (t.Tipo || '').toLowerCase() === "receita" ? "#15803D" : "#DC2626" }}>{t.Tipo}</span>
                                </td>
                                <td style={{ padding: "8px 12px", fontSize: 12, color: "#334155", maxWidth: 140, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{t.Descricao || t.Categoria || "—"}</td>
                                <td style={{ padding: "8px 12px", fontSize: 12, color: "#64748B" }}>{t.Data_Vencimento ? new Date(t.Data_Vencimento).toLocaleDateString("pt-BR") : "—"}</td>
                                <td style={{ padding: "8px 12px", fontSize: 12, fontWeight: 700, color: (t.Tipo || '').toLowerCase() === "receita" ? "#15803D" : "#DC2626" }}>{fmt(t.Valor)}</td>
                                <td style={{ padding: "8px 12px" }}>
                                  <span style={{ fontSize: 10, fontWeight: 700, padding: "2px 6px", borderRadius: 4, background: t.Situacao === "Recebido" || t.Situacao === "Pago" ? "#DCFCE7" : t.Situacao === "Atrasado" ? "#FEE2E2" : "#F1F5F9", color: t.Situacao === "Recebido" || t.Situacao === "Pago" ? "#15803D" : t.Situacao === "Atrasado" ? "#DC2626" : "#64748B" }}>{t.Situacao || "—"}</span>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                        {(detalhe.receitas.length + detalhe.despesas.length) > 30 && (
                          <div style={{ padding: "8px 12px", fontSize: 11, color: "#94A3B8" }}>Exibindo 30 de {detalhe.receitas.length + detalhe.despesas.length} lancamentos</div>
                        )}
                      </div>
                    </div>
                  )}

                  {detalhe.receitas.length === 0 && detalhe.despesas.length === 0 && detalhe.projetos.length === 0 && (
                    <div style={{ padding: "40px 0", textAlign: "center", color: "#94A3B8" }}>
                      <BuildingOffice2Icon style={{ width: 40, height: 40, margin: "0 auto 12px", opacity: 0.3 }} />
                      <p style={{ fontSize: 13 }}>Nenhum historico encontrado para este cliente</p>
                    </div>
                  )}
                </>
              ) : null}
            </div>
          </div>
        </>
      )}
    </div>
  )
}
