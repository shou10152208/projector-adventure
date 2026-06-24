// =============================================================
//  敵・弾・ボス・衝撃波エンティティ
//  各エンティティは update(dt, world) と draw(ctx, world) を持つ。
//  ダメージは takeDamage(amount, world, info) で受ける。
// =============================================================

import { CONFIG } from '../config.js';
import { TAU, clamp, range, approach, dist } from '../util.js';

// ---- 敵基底クラス ----
export class Enemy {
  constructor(type, x, y) {
    const c = CONFIG.enemies[type];
    this.type = type;
    this.x = x; this.y = y;
    this.radius = c.radius;
    this.hp = c.hp;
    this.maxHp = c.hp;
    this.score = c.score;
    this.cityDamage = c.cityDamage;
    this.alive = true;
    this.vx = 0; this.vy = 0;
    this.driftX = 0; this.fallSpeed = 0;
    this.ease = 6;
    this.rot = range(0, TAU);
    this.spin = 0;
    this.flash = 0;
    this.t = 0;
    this.rgb = '255,255,255';
  }

  takeDamage(amount, world, info = {}) {
    if (!this.alive) return;
    this.hp -= amount;
    this.flash = 0.09;
    world.addGauge(amount * CONFIG.ultimate.gainPerDamage);
    if (!info.silent) {
      const rgb = info.colorRgb || this.rgb;
      for (let i = 0; i < 3; i++) {
        world.particles.spark(info.x ?? this.x, info.y ?? this.y, rgb, {
          vx: range(-160, 160), vy: range(-160, 160), life: range(0.2, 0.4),
        });
      }
    }
    if (this.hp <= 0) this._die(world, info);
  }

  _die(world, info) {
    this.alive = false;
    world.particles.explosion(this.x, this.y, this.rgb, this.explosionSize || 1);
    world.playExplosionSound(this.explosionSize || 0.6);
    if (this.onDeath) this.onDeath(world);
    if (!info.fromUlt) world.onEnemyKilled(this, info);
  }

  reachCity(world) {
    if (!this.alive) return;
    this.alive = false;
    world.damageCity(this.cityDamage);
    world.particles.explosion(this.x, world.cityLineY, '255,120,60', 0.7);
    world.addShake(8);
  }

  update(dt, world) {
    this.t += dt;
    this.flash = Math.max(0, this.flash - dt);
    if (this.behavior) this.behavior(dt, world);
    this.vx = approach(this.vx, this.driftX, this.ease * 60 * dt);
    this.vy = approach(this.vy, this.fallSpeed, this.ease * 60 * dt);
    this.x += this.vx * dt;
    this.y += this.vy * dt;
    this.rot += this.spin * dt;
    if (this.afterMove) this.afterMove(dt, world);
    if (this.y > world.cityLineY) this.reachCity(world);
  }

  knockback(nx, ny, force) {
    this.vx += nx * force;
    this.vy += ny * force;
  }

  _flashOverlay(ctx) {
    if (this.flash > 0) {
      ctx.globalCompositeOperation = 'lighter';
      ctx.fillStyle = `rgba(255,255,255,${this.flash * 6})`;
      ctx.beginPath(); ctx.arc(this.x, this.y, this.radius, 0, TAU); ctx.fill();
      ctx.globalCompositeOperation = 'source-over';
    }
  }
}

// ---- 流星 ----
export class Meteor extends Enemy {
  constructor(x, y, speed) {
    super('meteor', x, y);
    this.fallSpeed = speed;
    this.driftX = range(-30, 30);
    this.spin = range(-2, 2);
    this.rgb = '255,150,70';
    this.explosionSize = 1;
  }
  afterMove(dt, world) {
    if (Math.random() < 0.6) {
      world.particles.glow(this.x - this.vx * 0.02, this.y - this.vy * 0.02, '255,140,50', {
        size: range(6, 12), life: range(0.2, 0.4), vy: -this.vy * 0.1,
      });
    }
  }
  draw(ctx) {
    ctx.save();
    // 尾
    ctx.globalCompositeOperation = 'lighter';
    const tg = ctx.createLinearGradient(this.x, this.y, this.x - this.vx * 0.12, this.y - this.vy * 0.12);
    tg.addColorStop(0, `rgba(${this.rgb},0.7)`);
    tg.addColorStop(1, `rgba(${this.rgb},0)`);
    ctx.strokeStyle = tg; ctx.lineWidth = this.radius * 1.3; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(this.x, this.y);
    ctx.lineTo(this.x - this.vx * 0.12, this.y - this.vy * 0.12); ctx.stroke();
    // 本体グロー
    const g = ctx.createRadialGradient(this.x, this.y, 0, this.x, this.y, this.radius * 1.6);
    g.addColorStop(0, 'rgba(255,240,200,0.95)');
    g.addColorStop(0.4, `rgba(${this.rgb},0.8)`);
    g.addColorStop(1, `rgba(${this.rgb},0)`);
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(this.x, this.y, this.radius * 1.6, 0, TAU); ctx.fill();
    ctx.globalCompositeOperation = 'source-over';
    // 岩核
    ctx.translate(this.x, this.y); ctx.rotate(this.rot);
    ctx.fillStyle = '#3a2418';
    ctx.beginPath();
    for (let i = 0; i < 7; i++) {
      const a = (i / 7) * TAU;
      const rr = this.radius * (0.7 + ((i * 13) % 5) / 10);
      ctx[i ? 'lineTo' : 'moveTo'](Math.cos(a) * rr, Math.sin(a) * rr);
    }
    ctx.closePath(); ctx.fill();
    ctx.translate(-this.x, -this.y);
    this._flashOverlay(ctx);
    ctx.restore();
  }
}

