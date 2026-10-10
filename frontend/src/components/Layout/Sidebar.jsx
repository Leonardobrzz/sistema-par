import { useState } from 'react'
import { NavLink } from 'react-router-dom'
import {
  HomeIcon, FolderIcon, CalculatorIcon, UsersIcon,
  ChartBarIcon, DocumentTextIcon, Cog6ToothIcon,
  ArrowUpTrayIcon, BellAlertIcon, ShieldCheckIcon, BuildingOffice2Icon,
  BanknotesIcon, KeyIcon, ClipboardDocumentListIcon, ClockIcon, PresentationChartLineIcon, ScaleIcon, DocumentChartBarIcon,
} from '@heroicons/react/24/outline'
import { useAuth } from '../../contexts/AuthContext'
import { useAlerts } from '../../contexts/AlertContext'
import { toast } from 'react-hot-toast'
import api from '../../utils/api'

const NAV_GROUPS = [
  {
    label: 'Principal',
    items: [
      { to: '/dashboard',    label: 'Dashboard',               icon: HomeIcon },
      { to: '/projetos',     label: 'Planejamento Físico',      icon: FolderIcon },
    ],
  },
  {
    label: 'Financeiro',
    items: [
      { to: '/planejamento', label: 'Plan. Financeiro',         icon: CalculatorIcon,           perfis: ['PO','Coordenador','Admin','Diretoria'] },
      { to: '/aprovacao',    label: 'Aprovações & Baseline',    icon: ShieldCheckIcon,          perfis: ['PO','Coordenador','Admin','Diretoria'], badge: 'aprovacao' },
      { to: '/medicoes',     label: 'Medições & Faturamento',   icon: ChartBarIcon,             perfis: ['PO','Financeiro','Comercial','Coordenador','Admin','Diretoria'] },
      { to: '/extrato',               label: 'Extrato por Projeto',      icon: BanknotesIcon,               perfis: ['Financeiro','Coordenador','Admin','Diretoria'] },
      { to: '/dashboard-financeiro',  label: 'Dashboard Financeiro',     icon: PresentationChartLineIcon,   perfis: ['Financeiro','Coordenador','Admin','Diretoria'] },
      { to: '/baseline-real',         label: 'Baseline x Real',          icon: ScaleIcon,                   perfis: ['Financeiro','Coordenador','Admin','Diretoria'] },
      { to: '/relatorios-gerenciais', label: 'Relatórios Gerenciais',    icon: DocumentChartBarIcon,        perfis: ['Financeiro','Coordenador','Admin','Diretoria'] },
    ],
  },
  {
    label: 'Operacional',
    items: [
      { to: '/terceirizados',  label: 'Terceirizados',          icon: UsersIcon,                perfis: ['PO','Comercial','Coordenador','Admin','Diretoria'] },
      { to: '/comercial',      label: 'Comercial / OPP',        icon: BuildingOffice2Icon,      perfis: ['Comercial','Financeiro','Admin','Diretoria'] },
      { to: '/importacao-opp', label: 'Importar Opportune',     icon: ArrowUpTrayIcon,          perfis: ['Financeiro','Admin','Coordenador','Diretoria'] },
    ],
  },
  {
    label: 'Sistema',
    items: [
      { to: '/alertas',        label: 'Central de Alertas',     icon: BellAlertIcon },
      { to: '/auditoria',      label: 'Auditoria',              icon: ClockIcon,                perfis: ['Admin','Diretoria'] },
      { to: '/vincular-os',    label: 'Vincular OS OPP',        icon: KeyIcon,                  perfis: ['Admin','Diretoria'] },
      { to: '/configuracoes',  label: 'Configurações',          icon: Cog6ToothIcon,            perfis: ['Admin','Coordenador','Diretoria'] },
    ],
  },
]

