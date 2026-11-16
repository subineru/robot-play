/**
 * PLAY_ROBOTS Pure Data-Driven Catalog & Balance Config Registry (Clean Architecture Layer)
 * SSOT: MASTER_SPEC.md v2.5.0 ([M0], [M1], [M5.6], Section 9)
 * Zero external dependencies (safe for Browser ES Modules, Node.js SimCore/Server, and Admin Config Patching).
 */

export const INITIAL_CATALOG_VERSION = '2026.11.14-v2';

export const LOCK_STATES = Object.freeze({
  PLAYABLE: 'playable',
  PURCHASABLE_LOCKED: 'purchasable_locked',
  BLUEPRINT_LOCKED: 'blueprint_locked',
});

export const SHIELD_IDS = Object.freeze([
  'EF-SH01',
  'EF-SH03',
  'EF-HS07',
  'EF-SH09',
]);

export const MAP_IDS = Object.freeze([
  'neo_tokyo',
  'emerald_forest',
  'sector_09',
  'orbital_elevator',
  'polar_radar',
  'caldera_rift',
]);

export const ACTOR_IDS = Object.freeze([
  'EF-018',
  'X-09',
  'TITAN-02',
  'ARC-04',
  'PSI-00',
]);

export const PILOT_IDS = Object.freeze([
  'PILOT-01',
  'PILOT-02',
  'PILOT-03',
  'PILOT-04',
]);

export const ARMOR_IDS = Object.freeze([
  'EF-AC01',
  'EF-AC02',
  'EF-AC03',
  'EF-AL01',
  'EF-AL02',
]);

export const MODE_IDS = Object.freeze([
  'sandbox',
  'duel_1v1',
  'ffa_4p',
  'online_pvp',
]);

export const WEAPON_IDS = Object.freeze([
  'EF-AR01',
  'EF-KM01',
  'EF-BS02',
  'EF-SG01',
  'EF-HC04',
  'EF-BP03',
  'EF-TB04',
  'EF-GT05',
  'EF-GS06',
  'EF-RL08',
]);

function deepFreeze(obj) {
  if (obj === null || typeof obj !== 'object') return obj;
  Object.freeze(obj);
  for (const key of Object.keys(obj)) {
    deepFreeze(obj[key]);
  }
  return obj;
}

