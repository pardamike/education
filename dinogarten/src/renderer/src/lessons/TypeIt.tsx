import { useEffect, useRef, useState } from 'react'
import { hush, say } from '../voice'
import { Keyboard, type KeyMark } from './Keyboard'
import { pictureOf } from './pictures'
import { between, pickSome } from './random'
import { ROUND_SIZE, type TypeItLesson, type TypeQuestion } from './types'

// "Type it": the dinosaur asks for a short word or a number, shown on a card as a picture (for a
// word) and faint letters to copy. The player types them in order on the real keyboard. Each right
// key fills its slot and the dinosaur says its name. A wrong key shakes, and the dinosaur says
// "try again". After two wrong keys on one slot, the right key glows.
// The clips are named for the word or number: ask-cat, yes-cat, ask-12, yes-12. The names of the
// letters and digits are the clips A to Z and 0 to 9.

/** How many wrong keys on one slot it takes before the right key starts to glow. */
const WRONG_BEFORE_GLOW = 2

/** How long a wrong key shakes, in milliseconds. */
const SHAKE_MS = 450

/** How long a right key stays green while he types on, in milliseconds. */
const GREEN_MS = 500

/** The questions for one round at one level. Each asks for a different word or number. */
export function typeItQuestions(level: TypeItLesson['levels'][number]): TypeQuestion[] {
  const picture = 'words' in level
  const texts = 'words' in level ? level.words : between(...level.numbers).map(String)
  return pickSome(texts, ROUND_SIZE).map((text) => ({
    kind: 'type',
    text,
    picture,
    ask: `ask-${text}`,
    yes: `yes-${text}`
  }))
}

/** Stars flying off a finished slot: [across, up], in key widths. Each slot uses one of them. */
const STARS: Array<[number, number]> = [
  [-1, -1.6],
  [0, -2],
  [1, -1.6],
  [1.8, -1.2]
]

export function TypeIt({
  dinosaur,
  question,
  locked,
  onRight
}: {
  /** The dinosaur asking, by its folder name. Its voice says the lines. */
  dinosaur: string
  question: TypeQuestion
  /** True while the right answer is being celebrated: the speaker must not cut that short. */
  locked: boolean
  onRight: () => void
}) {
  const { text } = question
  const letters = text.toUpperCase().split('')
  /** How many slots are filled. */
  const [typed, setTyped] = useState(0)
  /** Wrong keys on the slot he is on now. */
  const [wrongs, setWrongs] = useState(0)
  /** The wrong key that is shaking right now, and the right key that is still green. */
  const [shaking, setShaking] = useState<string | null>(null)
  const [green, setGreen] = useState<string | null>(null)
  // The same counts, readable at once by keys pressed too fast for a new screen to be drawn.
  const progress = useRef({ typed: 0, wrongs: 0 })
  const shakeTimer = useRef(0)
  const greenTimer = useRef(0)
  /** False once he has walked away: nothing more may be said, and nothing may move on. */
  const here = useRef(true)
  const done = typed === letters.length

  useEffect(() => {
    here.current = true
    void say(dinosaur, question.ask)
    return () => {
      here.current = false
      hush()
      window.clearTimeout(shakeTimer.current)
      window.clearTimeout(greenTimer.current)
    }
  }, [dinosaur, question.ask])

  const pressed = async (key: string): Promise<void> => {
    const now = progress.current
    if (locked || now.typed === letters.length) return
    if (key !== letters[now.typed]) {
      now.wrongs++
      setWrongs(now.wrongs)
      setShaking(key)
      window.clearTimeout(shakeTimer.current)
      shakeTimer.current = window.setTimeout(() => setShaking(null), SHAKE_MS)
      void say(dinosaur, 'again')
      return
    }
    now.typed++
    now.wrongs = 0
    setTyped(now.typed)
    setWrongs(0)
    setGreen(key)
    window.clearTimeout(greenTimer.current)
    greenTimer.current = window.setTimeout(() => setGreen(null), GREEN_MS)
    const last = now.typed === letters.length
    // A new letter cuts the last one off, so typing fast is fine. The last one is heard to the end
    // before the round says "yes!", because that would cut it off.
    const heard = await say(dinosaur, key)
    if (last && heard && here.current) onRight()
  }

  const marks: Partial<Record<string, KeyMark>> = {}
  if (shaking) marks[shaking] = 'wrong'
  if (green) marks[green] = 'right'
  if (!done && wrongs >= WRONG_BEFORE_GLOW) marks[letters[typed]!] = 'glow'

  const picture = question.picture ? pictureOf(text) : undefined
  return (
    <div className="choices">
      <button className="again" aria-label="Hear it again" disabled={locked || done} onClick={() => void say(dinosaur, question.ask)}>
        🔊
      </button>
      <div className="type-card" data-word={text}>
        {picture && <img className="type-picture" src={picture} alt="" draggable={false} />}
        <div className="slots">
          {[...text].map((letter, i) => {
            const [across, up] = STARS[i % STARS.length]!
            return (
              <span
                key={i}
                data-slot={i}
                className={`slot ${i < typed ? 'slot-filled' : i === typed ? 'slot-next' : ''} ${done ? 'slot-done' : ''}`}
              >
                {letter}
                {done && (
                  <span
                    className="star slot-star"
                    style={{ '--across': across, '--up': up, animationDelay: `${i * 70}ms` } as React.CSSProperties}
                  >
                    ⭐
                  </span>
                )}
              </span>
            )
          })}
        </div>
      </div>
      <Keyboard marks={marks} disabled={locked || done} onKey={(key) => void pressed(key)} />
    </div>
  )
}