// ---- 小破片（分裂で発生）----
export class Shard extends Meteor {
  constructor(x, y, speed) {
    super(x, y, speed);
    const c = CONFIG.enemies.shard;
    this.type = 'shard';
    this.radius = c.radius; this.hp = c.hp; this.maxHp = c.hp;
    this.score = c.score; this.cityDamage = c.cityDamage;
    this.fallSpeed = speed;
    this.rgb = '255,180,90';
    this.explosionSize = 0.6;
  }
}

// ---- 分裂体 ----
export class Splitter extends Meteor {
  constructor(x, y, speed) {
    super(x, y, speed);
    const c = CONFIG.enemies.splitter;
    this.type = 'splitter';
    this.radius = c.radius; this.hp = c.hp; this.maxHp = c.hp;
    this.score = c.score; this.cityDamage = c.cityDamage;
    this.fallSpeed = speed;
    this.splits = c.splits;
    this.rgb = '200,130,255';
    this.explosionSize = 1.1;
  }
  onDeath(world) {
    for (let i = 0; i < this.splits; i++) {
      const a = -Math.PI / 2 + range(-0.9, 0.9);
      const sp = range(120, 190);
      const sh = new Shard(this.x, this.y, CONFIG.enemies.shard.speed[0]);
      sh.vx = Math.cos(a) * sp; sh.vy = Math.abs(Math.sin(a) * sp) + 40;
      sh.driftX = range(-40, 40);
      world.enemies.push(sh);
    }
  }
  draw(ctx) {
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    const g = ctx.createRadialGradient(this.x, this.y, 0, this.x, this.y, this.radius * 1.7);
    g.addColorStop(0, 'rgba(240,220,255,0.9)');
    g.addColorStop(0.4, `rgba(${this.rgb},0.7)`);
    g.addColorStop(1, `rgba(${this.rgb},0)`);
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(this.x, this.y, this.radius * 1.7, 0, TAU); ctx.fill();
    ctx.globalCompositeOperation = 'source-over';
    ctx.translate(this.x, this.y); ctx.rotate(this.rot);
    ctx.fillStyle = '#2a183a';
    ctx.beginPath();
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * TAU;
      ctx[i ? 'lineTo' : 'moveTo'](Math.cos(a) * this.radius, Math.sin(a) * this.radius);
    }
    ctx.closePath(); ctx.fill();
    // 内部コア（分裂の予兆）
    ctx.fillStyle = `rgba(${this.rgb},0.9)`;
    ctx.beginPath(); ctx.arc(0, 0, this.radius * 0.4, 0, TAU); ctx.fill();
    ctx.translate(-this.x, -this.y);
    this._flashOverlay(ctx);
    ctx.restore();
  }
}

