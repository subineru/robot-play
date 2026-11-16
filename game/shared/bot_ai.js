/**
 * PLAY_ROBOTS Pure Tactical Bot AI Brain (Domain Layer — Zero DOM / Zero THREE).
 * Shared identically by Browser 1v1 Ace AI Duel and future Node Authoritative Backfill AI.
 */
import { ARENA_RADIUS } from './constants.js';
import { clamp } from './kinematics.js';
import { querySegmentCandidates, intersectSegmentAabb } from './spatial_grid.js';

export const AI_TACTICAL_STATES = Object.freeze({
  APPROACH: 'APPROACH',
  STRAFE_FIRE: 'STRAFE_FIRE',
  GUARD_PARRY: 'GUARD_PARRY',
  MELEE_LUNGE: 'MELEE_LUNGE',
  EVADE_BOOST: 'EVADE_BOOST',
  SEEK_COVER: 'SEEK_COVER',
  STAGGERED: 'STAGGERED',
});

function extractObstacleRecord(raw) {
  if (!raw) return null;
  if (raw.kind && raw.kind !== 'building') return null;
  const p = raw.payload || raw;
  const state = p.state ?? raw.state;
  const hp = p.hp !== undefined ? p.hp : raw.hp;
  const maxHp = p.maxHp !== undefined ? p.maxHp : raw.maxHp;

  const minX = raw.minX !== undefined ? raw.minX : (p.x || 0) - (p.halfW || 0);
  const maxX = raw.maxX !== undefined ? raw.maxX : (p.x || 0) + (p.halfW || 0);
  const minY = raw.minY !== undefined ? raw.minY : 0;
  const maxY = raw.maxY !== undefined ? raw.maxY : (p.height || 0);
  const minZ = raw.minZ !== undefined ? raw.minZ : (p.z || 0) - (p.halfD || 0);
  const maxZ = raw.maxZ !== undefined ? raw.maxZ : (p.z || 0) + (p.halfD || 0);

  return {
    id: raw.id ?? p.id,
    state,
    hp,
    maxHp,
    minX,
    maxX,
    minY,
    maxY,
    minZ,
    maxZ,
    cx: (minX + maxX) * 0.5,
    cz: (minZ + maxZ) * 0.5,
    halfW: Math.max(0, (maxX - minX) * 0.5),
    halfD: Math.max(0, (maxZ - minZ) * 0.5),
    height: maxY - minY,
  };
}

/**
 * True only while obstacle exists, stands >= 3.5m tall, has positive HP, and is neither collapsing nor destroyed.
 */
export function isCoverObstacleIntact(raw) {
  const obs = extractObstacleRecord(raw);
  if (!obs || !obs.id) return false;
  if (obs.state === 'destroyed' || obs.state === 'collapsing') return false;
  if (obs.hp !== undefined && obs.hp <= 0) return false;
  if (obs.height < 3.5 || Math.min(obs.halfW, obs.halfD) < 0.7) return false;
  return true;
}

function collectIntactObstacles({ spatialGrid, obstacles, fromPos, toPos, paddingM = 2 } = {}) {
  const out = [];
  if (spatialGrid && fromPos && toPos) {
    const candidates = querySegmentCandidates(spatialGrid, fromPos, toPos, paddingM);
    for (let i = 0; i < candidates.length; i++) {
      if (isCoverObstacleIntact(candidates[i])) out.push(extractObstacleRecord(candidates[i]));
    }
    return out;
  }
  if (spatialGrid && spatialGrid.itemsById) {
    for (const item of spatialGrid.itemsById.values()) {
      if (isCoverObstacleIntact(item)) out.push(extractObstacleRecord(item));
    }
    return out;
  }
  if (Array.isArray(obstacles)) {
    for (let i = 0; i < obstacles.length; i++) {
      if (isCoverObstacleIntact(obstacles[i])) out.push(extractObstacleRecord(obstacles[i]));
    }
  }
  return out;
}

