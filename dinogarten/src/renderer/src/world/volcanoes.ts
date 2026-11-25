import * as THREE from 'three'
import { SEA } from './coast'
import { Puffs } from './puffs'
import type { Obstacle } from './scenery'

// Far-off volcanoes for the horizon. They are scenery only: the player never reaches them.
// The camera always looks north (toward -z), so they line the northern skyline where they show.

/** What a volcano is up to. */
type Mood =
  /** Quiet, with a snowy top. */
  | 'sleeping'
  /** A glowing crater and a steady trail of smoke. */
  | 'smoking'
  /** Rivers of lava running down its sides. */
  | 'flowing'
  /** Lava rivers, and every so often a fountain of lava from the top. */
  | 'erupting'

interface VolcanoSpec {
  x: number
  z: number
  height: number
  mood: Mood
}

const VOLCANOES: VolcanoSpec[] = [
  { x: 26, z: -150, height: 30, mood: 'erupting' },
  { x: -60, z: -138, height: 23, mood: 'flowing' },
  { x: 96, z: -166, height: 21, mood: 'smoking' },
  { x: -130, z: -180, height: 27, mood: 'erupting' },
  { x: 152, z: -172, height: 25, mood: 'flowing' },
  { x: -16, z: -225, height: 40, mood: 'sleeping' },
  { x: -205, z: -150, height: 22, mood: 'smoking' },
  { x: 220, z: -162, height: 24, mood: 'sleeping' }
]

const GRAVITY = 22
const WIND = new THREE.Vector3(1.6, 0, 0)

const rock = new THREE.MeshLambertMaterial({ color: '#8d786c', flatShading: true })
const scorchedRock = new THREE.MeshLambertMaterial({ color: '#6a5852', flatShading: true })
const snow = new THREE.MeshLambertMaterial({ color: '#f4f6fa', flatShading: true })
const coldCrater = new THREE.MeshLambertMaterial({ color: '#4d4340' })
const hotCrater = new THREE.MeshBasicMaterial({ color: '#ff8a3c', fog: false })

/** Bright bands slide down the ribbon so the lava looks like it is flowing. */
const lavaFlowMaterial = new THREE.ShaderMaterial({
  uniforms: {
    time: { value: 0 },
    hot: { value: new THREE.Color('#ffe066') },
    warm: { value: new THREE.Color('#ff6a1f') },
    crust: { value: new THREE.Color('#c23a12') }
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: /* glsl */ `
    uniform float time;
    uniform vec3 hot;
    uniform vec3 warm;
    uniform vec3 crust;
    varying vec2 vUv;
    void main() {
      float middle = smoothstep(0.0, 0.3, vUv.x) * smoothstep(1.0, 0.7, vUv.x);
      float bands = sin(vUv.y * 26.0 - time * 2.4) * 0.5 + 0.5;
      vec3 color = mix(crust, mix(warm, hot, bands), middle);
      gl_FragColor = vec4(color, 1.0);
      #include <colorspace_fragment>
    }
  `,
  side: THREE.DoubleSide
})

const blobGeometry = new THREE.IcosahedronGeometry(1, 0)
const puffGeometry = new THREE.IcosahedronGeometry(1, 1)

let glowTexture: THREE.CanvasTexture | null = null
function getGlowTexture(): THREE.CanvasTexture {
  if (glowTexture) return glowTexture
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = 128
  const context = canvas.getContext('2d')!
  const gradient = context.createRadialGradient(64, 64, 0, 64, 64, 64)
  gradient.addColorStop(0, 'rgba(255, 214, 120, 1)')
  gradient.addColorStop(0.3, 'rgba(255, 150, 60, 0.6)')
  gradient.addColorStop(1, 'rgba(255, 120, 40, 0)')
  context.fillStyle = gradient
  context.fillRect(0, 0, 128, 128)
  glowTexture = new THREE.CanvasTexture(canvas)
  return glowTexture
}

const between = (low: number, high: number): number => low + Math.random() * (high - low)

const lavaYellow = new THREE.Color('#ffe066')
const lavaRed = new THREE.Color('#e0401a')

/** A ribbon of lava lying on the side of a cone, from the crater rim part of the way down. */
function lavaRiver(height: number, baseRadius: number, craterRadius: number, angle: number, reach: number): THREE.Mesh {
  const steps = 22
  const positions: number[] = []
  const uvs: number[] = []
  const indices: number[] = []
  const wobble = between(0, Math.PI * 2)
  for (let i = 0; i <= steps; i++) {
    const down = (i / steps) * reach
    const around = angle + 0.22 * Math.sin(down * 6 + wobble)
    const radius = craterRadius + (baseRadius - craterRadius) * down + height * 0.012
    const y = height * (1 - down) + height * 0.006
    // Widens as it runs downhill, then narrows to a rounded tip.
    const tip = Math.sqrt(Math.min(1, (steps - i) / 4))
    const halfWidth = height * (0.035 + 0.06 * down) * tip
    const x = Math.cos(around) * radius
    const z = Math.sin(around) * radius
    const sideX = -Math.sin(around) * halfWidth
    const sideZ = Math.cos(around) * halfWidth
    positions.push(x - sideX, y, z - sideZ, x + sideX, y, z + sideZ)
    uvs.push(0, down, 1, down)
    if (i < steps) {
      const corner = i * 2
      indices.push(corner, corner + 1, corner + 2, corner + 1, corner + 3, corner + 2)
    }
  }
  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2))
  geometry.setIndex(indices)
  return new THREE.Mesh(geometry, lavaFlowMaterial)
}

