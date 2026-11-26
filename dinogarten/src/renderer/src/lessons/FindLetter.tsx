import { useEffect, useState } from 'react'
import { hush, say } from '../voice'
import { Tiles } from './Tiles'
import type { FindLetterLesson } from './types'

// "Find the letter": the dinosaur asks for one letter and shows it among a few others, each on a
// big tile. A wrong tile fades away with a "try again", and when only the right one is left the
// dinosaur points it out.

export function FindLetter({
  dinosaur,
  lesson,
  onRight
}: {
  /** The dinosaur asking, by its folder name. Its voice says the lines. */
  dinosaur: string
  lesson: FindLetterLesson
  onRight: () => void
}) {
  const [found, setFound] = useState(false)

  useEffect(() => {
    void say(dinosaur, 'ask')
    return hush
  }, [dinosaur])

  return (
    <div className="choices">
      <button className="again" aria-label="Hear it again" onClick={() => void say(dinosaur, found ? 'yes' : 'ask')}>
        🔊
      </button>
      <Tiles
        right={lesson.letter}
        others={lesson.others}
        onWrong={(lastOne) => void say(dinosaur, lastOne ? 'show' : 'again')}
        onRight={() => {
          setFound(true)
          void say(dinosaur, 'yes')
          onRight()
        }}
      />
    </div>
  )
}
