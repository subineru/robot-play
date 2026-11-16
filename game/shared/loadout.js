/**
 * PLAY_ROBOTS Pure Arm Loadout Validator & L/R Symmetric Control Mapper
 * Clean Architecture Domain Layer (Zero DOM / Zero THREE dependencies).
 * Shared identically by Browser Client and future Authoritative WebSocket Server.
 *
 * Rules ([M5.6], v2.5.0):
 * - Maximum 2 held slots (lHand + rHand)
 * - Identical weapons allowed in both hands (Dual Pistols, Dual Sabers)
 * - Maximum 1 shield across both hands (dual shields rejected)
 * - Default Mouse Mapping: LMB -> Left Hand, RMB -> Right Hand; KeyE -> active shield guard
 */

export const HAND_WEAPON_TYPES = Object.freeze(['pistol', 'saber', 'shield', 'none']);

export const ARM_LOADOUT_PRESETS = Object.freeze([
  Object.freeze({ mode: 1, shortLabel: '1 劍+槍', label: '劍 + 槍 (Left Saber / Right Gun)', lHand: 'saber', rHand: 'pistol' }),
  Object.freeze({ mode: 2, shortLabel: '2 盾+槍', label: '盾 + 槍 (Left Shield / Right Gun)', lHand: 'shield', rHand: 'pistol' }),
  Object.freeze({ mode: 3, shortLabel: '3 盾+劍', label: '盾 + 劍 (Left Shield / Right Saber)', lHand: 'shield', rHand: 'saber' }),
  Object.freeze({ mode: 4, shortLabel: '4 雙槍', label: '雙槍壓制 (Dual Beam Pistols)', lHand: 'pistol', rHand: 'pistol' }),
  Object.freeze({ mode: 5, shortLabel: '5 雙劍', label: '雙光劍連斬 (Dual Hyper Sabers)', lHand: 'saber', rHand: 'saber' }),
  Object.freeze({ mode: 6, shortLabel: '6 槍+右盾', label: '鏡像右盾 (Left Gun / Right Shield)', lHand: 'pistol', rHand: 'shield' }),
]);

/**
 * Validate a two-hand weapon loadout configuration.
 * @param {{ lHand?: string, rHand?: string }} preset
 */
export function validateLoadoutPreset(preset) {
  if (!preset || typeof preset !== 'object') {
    return { valid: false, reason: 'INVALID_LOADOUT_OBJECT', shieldCount: 0, armedCount: 0 };
  }
  const { lHand = 'none', rHand = 'none' } = preset;
  if (!HAND_WEAPON_TYPES.includes(lHand) || !HAND_WEAPON_TYPES.includes(rHand)) {
    return { valid: false, reason: 'INVALID_WEAPON_TYPE', shieldCount: 0, armedCount: 0 };
  }
  const shieldCount = (lHand === 'shield' ? 1 : 0) + (rHand === 'shield' ? 1 : 0);
  const armedCount = (lHand !== 'none' ? 1 : 0) + (rHand !== 'none' ? 1 : 0);
  if (shieldCount > 1) {
    return { valid: false, reason: 'MAX_ONE_SHIELD_ALLOWED', shieldCount, armedCount };
  }
  return { valid: true, reason: null, shieldCount, armedCount };
}

/**
 * Resolve numbered preset 1..6 cleanly. Defaults to Mode 1 (L:Saber, R:Pistol).
 */
export function resolveArmLoadoutPreset(mode = 1) {
  const m = Number(mode);
  const found = ARM_LOADOUT_PRESETS.find((p) => p.mode === m) || ARM_LOADOUT_PRESETS[0];
  return { ...found };
}

/**
 * Assign a weapon type to either 'lHand' or 'rHand', automatically clearing an
 * opposite-hand shield if assigning 'shield' so single-shield constraint stays intact.
 */
export function assignHandWeapon(current, handKey, weaponType) {
  if ((handKey !== 'lHand' && handKey !== 'rHand') || !HAND_WEAPON_TYPES.includes(weaponType)) {
    return current ? { ...current } : resolveArmLoadoutPreset(1);
  }
  const otherKey = handKey === 'lHand' ? 'rHand' : 'lHand';
  const next = {
    mode: 0,
    lHand: current?.lHand || 'saber',
    rHand: current?.rHand || 'pistol',
  };
  next[handKey] = weaponType;
  if (weaponType === 'shield' && next[otherKey] === 'shield') {
    // Free the opposite hand from duplicate shield (defaulting it to pistol for balanced combat)
    next[otherKey] = 'pistol';
  }
  const matched = ARM_LOADOUT_PRESETS.find((p) => p.lHand === next.lHand && p.rHand === next.rHand);
  if (matched) return { ...matched };
  return {
    mode: 0,
    shortLabel: '自訂雙持',
    label: `自訂 (L:${next.lHand} / R:${next.rHand})`,
    lHand: next.lHand,
    rHand: next.rHand,
  };
}

/**
 * Map mouse buttons & keyboard guard key symmetrically to Left/Right hand actions.
 * Default: LMB -> Left Hand, RMB -> Right Hand (reversed if invertMouseButtons=true).
 */
export function mapMouseInputToHandActions({
  lmbHeld = false,
  rmbHeld = false,
  eHeld = false,
  lHand = 'saber',
  rHand = 'pistol',
  invertMouseButtons = false,
} = {}) {
  const leftInput = invertMouseButtons ? rmbHeld : lmbHeld;
  const rightInput = invertMouseButtons ? lmbHeld : rmbHeld;

  const shieldSide = lHand === 'shield' ? 'left' : rHand === 'shield' ? 'right' : null;
  const guardFromMouse =
    (shieldSide === 'left' && leftInput) || (shieldSide === 'right' && rightInput);

  return {
    shootL: lHand === 'pistol' && Boolean(leftInput),
    shootR: rHand === 'pistol' && Boolean(rightInput),
    slashL: lHand === 'saber' && Boolean(leftInput),
    slashR: rHand === 'saber' && Boolean(rightInput),
    guardHeld: Boolean(shieldSide && (guardFromMouse || eHeld)),
    shieldSide,
  };
}
