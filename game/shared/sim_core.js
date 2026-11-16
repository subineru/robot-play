/**
 * PLAY_ROBOTS Pure Deterministic Combat Simulation Core (Phase B Task 4).
 * Clean Architecture Domain Layer (Zero DOM / Zero THREE dependencies).
 * Shared identically by Browser Client and future Authoritative WebSocket Server:
 * - Shield Anti-Spam Design A (minHoldSec, tiered reRaiseDelaySec, Hold Buffer)
 * - Shield Anti-Spam Design B (1.0s whiff parry decay 100%->50%->0% + Perfect Parry instant reset)
 * - AP / EN / ACS 200% Stagger + Map Environmental Physics Hooks
 * - Bidirectional Melee Arbitration (Saber Clash, Active Blade Parry, Saber vs Shield)
 */
import { clamp, createShieldState, stepShieldDefense } from './kinematics.js';

export const SABER_CLASH_WINDOW_SEC = 0.14;
export const SABER_CLASH_HITSTOP_SEC = 0.09;
export const ACTIVE_BLADE_PARRY_WINDOW_SEC = 0.15;
export const ACTIVE_BLADE_PARRY_COOLDOWN_SEC = 0.65;
export const STAGGER_DURATION_SEC = 2.2;
export const STAGGER_DAMAGE_MULT = 2.0;

export const SHIELD_ANTI_SPAM_SPECS = Object.freeze({
  'EF-SH01': Object.freeze({ minHoldSec: 0.15, reRaiseDelaySec: 0.28 }),
  'EF-SH03': Object.freeze({ minHoldSec: 0.18, reRaiseDelaySec: 0.40 }),
  'EF-HS07': Object.freeze({ minHoldSec: 0.22, reRaiseDelaySec: 0.55 }),
  'EF-SH09': Object.freeze({ minHoldSec: 0.28, reRaiseDelaySec: 0.80 }),
});

const WHIFF_PARRY_SCALES = [1.0, 0.5, 0.0];

/**
 * Resolve tiered Design A minHold / reRaiseDelay parameters for a shield definition.
 */
export function resolveShieldAntiSpamSpec(shieldDef) {
  const fallback = SHIELD_ANTI_SPAM_SPECS[shieldDef?.id] || SHIELD_ANTI_SPAM_SPECS['EF-SH03'];
  return {
    minHoldSec: Number.isFinite(shieldDef?.minHoldSec) ? shieldDef.minHoldSec : fallback.minHoldSec,
    reRaiseDelaySec: Number.isFinite(shieldDef?.reRaiseDelaySec) ? shieldDef.reRaiseDelaySec : fallback.reRaiseDelaySec,
  };
}

/**
 * Create a shield capacitor + Design A+B anti-spam state object.
 */
export function createAntiSpamShieldState() {
  return {
    ...createShieldState(),
    holdElapsedSec: 0,
    reRaiseLockoutSec: 0,
    holdBuffered: false,
    blockedOrParriedThisHold: false,
    parrySucceededDuringHold: false,
    whiffCount: 0,
    whiffDecayTimerSec: 0,
    activeParryScale: 1.0,
  };
}

/**
 * Record whether the currently held shield blocked or achieved a Perfect Parry.
 * Enables Design B instant cooldown reset on Perfect Parry and skips whiff penalty.
 */
export function markShieldBlockOrParry(state, { isParry = false } = {}) {
  if (!state) return createAntiSpamShieldState();
  return {
    ...state,
    blockedOrParriedThisHold: true,
    parrySucceededDuringHold: Boolean(state.parrySucceededDuringHold || isParry),
    whiffCount: isParry ? 0 : state.whiffCount || 0,
    whiffDecayTimerSec: isParry ? 0 : state.whiffDecayTimerSec || 0,
  };
}

/**
 * Advance Shield Defense with Design A (minHold, tiered lockout, hold buffer)
 * and Design B (whiff parry window decay + Perfect Parry instant reset).
 */
