import * as THREE from 'three'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'
import { groundHeight, waterLevel } from './coast'
import { makeEye, type Creature, type DinoLook } from './Dino'

// The big swimming reptiles have no 3D model files: nothing free matched the rest of the cast.
// Each is built here as one smooth skin stretched over a row of cross-sections from tail tip to
// snout, bent by a chain of bones, with flippers growing out of its sides. It also steers itself.

/** Where a swimmer lives: an oval around a point, at a depth below the surface. */
export interface SwimSpec {
  /** The middle of the oval: [x, z]. */
  around: [number, number]
  /** How far the oval reaches east-west and north-south from its middle. */
  width: number
  length: number
  /** How far below the surface it cruises. */
  depth: number
}

export type SeaReptileKind = 'mosasaurus' | 'plesiosaurus'

/** One cross-section of a body. Every measurement is a fraction of the animal's length. */
interface Slice {
  /** How far along the body it is: 0 is the tip of the tail, 1 the tip of the snout. */
  at: number
  /** Half the body's width here. */
  wide: number
  /** How far the body reaches above and below its widest point. */
  up: number
  down: number
  /** How high the widest point sits. Lets a neck rise or a tail droop. */
  rise: number
}

interface FlipperSpec {
  /** How far along the body the flipper grows from. */
  at: number
  /** How far round the body from the top of the back, in degrees. 90 is straight out sideways. */
  round: number
  /** Its length as a fraction of the animal's length, and its width as a fraction of its own length. */
  long: number
  broad: number
  /** How far it angles back toward the tail and down toward the sea floor, in degrees. */
  sweep: number
  droop: number
}

interface Design {
  slices: Slice[]
  /** Everything in front of this point is the head, which moves as one stiff piece. */
  headFrom: number
  /** The point the animal turns about, usually its chest. */
  pivot: number
  /** A lower jaw that hangs open and shows its teeth. Left out, the mouth stays shut. */
  jaw?: Slice[]
  flippers: FlipperSpec[]
  eyes: { at: number; round: number; size: number; fierce: boolean }
  /** How much the body snakes from side to side, and how hard the flippers beat. */
  snake: number
  beat: number
  cruiseSpeed: number
  approachSpeed: number
  /** It comes to look at the player, stopping this far short and this far above him. */
  greetingDistance: number
  greetingHeight: number
  /** How many dark bands cross its back. */
  bands: number
  backColor: string
  bellyColor: string
}

const slice = (at: number, wide: number, up: number, down: number, rise = 0): Slice => ({ at, wide, up, down, rise })

