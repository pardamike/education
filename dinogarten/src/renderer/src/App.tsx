import { useEffect, useRef } from 'react'
import { World } from './world/World'

export function App() {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const world = new World(canvasRef.current!)
    void world.load()
    return () => world.dispose()
  }, [])

  return <canvas ref={canvasRef} className="world" />
}
