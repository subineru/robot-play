/**
 * Tactical Diegetic Game Controls (`tactical_controls.js`, Layer 1 Client).
 * Replaces browser-default range sliders, checkboxes, and <input type="color"> widgets
 * with notched energy bars, dual-detent mechanical switches, and military paint swatch bays,
 * while keeping underlying native <input> elements synchronized for clean SSOT store compatibility.
 */

import {
  MILITARY_PAINT_SWATCHES,
  hexToHsl,
  hslToHex,
} from '../shared/skins.js?v=20261116_t75e';

function roundToStepPrecision(val, step) {
  const stepStr = String(step || 1);
  const dotIdx = stepStr.indexOf('.');
  const decimals = dotIdx >= 0 ? Math.min(6, stepStr.length - dotIdx - 1) : 0;
  const factor = Math.pow(10, decimals);
  return Math.round(val * factor) / factor;
}

/**
 * Pure math: quantize a numeric slider value into discrete visual notch states.
 */
export function computeSliderSegments({ value, min = 0, max = 1, step = 0.05, segments = 20 } = {}) {
  const lo = Number.isFinite(Number(min)) ? Number(min) : 0;
  const hi = Number.isFinite(Number(max)) && Number(max) > lo ? Number(max) : lo + 1;
  const stp = Number.isFinite(Number(step)) && Number(step) > 0 ? Number(step) : 0.01;
  const segCount = Math.max(4, Math.min(40, Math.round(Number(segments) || 20)));

  const raw = Number.isFinite(Number(value)) ? Number(value) : lo;
  const clamped = Math.min(hi, Math.max(lo, raw));
  const stepped = Math.min(hi, Math.max(lo, roundToStepPrecision(lo + Math.round((clamped - lo) / stp) * stp, stp)));
  const ratio = Math.min(1, Math.max(0, (stepped - lo) / (hi - lo)));
  const activeCount = Math.round(ratio * segCount);

  return {
    ratio,
    activeCount,
    steppedValue: stepped,
    segments: segCount,
  };
}

/**
 * Pure math: map a normalized 0..1 pointer ratio onto a clamped stepped slider value.
 */
export function mapPointerRatioToValue({ ratio = 0, min = 0, max = 1, step = 0.05 } = {}) {
  const lo = Number.isFinite(Number(min)) ? Number(min) : 0;
  const hi = Number.isFinite(Number(max)) && Number(max) > lo ? Number(max) : lo + 1;
  const stp = Number.isFinite(Number(step)) && Number(step) > 0 ? Number(step) : 0.01;
  const clampedRatio = Math.min(1, Math.max(0, Number(ratio) || 0));
  const raw = lo + clampedRatio * (hi - lo);
  const snapped = lo + Math.round((raw - lo) / stp) * stp;
  return Math.min(hi, Math.max(lo, roundToStepPrecision(snapped, stp)));
}

/**
 * Upgrade a native <input type="range"> into a notched 20-segment tactical energy bar
 * while preserving the native input's ID, .value, and 'input'/'change' events.
 */
