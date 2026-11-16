/**
 * PLAY_ROBOTS Pure BO3 Duel Match Rules, CombatEvent[] Timeline & MC/Rank Calculator.
 * Clean Architecture Domain Layer (Zero DOM / Zero THREE dependencies).
 */
import { clamp } from './kinematics.js';

export const MATCH_PHASES = Object.freeze({
  COUNTDOWN: 'COUNTDOWN',
  ACTIVE: 'ACTIVE',
  INTERMISSION: 'INTERMISSION',
  FINISHED: 'FINISHED',
});

export const DUEL_COUNTDOWN_SEC = 3.0;

export const MATCH_EVENT_TYPES = Object.freeze({
  MATCH_START: 'MATCH_START',
  PARRY: 'PARRY',
  SABER_CLASH: 'SABER_CLASH',
  GUARD_BREAK: 'GUARD_BREAK',
  STAGGER: 'STAGGER',
  PART_BREAK: 'PART_BREAK',
  ROUND_WIN: 'ROUND_WIN',
  ROUND_LOSS: 'ROUND_LOSS',
  MATCH_END: 'MATCH_END',
});

const RANK_MULTIPLIERS = Object.freeze({
  S: 1.5,
  A: 1.3,
  B: 1.15,
  C: 1.0,
});

export function formatMatchTime(timeSec = 0) {
  const safe = Math.max(0, Number(timeSec) || 0);
  const mins = Math.floor(safe / 60);
  const secs = safe % 60;
  return `${String(mins).padStart(2, '0')}:${secs.toFixed(1).padStart(4, '0')}`;
}

export function createDuelMatchState({
  modeId = 'duel_1v1',
  maxWins = 2,
  rivalName = 'EF-T01 ACE',
  countdownSec = null,
} = {}) {
  const defaultCd = modeId === 'duel_1v1' ? DUEL_COUNTDOWN_SEC : 0;
  const safeCd = Math.max(0, Number(countdownSec ?? defaultCd) || 0);
  return {
    modeId,
    rivalName,
    maxWins: Math.max(1, Number(maxWins) || 2),
    roundNumber: 1,
    playerWins: 0,
    enemyWins: 0,
    phase: safeCd > 0 ? MATCH_PHASES.COUNTDOWN : MATCH_PHASES.ACTIVE,
    countdownSec: safeCd,
    intermissionSec: 0,
    elapsedSec: 0,
    winner: null,
    timeline: [
      {
        timeSec: 0,
        timeLabel: '00:00.0',
        type: MATCH_EVENT_TYPES.MATCH_START,
        actor: 'system',
        detail: `${modeId === 'duel_1v1' ? '1v1 王牌 AI 決鬥開戰 (BO3)' : '戰鬥模擬啟動'}`,
      },
    ],
  };
}

/**
 * Step the pre-round 3..2..1 countdown and emit discrete integer beep steps.
 */
export function stepDuelCountdown(matchState, dt = 0) {
  const cur = matchState || createDuelMatchState();
  if (cur.phase !== MATCH_PHASES.COUNTDOWN) {
    return {
      nextState: cur,
      transitionedToActive: false,
      currentBeepStep: 0,
    };
  }
  const safeDt = Math.max(0, Number(dt) || 0);
  const rem = Math.max(0, (Number(cur.countdownSec) || 0) - safeDt);
  if (rem <= 0) {
    return {
      nextState: {
        ...cur,
        phase: MATCH_PHASES.ACTIVE,
        countdownSec: 0,
      },
      transitionedToActive: true,
      currentBeepStep: 0,
    };
  }
  return {
    nextState: {
      ...cur,
      countdownSec: rem,
    },
    transitionedToActive: false,
    currentBeepStep: Math.ceil(rem),
  };
}

/**
 * Advance BO3 round counter after intermission and enter the next round's countdown.
 */
export function beginRoundCountdown(matchState, countdownSec = DUEL_COUNTDOWN_SEC) {
  const cur = matchState || createDuelMatchState();
  const safeCd = Math.max(0, Number(countdownSec) || 0);
  return {
    ...cur,
    roundNumber: (Number(cur.roundNumber) || 1) + 1,
    phase: safeCd > 0 ? MATCH_PHASES.COUNTDOWN : MATCH_PHASES.ACTIVE,
    countdownSec: safeCd,
    intermissionSec: 0,
  };
}

export function recordMatchEvent(
  matchState,
  { timeSec = 0, type = MATCH_EVENT_TYPES.PARRY, actor = 'player', detail = '' } = {},
) {
  const cur = matchState || createDuelMatchState();
  const safeTime = Math.max(0, Number(timeSec) || cur.elapsedSec || 0);
  const nextTimeline = cur.timeline.concat({
    timeSec: safeTime,
    timeLabel: formatMatchTime(safeTime),
    type,
    actor,
    detail: String(detail || type),
  });
  return {
    ...cur,
    timeline: nextTimeline.slice(-40),
  };
}