export function stepShieldDefenseAntiSpam(
  state = createAntiSpamShieldState(),
  {
    guardHeld = false,
    hasShield = true,
    dt = 1 / 60,
    shieldDef = null,
    spRegenScale = 1.0,
  } = {},
) {
  const cur = state || createAntiSpamShieldState();
  const safeDt = Math.max(0, Number(dt) || 0);
  const spec = resolveShieldAntiSpamSpec(shieldDef);
  const baseParrySec = Number.isFinite(shieldDef?.parryWindowSec) ? shieldDef.parryWindowSec : 0.18;
  const maxDurationSec = Number.isFinite(shieldDef?.maxDurationSec) ? shieldDef.maxDurationSec : 15.0;
  const holdDrainPerSec = Number.isFinite(shieldDef?.holdDrainPerSec) ? shieldDef.holdDrainPerSec : undefined;
  const cooldownSec = Number.isFinite(shieldDef?.cooldownSec) ? shieldDef.cooldownSec : 1.8;

  let reRaiseLockoutSec = Math.max(0, (cur.reRaiseLockoutSec || 0) - safeDt);
  let whiffDecayTimerSec = Math.max(0, (cur.whiffDecayTimerSec || 0) - safeDt);
  let whiffCount = whiffDecayTimerSec <= 0 ? 0 : cur.whiffCount || 0;
  let holdElapsedSec = cur.holdElapsedSec || 0;
  let blockedOrParriedThisHold = Boolean(cur.blockedOrParriedThisHold);
  let parrySucceededDuringHold = Boolean(cur.parrySucceededDuringHold);
  let activeParryScale = Number.isFinite(cur.activeParryScale) ? cur.activeParryScale : 1.0;
  let holdBuffered = false;

  const wasActive = Boolean(cur.barrierActive);
  let effectiveGuardHeld = Boolean(guardHeld && hasShield && !cur.overheated);

  if (wasActive) {
    // Design A: Hold commitment lock until minHoldSec passes
    if (!effectiveGuardHeld && hasShield && !cur.overheated && holdElapsedSec + safeDt < spec.minHoldSec) {
      effectiveGuardHeld = true;
    }
    if (effectiveGuardHeld) {
      holdElapsedSec += safeDt;
    }
  } else {
    // Design A: Block raising while reRaiseLockoutSec > 0, latch Hold Buffer
    if (effectiveGuardHeld && reRaiseLockoutSec > 0) {
      holdBuffered = true;
      effectiveGuardHeld = false;
    } else if (effectiveGuardHeld && reRaiseLockoutSec <= 0) {
      // Raising fresh: compute Design B whiff parry scale
      activeParryScale = WHIFF_PARRY_SCALES[Math.min(2, whiffCount)] ?? 0;
      holdElapsedSec = safeDt;
      blockedOrParriedThisHold = false;
      parrySucceededDuringHold = false;
    }
  }

  const stepped = stepShieldDefense(cur, {
    guardHeld: effectiveGuardHeld,
    hasShield,
    dt: safeDt,
    parryWindowSec: baseParrySec * activeParryScale,
    maxDurationSec,
    holdDrainPerSec,
    cooldownSec,
    maxSp: 100,
    regenRatePerSec: 24 * Math.max(0.2, Number(spRegenScale) || 1.0),
    regenDelayOnReleaseSec: 0.35,
  });

  // Handle transition from raised -> dropped cleanly
  if (wasActive && !stepped.barrierActive) {
    if (parrySucceededDuringHold) {
      // Design B: Perfect Parry clears lockout & whiff stacks immediately
      reRaiseLockoutSec = 0;
      whiffCount = 0;
      whiffDecayTimerSec = 0;
    } else {
      reRaiseLockoutSec = hasShield ? spec.reRaiseDelaySec : 0;
      if (!blockedOrParriedThisHold) {
        whiffCount = Math.min(2, whiffCount + 1);
        whiffDecayTimerSec = 1.0;
      }
    }
    holdElapsedSec = 0;
    blockedOrParriedThisHold = false;
    parrySucceededDuringHold = false;
  }

  return {
    ...stepped,
    holdElapsedSec,
    reRaiseLockoutSec,
    holdBuffered,
    blockedOrParriedThisHold,
    parrySucceededDuringHold,
    whiffCount,
    whiffDecayTimerSec,
    activeParryScale,
  };
}

