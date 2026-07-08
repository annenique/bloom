import * as THREE from 'three';

// =====================================================
// BLOOM — Week 2: Third-Person Survival Game
// You are a phytoplankton cell. Survive.
// =====================================================

// ---- WORLD CONSTANTS ----
const WORLD_RADIUS   = 120;
const WORLD_HEIGHT   = 160;
const HALF_H         = WORLD_HEIGHT / 2;
const SURFACE_Y      = HALF_H - 5;
const FLOOR_Y        = -HALF_H + 5;

// ---- GAME STATE ----
const state = {
  energy:         60,      // 0-100, depletes over time
  maxEnergy:      100,
  population:     1,
  photosynthRate: 0,
  nutrientRate:   0,
  time:           0,
  gameOver:       false,
  won:            false,
  paused:         false,
  splitCooldown:  0,
};

// =====================================================
// RENDERER
// =====================================================
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
document.body.appendChild(renderer.domElement);

// =====================================================
// SCENE + FOG
// =====================================================
const scene = new THREE.Scene();
const fogColor = new THREE.Color(0x072a3a);
scene.background = fogColor;
scene.fog = new THREE.FogExp2(fogColor.getHex(), 0.013);

// =====================================================
// CAMERA (third-person follow)
// =====================================================
const camera = new THREE.PerspectiveCamera(
  65, window.innerWidth / window.innerHeight, 0.1, 800
);

// Camera offset behind/above the cell
const CAM_OFFSET = new THREE.Vector3(0, 4, 18);
camera.position.set(0, 10, 30);

// =====================================================
// LIGHTING
// =====================================================
const ambientLight = new THREE.AmbientLight(0x1a4a6a, 0.7);
scene.add(ambientLight);

const sunLight = new THREE.DirectionalLight(0xaaddff, 1.2);
sunLight.position.set(30, 100, 20);
scene.add(sunLight);

const depthLight = new THREE.PointLight(0x001830, 0.5, 200);
depthLight.position.set(0, -60, 0);
scene.add(depthLight);

// =====================================================
// WORLD GEOMETRY
// =====================================================

// Surface shimmer plane
const surfaceGeo = new THREE.PlaneGeometry(500, 500);
const surfaceMat = new THREE.MeshBasicMaterial({
  color: 0x38bdf8, transparent: true, opacity: 0.1,
  side: THREE.DoubleSide
});
const surface = new THREE.Mesh(surfaceGeo, surfaceMat);
surface.rotation.x = -Math.PI / 2;
surface.position.y = SURFACE_Y;
scene.add(surface);

// Light rays shafting down from surface
const rayGroup = new THREE.Group();
scene.add(rayGroup);
for (let i = 0; i < 8; i++) {
  const rayGeo = new THREE.CylinderGeometry(0.3, 2.5, 60, 6, 1, true);
  const rayMat = new THREE.MeshBasicMaterial({
    color: 0x7dd3fc, transparent: true, opacity: 0.04,
    side: THREE.DoubleSide, depthWrite: false
  });
  const ray = new THREE.Mesh(rayGeo, rayMat);
  const angle = (i / 8) * Math.PI * 2;
  ray.position.set(Math.cos(angle) * 25, SURFACE_Y - 30, Math.sin(angle) * 25);
  rayGroup.add(ray);
}

// Sea floor
const floorGeo = new THREE.PlaneGeometry(400, 400, 20, 20);
const floorMat = new THREE.MeshStandardMaterial({ color: 0x0a1520, roughness: 1 });
const floor = new THREE.Mesh(floorGeo, floorMat);
floor.rotation.x = -Math.PI / 2;
floor.position.y = FLOOR_Y;
scene.add(floor);