export const BASE_CATALOG = deepFreeze({
  catalogVersion: INITIAL_CATALOG_VERSION,
  shields: {
    'EF-SH01': {
      id: 'EF-SH01',
      name: '脈衝格鬥圓盾',
      shortLabel: 'SH01 圓盾',
      codeName: 'Buckler',
      role: '近戰格鬥／24s 超長續航＋寬幅彈反',
      priceMc: 850,
      weightKg: 160,
      blockReduction: 0.58,
      solidBlockReduction: 0.58,
      noEnBlockReduction: 0.35,
      parryWindowSec: 0.28,
      parryKnockbackM: 5.5,
      guardWindupSec: 0.06,
      minHoldSec: 0.15,
      reRaiseDelaySec: 0.28,
      coverageMode: 'buckler_disc',
      barrierRadiusM: 0.62,
      domeRadiusM: 0.62,
      yawHalfDeg: 34,
      pitchHalfDeg: 34,
      diamondShape: false,
      centerWindowClear: false,
      maxDurationSec: 24.0,
      holdDrainPerSec: 4.16,
      cooldownSec: 1.2,
      impactDrainMult: 0.70,
      parrySpRefund: 15,
      isFullDome: false,
      boostLock: false,
      reflectsBeams: false,
      enDrainPerSec: 0,
      barrierColor: '#58f5ff',
      glbNode: 'Shield_EF_SH01_Buckler',
    },
    'EF-SH03': {
      id: 'EF-SH03',
      name: '窄塔矩形稜鏡盾',
      shortLabel: 'SH03 長方稜鏡',
      codeName: 'Valiant Prism Tower',
      role: '正面主力／15s 長方形反射稜鏡盾',
      priceMc: 0,
      weightKg: 380,
      blockReduction: 0.80,
      solidBlockReduction: 0.60,
      noEnBlockReduction: 0.42,
      parryWindowSec: 0.18,
      parryKnockbackM: 3.4,
      guardWindupSec: 0.10,
      minHoldSec: 0.18,
      reRaiseDelaySec: 0.40,
      coverageMode: 'rect_tower',
      barrierRadiusM: 0.95,
      domeRadiusM: 0.95,
      rectHalfW: 0.64,
      rectHalfH: 1.04,
      yawHalfDeg: 42,
      pitchHalfDeg: 52,
      diamondShape: false,
      centerWindowClear: true,
      maxDurationSec: 15.0,
      holdDrainPerSec: 6.67,
      cooldownSec: 1.8,
      impactDrainMult: 0.55,
      parrySpRefund: 10,
      isFullDome: false,
      boostLock: false,
      reflectsBeams: true,
      enDrainPerSec: 0,
      barrierColor: '#56ffe0',
      glbNode: 'Shield_EF_SH03_ValiantKite',
    },
    'EF-HS07': {
      id: 'EF-HS07',
      name: '雙翼展開半圓盾',
      shortLabel: 'HS07 雙翼半罩',
      codeName: 'Twin-Wing Half Dome',
      role: '大範圍覆蓋／9.5s 雙翼展開 180° 半罩',
      priceMc: 2000,
      weightKg: 460,
      blockReduction: 0.82,
      solidBlockReduction: 0.75,
      noEnBlockReduction: 0.50,
      parryWindowSec: 0.16,
      parryKnockbackM: 3.0,
      guardWindupSec: 0.12,
      minHoldSec: 0.22,
      reRaiseDelaySec: 0.55,
      coverageMode: 'hemisphere',
      barrierRadiusM: 1.38,
      domeRadiusM: 1.38,
      yawHalfDeg: 86,
      pitchHalfDeg: 74,
      diamondShape: false,
      centerWindowClear: true,
      maxDurationSec: 9.5,
      holdDrainPerSec: 10.5,
      cooldownSec: 2.4,
      impactDrainMult: 0.45,
      parrySpRefund: 8,
      isFullDome: false,
      boostLock: false,
      reflectsBeams: false,
      enDrainPerSec: 0,
      barrierColor: '#32e8ff',
      glbNode: 'Shield_EF_HS07_PrismMirror',
    },
    'EF-SH09': {
      id: 'EF-SH09',
      name: '神盾四翼軌道展開核',
      shortLabel: 'SH09 四翼360°',
      codeName: 'Aegis Quad Core',
      role: '全方位防禦／6.0s 四翼 360° 高負荷全罩',
      priceMc: 2800,
      weightKg: 780,
      blockReduction: 0.88,
      solidBlockReduction: 0.88,
      noEnBlockReduction: 0.58,
      parryWindowSec: 0.14,
      parryKnockbackM: 2.2,
      guardWindupSec: 0.18,
      minHoldSec: 0.28,
      reRaiseDelaySec: 0.80,
      coverageMode: 'full_sphere',
      barrierRadiusM: 2.10,
      domeRadiusM: 2.10,
      yawHalfDeg: 180,
      pitchHalfDeg: 90,
      diamondShape: false,
      centerWindowClear: false,
      maxDurationSec: 6.0,
      holdDrainPerSec: 16.6,
      cooldownSec: 3.8,
      impactDrainMult: 0.35,
      parrySpRefund: 6,
      isFullDome: true,
      boostLock: true,
      reflectsBeams: false,
      enDrainPerSec: 0,
      barrierColor: '#ffbe48',
      glbNode: 'Shield_EF_SH09_Bastion',
    },
  },
  weapons: {
    'EF-AR01': {
      id: 'EF-AR01',
      name: '高週波脈衝光束步槍',
      slot: 'R_HAND',
      category: 'rifle',
      status: 'playable',
      plannedTask: null,
      priceMc: 0,
      weightKg: 320,
      thrustBonusN: 0,
      damage: 42,
      rivalDamage: 185,
      acsImpact: 12,
      damageType: 'beam',
      fireMode: 'beam',
      resourceType: 'heat',
      heatPerShot: 11,
      coolPerSec: 40,
      overheatLockSec: 1.8,
      soundProfile: 'beam_rifle',
      vfxStyle: 'beam_pulse',
      cooldownSec: 0.17,
      projectileSpeedMps: 98,
      roleTag: '高溫電漿光束連射槍（累積熱量條 · 滿載過熱冷卻 1.8s）',
    },
    'EF-KM01': {
      id: 'EF-KM01',
      name: 'M-77 突擊實彈衝鋒機槍',
      slot: 'R_HAND',
      category: 'rifle',
      status: 'playable',
      plannedTask: null,
      priceMc: 0,
      weightKg: 340,
      thrustBonusN: 0,
      damage: 34,
      rivalDamage: 155,
      acsImpact: 10,
      damageType: 'bullet',
      fireMode: 'kinetic',
      resourceType: 'mag',
      magCapacity: 32,
      reloadSec: 1.3,
      soundProfile: 'kinetic_carbine',
      vfxStyle: 'kinetic_tracer',
      cooldownSec: 0.13,
      projectileSpeedMps: 108,
      roleTag: '實彈高射速卡賓機槍（32 發彈匣 · 按 R 或打空 1.3s 換彈）',
    },
    'EF-BS02': {
      id: 'EF-BS02',
      name: '高出力電漿光劍',
      slot: 'L_HAND',
      category: 'saber',
      status: 'playable',
      plannedTask: null,
      priceMc: 0,
      weightKg: 140,
      thrustBonusN: 0,
      damage: 240,
      rivalDamage: 880,
      acsImpact: 46,
      damageType: 'saber',
      cooldownSec: 0.44,
      shieldBreakMultiplier: 1.75,
      roleTag: '高爆盾倍率電漿近戰軍刀',
    },
    'EF-SG01': {
      id: 'EF-SG01',
      name: '超長型光束智慧長砲',
      slot: 'R_HAND',
      category: 'rifle',
      status: 'blueprint_locked',
      plannedTask: 'Task 9A',
      priceMc: 1200,
      weightKg: 680,
      thrustBonusN: 0,
      damage: 130,
      rivalDamage: 520,
      acsImpact: 36,
      damageType: 'beam',
      cooldownSec: 0.55,
      projectileSpeedMps: 118,
      roleTag: '預定於 Task 9A 開放實戰之遠距貫穿長砲',
    },
    'EF-BP03': {
      id: 'EF-BP03',
      name: 'Ex-S 側肩雙聯推進莢艙',
      slot: 'L_BACK',
      category: 'booster',
      status: 'playable',
      plannedTask: null,
      priceMc: 1600,
      weightKg: 1450,
      thrustBonusN: 380000,
      damage: 0,
      rivalDamage: 0,
      acsImpact: 0,
      enCost: 18,
      cooldownSec: 4.2,
      burstImpulseMps: 21,
      roleTag: '+380 kN 高機動推力補正 · [Q] 觸發 Overboost Surge 瞬推脈衝',
      specs: ['+380 kN 常駐推進力 (大幅拔升 TWR)', '[Q] Overboost Surge +21 m/s 瞬間突進', '耗能 18 EN · 冷卻 4.2s'],
    },
    'EF-RL08': {
      id: 'EF-RL08',
      name: '超長程磁軌狙擊巨砲',
      slot: 'L_BACK',
      category: 'cannon',
      status: 'playable',
      plannedTask: null,
      priceMc: 2600,
      weightKg: 890,
      thrustBonusN: 0,
      damage: 510,
      rivalDamage: 1350,
      buildingDamage: 140,
      acsImpact: 72,
      damageType: 'beam',
      fireMode: 'railgun',
      soundProfile: 'railgun_cannon',
      vfxStyle: 'railgun',
      enCost: 14,
      cooldownSec: 4.6,
      projectileSpeedMps: 150,
      roleTag: '150 m/s 零下墜電磁穿甲狙擊砲 · 高額 ACS 衝擊',
      specs: ['對機甲直擊 1,350 DMG / +72 ACS', '超高速 150 m/s 線軌貫穿破壞建築', '耗能 14 EN · 冷卻 4.6s'],
    },
    'EF-HC04': {
      id: 'EF-HC04',
      name: '肩載重型電磁巨砲',
      slot: 'R_BACK',
      category: 'cannon',
      status: 'playable',
      plannedTask: null,
      priceMc: 1400,
      weightKg: 820,
      thrustBonusN: 0,
      damage: 340,
      rivalDamage: 880,
      buildingDamage: 110,
      acsImpact: 54,
      damageType: 'blast',
      fireMode: 'cannon',
      soundProfile: 'heavy_cannon',
      vfxStyle: 'cannon',
      blastRadiusM: 2.8,
      enCost: 10,
      cooldownSec: 2.8,
      projectileSpeedMps: 84,
      roleTag: '實彈高爆重砲 · 命中引爆 2.8m 衝擊震波與拆樓重傷',
      specs: ['對機甲直擊 880 Blast DMG / +54 ACS', '2.8m 爆風半徑可同時打擊掩體後目標', '耗能 10 EN · 冷卻 2.8s'],
    },
    'EF-TB04': {
      id: 'EF-TB04',
      name: '穩定尾翼＋四聯導引微飛彈',
      slot: 'R_BACK',
      category: 'cannon',
      status: 'playable',
      plannedTask: null,
      priceMc: 1800,
      weightKg: 1200,
      thrustBonusN: 310000,
      damage: 95,
      rivalDamage: 245,
      buildingDamage: 48,
      acsImpact: 16,
      salvoCount: 4,
      damageType: 'blast',
      fireMode: 'missile',
      soundProfile: 'micro_missile',
      vfxStyle: 'missile',
      blastRadiusM: 1.5,
      enCost: 12,
      cooldownSec: 3.4,
      projectileSpeedMps: 56,
      roleTag: '+310 kN 推力補正 · [X] 齊射 4 枚微導引飛彈逼盾過熱',
      specs: ['4 聯裝弧線追踪飛彈 (單發 245 / 全中 980)', '+310 kN 常駐推進力抵銷機背載重', '耗能 12 EN · 冷卻 3.4s'],
    },
    'EF-GT05': {
      id: 'EF-GT05',
      name: '重型雙聯加特林機砲',
      slot: 'R_HAND',
      category: 'rifle',
      status: 'blueprint_locked',
      plannedTask: 'Task 8C',
      priceMc: 1800,
      weightKg: 760,
      thrustBonusN: 0,
      damage: 28,
      rivalDamage: 120,
      acsImpact: 9,
      damageType: 'bullet',
      cooldownSec: 0.09,
      projectileSpeedMps: 96,
      roleTag: '預定於 Task 8C 隨 TITAN-02 BRAWLER 實戰解鎖',
    },
    'EF-GS06': {
      id: 'EF-GS06',
      name: '超重型電漿破甲大劍',
      slot: 'L_HAND',
      category: 'saber',
      status: 'blueprint_locked',
      plannedTask: 'Task 8D',
      priceMc: 2200,
      weightKg: 540,
      thrustBonusN: 0,
      damage: 420,
      rivalDamage: 1250,
      acsImpact: 78,
      damageType: 'saber',
      cooldownSec: 0.72,
      shieldBreakMultiplier: 2.3,
      roleTag: '預定於 Task 8D 隨重裝近戰線實戰解鎖',
    },
  },
  actors: {
    // Phase E note: `actorType` ('mecha' | 'kaiju'), `hitVolumes[]`, and `cameraScale`
    // keep the entity abstraction extensible for future giant monster modes without activating them yet.
    'EF-018': {
      id: 'EF-018',
      codeName: 'VALIANT',
      name: 'EF-018 VALIANT Ex-S',
      role: '萬能均衡型・標準試作主角機',
      archetype: 'allrounder',
      actorType: 'mecha',
      status: 'playable',
      plannedTask: null,
      priceMc: 0,
      statBudgetCap: 375,
      stats: { speed: 75, firepower: 75, melee: 80, tech: 70, defense: 75 },
      maxAp: 10000,
      maxEn: 100,
      payloadCapKg: 1850,
      cameraScale: 1.0,
      groundFootprintM: 1.7,
      signatureWeapons: ['高週波脈衝步槍 / 智慧長砲', '電漿光束軍刀', '精密舉盾彈反'],
      defaultVariantId: 'mk2',
      variants: {
        mk1: {
          id: 'mk1',
          code: 'Mk.I',
          label: 'Mk.I 初代機',
          name: 'EF-018 VALIANT Mk.I Prototype',
          role: '初代原型機・冷鋼灰原型裝甲框架（無 Cycles 控制遮罩）',
          glbPath: 'assets/mechas/ef018_valiant/valiant_mk1.glb',
          hasBakedMasks: false,
        },
        mk2: {
          id: 'mk2',
          code: 'II',
          label: 'II 二代機',
          name: 'EF-018 VALIANT II Ex-S',
          role: '二代精雕實戰機・Titanium White ＋ 三片羽翼推進器 ＋ Cycles 烘焙法線遮罩',
          glbPath: 'assets/mechas/ef018_valiant/valiant_mk2.glb',
          hasBakedMasks: true,
        },
      },
      hitVolumes: [
        { id: 'body', offset: [0, 1.35, 0], radius: 0.85, height: 2.68, dmgMultiplier: 1.0 },
      ],
    },
    'X-09': {
      id: 'X-09',
      codeName: 'RAPTOR',
      name: 'X-09 RAPTOR',
      role: '極速近戰刺客・四段旋風連斬與量子瞬步',
      archetype: 'speed',
      actorType: 'mecha',
      status: 'blueprint_locked',
      plannedTask: 'Task 8A~8B',
      priceMc: 1800,
      statBudgetCap: 375,
      stats: { speed: 98, firepower: 55, melee: 95, tech: 75, defense: 45 },
      maxAp: 8600,
      maxEn: 120,
      payloadCapKg: 1250,
      cameraScale: 1.0,
      groundFootprintM: 1.55,
      signatureWeapons: ['雙持高頻電漿刃', '速射光束衝鋒槍', '量子瞬步 (Blink Step)'],
      hitVolumes: [
        { id: 'body', offset: [0, 1.32, 0], radius: 0.78, height: 2.58, dmgMultiplier: 1.0 },
      ],
    },
    'TITAN-02': {
      id: 'TITAN-02',
      codeName: 'BRAWLER',
      name: 'TITAN-02 BRAWLER',
      role: '重砲重裝格鬥・加特林壓制與突擊裝甲霸體',
      archetype: 'heavy',
      actorType: 'mecha',
      status: 'blueprint_locked',
      plannedTask: 'Task 8C~8D',
      priceMc: 4200,
      statBudgetCap: 375,
      stats: { speed: 52, firepower: 95, melee: 88, tech: 45, defense: 95 },
      maxAp: 14500,
      maxEn: 92,
      payloadCapKg: 3200,
      cameraScale: 1.08,
      groundFootprintM: 2.1,
      signatureWeapons: ['右臂重型加特林機砲', '爆熱熔岩打樁拳 + 6聯飛彈', '突擊裝甲霸體'],
      hitVolumes: [
        { id: 'body', offset: [0, 1.42, 0], radius: 0.98, height: 2.82, dmgMultiplier: 1.0 },
      ],
    },
    'ARC-04': {
      id: 'ARC-04',
      codeName: 'STRIDER',
      name: 'ARC-04 STRIDER',
      role: '精密技巧控場・貫穿磁軌狙擊與電磁鉤爪',
      archetype: 'technical',
      actorType: 'mecha',
      status: 'blueprint_locked',
      plannedTask: 'Task 9A',
      priceMc: 7500,
      statBudgetCap: 375,
      stats: { speed: 78, firepower: 82, melee: 57, tech: 98, defense: 60 },
      maxAp: 9400,
      maxEn: 108,
      payloadCapKg: 1750,
      cameraScale: 1.0,
      groundFootprintM: 1.65,
      signatureWeapons: ['超高速磁軌狙擊砲', '戰術電磁鉤爪擺盪', 'EMP 電磁停滯場'],
      hitVolumes: [
        { id: 'body', offset: [0, 1.35, 0], radius: 0.82, height: 2.66, dmgMultiplier: 1.0 },
      ],
    },
    'PSI-00': {
      id: 'PSI-00',
      codeName: 'MIRAGE',
      name: 'PSI-00 MIRAGE',
      role: '空間魔術浮游・四翼自律齊射與全息誘餌',
      archetype: 'magic',
      actorType: 'mecha',
      status: 'blueprint_locked',
      plannedTask: 'Task 9B',
      priceMc: 12800,
      statBudgetCap: 375,
      stats: { speed: 82, firepower: 85, melee: 61, tech: 92, defense: 55 },
      maxAp: 9000,
      maxEn: 118,
      payloadCapKg: 1500,
      cameraScale: 1.02,
      groundFootprintM: 1.65,
      signatureWeapons: ['誘導曲折光束槍', '4 枚自律浮游光束翼', '光學鏡像誘餌'],
      hitVolumes: [
        { id: 'body', offset: [0, 1.38, 0], radius: 0.82, height: 2.70, dmgMultiplier: 1.0 },
      ],
    },
  },
  phaseEKaijuPreview: {
    id: 'KAIJU-X',
    codeName: 'COLOSSUS-ZERO',
    name: 'Phase E 大型怪獸計畫',
    role: '機密保留位・多部位弱點 (`hitVolumes[]`) 與自動遠景鏡頭',
    actorType: 'kaiju',
    status: 'blueprint_locked',
    plannedTask: 'Phase E (待機凍結)',
    cameraScale: 2.2,
  },
  pilots: {
    'PILOT-01': {
      id: 'PILOT-01',
      callsign: 'RAVEN-01',
      name: 'KAI "RAVEN-01" REN',
      title: '第零測試中隊・基準試飛員',
      status: 'playable',
      plannedTask: null,
      priceMc: 0,
      achievementUnlock: '初始預設駕駛員',
      traitSummary: 'ACS 危險提示提早 +0.25s，無負面代價',
      traitPositive: 'ACS 敵方危機預警與鎖定警告 +0.25s',
      traitNegative: '無短板（全機體穩定基準線）',
      accentColor: '#56d4ff',
      secondaryColor: '#0e2238',
      visorStyle: 'tactical',
      squelchHz: 1480,
      voiceBankDir: null,
      radioSamples: ['系統全綠，出擊準備完畢！', '捕捉完美彈反窗口！'],
    },
    'PILOT-02': {
      id: 'PILOT-02',
      callsign: 'VOLT',
      name: 'LYRA "VOLT" VANCE',
      title: '低軌格鬥教官・極限反射派',
      status: 'blueprint_locked',
      plannedTask: 'Task 9C',
      priceMc: 1200,
      achievementUnlock: '累積觸發 15 次完美彈反 (Parry)',
      traitSummary: '彈反窗 +0.02s / 瞬噴微加速 (代價: 護盾回復延遲 +0.08s)',
      traitPositive: '完美彈反窗 +0.02s、Quick Boost 前搖 -8%',
      traitNegative: '收盾再生啟動延遲 +0.08s',
      accentColor: '#c084ff',
      secondaryColor: '#1e1036',
      visorStyle: 'interceptor',
      squelchHz: 1860,
      voiceBankDir: null,
      radioSamples: ['神經連接超頻，跟得上我嗎？', '正中靶心，再來一刀！'],
    },
    'PILOT-03': {
      id: 'PILOT-03',
      callsign: 'IRONCLAD',
      name: 'MARCUS "IRONCLAD" KNOX',
      title: '重工裝甲兵團・拆除專家',
      status: 'blueprint_locked',
      plannedTask: 'Task 9C',
      priceMc: 1400,
      achievementUnlock: '累計拆毀 40 棟建築或爆裂油槽',
      traitSummary: '負重懲罰 -20% / 拆樓 +15% EN (代價: 最高懸浮仰升 -6%)',
      traitPositive: '重武裝負重減速懲罰 -20%、拆樓額外回 +15% EN',
      traitNegative: '最高垂直懸浮仰升高度 -6%',
      accentColor: '#ffaa44',
      secondaryColor: '#2c180a',
      visorStyle: 'heavy',
      squelchHz: 940,
      voiceBankDir: null,
      radioSamples: ['全部裝甲就緒，準備開拆！', '建築清空，射界打開了！'],
    },
    'PILOT-04': {
      id: 'PILOT-04',
      callsign: 'PHANTOM',
      name: 'SORA "PHANTOM" KURODA',
      title: '新東京情報局・電戰觀測官',
      status: 'blueprint_locked',
      plannedTask: 'Task 9C',
      priceMc: 1600,
      achievementUnlock: '任一場實戰獲得 S 級評價',
      traitSummary: '索敵／預警距 +12% / 顯敵盾 SP% (代價: 撞牆恢復 +0.06s)',
      traitPositive: '鎖定／360° 預警距 +12%（抗暴風雪）、顯示敵盾 SP%',
      traitNegative: '撞牆與近身硬直恢復時間 +0.06s',
      accentColor: '#46f0b4',
      secondaryColor: '#09261f',
      visorStyle: 'recon',
      squelchHz: 1640,
      voiceBankDir: null,
      radioSamples: ['全頻譜掃描完成，目標無處可逃。', '偵測高能反應，立即規避！'],
    },
  },
  armors: {
    'EF-AC01': {
      id: 'EF-AC01',
      slot: 'ARMOR_CORE',
      name: '標準鋁鈦復合內襯',
      status: 'playable',
      plannedTask: null,
      priceMc: 0,
      weightKg: 0,
      summary: '出廠標準均衡內襯，無負重與性能懲罰',
      statModifiers: { apBonus: 0, blastResist: 0, beamResist: 0, acsCapBonus: 0 },
    },
    'EF-AC02': {
      id: 'EF-AC02',
      slot: 'ARMOR_CORE',
      name: '複合反應裝甲板',
      status: 'playable',
      plannedTask: null,
      priceMc: 1100,
      weightKg: 220,
      summary: '+1,200 AP、實彈與爆破重擊減傷 14%',
      statModifiers: { apBonus: 1200, blastResist: 0.14, beamResist: 0, acsCapBonus: 0 },
    },
    'EF-AC03': {
      id: 'EF-AC03',
      slot: 'ARMOR_CORE',
      name: '輕量化鍛造護脛骨架',
      status: 'playable',
      plannedTask: null,
      priceMc: 1400,
      weightKg: -120,
      summary: '減重 120 kg、微幅加速滑行（代價: -400 AP）',
      statModifiers: { apBonus: -400, blastResist: 0, beamResist: 0, acsCapBonus: 0 },
    },
    'EF-AL01': {
      id: 'EF-AL01',
      slot: 'ARMOR_LINING',
      name: '抗光束稜鏡微晶塗層',
      status: 'playable',
      plannedTask: null,
      priceMc: 1500,
      weightKg: 80,
      summary: '降低敵方光束／浮游雷射傷害 16%',
      statModifiers: { apBonus: 0, blastResist: -0.04, beamResist: 0.16, acsCapBonus: 0 },
    },
    'EF-AL02': {
      id: 'EF-AL02',
      slot: 'ARMOR_LINING',
      name: '液壓抗衝擊阻尼內構',
      status: 'playable',
      plannedTask: null,
      priceMc: 1650,
      weightKg: 160,
      summary: 'ACS 架勢上限 +18%、縮短撞牆與硬直冷卻 25%',
      statModifiers: { apBonus: 200, blastResist: 0, beamResist: 0, acsCapBonus: 0.18, staggerRecoveryBonus: 0.25 },
    },
  },
  modes: {
    sandbox: {
      id: 'sandbox',
      name: '單機靶場訓練',
      shortLabel: '靶場訓練',
      status: 'playable',
      plannedTask: null,
      allowsInGamePause: true,
      allowsQuickArmory: true,
      summary: '自由試射三連發靶機、測試四盾與建築破壞手感',
    },
    duel_1v1: {
      id: 'duel_1v1',
      name: '1v1 王牌 AI 決鬥',
      shortLabel: '1v1 AI 決鬥',
      status: 'playable',
      plannedTask: null,
      allowsInGamePause: true,
      allowsQuickArmory: false,
      summary: 'BO3 實戰 AI 揮刀舉盾對決，戰後產出關鍵事件時間軸',
    },
    ffa_4p: {
      id: 'ffa_4p',
      name: '4 機戰術大亂鬥',
      shortLabel: '4P 亂鬥',
      status: 'blueprint_locked',
      plannedTask: 'Task 10C',
      allowsInGamePause: true,
      allowsQuickArmory: false,
      summary: '四象限混戰、局內戰術晶片三選一與高張力偷襲反制',
    },
    online_pvp: {
      id: 'online_pvp',
      name: 'AWS 線上多人房間',
      shortLabel: '線上 PvP',
      status: 'blueprint_locked',
      plannedTask: 'Task 11',
      allowsInGamePause: false,
      allowsQuickArmory: false,
      summary: '權威 WebSocket 對戰（400ms 回溯補償 + 5s AI 補位）',
    },
  },
  maps: {
    neo_tokyo: {
      id: 'neo_tokyo',
      name: '新東京都市防衛區',
      shortLabel: '新東京都市',
      status: 'playable',
      plannedTask: 'Task 10A 升級 v2',
      radiusM: 65,
      arenaShape: 'circle',
      themeColors: { floor: '#172231', accent: '#56d4ff', hazard: '#ff8844' },
      summary: '平衡型都市街區（現行基準場景，將於 Task 10A 依地塊網格升級高架環道並徹底修復物理碰撞）',
      challengeTags: ['漸進式掩體拆毀戰', '雙層高架天橋 (Task 10A 實體化)', '油罐車連鎖爆破'],
      envModifiers: { frictionScale: 1.0, enRegenScale: 1.0, spRegenScale: 1.0, voidDropPenaltyAp: 0, lockRangeScale: 1.0 },
      floorplan: {
        spawns: [
          [0, 48],
          [-48, 0],
          [0, -48],
          [48, 0],
        ],
        zones: [
          { id: 'central_ring', type: 'plaza', shape: 'circle', x: 0, z: 0, r: 10, color: '#56d4ff', label: '中央十字圓環' },
          { id: 'overpass_w', type: 'elevated_bridge', shape: 'box', x: -19, z: -12, halfW: 2.5, halfD: 12, color: '#8bb8ff', label: '西高架橋' },
          { id: 'overpass_e', type: 'elevated_bridge', shape: 'box', x: 19, z: 12, halfW: 2.5, halfD: 12, color: '#8bb8ff', label: '東高架橋' },
        ],
        props: [
          { id: 'nt_tower_ne', kind: 'solid_indestructible', shape: 'cylinder', x: 30, z: -34, halfW: 3.4, halfD: 3.4, height: 18.0, standable: false, label: '東京鐵塔基座' },
          { id: 'nt_nw_1', kind: 'solid_destructible', shape: 'box', x: -12, z: -16, halfW: 3.0, halfD: 3.0, height: 2.8, standable: true, label: '商業百貨 NW' },
          { id: 'nt_nw_2', kind: 'solid_destructible', shape: 'box', x: -30, z: -22, halfW: 3.4, halfD: 3.0, height: 3.4, standable: true, label: '電器街大樓' },
          { id: 'nt_ne_1', kind: 'solid_destructible', shape: 'box', x: 12, z: -14, halfW: 2.8, halfD: 2.8, height: 2.4, standable: true, label: '貿易館 NE' },
          { id: 'nt_sw_1', kind: 'solid_destructible', shape: 'box', x: -13, z: 14, halfW: 3.0, halfD: 2.8, height: 2.5, standable: true, label: '東寶劇場 SW' },
          { id: 'nt_se_1', kind: 'solid_destructible', shape: 'box', x: 14, z: 16, halfW: 3.2, halfD: 3.0, height: 2.7, standable: true, label: '防災本部 SE' },
          { id: 'nt_se_depot', kind: 'solid_destructible', shape: 'box', x: 32, z: 28, halfW: 3.5, halfD: 2.8, height: 2.2, standable: true, label: '油罐車補給站 SE' },
        ],
      },
    },
    emerald_forest: {
      id: 'emerald_forest',
      name: '翡翠巨木森林基地',
      shortLabel: '翡翠森林',
      status: 'blueprint_locked',
      plannedTask: 'Task 10A',
      radiusM: 68,
      arenaShape: 'circle',
      themeColors: { floor: '#10241c', accent: '#3ef09e', hazard: '#ff5e57' },
      summary: '水冷散熱雙面刃淺溪、可一劍劈斷整排的巨竹林遮蔽、與高 ACS 爆裂紅油槽伏擊戰場',
      challengeTags: ['淺溪水冷 (+25% EN+SP 回充 / -12% 水阻)', '光劍斬斷巨竹清射界', '紅油槽連鎖引爆'],
      envModifiers: { frictionScale: 1.0, enRegenScale: 1.25, spRegenScale: 1.25, voidDropPenaltyAp: 0, lockRangeScale: 1.0 },
      floorplan: {
        spawns: [
          [0, 50],
          [-50, 0],
          [0, -50],
          [50, 0],
        ],
        zones: [
          { id: 'river_band', type: 'water_coolant', shape: 'box', x: 0, z: 0, halfW: 54, halfD: 7.5, color: '#2bd9ff', label: '中央水冷淺溪' },
          { id: 'bamboo_n', type: 'bamboo_grove', shape: 'box', x: 0, z: -20, halfW: 22, halfD: 4.5, color: '#64f58d', label: '北巨竹林帶' },
        ],
        props: [
          { id: 'ef_pine_nw', kind: 'solid_indestructible', shape: 'cylinder', x: -32, z: -24, halfW: 2.6, halfD: 2.6, height: 9.0, standable: false, label: '千年巨松 NW' },
          { id: 'ef_radar_ne', kind: 'solid_destructible', shape: 'box', x: 28, z: -30, halfW: 3.2, halfD: 3.2, height: 4.2, standable: true, label: '森林通信雷達塔' },
          { id: 'ef_tank_a', kind: 'solid_destructible', shape: 'cylinder', x: -24, z: -15, halfW: 1.8, halfD: 1.8, height: 2.4, standable: false, label: '爆裂紅油槽 A' },
          { id: 'ef_tank_b', kind: 'solid_destructible', shape: 'cylinder', x: 26, z: 24, halfW: 1.8, halfD: 1.8, height: 2.4, standable: false, label: '爆裂紅油槽 B' },
          { id: 'ef_rock_se', kind: 'solid_indestructible', shape: 'box', x: 36, z: -10, halfW: 4.0, halfD: 3.2, height: 2.1, standable: true, label: '岩石高地坡台' },
          { id: 'ef_tent_sw', kind: 'solid_destructible', shape: 'box', x: -28, z: 22, halfW: 3.5, halfD: 2.8, height: 1.8, standable: false, label: '軍用偽裝帳篷區' },
        ],
      },
    },
    sector_09: {
      id: 'sector_09',
      name: 'Sector-09 重工格納庫',
      shortLabel: 'Sector-09',
      status: 'blueprint_locked',
      plannedTask: 'Task 10A',
      radiusM: 60,
      arenaShape: 'square',
      themeColors: { floor: '#1b1d24', accent: '#ffb547', hazard: '#ff5268' },
      summary: '高張力室內鋼鐵死鬥場，四根不可毀承重鋼柱高頻觸發 Wall Splat，搭配雙側磁浮加速軌',
      challengeTags: ['4 鋼柱高壓 Wall Splat', '雙側單向磁浮加速軌', '中央高溫蒸氣與補給箱'],
      envModifiers: { frictionScale: 1.05, enRegenScale: 1.0, spRegenScale: 1.0, voidDropPenaltyAp: 0, lockRangeScale: 1.0 },
      floorplan: {
        spawns: [
          [0, 45],
          [-45, 0],
          [0, -45],
          [45, 0],
        ],
        zones: [
          { id: 'mag_rail_w', type: 'mag_rail', shape: 'box', x: -48, z: 0, halfW: 3.5, halfD: 34, color: '#3ee8ff', label: '西側磁浮加速軌' },
          { id: 'mag_rail_e', type: 'mag_rail', shape: 'box', x: 48, z: 0, halfW: 3.5, halfD: 34, color: '#3ee8ff', label: '東側磁浮加速軌' },
          { id: 'steam_core', type: 'steam_vent', shape: 'circle', x: 0, z: 0, r: 7, color: '#ff7048', label: '週期高溫蒸氣口' },
        ],
        props: [
          { id: 's9_col_a', kind: 'solid_indestructible', shape: 'box', x: -20, z: -20, halfW: 3.2, halfD: 3.2, height: 12.0, standable: false, label: '承重鋼柱 A' },
          { id: 's9_col_b', kind: 'solid_indestructible', shape: 'box', x: 20, z: -20, halfW: 3.2, halfD: 3.2, height: 12.0, standable: false, label: '承重鋼柱 B' },
          { id: 's9_col_c', kind: 'solid_indestructible', shape: 'box', x: -20, z: 20, halfW: 3.2, halfD: 3.2, height: 12.0, standable: false, label: '承重鋼柱 C' },
          { id: 's9_col_d', kind: 'solid_indestructible', shape: 'box', x: 20, z: 20, halfW: 3.2, halfD: 3.2, height: 12.0, standable: false, label: '承重鋼柱 D' },
          { id: 's9_ammo_nw', kind: 'solid_destructible', shape: 'box', x: -34, z: -36, halfW: 2.2, halfD: 2.2, height: 1.8, standable: false, label: 'EN 電容補給箱 NW' },
          { id: 's9_ammo_se', kind: 'solid_destructible', shape: 'box', x: 34, z: 36, halfW: 2.2, halfD: 2.2, height: 1.8, standable: false, label: 'EN 電容補給箱 SE' },
        ],
      },
    },
    orbital_elevator: {
      id: 'orbital_elevator',
      name: '軌道電梯環形天橋',
      shortLabel: '軌道天橋',
      status: 'blueprint_locked',
      plannedTask: 'Task 10B',
      radiusM: 68,
      arenaShape: 'circle',
      themeColors: { floor: '#162033', accent: '#6ce2ff', hazard: '#ff486b' },
      summary: '高空雙層環狀太空電梯甲板與 4 條跨淵寬橋，將對手擊飛打落中央無底豎井可強制扣減 650 AP',
      challengeTags: ['中央深淵墜落懲罰 (-650 AP)', '雙層錯落狙擊甲板', '高風險地形殺'],
      envModifiers: { frictionScale: 1.0, enRegenScale: 1.0, spRegenScale: 1.0, voidDropPenaltyAp: 650, lockRangeScale: 1.0 },
      floorplan: {
        spawns: [
          [0, 52],
          [-52, 0],
          [0, -52],
          [52, 0],
        ],
        zones: [
          { id: 'abyss_core', type: 'void_ring', shape: 'ring', x: 0, z: 0, r: 18, color: '#ff486b', label: '無底大氣豎井' },
          { id: 'bridge_w', type: 'elevated_bridge', shape: 'box', x: -34, z: 0, halfW: 16, halfD: 5.5, color: '#6ce2ff', label: '西跨橋' },
          { id: 'bridge_e', type: 'elevated_bridge', shape: 'box', x: 34, z: 0, halfW: 16, halfD: 5.5, color: '#6ce2ff', label: '東跨橋' },
        ],
        props: [
          { id: 'oe_deck_nw', kind: 'solid_indestructible', shape: 'box', x: -36, z: -32, halfW: 6.0, halfD: 4.5, height: 2.4, standable: true, label: '上層狙擊甲板 NW' },
          { id: 'oe_deck_ne', kind: 'solid_indestructible', shape: 'box', x: 36, z: -32, halfW: 6.0, halfD: 4.5, height: 2.4, standable: true, label: '上層狙擊甲板 NE' },
          { id: 'oe_cargo_sw', kind: 'solid_destructible', shape: 'box', x: -30, z: 30, halfW: 3.2, halfD: 2.6, height: 2.1, standable: true, label: '軌道貨櫃障礙 SW' },
          { id: 'oe_relay_se', kind: 'solid_destructible', shape: 'box', x: 30, z: 30, halfW: 2.8, halfD: 2.8, height: 2.6, standable: true, label: '訊號轉播台 SE' },
        ],
      },
    },
    polar_radar: {
      id: 'polar_radar',
      name: '極地極光雷達冰原',
      shortLabel: '極地冰原',
      status: 'blueprint_locked',
      plannedTask: 'Task 10B',
      radiusM: 78,
      arenaShape: 'circle',
      themeColors: { floor: '#10283d', accent: '#80f5ff', hazard: '#a5b4ff' },
      summary: '最大尺幅低摩擦鏡面冰原（甩尾煞距 +45%），伴隨週期性暴風雪將鎖定距離驟減 35%',
      challengeTags: ['低摩擦冰面甩尾 (+45% 煞距)', '25s 週期暴風雪 (鎖距 -35%)', 'R=78m 超大狙擊場'],
      envModifiers: { frictionScale: 0.55, enRegenScale: 1.05, spRegenScale: 1.0, voidDropPenaltyAp: 0, lockRangeScale: 0.65 },
      floorplan: {
        spawns: [
          [0, 60],
          [-60, 0],
          [0, -60],
          [60, 0],
        ],
        zones: [
          { id: 'whiteout_field', type: 'whiteout', shape: 'circle', x: 0, z: 0, r: 74, color: '#8deeff', label: '極地冰湖低摩擦＋暴風雪區' },
        ],
        props: [
          { id: 'pr_dome_a', kind: 'solid_indestructible', shape: 'cylinder', x: -26, z: -18, halfW: 4.5, halfD: 4.5, height: 4.8, standable: true, label: '冰晶雷達穹頂 A' },
          { id: 'pr_dome_b', kind: 'solid_indestructible', shape: 'cylinder', x: 26, z: -18, halfW: 4.5, halfD: 4.5, height: 4.8, standable: true, label: '廢棄雷達穹頂 B' },
          { id: 'pr_array_s', kind: 'solid_indestructible', shape: 'box', x: 0, z: 24, halfW: 5.0, halfD: 3.4, height: 4.2, standable: true, label: '主極光天線座' },
          { id: 'pr_gen_se', kind: 'solid_destructible', shape: 'box', x: 34, z: 22, halfW: 2.6, halfD: 2.2, height: 2.0, standable: false, label: '極地備用發電機' },
        ],
      },
    },
    caldera_rift: {
      id: 'caldera_rift',
      name: '地熱熔岩工業裂谷',
      shortLabel: '熔岩裂谷',
      status: 'blueprint_locked',
      plannedTask: 'Task 10B',
      radiusM: 65,
      arenaShape: 'circle',
      themeColors: { floor: '#261412', accent: '#ff8a3d', hazard: '#ff2f3d' },
      summary: '玄武岩浮島與鋼橋交錯於岩漿裂縫之上，3 座地熱噴泉提供零 EN 消耗的 12m 免費上升氣流',
      challengeTags: ['3 座免費上升熱氣流 (+12m 升空)', '熔岩裂溝持續灼傷', '島嶼橋樑封鎖戰'],
      envModifiers: { frictionScale: 1.0, enRegenScale: 1.0, spRegenScale: 0.9, voidDropPenaltyAp: 0, lockRangeScale: 1.0, hasUpdrafts: true },
      floorplan: {
        spawns: [
          [0, 48],
          [-48, 0],
          [0, -48],
          [48, 0],
        ],
        zones: [
          { id: 'magma_trench_n', type: 'magma', shape: 'box', x: 0, z: -22, halfW: 36, halfD: 4.5, color: '#ff3434', label: '北岩漿裂溝' },
          { id: 'magma_trench_s', type: 'magma', shape: 'box', x: 0, z: 20, halfW: 36, halfD: 4.5, color: '#ff3434', label: '南岩漿裂溝' },
          { id: 'updraft_a', type: 'thermal_updraft', shape: 'circle', x: -30, z: 0, r: 5.5, color: '#ffb84d', label: '地熱上升氣流 A' },
          { id: 'updraft_b', type: 'thermal_updraft', shape: 'circle', x: -6, z: 26, r: 5.5, color: '#ffb84d', label: '地熱上升氣流 B' },
          { id: 'updraft_c', type: 'thermal_updraft', shape: 'circle', x: 26, z: -16, r: 5.5, color: '#ffb84d', label: '地熱上升氣流 C' },
        ],
        props: [
          { id: 'cr_west_isle', kind: 'solid_indestructible', shape: 'box', x: -24, z: 0, halfW: 6.5, halfD: 5.5, height: 1.4, standable: true, label: '西玄武岩高地' },
          { id: 'cr_east_isle', kind: 'solid_indestructible', shape: 'box', x: 24, z: 0, halfW: 6.5, halfD: 5.5, height: 1.4, standable: true, label: '東熔礦作業平台' },
          { id: 'cr_tower_ne', kind: 'solid_destructible', shape: 'cylinder', x: 28, z: -34, halfW: 3.0, halfD: 3.0, height: 5.6, standable: true, label: '熔岩精煉塔 NE' },
          { id: 'cr_smelter_e', kind: 'solid_destructible', shape: 'box', x: 38, z: 0, halfW: 2.8, halfD: 2.8, height: 3.0, standable: true, label: '可毀熔礦機' },
        ],
      },
    },
  },
});

