/**
 * Reusable Dark Obsidian Tactical Dropdown (`TacticalSelect`) Component (Layer 1 Client).
 * - Replaces harsh white native <select> popups with glass HUD dropdowns supporting SVG icons,
 *   cost/lock badges, keyboard navigation, and ESC priority-dismiss before menu navigation.
 */

import { renderUiIconSvg } from '../shared/blueprint_svg.js?v=20261116_t75e';

const openControllers = new Set();

export function isAnyTacticalSelectOpen() {
  for (const ctrl of openControllers) {
    if (ctrl.isOpen()) return true;
  }
  return false;
}

export function closeAllTacticalSelects(exceptCtrl = null) {
  let closedAny = false;
  for (const ctrl of openControllers) {
    if (ctrl !== exceptCtrl && ctrl.isOpen()) {
      ctrl.close();
      closedAny = true;
    }
  }
  return closedAny;
}

if (typeof document !== 'undefined') {
  document.addEventListener('pointerdown', (e) => {
    for (const ctrl of openControllers) {
      if (ctrl.isOpen() && !ctrl.root.contains(e.target)) {
        ctrl.close();
      }
    }
  });
}

function mountInlineSvg(target, svgText) {
  target.replaceChildren();
  if (!svgText || typeof DOMParser === 'undefined') return;
  const doc = new DOMParser().parseFromString(svgText, 'image/svg+xml');
  const el = doc?.documentElement;
  if (el && el.nodeName.toLowerCase() === 'svg') {
    const owner = target.ownerDocument || (typeof document !== 'undefined' ? document : null);
    if (owner?.importNode) {
      target.appendChild(owner.importNode(el, true));
    } else {
      target.appendChild(el);
    }
  }
}

/**
 * Create a styled tactical dropdown inside `hostEl`.
 * Options format: `{ value, label, subLabel?, iconSvg?, badgeText?, badgeClass?, locked? }`
 */
