// =============================================================
//  PlayerTracker — 生の姿勢/カーソルを「守護者」状態へ変換
//  位置の平滑化・速度算出・ジェスチャー検出（両手上げ/拍手）を担当
// =============================================================

import { CONFIG } from '../config.js';
import { clamp, dist, ema, hexToRgb } from '../util.js';

// BlazePose ランドマーク番号
const LM = {
  NOSE: 0,
  L_SHOULDER: 11, R_SHOULDER: 12,
  L_WRIST: 15, R_WRIST: 16,
  L_HIP: 23, R_HIP: 24,
};

function makeHand() {
  return { x: 0, y: 0, vx: 0, vy: 0, speed: 0, present: false, radius: 46, hitCd: 0, init: false };
}

export class PlayerTracker {
  constructor(id, color) {
    this.id = id;
    this.color = color;
    this.scale = 220;
    this.player = {
      id, color, colorRgb: hexToRgb(color), active: false,
      hands: { left: makeHand(), right: makeHand() },
      head: { x: 0, y: 0, present: false },
      center: { x: 0, y: 0 },
      scale: 220,
      gestures: { armsRaised: false, armsRaisedEdge: false, clapEdge: false },
    };
    this._prevArmsRaised = false;
    this._clapCd = 0;
    this._prevHandDist = 9999;
    this._missTime = 0;
  }

  _updateHand(hand, sx, sy, present, dt, smooth) {
    // 手のクールダウン減衰
    hand.hitCd = Math.max(0, hand.hitCd - dt);
    hand.present = present;
    if (!present) { hand.speed = 0; hand.vx = 0; hand.vy = 0; return; }

    if (!hand.init) {
      hand.x = sx; hand.y = sy; hand.init = true;
      hand.vx = 0; hand.vy = 0; hand.speed = 0;
      return;
    }
    const px = hand.x, py = hand.y;
    // 位置を平滑化
    hand.x = ema(hand.x, sx, smooth);
    hand.y = ema(hand.y, sy, smooth);
    if (dt > 0) {
      const nvx = (hand.x - px) / dt;
      const nvy = (hand.y - py) / dt;
      const vs = CONFIG.input.velSmoothing;
      hand.vx = ema(hand.vx, nvx, vs);
      hand.vy = ema(hand.vy, nvy, vs);
      hand.speed = Math.hypot(hand.vx, hand.vy);
    }
  }

  // --- カメラ（MediaPipeランドマーク）から更新 ---
  updateFromLandmarks(lm, w, h, dt) {
    const cfg = CONFIG.input;
    const p = this.player;
    const sx = (i) => (1 - lm[i].x) * w; // 鏡映（自分が見たまま動く）
    const sy = (i) => lm[i].y * h;
    const vis = (i) => (lm[i].visibility ?? 1);

    // 体の大きさ（肩幅）→ 手のオーラ半径
    const shouldersVisible = vis(LM.L_SHOULDER) > 0.3 && vis(LM.R_SHOULDER) > 0.3;
    if (shouldersVisible) {
      const sw = dist(sx(LM.L_SHOULDER), sy(LM.L_SHOULDER), sx(LM.R_SHOULDER), sy(LM.R_SHOULDER));
      this.scale = ema(this.scale, clamp(sw, 80, 600), 0.2);
    }
    p.scale = this.scale;
    const radius = clamp(this.scale * CONFIG.guardian.handScale,
      CONFIG.guardian.handRadiusMin, CONFIG.guardian.handRadiusMax);
    p.hands.left.radius = radius;
    p.hands.right.radius = radius;

    // 手
    const lPresent = vis(LM.L_WRIST) > cfg.handVisibility;
    const rPresent = vis(LM.R_WRIST) > cfg.handVisibility;
    this._updateHand(p.hands.left, sx(LM.L_WRIST), sy(LM.L_WRIST), lPresent, dt, cfg.posSmoothing);
    this._updateHand(p.hands.right, sx(LM.R_WRIST), sy(LM.R_WRIST), rPresent, dt, cfg.posSmoothing);

    // 頭
    const headPresent = vis(LM.NOSE) > 0.3;
    p.head.present = headPresent;
    if (headPresent) { p.head.x = ema(p.head.x || sx(LM.NOSE), sx(LM.NOSE), 0.4); p.head.y = ema(p.head.y || sy(LM.NOSE), sy(LM.NOSE), 0.4); }

    // 体の中心（肩と腰の中点）
    let cx = 0, cy = 0, cn = 0;
    for (const i of [LM.L_SHOULDER, LM.R_SHOULDER, LM.L_HIP, LM.R_HIP]) {
      if (vis(i) > 0.3) { cx += sx(i); cy += sy(i); cn++; }
    }
    if (cn > 0) { p.center.x = cx / cn; p.center.y = cy / cn; }
    else if (headPresent) { p.center.x = p.head.x; p.center.y = p.head.y + this.scale * 0.5; }

    this._detectGestures(p, dt, headPresent);
    p.active = true;
    return p;
  }

  // --- フォールバック（マウス/キー）から更新 ---
  updateFromFallback(hand, dt, w, h) {
    const p = this.player;
    const sx = hand.nx * w;
    const sy = hand.ny * h;
    p.scale = 240;
    const r = CONFIG.guardian.fallbackHandRadius;
    p.hands.right.radius = r;
    p.hands.left.radius = r;
    this._updateHand(p.hands.right, sx, sy, true, dt, 0.7);
    p.hands.left.present = false;

    // ボタン長押し/キー移動中は最低速度を底上げ（必ず斬撃になる）
    if (hand.power) {
      p.hands.right.speed = Math.max(p.hands.right.speed, CONFIG.combat.slashSpeed * 1.25);
    }

    p.head.present = false;
    p.center.x = sx; p.center.y = sy;
    p.gestures.armsRaised = false;
    p.gestures.armsRaisedEdge = false;
    p.gestures.clapEdge = false; // 拍手/必殺は main がキー入力から直接発火
    p.active = true;
    return p;
  }

  _detectGestures(p, dt, headPresent) {
    const g = p.gestures;
    this._clapCd = Math.max(0, this._clapCd - dt);
    const L = p.hands.left, R = p.hands.right;

    // 両手上げ（頭より上に両手）
    let armsRaised = false;
    if (headPresent && L.present && R.present) {
      const margin = this.scale * 0.12;
      armsRaised = (L.y < p.head.y - margin) && (R.y < p.head.y - margin);
    }
    g.armsRaised = armsRaised;
    g.armsRaisedEdge = armsRaised && !this._prevArmsRaised;
    this._prevArmsRaised = armsRaised;

    // 拍手（両手が素早く近づいて閉じた瞬間）
    let clapEdge = false;
    if (L.present && R.present) {
      const d = dist(L.x, L.y, R.x, R.y);
      const closeThresh = Math.max(this.scale * 0.5, 70);
      if (this._clapCd <= 0 && d < closeThresh && this._prevHandDist >= closeThresh) {
        clapEdge = true;
        this._clapCd = 0.6;
      }
      this._prevHandDist = d;
    } else {
      this._prevHandDist = 9999;
    }
    g.clapEdge = clapEdge;
  }
}
