import { useEffect, useRef, useState } from 'react'
import { MeetingCard } from './MeetingCard'
import { World, type Meeting } from './world/World'

export function App() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const worldRef = useRef<World | null>(null)
  const [meeting, setMeeting] = useState<Meeting | null>(null)

  useEffect(() => {
    const world = new World(canvasRef.current!)
    world.onMeeting = setMeeting
    worldRef.current = world
    void world.load()
    return () => world.dispose()
  }, [])

  return (
    <>
      <canvas ref={canvasRef} className="world" />
      {/* The key makes each meeting start afresh, even with the same dinosaur as last time. */}
      {meeting && <MeetingCard key={meeting.visit} meeting={meeting} onCheer={() => worldRef.current?.cheer()} />}
    </>
  )
}