const SHIELD_BOUNDS = Object.freeze({
  priceMc: [0, 100000],
  weightKg: [40, 3000],
  blockReduction: [0.1, 0.95],
  solidBlockReduction: [0.1, 0.95],
  noEnBlockReduction: [0.0, 0.85],
  parryWindowSec: [0.05, 0.40],
  guardWindupSec: [0.02, 0.80],
  barrierRadiusM: [0.35, 3.20],
  rectHalfW: [0.25, 2.0],
  rectHalfH: [0.35, 2.5],
  yawHalfDeg: [15, 180],
  pitchHalfDeg: [15, 90],
  maxDurationSec: [0.5, 60.0],
  holdDrainPerSec: [0.5, 100.0],
  cooldownSec: [0.2, 20.0],
  impactDrainMult: [0.05, 3.0],
  parrySpRefund: [0, 50],
  enDrainPerSec: [0, 80],
});

function cloneMutable(obj) {
  return JSON.parse(JSON.stringify(obj));
}

function assertInRange(label, val, min, max) {
  if (typeof val !== 'number' || !Number.isFinite(val) || val < min || val > max) {
    throw new RangeError(`Catalog guardrail violation on ${label}: ${val} must be within [${min}, ${max}]`);
  }
}

/**
 * Validates and applies an admin balance/price patch cleanly, returning a new frozen Catalog snapshot
 * with an incremented `catalogVersion` while keeping prior snapshots immutable for Match Audit history.
 */
