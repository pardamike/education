import * as THREE from 'three'
import playerModelUrl from '@content/player/model.glb?url'
import playerLook from '@content/player/player.json'
import type { Lesson } from '../lessons/types'
import { Dino, type Creature, type DinoLook } from './Dino'
import { Flier, type FlySpec } from './Flier'
import { SeaReptile, type SeaReptileKind, type SwimSpec } from './SeaReptile'
import { groundHeight, keepInWorld, waterLevel } from './coast'
import { Navigator } from './navigation'
import { Ripples } from './ripples'
import { buildScenery, SKY_COLOR, type Obstacle } from './scenery'
import { SeeThrough } from './seeThrough'

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
  /** For an animal built in code, which one. It then needs no model.glb. */
  madeInCode?: SeaReptileKind
  /** For an animal that swims about on its own: where it patrols. It then ignores `position` and `facing`. */
  swims?: SwimSpec
  /** For an animal that flies about on its own: the patch of sky it patrols. It then ignores `position` and `facing`. */
  flies?: FlySpec
  /** Makes a whole group of this animal instead of one, scattered up to `spread` away from `position`. */
  flock?: { count: number; spread: number }
  /** The lesson it gives once it has introduced itself. Left out, it only says hello. */
  lesson?: Lesson
  /** Which voice speaks its lines. Only the voice tool in tools/voices reads this. */
  voice?: { name: string; speed?: number }
  look: DinoLook
}

/** A dinosaur the player has walked up to: what the screen needs in order to introduce it. */
export interface Meeting {
  /** The dinosaur's folder name in content/dinos. Its spoken lines are filed under this. */
  id: string
  name: string
  sayIt: string
  eats: string
  lesson?: Lesson
  /** Goes up by one each time a meeting starts, so meeting the same dinosaur twice counts as two meetings. */
  visit: number
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
/** Once the water is deeper than this he is fully under, and swims along just above the sea floor. */
const SWIMMING_DEPTH = 2.4
const SWIMMING_SPEED = 0.85
/** The colour of the water when the camera is under it. */
const DEEP_COLOR = new THREE.Color('#2a7fae')
const SKY = new THREE.Color(SKY_COLOR)
const SUN_OFFSET = new THREE.Vector3(-10, 24, 14)
/** A waiting dinosaur turns to watch the player inside this distance. */
const NOTICE_DISTANCE = 9

interface Neighbour {
  /** The dinosaur's folder name in content/dinos. */
  id: string
  definition: DinoDefinition
  dino: Creature
  /** Its head, which is what the camera frames in a meeting. */
  head: THREE.Object3D | null
  /** True once it has met the player, until he walks well away. Stops a finished meeting starting again at once. */
  greeted: boolean
  homeYaw: number
  turns: boolean
  /** True for an animal that moves itself around; the world then leaves its position and heading alone. */
  roams: boolean
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
  private readonly skyLight = new THREE.HemisphereLight('#ffffff', '#9ccf7a', 1.5)
  private readonly fog = new THREE.Fog(SKY_COLOR, 90, 430)
  private readonly background = new THREE.Color(SKY_COLOR)
  /** 0 on land, rising to 1 as the player goes from wading to swimming underwater. */
  private swimming = 0
  /** 0 with the camera in the air, 1 with it underwater. Eases between the two so the change is gentle. */
  private underwater = 0
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
  private readonly blowBubble: (from: THREE.Vector3) => void
  private readonly setWaterOpacity: (opacity: number) => void
  private secondsToNextBubble = 0
  private readonly neighbours: Neighbour[] = []
  private readonly seeThrough = new SeeThrough()

  /** Called when the player starts standing with a dinosaur, and with null when he walks off again. */
  onMeeting: (meeting: Meeting | null) => void = () => {}
  /** The dinosaur the player is standing with, if any. */
  private meeting: Neighbour | null = null
  private visits = 0
  private secondsStanding = 0
  /** While this is in the future the player is jumping for joy, and is left to finish. */
  private cheeringUntil = 0
  /** 0 while the camera follows the player, 1 while it frames a meeting. It eases between the two. */
  private meetingView = 0
  private readonly meetingSpot = new THREE.Vector3()
  private readonly meetingLook = new THREE.Vector3()
  /** Where the dinosaur's face is, measured from the dinosaur, so the camera holds steady while the animal shifts about. */
  private readonly faceInDino = new THREE.Vector3()
  /** Which side of the pair the camera sits on: 1, -1, or 0 before it has been chosen. */
  private meetingSide = 0
  private readonly cameraSpot = new THREE.Vector3()
  private readonly cameraLook = new THREE.Vector3()

