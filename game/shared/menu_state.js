/**
 * PLAY_ROBOTS Pure Menu Navigation State Machine & 3D Showcase Camera Framing
 * Clean Architecture Domain Layer (Zero DOM / Zero THREE dependencies).
 * Shared cleanly between Client Menu Controller, Renderer, and Node tests.
 */

export const APP_SCREENS = Object.freeze({
  MAIN_MENU: 'MAIN_MENU',
  IN_GAME: 'IN_GAME',
  PAUSED: 'PAUSED',
  POST_MATCH: 'POST_MATCH',
});

export const MAIN_MENU_TABS = Object.freeze([
  Object.freeze({ id: 'home', code: '00', label: '主堡總覽', subLabel: 'HOME' }),
  Object.freeze({ id: 'sortie', code: '01', label: '出擊任務', subLabel: 'SORTIE' }),
  Object.freeze({ id: 'armory', code: '02', label: '格納庫', subLabel: 'ARMORY' }),
  Object.freeze({ id: 'paint', code: '03', label: '塗裝工坊', subLabel: 'PAINT' }),
  Object.freeze({ id: 'career', code: '04', label: '戰績檔案', subLabel: 'CAREER' }),
  Object.freeze({ id: 'settings', code: '05', label: '系統設定', subLabel: 'SYSTEM' }),
]);

export const SORTIE_STEPS = Object.freeze({
  MODE: 'mode',
  BRIEFING: 'briefing',
  LOBBY: 'lobby',
});

export const PAUSE_VIEWS = Object.freeze({
  HUB: 'hub',
  SETTINGS: 'settings',
  QUICK_ARMORY: 'quick_armory',
});

export const SETTINGS_TABS = Object.freeze([
  Object.freeze({ id: 'display', label: '顯示與畫面', subLabel: 'DISPLAY' }),
  Object.freeze({ id: 'audio', label: '音訊混音', subLabel: 'AUDIO' }),
  Object.freeze({ id: 'controls', label: '操控與視角', subLabel: 'CONTROLS' }),
  Object.freeze({ id: 'keybindings', label: '按鍵綁定', subLabel: 'KEYBINDS' }),
]);

export const ARMORY_SLOTS = Object.freeze([
  Object.freeze({ id: 'body', code: 'BODY', label: '機體本體', boneHint: 'Torso', status: 'playable', plannedTask: null }),
  Object.freeze({ id: 'pilot', code: 'PILOT', label: '人類駕駛', boneHint: 'Head', status: 'playable', plannedTask: null }),
  Object.freeze({ id: 'l_hand', code: 'L-HAND', label: '左手武裝', boneHint: 'Hand_L', status: 'playable', plannedTask: null }),
  Object.freeze({ id: 'r_hand', code: 'R-HAND', label: '右手武裝', boneHint: 'Hand_R', status: 'playable', plannedTask: null }),
  Object.freeze({ id: 'shield', code: 'SHIELD', label: '防禦護盾', boneHint: 'Arm_Lower_L', status: 'playable', plannedTask: null }),
  Object.freeze({ id: 'l_back', code: 'L-BACK', label: '左肩背掛', boneHint: 'ShoulderPad_L', status: 'playable', plannedTask: null }),
  Object.freeze({ id: 'r_back', code: 'R-BACK', label: '右肩背掛', boneHint: 'ShoulderPad_R', status: 'playable', plannedTask: null }),
  Object.freeze({ id: 'armor', code: 'ARMOR', label: '防具模組', boneHint: 'Pelvis', status: 'playable', plannedTask: null }),
]);

