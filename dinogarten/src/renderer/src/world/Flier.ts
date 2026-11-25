import * as THREE from 'three'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import { groundHeight, waterLevel } from './coast'
import { makeEye, type Creature, type DinoLook } from './Dino'
import { roundOff, smoothShading } from './rounding'

// A flying reptile. It circles a patch of sky on its own, flapping and gliding, and swoops down
// to circle the player when he walks underneath. All the fliers share one pterosaur model, which
// comes with a single colour, so its beak, crest, wings and body are painted here.

/** Where a flier patrols: an oval around a point, at a height above the ground. */
export interface FlySpec {
  /** The middle of the oval: [x, z]. */
  around: [number, number]
  /** How far the oval reaches east-west and north-south from its middle. */
  width: number
  length: number
  /** How high above the ground it cruises. */
  height: number
}

const loader = new GLTFLoader()

const CRUISE_SPEED = 6.5
const VISIT_SPEED = 4.6
/** When it comes down to see the player, it circles at least this far out and this far above his feet. Bigger fliers keep further off. */
const VISIT_RADIUS = 4.5
const VISIT_HEIGHT = 2.2

/** Bones whose names start like this carry the wings and the head. Everything else is the body. */
const WING_BONES = ['arm_', 'hand', 'finger']
const HEAD_BONES = ['head', 'jaw', 'tongue']

export class Flier implements Creature {
  readonly root = new THREE.Group()
  readonly radius: number
  readonly height: number

  private readonly mixer: THREE.AnimationMixer
  private readonly flap: THREE.AnimationAction | null
  private readonly glide: THREE.AnimationAction | null
  private readonly scaledBones: Array<[THREE.Object3D, THREE.Vector3]> = []
  private time = Math.random() * 20
  private heading = 0
  private speed = CRUISE_SPEED
  private turning = 0
  /** 1 while flapping, 0 while gliding, and in between while changing from one to the other. */
  private flapping = 1
  private flapUntil = 0

  static async load(url: string, look: DinoLook, flies: FlySpec): Promise<Flier> {
    const gltf = await loader.loadAsync(url)
    return new Flier(gltf.scene, gltf.animations, look, flies)
  }

  private constructor(
    model: THREE.Object3D,
    clips: THREE.AnimationClip[],
    look: DinoLook,
    private readonly flies: FlySpec
  ) {
    this.height = look.height
    const meshes: THREE.SkinnedMesh[] = []
    model.traverse((node) => {
      if (node instanceof THREE.SkinnedMesh) meshes.push(node)
    })
    model.updateMatrixWorld(true)
    roundOff(meshes, 1)
    smoothShading(meshes)

    const body = new THREE.Color(look.colors?.['Body'] ?? '#e8743b')
    const paints = {
      body,
      wings: new THREE.Color(look.colors?.['Wings'] ?? '#f6c28b'),
      crest: new THREE.Color(look.colors?.['Crest'] ?? '#d93f3f'),
      beak: new THREE.Color(look.colors?.['Beak'] ?? '#ffd45c')
    }
    const box = new THREE.Box3()
    for (const mesh of meshes) box.expandByObject(mesh)
    const modelLength = box.max.z - box.min.z
    const headAt = model.getObjectByName('head')?.getWorldPosition(new THREE.Vector3()) ?? box.getCenter(new THREE.Vector3())
    for (const mesh of meshes) {
      this.paint(mesh, paints, headAt, modelLength)
      // Wings are a single sheet, so both sides must show. A little glow keeps the underside from going dark.
      mesh.material = new THREE.MeshLambertMaterial({
        vertexColors: true,
        emissive: body,
        emissiveIntensity: 0.2,
        side: THREE.DoubleSide
      })
      mesh.castShadow = true
      mesh.frustumCulled = false
    }

    // Scale to the requested height, with the middle of the body where the animal's position is.
    const scale = look.height / (box.max.y - box.min.y)
    const centre = box.getCenter(new THREE.Vector3())
    this.radius = ((box.max.x - box.min.x) * scale) / 2
    model.scale.multiplyScalar(scale)
    model.position.set(-centre.x * scale, -centre.y * scale, -centre.z * scale)
    this.root.add(model)
    this.root.updateMatrixWorld(true)

    for (const [boneName, boneScale] of Object.entries(look.boneScales ?? {})) {
      const bone = model.getObjectByName(boneName)
      if (!bone) continue
      const amount = typeof boneScale === 'number' ? new THREE.Vector3().setScalar(boneScale) : new THREE.Vector3(...boneScale)
      this.scaledBones.push([bone, amount])
    }

    const head = model.getObjectByName('head')
    if (look.eyes && head) {
      const base = head.getWorldPosition(new THREE.Vector3())
      for (const side of [-1, 1]) {
        const eye = makeEye(look.eyes.size * look.height, look.eyes.pupil ?? 0.6)
        eye.position.set(
          base.x + side * look.eyes.apart * look.height,
          base.y + look.eyes.up * look.height,
          base.z + look.eyes.forward * look.height
        )
        eye.lookAt(eye.position.x + side, eye.position.y, eye.position.z + 1.1)
        this.root.add(eye)
        eye.updateMatrixWorld(true)
        head.attach(eye)
      }
    }

    this.mixer = new THREE.AnimationMixer(model)
    const action = (name: string): THREE.AnimationAction | null => {
      const clip = clips.find((candidate) => candidate.name === name)
      return clip ? this.mixer.clipAction(clip).play() : null
    }
    this.flap = action('fly_flap')
    this.glide = action('fly_glide')

    const [startX, startZ] = flies.around
    this.root.position.set(startX + flies.width, flies.height, startZ)
    this.root.rotation.order = 'YXZ'
  }

