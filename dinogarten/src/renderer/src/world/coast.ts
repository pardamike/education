import * as THREE from 'three'
import type { Obstacle } from './scenery'

// The north coast: a beach, a rocky inlet, and a sea the player can wade and run into.
// The camera always looks north, so the sea lies ahead of the player with the volcanoes rising behind it.

/** The player can roam this far from the middle of the meadow. */
export const WORLD_RADIUS = 36

/** The z of the shoreline where the coast runs straight. Smaller z is further north, out to sea. */
const SHORE_Z = -38

/** One inlet, where the sea reaches south into the beach. This is the Spinosaurus's home. */
export const INLET = { x: 17, reach: 7, width: 5.5 }

/**
 * The shape of the sea floor, measured north from the shoreline. A gentle slope to wade down
 * (`wadeDepth` deep after `wadeLength`), then a drop between `dropStart` and `dropEnd` to a deep
 * floor where everything is fully underwater. The player may go `reach` out.
 */
export const SEA = { wadeDepth: 3, wadeLength: 22, dropStart: 24, dropEnd: 48, floorDepth: 13, reach: 72 }

/** The stretch of coast the player can walk on: between these x values, and no further south than `landEdge`. */
const COAST = { west: -44, east: 44, landEdge: -24 }

/** Where the land ends at a given x. North of this (smaller z) is sea. */
export function shoreline(x: number): number {
  return SHORE_Z + INLET.reach * Math.exp(-(((x - INLET.x) / INLET.width) ** 2))
}

const smooth = (t: number): number => {
  const clamped = Math.min(1, Math.max(0, t))
  return clamped * clamped * (3 - 2 * clamped)
}

/** Height of the sea floor `out` units north of the shoreline, before any dunes. Zero or negative `out` is dry land. */
function seaFloor(out: number): number {
  if (out <= 0) return 0
  const shallows = -SEA.wadeDepth * smooth(out / SEA.wadeLength)
  const drop = smooth((out - SEA.dropStart) / (SEA.dropEnd - SEA.dropStart))
  return shallows - (SEA.floorDepth - SEA.wadeDepth) * drop
}

/** A deeper pool in the middle of the inlet, so whoever lives there stands properly in the water. */
const POOL = { x: INLET.x, z: SHORE_Z + 2.5, width: 4.2, length: 4.5, depth: 1.1 }

/** Height of the ground at a spot: 0 on land, below 0 on the sea floor. */
export function groundHeight(x: number, z: number): number {
  const out = shoreline(x) - z
  if (out <= 0) return 0
  const inPool = Math.exp(-(((x - POOL.x) / POOL.width) ** 2) - ((z - POOL.z) / POOL.length) ** 2)
  // Out on the deep floor the sand rolls in long, low dunes.
  const dunes = 1.3 * Math.sin(x * 0.11 + 1.3) * Math.cos(z * 0.09) + 0.6 * Math.sin(x * 0.23 + z * 0.17)
  return seaFloor(out) - POOL.depth * inPool * Math.min(1, out / 2.5) + dunes * smooth((out - SEA.dropEnd + 8) / 10)
}

/** Height of the sea's surface. It rises and falls a touch, so the water's edge laps up and down the beach. */
export function waterLevel(timeSeconds: number): number {
  return -0.07 + Math.sin(timeSeconds * 0.9) * 0.035
}

function inMeadow(x: number, z: number): boolean {
  return Math.hypot(x, z) <= WORLD_RADIUS
}

function inCoast(x: number, z: number): boolean {
  return x >= COAST.west && x <= COAST.east && z <= COAST.landEdge && z >= shoreline(x) - SEA.reach
}

/** True for any spot the player is allowed to stand: the round meadow plus the strip of coast. */
export function isInWorld(x: number, z: number): boolean {
  return inMeadow(x, z) || inCoast(x, z)
}

/** Moves a point back inside the world if it has strayed out. */
export function keepInWorld(point: THREE.Vector3): void {
  if (isInWorld(point.x, point.z)) return

  const distance = Math.hypot(point.x, point.z)
  const meadowX = (point.x / distance) * WORLD_RADIUS
  const meadowZ = (point.z / distance) * WORLD_RADIUS

  const coastX = THREE.MathUtils.clamp(point.x, COAST.west, COAST.east)
  const coastZ = THREE.MathUtils.clamp(point.z, shoreline(coastX) - SEA.reach, COAST.landEdge)

  const toMeadow = Math.hypot(point.x - meadowX, point.z - meadowZ)
  const toCoast = Math.hypot(point.x - coastX, point.z - coastZ)
  if (toMeadow <= toCoast) {
    point.x = meadowX
    point.z = meadowZ
  } else {
    point.x = coastX
    point.z = coastZ
  }
}

