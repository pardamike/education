import { useEffect, useState } from 'react'
import { Round } from './lessons/Round'
import { hush, say } from './voice'
import type { Meeting } from './world/World'

// What appears on screen when the little T. rex walks up to a dinosaur. The first time a player meets
// a dinosaur, it says hello, says its name slowly, says what it eats, and then, if it has one, gives
// its lesson. Meeting a dinosaur with a lesson again, it just says hello again and starts the lesson.
// Everything is spoken, because the player cannot read yet. The words on screen are there for
// him to look at and for a grown-up to read along.

const FOOD_PICTURES: Record<string, string> = { plants: '🌿', meat: '🍖', fish: '🐟' }

type Step = 'hello' | 'name' | 'eats' | 'lesson'

/** Who has heard whom introduce themselves in full since the game was opened ("player/dinosaur"). Not saved. */
const met = new Set<string>()

export function MeetingCard({
  meeting,
  playerId,
  stars,
  onCheer,
  onRoundDone
}: {
  meeting: Meeting
  /** Who is playing, to remember which dinosaurs they have met. */
  playerId: string
  /** How many of this dinosaur's levels the player has finished. */
  stars: number
  /** A right answer: both dinosaurs jump for joy. */
  onCheer: () => void
  /** A round was finished. */
  onRoundDone: () => void
}) {
  const [step, setStep] = useState<Step>('hello')
  // Goes up each time the speaker button is pressed, which starts the introduction again.
  const [replays, setReplays] = useState(0)
  // Goes up each time the big button asks for another round.
  const [rounds, setRounds] = useState(0)

  useEffect(() => {
    const key = `${playerId}/${meeting.id}`
    const introduce = async (): Promise<void> => {
      // Met before, and there is a lesson to get on with: a quick hello and the whole card at once.
      if (meeting.lesson && met.has(key)) {
        setStep('eats')
        if (!(await say(meeting.id, 'back'))) return
        setStep('lesson')
        return
      }
      for (const line of ['hello', 'name', 'eats'] as const) {
        setStep(line)
        // Cut short, he has walked off or asked to hear it all again: either way this telling is over.
        if (!(await say(meeting.id, line))) return
      }
      met.add(key)
      setStep('lesson')
    }
    void introduce()
    return hush
  }, [meeting.id, meeting.lesson, playerId, replays])

  const lesson = step === 'lesson' ? meeting.lesson : undefined
  const levels = meeting.lesson?.levels.length ?? 0
  return (
    <div className="meeting">
      <div className="card">
        <div className="name">
          <span className="first-letter">{meeting.name.slice(0, 1)}</span>
          {meeting.name.slice(1)}
          {levels > 0 && (
            <span className="earned">
              {' '}
              {Array.from({ length: levels }, (_, level) => (
                <span key={level} className={level < stars ? '' : 'unearned'}>
                  ⭐
                </span>
              ))}
            </span>
          )}
        </div>
        {step !== 'hello' && <div className="say-it">{meeting.sayIt}</div>}
        {(step === 'eats' || step === 'lesson') && (
          <div className="eats">
            <span className="food">{FOOD_PICTURES[meeting.eats] ?? '🍽️'}</span> {meeting.eats}
          </div>
        )}
      </div>

      {lesson ? (
        <Round
          key={rounds}
          dinosaur={meeting.id}
          lesson={lesson}
          level={Math.min(stars, levels - 1)}
          onCheer={onCheer}
          onFinished={onRoundDone}
          onAgain={() => setRounds((count) => count + 1)}
        />
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
