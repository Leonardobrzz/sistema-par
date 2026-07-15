import { useState, useEffect, useCallback, useMemo } from "react"
import { useParams, useNavigate } from "react-router-dom"
import { toast } from "react-hot-toast"
import {
  BadgeDollarSign, Save, Calculator, AlertTriangle, Plus, Trash2,
  CheckCircle, ChevronDown, ChevronRight, ArrowLeft, Lock, RefreshCw,
  FileSpreadsheet, ThumbsUp, TrendingUp, Search,
} from "lucide-react"
import api from "../utils/api"

// ── Formatters ───────────────────────────────────────────────────────────────
const fmt = (v) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v || 0)
const fmtN = (v, dec = 1) => Number(v || 0).toFixed(dec)
// Aceita vírgula ou ponto como separador decimal (formato BR ou EN)
const parseBR = (v) => parseFloat(String(v || 0).replace(/\./g, '').replace(',', '.')) || 0
const fmtH = (h) => {
  const total = Math.round((h || 0) * 60)
  const hh = Math.floor(total / 60)
  const mm = total % 60
  return mm > 0 ? `${hh}h${String(mm).padStart(2, "0")}min` : `${hh}h`
}

// ── Shared styles ────────────────────────────────────────────────────────────
const SL = { fontSize: 12, fontWeight: 700, color: "#475569", textTransform: "uppercase", letterSpacing: "0.05em", display: "block", marginBottom: 4 }
const INPUT = { width: "100%", padding: "9px 12px", borderRadius: 8, border: "1.5px solid #E2E8F0", background: "#F8FAFC", color: "#0F172A", fontSize: 13, fontFamily: "inherit", outline: "none", boxSizing: "border-box" }

function Field({ label, children }) {
  return <div style={{ display: "flex", flexDirection: "column", gap: 4 }}><label style={SL}>{label}</label>{children}</div>
}

function Section({ title, open, onToggle, children, badge }) {
  return (
    <div style={{ background: "#fff", borderRadius: 14, border: "1.5px solid #E2E8F0", overflow: "hidden" }}>
      <button onClick={onToggle} style={{ width: "100%", display: "flex", alignItems: "center", gap: 10, padding: "14px 20px", background: "none", border: "none", cursor: "pointer", textAlign: "left" }}>
        {open ? <ChevronDown size={16} color="#7C3AED" /> : <ChevronRight size={16} color="#94A3B8" />}
        <span style={{ fontWeight: 800, fontSize: 14, color: "#0F172A", flex: 1 }}>{title}</span>
        {badge != null && <span style={{ fontSize: 12, fontWeight: 700, color: "#7C3AED", background: "#EDE9FE", padding: "2px 10px", borderRadius: 6 }}>{badge}</span>}
      </button>
      {open && <div style={{ padding: "0 20px 20px", borderTop: "1px solid #F1F5F9" }}>{children}</div>}
    </div>
  )
}

// ── PAR calcs ────────────────────────────────────────────────────────────────
const pBR = (v) => parseFloat(String(v || 0).replace(/\./g, '').replace(',', '.')) || 0

function calcPAR(form) {
  const V = pBR(form.valorContrato)
  const ip = Math.max(pBR(form.impostosPerc) || 20, 16.33)
  const ta = Math.max(pBR(form.taxaAdmPerc) || 12, 5)
  const co = 7.5
  const impostos = V * ip / 100
  const taxaAdm = V * ta / 100
  const comissao = V * co / 100
  const receitaLiquida = V - impostos - taxaAdm - comissao
  const totalTerceiros = (form.terceirizados || []).reduce((s, t) => s + pBR(t.custo), 0)
  const totalEquipe = (form.equipe || []).reduce((s, e) => s + pBR(e.horas) * (pBR(e.mediaHora) || 36.4), 0)
  const totalDespesas = (form.despesas || []).reduce((s, d) => s + pBR(d.valor), 0)
  const totalDespesasInternas = (form.despesasInternas || []).reduce((s, d) => s + pBR(d.custo), 0)
  const totalCustos = totalTerceiros + totalEquipe + totalDespesasInternas + totalDespesas
  const custoTotalDisplay = impostos + taxaAdm + comissao + totalTerceiros + totalEquipe + totalDespesasInternas + totalDespesas
  const lucro = receitaLiquida - totalCustos
  const lucroPerc = V > 0 ? (lucro / V) * 100 : 0
  const percTerceiros = V > 0 ? (totalTerceiros / V) * 100 : 0
  const percDespesasGerais = V > 0 ? (totalDespesas / V) * 100 : 0
  const custoProducaoPerc = V > 0 ? ((totalEquipe + totalDespesasInternas + totalTerceiros) / V) * 100 : 0
  return { V, ip, ta, co, impostos, taxaAdm, comissao, receitaLiquida, totalTerceiros, totalEquipe, totalDespesasInternas, totalDespesas, totalCustos, custoTotalDisplay, lucro, lucroPerc, percTerceiros, percDespesasGerais, custoProducaoPerc }
}

const FORM0 = {
  nomeProjeto: "", cliente: "", nrContratoOS: "", nrOsOpp: "", setor: "", tipologia: "", empresa: "",
  respPlanejamento: "", respAprovacao: "", linkClickUp: "", justificativa: "",
  valorContrato: "", impostosPerc: "20", taxaAdmPerc: "12",
  dataInicioOS: "", dataOsExterna: "", dataEntregaContrato: "", dataEntregaPlanejada: "",
  medicoes: [], terceirizados: [], equipe: [], despesas: [], despesasInternas: [],
}

// ── Plan vs Real components ──────────────────────────────────────────────────
function BurnBar({ label, planejado, real }) {
  const max = Math.max(planejado, real, 0.01)
  const over = real > planejado
  return (
    <div style={{ marginBottom: 16 }}>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6, fontSize: 13 }}>
        <span style={{ fontWeight: 600, color: "#0F172A" }}>{label}</span>
        <div style={{ display: "flex", gap: 16 }}>
          <span style={{ color: "#94A3B8" }}>Est. <strong style={{ color: "#475569" }}>{fmtH(planejado)}</strong></span>
          <span style={{ color: over ? "#DC2626" : "#15803D", fontWeight: 700 }}>Real {fmtH(real)}</span>
          {over && <span style={{ color: "#DC2626", fontWeight: 700, fontSize: 12, background: "#FEE2E2", padding: "1px 8px", borderRadius: 6 }}>+{fmtH(real - planejado)}</span>}
        </div>
      </div>
      <div style={{ position: "relative", height: 10, background: "#F1F5F9", borderRadius: 6 }}>
        <div style={{ position: "absolute", top: 0, left: 0, height: "100%", width: `${(planejado / max) * 100}%`, background: "#C4B5FD", borderRadius: 6 }} />
        <div style={{ position: "absolute", top: 0, left: 0, height: "100%", width: `${(real / max) * 100}%`, background: over ? "#EF4444" : "#22C55E", borderRadius: 6, opacity: 0.85 }} />
      </div>
      <div style={{ display: "flex", gap: 16, marginTop: 4, fontSize: 11, color: "#94A3B8" }}>
        <span><span style={{ display: "inline-block", width: 8, height: 8, borderRadius: 2, background: "#C4B5FD", marginRight: 4 }} />Estimado</span>
        <span><span style={{ display: "inline-block", width: 8, height: 8, borderRadius: 2, background: over ? "#EF4444" : "#22C55E", marginRight: 4 }} />Rastreado</span>
      </div>
    </div>
  )
}

