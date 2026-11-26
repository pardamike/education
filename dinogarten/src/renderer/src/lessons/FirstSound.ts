import { pickSome, shuffled } from './random'
import { ROUND_SIZE, type FirstSoundLesson, type PickQuestion } from './types'

// "First sounds": the dinosaur says a word, its picture is shown, and the player picks the letter
// it starts with. The questions are played by PickTile. The clips are named for the word:
// ask-sun and yes-sun.

/** Letters that make the same sound. Offering both would be a trick question, so they never meet. */
const SAME_SOUND: Record<string, string> = { C: 'K', K: 'C' }

/** Two wrong letters for a tile row, not the right one and never a pair that sounds the same. */
function twoOthers(letters: string[], right: string): string[] {
  const options = letters.filter((other) => other !== right && other !== SAME_SOUND[right])
  const [first, second] = pickSome(options, 2)
  if (first !== undefined && second !== undefined && SAME_SOUND[first] === second) {
    // C and K came up together: swap one for another letter when there is one.
    const spare = options.find((other) => other !== first && other !== second && other !== SAME_SOUND[first])
    if (spare) return [first, spare]
  }
  return [first, second].filter((letter): letter is string => letter !== undefined)
}

/** The questions for one round at one level. Each asks about a different word, and the first letters differ where the level allows. */
export function firstSoundQuestions(level: FirstSoundLesson['levels'][number]): PickQuestion[] {
  const first = (word: string): string => word[0]!.toUpperCase()
  const letters = [...new Set(level.words.map(first))]
  // Words with a new first letter come first, and the rest only fill in if the level has too few letters.
  const chosen: string[] = []
  for (const word of shuffled(level.words)) {
    if (chosen.length < ROUND_SIZE && !chosen.some((other) => first(other) === first(word))) chosen.push(word)
  }
  for (const word of shuffled(level.words)) {
    if (chosen.length < ROUND_SIZE && !chosen.includes(word)) chosen.push(word)
  }
  return chosen.map((word) => {
    const letter = first(word)
    return {
      kind: 'pick',
      right: letter,
      others: twoOthers(letters, letter),
      picture: word,
      ask: `ask-${word}`,
      yes: `yes-${word}`
    }
  })
}
