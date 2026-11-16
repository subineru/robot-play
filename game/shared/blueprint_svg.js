/**
 * PLAY_ROBOTS Pure Tactical SVG Blueprint & Military Portrait Generators (Zero DOM / Zero THREE).
 * Shared between Browser UI (`menu_controller.js`) and Node.js unit verification.
 */

function escapeXml(val) {
  return String(val ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function clampColor(hex, fallback = '#56d4ff') {
  return typeof hex === 'string' && /^#[0-9a-fA-F]{3,8}$/.test(hex) ? hex : fallback;
}

/**
 * Generates an inline military tactical HUD SVG portrait badge for a Pilot entry.
 */
export function renderPilotPortraitSvg(pilot = {}) {
  const accent = clampColor(pilot.accentColor, '#56d4ff');
  const bg = clampColor(pilot.secondaryColor, '#0e1d30');
  const callsign = escapeXml(pilot.callsign || 'PILOT');
  const code = escapeXml(pilot.id || 'P-00');
  const visor = pilot.visorStyle || 'tactical';

  let visorShape = `<polygon points="30,36 66,36 62,48 34,48" fill="${accent}" fill-opacity="0.88" />`;
  if (visor === 'interceptor') {
    visorShape = `<polygon points="28,34 47,40 47,47 30,45" fill="${accent}" fill-opacity="0.92" /><polygon points="68,34 49,40 49,47 66,45" fill="${accent}" fill-opacity="0.92" />`;
  } else if (visor === 'heavy') {
    visorShape = `<rect x="30" y="37" width="36" height="9" rx="2" fill="${accent}" fill-opacity="0.9" /><rect x="42" y="35" width="12" height="13" rx="1" fill="${bg}" stroke="${accent}" stroke-width="1.2" />`;
  } else if (visor === 'recon') {
    visorShape = `<polygon points="28,38 56,34 68,42 54,48 30,46" fill="${accent}" fill-opacity="0.86" /><circle cx="59" cy="40" r="3.4" fill="#ffffff" fill-opacity="0.9" />`;
  }

  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 96 96" role="img" aria-label="${callsign}">` +
    `<defs>` +
    `<linearGradient id="pbg-${code}" x1="0" y1="0" x2="1" y2="1">` +
    `<stop offset="0%" stop-color="${bg}" />` +
    `<stop offset="100%" stop-color="#070d16" />` +
    `</linearGradient>` +
    `<pattern id="pscan-${code}" width="4" height="4" patternUnits="userSpaceOnUse">` +
    `<line x1="0" y1="0" x2="4" y2="0" stroke="${accent}" stroke-opacity="0.14" stroke-width="1" />` +
    `</pattern>` +
    `</defs>` +
    `<rect x="2" y="2" width="92" height="92" rx="10" fill="url(#pbg-${code})" stroke="${accent}" stroke-opacity="0.45" stroke-width="1.5" />` +
    `<rect x="4" y="4" width="88" height="88" rx="8" fill="url(#pscan-${code})" />` +
    `<path d="M18 84 L26 64 L70 64 L78 84 Z" fill="#182738" stroke="${accent}" stroke-opacity="0.45" stroke-width="1.2" />` +
    `<path d="M27 52 L29 27 L48 18 L67 27 L69 52 L60 61 L36 61 Z" fill="#1e3148" stroke="#9ec5e8" stroke-opacity="0.65" stroke-width="1.5" />` +
    visorShape +
    `<line x1="12" y1="74" x2="84" y2="74" stroke="${accent}" stroke-opacity="0.35" stroke-width="1" />` +
    `<text x="48" y="86" text-anchor="middle" font-family="monospace" font-size="9.5" font-weight="700" fill="${accent}" letter-spacing="1">${callsign}</text>` +
    `<text x="10" y="15" font-family="monospace" font-size="7.5" fill="#9fb8d4">${code}</text>` +
    `</svg>`
  );
}

/**
 * Generates an accurate Top-Down Tactical Floorplan wireframe SVG from MAP_CATALOG entry data.
 */
export function renderMapBlueprintSvg(mapEntry = {}) {
  const radius = Number(mapEntry.radiusM) > 0 ? Number(mapEntry.radiusM) : 65;
  const pad = Math.round(radius + 14);
  const colors = mapEntry.themeColors || {};
  const floorCol = clampColor(colors.floor, '#111b2b');
  const accent = clampColor(colors.accent, '#48c9ff');
  const hazardCol = clampColor(colors.hazard, '#ff5c72');
  const title = escapeXml(mapEntry.name || mapEntry.id || 'MAP');
  const fp = mapEntry.floorplan || {};
  const zones = Array.isArray(fp.zones) ? fp.zones : [];
  const props = Array.isArray(fp.props) ? fp.props : [];
  const spawns = Array.isArray(fp.spawns) ? fp.spawns : [];

  const zoneEls = zones
    .map((z) => {
      if (z.shape === 'ring' || z.shape === 'circle') {
        const fill = z.type === 'void_ring' ? '#05080d' : z.color || accent;
        const opacity = z.type === 'void_ring' ? '0.92' : '0.26';
        const stroke = z.type === 'void_ring' || z.type === 'magma' ? hazardCol : z.color || accent;
        return `<circle cx="${z.x || 0}" cy="${z.z || 0}" r="${z.r || 12}" fill="${fill}" fill-opacity="${opacity}" stroke="${stroke}" stroke-width="1.4" stroke-dasharray="3 2" />`;
      }
      const w = (z.halfW || 6) * 2;
      const h = (z.halfD || 6) * 2;
      const stroke = z.type === 'magma' || z.type === 'steam_vent' ? hazardCol : z.color || accent;
      return `<rect x="${(z.x || 0) - w * 0.5}" y="${(z.z || 0) - h * 0.5}" width="${w}" height="${h}" rx="2" fill="${z.color || accent}" fill-opacity="0.24" stroke="${stroke}" stroke-width="1.1" stroke-dasharray="3 2" />`;
    })
    .join('');

  const propEls = props
    .map((p) => {
      const isIndest = p.kind === 'solid_indestructible';
      const fill = isIndest ? '#89a3be' : '#4fa6e8';
      const fillOp = isIndest ? '0.72' : '0.42';
      const stroke = isIndest ? '#d8ebff' : '#7dd3fc';
      if (p.shape === 'cylinder') {
        const r = Math.max(1.4, p.halfW || 1.8);
        return `<circle cx="${p.x}" cy="${p.z}" r="${r}" fill="${fill}" fill-opacity="${fillOp}" stroke="${stroke}" stroke-width="1.1" />`;
      }
      const w = Math.max(2.2, (p.halfW || 2) * 2);
      const d = Math.max(2.2, (p.halfD || 2) * 2);
      return `<rect x="${p.x - w * 0.5}" y="${p.z - d * 0.5}" width="${w}" height="${d}" rx="1.2" fill="${fill}" fill-opacity="${fillOp}" stroke="${stroke}" stroke-width="1" />`;
    })
    .join('');

  const spawnEls = spawns
    .map(([sx, sz], idx) => {
      const label = `P${idx + 1}`;
      const col = idx === 0 ? '#37f2a8' : '#ffb85c';
      return (
        `<g transform="translate(${sx}, ${sz})">` +
        `<polygon points="0,-4.2 4.2,0 0,4.2 -4.2,0" fill="${col}" stroke="#061019" stroke-width="1" />` +
        `<text x="0" y="-6.2" text-anchor="middle" font-family="monospace" font-size="6.5" font-weight="700" fill="${col}">${label}</text>` +
        `</g>`
      );
    })
    .join('');

  const arenaShell =
    mapEntry.arenaShape === 'square'
      ? `<rect x="${-radius}" y="${-radius}" width="${radius * 2}" height="${radius * 2}" rx="4" fill="${floorCol}" stroke="${accent}" stroke-opacity="0.7" stroke-width="1.6" />`
      : `<circle cx="0" cy="0" r="${radius}" fill="${floorCol}" stroke="${accent}" stroke-opacity="0.7" stroke-width="1.6" />`;

  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${-pad} ${-pad} ${pad * 2} ${pad * 2}" role="img" aria-label="${title}">` +
    `<rect x="${-pad}" y="${-pad}" width="${pad * 2}" height="${pad * 2}" rx="8" fill="#070d16" />` +
    arenaShell +
    `<line x1="${-radius}" y1="0" x2="${radius}" y2="0" stroke="${accent}" stroke-opacity="0.18" stroke-width="0.8" />` +
    `<line x1="0" y1="${-radius}" x2="0" y2="${radius}" stroke="${accent}" stroke-opacity="0.18" stroke-width="0.8" />` +
    zoneEls +
    propEls +
    spawnEls +
    `<text x="${-pad + 6}" y="${-pad + 10}" font-family="monospace" font-size="6.5" fill="#9cc2e6">N (-Z) | R=${radius}m</text>` +
    `</svg>`
  );
}

