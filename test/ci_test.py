#!/usr/bin/env python3
"""CI 用のヘッドレス統合テスト（星守の夜）。

やること:
  1. server.py を起動
  2. Playwright + ヘッドレス Chromium で:
     - index.html を起動し window.__dbg が出る（＝メインループが回っている）か
     - フォールバックで開始し wave が進むか
     - ゲームロジックを直接 import してフル進行をシミュレートし、
       第一夜→星喰イ→第二夜→月喰イ→勝利 まで到達するか
     - 新敵（よろい岩の接触耐性・バクダン星の連鎖）と星のかけら回収の単体検証
  失敗があれば終了コード 1。

ローカル実行:
    pip install playwright && python -m playwright install --with-deps chromium
    python3 test/ci_test.py
"""
import asyncio
import os
import subprocess
import sys
import time
import urllib.request

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PORT = int(os.environ.get("CI_PORT", "8000"))
BASE = f"http://localhost:{PORT}"

# ページ内でモジュールを import して進行を検証する（ブラウザのJSエンジン上で実行）
SIM_JS = r"""
async () => {
  const { World } = await import('/src/game/world.js');
  const { Armor, Bomber, Meteor, StarPickup } = await import('/src/game/entities.js');
  const particles = new Proxy({ list: [] }, { get: (t, k) => (k in t ? t[k] : () => {}) });
  const audio = new Proxy({}, { get: () => () => {} });
  const out = { checks: [] };
  const check = (name, ok, detail = '') => out.checks.push({ name, ok: !!ok, detail: String(detail) });

  // --- 単体検証 ---
  {
    const w = new World(particles, audio);
    w.resize(1280, 720); w.phase = 'playing';
    const a = new Armor(400, 200, 50);
    const hp0 = a.hp;
    a.takeDamage(10, w, { silent: true });          // 接触 = 15%
    const contact = hp0 - a.hp;
    const midHp = a.hp;
    a.takeDamage(10, w, {});                          // 斬撃 = 等倍
    check('armor: 接触ダメージ軽減', Math.abs(contact - 1.5) < 1e-6, `contact=${contact}`);
    check('armor: 斬撃は等倍', Math.abs((midHp - a.hp) - 10) < 1e-6, `slash=${midHp - a.hp}`);

    const b = new Bomber(600, 300, 50);
    const m = new Meteor(650, 330, 50);
    w.enemies.push(b, m);
    b.takeDamage(9999, w, {});
    check('bomber: 連鎖爆発で周囲を破壊', !m.alive, `meteor alive=${m.alive}`);

    const w2 = new World(particles, audio);
    w2.resize(1280, 720); w2.phase = 'playing'; w2.cityHp = 50;
    const pk = new StarPickup(500, 400); w2.pickups.push(pk);
    const player = { active: true, color: '#fff', colorRgb: '255,255,255',
      hands: { left: { present: false }, right: { present: true, x: 500, y: 400, radius: 46 } } };
    const g0 = w2.gauge, s0 = w2.score;
    w2._collectPickups([player]);
    check('pickup: 回収でゲージ+街HP+スコア',
      !pk.alive && w2.gauge > g0 && w2.cityHp > 50 && w2.score > s0,
      `gauge=${w2.gauge} city=${w2.cityHp} score=${w2.score}`);
  }

  // --- フル進行シミュレーション（都市は無敵化して進行だけ確認） ---
  const w = new World(particles, audio);
  w.resize(1280, 720); w.startGame();
  const dt = 1 / 60; let t = 0;
  let sawArmor = false, sawBomber = false, sawPickup = false, b1 = false, b2 = false;
  while (w.phase === 'playing' && t < 900) {
    w.update(dt, []);
    for (const e of w.enemies) {
      if (e.type === 'armor') sawArmor = true;
      if (e.type === 'bomber') sawBomber = true;
      if (e.alive) e.takeDamage(9999, w, {});
    }
    if (w.pickups.length) sawPickup = true;
    if (w.boss && w.boss.alive && !w.boss.entering) {
      if (w.boss.tier === 2) b2 = true; else b1 = true;
      w.boss.takeDamage(600, w, { x: w.boss.x, y: w.boss.coreY() });
    }
    w.cityHp = w.cityMaxHp;
    t += dt;
  }
  check('sim: 勝利までフル進行', w.phase === 'victory', `phase=${w.phase} wave=${w.wave} t=${t.toFixed(0)}s`);
  check('sim: 第二夜へ遷移', w.stage === 2, `stage=${w.stage}`);
  check('sim: 最終ウェーブ=12', w.wave === 12, `wave=${w.wave}`);
  check('sim: よろい岩が出現', sawArmor);
  check('sim: バクダン星が出現', sawBomber);
  check('sim: 星のかけらがドロップ', sawPickup);
  check('sim: 星喰イ(tier1)と交戦', b1);
  check('sim: 月喰イ(tier2)と交戦', b2);
  return out;
}
"""


