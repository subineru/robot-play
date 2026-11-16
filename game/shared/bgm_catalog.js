/**
 * Extensible BGM Track Catalog & Context Resolver (Layer 0 Pure ES Module - Zero DOM, Zero THREE).
 *
 * Supports both built-in adaptive Web Audio synthesizer scores (`type: 'synth'`)
 * and drop-in external studio audio files (`type: 'file'`, `.ogg` / `.mp3` / `.wav`).
 *
 * To add an external music file later:
 * 1. Drop the audio file under `assets/audio/bgm/` (e.g. `my_boss_theme.ogg`).
 * 2. Append an entry below or call `registry.registerTrack(...)` with:
 *    `{ id: 'my_boss', context: 'combat', type: 'file', url: 'my_boss_theme.ogg', bpm: 140, label: '...' }`
 */

export const BGM_CONTEXTS = Object.freeze({
  MENU: 'menu',
  COMBAT: 'combat',
});

export const BGM_TRACK_OFF = 'off';
export const BGM_COMBAT_AUTO = 'auto';

export const DEFAULT_BGM_SETTINGS = Object.freeze({
  menuTrack: 'hangar_protocol',
  combatTrack: BGM_COMBAT_AUTO,
});

export const BUILT_IN_BGM_TRACKS = Object.freeze([
  Object.freeze({
    id: 'hangar_protocol',
    context: BGM_CONTEXTS.MENU,
    type: 'synth',
    synthScoreId: 'hangar_protocol',
    bpm: 92,
    musicalKey: 'D Minor',
    label: 'EF-018 整備協議 (92 BPM)',
    subLabel: 'Armored Hangar · 冷調機械脈衝＋深沉類比和弦墊音',
    loopSeconds: null,
  }),
  Object.freeze({
    id: 'orbital_standby',
    context: BGM_CONTEXTS.MENU,
    type: 'synth',
    synthScoreId: 'orbital_standby',
    bpm: 84,
    musicalKey: 'F# Minor',
    label: '軌道衛星待機 (84 BPM)',
    subLabel: 'Orbital Telemetry · 極簡深空感應合成＋脈動琶音',
    loopSeconds: null,
  }),
  Object.freeze({
    id: 'steel_velocity',
    context: BGM_CONTEXTS.COMBAT,
    type: 'synth',
    synthScoreId: 'steel_velocity',
    bpm: 136,
    musicalKey: 'D Minor',
    label: '鋼鐵突進線 (136 BPM)',
    subLabel: 'Urban Skirmish · 16 分推進貝斯＋ACS 高張力解放主旋律',
    loopSeconds: null,
  }),
  Object.freeze({
    id: 'crimson_overdrive',
    context: BGM_CONTEXTS.COMBAT,
    type: 'synth',
    synthScoreId: 'crimson_overdrive',
    bpm: 142,
    musicalKey: 'C Minor',
    label: '赤紅過載警報 (142 BPM)',
    subLabel: 'Duel Overdrive · 工業失真貝斯＋雙切分軍鼓與金屬過門',
    loopSeconds: null,
  }),
]);

function normalizeTrackEntry(raw) {
  if (!raw || typeof raw !== 'object') {
    throw new Error('BGM track entry must be an object.');
  }
  const id = typeof raw.id === 'string' ? raw.id.trim() : '';
  if (!id || id === BGM_TRACK_OFF || id === BGM_COMBAT_AUTO) {
    throw new Error(`Invalid BGM track id "${raw.id}".`);
  }
  const context = raw.context === BGM_CONTEXTS.MENU ? BGM_CONTEXTS.MENU : raw.context === BGM_CONTEXTS.COMBAT ? BGM_CONTEXTS.COMBAT : '';
  if (!context) {
    throw new Error(`BGM track "${id}" requires context 'menu' or 'combat'.`);
  }
  const type = raw.type === 'file' ? 'file' : raw.type === 'synth' ? 'synth' : '';
  if (!type) {
    throw new Error(`BGM track "${id}" requires type 'synth' or 'file'.`);
  }
  if (type === 'file' && (typeof raw.url !== 'string' || !raw.url.trim())) {
    throw new Error(`File BGM track "${id}" requires a non-empty url.`);
  }
  const bpmNum = Number(raw.bpm);
  return Object.freeze({
    id,
    context,
    type,
    synthScoreId: type === 'synth' ? String(raw.synthScoreId || id) : null,
    url: type === 'file' ? raw.url.trim() : null,
    bpm: Number.isFinite(bpmNum) && bpmNum > 20 ? bpmNum : 120,
    musicalKey: typeof raw.musicalKey === 'string' && raw.musicalKey.trim() ? raw.musicalKey.trim() : 'Custom',
    label: typeof raw.label === 'string' && raw.label.trim() ? raw.label.trim() : id,
    subLabel: typeof raw.subLabel === 'string' ? raw.subLabel.trim() : '',
    isCustom: Boolean(raw.isCustom),
  });
}

