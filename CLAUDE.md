# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 概要 / What this is

『星守の夜 — STARFALL GUARDIANS』: プロジェクター投影 + Webカメラで全身を動かして遊ぶ協力型MRゲーム（最大4人）。
**ビルド不要のバニラ JavaScript (ES Modules)**。MediaPipe 一式を `vendor/` に同梱し、**完全オフライン**で動作する。

## 実行 / Run

- 起動: `./start.sh`（Unix/WSL）/ `start.bat`（Windows）/ `python3 server.py`。ブラウザが自動で `http://localhost:8000/` を開く（WSLは Windows 既定ブラウザを起動）。
- **ビルド・テスト・lint のステップは無い**（バンドラ無し）。コードを編集したらブラウザを再読込するだけ。
- 環境変数: `PORT=8080`（ポート）、`HTTPS=1`（自己署名TLSを起動）、`HOST=...`（既定 `0.0.0.0`）。
- `index.html` を `file://` で直接開いてはいけない。getUserMedia と ES Modules がローカルサーバーを要求する。

### server.py の必須の役割
単純な `python -m http.server` では動かない。`server.py` は以下を担う:
- MIME: `.mjs`/`.js`→`text/javascript`、`.wasm`→`application/wasm`（誤るとモジュール/WASM読込が失敗）。
- `Cross-Origin-Opener-Policy: same-origin` + `Cross-Origin-Embedder-Policy: require-corp`（crossOriginIsolated=WASMスレッド有効化）。
- `0.0.0.0` 待ち受け（LAN公開）、`HTTPS=1` 時は openssl で `certs/` に自己署名証明書を自動生成。
- ThreadingHTTPServer + BrokenPipe 等の無害例外を抑制。

### カメラとセキュアコンテキスト（重要）
getUserMedia は**セキュアコンテキストでしか動かない** = `https://` か `http://localhost`。
- 別端末から `http://<LAN-IP>` で開くとカメラ不可 → 自動でマウス/タッチにフォールバック。
- 別端末でカメラを使うには `HTTPS=1` で起動し `https://` で開く（自己署名なので警告を承認）。
- LAN/別端末まわりは README「同じWiFiの別端末から遊ぶ」と `lan-setup.ps1`（WSL2のNATを越えるWindows用ポート転送スクリプト）を参照。

### 変更を実際に動かして確認する / Testing
ローカルに **Node も JSランタイムも無い**。検証は2段構え:
- 構文/括弧チェック: テンプレートリテラル対応の簡易スキャナ（過去に使用、`memory/` 参照）。
- 実ブラウザ確認: **Python版 Playwright + ヘッドレスChromium**（root不要のセットアップ手順は `memory/headless-browser-debug-setup.md`）。`--use-fake-device-for-media-stream` でカメラ経路も検証可。
- ランタイム状態は `window.__dbg`（`main.js` が毎フレーム更新: `mode/phase/score/wave/cityHp/gauge/camErr/secure/stage/pickups...`）から読める。

### CI（GitHub Actions）
`.github/workflows/ci.yml` が push(main)/PR で走る。2ジョブ構成:
- `syntax` — `node --check` で `src/**/*.js` を構文チェック（Node不要な本体に対し、CI側だけ Node を使う）。
- `browser` — `python3 test/ci_test.py`。server.py を起動し、ヘッドレスChromiumで (1)実アプリ起動→フォールバックで wave 進行、(2)`world.js` 等を直接 import して**第一夜→星喰イ→第二夜→月喰イ→勝利**までフル進行、(3)新敵・アイテムの単体検証。失敗で exit 1。
- 同じスクリプトはローカルでも実行可: `pip install playwright && python -m playwright install --with-deps chromium && python3 test/ci_test.py`（固定ブラウザを使うなら `PLAYWRIGHT_CHROMIUM_PATH` を指定）。

## アーキテクチャ / Big picture

データの流れは **入力 → ワールド更新 → 描画** の一方向。`src/main.js` がループを所有し、毎フレーム以下を順に呼ぶ:

1. `InputManager.update()` → `players[]`（統一フォーマットの「守護者」配列）を生成
2. `World.update(dt, players)` → ゲーム状態を進める（当たり判定・スコア・ウェーブ・必殺技）
3. `Renderer.render(world, players, video, info, dt)` → 全レイヤーを Canvas へ描画

`main.js` はサブシステムの起動も担う。各処理は try/catch で隔離し、1フレームの失敗で全停止しない。

### 入力の抽象化（最重要）
`src/input/` はカメラとフォールバックを**同一の `player` オブジェクト**に正規化する。ゲーム側はどちらの入力かを意識しない。
- `vision.js` — MediaPipe `PoseLandmarker`（複数人・VIDEOモード）。**vendorバンドルは動的 `import()`** で読むため、ライブラリ読込が失敗してもアプリ起動を止めず自動でフォールバックする。`isSecureContext`/権限エラーを分類（`INSECURE_CONTEXT`/`NO_CAMERA_API`/`NotAllowedError`...）して上位へ。
- `fallback.js` — マウス/キーボード/タッチ。カメラ初期化失敗時に `InputManager` が自動採用。
- `gestures.js` (`PlayerTracker`) — ランドマーク or カーソルを受け、**平滑化・速度算出・ジェスチャー検出**（両手上げ/拍手）を行い `player` を生成。位置オブジェクトはフレーム間で**再利用**される（手の `hitCd` を World が書き戻すため）。
- `inputManager.js` — モード切替と人物ごとの `PlayerTracker` を管理。`player` の座標は鏡映（自分が見たまま）でスクリーンpxに変換済み。文字列ID（`'solo'`）は色index 0 にフォールバック。

