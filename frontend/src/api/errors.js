import toast from 'react-hot-toast'
import i18n from '@/i18n'

/**
 * Readable messages from an API error.
 * The backend responds with { errors: [{ field, message }], ...original DRF data }.
 */
export function apiErrorMessages(err, fallback) {
  const data = err?.response?.data
  if (Array.isArray(data?.errors) && data.errors.length) {
    return [...new Set(data.errors.map((e) => e.message).filter(Boolean))]
  }
  if (data?.detail) return [String(data.detail)]
  if (data && typeof data === 'object') {
    const msgs = Object.values(data).flat()
      .map((m) => (m && typeof m === 'object' ? m.message : m))
      .filter(Boolean).map(String)
    if (msgs.length) return msgs
  }
  return [fallback || i18n.t('error_occurred')]
}

export function toastApiError(err, fallback) {
  apiErrorMessages(err, fallback).forEach((m) => toast.error(m))
}
