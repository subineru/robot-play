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
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { ARENA_RADIUS, CAMERA_MODES } from '../shared/constants.js?v=20261116_t75e';
import { SHIELD_IDS, MAP_IDS, createCatalogRegistry, validateMechaBuild } from '../shared/catalog.js?v=20261116_t75e';
import { assignHandWeapon, mapMouseInputToHandActions } from '../shared/loadout.js?v=20261116_t75e';
import { createCustomPaintState, updateZonePaint } from '../shared/skins.js?v=20261116_t75e';
import { createSpatialGrid } from '../shared/spatial_grid.js?v=20261116_t75e';
import {
  SABER_CLASH_HITSTOP_SEC,
  createAntiSpamShieldState,
  markShieldBlockOrParry,
  stepShieldDefenseAntiSpam,
  createUnitCombatState,
  stepUnitCombatResources,
  applyUnitDamage,
  computeMapDragAndUpdraft,
  createMeleeTimingState,
  stepMeleeTimingState,
  resolveMeleeEncounter,
  createWeaponResourceState,
  stepWeaponResource,
  tryConsumeWeaponShot,
  triggerWeaponReload,
  isWeaponResourceUnavailable,
  createPartDamageState,
  applyPartDamage,
  computePartStatusPenalties,
} from '../shared/sim_core.js?v=20261116_t75e';
import {
  MATCH_PHASES,
  MATCH_EVENT_TYPES,
  DUEL_COUNTDOWN_SEC,
  createDuelMatchState,
  stepDuelCountdown,
  beginRoundCountdown,
  recordMatchEvent,
  resolveRoundEnd,
  computeMatchSummary,
} from '../shared/match_rules.js?v=20261116_t75e';
import {
  clamp,
  lerp,
  computeSkateTilt,
  computeModularMassAndThrust,
  computeLoadoutWeightTax,
  solveGroundFootAlignment,
  stepLandingSuspension,
  consumeJumpImpulse,
  stepAerialFlight,
  resolveWorldCollisions,
  createWeaponPickupState,
  triggerDropWeapons,
  startWeaponDropAnimation,
  stepWeaponDrop,
  computeWeaponDropArmPose,
  stepDroppedWeaponsPhysics,
  stepWeaponPickup,
  evaluateSubPartSegmentHit,
  stepSeveredLimbDebris,
  computeWalkCycle,
  detectWalkFootstep,
  classifyMouseSlashDirection,
  computeContinuousSaberPose,
  createSaberSwipeTracker,
  stepSaberSwipeTracker,
  resolveSaberInputDirection,
  resolveArmLoadoutPreset,
  evaluateShieldIncomingHit,
  evaluateShieldSegmentIntercept,
  evaluateMechaBodySegmentHit,
  resolveBucklerInterceptCenter,
  computeParryRecoilPose,
  sanitizeMouseLookDelta,
  stepDecoupledBodyYaw,
  computeUpperBodyAimPose,
  computeShieldAimWorldNormal,
  createBipedalFootState,
  stepBipedalFootTrackers,
  solveTwoBoneLegIK,
  computeBoostSkatePose,
} from '../shared/kinematics.js?v=20261116_t75e';
import { MechaAudioSynth, VfxSystem } from './vfx_system.js?v=20261116_t75e';
import {
  QUALITY_PRESETS,
  resolveEffectivePixelRatio,
  createSettingsStore,
} from '../shared/settings_store.js?v=20261116_t75e';
import {
  APP_SCREENS,
  PAUSE_VIEWS,
  createMenuState,
  selectCatalogPreview,
  cyclePreviewMap,
  resolveSortieReadiness,
  selectMainMenuTab,
  selectSettingsTab,
  openPauseView,
  startSortieTransition,
  finishSortieTransition,
  returnToMainMenuTransition,
  beginRebindTransition,
  clearRebindTransition,
  handleEscapeNavigation,
} from '../shared/menu_state.js?v=20261116_t75e';
import { closeAllTacticalSelects, isAnyTacticalSelectOpen } from './tactical_select.js?v=20261116_t75e';
import { createPopManager } from './pop_manager.js?v=20261116_t75e';
import { createMenuController } from './menu_controller.js?v=20261116_t75e';
import { createWorldCityManager } from './world_city.js?v=20261116_t75e';
import { createMechaRigManager } from './mecha_rig.js?v=20261116_t75e';
import { createCameraRigManager } from './camera_rig.js?v=20261116_t75e';
import { createRivalRigManager } from './rival_rig.js?v=20261116_t75e';

const DEG2RAD = Math.PI / 180;
const MODEL_URL = new URL('../../assets/mechas/ef018_valiant/valiant_mk2.glb', import.meta.url).href;
const SHIELDS_MODEL_URL = new URL('../../assets/equipment/mecha_shields_pack.glb', import.meta.url).href;

export class MechaSandboxApp {
  constructor(uiHooks) {
    this.ui = uiHooks;
    this.popManager = uiHooks?.popManager || null;
    this.settingsStore = uiHooks?.settingsStore || createSettingsStore();
    this.settings = this.settingsStore.get();
    this.menuState = createMenuState();
    this.rebindingAction = null;
    this.audio = new MechaAudioSynth();

    this.lightingMode = 'daylight';
    this.sceneLights = { hemi: null, sun: null, frontFill: null };
    this.supportHeight = 0;

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color('#80b2e6');
    this.scene.fog = new THREE.FogExp2('#c4d7eb', 0.0045);

    this.camera = new THREE.PerspectiveCamera(
      this.settings.controls.baseFov || 60,
      window.innerWidth / window.innerHeight,
      0.08,
      350,
    );
    this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.setPixelRatio(
      resolveEffectivePixelRatio(window.devicePixelRatio || 1, this.settings.graphics.qualityPreset),
    );
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
    this.yaw = 0;
    this.bodyYaw = 0;
    this.pitch = -0.14;
    this._aimPose = computeUpperBodyAimPose();
    this.footState = createBipedalFootState({
      bodyX: 0,
      bodyY: 0,
      bodyZ: 10,
      bodyYaw: 0,
      stanceHalfWidthM: 0.28,
      groundY: 0,
    });
    this._hipWorldL = { x: -0.18, y: 1.5, z: 10 };
    this._hipWorldR = { x: 0.18, y: 1.5, z: 10 };
    this._footWorldL = { x: -0.28, y: 0, z: 10 };
    this._footWorldR = { x: 0.28, y: 0, z: 10 };
    this._dustPos = new THREE.Vector3();

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
    this.catalog = createCatalogRegistry();
    this.activeShieldId = 'EF-SH03';
    this.shieldState = createAntiSpamShieldState();
    this._tmpVecA = new THREE.Vector3();
    this._tmpVecB = new THREE.Vector3();
    this._tmpQuatA = new THREE.Quaternion();
    this._tmpOrigin = new THREE.Vector3();
    this._tmpAimDir = new THREE.Vector3();
    this._tmpTargetPt = new THREE.Vector3();
    this._tmpShotDir = new THREE.Vector3();
    this._tmpSlashCtr = new THREE.Vector3();
    this._tmpRootPos = new THREE.Vector3();
    this._tmpTipPos = new THREE.Vector3();
    this._tmpPlumePos = new THREE.Vector3();
    this._tmpPlumeDir = new THREE.Vector3();
    this._tmpEuler = new THREE.Euler(0, 0, 0, 'YXZ');

    this.parryRecoil = { active: false, t: 0, duration: 0.42 };
    this.prevBoostActive = false;
    this.combatUnit = this._createConfiguredCombatUnit();
    this.playerHp = this.combatUnit.ap;
    this.playerMaxHp = this.combatUnit.maxAp;
    this.partDamage = createPartDamageState({
      maxAp: this.combatUnit.maxAp,
      ...this._getActiveArmorDefs(),
    });
    this._partSmokeTimer = 0;
    this.severedDebris = [];
    this.meleeTiming = createMeleeTimingState();
    this.pistolCooldown = 0;
    this.pistolRecoil = 0;
    this.pistolLeftCooldown = 0;
    this.pistolLeftRecoil = 0;
    this.backCooldowns = { left: 0, right: 0 };
    this.pendingMissileSalvos = [];
    this.pendingPlayerShots = [];
    this.overboostSurgeTimer = 0;
    this.loadoutTax = null;
    this.buildValidation = null;
    this.mouseSwipe = { x: 0, y: 0 };
    this.saberSwipeTracker = createSaberSwipeTracker();
    this._queuedSaberHand = null;
    this._activeSaberSwingBoost = 0;
    this.weaponResource = createWeaponResourceState(this.getActivePrimaryGunDef());
    this.saberSwingL = { active: false, t: 0, duration: 0.44, combo: 0, dir: 'LR', angleRad: 0.15, hitRegistered: false };
    this.saberSwingR = { active: false, t: 0, duration: 0.44, combo: 0, dir: 'RL', angleRad: 0.15, hitRegistered: false };
    this.hitstopTimer = 0;
    this.cameraShake = 0;
    this.score = { destroyed: 0, mcEarned: 0, dummyKills: 0 };
    this.jetIntensitySmooth = 0;

    // Skin state
    this.activeSkinId = 'SKIN-01';
    this.customPalette = null;

    // Input state
    this.keys = new Set();
    this.lmbHeld = false;
    this.rmbHeld = false;
    this.ignoreMouseDeltaUntil = 0;
    this.discardNextMoves = 0;
    this.requestDropFlag = false;
    this.requestPickupFlag = false;
    this.requestShootLFlag = false;
    this.requestShootRFlag = false;
    this.requestSlashLFlag = false;
    this.requestSlashRFlag = false;

    this.groundDropGroup = new THREE.Group();
    this.scene.add(this.groundDropGroup);
    this.droppedMeshes = [];
    this.severedDebrisGroup = new THREE.Group();
    this.scene.add(this.severedDebrisGroup);

    // Modular Client Managers + 16m SpatialHashGrid
    this.spatialGrid = createSpatialGrid(16);
    this.worldCity = createWorldCityManager({
      scene: this.scene,
      spatialGrid: this.spatialGrid,
      vfx: this.vfx,
      audio: this.audio,
    });
    this.mechaRig = createMechaRigManager({
      scene: this.scene,
      catalog: this.catalog,
      vfx: this.vfx,
      getActiveShieldDef: () => this.getActiveShieldDef(),
      getActiveShieldId: () => this.activeShieldId,
      getLoadoutPreset: () => this.loadoutPreset,
      getWeaponState: () => this.weaponState,
    });
    this.cameraRig = createCameraRigManager({
      camera: this.camera,
      settingsStore: this.settingsStore,
      getMechaRig: () => this.mechaRig,
      onCameraChanged: (mode) => this.ui.onCameraChanged?.(mode),
      showToast: (msg) => this.ui.showToast?.(msg),
    });
    this.rivalRig = createRivalRigManager({
      scene: this.scene,
      catalog: this.catalog,
      vfx: this.vfx,
      audio: this.audio,
    });
    this.duelMatch = null;
    this.duelDamageDealt = 0;
    this.roundBannerText = '';
    this.roundBannerTimer = 0;

    this._setupLighting();
    this.mechaRig.init();
    this.cameraRig.init(this.menuState);
    this._syncStageVisibility(true);
    this.syncPilotShowcase(this.menuState.previewPilotId);
    this._bindInputs();
    this.applySettings(this.settings);
    this._unsubscribeSettings = this.settingsStore.subscribe((next) => this.applySettings(next));
    this.setLightingMode(this.lightingMode, true);
    this._recomputeLoadoutPerformance();
    this._applyMenuState(this.menuState);
    this._initialGlbBootPending = true;
    this._loadValiantGlb();

    this.lastTime = performance.now();
    this._animate = this._animate.bind(this);
    requestAnimationFrame(this._animate);
  }

  // Compatibility accessors forwarding to decomposed client modules
  get destructibles() { return this.worldCity.destructibles; }
  get dummy() { return this.worldCity.dummy; }
  get arenaGroup() { return this.worldCity.arenaGroup; }
  get mechaRoot() { return this.mechaRig.mechaRoot; }
  get bones() { return this.mechaRig.bones; }
  get weaponNodes() { return this.mechaRig.weaponNodes; }
  get shieldNodes() { return this.mechaRig.shieldNodes; }
  get stowedNodes() { return this.mechaRig.stowedNodes; }
  get thrusterPlumes() { return this.mechaRig.thrusterPlumes; }
  get fpsHideNodes() { return this.mechaRig.fpsHideNodes; }
  get cockpitGroup() { return this.mechaRig.cockpitGroup; }
  get cockpitMaterials() { return this.mechaRig.cockpitMaterials; }
  get cockpitScreens() { return this.mechaRig.cockpitScreens; }
  get cockpitSticks() { return this.mechaRig.cockpitSticks; }
  get saberFx() { return this.mechaRig.saberFx; }
  get droppedTemplates() { return this.mechaRig.droppedTemplates; }
  get legMetrics() { return this.mechaRig.legMetrics; }
  get hangarStageGroup() { return this.mechaRig.hangarStageGroup; }
  get hangarPilotGroup() { return this.mechaRig.hangarPilotGroup; }
  get hangarTurntableRing() { return this.mechaRig.hangarTurntableRing; }

  get cameraMode() { return this.cameraRig.cameraMode; }
  set cameraMode(v) { this.cameraRig.cameraMode = v; }
  get orbitActive() { return this.cameraRig.orbitActive; }
  set orbitActive(v) { this.cameraRig.orbitActive = Boolean(v); }
  get orbitYaw() { return this.cameraRig.orbitYaw; }
  set orbitYaw(v) { this.cameraRig.orbitYaw = v; }
  get orbitPitch() { return this.cameraRig.orbitPitch; }
  set orbitPitch(v) { this.cameraRig.orbitPitch = v; }
  get orbitDistance() { return this.cameraRig.orbitDistance; }
  set orbitDistance(v) { this.cameraRig.orbitDistance = v; }
  get menuOrbitYawOffset() { return this.cameraRig.menuOrbitYawOffset; }
  set menuOrbitYawOffset(v) { this.cameraRig.menuOrbitYawOffset = v; }
  get menuOrbitPitch() { return this.cameraRig.menuOrbitPitch; }
  set menuOrbitPitch(v) { this.cameraRig.menuOrbitPitch = v; }
  get menuOrbitDistance() { return this.cameraRig.menuOrbitDistance; }
  set menuOrbitDistance(v) { this.cameraRig.menuOrbitDistance = v; }
  get _menuDragging() { return this.cameraRig.menuDragging; }
  set _menuDragging(v) { this.cameraRig.menuDragging = Boolean(v); }
  get _menuFollowTabPose() { return this.cameraRig.menuFollowTabPose; }
  set _menuFollowTabPose(v) { this.cameraRig.menuFollowTabPose = Boolean(v); }
  get _armoryPinHovered() { return this.cameraRig.armoryPinHovered; }
  set _armoryPinHovered(v) { this.cameraRig.armoryPinHovered = Boolean(v); }

  _getActiveArmorDefs() {
    const armorCoreDef = this.catalog.getArmorCore?.(this.menuState?.previewArmorCoreId) || null;
    const armorLiningDef = this.catalog.getArmorLining?.(this.menuState?.previewArmorLiningId) || null;
    const actorDef = this.catalog.getActor?.(this.menuState?.previewActorId || 'EF-018') || null;
    return { actorDef, armorCoreDef, armorLiningDef };
  }

  _recomputeLoadoutPerformance() {
    if (!this.catalog || !this.menuState) return null;
    const { actorDef, armorCoreDef, armorLiningDef } = this._getActiveArmorDefs();
    const pilotDef = this.catalog.getPilot?.(this.menuState.previewPilotId || 'PILOT-01') || null;
    const shieldDef =
      this.loadoutPreset?.lHand === 'shield' || this.loadoutPreset?.rHand === 'shield'
        ? this.getActiveShieldDef()
        : null;
    const lBackDef = this.catalog.getWeapon?.(this.menuState.previewLBackId) || null;
    const rBackDef = this.catalog.getWeapon?.(this.menuState.previewRBackId) || null;
    const handWeaponDefs = [];
    if (this.loadoutPreset?.lHand === 'pistol') handWeaponDefs.push(this.catalog.getWeapon?.('EF-AR01'));
    else if (this.loadoutPreset?.lHand === 'saber') handWeaponDefs.push(this.catalog.getWeapon?.('EF-BS02'));
    if (this.loadoutPreset?.rHand === 'pistol') handWeaponDefs.push(this.catalog.getWeapon?.('EF-AR01'));
    else if (this.loadoutPreset?.rHand === 'saber') handWeaponDefs.push(this.catalog.getWeapon?.('EF-BS02'));

    const allWeaponDefs = [...handWeaponDefs, lBackDef, rBackDef].filter(Boolean);
    const tax = computeLoadoutWeightTax({
      actorDef,
      weaponDefs: allWeaponDefs,
      shieldDef,
      armorCoreDef,
      armorLiningDef,
      pilotDef,
    });
    const validation = validateMechaBuild({
      actorDef,
      lHandType: this.loadoutPreset?.lHand,
      rHandType: this.loadoutPreset?.rHand,
      shieldDef: this.getActiveShieldDef(),
      lBackWeaponDef: lBackDef,
      rBackWeaponDef: rBackDef,
      armorCoreDef,
      armorLiningDef,
    });

    this.loadoutTax = tax;
    this.buildValidation = validation;
    this.massThrust = {
      totalMassKg: tax.totalMassKg,
      maxThrustN: tax.maxThrustN,
      twr: tax.twr,
      weightPenaltyFactor: tax.speedScale,
    };

    this.mechaRig?.syncBackEquipmentVisibility?.(this.menuState.previewLBackId, this.menuState.previewRBackId);
    this.mechaRig?.syncHangarNameplate?.({ actorDef, pilotDef, loadoutTax: tax });
    this.mechaRig?.syncHangarEquipmentRacks?.({
      preset: this.loadoutPreset,
      weaponState: this.weaponState,
      shieldId: this.activeShieldId,
      lBackId: this.menuState.previewLBackId,
      rBackId: this.menuState.previewRBackId,
    });

    if (this.menuState.screen === APP_SCREENS.MAIN_MENU) {
      this.combatUnit = this._createConfiguredCombatUnit();
      this.playerHp = this.combatUnit.ap;
      this.playerMaxHp = this.combatUnit.maxAp;
    }
    return tax;
  }

  _createConfiguredCombatUnit() {
    return createUnitCombatState(this._getActiveArmorDefs());
  }

  _getActiveMapModifiers() {
    const mapDef = this.catalog.getMap?.(this.menuState?.previewMapId || 'MAP-01');
    return mapDef?.envModifiers || { frictionScale: 1.0, enRegenScale: 1.0, spRegenScale: 1.0, lockRangeScale: 1.0, voidDropPenaltyAp: 0, hazardId: 'NONE' };
  }

  _ensureBattleArenaBuilt() {
    this.worldCity.ensureBuilt();
  }

