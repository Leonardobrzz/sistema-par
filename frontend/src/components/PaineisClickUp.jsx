import { useEffect, useState } from 'react'
import { ArrowTopRightOnSquareIcon, ChartBarIcon } from '@heroicons/react/24/outline'
import api from '../utils/api'

const AREAS = {
  Arquitetura:    { bg: '#EEF2FF', border: '#C7D2FE', title: '#4338CA', dot: '#6366F1' },
  Saneamento:     { bg: '#F0FDFA', border: '#99F6E4', title: '#0F766E', dot: '#14B8A6' },
  Engenharia:     { bg: '#FFFBEB', border: '#FDE68A', title: '#B45309', dot: '#F59E0B' },
  Comercial:      { bg: '#FDF4FF', border: '#E9D5FF', title: '#7E22CE', dot: '#A855F7' },
  Infraestrutura: { bg: '#F0FDF4', border: '#BBF7D0', title: '#15803D', dot: '#22C55E' },
  Contratos:      { bg: '#EFF6FF', border: '#BFDBFE', title: '#1D4ED8', dot: '#3B82F6' },
}

export default function PaineisClickUp() {
  const [paineis, setPaineis] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    api.get('/clickup/dashboards')
      .then(r => setPaineis(r.data.paineis || []))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  if (loading || paineis.length === 0) return null

  return (
    <div style={{ marginTop: 8 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
        <ChartBarIcon style={{ width: 18, height: 18, color: '#64748B' }} />
        <span style={{ fontSize: 12, fontWeight: 700, color: '#64748B', letterSpacing: '0.1em', textTransform: 'uppercase' }}>
          Painéis ClickUp
        </span>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 10 }}>
        {paineis.map(p => {
          const cor = AREAS[p.area] || AREAS.Contratos
          return (
            <a
              key={p.id}
              href={p.url}
              target="_blank"
              rel="noreferrer"
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                background: cor.bg,
                border: `1.5px solid ${cor.border}`,
                borderRadius: 12,
                padding: '11px 14px',
                textDecoration: 'none',
                boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
                transition: 'box-shadow 0.18s, transform 0.18s',
                cursor: 'pointer',
              }}
              onMouseEnter={e => {
                e.currentTarget.style.boxShadow = '0 4px 14px rgba(0,0,0,0.1)'
                e.currentTarget.style.transform = 'translateY(-1px)'
              }}
              onMouseLeave={e => {
                e.currentTarget.style.boxShadow = '0 1px 3px rgba(0,0,0,0.05)'
                e.currentTarget.style.transform = 'translateY(0)'
              }}
            >
              <div style={{ width: 9, height: 9, borderRadius: '50%', background: cor.dot, flexShrink: 0 }} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{
                  fontSize: 12, fontWeight: 800, color: cor.title,
                  letterSpacing: '0.04em', textTransform: 'uppercase',
                  whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                }}>
                  {p.nome}
                </div>
                <div style={{ fontSize: 10, color: '#94A3B8', marginTop: 1 }}>Abrir no ClickUp</div>
              </div>
              <ArrowTopRightOnSquareIcon style={{ width: 14, height: 14, color: cor.dot, flexShrink: 0 }} />
            </a>
          )
        })}
      </div>
    </div>
  )
}
