/**
 * PLAY_ROBOTS Shared Simulation & Asset Contract Constants (Layer 0)
 * SSOT: MASTER_SPEC.md v2.0.0 ([M0], [M2.3], [M2.4.1], [M2.5.1], [M5.4], [M5.6], [M6.2])
 * Zero external dependencies — safe for Browser ES Modules and Node.js.
 */

export const TICK_RATE = 30;
export const DT = 1 / TICK_RATE;
export const GRAVITY_MPS2 = 9.81;
export const GOLDEN_RATIO_PHI = 1.61803398875;
export const MECHA_BASE_MASS_KG = 62000;
export const MECHA_BASE_THRUST_N = 860000;
export const ARENA_RADIUS = 65;

export const MECHA_HEIGHT_M = 2.68;
export const HANGAR_DISPLAY_SCALE = 2.2;
export const PILOT_EYE_HEIGHT_M = 1.75;

/**
 * Exact 25-node rigid skeletal hierarchy required by ASSET_CONTRACT.md & SimCore.
 */
export const BONE_NAMES = Object.freeze([
  'Root',
  'Pelvis',
  'Torso',
  'Head',
  'ShoulderPad_L',
  'ShoulderPad_R',
  'Arm_Upper_L',
  'Arm_Upper_R',
  'Arm_Lower_L',
  'Arm_Lower_R',
  'Hand_L',
  'Hand_R',
  'WeaponMount_L',
  'WeaponMount_R',
  'Backpack',
  'Wing_L1',
  'Wing_L2',
  'Wing_R1',
  'Wing_R2',
  'Leg_Upper_L',
  'Leg_Upper_R',
  'Leg_Lower_L',
  'Leg_Lower_R',
  'Foot_L',
  'Foot_R',
]);

/**
 * Standard 5 PBR material slots on every mecha .glb model.
 */
export const MATERIAL_NAMES = Object.freeze([
  'Mat_Armor_Primary',
  'Mat_Armor_Secondary',
  'Mat_Frame_DarkMetal',
  'Mat_Glow_Sensor',
  'Mat_Glow_Thruster',
]);

export const CAMERA_MODES = Object.freeze({
  TPS: 'tps',
  FPS_COCKPIT: 'fps_cockpit',
  HANGAR_ORBIT: 'hangar_orbit',
  PILOT_WALK: 'pilot_walk',
  HANGAR_COCKPIT: 'hangar_cockpit',
});

export const MAP_IDS = Object.freeze({
  NEO_TOKYO: 'neo_tokyo',
  EMERALD_FOREST: 'emerald_forest',
  SECTOR_09: 'sector_09',
});

export const ARCHETYPE_IDS = Object.freeze([
  'allrounder',
  'speed',
  'heavy',
  'technical',
  'magic',
]);

/**
 * 4 standardized modular weapon hardpoint sockets ([M5.6]).
 */
export const HARDPOINT_SLOTS = Object.freeze({
  R_HAND: 'WeaponMount_R',
  L_HAND: 'WeaponMount_L',
  R_BACK: 'BackMount_R',
  L_BACK: 'BackMount_L',
});

/**
 * Purchasable & starter modular weapon & booster catalog ([M5.6], [M2.4.1]).
 * Each module supplies mass (`weightKg`) and optional aerial propulsion (`thrustBonusN`).
 */
