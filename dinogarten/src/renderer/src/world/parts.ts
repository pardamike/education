import * as THREE from 'three'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'

// Extra body parts made in code and pinned to a model's skeleton. This is how one base model
// becomes a different animal: a T. rex with a sail along its back reads as a Spinosaurus.
// Each part is described in the dinosaur's JSON file, under "parts".

/** A tall fin along the back, like a Spinosaurus's. */
export interface SailPart {
  type: 'sail'
  /** The bone the sail is pinned to, so it moves with that part of the body. */
  bone: string
  /** Where the sail starts and ends along the body: 0 is the tip of the nose, 1 the tip of the tail. */
  start: number
  end: number
  /** How tall the sail stands at its peak, as a fraction of the dinosaur's height. */
  height: number
  color: string
}

/**
 * A simple solid shape stuck onto the body. A cone makes a horn or a spike. A ball, squashed
 * one way or another, makes a tail club, a thin head crest or a flat wing.
 */
export interface ShapePart {
  type: 'cone' | 'ball'
  /**
   * The bone it is pinned to. With `pair`, a name like "FrontLeg" that has a left and a right
   * bone ("FrontLegL", "FrontLegR") puts one on each.
   */
  bone: string
  /** Where it sits, measured from the bone's joint as fractions of the dinosaur's height: [out to the side, up, forward]. */
  at: [number, number, number]
  /** Its size as fractions of the dinosaur's height: [side to side, bottom to top, front to back]. */
  size: [number, number, number]
  /** Tilts it, in degrees: [tip forward, swing round, lean outward]. */
  tilt?: [number, number, number]
  /** Makes a matching one on the other side of the body. */
  pair?: boolean
  color: string
}

/** Rows of bumps or spikes over the back, like the armour of an Ankylosaurus. */
export interface StudsPart {
  type: 'studs'
  bone: string
  shape: 'cone' | 'ball'
  /** Where the rows start and end along the body: 0 is the tip of the nose, 1 the tip of the tail. */
  start: number
  end: number
  /** How many rows lie side by side, and how many studs are in each. */
  rows: number
  perRow: number
  /**
   * How far round the body the outermost rows sit. 0 keeps every row on top of the back;
   * 1 puts the outer rows halfway down the sides, pointing straight out.
   */
  spread: number
  /** The width and height of each stud, as fractions of the dinosaur's height. */
  size: [number, number]
  color: string
}

export type PartSpec = SailPart | ShapePart | StudsPart

/** A cone one unit tall standing on its base, and a ball one unit across. */
const coneShape = new THREE.ConeGeometry(0.5, 1, 14).translate(0, 0.5, 0)
const ballShape = new THREE.SphereGeometry(0.5, 18, 12)

/**
 * The material every dinosaur surface uses. A little of the colour glows on its own, so the
 * shaded side stays bright and cartoon-like (plain shading turns a yellow plate olive in shadow).
 */
export function skinMaterial(color: THREE.ColorRepresentation, name = ''): THREE.MeshLambertMaterial {
  const tint = new THREE.Color(color)
  return new THREE.MeshLambertMaterial({ name, color: tint, emissive: tint, emissiveIntensity: 0.22 })
}

/** Every corner of the model's surface, where it sits right now, in world space. */
function surfacePoints(meshes: THREE.Mesh[]): THREE.Vector3[] {
  const points: THREE.Vector3[] = []
  for (const mesh of meshes) {
    const count = mesh.geometry.getAttribute('position').count
    for (let i = 0; i < count; i++) {
      const point = new THREE.Vector3()
      if (mesh instanceof THREE.SkinnedMesh) mesh.getVertexPosition(i, point)
      else point.fromBufferAttribute(mesh.geometry.getAttribute('position'), i)
      points.push(point.applyMatrix4(mesh.matrixWorld))
    }
  }
  return points
}

