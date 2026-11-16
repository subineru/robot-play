/**
 * Hybrid Adaptive BGM Player & Multi-Layer Electronic Sequencer (Layer 1 Client).
 *
 * Plays onto an isolated `musicBus` (bypassing urban SFX convolver & aggressive SFX compressor).
 * Supports:
 * - Zero-seam 16-bar procedural multi-voice synth tracks with adaptive combat intensity layers
 * - External `.ogg` / `.mp3` / `.wav` audio files (and local ObjectURL imports) via AudioBuffer / MediaElement
 * - Generation-token race protection & smooth crossfading across menu/combat/pause transitions
 */

function midiToHz(midi) {
  return 440 * Math.pow(2, (midi - 69) / 12);
}

// 4-bar chord progressions (MIDI root + chord intervals), stepped per bar over a 16-bar cycle (256 steps)
const SYNTH_SCORES = {
  // 92 BPM, D Minor — Armored Hangar: warm atmospheric pads, tactical sonar plucks, subtle pulse
  hangar_protocol: {
    bpm: 92,
    bars: 16,
    chords: [
      [50, 57, 60, 64, 69], // Dm9
      [46, 53, 57, 60, 65], // Bbmaj9
      [43, 50, 55, 58, 62], // Gm7
      [45, 52, 57, 61, 64], // A7
      [50, 57, 60, 65, 69], // Dm7
      [48, 55, 60, 64, 67], // C6
      [46, 53, 58, 62, 65], // Bbmaj7
      [45, 52, 57, 60, 64], // Am7
      [43, 50, 55, 58, 62], // Gm7
      [48, 55, 58, 62, 67], // C9sus4
      [41, 48, 53, 57, 60], // Fmaj7
      [46, 53, 57, 60, 62], // Bbmaj7#11
      [50, 57, 60, 64, 69], // Dm9
      [46, 53, 57, 62, 65], // Bbmaj7
      [45, 50, 55, 58, 64], // Gm/A
      [45, 52, 57, 61, 67], // A7alt
    ],
    bassRoots: [38, 34, 31, 33, 38, 36, 34, 33, 31, 36, 29, 34, 38, 34, 33, 33],
    arpPool: [
      [62, 65, 69, 72, 74, 72, 69, 65],
      [58, 62, 65, 69, 70, 69, 65, 62],
      [55, 58, 62, 65, 67, 65, 62, 58],
      [57, 61, 64, 67, 69, 67, 64, 61],
    ],
  },

  // 84 BPM, F# Minor — Orbital Telemetry: deep space minimalism, glassy echoes
  orbital_standby: {
    bpm: 84,
    bars: 16,
    chords: [
      [54, 61, 64, 68, 71], // F#m11
      [50, 57, 61, 64, 69], // Dmaj9
      [47, 54, 59, 62, 66], // Bm7
      [49, 56, 61, 64, 68], // C#m7
      [54, 61, 64, 69, 73], // F#m7
      [52, 59, 64, 68, 71], // Emaj6
      [50, 57, 61, 66, 69], // Dmaj7
      [49, 56, 61, 64, 67], // C#7sus
      [47, 54, 57, 62, 66], // Bm7
      [52, 59, 62, 66, 71], // E9sus
      [45, 52, 57, 61, 64], // Amaj7
      [50, 57, 61, 64, 68], // Dmaj7#11
      [54, 61, 64, 68, 73], // F#m9
      [50, 57, 61, 66, 69], // Dmaj7
      [47, 54, 59, 62, 68], // Bm9
      [49, 56, 60, 64, 68], // C#7
    ],
    bassRoots: [42, 38, 35, 37, 42, 40, 38, 37, 35, 40, 33, 38, 42, 38, 35, 37],
    arpPool: [
      [66, 69, 73, 76, 78, 76, 73, 69],
      [62, 66, 69, 73, 74, 73, 69, 66],
      [59, 62, 66, 69, 71, 69, 66, 62],
      [61, 64, 68, 71, 73, 71, 68, 64],
    ],
  },

  // 136 BPM, D Minor — Steel Velocity: tactical combat propulsion + high-tension minor lead
  steel_velocity: {
    bpm: 136,
    bars: 16,
    chords: [
      [50, 57, 62, 65], // Dm
      [48, 55, 60, 64], // C
      [46, 53, 58, 62], // Bb
      [45, 52, 57, 61], // A
      [50, 57, 62, 65], // Dm
      [53, 60, 65, 69], // F
      [43, 50, 55, 58], // Gm
      [45, 52, 57, 61], // A
      [46, 53, 58, 62], // Bb
      [48, 55, 60, 64], // C
      [50, 57, 62, 65], // Dm
      [50, 57, 60, 64], // Dm7/C
      [46, 53, 58, 62], // Bb
      [43, 50, 55, 58], // Gm
      [45, 52, 57, 60], // Am
      [45, 52, 57, 61], // A7
    ],
    bassRoots: [38, 36, 34, 33, 38, 41, 31, 33, 34, 36, 38, 36, 34, 31, 33, 33],
    leadPhrase: [
      74, 0, 77, 0, 81, 0, 79, 77, 76, 0, 74, 72, 74, 0, 69, 0,
      74, 0, 77, 0, 81, 0, 84, 81, 79, 0, 77, 76, 77, 0, 81, 0,
    ],
  },

  // 142 BPM, C Minor — Crimson Overdrive: industrial duel acid bass + double-kick urgency
  crimson_overdrive: {
    bpm: 142,
    bars: 16,
    chords: [
      [48, 55, 60, 63], // Cm
      [44, 51, 56, 60], // Ab
      [41, 48, 53, 56], // Fm
      [43, 50, 55, 59], // G
      [48, 55, 60, 63], // Cm
      [49, 56, 61, 65], // Db (Phrygian tension)
      [46, 53, 58, 62], // Bb
      [43, 50, 55, 59], // G7
      [44, 51, 56, 60], // Ab
      [46, 53, 58, 62], // Bb
      [48, 55, 60, 63], // Cm
      [48, 55, 58, 63], // Cm7
      [41, 48, 53, 56], // Fm
      [44, 51, 56, 60], // Ab
      [43, 50, 55, 58], // Gm
      [43, 50, 55, 59], // G7
    ],
    bassRoots: [36, 32, 29, 31, 36, 37, 34, 31, 32, 34, 36, 36, 29, 32, 31, 31],
    leadPhrase: [
      72, 75, 79, 0, 80, 79, 75, 0, 74, 75, 72, 0, 71, 74, 79, 0,
      72, 75, 79, 0, 84, 83, 79, 0, 80, 79, 77, 75, 74, 0, 79, 0,
    ],
  },
};

