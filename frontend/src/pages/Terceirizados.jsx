import { useEffect, useState, useCallback, useMemo } from 'react'
import { toast } from 'react-hot-toast'
import { PlusIcon, TrashIcon, ArrowPathIcon, UsersIcon, DocumentIcon, LinkIcon, XMarkIcon } from '@heroicons/react/24/outline'
import api from '../utils/api'
import { formatDate, formatBRL } from '../utils/formatters'
import LoadingSpinner from '../components/common/LoadingSpinner'

const WORKFLOW_STEPS = [
  'Backlog', 'Autorizado', 'Em Negociação', 'Ordem de Compra',
  'Em Andamento', 'Análise Técnica', 'Aguardando Aprovação Externa', 'Contas a Pagar', 'Concluído'
]

const STATUS_COLOR = {
  'Backlog': 'badge-gray',
  'Autorizado': 'badge-blue',
  'Em Negociação': 'badge-yellow',
  'Ordem de Compra': 'badge-yellow',
  'Em Andamento': 'badge-green',
  'Análise Técnica': 'badge-blue',
  'Aguardando Aprovação Externa': 'badge-orange',
  'Contas a Pagar': 'badge-red',
  'Concluído': 'badge-green',
  'Cancelado': 'badge-gray',
  'Confirmado': 'badge-green',
  'Solicitado': 'badge-gray',
}

// Mapeamento de cores para status do ClickUp
function statusStyle(s) {
  const sl = (s || '').toLowerCase()
  if (sl.includes('concluí') || sl.includes('conclu') || sl.includes('emitida') || sl.includes('autorizada')) return { bg: '#DCFCE7', color: '#15803D' }
  if (sl.includes('andamento') || sl.includes('execu')) return { bg: '#DBEAFE', color: '#1D4ED8' }
  if (sl.includes('análise') || sl.includes('analise') || sl.includes('técnica') || sl.includes('tecnica')) return { bg: '#EDE9FE', color: '#6D28D9' }
  if (sl.includes('negociação') || sl.includes('negociac') || sl.includes('assinatura') || sl.includes('elab')) return { bg: '#FEF9C3', color: '#A16207' }
  if (sl.includes('pagar') || sl.includes('pagamento') || sl.includes('compra')) return { bg: '#FEE2E2', color: '#DC2626' }
  if (sl.includes('paralisado') || sl.includes('arquivada') || sl.includes('cancelado')) return { bg: '#F1F5F9', color: '#64748B' }
  if (sl.includes('nova') || sl.includes('solicitação') || sl.includes('aguardando')) return { bg: '#F0F9FF', color: '#0369A1' }
  return { bg: '#F1F5F9', color: '#475569' }
}

// Etapas fixas na ordem certa
const ETAPAS = [
  { key: 'solicitação', label: 'Solicitação', color: '#3B82F6', bg: '#EFF6FF', border: '#BFDBFE' },
  { key: 'contratação', label: 'Contratação', color: '#F59E0B', bg: '#FFFBEB', border: '#FDE68A' },
  { key: 'execução', label: 'Execução & Pagamento', color: '#10B981', bg: '#ECFDF5', border: '#A7F3D0' },
]

function getEtapaKey(etapa) {
  const e = (etapa || '').toLowerCase()
  if (e.includes('solicit')) return 'solicitação'
  if (e.includes('contrat')) return 'contratação'
  if (e.includes('execu') || e.includes('pagamento')) return 'execução'
  return null
}

const inp = { padding: "9px 12px", borderRadius: 8, border: "1.5px solid #E2E8F0", background: "#F8FAFC", color: "#0F172A", fontSize: 13, fontFamily: "inherit", outline: "none", width: "100%", boxSizing: "border-box" }
const lbl = { fontSize: 12, fontWeight: 700, color: "#475569", display: "block", marginBottom: 5 }

const SETORES_PAR = ['Arquitetura', 'Saneamento', 'Infraestrutura', 'Administrativo']