class Volcano {
  readonly group = new THREE.Group()
  private readonly top = new THREE.Vector3()
  /** How wide the cone is where it meets the deep sea floor. */
  private footRadius = 0
  private readonly craterRadius: number
  private readonly lava: Puffs | null = null
  private readonly smoke: Puffs | null = null
  private readonly glow: THREE.Sprite | null = null
  private erupting = false
  /** Seconds until the volcano switches between resting and erupting. */
  private countdown = between(2, 9)
  private lavaOwed = 0
  private smokeOwed = 0

  constructor(private readonly spec: VolcanoSpec) {
    const { height, mood } = spec
    const baseRadius = height * 1.15
    const craterRadius = (this.craterRadius = height * 0.2)
    const shoulderRadius = baseRadius + (craterRadius - baseRadius) * 0.68
    this.group.position.set(spec.x, 0, spec.z)
    this.top.set(spec.x, height, spec.z)

    // The slopes carry on at the same angle below the waterline, down past the deep sea floor,
    // so from underwater a volcano is a mountain standing on the bottom.
    const slopeHeight = height * 0.68
    const sunk = SEA.floorDepth + 4
    this.footRadius = baseRadius + ((baseRadius - shoulderRadius) / slopeHeight) * sunk
    const slopes = new THREE.Mesh(
      new THREE.CylinderGeometry(shoulderRadius, this.footRadius, slopeHeight + sunk, 12, 1, true),
      rock
    )
    slopes.position.y = (slopeHeight - sunk) / 2
    const summit = new THREE.Mesh(
      new THREE.CylinderGeometry(craterRadius, shoulderRadius, height * 0.32, 12, 1, true),
      mood === 'sleeping' ? snow : scorchedRock
    )
    summit.position.y = height * 0.84
    const crater = new THREE.Mesh(new THREE.CircleGeometry(craterRadius, 12), mood === 'sleeping' ? coldCrater : hotCrater)
    crater.rotation.x = -Math.PI / 2
    crater.position.y = height - height * 0.02
    this.group.add(slopes, summit, crater)

    if (mood === 'sleeping') return

    // The glow in the material keeps the puffs' undersides from turning grass-green.
    const smokeMaterial = new THREE.MeshLambertMaterial({ color: '#d9d4cf', emissive: '#8c8985' })
    this.smoke = new Puffs(puffGeometry, smokeMaterial, 30, {
      gravity: 0,
      drift: WIND,
      // Swell quickly, drift, then shrink away.
      sizeAt: (life) => Math.min(1, 0.35 + life * 2.2) * (life > 0.75 ? (1 - life) / 0.25 : 1)
    })
    this.glow = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: getGlowTexture(),
        depthWrite: false,
        fog: false,
        transparent: true
      })
    )
    this.glow.position.set(0, height + craterRadius * 0.4, 0)
    this.group.add(this.glow)

    if (mood === 'smoking') return

    // Lava rivers go on the south side, the side the camera sees.
    const rivers = mood === 'erupting' ? 3 : 2
    for (let i = 0; i < rivers; i++) {
      const angle = Math.PI / 2 + (i - (rivers - 1) / 2) * between(0.7, 1.0)
      this.group.add(lavaRiver(height, baseRadius, craterRadius, angle, between(0.5, 0.85)))
    }

    this.lava = new Puffs(blobGeometry, new THREE.MeshBasicMaterial({ fog: false }), 70, {
      gravity: GRAVITY,
      drift: new THREE.Vector3(),
      sizeAt: (life) => 1 - life * 0.5,
      colorAt: (life, target) => target.lerpColors(lavaYellow, lavaRed, Math.min(1, life * 1.6))
    })
  }

  /** The patch of sea floor the cone stands on, which nothing can walk through. */
  get footprint(): Obstacle {
    return { x: this.spec.x, z: this.spec.z, r: this.footRadius * 0.93 }
  }

  /** Particle meshes live in world space, so they are added to the scene beside the volcano. */
  get extras(): THREE.Object3D[] {
    return [this.lava?.mesh, this.smoke?.mesh].filter((mesh): mesh is THREE.InstancedMesh => mesh !== undefined)
  }

  update(timeSeconds: number, deltaSeconds: number): void {
    const { height, mood } = this.spec
    if (mood === 'sleeping') return

    if (mood === 'erupting') {
      this.countdown -= deltaSeconds
      if (this.countdown <= 0) {
        this.erupting = !this.erupting
        this.countdown = this.erupting ? between(3.5, 6) : between(6, 13)
      }
    }

    // How many lava blobs and smoke puffs to launch each second right now.
    const lavaRate = this.erupting ? 34 : mood === 'smoking' ? 0 : 1.2
    const smokeRate = this.erupting ? 2.8 : 0.9
    const launchSpeed = Math.sqrt(2 * GRAVITY * height * (this.erupting ? between(0.45, 0.85) : between(0.08, 0.2)))

    if (this.lava) {
      this.lavaOwed += lavaRate * deltaSeconds
      while (this.lavaOwed >= 1) {
        this.lavaOwed -= 1
        const direction = between(0, Math.PI * 2)
        const sideways = launchSpeed * between(0.08, 0.3)
        this.lava.launch(
          this.top,
          new THREE.Vector3(Math.cos(direction) * sideways, launchSpeed * between(0.75, 1), Math.sin(direction) * sideways),
          height * between(0.022, 0.045),
          8
        )
      }
      this.lava.update(deltaSeconds, height * 0.55)
    }

    if (this.smoke) {
      this.smokeOwed += smokeRate * deltaSeconds
      while (this.smokeOwed >= 1) {
        this.smokeOwed -= 1
        this.smoke.launch(
          this.top,
          new THREE.Vector3(between(-0.6, 0.6), between(3, 5), between(-0.6, 0.6)),
          this.craterRadius * between(0.7, 1.25),
          between(8, 12)
        )
      }
      this.smoke.update(deltaSeconds, -Infinity)
    }

    if (this.glow) {
      const flicker = 0.85 + 0.15 * Math.sin(timeSeconds * 7 + this.spec.x)
      const strength = (this.erupting ? 1.7 : mood === 'smoking' ? 0.6 : 1) * flicker
      this.glow.scale.setScalar(this.craterRadius * 6 * strength)
      this.glow.material.opacity = Math.min(1, 0.55 * strength)
    }
  }
}

/** Builds every volcano. Call `update` once a frame to keep the lava and smoke moving. */
export function buildVolcanoes(): {
  group: THREE.Group
  obstacles: Obstacle[]
  update: (timeSeconds: number, deltaSeconds: number) => void
} {
  const group = new THREE.Group()
  const volcanoes = VOLCANOES.map((spec) => new Volcano(spec))
  for (const volcano of volcanoes) group.add(volcano.group, ...volcano.extras)
  return {
    group,
    obstacles: volcanoes.map((volcano) => volcano.footprint),
    update(timeSeconds, deltaSeconds) {
      lavaFlowMaterial.uniforms['time']!.value = timeSeconds
      for (const volcano of volcanoes) volcano.update(timeSeconds, deltaSeconds)
    }
  }
}
