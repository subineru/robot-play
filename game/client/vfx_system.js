/**
 * Studio Sample-Layered Web Audio Engine + HDR VFX System (Layer 1 Client).
 * - Uses curated CC0 real studio game samples under `assets/audio/*.ogg` with
 *   dynamic randomized pitch/rate modulation, stereo panning, DynamicsCompressor,
 *   and urban convolver reverb (with zero-dependency oscillator fallback during load).
 */
import * as THREE from 'three';

const AUDIO_BASE_URL = new URL('../../assets/audio/', import.meta.url).href;

const SAMPLE_FILES = [
  'shot_crack_0', 'shot_crack_1', 'shot_punch_0', 'shot_punch_1',
  'shot_bolt_0', 'shot_bolt_1', 'shot_shell',
  'saber_ignite', 'saber_hum_0', 'saber_hum_1', 'saber_slash_0', 'saber_slash_1',
  'saber_hit_0', 'saber_hit_1', 'saber_plasma_tear',
  'step_plate_0', 'step_plate_1', 'step_plate_2',
  'step_concrete_0', 'step_concrete_1', 'step_concrete_2',
  'servo_lift_0', 'servo_lift_1',
  'thruster_loop', 'thruster_sub_loop', 'thruster_ignite',
  'hit_concrete_0', 'hit_concrete_1', 'hit_metal_bullet_0', 'hit_metal_bullet_1',
  'shield_hum', 'shield_parry_bell',
  'collapse_low_0', 'collapse_low_1', 'collapse_crunch_0', 'collapse_crunch_1',
  'glass_shatter_0', 'glass_shatter_1',
  'car_wreck_0', 'car_wreck_1',
];

function makeDistortionCurve(amount = 28) {
  const n = 256;
  const curve = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const x = (i * 2) / n - 1;
    curve[i] = ((3 + amount) * x * 20 * (Math.PI / 180)) / (Math.PI + amount * Math.abs(x));
  }
  return curve;
}

export class MechaAudioSynth {
  constructor() {
    this.ctx = null;
    this.masterGain = null;
    this.sfxBus = null;
    this.noiseBuffer = null;
    this.pinkBuffer = null;
    this.shaperCurve = makeDistortionCurve(26);
    this.samples = new Map();
    this.samplesLoading = false;
    this.jetSource = null;
    this.jetFilter = null;
    this.jetGain = null;
    this.jetSubSource = null;
    this.jetSubFilter = null;
    this.jetSubGain = null;
    this.thrusterDuck = 1.0;
    this.lastBulletHitMs = 0;
    this.masterVolume = 0.5;
  }