const DESIGNS: Record<SeaReptileKind, Design> = {
  // Long and low like a giant crocodile with flippers: a narrow toothy head, a deep chest, and a
  // tail that ends in a tall downturned fin.
  mosasaurus: {
    slices: [
      slice(0, 0.002, 0.01, 0.02, -0.034),
      slice(0.04, 0.004, 0.042, 0.05, -0.014),
      slice(0.09, 0.006, 0.032, 0.036, -0.002),
      slice(0.15, 0.011, 0.019, 0.021),
      slice(0.25, 0.022, 0.027, 0.029),
      slice(0.38, 0.036, 0.042, 0.046),
      slice(0.5, 0.05, 0.056, 0.062),
      slice(0.62, 0.057, 0.062, 0.07),
      slice(0.72, 0.055, 0.058, 0.064),
      slice(0.8, 0.046, 0.05, 0.052),
      slice(0.84, 0.043, 0.049, 0.044, -0.004),
      // The head. Its underside is flat: that is the roof of the mouth, and the jaw closes against it.
      slice(0.865, 0.044, 0.052, 0.008, -0.012),
      slice(0.89, 0.042, 0.05, 0.003, -0.013),
      slice(0.93, 0.034, 0.04, 0.003, -0.013),
      slice(0.965, 0.024, 0.027, 0.003, -0.013),
      slice(0.99, 0.013, 0.013, 0.002, -0.013),
      slice(1, 0.004, 0.004, 0.002, -0.013)
    ],
    headFrom: 0.84,
    pivot: 0.62,
    jaw: [
      slice(0.83, 0.034, 0.004, 0.04, -0.014),
      slice(0.865, 0.041, 0.003, 0.036, -0.015),
      slice(0.9, 0.038, 0.003, 0.029, -0.015),
      slice(0.94, 0.03, 0.003, 0.021, -0.015),
      slice(0.975, 0.019, 0.002, 0.012, -0.015),
      slice(0.995, 0.005, 0.001, 0.004, -0.015)
    ],
    flippers: [
      { at: 0.7, round: 110, long: 0.15, broad: 0.4, sweep: 38, droop: 28 },
      { at: 0.4, round: 110, long: 0.1, broad: 0.4, sweep: 42, droop: 26 }
    ],
    eyes: { at: 0.895, round: 58, size: 0.0115, fierce: true },
    snake: 1,
    beat: 0.16,
    cruiseSpeed: 3.4,
    approachSpeed: 5.2,
    greetingDistance: 10.5,
    greetingHeight: 2.2,
    bands: 11,
    backColor: '#2d4a5e',
    bellyColor: '#cfdde0'
  },
  // A broad, turtle-shaped body with four big flippers, a short tail, and a small head on a long neck.
  plesiosaurus: {
    slices: [
      slice(0, 0.002, 0.003, 0.003),
      slice(0.05, 0.012, 0.012, 0.013),
      slice(0.12, 0.034, 0.03, 0.033),
      slice(0.22, 0.066, 0.052, 0.058),
      slice(0.34, 0.09, 0.066, 0.074),
      slice(0.46, 0.086, 0.064, 0.07),
      slice(0.55, 0.062, 0.05, 0.056, 0.002),
      slice(0.61, 0.034, 0.033, 0.036, 0.008),
      slice(0.68, 0.02, 0.021, 0.022, 0.018),
      slice(0.78, 0.016, 0.017, 0.017, 0.034),
      slice(0.87, 0.015, 0.016, 0.016, 0.046),
      slice(0.905, 0.022, 0.022, 0.018, 0.05),
      slice(0.945, 0.031, 0.027, 0.02, 0.052),
      slice(0.98, 0.022, 0.015, 0.013, 0.049),
      slice(1, 0.006, 0.005, 0.005, 0.048)
    ],
    headFrom: 0.89,
    pivot: 0.42,
    flippers: [
      { at: 0.5, round: 108, long: 0.23, broad: 0.3, sweep: 28, droop: 26 },
      { at: 0.26, round: 108, long: 0.2, broad: 0.3, sweep: 38, droop: 24 }
    ],
    eyes: { at: 0.95, round: 50, size: 0.013, fierce: false },
    snake: 0.3,
    beat: 0.4,
    cruiseSpeed: 2.6,
    approachSpeed: 3.8,
    greetingDistance: 6.5,
    greetingHeight: 1.2,
    bands: 0,
    backColor: '#e39b4a',
    bellyColor: '#fbeecb'
  }
}

/** How many bendable segments the spine has, from the back of the head to the tip of the tail. */
const SEGMENTS = 12
/** How many rings of points make up the skin, and how many points are in each. More is smoother. */
const RINGS = 110
const AROUND = 28

const MOUTH_PINK = new THREE.Color('#d9737c')
const NOTICE_DISTANCE = 22

