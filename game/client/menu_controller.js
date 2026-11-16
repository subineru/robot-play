/**
 * PLAY_ROBOTS Client Menu & Categorized Settings UI Adapter (Layer 1 Client).
 * Owns Main Menu, 4-Sub-Tab Settings Center, Dual-Layer Pause Hub, Shield Spec Card,
 * TacticalSelect Dropdowns, 9-Zone Asymmetric Paint Studio, and dynamic Combat HUD sync.
 */
import { CAMERA_MODES } from '../shared/constants.js?v=20261116_t75e';
import {
  SHIELD_IDS,
  MAP_IDS,
  SAMPLE_ONLINE_LOBBIES,
  createCatalogRegistry,
  validateMechaBuild,
} from '../shared/catalog.js?v=20261116_t75e';
import {
  renderPilotPortraitSvg,
  renderMapBlueprintSvg,
  renderUiIconSvg,
  renderShieldIconSvg,
  renderFinishSwatchSvg,
  renderMechaRadarSvg,
  computeMetricDeltas,
  renderShieldTradeoffChartSvg,
  renderTwrGaugeSvg,
  renderPostMatchTimelineSvg,
  renderCareerArcSvg,
  renderMechaPaperdollSvg,
} from '../shared/blueprint_svg.js?v=20261116_t75e';
import { computeLoadoutWeightTax } from '../shared/kinematics.js?v=20261116_t75e';
import { ARM_LOADOUT_PRESETS } from '../shared/loadout.js?v=20261116_t75e';
import {
  MECHA_SKINS,
  PAINT_ZONES,
  PAINT_FINISHES,
  MILITARY_PAINT_SWATCHES,
  getSkinById,
  createCustomPaintState,
  resolveEffectivePalette,
} from '../shared/skins.js?v=20261116_t75e';
import { createTacticalSelect } from './tactical_select.js?v=20261116_t75e';
import {
  upgradeTacticalSlider,
  upgradeTacticalSwitch,
  createTacticalSwatchPicker,
} from './tactical_controls.js?v=20261116_t75e';
import { createHudOverlay } from './hud_overlay.js?v=20261116_t75e';
import {
  QUALITY_PRESETS,
  KEYBIND_GROUPS,
  KEYBIND_ACTIONS,
  formatKeyCodeLabel,
  resolveEffectivePixelRatio,
} from '../shared/settings_store.js?v=20261116_t75e';
import {
  APP_SCREENS,
  MAIN_MENU_TABS,
  PAUSE_VIEWS,
  SETTINGS_TABS,
  ARMORY_SLOTS,
  resolveSortieReadiness,
} from '../shared/menu_state.js?v=20261116_t75e';
import {
  BGM_CONTEXTS,
  BGM_TRACK_OFF,
  BGM_COMBAT_AUTO,
  DEFAULT_BGM_SETTINGS,
  createBgmRegistry,
} from '../shared/bgm_catalog.js?v=20261116_t75e';

const SVG_PARSER = typeof DOMParser !== 'undefined' ? new DOMParser() : null;

function mountSvgString(container, svgText) {
  if (!container) return;
  container.replaceChildren();
  if (!svgText || !SVG_PARSER) return;
  const doc = SVG_PARSER.parseFromString(svgText, 'image/svg+xml');
  const svgEl = doc?.documentElement;
  if (svgEl && svgEl.nodeName.toLowerCase() === 'svg') {
    container.appendChild(document.importNode(svgEl, true));
  }
}

function makeSkinSwatchSvg(primary, secondary, accent) {
  return `<svg viewBox="0 0 20 20" xmlns="http://www.w3.org/2000/svg"><rect width="20" height="20" rx="4" fill="${primary}"/><polygon points="20,0 20,20 0,20" fill="${secondary}"/><circle cx="10" cy="10" r="3.4" fill="${accent}"/></svg>`;
}

function resolveStatusBadgeMeta(item) {
  if (!item || item.status === 'playable') {
    return { text: 'ACTIVE', cls: 'badge-active' };
  }
  if (item.status === 'purchasable_locked') {
    return { text: `${item.priceMc || 0} MC`, cls: 'badge-purchasable' };
  }
  return { text: `${item.plannedTask || '施工藍圖'}`, cls: 'badge-blueprint' };
}

const COVERAGE_SHAPE_LABELS = Object.freeze({
  buckler_disc: '小型圓盤力場 (0.62m)',
  rect_tower: '正面矩形光牆 + 高透觀測窗 (0.64×1.04m)',
  hemisphere: '180° 雙翼展開半罩 (1.38m)',
  full_sphere: '360° 全向球形護罩 (2.10m)',
});

/**
 * Create and bind all Main Menu, Pause Hub, Settings Sub-Tabs, and HUD telemetry handlers.
 */