export class BgmPlayer {
  constructor(ctx, musicBus, { baseUrl = '', onTrackChange = null } = {}) {
    this.ctx = ctx;
    this.musicBus = musicBus;
    this.baseUrl = baseUrl;
    this.onTrackChange = onTrackChange;

    this.activeTrack = null;
    this.playGen = 0;
    this.adaptiveIntensity = 0.15;

    // Dedicated warm plate reverb + dotted-8th ping-pong delay isolated from gun SFX convolver
    this.dryBus = ctx.createGain();
    this.dryBus.gain.value = 1.0;
    this.dryBus.connect(this.musicBus);

    this.reverbSend = ctx.createGain();
    this.reverbSend.gain.value = 0.34;
    this.reverbConv = ctx.createConvolver();
    this.reverbConv.buffer = this._buildWarmPlateIR(1.45);
    this.reverbLp = ctx.createBiquadFilter();
    this.reverbLp.type = 'lowpass';
    this.reverbLp.frequency.value = 3400;
    this.reverbSend.connect(this.reverbConv).connect(this.reverbLp).connect(this.musicBus);

    this.delaySend = ctx.createGain();
    this.delaySend.gain.value = 0.22;
    this.delayNodeL = ctx.createDelay(1.2);
    this.delayNodeR = ctx.createDelay(1.2);
    this.delayNodeL.delayTime.value = 0.32;
    this.delayNodeR.delayTime.value = 0.48;
    const fbL = ctx.createGain();
    const fbR = ctx.createGain();
    fbL.gain.value = 0.28;
    fbR.gain.value = 0.28;
    const delayLp = ctx.createBiquadFilter();
    delayLp.type = 'lowpass';
    delayLp.frequency.value = 2300;
    this.delaySend.connect(this.delayNodeL);
    this.delayNodeL.connect(fbL).connect(this.delayNodeR);
    this.delayNodeR.connect(fbR).connect(this.delayNodeL);
    if (typeof ctx.createStereoPanner === 'function') {
      const panL = ctx.createStereoPanner();
      const panR = ctx.createStereoPanner();
      panL.pan.value = -0.55;
      panR.pan.value = 0.55;
      this.delayNodeL.connect(panL).connect(delayLp);
      this.delayNodeR.connect(panR).connect(delayLp);
    } else {
      this.delayNodeL.connect(delayLp);
      this.delayNodeR.connect(delayLp);
    }
    delayLp.connect(this.musicBus);

    // Sequencer & AudioBuffer playback state
    this.synthGain = null;
    this.synthTimer = null;
    this.synthScore = null;
    this.synthStep = 0;
    this.nextStepTime = 0;

    this.bufferCache = new Map();
    this.activeFileHandle = null;
  }

