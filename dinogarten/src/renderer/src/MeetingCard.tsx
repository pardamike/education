import { useEffect, useState } from 'react'
import { FindLetter } from './lessons/FindLetter'
import { hush, say } from './voice'
import type { Meeting } from './world/World'

// What appears on screen when the little T. rex walks up to a dinosaur. The dinosaur says hello,
// says its name slowly, says what it eats, and then, if it has one, gives its lesson.
// Everything is spoken, because the player cannot read yet. The words on screen are there for
// him to look at and for a grown-up to read along.

const FOOD_PICTURES: Record<string, string> = { plants: '🌿', meat: '🍖', fish: '🐟' }

/** Dinosaurs whose lesson has been finished since the game was opened. Nothing is saved between sessions yet. */
const finished = new Set<string>()

type Step = 'hello' | 'name' | 'eats' | 'lesson'

export function MeetingCard({ meeting, onCheer }: { meeting: Meeting; onCheer: () => void }) {
  const [step, setStep] = useState<Step>('hello')
  // Goes up each time the speaker button is pressed, which starts the introduction again.
  const [replays, setReplays] = useState(0)
  const [, setStars] = useState(0)

  useEffect(() => {
    let walkedOff = false
    const introduce = async (): Promise<void> => {
      for (const line of ['hello', 'name', 'eats'] as const) {
        setStep(line)
        await say(meeting.id, line)
        if (walkedOff) return
      }
      setStep('lesson')
    }
    void introduce()
    return () => {
      walkedOff = true
      hush()
    }
  }, [meeting.id, replays])

  const lesson = step === 'lesson' ? meeting.lesson : undefined
  return (
    <div className="meeting">
      <div className="card">
        <div className="name">
          <span className="first-letter">{meeting.name.slice(0, 1)}</span>
          {meeting.name.slice(1)}
          {finished.has(meeting.id) && <span className="earned"> ⭐</span>}
        </div>
        {step !== 'hello' && <div className="say-it">{meeting.sayIt}</div>}
        {(step === 'eats' || step === 'lesson') && (
          <div className="eats">
            <span className="food">{FOOD_PICTURES[meeting.eats] ?? '🍽️'}</span> {meeting.eats}
          </div>
        )}
      </div>

      {lesson?.type === 'find-letter' ? (
        <FindLetter
          dinosaur={meeting.id}
          lesson={lesson}
          onRight={() => {
            finished.add(meeting.id)
            setStars((count) => count + 1)
            onCheer()
          }}
        />
      ) : (
        <div className="letters">
          <button className="again" aria-label="Hear it again" onClick={() => setReplays((count) => count + 1)}>
            🔊
          </button>
        </div>
      )}
    </div>
  )
}
