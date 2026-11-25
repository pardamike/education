import * as THREE from 'three'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'
import { groundHeight, SEA, shoreline, waterLevel } from './coast'
import { Puffs } from './puffs'
import type { Obstacle } from './scenery'

// The underwater world: everything that grows, sits or swims on the deep sea floor.
//
// Everything here lived in the seas of the dinosaurs' time (the Late Cretaceous, alongside the
// Mosasaurus): seagrass meadows, sea lilies, reefs of rudist clams, giant platter clams, coral,
// sea urchins, ammonites with coiled and straight shells, and shoals of bony fish. There is no
// kelp on purpose: kelp forests only appeared tens of millions of years after the dinosaurs.
// See DINOSAURS.md for the sources.

/** The stretch of sea that gets scenery: between these x values, and this far out from the shoreline. */
const ZONE = { west: -42, east: 42, slope: SEA.dropStart + 2, deep: SEA.dropEnd - 6, far: SEA.reach + 12 }

const GRASS_COLORS = ['#58b368', '#7cc46a', '#4a9e6b', '#93cf73']
const LILY_COLORS = ['#ffcf5a', '#ff9d5c', '#f36f6f', '#f7e7b0', '#e58bd0']
const CORAL_COLORS = ['#ff8fa8', '#ffab6b', '#c9a0ff', '#ffd98a']
const RUDIST_COLORS = ['#efe2c4', '#e8cdb6', '#d9c7a8', '#eab8b0']
const FISH_COLORS = ['#ffd166', '#ff9f5a', '#e8f1f5', '#8fd3ff']

const BUBBLE_SPEED = 2.4

/** A blade one unit tall that tapers to a point, split into segments so it can bend. */
function bladeShape(width: number, segments: number): THREE.BufferGeometry {
  const blade = new THREE.PlaneGeometry(width, 1, 1, segments).translate(0, 0.5, 0)
  const position = blade.getAttribute('position')
  for (let i = 0; i < position.count; i++) {
    position.setX(i, position.getX(i) * (1 - 0.7 * position.getY(i)))
  }
  blade.computeVertexNormals()
  return blade
}

/** Plants sway because this material pushes each point sideways, more the nearer it is to the tip. */
function swayingMaterial(time: { value: number }): THREE.MeshLambertMaterial {
  const material = new THREE.MeshLambertMaterial({ side: THREE.DoubleSide })
  material.onBeforeCompile = (shader) => {
    shader.uniforms['swayTime'] = time
    shader.vertexShader =
      'uniform float swayTime;\n' +
      shader.vertexShader.replace(
        '#include <begin_vertex>',
        /* glsl */ `#include <begin_vertex>
        #ifdef USE_INSTANCING
          float swayPhase = instanceMatrix[3].x * 0.37 + instanceMatrix[3].z * 0.53;
        #else
          float swayPhase = 0.0;
        #endif
        float swayBend = position.y * position.y;
        transformed.x += sin(swayTime * 1.3 + swayPhase + position.y * 2.5) * 0.3 * swayBend;
        transformed.z += cos(swayTime * 0.9 + swayPhase * 1.3 + position.y * 2.0) * 0.2 * swayBend;`
      )
  }
  return material
}

/** Paints every point of a shape one colour, so shapes of different colours can be merged into one. */
function tinted(geometry: THREE.BufferGeometry, shade: string): THREE.BufferGeometry {
  const color = new THREE.Color(shade)
  const count = geometry.getAttribute('position').count
  const colors = new Float32Array(count * 3)
  for (let i = 0; i < count; i++) color.toArray(colors, i * 3)
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3))
  return geometry
}

/** An ammonite's coiled shell: balls shrinking along a spiral, striped light and dark like ribs. */
function coiledShell(): THREE.BufferGeometry {
  const chambers: THREE.BufferGeometry[] = []
  for (let i = 0; i < 18; i++) {
    const angle = i * 0.5
    const shrink = 0.9 ** i
    const chamber = new THREE.SphereGeometry(0.27 * shrink, 9, 7)
    chamber.scale(1, 1, 0.75)
    chamber.translate(Math.cos(angle) * 0.6 * shrink, Math.sin(angle) * 0.6 * shrink, 0)
    chambers.push(tinted(chamber, i % 2 === 0 ? '#f4e3c1' : '#d9a878'))
  }
  return mergeGeometries(chambers)
}

