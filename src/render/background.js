// =============================================================
//  背景描画 — 星空 / 星雲 / 月 / 都市スカイライン
//  静的レイヤーはオフスクリーンに事前描画して負荷を抑えます。
// =============================================================

import { TAU, mulberry32, clamp, lerp } from '../util.js';

export class Background {
  constructor() {
    this.w = 0; this.h = 0;
    this.starCanvas = null;
    this.skyCanvas = null;
    this.twinkle = [];     // 動的にきらめく星
    this.buildings = [];   // {x,w,h,topY,windows:[{x,y}]}
    this.time = 0;
    this.moon = { x: 0, y: 0, r: 0 };
  }

  resize(w, h) {
    this.w = w; this.h = h;
    this.moon = { x: w * 0.8, y: h * 0.22, r: Math.min(w, h) * 0.07 };
    this._buildSky();
    this._buildStars();
    this._buildCity();
  }

  _buildSky() {
    const { w, h } = this;
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    const x = c.getContext('2d');
    const g = x.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, '#070a1f');
    g.addColorStop(0.45, '#0c1233');
    g.addColorStop(0.8, '#161a40');
    g.addColorStop(1, '#241a44');
    x.fillStyle = g; x.fillRect(0, 0, w, h);

    // 星雲（ソフトな色の塊）
    const neb = [
      { x: w * 0.25, y: h * 0.3, r: w * 0.35, c: 'rgba(80,40,160,0.16)' },
      { x: w * 0.75, y: h * 0.2, r: w * 0.3, c: 'rgba(40,120,200,0.14)' },
      { x: w * 0.55, y: h * 0.55, r: w * 0.4, c: 'rgba(180,40,120,0.08)' },
    ];
    for (const n of neb) {
      const rg = x.createRadialGradient(n.x, n.y, 0, n.x, n.y, n.r);
      rg.addColorStop(0, n.c);
      rg.addColorStop(1, 'rgba(0,0,0,0)');
      x.fillStyle = rg; x.fillRect(0, 0, w, h);
    }
    this.skyCanvas = c;
  }

  _buildStars() {
    const { w, h } = this;
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    const x = c.getContext('2d');
    const rng = mulberry32(1337);
    const count = Math.floor((w * h) / 5200);
    for (let i = 0; i < count; i++) {
      const sx = rng() * w;
      const sy = rng() * h * 0.92;
      const r = rng() * 1.4 + 0.3;
      const a = rng() * 0.6 + 0.2;
      x.fillStyle = `rgba(255,255,255,${a})`;
      x.beginPath(); x.arc(sx, sy, r, 0, TAU); x.fill();
    }
    this.starCanvas = c;

    // 動的なきらめき星
    this.twinkle = [];
    const tcount = Math.floor(count * 0.06);
    for (let i = 0; i < tcount; i++) {
      this.twinkle.push({
        x: mulberry32(i * 7 + 3)() * w,
        y: mulberry32(i * 13 + 5)() * h * 0.85,
        r: 1 + mulberry32(i * 17 + 1)() * 1.8,
        phase: mulberry32(i * 23 + 9)() * TAU,
        speed: 0.8 + mulberry32(i * 29 + 2)() * 2.2,
      });
    }
  }

  _buildCity() {
    const { w, h } = this;
    const rng = mulberry32(98765);
    this.buildings = [];
    const baseY = h;
    let x = -20;
    while (x < w + 20) {
      const bw = 30 + rng() * 90;
      const bh = h * (0.10 + rng() * 0.26);
      const topY = baseY - bh;
      const windows = [];
      const cols = Math.max(1, Math.floor(bw / 16));
      const rows = Math.max(1, Math.floor(bh / 20));
      for (let cxi = 0; cxi < cols; cxi++) {
        for (let ryi = 0; ryi < rows; ryi++) {
          if (rng() < 0.5) continue;
          windows.push({
            x: x + 6 + cxi * 14,
            y: topY + 10 + ryi * 18,
            on: rng() < 0.72,
          });
        }
      }
      this.buildings.push({ x, w: bw, h: bh, topY, windows });
      x += bw + (2 + rng() * 10);
    }
  }

  update(dt) { this.time += dt; }

  // cityRatio: 都市HP割合(0..1) — 低いほど崩壊/炎上表現
  // stage: 2 のとき「第二夜」= 紅い月の夜（空と月が紅く染まる）
  draw(ctx, cityRatio, stage = 1) {
    const { w, h } = this;
    if (this.skyCanvas) ctx.drawImage(this.skyCanvas, 0, 0, w, h);

    // 第二夜: 空全体を紅く染める
    if (stage >= 2) {
      const tint = ctx.createLinearGradient(0, 0, 0, h);
      tint.addColorStop(0, 'rgba(150,20,45,0.22)');
      tint.addColorStop(0.6, 'rgba(120,15,40,0.14)');
      tint.addColorStop(1, 'rgba(90,10,30,0.1)');
      ctx.fillStyle = tint;
      ctx.fillRect(0, 0, w, h);
    }

    // 月（第二夜は紅い月）
    const m = this.moon;
    const mg = ctx.createRadialGradient(m.x, m.y, 0, m.x, m.y, m.r * 2.6);
    if (stage >= 2) {
      mg.addColorStop(0, 'rgba(255,120,110,0.95)');
      mg.addColorStop(0.25, 'rgba(255,90,90,0.45)');
      mg.addColorStop(1, 'rgba(255,60,80,0)');
    } else {
      mg.addColorStop(0, 'rgba(255,248,224,0.95)');
      mg.addColorStop(0.25, 'rgba(255,244,210,0.5)');
      mg.addColorStop(1, 'rgba(255,240,200,0)');
    }
    ctx.fillStyle = mg;
    ctx.beginPath(); ctx.arc(m.x, m.y, m.r * 2.6, 0, TAU); ctx.fill();
    ctx.fillStyle = stage >= 2 ? '#ffb3a8' : '#fff6dc';
    ctx.beginPath(); ctx.arc(m.x, m.y, m.r, 0, TAU); ctx.fill();

    if (this.starCanvas) ctx.drawImage(this.starCanvas, 0, 0, w, h);

    // きらめき
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (const t of this.twinkle) {
      const a = 0.35 + 0.45 * (0.5 + 0.5 * Math.sin(this.time * t.speed + t.phase));
      ctx.fillStyle = `rgba(200,224,255,${a})`;
      ctx.beginPath(); ctx.arc(t.x, t.y, t.r, 0, TAU); ctx.fill();
    }
    ctx.restore();

    this._drawCity(ctx, cityRatio);
  }

  _drawCity(ctx, cityRatio) {
    const { w, h } = this;
    const damage = 1 - clamp(cityRatio, 0, 1);

    // 街明かり（地平の光）
    const glow = ctx.createLinearGradient(0, h * 0.7, 0, h);
    const glowA = lerp(0.5, 0.12, damage);
    glow.addColorStop(0, 'rgba(60,90,180,0)');
    glow.addColorStop(1, `rgba(90,130,220,${glowA})`);
    ctx.fillStyle = glow;
    ctx.fillRect(0, h * 0.7, w, h * 0.3);

    // ビル群
    for (const b of this.buildings) {
      ctx.fillStyle = '#0a0d1e';
      ctx.fillRect(b.x, b.topY, b.w, b.h + 4);
      // 窓
      for (const win of b.windows) {
        if (!win.on) continue;
        // ダメージが大きいほど窓が消える
        if (damage > 0.3 && ((win.x * 13 + win.y * 7) % 100) / 100 < damage * 0.8) continue;
        const flick = 0.7 + 0.3 * Math.sin(this.time * 3 + win.x);
        ctx.fillStyle = `rgba(255,214,140,${0.6 * flick})`;
        ctx.fillRect(win.x, win.y, 3, 4);
      }
    }

    // 炎上表現（ダメージに応じて屋上に揺れる炎）
    if (damage > 0.25) {
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      const fires = Math.floor(damage * 10);
      for (let i = 0; i < fires; i++) {
        const b = this.buildings[(i * 7) % this.buildings.length];
        if (!b) continue;
        const fx = b.x + b.w * 0.5;
        const fy = b.topY;
        const flick = 0.6 + 0.4 * Math.sin(this.time * 9 + i);
        const r = (14 + 8 * flick) * (0.6 + damage);
        const fg = ctx.createRadialGradient(fx, fy, 0, fx, fy, r);
        fg.addColorStop(0, `rgba(255,180,60,${0.5 * flick})`);
        fg.addColorStop(0.5, `rgba(255,90,30,${0.3 * flick})`);
        fg.addColorStop(1, 'rgba(120,0,0,0)');
        ctx.fillStyle = fg;
        ctx.beginPath(); ctx.arc(fx, fy, r, 0, TAU); ctx.fill();
      }
      ctx.restore();
    }
  }
}
