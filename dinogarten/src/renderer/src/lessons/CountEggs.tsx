import { useEffect, useState } from 'react'
import { hush, say } from '../voice'
import { Tiles } from './Tiles'
import type { CountEggsLesson } from './types'

// "Count the eggs": a nest of eggs to touch one at a time. Each egg touched shows its number and the
// dinosaur says it aloud. With them all counted, the eggs tuck themselves away to one side and the
// dinosaur asks for that number, shown among a few others on big tiles.

export function CountEggs({
  dinosaur,
  lesson,
  onRight
}: {
  /** The dinosaur asking, by its folder name. Its voice says the lines. */
  dinosaur: string
  lesson: CountEggsLesson
  onRight: () => void
}) {
  /** The eggs touched so far, in the order they were touched. */
  const [counted, setCounted] = useState<number[]>([])
  /** True once the last number has been said: the tiles come out. */
  const [asking, setAsking] = useState(false)
  const [found, setFound] = useState(false)
  const allCounted = counted.length >= lesson.count

  useEffect(() => {
    void say(dinosaur, 'ask')
    return hush
  }, [dinosaur])

  const count = async (egg: number): Promise<void> => {
    const number = counted.length + 1
    setCounted([...counted, egg])
    const heard = await say(dinosaur, String(number))
    if (number < lesson.count) return
    setAsking(true)
    // Cut short, he has either walked off or pressed the speaker, which asks the question itself.
    if (heard) void say(dinosaur, 'find')
  }

  return (
    <div className="choices">
      <button
        className="again"
        aria-label="Hear it again"
        onClick={() => void say(dinosaur, found ? 'yes' : allCounted ? 'find' : 'ask')}
      >
        🔊
      </button>
      <div className={`nest ${asking ? 'tucked' : ''}`}>
        {Array.from({ length: lesson.count }, (_, egg) => {
          const number = counted.indexOf(egg) + 1
          return (
            <button
              key={egg}
              className={`egg ${number ? 'counted' : ''}`}
              data-egg={egg}
              disabled={number > 0}
              onClick={() => void count(egg)}
            >
              {number || ''}
            </button>
          )
        })}
      </div>
      {asking && (
        <Tiles
          right={lesson.count}
          others={lesson.others}
          onWrong={(lastOne) => void say(dinosaur, lastOne ? 'show' : 'again')}
          onRight={() => {
            setFound(true)
            void say(dinosaur, 'yes')
            onRight()
          }}
        />
      )}
    </div>
  )
}