function findIntactObstacleById(id, { spatialGrid, obstacles } = {}) {
  if (!id) return null;
  if (spatialGrid?.itemsById) {
    const item = spatialGrid.itemsById.get(id);
    return isCoverObstacleIntact(item) ? extractObstacleRecord(item) : null;
  }
  if (Array.isArray(obstacles)) {
    for (let i = 0; i < obstacles.length; i++) {
      const o = obstacles[i];
      if ((o?.id || o?.payload?.id) === id) {
        return isCoverObstacleIntact(o) ? extractObstacleRecord(o) : null;
      }
    }
  }
  return null;
}

/**
 * Check whether an intact standing obstacle interrupts direct line-of-sight between two 3D points.
 */
export function checkLineOfSightBlocked(posA, posB, { spatialGrid = null, obstacles = null } = {}) {
  if (!posA || !posB) return { blocked: false, blockingObstacle: null };
  const p0 = { x: posA.x || 0, y: (posA.y || 0) + 1.55, z: posA.z || 0 };
  const p1 = { x: posB.x || 0, y: (posB.y || 0) + 1.4, z: posB.z || 0 };
  const candidates = collectIntactObstacles({ spatialGrid, obstacles, fromPos: p0, toPos: p1, paddingM: 0.4 });
  let closestT = Infinity;
  let blocker = null;
  for (let i = 0; i < candidates.length; i++) {
    const obs = candidates[i];
    const hit = intersectSegmentAabb(p0, p1, obs, 0.15);
    if (hit.hit && hit.t < closestT) {
      closestT = hit.t;
      blocker = obs;
    }
  }
  return { blocked: Boolean(blocker), blockingObstacle: blocker };
}

function computeShadowAnchorForObstacle(obs, targetPos, safeArenaR = ARENA_RADIUS - 3.0) {
  const vx = obs.cx - (targetPos.x || 0);
  const vz = obs.cz - (targetPos.z || 0);
  const vLen = Math.hypot(vx, vz);
  if (vLen < 1.0) return null;
  const ux = vx / vLen;
  const uz = vz / vLen;
  const projHalf = Math.abs(ux) * obs.halfW + Math.abs(uz) * obs.halfD;
  const anchorX = obs.cx + ux * (projHalf + 1.45);
  const anchorZ = obs.cz + uz * (projHalf + 1.45);
  if (Math.hypot(anchorX, anchorZ) > safeArenaR) return null;
  if (Math.hypot(anchorX - (targetPos.x || 0), anchorZ - (targetPos.z || 0)) < 7.0) return null;
  return { x: anchorX, z: anchorZ };
}

/**
 * Select nearest intact cover obstacle whose far-side shadow reliably breaks LOS from target.
 */
export function findBestCoverCandidate(
  selfPos,
  targetPos,
  { spatialGrid = null, obstacles = null, arenaRadius = ARENA_RADIUS } = {},
) {
  const pool = collectIntactObstacles({ spatialGrid, obstacles });
  if (pool.length === 0) return null;
  const sx = selfPos?.x || 0;
  const sz = selfPos?.z || 0;
  const safeR = Math.max(12, arenaRadius - 3.0);

  let best = null;
  let bestScore = -Infinity;
  for (let i = 0; i < pool.length; i++) {
    const obs = pool[i];
    const distFromSelf = Math.hypot(obs.cx - sx, obs.cz - sz);
    if (distFromSelf > 34) continue;
    const anchor = computeShadowAnchorForObstacle(obs, targetPos, safeR);
    if (!anchor) continue;
    const losAtAnchor = checkLineOfSightBlocked(
      { x: anchor.x, y: selfPos?.y || 0, z: anchor.z },
      targetPos,
      { obstacles: [obs] },
    );
    if (!losAtAnchor.blocked) continue;
    const hpRatio = obs.maxHp > 0 && obs.hp !== undefined ? clamp(obs.hp / obs.maxHp, 0.05, 1) : 1;
    const travel = Math.hypot(anchor.x - sx, anchor.z - sz);
    const widthBonus = Math.min(4, Math.min(obs.halfW, obs.halfD));
    const score = 40 - travel + hpRatio * 8 + widthBonus * 2;
    if (score > bestScore) {
      bestScore = score;
      best = { obstacle: obs, anchor };
    }
  }
  return best;
}

