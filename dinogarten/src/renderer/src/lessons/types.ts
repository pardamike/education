// The lessons a dinosaur can give. Each is written in its dino.json under "lesson": a kind of game,
// and a list of levels that get harder. Each game has one file beside this one that makes its
// questions, and one screen component that plays a single question.

/** "Can you find the letter T?", shown among a few other letters. */
export interface FindLetterLesson {
  type: 'find-letter'
  levels: Array<{
    /** The letters the questions are made from: the one asked for and the wrong tiles. */
    letters: string
    /** Tiles show small letters, with the big capital beside them to match. */
    small?: boolean
  }>
}

/** "Can you find the number 7?", shown among a few other numbers. */
export interface FindNumberLesson {
  type: 'find-number'
  /** Each level takes its numbers from `numbers`: [from, to], both included. */
  levels: Array<{ numbers: [number, number] }>
}

/** "Can you count my eggs?": the player counts them one by one, then finds that number among a few others. */
export interface CountEggsLesson {
  type: 'count-eggs'
  /** Each level has between `eggs[0]` and `eggs[1]` eggs in the nest, both included, from 1 to 20. */
  levels: Array<{ eggs: [number, number] }>
}

/** "Can you press the letter T?": the player finds that key on the real keyboard. */
export interface FindKeyLesson {
  type: 'find-key'
  /** Each level asks for keys from `keys`: letters and digits, written together like "SATPINMD". */
  levels: Array<{ keys: string }>
}

/** "Can you write cat?": the player types a whole short word, or a number, letter by letter. */
export interface TypeItLesson {
  type: 'type-it'
  /** A level has either `words` to choose from (each needs content/pictures/<word>.svg), or `numbers`: [from, to], both included. */
  levels: Array<{ words: string[] } | { numbers: [number, number] }>
}

export type Lesson = FindLetterLesson | FindNumberLesson | CountEggsLesson | FindKeyLesson | TypeItLesson

/** How many questions make up one round. */
export const ROUND_SIZE = 3

/** One question with big tiles: the right one among a few wrong ones. */
export interface PickQuestion {
  kind: 'pick'
  /** What is written on the tiles. */
  right: string | number
  others: Array<string | number>
  /** A big letter shown beside the tiles to match, when the tiles do not give the answer away. */
  prompt?: string
  /** The clip that asks it, and the clip that says "yes!". */
  ask: string
  yes: string
}

/** One question with a nest of eggs to count, then the tiles to find that number. */
export interface EggQuestion {
  kind: 'eggs'
  count: number
  others: number[]
  yes: string
}

/** One question about the keyboard: press this key. */
export interface KeyQuestion {
  kind: 'key'
  /** The key to press: a capital letter or a digit. */
  key: string
  /** The clip that asks it, and the clip that says "yes!". */
  ask: string
  yes: string
}

/** One question about typing: write this word or number. */
export interface TypeQuestion {
  kind: 'type'
  /** What to type: a lowercase word like "cat", or the digits of a number like "12". */
  text: string
  /** Whether a picture of the word goes on the card. A number has none. */
  picture: boolean
  /** The clip that asks it, and the clip that says "yes!". */
  ask: string
  yes: string
}

export type Question = PickQuestion | EggQuestion | KeyQuestion | TypeQuestion
