import * as THREE from 'three';

// =====================================================
// BLOOM — Week 1: Scene, Free-Swim Camera, Particle System
// =====================================================

// ---------- CONSTANTS ----------
const WATER_COLUMN_HEIGHT = 200;   // total vertical extent of the simulated column
const WATER_COLUMN_RADIUS = 120;   // horizontal play radius
const MAX_PARTICLES = 20000;       // ceiling for plankton particle count

// Colors shift with "depth" to fake light attenuation
const SURFACE_FOG_COLOR = new THREE.Color(0x0a3a52);
const DEEP_FOG_COLOR    = new THREE.Color(0x010810);

// ---------- RENDERER ----------
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
document.body.appendChild(renderer.domElement);

// ---------- SCENE ----------
const scene = new THREE.Scene();
scene.background = SURFACE_FOG_COLOR.clone();
scene.fog = new THREE.FogExp2(SURFACE_FOG_COLOR.getHex(), 0.012);

// ---------- CAMERA ----------
const camera = new THREE.PerspectiveCamera(
  70,
  window.innerWidth / window.innerHeight,
  0.1,
  1000
);
camera.position.set(0, 0, 40);

// ---------- LIGHTING ----------
// Soft ambient base so nothing is pure black
const ambient = new THREE.AmbientLight(0x224a5e, 0.6);
scene.add(ambient);

// "Sun" shafting down from above the surface
const sunLight = new THREE.DirectionalLight(0xbfe8ff, 1.1);
sunLight.position.set(20, 100, 30);
scene.add(sunLight);

// A subtle bluish fill light from below (bounced light)
const fillLight = new THREE.PointLight(0x0a4a6e, 0.4, 200);
fillLight.position.set(0, -50, 0);
scene.add(fillLight);

// ---------- CAUSTIC-LIKE SURFACE PLANE (visual anchor for "up") ----------
const surfaceGeo = new THREE.PlaneGeometry(400, 400, 1, 1);
const surfaceMat = new THREE.MeshBasicMaterial({
  color: 0x4fb8e8,
  transparent: true,
  opacity: 0.12,
  side: THREE.DoubleSide
});
const surfacePlane = new THREE.Mesh(surfaceGeo, surfaceMat);
surfacePlane.rotation.x = -Math.PI / 2;
surfacePlane.position.y = WATER_COLUMN_HEIGHT / 2;
scene.add(surfacePlane);

// Sea floor anchor (visual only, far below)
const floorGeo = new THREE.PlaneGeometry(400, 400, 1, 1);
const floorMat = new THREE.MeshStandardMaterial({
  color: 0x0a1a22,
  roughness: 1
});
const floorPlane = new THREE.Mesh(floorGeo, floorMat);
floorPlane.rotation.x = -Math.PI / 2;
floorPlane.position.y = -WATER_COLUMN_HEIGHT / 2;
scene.add(floorPlane);

// ---------- DRIFTING MARINE SNOW (ambient detail, non-plankton) ----------
function createMarineSnow(count) {
  const geo = new THREE.BufferGeometry();
  const positions = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    positions[i * 3 + 0] = (Math.random() - 0.5) * WATER_COLUMN_RADIUS * 2;
    positions[i * 3 + 1] = (Math.random() - 0.5) * WATER_COLUMN_HEIGHT;
    positions[i * 3 + 2] = (Math.random() - 0.5) * WATER_COLUMN_RADIUS * 2;
  }
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));

  const mat = new THREE.PointsMaterial({
    color: 0x9fd8e8,
    size: 0.15,
    transparent: true,
    opacity: 0.35,
    depthWrite: false
  });

  return new THREE.Points(geo, mat);
}

const marineSnow = createMarineSnow(800);
scene.add(marineSnow);

// =====================================================
// PLANKTON PARTICLE SYSTEM
// Built to scale from near-zero to MAX_PARTICLES live.
// Week 2 will drive `targetDensity` from the simulation model;
// for now a single UI slider drives it directly.
// =====================================================

class PlanktonField {
  constructor(maxCount) {
    this.maxCount = maxCount;
    this.activeCount = 0;

    // Position buffer is fully allocated up front (cheap, avoids realloc)
    this.positions = new Float32Array(maxCount * 3);
    this.velocities = new Float32Array(maxCount * 3); // gentle drift per-particle
    this.phases = new Float32Array(maxCount);          // for bobbing motion

    this.geometry = new THREE.BufferGeometry();
    this.geometry.setAttribute(
      'position',
      new THREE.BufferAttribute(this.positions, 3).setUsage(THREE.DynamicDrawUsage)
    );

    // Plankton appear as soft glowing points — color will later encode
    // species/health (week 2). For now: a living green-gold.
    this.material = new THREE.PointsMaterial({
      color: 0x9fe870,
      size: 0.55,
      transparent: true,
      opacity: 0.85,
      depthWrite: false,
      blending: THREE.AdditiveBlending
    });

    this.points = new THREE.Points(this.geometry, this.material);
    this.points.frustumCulled = false; // we manually manage visible range

    // Seed all particle data immediately (positions exist even if not drawn)
    for (let i = 0; i < maxCount; i++) {
      this._seedParticle(i);
    }

    // Initially draw nothing
    this.geometry.setDrawRange(0, 0);
  }

