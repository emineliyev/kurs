// Google Identity Services, shared by the login and sign-up pages: the script loads once and
// initialize() runs once (calling it again makes GSI warn); the callback always reaches the page
// that's open now.
//
// Phones and tablets use redirect mode: the popup GSI opens there is a separate tab that the phone
// may reload when the user steps away (to read a code) — Chrome then asks to "confirm form
// resubmission". In redirect mode the whole page goes to Google and Google posts back to our server
// (/api/auth/google/redirect/), which returns to /auth/google with a one-time code.
const GSI_SRC = 'https://accounts.google.com/gsi/client'
export const GOOGLE_INTENT_KEY = 'google-intent'   // 'login' | 'register': which message to show back
let loading = null
let initializedFor = null
let onCredential = null

function loadScript() {
  if (window.google?.accounts?.id) return Promise.resolve()
  if (!loading) {
    loading = new Promise((resolve, reject) => {
      const script = document.createElement('script')
      script.src = GSI_SRC
      script.async = true
      script.defer = true
      script.onload = resolve
      script.onerror = () => { loading = null; reject(new Error('gsi')) }
      document.head.appendChild(script)
    })
  }
  return loading
}

export const useRedirectSignIn = () => window.matchMedia?.('(pointer: coarse)').matches ?? false

export async function renderGoogleButton(container, clientId, callback, options, intent = 'login') {
  onCredential = callback
  try { sessionStorage.setItem(GOOGLE_INTENT_KEY, intent) } catch { /* private mode */ }
  await loadScript()
  if (!container?.isConnected) return
  if (initializedFor !== clientId) {
    const redirect = useRedirectSignIn()
    window.google.accounts.id.initialize({
      client_id: clientId,
      ...(redirect
        ? { ux_mode: 'redirect', login_uri: `${window.location.origin}/api/auth/google/redirect/` }
        : { callback: (response) => onCredential?.(response) }),
    })
    initializedFor = clientId
  }
  window.google.accounts.id.renderButton(container, options)
}