const UI_ICON_PATHS = Object.freeze({
  sortie: '<path d="M12 3l8 4.5v9L12 21l-8-4.5v-9L12 3z" /><circle cx="12" cy="12" r="2.6" />',
  hangar: '<path d="M3 10l9-6 9 6v9a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1v-9z" /><path d="M8 20v-7h8v7" />',
  armory: '<path d="M14.7 6.3a4 4 0 0 0-5.4 5.4l-5.3 5.3 2.5 2.5 5.3-5.3a4 4 0 0 0 5.4-5.4l-2.1 2.1-2-2 1.6-2.6z" />',
  paint: '<path d="M12 3a9 9 0 1 0 0 18h1.5a2 2 0 0 0 0-4H12a2 2 0 0 1 0-4h4.5A4.5 4.5 0 0 0 12 3z" /><circle cx="8.5" cy="9.5" r="1" /><circle cx="13" cy="7.5" r="1" /><circle cx="16.5" cy="10.5" r="1" />',
  career: '<path d="M6 4h12v5a6 6 0 0 1-12 0V4z" /><path d="M9 18h6M12 15v5M5 5H3v3a3 3 0 0 0 3 3M19 5h2v3a3 3 0 0 1-3 3" />',
  settings: '<circle cx="12" cy="12" r="3.2" /><path d="M12 2.8v2.2M12 19v2.2M4.9 4.9l1.6 1.6M17.5 17.5l1.6 1.6M2.8 12H5M19 12h2.2M4.9 19.1l1.6-1.6M17.5 6.5l1.6-1.6" />',
  launch: '<path d="M5 12h13M13 6l6 6-6 6" />',
  lock: '<rect x="5" y="11" width="14" height="9" rx="2" /><path d="M8 11V7a4 4 0 0 1 8 0v4" />',
  coin: '<circle cx="12" cy="12" r="8.5" /><path d="M12 7v10M9.5 10.2c0-1.1 1.1-1.7 2.5-1.7s2.5.6 2.5 1.7-1.1 1.6-2.5 1.8-2.5.7-2.5 1.8 1.1 1.7 2.5 1.7 2.5-.6 2.5-1.7" />',
  spark: '<path d="M13 2L4 14h7l-1 8 9-12h-7l1-8z" />',
  sun: '<circle cx="12" cy="12" r="4" /><path d="M12 2.5v2M12 19.5v2M4.8 4.8l1.4 1.4M17.8 17.8l1.4 1.4M2.5 12h2M19.5 12h2M4.8 19.2l1.4-1.4M17.8 6.2l1.4-1.4" />',
  moon: '<path d="M20 14.5A8.2 8.2 0 1 1 9.5 4a6.6 6.6 0 0 0 10.5 10.5z" />',
  eye: '<path d="M2 12s3.8-6.5 10-6.5S22 12 22 12s-3.8 6.5-10 6.5S2 12 2 12z" /><circle cx="12" cy="12" r="2.8" />',
  eye_off: '<path d="M3 3l18 18M10.6 10.6a2.5 2.5 0 0 0 3.5 3.5M9.4 5.2A10.8 10.8 0 0 1 12 5c6.2 0 10 7 10 7a16.8 16.8 0 0 1-3.2 4.1M6.4 6.4A16.5 16.5 0 0 0 2 12s3.8 7 10 7c1.4 0 2.7-.3 3.9-.8" />',
  camera: '<rect x="3" y="7" width="13" height="10" rx="2" /><path d="M16 10l5-3v10l-5-3z" />',
  camera_tps: '<rect x="3" y="7" width="13" height="10" rx="2" /><path d="M16 10l5-3v10l-5-3z" />',
  camera_fps: '<circle cx="12" cy="12" r="8" /><circle cx="12" cy="12" r="2.2" /><path d="M12 2v3M12 19v3M2 12h3M19 12h3" />',
  map: '<polygon points="3,6 9,3 15,6 21,3 21,18 15,21 9,18 3,21" /><line x1="9" y1="3" x2="9" y2="18" /><line x1="15" y1="6" x2="15" y2="21" />',
  shield: '<path d="M12 3l7 3v5.5c0 4.6-3 8.3-7 9.8-4-1.5-7-5.2-7-9.8V6l7-3z" />',
  shoulder: '<path d="M4 9l6-4h4l6 4v5l-3 2v-4l-5-2-5 2v4l-3-2V9z" />',
  weapon_rifle: '<path d="M3 10h13l3 2H9l-1 4H5l1-4H3v-2zM19 10V8" />',
  weapon_saber: '<path d="M5 19l4-4M9 15l10-10" /><circle cx="19" cy="5" r="1.4" />',
  armor_core: '<path d="M6 5l6-2 6 2v6c0 4.5-2.6 8-6 10-3.4-2-6-5.5-6-10V5z" /><path d="M9 10h6M12 8v6" />',
  armor_lining: '<path d="M4 8l8-4 8 4-8 4-8-4zM4 13l8 4 8-4M4 17.5l8 4 8-4" />',
  link: '<path d="M10 13a4 4 0 0 1 0-5.6l2-2a4 4 0 0 1 5.6 5.6l-1 1M14 11a4 4 0 0 1 0 5.6l-2 2a4 4 0 0 1-5.6-5.6l1-1" />',
  symmetry: '<line x1="12" y1="4" x2="12" y2="20" stroke-dasharray="2 2" /><polyline points="8,8 4,12 8,16" /><polyline points="16,8 20,12 16,16" />',
  collapse: '<path d="M15 6l-6 6 6 6" /><path d="M5 5v14" />',
  expand: '<path d="M9 6l6 6-6 6" /><path d="M19 5v14" />',
  chevron_left: '<polyline points="15,6 9,12 15,18" />',
  chevron_right: '<polyline points="9,6 15,12 9,18" />',
  audio: '<path d="M5 9v6h4l5 4V5l-5 4H5z" /><path d="M17.5 8.5a5 5 0 0 1 0 7" />',
  display: '<rect x="3" y="4" width="18" height="12" rx="2" /><path d="M8 20h8M12 16v4" />',
  controls: '<path d="M6 12h4M8 10v4M15.5 11h.1M17.5 13h.1" /><rect x="3" y="7" width="18" height="10" rx="5" />',
  keybind: '<rect x="3" y="6" width="18" height="12" rx="2" /><path d="M7 10h2M11 10h2M15 10h2M7 14h10" />',
  keybinds: '<rect x="3" y="6" width="18" height="12" rx="2" /><path d="M7 10h2M11 10h2M15 10h2M7 14h10" />',
  solo: '<circle cx="12" cy="8" r="3.5" /><path d="M5 20a7 7 0 0 1 14 0" />',
  lobby: '<circle cx="9" cy="8.5" r="3" /><circle cx="16.5" cy="9.5" r="2.3" /><path d="M3 19.5a6 6 0 0 1 12 0M14 19.5a4.5 4.5 0 0 1 7 0" />',
  create: '<rect x="4" y="4" width="16" height="16" rx="3" /><path d="M12 8v8M8 12h8" />',
  join: '<path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4" /><polyline points="10,17 15,12 10,7" /><line x1="15" y1="12" x2="3" y2="12" />',
  chevron_down: '<polyline points="6,9 12,15 18,9" />',
  chevron_up: '<polyline points="6,15 12,9 18,15" />',
  warning: '<path d="M12 4L3 20h18L12 4z" /><line x1="12" y1="10" x2="12" y2="14" /><circle cx="12" cy="17.2" r="0.7" fill="currentColor" />',
  check: '<polyline points="5,13 10,18 19,7" />',
  voice_comms: '<rect x="9" y="3" width="6" height="11" rx="3" /><path d="M5 11a7 7 0 0 0 14 0M12 18v3M8 21h8" />',
  severed_blade: '<path d="M4 20l6-6M14 10l6-6" /><line x1="9" y1="9" x2="15" y2="15" stroke-dasharray="2 2" />',
  help_manual: '<circle cx="12" cy="12" r="9" /><path d="M9.5 9.5a2.6 2.6 0 0 1 5 .8c0 1.8-2.5 2.1-2.5 3.7" /><circle cx="12" cy="17.2" r="0.6" fill="currentColor" />',
  reset: '<path d="M3 12a9 9 0 1 0 3-6.7L3 8" /><polyline points="3,3 3,8 8,8" />',
});

