import { useEffect, useState } from 'react'
import { noticesApi } from '@/api/notices'

// One poll for the whole page: the sidebar and the bottom bar share it.
const POLL_MS = 150000          // every 2.5 minutes — notices aren't a chat
let count = 0
let timer = null
const listeners = new Set()

function set(n) {
  count = n
  listeners.forEach((fn) => fn(n))
}

export function refreshUnreadNotices() {
  if (document.visibilityState !== 'visible') return
  noticesApi.unread().then((r) => set(r.data.count || 0)).catch(() => {})
}

const onVisible = () => refreshUnreadNotices()

/** The student's unread notices (the badge). */
export function useUnreadNotices() {
  const [n, setN] = useState(count)
  useEffect(() => {
    listeners.add(setN)
    if (listeners.size === 1) {
      refreshUnreadNotices()
      timer = setInterval(refreshUnreadNotices, POLL_MS)
      document.addEventListener('visibilitychange', onVisible)
    }
    return () => {
      listeners.delete(setN)
      if (listeners.size === 0) {
        clearInterval(timer)
        document.removeEventListener('visibilitychange', onVisible)
      }
    }
  }, [])
  return n
}

/** After the inbox marks everything read. */
export const clearUnreadNotices = () => set(0)
