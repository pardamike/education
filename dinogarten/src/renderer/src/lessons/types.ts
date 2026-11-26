// The lessons a dinosaur can give. Each is written in its dino.json under "lesson",
// and each kind has one screen component beside this file.

/** "Can you find the letter T?", shown among a few other letters. */
export interface FindLetterLesson {
  type: 'find-letter'
  letter: string
  others: string[]
}

/** "Can you count my eggs?": the player counts them one by one, then finds that number among a few others. */
export interface CountEggsLesson {
  type: 'count-eggs'
  /** How many eggs are in the nest, from 1 to 20. */
  count: number
  others: number[]
}

export type Lesson = FindLetterLesson | CountEggsLesson
