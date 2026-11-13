/**
 * Pure Mecha Kinematics, Modular Rigid-Body Physics ODEs, IK Ground Clamping,
 * Weapon Drop/Crouch-Pickup State Machine, and Destructible Prop Helpers.
 * SSOT: MASTER_SPEC.md [M2.4, M2.4.1] — Zero DOM/Three.js dependencies for Node TDD.
 */
import {
  GRAVITY_MPS2,
  MECHA_BASE_MASS_KG,
  MECHA_BASE_THRUST_N,
  MODULAR_WEAPONS,
} from '../shared/constants.js';

const DEG2RAD = Math.PI / 180;

export function clamp(v, lo, hi) {
  return Math.max(lo, Math.min(hi, v));
}

export function lerp(a, b, t) {
  return a + (b - a) * clamp(t, 0, 1);
}

export function smoothstep(edge0, edge1, x) {
  if (edge1 <= edge0) return x >= edge1 ? 1 : 0;
  const t = clamp((x - edge0) / (edge1 - edge0), 0, 1);
  return t * t * (3 - 2 * t);
}

/**
 * Snap-Servo curve ([M2.4]): completes >= 88% stroke within the first 30% of normalized time u,
 * briefly overshoots past 1.0 for hydraulic snap feel, and settles smoothly to 1.0 at u=1.
 */
export function snapServo(u, overshoot = 0.06) {
  if (u <= 0) return 0;
  if (u >= 1) return 1;
  if (u <= 0.3) {
    const s = u / 0.3;
    return (1 + overshoot) * Math.pow(Math.sin(0.5 * Math.PI * s), 0.55);
  }
  const s = (u - 0.3) / 0.7;
  const decay = (1 - s) * (1 - s);
  return 1 + overshoot * decay * Math.cos(1.5 * Math.PI * s);
}

/**
 * Boost Skating directional body lean ([M2.4]): strafe A/D banks +/-22 deg, forward/back +/-14 deg.
 */
export function computeSkateTilt({ strafe = 0, forward = 0, maxRollDeg = 22, maxPitchDeg = 14 } = {}) {
  const rollDeg = clamp(strafe, -1, 1) * maxRollDeg;
  const pitchDeg = clamp(forward, -1, 1) * maxPitchDeg;
  return {
    rollDeg,
    pitchDeg,
    rollRad: rollDeg * DEG2RAD,
    pitchRad: pitchDeg * DEG2RAD,
  };
}

/**
 * [M2.4.1 #1] Coupled modular mass, max thrust, and Thrust-to-Weight Ratio (TWR).
 */
export function computeModularMassAndThrust(loadoutIds = []) {
  let modMass = 0;
  let modThrust = 0;
  for (const id of loadoutIds) {
    const spec = MODULAR_WEAPONS[id];
    if (!spec) continue;
    modMass += spec.weightKg || 0;
    modThrust += spec.thrustBonusN || 0;
  }
  const totalMassKg = MECHA_BASE_MASS_KG + modMass;
  const maxThrustN = MECHA_BASE_THRUST_N + modThrust;
  const twr = maxThrustN / (totalMassKg * GRAVITY_MPS2);
  const weightPenaltyFactor = clamp(MECHA_BASE_MASS_KG / totalMassKg, 0.78, 1.08);
  return { totalMassKg, maxThrustN, twr, weightPenaltyFactor };
}

/**
 * [M2.4.1 #3] Ground-Clamp Coplanar Foot Lock <-> Aerial Toe-Drop + Crouch-Pickup blend.
 */
export function solveGroundFootAlignment({
  pelvisY = 1.04,
  standHeightM = 1.04,
  hipFlareDeg = 8.5,
  hipPitchDeg = 0,
  kneePitchDeg = 0,
  crouchBlend = 0,
} = {}) {
  const c = clamp(crouchBlend, 0, 1);
  const alphaAir = smoothstep(0.05, 1.15, Math.max(0, pelvisY - standHeightM)) * (1 - c);

  // Crouch targets align directly with verified Blender crouch_pickup pose
  const effHipPitch = lerp(hipPitchDeg, 68, c);
  const effKneePitch = lerp(kneePitchDeg, -126, c);
  const effHipFlare = lerp(hipFlareDeg, 14, c);
  const effPelvisDrop = 0.778 * c;
  const frontSkirtPitchDeg = lerp(12, 70, c);
  const frontSkirtFlareDeg = lerp(4, 14, c);

  // Ground ankle lock cancels thigh/shin cumulative rotation so soles remain flush on Z/Y=0
  const groundAnklePitch = -(effHipPitch + effKneePitch);
  const ankleRollLDeg = lerp(-effHipFlare, 0, alphaAir);
  const ankleRollRDeg = lerp(+effHipFlare, 0, alphaAir);

  // Aerial aerodynamics blend toward +28 deg toe-drop, +18 deg knee flex, +12 deg booster flare
  const toeDropDeg = lerp(0, 28, alphaAir);
  const anklePitchDeg = lerp(groundAnklePitch, -toeDropDeg, alphaAir);
  const kneeAirFlexDeg = lerp(0, 18, alphaAir);
  const boosterFlareDeg = lerp(0, 12, alphaAir);

  return {
    alphaAir,
    hipFlareDeg: effHipFlare,
    hipPitchDeg: effHipPitch,
    kneePitchDeg: effKneePitch - kneeAirFlexDeg,
    anklePitchDeg,
    ankleRollLDeg,
    ankleRollRDeg,
    toeDropDeg,
    kneeAirFlexDeg,
    boosterFlareDeg,
    pelvisDropM: effPelvisDrop,
    frontSkirtPitchDeg,
    frontSkirtFlareDeg,
  };
}