export function createMenuController({ settingsStore, showToast, popManager = null, getApp, onUiFeedback = null }) {
  const catalog = createCatalogRegistry();
  const emitUiSound = (kind) => {
    if (onUiFeedback) {
      onUiFeedback(kind);
    } else {
      getApp()?.audio?.playUiFeedback?.(kind);
    }
  };

  // Hydrate all static anti-emoji vector icon placeholders
  document.querySelectorAll('[data-ui-icon]').forEach((el) => {
    const kind = el.dataset.uiIcon;
    if (kind) mountSvgString(el, renderUiIconSvg(kind, { size: 15 }));
  });

  // HUD overlay delegated to client/hud_overlay.js
  const hudOverlay = createHudOverlay({ settingsStore });

  // Tactical tooltip binding helper (idempotently binds tooltips to static & dynamic elements)
  const bindAllTooltips = (root = document) => {
    if (!popManager || !root) return;
    try {
      const targets = [];
      if (typeof root.querySelectorAll === 'function') {
        const found = root.querySelectorAll('[title], [data-tactical-title]');
        if (found) {
          found.forEach((el) => targets.push(el));
        }
      }
      if (typeof root.hasAttribute === 'function' && root.hasAttribute('title')) {
        targets.push(root);
      } else if (root.dataset?.tacticalTitle) {
        targets.push(root);
      }
      targets.forEach((el) => {
        popManager.bindTooltip(el);
      });
    } catch (_) {}
  };

  // Shell & shared settings mount refs
  const mmPanelHeadingEl = document.getElementById('mm-panel-heading');
  const collapsePanelBtn = document.getElementById('btn-collapse-panel');
  const expandPanelBtn = document.getElementById('btn-expand-panel');
  const mmTabBarEl = document.getElementById('mm-tab-bar');
  const breadcrumbHomeBtn = document.getElementById('btn-breadcrumb-home');
  const homeBladeBtns = document.querySelectorAll('[data-home-tab]');
  const homeDeployMetaEl = document.getElementById('mm-home-deploy-meta');
  const homeDeployBtn = document.getElementById('btn-home-deploy');
  const modeBackHomeBtn = document.getElementById('btn-mode-back-home');
  const sortieModeCards = document.querySelectorAll('[data-sortie-mode]');
  const sortieBackModeBtn = document.getElementById('btn-sortie-back-mode');
  const sortieModeBadgeBarEl = document.getElementById('mm-sortie-mode-badge-bar');
  const sortieBriefingTitleEl = document.getElementById('mm-sortie-briefing-title');
  const keycapHintsEl = document.getElementById('mm-keycap-hints');
  const mmStageTagEl = document.getElementById('mm-camera-tag');
  const pauseDprBadgeEl = document.getElementById('pause-dpr-badge');
  const mainSettingsSlot = document.getElementById('main-settings-slot');
  const pauseSettingsSlot = document.getElementById('pause-settings-slot');
  const settingsRootEl = document.getElementById('settings-center-root');
  const settingsSubnavEl = document.getElementById('settings-subnav');

  // Header Pilot & Economy + Post-Match Debrief refs
  const pilotHudBadgeEl = document.getElementById('mm-pilot-hud-badge');
  const headerPilotSvgEl = document.getElementById('mm-header-pilot-svg');
  const headerPilotNameEl = document.getElementById('mm-header-pilot-name');
  const headerPilotTitleEl = document.getElementById('mm-header-pilot-title');
  const mmMcTextEl = document.getElementById('mm-mc-text');
  const donateTeaserBtn = document.getElementById('btn-donate-teaser');
  const pmRankBadgeEl = document.getElementById('pm-rank-badge');
  const pmTitleEl = document.getElementById('pm-title');
  const pmSubtitleEl = document.getElementById('pm-subtitle');
  const pmScorePillEl = document.getElementById('pm-score-pill');
  const pmStatApEl = document.getElementById('pm-stat-ap');
  const pmStatParryEl = document.getElementById('pm-stat-parry');
  const pmStatClashEl = document.getElementById('pm-stat-clash');
  const pmStatDmgEl = document.getElementById('pm-stat-dmg');
  const pmMcTotalEl = document.getElementById('pm-mc-total');
  const pmMcDetailEl = document.getElementById('pm-mc-detail');
  const pmTimelineListEl = document.getElementById('pm-timeline-list');
  const pmTimelineChartBoxEl = document.getElementById('pm-timeline-chart-box');
  const pmDamageAuditEl = document.getElementById('pm-damage-audit');

  // Sortie tab refs (Solo vs Lobby + Hero Map Carousel)
  const lobbyCreateBtn = document.getElementById('btn-lobby-create');
  const lobbyJoinBtn = document.getElementById('btn-lobby-join');
  const lobbyNameInput = document.getElementById('mm-lobby-name-input');
  const lobbyModeHostEl = document.getElementById('mm-lobby-mode-select-host');
  const chkLobbyAiFill = document.getElementById('chk-lobby-ai-fill');
  const chkLobbyPassword = document.getElementById('chk-lobby-password');
  const lobbySearchInput = document.getElementById('mm-lobby-search');
  const lobbyListEl = document.getElementById('mm-lobby-list');
  const mapCarouselSectionEl = document.getElementById('mm-map-carousel-section');
  const mapPrevBtn = document.getElementById('btn-map-prev');
  const mapNextBtn = document.getElementById('btn-map-next');
  const mapDotsEl = document.getElementById('mm-map-dots');
  const mmMapSvgBoxEl = document.getElementById('mm-map-svg-box');
  const mmMapDetailsEl = document.getElementById('mm-map-details');
  const envDayBtn = document.getElementById('mm-env-day');
  const envNightBtn = document.getElementById('mm-env-night');
  const sortieSummaryEl = document.getElementById('mm-sortie-summary');
  const mmSortieDockEl = document.getElementById('mm-sortie-dock');
  const manualPopBtn = document.getElementById('btn-manual-pop');
  const careerManualBtn = document.getElementById('btn-career-manual');
  const pauseRestartLabelEl = document.getElementById('btn-pause-restart-label');
  const readinessBannerEl = document.getElementById('mm-readiness-banner');
  const launchSortieBtn = document.getElementById('btn-launch-sortie');
  const launchLabelEl = document.getElementById('btn-launch-label');

  // Armory 8-slot & Paint tab refs
  const armoryPinsEl = document.getElementById('armory-3d-pins');
  const armorySlotStripEl = document.getElementById('mm-armory-slot-strip');
  const mmMechaGridEl = document.getElementById('mm-mecha-grid');
  const mmMechaInspectorEl = document.getElementById('mm-mecha-inspector');
  const mmPilotGridEl = document.getElementById('mm-pilot-grid');
  const mmPilotInspectorEl = document.getElementById('mm-pilot-inspector');
  const armoryPresetsBarEl = document.getElementById('mm-armory-presets-bar');
  const armoryPresetsRowEl = document.getElementById('mm-armory-presets-row');
  const lHandGridEl = document.getElementById('mm-lhand-weapon-grid');
  const rHandGunStatusEl = document.getElementById('mm-rhand-gun-status');
  const rHandGunGridEl = document.getElementById('mm-rhand-gun-grid');
  const rHandGridEl = document.getElementById('mm-rhand-weapon-grid');
  const lBackGridEl = document.getElementById('mm-lback-grid');
  const lBackInspectorEl = document.getElementById('mm-lback-inspector');
  const rBackGridEl = document.getElementById('mm-rback-grid');
  const rBackInspectorEl = document.getElementById('mm-rback-inspector');
  const armoryRadarSvgEl = document.getElementById('mm-armory-radar-svg');
  const armoryTwrGaugeEl = document.getElementById('armory-twr-gauge');
  const radarDeltasEl = document.getElementById('mm-radar-deltas');
  const armoryBudgetBadgeEl = document.getElementById('mm-armory-budget-badge');
  const armoryOverloadBadgeEl = document.getElementById('mm-armory-overload-badge');
  const armoryPayloadLblEl = document.getElementById('mm-armory-payload-lbl');
  const armoryPayloadPctEl = document.getElementById('mm-armory-payload-pct');
  const armoryPayloadFillEl = document.getElementById('mm-armory-payload-fill');
  const armoryStatChipsEl = document.getElementById('mm-armory-stat-chips');
  const mmShieldGridEl = document.getElementById('mm-shield-grid');
  const shieldSpecCardEl = document.getElementById('shield-spec-card');
  const mmArmorCoreHostEl = document.getElementById('mm-armor-core-select-host');
  const mmArmorLiningHostEl = document.getElementById('mm-armor-lining-select-host');
  const mmArmorInspectorEl = document.getElementById('mm-armor-inspector');
  const mmCareerOverviewEl = document.getElementById('mm-career-overview');

  const mmSkinSelectHostEl = document.getElementById('mm-skin-select-host');
  const mmPaintEconomyBarEl = document.getElementById('mm-paint-economy-bar');
  const mmPaintZoneSelectHostEl = document.getElementById('mm-paint-zone-select-host');
  const paintMirrorArmsBtn = document.getElementById('btn-paint-mirror-arms');
  const paintMirrorArmsLabelEl = document.getElementById('lbl-paint-mirror-arms');
  const mmFinishSelectHostEl = document.getElementById('mm-finish-select-host');
  const diyPickers = {
    primary: document.getElementById('mm-diy-primary'),
    secondary: document.getElementById('mm-diy-secondary'),
    frame: document.getElementById('mm-diy-frame'),
    sensor: document.getElementById('mm-diy-sensor'),
    thruster: document.getElementById('mm-diy-thruster'),
    saber: document.getElementById('mm-diy-saber'),
  };
  const diyHexBadges = {
    primary: document.getElementById('mm-diy-primary-hex'),
    secondary: document.getElementById('mm-diy-secondary-hex'),
    frame: document.getElementById('mm-diy-frame-hex'),
    sensor: document.getElementById('mm-diy-sensor-hex'),
    thruster: document.getElementById('mm-diy-thruster-hex'),
    saber: document.getElementById('mm-diy-saber-hex'),
  };
  const diyMetallicSlider = document.getElementById('mm-diy-metallic');
  const diyMetallicValEl = document.getElementById('mm-diy-metallic-val');
  const diyRoughnessSlider = document.getElementById('mm-diy-roughness');
  const diyRoughnessValEl = document.getElementById('mm-diy-roughness-val');
  const diyApplyAllBtn = document.getElementById('btn-diy-apply-all');
  const diyResetBtn = document.getElementById('btn-diy-reset');

  // Quick Armory refs
  const quickLoadoutGridEl = document.getElementById('quick-loadout-grid');
  const quickShieldGridEl = document.getElementById('quick-shield-grid');
  const quickEnvDayBtn = document.getElementById('quick-env-day');
  const quickEnvNightBtn = document.getElementById('quick-env-night');
  const quickCamBtn = document.getElementById('quick-cam-toggle');
  const quickOrbitBtn = document.getElementById('quick-orbit-toggle');
  const pauseOnlineBannerEl = document.getElementById('pause-online-banner');

  // Categorized settings controls refs
  const qualityPresetHostEl = document.getElementById('quality-preset-select-host');
  const qualityMetaEl = document.getElementById('settings-quality-meta');
  const fovSlider = document.getElementById('fov-slider');
  const fovValEl = document.getElementById('fov-val');
  const shakeSlider = document.getElementById('shake-slider');
  const shakeValEl = document.getElementById('shake-val');
  const chkShowControlsHelp = document.getElementById('chk-show-controls-help');
  const chkSaberGuideSandbox = document.getElementById('chk-saber-guide-sandbox');

  const volSliders = {
    master: { input: document.getElementById('vol-master'), val: document.getElementById('vol-master-val') },
    bgm: { input: document.getElementById('vol-bgm'), val: document.getElementById('vol-bgm-val') },
    weapons: { input: document.getElementById('vol-weapons'), val: document.getElementById('vol-weapons-val') },
    thrusters: { input: document.getElementById('vol-thrusters'), val: document.getElementById('vol-thrusters-val') },
    ambient: { input: document.getElementById('vol-ambient'), val: document.getElementById('vol-ambient-val') },
  };
  const bgmMenuSelectHostEl = document.getElementById('bgm-menu-select-host');
  const bgmCombatSelectHostEl = document.getElementById('bgm-combat-select-host');
  const bgmLocalFileInput = document.getElementById('bgm-local-file-input');
  const bgmImportMenuBtn = document.getElementById('btn-bgm-import-menu');
  const bgmImportCombatBtn = document.getElementById('btn-bgm-import-combat');
  const bgmLocalStatusEl = document.getElementById('bgm-local-status');

  const mouseMappingCardEl = document.getElementById('mouse-mapping-card');
  const chkInvertMouse = document.getElementById('chk-invert-mouse');
  const chkInvertY = document.getElementById('chk-invert-y');
  const sensSlider = document.getElementById('sens-slider');
  const sensValEl = document.getElementById('sens-val');
  const defaultCamHostEl = document.getElementById('default-cam-select-host');

  const rebindHintEl = document.getElementById('settings-rebind-hint');
  const keybindGroupsRootEl = document.getElementById('keybind-groups-root');
  const resetSettingsBtn = document.getElementById('btn-reset-settings');

  const keybindButtons = new Map();

  // Hardware UI Upgrades: Swatches, 9 Sliders, 6 Switches
  const CHANNEL_LABELS = Object.freeze({
    primary: 'PRIMARY // 主裝甲',
    secondary: 'SECONDARY // 副裝甲',
    frame: 'FRAME // 骨架關節',
    sensor: 'SENSOR // 監視器眼',
    thruster: 'THRUSTER // 噴射尾焰',
    saber: 'SABER // 光劍光刃',
  });
  let activePaintChannel = 'primary';
  const swatchPickerHostEl = document.getElementById('mm-swatch-picker-host');
  const diyChannelBtns = document.querySelectorAll('[data-paint-channel]');
  const voiceSliderEl = document.getElementById('vol-voice');

  const applyChannelHexUpdate = (channel, hex) => {
    const inp = diyPickers[channel];
    if (inp) inp.value = hex;
    const hexEl = document.getElementById(`mm-diy-${channel}-hex`);
    if (hexEl) hexEl.textContent = hex.toUpperCase();
    const chipEl = document.querySelector(`[data-channel-chip="${channel}"]`);
    if (chipEl) chipEl.style.setProperty('--chip-color', hex);
    const app = getApp();
    if (!app) return;
    const zoneId = app.menuState?.activePaintZone || 'all';
    app.setZonePaint(zoneId, { [channel]: hex });
    syncSortieSummary();
  };

  const swatchPicker = createTacticalSwatchPicker(swatchPickerHostEl, {
    swatches: MILITARY_PAINT_SWATCHES,
    initialHex: diyPickers.primary?.value || '#c9d4e0',
    onTick: () => emitUiSound('tick'),
    onPickHex: (hex) => {
      applyChannelHexUpdate(activePaintChannel, hex);
    },
  });
  swatchPicker?.setChannelLabel(CHANNEL_LABELS[activePaintChannel]);

  const tacticalSliders = [
    upgradeTacticalSlider(fovSlider, { segments: 20, onTick: () => emitUiSound('tick') }),
    upgradeTacticalSlider(shakeSlider, { segments: 20, onTick: () => emitUiSound('tick') }),
    upgradeTacticalSlider(volSliders.master.input, { segments: 20, onTick: () => emitUiSound('tick') }),
    upgradeTacticalSlider(volSliders.bgm.input, { segments: 20, onTick: () => emitUiSound('tick') }),
    upgradeTacticalSlider(volSliders.weapons.input, { segments: 20, onTick: () => emitUiSound('tick') }),
    upgradeTacticalSlider(volSliders.thrusters.input, { segments: 20, onTick: () => emitUiSound('tick') }),
    upgradeTacticalSlider(volSliders.ambient.input, { segments: 20, onTick: () => emitUiSound('tick') }),
    upgradeTacticalSlider(voiceSliderEl, { segments: 20, onTick: () => emitUiSound('tick') }),
    upgradeTacticalSlider(sensSlider, { segments: 20, onTick: () => emitUiSound('tick') }),
    upgradeTacticalSlider(diyMetallicSlider, { segments: 20, onTick: () => emitUiSound('tick') }),
    upgradeTacticalSlider(diyRoughnessSlider, { segments: 20, onTick: () => emitUiSound('tick') }),
  ].filter(Boolean);

  const tacticalSwitches = [
    upgradeTacticalSwitch(chkShowControlsHelp, { onToggle: () => emitUiSound('tick') }),
    upgradeTacticalSwitch(chkSaberGuideSandbox, { onToggle: () => emitUiSound('tick') }),
    upgradeTacticalSwitch(chkInvertMouse, { onToggle: () => emitUiSound('tick') }),
    upgradeTacticalSwitch(chkInvertY, { onToggle: () => emitUiSound('tick') }),
    upgradeTacticalSwitch(document.getElementById('chk-lobby-ai-fill'), { onToggle: () => emitUiSound('tick') }),
    upgradeTacticalSwitch(document.getElementById('chk-lobby-password'), { onToggle: () => emitUiSound('tick') }),
  ].filter(Boolean);

  const syncAllHardwareControls = () => {
    tacticalSliders.forEach((ctrl) => ctrl?.sync?.());
    tacticalSwitches.forEach((ctrl) => ctrl?.sync?.());
  };

  // Build Main Menu Top Tabs (with Vector SVG Icons & 35ms Camera Micro-Lead)
  let menuTabToken = 0;
  const switchMenuTabWithLead = (tabId) => {
    const app = getApp();
    if (!app) return;
    if (app.menuState?.mainTab === tabId) return;

    // Trigger 3D Hangar Camera Micro-Lead immediately ahead of DOM swap
    app.triggerMenuCameraLead?.(tabId);

    const token = ++menuTabToken;
    const prefersReducedMotion = typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches;
    const leadDelayMs = prefersReducedMotion ? 0 : 35;

    const executeTabSwap = () => {
      if (token !== menuTabToken) return;
      const doApply = () => {
        app.setMainMenuTab(tabId);
      };
      if (typeof document !== 'undefined' && typeof document.startViewTransition === 'function' && !prefersReducedMotion) {
        try {
          document.startViewTransition(() => {
            doApply();
          });
        } catch (_) {
          doApply();
        }
      } else {
        doApply();
      }
    };

    if (leadDelayMs > 0) {
      setTimeout(executeTabSwap, leadDelayMs);
    } else {
      executeTabSwap();
    }
  };

  if (mmTabBarEl) {
    MAIN_MENU_TABS.filter((tab) => tab.id !== 'home').forEach((tab) => {
      const btn = document.createElement('button');
      btn.className = 'mm-tab-btn';
      btn.dataset.mainTab = tab.id;
      const icoSpan = document.createElement('span');
      icoSpan.className = 'mm-tab-icon';
      mountSvgString(icoSpan, renderUiIconSvg(tab.id, { size: 14 }));
      const codeSpan = document.createElement('span');
      codeSpan.className = 'mm-tab-code';
      codeSpan.textContent = tab.code;
      const lblSpan = document.createElement('span');
      lblSpan.textContent = tab.label;
      btn.append(icoSpan, codeSpan, lblSpan);
      btn.addEventListener('mouseenter', () => emitUiSound('hover'));
      btn.onclick = () => {
        emitUiSound('confirm');
        switchMenuTabWithLead(tab.id);
      };
      mmTabBarEl.appendChild(btn);
    });
  }

  // Build Settings Left Sub-Navigation
  if (settingsSubnavEl) {
    SETTINGS_TABS.forEach((tab) => {
      const btn = document.createElement('button');
      btn.className = 'settings-nav-btn';
      btn.dataset.settingsTab = tab.id;
      const lbl = document.createElement('span');
      lbl.textContent = tab.label;
      const sub = document.createElement('span');
      sub.className = 'settings-nav-sub';
      sub.textContent = tab.subLabel;
      btn.append(lbl, sub);
      btn.addEventListener('mouseenter', () => emitUiSound('hover'));
      btn.onclick = () => {
        emitUiSound('tick');
        getApp()?.setSettingsTab(tab.id);
      };
      settingsSubnavEl.appendChild(btn);
    });
  }

  // Build Quality Preset Dropdown & Default Camera Dropdown
  const qualitySelect = createTacticalSelect(qualityPresetHostEl, {
    ariaLabel: '畫質預設與 DPR 上限',
    onUiFeedback: emitUiSound,
    onChange: (val) => settingsStore.update({ graphics: { qualityPreset: val } }),
  });
  qualitySelect?.setOptions(
    Object.values(QUALITY_PRESETS).map((preset) => ({
      value: preset.id,
      label: preset.label,
      subLabel: `DPR ≤ ${preset.dprCap.toFixed(2)}x | Bloom ${preset.bloom ? '開' : '關'} | 陰影 ${preset.shadows ? '開' : '關'}`,
      iconSvg: renderUiIconSvg('display', { size: 14 }),
      badgeText: `DPR ${preset.dprCap}x`,
      badgeClass: 'badge-active',
    })),
  );

  const defaultCamSelect = createTacticalSelect(defaultCamHostEl, {
    ariaLabel: '預設出擊視角',
    onUiFeedback: emitUiSound,
    onChange: (val) => settingsStore.update({ controls: { defaultCameraMode: val } }),
  });
  defaultCamSelect?.setOptions([
    {
      value: 'tps',
      label: 'TPS 第三人稱過肩視角',
      subLabel: '標準機甲過肩跟隨視角 · 易掌握周圍地形',
      iconSvg: renderUiIconSvg('camera', { size: 14 }),
      badgeText: 'DEFAULT',
      badgeClass: 'badge-active',
    },
    {
      value: 'fps_cockpit',
      label: 'FPS 360° 全景線形座艙',
      subLabel: '第一人稱座艙視角 · V 鍵於戰場中即時切換',
      iconSvg: renderUiIconSvg('eye', { size: 14 }),
      badgeText: 'IMMERSIVE',
      badgeClass: 'badge-active',
    },
  ]);

  const localBgmRegistry = createBgmRegistry();
  const bgmMenuSelect = createTacticalSelect(bgmMenuSelectHostEl, {
    ariaLabel: '選擇選單與格納庫背景音樂',
    onUiFeedback: emitUiSound,
    onChange: (val) => settingsStore.update({ music: { menuTrack: val } }),
  });
  const bgmCombatSelect = createTacticalSelect(bgmCombatSelectHostEl, {
    ariaLabel: '選擇實戰與決鬥背景音樂',
    onUiFeedback: emitUiSound,
    onChange: (val) => settingsStore.update({ music: { combatTrack: val } }),
  });

  const refreshBgmSelectOptions = () => {
    const audioTracks = getApp()?.audio?.listBgmTracks?.() || localBgmRegistry.listTracks();
    const menuTracks = audioTracks.filter((t) => t.context === BGM_CONTEXTS.MENU);
    const combatTracks = audioTracks.filter((t) => t.context === BGM_CONTEXTS.COMBAT);

    bgmMenuSelect?.setOptions([
      ...menuTracks.map((t) => ({
        value: t.id,
        label: t.label,
        subLabel: t.subLabel || `${t.musicalKey} · ${t.bpm} BPM`,
        iconSvg: renderUiIconSvg('audio', { size: 14 }),
        badgeText: t.type === 'file' ? 'CUSTOM' : `${t.bpm} BPM`,
        badgeClass: 'badge-active',
      })),
      {
        value: BGM_TRACK_OFF,
        label: '靜音 (BGM OFF)',
        subLabel: '關閉選單與格納庫背景音樂',
        iconSvg: renderUiIconSvg('audio', { size: 14 }),
        badgeText: 'MUTE',
        badgeClass: 'badge-locked',
      },
    ]);

    bgmCombatSelect?.setOptions([
      {
        value: BGM_COMBAT_AUTO,
        label: 'AUTO // 依作戰與地圖自動配樂',
        subLabel: '決鬥／高危地形自動選用高張力曲目，其餘為推進主旋律',
        iconSvg: renderUiIconSvg('audio', { size: 14 }),
        badgeText: 'AUTO',
        badgeClass: 'badge-active',
      },
      ...combatTracks.map((t) => ({
        value: t.id,
        label: t.label,
        subLabel: t.subLabel || `${t.musicalKey} · ${t.bpm} BPM`,
        iconSvg: renderUiIconSvg('audio', { size: 14 }),
        badgeText: t.type === 'file' ? 'CUSTOM' : `${t.bpm} BPM`,
        badgeClass: 'badge-active',
      })),
      {
        value: BGM_TRACK_OFF,
        label: '靜音 (BGM OFF)',
        subLabel: '戰鬥中僅保留武器、引擎與環境音效',
        iconSvg: renderUiIconSvg('audio', { size: 14 }),
        badgeText: 'MUTE',
        badgeClass: 'badge-locked',
      },
    ]);
  };
  refreshBgmSelectOptions();

  // Build Categorized Keybind Groups
  if (keybindGroupsRootEl) {
    KEYBIND_GROUPS.forEach((grp) => {
      const wrap = document.createElement('div');
      wrap.className = 'keybind-group';
      const title = document.createElement('div');
      title.className = 'keybind-group-title';
      title.textContent = grp.label;
      const grid = document.createElement('div');
      grid.className = 'keybind-grid';

      KEYBIND_ACTIONS.filter((a) => a.group === grp.id).forEach((act) => {
        const btn = document.createElement('button');
        btn.className = 'keybind-btn';
        btn.dataset.actionId = act.id;
        const lblEl = document.createElement('span');
        lblEl.textContent = act.label;
        const capEl = document.createElement('span');
        capEl.className = 'key-cap';
        btn.append(lblEl, capEl);
        btn.onclick = () => getApp()?.beginKeyRebind(act.id);
        keybindButtons.set(act.id, { btn, capEl });
        grid.appendChild(btn);
      });

      wrap.append(title, grid);
      keybindGroupsRootEl.appendChild(wrap);
    });
  }

  // Populate Dual-Wield Loadouts in Pause Quick Armory + Armory Quick Preset Rows
  const populateLoadoutButtons = (container, btnClass = 'armory-chip') => {
    if (!container) return;
    ARM_LOADOUT_PRESETS.forEach((preset) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = btnClass;
      btn.dataset.loadoutMode = String(preset.mode);
      btn.title = preset.label;
      const num = document.createElement('span');
      num.className = 'chip-num';
      num.textContent = String(preset.mode);
      const txt = document.createElement('span');
      txt.textContent = preset.shortLabel;
      btn.append(num, txt);
      btn.onclick = () => getApp()?.setLoadoutMode(preset.mode);
      container.appendChild(btn);
    });
  };
  populateLoadoutButtons(quickLoadoutGridEl, 'armory-chip');
  populateLoadoutButtons(armoryPresetsRowEl, 'quick-preset-btn');

  // Populate Independent Single-Hand Weapon Pickers (lHand / rHand)
  const HAND_WEAPON_OPTIONS = Object.freeze([
    { id: 'pistol', code: 'WPN-P1', name: 'M8 曳光光束機槍', sub: '中距離速射壓制 · 可雙槍連射' },
    { id: 'saber', code: 'WPN-S1', name: 'HV-2 大型電漿光劍', sub: '高斬擊能量劍氣 · 近戰爆發' },
    { id: 'shield', code: 'DEF-SH', name: '手持反相力場護盾', sub: '即時展開當前主盾（全機限持 1 面）' },
    { id: 'none', code: 'UNARMED', name: '解除手部掛載', sub: '保留空手輕量化以降低總負荷' },
  ]);
  const HAND_SHORT_LABELS = Object.freeze({
    pistol: '曳光機槍',
    saber: '大光劍',
    shield: '手持盾',
    none: '空手',
  });
  const populateSingleHandGrid = (container, handKey) => {
    if (!container) return;
    HAND_WEAPON_OPTIONS.forEach((opt) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'blueprint-card';
      btn.dataset.handSlot = handKey;
      btn.dataset.weaponKind = opt.id;
      const top = document.createElement('div');
      top.className = 'bp-card-top';
      const titleEl = document.createElement('span');
      titleEl.className = 'bp-card-title';
      titleEl.textContent = opt.name;
      const badgeEl = document.createElement('span');
      badgeEl.className = 'badge-pill badge-active';
      badgeEl.textContent = opt.code;
      top.append(titleEl, badgeEl);
      const subEl = document.createElement('div');
      subEl.className = 'bp-card-sub';
      subEl.textContent = opt.sub;
      btn.append(top, subEl);
      btn.addEventListener('click', () => getApp()?.setHandWeapon(handKey, opt.id));
      container.appendChild(btn);
    });
  };
  populateSingleHandGrid(lHandGridEl, 'lHand');
  populateSingleHandGrid(rHandGridEl, 'rHand');

  // Populate 8 Armory Slot Overview Chips & Pre-build Persistent 3D Hardpoint Pins
  const armorySlotValEls = new Map();
  const armoryPinNodes = new Map();
  if (armorySlotStripEl) {
    ARMORY_SLOTS.forEach((slot) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = `armory-slot-btn${slot.status !== 'playable' ? ' is-locked' : ''}`;
      btn.dataset.armorySlotId = slot.id;
      const codeRow = document.createElement('div');
      codeRow.className = 'armory-slot-code';
      const codeSpan = document.createElement('span');
      codeSpan.textContent = slot.code;
      const tagSpan = document.createElement('span');
      tagSpan.textContent = slot.status === 'playable' ? slot.label : 'T6';
      codeRow.append(codeSpan, tagSpan);
      const valSpan = document.createElement('span');
      valSpan.className = 'armory-slot-val';
      valSpan.textContent = slot.label;
      btn.append(codeRow, valSpan);
      btn.addEventListener('click', () => getApp()?.setArmorySlot(slot.id));
      armorySlotValEls.set(slot.id, valSpan);
      armorySlotStripEl.appendChild(btn);
    });
  }
  if (armoryPinsEl) {
    ARMORY_SLOTS.forEach((slot) => {
      const pinBtn = document.createElement('button');
      pinBtn.type = 'button';
      pinBtn.className = `armory-pin${slot.status !== 'playable' ? ' is-locked' : ''}`;
      pinBtn.dataset.armoryPinId = slot.id;
      pinBtn.style.display = 'none';
      const dot = document.createElement('span');
      dot.className = 'armory-pin-dot';
      const code = document.createElement('span');
      code.className = 'armory-pin-code';
      code.textContent = slot.code;
      const lbl = document.createElement('span');
      lbl.className = 'armory-pin-label';
      lbl.textContent = slot.label;
      pinBtn.append(dot, code, lbl);
      pinBtn.addEventListener('pointerenter', () => getApp()?.setArmoryPinHover(true));
      pinBtn.addEventListener('pointerleave', () => getApp()?.setArmoryPinHover(false));
      pinBtn.addEventListener('click', () => getApp()?.setArmorySlot(slot.id));
      armoryPinNodes.set(slot.id, { btn: pinBtn, lblEl: lbl });
      armoryPinsEl.appendChild(pinBtn);
    });
  }

  // Populate Shields with Shield Contour SVG Icons in both Armory & Pause Quick Armory
  const populateShieldButtons = (container) => {
    if (!container) return;
    SHIELD_IDS.forEach((shieldId) => {
      const def = catalog.getShield(shieldId);
      if (!def) return;
      const btn = document.createElement('button');
      btn.className = 'armory-chip';
      btn.dataset.shieldId = shieldId;
      btn.title = `${def.id} ${def.name} — ${def.role}`;
      const ico = document.createElement('span');
      ico.className = 'shield-chip-icon';
      mountSvgString(ico, renderShieldIconSvg(def));
      const txt = document.createElement('span');
      txt.textContent = `${def.shortLabel}`;
      btn.append(ico, txt);
      btn.onclick = () => getApp()?.setShieldType(shieldId);
      container.appendChild(btn);
    });
  };
  populateShieldButtons(mmShieldGridEl);
  populateShieldButtons(quickShieldGridEl);

  // Build Paint Studio TacticalSelect Dropdowns (Skins, 9 Zones, 8 Finishes)
  const skinSelect = createTacticalSelect(mmSkinSelectHostEl, {
    ariaLabel: '選擇機甲塗裝主題',
    onUiFeedback: emitUiSound,
    onChange: (val) => {
      const app = getApp();
      app?.setSkin(val, null);
      syncEquipmentState();
    },
  });
  skinSelect?.setOptions(
    MECHA_SKINS.map((skin) => ({
      value: skin.id,
      label: skin.name,
      subLabel: skin.role,
      iconSvg: makeSkinSwatchSvg(skin.primary, skin.secondary, skin.saber),
      badgeText: skin.priceMc > 0 ? `${skin.priceMc} MC` : 'FREE',
      badgeClass: skin.priceMc > 0 ? 'badge-purchasable' : 'badge-active',
    })),
  );

  const paintZoneSelect = createTacticalSelect(mmPaintZoneSelectHostEl, {
    ariaLabel: '選擇機甲塗裝分區',
    onUiFeedback: emitUiSound,
    onChange: (val) => {
      getApp()?.setPaintZone(val);
    },
  });
  paintZoneSelect?.setOptions(
    PAINT_ZONES.map((z) => ({
      value: z.id,
      label: z.label,
      subLabel: z.subLabel,
      iconSvg: renderUiIconSvg('paint', { size: 14 }),
      badgeText: z.id === 'all' ? 'ALL' : 'ZONE',
      badgeClass: 'badge-active',
    })),
  );

  const finishSelect = createTacticalSelect(mmFinishSelectHostEl, {
    ariaLabel: '選擇裝甲表面質感',
    onUiFeedback: emitUiSound,
    onChange: (val) => {
      const app = getApp();
      if (!app) return;
      const zoneId = app.menuState?.activePaintZone || 'all';
      app.setZonePaint(zoneId, { finishId: val });
      syncSortieSummary();
    },
  });
  const refreshFinishOptions = (primaryHex, secondaryHex) => {
    finishSelect?.setOptions(
      PAINT_FINISHES.map((fin) => ({
        value: fin.id,
        label: fin.label,
        subLabel: fin.summary,
        iconSvg: renderFinishSwatchSvg(fin, primaryHex, secondaryHex),
        badgeText: fin.priceMc > 0 ? `${fin.priceMc} MC` : 'FREE',
        badgeClass: fin.priceMc > 0 ? 'badge-purchasable' : 'badge-active',
      })),
    );
  };
  refreshFinishOptions(MECHA_SKINS[0].primary, MECHA_SKINS[0].secondary);

  const renderShieldSpecCard = (shieldId) => {
    if (!shieldSpecCardEl) return;
    const def = catalog.getShield(shieldId) || catalog.getShield('EF-SH03');
    if (!def) return;
    const shapeLabel = COVERAGE_SHAPE_LABELS[def.coverageMode] || def.coverageMode;
    const durSec = Number(def.maxDurationSec || 10);
    const durRatio = Math.max(8, Math.min(100, (durSec / 24) * 100));
    const traits = [];
    if (def.reflectsBeams) traits.push('光束偏折');
    if (def.centerWindowClear) traits.push('中央觀測窗');
    if (def.isFullDome) traits.push('360° 防護');
    if (def.boostLock) traits.push('展開鎖定噴射');
    if ((def.parryWindowSec || 0) >= 0.25) traits.push('寬彈反窗');

    shieldSpecCardEl.replaceChildren();
    const head = document.createElement('div');
    head.className = 'spec-head';
    const nameEl = document.createElement('strong');
    nameEl.textContent = `${def.id} ${def.name}`;
    const weightEl = document.createElement('span');
    weightEl.className = 'spec-tag';
    weightEl.textContent = `${def.weightKg} kg`;
    head.append(nameEl, weightEl);

    const roleEl = document.createElement('div');
    roleEl.className = 'spec-role';
    roleEl.textContent = `${def.role} ｜ ${shapeLabel}`;

    const barRow = document.createElement('div');
    barRow.className = 'spec-bar-row';
    const barLbl = document.createElement('span');
    barLbl.textContent = `持久續航 ${durSec.toFixed(1)}s`;
    const barTrack = document.createElement('div');
    barTrack.className = 'spec-bar-track';
    const barFill = document.createElement('div');
    barFill.className = 'spec-bar-fill';
    barFill.style.width = `${durRatio}%`;
    barFill.style.background = def.barrierColor || '#56ffe0';
    barTrack.appendChild(barFill);
    barRow.append(barLbl, barTrack);

    const statsGrid = document.createElement('div');
    statsGrid.className = 'spec-stats';
    const metrics = [
      `格擋減傷 ${Math.round((def.blockReduction || 0) * 100)}%`,
      `完美彈反窗 ${Number(def.parryWindowSec || 0).toFixed(2)}s (+${def.parrySpRefund || 0} SP)`,
      `過熱冷卻 ${Number(def.cooldownSec || 1).toFixed(1)}s`,
      `特性：${traits.length ? traits.join(' / ') : '標準防禦'}`,
    ];
    metrics.forEach((m) => {
      const cell = document.createElement('div');
      cell.className = 'spec-cell';
      cell.textContent = m;
      statsGrid.appendChild(cell);
    });

    const chartBox = document.createElement('div');
    chartBox.id = 'shield-curve-svg';
    chartBox.className = 'shield-curve-svg-box';
    mountSvgString(
      chartBox,
      renderShieldTradeoffChartSvg({
        shields: catalog.listShields(),
        activeId: def.id,
      }),
    );

    shieldSpecCardEl.append(head, roleEl, barRow, statsGrid, chartBox);
  };

  const buildBlueprintCard = ({ item, dataAttr, dataVal, subText, miniSvgText = null, onClick }) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = `blueprint-card${item.status !== 'playable' ? ' is-locked' : ''}`;
    btn.dataset[dataAttr] = dataVal;
    if (item.status !== 'playable') {
      const planned = item.plannedTask || '後續開發階段解鎖';
      btn.title = `[未實裝] ${item.shortLabel || item.codeName || item.callsign || item.name || item.id} 預計於 ${planned} 解鎖`;
    }
    const badge = resolveStatusBadgeMeta(item);

    const top = document.createElement('div');
    top.className = 'bp-card-top';
    const titleEl = document.createElement('span');
    titleEl.className = 'bp-card-title';
    titleEl.textContent = item.shortLabel || item.codeName || item.callsign || item.name || item.id;
    const badgeEl = document.createElement('span');
    badgeEl.className = `badge-pill ${badge.cls}`;
    badgeEl.textContent = badge.text;
    top.append(titleEl, badgeEl);

    if (miniSvgText) {
      const row = document.createElement('div');
      row.className = 'pilot-card-row';
      const svgWrap = document.createElement('div');
      svgWrap.className = 'pilot-mini-svg';
      mountSvgString(svgWrap, miniSvgText);
      const col = document.createElement('div');
      col.style.cssText = 'flex:1;min-width:0;display:flex;flex-direction:column;gap:2px;';
      col.appendChild(top);
      if (subText) {
        const subEl = document.createElement('div');
        subEl.className = 'bp-card-sub';
        subEl.textContent = subText;
        col.appendChild(subEl);
      }
      row.append(svgWrap, col);
      btn.appendChild(row);
    } else {
      btn.appendChild(top);
      if (subText) {
        const subEl = document.createElement('div');
        subEl.className = 'bp-card-sub';
        subEl.textContent = subText;
        btn.appendChild(subEl);
      }
    }

    btn.addEventListener('click', onClick);
    if (btn.title && popManager) {
      popManager.bindTooltip(btn);
    }
    return btn;
  };

  if (rHandGunGridEl) {
    catalog
      .listWeapons()
      .filter((w) => w.slot === 'R_HAND')
      .forEach((weaponItem) => {
        const subSpec = weaponItem.resourceType === 'mag'
          ? `實彈 ${weaponItem.magCapacity || 32} 發彈匣 · 換彈 ${weaponItem.reloadSec || 1.3}s`
          : `熱能光束 · 每發 +${weaponItem.heatPerShot || 11}% 熱量 · 冷卻 ${weaponItem.overheatLockSec || 1.8}s`;
        rHandGunGridEl.appendChild(
          buildBlueprintCard({
            item: weaponItem,
            dataAttr: 'rhandWeaponId',
            dataVal: weaponItem.id,
            subText: weaponItem.status === 'playable' ? subSpec : weaponItem.roleTag,
            onClick: () => {
              const app = getApp();
              app?.selectCatalogPreview('r_hand_weapon', weaponItem.id);
              if (weaponItem.status === 'playable' && app?.loadoutPreset?.rHand !== 'pistol') {
                app?.setHandWeapon('rHand', 'pistol');
              }
            },
          }),
        );
      });
  }

  const snap = catalog.getSnapshot();
  const kaijuPreview = snap.phaseEKaijuPreview;

  // Populate Lobby Mode Dropdown (Solo uses 1-Click mode toggle buttons)
  const modeOptions = catalog.listModes().map((modeItem) => {
    const badge = resolveStatusBadgeMeta(modeItem);
    return {
      value: modeItem.id,
      label: modeItem.shortLabel || modeItem.name,
      subLabel: modeItem.summary,
      iconSvg: renderUiIconSvg(modeItem.status === 'playable' ? 'sortie' : 'lock', { size: 14 }),
      badgeText: badge.text,
      badgeClass: badge.cls,
      locked: modeItem.status !== 'playable',
    };
  });

  const lobbyModeSelect = createTacticalSelect(lobbyModeHostEl, {
    ariaLabel: '選擇多人大廳對戰規則',
    onUiFeedback: emitUiSound,
    onChange: (val) => getApp()?.selectCatalogPreview('mode', val),
  });
  lobbyModeSelect?.setOptions(modeOptions);

  // Populate 6 Map Carousel Dots (01 Sortie)
  if (mapDotsEl) {
    catalog.listMaps().forEach((mapItem, idx) => {
      const dotBtn = document.createElement('button');
      dotBtn.type = 'button';
      dotBtn.className = `map-dot-pill${mapItem.status !== 'playable' ? ' is-locked' : ''}`;
      dotBtn.dataset.mapId = mapItem.id;
      dotBtn.title = `${mapItem.name} (${mapItem.status === 'playable' ? 'ACTIVE' : mapItem.plannedTask})`;
      dotBtn.textContent = `0${idx + 1}`;
      dotBtn.addEventListener('click', () => getApp()?.selectCatalogPreview('map', mapItem.id));
      mapDotsEl.appendChild(dotBtn);
    });
  }

  // Populate Online Sample Lobbies (Task 11 Preview)
  let selectedLobbyId = SAMPLE_ONLINE_LOBBIES[0]?.id || 'RM-901';
  const renderLobbyList = () => {
    if (!lobbyListEl) return;
    const q = (lobbySearchInput?.value || '').trim().toLowerCase();
    const list = SAMPLE_ONLINE_LOBBIES.filter(
      (rm) =>
        !q ||
        rm.id.toLowerCase().includes(q) ||
        rm.roomName.toLowerCase().includes(q) ||
        rm.hostCallsign.toLowerCase().includes(q),
    );
    lobbyListEl.replaceChildren();
    if (!list.length) {
      const empty = document.createElement('div');
      empty.className = 'bp-card-sub';
      empty.textContent = '無符合關鍵字的連線房（可切換回「建立大廳」預覽設定）';
      lobbyListEl.appendChild(empty);
      return;
    }
    list.forEach((rm) => {
      const card = document.createElement('button');
      card.type = 'button';
      card.className = `lobby-room-card${rm.id === selectedLobbyId ? ' active' : ''}`;
      const top = document.createElement('div');
      top.className = 'bp-card-top';
      const title = document.createElement('span');
      title.className = 'bp-card-title';
      title.textContent = `[${rm.id}] ${rm.roomName}`;
      const pill = document.createElement('span');
      pill.className = 'badge-pill badge-blueprint';
      pill.textContent = `${rm.playersText} · ${rm.pingMs}ms`;
      top.append(title, pill);
      const mapEntry = catalog.getMap(rm.mapId);
      const modeEntry = catalog.getMode(rm.modeId);
      const sub = document.createElement('div');
      sub.className = 'bp-card-sub';
      sub.textContent = `房主 ${rm.hostCallsign} ｜ ${modeEntry?.shortLabel || rm.modeId} ｜ ${mapEntry?.name || rm.mapId}${rm.hasPassword ? ' · [私密鎖]' : ''}${rm.allowAiFill ? ' · [5s補AI]' : ''}`;
      card.append(top, sub);
      card.addEventListener('click', () => {
        selectedLobbyId = rm.id;
        renderLobbyList();
        if (MAP_IDS.includes(rm.mapId)) {
          getApp()?.selectCatalogPreview('map', rm.mapId);
        }
        showToast(`已選擇範例房間 ${rm.id}（線上即時大廳配對將於 Task 11 啟用）`);
      });
      lobbyListEl.appendChild(card);
    });
  };
  renderLobbyList();
  lobbySearchInput?.addEventListener('input', renderLobbyList);

  // Populate Selectable Shoulder Hardpoint Weapons (l_back / r_back) + Empty Clear Option
  const BACK_SLOT_KEY_MAP = { l_back: 'Q', r_back: 'X' };
  const populateBackWeaponGrid = (slotKind, gridEl, dataAttr) => {
    if (!gridEl) return;
    gridEl.replaceChildren();
    const expectedSlot = slotKind === 'l_back' ? 'L_BACK' : 'R_BACK';
    const clearItem = {
      id: '__none__',
      shortLabel: '輕量化空掛點 (None)',
      status: 'playable',
    };
    gridEl.appendChild(
      buildBlueprintCard({
        item: clearItem,
        dataAttr,
        dataVal: '__none__',
        subText: '0 kg · 移除肩背武裝以提升 TWR 與 EN 回充效率',
        onClick: () => getApp()?.selectCatalogPreview(slotKind, null),
      }),
    );
    catalog
      .listWeapons()
      .filter((w) => w.slot === expectedSlot)
      .forEach((weaponItem) => {
        const subSpec = weaponItem.category === 'booster'
          ? `+${Math.round((weaponItem.thrustBonusN || 0) / 1000)} kN · ${weaponItem.weightKg}kg`
          : `${weaponItem.damageType === 'beam' ? '光束' : weaponItem.damageType === 'blast' ? '爆破' : '動能'} DMG ${weaponItem.rivalDamage || weaponItem.baseDamage} · ${weaponItem.weightKg}kg`;
        gridEl.appendChild(
          buildBlueprintCard({
            item: weaponItem,
            dataAttr,
            dataVal: weaponItem.id,
            subText: subSpec,
            onClick: () => getApp()?.selectCatalogPreview(slotKind, weaponItem.id),
          }),
        );
      });
    bindAllTooltips(gridEl);
  };
  populateBackWeaponGrid('l_back', lBackGridEl, 'lbackId');
  populateBackWeaponGrid('r_back', rBackGridEl, 'rbackId');

  const renderBackWeaponInspector = (slotKind, weaponId, targetEl) => {
    if (!targetEl) return;
    targetEl.replaceChildren();
    const w = weaponId ? catalog.getWeapon(weaponId) : null;
    const keyHint = BACK_SLOT_KEY_MAP[slotKind] || 'Q';
    if (!w) {
      const head = document.createElement('div');
      head.className = 'spec-head';
      const titleEl = document.createElement('strong');
      titleEl.textContent = `${slotKind === 'l_back' ? '左肩背' : '右肩背'}空掛點 (0 kg)`;
      const pill = document.createElement('span');
      pill.className = 'badge-pill badge-active';
      pill.textContent = 'LIGHTWEIGHT';
      head.append(titleEl, pill);
      const roleEl = document.createElement('div');
      roleEl.className = 'spec-role';
      roleEl.textContent = `未安裝肩背武裝：減輕載重負荷以最大化推重比 (TWR) 與推進閃避手感。快捷鍵 [${keyHint}]。`;
      targetEl.append(head, roleEl);
      bindAllTooltips(targetEl);
      return;
    }
    const head = document.createElement('div');
    head.className = 'spec-head';
    const titleEl = document.createElement('strong');
    titleEl.textContent = `${w.id} ${w.name}`;
    const pill = document.createElement('span');
    pill.className = 'badge-pill badge-active';
    pill.textContent = `KEY [${keyHint}]`;
    head.append(titleEl, pill);
    const roleEl = document.createElement('div');
    roleEl.className = 'spec-role';
    roleEl.textContent = w.summary || '';
    const tags = document.createElement('div');
    tags.className = 'tag-row';
    const specsList = Array.isArray(w.specs) ? [...w.specs] : [];
    specsList.push(`重量 ${w.weightKg}kg`, `EN -${w.enCost ?? 0}`, `冷卻 ${w.cooldownSec ?? 0}s`);
    specsList.forEach((sp) => {
      const chip = document.createElement('span');
      chip.className = 'tag-chip';
      chip.textContent = sp;
      tags.appendChild(chip);
    });
    targetEl.append(head, roleEl, tags);
    bindAllTooltips(targetEl);
  };

  const computeCurrentBuildAnalysis = (ms, app) => {
    const actorDef = catalog.getActor(ms.previewMechaId || 'EF-018') || catalog.getActor('EF-018');
    const pilotDef = catalog.getPilot(ms.previewPilotId || 'PILOT-01');
    const armorCoreDef = catalog.getArmorCore(ms.previewArmorCoreId || 'EF-AC01');
    const armorLiningDef = ms.previewArmorLiningId ? catalog.getArmorLining(ms.previewArmorLiningId) : null;
    const lBackDef = ms.previewLBackId ? catalog.getWeapon(ms.previewLBackId) : null;
    const rBackDef = ms.previewRBackId ? catalog.getWeapon(ms.previewRBackId) : null;
    const pr = app?.loadoutPreset || { lHand: 'saber', rHand: 'pistol' };
    const shieldDef = pr.lHand === 'shield' || pr.rHand === 'shield' ? app?.getActiveShieldDef?.() || null : null;
    const handWeaponDefs = [];
    if (pr.lHand === 'pistol') handWeaponDefs.push(catalog.getWeapon('EF-AR01'));
    else if (pr.lHand === 'saber') handWeaponDefs.push(catalog.getWeapon('EF-BS02'));
    if (pr.rHand === 'pistol') handWeaponDefs.push(catalog.getWeapon('EF-AR01'));
    else if (pr.rHand === 'saber') handWeaponDefs.push(catalog.getWeapon('EF-BS02'));

    const tax = app?.loadoutTax || computeLoadoutWeightTax({
      actorDef,
      weaponDefs: [...handWeaponDefs, lBackDef, rBackDef].filter(Boolean),
      shieldDef,
      armorCoreDef,
      armorLiningDef,
      pilotDef,
    });
    const validation = app?.buildValidation || validateMechaBuild({
      actorDef,
      lHandType: pr.lHand,
      rHandType: pr.rHand,
      shieldDef,
      lBackWeaponDef: lBackDef,
      rBackWeaponDef: rBackDef,
      armorCoreDef,
      armorLiningDef,
    });
    return { tax, validation };
  };

  const OVERLOAD_LABELS = {
    nominal: 'NOMINAL',
    heavy: 'HEAVY',
    overloaded: 'OVERLOAD',
  };

  const computeCompareMetricsForActor = (actorId, variantId = null) => {
    const actorDef = catalog.getActor(actorId);
    if (!actorDef || actorDef.actorType === 'kaiju') return null;
    const app = getApp();
    const ms = app?.menuState || {};
    const pr = app?.loadoutPreset || { lHand: 'saber', rHand: 'pistol' };
    const armorCoreDef = catalog.getArmorCore(ms.previewArmorCoreId || 'EF-AC01');
    const armorLiningDef = ms.previewArmorLiningId ? catalog.getArmorLining(ms.previewArmorLiningId) : null;
    const lBackDef = ms.previewLBackId ? catalog.getWeapon(ms.previewLBackId) : null;
    const rBackDef = ms.previewRBackId ? catalog.getWeapon(ms.previewRBackId) : null;
    const pilotDef = catalog.getPilot(ms.previewPilotId || 'PILOT-01');
    const shieldDef = pr.lHand === 'shield' || pr.rHand === 'shield' ? app?.getActiveShieldDef?.() || null : null;
    const handWeaponDefs = [];
    if (pr.lHand === 'pistol') handWeaponDefs.push(catalog.getWeapon('EF-AR01'));
    else if (pr.lHand === 'saber') handWeaponDefs.push(catalog.getWeapon('EF-BS02'));
    if (pr.rHand === 'pistol') handWeaponDefs.push(catalog.getWeapon('EF-AR01'));
    else if (pr.rHand === 'saber') handWeaponDefs.push(catalog.getWeapon('EF-BS02'));

    const hypTax = computeLoadoutWeightTax({
      actorDef,
      weaponDefs: [...handWeaponDefs, lBackDef, rBackDef].filter(Boolean),
      shieldDef,
      armorCoreDef,
      armorLiningDef,
      pilotDef,
    });
    const metrics = { ...hypTax.radarMetrics };
    if (variantId === 'mk1') {
      metrics.mobility = Math.max(15, metrics.mobility - 8);
      metrics.armor = Math.min(100, metrics.armor + 6);
    }
    return metrics;
  };

  const renderArmoryTelemetry = (ms, app, compareMetrics = null) => {
    const { tax, validation } = computeCurrentBuildAnalysis(ms, app);
    if (!tax) return;
    if (armoryRadarSvgEl) {
      mountSvgString(
        armoryRadarSvgEl,
        renderMechaRadarSvg({
          metrics: tax.radarMetrics,
          baseMetrics: tax.baseRadarMetrics,
          compareMetrics,
          overloadState: tax.overloadState,
          nominalColor: '#cbdcf0',
        }),
      );
    }
    const deltasEl = document.getElementById('mm-radar-deltas');
    if (deltasEl) {
      deltasEl.replaceChildren();
      if (compareMetrics) {
        const deltas = computeMetricDeltas(tax.radarMetrics, compareMetrics);
        deltas.forEach((d) => {
          const chip = document.createElement('span');
          chip.className = `radar-delta-chip ${d.sign === 'pos' ? 'is-positive' : d.sign === 'neg' ? 'is-negative' : 'is-neutral'}`;
          chip.textContent = d.text;
          deltasEl.appendChild(chip);
        });
      }
    }
    const pct = Math.round((tax.loadRatio ?? 0) * 100);
    const twrGaugeEl = document.getElementById('armory-twr-gauge');
    if (twrGaugeEl) {
      mountSvgString(
        twrGaugeEl,
        renderTwrGaugeSvg({
          twrRatio: tax.twr ?? 1.5,
          payloadPct: pct,
          overloadState: tax.overloadState || 'nominal',
        }),
      );
    }
    if (armoryBudgetBadgeEl) {
      const over = (validation.budgetUsed || 0) > (validation.budgetCap || 375);
      armoryBudgetBadgeEl.classList.toggle('is-over', over);
      armoryBudgetBadgeEl.textContent = `BUDGET ${validation.budgetUsed ?? 375}/${validation.budgetCap ?? 375}`;
    }
    if (armoryOverloadBadgeEl) {
      armoryOverloadBadgeEl.dataset.state = tax.overloadState || 'nominal';
      armoryOverloadBadgeEl.textContent = `TWR ${(tax.twr ?? 0).toFixed(2)} · ${OVERLOAD_LABELS[tax.overloadState] || 'NOMINAL'}`;
    }
    if (armoryPayloadLblEl) {
      armoryPayloadLblEl.textContent = `載重 ${Math.round(tax.payloadKg || 0)} / ${Math.round(tax.payloadCapKg || 1850)} kg`;
    }
    if (armoryPayloadPctEl) {
      armoryPayloadPctEl.textContent = `${pct}% · SPD×${(tax.speedScale ?? 1).toFixed(2)}`;
    }
    if (armoryPayloadFillEl) {
      armoryPayloadFillEl.dataset.state = tax.overloadState || 'nominal';
      armoryPayloadFillEl.style.width = `${Math.max(4, Math.min(100, pct))}%`;
    }
    if (armoryStatChipsEl) {
      armoryStatChipsEl.replaceChildren();
      const chips = [
        `AP ${Math.round(tax.effectiveAp || 4500)}`,
        `ACS ${Math.round(tax.effectiveMaxAcs || 100)}`,
        `光抗 ${Math.round((tax.beamResist || 0) * 100)}%`,
        `爆抗 ${Math.round((tax.blastResist || 0) * 100)}%`,
      ];
      chips.forEach((txt) => {
        const chip = document.createElement('span');
        chip.className = 'resist-chip';
        chip.textContent = txt;
        armoryStatChipsEl.appendChild(chip);
      });
    }
    bindAllTooltips(document.getElementById('mm-armory-telemetry') || armoryStatChipsEl);
  };

  const triggerMechaVariantSelect = (variantId, actorId = 'EF-018') => {
    const appInst = getApp();
    if (!appInst) return;
    if (appInst.menuState?.previewMechaId !== actorId) {
      appInst.selectCatalogPreview('mecha', actorId);
    }
    appInst.selectCatalogPreview('mecha_variant', variantId);
  };

  // Populate 5 Mechas + Phase E Kaiju placeholder (02 Hangar)
  if (mmMechaGridEl) {
    const mechaEntries = [...catalog.listActors(), ...(kaijuPreview ? [kaijuPreview] : [])];
    mechaEntries.forEach((actorItem) => {
      const cardEl = buildBlueprintCard({
        item: actorItem,
        dataAttr: 'mechaId',
        dataVal: actorItem.id,
        subText: actorItem.actorType === 'kaiju' ? 'Phase E 怪物藍圖槽' : `AP ${actorItem.maxAp} ｜ ${actorItem.archetype.toUpperCase()}`,
        onClick: () => getApp()?.selectCatalogPreview('mecha', actorItem.id),
      });

      cardEl.addEventListener('mouseenter', () => {
        const comp = computeCompareMetricsForActor(actorItem.id);
        const app = getApp();
        if (app) renderArmoryTelemetry(app.menuState, app, comp);
      });
      cardEl.addEventListener('mouseleave', () => {
        const app = getApp();
        if (app) renderArmoryTelemetry(app.menuState, app, null);
      });
      cardEl.addEventListener('focus', () => {
        const comp = computeCompareMetricsForActor(actorItem.id);
        const app = getApp();
        if (app) renderArmoryTelemetry(app.menuState, app, comp);
      });
      cardEl.addEventListener('blur', () => {
        const app = getApp();
        if (app) renderArmoryTelemetry(app.menuState, app, null);
      });

      if (actorItem.variants) {
        const curVariantId = getApp()?.menuState?.previewMechaVariantId || actorItem.defaultVariantId || 'mk2';
        const genRow = document.createElement('div');
        genRow.className = 'gen-switch-row';
        Object.values(actorItem.variants).forEach((vItem) => {
          const pill = document.createElement('span');
          pill.setAttribute('role', 'button');
          pill.tabIndex = 0;
          pill.className = `gen-pill-btn${vItem.id === curVariantId ? ' active' : ''}`;
          pill.dataset.mechaVariantId = vItem.id;
          pill.textContent = vItem.label;

          pill.addEventListener('mouseenter', (ev) => {
            ev.stopPropagation();
            const comp = computeCompareMetricsForActor(actorItem.id, vItem.id);
            const app = getApp();
            if (app) renderArmoryTelemetry(app.menuState, app, comp);
          });
          pill.addEventListener('mouseleave', (ev) => {
            ev.stopPropagation();
            const app = getApp();
            if (app) renderArmoryTelemetry(app.menuState, app, null);
          });
          pill.addEventListener('focus', (ev) => {
            ev.stopPropagation();
            const comp = computeCompareMetricsForActor(actorItem.id, vItem.id);
            const app = getApp();
            if (app) renderArmoryTelemetry(app.menuState, app, comp);
          });
          pill.addEventListener('blur', (ev) => {
            ev.stopPropagation();
            const app = getApp();
            if (app) renderArmoryTelemetry(app.menuState, app, null);
          });

          const activate = (ev) => {
            ev.stopPropagation();
            ev.preventDefault();
            triggerMechaVariantSelect(vItem.id, actorItem.id);
          };
          pill.addEventListener('click', activate);
          pill.addEventListener('keydown', (ev) => {
            if (ev.key === 'Enter' || ev.key === ' ') activate(ev);
          });
          genRow.appendChild(pill);
        });
        cardEl.appendChild(genRow);
      }
      mmMechaGridEl.appendChild(cardEl);
    });
  }

  // Populate 4 Human Pilots with SVG Portraits (02 Hangar)
  if (mmPilotGridEl) {
    catalog.listPilots().forEach((pilotItem) => {
      mmPilotGridEl.appendChild(
        buildBlueprintCard({
          item: pilotItem,
          dataAttr: 'pilotId',
          dataVal: pilotItem.id,
          subText: pilotItem.traitSummary,
          miniSvgText: renderPilotPortraitSvg(pilotItem),
          onClick: () => {
            getApp()?.selectCatalogPreview('pilot', pilotItem.id);
            const sample = pilotItem.radioSamples?.[0] || 'Ready for sortie.';
            if (popManager) {
              popManager.showCommsBanner({ pilot: pilotItem, text: `「${sample}」` });
            }
          },
        }),
      );
    });
  }

  // Populate Dual-Slot Armor Dropdowns (ARMOR_CORE / ARMOR_LINING)
  const armorCoreSelect = createTacticalSelect(mmArmorCoreHostEl, {
    ariaLabel: '選擇主裝甲核心',
    onUiFeedback: emitUiSound,
    onChange: (val) => getApp()?.selectCatalogPreview('armor_core', val),
  });
  armorCoreSelect?.setOptions(
    catalog
      .listArmors()
      .filter((a) => a.slot === 'ARMOR_CORE')
      .map((armorItem) => {
        const badge = resolveStatusBadgeMeta(armorItem);
        return {
          value: armorItem.id,
          label: `${armorItem.id} ${armorItem.name}`,
          subLabel: `${armorItem.slot} · ${armorItem.weightKg >= 0 ? `+${armorItem.weightKg}` : armorItem.weightKg}kg · ${armorItem.summary}`,
          iconSvg: renderUiIconSvg(armorItem.status === 'playable' ? 'shield' : 'lock', { size: 14 }),
          badgeText: badge.text,
          badgeClass: badge.cls,
          locked: armorItem.status !== 'playable',
        };
      }),
  );

  const armorLiningSelect = createTacticalSelect(mmArmorLiningHostEl, {
    ariaLabel: '選擇外附加防禦襯墊',
    onUiFeedback: emitUiSound,
    onChange: (val) => getApp()?.selectCatalogPreview('armor_lining', val === '__none__' ? null : val),
  });
  armorLiningSelect?.setOptions([
    {
      value: '__none__',
      label: '未裝備外附加襯墊 (None)',
      subLabel: '維持標準裸裝機動性與無附加重量',
      iconSvg: renderUiIconSvg('armory', { size: 14 }),
      badgeText: 'OPTIONAL',
      badgeClass: 'badge-active',
    },
    ...catalog
      .listArmors()
      .filter((a) => a.slot === 'ARMOR_LINING')
      .map((armorItem) => {
        const badge = resolveStatusBadgeMeta(armorItem);
        return {
          value: armorItem.id,
          label: `${armorItem.id} ${armorItem.name}`,
          subLabel: `${armorItem.slot} · ${armorItem.weightKg >= 0 ? `+${armorItem.weightKg}` : armorItem.weightKg}kg · ${armorItem.summary}`,
          iconSvg: renderUiIconSvg(armorItem.status === 'playable' ? 'armory' : 'lock', { size: 14 }),
          badgeText: badge.text,
          badgeClass: badge.cls,
          locked: armorItem.status !== 'playable',
        };
      }),
  ]);

  const renderMapInspector = (mapId) => {
    const mapEntry = catalog.getMap(mapId);
    if (!mapEntry || !mmMapSvgBoxEl || !mmMapDetailsEl) return;
    mountSvgString(mmMapSvgBoxEl, renderMapBlueprintSvg(mapEntry));
    mmMapDetailsEl.replaceChildren();

    const head = document.createElement('div');
    head.className = 'spec-head';
    const title = document.createElement('strong');
    title.textContent = mapEntry.name;
    const badge = resolveStatusBadgeMeta(mapEntry);
    const pill = document.createElement('span');
    pill.className = `badge-pill ${badge.cls}`;
    pill.textContent = badge.text;
    head.append(title, pill);

    const desc = document.createElement('div');
    desc.className = 'spec-role';
    desc.style.margin = '4px 0 6px';
    desc.textContent = mapEntry.summary;

    const tagsWrap = document.createElement('div');
    tagsWrap.className = 'tag-row';
    (mapEntry.challengeTags || []).forEach((tagTxt) => {
      const chip = document.createElement('span');
      chip.className = 'tag-chip';
      chip.textContent = tagTxt;
      tagsWrap.appendChild(chip);
    });

    const meta = document.createElement('div');
    meta.className = 'bp-card-sub';
    meta.style.marginTop = '6px';
    const envM = mapEntry.envModifiers || {};
    meta.textContent = `地形尺寸: ${mapEntry.arenaShape === 'square' ? '正方形' : '圓形'} 半徑 ${mapEntry.radiusM}m ｜ 摩擦×${envM.frictionScale ?? 1} · EN回充×${envM.enRegenScale ?? 1}`;

    mmMapDetailsEl.append(head, desc, tagsWrap, meta);
  };

  const renderMechaInspector = (mechaId, variantId = null) => {
    if (!mmMechaInspectorEl) return;
    const actor = kaijuPreview && mechaId === kaijuPreview.id ? kaijuPreview : catalog.getActor(mechaId);
    if (!actor) return;
    const activeVariant = actor.variants ? catalog.getActorVariant(actor.id, variantId) : null;
    const badge = resolveStatusBadgeMeta(actor);
    mmMechaInspectorEl.replaceChildren();

    const head = document.createElement('div');
    head.className = 'spec-head';
    const nameEl = document.createElement('strong');
    nameEl.textContent = activeVariant?.name || actor.name;
    const pill = document.createElement('span');
    pill.className = `badge-pill ${badge.cls}`;
    pill.textContent = badge.text;
    head.append(nameEl, pill);

    const roleEl = document.createElement('div');
    roleEl.className = 'spec-role';
    roleEl.textContent = activeVariant?.role || actor.role;
    mmMechaInspectorEl.append(head, roleEl);

    if (actor.variants) {
      const genRow = document.createElement('div');
      genRow.className = 'gen-switch-row';
      Object.values(actor.variants).forEach((vItem) => {
        const vBtn = document.createElement('button');
        vBtn.type = 'button';
        vBtn.className = `gen-pill-btn${activeVariant?.id === vItem.id ? ' active' : ''}`;
        vBtn.dataset.mechaVariantId = vItem.id;
        vBtn.textContent = vItem.label;
        vBtn.addEventListener('click', () => triggerMechaVariantSelect(vItem.id, actor.id));
        genRow.appendChild(vBtn);
      });
      mmMechaInspectorEl.appendChild(genRow);
    }

    if (actor.stats) {
      const barsWrap = document.createElement('div');
      barsWrap.className = 'stat-bars-grid';
      [
        ['機動 Speed', actor.stats.speed],
        ['火力 Firepower', actor.stats.firepower],
        ['近戰 Melee', actor.stats.melee],
        ['電戰 Tech', actor.stats.tech],
        ['裝甲 Defense', actor.stats.defense],
      ].forEach(([lbl, val]) => {
        const row = document.createElement('div');
        row.className = 'stat-bar-row';
        const lEl = document.createElement('span');
        lEl.textContent = lbl;
        const track = document.createElement('div');
        track.className = 'stat-bar-track';
        const fill = document.createElement('div');
        fill.className = 'stat-bar-fill';
        fill.style.width = `${Math.max(5, Math.min(100, Number(val || 0)))}%`;
        track.appendChild(fill);
        const vEl = document.createElement('span');
        vEl.textContent = String(val ?? '-');
        row.append(lEl, track, vEl);
        barsWrap.appendChild(row);
      });
      mmMechaInspectorEl.appendChild(barsWrap);
    }

    if (Array.isArray(actor.signatureWeapons)) {
      const sigRow = document.createElement('div');
      sigRow.className = 'tag-row';
      actor.signatureWeapons.forEach((w) => {
        const chip = document.createElement('span');
        chip.className = 'tag-chip';
        chip.textContent = w;
        sigRow.appendChild(chip);
      });
      mmMechaInspectorEl.appendChild(sigRow);
    }

    const foot = document.createElement('div');
    foot.className = 'bp-card-sub';
    foot.textContent = actor.actorType === 'kaiju'
      ? 'Phase E 多部位弱點骨架 (actorType: kaiju) 保留展示'
      : `AP ${actor.maxAp} ｜ EN ${actor.maxEn} ｜ 定價: ${actor.priceMc === 0 ? '初始免費' : `${actor.priceMc} MC`} (${actor.status === 'playable' ? '即時可出擊' : `預定 ${actor.plannedTask}`})`;
    mmMechaInspectorEl.appendChild(foot);
  };

  const renderPilotInspector = (pilotId) => {
    const pilot = catalog.getPilot(pilotId);
    if (!pilot) return;

    if (headerPilotSvgEl) mountSvgString(headerPilotSvgEl, renderPilotPortraitSvg(pilot));
    if (headerPilotNameEl) headerPilotNameEl.textContent = pilot.callsign || pilot.name;
    if (headerPilotTitleEl) headerPilotTitleEl.textContent = pilot.title;
    if (pilotHudBadgeEl) pilotHudBadgeEl.title = `${pilot.name} — ${pilot.title}`;

    if (!mmPilotInspectorEl) return;
    mmPilotInspectorEl.replaceChildren();
    const split = document.createElement('div');
    split.className = 'pilot-inspect-split';

    const lgSvg = document.createElement('div');
    lgSvg.className = 'pilot-svg-lg';
    mountSvgString(lgSvg, renderPilotPortraitSvg(pilot));

    const info = document.createElement('div');
    info.style.cssText = 'display:flex;flex-direction:column;gap:4px;';
    const head = document.createElement('div');
    head.className = 'spec-head';
    const nameEl = document.createElement('strong');
    nameEl.textContent = pilot.name;
    const badge = resolveStatusBadgeMeta(pilot);
    const pill = document.createElement('span');
    pill.className = `badge-pill ${badge.cls}`;
    pill.textContent = badge.text;
    head.append(nameEl, pill);

    const titleEl = document.createElement('div');
    titleEl.className = 'spec-role';
    titleEl.textContent = `${pilot.title} ｜ 專屬電台雜訊: ${pilot.squelchHz} Hz`;
    const posEl = document.createElement('div');
    posEl.className = 'bp-card-sub';
    posEl.style.color = '#9cf5cc';
    posEl.textContent = `[+] 正向特性: ${pilot.traitPositive}`;
    const negEl = document.createElement('div');
    negEl.className = 'bp-card-sub';
    negEl.style.color = '#ffd29e';
    negEl.textContent = `[-] 取捨代價: ${pilot.traitNegative}`;
    const unlockEl = document.createElement('div');
    unlockEl.className = 'bp-card-sub';
    unlockEl.textContent = `解鎖雙軌: ${pilot.priceMc === 0 ? '預設配備' : `${pilot.priceMc} MC 購買 / 成就「${pilot.achievementUnlock}」`}`;

    const commsBtn = document.createElement('button');
    commsBtn.type = 'button';
    commsBtn.className = 'ui-btn compact';
    commsBtn.textContent = `試聽無線電台詞：「${pilot.radioSamples?.[0] || '待機中'}」`;
    commsBtn.addEventListener('click', () => {
      getApp()?.audio?.playChannelPreview?.('master');
      const sample = pilot.radioSamples?.[0] || 'Ready for sortie.';
      if (popManager) {
        popManager.showCommsBanner({ pilot, text: `「${sample}」` });
      } else {
        showToast(`[COMMS // ${pilot.callsign}] 「${sample}」`);
      }
    });

    info.append(head, titleEl, posEl, negEl, unlockEl, commsBtn);
    split.append(lgSvg, info);
    mmPilotInspectorEl.appendChild(split);
  };

  const renderArmorInspector = (coreId, liningId) => {
    if (!mmArmorInspectorEl) return;
    const core = catalog.getArmor(coreId);
    const lining = liningId ? catalog.getArmor(liningId) : null;
    mmArmorInspectorEl.replaceChildren();

    const makeRow = (label, item) => {
      const row = document.createElement('div');
      row.className = 'summary-row';
      const k = document.createElement('span');
      k.textContent = label;
      const v = document.createElement('strong');
      v.textContent = item ? `${item.id} ${item.name} (${item.weightKg >= 0 ? `+${item.weightKg}` : item.weightKg}kg)` : '未安裝 (選配)';
      row.append(k, v);
      return row;
    };
    const cMod = core?.statModifiers || {};
    const lMod = lining?.statModifiers || {};
    const apBonus = (cMod.apBonus || 0) + (lMod.apBonus || 0);
    const beamPct = Math.round(((cMod.beamResist || 0) + (lMod.beamResist || 0)) * 100);
    const blastPct = Math.round(((cMod.blastResist || 0) + (lMod.blastResist || 0)) * 100);
    const acsPct = Math.round(((cMod.acsCapBonus || 0) + (lMod.acsCapBonus || 0)) * 100);
    const recPct = Math.round(((cMod.staggerRecoveryBonus || 0) + (lMod.staggerRecoveryBonus || 0)) * 100);

    const coreNote = document.createElement('div');
    coreNote.className = 'bp-card-sub';
    coreNote.textContent = `合計加成: AP ${apBonus >= 0 ? `+${apBonus}` : apBonus} ｜ 光抗 ${beamPct}% · 爆抗 ${blastPct}% ｜ ACS上限 +${acsPct}%${recPct > 0 ? ` · 硬直恢復 +${recPct}%` : ''}`;

    mmArmorInspectorEl.append(makeRow('主核心 (ARMOR_CORE)', core), makeRow('外附加 (ARMOR_LINING)', lining), coreNote);
  };

  const renderCareerOverview = () => {
    if (!mmCareerOverviewEl) return;
    mmCareerOverviewEl.replaceChildren();

    // Bento gauges row
    const bentoGauges = document.createElement('div');
    bentoGauges.className = 'career-bento-gauges';
    bentoGauges.style.display = 'flex';
    bentoGauges.style.justifyContent = 'space-around';
    bentoGauges.style.padding = '8px 4px 12px 4px';
    bentoGauges.style.borderBottom = '1px solid var(--border-subtle, rgba(148, 184, 218, 0.14))';
    bentoGauges.style.marginBottom = '8px';

    const gaugeDefs = [
      { label: 'WIN RATE', pct: 68, col: '#34d399' },
      { label: 'PARRY ACC', pct: 74, col: '#38bdf8' },
      { label: 'MECHA SYN', pct: 85, col: '#ff8a2b' },
    ];
    gaugeDefs.forEach((g) => {
      const gBox = document.createElement('div');
      mountSvgString(gBox, renderCareerArcSvg({ label: g.label, pct: g.pct, accentColor: g.col }));
      bentoGauges.appendChild(gBox);
    });
    mmCareerOverviewEl.appendChild(bentoGauges);

    const stats = [
      ['已解鎖機體 (Mecha)', `1 / ${catalog.listActors().length} (EF-018 VALIANT)`],
      ['人類駕駛員 (Pilots)', `1 / ${catalog.listPilots().length} (KAI "RAVEN-01" REN)`],
      ['歸檔戰術地圖平面圖', `6 / ${catalog.listMaps().length} 張實測無重疊 Blueprint`],
      ['原創防禦護盾庫', `4 / 4 款全開放實戰測試`],
    ];
    stats.forEach(([k, v]) => {
      const row = document.createElement('div');
      row.className = 'summary-row';
      const kEl = document.createElement('span');
      kEl.textContent = k;
      const vEl = document.createElement('strong');
      vEl.textContent = v;
      row.append(kEl, vEl);
      mmCareerOverviewEl.appendChild(row);
    });
  };
  renderCareerOverview();

  const renderPaintEconomyBar = (skinId, eff) => {
    if (!mmPaintEconomyBarEl) return;
    const skin = getSkinById(skinId);
    const fin = PAINT_FINISHES.find((f) => f.id === (eff?.finishId || 'factory_matte')) || PAINT_FINISHES[0];
    const totalMc = (skin.priceMc || 0) + (fin.priceMc || 0);

    mmPaintEconomyBarEl.replaceChildren();
    const head = document.createElement('div');
    head.className = 'paint-econ-head';
    const title = document.createElement('strong');
    title.textContent = `${skin.shortName} ＋ ${fin.label}`;
    const pill = document.createElement('span');
    pill.className = `badge-pill ${totalMc > 0 ? 'badge-purchasable' : 'badge-active'}`;
    pill.textContent = totalMc > 0 ? `預定定價 ${totalMc} MC` : 'FREE PRESET';
    head.append(title, pill);

    const note = document.createElement('div');
    note.className = 'paint-econ-note';
    note.textContent =
      totalMc > 0
        ? `試玩期已開放原地免費試穿體驗 (Task 10C 啟用 MC 帳本扣款與「${skin.achievementUnlock || '特殊成就'}」解鎖)`
        : '聯邦制式標準配備 · 試玩期與正式版皆免費使用（支援全身 9 部位獨立改色）';

    mmPaintEconomyBarEl.append(head, note);
  };

  const syncPaintControls = () => {
    const app = getApp();
    if (!app) return;
    const skinId = app.activeSkinId || MECHA_SKINS[0].id;
    const zoneId = app.menuState?.activePaintZone || 'all';
    const customState = createCustomPaintState(app.customPalette);
    const eff = resolveEffectivePalette(skinId, customState, zoneId);

    skinSelect?.setValue(skinId);
    paintZoneSelect?.setValue(zoneId);
    if (finishSelect && !finishSelect.isOpen()) {
      refreshFinishOptions(eff.primary, eff.secondary);
    }
    finishSelect?.setValue(eff.finishId || 'factory_matte');

    if (diyPickers.primary) diyPickers.primary.value = eff.primary;
    if (diyPickers.secondary) diyPickers.secondary.value = eff.secondary;
    if (diyPickers.frame) diyPickers.frame.value = eff.frame;
    if (diyPickers.sensor) diyPickers.sensor.value = eff.sensor;
    if (diyPickers.thruster) diyPickers.thruster.value = eff.thruster;
    if (diyPickers.saber) diyPickers.saber.value = eff.saber;

    for (const [channel, inp] of Object.entries(diyPickers)) {
      const val = inp?.value ? inp.value.toUpperCase() : '';
      const hexEl = document.getElementById(`mm-diy-${channel}-hex`);
      if (hexEl && val) {
        hexEl.textContent = val;
      }
      const chipEl = document.querySelector(`[data-channel-chip="${channel}"]`);
      if (chipEl && val) {
        chipEl.style.setProperty('--chip-color', val);
      }
    }
    diyChannelBtns.forEach((btn) => {
      btn.classList.toggle('active', btn.dataset.paintChannel === activePaintChannel);
    });
    swatchPicker?.setChannelLabel(CHANNEL_LABELS[activePaintChannel] || activePaintChannel);
    if (diyPickers[activePaintChannel]?.value) {
      swatchPicker?.setHex(diyPickers[activePaintChannel].value);
    }

    const met = Number.isFinite(eff.metallic) ? eff.metallic : 0.45;
    const rgh = Number.isFinite(eff.roughness) ? eff.roughness : 0.42;
    if (diyMetallicSlider) diyMetallicSlider.value = String(met);
    if (diyMetallicValEl) diyMetallicValEl.textContent = met.toFixed(2);
    if (diyRoughnessSlider) diyRoughnessSlider.value = String(rgh);
    if (diyRoughnessValEl) diyRoughnessValEl.textContent = rgh.toFixed(2);
    syncAllHardwareControls();

    const mirrorOn = Boolean(customState.mirrorArms);
    paintMirrorArmsBtn?.classList.toggle('active', mirrorOn);
    if (paintMirrorArmsLabelEl) {
      paintMirrorArmsLabelEl.textContent = mirrorOn
        ? '左右臂對稱同步：開啟'
        : '左右臂獨立塗裝：不對稱模式';
    }

    renderPaintEconomyBar(skinId, eff);
  };

  const syncSortieSummary = () => {
    const app = getApp();
    if (!sortieSummaryEl || !app) return;
    const ms = app.menuState || {};
    const s = settingsStore.get();
    const skinObj = MECHA_SKINS.find((sk) => sk.id === app.activeSkinId) || MECHA_SKINS[0];
    const shDef = app.getActiveShieldDef();
    const modeObj = catalog.getMode(ms.previewModeId);
    const mapObj = catalog.getMap(ms.previewMapId);
    const mechaObj = kaijuPreview && ms.previewMechaId === kaijuPreview.id ? kaijuPreview : catalog.getActor(ms.previewMechaId);
    const pilotObj = catalog.getPilot(ms.previewPilotId);
    const camTxt = s.controls.defaultCameraMode === 'fps_cockpit' ? 'FPS 360° 全景座艙' : 'TPS 第三人稱過肩';
    const envTxt = app.lightingMode === 'night' ? '夜戰霓虹' : '日間東京';
    const isLobby = ms.sortieFlow === 'lobby';
    const flowTxt = isLobby
      ? ms.lobbyAction === 'join'
        ? `加入大廳 ${selectedLobbyId}`
        : `自建大廳：${(lobbyNameInput?.value || 'EF-018 小隊室').trim()}`
      : '單人作戰 SOLO';

    const { tax, validation } = computeCurrentBuildAnalysis(ms, app);

    sortieSummaryEl.replaceChildren();
    const rows = [
      ['作戰模式', `${flowTxt} · ${modeObj.shortLabel}`],
      ['戰區環境', `${mapObj.name} (${envTxt})`],
      ['出擊配備', `${mechaObj.id} ${mechaObj.codeName} / ${pilotObj.callsign}`],
      ['負載配置', `${app.loadoutPreset.shortLabel} · ${shDef.id} · ${Math.round(tax.loadRatio * 100)}% (${Math.round(tax.payloadKg || 0)}/${Math.round(tax.payloadCapKg || 1850)}kg)`],
    ];
    rows.forEach(([k, v]) => {
      const row = document.createElement('div');
      row.className = 'summary-row';
      const keySpan = document.createElement('span');
      keySpan.textContent = k;
      const valSpan = document.createElement('strong');
      valSpan.textContent = v;
      row.append(keySpan, valSpan);
      sortieSummaryEl.appendChild(row);
    });

    const readiness = resolveSortieReadiness(ms, catalog.getSnapshot());
    const canLaunchNow = readiness.canLaunch && validation.valid;
    if (homeDeployMetaEl) {
      const blockSuffix = !canLaunchNow ? ' · CONFIG BLOCKED' : '';
      const quickPrefix = isLobby ? `SOLO (${modeObj.shortLabel})` : modeObj.shortLabel;
      homeDeployMetaEl.textContent = `${quickPrefix} · ${mapObj.name} · ${mechaObj.id} ${mechaObj.codeName}${blockSuffix}`;
    }
    if (homeDeployBtn) {
      homeDeployBtn.classList.toggle('is-blocked', !canLaunchNow);
    }
    if (sortieModeBadgeBarEl) {
      sortieModeBadgeBarEl.replaceChildren();
      const mRow = document.createElement('div');
      mRow.className = 'summary-row';
      const mk = document.createElement('span');
      mk.textContent = '選定作戰協議';
      const mv = document.createElement('strong');
      mv.textContent = `${modeObj.name} (${modeObj.shortLabel})`;
      mRow.append(mk, mv);
      sortieModeBadgeBarEl.appendChild(mRow);
    }
    if (readinessBannerEl) {
      readinessBannerEl.classList.toggle('is-blocked', isLobby || !canLaunchNow || tax.overloadState === 'overloaded');
      if (isLobby) {
        readinessBannerEl.textContent = '連線大廳預覽 (Task 11 AWS ECS)：可切換戰術地圖／規則預覽，切回「單人作戰」立即啟動出擊';
      } else if (!canLaunchNow) {
        const blockerText = !readiness.canLaunch
          ? readiness.blockers.map((b) => `${b.label} (${b.plannedTask})`).join('、')
          : validation.errors.map((e) => e.message).join('、');
        readinessBannerEl.textContent = `施工藍圖或配置檢核限制：${blockerText}`;
      } else if (validation.warnings.length > 0) {
        readinessBannerEl.textContent = `整治提醒：${validation.warnings[0].message}（仍可出擊）`;
      } else {
        readinessBannerEl.textContent = '整備就緒：目前選擇之模式／地圖／機體／駕駛員／肩背裝甲皆可立即出擊';
      }
    }
    if (launchSortieBtn) {
      launchSortieBtn.classList.toggle('is-lobby', isLobby);
      launchSortieBtn.classList.toggle('is-blocked', !isLobby && !canLaunchNow);
    }
    if (launchLabelEl) {
      if (isLobby) {
        launchLabelEl.textContent = ms.lobbyAction === 'join' ? `加入大廳 ${selectedLobbyId} (Task 11)` : '建立多人大廳 (Task 11)';
      } else if (!canLaunchNow) {
        launchLabelEl.textContent = `配置檢核受阻 (${readiness.blockers[0]?.plannedTask || validation.errors[0]?.code || '檢查裝備'})`;
      } else {
        launchLabelEl.textContent = '啟動出擊 LAUNCH SORTIE';
      }
    }
    bindAllTooltips(mmSortieDockEl);
    bindAllTooltips(document.getElementById('pause-overlay'));
  };

  const syncArmorySlotValues = (ms, app) => {
    const mechaObj = kaijuPreview && ms.previewMechaId === kaijuPreview.id ? kaijuPreview : catalog.getActor(ms.previewMechaId);
    const pilotObj = catalog.getPilot(ms.previewPilotId);
    const pr = app?.loadoutPreset || { lHand: 'saber', rHand: 'pistol' };
    const shDef = app?.getActiveShieldDef?.() || { id: 'EF-SH03' };
    const lBackObj = ms.previewLBackId ? catalog.getWeapon(ms.previewLBackId) : null;
    const rBackObj = ms.previewRBackId ? catalog.getWeapon(ms.previewRBackId) : null;
    const rGunId = (ms.previewRHandWeaponId || 'EF-AR01').replace('EF-', '');
    const valMap = {
      body: mechaObj?.codeName || 'VALIANT',
      pilot: pilotObj?.callsign || 'RAVEN-01',
      l_hand: HAND_SHORT_LABELS[pr.lHand] || pr.lHand,
      r_hand: pr.rHand === 'pistol' ? `${rGunId}` : HAND_SHORT_LABELS[pr.rHand] || pr.rHand,
      shield: shDef.id.replace('EF-', ''),
      l_back: lBackObj ? lBackObj.shortLabel || lBackObj.id.replace('EF-', '') : '未掛載',
      r_back: rBackObj ? rBackObj.shortLabel || rBackObj.id.replace('EF-', '') : '未掛載',
      armor: (ms.previewArmorCoreId || 'EF-AC01').replace('EF-', ''),
    };
    for (const [slotId, el] of armorySlotValEls.entries()) {
      el.textContent = valMap[slotId] || '';
    }
    for (const [slotId, node] of armoryPinNodes.entries()) {
      node.lblEl.textContent = valMap[slotId] || slotId;
    }
  };

  const syncEquipmentState = () => {
    const app = getApp();
    const ms = app?.menuState || {};
    const pr = app?.loadoutPreset || { mode: 1, lHand: 'saber', rHand: 'pistol' };
    const mode = pr.mode || 0;
    const shieldId = app?.activeShieldId || 'EF-SH03';
    const lighting = app?.lightingMode || 'daylight';
    const activeArmorySlot = ms.activeArmorySlot || 'body';

    lobbyModeSelect?.setValue(ms.previewModeId || 'sandbox');
    const activeShowcaseMode = ms.sortieFlow === 'lobby' ? 'lobby' : (ms.previewModeId || 'sandbox');
    sortieModeCards.forEach((card) => {
      card.classList.toggle('active', card.dataset.sortieMode === activeShowcaseMode);
    });
    if (armoryPresetsBarEl) {
      armoryPresetsBarEl.hidden = !(activeArmorySlot === 'l_hand' || activeArmorySlot === 'r_hand');
    }
    const hasHandGun = pr.lHand === 'pistol' || pr.rHand === 'pistol';
    if (rHandGunStatusEl) {
      rHandGunStatusEl.textContent = hasHandGun ? '主槍掛載中 (ACTIVE)' : '左右任一手改配步槍時啟用';
    }
    if (rHandGunGridEl) {
      rHandGunGridEl.style.opacity = hasHandGun ? '1' : '0.62';
    }
    armorCoreSelect?.setValue(ms.previewArmorCoreId || 'EF-AC01');
    armorLiningSelect?.setValue(ms.previewArmorLiningId || '__none__');

    document.querySelectorAll('[data-map-id]').forEach((el) => {
      el.classList.toggle('active', el.dataset.mapId === (ms.previewMapId || 'neo_tokyo'));
    });
    document.querySelectorAll('[data-mecha-id]').forEach((el) => {
      el.classList.toggle('active', el.dataset.mechaId === (ms.previewMechaId || 'EF-018'));
    });
    document.querySelectorAll('[data-mecha-variant-id]').forEach((el) => {
      el.classList.toggle('active', el.dataset.mechaVariantId === (ms.previewMechaVariantId || 'mk2'));
    });
    document.querySelectorAll('[data-pilot-id]').forEach((el) => {
      el.classList.toggle('active', el.dataset.pilotId === (ms.previewPilotId || 'PILOT-01'));
    });
    document.querySelectorAll('[data-loadout-mode]').forEach((el) => {
      el.classList.toggle('active', mode > 0 && Number(el.dataset.loadoutMode) === mode);
    });
    document.querySelectorAll('[data-hand-slot="lHand"]').forEach((el) => {
      el.classList.toggle('active', el.dataset.weaponKind === pr.lHand);
    });
    document.querySelectorAll('[data-hand-slot="rHand"]').forEach((el) => {
      el.classList.toggle('active', el.dataset.weaponKind === pr.rHand);
    });
    document.querySelectorAll('[data-rhand-weapon-id]').forEach((el) => {
      el.classList.toggle('active', el.dataset.rhandWeaponId === (ms.previewRHandWeaponId || 'EF-AR01'));
    });
    document.querySelectorAll('[data-shield-id]').forEach((el) => {
      el.classList.toggle('active', el.dataset.shieldId === shieldId);
    });
    document.querySelectorAll('[data-lback-id]').forEach((el) => {
      el.classList.toggle('active', el.dataset.lbackId === (ms.previewLBackId || '__none__'));
    });
    document.querySelectorAll('[data-rback-id]').forEach((el) => {
      el.classList.toggle('active', el.dataset.rbackId === (ms.previewRBackId || '__none__'));
    });
    document.querySelectorAll('[data-armory-slot-id]').forEach((el) => {
      el.classList.toggle('active', el.dataset.armorySlotId === activeArmorySlot);
    });
    document.querySelectorAll('[data-armory-panel]').forEach((el) => {
      el.classList.toggle('active', el.dataset.armoryPanel === activeArmorySlot);
    });
    envDayBtn?.classList.toggle('active', lighting === 'daylight');
    envNightBtn?.classList.toggle('active', lighting === 'night');
    quickEnvDayBtn?.classList.toggle('active', lighting === 'daylight');
    quickEnvNightBtn?.classList.toggle('active', lighting === 'night');

    renderMapInspector(ms.previewMapId || 'neo_tokyo');
    renderMechaInspector(ms.previewMechaId || 'EF-018', ms.previewMechaVariantId || 'mk2');
    renderPilotInspector(ms.previewPilotId || 'PILOT-01');
    renderBackWeaponInspector('l_back', ms.previewLBackId || null, lBackInspectorEl);
    renderBackWeaponInspector('r_back', ms.previewRBackId || null, rBackInspectorEl);
    renderArmorInspector(ms.previewArmorCoreId || 'EF-AC01', ms.previewArmorLiningId || null);
    renderShieldSpecCard(shieldId);
    renderArmoryTelemetry(ms, app);
    syncArmorySlotValues(ms, app);
    syncPaintControls();
    syncSortieSummary();
    bindAllTooltips(document.getElementById('main-menu-overlay') || document);
  };

  const syncMouseMappingDiagram = (invMouse) => {
    if (!mouseMappingCardEl) return;
    mouseMappingCardEl.replaceChildren();
    const lCard = document.createElement('div');
    lCard.className = 'mouse-map-pill';
    lCard.textContent = `左鍵 LMB // ${invMouse ? '右手 (R-HAND)' : '左手 (L-HAND)'}`;
    const rCard = document.createElement('div');
    rCard.className = 'mouse-map-pill';
    rCard.textContent = `右鍵 RMB // ${invMouse ? '左手 (L-HAND)' : '右手 (R-HAND)'}`;
    mouseMappingCardEl.append(lCard, rCard);
  };

  const setRebindHint = (msg, capturing = false) => {
    if (!rebindHintEl) return;
    rebindHintEl.textContent = msg;
    rebindHintEl.classList.toggle('capturing', capturing);
  };

  const syncSettingsUI = (s, meta = null) => {
    if (!s) return;
    const preset = meta?.preset || QUALITY_PRESETS[s.graphics.qualityPreset] || QUALITY_PRESETS.standard;
    const effDpr = meta?.effectiveDpr ?? resolveEffectivePixelRatio(window.devicePixelRatio || 1, preset.id);
    const fullSpecTxt = `DPR ≤ ${preset.dprCap.toFixed(2)}x | 實際 ${effDpr.toFixed(2)}x | Bloom ${preset.bloom ? 'ON' : 'OFF'} | Shadow ${preset.shadows ? 'ON' : 'OFF'}`;
    if (pauseDprBadgeEl) pauseDprBadgeEl.textContent = fullSpecTxt;
    if (qualityMetaEl) {
      qualityMetaEl.textContent = `有效渲染解析度上限 DPR ≤ ${preset.dprCap.toFixed(2)}x ｜ 特效粒子預算 ${Math.round(preset.particleBudgetScale * 100)}%`;
    }

    for (const [track, refs] of Object.entries(volSliders)) {
      const v = s.audio[track] ?? 0;
      if (refs.input) refs.input.value = String(v);
      if (refs.val) refs.val.textContent = `${Math.round(v * 100)}%`;
    }
    bgmMenuSelect?.setValue(s.music?.menuTrack || DEFAULT_BGM_SETTINGS.menuTrack);
    bgmCombatSelect?.setValue(s.music?.combatTrack || DEFAULT_BGM_SETTINGS.combatTrack);

    qualitySelect?.setValue(preset.id);

    if (fovSlider) fovSlider.value = String(s.controls.baseFov);
    if (fovValEl) fovValEl.textContent = `${Math.round(s.controls.baseFov)}°`;

    const shakePct = Math.round((s.graphics.cameraShakeScale ?? 1.0) * 100);
    if (shakeSlider) shakeSlider.value = String(s.graphics.cameraShakeScale ?? 1.0);
    if (shakeValEl) shakeValEl.textContent = `${shakePct}%`;

    const showHelp = s.graphics.showControlsHelp !== false;
    if (chkShowControlsHelp) chkShowControlsHelp.checked = showHelp;
    document.body.classList.toggle('controls-help-hidden', !showHelp);
    if (chkSaberGuideSandbox) chkSaberGuideSandbox.checked = (s.graphics.saberGuideMode || 'sandbox_only') !== 'off';

    const invMouse = Boolean(s.controls.invertMouseButtons);
    if (chkInvertMouse) chkInvertMouse.checked = invMouse;
    syncMouseMappingDiagram(invMouse);

    if (chkInvertY) chkInvertY.checked = Boolean(s.controls.invertLookY);
    if (sensSlider) sensSlider.value = String(s.controls.mouseSensitivity);
    if (sensValEl) sensValEl.textContent = `${Number(s.controls.mouseSensitivity).toFixed(2)}x`;

    const defCam = s.controls.defaultCameraMode === 'fps_cockpit' ? 'fps_cockpit' : 'tps';
    defaultCamSelect?.setValue(defCam);

    const activeRebind = getApp()?.menuState?.rebindingAction || null;
    for (const act of KEYBIND_ACTIONS) {
      const entry = keybindButtons.get(act.id);
      if (!entry) continue;
      entry.capEl.textContent = formatKeyCodeLabel(s.keybindings[act.id]);
      entry.btn.classList.toggle('listening', activeRebind === act.id);
    }

    const app = getApp();
    const camKey = formatKeyCodeLabel(s.keybindings.cameraMode);
    if (quickCamBtn) {
      const isTps = !app || app.cameraMode === CAMERA_MODES.TPS;
      const lbl = quickCamBtn.querySelector('span:last-child') || quickCamBtn;
      lbl.textContent = isTps ? `切換 FPS 360° 座艙 (${camKey})` : `切換 TPS 第三人稱 (${camKey})`;
    }
    if (quickOrbitBtn) {
      const lbl = quickOrbitBtn.querySelector('span:last-child') || quickOrbitBtn;
      lbl.textContent = `切換 360° 正面檢視 (${formatKeyCodeLabel(s.keybindings.orbitInspect)})`;
    }

    hudOverlay.syncControlsHelp(s);
    syncAllHardwareControls();
    syncSortieSummary();
    bindAllTooltips(settingsRootEl);
    bindAllTooltips(pauseDprBadgeEl);
  };

  const syncArmoryPinsOverlay = (pins) => {
    if (!armoryPinsEl) return;
    if (!Array.isArray(pins) || pins.length === 0) {
      if (armoryPinsEl.classList.contains('active')) {
        armoryPinsEl.classList.remove('active');
        for (const node of armoryPinNodes.values()) {
          node.btn.style.display = 'none';
        }
      }
      return;
    }
    armoryPinsEl.classList.add('active');
    const activeSlot = getApp()?.menuState?.activeArmorySlot || 'body';
    for (const pin of pins) {
      const node = armoryPinNodes.get(pin.id);
      if (!node) continue;
      if (!pin.visible) {
        node.btn.style.display = 'none';
        continue;
      }
      node.btn.style.display = 'inline-flex';
      node.btn.style.left = `${pin.x.toFixed(1)}px`;
      node.btn.style.top = `${pin.y.toFixed(1)}px`;
      node.btn.classList.toggle('active', pin.id === activeSlot);
    }
  };

  const renderPostMatchSummary = (summary) => {
    if (!summary) return;
    if (pmRankBadgeEl) {
      pmRankBadgeEl.textContent = summary.rank || 'C';
      pmRankBadgeEl.dataset.rank = summary.rank || 'C';
    }
    if (pmTitleEl) {
      pmTitleEl.textContent = summary.won ? 'MISSION COMPLETE // VICTORY' : 'SORTIE FAILED // DEFEAT';
    }
    if (pmSubtitleEl) {
      pmSubtitleEl.textContent = `1v1 王牌 AI 決鬥 (BO3) ｜ 對手 ${summary.rivalName || 'EF-T01 ACE'} ｜ 用時 ${summary.durationLabel || '00:00.0'}`;
    }
    if (pmScorePillEl) {
      pmScorePillEl.textContent = `${summary.playerWins || 0} : ${summary.enemyWins || 0}`;
    }
    const st = summary.stats || {};
    if (pmStatApEl) pmStatApEl.textContent = `${st.hpRemainingPct ?? 0}%`;
    if (pmStatParryEl) pmStatParryEl.textContent = String(st.parries ?? 0);
    if (pmStatClashEl) pmStatClashEl.textContent = String(st.clashes ?? 0);
    if (pmStatDmgEl) pmStatDmgEl.textContent = `${st.damageDealt ?? 0} / ${summary.durationLabel || '00:00.0'}`;
    const mc = summary.mcBreakdown || {};
    if (pmMcTotalEl) pmMcTotalEl.textContent = `+${summary.netMc ?? 60} MC`;
    if (pmMcDetailEl) {
      pmMcDetailEl.textContent = `賞金 +${mc.baseBounty ?? 0} | 戰技 +${mc.combatBonus ?? 0} | 拆樓 +${mc.destructionBonus ?? 0} | 維修 -${mc.repairCost ?? 0} | 倍率 x${(mc.rankMultiplier ?? 1).toFixed(2)}`;
    }

    // Mount #pm-timeline-chart-box
    const pmTimelineChartBoxEl = document.getElementById('pm-timeline-chart-box');
    if (pmTimelineChartBoxEl) {
      mountSvgString(
        pmTimelineChartBoxEl,
        renderPostMatchTimelineSvg({
          timeline: summary.timeline || [],
          durationSec: summary.durationSec || st.durationSec || 30,
        }),
      );
    }

    // Mount #pm-damage-audit
    const pmDamageAuditEl = document.getElementById('pm-damage-audit');
    if (pmDamageAuditEl) {
      pmDamageAuditEl.replaceChildren();
      const dollBox = document.createElement('div');
      dollBox.className = 'pm-doll-svg-box';
      mountSvgString(dollBox, renderMechaPaperdollSvg(getApp()?.partDamage || {}, { width: 48, height: 64 }));

      const auditInfo = document.createElement('div');
      auditInfo.className = 'pm-audit-info';
      auditInfo.style.display = 'flex';
      auditInfo.style.flexDirection = 'column';
      auditInfo.style.gap = '3px';

      const auditTitle = document.createElement('strong');
      auditTitle.style.fontSize = '12px';
      auditTitle.style.color = '#cbdcf0';
      auditTitle.textContent = '機體戰損審查 (DAMAGE AUDIT)';

      const auditTags = document.createElement('div');
      auditTags.className = 'pm-audit-tags';
      auditTags.style.display = 'flex';
      auditTags.style.flexWrap = 'wrap';
      auditTags.style.gap = '5px';

      const pa = summary.partAudit || {};
      const intactChip = document.createElement('span');
      intactChip.className = 'tag-chip';
      intactChip.textContent = `完好部位: ${pa.playerIntactCount ?? 6} / 6`;
      auditTags.appendChild(intactChip);

      if (Array.isArray(pa.playerBrokenParts) && pa.playerBrokenParts.length > 0) {
        const brokenChip = document.createElement('span');
        brokenChip.className = 'tag-chip';
        brokenChip.style.color = '#ff8a8a';
        brokenChip.textContent = `受損斷裂: ${pa.playerBrokenParts.join(', ')}`;
        auditTags.appendChild(brokenChip);
      }
      if (Array.isArray(pa.rivalSeveredArms) && pa.rivalSeveredArms.length > 0) {
        const severedChip = document.createElement('span');
        severedChip.className = 'tag-chip';
        severedChip.style.color = '#34d399';
        severedChip.textContent = `對手斬斷: ${pa.rivalSeveredArms.join(', ')}`;
        auditTags.appendChild(severedChip);
      }

      auditInfo.append(auditTitle, auditTags);
      pmDamageAuditEl.append(dollBox, auditInfo);
    }

    if (pmTimelineListEl) {
      pmTimelineListEl.replaceChildren();
      const events = Array.isArray(summary.timeline) ? summary.timeline : [];
      events.forEach((ev, idx) => {
        const row = document.createElement('div');
        row.className = 'pm-ev-row';
        row.dataset.eventIdx = String(idx);
        row.tabIndex = 0;
        const timeEl = document.createElement('span');
        timeEl.className = 'pm-ev-time';
        timeEl.textContent = ev.timeLabel || '00:00.0';
        const tagEl = document.createElement('span');
        tagEl.className = 'pm-ev-tag';
        tagEl.dataset.actor = ev.actor || 'system';
        tagEl.textContent = `[${ev.type || 'EVENT'}]`;
        const descEl = document.createElement('span');
        descEl.textContent = ev.detail || '';
        row.append(timeEl, tagEl, descEl);
        pmTimelineListEl.appendChild(row);
      });
    }

    // Wire bidirectional Interactive Timeline Scrubbing across [data-event-idx]
    const setActiveScrub = (idxOrNull) => {
      pmTimelineListEl?.querySelectorAll('.is-scrub-active').forEach((el) => el.classList.remove('is-scrub-active'));
      pmTimelineChartBoxEl?.querySelectorAll('.is-scrub-active').forEach((el) => el.classList.remove('is-scrub-active'));
      if (idxOrNull === null || idxOrNull === undefined) return;
      const idxStr = String(idxOrNull);
      const matchedRow = pmTimelineListEl?.querySelector(`[data-event-idx="${idxStr}"]`);
      if (matchedRow) {
        matchedRow.classList.add('is-scrub-active');
        matchedRow.scrollIntoView?.({ block: 'nearest', behavior: 'smooth' });
      }
      const matchedDot = pmTimelineChartBoxEl?.querySelector(`circle[data-event-idx="${idxStr}"]`);
      if (matchedDot) {
        matchedDot.classList.add('is-scrub-active');
      }
    };

    pmTimelineListEl?.querySelectorAll('.pm-ev-row').forEach((row) => {
      const idx = row.dataset.eventIdx;
      row.addEventListener('mouseenter', () => setActiveScrub(idx));
      row.addEventListener('mouseleave', () => setActiveScrub(null));
      row.addEventListener('focus', () => setActiveScrub(idx));
      row.addEventListener('blur', () => setActiveScrub(null));
    });

    pmTimelineChartBoxEl?.querySelectorAll('.pm-tl-dot').forEach((dot) => {
      const idx = dot.dataset.eventIdx;
      dot.addEventListener('mouseenter', () => setActiveScrub(idx));
      dot.addEventListener('mouseleave', () => setActiveScrub(null));
      dot.addEventListener('focus', () => setActiveScrub(idx));
      dot.addEventListener('blur', () => setActiveScrub(null));
    });
  };

  const updateKeycapFooter = (menuState) => {
    if (!keycapHintsEl) return;
    const hints = [];
    const tab = menuState.mainTab || 'home';
    const step = menuState.sortieStep || 'mode';
    if (menuState.panelCollapsed) {
      hints.push(['F', '展開面板'], ['DRAG', '360° 賞機'], ['WHEEL', '縮放鏡頭']);
    } else if (tab === 'home') {
      hints.push(['ENTER', '快速出擊'], ['F', '純粹賞機'], ['DRAG', '旋轉展示']);
    } else if (tab === 'sortie' && step === 'mode') {
      hints.push(['ESC', '返回主堡'], ['CLICK', '選擇協議']);
    } else if (tab === 'sortie') {
      hints.push(['ENTER', '啟動出擊'], ['PREV / NEXT', '切換地圖'], ['ESC', '重選模式']);
    } else if (tab === 'armory' || tab === 'paint') {
      hints.push(['F', '純粹賞機'], ['DRAG', '檢視機體'], ['WHEEL', '局部縮放'], ['ESC', '返回主堡']);
    } else {
      hints.push(['H', '作戰手冊'], ['ESC', '返回主堡']);
    }
    keycapHintsEl.replaceChildren();
    hints.forEach(([key, label]) => {
      const wrap = document.createElement('span');
      wrap.className = 'mm-keycap-item';
      const kbd = document.createElement('kbd');
      kbd.className = 'mm-keycap';
      kbd.textContent = key;
      const txt = document.createElement('span');
      txt.textContent = label;
      wrap.append(kbd, txt);
      keycapHintsEl.appendChild(wrap);
    });
  };

  const syncMenuState = (menuState) => {
    if (!menuState) return;
    const isMainMenu = menuState.screen === APP_SCREENS.MAIN_MENU;
    const isPaused = menuState.screen === APP_SCREENS.PAUSED;
    const isPostMatch = menuState.screen === APP_SCREENS.POST_MATCH;
    const sStep = menuState.sortieStep || 'mode';

    document.body.classList.toggle('in-main-menu', isMainMenu);
    document.body.classList.toggle('in-pause', isPaused);
    document.body.classList.toggle('in-post-match', isPostMatch);
    document.body.classList.toggle('mm-panel-collapsed', isMainMenu && Boolean(menuState.panelCollapsed));
    MAIN_MENU_TABS.forEach((tab) => {
      document.body.classList.toggle(`mm-tab-${tab.id}`, isMainMenu && menuState.mainTab === tab.id);
    });
    document.body.classList.toggle('mm-sortie-mode', isMainMenu && menuState.mainTab === 'sortie' && sStep === 'mode');
    document.body.classList.toggle('mm-sortie-briefing', isMainMenu && menuState.mainTab === 'sortie' && sStep === 'briefing');
    document.body.classList.toggle('mm-sortie-lobby', isMainMenu && menuState.mainTab === 'sortie' && sStep === 'lobby');
    if (mmMcTextEl) {
      mmMcTextEl.textContent = `${getApp()?.score?.mcEarned ?? 0} MC`;
    }
    if (isPostMatch && menuState.lastMatchSummary) {
      renderPostMatchSummary(menuState.lastMatchSummary);
    }

    // Move single shared #settings-center-root to whichever host slot is visible
    if (settingsRootEl) {
      if (isMainMenu && menuState.mainTab === 'settings' && mainSettingsSlot) {
        if (settingsRootEl.parentElement !== mainSettingsSlot) {
          mainSettingsSlot.appendChild(settingsRootEl);
        }
      } else if (isPaused && menuState.pauseView === PAUSE_VIEWS.SETTINGS && pauseSettingsSlot) {
        if (settingsRootEl.parentElement !== pauseSettingsSlot) {
          pauseSettingsSlot.appendChild(settingsRootEl);
        }
      }
    }

    // Sync Sortie Step / Flow (Mode Cards vs Briefing vs Multiplayer Lobby) & Map Carousel Visibility
    const sFlow = sStep === 'lobby' ? 'lobby' : menuState.sortieFlow || 'solo';
    const lAct = menuState.lobbyAction || 'create';
    if (sortieBriefingTitleEl) {
      sortieBriefingTitleEl.textContent =
        sStep === 'lobby' ? '多人連線大廳設定 (NETWORK LOBBY)' : '任務簡報配置 (OPERATION BRIEFING)';
    }
    lobbyCreateBtn?.classList.toggle('active', lAct === 'create');
    lobbyJoinBtn?.classList.toggle('active', lAct === 'join');
    document.querySelectorAll('[data-sortie-flow]').forEach((el) => {
      el.classList.toggle('active', el.dataset.sortieFlow === sFlow);
    });
    document.querySelectorAll('[data-lobby-panel]').forEach((el) => {
      el.classList.toggle('active', el.dataset.lobbyPanel === lAct);
    });
    if (mapCarouselSectionEl) {
      mapCarouselSectionEl.style.display = sFlow === 'lobby' && lAct === 'join' ? 'none' : '';
    }

    // Sync Main Menu tabs & panels
    mmTabBarEl?.querySelectorAll('.mm-tab-btn').forEach((btn) => {
      btn.classList.toggle('active', btn.dataset.mainTab === menuState.mainTab);
    });
    document.querySelectorAll('[data-mm-panel]').forEach((panel) => {
      panel.classList.toggle('active', panel.dataset.mmPanel === menuState.mainTab);
    });
    if (!isMainMenu || menuState.mainTab !== 'armory' || menuState.panelCollapsed) {
      syncArmoryPinsOverlay(null);
    }
    const tabMeta = MAIN_MENU_TABS.find((t) => t.id === menuState.mainTab);
    if (mmPanelHeadingEl) {
      mmPanelHeadingEl.textContent = `${tabMeta?.code || '00'} // ${tabMeta?.subLabel || 'HOME'} (${tabMeta?.label || ''})`;
    }
    if (mmStageTagEl) {
      mmStageTagEl.textContent = `3D 格納庫展示 (${tabMeta?.subLabel || 'HOME'})`;
    }
    updateKeycapFooter(menuState);

    // Sync Pause Hub vs Sub-Views
    document.querySelectorAll('[data-pause-view]').forEach((viewEl) => {
      viewEl.classList.toggle('active', viewEl.dataset.pauseView === menuState.pauseView);
    });
    if (pauseRestartLabelEl) {
      pauseRestartLabelEl.textContent = menuState.previewModeId === 'duel_1v1'
        ? '重新開戰 RESTART DUEL'
        : '重置戰場與靶機 RESTART SANDBOX';
    }

    // Sync Categorized Settings Sub-Tabs
    settingsSubnavEl?.querySelectorAll('.settings-nav-btn').forEach((btn) => {
      btn.classList.toggle('active', btn.dataset.settingsTab === menuState.settingsTab);
    });
    document.querySelectorAll('[data-settings-panel]').forEach((panel) => {
      panel.classList.toggle('active', panel.dataset.settingsPanel === menuState.settingsTab);
    });

    if (!menuState.rebindingAction) {
      setRebindHint('點擊任一功能按鈕後按下新按鍵（ESC 取消）', false);
    }

    // Toggle #mm-sortie-dock visibility cleanly (only during Briefing or Lobby sub-drawer)
    if (mmSortieDockEl) {
      mmSortieDockEl.hidden = !(isMainMenu && menuState.mainTab === 'sortie' && sStep !== 'mode');
    }

    // Toggle #pause-online-banner visibility cleanly
    if (pauseOnlineBannerEl) {
      const isOnline = menuState.sortieFlow === 'lobby' || Boolean(menuState.isOnline);
      pauseOnlineBannerEl.hidden = !isOnline;
    }

    syncEquipmentState();
    syncSettingsUI(settingsStore.get());
    bindAllTooltips(document.getElementById('main-menu-overlay') || document);
    bindAllTooltips(document.getElementById('pause-overlay'));
  };

  const openCombatManualModal = () => {
    if (popManager) {
      popManager.showModal({
        title: '戰術操作手冊與戰鬥系統說明 // COMBAT MANUAL',
        kicker: 'TACTICAL MANUAL // PILOT GUIDE',
        iconKind: 'sortie',
        bodyBuilder: (bodyEl) => {
          const sections = [
            {
              title: '1. 1-6 武裝配置與雙持體系 (Dual-Wielding)',
              desc: '數字鍵 1-6 快速切換雙手預設。系統全面支援雙持手槍 (Dual Pistols)、雙持光劍 (Dual Sabers)、右手持盾等 6 種戰術組合。',
            },
            {
              title: '2. 護盾防禦反連點機制與完美格擋 (Shield Anti-Spam & Perfect Parry)',
              desc: '按住 RMB / KeyE 舉盾。最小架盾時間 0.25s，收盾再舉延遲 0.22s；若過早鬆開將觸發失誤衰減（格擋窗口 100% 至 0%）。在受擊前 0.12s 內精準架盾可觸發完美格擋 (Perfect Parry)，免疫削韌、立即重置冷卻並震退對手！',
            },
            {
              title: '3. ACS 姿態失衡與 200% 易傷 (ACS Stagger System)',
              desc: '連續承受打擊或重斬將累積 ACS 衝擊計量表。達到 100% 時機體進入 Stagger 癱瘓僵直，此期間所有武器與斬擊造成 200% 致命易傷！',
            },
            {
              title: '4. 光劍精準部位破壞與斷肢 (Beam Saber Dismemberment)',
              desc: '滑鼠劃動發動 8 方向動態斬擊。針對特定部位（左臂、右臂、腿部、頭部）造成累積破壞可斬斷肢體，斷肢立即剝奪該側武器並大幅削弱機動性！',
            },
            {
              title: '5. 戰術快捷鍵一覽 (Flight & Controls)',
              desc: 'WASD 移動 ｜ Shift 噴射推進 ｜ Space 垂直起飛 ｜ F 拋棄武裝 ｜ R 拾取武器 ｜ C / Alt 環視機甲 ｜ V 切換 FPS 座艙 ｜ H 暫停並開啟本手冊 ｜ ESC 系統暫停。',
            },
          ];

          sections.forEach((sec) => {
            const wrap = document.createElement('div');
            wrap.style.marginBottom = '10px';
            const h = document.createElement('strong');
            h.style.color = '#ff8a2b';
            h.style.display = 'block';
            h.style.marginBottom = '2px';
            h.style.fontSize = '12px';
            h.textContent = sec.title;
            const p = document.createElement('p');
            p.style.fontSize = '11.5px';
            p.style.color = '#cbdcf0';
            p.style.lineHeight = '1.45';
            p.style.margin = '0';
            p.textContent = sec.desc;
            wrap.append(h, p);
            bodyEl.appendChild(wrap);
          });
        },
        actions: [{ label: '關閉手冊 (ESC)', primary: true, autoFocus: true }],
      });
    } else {
      showToast('戰術手冊：數字鍵 1-6 換裝 ｜ RMB 架盾完美格擋 ｜ ACS 200% 易傷 ｜ 光劍部位斷肢');
    }
  };

  manualPopBtn?.addEventListener('click', openCombatManualModal);
  careerManualBtn?.addEventListener('click', openCombatManualModal);

  // Wire Home Hub Blades, Breadcrumbs, & Mode Showcase
  breadcrumbHomeBtn?.addEventListener('click', () => {
    emitUiSound('cancel');
    switchMenuTabWithLead('home');
  });
  modeBackHomeBtn?.addEventListener('click', () => {
    emitUiSound('cancel');
    switchMenuTabWithLead('home');
  });
  sortieBackModeBtn?.addEventListener('click', () => {
    emitUiSound('cancel');
    getApp()?.setSortieStep('mode');
  });
  homeBladeBtns.forEach((btn) => {
    btn.addEventListener('mouseenter', () => emitUiSound('hover'));
    btn.addEventListener('click', () => {
      emitUiSound('confirm');
      const targetTab = btn.dataset.homeTab;
      if (targetTab) {
        if (targetTab === 'sortie') {
          getApp()?.setSortieStep('mode');
        }
        switchMenuTabWithLead(targetTab);
      }
    });
  });
  homeDeployBtn?.addEventListener('mouseenter', () => emitUiSound('hover'));
  homeDeployBtn?.addEventListener('click', () => {
    const app = getApp();
    if (!app) return;
    if (app.menuState?.sortieFlow === 'lobby') {
      app.selectCatalogPreview('sortie_flow', 'solo');
    }
    app.startSortie();
  });
  sortieModeCards.forEach((card) => {
    card.addEventListener('mouseenter', () => emitUiSound('hover'));
    card.addEventListener('click', () => {
      const app = getApp();
      if (!app) return;
      emitUiSound('confirm');
      const modeChoice = card.dataset.sortieMode;
      if (modeChoice === 'lobby') {
        app.selectCatalogPreview('sortie_flow', 'lobby');
        app.setSortieStep('lobby');
      } else {
        app.selectCatalogPreview('sortie_flow', 'solo');
        app.selectCatalogPreview('mode', modeChoice || 'sandbox');
        app.setSortieStep('briefing');
      }
    });
  });

  // Wire Paint 6-Channel Chips
  diyChannelBtns.forEach((btn) => {
    btn.addEventListener('mouseenter', () => emitUiSound('hover'));
    btn.addEventListener('click', () => {
      emitUiSound('tick');
      activePaintChannel = btn.dataset.paintChannel || 'primary';
      diyChannelBtns.forEach((el) => {
        el.classList.toggle('active', el.dataset.paintChannel === activePaintChannel);
      });
      swatchPicker?.setChannelLabel(CHANNEL_LABELS[activePaintChannel] || activePaintChannel);
      const curHex = diyPickers[activePaintChannel]?.value || '#c9d4e0';
      swatchPicker?.setHex(curHex);
    });
  });

  // Wire static & sub-menu action listeners
  collapsePanelBtn?.addEventListener('click', () => {
    emitUiSound('tick');
    getApp()?.togglePanelCollapse();
  });
  expandPanelBtn?.addEventListener('click', () => {
    emitUiSound('tick');
    getApp()?.togglePanelCollapse();
  });
  donateTeaserBtn?.addEventListener('click', () => {
    if (popManager) {
      popManager.showModal({
        title: '贊助藍圖計畫 // ZERO PAY-TO-WIN',
        kicker: 'COMMEMORATIVE SUPPORTER BLUEPRINT',
        iconKind: 'lock',
        bodyBuilder: (bodyEl) => {
          const intro = document.createElement('p');
          intro.textContent = '本計畫所有贊助項目僅包含獨立外觀塗裝、駕駛員戰術名片徽章與紀念擊毀粒子特效，絕對不提供任何機體性能、防禦或傷害加成。';
          const swatchRow = document.createElement('div');
          swatchRow.className = 'supporter-swatch-row';
          swatchRow.style.display = 'flex';
          swatchRow.style.gap = '8px';
          swatchRow.style.margin = '12px 0';
          const swatches = [
            { label: 'TITANIUM BLACK', p: '#1b1e23', s: '#2e3440', a: '#ff8a2b' },
            { label: 'COBALT NEON', p: '#102a43', s: '#243b53', a: '#00d4ff' },
            { label: 'SOLAR FLARE', p: '#3b1d11', s: '#632514', a: '#fca311' },
          ];
          swatches.forEach((sw) => {
            const wrap = document.createElement('div');
            wrap.style.display = 'flex';
            wrap.style.alignItems = 'center';
            wrap.style.gap = '6px';
            wrap.style.fontSize = '12px';
            wrap.style.color = '#cbdcf0';
            const icon = document.createElement('span');
            mountSvgString(icon, makeSkinSwatchSvg(sw.p, sw.s, sw.a));
            const txt = document.createElement('span');
            txt.textContent = sw.label;
            wrap.append(icon, txt);
            swatchRow.appendChild(wrap);
          });
          const note = document.createElement('p');
          note.style.fontSize = '12px';
          note.style.color = '#7d93ad';
          note.textContent = '藍圖預計於 Task 10C 實裝。感謝所有支持獨立機甲沙盒的指揮官！';
          bodyEl.append(intro, swatchRow, note);
        },
        actions: [{ label: '理解並關閉', primary: true, autoFocus: true }],
      });
    } else {
      showToast('Donate 贊助藍圖 (Task 10C)：僅外觀塗裝／名片徽章／擊毀特效，絕無 Pay-to-Win 數值加成');
    }
  });
  lobbyCreateBtn?.addEventListener('click', () => getApp()?.selectCatalogPreview('lobby_action', 'create'));
  lobbyJoinBtn?.addEventListener('click', () => getApp()?.selectCatalogPreview('lobby_action', 'join'));
  lobbyNameInput?.addEventListener('input', () => syncSortieSummary());
  chkLobbyAiFill?.addEventListener('change', () => {
    showToast(chkLobbyAiFill.checked ? '已啟用 5 秒後自動補位 AI 機師 (Task 11)' : '已停用 AI 補位，等待真人滿房');
  });
  chkLobbyPassword?.addEventListener('change', () => {
    showToast(chkLobbyPassword.checked ? '私人密碼鎖將於 Task 11 多人房間介面輸入' : '設為公開大廳，所有測試駕駛員皆可搜尋加入');
  });
  mapPrevBtn?.addEventListener('click', () => getApp()?.cycleMap(-1));
  mapNextBtn?.addEventListener('click', () => getApp()?.cycleMap(1));
  launchSortieBtn?.addEventListener('click', () => getApp()?.startSortie());
  envDayBtn?.addEventListener('click', () => {
    getApp()?.setLightingMode('daylight');
    syncEquipmentState();
  });
  envNightBtn?.addEventListener('click', () => {
    getApp()?.setLightingMode('night');
    syncEquipmentState();
  });

  // 9-Zone Paint Studio Pickers & PBR Sliders
  for (const [channel, inp] of Object.entries(diyPickers)) {
    inp?.addEventListener('input', () => {
      applyChannelHexUpdate(channel, inp.value);
      if (channel === activePaintChannel) {
        swatchPicker?.setHex(inp.value);
      }
    });
  }
  diyMetallicSlider?.addEventListener('input', () => {
    const app = getApp();
    if (!app) return;
    const val = Number.parseFloat(diyMetallicSlider.value);
    if (diyMetallicValEl) diyMetallicValEl.textContent = val.toFixed(2);
    const zoneId = app.menuState?.activePaintZone || 'all';
    app.setZonePaint(zoneId, { metallic: val });
  });
  diyRoughnessSlider?.addEventListener('input', () => {
    const app = getApp();
    if (!app) return;
    const val = Number.parseFloat(diyRoughnessSlider.value);
    if (diyRoughnessValEl) diyRoughnessValEl.textContent = val.toFixed(2);
    const zoneId = app.menuState?.activePaintZone || 'all';
    app.setZonePaint(zoneId, { roughness: val });
  });
  paintMirrorArmsBtn?.addEventListener('click', () => {
    const app = getApp();
    if (!app) return;
    const cur = createCustomPaintState(app.customPalette);
    app.setPaintMirrorArms(!cur.mirrorArms);
    syncPaintControls();
  });
  diyApplyAllBtn?.addEventListener('click', () => {
    const app = getApp();
    if (!app) return;
    const zoneId = app.menuState?.activePaintZone || 'all';
    const cur = createCustomPaintState(app.customPalette);
    const eff = resolveEffectivePalette(app.activeSkinId, cur, zoneId);
    app.setSkin(app.activeSkinId, {
      mirrorArms: cur.mirrorArms,
      zones: {
        all: {
          primary: eff.primary,
          secondary: eff.secondary,
          frame: eff.frame,
          sensor: eff.sensor,
          thruster: eff.thruster,
          saber: eff.saber,
          finishId: eff.finishId,
          metallic: eff.metallic,
          roughness: eff.roughness,
        },
      },
    });
    syncSortieSummary();
    showToast('已將當前部位塗裝與質感套用至全身機甲');
  });
  diyResetBtn?.addEventListener('click', () => {
    const app = getApp();
    if (!app) return;
    const doReset = () => {
      app.setSkin(app.activeSkinId, null);
      syncSortieSummary();
      showToast('已清除分區自訂塗裝，恢復主題原色');
    };
    if (popManager) {
      popManager.confirm({
        title: '重置塗裝設定',
        kicker: 'PAINT RESET CONFIRM',
        message: '確定要清除當前機體的所有自訂分區塗裝與材質參數，恢復主題預設原色？',
        confirmLabel: '確認清除',
        cancelLabel: '取消',
        danger: true,
        onConfirm: doReset,
      });
    } else {
      doReset();
    }
  });

  // Pause Hub + Sub-View buttons
  document.getElementById('btn-pause-resume')?.addEventListener('click', () => getApp()?.resumeFromPause());
  document.getElementById('btn-pause-open-settings')?.addEventListener('click', () => getApp()?.setPauseView(PAUSE_VIEWS.SETTINGS));
  document.getElementById('btn-pause-open-armory')?.addEventListener('click', () => getApp()?.setPauseView(PAUSE_VIEWS.QUICK_ARMORY));
  document.getElementById('btn-pause-manual')?.addEventListener('click', () => openCombatManualModal());
  document.getElementById('btn-pause-restart')?.addEventListener('click', () => getApp()?.rematchDuel());
  document.getElementById('btn-pm-rematch')?.addEventListener('click', () => getApp()?.rematchDuel());
  document.getElementById('btn-quick-back')?.addEventListener('click', () => getApp()?.setPauseView(PAUSE_VIEWS.HUB));
  document.getElementById('btn-settings-back')?.addEventListener('click', () => getApp()?.setPauseView(PAUSE_VIEWS.HUB));

  quickEnvDayBtn?.addEventListener('click', () => {
    getApp()?.setLightingMode('daylight');
    syncEquipmentState();
  });
  quickEnvNightBtn?.addEventListener('click', () => {
    getApp()?.setLightingMode('night');
    syncEquipmentState();
  });
  quickCamBtn?.addEventListener('click', () => {
    getApp()?.toggleCameraMode();
    syncSettingsUI(settingsStore.get());
  });
  quickOrbitBtn?.addEventListener('click', () => {
    const app = getApp();
    app?.resumeFromPause();
    app?.toggleOrbitInspect();
  });

  // Audio sliders + Single-track preview buttons
  for (const [track, refs] of Object.entries(volSliders)) {
    refs.input?.addEventListener('input', (e) => {
      settingsStore.update({ audio: { [track]: parseFloat(e.target.value) } });
    });
  }
  document.querySelectorAll('[data-preview-track]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const track = btn.dataset.previewTrack || 'master';
      getApp()?.audio?.playChannelPreview?.(track);
    });
  });

  let pendingBgmImportContext = BGM_CONTEXTS.MENU;
  bgmImportMenuBtn?.addEventListener('click', () => {
    pendingBgmImportContext = BGM_CONTEXTS.MENU;
    bgmLocalFileInput?.click();
  });
  bgmImportCombatBtn?.addEventListener('click', () => {
    pendingBgmImportContext = BGM_CONTEXTS.COMBAT;
    bgmLocalFileInput?.click();
  });
  bgmLocalFileInput?.addEventListener('change', (e) => {
    const file = e.target?.files?.[0];
    if (!file) return;
    const blobUrl = URL.createObjectURL(file);
    const trackDef = {
      id: `local_${pendingBgmImportContext}_${Date.now()}`,
      context: pendingBgmImportContext,
      type: 'file',
      url: blobUrl,
      bpm: 120,
      musicalKey: 'Local File',
      label: `本機測試: ${file.name}`,
      subLabel: '即時載入外部音檔（僅當前分頁工作階段有效）',
      isCustom: true,
    };
    localBgmRegistry.registerTrack(trackDef);
    getApp()?.audio?.registerBgmTrack?.(trackDef);
    refreshBgmSelectOptions();
    const musicPatch =
      pendingBgmImportContext === BGM_CONTEXTS.MENU
        ? { menuTrack: trackDef.id }
        : { combatTrack: trackDef.id };
    settingsStore.update({ music: musicPatch });
    if (bgmLocalStatusEl) {
      bgmLocalStatusEl.textContent = `已匯入${pendingBgmImportContext === BGM_CONTEXTS.MENU ? '選單' : '戰鬥'}測試曲：${file.name}`;
    }
    showToast(`已切換為本機音檔測試：${file.name}`);
    e.target.value = '';
  });

  // Display / Controls settings inputs
  fovSlider?.addEventListener('input', (e) => {
    settingsStore.update({ controls: { baseFov: parseInt(e.target.value, 10) } });
  });
  shakeSlider?.addEventListener('input', (e) => {
    settingsStore.update({ graphics: { cameraShakeScale: parseFloat(e.target.value) } });
  });
  chkShowControlsHelp?.addEventListener('change', (e) => {
    settingsStore.update({ graphics: { showControlsHelp: e.target.checked } });
  });
  chkSaberGuideSandbox?.addEventListener('change', (e) => {
    settingsStore.update({ graphics: { saberGuideMode: e.target.checked ? 'sandbox_only' : 'off' } });
  });
  chkInvertMouse?.addEventListener('change', (e) => {
    settingsStore.update({ controls: { invertMouseButtons: e.target.checked } });
  });
  chkInvertY?.addEventListener('change', (e) => {
    settingsStore.update({ controls: { invertLookY: e.target.checked } });
  });
  sensSlider?.addEventListener('input', (e) => {
    settingsStore.update({ controls: { mouseSensitivity: parseFloat(e.target.value) } });
  });

  resetSettingsBtn?.addEventListener('click', () => {
    const doReset = () => {
      getApp()?.clearPendingRebind();
      settingsStore.reset();
      setRebindHint('點擊任一功能按鈕後按下新按鍵（ESC 取消）', false);
      showToast('已恢復預設系統設定');
    };
    if (popManager) {
      popManager.confirm({
        title: '恢復預設設定',
        kicker: 'SETTINGS RESET CONFIRM',
        message: '確定要將所有畫面、音效、操作靈敏度與 14 組自訂按鍵恢復為原廠預設值？',
        confirmLabel: '確認恢復',
        cancelLabel: '取消',
        danger: true,
        onConfirm: doReset,
      });
    } else {
      doReset();
    }
  });

  // Initial mount: bind tactical tooltips across all static and dynamic elements
  bindAllTooltips(document);

  return {
    syncMenuState,
    syncSettingsUI,
    syncEquipmentState,
    syncArmoryPinsOverlay,
    openCombatManualModal,
    onSkinChanged: () => {
      syncEquipmentState();
    },
    onRebindStatus: (info) => {
      const actMeta = KEYBIND_ACTIONS.find((a) => a.id === info?.action);
      const actLabel = actMeta?.label || info?.action || '';
      if (info?.waiting) {
        setRebindHint(`請按下「${actLabel}」的新按鍵...（按 ESC 取消）`, true);
      } else if (info?.canceled) {
        setRebindHint(`已取消「${actLabel}」按鍵變更`, false);
      } else if (info?.rejected) {
        setRebindHint('按鍵無效或為保留鍵（ESC），請重新選擇', true);
      } else if (info?.completed) {
        const keyTxt = formatKeyCodeLabel(info.settings?.keybindings?.[info.action]);
        const msg = info.res?.swappedWith
          ? `已將「${actLabel}」設為 ${keyTxt}（與衝突鍵位自動互換）`
          : `已將「${actLabel}」設為 ${keyTxt}`;
        setRebindHint(msg, false);
        showToast(msg);
      }
      syncSettingsUI(info?.settings || settingsStore.get());
    },
    onCameraChanged: (mode) => {
      const camKey = formatKeyCodeLabel(settingsStore.get().keybindings.cameraMode);
      if (quickCamBtn) {
        const lbl = quickCamBtn.querySelector('span:last-child') || quickCamBtn;
        lbl.textContent = mode === CAMERA_MODES.TPS ? `切換 FPS 360° 座艙 (${camKey})` : `切換 TPS 第三人稱 (${camKey})`;
      }
      showToast(mode === CAMERA_MODES.FPS_COCKPIT ? '進入第一人稱 360° 全景座艙' : '切換至第三人稱過肩視角');
    },
    showCombatCallout: (label, kind, durationSec) => hudOverlay.showCombatCallout(label, kind, durationSec),
    onTickHud: (t) => {
      hudOverlay.stepCallout(t?.dt ?? 0.016);
      hudOverlay.onTickHud(t);
    },
  };
}