// ── Main component ───────────────────────────────────────────────────────────
export default function PlanejamentoFinanceiro() {
  const { id: paramId } = useParams()
  const navigate = useNavigate()

  const [projetos, setProjetos] = useState([])
  const [projetoId, setProjetoId] = useState(paramId || "")
  const [centrosCusto, setCentrosCusto] = useState([])
  const [ccSugestoes, setCcSugestoes] = useState([])
  const [ccFocado, setCcFocado] = useState(false)
  const [planId, setPlanId] = useState(null)          // ID interno do planejamento
  const [planStatus, setPlanStatus] = useState(null)
  const [planTravado, setPlanTravado] = useState(false)
  const [travandoOPP, setTravandoOPP] = useState(false)
  const [showEstornoModal, setShowEstornoModal] = useState(false)
  const [motivoEstorno, setMotivoEstorno] = useState("")
  const [estornando, setEstornando] = useState(false)
  const [baseline, setBaseline] = useState(null)
  const [historicoBaselines, setHistoricoBaselines] = useState([])
  const [baselineViewing, setBaselineViewing] = useState(null) // versão sendo visualizada
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [showBuscaOS, setShowBuscaOS] = useState(false)
  const [buscaOSTexto, setBuscaOSTexto] = useState("")
  const [buscaOSResultados, setBuscaOSResultados] = useState([])
  const [buscaOSLoading, setBuscaOSLoading] = useState(false)
  const [lockingBaseline, setLockingBaseline] = useState(false)
  const [approving, setApproving] = useState(false)
  const [loadingProjetos, setLoadingProjetos] = useState(true)
  const [tab, setTab] = useState("planejamento")
  const [comparativo, setComparativo] = useState(null)
  const [loadingComp, setLoadingComp] = useState(false)
  const [despesasOPP, setDespesasOPP] = useState(null)
  const [loadingDespesas, setLoadingDespesas] = useState(false)
  const [form, setForm] = useState(FORM0)
  const [editingMedicao, setEditingMedicao] = useState(null)
  const [sections, setSections] = useState({ geral: true, financeiro: true, medicoes: false, terceirizados: false, equipe: false, despesas: false })
  const [filtroSetor, setFiltroSetor] = useState("")
  const [filtroCliente, setFiltroCliente] = useState("")
  const [filtroBusca, setFiltroBusca] = useState("")
  const [filtroStatus, setFiltroStatus] = useState("Em Andamento")

  useEffect(() => {
    api.get("/projetos").then(r => setProjetos(r.data?.projetos || r.data || [])).catch(() => []).finally(() => setLoadingProjetos(false))

  }, [])

  // Sync URL param → state
  useEffect(() => { if (paramId) setProjetoId(paramId) }, [paramId])

  const carregar = useCallback(async (id) => {
    if (!id) return
    setLoading(true)
    const proj = projetos.find(p => p.ID_Projeto === id) || {}
    try {
      const r = await api.get(`/planejamento/${id}`)
      const p = r.data
      const d = r.data.dadosCompletos || {}
      setPlanId(p.ID || null)
      setPlanStatus(p.Status || null)
      setPlanTravado(!!(p.Travado))
      setBaseline(d._baseline || null)
      setHistoricoBaselines(d._historicoBaselines || [])
      setForm({
        nomeProjeto:       p.Nome_Projeto       || d.nomeProjeto       || proj.Nome     || "",
        cliente:           p.Cliente            || d.cliente           || proj.Cliente  || "",
        nrContratoOS:      p.Nr_Contrato_OS     || d.nrContratoOS      || "",
        nrOsOpp:           p.Nr_OS_OPP          || d.nrOsOpp           || "",
        setor:             p.Setor              || d.setor             || proj.Setor    || "",
        tipologia:         p.Tipologia          || d.tipologia         || "",
        empresa:           p.Empresa            || d.empresa           || "",
        respPlanejamento:  p.Resp_Planejamento  || d.respPlanejamento  || "",
        respAprovacao:     p.Resp_Aprovacao     || d.respAprovacao     || "",
        linkClickUp:       p.Link_ClickUp       || d.linkClickUp       || proj.Link_ClickUp || "",
        justificativa:     d.justificativa      || "",
        valorContrato:     p.Valor_Contrato     || d.valorContrato     || proj.Valor_Global || "",
        impostosPerc:      p.Impostos_Perc      || d.impostosPerc      || "20",
        taxaAdmPerc:       p.Taxa_Adm_Perc      || d.taxaAdmPerc       || "12",
        dataInicioOS:         p.Data_Inicio_OS         || d.dataInicioOS         || "",
        dataOsExterna:        p.Data_OS_Externa        || d.dataOsExterna        || "",
        dataEntregaContrato:  p.Data_Entrega_Contrato  || d.dataEntregaContrato  || proj.Data_Entrega_Contrato || "",
        dataEntregaPlanejada: p.Data_Entrega_Planejada || d.dataEntregaPlanejada || "",
        medicoes:      Array.isArray(d.medicoes)      ? d.medicoes      : [],
        terceirizados: Array.isArray(d.terceirizados)  ? d.terceirizados : [],
        equipe:           Array.isArray(d.equipe)           ? d.equipe           : [],
        despesas:         Array.isArray(d.despesas)         ? d.despesas         : [],
        despesasInternas: Array.isArray(d.despesasInternas) ? d.despesasInternas : [],
      })
    } catch {
      setPlanId(null); setPlanStatus(null); setBaseline(null); setHistoricoBaselines([])
      setForm({ ...FORM0, nomeProjeto: proj.Nome || "", cliente: proj.Cliente || "", setor: proj.Setor || "", linkClickUp: proj.Link_ClickUp || "", dataEntregaContrato: proj.Data_Entrega_Contrato || "", valorContrato: proj.Valor_Global || "" })
    }
    setLoading(false)
  }, [projetos])

  useEffect(() => { if (projetoId && projetos.length > 0) carregar(projetoId) }, [projetoId, carregar]) // eslint-disable-line

  const carregarComparativo = useCallback(async (syncFirst = false) => {
    if (!projetoId) return
    setLoadingComp(true)
    try {
      if (syncFirst) {
        try {
          const sr = await api.post(`/clickup/sync-horas/${projetoId}`)
          console.log('[sync-horas]', sr.data)
          if (!sr.data.idClickUp) toast.error("Projeto sem ID ClickUp — abra o planejamento e preencha o campo Link ClickUp para vincular.")
        } catch {}
      }
      const r = await api.get(`/planejamento/${projetoId}/comparativo`)
      setComparativo(r.data)
    } catch {
      setComparativo(null)
    }
    setLoadingComp(false)
  }, [projetoId])

  useEffect(() => { if (tab === "real") carregarComparativo() }, [tab, carregarComparativo])

  const carregarDespesasOPP = useCallback(async () => {
    if (!projetoId || !form.nrContratoOS) return
    setLoadingDespesas(true)
    try {
      const r = await api.get(`/planejamento/${projetoId}/despesas-opp`)
      setDespesasOPP(r.data)
    } catch { setDespesasOPP(null) }
    setLoadingDespesas(false)
  }, [projetoId, form.nrContratoOS])

  useEffect(() => { if (tab === "despesas") carregarDespesasOPP() }, [tab, carregarDespesasOPP])

  const f = (k, v) => setForm(prev => ({ ...prev, [k]: v }))
  const addRow = (key, obj) => setForm(prev => ({ ...prev, [key]: [...(prev[key] || []), obj] }))
  const delRow = (key, i) => setForm(prev => ({ ...prev, [key]: prev[key].filter((_, idx) => idx !== i) }))
  const editRow = (key, i, k2, v) => setForm(prev => {
    const arr = [...prev[key]]
    arr[i] = { ...arr[i], [k2]: v }
    return { ...prev, [key]: arr }
  })

  const salvarMedicao = (i) => {
    setForm(prev => {
      const arr = [...prev.medicoes]
      const m = { ...arr[i] }
      const vc = parseBR(prev.valorContrato)
      if (vc > 0) {
        const hasPerc = m.percentual && parseBR(m.percentual) > 0
        const hasVal = m.valor && parseBR(m.valor) > 0
        if (hasPerc && !hasVal) {
          m.valor = fmtN(parseBR(m.percentual) * vc / 100, 2).replace('.', ',')
        } else if (hasVal && !hasPerc) {
          m.percentual = fmtN(parseBR(m.valor) / vc * 100, 2).replace('.', ',')
        }
      }
      arr[i] = m
      return { ...prev, medicoes: arr }
    })
    setEditingMedicao(null)
  }

  const toggle = (k) => setSections(s => ({ ...s, [k]: !s[k] }))

  const par = calcPAR(form)
  const margemOk = par.lucroPerc >= 23
  const tercOk = par.percTerceiros <= 25
  const prodOk = par.custoProducaoPerc <= 30
  const despGeraisOk = par.percDespesasGerais <= 7.5
  const somaMedicoes = (form.medicoes || []).reduce((s, m) => s + parseBR(m.percentual), 0)

  const projetoSelecionado = projetos.find(p => p.ID_Projeto === projetoId)

  const SETORES_PAR = ['Arquitetura', 'Saneamento', 'Infraestrutura', 'Administrativo']
  const clientesUnicos = useMemo(() => [...new Set(projetos.map(p => p.Cliente).filter(Boolean))].sort(), [projetos])
  const statusUnicos = useMemo(() => [...new Set(projetos.map(p => p.Status).filter(Boolean))].sort(), [projetos])
  const SETOR_PREFIX = { 'Arquitetura': 'ARQ', 'Saneamento': 'SAN', 'Infraestrutura': 'INF' }
  const projetosFiltrados = useMemo(() => {
    const seen = new Set()
    return projetos.filter(p => {
      if (seen.has(p.ID_Projeto)) return false
      seen.add(p.ID_Projeto)
      if (filtroSetor) {
        const prefix = SETOR_PREFIX[filtroSetor]
        if (prefix) {
          // filtra pelo prefixo do nome (ARQ-, SAN-, INF-) — mais confiável que o campo Setor
          if (!(p.Nome || '').toUpperCase().startsWith(prefix + '-')) return false
        } else {
          // Administrativo e outros: usa campo Setor
          if (!(p.Setor || '').toLowerCase().includes(filtroSetor.toLowerCase())) return false
        }
      }
      if (filtroCliente && !(p.Cliente || '').toLowerCase().includes(filtroCliente.toLowerCase())) return false
      if (filtroStatus) {
        const st = p.Status || ''
        // "Em Andamento" cobre também "Em Andamento (Atrasado)"
        if (filtroStatus === 'Em Andamento') { if (!st.startsWith('Em Andamento')) return false }
        else if (st !== filtroStatus) return false
      }
      if (filtroBusca) {
        const b = filtroBusca.toLowerCase()
        if (!(p.Nome || '').toLowerCase().includes(b) && !(p.Cliente || '').toLowerCase().includes(b)) return false
      }
      return true
    })
  }, [projetos, filtroSetor, filtroCliente, filtroStatus, filtroBusca])

  async function salvar(status = "Rascunho") {
    if (!projetoId) return toast.error("Selecione um projeto")
    const proj = projetoSelecionado || {}
    setSaving(true)
    try {
      const payload = {
        ...form,
        idProjeto: projetoId,
        status,
        nomeProjeto: form.nomeProjeto || proj.Nome     || "",
        cliente:     form.cliente     || proj.Cliente  || "",
        setor:       form.setor       || proj.Setor    || "",
        linkClickUp: form.linkClickUp || proj.Link_ClickUp || "",
      }
      await api.post("/planejamento", payload)
      toast.success(status === "Rascunho" ? "Rascunho salvo!" : "Enviado para aprovação!")
      carregar(projetoId)
    } catch (err) {
      toast.error(err.response?.data?.error || "Erro ao salvar")
    } finally { setSaving(false) }
  }

  async function carregarCentrosCusto() {
    if (centrosCusto.length > 0) return
    try {
      const r = await api.get('/opp/centros-custo')
      const lista = Array.isArray(r.data) ? r.data : []
      const nomes = lista.map(c => (c.nome || '').toUpperCase()).filter(Boolean).sort()
      setCentrosCusto(nomes)
    } catch { /* silencioso */ }
  }

  function onCcChange(val) {
    f("nrContratoOS", val.toUpperCase())
    const q = val.toUpperCase().trim()
    if (q.length < 2) { setCcSugestoes([]); return }
    const sugs = centrosCusto.filter(c => c.includes(q)).slice(0, 10)
    setCcSugestoes(sugs)
  }

  function selecionarCc(nome) {
    f("nrContratoOS", nome)
    setCcSugestoes([])
    setCcFocado(false)
  }

  async function importarDespesasOPP() {
    const cc = form.nrContratoOS?.trim()
    if (!cc) return toast.error("Preencha o campo 'Nome do Centro de Custo' antes de importar.")
    if (!projetoId) return toast.error("Selecione um projeto")
    try {
      toast.loading("Buscando despesas no OPP...", { id: "opp-cc-import" })
      const r = await api.get(`/planejamento/${projetoId}/despesas-opp?centroCusto=${encodeURIComponent(cc)}`, { timeout: 120000 })
      toast.dismiss("opp-cc-import")
      const { lancamentos, centroCustoEncontrado } = r.data
      if (!centroCustoEncontrado) return toast.error(`Centro de custo "${cc}" não encontrado no OPP.`)
      if (!lancamentos?.length) return toast("Nenhuma despesa encontrada para este centro de custo.")
      const terceirizados = lancamentos.map(l => ({
        servico: l.descricao || l.fornecedor || "",
        vinculo: "",
        valorRef: l.valor ? l.valor.toFixed(2).replace(".", ",") : "",
        custo: l.valor ? l.valor.toFixed(2).replace(".", ",") : "",
      }))
      setForm(prev => ({ ...prev, terceirizados }))
      setSections(s => ({ ...s, terceirizados: true }))
      toast.success(`${terceirizados.length} serviços terceirizados importados do OPP!`)
    } catch (err) {
      toast.dismiss("opp-cc-import")
      toast.error(err.response?.data?.error || err.message || "Erro ao importar do OPP")
    }
  }

  async function importarDoOPP() {
    if (!form.nrOsOpp) return toast.error("Preencha o campo 'O.S. OPP' com o número da Ordem de Serviço do OPP")
    if (!projetoId) return toast.error("Selecione um projeto")
    try {
      toast.loading("Buscando Ordens de Compra no OPP...", { id: "opp-import" })
      const nr = encodeURIComponent(form.nrOsOpp)
      const r = await api.get(`/planejamento/${projetoId}/importar-os?nrOs=${nr}`, { timeout: 120000 })
      toast.dismiss("opp-import")
      const data = r.data
      if (!data.osEncontrada) {
        toast.error(`O.S. "${form.nrOsOpp}" não encontrada no OPP`)
        console.warn("[importarDoOPP] OS não encontrada. Debug:", data)
        return
      }
      if (!data.terceirizados?.length) {
        toast("Nenhuma Ordem de Compra encontrada para esta O.S.")
        return
      }
      setForm(prev => ({ ...prev, terceirizados: data.terceirizados }))
      setSections(s => ({ ...s, terceirizados: true }))
      toast.success(`${data.terceirizados.length} serviços terceirizados importados do OPP!`)
    } catch (err) {
      toast.dismiss("opp-import")
      const msg = err.response?.data?.error || err.response?.data?.message || err.message || "Erro ao importar do OPP"
      console.error("[importarDoOPP]", err.response?.status, msg, err)
      toast.error(msg)
    }
  }

  async function buscarOS(texto) {
    setBuscaOSTexto(texto)
    if (!texto || texto.length < 2) { setBuscaOSResultados([]); return }
    setBuscaOSLoading(true)
    try {
      const r = await api.get(`/planejamento/opp/ordens-servico?busca=${encodeURIComponent(texto)}`)
      setBuscaOSResultados(r.data.ordens || [])
    } catch { setBuscaOSResultados([]) }
    finally { setBuscaOSLoading(false) }
  }

  async function travarOPP() {
    if (!planId) return toast.error("Salve o planejamento primeiro")
    if (!form.nrContratoOS) return toast.error("Preencha o Nome do Centro de Custo antes de travar")
    if (!window.confirm(`Travar vínculo OPP?\n\nO PAR vai buscar sempre por:\n"${form.nrContratoOS}"\n\nEsse nome não poderá ser alterado depois.`)) return
    setTravandoOPP(true)
    try {
      const r = await api.post(`/planejamento/${projetoId}/travar`)
      toast.success(r.data.message || "Vínculo OPP travado!")
      setPlanTravado(true)
    } catch (err) {
      toast.error(err.response?.data?.error || "Erro ao travar vínculo")
    } finally { setTravandoOPP(false) }
  }

  async function confirmarEstorno() {
    if (!motivoEstorno.trim()) { toast.error("Informe o motivo do estorno."); return }
    setEstornando(true)
    try {
      await api.post(`/planejamento/${projetoId}/destravar`, { motivo: motivoEstorno })
      toast.success("Planejamento estornado. Pode editar e gerar nova baseline.")
      setPlanTravado(false)
      setShowEstornoModal(false)
      setMotivoEstorno("")
    } catch (err) {
      toast.error(err.response?.data?.error || "Erro ao estornar planejamento")
    } finally { setEstornando(false) }
  }

  async function travarBaseline() {
    if (!planId) return toast.error("Salve o planejamento primeiro")
    setLockingBaseline(true)
    try {
      const r = await api.post(`/planejamento/${planId}/baseline`)
      toast.success(r.data.message || "Baseline travado!")
      carregar(projetoId)
    } catch (err) {
      toast.error(err.response?.data?.error || "Erro ao travar baseline")
    } finally { setLockingBaseline(false) }
  }

  async function aprovar() {
    if (!planId) return toast.error("Nenhum planejamento encontrado")
    if (!window.confirm("Confirmar aprovação deste planejamento?")) return
    setApproving(true)
    try {
      await api.post(`/planejamento/${planId}/aprovar`, { acao: "aprovar" })
      toast.success("Planejamento aprovado!")
      carregar(projetoId)
    } catch (err) {
      toast.error(err.response?.data?.error || "Erro ao aprovar")
    } finally { setApproving(false) }
  }

  async function downloadExcel() {
    if (!projetoId) return
    try {
      const res = await api.get(`/relatorios/planejamento/${projetoId}/excel`, { responseType: "blob" })
      const url = URL.createObjectURL(res.data)
      const a = document.createElement("a"); a.href = url; a.download = `Planejamento_${form.nomeProjeto || projetoId}.xlsx`; a.click()
      URL.revokeObjectURL(url)
    } catch { toast.error("Erro ao gerar Excel") }
  }

  // ── Status badge colors ───────────────────────────────────────────────────
  const statusCfg = {
    "Rascunho":            { bg: "#F8FAFC", color: "#64748B", border: "#E2E8F0" },
    "Pendente Aprovação":  { bg: "#FFFBEB", color: "#B45309", border: "#FDE68A" },
    "Aprovado":            { bg: "#DCFCE7", color: "#15803D", border: "#86EFAC" },
    "Rejeitado":           { bg: "#FEE2E2", color: "#DC2626", border: "#FECACA" },
  }
  const sc = statusCfg[planStatus] || statusCfg["Rascunho"]
  const fmtCur = (v) => Number(v || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })

  return (
    <div style={{ paddingBottom: 60 }}>

      {/* ── Header ── */}
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 24, flexWrap: "wrap" }}>
        <button onClick={() => navigate("/projetos")}
          style={{ display: "flex", alignItems: "center", gap: 4, padding: "7px 12px", borderRadius: 8, border: "1.5px solid #E2E8F0", background: "#fff", color: "#475569", fontWeight: 600, fontSize: 13, cursor: "pointer" }}>
          <ArrowLeft size={15} /> Projetos
        </button>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
            <BadgeDollarSign size={20} color="#7C3AED" />
            <span style={{ fontWeight: 900, fontSize: 18, color: "#0F172A", textTransform: "uppercase", letterSpacing: "0.06em" }}>
              Planejamento Financeiro
            </span>
            {(form.nomeProjeto || projetoSelecionado?.Nome) && (
              <span style={{ fontSize: 12, fontWeight: 700, color: "#64748B" }}>
                — {form.nomeProjeto || projetoSelecionado?.Nome}
              </span>
            )}
            {form.setor && (
              <span style={{ fontSize: 11, fontWeight: 700, color: "#7C3AED", background: "#EDE9FE", padding: "2px 8px", borderRadius: 6, textTransform: "uppercase" }}>
                {form.setor}
              </span>
            )}
          </div>
        </div>

        {/* Action buttons */}
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button onClick={() => navigate("/relatorios-planejamento")}
            style={{ display: "flex", alignItems: "center", gap: 6, padding: "7px 14px", borderRadius: 8, border: "1.5px solid #E2E8F0", background: "#F8FAFC", color: "#475569", fontWeight: 600, fontSize: 13, cursor: "pointer" }}>
            <FileSpreadsheet size={15} /> Relatórios
          </button>
          {planStatus && (
            <span style={{ fontSize: 12, fontWeight: 700, padding: "6px 14px", borderRadius: 8, border: `1.5px solid ${sc.border}`, background: sc.bg, color: sc.color }}>
              {planStatus}
            </span>
          )}
          {/* Versões anteriores do baseline */}
          {historicoBaselines.map(b => (
            <button key={b.versao} onClick={() => setBaselineViewing(b)}
              style={{ display: "flex", alignItems: "center", gap: 4, padding: "6px 12px", borderRadius: 8, border: "1.5px solid #E2E8F0", background: "#F8FAFC", color: "#64748B", fontWeight: 700, fontSize: 12, cursor: "pointer" }}>
              <Lock size={11} /> {b.versaoLabel}
            </button>
          ))}

          {/* Baseline atual */}
          {baseline && (
            <button onClick={() => setBaselineViewing(baseline)}
              style={{ fontSize: 12, fontWeight: 700, padding: "6px 12px", borderRadius: 8, border: "1.5px solid #BBF7D0", background: "#F0FDF4", color: "#15803D", display: "flex", alignItems: "center", gap: 4, cursor: "pointer" }}>
              <Lock size={11} /> {baseline.versaoLabel} (atual)
            </button>
          )}

          {planId && (
            <button onClick={travarBaseline} disabled={lockingBaseline}
              style={{ display: "flex", alignItems: "center", gap: 6, padding: "7px 14px", borderRadius: 8, border: "1.5px solid #C7D2FE", background: "#EEF2FF", color: "#4338CA", fontWeight: 700, fontSize: 13, cursor: "pointer" }}>
              <Lock size={14} /> {lockingBaseline ? "Travando..." : "Baseline"}
            </button>
          )}

          {/* Excel só disponível após aprovação */}
          {planId && planStatus === "Aprovado" && (
            <button onClick={downloadExcel}
              style={{ display: "flex", alignItems: "center", gap: 6, padding: "7px 14px", borderRadius: 8, border: "1.5px solid #BBF7D0", background: "#F0FDF4", color: "#15803D", fontWeight: 700, fontSize: 13, cursor: "pointer" }}>
              <FileSpreadsheet size={14} /> Excel
            </button>
          )}

          {planId && planStatus === "Pendente Aprovação" && (
            <button onClick={aprovar} disabled={approving}
              style={{ display: "flex", alignItems: "center", gap: 6, padding: "7px 16px", borderRadius: 8, border: "none", background: "#22C55E", color: "#fff", fontWeight: 700, fontSize: 13, cursor: "pointer" }}>
              <ThumbsUp size={14} /> {approving ? "Aprovando..." : "Aprovar"}
            </button>
          )}
        </div>
      </div>

      {/* ── Project selector com filtros ── */}
      {!paramId && (
        <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 20 }}>
          {/* Linha 1: busca única */}
          <div style={{ position: "relative" }}>
            <Search size={16} style={{ position: "absolute", left: 14, top: "50%", transform: "translateY(-50%)", color: "#94A3B8", pointerEvents: "none" }} />
            <input value={filtroBusca} onChange={e => { setFiltroBusca(e.target.value); setFiltroCliente("") }} placeholder="Buscar por projeto, cliente ou número..."
              style={{ width: "100%", padding: "9px 12px 9px 40px", borderRadius: 8, border: "1px solid #E2E8F0", background: "#F8FAFC", color: "#0F172A", fontSize: 13, fontFamily: "inherit", outline: "none", boxSizing: "border-box" }} />
          </div>

          {/* Linha 2: chips setor + status + contador */}
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
            <span style={{ fontSize: 11, fontWeight: 700, color: "#94A3B8", textTransform: "uppercase", letterSpacing: "0.06em", marginRight: 2 }}>Setor:</span>
            {[{ label: "Todos", val: "" }, { label: "ARQ", val: "Arquitetura" }, { label: "INF", val: "Infraestrutura" }, { label: "SAN", val: "Saneamento" }].map(({ label, val }) => (
              <button key={label} onClick={() => setFiltroSetor(val)}
                style={{ padding: "4px 12px", borderRadius: 8, border: "1.5px solid", fontSize: 12, fontWeight: 700, cursor: "pointer", transition: "all 0.15s",
                  borderColor: filtroSetor === val ? "#7C3AED" : "#E2E8F0",
                  background: filtroSetor === val ? "#EDE9FE" : "#fff",
                  color: filtroSetor === val ? "#7C3AED" : "#64748B",
                }}>
                {label}
              </button>
            ))}
            <span style={{ fontSize: 11, fontWeight: 700, color: "#94A3B8", textTransform: "uppercase", letterSpacing: "0.06em", marginLeft: 8, marginRight: 2 }}>Status:</span>
            {[
              { label: "Backlog",                color: "#7C3AED", bg: "#EDE9FE" },
              { label: "Em Andamento",           color: "#D97706", bg: "#FEF3C7" },
              { label: "Em Análise",             color: "#0891B2", bg: "#CFFAFE" },
              { label: "Paralisado",             color: "#DC2626", bg: "#FEE2E2" },
              { label: "Concluído",              color: "#16A34A", bg: "#DCFCE7" },
              { label: "Arquivado",              color: "#475569", bg: "#E2E8F0" },
              { label: "Aguardando Faturamento", color: "#1D4ED8", bg: "#DBEAFE" },
              { label: "Pendência",              color: "#BE185D", bg: "#FCE7F3" },
            ].map(({ label, color, bg }) => {
              const active = filtroStatus === label || (label === "Em Andamento" && filtroStatus === "Em Andamento")
              return (
                <button key={label} onClick={() => setFiltroStatus(active ? "" : label)}
                  style={{ padding: "4px 12px", borderRadius: 8, border: "2px solid", fontSize: 12, fontWeight: 700, cursor: "pointer", transition: "all 0.15s",
                    borderColor: color, background: active ? bg : `${bg}55`, color: color,
                    opacity: active ? 1 : 0.75, boxShadow: active ? `0 0 0 2px ${color}33` : "none",
                  }}>
                  {label}
                </button>
              )
            })}
            {(filtroSetor || filtroStatus !== "Em Andamento" || filtroBusca) && (
              <button onClick={() => { setFiltroSetor(""); setFiltroCliente(""); setFiltroStatus("Em Andamento"); setFiltroBusca("") }}
                style={{ padding: "4px 12px", borderRadius: 8, border: "1.5px solid #FECACA", background: "#FEF2F2", color: "#DC2626", fontSize: 12, fontWeight: 700, cursor: "pointer", marginLeft: 4 }}>
                Limpar
              </button>
            )}
            <span style={{ marginLeft: "auto", fontSize: 12, fontWeight: 600, color: "#94A3B8" }}>
              {loadingProjetos ? "..." : `${projetosFiltrados.length} de ${projetos.length} projeto${projetos.length !== 1 ? "s" : ""}`}
            </span>
          </div>

          {/* Select de projeto */}
          <select value={projetoId} onChange={e => { setProjetoId(e.target.value); setTab("planejamento") }} disabled={loadingProjetos}
            style={{ width: "100%", padding: "10px 14px", borderRadius: 10, border: "1.5px solid #E2E8F0", background: "#F8FAFC", color: "#0F172A", fontSize: 14, fontFamily: "inherit", outline: "none" }}>
            <option value="">— {projetosFiltrados.length} projeto(s) disponível(is) —</option>
            {projetosFiltrados.map(p => <option key={p.ID_Projeto} value={p.ID_Projeto}>{p.Nome}{p.Cliente ? ` · ${p.Cliente}` : ""} [{p.Status}]</option>)}
          </select>
        </div>
      )}

      {!projetoId && (
        <div style={{ textAlign: "center", padding: 60, background: "#F8FAFC", borderRadius: 16, border: "2px dashed #E2E8F0" }}>
          <Calculator size={40} color="#CBD5E1" style={{ margin: "0 auto 12px" }} />
          <div style={{ fontWeight: 700, fontSize: 16, color: "#475569" }}>Selecione um projeto para planejar</div>
        </div>
      )}

      {loading && <div style={{ textAlign: "center", padding: 48, color: "#64748b" }}>Carregando planejamento...</div>}

      {projetoId && !loading && (<>

        {/* ── Tabs ── */}
        <div style={{ display: "flex", gap: 4, background: "#F1F5F9", padding: 4, borderRadius: 12, marginBottom: 24, width: "fit-content" }}>
          {[
            { id: "planejamento", label: "Planejamento", icon: <BadgeDollarSign size={14} /> },
            { id: "real", label: "Plan vs Real", icon: <TrendingUp size={14} />, dot: comparativo?.temBaseline },
            { id: "despesas", label: "Despesas OPP", icon: <FileSpreadsheet size={14} />, dot: !!form.nrContratoOS },
          ].map(t => (
            <button key={t.id} onClick={() => setTab(t.id)}
              style={{ display: "flex", alignItems: "center", gap: 6, padding: "8px 18px", borderRadius: 9, border: "none", cursor: "pointer", fontWeight: 700, fontSize: 13, fontFamily: "inherit", transition: "all 0.15s",
                background: tab === t.id ? "#fff" : "transparent",
                color: tab === t.id ? "#7C3AED" : "#64748B",
                boxShadow: tab === t.id ? "0 1px 4px rgba(0,0,0,0.08)" : "none",
              }}>
              {t.icon} {t.label}
              {t.dot && <span style={{ width: 7, height: 7, borderRadius: "50%", background: "#22C55E", display: "inline-block" }} />}
            </button>
          ))}
        </div>

        {/* ══════════════════════════════════════════════════════════
            TAB: PLANEJAMENTO
        ══════════════════════════════════════════════════════════ */}
        {tab === "planejamento" && (<div className="space-y-4">

          {/* KPIs */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(150px,1fr))", gap: 10 }}>
            {[
              { label: "Valor do Contrato", val: fmt(par.V),                                                ok: true },
              { label: "Custo Total",       val: fmt(par.custoTotalDisplay),                               ok: true },
              { label: "Lucro Estimado",    val: fmt(par.lucro),          ok: margemOk, sub: `${fmtN(par.lucroPerc)}% (mín 23%)` },
              { label: "Custo de Produção", val: fmt(par.totalEquipe + par.totalDespesasInternas + par.totalTerceiros), ok: prodOk, sub: `${fmtN(par.custoProducaoPerc)}% (máx 30%)` },
              { label: "Total Terceirizados", val: fmt(par.totalTerceiros), ok: tercOk },
            ].map(k => (
              <div key={k.label} style={{ background: "#fff", borderRadius: 12, padding: "14px 16px", border: `1.5px solid ${k.ok ? "#E2E8F0" : "#FECACA"}` }}>
                <div style={{ fontSize: 10, fontWeight: 800, color: "#94A3B8", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 4 }}>{k.label}</div>
                <div style={{ fontSize: 20, fontWeight: 900, color: k.ok ? "#0F172A" : "#DC2626" }}>{k.val}</div>
                {k.sub && <div style={{ fontSize: 11, color: k.ok ? "#64748B" : "#DC2626", marginTop: 2, fontWeight: 600 }}>{k.sub}</div>}
              </div>
            ))}
          </div>

          {(!margemOk || !tercOk || !prodOk || !despGeraisOk) && (
            <div style={{ background: "#FEF2F2", border: "1.5px solid #FECACA", borderRadius: 12, padding: "14px 18px", display: "flex", gap: 10 }}>
              <AlertTriangle size={18} color="#DC2626" style={{ marginTop: 1, flexShrink: 0 }} />
              <div>
                <div style={{ fontWeight: 700, color: "#DC2626", fontSize: 13 }}>Projeto fora da Metodologia PAR</div>
                <div style={{ fontSize: 12, color: "#991B1B", marginTop: 4, lineHeight: 1.6 }}>
                  {!margemOk && <div>• Margem ({fmtN(par.lucroPerc)}%) abaixo de 23%.</div>}
                  {!tercOk && <div>• Terceirizados ({fmtN(par.percTerceiros)}%) acima de 25%.</div>}
                  {!prodOk && <div>• Custo de produção ({fmtN(par.custoProducaoPerc)}%) acima de 30%.</div>}
                  {!despGeraisOk && <div>• Despesas Gerais ({fmtN(par.percDespesasGerais)}%) acima de 7,5%.</div>}
                </div>
              </div>
            </div>
          )}

          {/* Seção 1: Informações Gerais */}
          <Section title="Informações Gerais" open={sections.geral} onToggle={() => toggle("geral")}>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(200px,1fr))", gap: 14, marginTop: 16 }}>
              <Field label="Nome do Projeto"><input value={form.nomeProjeto} onChange={e => f("nomeProjeto", e.target.value)} style={INPUT} /></Field>
              <Field label="Cliente"><input value={form.cliente} onChange={e => f("cliente", e.target.value)} style={INPUT} /></Field>
              <Field label="Nome do Centro de Custo">
                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  <div style={{ display: "flex", gap: 6 }}>
                    <div style={{ flex: 1, position: "relative" }}>
                      <input
                        value={form.nrContratoOS}
                        onChange={e => !planTravado && onCcChange(e.target.value)}
                        onFocus={() => { setCcFocado(true); if (!planTravado) carregarCentrosCusto() }}
                        onBlur={() => setTimeout(() => setCcFocado(false), 180)}
                        readOnly={planTravado}
                        maxLength={45}
                        style={{ ...INPUT, width: "100%", background: planTravado ? "#F0FDF4" : undefined, color: planTravado ? "#15803D" : undefined, cursor: planTravado ? "not-allowed" : undefined, paddingRight: 48, boxSizing: "border-box" }}
                        placeholder="Ex: ARQ CROATÁ HOSPITAL MUNICIPAL"
                        autoComplete="off"
                      />
                      {!planTravado && (
                        <span style={{ position: "absolute", right: 10, top: "50%", transform: "translateY(-50%)", fontSize: 10, fontWeight: 700, color: (form.nrContratoOS || "").length >= 40 ? "#DC2626" : "#94A3B8" }}>
                          {(form.nrContratoOS || "").length}/45
                        </span>
                      )}
                      {/* Dropdown autocomplete */}
                      {ccFocado && ccSugestoes.length > 0 && (
                        <div style={{ position: "absolute", top: "100%", left: 0, right: 0, minWidth: 320, zIndex: 9999, background: "#fff", border: "2px solid #38BDF8", borderRadius: 10, boxShadow: "0 12px 32px rgba(0,0,0,0.18)", marginTop: 4, maxHeight: 280, overflowY: "auto" }}>
                          {ccSugestoes.map((s, i) => (
                            <div key={i} onMouseDown={() => selecionarCc(s)}
                              style={{ padding: "11px 16px", fontSize: 14, fontWeight: 500, color: "#0F172A", cursor: "pointer", borderBottom: i < ccSugestoes.length - 1 ? "1px solid #F1F5F9" : "none", lineHeight: 1.4 }}
                              onMouseEnter={e => e.currentTarget.style.background = "#E0F2FE"}
                              onMouseLeave={e => e.currentTarget.style.background = ""}>
                              {s}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                    {planTravado ? (
                      <button onClick={() => setShowEstornoModal(true)} title="Estornar planejamento aprovado para edição" style={{ padding: "9px 14px", borderRadius: 8, background: "#FEF3C7", border: "1.5px solid #FDE68A", color: "#B45309", fontSize: 13, fontWeight: 700, whiteSpace: "nowrap", display: "flex", alignItems: "center", gap: 6, cursor: "pointer" }}>
                        ↩ Estornar Planejamento
                      </button>
                    ) : planStatus === "Aprovado" && form.nrContratoOS ? (
                      <button onClick={travarOPP} disabled={travandoOPP} title="Trava o vínculo com o OPP. Após travar, o nome não pode ser alterado."
                        style={{ padding: "9px 12px", borderRadius: 8, border: "1.5px solid #FDE68A", background: "#FFFBEB", color: "#B45309", fontWeight: 700, fontSize: 12, cursor: "pointer", whiteSpace: "nowrap" }}>
                        {travandoOPP ? "Travando..." : "🔒 Travar OPP"}
                      </button>
                    ) : null}
                  </div>
                  {!planTravado && form.nrContratoOS && (() => {
                    const nomeUpper = (form.nrContratoOS || '').toUpperCase().trim()
                    const existeNoOPP = centrosCusto.some(c => c.toUpperCase() === nomeUpper)
                    return (
                      <div style={{ display: "flex", alignItems: "flex-start", gap: 8, padding: "8px 12px", borderRadius: 8, background: existeNoOPP ? "#F0FDF4" : "#FFFBEB", border: `1px solid ${existeNoOPP ? "#86EFAC" : "#FDE68A"}` }}>
                        <span style={{ fontSize: 14, lineHeight: 1 }}>{existeNoOPP ? "✅" : "⏳"}</span>
                        <div style={{ flex: 1 }}>
                          <div style={{ fontSize: 12, fontWeight: 700, color: existeNoOPP ? "#15803D" : "#B45309" }}>
                            {existeNoOPP ? "Centro de custo encontrado no OPP" : "Pendente — informe à Roberta para criar no OPP"}
                          </div>
                          {!existeNoOPP && (
                            <div style={{ fontSize: 11, color: "#92400E", marginTop: 2 }}>
                              O nome <strong>"{form.nrContratoOS}"</strong> ainda não existe no OPP. A Roberta deve criar um centro de custo com exatamente este nome.
                            </div>
                          )}
                        </div>
                        <button onClick={() => { navigator.clipboard.writeText(form.nrContratoOS); toast.success("Nome copiado!") }}
                          style={{ padding: "4px 10px", borderRadius: 6, border: "1px solid #E2E8F0", background: "#fff", fontSize: 11, fontWeight: 700, color: "#475569", cursor: "pointer", whiteSpace: "nowrap", flexShrink: 0 }}>
                          📋 Copiar
                        </button>
                      </div>
                    )
                  })()}
                  {!planTravado && !form.nrContratoOS && (
                    <p style={{ margin: 0, fontSize: 11, color: "#94A3B8", lineHeight: 1.4 }}>
                      Digite um nome para o centro de custo deste projeto. Padrão: <em>SIGLA CLIENTE DESCRIÇÃO</em> — ex: <em>ARQ CROATÁ HOSPITAL MUNICIPAL</em>. Limite: 45 caracteres.
                    </p>
                  )}
                </div>
              </Field>
              <Field label="O.S. OPP">
                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  <div style={{ display: "flex", gap: 6 }}>
                    <input value={form.nrOsOpp || ""} onChange={e => f("nrOsOpp", e.target.value)} style={{ ...INPUT, background: "#FFFBEB", flex: 1 }} placeholder="Nº da O.S. criada no OPP (ex: 2026/0142)" />
                    <button type="button" onClick={() => { setShowBuscaOS(true); setBuscaOSTexto(""); setBuscaOSResultados([]) }}
                      title="Pesquisar O.S. no OPP"
                      style={{ padding: "0 12px", borderRadius: 8, border: "1.5px solid #FDE68A", background: "#FFFBEB", color: "#B45309", fontWeight: 700, fontSize: 13, cursor: "pointer", whiteSpace: "nowrap" }}>
                      🔍 Buscar OS
                    </button>
                  </div>
                  {form.nrOsOpp && (
                    <button type="button" onClick={importarDoOPP}
                      style={{ alignSelf: "flex-start", padding: "8px 14px", borderRadius: 8, border: "1.5px solid #BAE6FD", background: "#F0F9FF", color: "#0369A1", fontSize: 12, fontWeight: 700, cursor: "pointer", display: "flex", alignItems: "center", gap: 6 }}>
                      ⬇️ Importar do OPP
                    </button>
                  )}
                </div>
              </Field>
              <Field label="Empresa">
                <select value={form.empresa} onChange={e => f("empresa", e.target.value)} style={INPUT}>
                  <option value="">Selecione...</option>
                  <option value="Jota Barros">Jota Barros Projetos e Assessoria</option>
                  <option value="Arraia">Arraia Midas</option>
                </select>
              </Field>
              <Field label="Setor">
                <select value={form.setor} onChange={e => f("setor", e.target.value)} style={INPUT}>
                  <option value="">Selecione...</option>
                  {["Arquitetura","Engenharia","Saneamento","Infraestrutura","Contratos","Comercial"].map(s => <option key={s}>{s}</option>)}
                </select>
              </Field>
              <Field label="Tipologia">
                <select value={form.tipologia} onChange={e => f("tipologia", e.target.value)} style={INPUT}>
                  <option value="">Selecione...</option>
                  {form.setor === "Arquitetura" || form.setor === "Engenharia" ? [
                    "Projeto Arquitetônico de Edificação (Obra Nova)",
                    "Projeto Arquitetônico de Edificação (Reforma)",
                    "Projeto de Urbanização (Parques e Praças)",
                    "Projetos Complementares de Engenharia",
                    "Orçamento Completo (Consultoria)",
                    "Levantamento Topográfico",
                    "Estudo Geotécnico / Geologia",
                    "Institucional/Esportivo",
                  ].map(t => <option key={t}>{t}</option>)
                  : form.setor === "Saneamento" ? [
                    "SAS – Sistema de Abastecimento de Água",
                    "SES – Sistema de Esgotamento Sanitário",
                    "ETA – Estação de Tratamento de Água",
                    "Adutora de Água Bruta",
                    "Captação de Água Bruta",
                    "Orçamento Completo",
                  ].map(t => <option key={t}>{t}</option>)
                  : form.setor === "Infraestrutura" ? [
                    "Projeto de Pavimentação Viária (Asfalto/CBUQ/TSD)",
                    "Projeto de Pavimentação Viária (Estrada Vicinal)",
                    "Projeto de Drenagem Urbana",
                    "Projeto de Vias Urbanas com Passeios",
                    "Projeto de Vias Urbanas sem Passeios",
                    "Orçamento Completo",
                    "Topografia / Geologia",
                  ].map(t => <option key={t}>{t}</option>)
                  : form.tipologia ? <option value={form.tipologia}>{form.tipologia}</option> : null}
                </select>
              </Field>
              <Field label="Resp. Planejamento">
                <select value={form.respPlanejamento} onChange={e => f("respPlanejamento", e.target.value)} style={INPUT}>
                  <option value="">Selecione...</option>
                  {["Cássio Dutra","Arthur Othon","Eduardo Buzanelli"].map(n => <option key={n}>{n}</option>)}
                </select>
              </Field>
              <Field label="Resp. Aprovação">
                <select value={form.respAprovacao} onChange={e => f("respAprovacao", e.target.value)} style={INPUT}>
                  <option value="">Selecione...</option>
                  {["Roberto Brigido","Cláudio Barros","Paulo Barros"].map(n => <option key={n}>{n}</option>)}
                </select>
              </Field>
              <Field label="Link ClickUp">
                <input value={form.linkClickUp} onChange={e => f("linkClickUp", e.target.value)} style={INPUT} placeholder="https://app.clickup.com/36936702/v/li/..." />
              </Field>
            </div>
          </Section>

          {/* Seção 2: Parâmetros Financeiros */}
          <Section title="Parâmetros Financeiros" open={sections.financeiro} onToggle={() => toggle("financeiro")}>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(200px,1fr))", gap: 14, marginTop: 16 }}>
              <Field label="Valor Total do Contrato (R$)"><input type="text" inputMode="decimal" value={form.valorContrato} onChange={e => f("valorContrato", e.target.value)} style={INPUT} placeholder="ex: 150.000,00" /></Field>
              <Field label="Impostos % (mín 16,33%)"><input type="text" inputMode="decimal" value={form.impostosPerc} onChange={e => f("impostosPerc", e.target.value)} style={INPUT} placeholder="16,33" /></Field>
              <Field label="Taxa Adm. % (mín 5%)"><input type="text" inputMode="decimal" value={form.taxaAdmPerc} onChange={e => f("taxaAdmPerc", e.target.value)} style={INPUT} placeholder="12,00" /></Field>
              <Field label="Comissão %"><input value="7,50 (fixo)" readOnly style={{ ...INPUT, background: "#F1F5F9", color: "#94A3B8", cursor: "not-allowed" }} /></Field>
              <Field label="Nº da O.S. Externa"><input type="text" value={form.dataInicioOS} onChange={e => f("dataInicioOS", e.target.value)} style={INPUT} placeholder="ex: 2026/0142" /></Field>
              <Field label="Data da O.S. Externa"><input type="date" value={form.dataOsExterna || ""} onChange={e => f("dataOsExterna", e.target.value)} style={INPUT} /></Field>
              <Field label="Data Entrega Contrato"><input type="date" value={form.dataEntregaContrato} onChange={e => f("dataEntregaContrato", e.target.value)} style={INPUT} /></Field>
              <Field label="Data Entrega Planejada"><input type="date" value={form.dataEntregaPlanejada} onChange={e => f("dataEntregaPlanejada", e.target.value)} style={INPUT} /></Field>
            </div>
            {parseFloat(form.valorContrato) > 0 && (
              <div style={{ marginTop: 18, background: "#F8FAFC", borderRadius: 10, padding: "14px 18px", border: "1px solid #E2E8F0" }}>
                <div style={{ fontSize: 11, fontWeight: 800, color: "#64748B", marginBottom: 10, textTransform: "uppercase", letterSpacing: "0.06em" }}>Resumo Financeiro</div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(180px,1fr))", gap: 8, fontSize: 12 }}>
                  {[
                    ["Valor Bruto", fmt(par.V)],
                    [`(-) Impostos (${fmtN(par.ip)}%)`, fmt(par.impostos)],
                    [`(-) Taxa Adm. (${fmtN(par.ta)}%)`, fmt(par.taxaAdm)],
                    [`(-) Comissão (7,5%)`, fmt(par.comissao)],
                    ["= Receita Líquida", fmt(par.receitaLiquida)],
                    ["(-) Terceirizados", fmt(par.totalTerceiros)],
                    ["(-) Equipe Interna", fmt(par.totalEquipe)],
                    ["(-) Despesas Internas", fmt(par.totalDespesasInternas)],
                    ["(-) Despesas Gerais", fmt(par.totalDespesas)],
                    ["= Lucro Estimado", fmt(par.lucro)],
                  ].map(([l, v]) => (
                    <div key={l} style={{ display: "flex", justifyContent: "space-between", gap: 8, padding: "4px 0", borderBottom: "1px solid #F1F5F9" }}>
                      <span style={{ color: "#64748B" }}>{l}</span>
                      <span style={{ fontWeight: 700, color: l.startsWith("=") ? (margemOk ? "#15803D" : "#DC2626") : "#0F172A" }}>{v}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </Section>

          {/* Seção 3: Medições */}
          <Section title="Cronograma de Medições" open={sections.medicoes} onToggle={() => toggle("medicoes")} badge={`${form.medicoes.length} etapas · ${fmtN(somaMedicoes, 2)}%`}>
            <div style={{ marginTop: 16 }}>
              {somaMedicoes > 0 && (
                <div style={{ marginBottom: 10, fontSize: 12, fontWeight: 700, color: Math.abs(somaMedicoes - 100) < 0.01 ? "#15803D" : "#DC2626" }}>
                  {Math.abs(somaMedicoes - 100) < 0.01 ? "✓ Medições somam 100%" : `⚠ Medições somam ${fmtN(somaMedicoes, 2)}% (necessário 100% para aprovação)`}
                </div>
              )}
              {(form.medicoes || []).map((m, i) => {
                const isEditing = editingMedicao === i
                const CELL = { ...INPUT, background: "#F1F5F9", color: "#475569", cursor: "default" }
                return (
                <div key={i} style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1fr 1fr auto", gap: 8, marginBottom: 8, alignItems: "end" }}>
                  <Field label={i === 0 ? "Etapa / Descrição" : ""}>
                    {isEditing
                      ? <input value={m.etapa || ""} onChange={e => editRow("medicoes", i, "etapa", e.target.value)} style={INPUT} placeholder="ex: Medição 1 - Levantamento" autoFocus />
                      : <div style={CELL}>{m.etapa || <span style={{ color: "#CBD5E1" }}>—</span>}</div>}
                  </Field>
                  <Field label={i === 0 ? "Valor (R$)" : ""}>
                    {isEditing
                      ? <input type="text" inputMode="decimal" value={m.valor || ""} onChange={e => {
                          const novoValor = e.target.value
                          const vc = parseBR(form.valorContrato)
                          const vNum = parseBR(novoValor)
                          const percAuto = vc > 0 && vNum > 0 ? (vNum / vc * 100).toFixed(2).replace('.', ',') : m.percentual
                          setForm(prev => {
                            const updated = [...prev.medicoes]
                            updated[i] = { ...updated[i], valor: novoValor, percentual: percAuto }
                            return { ...prev, medicoes: updated }
                          })
                        }} onBlur={e => { const v = parseBR(e.target.value); if (v > 0) { const fmt2 = v.toFixed(2).replace('.', ',').replace(/\B(?=(\d{3})+(?!\d))/g, '.'); setForm(prev => { const updated = [...prev.medicoes]; updated[i] = { ...updated[i], valor: fmt2 }; return { ...prev, medicoes: updated } }) } }} style={INPUT} placeholder="ex: 1.500,00" />
                      : <div style={CELL}>{m.valor ? fmt(parseBR(m.valor)) : <span style={{ color: "#CBD5E1" }}>—</span>}</div>}
                  </Field>
                  <Field label={i === 0 ? "%" : ""}>
                    {isEditing
                      ? <input type="text" inputMode="decimal" value={m.percentual || ""} onChange={e => editRow("medicoes", i, "percentual", e.target.value)} style={{ ...INPUT, background: '#F0FDF4', color: '#15803D' }} placeholder="auto" />
                      : <div style={CELL}>{m.percentual ? `${m.percentual}%` : <span style={{ color: "#CBD5E1" }}>—</span>}</div>}
                  </Field>
                  <Field label={i === 0 ? "Data Prevista" : ""}>
                    {isEditing
                      ? <input type="date" value={m.dataPrevisao || ""} onChange={e => editRow("medicoes", i, "dataPrevisao", e.target.value)} style={INPUT} />
                      : <div style={CELL}>{m.dataPrevisao ? m.dataPrevisao.split('-').reverse().join('/') : <span style={{ color: "#CBD5E1" }}>—</span>}</div>}
                  </Field>
                  <div style={{ display: "flex", gap: 4, alignSelf: "end" }}>
                    {isEditing ? (<>
                      <button onClick={() => salvarMedicao(i)} style={{ padding: "9px 12px", borderRadius: 8, border: "1px solid #BBF7D0", background: "#F0FDF4", color: "#15803D", cursor: "pointer", fontWeight: 700, fontSize: 12 }}>Salvar</button>
                      <button onClick={() => setEditingMedicao(null)} style={{ padding: "9px 10px", borderRadius: 8, border: "1px solid #E2E8F0", background: "#F8FAFC", color: "#64748B", cursor: "pointer", fontSize: 12 }}>✕</button>
                    </>) : (<>
                      <button onClick={() => setEditingMedicao(i)} style={{ padding: "9px 10px", borderRadius: 8, border: "1px solid #BFDBFE", background: "#EFF6FF", color: "#2563EB", cursor: "pointer", fontSize: 12 }}>Editar</button>
                      <button onClick={() => delRow("medicoes", i)} style={{ padding: "9px 10px", borderRadius: 8, border: "1px solid #FECACA", background: "#FEF2F2", color: "#DC2626", cursor: "pointer" }}><Trash2 size={14} /></button>
                    </>)}
                  </div>
                </div>
              )})}
              <button onClick={() => { addRow("medicoes", { etapa: "", percentual: "", valor: "", dataPrevisao: "" }); setEditingMedicao(form.medicoes.length) }} style={{ display: "flex", alignItems: "center", gap: 6, padding: "8px 16px", borderRadius: 8, border: "1.5px dashed #C7D2FE", background: "#EEF2FF", color: "#4338CA", fontWeight: 700, fontSize: 13, cursor: "pointer", marginTop: 4 }}>
                <Plus size={14} /> Adicionar Etapa
              </button>
            </div>
          </Section>

          {/* Seção 4: Terceirizados */}
          <Section title="Serviços Terceirizados" open={sections.terceirizados} onToggle={() => toggle("terceirizados")} badge={`${form.terceirizados.length} · ${fmt(par.totalTerceiros)}`}>
            <div style={{ marginTop: 16 }}>
              {(form.terceirizados || []).map((t, i) => {
                const vc = parseBR(form.valorContrato)
                const vRef = parseBR(t.valorRef)
                const vCusto = parseBR(t.custo)
                const percRef = vc > 0 ? ((vRef / vc) * 100).toFixed(1) : "—"
                const percImpacto = vc > 0 ? ((vCusto / vc) * 100).toFixed(1) : "—"
                const percCustoSobreRef = vRef > 0 ? ((vCusto / vRef) * 100).toFixed(1) : "—"
                return (
                <div key={i} style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1fr 1fr 0.7fr 0.7fr 0.7fr auto", gap: 8, marginBottom: 8, alignItems: "end" }}>
                  <Field label={i === 0 ? "Serviço / Descrição" : ""}><input value={t.servico || ""} onChange={e => editRow("terceirizados", i, "servico", e.target.value)} style={INPUT} placeholder="ex: Sondagem SPT" /></Field>
                  <Field label={i === 0 ? "Vínculo (medição)" : ""}>
                    <select value={t.vinculo || ""} onChange={e => editRow("terceirizados", i, "vinculo", e.target.value)} style={INPUT}>
                      <option value="">Selecione a medição...</option>
                      {(form.medicoes || []).filter(m => m.etapa).map((m, mi) => (
                        <option key={mi} value={m.etapa}>{m.etapa}{m.percentual ? ` (${m.percentual}%)` : ''}</option>
                      ))}
                    </select>
                  </Field>
                  <Field label={i === 0 ? "Ref. Contrato (R$)" : ""}><input type="text" inputMode="decimal" value={t.valorRef || ""} onChange={e => editRow("terceirizados", i, "valorRef", e.target.value)} onBlur={e => { const v = parseBR(e.target.value); if (v > 0) editRow("terceirizados", i, "valorRef", v.toFixed(2).replace('.', ',').replace(/\B(?=(\d{3})+(?!\d))/g, '.')) }} style={INPUT} placeholder="ex: 5.000,00" /></Field>
                  <Field label={i === 0 ? "Custo (R$)" : ""}><input type="text" inputMode="decimal" value={t.custo || ""} onChange={e => editRow("terceirizados", i, "custo", e.target.value)} onBlur={e => { const v = parseBR(e.target.value); if (v > 0) editRow("terceirizados", i, "custo", v.toFixed(2).replace('.', ',').replace(/\B(?=(\d{3})+(?!\d))/g, '.')) }} style={INPUT} placeholder="ex: 4.500,00" /></Field>
                  <Field label={i === 0 ? "% Ref." : ""}>
                    <div style={{ ...INPUT, background: "#F8FAFC", color: "#475569", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 600, fontSize: 13 }}>{percRef !== "—" ? `${percRef}%` : "—"}</div>
                  </Field>
                  <Field label={i === 0 ? "% Impacto" : ""}>
                    <div style={{ ...INPUT, background: "#FFF7ED", color: "#C2410C", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 600, fontSize: 13 }}>{percImpacto !== "—" ? `${percImpacto}%` : "—"}</div>
                  </Field>
                  <Field label={i === 0 ? "% Custo/Ref." : ""}>
                    {(() => {
                      const val = percCustoSobreRef !== "—" ? parseFloat(percCustoSobreRef) : null
                      const over = val !== null && val > 25
                      return (
                        <div title={over ? "Acima de 25% — não aceito pela metodologia PAR" : undefined}
                          style={{ ...INPUT, background: over ? "#FEF2F2" : "#F0FDF4", color: over ? "#DC2626" : "#15803D", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700, fontSize: 13, border: over ? "1.5px solid #FECACA" : undefined }}>
                          {val !== null ? `${percCustoSobreRef}%${over ? " ⚠" : ""}` : "—"}
                        </div>
                      )
                    })()}
                  </Field>
                  <button onClick={() => delRow("terceirizados", i)} style={{ padding: "9px 10px", borderRadius: 8, border: "1px solid #FECACA", background: "#FEF2F2", color: "#DC2626", cursor: "pointer", alignSelf: "end" }}><Trash2 size={14} /></button>
                </div>
              )})}
              {form.terceirizados.length > 0 && (() => {
                const totalRef = form.terceirizados.reduce((s, t) => s + parseBR(t.valorRef), 0)
                return (
                  <div style={{ display: "flex", gap: 24, padding: "8px 12px", background: "#F8FAFC", borderRadius: 8, border: "1px solid #E2E8F0", marginBottom: 8, fontSize: 12, fontWeight: 700, color: "#475569" }}>
                    <span>Total Ref. Contrato: <span style={{ color: "#0F172A" }}>{fmt(totalRef)}</span></span>
                    <span>Total Custo: <span style={{ color: "#0F172A" }}>{fmt(par.totalTerceiros)}</span></span>
                  </div>
                )
              })()}
              <button onClick={() => addRow("terceirizados", { servico: "", vinculo: "", valorRef: "", custo: "" })} style={{ display: "flex", alignItems: "center", gap: 6, padding: "8px 16px", borderRadius: 8, border: "1.5px dashed #FDE68A", background: "#FFFBEB", color: "#B45309", fontWeight: 700, fontSize: 13, cursor: "pointer", marginTop: 4 }}>
                <Plus size={14} /> Adicionar Terceirizado
              </button>
            </div>
          </Section>

          {/* Seção 5: Equipe */}
          <Section title="Equipe Interna" open={sections.equipe} onToggle={() => toggle("equipe")} badge={`${form.equipe.length} · ${fmt(par.totalEquipe)}`}>
            <div style={{ marginTop: 16 }}>
              {(form.equipe || []).map((e, i) => (
                <div key={i} style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1fr auto", gap: 8, marginBottom: 8, alignItems: "end" }}>
                  <Field label={i === 0 ? "Colaborador" : ""}><input value={e.colaborador || ""} onChange={ev => editRow("equipe", i, "colaborador", ev.target.value)} style={INPUT} placeholder="Nome ou cargo" /></Field>
                  <Field label={i === 0 ? "Horas Estimadas" : ""}><input type="text" inputMode="decimal" value={e.horas || ""} onChange={ev => editRow("equipe", i, "horas", ev.target.value)} style={INPUT} placeholder="ex: 40" /></Field>
                  <Field label={i === 0 ? "R$/hora (padrão 36,40)" : ""}><input type="text" inputMode="decimal" value={e.mediaHora || ""} onChange={ev => editRow("equipe", i, "mediaHora", ev.target.value)} style={INPUT} placeholder="36,40" /></Field>
                  <button onClick={() => delRow("equipe", i)} style={{ padding: "9px 10px", borderRadius: 8, border: "1px solid #FECACA", background: "#FEF2F2", color: "#DC2626", cursor: "pointer", alignSelf: "end" }}><Trash2 size={14} /></button>
                </div>
              ))}
              <button onClick={() => addRow("equipe", { colaborador: "", horas: "", mediaHora: "" })} style={{ display: "flex", alignItems: "center", gap: 6, padding: "8px 16px", borderRadius: 8, border: "1.5px dashed #BBF7D0", background: "#F0FDF4", color: "#15803D", fontWeight: 700, fontSize: 13, cursor: "pointer", marginTop: 4 }}>
                <Plus size={14} /> Adicionar Membro
              </button>

              {/* ── Despesas Internas ── */}
              <div style={{ marginTop: 20, borderTop: "1.5px solid #F1F5F9", paddingTop: 16 }}>
                <div style={{ fontWeight: 800, fontSize: 13, color: "#0F172A", marginBottom: 12 }}>
                  Despesas Internas <span style={{ fontSize: 11, fontWeight: 600, color: "#94A3B8", marginLeft: 6 }}>{form.despesasInternas.length} · {fmt(par.totalDespesasInternas)}</span>
                </div>
                {(form.despesasInternas || []).map((t, i) => {
                  const vc = parseBR(form.valorContrato)
                  const vRef = parseBR(t.valorRef)
                  const vCusto = parseBR(t.custo)
                  const percRef = vc > 0 ? ((vRef / vc) * 100).toFixed(1) : "—"
                  const percImpacto = vc > 0 ? ((vCusto / vc) * 100).toFixed(1) : "—"
                  const percCustoSobreRef = vRef > 0 ? ((vCusto / vRef) * 100).toFixed(1) : "—"
                  return (
                    <div key={i} style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1fr 1fr 0.7fr 0.7fr 0.7fr auto", gap: 8, marginBottom: 8, alignItems: "end" }}>
                      <Field label={i === 0 ? "Serviço / Descrição" : ""}><input value={t.servico || ""} onChange={e => editRow("despesasInternas", i, "servico", e.target.value)} style={INPUT} placeholder="ex: Diária de campo" /></Field>
                      <Field label={i === 0 ? "Vínculo (medição)" : ""}>
                        <select value={t.vinculo || ""} onChange={e => editRow("despesasInternas", i, "vinculo", e.target.value)} style={INPUT}>
                          <option value="">Selecione a medição...</option>
                          {(form.medicoes || []).filter(m => m.etapa).map((m, mi) => (
                            <option key={mi} value={m.etapa}>{m.etapa}{m.percentual ? ` (${m.percentual}%)` : ''}</option>
                          ))}
                        </select>
                      </Field>
                      <Field label={i === 0 ? "Ref. Contrato (R$)" : ""}><input type="text" inputMode="decimal" value={t.valorRef || ""} onChange={e => editRow("despesasInternas", i, "valorRef", e.target.value)} onBlur={e => { const v = parseBR(e.target.value); if (v > 0) editRow("despesasInternas", i, "valorRef", v.toFixed(2).replace('.', ',').replace(/\B(?=(\d{3})+(?!\d))/g, '.')) }} style={INPUT} placeholder="ex: 1.000,00" /></Field>
                      <Field label={i === 0 ? "Custo (R$)" : ""}><input type="text" inputMode="decimal" value={t.custo || ""} onChange={e => editRow("despesasInternas", i, "custo", e.target.value)} onBlur={e => { const v = parseBR(e.target.value); if (v > 0) editRow("despesasInternas", i, "custo", v.toFixed(2).replace('.', ',').replace(/\B(?=(\d{3})+(?!\d))/g, '.')) }} style={INPUT} placeholder="ex: 800,00" /></Field>
                      <Field label={i === 0 ? "% Ref." : ""}>
                        <div style={{ ...INPUT, background: "#F8FAFC", color: "#475569", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 600, fontSize: 13 }}>{percRef !== "—" ? `${percRef}%` : "—"}</div>
                      </Field>
                      <Field label={i === 0 ? "% Impacto" : ""}>
                        <div style={{ ...INPUT, background: "#FFF7ED", color: "#C2410C", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 600, fontSize: 13 }}>{percImpacto !== "—" ? `${percImpacto}%` : "—"}</div>
                      </Field>
                      <Field label={i === 0 ? "% Custo/Ref." : ""}>
                        {(() => {
                          const val = percCustoSobreRef !== "—" ? parseFloat(percCustoSobreRef) : null
                          const over = val !== null && val > 25
                          return (
                            <div title={over ? "Acima de 25% — não aceito pela metodologia PAR" : undefined}
                              style={{ ...INPUT, background: over ? "#FEF2F2" : "#F0FDF4", color: over ? "#DC2626" : "#15803D", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700, fontSize: 13, border: over ? "1.5px solid #FECACA" : undefined }}>
                              {val !== null ? `${percCustoSobreRef}%${over ? " ⚠" : ""}` : "—"}
                            </div>
                          )
                        })()}
                      </Field>
                      <button onClick={() => delRow("despesasInternas", i)} style={{ padding: "9px 10px", borderRadius: 8, border: "1px solid #FECACA", background: "#FEF2F2", color: "#DC2626", cursor: "pointer", alignSelf: "end" }}><Trash2 size={14} /></button>
                    </div>
                  )
                })}
                {form.despesasInternas.length > 0 && (() => {
                  const totalRef = form.despesasInternas.reduce((s, t) => s + parseBR(t.valorRef), 0)
                  return (
                    <div style={{ display: "flex", gap: 24, padding: "8px 12px", background: "#F8FAFC", borderRadius: 8, border: "1px solid #E2E8F0", marginBottom: 8, fontSize: 12, fontWeight: 700, color: "#475569" }}>
                      <span>Total Ref. Contrato: <span style={{ color: "#0F172A" }}>{fmt(totalRef)}</span></span>
                      <span>Total Custo: <span style={{ color: "#0F172A" }}>{fmt(par.totalDespesasInternas)}</span></span>
                    </div>
                  )
                })()}
                <button onClick={() => addRow("despesasInternas", { servico: "", vinculo: "", valorRef: "", custo: "" })} style={{ display: "flex", alignItems: "center", gap: 6, padding: "8px 16px", borderRadius: 8, border: "1.5px dashed #BFDBFE", background: "#EFF6FF", color: "#1D4ED8", fontWeight: 700, fontSize: 13, cursor: "pointer", marginTop: 4 }}>
                  <Plus size={14} /> Adicionar Despesa Interna
                </button>
              </div>
            </div>
          </Section>

          {/* Seção 6: Despesas */}
          <Section title="Despesas Gerais" open={sections.despesas} onToggle={() => toggle("despesas")} badge={`${form.despesas.length} · ${fmt(par.totalDespesas)}`}>
            <div style={{ marginTop: 16 }}>
              {(form.despesas || []).map((d, i) => (
                <div key={i} style={{ display: "grid", gridTemplateColumns: "3fr 1fr auto", gap: 8, marginBottom: 8, alignItems: "end" }}>
                  <Field label={i === 0 ? "Descrição" : ""}><input value={d.descricao || ""} onChange={e => editRow("despesas", i, "descricao", e.target.value)} style={INPUT} placeholder="ex: ART, transporte..." /></Field>
                  <Field label={i === 0 ? "Valor (R$)" : ""}><input type="text" inputMode="decimal" value={d.valor || ""} onChange={e => editRow("despesas", i, "valor", e.target.value)} style={INPUT} placeholder="ex: 350,00" /></Field>
                  <button onClick={() => delRow("despesas", i)} style={{ padding: "9px 10px", borderRadius: 8, border: "1px solid #FECACA", background: "#FEF2F2", color: "#DC2626", cursor: "pointer", alignSelf: "end" }}><Trash2 size={14} /></button>
                </div>
              ))}
              <button onClick={() => addRow("despesas", { descricao: "", valor: "" })} style={{ display: "flex", alignItems: "center", gap: 6, padding: "8px 16px", borderRadius: 8, border: "1.5px dashed #E9D5FF", background: "#FDF4FF", color: "#7E22CE", fontWeight: 700, fontSize: 13, cursor: "pointer", marginTop: 4 }}>
                <Plus size={14} /> Adicionar Despesa
              </button>
            </div>
          </Section>

          {/* Justificativa */}
          <div style={{ background: "#fff", borderRadius: 14, padding: "20px 24px", border: "1.5px solid #E2E8F0" }}>
            <label style={SL}>Justificativa / Observações</label>
            <textarea value={form.justificativa} onChange={e => f("justificativa", e.target.value)} rows={3} style={{ ...INPUT, resize: "vertical" }} placeholder="Notas técnicas, justificativas, condicionantes contratuais..." />
          </div>

          {/* Botões de salvar */}
          <div style={{ display: "flex", justifyContent: "flex-end", gap: 10 }}>
            <button onClick={() => salvar("Rascunho")} disabled={saving}
              style={{ display: "flex", alignItems: "center", gap: 6, padding: "10px 20px", borderRadius: 10, border: "1.5px solid #E2E8F0", background: "#F8FAFC", color: "#475569", fontWeight: 700, fontSize: 13, cursor: saving ? "not-allowed" : "pointer" }}>
              <Save size={16} /> {saving ? "Salvando..." : "Salvar Rascunho"}
            </button>
            <button onClick={() => {
              const ressalvas = [
                !margemOk && `• Margem (${fmtN(par.lucroPerc)}%) abaixo de 23%`,
                !tercOk && `• Terceirizados (${fmtN(par.percTerceiros)}%) acima de 25%`,
                !prodOk && `• Custo de produção (${fmtN(par.custoProducaoPerc)}%) acima de 30%`,
                !despGeraisOk && `• Despesas Gerais (${fmtN(par.percDespesasGerais)}%) acima de 7,5%`,
              ].filter(Boolean)
              if (ressalvas.length > 0) {
                const msg = `Este planejamento possui pendências fora da Metodologia PAR:\n\n${ressalvas.join('\n')}\n\nDeseja encaminhar para aprovação mesmo assim?`
                if (!window.confirm(msg)) return
              }
              salvar("Pendente Aprovação")
            }} disabled={saving}
              className="btn-primary" style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <CheckCircle size={16} /> Encaminhar para Aprovação
            </button>
          </div>

        </div>)}

        {/* ══════════════════════════════════════════════════════════
            TAB: PLAN VS REAL
        ══════════════════════════════════════════════════════════ */}
        {tab === "real" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>

            {/* Toolbar */}
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div style={{ fontSize: 13, color: "#64748B" }}>
                Dados de horas sincronizados automaticamente a cada 15 min via ClickUp.
              </div>
              <button onClick={() => carregarComparativo(true)} disabled={loadingComp}
                style={{ display: "flex", alignItems: "center", gap: 6, padding: "8px 16px", borderRadius: 9, border: "1.5px solid #E2E8F0", background: "#fff", color: "#475569", fontWeight: 700, fontSize: 13, cursor: "pointer" }}>
                <RefreshCw size={14} className={loadingComp ? "animate-spin" : ""} />
                {loadingComp ? "Atualizando..." : "Atualizar Dados"}
              </button>
            </div>

            {loadingComp && <div style={{ textAlign: "center", padding: 60, color: "#94A3B8" }}>Carregando comparativo...</div>}

            {!loadingComp && !comparativo && (
              <div style={{ textAlign: "center", padding: 60, background: "#FFFBEB", borderRadius: 16, border: "1.5px solid #FDE68A" }}>
                <Lock size={36} color="#D97706" style={{ margin: "0 auto 12px" }} />
                <div style={{ fontWeight: 700, fontSize: 15, color: "#92400E" }}>Nenhum planejamento encontrado</div>
                <div style={{ fontSize: 13, color: "#B45309", marginTop: 6 }}>Salve o planejamento primeiro para visualizar o comparativo.</div>
              </div>
            )}

            {!loadingComp && comparativo && (
              <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>

              {/* Baseline status */}
              {comparativo.baseline ? (
                <div style={{ background: "#F0FDF4", border: "1.5px solid #86EFAC", borderRadius: 10, padding: "11px 18px", display: "flex", alignItems: "center", gap: 10 }}>
                  <Lock size={14} color="#15803D" />
                  <span style={{ fontWeight: 700, fontSize: 13, color: "#15803D" }}>Baseline travado</span>
                  <span style={{ fontSize: 12, color: "#16A34A" }}>por <strong>{comparativo.baseline.travadoPor}</strong> em {new Date(comparativo.baseline.travadoEm).toLocaleDateString("pt-BR")}</span>
                </div>
              ) : (
                <div style={{ background: "#FFFBEB", border: "1.5px solid #FCD34D", borderRadius: 10, padding: "11px 18px", display: "flex", alignItems: "center", gap: 10, justifyContent: "space-between" }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: "#92400E" }}>Nenhum baseline travado — o comparativo não tem referência congelada.</div>
                  {planId && (
                    <button onClick={travarBaseline} disabled={lockingBaseline}
                      style={{ display: "flex", alignItems: "center", gap: 6, padding: "6px 14px", borderRadius: 8, border: "none", background: "#D97706", color: "#fff", fontWeight: 700, fontSize: 12, cursor: "pointer", whiteSpace: "nowrap" }}>
                      <Lock size={12} /> {lockingBaseline ? "Travando..." : "Travar Baseline"}
                    </button>
                  )}
                </div>
              )}

              {/* ── HORAS ── */}
              <div style={{ background: "#fff", borderRadius: 14, border: "1.5px solid #E2E8F0", overflow: "hidden" }}>
                <div style={{ padding: "14px 20px", borderBottom: "1px solid #F1F5F9", display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ fontSize: 11, fontWeight: 800, color: "#94A3B8", textTransform: "uppercase", letterSpacing: "0.07em" }}>⏱ Horas — Planejado vs Rastreado</span>
                </div>
                <div style={{ padding: "18px 20px", display: "flex", flexDirection: "column", gap: 16 }}>
                  {/* KPI row */}
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12 }}>
                    {[
                      { label: "Estimadas", val: fmtH(comparativo.horas?.totalPlanejado), sub: "no baseline", color: "#7C3AED", bg: "#F5F3FF" },
                      { label: "Rastreadas", val: fmtH(comparativo.horas?.totalRastreado), sub: "logado no ClickUp", color: Math.abs(comparativo.horas?.desvioPerc || 0) < 15 ? "#15803D" : "#DC2626", bg: Math.abs(comparativo.horas?.desvioPerc || 0) < 15 ? "#F0FDF4" : "#FEF2F2" },
                      {
                        label: "Desvio",
                        val: (() => { const d = comparativo.horas?.desvioAbsoluto || 0; return (d >= 0 ? "+" : "") + fmtH(Math.abs(d)) })(),
                        sub: comparativo.horas?.desvioAbsoluto < 0 ? "abaixo do estimado" : "acima do estimado",
                        color: (comparativo.horas?.desvioPerc || 0) > 15 ? "#DC2626" : "#15803D",
                        bg: (comparativo.horas?.desvioPerc || 0) > 15 ? "#FEF2F2" : "#F0FDF4",
                      },
                    ].map(k => (
                      <div key={k.label} style={{ background: k.bg, borderRadius: 10, padding: "14px 16px" }}>
                        <div style={{ fontSize: 10, fontWeight: 700, color: "#94A3B8", textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 4 }}>{k.label}</div>
                        <div style={{ fontSize: 24, fontWeight: 900, color: k.color, lineHeight: 1.1 }}>{k.val}</div>
                        <div style={{ fontSize: 11, color: "#64748B", marginTop: 3 }}>{k.sub}</div>
                      </div>
                    ))}
                  </div>
                  {/* Barra geral */}
                  <div>
                    <div style={{ fontSize: 11, fontWeight: 700, color: "#94A3B8", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 8, display: "flex", justifyContent: "space-between" }}>
                      <span>Total do Projeto</span>
                      <span><span style={{ display: "inline-block", width: 8, height: 8, borderRadius: 2, background: "#C4B5FD", marginRight: 4 }} />Estimado&nbsp;&nbsp;<span style={{ display: "inline-block", width: 8, height: 8, borderRadius: 2, background: "#6366F1", marginRight: 4 }} />Rastreado</span>
                    </div>
                    <BurnBar label="" planejado={comparativo.horas?.totalPlanejado || 0} real={comparativo.horas?.totalRastreado || 0} />
                  </div>
                  {/* Por colaborador */}
                  {comparativo.horas?.porColaborador?.length > 0 && (
                    <div style={{ borderTop: "1px solid #F1F5F9", paddingTop: 14 }}>
                      <div style={{ fontSize: 11, fontWeight: 700, color: "#94A3B8", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 12 }}>Por colaborador</div>
                      {comparativo.horas.porColaborador.map((c, i) => (
                        <div key={i} style={{ marginBottom: 12, paddingBottom: 12, borderBottom: i < comparativo.horas.porColaborador.length - 1 ? "1px solid #F8FAFC" : "none" }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                            <div style={{ width: 28, height: 28, borderRadius: "50%", background: "#EDE9FE", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 800, fontSize: 12, color: "#7C3AED", flexShrink: 0 }}>
                              {(c.colaborador || "?")[0].toUpperCase()}
                            </div>
                            <span style={{ fontWeight: 600, fontSize: 13, color: "#0F172A", flex: 1 }}>{c.colaborador || "Não identificado"}</span>
                            <span style={{ fontSize: 11, color: "#64748B" }}>Est. <strong>{fmtH(c.horasPlanejadas)}</strong></span>
                            <span style={{ fontSize: 11, color: "#0F172A", fontWeight: 700 }}>Real <strong>{fmtH(c.horasRastreadas)}</strong></span>
                            {c.desvioPerc !== null && (
                              <span style={{ fontSize: 11, fontWeight: 700, padding: "2px 7px", borderRadius: 5,
                                background: Math.abs(c.desvioPerc) < 10 ? "#F1F5F9" : c.desvioPerc > 0 ? "#FEE2E2" : "#DCFCE7",
                                color: Math.abs(c.desvioPerc) < 10 ? "#64748B" : c.desvioPerc > 0 ? "#DC2626" : "#15803D",
                              }}>{c.desvioPerc >= 0 ? "↑" : "↓"}{Math.abs(fmtN(c.desvioPerc))}%</span>
                            )}
                          </div>
                          <BurnBar label="" planejado={c.horasPlanejadas} real={c.horasRastreadas} />
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {/* ── EQUIPE INTERNA + DESPESAS INTERNAS lado a lado ── */}
              {((comparativo.equipePlanejada?.length > 0) || (comparativo.despesasPlanejadas?.length > 0)) && (
                <div style={{ display: "grid", gridTemplateColumns: comparativo.equipePlanejada?.length > 0 && comparativo.despesasPlanejadas?.length > 0 ? "1fr 1fr" : "1fr", gap: 16 }}>

                  {/* Equipe Interna */}
                  {comparativo.equipePlanejada?.length > 0 && (() => {
                    const totalPlan = comparativo.equipePlanejada.reduce((s, e) => s + e.custoPlan, 0)
                    const totalReal = comparativo.equipePlanejada.reduce((s, e) => s + e.custoReal, 0)
                    const desvio = totalReal - totalPlan
                    return (
                      <div style={{ background: "#fff", borderRadius: 14, border: "1.5px solid #E2E8F0", overflow: "hidden" }}>
                        <div style={{ padding: "14px 20px", borderBottom: "1px solid #F1F5F9", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                          <span style={{ fontSize: 11, fontWeight: 800, color: "#94A3B8", textTransform: "uppercase", letterSpacing: "0.07em" }}>👥 Equipe Interna</span>
                          <div style={{ display: "flex", gap: 16 }}>
                            <div style={{ textAlign: "right" }}>
                              <div style={{ fontSize: 10, color: "#94A3B8", fontWeight: 600, textTransform: "uppercase" }}>Planejado</div>
                              <div style={{ fontSize: 13, fontWeight: 800, color: "#7C3AED" }}>{fmt(totalPlan)}</div>
                            </div>
                            <div style={{ textAlign: "right" }}>
                              <div style={{ fontSize: 10, color: "#94A3B8", fontWeight: 600, textTransform: "uppercase" }}>Real</div>
                              <div style={{ fontSize: 13, fontWeight: 800, color: desvio > 0 ? "#DC2626" : "#15803D" }}>{fmt(totalReal)}</div>
                            </div>
                            <div style={{ textAlign: "right" }}>
                              <div style={{ fontSize: 10, color: "#94A3B8", fontWeight: 600, textTransform: "uppercase" }}>Desvio</div>
                              <div style={{ fontSize: 13, fontWeight: 800, color: desvio > 0 ? "#DC2626" : desvio < 0 ? "#15803D" : "#64748B" }}>{desvio >= 0 ? "+" : ""}{fmt(desvio)}</div>
                            </div>
                          </div>
                        </div>
                        <div style={{ padding: "12px 20px", display: "flex", flexDirection: "column", gap: 6 }}>
                          {comparativo.equipePlanejada.map((e, i) => (
                            <div key={i} style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 10px", background: "#F8FAFC", borderRadius: 8 }}>
                              <div style={{ width: 26, height: 26, borderRadius: "50%", background: "#EDE9FE", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 800, fontSize: 11, color: "#7C3AED", flexShrink: 0 }}>
                                {(e.nome || "?")[0].toUpperCase()}
                              </div>
                              <span style={{ flex: 1, fontSize: 12, fontWeight: 600, color: "#0F172A" }}>{e.nome || "—"}</span>
                              <span style={{ fontSize: 11, color: "#64748B" }}>{e.horasPlan}h plan.</span>
                              <span style={{ fontSize: 11, color: "#0F172A", fontWeight: 700 }}>{e.horasReal}h real</span>
                              <span style={{ fontSize: 11, color: "#94A3B8" }}>@ {fmt(e.valorHora)}/h</span>
                              <div style={{ textAlign: "right", minWidth: 80 }}>
                                <div style={{ fontSize: 11, color: "#64748B" }}>{fmt(e.custoPlan)}</div>
                                <div style={{ fontSize: 12, fontWeight: 700, color: e.custoReal > e.custoPlan ? "#DC2626" : "#15803D" }}>{fmt(e.custoReal)}</div>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )
                  })()}

                  {/* Despesas Internas */}
                  {comparativo.despesasPlanejadas?.length > 0 && (() => {
                    const total = comparativo.despesasPlanejadas.reduce((s, d) => s + d.valor, 0)
                    return (
                      <div style={{ background: "#fff", borderRadius: 14, border: "1.5px solid #E2E8F0", overflow: "hidden" }}>
                        <div style={{ padding: "14px 20px", borderBottom: "1px solid #F1F5F9", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                          <span style={{ fontSize: 11, fontWeight: 800, color: "#94A3B8", textTransform: "uppercase", letterSpacing: "0.07em" }}>📎 Despesas Internas</span>
                          <div style={{ textAlign: "right" }}>
                            <div style={{ fontSize: 10, color: "#94A3B8", fontWeight: 600, textTransform: "uppercase" }}>Total Planejado</div>
                            <div style={{ fontSize: 13, fontWeight: 800, color: "#0F172A" }}>{fmt(total)}</div>
                          </div>
                        </div>
                        <div style={{ padding: "12px 20px", display: "flex", flexDirection: "column", gap: 6 }}>
                          {comparativo.despesasPlanejadas.map((d, i) => (
                            <div key={i} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 10px", background: "#F8FAFC", borderRadius: 8 }}>
                              <span style={{ fontSize: 12, fontWeight: 600, color: "#0F172A" }}>{d.descricao || "—"}</span>
                              <span style={{ fontSize: 12, fontWeight: 700, color: "#475569" }}>{fmt(d.valor)}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )
                  })()}
                </div>
              )}

              {/* ── DATAS + MEDIÇÕES lado a lado ── */}
              <div style={{ display: "grid", gridTemplateColumns: comparativo.medicoes?.length > 0 ? "1fr 1fr" : "1fr", gap: 16 }}>
                {/* Datas */}
                {comparativo.datas && (
                  <div style={{ background: "#fff", borderRadius: 14, border: "1.5px solid #E2E8F0", overflow: "hidden" }}>
                    <div style={{ padding: "14px 20px", borderBottom: "1px solid #F1F5F9" }}>
                      <span style={{ fontSize: 11, fontWeight: 800, color: "#94A3B8", textTransform: "uppercase", letterSpacing: "0.07em" }}>📅 Datas — Planejado vs Atual</span>
                    </div>
                    <div style={{ padding: "16px 20px", display: "flex", flexDirection: "column", gap: 10 }}>
                      {[
                        { label: "Início O.S.", plan: comparativo.datas.planejado?.dataInicioOS, atual: comparativo.datas.atual?.dataInicioOS },
                        { label: "Entrega Contrato", plan: comparativo.datas.planejado?.dataEntregaContrato, atual: comparativo.datas.atual?.dataEntregaContrato },
                        { label: "Entrega Planejada", plan: comparativo.datas.planejado?.dataEntregaPlanejada, atual: comparativo.datas.atual?.dataEntregaPlanejada },
                      ].map(d => {
                        const pDate = d.plan ? new Date(d.plan) : null
                        const aDate = d.atual ? new Date(d.atual) : null
                        const diff = pDate && aDate ? Math.round((aDate - pDate) / 86400000) : null
                        return (
                          <div key={d.label} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 14px", background: "#F8FAFC", borderRadius: 8 }}>
                            <span style={{ fontSize: 12, fontWeight: 700, color: "#475569", minWidth: 130 }}>{d.label}</span>
                            <div style={{ textAlign: "center", flex: 1 }}>
                              <div style={{ fontSize: 11, color: "#94A3B8" }}>Plan</div>
                              <div style={{ fontSize: 12, fontWeight: 600, color: "#475569" }}>{pDate ? pDate.toLocaleDateString("pt-BR") : "—"}</div>
                            </div>
                            <div style={{ textAlign: "center", flex: 1 }}>
                              <div style={{ fontSize: 11, color: "#94A3B8" }}>Atual</div>
                              <div style={{ fontSize: 12, fontWeight: 700, color: "#0F172A" }}>{aDate ? aDate.toLocaleDateString("pt-BR") : "—"}</div>
                            </div>
                            <div style={{ minWidth: 90, textAlign: "right" }}>
                              {diff !== null && <span style={{ fontSize: 11, fontWeight: 700, padding: "2px 8px", borderRadius: 6, background: diff > 0 ? "#FEE2E2" : diff < 0 ? "#DCFCE7" : "#F1F5F9", color: diff > 0 ? "#DC2626" : diff < 0 ? "#15803D" : "#64748B" }}>{diff > 0 ? `+${diff}d atraso` : diff < 0 ? `${Math.abs(diff)}d adiant.` : "No prazo"}</span>}
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                )}

                {/* Medições */}
                {comparativo.medicoes?.length > 0 && (
                  <div style={{ background: "#fff", borderRadius: 14, border: "1.5px solid #E2E8F0", overflow: "hidden" }}>
                    <div style={{ padding: "14px 20px", borderBottom: "1px solid #F1F5F9" }}>
                      <span style={{ fontSize: 11, fontWeight: 800, color: "#94A3B8", textTransform: "uppercase", letterSpacing: "0.07em" }}>📋 Medições — Plan vs Realizado</span>
                    </div>
                    <div style={{ overflowX: "auto" }}>
                      <table style={{ width: "100%", borderCollapse: "collapse" }}>
                        <thead>
                          <tr style={{ background: "#F8FAFC" }}>
                            {["Etapa", "%", "Prev.", "Realiz.", "Desvio", "Status"].map(h => (
                              <th key={h} style={{ padding: "9px 12px", textAlign: "left", fontSize: 10, fontWeight: 700, color: "#94A3B8", textTransform: "uppercase", whiteSpace: "nowrap" }}>{h}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {comparativo.medicoes.map((m, i) => (
                            <tr key={i} style={{ borderTop: "1px solid #F1F5F9", background: m.atrasoDias > 0 ? "rgba(239,68,68,0.03)" : "#fff" }}>
                              <td style={{ padding: "10px 12px", fontSize: 12, fontWeight: 700, color: "#0F172A" }}>{m.etapa || "—"}</td>
                              <td style={{ padding: "10px 12px", fontSize: 12, fontWeight: 800, color: "#7C3AED" }}>{m.percentual ? `${m.percentual}%` : "—"}</td>
                              <td style={{ padding: "10px 12px", fontSize: 11, color: "#64748B", whiteSpace: "nowrap" }}>{m.dataPrevisaoPlanejada ? new Date(m.dataPrevisaoPlanejada).toLocaleDateString("pt-BR") : "—"}</td>
                              <td style={{ padding: "10px 12px", fontSize: 11, color: "#0F172A", whiteSpace: "nowrap" }}>{m.dataRealizacao ? new Date(m.dataRealizacao).toLocaleDateString("pt-BR") : "—"}</td>
                              <td style={{ padding: "10px 12px", fontSize: 11, fontWeight: 700, color: m.atrasoDias > 0 ? "#DC2626" : m.atrasoDias < 0 ? "#15803D" : "#94A3B8" }}>
                                {m.atrasoDias != null ? (m.atrasoDias > 0 ? `+${m.atrasoDias}d` : m.atrasoDias < 0 ? `${m.atrasoDias}d` : "—") : "—"}
                              </td>
                              <td style={{ padding: "10px 12px" }}>
                                <span style={{ fontSize: 10, fontWeight: 700, padding: "3px 8px", borderRadius: 5,
                                  background: m.statusFisico === "Concluída" || m.statusFisico === "Concluido" ? "#DCFCE7" : "#F1F5F9",
                                  color: m.statusFisico === "Concluída" || m.statusFisico === "Concluido" ? "#15803D" : "#64748B",
                                }}>{m.statusFisico || "Pendente"}</span>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </div>

              {/* ── DESPESAS OPP ── */}
              {comparativo.despesasOPP?.temDados ? (
                <div style={{ background: "#fff", borderRadius: 14, border: "1.5px solid #E2E8F0", overflow: "hidden" }}>
                  <div style={{ padding: "14px 20px", borderBottom: "1px solid #F1F5F9", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <span style={{ fontSize: 11, fontWeight: 800, color: "#94A3B8", textTransform: "uppercase", letterSpacing: "0.07em" }}>💰 Despesas Reais — OPP</span>
                    <div style={{ display: "flex", gap: 20 }}>
                      <div style={{ textAlign: "right" }}>
                        <div style={{ fontSize: 10, color: "#94A3B8", fontWeight: 600, textTransform: "uppercase" }}>Total Previsto</div>
                        <div style={{ fontSize: 14, fontWeight: 800, color: "#0F172A" }}>{fmt(comparativo.despesasOPP.totalGasto)}</div>
                      </div>
                      <div style={{ textAlign: "right" }}>
                        <div style={{ fontSize: 10, color: "#94A3B8", fontWeight: 600, textTransform: "uppercase" }}>Total Pago</div>
                        <div style={{ fontSize: 14, fontWeight: 800, color: "#15803D" }}>{fmt(comparativo.despesasOPP.totalPago)}</div>
                      </div>
                    </div>
                  </div>
                  <div style={{ padding: "16px 20px", display: "flex", flexDirection: "column", gap: 12 }}>
                    {comparativo.despesasOPP.porCategoria.map((grupo, gi) => (
                      <div key={gi}>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "7px 12px", background: "#F8FAFC", borderRadius: 8, marginBottom: 4 }}>
                          <span style={{ fontSize: 12, fontWeight: 700, color: "#334155" }}>{grupo.categoria || "Sem categoria"}</span>
                          <div style={{ display: "flex", gap: 16 }}>
                            <span style={{ fontSize: 11, color: "#64748B" }}>Previsto: <strong style={{ color: "#0F172A" }}>{fmt(grupo.total)}</strong></span>
                            <span style={{ fontSize: 11, color: "#64748B" }}>Pago: <strong style={{ color: "#15803D" }}>{fmt(grupo.totalPago)}</strong></span>
                          </div>
                        </div>
                        {grupo.lancamentos.map((l, li) => (
                          <div key={li} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "7px 12px 7px 24px", borderBottom: li < grupo.lancamentos.length - 1 ? "1px solid #F8FAFC" : "none" }}>
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <div style={{ fontSize: 12, fontWeight: 600, color: "#0F172A", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{l.descricao || l.fornecedor}</div>
                              {l.fornecedor && l.fornecedor !== l.descricao && <div style={{ fontSize: 11, color: "#94A3B8" }}>{l.fornecedor}</div>}
                            </div>
                            <div style={{ display: "flex", gap: 12, alignItems: "center", flexShrink: 0, marginLeft: 12 }}>
                              <span style={{ fontSize: 11, color: "#94A3B8", whiteSpace: "nowrap" }}>{l.data ? new Date(l.data).toLocaleDateString("pt-BR") : "—"}</span>
                              <span style={{ fontSize: 12, fontWeight: 700, color: "#0F172A", whiteSpace: "nowrap" }}>{fmt(l.valor)}</span>
                              <span style={{ fontSize: 10, fontWeight: 700, padding: "2px 8px", borderRadius: 5, whiteSpace: "nowrap",
                                background: l.liquidado ? "#DCFCE7" : "#FEF9C3",
                                color: l.liquidado ? "#15803D" : "#92400E" }}>
                                {l.liquidado ? "Pago" : "Aberto"}
                              </span>
                            </div>
                          </div>
                        ))}
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <div style={{ background: "#F8FAFC", borderRadius: 14, border: "1.5px solid #E2E8F0", padding: "24px", color: "#94A3B8", fontSize: 13, textAlign: "center" }}>
                  Nenhum lançamento OPP encontrado — preencha o campo "Nome do Centro de Custo" na aba Planejamento.
                </div>
              )}

              </div>
            )}
          </div>
        )}

      </>)}

      {/* ── Modal busca O.S. OPP ── */}
      {showBuscaOS && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}
          onClick={() => setShowBuscaOS(false)}>
          <div style={{ background: "#fff", borderRadius: 16, padding: 28, width: "100%", maxWidth: 620, maxHeight: "80vh", display: "flex", flexDirection: "column", gap: 16 }}
            onClick={e => e.stopPropagation()}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <h3 style={{ margin: 0, fontSize: 16, fontWeight: 800, color: "#0F172A" }}>🔍 Pesquisar O.S. no OPP</h3>
              <button onClick={() => setShowBuscaOS(false)} style={{ background: "none", border: "none", fontSize: 20, cursor: "pointer", color: "#94A3B8" }}>×</button>
            </div>
            <input
              autoFocus
              value={buscaOSTexto}
              onChange={e => buscarOS(e.target.value)}
              placeholder="Digite o nome do projeto, cliente ou número da O.S..."
              style={{ padding: "10px 14px", borderRadius: 8, border: "1.5px solid #E2E8F0", fontSize: 13, outline: "none", fontFamily: "inherit" }}
            />
            <div style={{ overflowY: "auto", flex: 1 }}>
              {buscaOSLoading && <p style={{ color: "#94A3B8", fontSize: 13, textAlign: "center" }}>Buscando...</p>}
              {!buscaOSLoading && buscaOSTexto.length >= 2 && buscaOSResultados.length === 0 && (
                <p style={{ color: "#94A3B8", fontSize: 13, textAlign: "center" }}>Nenhuma O.S. encontrada.</p>
              )}
              {buscaOSResultados.map((os, i) => (
                <div key={i}
                  onClick={() => { f("nrOsOpp", os.nr_os || String(os.id)); setShowBuscaOS(false); toast.success(`O.S. "${os.nr_os || os.id}" selecionada!`) }}
                  style={{ padding: "12px 14px", borderRadius: 8, border: "1px solid #E2E8F0", marginBottom: 8, cursor: "pointer", transition: "background 0.15s" }}
                  onMouseEnter={e => e.currentTarget.style.background = "#F0F9FF"}
                  onMouseLeave={e => e.currentTarget.style.background = ""}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8 }}>
                    <div>
                      <span style={{ fontSize: 12, fontWeight: 800, color: "#0369A1" }}>{os.nr_os || `ID: ${os.id}`}</span>
                      <p style={{ margin: "3px 0 0", fontSize: 12, color: "#374151", fontWeight: 500 }}>{os.descricao || "Sem descrição"}</p>
                      {os.cliente && <p style={{ margin: "2px 0 0", fontSize: 11, color: "#94A3B8" }}>Cliente: {os.cliente}</p>}
                    </div>
                    <span style={{ fontSize: 11, fontWeight: 700, color: os.situacao === "Aberta" ? "#16A34A" : "#64748B", whiteSpace: "nowrap", background: "#F1F5F9", padding: "2px 8px", borderRadius: 20 }}>
                      {os.situacao || "—"}
                    </span>
                  </div>
                </div>
              ))}
              {!buscaOSTexto && (
                <p style={{ color: "#94A3B8", fontSize: 12, textAlign: "center", marginTop: 8 }}>
                  Digite pelo menos 2 caracteres para pesquisar
                </p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── Modal de estorno ── */}
      {showEstornoModal && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}
          onClick={() => !estornando && setShowEstornoModal(false)}>
          <div style={{ background: "#fff", borderRadius: 16, padding: 28, maxWidth: 480, width: "100%", boxShadow: "0 20px 60px rgba(0,0,0,0.2)" }}
            onClick={e => e.stopPropagation()}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
              <span style={{ fontSize: 22 }}>↩</span>
              <h3 style={{ margin: 0, fontSize: 16, fontWeight: 800, color: "#0F172A" }}>Estornar Planejamento</h3>
            </div>
            <p style={{ margin: "0 0 16px", fontSize: 13, color: "#64748B", lineHeight: 1.6 }}>
              Esta ação vai <strong>destravar</strong> o planejamento aprovado para permitir edições e geração de nova baseline.<br />
              Informe o motivo para registrar o histórico.
            </p>
            <label style={{ fontSize: 12, fontWeight: 700, color: "#475569", display: "block", marginBottom: 6, textTransform: "uppercase" }}>Motivo do estorno *</label>
            <textarea
              value={motivoEstorno}
              onChange={e => setMotivoEstorno(e.target.value)}
              placeholder="Ex: Ajuste no valor do contrato solicitado pelo cliente..."
              rows={4}
              style={{ width: "100%", padding: "10px 12px", borderRadius: 8, border: "1.5px solid #E2E8F0", fontSize: 13, fontFamily: "inherit", outline: "none", resize: "vertical", boxSizing: "border-box", color: "#0F172A" }}
            />
            <div style={{ display: "flex", gap: 10, marginTop: 18, justifyContent: "flex-end" }}>
              <button onClick={() => setShowEstornoModal(false)} disabled={estornando}
                style={{ padding: "9px 18px", borderRadius: 8, border: "1.5px solid #E2E8F0", background: "#fff", color: "#475569", fontWeight: 700, fontSize: 13, cursor: "pointer" }}>
                Cancelar
              </button>
              <button onClick={confirmarEstorno} disabled={estornando || !motivoEstorno.trim()}
                style={{ padding: "9px 18px", borderRadius: 8, border: "none", background: motivoEstorno.trim() ? "#B45309" : "#E2E8F0", color: motivoEstorno.trim() ? "#fff" : "#94A3B8", fontWeight: 700, fontSize: 13, cursor: motivoEstorno.trim() ? "pointer" : "not-allowed" }}>
                {estornando ? "Estornando..." : "Confirmar Estorno"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Modal de visualização de baseline ── */}
      {baselineViewing && (
        <div onClick={() => setBaselineViewing(null)} style={{
          position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)", zIndex: 1000,
          display: "flex", alignItems: "center", justifyContent: "center", padding: 24,
        }}>
          <div onClick={e => e.stopPropagation()} style={{
            background: "#fff", borderRadius: 18, width: "100%", maxWidth: 680,
            maxHeight: "85vh", overflow: "auto", boxShadow: "0 24px 64px rgba(0,0,0,0.2)",
          }}>
            {/* Header */}
            <div style={{ padding: "20px 24px", borderBottom: "1px solid #F1F5F9", display: "flex", justifyContent: "space-between", alignItems: "center", position: "sticky", top: 0, background: "#fff", zIndex: 1 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <Lock size={16} color="#7C3AED" />
                <span style={{ fontWeight: 800, fontSize: 16, color: "#0F172A" }}>
                  Baseline {baselineViewing.versaoLabel}
                </span>
                <span style={{ fontSize: 11, color: "#64748B", fontWeight: 600 }}>
                  Travado em {new Date(baselineViewing.travadoEm).toLocaleDateString("pt-BR")} por {baselineViewing.travadoPor}
                </span>
              </div>
              <button onClick={() => setBaselineViewing(null)} style={{ background: "none", border: "none", cursor: "pointer", color: "#94A3B8", fontSize: 20, lineHeight: 1 }}>✕</button>
            </div>

            <div style={{ padding: "20px 24px", display: "flex", flexDirection: "column", gap: 20 }}>
              {/* Financeiro */}
              <div>
                <div style={{ fontSize: 11, fontWeight: 700, color: "#94A3B8", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 10 }}>Financeiro</div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10 }}>
                  {[
                    { label: "Valor do Contrato", val: fmtCur(baselineViewing.valorContrato) },
                    { label: "Impostos", val: `${baselineViewing.impostosPerc}%` },
                    { label: "Taxa Adm", val: `${baselineViewing.taxaAdmPerc}%` },
                  ].map(i => (
                    <div key={i.label} style={{ background: "#F8FAFC", borderRadius: 10, padding: "12px 14px", border: "1px solid #E2E8F0" }}>
                      <div style={{ fontSize: 11, color: "#94A3B8", fontWeight: 600 }}>{i.label}</div>
                      <div style={{ fontSize: 15, fontWeight: 800, color: "#0F172A", marginTop: 4 }}>{i.val}</div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Datas */}
              <div>
                <div style={{ fontSize: 11, fontWeight: 700, color: "#94A3B8", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 10 }}>Datas Planejadas</div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10 }}>
                  {[
                    { label: "Início OS", val: baselineViewing.dataInicioOS ? new Date(baselineViewing.dataInicioOS).toLocaleDateString("pt-BR") : "—" },
                    { label: "Entrega Contrato", val: baselineViewing.dataEntregaContrato ? new Date(baselineViewing.dataEntregaContrato).toLocaleDateString("pt-BR") : "—" },
                    { label: "Entrega Planejada", val: baselineViewing.dataEntregaPlanejada ? new Date(baselineViewing.dataEntregaPlanejada).toLocaleDateString("pt-BR") : "—" },
                  ].map(i => (
                    <div key={i.label} style={{ background: "#F8FAFC", borderRadius: 10, padding: "12px 14px", border: "1px solid #E2E8F0" }}>
                      <div style={{ fontSize: 11, color: "#94A3B8", fontWeight: 600 }}>{i.label}</div>
                      <div style={{ fontSize: 14, fontWeight: 700, color: "#0F172A", marginTop: 4 }}>{i.val}</div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Equipe */}
              {baselineViewing.horasPorColaborador?.length > 0 && (
                <div>
                  <div style={{ fontSize: 11, fontWeight: 700, color: "#94A3B8", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 10 }}>
                    Equipe — {Number(baselineViewing.totalHorasEstimadas || 0).toFixed(0)}h estimadas
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                    {baselineViewing.horasPorColaborador.map((c, i) => (
                      <div key={i} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 14px", background: "#F8FAFC", borderRadius: 8, border: "1px solid #E2E8F0" }}>
                        <span style={{ fontSize: 13, fontWeight: 600, color: "#0F172A" }}>{c.colaborador || "—"}</span>
                        <div style={{ display: "flex", gap: 16, fontSize: 12, color: "#64748B" }}>
                          <span>{Number(c.horasEstimadas || 0).toFixed(0)}h</span>
                          <span style={{ fontWeight: 700, color: "#7C3AED" }}>{fmtCur(c.custoEstimado)}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Medições */}
              {baselineViewing.medicoes?.length > 0 && (
                <div>
                  <div style={{ fontSize: 11, fontWeight: 700, color: "#94A3B8", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 10 }}>Medições Planejadas</div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                    {baselineViewing.medicoes.map((m, i) => (
                      <div key={i} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 14px", background: "#F8FAFC", borderRadius: 8, border: "1px solid #E2E8F0" }}>
                        <span style={{ fontSize: 13, fontWeight: 600, color: "#0F172A" }}>{m.etapa || `Medição ${i+1}`}</span>
                        <div style={{ display: "flex", gap: 16, fontSize: 12, color: "#64748B" }}>
                          <span>{m.percentual}%</span>
                          {m.dataPrevisao && <span>{new Date(m.dataPrevisao).toLocaleDateString("pt-BR")}</span>}
                          <span style={{ fontWeight: 700, color: "#15803D" }}>{fmtCur(m.valor)}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════
          TAB: DESPESAS OPP
      ══════════════════════════════════════════════════════════ */}
      {tab === "despesas" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          {!form.nrContratoOS ? (
            <div style={{ background: "#FFFBEB", border: "1px solid #FDE68A", borderRadius: 12, padding: 20, color: "#92400E", fontSize: 13 }}>
              Preencha o campo <strong>Nome do Centro de Custo</strong> na aba Planejamento para vincular as despesas do OPP.
            </div>
          ) : loadingDespesas ? (
            <div style={{ textAlign: "center", padding: 40, color: "#94A3B8", fontSize: 13 }}>Buscando despesas no OPP...</div>
          ) : !despesasOPP ? (
            <div style={{ background: "#FEF2F2", border: "1px solid #FECACA", borderRadius: 12, padding: 20, color: "#991B1B", fontSize: 13 }}>
              Erro ao buscar despesas. Verifique a conexão com o OPP.
            </div>
          ) : !despesasOPP.centroCustoEncontrado ? (
            <div style={{ background: "#FFF7ED", border: "1px solid #FED7AA", borderRadius: 12, padding: 20, color: "#9A3412", fontSize: 13 }}>
              Centro de custo <strong>"{form.nrContratoOS}"</strong> não encontrado no OPP. Verifique o nome exato.
            </div>
          ) : (
            <>
              {/* Resumo */}
              <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 12 }}>
                {[
                  { label: "Total de Despesas", val: fmt(despesasOPP.total), color: "#EF4444" },
                  { label: "Total Pago", val: fmt(despesasOPP.totalPago), color: "#15803D" },
                  { label: "A Pagar", val: fmt(despesasOPP.total - despesasOPP.totalPago), color: "#B45309" },
                ].map(k => (
                  <div key={k.label} style={{ background: "#fff", borderRadius: 12, border: "1.5px solid #E2E8F0", padding: "14px 18px" }}>
                    <div style={{ fontSize: 11, fontWeight: 700, color: "#94A3B8", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 4 }}>{k.label}</div>
                    <div style={{ fontSize: 20, fontWeight: 800, color: k.color }}>{k.val}</div>
                  </div>
                ))}
              </div>

              {/* Tabela */}
              <div style={{ background: "#fff", borderRadius: 12, border: "1.5px solid #E2E8F0", overflow: "hidden" }}>
                <div style={{ padding: "12px 18px", borderBottom: "1px solid #F1F5F9", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <span style={{ fontWeight: 700, fontSize: 13, color: "#0F172A" }}>Lançamentos — {despesasOPP.centroCusto}</span>
                  <span style={{ fontSize: 12, color: "#94A3B8" }}>{despesasOPP.lancamentos.length} registros</span>
                </div>
                <div style={{ overflowX: "auto" }}>
                  <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                    <thead>
                      <tr style={{ background: "#F8FAFC" }}>
                        {["OC", "Descrição", "Fornecedor", "Vencimento", "Valor", "Status"].map(h => (
                          <th key={h} style={{ padding: "10px 14px", textAlign: "left", fontWeight: 700, color: "#64748B", fontSize: 11, textTransform: "uppercase", letterSpacing: "0.05em", whiteSpace: "nowrap" }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {despesasOPP.lancamentos.map((l, i) => (
                        <tr key={i} style={{ borderTop: "1px solid #F1F5F9" }}>
                          <td style={{ padding: "10px 14px", fontWeight: 700, color: "#7C3AED" }}>{l.oc || "—"}</td>
                          <td style={{ padding: "10px 14px", color: "#0F172A", maxWidth: 260 }}>{l.descricao}</td>
                          <td style={{ padding: "10px 14px", color: "#475569" }}>{l.fornecedor || "—"}</td>
                          <td style={{ padding: "10px 14px", color: "#64748B", whiteSpace: "nowrap" }}>{l.data ? new Date(l.data).toLocaleDateString("pt-BR") : "—"}</td>
                          <td style={{ padding: "10px 14px", fontWeight: 700, color: "#0F172A", whiteSpace: "nowrap" }}>{fmt(l.valor)}</td>
                          <td style={{ padding: "10px 14px" }}>
                            <span style={{ fontSize: 11, fontWeight: 700, padding: "3px 8px", borderRadius: 6, background: l.liquidado ? "#DCFCE7" : "#FEF9C3", color: l.liquidado ? "#15803D" : "#92400E" }}>
                              {l.liquidado ? "Pago" : "Pendente"}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          )}

          <button onClick={carregarDespesasOPP} disabled={loadingDespesas} style={{ alignSelf: "flex-start", display: "flex", alignItems: "center", gap: 6, padding: "9px 16px", borderRadius: 8, border: "1.5px solid #E2E8F0", background: "#fff", color: "#475569", fontWeight: 700, fontSize: 12, cursor: "pointer" }}>
            <RefreshCw size={13} style={{ animation: loadingDespesas ? "spin 1s linear infinite" : "none" }} /> Atualizar
          </button>
        </div>
      )}
    </div>
  )
}