export const MODULAR_WEAPONS = Object.freeze({
  'EF-SG01': Object.freeze({
    id: 'EF-SG01',
    name: '超長型光束智慧長砲 (Beam Smart Gun + Radome)',
    slot: 'R_HAND',
    category: 'rifle',
    priceMc: 0,
    weightKg: 680,
    thrustBonusN: 0,
    nodePrefix: 'ModWpn_SmartGun_R',
  }),
  'EF-AR01': Object.freeze({
    id: 'EF-AR01',
    name: '高週波脈衝步槍 (Pulse Rifle)',
    slot: 'R_HAND',
    category: 'rifle',
    priceMc: 0,
    weightKg: 320,
    thrustBonusN: 0,
    nodePrefix: 'Wpn_PulseRifle',
  }),
  'EF-BS02': Object.freeze({
    id: 'EF-BS02',
    name: '雙聯高出力電漿光劍組 (Twin Beam Sabers)',
    slot: 'L_HAND',
    category: 'saber',
    priceMc: 0,
    weightKg: 160,
    thrustBonusN: 0,
    nodePrefix: 'ModWpn_ShieldSaber_L',
  }),
  'EF-SH03': Object.freeze({
    id: 'EF-SH03',
    name: '複合裝甲防禦巨盾 (Tactical Shield)',
    slot: 'L_HAND',
    category: 'shield',
    priceMc: 0,
    weightKg: 480,
    thrustBonusN: 0,
    nodePrefix: 'ModWpn_ShieldSaber_L',
  }),
  'EF-BP03': Object.freeze({
    id: 'EF-BP03',
    name: '肩掛雙巨型流線推進莢艙與翼組 (Ex-S Side Booster Pods)',
    slot: 'L_BACK',
    category: 'booster',
    priceMc: 1600,
    weightKg: 1450,
    thrustBonusN: 380000,
    nodePrefix: 'ModWpn_SideBoosters_LR',
  }),
  'EF-TB04': Object.freeze({
    id: 'EF-TB04',
    name: '高聳主推進穩定尾翼＋四連光束加農砲 (Tail Stabilizer & Quad Cannons)',
    slot: 'R_BACK',
    category: 'cannon',
    priceMc: 1800,
    weightKg: 1200,
    thrustBonusN: 310000,
    nodePrefix: 'ModWpn_BackTailPack',
  }),
  'EF-HC04': Object.freeze({
    id: 'EF-HC04',
    name: '肩載重型電磁巨砲 (Shoulder Heavy Cannon)',
    slot: 'R_BACK',
    category: 'cannon',
    priceMc: 1400,
    weightKg: 820,
    thrustBonusN: 0,
    nodePrefix: 'Wpn_ShoulderCannon',
  }),
  'EF-GT05': Object.freeze({
    id: 'EF-GT05',
    name: '重型雙聯加特林機砲 (Twin Gatling)',
    slot: 'R_HAND',
    category: 'rifle',
    priceMc: 1800,
    weightKg: 760,
    thrustBonusN: 0,
    nodePrefix: 'Wpn_TwinGatling',
  }),
  'EF-GS06': Object.freeze({
    id: 'EF-GS06',
    name: '超重型電漿破甲大劍 (Plasma Greatsword)',
    slot: 'L_HAND',
    category: 'saber',
    priceMc: 2200,
    weightKg: 540,
    thrustBonusN: 0,
    nodePrefix: 'Wpn_PlasmaGreatsword',
  }),
  'EF-HS07': Object.freeze({
    id: 'EF-HS07',
    name: '六角力場能量反射盾 (Aegis Energy Shield)',
    slot: 'L_HAND',
    category: 'shield',
    priceMc: 2000,
    weightKg: 350,
    thrustBonusN: 0,
    nodePrefix: 'Wpn_AegisShield',
  }),
  'EF-RL08': Object.freeze({
    id: 'EF-RL08',
    name: '超長程磁軌狙擊巨砲 (Shoulder Rail Cannon)',
    slot: 'L_BACK',
    category: 'cannon',
    priceMc: 2600,
    weightKg: 890,
    thrustBonusN: 0,
    nodePrefix: 'Wpn_ShoulderRailgun',
  }),
});

/**
 * Heroic Golden-Triangle & ~9-Head Anatomical Proportion DNA across all 5 archetypes ([M2.5.1]).
 * Mirrors `gemini/blender/mecha_anatomy.py` for runtime UI radar & procedural IK scaling.
 */
export const MECHA_PROPORTION_DNA = Object.freeze({
  allrounder: Object.freeze({
    crownHeightM: 2.40,
    headsTall: 9.2,
    hipGoldenRatio: 0.625,
    kneeSplitRatio: 0.560,
    upperTriangleRatio: 4.000,
    lowerTriangleRatio: 1.944,
    stanceFlareDeg: 6.46,
  }),
  speed: Object.freeze({
    crownHeightM: 2.36,
    headsTall: 9.6,
    hipGoldenRatio: 0.645,
    kneeSplitRatio: 0.580,
    upperTriangleRatio: 4.632,
    lowerTriangleRatio: 2.000,
    stanceFlareDeg: 6.37,
  }),
  heavy: Object.freeze({
    crownHeightM: 2.48,
    headsTall: 8.2,
    hipGoldenRatio: 0.585,
    kneeSplitRatio: 0.530,
    upperTriangleRatio: 3.375,
    lowerTriangleRatio: 1.773,
    stanceFlareDeg: 6.68,
  }),
  technical: Object.freeze({
    crownHeightM: 2.38,
    headsTall: 9.4,
    hipGoldenRatio: 0.635,
    kneeSplitRatio: 0.560,
    upperTriangleRatio: 4.000,
    lowerTriangleRatio: 1.829,
    stanceFlareDeg: 5.48,
  }),
  magic: Object.freeze({
    crownHeightM: 2.42,
    headsTall: 9.3,
    hipGoldenRatio: 0.630,
    kneeSplitRatio: 0.570,
    upperTriangleRatio: 4.571,
    lowerTriangleRatio: 1.943,
    stanceFlareDeg: 6.18,
  }),
});

export const BODY_PART_SOCKETS = Object.freeze([
  'HEAD_SOCKET',
  'CHEST_CORE_SOCKET',
  'WAIST_GIMBAL_SOCKET',
  'BACKPACK_SOCKET',
  'SHOULDER_MOUNT_L',
  'SHOULDER_MOUNT_R',
  'FOREARM_MOUNT_L',
  'FOREARM_MOUNT_R',
  'HAND_MOUNT_L',
  'HAND_MOUNT_R',
  'KNEE_ARMOR_SOCKET_L',
  'KNEE_ARMOR_SOCKET_R',
  'SIDE_SKIRT_SOCKET_L',
  'SIDE_SKIRT_SOCKET_R',
]);
