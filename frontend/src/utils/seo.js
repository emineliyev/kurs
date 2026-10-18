import { useEffect } from 'react'

/**
 * <link rel="canonical"> for a public page. index.html is served for every route,
 * so the tag can't live there — each page sets its own (and query variants like
 * /login?as=student or /register?plan=2 point back to the clean address).
 */
export function useCanonical(path) {
  useEffect(() => {
    if (!path) return undefined
    let link = document.head.querySelector('link[rel="canonical"]')
    if (!link) {
      link = document.createElement('link')
      link.rel = 'canonical'
      document.head.appendChild(link)
    }
    link.href = window.location.origin + path
    return () => link.remove()
  }, [path])
}
