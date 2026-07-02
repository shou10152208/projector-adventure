// =============================================================
//  World — ゲーム状態 / 当たり判定 / スコア / 必殺技 / 状態遷移
//  入力(players) と 演出(particles/audio) を受け取り、毎フレーム更新。
// =============================================================

import { CONFIG } from '../config.js';
import { T } from '../i18n.js';
import { clamp, dist, approach, range, chance } from '../util.js';
import { Meteor, Drone, Splitter, Armor, Bomber, StarPickup, Shockwave, Boss } from './entities.js';
import { WaveDirector } from './waves.js';

export class World {
  constructor(particles, audio) {
    this.particles = particles;
    this.audio = audio;
    this.w = 1280; this.h = 720;
    this.cityLineY = this.h * 0.84;

    this.phase = 'title'; // title | playing | gameover | victory
    this.enemies = [];
    this.shockwaves = [];
    this.pickups = [];
    this.floatTexts = [];
    this.boss = null;
    this.stage = 1;             // 1 = 第一夜, 2 = 第二夜（紅い月）
    this._armorHintShown = false;

    this.score = 0;
    this.cityMaxHp = CONFIG.city.maxHp;
    this.cityHp = this.cityMaxHp;

    this.combo = 0;
    this.comboMult = 1;
    this.comboTimer = 0;

    this.gauge = 0;
    this.gaugeMax = CONFIG.ultimate.gaugeMax;
    this.ultActive = false;
    this.ultTimer = 0;
    this.timeScale = 1;

    this.shake = 0;
    this.screenFlash = null;
    this.banner = null;

    this.wave = 0;
    this.speedScale = 1;
    this.fireRateScale = 1;

    this.players = [];
    this.guardianCount = 0;

    this.director = new WaveDirector(this);
    this._startRequested = false;
    this.resultLock = 0;
    this._killSounds = 0;
  }

  resize(w, h) {
    this.w = w; this.h = h;
    this.cityLineY = h * 0.84;
  }

  // ---------- 状態遷移 ----------
  reset() {
    this.enemies.length = 0;
    this.shockwaves.length = 0;
    this.pickups.length = 0;
    this.floatTexts.length = 0;
    this.boss = null;
    this.stage = 1;
    this._armorHintShown = false;
    this.score = 0;
    this.cityHp = this.cityMaxHp;
    this.combo = 0; this.comboMult = 1; this.comboTimer = 0;
    this.gauge = 0; this.ultActive = false; this.ultTimer = 0; this.timeScale = 1;
    this.shake = 0; this.screenFlash = null; this.banner = null;
    this.wave = 0; this.speedScale = 1; this.fireRateScale = 1;
    this.particles.clear();
  }

  startGame() {
    this.reset();
    this.phase = 'playing';
    this.director.start();
  }

  toTitle() { this.phase = 'title'; this.banner = null; }

  requestStart() { this._startRequested = true; }

