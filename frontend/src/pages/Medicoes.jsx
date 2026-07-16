import { useEffect, useState, useCallback, useMemo } from 'react'
import { useForm } from 'react-hook-form'
import { toast } from 'react-hot-toast'
import { PlusIcon, ArrowPathIcon, ChartBarIcon, SparklesIcon, LinkIcon } from '@heroicons/react/24/outline'
import api from '../utils/api'
import { formatDate, formatBRL } from '../utils/formatters'
import LoadingSpinner from '../components/common/LoadingSpinner'
import Modal from '../components/common/Modal'
import Input from '../components/common/Input'

const STATUS_MEDICAO = ['Prevista', 'Em Andamento', 'Concluída', 'Cancelada']

const inp = { padding: "9px 12px", borderRadius: 8, border: "1.5px solid #E2E8F0", background: "#F8FAFC", color: "#0F172A", fontSize: 13, fontFamily: "inherit", outline: "none", width: "100%", boxSizing: "border-box" }
const lbl = { fontSize: 12, fontWeight: 700, color: "#475569", display: "block", marginBottom: 5 }

function statusFinBadge(s) {
  if (s === 'Recebido')  return { bg: '#DCFCE7', color: '#15803D' }
  if (s === 'Faturado' || s === 'NF Emitida') return { bg: '#DBEAFE', color: '#1D4ED8' }
  if (s === 'Atrasado')  return { bg: '#FEE2E2', color: '#DC2626' }
  return { bg: '#F1F5F9', color: '#64748B' }
}

const SETORES_PAR = ['Arquitetura', 'Saneamento', 'Infraestrutura', 'Administrativo']

