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
} from './constants.js';
export { resolveArmLoadoutPreset } from './loadout.js';

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
export function computeModularMassAndThrust(loadoutIds = [], options = {}) {
  let modMass = Number(options?.extraMassKg) || 0;
  let modThrust = Number(options?.extraThrustN) || 0;
  for (const id of loadoutIds) {
    const spec = MODULAR_WEAPONS[id];
    if (!spec) continue;
    modMass += spec.weightKg || 0;
    modThrust += spec.thrustBonusN || 0;
  }
  const totalMassKg = Math.max(MECHA_BASE_MASS_KG * 0.85, MECHA_BASE_MASS_KG + modMass);
  const maxThrustN = Math.max(MECHA_BASE_THRUST_N * 0.5, MECHA_BASE_THRUST_N + modThrust);
  const twr = maxThrustN / (totalMassKg * GRAVITY_MPS2);
  const weightPenaltyFactor = clamp(MECHA_BASE_MASS_KG / totalMassKg, 0.78, 1.08);
  return { totalMassKg, maxThrustN, twr, weightPenaltyFactor };
}

/**
 * [Task 6] Full loadout Weight Tax, TWR overload curves, and 5-axis normalized radar metrics.
 */
export function computeLoadoutWeightTax({
  actorDef = null,
  weaponDefs = [],
  shieldDef = null,
  armorCoreDef = null,
  armorLiningDef = null,
  pilotDef = null,
} = {}) {
  const actor = actorDef || {};
  const payloadCapKg = Math.max(500, Number(actor.payloadCapKg) || 1850);

  let weaponMass = 0;
  let thrustBonusN = 0;
  let firepowerGain = 0;
  let meleeGain = 0;
  let techGain = 0;

  for (const w of Array.isArray(weaponDefs) ? weaponDefs : []) {
    if (!w) continue;
    weaponMass += Number(w.weightKg) || 0;
    thrustBonusN += Number(w.thrustBonusN) || 0;
    if (w.category === 'saber') {
      meleeGain += 8;
    } else if (w.category === 'booster') {
      techGain += 10;
    } else if (w.category === 'cannon' || w.slot === 'L_BACK' || w.slot === 'R_BACK') {
      firepowerGain += w.id === 'EF-RL08' ? 16 : 12;
      if (w.id === 'EF-TB04' || w.id === 'EF-RL08') techGain += 6;
    } else {
      firepowerGain += 4;
    }
  }

  const shieldMass = Number(shieldDef?.weightKg) || 0;
  const armorCoreMass = Number(armorCoreDef?.weightKg) || 0;
  const armorLiningMass = Number(armorLiningDef?.weightKg) || 0;

  const rawPayloadKg = weaponMass + shieldMass + armorCoreMass + armorLiningMass;
  const payloadKg = Math.max(0, rawPayloadKg);

  // Booster-assisted payload compensation: high extra thrust offsets effective structural burden
  const effectivePayloadKg = Math.max(0, payloadKg - (thrustBonusN / 1000) * 1.15);
  const loadRatio = effectivePayloadKg / payloadCapKg;

  // Weight Tax reduction factor (hooked cleanly for Task 9C Ironclad pilot perk -20%)
  const taxRelief = Number(pilotDef?.weightTaxRelief) || 0;
  const overloadExcess = Math.max(0, loadRatio - 1.0) * clamp(1 - taxRelief, 0.5, 1.0);

  let overloadState = 'nominal';
  if (loadRatio > 1.05) overloadState = 'overloaded';
  else if (loadRatio > 0.90) overloadState = 'heavy';

  const totalMassKg = Math.max(MECHA_BASE_MASS_KG * 0.85, MECHA_BASE_MASS_KG + rawPayloadKg);
  const maxThrustN = MECHA_BASE_THRUST_N + thrustBonusN;
  const twr = maxThrustN / (totalMassKg * GRAVITY_MPS2);

  // Light builds (< 65% capacity) feel extra crisp up to +5%; overloaded builds drop down to 0.72x
  const lightBonus = loadRatio < 0.65 ? (0.65 - loadRatio) * 0.08 : 0;
  const thrustAgilityGain = clamp(thrustBonusN / 1600000, 0, 0.08);
  const speedScale = clamp(
    1.0 + lightBonus + thrustAgilityGain - overloadExcess * 0.34,
    0.72,
    1.08,
  );
  const enRegenPenaltyScale = clamp(1.0 - overloadExcess * 0.38, 0.68, 1.0);
  const boostCostMult = clamp(1.0 + overloadExcess * 0.42, 0.94, 1.38);

  const apBonus =
    (Number(armorCoreDef?.statModifiers?.apBonus) || 0) +
    (Number(armorLiningDef?.statModifiers?.apBonus) || 0);
  const acsCapBonus =
    (Number(armorCoreDef?.statModifiers?.acsCapBonus) || 0) +
    (Number(armorLiningDef?.statModifiers?.acsCapBonus) || 0);
  const beamResist =
    (Number(armorCoreDef?.statModifiers?.beamResist) || 0) +
    (Number(armorLiningDef?.statModifiers?.beamResist) || 0);
  const blastResist =
    (Number(armorCoreDef?.statModifiers?.blastResist) || 0) +
    (Number(armorLiningDef?.statModifiers?.blastResist) || 0);
  const staggerRecoveryRateScale =
    1.0 +
    (Number(armorCoreDef?.statModifiers?.staggerRecoveryBonus) || 0) +
    (Number(armorLiningDef?.statModifiers?.staggerRecoveryBonus) || 0);

  const baseStats = actor.stats || { speed: 75, firepower: 75, melee: 80, tech: 70, defense: 75 };
  const baseRadarMetrics = {
    mobility: clamp(Number(baseStats.speed) || 75, 10, 100),
    firepower: clamp(Number(baseStats.firepower) || 75, 10, 100),
    melee: clamp(Number(baseStats.melee) || 80, 10, 100),
    armor: clamp(Number(baseStats.defense) || 75, 10, 100),
    tech: clamp(Number(baseStats.tech) || 70, 10, 100),
  };

  const armorGain =
    apBonus / 120 +
    beamResist * 35 +
    blastResist * 35 +
    acsCapBonus * 25 +
    (shieldDef?.blockReduction ? shieldDef.blockReduction * 8 - 4 : 0);

  const radarMetrics = {
    mobility: Math.round(clamp(baseRadarMetrics.mobility * speedScale + (thrustBonusN > 0 ? 7 : 0), 15, 100)),
    firepower: Math.round(clamp(baseRadarMetrics.firepower + firepowerGain, 15, 100)),
    melee: Math.round(clamp(baseRadarMetrics.melee + meleeGain - overloadExcess * 8, 15, 100)),
    armor: Math.round(clamp(baseRadarMetrics.armor + armorGain, 15, 100)),
    tech: Math.round(clamp(baseRadarMetrics.tech + techGain + (beamResist + acsCapBonus) * 14, 15, 100)),
  };

  return {
    totalMassKg: Math.round(totalMassKg),
    maxThrustN,
    twr,
    payloadKg: Math.round(payloadKg),
    payloadCapKg,
    loadRatio,
    overloadState,
    speedScale,
    enRegenPenaltyScale,
    boostCostMult,
    effectiveAp: Math.max(1000, (Number(actor.maxAp) || 10000) + apBonus),
    effectiveMaxAcs: Math.round(100 * (1 + acsCapBonus)),
    beamResist,
    blastResist,
    staggerRecoveryRateScale,
    baseRadarMetrics,
    radarMetrics,
  };
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
  const rawMass = Number(massThrust?.totalMassKg);
  const rawThrust = Number(massThrust?.maxThrustN ?? massThrust?.thrustN);
  const rawPenalty = Number(massThrust?.weightPenaltyFactor);
  const totalMassKg = Number.isFinite(rawMass) && rawMass > 0 ? rawMass : MECHA_BASE_MASS_KG;
  const maxThrustN = Number.isFinite(rawThrust) && rawThrust >= 0 ? rawThrust : MECHA_BASE_THRUST_N;
  const weightPenaltyFactor = Number.isFinite(rawPenalty) ? rawPenalty : 1.0;
  const {
    moveX = 0,
    moveZ = 0,
    jumpHeld = false,
    quickBoost = false,
    walkOnly = false,
    walkDriveGain = 1.0,
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
    modeMult = 0.44 * clamp(walkDriveGain, 0.06, 1.35);
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
 * Weapon Drop (`F`), Crisp Walk-and-Toss Release Animation, Ballistic Drop Physics,
 * and Crouch Pickup (`R`) State Machine.
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
    dropping: false,
    dropTimer: 0,
    dropDuration: 0.38,
    dropBlend: 0,
    fingerOpen: 0,
    dropLeft: false,
    dropRight: false,
    releaseTriggered: false,
    justReleased: false,
  };
}

function _isHandWeaponDroppable(handType, state) {
  if (handType === 'pistol') return Boolean(state.hasPistol);
  if (handType === 'saber') return Boolean(state.hasSaber);
  return false; // Option A: Forearm-mounted shield stays equipped on F
}

export function startWeaponDropAnimation(state, preset = { lHand: 'saber', rHand: 'pistol' }) {
  if (!state || state.dropping || state.pickingUp) return state;
  const dropLeft = _isHandWeaponDroppable(preset?.lHand, state);
  const dropRight = _isHandWeaponDroppable(preset?.rHand, state);
  if (!dropLeft && !dropRight) return state;

  return {
    ...state,
    saberIgnited: dropLeft || dropRight ? (preset?.lHand === 'saber' || preset?.rHand === 'saber' ? false : state.saberIgnited) : state.saberIgnited,
    dropping: true,
    dropTimer: 0,
    dropDuration: state.dropDuration || 0.38,
    dropBlend: 0,
    fingerOpen: 0,
    dropLeft,
    dropRight,
    releaseTriggered: false,
    justReleased: false,
  };
}

