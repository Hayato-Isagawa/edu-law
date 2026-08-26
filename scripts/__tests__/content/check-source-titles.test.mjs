// `scripts/check-source-titles.mjs` の回帰テスト。
//
// このガードが守っているずれは、壊れても表向き**何も起きない**: `astro check` は通り、
// e2e も落ちず、週次 link-check は URL しか見ない(VRT は `src/content` の変更では
// そもそも起動しない)。ガード自身が素通りに落ちても、落ちたことは公開後にしか
// 分からない — 2026-08-25 に実際に通った経路そのもの。だから「緑になること」ではなく
// 「**赤になるべきときに赤になること**」を 1 経路ずつ固定する。
//
// **exit code は `main()` の戻り値ではなくプロセスで見る。** GitHub Actions が読むのは
// exit code だけで、診断行が出ていても 0 で終われば CI は恒久的に緑の no-op に落ちる。
// 戻り値だけを見ていると `return 1` を `return 0` に変える 1 文字の退行が素通りする。
//
// 併せて配線も見る。検査スクリプトが在っても npm script と CI から呼ばれていなければ、
// リポの中で誰も走らせないファイルが 1 つ増えるだけになる。
// **`test:content` のステップ自体が消される場合はここでは捕まえられない**(このファイルが
// 実行されなくなるため)。その 1 経路は `test:workflows` 側の
// `scripts/__tests__/link-check-workflow.test.mjs` が見ており、こちらは逆向きに
// あちらのステップを見ている。`test:hooks` / `check:tokens` / `Type check` / `Build` の
// ステップは、まだどの口からも見ていない。

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import { inspect, main } from '../../check-source-titles.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(HERE, '..', '..', '..');
const SCRIPT = path.join(ROOT, 'scripts', 'check-source-titles.mjs');
const LAWS_DIR = path.join(ROOT, 'src', 'content', 'laws');

const readRoot = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');
const lawFiles = () =>
  fs
    .readdirSync(LAWS_DIR)
    .filter((f) => f.endsWith('.md'))
    .sort();

/**
 * 実データと同じ形の法令ファイルを組み立てる。
 * `officialExplanations` は publisher → title → url の順、出典節は
 * `- 公式解説: 発行元『書名』(取得日: …)` の形。
 */
function law({
  officialTitles = ['基本方針'],
  sources = ['文部科学省『基本方針』(取得日: 2026-01-01)'],
} = {}) {
  const entries = officialTitles
    .map(
      (t) =>
        `  - publisher: mext\n    title: ${t}\n    url: https://www.mext.go.jp/${encodeURIComponent(t)}`,
    )
    .join('\n');
  return [
    '---',
    'title: テスト法',
    'order: 1',
    'summary: テスト用。',
    'eGovUrl: https://laws.e-gov.go.jp/law/000AC0000000000/',
    'officialExplanations:',
    entries,
    'lastVerified: "2026-01-01"',
    'tags: []',
    '---',
    '',
    '## 法令本文',
    '',
    '- [テスト法 全文](https://laws.e-gov.go.jp/law/000AC0000000000/)',
    '',
    '## 出典',
    '',
    ...sources.map((s) => `- ${s}`),
    '',
  ].join('\n');
}

const problemsOf = (source) => inspect('fixture.md', source).problems;

/** `main()` は診断を console に出すので、TAP に混ぜずに捕まえる。 */
function runMain(pattern) {
  const out = [];
  const { log, error } = console;
  console.log = (...a) => out.push(a.join(' '));
  console.error = (...a) => out.push(a.join(' '));
  try {
    return { code: main(pattern), output: out.join('\n') };
  } finally {
    console.log = log;
    console.error = error;
  }
}