/**
 * Generates uniform 1.75px stroke-width vector SVG UI icons (zero system emojis).
 */
export function renderUiIconSvg(kind = 'sortie', opts = {}) {
  const stroke = clampColor(opts.color, 'currentColor');
  const strokeExpr = stroke === 'currentColor' ? 'currentColor' : stroke;
  const size = Number(opts.size) > 0 ? Number(opts.size) : 16;
  const body = UI_ICON_PATHS[kind] || UI_ICON_PATHS.sortie;
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" ` +
    `fill="none" stroke="${strokeExpr}" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">` +
    body +
    `</svg>`
  );
}

/**
 * Generates geometric contour SVG preview icon for each of the 4 inverse-armor shields.
 */
export function renderShieldIconSvg(shieldDef = {}) {
  const color = clampColor(shieldDef.barrierColor, '#32e8ff');
  const mode = shieldDef.coverageMode || 'rect_tower';
  let shape = `<rect x="7" y="4" width="10" height="16" rx="1.8" fill="${color}" fill-opacity="0.18" stroke="${color}" stroke-width="1.8" /><rect x="10" y="7.5" width="4" height="5" rx="0.8" fill="#ffffff" fill-opacity="0.5" />`;
  if (mode === 'buckler_disc') {
    shape = `<circle cx="12" cy="12" r="7.5" fill="${color}" fill-opacity="0.2" stroke="${color}" stroke-width="1.8" /><circle cx="12" cy="12" r="3" stroke="${color}" stroke-width="1.4" />`;
  } else if (mode === 'hemisphere') {
    shape = `<path d="M4 15a8 8 0 0 1 16 0z" fill="${color}" fill-opacity="0.22" stroke="${color}" stroke-width="1.8" /><path d="M7.5 15a4.5 4.5 0 0 1 9 0" stroke="#ffffff" stroke-opacity="0.65" stroke-width="1.2" />`;
  } else if (mode === 'full_sphere') {
    shape = `<circle cx="12" cy="12" r="8.5" fill="${color}" fill-opacity="0.16" stroke="${color}" stroke-width="1.8" stroke-dasharray="3 1.5" /><polygon points="12,5.5 17.5,8.8 17.5,15.2 12,18.5 6.5,15.2 6.5,8.8" stroke="${color}" stroke-opacity="0.7" stroke-width="1.2" />`;
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">${shape}</svg>`;
}

/**
 * Generates dual-tone finish swatch preview SVG for paint dropdown items.
 */
export function renderFinishSwatchSvg(finish = 'standard', primary = '#c9d4e0', secondary = '#3c5e88') {
  const finId = typeof finish === 'object' && finish ? finish.id || finish.pattern : finish;
  const finPattern = typeof finish === 'object' && finish ? finish.pattern : null;
  const c1 = clampColor(primary, '#c9d4e0');
  const c2 = clampColor(secondary, '#3c5e88');
  let overlay = '';
  if (finId === 'hazard' || finPattern === 'hazard_stripes') {
    overlay = `<line x1="2" y1="18" x2="18" y2="2" stroke="#181b20" stroke-width="2.6" />`;
  } else if (finId === 'carbon' || finPattern === 'carbon_weave') {
    overlay = `<path d="M4 4h4v4H4zM12 12h4v4h-4z" fill="#000000" fill-opacity="0.35" />`;
  } else if (finId === 'chrome' || finId === 'glossy') {
    overlay = `<line x1="4" y1="14" x2="14" y2="4" stroke="#ffffff" stroke-opacity="0.75" stroke-width="2" />`;
  } else if (finId === 'digital_camo' || finPattern === 'digital_camo') {
    overlay = `<rect x="3" y="10" width="5" height="4" fill="#ffffff" fill-opacity="0.22" /><rect x="11" y="4" width="5" height="4" fill="#000000" fill-opacity="0.25" />`;
  }
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 20 20" aria-hidden="true">` +
    `<polygon points="2,2 18,2 2,18" fill="${c1}" />` +
    `<polygon points="18,2 18,18 2,18" fill="${c2}" />` +
    overlay +
    `<rect x="1" y="1" width="18" height="18" rx="3" fill="none" stroke="rgba(255,255,255,0.45)" stroke-width="1.2" />` +
    `</svg>`
  );
}

