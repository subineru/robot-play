/**
 * 3-Tier 8-Mecha-Skin Catalog & 5-Channel DIY Palette Resolver (Layer 0/1 Shared Pure Logic).
 * SSOT: MASTER_SPEC.md [M5.3, M5.5]
 */

export const PAINT_ZONES = Object.freeze([
  Object.freeze({ id: 'all', label: '全機統一塗裝 (ALL UNITS)', shortLabel: '全機統一' }),
  Object.freeze({ id: 'head', label: '頭部裝甲＆感測器 (HEAD)', shortLabel: '頭部' }),
  Object.freeze({ id: 'torso', label: '胸腰核心裝甲 (TORSO)', shortLabel: '胸腰' }),
  Object.freeze({ id: 'arm_l', label: '左肩＆左手臂 (LEFT ARM)', shortLabel: '左肩臂' }),
  Object.freeze({ id: 'arm_r', label: '右肩＆右手臂 (RIGHT ARM)', shortLabel: '右肩臂' }),
  Object.freeze({ id: 'legs', label: '雙腿＆戰靴 (LEGS)', shortLabel: '雙腿足' }),
  Object.freeze({ id: 'backpack', label: '背包＆推進飛翼 (BACKPACK)', shortLabel: '背包飛翼' }),
  Object.freeze({ id: 'weapons', label: '手持槍械＆光劍 (WEAPONS)', shortLabel: '槍械光劍' }),
  Object.freeze({ id: 'shields', label: '防禦護盾外甲 (SHIELDS)', shortLabel: '防禦護盾' }),
]);

const VALID_ZONE_IDS = new Set(PAINT_ZONES.map((z) => z.id));

export const PAINT_FINISHES = Object.freeze([
  Object.freeze({ id: 'standard', label: '標準機甲烤漆 (Standard)', priceMc: 0, metallic: 0.72, roughness: 0.34 }),
  Object.freeze({ id: 'matte', label: '消光軍規漆 (Matte Recon)', priceMc: 0, metallic: 0.28, roughness: 0.74 }),
  Object.freeze({ id: 'carbon', label: '編織碳纖維 (Carbon Weave)', priceMc: 450, metallic: 0.55, roughness: 0.42 }),
  Object.freeze({ id: 'glossy', label: '王牌深紅高光漆 (Glossy)', priceMc: 650, metallic: 0.85, roughness: 0.18 }),
  Object.freeze({ id: 'hazard', label: '重工警戒斜紋 (Hazard Stripe)', priceMc: 750, metallic: 0.58, roughness: 0.44 }),
  Object.freeze({ id: 'digital_camo', label: '都市數位迷彩 (Digital Camo)', priceMc: 950, metallic: 0.48, roughness: 0.52 }),
  Object.freeze({ id: 'weathered', label: '百戰舊化戰損 (Weathered)', priceMc: 1200, metallic: 0.70, roughness: 0.56 }),
  Object.freeze({ id: 'chrome', label: '極限鏡面電鍍 (Solari Chrome)', priceMc: 2200, metallic: 0.96, roughness: 0.12 }),
]);

