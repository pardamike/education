import * as THREE from 'three'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import { addParts, skinMaterial, type PartSpec } from './parts'
import { lengthenPieces, slim, type SlimSpec } from './reshape'
import { roundOff, smoothShading } from './rounding'

/** Cartoon eyes. Placement is measured from the base of the head, as fractions of the dinosaur's height. */
export interface EyeLook {
  forward: number
  up: number
  apart: number
  size: number
  /** Upper eyelids: how much of each eye they cover, from 0 (none) to 1 (shut). Leave out for wide-open eyes. */
  lid?: number
  /** Tilts the eyelids down toward the nose, in degrees. Around 25 looks grumpy. */
  frown?: number
  /** Eyelid colour; normally the same as the skin around the eyes. */
  lidColor?: string
  /** Adds a brow ridge along the edge of each eyelid, in this colour. Needs `lid`. A dark brow looks angry. */
  brow?: string
  /** Pupil size compared with the eye. The default 0.6 is wide-eyed; 0.45 is a hard stare. */
  pupil?: number
}

/** One number scales a bone evenly. Three numbers stretch it along its own axes; the middle one runs along the bone. */
type BoneScale = number | [number, number, number]

/** How a model is dressed up for the game. Lives in each dinosaur's JSON file. */
export interface DinoLook {
  /** Standing height in world units. */
  height: number
  /** Model colour slot name -> CSS colour, or "hidden" to leave that part out. Unlisted slots keep the model's colour. */
  colors?: Record<string, string>
  /** Bone name -> scale. A bigger "Head" and shorter "Tail1" give a youngster's proportions. */
  boneScales?: Record<string, BoneScale>
  /** Colour slot name -> how many times longer to make each separate piece in it: teeth, claws, spikes. */
  lengthen?: Record<string, number>
  /** Slims the body down around the listed bones. */
  slim?: SlimSpec
  eyes?: EyeLook
  /** Extra body parts built in code, such as a sail. */
  parts?: PartSpec[]
}

export type DinoAnimation = 'idle' | 'walk' | 'run' | 'jump' | 'attack' | 'death'

const loader = new GLTFLoader()

const eyeWhite = new THREE.MeshLambertMaterial({ color: '#ffffff', emissive: '#555555' })
const eyePupil = new THREE.MeshLambertMaterial({ color: '#1d1d1d' })
const eyeShine = new THREE.MeshBasicMaterial({ color: '#ffffff' })
const eyeSphere = new THREE.SphereGeometry(1, 16, 12)

function makeEye(radius: number, pupilSize: number): THREE.Group {
  const eye = new THREE.Group()
  const white = new THREE.Mesh(eyeSphere, eyeWhite)
  white.scale.setScalar(radius)
  const pupil = new THREE.Mesh(eyeSphere, eyePupil)
  pupil.scale.setScalar(radius * pupilSize)
  // Sits just proud of the white, whatever its size.
  pupil.position.z = radius * (1.15 - pupilSize)
  const shine = new THREE.Mesh(eyeSphere, eyeShine)
  shine.scale.setScalar(radius * 0.18)
  shine.position.set(radius * 0.2, radius * 0.28, radius * 1.05)
  eye.add(white, pupil, shine)
  return eye
}

/** How many times each model's triangles are split and relaxed on load. More is rounder (and blunter). */
const ROUNDING_PASSES = 1

export class Dino {
  /** Move and turn this. The model inside is already scaled and standing on y = 0, facing +Z. */
  readonly root = new THREE.Group()
  /** Half the dinosaur's length, nose to tail, in world units. */
  readonly radius: number

  private readonly mixer: THREE.AnimationMixer
  private readonly actions = new Map<string, THREE.AnimationAction>()
  private current: THREE.AnimationAction | null = null
  private readonly scaledBones: Array<[THREE.Object3D, THREE.Vector3]> = []

  static async load(url: string, look: DinoLook): Promise<Dino> {
    const gltf = await loader.loadAsync(url)
    return new Dino(gltf.scene, gltf.animations, look)
  }