/**
 * [Task 6] Generates a crisp 5-Axis Tactical Pentagon Radar SVG comparing base frame vs current modular build.
 */
export function renderMechaRadarSvg({
  metrics = {},
  baseMetrics = null,
  compareMetrics = null,
  overloadState = 'nominal',
  nominalColor = '#38bdf8',
} = {}) {
  const axes = [
    { key: 'mobility', label: 'MOB' },
    { key: 'firepower', label: 'PWR' },
    { key: 'melee', label: 'MEL' },
    { key: 'armor', label: 'ARM' },
    { key: 'tech', label: 'TEC' },
  ];
  const cx = 78;
  const cy = 74;
  const maxR = 46;

  const fillCol =
    overloadState === 'overloaded'
      ? '#ff5c72'
      : overloadState === 'heavy'
        ? '#ffb547'
        : clampColor(nominalColor, '#38bdf8');

  const polyPoints = (src, scale = 1.0) =>
    axes
      .map((ax, idx) => {
        const angle = -Math.PI / 2 + (idx * 2 * Math.PI) / axes.length;
        const val = Math.max(0.08, Math.min(1, (Number(src?.[ax.key]) || 50) / 100)) * scale;
        const r = val * maxR;
        return `${(cx + Math.cos(angle) * r).toFixed(1)},${(cy + Math.sin(angle) * r).toFixed(1)}`;
      })
      .join(' ');

  const rings = [0.33, 0.66, 1.0]
    .map((ring) => {
      const pts = axes
        .map((_, idx) => {
          const angle = -Math.PI / 2 + (idx * 2 * Math.PI) / axes.length;
          const r = ring * maxR;
          return `${(cx + Math.cos(angle) * r).toFixed(1)},${(cy + Math.sin(angle) * r).toFixed(1)}`;
        })
        .join(' ');
      return `<polygon points="${pts}" fill="none" stroke="rgba(148,187,224,0.22)" stroke-width="1" />`;
    })
    .join('');

  const spokes = axes
    .map((ax, idx) => {
      const angle = -Math.PI / 2 + (idx * 2 * Math.PI) / axes.length;
      const x2 = (cx + Math.cos(angle) * maxR).toFixed(1);
      const y2 = (cy + Math.sin(angle) * maxR).toFixed(1);
      const lx = (cx + Math.cos(angle) * (maxR + 14)).toFixed(1);
      const ly = (cy + Math.sin(angle) * (maxR + 12) + 3).toFixed(1);
      const val = Math.round(Number(metrics?.[ax.key]) || 0);
      return (
        `<line x1="${cx}" y1="${cy}" x2="${x2}" y2="${y2}" stroke="rgba(148,187,224,0.24)" stroke-width="1" />` +
        `<text x="${lx}" y="${ly}" text-anchor="middle" font-family="monospace" font-size="8.5" font-weight="700" fill="#a8c9e8">${ax.label} ${val}</text>`
      );
    })
    .join('');

  const basePoly = baseMetrics
    ? `<polygon points="${polyPoints(baseMetrics)}" fill="none" stroke="rgba(255,255,255,0.4)" stroke-width="1.1" stroke-dasharray="3 2" />`
    : '';

  const comparePoly = compareMetrics
    ? `<polygon points="${polyPoints(compareMetrics)}" fill="#ff8a2b" fill-opacity="0.14" stroke="#ff8a2b" stroke-width="1.6" stroke-dasharray="4 2" />`
    : '';

  const curPoly = `<polygon points="${polyPoints(metrics)}" fill="${fillCol}" fill-opacity="0.28" stroke="${fillCol}" stroke-width="2" />`;

  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 156 146" width="156" height="146" role="img" aria-label="Mecha 5-Axis Radar">` +
    rings +
    spokes +
    basePoly +
    comparePoly +
    curPoly +
    `</svg>`
  );
}

