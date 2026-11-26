// Shuffling and picking at random, for making questions and for mixing up tiles.

export function shuffled<T>(items: T[]): T[] {
  const result = [...items]
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[result[i], result[j]] = [result[j]!, result[i]!]
  }
  return result
}

/** `count` different items, picked at random. */
export function pickSome<T>(items: T[], count: number): T[] {
  return shuffled(items).slice(0, count)
}

/** Every whole number from `from` to `to`, both included. */
export function between(from: number, to: number): number[] {
  return Array.from({ length: to - from + 1 }, (_, i) => from + i)
}
