import { useEffect, useState } from 'react'
import { hush, say } from '../voice'
import { between, pickSome } from './random'
import { Tiles } from './Tiles'
import { ROUND_SIZE, type CountEggsLesson, type EggQuestion } from './types'

// "Count the eggs": a nest of eggs to touch one at a time. Each egg touched shows its number and the
// dinosaur says it aloud. With them all counted, the eggs tuck themselves away to one side and the
// dinosaur asks for that number, shown among a few others on big tiles.

/** The questions for one round at one level. Each has a different number of eggs. */
export function countEggsQuestions(level: CountEggsLesson['levels'][number]): EggQuestion[] {
  return pickSome(between(...level.eggs), ROUND_SIZE).map((count) => ({
    kind: 'eggs',
    count,
    // Wrong tiles that are close, so he has to count properly and cannot just guess a far-off number.
    others: pickSome(
      between(Math.max(1, count - 3), Math.min(20, count + 3)).filter((other) => other !== count),
      2
    ),
    yes: `yes-${count}`
  }))
}

/**
 * How the nest is laid out: one row up to five eggs, then two rows of five up to ten, then two rows
 * of ten up to twenty, with smaller eggs as the count grows. Tucked away it is no taller than the
 * tiles beside it: up to ten eggs in two rows, and more in three.
 */
function nestShape(count: number, tucked: boolean): { columns: number; egg: number } {
  if (!tucked) return count <= 5 ? { columns: count, egg: 12 } : count <= 10 ? { columns: 5, egg: 11 } : { columns: 10, egg: 8 }
  if (count <= 4) return { columns: count, egg: 6.4 }
  return count <= 10 ? { columns: Math.ceil(count / 2), egg: 6.4 } : { columns: 7, egg: 5 }
}

export function CountEggs({
  dinosaur,
  question,
  locked,
  onRight
}: {
  /** The dinosaur asking, by its folder name. Its voice says the lines. */
  dinosaur: string
  question: EggQuestion
  /** True while the right answer is being celebrated: the speaker must not cut that short. */
  locked: boolean
  onRight: () => void
}) {
  /** The eggs touched so far, in the order they were touched. */
  const [counted, setCounted] = useState<number[]>([])
  /** True once the last number has been said: the tiles come out. */
  const [asking, setAsking] = useState(false)
  const { count } = question
  const allCounted = counted.length >= count
  const { columns, egg: eggSize } = nestShape(count, asking)

  useEffect(() => {
    void say(dinosaur, 'ask')
    return hush
  }, [dinosaur])

  const touch = async (egg: number): Promise<void> => {
    const number = counted.length + 1
    setCounted([...counted, egg])
    const heard = await say(dinosaur, String(number))
    if (number < count) return
    setAsking(true)
    // Cut short, he has either walked off or pressed the speaker, which asks the question itself.
    if (heard) void say(dinosaur, `find-${count}`)
  }

  const wrong = async (lastOne: boolean): Promise<void> => {
    if (lastOne) {
      void say(dinosaur, 'show')
    } else if (await say(dinosaur, 'again')) {
      void say(dinosaur, `find-${count}`)
    }
  }

  return (
    <div className="choices">
      <button
        className="again"
        aria-label="Hear it again"
        disabled={locked}
        onClick={() => void say(dinosaur, allCounted ? `find-${count}` : 'ask')}
      >
        🔊
      </button>
      <div
        className={`nest ${asking ? 'tucked' : ''}`}
        style={{ '--egg': `${eggSize}vh`, '--columns': columns } as React.CSSProperties}
      >
        {Array.from({ length: count }, (_, egg) => {
          const number = counted.indexOf(egg) + 1
          return (
            <button
              key={egg}
              className={`egg ${number ? 'counted' : ''} ${number > 9 ? 'long' : ''}`}
              data-egg={egg}
              disabled={number > 0}
              onClick={() => void touch(egg)}
            >
              {number || ''}
            </button>
          )
        })}
      </div>
      {asking && <Tiles right={count} others={question.others} onWrong={(lastOne) => void wrong(lastOne)} onRight={onRight} />}
    </div>
  )
}
