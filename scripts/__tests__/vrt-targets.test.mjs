// VRT の撮影が静かに減る経路を塞ぐ。
//
// **VRT の中には置けない。** VRT は required check ではなく、`vrt.yml` の `paths` に
// 載る PR でしか起動しない。撮影を減らす変更が `vrt/**` に触れるとは限らない
// (`playwright.vrt.config.ts` の projects を削るのがその例)し、そもそも VRT が走らない
// PR では VRT の中のガードも走らない。ここは required check「Build site」の
// `test:workflows` ステップで常に走る(`CLAUDE.md`「配線の検査は、守る対象と違う口に
// 置く」)。
//
// 撮影が減っても**表向きは何も起きない**。落ちるテストが 76 件から 38 件になるだけで、
// 残った分は緑のまま通り、`npm run vrt` の終了コードも 0 のまま。CI からは「VRT は
// 通った」としか見えない。
//
// **ソースを正規表現で読む形は 1 度書いて捨てた。** 数えているのが文字列でしかないので、
// 実測で 5 経路が素通りした — ループを `pages.slice(0, 2)` に絞る / config に
// `grepInvert` を足す / コメント行にダミーの `path:` を書いて件数を保つ /
// projects を削除ではなくコメントアウトする / `test.skip(` でなく `test["skip"](` と
// 書く。逆に、引用符をシングルに変えただけで赤にもなった。そこでここでは
// **Playwright 自身に「何を撮るか」を列挙させて突き合わせる**(`--list` は実測 0.5 秒で、
// ブラウザも webServer も起動しない)。
//
// **列挙で見えないものは、値そのものを固定する。** `hide` セレクタで本文を隠す /
// `fullPage` を落とす / 比較設定を緩める / 断面(viewport)を潰す / 比較そのものを
// 消す(`ignoreSnapshots`・`updateSnapshots`)/ ワークフローの比較ステップを撮り直しに
// する — いずれも撮影件数を減らさないので `--list` からは見えない。
//
// **残る穴は spec の書き方そのもの。** 第 2 引数での上書き / 実行時 skip / import 元の
// 差し替え、のいずれも撮影件数を変えずに値だけをずらせる(実測)。**列挙が尽きている
// 保証は無い**ので、`vrt/pages.spec.ts` 冒頭に注意書きを置いてある。

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import { targets, shotOptions } from '../../vrt/targets.mjs';
// config は **VRT ジョブと同じ環境でも**読み直す(理由は下の 3 環境の比較テスト)。
// クエリを変えると ESM のモジュールキャッシュを跨げる。
const CONFIG_URL = new URL('../../playwright.vrt.config.ts', import.meta.url).href;
let configReads = 0;
async function readConfig(env = {}) {
  const saved = { ...process.env };
  Object.assign(process.env, env);
  try {
    return (await import(`${CONFIG_URL}?read=${configReads++}`)).default;
  } finally {
    for (const key of Object.keys(env)) {
      if (key in saved) process.env[key] = saved[key];
      else delete process.env[key];
    }
  }
}

const vrtConfig = await readConfig();

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
  assert.deepEqual(
    [...byProject.keys()].sort(),
    ['desktop', 'desktop-dark', 'mobile', 'mobile-dark'],
  );
  const expected = targets.map((t) => t.name).sort();
  for (const [project, names] of byProject) {
    assert.deepEqual(names.sort(), expected, `${project} の撮影対象がずれている`);
  }
});

