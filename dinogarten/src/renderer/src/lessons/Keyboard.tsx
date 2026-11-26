import { useEffect, useRef, useState } from 'react'

// A picture of a real keyboard: the number row and the three letter rows, staggered like the real
// thing. It listens to the real keyboard too, so pressing a key and clicking it are the same.
// The game says which keys to mark, and gets told which key was pressed. Used by the games that
// ask for keys.

const ROWS = ['1234567890', 'QWERTYUIOP', 'ASDFGHJKL', 'ZXCVBNM']

/** How far each row starts from the left, in key widths, like the rows of a real keyboard. */
const INDENTS = [0, 0.5, 0.75, 1.25]

/** How long a pressed key stays lit, in milliseconds. */
const LIT_MS = 250

/** How a key is marked: found, pressed by mistake, or glowing to say "here it is". */
export type KeyMark = 'right' | 'wrong' | 'glow'

/** Stars flying off a key that has been found: [across, up], in key widths. */
const STARS: Array<[number, number]> = [
  [-1.4, -1.4],
  [-0.5, -2],
  [0.3, -1.7],
  [1.1, -2.1],
  [1.7, -1.3]
]

export function Keyboard({
  marks,
  disabled = false,
  onKey
}: {
  /** The keys to mark, by capital letter or digit. */
  marks: Partial<Record<string, KeyMark>>
  /** True while the game is busy: keys still light up when pressed, but nothing is told. */
  disabled?: boolean
  /** Called with the capital letter or digit that was pressed, on the real keyboard or by click. */
  onKey: (key: string) => void
}) {
  const [lit, setLit] = useState<string | null>(null)
  const timer = useRef(0)
  // The latest props, so the listener below is made once and still always calls the current game.
  const latest = useRef({ disabled, onKey })
  latest.current = { disabled, onKey }

  const press = (key: string): void => {
    setLit(key)
    window.clearTimeout(timer.current)
    timer.current = window.setTimeout(() => setLit(null), LIT_MS)
    if (!latest.current.disabled) latest.current.onKey(key)
  }

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      // Holding a key down repeats it, and shortcuts are not for us. Arrows and the rest pass by.
      if (event.repeat || event.ctrlKey || event.altKey || event.metaKey) return
      if (/^[a-z0-9]$/i.test(event.key)) press(event.key.toUpperCase())
    }
    window.addEventListener('keydown', onKeyDown)
    return () => {
      window.removeEventListener('keydown', onKeyDown)
      window.clearTimeout(timer.current)
    }
    // `press` only reads refs and sets state, so the first one made is good for ever.
  }, [])

  return (
    <div className="keyboard">
      {ROWS.map((row, line) => (
        <div key={row} className="key-row" style={{ marginLeft: `calc(${INDENTS[line]} * (var(--key) + var(--key-gap)))` }}>
          {[...row].map((key) => {
            const mark = marks[key]
            return (
              <button
                key={key}
                className={`key ${lit === key ? 'lit' : ''} ${mark ? `key-${mark}` : ''}`}
                data-key={key}
                tabIndex={-1}
                onClick={() => press(key)}
              >
                {key}
                {mark === 'right' &&
                  STARS.map(([across, up], i) => (
                    <span
                      key={i}
                      className="star key-star"
                      style={{ '--across': across, '--up': up, animationDelay: `${i * 70}ms` } as React.CSSProperties}
                    >
                      ⭐
                    </span>
                  ))}
              </button>
            )
          })}
        </div>
      ))}
    </div>
  )
}
