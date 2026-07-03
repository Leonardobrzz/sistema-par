import { useState, useEffect, useMemo } from 'react'
import { useSearchParams, useNavigate } from 'react-router-dom'
import api from '../utils/api'

const SETORES = ['Arquitetura', 'Saneamento', 'Infraestrutura', 'Administrativo']

const fmt = (v) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v || 0)
const fmtN = (v, dec = 1) => Number(v || 0).toFixed(dec)

function DesvioTag({ value, inv = false }) {
  if (value === null || value === undefined) return <span style={{ color: '#94A3B8', fontSize: 12 }}>—</span>
  const bad = inv ? value > 0 : value < 0
  const neutral = Math.abs(value) < 2
  const color = neutral ? '#64748B' : bad ? '#DC2626' : '#15803D'
  const bg = neutral ? '#F1F5F9' : bad ? '#FEE2E2' : '#DCFCE7'
  return (
    <span style={{ fontSize: 12, fontWeight: 700, padding: '2px 8px', borderRadius: 6, background: bg, color }}>
      {value > 0 ? '+' : ''}{fmtN(value)}%
    </span>
  )
}

function BurnBar({ label, planejado, real, unit = 'h', danger }) {
  const max = Math.max(planejado, real, 1)
  const percP = Math.min((planejado / max) * 100, 100)
  const percR = Math.min((real / max) * 100, 100)
  const over = real > planejado
  return (
    <div style={{ marginBottom: 18 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
        <span style={{ fontSize: 13, fontWeight: 600, color: '#475569' }}>{label}</span>
        <div style={{ display: 'flex', gap: 16, fontSize: 12 }}>
          <span style={{ color: '#94A3B8' }}>Planejado: <strong style={{ color: '#475569' }}>{fmtN(planejado, 0)}{unit}</strong></span>
          <span style={{ color: over && danger ? '#DC2626' : '#15803D' }}>Real: <strong>{fmtN(real, 0)}{unit}</strong></span>
        </div>
      </div>
      <div style={{ position: 'relative', height: 12, background: '#F1F5F9', borderRadius: 8 }}>
        <div style={{ position: 'absolute', top: 0, left: 0, height: '100%', width: `${percP}%`, background: '#C4B5FD', borderRadius: 8 }} />
        <div style={{ position: 'absolute', top: 0, left: 0, height: '100%', width: `${percR}%`, background: over && danger ? 'rgba(239,68,68,0.8)' : 'rgba(34,197,94,0.8)', borderRadius: 8 }} />
      </div>
      <div style={{ display: 'flex', gap: 16, marginTop: 4, fontSize: 11, color: '#94A3B8' }}>
        <span><span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: 2, background: '#C4B5FD', marginRight: 4 }} />Planejado</span>
        <span><span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: 2, background: over && danger ? 'rgba(239,68,68,0.8)' : 'rgba(34,197,94,0.8)', marginRight: 4 }} />Realizado</span>
        {over && danger && <span style={{ color: '#DC2626', fontWeight: 700 }}>+{fmtN(real - planejado, 0)}{unit} acima</span>}
      </div>
    </div>
  )
}

function KpiCard({ label, value, sub, color = '#7C3AED' }) {
  return (
    <div style={{ background: '#fff', borderRadius: 14, padding: '18px 20px', border: '1px solid #E2E8F0', boxShadow: '0 2px 8px rgba(0,0,0,0.04)' }}>
      <div style={{ fontSize: 11, fontWeight: 700, color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 6 }}>{label}</div>
      <div style={{ fontSize: 26, fontWeight: 900, color }}>{value}</div>
      {sub && <div style={{ fontSize: 12, color: '#64748B', marginTop: 4 }}>{sub}</div>}
    </div>
  )
}

