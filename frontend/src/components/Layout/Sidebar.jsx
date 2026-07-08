import { useState } from 'react'
import { NavLink } from 'react-router-dom'
import {
  HomeIcon, FolderIcon, CalculatorIcon, UsersIcon,
  ChartBarIcon, DocumentTextIcon, Cog6ToothIcon,
  ArrowUpTrayIcon, BellAlertIcon, ShieldCheckIcon, BuildingOffice2Icon,
  PresentationChartLineIcon, ClipboardDocumentCheckIcon, ClipboardDocumentListIcon,
  BanknotesIcon,
} from '@heroicons/react/24/outline'
import { useAuth } from '../../contexts/AuthContext'
import { useAlerts } from '../../contexts/AlertContext'

const NAV_ITEMS = [
  { to: '/dashboard',        label: 'Dashboard',                          icon: HomeIcon                   },
  { to: '/projetos',         label: 'Planejamento Físico/Financeiro',      icon: FolderIcon                 },
  { to: '/planejamento',     label: 'Planejamento Financeiro',            icon: CalculatorIcon,            perfis: ['PO', 'Coordenador', 'Admin', 'Diretoria'] },
  { to: '/aprovacao',        label: 'Aprovações & Baseline',              icon: ShieldCheckIcon,           perfis: ['PO', 'Coordenador', 'Admin', 'Diretoria'], badge: 'aprovacao' },
  { to: '/terceirizados',    label: 'Terceirizados',                      icon: UsersIcon,                 perfis: ['PO', 'Comercial', 'Coordenador', 'Admin', 'Diretoria'] },
  { to: '/medicoes',         label: 'Medições & Faturamento',             icon: ChartBarIcon,              perfis: ['Financeiro', 'Comercial', 'Coordenador', 'Admin', 'Diretoria'] },
  { to: '/comercial',        label: 'Comercial / OPP',                    icon: BuildingOffice2Icon,       perfis: ['Comercial', 'Financeiro', 'Admin', 'Diretoria'] },
  { to: '/importacao-opp',   label: 'Importar Opportune',                 icon: ArrowUpTrayIcon,           perfis: ['Financeiro', 'Admin', 'Coordenador', 'Diretoria'] },
  { to: '/extrato',          label: 'Extrato por Projeto',                icon: BanknotesIcon,             perfis: ['Financeiro', 'Coordenador', 'Admin', 'Diretoria'] },
  { to: '/checklist',        label: 'Checklist de Integridade',           icon: ClipboardDocumentListIcon, perfis: ['PO', 'Coordenador', 'Admin', 'Diretoria'] },
  { to: '/configuracoes',    label: 'Configurações',                      icon: Cog6ToothIcon,             perfis: ['Admin', 'Coordenador', 'Diretoria'] },
  { to: '/alertas',          label: 'Central de Alertas',                 icon: BellAlertIcon              },
]

const W_COLLAPSED = 72
const W_EXPANDED  = 220

