// Same rules as apps/tests_app/hints.py — only to preview, in the editor, the sample the student will see
// when the teacher leaves "answer format" empty (the server builds the real one, the key never leaves it).
const LETTERS = 'ABCDEFGH'
const PAIR = /(\d+)(\s*[-–.:)]?\s*)([A-Za-z])/g
const MATCHING = /^\s*(\d+\s*[-–.:)]?\s*[A-Za-z]\s*[,;]?\s*){2,}$/

const squash = (s) => s.replace(/\s+/g, '').toLowerCase()

export function autoAnswerHint(key) {
  const k = (key || '').split('|')[0].trim()   // several accepted answers: the sample follows the first
  if (!MATCHING.test(k)) return ''
  for (let shift = 0; shift < LETTERS.length; shift += 1) {
    let i = -1
    const sample = k.replace(PAIR, (_, n, sep, letter) => {
      i += 1
      const l = LETTERS[(i + shift) % LETTERS.length]
      return n + sep + (letter === letter.toUpperCase() ? l : l.toLowerCase())
    })
    if (squash(sample) !== squash(k)) return sample
  }
  return ''
}
