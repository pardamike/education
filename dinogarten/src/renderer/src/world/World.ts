import * as THREE from 'three'
import playerModelUrl from '@content/player/model.glb?url'
import playerLook from '@content/player/player.json'
import { Dino, type DinoLook } from './Dino'
import { groundHeight, keepInWorld, waterLevel } from './coast'
import { Ripples } from './ripples'
import { buildScenery, SKY_COLOR, type Obstacle } from './scenery'

/** One dinosaur you can meet. This is the shape of content/dinos/<id>/dino.json. */
export interface DinoDefinition {
  name: string
  sayIt: string
  eats: string
  /** Where it stands: [x, z] in world units. The player starts at [0, 0]. */
  position: [number, number]
  /** Which way it faces, in degrees. 0 looks straight at the camera. */
  facing: number
  /** Set to false for giants, which stand still instead of swinging round to watch the player. */
  turnsToPlayer?: boolean
  /** How close the player can get to its middle, in world units. Left out, the two stop nose to nose. */
  personalSpace?: number
  look: DinoLook
}

// Every folder in content/dinos is picked up automatically: add a folder, get a dinosaur.
const definitions = import.meta.glob<DinoDefinition>('@content/dinos/*/dino.json', {
  eager: true,
  import: 'default'
})
const modelUrls = import.meta.glob<string>('@content/dinos/*/model.glb', {
  eager: true,
  query: '?url',
  import: 'default'
})

const PLAYER_SPEED = 4.3
/**
 * How fast the run animation plays. At normal rate the little T. rex's stride covers about
 * 2.9 units a second, so 1.5 keeps its feet from sliding at PLAYER_SPEED. Retune both together.
 */
const PLAYER_RUN_RATE = 1.5
const PLAYER_RADIUS = 0.7
/** In water deeper than this the player slows down, as if wading. */
const WADING_DEPTH = 0.5
const WADING_SPEED = 0.7
const SUN_OFFSET = new THREE.Vector3(-10, 24, 14)
/** A waiting dinosaur turns to watch the player inside this distance. */
const NOTICE_DISTANCE = 9

interface Neighbour {
  dino: Dino
  homeYaw: number
  turns: boolean
  /** The player counts as standing with this dinosaur when their centres are closer than this. */
  reach: number
}

/** Turns `current` toward `wanted` (radians) by `amount` (0 to 1), going the short way round. */
function turnToward(current: number, wanted: number, amount: number): number {
  const difference = Math.atan2(Math.sin(wanted - current), Math.cos(wanted - current))
  return current + difference * Math.min(1, amount)
}