/**
 * Create a mecha combat resource state (AP / EN / ACS posture & Stagger).
 */
export function createUnitCombatState({ actorDef = null, armorCoreDef = null, armorLiningDef = null } = {}) {
  const baseAp = Number(actorDef?.maxAp) || 10000;
  const apBonus = (armorCoreDef?.statModifiers?.apBonus || 0) + (armorLiningDef?.statModifiers?.apBonus || 0);
  const maxAp = Math.max(1000, baseAp + apBonus);
  const maxEn = Math.max(50, Number(actorDef?.maxEn) || 100);
  const acsCapMult =
    1 + (armorCoreDef?.statModifiers?.acsCapBonus || 0) + (armorLiningDef?.statModifiers?.acsCapBonus || 0);
  const maxAcs = Math.max(50, 100 * acsCapMult);

  return {
    ap: maxAp,
    maxAp,
    en: maxEn,
    maxEn,
    acs: 0,
    maxAcs,
    staggerRemainingSec: 0,
    acsCoolDelaySec: 0,
    enRegenDelaySec: 0,
  };
}

/**
 * Advance AP/EN/ACS resources with map environmental scaling (water cooling vs magma heat vs void drop).
 */
export function stepUnitCombatResources(
  unit,
  {
    dt = 1 / 60,
    boosting = false,
    enSpent = 0,
    grounded = true,
    mapEnvModifiers = null,
    inHazardVoid = false,
    weightTaxScale = 1.0,
    staggerRecoveryRateScale = 1.0,
  } = {},
) {
  if (!unit) return createUnitCombatState();
  const safeDt = Math.max(0, Number(dt) || 0);
  const env = mapEnvModifiers || {};
  const enScale = Math.max(0.2, (Number(env.enRegenScale) || 1.0) * clamp(Number(weightTaxScale) || 1.0, 0.5, 1.2));
  const recovScale = clamp(Number(staggerRecoveryRateScale) || 1.0, 0.5, 2.0);
  const voidDps = Number(env.voidDropPenaltyAp) || 0;

  let ap = unit.ap;
  let en = Math.max(0, unit.en - Math.max(0, enSpent));
  let acs = unit.acs;
  let staggerRemainingSec = Math.max(0, (unit.staggerRemainingSec || 0) - safeDt * recovScale);
  let acsCoolDelaySec = Math.max(0, (unit.acsCoolDelaySec || 0) - safeDt * recovScale);
  let enRegenDelaySec = boosting ? 0.35 : Math.max(0, (unit.enRegenDelaySec || 0) - safeDt);

  if (unit.staggerRemainingSec > 0 && staggerRemainingSec <= 0) {
    acs = 0;
  }

  if (staggerRemainingSec <= 0 && acsCoolDelaySec <= 0 && acs > 0) {
    acs = Math.max(0, acs - 18 * recovScale * safeDt);
  }

  if (!boosting && enRegenDelaySec <= 0) {
    const baseRate = grounded ? 32 : 11;
    en = Math.min(unit.maxEn, en + baseRate * enScale * safeDt);
  }

  if (inHazardVoid && voidDps > 0) {
    ap = Math.max(0, ap - voidDps * safeDt);
  }

  return {
    ...unit,
    ap,
    en,
    acs,
    staggerRemainingSec,
    acsCoolDelaySec,
    enRegenDelaySec,
  };
}

/**
 * Apply incoming weapon damage with armor resistances and ACS 200% direct-hit stagger amplification.
 */