const VALID_SCREENS = new Set(Object.values(APP_SCREENS));
const VALID_MAIN_TABS = new Set(MAIN_MENU_TABS.map((t) => t.id));
const VALID_PAUSE_VIEWS = new Set(Object.values(PAUSE_VIEWS));
const VALID_SETTINGS_TABS = new Set(SETTINGS_TABS.map((t) => t.id));
const VALID_PAINT_ZONES = new Set(['all', 'head', 'torso', 'arm_l', 'arm_r', 'legs', 'backpack', 'weapons', 'shields']);
const VALID_ARMORY_SLOTS = new Set(ARMORY_SLOTS.map((s) => s.id));
const VALID_SORTIE_FLOWS = new Set(['solo', 'lobby']);
const VALID_SORTIE_STEPS = new Set(Object.values(SORTIE_STEPS));
const VALID_LOBBY_ACTIONS = new Set(['create', 'join']);

const ARMORY_SLOT_CAMERA_FOCUS = Object.freeze({
  pilot: Object.freeze({ orbitYawOffset: Math.PI * 1.12, orbitPitch: 0.08, orbitDistance: 3.15, targetHeightOffset: 1.15, autoRotateSpeed: 0.02 }),
  l_hand: Object.freeze({ orbitYawOffset: Math.PI * 0.70, orbitPitch: 0.09, orbitDistance: 3.30, targetHeightOffset: 1.48, autoRotateSpeed: 0.02 }),
  r_hand: Object.freeze({ orbitYawOffset: Math.PI * 1.16, orbitPitch: 0.09, orbitDistance: 3.30, targetHeightOffset: 1.48, autoRotateSpeed: 0.02 }),
  shield: Object.freeze({ orbitYawOffset: Math.PI * 0.68, orbitPitch: 0.09, orbitDistance: 3.25, targetHeightOffset: 1.44, autoRotateSpeed: 0.03 }),
  l_back: Object.freeze({ orbitYawOffset: Math.PI * 0.24, orbitPitch: 0.14, orbitDistance: 3.65, targetHeightOffset: 1.72, autoRotateSpeed: 0.02 }),
  r_back: Object.freeze({ orbitYawOffset: Math.PI * -0.22, orbitPitch: 0.14, orbitDistance: 3.65, targetHeightOffset: 1.72, autoRotateSpeed: 0.02 }),
  armor: Object.freeze({ orbitYawOffset: Math.PI * 0.88, orbitPitch: 0.11, orbitDistance: 3.35, targetHeightOffset: 1.38, autoRotateSpeed: 0.04 }),
});

const PAINT_ZONE_CAMERA_FOCUS = Object.freeze({
  head: Object.freeze({ orbitYawOffset: Math.PI * 0.94, orbitPitch: 0.08, orbitDistance: 2.75, targetHeightOffset: 2.08, autoRotateSpeed: 0.04 }),
  torso: Object.freeze({ orbitYawOffset: Math.PI * 0.92, orbitPitch: 0.10, orbitDistance: 3.10, targetHeightOffset: 1.56, autoRotateSpeed: 0.05 }),
  arm_l: Object.freeze({ orbitYawOffset: Math.PI * 0.72, orbitPitch: 0.10, orbitDistance: 3.25, targetHeightOffset: 1.52, autoRotateSpeed: 0.02 }),
  arm_r: Object.freeze({ orbitYawOffset: Math.PI * 1.18, orbitPitch: 0.10, orbitDistance: 3.25, targetHeightOffset: 1.52, autoRotateSpeed: 0.02 }),
  legs: Object.freeze({ orbitYawOffset: Math.PI * 0.86, orbitPitch: 0.18, orbitDistance: 3.45, targetHeightOffset: 0.72, autoRotateSpeed: 0.04 }),
  backpack: Object.freeze({ orbitYawOffset: Math.PI * 0.14, orbitPitch: 0.14, orbitDistance: 3.75, targetHeightOffset: 1.62, autoRotateSpeed: 0.02 }),
  weapons: Object.freeze({ orbitYawOffset: Math.PI * 1.15, orbitPitch: 0.08, orbitDistance: 3.15, targetHeightOffset: 1.38, autoRotateSpeed: 0.03 }),
  shields: Object.freeze({ orbitYawOffset: Math.PI * 0.72, orbitPitch: 0.08, orbitDistance: 3.15, targetHeightOffset: 1.42, autoRotateSpeed: 0.03 }),
});

