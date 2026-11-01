import axios from 'axios'
import toast from 'react-hot-toast'
import i18n from '@/i18n'
import { useAuthStore } from '@/store/authStore'

const client = axios.create({
  baseURL: '/api',
  headers: { 'Content-Type': 'application/json' },
})

// Seconds left on a JWT (from its `exp`); 0 if it can't be read
const secondsLeft = (token) => {
  try {
    const payload = JSON.parse(atob(token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')))
    return payload.exp - Date.now() / 1000
  } catch {
    return 0
  }
}

const signOut = () => {
  useAuthStore.getState().logout()
  localStorage.removeItem('auth-storage')
  window.location.href = '/'
}

// One refresh at a time: every request that needs a new token waits on the same promise
let refreshing = null
const refreshAccess = () => {
  if (!refreshing) {
    const { refreshToken, setTokens } = useAuthStore.getState()
    refreshing = axios.post('/api/auth/token/refresh/', { refresh: refreshToken })
      .then((res) => {
        setTokens(res.data.access, res.data.refresh || refreshToken)
        return res.data.access
      })
      .finally(() => { refreshing = null })
  }
  return refreshing
}

client.interceptors.request.use(async (config) => {
  let { accessToken, refreshToken } = useAuthStore.getState()
  // Renew a little before it runs out, so the server never has to answer 401 (red lines in the console)
  if (accessToken && refreshToken && secondsLeft(accessToken) < 30) {
    try {
      accessToken = await refreshAccess()
    } catch {
      signOut()
      throw new axios.Cancel('session expired')
    }
  }
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

client.interceptors.response.use(
  (response) => response,
  async (error) => {
    if (axios.isCancel(error)) return Promise.reject(error)
    const original = error.config
    // Still possible (clock skew, token revoked): refresh once and retry
    if (error.response?.status === 401 && !original._retry) {
      original._retry = true
      if (!useAuthStore.getState().refreshToken) {
        signOut()
        return Promise.reject(error)
      }
      try {
        const newAccess = await refreshAccess()
        original.headers.Authorization = `Bearer ${newAccess}`
        return client(original)
      } catch (refreshError) {
        signOut()
        return Promise.reject(refreshError)
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