export function applyUnitDamage(
  unit,
  { rawDamage = 0, acsDamage = 0, damageType = 'bullet', armorCoreDef = null, armorLiningDef = null } = {},
) {
  if (!unit) return { unit: createUnitCombatState(), finalDamage: 0, staggeredNow: false, hitstopSec: 0 };

  let resist = 0;
  if (damageType === 'beam' || damageType === 'saber') {
    resist = (armorCoreDef?.statModifiers?.beamResist || 0) + (armorLiningDef?.statModifiers?.beamResist || 0);
  } else if (damageType === 'heavy' || damageType === 'blast') {
    resist = (armorCoreDef?.statModifiers?.blastResist || 0) + (armorLiningDef?.statModifiers?.blastResist || 0);
  }
  const resistMult = clamp(1 - resist, 0.45, 1.35);
  const wasStaggered = (unit.staggerRemainingSec || 0) > 0;
  const staggerMult = wasStaggered ? STAGGER_DAMAGE_MULT : 1.0;

  const finalDamage = Math.round(Math.max(0, rawDamage) * resistMult * staggerMult);
  const ap = Math.max(0, unit.ap - finalDamage);

  let acs = unit.acs;
  let staggerRemainingSec = unit.staggerRemainingSec || 0;
  let staggeredNow = false;
  let hitstopSec = 0;

  if (!wasStaggered && acsDamage > 0) {
    acs = Math.min(unit.maxAcs, acs + acsDamage);
    if (acs >= unit.maxAcs) {
      staggerRemainingSec = STAGGER_DURATION_SEC;
      staggeredNow = true;
      hitstopSec = 0.085;
    }
  }

  return {
    unit: {
      ...unit,
      ap,
      acs,
      staggerRemainingSec,
      acsCoolDelaySec: acsDamage > 0 ? 2.1 : unit.acsCoolDelaySec,
    },
    finalDamage,
    staggeredNow,
    hitstopSec,
  };
}

/**
 * Evaluate map drag frictionScale, radar lockRangeScale, and thermal updraft acceleration.
 */
export function computeMapDragAndUpdraft(pos, vel, mapEnvModifiers = null, updraftZones = []) {
  const env = mapEnvModifiers || {};
  const frictionScale = Number.isFinite(env.frictionScale) ? env.frictionScale : 1.0;
  const lockRangeScale = Number.isFinite(env.lockRangeScale) ? env.lockRangeScale : 1.0;

  let updraftAccelY = 0;
  if (pos && Array.isArray(updraftZones)) {
    for (let i = 0; i < updraftZones.length; i++) {
      const z = updraftZones[i];
      const dist = Math.hypot((pos.x || 0) - (z.x || 0), (pos.z || 0) - (z.z || 0));
      const maxY = Number.isFinite(z.maxY) ? z.maxY : 20;
      if (dist <= (z.radius || 5) && (pos.y || 0) <= maxY) {
        updraftAccelY = Math.max(updraftAccelY, Number(z.accelY) || 18);
      }
    }
  }
  return {
    frictionScale,
    lockRangeScale,
    updraftAccelY,
    windPushScale: vel ? frictionScale : 1.0,
  };
}

/**
 * Create a saber swing / active blade-parry timing tracker.
 */
export function createMeleeTimingState() {
  return {
    active: false,
    swingElapsedSec: 0,
    swingDurationSec: 0.34,
    bladeParryLockoutSec: 0,
    slashDir: 'LR',
  };
}

/**
 * Step melee swing timer and enforce blade parry spam lockout.
 */
export function stepMeleeTimingState(
  state = createMeleeTimingState(),
  { dt = 1 / 60, startSlash = false, hasSaber = true, slashDir = 'LR', swingDurationSec = 0.34 } = {},
) {
  const cur = state || createMeleeTimingState();
  const safeDt = Math.max(0, Number(dt) || 0);
  let active = Boolean(cur.active);
  let swingElapsedSec = cur.swingElapsedSec || 0;
  let bladeParryLockoutSec = Math.max(0, (cur.bladeParryLockoutSec || 0) - safeDt);
  let dir = cur.slashDir || 'LR';
  const dur = Math.max(0.15, Number(swingDurationSec) || cur.swingDurationSec || 0.34);

  if (startSlash && hasSaber) {
    if (active && swingElapsedSec < dur * 0.6) {
      // Rapid re-swing triggers brief active blade parry anti-spam lockout
      bladeParryLockoutSec = ACTIVE_BLADE_PARRY_COOLDOWN_SEC;
    }
    active = true;
    swingElapsedSec = safeDt;
    dir = slashDir;
  } else if (active) {
    swingElapsedSec += safeDt;
    if (swingElapsedSec >= dur) {
      active = false;
      swingElapsedSec = 0;
    }
  }

  return {
    active,
    swingElapsedSec,
    swingDurationSec: dur,
    bladeParryLockoutSec,
    slashDir: dir,
  };
}