test('撮影が skip / fixme に落ちていない', () => {
  // Playwright は skip を **exit 0** で返す。`test(` を `test.skip(` に変えるだけで
  // 全件が skipped になり、CI からは通ったようにしか見えない(実測)。node 側は
  // `scripts/assert-test-results.mjs` が skip / todo を 0 に強制しているが、
  // Playwright の口には同等の検査が無い。
  //
  // **見えるのは宣言時の skip だけ。** `test["skip"](` のような別記法も
  // expectedStatus に出るが、**本体の中で `test.skip(条件, …)` と書く実行時 skip は
  // `--list` に出ない**(実測: `test.skip(!!process.env.CI, …)` を足すと
  // expectedStatus は `passed` のままで、CI では全件が skipped になる)。
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
  //
  // **ステップ名だけでは足りない。** 名前を残したまま比較側に `--update-snapshots` を
  // 足す / `VRT_DIST` を `dist-main` に向ける、のどちらでも恒久的に緑になり、
  // 名前を見るだけの検査は素通りした(実測)。
  //
  // **1 本の正規表現で `env:` と `run:` を続けて拾う形も捨てた。** YAML として等価な
  // 書き方 3 つ(`run:` をクォートする / `run: |` のブロックスカラー / `env:` と `run:` の
  // 順序入れ替え)で赤になった(実測)。マッピングのキー順に意味は無いので、
  // **ステップの塊に切ってから、その中に何が在るかを見る**。
  const steps = WORKFLOW.split(/^(?= {6}- )/m);
  const stepFor = (dist) => steps.find((step) => step.includes(`VRT_DIST: ${dist}`));

  const baseline = stepFor('dist-main');
  const compare = stepFor('dist-pr');
  assert.ok(baseline, 'main の dist を撮るステップが無い');
  assert.ok(compare, 'PR の dist を撮るステップが無い');

  for (const [label, step] of [['ベースライン撮影', baseline], ['比較', compare]]) {
    assert.match(step, /npx playwright test --config playwright\.vrt\.config\.ts/, `${label}が VRT の config を使っていない`);
  }
  // 撮り直しの指定はベースライン側にだけ在る。比較側に付くと毎回上書きになり、
  // 差分が出ることが無くなる。
  assert.match(baseline, /--update-snapshots/, 'ベースライン撮影が撮り直しになっていない');
  assert.doesNotMatch(compare, /--update-snapshots/, '比較が撮り直しになっている');

  // 撮ってから比べる。逆順だとベースラインが無い状態で比較が走る。
  assert.ok(
    WORKFLOW.indexOf(baseline) < WORKFLOW.indexOf(compare),
    '比較がベースライン撮影より先に置かれている',
  );

  // `continue-on-error` が付くと job は緑のまま比較だけが無効になる。
  // `build.yml` 側は `check-source-titles.test.mjs` が見ているが、こちらは
  // どの口からも見ていなかった。
  assert.doesNotMatch(WORKFLOW, /continue-on-error/, 'vrt.yml に continue-on-error が付いている');
});

test('本文を隠す指定が home の更新履歴だけである', () => {
  // **`hide` は撮影を減らさないので `--list` からは見えない。** 全件に
  // `hide: "main"` を付けても件数は 1 枚も減らず、`home` の PNG が 1,072,845 B →
  // 71,031 B になってなお緑だった(実測)。列挙で見えないものは、例外そのものを
  // 固定するしかない(`check-source-titles.test.mjs` の `EXPECTED_MARKS` と同じ形)。
  //
  // 隠してよいのは更新履歴のリストだけ。理由は `vrt/targets.mjs` 冒頭。
  assert.deepEqual(
    targets.filter((t) => t.hide).map((t) => `${t.name}: ${t.hide}`),
    ['home: section[aria-labelledby="updates-heading"] ul'],
  );
});

