import React, { useEffect, useState, useCallback, useRef, useMemo } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { MagnifyingGlassIcon, PlusIcon, FunnelIcon, ArrowTopRightOnSquareIcon, SparklesIcon, FolderIcon, ChevronDownIcon, ChevronRightIcon } from '@heroicons/react/24/outline'
import { toast } from 'react-hot-toast'
import { useForm } from 'react-hook-form'
import api from '../utils/api'
import { statusBadgeClass, statusAccentColor, formatDate, formatBRL } from '../utils/formatters'
import LoadingSpinner from '../components/common/LoadingSpinner'
import Modal from '../components/common/Modal'
import Input from '../components/common/Input'
import { useAuth } from '../contexts/AuthContext'
import { useTheme } from '../contexts/ThemeContext'

const SETORES = ['ARQ', 'INF', 'SAN']
const STATUS_LIST = [
  'Backlog', 'Em Andamento', 'Em Andamento (Atrasado)', 'Paralisado', 'Concluído',
  'Em Análise', 'Arquivado', 'Aguardando Faturamento', 'Pendência'
]

function StatusMultiSelect({ value, onChange, options = STATUS_LIST }) {
  // Grupo "Em Andamento" cobre os dois subtipos
  const activeKey = value.includes('Em Andamento') && value.includes('Em Andamento (Atrasado)')
    ? 'Em Andamento'
    : value[0] || ''

  function handleClick(s) {
    if (s === 'Em Andamento') {
      onChange(['Em Andamento', 'Em Andamento (Atrasado)'])
    } else {
      onChange([s])
    }
  }

  return (
    <div className="flex flex-wrap gap-2">
      {options.filter(s => s !== 'Em Andamento (Atrasado)').map((s) => {
        const active = s === 'Em Andamento' ? activeKey === 'Em Andamento' : value.includes(s)
        return (
          <button
            key={s}
            type="button"
            onClick={() => handleClick(s)}
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
  const { isDark } = useTheme()
  const T = {
    card:    isDark ? '#1E293B' : '#ffffff',
    cardAlt: isDark ? '#162032' : '#F8FAFC',
    border:  isDark ? '#334155' : '#E2E8F0',
    text1:   isDark ? '#F1F5F9' : '#0F172A',
    text2:   isDark ? '#94A3B8' : '#64748B',
    text3:   isDark ? '#64748B' : '#94A3B8',
    inputBg: isDark ? '#0F172A' : '#F8FAFC',
    hover:   isDark ? '#243048' : '#F8FAFC',
  }

  const [searchParams] = useSearchParams()
  const [allProjects, setAllProjects] = useState([])
  const [loading, setLoading] = useState(true)
  const [showFilters, setShowFilters] = useState(false)
  const topScrollRef  = useRef(null)
  const bodyScrollRef = useRef(null)
  const [showNewModal, setShowNewModal] = useState(false)
  const [expandedId, setExpandedId] = useState(null)
  const [tarefasMap, setTarefasMap] = useState({})
  const [loadingTarefas, setLoadingTarefas] = useState({})
  const [popup, setPopup] = useState(null) // { tipo: 'alertas'|'auditoria', projeto: p, rect: DOMRect }
  const DEFAULT_STATUS = ['Em Andamento', 'Em Andamento (Atrasado)']
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
    if (searchParams.get('novo') === '1') setShowNewModal(true)
  }, [searchParams])

  const loadProjects = useCallback(async (statusSelecionado) => {
    setLoading(true)
    try {
      const incluirTodos = statusSelecionado?.some(s => s === 'Concluído' || s === 'Arquivado')
      const res = await api.get(incluirTodos ? '/projetos?incluirTodos=true' : '/projetos')
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
      if (filters.status.length > 0 && !filters.busca.trim()) {
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

  async function toggleExpand(p) {
    const id = p.ID_Projeto
    if (expandedId === id) { setExpandedId(null); return }
    setExpandedId(id)
    if (tarefasMap[id]) return
    setLoadingTarefas(prev => ({ ...prev, [id]: true }))
    try {
      const r = await api.get(`/projetos/${id}/tarefas`)
      setTarefasMap(prev => ({ ...prev, [id]: r.data }))
    } catch {
      setTarefasMap(prev => ({ ...prev, [id]: [] }))
    } finally {
      setLoadingTarefas(prev => ({ ...prev, [id]: false }))
    }
  }

  const fmtData = (s) => {
    if (!s) return '—'
    const m = String(s).match(/^(\d{4})-(\d{2})-(\d{2})/)
    return m ? `${m[3]}/${m[2]}/${m[1]}` : s
  }

  function abrirPopup(e, tipo, projeto) {
    e.stopPropagation()
    const rect = e.currentTarget.getBoundingClientRect()
    setPopup(prev => prev?.tipo === tipo && prev?.projeto?.ID_Projeto === projeto.ID_Projeto ? null : { tipo, projeto, rect })
  }

  return (
    <div className="space-y-5 fade-in" onClick={() => setPopup(null)}>
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
                style={{ paddingLeft: 40, background: T.inputBg, border: `1px solid ${T.border}`, width: '100%', color: T.text1 }}
                placeholder="Buscar por projeto, cliente ou número..."
                value={filters.busca}
                onChange={(e) => setFilters({ ...filters, busca: e.target.value })}
              />
            </div>
            <input
              className="form-input"
              style={{ width: 200, background: T.inputBg, border: `1px solid ${T.border}`, color: T.text1 }}
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
            {[
              { label: 'Backlog',                color: '#7C3AED', bg: '#EDE9FE' },
              { label: 'Em Andamento',           color: '#D97706', bg: '#FEF3C7' },
              { label: 'Em Análise',             color: '#0891B2', bg: '#CFFAFE' },
              { label: 'Paralisado',             color: '#DC2626', bg: '#FEE2E2' },
              { label: 'Concluído',              color: '#16A34A', bg: '#DCFCE7' },
              { label: 'Arquivado',              color: '#475569', bg: '#E2E8F0' },
              { label: 'Aguardando Faturamento', color: '#1D4ED8', bg: '#DBEAFE' },
              { label: 'Pendência',              color: '#BE185D', bg: '#FCE7F3' },
            ].map(({ label, color, bg }) => {
              const emAndamentoAtivo = filters.status.includes('Em Andamento') && filters.status.includes('Em Andamento (Atrasado)')
              const active = label === 'Em Andamento' ? emAndamentoAtivo : (filters.status.length === 1 && filters.status[0] === label)
              return (
                <button key={label} onClick={() => {
                  const novoStatus = label === 'Em Andamento'
                    ? ['Em Andamento', 'Em Andamento (Atrasado)']
                    : [label]
                  setFilters(f => ({ ...f, status: novoStatus }))
                  loadProjects(novoStatus)
                }}
                  style={{ padding: '4px 12px', borderRadius: 8, border: '2px solid', fontSize: 12, fontWeight: 700, cursor: 'pointer', transition: 'all 0.15s',
                    borderColor: color,
                    background: active ? bg : `${bg}55`,
                    color: color,
                    opacity: active ? 1 : 0.75,
                    boxShadow: active ? `0 0 0 2px ${color}33` : 'none',
                  }}>
                  {label}
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
        <div style={{ background: T.card, border: `1px solid ${T.border}`, borderRadius: 16, overflow: 'hidden' }}>

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
                  <th style={{ paddingLeft: 20, paddingRight: 12, paddingTop: 10, paddingBottom: 10, fontSize: 11, fontWeight: 700, color: T.text3, textTransform: 'uppercase', letterSpacing: '0.06em', background: T.cardAlt, borderBottom: `1px solid ${T.border}`, width: '28%' }}>Projeto</th>
                  <th style={{ padding: '10px 12px', fontSize: 11, fontWeight: 700, color: T.text3, textTransform: 'uppercase', letterSpacing: '0.06em', background: T.cardAlt, borderBottom: `1px solid ${T.border}`, width: '16%' }}>Cliente</th>
                  <th style={{ padding: '10px 12px', fontSize: 11, fontWeight: 700, color: T.text3, textTransform: 'uppercase', letterSpacing: '0.06em', background: T.cardAlt, borderBottom: `1px solid ${T.border}`, width: '9%' }}>Setor</th>
                  <th style={{ padding: '10px 12px', fontSize: 11, fontWeight: 700, color: T.text3, textTransform: 'uppercase', letterSpacing: '0.06em', background: T.cardAlt, borderBottom: `1px solid ${T.border}`, width: '10%', textAlign: 'right' }}>Valor</th>
                  <th style={{ padding: '10px 12px', fontSize: 11, fontWeight: 700, color: T.text3, textTransform: 'uppercase', letterSpacing: '0.06em', background: T.cardAlt, borderBottom: `1px solid ${T.border}`, width: '9%' }}>Entrega</th>
                  <th style={{ padding: '10px 12px', fontSize: 11, fontWeight: 700, color: T.text3, textTransform: 'uppercase', letterSpacing: '0.06em', background: T.cardAlt, borderBottom: `1px solid ${T.border}`, width: '10%' }}>Progresso</th>
                  <th style={{ padding: '10px 12px', fontSize: 11, fontWeight: 700, color: T.text3, textTransform: 'uppercase', letterSpacing: '0.06em', background: T.cardAlt, borderBottom: `1px solid ${T.border}`, width: '7%', textAlign: 'center' }}>Alertas</th>
                  <th style={{ padding: '10px 12px', fontSize: 11, fontWeight: 700, color: T.text3, textTransform: 'uppercase', letterSpacing: '0.06em', background: T.cardAlt, borderBottom: `1px solid ${T.border}`, width: '7%', textAlign: 'center' }}>Auditoria</th>
                  <th style={{ padding: '10px 12px', fontSize: 11, fontWeight: 700, color: T.text3, textTransform: 'uppercase', letterSpacing: '0.06em', background: T.cardAlt, borderBottom: `1px solid ${T.border}`, width: '4%', textAlign: 'center' }} />
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
                    const accentColor = statusAccentColor(p.Status)
                    const isExpanded = expandedId === p.ID_Projeto
                    const tarefas = tarefasMap[p.ID_Projeto] || []
                    const loadingT = loadingTarefas[p.ID_Projeto]
                    return (
                      <React.Fragment key={p.ID_Projeto}>
                      <tr
                        style={{ borderBottom: isExpanded ? 'none' : `1px solid ${T.border}`, background: isExpanded ? (isDark ? '#1A2540' : '#F0F4FF') : T.card, transition: 'background 0.12s', cursor: 'pointer' }}
                        onClick={() => toggleExpand(p)}
                        onMouseEnter={e => { if (!isExpanded) e.currentTarget.style.background = T.hover }}
                        onMouseLeave={e => { if (!isExpanded) e.currentTarget.style.background = T.card }}
                      >
                        <td style={{ paddingLeft: 16, paddingRight: 12, paddingTop: 11, paddingBottom: 11 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            {isExpanded
                              ? <ChevronDownIcon style={{ width: 13, height: 13, color: '#7C3AED', flexShrink: 0 }} />
                              : <ChevronRightIcon style={{ width: 13, height: 13, color: T.text3, flexShrink: 0 }} />}
                            <div style={{ width: 3, height: 28, borderRadius: 4, background: accentColor, flexShrink: 0 }} />
                            <div style={{ minWidth: 0 }}>
                              <p style={{ fontWeight: 700, fontSize: 12.5, color: T.text1, margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                {p.Nome}
                              </p>
                              {p.Nr_Contrato && (
                                <p style={{ fontSize: 10.5, color: T.text3, margin: '2px 0 0', fontWeight: 500 }}>
                                  {`#${String(p.Nr_Contrato).padStart(4,'0')}`}
                                </p>
                              )}
                            </div>
                          </div>
                        </td>
                        <td style={{ padding: '11px 12px', fontSize: 12.5, color: T.text2, fontWeight: 500, maxWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {p.Cliente || '—'}
                        </td>
                        <td style={{ padding: '11px 12px', fontSize: 11.5, color: T.text3, fontWeight: 500, whiteSpace: 'nowrap' }}>
                          {p.Setor || '—'}
                        </td>
                        <td style={{ padding: '11px 12px', fontSize: 12.5, fontWeight: 700, color: T.text1, textAlign: 'right', whiteSpace: 'nowrap' }}>
                          {formatBRL(p.Valor_Global)}
                        </td>
                        <td style={{ padding: '11px 12px', fontSize: 11.5, color: T.text2, fontWeight: 500, whiteSpace: 'nowrap' }}>
                          {formatDate(p.Data_Entrega_Contrato) || '—'}
                        </td>
                        <td style={{ padding: '11px 14px', minWidth: 90 }}>
                          {(() => {
                            const perc = Math.min(parseFloat(p.Progresso_Perc || 0), 100)
                            const cor = perc >= 100 ? '#16A34A' : perc >= 60 ? '#2563EB' : perc >= 30 ? '#D97706' : '#94A3B8'
                            return (
                              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                <div style={{ flex: 1, height: 5, background: T.border, borderRadius: 4, overflow: 'hidden' }}>
                                  <div style={{ width: `${perc}%`, height: '100%', background: cor, borderRadius: 4, transition: 'width 0.3s' }} />
                                </div>
                                <span style={{ fontSize: 11, fontWeight: 700, color: cor, minWidth: 30 }}>{perc}%</span>
                              </div>
                            )
                          })()}
                        </td>
                        <td style={{ padding: '11px 12px', textAlign: 'center' }} onClick={e => e.stopPropagation()}>
                          {p.totalAlertas > 0
                            ? <span onClick={e => abrirPopup(e, 'alertas', p)} style={{ display: 'inline-block', background: '#FEF3C7', color: '#92400E', fontWeight: 800, fontSize: 11.5, padding: '2px 9px', borderRadius: 20, border: '1.5px solid #FDE68A', cursor: 'pointer' }}>{p.totalAlertas}</span>
                            : <span style={{ color: T.text3, fontSize: 12 }}>—</span>}
                        </td>
                        <td style={{ padding: '11px 12px', textAlign: 'center' }} onClick={e => e.stopPropagation()}>
                          {p.statusAuditoria === 'ERRO'
                            ? <span onClick={e => abrirPopup(e, 'auditoria', p)} style={{ display: 'inline-block', background: '#FEE2E2', color: '#DC2626', fontWeight: 800, fontSize: 11, padding: '2px 9px', borderRadius: 20, border: '1.5px solid #FECACA', cursor: 'pointer' }}>ERRO</span>
                            : <span style={{ display: 'inline-block', background: '#DCFCE7', color: '#15803D', fontWeight: 800, fontSize: 11, padding: '2px 9px', borderRadius: 20, border: '1.5px solid #86EFAC' }}>OK</span>}
                        </td>
                        <td style={{ padding: '11px 8px', textAlign: 'center' }} onClick={(e) => e.stopPropagation()}>
                          <div style={{ display: 'flex', gap: 4, justifyContent: 'center' }}>
                            {p.Link_ClickUp && (
                              <a href={p.Link_ClickUp} target="_blank" rel="noreferrer" title="Abrir no ClickUp"
                                style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 28, height: 28, borderRadius: 7, background: '#EDE9FE', color: '#7C3AED', border: '1px solid #DDD6FE', transition: 'all 0.15s' }}
                              >
                                <ArrowTopRightOnSquareIcon style={{ width: 13, height: 13 }} />
                              </a>
                            )}
                            <button
                              onClick={(e) => { e.stopPropagation(); navigate(`/planejamento/${p.ID_Projeto}`) }}
                              title="Ir para Planejamento Financeiro"
                              style={{
                                background: '#EDE9FE', border: '1px solid #DDD6FE', color: '#7C3AED',
                                padding: '4px 10px', borderRadius: 7, fontSize: 11, fontWeight: 700,
                                cursor: 'pointer', fontFamily: 'inherit', transition: 'all 0.15s', whiteSpace: 'nowrap',
                              }}
                            >
                              Planej.
                            </button>
                          </div>
                        </td>
                      </tr>
                      {isExpanded && (
                        <tr style={{ borderBottom: `1px solid ${T.border}` }}>
                          <td colSpan={9} style={{ padding: 0, background: isDark ? '#111827' : '#F8FAFC' }}>
                            {loadingT ? (
                              <div style={{ padding: '16px 20px', color: T.text2, fontSize: 12 }}>Carregando tarefas...</div>
                            ) : tarefas.length === 0 ? (
                              <div style={{ padding: '16px 20px', color: T.text3, fontSize: 12 }}>Nenhuma tarefa encontrada no ClickUp.</div>
                            ) : (
                              <div style={{ overflowX: 'auto' }}>
                                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                                  <thead>
                                    <tr style={{ background: isDark ? '#1E293B' : '#EEF2FF' }}>
                                      {['Tarefa', 'Resp.', 'Status', 'Etiquetas', 'Vencimento', 'Link'].map(h => (
                                        <th key={h} style={{ padding: '7px 14px', textAlign: 'left', fontSize: 10, fontWeight: 700, color: '#7C3AED', textTransform: 'uppercase', letterSpacing: '0.06em', whiteSpace: 'nowrap' }}>{h}</th>
                                      ))}
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {tarefas.map((t, i) => {
                                      const stColor = t.status === 'EM ANDAMENTO' ? { bg: '#FEF3C7', color: '#92400E' }
                                        : t.status === 'CONCLUÍDO' ? { bg: '#DCFCE7', color: '#15803D' }
                                        : t.status === 'ARQUIVADO' ? { bg: '#E2E8F0', color: '#475569' }
                                        : { bg: '#EDE9FE', color: '#7C3AED' }
                                      return (
                                        <tr key={t.id} style={{ borderTop: `1px solid ${T.border}`, background: i % 2 === 0 ? 'transparent' : (isDark ? '#0F172A22' : '#F1F5F933') }}>
                                          <td style={{ padding: '8px 14px', fontWeight: 600, color: T.text1, maxWidth: 280, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.nome}</td>
                                          <td style={{ padding: '8px 14px', color: T.text2, whiteSpace: 'nowrap' }}>{t.responsaveis.join(', ') || '—'}</td>
                                          <td style={{ padding: '8px 14px', whiteSpace: 'nowrap' }}>
                                            <span style={{ background: stColor.bg, color: stColor.color, fontWeight: 700, fontSize: 10, padding: '2px 8px', borderRadius: 12 }}>{t.status || '—'}</span>
                                          </td>
                                          <td style={{ padding: '8px 14px', maxWidth: 200 }}>
                                            <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                                              {t.etiquetas.length > 0 ? t.etiquetas.map(e => (
                                                <span key={e} style={{ background: '#CFFAFE', color: '#0E7490', fontSize: 10, fontWeight: 600, padding: '1px 7px', borderRadius: 10 }}>{e}</span>
                                              )) : <span style={{ color: T.text3 }}>—</span>}
                                            </div>
                                          </td>
                                          <td style={{ padding: '8px 14px', whiteSpace: 'nowrap', color: t.vencido ? '#DC2626' : T.text2, fontWeight: t.vencido ? 700 : 400 }}>{fmtData(t.vencimento)}</td>
                                          <td style={{ padding: '8px 14px' }}>
                                            {t.url ? <a href={t.url} target="_blank" rel="noreferrer" style={{ color: '#7C3AED', fontWeight: 600, fontSize: 11 }}>Abrir</a> : '—'}
                                          </td>
                                        </tr>
                                      )
                                    })}
                                  </tbody>
                                </table>
                                <div style={{ padding: '8px 14px', display: 'flex', justifyContent: 'flex-end' }}>
                                  <button
                                    onClick={(e) => { e.stopPropagation(); navigate(`/planejamento/${p.ID_Projeto}`) }}
                                    style={{ background: '#7C3AED', color: '#fff', border: 'none', padding: '6px 16px', borderRadius: 8, fontSize: 12, fontWeight: 700, cursor: 'pointer' }}
                                  >
                                    Ir para Planejamento Financeiro →
                                  </button>
                                </div>
                              </div>
                            )}
                          </td>
                        </tr>
                      )}
                      </React.Fragment>
                    )
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── Popup Alertas / Auditoria ── */}
      {popup && (() => {
        const { tipo, projeto, rect } = popup
        const itens = tipo === 'auditoria'
          ? (projeto.errosAuditoriaLista || []).map(msg => ({ mensagem: msg, nivel: 'error', link: '' }))
          : (projeto.alertasDetalhes || [])
        const top = rect.bottom + window.scrollY + 6
        const left = Math.min(rect.left + window.scrollX, window.innerWidth - 320)
        return (
          <div onClick={e => e.stopPropagation()} style={{
            position: 'absolute', top, left, zIndex: 9999, width: 300,
            background: isDark ? '#1E293B' : '#fff',
            border: `1.5px solid ${isDark ? '#334155' : '#E2E8F0'}`,
            borderRadius: 10, boxShadow: '0 8px 32px rgba(0,0,0,0.18)', overflow: 'hidden'
          }}>
            <div style={{ padding: '10px 14px', borderBottom: `1px solid ${isDark ? '#334155' : '#E2E8F0'}`, fontWeight: 700, fontSize: 12, color: tipo === 'auditoria' ? '#DC2626' : '#92400E', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span>{tipo === 'auditoria' ? 'Erros de Auditoria' : 'Alertas Ativos'}</span>
              <button onClick={() => setPopup(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: isDark ? '#94A3B8' : '#64748B', fontSize: 16, lineHeight: 1 }}>×</button>
            </div>
            {itens.length === 0 ? (
              <div style={{ padding: '12px 14px', fontSize: 12, color: isDark ? '#94A3B8' : '#64748B' }}>Nenhum item encontrado.</div>
            ) : (
              <ul style={{ margin: 0, padding: '8px 0', listStyle: 'none' }}>
                {itens.map((it, i) => (
                  <li key={i} style={{ padding: '7px 14px', display: 'flex', gap: 8, alignItems: 'flex-start', borderTop: i > 0 ? `1px solid ${isDark ? '#1E293B' : '#F1F5F9'}` : 'none' }}>
                    <span style={{ fontSize: 13, marginTop: 1 }}>{it.nivel === 'error' ? '🔴' : '🟡'}</span>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 12, color: isDark ? '#E2E8F0' : '#1E293B', fontWeight: 500 }}>{it.mensagem}</div>
                      {it.link && <a href={it.link} target="_blank" rel="noreferrer" style={{ fontSize: 11, color: '#7C3AED', textDecoration: 'underline' }}>Ver no ClickUp</a>}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )
      })()}

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