const MENU_CAMERA_RIGS = Object.freeze({
  home: Object.freeze({
    active: true,
    orbitYawOffset: Math.PI * 0.84,
    orbitPitch: 0.11,
    orbitDistance: 4.9,
    targetHeightOffset: 1.38,
    autoRotateSpeed: 0.12,
    stageBias: 0.28,
  }),
  sortie: Object.freeze({
    active: true,
    orbitYawOffset: Math.PI * 0.81,
    orbitPitch: 0.11,
    orbitDistance: 4.65,
    targetHeightOffset: 1.40,
    autoRotateSpeed: 0.10,
    stageBias: 0.22,
  }),
  armory: Object.freeze({
    active: true,
    orbitYawOffset: Math.PI * 0.72,
    orbitPitch: 0.08,
    orbitDistance: 3.65,
    targetHeightOffset: 1.44,
    autoRotateSpeed: 0.05,
    stageBias: 0,
  }),
  paint: Object.freeze({
    active: true,
    orbitYawOffset: Math.PI * 0.90,
    orbitPitch: 0.14,
    orbitDistance: 4.1,
    targetHeightOffset: 1.42,
    autoRotateSpeed: 0.22,
    stageBias: 0,
  }),
  career: Object.freeze({
    active: true,
    orbitYawOffset: Math.PI * 0.62,
    orbitPitch: 0.16,
    orbitDistance: 4.5,
    targetHeightOffset: 1.45,
    autoRotateSpeed: 0.15,
    stageBias: 0,
  }),
  settings: Object.freeze({
    active: true,
    orbitYawOffset: Math.PI * 0.88,
    orbitPitch: 0.12,
    orbitDistance: 5.3,
    targetHeightOffset: 1.35,
    autoRotateSpeed: 0.06,
    stageBias: 0,
  }),
});

/**
 * Create a validated menu state snapshot.
 */
export function createMenuState(overrides = {}) {
  const src = overrides && typeof overrides === 'object' ? overrides : {};
  return {
    screen: VALID_SCREENS.has(src.screen) ? src.screen : APP_SCREENS.MAIN_MENU,
    mainTab: VALID_MAIN_TABS.has(src.mainTab) ? src.mainTab : 'home',
    sortieStep: VALID_SORTIE_STEPS.has(src.sortieStep) ? src.sortieStep : SORTIE_STEPS.MODE,
    pauseView: VALID_PAUSE_VIEWS.has(src.pauseView) ? src.pauseView : PAUSE_VIEWS.HUB,
    settingsTab: VALID_SETTINGS_TABS.has(src.settingsTab) ? src.settingsTab : 'display',
    rebindingAction: typeof src.rebindingAction === 'string' && src.rebindingAction ? src.rebindingAction : null,
    previewMapId: typeof src.previewMapId === 'string' && src.previewMapId ? src.previewMapId : 'neo_tokyo',
    previewModeId: typeof src.previewModeId === 'string' && src.previewModeId ? src.previewModeId : 'duel_1v1',
    previewMechaId: typeof src.previewMechaId === 'string' && src.previewMechaId ? src.previewMechaId : 'EF-018',
    previewMechaVariantId:
      typeof src.previewMechaVariantId === 'string' && src.previewMechaVariantId ? src.previewMechaVariantId : 'mk2',
    previewPilotId: typeof src.previewPilotId === 'string' && src.previewPilotId ? src.previewPilotId : 'PILOT-01',
    previewRHandWeaponId:
      typeof src.previewRHandWeaponId === 'string' && src.previewRHandWeaponId ? src.previewRHandWeaponId : 'EF-AR01',
    previewArmorCoreId: typeof src.previewArmorCoreId === 'string' && src.previewArmorCoreId ? src.previewArmorCoreId : 'EF-AC01',
    previewArmorLiningId: typeof src.previewArmorLiningId === 'string' && src.previewArmorLiningId ? src.previewArmorLiningId : null,
    previewLBackId: typeof src.previewLBackId === 'string' && src.previewLBackId ? src.previewLBackId : null,
    previewRBackId: typeof src.previewRBackId === 'string' && src.previewRBackId ? src.previewRBackId : null,
    activePaintZone: VALID_PAINT_ZONES.has(src.activePaintZone) ? src.activePaintZone : 'all',
    activeArmorySlot: VALID_ARMORY_SLOTS.has(src.activeArmorySlot) ? src.activeArmorySlot : 'body',
    sortieFlow: VALID_SORTIE_FLOWS.has(src.sortieFlow) ? src.sortieFlow : 'solo',
    lobbyAction: VALID_LOBBY_ACTIONS.has(src.lobbyAction) ? src.lobbyAction : 'create',
    panelCollapsed: Boolean(src.panelCollapsed),
    lastMatchSummary: src.lastMatchSummary && typeof src.lastMatchSummary === 'object' ? { ...src.lastMatchSummary } : null,
  };
}