const DELTA_AXES = [
  ['mobility', 'MOB'],
  ['firepower', 'FPW'],
  ['melee', 'MEL'],
  ['armor', 'ARM'],
  ['tech', 'TEC'],
];

export function computeMetricDeltas(metrics = null, compareMetrics = null) {
  if (!metrics || !compareMetrics) return [];
  return DELTA_AXES.map(([key, label]) => {
    const a = Math.round(Number(metrics[key]) || 0);
    const b = Math.round(Number(compareMetrics[key]) || 0);
    const delta = b - a;
    const sign = delta > 0 ? 'pos' : delta < 0 ? 'neg' : 'zero';
    const prefix = delta > 0 ? '+' : '';
    return { key, label, delta, sign, text: `${prefix}${delta} ${label}` };
  });
}

export function renderShieldTradeoffChartSvg({ shields = [], activeId = 'SH03' } = {}) {
  const list = Array.isArray(shields) ? shields : [];
  const W = 260;
  const H = 64;
  const padX = 24;
  const padY = 12;
  const normId = (id) => String(id || 'SH').replace(/^EF-/, '');
  const activeNorm = normId(activeId);
  const covOf = (s) => {
    const explicit = Number(s?.coverageRatio);
    if (explicit > 0) return explicit;
    const yawDeg = Number(s?.yawHalfDeg);
    if (yawDeg > 0) return yawDeg / 180;
    return 0.25;
  };
  const maxCov = Math.max(1, ...list.map(covOf));
  const maxDur = Math.max(1, ...list.map((s) => Number(s?.maxDurationSec) || 4));
  const pts = list
    .map((s) => {
      const shortId = normId(s?.id);
      return {
        id: escapeXml(shortId),
        x: padX + (covOf(s) / maxCov) * (W - padX * 2),
        y: H - padY - ((Number(s?.maxDurationSec) || 1) / maxDur) * (H - padY * 2),
        active: s?.id === activeId || shortId === activeNorm,
      };
    })
    .sort((a, b) => a.x - b.x);
  const pathD = pts.length ? `M ${pts.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' L ')}` : '';
  const nodes = pts
    .map((p) =>
      p.active
        ? `<circle cx="${p.x.toFixed(1)}" cy="${p.y.toFixed(1)}" r="4.5" fill="#ff8a2b" stroke="#fff3e6" stroke-width="1.4" />` +
          `<text x="${p.x.toFixed(1)}" y="${Math.max(10, p.y - 7).toFixed(1)}" text-anchor="middle" font-family="monospace" font-size="8.5" font-weight="700" fill="#ffcf99">${p.id}</text>`
        : `<circle cx="${p.x.toFixed(1)}" cy="${p.y.toFixed(1)}" r="2.8" fill="#92a6bd" />` +
          `<text x="${p.x.toFixed(1)}" y="${Math.max(10, p.y - 6).toFixed(1)}" text-anchor="middle" font-family="monospace" font-size="7.5" fill="#70859d">${p.id}</text>`,
    )
    .join('');
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="100%" height="${H}" role="img" aria-label="Shield Area vs Duration Curve">` +
    `<rect x="0.5" y="0.5" width="${W - 1}" height="${H - 1}" rx="4" fill="rgba(10,15,23,0.7)" stroke="rgba(180,205,232,0.14)" />` +
    `<line x1="${padX}" y1="${H - padY}" x2="${W - padX}" y2="${H - padY}" stroke="rgba(180,205,232,0.2)" stroke-width="1" />` +
    `<line x1="${padX}" y1="${padY}" x2="${padX}" y2="${H - padY}" stroke="rgba(180,205,232,0.2)" stroke-width="1" />` +
    (pathD ? `<path d="${pathD}" fill="none" stroke="rgba(226,236,248,0.42)" stroke-width="1.4" stroke-dasharray="3 2" />` : '') +
    nodes +
    `<text x="${W - 6}" y="${H - 3}" text-anchor="end" font-family="monospace" font-size="7" fill="#6b8098">AREA</text>` +
    `<text x="6" y="10" font-family="monospace" font-size="7" fill="#6b8098">SEC</text>` +
    `</svg>`
  );
}

export function renderTwrGaugeSvg({ twrRatio = 1.5, payloadPct = 50, overloadState = 'nominal' } = {}) {
  const W = 240;
  const H = 26;
  const pct = Math.max(0, Math.min(100, Number(payloadPct) || 0));
  const cursorNum = 8 + (pct / 100) * (W - 16);
  const accent = overloadState === 'overloaded' ? '#ff5470' : overloadState === 'heavy' ? '#f5b942' : '#ff8a2b';
  const twrStr = (Number(twrRatio) || 0).toFixed(2);
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="100%" height="${H}" role="img" aria-label="TWR Payload Gauge">` +
    `<rect x="8" y="8" width="${(W - 16) * 0.72}" height="5" rx="2" fill="rgba(180,205,232,0.22)" />` +
    `<rect x="${8 + (W - 16) * 0.72}" y="8" width="${(W - 16) * 0.18}" height="5" fill="rgba(245,185,66,0.34)" />` +
    `<rect x="${8 + (W - 16) * 0.9}" y="8" width="${(W - 16) * 0.1}" height="5" rx="2" fill="rgba(255,84,112,0.42)" />` +
    `<line x1="${8 + (W - 16) * 0.72}" y1="5" x2="${8 + (W - 16) * 0.72}" y2="16" stroke="rgba(245,185,66,0.75)" stroke-width="1" />` +
    `<line x1="${8 + (W - 16) * 0.9}" y1="5" x2="${8 + (W - 16) * 0.9}" y2="16" stroke="rgba(255,84,112,0.85)" stroke-width="1" />` +
    `<rect x="${(cursorNum - 2).toFixed(1)}" y="4" width="4" height="13" rx="1" fill="${accent}" />` +
    `<text x="8" y="24" font-family="monospace" font-size="8" fill="#92a6bd">TWR ${twrStr}</text>` +
    `<text x="${W - 8}" y="24" text-anchor="end" font-family="monospace" font-size="8" fill="${accent}">${Math.round(pct)}% LOAD</text>` +
    `</svg>`
  );
}