  _ensureCtx() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') this.ctx.resume().catch(() => {});
      return this.ctx;
    }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    const ctx = new AC();
    this.ctx = ctx;

    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -14;
    comp.knee.value = 16;
    comp.ratio.value = 5.5;
    comp.attack.value = 0.002;
    comp.release.value = 0.14;

    this.masterGain = ctx.createGain();
    this.masterGain.gain.value = this.masterVolume;
    comp.connect(this.masterGain).connect(ctx.destination);

    // Subtle urban street echo convolver
    const irLen = Math.floor(ctx.sampleRate * 0.42);
    const irBuf = ctx.createBuffer(2, irLen, ctx.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const data = irBuf.getChannelData(ch);
      for (let i = 0; i < irLen; i++) {
        data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / irLen, 3.4) * 0.32;
      }
    }
    const convolver = ctx.createConvolver();
    convolver.buffer = irBuf;
    const wetGain = ctx.createGain();
    wetGain.gain.value = 0.18;

    this.sfxBus = ctx.createGain();
    this.sfxBus.connect(comp);
    this.sfxBus.connect(convolver);
    convolver.connect(wetGain).connect(comp);

    // Pre-bake 2s fallback White & Pink Noise buffers
    const len = ctx.sampleRate * 2;
    this.noiseBuffer = ctx.createBuffer(1, len, ctx.sampleRate);
    this.pinkBuffer = ctx.createBuffer(1, len, ctx.sampleRate);
    const wData = this.noiseBuffer.getChannelData(0);
    const pData = this.pinkBuffer.getChannelData(0);
    let b0 = 0, b1 = 0, b2 = 0;
    for (let i = 0; i < len; i++) {
      const white = Math.random() * 2 - 1;
      wData[i] = white;
      b0 = 0.997 * b0 + white * 0.029;
      b1 = 0.985 * b1 + white * 0.032;
      b2 = 0.95 * b2 + white * 0.048;
      pData[i] = Math.max(-1, Math.min(1, (b0 + b1 + b2 + white * 0.18) * 1.4));
    }

    // Continuous dual-layer thruster source (turbine roar + sub-bass jet pressure)
    const jetSrc = ctx.createBufferSource();
    jetSrc.buffer = this.pinkBuffer;
    jetSrc.loop = true;
    const jetFilt = ctx.createBiquadFilter();
    jetFilt.type = 'lowpass';
    jetFilt.frequency.value = 280;
    jetFilt.Q.value = 1.1;
    const jetShaper = ctx.createWaveShaper();
    jetShaper.curve = makeDistortionCurve(14);
    const jetGain = ctx.createGain();
    jetGain.gain.value = 0.0001;
    jetSrc.connect(jetFilt).connect(jetShaper).connect(jetGain).connect(this.sfxBus);
    jetSrc.start();
    this.jetSource = jetSrc;
    this.jetFilter = jetFilt;
    this.jetGain = jetGain;

    const jetSubSrc = ctx.createBufferSource();
    jetSubSrc.buffer = this.pinkBuffer;
    jetSubSrc.loop = true;
    const jetSubFilt = ctx.createBiquadFilter();
    jetSubFilt.type = 'lowpass';
    jetSubFilt.frequency.value = 240;
    const jetSubGain = ctx.createGain();
    jetSubGain.gain.value = 0.0001;
    jetSubSrc.connect(jetSubFilt).connect(jetSubGain).connect(this.sfxBus);
    jetSubSrc.start();
    this.jetSubSource = jetSubSrc;
    this.jetSubFilter = jetSubFilt;
    this.jetSubGain = jetSubGain;

    this._preloadSamples();
    return ctx;
  }

  _preloadSamples() {
    if (this.samplesLoading || !this.ctx || typeof fetch !== 'function') return;
    this.samplesLoading = true;
    for (const key of SAMPLE_FILES) {
      fetch(`${AUDIO_BASE_URL}${key}.ogg`)
        .then((res) => (res.ok ? res.arrayBuffer() : null))
        .then((buf) => (buf && this.ctx ? this.ctx.decodeAudioData(buf) : null))
        .then((decoded) => {
          if (!decoded) return;
          this.samples.set(key, decoded);
          if (key === 'thruster_loop' && this.ctx && this.jetFilter) {
            try {
              this.jetSource?.stop();
            } catch {
              // ignore
            }
            const realJet = this.ctx.createBufferSource();
            realJet.buffer = decoded;
            realJet.loop = true;
            realJet.playbackRate.value = 0.90;
            realJet.connect(this.jetFilter);
            realJet.start();
            this.jetSource = realJet;
          } else if (key === 'thruster_sub_loop' && this.ctx && this.jetSubFilter) {
            try {
              this.jetSubSource?.stop();
            } catch {
              // ignore
            }
            const realSub = this.ctx.createBufferSource();
            realSub.buffer = decoded;
            realSub.loop = true;
            realSub.playbackRate.value = 0.72;
            realSub.connect(this.jetSubFilter);
            realSub.start();
            this.jetSubSource = realSub;
          }
        })
        .catch(() => {
          // graceful silent fallback to synth
        });
    }
  }

  _pick(prefix, count) {
    const idx = Math.floor(Math.random() * count);
    return this.samples.get(`${prefix}_${idx}`) || this.samples.get(`${prefix}_0`) || null;
  }

  _playBuffer(buf, {
    rate = 1,
    rateEnd = null,
    gain = 0.5,
    delay = 0,
    duration = null,
    pan = 0,
    lowpassHz = null,
    highpassHz = null,
  } = {}) {
    if (!buf || !this.ctx || !this.sfxBus) return false;
    const now = this.ctx.currentTime + delay;
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    src.playbackRate.setValueAtTime(Math.max(0.25, rate), now);
    if (rateEnd != null) {
      src.playbackRate.exponentialRampToValueAtTime(Math.max(0.25, rateEnd), now + (duration || buf.duration));
    }

    let node = src;
    if (highpassHz) {
      const hp = this.ctx.createBiquadFilter();
      hp.type = 'highpass';
      hp.frequency.value = highpassHz;
      node.connect(hp);
      node = hp;
    }
    if (lowpassHz) {
      const lp = this.ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = lowpassHz;
      node.connect(lp);
      node = lp;
    }

    const gNode = this.ctx.createGain();
    gNode.gain.setValueAtTime(gain, now);
    if (duration) {
      gNode.gain.setValueAtTime(gain, now + Math.max(0.01, duration * 0.65));
      gNode.gain.exponentialRampToValueAtTime(0.001, now + duration);
    }
    node.connect(gNode);

    if (typeof this.ctx.createStereoPanner === 'function' && Math.abs(pan) > 0.01) {
      const panner = this.ctx.createStereoPanner();
      panner.pan.value = Math.max(-1, Math.min(1, pan));
      gNode.connect(panner).connect(this.sfxBus);
    } else {
      gNode.connect(this.sfxBus);
    }

    src.start(now);
    if (duration) src.stop(now + duration + 0.02);
    return true;
  }

  _jitter(base = 1, spread = 0.08) {
    return base * (1 + (Math.random() * 2 - 1) * spread);
  }

  setVolume(v) {
    this.masterVolume = Math.max(0, Math.min(1, v));
    if (this.masterGain && this.ctx) {
      this.masterGain.gain.setTargetAtTime(this.masterVolume, this.ctx.currentTime, 0.03);
    }
  }

  playThrusterIgnite() {
    const ctx = this._ensureCtx();
    if (!ctx) return;
    const igBuf = this.samples.get('thruster_ignite');
    const punchBuf = this._pick('shot_punch', 2);
    if (igBuf) {
      this._playBuffer(igBuf, { rate: this._jitter(0.86, 0.06), gain: 0.78, duration: 0.65 });
    }
    if (punchBuf) {
      this._playBuffer(punchBuf, { rate: 0.48, gain: 0.68, lowpassHz: 320 });
    }
  }

  updateJetThruster(intensity = 0, speedNorm = 0) {
    if (!this.ctx || !this.jetGain || !this.jetFilter) return;
    const now = this.ctx.currentTime;
    const cl = Math.max(0, Math.min(1, intensity));
    // Duck footsteps/ambient by up to ~65% so rocket thrusters dominate clearly without clipping weapons
    this.thrusterDuck = 1 - cl * 0.65;
    const hasRealLoop = this.samples.has('thruster_loop');
    const hasSubLoop = this.samples.has('thruster_sub_loop');
    this.jetGain.gain.setTargetAtTime(cl * (hasRealLoop ? 0.68 : 0.42), now, 0.045);
    this.jetFilter.frequency.setTargetAtTime(280 + cl * 2150 + speedNorm * 450, now, 0.05);
    if (this.jetSource?.playbackRate) {
      this.jetSource.playbackRate.setTargetAtTime(0.84 + cl * 0.24 + speedNorm * 0.14, now, 0.08);
    }
    if (this.jetSubGain) {
      this.jetSubGain.gain.setTargetAtTime(cl * (hasSubLoop ? 0.60 : 0.25), now, 0.05);
    }
  }

  playShot() {
    const ctx = this._ensureCtx();
    if (!ctx) return;
    const now = ctx.currentTime;

    const crackBuf = this._pick('shot_crack', 2);
    const punchBuf = this._pick('shot_punch', 2);
    const boltBuf = this._pick('shot_bolt', 2);
    const shellBuf = this.samples.get('shot_shell');

    if (crackBuf || punchBuf) {
      if (crackBuf) {
        this._playBuffer(crackBuf, {
          rate: this._jitter(1.85, 0.08),
          gain: 0.56,
          duration: 0.16,
          highpassHz: 180,
        });
      }
      if (punchBuf) {
        this._playBuffer(punchBuf, {
          rate: this._jitter(0.88, 0.07),
          gain: 0.62,
          lowpassHz: 950,
        });
      }
      if (boltBuf) {
        this._playBuffer(boltBuf, {
          rate: this._jitter(1.12, 0.08),
          gain: 0.36,
          delay: 0.014,
          highpassHz: 600,
        });
      }
      if (shellBuf) {
        this._playBuffer(shellBuf, {
          rate: this._jitter(1.48, 0.1),
          gain: 0.14,
          delay: 0.065,
          duration: 0.11,
          pan: -0.25,
          highpassHz: 2200,
        });
      }
      return;
    }

    // Fallback synth while samples finish async fetch on first millisecond
    const sub = ctx.createOscillator();
    const subG = ctx.createGain();
    sub.type = 'sine';
    sub.frequency.setValueAtTime(125, now);
    sub.frequency.exponentialRampToValueAtTime(42, now + 0.11);
    subG.gain.setValueAtTime(0.32, now);
    subG.gain.exponentialRampToValueAtTime(0.001, now + 0.12);
    sub.connect(subG).connect(this.sfxBus);
    sub.start(now);
    sub.stop(now + 0.13);
  }

  playSaberSlash() {
    const ctx = this._ensureCtx();
    if (!ctx) return;
    const now = ctx.currentTime;

    const tearBuf = this.samples.get('saber_plasma_tear');
    const humBuf = this._pick('saber_hum', 2);
    const sliceBuf = this._pick('saber_slash', 2);
    if (tearBuf || humBuf || sliceBuf) {
      // Hybrid Beam Saber Rip: 1) Electric plasma crackle tear + 2) Heavy low-end air pressure sweep
      if (tearBuf) {
        this._playBuffer(tearBuf, {
          rate: this._jitter(1.06, 0.08),
          gain: 0.66,
          duration: 0.32,
          highpassHz: 380,
        });
      }
      if (humBuf) {
        this._playBuffer(humBuf, {
          rate: this._jitter(1.48, 0.06),
          rateEnd: 0.72,
          gain: 0.58,
          duration: 0.34,
          pan: 0.18,
          lowpassHz: 1850,
        });
      }
      if (sliceBuf) {
        this._playBuffer(sliceBuf, {
          rate: this._jitter(0.84, 0.08),
          gain: 0.72,
          duration: 0.28,
          pan: -0.14,
          highpassHz: 280,
        });
      }
      // Subtle low-end pressure tear sub punch
      const subOsc = ctx.createOscillator();
      const subG = ctx.createGain();
      subOsc.type = 'triangle';
      subOsc.frequency.setValueAtTime(145, now);
      subOsc.frequency.exponentialRampToValueAtTime(46, now + 0.16);
      subG.gain.setValueAtTime(0.24, now);
      subG.gain.exponentialRampToValueAtTime(0.001, now + 0.17);
      subOsc.connect(subG).connect(this.sfxBus);
      subOsc.start(now);
      subOsc.stop(now + 0.18);
      return;
    }

    const pSrc = ctx.createBufferSource();
    pSrc.buffer = this.pinkBuffer;
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.Q.value = 3.2;
    bp.frequency.setValueAtTime(320, now);
    bp.frequency.exponentialRampToValueAtTime(1950, now + 0.09);
    const pG = ctx.createGain();
    pG.gain.setValueAtTime(0.45, now);
    pG.gain.exponentialRampToValueAtTime(0.001, now + 0.28);
    pSrc.connect(bp).connect(pG).connect(this.sfxBus);
    pSrc.start(now);
    pSrc.stop(now + 0.3);
  }

  playSaberIgnite() {
    const ctx = this._ensureCtx();
    if (!ctx) return;
    const igBuf = this.samples.get('saber_ignite');
    const humBuf = this._pick('saber_hum', 2);
    if (igBuf || humBuf) {
      if (igBuf) this._playBuffer(igBuf, { rate: this._jitter(0.95, 0.05), gain: 0.45 });
      if (humBuf) this._playBuffer(humBuf, { rate: 0.75, rateEnd: 1.18, gain: 0.42, duration: 0.3 });
      return;
    }

    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(84, now);
    osc.frequency.exponentialRampToValueAtTime(142, now + 0.14);
    g.gain.setValueAtTime(0.18, now);
    g.gain.exponentialRampToValueAtTime(0.001, now + 0.26);
    osc.connect(g).connect(this.sfxBus);
    osc.start(now);
    osc.stop(now + 0.28);
  }

  playServoLift(side = 'L') {
    const ctx = this._ensureCtx();
    if (!ctx) return;
    const pan = side === 'L' ? -0.18 : side === 'R' ? 0.18 : 0;
    const srvBuf = this._pick('servo_lift', 2);
    const clkBuf = this._pick('shot_bolt', 2);
    if (srvBuf) {
      this._playBuffer(srvBuf, {
        rate: this._jitter(1.58, 0.07),
        gain: 0.24,
        duration: 0.14,
        pan,
        highpassHz: 360,
        lowpassHz: 3400,
      });
    }
    if (clkBuf) {
      this._playBuffer(clkBuf, {
        rate: this._jitter(1.32, 0.08),
        gain: 0.14,
        delay: 0.05,
        pan,
      });
    }
  }

  playFootstep(heavy = false, side = 'C') {
    const ctx = this._ensureCtx();
    if (!ctx) return;
    const scale = (heavy ? 1.4 : 1.0) * this.thrusterDuck;
    const pan = side === 'L' ? -0.22 : side === 'R' ? 0.22 : 0;

    const plateBuf = this._pick('step_plate', 3);
    const concBuf = this._pick('step_concrete', 3);
    const punchBuf = this._pick('shot_punch', 2);
    if (plateBuf || concBuf) {
      if (plateBuf) {
        this._playBuffer(plateBuf, {
          rate: this._jitter(heavy ? 0.52 : 0.60, 0.07),
          gain: 0.52 * scale,
          pan,
          lowpassHz: 1850,
        });
      }
      if (concBuf) {
        this._playBuffer(concBuf, {
          rate: this._jitter(0.68, 0.08),
          gain: 0.42 * scale,
          pan,
        });
      }
      if (punchBuf) {
        this._playBuffer(punchBuf, {
          rate: this._jitter(0.54, 0.06),
          gain: 0.46 * scale,
          pan,
          lowpassHz: 360,
        });
      }
      return;
    }

    const now = ctx.currentTime;
    const sub = ctx.createOscillator();
    const subG = ctx.createGain();
    sub.type = 'sine';
    sub.frequency.setValueAtTime(74, now);
    sub.frequency.exponentialRampToValueAtTime(30, now + 0.1);
    subG.gain.setValueAtTime(0.18 * scale, now);
    subG.gain.exponentialRampToValueAtTime(0.001, now + 0.11);
    sub.connect(subG).connect(this.sfxBus);
    sub.start(now);
    sub.stop(now + 0.12);
  }

  playBulletHit(material = 'concrete') {
    const ctx = this._ensureCtx();
    if (!ctx) return;
    const nowMs = performance.now();
    if (nowMs - this.lastBulletHitMs < 48) return;
    this.lastBulletHitMs = nowMs;

    if (material === 'metal') {
      const mBuf = this._pick('hit_metal_bullet', 2);
      if (mBuf) {
        this._playBuffer(mBuf, { rate: this._jitter(1.06, 0.12), gain: 0.54, highpassHz: 320 });
        return;
      }
    } else {
      const cBuf = this._pick('hit_concrete', 2);
      const pBuf = this._pick('shot_punch', 2);
      if (cBuf) {
        this._playBuffer(cBuf, { rate: this._jitter(0.94, 0.12), gain: 0.50 });
        if (pBuf) this._playBuffer(pBuf, { rate: 0.72, gain: 0.22, lowpassHz: 480 });
        return;
      }
    }
    this.playHitConfirmFallback();
  }

  playSaberHit(material = 'concrete') {
    const ctx = this._ensureCtx();
    if (!ctx) return;
    const hitBuf = this._pick('saber_hit', 2);
    const tearBuf = this.samples.get('saber_plasma_tear');
    const matBuf = material === 'metal' ? this._pick('hit_metal_bullet', 2) : this._pick('hit_concrete', 2);

    if (hitBuf) this._playBuffer(hitBuf, { rate: this._jitter(0.88, 0.08), gain: 0.74 });
    if (matBuf) this._playBuffer(matBuf, { rate: this._jitter(0.85, 0.1), gain: 0.52, delay: 0.01 });
    if (tearBuf) {
      this._playBuffer(tearBuf, {
        rate: this._jitter(1.22, 0.08),
        gain: 0.44,
        delay: 0.03,
        duration: 0.24,
        highpassHz: 1100,
      });
    }
    if (!hitBuf && !matBuf) this.playHitConfirmFallback();
  }

  playShieldParry(isParry = true) {
    const ctx = this._ensureCtx();
    if (!ctx) return;
    const bellBuf = this.samples.get('shield_parry_bell');
    const humBuf = this.samples.get('shield_hum');
    if (bellBuf) {
      this._playBuffer(bellBuf, {
        rate: isParry ? this._jitter(1.08, 0.04) : this._jitter(0.72, 0.06),
        gain: isParry ? 0.80 : 0.54,
        highpassHz: isParry ? 240 : 120,
      });
    }
    if (humBuf) {
      this._playBuffer(humBuf, {
        rate: isParry ? 1.32 : 0.88,
        gain: isParry ? 0.50 : 0.36,
        duration: 0.28,
      });
    }
  }

  playShieldToggle(active = true) {
    const ctx = this._ensureCtx();
    if (!ctx) return;
    const humBuf = this.samples.get('shield_hum');
    if (humBuf) {
      this._playBuffer(humBuf, {
        rate: active ? 1.18 : 0.76,
        gain: 0.36,
        duration: 0.24,
      });
    }
  }

  playHitConfirm(isMelee = false, material = 'concrete') {
    if (isMelee) {
      this.playSaberHit(material);
    } else {
      this.playBulletHit(material);
    }
  }

  playHitConfirmFallback() {
    const ctx = this._ensureCtx();
    if (!ctx) return;
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const oG = ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(320, now);
    osc.frequency.exponentialRampToValueAtTime(95, now + 0.09);
    oG.gain.setValueAtTime(0.18, now);
    oG.gain.exponentialRampToValueAtTime(0.001, now + 0.1);
    osc.connect(oG).connect(this.sfxBus);
    osc.start(now);
    osc.stop(now + 0.11);
  }

  playCarWreck() {
    const ctx = this._ensureCtx();
    if (!ctx) return;
    const metalBuf = this._pick('car_wreck', 2);
    const glassBuf = this._pick('glass_shatter', 2);
    const blastBuf = this._pick('shot_crack', 2);
    if (metalBuf) this._playBuffer(metalBuf, { rate: this._jitter(0.88, 0.1), gain: 0.58 });
    if (glassBuf) this._playBuffer(glassBuf, { rate: this._jitter(1.12, 0.1), gain: 0.44, delay: 0.04 });
    if (blastBuf) this._playBuffer(blastBuf, { rate: this._jitter(1.15, 0.08), gain: 0.42, duration: 0.28 });
  }

  playPickup() {
    const ctx = this._ensureCtx();
    if (!ctx) return;
    const boltBuf = this._pick('shot_bolt', 2);
    if (boltBuf) this._playBuffer(boltBuf, { rate: 1.0, gain: 0.5 });
    this.playSaberIgnite();
  }

  playCollapse() {
    const ctx = this._ensureCtx();
    if (!ctx) return;
    const lowBuf = this._pick('collapse_low', 2);
    const crunchBuf = this._pick('collapse_crunch', 2);
    const glassBuf = this._pick('glass_shatter', 2);

    if (lowBuf || crunchBuf) {
      if (lowBuf) this._playBuffer(lowBuf, { rate: this._jitter(0.76, 0.06), gain: 0.72 });
      if (crunchBuf) this._playBuffer(crunchBuf, { rate: this._jitter(0.68, 0.07), gain: 0.62, delay: 0.12 });
      if (glassBuf) this._playBuffer(glassBuf, { rate: this._jitter(0.95, 0.08), gain: 0.44, delay: 0.28 });
      if (crunchBuf) this._playBuffer(crunchBuf, { rate: this._jitter(0.58, 0.06), gain: 0.52, delay: 0.95 });
      return;
    }

    const now = ctx.currentTime;
    const sub = ctx.createOscillator();
    const sG = ctx.createGain();
    sub.type = 'sine';
    sub.frequency.setValueAtTime(85, now);
    sub.frequency.exponentialRampToValueAtTime(22, now + 0.55);
    sG.gain.setValueAtTime(0.45, now);
    sG.gain.exponentialRampToValueAtTime(0.001, now + 0.58);
    sub.connect(sG).connect(this.sfxBus);
    sub.start(now);
    sub.stop(now + 0.6);
  }
}