export function createTacticalSelect(hostEl, { ariaLabel = 'Select option', onChange, onUiFeedback = null } = {}) {
  if (!hostEl) return null;

  const root = document.createElement('div');
  root.className = 'tselect';

  const trigger = document.createElement('button');
  trigger.type = 'button';
  trigger.className = 'tselect-trigger';
  trigger.setAttribute('aria-haspopup', 'listbox');
  trigger.setAttribute('aria-expanded', 'false');
  trigger.setAttribute('aria-label', ariaLabel);

  const leftWrap = document.createElement('span');
  leftWrap.className = 'tselect-left';
  const trigIcon = document.createElement('span');
  trigIcon.className = 'tselect-icon';
  const trigTextCol = document.createElement('span');
  trigTextCol.className = 'tselect-text-col';
  const trigLabel = document.createElement('span');
  trigLabel.className = 'tselect-label';
  const trigSub = document.createElement('span');
  trigSub.className = 'tselect-sub';
  trigTextCol.append(trigLabel, trigSub);
  leftWrap.append(trigIcon, trigTextCol);

  const rightWrap = document.createElement('span');
  rightWrap.className = 'tselect-right';
  const trigBadge = document.createElement('span');
  trigBadge.className = 'badge-pill';
  const chevron = document.createElement('span');
  chevron.className = 'tselect-chevron';
  mountInlineSvg(chevron, renderUiIconSvg('chevron_down', { size: 13 }));
  rightWrap.append(trigBadge, chevron);

  trigger.append(leftWrap, rightWrap);

  const menu = document.createElement('div');
  menu.className = 'tselect-menu';
  menu.setAttribute('role', 'listbox');
  menu.hidden = true;

  root.append(trigger, menu);
  hostEl.replaceChildren(root);

  let items = [];
  let currentValue = null;

  const syncTriggerDisplay = () => {
    const activeItem = items.find((it) => it.value === currentValue) || items[0] || null;
    if (!activeItem) {
      trigLabel.textContent = '—';
      trigSub.textContent = '';
      trigBadge.hidden = true;
      trigIcon.replaceChildren();
      return;
    }
    trigLabel.textContent = activeItem.label || String(activeItem.value);
    trigSub.textContent = activeItem.subLabel || '';
    trigSub.hidden = !activeItem.subLabel;
    if (activeItem.iconSvg) {
      trigIcon.hidden = false;
      mountInlineSvg(trigIcon, activeItem.iconSvg);
    } else {
      trigIcon.hidden = true;
      trigIcon.replaceChildren();
    }
    if (activeItem.badgeText) {
      trigBadge.hidden = false;
      trigBadge.className = `badge-pill ${activeItem.badgeClass || 'badge-active'}`;
      trigBadge.textContent = activeItem.badgeText;
    } else {
      trigBadge.hidden = true;
    }
    trigger.classList.toggle('is-locked', Boolean(activeItem.locked));
    menu.querySelectorAll('.tselect-option').forEach((optEl) => {
      const sel = optEl.dataset.val === String(currentValue);
      optEl.classList.toggle('selected', sel);
      optEl.setAttribute('aria-selected', sel ? 'true' : 'false');
    });
  };

  const renderOptions = (nextItems) => {
    items = Array.isArray(nextItems) ? nextItems : [];
    menu.replaceChildren();
    items.forEach((it) => {
      const opt = document.createElement('button');
      opt.type = 'button';
      opt.className = `tselect-option${it.locked ? ' is-locked' : ''}`;
      opt.setAttribute('role', 'option');
      opt.dataset.val = String(it.value);

      const optLeft = document.createElement('span');
      optLeft.className = 'tselect-left';
      if (it.iconSvg) {
        const ic = document.createElement('span');
        ic.className = 'tselect-icon';
        mountInlineSvg(ic, it.iconSvg);
        optLeft.appendChild(ic);
      }
      const txtCol = document.createElement('span');
      txtCol.className = 'tselect-text-col';
      const lbl = document.createElement('span');
      lbl.className = 'tselect-label';
      lbl.textContent = it.label || String(it.value);
      txtCol.appendChild(lbl);
      if (it.subLabel) {
        const sub = document.createElement('span');
        sub.className = 'tselect-sub';
        sub.textContent = it.subLabel;
        txtCol.appendChild(sub);
      }
      optLeft.appendChild(txtCol);

      opt.appendChild(optLeft);
      if (it.badgeText) {
        const bd = document.createElement('span');
        bd.className = `badge-pill ${it.badgeClass || 'badge-active'}`;
        bd.textContent = it.badgeText;
        opt.appendChild(bd);
      }

      opt.addEventListener('click', () => {
        currentValue = it.value;
        syncTriggerDisplay();
        ctrl.close();
        onUiFeedback?.('confirm');
        onChange?.(it.value, it);
      });
      menu.appendChild(opt);
    });
    syncTriggerDisplay();
  };

  const ctrl = {
    root,
    isOpen: () => !menu.hidden,
    open: () => {
      closeAllTacticalSelects(ctrl);
      menu.hidden = false;
      root.classList.add('open');
      trigger.setAttribute('aria-expanded', 'true');
    },
    close: () => {
      menu.hidden = true;
      root.classList.remove('open');
      trigger.setAttribute('aria-expanded', 'false');
    },
    setOptions: (nextItems, nextValue = currentValue) => {
      currentValue = nextValue;
      renderOptions(nextItems);
    },
    setValue: (nextValue) => {
      currentValue = nextValue;
      syncTriggerDisplay();
    },
    getValue: () => currentValue,
  };

  trigger.addEventListener('click', (e) => {
    e.stopPropagation();
    if (ctrl.isOpen()) {
      ctrl.close();
      onUiFeedback?.('tick');
    } else {
      ctrl.open();
      onUiFeedback?.('tick');
    }
  });

  root.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && ctrl.isOpen()) {
      e.preventDefault();
      e.stopPropagation();
      ctrl.close();
      onUiFeedback?.('cancel');
      trigger.focus();
      return;
    }
    if ((e.key === 'ArrowDown' || e.key === 'ArrowUp') && items.length > 0) {
      e.preventDefault();
      if (!ctrl.isOpen()) {
        ctrl.open();
        onUiFeedback?.('tick');
        return;
      }
      const idx = Math.max(0, items.findIndex((it) => it.value === currentValue));
      const delta = e.key === 'ArrowDown' ? 1 : -1;
      const next = items[(idx + delta + items.length) % items.length];
      if (next) {
        currentValue = next.value;
        syncTriggerDisplay();
        onUiFeedback?.('tick');
        onChange?.(next.value, next);
      }
    }
  });

  openControllers.add(ctrl);
  return ctrl;
}
