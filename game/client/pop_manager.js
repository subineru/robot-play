/**
 * Layered Top-Layer Pop Windows & Notification Overlay Manager (`pop_manager.js`).
 * Consumed by menu_controller.js and renderer.js to manage:
 * - Native HTML5 <dialog id="tactical-modal-overlay"> Top-Layer modals with 5-tier ESC arbitration
 * - Slide-in military tactical comms banner (#comms-pop-banner)
 * - Stacked toast notifications (#toast-queue, capped at 3 pills, plus legacy #toast support)
 * - Viewport-bounded tactical tooltip (#tactical-tooltip)
 */

import { renderUiIconSvg, renderPilotPortraitSvg } from '../shared/blueprint_svg.js?v=20261116_t75e';

function getDoc() {
  return typeof document !== 'undefined' ? document : null;
}

function parseSvgElement(svgText, doc) {
  if (!svgText || typeof DOMParser === 'undefined') return null;
  const owner = doc || getDoc();
  try {
    const parsed = new DOMParser().parseFromString(svgText, 'image/svg+xml');
    const el = parsed?.documentElement;
    if (el && el.nodeName.toLowerCase() === 'svg') {
      return owner?.importNode ? owner.importNode(el, true) : el;
    }
  } catch (_) {}
  return null;
}

function inferToastKind(msg, explicitKind = 'info') {
  if (explicitKind && explicitKind !== 'info') return explicitKind;
  if (typeof msg !== 'string') return 'info';
  if (msg.includes('[CRITICAL]') || msg.includes('[DISMEMBER]') || msg.includes('[ACS')) {
    return 'danger';
  }
  if (msg.includes('[OVERHEAT]') || msg.includes('[GUARD BREAK]') || msg.includes('警告') || msg.includes('WARNING')) {
    return 'warn';
  }
  return 'info';
}

