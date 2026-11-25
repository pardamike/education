import * as THREE from 'three'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'
import { groundHeight, waterLevel } from './coast'
import type { Creature, DinoLook } from './Dino'
import { skinMaterial } from './parts'

// The Mosasaurus has no 3D model file. Nothing free matched the rest of the cast, so it is built
// here: a long body spun from a profile curve and bent by a chain of bones, a separate skull and
// lower jaw with teeth, four paddles and a tail fin. It also steers itself around the deep water.

/** Where a swimmer patrols: an oval around a point, at a depth below the surface. */
export interface SwimSpec {
  /** The middle of the oval: [x, z]. */
  around: [number, number]
  /** How far the oval reaches east-west and north-south from its middle. */
  width: number
  length: number
  /** How far below the surface it cruises. */
  depth: number
}

/** The body's outline from tail tip (0) to neck (1): [how far along, how thick], thickness as a fraction of total length. */
const BODY: Array<[number, number]> = [
  [0, 0.004],
  [0.07, 0.013],
  [0.24, 0.026],
  [0.42, 0.046],
  [0.58, 0.066],
  [0.72, 0.074],
  [0.84, 0.067],
  [0.93, 0.055],
  [1, 0.049]
]

/** The head's outline from the back of the skull (0) to the tip of the snout (1). A long, narrow, crocodile-like wedge. */
const HEAD: Array<[number, number]> = [
  [0, 0.049],
  [0.22, 0.05],
  [0.5, 0.04],
  [0.76, 0.028],
  [0.93, 0.017],
  [1, 0.007]
]

/** The head takes up this much of the animal's length. */
const HEAD_SHARE = 0.17
/** How many bendable segments the spine has. */
const SEGMENTS = 10

const CRUISE_SPEED = 3.4
const APPROACH_SPEED = 5.2
/** It comes over to look at the player from this far away, and stops this far short. */
const NOTICE_DISTANCE = 20
const GREETING_DISTANCE = 9

function tinted(geometry: THREE.BufferGeometry, shade: THREE.ColorRepresentation): THREE.BufferGeometry {
  const color = new THREE.Color(shade)
  const flat = geometry.index ? geometry.toNonIndexed() : geometry
  const count = flat.getAttribute('position').count
  const colors = new Float32Array(count * 3)
  for (let i = 0; i < count; i++) color.toArray(colors, i * 3)
  flat.setAttribute('color', new THREE.BufferAttribute(colors, 3))
  flat.deleteAttribute('uv')
  flat.deleteAttribute('normal')
  return flat
}

/**
 * Half of the head: the skull (top) or the lower jaw (bottom). A half-tube with a flat pink face
 * where the mouth is, and a row of teeth down each side of that face. Built with the back of the
 * head at z = 0 and the snout pointing along +z.
 */
function jawHalf(length: number, top: boolean, skin: THREE.Color): THREE.BufferGeometry {
  const headLength = length * HEAD_SHARE
  const parts: THREE.BufferGeometry[] = []

  const outline = HEAD.map(([along, thick]) => new THREE.Vector2(thick * length, along * headLength))
  const shell = new THREE.LatheGeometry(outline, 14, top ? Math.PI / 2 : -Math.PI / 2, Math.PI)
  shell.rotateX(Math.PI / 2)
  shell.scale(0.86, top ? 0.95 : 0.5, 1)
  parts.push(tinted(shell, top ? skin : skin.clone().lerp(new THREE.Color('#dfe9ea'), 0.75)))

  // The roof of the mouth, or the tongue side of the lower jaw.
  const face: number[] = []
  for (let i = 0; i < HEAD.length - 1; i++) {
    const [a, wa] = HEAD[i]!
    const [b, wb] = HEAD[i + 1]!
    const za = a * headLength
    const zb = b * headLength
    const xa = wa * length * 0.86
    const xb = wb * length * 0.86
    face.push(-xa, 0, za, xa, 0, za, xb, 0, zb, -xa, 0, za, xb, 0, zb, -xb, 0, zb)
  }
  const mouth = new THREE.BufferGeometry()
  mouth.setAttribute('position', new THREE.Float32BufferAttribute(face, 3))
  parts.push(tinted(mouth, '#d9737c'))

  // Teeth along both edges, from the corner of the mouth to the tip of the snout.
  const toothCount = top ? 11 : 10
  for (let i = 0; i < toothCount; i++) {
    const along = 0.3 + (i + (top ? 0 : 0.5)) * (0.68 / toothCount)
    // The width of the head at this point along it.
    let width = HEAD[HEAD.length - 1]![1]
    for (let k = 0; k < HEAD.length - 1; k++) {
      const [a, wa] = HEAD[k]!
      const [b, wb] = HEAD[k + 1]!
      if (along >= a && along <= b) width = wa + ((wb - wa) * (along - a)) / (b - a)
    }
    const toothLength = length * (0.016 + 0.006 * Math.sin(i * 1.7))
    for (const side of [-1, 1]) {
      const tooth = new THREE.ConeGeometry(length * 0.0042, toothLength, 5).translate(0, toothLength / 2, 0)
      if (top) tooth.rotateX(Math.PI)
      tooth.translate(side * width * length * 0.86 * 0.9, 0, along * headLength)
      parts.push(tinted(tooth, '#fffdf2'))
    }
  }
  const merged = mergeGeometries(parts)
  merged.computeVertexNormals()
  return merged
}

