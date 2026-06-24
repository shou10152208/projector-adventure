// =============================================================
//  HUD / UI 描画 — スコア・都市HP・ゲージ・バナー・タイトル・結果
// =============================================================

import { CONFIG } from '../config.js';
import { T } from '../i18n.js';
import { clamp, TAU } from '../util.js';

const FONT = '"Yu Gothic", "Hiragino Kaku Gothic ProN", "Noto Sans JP", "Meiryo", sans-serif';

export class Hud {
  constructor() { this.time = 0; }

  draw(ctx, world, info, dt) {
    this.time += dt;
    const { w, h } = world;
    if (world.phase === 'playing') this._drawPlayHud(ctx, world, info);
    if (world.banner) this._drawBanner(ctx, world, world.banner);
    if (world.phase === 'title') this._drawTitle(ctx, world, info);
    if (world.phase === 'gameover' || world.phase === 'victory') this._drawResult(ctx, world, info);
    this._drawCorner(ctx, world, info);
    if (info.debug) this._drawDebug(ctx, world, info);
  }

  // ---------- ゲーム中HUD ----------
  _drawPlayHud(ctx, world, info) {
    const { w, h } = world;
    const S = Math.min(w, h);
    const pad = S * 0.03;

    // 都市HP（左上）
    const barW = w * 0.26, barH = S * 0.026;
    this._label(ctx, T.hudCity, pad, pad, S * 0.026, '#9fc0ff');
    const ratio = clamp(world.cityHp / world.cityMaxHp, 0, 1);
    this._bar(ctx, pad, pad + S * 0.034, barW, barH, ratio,
      ratio > 0.5 ? '#5cff9d' : ratio > 0.25 ? '#ffd23f' : '#ff5470', '#0c1430');
    this._text(ctx, `${Math.ceil(world.cityHp)} / ${world.cityMaxHp}`,
      pad + barW + S * 0.014, pad + S * 0.034 + barH * 0.5, S * 0.02, '#cfe0ff', 'left', 'middle');

    // 守護者人数
    this._text(ctx, `${T.hudGuardians} ${world.guardianCount}`,
      pad, pad + S * 0.078, S * 0.022, '#a9c4ff', 'left', 'top');

    // スコア（右上）
    this._text(ctx, T.hudScore, w - pad, pad, S * 0.022, '#9fc0ff', 'right', 'top');
    this._text(ctx, world.score.toLocaleString('ja-JP'), w - pad, pad + S * 0.03,
      S * 0.05, '#ffffff', 'right', 'top', true);

    // ウェーブ + コンボ（中央上）
    this._text(ctx, T.waveLabel(world.wave), w * 0.5, pad, S * 0.03, '#bcd4ff', 'center', 'top');
    if (world.comboMult > 1) {
      const pulse = 1 + 0.08 * Math.sin(this.time * 12);
      this._text(ctx, `${T.hudCombo} x${world.comboMult}`, w * 0.5, pad + S * 0.045,
        S * 0.032 * pulse, '#ffd23f', 'center', 'top', true);
    }

    // ボスHP
    if (world.boss && world.boss.alive) this._drawBossBar(ctx, world);

    // 必殺ゲージ（下中央）
    this._drawUltGauge(ctx, world, info);

    // フロートテキスト
    this._drawFloatTexts(ctx, world);
  }

  _drawBossBar(ctx, world) {
    const { w, h } = world;
    const S = Math.min(w, h);
    const b = world.boss;
    const barW = w * 0.5, barH = S * 0.022;
    const x = (w - barW) / 2, y = S * 0.085;
    this._text(ctx, T.bossName, w * 0.5, y - S * 0.028, S * 0.026, '#ff6bd6', 'center', 'top', true);
    const total = b.maxHpTotal;
    const ratio = clamp(b.hpTotal / total, 0, 1);
    this._bar(ctx, x, y, barW, barH, ratio, '#ff4f9d', '#2a0e2a');
    // フェーズ区切り
    ctx.save();
    ctx.strokeStyle = 'rgba(0,0,0,0.6)'; ctx.lineWidth = 2;
    for (let i = 1; i < b.phases; i++) {
      const px = x + barW * (i / b.phases);
      ctx.beginPath(); ctx.moveTo(px, y); ctx.lineTo(px, y + barH); ctx.stroke();
    }
    ctx.restore();
  }

