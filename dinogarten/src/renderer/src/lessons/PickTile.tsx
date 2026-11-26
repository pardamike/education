import { useEffect } from 'react'
import { hush, say } from '../voice'
import { Tiles } from './Tiles'
import type { PickQuestion } from './types'

// One "pick the right tile" question, for finding a letter and for finding a number. The dinosaur
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

  return (
    <div className="choices">
      <button className="again" aria-label="Hear it again" disabled={locked} onClick={() => void say(dinosaur, question.ask)}>
        🔊
      </button>
      {question.prompt && <div className="prompt">{question.prompt}</div>}
      <Tiles right={question.right} others={question.others} onWrong={(lastOne) => void wrong(lastOne)} onRight={onRight} />
    </div>
  )
}
