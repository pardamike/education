import * as THREE from 'three'

// Keeps the player in sight. The camera never turns, so a tree or a big dinosaur can end up
// standing between it and the player. Whatever does turns see-through until it is out of the way.

/** How solid something is while it is in the way: 1 is solid, 0 is invisible. */
const FADED = 0.2

interface Item {
  object: THREE.Object3D
  /** Half its width, and its height, in world units. */
  radius: number
  height: number
  opacity: number
  /** Each of its meshes with a see-through copy of its material, made the first time it fades. */
  swaps: Array<{ mesh: THREE.Mesh; solid: THREE.Material; faded: THREE.Material }> | null
}

export class SeeThrough {
  private readonly items: Item[] = []

  /** Registers something that may get in the way. It must sit directly in the world, not inside something that moves. */
  add(object: THREE.Object3D, radius: number, height: number): void {
    this.items.push({ object, radius, height, opacity: 1, swaps: null })
  }

  /** Call once a frame, after the camera has been placed. */
  update(camera: THREE.Vector3, player: THREE.Vector3, deltaSeconds: number): void {
    // The line of sight, seen from above, runs from the camera to the player.
    const dx = player.x - camera.x
    const dz = player.z - camera.z
    const lengthSquared = dx * dx + dz * dz || 1
    for (const item of this.items) {
      const position = item.object.position
      // How far along the line of sight this thing is (0 at the camera, 1 at the player), and how far off to the side.
      const along = ((position.x - camera.x) * dx + (position.z - camera.z) * dz) / lengthSquared
      let inTheWay = false
      if (along > 0.02 && along < 0.92) {
        const aside = Math.hypot(camera.x + dx * along - position.x, camera.z + dz * along - position.z)
        const sightHeight = camera.y + (player.y + 1 - camera.y) * along
        // Things close to the camera cover more of the screen, so they count from further off to the side.
        inTheWay = aside < item.radius + (1 - along) * 1.5 && sightHeight < position.y + item.height + 0.3
      }
      const wanted = inTheWay ? FADED : 1
      if (item.opacity === wanted) continue
      item.opacity += (wanted - item.opacity) * Math.min(1, 9 * deltaSeconds)
      if (Math.abs(item.opacity - wanted) < 0.01) item.opacity = wanted
      this.show(item)
    }
  }

  private show(item: Item): void {
    if (!item.swaps) {
      const swaps: NonNullable<Item['swaps']> = []
      item.object.traverse((node) => {
        if (!(node instanceof THREE.Mesh) || Array.isArray(node.material)) return
        const faded = node.material.clone()
        faded.transparent = true
        swaps.push({ mesh: node, solid: node.material, faded })
      })
      item.swaps = swaps
    }
    for (const swap of item.swaps) {
      swap.faded.opacity = item.opacity
      swap.mesh.material = item.opacity === 1 ? swap.solid : swap.faded
    }
  }
}