def wait_for_server(url, timeout=20):
    for _ in range(int(timeout * 5)):
        try:
            with urllib.request.urlopen(url, timeout=2) as r:
                if r.status == 200:
                    return True
        except Exception:
            time.sleep(0.2)
    return False


async def run():
    from playwright.async_api import async_playwright

    failures = []
    exe = os.environ.get("PLAYWRIGHT_CHROMIUM_PATH")
    launch_kwargs = dict(
        args=[
            "--no-sandbox",
            "--disable-gpu",
            "--use-fake-ui-for-media-stream",
            "--use-fake-device-for-media-stream",
            "--autoplay-policy=no-user-gesture-required",
        ]
    )
    if exe:
        launch_kwargs["executable_path"] = exe

    async with async_playwright() as pw:
        browser = await pw.chromium.launch(**launch_kwargs)
        ctx = await browser.new_context(viewport={"width": 1280, "height": 720})

        # 1) 実アプリ起動 → フォールバックで開始 → wave 進行
        page = await ctx.new_page()
        errs = []
        page.on("pageerror", lambda e: errs.append(str(e)))
        await page.goto(f"{BASE}/index.html")
        await page.wait_for_function("window.__dbg !== undefined", timeout=30000)
        dbg = await page.evaluate("window.__dbg")
        print(f"[boot] phase={dbg['phase']} mode={dbg['mode']}")
        if dbg["phase"] != "title":
            failures.append(f"boot: phase={dbg['phase']}")
        await page.keyboard.press("Space")
        await page.wait_for_timeout(3500)
        dbg = await page.evaluate("window.__dbg")
        print(f"[play] phase={dbg['phase']} wave={dbg['wave']} stage={dbg.get('stage')}")
        if dbg["phase"] != "playing" or dbg["wave"] < 1:
            failures.append(f"play: {dbg}")
        if errs:
            failures.append(f"app pageerror: {errs}")
        await page.close()

        # 2) モジュール直 import のシミュレーション
        page = await ctx.new_page()
        serrs = []
        page.on("pageerror", lambda e: serrs.append(str(e)))
        await page.goto(f"{BASE}/index.html")
        result = await page.evaluate(SIM_JS)
        for c in result["checks"]:
            print(f"  {'✓' if c['ok'] else '✗'} {c['name']}  {c['detail']}")
            if not c["ok"]:
                failures.append(f"check: {c['name']} ({c['detail']})")
        if serrs:
            failures.append(f"sim pageerror: {serrs}")
        await page.close()

        await browser.close()

    print()
    if failures:
        print("=== FAILURES ===")
        for f in failures:
            print(" -", f)
        return 1
    print("=== ALL PASS ===")
    return 0


def main():
    env = dict(os.environ, PORT=str(PORT))
    srv = subprocess.Popen(
        [sys.executable, "server.py"],
        cwd=ROOT,
        env=env,
        stdout=subprocess.DEVNULL,
        stderr=subprocess.STDOUT,
    )
    try:
        if not wait_for_server(f"{BASE}/index.html"):
            print("サーバーが起動しませんでした", file=sys.stderr)
            return 1
        return asyncio.run(run())
    finally:
        srv.terminate()
        try:
            srv.wait(timeout=5)
        except subprocess.TimeoutExpired:
            srv.kill()


if __name__ == "__main__":
    sys.exit(main())
