import { createContext, useContext, useState, useEffect, useCallback } from 'react'
import api from '../utils/api'
import { useAuth } from './AuthContext'

const AlertContext = createContext(null)

export function AlertProvider({ children }) {
  const { user } = useAuth()
  const [alerts, setAlerts] = useState([])
  const [unreadCount, setUnreadCount] = useState(0)
  const [ws, setWs] = useState(null)

  const fetchAlerts = useCallback(async () => {
    if (!user) return
    try {
      const res = await api.get('/alertas')
      setAlerts(res.data)
      const countRes = await api.get('/alertas/count')
      setUnreadCount(countRes.data.naoVistos || 0)
    } catch {
      // silencioso
    }
  }, [user])

  // Conecta WebSocket
  useEffect(() => {
    if (!user) return
    const wsUrl = `${window.location.protocol === 'https:' ? 'wss' : 'ws'}://${window.location.hostname}:3001/ws?userId=${user.id}&perfil=${user.perfil}`
    const socket = new WebSocket(wsUrl)

    socket.onmessage = (e) => {
      try {
        const msg = JSON.parse(e.data)
        if (msg.type === 'alert') {
          // Recarrega alertas do servidor em vez de adicionar o payload raw
          fetchAlerts()
        }
      } catch {}
    }

    socket.onopen = () => console.log('[WS] Conectado ao Sistema PAR')
    socket.onerror = () => {} // silencioso em dev

    // Keepalive
    const pingInterval = setInterval(() => {
      if (socket.readyState === WebSocket.OPEN) {
        socket.send(JSON.stringify({ type: 'ping' }))
      }
    }, 30000)

    setWs(socket)

    return () => {
      clearInterval(pingInterval)
      socket.close()
    }
  }, [user])

  useEffect(() => {
    fetchAlerts()
    const interval = setInterval(fetchAlerts, 5 * 60 * 1000) // atualiza a cada 5 min
    return () => clearInterval(interval)
  }, [fetchAlerts])

  async function markAsSeen(id) {
    await api.put(`/alertas/${id}/visto`)
    setAlerts((prev) => prev.map((a) => a.ID === id ? { ...a, visto: true } : a))
    setUnreadCount((c) => Math.max(0, c - 1))
  }

  async function resolveAlert(id) {
    await api.put(`/alertas/${id}/resolver`)
    setAlerts((prev) => prev.filter((a) => a.ID !== id))
    setUnreadCount((c) => Math.max(0, c - 1))
  }

  return (
    <AlertContext.Provider value={{ alerts, unreadCount, fetchAlerts, refreshAlerts: fetchAlerts, markAsSeen, resolveAlert }}>
      {children}
    </AlertContext.Provider>
  )
}

export function useAlerts() {
  return useContext(AlertContext)
}
