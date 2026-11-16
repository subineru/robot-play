/**
 * PLAY_ROBOTS Pure Settings Store, Quality Presets & Keybinding Manager
 * Clean Architecture Domain Layer (Zero DOM / Zero THREE dependencies).
 * Shared cleanly between Client HUD/Renderer and Node tests.
 */
import { DEFAULT_BGM_SETTINGS, createBgmRegistry } from './bgm_catalog.js';

const SHARED_BGM_REGISTRY = createBgmRegistry();

export const SETTINGS_STORAGE_KEY = 'play_robots.settings.v1';
export const MAX_RENDER_DPR = 1.5;

export const QUALITY_PRESETS = Object.freeze({
  performance: Object.freeze({
    id: 'performance',
    label: '極速 1.0x',
    shortLabel: '極速',
    dprCap: 1.0,
    bloom: false,
    shadows: false,
    particleBudgetScale: 0.55,
  }),
  standard: Object.freeze({
    id: 'standard',
    label: '標準 1.25x',
    shortLabel: '標準',
    dprCap: 1.25,
    bloom: true,
    shadows: true,
    particleBudgetScale: 1.0,
  }),
  high: Object.freeze({
    id: 'high',
    label: '精緻 ≤1.5x',
    shortLabel: '精緻',
    dprCap: 1.5,
    bloom: true,
    shadows: true,
    particleBudgetScale: 1.25,
  }),
});

export const KEYBIND_GROUPS = Object.freeze([
  Object.freeze({ id: 'movement', label: '機體機動 (Movement)' }),
  Object.freeze({ id: 'combat', label: '武裝與護盾 (Combat & Loadout)' }),
  Object.freeze({ id: 'camera', label: '戰術視角 (Camera)' }),
]);

export const KEYBIND_ACTIONS = Object.freeze([
  Object.freeze({ id: 'moveForward', group: 'movement', label: '前進', defaultCode: 'KeyW' }),
  Object.freeze({ id: 'moveBack', group: 'movement', label: '後退', defaultCode: 'KeyS' }),
  Object.freeze({ id: 'moveLeft', group: 'movement', label: '左移', defaultCode: 'KeyA' }),
  Object.freeze({ id: 'moveRight', group: 'movement', label: '右移', defaultCode: 'KeyD' }),
  Object.freeze({ id: 'jump', group: 'movement', label: '跳躍 / 飛行', defaultCode: 'Space' }),
  Object.freeze({ id: 'boost', group: 'movement', label: '噴射閃避', defaultCode: 'ShiftLeft' }),
  Object.freeze({ id: 'guard', group: 'combat', label: '舉盾備用鍵', defaultCode: 'KeyE' }),
  Object.freeze({ id: 'cycleShield', group: 'combat', label: '切換護盾', defaultCode: 'KeyG' }),
  Object.freeze({ id: 'fireBackLeft', group: 'combat', label: '左肩背掛發射', defaultCode: 'KeyQ' }),
  Object.freeze({ id: 'fireBackRight', group: 'combat', label: '右肩背掛發射', defaultCode: 'KeyX' }),
  Object.freeze({ id: 'cameraMode', group: 'camera', label: '座艙 / TPS', defaultCode: 'KeyV' }),
  Object.freeze({ id: 'orbitInspect', group: 'camera', label: '正面檢視', defaultCode: 'KeyC' }),
  Object.freeze({ id: 'dropWeapon', group: 'combat', label: '丟棄武器', defaultCode: 'KeyF' }),
  Object.freeze({ id: 'pickupWeapon', group: 'combat', label: '蹲下撿取', defaultCode: 'KeyR' }),
]);

const DEFAULT_KEYBINDINGS = Object.freeze(
  Object.fromEntries(KEYBIND_ACTIONS.map((a) => [a.id, a.defaultCode])),
);

export const DEFAULT_SETTINGS = Object.freeze({
  audio: Object.freeze({
    master: 0.5,
    weapons: 0.85,
    thrusters: 0.8,
    ambient: 0.75,
    bgm: 0.55,
  }),
  music: Object.freeze({
    menuTrack: DEFAULT_BGM_SETTINGS.menuTrack,
    combatTrack: DEFAULT_BGM_SETTINGS.combatTrack,
  }),
  controls: Object.freeze({
    invertMouseButtons: false,
    invertLookY: false,
    mouseSensitivity: 1.0,
    baseFov: 60,
    defaultCameraMode: 'tps',
  }),
  graphics: Object.freeze({
    qualityPreset: 'standard',
    cameraShakeScale: 1.0,
    showControlsHelp: true,
    saberGuideMode: 'sandbox_only',
  }),
  keybindings: DEFAULT_KEYBINDINGS,
});