  _drawUltGauge(ctx, world, info) {
    const { w, h } = world;
    const S = Math.min(w, h);
    const barW = w * 0.34, barH = S * 0.022;
    const x = (w - barW) / 2, y = h - S * 0.06;
    const ratio = clamp(world.gauge / world.gaugeMax, 0, 1);
    const ready = ratio >= 1;
    this._text(ctx, T.hudUlt, x, y - S * 0.026, S * 0.022, ready ? '#ffd23f' : '#9fc0ff', 'left', 'top');
    const col = ready ? '#ffe06b' : '#7cc0ff';
    this._bar(ctx, x, y, barW, barH, ratio, col, '#0c1430', ready);
    if (ready) {
      const pulse = 0.6 + 0.4 * Math.sin(this.time * 8);
      const msg = info.mode === 'camera' ? T.ultReady : T.ultReadyKey;
      ctx.save(); ctx.globalAlpha = pulse;
      this._text(ctx, msg, w * 0.5, y + barH + S * 0.012, S * 0.026, '#ffe06b', 'center', 'top', true);
      ctx.restore();
    }
  }

  _drawFloatTexts(ctx, world) {
    for (const f of world.floatTexts) {
      const a = clamp(f.life / f.maxLife, 0, 1);
      ctx.save();
      ctx.globalAlpha = a;
      this._text(ctx, f.text, f.x, f.y, f.size, f.color, 'center', 'middle', true);
      ctx.restore();
    }
  }

  // ---------- バナー ----------
  _drawBanner(ctx, world, banner) {
    const { w, h } = world;
    const S = Math.min(w, h);
    const t = banner.time / banner.maxTime;
    // 出入りのフェード
    const a = clamp(Math.min(t * 4, (1 - t) * 4, 1), 0, 1);
    ctx.save();
    ctx.globalAlpha = a;
    this._text(ctx, banner.text, w * 0.5, h * 0.4, S * 0.07, banner.color || '#ffffff', 'center', 'middle', true);
    if (banner.sub) this._text(ctx, banner.sub, w * 0.5, h * 0.4 + S * 0.06, S * 0.03, '#cfe0ff', 'center', 'middle');
    ctx.restore();
  }

  // ---------- タイトル ----------
  _drawTitle(ctx, world, info) {
    const { w, h } = world;
    const S = Math.min(w, h);
    // 半透明の暗幕
    ctx.fillStyle = 'rgba(4,6,15,0.45)';
    ctx.fillRect(0, 0, w, h);

    this._text(ctx, T.title, w * 0.5, h * 0.26, S * 0.13, '#eaf2ff', 'center', 'middle', true, 0.18);
    this._text(ctx, T.subtitle, w * 0.5, h * 0.26 + S * 0.085, S * 0.028, '#7fb0ff', 'center', 'middle', false, 0.45);
    this._text(ctx, T.tagline, w * 0.5, h * 0.26 + S * 0.13, S * 0.026, '#cfe0ff', 'center', 'middle');

    // 開始プロンプト（点滅）
    const pulse = 0.55 + 0.45 * Math.sin(this.time * 4);
    ctx.save(); ctx.globalAlpha = pulse;
    const startMsg = info.mode === 'camera' ? T.start : T.start;
    this._text(ctx, startMsg, w * 0.5, h * 0.52, S * 0.04, '#ffe06b', 'center', 'middle', true);
    ctx.restore();
    this._text(ctx, T.startKey, w * 0.5, h * 0.52 + S * 0.04, S * 0.022, '#9fb3d8', 'center', 'middle');

    // 遊び方
    const how = info.mode === 'camera' ? T.howto : T.howtoFallback;
    const hy = h * 0.66;
    this._text(ctx, '遊び方', w * 0.5, hy - S * 0.04, S * 0.024, '#9fc0ff', 'center', 'middle');
    how.forEach((line, i) => {
      this._text(ctx, '◆ ' + line, w * 0.5, hy + i * S * 0.035, S * 0.026, '#dde8ff', 'center', 'middle');
    });

    // モード/状態（カメラが使えない理由を具体的に表示）
    let modeLine = info.mode === 'camera' ? T.modeCamera : T.modeFallback;
    if (info.modelLoading) modeLine = T.loadingModel;
    else if (info.mode !== 'camera' && info.visionError) {
      const m = (info.visionError.message || '') + '';
      if (m.includes('INSECURE')) modeLine = T.cameraNeedHttps;
      else if (m.includes('NotAllowed') || m.includes('Permission') || m.includes('Security')) modeLine = T.cameraDeniedTap;
      else if (m.includes('NotFound') || m.includes('NO_CAMERA_API') || m.includes('NotReadable') || m.includes('Overconstrained')) modeLine = T.cameraNotFound;
      else modeLine = T.cameraNone;
    }
    this._text(ctx, modeLine, w * 0.5, h * 0.9, S * 0.024,
      info.mode === 'camera' ? '#5cff9d' : '#ffb366', 'center', 'middle');

    // フォールバック中はタップでカメラ有効化を促す（iOS対策）
    if (info.mode !== 'camera' && !info.modelLoading) {
      this._text(ctx, T.cameraTapEnable, w * 0.5, h * 0.9 + S * 0.03, S * 0.02, '#9fb3d8', 'center', 'middle');
    }
  }