const RAW_MECHA_SKINS = [
  Object.freeze({
    id: 'SKIN-01',
    name: 'EF-018 聯邦標準鋼灰',
    shortName: 'Steel Standard',
    tier: 1,
    unlockCostMc: 0,
    unlockDesc: '初始免費配給',
    shaderFinish: 'standard',
    metallic: 0.72,
    roughness: 0.34,
    primary: '#c9d4e0',
    secondary: '#3c5e88',
    frame: '#1f2630',
    sensor: '#00f2ff',
    thruster: '#22aaff',
    saber: '#55f6ff',
  }),
  Object.freeze({
    id: 'SKIN-02',
    name: '砂漠風暴',
    shortName: 'Desert Recon',
    tier: 1,
    unlockCostMc: 450,
    unlockDesc: '450 MC',
    shaderFinish: 'matte',
    metallic: 0.28,
    roughness: 0.74,
    primary: '#d4be8e',
    secondary: '#52623c',
    frame: '#23201c',
    sensor: '#ffaa22',
    thruster: '#ff7711',
    saber: '#ffaa33',
  }),
  Object.freeze({
    id: 'SKIN-03',
    name: '深夜匿蹤',
    shortName: 'Stealth Carbon',
    tier: 1,
    unlockCostMc: 900,
    unlockDesc: '900 MC',
    shaderFinish: 'carbon',
    metallic: 0.55,
    roughness: 0.42,
    primary: '#262b38',
    secondary: '#3d335c',
    frame: '#13161c',
    sensor: '#c060ff',
    thruster: '#9944ff',
    saber: '#cf7dff',
  }),
  Object.freeze({
    id: 'SKIN-04',
    name: '赤色彗星',
    shortName: 'Crimson Comet',
    tier: 2,
    unlockCostMc: 1600,
    unlockDesc: '累計擊破 10 台機甲 或 1,600 MC',
    shaderFinish: 'glossy',
    metallic: 0.85,
    roughness: 0.18,
    primary: '#c82832',
    secondary: '#6a121b',
    frame: '#7d8896',
    sensor: '#ffea66',
    thruster: '#ff4433',
    saber: '#ff3355',
  }),
  Object.freeze({
    id: 'SKIN-05',
    name: '重工警戒',
    shortName: 'Hazard Proto',
    tier: 2,
    unlockCostMc: 1800,
    unlockDesc: '拆毀 50 棟建築',
    shaderFinish: 'hazard',
    metallic: 0.58,
    roughness: 0.44,
    primary: '#e6b422',
    secondary: '#d96418',
    frame: '#1e2228',
    sensor: '#22ddff',
    thruster: '#33bbff',
    saber: '#38e8ff',
  }),
  Object.freeze({
    id: 'SKIN-06',
    name: '新東京數位迷彩',
    shortName: 'Urban Camo',
    tier: 2,
    unlockCostMc: 2000,
    unlockDesc: '單場 A 級以上或 3 連勝',
    shaderFinish: 'digital_camo',
    metallic: 0.48,
    roughness: 0.52,
    primary: '#8e98a6',
    secondary: '#1fb6c8',
    frame: '#262d36',
    sensor: '#72fbff',
    thruster: '#00d9ff',
    saber: '#6af7ff',
  }),
  Object.freeze({
    id: 'SKIN-07',
    name: '百戰歷練戰損',
    shortName: 'Veteran Scar',
    tier: 3,
    unlockCostMc: 3500,
    unlockDesc: '觸發 10 次完美彈反',
    shaderFinish: 'weathered',
    metallic: 0.70,
    roughness: 0.56,
    primary: '#b9c0c8',
    secondary: '#4d5560',
    frame: '#72543e',
    sensor: '#ff7033',
    thruster: '#ff8844',
    saber: '#ffe6b0',
  }),
  Object.freeze({
    id: 'SKIN-08',
    name: '炙金白金王牌',
    shortName: 'Solaris Ace',
    tier: 3,
    unlockCostMc: 6500,
    unlockDesc: '6,500 MC 或支持者榮譽',
    shaderFinish: 'chrome',
    metallic: 0.96,
    roughness: 0.12,
    primary: '#eef3f9',
    secondary: '#e5b842',
    frame: '#8f98a6',
    sensor: '#fff2a6',
    thruster: '#ffd54f',
    saber: '#ffe77a',
  }),
];

export const MECHA_SKINS = Object.freeze(
  RAW_MECHA_SKINS.map((s) =>
    Object.freeze({
      ...s,
      status: s.unlockCostMc === 0 ? 'playable' : 'purchasable_locked',
      priceMc: s.unlockCostMc,
      achievementUnlock: s.unlockDesc,
    }),
  ),
);

export function getSkinById(skinId) {
  return MECHA_SKINS.find((s) => s.id === skinId) || MECHA_SKINS[0];
}

function clampUnit(val, lo, hi, fallback) {
  const n = Number(val);
  return Number.isFinite(n) ? Math.max(lo, Math.min(hi, n)) : fallback;
}

/**
 * Create a structured multi-zone custom paint state (supporting L/R arm symmetry + 9 independent zones).
 */
export function createCustomPaintState(overrides = null) {
  const src = overrides && typeof overrides === 'object' ? overrides : {};
  const isStructured = 'global' in src || 'zones' in src || 'mirrorArms' in src;
  const globalSrc = isStructured ? (src.global || {}) : src;
  const zonesOut = {};
  if (isStructured && src.zones && typeof src.zones === 'object') {
    for (const [zid, patch] of Object.entries(src.zones)) {
      if (VALID_ZONE_IDS.has(zid) && patch && typeof patch === 'object') {
        zonesOut[zid] = { ...patch };
      }
    }
  }
  return {
    mirrorArms: src.mirrorArms !== false,
    global: { ...globalSrc },
    zones: zonesOut,
  };
}

/**
 * Immutably apply a color/finish patch to a specific zone (respecting L/R arm mirror lock).
 */