export function applyCatalogBalanceOverrides(baseSnapshot, overrides = {}, revisionTag = null) {
  const next = cloneMutable(baseSnapshot || BASE_CATALOG);

  if (overrides?.shields) {
    for (const [id, patch] of Object.entries(overrides.shields)) {
      if (!next.shields[id]) {
        throw new Error(`Unknown shield id in override: ${id}`);
      }
      for (const [field, value] of Object.entries(patch)) {
        if (field in SHIELD_BOUNDS) {
          const [min, max] = SHIELD_BOUNDS[field];
          assertInRange(`shields.${id}.${field}`, value, min, max);
        }
        next.shields[id][field] = value;
      }
    }
  }

  if (overrides?.weapons) {
    for (const [id, patch] of Object.entries(overrides.weapons)) {
      if (!next.weapons[id]) {
        throw new Error(`Unknown weapon id in override: ${id}`);
      }
      for (const [field, value] of Object.entries(patch)) {
        if (field === 'priceMc') assertInRange(`weapons.${id}.priceMc`, value, 0, 100000);
        if (field === 'damage') assertInRange(`weapons.${id}.damage`, value, 1, 5000);
        if (field === 'cooldownSec') assertInRange(`weapons.${id}.cooldownSec`, value, 0.04, 15);
        next.weapons[id][field] = value;
      }
    }
  }

  const prevVer = String(next.catalogVersion || INITIAL_CATALOG_VERSION);
  const bumpMatch = prevVer.match(/-r(\d+)$/);
  const nextRev = bumpMatch ? Number(bumpMatch[1]) + 1 : 2;
  next.catalogVersion = revisionTag || `${prevVer.replace(/-r\d+$/, '')}-r${nextRev}`;
  return deepFreeze(next);
}

