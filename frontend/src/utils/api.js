import axios from 'axios'

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL ? `${import.meta.env.VITE_API_URL}/api` : '/api',
  timeout: 30000,
  headers: { 'Content-Type': 'application/json' },
})

// Interceptor de request: injeta token salvo
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('par_token')
  if (token) config.headers.Authorization = `Bearer ${token}`
  return config
})

// Interceptor de response: trata 401
api.interceptors.response.use(
  (res) => res,
  (err) => {
    if (err.response?.status === 401) {
      localStorage.removeItem('par_token')
      localStorage.removeItem('par_user')
      window.location.href = '/login'
    }
    return Promise.reject(err)
  }
)

export default api