  _seedParticle(i) {
    const r = Math.random() * WATER_COLUMN_RADIUS;
    const theta = Math.random() * Math.PI * 2;
    const y = (Math.random() - 0.5) * WATER_COLUMN_HEIGHT;

    this.positions[i * 3 + 0] = Math.cos(theta) * r;
    this.positions[i * 3 + 1] = y;
    this.positions[i * 3 + 2] = Math.sin(theta) * r;

    // Gentle random drift velocity (cm/s-ish scale, tuned visually)
    this.velocities[i * 3 + 0] = (Math.random() - 0.5) * 0.02;
    this.velocities[i * 3 + 1] = (Math.random() - 0.5) * 0.01;
    this.velocities[i * 3 + 2] = (Math.random() - 0.5) * 0.02;

    this.phases[i] = Math.random() * Math.PI * 2;
  }

  /** Set how many particles should currently be visible (0..maxCount) */
  setDensity(fraction) {
    const count = Math.floor(THREE.MathUtils.clamp(fraction, 0, 1) * this.maxCount);
    this.activeCount = count;
    this.geometry.setDrawRange(0, count);
  }

  update(time, delta) {
    const pos = this.positions;
    const vel = this.velocities;
    const half = WATER_COLUMN_HEIGHT / 2;
    const n = this.activeCount;

    for (let i = 0; i < n; i++) {
      const ix = i * 3;
      const iy = i * 3 + 1;
      const iz = i * 3 + 2;

      // Drift
      pos[ix] += vel[ix];
      pos[iy] += vel[iy] + Math.sin(time * 0.3 + this.phases[i]) * 0.003; // bob
      pos[iz] += vel[iz];

      // Wrap vertically within the column (so it reads as a living field, not a leak)
      if (pos[iy] > half) pos[iy] = -half;
      if (pos[iy] < -half) pos[iy] = half;

      // Wrap horizontally back toward center if drifting too far
      const dist = Math.sqrt(pos[ix] * pos[ix] + pos[iz] * pos[iz]);
      if (dist > WATER_COLUMN_RADIUS) {
        const pullBack = 0.98;
        pos[ix] *= pullBack;
        pos[iz] *= pullBack;
      }
    }

    this.geometry.attributes.position.needsUpdate = true;
  }
}

const planktonField = new PlanktonField(MAX_PARTICLES);
scene.add(planktonField.points);

// ---------- CONNECT TEST SLIDER (week-1 placeholder for week-2 sim) ----------
const densitySlider = document.getElementById('densitySlider');
const densityVal = document.getElementById('densityVal');

function applyDensityFromSlider() {
  const pct = parseInt(densitySlider.value, 10);
  densityVal.textContent = pct + '%';
  planktonField.setDensity(pct / 100);
}
densitySlider.addEventListener('input', applyDensityFromSlider);
applyDensityFromSlider();

// =====================================================
// FREE-SWIM CAMERA CONTROLLER
// Pointer-lock based, 6-degree-of-freedom underwater feel
// =====================================================

class SwimController {
  constructor(camera, domElement) {
    this.camera = camera;
    this.domElement = domElement;

    this.yaw = 0;
    this.pitch = 0;

    this.velocity = new THREE.Vector3();
    this.acceleration = 40;   // how fast we speed up
    this.damping = 3.0;       // water drag — higher = stops faster
    this.maxSpeed = 14;

    this.keys = {
      forward: false, back: false, left: false, right: false,
      up: false, down: false
    };

    this.enabled = false;

    this._bindEvents();
  }

  _bindEvents() {
    this.domElement.addEventListener('click', () => {
      this.domElement.requestPointerLock();
    });

    document.addEventListener('pointerlockchange', () => {
      this.enabled = document.pointerLockElement === this.domElement;
    });

    document.addEventListener('mousemove', (e) => {
      if (!this.enabled) return;
      const sensitivity = 0.0022;
      this.yaw -= e.movementX * sensitivity;
      this.pitch -= e.movementY * sensitivity;
      const limit = Math.PI / 2 - 0.05;
      this.pitch = THREE.MathUtils.clamp(this.pitch, -limit, limit);
    });

    window.addEventListener('keydown', (e) => this._setKey(e.code, true));
    window.addEventListener('keyup', (e) => this._setKey(e.code, false));
  }

