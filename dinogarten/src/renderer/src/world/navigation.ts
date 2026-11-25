import { isInWorld } from './coast'
import type { Obstacle } from './scenery'

// Route-finding for click-to-move. The world is laid over with a grid of squares, each marked as
// open or blocked, and a route is the shortest chain of open squares from the player to the click.

/** Size of one grid square, in world units. */
const CELL = 1
/** The grid covers the whole world with room to spare: x from WEST to EAST, z from NORTH to SOUTH. */
const WEST = -52
const EAST = 52
const NORTH = -72
const SOUTH = 42

const COLUMNS = Math.round((EAST - WEST) / CELL)
const ROWS = Math.round((SOUTH - NORTH) / CELL)

export interface Waypoint {
  x: number
  z: number
}

export class Navigator {
  /** 1 where the player can stand, 0 where something is in the way. One entry per grid square. */
  private readonly open = new Uint8Array(COLUMNS * ROWS)

  /** `clearance` is how far the player's middle must stay from the edge of every obstacle. */
  constructor(
    private readonly obstacles: Obstacle[],
    private readonly clearance: number
  ) {
    for (let row = 0; row < ROWS; row++) {
      for (let column = 0; column < COLUMNS; column++) {
        const x = WEST + (column + 0.5) * CELL
        const z = NORTH + (row + 0.5) * CELL
        this.open[row * COLUMNS + column] = this.canStand(x, z) ? 1 : 0
      }
    }
  }

  private canStand(x: number, z: number): boolean {
    if (!isInWorld(x, z)) return false
    return this.obstacles.every((obstacle) => Math.hypot(x - obstacle.x, z - obstacle.z) > obstacle.r + this.clearance)
  }

  private squareAt(x: number, z: number): number {
    const column = Math.min(COLUMNS - 1, Math.max(0, Math.floor((x - WEST) / CELL)))
    const row = Math.min(ROWS - 1, Math.max(0, Math.floor((z - NORTH) / CELL)))
    return row * COLUMNS + column
  }

  private centreOf(square: number): Waypoint {
    return {
      x: WEST + ((square % COLUMNS) + 0.5) * CELL,
      z: NORTH + (Math.floor(square / COLUMNS) + 0.5) * CELL
    }
  }

  /** The open square nearest to a spot, looking a few squares around it. Returns -1 if there is none nearby. */
  private nearestOpen(x: number, z: number): number {
    const start = this.squareAt(x, z)
    if (this.open[start]) return start
    const column = start % COLUMNS
    const row = Math.floor(start / COLUMNS)
    let best = -1
    let bestDistance = Infinity
    for (let dr = -6; dr <= 6; dr++) {
      for (let dc = -6; dc <= 6; dc++) {
        const c = column + dc
        const r = row + dr
        if (c < 0 || r < 0 || c >= COLUMNS || r >= ROWS) continue
        const square = r * COLUMNS + c
        if (!this.open[square]) continue
        const centre = this.centreOf(square)
        const distance = Math.hypot(centre.x - x, centre.z - z)
        if (distance < bestDistance) {
          bestDistance = distance
          best = square
        }
      }
    }
    return best
  }

  /** True if the player could walk in a straight line between two spots without touching anything. */
  private clearLine(a: Waypoint, b: Waypoint): boolean {
    const length = Math.hypot(b.x - a.x, b.z - a.z)
    const steps = Math.ceil(length / 0.4)
    for (let step = 1; step < steps; step++) {
      const t = step / steps
      if (!this.open[this.squareAt(a.x + (b.x - a.x) * t, a.z + (b.z - a.z) * t)]) return false
    }
    return true
  }

  /**
   * Finds a way from one spot to another. Returns the points to walk through in order, ending
   * at the destination, or null when there is no way to get there.
   */
  findPath(fromX: number, fromZ: number, toX: number, toZ: number): Waypoint[] | null {
    const start = this.nearestOpen(fromX, fromZ)
    const goal = this.nearestOpen(toX, toZ)
    if (start < 0 || goal < 0) return null

    // A* search: always extend the route that looks shortest so far.
    const cameFrom = new Int32Array(COLUMNS * ROWS).fill(-1)
    const costSoFar = new Float32Array(COLUMNS * ROWS).fill(Infinity)
    const closed = new Uint8Array(COLUMNS * ROWS)
    const goalColumn = goal % COLUMNS
    const goalRow = Math.floor(goal / COLUMNS)
    const guess = (square: number): number => {
      const dc = Math.abs((square % COLUMNS) - goalColumn)
      const dr = Math.abs(Math.floor(square / COLUMNS) - goalRow)
      return Math.max(dc, dr) + 0.4142 * Math.min(dc, dr)
    }

    const queue: Array<[number, number]> = [[guess(start), start]]
    costSoFar[start] = 0
    let found = false
    while (queue.length > 0) {
      // Take the most promising square. The list stays short, so a simple scan is fast enough.
      let pick = 0
      for (let i = 1; i < queue.length; i++) if (queue[i]![0] < queue[pick]![0]) pick = i
      const [, square] = queue.splice(pick, 1)[0]!
      if (closed[square]) continue
      closed[square] = 1
      if (square === goal) {
        found = true
        break
      }
      const column = square % COLUMNS
      const row = Math.floor(square / COLUMNS)
      for (let dr = -1; dr <= 1; dr++) {
        for (let dc = -1; dc <= 1; dc++) {
          if (dr === 0 && dc === 0) continue
          const c = column + dc
          const r = row + dr
          if (c < 0 || r < 0 || c >= COLUMNS || r >= ROWS) continue
          const next = r * COLUMNS + c
          if (!this.open[next] || closed[next]) continue
          // No squeezing diagonally between two blocked squares.
          if (dr !== 0 && dc !== 0 && (!this.open[row * COLUMNS + c] || !this.open[r * COLUMNS + column])) continue
          const cost = costSoFar[square]! + (dr !== 0 && dc !== 0 ? 1.4142 : 1)
          if (cost >= costSoFar[next]!) continue
          costSoFar[next] = cost
          cameFrom[next] = square
          queue.push([cost + guess(next), next])
        }
      }
    }
    if (!found) return null

    const squares: number[] = []
    for (let square = goal; square !== -1; square = cameFrom[square]!) squares.push(square)
    squares.reverse()

    // Straighten the zig-zag: from each point, skip ahead to the furthest one still in a clear line.
    const points: Waypoint[] = [{ x: fromX, z: fromZ }, ...squares.map((square) => this.centreOf(square))]
    const route: Waypoint[] = []
    let anchor = 0
    while (anchor < points.length - 1) {
      let next = points.length - 1
      while (next > anchor + 1 && !this.clearLine(points[anchor]!, points[next]!)) next--
      route.push(points[next]!)
      anchor = next
    }
    route.push({ x: toX, z: toZ })
    return route
  }
}
