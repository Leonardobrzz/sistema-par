import { useEffect, useState } from 'react'
import { ArrowTopRightOnSquareIcon } from '@heroicons/react/24/outline'
import { Activity } from 'lucide-react'
import api from '../utils/api'

const COR_SETOR = {
  'Arquitetura':    { bg: '#EEF2FF', border: '#C7D2FE', title: '#4338CA', bar: '#6366F1' },
  'Saneamento':     { bg: '#F0FDFA', border: '#99F6E4', title: '#0F766E', bar: '#14B8A6' },
  'Engenharia':     { bg: '#FFFBEB', border: '#FDE68A', title: '#B45309', bar: '#F59E0B' },
  'Comercial':      { bg: '#FDF4FF', border: '#E9D5FF', title: '#7E22CE', bar: '#A855F7' },
  'Infraestrutura': { bg: '#F0FDF4', border: '#BBF7D0', title: '#15803D', bar: '#22C55E' },
  'Contratos':      { bg: '#EFF6FF', border: '#BFDBFE', title: '#1D4ED8', bar: '#3B82F6' },
}
const COR_PADRAO = { bg: '#F8FAFC', border: '#E2E8F0', title: '#475569', bar: '#94A3B8' }

const STATUS_ATRASADO = ['Em Andamento (Atrasado)', 'Atrasado']

function BarraProgresso({ perc, cor, atrasado }) {
  return (
    <div style={{ height: 6, background: '#E2E8F0', borderRadius: 4, overflow: 'hidden', marginTop: 6 }}>
      <div style={{
        height: '100%',
        width: `${Math.min(perc, 100)}%`,
        background: atrasado ? '#EF4444' : cor,
        borderRadius: 4,
        transition: 'width 0.4s ease',
      }} />
    </div>
  )
}