export function createBotAiState({
  difficulty = 'ace',
  reactionSec = 0.14,
  strafeSign = 1,
} = {}) {
  return {
    difficulty,
    mode: AI_TACTICAL_STATES.APPROACH,
    reactionSec: Math.max(0.05, Number(reactionSec) || 0.14),
    threatTimerSec: 0,
    strafeSign: strafeSign >= 0 ? 1 : -1,
    strafeSwitchTimerSec: 2.1,
    fireCooldownSec: 0,
    burstRemaining: 2,
    meleeCooldownSec: 0,
    guardHoldTimerSec: 0,
    evadeTimerSec: 0,
    coverTargetId: null,
    coverAnchor: null,
    coverHoldTimerSec: 0,
  };
}

/**
 * Compute deterministic per-tick AI control intent from unit & target physical state.
 */
export function stepBotAiDecision(
  botState = createBotAiState(),
  {
    dt = 1 / 30,
    selfPhysics = { x: 0, y: 0, z: 26, vx: 0, vy: 0, vz: 0, en: 100, maxEn: 100, grounded: true },
    selfUnit = { ap: 10000, maxAp: 10000, en: 100, maxEn: 100, acs: 0, maxAcs: 100, staggerRemainingSec: 0 },
    selfShield = { barrierActive: false, overheated: false, shieldSp: 100, reRaiseLockoutSec: 0 },
    selfMelee = { active: false, bladeParryLockoutSec: 0 },
    targetPhysics = { x: 0, y: 0, z: -26, vx: 0, vy: 0, vz: 0, en: 100, maxEn: 100, grounded: true },
    targetUnit = { acs: 0, maxAcs: 100, staggerRemainingSec: 0 },
    targetAttacking = false,
    targetMeleeActive = false,
    targetProjectileIncoming = false,
    targetReloadingOrCooling = false,
    spatialGrid = null,
    obstacles = null,
    arenaRadius = ARENA_RADIUS,
    rng = Math.random,
  } = {},
) {
  const cur = botState || createBotAiState();
  const safeDt = Math.max(0, Number(dt) || 0);
  const rand = typeof rng === 'function' ? rng : Math.random;

  const dx = (targetPhysics.x || 0) - (selfPhysics.x || 0);
  const dy = ((targetPhysics.y || 0) + 1.35) - ((selfPhysics.y || 0) + 1.35);
  const dz = (targetPhysics.z || 0) - (selfPhysics.z || 0);
  const horzDist = Math.max(0.001, Math.hypot(dx, dz));
  const dirX = dx / horzDist;
  const dirZ = dz / horzDist;
  const suppressionSec = targetProjectileIncoming ? (cur.suppressionSec || 0) + safeDt : Math.max(0, (cur.suppressionSec || 0) - safeDt * 1.4);
  let strafeSign = cur.strafeSign;
  let strafeSwitchTimerSec = cur.strafeSwitchTimerSec - safeDt;
  // When sustained continuous rifle suppression hits (>0.48s), jink zig-zag faster!
  if (strafeSwitchTimerSec <= 0 || (suppressionSec >= 0.48 && strafeSwitchTimerSec > 0.45 && rand() < 0.25)) {
    strafeSign = -strafeSign;
    strafeSwitchTimerSec = suppressionSec >= 0.48 ? 0.55 + rand() * 0.45 : 1.6 + rand() * 1.4;
  }
  // Lateral unit vector perpendicular to target line
  const latX = -dirZ * strafeSign;
  const latZ = dirX * strafeSign;

  // Model faces -Z when yaw=0 -> yaw toward (dx, dz) is atan2(-dx, -dz)
  const lookYaw = Math.atan2(-dx, -dz);
  const lookPitch = clamp(Math.atan2(dy, horzDist), -0.68, 0.72);

  let mode = cur.mode;
  const threatTimerSec = targetProjectileIncoming || targetAttacking ? cur.threatTimerSec + safeDt : 0;

  let fireCooldownSec = Math.max(0, cur.fireCooldownSec - safeDt);
  let burstRemaining = cur.burstRemaining ?? 2;
  let meleeCooldownSec = Math.max(0, cur.meleeCooldownSec - safeDt);
  let guardHoldTimerSec = Math.max(0, cur.guardHoldTimerSec - safeDt);
  let evadeTimerSec = Math.max(0, cur.evadeTimerSec - safeDt);
  let coverHoldTimerSec = Math.max(0, (cur.coverHoldTimerSec || 0) - safeDt);
  let coverTargetId = cur.coverTargetId || null;
  let coverAnchor = cur.coverAnchor || null;
  let coverLost = false;

  const enPct = (selfPhysics.en || 0) / Math.max(1, selfPhysics.maxEn || 100);
  const acsPct = (selfUnit.acs || 0) / Math.max(1, selfUnit.maxAcs || 100);
  const targetStaggered = (targetUnit?.staggerRemainingSec || 0) > 0;
  const selfStaggered = (selfUnit?.staggerRemainingSec || 0) > 0;

  if (selfStaggered) {
    return {
      nextState: {
        ...cur,
        mode: AI_TACTICAL_STATES.STAGGERED,
        threatTimerSec: 0,
        strafeSwitchTimerSec,
        strafeSign,
        fireCooldownSec,
        burstRemaining,
        meleeCooldownSec,
        guardHoldTimerSec: 0,
        evadeTimerSec: 0,
        coverTargetId: null,
        coverAnchor: null,
        coverHoldTimerSec: 0,
      },
      intent: {
        moveX: 0,
        moveZ: 0,
        lookYaw,
        lookPitch,
        quickBoost: false,
        jumpHeld: false,
        guardHeld: false,
        firePistol: false,
        slashSaber: false,
        hasClearShot: false,
        coverTargetId: null,
        coverLost: false,
        mode: AI_TACTICAL_STATES.STAGGERED,
      },
    };
  }

  // Validate active cover every tick — collapsed/destroyed buildings invalidate cover immediately!
  if (coverTargetId) {
    const intactCover = findIntactObstacleById(coverTargetId, { spatialGrid, obstacles });
    if (!intactCover) {
      coverTargetId = null;
      coverAnchor = null;
      coverHoldTimerSec = 0;
      coverLost = true;
      if (targetProjectileIncoming || targetAttacking || acsPct >= 0.45) {
        evadeTimerSec = Math.max(evadeTimerSec, 0.42);
      }
    } else {
      const updatedAnchor = computeShadowAnchorForObstacle(
        intactCover,
        targetPhysics,
        Math.max(12, arenaRadius - 3.0),
      );
      if (!updatedAnchor) {
        coverTargetId = null;
        coverAnchor = null;
        coverHoldTimerSec = 0;
      } else {
        coverAnchor = updatedAnchor;
      }
    }
  }

  const los = checkLineOfSightBlocked(selfPhysics, targetPhysics, { spatialGrid, obstacles });
  const hasClearShot = !los.blocked;
  const needsCoverRegen =
    Boolean(selfShield?.overheated) || (selfShield?.shieldSp ?? 100) < 30 || acsPct >= 0.55;

  // Trigger new cover search if defensively strained, exposed, and not rushing a staggered player
  if (!coverTargetId && needsCoverRegen && hasClearShot && !targetStaggered && horzDist > 7.5 && (spatialGrid || obstacles)) {
    const candidate = findBestCoverCandidate(selfPhysics, targetPhysics, {
      spatialGrid,
      obstacles,
      arenaRadius,
    });
    if (candidate) {
      coverTargetId = candidate.obstacle.id;
      coverAnchor = candidate.anchor;
      coverHoldTimerSec = 1.6;
    }
  } else if (coverTargetId && (!needsCoverRegen || targetStaggered || horzDist <= 6.2)) {
    coverTargetId = null;
    coverAnchor = null;
    coverHoldTimerSec = 0;
  }

  let moveX = 0;
  let moveZ = 0;
  let quickBoost = false;
  let jumpHeld = false;
  let guardHeld = false;
  let firePistol = false;
  let slashSaber = false;

  const canGuard =
    !selfShield?.overheated &&
    (selfShield?.shieldSp ?? 100) > 15 &&
    ((selfShield?.reRaiseLockoutSec || 0) <= 0 || selfShield?.barrierActive);

  // 1. High ACS Strain, Collapsed-Cover, or Sustained Gun Suppression Zig-Zag Evade
  if (
    (acsPct >= 0.72 && (targetAttacking || targetProjectileIncoming)) ||
    (suppressionSec >= 0.65 && targetProjectileIncoming && enPct > 0.30 && !targetReloadingOrCooling) ||
    evadeTimerSec > 0
  ) {
    mode = AI_TACTICAL_STATES.EVADE_BOOST;
    if (evadeTimerSec <= 0) evadeTimerSec = 0.55;
    moveX = latX * 0.92 - dirX * 0.35;
    moveZ = latZ * 0.92 - dirZ * 0.35;
    quickBoost = enPct > 0.18;
    jumpHeld = enPct > 0.45 && horzDist < 12;
  } else if (horzDist <= 3.9 && !selfMelee?.active && meleeCooldownSec <= 0 && (targetMeleeActive || horzDist <= 3.5)) {
    // 2. Close Saber Clash / Slash
    mode = AI_TACTICAL_STATES.MELEE_LUNGE;
    moveX = dirX;
    moveZ = dirZ;
    slashSaber = true;
    meleeCooldownSec = 0.72;
    coverTargetId = null;
    coverAnchor = null;
  } else if (
    canGuard &&
    hasClearShot &&
    (guardHoldTimerSec > 0 || (targetProjectileIncoming && threatTimerSec >= cur.reactionSec))
  ) {
    // 3. Timed Shield Guard / Parry against unobstructed incoming projectiles
    mode = AI_TACTICAL_STATES.GUARD_PARRY;
    guardHeld = true;
    if (guardHoldTimerSec <= 0) guardHoldTimerSec = 0.34;
    moveX = latX * 0.45;
    moveZ = latZ * 0.45;
  } else if (coverTargetId && coverAnchor && (needsCoverRegen || coverHoldTimerSec > 0)) {
    // 4. Seek & Shelter Behind Intact Destructible Building Shadow
    mode = AI_TACTICAL_STATES.SEEK_COVER;
    const toCovX = coverAnchor.x - (selfPhysics.x || 0);
    const toCovZ = coverAnchor.z - (selfPhysics.z || 0);
    const distToCover = Math.hypot(toCovX, toCovZ);
    if (distToCover > 1.2) {
      moveX = toCovX / distToCover;
      moveZ = toCovZ / distToCover;
      quickBoost = enPct > 0.25 && distToCover > 3.2 && hasClearShot;
    } else {
      // Gently orbit shadow center to stay hidden without hugging the wall rigidly
      moveX = latX * 0.18;
      moveZ = latZ * 0.18;
    }
    if (hasClearShot && canGuard && targetProjectileIncoming) {
      guardHeld = true;
    }
  } else if (horzDist <= 10.5 || ((targetStaggered || targetReloadingOrCooling) && horzDist <= 28)) {
    // 5. Aggressive Melee Lunge / Punish Push on Staggered, Reloading, or Overheated Target
    mode = AI_TACTICAL_STATES.MELEE_LUNGE;
    moveX = dirX * 0.92 + latX * 0.35;
    moveZ = dirZ * 0.92 + latZ * 0.35;
    quickBoost = enPct > 0.25 && horzDist > 3.6;
    if (horzDist <= 3.6 && meleeCooldownSec <= 0 && !selfMelee?.active) {
      slashSaber = true;
      meleeCooldownSec = 0.72;
    } else if (horzDist > 4.2 && fireCooldownSec <= 0 && hasClearShot) {
      firePistol = true;
    }
  } else if (horzDist <= 26) {
    // 6. Mid-Range Tactical Skate Strafe + Peek around intact cover
    mode = AI_TACTICAL_STATES.STRAFE_FIRE;
    let peekSign = 1;
    if (!hasClearShot && los.blockingObstacle) {
      // Pick whichever lateral flank clears the blocking building edge faster
      const obs = los.blockingObstacle;
      const toObsX = obs.cx - (selfPhysics.x || 0);
      const toObsZ = obs.cz - (selfPhysics.z || 0);
      const latDotObs = latX * toObsX + latZ * toObsZ;
      if (latDotObs > 0) peekSign = -1;
    }
    const radialBias = horzDist > 18 ? 0.32 : horzDist < 12 ? -0.25 : 0.08;
    moveX = latX * peekSign * 0.9 + dirX * radialBias;
    moveZ = latZ * peekSign * 0.9 + dirZ * radialBias;
    quickBoost = enPct > 0.38 && (strafeSwitchTimerSec > 1.3 || !hasClearShot);
    jumpHeld = (selfPhysics.y || 0) < 2.2 && enPct > 0.55 && rand() < 0.15;
    const blockingObsHpRatio =
      los.blockingObstacle?.maxHp > 0 && los.blockingObstacle?.hp !== undefined
        ? los.blockingObstacle.hp / los.blockingObstacle.maxHp
        : 1;
    const shootFragileCover = !hasClearShot && blockingObsHpRatio < 0.32 && horzDist < 20;
    if (fireCooldownSec <= 0 && (hasClearShot || shootFragileCover)) {
      firePistol = true;
    }
  } else {
    // 7. Long-Range Closing Approach + Suppressing Fire (conserve ammo if blocked by tall cover)
    mode = AI_TACTICAL_STATES.APPROACH;
    const flankW = hasClearShot ? 0.3 : 0.72;
    moveX = dirX * (hasClearShot ? 0.94 : 0.65) + latX * flankW;
    moveZ = dirZ * (hasClearShot ? 0.94 : 0.65) + latZ * flankW;
    quickBoost = enPct > 0.32;
    if (fireCooldownSec <= 0 && hasClearShot) firePistol = true;
  }

  if (firePistol) {
    if (burstRemaining > 0) {
      burstRemaining -= 1;
      fireCooldownSec = 0.21;
    } else {
      burstRemaining = 2;
      fireCooldownSec = 1.15;
    }
  }

  const moveLen = Math.hypot(moveX, moveZ);
  if (moveLen > 1) {
    moveX /= moveLen;
    moveZ /= moveLen;
  }

  return {
    nextState: {
      ...cur,
      mode,
      threatTimerSec,
      strafeSwitchTimerSec,
      strafeSign,
      fireCooldownSec,
      burstRemaining,
      meleeCooldownSec,
      guardHoldTimerSec,
      evadeTimerSec,
      coverTargetId,
      coverAnchor,
      coverHoldTimerSec,
      suppressionSec,
    },
    intent: {
      moveX,
      moveZ,
      lookYaw,
      lookPitch,
      quickBoost,
      jumpHeld,
      guardHeld,
      firePistol,
      slashSaber,
      hasClearShot,
      coverTargetId,
      coverLost,
      mode,
    },
  };
}
