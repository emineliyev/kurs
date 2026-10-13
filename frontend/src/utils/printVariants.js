/**
 * Printable test variants (A, B, C, D) with answer keys.
 *
 * - Variant A keeps the test's own order; the others are shuffled.
 * - Shuffling is seeded by test id + variant, so reprinting gives the same B/C/D
 *   and an answer key printed earlier stays valid.
 * - A passage stays first in its block with the questions that follow it.
 * - Text multiple-choice answers are shuffled too; image_mcq choices are printed
 *   inside the image, and true/false keeps its natural order.
 */

export const VARIANT_LETTERS = ['A', 'B', 'C', 'D']
export const CHOICE_LETTERS = ['A', 'B', 'C', 'D', 'E', 'F']

const SHUFFLE_ANSWER_TYPES = ['multiple_choice', 'mcq']
const CHOICE_TYPES = ['multiple_choice', 'mcq', 'true_false', 'image_mcq']

// Small deterministic PRNG (mulberry32) seeded from a string
function seededRandom(seedText) {
  let h = 1779033703 ^ seedText.length
  for (let i = 0; i < seedText.length; i++) {
    h = Math.imul(h ^ seedText.charCodeAt(i), 3432918353)
    h = (h << 13) | (h >>> 19)
  }
  let a = h >>> 0
  return () => {
    a |= 0; a = (a + 0x6D2B79F5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function shuffle(list, rand) {
  const out = [...list]
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1))
    ;[out[i], out[j]] = [out[j], out[i]]
  }
  return out
}

// Passage + its questions form one block; other questions are single blocks
function toBlocks(questions) {
  const blocks = []
  let current = null
  for (const q of questions) {
    if (q.question_type === 'passage') {
      current = [q]
      blocks.push(current)
    } else if (current) {
      current.push(q)
    } else {
      blocks.push([q])
    }
  }
  return blocks
}

function correctKey(q, answers) {
  if (CHOICE_TYPES.includes(q.question_type)) {
    const i = answers.findIndex((a) => a.is_correct)
    return i >= 0 ? CHOICE_LETTERS[i] : '—'
  }
  if (q.question_type === 'short_answer' || q.question_type === 'numeric') return q.correct_answer || '—'
  return null // graded by the teacher (open / long answer)
}

/**
 * @returns [{ letter, items: [{ question, number|null, answers, key }], key: [{ number, key }] }]
 */
export function buildVariants(questions, count, seed) {
  const ordered = [...questions].sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
  return VARIANT_LETTERS.slice(0, count).map((letter, v) => {
    const rand = seededRandom(`${seed}:${letter}`)
    let sequence = ordered
    if (v > 0) {
      const blocks = toBlocks(ordered).map((block) =>
        block[0].question_type === 'passage' ? [block[0], ...shuffle(block.slice(1), rand)] : block)
      sequence = shuffle(blocks, rand).flat()
    }
    let n = 0
    const items = sequence.map((q) => {
      const base = q.answers || []
      const answers = v > 0 && SHUFFLE_ANSWER_TYPES.includes(q.question_type) ? shuffle(base, rand) : base
      const number = q.question_type === 'passage' ? null : ++n
      return { question: q, number, answers, key: number ? correctKey(q, answers) : null }
    })
    return { letter, items, key: items.filter((i) => i.number).map((i) => ({ number: i.number, key: i.key })) }
  })
}
