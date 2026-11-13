/**
 * MVP-2 Neo-Tokyo Destructible Urban Sandbox Renderer & Controller (Layer 1 Client).
 * - Heavy Bipedal Gundam Walk Cycle (WASD) <-> Rocket Boost Skate (Shift) & Hover Flight (Space)
 * - HDR UnrealBloomPass + 3-Layer Glowing Hyper Beam Saber + Dynamic PointLight
 * - Dual-Cone Rocket Thruster Exhaust Plumes + Ember Streams
 * - Mode-1 360 Front-Inspect Orbit Camera (C / Alt + Wheel Zoom)
 * - Game-Grade Panoramic FPS Cockpit with Live MFD Canvas Screens (V)
 * - Mouse-Swipe Directional Hyper Beam Saber Slashes (RMB) + Drop/Crouch-Pickup (F / R)
 * - 100% Static ES Module + Relative Asset URLs (GitHub Pages Compatible)
 */
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { ARENA_RADIUS, CAMERA_MODES } from '../shared/constants.js';
import { MECHA_SKINS } from '../shared/skins.js';
import {
  clamp,
  lerp,
  computeSkateTilt,
  computeModularMassAndThrust,
  solveGroundFootAlignment,
  stepLandingSuspension,
  consumeJumpImpulse,
  stepAerialFlight,
  resolveWorldCollisions,
  createWeaponPickupState,
  triggerDropWeapons,
  stepWeaponPickup,
  damageDestructibleProp,
  computeBuildingDurability,
  computeWalkCycle,
  detectWalkFootstep,
  classifyMouseSlashDirection,
  computeDirectionalSaberPose,
  computeContinuousSaberPose,
  resolveArmLoadoutPreset,
  createShieldState,
  stepShieldDefense,
  evaluateShieldIncomingHit,
  computeParryRecoilPose,
  sanitizeMouseLookDelta,
} from './kinematics.js';
import { applyMechaSkin } from './skin_shader.js';
import { MechaAudioSynth, VfxSystem } from './vfx_system.js';

const DEG2RAD = Math.PI / 180;
const MODEL_URL = new URL('../../assets/models/mecha_allrounder_valiant.glb', import.meta.url).href;

export class MechaSandboxApp {
  constructor(uiHooks) {
    this.ui = uiHooks;
    this.audio = new MechaAudioSynth();

    this.lightingMode = 'daylight';
    this.cityTextureCache = {};
    this.cityMaterials = { floorMat: null, skyDome: null };
    this.sceneLights = { hemi: null, sun: null, frontFill: null };
    this.movingCars = { bodyMesh: null, cabinMesh: null, items: [] };
    this.cars = [];
    this.carInst = { bodyMesh: null, trimMesh: null, lightMesh: null };
    this.instancedDestructibles = [];
    this.supportHeight = 0;

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color('#80b2e6');
    this.scene.fog = new THREE.FogExp2('#c4d7eb', 0.0045);

    this.camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.08, 350);
    this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.06;

    const pmrem = new THREE.PMREMGenerator(this.renderer);
    this.scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    this.scene.environmentIntensity = 0.72;
    pmrem.dispose();

    const mount = document.getElementById('viewport');
    mount.appendChild(this.renderer.domElement);

    // HDR Bloom calibrated softly so armor & daylight Tokyo stay crisp while saber & tracer tips gleam
    this.composer = new EffectComposer(this.renderer);
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    this.bloomPass = new UnrealBloomPass(
      new THREE.Vector2(window.innerWidth, window.innerHeight),
      0.28,
      0.30,
      1.56,
    );
    this.composer.addPass(this.bloomPass);
    this.composer.addPass(new OutputPass());

    this.vfx = new VfxSystem(this.scene);

    // Simulation state
    this.paused = false;
    this.cameraMode = CAMERA_MODES.TPS;
    this.yaw = 0;
    this.pitch = -0.14;
    this.orbitActive = false;
    this.orbitYaw = Math.PI * 0.85;
    this.orbitPitch = 0.14;
    this.orbitDistance = 4.5;

    this.skateTiltSmooth = { rollRad: 0, pitchRad: 0 };
    this.walkPhase = 0;
    this.walkBlend = 0;
    this.prevHorzSpeed = 0;
    this.walkLeanSmooth = 0;
    this.massThrust = computeModularMassAndThrust([]);
    this.physics = {
      x: 0,
      y: 0,
      z: 10,
      vx: 0,
      vy: 0,
      vz: 0,
      en: 100,
      maxEn: 100,
      enRegenDelaySec: 0,
      grounded: true,
    };
    this.prevVy = 0;
    this.suspension = { active: false, elapsed: 0, impactSpeed: 0, deflectionY: 0, normalForceN: 0 };
    this.weaponState = createWeaponPickupState();
    this.loadoutPreset = resolveArmLoadoutPreset(1);
    this.shieldState = createShieldState();
    this.shieldNodes = { group: null, barrierMesh: null, barrierMat: null, frameMat: null, saberRightGroup: null, saberRightBlade: null };
    this.parryRecoil = { active: false, t: 0, duration: 0.42 };
    this.dummyFireTimer = 2.6;
    this.prevBoostActive = false;
    this.playerHp = 1000;
    this.playerMaxHp = 1000;
    this.pistolCooldown = 0;
    this.pistolRecoil = 0;
    this.mouseSwipe = { x: 0, y: 0 };
    this.saberSwing = { active: false, t: 0, duration: 0.44, combo: 0, dir: 'LR', angleRad: 0.15, hitRegistered: false };
    this.hitstopTimer = 0;
    this.cameraShake = 0;
    this.score = { destroyed: 0, mcEarned: 0, dummyKills: 0 };
    this.jetIntensitySmooth = 0;

    // Skin state
    this.activeSkinId = 'SKIN-01';
    this.customPalette = null;

    // Input state
    this.keys = new Set();
    this.rmbHeld = false;
    this.ignoreMouseDeltaUntil = 0;
    this.discardNextMoves = 0;
    this.requestDropFlag = false;
    this.requestPickupFlag = false;
    this.requestShootFlag = false;
    this.requestSlashFlag = false;

    // Scene handles
    this.mechaRoot = new THREE.Group();
    this.scene.add(this.mechaRoot);
    this.bones = {};
    this.weaponNodes = { pistol: null, saberHilt: null, saberBlade: null };
    this.saberFx = { auraMesh: null, auraMat: null, light: null, midLocal: new THREE.Vector3(), tipLocal: new THREE.Vector3() };
    this.thrusterPlumes = [];
    this.plumeMats = [];
    this.fpsHideNodes = [];
    this.cockpitGroup = null;
    this.cockpitMaterials = null;
    this.cockpitScreens = { leftCtx: null, leftTex: null, rightCtx: null, rightTex: null, timer: 0 };
    this.cockpitSticks = { left: null, right: null };
    this.groundDropGroup = new THREE.Group();
    this.scene.add(this.groundDropGroup);
    this.droppedTemplates = { pistol: null, saberHilt: null };
    this.droppedMeshes = [];

    this.destructibles = [];
    this.dummy = null;

    this._setupLighting();
    this._buildNeoTokyoCity();
    this._buildTargetDummy();
    this._bindInputs();
    this._loadValiantGlb();

