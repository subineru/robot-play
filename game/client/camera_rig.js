/**
 * Camera Rig, Hangar Showcase Orbit, FPS Cockpit & TPS Over-Shoulder Controller (Layer 1 Client).
 * Owns camera mode switching, front-inspect orbit, hangar menu target smoothing,
 * and 3D->2D projected armory pins in the Hangar Shell.
 */
import * as THREE from 'three';
import { CAMERA_MODES } from '../shared/constants.js?v=20261116_t75e';
import { clamp, lerp } from '../shared/kinematics.js?v=20261116_t75e';
import { ARMORY_SLOTS, resolveMenuCameraRig } from '../shared/menu_state.js?v=20261116_t75e';

export function createCameraRigManager({ camera, settingsStore, getMechaRig, onCameraChanged, showToast }) {
  const manager = {
    cameraMode: CAMERA_MODES.TPS,
    orbitActive: false,
    orbitYaw: Math.PI * 0.85,
    orbitPitch: 0.14,
    orbitDistance: 4.5,

    menuOrbitYawOffset: 0,
    menuOrbitPitch: 0.14,
    menuOrbitDistance: 4.5,
    menuCurrentTargetY: 1.4,
    menuStageBias: 0.28,
    menuDesiredYaw: 0,
    menuDesiredPitch: 0.14,
    menuDesiredDist: 4.5,
    menuDesiredTargetY: 1.4,
    menuFollowTabPose: false,
    menuDragging: false,
    armoryPinHovered: false,

    _tmpDesiredCamPos: new THREE.Vector3(),
    _tmpCamOffset: new THREE.Vector3(),
    _tmpLookAtPt: new THREE.Vector3(),
    _tmpEyeWorld: new THREE.Vector3(),
    _tmpLookCtr: new THREE.Vector3(),
    _tmpOrbitOff: new THREE.Vector3(),
    _tmpEuler: new THREE.Euler(0, 0, 0, 'YXZ'),
    _tmpPinProj: new THREE.Vector3(),

    init(menuState) {
      const initRig = resolveMenuCameraRig(menuState);
      this.menuOrbitYawOffset = initRig.orbitYawOffset;
      this.menuOrbitPitch = initRig.orbitPitch;
      this.menuOrbitDistance = initRig.orbitDistance;
      this.menuCurrentTargetY = initRig.targetHeightOffset;
      this.menuStageBias = initRig.stageBias ?? 0;
      this.menuDesiredYaw = initRig.orbitYawOffset;
      this.menuDesiredPitch = initRig.orbitPitch;
      this.menuDesiredDist = initRig.orbitDistance;
      this.menuDesiredTargetY = initRig.targetHeightOffset;
    },

    applyCameraMode(mode, notify = true) {
      const nextMode = mode === CAMERA_MODES.FPS_COCKPIT ? CAMERA_MODES.FPS_COCKPIT : CAMERA_MODES.TPS;
      this.cameraMode = nextMode;
      const isFps = nextMode === CAMERA_MODES.FPS_COCKPIT;
      if (isFps) this.orbitActive = false;
      const rig = getMechaRig();
      if (rig?.cockpitGroup) rig.cockpitGroup.visible = isFps;
      if (rig?.fpsHideNodes) {
        for (const node of rig.fpsHideNodes) {
          node.visible = !isFps;
        }
      }
      document.body.classList.toggle('fps-mode', isFps);
      if (notify) onCameraChanged?.(this.cameraMode);
    },

    toggleCameraMode() {
      const nextMode = this.cameraMode === CAMERA_MODES.TPS ? CAMERA_MODES.FPS_COCKPIT : CAMERA_MODES.TPS;
      this.applyCameraMode(nextMode, true);
    },

    toggleOrbitInspect(yaw) {
      if (this.cameraMode === CAMERA_MODES.FPS_COCKPIT) {
        this.toggleCameraMode();
      }
      this.orbitActive = !this.orbitActive;
      if (this.orbitActive) {
        this.orbitYaw = yaw + Math.PI * 0.88;
        this.orbitPitch = 0.12;
        showToast?.('開啟正面檢視鏡頭 (C) — 拖曳或滑鼠可 360° 看正面，滾輪縮放');
      } else {
        showToast?.('返回戰鬥過肩視角');
      }
    },

    syncMenuDesiredRig(state) {
      const rig = resolveMenuCameraRig(state);
      this.menuDesiredYaw = rig.orbitYawOffset;
      this.menuDesiredPitch = rig.orbitPitch;
      this.menuDesiredDist = rig.orbitDistance;
      this.menuDesiredTargetY = rig.targetHeightOffset;
      this.menuFollowTabPose = true;
    },

    adjustMenuOrbit(dx, dy) {
      this.menuFollowTabPose = false;
      this.menuOrbitYawOffset -= dx * 0.0062;
      this.menuOrbitPitch = clamp(this.menuOrbitPitch + dy * 0.0046, -0.25, 0.78);
    },

    adjustMenuZoom(deltaY) {
      this.menuFollowTabPose = false;
      this.menuOrbitDistance = clamp(this.menuOrbitDistance + Math.sign(deltaY) * 0.35, 2.1, 7.6);
    },

    adjustCombatOrbitZoom(deltaY) {
      this.orbitDistance = clamp(this.orbitDistance + Math.sign(deltaY) * 0.4, 2.2, 10.5);
    },

    stepCameraAndPins(
      dt,
      now,
      {
        inMainMenu,
        menuState,
        quickBoost,
        physics,
        bodyYaw,
        yaw,
        pitch,
        crouch,
        guardBlend,
        cameraShake,
        fwdInput,
        strafe,
        pistolRecoil,
        onUpdateArmoryPins,
        onUpdateCockpitScreens,
      },
    ) {
      const settings = settingsStore.get();
      const baseFov = settings?.controls?.baseFov ?? 60;
      const targetFov = inMainMenu ? Math.min(62, baseFov) : quickBoost ? Math.min(102, baseFov + 12) : baseFov;
      if (Math.abs(camera.fov - targetFov) > 0.1) {
        camera.fov = lerp(camera.fov, targetFov, 1 - Math.exp(-12 * dt));
        camera.updateProjectionMatrix();
      }

      const shakeScale = settings?.graphics?.cameraShakeScale ?? 1.0;
      const shakeX = (Math.random() - 0.5) * cameraShake * shakeScale;
      const shakeY = (Math.random() - 0.5) * cameraShake * shakeScale;
      const mechaRig = getMechaRig();

      if (inMainMenu) {
        const rigSpec = resolveMenuCameraRig(menuState);
        const tgtY = this.menuDesiredTargetY ?? rigSpec.targetHeightOffset;
        this.menuCurrentTargetY = lerp(this.menuCurrentTargetY ?? rigSpec.targetHeightOffset, tgtY, 1 - Math.exp(-6.5 * dt));
        if (this.menuFollowTabPose) {
          const k = 1 - Math.exp(-6.5 * dt);
          this.menuOrbitYawOffset = lerp(this.menuOrbitYawOffset, this.menuDesiredYaw, k);
          this.menuOrbitPitch = lerp(this.menuOrbitPitch, this.menuDesiredPitch, k);
          this.menuOrbitDistance = lerp(this.menuOrbitDistance, this.menuDesiredDist, k);
          if (
            Math.abs(this.menuOrbitYawOffset - this.menuDesiredYaw) < 0.015 &&
            Math.abs(this.menuOrbitPitch - this.menuDesiredPitch) < 0.01 &&
            Math.abs(this.menuOrbitDistance - this.menuDesiredDist) < 0.04
          ) {
            this.menuFollowTabPose = false;
          }
        } else if (!this.menuDragging && !this.armoryPinHovered) {
          this.menuOrbitYawOffset += rigSpec.autoRotateSpeed * dt;
        }

        if (mechaRig?.hangarTurntableRing?.material) {
          mechaRig.hangarTurntableRing.material.opacity = 0.56 + Math.sin(now * 0.0024) * 0.16;
        }

        const menuYaw = bodyYaw + this.menuOrbitYawOffset;
        const targetStageBias =
          window.innerWidth >= 900 && !menuState.panelCollapsed ? (rigSpec.stageBias ?? 0) : 0;
        this.menuStageBias = lerp(this.menuStageBias ?? targetStageBias, targetStageBias, 1 - Math.exp(-7 * dt));
        const stageBias = this.menuStageBias;
        const lookCtr = this._tmpLookCtr.set(
          physics.x - Math.cos(menuYaw) * stageBias,
          physics.y + this.menuCurrentTargetY,
          physics.z + Math.sin(menuYaw) * stageBias,
        );
        const off = this._tmpOrbitOff.set(
          Math.sin(menuYaw) * Math.cos(this.menuOrbitPitch) * this.menuOrbitDistance,
          Math.sin(this.menuOrbitPitch) * this.menuOrbitDistance,
          Math.cos(menuYaw) * Math.cos(this.menuOrbitPitch) * this.menuOrbitDistance,
        );
        const desired = this._tmpDesiredCamPos.copy(lookCtr).add(off);
        desired.y = Math.max(0.45, desired.y);
        camera.position.lerp(desired, 1 - Math.exp(-10 * dt));
        camera.lookAt(lookCtr);
        camera.updateMatrixWorld();

        if (
          menuState.mainTab === 'armory' &&
          !menuState.panelCollapsed &&
          !menuState.modalOpen &&
          typeof onUpdateArmoryPins === 'function'
        ) {
          const pins = [];
          const vw = window.innerWidth;
          const vh = window.innerHeight;
          for (const slot of ARMORY_SLOTS) {
            let hasPos = false;
            if (slot.id === 'pilot' && mechaRig?.hangarPilotGroup) {
              mechaRig.hangarPilotGroup.getWorldPosition(this._tmpPinProj);
              this._tmpPinProj.y += 1.56;
              hasPos = true;
            } else if (mechaRig?.bones?.[slot.boneHint]) {
              mechaRig.bones[slot.boneHint].getWorldPosition(this._tmpPinProj);
              if (slot.id === 'body') this._tmpPinProj.y += 0.14;
              else if (slot.id === 'l_back' || slot.id === 'r_back') this._tmpPinProj.y += 0.12;
              else if (slot.id === 'armor') this._tmpPinProj.y -= 0.04;
              hasPos = true;
            }
            if (!hasPos) continue;
            this._tmpPinProj.project(camera);
            const inFront = this._tmpPinProj.z >= -1 && this._tmpPinProj.z <= 1;
            const sx = (this._tmpPinProj.x * 0.5 + 0.5) * vw;
            const sy = (-this._tmpPinProj.y * 0.5 + 0.5) * vh;
            pins.push({
              id: slot.id,
              code: slot.code,
              label: slot.label,
              status: slot.status,
              x: sx,
              y: sy,
              visible: inFront && sx >= 24 && sx <= vw - 24 && sy >= 56 && sy <= vh - 24,
            });
          }
          onUpdateArmoryPins(pins);
        } else {
          onUpdateArmoryPins?.(null);
        }
      } else if (this.cameraMode === CAMERA_MODES.FPS_COCKPIT && mechaRig?.cockpitGroup) {
        const eyeWorld = this._tmpEyeWorld.set(0, 0.08, -0.02);
        mechaRig.cockpitGroup.localToWorld(eyeWorld);
        camera.position.set(eyeWorld.x + shakeX * 0.5, eyeWorld.y + shakeY * 0.5, eyeWorld.z);
        camera.rotation.set(pitch, yaw, 0, 'YXZ');

        if (mechaRig.cockpitSticks?.left && mechaRig.cockpitSticks?.right) {
          mechaRig.cockpitSticks.left.rotation.x = fwdInput * 0.28;
          mechaRig.cockpitSticks.left.rotation.z = -strafe * 0.28;
          mechaRig.cockpitSticks.right.rotation.x = pitch * 0.45 + pistolRecoil * 0.2;
        }
        onUpdateCockpitScreens?.();
      } else if (this.orbitActive) {
        const lookCtr = this._tmpLookCtr.set(physics.x, physics.y + 1.38 - crouch * 0.55, physics.z);
        const off = this._tmpOrbitOff.set(
          Math.sin(this.orbitYaw) * Math.cos(this.orbitPitch) * this.orbitDistance,
          Math.sin(this.orbitPitch) * this.orbitDistance,
          Math.cos(this.orbitYaw) * Math.cos(this.orbitPitch) * this.orbitDistance,
        );
        const desired = this._tmpDesiredCamPos.copy(lookCtr).add(off);
        desired.y = Math.max(0.35, desired.y);
        camera.position.lerp(desired, 1 - Math.exp(-16 * dt));
        camera.lookAt(lookCtr);
      } else {
        const guardCamSide = lerp(1.15, 0.72, guardBlend * (1 - crouch));
        const camOffset = this._tmpCamOffset.set(guardCamSide, 2.35 - crouch * 0.65, 5.4);
        camOffset.applyEuler(this._tmpEuler.set(pitch * 0.75, yaw, 0, 'YXZ'));
        const desiredPos = this._tmpDesiredCamPos.set(
          physics.x + camOffset.x + shakeX,
          Math.max(0.45, physics.y + camOffset.y + shakeY),
          physics.z + camOffset.z,
        );
        camera.position.lerp(desiredPos, 1 - Math.exp(-18 * dt));
        const lookAtPt = this._tmpLookAtPt.set(
          physics.x - Math.sin(yaw) * 6.5,
          physics.y + 1.55 + Math.sin(pitch) * 6.0 - crouch * 0.55,
          physics.z - Math.cos(yaw) * 6.5,
        );
        camera.lookAt(lookAtPt);
      }
      camera.updateMatrixWorld();
    },

    projectTargetLockPin({ playerPhysics, targetWorldPos }) {
      if (!targetWorldPos || !playerPhysics) return null;
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      const distM = Math.hypot(
        targetWorldPos.x - playerPhysics.x,
        (targetWorldPos.y - 1.65) - playerPhysics.y,
        targetWorldPos.z - playerPhysics.z,
      );
      this._tmpPinProj.copy(targetWorldPos).project(camera);
      const behind = this._tmpPinProj.z > 1 || this._tmpPinProj.z < -1;
      let sx = (this._tmpPinProj.x * 0.5 + 0.5) * vw;
      let sy = (-this._tmpPinProj.y * 0.5 + 0.5) * vh;
      if (behind) {
        sx = vw - sx;
        sy = vh - 36;
      }
      const onScreen = !behind && sx >= 36 && sx <= vw - 36 && sy >= 56 && sy <= vh - 36;
      const clampedX = clamp(sx, 48, vw - 48);
      const clampedY = clamp(sy, 72, vh - 48);
      return { x: clampedX, y: clampedY, distM, onScreen };
    },
  };

  return manager;
}