// ---- 侵略ドローン ----
export class Drone extends Enemy {
  constructor(x, y, speed) {
    super('drone', x, y);
    this.fallSpeed = speed;
    this.baseX = x;
    this.weaveAmp = range(60, 160);
    this.weaveFreq = range(1.2, 2.2);
    this.ease = 4;
    this.rgb = '120,200,255';
    this.explosionSize = 1.2;
    const fe = CONFIG.enemies.drone.fireEvery;
    this.fireTimer = range(fe[0], fe[1]);
  }
  behavior(dt) {
    this.driftX = Math.cos(this.t * this.weaveFreq) * this.weaveAmp * this.weaveFreq;
  }
  afterMove(dt, world) {
    this.fireTimer -= dt;
    if (this.fireTimer <= 0 && this.y > 40 && this.y < world.cityLineY - 80) {
      const fe = CONFIG.enemies.drone.fireEvery;
      this.fireTimer = range(fe[0], fe[1]) * world.fireRateScale;
      const shot = new EnemyShot(this.x, this.y + this.radius, 0, CONFIG.enemies.shot.speed);
      world.enemies.push(shot);
      world.audio.hit(0.2);
    }
  }
  draw(ctx) {
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    const g = ctx.createRadialGradient(this.x, this.y, 0, this.x, this.y, this.radius * 1.8);
    g.addColorStop(0, `rgba(${this.rgb},0.5)`);
    g.addColorStop(1, `rgba(${this.rgb},0)`);
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(this.x, this.y, this.radius * 1.8, 0, TAU); ctx.fill();
    ctx.globalCompositeOperation = 'source-over';
    ctx.translate(this.x, this.y);
    // 機体（ダイヤ型）
    const r = this.radius;
    ctx.fillStyle = '#0e2236';
    ctx.strokeStyle = `rgba(${this.rgb},0.9)`;
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.moveTo(0, -r); ctx.lineTo(r, 0); ctx.lineTo(0, r); ctx.lineTo(-r, 0); ctx.closePath();
    ctx.fill(); ctx.stroke();
    // 目（コア）
    const pulse = 0.6 + 0.4 * Math.sin(this.t * 6);
    ctx.fillStyle = `rgba(255,80,120,${pulse})`;
    ctx.beginPath(); ctx.arc(0, 0, r * 0.32, 0, TAU); ctx.fill();
    // 翼の光
    ctx.fillStyle = `rgba(${this.rgb},0.8)`;
    ctx.fillRect(-r * 1.3, -2, r * 0.5, 4);
    ctx.fillRect(r * 0.8, -2, r * 0.5, 4);
    ctx.translate(-this.x, -this.y);
    this._flashOverlay(ctx);
    ctx.restore();
  }
}

// ---- 敵弾（はじき返し可能）----
export class EnemyShot extends Enemy {
  constructor(x, y, vx, speed) {
    super('shot', x, y);
    this.vx = vx; this.vy = speed;
    this.driftX = vx; this.fallSpeed = speed;
    this.ease = 0.5;
    this.rgb = '255,90,120';
    this.explosionSize = 0.4;
  }
  draw(ctx) {
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    const g = ctx.createRadialGradient(this.x, this.y, 0, this.x, this.y, this.radius * 2.2);
    g.addColorStop(0, 'rgba(255,255,255,0.95)');
    g.addColorStop(0.4, `rgba(${this.rgb},0.85)`);
    g.addColorStop(1, `rgba(${this.rgb},0)`);
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(this.x, this.y, this.radius * 2.2, 0, TAU); ctx.fill();
    ctx.restore();
  }
}

// ---- 拍手の衝撃波（プレイヤー側）----
export class Shockwave {
  constructor(x, y, color, rgb) {
    this.x = x; this.y = y;
    this.r = 10;
    this.maxR = CONFIG.combat.clapRadius;
    this.speed = 900;
    this.color = color;
    this.rgb = rgb || '255,255,255';
    this.alive = true;
    this.hitSet = new Set();
    this.damage = CONFIG.combat.clapDamage;
  }
  update(dt, world) {
    this.r += this.speed * dt;
    if (this.r >= this.maxR) { this.alive = false; return; }
    const band = 46;
    const checkHit = (e) => {
      if (!e.alive || this.hitSet.has(e)) return;
      const d = dist(this.x, this.y, e.x, e.y);
      if (d < this.r + band && d > this.r - band) {
        this.hitSet.add(e);
        const nx = (e.x - this.x) / (d || 1);
        const ny = (e.y - this.y) / (d || 1);
        e.knockback(nx, ny, CONFIG.combat.clapKnockback);
        const info = { colorRgb: this.rgb, x: e.x, y: e.y, color: this.color };
        if (e.takeDamage) e.takeDamage(this.damage, world, info);
      }
    };
    for (const e of world.enemies) checkHit(e);
    if (world.boss && world.boss.alive) {
      const b = world.boss;
      const d = dist(this.x, this.y, b.x, b.y);
      if (!this.hitSet.has(b) && d < this.r + band + b.radius && d > this.r - band - b.radius) {
        this.hitSet.add(b);
        b.takeDamage(this.damage, world, { colorRgb: this.rgb, x: this.x, y: this.y });
      }
    }
  }
  draw(ctx) {
    const a = clamp(1 - this.r / this.maxR, 0, 1);
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.strokeStyle = `rgba(${this.rgb},${a})`;
    ctx.lineWidth = 8 * a + 2;
    ctx.beginPath(); ctx.arc(this.x, this.y, this.r, 0, TAU); ctx.stroke();
    ctx.strokeStyle = `rgba(255,255,255,${a * 0.6})`;
    ctx.lineWidth = 3 * a;
    ctx.beginPath(); ctx.arc(this.x, this.y, this.r * 0.92, 0, TAU); ctx.stroke();
    ctx.restore();
  }
}

