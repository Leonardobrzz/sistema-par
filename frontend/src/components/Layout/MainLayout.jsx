import { Outlet } from 'react-router-dom'
import Sidebar from './Sidebar'
import Header from './Header'

// AlertBanner foi REMOVIDO do layout — alertas agora ficam APENAS no dropdown do sino (Header)
// e na lista do Dashboard. Sem banners bloqueantes no topo.

export default function MainLayout() {
  return (
    <div style={{ display: 'flex', height: '100vh', overflow: 'hidden', background: '#f4f7f9' }}>
      <Sidebar />
      {/* Espaço fixo igual à largura colapsada do sidebar */}
      <div style={{ width: 72, flexShrink: 0 }} />
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <Header />
        <main style={{ flex: 1, overflowY: 'auto', padding: '24px', background: '#f4f7f9' }} className="fade-in">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
