import * as THREE from 'three'

// The dinosaur models are low-poly: a few hundred flat triangles each. The two functions here
// turn that into a soft, rounded look when a model loads. `roundOff` changes the shape itself;
// `smoothShading` changes how light falls across it. The model files are never modified.

/** Bone number -> how strongly that bone pulls on a corner. */
type Skin = Map<number, number>

/** A model with every colour slot joined into one surface, so rounding leaves no gaps between them. */
interface Shape {
  positions: THREE.Vector3[]
  skins: Skin[]
  /** For each mesh, its triangles as a flat list of corner numbers (three per triangle). */
  triangles: number[][]
}

const positionKey = (point: THREE.Vector3): string =>
  `${Math.round(point.x * 1e5)},${Math.round(point.y * 1e5)},${Math.round(point.z * 1e5)}`

/** Reads every mesh into one shared list of corners; corners in the same place become one corner. */
function weld(meshes: THREE.Mesh[]): Shape {
  const positions: THREE.Vector3[] = []
  const skins: Skin[] = []
  const numberAt = new Map<string, number>()
  const point = new THREE.Vector3()

  const triangles = meshes.map((mesh) => {
    const geometry = mesh.geometry.index ? mesh.geometry.toNonIndexed() : mesh.geometry
    const position = geometry.getAttribute('position')
    const skinIndex = geometry.getAttribute('skinIndex') as THREE.BufferAttribute | undefined
    const skinWeight = geometry.getAttribute('skinWeight') as THREE.BufferAttribute | undefined
    const corners: number[] = []
    for (let i = 0; i < position.count; i++) {
      point.fromBufferAttribute(position, i)
      const key = positionKey(point)
      let corner = numberAt.get(key)
      if (corner === undefined) {
        corner = positions.length
        numberAt.set(key, corner)
        positions.push(point.clone())
        const skin: Skin = new Map()
        if (skinIndex && skinWeight) {
          for (let slot = 0; slot < 4; slot++) {
            const weight = skinWeight.getComponent(i, slot)
            const bone = skinIndex.getComponent(i, slot)
            if (weight > 0) skin.set(bone, (skin.get(bone) ?? 0) + weight)
          }
        }
        skins.push(skin)
      }
      corners.push(corner)
    }
    return corners
  })
  return { positions, skins, triangles }
}

interface Edge {
  a: number
  b: number
  /** The third corner of each triangle that uses this edge. Two means an ordinary edge. */
  opposite: number[]
  /** The number of the new corner created in the middle of this edge. */
  middle: number
}

/**
 * One pass of Loop subdivision: every triangle becomes four, and corners are pulled toward the
 * average of their neighbours. Sharp points (horn tips, claws) end up a little blunter.
 */
function subdivide(shape: Shape): Shape {
  const { positions, skins } = shape
  const count = positions.length
  const edgeKey = (a: number, b: number): number => (a < b ? a * count + b : b * count + a)
  const edges = new Map<number, Edge>()
  const neighbours = positions.map(() => new Set<number>())

  const eachTriangle = (corners: number[], visit: (a: number, b: number, c: number) => void): void => {
    for (let i = 0; i < corners.length; i += 3) {
      const a = corners[i]!
      const b = corners[i + 1]!
      const c = corners[i + 2]!
      // Welding can collapse a sliver triangle to a line; those are dropped.
      if (a !== b && b !== c && c !== a) visit(a, b, c)
    }
  }

  for (const corners of shape.triangles) {
    eachTriangle(corners, (a, b, c) => {
      for (const [from, to, third] of [
        [a, b, c],
        [b, c, a],
        [c, a, b]
      ] as const) {
        const key = edgeKey(from, to)
        let edge = edges.get(key)
        if (!edge) {
          edge = { a: from, b: to, opposite: [], middle: -1 }
          edges.set(key, edge)
        }
        edge.opposite.push(third)
        neighbours[from]!.add(to)
        neighbours[to]!.add(from)
      }
    })
  }

  // Edges on the rim of an opening (an open mouth, say) are rounded along the rim only.
  const rimNeighbours = positions.map((): number[] => [])
  for (const edge of edges.values()) {
    if (edge.opposite.length === 2) continue
    rimNeighbours[edge.a]!.push(edge.b)
    rimNeighbours[edge.b]!.push(edge.a)
  }

  const newPositions: THREE.Vector3[] = []
  const newSkins: Skin[] = []

  for (let corner = 0; corner < count; corner++) {
    const moved = positions[corner]!.clone()
    const rim = rimNeighbours[corner]!
    const around = neighbours[corner]!
    if (rim.length === 2) {
      moved
        .multiplyScalar(0.75)
        .addScaledVector(positions[rim[0]!]!, 0.125)
        .addScaledVector(positions[rim[1]!]!, 0.125)
    } else if (rim.length === 0 && around.size >= 3) {
      const pull = around.size === 3 ? 3 / 16 : 3 / (8 * around.size)
      moved.multiplyScalar(1 - around.size * pull)
      for (const other of around) moved.addScaledVector(positions[other]!, pull)
    }
    newPositions.push(moved)
    newSkins.push(skins[corner]!)
  }

  for (const edge of edges.values()) {
    const middle = new THREE.Vector3()
    if (edge.opposite.length === 2) {
      middle
        .addScaledVector(positions[edge.a]!, 0.375)
        .addScaledVector(positions[edge.b]!, 0.375)
        .addScaledVector(positions[edge.opposite[0]!]!, 0.125)
        .addScaledVector(positions[edge.opposite[1]!]!, 0.125)
    } else {
      middle.addScaledVector(positions[edge.a]!, 0.5).addScaledVector(positions[edge.b]!, 0.5)
    }
    // The new corner follows the bones of both ends equally, so the model still bends cleanly.
    const skin: Skin = new Map()
    for (const end of [skins[edge.a]!, skins[edge.b]!]) {
      for (const [bone, weight] of end) skin.set(bone, (skin.get(bone) ?? 0) + weight / 2)
    }
    edge.middle = newPositions.length
    newPositions.push(middle)
    newSkins.push(skin)
  }

  const triangles = shape.triangles.map((corners) => {
    const split: number[] = []
    eachTriangle(corners, (a, b, c) => {
      const ab = edges.get(edgeKey(a, b))!.middle
      const bc = edges.get(edgeKey(b, c))!.middle
      const ca = edges.get(edgeKey(c, a))!.middle
      split.push(a, ab, ca, b, bc, ab, c, ca, bc, ab, bc, ca)
    })
    return split
  })

  return { positions: newPositions, skins: newSkins, triangles }
}