/**
 * Deterministic bidirectional melee encounter arbitration:
 * Priority: Range check -> Saber Clash (<=0.14s) -> Shield Parry/Block -> Active Blade Parry (<=0.15s) -> Clean Hit.
 */
export function resolveMeleeEncounter({
  attackerSwing,
  attackerHasSaber = true,
  defenderSwing,
  defenderHasSaber = false,
  defenderShield = null,
  defenderShieldDef = null,
  baseMeleeDmg = 95,
  saberVsShieldSpDrain = 33,
  distanceM = 2.0,
  reachM = 3.2,
  frontDot = 1.0,
} = {}) {
  const miss = {
    outcome: 'miss',
    damageToAttacker: 0,
    damageToDefender: 0,
    spDrain: 0,
    spRefund: 0,
    guardBreak: false,
    acsToAttacker: 0,
    acsToDefender: 0,
    hitstopSec: 0,
    attackerKnockback: 0,
    defenderKnockback: 0,
    attackerRecoilAnim: false,
    defenderRecoilAnim: false,
  };
  if (!attackerHasSaber || !attackerSwing?.active || distanceM > reachM) {
    return miss;
  }

  // 1. Bilateral Saber Clash (|swingA - swingB| <= 0.14s)
  if (
    defenderHasSaber &&
    defenderSwing?.active &&
    Math.abs((attackerSwing.swingElapsedSec || 0) - (defenderSwing.swingElapsedSec || 0)) <= SABER_CLASH_WINDOW_SEC
  ) {
    return {
      ...miss,
      outcome: 'saber_clash',
      acsToAttacker: 18,
      acsToDefender: 18,
      hitstopSec: SABER_CLASH_HITSTOP_SEC,
      attackerKnockback: 6.2,
      defenderKnockback: 6.2,
      attackerRecoilAnim: true,
      defenderRecoilAnim: true,
    };
  }

  // 2. Saber vs Defender Active Shield
  const fullDome = Boolean(defenderShieldDef?.isFullDome);
  if (defenderShield?.barrierActive && (fullDome || frontDot >= 0.25)) {
    if ((defenderShield.parryWindowSec || 0) > 0) {
      const spRefund = Number(defenderShieldDef?.parrySpRefund) || 12;
      return {
        ...miss,
        outcome: 'shield_parry',
        spRefund,
        acsToAttacker: 35,
        hitstopSec: 0.075,
        attackerKnockback: Number(defenderShieldDef?.parryKnockbackM) || 4.0,
        attackerRecoilAnim: true,
        defenderRecoilAnim: false,
      };
    }

    const drain = clamp(Number(saberVsShieldSpDrain) || 33, 28, 38);
    const guardBreak = (defenderShield.shieldSp || 0) - drain <= 0;
    return {
      ...miss,
      outcome: 'saber_vs_shield',
      damageToDefender: Math.round(baseMeleeDmg * 0.12),
      spDrain: drain,
      guardBreak,
      acsToDefender: guardBreak ? 55 : 16,
      hitstopSec: guardBreak ? 0.085 : 0.045,
      defenderKnockback: guardBreak ? 4.8 : 1.6,
    };
  }

  // 3. Unshielded Active Blade Parry (defender saber initiated within 0.15s)
  if (
    defenderHasSaber &&
    defenderSwing?.active &&
    (defenderSwing.bladeParryLockoutSec || 0) <= 0 &&
    (defenderSwing.swingElapsedSec || 0) <= ACTIVE_BLADE_PARRY_WINDOW_SEC &&
    (attackerSwing.swingElapsedSec || 0) > (defenderSwing.swingElapsedSec || 0)
  ) {
    return {
      ...miss,
      outcome: 'active_blade_parry',
      acsToAttacker: 42,
      hitstopSec: 0.085,
      attackerKnockback: 7.4,
      attackerRecoilAnim: true,
      defenderRecoilAnim: false,
    };
  }

  // 4. Clean Melee Hit
  return {
    ...miss,
    outcome: 'melee_hit',
    damageToDefender: baseMeleeDmg,
    acsToDefender: 28,
    hitstopSec: 0.055,
    defenderKnockback: 3.2,
  };
}

