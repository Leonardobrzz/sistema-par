import { useState } from 'react'
import { NavLink } from 'react-router-dom'
import {
  HomeIcon, FolderIcon, CalculatorIcon, UsersIcon,
  ChartBarIcon, DocumentTextIcon, Cog6ToothIcon,
  ArrowUpTrayIcon, BellAlertIcon, ShieldCheckIcon, BuildingOffice2Icon,
  PresentationChartLineIcon, ClipboardDocumentCheckIcon, ClipboardDocumentListIcon,
  BanknotesIcon, KeyIcon,
} from '@heroicons/react/24/outline'
import { useAuth } from '../../contexts/AuthContext'
import { useAlerts } from '../../contexts/AlertContext'
import { toast } from 'react-hot-toast'
import api from '../../utils/api'

const NAV_ITEMS = [
  { to: '/dashboard',        label: 'Dashboard',                          icon: HomeIcon                   },
  { to: '/projetos',         label: 'Planejamento Físico/Financeiro',      icon: FolderIcon                 },
  { to: '/planejamento',     label: 'Planejamento Financeiro',            icon: CalculatorIcon,            perfis: ['PO', 'Coordenador', 'Admin', 'Diretoria'] },
  { to: '/aprovacao',        label: 'Aprovações & Baseline',              icon: ShieldCheckIcon,           perfis: ['PO', 'Coordenador', 'Admin', 'Diretoria'], badge: 'aprovacao' },
  { to: '/terceirizados',    label: 'Terceirizados',                      icon: UsersIcon,                 perfis: ['PO', 'Comercial', 'Coordenador', 'Admin', 'Diretoria'] },
  { to: '/medicoes',         label: 'Medições & Faturamento',             icon: ChartBarIcon,              perfis: ['PO', 'Financeiro', 'Comercial', 'Coordenador', 'Admin', 'Diretoria'] },
  { to: '/comercial',        label: 'Comercial / OPP',                    icon: BuildingOffice2Icon,       perfis: ['Comercial', 'Financeiro', 'Admin', 'Diretoria'] },
  { to: '/importacao-opp',   label: 'Importar Opportune',                 icon: ArrowUpTrayIcon,           perfis: ['Financeiro', 'Admin', 'Coordenador', 'Diretoria'] },
  { to: '/extrato',          label: 'Extrato por Projeto',                icon: BanknotesIcon,             perfis: ['Financeiro', 'Coordenador', 'Admin', 'Diretoria'] },
  { to: '/checklist',        label: 'Checklist de Integridade',           icon: ClipboardDocumentListIcon, perfis: ['PO', 'Coordenador', 'Admin', 'Diretoria'] },
  { to: '/configuracoes',    label: 'Configurações',                      icon: Cog6ToothIcon,             perfis: ['Admin', 'Coordenador', 'Diretoria'] },
  { to: '/alertas',          label: 'Central de Alertas',                 icon: BellAlertIcon              },
]

const W_COLLAPSED = 72
const W_EXPANDED  = 252

const sidebarStyles = `
  @keyframes pulse-dot {
    0%, 100% { opacity: 1; transform: scale(1); }
    50% { opacity: 0.5; transform: scale(0.85); }
  }
  .par-nav-link {
    text-decoration: none;
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 9px 12px;
    border-radius: 10px;
    position: relative;
    transition: background 0.18s ease, box-shadow 0.18s ease, transform 0.18s ease;
    cursor: pointer;
  }
  .par-nav-link:not([aria-current="page"]):hover {
    transform: translateX(3px);
    background: rgba(255,255,255,0.08) !important;
  }
`

