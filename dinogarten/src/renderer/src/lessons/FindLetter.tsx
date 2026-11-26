import { pickSome, shuffled } from './random'
import { ROUND_SIZE, type FindLetterLesson, type PickQuestion } from './types'

// "Find the letter": the dinosaur asks for one letter and shows it among two others, each on a big
// tile. The questions are played by PickTile. The clips are named for the letter: ask-T and yes-T.

/** The questions for one round at one level. Each asks for a different letter. */
export function findLetterQuestions(level: FindLetterLesson['levels'][number]): PickQuestion[] {
  const letters = [...level.letters]
  const shown = (letter: string): string => (level.small ? letter.toLowerCase() : letter)
  return pickSome(letters, ROUND_SIZE).map((letter) => ({
    kind: 'pick',
    right: shown(letter),
    others: pickSome(
      letters.filter((other) => other !== letter),
      2
    ).map(shown),
    // Small letters on the tiles: the big capital is what he matches them to.
    ...(level.small ? { prompt: letter } : {}),
    ask: `ask-${letter}`,
    yes: `yes-${letter}`
  }))
}