/**
 * Validates that static/destructible obstacles in a map floorplan do NOT overlap in XZ space.
 */
export function assertNoFloorplanOverlap(floorplan = {}, minClearanceM = 0) {
  const props = Array.isArray(floorplan?.props) ? floorplan.props : [];
  for (let i = 0; i < props.length; i++) {
    const a = props[i];
    for (let j = i + 1; j < props.length; j++) {
      const b = props[j];
      const dx = Math.abs((a.x || 0) - (b.x || 0));
      const dz = Math.abs((a.z || 0) - (b.z || 0));
      const minX = (a.halfW || 1) + (b.halfW || 1) + minClearanceM;
      const minZ = (a.halfD || 1) + (b.halfD || 1) + minClearanceM;
      if (dx < minX && dz < minZ) {
        throw new Error(`Floorplan prop overlap detected between "${a.id}" and "${b.id}"`);
      }
    }
  }
  return true;
}

export const SAMPLE_ONLINE_LOBBIES = Object.freeze([
  Object.freeze({
    id: 'RM-901',
    roomName: 'RAVEN ACES // 新東京夜戰練習房',
    hostCallsign: 'VALKYRIE',
    modeId: 'pvp_1v1',
    mapId: 'neo_tokyo',
    playersText: '1 / 2',
    pingMs: 18,
    hasPassword: false,
    allowAiFill: true,
    status: 'blueprint_locked',
    plannedTask: 'Task 11',
  }),
  Object.freeze({
    id: 'RM-904',
    roomName: 'SKY ELEVATOR 高空格鬥淘汰',
    hostCallsign: 'SPECTRE',
    modeId: 'pvp_4p_ffa',
    mapId: 'orbital_elevator',
    playersText: '2 / 4',
    pingMs: 26,
    hasPassword: false,
    allowAiFill: true,
    status: 'blueprint_locked',
    plannedTask: 'Task 11',
  }),
  Object.freeze({
    id: 'RM-908',
    roomName: '重裝試煉私密房 [IRONCLAD SQUAD]',
    hostCallsign: 'IRONCLAD',
    modeId: 'pvp_1v1',
    mapId: 'sector_09',
    playersText: '1 / 2',
    pingMs: 22,
    hasPassword: true,
    allowAiFill: false,
    status: 'blueprint_locked',
    plannedTask: 'Task 11',
  }),
]);

