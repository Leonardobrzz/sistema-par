import { createContext, useContext, useState, useEffect, useRef, useCallback } from 'react'
import api from '../utils/api'

const AuthContext = createContext(null)

const INATIVIDADE_MS = 4 * 60 * 60 * 1000 // 4 horas

function getStorage(lembrar) {
  return lembrar ? localStorage : sessionStorage
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)
  const timerRef = useRef(null)

  const logout = useCallback(() => {
    localStorage.removeItem('par_token')
    localStorage.removeItem('par_user')
    sessionStorage.removeItem('par_token')
    sessionStorage.removeItem('par_user')
    localStorage.removeItem('par_lembrar')
    delete api.defaults.headers.common['Authorization']
    setUser(null)
    if (timerRef.current) clearTimeout(timerRef.current)
  }, [])

  const resetTimer = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current)
    timerRef.current = setTimeout(() => {
      logout()
      window.location.href = '/login'
    }, INATIVIDADE_MS)
  }, [logout])

  // Registra eventos de atividade do usuário
  useEffect(() => {
    const eventos = ['mousemove', 'keydown', 'click', 'scroll', 'touchstart']
    const handler = () => { if (user) resetTimer() }
    eventos.forEach(e => window.addEventListener(e, handler, { passive: true }))
    return () => eventos.forEach(e => window.removeEventListener(e, handler))
  }, [user, resetTimer])

  // Inicializa sessão ao carregar
  useEffect(() => {
    const lembrar = localStorage.getItem('par_lembrar') === 'true'
    const storage = getStorage(lembrar)
    const token = storage.getItem('par_token')
    const savedUser = storage.getItem('par_user')
    if (token && savedUser) {
      try {
        setUser(JSON.parse(savedUser))
        api.defaults.headers.common['Authorization'] = `Bearer ${token}`
        resetTimer()
      } catch {
        storage.removeItem('par_token')
        storage.removeItem('par_user')
      }
    }
    setLoading(false)
  }, []) // eslint-disable-line

  async function login(email, senha, lembrar = false) {
    const res = await api.post('/auth/login', { email, senha })
    const { token, user: u } = res.data
    localStorage.setItem('par_lembrar', String(lembrar))
    const storage = getStorage(lembrar)
    storage.setItem('par_token', token)
    storage.setItem('par_user', JSON.stringify(u))
    api.defaults.headers.common['Authorization'] = `Bearer ${token}`
    setUser(u)
    resetTimer()
    return u
  }

  return (
    <AuthContext.Provider value={{ user, loading, login, logout }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  return useContext(AuthContext)
}
