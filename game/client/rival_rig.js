/**
 * Rival Ace AI Mecha Rig & Combat Controller (Layer 1 Client).
 * Drives EF-T01 ACE 3D articulated mecha in 1v1 Duel mode with TacticalBotAI + SimCore rules.
 */
import * as THREE from 'three';
import { ARENA_RADIUS } from '../shared/constants.js?v=20261116_t75e';
import {
  clamp,
  lerp,
  computeModularMassAndThrust,
  stepAerialFlight,
  resolveWorldCollisions,
  computeContinuousSaberPose,
  computeParryRecoilPose,
  evaluateShieldIncomingHit,
  evaluateSubPartSegmentHit,
} from '../shared/kinematics.js?v=20261116_t75e';
import { intersectSegmentCapsuleY } from '../shared/spatial_grid.js?v=20261116_t75e';
import {
  createAntiSpamShieldState,
  markShieldBlockOrParry,
  stepShieldDefenseAntiSpam,
  createUnitCombatState,
  stepUnitCombatResources,
  applyUnitDamage,
  createMeleeTimingState,
  stepMeleeTimingState,
  resolveMeleeEncounter,
  createPartDamageState,
  applyPartDamage,
  computePartStatusPenalties,
} from '../shared/sim_core.js?v=20261116_t75e';
import { createBotAiState, stepBotAiDecision } from '../shared/bot_ai.js?v=20261116_t75e';
import { MATCH_EVENT_TYPES } from '../shared/match_rules.js?v=20261116_t75e';
import { createMechaRigManager } from './mecha_rig.js?v=20261116_t75e';

function lerpAngle(cur, target, t) {
  const diff = Math.atan2(Math.sin(target - cur), Math.cos(target - cur));
  return cur + diff * clamp(t, 0, 1);
}