  // ---------- 結果 ----------
  _drawResult(ctx, world, info) {
    const { w, h } = world;
    const S = Math.min(w, h);
    const win = world.phase === 'victory';
    ctx.fillStyle = win ? 'rgba(6,12,28,0.6)' : 'rgba(15,4,10,0.62)';
    ctx.fillRect(0, 0, w, h);

    this._text(ctx, win ? T.victoryTitle : T.gameoverTitle, w * 0.5, h * 0.3,
      S * 0.11, win ? '#ffe06b' : '#ff6b8a', 'center', 'middle', true, 0.12);
    this._text(ctx, win ? T.victorySub : T.gameoverSub, w * 0.5, h * 0.3 + S * 0.08,
      S * 0.028, '#dde8ff', 'center', 'middle');

    this._text(ctx, T.finalScore, w * 0.5, h * 0.52, S * 0.028, '#9fc0ff', 'center', 'middle');
    this._text(ctx, world.score.toLocaleString('ja-JP'), w * 0.5, h * 0.52 + S * 0.06,
      S * 0.07, '#ffffff', 'center', 'middle', true);
    this._text(ctx, T.wavesSurvived(world.wave), w * 0.5, h * 0.66, S * 0.03, '#cfe0ff', 'center', 'middle');

    const pulse = 0.55 + 0.45 * Math.sin(this.time * 4);
    ctx.save(); ctx.globalAlpha = pulse;
    this._text(ctx, T.retry, w * 0.5, h * 0.8, S * 0.03, '#ffe06b', 'center', 'middle', true);
    ctx.restore();
  }

  // ---------- 隅の情報 ----------
  _drawCorner(ctx, world, info) {
    const { w, h } = world;
    const S = Math.min(w, h);
    this._text(ctx, T.switchKey, w * 0.5, h - S * 0.018, S * 0.018, 'rgba(160,180,220,0.6)', 'center', 'bottom');
    if (info.muted) this._text(ctx, '🔇 消音中', w - S * 0.02, h - S * 0.02, S * 0.02, '#ffb366', 'right', 'bottom');
  }

  _drawDebug(ctx, world, info) {
    const { w, h } = world;
    const S = Math.min(w, h);
    const lines = [
      `FPS ${info.fps}`,
      `mode ${info.mode}`,
      `players ${world.guardianCount}`,
      `enemies ${world.enemies.length}`,
      `particles ${info.particles ?? '-'}`,
    ];
    ctx.save();
    ctx.font = `${Math.round(S * 0.016)}px monospace`;
    ctx.textAlign = 'left'; ctx.textBaseline = 'top';
    ctx.fillStyle = 'rgba(0,0,0,0.4)';
    ctx.fillRect(8, 8, 160, lines.length * S * 0.02 + 10);
    ctx.fillStyle = '#7CFF6B';
    lines.forEach((l, i) => ctx.fillText(l, 14, 12 + i * S * 0.02));
    ctx.restore();
  }

  // ---------- 描画ヘルパー ----------
  _bar(ctx, x, y, w, h, ratio, color, bg, glow = false) {
    ctx.save();
    ctx.fillStyle = bg;
    this._roundRect(ctx, x, y, w, h, h * 0.5); ctx.fill();
    if (glow) { ctx.shadowColor = color; ctx.shadowBlur = 18; }
    ctx.fillStyle = color;
    const fw = Math.max(h, w * clamp(ratio, 0, 1));
    this._roundRect(ctx, x, y, fw, h, h * 0.5); ctx.fill();
    ctx.restore();
    ctx.save();
    ctx.strokeStyle = 'rgba(255,255,255,0.18)'; ctx.lineWidth = 1;
    this._roundRect(ctx, x, y, w, h, h * 0.5); ctx.stroke();
    ctx.restore();
  }

  _label(ctx, text, x, y, size, color) {
    this._text(ctx, text, x, y, size, color, 'left', 'top');
  }

  _text(ctx, text, x, y, size, color, align = 'left', baseline = 'top', glow = false, spacing = 0) {
    ctx.save();
    ctx.font = `700 ${Math.round(size)}px ${FONT}`;
    ctx.textAlign = align;
    ctx.textBaseline = baseline;
    ctx.fillStyle = color;
    if (glow) { ctx.shadowColor = color; ctx.shadowBlur = size * 0.6; }
    if (spacing > 0) {
      // 字間を空けて中央寄せ（タイトル用）
      ctx.letterSpacing = `${size * spacing}px`;
    }
    ctx.fillText(text, x, y);
    ctx.restore();
  }

  _roundRect(ctx, x, y, w, h, r) {
    r = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }
}
