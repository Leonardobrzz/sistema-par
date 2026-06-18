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
  { to: '/dashboard',        label: 'Dashboard',               icon: HomeIcon          },
  { to: '/projetos',         label: 'Gestão de Projetos',       icon: FolderIcon        },
  { to: '/planejamento',     label: 'Planejamento Financeiro',  icon: CalculatorIcon,   perfis: ['PO', 'Coordenador', 'Admin', 'Diretoria'] },
  { to: '/aprovacao',        label: 'Aprovações & Baseline',    icon: ShieldCheckIcon,  perfis: ['PO', 'Coordenador', 'Admin', 'Diretoria'], badge: 'aprovacao' },
  { to: '/terceirizados',    label: 'Terceirizados',            icon: UsersIcon,        perfis: ['PO', 'Comercial', 'Coordenador', 'Admin', 'Diretoria'] },
  { to: '/medicoes',         label: 'Medições & Faturamento',   icon: ChartBarIcon,     perfis: ['Financeiro', 'Comercial', 'Coordenador', 'Admin', 'Diretoria'] },
  { to: '/comercial',        label: 'Comercial / OPP',        icon: BuildingOffice2Icon, perfis: ['Comercial', 'Financeiro', 'Admin', 'Diretoria'] },
  { to: '/acompanhamento',   label: 'Acompanhamento Real vs. Planejado', icon: PresentationChartLineIcon, perfis: ['PO', 'Coordenador', 'Financeiro', 'Admin', 'Diretoria'] },
  { to: '/relatorio-final',  label: 'Relatório Final',          icon: ClipboardDocumentCheckIcon, perfis: ['Coordenador', 'Admin', 'Diretoria', 'Financeiro'] },
  { to: '/relatorios',       label: 'Relatórios',               icon: DocumentTextIcon  },
  { to: '/importacao-opp',   label: 'Importar Opportune',       icon: ArrowUpTrayIcon,  perfis: ['Financeiro', 'Admin', 'Coordenador', 'Diretoria'] },
  { to: '/configuracoes',    label: 'Configurações',            icon: Cog6ToothIcon,    perfis: ['Admin', 'Coordenador', 'Diretoria'] },
  { to: '/extrato',          label: 'Extrato por Projeto',      icon: BanknotesIcon,            perfis: ['Financeiro', 'Coordenador', 'Admin', 'Diretoria'] },
  { to: '/checklist',        label: 'Checklist de Integridade', icon: ClipboardDocumentListIcon, perfis: ['PO', 'Coordenador', 'Admin', 'Diretoria'] },
  { to: '/alertas',          label: 'Central de Alertas',       icon: BellAlertIcon     },
]

export default function Sidebar() {
  const { user } = useAuth()
  const { unreadCount } = useAlerts()

  const visibleItems = NAV_ITEMS.filter(
    item => !item.perfis || item.perfis.includes(user?.perfil)
  )

  return (
    <aside style={{
      width: 72,
      minWidth: 72,
      display: 'flex',
      flexDirection: 'column',
      height: '100vh',
      background: 'linear-gradient(180deg, #122D57 0%, #0E2748 100%)',
      borderRight: 'none',
      flexShrink: 0,
      position: 'relative',
      zIndex: 10,
      boxShadow: '4px 0 20px rgba(14,39,72,0.25)',
    }}>

      {/* Logo PAR */}
      <div style={{ padding: '20px 0 10px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
        <span style={{
          fontWeight: 900, fontSize: 17, color: '#ffffff',
          letterSpacing: '0.18em', textShadow: '0 0 20px rgba(0,181,204,0.4)',
        }}>PAR</span>
        <span style={{ fontSize: 7.5, color: 'rgba(255,255,255,0.3)', letterSpacing: '0.12em', textTransform: 'uppercase', fontWeight: 700 }}>
          Sistema
        </span>
      </div>

      {/* Company logo */}
      <div style={{ display: 'flex', justifyContent: 'center', padding: '0 10px 10px' }}>
        <div style={{
          width: 44, height: 44, borderRadius: 11,
          background: 'rgba(255,255,255,0.07)',
          border: '1px solid rgba(255,255,255,0.12)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          overflow: 'hidden',
          transition: 'border-color 0.2s ease',
        }}>
          <img
            src="/image.png"
            alt="Logo"
            style={{ width: '100%', height: '100%', objectFit: 'contain', padding: 5 }}
          />
        </div>
      </div>

      {/* Divider */}
      <div style={{ height: 1, background: 'rgba(255,255,255,0.08)', margin: '0 14px 10px' }} />

      {/* Nav */}
      <nav style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 3, padding: '0 8px', overflowY: 'auto' }}>
        {visibleItems.map(item => (
          <div key={item.to} style={{ position: 'relative' }}>
            <NavLink
              to={item.to}
              title={item.label}
              className={({ isActive }) => `sidebar-item${isActive ? ' active' : ''}`}
              style={{ textDecoration: 'none' }}
            >
              <item.icon style={{ width: 19, height: 19, flexShrink: 0 }} />
              {item.to === '/alertas' && unreadCount > 0 && (
                <span style={{
                  position: 'absolute', top: 7, right: 7,
                  width: 7, height: 7, borderRadius: '50%',
                  background: '#EF4444',
                  border: '1.5px solid #0E2748',
                  animation: 'pulse-dot 2s ease-in-out infinite',
                }} />
              )}
            </NavLink>
          </div>
        ))}
      </nav>

      {/* User avatar */}
      <div style={{ padding: '10px 8px 18px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
        <div style={{ height: 1, background: 'rgba(255,255,255,0.08)', width: '100%', marginBottom: 6 }} />
        <div
          title={`${user?.nome} · ${user?.perfil}`}
          style={{
            width: 36, height: 36, borderRadius: 10,
            background: 'linear-gradient(135deg, #00B5CC, #007A8C)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: '#fff', fontWeight: 800, fontSize: 14,
            cursor: 'default',
            boxShadow: '0 2px 12px rgba(0,181,204,0.35)',
          }}
        >
          {(user?.nome || 'U')[0].toUpperCase()}
        </div>
        <span style={{ fontSize: 8.5, color: 'rgba(255,255,255,0.25)', fontWeight: 600, letterSpacing: '0.05em' }}>
          v2026.05
        </span>
      </div>
    </aside>
  )
}