export function createBgmRegistry(initialExtraTracks = []) {
  const trackMap = new Map();

  const registerTrack = (raw) => {
    const entry = normalizeTrackEntry(raw);
    trackMap.set(entry.id, entry);
    return entry;
  };

  for (const base of BUILT_IN_BGM_TRACKS) {
    registerTrack(base);
  }
  if (Array.isArray(initialExtraTracks)) {
    for (const extra of initialExtraTracks) {
      registerTrack(extra);
    }
  }

  const getTrack = (id) => {
    if (!id || typeof id !== 'string') return null;
    return trackMap.get(id) || null;
  };

  const listTracks = (context = null) => {
    const all = [...trackMap.values()];
    if (!context) return all;
    return all.filter((t) => t.context === context);
  };

  const pickAutoCombatTrackId = ({ modeId = 'duel_1v1', mapId = 'neo_tokyo' } = {}) => {
    if (modeId === 'duel' || modeId === 'duel_1v1' || mapId === 'caldera_rift' || mapId === 'sector_09') {
      return trackMap.has('crimson_overdrive') ? 'crimson_overdrive' : 'steel_velocity';
    }
    return trackMap.has('steel_velocity') ? 'steel_velocity' : listTracks(BGM_CONTEXTS.COMBAT)[0]?.id || BGM_TRACK_OFF;
  };

  const sanitizeMusicSelection = (selection = {}) => {
    const rawMenu = selection?.menuTrack;
    const rawCombat = selection?.combatTrack;

    let menuTrack = DEFAULT_BGM_SETTINGS.menuTrack;
    if (rawMenu === BGM_TRACK_OFF) {
      menuTrack = BGM_TRACK_OFF;
    } else if (
      typeof rawMenu === 'string' &&
      (trackMap.get(rawMenu)?.context === BGM_CONTEXTS.MENU || rawMenu.startsWith('local_') || rawMenu.startsWith('custom_'))
    ) {
      menuTrack = rawMenu;
    }

    let combatTrack = DEFAULT_BGM_SETTINGS.combatTrack;
    if (rawCombat === BGM_TRACK_OFF || rawCombat === BGM_COMBAT_AUTO) {
      combatTrack = rawCombat;
    } else if (
      typeof rawCombat === 'string' &&
      (trackMap.get(rawCombat)?.context === BGM_CONTEXTS.COMBAT || rawCombat.startsWith('local_') || rawCombat.startsWith('custom_'))
    ) {
      combatTrack = rawCombat;
    }

    return { menuTrack, combatTrack };
  };

  const resolveDesiredTrack = ({
    screen = 'MAIN_MENU',
    modeId = 'sandbox',
    mapId = 'MAP-01',
    menuTrack = DEFAULT_BGM_SETTINGS.menuTrack,
    combatTrack = DEFAULT_BGM_SETTINGS.combatTrack,
  } = {}) => {
    const isMenu = screen === 'MAIN_MENU';
    const context = isMenu ? BGM_CONTEXTS.MENU : BGM_CONTEXTS.COMBAT;
    const requested = isMenu ? menuTrack : combatTrack;

    if (requested === BGM_TRACK_OFF) {
      return { context, trackId: BGM_TRACK_OFF, track: null };
    }

    let resolvedId = requested;
    if (!isMenu && (!resolvedId || resolvedId === BGM_COMBAT_AUTO)) {
      resolvedId = pickAutoCombatTrackId({ modeId, mapId });
    }

    let track = trackMap.get(resolvedId) || null;
    if (!track || track.context !== context) {
      const fallbackId = isMenu ? DEFAULT_BGM_SETTINGS.menuTrack : pickAutoCombatTrackId({ modeId, mapId });
      track = trackMap.get(fallbackId) || listTracks(context)[0] || null;
      resolvedId = track ? track.id : BGM_TRACK_OFF;
    }

    return { context, trackId: resolvedId, track };
  };

  return {
    registerTrack,
    getTrack,
    listTracks,
    pickAutoCombatTrackId,
    sanitizeMusicSelection,
    resolveDesiredTrack,
  };
}