  _buildWarmPlateIR(seconds = 1.45) {
    const len = Math.floor(this.ctx.sampleRate * seconds);
    const buf = this.ctx.createBuffer(2, len, this.ctx.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const data = buf.getChannelData(ch);
      let lp = 0;
      for (let i = 0; i < len; i++) {
        const decay = Math.pow(1 - i / len, 2.7);
        const white = Math.random() * 2 - 1;
        lp = lp * 0.72 + white * 0.28;
        data[i] = lp * decay * 0.26;
      }
    }
    return buf;
  }

  setAdaptiveIntensity(intensity01 = 0) {
    this.adaptiveIntensity = Math.max(0, Math.min(1, Number(intensity01) || 0));
  }

  _stopCurrentSources(fadeSec = 0.55) {
    const now = this.ctx.currentTime;

    if (this.synthTimer) {
      clearInterval(this.synthTimer);
      this.synthTimer = null;
    }
    this.synthScore = null;

    if (this.synthGain) {
      const oldG = this.synthGain;
      this.synthGain = null;
      try {
        oldG.gain.cancelScheduledValues(now);
        oldG.gain.setValueAtTime(Math.max(0.0001, oldG.gain.value), now);
        oldG.gain.linearRampToValueAtTime(0.0001, now + fadeSec);
        setTimeout(() => {
          try {
            oldG.disconnect();
          } catch {
            // ignore
          }
        }, Math.ceil((fadeSec + 0.1) * 1000));
      } catch {
        // ignore
      }
    }

    if (this.activeFileHandle) {
      const handle = this.activeFileHandle;
      this.activeFileHandle = null;
      try {
        handle.gain.gain.cancelScheduledValues(now);
        handle.gain.gain.setValueAtTime(Math.max(0.0001, handle.gain.gain.value), now);
        handle.gain.gain.linearRampToValueAtTime(0.0001, now + fadeSec);
      } catch {
        // ignore
      }
      setTimeout(() => {
        try {
          handle.source?.stop?.();
        } catch {
          // ignore
        }
        try {
          handle.audioEl?.pause?.();
          if (handle.audioEl) handle.audioEl.src = '';
        } catch {
          // ignore
        }
        try {
          handle.gain?.disconnect?.();
        } catch {
          // ignore
        }
      }, Math.ceil((fadeSec + 0.08) * 1000));
    }
  }

  stop(fadeSec = 0.45) {
    this.playGen += 1;
    this.activeTrack = null;
    this._stopCurrentSources(fadeSec);
    this.onTrackChange?.(null);
  }

  async playTrack(track, { fadeSec = 0.65, forceRestart = false } = {}) {
    if (!track) {
      this.stop(fadeSec);
      return;
    }
    if (!forceRestart && this.activeTrack?.id === track.id) {
      return;
    }

    const gen = ++this.playGen;
    this.activeTrack = track;
    this._stopCurrentSources(fadeSec);
    this.onTrackChange?.(track);

    if (this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {});
    }

