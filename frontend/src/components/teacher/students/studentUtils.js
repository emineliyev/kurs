// Shared helpers for adding students: usernames, easy passwords, the pasted list

export const USERNAME_RE = /^[a-z0-9._]{3,50}$/
const TRANSLIT = { ə: 'e', ı: 'i', i̇: 'i', ö: 'o', ü: 'u', ş: 's', ç: 'c', ğ: 'g' }
const toLatin = (s) => (s || '').toLocaleLowerCase('az').replace(/[əıöüşçğ]|i̇/g, (c) => TRANSLIT[c] || c)

// "Məmməd Əli" + "Quliyev" → "memmed.quliyev"
export function suggestUsername(first, last) {
  const clean = (s) => toLatin((s || '').trim().split(/\s+/)[0]).replace(/[^a-z0-9]/g, '')
  return [clean(first), clean(last)].filter(Boolean).join('.').slice(0, 50)
}

// Easy to read and type, still meets the strong-password rules — same shape as the server's: "Aysel.4827"
export function friendlyPassword(firstName = '') {
  let word = toLatin(firstName).replace(/[^a-z]/g, '').slice(0, 8)
  if (word.length < 3) word = 'kursum'
  const n = 1000 + (crypto.getRandomValues(new Uint32Array(1))[0] % 9000)
  return `${word[0].toUpperCase()}${word.slice(1)}.${n}`
}

/** Make every username unique against `taken` (lower-case set) and within the list: ali, ali2, ali3… */
export function dedupeUsernames(names, taken = new Set()) {
  const used = new Set(taken)
  return names.map((base) => {
    const root = (base || 'sagird').slice(0, 46)
    let name = root, n = 1
    while (used.has(name)) name = `${root}${++n}`
    used.add(name)
    return name
  })
}

/**
 * A pasted list → [{ first_name, last_name }]. One student per line; "First Last…",
 * "Last, First" or two columns from Excel (tab). Numbering like "1." / "1)" is dropped.
 */
export function parseNames(text) {
  return (text || '').split(/\r?\n/).map((line) => line.replace(/^\s*\d+\s*[.)\-]\s*/, '').trim())
    .filter(Boolean)
    .map((line) => {
      if (line.includes('\t')) {
        const [a, b = ''] = line.split('\t').map((s) => s.trim())
        return { first_name: a, last_name: b }
      }
      if (line.includes(',')) {
        const [last, first = ''] = line.split(',').map((s) => s.trim())
        return { first_name: first, last_name: last }
      }
      const parts = line.split(/\s+/)
      return { first_name: parts[0], last_name: parts.slice(1).join(' ') }
    })
    .filter((r) => r.first_name)
}