/**
 * Dual-track gun resource state machine (Task 6.5):
 * - Kinetic firearms (`resourceType: 'mag'`): discrete magazine rounds + reload lockout.
 * - Beam weapons (`resourceType: 'heat'`): cumulative thermal gauge + overheat vent lock.
 */
export function createWeaponResourceState(weaponDef = null) {
  const resType = weaponDef?.resourceType === 'mag' ? 'mag' : weaponDef?.resourceType === 'heat' ? 'heat' : 'heat';
  const maxAmmo = Math.max(1, Number(weaponDef?.magCapacity) || 32);
  const reloadDurationSec = Math.max(0.3, Number(weaponDef?.reloadSec) || 1.3);
  const overheatLockSec = Math.max(0.4, Number(weaponDef?.overheatLockSec) || 1.8);
  return {
    weaponId: weaponDef?.id || 'EF-AR01',
    resourceType: resType,
    ammo: maxAmmo,
    maxAmmo,
    reloading: false,
    reloadTimerSec: 0,
    reloadDurationSec,
    heat: 0,
    maxHeat: 100,
    overheated: false,
    overheatTimerSec: 0,
    overheatLockSec,
    coolDelaySec: 0,
  };
}

export function triggerWeaponReload(state, weaponDef = null) {
  const cur = state || createWeaponResourceState(weaponDef);
  if (cur.resourceType !== 'mag') return cur;
  if (cur.reloading || cur.ammo >= cur.maxAmmo) return cur;
  return {
    ...cur,
    reloading: true,
    reloadTimerSec: cur.reloadDurationSec || Number(weaponDef?.reloadSec) || 1.3,
  };
}

export function stepWeaponResource(state, dt = 1 / 60, weaponDef = null) {
  const cur = state || createWeaponResourceState(weaponDef);
  const safeDt = Math.max(0, Number(dt) || 0);
  if (cur.resourceType === 'mag') {
    if (!cur.reloading) return cur;
    const nextTimer = Math.max(0, (cur.reloadTimerSec || 0) - safeDt);
    if (nextTimer <= 0) {
      return {
        ...cur,
        ammo: cur.maxAmmo,
        reloading: false,
        reloadTimerSec: 0,
      };
    }
    return {
      ...cur,
      reloadTimerSec: nextTimer,
    };
  }

  // Heat-based beam cooling
  const coolPerSec = Math.max(8, Number(weaponDef?.coolPerSec) || 40);
  if (cur.overheated) {
    const nextLock = Math.max(0, (cur.overheatTimerSec || 0) - safeDt);
    const totalLock = Math.max(0.4, cur.overheatLockSec || 1.8);
    const ratioLeft = nextLock / totalLock;
    return {
      ...cur,
      overheatTimerSec: nextLock,
      overheated: nextLock > 0,
      heat: nextLock > 0 ? Math.round(ratioLeft * 100) : 0,
      coolDelaySec: 0,
    };
  }
  const nextDelay = Math.max(0, (cur.coolDelaySec || 0) - safeDt);
  const nextHeat = nextDelay > 0 ? cur.heat : Math.max(0, (cur.heat || 0) - coolPerSec * safeDt);
  return {
    ...cur,
    coolDelaySec: nextDelay,
    heat: nextHeat,
  };
}

