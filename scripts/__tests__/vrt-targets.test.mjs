// VRT の撮影が静かに減る経路を塞ぐ。
//
// **VRT の中には置けない。** VRT は required check ではなく、`vrt.yml` の `paths` に
// 載る PR でしか起動しない。撮影を減らす変更が `vrt/**` に触れるとは限らない
// (`playwright.vrt.config.ts` の projects を削るのがその例)し、そもそも VRT が走らない
// PR では VRT の中のガードも走らない。ここは required check「Build site」の
// `test:workflows` ステップで常に走る(`CLAUDE.md`「配線の検査は、守る対象と違う口に
// 置く」)。
//
// 撮影が減っても**表向きは何も起きない**。落ちるテストが 38 件から 19 件になるだけで、
// 残った分は緑のまま通り、`npm run vrt` の終了コードも 0 のまま。CI からは「VRT は
// 通った」としか見えない。
//
// **ソースを正規表現で読む形は 1 度書いて捨てた。** 数えているのが文字列でしかないので、
// 実測で 5 経路が素通りした — ループを `pages.slice(0, 2)` に絞る / config に
// `grepInvert` を足す / コメント行にダミーの `path:` を書いて件数を保つ /
// projects を削除ではなくコメントアウトする / `test.skip(` でなく `test["skip"](` と
// 書く。逆に、引用符をシングルに変えただけで赤にもなった。so ここでは
// **Playwright 自身に「何を撮るか」を列挙させて突き合わせる**(`--list` は実測 0.5 秒で、
// ブラウザも webServer も起動しない)。
//
// **捕まえられない経路が 1 つある**: `hide` セレクタを増やして本文を隠すと、撮影自体は
// 19 件走るので列挙からは見えない(実測では全件に `hide: "main"` を付けると `home` の
// PNG が 1,072,845 B → 71,031 B になってなお緑)。`hide` を足すときは
// `vrt/targets.mjs` 冒頭の理由書きに従うこと。

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import { targets } from '../../vrt/targets.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../..');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

const PKG = JSON.parse(read('package.json'));
const WORKFLOW = read('.github/workflows/vrt.yml');

/** Playwright に撮影対象を列挙させる。--list なので実行も webServer の起動もしない */
function listPlannedShots() {
  const raw = execFileSync(
    'npx',
    ['playwright', 'test', '--config', 'playwright.vrt.config.ts', '--list', '--reporter=json'],
    { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], maxBuffer: 8 * 1024 * 1024 },
  );
  const report = JSON.parse(raw);
  return report.suites.flatMap((suite) =>
    suite.specs.flatMap((spec) =>
      spec.tests.map((t) => ({
        name: spec.title,
        project: t.projectName,
        expected: t.expectedStatus,
      })),
    ),
  );
}

const planned = listPlannedShots();

/**
 * Astro がページとして出力するファイル。`_` 接頭のものはルートにならず、
 * `.ts` / `.js` はエンドポイント(HTML ではない)なので、どちらも撮影対象外。
 */
function listPageTemplates(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    if (entry.name.startsWith('_')) return [];
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return listPageTemplates(full);
    return /\.(astro|md|mdx|html)$/.test(entry.name) ? [path.relative(ROOT, full)] : [];
  });
}

const templates = listPageTemplates(path.join(ROOT, 'src/pages'));

test('撮影対象が 19 件ある', () => {
  // 下限(>=)ではなく固定。増やしたときにも赤にすることで、`CLAUDE.md` に書いた
  // 代表 URL 数と撮影件数を一緒に直す機会を作る(実際に 2 世代ぶん古いまま残っていた)。
  assert.equal(targets.length, 19);
});

test('撮影対象の path が重複していない', () => {
  // 件数だけを見ていると、全部を同じ path にしても通る(実測: 18 枚が同一画像に
  // なってなお緑)。撮っているページの種類は path の一意性でしか見えない。
  const paths = targets.map((t) => t.path);
  const dups = paths.filter((p, i) => paths.indexOf(p) !== i);
  assert.deepEqual(dups, []);
});

test('テンプレートと撮影対象が 1 対 1 で対応している', () => {
  // `/changelog` だけは意図的に撮らない(理由は `vrt/targets.mjs` 冒頭)。それ以外は
  // テンプレートを足したら撮影対象も足す。この対応が崩れると、新しいページを誰も
  // 撮らないまま本番に出る。
  const excluded = ['src/pages/changelog.astro'];
  for (const e of excluded) {
    assert.ok(templates.includes(e), `除外対象 ${e} が存在しない`);
  }
  assert.equal(
    templates.length - excluded.length,
    targets.length,
    `テンプレート ${templates.length} 本(除外 ${excluded.length})に対して撮影対象が ${targets.length} 件`,
  );
});

test('Playwright が撮る予定のものが撮影対象と一致する', () => {
  // ここだけが「実際に何が撮られるか」を見ている。上の 3 本はデータの形しか
  // 見ていないので、ループの絞り込み・grep・projects の削減は素通りする。
  const byProject = new Map();
  for (const shot of planned) {
    if (!byProject.has(shot.project)) byProject.set(shot.project, []);
    byProject.get(shot.project).push(shot.name);
  }
  assert.deepEqual([...byProject.keys()].sort(), ['desktop', 'mobile']);
  const expected = targets.map((t) => t.name).sort();
  for (const [project, names] of byProject) {
    assert.deepEqual(names.sort(), expected, `${project} の撮影対象がずれている`);
  }
});

test('撮影が skip / fixme に落ちていない', () => {
  // Playwright は skip を **exit 0** で返す。`test(` を `test.skip(` に変えるだけで
  // 38 skipped になり、CI からは通ったようにしか見えない(実測)。node 側は
  // `scripts/assert-test-results.mjs` が skip / todo を 0 に強制しているが、
  // Playwright の口には同等の検査が無い。--list の expectedStatus はどの記法で
  // 差し替えても skipped になるので、文字列ではなくここを見る。
  const notPassed = planned.filter((s) => s.expected !== 'passed');
  assert.deepEqual(notPassed, []);
});

test('VRT が config と spec の変更で起動する', () => {
  // ガードが在っても、対象の変更で VRT が起動しなければ撮り比べは行われない。
  // 列挙の正典は `vrt.yml` なので件数は数えないが、**否定パターンで打ち消されて
  // いないこと**は見る(`- "!vrt/**"` を後ろに足すだけで起動しなくなる)。
  for (const pattern of ['vrt/**', 'playwright.vrt.config.ts']) {
    const escaped = pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    assert.match(WORKFLOW, new RegExp(`^\\s+- "${escaped}"$`, 'm'), `${pattern} が paths に無い`);
    assert.doesNotMatch(WORKFLOW, new RegExp(`^\\s+- "!${escaped}"$`, 'm'), `${pattern} が打ち消されている`);
  }
});

test('VRT が main と PR の 2 ビルドを撮り比べている', () => {
  // 比較ステップを消すとベースライン撮影だけが残り、**恒久的に緑**になる。
  for (const step of ['Capture baseline from main', 'Compare PR against baseline']) {
    assert.ok(WORKFLOW.includes(step), `${step} ステップが無い`);
  }
});

test('npm run vrt が VRT の config を指している', () => {
  assert.equal(PKG.scripts.vrt, 'npx playwright test --config playwright.vrt.config.ts');
});