/** The cross-section at any point along the body, blended smoothly from the ones that were written down. */
function sliceAt(slices: Slice[], at: number): Slice {
  const last = slices.length - 1
  let i = 0
  while (i < last - 1 && slices[i + 1]!.at < at) i++
  const a = slices[i]!
  const b = slices[i + 1]!
  const span = b.at - a.at
  const t = THREE.MathUtils.clamp((at - a.at) / span, 0, 1)
  // The slope at a written-down slice is taken from its two neighbours, so the curve passes through without a kink.
  const slope = (index: number, read: (s: Slice) => number): number => {
    const before = slices[Math.max(0, index - 1)]!
    const after = slices[Math.min(last, index + 1)]!
    return (read(after) - read(before)) / (after.at - before.at)
  }
  const blend = (read: (s: Slice) => number): number => {
    const t2 = t * t
    const t3 = t2 * t
    return (
      (2 * t3 - 3 * t2 + 1) * read(a) +
      (t3 - 2 * t2 + t) * span * slope(i, read) +
      (-2 * t3 + 3 * t2) * read(b) +
      (t3 - t2) * span * slope(i + 1, read)
    )
  }
  return {
    at,
    wide: Math.max(0.0015, blend((s) => s.wide)),
    up: Math.max(0.0012, blend((s) => s.up)),
    down: Math.max(0.0012, blend((s) => s.down)),
    rise: blend((s) => s.rise)
  }
}

/** A point on the skin: `round` is the angle from the top of the back, in radians, positive toward the animal's left. */
function onSkin(s: Slice, round: number, length: number, z: number): THREE.Vector3 {
  const across = Math.sin(round)
  const upward = Math.cos(round)
  return new THREE.Vector3(s.wide * across * length, (s.rise + (upward >= 0 ? s.up : s.down) * upward) * length, z)
}

/**
 * A flipper one unit long: narrow where it joins the body, broad in the middle, rounded at the tip.
 * It grows along +y and is thin from side to side.
 */
function flipperShape(): THREE.BufferGeometry {
  const outline = new THREE.SplineCurve(
    [
      [0.07, 0],
      [0.19, 0.12],
      [0.29, 0.34],
      [0.3, 0.56],
      [0.22, 0.8],
      [0.11, 0.95],
      [0, 1]
    ].map(([r, y]) => new THREE.Vector2(r, y))
  )
  return new THREE.LatheGeometry(outline.getPoints(26), 18).scale(0.2, 1, 1)
}

export class SeaReptile implements Creature {
  readonly root = new THREE.Group()
  readonly radius: number
  readonly height: number

  private readonly design: Design
  private readonly bones: THREE.Bone[] = []
  private readonly flippers: Array<{ hinge: THREE.Object3D; side: number; phase: number }> = []
  private readonly jaw: THREE.Mesh | null = null
  private time = Math.random() * 10
  private heading = 0
  private speed: number
  private turning = 0