export function upgradeTacticalSlider(inputEl, { segments = 20, onTick } = {}) {
  if (!inputEl || typeof document === 'undefined') return null;
  if (inputEl._tacticalCtrl) {
    inputEl._tacticalCtrl.sync();
    return inputEl._tacticalCtrl;
  }

  const segCount = Math.max(8, Math.min(32, Math.round(Number(segments) || 20)));
  const getBounds = () => ({
    min: Number.isFinite(parseFloat(inputEl.min)) ? parseFloat(inputEl.min) : 0,
    max: Number.isFinite(parseFloat(inputEl.max)) ? parseFloat(inputEl.max) : 1,
    step: Number.isFinite(parseFloat(inputEl.step)) && parseFloat(inputEl.step) > 0 ? parseFloat(inputEl.step) : 0.01,
  });

  inputEl.classList.add('sr-native-control');
  inputEl.tabIndex = -1;

  const track = document.createElement('div');
  track.className = 'tslider';
  track.setAttribute('role', 'slider');
  track.tabIndex = inputEl.disabled ? -1 : 0;

  const barsWrap = document.createElement('div');
  barsWrap.className = 'tslider-bars';
  const barEls = [];
  for (let i = 0; i < segCount; i++) {
    const bar = document.createElement('span');
    bar.className = 'tslider-seg';
    barEls.push(bar);
    barsWrap.appendChild(bar);
  }
  track.appendChild(barsWrap);
  inputEl.insertAdjacentElement('afterend', track);

  let lastActiveCount = -1;
  const sync = () => {
    const { min, max, step } = getBounds();
    const state = computeSliderSegments({
      value: parseFloat(inputEl.value),
      min,
      max,
      step,
      segments: segCount,
    });
    track.classList.toggle('is-disabled', Boolean(inputEl.disabled));
    track.setAttribute('aria-valuemin', String(min));
    track.setAttribute('aria-valuemax', String(max));
    track.setAttribute('aria-valuenow', String(state.steppedValue));
    track.tabIndex = inputEl.disabled ? -1 : 0;
    for (let i = 0; i < barEls.length; i++) {
      barEls[i].classList.toggle('active', i < state.activeCount);
    }
    lastActiveCount = state.activeCount;
  };

  const commitValue = (nextVal, fireChange = false) => {
    if (inputEl.disabled) return;
    const { min, max, step } = getBounds();
    const nextState = computeSliderSegments({ value: nextVal, min, max, step, segments: segCount });
    const prevCount = lastActiveCount;
    if (String(inputEl.value) !== String(nextState.steppedValue)) {
      inputEl.value = String(nextState.steppedValue);
      inputEl.dispatchEvent(new Event('input', { bubbles: true }));
    }
    if (fireChange) {
      inputEl.dispatchEvent(new Event('change', { bubbles: true }));
    }
    sync();
    if (nextState.activeCount !== prevCount) {
      onTick?.('tick');
    }
  };

  const applyClientX = (clientX, fireChange = false) => {
    const rect = barsWrap.getBoundingClientRect();
    if (!rect || rect.width <= 0) return;
    const ratio = (clientX - rect.left) / rect.width;
    const { min, max, step } = getBounds();
    const mapped = mapPointerRatioToValue({ ratio, min, max, step });
    commitValue(mapped, fireChange);
  };

  let dragging = false;
  track.addEventListener('pointerdown', (e) => {
    if (inputEl.disabled || e.button !== 0) return;
    e.preventDefault();
    dragging = true;
    track.classList.add('is-dragging');
    track.setPointerCapture?.(e.pointerId);
    applyClientX(e.clientX, false);
  });
  track.addEventListener('pointermove', (e) => {
    if (!dragging || inputEl.disabled) return;
    applyClientX(e.clientX, false);
  });
  const endDrag = (e) => {
    if (!dragging) return;
    dragging = false;
    track.classList.remove('is-dragging');
    if (typeof e?.clientX === 'number') {
      applyClientX(e.clientX, true);
    }
  };
  track.addEventListener('pointerup', endDrag);
  track.addEventListener('pointercancel', endDrag);

  track.addEventListener('keydown', (e) => {
    if (inputEl.disabled) return;
    const { min, max, step } = getBounds();
    const cur = parseFloat(inputEl.value);
    const curVal = Number.isFinite(cur) ? cur : min;
    if (e.key === 'ArrowRight' || e.key === 'ArrowUp') {
      e.preventDefault();
      commitValue(curVal + step, true);
    } else if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') {
      e.preventDefault();
      commitValue(curVal - step, true);
    } else if (e.key === 'Home') {
      e.preventDefault();
      commitValue(min, true);
    } else if (e.key === 'End') {
      e.preventDefault();
      commitValue(max, true);
    }
  });

  inputEl.addEventListener('input', sync);
  inputEl.addEventListener('change', sync);

  sync();

  const ctrl = {
    el: track,
    sync,
    setDisabled(disabled) {
      inputEl.disabled = Boolean(disabled);
      sync();
    },
  };
  inputEl._tacticalCtrl = ctrl;
  return ctrl;
}

