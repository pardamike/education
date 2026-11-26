import { pickSome } from './random'
import { ROUND_SIZE, type PickQuestion, type WhatNextLesson } from './types'

// "What comes next?": the letters just before a letter are shown on small cards, then an empty card
// with a question mark, and the dinosaur asks which letter comes next. The questions are played by
// PickTile. The clips are named for the answer: ask-D says "A, B, C. What comes next?".

const ALPHABET = [...'ABCDEFGHIJKLMNOPQRSTUVWXYZ']

/** How many letters before the answer are shown, at the most. */
const SHOWN = 3

/** The questions for one round at one level. Each asks for a different letter, never A. */
export function whatNextQuestions(level: WhatNextLesson['levels'][number]): PickQuestion[] {
  const letters = [...level.letters]
  return pickSome(
    letters.filter((letter) => letter !== 'A'),
    ROUND_SIZE
  ).map((letter) => {
    // The letters just before it come from the whole alphabet, so H shows "E F G".
    const at = ALPHABET.indexOf(letter)
    const sequence = ALPHABET.slice(Math.max(0, at - SHOWN), at)
    // Wrong tiles come from the level. The letters already on the cards are left out when there are
    // enough others, because they could not come next.
    const others = letters.filter((other) => other !== letter)
    const fresh = others.filter((other) => !sequence.includes(other))
    return {
      kind: 'pick',
      right: letter,
      others: pickSome(fresh.length >= 2 ? fresh : others, 2),
      sequence,
      ask: `ask-${letter}`,
      yes: `yes-${letter}`
    }
  })
}