const PREVIEW_FIELD_BY_KIND = Object.freeze({
  map: 'previewMapId',
  mode: 'previewModeId',
  mecha: 'previewMechaId',
  mecha_variant: 'previewMechaVariantId',
  pilot: 'previewPilotId',
  r_hand_weapon: 'previewRHandWeaponId',
  armor_core: 'previewArmorCoreId',
  armor_lining: 'previewArmorLiningId',
  l_back: 'previewLBackId',
  r_back: 'previewRBackId',
  paint_zone: 'activePaintZone',
  armory_slot: 'activeArmorySlot',
  sortie_flow: 'sortieFlow',
  sortie_step: 'sortieStep',
  lobby_action: 'lobbyAction',
  panel_collapsed: 'panelCollapsed',
});

/**
 * Switch catalog preview card focus (allows inspecting blueprint-locked cards safely).
 */
export function selectCatalogPreview(state, kind, id) {
  const cur = createMenuState(state);
  if (kind === 'sortie_step') {
    if (!VALID_SORTIE_STEPS.has(id)) return cur;
    return {
      ...cur,
      sortieStep: id,
      sortieFlow: id === SORTIE_STEPS.LOBBY ? 'lobby' : 'solo',
    };
  }
  const field = PREVIEW_FIELD_BY_KIND[kind];
  if (!field) return cur;
  if (kind === 'panel_collapsed') {
    return { ...cur, panelCollapsed: Boolean(id) };
  }
  if (kind === 'paint_zone' && !VALID_PAINT_ZONES.has(id)) return cur;
  if (kind === 'armory_slot' && !VALID_ARMORY_SLOTS.has(id)) return cur;
  if (kind === 'sortie_flow' && !VALID_SORTIE_FLOWS.has(id)) return cur;
  if (kind === 'lobby_action' && !VALID_LOBBY_ACTIONS.has(id)) return cur;
  if (id !== null && typeof id !== 'string') return cur;
  return {
    ...cur,
    [field]: id,
  };
}

/**
 * Cycle previewMapId forward/backward across ordered mapIds with clean wrap-around.
 */
export function cyclePreviewMap(state, mapIds, delta = 1) {
  const cur = createMenuState(state);
  if (!Array.isArray(mapIds) || mapIds.length === 0) return cur;
  const step = Number.isFinite(Number(delta)) ? Math.trunc(Number(delta)) : 1;
  const curIdx = mapIds.indexOf(cur.previewMapId);
  const baseIdx = curIdx >= 0 ? curIdx : 0;
  const nextIdx = (((baseIdx + step) % mapIds.length) + mapIds.length) % mapIds.length;
  return {
    ...cur,
    previewMapId: mapIds[nextIdx],
  };
}

/**
 * Verify whether all currently selected Sortie & Hangar items are playable.
 */
