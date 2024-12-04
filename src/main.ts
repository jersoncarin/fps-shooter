import './style.css'
import * as CANNON from 'cannon-es'
import * as THREE from 'three'
import { PointerLockControlsCannon } from './pointer-lock'
import { Sky } from 'three/addons/objects/Sky.js'
import { GUI } from 'lil-gui'

let camera: THREE.PerspectiveCamera
let scene: THREE.Scene
let renderer: THREE.WebGLRenderer

// Cannon.js variables
let world: CANNON.World
let controls: PointerLockControlsCannon
const timeStep = 1 / 60
let lastCallTime = performance.now()
let sphereShape: CANNON.Sphere
let sphereBody: CANNON.Body
let physicsMaterial: CANNON.Material
const balls: CANNON.Body[] = []
const ballMeshes: THREE.Mesh[] = []
const boxes: CANNON.Body[] = []
const boxMeshes: THREE.Mesh[] = []

const instructions = document.getElementById('instructions') as HTMLElement

initThree()
initCannon()
initPointerLock()
animate()

function initThree(): void {
  // Camera
  camera = new THREE.PerspectiveCamera(
    75,
    window.innerWidth / window.innerHeight,
    0.1,
    1000
  )

  // Scene
  scene = new THREE.Scene()
  scene.fog = new THREE.Fog(0x000000, 0, 500)

  // Renderer
  renderer = new THREE.WebGLRenderer({ antialias: true })
  renderer.setSize(window.innerWidth, window.innerHeight)
  renderer.setClearColor(scene.fog.color)

  renderer.shadowMap.enabled = true
  renderer.shadowMap.type = THREE.PCFSoftShadowMap

  document.body.appendChild(renderer.domElement)

  const sky = new Sky()
  sky.scale.setScalar(450000)

  const sunPosition = new THREE.Vector3()
  sky.material.uniforms.sunPosition.value = sunPosition
  scene.add(sky)

  // Lights
  const ambientLight = new THREE.AmbientLight(0xffffff, 0.1)
  scene.add(ambientLight)

  const sunLight = new THREE.DirectionalLight(0xffffff, 1.0)
  sunLight.castShadow = true
  sunLight.shadow.camera.near = 1
  sunLight.shadow.camera.far = 500000
  sunLight.shadow.camera.left = -5000
  sunLight.shadow.camera.right = 5000
  sunLight.shadow.camera.top = 5000
  sunLight.shadow.camera.bottom = -5000
  sunLight.shadow.mapSize.width = 2048
  sunLight.shadow.mapSize.height = 2048
  scene.add(sunLight)

  // Helper (Optional)
  const sunLightHelper = new THREE.DirectionalLightHelper(
    sunLight,
    5000,
    0xff0000
  )
  scene.add(sunLightHelper)

  let phi = THREE.MathUtils.degToRad(90) // Initial elevation angle (90° = midday)
  let theta = 0
  const params = { speed: 0.05 } // Control parameter for speed

  // GUI
  const gui = new GUI()
  gui.add(params, 'speed', 0.01, 2.0).name('Sun Speed') // Control speed with a slider

  function updateSunPosition(deltaTime: number) {
    theta += params.speed * deltaTime
    if (theta > 2 * Math.PI) theta -= 2 * Math.PI

    phi = THREE.MathUtils.degToRad(60 + 30 * Math.sin(theta))

    sunPosition.setFromSphericalCoords(1, phi, theta).multiplyScalar(450000)
    sky.material.uniforms.sunPosition.value.copy(sunPosition)
    sunLight.position.copy(sunPosition)
    sunLight.target.position.set(0, 0, 0)
  }

  let lastTime = 0

  function animate(time: number) {
    const deltaTime = (time - lastTime) / 1000
    lastTime = time

    updateSunPosition(deltaTime)
    renderer.render(scene, camera)
    requestAnimationFrame(animate)
  }

  requestAnimationFrame(animate)

  // Floor
  const textureLoader = new THREE.TextureLoader()
  const grassTexture = textureLoader.load('/assets/grass.jpg')

  // Configure texture properties
  grassTexture.wrapS = THREE.RepeatWrapping
  grassTexture.wrapT = THREE.RepeatWrapping
  grassTexture.repeat.set(20, 20)

  // Create a material with the texture
  const texturedMaterial = new THREE.MeshLambertMaterial({ map: grassTexture })

  const floorGeometry = new THREE.PlaneGeometry(300, 300, 100, 100)
  floorGeometry.rotateX(-Math.PI / 2)
  const floor = new THREE.Mesh(floorGeometry, texturedMaterial)
  floor.receiveShadow = true
  scene.add(floor)

  window.addEventListener('resize', onWindowResize)
}

