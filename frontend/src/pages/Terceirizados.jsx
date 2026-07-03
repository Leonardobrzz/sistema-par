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
  const [filtroStatus, setFiltroStatus] = useState('ativos')  // 'ativos' = esconde Solicitado
  const [filtroProjeto, setFiltroProjeto] = useState('')
  const [filtroFornecedor, setFiltroFornecedor] = useState('')
  const [filtroBusca, setFiltroBusca] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [tercRes, projRes] = await Promise.all([
        api.get('/terceirizados'),
        api.get('/projetos'),
      ])
      setTerceirizados(Array.isArray(tercRes.data) ? tercRes.data : (tercRes.data.terceirizados || []))
      setProjetos(projRes.data.projetos || [])
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

  const fornecedoresUnicos = useMemo(() =>
    [...new Set(terceirizados.filter(t => t.Fornecedor).map(t => t.Fornecedor))].sort(),
    [terceirizados])

  const tercFiltrados = useMemo(() => terceirizados.filter(t => {
    if (filtroSetor && !(t.Setor || '').toLowerCase().includes(filtroSetor.toLowerCase())) return false
    if (filtroProjeto && t.ID_Projeto !== filtroProjeto) return false
    if (filtroFornecedor && t.Fornecedor !== filtroFornecedor) return false
    if (filtroStatus === 'ativos' && (t.Status === 'Solicitado' || t.Status === 'Cancelado')) return false
    if (filtroStatus === 'solicitado' && t.Status !== 'Solicitado') return false
    if (filtroStatus === 'cancelado' && t.Status !== 'Cancelado') return false
    if (filtroBusca) {
      const b = filtroBusca.toLowerCase()
      if (!(t.Fornecedor || '').toLowerCase().includes(b) &&
          !(t.Descricao_Servico || '').toLowerCase().includes(b) &&
          !(t.nomeProjeto || '').toLowerCase().includes(b) &&
          !(t.Nr_Contrato || '').toLowerCase().includes(b)) return false
    }
    return true
  }), [terceirizados, filtroSetor, filtroProjeto, filtroFornecedor, filtroStatus, filtroBusca])

  return (
    <div style={{ padding: "28px 32px" }}>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 24 }}>
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
          <button onClick={() => { setEditItem(null); setShowModal(true) }} style={{ padding: "9px 16px", borderRadius: 8, border: "none", background: "#00B5CC", color: "#fff", fontWeight: 700, fontSize: 13, cursor: "pointer", display: "flex", alignItems: "center", gap: 6 }}>
            <PlusIcon style={{ width: 15, height: 15 }} /> Novo Registro
          </button>
        </div>
      </div>

      {/* Filtros setor */}
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center", marginBottom: 12 }}>
        {SETORES_PAR.map(s => (
          <button key={s} onClick={() => setFiltroSetor(filtroSetor === s ? '' : s)}
            style={{ padding: "5px 14px", borderRadius: 20, border: `1.5px solid ${filtroSetor === s ? "#00B5CC" : "#E2E8F0"}`, background: filtroSetor === s ? "rgba(0,181,204,0.08)" : "#fff", color: filtroSetor === s ? "#007A8A" : "#64748B", fontWeight: 600, fontSize: 12, cursor: "pointer" }}>
            {s}
          </button>
        ))}
      </div>

      {/* Filtros linha */}
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 16 }}>
        <select value={filtroStatus} onChange={e => setFiltroStatus(e.target.value)}
          style={{ ...inp, width: "auto", paddingRight: 32 }}>
          <option value="ativos">Contratos ativos</option>
          <option value="">Todos os registros</option>
          <option value="solicitado">Só cotações (Solicitado)</option>
          <option value="cancelado">Cancelados</option>
        </select>
        <select value={filtroProjeto} onChange={e => setFiltroProjeto(e.target.value)}
          style={{ ...inp, width: "auto", paddingRight: 32 }}>
          <option value="">Projeto: Todos</option>
          {projetos.filter(p => !filtroSetor || (p.Setor || '').toLowerCase().includes(filtroSetor.toLowerCase())).map(p => (
            <option key={p.ID_Projeto} value={p.ID_Projeto}>{p.Nome}</option>
          ))}
        </select>
        <select value={filtroFornecedor} onChange={e => setFiltroFornecedor(e.target.value)}
          style={{ ...inp, width: "auto", paddingRight: 32 }}>
          <option value="">Fornecedor: Todos</option>
          {fornecedoresUnicos.map(f => <option key={f} value={f}>{f}</option>)}
        </select>
        <input value={filtroBusca} onChange={e => setFiltroBusca(e.target.value)} placeholder="Buscar projeto, fornecedor, serviço, nº contrato..."
          style={{ ...inp, width: 280 }} />
        {(filtroSetor || filtroFornecedor || filtroBusca || filtroProjeto) && (
          <button onClick={() => { setFiltroSetor(''); setFiltroFornecedor(''); setFiltroBusca(''); setFiltroProjeto('') }}
            style={{ padding: "9px 14px", borderRadius: 8, border: "1.5px solid #FEE2E2", background: "#FFF5F5", color: "#DC2626", fontWeight: 700, fontSize: 12, cursor: "pointer" }}>
            Limpar
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
                  {["Projeto", "Fornecedor", "Serviço / Nº Contrato", "Valor Est.", "Valor Contrat.", "% Contrato", "Status", "Vencimento", "Doc.", "Ações"].map(h => (
                    <th key={h} style={{ padding: "12px 14px", fontSize: 11, fontWeight: 700, color: "#64748B", textAlign: h.includes("Valor") || h === "% Contrato" ? "right" : h === "Status" || h === "Vencimento" || h === "Doc." ? "center" : "left", letterSpacing: 0.5, textTransform: "uppercase", borderBottom: "1px solid #E2E8F0" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {tercFiltrados.length === 0 ? (
                  <tr>
                    <td colSpan={10} style={{ textAlign: "center", padding: 48, color: "#64748B", fontSize: 13 }}>
                      <UsersIcon style={{ width: 36, height: 36, margin: "0 auto 10px", opacity: 0.3 }} />
                      <div>Nenhum registro encontrado</div>
                    </td>
                  </tr>
                ) : tercFiltrados.map(t => {
                  const perc = parseFloat(t.Percentual_Contrato || 0)
                  const percColor = perc > 20 ? "#DC2626" : perc > 15 ? "#D97706" : "#16A34A"
                  const valorC = parseFloat(t.Valor_Contratado || 0)
                  const valorE = parseFloat(t.Valor_Estimado || 0)
                  return (
                    <tr key={t.ID_Terceirizado || t.ID} style={{ borderBottom: "1px solid #F1F5F9", transition: "background 0.12s" }}
                      onMouseEnter={e => e.currentTarget.style.background = "#F8FAFC"}
                      onMouseLeave={e => e.currentTarget.style.background = ""}>
                      <td style={{ padding: "11px 14px" }}>
                        <div style={{ fontWeight: 700, fontSize: 13, color: "#0F172A", maxWidth: 200, overflow: "hidden", textOverflow: "ellipsis" }} title={t.nomeProjeto}>{t.nomeProjeto || t.ID_Projeto || <span style={{ color: "#CBD5E1" }}>—</span>}</div>
                        {t.Setor && <div style={{ fontSize: 11, color: "#94A3B8", marginTop: 1 }}>{t.Setor}</div>}
                      </td>
                      <td style={{ padding: "11px 14px" }}>
                        <div style={{ fontWeight: 700, fontSize: 13, color: "#00788A", maxWidth: 200, overflow: "hidden", textOverflow: "ellipsis" }} title={t.Fornecedor}>{t.Fornecedor || <span style={{ color: "#CBD5E1" }}>—</span>}</div>
                        {t.CNPJ_CPF && <div style={{ fontSize: 11, color: "#94A3B8", marginTop: 1 }}>{t.CNPJ_CPF}</div>}
                      </td>
                      <td style={{ padding: "11px 14px", maxWidth: 260 }}>
                        <div style={{ fontSize: 12, color: "#0F172A", overflow: "hidden", textOverflow: "ellipsis" }} title={t.Descricao_Servico}>{t.Descricao_Servico || t.Servico || <span style={{ color: "#CBD5E1" }}>—</span>}</div>
                        {t.Nr_Contrato && <div style={{ fontSize: 11, color: "#7C3AED", fontWeight: 600, marginTop: 2 }}>Nº {t.Nr_Contrato}</div>}
                      </td>
                      <td style={{ padding: "11px 14px", textAlign: "right", fontSize: 13, fontWeight: 600, color: valorE > 0 ? "#0F172A" : "#CBD5E1" }}>{valorE > 0 ? formatBRL(valorE) : "—"}</td>
                      <td style={{ padding: "11px 14px", textAlign: "right", fontSize: 13, fontWeight: 700, color: valorC > 0 ? "#0F172A" : "#CBD5E1" }}>{valorC > 0 ? formatBRL(valorC) : "—"}</td>
                      <td style={{ padding: "11px 14px", textAlign: "right" }}>
                        <span style={{ fontSize: 13, fontWeight: 700, color: percColor }}>{perc > 0 ? `${perc.toFixed(1)}%` : "—"}</span>
                      </td>
                      <td style={{ padding: "11px 14px", textAlign: "center" }}>
                        <span style={{ display: "inline-block", padding: "3px 10px", borderRadius: 20, fontSize: 11, fontWeight: 700, background: STATUS_COLOR[t.Status] === 'badge-green' ? "#DCFCE7" : STATUS_COLOR[t.Status] === 'badge-blue' ? "#DBEAFE" : STATUS_COLOR[t.Status] === 'badge-yellow' ? "#FEF9C3" : STATUS_COLOR[t.Status] === 'badge-red' ? "#FEE2E2" : "#F1F5F9", color: STATUS_COLOR[t.Status] === 'badge-green' ? "#15803D" : STATUS_COLOR[t.Status] === 'badge-blue' ? "#1D4ED8" : STATUS_COLOR[t.Status] === 'badge-yellow' ? "#A16207" : STATUS_COLOR[t.Status] === 'badge-red' ? "#DC2626" : "#64748B" }}>
                          {t.Status || "—"}
                        </span>
                      </td>
                      <td style={{ padding: "11px 14px", textAlign: "center", fontSize: 12, color: "#64748B" }}>{formatDate(t.Data_Vencimento) || "—"}</td>
                      <td style={{ padding: "11px 14px", textAlign: "center" }}>
                        {t.Link_Contrato ? (
                          <a href={t.Link_Contrato} target="_blank" rel="noopener noreferrer" title="Ver documento" style={{ color: "#7C3AED", display: "inline-flex", alignItems: "center" }}>
                            <DocumentIcon style={{ width: 16, height: 16 }} />
                          </a>
                        ) : <span style={{ color: "#E2E8F0" }}>—</span>}
                      </td>
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

  // Calcula % em tempo real baseado no valor do projeto selecionado
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
        {/* Header */}
        <div style={{ padding: "20px 24px", borderBottom: "1px solid #E2E8F0", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div style={{ fontWeight: 800, fontSize: 16, color: "#0F172A" }}>{item ? "Editar Terceirizado" : "Novo Serviço Terceirizado"}</div>
          <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", color: "#94A3B8" }}><XMarkIcon style={{ width: 20, height: 20 }} /></button>
        </div>

        <form onSubmit={onSubmit} style={{ padding: "24px" }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>

            {/* Projeto */}
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

            {/* Fornecedor */}
            <div>
              <label style={lbl}>Fornecedor / Empresa <span style={{ color: "#EF4444" }}>*</span></label>
              <input value={form.Fornecedor} onChange={e => set('Fornecedor', e.target.value)} style={inp} placeholder="Nome da empresa ou profissional" />
            </div>
            <div>
              <label style={lbl}>CNPJ / CPF</label>
              <input value={form.CNPJ_CPF} onChange={e => set('CNPJ_CPF', e.target.value)} style={inp} placeholder="00.000.000/0000-00" />
            </div>

            {/* Serviço */}
            <div style={{ gridColumn: "span 2" }}>
              <label style={lbl}>Descrição do Serviço <span style={{ color: "#EF4444" }}>*</span></label>
              <input value={form.Descricao_Servico} onChange={e => set('Descricao_Servico', e.target.value)} style={inp} placeholder="Ex: Projeto estrutural, Levantamento topográfico..." />
            </div>

            {/* Nr Contrato */}
            <div>
              <label style={lbl}>Número do Contrato</label>
              <input value={form.Nr_Contrato} onChange={e => set('Nr_Contrato', e.target.value)} style={inp} placeholder="Ex: CT-2026-001" />
            </div>

            {/* Status */}
            <div>
              <label style={lbl}>Status</label>
              <select value={form.Status} onChange={e => set('Status', e.target.value)} style={inp}>
                {WORKFLOW_STEPS.map(s => <option key={s}>{s}</option>)}
              </select>
            </div>

            {/* Valores */}
            <div>
              <label style={lbl}>Valor Estimado (R$)</label>
              <input value={form.Valor_Estimado} onChange={e => set('Valor_Estimado', e.target.value)} style={inp} placeholder="0,00" type="number" step="0.01" min="0" />
            </div>
            <div>
              <label style={lbl}>Valor Contratado (R$)</label>
              <input value={form.Valor_Contratado} onChange={e => set('Valor_Contratado', e.target.value)} style={inp} placeholder="0,00" type="number" step="0.01" min="0" />
            </div>

            {/* % calculado */}
            {percCalc && (
              <div style={{ gridColumn: "span 2", padding: "8px 12px", borderRadius: 8, background: parseFloat(percCalc) > 25 ? "#FEF2F2" : "#F0FDF4", border: `1px solid ${parseFloat(percCalc) > 25 ? "#FCA5A5" : "#86EFAC"}` }}>
                <span style={{ fontSize: 13, fontWeight: 700, color: parseFloat(percCalc) > 25 ? "#DC2626" : "#15803D" }}>
                  % do contrato do projeto: {percCalc}%
                  {parseFloat(percCalc) > 25 && " ⚠️ Acima do limite de 25%"}
                </span>
              </div>
            )}

            {/* Datas */}
            <div>
              <label style={lbl}>Data de Vencimento</label>
              <input type="date" value={form.Data_Vencimento} onChange={e => set('Data_Vencimento', e.target.value)} style={inp} />
            </div>
            <div>
              <label style={lbl}>Data de Pagamento</label>
              <input type="date" value={form.Data_Pagamento} onChange={e => set('Data_Pagamento', e.target.value)} style={inp} />
            </div>

            {/* NF */}
            <div style={{ gridColumn: "span 2" }}>
              <label style={lbl}>Número da NF</label>
              <input value={form.Nr_NF} onChange={e => set('Nr_NF', e.target.value)} style={inp} placeholder="Ex: NF-12345" />
            </div>

            {/* Link Contrato */}
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

            {/* Obs */}
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