export default function Medicoes() {
  const [medicoes, setMedicoes] = useState([])
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [editItem, setEditItem] = useState(null)
  const [projetos, setProjetos] = useState([])
  const [filtroSetor, setFiltroSetor] = useState('')
  const [filtroFaturamento, setFiltroFaturamento] = useState('') // '' | 'faturadas' | 'nao_faturadas'
  const [filtroProjeto, setFiltroProjeto] = useState('')
  const [filtroBusca, setFiltroBusca] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [medRes, projRes, planRes] = await Promise.all([
        api.get('/medicoes'),
        api.get('/projetos'),
        api.get('/planejamentos'),
      ])
      const tabela = medRes.data.medicoes || medRes.data || []
      const projs = projRes.data.projetos || []
      const projMap = Object.fromEntries(projs.map(p => [p.ID_Projeto, p]))
      const idsNaTabela = new Set(tabela.map(m => m.ID_Projeto))

      const parseBRval = v => { if (!v) return 0; const s = String(v).replace(/\./g, '').replace(',', '.'); return parseFloat(s) || 0 }

      const doPlanejamento = []
      const planos = planRes.data.planejamentos || planRes.data || []
      planos.filter(p => p.Status === 'Aprovado').forEach(plan => {
        if (idsNaTabela.has(plan.ID_Projeto)) return
        const proj = projMap[plan.ID_Projeto] || {}
        try {
          const dados = JSON.parse(plan.Dados_JSON || '{}')
          const meds = dados.medicoes || dados._baseline?.medicoesCronograma || []
          meds.forEach((m, idx) => {
            doPlanejamento.push({
              ID_Medicao: `plan_${plan.ID_Projeto}_${idx}`,
              ID_Projeto: plan.ID_Projeto,
              nomeProjeto: proj.Nome || plan.ID_Projeto,
              cliente: proj.Cliente || proj.Nome_Cliente || '',
              setor: proj.Setor || '',
              Data_Previsao: m.dataPrevisao || m.dataPrevista || '',
              Valor: parseBRval(m.valor || m.valorPlanejado || 0),
              Descricao: m.descricao || m.etapa || `Medição ${idx + 1}`,
              Status_Financeiro: 'Pendente',
              _doPlanejamento: true,
            })
          })
        } catch {}
      })

      setMedicoes([...tabela, ...doPlanejamento])
      setProjetos(projs)
    } catch {
      toast.error('Erro ao carregar medições')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  const projetoMap = useMemo(() => Object.fromEntries(projetos.map(p => [p.ID_Projeto, p])), [projetos])

  const medicoesFiltradas = useMemo(() => medicoes.filter(m => {
    const setor = m.setor || projetoMap[m.ID_Projeto]?.Setor || ''
    if (filtroSetor && !setor.toLowerCase().includes(filtroSetor.toLowerCase())) return false
    if (filtroProjeto && m.ID_Projeto !== filtroProjeto) return false
    if (filtroFaturamento === 'faturadas' && !m.Nr_NF) return false
    if (filtroFaturamento === 'nao_faturadas' && m.Nr_NF) return false
    if (filtroBusca) {
      const b = filtroBusca.toLowerCase()
      if (!(m.nomeProjeto || '').toLowerCase().includes(b) &&
          !(m.Descricao || m.Etapa || '').toLowerCase().includes(b) &&
          !(m.cliente || '').toLowerCase().includes(b) &&
          !(m.Nr_NF || '').toLowerCase().includes(b)) return false
    }
    return true
  }), [medicoes, filtroSetor, filtroFaturamento, filtroProjeto, filtroBusca, projetoMap])

  return (
    <div style={{ padding: "28px 32px" }}>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 20 }}>
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 4 }}>
            <ChartBarIcon style={{ width: 22, height: 22, color: "#00B5CC" }} />
            <h1 style={{ margin: 0, fontSize: 22, fontWeight: 800, color: "#0F172A" }}>Medições & Faturamento</h1>
          </div>
          <p style={{ margin: 0, fontSize: 13, color: "#64748B" }}>{medicoesFiltradas.length} de {medicoes.length} registros</p>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button onClick={load} style={{ padding: "9px 16px", borderRadius: 8, border: "1.5px solid #E2E8F0", background: "#fff", color: "#475569", fontWeight: 700, fontSize: 13, cursor: "pointer", display: "flex", alignItems: "center", gap: 6 }}>
            <ArrowPathIcon style={{ width: 15, height: 15 }} /> Atualizar
          </button>
          <button onClick={() => { setEditItem(null); setShowModal(true) }} style={{ padding: "9px 16px", borderRadius: 8, border: "none", background: "#00B5CC", color: "#fff", fontWeight: 700, fontSize: 13, cursor: "pointer", display: "flex", alignItems: "center", gap: 6 }}>
            <PlusIcon style={{ width: 15, height: 15 }} /> Nova Medição
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
        {/* Filtro Faturadas/Não Faturadas */}
        <div style={{ display: "flex", borderRadius: 8, border: "1.5px solid #E2E8F0", overflow: "hidden" }}>
          {[
            { v: '', l: 'Todas' },
            { v: 'faturadas', l: 'Faturadas' },
            { v: 'nao_faturadas', l: 'Não Faturadas' },
          ].map(opt => (
            <button key={opt.v} onClick={() => setFiltroFaturamento(opt.v)}
              style={{ padding: "9px 14px", border: "none", background: filtroFaturamento === opt.v ? "#00B5CC" : "#fff", color: filtroFaturamento === opt.v ? "#fff" : "#475569", fontWeight: 700, fontSize: 12, cursor: "pointer", transition: "background 0.15s" }}>
              {opt.l}
            </button>
          ))}
        </div>
        <select value={filtroProjeto} onChange={e => setFiltroProjeto(e.target.value)}
          style={{ ...inp, width: "auto", paddingRight: 32 }}>
          <option value="">Projeto: Todos</option>
          {projetos.filter(p => !filtroSetor || (p.Setor || '').toLowerCase().includes(filtroSetor.toLowerCase())).map(p => (
            <option key={p.ID_Projeto} value={p.ID_Projeto}>{p.Nome}</option>
          ))}
        </select>
        <input value={filtroBusca} onChange={e => setFiltroBusca(e.target.value)} placeholder="Buscar projeto, cliente, NF..."
          style={{ ...inp, width: 240 }} />
        {(filtroSetor || filtroFaturamento || filtroProjeto || filtroBusca) && (
          <button onClick={() => { setFiltroSetor(''); setFiltroFaturamento(''); setFiltroProjeto(''); setFiltroBusca('') }}
            style={{ padding: "9px 14px", borderRadius: 8, border: "1.5px solid #FEE2E2", background: "#FFF5F5", color: "#DC2626", fontWeight: 700, fontSize: 12, cursor: "pointer" }}>
            Limpar
          </button>
        )}
      </div>

      {/* Tabela */}
      {loading ? (
        <div style={{ background: "#fff", borderRadius: 12, border: "1px solid #E2E8F0", padding: 60, textAlign: "center" }}>
          <LoadingSpinner text="Buscando medições..." />
        </div>
      ) : (
        <div style={{ background: "#fff", borderRadius: 12, border: "1px solid #E2E8F0", overflow: "hidden" }}>
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", whiteSpace: "nowrap" }}>
              <thead>
                <tr style={{ background: "#F8FAFC" }}>
                  {[
                    { h: "Setor", align: "center" },
                    { h: "Projeto / Cliente", align: "left" },
                    { h: "Data Medição", align: "center" },
                    { h: "Nº Medição", align: "center" },
                    { h: "Nº OS Interna", align: "center" },
                    { h: "Valor Total", align: "right" },
                    { h: "Valor Recebido", align: "right" },
                    { h: "Nº NF", align: "center" },
                    { h: "Link", align: "center" },
                    { h: "Situação", align: "center" },
                    { h: "Ações", align: "right" },
                  ].map(col => (
                    <th key={col.h} style={{ padding: "12px 14px", fontSize: 11, fontWeight: 700, color: "#64748B", textAlign: col.align, letterSpacing: 0.5, textTransform: "uppercase", borderBottom: "1px solid #E2E8F0" }}>
                      {col.h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {medicoesFiltradas.length === 0 ? (
                  <tr>
                    <td colSpan={11} style={{ textAlign: "center", padding: 48, color: "#64748B", fontSize: 13 }}>
                      <ChartBarIcon style={{ width: 36, height: 36, margin: "0 auto 10px", opacity: 0.3 }} />
                      <div>Nenhuma medição encontrada</div>
                    </td>
                  </tr>
                ) : medicoesFiltradas.map(m => {
                  const proj = projetoMap[m.ID_Projeto] || {}
                  const setor = m.setor || proj.Setor || ''
                  const setorSigla = setor.startsWith('Arq') ? 'ARQ' : setor.startsWith('San') ? 'SAN' : setor.startsWith('Inf') ? 'INF' : setor.startsWith('Adm') ? 'ADM' : setor.slice(0, 3).toUpperCase() || '—'
                  const setorColor = setor.startsWith('Arq') ? { bg: '#F0F9FF', color: '#0369A1' } : setor.startsWith('San') ? { bg: '#F0FDF4', color: '#15803D' } : setor.startsWith('Inf') ? { bg: '#FEF3C7', color: '#B45309' } : { bg: '#F5F3FF', color: '#7C3AED' }
                  const finSt = statusFinBadge(m.Status_Financeiro)
                  const valorTotal = parseFloat(m.Valor_Medicao || m.Valor || 0)
                  const valorRecebido = m.Status_Financeiro === 'Recebido' ? valorTotal : 0
                  const nrMedicao = m.Nr_Medicao || m.Etapa || m.Descricao || '—'
                  const nrOSInterna = m.Nr_OS_OPP || m.OC || ''
                  const dataMedicao = m.Data_Realizacao || m.Data_Prevista || m.Data_Previsao || ''
                  const linkProduto = m.Link_Produto || m.Link_Contrato || ''
                  return (
                    <tr key={m.ID_Medicao} style={{ borderBottom: "1px solid #F1F5F9", transition: "background 0.12s" }}
                      onMouseEnter={e => e.currentTarget.style.background = "#F8FAFC"}
                      onMouseLeave={e => e.currentTarget.style.background = ""}>
                      <td style={{ padding: "11px 14px", textAlign: "center" }}>
                        <span style={{ display: "inline-block", padding: "2px 8px", borderRadius: 20, fontSize: 10, fontWeight: 800, background: setorColor.bg, color: setorColor.color }}>
                          {setorSigla}
                        </span>
                      </td>
                      <td style={{ padding: "11px 14px" }}>
                        <div style={{ fontWeight: 700, fontSize: 13, color: "#0F172A", maxWidth: 220, overflow: "hidden", textOverflow: "ellipsis" }} title={m.nomeProjeto}>
                          {m.nomeProjeto || m.ID_Projeto || '—'}
                        </div>
                        <div style={{ fontSize: 11, color: "#64748B", marginTop: 2 }}>
                          {m.cliente || proj.Cliente || <span style={{ color: "#CBD5E1" }}>—</span>}
                        </div>
                      </td>
                      <td style={{ padding: "11px 14px", textAlign: "center", fontSize: 12, color: "#475569" }}>
                        {dataMedicao ? formatDate(dataMedicao) : <span style={{ color: "#CBD5E1" }}>—</span>}
                      </td>
                      <td style={{ padding: "11px 14px", textAlign: "center" }}>
                        <span style={{ fontSize: 12, fontWeight: 700, color: "#7C3AED" }}>
                          {m.Nr_Medicao || <span style={{ color: "#CBD5E1", fontWeight: 400 }}>—</span>}
                        </span>
                      </td>
                      <td style={{ padding: "11px 14px", textAlign: "center" }}>
                        {nrOSInterna ? (
                          <span style={{ fontSize: 12, fontWeight: 700, color: "#DC2626", background: "#FEF2F2", padding: "2px 8px", borderRadius: 20 }}>
                            {nrOSInterna}
                          </span>
                        ) : <span style={{ color: "#CBD5E1" }}>—</span>}
                      </td>
                      <td style={{ padding: "11px 14px", textAlign: "right", fontSize: 13, fontWeight: 700, color: valorTotal > 0 ? "#0F172A" : "#CBD5E1" }}>
                        {valorTotal > 0 ? formatBRL(valorTotal) : '—'}
                      </td>
                      <td style={{ padding: "11px 14px", textAlign: "right", fontSize: 13, fontWeight: 700, color: valorRecebido > 0 ? "#15803D" : "#CBD5E1" }}>
                        {valorRecebido > 0 ? formatBRL(valorRecebido) : '—'}
                      </td>
                      <td style={{ padding: "11px 14px", textAlign: "center" }}>
                        {m.Nr_NF ? (
                          <span style={{ fontSize: 12, fontWeight: 700, color: "#1D4ED8" }}>{m.Nr_NF}</span>
                        ) : <span style={{ color: "#CBD5E1" }}>—</span>}
                      </td>
                      <td style={{ padding: "11px 14px", textAlign: "center" }}>
                        {linkProduto ? (
                          <a href={linkProduto} target="_blank" rel="noopener noreferrer" style={{ color: "#7C3AED", display: "inline-flex", alignItems: "center" }}>
                            <LinkIcon style={{ width: 15, height: 15 }} />
                          </a>
                        ) : <span style={{ color: "#E2E8F0" }}>—</span>}
                      </td>
                      <td style={{ padding: "11px 14px", textAlign: "center" }}>
                        <span style={{ display: "inline-block", padding: "3px 10px", borderRadius: 20, fontSize: 11, fontWeight: 700, background: finSt.bg, color: finSt.color }}>
                          {m.Status_Financeiro || 'Pendente'}
                        </span>
                      </td>
                      <td style={{ padding: "11px 14px", textAlign: "right" }}>
                        <button onClick={() => { setEditItem(m); setShowModal(true) }}
                          style={{ fontSize: 11, color: "#00788A", fontWeight: 700, background: "none", border: "none", cursor: "pointer" }}>
                          EDITAR
                        </button>
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
        <MedicaoModal item={editItem} projetos={projetos} onClose={() => setShowModal(false)} onSaved={load} />
      )}
    </div>
  )
}

function MedicaoModal({ item, projetos, onClose, onSaved }) {
  const [loading, setLoading] = useState(false)
  const { register, handleSubmit, formState: { errors } } = useForm({
    defaultValues: item
      ? { ...item, Descricao: item.Descricao || item.Etapa || '' }
      : {}
  })

  async function onSubmit(data) {
    setLoading(true)
    try {
      if (item?.ID_Medicao) {
        await api.put(`/medicoes/${item.ID_Medicao}`, data)
        toast.success('Medição atualizada!')
      } else {
        await api.post('/medicoes', {
          idProjeto: data.ID_Projeto,
          etapa: data.Descricao,
          percentual: data.Percentual,
          valor: data.Valor_Medicao,
          dataPrevisao: data.Data_Prevista,
          ...data,
        })
        toast.success('Medição criada!')
      }
      onSaved()
      onClose()
    } catch (err) {
      toast.error(err.response?.data?.error || 'Erro ao salvar')
    } finally {
      setLoading(false)
    }
  }

  return (
    <Modal open title={item ? 'Editar Medição' : 'Nova Medição'} onClose={onClose} maxWidth="max-w-2xl">
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-5 p-1">
        <div className="grid grid-cols-2 gap-4">
          <div className="col-span-2">
            <label className="form-label">Projeto <span className="text-red-500">*</span></label>
            <select className="form-select" {...register('ID_Projeto', { required: 'Obrigatório' })}>
              <option value="">Selecione...</option>
              {projetos.map((p) => <option key={p.ID_Projeto} value={p.ID_Projeto}>{p.Nome}</option>)}
            </select>
          </div>
          <Input label="Descrição / Etapa" required error={errors.Descricao?.message} className="col-span-2" {...register('Descricao', { required: 'Obrigatório' })} />
          <Input label="Nº da Medição" placeholder="Ex: 1, 2ª Parcela..." {...register('Nr_Medicao')} />
          <Input label="Nº OS Interna (OPP)" placeholder="Ex: 42-1" {...register('Nr_OS_OPP')} />
          <Input label="% do Contrato" type="number" step="0.01" min="0" max="100" {...register('Percentual')} />
          <Input label="Valor Total (R$)" type="text" placeholder="0,00" {...register('Valor_Medicao')} />
          <Input label="Data da Medição" type="date" {...register('Data_Realizacao')} />
          <Input label="Data Prevista" type="date" {...register('Data_Prevista')} />
          <Input label="Previsão de NF" type="date" {...register('Previsao_NF')} />
          <Input label="Data de Emissão da NF" type="date" {...register('Data_Emissao_NF')} />
          <Input label="Número da NF" {...register('Nr_NF')} />
          <Input label="Data de Recebimento" type="date" {...register('Data_Recebimento')} />
          <Input label="O.C. (Ordem de Compra OPP)" placeholder="Código da O.C. no OPP" {...register('OC')} />
          <div className="col-span-2">
            <label className="form-label">Link do Produto / Documento</label>
            <input className="form-input" placeholder="Cole o link aqui (Google Drive, etc.)" {...register('Link_Produto')} />
          </div>
          <div>
            <label className="form-label">Status Financeiro</label>
            <select className="form-select" {...register('Status_Financeiro')}>
              {['Pendente', 'Faturado', 'Recebido', 'Atrasado'].map(s => <option key={s}>{s}</option>)}
            </select>
          </div>
          <div>
            <label className="form-label">Status Operacional</label>
            <select className="form-select" {...register('Status')}>
              {STATUS_MEDICAO.map(s => <option key={s}>{s}</option>)}
            </select>
          </div>
          <div className="col-span-2">
            <label className="form-label">Observações</label>
            <textarea className="form-input h-20 resize-none" {...register('Observacoes')} />
          </div>
        </div>
        <div className="flex justify-end gap-3 pt-4 border-t border-white/5 mt-6">
          <button type="button" onClick={onClose} className="btn-secondary">Cancelar</button>
          <button type="submit" disabled={loading} className="btn-primary flex items-center gap-2">
            {loading ? <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> : <SparklesIcon className="w-4 h-4" />}
            {loading ? 'Salvando...' : 'Salvar Medição'}
          </button>
        </div>
      </form>
    </Modal>
  )
}