  // ---------- 毎フレーム ----------
  update(dt, players) {
    this.players = players;
    this.guardianCount = players.reduce((n, p) => n + (p.active ? 1 : 0), 0);

    // タイムスケール（必殺技スローモー）
    if (this.ultActive) { this.ultTimer -= dt; if (this.ultTimer <= 0) this.ultActive = false; }
    const targetTs = this.ultActive ? CONFIG.ultimate.slowmo : 1;
    this.timeScale = approach(this.timeScale, targetTs, 4 * dt);
    const sdt = dt * this.timeScale;

    // 演出の減衰（実時間）
    this.shake = Math.max(0, this.shake - 60 * dt);
    if (this.screenFlash) { this.screenFlash.life -= dt; if (this.screenFlash.life <= 0) this.screenFlash = null; }
    if (this.banner) { this.banner.time -= dt; if (this.banner.time <= 0) this.banner = null; }
    if (this.resultLock > 0) this.resultLock -= dt;
    this._killSounds = 0;

    // フロートテキスト（実時間）
    for (let i = this.floatTexts.length - 1; i >= 0; i--) {
      const f = this.floatTexts[i];
      f.life -= dt; f.y += f.vy * dt;
      if (f.life <= 0) this.floatTexts.splice(i, 1);
    }

    if (this.phase === 'title') {
      this._updateTitle(players);
      this.particles.update(dt);
      return;
    }
    if (this.phase === 'gameover' || this.phase === 'victory') {
      this._maybeRestart(players);
      this.particles.update(dt);
      return;
    }

    // ---- playing ----
    this.director.update(sdt);

    if (this.comboTimer > 0) {
      this.comboTimer -= sdt;
      if (this.comboTimer <= 0) { this.combo = 0; this.comboMult = 1; }
    }

    // プレイヤーのジェスチャー（カメラ）
    for (const p of players) {
      if (!p.active) continue;
      if (p.gestures.clapEdge) this.triggerClapAt(p.center.x, p.center.y, p.color, p.colorRgb);
      if (p.gestures.armsRaisedEdge && this.gauge >= this.gaugeMax) this.triggerUltimate();
    }

    // 手と敵の当たり判定
    this._handleHandCollisions(sdt, players);

    // アイテム（星のかけら）の回収
    this._collectPickups(players);

    // 更新
    for (const e of this.enemies) e.update(sdt, this);
    if (this.boss && this.boss.alive) this.boss.update(sdt, this);
    for (const s of this.shockwaves) s.update(sdt, this);
    for (const pk of this.pickups) pk.update(sdt, this);

    // 後始末
    if (this.enemies.some((e) => !e.alive)) this.enemies = this.enemies.filter((e) => e.alive);
    if (this.shockwaves.some((s) => !s.alive)) this.shockwaves = this.shockwaves.filter((s) => s.alive);
    if (this.pickups.some((p) => !p.alive)) this.pickups = this.pickups.filter((p) => p.alive);

    this.particles.update(sdt);

    if (this.cityHp <= 0) this._gameOver();
  }

  _updateTitle(players) {
    for (const p of players) {
      if (p.active && p.gestures.armsRaisedEdge) { this.startGame(); return; }
    }
    if (this._startRequested) { this._startRequested = false; this.startGame(); }
  }

  _maybeRestart(players) {
    if (this.resultLock > 0) { this._startRequested = false; return; }
    for (const p of players) {
      if (p.active && p.gestures.armsRaisedEdge) { this.startGame(); return; }
    }
    if (this._startRequested) { this._startRequested = false; this.startGame(); }
  }

  // ---------- 当たり判定 ----------
  _handleHandCollisions(sdt, players) {
    const C = CONFIG.combat;
    for (const p of players) {
      if (!p.active) continue;
      for (const key of ['left', 'right']) {
        const hand = p.hands[key];
        if (!hand.present) continue;
        const speed = Math.min(hand.speed, C.speedCap);
        const cont = (C.contactBaseDps + speed * C.speedDamageK) * sdt;
        const canSlash = hand.speed > C.slashSpeed && hand.hitCd <= 0;
        let slashed = false;
        const info = { colorRgb: p.colorRgb, color: p.color, playerId: p.id };

        for (const e of this.enemies) {
          if (!e.alive) continue;
          if (dist(hand.x, hand.y, e.x, e.y) < e.radius + hand.radius) {
            e.takeDamage(cont, this, { ...info, silent: true });
            if (e.alive && canSlash && !slashed) {
              const imp = Math.min(hand.speed * C.slashImpulseK, C.slashImpulseMax);
              e.takeDamage(imp, this, { ...info, x: e.x, y: e.y });
              slashed = true;
            }
          }
        }

        if (this.boss && this.boss.alive && !this.boss.entering) {
          const b = this.boss;
          if (dist(hand.x, hand.y, b.x, b.y) < b.radius + hand.radius) {
            b.takeDamage(cont, this, { ...info, silent: true });
            if (canSlash && !slashed) {
              const imp = Math.min(hand.speed * C.slashImpulseK, C.slashImpulseMax);
              b.takeDamage(imp, this, { ...info, x: hand.x, y: hand.y });
              slashed = true;
            }
          }
        }

        if (slashed) {
          hand.hitCd = C.handHitCooldown;
          this.particles.slashTrail(hand.x, hand.y, hand.vx, hand.vy, p.colorRgb);
          this.audio.slash();
        }
      }
    }
  }