const RESERVED_KEY_CODES = new Set(['Escape']);

function clampNum(val, min, max, fallback) {
  const num = Number(val);
  if (!Number.isFinite(num)) return fallback;
  return Math.min(max, Math.max(min, num));
}

function cloneSettings(src) {
  return {
    audio: { ...src.audio },
    music: { ...(src.music || DEFAULT_SETTINGS.music) },
    controls: { ...src.controls },
    graphics: { ...src.graphics },
    keybindings: { ...src.keybindings },
  };
}

/**
 * Convert a KeyboardEvent.code string into a compact human-readable key badge.
 */
export function formatKeyCodeLabel(code) {
  if (typeof code !== 'string' || !code) return '?';
  if (code.startsWith('Key') && code.length === 4) return code.slice(3);
  if (code.startsWith('Digit') && code.length === 6) return code.slice(5);
  if (code === 'ShiftLeft' || code === 'ShiftRight') return 'Shift';
  if (code === 'ControlLeft' || code === 'ControlRight') return 'Ctrl';
  if (code === 'AltLeft' || code === 'AltRight') return 'Alt';
  if (code === 'ArrowUp') return '↑';
  if (code === 'ArrowDown') return '↓';
  if (code === 'ArrowLeft') return '←';
  if (code === 'ArrowRight') return '→';
  return code;
}

/**
 * Compute capped effective renderer pixel ratio strictly enforcing DPR <= 1.5.
 */
export function resolveEffectivePixelRatio(devicePixelRatio = 1, qualityPreset = 'standard') {
  const preset = QUALITY_PRESETS[qualityPreset] || QUALITY_PRESETS.standard;
  const rawDpr = Number.isFinite(devicePixelRatio) && devicePixelRatio > 0 ? devicePixelRatio : 1;
  return Math.min(rawDpr, preset.dprCap, MAX_RENDER_DPR);
}

/**
 * Validate, clamp, and recover user settings objects or raw JSON strings.
 */
export function sanitizeSettings(raw) {
  let obj = raw;
  if (typeof raw === 'string') {
    try {
      obj = JSON.parse(raw);
    } catch {
      return cloneSettings(DEFAULT_SETTINGS);
    }
  }
  if (!obj || typeof obj !== 'object') {
    return cloneSettings(DEFAULT_SETTINGS);
  }

  const audioIn = obj.audio && typeof obj.audio === 'object' ? obj.audio : {};
  const musicIn = obj.music && typeof obj.music === 'object' ? obj.music : {};
  const controlsIn = obj.controls && typeof obj.controls === 'object' ? obj.controls : {};
  const graphicsIn = obj.graphics && typeof obj.graphics === 'object' ? obj.graphics : {};
  const keysIn = obj.keybindings && typeof obj.keybindings === 'object' ? obj.keybindings : {};

  const presetId =
    typeof graphicsIn.qualityPreset === 'string' && QUALITY_PRESETS[graphicsIn.qualityPreset]
      ? graphicsIn.qualityPreset
      : DEFAULT_SETTINGS.graphics.qualityPreset;

  const keybindings = {};
  for (const act of KEYBIND_ACTIONS) {
    const candidate = keysIn[act.id];
    const valid =
      typeof candidate === 'string' &&
      candidate.trim().length > 0 &&
      !RESERVED_KEY_CODES.has(candidate.trim());
    keybindings[act.id] = valid ? candidate.trim() : act.defaultCode;
  }

  return {
    audio: {
      master: clampNum(audioIn.master, 0, 1, DEFAULT_SETTINGS.audio.master),
      weapons: clampNum(audioIn.weapons, 0, 1, DEFAULT_SETTINGS.audio.weapons),
      thrusters: clampNum(audioIn.thrusters, 0, 1, DEFAULT_SETTINGS.audio.thrusters),
      ambient: clampNum(audioIn.ambient, 0, 1, DEFAULT_SETTINGS.audio.ambient),
      bgm: clampNum(audioIn.bgm, 0, 1, DEFAULT_SETTINGS.audio.bgm),
    },
    music: SHARED_BGM_REGISTRY.sanitizeMusicSelection(musicIn),
    controls: {
      invertMouseButtons:
        controlsIn.invertMouseButtons !== undefined
          ? Boolean(controlsIn.invertMouseButtons)
          : DEFAULT_SETTINGS.controls.invertMouseButtons,
      invertLookY:
        controlsIn.invertLookY !== undefined
          ? Boolean(controlsIn.invertLookY)
          : DEFAULT_SETTINGS.controls.invertLookY,
      mouseSensitivity: clampNum(
        controlsIn.mouseSensitivity,
        0.25,
        2.5,
        DEFAULT_SETTINGS.controls.mouseSensitivity,
      ),
      baseFov: Math.round(clampNum(controlsIn.baseFov, 50, 90, DEFAULT_SETTINGS.controls.baseFov)),
      defaultCameraMode:
        controlsIn.defaultCameraMode === 'fps_cockpit' ? 'fps_cockpit' : 'tps',
    },
    graphics: {
      qualityPreset: presetId,
      cameraShakeScale: clampNum(
        graphicsIn.cameraShakeScale,
        0,
        1,
        DEFAULT_SETTINGS.graphics.cameraShakeScale,
      ),
      showControlsHelp:
        graphicsIn.showControlsHelp !== undefined
          ? Boolean(graphicsIn.showControlsHelp)
          : DEFAULT_SETTINGS.graphics.showControlsHelp,
      saberGuideMode:
        graphicsIn.saberGuideMode === 'off' ? 'off' : 'sandbox_only',
    },
    keybindings,
  };
}