test('比較設定が完全一致のまま固定されている', () => {
  // #160 の形に静かに戻す変異を塞ぐ。`threshold` の既定は 0.2 で、それ未満の色差は
  // 差分として**数えられない** — 省庁バッジの色変更が VRT を素通りしたのはこれ。
  // `maxDiffPixels` の既定は 0 だが型定義は "unset by default" としか書いておらず
  // 契約ではないので、明示されていることまで見る。
  //
  // **ソースを読まずに config を import して評価済みの値を見る**(#199 の教訓)。
  // 正規表現では、キーを消したのかコメントアウトしたのか、別の場所で上書きしたのかを
  // 区別できない。`--list --reporter=json` には `expect` が入らない(実測)ので、
  // Playwright 経由では取れない。
  assert.deepEqual(vrtConfig.expect.toHaveScreenshot, {
    threshold: 0,
    maxDiffPixels: 0,
    animations: 'disabled',
    caret: 'hide',
  });
  // 比率(`maxDiffPixelRatio`)が戻ってきた場合も、余分なキーとしてここで赤になる。
  // 使わないのは、許容量が総ピクセル数に比例して長いページほど甘くなるため
  // (#194 の /scenes は差分 1036px に対して許容 5636px で通った)。

  // **比較そのものを消す 2 つのキーも見る。** どちらも 1 行で VRT を完全な no-op に
  // する(実測: `ignoreSnapshots: true` / `updateSnapshots: 'all'` のどちらでも、
  // 本文に letter-spacing を注入した dist が 1 passed になる)。`expect` 配下だけを
  // 見ていると素通りした。
  assert.ok(!vrtConfig.ignoreSnapshots, 'ignoreSnapshots が有効になっている');
  assert.equal(vrtConfig.updateSnapshots, undefined, 'updateSnapshots が設定されている');

  // **project 単位の `expect` は上位を上書きする。** 同じファイルの中で
  // `projects[].expect.toHaveScreenshot` を書けば、上の deepEqual を通したまま
  // 実効値だけを緩められる(実測)。
  for (const project of vrtConfig.projects) {
    assert.equal(project.expect, undefined, `${project.name} が expect を上書きしている`);
  }
});

test('比較設定が VRT ジョブの環境でも同じ値になる', async () => {
  // **import した時点の値を見るだけでは足りない。** config が実行環境で分岐すると、
  // このガードが走る「Build site」(`VRT_DIST` 未設定)では厳格な値が見え、
  // 実際に撮る VRT ジョブ(`VRT_DIST: dist-main` / `dist-pr`)では緩い値が使われる。
  // `VRT_DIST` はこの config が元から読んでいる変数なので、「CI では少し緩める」形の
  // 分岐が自然な修正として紛れ込みうる(実測: 三項演算子 1 つで
  // `threshold` が 0 → 0.9 に化けたまま `test:workflows` は緑だった)。
  //
  // **残る穴**: ガードが走る時点に存在しないものから値を作る経路(VRT ジョブ内にしか
  // 無いディレクトリの `existsSync` など)。ここで再現できるのは環境変数までで、
  // それ以外は `vrt/pages.spec.ts` 冒頭の注意書きと同じ扱いになる。
  // **並行に読まない。** `readConfig` は `process.env` を書き換えてから `import()` する
  // ので、`Promise.all` で 2 本同時に走らせると後から設定した環境を両方が見る
  // (実測: `dist-main` のときだけ値を変える分岐が 5/5 で素通りした)。
  const variants = [];
  for (const env of [{ VRT_DIST: 'dist-main' }, { VRT_DIST: 'dist-pr' }]) {
    variants.push(await readConfig(env));
  }
  for (const config of variants) {
    assert.deepEqual(config.expect.toHaveScreenshot, vrtConfig.expect.toHaveScreenshot);
    assert.equal(config.retries, vrtConfig.retries);
    assert.equal(config.ignoreSnapshots, vrtConfig.ignoreSnapshots);
    assert.equal(config.updateSnapshots, vrtConfig.updateSnapshots);
    const shape = (c) =>
      c.projects
        .map((p) => ({
          name: p.name,
          expect: p.expect,
          theme: p.use.colorScheme,
          ...p.use.viewport,
        }))
        .sort((a, b) => a.name.localeCompare(b.name));
    assert.deepEqual(shape(config), shape(vrtConfig));
  }
});