export class Mosasaur implements Creature {
  readonly root = new THREE.Group()
  readonly radius: number
  readonly height: number

  private readonly bones: THREE.Bone[] = []
  private readonly paddles: Array<{ paddle: THREE.Object3D; restZ: number; side: number }> = []
  private readonly body = new THREE.Group()
  private readonly jaw: THREE.Mesh
  private time = Math.random() * 10
  private heading = 0
  private speed = CRUISE_SPEED
  private turning = 0

  constructor(
    look: DinoLook,
    private readonly swims: SwimSpec
  ) {
    const length = look.length ?? 13
    this.radius = length / 2
    this.height = look.height
    const back = new THREE.Color(look.colors?.['Back'] ?? '#2d4a5e')
    const belly = new THREE.Color(look.colors?.['Belly'] ?? '#cfdde0')
    const headLength = length * HEAD_SHARE
    const bodyLength = length - headLength
    const snoutZ = length * 0.45
    const neckZ = snoutZ - headLength
    const segment = bodyLength / SEGMENTS

    // The body: the profile spun into a tube, laid along z from the tail tip to the neck, and narrowed.
    const geometry = new THREE.LatheGeometry(
      BODY.map(([along, thick]) => new THREE.Vector2(thick * length, along * bodyLength)),
      22
    )
    geometry.rotateX(Math.PI / 2)
    geometry.translate(0, 0, neckZ - bodyLength)
    geometry.scale(0.8, 1, 1)

    const position = geometry.getAttribute('position')
    const colors = new Float32Array(position.count * 3)
    const skinIndex = new Uint16Array(position.count * 4)
    const skinWeight = new Float32Array(position.count * 4)
    const color = new THREE.Color()
    for (let i = 0; i < position.count; i++) {
      // Dark on top with darker bands across the back, pale underneath.
      const upness = THREE.MathUtils.smoothstep(position.getY(i) / (0.074 * length), -0.5, 0.15)
      const band = 0.8 + 0.2 * Math.sin(position.getZ(i) * (20 / length))
      color.copy(belly).lerp(back.clone().multiplyScalar(band), upness).toArray(colors, i * 3)
      // Each point follows the two spine bones it sits between.
      const along = THREE.MathUtils.clamp((neckZ - position.getZ(i)) / segment, 0, SEGMENTS)
      const bone = Math.min(SEGMENTS - 1, Math.floor(along))
      skinIndex.set([bone, bone + 1, 0, 0], i * 4)
      skinWeight.set([1 - (along - bone), along - bone, 0, 0], i * 4)
    }
    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3))
    geometry.setAttribute('skinIndex', new THREE.BufferAttribute(skinIndex, 4))
    geometry.setAttribute('skinWeight', new THREE.BufferAttribute(skinWeight, 4))
    geometry.computeVertexNormals()

    const painted = new THREE.MeshLambertMaterial({ vertexColors: true, emissive: back, emissiveIntensity: 0.25 })
    const skin = new THREE.SkinnedMesh(geometry, painted)
    skin.castShadow = true
    skin.frustumCulled = false

    // The spine: a chain of bones from the neck back to the tail tip.
    for (let i = 0; i <= SEGMENTS; i++) {
      const bone = new THREE.Bone()
      bone.position.z = i === 0 ? neckZ : -segment
      if (i > 0) this.bones[i - 1]!.add(bone)
      this.bones.push(bone)
    }
    skin.add(this.bones[0]!)
    skin.bind(new THREE.Skeleton(this.bones))
    this.body.add(skin)
    this.root.add(this.body)
    this.root.updateMatrixWorld(true)

    /** Pins a part to a spine bone where it currently sits, so it moves with that stretch of the body. */
    const pin = (object: THREE.Object3D, bone: number): void => {
      this.body.add(object)
      object.updateMatrixWorld(true)
      this.bones[bone]!.attach(object)
    }

    // The head: a skull and a lower jaw that hangs a little open, both lined with teeth.
    const headMaterial = new THREE.MeshLambertMaterial({
      vertexColors: true,
      emissive: back,
      emissiveIntensity: 0.25,
      side: THREE.DoubleSide
    })
    const skull = new THREE.Mesh(jawHalf(length, true, back), headMaterial)
    skull.position.z = neckZ
    pin(skull, 0)
    this.jaw = new THREE.Mesh(jawHalf(length, false, back), headMaterial)
    this.jaw.position.z = neckZ
    pin(this.jaw, 0)
    skull.castShadow = this.jaw.castShadow = true

    // Narrow amber eyes under heavy brows.
    const eyeBall = new THREE.SphereGeometry(1, 12, 9)
    const amber = new THREE.MeshLambertMaterial({ color: '#ffcf4a', emissive: '#7a5a10' })
    const slit = new THREE.MeshBasicMaterial({ color: '#141414' })
    const browMaterial = skinMaterial(back.clone().multiplyScalar(0.55))
    for (const side of [-1, 1]) {
      const eye = new THREE.Group()
      const ball = new THREE.Mesh(eyeBall, amber)
      ball.scale.setScalar(length * 0.0125)
      const pupil = new THREE.Mesh(eyeBall, slit)
      pupil.scale.set(length * 0.0035, length * 0.0105, length * 0.006)
      pupil.position.z = length * 0.0085
      const brow = new THREE.Mesh(eyeBall, browMaterial)
      brow.scale.set(length * 0.018, length * 0.0045, length * 0.011)
      brow.position.set(0, length * 0.0105, length * 0.004)
      // Tipped down toward the snout: a scowl.
      brow.rotation.z = side * 0.45
      eye.add(ball, pupil, brow)
      eye.position.set(side * length * 0.039, length * 0.026, neckZ + headLength * 0.3)
      eye.lookAt(eye.position.clone().add(new THREE.Vector3(side, 0.05, 0.9)))
      pin(eye, 0)
    }

    // Four paddles: a big pair behind the head, a smaller pair further back.
    const paddleGeometry = new THREE.SphereGeometry(1, 14, 8)
    const paddleMaterial = skinMaterial(back.clone().multiplyScalar(0.85))
    for (const [bone, z, size] of [
      [1, neckZ - bodyLength * 0.12, 1],
      [5, neckZ - bodyLength * 0.5, 0.7]
    ] as const) {
      for (const side of [-1, 1]) {
        const paddle = new THREE.Mesh(paddleGeometry, paddleMaterial)
        paddle.scale.set(0.085 * length * size, 0.008 * length, 0.034 * length * size)
        paddle.position.set(side * 0.085 * length * size, -0.035 * length, z)
        // Swept back and tipped down.
        paddle.rotation.set(0, side * 0.6, -side * 0.45)
        paddle.castShadow = true
        pin(paddle, bone)
        this.paddles.push({ paddle, restZ: paddle.rotation.z, side })
      }
    }

    // The tail fin: two swept-back blades, a small one above and a bigger one below, like a shark's turned upside down.
    for (const [up, tall, sweep] of [
      [1, 0.05, 0.85],
      [-1, 0.085, 0.75]
    ] as const) {
      const lobe = new THREE.Mesh(paddleGeometry, paddleMaterial)
      lobe.scale.set(0.006 * length, tall * length, 0.03 * length)
      lobe.rotation.x = up * sweep
      lobe.position.set(0, up * tall * length * 0.55, neckZ - bodyLength + 0.02 * length)
      lobe.castShadow = true
      pin(lobe, SEGMENTS)
    }

    const [startX, startZ] = swims.around
    this.root.position.set(startX + swims.width, waterLevel(0) - swims.depth, startZ)
    this.root.rotation.order = 'YXZ'
  }

  update(deltaSeconds: number, playerPosition?: THREE.Vector3 | null): void {
    this.time += deltaSeconds
    const position = this.root.position

    // Where it wants to be: on its patrol oval, or in front of the player if he has swum close.
    const [centreX, centreZ] = this.swims.around
    const lap = this.time * 0.11
    const target = new THREE.Vector3(
      centreX + Math.cos(lap) * this.swims.width,
      waterLevel(0) - this.swims.depth + Math.sin(this.time * 0.27) * 1.3,
      centreZ + Math.sin(lap) * this.swims.length
    )
    let wantedSpeed = CRUISE_SPEED
    let facePlayer = false
    if (playerPosition && playerPosition.y < -2) {
      const away = Math.hypot(position.x - playerPosition.x, position.z - playerPosition.z)
      if (away < NOTICE_DISTANCE) {
        // Aim for a spot just short of the player, on its own side of him.
        const fromPlayerX = (position.x - playerPosition.x) / (away || 1)
        const fromPlayerZ = (position.z - playerPosition.z) / (away || 1)
        target.set(
          playerPosition.x + fromPlayerX * GREETING_DISTANCE,
          playerPosition.y + 2.2,
          playerPosition.z + fromPlayerZ * GREETING_DISTANCE
        )
        const short = away - GREETING_DISTANCE
        // Close enough: stop and hang there, so it never crowds him.
        wantedSpeed = short > 0.6 ? Math.min(APPROACH_SPEED, 0.6 + short * 1.2) : 0
        if (short <= 0.6) {
          facePlayer = true
          target.set(playerPosition.x, target.y, playerPosition.z)
        }
      }
    }

    // Turn toward the target, but only so fast: a big animal sweeps round in a curve.
    const wantedHeading = Math.atan2(target.x - position.x, target.z - position.z)
    const difference = Math.atan2(Math.sin(wantedHeading - this.heading), Math.cos(wantedHeading - this.heading))
    const turnRate = facePlayer ? 1.6 : 0.85
    const turn = THREE.MathUtils.clamp(difference, -turnRate * deltaSeconds, turnRate * deltaSeconds)
    this.heading += turn
    this.turning += (turn / Math.max(deltaSeconds, 0.001) - this.turning) * Math.min(1, 3 * deltaSeconds)
    this.speed += (wantedSpeed - this.speed) * Math.min(1, 1.5 * deltaSeconds)

    position.x += Math.sin(this.heading) * this.speed * deltaSeconds
    position.z += Math.cos(this.heading) * this.speed * deltaSeconds
    // Never scraping the bottom, never breaking the surface.
    const lowest = groundHeight(position.x, position.z) + this.height * 1.4
    const highest = waterLevel(0) - this.height * 1.2
    const climb = (THREE.MathUtils.clamp(target.y, lowest, highest) - position.y) * Math.min(1, 0.9 * deltaSeconds)
    position.y += climb

    // Nose follows the climb, and it banks into its turns.
    this.root.rotation.set(-climb / Math.max(deltaSeconds, 0.001) / 8, this.heading, -this.turning * 0.3)

    // A wave runs down the body to the tail, stronger the faster it swims.
    const effort = 0.35 + 0.65 * Math.min(1, this.speed / CRUISE_SPEED)
    for (let i = 2; i <= SEGMENTS; i++) {
      const reach = (i - 1) / (SEGMENTS - 1)
      this.bones[i]!.rotation.y = 0.15 * effort * reach * Math.sin(this.time * 2.4 - i * 0.62) + this.turning * 0.06 * reach
    }
    for (const { paddle, restZ, side } of this.paddles) {
      paddle.rotation.z = restZ + side * 0.18 * Math.sin(this.time * 1.6)
    }
    // The jaw hangs open a little and works slowly, wider when it is looking straight at the player.
    this.jaw.rotation.x = (facePlayer ? 0.2 : 0.1) + 0.08 * Math.sin(this.time * 1.1)
  }
}
