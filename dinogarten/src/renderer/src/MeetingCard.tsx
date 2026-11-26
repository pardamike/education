import { useEffect, useState } from 'react'
import { CountEggs } from './lessons/CountEggs'
import { FindLetter } from './lessons/FindLetter'
import { hush, say } from './voice'
import type { Meeting } from './world/World'

// What appears on screen when the little T. rex walks up to a dinosaur. The dinosaur says hello,
// says its name slowly, says what it eats, and then, if it has one, gives its lesson.
// Everything is spoken, because the player cannot read yet. The words on screen are there for
// him to look at and for a grown-up to read along.

const FOOD_PICTURES: Record<string, string> = { plants: '🌿', meat: '🍖', fish: '🐟' }

type Step = 'hello' | 'name' | 'eats' | 'lesson'

export function MeetingCard({
  meeting,
  earned,
  onRight
}: {
  meeting: Meeting
  /** True when whoever is playing already has this dinosaur's star. */
  earned: boolean
  /** Called when the lesson's right answer is found. */
  onRight: () => void
}) {
  const [step, setStep] = useState<Step>('hello')
  // Goes up each time the speaker button is pressed, which starts the introduction again.
  const [replays, setReplays] = useState(0)

  useEffect(() => {
    const introduce = async (): Promise<void> => {
      for (const line of ['hello', 'name', 'eats'] as const) {
        setStep(line)
        // Cut short, he has walked off or asked to hear it all again: either way this telling is over.
        if (!(await say(meeting.id, line))) return
      }
      setStep('lesson')
    }
    void introduce()
    return hush
  }, [meeting.id, replays])

  const lesson = step === 'lesson' ? meeting.lesson : undefined
  return (
    <div className="meeting">
      <div className="card">
        <div className="name">
          <span className="first-letter">{meeting.name.slice(0, 1)}</span>
          {meeting.name.slice(1)}
          {earned && <span className="earned"> ⭐</span>}
        </div>
        {step !== 'hello' && <div className="say-it">{meeting.sayIt}</div>}
        {(step === 'eats' || step === 'lesson') && (
          <div className="eats">
            <span className="food">{FOOD_PICTURES[meeting.eats] ?? '🍽️'}</span> {meeting.eats}
          </div>
        )}
      </div>

      {lesson?.type === 'find-letter' ? (
        <FindLetter dinosaur={meeting.id} lesson={lesson} onRight={onRight} />
      ) : lesson?.type === 'count-eggs' ? (
        <CountEggs dinosaur={meeting.id} lesson={lesson} onRight={onRight} />
      ) : (
        <div className="choices">
          <button className="again" aria-label="Hear it again" onClick={() => setReplays((count) => count + 1)}>
            🔊
          </button>
        </div>
      )}
    </div>
  )
}
