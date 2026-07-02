// =============================================================
//  プレイヤー向けテキスト（日本語）
// =============================================================

export const T = {
  title: '星守の夜',
  subtitle: 'STARFALL GUARDIANS',
  tagline: '夜空に立つ守護者よ、街を護れ。',

  start: '両手を高く上げて  ▶  ゲーム開始',
  startKey: 'スペース / クリックでも開始',
  loadingModel: '姿勢認識エンジンを起動中…',
  cameraDenied: 'カメラが使えないため、マウス・キーボードで遊びます',
  cameraNone: 'カメラ未検出 — マウス・キーボードモード',
  cameraNeedHttps: 'カメラには https:// 接続が必要です（サーバーを HTTPS=1 で起動）',
  cameraDeniedTap: 'カメラが許可されていません — 画面をタップして再試行',
  cameraNotFound: 'カメラが見つかりません',
  cameraTapEnable: '画面をタップしてカメラを有効化',
  switchKey: '[K] キーボード  [G] カメラ再試行  [M] 消音  [D] 情報  [F] 全画面',

  modeCamera: 'カメラモード（全身で操作）',
  modeFallback: 'マウス / キーボードモード',

  calibBig: '画面の前に立ってください',
  calibSmall: 'あなたの輪郭が光ったら準備OK',

  howto: [
    '手を振って流星をはじき飛ばす',
    '素早く振るほど強い「斬撃」に',
    '両手を打ち合わせて衝撃波（拍手）',
    'ゲージが満タンで両手を上げ「星の雨」',
  ],
  howtoFallback: [
    'マウスで手を動かして流星をはじく',
    'ボタン長押しで強化（速い斬撃）',
    '右クリック / C キーで衝撃波',
    'ゲージ満タンで スペース「星の雨」',
  ],

  hudCity: '街',
  hudScore: 'スコア',
  hudWave: 'ウェーブ',
  hudCombo: 'コンボ',
  hudGuardians: '守護者',
  hudUlt: '星の雨',
  ultReady: '両手を上げて 星の雨 発動！',
  ultReadyKey: 'スペースで 星の雨 発動！',

  waveLabel: (n) => `ウェーブ ${n}`,
  waveClear: 'ウェーブ クリア！',
  getReady: '構えて…',
  bossIncoming: '星喰イ、来たる',
  bossName: '星 喰 イ',
  bossWeakpoint: '光る核を狙え！',

  stage2Banner: '第二夜 — 紅い月',
  stage2Sub: '空が紅く染まる…真の敵が動き出す',
  stageLabel2: '第二夜',
  bossIncoming2: '月喰イ、来たる',
  bossName2: '月 喰 イ',
  bossWeakpoint2: '紅い核を狙え！',
  armorHint: '硬い岩は 素早い斬撃で！',
  pickupText: '星のかけら！',

  victoryTitle: '夜明け',
  victorySub: '街は救われた。守護者たちに称賛を。',
  gameoverTitle: '街、陥落',
  gameoverSub: 'だが星は再び昇る。もう一度。',
  finalScore: '最終スコア',
  wavesSurvived: (n) => `到達ウェーブ ${n}`,
  retry: '両手を上げて / スペースで もう一度',

  ultName: '星 の 雨',
};