export default function Acompanhamento() {
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const [projetos, setProjetos] = useState([])
  const [projetoId, setProjetoId] = useState(searchParams.get('projeto') || '')
  const [comparativo, setComparativo] = useState(null)
  const [extrato, setExtrato] = useState(null)
  const [loading, setLoading] = useState(false)
  const [loadingProjetos, setLoadingProjetos] = useState(true)
  const [filtroSetor, setFiltroSetor] = useState('')
  const [filtroBusca, setFiltroBusca] = useState('')
  const [showDropdown, setShowDropdown] = useState(false)

  useEffect(() => {
    api.get('/projetos')
      .then(r => setProjetos(r.data?.projetos || r.data || []))
      .catch(() => setProjetos([]))
      .finally(() => setLoadingProjetos(false))
  }, [])

  useEffect(() => {
    if (!projetoId) return
    setLoading(true)
    setComparativo(null)
    setExtrato(null)
    Promise.allSettled([
      api.get(`/planejamento/${projetoId}/comparativo`),
      api.get(`/opp/extrato/${projetoId}`),
    ]).then(([comp, ext]) => {
      setComparativo(comp.status === 'fulfilled' ? comp.value.data : null)
      setExtrato(ext.status === 'fulfilled' ? ext.value.data : null)
    }).finally(() => setLoading(false))
  }, [projetoId])

  const projetosFiltrados = useMemo(() => projetos.filter(p => {
    if (filtroSetor && !(p.Setor || '').toLowerCase().includes(filtroSetor.toLowerCase())) return false
    if (filtroBusca) {
      const b = filtroBusca.toLowerCase()
      if (!(p.Nome || '').toLowerCase().includes(b) && !(p.Cliente || '').toLowerCase().includes(b) && !(p.ID_Projeto || '').toLowerCase().includes(b)) return false
    }
    return true
  }), [projetos, filtroSetor, filtroBusca])

  const projetoSelecionado = projetos.find(p => p.ID_Projeto === projetoId)

  const medicoesPercReal = (() => {
    if (!comparativo?.medicoes?.length) return 0
    const concluidas = ['Concluido', 'Concluída', 'Concluida', 'Realizada', 'Realizado']
    return (comparativo.medicoes.filter(m => concluidas.some(s => (m.statusFisico || '').includes(s))).length / comparativo.medicoes.length) * 100
  })()

  const medicoesPercFin = (() => {
    if (!comparativo?.medicoes?.length) return 0
    return (comparativo.medicoes.filter(m => m.statusFinanceiro === 'Recebido' || m.statusFinanceiro === 'Liquidado').length / comparativo.medicoes.length) * 100
  })()

  return (
    <div style={{ padding: '28px 32px' }}>
      {/* Header */}
      <div style={{ marginBottom: 28, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 22, fontWeight: 800, color: '#0F172A' }}>Acompanhamento Real vs. Planejado</h1>
          <p style={{ margin: '6px 0 0', fontSize: 13, color: '#64748B' }}>Comparativo detalhado de horas, medições e financeiro</p>
        </div>
        <button
          onClick={() => navigate('/relatorio-final' + (projetoId ? `?projeto=${projetoId}` : ''))}
          style={{ padding: '10px 18px', borderRadius: 10, border: 'none', background: 'linear-gradient(135deg, #0F172A, #1E293B)', color: '#fff', fontWeight: 700, fontSize: 13, cursor: 'pointer' }}
        >
          Relatório Final
        </button>
      </div>

      {/* Seletor de projeto com filtros */}
      <div style={{ background: '#fff', borderRadius: 14, padding: '20px 24px', border: '1px solid #E2E8F0', boxShadow: '0 2px 10px rgba(0,0,0,0.04)', marginBottom: 24 }}>
        <label style={{ fontWeight: 700, fontSize: 13, color: '#0F172A', display: 'block', marginBottom: 12 }}>Selecionar Projeto</label>

        {/* Pills de setor */}
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 12 }}>
          {SETORES.map(s => (
            <button key={s} onClick={() => setFiltroSetor(filtroSetor === s ? '' : s)}
              style={{ padding: '4px 13px', borderRadius: 20, border: `1.5px solid ${filtroSetor === s ? '#00B5CC' : '#E2E8F0'}`, background: filtroSetor === s ? 'rgba(0,181,204,0.08)' : '#F8FAFC', color: filtroSetor === s ? '#007A8A' : '#64748B', fontWeight: 600, fontSize: 12, cursor: 'pointer', transition: 'all 0.15s' }}>
              {s}
            </button>
          ))}
          {(filtroSetor || filtroBusca) && (
            <button onClick={() => { setFiltroSetor(''); setFiltroBusca('') }}
              style={{ padding: '4px 13px', borderRadius: 20, border: '1.5px solid #FEE2E2', background: '#FFF5F5', color: '#DC2626', fontWeight: 600, fontSize: 12, cursor: 'pointer' }}>
              Limpar
            </button>
          )}
        </div>

        {/* Busca + dropdown customizado */}
        <div style={{ position: 'relative' }}>
          <input
            value={filtroBusca}
            onChange={e => { setFiltroBusca(e.target.value); setShowDropdown(true) }}
            onFocus={() => setShowDropdown(true)}
            placeholder={projetoSelecionado ? projetoSelecionado.Nome : 'Buscar por nome, cliente ou código...'}
            style={{ width: '100%', padding: '10px 14px', borderRadius: 10, border: `1.5px solid ${showDropdown ? '#00B5CC' : '#E2E8F0'}`, fontSize: 14, color: '#0F172A', fontFamily: 'inherit', outline: 'none', background: '#fff', boxSizing: 'border-box', transition: 'border 0.15s' }}
          />
          {projetoSelecionado && !filtroBusca && (
            <div style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', display: 'flex', alignItems: 'center', gap: 6, pointerEvents: 'none' }}>
              <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 6, background: projetoSelecionado.Status === 'Em Andamento' ? '#DCFCE7' : '#F1F5F9', color: projetoSelecionado.Status === 'Em Andamento' ? '#15803D' : '#64748B', fontWeight: 700 }}>{projetoSelecionado.Status}</span>
            </div>
          )}

          {showDropdown && (
            <>
              {/* Overlay para fechar */}
              <div style={{ position: 'fixed', inset: 0, zIndex: 10 }} onClick={() => { setShowDropdown(false); setFiltroBusca('') }} />
              <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 20, background: '#fff', borderRadius: 12, border: '1.5px solid #E2E8F0', boxShadow: '0 8px 32px rgba(0,0,0,0.12)', maxHeight: 320, overflowY: 'auto', marginTop: 4 }}>
                {loadingProjetos ? (
                  <div style={{ padding: 20, textAlign: 'center', color: '#94A3B8', fontSize: 13 }}>Carregando projetos...</div>
                ) : projetosFiltrados.length === 0 ? (
                  <div style={{ padding: 20, textAlign: 'center', color: '#94A3B8', fontSize: 13 }}>Nenhum projeto encontrado</div>
                ) : projetosFiltrados.map(p => (
                  <div key={p.ID_Projeto} onClick={() => { setProjetoId(p.ID_Projeto); setShowDropdown(false); setFiltroBusca('') }}
                    style={{ padding: '11px 16px', cursor: 'pointer', borderBottom: '1px solid #F1F5F9', background: projetoId === p.ID_Projeto ? 'rgba(0,181,204,0.06)' : '#fff', transition: 'background 0.1s' }}
                    onMouseEnter={e => e.currentTarget.style.background = '#F8FAFC'}
                    onMouseLeave={e => e.currentTarget.style.background = projetoId === p.ID_Projeto ? 'rgba(0,181,204,0.06)' : '#fff'}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ fontWeight: projetoId === p.ID_Projeto ? 800 : 600, fontSize: 13, color: projetoId === p.ID_Projeto ? '#007A8A' : '#0F172A' }}>{p.Nome}</span>
                      <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexShrink: 0, marginLeft: 8 }}>
                        {p.Setor && <span style={{ fontSize: 11, color: '#94A3B8' }}>{p.Setor}</span>}
                        <span style={{ fontSize: 11, padding: '2px 7px', borderRadius: 6, background: p.Status === 'Em Andamento' || p.Status?.includes('Andamento') ? '#DCFCE7' : '#F1F5F9', color: p.Status === 'Em Andamento' || p.Status?.includes('Andamento') ? '#15803D' : '#64748B', fontWeight: 700 }}>{p.Status}</span>
                      </div>
                    </div>
                    {p.Cliente && <div style={{ fontSize: 11, color: '#94A3B8', marginTop: 2 }}>{p.Cliente}</div>}
                  </div>
                ))}
              </div>
            </>
          )}
        </div>

        {projetoSelecionado && (
          <div style={{ marginTop: 10, display: 'flex', gap: 16, fontSize: 12, color: '#64748B' }}>
            <span>Projeto: <strong style={{ color: '#0F172A' }}>{projetoSelecionado.ID_Projeto}</strong></span>
            {projetoSelecionado.Cliente && <span>Cliente: <strong style={{ color: '#0F172A' }}>{projetoSelecionado.Cliente}</strong></span>}
            {projetoSelecionado.Setor && <span>Setor: <strong style={{ color: '#0F172A' }}>{projetoSelecionado.Setor}</strong></span>}
            <button onClick={() => { setProjetoId(''); setComparativo(null); setExtrato(null) }} style={{ marginLeft: 'auto', fontSize: 11, color: '#94A3B8', background: 'none', border: 'none', cursor: 'pointer' }}>✕ Limpar seleção</button>
          </div>
        )}
      </div>

      {loading && <div style={{ textAlign: 'center', padding: 60, color: '#94A3B8', fontSize: 14 }}>Carregando comparativo...</div>}

      {!loading && !comparativo && projetoId && (
        <div style={{ textAlign: 'center', padding: 60, color: '#94A3B8', fontSize: 14 }}>Nenhum planejamento encontrado para este projeto.</div>
      )}

      {!projetoId && !loading && (
        <div style={{ textAlign: 'center', padding: 60, background: '#F8FAFC', borderRadius: 16, border: '2px dashed #E2E8F0', color: '#94A3B8' }}>
          <div style={{ fontWeight: 700, fontSize: 16, color: '#475569', marginBottom: 6 }}>Selecione um projeto acima</div>
          <div style={{ fontSize: 13 }}>para visualizar o comparativo Real vs. Planejado</div>
        </div>
      )}

      {/* Extrato OPP — aparece independente de ter planejamento */}
      {extrato && projetoId && (
        <div style={{ background: '#fff', borderRadius: 16, border: '1px solid #E2E8F0', overflow: 'hidden', marginBottom: 20 }}>
          <div style={{ padding: '18px 24px', borderBottom: '1px solid #F1F5F9', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
            <div style={{ fontWeight: 800, fontSize: 15, color: '#0F172A' }}>Extrato Financeiro OPP</div>
            <div style={{ display: 'flex', gap: 20, fontSize: 13 }}>
              <span style={{ color: '#15803D', fontWeight: 700 }}>Receitas: {fmt(extrato.resumo?.totalReceitas)}</span>
              <span style={{ color: '#DC2626', fontWeight: 700 }}>Despesas: {fmt(extrato.resumo?.totalDespesas)}</span>
              <span style={{ color: extrato.resumo?.saldo >= 0 ? '#15803D' : '#DC2626', fontWeight: 800 }}>Saldo: {fmt(extrato.resumo?.saldo)}</span>
            </div>
          </div>
          {extrato.receitas?.length > 0 && (
            <>
              <div style={{ padding: '10px 24px 4px', fontSize: 11, fontWeight: 700, color: '#15803D', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Receitas ({extrato.receitas.length})</div>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead><tr style={{ background: '#F0FDF4' }}>{['Descrição','Valor','Vencimento','Situação','Cliente'].map(h => <th key={h} style={{ padding: '8px 16px', textAlign: 'left', fontSize: 11, fontWeight: 700, color: '#64748B', textTransform: 'uppercase' }}>{h}</th>)}</tr></thead>
                <tbody>
                  {extrato.receitas.map((r, i) => (
                    <tr key={i} style={{ borderTop: '1px solid #F1F5F9' }}>
                      <td style={{ padding: '10px 16px', fontSize: 13, color: '#0F172A' }}>{r.descricao || r.Descricao || '—'}</td>
                      <td style={{ padding: '10px 16px', fontSize: 13, fontWeight: 700, color: '#15803D' }}>{fmt(r.valor ?? r.Valor)}</td>
                      <td style={{ padding: '10px 16px', fontSize: 12, color: '#64748B' }}>{r.vencimento || r.Data_Vencimento || '—'}</td>
                      <td style={{ padding: '10px 16px' }}>
                        <span style={{ fontSize: 11, fontWeight: 700, padding: '3px 8px', borderRadius: 6, background: (r.situacao || r.Situacao) === 'Liquidado' ? '#DCFCE7' : '#FEF9C3', color: (r.situacao || r.Situacao) === 'Liquidado' ? '#15803D' : '#92400E' }}>
                          {r.situacao || r.Situacao || '—'}
                        </span>
                      </td>
                      <td style={{ padding: '10px 16px', fontSize: 12, color: '#475569' }}>{r.cliente || r.Nome_Cliente || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          )}
          {extrato.despesas?.length > 0 && (
            <>
              <div style={{ padding: '10px 24px 4px', fontSize: 11, fontWeight: 700, color: '#DC2626', textTransform: 'uppercase', letterSpacing: '0.06em', borderTop: '1px solid #F1F5F9' }}>Despesas ({extrato.despesas.length})</div>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead><tr style={{ background: '#FEF2F2' }}>{['Descrição','Valor','Vencimento','Situação','Fornecedor'].map(h => <th key={h} style={{ padding: '8px 16px', textAlign: 'left', fontSize: 11, fontWeight: 700, color: '#64748B', textTransform: 'uppercase' }}>{h}</th>)}</tr></thead>
                <tbody>
                  {extrato.despesas.map((d, i) => (
                    <tr key={i} style={{ borderTop: '1px solid #F1F5F9' }}>
                      <td style={{ padding: '10px 16px', fontSize: 13, color: '#0F172A' }}>{d.descricao || d.Descricao || '—'}</td>
                      <td style={{ padding: '10px 16px', fontSize: 13, fontWeight: 700, color: '#DC2626' }}>{fmt(d.valor ?? d.Valor)}</td>
                      <td style={{ padding: '10px 16px', fontSize: 12, color: '#64748B' }}>{d.vencimento || d.Data_Vencimento || '—'}</td>
                      <td style={{ padding: '10px 16px' }}>
                        <span style={{ fontSize: 11, fontWeight: 700, padding: '3px 8px', borderRadius: 6, background: (d.situacao || d.Situacao) === 'Liquidado' ? '#DCFCE7' : '#FEF9C3', color: (d.situacao || d.Situacao) === 'Liquidado' ? '#15803D' : '#92400E' }}>
                          {d.situacao || d.Situacao || '—'}
                        </span>
                      </td>
                      <td style={{ padding: '10px 16px', fontSize: 12, color: '#475569' }}>{d.cliente || d.Nome_Cliente || d.fornecedor || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          )}
          {!extrato.receitas?.length && !extrato.despesas?.length && (
            <div style={{ padding: '32px 24px', textAlign: 'center', color: '#94A3B8', fontSize: 13 }}>
              Nenhum lançamento OPP encontrado para este projeto. Execute o Sync OPP em Configurações para atualizar.
            </div>
          )}
        </div>
      )}

      {comparativo && (
        <>
          {/* Aviso sem baseline */}
          {!comparativo.baseline && (
            <div style={{ padding: '14px 18px', borderRadius: 12, marginBottom: 20, background: '#FFFBEB', border: '1.5px solid #FCD34D', display: 'flex', gap: 12, alignItems: 'center' }}>
              <div style={{ flex: 1, fontSize: 13, fontWeight: 600, color: '#92400E' }}>
                Nenhum baseline travado — comparativo exibido sem referência de versão congelada.
              </div>
              <button onClick={() => navigate('/aprovacao')} style={{ padding: '6px 14px', borderRadius: 8, border: 'none', background: '#D97706', color: '#fff', fontWeight: 700, fontSize: 12, cursor: 'pointer' }}>
                Travar Baseline
              </button>
            </div>
          )}

          {/* KPI cards */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16, marginBottom: 24 }}>
            <KpiCard label="Horas Planejadas" value={`${fmtN(comparativo.horas?.planejadas || comparativo.horas?.totalPlanejado || 0, 0)}h`} sub="total da equipe" color="#7C3AED" />
            <KpiCard label="Horas Rastreadas" value={`${fmtN(comparativo.horas?.rastreadas || comparativo.horas?.totalRastreado || 0, 0)}h`}
              sub={comparativo.horas?.desvioPerc != null ? `desvio: ${comparativo.horas.desvioPerc > 0 ? '+' : ''}${fmtN(comparativo.horas.desvioPerc)}%` : 'sem dados de horas'}
              color={(comparativo.horas?.rastreadas || comparativo.horas?.totalRastreado || 0) === 0 ? '#94A3B8' : Math.abs(comparativo.horas?.desvioPerc || 0) < 10 ? '#15803D' : '#DC2626'} />
            <KpiCard label="Avanço Físico" value={`${fmtN(medicoesPercReal)}%`} sub={`${comparativo.medicoes?.filter(m => ['Concluida','Concluída','Concluido','Realizada'].some(s => (m.statusFisico||'').includes(s))).length || 0} de ${comparativo.medicoes?.length || 0} medições`} color="#0EA5E9" />
            <KpiCard label="Recebimento" value={`${fmtN(medicoesPercFin)}%`} sub={`${comparativo.medicoes?.filter(m => m.statusFinanceiro === 'Recebido' || m.statusFinanceiro === 'Liquidado').length || 0} de ${comparativo.medicoes?.length || 0} medições`} color="#16A34A" />
          </div>

          {/* Horas por colaborador */}
          {comparativo.horas?.porColaborador?.length > 0 && (
            <div style={{ background: '#fff', borderRadius: 16, padding: '22px 24px', border: '1px solid #E2E8F0', marginBottom: 20 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                <div style={{ fontWeight: 800, fontSize: 15, color: '#0F172A' }}>Horas por Colaborador</div>
                <div style={{ fontSize: 12, color: '#94A3B8' }}>
                  Planejado: <strong style={{ color: '#7C3AED' }}>{fmtN(comparativo.horas.planejadas || comparativo.horas.totalPlanejado || 0, 0)}h</strong>
                  &nbsp;&nbsp;Real: <strong style={{ color: '#15803D' }}>{fmtN(comparativo.horas.rastreadas || comparativo.horas.totalRastreado || 0, 0)}h</strong>
                </div>
              </div>
              {comparativo.horas.porColaborador.map((c, i) => (
                <BurnBar key={i}
                  label={c.nome || c.colaborador}
                  planejado={c.horasEstimadas || c.horasPlanejadas || 0}
                  real={c.horasLogadas || c.horasRastreadas || 0}
                  danger />
              ))}
              {comparativo.horas.porColaborador.length === 0 && (
                <div style={{ color: '#94A3B8', fontSize: 13, textAlign: 'center', padding: 16 }}>
                  Nenhuma hora rastreada no ClickUp ainda. O sync busca automaticamente a cada 15 min.
                </div>
              )}
            </div>
          )}

          {/* Medicoes */}
          {comparativo.medicoes?.length > 0 && (
            <div style={{ background: '#fff', borderRadius: 16, border: '1px solid #E2E8F0', overflow: 'hidden', marginBottom: 20 }}>
              <div style={{ padding: '18px 24px', borderBottom: '1px solid #F1F5F9', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={{ fontWeight: 800, fontSize: 15, color: '#0F172A' }}>Medições ({comparativo.medicoes.length})</div>
                <div style={{ fontSize: 12, color: '#64748B' }}>
                  Total planejado: <strong style={{ color: '#7C3AED' }}>{fmt(comparativo.medicoes.reduce((s, m) => s + parseFloat(m.valor || m.valorPlanejado || 0), 0))}</strong>
                </div>
              </div>
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr style={{ background: '#F8FAFC' }}>
                      {['Medição', 'Dt. Prevista', 'Valor Plan.', 'Valor Real.', 'Físico', 'Financeiro', 'Situação'].map(h => (
                        <th key={h} style={{ padding: '10px 16px', textAlign: 'left', fontSize: 11, fontWeight: 700, color: '#94A3B8', textTransform: 'uppercase', whiteSpace: 'nowrap' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {comparativo.medicoes.map((m, i) => {
                      const isConcluida = ['Concluida','Concluída','Concluido','Realizada','Realizado'].some(s => (m.statusFisico||'').includes(s))
                      const isRecebido = m.statusFinanceiro === 'Recebido' || m.statusFinanceiro === 'Liquidado'
                      const atrasado = m.atrasoDias > 0
                      return (
                        <tr key={i} style={{ borderTop: '1px solid #F1F5F9', background: atrasado ? '#FFFBEB' : '#fff' }}>
                          <td style={{ padding: '12px 16px', fontSize: 13, fontWeight: 600, color: '#0F172A', maxWidth: 220 }}>{m.descricao || m.etapa || `Medição ${i+1}`}</td>
                          <td style={{ padding: '12px 16px', fontSize: 12, color: '#64748B', whiteSpace: 'nowrap' }}>{m.dataPrevista || m.dataPrevisaoPlanejada || '—'}</td>
                          <td style={{ padding: '12px 16px', fontSize: 13, fontWeight: 700, color: '#7C3AED' }}>{fmt(m.valor || m.valorPlanejado)}</td>
                          <td style={{ padding: '12px 16px', fontSize: 13, fontWeight: 700, color: m.valorRealizado > 0 ? '#15803D' : '#CBD5E1' }}>{m.valorRealizado > 0 ? fmt(m.valorRealizado) : '—'}</td>
                          <td style={{ padding: '12px 16px' }}>
                            <span style={{ fontSize: 11, fontWeight: 700, padding: '3px 8px', borderRadius: 6, whiteSpace: 'nowrap',
                              background: isConcluida ? '#DCFCE7' : m.statusFisico === 'Cancelada' ? '#F1F5F9' : '#EFF6FF',
                              color: isConcluida ? '#15803D' : m.statusFisico === 'Cancelada' ? '#64748B' : '#2563EB',
                            }}>{m.statusFisico || 'Não iniciado'}</span>
                          </td>
                          <td style={{ padding: '12px 16px' }}>
                            <span style={{ fontSize: 11, fontWeight: 700, padding: '3px 8px', borderRadius: 6, whiteSpace: 'nowrap',
                              background: isRecebido ? '#DCFCE7' : m.statusFinanceiro === 'NF Emitida' ? '#EFF6FF' : '#F1F5F9',
                              color: isRecebido ? '#15803D' : m.statusFinanceiro === 'NF Emitida' ? '#2563EB' : '#64748B',
                            }}>{m.statusFinanceiro || 'Pendente'}</span>
                          </td>
                          <td style={{ padding: '12px 16px', fontSize: 12, fontWeight: 700, whiteSpace: 'nowrap',
                            color: atrasado ? '#DC2626' : isConcluida ? '#15803D' : '#64748B' }}>
                            {atrasado ? `⚠ ${m.atrasoDias}d atraso` : isConcluida ? '✓ Concluída' : 'Em dia'}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Datas planejadas vs reais */}
          {comparativo.datas && (
            <div style={{ background: '#fff', borderRadius: 16, padding: '22px 24px', border: '1px solid #E2E8F0', marginBottom: 20 }}>
              <div style={{ fontWeight: 800, fontSize: 15, color: '#0F172A', marginBottom: 16 }}>Datas Planejadas vs. Atuais</div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 12 }}>
                {(() => {
                  const { planejado = {}, atual = {} } = comparativo.datas
                  const labels = {
                    dataInicioOS: 'Início OS',
                    dataEntregaContrato: 'Entrega Contrato',
                    dataEntregaPlanejada: 'Entrega Planejada',
                  }
                  return Object.keys(labels).map(k => {
                    const vP = planejado[k] || ''
                    const vA = atual[k] || ''
                    const atrasado = vP && vA && new Date(vA) > new Date(vP)
                    const semDados = !vP && !vA
                    if (semDados) return null
                    return (
                      <div key={k} style={{ padding: '14px 16px', borderRadius: 10, background: atrasado ? '#FEF2F2' : '#F8FAFC', border: `1px solid ${atrasado ? '#FECACA' : '#E2E8F0'}` }}>
                        <div style={{ fontSize: 11, fontWeight: 700, color: '#94A3B8', textTransform: 'uppercase', marginBottom: 8, letterSpacing: 0.5 }}>{labels[k]}</div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginBottom: 4 }}>
                          <span style={{ color: '#64748B' }}>Planejado</span>
                          <strong style={{ color: '#0F172A' }}>{vP ? new Date(vP).toLocaleDateString('pt-BR') : '—'}</strong>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
                          <span style={{ color: '#64748B' }}>Atual</span>
                          <strong style={{ color: atrasado ? '#DC2626' : vA ? '#15803D' : '#94A3B8' }}>
                            {vA ? new Date(vA).toLocaleDateString('pt-BR') : '—'}
                            {atrasado && ' ⚠'}
                          </strong>
                        </div>
                      </div>
                    )
                  }).filter(Boolean)
                })()}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}
