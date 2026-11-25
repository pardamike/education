import * as THREE from 'three'

// A pool of small shapes that are launched, drift for a while and are reused: lava blobs,
// smoke puffs, bubbles. One instanced mesh draws the whole pool.

export interface PuffStyle {
  /** How hard the puffs are pulled down. Negative makes them float up. */
  gravity: number
  /** Sideways push from the wind. */
  drift: THREE.Vector3
  /** Size at each moment of a puff's life, from 0 (just born) to 1 (gone). */
  sizeAt: (life: number) => number
  /** Optional colour at each moment of a puff's life. */
  colorAt?: (life: number, target: THREE.Color) => void
}

/** A fixed pool of little shapes that are launched, fly for a while, and are reused. */
export class Puffs {
  readonly mesh: THREE.InstancedMesh
  private readonly position: THREE.Vector3[]
  private readonly velocity: THREE.Vector3[]
  private readonly age: Float32Array
  private readonly lifetime: Float32Array
  private readonly size: Float32Array
  private readonly placer = new THREE.Object3D()
  private readonly color = new THREE.Color()
  private next = 0

  constructor(
    geometry: THREE.BufferGeometry,
    material: THREE.Material,
    private readonly count: number,
    private readonly style: PuffStyle
  ) {
    this.mesh = new THREE.InstancedMesh(geometry, material, count)
    this.mesh.frustumCulled = false
    this.position = Array.from({ length: count }, () => new THREE.Vector3())
    this.velocity = Array.from({ length: count }, () => new THREE.Vector3())
    this.age = new Float32Array(count)
    this.lifetime = new Float32Array(count) // 0 means "not in use"
    this.size = new Float32Array(count)
    this.placer.scale.setScalar(0)
    this.placer.updateMatrix()
    for (let i = 0; i < count; i++) {
      this.mesh.setMatrixAt(i, this.placer.matrix)
      if (style.colorAt) this.mesh.setColorAt(i, this.color.set('#ffffff'))
    }
  }

  launch(from: THREE.Vector3, velocity: THREE.Vector3, size: number, lifetime: number): void {
    const i = this.next
    this.next = (this.next + 1) % this.count
    this.position[i]!.copy(from)
    this.velocity[i]!.copy(velocity)
    this.age[i] = 0
    this.lifetime[i] = lifetime
    this.size[i] = size
  }

  /** `floor` is the height below which a puff has landed and disappears. */
  update(deltaSeconds: number, floor: number): void {
    const { gravity, drift, sizeAt, colorAt } = this.style
    for (let i = 0; i < this.count; i++) {
      const lifetime = this.lifetime[i]!
      if (lifetime === 0) continue
      const age = (this.age[i]! += deltaSeconds)
      const position = this.position[i]!
      const velocity = this.velocity[i]!
      velocity.y -= gravity * deltaSeconds
      position.addScaledVector(velocity, deltaSeconds).addScaledVector(drift, deltaSeconds)

      const life = age / lifetime
      const finished = life >= 1 || position.y < floor
      if (finished) this.lifetime[i] = 0
      this.placer.position.copy(position)
      this.placer.scale.setScalar(finished ? 0 : this.size[i]! * sizeAt(life))
      this.placer.updateMatrix()
      this.mesh.setMatrixAt(i, this.placer.matrix)
      if (colorAt && !finished) {
        colorAt(life, this.color)
        this.mesh.setColorAt(i, this.color)
      }
    }
    this.mesh.instanceMatrix.needsUpdate = true
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true
  }
}
