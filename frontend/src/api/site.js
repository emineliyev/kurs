import { useEffect, useState } from 'react'

// Public, admin-editable contact details + footer links. Fetched once per page load.
const EMPTY = { whatsapp_number: '', contact_email: '', youtube_url: '', pages: [] }
let settingsPromise = null

export function fetchSiteSettings() {
  if (!settingsPromise) {
    settingsPromise = fetch('/api/site/settings/')
      .then((r) => (r.ok ? r.json() : EMPTY))
      .catch(() => EMPTY)
  }
  return settingsPromise
}

export function useSiteSettings() {
  const [settings, setSettings] = useState(EMPTY)
  useEffect(() => {
    let alive = true
    fetchSiteSettings().then((data) => alive && setSettings({ ...EMPTY, ...data }))
    return () => { alive = false }
  }, [])
  return settings
}

export async function fetchLegalPage(slug, lang) {
  const r = await fetch(`/api/site/pages/${encodeURIComponent(slug)}/?lang=${encodeURIComponent(lang || 'az')}`)
  if (r.status === 404) return null
  if (!r.ok) throw new Error(`HTTP ${r.status}`)
  return r.json()
}