/**
 * [M2.4.1 #2] Spring-damper normal ground force & underdamped (zeta = 0.72) landing suspension.
 */
export function stepLandingSuspension(state, { footY = 0, impactVy = 0, dt = 1 / 60 } = {}) {
  const kGround = 2.4e6;
  const cGround = 1.8e5;
  const zeta = 0.72;
  const omegaN = 20.0;
  const omegaD = omegaN * Math.sqrt(1 - zeta * zeta);

  let normalForceN = 0;
  if (footY <= 0) {
    normalForceN = Math.max(0, -kGround * footY - cGround * impactVy);
  }

  let { active = false, elapsed = 0, impactSpeed = 0, deflectionY = 0 } = state || {};
  if (footY <= 0 && impactVy < -1.5 && !active) {
    active = true;
    elapsed = 0;
    impactSpeed = Math.abs(impactVy);
  }

  if (active) {
    elapsed += dt;
    const strokeSpeed = clamp(impactSpeed * 1.45, 2.2, 14.0);
    deflectionY = -(strokeSpeed / omegaD) * Math.exp(-zeta * omegaN * elapsed) * Math.sin(omegaD * elapsed);
    if (elapsed >= 0.38 && Math.abs(deflectionY) < 0.004) {
      active = false;
      deflectionY = 0;
    }
  } else {
    deflectionY = 0;
  }

  return { active, elapsed, impactSpeed, deflectionY, normalForceN };
}

/**
 * Consume impulse EN on Space jump takeoff; forbids jumping below `cost`.
 */
export function consumeJumpImpulse(state = {}, cost = 12) {
  const en = state.en ?? 0;
  if (en < cost) {
    return {
      jumped: false,
      en,
      enRegenDelaySec: state.enRegenDelaySec ?? 0,
    };
  }
  return {
    jumped: true,
    en: Math.max(0, en - cost),
    enRegenDelaySec: Math.max(state.enRegenDelaySec ?? 0, 0.42),
  };
}

/**
 * [M2.4.1 #4] Coupled 3D Aerial Flight & Skate Dynamics with quadratic drag & EN management.
 */
export function stepAerialFlight(
  state,
  input = {},
  dt = 1 / 60,
  massThrust = computeModularMassAndThrust([]),
) {
  const { totalMassKg, maxThrustN, weightPenaltyFactor } = massThrust;
  const {
    moveX = 0,
    moveZ = 0,
    jumpHeld = false,
    quickBoost = false,
    walkOnly = false,
    throttle = 1,
    pitchRad = 0,
    rollRad = 0,
  } = input;

  let {
    x = 0,
    y = 0,
    z = 0,
    vx = 0,
    vy = 0,
    vz = 0,
    en = 100,
    maxEn = 100,
    enRegenDelaySec = 0,
    grounded = true,
  } = state;

  enRegenDelaySec = Math.max(0, enRegenDelaySec - dt);

  const rho = 1.225;
  const cdA = 14.0;
  const cHover = 115000;

  let ay = -GRAVITY_MPS2;
  let fx = 0;
  let fz = 0;

  // Horizontal walk vs thruster skate/boost
  const moveLen = Math.hypot(moveX, moveZ) || 1;
  const nx = moveX !== 0 || moveZ !== 0 ? moveX / moveLen : 0;
  const nz = moveX !== 0 || moveZ !== 0 ? moveZ / moveLen : 0;

  const boostActive = Boolean(quickBoost) && en > 0.5;
  const hoverActive = Boolean(jumpHeld) && en > 0.5;

  let modeMult = 1.0;
  if (boostActive) {
    modeMult = 1.95;
  } else if (grounded && walkOnly) {
    modeMult = 0.44;
  }
  const skateForce = modeMult * maxThrustN * 0.85 * weightPenaltyFactor;
  fx += nx * skateForce;
  fz += nz * skateForce;

  if (boostActive) {
    en = Math.max(0, en - 30 * dt);
    enRegenDelaySec = Math.max(enRegenDelaySec, 0.42);
  }

  // Vertical thrust with pitch/roll cosine coupling when hovering
  if (hoverActive) {
    const cosCoupling = Math.max(0.25, Math.cos(pitchRad) * Math.cos(rollRad));
    const liftForce = clamp(throttle, 0, 1) * maxThrustN * cosCoupling;
    ay += liftForce / totalMassKg;
    en = Math.max(0, en - 24 * dt);
    enRegenDelaySec = Math.max(enRegenDelaySec, 0.38);
    grounded = false;
  } else if (!boostActive && enRegenDelaySec <= 0) {
    if (grounded) {
      en = Math.min(maxEn, en + 34 * dt);
    } else {
      en = Math.min(maxEn, en + 10 * dt);
    }
  }

  // Quadratic aero drag + hover stabilization
  const speed = Math.hypot(vx, vy, vz);
  const dragCoeff = 0.5 * rho * cdA * speed;
  const ax = (fx - dragCoeff * vx - cHover * vx) / totalMassKg;
  ay += (-dragCoeff * vy) / totalMassKg;
  const az = (fz - dragCoeff * vz - cHover * vz) / totalMassKg;

  vx += ax * dt;
  vy += ay * dt;
  vz += az * dt;

  x += vx * dt;
  y += vy * dt;
  z += vz * dt;

  if (y <= 0) {
    y = 0;
    if (vy < 0) vy = 0;
    grounded = true;
  }

  return { x, y, z, vx, vy, vz, en, maxEn, enRegenDelaySec, grounded };
}