export function resolveSortieReadiness(state, catalogSnapshot) {
  const cur = createMenuState(state);
  const snap = catalogSnapshot || {};
  const blockers = [];

  const checkItem = (kind, id, dict) => {
    if (!id || !dict || !dict[id]) return;
    const item = dict[id];
    if (item.status && item.status !== 'playable') {
      blockers.push({
        kind,
        id: item.id,
        label: item.name || item.id,
        status: item.status,
        plannedTask: item.plannedTask || '待排程',
      });
    }
  };

  checkItem('mode', cur.previewModeId, snap.modes);
  checkItem('map', cur.previewMapId, snap.maps);
  checkItem('mecha', cur.previewMechaId, snap.actors);
  checkItem('pilot', cur.previewPilotId, snap.pilots);
  checkItem('r_hand_weapon', cur.previewRHandWeaponId, snap.weapons);
  checkItem('armor_core', cur.previewArmorCoreId, snap.armors);
  checkItem('armor_lining', cur.previewArmorLiningId, snap.armors);
  checkItem('l_back', cur.previewLBackId, snap.weapons);
  checkItem('r_back', cur.previewRBackId, snap.weapons);

  return {
    canLaunch: blockers.length === 0,
    blockers,
  };
}

/**
 * Switch top-level MAIN_MENU tab and clear any pending key rebind capture.
 */
export function selectMainMenuTab(state, tabId) {
  const cur = createMenuState(state);
  if (!VALID_MAIN_TABS.has(tabId)) return cur;
  return {
    ...cur,
    mainTab: tabId,
    rebindingAction: null,
  };
}

/**
 * Switch settings sub-tab (used inside both MAIN_MENU settings and PAUSED settings).
 */
export function selectSettingsTab(state, tabId) {
  const cur = createMenuState(state);
  if (!VALID_SETTINGS_TABS.has(tabId)) return cur;
  return {
    ...cur,
    settingsTab: tabId,
    rebindingAction: null,
  };
}

/**
 * Enter PAUSED screen directly on a requested pause sub-view.
 */
export function openPauseView(state, viewId = PAUSE_VIEWS.HUB) {
  const cur = createMenuState(state);
  const pauseView = VALID_PAUSE_VIEWS.has(viewId) ? viewId : PAUSE_VIEWS.HUB;
  return {
    ...cur,
    screen: APP_SCREENS.PAUSED,
    pauseView,
    rebindingAction: null,
  };
}

/**
 * Transition from menu into active battle HUD / controls.
 */
export function startSortieTransition(state) {
  const cur = createMenuState(state);
  return {
    ...cur,
    screen: APP_SCREENS.IN_GAME,
    pauseView: PAUSE_VIEWS.HUB,
    rebindingAction: null,
  };
}

/**
 * Transition from active battle into POST_MATCH result screen (Phase B Task 4 / Task 5).
 */
export function finishSortieTransition(state, matchSummary = null) {
  const cur = createMenuState(state);
  return {
    ...cur,
    screen: APP_SCREENS.POST_MATCH,
    pauseView: PAUSE_VIEWS.HUB,
    rebindingAction: null,
    lastMatchSummary: matchSummary && typeof matchSummary === 'object' ? { ...matchSummary } : cur.lastMatchSummary,
  };
}

/**
 * Retreat from combat/pause/post-match back into the 3D Main Menu on the requested tab.
 */
export function returnToMainMenuTransition(state, tabId = 'home') {
  const cur = createMenuState(state);
  const mainTab = VALID_MAIN_TABS.has(tabId) ? tabId : 'home';
  return {
    ...cur,
    screen: APP_SCREENS.MAIN_MENU,
    mainTab,
    pauseView: PAUSE_VIEWS.HUB,
    rebindingAction: null,
  };
}

/**
 * Mark an action as actively listening for a replacement key code.
 */
export function beginRebindTransition(state, actionId) {
  const cur = createMenuState(state);
  if (typeof actionId !== 'string' || !actionId) return cur;
  return {
    ...cur,
    rebindingAction: actionId,
  };
}

/**
 * Clear pending key rebinding state cleanly.
 */
export function clearRebindTransition(state) {
  const cur = createMenuState(state);
  return {
    ...cur,
    rebindingAction: null,
  };
}

