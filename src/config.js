// =============================================================
//  星守の夜 — 中央チューニング設定
//  ここの数値を変えるだけでゲームバランスを調整できます。
// =============================================================

export const CONFIG = {
  // --- 描画 ---
  render: {
    maxDpr: 2,            // 高DPIの上限（プロジェクター負荷対策）
    targetFps: 60,
    showCameraUnderlay: true, // 背景に薄くカメラ映像を映す（自分の位置確認用）
    cameraUnderlayAlpha: 0.16,
    maxParticles: 1400,
  },

  // --- 入力 / 認識 ---
  input: {
    // pose_landmarker_lite.task は軽量・複数人向け。重い場合でも安定。
    // 画質重視なら 'pose_landmarker_full.task' に変更可。
    modelFile: 'pose_landmarker_lite.task',
    maxPlayers: 4,           // 同時に認識する最大人数
    delegate: 'GPU',         // 'GPU' か 'CPU'（GPUが不安定なら 'CPU'）
    minPoseDetectionConfidence: 0.5,
    minPosePresenceConfidence: 0.5,
    minTrackingConfidence: 0.5,
    posSmoothing: 0.5,       // 位置の平滑化(0=なめらかbut遅延, 1=生)
    velSmoothing: 0.5,       // 速度の平滑化
    handVisibility: 0.4,     // この可視度未満の手は「無し」扱い
  },

  // --- プレイヤー（守護者） ---
  guardian: {
    colors: ['#34e2ff', '#ff5cc8', '#ffd23f', '#7CFF6B', '#ff8a3d', '#b08bff'],
    handScale: 0.16,         // 肩幅 × これ = 手のオーラ半径
    handRadiusMin: 30,
    handRadiusMax: 78,
    fallbackHandRadius: 46,
  },

  // --- 戦闘 / ダメージ ---
  combat: {
    contactBaseDps: 22,      // 手が触れている間の継続ダメージ/秒
    speedDamageK: 0.07,      // 手の速度 × これ = 追加継続ダメージ/秒
    speedCap: 2000,          // 速度上限(px/s) ダメージ計算用
    slashSpeed: 580,         // この速度を超えると「斬撃」=瞬間ダメージ発生
    slashImpulseK: 0.035,    // 斬撃速度 × これ = 瞬間ダメージ
    slashImpulseMax: 80,
    handHitCooldown: 0.11,   // 同じ手の斬撃判定の間隔(s)
    clapRadius: 240,         // 拍手の衝撃波の最大半径
    clapDamage: 60,
    clapKnockback: 520,
  },

  // --- 必殺技 星の雨 ---
  ultimate: {
    gaugeMax: 100,
    gainPerDamage: 0.05,     // 与ダメージ × これ がゲージに加算
    gainPerKill: 4,
    meteorDamage: 9999,      // 通常敵は一掃
    bossDamage: 520,
    duration: 2.4,          // 演出時間(s)
    slowmo: 0.25,           // 演出中のタイムスケール
  },

  // --- 都市（守るべき対象） ---
  city: {
    maxHp: 120,
    rebuildOnWave: 6,        // ウェーブ毎に都市HPを少し回復
    rebuildOnStage: 45,      // 第二夜の開始時に大きく回復
  },

  // --- 敵 ---
  enemies: {
    meteor:  { hp: 30,  radius: 26, speed: [70, 120],  score: 100,  cityDamage: 10 },
    shard:   { hp: 14,  radius: 17, speed: [120, 190], score: 60,   cityDamage: 5 },
    drone:   { hp: 60,  radius: 28, speed: [40, 70],   score: 220,  cityDamage: 8, fireEvery: [2.2, 4.0] },
    splitter:{ hp: 44,  radius: 30, speed: [55, 90],   score: 180,  cityDamage: 12, splits: 3 },
    shot:    { hp: 6,   radius: 11, speed: 230,        score: 20,   cityDamage: 6 },
    // 第二夜から登場
    armor:   { hp: 80,  radius: 32, speed: [45, 70],   score: 320,  cityDamage: 14,
               contactResist: 0.15 }, // 触れているだけのダメージはこの倍率（斬撃・拍手で割る）
    bomber:  { hp: 26,  radius: 24, speed: [60, 100],  score: 260,  cityDamage: 16,
               blastRadius: 190, blastDamage: 55 },    // 倒すと周囲の敵ごと爆発（連鎖）
  },

  // --- アイテム 星のかけら（敵がときどき落とす） ---
  pickup: {
    dropChance: 0.16,        // 敵撃破時にドロップする確率（shot/shard は除く）
    fallSpeed: 65,
    radius: 20,
    life: 9,                 // 拾わないと消えるまでの秒数
    gaugeGain: 8,
    cityHeal: 2,
    score: 50,
  },

  // --- ボス 星喰イ（第一夜） / 月喰イ（第二夜・強化版） ---
  boss: {
    hpPerPhase: 900,
    phases: 3,
    radius: 120,
    coreRadius: 46,
    enterTime: 3.0,
    spitEvery: [2.6, 1.4],     // フェーズが進むほど短く
    spitCount: [5, 7, 9],
    summonEvery: [7, 5, 3.5],
    score: 5000,
    // 第二夜ボスの上書き値
    tier2: {
      hpPerPhase: 1050,
      phases: 4,
      spitEvery: [2.2, 1.1],
      spitCount: [6, 8, 10, 12],
      summonEvery: [6, 4.5, 3.2, 2.6],
      ringEvery: 6.5,          // 全方位ショット（噴水状に降り注ぐ）の間隔
      ringCount: 10,
      score: 12000,
    },
  },

  // --- コンボ ---
  combo: {
    window: 2.4,             // この秒数内に倒し続けるとコンボ継続
    maxMultiplier: 8,
  },

  // --- 音 ---
  audio: {
    masterVolume: 0.7,
    musicVolume: 0.32,
    sfxVolume: 0.6,
  },
};