export default function ProjetosClickUp() {
  const [projetos, setProjetos] = useState([])
  const [loading, setLoading] = useState(true)
  const [setorAberto, setSetorAberto] = useState(null)

  useEffect(() => {
    api.get('/projetos')
      .then(r => {
        const lista = r.data?.projetos || r.data || []
        // Apenas projetos em andamento com ID ClickUp
        const ativos = lista.filter(p =>
          p.ID_ClickUp &&
          p.Status &&
          !['Concluído', 'Cancelado', 'A Planejar'].includes(p.Status)
        )
        setProjetos(ativos)
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  if (loading) return <div style={{ color: '#94A3B8', fontSize: 13, padding: 16 }}>Carregando projetos...</div>
  if (projetos.length === 0) return null

  const SETORES_VISIVEIS = ['Arquitetura', 'Infraestrutura', 'Saneamento']

  function getSetor(p) {
    if (p.Setor && p.Setor !== 'Outros') return p.Setor
    const n = (p.Nome || '').toUpperCase()
    if (n.startsWith('ARQ')) return 'Arquitetura'
    if (n.startsWith('SAN')) return 'Saneamento'
    if (n.startsWith('INF')) return 'Infraestrutura'
    return ''
  }

  // Agrupa por setor — apenas ARQ, INF e SAN
  const grupos = {}
  for (const p of projetos) {
    const setor = getSetor(p)
    if (!SETORES_VISIVEIS.includes(setor)) continue
    if (!grupos[setor]) grupos[setor] = []
    grupos[setor].push(p)
  }

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
        <Activity size={16} color="#64748B" />
        <span style={{ fontSize: 12, fontWeight: 700, color: '#64748B', letterSpacing: '0.1em', textTransform: 'uppercase' }}>
          Projetos em Andamento — ClickUp
        </span>
        <span style={{ fontSize: 11, fontWeight: 600, color: '#94A3B8', marginLeft: 4 }}>({projetos.length} projetos)</span>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {Object.entries(grupos).map(([setor, lista]) => {
          const cor = COR_SETOR[setor] || COR_PADRAO
          const aberto = setorAberto === setor
          const mediaProgresso = Math.round(lista.reduce((s, p) => s + parseInt(p.Progresso_Perc || 0), 0) / lista.length)
          const atrasados = lista.filter(p => STATUS_ATRASADO.includes(p.Status)).length

          return (
            <div key={setor} style={{ background: cor.bg, border: `1.5px solid ${cor.border}`, borderRadius: 14, overflow: 'hidden' }}>
              {/* Cabeçalho do setor */}
              <div
                onClick={() => setSetorAberto(setorAberto === setor ? null : setor)}
                style={{ padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 12, cursor: 'pointer' }}
              >
                <div style={{ flex: 1 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <span style={{ fontSize: 12, fontWeight: 800, color: cor.title, textTransform: 'uppercase', letterSpacing: '0.06em' }}>{setor}</span>
                    <span style={{ fontSize: 11, color: '#94A3B8' }}>{lista.length} projeto{lista.length > 1 ? 's' : ''}</span>
                    {atrasados > 0 && (
                      <span style={{ fontSize: 11, fontWeight: 700, color: '#DC2626', background: '#FEE2E2', padding: '2px 8px', borderRadius: 6 }}>
                        {atrasados} atrasado{atrasados > 1 ? 's' : ''}
                      </span>
                    )}
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 4 }}>
                    <BarraProgresso perc={mediaProgresso} cor={cor.bar} atrasado={atrasados > 0} />
                    <span style={{ fontSize: 11, fontWeight: 700, color: cor.title, whiteSpace: 'nowrap' }}>{mediaProgresso}% médio</span>
                  </div>
                </div>
                <span style={{ fontSize: 16, color: cor.title, fontWeight: 700 }}>{setorAberto === setor ? '▲' : '▼'}</span>
              </div>

              {/* Lista de projetos do setor */}
              {setorAberto === setor && (
                <div style={{ borderTop: `1px solid ${cor.border}` }}>
                  {lista.map((p, i) => {
                    const perc = parseInt(p.Progresso_Perc || 0)
                    const totalTarefas = parseInt(p.Total_Tarefas || 0)
                    const concluidas = totalTarefas > 0 ? Math.round(perc / 100 * totalTarefas) : 0
                    const atrasado = STATUS_ATRASADO.includes(p.Status)
                    const fmtDate = (d) => d ? new Date(d).toLocaleDateString('pt-BR') : '—'
                    const statusLabel = p.Status || ''
                    const statusStyle = atrasado
                      ? { background: '#FEE2E2', color: '#DC2626' }
                      : statusLabel === 'Em Andamento' ? { background: '#DCFCE7', color: '#15803D' }
                      : statusLabel === 'Backlog' ? { background: '#F1F5F9', color: '#64748B' }
                      : { background: '#FEF9C3', color: '#854D0E' }

                    return (
                      <div key={p.ID_Projeto} style={{
                        padding: '10px 16px',
                        borderTop: i > 0 ? `1px solid ${cor.border}` : 'none',
                        background: atrasado ? 'rgba(239,68,68,0.04)' : 'transparent',
                      }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 2, flexWrap: 'wrap' }}>
                              <span style={{ fontSize: 13, fontWeight: 700, color: '#0F172A', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                {p.Nome}
                              </span>
                              <span style={{ fontSize: 10, fontWeight: 700, padding: '1px 7px', borderRadius: 4, whiteSpace: 'nowrap', ...statusStyle }}>
                                {atrasado ? 'ATRASADO' : statusLabel.toUpperCase()}
                              </span>
                            </div>
                            <div style={{ display: 'flex', gap: 12, fontSize: 11, color: '#64748B', flexWrap: 'wrap' }}>
                              {p.Cliente && <span>Cliente: <strong>{p.Cliente}</strong></span>}
                              {p.Data_Entrega_Contrato
                                ? <span>Entrega: <strong style={{ color: atrasado ? '#DC2626' : '#475569' }}>{fmtDate(p.Data_Entrega_Contrato)}</strong></span>
                                : <span style={{ color: '#F59E0B', fontWeight: 700 }}>Sem data de entrega</span>
                              }
                            </div>
                          </div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
                            <div style={{ textAlign: 'right' }}>
                              <span style={{ fontSize: 13, fontWeight: 800, color: atrasado ? '#DC2626' : cor.title }}>{perc}%</span>
                              {totalTarefas > 0 && <div style={{ fontSize: 10, color: '#94A3B8', fontWeight: 600 }}>{concluidas}/{totalTarefas} tarefas</div>}
                            </div>
                            {p.Link_ClickUp && (
                              <a href={p.Link_ClickUp} target="_blank" rel="noreferrer"
                                style={{ color: cor.title, opacity: 0.7 }} title="Abrir no ClickUp">
                                <ArrowTopRightOnSquareIcon style={{ width: 14, height: 14 }} />
                              </a>
                            )}
                          </div>
                        </div>
                        <BarraProgresso perc={perc} cor={cor.bar} atrasado={atrasado} />
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