export function createCatalogRegistry(initialOverrides = null) {
  let current = initialOverrides
    ? applyCatalogBalanceOverrides(BASE_CATALOG, initialOverrides)
    : BASE_CATALOG;

  return {
    getSnapshot() {
      return current;
    },
    getShield(shieldId) {
      return current.shields[shieldId] || current.shields['EF-SH03'];
    },
    listShields() {
      return SHIELD_IDS.map((id) => current.shields[id]).filter(Boolean);
    },
    getMap(mapId) {
      return current.maps[mapId] || current.maps.neo_tokyo;
    },
    getActor(actorId) {
      return current.actors[actorId] || current.actors['EF-018'];
    },
    getActorVariant(actorId = 'EF-018', variantId = null) {
      const actor = current.actors[actorId] || current.actors['EF-018'];
      const variants = actor?.variants || null;
      if (!variants) return null;
      const vid = variantId || actor.defaultVariantId || Object.keys(variants)[0];
      return variants[vid] || variants[actor.defaultVariantId] || Object.values(variants)[0] || null;
    },
    getPilot(pilotId) {
      return current.pilots[pilotId] || current.pilots['PILOT-01'];
    },
    getArmor(armorId) {
      return current.armors[armorId] || current.armors['EF-AC01'];
    },
    getArmorCore(armorId) {
      const a = current.armors[armorId];
      if (a && a.slot === 'ARMOR_CORE') return a;
      return current.armors['EF-AC01'];
    },
    getArmorLining(armorId) {
      if (!armorId) return null;
      const a = current.armors[armorId];
      return a && a.slot === 'ARMOR_LINING' ? a : null;
    },
    getWeapon(weaponId) {
      if (!weaponId) return null;
      return current.weapons[weaponId] || null;
    },
    listWeapons() {
      return WEAPON_IDS.map((id) => current.weapons[id]).filter(Boolean);
    },
    getMode(modeId) {
      return current.modes[modeId] || current.modes.sandbox;
    },
    listMaps() {
      return MAP_IDS.map((id) => current.maps[id]);
    },
    listActors() {
      return ACTOR_IDS.map((id) => current.actors[id]);
    },
    listPilots() {
      return PILOT_IDS.map((id) => current.pilots[id]);
    },
    listArmors() {
      return ARMOR_IDS.map((id) => current.armors[id]);
    },
    listModes() {
      return MODE_IDS.map((id) => current.modes[id]);
    },
    applyPatch(overrides, revisionTag) {
      current = applyCatalogBalanceOverrides(current, overrides, revisionTag);
      return current;
    },
  };
}