/** 合成した法令ファイルを一時ディレクトリに置き、そこを対象に走らせる。 */
function withFixtures(sources, fn) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'edu-law-source-titles-'));
  try {
    sources.forEach((src, i) => fs.writeFileSync(path.join(dir, `law-${i}.md`), src));
    return fn(path.join(dir, '*.md'));
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

/** スクリプトを別プロセスで実行する(CLI の入口と exit code をそのまま見る)。 */
const runCli = (pattern) => spawnSync(process.execPath, [SCRIPT, pattern], { encoding: 'utf8' });

// ---------------------------------------------------------------------------
// 一致している場合
// ---------------------------------------------------------------------------

test('frontmatter と出典節の書名が一致していれば通る', () => {
  assert.deepEqual(problemsOf(law()), []);
});

test('同じ行に書名が 2 件並んでいても、両方を拾う', () => {
  const result = inspect(
    'fixture.md',
    law({ officialTitles: ['甲', '乙'], sources: ['文部科学省『甲』『乙』(取得日: 2026-01-01)'] }),
  );
  assert.deepEqual(result.problems, []);
  assert.deepEqual(result.quoted, ['甲', '乙']);
});

test('同じ書名が節に 2 回出たら 2 件として数える', () => {
  const result = inspect(
    'fixture.md',
    law({ sources: ['文部科学省『基本方針』(取得日: 2026-01-01)', '再掲: 『基本方針』'] }),
  );
  assert.deepEqual(result.quoted, ['基本方針', '基本方針']);
});

test('『』の中に「」が入れ子になっていても、外側だけを書名として拾う', () => {
  const title = '「子ども虐待対応の手引き」の一部改正(令和6年4月改正版)';
  const result = inspect(
    'fixture.md',
    law({ officialTitles: [title], sources: [`こども家庭庁『${title}』(取得日: 2026-01-01)`] }),
  );
  assert.deepEqual(result.problems, []);
  assert.deepEqual(result.quoted, [title]);
});

test('「」の中に『』が入れ子でも、外側だけを名前として拾う', () => {
  // 内側を先に取り除く方式だと `「保護者へ 『甲』」` が `「保護者へ 」` に潰れ、
  // 原文に無い名前を報告する。しかも末尾空白つきの名前は body-only で指せない。
  const name = '保護者、学校関係者、地域の皆さまへ 『児童虐待の根絶に向けて』';
  const result = inspect(
    'fixture.md',
    law({ officialTitles: [name], sources: [`大臣メッセージ「${name}」(令和2年10月30日)`] }),
  );
  assert.deepEqual(result.problems, []);
  assert.deepEqual(result.quoted, [name]);
});

test('括弧を含む名前も body-only マークで指せる', () => {
  // マークの中身まで引用として拾うと、マークが自分自身を未説明の引用として
  // 呼び戻し、指示どおりに直しても赤が消えなくなる。
  const name = '「子ども虐待対応の手引き」の一部改正';
  const source = law({ sources: [`こども家庭庁『${name}』 <!-- body-only: ${name} -->`] });
  assert.deepEqual(problemsOf(source), []);
});

test('閉じていない括弧があれば落ちる', () => {
  // 開いたままの括弧は、そこから先の書名を全部飲み込んで検査の外へ出す。
  const problems = problemsOf(
    law({ sources: ['文部科学省『基本方針』(取得日: 2026-01-01)', '補足: 文部科学省『未完'] }),
  );
  assert.equal(problems.length, 1);
  assert.match(problems[0], /閉じていない括弧がある/);
});

test('「」で引用された名前も frontmatter と突き合わせる', () => {
  const source = law({
    officialTitles: ['基本方針', '関係省庁連名通知について'],
    sources: ['文部科学省『基本方針』、および通知「関係省庁連名通知について」'],
  });
  assert.deepEqual(problemsOf(source), []);
});

test('「」で引用された名前がずれていれば落ちる', () => {
  const problems = problemsOf(
    law({
      officialTitles: ['基本方針', '関係省庁連名通知について'],
      sources: ['文部科学省『基本方針』、および通知「関係省庁連名通知について(改訂)」'],
    }),
  );
  assert.equal(problems.length, 1);
  assert.match(problems[0], /「関係省庁連名通知について\(改訂\)」/);
});

test('NFD で書かれた書名も NFC と同じものとして扱う', () => {
  const title = 'いじめの防止等のための基本的な方針(平成29年最終改定)';
  const source = law({
    officialTitles: [title],
    sources: [`文部科学省『${title.normalize('NFD')}』(取得日: 2026-01-01)`],
  });
  assert.deepEqual(problemsOf(source), []);
});

test('title の行末 YAML コメントは値に混ざらない', () => {
  assert.deepEqual(problemsOf(law({ officialTitles: ['基本方針  # 2026-08 棚卸しで改題'] })), []);
});

test('title に引用符が付いていても同じ書名として扱う', () => {
  assert.deepEqual(problemsOf(law({ officialTitles: ['"基本方針"'] })), []);
});

test('閉じ引用符の後ろに値が続く title は、黙って切らずに落ちる', () => {
  const problems = problemsOf(law({ officialTitles: ['"基本" 方針'] }));
  assert.equal(problems.length, 1);
  assert.match(problems[0], /引用符を解釈できない/);
});

test('引用符が閉じていない title は、黙って通さずに落ちる', () => {
  const problems = problemsOf(law({ officialTitles: ['"基本方針'] }));
  assert.equal(problems.length, 1);
  assert.match(problems[0], /引用符が閉じていない/);
});

// ---------------------------------------------------------------------------
// ずれ — 本番で起きた欠陥そのもの
// ---------------------------------------------------------------------------

test('出典節の書名だけを変えると落ちる', () => {
  const problems = problemsOf(
    law({ sources: ['文部科学省『基本方針(改訂)』(取得日: 2026-01-01)'] }),
  );
  assert.equal(problems.length, 1);
  assert.match(problems[0], /『基本方針\(改訂\)』/);
  assert.match(problems[0], /officialExplanations\[\]\.title に無い/);
});

test('frontmatter の title だけを変えると落ちる', () => {
  const problems = problemsOf(law({ officialTitles: ['基本方針(改訂)'] }));
  assert.equal(problems.length, 1);
  assert.match(problems[0], /『基本方針』/);
});

test('1 文字違いも落ちる', () => {
  const problems = problemsOf(
    law({
      officialTitles: ['いじめの防止等のための基本的な方針(平成29年最終改定)'],
      sources: ['文部科学省『いじめの防止等のための基本的な方針(平成29年最終改訂)』'],
    }),
  );
  assert.equal(problems.length, 1);
});

test('複数ある書名のうち 1 件だけずれても、その 1 件を報告する', () => {
  const problems = problemsOf(
    law({ officialTitles: ['甲', '乙'], sources: ['文部科学省『甲』『丙』(取得日: 2026-01-01)'] }),
  );
  assert.equal(problems.length, 1);
  assert.match(problems[0], /『丙』/);
});

// ---------------------------------------------------------------------------
// body-only マーク
// ---------------------------------------------------------------------------

test('body-only マークがあれば frontmatter に無い書名を許す', () => {
  const source = law({
    sources: [
      '文部科学省『基本方針』(取得日: 2026-01-01)',
      '文部科学省『ガイドライン』 <!-- body-only: ガイドライン -->',
    ],
  });
  assert.deepEqual(problemsOf(source), []);
});

test('マークは書名と完全一致でなければ効かない', () => {
  const problems = problemsOf(
    law({ sources: ['文部科学省『ガイドライン(改訂版)』 <!-- body-only: ガイドライン -->'] }),
  );
  // 『ガイドライン(改訂版)』が未説明 + マーク「ガイドライン」が孤児、の 2 件
  assert.equal(problems.length, 2);
});

test('腐ったマーク(frontmatter に在る書名を指す)は落ちる', () => {
  const problems = problemsOf(
    law({ sources: ['文部科学省『基本方針』(取得日: 2026-01-01) <!-- body-only: 基本方針 -->'] }),
  );
  assert.equal(problems.length, 1);
  assert.match(problems[0], /frontmatter に在る書名を指している/);
});

test('孤児マーク(対応する引用が節に無い)は落ちる', () => {
  const problems = problemsOf(
    law({
      sources: ['文部科学省『基本方針』(取得日: 2026-01-01)', '<!-- body-only: 廃止した資料 -->'],
    }),
  );
  assert.equal(problems.length, 1);
  assert.match(problems[0], /対応する引用が出典節に無い/);
});

test('マークの前後の空白は無視する', () => {
  const source = law({
    sources: ['文部科学省『ガイドライン』 <!--body-only:   ガイドライン   -->'],
  });
  assert.deepEqual(problemsOf(source), []);
});

// ---------------------------------------------------------------------------
// 検査が素通りに落ちる経路
// ---------------------------------------------------------------------------

test('出典節に引用された名前が 1 件も無ければ落ちる', () => {
  const problems = problemsOf(law({ sources: ['文部科学省 基本方針(取得日: 2026-01-01)'] }));
  assert.equal(problems.length, 1);
  assert.match(problems[0], /引用された名前が 1 件も無い/);
});

test('## 出典 節が無ければ落ちる', () => {
  const problems = problemsOf(law().replace('## 出典', '## 参考'));
  assert.equal(problems.length, 1);
  assert.match(problems[0], /## 出典 節が無い/);
});

test('## 出典 節が 2 つあれば落ちる', () => {
  const problems = problemsOf(`${law()}\n## 出典\n\n- 文部科学省『別の何か』\n`);
  assert.equal(problems.length, 1);
  assert.match(problems[0], /## 出典 節が 2 個ある/);
});

test('出典節の外にある『』は見ない', () => {
  const source = law().replace(
    '## 法令本文',
    '## 解説\n\n文部科学省『本文だけに出る資料』を参照。\n\n## 法令本文',
  );
  assert.deepEqual(problemsOf(source), []);
});

test('出典節は次の見出しで終わる', () => {
  assert.deepEqual(problemsOf(`${law()}\n## 付録\n\n文部科学省『付録の書名』\n`), []);
});

test('frontmatter が無ければ落ちる', () => {
  assert.match(problemsOf('## 出典\n\n- 文部科学省『甲』\n')[0], /frontmatter を読み取れない/);
});

test('officialExplanations が無ければ落ちる', () => {
  const source = law().replace(/^officialExplanations:\n(?: {2}- .*\n| {4}.*\n)+/m, '');
  assert.match(problemsOf(source)[0], /officialExplanations: が無い/);
});

test('officialExplanations のエントリが 0 件なら落ちる', () => {
  const source = law().replace(/^ {2}- publisher:.*\n(?: {4}.*\n)+/m, '');
  assert.match(problemsOf(source)[0], /エントリが無い/);
});

test('エントリ数と title 数が合わなければ、照合せずに落ちる', () => {
  const source = law({ officialTitles: ['甲', '乙'] }).replace('    title: 乙\n', '');
  const problems = problemsOf(source);
  assert.equal(problems.length, 1);
  assert.match(problems[0], /解析に失敗\(エントリ 2 件 \/ title 1 件\)/);
});

test('title がブロックスカラーなら、空文字で照合せずに落ちる', () => {
  const source = law().replace('    title: 基本方針', '    title: >-\n      基本方針');
  const problems = problemsOf(source);
  assert.equal(problems.length, 1);
  assert.match(problems[0], /1 行で読み取れない/);
});

test('対象ファイルが 0 件なら落ちる', () => {
  withFixtures([], (pattern) => {
    const { code, output } = runMain(pattern);
    assert.equal(code, 1);
    assert.match(output, /対象ファイルが 0 件/);
  });
});

// ---------------------------------------------------------------------------
// プロセスの exit code — CI が実際に読む値
// ---------------------------------------------------------------------------

test('ずれがあるとき main() は 1 を返す', () => {
  withFixtures([law({ officialTitles: ['基本方針(改訂)'] })], (pattern) => {
    const { code, output } = runMain(pattern);
    assert.equal(code, 1);
    assert.match(output, /1 件のずれ/);
  });
});

test('ずれがあるとき CLI は exit 1 で終わり、診断を stderr に出す', () => {
  withFixtures([law({ officialTitles: ['基本方針(改訂)'] })], (pattern) => {
    const res = runCli(pattern);
    assert.equal(res.status, 1, res.stderr);
    assert.match(res.stderr, /officialExplanations\[\]\.title に無い/);
  });
});

test('一致しているとき CLI は exit 0 で終わり、件数を stdout に出す', () => {
  withFixtures([law(), law()], (pattern) => {
    const res = runCli(pattern);
    assert.equal(res.status, 0, res.stderr);
    assert.match(res.stdout, /2 ファイル/);
  });
});

test('パスに空白があっても、symlink 越しでも CLI は走る', () => {
  // `import.meta.url === \`file://${process.argv[1]}\`` と素朴に比べると、
  // どちらの経路でも永久に偽になり **出力ゼロの exit 0** で終わる。
  // 検査が走っていないことと、ずれが無いことが区別できなくなる。
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'edu-law-entry-'));
  try {
    const spaced = path.join(dir, 'dir with space');
    fs.mkdirSync(spaced);
    fs.copyFileSync(SCRIPT, path.join(spaced, 'check.mjs'));
    const linked = path.join(dir, 'linked.mjs');
    fs.symlinkSync(SCRIPT, linked);

    withFixtures([law({ officialTitles: ['基本方針(改訂)'] })], (pattern) => {
      for (const entry of [path.join(spaced, 'check.mjs'), linked]) {
        const res = spawnSync(process.execPath, [entry, pattern], { encoding: 'utf8' });
        assert.equal(res.status, 1, `${entry}: ${res.stdout}${res.stderr}`);
        assert.match(res.stderr, /1 件のずれ/);
      }
    });
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

// ---------------------------------------------------------------------------
// 実データ
// ---------------------------------------------------------------------------

test('リポジトリの法令ファイルは全件が一致している', () => {
  const count = lawFiles().length;
  assert.ok(count > 0, 'src/content/laws/ に md が無い');
  const { code, output } = runMain();
  assert.equal(code, 0, output);
  assert.match(output, new RegExp(`${count} ファイル`));
});

test('body-only マークは 3 件だけで、増えたら意識的に足す', () => {
  // マークは例外そのものなので、静かに増える経路を塞ぐ。腐敗と孤児は検査側が
  // 見ているが、「正しく足された 4 件目」は検査を通ってしまい、CLAUDE.md の
  // 件数だけが黙って古くなる。
  const found = [];
  for (const file of lawFiles()) {
    const text = fs.readFileSync(path.join(LAWS_DIR, file), 'utf8');
    for (const m of text.matchAll(/<!--[ \t]*body-only:[ \t]*(.*?)[ \t]*-->/g)) {
      found.push(`${file}: ${m[1]}`);
    }
  }
  assert.deepEqual(found, [
    'bullying-prevention-act.md: いじめの重大事態の調査に関するガイドライン(令和6年8月改訂版)',
    'copyright-act.md: 改正著作権法第35条運用指針(令和3(2021)年度版)',
    'copyright-act.md: 授業目的公衆送信補償金制度',
  ]);
});

// ---------------------------------------------------------------------------
// 配線 — 呼ばれなければガードは存在しないのと同じ
// ---------------------------------------------------------------------------

const pkg = JSON.parse(readRoot('package.json'));
const buildWorkflow = readRoot('.github/workflows/build.yml');

test('npm script check:sources が検査スクリプトを呼ぶ', () => {
  assert.match(pkg.scripts['check:sources'] ?? '', /scripts\/check-source-titles\.mjs/);
});

test('npm script test:content が scripts/__tests__/content/ を対象にしている', () => {
  const script = pkg.scripts['test:content'] ?? '';
  assert.match(script, /assert-test-files\.mjs 'scripts\/__tests__\/content\/\*\.test\.mjs'/);
  assert.match(script, /assert-test-results\.mjs \d+ 'scripts\/__tests__\/content\/\*\.test\.mjs'/);
});

test('test:workflows の glob は scripts/__tests__/content/ を拾わない', () => {
  // 混ぜると下限が両者の合計に効き、link-check のテストが減っても本ファイルの
  // 増分で埋め合わされて緑のままになる。
  const globs = [...(pkg.scripts['test:workflows'] ?? '').matchAll(/'([^']+)'/g)].map((m) => m[1]);
  assert.ok(globs.length > 0, 'test:workflows から glob を読み取れない');
  for (const g of globs) {
    assert.ok(!g.includes('**'), `test:workflows の glob が再帰的になっている: ${g}`);
    assert.ok(g.startsWith('scripts/__tests__/'), `想定外の glob: ${g}`);
  }
});

test('build.yml が check:sources を、前段が落ちても走る形で呼ぶ', () => {
  // **ステップ名では探さない。** 名前を書き写すと改名だけで赤くなる。守りたいのは
  // 「この run: が !cancelled() の下にある」ことなので run: 行に直接括り付ける。
  // 行頭を 8 桁で固定してあるので、`#` でコメントアウトすると外れて赤になる。
  assert.match(
    buildWorkflow,
    /^ {8}if: \$\{\{ !cancelled\(\) \}\}\n {8}run: npm run check:sources$/m,
    'build.yml から外れている / 前段が落ちると走らない形になっている',
  );
});

test('build.yml が test:workflows を、前段が落ちても走る形で呼ぶ', () => {
  // 相互配線の逆向き。あちらのステップを消しても、この口(test:content)は走るので
  // 赤にできる。`test:hooks` / `check:tokens` / `Type check` / `Build` は未防備。
  assert.match(
    buildWorkflow,
    /^ {8}if: \$\{\{ !cancelled\(\) \}\}\n {8}run: npm run test:workflows$/m,
    'build.yml から外れている / 前段が落ちると走らない形になっている',
  );
});

test('新しい 2 ステップに continue-on-error が付いていない', () => {
  // 付くと job は緑のまま検査だけが無効になる。link-check.yml で実際に起きた形。
  // **ステップの切れ目は名前ではなく `- ` で取る。** 名前で引くと改名で誤検知するし、
  // 8 桁インデントの行だけを集める形だと、空行を 1 つ挟まれた続きを見落とす。
  const steps = buildWorkflow.split(/^(?= {6}- )/m);
  for (const command of ['npm run check:sources', 'npm run test:content']) {
    const step = steps.find((s) => new RegExp(`^ {8}run: ${command}$`, 'm').test(s));
    assert.ok(step, `${command} を走らせるステップが build.yml に無い`);
    assert.doesNotMatch(step, /continue-on-error/, `${command} に continue-on-error が付いている`);
  }
});
