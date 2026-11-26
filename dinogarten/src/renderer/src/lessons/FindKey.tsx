import { useEffect, useRef, useState } from 'react'
import { hush, say } from '../voice'
import { Keyboard, type KeyMark } from './Keyboard'
import { pickSome } from './random'
import { ROUND_SIZE, type FindKeyLesson, type KeyQuestion } from './types'

// "Find the key": the dinosaur asks for one letter or number, shown on a big card, and the player
// presses it on the real keyboard. A picture of the keyboard shows what was pressed. A wrong key
// shakes, and the dinosaur says what it was and asks again. After two wrong ones the right key glows.
// The clips are named for the key: ask-T, yes-T, and is-G for a key pressed by mistake.

/** How many wrong keys it takes before the right one starts to glow. */
const WRONG_BEFORE_GLOW = 2

/** How long a wrong key shakes, in milliseconds. */
const SHAKE_MS = 450

/** The questions for one round at one level. Each asks for a different key. */
export function findKeyQuestions(level: FindKeyLesson['levels'][number]): KeyQuestion[] {
  return pickSome([...new Set(level.keys.toUpperCase().split(''))], ROUND_SIZE).map((key) => ({
    kind: 'key',
    key,
    ask: `ask-${key}`,
    yes: `yes-${key}`
  }))
}

export function FindKey({
  dinosaur,
  question,
  locked,
  onRight
}: {
  /** The dinosaur asking, by its folder name. Its voice says the lines. */
  dinosaur: string
  question: KeyQuestion
  /** True while the right answer is being celebrated: the speaker must not cut that short. */
  locked: boolean
  onRight: () => void
}) {
  const { key } = question
  const [wrongs, setWrongs] = useState(0)
  /** The wrong key that is shaking right now, if any. */
  const [shaking, setShaking] = useState<string | null>(null)
  const [found, setFound] = useState(false)
  const timer = useRef(0)

  useEffect(() => {
    void say(dinosaur, question.ask)
    return () => {
      hush()
      window.clearTimeout(timer.current)
    }
  }, [dinosaur, question.ask])

  const pressed = async (pressedKey: string): Promise<void> => {
    if (found || locked) return
    if (pressedKey === key) {
      setFound(true)
      onRight()
      return
    }
    const count = wrongs + 1
    setWrongs(count)
    setShaking(pressedKey)
    window.clearTimeout(timer.current)
    timer.current = window.setTimeout(() => setShaking(null), SHAKE_MS)
    // Said to the end, it goes on to ask again. Cut short, he has walked off or pressed something else.
    if (!(await say(dinosaur, `is-${pressedKey}`))) return
    void say(dinosaur, count === WRONG_BEFORE_GLOW ? 'show' : question.ask)
  }

  const marks: Partial<Record<string, KeyMark>> = {}
  if (shaking) marks[shaking] = 'wrong'
  if (found) marks[key] = 'right'
  else if (wrongs >= WRONG_BEFORE_GLOW) marks[key] = 'glow'

  const isLetter = /[A-Z]/.test(key)
  return (
    <div className="choices">
      <button className="again" aria-label="Hear it again" disabled={locked} onClick={() => void say(dinosaur, question.ask)}>
        🔊
      </button>
      <div className="key-card" data-target={key}>
        {key}
        {isLetter && <span className="key-small">{key.toLowerCase()}</span>}
      </div>
      <Keyboard marks={marks} disabled={locked || found} onKey={(pressedKey) => void pressed(pressedKey)} />
    </div>
  )
}
