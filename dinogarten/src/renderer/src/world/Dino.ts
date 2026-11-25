import * as THREE from 'three'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'

/** Cartoon eye placement, measured from the base of the head. Every value is a fraction of the dinosaur's height. */
export interface EyeLook {
  forward: number
  up: number
  apart: number
  size: number
}

/** How a model is dressed up for the game. Lives in each dinosaur's JSON file. */
export interface DinoLook {
  /** Standing height in world units. */
  height: number
  /** Model colour slot name -> CSS colour, or "hidden" to leave that part out. Unlisted slots keep the model's colour. */
  colors?: Record<string, string>
  /** Bone name -> scale. A bigger "Head" and shorter "Tail1" give a youngster's proportions. */
  boneScales?: Record<string, number>
  eyes?: EyeLook
}

export type DinoAnimation = 'idle' | 'walk' | 'run' | 'jump' | 'attack' | 'death'

const loader = new GLTFLoader()

const eyeWhite = new THREE.MeshLambertMaterial({ color: '#ffffff', emissive: '#555555' })
const eyePupil = new THREE.MeshLambertMaterial({ color: '#1d1d1d' })
const eyeShine = new THREE.MeshBasicMaterial({ color: '#ffffff' })
const eyeSphere = new THREE.SphereGeometry(1, 16, 12)

function makeEye(radius: number): THREE.Group {
  const eye = new THREE.Group()
  const white = new THREE.Mesh(eyeSphere, eyeWhite)
  white.scale.setScalar(radius)
  const pupil = new THREE.Mesh(eyeSphere, eyePupil)
  pupil.scale.setScalar(radius * 0.6)
  pupil.position.z = radius * 0.55
  const shine = new THREE.Mesh(eyeSphere, eyeShine)
  shine.scale.setScalar(radius * 0.18)
  shine.position.set(radius * 0.2, radius * 0.28, radius * 1.05)
  eye.add(white, pupil, shine)
  return eye
}

/** Faces meeting at a sharper angle than this keep a hard edge: claws, horn tips, the rim of a frill. */
const CREASE_DEGREES = 80

/**
 * The models are built from flat facets. This re-lights them as smooth, rounded surfaces by
 * giving every corner the average direction of the faces around it, across all colour slots.
 */
function smoothShading(meshes: THREE.Mesh[]): void {
  const minimumDot = Math.cos(THREE.MathUtils.degToRad(CREASE_DEGREES))
  const facesAtPoint = new Map<string, THREE.Vector3[]>()
  const key = (point: THREE.Vector3): string =>
    `${Math.round(point.x * 1e5)},${Math.round(point.y * 1e5)},${Math.round(point.z * 1e5)}`
  const a = new THREE.Vector3()
  const b = new THREE.Vector3()
  const c = new THREE.Vector3()

  const prepared = meshes.map((mesh) => {
    if (mesh.geometry.index) mesh.geometry = mesh.geometry.toNonIndexed()
    const positions = mesh.geometry.getAttribute('position')
    const faceNormals: THREE.Vector3[] = []
    for (let i = 0; i < positions.count; i += 3) {
      a.fromBufferAttribute(positions, i)
      b.fromBufferAttribute(positions, i + 1)
      c.fromBufferAttribute(positions, i + 2)
      // Left un-normalised on purpose: its length is the face's area, so big faces count for more.
      const faceNormal = new THREE.Vector3().crossVectors(b.clone().sub(a), c.clone().sub(a))
      faceNormals.push(faceNormal)
      for (const corner of [a, b, c]) {
        const cornerKey = key(corner)
        const faces = facesAtPoint.get(cornerKey)
        if (faces) faces.push(faceNormal)
        else facesAtPoint.set(cornerKey, [faceNormal])
      }
    }
    return { geometry: mesh.geometry, positions, faceNormals }
  })

  const own = new THREE.Vector3()
  const other = new THREE.Vector3()
  const sum = new THREE.Vector3()
  for (const { geometry, positions, faceNormals } of prepared) {
    const normals = new Float32Array(positions.count * 3)
    for (let i = 0; i < positions.count; i++) {
      own.copy(faceNormals[Math.floor(i / 3)]!).normalize()
      sum.set(0, 0, 0)
      a.fromBufferAttribute(positions, i)
      for (const faceNormal of facesAtPoint.get(key(a))!) {
        if (other.copy(faceNormal).normalize().dot(own) >= minimumDot) sum.add(faceNormal)
      }
      sum.normalize().toArray(normals, i * 3)
    }
    geometry.setAttribute('normal', new THREE.BufferAttribute(normals, 3))
  }
}

export class Dino {
  /** Move and turn this. The model inside is already scaled and standing on y = 0, facing +Z. */
  readonly root = new THREE.Group()
  /** Half the dinosaur's length, nose to tail, in world units. */
  readonly radius: number

  private readonly mixer: THREE.AnimationMixer
  private readonly actions = new Map<string, THREE.AnimationAction>()
  private current: THREE.AnimationAction | null = null
  private readonly scaledBones: Array<[THREE.Object3D, number]> = []

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
      node.material = new THREE.MeshLambertMaterial({
        name: original.name,
        color: override ?? original.color
      })
      node.castShadow = true
      // The skeleton moves the mesh well outside its resting bounds, so never cull it.
      node.frustumCulled = false
      meshes.push(node)
    })
    smoothShading(meshes)

    // Scale to the requested height and stand the model on the ground, centred.
    model.updateMatrixWorld(true)
    const box = new THREE.Box3().setFromObject(model)
    const scale = look.height / (box.max.y - box.min.y)
    const centre = box.getCenter(new THREE.Vector3())
    this.radius = (Math.max(box.max.x - box.min.x, box.max.z - box.min.z) * scale) / 2
    model.scale.multiplyScalar(scale)
    model.position.set(-centre.x * scale, -box.min.y * scale, -centre.z * scale)
    this.root.add(model)
    this.root.updateMatrixWorld(true)

    // Eyes go on while the skeleton is still in its resting pose, before any bone is rescaled.
    const head = model.getObjectByName('Head')
    const headEnd = model.getObjectByName('Head_end')
    if (look.eyes && head && headEnd) {
      this.addEyes(head, headEnd, look.eyes, look.height)
    }
    for (const [boneName, boneScale] of Object.entries(look.boneScales ?? {})) {
      const bone = model.getObjectByName(boneName)
      if (bone) this.scaledBones.push([bone, boneScale])
    }

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

    for (const sign of [-1, 1]) {
      const eye = makeEye(eyes.size * length)
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
      head.attach(eye)
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
    for (const [bone, scale] of this.scaledBones) bone.scale.setScalar(scale)
  }
}
