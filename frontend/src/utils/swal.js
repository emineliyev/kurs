import Swal from 'sweetalert2'

/**
 * SweetAlert2 styled like the platform: our buttons, card, typography and icon colours.
 * Use exactly like Swal: `import Swal from '@/utils/swal'; Swal.fire({...})`.
 * `confirmButtonColor` is still accepted and mapped to a button style (red → danger).
 */
const DANGER  = ['#ef4444', '#dc2626', '#b91c1c']
const WARNING = ['#f59e0b', '#d97706']

const baseClass = {
  container:     'kurs-swal-container',
  popup:         'kurs-swal',
  title:         'kurs-swal-title',
  htmlContainer: 'kurs-swal-text',
  actions:       'kurs-swal-actions',
  confirmButton: 'btn-primary',
  cancelButton:  'btn-secondary',
  denyButton:    'btn-danger',
}

function confirmClass(color) {
  const c = (color || '').toLowerCase()
  if (DANGER.includes(c)) return 'btn-danger'
  if (WARNING.includes(c)) return 'btn-warning'
  return 'btn-primary'
}

function fire(...args) {
  if (args.length === 1 && args[0] && typeof args[0] === 'object') {
    const { confirmButtonColor, customClass, ...rest } = args[0]
    return Swal.fire({
      buttonsStyling: false,
      ...rest,
      customClass: { ...baseClass, confirmButton: confirmClass(confirmButtonColor), ...customClass },
    })
  }
  // Swal.fire(title, text, icon)
  const [title, text, icon] = args
  return fire({ title, text, icon })
}

export default { ...Swal, fire, close: Swal.close, isVisible: Swal.isVisible }