export function updateZonePaint(paintState, zoneId = 'all', patch = {}) {
  const cur = createCustomPaintState(paintState);
  const safeZone = VALID_ZONE_IDS.has(zoneId) ? zoneId : 'all';
  if (safeZone === 'all') {
    return {
      ...cur,
      global: { ...cur.global, ...patch },
    };
  }
  const nextZones = { ...cur.zones };
  nextZones[safeZone] = { ...(nextZones[safeZone] || {}), ...patch };
  if (cur.mirrorArms && (safeZone === 'arm_l' || safeZone === 'arm_r')) {
    const mirrorTarget = safeZone === 'arm_l' ? 'arm_r' : 'arm_l';
    nextZones[mirrorTarget] = { ...(nextZones[mirrorTarget] || {}), ...patch };
  }
  return {
    ...cur,
    zones: nextZones,
  };
}

/**
 * Resolve effective palette for the full mecha (`'all'`) or a specific anatomical/weapon/shield zone.
 */
export function resolveEffectivePalette(skinId = 'SKIN-01', customPalette = null, zoneId = 'all') {
  const base = getSkinById(skinId);
  if (!customPalette) {
    return { ...base };
  }
  const isStructured = 'global' in customPalette || 'zones' in customPalette || 'mirrorArms' in customPalette;
  const g = isStructured ? (customPalette.global || {}) : customPalette;
  const z = isStructured && zoneId !== 'all' ? (customPalette.zones?.[zoneId] || {}) : {};
  const merged = { ...base };
  for (const field of ['primary', 'secondary', 'frame', 'sensor', 'thruster', 'saber', 'shaderFinish']) {
    if (z[field] || g[field]) {
      merged[field] = z[field] || g[field];
    }
  }
  merged.metallic = clampUnit(z.metallic ?? g.metallic, 0.05, 0.98, base.metallic);
  merged.roughness = clampUnit(z.roughness ?? g.roughness, 0.08, 0.95, base.roughness);
  return merged;
}

/**
 * Resolve URLs for Cycles-baked VALIANT 3.0 Tangent Normal & RGBA Control Mask maps.
 */
export function getValiantBakedTextureUrls() {
  return {
    normalUrl: new URL('../../assets/mechas/ef018_valiant/valiant_mk2_normal.png', import.meta.url).href,
    maskUrl: new URL('../../assets/mechas/ef018_valiant/valiant_mk2_mask.png', import.meta.url).href,
  };
}

/**
 * GLSL snippets for MeshStandardMaterial.onBeforeCompile injecting Cycles RGBA Control Mask
 * (`R`: Material Role, `G`: Raytraced AO, `B`: Edge Curvature, `A`: Micro Glow/Caution Mask).
 */
export function buildValiantControlMaskShaderPatch() {
  return {
    vertDecl: 'varying vec2 vValiantUv;\n',
    vertUvAssign: 'vValiantUv = uv;\n',
    uniformDecl: [
      'uniform sampler2D uValiantMask;',
      'uniform float uHasValiantMask;',
      'uniform float uFinishMode;',
      'uniform vec3 uWearColor;',
      'varying vec2 vValiantUv;',
    ].join('\n') + '\n',
    fragDiffuse: `
      if (uHasValiantMask > 0.5) {
        vec4 vm = texture2D(uValiantMask, vValiantUv);
        float valiantAo = mix(0.58, 1.0, clamp(vm.g, 0.0, 1.0));
        float valiantEdge = clamp(vm.b, 0.0, 1.0);
        diffuseColor.rgb *= valiantAo;
        if (uFinishMode > 0.5 && uFinishMode < 1.5) {
          float isEmissiveOrDecal = step(0.85, vm.r);
          float chip = smoothstep(0.52, 0.84, valiantEdge) * (1.0 - isEmissiveOrDecal);
          diffuseColor.rgb = mix(diffuseColor.rgb, uWearColor, chip * 0.62);
        } else if (uFinishMode >= 1.5) {
          diffuseColor.rgb += vec3(0.08, 0.10, 0.12) * smoothstep(0.55, 0.90, valiantEdge);
        }
      }
    `,
    fragRoughness: `
      if (uHasValiantMask > 0.5) {
        vec4 vmR = texture2D(uValiantMask, vValiantUv);
        float valiantEdge = clamp(vmR.b, 0.0, 1.0);
        float creviceGrime = (1.0 - clamp(vmR.g, 0.0, 1.0)) * 0.24;
        roughnessFactor = clamp(roughnessFactor + creviceGrime, 0.06, 0.98);
        if (uFinishMode > 0.5 && uFinishMode < 1.5) {
          roughnessFactor = mix(roughnessFactor, 0.28, smoothstep(0.54, 0.86, valiantEdge) * 0.7);
        } else if (uFinishMode >= 1.5) {
          roughnessFactor = mix(roughnessFactor, 0.07, smoothstep(0.50, 0.88, valiantEdge) * 0.85);
        }
      }
    `,
    fragMetalness: `
      if (uHasValiantMask > 0.5 && uFinishMode > 0.5 && uFinishMode < 1.5) {
        float valiantEdgeM = clamp(texture2D(uValiantMask, vValiantUv).b, 0.0, 1.0);
        metalnessFactor = clamp(mix(metalnessFactor, 0.92, smoothstep(0.55, 0.88, valiantEdgeM) * 0.72), 0.0, 1.0);
      }
    `,
  };
}

