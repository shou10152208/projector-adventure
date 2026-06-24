// =============================================================
//  星守の夜 — エントリーポイント
//  サブシステムを起動し、ゲームループを回す。
//  各処理は try/catch で隔離し、1フレームの失敗で全停止しないようにする。
// =============================================================

import { CONFIG } from './config.js';
import { clamp } from './util.js';
import { AudioEngine } from './audio.js';
import { InputManager } from './input/inputManager.js';
import { ParticleSystem } from './render/particles.js';
import { Renderer } from './render/renderer.js';
import { World } from './game/world.js';

const canvas = document.getElementById('game');
const video = document.getElementById('cam');
const bootEl = document.getElementById('boot');
const errorOverlay = document.getElementById('error-overlay');
const errorMsg = document.getElementById('error-message');

let audio, input, particles, renderer, world;
let lastT = performance.now();
let fpsCount = 0, fpsTimer = 0;
let firstFrame = false;

const info = {
  mode: 'fallback',
  fps: 0,
  debug: false,
  muted: false,
  modelLoading: true,
  visionError: null,
  particles: 0,
};

function showError(msg) {
  if (errorMsg) errorMsg.textContent = msg;
  if (errorOverlay) errorOverlay.hidden = false;
}

function resize() {
  const { w, h } = renderer.resize();
  world.resize(w, h);
}

function setCursor() {
  document.body.style.cursor = info.mode === 'camera' ? 'none' : 'default';
}

let cameraBusy = false;
async function tryCamera() {
  if (input.mode === 'camera' || cameraBusy) return;
  cameraBusy = true;
  info.modelLoading = true;
  try {
    const ok = await input.tryVision();
    info.mode = input.mode;
    info.visionError = input.visionError;
    if (ok) audio.resume(); // 許可ジェスチャーで音も有効化
  } finally {
    info.modelLoading = false;
    cameraBusy = false;
    setCursor();
  }
}

// iOS Safari 等はユーザー操作(タップ)起点でないとカメラを許可しない。
// タイトルでタップされたら（カメラ未起動なら）その場で再要求する。
function maybeEnableCameraOnGesture() {
  if (input.mode !== 'camera' && !cameraBusy && world.phase === 'title') tryCamera();
}

function switchToFallback() {
  input.forceFallback();
  info.mode = 'fallback';
  setCursor();
}

function toggleFullscreen() {
  try {
    if (!document.fullscreenElement) document.documentElement.requestFullscreen();
    else document.exitFullscreen();
  } catch {}
}

function setupKeys() {
  window.addEventListener('keydown', (e) => {
    audio.resume();
    if (e.code === 'KeyM') info.muted = audio.toggleMute();
    else if (e.code === 'KeyD') info.debug = !info.debug;
    else if (e.code === 'KeyK') switchToFallback();
    else if (e.code === 'KeyG') tryCamera();
    else if (e.code === 'KeyF') toggleFullscreen();
  });
  window.addEventListener('pointerdown', () => { audio.resume(); maybeEnableCameraOnGesture(); });
}

// フォールバック由来のコマンド（マウス/キー）を毎フレーム処理
function processFallbackEdges(players) {
  if (input.fallback.consumePrimary()) {
    if (world.phase === 'playing') world.triggerUltimate();
    else world.requestStart();
  }
  if (input.fallback.consumeClap()) {
    const p = players[0];
    if (p) world.triggerClapAt(p.center.x, p.center.y, p.color, p.colorRgb);
    else world.triggerClapAt(world.w * 0.5, world.h * 0.6, '#34e2ff', '52,226,255');
  }
}

function frame(now) {
  const dt = Math.min((now - lastT) / 1000, 0.05); // 大ジャンプ防止
  lastT = now;

  fpsCount++; fpsTimer += dt;
  if (fpsTimer >= 0.5) { info.fps = Math.round(fpsCount / fpsTimer); fpsCount = 0; fpsTimer = 0; }

  try {
    const players = input.update(dt, world.w, world.h, now);
    processFallbackEdges(players);
    world.update(dt, players);
    info.particles = particles.list.length;
    renderer.render(world, players, input.getVideo(), info, dt);

    if (world.phase === 'playing') {
      const intensity = clamp(world.enemies.length / 12 + (world.boss && world.boss.alive ? 0.5 : 0), 0, 1);
      audio.updateMusic(dt, intensity);
    }
    window.__dbg = {
      mode: info.mode, phase: world.phase, players: world.guardianCount,
      enemies: world.enemies.length, score: world.score, wave: world.wave,
      cityHp: Math.ceil(world.cityHp), gauge: Math.round(world.gauge),
      boss: !!(world.boss && world.boss.alive), fps: info.fps,
      camErr: info.visionError ? (info.visionError.message || '') : '',
      secure: window.isSecureContext,
    };
  } catch (err) {
    console.error('[frame]', err);
  }

  if (!firstFrame) {
    firstFrame = true;
    window.__GAME_STARTED = true;
    if (bootEl) { bootEl.classList.add('hidden'); setTimeout(() => bootEl.remove(), 800); }
  }
  requestAnimationFrame(frame);
}

function init() {
  try {
    audio = new AudioEngine();
    particles = new ParticleSystem();
    world = new World(particles, audio);
    renderer = new Renderer(canvas);
    input = new InputManager(video);
    input.attachFallback(canvas);

    resize();
    window.addEventListener('resize', resize);
    setupKeys();
    setCursor();

    requestAnimationFrame(frame); // フォールバックで即遊べる状態に
    tryCamera();                  // 裏でカメラ起動を試みる
  } catch (err) {
    console.error('[init]', err);
    showError(String(err && err.stack ? err.stack : err));
  }
}

init();