/** True for spots that belong to the beach and sea, where meadow plants should not grow. */
export function isCoast(z: number, margin = 0): boolean {
  return z < COAST.landEdge - 4 + margin
}

/** Ground colour at each distance out from the shoreline: grass, then sand, then deeper and deeper water. */
const GROUND_COLORS: Array<[number, string]> = [
  [-11, '#8ccf63'],
  [-7, '#efe0ae'],
  [0, '#f3e6ba'],
  [1.5, '#e3d49c'],
  [6, '#d2d6a4'],
  [14, '#aacfb2'],
  [24, '#8fc4b6'],
  [48, '#93bba6'],
  [80, '#86b0a0'],
  [140, '#5f9db5'],
  [600, '#3a7fa8']
]

function groundColor(out: number, target: THREE.Color): THREE.Color {
  for (let i = 1; i < GROUND_COLORS.length; i++) {
    const [farOut, farColor] = GROUND_COLORS[i]!
    if (out > farOut && i < GROUND_COLORS.length - 1) continue
    const [nearOut, nearColor] = GROUND_COLORS[i - 1]!
    const mix = THREE.MathUtils.clamp((out - nearOut) / (farOut - nearOut), 0, 1)
    return target.set(nearColor).lerp(new THREE.Color(farColor), mix)
  }
  return target
}

/** One sheet of ground following the shoreline: the beach and, beyond it, the sloping sea floor. */
function buildBeachAndSeaFloor(): THREE.Mesh {
  const columns: number[] = [-600, -300, -150, -90]
  for (let x = -60; x <= 60; x += 1) columns.push(x)
  columns.push(90, 150, 300, 600)
  const rows = [-11, -7, -3, 0, 1, 2, 3, 4.5, 6, 8, 10, 14, 18, 22]
  for (let out = 24; out <= 104; out += 2) rows.push(out)
  rows.push(116, 140, 200, 350, 600)

  const positions: number[] = []
  const colors: number[] = []
  const indices: number[] = []
  const color = new THREE.Color()
  for (const x of columns) {
    for (const out of rows) {
      // Sand sits a hair above the grass it overlaps.
      const z = shoreline(x) - out
      positions.push(x, out < 0 ? 0.04 : groundHeight(x, z), z)
      groundColor(out, color)
      colors.push(color.r, color.g, color.b)
    }
  }
  for (let column = 0; column < columns.length - 1; column++) {
    for (let row = 0; row < rows.length - 1; row++) {
      const a = column * rows.length + row
      const b = a + rows.length
      indices.push(a, b, a + 1, b, b + 1, a + 1)
    }
  }
  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3))
  geometry.setIndex(indices)
  geometry.computeVertexNormals()
  const mesh = new THREE.Mesh(geometry, new THREE.MeshLambertMaterial({ vertexColors: true }))
  mesh.receiveShadow = true
  return mesh
}

const rockGeometry = new THREE.DodecahedronGeometry(1, 0)
const rockMaterials = ['#b9b3a8', '#a7a196', '#8f8a82'].map(
  (color) => new THREE.MeshLambertMaterial({ color, flatShading: true })
)

function rock(random: () => number, x: number, z: number, size: number): THREE.Mesh {
  const mesh = new THREE.Mesh(rockGeometry, rockMaterials[Math.floor(random() * rockMaterials.length)]!)
  mesh.scale.set(size * (0.8 + random() * 0.4), size * (0.6 + random() * 0.5), size * (0.8 + random() * 0.4))
  mesh.rotation.set(random() * 0.4, random() * Math.PI, random() * 0.4)
  mesh.position.set(x, groundHeight(x, z) + size * 0.3, z)
  mesh.castShadow = true
  return mesh
}

