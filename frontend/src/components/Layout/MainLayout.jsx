import { Outlet } from 'react-router-dom'
import Sidebar from './Sidebar'
import Header from './Header'
import { useTheme } from '../../contexts/ThemeContext'

export default function MainLayout() {
  const { isDark } = useTheme()
  const bg = isDark ? '#0F172A' : '#f4f7f9'

  return (
    <div style={{ display: 'flex', height: '100vh', overflow: 'hidden', background: bg, transition: 'background 0.3s' }}>
      <Sidebar />
      <div style={{ width: 72, flexShrink: 0 }} />
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <Header />
        <main style={{ flex: 1, overflowY: 'auto', padding: '24px', background: bg, transition: 'background 0.3s' }} className="fade-in">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