    this.lastTime = performance.now();
    this._animate = this._animate.bind(this);
    requestAnimationFrame(this._animate);
  }

  _setupLighting() {
    const hemi = new THREE.HemisphereLight('#b8dbff', '#5c626a', 1.15);
    this.scene.add(hemi);

    const sun = new THREE.DirectionalLight('#fff2da', 2.45);
    sun.position.set(26, 42, 20);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    sun.shadow.camera.near = 2;
    sun.shadow.camera.far = 135;
    sun.shadow.bias = -0.0005;
    const d = 48;
    sun.shadow.camera.left = -d;
    sun.shadow.camera.right = d;
    sun.shadow.camera.top = d;
    sun.shadow.camera.bottom = -d;
    this.scene.add(sun);

    const frontFill = new THREE.DirectionalLight('#a2c8f4', 0.62);
    frontFill.position.set(-14, 16, -24);
    this.scene.add(frontFill);

    this.sceneLights = { hemi, sun, frontFill };
  }

  setLightingMode(mode = 'daylight') {
    this.lightingMode = mode === 'night' ? 'night' : 'daylight';
    const isDay = this.lightingMode === 'daylight';
    this.scene.background.set(isDay ? '#80b2e6' : '#090e16');
    this.scene.fog.color.set(isDay ? '#c4d7eb' : '#090e16');
    this.scene.fog.density = isDay ? 0.0045 : 0.0082;
    this.renderer.toneMappingExposure = isDay ? 1.06 : 1.15;
    this.scene.environmentIntensity = isDay ? 0.72 : 0.65;
    this.bloomPass.strength = isDay ? 0.28 : 0.36;

    if (this.sceneLights.hemi) {
      this.sceneLights.hemi.color.set(isDay ? '#b8dbff' : '#94b8de');
      this.sceneLights.hemi.groundColor.set(isDay ? '#5c626a' : '#1b2230');
      this.sceneLights.hemi.intensity = isDay ? 1.15 : 0.85;
    }
    if (this.sceneLights.sun) {
      this.sceneLights.sun.color.set(isDay ? '#fff2da' : '#dbe8ff');
      this.sceneLights.sun.intensity = isDay ? 2.45 : 1.95;
    }
    if (this.sceneLights.frontFill) {
      this.sceneLights.frontFill.color.set(isDay ? '#a2c8f4' : '#80c8ff');
      this.sceneLights.frontFill.intensity = isDay ? 0.62 : 0.55;
    }
    if (this.cityMaterials.floorMat) {
      this.cityMaterials.floorMat.color.set(isDay ? '#6d737b' : '#161d27');
    }
    if (this.cityMaterials.skyDome) {
      this.cityMaterials.skyDome.visible = isDay;
    }
    this.ui.showToast?.(isDay ? '切換至：哥吉拉晴空東京 2.0 (日間)' : '切換至：新東京夜間作戰環境');
  }

  _getFacadeTexture(styleId, baseHex) {
    const key = `${styleId}|${baseHex}`;
    if (this.cityTextureCache[key]) return this.cityTextureCache[key];

    const w = 256;
    const h = 256;
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');

    ctx.fillStyle = baseHex;
    ctx.fillRect(0, 0, w, h);

    if (styleId === 'brick_shop') {
      // Subtle terracotta brick courses + crisp dark recessed storefront windows
      ctx.fillStyle = 'rgba(0,0,0,0.08)';
      for (let y = 0; y < h; y += 8) ctx.fillRect(0, y, w, 1);
      for (let row = 0; row < 6; row++) {
        const wy = 20 + row * 38;
        for (let col = 0; col < 5; col++) {
          const wx = 14 + col * 48;
          ctx.fillStyle = '#222933';
          ctx.fillRect(wx, wy, 30, 22);
          ctx.fillStyle = 'rgba(135,175,215,0.22)';
          ctx.fillRect(wx + 2, wy + 2, 26, 8);
          ctx.fillStyle = 'rgba(255,255,255,0.12)';
          ctx.fillRect(wx, wy + 22, 30, 2);
        }
      }
    } else if (styleId === 'blue_curtain') {
      // Modern Japanese glass curtain skyscraper facade
      for (let row = 0; row < 10; row++) {
        const wy = 8 + row * 25;
        ctx.fillStyle = '#233b58';
        ctx.fillRect(6, wy, w - 12, 16);
        const grad = ctx.createLinearGradient(0, wy, 0, wy + 16);
        grad.addColorStop(0, 'rgba(170,212,248,0.42)');
        grad.addColorStop(1, 'rgba(30,52,82,0.18)');
        ctx.fillStyle = grad;
        ctx.fillRect(6, wy, w - 12, 16);
      }
      ctx.fillStyle = 'rgba(220,234,248,0.34)';
      for (let x = 0; x < w; x += 32) ctx.fillRect(x, 0, 3, h);
    } else {
      // cream_office / slate_tower concrete grid windows
      for (let row = 0; row < 8; row++) {
        const wy = 12 + row * 30;
        ctx.fillStyle = 'rgba(0,0,0,0.12)';
        ctx.fillRect(0, wy - 3, w, 2);
        for (let col = 0; col < 6; col++) {
          const wx = 10 + col * 40;
          ctx.fillStyle = '#1c232d';
          ctx.fillRect(wx, wy, 28, 17);
          ctx.fillStyle = row % 3 === 0 ? 'rgba(250,236,195,0.24)' : 'rgba(145,185,225,0.22)';
          ctx.fillRect(wx + 2, wy + 2, 24, 7);
        }
      }
    }

    const tex = new THREE.CanvasTexture(canvas);
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.RepeatWrapping;
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.needsUpdate = true;
    this.cityTextureCache[key] = tex;
    return tex;
  }

  _getJapaneseSignTexture(text, bgCol, fgCol) {
    const key = `sign|${text}|${bgCol}`;
    if (this.cityTextureCache[key]) return this.cityTextureCache[key];
    const canvas = document.createElement('canvas');
    canvas.width = 96;
    canvas.height = 256;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = bgCol;
    ctx.fillRect(0, 0, 96, 256);
    ctx.strokeStyle = fgCol;
    ctx.lineWidth = 4;
    ctx.strokeRect(4, 4, 88, 248);
    ctx.fillStyle = fgCol;
    ctx.font = 'bold 28px "Meiryo", "Microsoft JhengHei", sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const chars = [...text];
    const step = 216 / Math.max(1, chars.length);
    chars.forEach((ch, idx) => {
      ctx.fillText(ch, 48, 28 + step * (idx + 0.5));
    });
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.needsUpdate = true;
    this.cityTextureCache[key] = tex;
    return tex;
  }

  _buildNeoTokyoCity() {
    this.arenaGroup = new THREE.Group();
    this.scene.add(this.arenaGroup);

    // Matte urban concrete ground deck (far wider for skyline horizon depth)
    const floorGeo = new THREE.CircleGeometry(132, 64);
    floorGeo.rotateX(-Math.PI / 2);
    const floorMat = new THREE.MeshStandardMaterial({
      color: '#6d737b',
      roughness: 0.9,
      metalness: 0.08,
    });
    this.cityMaterials.floorMat = floorMat;
    const floor = new THREE.Mesh(floorGeo, floorMat);
    floor.receiveShadow = true;
    this.arenaGroup.add(floor);

    // Subtle tactical combat boundary ring (amber industrial marking instead of neon sci-fi grid)
    const ringGeo = new THREE.RingGeometry(ARENA_RADIUS - 0.28, ARENA_RADIUS, 72);
    ringGeo.rotateX(-Math.PI / 2);
    const ringMat = new THREE.MeshBasicMaterial({ color: '#dfa838', side: THREE.DoubleSide, transparent: true, opacity: 0.72 });
    const ring = new THREE.Mesh(ringGeo, ringMat);
    ring.position.y = 0.018;
    this.arenaGroup.add(ring);

    // Multi-lane Japanese asphalt roads + raised concrete sidewalk curbs
    const asphaltMat = new THREE.MeshStandardMaterial({ color: '#2b3038', roughness: 0.88, metalness: 0.06 });
    const curbMat = new THREE.MeshStandardMaterial({ color: '#8a9099', roughness: 0.86, metalness: 0.05 });
    const avenues = [
      { pos: 0, width: 6.4, len: 164 },
      { pos: 19.0, width: 3.8, len: 156 },
      { pos: -19.0, width: 3.8, len: 156 },
    ];
    for (const av of avenues) {
      for (const isEW of [false, true]) {
        const sw = new THREE.Mesh(new THREE.PlaneGeometry(av.width + 1.0, av.len), curbMat);
        sw.rotation.x = -Math.PI / 2;
        if (isEW) sw.rotation.z = Math.PI / 2;
        sw.position.set(isEW ? 0 : av.pos, 0.008, isEW ? av.pos : 0);
        sw.receiveShadow = true;
        this.arenaGroup.add(sw);

        const road = new THREE.Mesh(new THREE.PlaneGeometry(av.width, av.len), asphaltMat);
        road.rotation.x = -Math.PI / 2;
        if (isEW) road.rotation.z = Math.PI / 2;
        road.position.set(isEW ? 0 : av.pos, 0.012, isEW ? av.pos : 0);
        road.receiveShadow = true;
        this.arenaGroup.add(road);
      }
    }

    // Road lane stripes + zebra crosswalks rendered with a single InstancedMesh
    const stripeMatrices = [];
    const dummyObj = new THREE.Object3D();
    const pushStripe = (x, z, w, l) => {
      dummyObj.position.set(x, 0.016, z);
      dummyObj.rotation.set(0, 0, 0);
      dummyObj.scale.set(w, 1, l);
      dummyObj.updateMatrix();
      stripeMatrices.push(dummyObj.matrix.clone());
    };
    // Center medians & broken lane dashes on N-S & E-W main avenues
    for (let d = -68; d <= 68; d += 3.2) {
      if (Math.abs(d) < 4.5 || Math.abs(Math.abs(d) - 19) < 3.0) continue;
      pushStripe(0, d, 0.14, 1.8);
      pushStripe(1.6, d, 0.09, 1.3);
      pushStripe(-1.6, d, 0.09, 1.3);
      pushStripe(d, 0, 1.8, 0.14);
      pushStripe(d, 1.6, 1.3, 0.09);
      pushStripe(d, -1.6, 1.3, 0.09);
    }
    // Zebra crosswalks around central (0,0) and outer (+/-19) intersections
    for (const cx of [-19, 0, 19]) {
      for (const cz of [-19, 0, 19]) {
        const hw = cx === 0 ? 3.0 : 1.75;
        const hd = cz === 0 ? 3.0 : 1.75;
        for (let t = -hw + 0.35; t <= hw - 0.35; t += 0.56) {
          pushStripe(cx + t, cz + hd + 1.0, 0.26, 1.1);
          pushStripe(cx + t, cz - hd - 1.0, 0.26, 1.1);
        }
        for (let t = -hd + 0.35; t <= hd - 0.35; t += 0.56) {
          pushStripe(cx + hw + 1.0, cz + t, 1.1, 0.26);
          pushStripe(cx - hw - 1.0, cz + t, 1.1, 0.26);
        }
      }
    }
    const stripeMesh = new THREE.InstancedMesh(
      new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2),
      new THREE.MeshBasicMaterial({ color: '#eef2f6' }),
      stripeMatrices.length,
    );
    stripeMatrices.forEach((m, i) => stripeMesh.setMatrixAt(i, m));
    stripeMesh.instanceMatrix.needsUpdate = true;
    this.arenaGroup.add(stripeMesh);

    this._spawnStreetPropsInstanced();
    this._spawnSkylineInstanced();
    this._spawnBuildings();
  }

  _mergeSimpleGeos(geos) {
    const nonIdx = geos.map((g) => (g.index ? g.toNonIndexed() : g));
    let totalVerts = 0;
    for (const g of nonIdx) totalVerts += g.attributes.position.count;
    const posArr = new Float32Array(totalVerts * 3);
    const normArr = new Float32Array(totalVerts * 3);
    let offset = 0;
    for (const g of nonIdx) {
      g.computeVertexNormals();
      posArr.set(g.attributes.position.array, offset);
      normArr.set(g.attributes.normal.array, offset);
      offset += g.attributes.position.count * 3;
    }
    const merged = new THREE.BufferGeometry();
    merged.setAttribute('position', new THREE.BufferAttribute(posArr, 3));
    merged.setAttribute('normal', new THREE.BufferAttribute(normArr, 3));
    return merged;
  }

  _buildRealisticCarGeometries() {
    // Sleek Japanese sedan silhouette extruded along X and centered cleanly (facing +Z)
    const prof = new THREE.Shape();
    prof.moveTo(-0.27, 0.035);
    prof.lineTo(0.27, 0.035);
    prof.lineTo(0.28, 0.095);
    prof.lineTo(0.24, 0.128);
    prof.lineTo(0.11, 0.138);
    prof.lineTo(0.03, 0.215);
    prof.lineTo(-0.13, 0.215);
    prof.lineTo(-0.22, 0.145);
    prof.lineTo(-0.27, 0.132);
    prof.closePath();

    const bodyGeo = new THREE.ExtrudeGeometry(prof, {
      depth: 0.21,
      bevelEnabled: true,
      bevelThickness: 0.014,
      bevelSize: 0.012,
      bevelSegments: 2,
    });
    // Currently X=shapeZ, Y=shapeY, Z=extrudeWidth -> rotate -PI/2 around Y so front (+X) points +Z
    bodyGeo.translate(0, 0, -0.105);
    bodyGeo.rotateY(-Math.PI * 0.5);

    // 4 wheels + tinted wraparound cabin windshield/glass trim
    const parts = [];
    for (const wx of [-0.112, 0.112]) {
      for (const wz of [-0.165, 0.165]) {
        const wh = new THREE.CylinderGeometry(0.044, 0.044, 0.036, 10);
        wh.rotateZ(Math.PI * 0.5);
        wh.translate(wx, 0.044, wz);
        parts.push(wh);
      }
    }
    const glassBand = new THREE.BoxGeometry(0.218, 0.068, 0.235);
    glassBand.translate(0, 0.168, -0.045);
    parts.push(glassBand);
    const grille = new THREE.BoxGeometry(0.14, 0.036, 0.02);
    grille.translate(0, 0.072, 0.28);
    parts.push(grille);
    const trimGeo = this._mergeSimpleGeos(parts);

    // Dual front headlights + rear taillight strip
    const lParts = [];
    for (const lx of [-0.076, 0.076]) {
      const hl = new THREE.BoxGeometry(0.046, 0.022, 0.015);
      hl.translate(lx, 0.088, 0.282);
      lParts.push(hl);
    }
    const tl = new THREE.BoxGeometry(0.18, 0.022, 0.014);
    tl.translate(0, 0.102, -0.276);
    lParts.push(tl);
    const lightGeo = this._mergeSimpleGeos(lParts);

    return { bodyGeo, trimGeo, lightGeo };
  }

  _spawnStreetPropsInstanced() {
    // 1. Unified realistic parked + moving Japanese cars (destructible by weapons OR mecha stomp!)
    this.cars = [];
    const carPalette = ['#eef2f6', '#2b3440', '#b23b3b', '#4c6582', '#deb83c', '#6d7782', '#f4f6f8'];

    const addParked = (x, z, yaw, idxBias = 0) => {
      this.cars.push({
        id: `car_p_${this.cars.length}`,
        isMoving: false,
        x,
        y: 0,
        z,
        initX: x,
        initZ: z,
        initYaw: yaw,
        yaw,
        colorHex: carPalette[(this.cars.length + idxBias) % carPalette.length],
        hp: 28,
        maxHp: 28,
        radius: 0.34,
        state: 'intact',
        vx: 0,
        vy: 0,
        vz: 0,
        rx: 0,
        ry: yaw,
        rz: 0,
        rotVelX: 0,
        rotVelZ: 0,
        smokeTimer: 0,
      });
    };

    for (const d of [-30, -25, -14, 14.5, 24, 31, -36, 36]) {
      addParked(-2.4, d, 0, 0);
      addParked(2.4, -d + 1.8, Math.PI, 1);
      addParked(d + 1.2, 2.3, Math.PI * 0.5, 2);
      addParked(-d, -2.3, -Math.PI * 0.5, 3);
    }
    for (const sgn of [-1, 1]) {
      for (const p of [-11, -5, 6, 12.5, 25]) {
        addParked(sgn * 19 - 1.2, p, 0, 4);
        addParked(p, sgn * 19 + 1.2, Math.PI * 0.5, 5);
      }
    }
    const movPalette = ['#f2f4f7', '#c43e3e', '#e2bc38', '#344254', '#72889c', '#2a3038'];
    for (let i = 0; i < 6; i++) {
      const zAxisDir = i % 2 === 0 ? 1 : -1;
      const laneX = i % 2 === 0 ? 19.8 : -19.8;
      const tz = -58 + i * 21;
      this.cars.push({
        id: `car_m_z_${i}`,
        isMoving: true,
        axis: 'z',
        laneX,
        laneZ: 0,
        dir: zAxisDir,
        t: tz,
        initT: tz,
        speed: 3.2 + (i % 3) * 0.8,
        x: laneX,
        y: 0,
        z: tz,
        yaw: zAxisDir > 0 ? 0 : Math.PI,
        initYaw: zAxisDir > 0 ? 0 : Math.PI,
        colorHex: movPalette[i % movPalette.length],
        hp: 28,
        maxHp: 28,
        radius: 0.34,
        state: 'intact',
        vx: 0,
        vy: 0,
        vz: 0,
        rx: 0,
        ry: zAxisDir > 0 ? 0 : Math.PI,
        rz: 0,
        rotVelX: 0,
        rotVelZ: 0,
        smokeTimer: 0,
      });

      const xAxisDir = i % 2 === 0 ? 1 : -1;
      const laneZ = i % 2 === 0 ? -19.8 : 19.8;
      const tx = -54 + i * 19;
      this.cars.push({
        id: `car_m_x_${i}`,
        isMoving: true,
        axis: 'x',
        laneX: 0,
        laneZ,
        dir: xAxisDir,
        t: tx,
        initT: tx,
        speed: 3.4 + (i % 2) * 0.9,
        x: tx,
        y: 0,
        z: laneZ,
        yaw: xAxisDir > 0 ? Math.PI * 0.5 : -Math.PI * 0.5,
        initYaw: xAxisDir > 0 ? Math.PI * 0.5 : -Math.PI * 0.5,
        colorHex: movPalette[(i + 2) % movPalette.length],
        hp: 28,
        maxHp: 28,
        radius: 0.34,
        state: 'intact',
        vx: 0,
        vy: 0,
        vz: 0,
        rx: 0,
        ry: xAxisDir > 0 ? Math.PI * 0.5 : -Math.PI * 0.5,
        rz: 0,
        rotVelX: 0,
        rotVelZ: 0,
        smokeTimer: 0,
      });
    }

    const { bodyGeo, trimGeo, lightGeo } = this._buildRealisticCarGeometries();
    const carBodyMesh = new THREE.InstancedMesh(
      bodyGeo,
      new THREE.MeshStandardMaterial({ roughness: 0.34, metalness: 0.56 }),
      this.cars.length,
    );
    const carTrimMesh = new THREE.InstancedMesh(
      trimGeo,
      new THREE.MeshStandardMaterial({ color: '#171d24', roughness: 0.28, metalness: 0.45 }),
      this.cars.length,
    );
    const carLightMesh = new THREE.InstancedMesh(
      lightGeo,
      new THREE.MeshStandardMaterial({ color: '#fff3d6', emissive: '#ffcf70', emissiveIntensity: 1.4 }),
      this.cars.length,
    );
    carBodyMesh.castShadow = true;
    const dObj = new THREE.Object3D();
    const tmpCol = new THREE.Color();
    this.cars.forEach((c, i) => {
      c.instIdx = i;
      dObj.position.set(c.x, 0, c.z);
      dObj.rotation.set(0, c.yaw, 0);
      dObj.scale.set(1, 1, 1);
      dObj.updateMatrix();
      carBodyMesh.setMatrixAt(i, dObj.matrix);
      carTrimMesh.setMatrixAt(i, dObj.matrix);
      carLightMesh.setMatrixAt(i, dObj.matrix);
      tmpCol.set(c.colorHex);
      carBodyMesh.setColorAt(i, tmpCol);
    });
    carBodyMesh.instanceMatrix.needsUpdate = true;
    carTrimMesh.instanceMatrix.needsUpdate = true;
    carLightMesh.instanceMatrix.needsUpdate = true;
    if (carBodyMesh.instanceColor) carBodyMesh.instanceColor.needsUpdate = true;
    this.arenaGroup.add(carBodyMesh, carTrimMesh, carLightMesh);
    this.carInst = { bodyMesh: carBodyMesh, trimMesh: carTrimMesh, lightMesh: carLightMesh };

    // 2. Miniature street trees along sidewalks
    const treeSpots = [];
    for (let d = -34; d <= 34; d += 4.2) {
      if (Math.abs(d) < 5.0 || Math.abs(Math.abs(d) - 19) < 3.2) continue;
      treeSpots.push([3.55, d], [-3.55, d], [d, 3.55], [d, -3.55]);
    }
    const trunkMesh = new THREE.InstancedMesh(
      new THREE.CylinderGeometry(0.03, 0.04, 0.28, 6),
      new THREE.MeshStandardMaterial({ color: '#4c3a2b', roughness: 0.9 }),
      treeSpots.length,
    );
    const crownMesh = new THREE.InstancedMesh(
      new THREE.DodecahedronGeometry(0.22, 0),
      new THREE.MeshStandardMaterial({ roughness: 0.85 }),
      treeSpots.length,
    );
    treeSpots.forEach(([x, z], i) => {
      const s = 0.88 + (i % 3) * 0.14;
      dObj.position.set(x, 0.14, z);
      dObj.rotation.set(0, i * 0.8, 0);
      dObj.scale.set(1, 1, 1);
      dObj.updateMatrix();
      trunkMesh.setMatrixAt(i, dObj.matrix);

      dObj.position.set(x, 0.34 * s, z);
      dObj.scale.set(s, s * 1.12, s);
      dObj.updateMatrix();
      crownMesh.setMatrixAt(i, dObj.matrix);
      tmpCol.set(i % 2 === 0 ? '#3f6a34' : '#4d7c3f');
      crownMesh.setColorAt(i, tmpCol);
    });
    crownMesh.castShadow = true;
    trunkMesh.instanceMatrix.needsUpdate = true;
    crownMesh.instanceMatrix.needsUpdate = true;
    if (crownMesh.instanceColor) crownMesh.instanceColor.needsUpdate = true;
    this.arenaGroup.add(trunkMesh, crownMesh);

    this._spawnUrbanLandmarksAndTraffic();
  }

  _spawnUrbanLandmarksAndTraffic() {
    // 1. Daylight Gradient Sky Dome (clear cobalt zenith -> warm sunlit horizon haze)
    const skyMat = new THREE.ShaderMaterial({
      uniforms: {},
      vertexShader: `
        varying vec3 vWorldPos;
        void main() {
          vec4 wp = modelMatrix * vec4(position, 1.0);
          vWorldPos = wp.xyz;
          gl_Position = projectionMatrix * viewMatrix * wp;
        }
      `,
      fragmentShader: `
        varying vec3 vWorldPos;
        void main() {
          float h = clamp(normalize(vWorldPos).y, 0.0, 1.0);
          vec3 horizon = vec3(0.83, 0.89, 0.96);
          vec3 midSky = vec3(0.49, 0.70, 0.91);
          vec3 zenith = vec3(0.28, 0.52, 0.84);
          vec3 col = mix(horizon, midSky, smoothstep(0.0, 0.24, h));
          col = mix(col, zenith, smoothstep(0.24, 0.78, h));
          gl_FragColor = vec4(col, 1.0);
        }
      `,
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
    });
    const skyDome = new THREE.Mesh(new THREE.SphereGeometry(185, 24, 16), skyMat);
    this.cityMaterials.skyDome = skyDome;
    this.arenaGroup.add(skyDome);

    // 2. Pedestrian Overpass ("行人天橋") spanning main N-S avenue north of target dummy
    const steelMat = new THREE.MeshStandardMaterial({ color: '#c4cad2', roughness: 0.52, metalness: 0.45 });
    const railMat = new THREE.MeshStandardMaterial({ color: '#455972', roughness: 0.45, metalness: 0.5 });
    const deck = new THREE.Mesh(new THREE.BoxGeometry(8.6, 0.18, 1.05), steelMat);
    deck.position.set(0, 2.95, -17.5);
    deck.castShadow = true;
    deck.receiveShadow = true;
    this.arenaGroup.add(deck);
    for (const rz of [-0.48, 0.48]) {
      const rail = new THREE.Mesh(new THREE.BoxGeometry(8.6, 0.22, 0.05), railMat);
      rail.position.set(0, 3.15, -17.5 + rz);
      this.arenaGroup.add(rail);
    }
    for (const sx of [-3.95, 3.95]) {
      const pier = new THREE.Mesh(new THREE.BoxGeometry(0.28, 2.95, 0.34), steelMat);
      pier.position.set(sx, 1.475, -17.5);
      pier.castShadow = true;
      this.arenaGroup.add(pier);
    }

    // 3. Intersection Traffic Signals & Streetlamps
    const poleSpots = [
      [3.55, 3.55],
      [-3.55, 3.55],
      [3.55, -3.55],
      [-3.55, -3.55],
      [21.2, 2.4],
      [-21.2, -2.4],
      [2.4, -21.2],
      [-2.4, 21.2],
    ];
    const poleMesh = new THREE.InstancedMesh(
      new THREE.CylinderGeometry(0.035, 0.045, 0.95, 6),
      new THREE.MeshStandardMaterial({ color: '#39414a', metalness: 0.65, roughness: 0.4 }),
      poleSpots.length,
    );
    const armMesh = new THREE.InstancedMesh(
      new THREE.BoxGeometry(0.55, 0.06, 0.08),
      new THREE.MeshStandardMaterial({ color: '#2b323b', metalness: 0.6, roughness: 0.45 }),
      poleSpots.length,
    );
    const dObj = new THREE.Object3D();
    poleSpots.forEach(([px, pz], i) => {
      dObj.position.set(px, 0.475, pz);
      dObj.rotation.set(0, 0, 0);
      dObj.updateMatrix();
      poleMesh.setMatrixAt(i, dObj.matrix);

      dObj.position.set(px + (px > 0 ? -0.22 : 0.22), 0.9, pz);
      dObj.updateMatrix();
      armMesh.setMatrixAt(i, dObj.matrix);
    });
    poleMesh.instanceMatrix.needsUpdate = true;
    armMesh.instanceMatrix.needsUpdate = true;
    this.arenaGroup.add(poleMesh, armMesh);

    // 4. Iconic Red-White Tokyo Landmark Tower in northern horizon skyline
    const tGroup = new THREE.Group();
    tGroup.position.set(-22, 0, -76);
    const towerRed = new THREE.MeshStandardMaterial({ color: '#c83e2b', roughness: 0.48, metalness: 0.35 });
    const towerWhite = new THREE.MeshStandardMaterial({ color: '#eceef2', roughness: 0.5, metalness: 0.25 });
    const tiers = [
      [3.6, 1.8, 5.2, towerRed, 2.6],
      [1.8, 1.0, 5.4, towerWhite, 7.8],
      [2.1, 2.1, 0.85, towerRed, 10.6],
      [0.95, 0.42, 6.2, towerRed, 14.0],
      [0.14, 0.04, 4.4, towerWhite, 19.2],
    ];
    for (const [rb, rt, h, mat, cy] of tiers) {
      const m = new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, 4), mat);
      m.rotation.y = Math.PI * 0.25;
      m.position.y = cy;
      tGroup.add(m);
    }
    this.arenaGroup.add(tGroup);

    // 5. Dense Midground Japanese Neighborhood Infill (112 x 2-5F buildings filling horizon floor)
    const infillItems = [];
    let seed = 8801;
    const rand = () => {
      seed = (seed * 16807) % 2147483647;
      return (seed - 1) / 2147483646;
    };
    for (let i = 0; i < 112; i++) {
      const ang = (i / 112) * Math.PI * 2 + (rand() - 0.5) * 0.06;
      const dist = 25.5 + rand() * 31.0;
      const x = Math.cos(ang) * dist;
      const z = Math.sin(ang) * dist;
      if (Math.abs(x) < 5.6 || Math.abs(z) < 5.6) continue;
      if (Math.abs(Math.abs(x) - 19) < 3.9 || Math.abs(Math.abs(z) - 19) < 3.9) continue;
      infillItems.push({
        x,
        z,
        w: 2.3 + rand() * 2.2,
        d: 2.3 + rand() * 2.2,
        h: 1.2 + rand() * 2.7,
        style: i % 3,
      });
    }
    const infillStyles = [
      { id: 'brick_shop', hex: '#8e5d4f', rough: 0.78, metal: 0.1 },
      { id: 'cream_office', hex: '#d5cec0', rough: 0.72, metal: 0.12 },
      { id: 'slate_tower', hex: '#586270', rough: 0.62, metal: 0.22 },
    ];
    infillStyles.forEach((st, idx) => {
      const bkt = infillItems.filter((it) => it.style === idx);
      if (!bkt.length) return;
      const mesh = new THREE.InstancedMesh(
        new THREE.BoxGeometry(1, 1, 1),
        new THREE.MeshStandardMaterial({ map: this._getFacadeTexture(st.id, st.hex), roughness: st.rough, metalness: st.metal }),
        bkt.length,
      );
      bkt.forEach((it, j) => {
        dObj.position.set(it.x, it.h * 0.5, it.z);
        dObj.rotation.set(0, 0, 0);
        dObj.scale.set(it.w, it.h, it.d);
        dObj.updateMatrix();
        mesh.setMatrixAt(j, dObj.matrix);

        if (Math.hypot(it.x, it.z) <= ARENA_RADIUS + 6.5) {
          const hp = computeBuildingDurability(it.w, it.d, it.h);
          this.instancedDestructibles.push({
            id: `infill_${idx}_${j}`,
            isInstanced: true,
            instMesh: mesh,
            instanceIdx: j,
            origMatrix: dObj.matrix.clone(),
            styleSpec: st,
            group: null,
            bodyMat: null,
            x: it.x,
            z: it.z,
            w: it.w,
            d: it.d,
            halfW: it.w * 0.5,
            halfD: it.d * 0.5,
            height: it.h,
            hp,
            maxHp: hp,
            state: 'intact',
            collapseProgress: 0,
            collapseDirX: ((j + idx) % 2 === 0 ? 1 : -1) * 0.52,
            collapseDirZ: (j % 3 === 0 ? -1 : 1) * 0.42,
            dustAccum: 0,
            boomAccum: 0,
          });
        }
      });
      mesh.receiveShadow = true;
      mesh.instanceMatrix.needsUpdate = true;
      this.arenaGroup.add(mesh);
    });
  }

  _spawnSkylineInstanced() {
    // 76 outer Tokyo skyscrapers encircling the arena horizon (R = 32..86m) in 3 InstancedMesh batches
    const towers = [];
    let seed = 4242;
    const rand = () => {
      seed = (seed * 16807) % 2147483647;
      return (seed - 1) / 2147483646;
    };

    for (let i = 0; i < 76; i++) {
      const angle = (i / 76) * Math.PI * 2 + (rand() - 0.5) * 0.05;
      const dist = 34 + (i % 3) * 14 + rand() * 14;
      const x = Math.cos(angle) * dist;
      const z = Math.sin(angle) * dist;
      // Keep main cross avenues unobstructed toward the distant horizon!
      if (Math.abs(x) < 5.2 || Math.abs(z) < 5.2) continue;
      if (Math.abs(Math.abs(x) - 19) < 3.6 || Math.abs(Math.abs(z) - 19) < 3.6) continue;
      towers.push({
        x,
        z,
        w: 3.0 + rand() * 2.8,
        d: 3.0 + rand() * 2.8,
        h: 6.2 + (i % 4) * 2.4 + rand() * 5.2,
        style: i % 3,
      });
    }

    const styles = [
      { id: 'blue_curtain', hex: '#7195bc', metal: 0.45, rough: 0.35 },
      { id: 'cream_office', hex: '#d3ccbf', metal: 0.12, rough: 0.72 },
      { id: 'slate_tower', hex: '#545f6d', metal: 0.24, rough: 0.58 },
    ];
    const dObj = new THREE.Object3D();

    styles.forEach((st, sIdx) => {
      const bucket = towers.filter((t) => t.style === sIdx);
      if (!bucket.length) return;
      const tex = this._getFacadeTexture(st.id, st.hex);
      const mesh = new THREE.InstancedMesh(
        new THREE.BoxGeometry(1, 1, 1),
        new THREE.MeshStandardMaterial({ map: tex, metalness: st.metal, roughness: st.rough }),
        bucket.length,
      );
      bucket.forEach((t, i) => {
        dObj.position.set(t.x, t.h * 0.5, t.z);
        dObj.rotation.set(0, 0, 0);
        dObj.scale.set(t.w, t.h, t.d);
        dObj.updateMatrix();
        mesh.setMatrixAt(i, dObj.matrix);

        // Register any tower within playable boundary reach as solid & super-durable destructible
        if (Math.hypot(t.x, t.z) <= ARENA_RADIUS + 6.5) {
          const hp = computeBuildingDurability(t.w, t.d, t.h);
          this.instancedDestructibles.push({
            id: `tower_${sIdx}_${i}`,
            isInstanced: true,
            instMesh: mesh,
            instanceIdx: i,
            origMatrix: dObj.matrix.clone(),
            styleSpec: st,
            group: null,
            bodyMat: null,
            x: t.x,
            z: t.z,
            w: t.w,
            d: t.d,
            halfW: t.w * 0.5,
            halfD: t.d * 0.5,
            height: t.h,
            hp,
            maxHp: hp,
            state: 'intact',
            collapseProgress: 0,
            collapseDirX: ((i + sIdx) % 2 === 0 ? 1 : -1) * 0.48,
            collapseDirZ: (i % 3 === 0 ? 1 : -1) * 0.44,
            dustAccum: 0,
            boomAccum: 0,
          });
        }
      });
      mesh.receiveShadow = true;
      mesh.instanceMatrix.needsUpdate = true;
      this.arenaGroup.add(mesh);
    });
  }

  _promoteInstancedBuilding(b) {
    if (!b || !b.isInstanced) return;
    // Hide the static instance slot cleanly
    const hideM = new THREE.Matrix4().makeScale(0, 0, 0);
    b.instMesh.setMatrixAt(b.instanceIdx, hideM);
    b.instMesh.instanceMatrix.needsUpdate = true;
    b.isInstanced = false;

    const grp = new THREE.Group();
    grp.position.set(b.x, 0, b.z);
    const st = b.styleSpec || { id: 'slate_tower', hex: '#586270', rough: 0.62, metal: 0.22 };
    const bodyMat = new THREE.MeshStandardMaterial({
      map: this._getFacadeTexture(st.id, st.hex),
      color: '#ffffff',
      roughness: st.rough ?? 0.65,
      metalness: st.metal ?? 0.2,
    });
    const body = new THREE.Mesh(new THREE.BoxGeometry(b.w, b.height, b.d), bodyMat);
    body.position.y = b.height * 0.5;
    body.receiveShadow = true;
    body.castShadow = true;
    grp.add(body);

    const roofParapet = new THREE.Mesh(
      new THREE.BoxGeometry(b.w + 0.08, 0.12, b.d + 0.08),
      new THREE.MeshStandardMaterial({ color: '#494f57', roughness: 0.85 }),
    );
    roofParapet.position.y = b.height + 0.04;
    grp.add(roofParapet);

    this.arenaGroup.add(grp);
    b.group = grp;
    b.bodyMat = bodyMat;
  }

  _spawnBuildings() {
    for (const b of this.destructibles) {
      if (b.group) {
        this.arenaGroup.remove(b.group);
        b.group = null;
      }
    }
    this.destructibles = [];

    // Restore all instanced midground/skyline buildings back to pristine state cleanly
    for (const ib of this.instancedDestructibles) {
      ib.hp = ib.maxHp;
      ib.state = 'intact';
      ib.collapseProgress = 0;
      ib.dustAccum = 0;
      ib.boomAccum = 0;
      ib.bodyMat = null;
      ib.isInstanced = true;
      ib.instMesh.setMatrixAt(ib.instanceIdx, ib.origMatrix);
      ib.instMesh.instanceMatrix.needsUpdate = true;
      this.destructibles.push(ib);
    }

    // [x, z, w, h, d, styleId, bodyHex, signLabel]
    const layout = [
      [-10.2, -5.2, 3.6, 2.2, 3.2, 'brick_shop', '#8f5d4e', 'アーケード'],
      [-14.2, -11.8, 3.8, 2.85, 3.6, 'cream_office', '#d7d0c3', '新東京百貨'],
      [-7.2, -13.8, 3.0, 1.95, 3.0, 'slate_tower', '#55606e', '電器街'],
      [10.4, -5.4, 3.6, 2.45, 3.4, 'cream_office', '#d2cabd', '珈琲 喫茶'],
      [14.4, -12.2, 4.0, 3.0, 3.8, 'brick_shop', '#845446', '書店本館'],
      [7.4, -14.0, 2.9, 1.85, 2.9, 'blue_curtain', '#6789ae', '高層貿易'],
      [-11.8, 7.6, 3.4, 2.25, 3.2, 'cream_office', '#dcd5c8', '東宝劇場'],
      [-15.0, 13.6, 4.0, 2.9, 3.6, 'brick_shop', '#8a594b', '飯店廣場'],
      [11.6, 7.2, 3.4, 2.1, 3.2, 'brick_shop', '#915f50', '居酒屋'],
      [14.6, 13.4, 3.8, 2.75, 3.5, 'slate_tower', '#4e5968', '防災本部'],
      [-25.0, -5.5, 4.2, 3.2, 3.8, 'blue_curtain', '#6e90b5', '丸之內塔'],
      [25.0, -5.5, 4.2, 3.15, 3.6, 'cream_office', '#cfc7ba', '中央銀行'],
      [-6.8, -24.5, 4.2, 2.9, 3.4, 'slate_tower', '#566270', '交通局'],
      [-6.8, 14.5, 3.3, 2.15, 3.2, 'brick_shop', '#8d5b4c', '模型本舖'],
    ];

    const hvacMat = new THREE.MeshStandardMaterial({ color: '#6b727a', roughness: 0.72, metalness: 0.25 });
    const tankMat = new THREE.MeshStandardMaterial({ color: '#9ba3ad', roughness: 0.45, metalness: 0.55 });
    const roofCapMat = new THREE.MeshStandardMaterial({ color: '#494f57', roughness: 0.85 });

    layout.forEach(([x, z, w, h, d, styleId, bodyCol, signText], idx) => {
      const grp = new THREE.Group();
      grp.position.set(x, 0, z);

      const tex = this._getFacadeTexture(styleId, bodyCol);
      const bodyMat = new THREE.MeshStandardMaterial({
        map: tex,
        color: '#ffffff',
        roughness: styleId === 'blue_curtain' ? 0.36 : 0.74,
        metalness: styleId === 'blue_curtain' ? 0.42 : 0.14,
      });
      const body = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), bodyMat);
      body.position.y = h / 2;
      body.castShadow = true;
      body.receiveShadow = true;
      grp.add(body);

      // Concrete roof slab parapet rim
      const parapet = new THREE.Mesh(new THREE.BoxGeometry(w + 0.08, 0.11, d + 0.08), roofCapMat);
      parapet.position.y = h + 0.03;
      grp.add(parapet);

      // Rooftop HVAC chiller box + stairwell penthouse + cylindrical steel water tank
      const hvac = new THREE.Mesh(new THREE.BoxGeometry(w * 0.34, 0.22, d * 0.34), hvacMat);
      hvac.position.set(w * 0.16, h + 0.14, -d * 0.14);
      hvac.castShadow = true;
      grp.add(hvac);

      if (idx % 2 === 0) {
        const tank = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.16, 0.30, 12), tankMat);
        tank.position.set(-w * 0.22, h + 0.20, d * 0.18);
        tank.castShadow = true;
        grp.add(tank);
      }

      // Street-facing vertical Japanese storefront signboard
      const signTex = this._getJapaneseSignTexture(signText, idx % 2 === 0 ? '#a82a2a' : '#1b3e68', '#fff6dc');
      const sign = new THREE.Mesh(
        new THREE.BoxGeometry(0.28, Math.min(1.05, h * 0.46), 0.08),
        new THREE.MeshStandardMaterial({ map: signTex, roughness: 0.45 }),
      );
      const faceSignZ = z < 0 ? d * 0.5 + 0.05 : -(d * 0.5 + 0.05);
      sign.position.set(w * 0.28, h * 0.45, faceSignZ);
      grp.add(sign);

      const nearHp = computeBuildingDurability(w, d, h);
      this.arenaGroup.add(grp);
      this.destructibles.push({
        id: `bldg_${idx}`,
        isInstanced: false,
        group: grp,
        bodyMat,
        x,
        z,
        w,
        d,
        halfW: w * 0.5,
        halfD: d * 0.5,
        height: h,
        hp: nearHp,
        maxHp: nearHp,
        state: 'intact',
        collapseProgress: 0,
        collapseDirX: (idx % 2 === 0 ? 1 : -1) * 0.55,
        collapseDirZ: 0.42,
        dustAccum: 0,
        boomAccum: 0,
      });
    });
  }

  _buildTargetDummy() {
    const grp = new THREE.Group();
    grp.position.set(0, 0, -9);

    const standMat = new THREE.MeshStandardMaterial({ color: '#2b3340', metalness: 0.8, roughness: 0.4 });
    const armorMat = new THREE.MeshStandardMaterial({ color: '#d0533c', metalness: 0.55, roughness: 0.35 });
    const coreMat = new THREE.MeshStandardMaterial({ color: '#ffaa22', emissive: '#ff6600', emissiveIntensity: 2.4 });

    const base = new THREE.Mesh(new THREE.CylinderGeometry(0.75, 0.9, 0.22, 20), standMat);
    base.position.y = 0.11;
    grp.add(base);

    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.2, 1.35, 16), standMat);
    post.position.y = 0.85;
    grp.add(post);

    const torso = new THREE.Mesh(new THREE.BoxGeometry(0.88, 0.95, 0.52), armorMat);
    torso.position.y = 1.62;
    torso.castShadow = true;
    grp.add(torso);

    const core = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.24, 0.56), coreMat);
    core.position.y = 1.65;
    grp.add(core);

    const head = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.34, 0.36), armorMat);
    head.position.y = 2.3;
    grp.add(head);

    this.scene.add(grp);
    this.dummy = {
      group: grp,
      armorMat,
      x: 0,
      z: -9,
      radius: 0.85,
      hp: 300,
      maxHp: 300,
      hitFlash: 0,
      respawnTimer: 0,
    };
  }

  /**
   * Build Tapered, Soft-Lit, Flickering Custom GLSL Plasma Beam Saber
   * mounted strictly coaxially onto Wpn_HyperBeamSaber_Hilt's real emitter collar!
   * Note: Permanently hides the crooked GLB `Wpn_HyperBeamSaber_Blade` node.
   */
  _enhanceBeamSaberGlow() {
    const hilt = this.weaponNodes.saberHilt;
    const oldBlade = this.weaponNodes.saberBlade;
    if (!hilt) return;

    this.mechaRoot.updateMatrixWorld(true);
    const hiltBox = new THREE.Box3().setFromObject(hilt);
    const oldBladeCtrWorld = new THREE.Vector3();
    if (oldBlade) {
      new THREE.Box3().setFromObject(oldBlade).getCenter(oldBladeCtrWorld);
      oldBlade.visible = false;
    }

    // Find emitter local point on Hilt geometry along its local Y axis pointing toward blade direction
    let pMinY = -0.23;
    let pMaxY = 0.235;
    let hiltGeomObj = hilt;
    hilt.traverse((child) => {
      if (child.isMesh && child.geometry) {
        child.geometry.computeBoundingBox();
        if (child.geometry.boundingBox) {
          pMinY = child.geometry.boundingBox.min.y;
          pMaxY = child.geometry.boundingBox.max.y;
          hiltGeomObj = child;
        }
      }
    });

    const candPos = hiltGeomObj.localToWorld(new THREE.Vector3(0, pMaxY, 0));
    const candNeg = hiltGeomObj.localToWorld(new THREE.Vector3(0, pMinY, 0));
    const hiltCenterWorld = new THREE.Vector3();
    hiltBox.getCenter(hiltCenterWorld);

    let emitterSign = 1;
    if (oldBlade) {
      emitterSign = candPos.distanceTo(oldBladeCtrWorld) <= candNeg.distanceTo(oldBladeCtrWorld) ? 1 : -1;
    } else {
      const forwardRef = hiltCenterWorld.clone().add(new THREE.Vector3(0, 0.5, -1.0));
      emitterSign = candPos.distanceTo(forwardRef) <= candNeg.distanceTo(forwardRef) ? 1 : -1;
    }

    const emitterLocalY = (emitterSign > 0 ? pMaxY : pMinY) - emitterSign * 0.015;
    const saberGroup = new THREE.Group();
    saberGroup.name = 'CustomPlasmaSaber';
    saberGroup.position.set(0, emitterLocalY, 0);
    if (emitterSign < 0) {
      saberGroup.rotation.z = Math.PI;
    }
    hiltGeomObj.add(saberGroup);
    // Re-point blade tracker to the coaxial saberGroup so drop/pickup & ribbon trail match 100%
    this.weaponNodes.saberBlade = saberGroup;

    const bladeLen = 1.54;

    // 1. Inner Tapered Plasma Core (thick at hilt v=0 -> razor sharp needle at tip v=1) + organic flicker
    const coreGeo = new THREE.CylinderGeometry(0.004, 0.026, bladeLen, 16, 20, true);
    coreGeo.translate(0, bladeLen * 0.5, 0);
    const saberCoreMat = new THREE.ShaderMaterial({
      uniforms: {
        uTime: { value: 0 },
        uSaberColor: { value: new THREE.Color('#55f6ff') },
      },
      vertexShader: `
        varying vec2 vUv;
        void main() {
          vUv = uv;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        uniform float uTime;
        uniform vec3 uSaberColor;
        varying vec2 vUv;
        void main() {
          float t = clamp(vUv.y, 0.0, 1.0);
          float flicker = 0.84 + 0.10 * sin(uTime * 54.0 + t * 18.0) + 0.07 * sin(uTime * 131.0 - t * 37.0);
          float hiltToTip = mix(1.22, 0.42, pow(t, 0.72)) * smoothstep(1.0, 0.91, t);
          vec3 coreCol = mix(vec3(1.95, 1.98, 2.0), uSaberColor * 1.65, smoothstep(0.18, 0.95, t));
          gl_FragColor = vec4(coreCol * hiltToTip * flicker, smoothstep(0.0, 0.03, t) * smoothstep(1.0, 0.92, t));
        }
      `,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
    });
    const coreMesh = new THREE.Mesh(coreGeo, saberCoreMat);
    saberGroup.add(coreMesh);

    // 2. Outer Tapered Fresnel Plasma Sheath (glow fades gently from hilt emitter toward tip, zero chest washout)
    const auraGeo = new THREE.CylinderGeometry(0.008, 0.056, bladeLen * 1.02, 16, 16, true);
    auraGeo.translate(0, bladeLen * 0.51, 0);
    const saberAuraMat = new THREE.ShaderMaterial({
      uniforms: {
        uTime: { value: 0 },
        uSaberColor: { value: new THREE.Color('#55f6ff') },
      },
      vertexShader: `
        varying vec2 vUv;
        varying vec3 vNormalV;
        varying vec3 vViewPos;
        void main() {
          vUv = uv;
          vec4 mvPos = modelViewMatrix * vec4(position, 1.0);
          vViewPos = -mvPos.xyz;
          vNormalV = normalize(normalMatrix * normal);
          gl_Position = projectionMatrix * mvPos;
        }
      `,
      fragmentShader: `
        uniform float uTime;
        uniform vec3 uSaberColor;
        varying vec2 vUv;
        varying vec3 vNormalV;
        varying vec3 vViewPos;
        void main() {
          float t = clamp(vUv.y, 0.0, 1.0);
          float rim = pow(clamp(1.0 - abs(dot(normalize(vNormalV), normalize(vViewPos))), 0.0, 1.0), 0.75);
          float edgeSoft = 0.35 + 0.65 * (1.0 - rim);
          float flicker = 0.80 + 0.12 * sin(uTime * 49.0 + t * 22.0) + 0.09 * sin(uTime * 118.0 - t * 41.0);
          float axialFade = mix(0.66, 0.07, pow(t, 0.7)) * smoothstep(1.0, 0.88, t);
          vec3 col = uSaberColor * mix(1.48, 0.75, t);
          gl_FragColor = vec4(col * flicker, clamp(axialFade * edgeSoft, 0.0, 0.78));
        }
      `,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
    });
    const auraMesh = new THREE.Mesh(auraGeo, saberAuraMat);
    saberGroup.add(auraMesh);

    // 3. Controlled Emitter Light (soft wrist & forearm fill without overexposing white chest)
    const saberLight = new THREE.PointLight('#55f6ff', 0.65, 3.2, 2.0);
    saberLight.position.set(0, 0.42, 0);
    saberGroup.add(saberLight);

    this.saberFx = {
      coreMat: saberCoreMat,
      auraMesh,
      auraMat: saberAuraMat,
      light: saberLight,
      baseLocal: new THREE.Vector3(0, 0, 0),
      tipLocal: new THREE.Vector3(0, bladeLen, 0),
    };
  }

  /**
   * Scan actual Mat_Glow_Thruster nozzle geometry under Backpack & Calves so every 1000 deg C
   * combustion plume sits with 0-error coaxial precision inside its real nozzle aperture.
   */
  _buildThrusterPlumes() {
    this.mechaRoot.updateMatrixWorld(true);

    const make1000CPlumeMaterial = (seed = 0) =>
      new THREE.ShaderMaterial({
        uniforms: {
          uTime: { value: 0 },
          uIntensity: { value: 0 },
          uSeed: { value: seed },
        },
        vertexShader: `
          uniform float uTime;
          uniform float uIntensity;
          uniform float uSeed;
          varying vec2 vUv;
          void main() {
            vUv = uv;
            float t = clamp(uv.y, 0.0, 1.0);
            vec3 p = position;
            float turb = sin(t * 14.0 - uTime * 42.0 + uSeed) * 0.018 * t * uIntensity;
            p.x += turb;
            p.z += cos(t * 12.0 - uTime * 38.0 + uSeed * 1.7) * 0.016 * t * uIntensity;
            gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
          }
        `,
        fragmentShader: `
          uniform float uTime;
          uniform float uIntensity;
          uniform float uSeed;
          varying vec2 vUv;
          void main() {
            float t = clamp(vUv.y, 0.0, 1.0);
            // Realistic ~1000 C hydrocarbon combustion gradient:
            // Nozzle throat ~1150 C yellow-orange -> 1000 C orange-red core -> crimson smoky tip
            vec3 throat = vec3(2.05, 0.98, 0.24);
            vec3 core1000C = vec3(1.65, 0.44, 0.045);
            vec3 tailEmber = vec3(0.75, 0.11, 0.015);
            vec3 col = mix(throat, core1000C, smoothstep(0.0, 0.34, t));
            col = mix(col, tailEmber, smoothstep(0.34, 0.92, t));

            float machFlicker = 0.84 + 0.16 * sin(t * 24.0 - uTime * 46.0 + uSeed * 3.1);
            float alpha = smoothstep(0.0, 0.08, t) * (1.0 - pow(t, 1.25)) * machFlicker * clamp(uIntensity, 0.0, 1.25);
            gl_FragColor = vec4(col * machFlicker, clamp(alpha, 0.0, 0.95));
          }
        `,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        side: THREE.DoubleSide,
      });

    const extractThrusterClusters = (parentBone) => {
      if (!parentBone) return [];
      const points = [];
      const normals = [];
      const a = new THREE.Vector3();
      const b = new THREE.Vector3();
      const c = new THREE.Vector3();
      const ab = new THREE.Vector3();
      const ac = new THREE.Vector3();

      // Traverse only non-Bone descendants so child bones (e.g. Wing_L1..R2) stay independent
      const visitNonBoneDescendants = (node, visitor) => {
        for (const child of node.children) {
          if (child.isBone) continue;
          visitor(child);
          visitNonBoneDescendants(child, visitor);
        }
      };

      visitNonBoneDescendants(parentBone, (obj) => {
        if (!obj.isMesh || !obj.geometry || obj.material?.name !== 'Mat_Glow_Thruster') return;
        const pos = obj.geometry.attributes.position;
        if (!pos) return;
        const idx = obj.geometry.index;
        const triCount = idx ? Math.floor(idx.count / 3) : Math.floor(pos.count / 3);
        for (let t = 0; t < triCount; t++) {
          const i0 = idx ? idx.getX(t * 3) : t * 3;
          const i1 = idx ? idx.getX(t * 3 + 1) : t * 3 + 1;
          const i2 = idx ? idx.getX(t * 3 + 2) : t * 3 + 2;
          a.fromBufferAttribute(pos, i0).applyMatrix4(obj.matrixWorld);
          b.fromBufferAttribute(pos, i1).applyMatrix4(obj.matrixWorld);
          c.fromBufferAttribute(pos, i2).applyMatrix4(obj.matrixWorld);
          const cent = a.clone().add(b).add(c).divideScalar(3);
          ab.subVectors(b, a);
          ac.subVectors(c, a);
          const n = ab.cross(ac).normalize();
          points.push(cent);
          normals.push(n);
        }
      });

      const clusters = [];
      for (let i = 0; i < points.length; i++) {
        const pt = points[i];
        const nm = normals[i];
        let matched = null;
        for (const cl of clusters) {
          if (cl.center.distanceTo(pt) < 0.12) {
            matched = cl;
            break;
          }
        }
        if (!matched) {
          matched = { center: pt.clone(), pts: [pt], nms: [nm] };
          clusters.push(matched);
        } else {
          matched.pts.push(pt);
          matched.nms.push(nm);
          matched.center.set(0, 0, 0);
          for (const p of matched.pts) matched.center.add(p);
          matched.center.divideScalar(matched.pts.length);
        }
      }
      return clusters.filter((cl) => cl.pts.length >= 2);
    };

    const attachClusterPlumes = (parentBone, defaultOutDir, seedOffset = 0, options = {}) => {
      const { forceDir = false, minR = 0.036, maxRClamp = 0.095, lenLarge = 1.55, lenSmall = 0.88 } = options;
      const clusters = extractThrusterClusters(parentBone);
      clusters.forEach((cl, idx) => {
        let maxR = 0.035;
        const nSum = new THREE.Vector3();
        for (let i = 0; i < cl.pts.length; i++) {
          maxR = Math.max(maxR, cl.pts[i].distanceTo(cl.center));
          if (!forceDir && cl.nms[i].z > 0.15) {
            nSum.add(cl.nms[i]);
          }
        }
        const worldDir = !forceDir && nSum.lengthSq() > 0.05 ? nSum.normalize() : defaultOutDir.clone().normalize();
        const radius = clamp(maxR * 0.92, minR, maxRClamp);

        const localPos = parentBone.worldToLocal(cl.center.clone());
        const localAim = parentBone.worldToLocal(cl.center.clone().add(worldDir));
        const localDir = localAim.sub(localPos).normalize();

        const rig = new THREE.Group();
        rig.position.copy(localPos);
        rig.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), localDir);

        // Inverted tapered flame cone: open wide throat at y=0 (inside nozzle), sharp point at y=1
        const outerGeo = new THREE.CylinderGeometry(0.012, radius, 1.0, 14, 12, true);
        outerGeo.translate(0, 0.5, 0);
        const outerMat = make1000CPlumeMaterial(seedOffset + idx * 1.37);
        const outerCone = new THREE.Mesh(outerGeo, outerMat);

        const coreGeo = new THREE.CylinderGeometry(0.005, radius * 0.52, 0.58, 10, 8, true);
        coreGeo.translate(0, 0.29, 0);
        const coreMat = make1000CPlumeMaterial(seedOffset + idx * 1.37 + 4.1);
        const coreCone = new THREE.Mesh(coreGeo, coreMat);

        rig.add(outerCone, coreCone);
        rig.visible = false;
        parentBone.add(rig);

        this.thrusterPlumes.push({
          rig,
          localDir,
          outerMat,
          coreMat,
          baseLen: radius > 0.065 ? lenLarge : lenSmall,
        });
      });
    };

    // Option A: Strict 6-Nozzle Main Thruster Layout (2 Backpack Main + 2 Rear Pods + 2 Lower Calves)
    attachClusterPlumes(this.bones.Backpack, new THREE.Vector3(0, -0.45, 0.89), 1.0);
    attachClusterPlumes(this.bones.Leg_Lower_L, new THREE.Vector3(0, -0.5, 0.866), 5.0);
    attachClusterPlumes(this.bones.Leg_Lower_R, new THREE.Vector3(0, -0.5, 0.866), 9.0);
  }

  /**
   * Game-Grade Panoramic Linear Cockpit Interior with Dual Animated Canvas MFDs + Canopy Ribs + HOTAS.
   */
  _buildCockpitInterior() {
    this.cockpitGroup = new THREE.Group();
    this.cockpitGroup.visible = false;

    const frameMat = new THREE.MeshStandardMaterial({ color: '#2b3d54', metalness: 0.78, roughness: 0.32 });
    const darkMat = new THREE.MeshStandardMaterial({ color: '#141a24', metalness: 0.65, roughness: 0.5 });
    const hudMat = new THREE.MeshStandardMaterial({
      color: '#00f2ff',
      emissive: '#00f2ff',
      emissiveIntensity: 2.2,
      transparent: true,
      opacity: 0.72,
    });
    this.cockpitMaterials = { frameMat, hudMat };

    // 1. Sloped panoramic canopy A/B structural pillars & side wing consoles
    for (const sgn of [-1, 1]) {
      const aPillar = new THREE.Mesh(new THREE.BoxGeometry(0.036, 0.74, 0.055), frameMat);
      aPillar.position.set(sgn * 0.31, 0.08, -0.35);
      aPillar.rotation.z = sgn * -0.26;
      aPillar.rotation.y = sgn * 0.38;
      aPillar.rotation.x = 0.22;
      this.cockpitGroup.add(aPillar);

      const bPillar = new THREE.Mesh(new THREE.BoxGeometry(0.045, 0.78, 0.07), darkMat);
      bPillar.position.set(sgn * 0.42, 0.06, -0.14);
      bPillar.rotation.y = sgn * 1.12;
      this.cockpitGroup.add(bPillar);

      const consoleArm = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.09, 0.42), darkMat);
      consoleArm.position.set(sgn * 0.27, -0.24, -0.18);
      consoleArm.rotation.z = sgn * -0.18;
      this.cockpitGroup.add(consoleArm);
    }

    // Top overhead cowl + status rail + lower curved instrument hood
    const topCowl = new THREE.Mesh(new THREE.BoxGeometry(0.72, 0.06, 0.26), darkMat);
    topCowl.position.set(0, 0.36, -0.27);
    topCowl.rotation.x = 0.14;
    this.cockpitGroup.add(topCowl);

    const statusStrip = new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.012, 0.02), hudMat);
    statusStrip.position.set(0, 0.325, -0.37);
    this.cockpitGroup.add(statusStrip);

    const centerDash = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.13, 0.22), darkMat);
    centerDash.position.set(0, -0.26, -0.34);
    centerDash.rotation.x = -0.22;
    this.cockpitGroup.add(centerDash);

    // 2. Dual Dynamic Holographic CanvasTexture MFDs (Left Tactical Radar + Right Reactor/Weapons)
    const makeMfd = (px, rotY) => {
      const cv = document.createElement('canvas');
      cv.width = 256;
      cv.height = 192;
      const ctx = cv.getContext('2d');
      const tex = new THREE.CanvasTexture(cv);
      const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, opacity: 0.92 });
      const scr = new THREE.Mesh(new THREE.PlaneGeometry(0.21, 0.155), mat);
      scr.position.set(px, -0.13, -0.35);
      scr.rotation.y = rotY;
      scr.rotation.x = -0.22;
      this.cockpitGroup.add(scr);

      const bezel = new THREE.Mesh(new THREE.BoxGeometry(0.225, 0.17, 0.015), frameMat);
      bezel.position.set(px, -0.13, -0.36);
      bezel.rotation.y = rotY;
      bezel.rotation.x = -0.22;
      this.cockpitGroup.add(bezel);
      return { ctx, tex };
    };

    const leftMfd = makeMfd(-0.21, 0.32);
    const rightMfd = makeMfd(0.21, -0.32);
    this.cockpitScreens = {
      leftCtx: leftMfd.ctx,
      leftTex: leftMfd.tex,
      rightCtx: rightMfd.ctx,
      rightTex: rightMfd.tex,
      timer: 0,
    };

    // 3. Linear Panoramic Display Horizon & Side Grid Bars
    for (const hOff of [-0.08, 0.14]) {
      const arc = new THREE.Mesh(new THREE.TorusGeometry(0.39, 0.0025, 6, 48, Math.PI * 0.85), hudMat);
      arc.rotation.x = Math.PI * 0.5;
      arc.rotation.z = Math.PI * 0.075;
      arc.position.set(0, hOff, -0.02);
      this.cockpitGroup.add(arc);
    }

    // 4. Twin HOTAS Control Grips + Thumb Triggers
    const createStick = (sx) => {
      const g = new THREE.Group();
      g.position.set(sx, -0.21, -0.21);
      const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.02, 0.12, 10), frameMat);
      const grip = new THREE.Mesh(new THREE.BoxGeometry(0.036, 0.055, 0.044), darkMat);
      grip.position.set(0, 0.06, 0);
      const led = new THREE.Mesh(new THREE.BoxGeometry(0.018, 0.014, 0.012), hudMat);
      led.position.set(0, 0.08, -0.018);
      g.add(shaft, grip, led);
      this.cockpitGroup.add(g);
      return g;
    };
    this.cockpitSticks = { left: createStick(-0.22), right: createStick(0.22) };

    const torsoBone = this.bones.Torso;
    if (torsoBone) {
      this.cockpitGroup.rotation.y = Math.PI;
      this.cockpitGroup.position.set(0, 0.36, 0.12);
      torsoBone.add(this.cockpitGroup);
    } else {
      this.mechaRoot.add(this.cockpitGroup);
      this.cockpitGroup.position.set(0, 1.9, -0.1);
    }
  }

  _updateCockpitScreens(dt, nowMs) {
    if (this.cameraMode !== CAMERA_MODES.FPS_COCKPIT || !this.cockpitScreens.leftCtx) return;
    this.cockpitScreens.timer += dt;
    if (this.cockpitScreens.timer < 0.065) return; // ~15Hz crisp MFD update
    this.cockpitScreens.timer = 0;

    const lCtx = this.cockpitScreens.leftCtx;
    const rCtx = this.cockpitScreens.rightCtx;

    // Left MFD: 360 Tactical Radar
    lCtx.fillStyle = 'rgba(4, 18, 28, 0.94)';
    lCtx.fillRect(0, 0, 256, 192);
    lCtx.strokeStyle = 'rgba(0, 235, 255, 0.35)';
    lCtx.lineWidth = 1.5;
    for (const r of [26, 52, 78]) {
      lCtx.beginPath();
      lCtx.arc(128, 96, r, 0, Math.PI * 2);
      lCtx.stroke();
    }
    // Forward FOV wedge
    lCtx.fillStyle = 'rgba(0, 235, 255, 0.14)';
    lCtx.beginPath();
    lCtx.moveTo(128, 96);
    lCtx.arc(128, 96, 80, -Math.PI * 0.72, -Math.PI * 0.28);
    lCtx.closePath();
    lCtx.fill();

    // Plot buildings & target dummy relative to mecha yaw
    const cosY = Math.cos(-this.yaw);
    const sinY = Math.sin(-this.yaw);
    const toRadar = (wx, wz) => {
      const dx = wx - this.physics.x;
      const dz = wz - this.physics.z;
      const rx = dx * cosY - dz * sinY;
      const rz = dx * sinY + dz * cosY;
      return [128 + rx * 2.1, 96 + rz * 2.1];
    };

    lCtx.fillStyle = '#4ad7ff';
    for (const b of this.destructibles) {
      if (b.state === 'destroyed') continue;
      const [px, py] = toRadar(b.x, b.z);
      if (px > 12 && px < 244 && py > 12 && py < 180) lCtx.fillRect(px - 3, py - 3, 6, 6);
    }
    if (this.dummy && this.dummy.hp > 0) {
      const [dx, dy] = toRadar(this.dummy.x, this.dummy.z);
      lCtx.fillStyle = '#ff4444';
      lCtx.beginPath();
      lCtx.arc(dx, dy, 5, 0, Math.PI * 2);
      lCtx.fill();
    }
    lCtx.fillStyle = '#9cfaff';
    lCtx.font = 'bold 14px monospace';
    lCtx.fillText(`TAC-RADAR // BLDG:${14 - this.score.destroyed}`, 10, 18);
    this.cockpitScreens.leftTex.needsUpdate = true;

    // Right MFD: Reactor Sine Wave + Weapon & Boost Mode
    rCtx.fillStyle = 'rgba(4, 18, 28, 0.94)';
    rCtx.fillRect(0, 0, 256, 192);
    rCtx.strokeStyle = '#00f2ff';
    rCtx.lineWidth = 2;
    rCtx.beginPath();
    for (let x = 12; x < 244; x += 6) {
      const phase = nowMs * 0.008 + x * 0.08;
      const y = 78 + Math.sin(phase) * (10 + this.jetIntensitySmooth * 18);
      if (x === 12) rCtx.moveTo(x, y);
      else rCtx.lineTo(x, y);
    }
    rCtx.stroke();

    rCtx.fillStyle = '#8ef8ff';
    rCtx.font = 'bold 14px monospace';
    rCtx.fillText(`EN REACTOR: ${Math.round(this.physics.en)}%`, 12, 22);
    rCtx.fillStyle = this.weaponState.hasPistol ? '#55ff99' : '#ff6644';
    rCtx.fillText(`R-PISTOL : ${this.weaponState.hasPistol ? 'ONLINE' : 'DROPPED [R]'}`, 12, 132);
    rCtx.fillStyle = this.weaponState.hasSaber ? '#55f6ff' : '#ff6644';
    rCtx.fillText(`L-SABER  : ${this.weaponState.saberIgnited ? 'IGNITED [' + this.saberSwing.dir + ']' : 'STOWED'}`, 12, 158);
    this.cockpitScreens.rightTex.needsUpdate = true;
  }

  _buildCompositeShieldAndRightSaber() {
    const armU = this.bones.Arm_Upper_L;
    const armL = this.bones.Arm_Lower_L;
    const handL = this.bones.Hand_L || this.bones.WeaponMount_L;
    if (armL && armU) {
      // Compute Composite Shield local transform directly from the Raised-Guard Arm Pose
      // so when guarding (RMB/E), the shield stands UPRIGHT facing straight FORWARD in front of the left hand!
      this._poseBone('Arm_Upper_L', 64, -26, 12);
      this._poseBone('Arm_Lower_L', 24, 18, -6);
      this._poseBone('Hand_L', 0, 0, 0);
      this.mechaRoot.updateMatrixWorld(true);

      const wristGuardW = new THREE.Vector3();
      const torsoW = new THREE.Vector3();
      if (handL) handL.getWorldPosition(wristGuardW);
      else armL.getWorldPosition(wristGuardW);
      if (this.bones.Torso) this.bones.Torso.getWorldPosition(torsoW);
      else torsoW.set(0, 1.35, 0);

      // Desired world position in Guard: directly in front of the left wrist/hand, safely ahead of chest
      const anchorGuardW = new THREE.Vector3(
        wristGuardW.x - 0.06,
        torsoW.y + 0.14,
        Math.min(wristGuardW.z, torsoW.z - 0.62) - 0.12,
      );

      // Desired world basis in Guard: shield face +Z points straight forward (-Z in mechaRoot), +Y straight UP!
      const guardBasis = new THREE.Matrix4().makeBasis(
        new THREE.Vector3(-1, 0, 0),
        new THREE.Vector3(0, 1, 0),
        new THREE.Vector3(0, 0, -1),
      );
      const guardWorldQuat = new THREE.Quaternion().setFromRotationMatrix(guardBasis);
      const armWorldQuat = armL.getWorldQuaternion(new THREE.Quaternion());
      const localQuat = armWorldQuat.clone().invert().multiply(guardWorldQuat);

      const shieldGroup = new THREE.Group();
      shieldGroup.name = 'EF_CompositeShield_L';
      shieldGroup.position.copy(armL.worldToLocal(anchorGuardW.clone()));
      shieldGroup.quaternion.copy(localQuat);

      // Restore neutral bone rest rotations
      this._poseBone('Arm_Upper_L', 0, 0, 0);
      this._poseBone('Arm_Lower_L', 0, 0, 0);
      this._poseBone('Hand_L', 0, 0, 0);
      this.mechaRoot.updateMatrixWorld(true);

      const frameMat = new THREE.MeshStandardMaterial({ color: '#1b2c47', roughness: 0.34, metalness: 0.72 });
      const plateMat = new THREE.MeshStandardMaterial({ color: '#eef3fa', roughness: 0.42, metalness: 0.25 });
      const accentMat = new THREE.MeshStandardMaterial({ color: '#2b5ea8', roughness: 0.36, metalness: 0.45 });
      const emitterMat = new THREE.MeshStandardMaterial({
        color: '#46f4ff',
        emissive: '#00d8ff',
        emissiveIntensity: 1.4,
        roughness: 0.2,
      });

      const baseBody = new THREE.Mesh(new THREE.BoxGeometry(0.44, 0.92, 0.055), frameMat);
      baseBody.castShadow = true;
      shieldGroup.add(baseBody);

      const upperArmor = new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.36, 0.072), plateMat);
      upperArmor.position.set(0, 0.23, 0.014);
      const lowerArmor = new THREE.Mesh(new THREE.BoxGeometry(0.30, 0.44, 0.068), accentMat);
      lowerArmor.position.set(0, -0.17, 0.012);
      const noseTip = new THREE.Mesh(new THREE.ConeGeometry(0.15, 0.22, 4), plateMat);
      noseTip.rotation.z = Math.PI;
      noseTip.rotation.y = Math.PI * 0.25;
      noseTip.scale.set(1.0, 1.0, 0.35);
      noseTip.position.set(0, -0.49, 0.012);
      const coreCrystal = new THREE.Mesh(new THREE.OctahedronGeometry(0.068, 0), emitterMat);
      coreCrystal.position.set(0, 0.05, 0.058);
      shieldGroup.add(upperArmor, lowerArmor, noseTip, coreCrystal);

      // Forward-curving Hexagonal Energy Barrier Dome (strictly in front of +Z, zero torso clipping!)
      const domeRadius = 0.78;
      const domeTheta = Math.PI * 0.36;
      const barrierGeo = new THREE.SphereGeometry(domeRadius, 28, 18, 0, Math.PI * 2, 0, domeTheta);
      barrierGeo.rotateX(Math.PI * 0.5);
      barrierGeo.translate(0, 0, -domeRadius * Math.cos(domeTheta) + 0.04);
      const invRimR = 1.0 / (domeRadius * Math.sin(domeTheta));
      const barrierMat = new THREE.ShaderMaterial({
        uniforms: {
          uTime: { value: 0 },
          uOpacity: { value: 0.0 },
          uFlash: { value: 0.0 },
          uColor: { value: new THREE.Color('#32e8ff') },
          uInvRim: { value: invRimR },
        },
        vertexShader: `
          uniform float uInvRim;
          varying vec2 vLocalXY;
          void main() {
            vLocalXY = position.xy * uInvRim;
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
          }
        `,
        fragmentShader: `
          uniform float uTime;
          uniform float uOpacity;
          uniform float uFlash;
          uniform vec3 uColor;
          varying vec2 vLocalXY;
          float hexGrid(vec2 p) {
            vec2 r = vec2(1.0, 1.73205);
            vec2 h = r * 0.5;
            vec2 a = mod(p, r) - h;
            vec2 b = mod(p - h, r) - h;
            vec2 gv = dot(a, a) < dot(b, b) ? a : b;
            return 0.5 - max(abs(gv.x), dot(abs(gv), normalize(vec2(1.0, 1.73205))));
          }
          void main() {
            float dist = length(vLocalXY);
            float hex = hexGrid(vLocalXY * 5.0 + vec2(0.0, uTime * 0.45));
            float edge = smoothstep(0.08, 0.01, abs(hex));
            float outerRim = smoothstep(0.72, 0.99, dist) * (1.0 - smoothstep(0.98, 1.04, dist));
            vec3 gold = vec3(1.9, 1.65, 0.65);
            vec3 col = mix(uColor * 1.4, gold, uFlash);
            float pulse = 0.72 + 0.28 * sin(uTime * 11.0 - dist * 8.0);
            float a = clamp((edge * 0.68 + outerRim * 1.25 + 0.14) * pulse * uOpacity, 0.0, 0.92);
            gl_FragColor = vec4(col * (1.2 + uFlash * 1.5), a);
          }
        `,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        side: THREE.DoubleSide,
      });
      const barrierMesh = new THREE.Mesh(barrierGeo, barrierMat);
      barrierMesh.position.set(0, 0, 0.14);
      barrierMesh.visible = false;
      shieldGroup.add(barrierMesh);

      armL.add(shieldGroup);
      this.shieldNodes = {
        ...this.shieldNodes,
        group: shieldGroup,
        barrierMesh,
        barrierMat,
        frameMat,
      };
    }

    // Build Right-Hand Beam Saber mirror inside WeaponMount_R for Mode 3 (Saber + Shield)
    const mountR = this.bones.WeaponMount_R || this.bones.Hand_R;
    if (mountR && this.weaponNodes.saberHilt) {
      const rGrp = new THREE.Group();
      rGrp.name = 'RightHandBeamSaber';
      const hiltClone = this.weaponNodes.saberHilt.clone();
      hiltClone.traverse((c) => {
        if (c.name && c.name.startsWith('Wpn_HyperBeamSaber_Blade')) c.visible = false;
      });
      rGrp.add(hiltClone);
      rGrp.visible = false;
      mountR.add(rGrp);
      this.shieldNodes.saberRightGroup = rGrp;
    }

    this._syncWeaponLoadoutVisibility();
  }

  _syncWeaponLoadoutVisibility() {
    const preset = this.loadoutPreset;
    const pistolEquip = preset.rHand === 'pistol' && this.weaponState.hasPistol;
    const saberLeftEquip = preset.lHand === 'saber' && this.weaponState.hasSaber;
    const saberRightEquip = preset.rHand === 'saber' && this.weaponState.hasSaber;
    const shieldEquip = preset.lHand === 'shield';

    if (this.weaponNodes.pistol) this.weaponNodes.pistol.visible = pistolEquip;
    if (this.weaponNodes.saberHilt) this.weaponNodes.saberHilt.visible = saberLeftEquip;
    if (this.weaponNodes.saberBlade) {
      this.weaponNodes.saberBlade.visible = saberLeftEquip && this.weaponState.saberIgnited;
    }
    if (this.shieldNodes.group) this.shieldNodes.group.visible = shieldEquip;
    if (this.shieldNodes.saberRightGroup) this.shieldNodes.saberRightGroup.visible = saberRightEquip;
  }

  setLoadoutMode(mode) {
    this.loadoutPreset = resolveArmLoadoutPreset(mode);
    this.rmbHeld = false;
    this.saberSwing.active = false;
    this._syncWeaponLoadoutVisibility();
    this.audio.playServoLift('R');
    if (this.loadoutPreset.lHand === 'shield') {
      this.audio.playShieldToggle(true);
    }
    this.ui.showToast?.(`武裝配置切換 [${this.loadoutPreset.mode}]：${this.loadoutPreset.label}`);
  }

  triggerRecoilPreview() {
    this.parryRecoil = { active: true, t: 0, duration: 0.44 };
    this.shieldState.flashTimer = 0.28;
    this.audio.playShieldParry(true);
    this.vfx.spawnSparks(
      new THREE.Vector3(this.physics.x - Math.sin(this.yaw) * 0.9, this.physics.y + 1.45, this.physics.z - Math.cos(this.yaw) * 0.9),
      '#ffe86b',
      16,
      9,
    );
    this.cameraShake = Math.max(this.cameraShake, 0.055);
    this.ui.showToast?.('🛡️ 觸發盾反彈開動作 (Parry Recoil Preview)');
  }

  _loadValiantGlb() {
    const loader = new GLTFLoader();
    loader.load(
      MODEL_URL,
      (gltf) => {
        const model = gltf.scene;
        model.rotation.y = Math.PI;

        model.traverse((obj) => {
          if (obj.isMesh) {
            obj.castShadow = true;
            obj.receiveShadow = true;
          }
          if (obj.isBone || obj.type === 'Object3D' || obj.name) {
            if (
              [
                'Root',
                'Pelvis',
                'Torso',
                'Head',
                'Backpack',
                'ShoulderPad_L',
                'ShoulderPad_R',
                'Arm_Upper_L',
                'Arm_Upper_R',
                'Arm_Lower_L',
                'Arm_Lower_R',
                'Hand_L',
                'Hand_R',
                'WeaponMount_L',
                'WeaponMount_R',
                'Wing_L1',
                'Wing_L2',
                'Wing_R1',
                'Wing_R2',
                'FrontSkirt_L',
                'FrontSkirt_R',
                'Leg_Upper_L',
                'Leg_Upper_R',
                'Leg_Lower_L',
                'Leg_Lower_R',
                'Foot_L',
                'Foot_R',
              ].includes(obj.name)
            ) {
              this.bones[obj.name] = obj;
              obj.userData.restQuat = obj.quaternion.clone();
              obj.userData.restPos = obj.position.clone();
            }
            if (obj.name.startsWith('Wpn_BeamPistol')) this.weaponNodes.pistol = obj;
            if (obj.name.startsWith('Wpn_HyperBeamSaber_Hilt')) this.weaponNodes.saberHilt = obj;
            if (obj.name.startsWith('Wpn_HyperBeamSaber_Blade')) this.weaponNodes.saberBlade = obj;
            if (obj.name === 'Mesh_Torso' || obj.name === 'Mesh_Head') {
              this.fpsHideNodes.push(obj);
            }
          }
        });

        this.mechaRoot.add(model);

        if (this.weaponNodes.pistol) {
          this.droppedTemplates.pistol = this.weaponNodes.pistol.clone();
        }
        if (this.weaponNodes.saberHilt) {
          this.droppedTemplates.saberHilt = this.weaponNodes.saberHilt.clone();
        }

        this._enhanceBeamSaberGlow();
        this._buildThrusterPlumes();
        this._buildCockpitInterior();
        this._buildCompositeShieldAndRightSaber();
        this.setSkin(this.activeSkinId, this.customPalette);
        this.ui.onModelReady?.(true);
      },
      undefined,
      (err) => {
        console.error('Failed to load GLB:', err);
        this.ui.onModelReady?.(false, err?.message || 'GLB Load Failed');
      },
    );
  }

  _poseBone(boneName, rxDeg = 0, ryDeg = 0, rzDeg = 0) {
    const b = this.bones[boneName];
    if (!b || !b.userData.restQuat) return;
    const qDelta = new THREE.Quaternion().setFromEuler(
      new THREE.Euler(rxDeg * DEG2RAD, ryDeg * DEG2RAD, rzDeg * DEG2RAD, 'XYZ'),
    );
    b.quaternion.copy(b.userData.restQuat).multiply(qDelta);
  }

  setSkin(skinId, customPalette = this.customPalette) {
    this.activeSkinId = skinId;
    this.customPalette = customPalette;
    const eff = applyMechaSkin(this.mechaRoot, skinId, customPalette, {
      frameMat: this.cockpitMaterials?.frameMat,
      hudMat: this.cockpitMaterials?.hudMat,
      saberShaderMat: this.saberFx.coreMat,
      saberAuraMat: this.saberFx.auraMat,
      saberLight: this.saberFx.light,
    });
    this.vfx.setAccentColor(eff.saber);
    for (const dm of this.droppedMeshes) {
      applyMechaSkin(dm, skinId, customPalette);
    }
    this.ui.onSkinChanged?.(eff);
  }

  toggleCameraMode() {
    this.cameraMode =
      this.cameraMode === CAMERA_MODES.TPS ? CAMERA_MODES.FPS_COCKPIT : CAMERA_MODES.TPS;
    const isFps = this.cameraMode === CAMERA_MODES.FPS_COCKPIT;
    if (isFps) this.orbitActive = false;
    if (this.cockpitGroup) this.cockpitGroup.visible = isFps;
    for (const node of this.fpsHideNodes) {
      node.visible = !isFps;
    }
    document.body.classList.toggle('fps-mode', isFps);
    this.ui.onCameraChanged?.(this.cameraMode);
  }

  toggleOrbitInspect() {
    if (this.cameraMode === CAMERA_MODES.FPS_COCKPIT) {
      this.toggleCameraMode();
    }
    this.orbitActive = !this.orbitActive;
    if (this.orbitActive) {
      // Snap initial inspect angle toward front 3/4 view so user sees robot face & chest right away!
      this.orbitYaw = this.yaw + Math.PI * 0.88;
      this.orbitPitch = 0.12;
      this.ui.showToast?.('開啟正面檢視鏡頭 (C) — 拖曳或滑鼠可 360° 看正面，滾輪縮放');
    } else {
      this.ui.showToast?.('返回戰鬥過肩視角');
    }
  }

  togglePause(forceVal = null) {
    this.paused = forceVal !== null ? forceVal : !this.paused;
    if (this.paused && document.pointerLockElement === this.renderer.domElement) {
      document.exitPointerLock?.();
    }
    this.ui.onPauseChanged?.(this.paused);
  }

  resetSandbox() {
    this.physics = {
      x: 0,
      y: 0,
      z: 10,
      vx: 0,
      vy: 0,
      vz: 0,
      en: 100,
      maxEn: 100,
      enRegenDelaySec: 0,
      grounded: true,
    };
    this.weaponState = createWeaponPickupState();
    this.shieldState = createShieldState();
    this.parryRecoil = { active: false, t: 0, duration: 0.42 };
    this.dummyFireTimer = 2.6;
    this.playerHp = this.playerMaxHp;
    this._syncDroppedGroundMeshes();
    this._spawnBuildings();
    this._resetCars();
    this.dummy.hp = this.dummy.maxHp;
    this.dummy.respawnTimer = 0;
    this.dummy.group.visible = true;
    this.score = { destroyed: 0, mcEarned: 0, dummyKills: 0 };
    this.togglePause(false);
  }

  _bindInputs() {
    window.addEventListener('resize', () => {
      this.camera.aspect = window.innerWidth / window.innerHeight;
      this.camera.updateProjectionMatrix();
      this.renderer.setSize(window.innerWidth, window.innerHeight);
      this.composer.setSize(window.innerWidth, window.innerHeight);
      this.bloomPass.setSize(window.innerWidth, window.innerHeight);
    });

    window.addEventListener('keydown', (e) => {
      const code = e.code;
      if (code === 'Escape') {
        this.togglePause();
        return;
      }
      if (this.paused) return;

      this.keys.add(code);
      if (code === 'Digit1' && !e.repeat) this.setLoadoutMode(1);
      if (code === 'Digit2' && !e.repeat) this.setLoadoutMode(2);
      if (code === 'Digit3' && !e.repeat) this.setLoadoutMode(3);
      if (code === 'KeyT' && !e.repeat) this.triggerRecoilPreview();
      if (code === 'KeyE' && !e.repeat && this.loadoutPreset.lHand !== 'shield') {
        this.setLoadoutMode(2);
      }
      if (code === 'KeyV') this.toggleCameraMode();
      if (code === 'KeyC') this.toggleOrbitInspect();
      if (code === 'KeyN') this.setLightingMode(this.lightingMode === 'daylight' ? 'night' : 'daylight');
      if (code === 'KeyF') this.requestDropFlag = true;
      if (code === 'KeyR') this.requestPickupFlag = true;
      if (code === 'Space' && this.physics.grounded && !e.repeat) {
        const jumpRes = consumeJumpImpulse(this.physics, 12);
        if (jumpRes.jumped) {
          this.physics.en = jumpRes.en;
          this.physics.enRegenDelaySec = jumpRes.enRegenDelaySec;
          this.physics.vy = 11.4;
          this.physics.grounded = false;
          this.physics.y = 0.08;
          this.audio.playThrusterIgnite();
          this.audio.playFootstep(true);
        } else {
          this.ui.showToast?.('EN 不足（需 ≥12 EN），無法噴射起跳！');
        }
      }
    });

    window.addEventListener('keyup', (e) => {
      this.keys.delete(e.code);
    });

    const canvas = this.renderer.domElement;
    let dragging = false;
    let lastDragX = 0;
    let lastDragY = 0;
    this.lmbHeld = false;

    const resetTransientInputs = (suppressMs = 240) => {
      this.keys.clear();
      dragging = false;
      this.lmbHeld = false;
      this.rmbHeld = false;
      this.mouseSwipe.x = 0;
      this.mouseSwipe.y = 0;
      this.discardNextMoves = 3;
      this.ignoreMouseDeltaUntil = performance.now() + suppressMs;
    };

    window.addEventListener('blur', () => resetTransientInputs(260));
    window.addEventListener('focus', () => {
      this.discardNextMoves = 3;
      this.ignoreMouseDeltaUntil = performance.now() + 260;
      this.mouseSwipe.x = 0;
      this.mouseSwipe.y = 0;
    });
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) resetTransientInputs(260);
      else {
        this.discardNextMoves = 3;
        this.ignoreMouseDeltaUntil = performance.now() + 260;
      }
    });
    document.addEventListener('pointerlockchange', () => {
      this.discardNextMoves = 3;
      this.ignoreMouseDeltaUntil = performance.now() + 240;
      this.mouseSwipe.x = 0;
      this.mouseSwipe.y = 0;
      if (document.pointerLockElement !== canvas) {
        this.lmbHeld = false;
        this.rmbHeld = false;
        dragging = false;
      }
    });

    canvas.addEventListener('click', () => {
      if (!this.paused && document.pointerLockElement !== canvas) {
        try {
          Promise.resolve(canvas.requestPointerLock?.()).catch(() => {});
        } catch {
          // ignore webview/iframe sandbox pointer-lock refusal
        }
      }
    });

    window.addEventListener('mousedown', (e) => {
      if (this.paused) return;
      if (e.target !== canvas && document.pointerLockElement !== canvas) return;
      if (e.button === 0) {
        if (this.loadoutPreset.rHand === 'saber') {
          this.requestSlashFlag = true;
        } else {
          this.requestShootFlag = true;
          this.lmbHeld = true;
        }
        dragging = true;
        lastDragX = e.clientX;
        lastDragY = e.clientY;
      } else if (e.button === 2) {
        if (this.loadoutPreset.lHand === 'shield') {
          this.rmbHeld = true;
        } else {
          this.requestSlashFlag = true;
        }
      }
    });

    window.addEventListener('mouseup', (e) => {
      dragging = false;
      if (e.button === 0) this.lmbHeld = false;
      if (e.button === 2) this.rmbHeld = false;
    });

    window.addEventListener('contextmenu', (e) => {
      if (e.target === canvas || document.pointerLockElement === canvas) {
        e.preventDefault();
      }
    });

    window.addEventListener(
      'wheel',
      (e) => {
        if (this.orbitActive) {
          this.orbitDistance = clamp(this.orbitDistance + e.deltaY * 0.004, 2.3, 9.5);
        }
      },
      { passive: true },
    );

    window.addEventListener('mousemove', (e) => {
      if (this.paused) return;
      const isLocked = document.pointerLockElement === canvas;
      if (!isLocked && !dragging) return;

      let rawDx = 0;
      let rawDy = 0;
      if (isLocked) {
        rawDx = e.movementX;
        rawDy = e.movementY;
      } else {
        // Unlocked fallback drag: compute delta strictly from clientX/Y so OS warp spikes never affect aim
        rawDx = e.clientX - lastDragX;
        rawDy = e.clientY - lastDragY;
        lastDragX = e.clientX;
        lastDragY = e.clientY;
      }

      const safe = sanitizeMouseLookDelta({
        movementX: rawDx,
        movementY: rawDy,
        hasFocus: document.hasFocus(),
        isHidden: document.hidden,
        ignoreUntilMs: this.ignoreMouseDeltaUntil,
        nowMs: performance.now(),
        discardRemaining: this.discardNextMoves,
      });
      if (this.discardNextMoves > 0) this.discardNextMoves -= 1;
      if (safe.discarded) return;

      // Record swipe impulse for mouse-directional Beam Saber slashes
      this.mouseSwipe.x = this.mouseSwipe.x * 0.55 + safe.dx;
      this.mouseSwipe.y = this.mouseSwipe.y * 0.55 + safe.dy;

      if (this.orbitActive && this.cameraMode !== CAMERA_MODES.FPS_COCKPIT) {
        this.orbitYaw -= safe.dx * 0.0055;
        this.orbitPitch = clamp(this.orbitPitch + safe.dy * 0.0045, -0.35, 0.85);
      } else {
        this.yaw -= safe.dx * 0.0024;
        this.pitch = clamp(this.pitch - safe.dy * 0.0019, -0.58, 0.72);
      }
    });
  }

  _syncDroppedGroundMeshes() {
    while (this.groundDropGroup.children.length > 0) {
      this.groundDropGroup.remove(this.groundDropGroup.children[0]);
    }
    this.droppedMeshes = [];

    for (const item of this.weaponState.droppedItems) {
      const holder = new THREE.Group();
      holder.position.set(item.x, item.y, item.z);
      holder.rotation.y = item.yaw;

      const template =
        item.kind === 'pistol' ? this.droppedTemplates.pistol : this.droppedTemplates.saberHilt;
      if (template) {
        const mesh = template.clone();
        mesh.scale.setScalar(1.0);
        mesh.rotation.set(Math.PI * 0.5, 0, 0);
        holder.add(mesh);
      } else {
        const fallback = new THREE.Mesh(
          new THREE.BoxGeometry(0.16, 0.12, 0.55),
          new THREE.MeshStandardMaterial({ color: '#8ca0b8', metalness: 0.7, roughness: 0.3 }),
        );
        holder.add(fallback);
      }

      const ring = new THREE.Mesh(
        new THREE.RingGeometry(0.32, 0.4, 24),
        new THREE.MeshBasicMaterial({
          color: item.kind === 'pistol' ? '#00e5ff' : '#ffaa33',
          side: THREE.DoubleSide,
          transparent: true,
          opacity: 0.78,
        }),
      );
      ring.rotation.x = -Math.PI / 2;
      ring.position.y = -0.05;
      holder.add(ring);

      this.groundDropGroup.add(holder);
      this.droppedMeshes.push(holder);
    }

    this._syncWeaponLoadoutVisibility();
  }

  _firePistol() {
    if (!this.weaponState.hasPistol || this.pistolCooldown > 0) {
      if (!this.weaponState.hasPistol) this.ui.showToast?.('右手光束手槍已丟棄！請靠近按 R 蹲下撿取');
      return;
    }
    this.pistolCooldown = 0.13;
    this.pistolRecoil = 1.0;
    this.cameraShake = Math.max(this.cameraShake, 0.025);
    this.audio.playShot();

    const origin = new THREE.Vector3();
    if (this.weaponNodes.pistol) {
      this.weaponNodes.pistol.getWorldPosition(origin);
    } else {
      origin.set(this.physics.x, this.physics.y + 1.45, this.physics.z);
    }

    const aimDir = new THREE.Vector3(0, 0, -1).applyEuler(new THREE.Euler(this.pitch, this.yaw, 0, 'YXZ'));
    const targetPt = this.camera.position.clone().addScaledVector(aimDir, 42);
    const shotDir = targetPt.sub(origin).normalize();

    const effColor = this.vfx.trailMat.color.getStyle();
    this.vfx.spawnBeamBolt(origin.addScaledVector(shotDir, 0.45), shotDir, effColor);
  }

  _startSaberSlash() {
    if (!this.weaponState.hasSaber || this.saberSwing.active) {
      if (!this.weaponState.hasSaber) this.ui.showToast?.('左手高出力光劍已丟棄！請靠近按 R 蹲下撿取');
      return;
    }
    const swipeMag = Math.hypot(this.mouseSwipe.x, this.mouseSwipe.y);
    // Default without big swipe: alternate overhead-to-ground downward diagonal chops (~61 deg / ~119 deg).
    // With active turn/swipe toward target: wind up on opposite shoulder ("逆向蓄力") & chop through look aim!
    let angleRad;
    if (swipeMag >= 5) {
      const chopBiasY = this.mouseSwipe.y + swipeMag * 0.28 + Math.max(0, -this.pitch) * 28;
      angleRad = Math.atan2(chopBiasY, this.mouseSwipe.x);
    } else if (this.pitch < -0.14) {
      angleRad = Math.PI * 0.5;
    } else {
      angleRad = this.saberSwing.combo % 2 === 0 ? Math.PI * 0.34 : Math.PI * 0.66;
    }
    const dir = classifyMouseSlashDirection(this.mouseSwipe.x, this.mouseSwipe.y, 7, this.saberSwing.combo);
    this.saberSwing = {
      active: true,
      t: 0,
      duration: 0.50,
      combo: (this.saberSwing.combo + 1) % 2,
      dir,
      angleRad,
      hitRegistered: false,
    };
    this.audio.playSaberSlash();
  }

  _resetCars() {
    if (!this.cars.length || !this.carInst.bodyMesh) return;
    const dObj = new THREE.Object3D();
    const tmpCol = new THREE.Color();
    this.cars.forEach((c, idx) => {
      c.hp = c.maxHp;
      c.state = 'intact';
      if (c.isMoving) {
        c.t = c.initT;
        c.x = c.axis === 'x' ? c.t : c.laneX;
        c.z = c.axis === 'z' ? c.t : c.laneZ;
      } else {
        c.x = c.initX;
        c.z = c.initZ;
      }
      c.y = 0;
      c.yaw = c.initYaw;
      c.vx = 0;
      c.vy = 0;
      c.vz = 0;
      c.rx = 0;
      c.ry = c.initYaw;
      c.rz = 0;
      c.rotVelX = 0;
      c.rotVelZ = 0;
      c.smokeTimer = 0;

      dObj.position.set(c.x, 0, c.z);
      dObj.rotation.set(0, c.yaw, 0);
      dObj.scale.set(1, 1, 1);
      dObj.updateMatrix();
      this.carInst.bodyMesh.setMatrixAt(idx, dObj.matrix);
      this.carInst.trimMesh.setMatrixAt(idx, dObj.matrix);
      this.carInst.lightMesh.setMatrixAt(idx, dObj.matrix);
      tmpCol.set(c.colorHex);
      this.carInst.bodyMesh.setColorAt(idx, tmpCol);
    });
    this.carInst.bodyMesh.instanceMatrix.needsUpdate = true;
    this.carInst.trimMesh.instanceMatrix.needsUpdate = true;
    this.carInst.lightMesh.instanceMatrix.needsUpdate = true;
    if (this.carInst.bodyMesh.instanceColor) this.carInst.bodyMesh.instanceColor.needsUpdate = true;
  }

  _wreckCar(car, impactCenter, launchPower = 5.5) {
    if (!car || car.state !== 'intact') return;
    car.hp = 0;
    car.state = 'flying';
    const dx = car.x - impactCenter.x;
    const dz = car.z - impactCenter.z;
    const dLen = Math.hypot(dx, dz) || 1;
    const nx = dx / dLen;
    const nz = dz / dLen;
    car.vx = nx * (launchPower * 0.75 + Math.random() * 2.4);
    car.vz = nz * (launchPower * 0.75 + Math.random() * 2.4);
    car.vy = launchPower * 0.88 + Math.random() * 2.2;
    car.rotVelX = (Math.random() > 0.5 ? 1 : -1) * (5.5 + Math.random() * 5.0);
    car.rotVelZ = (Math.random() > 0.5 ? 1 : -1) * (4.5 + Math.random() * 5.0);
    car.y = 0.08;

    const pos = new THREE.Vector3(car.x, 0.25, car.z);
    this.vfx.spawnImpactFlash(pos);
    this.vfx.spawnDebris(pos, 10);
    this.vfx.spawnDust(pos, 6);
    this.audio.playCarWreck();
    this.score.destroyed += 1;
    this.score.mcEarned += 35;

    if (this.carInst.bodyMesh) {
      this.carInst.bodyMesh.setColorAt(car.instIdx, new THREE.Color('#22262b'));
      if (this.carInst.bodyMesh.instanceColor) this.carInst.bodyMesh.instanceColor.needsUpdate = true;
    }
  }

  _applyDamageInSphere(center, radius, dmg, isMelee = false) {
    let landedHit = false;
    let hitMaterial = 'concrete';

    if (this.dummy && this.dummy.respawnTimer <= 0) {
      const dist = Math.hypot(center.x - this.dummy.x, center.z - this.dummy.z);
      if (dist <= radius + this.dummy.radius && center.y <= 3.0) {
        this.dummy.hp = Math.max(0, this.dummy.hp - dmg);
        this.dummy.hitFlash = 0.14;
        landedHit = true;
        hitMaterial = 'metal';
        if (this.dummy.hp <= 0) {
          this.dummy.respawnTimer = 4.0;
          this.dummy.group.visible = false;
          this.score.dummyKills += 1;
          this.score.mcEarned += 250;
          this.vfx.spawnDebris(new THREE.Vector3(this.dummy.x, 1.3, this.dummy.z), 22);
          this.audio.playCollapse();
        }
      }
    }

    // Check destructible miniature cars in blast/slash/shot radius
    if (center.y <= 1.25) {
      for (let i = 0; i < this.cars.length; i++) {
        const c = this.cars[i];
        if (c.state !== 'intact') continue;
        if (Math.hypot(center.x - c.x, center.z - c.z) <= radius + c.radius + 0.15) {
          c.hp -= dmg;
          landedHit = true;
          hitMaterial = 'metal';
          if (c.hp <= 0) {
            this._wreckCar(c, center, isMelee ? 7.6 : 5.4);
          }
        }
      }
    }

    for (let i = 0; i < this.destructibles.length; i++) {
      const b = this.destructibles[i];
      if (b.state === 'destroyed' || b.state === 'collapsing') continue;
      if (
        center.x >= b.x - b.halfW - radius &&
        center.x <= b.x + b.halfW + radius &&
        center.z >= b.z - b.halfD - radius &&
        center.z <= b.z + b.halfD + radius &&
        center.y <= b.height + radius
      ) {
        if (b.isInstanced) this._promoteInstancedBuilding(b);
        const updated = damageDestructibleProp(b, dmg);
        b.hp = updated.hp;
        b.state = updated.state;
        landedHit = true;
        if (b.state === 'collapsing') {
          this.score.destroyed += 1;
          this.score.mcEarned += Math.round(b.maxHp * 0.25);
          this.vfx.spawnDebris(new THREE.Vector3(b.x, b.height * 0.65, b.z), 24);
          this.vfx.spawnDust(new THREE.Vector3(b.x, 0.25, b.z), 10);
          this.audio.playCollapse();
          this.cameraShake = Math.max(this.cameraShake, 0.095);
        }
      }
    }

    if (landedHit) {
      this.audio.playHitConfirm(isMelee, hitMaterial);
      if (isMelee) {
        this.hitstopTimer = 0.042;
        this.cameraShake = Math.max(this.cameraShake, 0.065);
      }
    }
    return landedHit;
  }

  _handleProjectileStep(_prev, cur, dmg, proj) {
    if (proj?.fromEnemy) {
      // Check hit against player mecha torso / Energy Shield
      const pX = this.physics.x;
      const pY = this.physics.y + 1.35;
      const pZ = this.physics.z;
      const d = Math.hypot(cur.x - pX, cur.y - pY, cur.z - pZ);
      if (d <= 1.32) {
        const fwdX = -Math.sin(this.yaw);
        const fwdZ = -Math.cos(this.yaw);
        const incLen = Math.hypot(proj.vel.x, proj.vel.z) || 1;
        // Shot approaching from front yields positive frontDot
        const frontDot = clamp((-proj.vel.x / incLen) * fwdX + (-proj.vel.z / incLen) * fwdZ, -1, 1);
        const res = evaluateShieldIncomingHit(this.shieldState, { dmg, isMelee: false, frontDot });
        if (res.outcome === 'parry') {
          this.shieldState.flashTimer = 0.30;
          this.audio.playShieldParry(true);
          this.vfx.spawnSparks(cur, '#ffe86b', 18, 10);
          this.parryRecoil = { active: true, t: 0, duration: 0.36 };
          this.cameraShake = Math.max(this.cameraShake, 0.055);
          this.ui.showToast?.('⚡ PERFECT PARRY！光劍/光彈完全彈反');
          return 'reflect';
        }
        if (res.outcome === 'block') {
          this.shieldState.flashTimer = 0.14;
          this.physics.en = Math.max(0, this.physics.en - res.enDrain);
          this.playerHp = Math.max(0, this.playerHp - res.damageTaken);
          this.audio.playShieldParry(false);
          this.vfx.spawnSparks(cur, '#38e8ff', 10, 6);
          this.parryRecoil = { active: true, t: 0, duration: 0.24 };
          return true;
        }
        this.playerHp = Math.max(0, this.playerHp - res.damageTaken);
        this.audio.playBulletHit('metal');
        this.vfx.spawnSparks(cur, '#ff5544', 8, 6);
        this.cameraShake = Math.max(this.cameraShake, 0.04);
        return true;
      }
      // Solid building obstruction check for enemy rounds
      for (let i = 0; i < this.destructibles.length; i++) {
        const b = this.destructibles[i];
        if (b.state === 'destroyed') continue;
        if (
          cur.x >= b.x - b.halfW - 0.3 &&
          cur.x <= b.x + b.halfW + 0.3 &&
          cur.z >= b.z - b.halfD - 0.3 &&
          cur.z <= b.z + b.halfD + 0.3 &&
          cur.y <= b.height
        ) {
          this.audio.playBulletHit('concrete');
          return true;
        }
      }
      return false;
    }

    return this._applyDamageInSphere(cur, 0.45, dmg, false);
  }

  _updateDestructiblesAndDummy(dt) {
    for (const b of this.destructibles) {
      if (b.state === 'damaged' && b.bodyMat) {
        const hpRatio = b.hp / b.maxHp;
        if (hpRatio < 0.65) {
          const scorch = clamp((0.65 - hpRatio) / 0.65, 0, 1);
          const tone = 1 - scorch * 0.42;
          b.bodyMat.color.setRGB(tone, tone * 0.96, tone * 0.94);
          b.dustAccum += dt;
          if (b.dustAccum >= 0.45 - scorch * 0.22) {
            b.dustAccum = 0;
            this.vfx.spawnDust(
              new THREE.Vector3(
                b.x + (Math.random() - 0.5) * b.w * 0.6,
                b.height * (0.35 + Math.random() * 0.45),
                b.z + (Math.random() - 0.5) * b.d * 0.6,
              ),
              2,
            );
          }
        }
        if (hpRatio < 0.35) {
          b.bodyMat.emissive.set('#ff3a08');
          b.bodyMat.emissiveIntensity = ((0.35 - hpRatio) / 0.35) * 0.55;
        }
      } else if (b.state === 'collapsing' && b.group) {
        // Dramatic prolonged 3.2-second multi-stage skyscraper collapse; stays SOLID until p >= 1.0!
        b.collapseProgress = Math.min(1, b.collapseProgress + dt * 0.31);
        const p = b.collapseProgress;

        if (p < 0.2) {
          // Stage 1 (0..0.64s): Violent column-shear structural shudder before toppling
          const amp = (1 - p / 0.2) * 0.09 + 0.04;
          b.group.position.set(b.x + (Math.random() - 0.5) * amp * 2, -b.height * 0.04 * (p / 0.2), b.z + (Math.random() - 0.5) * amp * 2);
          b.group.rotation.x = b.collapseDirZ * p * 0.18;
          b.group.rotation.z = b.collapseDirX * p * 0.18;
        } else {
          // Stage 2 (0.64..3.22s): Progressive topple + floor-by-floor pancake sink into ground
          const fallT = (p - 0.2) / 0.8;
          const easeFall = fallT * fallT * (1.25 - 0.25 * fallT);
          b.group.position.set(b.x + b.collapseDirX * fallT * 0.65, -b.height * 1.16 * easeFall, b.z + b.collapseDirZ * fallT * 0.65);
          b.group.rotation.x = b.collapseDirZ * (0.04 + easeFall * 0.68);
          b.group.rotation.z = b.collapseDirX * (0.04 + easeFall * 0.68);
        }

        b.dustAccum += dt;
        if (b.dustAccum >= 0.11) {
          b.dustAccum = 0;
          this.vfx.spawnDust(
            new THREE.Vector3(
              b.x + (Math.random() - 0.5) * b.w * 0.9,
              Math.max(0.18, b.height * (1 - p) * 0.55),
              b.z + (Math.random() - 0.5) * b.d * 0.9,
            ),
            4,
          );
        }
        b.boomAccum += dt;
        if (b.boomAccum >= 0.36) {
          b.boomAccum = 0;
          const bPt = new THREE.Vector3(
            b.x + (Math.random() - 0.5) * b.w * 0.7,
            Math.max(0.3, b.height * (1 - p) * 0.45),
            b.z + (Math.random() - 0.5) * b.d * 0.7,
          );
          this.vfx.spawnDebris(bPt, 6);
          this.vfx.spawnImpactFlash(bPt);
          this.cameraShake = Math.max(this.cameraShake, 0.045);
        }

        if (p >= 1) {
          b.state = 'destroyed';
          b.group.visible = false;
          this.vfx.spawnLandingShockRing(new THREE.Vector3(b.x, 0.05, b.z));
          this.vfx.spawnDust(new THREE.Vector3(b.x, 0.35, b.z), 12);
        }
      }
    }

    if (this.dummy) {
      if (this.dummy.hitFlash > 0) {
        this.dummy.hitFlash -= dt;
        this.dummy.armorMat.emissive.set('#ffffff');
        this.dummy.armorMat.emissiveIntensity = 1.6;
      } else {
        this.dummy.armorMat.emissive.set('#000000');
        this.dummy.armorMat.emissiveIntensity = 0;
      }
      if (this.dummy.respawnTimer > 0) {
        this.dummy.respawnTimer -= dt;
        if (this.dummy.respawnTimer <= 0) {
          this.dummy.hp = this.dummy.maxHp;
          this.dummy.group.visible = true;
        }
      } else {
        // Periodically fire slow crimson test beam bolts toward player to practice Shield Block & Parry
        this.dummyFireTimer -= dt;
        if (this.dummyFireTimer <= 0) {
          this.dummyFireTimer = 2.6;
          const distToPlayer = Math.hypot(this.physics.x - this.dummy.x, this.physics.z - this.dummy.z);
          if (distToPlayer > 2.2 && distToPlayer < 46) {
            const origin = new THREE.Vector3(this.dummy.x, 1.58, this.dummy.z);
            const target = new THREE.Vector3(this.physics.x, this.physics.y + 1.35, this.physics.z);
            const dir = target.sub(origin).normalize();
            this.vfx.spawnEnemyTestBolt(origin.addScaledVector(dir, 0.9), dir);
          }
        }
      }
    }
  }

  _animate(now) {
    requestAnimationFrame(this._animate);
    const rawDt = Math.min(0.05, (now - this.lastTime) / 1000);
    this.lastTime = now;

    // Gentle decay of mouse swipe buffer & camera shake
    this.mouseSwipe.x *= Math.exp(-16 * rawDt);
    this.mouseSwipe.y *= Math.exp(-16 * rawDt);
    this.cameraShake = Math.max(0, this.cameraShake - rawDt * 0.25);

    if (this.paused) {
      this.audio.updateJetThruster(0);
      this.composer.render();
      return;
    }

    if (this.hitstopTimer > 0) {
      this.hitstopTimer -= rawDt;
      this.composer.render();
      return;
    }

    const dt = rawDt;

    // 1. Input vector
    const strafe = (this.keys.has('KeyD') ? 1 : 0) - (this.keys.has('KeyA') ? 1 : 0);
    const fwdInput = (this.keys.has('KeyW') ? 1 : 0) - (this.keys.has('KeyS') ? 1 : 0);
    const isMoving = strafe !== 0 || fwdInput !== 0;
    const jumpHeld = this.keys.has('Space');
    const quickBoost = this.keys.has('ShiftLeft') || this.keys.has('ShiftRight');

    const cosY = Math.cos(this.yaw);
    const sinY = Math.sin(this.yaw);
    const worldMoveX = strafe * cosY - fwdInput * sinY;
    const worldMoveZ = -strafe * sinY - fwdInput * cosY;

    // 2. Drop & Crouch Pickup
    if (this.requestDropFlag) {
      this.requestDropFlag = false;
      const before = this.weaponState.droppedItems.length;
      this.weaponState = triggerDropWeapons(this.weaponState, this.physics, this.yaw);
      if (this.weaponState.droppedItems.length !== before) {
        this._syncDroppedGroundMeshes();
        this.ui.showToast?.('已放下光束手槍與大光劍 — 靠近按 R 可蹲下撿起');
      }
    }

    const hadPickup = this.weaponState.attachedInSweep;
    this.weaponState = stepWeaponPickup(this.weaponState, this.physics, this.requestPickupFlag, dt);
    if (this.requestPickupFlag) {
      if (!this.weaponState.pickingUp && this.weaponState.droppedItems.length > 0) {
        this.ui.showToast?.('距離掉落武器太遠！請靠近至 3.6m 內再按 R');
      }
      this.requestPickupFlag = false;
    }
    if (!hadPickup && this.weaponState.attachedInSweep) {
      this._syncDroppedGroundMeshes();
      this.audio.playPickup();
      this.ui.showToast?.('完成蹲下拾取！手槍與高出力光劍已重新就緒');
    }

    // 3. Weapons (single shot / Mode 1-2 LMB pistol autofire, Mode 3 LMB saber, Shield Defense)
    this.pistolCooldown = Math.max(0, this.pistolCooldown - dt);
    this.pistolRecoil = Math.max(0, this.pistolRecoil - dt * 5.2);
    if (
      this.loadoutPreset.rHand === 'pistol' &&
      (this.requestShootFlag || (this.lmbHeld && this.pistolCooldown <= 0 && this.weaponState.hasPistol))
    ) {
      this.requestShootFlag = false;
      this._firePistol();
    } else if (this.requestShootFlag && this.loadoutPreset.rHand === 'saber') {
      this.requestShootFlag = false;
      this._startSaberSlash();
    }
    if (this.requestSlashFlag) {
      this.requestSlashFlag = false;
      this._startSaberSlash();
    }

    const guardHeld = this.loadoutPreset.lHand === 'shield' && (this.rmbHeld || this.keys.has('KeyE'));
    const prevBarrier = this.shieldState.barrierActive;
    this.shieldState = stepShieldDefense(this.shieldState, {
      guardHeld,
      hasShield: this.loadoutPreset.lHand === 'shield',
      en: this.physics.en,
      dt,
    });
    if (!prevBarrier && this.shieldState.barrierActive) {
      this.audio.playShieldToggle(true);
    } else if (prevBarrier && !this.shieldState.barrierActive) {
      this.audio.playShieldToggle(false);
    }

    // 4. Flight / Walk Physics ODE (Shift/Space boost strictly gated on EN > 0.5)
    const boostAvailable = quickBoost && this.physics.en > 0.5;
    const hoverAvailable = jumpHeld && this.physics.en > 0.5;
    const walkOnly = this.physics.grounded && !boostAvailable && !hoverAvailable && !this.weaponState.pickingUp;
    const boostBankTarget = walkOnly ? { rollRad: 0, pitchRad: 0 } : computeSkateTilt({ strafe, forward: fwdInput });
    this.skateTiltSmooth.rollRad = lerp(this.skateTiltSmooth.rollRad, boostBankTarget.rollRad, 1 - Math.exp(-10 * dt));
    this.skateTiltSmooth.pitchRad = lerp(this.skateTiltSmooth.pitchRad, boostBankTarget.pitchRad, 1 - Math.exp(-10 * dt));

    this.prevVy = this.physics.vy;
    const prevPhysicsY = this.physics.y;
    this.physics = stepAerialFlight(
      this.physics,
      {
        moveX: worldMoveX,
        moveZ: worldMoveZ,
        jumpHeld,
        quickBoost,
        walkOnly,
        throttle: 1.0,
        pitchRad: this.skateTiltSmooth.pitchRad,
        rollRad: this.skateTiltSmooth.rollRad,
      },
      dt,
      this.massThrust,
    );

    const colRes = resolveWorldCollisions(this.physics, prevPhysicsY, this.destructibles, this.dummy);
    this.physics = colRes.physics;
    this.supportHeight = colRes.supportHeight;

    const rFromCtr = Math.hypot(this.physics.x, this.physics.z);
    if (rFromCtr > ARENA_RADIUS - 1.2) {
      const s = (ARENA_RADIUS - 1.2) / rFromCtr;
      this.physics.x *= s;
      this.physics.z *= s;
    }

    // Smooth decay of mouse swipe so idle clicks fall cleanly back to overhead diagonal downward chop
    const swipeDecay = Math.exp(-10 * dt);
    this.mouseSwipe.x *= swipeDecay;
    this.mouseSwipe.y *= swipeDecay;

    // Advance street traffic, simulate flying crushed cars, and stomp-crush intact cars underfoot!
    const horzSpeedNow = Math.hypot(this.physics.vx, this.physics.vz);
    if (this.carInst.bodyMesh && this.cars.length) {
      const mObj = new THREE.Object3D();
      const zeroObj = new THREE.Object3D();
      zeroObj.scale.set(0, 0, 0);
      zeroObj.updateMatrix();
      let matrixDirty = false;

      for (let i = 0; i < this.cars.length; i++) {
        const c = this.cars[i];
        if (c.state === 'intact') {
          if (c.isMoving) {
            c.t += c.dir * c.speed * dt;
            if (c.t > 68) c.t = -68;
            if (c.t < -68) c.t = 68;
            c.x = c.axis === 'x' ? c.t : c.laneX;
            c.z = c.axis === 'z' ? c.t : c.laneZ;
            mObj.position.set(c.x, 0, c.z);
            mObj.rotation.set(0, c.yaw, 0);
            mObj.scale.set(1, 1, 1);
            mObj.updateMatrix();
            this.carInst.bodyMesh.setMatrixAt(i, mObj.matrix);
            this.carInst.trimMesh.setMatrixAt(i, mObj.matrix);
            this.carInst.lightMesh.setMatrixAt(i, mObj.matrix);
            matrixDirty = true;
          }

          // Mecha direct foot stomp / dash-ram crushes and launches cars cleanly!
          if (
            this.physics.y <= 0.48 &&
            (horzSpeedNow > 0.75 || this.prevVy < -1.2) &&
            Math.hypot(this.physics.x - c.x, this.physics.z - c.z) <= 0.85
          ) {
            this._wreckCar(c, new THREE.Vector3(this.physics.x, 0.1, this.physics.z), Math.max(5.2, horzSpeedNow * 0.95));
            this.cameraShake = Math.max(this.cameraShake, 0.045);
          }
        } else if (c.state === 'flying') {
          c.vy -= 14.5 * dt;
          c.x += c.vx * dt;
          c.y += c.vy * dt;
          c.z += c.vz * dt;
          c.rx += c.rotVelX * dt;
          c.rz += c.rotVelZ * dt;
          if (c.y <= 0.07) {
            c.y = 0.07;
            if (Math.abs(c.vy) > 1.6) {
              c.vy = -c.vy * 0.32;
              c.vx *= 0.55;
              c.vz *= 0.55;
              c.rotVelX *= 0.45;
              c.rotVelZ *= 0.45;
              this.vfx.spawnDust(new THREE.Vector3(c.x, 0.1, c.z), 4);
            } else {
              c.state = 'wreck';
              c.vx = 0;
              c.vy = 0;
              c.vz = 0;
            }
          }
          mObj.position.set(c.x, c.y, c.z);
          mObj.rotation.set(c.rx, c.ry, c.rz);
          mObj.scale.set(1, 1, 1);
          mObj.updateMatrix();
          this.carInst.bodyMesh.setMatrixAt(i, mObj.matrix);
          this.carInst.trimMesh.setMatrixAt(i, mObj.matrix);
          this.carInst.lightMesh.setMatrixAt(i, zeroObj.matrix);
          matrixDirty = true;
        } else if (c.state === 'wreck') {
          c.smokeTimer += dt;
          if (c.smokeTimer > 0.65 && Math.random() < 0.35) {
            c.smokeTimer = 0;
            this.vfx.spawnDust(new THREE.Vector3(c.x, 0.16, c.z), 1);
          }
        }
      }

      if (matrixDirty) {
        this.carInst.bodyMesh.instanceMatrix.needsUpdate = true;
        this.carInst.trimMesh.instanceMatrix.needsUpdate = true;
        this.carInst.lightMesh.instanceMatrix.needsUpdate = true;
      }
    }

    // 5. Hydraulic Walk Gait Cycle & 4-Layer Mechanical Footstep Events + Rooftop/Ground Suspension
    const horzSpeed = horzSpeedNow;
    const rawAccel = (horzSpeed - this.prevHorzSpeed) / Math.max(0.005, dt);
    this.prevHorzSpeed = horzSpeed;
    const targetWalkLean = walkOnly && isMoving ? clamp(rawAccel * 0.35 + fwdInput * 3.5, -5.5, 6.5) : 0;
    this.walkLeanSmooth = lerp(this.walkLeanSmooth, targetWalkLean, 1 - Math.exp(-8 * dt));

    const shouldWalk = walkOnly && isMoving && this.physics.grounded;
    this.walkBlend = lerp(this.walkBlend, shouldWalk ? 1 : 0, 1 - Math.exp(-12 * dt));

    if (shouldWalk) {
      const prevPhase = this.walkPhase;
      this.walkPhase += dt * (3.1 + horzSpeed * 0.40);
      // Stage-1 mechanical leg-lift servo whir at half-step onset (L/R stereo!)
      const liftFoot = detectWalkFootstep(prevPhase - Math.PI * 0.52, this.walkPhase - Math.PI * 0.52);
      if (liftFoot) {
        this.audio.playServoLift(liftFoot);
      }
      // Stage-2 heavy steel impact & chassis ring on foot plant (street or rooftop!)
      const stepFoot = detectWalkFootstep(prevPhase, this.walkPhase);
      if (stepFoot) {
        this.audio.playFootstep(false, stepFoot);
        const sideSign = stepFoot === 'L' ? 1 : -1;
        this.vfx.spawnDust(
          new THREE.Vector3(this.physics.x + sideSign * Math.cos(this.yaw) * 0.42, this.physics.y + 0.05, this.physics.z - sideSign * Math.sin(this.yaw) * 0.42),
          5,
        );
      }
    }

    if (this.physics.grounded && this.prevVy < -2.2) {
      this.audio.playFootstep(true, 'C');
      this.cameraShake = Math.max(this.cameraShake, 0.06);
      this.vfx.spawnLandingShockRing(new THREE.Vector3(this.physics.x, this.physics.y + 0.04, this.physics.z));
    }

    const clearanceY = Math.max(0, this.physics.y - this.supportHeight);
    this.suspension = stepLandingSuspension(this.suspension, {
      footY: clearanceY,
      impactVy: this.physics.grounded ? this.prevVy : 0,
      dt,
    });

    const crouch = this.weaponState.crouchBlend;
    const gait = computeWalkCycle({
      phaseRad: this.walkPhase,
      speedNorm: clamp(horzSpeed / 6.5, 0, 1) * this.walkBlend,
      active: this.walkBlend > 0.02,
      forwardNorm: fwdInput,
      strafeNorm: strafe,
    });

    const ik = solveGroundFootAlignment({
      pelvisY: clearanceY + 1.04,
      standHeightM: 1.04,
      hipFlareDeg: 13.0,
      hipPitchDeg: walkOnly ? gait.hipPitchLDeg : 10 + fwdInput * 8,
      kneePitchDeg: walkOnly ? gait.kneePitchLDeg : -16 - Math.abs(fwdInput) * 6,
      crouchBlend: crouch,
    });

    // 6. Position Mecha Root + Pose Bones
    this.mechaRoot.position.set(
      this.physics.x,
      this.physics.y + this.suspension.deflectionY + gait.pelvisBobM * (1 - crouch),
      this.physics.z,
    );
    this.mechaRoot.rotation.set(
      this.skateTiltSmooth.pitchRad * 0.55,
      this.yaw,
      -this.skateTiltSmooth.rollRad,
      'YXZ',
    );

    // 360-deg Continuous "Badminton Whip" Saber Kinetic Chain & Stationary Lunge Stance
    let saberShoulderX = 28;
    let saberShoulderY = 6;
    let saberShoulderZ = 16;
    let saberElbowX = 34;
    let saberWristX = 6;
    let saberWristY = -4;
    let saberWristZ = 10;
    let slashTorsoTwist = 0;
    let slashTorsoPitch = 0;
    let lungeWeight = 0;
    let rightArmRetractDeg = 0;

    if (this.saberSwing.active) {
      this.saberSwing.t += dt;
      const u = clamp(this.saberSwing.t / this.saberSwing.duration, 0, 1);
      const sp = computeContinuousSaberPose(this.saberSwing.angleRad, u, this.pitch);
      saberShoulderX = sp.shoulderXDeg;
      saberShoulderY = sp.shoulderYDeg;
      saberShoulderZ = sp.shoulderZDeg;
      saberElbowX = sp.elbowXDeg;
      saberWristX = sp.wristXDeg;
      saberWristY = sp.wristYDeg;
      saberWristZ = sp.wristZDeg;
      slashTorsoTwist = sp.torsoTwistDeg;
      slashTorsoPitch = sp.torsoPitchDeg;
      lungeWeight = sp.lungeWeight;
      rightArmRetractDeg = sp.rightArmRetractDeg;

      if (!this.saberSwing.hitRegistered && u >= 0.3) {
        this.saberSwing.hitRegistered = true;
        const slashCtr = new THREE.Vector3(
          this.physics.x - Math.sin(this.yaw) * 2.45,
          this.physics.y + 1.3,
          this.physics.z - Math.cos(this.yaw) * 2.45,
        );
        this._applyDamageInSphere(slashCtr, 2.5, 68, true);
      }
      if (u >= 1) this.saberSwing.active = false;
    }

    let recoilPose = { torsoPitchDeg: 0, torsoTwistDeg: 0, armRecoilDeg: 0, shoulderZDeg: 0, pelvisPitchDeg: 0 };
    if (this.parryRecoil.active) {
      this.parryRecoil.t += dt;
      const ru = clamp(this.parryRecoil.t / this.parryRecoil.duration, 0, 1);
      recoilPose = computeParryRecoilPose(ru);
      if (ru >= 1) this.parryRecoil.active = false;
    }

    const lungeW = lungeWeight * (1 - crouch) * (1 - ik.alphaAir);
    if (this.bones.Pelvis?.userData.restPos) {
      this.bones.Pelvis.position.copy(this.bones.Pelvis.userData.restPos);
      this.bones.Pelvis.position.x += gait.pelvisShiftXM * (1 - crouch) * (1 - ik.alphaAir) * (1 - lungeW);
      this.bones.Pelvis.position.y -= ik.pelvisDropM + lungeW * 0.16;
    }

    const idleBreathPitch = !shouldWalk && !this.saberSwing.active ? Math.sin(now * 0.0022) * 0.8 : 0;
    const pelvisBaseYaw = lerp(gait.pelvisYawDeg, -8, (1 - this.walkBlend) * (1 - crouch));
    this._poseBone('Pelvis', 4 + crouch * 8 + lungeW * 12 + recoilPose.pelvisPitchDeg, lerp(pelvisBaseYaw, -16, lungeW), gait.pelvisRollDeg * (1 - lungeW));
    this._poseBone(
      'Torso',
      lerp(6 + this.walkLeanSmooth + (gait.torsoPitchBobDeg || 0) + slashTorsoPitch + idleBreathPitch + recoilPose.torsoPitchDeg, 34, crouch),
      lerp(gait.torsoTwistDeg + slashTorsoTwist + recoilPose.torsoTwistDeg, 4, crouch),
      -gait.pelvisRollDeg * 0.45 * (1 - lungeW),
    );
    this._poseBone('Head', lerp(-4 + this.pitch * 35 + idleBreathPitch * 0.5 - recoilPose.torsoPitchDeg * 0.45, -24, crouch), lerp(-4, -8, lungeW), 0);

    // Legs + Anti-clipping Front Skirts + Wide Armored A-Frame Stance + 3-Phase Walk
    const wBlend = this.walkBlend * (1 - crouch) * (1 - ik.alphaAir) * (1 - lungeW);
    this._poseBone('FrontSkirt_L', Math.max(ik.frontSkirtPitchDeg, lerp(12, gait.frontSkirtPitchLDeg, wBlend), lungeW * 48), -8, ik.frontSkirtFlareDeg + gait.hipRollLDeg * 0.4 * wBlend);
    this._poseBone('FrontSkirt_R', Math.max(ik.frontSkirtPitchDeg, lerp(12, gait.frontSkirtPitchRDeg, wBlend)), 8, -ik.frontSkirtFlareDeg + gait.hipRollRDeg * 0.4 * wBlend);

    this._poseBone('Leg_Upper_L', lerp(ik.hipPitchDeg, 36, lungeW), -5, lerp(ik.hipFlareDeg, ik.hipFlareDeg + gait.hipRollLDeg, wBlend));
    this._poseBone('Leg_Lower_L', lerp(ik.kneePitchDeg, -48, lungeW), 0, 0);
    this._poseBone('Foot_L', lerp(lerp(ik.anklePitchDeg, gait.anklePitchLDeg, wBlend), 12, lungeW), 0, lerp(ik.ankleRollLDeg, ik.ankleRollLDeg + gait.ankleRollStepLDeg, wBlend));

    const idleOrSkateHipR = lerp(-6 + fwdInput * 6, ik.hipPitchDeg, Math.max(crouch, ik.alphaAir));
    const idleOrSkateKneeR = lerp(-12 - Math.abs(fwdInput) * 6, ik.kneePitchDeg, Math.max(crouch, ik.alphaAir));
    const idleOrSkateAnkleR = -(idleOrSkateHipR + idleOrSkateKneeR);

    this._poseBone('Leg_Upper_R', lerp(lerp(idleOrSkateHipR, gait.hipPitchRDeg, wBlend), -24, lungeW), 5, lerp(-ik.hipFlareDeg, -ik.hipFlareDeg + gait.hipRollRDeg, wBlend));
    this._poseBone('Leg_Lower_R', lerp(lerp(idleOrSkateKneeR, gait.kneePitchRDeg, wBlend), -14, lungeW), 0, 0);
    this._poseBone(
      'Foot_R',
      lerp(lerp(lerp(idleOrSkateAnkleR, ik.anklePitchDeg, Math.max(crouch, ik.alphaAir)), gait.anklePitchRDeg, wBlend), 38, lungeW),
      0,
      lerp(ik.ankleRollRDeg, ik.ankleRollRDeg + gait.ankleRollStepRDeg, wBlend),
    );

    // 7. Wings + Realistic 1000 C Combustion Rocket Plumes (EN-gated) + Thruster Ignition & Dual-Layer Audio!
    const boostNow = boostAvailable || hoverAvailable;
    if (boostNow && !this.prevBoostActive) {
      this.audio.playThrusterIgnite();
    }
    this.prevBoostActive = boostNow;

    const targetJet = hoverAvailable ? (boostAvailable ? 1.0 : 0.78) : boostAvailable ? 0.92 : 0;
    this.jetIntensitySmooth = lerp(this.jetIntensitySmooth, targetJet, 1 - Math.exp(-14 * dt));
    this.audio.updateJetThruster(this.jetIntensitySmooth, clamp(horzSpeed / 16, 0, 1));

    const wingOpen = ik.boosterFlareDeg + (boostAvailable ? 16 : 0) + (hoverAvailable ? 12 : 0);
    this._poseBone('Wing_L1', 8 + wingOpen * 0.4, 8, -10 - wingOpen);
    this._poseBone('Wing_R1', 8 + wingOpen * 0.4, -8, 10 + wingOpen);
    this._poseBone('Wing_L2', -6 - wingOpen * 0.3, 6, -6 - wingOpen * 0.6);
    this._poseBone('Wing_R2', -6 - wingOpen * 0.3, -6, 6 + wingOpen * 0.6);

    const timeSec = now * 0.001;
    for (let i = 0; i < this.thrusterPlumes.length; i++) {
      const tp = this.thrusterPlumes[i];
      if (this.jetIntensitySmooth > 0.04) {
        tp.rig.visible = true;
        const flicker = 0.88 + Math.sin(now * 0.055 + i * 1.7) * 0.14;
        const plumeLen = tp.baseLen * (0.4 + this.jetIntensitySmooth * 0.85) * flicker;
        const plumeWidth = 0.78 + this.jetIntensitySmooth * 0.36;
        tp.rig.scale.set(plumeWidth, plumeLen, plumeWidth);
        tp.outerMat.uniforms.uTime.value = timeSec;
        tp.outerMat.uniforms.uIntensity.value = this.jetIntensitySmooth;
        tp.coreMat.uniforms.uTime.value = timeSec;
        tp.coreMat.uniforms.uIntensity.value = this.jetIntensitySmooth;
        if (Math.random() < 0.38 && i < 2) {
          const wp = new THREE.Vector3();
          const wd = tp.localDir.clone().transformDirection(tp.rig.matrixWorld);
          tp.rig.getWorldPosition(wp);
          this.vfx.spawnThrusterEmber(wp, wd, '#ff6818', 1);
        }
      } else {
        tp.rig.visible = false;
      }
    }

    // 8. Arms & Weapon Pose (Mode 1/2/3 Loadout + Composite Shield Guard + Parry Recoil + Saber Whip)
    const aimPitchDeg = clamp(this.pitch * 50, -28, 32);
    const recoilKick = this.pistolRecoil * 14;
    const yieldOffset = rightArmRetractDeg * (1 - crouch);
    const rUsesSaber = this.loadoutPreset.rHand === 'saber';
    const lHasShield = this.loadoutPreset.lHand === 'shield';
    const gBlend = lHasShield ? this.shieldState.guardBlend : 0;

    if (rUsesSaber) {
      this._poseBone(
        'Arm_Upper_R',
        lerp(saberShoulderX + recoilPose.armRecoilDeg * 0.6, 56, crouch),
        lerp(-saberShoulderY, -4, crouch),
        lerp(-saberShoulderZ - recoilPose.shoulderZDeg * 0.5, -14, crouch),
      );
      this._poseBone('Arm_Lower_R', lerp(saberElbowX + recoilPose.armRecoilDeg * 0.4, 12, crouch), lerp(8, 4, crouch), lerp(8, 8, crouch));
      this._poseBone('Hand_R', lerp(saberWristX, 8, crouch), lerp(-saberWristY, 0, crouch), lerp(-saberWristZ, -4, crouch));
    } else {
      this._poseBone(
        'Arm_Upper_R',
        lerp(52 + aimPitchDeg + recoilKick + gait.weaponStompDipDeg - yieldOffset * 0.65 + recoilPose.armRecoilDeg * 0.5, 56, crouch),
        lerp(-8 - yieldOffset * 0.45, -4, crouch),
        lerp(-12 - yieldOffset * 0.8 - recoilPose.shoulderZDeg * 0.35, -14, crouch),
      );
      this._poseBone('Arm_Lower_R', lerp(20 + recoilKick * 0.5 + yieldOffset * 0.8, 12, crouch), 4, lerp(4, 8, crouch));
      this._poseBone('Hand_R', 0, 0, 0);
    }

    if (lHasShield) {
      // Ready: comfortably beside/ahead of left hand; Guard: matches exact Inverse-Guard-Basis arm pose ("手放在前面舉著")
      const shUpperX = lerp(24, 64, gBlend) + recoilPose.armRecoilDeg * 0.45;
      const shUpperY = lerp(-4, -26, gBlend);
      const shUpperZ = lerp(18, 12, gBlend) + recoilPose.shoulderZDeg * 0.4;
      const shLowerX = lerp(26, 24, gBlend);
      const shLowerY = lerp(6, 18, gBlend);
      const shLowerZ = lerp(0, -6, gBlend);
      this._poseBone('Arm_Upper_L', lerp(shUpperX + gait.armSwingDeg * 0.25, 58, crouch), lerp(shUpperY, 4, crouch), lerp(shUpperZ, 14, crouch));
      this._poseBone('Arm_Lower_L', lerp(shLowerX, 12, crouch), lerp(shLowerY, 0, crouch), lerp(shLowerZ, -8, crouch));
      this._poseBone('Hand_L', 0, 0, 0);
    } else {
      this._poseBone(
        'Arm_Upper_L',
        lerp(saberShoulderX + gait.armSwingDeg * 0.4 + recoilPose.armRecoilDeg * 0.5, 58, crouch),
        lerp(saberShoulderY, 4, crouch),
        lerp(saberShoulderZ + recoilPose.shoulderZDeg * 0.4, 14, crouch),
      );
      this._poseBone('Arm_Lower_L', lerp(saberElbowX, 12, crouch), lerp(-8, 0, crouch), lerp(-8, -8, crouch));
      this._poseBone('Hand_L', lerp(saberWristX, 8, crouch), lerp(saberWristY, 0, crouch), lerp(saberWristZ, 4, crouch));
    }

    if (this.shieldNodes.barrierMesh && this.shieldNodes.barrierMat) {
      const showBarrier = lHasShield && (this.shieldState.guardBlend > 0.05 || this.shieldState.flashTimer > 0);
      this.shieldNodes.barrierMesh.visible = showBarrier;
      if (showBarrier) {
        this.shieldNodes.barrierMat.uniforms.uTime.value = timeSec;
        this.shieldNodes.barrierMat.uniforms.uOpacity.value = clamp(
          Math.max(this.shieldState.guardBlend * 0.82, this.shieldState.flashTimer * 2.8),
          0,
          0.95,
        );
        this.shieldNodes.barrierMat.uniforms.uFlash.value = clamp(this.shieldState.flashTimer / 0.28, 0, 1);
      }
    }

    this.mechaRoot.updateMatrixWorld(true);

    // 9. Tapered, Flickering Coaxial Plasma Saber & Ribbon Trail
    if (this.saberFx.coreMat?.uniforms?.uTime) {
      this.saberFx.coreMat.uniforms.uTime.value = timeSec;
    }
    if (this.saberFx.auraMat?.uniforms?.uTime) {
      this.saberFx.auraMat.uniforms.uTime.value = timeSec;
    }
    if (this.weaponNodes.saberBlade && this.saberFx.light) {
      const lit = this.weaponState.hasSaber && this.weaponState.saberIgnited;
      this.saberFx.light.intensity = lit ? 0.62 + 0.14 * Math.sin(now * 0.048) + 0.08 * Math.sin(now * 0.117) : 0;
    }

    if (this.weaponNodes.saberBlade && this.saberSwing.active && this.weaponState.saberIgnited) {
      const saberRef =
        this.loadoutPreset.rHand === 'saber' && this.shieldNodes.saberRightGroup
          ? this.shieldNodes.saberRightGroup
          : this.weaponNodes.saberBlade;
      const rootPos = saberRef.localToWorld(this.saberFx.baseLocal.clone());
      const tipPos = saberRef.localToWorld(this.saberFx.tipLocal.clone());
      this.vfx.pushSaberTrailSample(rootPos, tipPos, true);
    } else {
      this.vfx.pushSaberTrailSample(null, null, false);
    }

    // 10. Projectiles & Destructibles
    this.vfx.update(dt, (prev, cur, dmg, proj) => this._handleProjectileStep(prev, cur, dmg, proj));
    this._updateDestructiblesAndDummy(dt);

    // 11. Camera Mode (FPS Cockpit <-> Front-Inspect Orbit C/Alt <-> TPS Over-Shoulder)
    const targetFov = quickBoost ? 72 : 60;
    if (Math.abs(this.camera.fov - targetFov) > 0.1) {
      this.camera.fov = lerp(this.camera.fov, targetFov, 1 - Math.exp(-12 * dt));
      this.camera.updateProjectionMatrix();
    }

    const shakeX = (Math.random() - 0.5) * this.cameraShake;
    const shakeY = (Math.random() - 0.5) * this.cameraShake;

    if (this.cameraMode === CAMERA_MODES.FPS_COCKPIT && this.cockpitGroup) {
      const eyeWorld = new THREE.Vector3(0, 0.08, -0.02);
      this.cockpitGroup.localToWorld(eyeWorld);
      this.camera.position.set(eyeWorld.x + shakeX * 0.5, eyeWorld.y + shakeY * 0.5, eyeWorld.z);
      this.camera.rotation.set(this.pitch, this.yaw, 0, 'YXZ');

      if (this.cockpitSticks.left && this.cockpitSticks.right) {
        this.cockpitSticks.left.rotation.x = fwdInput * 0.28;
        this.cockpitSticks.left.rotation.z = -strafe * 0.28;
        this.cockpitSticks.right.rotation.x = this.pitch * 0.45 + (this.pistolRecoil * 0.2);
      }
      this._updateCockpitScreens(dt, now);
    } else if (this.orbitActive) {
      const lookCtr = new THREE.Vector3(this.physics.x, this.physics.y + 1.38 - crouch * 0.55, this.physics.z);
      const off = new THREE.Vector3(
        Math.sin(this.orbitYaw) * Math.cos(this.orbitPitch) * this.orbitDistance,
        Math.sin(this.orbitPitch) * this.orbitDistance,
        Math.cos(this.orbitYaw) * Math.cos(this.orbitPitch) * this.orbitDistance,
      );
      const desired = lookCtr.clone().add(off);
      desired.y = Math.max(0.35, desired.y);
      this.camera.position.lerp(desired, 1 - Math.exp(-16 * dt));
      this.camera.lookAt(lookCtr);
    } else {
      const camOffset = new THREE.Vector3(1.15, 2.35 - crouch * 0.65, 5.4);
      camOffset.applyEuler(new THREE.Euler(this.pitch * 0.75, this.yaw, 0, 'YXZ'));
      const desiredPos = new THREE.Vector3(
        this.physics.x + camOffset.x + shakeX,
        Math.max(0.45, this.physics.y + camOffset.y + shakeY),
        this.physics.z + camOffset.z,
      );
      this.camera.position.lerp(desiredPos, 1 - Math.exp(-18 * dt));
      const lookAtPt = new THREE.Vector3(
        this.physics.x - Math.sin(this.yaw) * 6.5,
        this.physics.y + 1.55 + Math.sin(this.pitch) * 6.0 - crouch * 0.55,
        this.physics.z - Math.cos(this.yaw) * 6.5,
      );
      this.camera.lookAt(lookAtPt);
    }

    // 12. Push Telemetry
    this.ui.onTickHud?.({
      en: this.physics.en,
      maxEn: this.physics.maxEn,
      playerHp: this.playerHp,
      playerMaxHp: this.playerMaxHp,
      speedMps: horzSpeed,
      altM: this.physics.y,
      twr: this.massThrust.twr,
      hasPistol: this.weaponState.hasPistol,
      hasSaber: this.weaponState.hasSaber,
      loadoutPreset: this.loadoutPreset,
      barrierActive: this.shieldState.barrierActive,
      moveMode: !this.physics.grounded ? 'FLIGHT' : quickBoost ? 'BOOST' : shouldWalk ? 'WALK' : 'READY',
      orbitActive: this.orbitActive,
      saberDir: this.saberSwing.dir,
      saberAngleDeg: Math.round(((this.saberSwing.angleRad ?? 0) * 180) / Math.PI),
      dummyHp: this.dummy.hp,
      dummyMaxHp: this.dummy.maxHp,
      destroyed: this.score.destroyed,
      mcEarned: this.score.mcEarned,
      cameraMode: this.cameraMode,
    });

    this.composer.render();
  }
}