  _syncStageVisibility(inMainMenu) {
    this.mechaRig.syncStageVisibility(inMainMenu, this.menuState);
    this.worldCity.setVisible(!inMainMenu);
    if (this.rivalRig) this.rivalRig.setVisible(!inMainMenu && this.menuState.previewModeId === 'duel_1v1');
    if (this.groundDropGroup) this.groundDropGroup.visible = !inMainMenu;
    if (this.severedDebrisGroup) this.severedDebrisGroup.visible = !inMainMenu;
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

  applySettings(nextSettings) {
    if (!nextSettings) return;
    this.settings = nextSettings;
    if (typeof this.audio.setChannelVolumes === 'function') {
      this.audio.setChannelVolumes(this.settings.audio);
    } else {
      this.audio.setVolume?.(this.settings.audio?.master ?? 0.5);
    }
    this._syncBgmState();

    const preset = QUALITY_PRESETS[this.settings.graphics.qualityPreset] || QUALITY_PRESETS.standard;
    const effectiveDpr = resolveEffectivePixelRatio(window.devicePixelRatio || 1, preset.id);
    this.renderer.setPixelRatio(effectiveDpr);
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    if (typeof this.composer.setPixelRatio === 'function') {
      this.composer.setPixelRatio(effectiveDpr);
    }
    this.composer.setSize(window.innerWidth, window.innerHeight);
    this.bloomPass.setSize(window.innerWidth, window.innerHeight);
    this.bloomPass.enabled = Boolean(preset.bloom);
    this.bloomPass.strength = preset.bloom ? (this.lightingMode === 'daylight' ? 0.28 : 0.36) : 0;

    this.renderer.shadowMap.enabled = Boolean(preset.shadows);
    this.renderer.shadowMap.needsUpdate = true;
    if (this.sceneLights?.sun) {
      this.sceneLights.sun.castShadow = Boolean(preset.shadows);
    }
    this.vfx.setParticleScale?.(preset.particleBudgetScale);
    this.ui.onSettingsApplied?.(this.settings, { preset, effectiveDpr });
  }

  setLightingMode(mode = 'daylight', silent = false) {
    this.lightingMode = mode === 'night' ? 'night' : 'daylight';
    const isDay = this.lightingMode === 'daylight';
    const inMenu = this.menuState?.screen === APP_SCREENS.MAIN_MENU;
    const preset = QUALITY_PRESETS[this.settings?.graphics?.qualityPreset] || QUALITY_PRESETS.standard;
    if (inMenu) {
      this.scene.background.set(isDay ? '#172234' : '#060a10');
      this.scene.fog.color.set(isDay ? '#172234' : '#060a10');
      this.scene.fog.density = 0.018;
      this.renderer.toneMappingExposure = isDay ? 1.12 : 1.04;
      this.scene.environmentIntensity = isDay ? 0.85 : 0.62;
    } else {
      this.scene.background.set(isDay ? '#80b2e6' : '#090e16');
      this.scene.fog.color.set(isDay ? '#c4d7eb' : '#090e16');
      this.scene.fog.density = isDay ? 0.0045 : 0.0082;
      this.renderer.toneMappingExposure = isDay ? 1.06 : 1.15;
      this.scene.environmentIntensity = isDay ? 0.72 : 0.65;
    }
    this.bloomPass.enabled = Boolean(preset.bloom);
    this.bloomPass.strength = preset.bloom ? (isDay ? 0.28 : 0.36) : 0;

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
    this.worldCity.setLightingVisuals(isDay, inMenu);
    if (!silent) {
      this.ui.showToast?.(isDay ? '切換至：晴空／標準整備照明' : '切換至：夜間霓虹照明');
    }
  }

  _updateCockpitScreens(dt, nowMs) {
    this.mechaRig.updateCockpitScreens(dt, nowMs, {
      cameraMode: this.cameraMode,
      yaw: this.yaw,
      physics: this.physics,
      destructibles: this.destructibles,
      dummy: this.dummy,
      score: this.score,
      jetIntensitySmooth: this.jetIntensitySmooth,
      saberSwingL: this.saberSwingL,
      saberSwingR: this.saberSwingR,
    });
  }

  getActiveShieldDef() {
    return this.catalog.getShield(this.activeShieldId) || this.catalog.getShield('EF-SH03');
  }

  getActivePrimaryGunDef() {
    const gunId = this.menuState?.previewRHandWeaponId || 'EF-AR01';
    return this.catalog.getWeapon(gunId) || this.catalog.getWeapon('EF-AR01');
  }

  setShieldType(shieldId) {
    if (!SHIELD_IDS.includes(shieldId)) return;
    this.activeShieldId = shieldId;
    const def = this.getActiveShieldDef();
    this.mechaRig.syncShieldVariantVisibility();
    this._recomputeLoadoutPerformance();
    this.audio.playServoLift('L');
    this.ui.onShieldChanged?.(def);
    this.ui.showToast?.(`換裝護盾: ${def.id} ${def.shortLabel} (${def.maxDurationSec}s)`);
  }

  cycleShieldType() {
    const idx = SHIELD_IDS.indexOf(this.activeShieldId);
    const nextId = SHIELD_IDS[(idx + 1) % SHIELD_IDS.length];
    this.setShieldType(nextId);
  }

  _syncWeaponLoadoutVisibility() {
    this.mechaRig.syncWeaponLoadoutVisibility();
    this._recomputeLoadoutPerformance();
  }

  setLoadoutMode(mode) {
    this.loadoutPreset = resolveArmLoadoutPreset(mode);
    this.lmbHeld = false;
    this.rmbHeld = false;
    this.saberSwingL.active = false;
    this.saberSwingR.active = false;
    this._syncWeaponLoadoutVisibility();
    this.audio.playServoLift('R');
    if (this.loadoutPreset.lHand === 'shield' || this.loadoutPreset.rHand === 'shield') {
      this.audio.playShieldToggle(true);
    }
    this.ui.onLoadoutChanged?.(this.loadoutPreset);
    this.ui.showToast?.(`雙手配裝 [${this.loadoutPreset.mode}/6]：${this.loadoutPreset.label}`);
  }

  setHandWeapon(handKey, weaponType) {
    this.loadoutPreset = assignHandWeapon(this.loadoutPreset, handKey, weaponType);
    this.lmbHeld = false;
    this.rmbHeld = false;
    this.saberSwingL.active = false;
    this.saberSwingR.active = false;
    this._syncWeaponLoadoutVisibility();
    this.audio.playServoLift(handKey === 'lHand' ? 'L' : 'R');
    if (weaponType === 'shield') {
      this.audio.playShieldToggle(true);
    }
    this.ui.onLoadoutChanged?.(this.loadoutPreset);
    const handTxt = handKey === 'lHand' ? '左手 L-HAND' : '右手 R-HAND';
    this.ui.showToast?.(`${handTxt} 已換裝：${weaponType.toUpperCase()}`);
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
    this.ui.showCombatCallout?.('PARRY PREVIEW', 'parry', 1.1);
    this.ui.showToast?.('觸發盾反彈開動作 (Parry Recoil Preview)');
  }

  _resolveVariantLoadSpec(variantId = this.menuState?.previewMechaVariantId || 'mk2') {
    const v = this.catalog.getActorVariant?.('EF-018', variantId);
    if (!v) {
      return { id: 'mk2', url: MODEL_URL, hasBakedMasks: true, label: 'EF-018 VALIANT II' };
    }
    return {
      id: v.id,
      url: new URL(`../../${v.glbPath}`, import.meta.url).href,
      hasBakedMasks: v.hasBakedMasks !== false,
      label: v.name || v.label || 'EF-018 VALIANT',
    };
  }

  async reloadMechaVariant(variantId = 'mk2') {
    const spec = this._resolveVariantLoadSpec(variantId);
    const loadSeq = (this._variantLoadSeq = (this._variantLoadSeq || 0) + 1);
    await this.mechaRig.loadValiantGlb(
      spec.url,
      SHIELDS_MODEL_URL,
      (ok, err) => {
        if (loadSeq !== this._variantLoadSeq) return;
        if (ok) {
          this.activeMechaVariantId = spec.id;
          this.mechaRig.syncBackEquipmentVisibility?.(
            this.menuState?.previewLBackId || null,
            this.menuState?.previewRBackId || null,
          );
          this._recomputeLoadoutPerformance();
          this.setSkin(this.activeSkinId, this.customPalette);
          this.mechaRig.syncWeaponLoadoutVisibility?.();
          this.mechaRig.syncShieldVariantVisibility?.();
          this.mechaRig.syncHangarEquipmentRacks?.({
            preset: this.armLoadoutPreset,
            weaponState: this.weaponState,
            shieldId: this.activeShieldId,
            lBackId: this.menuState?.previewLBackId || null,
            rBackId: this.menuState?.previewRBackId || null,
          });
          this.ui.onShieldChanged?.(this.getActiveShieldDef());
          if (!this._initialGlbBootPending) {
            this.ui.onModelReady?.(true);
          }
        } else {
          this.ui.onModelReady?.(false, err);
        }
      },
      { hasBakedMasks: spec.hasBakedMasks },
    );
  }

  async _loadValiantGlb() {
    const spec = this._resolveVariantLoadSpec(this.menuState?.previewMechaVariantId || 'mk2');
    await Promise.all([
      this.reloadMechaVariant(spec.id),
      this.rivalRig?.loadValiantGlb(MODEL_URL, SHIELDS_MODEL_URL, undefined, { hasBakedMasks: true }),
    ]);
    this._initialGlbBootPending = false;
    // Demo mode: bypass main menu and jump straight into 1v1 Ace AI Duel BO3 countdown
    this.startSortie();
    this.ui.onModelReady?.(true);
  }

  _poseBone(boneName, rxDeg = 0, ryDeg = 0, rzDeg = 0) {
    this.mechaRig.poseBone(boneName, rxDeg, ryDeg, rzDeg);
  }

  setSkin(skinId, customPalette = this.customPalette) {
    this.activeSkinId = skinId;
    this.customPalette = customPalette;
    const eff = this.mechaRig.applySkin(skinId, customPalette, this.droppedMeshes);
    this.ui.onSkinChanged?.(eff);
  }

  _applyCameraMode(mode, notify = true) {
    this.cameraRig.applyCameraMode(mode, notify);
  }

  toggleCameraMode() {
    this.cameraRig.toggleCameraMode();
  }

  toggleOrbitInspect() {
    this.cameraRig.toggleOrbitInspect(this.yaw);
  }

  _applyMenuState(nextMenuState) {
    this.menuState = nextMenuState;
    this.rebindingAction = this.menuState.rebindingAction;
    this.paused = this.menuState.screen === APP_SCREENS.PAUSED;
    this._syncStageVisibility(this.menuState.screen === APP_SCREENS.MAIN_MENU);
    this._recomputeLoadoutPerformance();
    if (this.menuState.screen !== APP_SCREENS.IN_GAME) {
      this.keys.clear();
      this.lmbHeld = false;
      this.rmbHeld = false;
      this.mouseSwipe.x = 0;
      this.mouseSwipe.y = 0;
      this.saberSwipeTracker = createSaberSwipeTracker();
      this._queuedSaberHand = null;
      this._menuDragging = false;
      if (document.pointerLockElement === this.renderer.domElement) {
        document.exitPointerLock?.();
      }
    }
    this.ui.onMenuStateChanged?.(this.menuState);
    this.ui.onPauseChanged?.(this.paused);
    this._syncBgmState();
  }

  _syncBgmState() {
    this.audio?.syncBgmState?.({
      screen: this.menuState?.screen || APP_SCREENS.MAIN_MENU,
      modeId: this.menuState?.previewModeId || 'sandbox',
      mapId: this.menuState?.previewMapId || 'neo_tokyo',
      menuTrack: this.settings?.music?.menuTrack || 'hangar_protocol',
      combatTrack: this.settings?.music?.combatTrack || 'auto',
      paused: this.paused || this.menuState?.screen === APP_SCREENS.PAUSED,
    });
  }

  _syncMenuDesiredRig(state) {
    this.cameraRig.syncMenuDesiredRig(state);
  }

  syncPilotShowcase(pilotId) {
    this.mechaRig.syncPilotShowcase(pilotId);
  }

  triggerMenuCameraLead(tabId) {
    const next = selectMainMenuTab(this.menuState, tabId);
    this._syncMenuDesiredRig(next);
  }

  setMainMenuTab(tabId) {
    closeAllTacticalSelects();
    this._armoryPinHovered = false;
    const next = selectMainMenuTab(this.menuState, tabId);
    this._syncMenuDesiredRig(next);
    this._applyMenuState(next);
  }

  setSortieStep(stepId) {
    closeAllTacticalSelects();
    const next = selectCatalogPreview(this.menuState, 'sortie_step', stepId);
    this._syncMenuDesiredRig(next);
    this._applyMenuState(next);
  }

  selectCatalogPreview(kind, id) {
    const prevVariant = this.menuState?.previewMechaVariantId || 'mk2';
    const next = selectCatalogPreview(this.menuState, kind, id);
    if (kind === 'paint_zone' || kind === 'armory_slot' || kind === 'sortie_step') {
      this._syncMenuDesiredRig(next);
    }
    if (kind === 'pilot') {
      this.syncPilotShowcase(id);
    }
    if (kind === 'r_hand_weapon') {
      const gunDef = this.catalog.getWeapon(next.previewRHandWeaponId) || this.catalog.getWeapon('EF-AR01');
      this.weaponResource = createWeaponResourceState(gunDef);
    }
    if (kind === 'mecha_variant' && next.previewMechaVariantId !== prevVariant) {
      this.reloadMechaVariant(next.previewMechaVariantId);
    }
    this._applyMenuState(next);
  }

  cycleMap(delta = 1) {
    const next = cyclePreviewMap(this.menuState, MAP_IDS, delta);
    this._applyMenuState(next);
  }

  setArmorySlot(slotId) {
    this.selectCatalogPreview('armory_slot', slotId);
  }

  setArmoryPinHover(hovered) {
    this._armoryPinHovered = Boolean(hovered);
  }

  setPaintZone(zoneId) {
    this.selectCatalogPreview('paint_zone', zoneId);
  }

  setZonePaint(zoneId, patch) {
    const cur = createCustomPaintState(this.customPalette);
    const next = updateZonePaint(cur, zoneId, patch);
    this.setSkin(this.activeSkinId, next);
  }

  setPaintMirrorArms(mirrorVal) {
    const cur = createCustomPaintState(this.customPalette);
    this.setSkin(this.activeSkinId, { ...cur, mirrorArms: Boolean(mirrorVal) });
  }

  togglePanelCollapse() {
    this._armoryPinHovered = false;
    this.selectCatalogPreview('panel_collapsed', !this.menuState.panelCollapsed);
  }

  setSettingsTab(tabId) {
    closeAllTacticalSelects();
    this._applyMenuState(selectSettingsTab(this.menuState, tabId));
  }

  setPauseView(viewId) {
    closeAllTacticalSelects();
    this._applyMenuState(openPauseView(this.menuState, viewId));
  }

  resumeFromPause() {
    closeAllTacticalSelects();
    this._applyMenuState(startSortieTransition(this.menuState));
  }

  startSortie() {
    closeAllTacticalSelects();
    const readiness = resolveSortieReadiness(this.menuState, this.catalog.getSnapshot());
    if (!readiness.canLaunch) {
      const first = readiness.blockers[0];
      this.ui.showToast?.(
        `「${first?.label || '所選項目'}」尚在施工中（排程 ${first?.plannedTask || '待定'}）— 請切回「單機靶場 / 新東京 / EF-018 / RAVEN-01」出擊`,
      );
      return false;
    }
    if (this.buildValidation && !this.buildValidation.valid) {
      const firstErr = this.buildValidation.errors[0];
      this.ui.showToast?.(`機體配裝異常：${firstErr?.message || '請檢查格納庫裝備相容性'}`);
      return false;
    }
    if (this.menuState.sortieFlow === 'lobby') {
      this.ui.showToast?.('多人連線大廳配對將於 Task 11 (AWS ECS) 啟用 — 請切回「單人作戰」立即出擊');
      return false;
    }
    this._ensureBattleArenaBuilt();
    this.audio?.playUiFeedback?.('sortie');
    const isDuel = this.menuState.previewModeId === 'duel_1v1';
    this.worldCity.setDuelMode(isDuel);
    this._resetActorsForRound(isDuel);
    if (isDuel) {
      this.duelMatch = createDuelMatchState({ modeId: 'duel_1v1', maxWins: 2, rivalName: 'EF-T01 ACE' });
      this.duelDamageDealt = 0;
      const cdStep = Math.ceil(this.duelMatch.countdownSec || DUEL_COUNTDOWN_SEC);
      this._lastCountdownStep = cdStep;
      this.roundBannerText = cdStep > 0 ? `ROUND 1 — GET READY // ${cdStep}` : 'ROUND 1 — FIGHT!!';
      this.roundBannerTimer = cdStep > 0 ? (this.duelMatch.countdownSec || DUEL_COUNTDOWN_SEC) + 0.5 : 2.0;
      if (cdStep > 0) this.audio.playCountdownTick?.(cdStep);
    } else {
      this.duelMatch = null;
      this._lastCountdownStep = 0;
      this.roundBannerText = '';
      this.roundBannerTimer = 0;
    }
    const defCam =
      this.settings?.controls?.defaultCameraMode === 'fps_cockpit'
        ? CAMERA_MODES.FPS_COCKPIT
        : CAMERA_MODES.TPS;
    this.orbitActive = false;
    this._applyCameraMode(defCam, false);
    this.worldCity.dummyFireTimer = 2.6;
    this.worldCity.dummyBurstRemaining = 2;
    this._applyMenuState(startSortieTransition(this.menuState));
    this.setLightingMode(this.lightingMode, true);
    try {
      Promise.resolve(this.renderer.domElement.requestPointerLock?.()).catch(() => {});
    } catch {
      // ignore sandboxed pointer lock refusal
    }
    this.ui.showToast?.(
      '1v1 王牌 AI 決鬥開戰 (BO3) — 點擊畫面鎖定準心｜ESC 暫停與武裝設定｜H 操作手冊',
    );
    return true;
  }

  isMatchActionLocked() {
    return Boolean(this.duelMatch && this.duelMatch.phase === MATCH_PHASES.COUNTDOWN);
  }

  _resetActorsForRound(isDuel) {
    const startZ = isDuel ? 17 : 10;
    this.physics = {
      x: 0,
      y: 0,
      z: startZ,
      vx: 0,
      vy: 0,
      vz: 0,
      en: 100,
      maxEn: 100,
      enRegenDelaySec: 0,
      grounded: true,
    };
    this.weaponState = createWeaponPickupState();
    this.shieldState = createAntiSpamShieldState();
    this.weaponResource = createWeaponResourceState(this.getActivePrimaryGunDef());
    this.saberSwipeTracker = createSaberSwipeTracker();
    this._queuedSaberHand = null;
    this._activeSaberSwingBoost = 0;
    this.backCooldowns = { left: 0, right: 0 };
    this.pendingMissileSalvos = [];
    this.pendingPlayerShots = [];
    this.overboostSurgeTimer = 0;
    this._recomputeLoadoutPerformance();
    this.combatUnit = this._createConfiguredCombatUnit();
    this.playerHp = this.combatUnit.ap;
    this.playerMaxHp = this.combatUnit.maxAp;
    this.partDamage = createPartDamageState({
      maxAp: this.combatUnit.maxAp,
      ...this._getActiveArmorDefs(),
    });
    this._partSmokeTimer = 0;
    this.severedDebris = [];
    while (this.severedDebrisGroup.children.length > 0) {
      this.severedDebrisGroup.remove(this.severedDebrisGroup.children[0]);
    }
    this.mechaRig.applyPartDamageVisuals(this.partDamage);
    this.meleeTiming = createMeleeTimingState();
    this.bodyYaw = 0;
    this.yaw = 0;
    this.pitch = 0;
    this._aimPose = computeUpperBodyAimPose();
    this.parryRecoil = { active: false, t: 0, duration: 0.42 };
    this.footState = createBipedalFootState({
      bodyX: 0,
      bodyY: 0,
      bodyZ: startZ,
      bodyYaw: 0,
      stanceHalfWidthM: 0.28,
      groundY: 0,
    });
    this._syncDroppedGroundMeshes();
    this._syncWeaponLoadoutVisibility();
    this.rivalRig.resetForRound({ active: Boolean(isDuel), x: 0, z: -17 });
  }

  rematchDuel() {
    this.worldCity.resetWorld();
    return this.startSortie();
  }

  returnToMainMenu(_tabId = 'home') {
    return this.rematchDuel();
  }

  togglePause(forceVal = null) {
    if (this.menuState.screen === APP_SCREENS.MAIN_MENU) return;
    closeAllTacticalSelects();
    if (forceVal === true || (forceVal === null && this.menuState.screen === APP_SCREENS.IN_GAME)) {
      this._applyMenuState(openPauseView(this.menuState, 'hub'));
    } else if (forceVal === false || (forceVal === null && this.menuState.screen === APP_SCREENS.PAUSED)) {
      this._applyMenuState(startSortieTransition(this.menuState));
    }
  }

  handleEscapePressed() {
    const hasOpenModal = Boolean(this.popManager?.isModalOpen?.());
    const hasOpenSelect = isAnyTacticalSelectOpen();
    const prevAct = this.menuState.rebindingAction;
    const nav = handleEscapeNavigation(this.menuState, { hasOpenModal, hasOpenSelect });
    if (nav.action === 'CANCEL_REBIND') {
      this.audio?.playUiFeedback?.('cancel');
      this._applyMenuState(nav.state);
      this.ui.onRebindStatus?.({ action: prevAct, canceled: true, settings: this.settings });
      return;
    }
    if (nav.action === 'CLOSE_MODAL') {
      this.audio?.playUiFeedback?.('cancel');
      this.popManager?.closeModal?.();
      return;
    }
    if (nav.action === 'CLOSE_SELECT') {
      this.audio?.playUiFeedback?.('cancel');
      closeAllTacticalSelects();
      return;
    }
    if (nav.action !== 'NOOP') {
      this.audio?.playUiFeedback?.('cancel');
      if (nav.state.screen === APP_SCREENS.MAIN_MENU) {
        this._syncMenuDesiredRig(nav.state);
      }
      this._applyMenuState(nav.state);
    }
  }

  beginKeyRebind(actionId) {
    this._applyMenuState(beginRebindTransition(this.menuState, actionId));
    this.ui.onRebindStatus?.({ action: actionId, waiting: true, settings: this.settings });
  }

  clearPendingRebind() {
    this._applyMenuState(clearRebindTransition(this.menuState));
  }

  resetSandbox() {
    if (this.menuState.previewModeId === 'duel_1v1') {
      return this.rematchDuel();
    }
    this._ensureBattleArenaBuilt();
    this.worldCity.setDuelMode(false);
    this.duelMatch = null;
    this.roundBannerText = '';
    this.roundBannerTimer = 0;
    this.vfx.clearProjectiles();
    this._resetActorsForRound(false);
    this.worldCity.resetWorld();
    this.score = { destroyed: 0, mcEarned: 0, dummyKills: 0 };
    this._applyMenuState(startSortieTransition(this.menuState));
  }

  _bindInputs() {
    const unlockOnce = () => {
      this.audio?.unlockAudio?.();
      window.removeEventListener('pointerdown', unlockOnce);
      window.removeEventListener('keydown', unlockOnce);
    };
    window.addEventListener('pointerdown', unlockOnce, { passive: true });
    window.addEventListener('keydown', unlockOnce, { passive: true });

    window.addEventListener('resize', () => {
      const effectiveDpr = resolveEffectivePixelRatio(
        window.devicePixelRatio || 1,
        this.settings?.graphics?.qualityPreset || 'standard',
      );
      this.camera.aspect = window.innerWidth / window.innerHeight;
      this.camera.updateProjectionMatrix();
      this.renderer.setPixelRatio(effectiveDpr);
      this.renderer.setSize(window.innerWidth, window.innerHeight);
      this.composer.setSize(window.innerWidth, window.innerHeight);
      this.bloomPass.setSize(window.innerWidth, window.innerHeight);
    });

    window.addEventListener('keydown', (e) => {
      const code = e.code;
      if (this.menuState.rebindingAction) {
        e.preventDefault();
        const targetAct = this.menuState.rebindingAction;
        if (code === 'Escape') {
          this.handleEscapePressed();
          return;
        }
        const res = this.settingsStore.rebind(targetAct, code);
        if (res.changed) {
          this._applyMenuState(clearRebindTransition(this.menuState));
          this.ui.onRebindStatus?.({ action: targetAct, completed: true, res, settings: res.settings });
        } else {
          this.ui.onRebindStatus?.({ action: targetAct, rejected: true, res, settings: this.settings });
        }
        return;
      }
      if (code === 'Escape') {
        e.preventDefault();
        this.handleEscapePressed();
        return;
      }
      if (this.popManager?.isModalOpen?.()) {
        return;
      }
      const activeTag = document.activeElement?.tagName;
      const isInputActive = activeTag === 'INPUT' || activeTag === 'TEXTAREA' || activeTag === 'SELECT';
      if (isInputActive) {
        return;
      }
      if (code === 'KeyH') {
        if (this.menuState.screen === APP_SCREENS.IN_GAME) {
          e.preventDefault();
          this.setPauseView(PAUSE_VIEWS.HUB);
          this.ui.openCombatManual?.();
          return;
        }
        const canOpenManual = (
          this.menuState.screen === APP_SCREENS.MAIN_MENU ||
          (this.menuState.screen === APP_SCREENS.PAUSED && this.menuState.pauseView === PAUSE_VIEWS.HUB)
        );
        if (canOpenManual) {
          e.preventDefault();
          this.ui.openCombatManual?.();
          return;
        }
      }
      if (this.menuState.screen === APP_SCREENS.MAIN_MENU) {
        if (code === 'KeyF' && !e.repeat && !this.popManager?.isModalOpen?.() && !isAnyTacticalSelectOpen()) {
          e.preventDefault();
          this.audio?.playUiFeedback?.('tick');
          this.togglePanelCollapse();
          return;
        }
        if (
          (code === 'Enter' || code === 'NumpadEnter') &&
          !e.repeat &&
          activeTag !== 'BUTTON' &&
          activeTag !== 'A' &&
          !this.popManager?.isModalOpen?.() &&
          !isAnyTacticalSelectOpen() &&
          (this.menuState.mainTab === 'home' || (this.menuState.mainTab === 'sortie' && this.menuState.sortieStep === 'briefing'))
        ) {
          e.preventDefault();
          if (this.menuState.mainTab === 'home' && this.menuState.sortieFlow === 'lobby') {
            this.selectCatalogPreview('sortie_flow', 'solo');
          }
          this.startSortie();
          return;
        }
        if (
          this.menuState.mainTab === 'sortie' &&
          this.menuState.sortieStep !== 'mode' &&
          (code === 'ArrowLeft' || code === 'ArrowRight')
        ) {
          if (!isAnyTacticalSelectOpen()) {
            e.preventDefault();
            this.cycleMap(code === 'ArrowLeft' ? -1 : 1);
          }
        }
        return;
      }
      if (this.menuState.screen !== APP_SCREENS.IN_GAME) return;

      const kb = this.settings.keybindings;
      this.keys.add(code);
      if (code === 'Digit1' && !e.repeat) this.setLoadoutMode(1);
      if (code === 'Digit2' && !e.repeat) this.setLoadoutMode(2);
      if (code === 'Digit3' && !e.repeat) this.setLoadoutMode(3);
      if (code === 'Digit4' && !e.repeat) this.setLoadoutMode(4);
      if (code === 'Digit5' && !e.repeat) this.setLoadoutMode(5);
      if (code === 'Digit6' && !e.repeat) this.setLoadoutMode(6);
      if (code === kb.cycleShield && !e.repeat) this.cycleShieldType();
      if (code === kb.cameraMode && !e.repeat) this.toggleCameraMode();
      if (code === kb.orbitInspect && !e.repeat) this.toggleOrbitInspect();
      if (code === 'KeyN' && !e.repeat) this.setLightingMode(this.lightingMode === 'daylight' ? 'night' : 'daylight');
      if (this.isMatchActionLocked()) return;
      if (code === kb.fireBackLeft && !e.repeat) this._triggerBackAction('left');
      if (code === kb.fireBackRight && !e.repeat) this._triggerBackAction('right');
      if (code === 'KeyT' && !e.repeat) this.triggerRecoilPreview();
      if (code === kb.guard && !e.repeat && this.loadoutPreset.lHand !== 'shield' && this.loadoutPreset.rHand !== 'shield') {
        this.setLoadoutMode(2);
      }
      if (code === kb.dropWeapon && !e.repeat) this.requestDropFlag = true;
      if (code === kb.pickupWeapon && !e.repeat) {
        const hasNearbyDrop = this.weaponState?.droppedItems?.some(
          (item) => Math.hypot(item.x - this.physics.x, item.z - this.physics.z) <= 3.6
        );
        if (hasNearbyDrop) {
          this.requestPickupFlag = true;
        } else if (this.weaponResource?.resourceType === 'mag') {
          const gunDef = this.getActivePrimaryGunDef();
          if (!this.weaponResource.reloading && this.weaponResource.ammo < this.weaponResource.maxAmmo) {
            this.weaponResource = triggerWeaponReload(this.weaponResource, gunDef);
            this.audio?.playWeaponReload?.();
            this.ui?.showToast?.('戰術換彈中...', 1100);
          }
        } else {
          this.requestPickupFlag = true;
        }
      }
      if (code === kb.jump && this.physics.grounded && !e.repeat) {
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
    let lastHoverX = null;
    let lastHoverY = null;
    this.lmbHeld = false;

    const resetTransientInputs = (suppressMs = 240) => {
      this.keys.clear();
      dragging = false;
      lastHoverX = null;
      lastHoverY = null;
      this.lmbHeld = false;
      this.rmbHeld = false;
      this.mouseSwipe.x = 0;
      this.mouseSwipe.y = 0;
      this.saberSwipeTracker = createSaberSwipeTracker();
      this._queuedSaberHand = null;
      this.discardNextMoves = 3;
      this.ignoreMouseDeltaUntil = performance.now() + suppressMs;
    };

    window.addEventListener('blur', () => resetTransientInputs(260));
    window.addEventListener('focus', () => {
      this.discardNextMoves = 3;
      this.ignoreMouseDeltaUntil = performance.now() + 260;
      lastHoverX = null;
      lastHoverY = null;
      this.mouseSwipe.x = 0;
      this.mouseSwipe.y = 0;
      this.saberSwipeTracker = createSaberSwipeTracker();
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
      lastHoverX = null;
      lastHoverY = null;
      if (document.pointerLockElement !== canvas) {
        this.mouseSwipe.x = 0;
        this.mouseSwipe.y = 0;
        this.saberSwipeTracker = createSaberSwipeTracker();
        this.lmbHeld = false;
        this.rmbHeld = false;
        dragging = false;
      }
    });

    canvas.addEventListener('click', () => {
      if (this.menuState.screen === APP_SCREENS.IN_GAME && document.pointerLockElement !== canvas) {
        try {
          Promise.resolve(canvas.requestPointerLock?.()).catch(() => {});
        } catch {
          // ignore webview/iframe sandbox pointer-lock refusal
        }
      }
    });

    window.addEventListener('mousedown', (e) => {
      if (this.menuState.screen === APP_SCREENS.MAIN_MENU) {
        if (e.target === canvas) {
          this._menuDragging = true;
          this._menuFollowTabPose = false;
          lastDragX = e.clientX;
          lastDragY = e.clientY;
        }
        return;
      }
      if (this.menuState.screen !== APP_SCREENS.IN_GAME) return;
      if (e.target !== canvas && document.pointerLockElement !== canvas) return;
      const invertMouseButtons = Boolean(this.settings.controls.invertMouseButtons);
      if (e.button === 0) {
        dragging = true;
        lastDragX = e.clientX;
        lastDragY = e.clientY;
        if (this.isMatchActionLocked()) return;
        this.lmbHeld = true;
        const tapL = mapMouseInputToHandActions({
          lmbHeld: true,
          lHand: this.loadoutPreset.lHand,
          rHand: this.loadoutPreset.rHand,
          invertMouseButtons,
        });
        if (tapL.shootL) this.requestShootLFlag = true;
        if (tapL.shootR) this.requestShootRFlag = true;
        if (tapL.slashL) this.requestSlashLFlag = true;
        if (tapL.slashR) this.requestSlashRFlag = true;
      } else if (e.button === 2) {
        if (this.isMatchActionLocked()) return;
        this.rmbHeld = true;
        const tapR = mapMouseInputToHandActions({
          rmbHeld: true,
          lHand: this.loadoutPreset.lHand,
          rHand: this.loadoutPreset.rHand,
          invertMouseButtons,
        });
        if (tapR.shootL) this.requestShootLFlag = true;
        if (tapR.shootR) this.requestShootRFlag = true;
        if (tapR.slashL) this.requestSlashLFlag = true;
        if (tapR.slashR) this.requestSlashRFlag = true;
      }
    });

    window.addEventListener('mouseup', (e) => {
      dragging = false;
      this._menuDragging = false;
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
        if (this.popManager?.isModalOpen?.()) return;
        const activeTag = document.activeElement?.tagName;
        if (activeTag === 'INPUT' || activeTag === 'TEXTAREA' || activeTag === 'SELECT') return;

        if (this.menuState.screen === APP_SCREENS.MAIN_MENU && e.target === canvas) {
          this.menuOrbitDistance = clamp(this.menuOrbitDistance + e.deltaY * 0.004, 2.4, 8.8);
          this._menuFollowTabPose = false;
          return;
        }
        if (this.menuState.screen === APP_SCREENS.IN_GAME && this.orbitActive) {
          this.orbitDistance = clamp(this.orbitDistance + e.deltaY * 0.004, 2.3, 9.5);
        }
      },
      { passive: true },
    );

    window.addEventListener('mousemove', (e) => {
      if (this.menuState.screen === APP_SCREENS.MAIN_MENU) {
        if (!this._menuDragging) return;
        const dx = e.clientX - lastDragX;
        const dy = e.clientY - lastDragY;
        lastDragX = e.clientX;
        lastDragY = e.clientY;
        this.menuOrbitYawOffset -= dx * 0.0065;
        this.menuOrbitPitch = clamp(this.menuOrbitPitch + dy * 0.005, -0.22, 0.72);
        return;
      }
      if (this.menuState.screen !== APP_SCREENS.IN_GAME) return;
      const isLocked = document.pointerLockElement === canvas;
      if (!isLocked && !dragging) {
        if (e.target === canvas) {
          if (lastHoverX !== null && lastHoverY !== null) {
            const hdx = clamp(e.clientX - lastHoverX, -48, 48);
            const hdy = clamp(e.clientY - lastHoverY, -48, 48);
            if (Math.hypot(hdx, hdy) >= 0.5) {
              this.saberSwipeTracker = stepSaberSwipeTracker(this.saberSwipeTracker, { dx: hdx, dy: hdy, dt: 0 });
              this.mouseSwipe.x = this.saberSwipeTracker.x;
              this.mouseSwipe.y = this.saberSwipeTracker.y;
            }
          }
          lastHoverX = e.clientX;
          lastHoverY = e.clientY;
        }
        return;
      }

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

      // Record raw swipe impulse for 8-way Beam Saber slashes (single decay happens in _animate)
      this.saberSwipeTracker = stepSaberSwipeTracker(this.saberSwipeTracker, { dx: safe.dx, dy: safe.dy, dt: 0 });
      this.mouseSwipe.x = this.saberSwipeTracker.x;
      this.mouseSwipe.y = this.saberSwipeTracker.y;

      const sens = this.settings.controls.mouseSensitivity || 1.0;
      const ySign = this.settings.controls.invertLookY ? 1 : -1;
      if (this.orbitActive && this.cameraMode !== CAMERA_MODES.FPS_COCKPIT) {
        this.orbitYaw -= safe.dx * 0.0055 * sens;
        this.orbitPitch = clamp(this.orbitPitch - ySign * safe.dy * 0.0045 * sens, -0.35, 0.85);
      } else {
        this.yaw -= safe.dx * 0.0024 * sens;
        this.pitch = clamp(this.pitch + ySign * safe.dy * 0.0019 * sens, -0.58, 0.72);
      }
    });
  }

  _getSurfaceHeightAt(x, z) {
    let groundY = 0;
    const props = this.destructibles || [];
    for (let i = 0; i < props.length; i++) {
      const b = props[i];
      if (!b || b.state === 'destroyed' || b.state === 'collapsing') continue;
      const hx = (b.w || 2) * 0.5;
      const hz = (b.d || 2) * 0.5;
      if (Math.abs(x - b.x) <= hx && Math.abs(z - b.z) <= hz) {
        const effH = (b.y || 0) + (b.h || 2);
        if (effH > groundY) groundY = effH;
      }
    }
    return groundY;
  }

  _syncDroppedGroundMeshes() {
    while (this.groundDropGroup.children.length > 0) {
      this.groundDropGroup.remove(this.groundDropGroup.children[0]);
    }
    this.droppedMeshes = [];

    for (const item of this.weaponState.droppedItems) {
      const holder = new THREE.Group();
      holder.position.set(item.x, item.y, item.z);
      holder.rotation.y = item.yaw || 0;

      let weaponMesh = null;
      const template =
        item.kind === 'pistol' ? this.droppedTemplates.pistol : this.droppedTemplates.saberHilt;
      if (template) {
        weaponMesh = template.clone();
        weaponMesh.visible = true;
        weaponMesh.traverse((ch) => {
          if (ch.name === 'Wpn_HyperBeamSaber_Blade' || ch.name === 'CustomPlasmaSaber') {
            ch.visible = false;
          }
        });
        weaponMesh.scale.setScalar(1.0);
        weaponMesh.rotation.set(item.rotX ?? Math.PI * 0.5, 0, item.rotZ ?? 0);
        holder.add(weaponMesh);
      } else {
        weaponMesh = new THREE.Mesh(
          new THREE.BoxGeometry(0.16, 0.12, 0.55),
          new THREE.MeshStandardMaterial({ color: '#8ca0b8', metalness: 0.7, roughness: 0.3 }),
        );
        holder.add(weaponMesh);
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
      ring.visible = item.settled !== false;
      holder.add(ring);

      holder.userData.weaponMesh = weaponMesh;
      holder.userData.ringMesh = ring;
      this.groundDropGroup.add(holder);
      this.droppedMeshes.push(holder);
    }
  }

  _updateDroppedGroundMeshesTransform() {
    const items = this.weaponState?.droppedItems || [];
    if (this.droppedMeshes.length !== items.length) {
      this._syncDroppedGroundMeshes();
      return;
    }
    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      const holder = this.droppedMeshes[i];
      if (!holder) continue;
      holder.position.set(item.x, item.y, item.z);
      holder.rotation.y = item.yaw || 0;
      if (holder.userData.weaponMesh) {
        holder.userData.weaponMesh.rotation.set(item.rotX ?? Math.PI * 0.5, 0, item.rotZ ?? 0);
      }
      if (holder.userData.ringMesh) {
        holder.userData.ringMesh.visible = item.settled !== false;
      }
    }
  }

  _spawnSeveredLimbDebris(severedDebris, side = 'L', outDirVec = null) {
    if (!severedDebris?.group) return;
    const orig = severedDebris.originPos || severedDebris.group.position;
    this.severedDebrisGroup.add(severedDebris.group);
    const sgn = side === 'L' ? -1 : 1;
    const vxBase = outDirVec ? outDirVec.x : Math.cos(this.bodyYaw) * sgn * 3.2;
    const vzBase = outDirVec ? outDirVec.z : -Math.sin(this.bodyYaw) * sgn * 3.2;
    this.severedDebris.push({
      side,
      mesh: severedDebris.group,
      x: orig.x,
      y: orig.y,
      z: orig.z,
      vx: vxBase + (Math.random() - 0.5) * 1.4,
      vy: 3.6 + Math.random() * 1.5,
      vz: vzBase + (Math.random() - 0.5) * 1.4,
      yaw: 0,
      rotX: 0,
      rotZ: 0,
      angX: (Math.random() > 0.5 ? 1 : -1) * (5.2 + Math.random() * 3.2),
      angY: (Math.random() - 0.5) * 6.5,
      angZ: sgn * (4.8 + Math.random() * 2.5),
      bounces: 0,
      settled: false,
      ageSec: 0,
      ttlSec: 18.0,
    });
  }

  _handleSubPartDestroyedEvent(ev) {
    if (!ev) return;
    const sideLbl = ev.severedArm === 'L' ? '左臂' : '右臂';
    const partLabels = {
      head: '頭部感測器',
      torso: '核心裝甲',
      arm_l: '左臂結構',
      arm_r: '右臂結構',
      backpack: '推進背包',
      legs: '雙腿驅動部',
    };
    const pName = partLabels[ev.partId] || ev.partId;
    if (ev.severedArm) {
      if (ev.severedDebris) {
        this._spawnSeveredLimbDebris(ev.severedDebris, ev.severedArm);
      }
      if (ev.stumpPos) {
        this._tmpVecB.set(ev.stumpPos.x, ev.stumpPos.y, ev.stumpPos.z);
        this.vfx.spawnSparks(this._tmpVecB, '#ff6a2b', 28, 12);
        this.vfx.spawnDust?.(this._tmpVecB, 8);
      }
      this.audio.playCollapse?.();
      this.hitstopTimer = Math.max(this.hitstopTimer, 0.095);
      this.cameraShake = Math.max(this.cameraShake, 0.085);
      if (ev.target === 'player') {
        this.ui.showCombatCallout?.(`${ev.severedArm}-ARM SEVERED!!`, 'break', 1.8);
        this.ui.showToast?.(`[CRITICAL] 我方${sideLbl}被斬斷！已無法使用該側武器`);
        this._recordDuelEvent(MATCH_EVENT_TYPES.PART_BREAK || 'PART_BREAK', 'enemy', `玩家${sideLbl}遭光劍切斷`);
      } else {
        const tgtName = ev.target === 'dummy' ? '靶機' : '敵機';
        this.ui.showCombatCallout?.('ARM SEVERED!!', 'stagger', 1.7);
        this.ui.showToast?.(`[DISMEMBER] 光劍斬斷${tgtName}${sideLbl}！連同武器一併拋飛`);
        if (ev.target === 'rival') {
          this._recordDuelEvent(MATCH_EVENT_TYPES.PART_BREAK || 'PART_BREAK', 'player', `光劍斬斷敵機${sideLbl}`);
        }
      }
    } else if (ev.partBrokenNow || ev.brokenNow) {
      if (ev.target === 'player') {
        this.ui.showToast?.(`[PART BREAK] 我方${pName}損毀！啟動機能受限補償`);
      } else if (ev.target === 'rival') {
        this.ui.showToast?.(`[TARGET BREAK] 破壞敵機${pName}！`);
      } else if (ev.target === 'dummy') {
        this.ui.showToast?.(`[DUMMY BREAK] 靶機${pName}已損毀`);
      }
    }
  }

  _firePistol(hand = 'R') {
    const isLeft = hand === 'L';
    const curCd = isLeft ? this.pistolLeftCooldown : this.pistolCooldown;
    const penalties = computePartStatusPenalties(this.partDamage);
    if ((isLeft && penalties.armLDisabled) || (!isLeft && penalties.armRDisabled)) {
      if (curCd <= 0) {
        if (isLeft) this.pistolLeftCooldown = 0.45;
        else this.pistolCooldown = 0.45;
        this.ui.showToast?.(`${isLeft ? '左臂' : '右臂'}已遭破壞，無法擊發該側手持武器！`);
      }
      return;
    }
    if (this.weaponState.dropping || !this.weaponState.hasPistol || curCd > 0) {
      if (!this.weaponState.hasPistol) this.ui.showToast?.('主武器已丟棄！請靠近按 R 蹲下撿取');
      return;
    }

    const gunDef = this.getActivePrimaryGunDef();
    const res = tryConsumeWeaponShot(this.weaponResource, gunDef);
    this.weaponResource = res.state;
    if (!res.allowed) {
      if (isLeft) this.pistolLeftCooldown = 0.25;
      else this.pistolCooldown = 0.25;
      if (res.event === 'empty_reload') {
        this.audio?.playWeaponReload?.();
        this.ui?.showToast?.('彈匣耗盡，自動換彈中...', 1100);
      }
      return;
    }

    if (res.event === 'auto_reload') {
      this.audio?.playWeaponReload?.();
      this.ui?.showToast?.('彈匣耗盡，自動換彈中...', 1100);
    } else if (res.event === 'overheat_triggered') {
      this.audio?.playWeaponOverheat?.();
      this.ui?.showCombatCallout?.('WEAPON OVERHEAT!!', 'break', 1.2);
    }

    const cd = Math.max(0.08, Number(gunDef?.cooldownSec) || 0.13);
    if (isLeft) {
      this.pistolLeftCooldown = cd;
      this.pistolLeftRecoil = 1.0;
    } else {
      this.pistolCooldown = cd;
      this.pistolRecoil = 1.0;
    }
    this.cameraShake = Math.max(this.cameraShake, gunDef?.fireMode === 'beam' ? 0.032 : 0.025);
    this.audio.playShot(gunDef?.soundProfile || 'kinetic_carbine');

    // Defer world-space projectile spawn until current-frame pose & mechaRoot matrices update
    this.pendingPlayerShots.push({ isLeft, gunDef });
  }

  _spawnPlayerPistolProjectile({ isLeft, gunDef }) {
    const origin = this._tmpOrigin;
    const muzzleNode = isLeft
      ? (this.weaponNodes.pistolLeftMuzzle || this.weaponNodes.pistolLeft)
      : (this.weaponNodes.pistolMuzzle || this.weaponNodes.pistol);
    if (muzzleNode) {
      muzzleNode.getWorldPosition(origin);
    } else {
      origin.set(this.physics.x, this.physics.y + 1.45, this.physics.z);
    }

    this._tmpEuler.set(this.pitch, this.yaw, 0, 'YXZ');
    const aimDir = this._tmpAimDir.set(0, 0, -1).applyEuler(this._tmpEuler);
    const targetPt = this._tmpTargetPt.copy(this.camera.position).addScaledVector(aimDir, 42);
    const shotDir = this._tmpShotDir.copy(targetPt).sub(origin).normalize();

    const effColor = this.vfx.trailColor.getStyle();
    this.vfx.spawnBeamBolt(origin, shotDir, effColor, {
      vfxStyle: gunDef?.vfxStyle,
      attackKind: gunDef?.fireMode === 'beam' ? 'beam' : 'bullet',
      speed: gunDef?.projectileSpeedMps,
      damage: gunDef?.damage,
      rivalDamage: gunDef?.rivalDamage,
      acsImpact: gunDef?.acsImpact,
    });
  }

  /**
   * [Task 6] Execute L_BACK [Q] or R_BACK [X] shoulder hardpoint skill / weapon fire.
   */
  _triggerBackAction(side = 'left') {
    if (this.isMatchActionLocked()) return;
    const isLeft = side === 'left';
    const weaponId = isLeft ? this.menuState?.previewLBackId : this.menuState?.previewRBackId;
    if (!weaponId) {
      this.ui.showToast?.(`${isLeft ? '左肩 [L-BACK]' : '右肩 [R-BACK]'} 尚未裝備武裝，可於 02 格納庫掛載`);
      return;
    }
    const cdKey = isLeft ? 'left' : 'right';
    if ((this.backCooldowns[cdKey] || 0) > 0) return;

    const wDef = this.catalog.getWeapon?.(weaponId);
    if (!wDef) return;
    const enCost = Number(wDef.enCost) || 10;
    if (this.physics.en < enCost) {
      this.ui.showToast?.(`EN 不足（需要 ${enCost} EN 啟動 ${wDef.name}）`);
      return;
    }

    this.physics.en = Math.max(0, this.physics.en - enCost);
    this.physics.enRegenDelaySec = 0.42;
    this.backCooldowns[cdKey] = Number(wDef.cooldownSec) || 3.0;
    this.mechaRig.backRecoil[cdKey] = 1.0;

    if (wDef.id === 'EF-BP03') {
      // Ex-S Side Booster Pod: Overboost Surge impulse along movement or camera direction
      const kb = this.settings.keybindings;
      const strafe = (this.keys.has(kb.moveRight) ? 1 : 0) - (this.keys.has(kb.moveLeft) ? 1 : 0);
      const fwd = (this.keys.has(kb.moveForward) ? 1 : 0) - (this.keys.has(kb.moveBack) ? 1 : 0);
      const cosY = Math.cos(this.yaw);
      const sinY = Math.sin(this.yaw);
      let dx = strafe * cosY - fwd * sinY;
      let dz = -strafe * sinY - fwd * cosY;
      const len = Math.hypot(dx, dz);
      if (len > 0.01) {
        dx /= len;
        dz /= len;
      } else {
        dx = -sinY;
        dz = -cosY;
      }
      const impulse = Number(wDef.burstImpulseMps) || 21;
      this.physics.vx += dx * impulse;
      this.physics.vz += dz * impulse;
      if (this.keys.has(kb.jump)) this.physics.vy += 6.2;
      this.overboostSurgeTimer = 0.42;
      this.cameraShake = Math.max(this.cameraShake, 0.045);
      this.audio.playThrusterIgnite();
      this.vfx.spawnSparks(new THREE.Vector3(this.physics.x, this.physics.y + 1.4, this.physics.z), '#55f6ff', 18, 10);
      this.ui.showCombatCallout?.('OVERBOOST SURGE', 'boost', 0.9);
      return;
    }

    if (wDef.id === 'EF-TB04') {
      const count = Number(wDef.salvoCount) || 4;
      for (let i = 0; i < count; i++) {
        this.pendingMissileSalvos.push({ delaySec: i * 0.075, side: cdKey, weaponDef: wDef, idx: i });
      }
      this.ui.showCombatCallout?.('QUAD MISSILE SALVO', 'fire', 0.9);
      return;
    }

    // Railgun (EF-RL08) or Heavy Cannon (EF-HC04)
    const origin = this.mechaRig.getBackMuzzleWorldPos(cdKey, this._tmpOrigin) ||
      this._tmpOrigin.set(this.physics.x, this.physics.y + 2.05, this.physics.z);
    this._tmpEuler.set(this.pitch, this.yaw, 0, 'YXZ');
    const aimDir = this._tmpAimDir.set(0, 0, -1).applyEuler(this._tmpEuler);
    const targetPt = this._tmpTargetPt.copy(this.camera.position).addScaledVector(aimDir, 55);
    const shotDir = this._tmpShotDir.copy(targetPt).sub(origin).normalize();

    this.cameraShake = Math.max(this.cameraShake, wDef.id === 'EF-RL08' ? 0.055 : 0.048);
    this.audio.playShot(wDef.soundProfile || (wDef.id === 'EF-RL08' ? 'railgun_cannon' : 'heavy_cannon'));
    this.vfx.spawnCustomProjectile(origin, shotDir, {
      style: wDef.id === 'EF-RL08' ? 'railgun' : 'cannon',
      speed: wDef.projectileSpeedMps || 110,
      buildingDamage: wDef.buildingDamage || 100,
      rivalDamage: wDef.rivalDamage || 900,
      acsImpact: wDef.acsImpact || 55,
      damageType: wDef.damageType || 'beam',
      blastRadiusM: wDef.blastRadiusM || 0,
      thickness: wDef.id === 'EF-RL08' ? 2.1 : 2.35,
      lengthScale: wDef.id === 'EF-RL08' ? 1.85 : 1.15,
      life: 1.8,
    });
    this.vfx.spawnSparks(origin, wDef.id === 'EF-RL08' ? '#62f2ff' : '#ff9a3c', 12, 8);
  }

  _spawnBackMissile(weaponDef, idx = 0) {
    const origin = (this.mechaRig.getBackMuzzleWorldPos('right', this._tmpOrigin) ||
      this._tmpOrigin.set(this.physics.x + 0.4, this.physics.y + 2.1, this.physics.z)).clone();
    this._tmpEuler.set(this.pitch, this.yaw, 0, 'YXZ');
    const fwd = this._tmpAimDir.set(0, 0, -1).applyEuler(this._tmpEuler);
    const spreadX = ((idx % 2 === 0 ? -1 : 1) * (0.14 + idx * 0.03));
    const spreadY = 0.24 + (idx < 2 ? 0.12 : 0.02);
    const launchDir = fwd.clone().add(new THREE.Vector3(spreadX, spreadY, 0)).normalize();

    this.audio.playShot(weaponDef.soundProfile || 'micro_missile');
    this.mechaRig.backRecoil.right = 0.65;
    this.vfx.spawnCustomProjectile(origin, launchDir, {
      style: 'missile',
      speed: weaponDef.projectileSpeedMps || 56,
      buildingDamage: weaponDef.buildingDamage || 48,
      rivalDamage: weaponDef.rivalDamage || 245,
      acsImpact: weaponDef.acsImpact || 16,
      damageType: 'blast',
      blastRadiusM: weaponDef.blastRadiusM || 1.5,
      thickness: 1.55,
      lengthScale: 0.9,
      life: 2.8,
      steerRateRad: 5.4,
      homingTargetFn: () => {
        if (this.rivalRig?.active && (this.rivalRig.combatUnit?.ap ?? 0) > 0) {
          return this.rivalRig.getLockTargetWorldPos(this._tmpVecB);
        }
        if (this.dummy && this.dummy.hp > 0) {
          return this._tmpVecB.set(this.dummy.x, (this.dummy.y || 0) + 1.35, this.dummy.z);
        }
        return null;
      },
    });
  }

  _startSaberSlash(hand = 'L') {
    const isRight = hand === 'R';
    const curSwing = isRight ? this.saberSwingR : this.saberSwingL;
    const penalties = computePartStatusPenalties(this.partDamage);
    if ((isRight && penalties.armRDisabled) || (!isRight && penalties.armLDisabled)) {
      this.ui.showToast?.(`${isRight ? '右臂' : '左臂'}已被破壞，無法揮動該側光劍！`);
      return;
    }
    if (this.weaponState.dropping || !this.weaponState.hasSaber) {
      this.ui.showToast?.('高出力光劍已丟棄！請靠近按 R 蹲下撿取');
      return;
    }
    if (curSwing.active) {
      const u = curSwing.duration > 0 ? curSwing.t / curSwing.duration : 0;
      if (u >= 0.68) {
        // Sequential Re-Center input buffer for crisp chain slashes during recovery
        this._queuedSaberHand = hand;
      }
      return;
    }

    const resolved = resolveSaberInputDirection(this.saberSwipeTracker, {
      deadzonePx: 4.2,
      fallbackCombo: curSwing.combo,
    });
    const nextSwing = {
      active: true,
      t: 0,
      duration: 0.44,
      combo: (curSwing.combo + 1) % 2,
      dir: resolved.dir,
      angleRad: resolved.angleRad,
      hitRegistered: false,
    };
    if (isRight) this.saberSwingR = nextSwing;
    else this.saberSwingL = nextSwing;

    // Soft Re-Center Epoch reset: clear transient stroke accumulator while keeping player's locked slash angle & dir
    this.saberSwipeTracker = stepSaberSwipeTracker(this.saberSwipeTracker, { reset: true, keepLocked: true });
    this.mouseSwipe.x = 0;
    this.mouseSwipe.y = 0;

    this.audio.playSaberSlash();
    this._pendingMeleeSlashDir = resolved.dir;
  }

  _applyDamageInSphere(center, radius, dmg, isMelee = false, { hitPartId = null, slashDir = 'LR' } = {}) {
    return this.worldCity.applyDamageInSphere(center, radius, dmg, {
      isMelee,
      hitPartId,
      slashDir,
      score: this.score,
      onHitstop: (sec) => {
        this.hitstopTimer = Math.max(this.hitstopTimer, sec);
      },
      onCameraShake: (amt) => {
        this.cameraShake = Math.max(this.cameraShake, amt);
      },
      onPartDestroyed: (ev) => this._handleSubPartDestroyedEvent(ev),
    });
  }

  _recordDuelEvent(type, actor, detail) {
    if (!this.duelMatch) return;
    this.duelMatch = recordMatchEvent(this.duelMatch, {
      timeSec: this.duelMatch.elapsedSec,
      type,
      actor,
      detail,
    });
  }

  _handleProjectileStep(_prev, cur, dmg, proj) {
    if (proj?.fromEnemy) {
      const pX = this.physics.x;
      const pY = this.physics.y + 1.35;
      const pZ = this.physics.z;
      const shieldDef = this.getActiveShieldDef();
      const lHandShield = this.loadoutPreset.lHand === 'shield';
      const rHandShield = this.loadoutPreset.rHand === 'shield';

      const playerPenalties = computePartStatusPenalties(this.partDamage);
      const shieldArmDisabled = (lHandShield && playerPenalties.armLDisabled) || (rHandShield && playerPenalties.armRDisabled);
      // 1. SSOT Shield Surface Intercept FIRST (blocked if shield arm disabled)
      if ((lHandShield || rHandShield) && !shieldArmDisabled && this.shieldState.barrierActive) {
        const aimN = computeShieldAimWorldNormal({
          bodyYaw: this.bodyYaw,
          torsoYawDeg: this._aimPose.torsoYawDeg,
          pelvisYawDeg: this._aimPose.pelvisYawDeg,
          shieldYawDeg: this._aimPose.shieldYawDeg,
          shieldPitchDeg: this._aimPose.shieldPitchDeg,
        });
        let shieldCenter = this._tmpVecA.set(pX, pY, pZ);
        if (shieldDef.coverageMode === 'buckler_disc') {
          const barrierRef = rHandShield
            ? (this.shieldNodes.rightBarrierMesh || this.shieldNodes.rightGroup)
            : (this.shieldNodes.barrierMesh || this.shieldNodes.group);
          if (barrierRef) barrierRef.getWorldPosition(this._tmpVecA);
          shieldCenter = resolveBucklerInterceptCenter({
            bodyPos: this.physics,
            barrierWorldPos: barrierRef ? this._tmpVecA : null,
            aimNormal: aimN,
            guardBlend: this.shieldState.guardBlend,
            centerOffsetY: 1.35,
            forwardDistM: 0.84,
          });
        }
        const intercept = evaluateShieldSegmentIntercept(
          this.shieldState,
          _prev || cur,
          cur,
          shieldCenter,
          aimN,
          shieldDef,
        );
        if (intercept.intercepted) {
          const hitPt = this._tmpVecB.set(intercept.hitPos.x, intercept.hitPos.y, intercept.hitPos.z);
          const res = evaluateShieldIncomingHit(this.shieldState, {
            dmg,
            isMelee: false,
            attackKind: proj?.attackKind || 'bullet',
            frontDot: intercept.frontDot,
            blockReduction: shieldDef.blockReduction,
            fullDome: Boolean(shieldDef.isFullDome),
            impactDrainMult: shieldDef.impactDrainMult ?? 0.55,
            parrySpRefund: shieldDef.parrySpRefund ?? 10,
            reflectsBeams: Boolean(shieldDef.reflectsBeams),
          });
          if (res.outcome === 'parry') {
            this.shieldState = markShieldBlockOrParry(this.shieldState, { isParry: true });
            this.shieldState.flashTimer = 0.30;
            this.shieldState.shieldSp = Math.min(
              this.shieldState.maxSp || 100,
              (this.shieldState.shieldSp ?? 100) + (res.spRefund || 0),
            );
            this.audio.playShieldParry(true);
            this.vfx.spawnSparks(hitPt, shieldDef.reflectsBeams ? '#76ffdf' : '#ffe86b', 18, 10);
            if (res.defenderRecoilAnim) {
              this.parryRecoil = { active: true, t: 0, duration: 0.36 };
            }
            if (res.slideImpulse > 0 && _prev) {
              const sLen = Math.hypot(cur.x - _prev.x, cur.z - _prev.z) || 1;
              this.physics.vx += ((cur.x - _prev.x) / sLen) * res.slideImpulse;
              this.physics.vz += ((cur.z - _prev.z) / sLen) * res.slideImpulse;
            }
            this.cameraShake = Math.max(this.cameraShake, res.shakeBoost || 0.018);
            this.ui.showCombatCallout?.(
              shieldDef.reflectsBeams ? 'PRISM MIRROR PARRY' : 'PERFECT PARRY',
              'parry',
              1.2,
            );
            this.ui.showToast?.(
              shieldDef.reflectsBeams
                ? `[PRISM MIRROR PARRY] 光束反射彈反 (+${res.spRefund || 0} SP)`
                : `[PERFECT PARRY] 彈反成功 (+${res.spRefund || 0} SP)`,
            );
            this._recordDuelEvent(MATCH_EVENT_TYPES.PARRY, 'player', '完美彈反敵機射擊');
            return 'reflect';
          }
          if (res.outcome === 'block') {
            this.shieldState = markShieldBlockOrParry(this.shieldState, { isParry: false });
            this.shieldState.flashTimer = 0.16;
            const nextSp = Math.max(0, (this.shieldState.shieldSp ?? 100) - (res.spDrain || 0));
            this.shieldState.shieldSp = nextSp;
            this.shieldState.regenDelaySec = 0.35;
            if (res.defenderRecoilAnim) {
              this.parryRecoil = { active: true, t: 0, duration: 0.24 };
            }
            if (res.slideImpulse > 0 && _prev) {
              const sLen = Math.hypot(cur.x - _prev.x, cur.z - _prev.z) || 1;
              this.physics.vx += ((cur.x - _prev.x) / sLen) * res.slideImpulse;
              this.physics.vz += ((cur.z - _prev.z) / sLen) * res.slideImpulse;
            }
            this.cameraShake = Math.max(this.cameraShake, res.shakeBoost || 0.014);
            if (nextSp <= 0) {
              this.shieldState.overheated = true;
              this.shieldState.barrierActive = false;
              this.shieldState.cooldownRemainingSec = Number(((shieldDef.cooldownSec || 1.5) * 1.3).toFixed(2));
              this.cameraShake = Math.max(this.cameraShake, 0.048);
              this.vfx.spawnSparks(hitPt, '#ff6848', 22, 12);
              this.ui.showCombatCallout?.('GUARD BREAK!!', 'break', 1.6);
              this.ui.showToast?.(`[GUARD BREAK] ${shieldDef.shortLabel} 護盾擊破過熱 (${this.shieldState.cooldownRemainingSec.toFixed(1)}s)`);
              this._recordDuelEvent(MATCH_EVENT_TYPES.GUARD_BREAK, 'enemy', '玩家護盾過熱崩潰');
            } else {
              this.vfx.spawnSparks(hitPt, shieldDef.barrierColor || '#38e8ff', 10, 6);
            }
            if (res.damageTaken > 0) {
              const { armorCoreDef, armorLiningDef } = this._getActiveArmorDefs();
              const chip = applyUnitDamage(this.combatUnit, {
                rawDamage: res.damageTaken,
                acsDamage: 2,
                damageType: proj?.attackKind || 'bullet',
                armorCoreDef,
                armorLiningDef,
              });
              this.combatUnit = chip.unit;
              this.playerHp = this.combatUnit.ap;
            }
            this.audio.playShieldParry(false);
            return true;
          }
        }
      }

      // 2. Shots not stopped by visible shield barrier hit real 6 sub-part bone capsules (AP + Part Break + ACS Stagger)
      const p0 = _prev || cur;
      const subHit = evaluateSubPartSegmentHit(p0, cur, this.mechaRig.getSubPartHitCapsules(this.partDamage));
      let hitPartId = subHit.hit ? subHit.partId : null;
      if (!hitPartId) {
        const bodyHit = evaluateMechaBodySegmentHit(p0, cur, this.physics, {
          bodyRadiusM: 0.56,
          minHeightM: 0.05,
          maxHeightM: 2.55,
        });
        if (bodyHit.hit) hitPartId = 'torso';
      }
      if (hitPartId) {
        const { armorCoreDef, armorLiningDef } = this._getActiveArmorDefs();
        const atkKind = proj?.attackKind || 'bullet';
        const partRes = applyPartDamage(this.partDamage, hitPartId, {
          rawDamage: dmg,
          damageType: atkKind,
          isMelee: false,
        });
        this.partDamage = partRes.partState;
        this.mechaRig.applyPartDamageVisuals(this.partDamage);

        const hitRes = applyUnitDamage(this.combatUnit, {
          rawDamage: Math.round(dmg * (partRes.apDamageMult || 1.0)),
          acsDamage: (atkKind === 'beam' ? 14 : atkKind === 'heavy' ? 28 : 9) + (partRes.bonusAcs || 0),
          damageType: atkKind,
          armorCoreDef,
          armorLiningDef,
        });
        this.combatUnit = hitRes.unit;
        this.playerHp = this.combatUnit.ap;
        if (hitRes.hitstopSec > 0) this.hitstopTimer = Math.max(this.hitstopTimer, hitRes.hitstopSec);
        if (partRes.brokenNow) {
          this._handleSubPartDestroyedEvent({ target: 'player', partId: partRes.partId, brokenNow: true });
        }
        if (hitRes.staggeredNow) {
          this.ui.showCombatCallout?.('STAGGER 200%!!', 'stagger', 1.8);
          this.ui.showToast?.('[ACS OVERLOAD] 姿勢崩潰 STAGGERED (200% 承傷)');
          this._recordDuelEvent(MATCH_EVENT_TYPES.STAGGER, 'enemy', '玩家 ACS 姿勢崩潰 (200% 承傷)');
        }
        this.audio.playBulletHit('metal');
        this.vfx.spawnSparks(cur, partRes.brokenNow ? '#ff7a22' : '#ff5544', partRes.brokenNow ? 16 : 8, 6);
        this.cameraShake = Math.max(this.cameraShake, 0.04);
        return true;
      }

      // 3. Swept SpatialHashGrid building obstruction check for enemy rounds
      return this.worldCity.checkEnemyShotObstruction(_prev, cur);
    }

    // Check Rival Ace Mecha capsule before static terrain
    if (this.rivalRig?.active) {
      const scaledDmg = Number(proj?.rivalDamage) || Math.round((dmg || 26) * 7.5);
      const rivalHit = this.rivalRig.handleIncomingPlayerShot(_prev || cur, cur, scaledDmg, proj);
      if (rivalHit.hit) {
        if (rivalHit.damageDealt > 0) {
          this.duelDamageDealt += rivalHit.damageDealt;
        }
        if (proj?.blastRadiusM > 0) {
          this.vfx.spawnSparks(cur, proj.sparkColor || '#ff923c', 16, 10);
          this._applyDamageInSphere(cur, proj.blastRadiusM, dmg, true);
        }
        if (rivalHit.hitstopSec > 0) {
          this.hitstopTimer = Math.max(this.hitstopTimer, rivalHit.hitstopSec);
        }
        if (rivalHit.staggeredNow) {
          this.ui.showCombatCallout?.('ENEMY STAGGERED 200%!!', 'stagger', 1.6);
          this._recordDuelEvent(MATCH_EVENT_TYPES.STAGGER, 'player', '擊破敵機姿勢 STAGGER (200% 承傷)');
        }
        if (rivalHit.partBrokenNow) {
          this._handleSubPartDestroyedEvent({ target: 'rival', partId: rivalHit.hitPartId, brokenNow: true });
        }
        if (rivalHit.guardBreak) {
          this.ui.showCombatCallout?.('ENEMY GUARD BREAK!!', 'break', 1.5);
          this._recordDuelEvent(MATCH_EVENT_TYPES.GUARD_BREAK, 'player', '射擊瓦解敵機能量護盾');
        }
        return true;
      }
    }

    // Player shots: swept 16m SpatialHashGrid anti-tunneling check first, then sphere blast apply
    const swept = this.worldCity.querySweptPlayerShotHit(_prev, cur, 0.35);
    const impactCenter = swept?.point || cur;
    const blastRad = Number(proj?.blastRadiusM) > 0 ? Number(proj.blastRadiusM) : 0.45;
    if (proj?.blastRadiusM > 0 && swept) {
      this.vfx.spawnSparks(impactCenter, proj.sparkColor || '#ff9a3c', 16, 9);
    }
    return this._applyDamageInSphere(impactCenter, blastRad, dmg, Number(proj?.blastRadiusM) > 0, {
      hitPartId: swept?.partId || null,
    });
  }

  _updateDestructiblesAndDummy(dt, { freezeDummyFire = false } = {}) {
    this.worldCity.stepDestructiblesAndDummy(dt, {
      freezeDummyFire,
      physics: this.physics,
      onCameraShake: (amt) => {
        this.cameraShake = Math.max(this.cameraShake, amt);
      },
    });
  }

  _applyRivalMeleeEncounter(encounter, impactPos) {
    if (!encounter || encounter.outcome === 'miss') return;
    const hitPt = impactPos || this._tmpVecA.set(this.physics.x, this.physics.y + 1.35, this.physics.z);
    if (encounter.outcome === 'saber_clash' || encounter.outcome === 'active_blade_parry') {
      this.hitstopTimer = Math.max(this.hitstopTimer, encounter.hitstopSec || SABER_CLASH_HITSTOP_SEC);
      this.cameraShake = Math.max(this.cameraShake, 0.085);
      this.parryRecoil = { active: true, t: 0, duration: 0.34 };
      this.audio.playShieldParry(true);
      this.vfx.spawnSparks(hitPt, '#ffe86b', 22, 11);
      this.ui.showCombatCallout?.(
        encounter.outcome === 'saber_clash' ? 'SABER CLASH!!' : 'BLADE PARRY!!',
        'clash',
        1.4,
      );
      this._recordDuelEvent(
        encounter.outcome === 'saber_clash' ? MATCH_EVENT_TYPES.SABER_CLASH : MATCH_EVENT_TYPES.PARRY,
        'player',
        encounter.outcome === 'saber_clash' ? '光劍激烈交鋒 SABER CLASH' : '揮刀格擋彈反敵機斬擊',
      );
      return;
    }

    if (encounter.outcome === 'shield_parry') {
      this.shieldState = markShieldBlockOrParry(this.shieldState, { isParry: true });
      this.shieldState.flashTimer = 0.3;
      this.shieldState.shieldSp = Math.min(100, (this.shieldState.shieldSp ?? 100) + (encounter.spRefund || 10));
      this.hitstopTimer = Math.max(this.hitstopTimer, encounter.hitstopSec || 0.08);
      this.audio.playShieldParry(true);
      this.vfx.spawnSparks(hitPt, '#76ffdf', 18, 9);
      this.ui.showCombatCallout?.('PERFECT MELEE PARRY', 'parry', 1.3);
      this._recordDuelEvent(MATCH_EVENT_TYPES.PARRY, 'player', '盾反敵機光劍斬擊');
      return;
    }

    if (encounter.outcome === 'shield_block') {
      this.shieldState = markShieldBlockOrParry(this.shieldState, { isParry: false });
      this.shieldState.flashTimer = 0.16;
      const nextSp = Math.max(0, (this.shieldState.shieldSp ?? 100) - (encounter.spDrain || 25));
      this.shieldState.shieldSp = nextSp;
      this.shieldState.regenDelaySec = 0.45;
      this.audio.playShieldParry(false);
      this.cameraShake = Math.max(this.cameraShake, 0.036);
      if (nextSp <= 0) {
        this.shieldState.overheated = true;
        this.shieldState.barrierActive = false;
        this.shieldState.cooldownRemainingSec = Number(((this.getActiveShieldDef().cooldownSec || 1.5) * 1.3).toFixed(2));
        this.vfx.spawnSparks(hitPt, '#ff6848', 22, 12);
        this.ui.showCombatCallout?.('GUARD BREAK!!', 'break', 1.6);
        this._recordDuelEvent(MATCH_EVENT_TYPES.GUARD_BREAK, 'enemy', '敵機重斬擊破玩家護盾');
      } else {
        this.vfx.spawnSparks(hitPt, '#38e8ff', 10, 6);
      }
      if (encounter.damageToDefender > 0) {
        const { armorCoreDef, armorLiningDef } = this._getActiveArmorDefs();
        const chip = applyUnitDamage(this.combatUnit, {
          rawDamage: encounter.damageToDefender,
          acsDamage: 6,
          damageType: 'melee',
          armorCoreDef,
          armorLiningDef,
        });
        this.combatUnit = chip.unit;
        this.playerHp = this.combatUnit.ap;
      }
      return;
    }

    if (encounter.outcome === 'melee_hit' && encounter.damageToDefender > 0) {
      const { armorCoreDef, armorLiningDef } = this._getActiveArmorDefs();
      const caps = this.mechaRig.getSubPartHitCapsules(this.partDamage);
      let targetPartId = 'torso';
      let bestDistSq = Infinity;
      for (const cap of caps) {
        if (!cap || cap.disabled) continue;
        const mx = (cap.a.x + cap.b.x) * 0.5;
        const my = (cap.a.y + cap.b.y) * 0.5;
        const mz = (cap.a.z + cap.b.z) * 0.5;
        let d2 = (mx - hitPt.x) ** 2 + (my - hitPt.y) ** 2 + (mz - hitPt.z) ** 2;
        if (cap.partId === 'arm_l' || cap.partId === 'arm_r') d2 *= 0.52;
        if (d2 < bestDistSq) {
          bestDistSq = d2;
          targetPartId = cap.partId;
        }
      }
      const partRes = applyPartDamage(this.partDamage, targetPartId, {
        rawDamage: encounter.damageToDefender,
        damageType: 'saber',
        isMelee: true,
      });
      let playerSeveredDebris = null;
      if (partRes.severedArm) {
        playerSeveredDebris = this.mechaRig.createSeveredArmDebrisGroup(partRes.severedArm);
      }
      this.partDamage = partRes.partState;
      this.mechaRig.applyPartDamageVisuals(this.partDamage);
      if (partRes.severedArm) {
        this._handleSubPartDestroyedEvent({
          target: 'player',
          partId: partRes.partId,
          severedArm: partRes.severedArm,
          severedDebris: playerSeveredDebris,
          stumpPos: playerSeveredDebris?.originPos || hitPt,
        });
      } else if (partRes.brokenNow) {
        this._handleSubPartDestroyedEvent({ target: 'player', partId: partRes.partId, brokenNow: true });
      }

      const hitRes = applyUnitDamage(this.combatUnit, {
        rawDamage: Math.round(encounter.damageToDefender * (partRes.apDamageMult || 1.0)),
        acsDamage: (encounter.acsDamageToDefender || 28) + (partRes.bonusAcs || 0),
        damageType: 'melee',
        armorCoreDef,
        armorLiningDef,
      });
      this.combatUnit = hitRes.unit;
      this.playerHp = this.combatUnit.ap;
      if (hitRes.hitstopSec > 0) this.hitstopTimer = Math.max(this.hitstopTimer, hitRes.hitstopSec);
      this.cameraShake = Math.max(this.cameraShake, 0.055);
      this.audio.playBulletHit('metal');
      this.vfx.spawnSparks(hitPt, '#ff5544', 14, 7);
      if (hitRes.staggeredNow) {
        this.ui.showCombatCallout?.('STAGGER 200%!!', 'stagger', 1.8);
        this._recordDuelEvent(MATCH_EVENT_TYPES.STAGGER, 'enemy', '敵機斬擊觸發玩家 STAGGER');
      }
    }
  }

  _stepDuelLoop(dt, activeShieldDef) {
    if (!this.duelMatch || !this.rivalRig?.active) return;
    if (this.roundBannerTimer > 0) {
      this.roundBannerTimer = Math.max(0, this.roundBannerTimer - dt);
    }

    if (this.duelMatch.phase === MATCH_PHASES.INTERMISSION) {
      const rem = this.duelMatch.intermissionSec - dt;
      if (rem <= 0) {
        this.duelMatch = beginRoundCountdown(this.duelMatch, DUEL_COUNTDOWN_SEC);
        this.vfx.clearProjectiles();
        this._resetActorsForRound(true);
        const cdStep = Math.ceil(this.duelMatch.countdownSec || DUEL_COUNTDOWN_SEC);
        this._lastCountdownStep = cdStep;
        this.roundBannerText = `ROUND ${this.duelMatch.roundNumber} — GET READY // ${cdStep}`;
        this.roundBannerTimer = (this.duelMatch.countdownSec || DUEL_COUNTDOWN_SEC) + 0.5;
        this.audio.playCountdownTick?.(cdStep);
      } else {
        this.duelMatch = {
          ...this.duelMatch,
          intermissionSec: rem,
        };
      }
      return;
    }

    if (this.duelMatch.phase === MATCH_PHASES.COUNTDOWN) {
      const cdRes = stepDuelCountdown(this.duelMatch, dt);
      this.duelMatch = cdRes.nextState;
      this.rivalRig.step(dt, {
        playerPhysics: this.physics,
        playerUnit: this.combatUnit,
        playerShield: { ...this.shieldState, activeShieldId: activeShieldDef?.id },
        playerMelee: this.meleeTiming,
        destructibles: this.worldCity.destructibles,
        spatialGrid: this.spatialGrid,
        dummy: null,
        mapEnvModifiers: this.worldCity.mapEnvModifiers,
        playerAttacking: false,
        matchTimeSec: 0,
        freezeCombat: true,
      });
      if (cdRes.transitionedToActive) {
        this._lastCountdownStep = 0;
        this.roundBannerText = `ROUND ${this.duelMatch.roundNumber} — FIGHT!!`;
        this.roundBannerTimer = 1.5;
        this.audio.playCountdownTick?.(0);
      } else if (cdRes.currentBeepStep > 0) {
        if (this._lastCountdownStep !== cdRes.currentBeepStep) {
          this._lastCountdownStep = cdRes.currentBeepStep;
          this.audio.playCountdownTick?.(cdRes.currentBeepStep);
        }
        this.roundBannerText = `ROUND ${this.duelMatch.roundNumber} — GET READY // ${cdRes.currentBeepStep}`;
        this.roundBannerTimer = Math.max(this.roundBannerTimer, 0.25);
      }
      return;
    }

    if (this.duelMatch.phase !== MATCH_PHASES.ACTIVE) return;

    this.duelMatch = {
      ...this.duelMatch,
      elapsedSec: this.duelMatch.elapsedSec + dt,
    };

    const playerAttacking =
      Boolean(this.lmbHeld || this.rmbHeld) ||
      Boolean(this.saberSwingL.active || this.saberSwingR.active);

    const playerPenalties = computePartStatusPenalties(this.partDamage);
    const hasActivePlayerSaber =
      Boolean(this.weaponState.hasSaber) &&
      ((this.loadoutPreset.lHand === 'saber' && !playerPenalties.armLDisabled) ||
        (this.loadoutPreset.rHand === 'saber' && !playerPenalties.armRDisabled));

    this.rivalRig.step(dt, {
      playerPhysics: this.physics,
      playerUnit: { ...this.combatUnit, hasPlayerSaber: hasActivePlayerSaber },
      playerShield: { ...this.shieldState, activeShieldId: activeShieldDef?.id },
      playerMelee: this.meleeTiming,
      destructibles: this.worldCity.destructibles,
      spatialGrid: this.spatialGrid,
      dummy: this.worldCity.duelMode ? null : this.dummy,
      mapEnvModifiers: this.worldCity.mapEnvModifiers,
      playerAttacking,
      playerWeaponCoolingOrReloading: isWeaponResourceUnavailable(this.weaponResource),
      matchTimeSec: this.duelMatch.elapsedSec,
      onRecordEvent: (ev) => {
        if (!ev || !this.duelMatch) return;
        this.duelMatch = recordMatchEvent(this.duelMatch, {
          timeSec: ev.timeSec ?? this.duelMatch.elapsedSec,
          type: ev.type,
          actor: ev.actor,
          detail: ev.detail,
        });
      },
      onCallout: (text, tone) => this.ui.showCombatCallout?.(text, tone, 1.3),
      onRivalMeleeImpactPlayer: (encounter, impactPos) => this._applyRivalMeleeEncounter(encounter, impactPos),
    });

    const rivalHp = this.rivalRig.combatUnit?.ap ?? 0;
    const playerKo = this.combatUnit.ap <= 0;
    const rivalKo = rivalHp <= 0;
    if (!playerKo && !rivalKo) return;

    const roundWinner = rivalKo ? 'player' : 'enemy';
    const roundRes = resolveRoundEnd(this.duelMatch, {
      winner: roundWinner,
      timeSec: this.duelMatch.elapsedSec,
      playerHp: this.combatUnit.ap,
      playerMaxHp: this.combatUnit.maxAp,
    });
    this.duelMatch = roundRes.nextState;
    this.cameraShake = Math.max(this.cameraShake, 0.065);

    if (roundRes.matchComplete) {
      const won = roundRes.nextState.winner === 'player';
      const summary = computeMatchSummary(roundRes.nextState, {
        won,
        playerHpRatio: this.combatUnit.ap / Math.max(1, this.combatUnit.maxAp),
        durationSec: roundRes.nextState.elapsedSec,
        damageDealt: this.duelDamageDealt,
        buildingsDestroyed: this.score.destroyed,
        partDamage: this.partDamage,
        rivalPartDamage: this.rivalRig?.partDamage || null,
      });
      this.score.mcEarned += summary.netMc;
      this.roundBannerText = won ? 'DUEL VICTORY!!' : 'UNIT DESTROYED';
      this.roundBannerTimer = 1.8;
      if (document.pointerLockElement) {
        try {
          document.exitPointerLock?.();
        } catch {
          // ignore
        }
      }
      this._applyMenuState(finishSortieTransition(this.menuState, summary));
    } else {
      this.roundBannerText = roundWinner === 'player'
        ? `ROUND ${this.duelMatch.roundNumber} WIN!!`
        : `ROUND ${this.duelMatch.roundNumber} LOST`;
      this.roundBannerTimer = 2.2;
    }
  }

  _animate(now) {
    requestAnimationFrame(this._animate);
    const rawDt = Math.min(0.05, (now - this.lastTime) / 1000);
    this.lastTime = now;

    // Single 140ms swipe decay & camera shake fade (no double decay)
    this.saberSwipeTracker = stepSaberSwipeTracker(this.saberSwipeTracker, { dt: rawDt });
    this.mouseSwipe.x = this.saberSwipeTracker.x;
    this.mouseSwipe.y = this.saberSwipeTracker.y;
    this.cameraShake = Math.max(0, this.cameraShake - rawDt * 0.25);

    const inMainMenu = this.menuState.screen === APP_SCREENS.MAIN_MENU;
    if (this.menuState.screen === APP_SCREENS.PAUSED || this.menuState.screen === APP_SCREENS.POST_MATCH) {
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
    this.backCooldowns.left = Math.max(0, (this.backCooldowns.left || 0) - dt);
    this.backCooldowns.right = Math.max(0, (this.backCooldowns.right || 0) - dt);
    this.overboostSurgeTimer = Math.max(0, (this.overboostSurgeTimer || 0) - dt);
    for (let i = this.pendingMissileSalvos.length - 1; i >= 0; i--) {
      const m = this.pendingMissileSalvos[i];
      m.delaySec -= dt;
      if (m.delaySec <= 0) {
        this._spawnBackMissile(m.weaponDef, m.idx);
        this.pendingMissileSalvos.splice(i, 1);
      }
    }
    this.mechaRig.stepBackWeaponRecoil(dt);
    this.mechaRig.updateHangarStage(dt, {
      inMainMenu,
      cameraPos: this.camera.position,
      menuState: this.menuState,
    });

    // 1. Input vector (frozen in MAIN_MENU or during pre-round COUNTDOWN so both actors start equally)
    const inputsLocked = inMainMenu || this.isMatchActionLocked();
    const kb = this.settings.keybindings;
    const strafe = inputsLocked ? 0 : (this.keys.has(kb.moveRight) ? 1 : 0) - (this.keys.has(kb.moveLeft) ? 1 : 0);
    const fwdInput = inputsLocked ? 0 : (this.keys.has(kb.moveForward) ? 1 : 0) - (this.keys.has(kb.moveBack) ? 1 : 0);
    const isMoving = strafe !== 0 || fwdInput !== 0;
    const jumpHeld = !inputsLocked && this.keys.has(kb.jump);
    const quickBoost =
      !inputsLocked && (this.keys.has(kb.boost) || (kb.boost === 'ShiftLeft' && this.keys.has('ShiftRight')));

    const cosY = Math.cos(this.yaw);
    const sinY = Math.sin(this.yaw);
    const worldMoveX = strafe * cosY - fwdInput * sinY;
    const worldMoveZ = -strafe * sinY - fwdInput * cosY;

    // 2. Crisp Walk-and-Toss Drop (`F`), Ballistic Drop Physics, and Crouch Pickup (`R`)
    if (this.requestDropFlag) {
      this.requestDropFlag = false;
      const beforeDrop = this.weaponState.dropping;
      this.weaponState = startWeaponDropAnimation(this.weaponState, this.loadoutPreset);
      if (!beforeDrop && this.weaponState.dropping) {
        this._syncWeaponLoadoutVisibility();
        this.audio.playServoLift?.('R');
      }
    }

    if (this.weaponState.dropping) {
      const releaseOrigins = this.mechaRig.getHandWeaponReleaseOrigins?.() || null;
      this.weaponState = stepWeaponDrop(this.weaponState, {
        dt,
        mechaPos: this.physics,
        mechaVel: this.physics,
        mechaYaw: this.yaw,
        preset: this.loadoutPreset,
        releaseOrigins,
      });
      if (this.weaponState.justReleased) {
        this._syncWeaponLoadoutVisibility();
        this._syncDroppedGroundMeshes();
        this.audio.playServoLift?.('L');
        this.ui.showToast?.('已拋出手中手持武裝 — 靠近按 R 可蹲下撿起');
      }
    }

    if (this.weaponState.droppedItems?.some((it) => it && !it.settled && it.vy !== undefined)) {
      const stepDrop = stepDroppedWeaponsPhysics(this.weaponState.droppedItems, dt, (x, z) =>
        this._getSurfaceHeightAt(x, z),
      );
      this.weaponState = { ...this.weaponState, droppedItems: stepDrop.droppedItems };
      this._updateDroppedGroundMeshesTransform();
      for (const ev of stepDrop.landedEvents) {
        this.audio.playBulletHit?.('metal');
        this._tmpOrigin.set(ev.x, ev.y + 0.04, ev.z);
        this.vfx.spawnDust?.(this._tmpOrigin, ev.settled ? 4 : 2);
      }
    }

    if (this.severedDebris.length > 0) {
      const stepDebris = stepSeveredLimbDebris(this.severedDebris, dt, (x, z) => this._getSurfaceHeightAt(x, z));
      const keptMeshes = new Set();
      for (const d of stepDebris.debrisList) {
        if (d.mesh) {
          keptMeshes.add(d.mesh);
          d.mesh.position.set(d.x, d.y, d.z);
          d.mesh.rotation.set(d.rotX || 0, d.yaw || 0, d.rotZ || 0);
        }
      }
      for (const old of this.severedDebris) {
        if (old?.mesh && !keptMeshes.has(old.mesh)) {
          this.severedDebrisGroup.remove(old.mesh);
        }
      }
      this.severedDebris = stepDebris.debrisList;
      for (const ev of stepDebris.impactEvents) {
        this.audio.playBulletHit?.('metal');
        this._tmpOrigin.set(ev.x, ev.y + 0.05, ev.z);
        this.vfx.spawnDust?.(this._tmpOrigin, ev.settled ? 6 : 3);
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
      this._syncWeaponLoadoutVisibility();
      this.audio.playPickup();
      this.ui.showToast?.('完成蹲下拾取！手槍與高出力光劍已重新就緒');
    }

    // 3. Weapons (LMB=Left Hand, RMB=Right Hand, E=Shield Guard, symmetric dual-wield)
    const primaryGunDef = this.getActivePrimaryGunDef();
    this.weaponResource = stepWeaponResource(this.weaponResource, dt, primaryGunDef);
    this.pistolCooldown = Math.max(0, this.pistolCooldown - dt);
    this.pistolRecoil = Math.max(0, this.pistolRecoil - dt * 5.2);
    this.pistolLeftCooldown = Math.max(0, this.pistolLeftCooldown - dt);
    this.pistolLeftRecoil = Math.max(0, this.pistolLeftRecoil - dt * 5.2);

    const activeShieldDef = this.getActiveShieldDef();
    const handActions = mapMouseInputToHandActions({
      lmbHeld: !inputsLocked && this.lmbHeld,
      rmbHeld: !inputsLocked && this.rmbHeld,
      eHeld: !inputsLocked && this.keys.has(kb.guard),
      lHand: this.loadoutPreset.lHand,
      rHand: this.loadoutPreset.rHand,
      invertMouseButtons: Boolean(this.settings.controls.invertMouseButtons),
    });

    if (this.requestShootLFlag || (handActions.shootL && this.pistolLeftCooldown <= 0 && this.weaponState.hasPistol)) {
      this.requestShootLFlag = false;
      if (this.loadoutPreset.lHand === 'pistol') this._firePistol('L');
    } else {
      this.requestShootLFlag = false;
    }

    if (this.requestShootRFlag || (handActions.shootR && this.pistolCooldown <= 0 && this.weaponState.hasPistol)) {
      this.requestShootRFlag = false;
      if (this.loadoutPreset.rHand === 'pistol') this._firePistol('R');
    } else {
      this.requestShootRFlag = false;
    }

    if (this.requestSlashLFlag) {
      this.requestSlashLFlag = false;
      if (this.loadoutPreset.lHand === 'saber') this._startSaberSlash('L');
    }
    if (this.requestSlashRFlag) {
      this.requestSlashRFlag = false;
      if (this.loadoutPreset.rHand === 'saber') this._startSaberSlash('R');
    }

    const playerPartPenalties = computePartStatusPenalties(this.partDamage);
    const shieldArmDisabled =
      (handActions.shieldSide === 'L' && playerPartPenalties.armLDisabled) ||
      (handActions.shieldSide === 'R' && playerPartPenalties.armRDisabled);
    if (playerPartPenalties.smokingParts.length > 0 || playerPartPenalties.armLSevered || playerPartPenalties.armRSevered) {
      this._partSmokeTimer -= dt;
      if (this._partSmokeTimer <= 0) {
        this._partSmokeTimer = 0.30;
        const pId = playerPartPenalties.armRSevered
          ? 'arm_r'
          : playerPartPenalties.armLSevered
            ? 'arm_l'
            : playerPartPenalties.smokingParts[Math.floor(now * 0.004) % playerPartPenalties.smokingParts.length];
        const pPos = this.mechaRig.getSubPartWorldPos(pId, this._tmpVecA);
        this.vfx.spawnSparks(pPos, '#ff7733', 4, 3);
      }
    }

    const envMod = this._getActiveMapModifiers();
    const prevBarrier = this.shieldState.barrierActive;
    const prevOverheat = this.shieldState.overheated;
    this.shieldState = stepShieldDefenseAntiSpam(this.shieldState, {
      guardHeld: !shieldArmDisabled && handActions.guardHeld,
      hasShield: Boolean(handActions.shieldSide) && !shieldArmDisabled,
      dt,
      shieldDef: activeShieldDef,
      spRegenScale: envMod.spRegenScale ?? 1.0,
    });
    if (!prevOverheat && this.shieldState.overheated) {
      this.ui.showToast?.(`[OVERHEAT] ${activeShieldDef.shortLabel} 過熱冷卻中 (${(activeShieldDef.cooldownSec || 1).toFixed(1)}s)`);
    }
    if (!prevBarrier && this.shieldState.barrierActive) {
      this.audio.playShieldToggle(true);
    } else if (prevBarrier && !this.shieldState.barrierActive) {
      this.audio.playShieldToggle(false);
    }

    // 4. Flight / Walk Physics ODE (Shift/Space boost strictly gated on EN > 0.5, ACS Stagger, and EF-SH09 Boost Lock)
    const mapPhysics = computeMapDragAndUpdraft(this.physics, this.physics, envMod, []);
    const shieldBoostLocked = Boolean(activeShieldDef.boostLock && this.shieldState.barrierActive);
    const staggerLocked = (this.combatUnit.staggerRemainingSec || 0) > 0;
    const effectiveQuickBoost = quickBoost && !shieldBoostLocked && !staggerLocked;
    const effectiveJumpHeld = jumpHeld && !shieldBoostLocked && !staggerLocked;
    const moveScale =
      (shieldBoostLocked ? 0.5 : 1.0) *
      (staggerLocked ? 0.25 : 1.0) *
      clamp(mapPhysics.frictionScale, 0.7, 1.15) *
      playerPartPenalties.moveSpeedScale;
    const boostAvailable = effectiveQuickBoost && this.physics.en > 0.5;
    const hoverAvailable = effectiveJumpHeld && this.physics.en > 0.5;
    const walkOnly = this.physics.grounded && !boostAvailable && !hoverAvailable && !this.weaponState.pickingUp;
    const boostPose = computeBoostSkatePose({ forward: fwdInput, strafe });
    const boostBankTarget = walkOnly
      ? { rollRad: 0, pitchRad: 0 }
      : computeSkateTilt({ strafe: strafe * boostPose.bankScale, forward: fwdInput * 0.65 });
    this.skateTiltSmooth.rollRad = lerp(this.skateTiltSmooth.rollRad, boostBankTarget.rollRad, 1 - Math.exp(-10 * dt));
    this.skateTiltSmooth.pitchRad = lerp(this.skateTiltSmooth.pitchRad, boostBankTarget.pitchRad, 1 - Math.exp(-10 * dt));

    this.prevVy = this.physics.vy;
    const prevPhysicsY = this.physics.y;
    const prevPhysicsEn = this.physics.en;
    const walkDriveGain = isMoving ? clamp(this.footState?.driveGain ?? 0.16, 0.08, 1.25) : 1.0;
    const effMassThrust =
      playerPartPenalties.boostScale < 0.99
        ? {
            ...this.massThrust,
            hoverThrustN: this.massThrust.hoverThrustN * playerPartPenalties.boostScale,
            quickBoostImpulse: (this.massThrust.quickBoostImpulse || 18) * playerPartPenalties.boostScale,
          }
        : this.massThrust;
    this.physics = stepAerialFlight(
      this.physics,
      {
        moveX: worldMoveX * moveScale,
        moveZ: worldMoveZ * moveScale,
        jumpHeld: effectiveJumpHeld,
        quickBoost: effectiveQuickBoost,
        walkOnly,
        walkDriveGain,
        throttle: 1.0,
        pitchRad: this.skateTiltSmooth.pitchRad,
        rollRad: this.skateTiltSmooth.rollRad,
      },
      dt,
      effMassThrust,
    );
    if (mapPhysics.updraftAccelY > 0) {
      this.physics.vy += mapPhysics.updraftAccelY * dt;
    }

    const colRes = resolveWorldCollisions(
      this.physics,
      prevPhysicsY,
      this.destructibles,
      this.worldCity.duelMode ? null : this.dummy,
    );
    this.physics = colRes.physics;
    this.supportHeight = colRes.supportHeight;

    const rFromCtr = Math.hypot(this.physics.x, this.physics.z);
    if (rFromCtr > ARENA_RADIUS - 1.2) {
      const s = (ARENA_RADIUS - 1.2) / rFromCtr;
      this.physics.x *= s;
      this.physics.z *= s;
    }

    const enDelta = this.physics.en - prevPhysicsEn;
    if (enDelta > 0) {
      const enRegenTotalScale =
        (envMod.enRegenScale || 1.0) *
        (this.loadoutTax?.enRegenPenaltyScale ?? 1.0) *
        playerPartPenalties.enRegenScale;
      this.physics.en = clamp(prevPhysicsEn + enDelta * enRegenTotalScale, 0, this.physics.maxEn);
    } else if (enDelta < 0 && (this.loadoutTax?.boostCostMult ?? 1.0) > 1.01) {
      this.physics.en = clamp(prevPhysicsEn + enDelta * this.loadoutTax.boostCostMult, 0, this.physics.maxEn);
    }
    this.combatUnit = stepUnitCombatResources(
      { ...this.combatUnit, ap: this.playerHp, en: this.physics.en, maxEn: this.physics.maxEn },
      {
        dt,
        boosting: boostAvailable || hoverAvailable || this.overboostSurgeTimer > 0,
        enSpent: Math.max(0, prevPhysicsEn - this.physics.en),
        grounded: this.physics.grounded,
        mapEnvModifiers: envMod,
        inHazardVoid: this.physics.y < -1.5,
        weightTaxScale: (this.loadoutTax?.enRegenPenaltyScale ?? 1.0) * playerPartPenalties.enRegenScale,
        staggerRecoveryRateScale: this.loadoutTax?.staggerRecoveryRateScale ?? 1.0,
      },
    );
    this.playerHp = this.combatUnit.ap;

    // Advance street traffic, simulate flying crushed cars, and stomp-crush intact cars underfoot!
    this.worldCity.stepTrafficAndCrushedCars(dt, {
      physics: this.physics,
      prevVy: this.prevVy,
      score: this.score,
      onCameraShake: (amt) => {
        this.cameraShake = Math.max(this.cameraShake, amt);
      },
    });

    // 5. Scheme A Decoupled Lower-Body Turn + Hydraulic Walk Gait Cycle & Suspension
    const combatActive =
      !this.orbitActive &&
      (this.lmbHeld ||
        this.rmbHeld ||
        this.saberSwingL.active ||
        this.saberSwingR.active ||
        this.pistolRecoil > 0.2 ||
        this.pistolLeftRecoil > 0.2 ||
        this.cameraMode === CAMERA_MODES.FPS_COCKPIT);
    if (!this.orbitActive) {
      const bodyState = stepDecoupledBodyYaw(
        { bodyYaw: this.bodyYaw },
        {
          cameraYaw: this.yaw,
          moveX: worldMoveX,
          moveZ: worldMoveZ,
          isMoving,
          combatActive,
          guardHeld: this.shieldState.barrierActive,
          dt,
        },
      );
      this.bodyYaw = bodyState.bodyYaw;
    }

    const cosB = Math.cos(this.bodyYaw);
    const sinB = Math.sin(this.bodyYaw);
    const bodyFwdInput = -worldMoveX * sinB - worldMoveZ * cosB;
    const bodyStrafeInput = worldMoveX * cosB - worldMoveZ * sinB;

    const horzSpeed = Math.hypot(this.physics.vx, this.physics.vz);
    const rawAccel = (horzSpeed - this.prevHorzSpeed) / Math.max(0.005, dt);
    this.prevHorzSpeed = horzSpeed;
    const targetWalkLean = walkOnly && isMoving ? clamp(rawAccel * 0.22 + bodyFwdInput * 2.4, -3.5, 4.5) : 0;
    this.walkLeanSmooth = lerp(this.walkLeanSmooth, targetWalkLean, 1 - Math.exp(-8 * dt));

    const shouldWalk = walkOnly && isMoving && this.physics.grounded;
    this.walkBlend = lerp(this.walkBlend, shouldWalk ? 1 : 0, 1 - Math.exp(-12 * dt));

    this.footState = stepBipedalFootTrackers(this.footState, {
      bodyX: this.physics.x,
      bodyY: this.physics.y,
      bodyZ: this.physics.z,
      bodyYaw: this.bodyYaw,
      vx: this.physics.vx,
      vz: this.physics.vz,
      wishDirX: worldMoveX,
      wishDirZ: worldMoveZ,
      hasMoveInput: walkOnly && isMoving,
      isGrounded: walkOnly && this.physics.grounded,
      supportY: this.supportHeight,
      dt,
      stanceHalfWidthM: 0.28,
    });

    if (shouldWalk) {
      this.walkPhase += dt * (2.6 + horzSpeed * 0.34);
    }
    if (this.footState.liftedSide) {
      this.audio.playServoLift(this.footState.liftedSide);
    }
    if (this.footState.plantedSide) {
      this.audio.playFootstep(false, this.footState.plantedSide);
      const plantedFoot = this.footState[this.footState.plantedSide];
      this._dustPos.set(plantedFoot.worldX, plantedFoot.worldY + 0.04, plantedFoot.worldZ);
      this.vfx.spawnDust(this._dustPos, 5);
    }

    if (this.physics.grounded && this.prevVy < -2.2) {
      this.audio.playFootstep(true, 'C');
      this.cameraShake = Math.max(this.cameraShake, 0.06);
      this.vfx.spawnLandingShockRing(this._tmpOrigin.set(this.physics.x, this.physics.y + 0.04, this.physics.z));
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
      forwardNorm: bodyFwdInput,
      strafeNorm: bodyStrafeInput,
    });

    const ik = solveGroundFootAlignment({
      pelvisY: clearanceY + 1.04,
      standHeightM: 1.04,
      hipFlareDeg: -1.4,
      hipPitchDeg: walkOnly ? gait.hipPitchLDeg : boostPose.frontHipDeg,
      kneePitchDeg: walkOnly ? gait.kneePitchLDeg : boostPose.frontKneeDeg,
      crouchBlend: crouch,
    });

    const strideBobDropM = this.footState.pelvisDropM * (1 - crouch) * (1 - ik.alphaAir);
    const rootWorldY = this.physics.y + this.suspension.deflectionY - strideBobDropM;

    // 6. Position Mecha Root + Pose Bones
    this.mechaRoot.position.set(
      this.physics.x,
      rootWorldY,
      this.physics.z,
    );
    this.mechaRoot.rotation.set(
      this.skateTiltSmooth.pitchRad * 0.55,
      this.bodyYaw,
      -this.skateTiltSmooth.rollRad,
      'YXZ',
    );

    // 360-deg Continuous Saber Kinetic Chain (independent L & R hands)
    const defaultSaberPose = {
      shoulderXDeg: 26,
      shoulderYDeg: -8,
      shoulderZDeg: 16,
      elbowXDeg: 28,
      wristXDeg: -22,
      wristYDeg: 4,
      wristZDeg: -4,
      torsoTwistDeg: 0,
      torsoPitchDeg: 0,
      lungeWeight: 0,
      swingBoost: 0,
      rightArmRetractDeg: 0,
    };
    this.meleeTiming = stepMeleeTimingState(this.meleeTiming, {
      dt,
      startSlash: Boolean(this._pendingMeleeSlashDir),
      hasSaber: this.weaponState.hasSaber,
      slashDir: this._pendingMeleeSlashDir || this.meleeTiming.slashDir,
      swingDurationSec: 0.44,
    });
    this._pendingMeleeSlashDir = null;

    const _advanceSaberSwing = (sw, mirrorHorizontal = false) => {
      if (!sw.active) return defaultSaberPose;
      sw.t += dt;
      const u = clamp(sw.t / sw.duration, 0, 1);
      const effAngleRad = mirrorHorizontal ? Math.PI - sw.angleRad : sw.angleRad;
      const sp = computeContinuousSaberPose(effAngleRad, u, this.pitch);
      if (!sw.hitRegistered && u >= 0.3) {
        sw.hitRegistered = true;
        const slashCtr = this._tmpSlashCtr.set(
          this.physics.x - Math.sin(this.bodyYaw) * 2.45,
          this.physics.y + 1.3,
          this.physics.z - Math.cos(this.bodyYaw) * 2.45,
        );
        const rivalActive = Boolean(this.rivalRig?.active && this.rivalRig.physics);
        if (rivalActive) {
          const rPhys = this.rivalRig.physics;
          const distToRival = Math.hypot(rPhys.x - this.physics.x, rPhys.z - this.physics.z);
          const meleeRes = resolveMeleeEncounter({
            attackerSwing: this.meleeTiming,
            attackerHasSaber: this.weaponState.hasSaber,
            defenderSwing: this.rivalRig.meleeTiming,
            defenderHasSaber: !computePartStatusPenalties(this.rivalRig.partDamage).armRDisabled,
            defenderShield: this.rivalRig.shieldState,
            defenderShieldDef: this.rivalRig.getShieldDef(),
            baseMeleeDmg: 720,
            saberVsShieldSpDrain: 33,
            distanceM: distToRival,
            reachM: 3.8,
            frontDot: 1.0,
          });
          if (meleeRes.outcome === 'saber_clash' || meleeRes.outcome === 'active_blade_parry') {
            this.hitstopTimer = Math.max(this.hitstopTimer, meleeRes.hitstopSec || SABER_CLASH_HITSTOP_SEC);
            this.cameraShake = Math.max(this.cameraShake, 0.085);
            this.parryRecoil = { active: true, t: 0, duration: 0.32 };
            this.audio.playShieldParry(true);
            this.vfx.spawnSparks(slashCtr, '#ffe86b', 20, 10);
            this.vfx.spawnLandingShockRing(slashCtr);
            this.ui.showCombatCallout?.(
              meleeRes.outcome === 'saber_clash' ? 'SABER CLASH!!' : 'BLADE PARRY!!',
              'clash',
            );
            this._recordDuelEvent(
              meleeRes.outcome === 'saber_clash' ? MATCH_EVENT_TYPES.SABER_CLASH : MATCH_EVENT_TYPES.PARRY,
              'player',
              meleeRes.outcome === 'saber_clash' ? '光劍交鋒衝擊 SABER CLASH' : '敵機揮刀相殺格擋',
            );
          } else if (meleeRes.outcome === 'shield_parry') {
            this.rivalRig.shieldState = markShieldBlockOrParry(this.rivalRig.shieldState, { isParry: true });
            this.parryRecoil = { active: true, t: 0, duration: 0.34 };
            this.audio.playShieldParry(true);
            this.vfx.spawnSparks(slashCtr, '#ff99aa', 16, 8);
            this.ui.showCombatCallout?.('ENEMY SHIELD PARRY', 'clash', 1.2);
            this._recordDuelEvent(MATCH_EVENT_TYPES.PARRY, 'enemy', '敵機成功盾反光劍斬擊');
          } else if (meleeRes.outcome === 'saber_vs_shield' || meleeRes.outcome === 'shield_block') {
            this.rivalRig.shieldState = markShieldBlockOrParry(this.rivalRig.shieldState, { isParry: false });
            const nextSp = Math.max(0, (this.rivalRig.shieldState.shieldSp ?? 100) - (meleeRes.spDrain || 33));
            this.rivalRig.shieldState.shieldSp = nextSp;
            this.rivalRig.shieldState.regenDelaySec = 0.45;
            this.audio.playShieldParry(false);
            if (nextSp <= 0) {
              this.rivalRig.shieldState.overheated = true;
              this.rivalRig.shieldState.barrierActive = false;
              this.rivalRig.shieldState.cooldownRemainingSec = 2.0;
              this.vfx.spawnSparks(slashCtr, '#ff6848', 22, 11);
              this.ui.showCombatCallout?.('ENEMY GUARD BREAK!!', 'break', 1.5);
              this._recordDuelEvent(MATCH_EVENT_TYPES.GUARD_BREAK, 'player', '光劍重斬擊破敵機能量護盾');
            } else {
              this.vfx.spawnSparks(slashCtr, '#ff4d6d', 10, 6);
            }
          } else if (meleeRes.outcome === 'melee_hit' && meleeRes.damageToDefender > 0) {
            const hitRes = this.rivalRig.handleIncomingPlayerMelee(
              meleeRes.damageToDefender,
              meleeRes.acsDamageToDefender || 28,
              { slashDir: sw.dir, slashPos: slashCtr },
            );
            this.duelDamageDealt += hitRes.finalDamage;
            if (hitRes.hitstopSec > 0) this.hitstopTimer = Math.max(this.hitstopTimer, hitRes.hitstopSec);
            this.cameraShake = Math.max(this.cameraShake, 0.055);
            this.vfx.spawnSparks(slashCtr, '#76ffdf', 16, 8);
            this.audio.playBulletHit('metal');
            if (hitRes.severedArm || hitRes.partBrokenNow) {
              this._handleSubPartDestroyedEvent({
                target: 'rival',
                partId: hitRes.hitPartId,
                severedArm: hitRes.severedArm,
                severedDebris: hitRes.severedDebris,
                stumpPos: hitRes.stumpPos,
                brokenNow: hitRes.partBrokenNow,
              });
            }
            if (meleeRes.defenderKnockback > 0) {
              const awayX = rPhys.x - this.physics.x;
              const awayZ = rPhys.z - this.physics.z;
              const len = Math.max(0.01, Math.hypot(awayX, awayZ));
              rPhys.vx += (awayX / len) * meleeRes.defenderKnockback;
              rPhys.vz += (awayZ / len) * meleeRes.defenderKnockback;
            }
            if (hitRes.staggeredNow) {
              this.ui.showCombatCallout?.('ENEMY STAGGERED 200%!!', 'stagger', 1.6);
              this._recordDuelEvent(MATCH_EVENT_TYPES.STAGGER, 'player', '光劍斬擊觸發敵機 STAGGER (200% 承傷)');
            }
          }
          this._applyDamageInSphere(slashCtr, 2.5, 68, true, { slashDir: sw.dir });
        } else {
          const dummyPos = this.dummy?.group?.position;
          const distToDummy = dummyPos
            ? Math.hypot(dummyPos.x - this.physics.x, dummyPos.z - this.physics.z)
            : Infinity;
          const meleeRes = resolveMeleeEncounter({
            attackerSwing: this.meleeTiming,
            attackerHasSaber: this.weaponState.hasSaber,
            defenderSwing: null,
            defenderHasSaber: false,
            baseMeleeDmg: 68,
            distanceM: distToDummy,
            reachM: 3.6,
            frontDot: 1.0,
          });
          if (meleeRes.outcome === 'saber_clash' || meleeRes.outcome === 'active_blade_parry') {
            this.hitstopTimer = Math.max(this.hitstopTimer, meleeRes.hitstopSec || SABER_CLASH_HITSTOP_SEC);
            this.cameraShake = Math.max(this.cameraShake, 0.08);
            this.parryRecoil = { active: true, t: 0, duration: 0.32 };
            this.ui.showCombatCallout?.(
              meleeRes.outcome === 'saber_clash' ? 'SABER CLASH!!' : 'BLADE PARRY!!',
              'clash',
            );
          } else {
            this._applyDamageInSphere(
              slashCtr,
              2.5,
              meleeRes.outcome === 'melee_hit' ? meleeRes.damageToDefender : 68,
              true,
              { slashDir: sw.dir },
            );
          }
        }
      }
      if (u >= 1) sw.active = false;
      return sp;
    };

    const poseL = _advanceSaberSwing(this.saberSwingL, false);
    const poseR = _advanceSaberSwing(this.saberSwingR, true);
    this._activeSaberSwingBoost = Math.max(poseL.swingBoost || 0, poseR.swingBoost || 0);
    if (!this.saberSwingL.active && !this.saberSwingR.active && this._queuedSaberHand) {
      const nextHand = this._queuedSaberHand;
      this._queuedSaberHand = null;
      this._startSaberSlash(nextHand);
    }
    const slashTorsoTwist = this.saberSwingL.active ? poseL.torsoTwistDeg : this.saberSwingR.active ? -poseR.torsoTwistDeg : 0;
    const slashTorsoPitch = Math.max(poseL.torsoPitchDeg, poseR.torsoPitchDeg);
    const lungeWeight = Math.max(poseL.lungeWeight, poseR.lungeWeight);
    const rightArmRetractDeg = poseL.rightArmRetractDeg;

    let recoilPose = { torsoPitchDeg: 0, torsoTwistDeg: 0, armRecoilDeg: 0, shoulderZDeg: 0, pelvisPitchDeg: 0 };
    if (this.parryRecoil.active) {
      this.parryRecoil.t += dt;
      const ru = clamp(this.parryRecoil.t / this.parryRecoil.duration, 0, 1);
      recoilPose = computeParryRecoilPose(ru);
      if (ru >= 1) this.parryRecoil.active = false;
    }

    const lHandType = this.loadoutPreset.lHand;
    const rHandType = this.loadoutPreset.rHand;
    const hasAnyShield = lHandType === 'shield' || rHandType === 'shield';
    const gBlend = hasAnyShield ? this.shieldState.guardBlend : 0;
    const aimPose = computeUpperBodyAimPose({
      cameraYaw: this.yaw,
      bodyYaw: this.bodyYaw,
      cameraPitch: this.pitch,
      guardActive: hasAnyShield && this.shieldState.barrierActive,
      shieldSide: handActions.shieldSide || 'left',
    });
    this._aimPose = aimPose;

    const lungeW = lungeWeight * (1 - crouch) * (1 - ik.alphaAir);
    const groundIkW = (walkOnly && this.physics.grounded ? 1 : 0) * (1 - crouch) * (1 - ik.alphaAir) * (1 - lungeW);
    const aimW = (1 - crouch) * (1 - lungeW * 0.75);
    const activeShiftXM = lerp(gait.pelvisShiftXM, this.footState.pelvisShiftXM, groundIkW);
    const activePelvisRollDeg = lerp(gait.pelvisRollDeg, this.footState.pelvisRollDeg, groundIkW);

    if (this.bones.Pelvis?.userData.restPos) {
      this.bones.Pelvis.position.copy(this.bones.Pelvis.userData.restPos);
      // Under model.rotation.y = PI, local +X maps to World LEFT, so subtract pelvisShiftXM to shift weight onto stance foot
      this.bones.Pelvis.position.x -= activeShiftXM * (1 - crouch) * (1 - ik.alphaAir) * (1 - lungeW);
      this.bones.Pelvis.position.y -= ik.pelvisDropM + lungeW * 0.16;
    }

    const idleBreathPitch = !shouldWalk && !this.saberSwingL.active && !this.saberSwingR.active ? Math.sin(now * 0.0022) * 0.8 : 0;
    const pelvisBaseYaw = lerp(gait.pelvisYawDeg * (1 - groundIkW), -5, (1 - this.walkBlend) * (1 - crouch)) + aimPose.pelvisYawDeg * aimW;
    this._poseBone('Pelvis', 4 + crouch * 8 + lungeW * 12 + recoilPose.pelvisPitchDeg, lerp(pelvisBaseYaw, -16, lungeW), activePelvisRollDeg * (1 - lungeW));
    this._poseBone(
      'Torso',
      lerp(6 + this.walkLeanSmooth + (gait.torsoPitchBobDeg || 0) - aimPose.torsoPitchAimDeg * aimW + slashTorsoPitch + idleBreathPitch + recoilPose.torsoPitchDeg, 34, crouch),
      lerp(gait.torsoTwistDeg * (1 - groundIkW * 0.45) + aimPose.torsoYawDeg * aimW + slashTorsoTwist + recoilPose.torsoTwistDeg, 4, crouch),
      -activePelvisRollDeg * 0.45 * (1 - lungeW),
    );
    this._poseBone(
      'Head',
      lerp(-4 - aimPose.headPitchDeg * (1 - lungeW * 0.5) + idleBreathPitch * 0.5 - recoilPose.torsoPitchDeg * 0.45, -24, crouch),
      lerp(-4 + aimPose.headYawDeg * aimW, -8, lungeW),
      0,
    );

    // Legs + Anti-clipping Front Skirts + Narrow 5.5° Heroic Stance + World-Locked FootTracker 2-Bone IK
    const hipOff = this.legMetrics.hipOffsetX;
    const shiftWorld = activeShiftXM * (1 - crouch) * (1 - ik.alphaAir) * (1 - lungeW);
    const hipY = rootWorldY + this.legMetrics.hipRestY - (ik.pelvisDropM + lungeW * 0.16);
    this._hipWorldL.x = this.physics.x + (-hipOff + shiftWorld) * cosB;
    this._hipWorldL.y = hipY;
    this._hipWorldL.z = this.physics.z - (-hipOff + shiftWorld) * sinB;
    this._hipWorldR.x = this.physics.x + (hipOff + shiftWorld) * cosB;
    this._hipWorldR.y = hipY;
    this._hipWorldR.z = this.physics.z - (hipOff + shiftWorld) * sinB;

    this._footWorldL.x = this.footState.L.worldX;
    this._footWorldL.y = this.footState.L.worldY;
    this._footWorldL.z = this.footState.L.worldZ;
    this._footWorldR.x = this.footState.R.worldX;
    this._footWorldR.y = this.footState.R.worldY;
    this._footWorldR.z = this.footState.R.worldZ;

    const legIkL = solveTwoBoneLegIK({
      side: 'L',
      hipWorld: this._hipWorldL,
      footWorld: this._footWorldL,
      bodyYaw: this.bodyYaw,
      L1: this.legMetrics.L1,
      L2: this.legMetrics.L2,
      ankleHeightM: this.legMetrics.ankleHeightM,
      restFlareDeg: this.legMetrics.restFlareDeg,
      pitchCueDeg: this.footState.L.pitchCueDeg || 0,
    });
    const legIkR = solveTwoBoneLegIK({
      side: 'R',
      hipWorld: this._hipWorldR,
      footWorld: this._footWorldR,
      bodyYaw: this.bodyYaw,
      L1: this.legMetrics.L1,
      L2: this.legMetrics.L2,
      ankleHeightM: this.legMetrics.ankleHeightM,
      restFlareDeg: this.legMetrics.restFlareDeg,
      pitchCueDeg: this.footState.R.pitchCueDeg || 0,
    });

    this._poseBone(
      'FrontSkirt_L',
      Math.max(ik.frontSkirtPitchDeg, lerp(12, 12 + Math.max(0, legIkL.hipPitchDeg) * 0.72, groundIkW), lungeW * 48),
      -4,
      lerp(ik.frontSkirtFlareDeg, 4 + Math.max(0, legIkL.hipRollDeltaDeg) * 0.5, groundIkW),
    );
    this._poseBone(
      'FrontSkirt_R',
      Math.max(ik.frontSkirtPitchDeg, lerp(12, 12 + Math.max(0, legIkR.hipPitchDeg) * 0.72, groundIkW)),
      4,
      lerp(-ik.frontSkirtFlareDeg, -4 - Math.max(0, legIkR.hipRollDeltaDeg) * 0.5, groundIkW),
    );

    this._poseBone(
      'Leg_Upper_L',
      lerp(lerp(ik.hipPitchDeg, 36, lungeW), legIkL.hipPitchDeg, groundIkW),
      lerp(-3, 0, groundIkW),
      lerp(ik.hipFlareDeg, legIkL.hipRollAppliedZDeg, groundIkW),
    );
    this._poseBone('Leg_Lower_L', lerp(lerp(ik.kneePitchDeg, -48, lungeW), legIkL.kneePitchDeg, groundIkW), 0, 0);
    this._poseBone(
      'Foot_L',
      lerp(lerp(ik.anklePitchDeg, 12, lungeW), legIkL.anklePitchDeg, groundIkW),
      0,
      lerp(ik.ankleRollLDeg, legIkL.ankleRollZDeg, groundIkW),
    );

    const airOrCrouchHipR = lerp(boostPose.backHipDeg, ik.hipPitchDeg, Math.max(crouch, ik.alphaAir));
    const airOrCrouchKneeR = lerp(boostPose.backKneeDeg, ik.kneePitchDeg, Math.max(crouch, ik.alphaAir));
    const airOrCrouchAnkleR = lerp(boostPose.ankleBackDeg, ik.anklePitchDeg, Math.max(crouch, ik.alphaAir));

    this._poseBone(
      'Leg_Upper_R',
      lerp(lerp(airOrCrouchHipR, -24, lungeW), legIkR.hipPitchDeg, groundIkW),
      lerp(3, 0, groundIkW),
      lerp(-ik.hipFlareDeg, legIkR.hipRollAppliedZDeg, groundIkW),
    );
    this._poseBone('Leg_Lower_R', lerp(lerp(airOrCrouchKneeR, -14, lungeW), legIkR.kneePitchDeg, groundIkW), 0, 0);
    this._poseBone(
      'Foot_R',
      lerp(lerp(lerp(airOrCrouchAnkleR, ik.anklePitchDeg, Math.max(crouch, ik.alphaAir)), 38, lungeW), legIkR.anklePitchDeg, groundIkW),
      0,
      lerp(ik.ankleRollRDeg, legIkR.ankleRollZDeg, groundIkW),
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

    // Adaptive BGM intensity: smoothly ramps up with combat speed, ACS strain, stagger, or low AP
    const playerAcsPct = (this.combatUnit.acs || 0) / Math.max(1, this.combatUnit.maxAcs || 1);
    const rivalUnit = this.rivalRig?.combatUnit;
    const rivalAcsPct = rivalUnit ? (rivalUnit.acs || 0) / Math.max(1, rivalUnit.maxAcs || 1) : 0;
    const playerLowAp = 1 - clamp((this.combatUnit.ap || 0) / Math.max(1, this.combatUnit.maxAp || 1), 0, 1);
    const anyStagger = (this.combatUnit.staggerRemainingSec || 0) > 0 || (rivalUnit?.staggerRemainingSec || 0) > 0;
    const targetBgmIntensity = inMainMenu
      ? 0.2
      : anyStagger
        ? 1.0
        : clamp(Math.max(playerAcsPct, rivalAcsPct, playerLowAp * 0.85, this.duelMatch ? 0.4 : 0.22), 0, 1);
    this._bgmIntensitySmooth = lerp(this._bgmIntensitySmooth || 0.2, targetBgmIntensity, 1 - Math.exp(-3.5 * dt));
    this.audio.setBgmIntensity?.(this._bgmIntensitySmooth);

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
        if (tp.outerMat?.uniforms?.uTime) tp.outerMat.uniforms.uTime.value = timeSec;
        if (tp.outerMat?.uniforms?.uIntensity) tp.outerMat.uniforms.uIntensity.value = this.jetIntensitySmooth;
        if (tp.coreMat?.uniforms?.uTime) tp.coreMat.uniforms.uTime.value = timeSec;
        if (tp.coreMat?.uniforms?.uIntensity) tp.coreMat.uniforms.uIntensity.value = this.jetIntensitySmooth;
        if (Math.random() < 0.38 && i < 2) {
          const wp = this._tmpPlumePos;
          const wd = this._tmpPlumeDir.copy(tp.localDir).transformDirection(tp.rig.matrixWorld);
          tp.rig.getWorldPosition(wp);
          this.vfx.spawnThrusterEmber(wp, wd, '#ff6818', 1);
        }
      } else {
        tp.rig.visible = false;
      }
    }

    // 8. Arms & Weapon Pose (Symmetric Dual-Wield Loadout + Solved Physical Arm-Carried Shield + Yield Clearance)
    const recoilKickR = this.pistolRecoil * 14;
    const recoilKickL = this.pistolLeftRecoil * 14;
    const yieldOffsetR = Math.max(
      this.saberSwingL.active ? rightArmRetractDeg * (1 - crouch) : 0,
      lHandType === 'shield' ? gBlend * 16 * (1 - crouch) : 0,
    );
    const yieldOffsetL = Math.max(
      this.saberSwingR.active ? poseR.rightArmRetractDeg * (1 - crouch) : 0,
      rHandType === 'shield' ? gBlend * 16 * (1 - crouch) : 0,
    );

    const shAimW = lerp(0.35, 1.0, gBlend) * (1 - crouch);
    const gunAimW = 1 - crouch;

    // Solved physical arm-adduction guard pose (Upper: 54,-10,-22 / Lower: 10,15,0) brings hand cleanly across sternum
    const shUpperX = lerp(24, 54, gBlend) + recoilPose.armRecoilDeg * 0.45;
    const shUpperYAbs = lerp(4, 10, gBlend);
    const shUpperZLeft = lerp(18, -22, gBlend) + recoilPose.shoulderZDeg * 0.4;
    const shLowerX = lerp(26, 10, gBlend);
    const shLowerYAbs = lerp(6, 15, gBlend);
    const shLowerZAbs = 0;

    const dropPoseR = computeWeaponDropArmPose(this.weaponState, 'R');
    const dropPoseL = computeWeaponDropArmPose(this.weaponState, 'L');
    const hasRArmPistol = rHandType === 'pistol' && this.weaponState.hasPistol;
    const hasRArmSaber = rHandType === 'saber' && this.weaponState.hasSaber;
    const hasLArmPistol = lHandType === 'pistol' && this.weaponState.hasPistol;
    const hasLArmSaber = lHandType === 'saber' && this.weaponState.hasSaber;

    if (dropPoseR.active) {
      this._poseBone('Arm_Upper_R', dropPoseR.shoulderXDeg, dropPoseR.shoulderYDeg, dropPoseR.shoulderZDeg);
      this._poseBone('Arm_Lower_R', dropPoseR.elbowXDeg, 4, 4);
      this._poseBone('Hand_R', dropPoseR.wristXDeg, 0, dropPoseR.wristZDeg);
      this._poseBone('Fingers_Pivot_R', dropPoseR.fingerOpenDeg, 0, 0);
      this._poseBone('Thumb_Pivot_R', 0, 0, dropPoseR.thumbOpenDeg);
    } else if (hasRArmSaber) {
      this._poseBone(
        'Arm_Upper_R',
        lerp(poseR.shoulderXDeg + recoilPose.armRecoilDeg * 0.6, 56, crouch),
        lerp(-poseR.shoulderYDeg, -4, crouch),
        lerp(-poseR.shoulderZDeg - recoilPose.shoulderZDeg * 0.5, -14, crouch),
      );
      this._poseBone('Arm_Lower_R', lerp(poseR.elbowXDeg + recoilPose.armRecoilDeg * 0.4, 12, crouch), lerp(6, 4, crouch), lerp(6, 8, crouch));
      this._poseBone('Hand_R', lerp(poseR.wristXDeg, -8, crouch), lerp(-poseR.wristYDeg, 0, crouch), lerp(-poseR.wristZDeg, 4, crouch));
      this._poseBone('Fingers_Pivot_R', 0, 0, 0);
      this._poseBone('Thumb_Pivot_R', 0, 0, 0);
    } else if (rHandType === 'shield') {
      this._poseBone(
        'Arm_Upper_R',
        lerp(shUpperX + aimPose.shieldPitchDeg * shAimW + gait.armSwingDeg * 0.25, 58, crouch),
        lerp(shUpperYAbs, -4, crouch),
        lerp(-shUpperZLeft + aimPose.shieldYawDeg * shAimW, -14, crouch),
      );
      this._poseBone('Arm_Lower_R', lerp(shLowerX, 12, crouch), lerp(-shLowerYAbs, 0, crouch), lerp(shLowerZAbs, 8, crouch));
      this._poseBone('Hand_R', 0, 0, 0);
      this._poseBone('Fingers_Pivot_R', 0, 0, 0);
      this._poseBone('Thumb_Pivot_R', 0, 0, 0);
    } else if (hasRArmPistol) {
      this._poseBone(
        'Arm_Upper_R',
        lerp(52 + aimPose.gunPitchDeg * 1.05 * gunAimW + recoilKickR + gait.weaponStompDipDeg - yieldOffsetR * 0.65 + recoilPose.armRecoilDeg * 0.5, 56, crouch),
        lerp(-8 - yieldOffsetR * 0.45, -4, crouch),
        lerp(-12 + aimPose.gunYawDeg * gunAimW - yieldOffsetR * 0.8 - recoilPose.shoulderZDeg * 0.35, -14, crouch),
      );
      this._poseBone('Arm_Lower_R', lerp(20 + recoilKickR * 0.5 + yieldOffsetR * 0.8, 12, crouch), 4, lerp(4, 8, crouch));
      this._poseBone('Hand_R', 0, 0, 0);
      this._poseBone('Fingers_Pivot_R', 0, 0, 0);
      this._poseBone('Thumb_Pivot_R', 0, 0, 0);
    } else {
      // Unarmed natural arm swing & relaxed finger open curl
      this._poseBone('Arm_Upper_R', lerp(10 - gait.armSwingDeg * 0.85, 56, crouch), lerp(-4, -4, crouch), lerp(-10, -14, crouch));
      this._poseBone('Arm_Lower_R', lerp(20 + Math.abs(gait.armSwingDeg) * 0.25, 12, crouch), 4, lerp(4, 8, crouch));
      this._poseBone('Hand_R', 0, 0, 0);
      this._poseBone('Fingers_Pivot_R', -16, 0, 0);
      this._poseBone('Thumb_Pivot_R', 0, 0, -10);
    }

    if (dropPoseL.active) {
      this._poseBone('Arm_Upper_L', dropPoseL.shoulderXDeg, dropPoseL.shoulderYDeg, dropPoseL.shoulderZDeg);
      this._poseBone('Arm_Lower_L', dropPoseL.elbowXDeg, -4, -4);
      this._poseBone('Hand_L', dropPoseL.wristXDeg, 0, dropPoseL.wristZDeg);
      this._poseBone('Fingers_Pivot_L', dropPoseL.fingerOpenDeg, 0, 0);
      this._poseBone('Thumb_Pivot_L', 0, 0, dropPoseL.thumbOpenDeg);
    } else if (lHandType === 'shield') {
      this._poseBone(
        'Arm_Upper_L',
        lerp(shUpperX + aimPose.shieldPitchDeg * shAimW + gait.armSwingDeg * 0.25, 58, crouch),
        lerp(-shUpperYAbs, 4, crouch),
        lerp(shUpperZLeft + aimPose.shieldYawDeg * shAimW, 14, crouch),
      );
      this._poseBone('Arm_Lower_L', lerp(shLowerX, 12, crouch), lerp(shLowerYAbs, 0, crouch), lerp(-shLowerZAbs, -8, crouch));
      this._poseBone('Hand_L', 0, 0, 0);
      this._poseBone('Fingers_Pivot_L', 0, 0, 0);
      this._poseBone('Thumb_Pivot_L', 0, 0, 0);
    } else if (hasLArmPistol) {
      this._poseBone(
        'Arm_Upper_L',
        lerp(52 + aimPose.gunPitchDeg * 1.05 * gunAimW + recoilKickL + gait.weaponStompDipDeg - yieldOffsetL * 0.65 + recoilPose.armRecoilDeg * 0.5, 58, crouch),
        lerp(8 + yieldOffsetL * 0.45, 4, crouch),
        lerp(12 + aimPose.gunYawDeg * gunAimW + yieldOffsetL * 0.8 + recoilPose.shoulderZDeg * 0.35, 14, crouch),
      );
      this._poseBone('Arm_Lower_L', lerp(20 + recoilKickL * 0.5 + yieldOffsetL * 0.8, 12, crouch), -4, lerp(-4, -8, crouch));
      this._poseBone('Hand_L', 0, 0, 0);
      this._poseBone('Fingers_Pivot_L', 0, 0, 0);
      this._poseBone('Thumb_Pivot_L', 0, 0, 0);
    } else if (hasLArmSaber) {
      this._poseBone(
        'Arm_Upper_L',
        lerp(poseL.shoulderXDeg + gait.armSwingDeg * 0.4 + recoilPose.armRecoilDeg * 0.5, 58, crouch),
        lerp(poseL.shoulderYDeg, 4, crouch),
        lerp(poseL.shoulderZDeg + recoilPose.shoulderZDeg * 0.4, 14, crouch),
      );
      this._poseBone('Arm_Lower_L', lerp(poseL.elbowXDeg, 12, crouch), lerp(-6, 0, crouch), lerp(-6, -8, crouch));
      this._poseBone('Hand_L', lerp(poseL.wristXDeg, -8, crouch), lerp(poseL.wristYDeg, 0, crouch), lerp(poseL.wristZDeg, -4, crouch));
      this._poseBone('Fingers_Pivot_L', 0, 0, 0);
      this._poseBone('Thumb_Pivot_L', 0, 0, 0);
    } else {
      // Unarmed natural arm swing & relaxed finger open curl
      this._poseBone('Arm_Upper_L', lerp(10 + gait.armSwingDeg * 0.85, 58, crouch), lerp(4, 4, crouch), lerp(10, 14, crouch));
      this._poseBone('Arm_Lower_L', lerp(20 + Math.abs(gait.armSwingDeg) * 0.25, 12, crouch), -4, lerp(-4, -8, crouch));
      this._poseBone('Hand_L', 0, 0, 0);
      this._poseBone('Fingers_Pivot_L', -16, 0, 0);
      this._poseBone('Thumb_Pivot_L', 0, 0, 10);
    }

    // Shield stays welded to forearm/wrist mount (zero floating detach!); minor forward brace clearance only
    const pushAmount = aimPose.shieldForwardPushM * 0.35 * gBlend * (1 - crouch);
    if (this.shieldNodes.group?.userData.baseLocalPos && this.shieldNodes.group.userData.forwardPushLocal) {
      const uData = this.shieldNodes.group.userData;
      this.shieldNodes.group.position.copy(uData.baseLocalPos);
      this.shieldNodes.group.position.addScaledVector(uData.forwardPushLocal, pushAmount);
    }
    if (this.shieldNodes.rightGroup?.userData.baseLocalPos && this.shieldNodes.rightGroup.userData.forwardPushLocal) {
      const uDataR = this.shieldNodes.rightGroup.userData;
      this.shieldNodes.rightGroup.position.copy(uDataR.baseLocalPos);
      this.shieldNodes.rightGroup.position.addScaledVector(uDataR.forwardPushLocal, pushAmount);
    }

    const showBarrierAny =
      hasAnyShield && !shieldArmDisabled && (this.shieldState.guardBlend > 0.05 || this.shieldState.flashTimer > 0);
    const barrierOpacity = clamp(
      Math.max(this.shieldState.guardBlend * 0.82, this.shieldState.flashTimer * 2.8),
      0,
      0.95,
    );
    const barrierFlash = clamp(this.shieldState.flashTimer / 0.28, 0, 1);
    const covMode = activeShieldDef.coverageMode || (activeShieldDef.isFullDome ? 'full_sphere' : 'hemisphere');
    const isBucklerMode = covMode === 'buckler_disc';
    const isRectMode = covMode === 'rect_tower';
    const isDirectionalMode = covMode === 'hemisphere' || covMode === 'diamond_quadrant';
    const aimLocalYawRad = (aimPose.pelvisYawDeg + aimPose.torsoYawDeg + aimPose.shieldYawDeg) * DEG2RAD;
    const aimLocalPitchRad = aimPose.shieldPitchDeg * DEG2RAD;

    if (this.shieldNodes.barrierMesh && this.shieldNodes.barrierMat) {
      const showBucklerL = showBarrierAny && isBucklerMode && lHandType === 'shield';
      this.shieldNodes.barrierMesh.visible = showBucklerL;
      if (showBucklerL) {
        this.shieldNodes.barrierMat.uniforms.uTime.value = timeSec;
        this.shieldNodes.barrierMat.uniforms.uOpacity.value = barrierOpacity;
        this.shieldNodes.barrierMat.uniforms.uFlash.value = barrierFlash;
      }
    }
    if (this.shieldNodes.rightBarrierMesh && this.shieldNodes.rightBarrierMat) {
      const showBucklerR = showBarrierAny && isBucklerMode && rHandType === 'shield';
      this.shieldNodes.rightBarrierMesh.visible = showBucklerR;
      if (showBucklerR) {
        this.shieldNodes.rightBarrierMat.uniforms.uTime.value = timeSec;
        this.shieldNodes.rightBarrierMat.uniforms.uOpacity.value = barrierOpacity;
        this.shieldNodes.rightBarrierMat.uniforms.uFlash.value = barrierFlash;
      }
    }
    if (this.shieldNodes.rectPivotGroup && this.shieldNodes.rectBarrierMesh && this.shieldNodes.rectBarrierMat) {
      const showRect = showBarrierAny && isRectMode;
      this.shieldNodes.rectBarrierMesh.visible = showRect;
      if (showRect) {
        this.shieldNodes.rectPivotGroup.rotation.set(aimLocalPitchRad, aimLocalYawRad, 0, 'YXZ');
        this.shieldNodes.rectBarrierMat.uniforms.uTime.value = timeSec;
        this.shieldNodes.rectBarrierMat.uniforms.uOpacity.value = barrierOpacity;
        this.shieldNodes.rectBarrierMat.uniforms.uFlash.value = barrierFlash;
      }
    }
    if (this.shieldNodes.directionalDomeMesh && this.shieldNodes.directionalDomeMat) {
      const showDirDome = showBarrierAny && isDirectionalMode;
      this.shieldNodes.directionalDomeMesh.visible = showDirDome;
      if (showDirDome) {
        this.shieldNodes.directionalDomeMesh.rotation.set(aimLocalPitchRad, aimLocalYawRad, 0, 'YXZ');
        this.shieldNodes.directionalDomeMat.uniforms.uTime.value = timeSec;
        this.shieldNodes.directionalDomeMat.uniforms.uOpacity.value = barrierOpacity;
        this.shieldNodes.directionalDomeMat.uniforms.uFlash.value = barrierFlash;
      }
    }
    if (this.shieldNodes.fullDomeMesh && this.shieldNodes.fullDomeMat) {
      const showFullDome = showBarrierAny && Boolean(activeShieldDef.isFullDome);
      this.shieldNodes.fullDomeMesh.visible = showFullDome;
      if (showFullDome) {
        this.shieldNodes.fullDomeMat.uniforms.uTime.value = timeSec;
        this.shieldNodes.fullDomeMat.uniforms.uOpacity.value = barrierOpacity;
        this.shieldNodes.fullDomeMat.uniforms.uFlash.value = barrierFlash;
      }
    }

    this.mechaRoot.updateMatrixWorld(true);
    if (this.pendingPlayerShots.length > 0) {
      while (this.pendingPlayerShots.length > 0) {
        this._spawnPlayerPistolProjectile(this.pendingPlayerShots.shift());
      }
    }

    // 9. Tapered, Flickering Coaxial Plasma Saber & HDR Plasma Ribbon Trail
    const swingBoost = this._activeSaberSwingBoost || 0;
    if (this.saberFx.coreMat?.uniforms?.uTime) {
      this.saberFx.coreMat.uniforms.uTime.value = timeSec;
    }
    if (this.saberFx.coreMat?.uniforms?.uSwingBoost) {
      this.saberFx.coreMat.uniforms.uSwingBoost.value = swingBoost;
    }
    if (this.saberFx.auraMat?.uniforms?.uTime) {
      this.saberFx.auraMat.uniforms.uTime.value = timeSec;
    }
    if (this.saberFx.auraMat?.uniforms?.uSwingBoost) {
      this.saberFx.auraMat.uniforms.uSwingBoost.value = swingBoost;
    }
    this.vfx.setSaberTrailState(swingBoost, timeSec);
    if (this.weaponNodes.saberBlade && this.saberFx.light) {
      const lit = this.weaponState.hasSaber && this.weaponState.saberIgnited;
      this.saberFx.light.intensity = lit
        ? 0.62 + 0.95 * swingBoost + 0.14 * Math.sin(now * 0.048) + 0.08 * Math.sin(now * 0.117)
        : 0;
    }

    if (this.weaponNodes.saberBlade && (this.saberSwingL.active || this.saberSwingR.active) && this.weaponState.saberIgnited) {
      const useRightTrail = this.saberSwingR.active && (!this.saberSwingL.active || rHandType === 'saber');
      const saberRef =
        useRightTrail && (this.shieldNodes.saberRightBlade || this.shieldNodes.saberRightGroup)
          ? (this.shieldNodes.saberRightBlade || this.shieldNodes.saberRightGroup)
          : this.weaponNodes.saberBlade;
      const rootPos = saberRef.localToWorld(this._tmpRootPos.copy(this.saberFx.baseLocal));
      const tipPos = saberRef.localToWorld(this._tmpTipPos.copy(this.saberFx.tipLocal));
      this.vfx.pushSaberTrailSample(rootPos, tipPos, true);
    } else {
      this.vfx.pushSaberTrailSample(null, null, false);
    }

    // 10. Projectiles, Destructibles & 1v1 Rival Duel Loop
    this.vfx.update(dt, (prev, cur, dmg, proj) => this._handleProjectileStep(prev, cur, dmg, proj));
    this._updateDestructiblesAndDummy(dt, { freezeDummyFire: inMainMenu });
    if (!inMainMenu && this.duelMatch) {
      this._stepDuelLoop(dt, activeShieldDef);
    }

    // 11. Camera Mode (Main Menu Hangar Showcase <-> FPS Cockpit <-> Front-Inspect Orbit <-> TPS Over-Shoulder)
    // 11. Camera Mode (Main Menu Hangar Showcase <-> FPS Cockpit <-> Front-Inspect Orbit <-> TPS Over-Shoulder)
    this.cameraRig.stepCameraAndPins(dt, now, {
      inMainMenu,
      menuState: this.menuState,
      quickBoost,
      physics: this.physics,
      bodyYaw: this.bodyYaw,
      yaw: this.yaw,
      pitch: this.pitch,
      crouch,
      guardBlend: gBlend,
      cameraShake: this.cameraShake,
      fwdInput,
      strafe,
      pistolRecoil: this.pistolRecoil,
      onUpdateArmoryPins: (pins) => this.ui.onUpdateArmoryPins?.(pins),
      onUpdateCockpitScreens: () => this._updateCockpitScreens(dt, now),
    });

    // 12. Push Telemetry
    this.ui.onTickHud?.({
      dt,
      en: this.physics.en,
      maxEn: this.physics.maxEn,
      playerHp: this.playerHp,
      playerMaxHp: this.playerMaxHp,
      acsStagger: this.combatUnit.acs,
      acsMax: this.combatUnit.maxAcs,
      staggered: staggerLocked,
      staggerRemainingSec: this.combatUnit.staggerRemainingSec || 0,
      mapEnvId: envMod.hazardId && envMod.hazardId !== 'NONE' ? envMod.hazardId : (this.menuState?.previewMapId || 'MAP-01'),
      speedMps: horzSpeed,
      altM: this.physics.y,
      twr: this.massThrust.twr,
      loadoutTax: this.loadoutTax,
      backLeft: {
        id: this.menuState?.previewLBackId || null,
        def: this.menuState?.previewLBackId ? this.catalog.getWeapon?.(this.menuState.previewLBackId) : null,
        cooldownRemainingSec: this.backCooldowns.left || 0,
        keyCode: kb.fireBackLeft || 'KeyQ',
      },
      backRight: {
        id: this.menuState?.previewRBackId || null,
        def: this.menuState?.previewRBackId ? this.catalog.getWeapon?.(this.menuState.previewRBackId) : null,
        cooldownRemainingSec: this.backCooldowns.right || 0,
        keyCode: kb.fireBackRight || 'KeyX',
      },
      hasPistol: this.weaponState.hasPistol,
      hasSaber: this.weaponState.hasSaber,
      loadoutPreset: this.loadoutPreset,
      barrierActive: this.shieldState.barrierActive,
      shieldState: this.shieldState,
      activeShieldDef,
      boostLocked: shieldBoostLocked,
      moveMode: staggerLocked ? 'STAGGER' : shieldBoostLocked ? 'DOME LOCK' : !this.physics.grounded ? 'FLIGHT' : boostAvailable ? 'BOOST' : shouldWalk ? 'WALK' : 'READY',
      orbitActive: this.orbitActive,
      saberDir: this.saberSwingL.active ? this.saberSwingL.dir : this.saberSwingR.dir,
      saberAngleDeg: Math.round((((this.saberSwingR.active ? this.saberSwingR.angleRad : this.saberSwingL.angleRad) ?? 0) * 180) / Math.PI),
      weaponResource: this.weaponResource,
      primaryGunDef,
      saberGuide: {
        enabled:
          this.menuState?.previewModeId === 'sandbox' &&
          (this.settings?.graphics?.saberGuideMode || 'sandbox_only') !== 'off',
        hasDirection: Boolean(this.saberSwipeTracker?.hasDirection),
        dir: this.saberSwipeTracker?.dir || 'LR',
        angleRad: this.saberSwipeTracker?.angleRad || 0,
        activeDir: this.saberSwingL.active ? this.saberSwingL.dir : this.saberSwingR.active ? this.saberSwingR.dir : null,
        activeSwinging: Boolean(this.saberSwingL.active || this.saberSwingR.active),
      },
      dummyHp: this.dummy?.hp ?? 300,
      dummyMaxHp: this.dummy?.maxHp ?? 300,
      duelActive: Boolean(this.duelMatch),
      duelMatch: this.duelMatch,
      rivalUnit: this.rivalRig?.combatUnit || null,
      rivalShield: this.rivalRig?.shieldState || null,
      partDamage: this.partDamage,
      rivalPartDamage: this.rivalRig?.partDamage || null,
      rivalLockPin: !inMainMenu && this.duelMatch && this.rivalRig?.active
        ? this.cameraRig.projectTargetLockPin({
            playerPhysics: this.physics,
            targetWorldPos: this.rivalRig.getLockTargetWorldPos(this._tmpVecA),
          })
        : null,
      roundBannerText: this.roundBannerTimer > 0 ? this.roundBannerText : '',
      destroyed: this.score.destroyed,
      mcEarned: this.score.mcEarned,
      cameraMode: this.cameraMode,
    });

    this.composer.render();
  }
}

export function bootstrapSandbox() {
  const toastEl = document.getElementById('toast');
  const loadingBanner = document.getElementById('loading-banner');
  const loadingProgressFill = document.getElementById('loading-progress-fill') || loadingBanner?.querySelector?.('.loading-bar-fill');
  const loadingStatusMsg = document.getElementById('loading-status-msg') || loadingBanner?.querySelector?.('.loading-msg');

  const settingsStore = createSettingsStore();
  let app = null;

  const popManager = createPopManager({
    onUiFeedback: (kind) => app?.audio?.playUiFeedback?.(kind),
    onRequestEscapeClose: () => app?.handleEscapePressed(),
  });

  let toastTimer = null;
  const showToast = (msg, opts) => {
    if (popManager) {
      popManager.pushToast(msg, opts);
    } else if (toastEl) {
      toastEl.textContent = String(msg ?? '');
      toastEl.classList.add('show');
      clearTimeout(toastTimer);
      toastTimer = setTimeout(() => toastEl.classList.remove('show'), 2600);
    }
  };

  const menuCtrl = createMenuController({
    settingsStore,
    showToast,
    popManager,
    getApp: () => app,
    onUiFeedback: (kind) => app?.audio?.playUiFeedback?.(kind),
  });

  app = new MechaSandboxApp({
    settingsStore,
    showToast,
    popManager,
    onModelReady: (ok, err) => {
      if (ok) {
        if (loadingProgressFill) loadingProgressFill.style.width = '100%';
        if (loadingStatusMsg) loadingStatusMsg.textContent = '1v1 王牌 AI 決鬥準備就緒';
        setTimeout(() => {
          if (loadingBanner) loadingBanner.style.display = 'none';
        }, 120);
      } else if (loadingStatusMsg) {
        loadingStatusMsg.textContent = `模型載入失敗: ${err}`;
      } else if (loadingBanner) {
        loadingBanner.textContent = `模型載入失敗: ${err}`;
      }
    },
    onMenuStateChanged: (menuState) => menuCtrl.syncMenuState(menuState),
    onSettingsApplied: (s, meta) => menuCtrl.syncSettingsUI(s, meta),
    onRebindStatus: (info) => menuCtrl.onRebindStatus(info),
    onSkinChanged: (eff) => menuCtrl.onSkinChanged(eff),
    onShieldChanged: () => menuCtrl.syncEquipmentState(),
    onLoadoutChanged: () => menuCtrl.syncEquipmentState(),
    onUpdateArmoryPins: (pins) => menuCtrl.syncArmoryPinsOverlay(pins),
    onCameraChanged: (mode) => menuCtrl.onCameraChanged(mode),
    showCombatCallout: (label, kind, dur) => menuCtrl.showCombatCallout(label, kind, dur),
    onTickHud: (t) => menuCtrl.onTickHud(t),
    openCombatManual: () => menuCtrl.openCombatManualModal?.(),
  });

  app.popManager = popManager;

  menuCtrl.syncMenuState(app.menuState);
  menuCtrl.syncEquipmentState();
}
