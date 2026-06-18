import { createContext, useContext, useState, useEffect } from 'react'
import api from '../utils/api'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const token = localStorage.getItem('par_token')
    const savedUser = localStorage.getItem('par_user')
    if (token && savedUser) {
      try {
        setUser(JSON.parse(savedUser))
        api.defaults.headers.common['Authorization'] = `Bearer ${token}`
      } catch {
        localStorage.removeItem('par_token')
        localStorage.removeItem('par_user')
      }
    }
    setLoading(false)
  }, [])

  async function login(email, senha) {
    const res = await api.post('/auth/login', { email, senha })
    const { token, user: u } = res.data
    localStorage.setItem('par_token', token)
    localStorage.setItem('par_user', JSON.stringify(u))
    api.defaults.headers.common['Authorization'] = `Bearer ${token}`
    setUser(u)
    return u
  }

  function logout() {
    localStorage.removeItem('par_token')
    localStorage.removeItem('par_user')
    delete api.defaults.headers.common['Authorization']
    setUser(null)
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