// Marine snow (ambient drifting particles)
const snowGeo = new THREE.BufferGeometry();
const snowPos = new Float32Array(600 * 3);
const snowVel = new Float32Array(600 * 3);
for (let i = 0; i < 600; i++) {
  snowPos[i*3]   = (Math.random()-0.5)*WORLD_RADIUS*2;
  snowPos[i*3+1] = (Math.random()-0.5)*WORLD_HEIGHT;
  snowPos[i*3+2] = (Math.random()-0.5)*WORLD_RADIUS*2;
  snowVel[i*3]   = (Math.random()-0.5)*0.01;
  snowVel[i*3+1] = -Math.random()*0.04 - 0.01; // slow downward drift
  snowVel[i*3+2] = (Math.random()-0.5)*0.01;
}
snowGeo.setAttribute('position', new THREE.BufferAttribute(snowPos, 3).setUsage(THREE.DynamicDrawUsage));
const snowMat = new THREE.PointsMaterial({ color: 0x8ab4be, size: 0.12, transparent: true, opacity: 0.3, depthWrite: false });
const marineSnow = new THREE.Points(snowGeo, snowMat);
scene.add(marineSnow);

// =====================================================
// PLAYER CELL
// =====================================================
const playerGroup = new THREE.Group();
scene.add(playerGroup);
playerGroup.position.set(0, 0, 0);

// Main cell body — round, translucent
const cellGeo = new THREE.SphereGeometry(1.2, 16, 16);
const cellMat = new THREE.MeshStandardMaterial({
  color: 0x7fff6a,
  emissive: 0x2a8a1a,
  emissiveIntensity: 0.4,
  transparent: true,
  opacity: 0.85,
  roughness: 0.3,
  metalness: 0.1,
});
const cellMesh = new THREE.Mesh(cellGeo, cellMat);
scene.add(cellMesh); // added separately so it's always on top of group

// Cell nucleus (visible inside)
const nucleusGeo = new THREE.SphereGeometry(0.45, 10, 10);
const nucleusMat = new THREE.MeshStandardMaterial({
  color: 0xffd700, emissive: 0xffa500, emissiveIntensity: 0.6,
  transparent: true, opacity: 0.9
});
const nucleus = new THREE.Mesh(nucleusGeo, nucleusMat);
cellMesh.add(nucleus);

// Flagella — wiggly tails for locomotion visual
const flagellaGroup = new THREE.Group();
cellMesh.add(flagellaGroup);
for (let f = 0; f < 3; f++) {
  const flagGeo = new THREE.CylinderGeometry(0.04, 0.01, 2.5, 4);
  const flagMat = new THREE.MeshBasicMaterial({ color: 0x4ade80, transparent: true, opacity: 0.7 });
  const flag = new THREE.Mesh(flagGeo, flagMat);
  const angle = (f / 3) * Math.PI * 2;
  flag.position.set(Math.cos(angle) * 0.6, -1.2, Math.sin(angle) * 0.6);
  flag.rotation.z = Math.sin(angle) * 0.5;
  flagellaGroup.add(flag);
}

// Glow ring (energy indicator)
const glowGeo = new THREE.RingGeometry(1.4, 1.7, 32);
const glowMat = new THREE.MeshBasicMaterial({
  color: 0x4ade80, transparent: true, opacity: 0.5,
  side: THREE.DoubleSide, depthWrite: false
});
const glowRing = new THREE.Mesh(glowGeo, glowMat);
glowRing.renderOrder = 1;
cellMesh.add(glowRing);

// =====================================================
// OFFSPRING POPULATION (visual bloom around player)
// =====================================================
const offspringPool = [];
const MAX_OFFSPRING = 80;

