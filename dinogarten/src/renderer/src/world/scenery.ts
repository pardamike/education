import * as THREE from 'three'
import { buildCoast, isCoast, WORLD_RADIUS } from './coast'
import { fernFrond, scatter, swayingMaterial, type Placement } from './plants'
import { buildSeabed } from './seabed'
import { buildVolcanoes } from './volcanoes'

/** A circle on the ground the player cannot walk through. */
export interface Obstacle {
  x: number
  z: number
  r: number
}

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

/**
 * Builds the ground, plants, pond and far-off mountains.
 * `keepClear` lists spots (the player's start, each dinosaur) where nothing may grow.
 */
export function buildScenery(keepClear: Obstacle[]): {
  group: THREE.Group
  obstacles: Obstacle[]
  /** Every tree, with half its width and its height. Trees are tall enough to hide the player from the camera. */
  trees: Array<{ object: THREE.Object3D; radius: number; height: number }>
  /** Lets the player blow a bubble underwater. */
  blowBubble: (from: THREE.Vector3) => void
  /** Call once a frame to keep the moving scenery (lava, smoke, waves, ferns, sea plants, fish) going. */
  update: (timeSeconds: number, deltaSeconds: number) => void
} {
  const random = seededRandom(20261125)
  const group = new THREE.Group()
  const obstacles: Obstacle[] = []

  // Mossy ground covers everything south of the coast. The beach and sea take over to the north.
  // There was no grass in the dinosaurs' time; ferns grow over this further down.
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(1200, 630), paint('#8ccf63'))
  ground.rotation.x = -Math.PI / 2
  ground.position.z = 285
  ground.receiveShadow = true
  group.add(ground)

  const coast = buildCoast(random)
  group.add(coast.group)
  obstacles.push(...coast.obstacles)

  // Patches of lighter moss and bare earth so the ground is not one flat colour.
  for (let i = 0; i < 26; i++) {
    const angle = random() * Math.PI * 2
    const distance = Math.sqrt(random()) * (WORLD_RADIUS + 10)
    const radius = 2 + random() * 5
    const patch = flatDisc(radius, random() < 0.7 ? '#9bd974' : '#e9d9a1', 0.01 + i * 0.0005)
    patch.position.x = Math.cos(angle) * distance
    patch.position.z = Math.sin(angle) * distance
    // Keep patches clear of the sand at the back of the beach.
    if (isCoast(patch.position.z, 9 + radius)) continue
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

  const trees: THREE.Group[] = []
  const anyTree = (): THREE.Group => {
    const pick = random()
    const tree = pick < 0.4 ? cycad(random) : pick < 0.7 ? leafyTree(random) : conifer(random)
    trees.push(tree)
    return tree
  }

  // Scattered trees and rocks inside the play area, never crowding each other.
  for (let i = 0, placed = 0; i < 400 && placed < 34; i++) {
    const angle = random() * Math.PI * 2
    const distance = 6 + Math.sqrt(random()) * (WORLD_RADIUS - 8)
    const x = Math.cos(angle) * distance
    const z = Math.sin(angle) * distance
    if (!isFree(x, z, 2.2) || isCoast(z, -2)) continue
    if (random() < 0.25) place(rock(random), x, z, 0.8 + random() * 0.8, 0.9)
    else place(anyTree(), x, z, 0.9 + random() * 0.5, 0.7)
    placed++
  }

  // A thick ring of trees marks the edge of the meadow, except to the north where it opens onto the beach.
  for (let i = 0; i < 90; i++) {
    const angle = (i / 90) * Math.PI * 2 + random() * 0.05
    const distance = WORLD_RADIUS + 2.5 + random() * 7
    const x = Math.cos(angle) * distance
    const z = Math.sin(angle) * distance
    if (isCoast(z, 6)) continue
    place(anyTree(), x, z, 1.2 + random() * 0.9, 0)
  }
  // Trees also line the back of the beach on either side of the meadow.
  for (const side of [-1, 1]) {
    for (let x = 27; x < 50; x += 2.4) {
      place(anyTree(), side * (x + random()), -19 + random() * 4, 1.2 + random() * 0.9, 0)
    }
  }

  // The ground cover of the dinosaurs' world: ferns everywhere, horsetails where it is damp, and
  // small flowers, which had only just appeared. You can walk straight through all of it.
  const breeze = { value: 0 }
  const rustling = swayingMaterial(breeze, 0.35)
  const FERN_GREENS = ['#3f9a4a', '#4fae56', '#2f8a4c', '#63b85a']
  const fronds: Placement[] = []
  for (let i = 0; i < 1050; i++) {
    const angle = random() * Math.PI * 2
    const distance = Math.sqrt(random()) * (WORLD_RADIUS + 6)
    const x = Math.cos(angle) * distance
    const z = Math.sin(angle) * distance
    // Leave the pond, the beach and the spot where the player starts clear.
    if (isCoast(z, 3) || Math.hypot(x - pond.x, z - pond.z) < pond.r + 1.2 || Math.hypot(x, z) < 2.5) continue
    const shade = FERN_GREENS[i % FERN_GREENS.length]!
    const size = 0.55 + random() * 0.75
    const count = 6 + Math.floor(random() * 3)
    const twist = random() * Math.PI * 2
    for (let frond = 0; frond < count; frond++) {
      fronds.push({
        x,
        y: 0.02,
        z,
        scale: [size, size * (0.85 + random() * 0.3), size],
        rotation: [0.75 + random() * 0.35, twist + (frond / count) * Math.PI * 2, 0],
        shade
      })
    }
  }
  group.add(scatter(fernFrond(), rustling, fronds))

  const stalks: Placement[] = []
  for (let clump = 0; clump < 12; clump++) {
    const angle = (clump / 12) * Math.PI * 2 + random() * 0.4
    const distance = pond.r + 1.3 + random() * 2.2
    const centreX = pond.x + Math.cos(angle) * distance
    const centreZ = pond.z + Math.sin(angle) * distance
    for (let i = 0; i < 10; i++) {
      stalks.push({
        x: centreX + (random() - 0.5) * 1.4,
        y: 0,
        z: centreZ + (random() - 0.5) * 1.4,
        scale: [1, 0.6 + random() * 0.9, 1],
        rotation: [(random() - 0.5) * 0.12, random() * 3, (random() - 0.5) * 0.12],
        shade: random() < 0.5 ? '#7fbf5f' : '#69ab52'
      })
    }
  }
  // A horsetail is a thin, jointed stalk. The joints are rings a little wider than the stalk.
  const horsetail = new THREE.CylinderGeometry(0.02, 0.03, 1, 6, 1).translate(0, 0.5, 0)
  group.add(scatter(horsetail, rustling, stalks))
  const joints: Placement[] = stalks.flatMap((stalk) =>
    [0.25, 0.5, 0.75].map((up) => ({
      ...stalk,
      y: up * stalk.scale[1],
      scale: [1, 1, 1] as [number, number, number],
      shade: '#4f8f45'
    }))
  )
  group.add(scatter(new THREE.CylinderGeometry(0.042, 0.042, 0.04, 6), paint('#ffffff'), joints))

  const flowerColors = ['#ff8fb1', '#ffd447', '#ffffff', '#c59bff']
  for (let i = 0; i < 90; i++) {
    const angle = random() * Math.PI * 2
    const distance = Math.sqrt(random()) * (WORLD_RADIUS + 4)
    const x = Math.cos(angle) * distance
    const z = Math.sin(angle) * distance
    if (!isFree(x, z, 0.3) || isCoast(z)) continue
    const flower = part(blobGeometry, flowerColors[i % flowerColors.length]!, false)
    flower.scale.setScalar(0.14)
    flower.position.set(x, 0.14, z)
    group.add(flower)
  }

  // Hazy mountains ring the whole world, far behind the volcanoes.
  const mountainColors = ['#9fb7c9', '#a9c4b1', '#b3bfd6']
  for (let i = 0; i < 30; i++) {
    const angle = (i / 30) * Math.PI * 2 + random() * 0.15
    const distance = 250 + random() * 60
    const peak = mountain(32 + random() * 22, 30 + random() * 34, mountainColors[i % mountainColors.length]!)
    peak.position.x = Math.cos(angle) * distance
    peak.position.z = Math.sin(angle) * distance
    group.add(peak)
  }

  const volcanoes = buildVolcanoes()
  group.add(volcanoes.group)
  obstacles.push(...volcanoes.obstacles)

  // The underwater scenery keeps clear of the volcanoes' feet and of anything that lives down there.
  const seabed = buildSeabed(random, [...volcanoes.obstacles, ...keepClear])
  group.add(seabed.group)
  obstacles.push(...seabed.obstacles)

  const box = new THREE.Box3()
  const size = new THREE.Vector3()
  return {
    group,
    obstacles,
    trees: trees.map((tree) => {
      box.setFromObject(tree).getSize(size)
      return { object: tree, radius: Math.max(size.x, size.z) / 2, height: box.max.y }
    }),
    blowBubble: seabed.blowBubble,
    update(timeSeconds, deltaSeconds) {
      breeze.value = timeSeconds
      volcanoes.update(timeSeconds, deltaSeconds)
      coast.update(timeSeconds)
      seabed.update(timeSeconds, deltaSeconds)
    }
  }
}