export function resolveRoundEnd(
  matchState,
  { winner = 'player', timeSec = 0, playerHp = 0, playerMaxHp = 10000 } = {},
) {
  const cur = matchState || createDuelMatchState();
  const playerWonRound = winner === 'player';
  const playerWins = cur.playerWins + (playerWonRound ? 1 : 0);
  const enemyWins = cur.enemyWins + (playerWonRound ? 0 : 1);
  const safeTime = Math.max(0, Number(timeSec) || cur.elapsedSec || 0);

  let next = recordMatchEvent(cur, {
    timeSec: safeTime,
    type: playerWonRound ? MATCH_EVENT_TYPES.ROUND_WIN : MATCH_EVENT_TYPES.ROUND_LOSS,
    actor: winner,
    detail: `第 ${cur.roundNumber} 回合 ${playerWonRound ? '擊破勝出' : '機體大破'} (${playerWins}:${enemyWins})`,
  });

  const matchComplete = playerWins >= cur.maxWins || enemyWins >= cur.maxWins;
  if (matchComplete) {
    const finalWinner = playerWins >= cur.maxWins ? 'player' : 'enemy';
    next = recordMatchEvent(next, {
      timeSec: safeTime,
      type: MATCH_EVENT_TYPES.MATCH_END,
      actor: finalWinner,
      detail: finalWinner === 'player' ? '決鬥勝利 — 壓制目標機體' : '任務敗北 — 等待整備再戰',
    });
    return {
      matchComplete: true,
      nextState: {
        ...next,
        playerWins,
        enemyWins,
        phase: MATCH_PHASES.FINISHED,
        winner: finalWinner,
        lastRoundHpRatio: clamp(playerHp / Math.max(1, playerMaxHp), 0, 1),
      },
    };
  }

  return {
    matchComplete: false,
    nextState: {
      ...next,
      playerWins,
      enemyWins,
      phase: MATCH_PHASES.INTERMISSION,
      intermissionSec: 2.2,
    },
  };
}

export function computeMatchSummary(
  matchState,
  {
    won = true,
    playerHpRatio = 1,
    durationSec = 30,
    damageDealt = 0,
    buildingsDestroyed = 0,
    partDamage = null,
    rivalPartDamage = null,
  } = {},
) {
  const cur = matchState || createDuelMatchState();
  const events = Array.isArray(cur.timeline) ? cur.timeline : [];
  const parries = events.filter((e) => e.type === MATCH_EVENT_TYPES.PARRY && e.actor === 'player').length;
  const clashes = events.filter((e) => e.type === MATCH_EVENT_TYPES.SABER_CLASH).length;
  const guardBreaks = events.filter((e) => e.type === MATCH_EVENT_TYPES.GUARD_BREAK && e.actor === 'player').length;
  const staggers = events.filter((e) => e.type === MATCH_EVENT_TYPES.STAGGER && e.actor === 'player').length;

  const hpPct = clamp(Number(playerHpRatio) || 0, 0, 1);
  const styleScore =
    (won ? 45 : 10) +
    hpPct * 25 +
    parries * 8 +
    clashes * 7 +
    staggers * 8 +
    guardBreaks * 6;

  let rank = 'C';
  if (won && styleScore >= 85) rank = 'S';
  else if (won && styleScore >= 68) rank = 'A';
  else if (styleScore >= 42) rank = 'B';

  const rankMultiplier = RANK_MULTIPLIERS[rank] || 1.0;
  const baseBounty = won ? 280 : 110;
  const combatBonus = (won ? cur.enemyWins * 45 + 90 : cur.playerWins * 45) + parries * 40 + staggers * 45 + clashes * 35;
  const destructionBonus = Math.min(120, Math.max(0, Math.floor(buildingsDestroyed)) * 12);
  const repairCost = Math.min(180, Math.round((1 - hpPct) * 180));
  const netMc = Math.max(
    60,
    Math.floor((baseBounty + combatBonus + destructionBonus) * rankMultiplier - repairCost),
  );

  const PART_KEYS = ['head', 'torso', 'arm_l', 'arm_r', 'backpack', 'legs'];
  const pMap = partDamage && typeof partDamage === 'object' ? partDamage : null;
  const rMap = rivalPartDamage && typeof rivalPartDamage === 'object' ? rivalPartDamage : null;
  const playerIntactCount = pMap
    ? PART_KEYS.filter((k) => pMap[k] && !pMap[k]?.severed && (pMap[k]?.status || 'intact') === 'intact').length
    : 0;
  const playerBrokenParts = pMap
    ? PART_KEYS.filter((k) => pMap[k] && (pMap[k]?.severed || pMap[k]?.broken || pMap[k]?.status === 'broken'))
    : [];
  const rivalSeveredArms = rMap
    ? ['arm_l', 'arm_r'].filter((k) => Boolean(rMap[k]?.severed))
    : [];
  const rivalBrokenParts = rMap
    ? PART_KEYS.filter((k) => rMap[k] && !rMap[k]?.severed && (rMap[k]?.broken || rMap[k]?.status === 'broken'))
    : [];

  return {
    modeId: cur.modeId || 'duel_1v1',
    rivalName: cur.rivalName || 'EF-T01 ACE',
    won: Boolean(won),
    rank,
    playerWins: cur.playerWins || 0,
    enemyWins: cur.enemyWins || 0,
    durationSec: Math.max(0, Number(durationSec) || 0),
    durationLabel: formatMatchTime(durationSec),
    stats: {
      hpRemainingPct: Math.round(hpPct * 100),
      parries,
      clashes,
      guardBreaks,
      staggers,
      damageDealt: Math.round(Math.max(0, Number(damageDealt) || 0)),
      buildingsDestroyed: Math.max(0, Math.floor(buildingsDestroyed || 0)),
    },
    timeline: events.slice(),
    mcBreakdown: {
      baseBounty,
      combatBonus,
      destructionBonus,
      rankMultiplier,
      repairCost,
      netMc,
    },
    partAudit: {
      playerIntactCount,
      playerBrokenParts,
      rivalSeveredArms,
      rivalBrokenParts,
    },
  };
}