function onWindowResize(): void {
  camera.aspect = window.innerWidth / window.innerHeight
  camera.updateProjectionMatrix()
  renderer.setSize(window.innerWidth, window.innerHeight)
}

function initCannon(): void {
  world = new CANNON.World()

  world.defaultContactMaterial.contactEquationStiffness = 1e9
  world.defaultContactMaterial.contactEquationRelaxation = 4

  const solver = new CANNON.GSSolver()
  solver.iterations = 7
  solver.tolerance = 0.1
  world.solver = new CANNON.SplitSolver(solver)

  world.gravity.set(0, -20, 0)

  // Create a slippery material
  physicsMaterial = new CANNON.Material('physics')
  const physicsContactMaterial = new CANNON.ContactMaterial(
    physicsMaterial,
    physicsMaterial,
    {
      friction: 0.0,
      restitution: 0.3,
    }
  )
  world.addContactMaterial(physicsContactMaterial)

  // Create the user collision sphere
  const radius = 1.3
  sphereShape = new CANNON.Sphere(radius)
  sphereBody = new CANNON.Body({ mass: 5, material: physicsMaterial })
  sphereBody.addShape(sphereShape)
  sphereBody.position.set(0, 5, 0)
  sphereBody.linearDamping = 0.9
  world.addBody(sphereBody)

  // Create the ground plane
  const groundShape = new CANNON.Plane()
  const groundBody = new CANNON.Body({ mass: 0, material: physicsMaterial })
  groundBody.addShape(groundShape)
  groundBody.quaternion.setFromEuler(-Math.PI / 2, 0, 0)
  world.addBody(groundBody)

  // Add boxes in Cannon.js and Three.js
  const halfExtents = new CANNON.Vec3(1, 1, 1)
  const boxShape = new CANNON.Box(halfExtents)

  const textureLoader = new THREE.TextureLoader()
  const boxTexture = textureLoader.load('/assets/box.jpg') // Load your texture
  const boxMaterial = new THREE.MeshStandardMaterial({ map: boxTexture })

  const boxGeometry = new THREE.BoxGeometry(
    halfExtents.x * 2,
    halfExtents.y * 2,
    halfExtents.z * 2
  )

  for (let i = 0; i < 100; i++) {
    // Create CANNON body
    const boxBody = new CANNON.Body({ mass: 5 })
    boxBody.addShape(boxShape)

    // Create THREE mesh
    const boxMesh = new THREE.Mesh(boxGeometry, boxMaterial)
    boxMesh.castShadow = true
    boxMesh.receiveShadow = true

    // Cluster boxes for piling effect
    const clusterX = (Math.random() - 0.5) * 100 // Cluster around a smaller area
    const clusterZ = (Math.random() - 0.5) * 100

    // Randomize positions within the cluster
    const x = clusterX + (Math.random() - 0.5) * 2 // Spread slightly around the cluster
    const y = Math.random() * 10 + 1 // Random height to fall and stack
    const z = clusterZ + (Math.random() - 0.5) * 2

    boxBody.position.set(x, y, z)
    boxMesh.position.copy(boxBody.position)

    // Add to physics world and scene
    world.addBody(boxBody)
    scene.add(boxMesh)

    // Store references for updates
    boxes.push(boxBody)
    boxMeshes.push(boxMesh)
  }

  // Add linked boxes
  const size = 0.5
  const mass = 0.3
  const space = 0.1 * size
  const N = 10
  const halfExtents2 = new CANNON.Vec3(size, size, size * 0.1)
  const boxShape2 = new CANNON.Box(halfExtents2)
  const boxGeometry2 = new THREE.BoxGeometry(
    halfExtents2.x * 2,
    halfExtents2.y * 2,
    halfExtents2.z * 2
  )

  let last: CANNON.Body = new CANNON.Body({ mass: 0 })

  for (let i = 0; i < N; i++) {
    // Make the fist one static to support the others
    const boxBody = new CANNON.Body({ mass: i === 0 ? 0 : mass })
    boxBody.addShape(boxShape2)

    const boxMesh = new THREE.Mesh(boxGeometry2, boxMaterial)
    boxMesh.castShadow = true

    boxBody.position.set(
      5,
      (N - i) * (size * 2 + 2 * space) + size * 2 + space,
      0
    )
    boxBody.linearDamping = 0.01
    boxBody.angularDamping = 0.01

    boxMesh.castShadow = true
    boxMesh.receiveShadow = true

    world.addBody(boxBody)
    scene.add(boxMesh)
    boxes.push(boxBody)
    boxMeshes.push(boxMesh)

    if (i > 0) {
      // Connect the body to the last one
      const constraint1 = new CANNON.PointToPointConstraint(
        boxBody,
        new CANNON.Vec3(-size, size + space, 0),
        last,
        new CANNON.Vec3(-size, -size - space, 0)
      )
      const constranit2 = new CANNON.PointToPointConstraint(
        boxBody,
        new CANNON.Vec3(size, size + space, 0),
        last,
        new CANNON.Vec3(size, -size - space, 0)
      )
      world.addConstraint(constraint1)
      world.addConstraint(constranit2)
    }

    last = boxBody
  }

  // The shooting balls
  const shootVelocity = 15
  const ballShape = new CANNON.Sphere(0.2)
  const ballGeometry = new THREE.SphereGeometry(ballShape.radius, 32, 32)

  // Returns a vector pointing the the diretion the camera is at
  function getShootDirection() {
    const vector = new THREE.Vector3(0, 0, 1)
    vector.unproject(camera)
    const ray = new THREE.Ray(
      sphereBody.position as any,
      vector.sub(sphereBody.position).normalize()
    )
    return ray.direction
  }

  window.addEventListener('click', () => {
    if (!controls.enabled) {
      return
    }

    const ballBody = new CANNON.Body({ mass: 1 })
    ballBody.addShape(ballShape)

    const textureLoader = new THREE.TextureLoader()
    const ballTexture = textureLoader.load('/assets/ball.jpg') // Load your texture

    ballTexture.wrapS = THREE.RepeatWrapping
    ballTexture.wrapT = THREE.RepeatWrapping
    ballTexture.flipY = false // Flip vertically if texture appears upside down

    const ballMaterial = new THREE.MeshStandardMaterial({ map: ballTexture })
    const ballMesh = new THREE.Mesh(ballGeometry, ballMaterial)

    ballMesh.castShadow = true
    ballMesh.receiveShadow = true

    world.addBody(ballBody)
    scene.add(ballMesh)
    balls.push(ballBody)
    ballMeshes.push(ballMesh)

    const shootDirection = getShootDirection()

    ballBody.velocity.set(
      shootDirection.x * shootVelocity,
      shootDirection.y * shootVelocity,
      shootDirection.z * shootVelocity
    )

    // Move the ball outside the player sphere
    const x =
      sphereBody.position.x +
      shootDirection.x * (sphereShape.radius * 1.02 + ballShape.radius)
    const y =
      sphereBody.position.y +
      shootDirection.y * (sphereShape.radius * 1.02 + ballShape.radius)
    const z =
      sphereBody.position.z +
      shootDirection.z * (sphereShape.radius * 1.02 + ballShape.radius)
    ballBody.position.set(x, y, z)
    ballMesh.position.copy(ballBody.position)
  })
}

function initPointerLock(): void {
  controls = new PointerLockControlsCannon(camera, sphereBody)
  scene.add(controls.getObject())

  instructions.addEventListener('click', () => {
    controls.lock()
  })

  // @ts-expect-error
  controls.addEventListener('lock', () => {
    controls.enabled = true
    instructions.style.display = 'none'
  })

  // @ts-expect-error
  controls.addEventListener('unlock', () => {
    controls.enabled = false
    instructions.style.display = 'flex'
  })
}

function animate(): void {
  requestAnimationFrame(animate)

  const time = performance.now() / 1000
  const dt = time - lastCallTime
  lastCallTime = time

  if (controls.enabled) {
    world.step(timeStep, dt)

    // Update ball positions
    for (let i = 0; i < balls.length; i++) {
      ballMeshes[i].position.copy(balls[i].position as any)
      ballMeshes[i].quaternion.copy(balls[i].quaternion as any)
    }

    // Update box positions
    for (let i = 0; i < boxes.length; i++) {
      boxMeshes[i].position.copy(boxes[i].position as any)
      boxMeshes[i].quaternion.copy(boxes[i].quaternion as any)
    }
  }

  controls.update(dt)
  renderer.render(scene, camera)
}