/** The soft animal poking out of a shell's opening: an eye and a bunch of little arms. */
function arms(at: THREE.Vector3, pointing: THREE.Vector3): THREE.BufferGeometry[] {
  const parts: THREE.BufferGeometry[] = []
  const turn = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), pointing.clone().normalize())
  for (let i = 0; i < 7; i++) {
    const arm = new THREE.ConeGeometry(0.045, 0.5, 5).translate(0, 0.25, 0)
    arm.rotateZ((i - 3) * 0.16)
    arm.rotateX(((i % 3) - 1) * 0.22)
    arm.applyQuaternion(turn)
    arm.translate(at.x, at.y, at.z)
    parts.push(tinted(arm, '#f2a8a0'))
  }
  for (const side of [-1, 1]) {
    const eye = new THREE.SphereGeometry(0.055, 7, 5).translate(at.x, at.y + 0.02, at.z + side * 0.14)
    parts.push(tinted(eye, '#2b2b33'))
  }
  return parts
}

/** A living ammonite, built to travel along +x with its shell leading and its arms trailing. */
function swimmingAmmonite(): THREE.BufferGeometry {
  return mergeGeometries([coiledShell(), ...arms(new THREE.Vector3(0.5, -0.22, 0), new THREE.Vector3(-0.2, -1, 0))])
}

/** A straight-shelled ammonite (a baculite): a long cone with the animal at the wide end. */
function straightAmmonite(): THREE.BufferGeometry {
  const shell = new THREE.ConeGeometry(0.15, 1.7, 8).rotateZ(-Math.PI / 2)
  return mergeGeometries([tinted(shell, '#ead9b8'), ...arms(new THREE.Vector3(-0.85, 0, 0), new THREE.Vector3(-1, 0, 0))])
}

/** A rudist: a clam shaped like an ice-cream cone standing on its point, with a flat lid. */
function rudistShape(): THREE.BufferGeometry {
  const horn = new THREE.CylinderGeometry(0.3, 0.08, 1, 7).translate(0, 0.5, 0)
  const lid = new THREE.CylinderGeometry(0.32, 0.3, 0.08, 7).translate(0, 1.03, 0)
  return mergeGeometries([horn, lid])
}

/** A giant platter clam (an inoceramid), lying on the sand with its two shells a little open. */
function platterClam(): THREE.BufferGeometry {
  const lower = new THREE.SphereGeometry(1, 16, 8).scale(1, 0.13, 0.85)
  const upper = new THREE.SphereGeometry(1, 16, 8).scale(1, 0.13, 0.85)
  upper.translate(1, 0, 0).rotateZ(0.3).translate(-1, 0.06, 0)
  return mergeGeometries([tinted(lower, '#e9dcc0'), tinted(upper, '#f4ead2')])
}

/** A sea urchin: a dark ball bristling with spines. */
function urchinShape(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [new THREE.IcosahedronGeometry(0.2, 1)]
  const ball = new THREE.IcosahedronGeometry(1, 0).getAttribute('position')
  const up = new THREE.Vector3(0, 1, 0)
  const outward = new THREE.Vector3()
  for (let i = 0; i < ball.count; i += 2) {
    outward.fromBufferAttribute(ball, i).normalize()
    if (outward.y < -0.3) continue
    const spine = new THREE.ConeGeometry(0.02, 0.34, 4).translate(0, 0.3, 0)
    spine.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(up, outward))
    parts.push(spine)
  }
  return mergeGeometries(parts.map((part) => (part.index ? part.toNonIndexed() : part)))
}

/** A little fish: a stretched diamond for the body with a flat tail behind. It points along +z. */
function fishShape(): THREE.BufferGeometry {
  const body = new THREE.OctahedronGeometry(1).scale(0.09, 0.17, 0.36)
  const tail = new THREE.OctahedronGeometry(1).scale(0.02, 0.15, 0.12).translate(0, 0, -0.42)
  return mergeGeometries([body, tail])
}

