/**
 * Mecha Rig, Hangar Showcase, GLB Loader, Shield Variants & Cockpit Interior (Layer 1 Client).
 * Owns Hangar stage geometry + 1.75m pilot companion, skeletal Valiant GLB loading,
 * coaxial custom plasma beam saber shaders, 6-nozzle thruster plumes, cockpit MFDs,
 * and 4 shield variant swaps / stowed equipment holsters.
 */
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { CAMERA_MODES } from '../shared/constants.js?v=20261116_t75e';
import { SHIELD_IDS } from '../shared/catalog.js?v=20261116_t75e';
import { clamp, lerp } from '../shared/kinematics.js?v=20261116_t75e';
import { applyMechaSkin } from './skin_shader.js?v=20261116_t75e';

const DEG2RAD = Math.PI / 180;

/**
 * Shared procedural mesh builder for L_BACK / R_BACK shoulder weapons & booster pods.
 * Used identically on active mecha mounts and unequipped hangar equipment racks.
 */
function createProceduralBackModule(weaponId, makePlumeMat = null) {
  const root = new THREE.Group();
  root.name = `Wpn_Back_${weaponId}`;
  root.userData.paintZone = weaponId === 'EF-BP03' ? 'backpack' : 'weapons';

  const makeMat = (name, color, metalness = 0.55, roughness = 0.42, emissive = null, emissiveIntensity = 0) => {
    const m = new THREE.MeshStandardMaterial({ color, metalness, roughness });
    if (emissive) {
      m.emissive = new THREE.Color(emissive);
      m.emissiveIntensity = emissiveIntensity;
    }
    m.name = name;
    return m;
  };

  const primaryMat = makeMat('Mat_Armor_Primary', '#d8e1eb', 0.42, 0.36);
  const secondaryMat = makeMat('Mat_Armor_Secondary', '#2b4f7c', 0.52, 0.34);
  const frameMat = makeMat('Mat_Frame_DarkMetal', '#1b2432', 0.78, 0.44);
  const sensorMat = makeMat('Mat_Glow_Sensor', '#4deeff', 0.2, 0.2, '#4deeff', 1.7);
  const nozzleMat = makeMat('Mat_Glow_Thruster', '#3ae8ff', 0.3, 0.25, '#3ae8ff', 1.4);

  const barrelGrp = new THREE.Group();
  barrelGrp.name = 'RecoilAssembly';

  if (weaponId === 'EF-RL08') {
    const mountYoke = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.16, 0.38), frameMat);
    mountYoke.position.set(0, 0.05, 0.04);
    root.add(mountYoke);

    const shroud = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.18, 0.62), secondaryMat);
    shroud.position.set(0, 0.11, -0.05);
    barrelGrp.add(shroud);

    const railUpper = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.045, 1.38), primaryMat);
    railUpper.position.set(0, 0.17, -0.58);
    const railLower = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.045, 1.34), frameMat);
    railLower.position.set(0, 0.075, -0.56);
    const coilCore = new THREE.Mesh(new THREE.BoxGeometry(0.036, 0.04, 1.18), sensorMat);
    coilCore.position.set(0, 0.122, -0.54);
    const magFin = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.12, 0.28), primaryMat);
    magFin.position.set(0, 0.14, 0.36);
    barrelGrp.add(railUpper, railLower, coilCore, magFin);
    root.add(barrelGrp);
    root.userData.muzzleLocal = new THREE.Vector3(0, 0.12, -1.32);
  } else if (weaponId === 'EF-HC04') {
    const drum = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.22, 0.44), frameMat);
    drum.position.set(0, 0.09, 0.08);
    const plate = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.16, 0.34), primaryMat);
    plate.position.set(0, 0.14, 0.04);
    root.add(drum, plate);

    const breech = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.16, 0.48), secondaryMat);
    breech.position.set(0, 0.12, -0.22);
    const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.048, 0.058, 0.88, 12).rotateX(Math.PI / 2), frameMat);
    barrel.position.set(0, 0.12, -0.68);
    const muzzleBrake = new THREE.Mesh(new THREE.BoxGeometry(0.13, 0.13, 0.18), primaryMat);
    muzzleBrake.position.set(0, 0.12, -1.12);
    const sightOptic = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.04, 0.16), sensorMat);
    sightOptic.position.set(0.08, 0.22, -0.24);
    barrelGrp.add(breech, barrel, muzzleBrake, sightOptic);
    root.add(barrelGrp);
    root.userData.muzzleLocal = new THREE.Vector3(0, 0.12, -1.24);
  } else if (weaponId === 'EF-BP03') {
    const pylon = new THREE.Mesh(new THREE.BoxGeometry(0.20, 0.16, 0.38), frameMat);
    pylon.position.set(0, 0.06, 0.08);
    const podBody = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.26, 0.72), primaryMat);
    podBody.position.set(-0.08, 0.16, 0.18);
    podBody.rotation.x = -0.14;
    const intake = new THREE.Mesh(new THREE.BoxGeometry(0.20, 0.18, 0.14), secondaryMat);
    intake.position.set(-0.08, 0.20, -0.18);
    const fin = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.38, 0.44), primaryMat);
    fin.position.set(-0.14, 0.34, 0.28);
    fin.rotation.z = 0.26;
    fin.rotation.x = -0.22;
    const nozzleA = new THREE.Mesh(new THREE.CylinderGeometry(0.065, 0.085, 0.14, 12).rotateX(Math.PI / 2), frameMat);
    nozzleA.position.set(-0.13, 0.13, 0.56);
    const nozzleB = nozzleA.clone();
    nozzleB.position.set(-0.02, 0.13, 0.56);
    const glowRing = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.06, 0.06, 10).rotateX(Math.PI / 2), nozzleMat);
    glowRing.position.set(-0.08, 0.13, 0.58);
    root.add(pylon, podBody, intake, fin, nozzleA, nozzleB, glowRing);

    if (makePlumeMat) {
      const plumeLocalDirs = [];
      [-0.13, -0.02].forEach((nx, idx) => {
        const rig = new THREE.Group();
        rig.position.set(nx, 0.13, 0.62);
        rig.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), new THREE.Vector3(0, 0.14, 0.99).normalize());
        const outerMat = makePlumeMat(14.2 + idx * 1.7);
        const coreMat = makePlumeMat(18.5 + idx * 1.7);
        const outerCone = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.082, 1.0, 12, 6, true).translate(0, 0.5, 0), outerMat);
        const coreCone = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.045, 0.58, 10, 4, true).translate(0, 0.29, 0), coreMat);
        rig.add(outerCone, coreCone);
        rig.visible = false;
        root.add(rig);
        plumeLocalDirs.push({ rig, localDir: new THREE.Vector3(0, 0.14, 0.99).normalize(), outerMat, coreMat, baseLen: 1.45 });
      });
      root.userData.extraPlumes = plumeLocalDirs;
    }
  } else if (weaponId === 'EF-TB04') {
    const stabilizer = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.54, 0.46), secondaryMat);
    stabilizer.position.set(0.04, 0.34, 0.22);
    stabilizer.rotation.x = -0.32;
    stabilizer.rotation.z = -0.18;
    const launcherBox = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.24, 0.48), primaryMat);
    launcherBox.position.set(0.02, 0.14, -0.04);
    const podFace = new THREE.Mesh(new THREE.BoxGeometry(0.21, 0.21, 0.05), frameMat);
    podFace.position.set(0.02, 0.14, -0.29);
    barrelGrp.add(launcherBox, podFace);
    for (const [mx, my] of [[-0.05, 0.19], [0.09, 0.19], [-0.05, 0.09], [0.09, 0.09]]) {
      const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.032, 0.032, 0.06, 10).rotateX(Math.PI / 2), sensorMat);
      cap.position.set(mx, my, -0.31);
      barrelGrp.add(cap);
    }
    const tailNozzle = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.075, 0.14, 12).rotateX(Math.PI / 2), frameMat);
    tailNozzle.position.set(0.03, 0.14, 0.34);
    const tailGlow = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.05, 0.06, 10).rotateX(Math.PI / 2), nozzleMat);
    tailGlow.position.set(0.03, 0.14, 0.39);
    root.add(stabilizer, barrelGrp, tailNozzle, tailGlow);
    root.userData.muzzleLocal = new THREE.Vector3(0.02, 0.14, -0.36);

    if (makePlumeMat) {
      const rig = new THREE.Group();
      rig.position.set(0.03, 0.14, 0.42);
      rig.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), new THREE.Vector3(0, 0.12, 0.99).normalize());
      const outerMat = makePlumeMat(22.4);
      const coreMat = makePlumeMat(25.1);
      rig.add(
        new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.068, 1.0, 12, 6, true).translate(0, 0.5, 0), outerMat),
        new THREE.Mesh(new THREE.CylinderGeometry(0.005, 0.038, 0.55, 10, 4, true).translate(0, 0.275, 0), coreMat),
      );
      rig.visible = false;
      root.add(rig);
      root.userData.extraPlumes = [
        { rig, localDir: new THREE.Vector3(0, 0.12, 0.99).normalize(), outerMat, coreMat, baseLen: 1.25 },
      ];
    }
  }

  root.traverse((o) => {
    if (o.isMesh) {
      o.castShadow = true;
      o.receiveShadow = true;
    }
  });
  root.userData.recoilAssembly = barrelGrp;
  return root;
}

const _glbTemplatePromises = new Map();

function loadGlbTemplate(url) {
  if (!url) return Promise.resolve(null);
  if (!_glbTemplatePromises.has(url)) {
    const loader = new GLTFLoader();
    _glbTemplatePromises.set(
      url,
      loader.loadAsync(url).catch((err) => {
        _glbTemplatePromises.delete(url);
        throw err;
      }),
    );
  }
  return _glbTemplatePromises.get(url);
}