  private player: Dino | null = null
  /** True while nobody is playing (the player picker is up): the mouse and the keys do nothing. */
  private paused = true
  /** The colours of whoever is playing, kept so they can go on a T. rex that has not finished loading. */
  private playerColours: { body: string; belly: string } | null = null
  /** Ripples for the player and for each dinosaur that stands in water. */
  private readonly ripples: Array<{ dino: Creature; rings: Ripples }> = []
  private timeSeconds = 0
  /** Where the player has been told to walk to, or null when standing still or steered by keys. */
  private target: THREE.Vector3 | null = null
  /** The points still to walk through on the way there. The last one is the target itself. */
  private route: THREE.Vector3[] = []
  private navigator: Navigator | null = null
  /** Used to notice when the player has stopped getting anywhere. */
  private readonly lastProgressAt = new THREE.Vector3()
  private secondsWithoutProgress = 0
  private lastFrameMs = 0
  private disposed = false

  constructor(private readonly canvas: HTMLCanvasElement) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true })
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    this.renderer.shadowMap.enabled = true

    this.scene.background = this.background
    this.scene.fog = this.fog

    this.scene.add(this.skyLight)
    this.sun.castShadow = true
    this.sun.shadow.mapSize.set(2048, 2048)
    this.sun.shadow.camera.left = this.sun.shadow.camera.bottom = -26
    this.sun.shadow.camera.right = this.sun.shadow.camera.top = 26
    this.sun.shadow.camera.near = 1
    this.sun.shadow.camera.far = 90
    this.sun.shadow.normalBias = 0.04
    this.scene.add(this.sun, this.sun.target)

    const onTheGround = Object.values(definitions).filter((definition) => !definition.flies)
    const dinoSpots = onTheGround.map((definition) => ({
      x: definition.position[0],
      z: definition.position[1],
      r: definition.flock ? definition.flock.spread + 1.5 : definition.look.height * 2
    }))
    const scenery = buildScenery([{ x: 0, z: 0, r: 5 }, ...dinoSpots])
    this.scene.add(scenery.group)
    this.obstacles = scenery.obstacles
    this.updateScenery = scenery.update
    for (const tree of scenery.trees) this.seeThrough.add(tree.object, tree.radius, tree.height)
    this.blowBubble = scenery.blowBubble
    this.setWaterOpacity = scenery.setWaterOpacity

    this.marker = new THREE.Mesh(
      new THREE.RingGeometry(0.45, 0.68, 32),
      // Drawn on top of everything, so ferns and seagrass never hide where he is heading.
      new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.9, depthWrite: false, depthTest: false })
    )
    this.marker.renderOrder = 10
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
        z: this.player?.root.position.z ?? 0,
        meeting: this.meeting?.id ?? null
      })
    }
  }

  /** Loads the player and every dinosaur in content/dinos, then puts them in the world. */
  async load(): Promise<void> {
    const entries = Object.entries(definitions).flatMap(([path, definition]) => {
      const modelUrl = modelUrls[path.replace(/dino\.json$/, 'model.glb')]
      if (!modelUrl && !definition.madeInCode) throw new Error(`${path} has no model.glb beside it`)
      const id = path.split('/').at(-2)!
      if (!definition.flock) return [{ id, definition, modelUrl }]
      // A flock is the same animal several times over, each a little different in size and facing,
      // spread out in a spiral so that no two stand on the same spot.
      const { count, spread } = definition.flock
      return Array.from({ length: count }, (_, i) => {
        const distance = spread * Math.sqrt((i + 0.5) / count)
        const angle = i * 2.4
        const member: DinoDefinition = {
          ...definition,
          position: [
            definition.position[0] + Math.cos(angle) * distance,
            definition.position[1] + Math.sin(angle) * distance
          ],
          facing: definition.facing + ((i * 47) % 90) - 45,
          look: { ...definition.look, height: definition.look.height * (0.85 + ((i * 0.618) % 1) * 0.3) }
        }
        return { id, definition: member, modelUrl }
      })
    })

    const [player, ...others] = await Promise.all([
      Dino.load(playerModelUrl, playerLook),
      ...entries.map(({ definition, modelUrl }): Promise<Creature> | Creature =>
        modelUrl
          ? definition.flies
            ? Flier.load(modelUrl, definition.look, definition.flies)
            : Dino.load(modelUrl, definition.look)
          : new SeaReptile(
              definition.madeInCode ?? 'mosasaurus',
              definition.look,
              definition.swims ?? { around: definition.position, width: 20, length: 8, depth: 6 }
            )
      )
    ])
    if (this.disposed) return

    others.forEach((dino, index) => {
      const { id, definition } = entries[index]!
      this.scene.add(dino.root)
      const head = dino.root.getObjectByName('Head') ?? null
      if (definition.swims || definition.flies) {
        // A swimmer or a flier places and steers itself, and is never in the way.
        this.neighbours.push({ id, definition, dino, head, greeted: false, homeYaw: 0, turns: false, roams: true, reach: 0 })
        return
      }
      const [x, z] = definition.position
      const homeYaw = THREE.MathUtils.degToRad(definition.facing)
      dino.root.position.set(x, groundHeight(x, z), z)
      dino.root.rotation.y = homeYaw
      // By default, big enough that the two stop nose to nose with a little gap, not overlapping.
      const r = definition.personalSpace ?? dino.radius + player.radius + 0.2
      this.obstacles.push({ x, z, r })
      this.seeThrough.add(dino.root, dino.radius * 0.55, dino.height)
      this.neighbours.push({
        id,
        definition,
        dino,
        head,
        greeted: false,
        homeYaw,
        turns: definition.turnsToPlayer ?? true,
        roams: false,
        reach: r + PLAYER_RADIUS + 1
      })
    })

    // Turn first, then tip forward: lets him lean into a swim whichever way he is facing.
    player.root.rotation.order = 'YXZ'
    this.scene.add(player.root)
    this.player = player
    this.wearColours()

    // Every obstacle is known now, so the routes around them can be worked out.
    this.navigator = new Navigator(this.obstacles, PLAYER_RADIUS + 0.2)

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

  /** Starts the game for one player, or carries it on: the little T. rex takes that player's colours. */
  play(colours: { body: string; belly: string }): void {
    this.playerColours = colours
    this.wearColours()
    this.paused = false
    // Whoever he is standing beside says hello again, in case somebody new has taken over.
    for (const neighbour of this.neighbours) neighbour.greeted = false
    this.secondsStanding = 0
  }

  /** Stops the game while the player picker is up. The world carries on moving behind it. */
  pause(): void {
    this.paused = true
    this.keysDown.clear()
    this.stopWalking()
    if (this.meeting) this.endMeeting()
  }

  private wearColours(): void {
    if (!this.playerColours) return
    // These are the names of the body and belly colours in the T. rex model.
    this.player?.recolour({ Green: this.playerColours.body, LightGreen: this.playerColours.belly })
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
    const from = this.player?.root.position
    const path = from && this.navigator ? this.navigator.findPath(from.x, from.z, target.x, target.z) : null
    // With no route to follow (nothing loaded yet, or no way round), head straight there.
    this.route = path ? path.map((point) => new THREE.Vector3(point.x, 0, point.z)) : [target]
    this.target = target
    this.secondsWithoutProgress = 0
    if (from) this.lastProgressAt.copy(from)
    this.marker.position.set(target.x, groundHeight(target.x, target.z) + 0.08, target.z)
    this.marker.visible = true
  }

  private stopWalking(): void {
    this.target = null
    this.route = []
    this.marker.visible = false
  }

  private readonly onPointer = (event: PointerEvent): void => {
    if (this.paused) return
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
    for (let pass = 0; pass < 8; pass++) {
      if (!this.raycaster.ray.intersectPlane(this.groundPlane, spot)) return
      this.groundPlane.constant = -groundHeight(spot.x, spot.z)
    }
    // During a meeting, a click on the dinosaur or right beside the player is not a request to walk off.
    if (this.meeting && this.player) {
      const dino = this.meeting.dino.root.position
      const player = this.player.root.position
      if (Math.hypot(spot.x - dino.x, spot.z - dino.z) < this.meeting.reach) return
      if (Math.hypot(spot.x - player.x, spot.z - player.z) < 1.5) return
    }
    this.walkTo(spot.x, spot.z)
  }

  /** A little celebration for a right answer: the dinosaur and the player both jump for joy. */
  cheer(): void {
    const dino = this.meeting?.dino
    if (dino instanceof Dino) dino.playOnce('jump')
    if (this.player) this.cheeringUntil = this.timeSeconds + this.player.playOnce('jump')
  }

  private startMeeting(neighbour: Neighbour): void {
    this.meeting = neighbour
    neighbour.greeted = true
    const dino = neighbour.dino.root
    dino.updateMatrixWorld(true)
    const face = neighbour.head
      ? neighbour.head.getWorldPosition(new THREE.Vector3())
      : dino.position.clone().setY(dino.position.y + neighbour.dino.height)
    this.faceInDino.copy(dino.worldToLocal(face))
    this.meetingSide = 0
    const { name, sayIt, eats, lesson } = neighbour.definition
    this.onMeeting({ id: neighbour.id, name, sayIt, eats, visit: ++this.visits, ...(lesson ? { lesson } : {}) })
  }

  private endMeeting(): void {
    this.meeting = null
    this.onMeeting(null)
  }

  private readonly onKeyDown = (event: KeyboardEvent): void => {
    // With the picker up, the keys are for typing a name.
    if (this.paused) return
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
    this.timeSeconds = timeMs / 1000
    this.movePlayer(deltaSeconds)
    this.updateNeighbours(deltaSeconds)
    this.updateScenery(timeMs / 1000, deltaSeconds)
    const level = waterLevel(timeMs / 1000)
    for (const { dino, rings } of this.ripples) {
      const { x, y, z } = dino.root.position
      // Only something that breaks the surface makes ripples; fully underwater it makes none.
      const breaksSurface = y < level && y + dino.height > level
      rings.update(timeMs / 1000, x, z, level, breaksSurface ? level - y : 0)
    }
    this.placeCamera(1 - Math.exp(-6 * deltaSeconds), deltaSeconds)
    if (this.player) {
      this.seeThrough.update(this.camera.position, this.player.root.position, deltaSeconds, this.meeting?.dino.root)
    }
    this.tintForDepth(level, deltaSeconds)
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

    // Tick off the points along the route as they are reached, then aim for the next one.
    while (this.route.length > 1 && Math.hypot(this.route[0]!.x - position.x, this.route[0]!.z - position.z) < 0.5) {
      this.route.shift()
    }
    const next = this.route[0] ?? this.target
    const dx = next.x - position.x
    const dz = next.z - position.z
    const distance = Math.hypot(dx, dz)
    if (this.route.length <= 1 && distance < 0.15) {
      this.stopWalking()
      return null
    }
    return { x: dx / distance, z: dz / distance, length: Math.min(maxStep, distance) }
  }

  private movePlayer(deltaSeconds: number): void {
    const player = this.player
    if (!player) return
    const position = player.root.position
    const wading = -groundHeight(position.x, position.z) > WADING_DEPTH
    const pace = this.swimming > 0.5 ? SWIMMING_SPEED : wading ? WADING_SPEED : 1
    const step = this.wantedStep(position, PLAYER_SPEED * pace * deltaSeconds)

    // Fully underwater he swims: lifted just off the sea floor, leaning forward, bobbing gently.
    const floor = groundHeight(position.x, position.z)
    const under = waterLevel(this.timeSeconds) - floor > SWIMMING_DEPTH
    this.swimming += ((under ? 1 : 0) - this.swimming) * Math.min(1, 3 * deltaSeconds)
    position.y = floor + this.swimming * (0.6 + Math.sin(this.timeSeconds * 2.2) * 0.12)
    player.root.rotation.x = this.swimming * 0.32

    // And he blows a little stream of bubbles from about where his nose is.
    this.secondsToNextBubble -= deltaSeconds
    if (under && this.secondsToNextBubble <= 0) {
      this.secondsToNextBubble = 0.25 + Math.random() * 0.5
      const yaw = player.root.rotation.y
      this.blowBubble(new THREE.Vector3(position.x + Math.sin(yaw) * 1.4, position.y + 1.3, position.z + Math.cos(yaw) * 1.4))
    }

    if (!step) {
      // Standing next to a dinosaur: turn to look at it, and after a moment the two of them meet.
      let beside: Neighbour | null = null
      let nearest = Infinity
      for (const neighbour of this.neighbours) {
        const away = Math.hypot(neighbour.dino.root.position.x - position.x, neighbour.dino.root.position.z - position.z)
        if (away > neighbour.reach || away >= nearest) continue
        beside = neighbour
        nearest = away
      }
      if (beside) {
        const dx = beside.dino.root.position.x - position.x
        const dz = beside.dino.root.position.z - position.z
        player.root.rotation.y = turnToward(player.root.rotation.y, Math.atan2(dx, dz), 6 * deltaSeconds)
        this.secondsStanding += deltaSeconds
        if (!this.paused && !this.meeting && !beside.greeted && this.secondsStanding > 0.35) this.startMeeting(beside)
      }
      if (this.timeSeconds > this.cheeringUntil) player.play('idle')
      player.update(deltaSeconds)
      return
    }
    // He is on the move, so any meeting is over.
    this.secondsStanding = 0
    if (this.meeting) this.endMeeting()

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

    player.root.rotation.y = turnToward(player.root.rotation.y, Math.atan2(x, z), 10 * deltaSeconds)
    player.play('run', 0.2, PLAYER_RUN_RATE)
    // Underwater his legs paddle slowly instead of sprinting.
    player.setRate(PLAYER_RUN_RATE * (1 - 0.45 * this.swimming))
    player.update(deltaSeconds)

    // Give up if the player has been walking on the spot: something unexpected is in the way.
    if (this.target) {
      if (Math.hypot(position.x - this.lastProgressAt.x, position.z - this.lastProgressAt.z) > 0.5) {
        this.lastProgressAt.copy(position)
        this.secondsWithoutProgress = 0
      } else {
        this.secondsWithoutProgress += deltaSeconds
        if (this.secondsWithoutProgress > 1.2) this.stopWalking()
      }
    }
  }

  private updateNeighbours(deltaSeconds: number): void {
    const playerPosition = this.player?.root.position
    for (const neighbour of this.neighbours) {
      const { dino, homeYaw, turns, roams } = neighbour
      if (roams) {
        dino.update(deltaSeconds, playerPosition ?? null)
        continue
      }
      let wantedYaw = homeYaw
      if (playerPosition) {
        const dx = playerPosition.x - dino.root.position.x
        const dz = playerPosition.z - dino.root.position.z
        const away = Math.hypot(dx, dz)
        if (turns && away < NOTICE_DISTANCE) wantedYaw = Math.atan2(dx, dz)
        // Once the player has walked well away, it is ready to meet him again.
        if (away > neighbour.reach + 2.5) neighbour.greeted = false
      }
      dino.root.rotation.y = turnToward(dino.root.rotation.y, wantedYaw, 3 * deltaSeconds)
      dino.update(deltaSeconds, playerPosition ?? null)
    }
  }

  /**
   * Above the water the world is bright and you can see for miles. Once the camera dips under,
   * everything turns blue and fades out a short way off, the way it does for a diver.
   */
  private tintForDepth(level: number, deltaSeconds: number): void {
    // How far the camera is above the surface of the sea; negative once it is under.
    const height = this.camera.position.y - level
    // The surface is misty from a distance and clears as the camera comes down to it, from above
    // or from below. At the moment the camera passes through there is almost nothing to pass through,
    // so going under is a gradual change, not a sudden switch from one look to another.
    const fromAbove = THREE.MathUtils.smoothstep(height, 0.2, 4)
    const fromBelow = THREE.MathUtils.smoothstep(-height, 0.2, 3)
    this.setWaterOpacity(0.14 + 0.46 * fromAbove + 0.16 * fromBelow)
    // The blue haze of the deep comes in only once the camera is under, and thickens as it sinks.
    const wanted = THREE.MathUtils.smoothstep(-height, 0, 3.5)
    this.underwater += (wanted - this.underwater) * Math.min(1, 4 * deltaSeconds)
    const under = this.underwater
    this.background.lerpColors(SKY, DEEP_COLOR, under)
    this.fog.color.copy(this.background)
    // Distances shrink by a steady proportion, which looks even; a straight blend would rush at the start.
    this.fog.near = 90 * (2 / 90) ** under
    this.fog.far = 430 * (62 / 430) ** under
    this.skyLight.intensity = THREE.MathUtils.lerp(1.5, 1.25, under)
    this.sun.intensity = THREE.MathUtils.lerp(2.4, 1.2, under)
  }

  /**
   * The camera never turns while the player is walking; it glides after him, so arrow keys always
   * mean the same thing. When he stops beside a dinosaur it swings round to show them face to face.
   */
  private placeCamera(amount: number, deltaSeconds = 0): void {
    if (this.player) this.cameraFocus.lerp(this.player.root.position, amount)
    const spot = this.cameraSpot.copy(this.cameraFocus).add(this.cameraOffset)
    const look = this.cameraLook.set(this.cameraFocus.x, this.cameraFocus.y + this.cameraLookHeight, this.cameraFocus.z)

    if (this.meeting && this.player) this.frameMeeting(this.meeting, this.player)
    this.meetingView += ((this.meeting ? 1 : 0) - this.meetingView) * Math.min(1, 2.6 * deltaSeconds)
    if (this.meetingView > 0.001) {
      // Slow at both ends of the move, so the camera eases away and settles gently.
      const blend = THREE.MathUtils.smootherstep(this.meetingView, 0, 1)
      spot.lerp(this.meetingSpot, blend)
      look.lerp(this.meetingLook, blend)
    }
    this.camera.position.copy(spot)
    this.camera.lookAt(look)
    this.sun.position.copy(this.cameraFocus).add(SUN_OFFSET)
    this.sun.target.position.copy(this.cameraFocus)
  }

  /** Works out where the camera should sit to see the player and the dinosaur's face together. */
  private frameMeeting(neighbour: Neighbour, player: Dino): void {
    const dino = neighbour.dino.root
    dino.updateWorldMatrix(false, false)
    const face = dino.localToWorld(this.faceInDino.clone())
    const eyes = player.root.position.clone()
    eyes.y += player.height * 0.8
    const middle = eyes.clone().lerp(face, 0.5)
    const span = eyes.distanceTo(face)

    // The line from the player to the dinosaur, seen from above, and the direction square to it.
    // It runs to the middle of the animal, not its face: a giant's head can be right over the player.
    const toDino = new THREE.Vector3(dino.position.x - eyes.x, 0, dino.position.z - eyes.z)
    if (toDino.lengthSq() < 0.01) toDino.set(0, 0, -1)
    toDino.normalize()
    const sideways = new THREE.Vector3(toDino.z, 0, -toDino.x)
    // Stay on whichever side the camera is already on, so it swings round the short way.
    if (this.meetingSide === 0) {
      this.meetingSide = sideways.dot(this.camera.position.clone().sub(middle)) >= 0 ? 1 : -1
    }

    // Off to one side and a little behind the player: the dinosaur's face is toward the camera,
    // and the player is seen over his shoulder. Further back the further apart the two heads are,
    // and further still for a head high overhead, which has to fit between the name card at the
    // top of the screen and the lesson at the bottom.
    const distance = Math.max(5.5, span * 1.5 + 2.5, Math.abs(face.y - eyes.y) * 2.4 + 2)
    this.meetingSpot
      .copy(middle)
      .addScaledVector(sideways, this.meetingSide * distance * 0.88)
      .addScaledVector(toDino, -distance * 0.42)
    this.meetingSpot.y = middle.y + 0.8 + span * 0.12
    // Aiming a little low puts the pair in the upper part of the screen, clear of the lesson below.
    this.meetingLook.copy(middle)
    this.meetingLook.y -= distance * 0.06
  }
}

declare global {
  interface Window {
    dinogarten?: {
      world: World
      walkTo(x: number, z: number): void
      state(): { loaded: boolean; walking: boolean; x: number; z: number; meeting: string | null }
    }
  }
}
