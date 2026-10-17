import { useEffect, useState } from 'react'

// The browser's install offer arrives once, early — keep it until the teacher/student clicks "Install"
let deferredPrompt = null
const listeners = new Set()
const notify = () => listeners.forEach((fn) => fn())

export const isStandalone = () =>
  window.matchMedia?.('(display-mode: standalone)').matches || window.navigator.standalone === true

// iPhone / iPad Safari has no install prompt — it needs "Share → Add to Home Screen"
export const isIos = () =>
  /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)

export function initPwa() {
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault()
    deferredPrompt = e
    notify()
  })
  window.addEventListener('appinstalled', () => {
    deferredPrompt = null
    notify()
  })
  // Production only: no worker during development (Vite serves fresh modules)
  if (import.meta.env.PROD && 'serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('/sw.js', { scope: '/' })
        .then((reg) => setInterval(() => reg.update().catch(() => {}), 60 * 60 * 1000))
        .catch(() => {})
    })
  }
}

/** { canInstall, iosHint, install } — iosHint: show the "Add to Home Screen" steps instead. */
export function usePwaInstall() {
  const [, force] = useState(0)
  useEffect(() => {
    const fn = () => force((n) => n + 1)
    listeners.add(fn)
    return () => listeners.delete(fn)
  }, [])
  const installed = isStandalone()
  return {
    canInstall: !installed && !!deferredPrompt,
    iosHint: !installed && !deferredPrompt && isIos(),
    install: async () => {
      if (!deferredPrompt) return false
      deferredPrompt.prompt()
      const { outcome } = await deferredPrompt.userChoice
      deferredPrompt = null
      notify()
      return outcome === 'accepted'
    },
  }
}

/** true while the device has no connection */
export function useOffline() {
  const [offline, setOffline] = useState(typeof navigator !== 'undefined' && navigator.onLine === false)
  useEffect(() => {
    const on = () => setOffline(false)
    const off = () => setOffline(true)
    window.addEventListener('online', on)
    window.addEventListener('offline', off)
    return () => { window.removeEventListener('online', on); window.removeEventListener('offline', off) }
  }, [])
  return offline
}
