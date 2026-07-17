import { useState } from 'react'
import { NavLink } from 'react-router-dom'
import {
  HomeIcon, FolderIcon, CalculatorIcon, UsersIcon,
  ChartBarIcon, DocumentTextIcon, Cog6ToothIcon,
  ArrowUpTrayIcon, BellAlertIcon, ShieldCheckIcon, BuildingOffice2Icon,
  BanknotesIcon, KeyIcon, ClipboardDocumentListIcon, ClockIcon,
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
      { to: '/extrato',      label: 'Extrato por Projeto',      icon: BanknotesIcon,            perfis: ['Financeiro','Coordenador','Admin','Diretoria'] },
    ],
  },
  {
    label: 'Operacional',
    items: [
      { to: '/terceirizados',  label: 'Terceirizados',          icon: UsersIcon,                perfis: ['PO','Comercial','Coordenador','Admin','Diretoria'] },
      { to: '/comercial',      label: 'Comercial / OPP',        icon: BuildingOffice2Icon,      perfis: ['Comercial','Financeiro','Admin','Diretoria'] },
      { to: '/importacao-opp', label: 'Importar Opportune',     icon: ArrowUpTrayIcon,          perfis: ['Financeiro','Admin','Coordenador','Diretoria'] },
      { to: '/checklist',      label: 'Checklist',              icon: ClipboardDocumentListIcon,perfis: ['PO','Coordenador','Admin','Diretoria'] },
    ],
  },
  {
    label: 'Sistema',
    items: [
      { to: '/alertas',        label: 'Central de Alertas',     icon: BellAlertIcon },
      { to: '/auditoria',      label: 'Auditoria',              icon: ClockIcon,                perfis: ['Admin','Diretoria'] },
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
        .par-link { text-decoration:none; display:flex; align-items:center; gap:11px; padding:8px 10px; border-radius:9px; position:relative; transition:background .15s,transform .15s; cursor:pointer; }
        .par-link:not([aria-current="page"]):hover { background:rgba(255,255,255,.09) !important; transform:translateX(2px); }
      `}</style>

      {expanded && <div onClick={() => setExpanded(false)} style={{ position:'fixed', inset:0, zIndex:9 }} />}

      <aside
        onMouseEnter={() => setExpanded(true)}
        onMouseLeave={() => setExpanded(false)}
        style={{
          width: expanded ? W_EXPANDED : W_COLLAPSED,
          display: 'flex', flexDirection: 'column',
          height: '100vh',
          background: '#0F1B2D',
          position: 'fixed', top: 0, left: 0, zIndex: 20,
          boxShadow: expanded ? '8px 0 40px rgba(0,0,0,.5)' : '4px 0 16px rgba(0,0,0,.25)',
          transition: 'width .26s cubic-bezier(.4,0,.2,1)',
          overflow: 'hidden',
          borderRight: '1px solid rgba(255,255,255,.06)',
        }}
      >
        {/* Logo area */}
        <div style={{ padding: '18px 0 14px', display:'flex', flexDirection:'column', alignItems:'center', gap:4, flexShrink:0 }}>
          <img src="/image.png" alt="Logo" style={{ width:38, height:38, objectFit:'contain', borderRadius:8 }} />
          <div style={{
            opacity: expanded ? 1 : 0, transform: expanded ? 'translateX(0)' : 'translateX(-6px)',
            transition: 'opacity .2s, transform .2s', whiteSpace:'nowrap', textAlign:'center',
          }}>
            <div style={{ fontSize:13, fontWeight:900, color:'#fff', letterSpacing:'.12em' }}>PAR</div>
            <div style={{ fontSize:9, color:'rgba(255,255,255,.35)', letterSpacing:'.1em', textTransform:'uppercase', fontWeight:700 }}>Jota Barros</div>
          </div>
        </div>

        {/* Divider */}
        <div style={{ height:1, background:'linear-gradient(90deg,transparent,rgba(255,255,255,.1),transparent)', margin:'0 12px 8px', flexShrink:0 }} />

        {/* Nav groups */}
        <nav style={{ flex:1, overflowY:'auto', overflowX:'hidden', padding:'0 8px', display:'flex', flexDirection:'column', gap:2 }}>
          {visibleGroups.map((group, gi) => (
            <div key={gi} style={{ marginBottom:6 }}>
              {/* Group label */}
              <div style={{
                fontSize:9, fontWeight:800, color:'rgba(255,255,255,.25)', textTransform:'uppercase',
                letterSpacing:'.12em', padding:'6px 10px 4px',
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
                    background: isActive ? 'rgba(56,189,248,.15)' : 'transparent',
                    borderLeft: isActive ? '3px solid #38BDF8' : '3px solid transparent',
                    color: isActive ? '#38BDF8' : 'rgba(255,255,255,.55)',
                    paddingLeft: 8,
                  })}
                >
                  {({ isActive }) => (
                    <>
                      <item.icon style={{
                        width:18, height:18, flexShrink:0,
                        color: isActive ? '#38BDF8' : 'rgba(255,255,255,.5)',
                        filter: isActive ? 'drop-shadow(0 0 6px rgba(56,189,248,.6))' : 'none',
                        transition:'color .15s,filter .15s',
                      }} />
                      <span style={{
                        fontSize:12.5, fontWeight: isActive ? 700 : 500,
                        color: isActive ? '#fff' : 'rgba(255,255,255,.7)',
                        whiteSpace:'nowrap', opacity: expanded ? 1 : 0,
                        transform: expanded ? 'translateX(0)' : 'translateX(-6px)',
                        transition:`opacity .2s ease ${expanded ? idx*18 : 0}ms, transform .2s ease ${expanded ? idx*18 : 0}ms`,
                        pointerEvents:'none',
                        maxWidth: W_EXPANDED - 68, overflow:'hidden', textOverflow:'ellipsis',
                      }}>{item.label}</span>
                      {item.to === '/alertas' && unreadCount > 0 && (
                        <span style={{
                          position:'absolute', top:9, left:23,
                          width:6, height:6, borderRadius:'50%',
                          background:'#EF4444', border:'1.5px solid #0F1B2D',
                          animation:'pulse-dot 2s ease-in-out infinite',
                        }} />
                      )}
                      {item.to === '/alertas' && unreadCount > 0 && expanded && (
                        <span style={{
                          marginLeft:'auto', fontSize:10, fontWeight:800, padding:'1px 6px',
                          borderRadius:20, background:'#EF4444', color:'#fff', flexShrink:0,
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
        <div style={{ height:1, background:'rgba(255,255,255,.07)', margin:'0 8px 8px', flexShrink:0 }} />

        {/* User */}
        <div style={{ padding:'0 8px 16px', flexShrink:0 }}>
          <div
            onClick={() => setShowSenhaModal(true)}
            style={{
              display:'flex', alignItems:'center', gap:10, padding:'8px',
              borderRadius:10, cursor:'pointer', transition:'background .15s',
            }}
            onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,.07)'}
            onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
          >
            <div style={{
              width:34, height:34, borderRadius:9, flexShrink:0,
              background:'linear-gradient(135deg,#38BDF8,#0284C7)',
              display:'flex', alignItems:'center', justifyContent:'center',
              color:'#fff', fontWeight:900, fontSize:14,
              boxShadow:'0 2px 10px rgba(56,189,248,.4)',
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
              <div style={{ fontSize:12, fontWeight:700, color:'#fff', whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis', maxWidth:140 }}>
                {user?.nome}
              </div>
              <div style={{ fontSize:10, color:'rgba(255,255,255,.35)', display:'flex', alignItems:'center', gap:3 }}>
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