test('撮影の断面とリトライが固定されている', () => {
  // **断面が減っても件数は減らない。** mobile の viewport を desktop と同じにする /
  // `colorScheme` を両方 light にすると、76 件は撮り続けたまま同じ画像を 2 度撮る
  // ことになり、モバイルやダークの崩れは一切写らなくなる(`targets` の path 重複を
  // 禁じているのと同じ形)。viewport も `colorScheme` も `--list --reporter=json` の
  // `config.projects[]` に入らないので、config を import して見る。
  // **並び順は見ない。** projects の順序は撮るものを変えないので、入れ替えただけで
  // 赤くするのは偽陽性になる(`vrt.yml` を平文で照合していたときと同じ型)。
  assert.deepEqual(
    vrtConfig.projects
      .map((p) => ({ name: p.name, theme: p.use.colorScheme, ...p.use.viewport }))
      .sort((a, b) => a.name.localeCompare(b.name)),
    [
      { name: 'desktop', theme: 'light', width: 1280, height: 800 },
      { name: 'desktop-dark', theme: 'dark', width: 1280, height: 800 },
      { name: 'mobile', theme: 'light', width: 390, height: 844 },
      { name: 'mobile-dark', theme: 'dark', width: 390, height: 844 },
    ],
  );
  // リトライは入れない(理由は config のコメント)。増やすと、安定化ループでも
  // 収まらなかった問題まで握り潰す。
  assert.equal(vrtConfig.retries, 0);
});

test('全ページをフルページで撮っている', () => {
  // `fullPage` を落とすとビューポート内(1280x800 / 390x844)しか撮らなくなるが、
  // 76 件は走り続けて全部緑のまま通る。config の `expect.toHaveScreenshot` には
  // 置けない値なので、`vrt/targets.mjs` にデータとして持たせてここで固定する。
  assert.deepEqual(shotOptions, { fullPage: true });
});

// ---------------------------------------------------------------------------
// もう一方の口(`test:content`)を固定する。自分自身を縛ると、ファイルごと消えたとき
// に縛りも一緒に消える。逆向きは `check-source-titles.test.mjs` にある。
// ---------------------------------------------------------------------------

/** この口で走るべきテストの総数。**守る対象から導出しない**(理由は下のテスト) */
const CONTENT_TESTS = 110;

test('test:content の口にあるテストファイルが 1 本である', () => {
  // ファイルを足すと下限に静かな余裕が生まれる(実測: ダミーを 4 本足しても
  // `test:content` は緑のまま通った)。囮を 1 本足してから本体を消す経路も、
  // ここで赤になる。
  const files = fs
    .readdirSync(path.join(ROOT, 'scripts/__tests__/content'), { withFileTypes: true })
    .filter((e) => e.isFile() && e.name.endsWith('.test.mjs'))
    .map((e) => e.name)
    .sort();
  assert.deepEqual(files, ['check-source-titles.test.mjs']);
});

test('npm script test:content が、実測ちょうどの下限で 2 段を通す', () => {
  // **完全一致で縛る。** `match` だと ` || true` を後ろに足すだけで恒久 no-op に
  // でき、下限も 1 まで静かに下げられる(`assert-test-results.mjs` は 1 以上しか
  // 要求しない)。
  //
  // **下限を守る対象から導出しない。** ファイルの `test(` を数えて突き合わせる形だと、
  // 中身を消せば数も一緒に下がるので、`中身を空にする + 下限を巻き戻す` の 2 手が
  // 素通りする(実測)。**節穴を塞ぐのは、この定数がここに直接書いてあること**。
  // テストを足したら npm script とこの定数の両方を直す。
  const own = read('scripts/__tests__/content/check-source-titles.test.mjs');
  assert.equal((own.match(/^test\(/gm) ?? []).length, CONTENT_TESTS, '実測と定数がずれている');
  assert.equal(
    PKG.scripts['test:content'],
    "node scripts/assert-test-files.mjs 'scripts/__tests__/content/*.test.mjs' && " +
      `node scripts/assert-test-results.mjs ${CONTENT_TESTS} 'scripts/__tests__/content/*.test.mjs'`,
  );
});

test('npm run vrt が VRT の config を指している', () => {
  assert.equal(PKG.scripts.vrt, 'npx playwright test --config playwright.vrt.config.ts');
});
