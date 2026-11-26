import { between, pickSome } from './random'
import { ROUND_SIZE, type FindNumberLesson, type PickQuestion } from './types'

// "Find the number": the same as finding a letter, with numbers. The questions are played by
// PickTile. The clips are named for the number: ask-7 and yes-7.

/** The questions for one round at one level. Each asks for a different number. */
export function findNumberQuestions(level: FindNumberLesson['levels'][number]): PickQuestion[] {
  const numbers = between(...level.numbers)
  return pickSome(numbers, ROUND_SIZE).map((number) => ({
    kind: 'pick',
    right: number,
    others: pickSome(
      numbers.filter((other) => other !== number),
      2
    ),
    ask: `ask-${number}`,
    yes: `yes-${number}`
  }))
}