function spawnOffspring(x, y, z) {
  if (offspringPool.length >= MAX_OFFSPRING) return;
  const geo = new THREE.SphereGeometry(
    Math.random() * 0.5 + 0.3, 8, 8
  );
  const mat = new THREE.MeshStandardMaterial({
    color: new THREE.Color().setHSL(0.3 + Math.random()*0.1, 0.8, 0.5),
    emissive: new THREE.Color(0x1a5a10),
    emissiveIntensity: 0.3,
    transparent: true,
    opacity: 0.75,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.set(
    x + (Math.random()-0.5) * 8,
    y + (Math.random()-0.5) * 8,
    z + (Math.random()-0.5) * 8
  );
  // Each offspring drifts randomly
  mesh.userData.vel = new THREE.Vector3(
    (Math.random()-0.5)*0.03,
    (Math.random()-0.5)*0.015,
    (Math.random()-0.5)*0.03
  );
  mesh.userData.phase = Math.random()*Math.PI*2;
  scene.add(mesh);
  offspringPool.push(mesh);
}

// =====================================================
// NUTRIENT PATCHES
// =====================================================
const nutrientPatches = [];
const NUTRIENT_COUNT = 12;

function createNutrientPatch() {
  const geo = new THREE.SphereGeometry(Math.random()*2+1.5, 8, 8);
  const mat = new THREE.MeshBasicMaterial({
    color: 0xf59e0b, transparent: true, opacity: 0.55,
    depthWrite: false, blending: THREE.AdditiveBlending
  });
  const mesh = new THREE.Mesh(geo, mat);
  const angle = Math.random()*Math.PI*2;
  const r = Math.random()*WORLD_RADIUS*0.8;
  mesh.position.set(
    Math.cos(angle)*r,
    (Math.random()-0.5)*WORLD_HEIGHT*0.6,
    Math.sin(angle)*r
  );
  mesh.userData.value = Math.random()*30 + 20; // nutrient energy value
  mesh.userData.active = true;
  scene.add(mesh);
  nutrientPatches.push(mesh);
}

for (let i = 0; i < NUTRIENT_COUNT; i++) createNutrientPatch();

// =====================================================
// DEAD ZONE (warm O2-depleted water — hazard)
// =====================================================
const deadZones = [];

function createDeadZone(x, y, z, radius) {
  const geo = new THREE.SphereGeometry(radius, 16, 16);
  const mat = new THREE.MeshBasicMaterial({
    color: 0xff4400, transparent: true, opacity: 0.12,
    depthWrite: false, side: THREE.DoubleSide
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.set(x, y, z);
  mesh.userData.radius = radius;
  mesh.userData.damage = 18; // energy/sec lost inside
  scene.add(mesh);
  deadZones.push(mesh);
}

createDeadZone(30, -20, 15, 22);
createDeadZone(-40, 10, -30, 18);

// Warning halos around dead zones
deadZones.forEach(dz => {
  const haloGeo = new THREE.RingGeometry(
    dz.userData.radius, dz.userData.radius + 1.5, 32
  );
  const haloMat = new THREE.MeshBasicMaterial({
    color: 0xff6600, transparent: true, opacity: 0.3,
    side: THREE.DoubleSide, depthWrite: false
  });
  const halo = new THREE.Mesh(haloGeo, haloMat);
  halo.rotation.x = -Math.PI/2;
  dz.add(halo);
});

// =====================================================
// ZOOPLANKTON PREDATOR
// =====================================================
const predatorGroup = new THREE.Group();
scene.add(predatorGroup);

const predGeo = new THREE.ConeGeometry(1.5, 4, 8);
const predMat = new THREE.MeshStandardMaterial({
  color: 0xef4444, emissive: 0x7f1d1d, emissiveIntensity: 0.5
});
const predMesh = new THREE.Mesh(predGeo, predMat);
predMesh.rotation.x = Math.PI/2;
predatorGroup.add(predMesh);

// Predator eyes
[-0.6, 0.6].forEach(xOff => {
  const eyeGeo = new THREE.SphereGeometry(0.25, 6, 6);
  const eyeMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
  const eye = new THREE.Mesh(eyeGeo, eyeMat);
  eye.position.set(xOff, 0.5, -1.5);
  predatorGroup.add(eye);

  const pupilGeo = new THREE.SphereGeometry(0.12, 6, 6);
  const pupilMat = new THREE.MeshBasicMaterial({ color: 0x000000 });
  const pupil = new THREE.Mesh(pupilGeo, pupilMat);
  pupil.position.set(xOff, 0.5, -1.75);
  predatorGroup.add(pupil);
});

predatorGroup.position.set(-60, 0, -60); // starts far away

const predatorState = {
  vel: new THREE.Vector3(),
  speed: 5.5,
  chaseRange: 45,
  damageRange: 3.5,
  damage: 25,
};

// =====================================================
// INPUT
// =====================================================
const keys = {};
window.addEventListener('keydown', e => { keys[e.code] = true; });
window.addEventListener('keyup',   e => { keys[e.code] = false; });

// Mouse look for steering
const mouse = { x: 0, y: 0 };
let pointerLocked = false;

renderer.domElement.addEventListener('click', () => {
  if (document.getElementById('startOverlay').style.display === 'none') {
    renderer.domElement.requestPointerLock();
  }
});
document.addEventListener('pointerlockchange', () => {
  pointerLocked = document.pointerLockElement === renderer.domElement;
});
document.addEventListener('mousemove', e => {
  if (!pointerLocked) return;
  mouse.x += e.movementX * 0.003;
  mouse.y += e.movementY * 0.0015;
  mouse.y = THREE.MathUtils.clamp(mouse.y, -1.0, 1.0);
});

// =====================================================
// PLAYER MOVEMENT
// =====================================================
const playerVel = new THREE.Vector3();
const PLAYER_SPEED    = 18;
const PLAYER_DAMPING  = 2.8;
const PLAYER_MAXSPEED = 15;

const moveDir = new THREE.Vector3();
const playerFacing = new THREE.Euler(0, 0, 0, 'YXZ');

function updatePlayer(delta) {
  if (state.gameOver) return;

  // Facing from mouse input
  playerFacing.y = -mouse.x;
  playerFacing.x = mouse.y * 0.6;

  // Build forward/right from facing
  const quat = new THREE.Quaternion().setFromEuler(playerFacing);
  const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(quat);
  const right   = new THREE.Vector3(1, 0,  0).applyQuaternion(quat);

  moveDir.set(0, 0, 0);
  if (keys['KeyW'] || keys['ArrowUp'])    moveDir.add(forward);
  if (keys['KeyS'] || keys['ArrowDown'])  moveDir.sub(forward);
  if (keys['KeyA'] || keys['ArrowLeft'])  moveDir.sub(right);
  if (keys['KeyD'] || keys['ArrowRight']) moveDir.add(right);
  if (keys['Space'])     moveDir.y += 1;
  if (keys['ShiftLeft'] || keys['ShiftRight']) moveDir.y -= 1;

  if (moveDir.lengthSq() > 0) {
    moveDir.normalize();
    playerVel.addScaledVector(moveDir, PLAYER_SPEED * delta);
  }

  // Water drag
  playerVel.multiplyScalar(Math.exp(-PLAYER_DAMPING * delta));
  if (playerVel.length() > PLAYER_MAXSPEED) playerVel.setLength(PLAYER_MAXSPEED);

  cellMesh.position.addScaledVector(playerVel, delta);

  // Bounds
  cellMesh.position.y = THREE.MathUtils.clamp(cellMesh.position.y, FLOOR_Y+2, SURFACE_Y-1);
  const hd = Math.sqrt(cellMesh.position.x**2 + cellMesh.position.z**2);
  if (hd > WORLD_RADIUS - 5) {
    cellMesh.position.x *= (WORLD_RADIUS-5)/hd;
    cellMesh.position.z *= (WORLD_RADIUS-5)/hd;
  }

  // Orient cell toward movement direction
  if (playerVel.lengthSq() > 0.5) {
    const lookTarget = cellMesh.position.clone().add(playerVel.clone().normalize());
    cellMesh.lookAt(lookTarget);
  }
}

// =====================================================
// THIRD-PERSON CAMERA FOLLOW
// =====================================================
const camTarget = new THREE.Vector3();
const camPos    = new THREE.Vector3();

function updateCamera(delta) {
  // Get facing direction for camera placement
  const quat = new THREE.Quaternion().setFromEuler(playerFacing);
  const back = new THREE.Vector3(0, 0, 1).applyQuaternion(quat);
  const up   = new THREE.Vector3(0, 1, 0);

  const idealPos = cellMesh.position.clone()
    .addScaledVector(back, CAM_OFFSET.z)
    .addScaledVector(up,   CAM_OFFSET.y);

  // Smooth follow
  camPos.lerp(idealPos, 1 - Math.exp(-8 * delta));
  camera.position.copy(camPos);

  // Look slightly ahead of cell
  camTarget.lerp(cellMesh.position, 1 - Math.exp(-10 * delta));
  camera.lookAt(camTarget);
}

// =====================================================
// BIOLOGY SIMULATION
// =====================================================
function updateBiology(delta) {
  if (state.gameOver) return;

  const pos = cellMesh.position;
  const depthFrac = THREE.MathUtils.clamp((SURFACE_Y - pos.y) / WORLD_HEIGHT, 0, 1);

  // --- PHOTOSYNTHESIS ---
  // Light availability drops with depth (Beer-Lambert law approximation)
  const lightAvailable = Math.max(0, 1 - depthFrac * 2.2);
  state.photosynthRate = lightAvailable * 14; // energy/sec gained near surface
  state.energy = Math.min(state.maxEnergy, state.energy + state.photosynthRate * delta);

  // --- BASELINE METABOLISM (energy cost of being alive) ---
  state.energy -= 5 * delta;

  // --- NUTRIENT ABSORPTION ---
  state.nutrientRate = 0;
  nutrientPatches.forEach(patch => {
    if (!patch.userData.active) return;
    const dist = pos.distanceTo(patch.position);
    if (dist < patch.geometry.parameters.radius + 1.5) {
      const gain = Math.min(patch.userData.value, 22 * delta);
      state.energy = Math.min(state.maxEnergy, state.energy + gain);
      state.nutrientRate += gain / delta;
      patch.userData.value -= gain;
      if (patch.userData.value <= 0) {
        patch.userData.active = false;
        patch.visible = false;
        // Respawn nutrient elsewhere after delay
        setTimeout(() => {
          const angle = Math.random()*Math.PI*2;
          const r = Math.random()*WORLD_RADIUS*0.8;
          patch.position.set(
            Math.cos(angle)*r,
            (Math.random()-0.5)*WORLD_HEIGHT*0.6,
            Math.sin(angle)*r
          );
          patch.userData.value = Math.random()*30+20;
          patch.userData.active = true;
          patch.visible = true;
        }, 8000);
      }
    }
  });

  // --- DEAD ZONE DAMAGE ---
  deadZones.forEach(dz => {
    const dist = pos.distanceTo(dz.position);
    if (dist < dz.userData.radius) {
      state.energy -= dz.userData.damage * delta;
      // Red flash on cell
      cellMat.color.setHex(0xff4444);
      setTimeout(() => cellMat.color.setHex(0x7fff6a), 120);
    }
  });

  // --- PREDATOR DAMAGE ---
  const predDist = pos.distanceTo(predatorGroup.position);
  if (predDist < predatorState.damageRange) {
    state.energy -= predatorState.damage * delta;
    cellMat.color.setHex(0xff2200);
    setTimeout(() => cellMat.color.setHex(0x7fff6a), 200);
  }

  // --- REPRODUCTION (split when full energy) ---
  state.splitCooldown -= delta;
  if (state.energy >= state.maxEnergy * 0.92 && state.splitCooldown <= 0) {
    state.energy *= 0.55; // split costs energy
    state.population++;
    state.splitCooldown = 4;
    spawnOffspring(pos.x, pos.y, pos.z);

    // Flash white on split
    cellMat.emissive.setHex(0xffffff);
    setTimeout(() => cellMat.emissive.setHex(0x2a8a1a), 300);
  }

  // --- DEATH ---
  if (state.energy <= 0) {
    state.energy = 0;
    state.gameOver = true;
    showGameOver();
  }

  // Win condition: population reaches 20
  if (state.population >= 20 && !state.won) {
    state.won = true;
    showWin();
  }
}

// =====================================================
// PREDATOR AI
// =====================================================
function updatePredator(delta) {
  const pos = predatorGroup.position;
  const cellPos = cellMesh.position;
  const dist = pos.distanceTo(cellPos);

  // Patrol slowly when far, chase when close
  if (dist < predatorState.chaseRange) {
    const dir = cellPos.clone().sub(pos).normalize();
    predatorState.vel.lerp(dir.multiplyScalar(predatorState.speed), delta * 3);
  } else {
    // Wander
    predatorState.vel.x += (Math.random()-0.5)*0.15;
    predatorState.vel.y += (Math.random()-0.5)*0.08;
    predatorState.vel.z += (Math.random()-0.5)*0.15;
    predatorState.vel.clampLength(0, 3);
  }

  pos.addScaledVector(predatorState.vel, delta);
  pos.y = THREE.MathUtils.clamp(pos.y, FLOOR_Y+5, SURFACE_Y-5);

  // Look toward cell
  predatorGroup.lookAt(cellMesh.position);
}

// =====================================================
// OFFSPRING DRIFT
// =====================================================
function updateOffspring(time, delta) {
  offspringPool.forEach(mesh => {
    mesh.position.addScaledVector(mesh.userData.vel, 1);
    mesh.position.y += Math.sin(time * 0.4 + mesh.userData.phase) * 0.01;

    // Wrap vertically
    if (mesh.position.y > SURFACE_Y) mesh.position.y = FLOOR_Y;
    if (mesh.position.y < FLOOR_Y)   mesh.position.y = SURFACE_Y;
  });
}

// =====================================================
// CELL VISUALS / ANIMATION
// =====================================================
function updateCellVisuals(time) {
  const energyFrac = state.energy / state.maxEnergy;

  // Scale: shrinks when dying, pulses when healthy
  const pulse = 1 + Math.sin(time * 2.5) * 0.04 * energyFrac;
  const scale = THREE.MathUtils.lerp(0.4, 1.0, energyFrac) * pulse;
  cellMesh.scale.setScalar(scale);

  // Color: green (healthy) → yellow → red (dying)
  const h = THREE.MathUtils.lerp(0.0, 0.33, energyFrac);
  cellMat.color.setHSL(h, 0.9, 0.55);
  cellMat.emissiveIntensity = 0.3 + energyFrac * 0.4;

  // Glow ring: size and opacity based on energy
  glowRing.material.opacity = energyFrac * 0.6;
  glowRing.scale.setScalar(1 + Math.sin(time * 1.5) * 0.08);

  // Flagella wiggle
  flagellaGroup.rotation.y = Math.sin(time * 4) * 0.3;
  flagellaGroup.rotation.z = Math.cos(time * 3) * 0.15;

  // Photosynthesis glow — brighter near surface
  const depthFrac = THREE.MathUtils.clamp((SURFACE_Y - cellMesh.position.y)/WORLD_HEIGHT, 0, 1);
  const photoGlow = Math.max(0, 1 - depthFrac*2.2);
  cellMat.emissive.setRGB(
    photoGlow * 0.0,
    photoGlow * 0.5 + 0.1,
    photoGlow * 0.1
  );
}

// =====================================================
// WORLD DEPTH VISUALS
// =====================================================
function updateDepthVisuals() {
  const depthFrac = THREE.MathUtils.clamp(
    (SURFACE_Y - cellMesh.position.y) / WORLD_HEIGHT, 0, 1
  );
  const surfaceColor = new THREE.Color(0x0d4a6e);
  const deepColor    = new THREE.Color(0x010a14);
  const fog = surfaceColor.clone().lerp(deepColor, depthFrac);
  scene.fog.color.copy(fog);
  scene.background.copy(fog);
  scene.fog.density = 0.009 + depthFrac * 0.016;
  sunLight.intensity = THREE.MathUtils.lerp(1.4, 0.1, depthFrac);
  ambientLight.intensity = THREE.MathUtils.lerp(0.8, 0.2, depthFrac);
}

// =====================================================
// MARINE SNOW DRIFT
// =====================================================
function updateMarineSnow(delta) {
  const pos = snowGeo.attributes.position.array;
  for (let i = 0; i < 600; i++) {
    pos[i*3]   += snowVel[i*3];
    pos[i*3+1] += snowVel[i*3+1];
    pos[i*3+2] += snowVel[i*3+2];
    if (pos[i*3+1] < FLOOR_Y) pos[i*3+1] = SURFACE_Y;
  }
  snowGeo.attributes.position.needsUpdate = true;
}

// =====================================================
// HUD UPDATE
// =====================================================
function updateHUD() {
  const energyFrac = state.energy / state.maxEnergy;
  const bar = document.getElementById('energyFill');
  if (bar) {
    bar.style.width = (energyFrac * 100) + '%';
    bar.style.background = `hsl(${Math.round(energyFrac*120)}, 90%, 50%)`;
  }

  const depthFrac = THREE.MathUtils.clamp((SURFACE_Y - cellMesh.position.y)/WORLD_HEIGHT, 0, 1);
  const lightPct  = Math.round(Math.max(0, 1 - depthFrac*2.2)*100);

  setText('popCount',      state.population);
  setText('depthReadout',  (depthFrac*40).toFixed(1) + 'm');
  setText('lightReadout',  lightPct + '%');
  setText('photoReadout',  state.photosynthRate.toFixed(1) + ' E/s');
  setText('energyReadout', Math.round(state.energy) + ' / ' + state.maxEnergy);

  // Predator proximity warning
  const predDist = cellMesh.position.distanceTo(predatorGroup.position);
  const warn = document.getElementById('predatorWarn');
  if (warn) warn.style.opacity = predDist < 35 ? Math.min(1, (35-predDist)/20) : 0;

  // Dead zone warning
  let inDead = false;
  deadZones.forEach(dz => {
    if (cellMesh.position.distanceTo(dz.position) < dz.userData.radius + 5) inDead = true;
  });
  const dzWarn = document.getElementById('deadZoneWarn');
  if (dzWarn) dzWarn.style.opacity = inDead ? 1 : 0;
}

function setText(id, val) {
  const el = document.getElementById(id);
  if (el) el.textContent = val;
}

// =====================================================
// GAME OVER / WIN
// =====================================================
function showGameOver() {
  const el = document.getElementById('gameOverScreen');
  if (el) el.style.display = 'flex';
  if (document.pointerLockElement) document.exitPointerLock();
}

function showWin() {
  const el = document.getElementById('winScreen');
  if (el) el.style.display = 'flex';
}

document.getElementById('restartBtn')?.addEventListener('click', () => {
  location.reload();
});
document.getElementById('winRestartBtn')?.addEventListener('click', () => {
  location.reload();
});

// =====================================================
// START OVERLAY
// =====================================================
document.getElementById('startBtn').addEventListener('click', () => {
  document.getElementById('startOverlay').style.display = 'none';
  renderer.domElement.requestPointerLock();
});

// =====================================================
// RESIZE
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
let fpsAccum = 0, fpsFrames = 0;

function animate() {
  requestAnimationFrame(animate);
  if (state.paused || state.gameOver) {
    renderer.render(scene, camera);
    return;
  }

  const delta = Math.min(clock.getDelta(), 0.08);
  const time  = clock.getElapsedTime();
  state.time  = time;

  updatePlayer(delta);
  updateCamera(delta);
  updateBiology(delta);
  updatePredator(delta);
  updateOffspring(time, delta);
  updateCellVisuals(time);
  updateDepthVisuals();
  updateMarineSnow(delta);
  updateHUD();

  // Animate nutrient patches (pulse)
  nutrientPatches.forEach(p => {
    if (p.userData.active) {
      const s = 1 + Math.sin(time * 2 + p.position.x) * 0.15;
      p.scale.setScalar(s);
    }
  });

  // Animate dead zones (slow breathe)
  deadZones.forEach(dz => {
    const s = 1 + Math.sin(time * 0.8) * 0.05;
    dz.scale.setScalar(s);
  });

  // Light ray shimmer
  rayGroup.children.forEach((ray, i) => {
    ray.material.opacity = 0.03 + Math.sin(time*0.5 + i) * 0.02;
  });

  renderer.render(scene, camera);

  fpsAccum += delta; fpsFrames++;
  if (fpsAccum >= 0.5) {
    setText('fps', Math.round(fpsFrames/fpsAccum) + ' fps');
    fpsAccum = 0; fpsFrames = 0;
  }
}

animate();
