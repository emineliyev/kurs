// Listening blocks: what the browser checks before an audio file is uploaded.
// The server checks the file's real content again — this is only for a quick, friendly answer.

export const AUDIO_MAX_MB = 15
export const AUDIO_ACCEPT = 'audio/mpeg,audio/mp4,audio/x-m4a,audio/aac,audio/ogg,audio/wav,audio/x-wav,.mp3,.m4a,.aac,.ogg,.oga,.opus,.wav'
const AUDIO_EXT = /\.(mp3|m4a|aac|ogg|oga|opus|wav)$/i
const VIDEO_EXT = /\.(mp4|mov|avi|mkv|webm|wmv|3gp|flv|m4v)$/i

/** "1:05" */
export const fmtDuration = (sec) => {
  if (!Number.isFinite(sec)) return ''
  const s = Math.round(sec)
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}

/**
 * Resolves with { duration } for a playable audio file; rejects with an i18n key
 * (teacher namespace) telling the teacher what is wrong — e.g. that a video was picked.
 */
export function checkAudioFile(file) {
  if (file.type.startsWith('video/') || VIDEO_EXT.test(file.name)) return Promise.reject('audio_err_video')
  if (!(file.type.startsWith('audio/') || AUDIO_EXT.test(file.name))) return Promise.reject('audio_err_type')
  if (file.size > AUDIO_MAX_MB * 1024 * 1024) return Promise.reject('audio_err_size')
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file)
    const el = new Audio()
    const done = (fn) => { URL.revokeObjectURL(url); fn() }
    el.preload = 'metadata'
    el.onloadedmetadata = () => done(() => resolve({ duration: el.duration }))
    el.onerror = () => done(() => reject('audio_err_unplayable'))
    el.src = url
  })
}