export function stepWeaponDrop(
  state,
  {
    dt = 1 / 60,
    mechaPos = { x: 0, y: 0, z: 0 },
    mechaVel = { vx: 0, vy: 0, vz: 0 },
    mechaYaw = 0,
    preset = { lHand: 'saber', rHand: 'pistol' },
    releaseOrigins = null,
  } = {},
) {
  if (!state?.dropping) {
    return state?.justReleased ? { ...state, justReleased: false } : state;
  }

  let next = { ...state, justReleased: false };
  const dur = Math.max(0.18, next.dropDuration || 0.38);
  next.dropTimer += Math.max(0, dt);
  const u = clamp(next.dropTimer / dur, 0, 1);

  if (u <= 0.36) {
    next.dropBlend = smoothstep(0, 0.36, u);
    next.fingerOpen = smoothstep(0.18, 0.36, u) * 0.45;
  } else {
    next.dropBlend = 1 - smoothstep(0.36, 1.0, u);
    next.fingerOpen = u <= 0.52 ? lerp(0.45, 1.0, smoothstep(0.36, 0.52, u)) : lerp(1.0, 0.0, smoothstep(0.52, 1.0, u));
  }

  if (!next.releaseTriggered && u >= 0.36) {
    next.releaseTriggered = true;
    next.justReleased = true;

    const fwdX = -Math.sin(mechaYaw);
    const fwdZ = -Math.cos(mechaYaw);
    const rightX = Math.cos(mechaYaw);
    const rightZ = -Math.sin(mechaYaw);
    const baseVx = mechaVel?.vx || 0;
    const baseVy = mechaVel?.vy || 0;
    const baseVz = mechaVel?.vz || 0;

    const droppedItems = [...next.droppedItems];
    const spawnSide = (sideKey, kind) => {
      const sgn = sideKey === 'L' ? -1 : 1;
      const origin = releaseOrigins?.[sideKey];
      const spawnX = origin?.x ?? mechaPos.x + fwdX * 0.56 + rightX * (sgn * 0.36);
      const spawnY = origin?.y ?? (mechaPos.y || 0) + 1.18;
      const spawnZ = origin?.z ?? mechaPos.z + fwdZ * 0.56 + rightZ * (sgn * 0.36);
      droppedItems.push({
        kind,
        side: sideKey,
        x: spawnX,
        y: spawnY,
        z: spawnZ,
        yaw: mechaYaw + sgn * 0.32,
        rotX: origin?.rotX ?? (kind === 'pistol' ? 0.25 : 0.9),
        rotZ: origin?.rotZ ?? (sgn * 0.22),
        vx: baseVx + fwdX * 2.45 + rightX * (sgn * 1.15),
        vy: Math.max(0.95, baseVy * 0.35 + 1.55),
        vz: baseVz + fwdZ * 2.45 + rightZ * (sgn * 1.15),
        angX: kind === 'pistol' ? 6.8 : 9.4,
        angY: sgn * 4.2,
        angZ: sgn * -3.5,
        bounces: 0,
        settled: false,
      });
    };

    if (next.dropLeft && (preset?.lHand === 'pistol' || preset?.lHand === 'saber')) {
      spawnSide('L', preset.lHand);
      if (preset.lHand === 'pistol') next.hasPistol = false;
      if (preset.lHand === 'saber') {
        next.hasSaber = false;
        next.saberIgnited = false;
      }
    }
    if (next.dropRight && (preset?.rHand === 'pistol' || preset?.rHand === 'saber')) {
      spawnSide('R', preset.rHand);
      if (preset.rHand === 'pistol') next.hasPistol = false;
      if (preset.rHand === 'saber') {
        next.hasSaber = false;
        next.saberIgnited = false;
      }
    }
    next.droppedItems = droppedItems;
  }

  if (u >= 1) {
    next.dropping = false;
    next.dropTimer = 0;
    next.dropBlend = 0;
    next.fingerOpen = 0;
    next.dropLeft = false;
    next.dropRight = false;
  }

  return next;
}

export function computeWeaponDropArmPose(dropState, side = 'R') {
  const isLeft = side === 'L';
  const active = Boolean(dropState?.dropping && (isLeft ? dropState.dropLeft : dropState.dropRight));
  if (!active) {
    return {
      active: false,
      u: 0,
      blend: 0,
      shoulderXDeg: 0,
      shoulderYDeg: 0,
      shoulderZDeg: 0,
      elbowXDeg: 0,
      wristXDeg: 0,
      wristZDeg: 0,
      fingerOpenDeg: 0,
      thumbOpenDeg: 0,
    };
  }
  const dur = Math.max(0.18, dropState.dropDuration || 0.38);
  const u = clamp((dropState.dropTimer || 0) / dur, 0, 1);
  const sgn = isLeft ? 1 : -1;
  // Windup sweep (0..0.36): elbow cocks slightly -> whip forward-outward at release -> ease to relaxed empty arm
  const swingBell = u <= 0.36 ? smoothstep(0, 0.36, u) : 1 - smoothstep(0.36, 1.0, u);
  const tossKick = u >= 0.22 && u <= 0.65 ? Math.sin(((u - 0.22) / 0.43) * Math.PI) : 0;
  const fOpen = clamp(dropState.fingerOpen || 0, 0, 1);

  return {
    active: true,
    u,
    blend: clamp(dropState.dropBlend || swingBell, 0, 1),
    shoulderXDeg: lerp(14, 56, swingBell) - tossKick * 10,
    shoulderYDeg: sgn * lerp(4, -18, swingBell),
    shoulderZDeg: sgn * lerp(10, 28, swingBell),
    elbowXDeg: lerp(22, 8, swingBell) - tossKick * 12,
    wristXDeg: -16 * swingBell - tossKick * 22,
    wristZDeg: sgn * (20 * swingBell + tossKick * 14),
    fingerOpenDeg: -48 * fOpen,
    thumbOpenDeg: sgn * 28 * fOpen,
  };
}

export function stepDroppedWeaponsPhysics(droppedItems = [], dt = 1 / 60, getGroundHeightAt = null) {
  const landedEvents = [];
  const nextItems = [];
  const stepDt = Math.max(0, Math.min(0.05, dt || 0));

  for (const raw of droppedItems) {
    if (!raw || raw.settled || raw.vy === undefined) {
      nextItems.push(raw);
      continue;
    }
    const item = { ...raw };
    item.vy -= GRAVITY_MPS2 * stepDt;
    item.x += (item.vx || 0) * stepDt;
    item.y += item.vy * stepDt;
    item.z += (item.vz || 0) * stepDt;
    item.yaw = (item.yaw || 0) + (item.angY || 0) * stepDt;
    item.rotX = (item.rotX || 0) + (item.angX || 0) * stepDt;
    item.rotZ = (item.rotZ || 0) + (item.angZ || 0) * stepDt;

    const surfaceY = typeof getGroundHeightAt === 'function' ? Number(getGroundHeightAt(item.x, item.z)) || 0 : 0;
    const minY = surfaceY + 0.08;
    if (item.y <= minY) {
      item.y = minY;
      if (Math.abs(item.vy) > 1.35 && (item.bounces || 0) < 2) {
        item.vy = Math.abs(item.vy) * 0.28;
        item.vx = (item.vx || 0) * 0.38;
        item.vz = (item.vz || 0) * 0.38;
        item.angX = (item.angX || 0) * 0.35;
        item.angY = (item.angY || 0) * 0.35;
        item.angZ = (item.angZ || 0) * 0.35;
        item.bounces = (item.bounces || 0) + 1;
        landedEvents.push({ kind: item.kind, x: item.x, y: item.y, z: item.z, bounce: item.bounces });
      } else {
        item.vx = 0;
        item.vy = 0;
        item.vz = 0;
        item.angX = 0;
        item.angY = 0;
        item.angZ = 0;
        item.rotX = Math.PI * 0.5;
        item.rotZ = 0;
        item.settled = true;
        landedEvents.push({ kind: item.kind, x: item.x, y: item.y, z: item.z, settled: true });
      }
    }
    nextItems.push(item);
  }

  return { droppedItems: nextItems, landedEvents };
}

export function triggerDropWeapons(state, mechaPos = { x: 0, y: 0, z: 0 }, mechaYaw = 0, preset = null) {
  const dropLeft = preset ? _isHandWeaponDroppable(preset.lHand, state) : state.hasPistol || state.hasSaber;
  const dropRight = preset ? _isHandWeaponDroppable(preset.rHand, state) : state.hasPistol || state.hasSaber;
  if (!dropLeft && !dropRight) return state;

  const fwdX = -Math.sin(mechaYaw);
  const fwdZ = -Math.cos(mechaYaw);
  const rightX = Math.cos(mechaYaw);
  const rightZ = -Math.sin(mechaYaw);

  const droppedItems = [...state.droppedItems];
  const dropPistol = preset ? (preset.lHand === 'pistol' || preset.rHand === 'pistol') && state.hasPistol : state.hasPistol;
  const dropSaber = preset ? (preset.lHand === 'saber' || preset.rHand === 'saber') && state.hasSaber : state.hasSaber;

  if (dropPistol) {
    droppedItems.push({
      kind: 'pistol',
      x: mechaPos.x + fwdX * 0.95 - rightX * 0.34,
      y: (mechaPos.y || 0) + 0.08,
      z: mechaPos.z + fwdZ * 0.95 - rightZ * 0.34,
      yaw: mechaYaw + 0.35,
      settled: true,
    });
  }
  if (dropSaber) {
    droppedItems.push({
      kind: 'saber',
      x: mechaPos.x + fwdX * 0.95 + rightX * 0.34,
      y: (mechaPos.y || 0) + 0.08,
      z: mechaPos.z + fwdZ * 0.95 + rightZ * 0.34,
      yaw: mechaYaw - 0.3,
      settled: true,
    });
  }

  return {
    ...state,
    hasPistol: dropPistol ? false : state.hasPistol,
    hasSaber: dropSaber ? false : state.hasSaber,
    saberIgnited: dropSaber ? false : state.saberIgnited,
    droppedItems,
  };
}

