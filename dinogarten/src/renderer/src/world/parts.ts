import * as THREE from 'three'

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

export type PartSpec = SailPart

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

/**
 * Builds each part against the model as it stands in its resting pose, then pins it to its bone.
 * Call after the model has been scaled and placed, and before any animation has run.
 */
export function addParts(root: THREE.Object3D, meshes: THREE.Mesh[], parts: PartSpec[], dinoHeight: number): void {
  if (parts.length === 0) return
  const points = surfacePoints(meshes)
  for (const spec of parts) {
    const bone = root.getObjectByName(spec.bone)
    if (!bone) {
      console.warn(`Part "${spec.type}" wants a bone called "${spec.bone}", which this model does not have.`)
      continue
    }
    const part = buildSail(points, spec, dinoHeight)
    root.add(part)
    part.updateMatrixWorld(true)
    bone.attach(part)
  }
}