  constructor(
    kind: SeaReptileKind,
    look: DinoLook,
    private readonly swims: SwimSpec
  ) {
    const design = (this.design = DESIGNS[kind])
    const length = look.length ?? 12
    this.radius = length / 2
    this.height = look.height
    this.speed = design.cruiseSpeed
    const back = new THREE.Color(look.colors?.['Back'] ?? design.backColor)
    const belly = new THREE.Color(look.colors?.['Belly'] ?? design.bellyColor)
    const zAt = (at: number): number => (at - design.pivot) * length
    const segment = (design.headFrom * length) / SEGMENTS

    // The skin of the body and the top of the head, in one piece.
    const body = this.loft(design.slices, 0, 1, length, zAt, (s, round) => {
      const upward = Math.cos(round)
      // The flat underside of the head is the roof of the mouth.
      if (design.jaw && s.at > design.headFrom + 0.025 && upward < -0.25) return MOUTH_PINK
      const band = design.bands ? 0.84 + 0.16 * Math.sin(s.at * design.bands * Math.PI * 2) : 0.94 + 0.06 * Math.sin(s.at * 60)
      return belly.clone().lerp(back.clone().multiplyScalar(band), THREE.MathUtils.smoothstep(upward, -0.5, 0.15))
    })
    const position = body.getAttribute('position')
    const skinIndex = new Uint16Array(position.count * 4)
    const skinWeight = new Float32Array(position.count * 4)
    const headZ = zAt(design.headFrom)
    for (let i = 0; i < position.count; i++) {
      // Each point follows the two spine bones it sits between. The head follows the first bone alone.
      const along = THREE.MathUtils.clamp((headZ - position.getZ(i)) / segment, 0, SEGMENTS)
      const bone = Math.min(SEGMENTS - 1, Math.floor(along))
      skinIndex.set([bone, bone + 1, 0, 0], i * 4)
      skinWeight.set([1 - (along - bone), along - bone, 0, 0], i * 4)
    }
    body.setAttribute('skinIndex', new THREE.BufferAttribute(skinIndex, 4))
    body.setAttribute('skinWeight', new THREE.BufferAttribute(skinWeight, 4))

    const painted = new THREE.MeshLambertMaterial({ vertexColors: true, emissive: back, emissiveIntensity: 0.22 })
    const skin = new THREE.SkinnedMesh(body, painted)
    skin.castShadow = true
    skin.frustumCulled = false

    // The spine: a chain of bones from the back of the head to the tip of the tail.
    for (let i = 0; i <= SEGMENTS; i++) {
      const bone = new THREE.Bone()
      bone.position.z = i === 0 ? headZ : -segment
      if (i > 0) this.bones[i - 1]!.add(bone)
      this.bones.push(bone)
    }
    skin.add(this.bones[0]!)
    skin.bind(new THREE.Skeleton(this.bones))
    this.root.add(skin)
    this.root.updateMatrixWorld(true)

    /** Pins a part to the spine bone nearest to it, so it moves with that stretch of the body. */
    const pin = (object: THREE.Object3D, at: number): void => {
      const bone = this.bones[THREE.MathUtils.clamp(Math.round((design.headFrom - at) / (design.headFrom / SEGMENTS)), 0, SEGMENTS)]!
      this.root.add(object)
      object.updateMatrixWorld(true)
      bone.attach(object)
    }

    if (design.jaw) {
      // The lower jaw: its own piece of skin, hinged at the back of the head.
      const hinge = new THREE.Vector3(0, design.jaw[0]!.rise * length, zAt(design.headFrom))
      const first = design.jaw[0]!.at
      const lowerJaw = this.loft(design.jaw, first, design.jaw[design.jaw.length - 1]!.at, length, zAt, (_s, round) =>
        Math.cos(round) > 0.3 ? MOUTH_PINK : belly.clone().lerp(back, THREE.MathUtils.smoothstep(Math.abs(Math.sin(round)), 0.75, 1) * 0.55)
      ).translate(-hinge.x, -hinge.y, -hinge.z)
      const jaw = new THREE.Mesh(lowerJaw, painted)
      jaw.position.copy(hinge)
      jaw.castShadow = true
      jaw.add(new THREE.Mesh(this.teeth(design.jaw, false, length, zAt).translate(-hinge.x, -hinge.y, -hinge.z), painted))
      pin(jaw, 1)
      pin(new THREE.Mesh(this.teeth(design.slices, true, length, zAt), painted), 1)
      this.jaw = jaw
    }

    // Eyes sit on the surface of the head.
    const eyeSlice = sliceAt(design.slices, design.eyes.at)
    for (const side of [-1, 1]) {
      const round = side * THREE.MathUtils.degToRad(design.eyes.round)
      const spot = onSkin(eyeSlice, round, length, zAt(design.eyes.at))
      const outward = new THREE.Vector3(Math.sin(round), Math.cos(round) * 0.6, 0.55).normalize()
      const eye = design.eyes.fierce ? this.fierceEye(design.eyes.size * length, side, back) : makeEye(design.eyes.size * length, 0.6)
      eye.position.copy(spot).addScaledVector(outward, -design.eyes.size * length * 0.35)
      eye.lookAt(eye.position.clone().add(outward))
      pin(eye, 1)
    }

    // Flippers grow out of the body: the narrow end of each is buried under the skin.
    const flipperGeometry = flipperShape()
    const flipperColors = new Float32Array(flipperGeometry.getAttribute('position').count * 3)
    const dark = back.clone().multiplyScalar(0.88)
    for (let i = 0; i < flipperColors.length; i += 3) dark.toArray(flipperColors, i)
    flipperGeometry.setAttribute('color', new THREE.BufferAttribute(flipperColors, 3))
    design.flippers.forEach((spec, pair) => {
      const at = sliceAt(design.slices, spec.at)
      for (const side of [-1, 1]) {
        const hinge = new THREE.Group()
        hinge.position.copy(onSkin(at, side * THREE.MathUtils.degToRad(spec.round), length, zAt(spec.at))).multiply(new THREE.Vector3(0.72, 1, 1))
        const flipper = new THREE.Mesh(flipperGeometry, painted)
        const long = spec.long * length
        const broad = (long * spec.broad) / 0.6
        flipper.scale.set(broad, long, broad)
        // Laid flat and pointing out to the side, then angled down and swept back.
        flipper.rotation.set(0, side * THREE.MathUtils.degToRad(spec.sweep), -side * (Math.PI / 2 + THREE.MathUtils.degToRad(spec.droop)))
        flipper.castShadow = true
        hinge.add(flipper)
        pin(hinge, spec.at)
        this.flippers.push({ hinge, side, phase: pair * 1.6 })
      }
    })

    const [startX, startZ] = swims.around
    this.root.position.set(startX + swims.width, waterLevel(0) - swims.depth, startZ)
    this.root.rotation.order = 'YXZ'
  }