  // ---------- スコア / コンボ / ゲージ ----------
  onEnemyKilled(e, info) {
    this.combo++;
    this.comboTimer = CONFIG.combo.window;
    this.comboMult = clamp(1 + Math.floor(this.combo / 4), 1, CONFIG.combo.maxMultiplier);
    const pts = Math.round(e.score * this.comboMult);
    this.addScore(pts);
    this.gauge = Math.min(this.gaugeMax, this.gauge + CONFIG.ultimate.gainPerKill);
    this.addFloatText(e.x, e.y, `+${pts}`, info.color || '#ffffff');
    this.audio.charge();

    // 星のかけらドロップ（弾・小破片は落とさない）
    if (e.type !== 'shot' && e.type !== 'shard' && chance(CONFIG.pickup.dropChance)) {
      this.pickups.push(new StarPickup(e.x, e.y));
    }
  }

  onBossDefeated() {
    // 第一夜ボス（星喰イ）撃破 → 第二夜へ。第二夜ボス（月喰イ）撃破 → 勝利。
    if (this.boss && this.boss.tier === 2) this._victory();
    else this._beginStage2();
  }

  _beginStage2() {
    if (this.phase !== 'playing') return;
    this.stage = 2;
    this.cityHp = Math.min(this.cityMaxHp, this.cityHp + CONFIG.city.rebuildOnStage);
    this.setBanner(T.stage2Banner, T.stage2Sub, 3.4, '#ff8a9a');
    this.audio.victory();
    for (let i = 0; i < 40; i++) {
      this.particles.starfall(range(0, this.w), range(-40, this.h * 0.4), '255,150,150');
    }
    this.director.beginStageBreak(7, 4.0);
  }

  // ---------- アイテム回収 ----------
  _collectPickups(players) {
    if (!this.pickups.length) return;
    const c = CONFIG.pickup;
    for (const pk of this.pickups) {
      if (!pk.alive) continue;
      outer:
      for (const p of players) {
        if (!p.active) continue;
        for (const key of ['left', 'right']) {
          const hand = p.hands[key];
          if (!hand.present) continue;
          if (dist(hand.x, hand.y, pk.x, pk.y) < pk.radius + hand.radius) {
            pk.alive = false;
            this.addGauge(c.gaugeGain);
            this.cityHp = Math.min(this.cityMaxHp, this.cityHp + c.cityHeal);
            this.addScore(c.score);
            this.addFloatText(pk.x, pk.y, T.pickupText, '#ffe06b');
            this.audio.pickup();
            for (let i = 0; i < 8; i++) {
              this.particles.spark(pk.x, pk.y, '255,224,120', {
                vx: range(-220, 220), vy: range(-220, 220), life: range(0.3, 0.5),
              });
            }
            break outer;
          }
        }
      }
    }
  }

  addScore(n) { this.score += n; }

  addGauge(amt) {
    if (this.ultActive) return;
    this.gauge = clamp(this.gauge + amt, 0, this.gaugeMax);
  }

  addShake(a) { this.shake = Math.min(this.shake + a, 44); }

  flashScreen(color, life) { this.screenFlash = { color, life, maxLife: life }; }

  setBanner(text, sub, time, color) { this.banner = { text, sub, time, maxTime: time, color }; }

  addFloatText(x, y, text, color) {
    const S = Math.min(this.w, this.h);
    this.floatTexts.push({ x, y, vy: -S * 0.06, life: 1.0, maxLife: 1.0, text, color, size: S * 0.03 });
  }