`player` の形: `{ id, color, colorRgb, active, hands:{left,right:{x,y,vx,vy,speed,present,radius,hitCd}}, head, center, scale, gestures:{armsRaised,armsRaisedEdge,clapEdge} }`。
共有リソースは team 単位（`world.score`/`cityHp`/`gauge`）、攻撃手段は player ごと。必殺技は誰か1人の両手上げ＋ゲージ満タンで発動。

### ゲームロジック
- `game/world.js` — 中心。状態機械（`title`/`playing`/`gameover`/`victory`）、**手と敵の当たり判定**（接触=継続ダメージ、高速=斬撃の瞬間ダメージ）、スコア/コンボ、必殺ゲージ、必殺技「星の雨」、画面シェイク/フラッシュ、敵スポーン、`stage`（1=第一夜/2=第二夜）と `pickups`（星のかけら回収）を持つ。`particles` と `audio` を**コンストラクタで受け取り**、そこへ演出を出す。
- `game/entities.js` — `Enemy` 基底 + `Meteor`/`Shard`/`Splitter`/`Drone`/`Armor`（接触耐性・斬撃で割る）/`Bomber`（死亡時に周囲へ連鎖爆発）/`EnemyShot`、`StarPickup`（手で触れて回収するアイテム）、`Shockwave`（拍手）、`Boss`（tier1=星喰イ 3フェーズ / tier2=月喰イ 4フェーズ+全方位ショット）。各エンティティが自分で `update(dt, world)` と `draw(ctx, world)` を持つ。ダメージは `takeDamage(amount, world, info)`。`info.silent` で継続ダメージの演出を抑制（`Armor` はこれを見て接触ダメージを軽減）。
- `game/waves.js` — `WaveDirector`。intro→spawning→clearing→breather→次。`BOSS_WAVE=6`（星喰イ）→ 撃破で `world._beginStage2()` → `stageBreak` → wave7〜11 → `FINAL_BOSS_WAVE=12`（月喰イ、`final:true`）→ 勝利。`getWave(n)` がウェーブ定義を返す。

### 描画
- `render/renderer.js` — レイヤー統括: 背景→カメラ薄映し→敵/ボス→守護者オーラ→粒子→ビネット→画面フラッシュ→HUD。DPRスケールと画面シェイクの transform もここ。
- `render/background.js` — 星空/星雲/月/都市スカイライン。静的レイヤーはオフスクリーンに事前描画。都市HPで崩壊・炎上表現が変化。
- `render/particles.js` — 加算合成パーティクル。`render/hud.js` — スコア/HP/ゲージ/バナー/タイトル/結果画面（日本語）。カメラ不可の理由もタイトルに表示。

### 設定とテキスト
- `src/config.js` — **全チューニング値の集約点**（人数 `input.maxPlayers`、モデル、戦闘、敵、ボス等）。バランス調整は基本ここだけ。
- `src/i18n.js` — プレイヤー向け文言（**日本語**）。新規UI文字列はここへ。
- `src/util.js` — 数学 + 乱数（mulberry32）+ 色変換。

## 改修時の注意 / Conventions
- **座標系**: スクリーンpx、原点左上、y下向き。敵は上(y小)から降り、`world.cityLineY` を超えると街にダメージ。
- **時間**: `World.update` は `timeScale`（必殺技スローモー）を掛けた `sdt` でゲームを進め、演出減衰やフロートテキストは実時間 `dt`。新規ゲーム要素は `sdt` を使う。
- **エラー隔離**: メインループは try/catch 済み。読込失敗時は `index.html` の安全網が**詳細スタック付き**でエラー表示する（`window.__GAME_STARTED` 未設定時のみ）。新サブシステムも失敗で全停止させない。
- **CSSの落とし穴**: `#error-overlay` を ID セレクタで `display:flex` にすると UA の `[hidden]{display:none}` に勝ってしまう。`#error-overlay[hidden]{display:none}` で打ち消す必要がある（同種の hidden 制御を足すときは注意）。
- **音**: 効果音追加は `audio.js` のプロシージャル合成で（外部音源を足さない方針）。最初のユーザー操作で `AudioContext` を resume。
- **新しい敵**: `entities.js` でクラス追加 → `config.enemies` に数値 → `world.spawnEnemy()` と `waves.js` に組込む。
- **新ステージ/ボス**: `waves.js` の `WAVES` 配列に追記（または `getWave` のエンドレス生成を拡張）。

## ファイル早見 / Key files
- `server.py` — 配信サーバー（MIME/COOP-COEP/LAN/HTTPS）。`lan-setup.ps1` — WSL2をLAN公開するWindows用スクリプト。
- `start.sh`/`start.bat` — 起動。`index.html`/`styles/main.css` — ホスト + 起動オーバーレイ。
- `vendor/mediapipe/` — 同梱の PoseLandmarker バンドル/WASM/モデル（オフライン用）。`certs/` は HTTPS 時の自動生成物（gitignore）。