  _setKey(code, isDown) {
    switch (code) {
      case 'KeyW': this.keys.forward = isDown; break;
      case 'KeyS': this.keys.back = isDown; break;
      case 'KeyA': this.keys.left = isDown; break;
      case 'KeyD': this.keys.right = isDown; break;
      case 'Space': this.keys.up = isDown; break;
      case 'ShiftLeft':
      case 'ShiftRight': this.keys.down = isDown; break;
    }
  }

  update(delta) {
    // Apply look rotation
    this.camera.rotation.order = 'YXZ';
    this.camera.rotation.y = this.yaw;
    this.camera.rotation.x = this.pitch;

    // Build movement input vector in camera space
    const forward = new THREE.Vector3();
    this.camera.getWorldDirection(forward);
    const right = new THREE.Vector3();
    right.crossVectors(forward, this.camera.up).normalize();

    const input = new THREE.Vector3();
    if (this.keys.forward) input.add(forward);
    if (this.keys.back) input.sub(forward);
    if (this.keys.right) input.add(right);
    if (this.keys.left) input.sub(right);
    if (this.keys.up) input.y += 1;
    if (this.keys.down) input.y -= 1;

    if (input.lengthSq() > 0) {
      input.normalize();
      this.velocity.addScaledVector(input, this.acceleration * delta);
    }

    // Water drag (exponential damping feels more "fluid" than linear)
    const dragFactor = Math.exp(-this.damping * delta);
    this.velocity.multiplyScalar(dragFactor);

    // Clamp top speed
    if (this.velocity.length() > this.maxSpeed) {
      this.velocity.setLength(this.maxSpeed);
    }

    // Integrate position
    this.camera.position.addScaledVector(this.velocity, delta);

    // Soft bounds — gently push back if leaving the simulated column
    const half = WATER_COLUMN_HEIGHT / 2 - 2;
    if (this.camera.position.y > half) this.camera.position.y = half;
    if (this.camera.position.y < -half) this.camera.position.y = -half;

    const horizDist = Math.sqrt(
      this.camera.position.x ** 2 + this.camera.position.z ** 2
    );
    if (horizDist > WATER_COLUMN_RADIUS) {
      const scale = WATER_COLUMN_RADIUS / horizDist;
      this.camera.position.x *= scale;
      this.camera.position.z *= scale;
    }
  }
}

const swimController = new SwimController(camera, renderer.domElement);

// ---------- START OVERLAY ----------
const startOverlay = document.getElementById('startOverlay');
startOverlay.addEventListener('click', () => {
  startOverlay.style.display = 'none';
});

// =====================================================
// DEPTH-REACTIVE FOG / LIGHT
// Gives a sense of descending into darker water
// =====================================================

function updateDepthVisuals() {
  const half = WATER_COLUMN_HEIGHT / 2;
  // depthFrac: 0 at surface, 1 at floor
  const depthFrac = THREE.MathUtils.clamp(
    (half - camera.position.y) / WATER_COLUMN_HEIGHT,
    0, 1
  );

  const fogColor = SURFACE_FOG_COLOR.clone().lerp(DEEP_FOG_COLOR, depthFrac);
  scene.fog.color.copy(fogColor);
  scene.background.copy(fogColor);

  // Fog density increases slightly with depth (murkier deep water)
  scene.fog.density = 0.010 + depthFrac * 0.014;

  // Dim the directional "sun" as we descend
  sunLight.intensity = THREE.MathUtils.lerp(1.3, 0.15, depthFrac);
  ambient.intensity = THREE.MathUtils.lerp(0.7, 0.25, depthFrac);

  // HUD readout — treat column height as ~40m of real depth for flavor
  const depthMeters = depthFrac * 40;
  document.getElementById('depthReadout').textContent =
    'DEPTH — ' + depthMeters.toFixed(1) + 'm';
}

// =====================================================
// RESIZE HANDLING
// =====================================================

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// =====================================================
// MAIN LOOP
// =====================================================

const clock = new THREE.Clock();
let fpsAccum = 0;
let fpsFrames = 0;
const fpsCounter = document.getElementById('fpsCounter');

function animate() {
  requestAnimationFrame(animate);

  const delta = Math.min(clock.getDelta(), 0.1); // clamp to avoid huge jumps on tab-switch
  const time = clock.getElapsedTime();

  swimController.update(delta);
  planktonField.update(time, delta);

  // Slow ambient rotation of marine snow for subtle life
  marineSnow.rotation.y += delta * 0.01;

  updateDepthVisuals();

  renderer.render(scene, camera);

  // FPS counter (updates ~4x/sec)
  fpsAccum += delta;
  fpsFrames++;
  if (fpsAccum >= 0.25) {
    const fps = Math.round(fpsFrames / fpsAccum);
    fpsCounter.textContent = fps + ' fps';
    fpsAccum = 0;
    fpsFrames = 0;
  }
}

animate();
