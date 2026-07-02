// =============================================================
//  オーディオエンジン（Web Audio API・完全プロシージャル）
//  外部音源ファイル不要。すべて合成音で生成します。
// =============================================================

import { CONFIG } from './config.js';
import { clamp } from './util.js';

export class AudioEngine {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.musicGain = null;
    this.sfxGain = null;
    this.muted = false;
    this.started = false;
    this._musicTimer = 0;
    this._chordIndex = 0;
    this._noiseBuffer = null;
  }

  // ユーザー操作後に呼ぶ（ブラウザの自動再生制限対策）
  resume() {
    try {
      if (!this.ctx) this._build();
      if (this.ctx.state === 'suspended') this.ctx.resume();
      this.started = true;
    } catch (e) {
      console.warn('[audio] resume failed', e);
    }
  }

  _build() {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    this.ctx = new Ctx();
    const a = CONFIG.audio;

    this.master = this.ctx.createGain();
    this.master.gain.value = this.muted ? 0 : a.masterVolume;
    this.master.connect(this.ctx.destination);

    // やわらかなマスターコンプ/リミッター代わり
    this.musicGain = this.ctx.createGain();
    this.musicGain.gain.value = a.musicVolume;
    this.musicGain.connect(this.master);

    this.sfxGain = this.ctx.createGain();
    this.sfxGain.gain.value = a.sfxVolume;
    this.sfxGain.connect(this.master);

    // ノイズバッファ（爆発・打撃用）
    const len = this.ctx.sampleRate * 1.0;
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    this._noiseBuffer = buf;
  }

  setMuted(m) {
    this.muted = m;
    if (this.master) this.master.gain.value = m ? 0 : CONFIG.audio.masterVolume;
  }
  toggleMute() { this.setMuted(!this.muted); return this.muted; }

  get now() { return this.ctx ? this.ctx.currentTime : 0; }
  get ok() { return this.started && this.ctx; }

  // --- 低レベル: 音色 ---
  _tone(freq, dur, type = 'sine', gain = 0.5, dest = null, detune = 0) {
    if (!this.ok) return;
    const t = this.now;
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    o.detune.value = detune;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, gain), t + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g);
    g.connect(dest || this.sfxGain);
    o.start(t);
    o.stop(t + dur + 0.05);
  }

  _sweep(f0, f1, dur, type = 'sawtooth', gain = 0.4, dest = null) {
    if (!this.ok) return;
    const t = this.now;
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(f0, t);
    o.frequency.exponentialRampToValueAtTime(Math.max(1, f1), t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g);
    g.connect(dest || this.sfxGain);
    o.start(t);
    o.stop(t + dur + 0.05);
  }

  _noise(dur, gain = 0.5, filterFreq = 1200, type = 'lowpass', dest = null) {
    if (!this.ok) return;
    const t = this.now;
    const src = this.ctx.createBufferSource();
    src.buffer = this._noiseBuffer;
    const f = this.ctx.createBiquadFilter();
    f.type = type;
    f.frequency.setValueAtTime(filterFreq, t);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f); f.connect(g); g.connect(dest || this.sfxGain);
    src.start(t);
    src.stop(t + dur + 0.02);
  }

  // --- 効果音 ---
  hit(strength = 0.5) {
    // 流星をはじく軽い高音 + ノイズ
    const base = 600 + strength * 700;
    this._tone(base, 0.12, 'triangle', 0.22 + strength * 0.2);
    this._noise(0.07, 0.12 + strength * 0.18, 2600, 'bandpass');
  }

  slash() {
    this._sweep(1800, 320, 0.16, 'sawtooth', 0.16);
    this._noise(0.09, 0.14, 3200, 'highpass');
  }

  explosion(size = 0.6) {
    this._noise(0.5 + size * 0.4, 0.5 + size * 0.3, 900 - size * 300, 'lowpass');
    this._tone(120 - size * 40, 0.5 + size * 0.3, 'sine', 0.4 + size * 0.2);
    this._sweep(420, 60, 0.4, 'square', 0.16);
  }

  cityHit() {
    this._tone(70, 0.5, 'sine', 0.5);
    this._noise(0.3, 0.4, 500, 'lowpass');
    this._sweep(260, 50, 0.3, 'sawtooth', 0.2);
  }

  clap() {
    this._noise(0.12, 0.5, 1800, 'bandpass');
    this._sweep(900, 200, 0.25, 'triangle', 0.25);
    this._tone(180, 0.3, 'sine', 0.3);
  }

  charge() {
    // ゲージ加算時の小気味よい上昇音
    this._tone(520 + Math.random() * 60, 0.08, 'sine', 0.12);
  }

  pickup() {
    // 星のかけら回収のきらめき
    this._tone(1046.5, 0.14, 'triangle', 0.2);
    setTimeout(() => this._tone(1568, 0.2, 'sine', 0.14), 60);
  }

  ultimate() {
    // 星の雨 発動
    this._sweep(200, 1400, 0.5, 'sawtooth', 0.3, this.master);
    this._chord([523.25, 659.25, 783.99, 1046.5], 1.6, 'triangle', 0.18);
    setTimeout(() => this.explosion(1), 180);
  }

  bossRoar() {
    this._sweep(180, 40, 1.2, 'sawtooth', 0.4);
    this._tone(55, 1.4, 'sine', 0.5);
    this._noise(1.0, 0.3, 700, 'lowpass');
  }

  waveStart() {
    const notes = [523.25, 659.25, 783.99];
    notes.forEach((n, i) => setTimeout(() => this._tone(n, 0.3, 'triangle', 0.22), i * 90));
  }

  victory() {
    const notes = [523.25, 659.25, 783.99, 1046.5, 1318.5];
    notes.forEach((n, i) => setTimeout(() => this._tone(n, 0.6, 'triangle', 0.25), i * 140));
  }

  defeat() {
    const notes = [392, 311.13, 261.63, 196];
    notes.forEach((n, i) => setTimeout(() => this._tone(n, 0.7, 'sine', 0.28), i * 220));
  }

  select() { this._tone(880, 0.08, 'square', 0.15); }

  _chord(freqs, dur, type = 'sine', gain = 0.15) {
    freqs.forEach((f) => this._tone(f, dur, type, gain, this.musicGain));
  }

  // --- アンビエント音楽（ゆっくり変化するパッド）---
  // 毎フレーム update を呼ぶ
  updateMusic(dt, intensity = 0) {
    if (!this.ok || this.muted) return;
    this._musicTimer -= dt;
    if (this._musicTimer <= 0) {
      // 強度に応じてテンポを上げる
      this._musicTimer = clamp(4.5 - intensity * 2.6, 1.2, 4.5);
      const progressions = [
        [130.81, 196.0, 261.63],   // C
        [146.83, 220.0, 293.66],   // D
        [110.0, 164.81, 220.0],    // A
        [123.47, 185.0, 246.94],   // B
      ];
      const ch = progressions[this._chordIndex % progressions.length];
      this._chordIndex++;
      ch.forEach((f, i) => {
        this._padNote(f, this._musicTimer * 1.4, i === 0 ? 0.1 : 0.06, intensity);
      });
    }
  }

  _padNote(freq, dur, gain, intensity) {
    if (!this.ok) return;
    const t = this.now;
    const o = this.ctx.createOscillator();
    const o2 = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    const f = this.ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = 600 + intensity * 1400;
    o.type = 'sawtooth'; o2.type = 'sawtooth';
    o.frequency.value = freq; o2.frequency.value = freq;
    o2.detune.value = 8;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(gain, t + dur * 0.4);
    g.gain.linearRampToValueAtTime(0.0001, t + dur);
    o.connect(f); o2.connect(f); f.connect(g); g.connect(this.musicGain);
    o.start(t); o2.start(t);
    o.stop(t + dur + 0.1); o2.stop(t + dur + 0.1);
  }
}