function buildSail(points: THREE.Vector3[], spec: SailPart, dinoHeight: number): THREE.Mesh {
  let nose = -Infinity
  let tail = Infinity
  let halfWidth = 0
  for (const point of points) {
    nose = Math.max(nose, point.z)
    tail = Math.min(tail, point.z)
    halfWidth = Math.max(halfWidth, Math.abs(point.x))
  }
  const length = nose - tail
  const steps = 20
  const peak = spec.height * dinoHeight
  const thickness = peak * 0.1

  // Find the line of the back: the highest point of the body at each step along the sail.
  const ridge: number[] = []
  for (let step = 0; step <= steps; step++) {
    const z = nose - (spec.start + ((spec.end - spec.start) * step) / steps) * length
    let top = -Infinity
    for (const point of points) {
      if (Math.abs(point.z - z) < length * 0.035 && Math.abs(point.x) < halfWidth * 0.4) top = Math.max(top, point.y)
    }
    ridge.push(top)
  }
  for (let step = 0; step <= steps; step++) {
    if (ridge[step] === -Infinity) ridge[step] = ridge[step - 1] ?? ridge.find((y) => y !== -Infinity) ?? dinoHeight
  }

  const positions: number[] = []
  const colors: number[] = []
  const indices: number[] = []
  const light = new THREE.Color(spec.color)
  const dark = light.clone().multiplyScalar(0.72)
  for (let step = 0; step <= steps; step++) {
    const along = step / steps
    const z = nose - (spec.start + (spec.end - spec.start) * along) * length
    // One broad arch, with a gently scalloped top edge like the tips of the spines inside it.
    const rise = peak * Math.pow(Math.sin(Math.PI * along), 0.55) * (0.93 + 0.07 * Math.cos(along * Math.PI * 14))
    const base = ridge[step]! - peak * 0.15
    const top = ridge[step]! + rise
    positions.push(-thickness / 2, base, z, thickness / 2, base, z, -thickness * 0.15, top, z, thickness * 0.15, top, z)
    // Alternate light and dark from one step to the next, which shows up as soft stripes.
    const stripe = step % 2 === 0 ? light : dark
    for (let corner = 0; corner < 4; corner++) colors.push(stripe.r, stripe.g, stripe.b)
    if (step === steps) break
    const a = step * 4
    const b = a + 4
    indices.push(a, a + 2, b + 2, a, b + 2, b) // left face
    indices.push(a + 1, b + 1, b + 3, a + 1, b + 3, a + 3) // right face
    indices.push(a + 2, a + 3, b + 3, a + 2, b + 3, b + 2) // top edge
  }

  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3))
  geometry.setIndex(indices)
  geometry.computeVertexNormals()
  // A sail is thin, so whichever side faces away from the sun would go dark. Extra glow keeps both sides bright.
  const material = new THREE.MeshLambertMaterial({
    vertexColors: true,
    emissive: light,
    emissiveIntensity: 0.45,
    side: THREE.DoubleSide
  })
  const sail = new THREE.Mesh(geometry, material)
  sail.castShadow = true
  return sail
}

/** One cone or ball, placed beside a bone. `side` is 1, or -1 for the mirror image on the other side of the body. */
function buildShape(spec: ShapePart, bone: THREE.Object3D, side: number, dinoHeight: number): THREE.Mesh {
  const shape = new THREE.Mesh(spec.type === 'cone' ? coneShape : ballShape, skinMaterial(spec.color))
  const [out, up, forward] = spec.at
  bone.getWorldPosition(shape.position)
  shape.position.x += side * out * dinoHeight
  shape.position.y += up * dinoHeight
  shape.position.z += forward * dinoHeight
  shape.scale.set(spec.size[0] * dinoHeight, spec.size[1] * dinoHeight, spec.size[2] * dinoHeight)
  const [tip, swing, lean] = (spec.tilt ?? [0, 0, 0]).map(THREE.MathUtils.degToRad) as [number, number, number]
  shape.rotation.set(tip, side * swing, -side * lean, 'YXZ')
  shape.castShadow = true
  return shape
}

