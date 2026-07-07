import { useEffect, useState, useCallback, useRef, useMemo } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { MagnifyingGlassIcon, PlusIcon, FunnelIcon, ArrowTopRightOnSquareIcon, SparklesIcon, FolderIcon } from '@heroicons/react/24/outline'
import { toast } from 'react-hot-toast'
import { useForm } from 'react-hook-form'
import api from '../utils/api'
import { statusBadgeClass, statusAccentColor, formatDate, formatBRL } from '../utils/formatters'
import LoadingSpinner from '../components/common/LoadingSpinner'
import Modal from '../components/common/Modal'
import Input from '../components/common/Input'
import { useAuth } from '../contexts/AuthContext'

const SETORES = ['ARQ', 'INF', 'SAN']
const STATUS_LIST = [
  'A Planejar', 'Em Andamento', 'Paralisado', 'Aguardando Aprovação',
  'Aguardando Cliente', 'Concluído', 'Arquivado', 'Atrasado'
]

function StatusMultiSelect({ value, onChange, options = STATUS_LIST }) {
  return (
    <div className="flex flex-wrap gap-2">
      {options.map((s) => {
        const active = value.includes(s)
        return (
          <button
            key={s}
            type="button"
            onClick={() => onChange(active ? value.filter((v) => v !== s) : [...value, s])}
            className={`px-3 py-1.5 rounded-xl text-xs font-semibold border transition-all duration-200 ${
              active 
                ? 'bg-par-500 text-white border-par-500 ring-1 ring-par-500/30' 
                : 'bg-white text-slate-600 border-slate-200 hover:border-slate-300 hover:text-slate-900'
            }`}
          >
            {s}
          </button>
        )
      })}
    </div>
  )
}