export default function Sidebar() {
  const { user } = useAuth()
  const { unreadCount } = useAlerts()
  const [expanded, setExpanded] = useState(false)

  const visibleItems = NAV_ITEMS.filter(
    item => !item.perfis || item.perfis.includes(user?.perfil)
  )

  return (
    <>
      {/* Overlay transparente para fechar ao clicar fora */}
      {expanded && (
        <div
          onClick={() => setExpanded(false)}
          style={{ position: 'fixed', inset: 0, zIndex: 9 }}
        />
      )}

      <aside
        onMouseEnter={() => setExpanded(true)}
        onMouseLeave={() => setExpanded(false)}
        style={{
          width: expanded ? W_EXPANDED : W_COLLAPSED,
          display: 'flex',
          flexDirection: 'column',
          height: '100vh',
          background: 'linear-gradient(180deg, #122D57 0%, #0E2748 100%)',
          position: 'fixed',
          top: 0,
          left: 0,
          zIndex: 20,
          boxShadow: expanded ? '6px 0 32px rgba(14,39,72,0.35)' : '4px 0 20px rgba(14,39,72,0.25)',
          transition: 'width 0.22s cubic-bezier(.4,0,.2,1), box-shadow 0.22s',
          overflow: 'hidden',
        }}
      >
        {/* Logo PAR */}
        <div style={{ padding: '20px 0 10px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2, flexShrink: 0 }}>
          <span style={{
            fontWeight: 900, fontSize: 17, color: '#ffffff',
            letterSpacing: '0.18em', textShadow: '0 0 20px rgba(0,181,204,0.4)',
            whiteSpace: 'nowrap',
          }}>PAR</span>
          <span style={{ fontSize: 7.5, color: 'rgba(255,255,255,0.3)', letterSpacing: '0.12em', textTransform: 'uppercase', fontWeight: 700, whiteSpace: 'nowrap' }}>
            Sistema
          </span>
        </div>

        {/* Company logo */}
        <div style={{ display: 'flex', justifyContent: 'center', padding: '0 10px 10px', flexShrink: 0 }}>
          <div style={{
            width: 44, height: 44, borderRadius: 11,
            background: 'rgba(255,255,255,0.07)',
            border: '1px solid rgba(255,255,255,0.12)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            overflow: 'hidden',
          }}>
            <img
              src="/image.png"
              alt="Logo"
              style={{ width: '100%', height: '100%', objectFit: 'contain', padding: 5 }}
            />
          </div>
        </div>

        {/* Divider */}
        <div style={{ height: 1, background: 'rgba(255,255,255,0.08)', margin: '0 14px 10px', flexShrink: 0 }} />

        {/* Nav */}
        <nav style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 2, padding: '0 8px', overflowY: 'auto', overflowX: 'hidden' }}>
          {visibleItems.map(item => (
            <NavLink
              key={item.to}
              to={item.to}
              title={!expanded ? item.label : undefined}
              onClick={() => setExpanded(false)}
              style={({ isActive }) => ({
                textDecoration: 'none',
                display: 'flex',
                alignItems: 'center',
                gap: 12,
                padding: '9px 12px',
                borderRadius: 10,
                position: 'relative',
                transition: 'background 0.15s, box-shadow 0.15s',
                background: isActive
                  ? 'rgba(0,181,204,0.18)'
                  : 'transparent',
                boxShadow: isActive
                  ? 'inset 3px 0 0 #00B5CC'
                  : 'none',
                color: isActive ? '#00D4ED' : 'rgba(255,255,255,0.55)',
              })}
              onMouseEnter={e => {
                const isActive = e.currentTarget.classList.contains('active') ||
                  e.currentTarget.getAttribute('aria-current') === 'page'
                if (!isActive) e.currentTarget.style.background = 'rgba(255,255,255,0.06)'
              }}
              onMouseLeave={e => {
                const isActive = e.currentTarget.getAttribute('aria-current') === 'page'
                if (!isActive) e.currentTarget.style.background = 'transparent'
              }}
            >
              {({ isActive }) => (
                <>
                  <item.icon style={{
                    width: 19, height: 19, flexShrink: 0,
                    color: isActive ? '#00D4ED' : 'rgba(255,255,255,0.55)',
                    transition: 'color 0.15s',
                  }} />
                  <span style={{
                    fontSize: 13, fontWeight: isActive ? 700 : 500,
                    color: isActive ? '#ffffff' : 'rgba(255,255,255,0.7)',
                    whiteSpace: 'nowrap',
                    opacity: expanded ? 1 : 0,
                    transition: 'opacity 0.15s',
                    pointerEvents: 'none',
                  }}>
                    {item.label}
                  </span>
                  {item.to === '/alertas' && unreadCount > 0 && (
                    <span style={{
                      position: 'absolute', top: 8, left: 22,
                      width: 7, height: 7, borderRadius: '50%',
                      background: '#EF4444',
                      border: '1.5px solid #0E2748',
                      animation: 'pulse-dot 2s ease-in-out infinite',
                    }} />
                  )}
                </>
              )}
            </NavLink>
          ))}
        </nav>

        {/* User avatar */}
        <div style={{ padding: '10px 8px 18px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, flexShrink: 0 }}>
          <div style={{ height: 1, background: 'rgba(255,255,255,0.08)', width: '100%', marginBottom: 6 }} />
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, width: '100%', padding: '0 4px' }}>
            <div
              title={`${user?.nome} · ${user?.perfil}`}
              style={{
                width: 36, height: 36, borderRadius: 10, flexShrink: 0,
                background: 'linear-gradient(135deg, #00B5CC, #007A8C)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                color: '#fff', fontWeight: 800, fontSize: 14,
                cursor: 'default',
                boxShadow: '0 2px 12px rgba(0,181,204,0.35)',
              }}
            >
              {(user?.nome || 'U')[0].toUpperCase()}
            </div>
            {expanded && (
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: '#fff', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {user?.nome}
                </div>
                <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.4)', fontWeight: 600 }}>
                  {user?.perfil}
                </div>
              </div>
            )}
          </div>
          {!expanded && (
            <span style={{ fontSize: 8.5, color: 'rgba(255,255,255,0.25)', fontWeight: 600, letterSpacing: '0.05em' }}>
              v2026.05
            </span>
          )}
        </div>
      </aside>
    </>
  )
}