export function tryConsumeWeaponShot(state, weaponDef = null) {
  const cur = state || createWeaponResourceState(weaponDef);
  if (cur.resourceType === 'mag') {
    if (cur.reloading || cur.ammo <= 0) {
      return {
        allowed: false,
        event: cur.reloading ? 'reloading' : 'empty_reload',
        state: cur.reloading ? cur : triggerWeaponReload(cur, weaponDef),
      };
    }
    const nextAmmo = Math.max(0, cur.ammo - 1);
    const autoReload = nextAmmo === 0;
    return {
      allowed: true,
      event: autoReload ? 'auto_reload' : 'fired',
      state: {
        ...cur,
        ammo: nextAmmo,
        reloading: autoReload,
        reloadTimerSec: autoReload ? (cur.reloadDurationSec || 1.3) : 0,
      },
    };
  }

  // Heat-based beam firing
  if (cur.overheated) {
    return { allowed: false, event: 'overheated', state: cur };
  }
  const heatPerShot = Math.max(2, Number(weaponDef?.heatPerShot) || 11);
  const nextHeat = (cur.heat || 0) + heatPerShot;
  const hitOverheat = nextHeat >= 100;
  return {
    allowed: true,
    event: hitOverheat ? 'overheat_triggered' : 'fired',
    state: {
      ...cur,
      heat: Math.min(100, nextHeat),
      overheated: hitOverheat,
      overheatTimerSec: hitOverheat ? (cur.overheatLockSec || Number(weaponDef?.overheatLockSec) || 1.8) : 0,
      coolDelaySec: 0.24,
    },
  };
}

export function isWeaponResourceUnavailable(state) {
  if (!state) return false;
  return state.resourceType === 'mag' ? Boolean(state.reloading || state.ammo <= 0) : Boolean(state.overheated);
}

export const SUB_PART_IDS = Object.freeze(['head', 'torso', 'arm_l', 'arm_r', 'backpack', 'legs']);

export const SUB_PART_CONFIG = Object.freeze({
  head: Object.freeze({ label: 'HEAD', ratioOfMaxAp: 0.14, minHp: 320, apTransferMult: 1.30, saberPartMult: 1.85, severable: false }),
  torso: Object.freeze({ label: 'TORSO', ratioOfMaxAp: 0.44, minHp: 900, apTransferMult: 1.10, saberPartMult: 1.40, severable: false }),
  arm_l: Object.freeze({ label: 'ARM-L', ratioOfMaxAp: 0.15, minHp: 360, apTransferMult: 0.85, saberPartMult: 2.35, severable: true }),
  arm_r: Object.freeze({ label: 'ARM-R', ratioOfMaxAp: 0.15, minHp: 360, apTransferMult: 0.85, saberPartMult: 2.35, severable: true }),
  backpack: Object.freeze({ label: 'BACK', ratioOfMaxAp: 0.16, minHp: 380, apTransferMult: 0.95, saberPartMult: 1.90, severable: false }),
  legs: Object.freeze({ label: 'LEGS', ratioOfMaxAp: 0.24, minHp: 540, apTransferMult: 0.85, saberPartMult: 1.75, severable: false }),
});

/**
 * Create 6-subpart structural durability state (Task 7.4).
 */
export function createPartDamageState({ maxAp = 10000, armorCoreDef = null, armorLiningDef = null } = {}) {
  const safeMaxAp = Math.max(800, Number(maxAp) || 10000);
  const armorBonusMult =
    1 + ((armorCoreDef?.statModifiers?.apBonus || 0) + (armorLiningDef?.statModifiers?.apBonus || 0)) / Math.max(4000, safeMaxAp);
  const state = {};
  for (const id of SUB_PART_IDS) {
    const cfg = SUB_PART_CONFIG[id];
    const maxHp = Math.max(cfg.minHp, Math.round(safeMaxAp * cfg.ratioOfMaxAp * clamp(armorBonusMult, 0.8, 1.35)));
    state[id] = {
      hp: maxHp,
      maxHp,
      status: 'intact',
      damaged: false,
      broken: false,
      severed: false,
    };
  }
  return state;
}

/**
 * Apply sub-part damage from ranged projectiles or high-sever beam saber slashes.
 */