export const MILITARY_PAINT_SWATCHES = Object.freeze([
  Object.freeze({ id: 'sw_titanium', name: '聯邦鈦白', hex: '#D8E0EA', group: 'armor' }),
  Object.freeze({ id: 'sw_steel', name: '冷冽鋼銀', hex: '#92A6BD', group: 'armor' }),
  Object.freeze({ id: 'sw_gunmetal', name: '重砲鐵灰', hex: '#3A4758', group: 'armor' }),
  Object.freeze({ id: 'sw_obsidian', name: '深石板曜黑', hex: '#141B26', group: 'frame' }),
  Object.freeze({ id: 'sw_aegis_navy', name: '神盾艦藍', hex: '#223A5E', group: 'armor' }),
  Object.freeze({ id: 'sw_cobalt', name: '聯邦鈷藍', hex: '#3C5E88', group: 'armor' }),
  Object.freeze({ id: 'sw_olive', name: '機甲軍綠', hex: '#4B5B3B', group: 'tactical' }),
  Object.freeze({ id: 'sw_sand', name: '砂漠土黃', hex: '#C7B07B', group: 'tactical' }),
  Object.freeze({ id: 'sw_amber', name: '警戒琥珀', hex: '#FF8A2B', group: 'signal' }),
  Object.freeze({ id: 'sw_crimson', name: '赤紅突擊', hex: '#C8283B', group: 'signal' }),
  Object.freeze({ id: 'sw_brass', name: '消光銅金', hex: '#D9AE54', group: 'metallic' }),
  Object.freeze({ id: 'sw_graphite', name: '碳纖石墨', hex: '#252B36', group: 'frame' }),
  Object.freeze({ id: 'sw_cyan_optics', name: '監視電青', hex: '#55F6FF', group: 'emissive' }),
  Object.freeze({ id: 'sw_plasma_blue', name: '電漿蒼藍', hex: '#22AAFF', group: 'emissive' }),
  Object.freeze({ id: 'sw_emerald', name: '量子翠綠', hex: '#34D399', group: 'emissive' }),
  Object.freeze({ id: 'sw_violet', name: '米諾夫紫', hex: '#A855F7', group: 'emissive' }),
]);

/**
 * Convert #RRGGBB hex into normalized integer { h: 0..360, s: 0..100, l: 0..100 }.
 */
export function hexToHsl(hex) {
  const clean = typeof hex === 'string' ? hex.trim().replace(/^#/, '') : '';
  const norm = clean.length === 3 ? clean.split('').map((c) => c + c).join('') : clean;
  if (!/^[0-9A-Fa-f]{6}$/.test(norm)) {
    return { h: 210, s: 25, l: 55 };
  }
  const r = parseInt(norm.slice(0, 2), 16) / 255;
  const g = parseInt(norm.slice(2, 4), 16) / 255;
  const b = parseInt(norm.slice(4, 6), 16) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  let h = 0;
  let s = 0;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
    else if (max === g) h = ((b - r) / d + 2) / 6;
    else h = ((r - g) / d + 4) / 6;
  }
  return {
    h: Math.round(h * 360),
    s: Math.round(s * 100),
    l: Math.round(l * 100),
  };
}

/**
 * Convert { h: 0..360, s: 0..100, l: 0..100 } into uppercase #RRGGBB hex string.
 */
export function hslToHex(h, s, l) {
  const hue = (((Number(h) || 0) % 360) + 360) % 360 / 360;
  const sat = Math.min(100, Math.max(0, Number(s) || 0)) / 100;
  const lig = Math.min(100, Math.max(0, Number(l) || 0)) / 100;

  let r = lig;
  let g = lig;
  let b = lig;
  if (sat > 0) {
    const q = lig < 0.5 ? lig * (1 + sat) : lig + sat - lig * sat;
    const p = 2 * lig - q;
    const hue2rgb = (t) => {
      let tt = t;
      if (tt < 0) tt += 1;
      if (tt > 1) tt -= 1;
      if (tt < 1 / 6) return p + (q - p) * 6 * tt;
      if (tt < 1 / 2) return q;
      if (tt < 2 / 3) return p + (q - p) * (2 / 3 - tt) * 6;
      return p;
    };
    r = hue2rgb(hue + 1 / 3);
    g = hue2rgb(hue);
    b = hue2rgb(hue - 1 / 3);
  }
  const toHex = (c) => Math.round(c * 255).toString(16).padStart(2, '0').toUpperCase();
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}
