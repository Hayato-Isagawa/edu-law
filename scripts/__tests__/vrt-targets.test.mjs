// `vrt/pages.spec.ts` の撮影対象が静かに減る経路を塞ぐ。
//
// **VRT の中には置けない。** VRT は required check ではなく、`vrt.yml` の `paths` に
// 載る PR でしか起動しない。撮影対象を減らす変更が `vrt/**` に触れるとは限らない
// (`playwright.vrt.config.ts` の projects を削るのがその例)し、そもそも VRT が走らない
// PR では VRT の中のガードも走らない。ここは required check「Build site」の
// `test:workflows` ステップで常に走る(`CLAUDE.md`「配線の検査は、守る対象と違う口に
// 置く」)。
//
// 撮影が減っても**表向きは何も起きない**。落ちるテストが 38 件から 20 件になるだけで、
// 残った分は緑のまま通る。`npm run vrt` の終了コードも 0 のままなので、CI からは
// 「VRT は通った」としか見えない。以下は実測した抜け道で、1 つずつ固定する:
//
//   - 代表 URL の行を消す         → 19 件を割る
//   - 代表 URL を足す             → CLAUDE.md の件数記述と乖離する
//   - path を重複させる           → 件数は 19 のまま実質 2 ページまで落とせる
//   - test( を test.skip( に変える → 38 skipped / 2 passed / exit 0 になる
//   - projects を 1 つに減らす     → 撮影が 38 → 19 に半減する
//   - テンプレートを足して代表に載せ忘れる → 新しいページを誰も撮らない
//
// **捕まえられない経路が 1 つある**: `hide` セレクタを増やして本文を隠すと、撮影自体は
// 19 件走るので件数からも path からも見えない(実測では全件に `hide: "main"` を付けると
// `home` の PNG が 1,072,845 B → 71,031 B になってなお緑)。`hide` を足すときは
// `vrt/pages.spec.ts` 冒頭の理由書きに従うこと。

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../..');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

const SPEC = read('vrt/pages.spec.ts');
const CONFIG = read('playwright.vrt.config.ts');
const PKG = JSON.parse(read('package.json'));
const WORKFLOW = read('.github/workflows/vrt.yml');

/** 撮影対象の代表 URL。`{ name: "…", path: "…" }` の path だけを取る */
const targets = [...SPEC.matchAll(/path:\s*"([^"]+)"/g)].map((m) => m[1]);

/** `playwright.vrt.config.ts` の projects 名 */
const projects = [...CONFIG.matchAll(/name:\s*"([^"]+)",\s*use:\s*\{\s*viewport/g)].map(
  (m) => m[1],
);

/** `src/pages/` 配下の .astro を再帰で数える(1 ファイル = 1 テンプレート) */
function listTemplates(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return listTemplates(full);
    return entry.name.endsWith('.astro') ? [path.relative(ROOT, full)] : [];
  });
}

const templates = listTemplates(path.join(ROOT, 'src/pages'));

test('代表 URL が 19 件ある', () => {
  // 下限(>=)ではなく固定。増やしたときにも赤にすることで、`CLAUDE.md` に書いた
  // 代表 URL 数と撮影件数を一緒に直す機会を作る(実際に 2 世代ぶん古いまま残っていた)。
  assert.equal(targets.length, 19, `代表 URL が ${targets.length} 件: ${targets.join(' ')}`);
});

test('代表 URL の path が重複していない', () => {
  // 件数だけを見ていると、全部を同じ path にしても緑で通る(実測: 18 枚が同一画像に
  // なってなお 40 passed)。撮っているページの種類は path の一意性でしか見えない。
  const unique = new Set(targets);
  assert.equal(unique.size, targets.length, `重複: ${targets.filter((p, i) => targets.indexOf(p) !== i).join(' ')}`);
});

test('テンプレートと代表 URL が 1 対 1 で対応している', () => {
  // `/changelog` だけは意図的に撮らない(PR ごとに 1 件増えるので、内容の追加だけで
  // 毎回赤になり本当の崩れが埋もれる。理由は `vrt/pages.spec.ts` 冒頭)。それ以外は
  // テンプレートを足したら代表 URL も足す。この対応が崩れると、新しいページを誰も
  // 撮らないまま本番に出る。
  const excluded = ['src/pages/changelog.astro'];
  for (const e of excluded) {
    assert.ok(templates.includes(e), `除外対象 ${e} が存在しない`);
  }
  assert.equal(
    templates.length - excluded.length,
    targets.length,
    `テンプレート ${templates.length} 本(除外 ${excluded.length})に対して代表 URL が ${targets.length} 件`,
  );
});

test('撮影テストが skip / only / fixme になっていない', () => {
  // Playwright は skip を **exit 0** で返す。`test(` を `test.skip(` に変えるだけで
  // 38 skipped / 2 passed になり、CI からは通ったようにしか見えない(実測)。
  // node 側は `scripts/assert-test-results.mjs` が skip / todo を 0 に強制しているが、
  // Playwright の口には同等の検査が無い。
  for (const modifier of ['test.skip(', 'test.fixme(', 'test.only(']) {
    assert.ok(!SPEC.includes(modifier), `${modifier} が使われている`);
  }
});

test('desktop / mobile の 2 projects で撮っている', () => {
  // projects を 1 つ消すと撮影が半減するが、spec 側は何も変わらないので
  // `vrt/pages.spec.ts` を見るだけでは気づけない(実測: 20 passed で緑)。
  assert.deepEqual(projects, ['desktop', 'mobile']);
});

test('VRT が config と spec の変更で起動する', () => {
  // ガードが在っても、対象の変更で VRT が起動しなければ撮り比べは行われない。
  // 列挙の正典は `vrt.yml` なので件数は数えず、この 2 つが載っていることだけ見る。
  assert.match(WORKFLOW, /^\s+- "vrt\/\*\*"$/m);
  assert.match(WORKFLOW, /^\s+- "playwright\.vrt\.config\.ts"$/m);
});

test('npm run vrt が VRT の config を指している', () => {
  assert.equal(PKG.scripts.vrt, 'npx playwright test --config playwright.vrt.config.ts');
});