export function renderPostMatchTimelineSvg({ timeline = [], durationSec = 30 } = {}) {
  const W = 520;
  const H = 56;
  const totalSec = Math.max(1, Number(durationSec) || 1);
  const events = Array.isArray(timeline) ? timeline : [];
  const xFor = (t) => 16 + Math.max(0, Math.min(1, (Number(t) || 0) / totalSec)) * (W - 32);
  let yCur = 28;
  const wavePts = [`16,${yCur}`];
  const dots = [];
  for (let idx = 0; idx < events.length; idx++) {
    const ev = events[idx];
    const x = xFor(ev?.timeSec);
    const t = String(ev?.type || '');
    let col = '#e4ecf5';
    if (t === 'PARRY' || t === 'SABER_CLASH') {
      col = '#f5b942';
      yCur = Math.max(12, yCur - 5);
    } else if (t === 'PART_BREAK' || t === 'STAGGER' || t === 'ROUND_LOSS') {
      col = ev?.actor === 'enemy' ? '#ff8a2b' : '#ff5470';
      yCur = ev?.actor === 'enemy' ? Math.max(10, yCur - 6) : Math.min(44, yCur + 6);
    } else if (t === 'ROUND_WIN' || t === 'MATCH_END') {
      col = '#34d399';
    }
    wavePts.push(`${x.toFixed(1)},${yCur.toFixed(1)}`);
    dots.push(`<circle class="pm-tl-dot" data-event-idx="${idx}" cx="${x.toFixed(1)}" cy="${yCur.toFixed(1)}" r="3.6" fill="${col}" stroke="#070b11" stroke-width="1" />`);
  }
  wavePts.push(`${W - 16},${yCur.toFixed(1)}`);
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="100%" height="${H}" role="img" aria-label="Combat Timeline Sparkline">` +
    `<rect x="0.5" y="0.5" width="${W - 1}" height="${H - 1}" rx="6" fill="#0d131d" stroke="rgba(180,205,232,0.14)" />` +
    `<line x1="16" y1="28" x2="${W - 16}" y2="28" stroke="rgba(180,205,232,0.16)" stroke-dasharray="3 3" />` +
    `<polyline points="${wavePts.join(' ')}" fill="none" stroke="rgba(228,236,245,0.65)" stroke-width="1.6" stroke-linejoin="round" />` +
    dots.join('') +
    `<text x="16" y="${H - 5}" font-family="monospace" font-size="8" fill="#70859d">00:00</text>` +
    `<text x="${W - 16}" y="${H - 5}" text-anchor="end" font-family="monospace" font-size="8" fill="#70859d">${totalSec.toFixed(1)}s</text>` +
    `</svg>`
  );
}

export function renderCareerArcSvg({ label = 'RATE', pct = 0, accentColor = '#ff8a2b' } = {}) {
  const safePct = Math.max(0, Math.min(100, Math.round(Number(pct) || 0)));
  const col = clampColor(accentColor, '#ff8a2b');
  const r = 20;
  const circ = 2 * Math.PI * r;
  const offset = (circ * (1 - safePct / 100)).toFixed(1);
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" width="58" height="58" role="img" aria-label="${escapeXml(label)} ${safePct}%">` +
    `<circle cx="32" cy="28" r="${r}" fill="none" stroke="rgba(180,205,232,0.14)" stroke-width="4.5" />` +
    `<circle cx="32" cy="28" r="${r}" fill="none" stroke="${col}" stroke-width="4.5" stroke-linecap="round" ` +
    `stroke-dasharray="${circ.toFixed(1)}" stroke-dashoffset="${offset}" transform="rotate(-90 32 28)" />` +
    `<text x="32" y="31" text-anchor="middle" font-family="monospace" font-size="11" font-weight="700" fill="#e4ecf5">${safePct}%</text>` +
    `<text x="32" y="59" text-anchor="middle" font-family="monospace" font-size="7.5" fill="#92a6bd">${escapeXml(label)}</text>` +
    `</svg>`
  );
}