/**
 * Pure Task 6 build validator enforcing Budget Cap <= 375, max 1 shield,
 * slot compatibility (`L_BACK` / `R_BACK` / `ARMOR_CORE` / `ARMOR_LINING`), and overload warnings.
 */
export function validateMechaBuild({
  actorDef = null,
  lHandType = 'saber',
  rHandType = 'pistol',
  shieldDef = null,
  lBackWeaponDef = null,
  rBackWeaponDef = null,
  armorCoreDef = null,
  armorLiningDef = null,
} = {}) {
  const errors = [];
  const warnings = [];
  const actor = actorDef || BASE_CATALOG.actors['EF-018'];
  const budgetCap = Number(actor.statBudgetCap) || 375;
  const stats = actor.stats || {};
  const budgetUsed =
    (Number(stats.speed) || 0) +
    (Number(stats.firepower) || 0) +
    (Number(stats.melee) || 0) +
    (Number(stats.tech) || 0) +
    (Number(stats.defense) || 0);

  if (budgetUsed > budgetCap) {
    errors.push({
      code: 'STAT_BUDGET_EXCEEDED',
      message: `${actor.id || 'ACTOR'} 五維總和 ${budgetUsed} 超過上限 ${budgetCap}`,
    });
  }
  if (actor.status && actor.status !== LOCK_STATES.PLAYABLE) {
    errors.push({
      code: 'ACTOR_LOCKED',
      message: `${actor.name || actor.id} 尚未解鎖 (${actor.plannedTask || actor.status})`,
    });
  }
  if (lHandType === 'shield' && rHandType === 'shield') {
    errors.push({
      code: 'DUAL_SHIELD_FORBIDDEN',
      message: '雙手禁止同時裝備兩面防禦護盾',
    });
  }
  if (lBackWeaponDef) {
    if (lBackWeaponDef.slot !== 'L_BACK') {
      errors.push({
        code: 'BACK_SLOT_MISMATCH',
        message: `${lBackWeaponDef.name || lBackWeaponDef.id} 無法裝入 L_BACK 插槽`,
      });
    } else if (lBackWeaponDef.status && lBackWeaponDef.status !== LOCK_STATES.PLAYABLE) {
      errors.push({
        code: 'BACK_WEAPON_LOCKED',
        message: `${lBackWeaponDef.name || lBackWeaponDef.id} 尚未解鎖`,
      });
    }
  }
  if (rBackWeaponDef) {
    if (rBackWeaponDef.slot !== 'R_BACK') {
      errors.push({
        code: 'BACK_SLOT_MISMATCH',
        message: `${rBackWeaponDef.name || rBackWeaponDef.id} 無法裝入 R_BACK 插槽`,
      });
    } else if (rBackWeaponDef.status && rBackWeaponDef.status !== LOCK_STATES.PLAYABLE) {
      errors.push({
        code: 'BACK_WEAPON_LOCKED',
        message: `${rBackWeaponDef.name || rBackWeaponDef.id} 尚未解鎖`,
      });
    }
  }
  if (armorCoreDef && armorCoreDef.slot !== 'ARMOR_CORE') {
    errors.push({ code: 'ARMOR_SLOT_MISMATCH', message: '主裝甲插槽僅接受 ARMOR_CORE 模組' });
  }
  if (armorLiningDef && armorLiningDef.slot !== 'ARMOR_LINING') {
    errors.push({ code: 'ARMOR_SLOT_MISMATCH', message: '附加襯墊插槽僅接受 ARMOR_LINING 模組' });
  }

  const handMass =
    (lHandType === 'pistol' ? 320 : lHandType === 'saber' ? 140 : 0) +
    (rHandType === 'pistol' ? 320 : rHandType === 'saber' ? 140 : 0) +
    (lHandType === 'shield' || rHandType === 'shield' ? Number(shieldDef?.weightKg) || 340 : 0);
  const payloadKg = Math.max(
    0,
    handMass +
      (Number(lBackWeaponDef?.weightKg) || 0) +
      (Number(rBackWeaponDef?.weightKg) || 0) +
      (Number(armorCoreDef?.weightKg) || 0) +
      (Number(armorLiningDef?.weightKg) || 0),
  );
  const payloadCapKg = Math.max(500, Number(actor.payloadCapKg) || 1850);
  const loadRatio = payloadKg / payloadCapKg;
  if (loadRatio > 1.05) {
    warnings.push({
      code: 'WEIGHT_OVERLOADED',
      message: `載重超標 (${Math.round(loadRatio * 100)}%)：將觸發滑行減速與 EN 回充懲罰`,
    });
  } else if (loadRatio > 0.90) {
    warnings.push({
      code: 'WEIGHT_HEAVY',
      message: `接近骨架載重上限 (${Math.round(loadRatio * 100)}%)`,
    });
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
    budgetUsed,
    budgetCap,
    payloadKg,
    payloadCapKg,
    loadRatio,
  };
}