/**
 * Solid 3D AABB collision + rooftop landing support against intact buildings & dummy pillar.
 * Allows side wall sliding without penetration AND standing/walking/jumping on rooftops.
 */
export function resolveWorldCollisions(state, prevY, destructibles = [], dummy = null, playerRadius = 0.65) {
  let { x, y, z, vx, vy, vz, grounded } = state;
  let supportHeight = 0;

  for (const b of destructibles) {
    // Solid throughout 'intact', 'damaged', AND entire 'collapsing' sequence — passable ONLY after 'destroyed'!
    if (!b || b.state === 'destroyed') continue;
    const extW = (b.halfW || 1.5) + playerRadius;
    const extD = (b.halfD || 1.5) + playerRadius;
    const dx = x - b.x;
    const dz = z - b.z;
    if (Math.abs(dx) >= extW || Math.abs(dz) >= extD) continue;

    const collapseFrac = b.state === 'collapsing' ? clamp(b.collapseProgress || 0, 0, 1) : 0;
    const effHeight = b.height * (1 - collapseFrac * 0.9);

    // 1. Rooftop landing & standing support (with slight top lip tolerance for seamless roof walk)
    const roofTol = 0.24;
    if (b.state !== 'collapsing' && prevY >= effHeight - roofTol && y <= effHeight + 0.04 && vy <= 0.15) {
      if (effHeight > supportHeight) supportHeight = effHeight;
      continue;
    }

    // 2. Solid side wall push-out & velocity slide along face normal
    if (y < effHeight + 0.35 || b.state === 'collapsing') {
      const penX = extW - Math.abs(dx);
      const penZ = extD - Math.abs(dz);
      if (penX < penZ) {
        const sgn = dx >= 0 ? 1 : -1;
        x = b.x + sgn * extW;
        if (vx * sgn < 0) vx = 0;
      } else {
        const sgn = dz >= 0 ? 1 : -1;
        z = b.z + sgn * extD;
        if (vz * sgn < 0) vz = 0;
      }
    }
  }

  // Prevent walking inside intact Target Dummy cylinder
  if (dummy && (dummy.respawnTimer ?? 0) <= 0 && y < 2.45) {
    const minR = (dummy.radius ?? 0.85) + playerRadius;
    const ddx = x - dummy.x;
    const ddz = z - dummy.z;
    const dist = Math.hypot(ddx, ddz);
    if (dist > 1e-4 && dist < minR) {
      const nx = ddx / dist;
      const nz = ddz / dist;
      x = dummy.x + nx * minR;
      z = dummy.z + nz * minR;
      const radVel = vx * nx + vz * nz;
      if (radVel < 0) {
        vx -= radVel * nx;
        vz -= radVel * nz;
      }
    } else if (dist <= 1e-4) {
      z = dummy.z + minR;
    }
  }

  if (supportHeight > 0 && y <= supportHeight) {
    y = supportHeight;
    if (vy < 0) vy = 0;
    grounded = true;
  } else if (y > 0.04) {
    // Stepped off a roof edge -> release grounded so gravity drops mecha smoothly
    grounded = false;
  }

  return {
    physics: { ...state, x, y, z, vx, vy, vz, grounded },
    supportHeight,
  };
}

/**
 * Weapon Drop (`F`) & Crouch Pickup (`R`) State Machine.
 */
export function createWeaponPickupState() {
  return {
    hasPistol: true,
    hasSaber: true,
    saberIgnited: true,
    droppedItems: [],
    pickingUp: false,
    pickupTimer: 0,
    pickupDuration: 0.52,
    crouchBlend: 0,
    attachedInSweep: false,
  };
}

export function triggerDropWeapons(state, mechaPos = { x: 0, y: 0, z: 0 }, mechaYaw = 0) {
  if (!state.hasPistol && !state.hasSaber) return state;
  const fwdX = -Math.sin(mechaYaw);
  const fwdZ = -Math.cos(mechaYaw);
  const rightX = Math.cos(mechaYaw);
  const rightZ = -Math.sin(mechaYaw);

  const droppedItems = [...state.droppedItems];
  if (state.hasPistol) {
    droppedItems.push({
      kind: 'pistol',
      x: mechaPos.x + fwdX * 0.95 - rightX * 0.34,
      y: 0.08,
      z: mechaPos.z + fwdZ * 0.95 - rightZ * 0.34,
      yaw: mechaYaw + 0.35,
    });
  }
  if (state.hasSaber) {
    droppedItems.push({
      kind: 'saber',
      x: mechaPos.x + fwdX * 0.95 + rightX * 0.34,
      y: 0.08,
      z: mechaPos.z + fwdZ * 0.95 + rightZ * 0.34,
      yaw: mechaYaw - 0.3,
    });
  }

  return {
    ...state,
    hasPistol: false,
    hasSaber: false,
    saberIgnited: false,
    droppedItems,
  };
}