export function createRivalRigManager({ scene, catalog, vfx, audio }) {
  const rivalMassThrust = computeModularMassAndThrust([]);

  const _tmpVec = new THREE.Vector3();
  const _tmpShotOrigin = new THREE.Vector3();
  const _tmpShotDir = new THREE.Vector3();
  const _tmpAimTarget = new THREE.Vector3();
  const _tmpBasePos = new THREE.Vector3();

  const manager = {
    active: false,
    glbReady: false,
    root: null,
    fallbackGroup: null,
    valiantRig: null,
    parts: null,
    armorMats: [],
    fallbackArmorMats: [],
    shieldBarrierMesh: null,
    saberBladeMesh: null,
    saberLight: null,
    shieldId: 'EF-SH03',
    loadoutState: { lHand: 'shield', rHand: 'pistol' },
    weaponState: { hasPistol: true, hasSaber: true, saberIgnited: false },
    physics: null,
    bodyYaw: Math.PI,
    aimPitch: 0,
    combatUnit: createUnitCombatState({ maxAp: 4500, maxEn: 100, maxAcs: 100 }),
    partDamage: createPartDamageState({ maxAp: 4500 }),
    shieldState: createAntiSpamShieldState(),
    meleeTiming: createMeleeTimingState(),
    aiState: createBotAiState({ difficulty: 'ace' }),
    saberSwing: { active: false, t: 0, duration: 0.46, angleRad: 0.55, hitRegistered: false },
    recoil: { active: false, t: 0, duration: 0.34 },
    hitFlash: 0,
    walkPhase: 0,
    jetSmooth: 0,
    smokeTimer: 0,
    roundEnded: false,

    _ensureBuilt() {
      if (this.root) return;
      const grp = new THREE.Group();
      grp.visible = false;

      // Clone VALIANT skeletal GLB rig inside grp (shares geometry buffer, isolates materials/bones)
      this.valiantRig = createMechaRigManager({
        scene,
        parentGroup: grp,
        catalog,
        vfx,
        skipHangar: true,
        skipCockpit: true,
        skipVfxAccent: true,
        getActiveShieldDef: () => this.getShieldDef(),
        getActiveShieldId: () => this.shieldId,
        getLoadoutPreset: () => this.loadoutState,
        getWeaponState: () => this.weaponState,
      });
      this.valiantRig.init();
      this.valiantRig.mechaRoot.visible = false;

      // Lightweight fallback primitive mesh only used while GLB streams or if GLB fails
      const fb = new THREE.Group();
      this.fallbackGroup = fb;
      grp.add(fb);

      const darkArmor = new THREE.MeshStandardMaterial({ color: '#1b2333', roughness: 0.36, metalness: 0.72 });
      const crimsonArmor = new THREE.MeshStandardMaterial({ color: '#dc2626', roughness: 0.28, metalness: 0.48 });
      const pearlArmor = new THREE.MeshStandardMaterial({ color: '#e2e8f0', roughness: 0.34, metalness: 0.32 });
      const frameMat = new THREE.MeshStandardMaterial({ color: '#2b3342', roughness: 0.5, metalness: 0.85 });
      const visorMat = new THREE.MeshStandardMaterial({
        color: '#ff4d6d',
        emissive: '#ff1f4b',
        emissiveIntensity: 3.0,
        roughness: 0.12,
      });
      this.fallbackArmorMats = [darkArmor, crimsonArmor, pearlArmor];
      this.armorMats = this.fallbackArmorMats;

      const pelvis = new THREE.Mesh(new THREE.BoxGeometry(0.76, 0.34, 0.48), darkArmor);
      pelvis.position.set(0, 1.24, 0);
      pelvis.castShadow = true;
      fb.add(pelvis);

      const torso = new THREE.Group();
      torso.position.set(0, 1.42, 0);
      const chest = new THREE.Mesh(new THREE.BoxGeometry(0.96, 0.76, 0.58), crimsonArmor);
      chest.position.set(0, 0.38, 0);
      chest.castShadow = true;
      torso.add(chest);

      const chestCore = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.24, 0.62), visorMat);
      chestCore.position.set(0, 0.42, -0.02);
      torso.add(chestCore);

      const head = new THREE.Group();
      head.position.set(0, 0.88, 0);
      const helm = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.38, 0.42), pearlArmor);
      helm.castShadow = true;
      const visor = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.1, 0.1), visorMat);
      visor.position.set(0, 0.02, -0.2);
      const crest = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.28, 0.38), crimsonArmor);
      crest.position.set(0, 0.24, 0.02);
      const vFinL = new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.06, 0.05), visorMat);
      vFinL.position.set(-0.18, 0.22, -0.2);
      vFinL.rotation.z = -0.45;
      const vFinR = new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.06, 0.05), visorMat);
      vFinR.position.set(0.18, 0.22, -0.2);
      vFinR.rotation.z = 0.45;
      head.add(helm, visor, crest, vFinL, vFinR);
      torso.add(head);

      const backpack = new THREE.Mesh(new THREE.BoxGeometry(0.72, 0.58, 0.36), frameMat);
      backpack.position.set(0, 0.42, 0.36);
      const wingL = new THREE.Mesh(new THREE.BoxGeometry(1.05, 0.2, 0.09), crimsonArmor);
      wingL.position.set(-0.68, 0.62, 0.48);
      wingL.rotation.z = 0.34;
      const wingR = new THREE.Mesh(new THREE.BoxGeometry(1.05, 0.2, 0.09), crimsonArmor);
      wingR.position.set(0.68, 0.62, 0.48);
      wingR.rotation.z = -0.34;
      const plumeMat = new THREE.MeshBasicMaterial({ color: '#ff3b6b', transparent: true, opacity: 0.85 });
      const plumeL = new THREE.Mesh(new THREE.ConeGeometry(0.12, 0.72, 8), plumeMat);
      plumeL.rotation.x = Math.PI * 0.65;
      plumeL.position.set(-0.22, 0.28, 0.74);
      const plumeR = new THREE.Mesh(new THREE.ConeGeometry(0.12, 0.72, 8), plumeMat);
      plumeR.rotation.x = Math.PI * 0.65;
      plumeR.position.set(0.22, 0.28, 0.74);
      const beaconLight = new THREE.PointLight('#ff3b6b', 2.4, 14, 1.4);
      beaconLight.position.set(0, 0.9, 0);
      torso.add(backpack, wingL, wingR, plumeL, plumeR, beaconLight);

      // Left arm + Energy Shield
      const armL = new THREE.Group();
      armL.position.set(-0.56, 0.58, 0);
      const shoulderL = new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.32, 0.38), crimsonArmor);
      const upperL = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.48, 0.22), frameMat);
      upperL.position.set(0, -0.26, 0);
      const foreL = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.46, 0.24), darkArmor);
      foreL.position.set(0, -0.66, -0.06);
      const shieldNode = new THREE.Mesh(
        new THREE.BoxGeometry(0.1, 1.38, 0.78),
        new THREE.MeshStandardMaterial({ color: '#273244', roughness: 0.35, metalness: 0.8 }),
      );
      shieldNode.position.set(-0.18, -0.58, -0.14);
      const barrierMesh = new THREE.Mesh(
        new THREE.BoxGeometry(0.95, 1.85, 0.06),
        new THREE.MeshBasicMaterial({
          color: '#ff4d6d',
          transparent: true,
          opacity: 0.38,
          side: THREE.DoubleSide,
          depthWrite: false,
        }),
      );
      barrierMesh.position.set(-0.15, -0.45, -0.52);
      barrierMesh.visible = false;
      armL.add(shoulderL, upperL, foreL, shieldNode, barrierMesh);
      torso.add(armL);

      // Right arm + Beam Pistol + Crimson Hyper Beam Saber
      const armR = new THREE.Group();
      armR.position.set(0.56, 0.58, 0);
      const shoulderR = new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.32, 0.38), crimsonArmor);
      const upperR = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.48, 0.22), frameMat);
      upperR.position.set(0, -0.26, 0);
      const foreR = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.46, 0.24), darkArmor);
      foreR.position.set(0, -0.66, -0.06);
      const rifle = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.16, 0.78), frameMat);
      rifle.position.set(0, -0.82, -0.36);

      const saberGrp = new THREE.Group();
      saberGrp.position.set(0, -0.82, -0.18);
      const hilt = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.3, 8), frameMat);
      hilt.rotation.x = Math.PI / 2;
      const blade = new THREE.Mesh(
        new THREE.CylinderGeometry(0.036, 0.018, 2.35, 10),
        new THREE.MeshBasicMaterial({ color: '#ff3b6b', transparent: true, opacity: 0.92 }),
      );
      blade.rotation.x = -Math.PI / 2;
      blade.position.set(0, 0, -1.25);
      blade.visible = false;
      const saberLight = new THREE.PointLight('#ff2d55', 0, 7, 1.5);
      saberLight.position.set(0, 0, -1.2);
      saberGrp.add(hilt, blade, saberLight);
      armR.add(shoulderR, upperR, foreR, rifle, saberGrp);
      torso.add(armR);
      fb.add(torso);

      // Articulated legs
      const makeLeg = (sx) => {
        const leg = new THREE.Group();
        leg.position.set(sx * 0.25, 1.18, 0);
        const thigh = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.62, 0.3), darkArmor);
        thigh.position.set(0, -0.32, 0);
        const shin = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.64, 0.34), crimsonArmor);
        shin.position.set(0, -0.88, 0.02);
        const foot = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.14, 0.48), frameMat);
        foot.position.set(0, -1.11, -0.06);
        leg.add(thigh, shin, foot);
        return leg;
      };
      const legL = makeLeg(-1);
      const legR = makeLeg(1);
      fb.add(legL, legR);

      scene.add(grp);
      this.root = grp;
      this.parts = { pelvis, torso, head, armL, armR, saberGrp, legL, legR, plumeL, plumeR };
      this.shieldBarrierMesh = barrierMesh;
      this.saberBladeMesh = blade;
      this.saberLight = saberLight;
    },

    async loadValiantGlb(modelUrl, shieldsModelUrl) {
      this._ensureBuilt();
      if (!this.valiantRig || this.glbReady) return this.glbReady;
      return new Promise((resolve) => {
        this.valiantRig.loadValiantGlb(modelUrl, shieldsModelUrl, (ok) => {
          if (!ok) {
            resolve(false);
            return;
          }
          this.valiantRig.applySkin('SKIN-04');
          this.valiantRig.syncShieldVariantVisibility();
          this.valiantRig.syncWeaponLoadoutVisibility();

          const sn = this.valiantRig.shieldNodes;
          for (const mat of [sn?.barrierMat, sn?.rightBarrierMat, sn?.rectBarrierMat, sn?.directionalDomeMat]) {
            if (mat?.uniforms?.uColor) mat.uniforms.uColor.value.set('#ff3b6b');
          }

          const collectedMats = new Set();
          this.valiantRig.mechaRoot.traverse((obj) => {
            if (!obj.isMesh || !obj.material || obj.material.isShaderMaterial) return;
            const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
            for (const m of mats) {
              if (!m || m.isShaderMaterial) continue;
              if (m.name === 'Mat_Armor_Primary' || m.name === 'Mat_Armor_Secondary') {
                collectedMats.add(m);
              }
            }
          });
          if (collectedMats.size > 0) {
            this.armorMats = Array.from(collectedMats);
          }

          this.glbReady = true;
          if (this.fallbackGroup) this.fallbackGroup.visible = false;
          this.valiantRig.mechaRoot.visible = true;
          resolve(true);
        });
      });
    },

    resetForRound({ active = false, x = 0, z = -20 } = {}) {
      this._ensureBuilt();
      this.active = Boolean(active);
      this.roundEnded = false;
      this.physics = {
        x,
        y: 0,
        z,
        vx: 0,
        vy: 0,
        vz: 0,
        en: 100,
        maxEn: 100,
        enRegenDelaySec: 0,
        grounded: true,
      };
      this.bodyYaw = Math.PI;
      this.aimPitch = 0;
      this.combatUnit = createUnitCombatState({ maxAp: 4500, maxEn: 100, maxAcs: 100 });
      this.partDamage = createPartDamageState({ maxAp: 4500 });
      this.shieldState = createAntiSpamShieldState();
      this.meleeTiming = createMeleeTimingState();
      this.aiState = createBotAiState({ difficulty: 'ace' });
      this.saberSwing = { active: false, t: 0, duration: 0.46, angleRad: 0.55, hitRegistered: false };
      this.recoil = { active: false, t: 0, duration: 0.34 };
      this.hitFlash = 0;
      this.walkPhase = 0;
      this.jetSmooth = 0;
      this.smokeTimer = 0;
      this.loadoutState.rHand = 'pistol';
      this.weaponState.saberIgnited = false;
      if (this.parts) {
        if (this.parts.armL) this.parts.armL.visible = true;
        if (this.parts.armR) this.parts.armR.visible = true;
      }
      if (this.root) {
        this.root.visible = this.active;
        this.root.position.set(x, 0, z);
        this.root.rotation.set(0, Math.PI, 0);
      }
      if (this.shieldBarrierMesh) this.shieldBarrierMesh.visible = false;
      if (this.saberBladeMesh) this.saberBladeMesh.visible = false;
      if (this.saberLight) this.saberLight.intensity = 0;
      if (this.glbReady && this.valiantRig) {
        this.valiantRig.applyPartDamageVisuals(this.partDamage);
        this.valiantRig.syncWeaponLoadoutVisibility();
        if (this.valiantRig.shieldNodes?.barrierMesh) {
          this.valiantRig.shieldNodes.barrierMesh.visible = false;
        }
        if (this.valiantRig.saberFx?.light) {
          this.valiantRig.saberFx.light.intensity = 0;
        }
        for (const tp of this.valiantRig.thrusterPlumes || []) {
          tp.rig.visible = false;
        }
      }
    },

    setVisible(vis) {
      if (this.root) this.root.visible = Boolean(vis && this.active);
    },

    triggerHitFlash() {
      this.hitFlash = 0.12;
    },

    getShieldDef() {
      return catalog.getShield(this.shieldId) || catalog.getShield('EF-SH03');
    },

    getSubPartHitCapsules() {
      if (this.glbReady && this.valiantRig) {
        return this.valiantRig.getSubPartHitCapsules(this.partDamage);
      }
      const p = this.physics || { x: 0, y: 0, z: 0 };
      const pState = this.partDamage;
      const cosY = Math.cos(this.bodyYaw || 0);
      const sinY = Math.sin(this.bodyYaw || 0);
      return [
        { partId: 'head', a: { x: p.x, y: p.y + 2.15, z: p.z }, b: { x: p.x, y: p.y + 2.48, z: p.z }, radius: 0.26, disabled: false },
        { partId: 'torso', a: { x: p.x, y: p.y + 1.25, z: p.z }, b: { x: p.x, y: p.y + 2.02, z: p.z }, radius: 0.44, disabled: false },
        { partId: 'backpack', a: { x: p.x + sinY * 0.3, y: p.y + 1.55, z: p.z + cosY * 0.3 }, b: { x: p.x + sinY * 0.3, y: p.y + 2.05, z: p.z + cosY * 0.3 }, radius: 0.36, disabled: false },
        { partId: 'arm_l', a: { x: p.x - cosY * 0.62, y: p.y + 1.9, z: p.z + sinY * 0.62 }, b: { x: p.x - cosY * 0.66, y: p.y + 1.15, z: p.z + sinY * 0.66 }, radius: 0.26, disabled: Boolean(pState?.arm_l?.severed) },
        { partId: 'arm_r', a: { x: p.x + cosY * 0.62, y: p.y + 1.9, z: p.z - sinY * 0.62 }, b: { x: p.x + cosY * 0.66, y: p.y + 1.15, z: p.z - sinY * 0.66 }, radius: 0.26, disabled: Boolean(pState?.arm_r?.severed) },
        { partId: 'legs', a: { x: p.x - cosY * 0.22, y: p.y + 1.1, z: p.z + sinY * 0.22 }, b: { x: p.x - cosY * 0.22, y: p.y + 0.08, z: p.z + sinY * 0.22 }, radius: 0.27, disabled: false },
        { partId: 'legs', a: { x: p.x + cosY * 0.22, y: p.y + 1.1, z: p.z - sinY * 0.22 }, b: { x: p.x + cosY * 0.22, y: p.y + 0.08, z: p.z - sinY * 0.22 }, radius: 0.27, disabled: false },
      ];
    },

    /**
     * Check swept player shot against Rival shield or 6 sub-part bone hit capsules.
     * Returns { hit: boolean, reflected?: boolean, damageDealt: number, hitPartId?: string }.
     */
    handleIncomingPlayerShot(prevPos, curPos, rawDmg = 195, proj = null) {
      if (!this.active || !this.physics || this.combatUnit.ap <= 0) {
        return { hit: false, damageDealt: 0 };
      }
      const p0 = prevPos || curPos;
      const subHit = evaluateSubPartSegmentHit(p0, curPos, this.getSubPartHitCapsules());
      let hitPartId = subHit.hit ? subHit.partId : null;
      if (!subHit.hit) {
        _tmpBasePos.set(this.physics.x, this.physics.y, this.physics.z);
        const broad = intersectSegmentCapsuleY(p0, curPos, _tmpBasePos, 0.56, 2.55);
        if (!broad.hit) return { hit: false, damageDealt: 0 };
        hitPartId = 'torso';
      }

      const penalties = computePartStatusPenalties(this.partDamage);
      const shieldDef = this.getShieldDef();
      // Check if frontal vector aligns with rival shield when barrierActive (disabled if Left Arm broken/severed!)
      let shieldBlocked = false;
      if (!penalties.armLDisabled && this.shieldState.barrierActive && prevPos) {
        const incX = prevPos.x - curPos.x;
        const incZ = prevPos.z - curPos.z;
        const incLen = Math.hypot(incX, incZ) || 1;
        const fwdX = -Math.sin(this.bodyYaw);
        const fwdZ = -Math.cos(this.bodyYaw);
        const dot = (incX / incLen) * fwdX + (incZ / incLen) * fwdZ;
        if (dot >= 0.25) {
          const evalRes = evaluateShieldIncomingHit(this.shieldState, {
            dmg: rawDmg,
            isMelee: false,
            attackKind: proj?.attackKind || 'bullet',
            frontDot: dot,
            blockReduction: shieldDef.blockReduction,
            fullDome: Boolean(shieldDef.isFullDome),
            impactDrainMult: shieldDef.impactDrainMult ?? 0.55,
            parrySpRefund: shieldDef.parrySpRefund ?? 10,
            reflectsBeams: Boolean(shieldDef.reflectsBeams),
          });
          this.shieldState = markShieldBlockOrParry(this.shieldState, { isParry: evalRes.outcome === 'parry' });
          this.shieldState.shieldSp = Math.max(0, (this.shieldState.shieldSp ?? 100) - (evalRes.spDrain || 0));
          this.shieldState.regenDelaySec = 0.35;
          if (evalRes.outcome === 'parry') {
            this.shieldState.shieldSp = Math.min(100, this.shieldState.shieldSp + (shieldDef.parrySpRefund || 10));
            vfx.spawnSparks(curPos, '#ff99aa', 14, 7);
            audio.playShieldParry(true);
            return { hit: true, parry: true, damageDealt: 0 };
          }
          if (this.shieldState.shieldSp <= 0) {
            this.shieldState.overheated = true;
            this.shieldState.barrierActive = false;
            this.shieldState.cooldownRemainingSec = Number(((shieldDef.cooldownSec || 1.5) * 1.3).toFixed(2));
            vfx.spawnSparks(curPos, '#ff6848', 20, 10);
            return { hit: true, guardBreak: true, damageDealt: 0 };
          }
          vfx.spawnSparks(curPos, '#ff4d6d', 8, 5);
          audio.playShieldParry(false);
          shieldBlocked = true;
        }
      }

      if (shieldBlocked) {
        return { hit: true, blocked: true, damageDealt: 0 };
      }

      const partRes = applyPartDamage(this.partDamage, hitPartId, {
        rawDamage: rawDmg,
        damageType: proj?.attackKind || 'bullet',
        isMelee: false,
      });
      this.partDamage = partRes.partState;
      if (this.glbReady && this.valiantRig) {
        this.valiantRig.applyPartDamageVisuals(this.partDamage);
      }

      const scaledRawDmg = Math.round(rawDmg * (partRes.apDamageMult || 1.0));
      const dmgRes = applyUnitDamage(this.combatUnit, {
        rawDamage: scaledRawDmg,
        acsDamage: (proj?.acsDamage || 11) + (partRes.bonusAcs || 0),
        damageType: proj?.attackKind || 'bullet',
      });
      this.combatUnit = dmgRes.unit;
      this.triggerHitFlash();
      const sparkCol = partRes.brokenNow ? '#ff5522' : hitPartId === 'head' ? '#ffe46b' : '#ffaa44';
      vfx.spawnSparks(curPos, sparkCol, partRes.brokenNow ? 18 : 9, partRes.brokenNow ? 10 : 6);
      audio.playBulletHit('metal');
      return {
        hit: true,
        hitPartId: partRes.partId,
        partBrokenNow: partRes.brokenNow,
        damageDealt: dmgRes.finalDamage,
        staggeredNow: dmgRes.staggeredNow,
        hitstopSec: dmgRes.hitstopSec,
      };
    },

    /**
     * Resolve unblocked player Beam Saber strike across Rival 6 sub-part capsules -> supports clean arm severing!
     */
    handleIncomingPlayerMelee(rawMeleeDmg = 720, acsDamage = 28, { slashDir = 'LR', slashPos = null } = {}) {
      if (!this.active || !this.physics || this.combatUnit.ap <= 0) {
        return { finalDamage: 0, staggeredNow: false, hitstopSec: 0, hitPartId: 'torso', severedArm: null };
      }
      const capsules = this.getSubPartHitCapsules();
      // Select closest live arm capsule biased by slash sweep direction, or torso/legs/head
      let targetPartId = 'torso';
      if (slashPos) {
        let bestDistSq = Infinity;
        for (let i = 0; i < capsules.length; i++) {
          const cap = capsules[i];
          if (!cap || cap.disabled) continue;
          const mx = (cap.a.x + cap.b.x) * 0.5;
          const my = (cap.a.y + cap.b.y) * 0.5;
          const mz = (cap.a.z + cap.b.z) * 0.5;
          let d2 = (mx - slashPos.x) ** 2 + (my - slashPos.y) ** 2 + (mz - slashPos.z) ** 2;
          // Prioritize clean limb cleave on lateral slashes!
          if ((cap.partId === 'arm_l' || cap.partId === 'arm_r') && (slashDir === 'LR' || slashDir === 'RL' || slashDir.startsWith('DIAG'))) {
            d2 *= 0.42;
          } else if (cap.partId === 'torso') {
            d2 *= 0.92;
          }
          if (d2 < bestDistSq) {
            bestDistSq = d2;
            targetPartId = cap.partId;
          }
        }
      } else {
        if (slashDir === 'LR' && !this.partDamage.arm_r.severed) targetPartId = 'arm_r';
        else if (slashDir === 'RL' && !this.partDamage.arm_l.severed) targetPartId = 'arm_l';
        else if (!this.partDamage.arm_l.severed) targetPartId = 'arm_l';
        else if (!this.partDamage.arm_r.severed) targetPartId = 'arm_r';
      }

      const partRes = applyPartDamage(this.partDamage, targetPartId, {
        rawDamage: rawMeleeDmg,
        damageType: 'saber',
        isMelee: true,
      });

      let severedDebris = null;
      let stumpPos = null;
      if (partRes.severedArm && this.glbReady && this.valiantRig) {
        severedDebris = this.valiantRig.createSeveredArmDebrisGroup(partRes.severedArm);
        stumpPos = severedDebris?.originPos || null;
      }

      this.partDamage = partRes.partState;
      if (this.glbReady && this.valiantRig) {
        this.valiantRig.applyPartDamageVisuals(this.partDamage);
      } else if (this.parts && partRes.severedArm) {
        const armNode = partRes.severedArm === 'L' ? this.parts.armL : this.parts.armR;
        if (armNode) armNode.visible = false;
      }
      if (partRes.severedArm === 'L') {
        this.shieldState.barrierActive = false;
      } else if (partRes.severedArm === 'R') {
        this.saberSwing.active = false;
        this.weaponState.saberIgnited = false;
      }

      const dmgRes = applyUnitDamage(this.combatUnit, {
        rawDamage: Math.round(rawMeleeDmg * (partRes.apDamageMult || 1.0)),
        acsDamage: acsDamage + (partRes.bonusAcs || 0),
        damageType: 'melee',
      });
      this.combatUnit = dmgRes.unit;
      this.triggerHitFlash();

      return {
        ...dmgRes,
        hitPartId: partRes.partId,
        partBrokenNow: partRes.brokenNow,
        severedArm: partRes.severedArm,
        severedDebris,
        stumpPos,
      };
    },

    /**
     * Advance Rival AI brain, physics ODEs, shield/combat resources, weapons & 3D pose.
     */
    step(
      dt,
      {
        playerPhysics,
        playerUnit,
        playerShield,
        playerMelee,
        destructibles,
        spatialGrid,
        dummy,
        mapEnvModifiers,
        playerAttacking = false,
        playerWeaponCoolingOrReloading = false,
        matchTimeSec = 0,
        freezeCombat = false,
        onRecordEvent,
        onCallout,
        onRivalMeleeImpactPlayer,
      } = {},
    ) {
      if (!this.active || !this.physics || !this.root) return;
      if (this.combatUnit.ap <= 0) {
        this.root.rotation.x = lerp(this.root.rotation.x, -0.35, 1 - Math.exp(-8 * dt));
        return;
      }

      let intent;
      if (freezeCombat) {
        const dxF = (playerPhysics?.x ?? 0) - this.physics.x;
        const dzF = (playerPhysics?.z ?? 0) - this.physics.z;
        intent = {
          lookYaw: Math.atan2(-dxF, -dzF),
          lookPitch: 0,
          moveX: 0,
          moveZ: 0,
          jumpHeld: false,
          quickBoost: false,
          guardHeld: false,
          firePistol: false,
          slashSaber: false,
        };
      } else {
        // Detect incoming player tracer bolts threatening Rival within ~15m
        let projectileIncoming = false;
        for (let i = 0; i < vfx.projectiles.length; i++) {
          const p = vfx.projectiles[i];
          if (!p || p.fromEnemy) continue;
          const d = Math.hypot(
            p.mesh.position.x - this.physics.x,
            p.mesh.position.z - this.physics.z,
          );
          if (d < 15.0) {
            projectileIncoming = true;
            break;
          }
        }

        const decision = stepBotAiDecision(this.aiState, {
          dt,
          selfPhysics: this.physics,
          selfUnit: this.combatUnit,
          selfShield: this.shieldState,
          selfMelee: this.meleeTiming,
          targetPhysics: playerPhysics,
          targetUnit: playerUnit,
          targetAttacking: playerAttacking,
          targetMeleeActive: Boolean(playerMelee?.active),
          targetProjectileIncoming: projectileIncoming,
          targetReloadingOrCooling: Boolean(playerWeaponCoolingOrReloading),
          spatialGrid: spatialGrid || null,
          obstacles: destructibles || null,
        });
        this.aiState = decision.nextState;
        intent = decision.intent;
      }

      this.bodyYaw = lerpAngle(this.bodyYaw, intent.lookYaw, 1 - Math.exp(-10 * dt));
      this.aimPitch = lerp(this.aimPitch, intent.lookPitch, 1 - Math.exp(-10 * dt));

      const penalties = computePartStatusPenalties(this.partDamage);
      const shieldDef = this.getShieldDef();
      const prevOverheat = this.shieldState.overheated;
      this.shieldState = stepShieldDefenseAntiSpam(this.shieldState, {
        guardHeld: !penalties.armLDisabled && intent.guardHeld,
        hasShield: !penalties.armLDisabled,
        dt,
        shieldDef,
        spRegenScale: mapEnvModifiers?.spRegenScale ?? 1.0,
      });
      if (!prevOverheat && this.shieldState.overheated) {
        onRecordEvent?.({
          timeSec: matchTimeSec,
          type: MATCH_EVENT_TYPES.GUARD_BREAK,
          actor: 'player',
          detail: '敵機能量護盾過熱崩潰',
        });
      }

      const prevEn = this.physics.en;
      const prevY = this.physics.y;
      const isStaggered = (this.combatUnit.staggerRemainingSec || 0) > 0;
      const effMoveScale = penalties.moveSpeedScale;
      const rivalEfMassThrust = {
        ...rivalMassThrust,
        hoverThrustN: rivalMassThrust.hoverThrustN * penalties.boostScale,
        quickBoostImpulse: (rivalMassThrust.quickBoostImpulse || 18) * penalties.boostScale,
      };
      this.physics = stepAerialFlight(
        this.physics,
        {
          moveX: isStaggered ? 0 : intent.moveX * effMoveScale,
          moveZ: isStaggered ? 0 : intent.moveZ * effMoveScale,
          jumpHeld: !isStaggered && intent.jumpHeld && this.physics.en > 10,
          quickBoost: !isStaggered && intent.quickBoost && this.physics.en > 10,
          walkOnly: this.physics.grounded && !intent.quickBoost && !intent.jumpHeld,
          walkDriveGain: 0.92 * effMoveScale,
          throttle: 1.0,
          pitchRad: 0,
          rollRad: 0,
        },
        dt,
        rivalEfMassThrust,
      );
      const colRes = resolveWorldCollisions(this.physics, prevY, destructibles, dummy);
      this.physics = colRes.physics;

      const rArena = Math.hypot(this.physics.x, this.physics.z);
      if (rArena > ARENA_RADIUS - 1.5) {
        const s = (ARENA_RADIUS - 1.5) / rArena;
        this.physics.x *= s;
        this.physics.z *= s;
      }

      this.combatUnit = stepUnitCombatResources(
        { ...this.combatUnit, en: this.physics.en, maxEn: this.physics.maxEn },
        {
          dt,
          boosting: intent.quickBoost || intent.jumpHeld,
          enSpent: Math.max(0, prevEn - this.physics.en),
          grounded: this.physics.grounded,
          mapEnvModifiers,
          weightTaxScale: penalties.enRegenScale,
          inHazardVoid: this.physics.y < -1.5,
        },
      );

      // Periodic sparks/smoke on severely damaged or severed Rival parts
      if (penalties.smokingParts.length > 0 || penalties.armLSevered || penalties.armRSevered) {
        this.smokeTimer -= dt;
        if (this.smokeTimer <= 0) {
          this.smokeTimer = 0.28;
          const emitPart = penalties.armRSevered
            ? 'arm_r'
            : penalties.armLSevered
              ? 'arm_l'
              : penalties.smokingParts[Math.floor(matchTimeSec * 4) % penalties.smokingParts.length];
          const emitPos = this.glbReady && this.valiantRig
            ? this.valiantRig.getSubPartWorldPos(emitPart, _tmpVec)
            : _tmpVec.set(this.physics.x, this.physics.y + 1.5, this.physics.z);
          vfx.spawnSparks(emitPos, '#ff7733', 4, 3);
        }
      }

      // Fire rival rifle bolt (blocked when Right Arm broken/severed!)
      if (intent.firePistol && !isStaggered && !penalties.armRDisabled) {
        _tmpShotOrigin.set(
          this.physics.x - Math.sin(this.bodyYaw) * 0.9 + Math.cos(this.bodyYaw) * 0.56,
          this.physics.y + 1.55,
          this.physics.z - Math.cos(this.bodyYaw) * 0.9 - Math.sin(this.bodyYaw) * 0.56,
        );
        _tmpAimTarget.set(playerPhysics.x, playerPhysics.y + 1.35, playerPhysics.z);
        _tmpShotDir.copy(_tmpAimTarget).sub(_tmpShotOrigin).normalize();
        vfx.spawnEnemyTestBolt(_tmpShotOrigin, _tmpShotDir, { speed: 42, damage: 240 });
        audio.playShot('beam_rifle');
      }

      // Rival melee swing + bidirectional encounter arbitration (blocked when Right Arm disabled!)
      const startSlash = Boolean(intent.slashSaber && !isStaggered && !penalties.armRDisabled && !this.saberSwing.active);
      if (startSlash) {
        this.saberSwing = { active: true, t: 0, duration: 0.46, angleRad: 0.65, hitRegistered: false };
        audio.playSaberSlash();
      }
      this.meleeTiming = stepMeleeTimingState(this.meleeTiming, {
        dt,
        startSlash,
        hasSaber: !penalties.armRDisabled,
        slashDir: 'LR',
        swingDurationSec: 0.46,
      });

      let activeSaberPose = null;
      let armSwingPitch = 0;
      let armSwingYaw = 0;
      if (this.saberSwing.active && !penalties.armRDisabled) {
        this.saberSwing.t += dt;
        const u = clamp(this.saberSwing.t / this.saberSwing.duration, 0, 1);
        activeSaberPose = computeContinuousSaberPose(this.saberSwing.angleRad, u, this.aimPitch);
        armSwingPitch = (activeSaberPose.shoulderXDeg || 0) * (Math.PI / 180);
        armSwingYaw = (activeSaberPose.shoulderYDeg || 0) * (Math.PI / 180);

        if (!this.saberSwing.hitRegistered && u >= 0.3) {
          this.saberSwing.hitRegistered = true;
          const distToPlayer = Math.hypot(playerPhysics.x - this.physics.x, playerPhysics.z - this.physics.z);
          const encounter = resolveMeleeEncounter({
            attackerSwing: this.meleeTiming,
            attackerHasSaber: !penalties.armRDisabled,
            defenderSwing: playerMelee,
            defenderHasSaber: Boolean(playerUnit?.hasPlayerSaber ?? true),
            defenderShield: playerShield,
            defenderShieldDef: catalog.getShield(playerShield?.activeShieldId || 'EF-SH03'),
            baseMeleeDmg: 920,
            saberVsShieldSpDrain: 33,
            distanceM: distToPlayer,
            reachM: 3.7,
            frontDot: 1.0,
          });
          onRivalMeleeImpactPlayer?.(encounter, _tmpVec.set(this.physics.x, this.physics.y + 1.35, this.physics.z));
          if (encounter.attackerRecoilAnim) {
            this.recoil = { active: true, t: 0, duration: 0.34 };
          }
          if (encounter.attackerKnockback > 0) {
            const awayX = this.physics.x - playerPhysics.x;
            const awayZ = this.physics.z - playerPhysics.z;
            const len = Math.max(0.01, Math.hypot(awayX, awayZ));
            this.physics.vx += (awayX / len) * encounter.attackerKnockback;
            this.physics.vz += (awayZ / len) * encounter.attackerKnockback;
          }
          if (encounter.hitstopSec > 0 && encounter.outcome === 'saber_clash') {
            onCallout?.('SABER CLASH!!', 'clash');
          }
        }
        if (u >= 1) this.saberSwing.active = false;
      }

      let recoilPoseDeg = { armRecoilDeg: 0, torsoPitchDeg: 0, shoulderZDeg: 0 };
      if (this.recoil.active) {
        this.recoil.t += dt;
        const ru = clamp(this.recoil.t / this.recoil.duration, 0, 1);
        recoilPoseDeg = computeParryRecoilPose(ru);
        armSwingPitch -= (recoilPoseDeg.armRecoilDeg || 0) * 0.012;
        if (ru >= 1) this.recoil.active = false;
      }

      // Apply 3D transforms & articulated 25-bone VALIANT pose (or fallback boxes)
      this.root.position.set(this.physics.x, this.physics.y, this.physics.z);
      this.root.rotation.set(isStaggered ? 0.22 : 0, this.bodyYaw, 0);

      const horzSpd = Math.hypot(this.physics.vx, this.physics.vz);
      const boostTarget =
        !isStaggered && (intent.quickBoost || intent.jumpHeld || !this.physics.grounded || horzSpd > 9)
          ? 1.0
          : horzSpd > 1.5
            ? 0.25
            : 0.0;
      this.jetSmooth = lerp(this.jetSmooth, boostTarget, 1 - Math.exp(-10 * dt));

      if (this.physics.grounded && horzSpd > 0.6 && !isStaggered) {
        this.walkPhase += dt * (3.2 + horzSpd * 0.3);
      }

      if (this.glbReady && this.valiantRig) {
        this.loadoutState.rHand = this.saberSwing.active && !penalties.armRDisabled ? 'saber' : 'pistol';
        this.weaponState.saberIgnited = Boolean(this.saberSwing.active && !penalties.armRDisabled);
        this.valiantRig.applyPartDamageVisuals(this.partDamage);
        this.valiantRig.syncWeaponLoadoutVisibility();

        const pitchDeg = this.aimPitch * (180 / Math.PI);
        const isWalking = this.physics.grounded && horzSpd > 0.6 && !isStaggered;
        const strideDeg = isWalking ? Math.sin(this.walkPhase) * 26 : 0;
        const leanDeg = clamp(horzSpd * 0.6, 0, 14) + (isStaggered ? 22 : 0);

        this.valiantRig.poseBone('Pelvis', 4 + (this.saberSwing.active ? 8 : 0), 0, 0);
        this.valiantRig.poseBone('Torso', 6 + leanDeg - pitchDeg * 0.22 + (recoilPoseDeg.torsoPitchDeg || 0), 0, 0);
        this.valiantRig.poseBone('Head', -4 - pitchDeg * 0.55 - (recoilPoseDeg.torsoPitchDeg || 0) * 0.4, 0, 0);

        if (this.physics.grounded) {
          this.valiantRig.poseBone('FrontSkirt_L', Math.max(12, strideDeg * 0.65), 0, 0);
          this.valiantRig.poseBone('FrontSkirt_R', Math.max(12, -strideDeg * 0.65), 0, 0);
          this.valiantRig.poseBone('Leg_Upper_L', strideDeg, 0, 0);
          this.valiantRig.poseBone('Leg_Lower_L', isWalking ? -Math.abs(Math.cos(this.walkPhase)) * 34 : -6, 0, 0);
          this.valiantRig.poseBone('Foot_L', -strideDeg * 0.35, 0, 0);
          this.valiantRig.poseBone('Leg_Upper_R', -strideDeg, 0, 0);
          this.valiantRig.poseBone('Leg_Lower_R', isWalking ? -Math.abs(Math.sin(this.walkPhase)) * 34 : -6, 0, 0);
          this.valiantRig.poseBone('Foot_R', strideDeg * 0.35, 0, 0);
        } else {
          this.valiantRig.poseBone('FrontSkirt_L', 20, 0, 0);
          this.valiantRig.poseBone('FrontSkirt_R', 16, 0, 0);
          this.valiantRig.poseBone('Leg_Upper_L', 24, 0, 0);
          this.valiantRig.poseBone('Leg_Lower_L', -38, 0, 0);
          this.valiantRig.poseBone('Foot_L', 18, 0, 0);
          this.valiantRig.poseBone('Leg_Upper_R', 10, 0, 0);
          this.valiantRig.poseBone('Leg_Lower_R', -18, 0, 0);
          this.valiantRig.poseBone('Foot_R', 14, 0, 0);
        }

        const wingOpen = this.jetSmooth * 22;
        this.valiantRig.poseBone('Wing_L1', 8 + wingOpen * 0.4, 8, -10 - wingOpen);
        this.valiantRig.poseBone('Wing_R1', 8 + wingOpen * 0.4, -8, 10 + wingOpen);
        this.valiantRig.poseBone('Wing_L2', -6 - wingOpen * 0.3, 6, -6 - wingOpen * 0.6);
        this.valiantRig.poseBone('Wing_R2', -6 - wingOpen * 0.3, -6, 6 + wingOpen * 0.6);

        if (this.saberSwing.active && activeSaberPose) {
          this.valiantRig.poseBone(
            'Arm_Upper_R',
            (activeSaberPose.shoulderXDeg || 0) + (recoilPoseDeg.armRecoilDeg || 0) * 0.6,
            activeSaberPose.shoulderYDeg || 0,
            activeSaberPose.shoulderZDeg || 0,
          );
          this.valiantRig.poseBone('Arm_Lower_R', activeSaberPose.elbowXDeg || 16, 8, 8);
          this.valiantRig.poseBone(
            'Hand_R',
            activeSaberPose.wristXDeg || 0,
            -(activeSaberPose.wristYDeg || 0),
            -(activeSaberPose.wristZDeg || 0),
          );
        } else {
          this.valiantRig.poseBone('Arm_Upper_R', 52 + pitchDeg * 0.8 + (recoilPoseDeg.armRecoilDeg || 0) * 0.5, -8, -12);
          this.valiantRig.poseBone('Arm_Lower_R', 20, 4, 4);
          this.valiantRig.poseBone('Hand_R', 0, 0, 0);
        }

        const gBlend = this.shieldState.barrierActive ? 1.0 : 0.0;
        this.valiantRig.poseBone('Arm_Upper_L', lerp(24, 54, gBlend), -lerp(4, 10, gBlend), -lerp(18, 22, gBlend));
        this.valiantRig.poseBone('Arm_Lower_L', lerp(26, 10, gBlend), lerp(6, 15, gBlend), 0);
        this.valiantRig.poseBone('Hand_L', 0, 0, 0);

        for (let i = 0; i < this.valiantRig.thrusterPlumes.length; i++) {
          const tp = this.valiantRig.thrusterPlumes[i];
          if (this.jetSmooth > 0.05) {
            tp.rig.visible = true;
            const flicker = 0.88 + Math.sin(matchTimeSec * 42 + i * 1.7) * 0.14;
            const plumeLen = tp.baseLen * (0.4 + this.jetSmooth * 0.85) * flicker;
            const plumeWidth = 0.78 + this.jetSmooth * 0.36;
            tp.rig.scale.set(plumeWidth, plumeLen, plumeWidth);
            if (tp.outerMat?.uniforms?.uTime) tp.outerMat.uniforms.uTime.value = matchTimeSec;
            if (tp.outerMat?.uniforms?.uIntensity) tp.outerMat.uniforms.uIntensity.value = this.jetSmooth;
            if (tp.coreMat?.uniforms?.uTime) tp.coreMat.uniforms.uTime.value = matchTimeSec;
            if (tp.coreMat?.uniforms?.uIntensity) tp.coreMat.uniforms.uIntensity.value = this.jetSmooth;
          } else {
            tp.rig.visible = false;
          }
        }

        const sn = this.valiantRig.shieldNodes;
        const showBarrier = Boolean(this.shieldState.barrierActive && !penalties.armLDisabled);
        if (sn.barrierMesh && sn.barrierMat) {
          sn.barrierMesh.visible = showBarrier;
          if (showBarrier) {
            sn.barrierMat.uniforms.uTime.value = matchTimeSec;
            sn.barrierMat.uniforms.uOpacity.value = 0.92;
            sn.barrierMat.uniforms.uFlash.value = 0;
          }
        }
        if (this.valiantRig.saberFx.coreMat) {
          this.valiantRig.saberFx.coreMat.uniforms.uTime.value = matchTimeSec;
        }
        if (this.valiantRig.saberFx.light) {
          this.valiantRig.saberFx.light.intensity = this.saberSwing.active && !penalties.armRDisabled ? 2.9 : 0;
        }
      } else if (this.parts) {
        const stride = this.physics.grounded && horzSpd > 0.6 ? Math.sin(this.walkPhase) * 0.42 : 0.08;
        this.parts.legL.rotation.x = stride;
        this.parts.legR.rotation.x = -stride;

        this.parts.armR.rotation.set(
          this.saberSwing.active ? armSwingPitch : -0.45 + this.aimPitch * 0.5,
          armSwingYaw,
          0,
        );
        this.parts.armL.rotation.set(this.shieldState.barrierActive ? -0.95 : -0.25, 0, this.shieldState.barrierActive ? 0.35 : 0);

        if (this.parts.plumeL && this.parts.plumeR) {
          const boostGlow = (intent.quickBoost || intent.jumpHeld || horzSpd > 3.5) ? 1.35 : 0.45;
          this.parts.plumeL.scale.set(1, boostGlow + Math.sin(matchTimeSec * 28) * 0.12, 1);
          this.parts.plumeR.scale.set(1, boostGlow + Math.cos(matchTimeSec * 28) * 0.12, 1);
        }
        if (this.shieldBarrierMesh) {
          this.shieldBarrierMesh.visible = Boolean(this.shieldState.barrierActive);
        }
        if (this.saberBladeMesh && this.saberLight) {
          const showBlade = Boolean(this.saberSwing.active);
          this.saberBladeMesh.visible = showBlade;
          this.saberLight.intensity = showBlade ? 3.2 : 0;
        }
      }

      if (this.hitFlash > 0) {
        this.hitFlash -= dt;
        for (const m of this.armorMats) {
          m.emissive.set(isStaggered ? '#fbbf24' : '#ffffff');
          m.emissiveIntensity = isStaggered ? 0.75 : 1.4;
        }
      } else {
        for (const m of this.armorMats) {
          m.emissive.set(isStaggered ? '#f59e0b' : '#000000');
          m.emissiveIntensity = isStaggered ? 0.45 : 0;
        }
      }
    },

    getLockTargetWorldPos(outVec) {
      if (!this.active || !this.physics) return null;
      const target = outVec || _tmpVec;
      return target.set(this.physics.x, this.physics.y + 1.65, this.physics.z);
    },
  };

  return manager;
}