export function createPopManager({ onUiFeedback, onRequestEscapeClose } = {}) {
  let modalSessionId = 0;
  let closeTimer = null;
  let commsTimer = null;
  let commsHideTimer = null;
  let pendingConfirmResolve = null;

  const doc = getDoc();
  const getDialog = () => doc?.getElementById('tactical-modal-overlay') || null;
  const getModalBox = (d) => doc?.getElementById('tactical-modal-box') || d?.querySelector?.('.tactical-modal-box') || d;

  function ensureDialogListeners(d) {
    if (!d) return;
    d._popCancelHandler = (e) => {
      e.preventDefault();
      if (!isModalOpen()) return;
      if (typeof onRequestEscapeClose === 'function') {
        onRequestEscapeClose();
      } else {
        closeModal();
      }
    };
    d._popClickHandler = (e) => {
      if (e.target === d) {
        if (!isModalOpen()) return;
        if (typeof onRequestEscapeClose === 'function') {
          onRequestEscapeClose();
        } else {
          closeModal();
        }
      }
    };

    if (!d._popListenersAttached) {
      d._popListenersAttached = true;
      d.addEventListener('cancel', (e) => d._popCancelHandler?.(e));
      d.addEventListener('click', (e) => d._popClickHandler?.(e));
    }
  }

  // Pre-bind if dialog already present in DOM
  const initialDialog = getDialog();
  if (initialDialog) {
    ensureDialogListeners(initialDialog);
  }

  function isModalOpen() {
    const d = getDialog();
    return Boolean(d && d.open && d.dataset?.open === 'true');
  }

  function closeModal() {
    const d = getDialog();
    if (pendingConfirmResolve) {
      pendingConfirmResolve(false);
      pendingConfirmResolve = null;
    }
    if (!d) return;

    d.dataset.open = 'false';
    const currentSession = ++modalSessionId;
    if (closeTimer) clearTimeout(closeTimer);

    closeTimer = setTimeout(() => {
      if (modalSessionId === currentSession && d.dataset?.open === 'false' && d.open) {
        try {
          d.close();
        } catch (_) {
          d.open = false;
        }
      }
    }, 140);
  }

  function showModal({ title = '', kicker = '', iconKind = null, bodyBuilder = null, actions = [] } = {}) {
    const currentDoc = getDoc();
    if (!currentDoc) return null;
    const d = getDialog();
    if (!d) return null;

    ensureDialogListeners(d);
    if (closeTimer) {
      clearTimeout(closeTimer);
      closeTimer = null;
    }
    const currentSession = ++modalSessionId;

    const box = getModalBox(d);
    let firstBtn = null;
    let autoFocusBtn = null;

    if (box) {
      box.replaceChildren();

      // Header
      const header = currentDoc.createElement('div');
      header.className = 'tactical-modal-header';

      const titleWrap = currentDoc.createElement('div');
      titleWrap.className = 'tactical-modal-title';
      if (iconKind) {
        const iconSvg = renderUiIconSvg(iconKind, { size: 18 });
        const iconEl = parseSvgElement(iconSvg, currentDoc);
        if (iconEl) titleWrap.appendChild(iconEl);
      }
      const titleSpan = currentDoc.createElement('span');
      titleSpan.textContent = String(title || '');
      titleWrap.appendChild(titleSpan);
      header.appendChild(titleWrap);

      if (kicker) {
        const kickerEl = currentDoc.createElement('span');
        kickerEl.className = 'tactical-modal-kicker';
        kickerEl.textContent = String(kicker);
        header.appendChild(kickerEl);
      }

      // Body
      const body = currentDoc.createElement('div');
      body.className = 'tactical-modal-body';
      if (typeof bodyBuilder === 'function') {
        bodyBuilder(body);
      } else if (typeof bodyBuilder === 'string') {
        const p = currentDoc.createElement('p');
        p.textContent = bodyBuilder;
        body.appendChild(p);
      } else if (bodyBuilder && typeof bodyBuilder === 'object' && bodyBuilder.nodeType) {
        body.appendChild(bodyBuilder);
      }

      // Actions
      const actionsWrap = currentDoc.createElement('div');
      actionsWrap.className = 'tactical-modal-actions';

      if (Array.isArray(actions) && actions.length > 0) {
        actions.forEach((act) => {
          if (!act) return;
          const btn = currentDoc.createElement('button');
          btn.type = 'button';

          let cls = 'ui-btn';
          if (act.danger) cls += ' danger';
          else if (act.primary) cls += ' primary';
          if (act.compact) cls += ' compact';
          if (act.className) cls += ` ${act.className}`;
          btn.className = cls;

          if (act.iconKind) {
            const actIconSvg = renderUiIconSvg(act.iconKind, { size: 14 });
            const actIconEl = parseSvgElement(actIconSvg, currentDoc);
            if (actIconEl) btn.appendChild(actIconEl);
          }

          const lbl = currentDoc.createElement('span');
          lbl.textContent = String(act.label || 'OK');
          btn.appendChild(lbl);

          btn.addEventListener('click', (e) => {
            let shouldClose = true;
            if (typeof act.onClick === 'function') {
              const res = act.onClick(e);
              if (res === false) shouldClose = false;
            }
            if (shouldClose && !act.preventClose) {
              closeModal();
            }
          });

          actionsWrap.appendChild(btn);
          if (!firstBtn) firstBtn = btn;
          if (act.autoFocus) {
            btn.autofocus = true;
            autoFocusBtn = btn;
          }
        });
      }

      box.append(header, body, actionsWrap);
    }

    if (!d.open) {
      if (typeof d.showModal === 'function') {
        try {
          d.showModal();
        } catch (_) {
          d.open = true;
        }
      } else {
        d.open = true;
      }
    }
    d.dataset.open = 'true';

    const focusTarget = autoFocusBtn || firstBtn;
    if (focusTarget && typeof focusTarget.focus === 'function') {
      try {
        focusTarget.focus();
      } catch (_) {}
    }

    try {
      onUiFeedback?.('confirm');
    } catch (_) {}

    return { dialog: d, modalBox: box, sessionId: currentSession };
  }

  function confirm({
    title = '確認操作',
    kicker = 'TACTICAL CONFIRM',
    iconKind = null,
    message = '',
    confirmLabel = '確認',
    cancelLabel = '取消',
    danger = true,
    onConfirm = null,
  } = {}) {
    return new Promise((resolve) => {
      pendingConfirmResolve = resolve;
      showModal({
        title,
        kicker,
        iconKind: iconKind || (danger ? 'warning' : 'sortie'),
        bodyBuilder: (bodyEl) => {
          const currentDoc = getDoc();
          if (currentDoc) {
            const p = currentDoc.createElement('p');
            p.textContent = String(message || '');
            bodyEl.appendChild(p);
          }
        },
        actions: [
          {
            label: cancelLabel,
            primary: false,
            danger: false,
            onClick: () => {
              if (pendingConfirmResolve) {
                pendingConfirmResolve(false);
                pendingConfirmResolve = null;
              }
            },
          },
          {
            label: confirmLabel,
            primary: !danger,
            danger: Boolean(danger),
            autoFocus: true,
            onClick: () => {
              try {
                onConfirm?.();
              } finally {
                if (pendingConfirmResolve) {
                  pendingConfirmResolve(true);
                  pendingConfirmResolve = null;
                }
              }
            },
          },
        ],
      });
    });
  }

  function showCommsBanner({ pilot = {}, text = '', durationSec = 3.2 } = {}) {
    const currentDoc = getDoc();
    if (!currentDoc) return;
    const banner = currentDoc.getElementById('comms-pop-banner');
    if (!banner) return;

    if (commsTimer) clearTimeout(commsTimer);
    if (commsHideTimer) clearTimeout(commsHideTimer);

    banner.replaceChildren();

    const portraitEl = currentDoc.createElement('div');
    portraitEl.className = 'comms-portrait';
    const portraitSvg = renderPilotPortraitSvg(pilot);
    const parsedSvg = parseSvgElement(portraitSvg, currentDoc);
    if (parsedSvg) portraitEl.appendChild(parsedSvg);

    const contentEl = currentDoc.createElement('div');
    contentEl.className = 'comms-content';

    const headEl = currentDoc.createElement('div');
    headEl.className = 'comms-head';

    const callsignEl = currentDoc.createElement('span');
    callsignEl.className = 'comms-callsign';
    callsignEl.textContent = pilot?.callsign || pilot?.name || 'RADIO // TACTICAL COMMS';

    const waveEl = currentDoc.createElement('div');
    waveEl.className = 'comms-wave';
    for (let i = 0; i < 4; i++) {
      const bar = currentDoc.createElement('span');
      bar.className = 'comms-wave-bar';
      bar.style.animationDelay = `${(i * 0.18).toFixed(2)}s`;
      waveEl.appendChild(bar);
    }

    headEl.append(callsignEl, waveEl);

    const textEl = currentDoc.createElement('div');
    textEl.className = 'comms-text';
    textEl.textContent = String(text ?? '');

    contentEl.append(headEl, textEl);
    banner.append(portraitEl, contentEl);

    banner.style.opacity = '';
    banner.style.transform = '';
    banner.hidden = false;

    const ms = Math.max(800, (Number(durationSec) || 3.2) * 1000);
    commsTimer = setTimeout(() => {
      banner.style.opacity = '0';
      banner.style.transform = 'translateX(-50%) translateY(-14px)';
      commsHideTimer = setTimeout(() => {
        banner.hidden = true;
        banner.style.opacity = '';
        banner.style.transform = '';
      }, 200);
    }, ms);
  }

  function dismissToastPill(pill) {
    if (!pill || pill.classList?.contains('is-exiting')) return;
    pill.classList?.add('is-exiting');
    pill.classList?.remove('is-entering');
    if (pill._dismissTimer) {
      clearTimeout(pill._dismissTimer);
      pill._dismissTimer = null;
    }
    setTimeout(() => {
      try {
        pill.remove();
      } catch (_) {}
    }, 140);
  }

  function pushToast(msg, optionsOrDuration = {}) {
    const currentDoc = getDoc();
    if (!currentDoc) return;

    let explicitKind = 'info';
    let durationMs = 2600;

    if (typeof optionsOrDuration === 'number') {
      durationMs = optionsOrDuration;
    } else if (typeof optionsOrDuration === 'object' && optionsOrDuration !== null) {
      if (optionsOrDuration.kind) explicitKind = optionsOrDuration.kind;
      if (typeof optionsOrDuration.durationMs === 'number') durationMs = optionsOrDuration.durationMs;
    }

    const kind = inferToastKind(msg, explicitKind);
    const queueEl = currentDoc.getElementById('toast-queue');
    const legacyEl = currentDoc.getElementById('toast');

    // Update legacy #toast if present
    if (legacyEl) {
      legacyEl.textContent = String(msg ?? '');
      legacyEl.classList?.add('show');
      if (legacyEl._toastTimer) clearTimeout(legacyEl._toastTimer);
      legacyEl._toastTimer = setTimeout(() => {
        legacyEl.classList?.remove('show');
      }, durationMs);
    }

    if (!queueEl) return;

    // Enforce cap of 3 visible pills
    const existingPills = Array.from(queueEl.children).filter(
      (c) => c.classList?.contains('toast-pill') && !c.classList?.contains('is-exiting')
    );
    while (existingPills.length >= 3) {
      const oldest = existingPills.shift();
      dismissToastPill(oldest);
    }

    const pill = currentDoc.createElement('div');
    pill.className = 'toast-pill is-entering';
    pill.dataset.kind = kind;
    pill.setAttribute('role', 'status');

    const iconKind = kind === 'danger' ? 'warning' : kind === 'warn' ? 'warning' : 'check';
    const iconSvg = renderUiIconSvg(iconKind, { size: 14 });
    const iconEl = parseSvgElement(iconSvg, currentDoc);
    if (iconEl) pill.appendChild(iconEl);

    const textSpan = currentDoc.createElement('span');
    textSpan.textContent = String(msg ?? '');
    pill.appendChild(textSpan);

    queueEl.appendChild(pill);

    if (typeof requestAnimationFrame !== 'undefined') {
      requestAnimationFrame(() => {
        pill.classList?.remove('is-entering');
      });
    } else {
      setTimeout(() => {
        pill.classList?.remove('is-entering');
      }, 16);
    }

    pill._dismissTimer = setTimeout(() => {
      dismissToastPill(pill);
    }, Math.max(400, durationMs));
  }

  function bindTooltip(targetEl, text) {
    const currentDoc = getDoc();
    if (!targetEl || !currentDoc) return () => {};

    if (targetEl.dataset?.tacticalTooltipBound === 'true') {
      if (targetEl.getAttribute?.('title')) {
        targetEl.dataset.tacticalTitle = targetEl.getAttribute('title');
        targetEl.removeAttribute('title');
      }
      return () => {};
    }

    let resolvedText = text;
    if (!resolvedText && targetEl.getAttribute?.('title')) {
      resolvedText = targetEl.getAttribute('title');
      targetEl.removeAttribute('title');
      targetEl.dataset.tacticalTitle = resolvedText;
    } else if (!resolvedText && targetEl.dataset?.tacticalTitle) {
      resolvedText = targetEl.dataset.tacticalTitle;
    }

    if (!resolvedText && typeof text !== 'function') {
      return () => {};
    }

    if (!targetEl.dataset) {
      targetEl.dataset = {};
    }
    targetEl.dataset.tacticalTooltipBound = 'true';

    const tooltip = currentDoc.getElementById('tactical-tooltip');

    const show = () => {
      if (!tooltip) return;
      const content = typeof text === 'function'
        ? text(targetEl)
        : (text || targetEl.dataset?.tacticalTitle || resolvedText);
      if (!content) return;

      tooltip.textContent = String(content);
      tooltip.hidden = false;
      tooltip.style.opacity = '1';

      const targetRect = typeof targetEl.getBoundingClientRect === 'function'
        ? targetEl.getBoundingClientRect()
        : { left: 0, top: 0, width: 0, height: 0, bottom: 0, right: 0 };

      const tipRect = typeof tooltip.getBoundingClientRect === 'function'
        ? tooltip.getBoundingClientRect()
        : { width: 120, height: 24 };

      const winW = currentDoc.defaultView?.innerWidth || currentDoc.documentElement?.clientWidth || 1920;
      const winH = currentDoc.defaultView?.innerHeight || currentDoc.documentElement?.clientHeight || 1080;

      const tipW = tipRect.width || 120;
      const tipH = tipRect.height || 24;

      let left = targetRect.left + (targetRect.width - tipW) / 2;
      left = Math.max(8, Math.min(left, winW - tipW - 8));

      let top = targetRect.bottom + 6;
      if (top + tipH > winH - 8) {
        top = Math.max(8, targetRect.top - tipH - 6);
      }

      tooltip.style.left = `${Math.round(left)}px`;
      tooltip.style.top = `${Math.round(top)}px`;
    };

    const hide = () => {
      if (!tooltip) return;
      tooltip.hidden = true;
      tooltip.style.opacity = '0';
    };

    targetEl.addEventListener('mouseenter', show);
    targetEl.addEventListener('mouseleave', hide);
    targetEl.addEventListener('focus', show);
    targetEl.addEventListener('blur', hide);

    return () => {
      if (targetEl.dataset) {
        delete targetEl.dataset.tacticalTooltipBound;
      }
      targetEl.removeEventListener('mouseenter', show);
      targetEl.removeEventListener('mouseleave', hide);
      targetEl.removeEventListener('focus', show);
      targetEl.removeEventListener('blur', hide);
      hide();
    };
  }

  return {
    showModal,
    confirm,
    closeModal,
    isModalOpen,
    showCommsBanner,
    pushToast,
    bindTooltip,
  };
}