  rebuildCity() {
    this.cityHp = Math.min(this.cityMaxHp, this.cityHp + CONFIG.city.rebuildOnWave);
  }

  playExplosionSound(size) {
    if (this._killSounds < 3) { this.audio.explosion(size); this._killSounds++; }
  }

  // ---------- 都市ダメージ ----------
  damageCity(amount) {
    this.cityHp = Math.max(0, this.cityHp - amount);
    this.combo = 0; this.comboMult = 1;
    this.audio.cityHit();
    this.addShake(14);
    this.flashScreen('#ff3355', 0.25);
  }

  // ---------- 拍手の衝撃波 ----------
  triggerClapAt(x, y, color, rgb) {
    this.shockwaves.push(new Shockwave(x, y, color, rgb));
    this.audio.clap();
    this.addShake(6);
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * Math.PI * 2;
      this.particles.spark(x, y, rgb || '255,255,255', {
        vx: Math.cos(a) * 320, vy: Math.sin(a) * 320, life: 0.4,
      });
    }
  }

  // ---------- 必殺技：星の雨 ----------
  triggerUltimate() {
    if (this.gauge < this.gaugeMax || this.ultActive) return;
    this.ultActive = true;
    this.ultTimer = CONFIG.ultimate.duration;
    this.gauge = 0;
    this.audio.ultimate();
    this.addShake(34);
    this.flashScreen('#ffffff', 0.5);

    // 画面全体に星屑
    for (let i = 0; i < 120; i++) {
      this.particles.starfall(range(0, this.w), range(-40, this.h * 0.5), '255,230,150');
    }

    // 通常敵を一掃しつつスコア加算
    let bonus = 0;
    for (const e of this.enemies) {
      if (!e.alive) continue;
      bonus += e.score;
      e.alive = false;
      this.particles.explosion(e.x, e.y, e.rgb, (e.explosionSize || 0.8) * 1.2);
    }
    if (this.boss && this.boss.alive && !this.boss.entering) {
      this.boss.takeDamage(CONFIG.ultimate.bossDamage, this, { x: this.boss.x, y: this.boss.coreY() });
    }
    if (bonus > 0) {
      this.addScore(bonus);
      this.addFloatText(this.w * 0.5, this.h * 0.4, '星の雨！', '#ffe06b');
    }
  }

  // ---------- スポーン ----------
  spawnEnemy(type) {
    const x = range(this.w * 0.08, this.w * 0.92);
    const sp = CONFIG.enemies[type].speed;
    const speed = range(sp[0], sp[1]) * this.speedScale;
    let e;
    if (type === 'drone') e = new Drone(x, -40, speed);
    else if (type === 'splitter') e = new Splitter(x, -40, speed);
    else if (type === 'armor') e = new Armor(x, -40, speed);
    else if (type === 'bomber') e = new Bomber(x, -40, speed);
    else e = new Meteor(x, -40, speed);
    this.enemies.push(e);

    // 初めてのよろい岩には倒し方のヒントを出す
    if (type === 'armor' && !this._armorHintShown) {
      this._armorHintShown = true;
      if (!this.banner) this.setBanner(T.armorHint, null, 2.4, '#bcd4ff');
    }
  }

  spawnBoss(tier = 1) { this.boss = new Boss(this, tier); }

  // ---------- 終了 ----------
  _gameOver() {
    if (this.phase !== 'playing') return;
    this.phase = 'gameover';
    this.resultLock = 1.6;
    this.banner = null;
    this.addShake(40);
    this.flashScreen('#ff3355', 0.6);
    this.audio.defeat();
  }

  _victory() {
    if (this.phase !== 'playing') return;
    this.phase = 'victory';
    this.resultLock = 2.0;
    this.banner = null;
    this.audio.victory();
    for (let i = 0; i < 60; i++) {
      this.particles.starfall(range(0, this.w), range(-40, this.h * 0.4), '180,230,255');
    }
  }
}
