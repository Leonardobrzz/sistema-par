import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider, useAuth } from './contexts/AuthContext'
import { AlertProvider } from './contexts/AlertContext'
import { ThemeProvider } from './contexts/ThemeContext'
import MainLayout from './components/Layout/MainLayout'
import Login from './pages/Login'
import Dashboard from './pages/Dashboard'
import PlanejamentoFinanceiro from './pages/PlanejamentoFinanceiro'
import GestaoProjetos from './pages/GestaoProjetos'
import Terceirizados from './pages/Terceirizados'
import Medicoes from './pages/Medicoes'
import Relatorios from './pages/Relatorios'
import Configuracoes from './pages/Configuracoes'
import ImportacaoOPP from './pages/ImportacaoOPP'
import Alertas from './pages/Alertas'
import Aprovacao from './pages/Aprovacao'
import Comercial from './pages/Comercial'
import Acompanhamento from './pages/Acompanhamento'
import RelatorioFinal from './pages/RelatorioFinal'
import RelatoriosPlanejamentoPAR from './pages/RelatoriosPlanejamentoPAR'
import ChecklistIntegridade from './pages/ChecklistIntegridade'
import ExtratoProjeto from './pages/ExtratoProjeto'
import Auditoria from './pages/Auditoria'
import DashboardFinanceiro from './pages/DashboardFinanceiro'

function PrivateRoute({ children }) {
  const { user, loading } = useAuth()
  if (loading) return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#F1F5F9' }}>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14 }}>
        <div style={{ width: 44, height: 44, border: '4px solid #122D57', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
        <p style={{ color: '#64748B', fontSize: 14, margin: 0 }}>Carregando...</p>
      </div>
    </div>
  )
  return user ? children : <Navigate to="/login" replace />
}

export default function App() {
  return (
    <BrowserRouter>
      <ThemeProvider>
      <AuthProvider>
        <AlertProvider>
          <Routes>
            <Route path="/login" element={<Login />} />
            <Route path="/" element={
              <PrivateRoute>
                <MainLayout />
              </PrivateRoute>
            }>
              <Route index element={<Navigate to="/dashboard" replace />} />
              <Route path="dashboard" element={<Dashboard />} />
              <Route path="projetos" element={<GestaoProjetos />} />
              <Route path="planejamento" element={<PlanejamentoFinanceiro />} />
              <Route path="planejamento/:id" element={<PlanejamentoFinanceiro />} />
              <Route path="aprovacao" element={<Aprovacao />} />
              <Route path="terceirizados" element={<Terceirizados />} />
              <Route path="medicoes" element={<Medicoes />} />
              <Route path="comercial" element={<Comercial />} />
              <Route path="acompanhamento" element={<Acompanhamento />} />
              <Route path="relatorio-final" element={<RelatorioFinal />} />
              <Route path="relatorios" element={<Relatorios />} />
              <Route path="relatorios-planejamento" element={<RelatoriosPlanejamentoPAR />} />
              <Route path="importacao-opp" element={<ImportacaoOPP />} />
              <Route path="configuracoes" element={<Configuracoes />} />
              <Route path="alertas" element={<Alertas />} />
              <Route path="checklist" element={<ChecklistIntegridade />} />
              <Route path="extrato" element={<ExtratoProjeto />} />
              <Route path="auditoria" element={<Auditoria />} />
              <Route path="dashboard-financeiro" element={<DashboardFinanceiro />} />
            </Route>
          </Routes>
        </AlertProvider>
      </AuthProvider>
      </ThemeProvider>
    </BrowserRouter>
  )
}
