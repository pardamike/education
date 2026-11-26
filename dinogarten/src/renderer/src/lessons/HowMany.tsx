import { useEffect, useRef, useState } from 'react'
import { hush, say } from '../voice'
import { pictureOf } from './pictures'
import { between, pickSome } from './random'
import { Tiles } from './Tiles'
import { ROUND_SIZE, type FishQuestion, type HowManyLesson } from './types'

// "How many now?": the dinosaur tells a little story with fish. "I had five fish. I ate three. How
// many do I have now?" Taking away, the eaten fish fade to ghosts, so the player can see what was
// taken. Adding, the new fish pop in. Then the tiles come out. The fish that are left can be
// touched to count them, one by one, just like the eggs, but the tiles work with or without that.

/** How many fish in a row of the pool. */
const PER_ROW = 5

/** The questions for one round at one level. Each is a different sum. */
export function howManyQuestions(level: HowManyLesson['levels'][number]): FishQuestion[] {
  // Every sum the level allows, as [start, amount], so each question in a round is different.
  const sums: Array<[number, number]> = []
  if ('takeAway' in level) {
    for (const start of between(2, level.takeAway)) for (const eaten of between(1, start - 1)) sums.push([start, eaten])
  } else {
    for (const start of between(1, level.add - 1)) for (const caught of between(1, level.add - start)) sums.push([start, caught])
  }
  return pickSome(sums, ROUND_SIZE).map(([start, amount]) => {
    const take = 'takeAway' in level
    const left = take ? start - amount : start + amount
    return {
      kind: 'fish',
      start,
      change: take ? 'ate' : 'more',
      amount,
      left,
      // Wrong tiles that are close, so he has to work it out. A tile never goes below 0 or above 10.
      others: pickSome(
        between(Math.max(0, left - 3), Math.min(10, left + 3)).filter((other) => other !== left),
        2
      ),
      had: `had-${start}`,
      happened: `${take ? 'ate' : 'more'}-${amount}`,
      yes: `yes-${left}`
    }
  })
}

export function HowMany({
  dinosaur,
  question,
  locked,
  onRight
}: {
  /** The dinosaur asking, by its folder name. Its voice says the lines. */
  dinosaur: string
  question: FishQuestion
  /** True while the right answer is being celebrated: the speaker must not cut that short. */
  locked: boolean
  onRight: () => void
}) {
  const { start, change, amount, left } = question
  const taking = change === 'ate'
  const total = taking ? start : start + amount
  /** 0: the fish he started with. 1: the eaten ones are ghosts, or the new ones have come. 2: the tiles are out. */
  const [step, setStep] = useState(0)
  /** True once the story has been told, or cut short by the speaker: only then can the tiles be picked. */
  const [told, setTold] = useState(false)
  /** The fish touched so far, in the order they were touched. */
  const [counted, setCounted] = useState<number[]>([])
  const picture = pictureOf('fish')

  /**
   * Tells the story, each line only if the one before it was heard to the end. With `animate`, the
   * screen moves on with it. The speaker tells it again with nothing moving, since the screen is
   * already at the end by then.
   */
  const tell = async (animate: boolean): Promise<void> => {
    if (!(await say(dinosaur, question.had))) return
    if (animate) setStep(1)
    if (!(await say(dinosaur, question.happened))) return
    if (animate) setStep(2)
    // Cut short, he has either walked off or pressed the speaker, which took over the telling.
    if ((await say(dinosaur, 'now')) && animate) setTold(true)
  }

  useEffect(() => {
    void tell(true)
    return hush
    // The story is told once, when the question appears.
  }, [])

  const again = (): void => {
    setStep(2)
    setTold(true)
    void tell(false)
  }

  const wrong = async (lastOne: boolean): Promise<void> => {
    if (lastOne) {
      void say(dinosaur, 'show')
    } else if (await say(dinosaur, 'again')) {
      void say(dinosaur, 'now')
    }
  }

  const touch = (fish: number): void => {
    setCounted([...counted, fish])
    void say(dinosaur, String(counted.length + 1))
  }

  // Fish he has now are there; eaten ones are ghosts once step 1 is reached; new ones come at step 1.
  const arrived = taking || step >= 1 ? total : start
  const columns = Math.min(total, PER_ROW)
  return (
    <div className="choices">
      <button className="again" aria-label="Hear it again" disabled={locked} onClick={again}>
        🔊
      </button>
      <div className="pool" style={{ '--columns': columns } as React.CSSProperties}>
        {Array.from({ length: total }, (_, fish) => {
          if (fish >= arrived) return <span key={fish} className="fish-slot" />
          const gone = taking && step >= 1 && fish >= left
          // The fish that change do so one after another, counting from the first of them.
          const order = fish - (taking ? left : start)
          const number = counted.indexOf(fish) + 1
          return (
            <button
              key={fish}
              className={`fish ${gone ? 'gone' : ''} ${!taking && fish >= start ? 'arriving' : ''} ${number ? 'counted' : ''}`}
              style={{ '--i': fish, '--n': order } as React.CSSProperties}
              data-fish={fish}
              data-gone={gone ? '' : undefined}
              disabled={gone || number > 0 || !told || locked}
              onClick={() => touch(fish)}
            >
              {picture && <img src={picture} alt="" draggable={false} />}
              {number > 0 && <span className={`fish-number ${number > 9 ? 'long' : ''}`}>{number}</span>}
            </button>
          )
        })}
      </div>
      {step >= 2 && <Tiles right={left} others={question.others} waiting={!told} onWrong={(lastOne) => void wrong(lastOne)} onRight={onRight} />}
    </div>
  )
}