export function applyPartDamage(
  partState,
  partId = 'torso',
  { rawDamage = 0, damageType = 'bullet', isMelee = false } = {},
) {
  const base = partState || createPartDamageState();
  const resolvedId = SUB_PART_CONFIG[partId] ? partId : 'torso';
  const cfg = SUB_PART_CONFIG[resolvedId];
  const prev = base[resolvedId] || { hp: cfg.minHp, maxHp: cfg.minHp, status: 'intact', damaged: false, broken: false, severed: false };
  const isSeverCapable = Boolean(isMelee || damageType === 'saber' || damageType === 'melee');
  const safeRaw = Math.max(0, Number(rawDamage) || 0);

  if (prev.severed) {
    return {
      partState: base,
      partId: resolvedId,
      partDamageDealt: 0,
      apDamageMult: 0.72,
      bonusAcs: 0,
      newlyDamaged: false,
      brokenNow: false,
      severedArm: null,
    };
  }

  const partMult = isSeverCapable ? cfg.saberPartMult : 1.0;
  const partDamageDealt = Math.round(safeRaw * partMult);
  const nextHp = Math.max(0, prev.hp - partDamageDealt);
  const brokenNow = !prev.broken && nextHp <= 0;
  const severedNow = Boolean(cfg.severable && isSeverCapable && nextHp <= 0 && !prev.severed);
  const nextBroken = Boolean(prev.broken || brokenNow || severedNow);
  const nextDamaged = Boolean(prev.damaged || nextBroken || nextHp < prev.maxHp * 0.55);
  const newlyDamaged = !prev.damaged && nextDamaged;

  const status = severedNow
    ? 'severed'
    : nextBroken
      ? 'broken'
      : nextDamaged
        ? 'damaged'
        : 'intact';

  const bonusAcs = severedNow ? 32 : brokenNow ? 18 : 0;
  const severedArm = severedNow ? (resolvedId === 'arm_l' ? 'L' : 'R') : null;

  return {
    partState: {
      ...base,
      [resolvedId]: {
        ...prev,
        hp: nextHp,
        status,
        damaged: nextDamaged,
        broken: nextBroken,
        severed: Boolean(prev.severed || severedNow),
      },
    },
    partId: resolvedId,
    partDamageDealt,
    apDamageMult: prev.broken ? 0.78 : cfg.apTransferMult,
    bonusAcs,
    newlyDamaged,
    brokenNow: brokenNow || severedNow,
    severedArm,
  };
}

/**
 * Compute tactical mobility, EN, sensor & weapon-hand penalties from damaged/severed parts.
 */
export function computePartStatusPenalties(partState) {
  const p = partState || createPartDamageState();
  const armL = p.arm_l || {};
  const armR = p.arm_r || {};
  const legs = p.legs || {};
  const back = p.backpack || {};
  const head = p.head || {};
  const torso = p.torso || {};

  const armLSevered = Boolean(armL.severed);
  const armRSevered = Boolean(armR.severed);
  const armLDisabled = Boolean(armL.broken || armLSevered);
  const armRDisabled = Boolean(armR.broken || armRSevered);

  const legsBroken = Boolean(legs.broken);
  const legsDamaged = Boolean(legs.damaged && !legsBroken);
  const moveSpeedScale = legsBroken ? 0.62 : legsDamaged ? 0.84 : 1.0;

  const backBroken = Boolean(back.broken);
  const backDamaged = Boolean(back.damaged && !backBroken);
  const boostScale = backBroken ? 0.65 : backDamaged ? 0.86 : 1.0;
  const enRegenScale = backBroken ? 0.68 : backDamaged ? 0.88 : 1.0;

  const headBroken = Boolean(head.broken);
  const headDamaged = Boolean(head.damaged || headBroken);
  const lockGlitch = headBroken;

  const smokingParts = [];
  for (const id of SUB_PART_IDS) {
    const st = p[id];
    if (st && (st.damaged || st.broken) && !st.severed) {
      smokingParts.push(id);
    }
  }

  return {
    armLSevered,
    armRSevered,
    armLDisabled,
    armRDisabled,
    moveSpeedScale,
    boostScale,
    enRegenScale,
    lockGlitch,
    headDamaged,
    torsoDamaged: Boolean(torso.damaged || torso.broken),
    backpackDamaged: Boolean(back.damaged || backBroken),
    legsDamaged: Boolean(legs.damaged || legsBroken),
    smokingParts,
    disabledCount: (armLDisabled ? 1 : 0) + (armRDisabled ? 1 : 0) + (legsBroken ? 1 : 0) + (backBroken ? 1 : 0) + (headBroken ? 1 : 0),
  };
}