export function stepWeaponPickup(state, mechaPos = { x: 0, y: 0, z: 0 }, requestPickup = false, dt = 1 / 60) {
  let next = { ...state };

  if (requestPickup && !next.pickingUp && next.droppedItems.length > 0) {
    const anyInRange = next.droppedItems.some((item) => Math.hypot(item.x - mechaPos.x, item.z - mechaPos.z) <= 3.6);
    if (anyInRange) {
      next.pickingUp = true;
      next.pickupTimer = 0;
      next.attachedInSweep = false;
    }
  }

  if (!next.pickingUp) {
    return next;
  }

  next.pickupTimer += dt;
  const u = clamp(next.pickupTimer / next.pickupDuration, 0, 1);
  // Crouch down during first half (0..0.5), grab at ~0.48, rise cleanly during (0.5..1.0)
  next.crouchBlend = u <= 0.5 ? smoothstep(0, 0.5, u) : 1 - smoothstep(0.5, 1.0, u);

  if (!next.attachedInSweep && u >= 0.46) {
    for (const item of next.droppedItems) {
      if (item.kind === 'pistol') next.hasPistol = true;
      if (item.kind === 'saber') next.hasSaber = true;
    }
    next.droppedItems = [];
    next.saberIgnited = next.hasSaber;
    next.attachedInSweep = true;
  }

  if (u >= 1) {
    next.pickingUp = false;
    next.pickupTimer = 0;
    next.crouchBlend = 0;
  }

  return next;
}

/**
 * Volume-scaled building durability so small shops break cleanly after sustained fire
 * while massive high-rises require heavy prolonged assault before collapsing.
 */
export function computeBuildingDurability(w = 3, d = 3, h = 2) {
  const vol = Math.max(1, (w || 1) * (d || 1) * (h || 1));
  return Math.round(300 + 28 * Math.pow(vol, 0.86));
}

export function damageDestructibleProp(prop, dmg = 0) {
  if (!prop || prop.state === 'destroyed' || prop.state === 'collapsing') return prop;
  const nextHp = Math.max(0, prop.hp - Math.max(0, dmg));
  if (nextHp <= 0) {
    return { ...prop, hp: 0, state: 'collapsing', collapseProgress: 0 };
  }
  return { ...prop, hp: nextHp, state: nextHp < prop.maxHp ? 'damaged' : 'intact' };
}

/**
 * Heavy bipedal armored walk gait cycle (grounded WASD without Shift boost).
 * Features wide armored stance clearance, 3-phase heel-strike -> flat-plant -> toe-off
 * ankle roll, weight-transfer hip sway, and subtle non-repeating stride harmonic variation.
 */
function hydraulicServoWave(phase) {
  const s = Math.sin(phase);
  return Math.tanh(2.15 * s) / Math.tanh(2.15);
}