export class World {
  private readonly renderer: THREE.WebGLRenderer
  private readonly scene = new THREE.Scene()
  private readonly camera = new THREE.PerspectiveCamera(50, 1, 0.1, 900)
  private readonly sun = new THREE.DirectionalLight('#fff3d6', 2.4)
  private readonly raycaster = new THREE.Raycaster()
  private readonly groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0)
  private readonly marker: THREE.Mesh
  private readonly cameraFocus = new THREE.Vector3()
  /** Where the camera sits relative to the player, and how high above the ground it aims. */
  private readonly cameraOffset = new THREE.Vector3(0, 4.2, 8)
  /** Aiming a little above the player leaves a band of sky for the volcanoes. */
  private readonly cameraLookHeight = 2.3
  private readonly listeners = new AbortController()
  private readonly resizeObserver: ResizeObserver
  private readonly keysDown = new Set<string>()
  private readonly obstacles: Obstacle[]
  private readonly updateScenery: (timeSeconds: number, deltaSeconds: number) => void
  private readonly neighbours: Neighbour[] = []

  private player: Dino | null = null
  /** Ripples for the player and for each dinosaur that stands in water. */
  private readonly ripples: Array<{ dino: Dino; rings: Ripples }> = []
  private target: THREE.Vector3 | null = null
  private closestToTarget = Infinity
  private secondsWithoutProgress = 0
  private lastFrameMs = 0
  private disposed = false

  constructor(private readonly canvas: HTMLCanvasElement) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true })
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    this.renderer.shadowMap.enabled = true

    this.scene.background = new THREE.Color(SKY_COLOR)
    this.scene.fog = new THREE.Fog(SKY_COLOR, 90, 430)

    this.scene.add(new THREE.HemisphereLight('#ffffff', '#9ccf7a', 1.5))
    this.sun.castShadow = true
    this.sun.shadow.mapSize.set(2048, 2048)
    this.sun.shadow.camera.left = this.sun.shadow.camera.bottom = -26
    this.sun.shadow.camera.right = this.sun.shadow.camera.top = 26
    this.sun.shadow.camera.near = 1
    this.sun.shadow.camera.far = 90
    this.sun.shadow.normalBias = 0.04
    this.scene.add(this.sun, this.sun.target)

    const dinoSpots = Object.values(definitions).map((definition) => ({
      x: definition.position[0],
      z: definition.position[1],
      r: definition.look.height * 2
    }))
    const scenery = buildScenery([{ x: 0, z: 0, r: 5 }, ...dinoSpots])
    this.scene.add(scenery.group)
    this.obstacles = scenery.obstacles
    this.updateScenery = scenery.update

    this.marker = new THREE.Mesh(
      new THREE.RingGeometry(0.45, 0.68, 32),
      new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.9, depthWrite: false })
    )
    this.marker.rotation.x = -Math.PI / 2
    this.marker.position.y = 0.08
    this.marker.visible = false
    this.scene.add(this.marker)

    const { signal } = this.listeners
    canvas.addEventListener('pointerdown', this.onPointer, { signal })
    canvas.addEventListener('pointermove', this.onPointer, { signal })
    window.addEventListener('keydown', this.onKeyDown, { signal })
    window.addEventListener('keyup', (event) => this.keysDown.delete(event.code), { signal })
    window.addEventListener('blur', () => this.keysDown.clear(), { signal })

    this.resizeObserver = new ResizeObserver(() => this.resize())
    this.resizeObserver.observe(canvas)
    this.resize()

    this.placeCamera(1)
    this.renderer.setAnimationLoop(this.frame)

    // Lets automated checks (and curious developers) drive the game from the console.
    window.dinogarten = {
      world: this,
      walkTo: (x, z) => this.walkTo(x, z),
      state: () => ({
        loaded: this.player !== null,
        walking: this.target !== null,
        x: this.player?.root.position.x ?? 0,
        z: this.player?.root.position.z ?? 0
      })
    }
  }

  /** Loads the player and every dinosaur in content/dinos, then puts them in the world. */
  async load(): Promise<void> {
    const entries = Object.entries(definitions).map(([path, definition]) => {
      const modelUrl = modelUrls[path.replace(/dino\.json$/, 'model.glb')]
      if (!modelUrl) throw new Error(`${path} has no model.glb beside it`)
      return { definition, modelUrl }
    })

    const [player, ...others] = await Promise.all([
      Dino.load(playerModelUrl, playerLook),
      ...entries.map(({ definition, modelUrl }) => Dino.load(modelUrl, definition.look))
    ])
    if (this.disposed) return

    others.forEach((dino, index) => {
      const { definition } = entries[index]!
      const [x, z] = definition.position
      const homeYaw = THREE.MathUtils.degToRad(definition.facing)
      dino.root.position.set(x, groundHeight(x, z), z)
      dino.root.rotation.y = homeYaw
      this.scene.add(dino.root)
      // By default, big enough that the two stop nose to nose with a little gap, not overlapping.
      const r = definition.personalSpace ?? dino.radius + player.radius + 0.2
      this.obstacles.push({ x, z, r })
      this.neighbours.push({ dino, homeYaw, turns: definition.turnsToPlayer ?? true, reach: r + PLAYER_RADIUS + 1 })
    })

    this.scene.add(player.root)
    this.player = player

    for (const dino of [player, ...others]) {
      const rings = new Ripples(dino.radius * 0.5)
      this.scene.add(rings.group)
      this.ripples.push({ dino, rings })
    }
  }

  dispose(): void {
    this.disposed = true
    this.listeners.abort()
    this.resizeObserver.disconnect()
    this.renderer.setAnimationLoop(null)
    this.renderer.dispose()
    delete window.dinogarten
  }

  /** Sends the player walking to a spot on the ground. */
  walkTo(x: number, z: number): void {
    const target = new THREE.Vector3(x, 0, z)
    keepInWorld(target)
    // A click on a tree, the pond or a dinosaur means "go there", so aim for the nearest edge.
    for (const obstacle of this.obstacles) {
      const reach = obstacle.r + PLAYER_RADIUS + 0.15
      const dx = target.x - obstacle.x
      const dz = target.z - obstacle.z
      const distance = Math.hypot(dx, dz)
      if (distance >= reach) continue
      const from = this.player?.root.position ?? target
      const awayX = distance > 0.001 ? dx / distance : from.x - obstacle.x
      const awayZ = distance > 0.001 ? dz / distance : from.z - obstacle.z
      const length = Math.hypot(awayX, awayZ) || 1
      target.x = obstacle.x + (awayX / length) * reach
      target.z = obstacle.z + (awayZ / length) * reach
    }
    this.target = target
    this.closestToTarget = Infinity
    this.secondsWithoutProgress = 0
    this.marker.position.set(target.x, groundHeight(target.x, target.z) + 0.08, target.z)
    this.marker.visible = true
  }

  private stopWalking(): void {
    this.target = null
    this.marker.visible = false
  }

  private readonly onPointer = (event: PointerEvent): void => {
    // Holding the button and dragging keeps steering; a plain hover does nothing.
    if (event.type === 'pointermove' && event.buttons === 0) return
    const bounds = this.canvas.getBoundingClientRect()
    const pointer = new THREE.Vector2(
      ((event.clientX - bounds.left) / bounds.width) * 2 - 1,
      -((event.clientY - bounds.top) / bounds.height) * 2 + 1
    )
    this.raycaster.setFromCamera(pointer, this.camera)
    // The sea floor is lower than the land, so aim at flat ground first, then again at the height found there.
    const spot = new THREE.Vector3()
    this.groundPlane.constant = 0
    for (let pass = 0; pass < 4; pass++) {
      if (!this.raycaster.ray.intersectPlane(this.groundPlane, spot)) return
      this.groundPlane.constant = -groundHeight(spot.x, spot.z)
    }
    this.walkTo(spot.x, spot.z)
  }

  private readonly onKeyDown = (event: KeyboardEvent): void => {
    if (event.code.startsWith('Arrow')) event.preventDefault()
    this.keysDown.add(event.code)
  }

  private isDown(...codes: string[]): boolean {
    return codes.some((code) => this.keysDown.has(code))
  }

  private resize(): void {
    const width = this.canvas.clientWidth
    const height = this.canvas.clientHeight
    if (width === 0 || height === 0) return
    this.renderer.setSize(width, height, false)
    this.camera.aspect = width / height
    this.camera.updateProjectionMatrix()
  }

  private readonly frame = (timeMs: number): void => {
    const deltaSeconds = Math.min((timeMs - this.lastFrameMs) / 1000, 0.05)
    this.lastFrameMs = timeMs
    this.movePlayer(deltaSeconds)
    this.updateNeighbours(deltaSeconds)
    this.updateScenery(timeMs / 1000, deltaSeconds)
    const level = waterLevel(timeMs / 1000)
    for (const { dino, rings } of this.ripples) {
      const { x, z } = dino.root.position
      rings.update(timeMs / 1000, x, z, level, level - groundHeight(x, z))
    }
    this.placeCamera(1 - Math.exp(-6 * deltaSeconds))
    if (this.marker.visible) this.marker.scale.setScalar(1 + Math.sin(timeMs / 160) * 0.15)
    this.renderer.render(this.scene, this.camera)
  }

  /** Works out which way the player wants to go this frame: keys win over a clicked spot. */
  private wantedStep(position: THREE.Vector3, maxStep: number): { x: number; z: number; length: number } | null {
    const keyX = Number(this.isDown('ArrowRight', 'KeyD')) - Number(this.isDown('ArrowLeft', 'KeyA'))
    const keyZ = Number(this.isDown('ArrowDown', 'KeyS')) - Number(this.isDown('ArrowUp', 'KeyW'))
    if (keyX !== 0 || keyZ !== 0) {
      this.stopWalking()
      const length = Math.hypot(keyX, keyZ)
      return { x: keyX / length, z: keyZ / length, length: maxStep }
    }
    if (!this.target) return null

    const dx = this.target.x - position.x
    const dz = this.target.z - position.z
    const distance = Math.hypot(dx, dz)
    if (distance < 0.15) {
      this.stopWalking()
      return null
    }
    return { x: dx / distance, z: dz / distance, length: Math.min(maxStep, distance) }
  }

  private movePlayer(deltaSeconds: number): void {
    const player = this.player
    if (!player) return
    const position = player.root.position
    const wading = -position.y > WADING_DEPTH
    const step = this.wantedStep(position, PLAYER_SPEED * (wading ? WADING_SPEED : 1) * deltaSeconds)

    if (!step) {
      // Standing next to a dinosaur: turn to look at it.
      for (const { dino, reach } of this.neighbours) {
        const dx = dino.root.position.x - position.x
        const dz = dino.root.position.z - position.z
        if (Math.hypot(dx, dz) > reach) continue
        player.root.rotation.y = turnToward(player.root.rotation.y, Math.atan2(dx, dz), 6 * deltaSeconds)
      }
      player.play('idle')
      player.update(deltaSeconds)
      return
    }

    // If something is in the way, walk around its edge instead of pushing into it.
    let { x, z } = step
    for (const obstacle of this.obstacles) {
      const dx = obstacle.x - position.x
      const dz = obstacle.z - position.z
      const distance = Math.hypot(dx, dz)
      const touching = distance < obstacle.r + PLAYER_RADIUS + 0.05
      const headingIn = x * dx + z * dz > 0
      if (!touching || !headingIn || distance < 0.001) continue
      const alongX = -dz / distance
      const alongZ = dx / distance
      const sign = x * alongX + z * alongZ >= 0 ? 1 : -1
      x = alongX * sign
      z = alongZ * sign
    }

    position.x += x * step.length
    position.z += z * step.length

    for (const obstacle of this.obstacles) {
      const dx = position.x - obstacle.x
      const dz = position.z - obstacle.z
      const distance = Math.hypot(dx, dz)
      const minimum = obstacle.r + PLAYER_RADIUS
      if (distance >= minimum || distance < 0.001) continue
      position.x = obstacle.x + (dx / distance) * minimum
      position.z = obstacle.z + (dz / distance) * minimum
    }
    keepInWorld(position)
    position.y = groundHeight(position.x, position.z)

    player.root.rotation.y = turnToward(player.root.rotation.y, Math.atan2(x, z), 10 * deltaSeconds)
    player.play('run', 0.2, PLAYER_RUN_RATE)
    player.update(deltaSeconds)

    // Give up on a clicked spot the player cannot get any closer to.
    if (this.target) {
      const remaining = Math.hypot(this.target.x - position.x, this.target.z - position.z)
      if (remaining < this.closestToTarget - 0.01) {
        this.closestToTarget = remaining
        this.secondsWithoutProgress = 0
      } else {
        this.secondsWithoutProgress += deltaSeconds
        if (this.secondsWithoutProgress > 1.5) this.stopWalking()
      }
    }
  }

  private updateNeighbours(deltaSeconds: number): void {
    const playerPosition = this.player?.root.position
    for (const { dino, homeYaw, turns } of this.neighbours) {
      let wantedYaw = homeYaw
      if (playerPosition && turns) {
        const dx = playerPosition.x - dino.root.position.x
        const dz = playerPosition.z - dino.root.position.z
        if (Math.hypot(dx, dz) < NOTICE_DISTANCE) wantedYaw = Math.atan2(dx, dz)
      }
      dino.root.rotation.y = turnToward(dino.root.rotation.y, wantedYaw, 3 * deltaSeconds)
      dino.update(deltaSeconds)
    }
  }

  /** The camera never turns; it glides after the player so arrow keys always mean the same thing. */
  private placeCamera(amount: number): void {
    if (this.player) this.cameraFocus.lerp(this.player.root.position, amount)
    this.camera.position.copy(this.cameraFocus).add(this.cameraOffset)
    this.camera.lookAt(this.cameraFocus.x, this.cameraFocus.y + this.cameraLookHeight, this.cameraFocus.z)
    this.sun.position.copy(this.cameraFocus).add(SUN_OFFSET)
    this.sun.target.position.copy(this.cameraFocus)
  }
}

declare global {
  interface Window {
    dinogarten?: {
      world: World
      walkTo(x: number, z: number): void
      state(): { loaded: boolean; walking: boolean; x: number; z: number }
    }
  }
}
