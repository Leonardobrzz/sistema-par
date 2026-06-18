import { useState, useEffect, useMemo } from 'react'
import { toast } from 'react-hot-toast'
import { DocumentArrowDownIcon, TableCellsIcon, ClipboardDocumentCheckIcon, ArrowTopRightOnSquareIcon, ExclamationTriangleIcon, PresentationChartLineIcon, FunnelIcon, XMarkIcon } from '@heroicons/react/24/outline'
import api from '../utils/api'
import { formatDateTime } from '../utils/formatters'

export default function Relatorios() {
  const [projetos, setProjetos] = useState([])
  const [projetoSel, setProjetoSel] = useState('')
  const [loadingProj, setLoadingProj] = useState(false)
  const [importLogs, setImportLogs] = useState([])
  const [loadingLogs, setLoadingLogs] = useState(false)
  const [activeTab, setActiveTab] = useState('exportar')
  const [auditData, setAuditData] = useState(null)
  const [loadingAudit, setLoadingAudit] = useState(false)
  const [auditError, setAuditError] = useState(null)

  // Auditoria filters/sort
  const [filtroCliente, setFiltroCliente] = useState('')
  const [filtroSetor, setFiltroSetor] = useState('')
  const [filtroStatus, setFiltroStatus] = useState('')
  const [ocultarConcluidas, setOcultarConcluidas] = useState(false)
  const [sortBy, setSortBy] = useState('nome')

  async function loadProjetos() {
    setLoadingProj(true)
    try {
      const res = await api.get('/projetos')
      setProjetos(res.data.projetos || [])
    } catch {
      toast.error('Erro ao carregar projetos')
    } finally {
      setLoadingProj(false)
    }
  }

  async function loadLogs() {
    setLoadingLogs(true)
    try {
      const res = await api.get('/opportune/logs')
      setImportLogs(res.data || [])
    } catch {
      toast.error('Erro ao carregar logs')
    } finally {
      setLoadingLogs(false)
    }
  }

  async function loadAudit() {
    setLoadingAudit(true)
    setAuditError(null)
    try {
      const res = await api.get('/relatorios/auditoria', { timeout: 60000 })
      setAuditData(res.data)
    } catch (err) {
      const msg = err.response?.data?.error || err.message || 'Erro ao carregar auditoria'
      setAuditError(msg)
      toast.error('Erro ao carregar auditoria: ' + msg)
    } finally {
      setLoadingAudit(false)
    }
  }

  useEffect(() => { loadProjetos() }, [])

  async function handleDownloadAuditExcel() {
    try {
      const res = await api.get('/relatorios/auditoria/excel', { responseType: 'blob' })
      const url = URL.createObjectURL(res.data)
      const a = document.createElement('a')
      a.href = url
      a.download = `Auditoria_${new Date().toLocaleDateString('pt-BR').replace(/\//g, '-')}.xlsx`
      a.click()
      URL.revokeObjectURL(url)
      toast.success('Excel de auditoria gerado!')
    } catch {
      toast.error('Erro ao gerar Excel')
    }
  }

  async function handleDownloadAuditPDF() {
    try {
      const res = await api.get('/relatorios/auditoria/pdf', { responseType: 'blob' })
      const url = URL.createObjectURL(res.data)
      const a = document.createElement('a')
      a.href = url
      a.download = `Auditoria_${new Date().toLocaleDateString('pt-BR').replace(/\//g, '-')}.pdf`
      a.click()
      URL.revokeObjectURL(url)
      toast.success('PDF de auditoria gerado!')
    } catch {
      toast.error('Erro ao gerar PDF')
    }
  }

  async function handleExportExcel() {
    if (!projetoSel) return toast.error('Selecione um projeto')
    try {
      const res = await api.get(`/relatorios/planejamento/${projetoSel}/excel`, { responseType: 'blob' })
      const url = URL.createObjectURL(res.data)
      const a = document.createElement('a')
      a.href = url
      a.download = `Planejamento_${projetoSel}.xlsx`
      a.click()
      URL.revokeObjectURL(url)
      toast.success('Excel exportado!')
    } catch {
      toast.error('Erro ao exportar Excel')
    }
  }

  async function handleExportPDF() {
    if (!projetoSel) return toast.error('Selecione um projeto')
    try {
      const res = await api.get(`/relatorios/planejamento/${projetoSel}/pdf`, { responseType: 'blob' })
      const url = URL.createObjectURL(res.data)
      const a = document.createElement('a')
      a.href = url
      a.download = `Planejamento_${projetoSel}.pdf`
      a.click()
      URL.revokeObjectURL(url)
      toast.success('PDF exportado!')
    } catch {
      toast.error('Erro ao exportar PDF')
    }
  }

  const projetosAudit = useMemo(() => {
    if (!auditData) return []
    let list = [...auditData.projetos]
    if (ocultarConcluidas) list = list.filter(p => p.Status !== 'Concluído')
    if (filtroCliente) list = list.filter(p => p.Cliente === filtroCliente)
    if (filtroSetor) list = list.filter(p => p.Setor === filtroSetor)
    if (filtroStatus) list = list.filter(p => p.Status === filtroStatus)
    if (sortBy === 'nome') list.sort((a, b) => (a.Nome || '').localeCompare(b.Nome || ''))
    else if (sortBy === 'data') list.sort((a, b) => new Date(a.Vencimento || 0) - new Date(b.Vencimento || 0))
    else if (sortBy === 'perc') list.sort((a, b) => b.Progresso - a.Progresso)
    return list
  }, [auditData, ocultarConcluidas, filtroCliente, filtroSetor, filtroStatus, sortBy])

  const TABS = [
    { id: 'exportar', label: 'Exportar Relatórios' },
    { id: 'auditoria', label: 'Auditoria de Projetos' },
    { id: 'logs', label: 'Histórico Opportune' },
  ]

  return (
    <div className="space-y-6 fade-in max-w-7xl mx-auto pb-10">
      {/* ── Header ── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <PresentationChartLineIcon className="w-5 h-5 text-par-500" />
            <h1 className="text-2xl font-black text-slate-900">Relatórios</h1>
          </div>
          <p className="text-sm text-slate-500">Exporte planejamentos, extraia auditorias e visualize logs</p>
        </div>
      </div>

      {/* ── Tabs ── */}
      <div className="flex gap-1 bg-white p-1 rounded-xl w-fit border border-slate-200 shadow-sm flex-wrap">
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => {
              setActiveTab(t.id)
              if (t.id === 'logs') loadLogs()
            }}
            className={`px-5 py-2.5 rounded-lg text-xs font-bold uppercase tracking-widest transition-all ${
              activeTab === t.id ? 'bg-par-500 text-white shadow-lg shadow-par-500/20' : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* ── Exportar ── */}
      {activeTab === 'exportar' && (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-8 max-w-xl slide-in-right">
          <div className="w-12 h-12 rounded-xl bg-par-500/10 flex items-center justify-center border border-par-500/20 mb-6">
            <DocumentArrowDownIcon className="w-6 h-6 text-par-600" />
          </div>
          <h2 className="text-lg font-bold text-slate-900 mb-2">Exportar Planejamento Financeiro</h2>
          <p className="text-xs font-medium text-slate-600 mb-6">Selecione o projeto para processar as informações financeiras em planilha ou PDF de apresentação.</p>

          <div className="space-y-6">
            <div className="w-full">
              <p className="form-label">Projeto Alvo</p>
              <select className="form-select w-full" value={projetoSel} onChange={(e) => setProjetoSel(e.target.value)}>
                <option value="">Selecione um projeto...</option>
                {projetos.map((p) => <option key={p.ID_Projeto} value={p.ID_Projeto}>{p.Nome}</option>)}
              </select>
            </div>
            <div className="flex flex-col sm:flex-row gap-3 pt-4 border-t border-slate-100">
              <button onClick={handleExportExcel} disabled={!projetoSel} className="btn-primary flex-1 flex items-center justify-center gap-2">
                <TableCellsIcon className="w-5 h-5" />
                Gerar Excel (Gestão)
              </button>
              <button onClick={handleExportPDF} disabled={!projetoSel} className="bg-white hover:bg-slate-50 text-par-600 font-bold py-2 px-6 rounded-xl border border-slate-200 flex-1 flex items-center justify-center gap-2 transition-all">
                <DocumentArrowDownIcon className="w-5 h-5" />
                Gerar PDF (Apres.)
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Auditoria ── */}
      {activeTab === 'auditoria' && (
        <div className="space-y-4 slide-in-right">
          {/* Header row */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <p style={{ fontSize: 13, fontWeight: 700, color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                {auditData ? `${projetosAudit.length} / ${auditData.projetos.length} Projetos` : 'Status do Portfólio'}
              </p>
              <p style={{ fontSize: 12, color: '#94A3B8', marginTop: 2 }}>
                {auditData ? `Atualizado às ${new Date(auditData.geradoEm).toLocaleTimeString('pt-BR')}` : 'Execute a auditoria para avaliar pendências dos projetos.'}
              </p>
            </div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <button onClick={loadAudit} disabled={loadingAudit} className="btn-secondary flex items-center gap-2">
                <ClipboardDocumentCheckIcon className="w-4 h-4" />
                {loadingAudit ? 'Processando...' : 'Rodar Auditoria'}
              </button>
              {auditData && <>
                <button onClick={handleDownloadAuditExcel} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '7px 14px', borderRadius: 10, border: '1.5px solid #BBF7D0', background: '#F0FDF4', color: '#15803D', fontWeight: 700, fontSize: 13, cursor: 'pointer' }}>
                  <TableCellsIcon className="w-4 h-4" />
                  Excel
                </button>
                <button onClick={handleDownloadAuditPDF} className="btn-primary flex items-center gap-2">
                  <DocumentArrowDownIcon className="w-4 h-4" />
                  PDF
                </button>
              </>}
            </div>
          </div>

          {loadingAudit ? (
            <div className="bg-white rounded-2xl border border-slate-200 py-24 text-center">
              <div className="w-12 h-12 rounded-full border-4 border-par-500/20 border-t-par-500 animate-spin mx-auto mb-4" />
              <p className="text-slate-900 font-bold tracking-widest uppercase mb-1">Processando Auditoria</p>
              <p className="text-xs text-slate-500">Analisando cronogramas, terceirizados e alertas globais...</p>
            </div>
          ) : auditError ? (
            <div style={{ background: '#FEF2F2', border: '1.5px solid #FECACA', borderRadius: 16, padding: 40, textAlign: 'center' }}>
              <ExclamationTriangleIcon className="w-12 h-12 mx-auto mb-3" style={{ color: '#DC2626' }} />
              <p style={{ fontSize: 16, fontWeight: 700, color: '#DC2626' }}>Falha na Análise</p>
              <p style={{ fontSize: 13, color: '#7F1D1D', marginTop: 6 }}>{auditError}</p>
              <button onClick={loadAudit} className="btn-secondary mt-6">Tentar novamente</button>
            </div>
          ) : auditData ? (
            <>
              {/* KPI cards */}
              {(() => {
                const total = auditData.projetos.length
                const inconformidades = auditData.projetos.filter(p => p.Auditoria === 'ERRO').length
                const pendencias = auditData.projetos.reduce((s, p) => s + (p.TercPendentes || 0), 0)
                const comTerc = auditData.projetos.filter(p => p.TercTotal > 0).length
                return (
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 12 }}>
                    {[
                      { label: 'Projetos', val: total, bg: '#EFF6FF', border: '#BFDBFE', color: '#1D4ED8' },
                      { label: 'Inconformidades', val: inconformidades, bg: '#FEF2F2', border: '#FECACA', color: '#DC2626' },
                      { label: 'Terc. Pendentes', val: pendencias, bg: '#FFFBEB', border: '#FDE68A', color: '#B45309' },
                      { label: 'Com Terceirizados', val: comTerc, bg: '#F0FDF4', border: '#BBF7D0', color: '#15803D' },
                    ].map(k => (
                      <div key={k.label} style={{ background: k.bg, border: `1.5px solid ${k.border}`, borderRadius: 14, padding: '14px 18px' }}>
                        <div style={{ fontSize: 26, fontWeight: 900, color: k.color }}>{k.val}</div>
                        <div style={{ fontSize: 11, fontWeight: 700, color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.06em', marginTop: 2 }}>{k.label}</div>
                      </div>
                    ))}
                  </div>
                )
              })()}

              {/* Filters */}
              <div style={{ background: '#F8FAFC', border: '1.5px solid #E2E8F0', borderRadius: 14, padding: '14px 18px', display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
                <FunnelIcon style={{ width: 16, height: 16, color: '#94A3B8', flexShrink: 0 }} />
                <select value={filtroCliente} onChange={e => setFiltroCliente(e.target.value)} style={{ padding: '6px 10px', borderRadius: 8, border: '1.5px solid #E2E8F0', fontSize: 12, fontFamily: 'inherit', background: '#fff', color: '#0F172A' }}>
                  <option value="">Todos os clientes</option>
                  {[...new Set(auditData.projetos.map(p => p.Cliente).filter(Boolean))].sort().map(c => <option key={c} value={c}>{c}</option>)}
                </select>
                <select value={filtroSetor} onChange={e => setFiltroSetor(e.target.value)} style={{ padding: '6px 10px', borderRadius: 8, border: '1.5px solid #E2E8F0', fontSize: 12, fontFamily: 'inherit', background: '#fff', color: '#0F172A' }}>
                  <option value="">Todos os setores</option>
                  {[...new Set(auditData.projetos.map(p => p.Setor).filter(Boolean))].sort().map(s => <option key={s} value={s}>{s}</option>)}
                </select>
                <select value={filtroStatus} onChange={e => setFiltroStatus(e.target.value)} style={{ padding: '6px 10px', borderRadius: 8, border: '1.5px solid #E2E8F0', fontSize: 12, fontFamily: 'inherit', background: '#fff', color: '#0F172A' }}>
                  <option value="">Todos os status</option>
                  {['Backlog', 'Em Andamento', 'Em Andamento (Atrasado)', 'Aguardando', 'Paralisado', 'Concluído', 'Arquivado'].map(s => <option key={s} value={s}>{s}</option>)}
                </select>
                <div style={{ display: 'flex', gap: 6 }}>
                  {[{ id: 'nome', label: 'A-Z' }, { id: 'data', label: 'Data' }, { id: 'perc', label: '%' }].map(s => (
                    <button key={s.id} onClick={() => setSortBy(s.id)} style={{ padding: '5px 12px', borderRadius: 8, border: '1.5px solid', borderColor: sortBy === s.id ? '#7C3AED' : '#E2E8F0', background: sortBy === s.id ? '#EDE9FE' : '#fff', color: sortBy === s.id ? '#7C3AED' : '#475569', fontWeight: 700, fontSize: 12, cursor: 'pointer' }}>
                      {s.label}
                    </button>
                  ))}
                </div>
                <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 700, color: '#475569', cursor: 'pointer', marginLeft: 'auto' }}>
                  <input type="checkbox" checked={ocultarConcluidas} onChange={e => setOcultarConcluidas(e.target.checked)} style={{ width: 15, height: 15 }} />
                  Ocultar Concluídas
                </label>
                {(filtroCliente || filtroSetor || filtroStatus) && (
                  <button onClick={() => { setFiltroCliente(''); setFiltroSetor(''); setFiltroStatus('') }} style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '5px 10px', borderRadius: 8, border: '1.5px solid #FECACA', background: '#FEF2F2', color: '#DC2626', fontWeight: 700, fontSize: 11, cursor: 'pointer' }}>
                    <XMarkIcon style={{ width: 13, height: 13 }} />
                    Limpar filtros
                  </button>
                )}
              </div>

              {/* Tabela de Auditoria */}
              <div style={{ background: '#fff', borderRadius: 16, border: '1.5px solid #E2E8F0', overflow: 'hidden' }}>
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', whiteSpace: 'nowrap' }}>
                    <thead>
                      <tr style={{ background: '#F8FAFC', borderBottom: '1px solid #E2E8F0' }}>
                        {['Cliente', 'Projeto', 'Setor', 'Status', 'Vencimento', 'Progresso', 'Terc.', 'Alertas', 'Audit.'].map(h => (
                          <th key={h} style={{ padding: '10px 14px', fontSize: 10, fontWeight: 800, color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '0.08em', textAlign: h === 'Progresso' || h === 'Terc.' || h === 'Alertas' || h === 'Audit.' ? 'center' : 'left' }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {projetosAudit.map((p, i) => {
                        const vencido = p.Auditoria === 'ERRO' && (p.Erros || []).some(e => e.includes('vencido'))
                        const barColor = p.Progresso >= 100 ? '#22C55E' : p.Progresso >= 50 ? '#3B82F6' : '#7C3AED'
                        const statusColor = p.Status === 'Concluído' ? { bg: '#DCFCE7', color: '#15803D' } : p.Status?.includes('Atrasado') ? { bg: '#FEE2E2', color: '#DC2626' } : p.Status === 'Paralisado' ? { bg: '#FEF3C7', color: '#B45309' } : { bg: '#EFF6FF', color: '#1D4ED8' }
                        return (
                          <tr key={p.ID_Projeto} style={{ borderTop: i > 0 ? '1px solid #F1F5F9' : 'none', background: p.Auditoria === 'ERRO' ? 'rgba(220,38,38,0.02)' : 'transparent' }}>
                            <td style={{ padding: '10px 14px', fontSize: 12, color: '#475569', fontWeight: 600 }}>{p.Cliente || '—'}</td>
                            <td style={{ padding: '10px 14px' }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                <span style={{ fontSize: 13, fontWeight: 700, color: '#0F172A' }}>{p.Nome}</span>
                                {p.Link_ClickUp && (
                                  <a href={p.Link_ClickUp} target="_blank" rel="noreferrer" style={{ color: '#94A3B8' }}>
                                    <ArrowTopRightOnSquareIcon style={{ width: 13, height: 13 }} />
                                  </a>
                                )}
                              </div>
                            </td>
                            <td style={{ padding: '10px 14px', fontSize: 11, color: '#7C3AED', fontWeight: 700 }}>{p.Setor || '—'}</td>
                            <td style={{ padding: '10px 14px', textAlign: 'center' }}>
                              <span style={{ fontSize: 11, fontWeight: 700, padding: '3px 9px', borderRadius: 6, background: statusColor.bg, color: statusColor.color }}>{p.Status || '—'}</span>
                            </td>
                            <td style={{ padding: '10px 14px', fontSize: 11, fontWeight: 700, color: vencido ? '#DC2626' : '#475569', textAlign: 'right' }}>
                              {p.Vencimento ? new Date(p.Vencimento).toLocaleDateString('pt-BR') : '—'}
                            </td>
                            <td style={{ padding: '10px 14px', textAlign: 'center' }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 6, justifyContent: 'center' }}>
                                <div style={{ width: 72, height: 6, background: '#E2E8F0', borderRadius: 4, overflow: 'hidden' }}>
                                  <div style={{ width: `${Math.min(p.Progresso, 100)}%`, height: '100%', background: barColor, borderRadius: 4 }} />
                                </div>
                                <span style={{ fontSize: 11, fontWeight: 800, color: '#475569', minWidth: 30 }}>{p.Progresso}%</span>
                              </div>
                            </td>
                            <td style={{ padding: '10px 14px', textAlign: 'center' }}>
                              <span style={{ fontSize: 12, fontWeight: 700, color: p.TercPendentes > 0 ? '#B45309' : '#94A3B8' }}>{p.TercPendentes}</span>
                              <span style={{ fontSize: 10, color: '#CBD5E1', fontWeight: 600 }}> / {p.TercTotal}</span>
                            </td>
                            <td style={{ padding: '10px 14px', textAlign: 'center' }}>
                              {p.AlertasAtivos > 0
                                ? <span style={{ fontSize: 11, fontWeight: 700, padding: '3px 8px', borderRadius: 6, background: '#FFFBEB', color: '#B45309' }}>{p.AlertasAtivos}</span>
                                : <span style={{ color: '#CBD5E1', fontSize: 11 }}>—</span>}
                            </td>
                            <td style={{ padding: '10px 14px', textAlign: 'center' }}>
                              <span style={{ fontSize: 11, fontWeight: 800, padding: '3px 10px', borderRadius: 6, background: p.Auditoria === 'ERRO' ? '#FEE2E2' : '#DCFCE7', color: p.Auditoria === 'ERRO' ? '#DC2626' : '#15803D' }}>
                                {p.Auditoria === 'ERRO' ? 'ERRO' : 'OK'}
                              </span>
                            </td>
                          </tr>
                        )
                      })}
                      {projetosAudit.length === 0 && (
                        <tr><td colSpan={9} style={{ padding: 40, textAlign: 'center', color: '#94A3B8', fontSize: 13 }}>Nenhum projeto encontrado para os filtros selecionados.</td></tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Inconformidades */}
              {projetosAudit.filter(p => p.Auditoria === 'ERRO').length > 0 && (
                <div style={{ background: '#FEF2F2', border: '1.5px solid #FECACA', borderRadius: 16, padding: 20 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
                    <ExclamationTriangleIcon style={{ width: 18, height: 18, color: '#DC2626' }} />
                    <span style={{ fontSize: 12, fontWeight: 800, color: '#DC2626', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                      Inconformidades — {projetosAudit.filter(p => p.Auditoria === 'ERRO').length} projeto{projetosAudit.filter(p => p.Auditoria === 'ERRO').length > 1 ? 's' : ''}
                    </span>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                    {projetosAudit.filter(p => p.Auditoria === 'ERRO').map(p => (
                      <div key={p.ID_Projeto} style={{ background: '#fff', borderRadius: 10, padding: '12px 16px', border: '1px solid #FECACA' }}>
                        <p style={{ fontSize: 12, fontWeight: 700, color: '#0F172A', marginBottom: 6 }}>
                          <span style={{ color: '#94A3B8' }}>{p.Cliente} / </span>{p.Nome}
                        </p>
                        <ul style={{ margin: 0, padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 4 }}>
                          {(p.Erros || []).map((e, i) => (
                            <li key={i} style={{ fontSize: 12, color: '#DC2626', fontWeight: 500, display: 'flex', alignItems: 'flex-start', gap: 6 }}>
                              <span style={{ marginTop: 2 }}>•</span>{e}
                            </li>
                          ))}
                        </ul>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          ) : (
            <div style={{ background: '#fff', borderRadius: 20, border: '1.5px solid #E2E8F0', padding: 80, textAlign: 'center' }}>
              <ClipboardDocumentCheckIcon style={{ width: 56, height: 56, color: '#CBD5E1', margin: '0 auto 16px' }} />
              <p style={{ fontSize: 15, fontWeight: 800, color: '#0F172A', marginBottom: 6 }}>Auditoria de Projetos</p>
              <p style={{ fontSize: 13, color: '#94A3B8' }}>Clique no botão para analisar a saúde do portfólio</p>
              <button onClick={loadAudit} className="btn-primary mt-8">Iniciar Análise</button>
            </div>
          )}
        </div>
      )}

      {/* ── Logs Opportune ── */}
      {activeTab === 'logs' && (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden slide-in-right">
          <div className="px-6 py-5 border-b border-slate-100 flex items-center justify-between">
            <h2 className="text-sm font-bold text-slate-900 uppercase tracking-widest">Importações ERP Opportune</h2>
            <button onClick={loadLogs} className="text-xs text-par-600 hover:text-par-700 font-bold">Atualizar</button>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left whitespace-nowrap">
              <thead>
                <tr>
                  <th className="table-header px-6">Data</th>
                  <th className="table-header px-6">Arquivo</th>
                  <th className="table-header px-6 text-center">Total</th>
                  <th className="table-header px-6 text-center text-emerald-400/70">Vinculados</th>
                  <th className="table-header px-6 text-center text-amber-400/70">Não Vinculados</th>
                  <th className="table-header px-6">Usuário</th>
                </tr>
              </thead>
              <tbody>
                {loadingLogs ? (
                  <tr><td colSpan={6} className="text-center py-10 text-slate-500 text-sm font-medium">Carregando histórico...</td></tr>
                ) : importLogs.length === 0 ? (
                  <tr><td colSpan={6} className="text-center py-16 text-slate-500 text-sm font-medium">Nenhuma importação registrada</td></tr>
                ) : (
                  importLogs.map((log, i) => (
                    <tr key={i} className="table-row">
                      <td className="px-6 py-4 text-xs font-semibold text-slate-500">{formatDateTime(log.Data_Importacao)}</td>
                      <td className="px-6 py-4 text-sm font-bold text-slate-800">{log.Nome_Arquivo}</td>
                      <td className="px-6 py-4 text-sm font-bold text-slate-800 text-center">{log.Total_Registros}</td>
                      <td className="px-6 py-4 text-sm font-bold text-emerald-600 text-center">{log.Total_Vinculados}</td>
                      <td className="px-6 py-4 text-sm font-bold text-amber-500 text-center">{log.Total_Nao_Vinculados > 0 ? log.Total_Nao_Vinculados : '-'}</td>
                      <td className="px-6 py-4 text-xs font-semibold text-slate-500">{log.Usuario_ID}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