const W_COLLAPSED = 68
const W_EXPANDED  = 248

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

  const visibleGroups = NAV_GROUPS.map(g => ({
    ...g,
    items: g.items.filter(item => !item.perfis || item.perfis.includes(user?.perfil)),
  })).filter(g => g.items.length > 0)

  return (
    <>
      <style>{`
        @keyframes pulse-dot { 0%,100%{opacity:1;transform:scale(1)} 50%{opacity:.5;transform:scale(.85)} }
        .par-link { text-decoration:none; display:flex; align-items:center; gap:10px; padding:7px 10px; border-radius:10px; position:relative; transition:background .16s,transform .16s; cursor:pointer; }
        .par-link:not([aria-current="page"]):hover { background:rgba(14,39,72,.05) !important; transform:translateX(2px); }
        .par-nav::-webkit-scrollbar { width:4px; }
        .par-nav::-webkit-scrollbar-track { background:transparent; }
        .par-nav::-webkit-scrollbar-thumb { background:#D8E4EE; border-radius:4px; }
        .par-nav::-webkit-scrollbar-thumb:hover { background:#B7C9DC; }
        .par-user-card:hover { background:rgba(14,39,72,.055) !important; border-color:rgba(14,39,72,.12) !important; }
      `}</style>

      {expanded && <div onClick={() => setExpanded(false)} style={{ position:'fixed', inset:0, zIndex:9 }} />}

      <aside
        onMouseEnter={() => setExpanded(true)}
        onMouseLeave={() => setExpanded(false)}
        style={{
          width: expanded ? W_EXPANDED : W_COLLAPSED,
          display: 'flex', flexDirection: 'column',
          height: '100vh',
          background: '#ffffff',
          position: 'fixed', top: 0, left: 0, zIndex: 20,
          boxShadow: expanded ? '10px 0 30px rgba(14,39,72,.12)' : '2px 0 10px rgba(14,39,72,.05)',
          transition: 'width .26s cubic-bezier(.4,0,.2,1), box-shadow .26s ease',
          overflow: 'hidden',
          borderRight: '1px solid #E8EFF5',
        }}
      >
        {/* Logo area */}
        <div style={{ padding: '20px 0 16px', display:'flex', flexDirection:'column', alignItems:'center', gap:9, flexShrink:0 }}>
          <div style={{
            width:42, height:42, borderRadius:12, flexShrink:0,
            background:'linear-gradient(135deg, rgba(0,181,204,.10), rgba(0,181,204,.02))',
            border:'1px solid rgba(0,181,204,.22)',
            boxShadow:'0 4px 14px rgba(0,181,204,.10), inset 0 1px 0 rgba(255,255,255,.6)',
            display:'flex', alignItems:'center', justifyContent:'center',
          }}>
            <img src="/image.png" alt="Logo" style={{ width:26, height:26, objectFit:'contain' }} />
          </div>
          <div style={{
            opacity: expanded ? 1 : 0, transform: expanded ? 'translateX(0)' : 'translateX(-6px)',
            transition: 'opacity .2s, transform .2s', whiteSpace:'nowrap', textAlign:'center',
          }}>
            <div style={{ fontSize:13.5, fontWeight:900, color:'#0E2748', letterSpacing:'.14em' }}>PAR</div>
            <div style={{ fontSize:8.5, color:'#94AABE', letterSpacing:'.12em', textTransform:'uppercase', fontWeight:700, marginTop:2 }}>Jota Barros</div>
          </div>
        </div>

        {/* Divider */}
        <div style={{ height:1, background:'linear-gradient(90deg,transparent,#E2E9F2,transparent)', margin:'0 14px 10px', flexShrink:0 }} />

        {/* Nav groups */}
        <nav className="par-nav" style={{ flex:1, overflowY:'auto', overflowX:'hidden', padding:'0 8px', display:'flex', flexDirection:'column', gap:4 }}>
          {visibleGroups.map((group, gi) => (
            <div key={gi} style={{ marginBottom:4 }}>
              {/* Group label */}
              <div style={{
                fontSize:9, fontWeight:800, color:'#94AABE', textTransform:'uppercase',
                letterSpacing:'.13em', padding: gi === 0 ? '2px 10px 6px' : '10px 10px 6px',
                opacity: expanded ? 1 : 0, transition:'opacity .18s',
                whiteSpace:'nowrap', pointerEvents:'none',
              }}>{group.label}</div>

              {group.items.map((item, idx) => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  title={!expanded ? item.label : undefined}
                  onClick={() => setExpanded(false)}
                  className="par-link"
                  style={({ isActive }) => ({
                    background: isActive
                      ? 'linear-gradient(90deg, rgba(0,181,204,.12), rgba(0,181,204,.02) 85%)'
                      : 'transparent',
                    boxShadow: isActive ? 'inset 0 0 0 1px rgba(0,181,204,.16)' : 'none',
                    color: isActive ? '#00879A' : '#5E7899',
                  })}
                >
                  {({ isActive }) => (
                    <>
                      {isActive && (
                        <span style={{
                          position:'absolute', left:-2, top:'50%', transform:'translateY(-50%)',
                          width:3, height:20, borderRadius:'0 3px 3px 0',
                          background:'#00B5CC', boxShadow:'0 0 8px rgba(0,181,204,.5)',
                        }} />
                      )}
                      <div style={{
                        width:28, height:28, borderRadius:8, flexShrink:0,
                        display:'flex', alignItems:'center', justifyContent:'center',
                        background: isActive ? 'rgba(0,181,204,.12)' : 'transparent',
                        transition:'background .16s',
                      }}>
                        <item.icon style={{
                          width:17, height:17,
                          color: isActive ? '#00879A' : '#8FA3BD',
                          transition:'color .15s',
                        }} />
                      </div>
                      <span style={{
                        fontSize:12.5, fontWeight: isActive ? 700 : 500,
                        color: isActive ? '#0E2748' : '#5E7899',
                        whiteSpace:'nowrap', opacity: expanded ? 1 : 0,
                        transform: expanded ? 'translateX(0)' : 'translateX(-6px)',
                        transition:`opacity .2s ease ${expanded ? idx*18 : 0}ms, transform .2s ease ${expanded ? idx*18 : 0}ms`,
                        pointerEvents:'none',
                        maxWidth: W_EXPANDED - 96, overflow:'hidden', textOverflow:'ellipsis',
                      }}>{item.label}</span>
                      {item.to === '/alertas' && unreadCount > 0 && (
                        <span style={{
                          position:'absolute', top:8, left:22,
                          width:6.5, height:6.5, borderRadius:'50%',
                          background:'#EF4444', border:'1.5px solid #ffffff',
                          boxShadow:'0 0 6px rgba(239,68,68,.6)',
                          animation:'pulse-dot 2s ease-in-out infinite',
                        }} />
                      )}
                      {item.to === '/alertas' && unreadCount > 0 && expanded && (
                        <span style={{
                          marginLeft:'auto', fontSize:10, fontWeight:800, padding:'1.5px 6.5px',
                          borderRadius:20, background:'#EF4444', color:'#fff', flexShrink:0,
                          boxShadow:'0 2px 7px rgba(239,68,68,.5)',
                        }}>{unreadCount}</span>
                      )}
                    </>
                  )}
                </NavLink>
              ))}
            </div>
          ))}
        </nav>

        {/* Bottom divider */}
        <div style={{ height:1, background:'linear-gradient(90deg,transparent,#E2E9F2,transparent)', margin:'0 14px 10px', flexShrink:0 }} />

        {/* User */}
        <div style={{ padding:'0 8px 16px', flexShrink:0 }}>
          <div
            className="par-user-card"
            onClick={() => setShowSenhaModal(true)}
            style={{
              display:'flex', alignItems:'center', gap:10, padding:'8px',
              borderRadius:12, cursor:'pointer', transition:'background .16s, border-color .16s',
              background:'rgba(14,39,72,.025)', border:'1px solid rgba(14,39,72,.07)',
            }}
          >
            <div style={{
              width:34, height:34, borderRadius:10, flexShrink:0,
              background:'linear-gradient(135deg,#00C2D9,#0088A3)',
              display:'flex', alignItems:'center', justifyContent:'center',
              color:'#fff', fontWeight:900, fontSize:14,
              boxShadow:'0 0 0 2px #ffffff, 0 0 0 3.5px rgba(0,181,204,.22), 0 3px 10px rgba(0,181,204,.28)',
            }}>
              {(user?.nome || 'U')[0].toUpperCase()}
            </div>
            <div style={{
              minWidth:0, flex:1,
              opacity: expanded ? 1 : 0,
              transform: expanded ? 'translateX(0)' : 'translateX(-6px)',
              transition:'opacity .2s ease 60ms,transform .2s ease 60ms',
              pointerEvents: expanded ? 'auto' : 'none',
            }}>
              <div style={{ fontSize:12, fontWeight:700, color:'#0E2748', whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis', maxWidth:140 }}>
                {user?.nome}
              </div>
              <div style={{ fontSize:10, color:'#8FA3BD', display:'flex', alignItems:'center', gap:3, marginTop:1 }}>
                <KeyIcon style={{ width:9, height:9 }} /> {user?.perfil} · alterar senha
              </div>
            </div>
          </div>
        </div>
      </aside>

      {/* Modal senha */}
      {showSenhaModal && (
        <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,.5)', zIndex:9999, display:'flex', alignItems:'center', justifyContent:'center' }}>
          <form onSubmit={alterarSenha} style={{ background:'#fff', borderRadius:16, padding:28, width:360, boxShadow:'0 20px 60px rgba(0,0,0,.2)' }}>
            <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:20 }}>
              <KeyIcon style={{ width:20, height:20, color:'#0284C7' }} />
              <h2 style={{ margin:0, fontSize:16, fontWeight:800, color:'#0F172A' }}>Alterar Senha</h2>
            </div>
            <div style={{ display:'flex', flexDirection:'column', gap:12 }}>
              {[{label:'Senha atual',key:'senhaAtual'},{label:'Nova senha',key:'novaSenha'},{label:'Confirmar nova senha',key:'confirmar'}].map(({label,key}) => (
                <div key={key}>
                  <label style={{ fontSize:11, fontWeight:700, color:'#64748B', textTransform:'uppercase', letterSpacing:'.05em', display:'block', marginBottom:4 }}>{label}</label>
                  <input type="password" required value={senhaForm[key]} onChange={e => setSenhaForm(p => ({...p,[key]:e.target.value}))}
                    style={{ width:'100%', padding:'9px 12px', borderRadius:8, border:'1.5px solid #E2E8F0', background:'#F8FAFC', fontSize:13, fontFamily:'inherit', outline:'none', boxSizing:'border-box' }} />
                </div>
              ))}
            </div>
            <div style={{ display:'flex', gap:10, marginTop:20 }}>
              <button type="button" onClick={() => { setShowSenhaModal(false); setSenhaForm({senhaAtual:'',novaSenha:'',confirmar:''}) }}
                style={{ flex:1, padding:10, borderRadius:8, border:'1.5px solid #E2E8F0', background:'#fff', color:'#64748B', fontWeight:700, fontSize:13, cursor:'pointer' }}>
                Cancelar
              </button>
              <button type="submit" disabled={salvandoSenha}
                style={{ flex:1, padding:10, borderRadius:8, border:'none', background:'#0284C7', color:'#fff', fontWeight:700, fontSize:13, cursor:'pointer' }}>
                {salvandoSenha ? 'Salvando...' : 'Salvar'}
              </button>
            </div>
          </form>
        </div>
      )}
    </>
  )
}