export default function Terceirizados() {
  const [terceirizados, setTerceirizados] = useState([])
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [editItem, setEditItem] = useState(null)
  const [projetos, setProjetos] = useState([])
  const [filtroSetor, setFiltroSetor] = useState('')
  const [filtroStatus, setFiltroStatus] = useState('ativos')
  const [filtroFornecedor, setFiltroFornecedor] = useState('')
  const [filtroCliente, setFiltroCliente] = useState('')
  const [filtroVencimentoDe, setFiltroVencimentoDe] = useState('')
  const [filtroVencimentoAte, setFiltroVencimentoAte] = useState('')
  const [filtroEtapa, setFiltroEtapa] = useState('')
  const [filtroStatusClickUp, setFiltroStatusClickUp] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [tercRes, projRes] = await Promise.all([
        api.get('/terceirizados'),
        api.get('/projetos'),
      ])
      setTerceirizados(Array.isArray(tercRes.data) ? tercRes.data : (tercRes.data.terceirizados || []))
      setProjetos(Array.isArray(projRes.data) ? projRes.data : (projRes.data.projetos || []))
    } catch {
      toast.error('Erro ao carregar terceirizados')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  function handleEdit(item) { setEditItem(item); setShowModal(true) }

  async function handleDelete(id) {
    if (!window.confirm('Cancelar este serviço terceirizado?')) return
    try {
      await api.delete(`/terceirizados/${id}`)
      toast.success('Cancelado com sucesso')
      load()
    } catch (err) { toast.error(err.response?.data?.error || 'Erro ao cancelar') }
  }

  // Agrupa por etapa para o painel de resumo
  const resumoPorEtapa = useMemo(() => {
    const grupos = {}
    for (const t of terceirizados) {
      const ek = getEtapaKey(t.Etapa_ClickUp)
      if (!ek) continue
      if (!grupos[ek]) grupos[ek] = {}
      const s = t.Status_ClickUp || t.Status || '—'
      grupos[ek][s] = (grupos[ek][s] || 0) + 1
    }
    return grupos
  }, [terceirizados])

  const fornecedoresUnicos = useMemo(() =>
    [...new Set(terceirizados.filter(t => t.Fornecedor).map(t => t.Fornecedor))].sort(),
    [terceirizados])

  const clientesUnicos = useMemo(() =>
    [...new Set(terceirizados.filter(t => t.Cliente).map(t => t.Cliente))].sort(),
    [terceirizados])

  const tercFiltrados = useMemo(() => terceirizados.filter(t => {
    if (filtroSetor && !(t.Setor || '').toLowerCase().includes(filtroSetor.toLowerCase())) return false
    if (filtroFornecedor && t.Fornecedor !== filtroFornecedor) return false
    if (filtroCliente && t.Cliente !== filtroCliente) return false
    if (filtroStatus === 'ativos' && (t.Status === 'Solicitado' || t.Status === 'Cancelado')) return false
    if (filtroStatus === 'solicitado' && t.Status !== 'Solicitado') return false
    if (filtroStatus === 'cancelado' && t.Status !== 'Cancelado') return false
    if (filtroVencimentoDe && t.Data_Vencimento && t.Data_Vencimento < filtroVencimentoDe) return false
    if (filtroVencimentoAte && t.Data_Vencimento && t.Data_Vencimento > filtroVencimentoAte) return false
    if (filtroEtapa && getEtapaKey(t.Etapa_ClickUp) !== filtroEtapa) return false
    if (filtroStatusClickUp && (t.Status_ClickUp || '').toLowerCase() !== filtroStatusClickUp.toLowerCase()) return false
    return true
  }), [terceirizados, filtroSetor, filtroFornecedor, filtroCliente, filtroStatus, filtroVencimentoDe, filtroVencimentoAte, filtroEtapa, filtroStatusClickUp])

  function selecionarEtapaStatus(etapaKey, status) {
    if (filtroEtapa === etapaKey && filtroStatusClickUp === status) {
      setFiltroEtapa(''); setFiltroStatusClickUp('')
    } else {
      setFiltroEtapa(etapaKey); setFiltroStatusClickUp(status)
      setFiltroStatus('') // mostra todos incluindo solicitado
    }
  }

  function selecionarEtapa(etapaKey) {
    if (filtroEtapa === etapaKey && !filtroStatusClickUp) {
      setFiltroEtapa('')
    } else {
      setFiltroEtapa(etapaKey); setFiltroStatusClickUp('')
      setFiltroStatus('')
    }
  }

  function limparFiltros() {
    setFiltroSetor(''); setFiltroFornecedor(''); setFiltroCliente('')
    setFiltroVencimentoDe(''); setFiltroVencimentoAte('')
    setFiltroEtapa(''); setFiltroStatusClickUp('')
    setFiltroStatus('ativos')
  }

  const ativoEtapaBadge = filtroEtapa || filtroStatusClickUp
  const temFiltroAtivo = filtroSetor || filtroFornecedor || filtroCliente || filtroVencimentoDe || filtroVencimentoAte

  return (
    <div style={{ padding: "28px 32px" }}>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 20 }}>
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 4 }}>
            <UsersIcon style={{ width: 22, height: 22, color: "#00B5CC" }} />
            <h1 style={{ margin: 0, fontSize: 22, fontWeight: 800, color: "#0F172A" }}>Serviços Terceirizados</h1>
          </div>
          <p style={{ margin: 0, fontSize: 13, color: "#64748B" }}>{tercFiltrados.length} de {terceirizados.length} registros</p>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button onClick={load} style={{ padding: "9px 16px", borderRadius: 8, border: "1.5px solid #E2E8F0", background: "#fff", color: "#475569", fontWeight: 700, fontSize: 13, cursor: "pointer", display: "flex", alignItems: "center", gap: 6 }}>
            <ArrowPathIcon style={{ width: 15, height: 15 }} /> Atualizar
          </button>
        </div>
      </div>

      {/* Painel por etapa ClickUp */}
      {!loading && (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12, marginBottom: 20 }}>
          {ETAPAS.map(etapa => {
            const statusMap = resumoPorEtapa[etapa.key] || {}
            const total = Object.values(statusMap).reduce((a, b) => a + b, 0)
            const isActive = filtroEtapa === etapa.key
            return (
              <div key={etapa.key}
                style={{
                  background: isActive ? etapa.bg : '#fff',
                  border: `1.5px solid ${isActive ? etapa.color : '#E2E8F0'}`,
                  borderRadius: 12,
                  padding: "14px 16px",
                  cursor: 'pointer',
                  transition: 'border-color 0.15s, box-shadow 0.15s',
                  boxShadow: isActive ? `0 0 0 3px ${etapa.bg}` : 'none',
                }}
                onClick={() => selecionarEtapa(etapa.key)}
              >
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
                    <div style={{ width: 8, height: 8, borderRadius: '50%', background: etapa.color }} />
                    <span style={{ fontSize: 12, fontWeight: 800, color: etapa.color, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{etapa.label}</span>
                  </div>
                  <span style={{ fontSize: 18, fontWeight: 900, color: etapa.color }}>{total}</span>
                </div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 5 }}>
                  {Object.entries(statusMap)
                    .sort((a, b) => b[1] - a[1])
                    .map(([s, count]) => {
                      const st = statusStyle(s)
                      const isStatusActive = filtroEtapa === etapa.key && filtroStatusClickUp.toLowerCase() === s.toLowerCase()
                      return (
                        <span key={s}
                          onClick={e => { e.stopPropagation(); selecionarEtapaStatus(etapa.key, s) }}
                          title={`Filtrar: ${s}`}
                          style={{
                            display: "inline-flex", alignItems: "center", gap: 4,
                            padding: "3px 8px", borderRadius: 20,
                            fontSize: 11, fontWeight: 700,
                            background: isStatusActive ? st.color : st.bg,
                            color: isStatusActive ? '#fff' : st.color,
                            border: `1px solid ${isStatusActive ? st.color : st.bg}`,
                            cursor: 'pointer',
                            transition: 'background 0.12s',
                            whiteSpace: 'nowrap',
                          }}>
                          {s} <span style={{ opacity: 0.75, fontWeight: 600 }}>{count}</span>
                        </span>
                      )
                    })}
                  {Object.keys(statusMap).length === 0 && (
                    <span style={{ fontSize: 11, color: "#CBD5E1" }}>Sem registros</span>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Filtro ativo badge */}
      {ativoEtapaBadge && (
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12, padding: "8px 14px", background: "#F0F9FF", borderRadius: 8, border: "1px solid #BAE6FD" }}>
          <span style={{ fontSize: 12, color: "#0369A1", fontWeight: 600 }}>
            Filtrando: {ETAPAS.find(e => e.key === filtroEtapa)?.label || filtroEtapa}
            {filtroStatusClickUp && ` › ${filtroStatusClickUp}`}
          </span>
          <button onClick={() => { setFiltroEtapa(''); setFiltroStatusClickUp(''); setFiltroStatus('ativos') }}
            style={{ marginLeft: 4, background: "none", border: "none", cursor: "pointer", color: "#0369A1", fontWeight: 700, fontSize: 12, padding: "2px 6px", borderRadius: 4 }}>
            × Limpar
          </button>
        </div>
      )}

      {/* Filtros */}
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 16, alignItems: "center" }}>
        {/* Status PAR */}
        <select value={filtroStatus} onChange={e => { setFiltroStatus(e.target.value); setFiltroEtapa(''); setFiltroStatusClickUp('') }}
          style={{ ...inp, width: "auto", paddingRight: 32 }}>
          <option value="ativos">Contratos ativos</option>
          <option value="solicitado">Só cotações (Solicitado)</option>
          <option value="cancelado">Cancelados</option>
        </select>

        {/* Fornecedor */}
        <select value={filtroFornecedor} onChange={e => setFiltroFornecedor(e.target.value)}
          style={{ ...inp, width: "auto", paddingRight: 32 }}>
          <option value="">Fornecedor: Todos</option>
          {fornecedoresUnicos.map(f => <option key={f} value={f}>{f}</option>)}
        </select>

        {/* Cliente */}
        <select value={filtroCliente} onChange={e => setFiltroCliente(e.target.value)}
          style={{ ...inp, width: "auto", paddingRight: 32 }}>
          <option value="">Cliente: Todos</option>
          {clientesUnicos.map(c => <option key={c} value={c}>{c}</option>)}
        </select>

        {/* Setor */}
        <select value={filtroSetor} onChange={e => setFiltroSetor(e.target.value)}
          style={{ ...inp, width: "auto", paddingRight: 32 }}>
          <option value="">Setor: Todos</option>
          {SETORES_PAR.map(s => <option key={s} value={s}>{s}</option>)}
        </select>

        {/* Vencimento */}
        <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
          <span style={{ fontSize: 12, color: "#64748B", fontWeight: 600, whiteSpace: "nowrap" }}>Venc. de</span>
          <input type="date" value={filtroVencimentoDe} onChange={e => setFiltroVencimentoDe(e.target.value)}
            style={{ ...inp, width: 140 }} />
          <span style={{ fontSize: 12, color: "#64748B", fontWeight: 600 }}>até</span>
          <input type="date" value={filtroVencimentoAte} onChange={e => setFiltroVencimentoAte(e.target.value)}
            style={{ ...inp, width: 140 }} />
        </div>

        {temFiltroAtivo && (
          <button onClick={limparFiltros}
            style={{ padding: "9px 14px", borderRadius: 8, border: "1.5px solid #FEE2E2", background: "#FFF5F5", color: "#DC2626", fontWeight: 700, fontSize: 12, cursor: "pointer" }}>
            Limpar filtros
          </button>
        )}
      </div>

      {/* Tabela */}
      {loading ? (
        <div style={{ background: "#fff", borderRadius: 12, border: "1px solid #E2E8F0", padding: 60, textAlign: "center" }}>
          <LoadingSpinner text="Buscando terceirizados..." />
        </div>
      ) : (
        <div style={{ background: "#fff", borderRadius: 12, border: "1px solid #E2E8F0", overflow: "hidden" }}>
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", whiteSpace: "nowrap" }}>
              <thead>
                <tr style={{ background: "#F8FAFC" }}>
                  {[
                    { h: "Projeto",         align: "left"   },
                    { h: "Cliente",         align: "left"   },
                    { h: "Fornecedor",      align: "left"   },
                    { h: "Serviço",         align: "left"   },
                    { h: "Vencimento",      align: "center" },
                    { h: "Valor Cont.",     align: "right"  },
                    { h: "Valor Liquid.",   align: "right"  },
                    { h: "Saldo",           align: "right"  },
                    { h: "Setor",           align: "center" },
                    { h: "Status",          align: "center" },
                    { h: "Doc.",            align: "center" },
                    { h: "Ações",           align: "right"  },
                  ].map(({ h, align }) => (
                    <th key={h} style={{ padding: "12px 14px", fontSize: 11, fontWeight: 700, color: "#64748B", textAlign: align, letterSpacing: 0.5, textTransform: "uppercase", borderBottom: "1px solid #E2E8F0" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {tercFiltrados.length === 0 ? (
                  <tr>
                    <td colSpan={12} style={{ textAlign: "center", padding: 48, color: "#64748B", fontSize: 13 }}>
                      <UsersIcon style={{ width: 36, height: 36, margin: "0 auto 10px", opacity: 0.3 }} />
                      <div>Nenhum registro encontrado</div>
                    </td>
                  </tr>
                ) : tercFiltrados.map(t => {
                  const valorC = parseFloat(t.Valor_Contratado || 0)
                  const valorL = parseFloat(t.Valor_Liquidado || 0)
                  const saldo  = parseFloat(t.Saldo ?? (valorC - valorL))
                  const saldoNeg = saldo < 0
                  const sCUp = t.Status_ClickUp || t.Status || ''
                  const sSt = statusStyle(sCUp)
                  const ek = getEtapaKey(t.Etapa_ClickUp)
                  const etapaCfg = ETAPAS.find(e => e.key === ek)
                  const setorMap = { arq: '#3B82F6', san: '#10B981', inf: '#F59E0B', adm: '#8B5CF6' }
                  const setorColor = setorMap[Object.keys(setorMap).find(k => (t.Setor || '').toLowerCase().includes(k)) || ''] || '#94A3B8'
                  return (
                    <tr key={t.ID_Terceirizado || t.ID} style={{ borderBottom: "1px solid #F1F5F9", transition: "background 0.12s" }}
                      onMouseEnter={e => e.currentTarget.style.background = "#F8FAFC"}
                      onMouseLeave={e => e.currentTarget.style.background = ""}>

                      {/* Projeto */}
                      <td style={{ padding: "11px 14px" }}>
                        <div style={{ fontWeight: 700, fontSize: 13, color: "#0F172A", maxWidth: 180, overflow: "hidden", textOverflow: "ellipsis" }} title={t.nomeProjeto}>
                          {t.nomeProjeto || <span style={{ color: "#CBD5E1" }}>—</span>}
                        </div>
                        {etapaCfg && (
                          <span style={{ display: "inline-block", marginTop: 2, padding: "1px 7px", borderRadius: 20, fontSize: 10, fontWeight: 800, background: etapaCfg.bg, color: etapaCfg.color, border: `1px solid ${etapaCfg.border}` }}>
                            {etapaCfg.label === 'Execução & Pagamento' ? 'Execução' : etapaCfg.label}
                          </span>
                        )}
                      </td>

                      {/* Cliente */}
                      <td style={{ padding: "11px 14px", fontSize: 12, color: "#334155", maxWidth: 140, overflow: "hidden", textOverflow: "ellipsis" }} title={t.Cliente}>
                        {t.Cliente || <span style={{ color: "#CBD5E1" }}>—</span>}
                      </td>

                      {/* Fornecedor */}
                      <td style={{ padding: "11px 14px" }}>
                        <div style={{ fontWeight: 700, fontSize: 13, color: "#00788A", maxWidth: 160, overflow: "hidden", textOverflow: "ellipsis" }} title={t.Fornecedor}>
                          {t.Fornecedor || <span style={{ color: "#CBD5E1" }}>—</span>}
                        </div>
                        {t.CNPJ_CPF && <div style={{ fontSize: 11, color: "#94A3B8" }}>{t.CNPJ_CPF}</div>}
                      </td>

                      {/* Serviço */}
                      <td style={{ padding: "11px 14px", maxWidth: 220 }}>
                        <div style={{ fontSize: 12, color: "#0F172A", overflow: "hidden", textOverflow: "ellipsis" }} title={t.Descricao_Servico}>
                          {t.Descricao_Servico || t.Servico || <span style={{ color: "#CBD5E1" }}>—</span>}
                        </div>
                        {t.Nr_Contrato && <div style={{ fontSize: 11, color: "#7C3AED", fontWeight: 600, marginTop: 2 }}>Nº {t.Nr_Contrato}</div>}
                      </td>

                      {/* Vencimento */}
                      <td style={{ padding: "11px 14px", textAlign: "center", fontSize: 12, color: "#64748B" }}>
                        {formatDate(t.Data_Vencimento) || "—"}
                      </td>

                      {/* Valor Contratado */}
                      <td style={{ padding: "11px 14px", textAlign: "right", fontSize: 13, fontWeight: 700, color: valorC > 0 ? "#0F172A" : "#CBD5E1" }}>
                        {valorC > 0 ? formatBRL(valorC) : "—"}
                      </td>

                      {/* Valor Liquidado */}
                      <td style={{ padding: "11px 14px", textAlign: "right", fontSize: 13, fontWeight: 700, color: valorL > 0 ? "#15803D" : "#CBD5E1" }}>
                        {valorL > 0 ? formatBRL(valorL) : "—"}
                      </td>

                      {/* Saldo */}
                      <td style={{ padding: "11px 14px", textAlign: "right" }}>
                        {valorC > 0 ? (
                          <span style={{ fontSize: 13, fontWeight: 800, color: saldoNeg ? "#DC2626" : "#475569" }}>
                            {formatBRL(saldo)}
                          </span>
                        ) : <span style={{ color: "#CBD5E1" }}>—</span>}
                      </td>

                      {/* Setor */}
                      <td style={{ padding: "11px 14px", textAlign: "center" }}>
                        {t.Setor ? (
                          <span style={{ fontSize: 10, fontWeight: 800, padding: "2px 8px", borderRadius: 20, background: `${setorColor}18`, color: setorColor, border: `1px solid ${setorColor}40` }}>
                            {t.Setor}
                          </span>
                        ) : <span style={{ color: "#CBD5E1" }}>—</span>}
                      </td>

                      {/* Status ClickUp */}
                      <td style={{ padding: "11px 14px", textAlign: "center" }}>
                        {sCUp ? (
                          <span style={{ display: "inline-block", padding: "3px 10px", borderRadius: 20, fontSize: 11, fontWeight: 700, background: sSt.bg, color: sSt.color, whiteSpace: 'nowrap' }}>
                            {sCUp}
                          </span>
                        ) : <span style={{ color: "#CBD5E1" }}>—</span>}
                      </td>

                      {/* Doc */}
                      <td style={{ padding: "11px 14px", textAlign: "center" }}>
                        {t.Link_Contrato ? (
                          <a href={t.Link_Contrato} target="_blank" rel="noopener noreferrer" title="Ver documento" style={{ color: "#7C3AED", display: "inline-flex", alignItems: "center" }}>
                            <DocumentIcon style={{ width: 16, height: 16 }} />
                          </a>
                        ) : <span style={{ color: "#E2E8F0" }}>—</span>}
                      </td>

                      {/* Ações */}
                      <td style={{ padding: "11px 14px", textAlign: "right" }}>
                        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
                          <button onClick={() => handleEdit(t)} style={{ fontSize: 11, color: "#00788A", fontWeight: 700, background: "none", border: "none", cursor: "pointer" }}>EDITAR</button>
                          <span style={{ color: "#E2E8F0" }}>|</span>
                          <button onClick={() => handleDelete(t.ID_Terceirizado || t.ID)} style={{ fontSize: 11, color: "#EF4444", fontWeight: 700, background: "none", border: "none", cursor: "pointer" }}>CANCELAR</button>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {showModal && (
        <TerceirizadoModal item={editItem} projetos={projetos} onClose={() => setShowModal(false)} onSaved={load} />
      )}
    </div>
  )
}

function TerceirizadoModal({ item, projetos, onClose, onSaved }) {
  const [loading, setLoading] = useState(false)
  const [form, setForm] = useState({
    ID_Projeto: item?.ID_Projeto || '',
    Fornecedor: item?.Fornecedor || '',
    CNPJ_CPF: item?.CNPJ_CPF || '',
    Descricao_Servico: item?.Descricao_Servico || item?.Servico || '',
    Nr_Contrato: item?.Nr_Contrato || '',
    Valor_Estimado: item?.Valor_Estimado || '',
    Valor_Contratado: item?.Valor_Contratado || '',
    Status: item?.Status || 'Backlog',
    Data_Vencimento: item?.Data_Vencimento || item?.Data_Entrega_Prevista || '',
    Nr_NF: item?.Nr_NF || '',
    Data_Pagamento: item?.Data_Pagamento || '',
    Link_Contrato: item?.Link_Contrato || '',
    Observacoes: item?.Observacoes || item?.Observacao || '',
  })

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  const projetoSel = projetos.find(p => p.ID_Projeto === form.ID_Projeto)
  const valorGlobal = parseFloat(projetoSel?.Valor_Global || 0)
  const valorC = parseFloat(form.Valor_Contratado || 0)
  const percCalc = valorGlobal > 0 && valorC > 0 ? ((valorC / valorGlobal) * 100).toFixed(1) : null

  async function onSubmit(e) {
    e.preventDefault()
    if (!form.ID_Projeto || !form.Fornecedor || !form.Descricao_Servico) {
      toast.error('Preencha Projeto, Fornecedor e Descrição do Serviço')
      return
    }
    setLoading(true)
    try {
      const payload = { ...form }
      if (item?.ID_Terceirizado || item?.ID) {
        await api.put(`/terceirizados/${item.ID_Terceirizado || item.ID}`, payload)
        toast.success('Atualizado com sucesso!')
      } else {
        await api.post('/terceirizados', { ...payload, idProjeto: form.ID_Projeto, servico: form.Descricao_Servico, fornecedor: form.Fornecedor, valorContratado: form.Valor_Contratado, valorEstimado: form.Valor_Estimado })
        toast.success('Criado com sucesso!')
      }
      onSaved(); onClose()
    } catch (err) { toast.error(err.response?.data?.error || 'Erro ao salvar') }
    finally { setLoading(false) }
  }

  const field = (label, key, type = "text", extra = {}) => (
    <div style={extra.col2 ? { gridColumn: "span 2" } : {}}>
      <label style={lbl}>{label}{extra.required && <span style={{ color: "#EF4444" }}> *</span>}</label>
      <input type={type} value={form[key]} onChange={e => set(key, e.target.value)} style={inp} placeholder={extra.placeholder} />
    </div>
  )

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)", zIndex: 50, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
      <div style={{ background: "#fff", borderRadius: 16, width: "100%", maxWidth: 680, maxHeight: "90vh", overflowY: "auto", boxShadow: "0 20px 60px rgba(0,0,0,0.2)" }}>
        <div style={{ padding: "20px 24px", borderBottom: "1px solid #E2E8F0", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div style={{ fontWeight: 800, fontSize: 16, color: "#0F172A" }}>{item ? "Editar Terceirizado" : "Novo Serviço Terceirizado"}</div>
          <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", color: "#94A3B8" }}><XMarkIcon style={{ width: 20, height: 20 }} /></button>
        </div>

        <form onSubmit={onSubmit} style={{ padding: "24px" }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>

            <div style={{ gridColumn: "span 2" }}>
              <label style={lbl}>Projeto <span style={{ color: "#EF4444" }}>*</span></label>
              <select value={form.ID_Projeto} onChange={e => set('ID_Projeto', e.target.value)} style={inp}>
                <option value="">Selecione o projeto...</option>
                {projetos.map(p => <option key={p.ID_Projeto} value={p.ID_Projeto}>{p.Nome}</option>)}
              </select>
              {projetoSel && (
                <div style={{ marginTop: 6, fontSize: 12, color: "#7C3AED", fontWeight: 600 }}>
                  Valor do contrato: {Number(projetoSel.Valor_Global || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}
                </div>
              )}
            </div>

            <div>
              <label style={lbl}>Fornecedor / Empresa <span style={{ color: "#EF4444" }}>*</span></label>
              <input value={form.Fornecedor} onChange={e => set('Fornecedor', e.target.value)} style={inp} placeholder="Nome da empresa ou profissional" />
            </div>
            <div>
              <label style={lbl}>CNPJ / CPF</label>
              <input value={form.CNPJ_CPF} onChange={e => set('CNPJ_CPF', e.target.value)} style={inp} placeholder="00.000.000/0000-00" />
            </div>

            <div style={{ gridColumn: "span 2" }}>
              <label style={lbl}>Descrição do Serviço <span style={{ color: "#EF4444" }}>*</span></label>
              <input value={form.Descricao_Servico} onChange={e => set('Descricao_Servico', e.target.value)} style={inp} placeholder="Ex: Projeto estrutural, Levantamento topográfico..." />
            </div>

            <div>
              <label style={lbl}>Número do Contrato</label>
              <input value={form.Nr_Contrato} onChange={e => set('Nr_Contrato', e.target.value)} style={inp} placeholder="Ex: CT-2026-001" />
            </div>

            <div>
              <label style={lbl}>Status</label>
              <select value={form.Status} onChange={e => set('Status', e.target.value)} style={inp}>
                {WORKFLOW_STEPS.map(s => <option key={s}>{s}</option>)}
              </select>
            </div>

            <div>
              <label style={lbl}>Valor Contratado (R$)</label>
              <input value={form.Valor_Contratado} onChange={e => set('Valor_Contratado', e.target.value)} style={inp} placeholder="0,00" type="number" step="0.01" min="0" />
            </div>

            {percCalc && (
              <div style={{ gridColumn: "span 2", padding: "8px 12px", borderRadius: 8, background: parseFloat(percCalc) > 25 ? "#FEF2F2" : "#F0FDF4", border: `1px solid ${parseFloat(percCalc) > 25 ? "#FCA5A5" : "#86EFAC"}` }}>
                <span style={{ fontSize: 13, fontWeight: 700, color: parseFloat(percCalc) > 25 ? "#DC2626" : "#15803D" }}>
                  % do contrato do projeto: {percCalc}%
                  {parseFloat(percCalc) > 25 && " ⚠️ Acima do limite de 25%"}
                </span>
              </div>
            )}

            <div>
              <label style={lbl}>Data de Vencimento</label>
              <input type="date" value={form.Data_Vencimento} onChange={e => set('Data_Vencimento', e.target.value)} style={inp} />
            </div>
            <div>
              <label style={lbl}>Data de Pagamento</label>
              <input type="date" value={form.Data_Pagamento} onChange={e => set('Data_Pagamento', e.target.value)} style={inp} />
            </div>

            <div style={{ gridColumn: "span 2" }}>
              <label style={lbl}>Número da NF</label>
              <input value={form.Nr_NF} onChange={e => set('Nr_NF', e.target.value)} style={inp} placeholder="Ex: NF-12345" />
            </div>

            <div style={{ gridColumn: "span 2" }}>
              <label style={lbl}>Link do Documento / Contrato</label>
              <div style={{ display: "flex", gap: 8 }}>
                <input value={form.Link_Contrato} onChange={e => set('Link_Contrato', e.target.value)} style={{ ...inp, flex: 1 }} placeholder="Cole o link do documento (Google Drive, Dropbox...)" />
                {form.Link_Contrato && (
                  <a href={form.Link_Contrato} target="_blank" rel="noopener noreferrer"
                    style={{ padding: "9px 14px", borderRadius: 8, border: "1.5px solid #7C3AED", background: "#F5F3FF", color: "#7C3AED", fontWeight: 700, fontSize: 12, display: "flex", alignItems: "center", gap: 5, textDecoration: "none", whiteSpace: "nowrap" }}>
                    <LinkIcon style={{ width: 14, height: 14 }} /> Abrir
                  </a>
                )}
              </div>
              <div style={{ fontSize: 11, color: "#94A3B8", marginTop: 4 }}>
                Faça upload do contrato no Google Drive ou outro serviço e cole o link de compartilhamento aqui.
              </div>
            </div>

            <div style={{ gridColumn: "span 2" }}>
              <label style={lbl}>Observações</label>
              <textarea value={form.Observacoes} onChange={e => set('Observacoes', e.target.value)} rows={3}
                style={{ ...inp, resize: "vertical" }} placeholder="Notas adicionais..." />
            </div>
          </div>

          <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 20, paddingTop: 16, borderTop: "1px solid #E2E8F0" }}>
            <button type="button" onClick={onClose} style={{ padding: "10px 20px", borderRadius: 8, border: "1.5px solid #E2E8F0", background: "#fff", color: "#475569", fontWeight: 700, fontSize: 13, cursor: "pointer" }}>Cancelar</button>
            <button type="submit" disabled={loading} style={{ padding: "10px 24px", borderRadius: 8, border: "none", background: "#00B5CC", color: "#fff", fontWeight: 800, fontSize: 13, cursor: "pointer" }}>
              {loading ? "Salvando..." : (item ? "Salvar Alterações" : "Criar Registro")}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