/**
 * Deterministic 5-tier Escape back-stack handler:
 * 1. Rebinding active -> cancel rebind only
 * 2. Open Modal -> close modal
 * 3. Open Tactical Select dropdown -> close select
 * 4. IN_GAME -> open PAUSED hub
 * 5. PAUSED non-hub -> back to PAUSED hub; PAUSED hub -> resume IN_GAME
 * 6. MAIN_MENU non-sortie tab -> back to sortie tab; sortie -> NOOP
 */
export function handleEscapeNavigation(state, opts = {}) {
  const cur = createMenuState(state);
  const hasOpenModal = Boolean(opts?.hasOpenModal);
  const hasOpenSelect = Boolean(opts?.hasOpenSelect);

  if (cur.rebindingAction !== null) {
    return {
      state: { ...cur, rebindingAction: null },
      action: 'CANCEL_REBIND',
    };
  }

  if (hasOpenModal) {
    return { state: cur, action: 'CLOSE_MODAL' };
  }

  if (hasOpenSelect) {
    return { state: cur, action: 'CLOSE_SELECT' };
  }

  if (cur.screen === APP_SCREENS.IN_GAME) {
    return {
      state: { ...cur, screen: APP_SCREENS.PAUSED, pauseView: PAUSE_VIEWS.HUB },
      action: 'OPEN_PAUSE_HUB',
    };
  }

  if (cur.screen === APP_SCREENS.PAUSED) {
    if (cur.pauseView !== PAUSE_VIEWS.HUB) {
      return {
        state: { ...cur, pauseView: PAUSE_VIEWS.HUB },
        action: 'BACK_TO_PAUSE_HUB',
      };
    }
    return {
      state: { ...cur, screen: APP_SCREENS.IN_GAME, pauseView: PAUSE_VIEWS.HUB },
      action: 'RESUME_GAME',
    };
  }

  if (cur.screen === APP_SCREENS.MAIN_MENU) {
    if (cur.mainTab === 'sortie' && cur.sortieStep !== SORTIE_STEPS.MODE) {
      return {
        state: { ...cur, sortieStep: SORTIE_STEPS.MODE },
        action: 'BACK_TO_SORTIE_MODE',
      };
    }
    if (cur.mainTab !== 'home') {
      return {
        state: { ...cur, mainTab: 'home', sortieStep: SORTIE_STEPS.MODE },
        action: 'BACK_TO_HOME_TAB',
      };
    }
    return {
      state: cur,
      action: 'NOOP',
    };
  }

  if (cur.screen === APP_SCREENS.POST_MATCH) {
    return {
      state: cur,
      action: 'NOOP',
    };
  }

  return { state: cur, action: 'NOOP' };
}

/**
 * Compute 3D hero showcase camera framing parameters per MAIN_MENU tab.
 */
export function resolveMenuCameraRig(state) {
  const cur = createMenuState(state);
  if (cur.screen !== APP_SCREENS.MAIN_MENU) {
    return {
      active: false,
      orbitYawOffset: 0,
      orbitPitch: 0,
      orbitDistance: 0,
      targetHeightOffset: 0,
      autoRotateSpeed: 0,
      stageBias: 0,
    };
  }
  const baseRig = MENU_CAMERA_RIGS[cur.mainTab] || MENU_CAMERA_RIGS.home;
  if (cur.mainTab === 'paint' && cur.activePaintZone && cur.activePaintZone !== 'all') {
    const focus = PAINT_ZONE_CAMERA_FOCUS[cur.activePaintZone];
    if (focus) return { active: true, stageBias: 0, ...focus };
  }
  if (cur.mainTab === 'armory' && cur.activeArmorySlot && ARMORY_SLOT_CAMERA_FOCUS[cur.activeArmorySlot]) {
    return { active: true, stageBias: 0, ...ARMORY_SLOT_CAMERA_FOCUS[cur.activeArmorySlot] };
  }
  return { ...baseRig };
}