export function stepWeaponPickup(state, mechaPos = { x: 0, y: 0, z: 0 }, requestPickup = false, dt = 1 / 60) {
  let next = { ...state };
  if (next.dropping) {
    return next;
  }

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
  if (angle >= -67.5 && angle < -22.5) return 'DIAG_UR';
  if (angle >= -112.5 && angle < -67.5) return 'UP';
  if (angle >= -157.5 && angle < -112.5) return 'DIAG_UL';
  return 'RL';
}

const SABER_SLASH_ARCS = Object.freeze({
  // Note Left Arm Blender-verified convention: +X fwd/up, +Z outward Left (-Z across chest Right), Y roll
  LR: { start: [68, 38, -28, 36, 12], end: [42, -46, 44, 18, -16] },
  RL: { start: [42, -46, 44, 18, -14], end: [68, 38, -28, 36, 14] },
  DOWN: { start: [128, 12, 8, 52, -8], end: [14, -18, 16, 12, 12] },
  UP: { start: [-18, 22, 28, 62, 10], end: [108, -24, 34, 16, -12] },
  DIAG_DR: { start: [112, 34, 24, 48, -12], end: [22, -38, -24, 14, 16] },
  DIAG_DL: { start: [108, -36, -24, 46, 14], end: [20, 38, 34, 16, -16] },
  DIAG_UR: { start: [-20, -28, 26, 62, 14], end: [106, 36, 42, 16, -16] },
  DIAG_UL: { start: [-20, 28, 34, 62, -12], end: [104, -40, 24, 18, 16] },
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

export function createSaberSwipeTracker() {
  return {
    x: 0,
    y: 0,
    ageSec: 0,
    angleRad: 0.16,
    dir: 'LR',
    magnitudePx: 0,
    hasDirection: false,
    lockedAngleRad: 0.16,
    lockedDir: 'LR',
    hasLocked: false,
  };
}

/**
 * Accumulate subtle mouse deltas into a 380ms sliding direction buffer
 * while preserving the player's last explicitly swiped slash direction & angle.
 */
export function stepSaberSwipeTracker(
  tracker = createSaberSwipeTracker(),
  { dx = 0, dy = 0, dt = 1 / 60, deadzonePx = 4.2, reset = false, keepLocked = false } = {},
) {
  if (reset) {
    if (!keepLocked) return createSaberSwipeTracker();
    const base = createSaberSwipeTracker();
    return {
      ...base,
      angleRad: Number.isFinite(tracker?.lockedAngleRad) ? tracker.lockedAngleRad : base.angleRad,
      dir: tracker?.lockedDir || base.dir,
      lockedAngleRad: Number.isFinite(tracker?.lockedAngleRad) ? tracker.lockedAngleRad : base.lockedAngleRad,
      lockedDir: tracker?.lockedDir || base.lockedDir,
      hasLocked: Boolean(tracker?.hasLocked),
    };
  }
  const safeDt = Math.max(0, Number(dt) || 0);
  const decay = Math.exp(-safeDt / 0.38);
  const nx = (tracker.x || 0) * decay + (Number(dx) || 0);
  const ny = (tracker.y || 0) * decay + (Number(dy) || 0);
  const mag = Math.hypot(nx, ny);
  const hasDir = mag >= deadzonePx;
  const angleRad = hasDir ? Math.atan2(ny, nx) : (tracker.hasLocked ? tracker.lockedAngleRad : (tracker.angleRad ?? 0.16));
  const dir = hasDir
    ? classifyMouseSlashDirection(nx, ny, deadzonePx, 0)
    : (tracker.hasLocked ? tracker.lockedDir : (tracker.dir || 'LR'));
  return {
    x: nx,
    y: ny,
    ageSec: hasDir ? 0 : (tracker.ageSec || 0) + safeDt,
    angleRad,
    dir,
    magnitudePx: mag,
    hasDirection: hasDir,
    lockedAngleRad: hasDir ? angleRad : (tracker.lockedAngleRad ?? 0.16),
    lockedDir: hasDir ? dir : (tracker.lockedDir || 'LR'),
    hasLocked: hasDir || Boolean(tracker.hasLocked),
  };
}

export function resolveSaberInputDirection(tracker, { deadzonePx = 4.2, fallbackCombo = 0 } = {}) {
  const mag = Math.hypot(tracker?.x || 0, tracker?.y || 0);
  if (mag >= deadzonePx) {
    return {
      angleRad: Math.atan2(tracker.y, tracker.x),
      dir: classifyMouseSlashDirection(tracker.x, tracker.y, deadzonePx, fallbackCombo),
      fromSwipe: true,
    };
  }
  if (tracker?.hasLocked) {
    return {
      angleRad: Number.isFinite(tracker.lockedAngleRad) ? tracker.lockedAngleRad : 0.16,
      dir: tracker.lockedDir || 'LR',
      fromSwipe: false,
    };
  }
  const comboRight = fallbackCombo % 2 === 0;
  return {
    angleRad: comboRight ? 0.16 : Math.PI - 0.16,
    dir: comboRight ? 'LR' : 'RL',
    fromSwipe: false,
  };
}

function smoothstep01(edge0, edge1, x) {
  const t = clamp((x - edge0) / Math.max(1e-5, edge1 - edge0), 0, 1);
  return t * t * (3 - 2 * t);
}

/**
 * Full 360-degree continuous Saber Kinetic Chain calibrated directly against GLB
 * forward kinematics (Arm_Upper_L -> Arm_Lower_L -> Hand_L -> WeaponMount_L):
 * - Horizontal & Diagonal: sweeps cleanly across the front (-Z) arc matching screen (ux, -uy)
 * - Downward (uy > 0): high overhead windup -> crisp frontal ground-reach chop
 * - Upward (uy < 0): low outer-hip windup -> crisp frontal diagonal rising slash without blocking crosshair
 */
export function computeContinuousSaberPose(angleRad = 0, progressU = 0, aimPitchRad = 0) {
  const u = clamp(progressU, 0, 1);
  const ux = Math.cos(angleRad);
  const uy = Math.sin(angleRad);
  const downW = Math.max(0, uy);
  const upW = Math.max(0, -uy);
  const pitchBiasDeg = clamp(aimPitchRad * 32, -16, 18);

  const ready = {
    shoulderX: 26,
    shoulderY: -8,
    shoulderZ: 16,
    elbowX: 28,
    wristX: -22,
    wristY: 4,
    wristZ: -4,
    torsoTwist: 0,
    torsoPitch: 0,
  };

  // GLB-verified Left Arm axes: +sX pitches forward/overhead (<= 105 keeps blade in front/top),
  // +sY/+wY sweep blade RIGHT (+X), -sY/-wY sweep LEFT (-X), +sZ abducts LEFT, wX<0 extends blade forward/down.
  const windup = {
    shoulderX: clamp(lerp(56 + downW * 38, -16, upW) + pitchBiasDeg * 0.45, -24, 106),
    shoulderY: -ux * 34 - downW * 6 - upW * 20,
    shoulderZ: clamp(16 + ux * 28 + upW * 14 - downW * 4, -28, 56),
    elbowX: clamp(32 + downW * 10 + upW * 4, 20, 56),
    wristX: clamp(lerp(-50 + downW * 18, -70, upW), -82, 10),
    wristY: -36 * ux * (1 - 0.55 * downW) - upW * 10,
    wristZ: -8 * ux,
    torsoTwist: 22 * ux,
    torsoPitch: clamp(-6 * downW + 4 * upW, -8, 6),
  };

  const strike = {
    shoulderX: clamp(lerp(52 - downW * 54, 76 - Math.abs(ux) * 8, upW) + pitchBiasDeg * 0.65, -20, 92),
    shoulderY: ux * 38 + downW * 4 + upW * 10,
    shoulderZ: clamp(12 - ux * 28 + upW * 16, -28, 44),
    elbowX: clamp(12 + upW * 4, 8, 22),
    wristX: clamp(lerp(-58 - downW * 26, -42, upW) + pitchBiasDeg * 0.35, -96, -18),
    wristY: 40 * ux * (1 - 0.55 * downW) + upW * 6,
    wristZ: 8 * ux,
    torsoTwist: -24 * ux,
    torsoPitch: clamp(lerp(10 + downW * 14, -4, upW) - pitchBiasDeg * 0.25, -6, 26),
  };

  let cur;
  let lungeWeight = 0;

  if (u <= 0.16) {
    const w = smoothstep01(0, 0.16, u);
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
    lungeWeight = 0.15 * w;
  } else if (u <= 0.44) {
    const sBody = Math.pow(clamp((u - 0.16) / 0.28, 0, 1), 0.62);
    const sArm = smoothstep01(0.16, 0.40, u);
    const sWrist = smoothstep01(0.18, 0.44, u);
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
    lungeWeight = lerp(0.15, 0.45, smoothstep01(0.16, 0.34, u));
  } else if (u <= 0.68) {
    const f = (u - 0.44) / 0.24;
    const over = Math.sin(f * Math.PI) * 0.06;
    cur = {
      shoulderX: strike.shoulderX + (strike.shoulderX - windup.shoulderX) * over * 0.3,
      shoulderY: strike.shoulderY + (strike.shoulderY - windup.shoulderY) * over * 0.35,
      shoulderZ: strike.shoulderZ + (strike.shoulderZ - windup.shoulderZ) * over * 0.35,
      elbowX: lerp(strike.elbowX, strike.elbowX + 8, f),
      wristX: strike.wristX + (strike.wristX - windup.wristX) * over * 0.25,
      wristY: strike.wristY * (1 + over),
      wristZ: strike.wristZ * (1 + over),
      torsoTwist: strike.torsoTwist * (1 + over * 0.45),
      torsoPitch: lerp(strike.torsoPitch, strike.torsoPitch * 0.72, f),
    };
    lungeWeight = lerp(0.45, 0.32, f);
  } else {
    const r = smoothstep01(0.68, 1.0, u);
    cur = {
      shoulderX: lerp(strike.shoulderX, ready.shoulderX, r),
      shoulderY: lerp(strike.shoulderY, ready.shoulderY, r),
      shoulderZ: lerp(strike.shoulderZ, ready.shoulderZ, r),
      elbowX: lerp(strike.elbowX + 8, ready.elbowX, r),
      wristX: lerp(strike.wristX, ready.wristX, r),
      wristY: lerp(strike.wristY, ready.wristY, r),
      wristZ: lerp(strike.wristZ, ready.wristZ, r),
      torsoTwist: lerp(strike.torsoTwist, ready.torsoTwist, r),
      torsoPitch: lerp(strike.torsoPitch * 0.72, ready.torsoPitch, r),
    };
    lungeWeight = lerp(0.32, 0.0, r);
  }

  const yieldEnv = Math.sin(clamp((u - 0.14) / 0.58, 0, 1) * Math.PI);
  const rightArmRetractDeg = clamp(24 * yieldEnv, 0, 24);
  const swingBoost = Math.sin(clamp((u - 0.14) / 0.44, 0, 1) * Math.PI);

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
    swingBoost: clamp(swingBoost, 0, 1),
  };
}

export function createShieldState() {
  return {
    guardBlend: 0,
    barrierActive: false,
    parryWindowSec: 0,
    flashTimer: 0,
    wasGuardHeld: false,
    shieldSp: 100,
    maxSp: 100,
    regenDelaySec: 0,
    activeDurationSec: 0,
    cooldownRemainingSec: 0,
    overheated: false,
    guardHeatRatio: 0,
  };
}

export function stepShieldDefense(
  state = createShieldState(),
  {
    guardHeld = false,
    hasShield = true,
    dt = 1 / 60,
    parryWindowSec: parrySec = 0.18,
    maxDurationSec = Infinity,
    holdDrainPerSec = undefined,
    cooldownSec = 1.5,
    maxSp = 100,
    regenRatePerSec = 24,
    regenDelayOnReleaseSec = 0.35,
  } = {},
) {
  const safeDt = Math.max(0, dt);
  const safeMaxSp = Math.max(10, maxSp);
  let shieldSp = Number.isFinite(state?.shieldSp) ? clamp(state.shieldSp, 0, safeMaxSp) : safeMaxSp;
  let regenDelaySec = Math.max(0, state?.regenDelaySec || 0);
  let cooldownRemainingSec = Math.max(0, (state?.cooldownRemainingSec || 0) - safeDt);
  let overheated = Boolean(state?.overheated) && cooldownRemainingSec > 0;
  if (Boolean(state?.overheated) && cooldownRemainingSec <= 0) {
    overheated = false;
    shieldSp = safeMaxSp;
    regenDelaySec = 0;
  }

  const effectiveDrainPerSec = Number.isFinite(holdDrainPerSec) && holdDrainPerSec >= 0
    ? holdDrainPerSec
    : Number.isFinite(maxDurationSec) && maxDurationSec > 0
      ? safeMaxSp / maxDurationSec
      : 0;
  const hasCapacitorCap = effectiveDrainPerSec > 0;

  let canGuard = Boolean(guardHeld && hasShield && !overheated && (shieldSp > 0 || !hasCapacitorCap));

  if (canGuard && hasCapacitorCap) {
    shieldSp = Math.max(0, shieldSp - effectiveDrainPerSec * safeDt);
    regenDelaySec = regenDelayOnReleaseSec;
    if (shieldSp <= 0) {
      shieldSp = 0;
      overheated = true;
      cooldownRemainingSec = Math.max(0.1, cooldownSec);
      canGuard = false;
    }
  } else if (!canGuard && !overheated) {
    if (regenDelaySec > 0) {
      regenDelaySec = Math.max(0, regenDelaySec - safeDt);
    } else {
      shieldSp = Math.min(safeMaxSp, shieldSp + regenRatePerSec * safeDt);
    }
  }

  const freshRaise = canGuard && !state?.wasGuardHeld;

  const parryWindowSec = canGuard
    ? freshRaise
      ? parrySec
      : Math.max(0, (state?.parryWindowSec || 0) - safeDt)
    : 0;

  const targetBlend = canGuard ? 1 : 0;
  const guardBlend = lerp(state?.guardBlend || 0, targetBlend, 1 - Math.exp(-16 * safeDt));
  const flashTimer = Math.max(0, (state?.flashTimer || 0) - safeDt);
  const usedRatio = clamp(1 - shieldSp / safeMaxSp, 0, 1);
  const activeDurationSec = hasCapacitorCap ? usedRatio * (safeMaxSp / effectiveDrainPerSec) : 0;
  const guardHeatRatio = overheated
    ? clamp(cooldownRemainingSec / Math.max(0.1, cooldownSec), 0, 1)
    : usedRatio;

  return {
    guardBlend,
    barrierActive: canGuard,
    parryWindowSec,
    flashTimer,
    wasGuardHeld: canGuard,
    shieldSp,
    maxSp: safeMaxSp,
    regenDelaySec,
    activeDurationSec,
    cooldownRemainingSec,
    overheated,
    guardHeatRatio,
  };
}

export function evaluateShieldIncomingHit(
  shieldState,
  {
    dmg = 0,
    isMelee = false,
    attackKind = undefined,
    frontDot = 1.0,
    blockReduction = 0.75,
    fullDome = false,
    parryWindowOverride = undefined,
    impactDrainMult = 0.55,
    parrySpRefund = 12,
    reflectsBeams = false,
  } = {},
) {
  const kind = attackKind || (isMelee ? 'melee' : 'bullet');
  if (!shieldState || !shieldState.barrierActive || (!fullDome && frontDot < 0.25)) {
    return {
      outcome: 'hit',
      damageTaken: dmg,
      enDrain: 0,
      spDrain: 0,
      spRefund: 0,
      attackerRecoilImpulse: 0,
      defenderRecoilImpulse: 0,
      defenderRecoilAnim: false,
      attackerRecoilAnim: false,
      slideImpulse: 0,
      shakeBoost: 0,
    };
  }
  const hasParryWindow = parryWindowOverride !== undefined
    ? Boolean(parryWindowOverride)
    : (shieldState.parryWindowSec || 0) > 0;
  if (hasParryWindow) {
    return {
      outcome: 'parry',
      damageTaken: 0,
      enDrain: 0,
      spDrain: 0,
      spRefund: parrySpRefund,
      attackerRecoilImpulse: kind === 'melee' ? 8.5 : 5.0,
      defenderRecoilImpulse: 0,
      defenderRecoilAnim: false,
      attackerRecoilAnim: kind === 'melee',
      slideImpulse: kind === 'heavy' ? 0.9 : 0,
      shakeBoost: kind === 'melee' ? 0.06 : kind === 'heavy' ? 0.025 : 0.018,
    };
  }
  const safeReduction = Math.min(0.95, Math.max(0, blockReduction));
  let rawImpact = Math.max(14, dmg * 0.85);
  if (kind === 'beam') {
    rawImpact = Math.max(15, dmg * 0.95) * (reflectsBeams ? 0.55 : 1.0);
  } else if (kind === 'heavy') {
    rawImpact = Math.max(54, dmg * 0.95);
  } else if (kind === 'melee') {
    rawImpact = Math.max(48, dmg * 0.9);
  }
  return {
    outcome: 'block',
    damageTaken: dmg * (1 - safeReduction),
    enDrain: 0,
    spDrain: Number((rawImpact * impactDrainMult).toFixed(2)),
    spRefund: 0,
    attackerRecoilImpulse: kind === 'melee' ? 3.8 : 0,
    defenderRecoilImpulse: kind === 'melee' ? 3.2 : kind === 'heavy' ? 2.2 : 0,
    defenderRecoilAnim: kind === 'melee',
    attackerRecoilAnim: kind === 'melee',
    slideImpulse: kind === 'melee' ? 3.0 : kind === 'heavy' ? 2.2 : 0,
    shakeBoost: kind === 'melee' ? 0.04 : kind === 'heavy' ? 0.045 : 0.014,
  };
}

function _buildAimBasis(aimNormal = { x: 0, y: 0, z: -1 }) {
  const nLen = Math.hypot(aimNormal.x, aimNormal.y, aimNormal.z) || 1;
  const nx = aimNormal.x / nLen;
  const ny = aimNormal.y / nLen;
  const nz = aimNormal.z / nLen;
  const upRef = Math.abs(ny) > 0.98 ? { x: 0, y: 0, z: 1 } : { x: 0, y: 1, z: 0 };
  let rx = ny * upRef.z - nz * upRef.y;
  let ry = nz * upRef.x - nx * upRef.z;
  let rz = nx * upRef.y - ny * upRef.x;
  const rLen = Math.hypot(rx, ry, rz) || 1;
  rx /= rLen;
  ry /= rLen;
  rz /= rLen;
  const ux = ry * nz - rz * ny;
  const uy = rz * nx - rx * nz;
  const uz = rx * ny - ry * nx;
  return { nx, ny, nz, rx, ry, rz, ux, uy, uz };
}

/**
 * Computes the chest-anchored buckler intercept center so EF-SH01 protects the torso
 * both on frame-1 parry startup (before arm bone adduction completes) and at full guard.
 */
export function resolveBucklerInterceptCenter({
  bodyPos = { x: 0, y: 0, z: 0 },
  barrierWorldPos = null,
  aimNormal = { x: 0, y: 0, z: -1 },
  guardBlend = 1,
  centerOffsetY = 1.35,
  forwardDistM = 0.84,
} = {}) {
  const { nx, ny, nz, rx, ry, rz, ux, uy, uz } = _buildAimBasis(aimNormal);
  const idealX = (bodyPos?.x || 0) + nx * forwardDistM;
  const idealY = (bodyPos?.y || 0) + centerOffsetY + ny * forwardDistM;
  const idealZ = (bodyPos?.z || 0) + nz * forwardDistM;
  if (!barrierWorldPos) {
    return { x: idealX, y: idealY, z: idealZ };
  }
  const armReady = smoothstep(0.45, 0.92, clamp(guardBlend, 0, 1));
  const dx = barrierWorldPos.x - idealX;
  const dy = barrierWorldPos.y - idealY;
  const dz = barrierWorldPos.z - idealZ;
  const latOff = clamp(dx * rx + dy * ry + dz * rz, -0.12, 0.12) * armReady;
  const upOff = clamp(dx * ux + dy * uy + dz * uz, -0.12, 0.14) * armReady;
  const fwdOff = clamp(dx * nx + dy * ny + dz * nz, -0.04, 0.12) * armReady;
  return {
    x: idealX + rx * latOff + ux * upOff + nx * fwdOff,
    y: idealY + ry * latOff + uy * upOff + ny * fwdOff,
    z: idealZ + rz * latOff + uz * upOff + nz * fwdOff,
  };
}

/**
 * Continuous segment-vs-cylinder body hit check matching real mecha torso dimensions (~0.58m radius).
 * Keeps body hurtbox strictly inside frontal shield projection planes (0.84m..0.95m).
 */
export function evaluateMechaBodySegmentHit(
  prevPos,
  curPos,
  bodyBasePos = { x: 0, y: 0, z: 0 },
  { bodyRadiusM = 0.58, minHeightM = 0.05, maxHeightM = 2.55 } = {},
) {
  const miss = { hit: false, t: null, hitPos: null };
  if (!prevPos || !curPos || !bodyBasePos) {
    return miss;
  }
  const cx = bodyBasePos.x || 0;
  const cy = bodyBasePos.y || 0;
  const cz = bodyBasePos.z || 0;
  const minY = cy + minHeightM;
  const maxY = cy + maxHeightM;
  const R = Math.max(0.1, bodyRadiusM);

  const vx = curPos.x - prevPos.x;
  const vy = curPos.y - prevPos.y;
  const vz = curPos.z - prevPos.z;
  const dx0 = prevPos.x - cx;
  const dz0 = prevPos.z - cz;

  const a = vx * vx + vz * vz;
  const b = 2 * (dx0 * vx + dz0 * vz);
  const c = dx0 * dx0 + dz0 * dz0 - R * R;

  let tXZ0 = 0;
  let tXZ1 = 1;
  if (a < 1e-10) {
    if (c > 0) return miss;
  } else {
    const disc = b * b - 4 * a * c;
    if (disc < 0) return miss;
    const sqrtDisc = Math.sqrt(disc);
    tXZ0 = (-b - sqrtDisc) / (2 * a);
    tXZ1 = (-b + sqrtDisc) / (2 * a);
  }

  let tY0 = 0;
  let tY1 = 1;
  if (Math.abs(vy) < 1e-10) {
    if (prevPos.y < minY || prevPos.y > maxY) return miss;
  } else {
    const ta = (minY - prevPos.y) / vy;
    const tb = (maxY - prevPos.y) / vy;
    tY0 = Math.min(ta, tb);
    tY1 = Math.max(ta, tb);
  }

  const tEnter = Math.max(0, tXZ0, tY0);
  const tExit = Math.min(1, tXZ1, tY1);
  if (tEnter > tExit) {
    return miss;
  }
  return {
    hit: true,
    t: tEnter,
    hitPos: {
      x: prevPos.x + vx * tEnter,
      y: prevPos.y + vy * tEnter,
      z: prevPos.z + vz * tEnter,
    },
  };
}

/**
 * Single-Source-of-Truth 3D segment-to-shield-surface intersection.
 * Ensures the rendered barrier shape (full sphere, hemisphere dome, rect tower, diamond quadrant, or buckler disc)
 * matches the projectile interception boundary 1:1.
 */
export function evaluateShieldSegmentIntercept(
  shieldState,
  prevPos,
  curPos,
  shieldCenter,
  aimNormal = { x: 0, y: 0, z: -1 },
  {
    coverageMode = 'hemisphere',
    barrierRadiusM = 1.35,
    rectHalfW = 0.64,
    rectHalfH = 1.04,
    yawHalfDeg = 85,
    pitchHalfDeg = 72,
  } = {},
) {
  const miss = { intercepted: false, t: null, hitPos: null, frontDot: 0 };
  if (!shieldState || !shieldState.barrierActive || !prevPos || !curPos || !shieldCenter) {
    return miss;
  }

  const { nx, ny, nz, rx, ry, rz, ux, uy, uz } = _buildAimBasis(aimNormal);

  const vx = curPos.x - prevPos.x;
  const vy = curPos.y - prevPos.y;
  const vz = curPos.z - prevPos.z;
  const segLenSq = vx * vx + vy * vy + vz * vz;
  const R = Math.max(0.2, barrierRadiusM);

  const fx = prevPos.x - shieldCenter.x;
  const fy = prevPos.y - shieldCenter.y;
  const fz = prevPos.z - shieldCenter.z;

  const segLen = Math.sqrt(segLenSq) || 1;
  const approachDot = clamp(-(vx * nx + vy * ny + vz * nz) / segLen, -1, 1);

  if (coverageMode === 'buckler_disc') {
    const denom = vx * nx + vy * ny + vz * nz;
    const d0 = fx * nx + fy * ny + fz * nz;
    if (denom >= -1e-6) {
      return miss;
    }
    const t = -d0 / denom;
    if (t < -0.05 || t > 1.02) {
      return miss;
    }
    const ct = clamp(t, 0, 1);
    const hx = prevPos.x + vx * ct;
    const hy = prevPos.y + vy * ct;
    const hz = prevPos.z + vz * ct;
    const dx = hx - shieldCenter.x;
    const dy = hy - shieldCenter.y;
    const dz = hz - shieldCenter.z;
    if (dx * dx + dy * dy + dz * dz <= R * R) {
      return { intercepted: true, t: ct, hitPos: { x: hx, y: hy, z: hz }, frontDot: approachDot };
    }
    return miss;
  }

  if (coverageMode === 'rect_tower') {
    const denom = vx * nx + vy * ny + vz * nz;
    if (denom >= -1e-6) {
      return miss;
    }
    // Tower shield projection plane sits R meters in front of shieldCenter along aimNormal
    const px = shieldCenter.x + nx * R;
    const py = shieldCenter.y + ny * R;
    const pz = shieldCenter.z + nz * R;
    const d0 = (prevPos.x - px) * nx + (prevPos.y - py) * ny + (prevPos.z - pz) * nz;
    const t = -d0 / denom;
    if (t < -0.05 || t > 1.02) {
      return miss;
    }
    const ct = clamp(t, 0, 1);
    const hx = prevPos.x + vx * ct;
    const hy = prevPos.y + vy * ct;
    const hz = prevPos.z + vz * ct;
    const dx = hx - px;
    const dy = hy - py;
    const dz = hz - pz;
    const lx = dx * rx + dy * ry + dz * rz;
    const ly = dx * ux + dy * uy + dz * uz;
    if (Math.abs(lx) <= rectHalfW && Math.abs(ly) <= rectHalfH) {
      return { intercepted: true, t: ct, hitPos: { x: hx, y: hy, z: hz }, frontDot: approachDot };
    }
    return miss;
  }

  if (segLenSq < 1e-10) {
    return miss;
  }

  const b = 2 * (fx * vx + fy * vy + fz * vz);
  const c = fx * fx + fy * fy + fz * fz - R * R;
  const disc = b * b - 4 * segLenSq * c;
  if (disc < 0) {
    return miss;
  }

  const sqrtDisc = Math.sqrt(disc);
  const inv2a = 0.5 / segLenSq;
  const roots = [(-b - sqrtDisc) * inv2a, (-b + sqrtDisc) * inv2a];

  for (let i = 0; i < roots.length; i++) {
    const t = roots[i];
    if (t < 0 || t > 1) continue;
    const hx = prevPos.x + vx * t;
    const hy = prevPos.y + vy * t;
    const hz = prevPos.z + vz * t;

    if (coverageMode === 'full_sphere') {
      return { intercepted: true, t, hitPos: { x: hx, y: hy, z: hz }, frontDot: 1.0 };
    }

    // Directional barriers only block rounds traveling inward against barrier normal
    if (approachDot <= 0) continue;

    const dx = hx - shieldCenter.x;
    const dy = hy - shieldCenter.y;
    const dz = hz - shieldCenter.z;
    const dLen = Math.hypot(dx, dy, dz) || 1;
    const lx = (dx * rx + dy * ry + dz * rz) / dLen;
    const ly = (dx * ux + dy * uy + dz * uz) / dLen;
    const lz = (dx * nx + dy * ny + dz * nz) / dLen;
    if (lz <= 0.01) continue;

    const azDeg = Math.abs(Math.atan2(lx, lz) * RAD_TO_DEG);
    const elDeg = Math.abs(Math.asin(clamp(ly, -1, 1)) * RAD_TO_DEG);

    if (coverageMode === 'diamond_quadrant') {
      const manhattan = azDeg / Math.max(1, yawHalfDeg) + elDeg / Math.max(1, pitchHalfDeg);
      if (manhattan <= 1.0) {
        return { intercepted: true, t, hitPos: { x: hx, y: hy, z: hz }, frontDot: approachDot };
      }
    } else if (azDeg <= yawHalfDeg && elDeg <= pitchHalfDeg) {
      return { intercepted: true, t, hitPos: { x: hx, y: hy, z: hz }, frontDot: approachDot };
    }
  }

  return miss;
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

const DEG_TO_RAD = Math.PI / 180;
const RAD_TO_DEG = 180 / Math.PI;

/**
 * Wraps an arbitrary radian angle onto [-PI, PI].
 * @param {number} rad
 * @returns {number}
 */
function wrapAngleRad(rad) {
  return Math.atan2(Math.sin(rad), Math.cos(rad));
}

/**
 * Smoothly steps the lower-body / root yaw independently from cameraYaw.
 * - Combat active: aligns body toward cameraYaw for tactical strafe/guard.
 * - Moving without combat: turns body smoothly toward world movement direction.
 * - Idle: preserves current bodyYaw so the camera can orbit/inspect freely.
 * @param {{ bodyYaw?: number }} [state]
 * @param {{ cameraYaw?: number, moveX?: number, moveZ?: number, isMoving?: boolean, combatActive?: boolean, dt?: number }} [input]
 */
export function stepDecoupledBodyYaw(
  state = { bodyYaw: 0 },
  {
    cameraYaw = 0,
    moveX = 0,
    moveZ = 0,
    isMoving = false,
    combatActive = false,
    guardHeld = false,
    guardComfortDeg = 92,
    dt = 1 / 60,
  } = {}
) {
  const bodyYaw = Number.isFinite(state?.bodyYaw) ? state.bodyYaw : 0;
  const moveMag = Math.hypot(moveX, moveZ);

  let targetBodyYaw = bodyYaw;
  let turnRateRadPerSec = 0;
  let tacticalBackpedal = false;

  if (combatActive) {
    targetBodyYaw = cameraYaw;
    turnRateRadPerSec = 9.0;
  } else if (guardHeld) {
    if (isMoving && moveMag > 0.01) {
      const lookFwdX = -Math.sin(cameraYaw);
      const lookFwdZ = -Math.cos(cameraYaw);
      const moveDotLook = (lookFwdX * moveX + lookFwdZ * moveZ) / moveMag;
      if (moveDotLook < -0.09) {
        // Retreating >95 deg relative to crosshair: pivot lower body to face enemy for natural tactical backpedal
        tacticalBackpedal = true;
        targetBodyYaw = cameraYaw;
        turnRateRadPerSec = 7.8;
      } else {
        targetBodyYaw = Math.atan2(-moveX, -moveZ);
        turnRateRadPerSec = 6.5;
      }
    } else {
      const guardDeltaDeg = Math.abs(wrapAngleRad(cameraYaw - bodyYaw)) * RAD_TO_DEG;
      if (guardDeltaDeg > guardComfortDeg) {
        targetBodyYaw = cameraYaw;
        turnRateRadPerSec = 6.2;
      } else {
        return {
          bodyYaw,
          targetBodyYaw: bodyYaw,
          moveYawDeltaRad: 0,
          turnRateRadPerSec: 0,
          tacticalBackpedal: false,
        };
      }
    }
  } else if (isMoving && moveMag > 0.01) {
    targetBodyYaw = Math.atan2(-moveX, -moveZ);
    turnRateRadPerSec = 6.5;
  } else {
    return {
      bodyYaw,
      targetBodyYaw: bodyYaw,
      moveYawDeltaRad: 0,
      turnRateRadPerSec: 0,
      tacticalBackpedal: false,
    };
  }

  const delta = wrapAngleRad(targetBodyYaw - bodyYaw);
  const maxStep = turnRateRadPerSec * clamp(dt, 0, 0.1);
  const step = Math.sign(delta) * Math.min(Math.abs(delta), maxStep);
  const nextBodyYaw = wrapAngleRad(bodyYaw + step);

  return {
    bodyYaw: nextBodyYaw,
    targetBodyYaw,
    moveYawDeltaRad: step,
    turnRateRadPerSec,
    tacticalBackpedal,
  };
}

/**
 * Distributes upper-body yaw & pitch toward the crosshair with strict per-joint limits
 * and cross-chest forward push so shields/arms do not clip into torso or chin.
 * Beyond comfortLimitDeg while not guarding, lookWeight relaxes smoothly to 0
 * so the player can orbit around and inspect the mecha's front naturally.
 */
export function computeUpperBodyAimPose({
  cameraYaw = 0,
  bodyYaw = 0,
  cameraPitch = 0,
  comfortLimitDeg = 75,
  disengageDeg = 120,
  guardActive = false,
  shieldSide = 'left',
} = {}) {
  const rawDeltaDeg = wrapAngleRad(cameraYaw - bodyYaw) * RAD_TO_DEG;
  const absDeltaDeg = Math.abs(rawDeltaDeg);

  let lookWeight = 1;
  if (!guardActive && absDeltaDeg > comfortLimitDeg) {
    const span = Math.max(1, disengageDeg - comfortLimitDeg);
    const t = clamp((absDeltaDeg - comfortLimitDeg) / span, 0, 1);
    lookWeight = 1 - t * t * (3 - 2 * t);
  }

  const maxAimYawDeg = guardActive ? 92 : 72;
  const effectiveYawDeg = clamp(rawDeltaDeg, -maxAimYawDeg, maxAimYawDeg) * lookWeight;
  const pelvisYawDeg = guardActive
    ? clamp(effectiveYawDeg * 0.16, -14, 14)
    : clamp(effectiveYawDeg * 0.14, -10, 10);
  const torsoYawDeg = guardActive
    ? clamp(effectiveYawDeg * 0.46, -42, 42)
    : clamp(effectiveYawDeg * 0.44, -34, 34);
  const headYawDeg = clamp(effectiveYawDeg - pelvisYawDeg - torsoYawDeg, -48, 48);

  const pitchDeg = cameraPitch * RAD_TO_DEG;
  const effectivePitchDeg = pitchDeg * lookWeight;
  const torsoPitchAimDeg = clamp(effectivePitchDeg * 0.28, -14, 18);
  const headPitchDeg = clamp(effectivePitchDeg * 0.65, -24, 32);
  const gunPitchDeg = clamp(effectivePitchDeg * 0.85, -28, 38);
  const shieldPitchDeg = clamp(effectivePitchDeg * 0.92, -28, 38);

  const residualYawDeg = effectiveYawDeg - pelvisYawDeg - torsoYawDeg;
  const isRightShield = shieldSide === 'right';
  const shieldYawDeg = isRightShield
    ? clamp(residualYawDeg, -36, 18)
    : clamp(residualYawDeg, -18, 36);
  const gunYawDeg = isRightShield
    ? clamp(residualYawDeg, -22, 36)
    : clamp(residualYawDeg, -36, 22);

  const inwardCrossDeg = isRightShield
    ? Math.max(0, residualYawDeg)
    : Math.max(0, -residualYawDeg);
  const shieldForwardPushM = clamp(inwardCrossDeg / 26, 0, 1) * 0.11 + (guardActive ? 0.05 : 0);
  const shieldCenterPull = guardActive ? 0.92 : 0;

  return {
    rawDeltaDeg,
    lookWeight,
    effectiveYawDeg,
    pelvisYawDeg,
    torsoYawDeg,
    headYawDeg,
    torsoPitchAimDeg,
    headPitchDeg,
    gunPitchDeg,
    shieldPitchDeg,
    shieldYawDeg,
    gunYawDeg,
    shieldForwardPushM,
    shieldCenterPull,
  };
}

/**
 * Computes the 3D world-space outward normal vector of the raised/aimed shield face.
 */
export function computeShieldAimWorldNormal({
  bodyYaw = 0,
  torsoYawDeg = 0,
  pelvisYawDeg = 0,
  shieldYawDeg = 0,
  shieldPitchDeg = 0,
} = {}) {
  const yaw = bodyYaw + (pelvisYawDeg + torsoYawDeg + shieldYawDeg) * DEG_TO_RAD;
  const pitch = shieldPitchDeg * DEG_TO_RAD;
  const cosP = Math.cos(pitch);
  const x = -Math.sin(yaw) * cosP;
  const y = Math.sin(pitch);
  const z = -Math.cos(yaw) * cosP;
  const len = Math.hypot(x, y, z) || 1;
  return {
    x: x / len,
    y: y / len,
    z: z / len,
  };
}

function _restFootWorldXZ(bodyX, bodyZ, bodyYaw, stanceHalfWidthM, side) {
  const s = side === 'L' ? -1 : 1;
  return {
    x: bodyX + s * stanceHalfWidthM * Math.cos(bodyYaw),
    z: bodyZ - s * stanceHalfWidthM * Math.sin(bodyYaw),
  };
}

function _makeFootTracker(x, y, z, yawRad) {
  return {
    mode: 'STANCE',
    worldX: x,
    worldY: y,
    worldZ: z,
    startX: x,
    startY: y,
    startZ: z,
    targetX: x,
    targetY: y,
    targetZ: z,
    swingT: 0,
    swingDurationSec: 0.34,
    liftHeightM: 0.22,
    yawRad,
    liftOffsetM: 0,
    pitchCueDeg: 0,
  };
}

/**
 * Initializes independent Left/Right foot world-space trackers under a narrow 5-6 deg heroic stance.
 */
export function createBipedalFootState({
  bodyX = 0,
  bodyY = 0,
  bodyZ = 0,
  bodyYaw = 0,
  stanceHalfWidthM = 0.28,
  groundY = 0,
} = {}) {
  const restL = _restFootWorldXZ(bodyX, bodyZ, bodyYaw, stanceHalfWidthM, 'L');
  const restR = _restFootWorldXZ(bodyX, bodyZ, bodyYaw, stanceHalfWidthM, 'R');
  return {
    L: _makeFootTracker(restL.x, groundY, restL.z, bodyYaw),
    R: _makeFootTracker(restR.x, groundY, restR.z, bodyYaw),
    nextSwingSide: 'L',
    plantedSide: null,
    liftedSide: null,
    pelvisDropM: 0,
    pelvisShiftXM: 0,
    pelvisRollDeg: 0,
    driveGain: 0,
  };
}

/**
 * Advances Left and Right FootTrackers through a Foot-Driven single-swing BipedalGaitCoordinator:
 * - Immediate Anticipation: starts extending lead foot forward on frame 0 before body surges ahead.
 * - Foot-Driven Momentum: outputs `driveGain` (low during foot extension, surging on rear push-off).
 * - Zero Double-Trailing: throttles driveGain if both feet ever lag behind body center.
 * - STANCE foot stays locked to exact world XZ (zero foot skate).
 */
export function stepBipedalFootTrackers(
  state,
  {
    bodyX = 0,
    bodyY = 0,
    bodyZ = 0,
    bodyYaw = 0,
    vx = 0,
    vz = 0,
    wishDirX = 0,
    wishDirZ = 0,
    hasMoveInput = false,
    isGrounded = true,
    supportY = 0,
    dt = 1 / 60,
    stanceHalfWidthM = 0.28,
  } = {},
) {
  const base = state || createBipedalFootState({ bodyX, bodyY, bodyZ, bodyYaw, stanceHalfWidthM, groundY: supportY });
  const restL = _restFootWorldXZ(bodyX, bodyZ, bodyYaw, stanceHalfWidthM, 'L');
  const restR = _restFootWorldXZ(bodyX, bodyZ, bodyYaw, stanceHalfWidthM, 'R');

  if (!isGrounded) {
    const a = 1 - Math.exp(-12 * clamp(dt, 0, 0.1));
    const L = {
      ...base.L,
      mode: 'STANCE',
      worldX: lerp(base.L.worldX, restL.x, a),
      worldY: supportY,
      worldZ: lerp(base.L.worldZ, restL.z, a),
      yawRad: bodyYaw,
      liftOffsetM: 0,
      pitchCueDeg: 0,
    };
    const R = {
      ...base.R,
      mode: 'STANCE',
      worldX: lerp(base.R.worldX, restR.x, a),
      worldY: supportY,
      worldZ: lerp(base.R.worldZ, restR.z, a),
      yawRad: bodyYaw,
      liftOffsetM: 0,
      pitchCueDeg: 0,
    };
    return {
      L,
      R,
      nextSwingSide: base.nextSwingSide || 'L',
      plantedSide: null,
      liftedSide: null,
      pelvisDropM: 0,
      pelvisShiftXM: 0,
      pelvisRollDeg: 0,
      driveGain: 1.0,
    };
  }

  const errL = Math.hypot(restL.x - base.L.worldX, restL.z - base.L.worldZ);
  const errR = Math.hypot(restR.x - base.R.worldX, restR.z - base.R.worldZ);

  // Teleport / reset guard
  if (errL > 2.4 && errR > 2.4) {
    return createBipedalFootState({ bodyX, bodyY, bodyZ, bodyYaw, stanceHalfWidthM, groundY: supportY });
  }

  const speed = Math.hypot(vx, vz);
  const wishMag = Math.hypot(wishDirX, wishDirZ);
  const activeMove = Boolean(hasMoveInput && wishMag > 0.01);
  const dirX = activeMove ? wishDirX / wishMag : speed > 0.15 ? vx / speed : -Math.sin(bodyYaw);
  const dirZ = activeMove ? wishDirZ / wishMag : speed > 0.15 ? vz / speed : -Math.cos(bodyYaw);

  const clampedDt = clamp(dt, 0, 0.05);
  const targetStrideM = activeMove ? clamp(0.60 + speed * 0.085, 0.60, 0.78) : clamp(speed * 0.16, 0, 0.42);
  let plantedSide = null;
  let liftedSide = null;
  let nextSwingSide = base.nextSwingSide || 'L';

  const nextFeet = {
    L: { ...base.L },
    R: { ...base.R },
  };

  for (const side of ['L', 'R']) {
    const f = nextFeet[side];
    if (f.mode === 'SWING') {
      const dur = Math.max(0.14, f.swingDurationSec || 0.28);
      f.swingT = Math.min(1, f.swingT + clampedDt / dur);
      // Track live landing target ahead of moving body during first 75% of swing so foot always plants well in front
      if (f.swingT < 0.75) {
        const rest = side === 'L' ? restL : restR;
        f.targetX = rest.x + dirX * targetStrideM;
        f.targetY = supportY;
        f.targetZ = rest.z + dirZ * targetStrideM;
      }
      const s = f.swingT * f.swingT * (3 - 2 * f.swingT);
      f.worldX = lerp(f.startX, f.targetX, s);
      f.worldZ = lerp(f.startZ, f.targetZ, s);
      const arc = Math.sin(Math.PI * s);
      f.liftOffsetM = arc * (f.liftHeightM || 0.20);
      f.worldY = lerp(f.startY, f.targetY, s) + f.liftOffsetM;
      f.pitchCueDeg = Math.cos(Math.PI * f.swingT) * 10 * arc;
      f.yawRad = bodyYaw;

      if (f.swingT >= 1) {
        f.mode = 'STANCE';
        f.worldX = f.targetX;
        f.worldY = f.targetY;
        f.worldZ = f.targetZ;
        f.liftOffsetM = 0;
        f.pitchCueDeg = 0;
        plantedSide = side;
        nextSwingSide = side === 'L' ? 'R' : 'L';
      }
    } else {
      // STANCE foot stays strictly pinned on world XZ; reconcile height cleanly for rooftops/slopes
      f.worldY = lerp(f.worldY, supportY, 1 - Math.exp(-24 * clampedDt));
      f.liftOffsetM = 0;
      f.pitchCueDeg = 0;
    }
  }

  // Strict Single-Swing Coordinator with Strict L<->R Alternation & Big Stride Reach
  if (nextFeet.L.mode === 'STANCE' && nextFeet.R.mode === 'STANCE') {
    const newErrL = Math.hypot(restL.x - nextFeet.L.worldX, restL.z - nextFeet.L.worldZ);
    const newErrR = Math.hypot(restR.x - nextFeet.R.worldX, restR.z - nextFeet.R.worldZ);
    const yawErrL = Math.abs(wrapAngleRad(bodyYaw - nextFeet.L.yawRad));
    const yawErrR = Math.abs(wrapAngleRad(bodyYaw - nextFeet.R.yawRad));

    const leadL = (nextFeet.L.worldX - bodyX) * dirX + (nextFeet.L.worldZ - bodyZ) * dirZ;
    const leadR = (nextFeet.R.worldX - bodyX) * dirX + (nextFeet.R.worldZ - bodyZ) * dirZ;
    const maxLead = Math.max(leadL, leadR);

    let pickSide = null;
    if (activeMove) {
      // Never repeat the same foot twice in a row during active locomotion
      const cand = nextSwingSide;
      const fCand = nextFeet[cand];
      const restCand = cand === 'L' ? restL : restR;
      const alongCand = (fCand.worldX - restCand.x) * dirX + (fCand.worldZ - restCand.z) * dirZ;
      const latCand = Math.hypot(fCand.worldX - restCand.x - alongCand * dirX, fCand.worldZ - restCand.z - alongCand * dirZ);
      const yawCand = Math.abs(wrapAngleRad(bodyYaw - fCand.yawRad));
      if (maxLead < 0.14 || alongCand <= -0.14 || latCand > 0.22 || yawCand > 0.32) {
        pickSide = cand;
      }
    } else {
      const idleThresh = speed > 0.35 ? 0.20 : 0.14;
      const needL = newErrL > idleThresh || yawErrL > 0.32;
      const needR = newErrR > idleThresh || yawErrR > 0.32;
      if (needL && needR) {
        pickSide = newErrL > newErrR * 1.25 ? 'L' : newErrR > newErrL * 1.25 ? 'R' : nextSwingSide;
      } else if (needL) {
        pickSide = 'L';
      } else if (needR) {
        pickSide = 'R';
      }
    }

    if (pickSide) {
      const f = nextFeet[pickSide];
      const rest = pickSide === 'L' ? restL : restR;
      const offX = dirX * targetStrideM;
      const offZ = dirZ * targetStrideM;

      f.mode = 'SWING';
      f.startX = f.worldX;
      f.startY = f.worldY;
      f.startZ = f.worldZ;
      f.targetX = rest.x + offX;
      f.targetY = supportY;
      f.targetZ = rest.z + offZ;
      f.swingT = 0;
      f.swingDurationSec = activeMove ? clamp(0.38 - speed * 0.014, 0.28, 0.38) : 0.26;
      f.liftHeightM = activeMove ? clamp(0.24 + speed * 0.015, 0.24, 0.32) : 0.16;
      f.yawRad = bodyYaw;
      liftedSide = pickSide;
    }
  }

  // Foot-Driven Momentum Modulation ("先出腳、再靠後腳蹬地推進身體")
  let driveGain = activeMove ? 0.38 : 0.0;
  const activeFoot = nextFeet.L.mode === 'SWING' ? nextFeet.L : nextFeet.R.mode === 'SWING' ? nextFeet.R : null;
  if (activeFoot) {
    const t = activeFoot.swingT;
    if (t < 0.28) {
      // Foot reaches forward before torso surges
      driveGain = lerp(0.16, 0.45, t / 0.28);
    } else if (t < 0.85) {
      // Stance rear leg drives center-of-mass forward over planted/landing lead foot
      const u = (t - 0.28) / 0.57;
      driveGain = 0.45 + Math.sin(u * Math.PI) * 0.65;
    } else {
      // Heel-strike catch impact
      const u = (t - 0.85) / 0.15;
      driveGain = lerp(0.54, 0.38, u);
    }
  }

  // Hard Zero-Double-Trailing Safety Lock: never let body run ahead of both feet
  if (activeMove) {
    const leadL = (nextFeet.L.worldX - bodyX) * dirX + (nextFeet.L.worldZ - bodyZ) * dirZ;
    const leadR = (nextFeet.R.worldX - bodyX) * dirX + (nextFeet.R.worldZ - bodyZ) * dirZ;
    const maxLead = Math.max(leadL, leadR);
    if (maxLead < 0.05) {
      driveGain = Math.min(driveGain, clamp((maxLead + 0.04) / 0.09, 0.06, 0.35));
    }
  }

  // Organic center-of-mass transfer over stance foot + stride hip drop
  let pelvisShiftXM = 0;
  let pelvisRollDeg = 0;
  const maxStrideErr = Math.max(
    Math.hypot(restL.x - nextFeet.L.worldX, restL.z - nextFeet.L.worldZ),
    Math.hypot(restR.x - nextFeet.R.worldX, restR.z - nextFeet.R.worldZ),
  );
  const pelvisDropM = clamp((maxStrideErr - 0.10) * 0.24, 0, 0.10);

  if (nextFeet.L.mode === 'SWING') {
    const w = Math.sin(Math.PI * nextFeet.L.swingT);
    pelvisShiftXM = 0.042 * w;
    pelvisRollDeg = -2.4 * w;
  } else if (nextFeet.R.mode === 'SWING') {
    const w = Math.sin(Math.PI * nextFeet.R.swingT);
    pelvisShiftXM = -0.042 * w;
    pelvisRollDeg = 2.4 * w;
  }

  return {
    L: nextFeet.L,
    R: nextFeet.R,
    nextSwingSide,
    plantedSide,
    liftedSide,
    pelvisDropM,
    pelvisShiftXM,
    pelvisRollDeg,
    driveGain,
  };
}

/**
 * Agile knees-bent Gundam hover/boost skate stance when thrusters ignite (Shift/Space),
 * preventing stiff trailing legs behind a banked torso.
 */
export function computeBoostSkatePose({ forward = 0, strafe = 0 } = {}) {
  const fwdMag = Math.abs(forward);
  const frontHipDeg = 24 + fwdMag * 8;
  const frontKneeDeg = -42 - fwdMag * 6;
  const ankleFrontDeg = -(frontHipDeg + frontKneeDeg) + 4;
  const backHipDeg = -10 - Math.max(0, forward) * 5;
  const backKneeDeg = -30 - Math.abs(strafe) * 6;
  const ankleBackDeg = 20;
  return {
    frontHipDeg,
    frontKneeDeg,
    ankleFrontDeg,
    backHipDeg,
    backKneeDeg,
    ankleBackDeg,
    bankScale: 0.58,
  };
}

/**
 * Analytic 2-Bone Leg IK mapping world hip socket + world foot sole position to VALIANT leg bone Euler angles.
 */
export function solveTwoBoneLegIK({
  side = 'L',
  hipWorld = { x: -0.18, y: 1.5, z: 0 },
  footWorld = { x: -0.28, y: 0, z: 0 },
  bodyYaw = 0,
  L1 = 0.6649,
  L2 = 0.7036,
  ankleHeightM = 0.1425,
  restFlareDeg = 6.9,
  pitchCueDeg = 0,
} = {}) {
  const cosY = Math.cos(bodyYaw);
  const sinY = Math.sin(bodyYaw);
  const dx = footWorld.x - hipWorld.x;
  const dz = footWorld.z - hipWorld.z;

  // Body-local offsets (+X right, -Z forward)
  const localX = dx * cosY - dz * sinY;
  const localZ = dx * sinY + dz * cosY;
  const ankleY = footWorld.y + ankleHeightM;
  const down = Math.max(0.28, hipWorld.y - ankleY);
  const fwd = -localZ;

  // Outward lateral flare angle (positive = wider outward; negative delta = narrower than restFlareDeg)
  const outwardX = side === 'L' ? -localX : localX;
  const desiredOutwardDeg = clamp(Math.atan2(outwardX, down) * RAD_TO_DEG, 1.0, 22.0);
  const hipRollDeltaDeg = desiredOutwardDeg - restFlareDeg;
  const hipRollAppliedZDeg = side === 'L' ? hipRollDeltaDeg : -hipRollDeltaDeg;
  const ankleRollZDeg = -hipRollAppliedZDeg * 0.9;

  // 2-Bone sagittal plane law of cosines (forward-pointing knee bend)
  const planarDown = Math.hypot(localX, down);
  const maxReach = L1 + L2 - 0.008;
  const minReach = Math.abs(L1 - L2) + 0.05;
  const d = clamp(Math.hypot(planarDown, fwd), minReach, maxReach);

  const cosKnee = clamp((L1 * L1 + L2 * L2 - d * d) / (2 * L1 * L2), -1, 1);
  const kneeInt = Math.acos(cosKnee);
  const kneePitchDeg = -(Math.PI - kneeInt) * RAD_TO_DEG;

  const lineAngle = Math.atan2(fwd, planarDown);
  const cosAlpha = clamp((L1 * L1 + d * d - L2 * L2) / (2 * L1 * d), -1, 1);
  const alpha = Math.acos(cosAlpha);
  const hipPitchDeg = (lineAngle + alpha) * RAD_TO_DEG;

  const anklePitchDeg = -(hipPitchDeg + kneePitchDeg) + pitchCueDeg;

  return {
    hipPitchDeg,
    kneePitchDeg,
    anklePitchDeg,
    hipRollDeltaDeg,
    hipRollAppliedZDeg,
    ankleRollZDeg,
    reachDistM: d,
    desiredOutwardDeg,
  };
}

/**
 * Closest distance squared between 3D line segments [p0, p1] and [q0, q1].
 * Returns { distSq, tP, tQ } where tP in [0,1] along [p0,p1] and tQ in [0,1] along [q0,q1].
 */
function _closestPointsSegments3D(p0, p1, q0, q1) {
  const dx = p1.x - p0.x;
  const dy = p1.y - p0.y;
  const dz = p1.z - p0.z;
  const ex = q1.x - q0.x;
  const ey = q1.y - q0.y;
  const ez = q1.z - q0.z;
  const rx = p0.x - q0.x;
  const ry = p0.y - q0.y;
  const rz = p0.z - q0.z;

  const a = dx * dx + dy * dy + dz * dz;
  const e = ex * ex + ey * ey + ez * ez;
  const f = ex * rx + ey * ry + ez * rz;

  let s = 0;
  let t = 0;
  if (a <= 1e-10 && e <= 1e-10) {
    s = 0;
    t = 0;
  } else if (a <= 1e-10) {
    s = 0;
    t = clamp(f / e, 0, 1);
  } else {
    const c = dx * rx + dy * ry + dz * rz;
    if (e <= 1e-10) {
      t = 0;
      s = clamp(-c / a, 0, 1);
    } else {
      const b = dx * ex + dy * ey + dz * ez;
      const denom = a * e - b * b;
      s = denom !== 0 ? clamp((b * f - c * e) / denom, 0, 1) : 0;
      t = (b * s + f) / e;
      if (t < 0) {
        t = 0;
        s = clamp(-c / a, 0, 1);
      } else if (t > 1) {
        t = 1;
        s = clamp((b - c) / a, 0, 1);
      }
    }
  }

  const cx = p0.x + dx * s - (q0.x + ex * t);
  const cy = p0.y + dy * s - (q0.y + ey * t);
  const cz = p0.z + dz * s - (q0.z + ez * t);
  return {
    distSq: cx * cx + cy * cy + cz * cz,
    tP: s,
    tQ: t,
  };
}

const PART_HIT_TIE_PRIORITY = Object.freeze({
  head: 0,
  arm_l: 1,
  arm_r: 1,
  backpack: 2,
  legs: 3,
  torso: 4,
});

/**
 * Evaluate swept shot segment [prevPos -> curPos] against 6 bone-tracked 3D capsules.
 * Skips capsules flagged disabled (e.g., already severed limbs).
 * Returns { hit, partId, t, hitPos }.
 */
export function evaluateSubPartSegmentHit(prevPos, curPos, partCapsules = []) {
  const miss = { hit: false, partId: null, t: null, hitPos: null };
  if (!prevPos || !curPos || !Array.isArray(partCapsules) || partCapsules.length === 0) {
    return miss;
  }

  const vx = curPos.x - prevPos.x;
  const vy = curPos.y - prevPos.y;
  const vz = curPos.z - prevPos.z;

  let best = null;
  let bestScore = Infinity;
  for (let i = 0; i < partCapsules.length; i++) {
    const cap = partCapsules[i];
    if (!cap || cap.disabled || !cap.a || !cap.b) continue;
    const rad = Math.max(0.08, Number(cap.radius) || 0.25);
    const closest = _closestPointsSegments3D(prevPos, curPos, cap.a, cap.b);
    if (closest.distSq > rad * rad) continue;

    // Slight precision tie-break so clean shots clipping outer arms/head register limb hits instead of swallowing by torso
    const prio = PART_HIT_TIE_PRIORITY[cap.partId] ?? 5;
    const score = closest.tP + prio * 0.015;
    if (score < bestScore) {
      bestScore = score;
      best = {
        partId: cap.partId,
        t: closest.tP,
        hitPos: {
          x: prevPos.x + vx * closest.tP,
          y: prevPos.y + vy * closest.tP,
          z: prevPos.z + vz * closest.tP,
        },
      };
    }
  }

  if (!best) return miss;
  return {
    hit: true,
    partId: best.partId,
    t: best.t,
    hitPos: best.hitPos,
  };
}

/**
 * Advance flying severed limb debris (+ attached weapon) with gravity, tumble, bounce & rooftop settle.
 */
export function stepSeveredLimbDebris(debrisList = [], dt = 1 / 60, getGroundHeightAt = null) {
  const impactEvents = [];
  const nextDebris = [];
  const stepDt = Math.max(0, Math.min(0.05, dt || 0));

  for (const raw of debrisList) {
    if (!raw) continue;
    const item = { ...raw };
    item.ageSec = (item.ageSec || 0) + stepDt;
    if (item.ttlSec && item.ageSec >= item.ttlSec) {
      continue;
    }
    if (item.settled) {
      nextDebris.push(item);
      continue;
    }

    item.vy = (item.vy || 0) - GRAVITY_MPS2 * stepDt;
    item.x += (item.vx || 0) * stepDt;
    item.y += item.vy * stepDt;
    item.z += (item.vz || 0) * stepDt;
    item.yaw = (item.yaw || 0) + (item.angY || 0) * stepDt;
    item.rotX = (item.rotX || 0) + (item.angX || 0) * stepDt;
    item.rotZ = (item.rotZ || 0) + (item.angZ || 0) * stepDt;

    const surfaceY = typeof getGroundHeightAt === 'function' ? Number(getGroundHeightAt(item.x, item.z)) || 0 : 0;
    const minY = surfaceY + 0.14;
    if (item.y <= minY) {
      item.y = minY;
      if (Math.abs(item.vy) > 1.5 && (item.bounces || 0) < 2) {
        item.vy = Math.abs(item.vy) * 0.30;
        item.vx = (item.vx || 0) * 0.42;
        item.vz = (item.vz || 0) * 0.42;
        item.angX = (item.angX || 0) * 0.4;
        item.angY = (item.angY || 0) * 0.4;
        item.angZ = (item.angZ || 0) * 0.4;
        item.bounces = (item.bounces || 0) + 1;
        impactEvents.push({ side: item.side, x: item.x, y: item.y, z: item.z, bounce: item.bounces });
      } else {
        item.vx = 0;
        item.vy = 0;
        item.vz = 0;
        item.angX = 0;
        item.angY = 0;
        item.angZ = 0;
        item.rotX = Math.PI * 0.5;
        item.settled = true;
        impactEvents.push({ side: item.side, x: item.x, y: item.y, z: item.z, settled: true });
      }
    }
    nextDebris.push(item);
  }

  return { debrisList: nextDebris, impactEvents };
}