function buildStuds(points: THREE.Vector3[], spec: StudsPart, dinoHeight: number): THREE.Mesh | null {
  let nose = -Infinity
  let tail = Infinity
  for (const point of points) {
    nose = Math.max(nose, point.z)
    tail = Math.min(tail, point.z)
  }
  const length = nose - tail
  const near = length * 0.03
  const [width, tall] = spec.size
  const studs: THREE.BufferGeometry[] = []
  const placer = new THREE.Object3D()
  for (let row = 0; row < spec.rows; row++) {
    // -1 for the row furthest to one side, 1 for the row furthest to the other.
    const across = spec.rows === 1 ? 0 : (row / (spec.rows - 1)) * 2 - 1
    // The studs wrap round the body. This is how far round this row sits: 0 is the top of the back.
    const angle = (across * spec.spread * Math.PI) / 2
    for (let i = 0; i < spec.perRow; i++) {
      // Every other row is shifted half a step, so the studs sit like bricks, not in a grid.
      const along = (i + (row % 2 === 0 ? 0.5 : 1)) / (spec.perRow + 0.5)
      const z = nose - (spec.start + (spec.end - spec.start) * along) * length
      // The slice of the body at this point along it, and roughly where the middle of that slice is.
      const slice = points.filter((point) => Math.abs(point.z - z) < near)
      if (slice.length === 0) continue
      const ridge = Math.max(...slice.map((point) => point.y))
      const halfWidth = Math.max(...slice.filter((point) => point.y > ridge - dinoHeight * 0.3).map((point) => Math.abs(point.x)))
      const middle = ridge - halfWidth * 0.9
      // The surface under this stud: the point of the slice furthest from the middle, in the stud's direction.
      let reach = 0
      for (const point of slice) {
        const pointAngle = Math.atan2(point.x, point.y - middle)
        if (Math.abs(pointAngle - angle) < 0.2) reach = Math.max(reach, Math.hypot(point.x, point.y - middle))
      }
      if (reach === 0) continue
      reach -= tall * dinoHeight * 0.2
      // Smaller toward the front and back, and pointing straight out from the body.
      const size = 0.7 + 0.3 * Math.sin(Math.PI * along)
      placer.position.set(Math.sin(angle) * reach, middle + Math.cos(angle) * reach, z)
      placer.rotation.set(0, 0, -angle)
      placer.scale.set(width * dinoHeight * size, tall * dinoHeight * size, width * dinoHeight * size)
      placer.updateMatrix()
      studs.push((spec.shape === 'cone' ? coneShape : ballShape).clone().applyMatrix4(placer.matrix))
    }
  }
  if (studs.length === 0) return null
  const mesh = new THREE.Mesh(mergeGeometries(studs), skinMaterial(spec.color))
  mesh.castShadow = true
  return mesh
}

/**
 * Builds each part against the model as it stands in its resting pose, then pins it to its bone.
 * Call after the model has been scaled and placed, and before any animation has run.
 */
export function addParts(root: THREE.Object3D, meshes: THREE.Mesh[], parts: PartSpec[], dinoHeight: number): void {
  if (parts.length === 0) return
  const points = surfacePoints(meshes)
  const pin = (part: THREE.Object3D, bone: THREE.Object3D): void => {
    root.add(part)
    part.updateMatrixWorld(true)
    bone.attach(part)
  }
  for (const spec of parts) {
    if (spec.type === 'cone' || spec.type === 'ball') {
      const left = root.getObjectByName(`${spec.bone}L`)
      const right = root.getObjectByName(`${spec.bone}R`)
      if (spec.pair && left && right) {
        // One on each of a pair of bones, each pointing out from its own side of the body.
        for (const bone of [left, right]) {
          pin(buildShape(spec, bone, Math.sign(bone.getWorldPosition(new THREE.Vector3()).x) || 1, dinoHeight), bone)
        }
        continue
      }
    }
    const bone = root.getObjectByName(spec.bone)
    if (!bone) {
      console.warn(`Part "${spec.type}" wants a bone called "${spec.bone}", which this model does not have.`)
      continue
    }
    if (spec.type === 'sail') {
      pin(buildSail(points, spec, dinoHeight), bone)
    } else if (spec.type === 'studs') {
      const studs = buildStuds(points, spec, dinoHeight)
      if (studs) pin(studs, bone)
    } else {
      pin(buildShape(spec, bone, 1, dinoHeight), bone)
      if (spec.pair) pin(buildShape(spec, bone, -1, dinoHeight), bone)
    }
  }
}