// ---- ボス 星喰イ ----
export class Boss {
  constructor(world) {
    const c = CONFIG.boss;
    this.world = world;
    this.x = world.w * 0.5;
    this.y = -c.radius;
    this.targetY = world.h * 0.2;
    this.radius = c.radius;
    this.coreRadius = c.coreRadius;
    this.phases = c.phases;
    this.phase = 0;
    this.hpPerPhase = c.hpPerPhase;
    this.hp = c.hpPerPhase;
    this.maxHpTotal = c.hpPerPhase * c.phases;
    this.score = c.score;
    this.alive = true;
    this.entering = true;
    this.enterT = 0;
    this.t = 0;
    this.flash = 0;
    this.stun = 0;
    this.rgb = '255,80,200';
    this.spitTimer = 2.5;
    this.summonTimer = 5;
    this.swirl = 0;
    this.defeated = false;
  }

  get hpTotal() { return this.hp + this.hpPerPhase * (this.phases - 1 - this.phase); }

  takeDamage(amount, world, info = {}) {
    if (!this.alive || this.entering) return;
    let amt = amount;
    if (info.x != null) {
      const d = dist(info.x, info.y, this.x, this.coreY());
      if (d < this.coreRadius) amt *= 1.9; // 核ヒットで大ダメージ
    }
    this.hp -= amt;
    this.flash = 0.08;
    world.addGauge(amt * CONFIG.ultimate.gainPerDamage);
    if (!info.silent) {
      const rgb = info.colorRgb || '255,200,120';
      for (let i = 0; i < 4; i++)
        world.particles.spark(info.x ?? this.x, info.y ?? this.coreY(), rgb, {
          vx: range(-200, 200), vy: range(-200, 200), life: range(0.2, 0.5),
        });
    }
    if (this.hp <= 0) this._nextPhase(world);
  }

  coreY() { return this.y + Math.sin(this.t * 1.5) * 8; }

  _nextPhase(world) {
    this.phase++;
    world.particles.explosion(this.x, this.y, this.rgb, 2.4);
    world.addShake(26);
    if (this.phase >= this.phases) {
      this._defeat(world);
    } else {
      this.hp = this.hpPerPhase;
      this.stun = 1.4;
      world.audio.bossRoar();
      world.flashScreen('#ff66cc', 0.4);
      // フェーズ移行時にミニオン放出
      for (let i = 0; i < 3 + this.phase * 2; i++) {
        const mx = range(world.w * 0.2, world.w * 0.8);
        world.enemies.push(new Meteor(mx, range(-40, 40), range(120, 180)));
      }
    }
  }

  _defeat(world) {
    this.alive = false;
    this.defeated = true;
    world.addScore(this.score);
    world.addFloatText(this.x, this.y, `+${this.score.toLocaleString('ja-JP')}`, '#ffe06b');
    for (let i = 0; i < 8; i++)
      setTimeout(() => world.particles.explosion(
        this.x + range(-this.radius, this.radius),
        this.y + range(-this.radius, this.radius), this.rgb, 2), i * 90);
    world.audio.bossRoar();
    world.onBossDefeated();
  }