export function bootstrapSandbox() {
  const skinBar = document.getElementById('skin-bar');
  const hudEnFill = document.getElementById('hud-en-fill');
  const hudDummyFill = document.getElementById('hud-dummy-fill');
  const hudStats = document.getElementById('hud-stats');
  const hudWpns = document.getElementById('hud-wpns');
  const toastEl = document.getElementById('toast');
  const pauseEl = document.getElementById('pause-overlay');
  const pauseCamBtn = document.getElementById('btn-toggle-cam');

  let toastTimer = null;
  const showToast = (msg) => {
    toastEl.textContent = msg;
    toastEl.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toastEl.classList.remove('show'), 2600);
  };

  let app = null;

  MECHA_SKINS.forEach((skin) => {
    const btn = document.createElement('button');
    btn.className = 'skin-chip';
    btn.dataset.skinId = skin.id;
    btn.innerHTML = `<span class="swatch" style="background:linear-gradient(135deg,${skin.primary} 55%,${skin.secondary} 55%)"></span><span>${skin.shortName}</span>`;
    btn.onclick = () => {
      app?.setSkin(skin.id, null);
      document.querySelectorAll('.skin-chip').forEach((el) => el.classList.remove('active'));
      btn.classList.add('active');
    };
    skinBar.appendChild(btn);
  });
  skinBar.firstElementChild?.classList.add('active');

  const pickers = {
    primary: document.getElementById('diy-primary'),
    secondary: document.getElementById('diy-secondary'),
    saber: document.getElementById('diy-saber'),
  };
  Object.values(pickers).forEach((inp) => {
    inp?.addEventListener('input', () => {
      app?.setSkin(app.activeSkinId, {
        primary: pickers.primary.value,
        secondary: pickers.secondary.value,
        saber: pickers.saber.value,
      });
    });
  });

  app = new MechaSandboxApp({
    showToast,
    onModelReady: (ok, err) => {
      if (ok) {
        document.getElementById('loading-banner').style.display = 'none';
        showToast('EF-018 VALIANT 載入完成！WASD 步行 | Shift 噴射 | C 看正面 | RMB 滑鼠方向揮劍');
      } else {
        document.getElementById('loading-banner').textContent = `模型載入失敗: ${err}`;
      }
    },
    onSkinChanged: (eff) => {
      if (pickers.primary) pickers.primary.value = eff.primary;
      if (pickers.secondary) pickers.secondary.value = eff.secondary;
      if (pickers.saber) pickers.saber.value = eff.saber;
    },
    onPauseChanged: (isPaused) => {
      pauseEl.style.display = isPaused ? 'flex' : 'none';
    },
    onCameraChanged: (mode) => {
      pauseCamBtn.textContent = mode === CAMERA_MODES.TPS ? '📷 切換 FPS 360° 座艙 (V)' : '📷 切換 TPS 第三人稱 (V)';
      showToast(mode === CAMERA_MODES.FPS_COCKPIT ? '進入第一人稱 360° 全景座艙' : '切換至第三人稱過肩視角');
    },
    onTickHud: (t) => {
      const enPct = Math.max(0, Math.min(100, (t.en / t.maxEn) * 100));
      hudEnFill.style.width = `${enPct}%`;
      hudEnFill.style.background =
        enPct < 20
          ? 'linear-gradient(90deg, #ff3a1a, #ff9922)'
          : 'linear-gradient(90deg, #00c8ff, #55f6ff)';
      hudDummyFill.style.width = `${(t.dummyHp / t.dummyMaxHp) * 100}%`;
      const camTag = t.orbitActive ? '正面檢視(C)' : t.cameraMode === CAMERA_MODES.FPS_COCKPIT ? '座艙' : 'TPS';
      hudStats.textContent = `[${t.moveMode}] HP ${t.playerHp} | EN ${t.en.toFixed(0)}% | SPD ${(t.speedMps * 3.6).toFixed(0)} km/h | ALT ${t.altM.toFixed(1)}m | CAM:${camTag} | 拆樓 ${t.destroyed} (+${t.mcEarned} MC)`;
      const pr = t.loadoutPreset || { mode: 1, rHand: 'pistol', lHand: 'saber' };
      const rTxt = pr.rHand === 'saber' ? '大光劍(LMB)' : t.hasPistol ? '曳光機槍(LMB)' : '已丟(R撿)';
      const lTxt =
        pr.lHand === 'shield'
          ? t.barrierActive
            ? '🛡️能量護盾啟動(RMB/E)'
            : '🛡️複合盾(按住RMB/E防護)'
          : t.hasSaber
            ? `大光劍(RMB ${t.saberAngleDeg}°)`
            : '已丟(R撿)';
      hudWpns.textContent = `[配置 ${pr.mode}/3: 1/2/3切換] R-HAND:${rTxt} | L-HAND:${lTxt}`;
    },
  });

  document.getElementById('btn-resume').onclick = () => app.togglePause(false);
  pauseCamBtn.onclick = () => app.toggleCameraMode();
  document.getElementById('btn-orbit-front')?.addEventListener('click', () => {
    app.togglePause(false);
    app.toggleOrbitInspect();
  });
  document.getElementById('btn-toggle-env')?.addEventListener('click', () => {
    app.setLightingMode(app.lightingMode === 'daylight' ? 'night' : 'daylight');
    app.togglePause(false);
  });
  document.getElementById('btn-reset').onclick = () => app.resetSandbox();
  document.getElementById('vol-slider').oninput = (e) => app.audio.setVolume(parseFloat(e.target.value));
}
