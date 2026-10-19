// Google Identity Services, shared by the login and sign-up pages: the script loads once and
// initialize() runs once (calling it again makes GSI warn); the callback always reaches the page
// that's open now.
const GSI_SRC = 'https://accounts.google.com/gsi/client'
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

export async function renderGoogleButton(container, clientId, callback, options) {
  onCredential = callback
  await loadScript()
  if (!container?.isConnected) return
  if (initializedFor !== clientId) {
    window.google.accounts.id.initialize({ client_id: clientId, callback: (response) => onCredential?.(response) })
    initializedFor = clientId
  }
  window.google.accounts.id.renderButton(container, options)
}