export function computeWalkCycle({
  phaseRad = 0,
  speedNorm = 0,
  active = true,
  forwardNorm = 1,
  strafeNorm = 0,
} = {}) {
  const amp = active ? clamp(speedNorm, 0, 1) : 0;
  if (amp <= 0.01) {
    return {
      hipPitchLDeg: 0,
      hipPitchRDeg: 0,
      hipRollLDeg: 0,
      hipRollRDeg: 0,
      kneePitchLDeg: 0,
      kneePitchRDeg: 0,
      anklePitchLDeg: 0,
      anklePitchRDeg: 0,
      ankleRollStepLDeg: 0,
      ankleRollStepRDeg: 0,
      frontSkirtPitchLDeg: 12,
      frontSkirtPitchRDeg: 12,
      pelvisBobM: 0,
      pelvisShiftXM: 0,
      pelvisRollDeg: 0,
      pelvisYawDeg: 0,
      torsoTwistDeg: 0,
      torsoPitchBobDeg: 0,
      armSwingDeg: 0,
      weaponStompDipDeg: 0,
    };
  }

  const axisMag = Math.hypot(forwardNorm, strafeNorm);
  const fwdW = axisMag > 0.01 ? Math.abs(forwardNorm) / axisMag : 1;
  const latW = axisMag > 0.01 ? Math.abs(strafeNorm) / axisMag : 0;
  const strafeDir = strafeNorm < -0.05 ? -1 : strafeNorm > 0.05 ? 1 : 0;

  // Non-repeating subtle organic stride variance (breaks "looping GIF" symmetry)
  const varL = 1 + 0.048 * Math.sin(phaseRad * 0.5 + 0.35) + 0.025 * Math.cos(phaseRad * 1.37);
  const varR = 1 + 0.048 * Math.sin(phaseRad * 0.5 + 3.49) + 0.025 * Math.cos(phaseRad * 1.37 + 1.15);

  const sL = hydraulicServoWave(phaseRad);
  const sR = -sL;
  const liftL = Math.pow(Math.max(0, Math.sin(phaseRad - 0.32)), 0.72);
  const liftR = Math.pow(Math.max(0, Math.sin(phaseRad + Math.PI - 0.32)), 0.72);

  // Stance shock absorption dip right after each heel-strike (twice per full cycle)
  const impactAbsorbL = Math.pow(Math.max(0, Math.sin(phaseRad - 0.85)), 1.6);
  const impactAbsorbR = Math.pow(Math.max(0, Math.sin(phaseRad + Math.PI - 0.85)), 1.6);

  // Forward/Back component (pronounced thigh raise + deep knee fold + heel-strike absorb)
  const hipPitchFwdL = (sL >= 0 ? sL * 37 : sL * 21) * varL;
  const hipPitchFwdR = (sR >= 0 ? sR * 37 : sR * 21) * varR;
  const kneePitchFwdL = -10 - 44 * liftL * varL - 10 * impactAbsorbL;
  const kneePitchFwdR = -10 - 44 * liftR * varR - 10 * impactAbsorbR;

  // 3-phase Foot Articulation: Toe-up heel strike -> Flat stance plant -> Toe push-off
  const heelStrikeL = Math.max(0, Math.sin(phaseRad - 0.2)) * Math.max(0, Math.cos(phaseRad - 0.25)) * 11;
  const heelStrikeR = Math.max(0, Math.sin(phaseRad + Math.PI - 0.2)) * Math.max(0, Math.cos(phaseRad + Math.PI - 0.25)) * 11;
  const toePushL = Math.max(0, -sL - 0.42) * 26;
  const toePushR = Math.max(0, -sR - 0.42) * 26;

  // Dynamic wide stance outward hip roll on forward walk so knees/boots never pinch narrow
  const hipRollFwdL = (2.6 + 2.2 * liftL) * varL;
  const hipRollFwdR = (-2.6 - 2.2 * liftR) * varR;

  // Side-strafe stepping component
  const sideStepWaveL = hydraulicServoWave(phaseRad);
  const sideStepWaveR = hydraulicServoWave(phaseRad + Math.PI);
  const hipRollLatL = strafeDir !== 0 ? (sideStepWaveL >= 0 ? sideStepWaveL * 20 : sideStepWaveL * 6) * -strafeDir : 0;
  const hipRollLatR = strafeDir !== 0 ? (sideStepWaveR >= 0 ? sideStepWaveR * 20 : sideStepWaveR * 6) * -strafeDir : 0;
  const hipPitchLatL = 18 * liftL;
  const hipPitchLatR = 18 * liftR;
  const kneePitchLatL = -10 - 34 * liftL;
  const kneePitchLatR = -10 - 34 * liftR;

  const hipPitchLDeg = (fwdW * hipPitchFwdL + latW * hipPitchLatL) * amp;
  const hipPitchRDeg = (fwdW * hipPitchFwdR + latW * hipPitchLatR) * amp;
  const hipRollLDeg = (fwdW * hipRollFwdL + latW * hipRollLatL) * amp;
  const hipRollRDeg = (fwdW * hipRollFwdR + latW * hipRollLatR) * amp;
  const kneePitchLDeg = (fwdW * kneePitchFwdL + latW * kneePitchLatL) * amp;
  const kneePitchRDeg = (fwdW * kneePitchFwdR + latW * kneePitchLatR) * amp;

  const anklePitchLDeg = (-(hipPitchLDeg * 0.85 + kneePitchLDeg * 0.82) + fwdW * (heelStrikeL - toePushL)) * amp;
  const anklePitchRDeg = (-(hipPitchRDeg * 0.85 + kneePitchRDeg * 0.82) + fwdW * (heelStrikeR - toePushR)) * amp;
  const ankleRollStepLDeg = -hipRollLDeg * 0.85;
  const ankleRollStepRDeg = -hipRollRDeg * 0.85;

  const frontSkirtPitchLDeg = Math.max(14, hipPitchLDeg + 10);
  const frontSkirtPitchRDeg = Math.max(14, hipPitchRDeg + 10);

  // Heavy weight transfer over planted foot + double-harmonic suspension compression
  const shiftPhase = hydraulicServoWave(phaseRad - 0.18);
  const pelvisShiftXM = (-shiftPhase * 0.064 * fwdW - shiftPhase * 0.072 * latW * (strafeDir || 1)) * amp;
  const stompPulse = Math.pow(Math.abs(Math.sin(phaseRad - 0.12)), 1.8) * (0.94 + 0.06 * Math.sin(phaseRad * 0.5));

  return {
    hipPitchLDeg,
    hipPitchRDeg,
    hipRollLDeg,
    hipRollRDeg,
    kneePitchLDeg,
    kneePitchRDeg,
    anklePitchLDeg,
    anklePitchRDeg,
    ankleRollStepLDeg,
    ankleRollStepRDeg,
    frontSkirtPitchLDeg,
    frontSkirtPitchRDeg,
    pelvisBobM: -stompPulse * 0.045 * amp,
    pelvisShiftXM,
    pelvisRollDeg: (fwdW * shiftPhase * 3.2 + latW * shiftPhase * 4.5 * (strafeDir || 1)) * amp,
    pelvisYawDeg: sL * 5.6 * fwdW * amp,
    torsoTwistDeg: -sL * 4.8 * fwdW * amp,
    torsoPitchBobDeg: (impactAbsorbL + impactAbsorbR) * 2.4 * fwdW * amp,
    armSwingDeg: 0,
    weaponStompDipDeg: -stompPulse * 2.1 * amp,
  };
}

/**
 * Detect footstep strike events (phase crossing multiples of PI) for heavy footstep SFX & dust.
 */
