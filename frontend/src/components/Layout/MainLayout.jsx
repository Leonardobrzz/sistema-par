import { Outlet } from 'react-router-dom'
import Sidebar from './Sidebar'
import Header from './Header'

// AlertBanner foi REMOVIDO do layout — alertas agora ficam APENAS no dropdown do sino (Header)
// e na lista do Dashboard. Sem banners bloqueantes no topo.

export default function MainLayout() {
  return (
    <div className="flex h-screen overflow-hidden bg-slate-50">
      <Sidebar />
      <div className="flex-1 flex flex-col overflow-hidden">
        <Header />
        <main className="flex-1 overflow-y-auto p-6 fade-in bg-[#f4f7f9]">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