  /** Stretches a skin over the cross-sections between two points along the body. */
  private loft(
    slices: Slice[],
    from: number,
    to: number,
    length: number,
    zAt: (at: number) => number,
    colorAt: (s: Slice, round: number) => THREE.Color
  ): THREE.BufferGeometry {
    const positions: number[] = []
    const colors: number[] = []
    const indices: number[] = []
    for (let ring = 0; ring <= RINGS; ring++) {
      const s = sliceAt(slices, from + ((to - from) * ring) / RINGS)
      for (let i = 0; i < AROUND; i++) {
        const round = (i / AROUND) * Math.PI * 2
        onSkin(s, round, length, zAt(s.at)).toArray(positions, positions.length)
        colorAt(s, round).toArray(colors, colors.length)
        if (ring === RINGS) continue
        const a = ring * AROUND + i
        const b = ring * AROUND + ((i + 1) % AROUND)
        indices.push(a, a + AROUND, b, b, a + AROUND, b + AROUND)
      }
    }
    const geometry = new THREE.BufferGeometry()
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
    geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3))
    geometry.setIndex(indices)
    geometry.computeVertexNormals()
    return geometry
  }

  /** A row of teeth down each side of the mouth: hanging from the top of the head, or standing on the lower jaw. */
  private teeth(slices: Slice[], upper: boolean, length: number, zAt: (at: number) => number): THREE.BufferGeometry {
    const parts: THREE.BufferGeometry[] = []
    const count = upper ? 11 : 10
    const start = this.design.headFrom + 0.04
    for (let i = 0; i < count; i++) {
      const s = sliceAt(slices, start + ((i + (upper ? 0 : 0.5)) / count) * (0.985 - start))
      const tall = length * (0.017 + 0.005 * Math.sin(i * 1.7))
      for (const side of [-1, 1]) {
        const tooth = new THREE.ConeGeometry(length * 0.0034, tall, 8).translate(0, tall / 2, 0)
        if (upper) tooth.rotateX(Math.PI)
        tooth.translate(side * s.wide * length * 0.86, (s.rise + (upper ? -s.down : s.up)) * length, zAt(s.at))
        const colors = new Float32Array(tooth.getAttribute('position').count * 3).fill(1)
        tooth.setAttribute('color', new THREE.BufferAttribute(colors, 3))
        tooth.deleteAttribute('uv')
        parts.push(tooth)
      }
    }
    return mergeGeometries(parts)
  }

  /** A narrow amber eye with a slit pupil under a heavy, scowling brow. */
  private fierceEye(radius: number, side: number, skin: THREE.Color): THREE.Group {
    const eye = new THREE.Group()
    const ball = new THREE.SphereGeometry(1, 16, 12)
    const amber = new THREE.Mesh(ball, new THREE.MeshLambertMaterial({ color: '#ffcf4a', emissive: '#7a5a10' }))
    amber.scale.setScalar(radius)
    const slit = new THREE.Mesh(ball, new THREE.MeshBasicMaterial({ color: '#141414' }))
    slit.scale.set(radius * 0.28, radius * 0.82, radius * 0.5)
    slit.position.z = radius * 0.68
    const brow = new THREE.Mesh(ball, new THREE.MeshLambertMaterial({ color: skin.clone().multiplyScalar(0.6) }))
    brow.scale.set(radius * 1.35, radius * 0.3, radius * 0.95)
    brow.position.set(0, radius * 0.78, radius * 0.35)
    // Tipped down toward the snout: a scowl.
    brow.rotation.z = -side * 0.5
    eye.add(amber, slit, brow)
    return eye
  }

  update(deltaSeconds: number, playerPosition?: THREE.Vector3 | null): void {
    this.time += deltaSeconds
    const design = this.design
    const position = this.root.position
    const { width, length } = this.swims
    const [centreX, centreZ] = this.swims.around

    // Where it wants to be: on its patrol oval, or in front of the player if he has swum into its water.
    const lap = (this.time * design.cruiseSpeed) / ((width + length) / 2)
    const target = new THREE.Vector3(
      centreX + Math.cos(lap) * width,
      waterLevel(0) - this.swims.depth + Math.sin(this.time * 0.27) * 1.3,
      centreZ + Math.sin(lap) * length
    )
    let wantedSpeed = design.cruiseSpeed
    let facePlayer = false
    if (playerPosition && playerPosition.y < -2) {
      const away = Math.hypot(position.x - playerPosition.x, position.z - playerPosition.z)
      const across = (playerPosition.x - centreX) / (width + 6)
      const along = (playerPosition.z - centreZ) / (length + 6)
      if (away < NOTICE_DISTANCE && across * across + along * along < 1) {
        // Aim for a spot just short of the player, on its own side of him.
        const fromPlayerX = (position.x - playerPosition.x) / (away || 1)
        const fromPlayerZ = (position.z - playerPosition.z) / (away || 1)
        target.set(
          playerPosition.x + fromPlayerX * design.greetingDistance,
          playerPosition.y + design.greetingHeight,
          playerPosition.z + fromPlayerZ * design.greetingDistance
        )
        const short = away - design.greetingDistance
        // Close enough: stop and hang there, so it never crowds him.
        wantedSpeed = short > 0.6 ? Math.min(design.approachSpeed, 0.6 + short * 1.2) : 0
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
    const effort = 0.35 + 0.65 * Math.min(1, this.speed / design.cruiseSpeed)
    for (let i = 2; i <= SEGMENTS; i++) {
      const reach = (i - 1) / (SEGMENTS - 1)
      this.bones[i]!.rotation.y =
        design.snake * (0.13 * effort * reach * Math.sin(this.time * 2.4 - i * 0.55) + this.turning * 0.05 * reach)
    }
    for (const { hinge, side, phase } of this.flippers) {
      hinge.rotation.z = side * design.beat * (0.4 + 0.6 * effort) * Math.sin(this.time * 1.7 + phase)
    }
    // The jaw hangs open a little and works slowly, wider when it is looking straight at the player.
    if (this.jaw) this.jaw.rotation.x = (facePlayer ? 0.2 : 0.09) + 0.07 * Math.sin(this.time * 1.1)
  }
}