/** Builds the beach, the sea and the rocks of the inlet. Call `update` once a frame for the lapping water. */
export function buildCoast(random: () => number): {
  group: THREE.Group
  obstacles: Obstacle[]
  /** How misty the surface of the sea looks: 0 is clear glass, 1 hides everything on the other side. */
  setWaterOpacity: (opacity: number) => void
  update: (timeSeconds: number) => void
} {
  const group = new THREE.Group()
  const obstacles: Obstacle[] = []

  group.add(buildBeachAndSeaFloor())

  const water = new THREE.Mesh(
    new THREE.PlaneGeometry(1200, 580),
    // Double-sided and unlit, so from underneath it is the bright ceiling of the underwater world.
    new THREE.MeshBasicMaterial({
      color: '#5ab6e6',
      transparent: true,
      opacity: 0.6,
      depthWrite: false,
      side: THREE.DoubleSide
    })
  )
  water.rotation.x = -Math.PI / 2
  water.position.z = COAST.landEdge - 6 - 290
  group.add(water)

  // Rocks flank the inlet on both sides and stand in the water behind it. The beach side is left open.
  const inletRocks: Array<[number, number, number]> = [
    [-7.2, 4.5, 1.5],
    [-6.6, 2.4, 1.2],
    [-5.6, 0.4, 1.4],
    [7.2, 4.5, 1.6],
    [6.6, 2.4, 1.3],
    [5.6, 0.4, 1.2],
    [-5.5, 9.5, 1.3],
    [5.8, 10.5, 1.6],
    [0.5, 13.5, 1.1]
  ]
  const inletMouth = shoreline(INLET.x)
  for (const [across, out, size] of inletRocks) {
    const x = INLET.x + across
    const z = inletMouth - out
    group.add(rock(random, x, z, size))
    obstacles.push({ x, z, r: size * 0.85 })
  }

  // Walls of rock close off both ends of the beach.
  for (const x of [COAST.west - 2.5, COAST.east + 2.5]) {
    for (let z = COAST.landEdge + 2; z > SHORE_Z - SEA.reach - 6; z -= 3.4) {
      // Underwater the wall becomes a tall cliff of boulders.
      const deep = -groundHeight(x, z) > 4
      group.add(rock(random, x + (random() - 0.5) * 2, z, (deep ? 5 : 2.4) + random() * (deep ? 3 : 1.4)))
    }
  }

  // Shells and pebbles scattered on the sand.
  const trinketColors = ['#ffd1dc', '#fff5e6', '#d9c7f2', '#c9b79a']
  for (let i = 0; i < 46; i++) {
    const x = COAST.west + random() * (COAST.east - COAST.west)
    const z = shoreline(x) + 0.5 + random() * 8
    if (Math.abs(x - INLET.x) < 8) continue
    const trinket = new THREE.Mesh(
      rockGeometry,
      new THREE.MeshLambertMaterial({ color: trinketColors[i % trinketColors.length]!, flatShading: true })
    )
    trinket.scale.setScalar(0.1 + random() * 0.12)
    trinket.position.set(x, 0.08, z)
    group.add(trinket)
  }

  // A ribbon that follows the shape of the shoreline. One copy sits at the water's edge as foam;
  // the others drift in from the sea as lines of little waves.
  const foam = new THREE.Mesh(shorelineRibbon(random, false), lineMaterial(0.75))
  group.add(foam)
  const waveRibbon = shorelineRibbon(random, true)
  const waves = Array.from({ length: WAVES }, () => {
    const wave = new THREE.Mesh(waveRibbon, lineMaterial(0))
    // Each line is slid sideways by a different amount so their gaps do not line up.
    wave.userData['slide'] = (random() - 0.5) * 40
    group.add(wave)
    return wave
  })

  return {
    group,
    obstacles,
    setWaterOpacity(opacity) {
      water.material.opacity = opacity
    },
    update(timeSeconds) {
      const level = waterLevel(timeSeconds)
      water.position.y = level
      // The foam follows the water's edge as the sea rises and falls.
      foam.position.set(0, level + 0.015, -0.25 + (level + 0.07) * 6)
      waves.forEach((wave, i) => {
        const life = (timeSeconds / WAVE_SECONDS + i / WAVES) % 1
        wave.position.set(wave.userData['slide'] as number, level + 0.012, -(1 - life) * WAVE_START)
        wave.material.opacity = 0.3 * Math.sin(Math.PI * life) ** 2
      })
    }
  }
}

const WAVES = 7
/** How far out a wave line first appears, and how long it takes to roll in. */
const WAVE_START = 30
const WAVE_SECONDS = 26

function lineMaterial(opacity: number): THREE.MeshBasicMaterial {
  return new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity, depthWrite: false })
}

/**
 * A thin strip lying along the shoreline, built at the water's edge. Move it in z to push it out to sea.
 * `broken` chops it into wobbly dashes, which reads as little waves instead of one ruled line.
 */
function shorelineRibbon(random: () => number, broken: boolean): THREE.BufferGeometry {
  const positions: number[] = []
  const indices: number[] = []
  let x = -160
  while (x < 160) {
    const length = broken ? 5 + random() * 11 : 320
    const wobble = random() * Math.PI * 2
    const first = positions.length / 3
    const steps = Math.ceil(length)
    for (let step = 0; step <= steps; step++) {
      const along = step / steps
      const px = x + along * length
      // Dashes taper to a point at both ends and rise and fall a little along their length.
      const halfWidth = broken ? 0.03 + 0.11 * Math.sin(Math.PI * along) : 0.3
      const z = shoreline(px) + (broken ? 0.35 * Math.sin(px * 0.4 + wobble) : 0)
      positions.push(px, 0, z - halfWidth, px, 0, z + halfWidth)
      if (step < steps) {
        const corner = first + step * 2
        indices.push(corner, corner + 1, corner + 2, corner + 1, corner + 3, corner + 2)
      }
    }
    x += length + (broken ? 3 + random() * 9 : 0)
  }
  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
  geometry.setIndex(indices)
  return geometry
}
