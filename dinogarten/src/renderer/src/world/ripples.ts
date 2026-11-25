import * as THREE from 'three'

const ringGeometry = new THREE.RingGeometry(0.86, 1, 40).rotateX(-Math.PI / 2)
const RINGS = 3
/** Seconds for one ring to spread out and fade away. */
const SPREAD_SECONDS = 2.4

/** Rings that spread across the water around something standing or wading in it. */
export class Ripples {
  readonly group = new THREE.Group()
  private readonly rings: THREE.Mesh<THREE.BufferGeometry, THREE.MeshBasicMaterial>[] = []

  /** `size` is roughly how wide the thing making the ripples is, in world units. */
  constructor(private readonly size: number) {
    for (let i = 0; i < RINGS; i++) {
      const ring = new THREE.Mesh(
        ringGeometry,
        new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, depthWrite: false })
      )
      this.rings.push(ring)
      this.group.add(ring)
    }
    this.group.visible = false
  }

  /** Call every frame. `depth` is how deep the water is where the thing stands; no water, no ripples. */
  update(timeSeconds: number, x: number, z: number, waterLevel: number, depth: number): void {
    this.group.visible = depth > 0.12
    if (!this.group.visible) return
    this.group.position.set(x, waterLevel + 0.02, z)
    this.rings.forEach((ring, i) => {
      const life = (timeSeconds / SPREAD_SECONDS + i / RINGS) % 1
      ring.scale.setScalar(this.size * (0.55 + life * 1.3))
      ring.material.opacity = 0.75 * (1 - life) ** 1.5
    })
  }
}
