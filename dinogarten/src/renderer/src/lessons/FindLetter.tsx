import { useEffect, useState } from 'react'
import { hush, say } from '../voice'
import type { FindLetterLesson } from './types'

// "Find the letter": the dinosaur asks for one letter and shows it among a few others, each on a
// big tile. There is no way to fail. A wrong tile fades away with a "try again", and when only the
// right one is left the dinosaur points it out.

function shuffled<T>(items: T[]): T[] {
  const result = [...items]
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[result[i], result[j]] = [result[j]!, result[i]!]
  }
  return result
}

/** Where the stars fly to when the right tile is found: [across, up], in tile widths. */
const STARS: Array<[number, number]> = [
  [-0.9, -0.9],
  [-0.4, -1.3],
  [0.1, -1.1],
  [0.6, -1.35],
  [1, -0.85]
]

export function FindLetter({
  dinosaur,
  lesson,
  onRight
}: {
  /** The dinosaur asking, by its folder name. Its voice says the lines. */
  dinosaur: string
  lesson: FindLetterLesson
  onRight: () => void
}) {
  // The order is mixed up once and then kept, so tiles do not jump about mid-lesson.
  const [letters] = useState(() => shuffled([lesson.letter, ...lesson.others]))
  const [tried, setTried] = useState<string[]>([])
  const [found, setFound] = useState(false)
  // With every wrong letter tried, only the right one is left, and it is pointed out.
  const pointedOut = !found && tried.length >= lesson.others.length

  useEffect(() => {
    void say(dinosaur, 'ask')
    return hush
  }, [dinosaur])

  const pick = (letter: string): void => {
    if (found) return
    if (letter === lesson.letter) {
      setFound(true)
      onRight()
      void say(dinosaur, 'yes')
      return
    }
    const nowTried = [...tried, letter]
    setTried(nowTried)
    void say(dinosaur, nowTried.length >= lesson.others.length ? 'show' : 'again')
  }

  return (
    <div className="letters">
      <button className="again" aria-label="Hear it again" onClick={() => void say(dinosaur, found ? 'yes' : 'ask')}>
        🔊
      </button>
      {letters.map((letter, place) => {
        const right = letter === lesson.letter
        const state = right ? (found ? 'found' : pointedOut ? 'pointed-out' : '') : tried.includes(letter) ? 'tried' : ''
        return (
          <button
            key={letter}
            className={`tile tile-${place % 3} ${state}`}
            data-letter={letter}
            disabled={!right && (tried.includes(letter) || found)}
            onClick={() => pick(letter)}
          >
            {letter}
            {right &&
              found &&
              STARS.map(([across, up], i) => (
                <span
                  key={i}
                  className="star"
                  style={{ '--across': across, '--up': up, animationDelay: `${i * 70}ms` } as React.CSSProperties}
                >
                  ⭐
                </span>
              ))}
          </button>
        )
      })}
    </div>
  )
}
