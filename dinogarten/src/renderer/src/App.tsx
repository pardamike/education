import { useEffect, useRef, useState } from 'react'
import { MeetingCard } from './MeetingCard'
import { Egg, PlayerPicker } from './PlayerPicker'
import { COLOURS, loadPlayers, savePlayers, type Player } from './players'
import { World, type Meeting } from './world/World'

export function App() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const worldRef = useRef<World | null>(null)
  const [meeting, setMeeting] = useState<Meeting | null>(null)
  /** Everyone who has played on this computer. Null until the save file has been read. */
  const [players, setPlayers] = useState<Player[] | null>(null)
  /** Who is playing now. Nobody, while the player picker is up. */
  const [playingId, setPlayingId] = useState<string | null>(null)
  const playing = players?.find((player) => player.id === playingId) ?? null

  useEffect(() => {
    const world = new World(canvasRef.current!)
    world.onMeeting = setMeeting
    worldRef.current = world
    void world.load()
    return () => world.dispose()
  }, [])

  useEffect(() => {
    void loadPlayers().then(setPlayers)
  }, [])

  // The world waits while the picker is up, and the little T. rex wears the colours of whoever is playing.
  const colour = playing?.colour
  useEffect(() => {
    if (colour) worldRef.current?.play(COLOURS[colour])
    else worldRef.current?.pause()
  }, [playingId, colour])

  const changePlayers = (changed: Player[]): void => {
    setPlayers(changed)
    savePlayers(changed)
  }

  /** A right answer: both dinosaurs jump for joy, and the player keeps that dinosaur's star for good. */
  const earnStar = (dinosaur: string): void => {
    worldRef.current?.cheer()
    if (!players || !playing || playing.stars.includes(dinosaur)) return
    changePlayers(players.map((player) => (player === playing ? { ...player, stars: [...player.stars, dinosaur] } : player)))
  }

  return (
    <>
      <canvas ref={canvasRef} className="world" />
      {/* The key makes each meeting start afresh, even with the same dinosaur as last time. */}
      {playing && meeting && (
        <MeetingCard
          key={meeting.visit}
          meeting={meeting}
          earned={playing.stars.includes(meeting.id)}
          onRight={() => earnStar(meeting.id)}
        />
      )}
      {playing && !meeting && (
        <button className="whoami" aria-label="Change player" onClick={() => setPlayingId(null)}>
          <Egg colour={playing.colour} />
          <span>{playing.name}</span>
          {playing.stars.length > 0 && <span>⭐ {playing.stars.length}</span>}
        </button>
      )}
      {players && !playing && <PlayerPicker players={players} onPick={setPlayingId} onChange={changePlayers} />}
    </>
  )
}
