import { useState } from 'react'
import { shuffled } from './random'

// A row of big tiles to choose from, one of them right. Every game uses them.
// There is no way to fail: a wrong tile fades away, and once only the right one is left it glows.

/** Where the stars fly to when the right tile is found: [across, up], in tile widths. */
const STARS: Array<[number, number]> = [
  [-0.9, -0.9],
  [-0.4, -1.3],
  [0.1, -1.1],
  [0.6, -1.35],
  [1, -0.85]
]

export function Tiles<Choice extends string | number>({
  right,
  others,
  onWrong,
  onRight
}: {
  right: Choice
  others: Choice[]
  /** A wrong tile was picked. `lastOne` is true when that leaves only the right tile. */
  onWrong: (lastOne: boolean) => void
  onRight: () => void
}) {
  // The order is mixed up once and then kept, so tiles do not jump about mid-lesson.
  const [choices] = useState(() => shuffled([right, ...others]))
  const [tried, setTried] = useState<Choice[]>([])
  const [found, setFound] = useState(false)
  // With every wrong tile tried, only the right one is left, and it is pointed out.
  const pointedOut = !found && tried.length >= others.length

  const pick = (choice: Choice): void => {
    if (found) return
    if (choice === right) {
      setFound(true)
      onRight()
      return
    }
    setTried([...tried, choice])
    onWrong(tried.length + 1 >= others.length)
  }

  return (
    <>
      {choices.map((choice, place) => {
        const isRight = choice === right
        const state = isRight ? (found ? 'found' : pointedOut ? 'pointed-out' : '') : tried.includes(choice) ? 'tried' : ''
        return (
          <button
            key={choice}
            className={`tile tile-${place % 3} ${String(choice).length > 1 ? 'long' : ''} ${state}`}
            data-choice={choice}
            disabled={!isRight && (tried.includes(choice) || found)}
            onClick={() => pick(choice)}
          >
            {choice}
            {isRight &&
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
    </>
  )
}