  update(dt, world) {
    this.t += dt;
    this.flash = Math.max(0, this.flash - dt);
    this.swirl += dt * 0.8;
    if (this.entering) {
      this.enterT += dt;
      this.y = -this.radius + (this.targetY + this.radius) * clamp(this.enterT / CONFIG.boss.enterTime, 0, 1);
      if (this.enterT >= CONFIG.boss.enterTime) { this.entering = false; world.audio.bossRoar(); }
      return;
    }
    // ゆらゆら横移動
    this.x = world.w * 0.5 + Math.sin(this.t * 0.5) * world.w * 0.18;
    this.y = this.targetY + Math.sin(this.t * 0.8) * 18;

    if (this.stun > 0) { this.stun -= dt; return; }

    const phaseIdx = clamp(this.phase, 0, this.phases - 1);
    // 弾の吐き出し
    this.spitTimer -= dt;
    if (this.spitTimer <= 0) {
      this.spitTimer = CONFIG.boss.spitEvery[Math.min(phaseIdx, CONFIG.boss.spitEvery.length - 1)];
      const count = CONFIG.boss.spitCount[Math.min(phaseIdx, CONFIG.boss.spitCount.length - 1)];
      const spread = 1.1;
      for (let i = 0; i < count; i++) {
        const a = Math.PI / 2 + (i / (count - 1) - 0.5) * spread;
        const sp = CONFIG.enemies.shot.speed * 1.1;
        const shot = new EnemyShot(this.x, this.y + this.radius * 0.4, Math.cos(a) * sp, Math.sin(a) * sp);
        world.enemies.push(shot);
      }
      world.audio.hit(0.4);
    }
    // ミニオン召喚
    this.summonTimer -= dt;
    if (this.summonTimer <= 0) {
      this.summonTimer = CONFIG.boss.summonEvery[Math.min(phaseIdx, CONFIG.boss.summonEvery.length - 1)];
      const mx = range(world.w * 0.15, world.w * 0.85);
      if (Math.random() < 0.5) world.enemies.push(new Drone(mx, range(-40, 0), range(40, 70)));
      else world.enemies.push(new Meteor(mx, range(-40, 0), range(90, 140)));
    }
  }

  draw(ctx, world) {
    const { x, y, radius } = this;
    ctx.save();
    // 外側オーラ
    ctx.globalCompositeOperation = 'lighter';
    const aura = ctx.createRadialGradient(x, y, radius * 0.3, x, y, radius * 2.2);
    aura.addColorStop(0, `rgba(${this.rgb},0.4)`);
    aura.addColorStop(1, `rgba(${this.rgb},0)`);
    ctx.fillStyle = aura;
    ctx.beginPath(); ctx.arc(x, y, radius * 2.2, 0, TAU); ctx.fill();

    // 渦巻く触手アーク
    ctx.strokeStyle = `rgba(${this.rgb},0.5)`;
    for (let i = 0; i < 6; i++) {
      const a0 = this.swirl + (i / 6) * TAU;
      ctx.lineWidth = 6;
      ctx.beginPath();
      for (let s = 0; s <= 1; s += 0.1) {
        const ang = a0 + s * 2.5;
        const rr = radius * (1 + s * 0.9);
        const px = x + Math.cos(ang) * rr;
        const py = y + Math.sin(ang) * rr;
        s === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py);
      }
      ctx.stroke();
    }
    ctx.globalCompositeOperation = 'source-over';

    // 本体
    const bodyGrad = ctx.createRadialGradient(x, y - radius * 0.3, radius * 0.2, x, y, radius);
    bodyGrad.addColorStop(0, '#3a0d33');
    bodyGrad.addColorStop(1, '#0c0210');
    ctx.fillStyle = bodyGrad;
    ctx.beginPath(); ctx.arc(x, y, radius, 0, TAU); ctx.fill();

    // 口（マウス）
    ctx.fillStyle = '#120010';
    ctx.beginPath();
    ctx.ellipse(x, y + radius * 0.35, radius * 0.55, radius * 0.28, 0, 0, TAU); ctx.fill();
    ctx.fillStyle = `rgba(${this.rgb},${0.6 + 0.4 * Math.sin(this.t * 4)})`;
    ctx.beginPath();
    ctx.ellipse(x, y + radius * 0.35, radius * 0.4, radius * 0.16, 0, 0, TAU); ctx.fill();

    // 核（弱点）
    const cy = this.coreY();
    const corePulse = 0.7 + 0.3 * Math.sin(this.t * 5);
    const cg = ctx.createRadialGradient(x, cy, 0, x, cy, this.coreRadius);
    cg.addColorStop(0, `rgba(255,255,255,${corePulse})`);
    cg.addColorStop(0.4, `rgba(255,210,120,${corePulse})`);
    cg.addColorStop(1, 'rgba(255,120,40,0)');
    ctx.fillStyle = cg;
    ctx.beginPath(); ctx.arc(x, cy, this.coreRadius, 0, TAU); ctx.fill();

    if (this.flash > 0) {
      ctx.globalCompositeOperation = 'lighter';
      ctx.fillStyle = `rgba(255,255,255,${this.flash * 5})`;
      ctx.beginPath(); ctx.arc(x, y, radius, 0, TAU); ctx.fill();
    }

    // 入場中のシルエット
    if (this.stun > 0) {
      ctx.globalCompositeOperation = 'source-over';
      ctx.fillStyle = `rgba(255,255,255,${0.2 * (this.stun)})`;
      ctx.beginPath(); ctx.arc(x, y, radius, 0, TAU); ctx.fill();
    }
    ctx.restore();
  }
}