/** Writes the rounded shape back into the meshes, one fresh geometry per colour slot. */
function write(meshes: THREE.Mesh[], shape: Shape): void {
  meshes.forEach((mesh, meshNumber) => {
    const corners = shape.triangles[meshNumber]!
    const position = new Float32Array(corners.length * 3)
    const skinIndex = new Uint16Array(corners.length * 4)
    const skinWeight = new Float32Array(corners.length * 4)
    let skinned = false

    corners.forEach((corner, i) => {
      shape.positions[corner]!.toArray(position, i * 3)
      // A corner can follow at most four bones; keep the strongest and rebalance them to total 1.
      const strongest = [...shape.skins[corner]!].sort((x, y) => y[1] - x[1]).slice(0, 4)
      const total = strongest.reduce((sum, [, weight]) => sum + weight, 0)
      strongest.forEach(([bone, weight], slot) => {
        skinIndex[i * 4 + slot] = bone
        skinWeight[i * 4 + slot] = weight / total
        skinned = true
      })
    })

    const geometry = new THREE.BufferGeometry()
    geometry.setAttribute('position', new THREE.BufferAttribute(position, 3))
    if (skinned) {
      geometry.setAttribute('skinIndex', new THREE.BufferAttribute(skinIndex, 4))
      geometry.setAttribute('skinWeight', new THREE.BufferAttribute(skinWeight, 4))
    }
    mesh.geometry.dispose()
    mesh.geometry = geometry
  })
}

/**
 * Rounds a model's shape. Each pass splits every triangle into four and relaxes the surface,
 * so outlines curve instead of turning corners. Follow with `smoothShading`.
 */
export function roundOff(meshes: THREE.Mesh[], passes: number): void {
  if (passes <= 0) return
  let shape = weld(meshes)
  for (let pass = 0; pass < passes; pass++) shape = subdivide(shape)
  write(meshes, shape)
}

/** Faces meeting at a sharper angle than this keep a hard edge: claws, horn tips, the rim of a frill. */
const CREASE_DEGREES = 80

/**
 * Re-lights a model as a smooth surface by giving every corner the average direction of the
 * faces around it, across all colour slots.
 */
export function smoothShading(meshes: THREE.Mesh[]): void {
  const minimumDot = Math.cos(THREE.MathUtils.degToRad(CREASE_DEGREES))
  const facesAtPoint = new Map<string, THREE.Vector3[]>()
  const a = new THREE.Vector3()
  const b = new THREE.Vector3()
  const c = new THREE.Vector3()

  const prepared = meshes.map((mesh) => {
    if (mesh.geometry.index) mesh.geometry = mesh.geometry.toNonIndexed()
    const positions = mesh.geometry.getAttribute('position')
    const faceNormals: THREE.Vector3[] = []
    for (let i = 0; i < positions.count; i += 3) {
      a.fromBufferAttribute(positions, i)
      b.fromBufferAttribute(positions, i + 1)
      c.fromBufferAttribute(positions, i + 2)
      // Left un-normalised on purpose: its length is the face's area, so big faces count for more.
      const faceNormal = new THREE.Vector3().crossVectors(b.clone().sub(a), c.clone().sub(a))
      faceNormals.push(faceNormal)
      for (const corner of [a, b, c]) {
        const key = positionKey(corner)
        const faces = facesAtPoint.get(key)
        if (faces) faces.push(faceNormal)
        else facesAtPoint.set(key, [faceNormal])
      }
    }
    return { geometry: mesh.geometry, positions, faceNormals }
  })

  const own = new THREE.Vector3()
  const other = new THREE.Vector3()
  const sum = new THREE.Vector3()
  for (const { geometry, positions, faceNormals } of prepared) {
    const normals = new Float32Array(positions.count * 3)
    for (let i = 0; i < positions.count; i++) {
      own.copy(faceNormals[Math.floor(i / 3)]!).normalize()
      sum.set(0, 0, 0)
      a.fromBufferAttribute(positions, i)
      for (const faceNormal of facesAtPoint.get(positionKey(a))!) {
        if (other.copy(faceNormal).normalize().dot(own) >= minimumDot) sum.add(faceNormal)
      }
      sum.normalize().toArray(normals, i * 3)
    }
    geometry.setAttribute('normal', new THREE.BufferAttribute(normals, 3))
  }
}