export function detectWalkFootstep(prevPhase, nextPhase) {
  const prevIdx = Math.floor(prevPhase / Math.PI);
  const nextIdx = Math.floor(nextPhase / Math.PI);
  if (nextIdx <= prevIdx) return null;
  return nextIdx % 2 === 1 ? 'L' : 'R';
}

/**
 * Classify mouse swipe velocity/delta (dx, dy) into 6 directional Beam Saber slash paths.
 */
export function classifyMouseSlashDirection(dx = 0, dy = 0, deadzonePx = 6, fallbackCombo = 0) {
  const mag = Math.hypot(dx, dy);
  if (mag < deadzonePx) {
    return fallbackCombo % 2 === 0 ? 'LR' : 'RL';
  }
  const angle = Math.atan2(dy, dx) * (180 / Math.PI); // -180..180; +X right, +Y down
  if (angle >= -22.5 && angle < 22.5) return 'LR';
  if (angle >= 22.5 && angle < 67.5) return 'DIAG_DR';
  if (angle >= 67.5 && angle < 112.5) return 'DOWN';
  if (angle >= 112.5 && angle < 157.5) return 'DIAG_DL';
  if (angle >= -67.5 && angle < -22.5) return 'DIAG_DL';
  if (angle >= -112.5 && angle < -67.5) return 'UP';
  if (angle >= -157.5 && angle < -112.5) return 'DIAG_DR';
  return 'RL';
}

const SABER_SLASH_ARCS = Object.freeze({
  // Note Left Arm Blender-verified convention: +X fwd/up, +Z outward Left (-Z across chest Right), Y roll
  LR: { start: [68, 38, -28, 36, 12], end: [42, -46, 44, 18, -16] },
  RL: { start: [42, -46, 44, 18, -14], end: [68, 38, -28, 36, 14] },
  DOWN: { start: [128, 12, 8, 52, -8], end: [14, -18, 16, 12, 12] },
  UP: { start: [12, -16, 22, 22, 8], end: [126, 20, -10, 46, -12] },
  DIAG_DR: { start: [112, 34, 24, 48, -12], end: [22, -38, -24, 14, 16] },
  DIAG_DL: { start: [108, -36, -24, 46, 14], end: [20, 38, 34, 16, -16] },
});

/**
 * Evaluate Arm_Upper_L + Arm_Lower_L + Torso Twist at normalized slash progress u in [0, 1].
 */
export function computeDirectionalSaberPose(direction = 'LR', progressU = 0) {
  const arc = SABER_SLASH_ARCS[direction] || SABER_SLASH_ARCS.LR;
  const s = snapServo(progressU, 0.08);
  return {
    shoulderXDeg: lerp(arc.start[0], arc.end[0], s),
    shoulderYDeg: lerp(arc.start[1], arc.end[1], s),
    shoulderZDeg: lerp(arc.start[2], arc.end[2], s),
    elbowXDeg: lerp(arc.start[3], arc.end[3], s),
    torsoTwistDeg: lerp(arc.start[4], arc.end[4], s),
  };
}

function smoothstep01(edge0, edge1, x) {
  const t = clamp((x - edge0) / Math.max(1e-5, edge1 - edge0), 0, 1);
  return t * t * (3 - 2 * t);
}

/**
 * Full 360-degree continuous "Badminton Whip" + Overhead-to-Ground Downward Slash kinetic chain:
 * Windup (opposite side/overhead) -> Torso chop lean -> Shoulder drive -> Extended Elbow -> Hand_L Wrist Down-Snap (~90 deg tip down!)
 * `angleRad`: screen swipe / aim sweep direction atan2(dy, dx); defaults favor diagonal overhead->floor chops.
 * `aimPitchRad`: camera pitch (-down .. +up) so looking down forces steep vertical blade-down point toward ground.
 */