/**
 * Upgrade a native <input type="checkbox"> into a dual-detent mechanical [ OFF | ON ] switch.
 */
export function upgradeTacticalSwitch(checkboxEl, { onLabel = 'ON', offLabel = 'OFF', onToggle } = {}) {
  if (!checkboxEl || typeof document === 'undefined') return null;
  if (checkboxEl._tacticalCtrl) {
    checkboxEl._tacticalCtrl.sync();
    return checkboxEl._tacticalCtrl;
  }

  checkboxEl.classList.add('sr-native-control');
  checkboxEl.tabIndex = -1;

  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'tswitch';
  btn.setAttribute('role', 'switch');

  const offSpan = document.createElement('span');
  offSpan.className = 'tswitch-opt is-off';
  offSpan.textContent = offLabel;

  const ledSpan = document.createElement('span');
  ledSpan.className = 'tswitch-led';

  const onSpan = document.createElement('span');
  onSpan.className = 'tswitch-opt is-on';
  onSpan.textContent = onLabel;

  btn.append(offSpan, ledSpan, onSpan);
  checkboxEl.insertAdjacentElement('afterend', btn);

  const sync = () => {
    const checked = Boolean(checkboxEl.checked);
    const disabled = Boolean(checkboxEl.disabled);
    btn.classList.toggle('is-on', checked);
    btn.classList.toggle('is-disabled', disabled);
    btn.disabled = disabled;
    btn.setAttribute('aria-checked', checked ? 'true' : 'false');
  };

  btn.addEventListener('click', (e) => {
    e.preventDefault();
    if (checkboxEl.disabled) return;
    checkboxEl.checked = !checkboxEl.checked;
    sync();
    checkboxEl.dispatchEvent(new Event('change', { bubbles: true }));
    onToggle?.(checkboxEl.checked ? 'confirm' : 'cancel', checkboxEl.checked);
  });

  checkboxEl.addEventListener('change', sync);
  sync();

  const ctrl = {
    el: btn,
    sync,
    setDisabled(disabled) {
      checkboxEl.disabled = Boolean(disabled);
      sync();
    },
  };
  checkboxEl._tacticalCtrl = ctrl;
  return ctrl;
}

/**
 * Create a military paint swatch matrix + expandable custom HSL slider bay.
 */
