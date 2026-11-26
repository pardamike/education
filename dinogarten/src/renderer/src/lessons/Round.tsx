import { useEffect, useRef, useState } from 'react'
import { hush, say } from '../voice'
import { CountEggs, countEggsQuestions } from './CountEggs'
import { FindKey, findKeyQuestions } from './FindKey'
import { findLetterQuestions } from './FindLetter'
import { findNumberQuestions } from './FindNumber'
import { PickTile } from './PickTile'
import { TypeIt, typeItQuestions } from './TypeIt'
import { ROUND_SIZE, type Lesson, type Question } from './types'

// One round of a lesson: three questions at one level, one after the other, with three dots to show
// how far he has got. After the last one comes a big star and a button to play again.

/** How long to wait after the "yes!" before the next question, in milliseconds. */
const PAUSE_MS = 600

/** The questions for one round. A new kind of game gets a line here. */
function makeQuestions(lesson: Lesson, level: number): Question[] {
  switch (lesson.type) {
    case 'find-letter':
      return findLetterQuestions(lesson.levels[level]!)
    case 'find-number':
      return findNumberQuestions(lesson.levels[level]!)
    case 'count-eggs':
      return countEggsQuestions(lesson.levels[level]!)
    case 'find-key':
      return findKeyQuestions(lesson.levels[level]!)
    case 'type-it':
      return typeItQuestions(lesson.levels[level]!)
  }
}

export function Round({
  dinosaur,
  lesson,
  level,
  onCheer,
  onFinished,
  onAgain
}: {
  /** The dinosaur asking, by its folder name. Its voice says the lines. */
  dinosaur: string
  lesson: Lesson
  /** Which level to play: an index into the lesson's levels. Read once, when the round starts. */
  level: number
  /** Called on every right answer: both dinosaurs jump for joy. */
  onCheer: () => void
  /** Called once, when the third question is done. */
  onFinished: () => void
  /** Called when the big button asks for another round. */
  onAgain: () => void
}) {
  const [questions] = useState(() => makeQuestions(lesson, level))
  /** The question being asked now. */
  const [current, setCurrent] = useState(0)
  /** True from the right answer until the next question appears: the speaker is switched off. */
  const [celebrating, setCelebrating] = useState(false)
  const [finished, setFinished] = useState(false)
  /** False once he has walked away: nothing more may be said, and nothing may move on. */
  const here = useRef(true)
  const timer = useRef(0)

  useEffect(() => {
    here.current = true
    return () => {
      here.current = false
      window.clearTimeout(timer.current)
    }
  }, [])

  useEffect(() => {
    if (!finished) return
    void say(dinosaur, 'done')
    return hush
  }, [finished, dinosaur])

  const right = async (question: Question): Promise<void> => {
    setCelebrating(true)
    onCheer()
    await say(dinosaur, question.yes)
    if (!here.current) return
    // A short rest after the "yes!", then on to the next question.
    timer.current = window.setTimeout(() => {
      setCelebrating(false)
      if (current + 1 < questions.length) {
        setCurrent(current + 1)
      } else {
        setFinished(true)
        onFinished()
      }
    }, PAUSE_MS)
  }

  const question = questions[current]!
  return (
    <div className="lesson">
      <div className="dots" aria-hidden="true">
        {Array.from({ length: ROUND_SIZE }, (_, dot) => (
          <span key={dot} className={`dot ${dot < current + (celebrating || finished ? 1 : 0) ? 'filled' : ''}`} />
        ))}
      </div>
      {finished ? (
        <div className="choices">
          <span className="big-star">⭐</span>
          <button className="play-again" aria-label="Play again" onClick={onAgain}>
            ▶
          </button>
        </div>
      ) : question.kind === 'eggs' ? (
        <CountEggs key={current} dinosaur={dinosaur} question={question} locked={celebrating} onRight={() => void right(question)} />
      ) : question.kind === 'key' ? (
        <FindKey key={current} dinosaur={dinosaur} question={question} locked={celebrating} onRight={() => void right(question)} />
      ) : question.kind === 'type' ? (
        <TypeIt key={current} dinosaur={dinosaur} question={question} locked={celebrating} onRight={() => void right(question)} />
      ) : (
        <PickTile key={current} dinosaur={dinosaur} question={question} locked={celebrating} onRight={() => void right(question)} />
      )}
    </div>
  )
}