  private constructor(model: THREE.Object3D, clips: THREE.AnimationClip[], look: DinoLook) {
    const meshes: THREE.Mesh[] = []
    model.traverse((node) => {
      if (!(node instanceof THREE.Mesh)) return
      const original = node.material as THREE.MeshStandardMaterial
      const override = look.colors?.[original.name]
      if (override === 'hidden') {
        node.visible = false
        return
      }
      node.material = skinMaterial(override ?? original.color, original.name)
      node.castShadow = true
      // The skeleton moves the mesh well outside its resting bounds, so never cull it.
      node.frustumCulled = false
      meshes.push(node)
    })
    model.updateMatrixWorld(true)
    lengthenPieces(meshes, look.lengthen ?? {})
    roundOff(meshes, ROUNDING_PASSES)
    smoothShading(meshes)
    if (look.slim) {
      slim(meshes, look.slim)
      smoothShading(meshes)
    }

    // Scale to the requested height and stand the model on the ground, centred.
    const box = new THREE.Box3().setFromObject(model)
    const scale = look.height / (box.max.y - box.min.y)
    const centre = box.getCenter(new THREE.Vector3())
    this.radius = (Math.max(box.max.x - box.min.x, box.max.z - box.min.z) * scale) / 2
    model.scale.multiplyScalar(scale)
    model.position.set(-centre.x * scale, -box.min.y * scale, -centre.z * scale)
    this.root.add(model)
    this.root.updateMatrixWorld(true)

    for (const [boneName, boneScale] of Object.entries(look.boneScales ?? {})) {
      const bone = model.getObjectByName(boneName)
      if (!bone) continue
      const amount = typeof boneScale === 'number' ? new THREE.Vector3().setScalar(boneScale) : new THREE.Vector3(...boneScale)
      this.scaledBones.push([bone, amount])
    }

    // Eyes and extra parts go on while the skeleton is still in its resting pose, before any bone is rescaled.
    const head = model.getObjectByName('Head')
    const headEnd = model.getObjectByName('Head_end')
    if (look.eyes && head && headEnd) {
      this.addEyes(head, headEnd, look.eyes, look.height)
    }
    addParts(this.root, meshes, look.parts ?? [], look.height)

    this.mixer = new THREE.AnimationMixer(model)
    for (const clip of clips) {
      // Clips are named like "Armature|TRex_Walk"; the last word is the animation.
      const name = clip.name.split('_').pop()!.toLowerCase()
      this.actions.set(name, this.mixer.clipAction(clip))
    }
    this.play('idle', 0)
  }

  /** Places two cartoon eyes on the head while it is in its resting pose, then pins them to the head bone. */
  private addEyes(head: THREE.Object3D, headEnd: THREE.Object3D, eyes: EyeLook, length: number): void {
    const base = head.getWorldPosition(new THREE.Vector3())
    const tip = headEnd.getWorldPosition(new THREE.Vector3())
    const forward = tip.clone().sub(base).normalize()
    const up = new THREE.Vector3(0, 1, 0)
    const side = new THREE.Vector3().crossVectors(forward, up).normalize()

    // The eyes hang off a holder, not the head bone itself. If the head is stretched into a long
    // snout, the holder is squashed by the same amounts, so the eyes stay round.
    const holder = new THREE.Group()
    head.add(holder)
    holder.updateMatrixWorld(true)

    for (const sign of [-1, 1]) {
      const radius = eyes.size * length
      const eye = makeEye(radius, eyes.pupil ?? 0.6)
      eye.position
        .copy(base)
        .addScaledVector(forward, eyes.forward * length)
        .addScaledVector(up, eyes.up * length)
        .addScaledVector(side, sign * eyes.apart * length)
      // Eyes sit on the sides of the head, looking mostly ahead so the face reads from the front.
      const gaze = side.clone().multiplyScalar(sign).addScaledVector(forward, 1.3)
      eye.lookAt(eye.position.clone().add(gaze))
      this.root.add(eye)
      eye.updateMatrixWorld(true)

      if (eyes.lid) {
        const lid = new THREE.Mesh(
          new THREE.SphereGeometry(radius * 1.08, 16, 8, 0, Math.PI * 2, 0, Math.PI * eyes.lid),
          skinMaterial(eyes.lidColor ?? '#777777')
        )
        // Droop the lid forward over the pupil, and tip it down toward the nose for a frown.
        const noseSide = Math.sign(eye.worldToLocal(eye.getWorldPosition(new THREE.Vector3()).add(forward)).x)
        lid.rotation.set(0.35, 0, -noseSide * THREE.MathUtils.degToRad(eyes.frown ?? 0))
        eye.add(lid)
        if (eyes.brow) {
          // A thick bar along the front edge of the lid.
          const edge = Math.PI * eyes.lid
          const brow = new THREE.Mesh(eyeSphere, skinMaterial(eyes.brow))
          brow.scale.set(radius * 1.3, radius * 0.26, radius * 0.5)
          brow.position.set(0, radius * 1.08 * Math.cos(edge) + radius * 0.12, radius * 1.08 * Math.sin(edge) * 0.92)
          lid.add(brow)
        }
      }
      holder.attach(eye)
    }

    const headScale = this.scaledBones.find(([bone]) => bone === head)?.[1]
    if (headScale) {
      const even = Math.cbrt(headScale.x * headScale.y * headScale.z)
      holder.scale.set(even / headScale.x, even / headScale.y, even / headScale.z)
    }
  }

  /** `rate` speeds the animation up or slows it down; 1 is the speed it was made at. */
  play(name: DinoAnimation, fadeSeconds = 0.25, rate = 1): void {
    const next = this.actions.get(name)
    if (!next || next === this.current) return
    next.reset().setEffectiveTimeScale(rate).fadeIn(fadeSeconds).play()
    this.current?.fadeOut(fadeSeconds)
    this.current = next
  }

  update(deltaSeconds: number): void {
    this.mixer.update(deltaSeconds)
    // Applied after the animation so a clip that animates the same bone cannot undo it.
    for (const [bone, scale] of this.scaledBones) bone.scale.copy(scale)
  }
}
