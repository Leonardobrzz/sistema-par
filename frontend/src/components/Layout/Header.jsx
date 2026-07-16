import { useState, useRef, useEffect } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import {
  BellIcon, ArrowRightOnRectangleIcon, Cog6ToothIcon,
  XMarkIcon, ExclamationTriangleIcon, ExclamationCircleIcon,
  InformationCircleIcon, LinkIcon, CheckIcon, MoonIcon, SunIcon,
} from '@heroicons/react/24/outline'
import { useAuth } from '../../contexts/AuthContext'
import { useAlerts } from '../../contexts/AlertContext'
import { useTheme } from '../../contexts/ThemeContext'
import { formatDateTime } from '../../utils/formatters'

const LEVEL_CONFIG = {
  error:   { icon: ExclamationCircleIcon,   color: 'text-red-500',    dot: 'bg-red-500',    bg: 'bg-red-50'    },
  warning: { icon: ExclamationTriangleIcon, color: 'text-amber-500',  dot: 'bg-amber-400',  bg: 'bg-amber-50'  },
  info:    { icon: InformationCircleIcon,   color: 'text-blue-500',   dot: 'bg-blue-400',   bg: 'bg-blue-50'   },
}

export default function Header() {
  const { user, logout } = useAuth()
  const { alerts, unreadCount, markAsSeen, resolveAlert } = useAlerts()
  const { isDark, toggleTheme } = useTheme()
  const [showAlerts, setShowAlerts] = useState(false)
  const [showUser,   setShowUser]   = useState(false)
  const navigate    = useNavigate()
  const location    = useLocation()
  const dropdownRef = useRef(null)
  const userRef     = useRef(null)

  const PAGE_TITLES = {
    '/dashboard':       'Dashboard',
    '/projetos':        'Planejamento Físico/Financeiro',
    '/planejamento':    'Planejamento Financeiro',
    '/terceirizados':   'Terceirizados',
    '/medicoes':        'Medições & Faturamento',
    '/relatorios':      'Relatórios',
    '/importacao-opp':  'Importar Opportune',
    '/configuracoes':   'Configurações',
    '/alertas':         'Central de Alertas',
  }
  const pageTitle = PAGE_TITLES[Object.keys(PAGE_TITLES).find(k => location.pathname.startsWith(k))] || ''

  const recentAlerts = alerts.filter(a => a.Status !== 'Resolvido').slice(0, 8)

  function handleLogout() { logout(); navigate('/login') }

  useEffect(() => {
    function handleClick(e) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) setShowAlerts(false)
      if (userRef.current   && !userRef.current.contains(e.target))   setShowUser(false)
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  const dayGreet = () => {
    const h = new Date().getHours()
    if (h < 12) return 'Bom dia'
    if (h < 18) return 'Boa tarde'
    return 'Boa noite'
  }

  const btnStyle = {
    width: 36, height: 36, display: 'flex', alignItems: 'center', justifyContent: 'center',
    border: 'none', borderRadius: 9, cursor: 'pointer', background: 'transparent',
    color: '#5E7899', transition: 'all 0.18s ease',
  }

  return (
    <header style={{
      height: 64,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      padding: '0 28px',
      background: '#ffffff',
      borderBottom: '1px solid #D8E4EE',
      flexShrink: 0,
      position: 'relative',
    }}>

      {/* Greeting */}
      <div style={{ minWidth: 180 }}>
        <h2 style={{ fontSize: 14, fontWeight: 700, color: '#0D1B2A', margin: 0 }}>
          {dayGreet()},{' '}
          <span style={{ color: '#00B5CC' }}>{user?.nome?.split(' ')[0]}</span>
        </h2>
        <p style={{ fontSize: 11, color: '#94AABE', margin: 0, marginTop: 2, textTransform: 'capitalize' }}>
          {new Date().toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' })}
        </p>
      </div>

      {/* Page title — center */}
      {pageTitle && (
        <span style={{ fontSize: 13, fontWeight: 700, color: '#64748B', position: 'absolute', left: '50%', transform: 'translateX(-50%)', whiteSpace: 'nowrap' }}>
          {pageTitle}
        </span>
      )}

      {/* Actions */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>

        {/* Bell */}
        <div style={{ position: 'relative' }} ref={dropdownRef}>
          <button
            onClick={() => setShowAlerts(!showAlerts)}
            style={{ ...btnStyle, position: 'relative' }}
            title="Alertas"
            onMouseEnter={e => { e.currentTarget.style.background = '#E6F8FB'; e.currentTarget.style.color = '#00B5CC' }}
            onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = '#5E7899' }}
          >
            <BellIcon style={{ width: 18, height: 18 }} />
            {unreadCount > 0 && (
              <span style={{
                position: 'absolute', top: 5, right: 5,
                width: 8, height: 8, borderRadius: '50%',
                background: '#EF4444', border: '1.5px solid #fff',
              }} />
            )}
          </button>

          {showAlerts && (
            <div className="slide-in-right" style={{
              position: 'absolute', right: 0, top: 52, width: 400,
              background: '#fff', borderRadius: 16,
              border: '1px solid #E2E8F0',
              boxShadow: '0 8px 30px rgba(0,0,0,0.08)',
              zIndex: 100, overflow: 'hidden',
            }}>
              {/* Header */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 20px', borderBottom: '1px solid #F1F5F9' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <BellIcon style={{ width: 16, height: 16, color: '#00B5CC' }} />
                  <span style={{ fontWeight: 700, fontSize: 14, color: '#0F172A' }}>Central de Alertas</span>
                  {unreadCount > 0 && (
                    <span style={{ background: '#FEE2E2', color: '#DC2626', fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 99 }}>
                      {unreadCount} novos
                    </span>
                  )}
                </div>
                <button onClick={() => setShowAlerts(false)} style={{ ...btnStyle, width: 28, height: 28 }}>
                  <XMarkIcon style={{ width: 16, height: 16 }} />
                </button>
              </div>

              {/* List */}
              <div style={{ maxHeight: 360, overflowY: 'auto' }}>
                {recentAlerts.length === 0 ? (
                  <div style={{ padding: '40px 20px', textAlign: 'center' }}>
                    <CheckIcon style={{ width: 28, height: 28, color: '#16A34A', margin: '0 auto 8px', display: 'block', opacity: 0.4 }} />
                    <p style={{ fontSize: 13, color: '#94A3B8', margin: 0 }}>Nenhum alerta ativo</p>
                  </div>
                ) : (
                  recentAlerts.map(a => {
                    const cfg = LEVEL_CONFIG[a.Nivel] || LEVEL_CONFIG.info
                    const Icon = cfg.icon
                    return (
                      <div
                        key={a.ID}
                        onClick={() => { markAsSeen(a.ID); setShowAlerts(false) }}
                        style={{
                          display: 'flex', gap: 12, alignItems: 'flex-start',
                          padding: '12px 20px', borderBottom: '1px solid #F8FAFC',
                          cursor: 'pointer', transition: 'background 0.1s',
                        }}
                        onMouseEnter={e => e.currentTarget.style.background = '#F8FAFC'}
                        onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                      >
                        <div style={{ width: 28, height: 28, borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}
                          className={cfg.bg}>
                          <Icon style={{ width: 14, height: 14 }} className={cfg.color} />
                        </div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <p style={{ fontSize: 12, color: '#374151', fontWeight: 500, lineHeight: 1.5, margin: '0 0 4px' }}>
                            {a.Mensagem}
                          </p>
                          <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                            <span style={{ fontSize: 11, color: '#94A3B8' }}>{formatDateTime(a.Data_Geracao)}</span>
                            {a.Link_ClickUp && (
                              <a href={a.Link_ClickUp} target="_blank" rel="noreferrer"
                                onClick={e => e.stopPropagation()}
                                style={{ display: 'flex', gap: 4, alignItems: 'center', fontSize: 11, color: '#1E3A5F', fontWeight: 600, textDecoration: 'none' }}>
                                <LinkIcon style={{ width: 10, height: 10 }} /> ClickUp
                              </a>
                            )}
                          </div>
                        </div>
                        <button
                          onClick={e => { e.stopPropagation(); resolveAlert(a.ID) }}
                          style={{ ...btnStyle, width: 28, height: 28 }}
                          title="Dispensar"
                        >
                          <XMarkIcon style={{ width: 14, height: 14 }} />
                        </button>
                      </div>
                    )
                  })
                )}
              </div>

              {/* Footer */}
              <div style={{ padding: '12px 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderTop: '1px solid #F1F5F9' }}>
                <button onClick={() => { navigate('/alertas'); setShowAlerts(false) }}
                  style={{ fontSize: 12, fontWeight: 700, color: '#00B5CC', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit' }}>
                  Ver todos →
                </button>
                {recentAlerts.length > 0 && (
                  <span style={{ fontSize: 12, color: '#94A3B8' }}>{recentAlerts.length} alertas</span>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Dark mode toggle */}
        <button
          onClick={toggleTheme}
          title={isDark ? 'Modo claro' : 'Modo escuro'}
          style={{
            ...btnStyle,
            background: isDark ? '#334155' : 'transparent',
            color: isDark ? '#F1F5F9' : '#5E7899',
            borderRadius: 20,
            width: 56,
            gap: 4,
            fontSize: 11,
            fontWeight: 700,
            transition: 'all 0.25s',
          }}
          onMouseEnter={e => { e.currentTarget.style.background = isDark ? '#475569' : '#F1F5F9' }}
          onMouseLeave={e => { e.currentTarget.style.background = isDark ? '#334155' : 'transparent' }}
        >
          {isDark
            ? <SunIcon  style={{ width: 16, height: 16, color: '#FCD34D' }} />
            : <MoonIcon style={{ width: 16, height: 16 }} />}
        </button>

        {/* Settings */}
        <button
          onClick={() => navigate('/configuracoes')}
          style={btnStyle}
          title="Configurações"
          onMouseEnter={e => { e.currentTarget.style.background = '#E6F8FB'; e.currentTarget.style.color = '#00B5CC' }}
          onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = '#5E7899' }}
        >
          <Cog6ToothIcon style={{ width: 18, height: 18 }} />
        </button>

        {/* Divider */}
        <div style={{ width: 1, height: 22, background: '#D8E4EE', margin: '0 6px' }} />

        {/* Logout */}
        <button
          onClick={handleLogout}
          title="Sair"
          style={{
            ...btnStyle,
            width: 'auto',
            padding: '0 12px',
            gap: 6,
            fontSize: 13,
            fontWeight: 600,
          }}
          onMouseEnter={e => { e.currentTarget.style.color = '#DC2626'; e.currentTarget.style.background = '#FEF2F2' }}
          onMouseLeave={e => { e.currentTarget.style.color = '#64748B'; e.currentTarget.style.background = 'transparent' }}
        >
          <ArrowRightOnRectangleIcon style={{ width: 16, height: 16 }} />
          <span className="hidden sm:inline">Sair</span>
        </button>
      </div>
    </header>
  )
}
