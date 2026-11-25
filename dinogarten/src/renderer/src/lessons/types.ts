// The lessons a dinosaur can give. A dinosaur names one in its dino.json, under "lesson".

/** "Find the letter": the dinosaur asks for one letter, shown among a few others. */
export interface FindLetterLesson {
  type: 'find-letter'
  /** The capital letter to find. */
  letter: string
  /** The other letters shown beside it. Pick ones that look nothing like it, for an easy start. */
  others: string[]
}

export type Lesson = FindLetterLesson
