/**
 * Combat Telemetry HUD Overlay Adapter (Layer 1 Client).
 * Owns EN/SP/ACS Stagger bars, Shield Anti-Spam Lockout indicator,
 * Combat Callout pill (Saber Clash / Parry / Stagger 200%), and keybinding help bar.
 */
import { CAMERA_MODES } from '../shared/constants.js?v=20261116_t75e';
import { formatKeyCodeLabel } from '../shared/settings_store.js?v=20261116_t75e';
import { renderMechaPaperdollSvg } from '../shared/blueprint_svg.js?v=20261116_t75e';

function buildInlineRichLine(parts) {
  const frag = document.createDocumentFragment();
  parts.forEach((p, idx) => {
    if (idx > 0) frag.appendChild(document.createTextNode(' '));
    if (typeof p === 'string') {
      frag.appendChild(document.createTextNode(p));
    } else {
      const b = document.createElement('b');
      b.textContent = p.b;
      frag.appendChild(b);
    }
  });
  return frag;
}

export function createHudOverlay({ settingsStore }) {
  const hudApFill = document.getElementById('hud-ap-fill');
  const hudApText = document.getElementById('hud-ap-text');
  const hudPaperdollSvg = document.getElementById('hud-paperdoll-svg');
  const hudEnFill = document.getElementById('hud-en-fill');
  const hudShieldFill = document.getElementById('hud-shield-fill');
  const hudShieldStatus = document.getElementById('hud-shield-status');
  const hudAcsFill = document.getElementById('hud-acs-fill');
  const hudAcsText = document.getElementById('hud-acs-text');
  const hudGuardLock = document.getElementById('hud-guard-lock');
  const combatCalloutPill = document.getElementById('combat-callout-pill');
  const hudDummyPanel = document.getElementById('hud-dummy-panel');
  const hudDummyFill = document.getElementById('hud-dummy-fill');
  const hudEnemyPanel = document.getElementById('hud-enemy-panel');
  const hudEnemyName = document.getElementById('hud-enemy-name');
  const hudEnemyApFill = document.getElementById('hud-enemy-ap-fill');
  const hudEnemySpFill = document.getElementById('hud-enemy-sp-fill');
  const hudEnemyAcsFill = document.getElementById('hud-enemy-acs-fill');
  const hudEnemyStats = document.getElementById('hud-enemy-stats');
  const hudRoundBanner = document.getElementById('hud-round-banner');
  const hudTargetLock = document.getElementById('hud-target-lock');
  const hudTargetLockLbl = document.getElementById('hud-target-lock-lbl');
  const pipP1 = document.getElementById('pip-p-1');
  const pipP2 = document.getElementById('pip-p-2');
  const pipE1 = document.getElementById('pip-e-1');
  const pipE2 = document.getElementById('pip-e-2');
  const hudStats = document.getElementById('hud-stats');
  const hudEnPct = document.getElementById('hud-en-pct');
  const hudWpns = document.getElementById('hud-wpns');
  const hudHandLeftEl = document.getElementById('hud-hand-left');
  const hudHandLeftKeyEl = document.getElementById('hud-hand-left-key');
  const hudHandLeftNameEl = document.getElementById('hud-hand-left-name');
  const hudHandLeftStateEl = document.getElementById('hud-hand-left-state');
  const hudHandLeftFillEl = document.getElementById('hud-hand-left-fill');
  const hudHandRightEl = document.getElementById('hud-hand-right');
  const hudHandRightKeyEl = document.getElementById('hud-hand-right-key');
  const hudHandRightNameEl = document.getElementById('hud-hand-right-name');
  const hudHandRightStateEl = document.getElementById('hud-hand-right-state');
  const hudHandRightFillEl = document.getElementById('hud-hand-right-fill');
  const hudBackLeftEl = document.getElementById('hud-back-left');
  const hudBackRightEl = document.getElementById('hud-back-right');
  const hudPartsStripEl = document.getElementById('hud-parts-strip');
  const hudPartPills = hudPartsStripEl ? [...hudPartsStripEl.querySelectorAll('.hud-part-pill')] : [];
  const PART_SHORT_CODES = { head: 'HD', torso: 'TR', arm_l: 'AL', arm_r: 'AR', backpack: 'BK', legs: 'LG' };
  const hudArcEn = document.getElementById('hud-arc-en');
  const hudArcWpn = document.getElementById('hud-arc-wpn');
  const hudReticleGunTag = document.getElementById('hud-reticle-gun-tag');
  const hudSaberGuide = document.getElementById('hud-saber-guide');
  const hudSaberGuideNeedle = document.getElementById('hud-saber-guide-needle');
  const hudSaberGuideLbl = document.getElementById('hud-saber-guide-lbl');
  const hudPrimaryGunName = document.getElementById('hud-primary-gun-name');
  const hudPrimaryGunVal = document.getElementById('hud-primary-gun-val');
  const hudPrimaryGunFill = document.getElementById('hud-primary-gun-fill');
  const controlsHelpEl = document.getElementById('controls-help');

  const DOLL_PARTS = ['head', 'torso', 'arm_l', 'arm_r', 'backpack', 'legs'];
  let prevPaperdollKey = null;
  const prevPartHp = { head: null, torso: null, arm_l: null, arm_r: null, backpack: null, legs: null };
  const hitFlashUntil = { head: 0, torso: 0, arm_l: 0, arm_r: 0, backpack: 0, legs: 0 };

  const SABER_DIR_LABELS = Object.freeze({
    LR: 'SLASH R',
    RL: 'SLASH L',
    DOWN: 'CHOP DN',
    DIAG_DR: 'SLASH DR',
    DIAG_DL: 'SLASH DL',
    UP: 'UPPER UP',
    DIAG_UR: 'UPPER UR',
    DIAG_UL: 'UPPER UL',
  });

  const syncBackPill = (pillEl, st, sideTag) => {
    if (!pillEl) return;
    const spans = pillEl.querySelectorAll('.hud-back-head span');
    const fillEl = pillEl.querySelector('.hud-back-fill');
    const keyLbl = formatKeyCodeLabel(st?.keyCode || (sideTag === 'L' ? 'KeyQ' : 'KeyX'));
    if (!st?.def) {
      pillEl.classList.add('is-empty');
      pillEl.classList.remove('is-cooling');
      if (spans[0]) spans[0].textContent = `[${keyLbl}] ${sideTag}-BACK`;
      if (spans[1]) spans[1].textContent = 'EMPTY';
      if (fillEl) fillEl.style.width = '0%';
      return;
    }
    const cd = Math.max(0, Number(st.cooldownRemainingSec) || 0);
    const maxCd = Math.max(0.1, Number(st.def.cooldownSec) || 4.8);
    const readyRatio = cd <= 0.01 ? 1 : Math.max(0, Math.min(1, 1 - cd / maxCd));
    pillEl.classList.remove('is-empty');
    pillEl.classList.toggle('is-cooling', cd > 0.01);
    const shortName = st.def.shortLabel || st.def.name || st.id;
    if (spans[0]) spans[0].textContent = `[${keyLbl}] ${shortName}`;
    if (spans[1]) spans[1].textContent = cd > 0.01 ? `${cd.toFixed(1)}s` : 'READY';
    if (fillEl) fillEl.style.width = `${(readyRatio * 100).toFixed(0)}%`;
  };

  const syncHandMountCard = (cardEl, keyEl, nameEl, stateEl, fillEl, kind, keyLbl, t, shDef, pickupKeyLbl) => {
    if (!cardEl) return;
    if (keyEl) keyEl.textContent = keyLbl;
    let label = 'EMPTY';
    let stateText = 'NONE';
    let fillPct = 0;
    let isEmpty = false;
    let isActive = false;

    if (kind === 'pistol') {
      label = t.primaryGunDef?.shortLabel || t.primaryGunDef?.id || '主戰步槍';
      stateText = t.hasPistol ? 'READY' : `丟(${pickupKeyLbl})`;
      fillPct = t.hasPistol ? 100 : 0;
    } else if (kind === 'saber') {
      label = '光束軍刀';
      stateText = t.hasSaber ? 'READY' : `丟(${pickupKeyLbl})`;
      fillPct = t.hasSaber ? 100 : 0;
    } else if (kind === 'shield') {
      label = shDef?.shortLabel || '戰術盾';
      isActive = Boolean(t.barrierActive);
      stateText = isActive ? (t.boostLocked ? 'LOCK' : 'GUARD') : 'READY';
      fillPct = Math.max(0, Math.min(100, (t.shieldRatio ?? 1) * 100));
    } else {
      isEmpty = true;
    }

    cardEl.classList.toggle('is-empty', isEmpty);
    cardEl.classList.toggle('is-active', isActive);
    if (nameEl) nameEl.textContent = label;
    if (stateEl) stateEl.textContent = stateText;
    if (fillEl) fillEl.style.width = `${fillPct.toFixed(0)}%`;
  };

  let calloutTimer = 0;

  return {
    syncControlsHelp(s) {
      if (!controlsHelpEl || !s?.keybindings) return;
      const kb = s.keybindings;
      const invMouse = Boolean(s.controls?.invertMouseButtons);
      const moveStr = `${formatKeyCodeLabel(kb.moveForward)}${formatKeyCodeLabel(kb.moveLeft)}${formatKeyCodeLabel(kb.moveBack)}${formatKeyCodeLabel(kb.moveRight)}`;
      controlsHelpEl.replaceChildren(
        buildInlineRichLine([
          { b: moveStr }, '步行 |',
          { b: formatKeyCodeLabel(kb.boost) }, '滑行 |',
          { b: formatKeyCodeLabel(kb.jump) }, '跳躍/飛行',
        ]),
        document.createElement('br'),
        buildInlineRichLine([
          { b: '1~6' }, '雙持 |',
          { b: `${formatKeyCodeLabel(kb.fireBackLeft || 'KeyQ')}/${formatKeyCodeLabel(kb.fireBackRight || 'KeyX')}` }, '肩砲 |',
          { b: formatKeyCodeLabel(kb.cycleShield) }, '換盾 |',
          { b: 'T' }, '盾反',
        ]),
        document.createElement('br'),
        buildInlineRichLine([
          { b: invMouse ? 'RMB' : 'LMB' }, '左手 |',
          { b: invMouse ? 'LMB' : 'RMB' }, '右手 |',
          { b: formatKeyCodeLabel(kb.guard) }, '舉盾 |',
          { b: `${formatKeyCodeLabel(kb.orbitInspect)}/${formatKeyCodeLabel(kb.cameraMode)}/${formatKeyCodeLabel(kb.dropWeapon)}/${formatKeyCodeLabel(kb.pickupWeapon)}` },
        ]),
      );
    },

    showCombatCallout(label, kind = 'info', durationSec = 1.35) {
      if (!combatCalloutPill) return;
      combatCalloutPill.textContent = label;
      combatCalloutPill.dataset.kind = kind;
      combatCalloutPill.classList.add('active');
      calloutTimer = durationSec;
    },

    stepCallout(dt) {
      if (!combatCalloutPill || calloutTimer <= 0) return;
      calloutTimer -= dt;
      if (calloutTimer <= 0) {
        calloutTimer = 0;
        combatCalloutPill.classList.remove('active');
      }
    },

    onTickHud(t) {
      if (!t || (typeof document !== 'undefined' && document.body?.classList?.contains('in-main-menu'))) return;

      const apMax = Math.max(1, t.playerMaxHp ?? 1);
      const apVal = Math.max(0, Math.min(apMax, t.playerHp ?? 0));
      const apPct = (apVal / apMax) * 100;
      if (hudApFill) {
        hudApFill.style.width = `${apPct.toFixed(1)}%`;
        hudApFill.dataset.state = apPct <= 25 ? 'critical' : apPct <= 50 ? 'warn' : 'nominal';
      }
      if (hudApText) {
        hudApText.textContent = `${Math.round(t.playerHp ?? 0)} / ${Math.round(t.playerMaxHp ?? 1)}`;
      }

      const enMax = Math.max(1, t.maxEn ?? 1);
      const enVal = Math.max(0, Math.min(enMax, t.en ?? 0));
      const enPct = (enVal / enMax) * 100;
      if (hudEnFill) {
        hudEnFill.style.width = `${enPct}%`;
        hudEnFill.style.background =
          enPct < 20
            ? '#ff8a2b'
            : 'linear-gradient(90deg, #9ec0e0, #dce8f5)';
      }
      if (hudArcEn) {
        hudArcEn.style.strokeDashoffset = `${Math.max(0, 100 - enPct).toFixed(1)}`;
        hudArcEn.setAttribute('stroke', enPct < 20 ? '#ff8a2b' : '#cbdcf0');
      }

      const wr = t.weaponResource || {};
      const gunDef = t.primaryGunDef || {};
      if (hudPrimaryGunName) {
        hudPrimaryGunName.textContent = `[GUN] ${gunDef.id || 'EF-AR01'} ${gunDef.fireMode === 'kinetic' ? '實彈' : '光束'}`;
      }
      if (wr.resourceType === 'mag') {
        const ammo = Math.max(0, Math.round(wr.ammo ?? 32));
        const maxAmmo = Math.max(1, Math.round(wr.maxAmmo ?? 32));
        const reloading = Boolean(wr.reloading);
        const relTotal = Math.max(0.1, Number(wr.reloadDurationSec) || 1.3);
        const fillPct = reloading
          ? Math.max(0, Math.min(100, (1 - (wr.reloadTimerSec || 0) / relTotal) * 100))
          : (ammo / maxAmmo) * 100;
        const valText = reloading
          ? `RELOAD ${(wr.reloadTimerSec || 0).toFixed(1)}s`
          : `${ammo} / ${maxAmmo} MAG`;
        if (hudPrimaryGunVal) {
          hudPrimaryGunVal.textContent = valText;
          hudPrimaryGunVal.style.color = reloading || ammo <= 6 ? '#ffb4a2' : '#ffd48a';
        }
        if (hudPrimaryGunFill) {
          hudPrimaryGunFill.style.width = `${fillPct.toFixed(1)}%`;
          hudPrimaryGunFill.style.background = reloading
            ? 'linear-gradient(90deg, #fde047, #ffffff)'
            : ammo <= 6
              ? 'linear-gradient(90deg, #ff4d4f, #ff9a3c)'
              : 'linear-gradient(90deg, #f59e0b, #ffd48a)';
        }
        if (hudArcWpn) {
          hudArcWpn.style.strokeDashoffset = `${Math.max(0, 100 - fillPct).toFixed(1)}`;
          hudArcWpn.setAttribute('stroke', reloading ? '#fde047' : ammo <= 6 ? '#ff4d6d' : '#ffb248');
        }
        if (hudReticleGunTag) {
          hudReticleGunTag.textContent = reloading ? `RLD ${(wr.reloadTimerSec || 0).toFixed(1)}s` : `${ammo}/${maxAmmo}`;
          hudReticleGunTag.dataset.state = reloading || ammo <= 6 ? 'warn' : 'kinetic';
        }
      } else {
        const heatPct = Math.max(0, Math.min(100, Number(wr.heat) || 0));
        const overheated = Boolean(wr.overheated);
        const valText = overheated
          ? `OVERHEAT ${(wr.overheatTimerSec || 0).toFixed(1)}s`
          : `HEAT ${Math.round(heatPct)}%`;
        if (hudPrimaryGunVal) {
          hudPrimaryGunVal.textContent = valText;
          hudPrimaryGunVal.style.color = overheated ? '#ff7c7c' : heatPct >= 75 ? '#ffb703' : '#cbdcf0';
        }
        if (hudPrimaryGunFill) {
          hudPrimaryGunFill.style.width = `${heatPct.toFixed(1)}%`;
          hudPrimaryGunFill.style.background = overheated
            ? 'linear-gradient(90deg, #ff2d55, #ff8552)'
            : heatPct >= 75
              ? 'linear-gradient(90deg, #ff7b29, #fde047)'
              : 'linear-gradient(90deg, #9ec0e0, #cbdcf0)';
        }
        if (hudArcWpn) {
          hudArcWpn.style.strokeDashoffset = `${Math.max(0, 100 - heatPct).toFixed(1)}`;
          hudArcWpn.setAttribute('stroke', overheated ? '#ff3b5c' : heatPct >= 75 ? '#ff9a3c' : '#cbdcf0');
        }
        if (hudReticleGunTag) {
          hudReticleGunTag.textContent = overheated ? `VENT ${(wr.overheatTimerSec || 0).toFixed(1)}s` : `HEAT ${Math.round(heatPct)}%`;
          hudReticleGunTag.dataset.state = overheated || heatPct >= 75 ? 'warn' : 'beam';
        }
      }

      if (hudSaberGuide) {
        const sg = t.saberGuide;
        const guideOn = Boolean(sg?.enabled);
        hudSaberGuide.toggleAttribute('hidden', !guideOn);
        if (guideOn) {
          const deg = Math.round(((sg.angleRad || 0) * 180) / Math.PI);
          if (hudSaberGuideNeedle) {
            hudSaberGuideNeedle.setAttribute('transform', `rotate(${deg})`);
            hudSaberGuideNeedle.setAttribute('opacity', sg.hasDirection || sg.activeSwinging ? '0.96' : '0.28');
          }
          if (hudSaberGuideLbl) {
            const activeTag = sg.activeSwinging ? sg.activeDir : sg.hasDirection ? sg.dir : null;
            hudSaberGuideLbl.textContent = activeTag ? (SABER_DIR_LABELS[activeTag] || activeTag) : 'SABER 8-WAY';
            hudSaberGuideLbl.setAttribute('opacity', activeTag ? '0.95' : '0.55');
          }
        }
      }

      const stSh = t.shieldState || {};
      const shDefNow = t.activeShieldDef || { shortLabel: 'SH03 長方稜鏡', barrierColor: '#56ffe0' };
      const spPct = Math.max(0, Math.min(100, stSh.shieldSp ?? (1 - (stSh.guardHeatRatio || 0)) * 100));
      if (hudShieldFill) {
        hudShieldFill.style.width = `${stSh.overheated ? (stSh.guardHeatRatio || 0) * 100 : spPct}%`;
        hudShieldFill.style.background = stSh.overheated
          ? 'linear-gradient(90deg, #ff3b1f, #ff8b3d)'
          : `linear-gradient(90deg, ${shDefNow.barrierColor || '#56ffe0'}, #d0fcff)`;
      }
      if (hudShieldStatus) {
        hudShieldStatus.style.color = stSh.overheated ? '#ff7c52' : '#cbdcf0';
        hudShieldStatus.textContent = stSh.overheated
          ? `[過熱] ${shDefNow.shortLabel} 冷卻 ${Math.max(0, stSh.cooldownRemainingSec || 0).toFixed(1)}s`
          : t.barrierActive
            ? `[SHD] ${shDefNow.shortLabel} SP ${spPct.toFixed(0)}% (展開中)`
            : `[SHD] ${shDefNow.shortLabel} 就緒 SP ${spPct.toFixed(0)}%`;
      }

      if (hudGuardLock) {
        const reRaise = Math.max(0, stSh.reRaiseLockRemainingSec || 0);
        const minHold = Math.max(0, stSh.minHoldRemainingSec || 0);
        if (stSh.overheated) {
          hudGuardLock.textContent = `GUARD LOCK: OVERHEAT ${Math.max(0, stSh.cooldownRemainingSec || 0).toFixed(1)}s`;
          hudGuardLock.dataset.state = 'locked';
        } else if (reRaise > 0.005) {
          hudGuardLock.textContent = `RE-RAISE LOCK: ${reRaise.toFixed(2)}s`;
          hudGuardLock.dataset.state = 'locked';
        } else if (minHold > 0.005) {
          hudGuardLock.textContent = `MIN-HOLD COMMIT: ${minHold.toFixed(2)}s`;
          hudGuardLock.dataset.state = 'holding';
        } else if ((stSh.parryBufferRemainingSec || 0) > 0) {
          hudGuardLock.textContent = `PARRY WINDOW READY`;
          hudGuardLock.dataset.state = 'parry';
        } else {
          hudGuardLock.textContent = 'GUARD READY';
          hudGuardLock.dataset.state = 'ready';
        }
      }

      const acsMax = Math.max(1, t.acsMax ?? 100);
      const acsVal = Math.max(0, Math.min(acsMax, t.acsStagger ?? 0));
      const acsPct = (acsVal / acsMax) * 100;
      const isStaggered = Boolean(t.staggered);
      if (hudAcsFill) {
        hudAcsFill.style.width = `${acsPct}%`;
        hudAcsFill.style.background = isStaggered
          ? 'linear-gradient(90deg, #ff2d55, #ffd166)'
          : acsPct >= 70
            ? 'linear-gradient(90deg, #ff6b2b, #ffb703)'
            : 'linear-gradient(90deg, #f59e0b, #fde047)';
      }
      if (hudAcsText) {
        hudAcsText.style.color = isStaggered ? '#ff6b6b' : '#f7d774';
        hudAcsText.textContent = isStaggered
          ? `STAGGERED!! 200% DMG (${Math.max(0, t.staggerRemainingSec || 0).toFixed(1)}s)`
          : `[ACS] STRAIN ${Math.round(acsPct)}%${t.mapEnvId ? ` | ENV:${t.mapEnvId}` : ''}`;
      }

      if (hudDummyFill) {
        hudDummyFill.style.width = `${Math.max(0, Math.min(100, (t.dummyHp / Math.max(1, t.dummyMaxHp)) * 100))}%`;
      }

      const duelActive = Boolean(t.duelActive && t.duelMatch);
      if (hudDummyPanel) hudDummyPanel.style.display = duelActive ? 'none' : '';
      if (hudEnemyPanel) hudEnemyPanel.style.display = duelActive ? '' : 'none';
      if (duelActive && t.duelMatch) {
        const dm = t.duelMatch;
        const ru = t.rivalUnit || { ap: 4500, maxAp: 4500, acs: 0, maxAcs: 100, staggerRemainingSec: 0 };
        const rs = t.rivalShield || { shieldSp: 100, maxSp: 100, overheated: false };
        const apPct = Math.max(0, Math.min(100, (ru.ap / Math.max(1, ru.maxAp)) * 100));
        const spPct = Math.max(0, Math.min(100, ((rs.shieldSp ?? 100) / Math.max(1, rs.maxSp || 100)) * 100));
        const rAcsPct = Math.max(0, Math.min(100, ((ru.acs || 0) / Math.max(1, ru.maxAcs || 100)) * 100));
        if (hudEnemyName) hudEnemyName.textContent = `RIVAL // ${dm.rivalName || 'EF-T01 ACE'}`;
        if (hudEnemyApFill) hudEnemyApFill.style.width = `${apPct}%`;
        if (hudEnemySpFill) hudEnemySpFill.style.width = `${spPct}%`;
        if (hudEnemyAcsFill) hudEnemyAcsFill.style.width = `${rAcsPct}%`;
        if (pipP1) pipP1.classList.toggle('won', (dm.playerWins || 0) >= 1);
        if (pipP2) pipP2.classList.toggle('won', (dm.playerWins || 0) >= 2);
        if (pipE1) pipE1.classList.toggle('enemy-won', (dm.enemyWins || 0) >= 1);
        if (pipE2) pipE2.classList.toggle('enemy-won', (dm.enemyWins || 0) >= 2);
        if (hudEnemyStats) {
          const stTag = (ru.staggerRemainingSec || 0) > 0 ? ' [STAGGER!!]' : rs.overheated ? ' [SHIELD BREAK]' : '';
          const rpd = t.rivalPartDamage;
          const limbTags = [];
          if (rpd?.arm_l?.severed) limbTags.push('L-ARM CUT');
          else if (rpd?.arm_l?.broken) limbTags.push('L-ARM X');
          if (rpd?.arm_r?.severed) limbTags.push('R-ARM CUT');
          else if (rpd?.arm_r?.broken) limbTags.push('R-ARM X');
          if (rpd?.legs?.broken) limbTags.push('LEG BRK');
          const limbStr = limbTags.length ? ` | ${limbTags.join('/')}` : '';
          hudEnemyStats.textContent = `ROUND ${dm.roundNumber || 1} | AP ${Math.round(ru.ap)}/${Math.round(ru.maxAp)} | SP ${Math.round(spPct)}% | ACS ${Math.round(rAcsPct)}%${stTag}${limbStr}`;
        }
      }
      if (hudRoundBanner) {
        const hasBanner = Boolean(t.roundBannerText);
        hudRoundBanner.textContent = t.roundBannerText || '';
        hudRoundBanner.classList.toggle('active', hasBanner);
      }
      if (hudTargetLock) {
        const lp = t.rivalLockPin;
        if (duelActive && lp) {
          hudTargetLock.hidden = false;
          hudTargetLock.style.left = `${lp.x.toFixed(1)}px`;
          hudTargetLock.style.top = `${lp.y.toFixed(1)}px`;
          hudTargetLock.classList.toggle('offscreen', !lp.onScreen);
          if (hudTargetLockLbl) {
            const name = t.duelMatch?.rivalName || 'EF-T01 ACE';
            hudTargetLockLbl.textContent = `${lp.onScreen ? 'TARGET' : 'TRACKING'} // ${name} · ${Math.round(lp.distM)}m`;
          }
        } else {
          hudTargetLock.hidden = true;
        }
      }

      const curSettings = settingsStore?.get?.() || {};
      const keybindings = curSettings.keybindings || {};
      const controls = curSettings.controls || {};
      const orbitKeyLbl = formatKeyCodeLabel(keybindings.orbitInspect || 'KeyV');
      const guardKeyLbl = formatKeyCodeLabel(keybindings.guard || 'KeyE');
      const pickupKeyLbl = formatKeyCodeLabel(keybindings.pickupWeapon || 'KeyR');
      const invMouse = Boolean(controls.invertMouseButtons);
      const leftBtnLbl = invMouse ? 'RMB' : 'LMB';
      const rightBtnLbl = invMouse ? 'LMB' : 'RMB';
      const camTag = t.orbitActive ? `正面檢視(${orbitKeyLbl})` : t.cameraMode === CAMERA_MODES.FPS_COCKPIT ? '座艙' : 'TPS';
      const tax = t.loadoutTax;
      const overloadTag = tax?.overloadState === 'overloaded'
        ? ` | [OVERLOAD x${tax.speedScale.toFixed(2)}]`
        : tax?.overloadState === 'heavy'
          ? ' | [HEAVY]'
          : '';
      const enNum = (t.en ?? 0).toFixed(0);
      if (hudEnPct) hudEnPct.textContent = `${enNum}%`;
      if (hudStats) {
        const moveMode = t.moveMode || 'READY';
        const spdNum = ((t.speedMps ?? 0) * 3.6).toFixed(0);
        const altNum = (t.altM ?? 0).toFixed(1);
        const destroyed = t.destroyed ?? 0;
        const mcEarned = t.mcEarned ?? 0;
        hudStats.textContent = `[${moveMode}] ${spdNum} km/h | ALT ${altNum}m | ${camTag} | 拆樓 ${destroyed} (+${mcEarned} MC)${overloadTag}`;
      }
      const pr = t.loadoutPreset || { mode: 1, rHand: 'pistol', lHand: 'saber' };
      const shDef = t.activeShieldDef || { id: 'SH03', shortLabel: 'SH03 長方稜鏡' };
      const hasAnyShield = pr.lHand === 'shield' || pr.rHand === 'shield';
      if (hudWpns) {
        hudWpns.textContent = `PRESET ${pr.mode}/6 // 1~6${hasAnyShield ? '' : ` · 背盾 ${shDef.id || 'SH03'}`}`;
      }
      syncHandMountCard(hudHandLeftEl, hudHandLeftKeyEl, hudHandLeftNameEl, hudHandLeftStateEl, hudHandLeftFillEl, pr.lHand, leftBtnLbl, t, shDef, pickupKeyLbl);
      syncHandMountCard(hudHandRightEl, hudHandRightKeyEl, hudHandRightNameEl, hudHandRightStateEl, hudHandRightFillEl, pr.rHand, rightBtnLbl, t, shDef, pickupKeyLbl);
      syncBackPill(hudBackLeftEl, t.backLeft, 'L');
      syncBackPill(hudBackRightEl, t.backRight, 'R');
      if (hudPaperdollSvg) {
        const pd = t.partDamage || null;
        const now = typeof performance !== 'undefined' && performance.now ? performance.now() : Date.now();

        if (pd) {
          for (const partId of DOLL_PARTS) {
            const curPart = pd[partId];
            const curHp = typeof curPart?.hp === 'number' ? curPart.hp : null;
            const prevHp = prevPartHp[partId];
            if (curHp !== null && prevHp !== null && (prevHp - curHp) > 0.01) {
              hitFlashUntil[partId] = now + 90;
            }
            if (curHp !== null) {
              prevPartHp[partId] = curHp;
            }
          }
        }

        const paperdollKey = pd
          ? DOLL_PARTS.map((id) => {
              const p = pd[id];
              return `${id}:${p?.severed ? 'severed' : p?.broken ? 'broken' : p?.status || 'intact'}`;
            }).join('|')
          : 'none';

        if (paperdollKey !== prevPaperdollKey) {
          hudPaperdollSvg.innerHTML = renderMechaPaperdollSvg(t.partDamage);
          prevPaperdollKey = paperdollKey;
        }

        for (const partId of DOLL_PARTS) {
          const node = hudPaperdollSvg.querySelector(`[data-doll-part="${partId}"]`);
          if (!node) continue;
          const isFlashing = now < (hitFlashUntil[partId] || 0);
          if (isFlashing) {
            node.classList.add('is-hit-flash');
          } else {
            node.classList.remove('is-hit-flash');
          }
        }
      }
      if (t.partDamage && hudPartPills.length > 0) {
        for (const pill of hudPartPills) {
          const pid = pill.dataset.part;
          const pst = t.partDamage[pid];
          if (!pst) continue;
          const pct = Math.max(0, Math.min(100, Math.round((pst.hp / Math.max(1, pst.maxHp)) * 100)));
          pill.dataset.status = pst.status || 'intact';
          const code = PART_SHORT_CODES[pid] || pid.toUpperCase();
          pill.textContent = pst.severed ? `${code} CUT` : pst.broken ? `${code} BRK` : `${code} ${pct}`;
        }
      }
    },
  };
}