export function computeContinuousSaberPose(angleRad = 0, progressU = 0, aimPitchRad = 0) {
  const u = clamp(progressU, 0, 1);
  const ux = Math.cos(angleRad);
  const uy = Math.sin(angleRad);
  const pitchDownBias = clamp(-aimPitchRad * 1.45, -0.45, 0.65);

  const ready = {
    shoulderX: 28,
    shoulderY: 6,
    shoulderZ: 16,
    elbowX: 34,
    wristX: 0,
    wristY: 0,
    wristZ: 0,
    torsoTwist: 0,
    torsoPitch: 0,
  };

  // Windup on the opposite side ("逆向蓄力"): raised above shoulder, wrist cocked UP/BACK (+X)
  const windup = {
    shoulderX: clamp(102 + uy * 48 - ux * 8 - pitchDownBias * 10, 28, 154),
    shoulderY: ux * 58 - uy * 18,
    shoulderZ: clamp(18 + ux * 60 + uy * 12, -48, 82),
    elbowX: clamp(68 + Math.max(0, uy) * 22, 40, 94),
    wristX: clamp(24 + uy * 20, -12, 48),
    wristY: -42 * ux,
    wristZ: 34 * ux - 14 * uy,
    torsoTwist: 34 * ux - 6 * uy,
    torsoPitch: -6 * Math.max(0, uy),
  };

  // Strike drives arm forward-down while flexing Hand_L steeply NEGATIVE (-X) so the upward-mounted saber sweeps down to ~-90 deg pointing at floor!
  const strike = {
    shoulderX: clamp(14 - uy * 34 + ux * 4 - pitchDownBias * 20, -24, 96),
    shoulderY: -ux * 62 + uy * 22,
    shoulderZ: clamp(10 - ux * 68 - uy * 12, -58, 78),
    elbowX: clamp(8 + Math.max(0, -uy) * 14, 4, 24),
    wristX: clamp(-72 - uy * 26 - pitchDownBias * 20, -108, -28),
    wristY: 62 * ux,
    wristZ: -56 * ux + 18 * uy,
    torsoTwist: -38 * ux + 8 * uy,
    torsoPitch: clamp(18 + Math.max(0, uy) * 16 + Math.abs(ux) * 8 + pitchDownBias * 14, 4, 42),
  };

  let cur;
  let lungeWeight = 0;

  if (u <= 0.18) {
    const w = smoothstep01(0, 0.18, u);
    cur = {
      shoulderX: lerp(ready.shoulderX, windup.shoulderX, w),
      shoulderY: lerp(ready.shoulderY, windup.shoulderY, w),
      shoulderZ: lerp(ready.shoulderZ, windup.shoulderZ, w),
      elbowX: lerp(ready.elbowX, windup.elbowX, w),
      wristX: lerp(ready.wristX, windup.wristX, w),
      wristY: lerp(ready.wristY, windup.wristY, w),
      wristZ: lerp(ready.wristZ, windup.wristZ, w),
      torsoTwist: lerp(ready.torsoTwist, windup.torsoTwist, w),
      torsoPitch: lerp(ready.torsoPitch, windup.torsoPitch, w),
    };
    lungeWeight = 0.25 * w;
  } else if (u <= 0.48) {
    const sBody = Math.pow(clamp((u - 0.18) / 0.30, 0, 1), 0.62);
    const sArm = smoothstep01(0.18, 0.44, u);
    const sWrist = smoothstep01(0.22, 0.48, u);
    cur = {
      shoulderX: lerp(windup.shoulderX, strike.shoulderX, sArm),
      shoulderY: lerp(windup.shoulderY, strike.shoulderY, sArm),
      shoulderZ: lerp(windup.shoulderZ, strike.shoulderZ, sArm),
      elbowX: lerp(windup.elbowX, strike.elbowX, sWrist),
      wristX: lerp(windup.wristX, strike.wristX, sWrist),
      wristY: lerp(windup.wristY, strike.wristY, sWrist),
      wristZ: lerp(windup.wristZ, strike.wristZ, sWrist),
      torsoTwist: lerp(windup.torsoTwist, strike.torsoTwist, sBody),
      torsoPitch: lerp(windup.torsoPitch, strike.torsoPitch, sBody),
    };
    lungeWeight = lerp(0.25, 1.0, smoothstep01(0.18, 0.36, u));
  } else if (u <= 0.76) {
    const f = (u - 0.48) / 0.28;
    const over = Math.sin(f * Math.PI) * 0.08;
    cur = {
      shoulderX: strike.shoulderX + (strike.shoulderX - windup.shoulderX) * over * 0.4,
      shoulderY: strike.shoulderY + (strike.shoulderY - windup.shoulderY) * over * 0.5,
      shoulderZ: strike.shoulderZ + (strike.shoulderZ - windup.shoulderZ) * over * 0.5,
      elbowX: lerp(strike.elbowX, strike.elbowX + 10, f),
      wristX: strike.wristX * (1 + over),
      wristY: strike.wristY * (1 + over),
      wristZ: strike.wristZ * (1 + over),
      torsoTwist: strike.torsoTwist * (1 + over * 0.6),
      torsoPitch: lerp(strike.torsoPitch, strike.torsoPitch * 0.72, f),
    };
    lungeWeight = lerp(1.0, 0.85, f);
  } else {
    const r = smoothstep01(0.76, 1.0, u);
    cur = {
      shoulderX: lerp(strike.shoulderX, ready.shoulderX, r),
      shoulderY: lerp(strike.shoulderY, ready.shoulderY, r),
      shoulderZ: lerp(strike.shoulderZ, ready.shoulderZ, r),
      elbowX: lerp(strike.elbowX + 10, ready.elbowX, r),
      wristX: lerp(strike.wristX, ready.wristX, r),
      wristY: lerp(strike.wristY, ready.wristY, r),
      wristZ: lerp(strike.wristZ, ready.wristZ, r),
      torsoTwist: lerp(strike.torsoTwist, ready.torsoTwist, r),
      torsoPitch: lerp(strike.torsoPitch * 0.72, ready.torsoPitch, r),
    };
    lungeWeight = lerp(0.85, 0.0, r);
  }

  const yieldEnv = Math.sin(clamp((u - 0.14) / 0.62, 0, 1) * Math.PI);
  const rightArmRetractDeg = clamp(24 * yieldEnv, 0, 24);

  return {
    shoulderXDeg: cur.shoulderX,
    shoulderYDeg: cur.shoulderY,
    shoulderZDeg: cur.shoulderZ,
    elbowXDeg: cur.elbowX,
    wristXDeg: cur.wristX,
    wristYDeg: cur.wristY,
    wristZDeg: cur.wristZ,
    torsoTwistDeg: cur.torsoTwist,
    torsoPitchDeg: cur.torsoPitch,
    lungeWeight,
    rightArmRetractDeg,
  };
}

