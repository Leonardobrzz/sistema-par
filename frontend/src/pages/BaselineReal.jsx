import { useState, useEffect, useCallback } from 'react'
import { toast } from 'react-hot-toast'
import { ScaleIcon } from '@heroicons/react/24/outline'
import api from '../utils/api'
import { useTheme } from '../contexts/ThemeContext'

const fmt = (v) => Number(v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 })
const fN  = (v, d = 1) => Number(v || 0).toFixed(d)
const fDt = (s) => s ? new Date(s).toLocaleDateString('pt-BR') : '—'

function ProgressBar({ value, max, color = '#7C3AED', height = 8 }) {
  const pct = max > 0 ? Math.min((value / max) * 100, 100) : 0
  return (
    <div style={{ height, background: '#E2E8F0', borderRadius: 99, overflow: 'hidden' }}>
      <div style={{ height: '100%', width: `${pct}%`, background: color, borderRadius: 99, transition: 'width .4s' }} />
    </div>
  )
}

export default function BaselineReal() {
  const { isDark } = useTheme()
  const T = {
    bg:      isDark ? '#0F172A' : '#F8FAFC',
    card:    isDark ? '#1E293B' : '#ffffff',
    cardAlt: isDark ? '#162032' : '#F8FAFC',
    border:  isDark ? '#334155' : '#E2E8F0',
    text1:   isDark ? '#F1F5F9' : '#0F172A',
    text2:   isDark ? '#94A3B8' : '#64748B',
    text3:   isDark ? '#475569' : '#94A3B8',
    inputBg: isDark ? '#0F172A' : '#ffffff',
  }

  const [projetos, setProjetos] = useState([])
  const [loading, setLoading]   = useState(true)
  const [selected, setSelected] = useState(null)
  const [busca, setBusca]       = useState('')

  const carregar = useCallback(async () => {
    setLoading(true)
    try {
      const r = await api.get('/baseline-real')
      setProjetos(r.data?.projetos || [])
    } catch { toast.error('Erro ao carregar dados') }
    finally { setLoading(false) }
  }, [])

  useEffect(() => { carregar() }, [carregar])

  const filtrados = projetos.filter(p =>
    !busca || (p.nome || '').toLowerCase().includes(busca.toLowerCase()) || (p.setor || '').toLowerCase().includes(busca.toLowerCase())
  )

  const s = selected

  return (
    <div className="space-y-5 fade-in">
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 4 }}>
        <ScaleIcon style={{ width: 24, height: 24, color: '#7C3AED' }} />
        <h1 className="page-title">Baseline x Real</h1>
        <span style={{ fontSize: 12, color: T.text3, marginLeft: 4 }}>planejado vs. executado por projeto</span>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '320px 1fr', gap: 20, alignItems: 'start' }}>

        {/* Lista de projetos */}
        <div style={{ background: T.card, borderRadius: 14, border: `1.5px solid ${T.border}`, overflow: 'hidden' }}>
          <div style={{ padding: '14px 16px', borderBottom: `1px solid ${T.border}`, display: 'flex', flexDirection: 'column', gap: 8 }}>
            <span style={{ fontWeight: 700, fontSize: 13, color: T.text2 }}>
              Projetos Aprovados ({filtrados.length})
            </span>
            <input
              value={busca}
              onChange={e => setBusca(e.target.value)}
              placeholder="Buscar projeto..."
              style={{ padding: '6px 12px', borderRadius: 8, border: `1.5px solid ${T.border}`, background: T.inputBg, color: T.text1, fontSize: 12, fontFamily: 'inherit', outline: 'none' }}
            />
          </div>

          {loading ? (
            <div style={{ padding: 32, textAlign: 'center', color: T.text3 }}>Carregando...</div>
          ) : filtrados.length === 0 ? (
            <div style={{ padding: 32, textAlign: 'center', color: T.text3, fontSize: 13 }}>Nenhum projeto aprovado</div>
          ) : (
            <div style={{ maxHeight: '72vh', overflowY: 'auto', padding: '8px 10px' }}>
              {filtrados.map(p => {
                const isOk = p.margemPlan >= 23
                const isSel = selected?.id === p.id
                return (
                  <div
                    key={p.id}
                    onClick={() => setSelected(isSel ? null : p)}
                    style={{
                      padding: '12px 14px', borderRadius: 10, marginBottom: 6, cursor: 'pointer',
                      background: isSel ? (isDark ? 'rgba(124,58,237,.2)' : 'rgba(124,58,237,.06)') : T.cardAlt,
                      border: `1px solid ${isSel ? 'rgba(124,58,237,.5)' : T.border}`,
                      transition: 'all .18s',
                    }}
                  >
                    <div style={{ fontWeight: 700, fontSize: 13, color: T.text1, marginBottom: 2 }}>{p.nome}</div>
                    <div style={{ fontSize: 11, color: T.text2, marginBottom: 6 }}>{p.setor} · {fmt(p.valorContrato)}</div>
                    <ProgressBar value={p.totalRecebido} max={p.valorContrato} color={p.percRecebido >= 50 ? '#16A34A' : '#7C3AED'} height={5} />
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 4, fontSize: 10, color: T.text3 }}>
                      <span>{fN(p.percRecebido)}% recebido</span>
                      <span style={{ color: isOk ? '#16A34A' : '#DC2626', fontWeight: 700 }}>margem {fN(p.margemPlan)}%</span>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* Detalhe */}
        <div style={{ background: T.card, borderRadius: 14, border: `1.5px solid ${T.border}`, minHeight: 400 }}>
          {!s ? (
            <div style={{ padding: 60, textAlign: 'center', color: T.text3 }}>
              <ScaleIcon style={{ width: 44, height: 44, margin: '0 auto 12px', opacity: 0.25 }} />
              <div style={{ fontWeight: 600, fontSize: 14 }}>Selecione um projeto para ver o comparativo</div>
            </div>
          ) : (
            <div style={{ padding: '24px 28px' }}>

              {/* Header */}
              <div style={{ marginBottom: 20 }}>
                <div style={{ fontSize: 17, fontWeight: 900, color: T.text1 }}>{s.nome}</div>
                <div style={{ fontSize: 12, color: T.text2, marginTop: 4 }}>
                  <span style={{ background: '#EDE9FE', color: '#7C3AED', padding: '2px 8px', borderRadius: 20, fontWeight: 700, fontSize: 11, marginRight: 8 }}>{s.setor}</span>
                  {s.qtdMedPlan} medição(ões) planejada(s) · {s.qtdMedReais} na tabela
                </div>
              </div>

              {/* KPIs lado a lado */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 24 }}>

                {/* Coluna PLANEJADO */}
                <div style={{ background: isDark ? '#162032' : '#F5F3FF', borderRadius: 12, padding: '16px 18px', border: `1.5px solid ${isDark ? '#334155' : '#DDD6FE'}` }}>
                  <div style={{ fontSize: 10, fontWeight: 800, color: '#7C3AED', textTransform: 'uppercase', letterSpacing: '.1em', marginBottom: 12 }}>📋 Planejado (Baseline)</div>
                  {[
                    ['Valor do Contrato', fmt(s.valorContrato)],
                    ['Receita Líquida',   fmt(s.receitaLiquida)],
                    ['Total de Custos',   fmt(s.totalCustos)],
                    ['Lucro Estimado',    fmt(s.lucroPlan)],
                    ['Margem',            `${fN(s.margemPlan)}%`],
                    ['Qtd. Medições',     `${s.qtdMedPlan} medição(ões)`],
                  ].map(([lbl, val]) => (
                    <div key={lbl} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: `1px solid ${isDark ? '#334155' : '#EDE9FE'}`, fontSize: 12 }}>
                      <span style={{ color: T.text2 }}>{lbl}</span>
                      <span style={{ fontWeight: 700, color: T.text1 }}>{val}</span>
                    </div>
                  ))}
                </div>

                {/* Coluna REAL */}
                <div style={{ background: isDark ? '#0f2820' : '#F0FDF4', borderRadius: 12, padding: '16px 18px', border: `1.5px solid ${isDark ? '#166534' : '#BBF7D0'}` }}>
                  <div style={{ fontSize: 10, fontWeight: 800, color: '#16A34A', textTransform: 'uppercase', letterSpacing: '.1em', marginBottom: 12 }}>✅ Real (Executado)</div>
                  {[
                    ['Recebido',            fmt(s.totalRecebido)],
                    ['Pendente / A Faturar', fmt(s.totalPendente)],
                    ['% Recebido',          `${fN(s.percRecebido)}%`],
                    ['Medições Recebidas',  `${s.qtdMedRecebidas} de ${s.qtdMedReais}`],
                    ['Desvio vs. Planejado', fmt(s.totalRecebido - s.valorContrato)],
                  ].map(([lbl, val], i) => {
                    const isDesvio = i === 4
                    const devVal = s.totalRecebido - s.valorContrato
                    const devColor = isDesvio ? (devVal >= 0 ? '#16A34A' : '#DC2626') : T.text1
                    return (
                      <div key={lbl} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: `1px solid ${isDark ? '#166534' : '#BBF7D0'}`, fontSize: 12 }}>
                        <span style={{ color: T.text2 }}>{lbl}</span>
                        <span style={{ fontWeight: 700, color: devColor }}>{val}</span>
                      </div>
                    )
                  })}
                </div>
              </div>

              {/* Barra de progresso financeiro */}
              <div style={{ marginBottom: 24, padding: '14px 18px', background: T.cardAlt, borderRadius: 10, border: `1px solid ${T.border}` }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 8 }}>
                  <span style={{ color: T.text2, fontWeight: 600 }}>Progresso de Recebimento</span>
                  <strong style={{ color: s.percRecebido >= 23 ? '#16A34A' : '#7C3AED' }}>{fN(s.percRecebido)}% recebido</strong>
                </div>
                <ProgressBar value={s.totalRecebido} max={s.valorContrato} color={s.percRecebido >= 50 ? '#16A34A' : '#7C3AED'} height={10} />
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: T.text3, marginTop: 6 }}>
                  <span>{fmt(s.totalRecebido)} recebido</span>
                  <span>{fmt(s.valorContrato - s.totalRecebido)} restante</span>
                </div>
              </div>

              {/* Cronograma planejado x real */}
              {s.cronograma.length > 0 && (
                <div>
                  <div style={{ fontSize: 11, fontWeight: 800, color: T.text3, textTransform: 'uppercase', letterSpacing: '.08em', marginBottom: 10 }}>
                    Cronograma de Medições — Planejado x Real
                  </div>
                  <div style={{ overflowX: 'auto' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                      <thead>
                        <tr style={{ background: T.cardAlt }}>
                          {['Etapa', '% Plan.', 'Valor Plan.', 'Data Prev.', 'Valor Real', 'Data Receb.', 'Status'].map(h => (
                            <th key={h} style={{ padding: '8px 10px', textAlign: 'left', fontSize: 10, fontWeight: 700, color: T.text3, textTransform: 'uppercase', letterSpacing: '.06em', borderBottom: `2px solid ${T.border}` }}>{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {s.cronograma.map((m, i) => {
                          const statusColor = m.statusReal === 'Recebido' ? '#16A34A' : m.statusReal === 'Atrasado' ? '#DC2626' : '#D97706'
                          const temReal = m.valorReal !== null
                          return (
                            <tr key={i} style={{ background: i % 2 === 0 ? T.card : T.cardAlt, borderBottom: `1px solid ${T.border}` }}>
                              <td style={{ padding: '9px 10px', fontWeight: 600, color: T.text1 }}>{m.etapa}</td>
                              <td style={{ padding: '9px 10px', color: T.text2 }}>{m.percentualPlan != null ? `${fN(m.percentualPlan)}%` : '—'}</td>
                              <td style={{ padding: '9px 10px', color: '#7C3AED', fontWeight: 700 }}>{m.valorPlan != null ? fmt(m.valorPlan) : '—'}</td>
                              <td style={{ padding: '9px 10px', color: T.text2 }}>{fDt(m.dataPrevista)}</td>
                              <td style={{ padding: '9px 10px', fontWeight: temReal ? 700 : 400, color: temReal ? '#16A34A' : T.text3 }}>
                                {temReal ? fmt(m.valorReal) : <span style={{ fontSize: 11, fontStyle: 'italic' }}>sem registro</span>}
                              </td>
                              <td style={{ padding: '9px 10px', color: T.text2 }}>{fDt(m.dataRecebimento)}</td>
                              <td style={{ padding: '9px 10px' }}>
                                {m.statusReal ? (
                                  <span style={{ fontSize: 10, fontWeight: 700, color: statusColor, background: `${statusColor}18`, padding: '2px 8px', borderRadius: 20 }}>
                                    {m.statusReal}
                                  </span>
                                ) : (
                                  <span style={{ fontSize: 11, color: T.text3, fontStyle: 'italic' }}>—</span>
                                )}
                              </td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

            </div>
          )}
        </div>
      </div>
    </div>
  )
}
