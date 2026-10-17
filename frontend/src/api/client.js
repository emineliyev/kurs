import axios from 'axios'
import toast from 'react-hot-toast'
import i18n from '@/i18n'
import { useAuthStore } from '@/store/authStore'

const client = axios.create({
  baseURL: '/api',
  headers: { 'Content-Type': 'application/json' },
})

client.interceptors.request.use((config) => {
  const { accessToken } = useAuthStore.getState()
  if (accessToken) {
    config.headers.Authorization = `Bearer ${accessToken}`
  }
  config.headers['Accept-Language'] = i18n.language || 'az'
  // Let axios set multipart/form-data boundary automatically for FormData
  if (config.data instanceof FormData) {
    delete config.headers['Content-Type']
  }
  return config
})

// Queue of requests waiting for token refresh to complete
let isRefreshing = false
let waitingQueue = []

const processQueue = (error, token = null) => {
  waitingQueue.forEach(({ resolve, reject }) => {
    if (error) reject(error)
    else resolve(token)
  })
  waitingQueue = []
}

client.interceptors.response.use(
  (response) => response,
  async (error) => {
    const original = error.config
    if (error.response?.status === 401 && !original._retry) {
      original._retry = true
      const { refreshToken, setTokens, logout } = useAuthStore.getState()

      if (!refreshToken) {
        logout()
        localStorage.removeItem('auth-storage')
        window.location.href = '/'
        return Promise.reject(error)
      }

      if (isRefreshing) {
        // Another request is already refreshing — wait in queue
        return new Promise((resolve, reject) => {
          waitingQueue.push({ resolve, reject })
        }).then((newToken) => {
          original.headers.Authorization = `Bearer ${newToken}`
          return client(original)
        })
      }

      isRefreshing = true
      try {
        const res = await axios.post('/api/auth/token/refresh/', { refresh: refreshToken })
        const newAccess = res.data.access
        setTokens(newAccess, res.data.refresh || refreshToken)
        original.headers.Authorization = `Bearer ${newAccess}`
        processQueue(null, newAccess)
        return client(original)
      } catch (refreshError) {
        processQueue(refreshError, null)
        logout()
        localStorage.removeItem('auth-storage')
        window.location.href = '/'
        return Promise.reject(refreshError)
      } finally {
        isRefreshing = false
      }
    }

    if (!error.response) {
      toast.error(i18n.t('network_error', { ns: 'common' }), { id: 'network-error' })  // one toast, not one per request
    } else if (error.response.status >= 500) {
      toast.error(i18n.t('server_error', { ns: 'common' }), { id: 'server-error' })
    }

    return Promise.reject(error)
  }
)

export default client