/**
 * [M5.6 / M1.6] Two-Arm Strict Loadout Rule:
 * Any mecha equips at most 2 hand weapons (R_HAND + L_HAND) from Gun / Saber / Shield.
 * Preset 1: Gun + Saber (balanced mobile offense, no shield)
 * Preset 2: Gun + Shield (ranged suppression + energy barrier defense)
 * Preset 3: Saber + Shield (armored knight melee duel, no ranged gun)
 */
export function resolveArmLoadoutPreset(mode = 1) {
  const m = Number(mode);
  if (m === 2) {
    return { mode: 2, label: '槍 + 盾 (Range & Barrier)', rHand: 'pistol', lHand: 'shield' };
  }
  if (m === 3) {
    return { mode: 3, label: '劍 + 盾 (Knight Duel)', rHand: 'saber', lHand: 'shield' };
  }
  return { mode: 1, label: '槍 + 劍 (All-Round Offense)', rHand: 'pistol', lHand: 'saber' };
}

export function createShieldState() {
  return {
    guardBlend: 0,
    barrierActive: false,
    parryWindowSec: 0,
    flashTimer: 0,
    wasGuardHeld: false,
  };
}

export function stepShieldDefense(
  state = createShieldState(),
  { guardHeld = false, hasShield = true, en = 100, dt = 1 / 60 } = {},
) {
  const canGuard = Boolean(guardHeld && hasShield && en > 0.5);
  const freshRaise = canGuard && !state.wasGuardHeld;

  const parryWindowSec = canGuard
    ? freshRaise
      ? 0.18
      : Math.max(0, (state.parryWindowSec || 0) - dt)
    : 0;

  const targetBlend = canGuard ? 1 : 0;
  const guardBlend = lerp(state.guardBlend || 0, targetBlend, 1 - Math.exp(-16 * dt));
  const flashTimer = Math.max(0, (state.flashTimer || 0) - dt);

  return {
    guardBlend,
    barrierActive: canGuard,
    parryWindowSec,
    flashTimer,
    wasGuardHeld: canGuard,
  };
}

export function evaluateShieldIncomingHit(
  shieldState,
  { dmg = 0, isMelee = false, frontDot = 1.0 } = {},
) {
  if (!shieldState || !shieldState.barrierActive || frontDot < 0.25) {
    return {
      outcome: 'hit',
      damageTaken: dmg,
      enDrain: 0,
      attackerRecoilImpulse: 0,
      defenderRecoilImpulse: 0,
    };
  }
  if ((shieldState.parryWindowSec || 0) > 0) {
    return {
      outcome: 'parry',
      damageTaken: 0,
      enDrain: 4,
      attackerRecoilImpulse: isMelee ? 8.5 : 5.0,
      defenderRecoilImpulse: 0,
    };
  }
  return {
    outcome: 'block',
    damageTaken: dmg * 0.25,
    enDrain: isMelee ? 14 : 6,
    attackerRecoilImpulse: isMelee ? 3.8 : 0,
    defenderRecoilImpulse: isMelee ? 3.2 : 1.4,
  };
}

/**
 * Full-body stagger recoil animation curve when an attacker's beam saber hits an active shield/parry.
 * Normalized time u in [0..1] over ~0.55s knockback window.
 */
export function computeParryRecoilPose(u = 0) {
  const t = clamp(u, 0, 1);
  if (t <= 0 || t >= 1) {
    return { torsoPitchDeg: 0, torsoTwistDeg: 0, armRecoilDeg: 0, shoulderZDeg: 0, pelvisPitchDeg: 0 };
  }
  // Sharp snap-back in first 22% of clip, followed by heavy hydraulic recovery
  const snap = t < 0.22 ? Math.pow(t / 0.22, 0.55) : Math.pow(1 - (t - 0.22) / 0.78, 1.45);
  return {
    torsoPitchDeg: -22 * snap,
    torsoTwistDeg: -28 * snap,
    armRecoilDeg: 46 * snap,
    shoulderZDeg: 38 * snap,
    pelvisPitchDeg: -10 * snap,
  };
}

/**
 * Guards camera aim (yaw/pitch) against spurious OS cursor-warp movementX/Y spikes
 * when switching away from the browser tab/window (Alt+Tab) or re-acquiring Pointer Lock.
 */
export function sanitizeMouseLookDelta({
  movementX = 0,
  movementY = 0,
  hasFocus = true,
  isHidden = false,
  ignoreUntilMs = 0,
  nowMs = 0,
  discardRemaining = 0,
  maxSpikePx = 200,
  clampPx = 110,
} = {}) {
  if (!hasFocus || isHidden || nowMs < ignoreUntilMs || discardRemaining > 0) {
    return { dx: 0, dy: 0, discarded: true };
  }
  if (!Number.isFinite(movementX) || !Number.isFinite(movementY)) {
    return { dx: 0, dy: 0, discarded: true };
  }
  if (Math.hypot(movementX, movementY) > maxSpikePx) {
    return { dx: 0, dy: 0, discarded: true };
  }
  return {
    dx: clamp(movementX, -clampPx, clampPx),
    dy: clamp(movementY, -clampPx, clampPx),
    discarded: false,
  };
}