export class VfxSystem {
  constructor(scene) {
    this.scene = scene;
    this.projectiles = [];
    this.particles = [];
    this.trailSamples = [];
    this.maxTrailSamples = 20;

    // Elongated autocannon tracer needle: +Y rotated -> +Z (head at +0.2m, 3.6m tail extending toward -Z)
    this.tracerLength = 3.8;
    this.boltGeo = new THREE.CylinderGeometry(0.036, 0.008, this.tracerLength, 10, 1, true);
    this.boltGeo.rotateX(Math.PI * 0.5);
    this.boltGeo.translate(0, 0, -this.tracerLength * 0.45);
    this.impactFlashGeo = new THREE.SphereGeometry(0.24, 10, 8);
    this.shockRingGeo = new THREE.RingGeometry(0.45, 0.95, 28);
    this.shockRingGeo.rotateX(-Math.PI * 0.5);
    this.particleGeo = new THREE.BoxGeometry(0.14, 0.14, 0.14);

    // Dynamic Beam Saber Ribbon Trail geometry
    const maxVerts = this.maxTrailSamples * 2;
    this.trailPositions = new Float32Array(maxVerts * 3);
    this.trailGeo = new THREE.BufferGeometry();
    this.trailGeo.setAttribute('position', new THREE.BufferAttribute(this.trailPositions, 3));
    const indices = [];
    for (let i = 0; i < this.maxTrailSamples - 1; i++) {
      const a = i * 2;
      const b = a + 1;
      const c = a + 2;
      const d = a + 3;
      indices.push(a, b, c, b, d, c);
    }
    this.trailGeo.setIndex(indices);
    this.trailGeo.setDrawRange(0, 0);

    // Multiplied bright HDR tint so UnrealBloomPass makes slashes gleam like plasma!
    this.trailMat = new THREE.MeshBasicMaterial({
      color: '#9cfaff',
      transparent: true,
      opacity: 0.85,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    this.trailMesh = new THREE.Mesh(this.trailGeo, this.trailMat);
    this.trailMesh.frustumCulled = false;
    this.scene.add(this.trailMesh);
  }

  setAccentColor(hex) {
    this.trailMat.color.set(hex || '#7bf9ff');
  }

  spawnBeamBolt(origin, dir, _colorHex = '#ff9a2e') {
    // Fixed realistic autocannon tracer: incandescent white tip -> saturated gold-orange trail, ZERO spark confetti
    const mat = new THREE.ShaderMaterial({
      uniforms: {
        uTailOpacity: { value: 1.0 },
      },
      vertexShader: `
        varying vec2 vUv;
        void main() {
          vUv = uv;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        uniform float uTailOpacity;
        varying vec2 vUv;
        void main() {
          float t = clamp(vUv.y, 0.0, 1.0);
          vec3 tipWhite = vec3(2.9, 2.55, 1.95);
          vec3 goldCore = vec3(2.05, 0.82, 0.14);
          vec3 tailEmber = vec3(1.15, 0.28, 0.03);
          vec3 col = mix(tailEmber, goldCore, smoothstep(0.05, 0.65, t));
          col = mix(col, tipWhite, smoothstep(0.76, 0.98, t));
          float alpha = pow(t, 0.72) * smoothstep(1.0, 0.95, t) * uTailOpacity;
          gl_FragColor = vec4(col, alpha);
        }
      `,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
    });
    const mesh = new THREE.Mesh(this.boltGeo, mat);
    mesh.position.copy(origin);
    mesh.lookAt(origin.clone().add(dir));
    mesh.scale.set(1, 1, 0.12);
    this.scene.add(mesh);

    this.projectiles.push({
      mesh,
      vel: dir.clone().normalize().multiplyScalar(86),
      traveled: 0.45,
      life: 1.15,
      damage: 26,
      fromEnemy: false,
    });
  }

  spawnEnemyTestBolt(origin, dir) {
    const mat = new THREE.ShaderMaterial({
      uniforms: {
        uTailOpacity: { value: 1.0 },
      },
      vertexShader: `
        varying vec2 vUv;
        void main() {
          vUv = uv;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        uniform float uTailOpacity;
        varying vec2 vUv;
        void main() {
          float t = clamp(vUv.y, 0.0, 1.0);
          vec3 tipWhite = vec3(3.1, 2.3, 2.6);
          vec3 crimsonCore = vec3(2.2, 0.25, 0.45);
          vec3 tailEmber = vec3(1.2, 0.05, 0.15);
          vec3 col = mix(tailEmber, crimsonCore, smoothstep(0.05, 0.62, t));
          col = mix(col, tipWhite, smoothstep(0.75, 0.98, t));
          float alpha = pow(t, 0.65) * smoothstep(1.0, 0.95, t) * uTailOpacity;
          gl_FragColor = vec4(col, alpha);
        }
      `,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
    });
    const mesh = new THREE.Mesh(this.boltGeo, mat);
    mesh.position.copy(origin);
    mesh.lookAt(origin.clone().add(dir));
    mesh.scale.set(1.5, 1.5, 0.25);
    this.scene.add(mesh);

    this.projectiles.push({
      mesh,
      vel: dir.clone().normalize().multiplyScalar(22),
      traveled: 0.45,
      life: 2.2,
      damage: 18,
      fromEnemy: true,
    });
  }

  spawnImpactFlash(origin) {
    const mat = new THREE.MeshBasicMaterial({
      color: '#ffae42',
      transparent: true,
      opacity: 0.9,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    const mesh = new THREE.Mesh(this.impactFlashGeo, mat);
    mesh.position.copy(origin);
    this.scene.add(mesh);
    this.particles.push({
      mesh,
      vel: new THREE.Vector3(0, 0, 0),
      gravity: 0,
      growRate: 5.5,
      life: 0.09,
      maxLife: 0.09,
      noBounce: true,
    });
  }

  spawnLandingShockRing(origin) {
    const mat = new THREE.MeshBasicMaterial({
      color: '#9db2c8',
      transparent: true,
      opacity: 0.46,
      side: THREE.DoubleSide,
      depthWrite: false,
    });
    const mesh = new THREE.Mesh(this.shockRingGeo, mat);
    mesh.position.set(origin.x, 0.04, origin.z);
    this.scene.add(mesh);
    this.particles.push({
      mesh,
      vel: new THREE.Vector3(0, 0, 0),
      gravity: 0,
      growRate: 8.5,
      life: 0.34,
      maxLife: 0.34,
      noBounce: true,
    });
    this.spawnDust(origin, 10);
  }

  spawnThrusterEmber(origin, backDir, colorHex = '#38d8ff', count = 2) {
    for (let i = 0; i < count; i++) {
      const mat = new THREE.MeshBasicMaterial({
        color: colorHex,
        transparent: true,
        opacity: 0.85,
        blending: THREE.AdditiveBlending,
      });
      const mesh = new THREE.Mesh(this.particleGeo, mat);
      mesh.position.copy(origin);
      mesh.scale.setScalar(0.45 + Math.random() * 0.45);
      this.scene.add(mesh);

      const jitter = new THREE.Vector3(
        (Math.random() - 0.5) * 2.2,
        (Math.random() - 0.5) * 1.8,
        (Math.random() - 0.5) * 2.2,
      );
      this.particles.push({
        mesh,
        vel: backDir.clone().multiplyScalar(7 + Math.random() * 5).add(jitter),
        gravity: 2,
        life: 0.18 + Math.random() * 0.14,
        maxLife: 0.32,
      });
    }
  }

  spawnDust(origin, count = 6) {
    for (let i = 0; i < count; i++) {
      const mat = new THREE.MeshBasicMaterial({
        color: '#8aa0b8',
        transparent: true,
        opacity: 0.36,
      });
      const mesh = new THREE.Mesh(this.particleGeo, mat);
      mesh.position.copy(origin);
      mesh.scale.set(1.4, 0.45, 1.4);
      this.scene.add(mesh);

      const ang = (i / count) * Math.PI * 2 + Math.random() * 0.5;
      this.particles.push({
        mesh,
        vel: new THREE.Vector3(Math.cos(ang) * 2.6, 0.8 + Math.random() * 0.8, Math.sin(ang) * 2.6),
        gravity: 2.5,
        life: 0.34,
        maxLife: 0.34,
      });
    }
  }

  spawnSparks(origin, colorHex = '#7cf7ff', count = 12, speed = 8) {
    for (let i = 0; i < count; i++) {
      const mat = new THREE.MeshBasicMaterial({
        color: colorHex,
        transparent: true,
        opacity: 0.95,
        blending: THREE.AdditiveBlending,
      });
      const mesh = new THREE.Mesh(this.particleGeo, mat);
      mesh.position.copy(origin);
      mesh.scale.setScalar(0.55 + Math.random() * 0.85);
      this.scene.add(mesh);

      this.particles.push({
        mesh,
        vel: new THREE.Vector3(
          (Math.random() - 0.5) * 2 * speed,
          (Math.random() * 0.85 + 0.15) * speed,
          (Math.random() - 0.5) * 2 * speed,
        ),
        gravity: 14,
        life: 0.35 + Math.random() * 0.28,
        maxLife: 0.63,
      });
    }
  }

  spawnDebris(origin, count = 18) {
    for (let i = 0; i < count; i++) {
      const mat = new THREE.MeshStandardMaterial({
        color: i % 3 === 0 ? '#2b3644' : '#6c7a89',
        roughness: 0.8,
        metalness: 0.25,
      });
      const mesh = new THREE.Mesh(this.particleGeo, mat);
      mesh.position
        .copy(origin)
        .add(new THREE.Vector3((Math.random() - 0.5) * 1.6, Math.random() * 1.4, (Math.random() - 0.5) * 1.6));
      mesh.scale.set(1.2 + Math.random() * 2.2, 0.8 + Math.random() * 1.8, 1.2 + Math.random() * 2.2);
      this.scene.add(mesh);

      this.particles.push({
        mesh,
        vel: new THREE.Vector3((Math.random() - 0.5) * 9, 3 + Math.random() * 7, (Math.random() - 0.5) * 9),
        gravity: 22,
        life: 1.0 + Math.random() * 0.6,
        maxLife: 1.6,
      });
    }
  }

  pushSaberTrailSample(rootPos, tipPos, active) {
    if (!active) {
      if (this.trailSamples.length > 0) {
        this.trailSamples.shift();
        this._syncTrailBuffer();
      }
      return;
    }
    this.trailSamples.push({ root: rootPos.clone(), tip: tipPos.clone() });
    if (this.trailSamples.length > this.maxTrailSamples) {
      this.trailSamples.shift();
    }
    this._syncTrailBuffer();
  }

  _syncTrailBuffer() {
    const n = this.trailSamples.length;
    if (n < 2) {
      this.trailGeo.setDrawRange(0, 0);
      return;
    }
    for (let i = 0; i < n; i++) {
      const s = this.trailSamples[i];
      const baseIdx = i * 6;
      this.trailPositions[baseIdx + 0] = s.root.x;
      this.trailPositions[baseIdx + 1] = s.root.y;
      this.trailPositions[baseIdx + 2] = s.root.z;
      this.trailPositions[baseIdx + 3] = s.tip.x;
      this.trailPositions[baseIdx + 4] = s.tip.y;
      this.trailPositions[baseIdx + 5] = s.tip.z;
    }
    this.trailGeo.attributes.position.needsUpdate = true;
    this.trailGeo.setDrawRange(0, (n - 1) * 6);
  }

  update(dt, onProjectileStep) {
    for (let i = this.projectiles.length - 1; i >= 0; i--) {
      const p = this.projectiles[i];
      p.life -= dt;
      const prev = p.mesh.position.clone();
      const stepDist = p.vel.length() * dt;
      p.traveled = (p.traveled || 0) + stepDist;
      p.mesh.position.addScaledVector(p.vel, dt);
      p.mesh.scale.z = Math.min(1, p.traveled / this.tracerLength);
      const hit = onProjectileStep ? onProjectileStep(prev, p.mesh.position, p.damage, p) : false;
      if (hit === 'reflect') {
        p.fromEnemy = false;
        p.vel.negate().multiplyScalar(1.85);
        p.life = 1.6;
        p.damage = 42;
        p.mesh.lookAt(p.mesh.position.clone().add(p.vel));
        continue;
      }
      if (hit || p.life <= 0 || p.mesh.position.y <= 0) {
        if (hit || p.mesh.position.y <= 0) {
          this.spawnImpactFlash(p.mesh.position);
        }
        this.scene.remove(p.mesh);
        p.mesh.material.dispose();
        this.projectiles.splice(i, 1);
      }
    }

    for (let i = this.particles.length - 1; i >= 0; i--) {
      const pt = this.particles[i];
      pt.life -= dt;
      pt.vel.y -= pt.gravity * dt;
      pt.mesh.position.addScaledVector(pt.vel, dt);
      if (pt.growRate) {
        pt.mesh.scale.addScalar(pt.growRate * dt);
      } else {
        pt.mesh.rotation.x += dt * 4;
        pt.mesh.rotation.y += dt * 5;
      }
      if (!pt.noBounce && pt.mesh.position.y < 0.05) {
        pt.mesh.position.y = 0.05;
        pt.vel.y *= -0.35;
        pt.vel.x *= 0.7;
        pt.vel.z *= 0.7;
      }
      if (pt.mesh.material.transparent) {
        pt.mesh.material.opacity = Math.max(0, pt.life / pt.maxLife) * (pt.noBounce ? 0.75 : 0.9);
      }
      if (pt.life <= 0) {
        this.scene.remove(pt.mesh);
        pt.mesh.material.dispose();
        this.particles.splice(i, 1);
      }
    }
  }
}