export function renderMechaPaperdollSvg(partDamage = {}, { width = 54, height = 72 } = {}) {
  const p = partDamage || {};
  const styleFor = (id) => {
    const st = p[id]?.severed ? 'severed' : p[id]?.status || 'intact';
    if (st === 'severed') return { stroke: '#ff5470', fill: 'rgba(255,84,112,0.18)', dash: 'stroke-dasharray="2.5 2"' };
    if (st === 'broken') return { stroke: '#ff5470', fill: 'rgba(255,84,112,0.34)', dash: '' };
    if (st === 'damaged') return { stroke: '#f5b942', fill: 'rgba(245,185,66,0.25)', dash: '' };
    return { stroke: '#c5d4e6', fill: 'rgba(180,205,232,0.16)', dash: '' };
  };
  const hd = styleFor('head');
  const tr = styleFor('torso');
  const al = styleFor('arm_l');
  const ar = styleFor('arm_r');
  const bk = styleFor('backpack');
  const lg = styleFor('legs');
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 54 72" width="${width}" height="${height}" role="img" aria-label="Mecha 6-Part Damage Silhouette">` +
    `<rect data-doll-part="backpack" x="15" y="14" width="24" height="10" rx="2" fill="${bk.fill}" stroke="${bk.stroke}" stroke-width="1.1" opacity="0.65" ${bk.dash} />` +
    `<polygon data-doll-part="head" points="22,6 32,6 34,13 20,13" fill="${hd.fill}" stroke="${hd.stroke}" stroke-width="1.3" ${hd.dash} />` +
    `<polygon data-doll-part="torso" points="18,16 36,16 33,34 21,34" fill="${tr.fill}" stroke="${tr.stroke}" stroke-width="1.4" ${tr.dash} />` +
    `<polygon data-doll-part="arm_l" points="7,17 16,17 14,39 6,37" fill="${al.fill}" stroke="${al.stroke}" stroke-width="1.3" ${al.dash} />` +
    `<polygon data-doll-part="arm_r" points="38,17 47,17 48,37 40,39" fill="${ar.fill}" stroke="${ar.stroke}" stroke-width="1.3" ${ar.dash} />` +
    `<path data-doll-part="legs" d="M21 36h5v28h-6zM28 36h5l1 28h-6z" fill="${lg.fill}" stroke="${lg.stroke}" stroke-width="1.3" ${lg.dash} />` +
    `</svg>`
  );
}