export function createMechaRigManager({
  scene,
  parentGroup = null,
  catalog,
  vfx,
  skipHangar = false,
  skipCockpit = false,
  skipVfxAccent = false,
  getActiveShieldDef,
  getActiveShieldId,
  getLoadoutPreset,
  getWeaponState,
}) {
  const manager = {
    mechaRoot: new THREE.Group(),
    bones: {},
    sockets: {},
    weaponNodes: {
      pistol: null,
      pistolMuzzle: null,
      pistolLeft: null,
      pistolLeftMuzzle: null,
      saberHilt: null,
      bladeEmitter: null,
      saberBlade: null,
    },
    saberFx: {
      coreMat: null,
      auraMesh: null,
      auraMat: null,
      light: null,
      baseLocal: new THREE.Vector3(),
      tipLocal: new THREE.Vector3(),
    },
    thrusterPlumes: [],
    fpsHideNodes: [],
    cockpitGroup: null,
    cockpitMaterials: null,
    cockpitScreens: { leftCtx: null, leftTex: null, rightCtx: null, rightTex: null, timer: 0 },
    cockpitSticks: { left: null, right: null },
    droppedTemplates: { pistol: null, saberHilt: null },
    shieldsPackRoot: null,
    shieldNodes: {
      group: null,
      rightGroup: null,
      barrierMesh: null,
      barrierMat: null,
      rightBarrierMesh: null,
      rightBarrierMat: null,
      rectPivotGroup: null,
      rectBarrierMesh: null,
      rectBarrierMat: null,
      directionalDomeMesh: null,
      directionalDomeMat: null,
      fullDomeMesh: null,
      fullDomeMat: null,
      handVariants: {},
      handVariantsRight: {},
      stowVariants: {},
      fallbackHand: null,
      fallbackHandRight: null,
      fallbackStow: null,
      frameMat: null,
      saberRightGroup: null,
      saberRightBlade: null,
    },
    stowedNodes: { pistol: null, saberHilt: null, shield: null },
    backWeaponNodes: {
      left: {},
      right: {},
      activeLBackId: null,
      activeRBackId: null,
    },
    hardpointCaps: { left: null, right: null },
    backRecoil: { left: 0, right: 0 },
    partState: null,
    armStumpMarkers: { left: null, right: null },
    _subPartCaps: [
      { partId: 'head', a: { x: 0, y: 0, z: 0 }, b: { x: 0, y: 0, z: 0 }, radius: 0.27, disabled: false },
      { partId: 'torso', a: { x: 0, y: 0, z: 0 }, b: { x: 0, y: 0, z: 0 }, radius: 0.43, disabled: false },
      { partId: 'backpack', a: { x: 0, y: 0, z: 0 }, b: { x: 0, y: 0, z: 0 }, radius: 0.39, disabled: false },
      { partId: 'arm_l', a: { x: 0, y: 0, z: 0 }, b: { x: 0, y: 0, z: 0 }, radius: 0.25, disabled: false },
      { partId: 'arm_r', a: { x: 0, y: 0, z: 0 }, b: { x: 0, y: 0, z: 0 }, radius: 0.25, disabled: false },
      { partId: 'legs', a: { x: 0, y: 0, z: 0 }, b: { x: 0, y: 0, z: 0 }, radius: 0.27, disabled: false },
      { partId: 'legs', a: { x: 0, y: 0, z: 0 }, b: { x: 0, y: 0, z: 0 }, radius: 0.27, disabled: false },
    ],
    _tmpCapVecA: new THREE.Vector3(),
    _tmpCapVecB: new THREE.Vector3(),
    _tmpCapBackFwd: new THREE.Vector3(),
    legMetrics: {
      L1: 0.6649,
      L2: 0.7036,
      ankleHeightM: 0.1425,
      restFlareDeg: 6.9,
      hipOffsetX: 0.18,
      hipRestY: 1.5,
    },
    hangarStageGroup: null,
    hangarGantryGroup: null,
    hangarGantryMaterials: [],
    hangarGantryBlend: 1.0,
    hangarNameplate: { canvas: null, ctx: null, texture: null, lastKey: '' },
    hangarRackNodes: { pistol: null, saber: null, shields: {}, backPods: {} },
    hangarPilotGroup: null,
    hangarPilotMaterials: null,
    hangarTurntableRing: null,

    init() {
      (parentGroup || scene).add(this.mechaRoot);
      if (!skipHangar) {
        this.buildHangarStage();
      }
    },

    buildHangarStage() {
      if (this.hangarStageGroup) return;
      const grp = new THREE.Group();
      grp.position.set(0, 0, 10);

      const deck = new THREE.Mesh(
        new THREE.CircleGeometry(36, 64).rotateX(-Math.PI / 2),
        new THREE.MeshStandardMaterial({ color: '#0a1018', roughness: 0.82, metalness: 0.25 }),
      );
      deck.position.y = -0.26;
      deck.receiveShadow = true;
      grp.add(deck);

      const gridHelper = new THREE.GridHelper(34, 24, '#24405c', '#142030');
      gridHelper.position.y = -0.25;
      grp.add(gridHelper);

      // F90 Octagonal Stepped Beveled Plinth (top deck flush at y = -0.004 to honor ground foot clamping)
      const upperDeckMat = new THREE.MeshStandardMaterial({ color: '#182436', roughness: 0.38, metalness: 0.72 });
      const lowerStepMat = new THREE.MeshStandardMaterial({ color: '#111927', roughness: 0.52, metalness: 0.64 });
      const upperDeck = new THREE.Mesh(new THREE.CylinderGeometry(2.86, 3.08, 0.13, 8), upperDeckMat);
      upperDeck.position.y = -0.069;
      upperDeck.receiveShadow = true;
      grp.add(upperDeck);

      const lowerStep = new THREE.Mesh(new THREE.CylinderGeometry(3.48, 3.92, 0.14, 8), lowerStepMat);
      lowerStep.position.y = -0.20;
      lowerStep.receiveShadow = true;
      grp.add(lowerStep);

      const bezelMat = new THREE.MeshStandardMaterial({
        color: '#2e4c6b',
        roughness: 0.35,
        metalness: 0.78,
      });
      const chamferRim = new THREE.Mesh(new THREE.CylinderGeometry(2.94, 3.10, 0.024, 8, 1, true), bezelMat);
      chamferRim.position.y = -0.015;
      grp.add(chamferRim);

      const ringMat = new THREE.MeshBasicMaterial({ color: '#29d4ff', transparent: true, opacity: 0.75 });
      const innerRing = new THREE.Mesh(new THREE.RingGeometry(2.22, 2.30, 64).rotateX(-Math.PI / 2), ringMat);
      innerRing.position.y = 0.002;
      grp.add(innerRing);
      this.hangarTurntableRing = innerRing;

      const outerRing = new THREE.Mesh(
        new THREE.RingGeometry(2.68, 2.74, 8).rotateX(-Math.PI / 2),
        new THREE.MeshBasicMaterial({ color: '#ff8a2b', transparent: true, opacity: 0.52 }),
      );
      outerRing.position.y = 0.002;
      grp.add(outerRing);

      // Front Angled CanvasTexture Machine Nameplate facing the -Z showcase camera
      const npCanvas = document.createElement('canvas');
      npCanvas.width = 512;
      npCanvas.height = 160;
      const npCtx = npCanvas.getContext('2d');
      const npTex = new THREE.CanvasTexture(npCanvas);
      npTex.colorSpace = THREE.SRGBColorSpace;
      this.hangarNameplate = { canvas: npCanvas, ctx: npCtx, texture: npTex, lastKey: '' };

      const plaqueMount = new THREE.Group();
      plaqueMount.position.set(-0.25, -0.02, -3.26);
      plaqueMount.rotation.y = Math.PI;
      const standBase = new THREE.Mesh(new THREE.BoxGeometry(1.52, 0.18, 0.42), lowerStepMat);
      standBase.position.set(0, -0.10, 0);
      const plaqueScreen = new THREE.Mesh(
        new THREE.PlaneGeometry(1.42, 0.44),
        new THREE.MeshBasicMaterial({ map: npTex, transparent: true }),
      );
      plaqueScreen.position.set(0, 0.08, -0.06);
      plaqueScreen.rotation.x = -0.58;
      plaqueMount.add(standBase, plaqueScreen);
      grp.add(plaqueMount);
      this.syncHangarNameplate({});

      // Hollow Industrial Space-Frame Truss Gantry behind Mecha (+Z), fades & retracts on rear/backpack inspect
      const gantryGrp = new THREE.Group();
      gantryGrp.position.set(0, 0, 2.65);
      const gantryMaterials = [];
      const regGantryMat = (opts) => {
        const m = new THREE.MeshStandardMaterial({ ...opts, transparent: true, opacity: 1.0 });
        gantryMaterials.push(m);
        return m;
      };
      const trussSteel = regGantryMat({ color: '#213146', roughness: 0.48, metalness: 0.82 });
      const trussAccent = regGantryMat({ color: '#ff9638', emissive: '#ff6f1c', emissiveIntensity: 0.85, roughness: 0.35 });
      const trussBeacon = regGantryMat({ color: '#38bdf8', emissive: '#38bdf8', emissiveIntensity: 1.4, roughness: 0.25 });

      const buildLatticeTower = (tx) => {
        const tw = 0.44;
        const td = 0.44;
        const th = 4.65;
        const corners = [[-tw * 0.5, -td * 0.5], [tw * 0.5, -td * 0.5], [-tw * 0.5, td * 0.5], [tw * 0.5, td * 0.5]];
        for (const [cx, cz] of corners) {
          const post = new THREE.Mesh(new THREE.BoxGeometry(0.065, th, 0.065), trussSteel);
          post.position.set(tx + cx, th * 0.5 - 0.26, cz);
          post.castShadow = true;
          gantryGrp.add(post);
        }
        // Horizontal collars & diagonal hollow X-bracing bays (6 bays up the tower)
        for (let b = 0; b < 6; b++) {
          const y0 = b * 0.74 - 0.14;
          const ringBarF = new THREE.Mesh(new THREE.BoxGeometry(tw, 0.042, 0.042), trussSteel);
          ringBarF.position.set(tx, y0, -td * 0.5);
          const ringBarB = ringBarF.clone();
          ringBarB.position.z = td * 0.5;
          const diagFront = new THREE.Mesh(new THREE.BoxGeometry(0.036, 0.84, 0.036), trussSteel);
          diagFront.position.set(tx, y0 + 0.37, -td * 0.5);
          diagFront.rotation.z = b % 2 === 0 ? 0.52 : -0.52;
          const diagSide = new THREE.Mesh(new THREE.BoxGeometry(0.036, 0.84, 0.036), trussSteel);
          diagSide.position.set(tx + (tx < 0 ? tw * 0.5 : -tw * 0.5), y0 + 0.37, 0);
          diagSide.rotation.x = b % 2 === 0 ? 0.52 : -0.52;
          gantryGrp.add(ringBarF, ringBarB, diagFront, diagSide);
        }
        const footPad = new THREE.Mesh(new THREE.BoxGeometry(0.76, 0.14, 0.76), trussSteel);
        footPad.position.set(tx, -0.20, 0);
        const beacon = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.10, 0.14), trussAccent);
        beacon.position.set(tx, 4.46, 0);
        gantryGrp.add(footPad, beacon);
      };
      buildLatticeTower(-2.85);
      buildLatticeTower(2.85);

      // Hollow overhead double cross-truss bridge + crane rail
      [-0.18, 0.18].forEach((oz) => {
        const upperChord = new THREE.Mesh(new THREE.BoxGeometry(6.2, 0.08, 0.08), trussSteel);
        upperChord.position.set(0, 4.42, oz);
        const lowerChord = new THREE.Mesh(new THREE.BoxGeometry(5.9, 0.07, 0.07), trussSteel);
        lowerChord.position.set(0, 4.02, oz);
        gantryGrp.add(upperChord, lowerChord);
      });
      for (let i = -4; i <= 4; i++) {
        const strut = new THREE.Mesh(new THREE.BoxGeometry(0.042, 0.42, 0.042), trussSteel);
        strut.position.set(i * 0.65, 4.22, 0);
        strut.rotation.z = i % 2 === 0 ? 0.56 : -0.56;
        gantryGrp.add(strut);
      }
      const centerLamp = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.06, 0.18), trussBeacon);
      centerLamp.position.set(0, 4.0, 0);
      gantryGrp.add(centerLamp);

      this.hangarGantryGroup = gantryGrp;
      this.hangarGantryMaterials = gantryMaterials;
      grp.add(gantryGrp);

      const rimLight = new THREE.PointLight('#38bdf8', 2.8, 12, 1.4);
      rimLight.position.set(0, 3.6, 2.2);
      grp.add(rimLight);

      // Right-Front Plinth Boarding Steps + 1.75m Tactical Pilot Figure (at clear -X, -Z front-right)
      const stairLower = new THREE.Mesh(new THREE.BoxGeometry(1.05, 0.14, 0.95), lowerStepMat);
      stairLower.position.set(-2.15, -0.19, -2.15);
      stairLower.rotation.y = 0.62;
      stairLower.receiveShadow = true;
      grp.add(stairLower);

      const pilotGrp = new THREE.Group();
      pilotGrp.position.set(-2.15, -0.12, -2.15);
      pilotGrp.rotation.y = 0.36;

      const suitMat = new THREE.MeshStandardMaterial({ color: '#1c2636', roughness: 0.58, metalness: 0.25 });
      const trimMat = new THREE.MeshStandardMaterial({ color: '#29d4ff', emissive: '#29d4ff', emissiveIntensity: 0.45, roughness: 0.35 });
      const visorMat = new THREE.MeshStandardMaterial({ color: '#55f6ff', emissive: '#55f6ff', emissiveIntensity: 2.0, roughness: 0.12 });

      const bootL = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.44, 0.18), suitMat);
      bootL.position.set(-0.09, 0.22, 0);
      const bootR = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.44, 0.18), suitMat);
      bootR.position.set(0.09, 0.22, 0);
      const legL = new THREE.Mesh(new THREE.CylinderGeometry(0.062, 0.052, 0.48, 10), suitMat);
      legL.position.set(-0.09, 0.66, 0);
      const legR = new THREE.Mesh(new THREE.CylinderGeometry(0.062, 0.052, 0.48, 10), suitMat);
      legR.position.set(0.09, 0.66, 0);
      const torso = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.56, 0.2), suitMat);
      torso.position.set(0, 1.18, 0);
      torso.castShadow = true;
      const chestHarness = new THREE.Mesh(new THREE.BoxGeometry(0.37, 0.12, 0.215), trimMat);
      chestHarness.position.set(0, 1.28, 0);
      const armL = new THREE.Mesh(new THREE.CylinderGeometry(0.048, 0.04, 0.56, 10), suitMat);
      armL.position.set(-0.23, 1.14, 0);
      armL.rotation.z = 0.09;
      const armR = new THREE.Mesh(new THREE.CylinderGeometry(0.048, 0.04, 0.56, 10), suitMat);
      armR.position.set(0.23, 1.14, 0);
      armR.rotation.z = -0.09;
      const helmet = new THREE.Mesh(new THREE.SphereGeometry(0.125, 16, 12), suitMat);
      helmet.position.set(0, 1.61, 0);
      helmet.castShadow = true;
      const visor = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.065, 0.11), visorMat);
      visor.position.set(0, 1.61, 0.08);
      pilotGrp.add(bootL, bootR, legL, legR, torso, chestHarness, armL, armR, helmet, visor);
      grp.add(pilotGrp);

      // Physical Side Equipment Racks showing UNEQUIPPED firearms, sabers, shields, and shoulder pods
      const rackSteelMat = new THREE.MeshStandardMaterial({ color: '#1b2636', roughness: 0.52, metalness: 0.78 });
      const rackTrimMat = new THREE.MeshStandardMaterial({ color: '#29d4ff', emissive: '#107a9c', emissiveIntensity: 0.55 });
      const buildSideRackFrame = (rx, rz, rotY) => {
        const rk = new THREE.Group();
        rk.position.set(rx, -0.26, rz);
        rk.rotation.y = rotY;
        const basePlate = new THREE.Mesh(new THREE.BoxGeometry(1.72, 0.08, 0.86), rackSteelMat);
        basePlate.position.y = 0.04;
        const barTop = new THREE.Mesh(new THREE.BoxGeometry(1.68, 0.07, 0.08), rackSteelMat);
        barTop.position.set(0, 1.48, -0.18);
        const strip = new THREE.Mesh(new THREE.BoxGeometry(1.60, 0.025, 0.03), rackTrimMat);
        strip.position.set(0, 0.09, 0.38);
        [-0.76, 0.76].forEach((px) => {
          const post = new THREE.Mesh(new THREE.BoxGeometry(0.07, 1.48, 0.09), rackSteelMat);
          post.position.set(px, 0.76, -0.18);
          rk.add(post);
        });
        rk.add(basePlate, barTop, strip);
        grp.add(rk);
        return rk;
      };

      const rackLeftBay = buildSideRackFrame(-3.55, -0.10, 0.42);
      const rackRightBay = buildSideRackFrame(3.55, -0.10, -0.42);

      // Left Bay cradles: Unequipped Pistol, Saber Hilt, and L_BACK pods (EF-RL08 / EF-BP03)
      const pistolHolder = new THREE.Group();
      pistolHolder.position.set(-0.48, 0.62, 0.06);
      const phSilhouette = new THREE.Mesh(new THREE.BoxGeometry(0.10, 0.22, 0.56), lowerStepMat);
      pistolHolder.add(phSilhouette);
      rackLeftBay.add(pistolHolder);

      const saberHolder = new THREE.Group();
      saberHolder.position.set(-0.14, 0.68, 0.08);
      const shSilhouette = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.04, 0.48, 10), lowerStepMat);
      saberHolder.add(shSilhouette);
      rackLeftBay.add(saberHolder);

      const podRL08 = createProceduralBackModule('EF-RL08');
      podRL08.position.set(0.24, 0.88, 0.05);
      podRL08.scale.setScalar(0.68);
      podRL08.rotation.x = 0.35;
      rackLeftBay.add(podRL08);

      const podBP03 = createProceduralBackModule('EF-BP03');
      podBP03.position.set(0.58, 0.92, -0.02);
      podBP03.scale.setScalar(0.72);
      rackLeftBay.add(podBP03);

      // Right Bay cradles: 4 Shield Stand Cradles + R_BACK pods (EF-HC04 / EF-TB04)
      const shieldMap = {};
      SHIELD_IDS.forEach((shId, idx) => {
        const slotGrp = new THREE.Group();
        slotGrp.position.set(-0.56 + idx * 0.26, 0.64, 0.14);
        const cradleBlock = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.48, 0.08), lowerStepMat);
        slotGrp.add(cradleBlock);
        rackRightBay.add(slotGrp);
        shieldMap[shId] = slotGrp;
      });

      const podHC04 = createProceduralBackModule('EF-HC04');
      podHC04.position.set(0.32, 0.92, 0.04);
      podHC04.scale.setScalar(0.68);
      podHC04.rotation.x = 0.28;
      rackRightBay.add(podHC04);

      const podTB04 = createProceduralBackModule('EF-TB04');
      podTB04.position.set(0.60, 0.96, 0.0);
      podTB04.scale.setScalar(0.72);
      rackRightBay.add(podTB04);

      this.hangarRackNodes = {
        pistol: pistolHolder,
        saber: saberHolder,
        shields: shieldMap,
        backPods: {
          'EF-RL08': podRL08,
          'EF-BP03': podBP03,
          'EF-HC04': podHC04,
          'EF-TB04': podTB04,
        },
      };

      this.hangarPilotGroup = pilotGrp;
      this.hangarPilotMaterials = { suitMat, trimMat, visorMat };
      this.hangarStageGroup = grp;
      scene.add(grp);
    },

    /**
     * Draw high-DPI dynamic tactical CanvasTexture nameplate on the front F90 pedestal.
     */
    syncHangarNameplate({ actorDef = null, pilotDef = null, loadoutTax = null } = {}) {
      const np = this.hangarNameplate;
      if (!np?.ctx || !np?.texture) return;
      const actorId = actorDef?.id || 'EF-018';
      const actorName = actorDef?.codeName || 'VALIANT';
      const pilotCall = pilotDef?.callsign || 'RAVEN-01';
      const ap = loadoutTax?.effectiveAp || actorDef?.maxAp || 10000;
      const twr = (loadoutTax?.twr || 1.41).toFixed(2);
      const ov = (loadoutTax?.overloadState || 'nominal').toUpperCase();
      const key = `${actorId}|${actorName}|${pilotCall}|${ap}|${twr}|${ov}`;
      if (np.lastKey === key) return;
      np.lastKey = key;

      const ctx = np.ctx;
      ctx.clearRect(0, 0, 512, 160);
      ctx.fillStyle = '#07101c';
      ctx.fillRect(0, 0, 512, 160);

      const accent = ov === 'OVERLOADED' ? '#ff5c72' : ov === 'HEAVY' ? '#ffb547' : '#38bdf8';
      ctx.strokeStyle = accent;
      ctx.lineWidth = 4;
      ctx.strokeRect(4, 4, 504, 152);

      ctx.fillStyle = accent;
      ctx.fillRect(14, 16, 10, 128);
      ctx.font = 'bold 22px monospace';
      ctx.fillText(`${actorId} // TESTBED UNIT`, 36, 40);

      ctx.fillStyle = '#edf6ff';
      ctx.font = 'bold 42px sans-serif';
      ctx.fillText(`${actorName} Ex-S`, 36, 92);

      ctx.fillStyle = '#8cc4ee';
      ctx.font = 'bold 20px monospace';
      ctx.fillText(`PILOT: ${pilotCall}  |  AP ${ap}  |  TWR ${twr} [${ov}]`, 36, 134);
      np.texture.needsUpdate = true;
    },

    /**
     * Smoothly fades and retracts the hollow rear truss gantry when orbiting behind
     * or inspecting backpack / L_BACK / R_BACK mounts.
     */
    updateHangarStage(dt, { inMainMenu = false, cameraPos = null, menuState = null } = {}) {
      if (!this.hangarGantryGroup || !inMainMenu) return;
      let behindTrigger = false;
      if (cameraPos) {
        const localCamZ = cameraPos.z - 10;
        const localCamX = cameraPos.x;
        const horizLen = Math.hypot(localCamX, localCamZ) || 1;
        // Back gantry stands at +Z relative to mecha center (0,0,10); behindFactor > 0.15 means orbiting rear
        behindTrigger = localCamZ / horizLen > 0.15;
      }
      const focusTrigger =
        menuState?.activePaintZone === 'backpack' ||
        (menuState?.mainTab === 'armory' &&
          (menuState?.activeArmorySlot === 'l_back' || menuState?.activeArmorySlot === 'r_back'));
      const retract = behindTrigger || focusTrigger;
      const targetBlend = retract ? 0.0 : 1.0;
      this.hangarGantryBlend = lerp(this.hangarGantryBlend, targetBlend, 1 - Math.exp(-8.5 * Math.max(0.001, dt)));

      const opacity = lerp(0.11, 1.0, this.hangarGantryBlend);
      const depthWrite = opacity > 0.85;
      for (const mat of this.hangarGantryMaterials) {
        mat.opacity = opacity;
        if (mat.depthWrite !== depthWrite) {
          mat.depthWrite = depthWrite;
        }
      }
      this.hangarGantryGroup.position.z = lerp(4.15, 2.65, this.hangarGantryBlend);
    },

    /**
     * Sync physical side racks so ONLY currently UNEQUIPPED items appear on rack cradles.
     */
    syncHangarEquipmentRacks({ preset = null, weaponState = null, shieldId = 'EF-SH03', lBackId = null, rBackId = null } = {}) {
      const rk = this.hangarRackNodes;
      if (!rk) return;
      const hasPistolEquipped =
        Boolean(weaponState?.hasPistol) && (preset?.lHand === 'pistol' || preset?.rHand === 'pistol');
      const hasSaberEquipped =
        Boolean(weaponState?.hasSaber) && (preset?.lHand === 'saber' || preset?.rHand === 'saber');
      const hasShieldEquipped = preset?.lHand === 'shield' || preset?.rHand === 'shield';

      if (rk.pistol) rk.pistol.visible = !hasPistolEquipped;
      if (rk.saber) rk.saber.visible = !hasSaberEquipped;

      for (const shId of SHIELD_IDS) {
        if (rk.shields?.[shId]) {
          rk.shields[shId].visible = !(hasShieldEquipped && shId === shieldId);
        }
      }
      for (const [id, node] of Object.entries(rk.backPods || {})) {
        node.visible = id !== lBackId && id !== rBackId;
      }
    },

    syncStageVisibility(inMainMenu, menuState) {
      if (this.hangarStageGroup) this.hangarStageGroup.visible = Boolean(inMainMenu);
      if (this.hangarPilotGroup) {
        const hidePilotForZoom =
          inMainMenu && menuState?.mainTab === 'paint' && menuState?.activePaintZone !== 'all';
        this.hangarPilotGroup.visible = Boolean(inMainMenu && !hidePilotForZoom);
      }
    },

    syncPilotShowcase(pilotId) {
      const pilot = catalog.getPilot(pilotId);
      if (!pilot || !this.hangarPilotMaterials) return;
      const accent = pilot.accentColor || '#29d4ff';
      const suitBase = pilot.secondaryColor || '#1c2636';
      this.hangarPilotMaterials.suitMat.color.set(suitBase);
      this.hangarPilotMaterials.trimMat.color.set(accent);
      this.hangarPilotMaterials.trimMat.emissive.set(accent);
      this.hangarPilotMaterials.visorMat.color.set(accent);
      this.hangarPilotMaterials.visorMat.emissive.set(accent);
    },

    poseBone(boneName, rxDeg = 0, ryDeg = 0, rzDeg = 0) {
      const b = this.bones[boneName];
      if (!b || !b.userData.restQuat) return;
      const qDelta = new THREE.Quaternion().setFromEuler(
        new THREE.Euler(rxDeg * DEG2RAD, ryDeg * DEG2RAD, rzDeg * DEG2RAD, 'XYZ'),
      );
      b.quaternion.copy(b.userData.restQuat).multiply(qDelta);
    },

    getHandWeaponReleaseOrigins() {
      this.mechaRoot.updateMatrixWorld(true);
      const readNodeWorld = (candidates) => {
        for (const node of candidates) {
          if (!node) continue;
          const pos = new THREE.Vector3();
          node.getWorldPosition(pos);
          return { x: pos.x, y: pos.y, z: pos.z };
        }
        return null;
      };
      return {
        L: readNodeWorld([
          this.weaponNodes.pistolLeft?.visible ? this.weaponNodes.pistolLeft : null,
          this.weaponNodes.saberHilt?.visible ? this.weaponNodes.saberHilt : null,
          this.sockets.Socket_Hand_L,
          this.bones.Hand_L,
        ]),
        R: readNodeWorld([
          this.weaponNodes.pistol?.visible ? this.weaponNodes.pistol : null,
          this.shieldNodes.saberRightGroup?.visible ? this.shieldNodes.saberRightGroup : null,
          this.sockets.Socket_Hand_R,
          this.bones.Hand_R,
        ]),
      };
    },

    applySkin(skinId, customPalette, droppedMeshes = []) {
      const eff = applyMechaSkin(this.mechaRoot, skinId, customPalette, {
        frameMat: this.cockpitMaterials?.frameMat,
        hudMat: this.cockpitMaterials?.hudMat,
        saberShaderMat: this.saberFx.coreMat,
        saberAuraMat: this.saberFx.auraMat,
        saberLight: this.saberFx.light,
      });
      if (!skipVfxAccent) {
        vfx?.setAccentColor?.(eff.saber);
      }
      for (const dm of droppedMeshes) {
        applyMechaSkin(dm, skinId, customPalette);
      }
      return eff;
    },

    /**
     * Standardized Socket Plugin Mounting Helper: snaps plugin root cleanly to socket (0,0,0).
     */
    _mountOnSocket(socketName, pluginObj, { posOffset = null, rotOffsetEuler = null } = {}) {
      const sock = this.sockets?.[socketName] || this.bones?.[socketName] || null;
      if (!sock || !pluginObj) return null;
      pluginObj.position.set(0, 0, 0);
      pluginObj.rotation.set(0, 0, 0);
      if (posOffset) pluginObj.position.copy(posOffset);
      if (rotOffsetEuler) pluginObj.rotation.copy(rotOffsetEuler);
      sock.add(pluginObj);
      return sock;
    },

    async loadValiantGlb(modelUrl, shieldsModelUrl, onComplete, options = {}) {
      try {
        const prevActiveLBack = this.backWeaponNodes.activeLBackId;
        const prevActiveRBack = this.backWeaponNodes.activeRBackId;
        const [gltf, shieldsGltf] = await Promise.all([
          loadGlbTemplate(modelUrl),
          loadGlbTemplate(shieldsModelUrl).catch((err) => {
            console.warn('Optional shields pack GLB failed, using procedural shield fallback:', err);
            return null;
          }),
        ]);
        this.shieldsPackRoot = shieldsGltf ? shieldsGltf.scene.clone(true) : null;
        if (this.shieldsPackRoot) {
          this.shieldsPackRoot.userData.paintZone = 'shields';
        }

        // Cleanly clear prior loaded variant rig before mounting replacement GLB
        this.mechaRoot.clear();
        this.bones = {};
        this.sockets = {};
        this.thrusterPlumes = [];
        this.fpsHideNodes = [];
        this.cockpitGroup = null;
        this.cockpitMaterials = null;
        this.hardpointCaps = { left: null, right: null };
        this.weaponNodes = {
          pistol: null,
          pistolMuzzle: null,
          pistolLeft: null,
          pistolLeftMuzzle: null,
          saberHilt: null,
          bladeEmitter: null,
          saberBlade: null,
        };
        this.stowedNodes = { pistol: null, saberHilt: null, shield: null };
        this.backWeaponNodes = {
          left: {},
          right: {},
          activeLBackId: prevActiveLBack,
          activeRBackId: prevActiveRBack,
        };
        this.shieldNodes = {
          group: null,
          rightGroup: null,
          barrierMesh: null,
          barrierMat: null,
          rightBarrierMesh: null,
          rightBarrierMat: null,
          rectPivotGroup: null,
          rectBarrierMesh: null,
          rectBarrierMat: null,
          directionalDomeMesh: null,
          directionalDomeMat: null,
          fullDomeMesh: null,
          fullDomeMat: null,
          handVariants: {},
          handVariantsRight: {},
          stowVariants: {},
          fallbackHand: null,
          fallbackHandRight: null,
          fallbackStow: null,
          frameMat: null,
          saberRightGroup: null,
          saberRightBlade: null,
        };
        this.mechaRoot.userData.hasBakedMasks = options.hasBakedMasks !== false;

        const model = gltf.scene.clone(true);
        model.rotation.y = Math.PI;

        const targetBones = new Set([
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
          'Fingers_Pivot_L',
          'Fingers_Pivot_R',
          'Thumb_Pivot_L',
          'Thumb_Pivot_R',
          'Socket_L_Back',
          'Socket_R_Back',
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
        ]);
        const targetSockets = new Set([
          'Socket_Hand_L',
          'Socket_Hand_R',
          'Socket_Forearm_L',
          'Socket_Forearm_R',
          'Socket_L_Back',
          'Socket_R_Back',
          'Socket_Stow_Backpack_Shield',
          'Socket_Stow_Backpack_Saber',
          'Socket_Stow_Hip_Pistol',
        ]);

        model.traverse((obj) => {
          if (obj.isMesh) {
            obj.castShadow = true;
            obj.receiveShadow = true;
          }
          if (obj.isBone || obj.type === 'Object3D' || obj.name) {
            if (targetBones.has(obj.name)) {
              this.bones[obj.name] = obj;
              obj.userData.restQuat = obj.quaternion.clone();
              obj.userData.restPos = obj.position.clone();
            }
            if (targetSockets.has(obj.name)) {
              this.sockets[obj.name] = obj;
            }
            if (obj.name === 'Hardpoint_Cap_L') this.hardpointCaps.left = obj;
            if (obj.name === 'Hardpoint_Cap_R') this.hardpointCaps.right = obj;
            if (obj.name === 'Wpn_BeamPistol') this.weaponNodes.pistol = obj;
            if (obj.name === 'WeaponMuzzle_Origin') this.weaponNodes.pistolMuzzle = obj;
            if (obj.name === 'Wpn_HyperBeamSaber_Hilt') this.weaponNodes.saberHilt = obj;
            if (obj.name === 'BladeEmitter_Origin') this.weaponNodes.bladeEmitter = obj;
            if (obj.name === 'Wpn_HyperBeamSaber_Blade') this.weaponNodes.saberBlade = obj;
            if (obj.name === 'Mesh_Torso' || obj.name === 'Mesh_Head') {
              this.fpsHideNodes.push(obj);
            }
          }
        });

        this.mechaRoot.add(model);
        this.mechaRoot.updateMatrixWorld(true);
        if (this.bones.Leg_Upper_L && this.bones.Leg_Lower_L && this.bones.Foot_L) {
          const pHip = new THREE.Vector3();
          const pKnee = new THREE.Vector3();
          const pAnkle = new THREE.Vector3();
          this.bones.Leg_Upper_L.getWorldPosition(pHip);
          this.bones.Leg_Lower_L.getWorldPosition(pKnee);
          this.bones.Foot_L.getWorldPosition(pAnkle);
          const L1 = pHip.distanceTo(pKnee);
          const L2 = pKnee.distanceTo(pAnkle);
          if (L1 > 0.2 && L2 > 0.2) {
            this.legMetrics.L1 = L1;
            this.legMetrics.L2 = L2;
            this.legMetrics.ankleHeightM = clamp(pAnkle.y - this.mechaRoot.position.y, 0.08, 0.28);
            this.legMetrics.hipOffsetX = Math.max(0.1, Math.abs(pHip.x - this.mechaRoot.position.x));
            this.legMetrics.hipRestY = clamp(pHip.y - this.mechaRoot.position.y, 1.0, 2.0);
          }
        }

        if (this.weaponNodes.pistol) {
          this.droppedTemplates.pistol = this.weaponNodes.pistol.clone();
          this.droppedTemplates.pistol.visible = true;
        }
        if (this.weaponNodes.saberHilt) {
          const saberDrop = this.weaponNodes.saberHilt.clone();
          saberDrop.visible = true;
          saberDrop.traverse((ch) => {
            if (ch.name === 'Wpn_HyperBeamSaber_Blade' || ch.name === 'CustomPlasmaSaber') {
              ch.visible = false;
            }
          });
          this.droppedTemplates.saberHilt = saberDrop;
        }

        this._enhanceBeamSaberGlow();
        this._buildThrusterPlumes();
        if (!skipCockpit) {
          this._buildCockpitInterior();
        }
        this._buildCompositeShieldAndRightSaber();
        this._buildArmStumpMarkers();
        this.applyPartDamageVisuals(this.partState);
        onComplete?.(true);
      } catch (err) {
        console.error('Failed to load GLB:', err);
        onComplete?.(false, err?.message || 'GLB Load Failed');
      }
    },

    _enhanceBeamSaberGlow() {
      const hilt = this.weaponNodes.saberHilt;
      const emitter = this.weaponNodes.bladeEmitter || hilt?.getObjectByName('BladeEmitter_Origin') || null;
      const nativeBlade = this.weaponNodes.saberBlade || hilt?.getObjectByName('Wpn_HyperBeamSaber_Blade') || null;
      if (!hilt) return;

      const bladeLen = 1.56;
      const saberGroup = new THREE.Group();
      saberGroup.name = 'CustomPlasmaSaber';

      if (emitter) {
        // Coaxial emitter contract: BladeEmitter_Origin already sits at tip along hilt +Y
        saberGroup.position.set(0, 0, 0);
        saberGroup.rotation.set(0, 0, 0);
        emitter.add(saberGroup);
      } else {
        saberGroup.position.set(0, 0.245, 0);
        hilt.add(saberGroup);
      }
      this.weaponNodes.saberBlade = saberGroup;

      const saberCoreMat = new THREE.ShaderMaterial({
        uniforms: {
          uTime: { value: 0 },
          uSaberColor: { value: new THREE.Color('#55f6ff') },
          uSwingBoost: { value: 0 },
          uBladeLen: { value: bladeLen },
        },
        vertexShader: `
          uniform float uBladeLen;
          varying float vAxialT;
          void main() {
            vAxialT = clamp(position.y / max(0.25, uBladeLen), 0.0, 1.0);
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
          }
        `,
        fragmentShader: `
          uniform float uTime;
          uniform vec3 uSaberColor;
          uniform float uSwingBoost;
          varying float vAxialT;
          void main() {
            float t = clamp(vAxialT, 0.0, 1.0);
            float boost = clamp(uSwingBoost, 0.0, 1.0);
            float flicker = 0.86 + 0.09 * sin(uTime * 54.0 + t * 18.0) + 0.06 * sin(uTime * 131.0 - t * 37.0);
            float hiltToTip = mix(1.26, 0.44, pow(t, 0.72)) * smoothstep(1.0, 0.94, t);
            vec3 coreCol = mix(vec3(1.98, 2.0, 2.0), uSaberColor * (1.72 + 0.85 * boost), smoothstep(0.16, 0.92, t));
            gl_FragColor = vec4(coreCol * hiltToTip * flicker * (1.0 + 0.42 * boost), smoothstep(0.0, 0.015, t) * smoothstep(1.0, 0.93, t));
          }
        `,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        side: THREE.DoubleSide,
      });

      if (nativeBlade) {
        nativeBlade.position.set(0, 0, 0);
        nativeBlade.rotation.set(0, 0, 0);
        nativeBlade.scale.set(1, 1, 1);
        nativeBlade.visible = true;
        nativeBlade.traverse((ch) => {
          if (ch.isMesh) {
            ch.material = saberCoreMat;
            ch.castShadow = false;
            ch.receiveShadow = false;
          }
        });
        saberGroup.add(nativeBlade);
      } else {
        const coreGeo = new THREE.CylinderGeometry(0.004, 0.026, bladeLen, 16, 20, true);
        coreGeo.translate(0, bladeLen * 0.5, 0);
        saberGroup.add(new THREE.Mesh(coreGeo, saberCoreMat));
      }

      const auraGeo = new THREE.CylinderGeometry(0.008, 0.056, bladeLen * 1.02, 16, 16, true);
      auraGeo.translate(0, bladeLen * 0.51, 0);
      const saberAuraMat = new THREE.ShaderMaterial({
        uniforms: {
          uTime: { value: 0 },
          uSaberColor: { value: new THREE.Color('#55f6ff') },
          uSwingBoost: { value: 0 },
        },
        vertexShader: `
          uniform float uSwingBoost;
          varying vec2 vUv;
          varying vec3 vNormalV;
          varying vec3 vViewPos;
          void main() {
            vUv = uv;
            vec3 pos = position;
            float radialFlare = 1.0 + clamp(uSwingBoost, 0.0, 1.0) * 0.48 * smoothstep(0.0, 0.55, uv.y);
            pos.xz *= radialFlare;
            vec4 mvPos = modelViewMatrix * vec4(pos, 1.0);
            vViewPos = -mvPos.xyz;
            vNormalV = normalize(normalMatrix * normal);
            gl_Position = projectionMatrix * mvPos;
          }
        `,
        fragmentShader: `
          uniform float uTime;
          uniform vec3 uSaberColor;
          uniform float uSwingBoost;
          varying vec2 vUv;
          varying vec3 vNormalV;
          varying vec3 vViewPos;
          void main() {
            float t = clamp(vUv.y, 0.0, 1.0);
            float boost = clamp(uSwingBoost, 0.0, 1.0);
            float rim = pow(clamp(1.0 - abs(dot(normalize(vNormalV), normalize(vViewPos))), 0.0, 1.0), 0.75);
            float edgeSoft = 0.35 + 0.65 * (1.0 - rim);
            float flicker = 0.80 + 0.12 * sin(uTime * 49.0 + t * 22.0) + 0.09 * sin(uTime * 118.0 - t * 41.0);
            float axialFade = mix(0.66, 0.07, pow(t, 0.7)) * smoothstep(1.0, 0.88, t);
            vec3 col = uSaberColor * mix(1.48, 0.75, t) * (1.0 + 0.55 * boost);
            gl_FragColor = vec4(col * flicker, clamp(axialFade * edgeSoft * (1.0 + 0.28 * boost), 0.0, 0.92));
          }
        `,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        side: THREE.DoubleSide,
      });
      const auraMesh = new THREE.Mesh(auraGeo, saberAuraMat);
      saberGroup.add(auraMesh);

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
    },

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

      attachClusterPlumes(this.bones.Backpack, new THREE.Vector3(0, -0.45, 0.89), 1.0);
      attachClusterPlumes(this.bones.Leg_Lower_L, new THREE.Vector3(0, -0.5, 0.866), 5.0);
      attachClusterPlumes(this.bones.Leg_Lower_R, new THREE.Vector3(0, -0.5, 0.866), 9.0);
    },

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

      for (const hOff of [-0.08, 0.14]) {
        const arc = new THREE.Mesh(new THREE.TorusGeometry(0.39, 0.0025, 6, 48, Math.PI * 0.85), hudMat);
        arc.rotation.x = Math.PI * 0.5;
        arc.rotation.z = Math.PI * 0.075;
        arc.position.set(0, hOff, -0.02);
        this.cockpitGroup.add(arc);
      }

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
    },

    updateCockpitScreens(dt, nowMs, { cameraMode, yaw, physics, destructibles, dummy, score, jetIntensitySmooth, saberSwingL, saberSwingR }) {
      if (cameraMode !== CAMERA_MODES.FPS_COCKPIT || !this.cockpitScreens.leftCtx) return;
      this.cockpitScreens.timer += dt;
      if (this.cockpitScreens.timer < 0.065) return;
      this.cockpitScreens.timer = 0;

      const lCtx = this.cockpitScreens.leftCtx;
      const rCtx = this.cockpitScreens.rightCtx;
      const weaponState = getWeaponState();

      lCtx.fillStyle = 'rgba(4, 18, 28, 0.94)';
      lCtx.fillRect(0, 0, 256, 192);
      lCtx.strokeStyle = 'rgba(0, 235, 255, 0.35)';
      lCtx.lineWidth = 1.5;
      for (const r of [26, 52, 78]) {
        lCtx.beginPath();
        lCtx.arc(128, 96, r, 0, Math.PI * 2);
        lCtx.stroke();
      }
      lCtx.fillStyle = 'rgba(0, 235, 255, 0.14)';
      lCtx.beginPath();
      lCtx.moveTo(128, 96);
      lCtx.arc(128, 96, 80, -Math.PI * 0.72, -Math.PI * 0.28);
      lCtx.closePath();
      lCtx.fill();

      const cosY = Math.cos(-yaw);
      const sinY = Math.sin(-yaw);
      const toRadar = (wx, wz) => {
        const dx = wx - physics.x;
        const dz = wz - physics.z;
        const rx = dx * cosY - dz * sinY;
        const rz = dx * sinY + dz * cosY;
        return [128 + rx * 2.1, 96 + rz * 2.1];
      };

      lCtx.fillStyle = '#4ad7ff';
      for (const b of destructibles) {
        if (b.state === 'destroyed') continue;
        const [px, py] = toRadar(b.x, b.z);
        if (px > 12 && px < 244 && py > 12 && py < 180) lCtx.fillRect(px - 3, py - 3, 6, 6);
      }
      if (dummy && dummy.hp > 0) {
        const [dx, dy] = toRadar(dummy.x, dummy.z);
        lCtx.fillStyle = '#ff4444';
        lCtx.beginPath();
        lCtx.arc(dx, dy, 5, 0, Math.PI * 2);
        lCtx.fill();
      }
      lCtx.fillStyle = '#9cfaff';
      lCtx.font = 'bold 14px monospace';
      lCtx.fillText(`TAC-RADAR // BLDG:${14 - score.destroyed}`, 10, 18);
      this.cockpitScreens.leftTex.needsUpdate = true;

      rCtx.fillStyle = 'rgba(4, 18, 28, 0.94)';
      rCtx.fillRect(0, 0, 256, 192);
      rCtx.strokeStyle = '#00f2ff';
      rCtx.lineWidth = 2;
      rCtx.beginPath();
      for (let x = 12; x < 244; x += 6) {
        const phase = nowMs * 0.008 + x * 0.08;
        const y = 78 + Math.sin(phase) * (10 + jetIntensitySmooth * 18);
        if (x === 12) rCtx.moveTo(x, y);
        else rCtx.lineTo(x, y);
      }
      rCtx.stroke();

      rCtx.fillStyle = '#8ef8ff';
      rCtx.font = 'bold 14px monospace';
      rCtx.fillText(`EN REACTOR: ${Math.round(physics.en)}%`, 12, 22);
      rCtx.fillStyle = weaponState.hasPistol ? '#55ff99' : '#ff6644';
      rCtx.fillText(`R-PISTOL : ${weaponState.hasPistol ? 'ONLINE' : 'DROPPED [R]'}`, 12, 132);
      rCtx.fillStyle = weaponState.hasSaber ? '#55f6ff' : '#ff6644';
      const activeSaber = saberSwingL.active ? saberSwingL : saberSwingR;
      rCtx.fillText(`SABER    : ${weaponState.saberIgnited ? 'IGNITED [' + activeSaber.dir + ']' : 'STOWED'}`, 12, 158);
      this.cockpitScreens.rightTex.needsUpdate = true;
    },

    _buildCompositeShieldAndRightSaber() {
      const armU = this.bones.Arm_Upper_L;
      const armL = this.bones.Arm_Lower_L;
      const handL = this.bones.Hand_L || this.bones.WeaponMount_L;
      const sockForearmL = this.sockets.Socket_Forearm_L;

      const _makeHexBarrierMat = (barrierMode = 0) =>
        new THREE.ShaderMaterial({
          uniforms: {
            uTime: { value: 0 },
            uOpacity: { value: 0.0 },
            uFlash: { value: 0.0 },
            uColor: { value: new THREE.Color('#32e8ff') },
            uMode: { value: barrierMode },
            uDiamond: { value: 0.0 },
            uCenterWindow: { value: 0.0 },
            uYawHalfDeg: { value: 86.0 },
            uPitchHalfDeg: { value: 74.0 },
            uDiscRadius: { value: 0.62 },
            uRectHalfW: { value: 0.64 },
            uRectHalfH: { value: 1.04 },
          },
          vertexShader: `
            varying vec3 vLocalPos;
            varying vec3 vLocalDir;
            void main() {
              vLocalPos = position;
              vLocalDir = normalize(position);
              gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
            }
          `,
          fragmentShader: `
            uniform float uTime;
            uniform float uOpacity;
            uniform float uFlash;
            uniform vec3 uColor;
            uniform float uMode;
            uniform float uDiamond;
            uniform float uCenterWindow;
            uniform float uYawHalfDeg;
            uniform float uPitchHalfDeg;
            uniform float uDiscRadius;
            uniform float uRectHalfW;
            uniform float uRectHalfH;
            varying vec3 vLocalPos;
            varying vec3 vLocalDir;
            float hexGrid(vec2 p) {
              vec2 r = vec2(1.0, 1.73205);
              vec2 h = r * 0.5;
              vec2 a = mod(p, r) - h;
              vec2 b = mod(p - h, r) - h;
              vec2 gv = dot(a, a) < dot(b, b) ? a : b;
              return 0.5 - max(abs(gv.x), dot(abs(gv), normalize(vec2(1.0, 1.73205))));
            }
            void main() {
              vec2 uvCoord = vec2(0.0);
              float dist = 0.0;
              float hexScale = 4.6;
              float outerRim = 0.0;
              float windowMul = 1.0;

              if (uMode > 2.5) {
                vec2 pNorm = vLocalPos.xy * 2.0;
                float boxMax = max(abs(pNorm.x), abs(pNorm.y));
                float cornerCut = (abs(pNorm.x) + abs(pNorm.y)) * 0.52;
                if (boxMax > 1.0 || cornerCut > 1.01) discard;
                uvCoord = vec2(vLocalPos.x * uRectHalfW, vLocalPos.y * uRectHalfH) * 1.45;
                  dist = boxMax;
                  hexScale = 3.6;
                  outerRim = max(smoothstep(0.84, 0.99, boxMax), smoothstep(0.92, 1.01, cornerCut));
                  if (uCenterWindow > 0.5) {
                    float winR = length(vec2(pNorm.x / 0.28, pNorm.y / 0.22));
                    windowMul = mix(0.14, 1.0, smoothstep(0.62, 1.15, winR));
                    float sightRing = smoothstep(0.92, 1.0, winR) * (1.0 - smoothstep(1.0, 1.12, winR));
                    outerRim = max(outerRim, sightRing * 0.92);
                  }
                } else if (uMode > 1.5) {
                  uvCoord = vec2(atan(vLocalDir.z, vLocalDir.x) * 2.2, asin(clamp(vLocalDir.y, -1.0, 1.0)) * 2.2);
                  dist = abs(vLocalDir.y) * 0.85;
                  hexScale = 3.2;
                  outerRim = smoothstep(0.35, 0.92, 1.0 - abs(vLocalDir.y)) * 0.45;
                } else if (uMode > 0.5) {
                  if (vLocalDir.z >= -0.01) discard;
                  float azDeg = abs(degrees(atan(vLocalDir.x, -vLocalDir.z)));
                  float elDeg = abs(degrees(asin(clamp(vLocalDir.y, -1.0, 1.0))));
                  if (uDiamond > 0.5) {
                    float m = azDeg / max(1.0, uYawHalfDeg) + elDeg / max(1.0, uPitchHalfDeg);
                    if (m > 1.0) discard;
                    dist = m;
                    outerRim = smoothstep(0.84, 0.99, m);
                  } else {
                    if (azDeg > uYawHalfDeg || elDeg > uPitchHalfDeg) discard;
                    float edgeR = max(azDeg / max(1.0, uYawHalfDeg), elDeg / max(1.0, uPitchHalfDeg));
                    dist = edgeR;
                    outerRim = smoothstep(0.84, 0.99, edgeR);
                  }
                  uvCoord = vec2(atan(vLocalDir.x, -vLocalDir.z) * 2.4, asin(clamp(vLocalDir.y, -1.0, 1.0)) * 2.4);
                  hexScale = 3.6;
                  if (uCenterWindow > 0.5) {
                    float winR = length(vec2(azDeg / 10.5, elDeg / 9.0));
                    windowMul = mix(0.16, 1.0, smoothstep(0.65, 1.15, winR));
                    float sightRing = smoothstep(0.92, 1.0, winR) * (1.0 - smoothstep(1.0, 1.12, winR));
                    outerRim = max(outerRim, sightRing * 0.9);
                  }
                } else {
                  float rNorm = length(vLocalPos.xy) / max(0.1, uDiscRadius);
                  if (rNorm > 1.0) discard;
                  uvCoord = vLocalPos.xy / max(0.1, uDiscRadius);
                  dist = rNorm;
                  hexScale = 4.2;
                  outerRim = smoothstep(0.80, 0.99, rNorm);
                }

                float hex = hexGrid(uvCoord * hexScale + vec2(0.0, uTime * 0.45));
                float edge = smoothstep(0.08, 0.01, abs(hex));
                vec3 gold = vec3(1.9, 1.65, 0.65);
                vec3 col = mix(uColor * 1.4, gold, uFlash);
                float pulse = 0.72 + 0.28 * sin(uTime * 11.0 - dist * 8.0);
                float a = clamp((edge * 0.68 + outerRim * 1.35 + 0.12) * pulse * uOpacity * windowMul, 0.0, 0.92);
                gl_FragColor = vec4(col * (1.2 + uFlash * 1.5), a);
              }
            `,
            transparent: true,
            depthWrite: false,
            blending: THREE.AdditiveBlending,
            side: THREE.DoubleSide,
          });

      if (armL && armU) {
        const makeCompositeShieldArmor = (includeBarrier = true) => {
          const grp = new THREE.Group();
          grp.userData.paintZone = 'shields';
          const fallbackGrp = new THREE.Group();
          const frameMat = new THREE.MeshStandardMaterial({ color: '#1b2c47', roughness: 0.34, metalness: 0.72 });
          frameMat.name = 'Mat_Frame_DarkMetal';
          const plateMat = new THREE.MeshStandardMaterial({ color: '#eef3fa', roughness: 0.42, metalness: 0.25 });
          plateMat.name = 'Mat_Armor_Primary';
          const accentMat = new THREE.MeshStandardMaterial({ color: '#2b5ea8', roughness: 0.36, metalness: 0.45 });
          accentMat.name = 'Mat_Armor_Secondary';
          const emitterMat = new THREE.MeshStandardMaterial({
            color: '#46f4ff',
            emissive: '#00d8ff',
            emissiveIntensity: 1.4,
            roughness: 0.2,
          });
          emitterMat.name = 'Mat_Glow_Sensor';

          const baseBody = new THREE.Mesh(new THREE.BoxGeometry(0.44, 0.92, 0.055), frameMat);
          baseBody.castShadow = true;
          fallbackGrp.add(baseBody);

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
          fallbackGrp.add(upperArmor, lowerArmor, noseTip, coreCrystal);
          grp.add(fallbackGrp);

          let barrierMesh = null;
          let barrierMat = null;
          if (includeBarrier) {
            const barrierGeo = new THREE.CircleGeometry(0.62, 36);
            barrierMat = _makeHexBarrierMat(0);
            barrierMesh = new THREE.Mesh(barrierGeo, barrierMat);
            barrierMesh.position.set(0, -0.18, 0.09);
            barrierMesh.visible = false;
            grp.add(barrierMesh);
          }

          return { grp, fallbackGrp, barrierMesh, barrierMat, frameMat };
        };

        const builtShield = makeCompositeShieldArmor(true);
        const shieldGroup = builtShield.grp;
        shieldGroup.name = 'EF_CompositeShield_L';
        if (sockForearmL) {
          this._mountOnSocket('Socket_Forearm_L', shieldGroup);
          shieldGroup.userData.baseLocalPos = new THREE.Vector3(0, 0, 0);
          shieldGroup.userData.forwardPushLocal = new THREE.Vector3(0, 0, 1);
        } else {
          shieldGroup.position.set(0.08, 0.0, 0.0);
          shieldGroup.userData.baseLocalPos = shieldGroup.position.clone();
          shieldGroup.userData.forwardPushLocal = new THREE.Vector3(0, 0, 1);
          armL.add(shieldGroup);
        }

        const rectPivotGroup = new THREE.Group();
        rectPivotGroup.name = 'EF_RectBarrierPivot';
        rectPivotGroup.position.set(0, 1.35, 0);
        this.mechaRoot.add(rectPivotGroup);
        const rectBarrierMat = _makeHexBarrierMat(3);
        const rectBarrierMesh = new THREE.Mesh(new THREE.PlaneGeometry(1.0, 1.0, 1, 1), rectBarrierMat);
        rectBarrierMesh.name = 'EF_RectBarrierWall';
        rectBarrierMesh.position.set(0, 0, -0.95);
        rectBarrierMesh.scale.set(1.28, 2.08, 1.0);
        rectBarrierMesh.visible = false;
        rectPivotGroup.add(rectBarrierMesh);

        const directionalDomeMat = _makeHexBarrierMat(1);
        const directionalDomeMesh = new THREE.Mesh(new THREE.SphereGeometry(1.0, 36, 24), directionalDomeMat);
        directionalDomeMesh.name = 'EF_DirectionalBarrierDome';
        directionalDomeMesh.position.set(0, 1.35, 0);
        directionalDomeMesh.visible = false;
        this.mechaRoot.add(directionalDomeMesh);

        const fullDomeMat = _makeHexBarrierMat(2);
        const fullDomeMesh = new THREE.Mesh(new THREE.SphereGeometry(2.1, 32, 22), fullDomeMat);
        fullDomeMesh.name = 'EF_BastionFullDome';
        fullDomeMesh.position.set(0, 1.35, 0);
        fullDomeMesh.visible = false;
        this.mechaRoot.add(fullDomeMesh);

        this.shieldNodes = {
          ...this.shieldNodes,
          group: shieldGroup,
          barrierMesh: builtShield.barrierMesh,
          barrierMat: builtShield.barrierMat,
          rectPivotGroup,
          rectBarrierMesh,
          rectBarrierMat,
          directionalDomeMesh,
          directionalDomeMat,
          fullDomeMesh,
          fullDomeMat,
          fallbackHand: builtShield.fallbackGrp,
          frameMat: builtShield.frameMat,
        };

        const armR = this.bones.Arm_Lower_R;
        const sockForearmR = this.sockets.Socket_Forearm_R;
        if (armR) {
          const rightBuiltShield = makeCompositeShieldArmor(true);
          const rightShieldGroup = rightBuiltShield.grp;
          rightShieldGroup.name = 'EF_CompositeShield_R';
          if (sockForearmR) {
            this._mountOnSocket('Socket_Forearm_R', rightShieldGroup);
            rightShieldGroup.userData.baseLocalPos = new THREE.Vector3(0, 0, 0);
            rightShieldGroup.userData.forwardPushLocal = new THREE.Vector3(0, 0, 1);
          } else {
            rightShieldGroup.position.set(-0.08, 0.0, 0.0);
            rightShieldGroup.userData.baseLocalPos = rightShieldGroup.position.clone();
            rightShieldGroup.userData.forwardPushLocal = new THREE.Vector3(0, 0, 1);
            armR.add(rightShieldGroup);
          }
          rightShieldGroup.visible = false;

          this.shieldNodes.rightGroup = rightShieldGroup;
          this.shieldNodes.rightBarrierMesh = rightBuiltShield.barrierMesh;
          this.shieldNodes.rightBarrierMat = rightBuiltShield.barrierMat;
          this.shieldNodes.fallbackHandRight = rightBuiltShield.fallbackGrp;
        }

        // Backpack & Pelvis Stow Sockets (0,0,0 snap!)
        if (this.sockets.Socket_Stow_Backpack_Shield) {
          const stowedShieldBuilt = makeCompositeShieldArmor(false);
          const shieldStowGrp = stowedShieldBuilt.grp;
          shieldStowGrp.name = 'Stowed_CompositeShield_Backpack';
          shieldStowGrp.scale.setScalar(0.84);
          this._mountOnSocket('Socket_Stow_Backpack_Shield', shieldStowGrp);
          this.stowedNodes.shield = shieldStowGrp;
          this.shieldNodes.fallbackStow = stowedShieldBuilt.fallbackGrp;
        }

        if (this.sockets.Socket_Stow_Backpack_Saber && this.weaponNodes.saberHilt) {
          const saberRack = new THREE.Group();
          saberRack.name = 'Stowed_BeamSaber_Backpack';
          const stowedHilt = this.weaponNodes.saberHilt.clone();
          stowedHilt.visible = true;
          const toRemove = [];
          stowedHilt.traverse((c) => {
            if (
              c.name === 'BladeEmitter_Origin' ||
              c.name === 'CustomPlasmaSaber' ||
              (c.name && c.name.startsWith('Wpn_HyperBeamSaber_Blade'))
            ) {
              toRemove.push(c);
            }
          });
          for (const bc of toRemove) bc.parent?.remove(bc);
          stowedHilt.position.set(0, 0, 0);
          stowedHilt.rotation.set(0, 0, 0);
          saberRack.add(stowedHilt);
          this._mountOnSocket('Socket_Stow_Backpack_Saber', saberRack);
          this.stowedNodes.saberHilt = saberRack;
        }

        if (this.sockets.Socket_Stow_Hip_Pistol && this.weaponNodes.pistol) {
          const pistolHolster = new THREE.Group();
          pistolHolster.name = 'Stowed_BeamPistol_Pelvis';
          const stowedPistol = this.weaponNodes.pistol.clone();
          stowedPistol.visible = true;
          stowedPistol.position.set(0, 0, 0);
          stowedPistol.rotation.set(0, 0, 0);
          pistolHolster.add(stowedPistol);
          this._mountOnSocket('Socket_Stow_Hip_Pistol', pistolHolster);
          this.stowedNodes.pistol = pistolHolster;
        }
      }

      if (this.weaponNodes.pistol && !this.weaponNodes.pistolMuzzle) {
        const m = new THREE.Object3D();
        m.name = 'WeaponMuzzle_Origin';
        m.position.set(0, 0.078, 0.455);
        this.weaponNodes.pistol.add(m);
        this.weaponNodes.pistolMuzzle = m;
      }

      const mountR = this.sockets.Socket_Hand_R || this.bones.WeaponMount_R || this.bones.Hand_R;
      if (mountR && this.weaponNodes.saberHilt) {
        const rGrp = new THREE.Group();
        rGrp.name = 'RightHandBeamSaber';
        const hiltClone = this.weaponNodes.saberHilt.clone();
        hiltClone.visible = true;
        hiltClone.position.set(0, 0, 0);
        hiltClone.rotation.set(0, 0, 0);
        const rBlade = hiltClone.getObjectByName('CustomPlasmaSaber') || null;
        rGrp.add(hiltClone);
        rGrp.visible = false;
        this._mountOnSocket('Socket_Hand_R', rGrp, {
          rotOffsetEuler: new THREE.Euler(14 * DEG2RAD, 0, 0, 'XYZ'),
        });
        this.shieldNodes.saberRightGroup = rGrp;
        this.shieldNodes.saberRightBlade = rBlade;
      }

      const mountL = this.sockets.Socket_Hand_L || this.bones.WeaponMount_L || this.bones.Hand_L;
      if (mountL && this.weaponNodes.pistol) {
        const lPistol = this.weaponNodes.pistol.clone();
        lPistol.name = 'LeftHandBeamPistol';
        lPistol.visible = false;
        this._mountOnSocket('Socket_Hand_L', lPistol, {
          rotOffsetEuler: new THREE.Euler(-14 * DEG2RAD, 0, 0, 'XYZ'),
        });
        this.weaponNodes.pistolLeft = lPistol;
        this.weaponNodes.pistolLeftMuzzle = lPistol.getObjectByName('WeaponMuzzle_Origin') || null;
      }

      this.populateShieldGlbVariants();
      this.attachBackEquipment();
      this.populateHangarRackGlbClones();
      this.syncWeaponLoadoutVisibility();
    },

    /**
     * [Task 6] Mount procedural 3D L_BACK / R_BACK shoulder weapon & booster pods
     * directly onto ShoulderPad_L / ShoulderPad_R in verified mecha world orientation.
     */
    attachBackEquipment() {
      const mountShoulderSide = (socketNode, ids, sideKey) => {
        if (!socketNode) return;
        const bQuatW = socketNode.getWorldQuaternion(new THREE.Quaternion());
        // World rest frame (+X right, +Y up, +Z back / -Z forward)
        const localQuat = bQuatW.clone().invert();

        for (const id of ids) {
          if (this.backWeaponNodes[sideKey][id]) continue;
          const makePlume = (seed) => {
            const u = { uTime: { value: 0 }, uIntensity: { value: 0 }, uSeed: { value: seed } };
            return new THREE.ShaderMaterial({
              uniforms: u,
              vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
              fragmentShader: `uniform float uTime; uniform float uIntensity; uniform float uSeed; varying vec2 vUv; void main(){ float g = (1.0 - vUv.y); float flick = 0.86 + 0.14 * sin(vUv.y * 18.0 - uTime * 40.0 + uSeed); vec3 col = mix(vec3(0.18,0.85,1.8), vec3(2.8,2.6,2.2), pow(g,2.2)); gl_FragColor = vec4(col * flick, g * clamp(uIntensity, 0.0, 1.25) * 0.9); }`,
              transparent: true,
              depthWrite: false,
              blending: THREE.AdditiveBlending,
              side: THREE.DoubleSide,
            });
          };
          const node = createProceduralBackModule(id, makePlume);
          node.position.set(0, 0.03, 0.02);
          node.quaternion.copy(localQuat);
          node.visible = false;
          socketNode.add(node);
          this.backWeaponNodes[sideKey][id] = node;
          if (Array.isArray(node.userData.extraPlumes)) {
            for (const p of node.userData.extraPlumes) {
              this.thrusterPlumes.push(p);
            }
          }
        }
      };

      this.mechaRoot.updateMatrixWorld(true);
      mountShoulderSide(this.sockets.Socket_L_Back || this.bones.Socket_L_Back || this.bones.ShoulderPad_L, ['EF-RL08', 'EF-BP03'], 'left');
      mountShoulderSide(this.sockets.Socket_R_Back || this.bones.Socket_R_Back || this.bones.ShoulderPad_R, ['EF-HC04', 'EF-TB04'], 'right');
      this.syncBackEquipmentVisibility(this.backWeaponNodes.activeLBackId, this.backWeaponNodes.activeRBackId);
    },

    /**
     * Mirror authentic GLB pistol, saber hilt, and 4 Tier shields onto the Hangar floor racks.
     */
    populateHangarRackGlbClones() {
      const rk = this.hangarRackNodes;
      if (!rk) return;
      if (rk.pistol && this.weaponNodes.pistol && !rk.pistol.userData.glbReady) {
        rk.pistol.clear();
        const cloneP = this.weaponNodes.pistol.clone(true);
        cloneP.visible = true;
        cloneP.position.set(0, 0, 0);
        cloneP.rotation.set(0.3, Math.PI * 0.5, 0);
        cloneP.scale.setScalar(1.3);
        rk.pistol.add(cloneP);
        rk.pistol.userData.glbReady = true;
      }
      if (rk.saber && this.weaponNodes.saberHilt && !rk.saber.userData.glbReady) {
        rk.saber.clear();
        const cloneS = this.weaponNodes.saberHilt.clone(true);
        cloneS.visible = true;
        cloneS.traverse((c) => {
          if (c.name && (c.name === 'CustomPlasmaSaber' || c.name.startsWith('Wpn_HyperBeamSaber_Blade'))) {
            c.visible = false;
          }
        });
        cloneS.position.set(0, 0, 0);
        cloneS.rotation.set(0.18, 0, 0);
        cloneS.scale.setScalar(1.35);
        rk.saber.add(cloneS);
        rk.saber.userData.glbReady = true;
      }
      if (this.shieldsPackRoot && rk.shields) {
        for (const id of SHIELD_IDS) {
          const holder = rk.shields[id];
          const def = catalog.getShield(id);
          const src = def ? this.shieldsPackRoot.getObjectByName(def.glbNode) : null;
          if (!holder || !src || holder.userData.glbReady) continue;
          holder.clear();
          const cloneSh = src.clone(true);
          cloneSh.position.set(0, 0, 0);
          cloneSh.rotation.set(0, 0.35, 0);
          cloneSh.scale.setScalar(0.68);
          holder.add(cloneSh);
          holder.userData.glbReady = true;
        }
      }
    },

    syncBackEquipmentVisibility(lBackId = null, rBackId = null) {
      this.backWeaponNodes.activeLBackId = lBackId || null;
      this.backWeaponNodes.activeRBackId = rBackId || null;
      for (const [id, node] of Object.entries(this.backWeaponNodes.left || {})) {
        node.visible = id === this.backWeaponNodes.activeLBackId;
      }
      for (const [id, node] of Object.entries(this.backWeaponNodes.right || {})) {
        node.visible = id === this.backWeaponNodes.activeRBackId;
      }
      if (this.hardpointCaps?.left) {
        this.hardpointCaps.left.visible = !this.backWeaponNodes.activeLBackId;
      }
      if (this.hardpointCaps?.right) {
        this.hardpointCaps.right.visible = !this.backWeaponNodes.activeRBackId;
      }
    },

    stepBackWeaponRecoil(dt) {
      const decay = Math.exp(-11 * Math.max(0.001, dt));
      this.backRecoil.left *= decay;
      this.backRecoil.right *= decay;
      const updateSide = (map, activeId, rec) => {
        const node = activeId ? map?.[activeId] : null;
        const asm = node?.userData?.recoilAssembly;
        if (asm) asm.position.z = rec * 0.24;
      };
      updateSide(this.backWeaponNodes.left, this.backWeaponNodes.activeLBackId, this.backRecoil.left);
      updateSide(this.backWeaponNodes.right, this.backWeaponNodes.activeRBackId, this.backRecoil.right);
    },

    getBackMuzzleWorldPos(side = 'left', outVec = new THREE.Vector3()) {
      const isLeft = side === 'left';
      const activeId = isLeft ? this.backWeaponNodes.activeLBackId : this.backWeaponNodes.activeRBackId;
      const node = activeId ? this.backWeaponNodes[isLeft ? 'left' : 'right']?.[activeId] : null;
      if (node) {
        const localMuzzle = node.userData?.muzzleLocal || new THREE.Vector3(0, 0.12, -0.6);
        outVec.copy(localMuzzle);
        node.localToWorld(outVec);
        return outVec;
      }
      return null;
    },

    populateShieldGlbVariants() {
      if (!this.shieldsPackRoot) return;
      let mountedAny = false;
      for (const id of SHIELD_IDS) {
        const def = catalog.getShield(id);
        if (!def) continue;
        const src = this.shieldsPackRoot.getObjectByName(def.glbNode);
        if (!src) continue;

        const _attachVariant = (targetParent, mapDict) => {
          if (!targetParent || mapDict[id]) return false;
          const clone = src.clone(true);
          clone.position.set(0, 0, 0);
          clone.rotation.set(0, 0, 0);
          clone.scale.set(1, 1, 1);
          clone.traverse((o) => {
            if (o.isMesh) {
              o.castShadow = true;
              o.receiveShadow = true;
            }
          });
          targetParent.add(clone);
          mapDict[id] = clone;
          return true;
        };

        if (_attachVariant(this.shieldNodes.group, this.shieldNodes.handVariants)) mountedAny = true;
        if (_attachVariant(this.shieldNodes.rightGroup, this.shieldNodes.handVariantsRight)) mountedAny = true;
        _attachVariant(this.stowedNodes.shield, this.shieldNodes.stowVariants);
      }

      if (mountedAny) {
        if (this.shieldNodes.fallbackHand) this.shieldNodes.fallbackHand.visible = false;
        if (this.shieldNodes.fallbackHandRight) this.shieldNodes.fallbackHandRight.visible = false;
        if (this.shieldNodes.fallbackStow) this.shieldNodes.fallbackStow.visible = false;
      }
      this.syncShieldVariantVisibility();
    },

    syncShieldVariantVisibility() {
      const activeId = getActiveShieldId();
      for (const id of SHIELD_IDS) {
        if (this.shieldNodes.handVariants[id]) {
          this.shieldNodes.handVariants[id].visible = id === activeId;
        }
        if (this.shieldNodes.handVariantsRight[id]) {
          this.shieldNodes.handVariantsRight[id].visible = id === activeId;
        }
        if (this.shieldNodes.stowVariants[id]) {
          this.shieldNodes.stowVariants[id].visible = id === activeId;
        }
      }
      const def = getActiveShieldDef();
      const hexColor = def.barrierColor || '#32e8ff';
      if (this.shieldNodes.barrierMat) {
        this.shieldNodes.barrierMat.uniforms.uColor.value.set(hexColor);
        this.shieldNodes.barrierMat.uniforms.uDiscRadius.value = def.barrierRadiusM || 0.62;
      }
      if (this.shieldNodes.rightBarrierMat) {
        this.shieldNodes.rightBarrierMat.uniforms.uColor.value.set(hexColor);
        this.shieldNodes.rightBarrierMat.uniforms.uDiscRadius.value = def.barrierRadiusM || 0.62;
      }
      if (this.shieldNodes.rectBarrierMat && this.shieldNodes.rectBarrierMesh) {
        const rHalfW = def.rectHalfW || 0.64;
        const rHalfH = def.rectHalfH || 1.04;
        this.shieldNodes.rectBarrierMat.uniforms.uColor.value.set(hexColor);
        this.shieldNodes.rectBarrierMat.uniforms.uCenterWindow.value = def.centerWindowClear ? 1.0 : 0.0;
        this.shieldNodes.rectBarrierMat.uniforms.uRectHalfW.value = rHalfW;
        this.shieldNodes.rectBarrierMat.uniforms.uRectHalfH.value = rHalfH;
        this.shieldNodes.rectBarrierMesh.position.set(0, 0, -(def.barrierRadiusM || 0.95));
        this.shieldNodes.rectBarrierMesh.scale.set(rHalfW * 2, rHalfH * 2, 1.0);
      }
      if (this.shieldNodes.directionalDomeMat && this.shieldNodes.directionalDomeMesh) {
        this.shieldNodes.directionalDomeMat.uniforms.uColor.value.set(hexColor);
        this.shieldNodes.directionalDomeMat.uniforms.uDiamond.value = def.diamondShape ? 1.0 : 0.0;
        this.shieldNodes.directionalDomeMat.uniforms.uCenterWindow.value = def.centerWindowClear ? 1.0 : 0.0;
        this.shieldNodes.directionalDomeMat.uniforms.uYawHalfDeg.value = def.yawHalfDeg || 86;
        this.shieldNodes.directionalDomeMat.uniforms.uPitchHalfDeg.value = def.pitchHalfDeg || 74;
        this.shieldNodes.directionalDomeMesh.scale.setScalar(def.barrierRadiusM || 1.38);
      }
      if (this.shieldNodes.fullDomeMat) {
        this.shieldNodes.fullDomeMat.uniforms.uColor.value.set(def.barrierColor || '#ffbe48');
      }
    },

    syncWeaponLoadoutVisibility() {
      const preset = getLoadoutPreset();
      const weaponState = getWeaponState();
      const pistolRightEquip = preset.rHand === 'pistol' && weaponState.hasPistol;
      const pistolLeftEquip = preset.lHand === 'pistol' && weaponState.hasPistol;
      const pistolAnyEquip = pistolRightEquip || pistolLeftEquip;
      const saberLeftEquip = preset.lHand === 'saber' && weaponState.hasSaber;
      const saberRightEquip = preset.rHand === 'saber' && weaponState.hasSaber;
      const saberAnyEquip = saberLeftEquip || saberRightEquip;
      const shieldLeftEquip = preset.lHand === 'shield';
      const shieldRightEquip = preset.rHand === 'shield';
      const shieldAnyEquip = shieldLeftEquip || shieldRightEquip;

      if (this.weaponNodes.pistol) this.weaponNodes.pistol.visible = pistolRightEquip;
      if (this.weaponNodes.pistolLeft) this.weaponNodes.pistolLeft.visible = pistolLeftEquip;
      if (this.weaponNodes.saberHilt) this.weaponNodes.saberHilt.visible = saberLeftEquip;
      if (this.weaponNodes.saberBlade) {
        this.weaponNodes.saberBlade.visible = saberLeftEquip && weaponState.saberIgnited;
      }
      if (this.shieldNodes.group) this.shieldNodes.group.visible = shieldLeftEquip;
      if (this.shieldNodes.rightGroup) this.shieldNodes.rightGroup.visible = shieldRightEquip;
      if (this.shieldNodes.saberRightGroup) this.shieldNodes.saberRightGroup.visible = saberRightEquip;
      if (this.shieldNodes.saberRightBlade) {
        this.shieldNodes.saberRightBlade.visible = saberRightEquip && weaponState.saberIgnited;
      }

      if (this.stowedNodes.pistol) {
        this.stowedNodes.pistol.visible = weaponState.hasPistol && !pistolAnyEquip;
      }
      if (this.stowedNodes.saberHilt) {
        this.stowedNodes.saberHilt.visible = weaponState.hasSaber && !saberAnyEquip;
      }
      if (this.stowedNodes.shield) {
        this.stowedNodes.shield.visible = !shieldAnyEquip;
      }
    },

    _buildArmStumpMarkers() {
      const makeStump = () => {
        const grp = new THREE.Group();
        const scorched = new THREE.Mesh(
          new THREE.CylinderGeometry(0.11, 0.13, 0.055, 12),
          new THREE.MeshStandardMaterial({
            color: '#1b1e24',
            metalness: 0.75,
            roughness: 0.65,
            emissive: '#ff4818',
            emissiveIntensity: 1.35,
          }),
        );
        const emberRing = new THREE.Mesh(
          new THREE.TorusGeometry(0.085, 0.018, 6, 12),
          new THREE.MeshBasicMaterial({ color: '#ff963c' }),
        );
        emberRing.rotation.x = Math.PI * 0.5;
        emberRing.position.y = -0.025;
        grp.add(scorched, emberRing);
        grp.visible = false;
        return grp;
      };

      this.armStumpMarkers = { left: null, right: null };
      if (this.bones.ShoulderPad_L) {
        const stumpL = makeStump();
        if (this.bones.Arm_Upper_L) stumpL.position.copy(this.bones.Arm_Upper_L.position);
        else stumpL.position.set(0, -0.06, 0);
        this.bones.ShoulderPad_L.add(stumpL);
        this.armStumpMarkers.left = stumpL;
      }
      if (this.bones.ShoulderPad_R) {
        const stumpR = makeStump();
        if (this.bones.Arm_Upper_R) stumpR.position.copy(this.bones.Arm_Upper_R.position);
        else stumpR.position.set(0, -0.06, 0);
        this.bones.ShoulderPad_R.add(stumpR);
        this.armStumpMarkers.right = stumpR;
      }
    },

    applyPartDamageVisuals(partState = null) {
      this.partState = partState || null;
      const armLSevered = Boolean(partState?.arm_l?.severed);
      const armRSevered = Boolean(partState?.arm_r?.severed);

      if (this.bones.Arm_Upper_L) this.bones.Arm_Upper_L.visible = !armLSevered;
      if (this.bones.Arm_Upper_R) this.bones.Arm_Upper_R.visible = !armRSevered;
      if (this.armStumpMarkers.left) this.armStumpMarkers.left.visible = armLSevered;
      if (this.armStumpMarkers.right) this.armStumpMarkers.right.visible = armRSevered;
    },

    getSubPartHitCapsules(partState = null) {
      const pState = partState || this.partState;
      this.mechaRoot.updateMatrixWorld(true);
      const b = this.bones;
      const vA = this._tmpCapVecA;
      const vB = this._tmpCapVecB;
      const vFwd = this._tmpCapBackFwd;

      const writeCap = (idx, ax, ay, az, bx, by, bz, radius, disabled = false) => {
        const c = this._subPartCaps[idx];
        c.a.x = ax; c.a.y = ay; c.a.z = az;
        c.b.x = bx; c.b.y = by; c.b.z = bz;
        c.radius = radius;
        c.disabled = Boolean(disabled);
      };

      if (b.Head && b.Torso && b.Pelvis) {
        b.Head.getWorldPosition(vA);
        writeCap(0, vA.x, vA.y + 0.02, vA.z, vA.x, vA.y + 0.34, vA.z, 0.27, false);

        b.Pelvis.getWorldPosition(vA);
        b.Torso.getWorldPosition(vB);
        writeCap(1, vA.x, vA.y + 0.08, vA.z, vB.x, vB.y + 0.38, vB.z, 0.43, false);

        if (b.Backpack) {
          b.Backpack.getWorldPosition(vA);
          b.Backpack.getWorldDirection(vFwd);
          const ox = vFwd.x * 0.22;
          const oz = vFwd.z * 0.22;
          writeCap(2, vA.x + ox, vA.y - 0.14, vA.z + oz, vA.x + ox, vA.y + 0.36, vA.z + oz, 0.39, false);
        } else {
          writeCap(2, vB.x, vB.y, vB.z, vB.x, vB.y + 0.35, vB.z, 0.35, true);
        }

        if (b.Arm_Upper_L && b.Hand_L) {
          b.Arm_Upper_L.getWorldPosition(vA);
          b.Hand_L.getWorldPosition(vB);
          writeCap(3, vA.x, vA.y, vA.z, vB.x, vB.y, vB.z, 0.26, Boolean(pState?.arm_l?.severed));
        } else {
          writeCap(3, 0, 0, 0, 0, 0, 0, 0.25, true);
        }

        if (b.Arm_Upper_R && b.Hand_R) {
          b.Arm_Upper_R.getWorldPosition(vA);
          b.Hand_R.getWorldPosition(vB);
          writeCap(4, vA.x, vA.y, vA.z, vB.x, vB.y, vB.z, 0.26, Boolean(pState?.arm_r?.severed));
        } else {
          writeCap(4, 0, 0, 0, 0, 0, 0, 0.25, true);
        }

        if (b.Leg_Upper_L && b.Foot_L) {
          b.Leg_Upper_L.getWorldPosition(vA);
          b.Foot_L.getWorldPosition(vB);
          writeCap(5, vA.x, vA.y, vA.z, vB.x, vB.y, vB.z, 0.27, false);
        } else {
          writeCap(5, 0, 0, 0, 0, 0, 0, 0.27, true);
        }

        if (b.Leg_Upper_R && b.Foot_R) {
          b.Leg_Upper_R.getWorldPosition(vA);
          b.Foot_R.getWorldPosition(vB);
          writeCap(6, vA.x, vA.y, vA.z, vB.x, vB.y, vB.z, 0.27, false);
        } else {
          writeCap(6, 0, 0, 0, 0, 0, 0, 0.27, true);
        }
      } else {
        // Fallback single-root proportions when GLB still loading
        const rx = this.mechaRoot.position.x;
        const ry = this.mechaRoot.position.y;
        const rz = this.mechaRoot.position.z;
        writeCap(0, rx, ry + 2.15, rz, rx, ry + 2.48, rz, 0.26, false);
        writeCap(1, rx, ry + 1.25, rz, rx, ry + 2.02, rz, 0.44, false);
        writeCap(2, rx, ry + 1.55, rz + 0.28, rx, ry + 2.05, rz + 0.28, 0.36, false);
        writeCap(3, rx - 0.6, ry + 1.9, rz, rx - 0.65, ry + 1.15, rz, 0.25, Boolean(pState?.arm_l?.severed));
        writeCap(4, rx + 0.6, ry + 1.9, rz, rx + 0.65, ry + 1.15, rz, 0.25, Boolean(pState?.arm_r?.severed));
        writeCap(5, rx - 0.22, ry + 1.1, rz, rx - 0.24, ry + 0.08, rz, 0.27, false);
        writeCap(6, rx + 0.22, ry + 1.1, rz, rx + 0.24, ry + 0.08, rz, 0.27, false);
      }

      return this._subPartCaps;
    },

    getSubPartWorldPos(partId = 'torso', outVec = new THREE.Vector3()) {
      const b = this.bones;
      const boneMap = {
        head: b.Head,
        torso: b.Torso,
        backpack: b.Backpack || b.Torso,
        arm_l: (this.partState?.arm_l?.severed ? b.ShoulderPad_L : b.Arm_Lower_L) || b.ShoulderPad_L,
        arm_r: (this.partState?.arm_r?.severed ? b.ShoulderPad_R : b.Arm_Lower_R) || b.ShoulderPad_R,
        legs: b.Leg_Lower_L || b.Pelvis,
      };
      const node = boneMap[partId] || b.Torso || this.mechaRoot;
      node.getWorldPosition(outVec);
      return outVec;
    },

    createSeveredArmDebrisGroup(side = 'L') {
      const isLeft = side === 'L';
      const armBone = isLeft ? this.bones.Arm_Upper_L : this.bones.Arm_Upper_R;
      if (!armBone) return null;

      this.mechaRoot.updateMatrixWorld(true);
      const worldPos = new THREE.Vector3();
      const worldQuat = new THREE.Quaternion();
      const worldScale = new THREE.Vector3();
      armBone.matrixWorld.decompose(worldPos, worldQuat, worldScale);

      const clone = armBone.clone(true);
      clone.visible = true;
      clone.position.set(0, 0, 0);
      clone.quaternion.copy(worldQuat);
      clone.scale.copy(worldScale);
      clone.traverse((ch) => {
        if (
          ch.name === 'Wpn_HyperBeamSaber_Blade' ||
          ch.name === 'CustomPlasmaSaber' ||
          ch.isLight ||
          ch.name?.includes('Barrier') ||
          ch.name?.includes('Dome')
        ) {
          ch.visible = false;
          if (ch.isLight) ch.intensity = 0;
        }
      });

      const cutCap = new THREE.Mesh(
        new THREE.CylinderGeometry(0.10, 0.12, 0.05, 12),
        new THREE.MeshStandardMaterial({
          color: '#1b1d22',
          metalness: 0.7,
          roughness: 0.6,
          emissive: '#ff521c',
          emissiveIntensity: 1.5,
        }),
      );
      clone.add(cutCap);

      const wrapper = new THREE.Group();
      wrapper.position.copy(worldPos);
      wrapper.add(clone);
      return {
        group: wrapper,
        originPos: { x: worldPos.x, y: worldPos.y, z: worldPos.z },
      };
    },
  };

  return manager;
}
