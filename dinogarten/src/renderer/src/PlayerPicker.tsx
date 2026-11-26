import { useState, type CSSProperties } from 'react'
import { COLOURS, totalStars, type ColourName, type Player } from './players'

// The first thing on screen: "Who is playing?". Each player is an egg in their own colour with
// their name under it, so a child who cannot read yet can still find himself. A grown-up adds
// a new player by typing a name and choosing an egg.

/** The longest a name can be, so it always fits under its egg. */
const LONGEST_NAME = 12

/** An egg in one of the player colours. */
export function Egg({ colour }: { colour: ColourName }) {
  const { body, belly } = COLOURS[colour]
  return <span className="egg" style={{ '--shell': body, '--speckle': belly } as CSSProperties} />
}

export function PlayerPicker({
  players,
  onPick,
  onChange
}: {
  players: Player[]
  onPick: (id: string) => void
  /** Called with the whole new list when a player is added or removed. */
  onChange: (players: Player[]) => void
}) {
  const [adding, setAdding] = useState(false)
  const [name, setName] = useState('')
  // A new player is offered the first colour nobody has taken yet.
  const spare = (Object.keys(COLOURS) as ColourName[]).find((colour) => players.every((player) => player.colour !== colour))
  const [colour, setColour] = useState<ColourName>(spare ?? 'green')
  /** The player being asked about, after the little cross on their egg is pressed. */
  const [removing, setRemoving] = useState<string | null>(null)

  const add = (): void => {
    const player: Player = { id: Date.now().toString(36), name: name.trim(), colour, stars: {} }
    if (!player.name) return
    onChange([...players, player])
    onPick(player.id)
  }

  if (adding || players.length === 0) {
    return (
      <div className="picker">
        <h1>Dinogarten</h1>
        <form
          className="new-player"
          onSubmit={(event) => {
            event.preventDefault()
            add()
          }}
        >
          <h2>New player</h2>
          <input
            autoFocus
            value={name}
            maxLength={LONGEST_NAME}
            placeholder="Name"
            aria-label="Name"
            onChange={(event) => setName(event.target.value)}
          />
          <div className="colours">
            {(Object.keys(COLOURS) as ColourName[]).map((choice) => (
              <button
                key={choice}
                type="button"
                className={`colour ${choice === colour ? 'chosen' : ''}`}
                aria-label={choice}
                aria-pressed={choice === colour}
                data-colour={choice}
                onClick={() => setColour(choice)}
              >
                <Egg colour={choice} />
              </button>
            ))}
          </div>
          <div className="buttons">
            {players.length > 0 && (
              <button type="button" className="plain" onClick={() => setAdding(false)}>
                Back
              </button>
            )}
            <button type="submit" className="go" disabled={!name.trim()}>
              Play ▶
            </button>
          </div>
        </form>
      </div>
    )
  }

  return (
    <div className="picker">
      <h1>Dinogarten</h1>
      <h2>Who is playing?</h2>
      <div className="players">
        {players.map((player) =>
          player.id === removing ? (
            <div key={player.id} className="player asking">
              <Egg colour={player.colour} />
              <span className="player-name">Remove {player.name}?</span>
              <div className="buttons">
                <button className="plain" onClick={() => setRemoving(null)}>
                  Keep
                </button>
                <button
                  className="plain danger"
                  onClick={() => {
                    setRemoving(null)
                    onChange(players.filter((other) => other.id !== player.id))
                  }}
                >
                  Remove
                </button>
              </div>
            </div>
          ) : (
            <div key={player.id} className="player">
              <button className="play" data-player={player.name} onClick={() => onPick(player.id)}>
                <Egg colour={player.colour} />
                <span className="player-name">{player.name}</span>
                <span className="player-stars">{totalStars(player) > 0 ? `⭐ ${totalStars(player)}` : ' '}</span>
              </button>
              <button className="remove" aria-label={`Remove ${player.name}`} onClick={() => setRemoving(player.id)}>
                ✕
              </button>
            </div>
          )
        )}
        <div className="player">
          <button className="play add" aria-label="New player" onClick={() => setAdding(true)}>
            <span className="plus">＋</span>
            <span className="player-name">New player</span>
            <span className="player-stars"> </span>
          </button>
        </div>
      </div>
    </div>
  )
}
