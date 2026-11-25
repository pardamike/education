import * as THREE from 'three'
import { makeEye, type Creature, type DinoLook } from './Dino'
import { skinMaterial } from './parts'

// The Mosasaurus has no 3D model file. Nothing free matched the rest of the cast, and a swimming
// body is a simple shape, so it is built here from a profile curve and bent by a chain of bones.

/** The body's outline from tail tip (0) to snout tip (1): [how far along, how thick], both as fractions of its length. */
const PROFILE: Array<[number, number]> = [
  [0, 0.004],
  [0.08, 0.02],
  [0.25, 0.042],
  [0.42, 0.074],
  [0.55, 0.09],
  [0.68, 0.094],
  [0.78, 0.082],
  [0.85, 0.064],
  [0.9, 0.058],
  [0.94, 0.047],
  [0.975, 0.032],
  [0.995, 0.016],
  [1, 0.004]
]

/** How many bendable segments the spine has. */
const SEGMENTS = 8

export class Mosasaur implements Creature {
  readonly root = new THREE.Group()
  readonly radius: number

  private readonly bones: THREE.Bone[] = []
  private readonly flippers: Array<{ flipper: THREE.Object3D; restZ: number; side: number }> = []
  private readonly body = new THREE.Group()
  private time = Math.random() * 10

  constructor(look: DinoLook) {
    const length = look.length ?? look.height * 5
    this.radius = length / 2
    const back = new THREE.Color(look.colors?.['Back'] ?? '#3d6fa3')
    const belly = new THREE.Color(look.colors?.['Belly'] ?? '#dfeef5')
    const snoutZ = length * 0.45
    const segment = length / SEGMENTS

    // The body: the profile spun into a tube, laid along z with the snout at +z, and narrowed a little.
    const geometry = new THREE.LatheGeometry(
      PROFILE.map(([along, thick]) => new THREE.Vector2(thick * length, along * length)),
      20
    )
    geometry.rotateX(Math.PI / 2)
    geometry.translate(0, 0, snoutZ - length)
    geometry.scale(0.84, 1, 1)

    const position = geometry.getAttribute('position')
    const colors = new Float32Array(position.count * 3)
    const skinIndex = new Uint16Array(position.count * 4)
    const skinWeight = new Float32Array(position.count * 4)
    const color = new THREE.Color()
    for (let i = 0; i < position.count; i++) {
      // Dark on top, pale underneath, like most sea animals.
      const upness = THREE.MathUtils.smoothstep(position.getY(i) / (0.09 * length), -0.45, 0.2)
      color.copy(belly).lerp(back, upness).toArray(colors, i * 3)
      // Each point follows the two spine bones it sits between.
      const along = THREE.MathUtils.clamp((snoutZ - position.getZ(i)) / segment, 0, SEGMENTS)
      const bone = Math.min(SEGMENTS - 1, Math.floor(along))
      skinIndex.set([bone, bone + 1, 0, 0], i * 4)
      skinWeight.set([1 - (along - bone), along - bone, 0, 0], i * 4)
    }
    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3))
    geometry.setAttribute('skinIndex', new THREE.BufferAttribute(skinIndex, 4))
    geometry.setAttribute('skinWeight', new THREE.BufferAttribute(skinWeight, 4))
    geometry.computeVertexNormals()

    const skin = new THREE.SkinnedMesh(
      geometry,
      new THREE.MeshLambertMaterial({ vertexColors: true, emissive: back, emissiveIntensity: 0.18 })
    )
    skin.castShadow = true
    skin.frustumCulled = false

    // The spine: a chain of bones from the snout back to the tail tip.
    for (let i = 0; i <= SEGMENTS; i++) {
      const bone = new THREE.Bone()
      bone.position.z = i === 0 ? snoutZ : -segment
      if (i > 0) this.bones[i - 1]!.add(bone)
      this.bones.push(bone)
    }
    skin.add(this.bones[0]!)
    skin.bind(new THREE.Skeleton(this.bones))
    this.body.add(skin)
    this.root.add(this.body)
    this.root.updateMatrixWorld(true)

    /** Pins a part to a spine bone where it currently sits, so it moves with that stretch of the body. */
    const pin = (object: THREE.Object3D, bone: number): void => {
      this.body.add(object)
      object.updateMatrixWorld(true)
      this.bones[bone]!.attach(object)
    }

    // Four flippers: a big pair behind the head, a smaller pair further back.
    const flipperGeometry = new THREE.SphereGeometry(1, 14, 8)
    const flipperMaterial = skinMaterial(back)
    for (const [bone, z, size] of [
      [2, length * 0.2, 1],
      [5, -length * 0.14, 0.72]
    ] as const) {
      for (const side of [-1, 1]) {
        const flipper = new THREE.Mesh(flipperGeometry, flipperMaterial)
        flipper.scale.set(0.15 * length * size, 0.012 * length, 0.05 * length * size)
        flipper.position.set(side * 0.13 * length * size, -0.04 * length, z)
        // Swept back and tipped down.
        flipper.rotation.set(0, side * 0.55, -side * 0.4)
        flipper.castShadow = true
        pin(flipper, bone)
        this.flippers.push({ flipper, restZ: flipper.rotation.z, side })
      }
    }

    // A tall fin at the end of the tail.
    const fluke = new THREE.Mesh(flipperGeometry, flipperMaterial)
    fluke.scale.set(0.008 * length, 0.085 * length, 0.07 * length)
    fluke.position.set(0, 0.01 * length, snoutZ - length + 0.05 * length)
    fluke.castShadow = true
    pin(fluke, SEGMENTS)

    for (const side of [-1, 1]) {
      const eye = makeEye(0.021 * length, 0.6)
      eye.position.set(side * 0.036 * length, 0.03 * length, snoutZ - 0.12 * length)
      eye.lookAt(eye.position.clone().add(new THREE.Vector3(side, 0.15, 1.2)))
      pin(eye, 0)
    }
  }

  update(deltaSeconds: number): void {
    this.time += deltaSeconds
    // A wave runs down the body from behind the flippers to the tail, bigger the further back it gets.
    for (let i = 3; i <= SEGMENTS; i++) {
      const reach = (i - 2) / (SEGMENTS - 2)
      this.bones[i]!.rotation.y = 0.17 * reach * Math.sin(this.time * 2.1 - i * 0.75)
    }
    for (const { flipper, restZ, side } of this.flippers) {
      flipper.rotation.z = restZ + side * 0.16 * Math.sin(this.time * 1.7)
    }
    // Bobs gently where it floats.
    this.body.position.y = Math.sin(this.time * 1.2) * 0.07
    // Head tipped up a little, so its eyes stay above the water.
    this.body.rotation.x = -0.09 + Math.sin(this.time * 1.2 + 1) * 0.02
  }
}