  /** Colours every point of the surface by the part of the body it belongs to. */
  private paint(
    mesh: THREE.SkinnedMesh,
    paints: { body: THREE.Color; wings: THREE.Color; crest: THREE.Color; beak: THREE.Color },
    headAt: THREE.Vector3,
    modelLength: number
  ): void {
    const position = mesh.geometry.getAttribute('position')
    const skinIndex = mesh.geometry.getAttribute('skinIndex')
    const skinWeight = mesh.geometry.getAttribute('skinWeight')
    const colors = new Float32Array(position.count * 3)
    const point = new THREE.Vector3()
    for (let i = 0; i < position.count; i++) {
      // The bone that moves this point the most says which part it is.
      let strongest = 0
      for (let slot = 1; slot < 4; slot++) {
        if (skinWeight.getComponent(i, slot) > skinWeight.getComponent(i, strongest)) strongest = slot
      }
      const bone = mesh.skeleton.bones[skinIndex.getComponent(i, strongest)]?.name ?? ''
      let color = paints.body
      if (WING_BONES.some((start) => bone.startsWith(start))) {
        color = paints.wings
      } else if (HEAD_BONES.some((start) => bone.startsWith(start))) {
        // The head is one piece: crest behind the skull, beak in front of it, skull between.
        const along = (point.fromBufferAttribute(position, i).applyMatrix4(mesh.matrixWorld).z - headAt.z) / modelLength
        if (along < -0.015) color = paints.crest
        else if (along > 0.17) color = paints.beak
      }
      color.toArray(colors, i * 3)
    }
    mesh.geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3))
  }

  update(deltaSeconds: number, playerPosition?: THREE.Vector3 | null): void {
    this.time += deltaSeconds
    const position = this.root.position
    const [centreX, centreZ] = this.flies.around
    const { width, length } = this.flies

    // Where it wants to be: on its patrol oval, or circling low over the player if he is underneath.
    const lap = (this.time * CRUISE_SPEED) / ((width + length) / 2)
    const floorUnder = Math.max(groundHeight(position.x, position.z), waterLevel(0))
    const target = new THREE.Vector3(
      centreX + Math.cos(lap) * width,
      floorUnder + this.flies.height + Math.sin(this.time * 0.31) * 1.2,
      centreZ + Math.sin(lap) * length
    )
    let wantedSpeed = CRUISE_SPEED
    let visiting = false
    // It visits him on land or wading, with his head out of the water, not once he has gone under.
    if (playerPosition && playerPosition.y > -3.3) {
      const across = (playerPosition.x - centreX) / (width + 4)
      const along = (playerPosition.z - centreZ) / (length + 4)
      if (across * across + along * along < 1) {
        visiting = true
        // It circles a spot a little beyond him, so it stays where the camera, which looks north, can see it.
        // A big flier needs a wide circle, or it would have to bank its wings upright to get round.
        const orbit = VISIT_RADIUS + this.radius * 1.5
        const overZ = playerPosition.z - orbit * 0.75
        // Aim a little way further round the circle than where it is now, so it keeps going round.
        const angle = Math.atan2(position.x - playerPosition.x, position.z - overZ) + 0.8
        target.set(
          playerPosition.x + Math.sin(angle) * orbit,
          Math.max(playerPosition.y, waterLevel(0)) + VISIT_HEIGHT + this.height * 0.5,
          overZ + Math.cos(angle) * orbit
        )
        wantedSpeed = VISIT_SPEED
      }
    }

    // Turn toward the target, but only so fast, so it sweeps round in curves.
    const wantedHeading = Math.atan2(target.x - position.x, target.z - position.z)
    const difference = Math.atan2(Math.sin(wantedHeading - this.heading), Math.cos(wantedHeading - this.heading))
    const turnRate = visiting ? 2.2 : 1.3
    const turn = THREE.MathUtils.clamp(difference, -turnRate * deltaSeconds, turnRate * deltaSeconds)
    this.heading += turn
    this.turning += (turn / Math.max(deltaSeconds, 0.001) - this.turning) * Math.min(1, 3 * deltaSeconds)
    this.speed += (wantedSpeed - this.speed) * Math.min(1, 1.2 * deltaSeconds)
    position.x += Math.sin(this.heading) * this.speed * deltaSeconds
    position.z += Math.cos(this.heading) * this.speed * deltaSeconds
    const climb = THREE.MathUtils.clamp(target.y - position.y, -3.5, 3.5) * Math.min(1, 0.9 * deltaSeconds)
    position.y = Math.max(position.y + climb, floorUnder + this.height + 1)
    const climbRate = climb / Math.max(deltaSeconds, 0.001)

    // Nose follows the climb, and it banks into its turns.
    this.root.rotation.set(
      THREE.MathUtils.clamp(-climbRate / 7, -0.5, 0.5),
      this.heading,
      THREE.MathUtils.clamp(-this.turning * 0.45, -0.75, 0.75)
    )

    // A few seconds of flapping, then a few of gliding. Climbing always takes flapping.
    if (this.time > this.flapUntil + 3.2) this.flapUntil = this.time + 2.6 + Math.random() * 2
    const wantsToFlap = this.time < this.flapUntil || climbRate > 0.6 ? 1 : 0
    this.flapping += (wantsToFlap - this.flapping) * Math.min(1, 2.5 * deltaSeconds)
    this.flap?.setEffectiveWeight(this.flapping)
    this.glide?.setEffectiveWeight(1 - this.flapping)
    this.mixer.update(deltaSeconds)
    for (const [bone, scale] of this.scaledBones) bone.scale.copy(scale)
  }
}