export default function GestaoProjetos() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const [allProjects, setAllProjects] = useState([])
  const [loading, setLoading] = useState(true)
  const [showFilters, setShowFilters] = useState(false)
  const topScrollRef  = useRef(null)
  const bodyScrollRef = useRef(null)
  const [showNewModal, setShowNewModal] = useState(false)
  const DEFAULT_STATUS = ['Backlog', 'Em Andamento']
  const [filters, setFilters] = useState({
    busca: searchParams.get('busca') || '',
    setor: '',
    cliente: '',
    status: DEFAULT_STATUS,
    margemDias: '',
    verTarefas: false,
  })

  useEffect(() => {
    const idProjeto = searchParams.get('id')
    if (idProjeto) setFilters(prev => ({ ...prev, busca: idProjeto }))
  }, [searchParams])

  const loadProjects = useCallback(async () => {
    setLoading(true)
    try {
      const res = await api.get('/projetos')
      setAllProjects(res.data.projetos || [])
    } catch {
      toast.error('Erro ao carregar projetos')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { loadProjects() }, [loadProjects])

  // Status extraído dos dados reais; agrupa "Em Andamento (Atrasado)" dentro de "Em Andamento"
  const statusReais = useMemo(() => {
    const todos = [...new Set(allProjects.map(p => (p.Status || '').trim()).filter(Boolean))]
    return todos
      .filter(s => s !== 'Em Andamento (Atrasado)')
      .sort()
  }, [allProjects])

  // Filtragem 100% no frontend
  const projects = useMemo(() => {
    return allProjects.filter(p => {
      if (filters.setor && !(p.Nome || '').toUpperCase().startsWith(filters.setor)) return false
      if (filters.status.length > 0) {
        const ps = (p.Status || '').trim()
        const match = filters.status.some(s => {
          if (s === 'Em Andamento') return ps === 'Em Andamento' || ps === 'Em Andamento (Atrasado)'
          return ps.toLowerCase() === s.toLowerCase()
        })
        if (!match) return false
      }
      if (filters.cliente) {
        const q = filters.cliente.toLowerCase()
        if (!(p.Cliente || '').toLowerCase().includes(q)) return false
      }
      if (filters.busca) {
        const q = filters.busca.toLowerCase().trim()
        if (!((p.Nome || '').toLowerCase().includes(q) ||
              (p.Cliente || '').toLowerCase().includes(q) ||
              (p.Centro_Custo_OPP || '').toLowerCase().includes(q) ||
              String(p.Nr_Contrato || '').includes(q))) return false
      }
      if (filters.margemDias) {
        const dias = parseInt(filters.margemDias)
        const entrega = p.Data_Entrega_Contrato ? new Date(p.Data_Entrega_Contrato) : null
        if (!entrega) return false
        const diff = Math.floor((new Date() - entrega) / 86400000)
        if (diff < dias) return false
      }
      return true
    })
  }, [allProjects, filters])

  return (
    <div className="space-y-5 fade-in">
      {/* ── Header ── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <FolderIcon className="w-5 h-5 text-par-400" />
            <h1 className="page-title">Planejamento Físico</h1>
          </div>
          <p className="text-sm text-slate-500">
            {loading ? 'Carregando' : projects.length} projetos encontrados no sistema
          </p>
        </div>
        <div className="flex gap-2">
          <button 
            onClick={() => setShowFilters(!showFilters)} 
            className={`btn-secondary flex items-center gap-2 ${showFilters ? 'ring-2 ring-slate-200 bg-slate-50' : ''}`}
          >
            <FunnelIcon className="w-4 h-4" />
            Filtros {filters.status.length > 0 && <span className="w-2 h-2 rounded-full bg-par-500 pulse-dot ml-1" />}
          </button>
        </div>
      </div>

      {/* ── Filtros ── */}
      {showFilters && (
        <div className="card-glass p-5 grid grid-cols-1 md:grid-cols-4 gap-4 slide-in-right origin-top rounded-2xl">
          <div className="relative">
            <MagnifyingGlassIcon className="absolute left-3 top-2.5 w-5 h-5 text-slate-400 pointer-events-none" />
            <input
              className="form-input pl-10 w-full"
              placeholder="Buscar projeto..."
              value={filters.busca}
              onChange={(e) => setFilters({ ...filters, busca: e.target.value })}
            />
          </div>
          <div>
            <input
              className="form-input w-full"
              placeholder="Nome do cliente"
              value={filters.cliente}
              onChange={(e) => setFilters({ ...filters, cliente: e.target.value })}
            />
          </div>
          <div>
            <select className="form-select w-full" value={filters.setor} onChange={(e) => setFilters({ ...filters, setor: e.target.value })}>
              <option value="">Todos</option>
              <option value="ARQ">ARQ — Arquitetura</option>
              <option value="INF">INF — Infraestrutura</option>
              <option value="SAN">SAN — Saneamento</option>
            </select>
          </div>
          <div className="md:col-span-4 mt-2">
            <p className="form-label mb-2">Filtrar por Status</p>
            <StatusMultiSelect
              value={filters.status}
              onChange={(v) => setFilters({ ...filters, status: v })}
              options={statusReais}
            />
          </div>
          <div className="md:col-span-4 mt-2 flex flex-col sm:flex-row sm:items-center justify-between border-t border-slate-100 pt-4 gap-4">
            <label className="flex items-center gap-3 text-sm text-slate-600 font-medium cursor-pointer group">
              <div className={`w-5 h-5 rounded border flex items-center justify-center transition-all ${filters.verTarefas ? 'bg-par-500 border-par-500' : 'bg-white border-slate-300 group-hover:border-par-500'}`}>
                {filters.verTarefas && <svg className="w-3.5 h-3.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" /></svg>}
              </div>
              <input
                type="checkbox"
                className="hidden"
                checked={filters.verTarefas}
                onChange={(e) => setFilters({ ...filters, verTarefas: e.target.checked })}
              />
              Mostrar links das tarefas do ClickUp
            </label>
            <button 
              onClick={() => setFilters({ busca: '', setor: '', cliente: '', status: DEFAULT_STATUS, margemDias: '', verTarefas: false })} 
              className="text-xs text-par-500 hover:text-par-600 font-bold transition-colors uppercase tracking-widest"
            >
              Limpar Filtros
            </button>
          </div>
        </div>
      )}

      {/* ── Busca + Setor sempre visíveis ── */}
      {!showFilters && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {/* Barra de busca */}
          <div style={{ display: 'flex', gap: 8 }}>
            <div style={{ position: 'relative', flex: 1 }}>
              <MagnifyingGlassIcon style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', width: 16, height: 16, color: '#94A3B8', pointerEvents: 'none' }} />
              <input
                className="form-input"
                style={{ paddingLeft: 40, background: '#F8FAFC', border: '1px solid #E2E8F0', width: '100%' }}
                placeholder="Buscar por projeto, cliente ou número..."
                value={filters.busca}
                onChange={(e) => setFilters({ ...filters, busca: e.target.value })}
              />
            </div>
            <input
              className="form-input"
              style={{ width: 200, background: '#F8FAFC', border: '1px solid #E2E8F0' }}
              placeholder="Nome do cliente"
              value={filters.cliente}
              onChange={(e) => setFilters({ ...filters, cliente: e.target.value })}
            />
          </div>

          {/* Chips de setor + status */}
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
            <span style={{ fontSize: 11, fontWeight: 700, color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '0.06em', marginRight: 2 }}>Setor:</span>
            {['', ...SETORES].map((s) => {
              const active = filters.setor === s
              return (
                <button key={s || 'todos'} onClick={() => setFilters({ ...filters, setor: s })}
                  style={{ padding: '4px 12px', borderRadius: 8, border: '1.5px solid', fontSize: 12, fontWeight: 700, cursor: 'pointer', transition: 'all 0.15s',
                    borderColor: active ? '#7C3AED' : '#E2E8F0',
                    background: active ? '#EDE9FE' : '#fff',
                    color: active ? '#7C3AED' : '#64748B',
                  }}>
                  {s || 'Todos'}
                </button>
              )
            })}
            <span style={{ fontSize: 11, fontWeight: 700, color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '0.06em', marginLeft: 8, marginRight: 2 }}>Status:</span>
            {statusReais.map((s) => {
              const active = filters.status.includes(s)
              return (
                <button key={s} onClick={() => setFilters({ ...filters, status: active ? filters.status.filter(v => v !== s) : [...filters.status, s] })}
                  style={{ padding: '4px 12px', borderRadius: 8, border: '1.5px solid', fontSize: 12, fontWeight: 700, cursor: 'pointer', transition: 'all 0.15s',
                    borderColor: active ? '#4338CA' : '#E2E8F0',
                    background: active ? '#EEF2FF' : '#fff',
                    color: active ? '#4338CA' : '#64748B',
                  }}>
                  {s}
                </button>
              )
            })}
            {(filters.setor || filters.status.length > 0 || filters.busca || filters.cliente || filters.margemDias) && (
              <button onClick={() => setFilters({ busca: '', setor: '', cliente: '', status: DEFAULT_STATUS, margemDias: '', verTarefas: false })}
                style={{ padding: '4px 12px', borderRadius: 8, border: '1.5px solid #FECACA', background: '#FEF2F2', color: '#DC2626', fontSize: 12, fontWeight: 700, cursor: 'pointer', marginLeft: 4 }}>
                Limpar
              </button>
            )}
            <span style={{ marginLeft: 'auto', fontSize: 12, fontWeight: 600, color: '#94A3B8' }}>
              {loading ? '...' : `${projects.length} de ${allProjects.length} projeto${allProjects.length !== 1 ? 's' : ''}`}
            </span>
          </div>
        </div>
      )}

      {/* ── Tabela ── */}
      {loading ? (
        <div className="card py-20">
          <LoadingSpinner text="Buscando projetos..." />
        </div>
      ) : (
        <div className="card overflow-hidden">

          {/* Scrollbar espelhado no topo */}
          <div
            ref={topScrollRef}
            style={{ overflowX: 'auto', overflowY: 'hidden', height: 10 }}
            onScroll={e => { if (bodyScrollRef.current) bodyScrollRef.current.scrollLeft = e.currentTarget.scrollLeft }}
          >
            <div style={{ height: 1, minWidth: 700 }} />
          </div>

          <div
            ref={bodyScrollRef}
            style={{ overflowX: 'auto' }}
            onScroll={e => { if (topScrollRef.current) topScrollRef.current.scrollLeft = e.currentTarget.scrollLeft }}
          >
            <table style={{ width: '100%', textAlign: 'left', borderCollapse: 'collapse', minWidth: 700 }}>
              <thead>
                <tr>
                  <th className="table-header" style={{ paddingLeft: 20, width: '28%' }}>Projeto</th>
                  <th className="table-header" style={{ width: '18%' }}>Cliente</th>
                  <th className="table-header" style={{ width: '11%' }}>Setor</th>
                  <th className="table-header" style={{ width: '13%' }}>Status</th>
                  <th className="table-header" style={{ width: '11%', textAlign: 'right' }}>Valor</th>
                  <th className="table-header" style={{ width: '10%' }}>Entrega</th>
                  <th className="table-header" style={{ width: '6%', textAlign: 'center' }}>3ºs</th>
                  {filters.verTarefas && <th className="table-header" style={{ width: '5%', textAlign: 'center' }}>ClickUp</th>}
                  <th className="table-header" style={{ width: '7%' }} />
                </tr>
              </thead>
              <tbody>
                {projects.length === 0 ? (
                  <tr>
                    <td colSpan={9} style={{ textAlign: 'center', padding: '64px 16px' }}>
                      <FolderIcon style={{ width: 40, height: 40, color: '#CBD5E1', margin: '0 auto 10px', display: 'block' }} />
                      <p style={{ fontSize: 13, color: '#94A3B8' }}>Nenhum projeto encontrado com os filtros aplicados</p>
                    </td>
                  </tr>
                ) : (
                  projects.map((p) => {
                    const perc = parseFloat(p.percTerceiros || 0)
                    const accentColor = statusAccentColor(p.Status)
                    return (
                      <tr
                        key={p.ID_Projeto}
                        className="table-row group cursor-pointer"
                        onClick={() => navigate(`/planejamento/${p.ID_Projeto}`)}
                      >
                        <td style={{ paddingLeft: 16, paddingRight: 12, paddingTop: 11, paddingBottom: 11 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                            <div style={{ width: 3, height: 28, borderRadius: 4, background: accentColor, flexShrink: 0 }} />
                            <div style={{ minWidth: 0 }}>
                              <p style={{ fontWeight: 700, fontSize: 12.5, color: '#0F172A', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                                className="group-hover:text-par-600 transition-colors">
                                {p.Nome}
                              </p>
                              {p.Nr_Contrato && (
                                <p style={{ fontSize: 10.5, color: '#94A3B8', margin: '2px 0 0', fontWeight: 500 }}>
                                  {`#${String(p.Nr_Contrato).padStart(4,'0')}`}
                                </p>
                              )}
                            </div>
                          </div>
                        </td>
                        <td style={{ padding: '11px 12px', fontSize: 12.5, color: '#374151', fontWeight: 500, maxWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {p.Cliente || '—'}
                        </td>
                        <td style={{ padding: '11px 12px', fontSize: 11.5, color: '#94A3B8', fontWeight: 500, whiteSpace: 'nowrap' }}>
                          {p.Setor || '—'}
                        </td>
                        <td style={{ padding: '11px 12px', whiteSpace: 'nowrap' }}>
                          <span className={statusBadgeClass(p.Status)}>{p.Status || 'A Planejar'}</span>
                        </td>
                        <td style={{ padding: '11px 12px', fontSize: 12.5, fontWeight: 700, color: '#0F172A', textAlign: 'right', whiteSpace: 'nowrap' }}>
                          {formatBRL(p.Valor_Global)}
                        </td>
                        <td style={{ padding: '11px 12px', fontSize: 11.5, color: '#374151', fontWeight: 500, whiteSpace: 'nowrap' }}>
                          {formatDate(p.Data_Entrega_Contrato) || '—'}
                        </td>
                        <td style={{ padding: '11px 12px', textAlign: 'center', whiteSpace: 'nowrap' }}>
                          <span style={{ fontSize: 12, fontWeight: 700, color: perc > 20 ? '#DC2626' : perc > 15 ? '#D97706' : '#374151' }}>
                            {perc.toFixed(1)}%
                          </span>
                        </td>
                        {filters.verTarefas && (
                          <td style={{ padding: '11px 12px', textAlign: 'center' }} onClick={(e) => e.stopPropagation()}>
                            {p.Link_ClickUp ? (
                              <a href={p.Link_ClickUp} target="_blank" rel="noreferrer"
                                style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 26, height: 26, borderRadius: 7, color: '#94A3B8', transition: 'all 0.15s' }}
                                onMouseEnter={e => { e.currentTarget.style.color = '#1E3A5F'; e.currentTarget.style.background = '#EDF2F7' }}
                                onMouseLeave={e => { e.currentTarget.style.color = '#94A3B8'; e.currentTarget.style.background = 'transparent' }}
                              >
                                <ArrowTopRightOnSquareIcon style={{ width: 13, height: 13 }} />
                              </a>
                            ) : <span style={{ color: '#CBD5E1' }}>—</span>}
                          </td>
                        )}
                        <td style={{ padding: '11px 12px', textAlign: 'right' }}>
                          <button
                            onClick={(e) => { e.stopPropagation(); navigate(`/planejamento/${p.ID_Projeto}`) }}
                            style={{
                              background: '#fff', border: '1px solid #E2E8F0', color: '#475569',
                              padding: '4px 12px', borderRadius: 7, fontSize: 11.5, fontWeight: 600,
                              cursor: 'pointer', fontFamily: 'inherit', transition: 'all 0.15s', whiteSpace: 'nowrap',
                            }}
                            onMouseEnter={e => { e.currentTarget.style.borderColor = '#1E3A5F'; e.currentTarget.style.color = '#1E3A5F' }}
                            onMouseLeave={e => { e.currentTarget.style.borderColor = '#E2E8F0'; e.currentTarget.style.color = '#475569' }}
                          >
                            Abrir
                          </button>
                        </td>
                      </tr>
                    )
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── Modal novo projeto ── */}
      {showNewModal && (
        <NewProjectModal onClose={() => setShowNewModal(false)} onSaved={loadProjects} />
      )}
    </div>
  )
}

function NewProjectModal({ onClose, onSaved }) {
  const [loading, setLoading] = useState(false)
  const { register, handleSubmit, formState: { errors } } = useForm()

  async function onSubmit(data) {
    setLoading(true)
    try {
      const payload = {
        nome: data.Nome,
        cliente: data.Cliente,
        setor: data.Setor,
        valorGlobal: data.Valor_Global,
        dataEntregaContrato: data.Data_Entrega_Contrato,
        nrContrato: data.Nr_Contrato,
        linkClickUp: data.Link_ClickUp
      }
      await api.post('/projetos', payload)
      toast.success('Projeto criado com sucesso!')
      onSaved()
      onClose()
    } catch (err) {
      toast.error(err.response?.data?.error || 'Erro ao criar projeto')
    } finally {
      setLoading(false)
    }
  }

  return (
    <Modal open title="Novo Projeto" onClose={onClose} maxWidth="max-w-2xl">
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-5 p-1">
        <div className="grid grid-cols-2 gap-5">
          <Input
            label="Nome do Projeto"
            required
            placeholder="Ex: Edifício Comercial Centro"
            error={errors.Nome?.message}
            className="col-span-2"
            {...register('Nome', { required: 'Obrigatório' })}
          />
          <Input
            label="Cliente"
            required
            placeholder="Nome do cliente"
            error={errors.Cliente?.message}
            {...register('Cliente', { required: 'Obrigatório' })}
          />
          <div>
            <label className="form-label">Setor <span className="text-red-500">*</span></label>
            <select className="form-select" {...register('Setor', { required: true })}>
              <option value="">Selecione...</option>
              <option value="ARQ">ARQ — Arquitetura</option>
              <option value="INF">INF — Infraestrutura</option>
              <option value="SAN">SAN — Saneamento</option>
            </select>
          </div>
          <Input
            label="Valor do Contrato (R$)"
            required
            type="text"
            placeholder="0,00"
            error={errors.Valor_Global?.message}
            {...register('Valor_Global', { required: 'Obrigatório' })}
          />
          <Input
            label="Data de Entrega (Previsão)"
            type="date"
            {...register('Data_Entrega_Contrato')}
          />
          <Input
            label="Número do Contrato"
            placeholder="Ex: JBP-2026-001"
            {...register('Nr_Contrato')}
          />
          <Input
            label="Link ClickUp"
            placeholder="https://app.clickup.com/..."
            {...register('Link_ClickUp')}
          />
        </div>

        <div className="flex justify-end gap-3 pt-4 border-t border-white/5 mt-6">
          <button type="button" onClick={onClose} className="btn-secondary">Cancelar</button>
          <button type="submit" disabled={loading} className="btn-primary flex items-center gap-2">
            {loading ? <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> : <SparklesIcon className="w-4 h-4" />}
            {loading ? 'Salvando...' : 'Criar Projeto'}
          </button>
        </div>
      </form>
    </Modal>
  )
}
