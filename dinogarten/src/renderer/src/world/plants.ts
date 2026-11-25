import * as THREE from 'three'

// Shapes and helpers shared by everything leafy, on land and under the sea: blades that sway,
// fern fronds, and a way to draw thousands of copies of one shape cheaply.

/** A blade one unit tall that tapers to a point, split into segments so it can bend. */
export function bladeShape(width: number, segments: number): THREE.BufferGeometry {
  const blade = new THREE.PlaneGeometry(width, 1, 1, segments).translate(0, 0.5, 0)
  const position = blade.getAttribute('position')
  for (let i = 0; i < position.count; i++) {
    position.setX(i, position.getX(i) * (1 - 0.7 * position.getY(i)))
  }
  blade.computeVertexNormals()
  return blade
}

/**
 * A fern frond one unit long: a leaf with a saw-toothed edge that arches over as it goes.
 * It grows along +y and droops toward +z, so lean it outward from the plant's middle.
 */
export function fernFrond(): THREE.BufferGeometry {
  const segments = 12
  const positions: number[] = []
  const indices: number[] = []
  for (let i = 0; i <= segments; i++) {
    const along = i / segments
    // Alternating wide and narrow steps give the toothed outline of a fern.
    const halfWidth = 0.17 * (1 - along * 0.88) * (i % 2 === 0 ? 0.45 : 1)
    const droop = 0.5 * along * along
    positions.push(-halfWidth, along, droop, halfWidth, along, droop)
    if (i < segments) {
      const corner = i * 2
      indices.push(corner, corner + 1, corner + 2, corner + 1, corner + 3, corner + 2)
    }
  }
  const frond = new THREE.BufferGeometry()
  frond.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
  frond.setIndex(indices)
  frond.computeVertexNormals()
  return frond
}

/**
 * A material for plants that sway. Each point is pushed sideways, more the nearer it is to the tip.
 * `strength` is 1 for the slow, wide swing of plants underwater and much less for a breeze on land.
 */
export function swayingMaterial(time: { value: number }, strength = 1): THREE.MeshLambertMaterial {
  const material = new THREE.MeshLambertMaterial({ side: THREE.DoubleSide })
  material.onBeforeCompile = (shader) => {
    shader.uniforms['swayTime'] = time
    shader.uniforms['swayStrength'] = { value: strength }
    shader.vertexShader =
      'uniform float swayTime;\nuniform float swayStrength;\n' +
      shader.vertexShader.replace(
        '#include <begin_vertex>',
        /* glsl */ `#include <begin_vertex>
        #ifdef USE_INSTANCING
          float swayPhase = instanceMatrix[3].x * 0.37 + instanceMatrix[3].z * 0.53;
        #else
          float swayPhase = 0.0;
        #endif
        float swayBend = position.y * position.y * swayStrength;
        transformed.x += sin(swayTime * 1.3 + swayPhase + position.y * 2.5) * 0.3 * swayBend;
        transformed.z += cos(swayTime * 0.9 + swayPhase * 1.3 + position.y * 2.0) * 0.2 * swayBend;`
      )
  }
  // Two materials with different strengths must not share one compiled shader.
  material.customProgramCacheKey = () => `sway-${strength}`
  return material
}

/** Where one copy of a shape goes. */
export interface Placement {
  x: number
  y: number
  z: number
  /** Width, height, depth. */
  scale: [number, number, number]
  /** Tilt forward, turn, tilt sideways. The turn is applied first. */
  rotation: [number, number, number]
  shade?: string
}

/** Draws many copies of one shape in a single mesh. */
export function scatter(geometry: THREE.BufferGeometry, material: THREE.Material, items: Placement[]): THREE.InstancedMesh {
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
