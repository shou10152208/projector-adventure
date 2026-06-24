// =============================================================
//  ウェーブ進行 — WaveDirector
//  通常ウェーブ→クリア→小休止→次、最終はボス戦。
// =============================================================

import { CONFIG } from '../config.js';
import { T } from '../i18n.js';
import { clamp } from '../util.js';

const BOSS_WAVE = 6;

// ウェーブ定義（1始まり）。boss:true で最終決戦。
const WAVES = [
  null,
  { spawns: [{ type: 'meteor', count: 6, interval: 1.25, delay: 0.6 }] },
  { spawns: [
    { type: 'meteor', count: 8, interval: 1.0, delay: 0.3 },
    { type: 'drone', count: 1, interval: 1, delay: 3.5 },
  ] },
  { spawns: [
    { type: 'meteor', count: 8, interval: 0.9, delay: 0.3 },
    { type: 'drone', count: 2, interval: 3.5, delay: 2.5 },
    { type: 'splitter', count: 2, interval: 4, delay: 5 },
  ] },
  { spawns: [
    { type: 'meteor', count: 10, interval: 0.8, delay: 0.3 },
    { type: 'drone', count: 3, interval: 2.5, delay: 1.5 },
    { type: 'splitter', count: 3, interval: 3, delay: 3 },
  ] },
  { spawns: [
    { type: 'meteor', count: 12, interval: 0.7, delay: 0.3 },
    { type: 'drone', count: 4, interval: 2, delay: 1 },
    { type: 'splitter', count: 4, interval: 2.5, delay: 2 },
  ] },
  { boss: true },
];

export function getWave(n) {
  if (n < WAVES.length) return WAVES[n];
  // ボス以降のエンドレス（保険）
  const k = n - BOSS_WAVE;
  return { spawns: [
    { type: 'meteor', count: 10 + k * 2, interval: Math.max(0.4, 0.8 - k * 0.05), delay: 0.3 },
    { type: 'drone', count: 3 + k, interval: 2, delay: 1 },
    { type: 'splitter', count: 3 + k, interval: 2.4, delay: 2 },
  ] };
}

export class WaveDirector {
  constructor(world) {
    this.world = world;
    this.wave = 0;
    this.state = 'idle';
    this.timer = 0;
    this.schedule = [];
    this.scheduleIndex = 0;
    this.clock = 0;
    this.maxTime = 0;
  }

  start() { this.beginWave(1); }

  beginWave(n) {
    const w = this.world;
    this.wave = n;
    w.wave = n;
    w.speedScale = 1 + (n - 1) * 0.05;
    w.fireRateScale = clamp(1 - (n - 1) * 0.05, 0.6, 1);

    const def = getWave(n);
    if (def.boss) {
      this.state = 'bossIntro';
      this.timer = 2.6;
      w.setBanner(T.bossIncoming, T.bossWeakpoint, 2.6, '#ff6bd6');
      w.audio.bossRoar();
      return;
    }

    this.state = 'intro';
    this.timer = 1.8;
    w.setBanner(T.waveLabel(n), null, 1.8, '#bcd4ff');
    w.audio.waveStart();

    this.schedule = [];
    for (const g of def.spawns) {
      for (let i = 0; i < g.count; i++) {
        this.schedule.push({ t: (g.delay || 0) + i * g.interval, type: g.type });
      }
    }
    this.schedule.sort((a, b) => a.t - b.t);
    this.scheduleIndex = 0;
    this.clock = 0;
    this.maxTime = this.schedule.length ? this.schedule[this.schedule.length - 1].t : 0;
  }

  update(dt) {
    const w = this.world;
    switch (this.state) {
      case 'intro':
        this.timer -= dt;
        if (this.timer <= 0) this.state = 'spawning';
        break;

      case 'spawning':
        this.clock += dt;
        while (this.scheduleIndex < this.schedule.length &&
               this.schedule[this.scheduleIndex].t <= this.clock) {
          w.spawnEnemy(this.schedule[this.scheduleIndex].type);
          this.scheduleIndex++;
        }
        if (this.scheduleIndex >= this.schedule.length && this.clock > this.maxTime + 0.2) {
          this.state = 'clearing';
        }
        break;

      case 'clearing':
        if (w.enemies.length === 0) {
          this.state = 'breather';
          this.timer = 2.4;
          w.setBanner(T.waveClear, null, 1.8, '#8affc0');
          w.rebuildCity();
        }
        break;

      case 'breather':
        this.timer -= dt;
        if (this.timer <= 0) this.beginWave(this.wave + 1);
        break;

      case 'bossIntro':
        this.timer -= dt;
        if (this.timer <= 0) { w.spawnBoss(); this.state = 'boss'; }
        break;

      case 'boss':
        // 勝敗は world 側（onBossDefeated / cityHp）で処理
        break;
    }
  }
}