    if (track.type === 'file') {
      await this._startFileTrack(track, gen, fadeSec);
      return;
    }
    this._startSynthScore(track, gen, fadeSec);
  }

  async _startFileTrack(track, gen, fadeSec) {
    const url = /^https?:|^blob:|^data:|^\//.test(track.url)
      ? track.url
      : `${this.baseUrl}${track.url}`;

    let buf = this.bufferCache.get(url) || null;
    if (!buf && typeof fetch === 'function') {
      try {
        const res = await fetch(url);
        if (res.ok) {
          const arr = await res.arrayBuffer();
          if (gen !== this.playGen) return;
          buf = await this.ctx.decodeAudioData(arr);
          if (gen !== this.playGen) return;
          if (this.bufferCache.size >= 4) {
            const firstKey = this.bufferCache.keys().next().value;
            this.bufferCache.delete(firstKey);
          }
          this.bufferCache.set(url, buf);
        }
      } catch {
        buf = null;
      }
    }

    if (gen !== this.playGen) return;

    const now = this.ctx.currentTime;
    const gNode = this.ctx.createGain();
    gNode.gain.setValueAtTime(0.0001, now);
    gNode.gain.linearRampToValueAtTime(0.95, now + Math.max(0.08, fadeSec));
    gNode.connect(this.dryBus);

    if (buf) {
      const src = this.ctx.createBufferSource();
      src.buffer = buf;
      src.loop = true;
      src.connect(gNode);
      src.start(now);
      this.activeFileHandle = { source: src, gain: gNode };
      return;
    }

    // Streaming Audio element fallback for local ObjectURLs or large formats
    if (typeof Audio === 'function') {
      const audioEl = new Audio();
      audioEl.src = url;
      audioEl.loop = true;
      audioEl.crossOrigin = 'anonymous';
      try {
        const mediaSrc = this.ctx.createMediaElementSource(audioEl);
        mediaSrc.connect(gNode);
        this.activeFileHandle = { audioEl, gain: gNode };
        audioEl.play().catch(() => {});
      } catch {
        gNode.disconnect();
      }
    }
  }

  _startSynthScore(track, gen, fadeSec) {
    if (gen !== this.playGen) return;
    const score = SYNTH_SCORES[track.synthScoreId || track.id] || SYNTH_SCORES.hangar_protocol;
    const now = this.ctx.currentTime;

    const stepSec = 60 / score.bpm / 4;
    const dotted8th = Math.min(1.0, stepSec * 3);
    this.delayNodeL.delayTime.setTargetAtTime(dotted8th, now, 0.05);
    this.delayNodeR.delayTime.setTargetAtTime(Math.min(1.0, dotted8th * 1.333), now, 0.05);

    const gNode = this.ctx.createGain();
    gNode.gain.setValueAtTime(0.0001, now);
    gNode.gain.linearRampToValueAtTime(1.0, now + Math.max(0.08, fadeSec));
    gNode.connect(this.dryBus);
    gNode.connect(this.reverbSend);

    this.synthGain = gNode;
    this.synthScore = { ...score, id: track.synthScoreId || track.id };
    this.synthStep = 0;
    this.nextStepTime = now + 0.06;

    const lookaheadSec = 0.14;
    this.synthTimer = setInterval(() => {
      if (gen !== this.playGen || !this.synthScore || !this.synthGain) return;
      if (this.ctx.state !== 'running') return;
      const horizon = this.ctx.currentTime + lookaheadSec;
      let guard = 0;
      while (this.nextStepTime < horizon && guard < 12) {
        this._scheduleStep(this.synthScore, this.synthStep, this.nextStepTime, stepSec, this.synthGain);
        this.nextStepTime += stepSec;
        this.synthStep = (this.synthStep + 1) % (this.synthScore.bars * 16);
        guard += 1;
      }
    }, 28);
  }

  _scheduleStep(score, step, time, stepSec, bus) {
    const bar = Math.floor(step / 16);
    const s = step % 16;
    const chord = score.chords[bar % score.chords.length];
    const bassMidi = score.bassRoots[bar % score.bassRoots.length];
    const inten = this.adaptiveIntensity;

    if (score.id === 'hangar_protocol' || score.id === 'orbital_standby') {
      // Bar downbeat: wide atmospheric 3-voice analog pad
      if (s === 0) {
        this._voicePad(bus, chord, stepSec * 16, 0.13, score.id === 'orbital_standby' ? 920 : 1080);
        this._voiceBass(bus, midiToHz(bassMidi), stepSec * 7.5, 0.22, 0.2);
      }
      if (s === 8) {
        this._voiceBass(bus, midiToHz(bassMidi + (bar % 4 === 3 ? 7 : 0)), stepSec * 7.2, 0.16, 0.16);
      }
      // Subtle heartbeat kick + soft brushed hats in phrase bars 4..15
      if (bar >= 4 && (s === 0 || (s === 8 && score.id === 'hangar_protocol') || (s === 10 && bar >= 8))) {
        this._voiceKick(bus, s === 0 ? 0.26 : 0.16, 0.2);
      }
      if (bar >= 4 && s % 2 === 0 && score.id === 'hangar_protocol') {
        this._voiceHat(bus, s % 4 === 2 ? 0.045 : 0.02, false);
      }
      if (bar >= 8 && (s === 4 || s === 12)) {
        this._voiceSnare(bus, 0.075);
      }
      // Tactical radar pluck arpeggio across dotted space
      const arp = score.arpPool[bar % score.arpPool.length];
      if ((bar >= 2 && s % 3 === 0) || (bar >= 8 && s === 14)) {
        const note = arp[(bar + s) % arp.length];
        this._voicePluck(bus, midiToHz(note), stepSec * 2.2, score.id === 'orbital_standby' ? 0.095 : 0.11, 0.28);
      }
      return;
    }

    // Combat scores: `steel_velocity` & `crimson_overdrive`
    const isCrimson = score.id === 'crimson_overdrive';
    const isFillBar = bar % 4 === 3 && s >= 12;

    // 1. Driving Drum Kit
    if (s === 0 || s === 8 || (isCrimson && (s === 3 || s === 10)) || (!isCrimson && s === 10 && bar >= 4)) {
      this._voiceKick(bus, s === 0 ? 0.42 : 0.34, isCrimson ? 0.72 : 0.55);
    }
    if (s === 4 || s === 12 || (isFillBar && (s === 14 || s === 15))) {
      this._voiceSnare(bus, isFillBar ? 0.24 : 0.28);
    } else if (isCrimson && (s === 7 || s === 15)) {
      this._voiceSnare(bus, 0.11); // syncopated ghost hit
    }
    if (bar >= 1) {
      const openHat = s === 2 || s === 6 || s === 10 || s === 14;
      const hatGain = openHat ? 0.085 : 0.036;
      this._voiceHat(bus, hatGain * (0.75 + inten * 0.4), openHat && s === 14);
    }

    // 2. Rolling 16th-note Sub/Acid Bassline
    const bassPattern = isCrimson
      ? [1, 0, 1, 1, 0, 1, 1, 0, 1, 0, 1, 1, 0, 1, 1, 1]
      : [1, 0, 1, 0, 1, 1, 0, 1, 1, 0, 1, 0, 1, 1, 1, 0];
    if (bassPattern[s]) {
      const octaveBoost = s === 2 || s === 7 || s === 11 || s === 14 ? 12 : 0;
      const accent = s === 0 || s === 6 || s === 12 ? 0.34 : 0.24;
      this._voiceBass(bus, midiToHz(bassMidi + octaveBoost), stepSec * 0.92, accent, 0.35 + inten * 0.55);
    }

    // 3. Harmonic Stabs / Supporting Pad
    if (s === 0) {
      this._voicePad(bus, chord, stepSec * 14.5, 0.095 + inten * 0.04, 1150 + inten * 900);
    }
    if (bar >= 4 && (s === 0 || s === 3 || s === 6 || s === 10 || s === 12)) {
      const stabIdx = (s + bar) % chord.length;
      this._voicePluck(bus, midiToHz(chord[stabIdx] + 12), stepSec * 1.35, 0.09 + inten * 0.05, 0.45 + inten * 0.45);
    }

    // 4. Adaptive Climax Lead Melody (unlocks smoothly when ACS rises / Duel intensifies / Bars 8-15)
    const leadUnlocked = inten >= 0.42 || bar >= 8;
    if (leadUnlocked && score.leadPhrase && s % 2 === 0) {
      const phraseIdx = (bar * 8 + s / 2) % score.leadPhrase.length;
      const leadMidi = score.leadPhrase[phraseIdx];
      if (leadMidi > 0) {
        const gate = inten >= 0.42 ? 0.65 + inten * 0.35 : 0.52;
        this._voiceLead(bus, midiToHz(leadMidi), stepSec * 1.85, 0.11 * gate, inten);
      }
    }
  }

  _voiceKick(bus, gain, punch = 0.5) {
    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(132 + punch * 26, t);
    osc.frequency.exponentialRampToValueAtTime(43, t + 0.095);
    g.gain.setValueAtTime(Math.max(0.001, gain), t);
    g.gain.exponentialRampToValueAtTime(0.0008, t + 0.18);
    osc.connect(g).connect(bus);
    osc.start(t);
    osc.stop(t + 0.19);
  }

  _voiceSnare(bus, gain) {
    const t = this.ctx.currentTime;
    const dur = 0.14;
    const len = Math.floor(this.ctx.sampleRate * dur);
    const nBuf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const ch = nBuf.getChannelData(0);
    for (let i = 0; i < len; i++) {
      ch[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 2.2);
    }
    const nSrc = this.ctx.createBufferSource();
    nSrc.buffer = nBuf;
    const bp = this.ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 1850;
    bp.Q.value = 0.9;
    const ng = this.ctx.createGain();
    ng.gain.setValueAtTime(gain, t);
    ng.gain.exponentialRampToValueAtTime(0.001, t + dur);
    nSrc.connect(bp).connect(ng).connect(bus);
    nSrc.start(t);

    const body = this.ctx.createOscillator();
    const bg = this.ctx.createGain();
    body.type = 'triangle';
    body.frequency.setValueAtTime(192, t);
    body.frequency.exponentialRampToValueAtTime(118, t + 0.06);
    bg.gain.setValueAtTime(gain * 0.55, t);
    bg.gain.exponentialRampToValueAtTime(0.001, t + 0.075);
    body.connect(bg).connect(bus);
    body.start(t);
    body.stop(t + 0.08);
  }

  _voiceHat(bus, gain, open = false) {
    const t = this.ctx.currentTime;
    const dur = open ? 0.13 : 0.036;
    const len = Math.floor(this.ctx.sampleRate * dur);
    const nBuf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const ch = nBuf.getChannelData(0);
    for (let i = 0; i < len; i++) {
      ch[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, open ? 1.7 : 3.0);
    }
    const nSrc = this.ctx.createBufferSource();
    nSrc.buffer = nBuf;
    const hp = this.ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 7400;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.0008, t + dur);
    nSrc.connect(hp).connect(g).connect(bus);
    nSrc.start(t);
  }

  _voiceBass(bus, freq, dur, gain, bright = 0.4) {
    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const sub = this.ctx.createOscillator();
    const lp = this.ctx.createBiquadFilter();
    const g = this.ctx.createGain();

    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(freq, t);
    sub.type = 'sine';
    sub.frequency.setValueAtTime(freq, t);

    lp.type = 'lowpass';
    const peakCut = Math.min(3400, freq * 2.4 + bright * 1450);
    lp.frequency.setValueAtTime(peakCut, t);
    lp.frequency.exponentialRampToValueAtTime(Math.max(110, freq * 1.4), t + dur * 0.85);
    lp.Q.value = 2.6;

    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(gain, t + 0.005);
    g.gain.setValueAtTime(gain * 0.86, t + dur * 0.6);
    g.gain.exponentialRampToValueAtTime(0.0008, t + dur);

    osc.connect(lp).connect(g);
    sub.connect(g);
    g.connect(bus);

    osc.start(t);
    sub.start(t);
    osc.stop(t + dur + 0.02);
    sub.stop(t + dur + 0.02);
  }

  _voicePad(bus, midiNotes, dur, gain, cutoff = 1050) {
    const t = this.ctx.currentTime;
    const total = dur + 0.45;
    const lp = this.ctx.createBiquadFilter();
    const g = this.ctx.createGain();

    lp.type = 'lowpass';
    lp.frequency.setValueAtTime(cutoff * 0.78, t);
    lp.frequency.linearRampToValueAtTime(cutoff * 1.12, t + dur * 0.55);
    lp.frequency.linearRampToValueAtTime(cutoff * 0.82, t + total);
    lp.Q.value = 0.8;

    const perVoice = gain / Math.max(1, midiNotes.length);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(perVoice, t + Math.min(0.65, dur * 0.25));
    g.gain.setValueAtTime(perVoice * 0.9, t + dur * 0.78);
    g.gain.exponentialRampToValueAtTime(0.0008, t + total);

    lp.connect(g).connect(bus);

    const detunes = [-7, 7];
    midiNotes.forEach((m, idx) => {
      const osc = this.ctx.createOscillator();
      osc.type = idx === 0 ? 'triangle' : 'sawtooth';
      osc.frequency.setValueAtTime(midiToHz(m), t);
      osc.detune.setValueAtTime(detunes[idx % detunes.length], t);
      osc.connect(lp);
      osc.start(t);
      osc.stop(t + total + 0.03);
    });
  }

  _voicePluck(bus, freq, dur, gain, bright = 0.45) {
    const t = this.ctx.currentTime;
    const oscA = this.ctx.createOscillator();
    const oscB = this.ctx.createOscillator();
    const lp = this.ctx.createBiquadFilter();
    const g = this.ctx.createGain();

    oscA.type = 'triangle';
    oscB.type = 'sawtooth';
    oscA.frequency.setValueAtTime(freq, t);
    oscB.frequency.setValueAtTime(freq, t);
    oscB.detune.setValueAtTime(8, t);

    lp.type = 'lowpass';
    lp.frequency.setValueAtTime(Math.min(5800, 1200 + bright * 3400), t);
    lp.frequency.exponentialRampToValueAtTime(Math.max(380, freq * 1.2), t + dur);
    lp.Q.value = 1.6;

    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(gain, t + 0.006);
    g.gain.exponentialRampToValueAtTime(0.0008, t + dur);

    oscA.connect(lp);
    oscB.connect(lp);
    lp.connect(g);
    g.connect(bus);
    g.connect(this.delaySend);

    oscA.start(t);
    oscB.start(t);
    oscA.stop(t + dur + 0.02);
    oscB.stop(t + dur + 0.02);
  }

  _voiceLead(bus, freq, dur, gain, intensity = 0.6) {
    const t = this.ctx.currentTime;
    const osc1 = this.ctx.createOscillator();
    const osc2 = this.ctx.createOscillator();
    const lp = this.ctx.createBiquadFilter();
    const g = this.ctx.createGain();

    osc1.type = 'sawtooth';
    osc2.type = 'sawtooth';
    osc1.frequency.setValueAtTime(freq, t);
    osc2.frequency.setValueAtTime(freq, t);
    osc1.detune.setValueAtTime(-6, t);
    osc2.detune.setValueAtTime(6, t);

    lp.type = 'lowpass';
    lp.frequency.setValueAtTime(1900 + intensity * 2600, t);
    lp.frequency.exponentialRampToValueAtTime(1100, t + dur);
    lp.Q.value = 1.3;

    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(gain, t + 0.015);
    g.gain.setValueAtTime(gain * 0.8, t + dur * 0.72);
    g.gain.exponentialRampToValueAtTime(0.0008, t + dur);

    osc1.connect(lp);
    osc2.connect(lp);
    lp.connect(g);
    g.connect(bus);
    g.connect(this.delaySend);

    osc1.start(t);
    osc2.start(t);
    osc1.stop(t + dur + 0.02);
    osc2.stop(t + dur + 0.02);
  }
}