export function createTacticalSwatchPicker(
  hostEl,
  { swatches = MILITARY_PAINT_SWATCHES, initialHex = '#D8E0EA', onPickHex, onTick } = {},
) {
  if (!hostEl || typeof document === 'undefined') return null;

  let activeHex = String(initialHex || '#D8E0EA').toUpperCase();
  let customOpen = false;
  let silentHslSync = false;

  const root = document.createElement('div');
  root.className = 'tswatch-bay';

  const head = document.createElement('div');
  head.className = 'tswatch-head';

  const headLeft = document.createElement('div');
  headLeft.className = 'tswatch-head-left';
  const activeChip = document.createElement('span');
  activeChip.className = 'tswatch-active-chip';
  const chanLabel = document.createElement('span');
  chanLabel.className = 'tswatch-channel-lbl';
  chanLabel.textContent = 'CHANNEL // PRIMARY';
  const hexReadout = document.createElement('span');
  hexReadout.className = 'diy-hex-badge';
  hexReadout.textContent = activeHex;
  headLeft.append(activeChip, chanLabel, hexReadout);

  const customToggleBtn = document.createElement('button');
  customToggleBtn.type = 'button';
  customToggleBtn.className = 'ui-btn compact tswatch-custom-btn';
  customToggleBtn.textContent = 'CUSTOM HSL';

  head.append(headLeft, customToggleBtn);

  const grid = document.createElement('div');
  grid.className = 'tswatch-grid';

  const swatchButtons = [];
  for (const sw of swatches) {
    const tile = document.createElement('button');
    tile.type = 'button';
    tile.className = 'tswatch-tile';
    tile.dataset.swatchHex = sw.hex.toUpperCase();
    tile.setAttribute('data-tactical-title', `${sw.name} (${sw.hex.toUpperCase()})`);
    const fill = document.createElement('span');
    fill.className = 'tswatch-tile-fill';
    fill.style.background = sw.hex;
    tile.appendChild(fill);
    tile.addEventListener('click', () => {
      setHex(sw.hex, true);
      onTick?.('confirm');
    });
    swatchButtons.push(tile);
    grid.appendChild(tile);
  }

  const drawer = document.createElement('div');
  drawer.className = 'tswatch-hsl-drawer';
  drawer.hidden = true;

  const makeHslSlider = (labelText, min, max, step) => {
    const row = document.createElement('label');
    row.className = 'slider-row tswatch-hsl-row';
    const lbl = document.createElement('span');
    lbl.textContent = labelText;
    const inp = document.createElement('input');
    inp.type = 'range';
    inp.min = String(min);
    inp.max = String(max);
    inp.step = String(step);
    const val = document.createElement('span');
    val.className = 'slider-val';
    row.append(lbl, inp, val);
    drawer.appendChild(row);
    const ctrl = upgradeTacticalSlider(inp, { segments: 18, onTick });
    return { inp, val, ctrl };
  };

  const hRow = makeHslSlider('色相 H', 0, 360, 2);
  const sRow = makeHslSlider('彩度 S', 0, 100, 2);
  const lRow = makeHslSlider('明度 L', 8, 92, 2);

  const syncVisual = () => {
    activeChip.style.background = activeHex;
    hexReadout.textContent = activeHex;
    for (const btn of swatchButtons) {
      btn.classList.toggle('active', btn.dataset.swatchHex === activeHex);
    }
    const hsl = hexToHsl(activeHex);
    silentHslSync = true;
    hRow.inp.value = String(hsl.h);
    sRow.inp.value = String(hsl.s);
    lRow.inp.value = String(Math.min(92, Math.max(8, hsl.l)));
    hRow.val.textContent = `${hsl.h}deg`;
    sRow.val.textContent = `${hsl.s}%`;
    lRow.val.textContent = `${hsl.l}%`;
    hRow.ctrl?.sync();
    sRow.ctrl?.sync();
    lRow.ctrl?.sync();
    silentHslSync = false;
  };

  const setHex = (hex, notify = false) => {
    const norm = typeof hex === 'string' && /^#[0-9A-Fa-f]{6}$/.test(hex.trim()) ? hex.trim().toUpperCase() : '#D8E0EA';
    activeHex = norm;
    syncVisual();
    if (notify) onPickHex?.(activeHex);
  };

  const handleHslChange = () => {
    if (silentHslSync) return;
    const h = parseFloat(hRow.inp.value);
    const s = parseFloat(sRow.inp.value);
    const l = parseFloat(lRow.inp.value);
    hRow.val.textContent = `${Math.round(h)}deg`;
    sRow.val.textContent = `${Math.round(s)}%`;
    lRow.val.textContent = `${Math.round(l)}%`;
    activeHex = hslToHex(h, s, l);
    activeChip.style.background = activeHex;
    hexReadout.textContent = activeHex;
    for (const btn of swatchButtons) {
      btn.classList.toggle('active', btn.dataset.swatchHex === activeHex);
    }
    onPickHex?.(activeHex);
  };

  hRow.inp.addEventListener('input', handleHslChange);
  sRow.inp.addEventListener('input', handleHslChange);
  lRow.inp.addEventListener('input', handleHslChange);

  customToggleBtn.addEventListener('click', () => {
    customOpen = !customOpen;
    drawer.hidden = !customOpen;
    customToggleBtn.classList.toggle('active', customOpen);
    onTick?.(customOpen ? 'confirm' : 'cancel');
  });

  root.append(head, grid, drawer);
  hostEl.replaceChildren(root);
  syncVisual();

  return {
    el: root,
    setHex(hex) {
      setHex(hex, false);
    },
    setChannelLabel(label) {
      chanLabel.textContent = String(label || 'CHANNEL');
    },
  };
}
