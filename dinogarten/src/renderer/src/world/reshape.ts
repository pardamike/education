import * as THREE from 'three'
import { positionKey } from './rounding'

// Changes to a model's shape that go beyond resizing bones: making teeth or spikes longer, and
// slimming a body down. Both work on the model in its resting pose, before it is scaled or animated.

/**
 * Makes every separate piece in the named colour slots longer, growing away from the body.
 * Meant for slots made of many small pieces: a row of teeth, a set of claws, tail spikes.
 * `amounts` maps a colour slot name to how many times longer its pieces should be.
 */
export function lengthenPieces(meshes: THREE.Mesh[], amounts: Record<string, number>): void {
  const slotOf = (mesh: THREE.Mesh): string => (mesh.material as THREE.Material).name
  const targets = meshes.filter((mesh) => amounts[slotOf(mesh)] !== undefined)
  if (targets.length === 0) return

  // Everything that is not being lengthened counts as "the body" the pieces stick out of.
  const body: THREE.Vector3[] = []
  const seen = new Set<string>()
  const point = new THREE.Vector3()
  for (const mesh of meshes) {
    if (targets.includes(mesh)) continue
    const position = mesh.geometry.getAttribute('position')
    for (let i = 0; i < position.count; i++) {
      const key = positionKey(point.fromBufferAttribute(position, i))
      if (seen.has(key)) continue
      seen.add(key)
      body.push(point.clone())
    }
  }
  if (body.length === 0) return

  for (const mesh of targets) {
    const factor = amounts[slotOf(mesh)]!
    const position = mesh.geometry.getAttribute('position')
    const index = mesh.geometry.getIndex()

    // Join corners that sit in the same place, then group points into pieces that share triangles.
    const points: THREE.Vector3[] = []
    const numberAt = new Map<string, number>()
    const pointOfVertex = new Int32Array(position.count)
    for (let vertex = 0; vertex < position.count; vertex++) {
      const key = positionKey(point.fromBufferAttribute(position, vertex))
      let number = numberAt.get(key)
      if (number === undefined) {
        number = points.length
        numberAt.set(key, number)
        points.push(point.clone())
      }
      pointOfVertex[vertex] = number
    }
    const leader = points.map((_, i) => i)
    const find = (i: number): number => {
      while (leader[i] !== i) i = leader[i] = leader[leader[i]!]!
      return i
    }
    const corners = index ? index.count : position.count
    for (let corner = 0; corner < corners; corner += 3) {
      const [a, b, c] = [0, 1, 2].map((offset) => pointOfVertex[index ? index.getX(corner + offset) : corner + offset]!)
      leader[find(a!)] = find(b!)
      leader[find(b!)] = find(c!)
    }
    const pieces = new Map<number, number[]>()
    points.forEach((_, i) => {
      const piece = pieces.get(find(i))
      if (piece) piece.push(i)
      else pieces.set(find(i), [i])
    })

    // How far each point is from the body. The furthest point of a piece is its tip.
    const clearance = points.map((p) => {
      let nearest = Infinity
      for (const other of body) nearest = Math.min(nearest, p.distanceToSquared(other))
      return Math.sqrt(nearest)
    })

    for (const piece of pieces.values()) {
      let tip = piece[0]!
      let low = Infinity
      let high = -Infinity
      for (const i of piece) {
        if (clearance[i]! > clearance[tip]!) tip = i
        low = Math.min(low, clearance[i]!)
        high = Math.max(high, clearance[i]!)
      }
      // The points closest to the body are the piece's base; it grows from there toward its tip.
      const base = new THREE.Vector3()
      let baseCount = 0
      for (const i of piece) {
        if (clearance[i]! > low + (high - low) * 0.3) continue
        base.add(points[i]!)
        baseCount++
      }
      base.divideScalar(baseCount)
      const direction = points[tip]!.clone().sub(base)
      if (direction.lengthSq() < 1e-12) continue
      direction.normalize()
      for (const i of piece) {
        const along = Math.max(0, points[i]!.clone().sub(base).dot(direction))
        points[i]!.addScaledVector(direction, along * (factor - 1))
      }
    }

    for (let vertex = 0; vertex < position.count; vertex++) {
      const moved = points[pointOfVertex[vertex]!]!
      position.setXYZ(vertex, moved.x, moved.y, moved.z)
    }
    position.needsUpdate = true
  }
}

/** Pulls the surface of the body inward around the named bones, like going on a diet. */
export interface SlimSpec {
  /** How far to pull the surface in, as a fraction of the dinosaur's height. 0.04 is noticeable. */
  amount: number
  /** The bones whose part of the body gets slimmer. Limbs, head and tail are left alone if not listed. */
  bones: string[]
}

/**
 * Slims the parts of the body that follow the listed bones. Needs smooth normals in place
 * (run `smoothShading` first), and they need recomputing afterwards.
 */
export function slim(meshes: THREE.Mesh[], spec: SlimSpec): void {
  const skinned = meshes.filter((mesh): mesh is THREE.SkinnedMesh => mesh instanceof THREE.SkinnedMesh)
  if (skinned.length === 0) return

  // The model's height in its own units, so `amount` means the same thing for every model.
  const first = skinned[0]!
  const up = new THREE.Vector3(0, 1, 0).transformDirection(first.matrixWorld.clone().invert())
  let lowest = Infinity
  let highest = -Infinity
  const point = new THREE.Vector3()
  for (const mesh of skinned) {
    const position = mesh.geometry.getAttribute('position')
    for (let i = 0; i < position.count; i++) {
      const height = point.fromBufferAttribute(position, i).dot(up)
      lowest = Math.min(lowest, height)
      highest = Math.max(highest, height)
    }
  }
  const distance = spec.amount * (highest - lowest)

  // Corners that share a place must move together, or the surface would tear along its creases.
  const moves = new Map<string, { direction: THREE.Vector3; strength: number }>()
  const normal = new THREE.Vector3()
  for (const mesh of skinned) {
    const chosen = new Set(mesh.skeleton.bones.flatMap((bone, i) => (spec.bones.includes(bone.name) ? [i] : [])))
    const position = mesh.geometry.getAttribute('position')
    const normals = mesh.geometry.getAttribute('normal')
    const skinIndex = mesh.geometry.getAttribute('skinIndex')
    const skinWeight = mesh.geometry.getAttribute('skinWeight')
    if (!normals || !skinIndex || !skinWeight) continue
    for (let i = 0; i < position.count; i++) {
      let strength = 0
      for (let slot = 0; slot < 4; slot++) {
        if (chosen.has(skinIndex.getComponent(i, slot))) strength += skinWeight.getComponent(i, slot)
      }
      const key = positionKey(point.fromBufferAttribute(position, i))
      const move = moves.get(key) ?? { direction: new THREE.Vector3(), strength: 0 }
      move.direction.add(normal.fromBufferAttribute(normals, i))
      move.strength = Math.max(move.strength, strength)
      moves.set(key, move)
    }
  }

  for (const mesh of skinned) {
    const position = mesh.geometry.getAttribute('position')
    for (let i = 0; i < position.count; i++) {
      point.fromBufferAttribute(position, i)
      const move = moves.get(positionKey(point))
      if (!move || move.strength === 0) continue
      point.addScaledVector(normal.copy(move.direction).normalize(), -distance * move.strength)
      position.setXYZ(i, point.x, point.y, point.z)
    }
    position.needsUpdate = true
  }
}
