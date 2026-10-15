import { lazy } from 'react'

// After a deploy the page files get new names; a tab opened before it still asks for the old
// ones, which no longer exist. Reload once to pick up the new version instead of a white page.
const KEY = 'kursum-reloaded-for-new-version'

export function reloadForNewVersion() {
  const last = Number(sessionStorage.getItem(KEY) || 0)
  if (Date.now() - last < 15000) return false  // just reloaded and still failing: don't loop
  sessionStorage.setItem(KEY, String(Date.now()))
  window.location.reload()
  return true
}

/** React.lazy for route pages, reloading once if the chunk is gone (new deploy). */
export const lazyPage = (load) => lazy(() => load().catch((err) => {
  if (reloadForNewVersion()) return new Promise(() => {})  // keep the spinner until the reload
  throw err
}))