export default function Sidebar() {
  const { user } = useAuth()
  const { unreadCount } = useAlerts()
  const [expanded, setExpanded] = useState(false)
  const [showSenhaModal, setShowSenhaModal] = useState(false)
  const [senhaForm, setSenhaForm] = useState({ senhaAtual: '', novaSenha: '', confirmar: '' })
  const [salvandoSenha, setSalvandoSenha] = useState(false)

  async function alterarSenha(e) {
    e.preventDefault()
    if (senhaForm.novaSenha !== senhaForm.confirmar) { toast.error('As senhas não coincidem.'); return }
    setSalvandoSenha(true)
    try {
      await api.put('/auth/me/senha', { senhaAtual: senhaForm.senhaAtual, novaSenha: senhaForm.novaSenha })
      toast.success('Senha alterada com sucesso!')
      setShowSenhaModal(false)
      setSenhaForm({ senhaAtual: '', novaSenha: '', confirmar: '' })
    } catch (err) {
      toast.error(err.response?.data?.error || 'Erro ao alterar senha')
    } finally { setSalvandoSenha(false) }
  }

  const visibleItems = NAV_ITEMS.filter(
    item => !item.perfis || item.perfis.includes(user?.perfil)
  )

  return (
    <>
      <style>{sidebarStyles}</style>

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
          background: 'linear-gradient(180deg, #122D57 0%, #0E2748 60%, #0a1f3c 100%)',
          position: 'fixed',
          top: 0,
          left: 0,
          zIndex: 20,
          boxShadow: expanded
            ? '6px 0 40px rgba(0,0,0,0.45), inset -1px 0 0 rgba(255,255,255,0.06)'
            : '4px 0 20px rgba(14,39,72,0.3)',
          transition: 'width 0.28s cubic-bezier(.4,0,.2,1), box-shadow 0.28s',
          overflow: 'hidden',
        }}
      >
        {/* Logo PAR */}
        <div style={{ padding: '20px 0 10px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2, flexShrink: 0 }}>
          <span style={{
            fontWeight: 900, fontSize: 17, color: '#ffffff',
            letterSpacing: '0.18em',
            textShadow: '0 0 24px rgba(0,181,204,0.5), 0 0 8px rgba(0,181,204,0.3)',
            whiteSpace: 'nowrap',
          }}>PAR</span>
          <span style={{ fontSize: 7.5, color: 'rgba(255,255,255,0.3)', letterSpacing: '0.12em', textTransform: 'uppercase', fontWeight: 700, whiteSpace: 'nowrap' }}>
            Sistema
          </span>
        </div>

        {/* Company logo */}
        <div style={{ display: 'flex', justifyContent: 'center', padding: '0 10px 10px', flexShrink: 0 }}>
          <img src="/image.png" alt="Logo" style={{ width: 44, height: 44, objectFit: 'contain' }} />
        </div>

        {/* Divider */}
        <div style={{ height: 1, background: 'linear-gradient(90deg, transparent, rgba(0,181,204,0.35), transparent)', margin: '0 14px 10px', flexShrink: 0 }} />

        {/* Nav */}
        <nav style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 2, padding: '0 8px', overflowY: 'auto', overflowX: 'hidden' }}>
          {visibleItems.map((item, idx) => (
            <NavLink
              key={item.to}
              to={item.to}
              title={!expanded ? item.label : undefined}
              onClick={() => setExpanded(false)}
              className="par-nav-link"
              style={({ isActive }) => ({
                background: isActive
                  ? 'linear-gradient(90deg, rgba(0,181,204,0.2) 0%, rgba(0,181,204,0.07) 100%)'
                  : 'transparent',
                boxShadow: isActive
                  ? 'inset 3px 0 0 #00B5CC'
                  : 'none',
                color: isActive ? '#00D4ED' : 'rgba(255,255,255,0.55)',
              })}
            >
              {({ isActive }) => (
                <>
                  <item.icon style={{
                    width: 19, height: 19, flexShrink: 0,
                    color: isActive ? '#00D4ED' : 'rgba(255,255,255,0.55)',
                    transition: 'color 0.18s, filter 0.18s',
                    filter: isActive ? 'drop-shadow(0 0 5px rgba(0,212,237,0.55))' : 'none',
                  }} />
                  <span style={{
                    fontSize: 12.5,
                    fontWeight: isActive ? 700 : 500,
                    color: isActive ? '#ffffff' : 'rgba(255,255,255,0.72)',
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    maxWidth: W_EXPANDED - 72,
                    opacity: expanded ? 1 : 0,
                    transform: expanded ? 'translateX(0)' : 'translateX(-8px)',
                    transition: `opacity 0.22s ease ${expanded ? idx * 20 : 0}ms, transform 0.22s ease ${expanded ? idx * 20 : 0}ms`,
                    pointerEvents: 'none',
                    letterSpacing: '0.01em',
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

        {/* Bottom divider */}
        <div style={{ height: 1, background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.08), transparent)', margin: '0 8px 8px', flexShrink: 0 }} />

        {/* User avatar */}
        <div style={{ padding: '0 8px 18px', flexShrink: 0 }}>
          <div
            onClick={() => setShowSenhaModal(true)}
            title="Alterar senha"
            style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '6px 4px', borderRadius: 10, cursor: 'pointer', transition: 'background 0.18s' }}
            onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.07)'}
            onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
          >
            <div style={{
              width: 36, height: 36, borderRadius: 10, flexShrink: 0,
              background: 'linear-gradient(135deg, #00B5CC, #007A8C)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              color: '#fff', fontWeight: 800, fontSize: 14,
              boxShadow: '0 2px 12px rgba(0,181,204,0.35)',
            }}>
              {(user?.nome || 'U')[0].toUpperCase()}
            </div>
            <div style={{
              minWidth: 0, flex: 1,
              opacity: expanded ? 1 : 0,
              transform: expanded ? 'translateX(0)' : 'translateX(-6px)',
              transition: 'opacity 0.22s ease 80ms, transform 0.22s ease 80ms',
              pointerEvents: expanded ? 'auto' : 'none',
            }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: '#fff', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 140 }}>
                {user?.nome}
              </div>
              <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.4)', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 4 }}>
                {user?.perfil} · <KeyIcon style={{ width: 10, height: 10 }} /> alterar senha
              </div>
            </div>
          </div>
        </div>
      </aside>

      {/* Modal alterar senha */}
      {showSenhaModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <form onSubmit={alterarSenha} style={{ background: '#fff', borderRadius: 16, padding: 28, width: 360, boxShadow: '0 20px 60px rgba(0,0,0,0.2)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 20 }}>
              <KeyIcon style={{ width: 20, height: 20, color: '#7C3AED' }} />
              <h2 style={{ margin: 0, fontSize: 16, fontWeight: 800, color: '#0F172A' }}>Alterar Senha</h2>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {[
                { label: 'Senha atual', key: 'senhaAtual' },
                { label: 'Nova senha', key: 'novaSenha' },
                { label: 'Confirmar nova senha', key: 'confirmar' },
              ].map(({ label, key }) => (
                <div key={key}>
                  <label style={{ fontSize: 11, fontWeight: 700, color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.05em', display: 'block', marginBottom: 4 }}>{label}</label>
                  <input
                    type="password"
                    required
                    value={senhaForm[key]}
                    onChange={e => setSenhaForm(p => ({ ...p, [key]: e.target.value }))}
                    style={{ width: '100%', padding: '9px 12px', borderRadius: 8, border: '1.5px solid #E2E8F0', background: '#F8FAFC', fontSize: 13, fontFamily: 'inherit', outline: 'none', boxSizing: 'border-box' }}
                  />
                </div>
              ))}
            </div>
            <div style={{ display: 'flex', gap: 10, marginTop: 20 }}>
              <button type="button" onClick={() => { setShowSenhaModal(false); setSenhaForm({ senhaAtual: '', novaSenha: '', confirmar: '' }) }} style={{ flex: 1, padding: '10px', borderRadius: 8, border: '1.5px solid #E2E8F0', background: '#fff', color: '#64748B', fontWeight: 700, fontSize: 13, cursor: 'pointer' }}>
                Cancelar
              </button>
              <button type="submit" disabled={salvandoSenha} style={{ flex: 1, padding: '10px', borderRadius: 8, border: 'none', background: '#7C3AED', color: '#fff', fontWeight: 700, fontSize: 13, cursor: 'pointer' }}>
                {salvandoSenha ? 'Salvando...' : 'Salvar'}
              </button>
            </div>
          </form>
        </div>
      )}
    </>
  )
}