/**
 * Rebind an action key cleanly, swapping conflicting bindings automatically and
 * protecting reserved system keys like Escape.
 */
export function rebindKey(currentSettings, action, newKeyCode) {
  const cur = sanitizeSettings(currentSettings);
  if (!Object.prototype.hasOwnProperty.call(cur.keybindings, action)) {
    return { settings: cur, changed: false, swappedWith: null, reason: 'UNKNOWN_ACTION' };
  }
  const code = typeof newKeyCode === 'string' ? newKeyCode.trim() : '';
  if (!code) {
    return { settings: cur, changed: false, swappedWith: null, reason: 'INVALID_KEY' };
  }
  if (RESERVED_KEY_CODES.has(code)) {
    return { settings: cur, changed: false, swappedWith: null, reason: 'RESERVED_KEY' };
  }

  const prevCode = cur.keybindings[action];
  if (prevCode === code) {
    return { settings: cur, changed: false, swappedWith: null, reason: null };
  }

  const next = cloneSettings(cur);
  let swappedWith = null;
  for (const [otherAction, boundCode] of Object.entries(next.keybindings)) {
    if (otherAction !== action && boundCode === code) {
      next.keybindings[otherAction] = prevCode;
      swappedWith = otherAction;
      break;
    }
  }
  next.keybindings[action] = code;

  return {
    settings: sanitizeSettings(next),
    changed: true,
    swappedWith,
    reason: null,
  };
}

function resolveDefaultStorage() {
  try {
    if (typeof globalThis !== 'undefined' && globalThis.localStorage) {
      return globalThis.localStorage;
    }
  } catch {
    // ignore restricted storage access
  }
  return null;
}

/**
 * Stateful reactive settings store with safe persistence and subscription hooks.
 */
export function createSettingsStore({ storage, storageKey = SETTINGS_STORAGE_KEY } = {}) {
  const backing = storage === undefined ? resolveDefaultStorage() : storage;
  const listeners = new Set();

  let state = cloneSettings(DEFAULT_SETTINGS);
  if (backing && typeof backing.getItem === 'function') {
    try {
      const saved = backing.getItem(storageKey);
      if (saved) state = sanitizeSettings(saved);
    } catch {
      state = cloneSettings(DEFAULT_SETTINGS);
    }
  }

  const persist = () => {
    if (!backing || typeof backing.setItem !== 'function') return;
    try {
      backing.setItem(storageKey, JSON.stringify(state));
    } catch {
      // ignore storage quota errors
    }
  };

  const notify = () => {
    const snap = cloneSettings(state);
    for (const fn of listeners) {
      fn(snap);
    }
  };

  return {
    get: () => cloneSettings(state),
    update: (patch) => {
      if (!patch || typeof patch !== 'object') return cloneSettings(state);
      const merged = {
        audio: { ...state.audio, ...(patch.audio || {}) },
        music: { ...(state.music || DEFAULT_SETTINGS.music), ...(patch.music || {}) },
        controls: { ...state.controls, ...(patch.controls || {}) },
        graphics: { ...state.graphics, ...(patch.graphics || {}) },
        keybindings: { ...state.keybindings, ...(patch.keybindings || {}) },
      };
      state = sanitizeSettings(merged);
      persist();
      notify();
      return cloneSettings(state);
    },
    rebind: (action, newKeyCode) => {
      const res = rebindKey(state, action, newKeyCode);
      if (res.changed) {
        state = res.settings;
        persist();
        notify();
      }
      return {
        ...res,
        settings: cloneSettings(state),
      };
    },
    reset: () => {
      state = sanitizeSettings({});
      persist();
      notify();
      return cloneSettings(state);
    },
    subscribe: (listener) => {
      if (typeof listener !== 'function') return () => {};
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}
