import * as THREE from 'three'

/** A circle on the ground the player cannot walk through. */
export interface Obstacle {
  x: number
  z: number
  r: number
}

/** The player can roam this far from the middle of the world. */
export const WORLD_RADIUS = 36

export const SKY_COLOR = '#a9defa'

/** Small seeded random generator so the world looks the same every time. */
function seededRandom(seed: number): () => number {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const materials = new Map<string, THREE.MeshLambertMaterial>()
function paint(color: string): THREE.MeshLambertMaterial {
  let material = materials.get(color)
  if (!material) {
    material = new THREE.MeshLambertMaterial({ color, flatShading: true })
    materials.set(color, material)
  }
  return material
}

function part(geometry: THREE.BufferGeometry, color: string, castShadow = true): THREE.Mesh {
  const mesh = new THREE.Mesh(geometry, paint(color))
  mesh.castShadow = castShadow
  return mesh
}

const trunkGeometry = new THREE.CylinderGeometry(0.22, 0.34, 1, 6)
const coneGeometry = new THREE.ConeGeometry(1, 1, 7)
const blobGeometry = new THREE.IcosahedronGeometry(1, 0)
const frondGeometry = new THREE.ConeGeometry(0.32, 2.4, 4).translate(0, 1.2, 0)
const rockGeometry = new THREE.DodecahedronGeometry(1, 0)

const LEAF_GREENS = ['#3fa34d', '#57b65a', '#2f8f4e', '#6cc35f']

function conifer(random: () => number): THREE.Group {
  const tree = new THREE.Group()
  const trunk = part(trunkGeometry, '#9a6b3f')
  trunk.scale.y = 1.4
  trunk.position.y = 0.7
  tree.add(trunk)
  const green = LEAF_GREENS[Math.floor(random() * LEAF_GREENS.length)]!
  for (let tier = 0; tier < 3; tier++) {
    const cone = part(coneGeometry, green)
    const width = 1.5 - tier * 0.35
    cone.scale.set(width, 1.5, width)
    cone.position.y = 1.7 + tier * 0.95
    tree.add(cone)
  }
  return tree
}

function leafyTree(random: () => number): THREE.Group {
  const tree = new THREE.Group()
  const trunk = part(trunkGeometry, '#8a5a35')
  trunk.scale.y = 2
  trunk.position.y = 1
  tree.add(trunk)
  const green = LEAF_GREENS[Math.floor(random() * LEAF_GREENS.length)]!
  const blobs: Array<[number, number, number, number]> = [
    [0, 2.7, 0, 1.3],
    [0.8, 2.3, 0.3, 0.9],
    [-0.7, 2.4, -0.4, 1]
  ]
  for (const [x, y, z, size] of blobs) {
    const blob = part(blobGeometry, green)
    blob.scale.setScalar(size)
    blob.position.set(x, y, z)
    blob.rotation.set(random() * 3, random() * 3, random() * 3)
    tree.add(blob)
  }
  return tree
}

/** A stubby prehistoric palm: fat trunk with a crown of drooping fronds. */
function cycad(random: () => number): THREE.Group {
  const tree = new THREE.Group()
  const trunk = part(trunkGeometry, '#a9794a')
  trunk.scale.set(1.5, 1.3, 1.5)
  trunk.position.y = 0.65
  tree.add(trunk)
  const green = LEAF_GREENS[Math.floor(random() * LEAF_GREENS.length)]!
  const fronds = 8
  for (let i = 0; i < fronds; i++) {
    const frond = part(frondGeometry, green)
    frond.scale.z = 0.3
    const pivot = new THREE.Group()
    pivot.position.y = 1.2
    pivot.rotation.y = (i / fronds) * Math.PI * 2
    frond.rotation.x = 0.95 + random() * 0.35
    pivot.add(frond)
    tree.add(pivot)
  }
  return tree
}

function rock(random: () => number): THREE.Mesh {
  const mesh = part(rockGeometry, random() < 0.5 ? '#b9b3a8' : '#a7a196')
  mesh.scale.set(0.7 + random() * 0.6, 0.5 + random() * 0.4, 0.7 + random() * 0.6)
  mesh.rotation.y = random() * Math.PI
  mesh.position.y = 0.25
  return mesh
}

function flatDisc(radius: number, color: string, height: number): THREE.Mesh {
  const disc = new THREE.Mesh(new THREE.CircleGeometry(radius, 40), paint(color))
  disc.rotation.x = -Math.PI / 2
  disc.position.y = height
  disc.receiveShadow = true
  return disc
}

function mountain(radius: number, height: number, color: string): THREE.Mesh {
  const mesh = part(new THREE.ConeGeometry(radius, height, 6), color, false)
  mesh.position.y = height / 2 - 1
  return mesh
}

function volcano(): THREE.Group {
  const group = new THREE.Group()
  const height = 36
  const cone = part(new THREE.CylinderGeometry(6, 28, height, 8), '#8f7b6f', false)
  cone.position.y = height / 2 - 1
  const lava = part(new THREE.CylinderGeometry(5.4, 6.4, 2.5, 8), '#ff7a3c', false)
  lava.position.y = height - 0.6
  group.add(cone, lava)
  const smoke: Array<[number, number, number, number]> = [
    [0, height + 4, 0, 3.5],
    [2.5, height + 9, 0, 4.5],
    [5.5, height + 15, 0, 5.5]
  ]
  for (const [x, y, z, size] of smoke) {
    const puff = new THREE.Mesh(blobGeometry, new THREE.MeshBasicMaterial({ color: '#f4f1ec' }))
    puff.scale.setScalar(size)
    puff.position.set(x, y, z)
    group.add(puff)
  }
  return group
}

/**
 * Builds the ground, plants, pond and far-off mountains.
 * `keepClear` lists spots (the player's start, each dinosaur) where nothing may grow.
 */
export function buildScenery(keepClear: Obstacle[]): { group: THREE.Group; obstacles: Obstacle[] } {
  const random = seededRandom(20261125)
  const group = new THREE.Group()
  const obstacles: Obstacle[] = []

  group.add(flatDisc(400, '#8ccf63', 0))

  // Lighter and sandier patches so the ground is not one flat colour.
  for (let i = 0; i < 26; i++) {
    const angle = random() * Math.PI * 2
    const distance = Math.sqrt(random()) * (WORLD_RADIUS + 10)
    const patch = flatDisc(2 + random() * 5, random() < 0.7 ? '#9bd974' : '#e9d9a1', 0.01 + i * 0.0005)
    patch.position.x = Math.cos(angle) * distance
    patch.position.z = Math.sin(angle) * distance
    group.add(patch)
  }

  const pond: Obstacle = { x: -11, z: -9, r: 4.6 }
  const shore = flatDisc(pond.r + 0.9, '#f0e0ac', 0.03)
  const water = flatDisc(pond.r, '#68c4f2', 0.04)
  shore.position.x = water.position.x = pond.x
  shore.position.z = water.position.z = pond.z
  group.add(shore, water)
  obstacles.push(pond)

  const blocked = [...keepClear, { ...pond, r: pond.r + 2 }]
  const isFree = (x: number, z: number, margin: number): boolean =>
    blocked.every((spot) => Math.hypot(x - spot.x, z - spot.z) > spot.r + margin)

  const place = (object: THREE.Object3D, x: number, z: number, size: number, radius: number): void => {
    object.position.x = x
    object.position.z = z
    object.rotation.y = random() * Math.PI * 2
    object.scale.multiplyScalar(size)
    group.add(object)
    if (radius > 0) {
      const obstacle = { x, z, r: radius * size }
      obstacles.push(obstacle)
      blocked.push(obstacle)
    }
  }

  const anyTree = (): THREE.Group => {
    const pick = random()
    return pick < 0.4 ? cycad(random) : pick < 0.7 ? leafyTree(random) : conifer(random)
  }

  // Scattered trees and rocks inside the play area, never crowding each other.
  for (let i = 0, placed = 0; i < 400 && placed < 34; i++) {
    const angle = random() * Math.PI * 2
    const distance = 6 + Math.sqrt(random()) * (WORLD_RADIUS - 8)
    const x = Math.cos(angle) * distance
    const z = Math.sin(angle) * distance
    if (!isFree(x, z, 2.2)) continue
    if (random() < 0.25) place(rock(random), x, z, 0.8 + random() * 0.8, 0.9)
    else place(anyTree(), x, z, 0.9 + random() * 0.5, 0.7)
    placed++
  }

  // A thick ring of trees marks the edge of the world.
  for (let i = 0; i < 90; i++) {
    const angle = (i / 90) * Math.PI * 2 + random() * 0.05
    const distance = WORLD_RADIUS + 2.5 + random() * 7
    place(anyTree(), Math.cos(angle) * distance, Math.sin(angle) * distance, 1.2 + random() * 0.9, 0)
  }

  // Little ferns and flowers; you can walk straight through these.
  const flowerColors = ['#ff8fb1', '#ffd447', '#ffffff', '#c59bff']
  for (let i = 0; i < 150; i++) {
    const angle = random() * Math.PI * 2
    const distance = Math.sqrt(random()) * (WORLD_RADIUS + 4)
    const x = Math.cos(angle) * distance
    const z = Math.sin(angle) * distance
    if (!isFree(x, z, 0.3)) continue
    if (random() < 0.5) {
      const fern = part(coneGeometry, LEAF_GREENS[i % LEAF_GREENS.length]!, false)
      fern.scale.set(0.35, 0.5, 0.35)
      fern.position.set(x, 0.25, z)
      group.add(fern)
    } else {
      const flower = part(blobGeometry, flowerColors[i % flowerColors.length]!, false)
      flower.scale.setScalar(0.14)
      flower.position.set(x, 0.14, z)
      group.add(flower)
    }
  }

  // Far-off mountains all the way round, with a volcano straight ahead.
  const mountainColors = ['#9fb7c9', '#a9c4b1', '#b3bfd6']
  for (let i = 0; i < 22; i++) {
    const angle = (i / 22) * Math.PI * 2 + random() * 0.2
    const distance = 95 + random() * 30
    const peak = mountain(14 + random() * 10, 18 + random() * 20, mountainColors[i % mountainColors.length]!)
    peak.position.x = Math.cos(angle) * distance
    peak.position.z = Math.sin(angle) * distance
    group.add(peak)
  }
  const fireMountain = volcano()
  fireMountain.position.set(14, 0, -92)
  group.add(fireMountain)

  return { group, obstacles }
}
