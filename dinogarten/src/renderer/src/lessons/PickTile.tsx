import { useEffect } from 'react'
import { hush, say } from '../voice'
import { pictureOf } from './pictures'
import { Tiles } from './Tiles'
import type { PickQuestion } from './types'

// One "pick the right tile" question, for finding a letter, finding a number, finding what comes next and finding a first letter. The dinosaur
// asks, and the tiles are shown. A wrong tile fades away with a "try again", and when only the
// right one is left the dinosaur points it out.

export function PickTile({
  dinosaur,
  question,
  locked,
  onRight
}: {
  /** The dinosaur asking, by its folder name. Its voice says the lines. */
  dinosaur: string
  question: PickQuestion
  /** True while the right answer is being celebrated: the speaker must not cut that short. */
  locked: boolean
  onRight: () => void
}) {
  useEffect(() => {
    void say(dinosaur, question.ask)
    return hush
  }, [dinosaur, question.ask])

  const wrong = async (lastOne: boolean): Promise<void> => {
    if (lastOne) {
      void say(dinosaur, 'show')
    } else if (await say(dinosaur, 'again')) {
      // Heard to the end: ask again. Cut short, he has walked off or tapped something else.
      void say(dinosaur, question.ask)
    }
  }

  const picture = question.picture ? pictureOf(question.picture) : undefined
  return (
    <div className="choices">
      <button className="again" aria-label="Hear it again" disabled={locked} onClick={() => void say(dinosaur, question.ask)}>
        🔊
      </button>
      {question.prompt && <div className="prompt">{question.prompt}</div>}
      {picture && (
        <div className="word-card" data-word={question.picture}>
          <img className="word-picture" src={picture} alt="" draggable={false} />
        </div>
      )}
      {question.sequence && (
        <div className="sequence" data-sequence={question.sequence.join('')}>
          {question.sequence.map((letter, place) => (
            <span key={letter} className="seq-card" style={{ animationDelay: `${place * 0.08}s` }}>
              {letter}
            </span>
          ))}
          <span className="seq-card seq-empty" style={{ animationDelay: `${question.sequence.length * 0.08}s` }}>
            ?
          </span>
        </div>
      )}
      <Tiles right={question.right} others={question.others} onWrong={(lastOne) => void wrong(lastOne)} onRight={onRight} />
    </div>
  )
}