interface Placement {
  x: number
  y: number
  z: number
  /** Width, height, depth. */
  scale: [number, number, number]
  /** Tilt forward, turn, tilt sideways: in that order of importance, turn is applied first. */
  rotation: [number, number, number]
  shade?: string
}

/** Draws many copies of one shape in a single mesh. */
function scatter(geometry: THREE.BufferGeometry, material: THREE.Material, items: Placement[]): THREE.InstancedMesh {
  const mesh = new THREE.InstancedMesh(geometry, material, items.length)
  const placer = new THREE.Object3D()
  placer.rotation.order = 'YXZ'
  const color = new THREE.Color()
  items.forEach((item, i) => {
    placer.position.set(item.x, item.y, item.z)
    placer.rotation.set(...item.rotation)
    placer.scale.set(...item.scale)
    placer.updateMatrix()
    mesh.setMatrixAt(i, placer.matrix)
    if (item.shade) mesh.setColorAt(i, color.set(item.shade))
  })
  mesh.frustumCulled = false
  return mesh
}

export function buildSeabed(
  random: () => number,
  keepClear: Obstacle[]
): {
  group: THREE.Group
  obstacles: Obstacle[]
  /** Lets the player blow a bubble from wherever his head is. */
  blowBubble: (from: THREE.Vector3) => void
  update: (timeSeconds: number, deltaSeconds: number) => void
} {
  const group = new THREE.Group()
  const obstacles: Obstacle[] = []
  const blocked = [...keepClear]
  const pick = <T>(list: T[]): T => list[Math.floor(random() * list.length)]!
  const floor = (x: number, z: number): number => groundHeight(x, z)

  /** A random spot on the sea floor between two distances out from the shore, clear of everything placed so far. */
  const findSpot = (nearOut: number, farOut: number, margin: number): { x: number; z: number } | null => {
    for (let attempt = 0; attempt < 30; attempt++) {
      const x = ZONE.west + random() * (ZONE.east - ZONE.west)
      const z = shoreline(x) - (nearOut + random() * (farOut - nearOut))
      if (blocked.every((spot) => Math.hypot(x - spot.x, z - spot.z) > spot.r + margin)) return { x, z }
    }
    return null
  }
  /** Some of everything also grows on the slope down from the beach, so the deep is not a surprise. */
  const anywhere = (index: number, onSlope: number, margin: number): { x: number; z: number } | null =>
    findSpot(index < onSlope ? ZONE.slope : ZONE.deep, ZONE.far, margin)

  // Boulders first, since they are the only things here the player has to walk round.
  const rockGeometry = new THREE.DodecahedronGeometry(1, 0)
  const rockMaterials = ['#8f9a9c', '#7c8a8e', '#a3a89b'].map(
    (shade) => new THREE.MeshLambertMaterial({ color: shade, flatShading: true })
  )
  for (let i = 0; i < 20; i++) {
    const spot = anywhere(i, 5, 3)
    if (!spot) continue
    const size = 1.3 + random() * 2.4
    const rock = new THREE.Mesh(rockGeometry, rockMaterials[i % rockMaterials.length]!)
    rock.scale.set(size * (0.8 + random() * 0.5), size * (0.6 + random() * 0.7), size * (0.8 + random() * 0.5))
    rock.rotation.set(random() * 0.5, random() * Math.PI, random() * 0.5)
    rock.position.set(spot.x, floor(spot.x, spot.z) + size * 0.25, spot.z)
    rock.castShadow = rock.receiveShadow = true
    group.add(rock)
    const obstacle = { x: spot.x, z: spot.z, r: size * 0.95 }
    obstacles.push(obstacle)
    blocked.push(obstacle)
  }

  const swayTime = { value: 0 }
  const swaying = swayingMaterial(swayTime)
  const solid = new THREE.MeshLambertMaterial()
  const painted = new THREE.MeshLambertMaterial({ vertexColors: true })

  // Seagrass meadows: hundreds of short blades in patches.
  const grass: Placement[] = []
  for (let meadow = 0; meadow < 22; meadow++) {
    const centre = anywhere(meadow, 6, 1)
    if (!centre) continue
    const spread = 2.5 + random() * 3
    for (let blade = 0; blade < 46; blade++) {
      const angle = random() * Math.PI * 2
      const distance = Math.sqrt(random()) * spread
      const x = centre.x + Math.cos(angle) * distance
      const z = centre.z + Math.sin(angle) * distance
      grass.push({
        x,
        y: floor(x, z) - 0.05,
        z,
        scale: [2.2 + random() * 1.6, 0.5 + random() * 0.9, 1],
        rotation: [0, random() * Math.PI, 0],
        shade: pick(GRASS_COLORS)
      })
    }
  }
  group.add(scatter(bladeShape(0.1, 4), swaying, grass))

  // Sea lilies (crinoids): animals that look like flowers. A stalk, a cup, and a crown of feathery arms.
  const stalks: Placement[] = []
  const cups: Placement[] = []
  const crowns: Placement[] = []
  for (let garden = 0; garden < 12; garden++) {
    const centre = anywhere(garden, 3, 1.5)
    if (!centre) continue
    for (let lily = 0; lily < 3 + Math.floor(random() * 4); lily++) {
      const x = centre.x + (random() - 0.5) * 4
      const z = centre.z + (random() - 0.5) * 4
      const tall = 1.2 + random() * 1.8
      const top = floor(x, z) + tall
      const shade = pick(LILY_COLORS)
      stalks.push({ x, y: floor(x, z) - 0.05, z, scale: [1, tall + 0.05, 1], rotation: [0, 0, 0], shade: '#cdbd98' })
      cups.push({ x, y: top, z, scale: [0.13, 0.16, 0.13], rotation: [0, 0, 0], shade })
      for (let arm = 0; arm < 9; arm++) {
        crowns.push({
          x,
          y: top,
          z,
          scale: [1, 0.55 + random() * 0.4, 1],
          rotation: [0.55 + random() * 0.45, (arm / 9) * Math.PI * 2, 0],
          shade
        })
      }
    }
  }
  group.add(scatter(new THREE.CylinderGeometry(0.035, 0.055, 1, 5).translate(0, 0.5, 0), solid, stalks))
  group.add(scatter(new THREE.IcosahedronGeometry(1, 1), solid, cups))
  group.add(scatter(bladeShape(0.12, 4), swaying, crowns))

  // Rudist reefs: clusters of cone-shaped clams standing on their points. They built the reefs of this era.
  const rudists: Placement[] = []
  for (let reef = 0; reef < 16; reef++) {
    const centre = anywhere(reef, 3, 1.5)
    if (!centre) continue
    for (let i = 0; i < 6 + Math.floor(random() * 9); i++) {
      const x = centre.x + (random() - 0.5) * 3
      const z = centre.z + (random() - 0.5) * 3
      const size = 0.6 + random() * 0.9
      rudists.push({
        x,
        y: floor(x, z) - 0.08,
        z,
        scale: [size, size * (0.9 + random() * 0.8), size],
        rotation: [(random() - 0.5) * 0.5, random() * Math.PI, (random() - 0.5) * 0.5],
        shade: pick(RUDIST_COLORS)
      })
    }
  }
  const rudistMesh = scatter(rudistShape(), solid, rudists)
  rudistMesh.castShadow = true
  group.add(rudistMesh)

  // Rounded coral heads, dotted about.
  const corals: Placement[] = []
  for (let i = 0; i < 26; i++) {
    const spot = anywhere(i, 4, 1)
    if (!spot) continue
    const size = 0.35 + random() * 0.6
    corals.push({
      x: spot.x,
      y: floor(spot.x, spot.z) + size * 0.25,
      z: spot.z,
      scale: [size, size * 0.7, size],
      rotation: [0, random() * 3, 0],
      shade: pick(CORAL_COLORS)
    })
  }
  const coralMesh = scatter(new THREE.IcosahedronGeometry(1, 1), solid, corals)
  coralMesh.castShadow = true
  group.add(coralMesh)

  // Giant platter clams. The real ones grew to two metres across.
  const clams: Placement[] = []
  for (let i = 0; i < 9; i++) {
    const spot = findSpot(ZONE.deep, ZONE.far, 2)
    if (!spot) continue
    const size = 0.9 + random() * 0.9
    clams.push({
      x: spot.x,
      y: floor(spot.x, spot.z) + 0.1,
      z: spot.z,
      scale: [size, size, size],
      rotation: [(random() - 0.5) * 0.15, random() * Math.PI * 2, 0]
    })
  }
  const clamMesh = scatter(platterClam(), painted, clams)
  clamMesh.castShadow = true
  group.add(clamMesh)

  // Empty ammonite shells on the sand, and sea urchins.
  const emptyShells: Placement[] = []
  for (let i = 0; i < 10; i++) {
    const spot = findSpot(ZONE.deep, ZONE.far, 1)
    if (!spot) continue
    const size = 0.7 + random() * 0.8
    emptyShells.push({
      x: spot.x,
      y: floor(spot.x, spot.z) + 0.12 * size,
      z: spot.z,
      scale: [size, size, size],
      rotation: [-Math.PI / 2 + (random() - 0.5) * 0.4, random() * Math.PI * 2, 0]
    })
  }
  group.add(scatter(coiledShell(), painted, emptyShells))

  const urchins: Placement[] = []
  for (let i = 0; i < 30; i++) {
    const spot = anywhere(i, 6, 0.5)
    if (!spot) continue
    const size = 0.8 + random() * 0.9
    urchins.push({
      x: spot.x,
      y: floor(spot.x, spot.z) + 0.14 * size,
      z: spot.z,
      scale: [size, size, size],
      rotation: [0, random() * 3, 0],
      shade: random() < 0.5 ? '#5a3d6b' : '#3d3550'
    })
  }
  group.add(scatter(urchinShape(), solid, urchins))

  // Living ammonites, coiled and straight, drifting about above the sea floor.
  const drifters = (count: number, low: number, high: number) =>
    Array.from({ length: count }, () => {
      const spot = findSpot(ZONE.deep, ZONE.far - 6, 3) ?? { x: 0, z: shoreline(0) - ZONE.deep - 12 }
      return {
        x: spot.x,
        y: floor(spot.x, spot.z) + low + random() * (high - low),
        z: spot.z,
        phase: random() * 20,
        size: 0.8 + random() * 0.8,
        direction: random() < 0.5 ? 1 : -1
      }
    })
  const coiled = drifters(9, 2, 6)
  const straight = drifters(8, 2.5, 7)
  const coiledMesh = new THREE.InstancedMesh(swimmingAmmonite(), painted, coiled.length)
  const straightMesh = new THREE.InstancedMesh(straightAmmonite(), painted, straight.length)
  coiledMesh.frustumCulled = straightMesh.frustumCulled = false
  group.add(coiledMesh, straightMesh)

  // Shoals of fish, each circling a point that itself wanders slowly about.
  const shoals = Array.from({ length: 4 }, (_, i) => {
    const spot = findSpot(ZONE.deep, ZONE.far - 8, 4) ?? { x: 0, z: shoreline(0) - ZONE.deep - 10 }
    return {
      x: spot.x,
      y: floor(spot.x, spot.z) + 3 + random() * 4,
      z: spot.z,
      phase: random() * 10,
      direction: i % 2 === 0 ? 1 : -1,
      fish: Array.from({ length: 14 }, () => ({
        offset: random() * Math.PI * 2,
        radius: 1.2 + random() * 2.4,
        height: (random() - 0.5) * 1.6,
        size: 0.7 + random() * 0.7
      }))
    }
  })
  const fishCount = shoals.reduce((sum, shoal) => sum + shoal.fish.length, 0)
  const fishMesh = new THREE.InstancedMesh(fishShape(), solid, fishCount)
  fishMesh.frustumCulled = false
  const fishColor = new THREE.Color()
  for (let i = 0; i < fishCount; i++) fishMesh.setColorAt(i, fishColor.set(FISH_COLORS[i % FISH_COLORS.length]!))
  group.add(fishMesh)

  // Bubbles: streams rising from vents in the sea floor, plus any the player blows.
  const bubbles = new Puffs(
    new THREE.IcosahedronGeometry(1, 1),
    new THREE.MeshBasicMaterial({ color: '#e8f7ff', transparent: true, opacity: 0.55 }),
    140,
    { gravity: 0, drift: new THREE.Vector3(), sizeAt: (life) => 0.7 + 0.6 * life }
  )
  group.add(bubbles.mesh)
  const vents = Array.from({ length: 7 }, () => {
    const spot = findSpot(ZONE.deep, ZONE.far, 1) ?? { x: 0, z: -90 }
    return { position: new THREE.Vector3(spot.x, floor(spot.x, spot.z), spot.z), owed: random() }
  })
  const blowBubble = (from: THREE.Vector3): void => {
    const rise = BUBBLE_SPEED * (0.8 + Math.random() * 0.5)
    const lifetime = Math.max(0.2, (waterLevel(0) - from.y) / rise)
    const velocity = new THREE.Vector3((Math.random() - 0.5) * 0.5, rise, (Math.random() - 0.5) * 0.5)
    bubbles.launch(from, velocity, 0.06 + Math.random() * 0.14, lifetime)
  }

  const placer = new THREE.Object3D()
  return {
    group,
    obstacles,
    blowBubble,
    update(timeSeconds, deltaSeconds) {
      swayTime.value = timeSeconds

      // Ammonites puff slowly back and forth, bobbing as they go.
      for (const [mesh, animals, reach] of [
        [coiledMesh, coiled, 5],
        [straightMesh, straight, 9]
      ] as const) {
        animals.forEach((animal, i) => {
          const swing = Math.sin(timeSeconds * 0.12 + animal.phase)
          const heading = Math.cos(timeSeconds * 0.12 + animal.phase) * animal.direction >= 0 ? 0 : Math.PI
          placer.position.set(
            animal.x + swing * reach * animal.direction,
            animal.y + Math.sin(timeSeconds * 0.8 + animal.phase) * 0.35,
            animal.z + Math.sin(timeSeconds * 0.07 + animal.phase * 2) * 3
          )
          placer.rotation.set(0, heading, Math.sin(timeSeconds * 0.8 + animal.phase) * 0.12)
          placer.scale.setScalar(animal.size)
          placer.updateMatrix()
          mesh.setMatrixAt(i, placer.matrix)
        })
        mesh.instanceMatrix.needsUpdate = true
      }

      let index = 0
      for (const shoal of shoals) {
        const centreX = shoal.x + Math.sin(timeSeconds * 0.11 + shoal.phase) * 9
        const centreY = shoal.y + Math.sin(timeSeconds * 0.17 + shoal.phase) * 1.2
        const centreZ = shoal.z + Math.cos(timeSeconds * 0.13 + shoal.phase) * 6
        for (const fish of shoal.fish) {
          const angle = timeSeconds * 0.7 * shoal.direction + fish.offset
          placer.position.set(
            centreX + Math.cos(angle) * fish.radius,
            centreY + fish.height + Math.sin(timeSeconds * 1.3 + fish.offset) * 0.2,
            centreZ + Math.sin(angle) * fish.radius * 0.7
          )
          // Each fish faces the way it is travelling round the circle.
          placer.rotation.set(0, Math.atan2(-Math.sin(angle) * shoal.direction, Math.cos(angle) * 0.7 * shoal.direction), 0)
          placer.scale.setScalar(fish.size)
          placer.updateMatrix()
          fishMesh.setMatrixAt(index++, placer.matrix)
        }
      }
      fishMesh.instanceMatrix.needsUpdate = true

      for (const vent of vents) {
        vent.owed += deltaSeconds * 2.2
        while (vent.owed >= 1) {
          vent.owed -= 1
          blowBubble(vent.position)
        }
      }
      bubbles.update(deltaSeconds, -Infinity)
    }
  }
}
