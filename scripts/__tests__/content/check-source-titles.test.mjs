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

import {
  collectProseFiles,
  inspect,
  inspectHighlights,
  inspectProse,
  extractMarks,
  main,
  mainAll,
  parsePublisherLabels,
} from '../../check-source-titles.mjs';

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

/** 実データと同じ発行元名。`inspect` / `inspectProse` はこれを直前に持つ引用だけを書名とみなす。 */
const PUBLISHERS = ['文部科学省', '総務省', '文化庁', 'こども家庭庁'];

const problemsOf = (source) => inspect('fixture.md', source, PUBLISHERS).problems;

/** `src/data/publishers.ts` の最小形。フィクスチャ root に置く。 */
const publishersTs = (labels = PUBLISHERS) =>
  [
    'export const PUBLISHER_LABELS: Record<string, string> = {',
    ...labels.map((l, i) => `  p${i}: "${l}",`),
    '  other: "その他",',
    '};',
  ].join('\n');

/** `src/pages/index.astro` の Highlights の最小形。 */
const highlightsAstro = (entries) =>
  [
    '---',
    'const highlights = [',
    ...entries.map(({ title, href }) =>
      ['  {', `    title: "${title}",`, `    href: "${href}",`, '  },'].join('\n'),
    ),
    '] as const;',
    '---',
    '',
    '<main></main>',
  ].join('\n');

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

/**
 * フィクスチャの「リポジトリ root」を組み立てる。
 * `mainAll` は root 起点で全箇所を見るので、法令 md だけの一時ディレクトリでは赤の経路を回せない。
 */
function withRoot({ laws = [law()], prose = {}, publishers = publishersTs(), highlights }, fn) {
  // 既定の Highlights は法令フィクスチャの `officialExplanations[0]` から導く。
  // ここを固定値にすると、法令を差し替えたテストが Highlights 側の赤で汚れる。
  if (highlights === undefined) {
    highlights = highlightsAstro(
      laws.map((src, i) => ({
        title: src.match(/^ {4}title: (.*)$/m)?.[1] ?? '',
        href: `/laws/law-${i}/`,
      })),
    );
  }
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'edu-law-root-'));
  const write = (rel, body) => {
    const p = path.join(dir, rel);
    fs.mkdirSync(path.dirname(p), { recursive: true });
    fs.writeFileSync(p, body);
  };
  try {
    laws.forEach((src, i) => write(path.join('src', 'content', 'laws', `law-${i}.md`), src));
    if (publishers !== null) write(path.join('src', 'data', 'publishers.ts'), publishers);
    if (highlights !== null) write(path.join('src', 'pages', 'index.astro'), highlights);
    for (const [rel, body] of Object.entries(prose)) write(rel, body);
    return fn(dir);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

/** スクリプトを別プロセスで実行する(CLI の入口と exit code をそのまま見る)。 */
const runCli = (...args) => spawnSync(process.execPath, [SCRIPT, ...args], { encoding: 'utf8' });

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

test('出典節の外でも、発行元名付きの引用は見る', () => {
  // #194 が直した drift のうち 2 件は出典節の外(frontmatter の summary)にあった。
  // 「出典節だけを見る」設計はそこを構造的に取り逃がす。
  const source = law().replace(
    '## 法令本文',
    '## 解説\n\n文部科学省『本文だけに出る資料』を参照。\n\n## 法令本文',
  );
  const problems = problemsOf(source);
  assert.equal(problems.length, 1);
  assert.match(problems[0], /本文の『本文だけに出る資料』/);
});

test('出典節の外の引用も body-only マークで例外にできる', () => {
  const source = law().replace(
    '## 法令本文',
    '## 解説\n\n文部科学省『本文だけに出る資料』を参照。\n<!-- body-only: 本文だけに出る資料 -->\n\n## 法令本文',
  );
  assert.deepEqual(problemsOf(source), []);
});

test('発行元名を伴わない引用は、出典節の外では見ない', () => {
  // `法令` や `学校安全` のように普通名詞と同じ書名が正本にあるので、
  // 括弧引用を全部拾うと散文が直せない赤になる。
  const source = law().replace('## 法令本文', '## 解説\n\n『どこにも無い名前』\n\n## 法令本文');
  assert.deepEqual(problemsOf(source), []);
});

test('出典節は次の見出しで終わる', () => {
  // `## 付録` 以降は出典節ではないので「全引用を照合」の対象外。
  // ただし発行元名付きなので本文側の検査には掛かる。
  const problems = problemsOf(`${law()}\n## 付録\n\n文部科学省『付録の書名』\n`);
  assert.equal(problems.length, 1);
  assert.match(problems[0], /本文の『付録の書名』/);
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
// frontmatter の summary — #194 の drift 11 件のうち 2 件がここにあった
// ---------------------------------------------------------------------------

const withSummary = (text, opts) => law(opts).replace('summary: テスト用。', `summary: ${text}`);

test('summary の発行元名付き引用が正本と一致していれば通る', () => {
  assert.deepEqual(problemsOf(withSummary('文部科学省『基本方針』が中心。')), []);
});

test('summary の引用がずれていれば落ちる', () => {
  const problems = problemsOf(withSummary('文部科学省『基本方針(旧)』が中心。'));
  assert.equal(problems.length, 1);
  assert.match(problems[0], /summaryの『基本方針\(旧\)』/);
});

test('summary のずれが空白だけなら、そう言う', () => {
  // #194 の drift 11 件のうち 5 件は空白 1 個の差だった。目で探させない。
  const problems = problemsOf(withSummary('文部科学省『基本 方針』が中心。'));
  assert.equal(problems.length, 1);
  assert.match(problems[0], /空白だけが違う/);
});

test('summary の発行元名を伴わない引用は見ない', () => {
  assert.deepEqual(problemsOf(withSummary('旧「学校保健法」から改称した。')), []);
});

test('summary の引用は YAML 行末の # body-only: マークで例外にできる', () => {
  assert.deepEqual(
    problemsOf(withSummary('文部科学省『短縮形』が中心。 # body-only: 短縮形')),
    [],
  );
});

test('summary の腐ったマーク(正本に在る書名を指す)は落ちる', () => {
  const problems = problemsOf(withSummary('文部科学省『基本方針』。 # body-only: 基本方針'));
  assert.equal(problems.length, 1);
  assert.match(problems[0], /frontmatter に在る書名を指している/);
});

test('summary の孤児マーク(対応する引用が無い)は落ちる', () => {
  const problems = problemsOf(withSummary('本文のみ。 # body-only: どこにも無い'));
  assert.equal(problems.length, 1);
  assert.match(problems[0], /対応する引用がsummaryに無い/);
});

test('summary に閉じていない括弧があれば落ちる', () => {
  const problems = problemsOf(withSummary('文部科学省『基本方針が中心。'));
  assert.equal(problems.length, 1);
  assert.match(problems[0], /summary に閉じていない括弧がある/);
});

test('summary がブロックスカラーなら、空で照合せずに落ちる', () => {
  // ここを緩めると `summary: >-` に変えるだけで検査が黙って 0 件になる。
  const problems = problemsOf(law().replace('summary: テスト用。', 'summary: >-\n  テスト用。'));
  assert.equal(problems.length, 1);
  assert.match(problems[0], /summary を 1 行で読み取れない/);
});

test('summary が無ければ落ちる', () => {
  const problems = problemsOf(law().replace('summary: テスト用。\n', ''));
  assert.equal(problems.length, 1);
  assert.match(problems[0], /frontmatter に summary: が無い/);
});

// ---------------------------------------------------------------------------
// 発行元名の一覧 — ここが読めないと、出典節以外の全箇所が黙って緑になる
// ---------------------------------------------------------------------------

test('PUBLISHER_LABELS から発行元名を読む(その他は除く)', () => {
  const labels = parsePublisherLabels(publishersTs(['文部科学省', '総務省']));
  assert.deepEqual(labels, ['文部科学省', '総務省']);
});

test('PUBLISHER_LABELS を読めなければ、空で返さずに落ちる', () => {
  assert.throws(() => parsePublisherLabels('export const PUBLISHER_LABELS = {};'), /読み取れない/);
});

test('発行元を足すと、書名として認識される範囲も広がる', () => {
  // 写しを持たない設計の要。publishers.ts に足した発行元がそのまま効く。
  const source = law().replace('## 法令本文', '## 解説\n\n内閣府『新しい資料』\n\n## 法令本文');
  assert.deepEqual(inspect('fixture.md', source, ['文部科学省']).problems, []);
  assert.equal(inspect('fixture.md', source, ['文部科学省', '内閣府']).problems.length, 1);
});

// ---------------------------------------------------------------------------
// 法令 md 以外(`.astro` / `.ts`) — #194 の drift 11 件のうち 4 件がここにあった
// ---------------------------------------------------------------------------

const prose = (src, official = ['基本方針']) =>
  inspectProse('fixture.ts', src, official, PUBLISHERS).problems;

test('発行元名付きの引用が正本と一致していれば通る', () => {
  assert.deepEqual(prose('const t = "文部科学省『基本方針』の公式解説";'), []);
});

test('発行元名付きの引用がずれていれば落ちる', () => {
  const problems = prose('const t = "文部科学省『基本方針(旧)』の公式解説";');
  assert.equal(problems.length, 1);
  assert.match(problems[0], /『基本方針\(旧\)』/);
});

test('「」で書かれた書名も、発行元名が直前にあれば見る', () => {
  // #194 が直した `総務省「地方公務員制度」` はこの形。『』だけを見ていると取り逃がす。
  const problems = prose('const t = "総務省「基本方針(旧)」の公式解説";');
  assert.equal(problems.length, 1);
  assert.match(problems[0], /「基本方針\(旧\)」/);
});

test('発行元名を伴わない「」(UI ラベル・ページ名)は見ない', () => {
  // changelog.ts には「最近の更新」「場面から探す」等が 30 件超ある。
  // ここを対象にすると例外が 34 件必要になり、`法令` のような正本が直せない赤になる。
  assert.deepEqual(prose('const t = "「最近の更新」と「場面から探す」";'), []);
});

test('// body-only: マークで例外にできる', () => {
  assert.deepEqual(
    prose('// body-only: ガイド固有資料\nconst t = "文部科学省『ガイド固有資料』";'),
    [],
  );
});

test('.ts の腐ったマーク・孤児マークは落ちる', () => {
  assert.match(
    prose('// body-only: 基本方針\nconst t = "文部科学省『基本方針』";')[0],
    /frontmatter に在る書名を指している/,
  );
  assert.match(prose('// body-only: どこにも無い\nconst t = "";')[0], /対応する引用が本文に無い/);
});

test('https:// を含む文字列はマーク抽出を壊さない', () => {
  // `//` コメント一般を剥がす実装だと URL の後ろが消え、引用が検査の外へ出る。
  assert.equal(prose('const u = "https://example.go.jp/文部科学省『基本方針(旧)』";').length, 1);
});

// ---------------------------------------------------------------------------
// トップの Highlights — #194 の drift 11 件のうち 5 件がここにあった
// ---------------------------------------------------------------------------

const LAWS = new Map([
  ['alpha', ['甲の一', '甲の二']],
  ['beta', ['乙の一']],
]);
const HL = [
  { title: '甲の一', href: '/laws/alpha/' },
  { title: '乙の一', href: '/laws/beta/' },
];
const hl = (entries) => inspectHighlights('index.astro', highlightsAstro(entries), LAWS);

test('Highlights が officialExplanations[0] と一致していれば通る', () => {
  assert.deepEqual(hl(HL), []);
});

test('Highlights の書名がずれていれば落ちる', () => {
  const problems = hl([{ title: '甲の 一', href: '/laws/alpha/' }, HL[1]]);
  assert.equal(problems.length, 1);
  assert.match(problems[0], /空白だけが違う/);
  assert.match(problems[0], /並び順を先に変える/);
});

test('officialExplanations[1] を代表に出していたら落ちる', () => {
  // ADR 0009 第三基準は起点を [0] に置いている。差し替えたいなら collection 側を並べ替える。
  assert.match(hl([{ title: '甲の二', href: '/laws/alpha/' }, HL[1]])[0], /\[0\] と違う/);
});

test('別法令の書名を出していたら落ちる', () => {
  // #194 が直した児童福祉法カードがこの型(リンク先に 1 件も無い書名を出していた)。
  assert.match(hl([{ title: '乙の一', href: '/laws/alpha/' }, HL[1]])[0], /\[0\] と違う/);
});

test('法令が Highlights に出ていなければ落ちる', () => {
  // #195 が直した「7 件のまま黙って縮む」経路。
  assert.match(hl([HL[0]])[0], /beta が highlight に出ていない/);
});

test('同じ法令を 2 回出していたら落ちる', () => {
  assert.match(hl([HL[0], HL[0], HL[1]])[0], /同じ法令を 2 回/);
});

test('存在しない法令を指していたら落ちる', () => {
  assert.match(hl([...HL, { title: '甲の一', href: '/laws/zzz/' }])[0], /存在しない法令/);
});

test('href が /laws/<slug>/ の形でなければ落ちる', () => {
  assert.match(hl([...HL, { title: '甲の一', href: '/guides/x/' }])[0], /href が/);
});

test('prettier が折り返した title も読める', () => {
  const src = highlightsAstro(HL).replace('    title: "甲の一",', '    title:\n      "甲の一",');
  assert.deepEqual(inspectHighlights('index.astro', src, LAWS), []);
});

test('Highlights が読めない形は、0 件で素通りせずに落ちる', () => {
  const base = highlightsAstro(HL);
  const broken = {
    '配列名の rename': base.replace('const highlights = [', 'const cards = ['),
    'as const の除去': base.replace('] as const;', '];'),
    satisfies化: base.replace('] as const;', '] satisfies Card[];'),
    空配列: highlightsAstro([]),
    title欠落: base.replace('    title: "甲の一",\n', ''),
    単一引用符: base.replace('"甲の一"', "'甲の一'"),
  };
  for (const [name, src] of Object.entries(broken)) {
    const problems = inspectHighlights('index.astro', src, LAWS);
    assert.ok(problems.length > 0, `${name}: 落ちていない`);
  }
});

// ---------------------------------------------------------------------------
// 走査範囲 — 「見ない側」だけを列挙しているので、新しい拡張子は既定で入る
// ---------------------------------------------------------------------------

test('知らない拡張子(.tsx)も既定で走査対象に入る', () => {
  // 走査する拡張子を列挙する設計だと、`.tsx` を新設して書名を置いたときに誰も見ない。
  withRoot({ prose: { 'src/components/Card.tsx': 'export const C = () => null;' } }, (root) => {
    const files = collectProseFiles(root).map((f) => path.relative(root, f));
    assert.ok(files.includes(path.join('src', 'components', 'Card.tsx')), files.join(' '));
  });
});

test('.css は走査しない', () => {
  withRoot({ prose: { 'src/styles/global.css': ':root { color: red; }' } }, (root) => {
    const files = collectProseFiles(root).map((f) => path.extname(f));
    assert.ok(!files.includes('.css'), files.join(' '));
  });
});

test('法令 md は prose 側では走査しない(二重に報告しない)', () => {
  withRoot({}, (root) => {
    const files = collectProseFiles(root).map((f) => path.relative(root, f));
    assert.ok(
      !files.some((f) => f.startsWith(path.join('src', 'content', 'laws'))),
      files.join(' '),
    );
  });
});

// ---------------------------------------------------------------------------
// mainAll — CI が走らせる経路。0 件で緑になる穴を塞ぐ
// ---------------------------------------------------------------------------

/** `mainAll` は診断を console に出すので、TAP に混ぜずに捕まえる。 */
function runAll(root) {
  const out = [];
  const { log, error } = console;
  console.log = (...a) => out.push(a.join(' '));
  console.error = (...a) => out.push(a.join(' '));
  try {
    return { code: mainAll(root), output: out.join('\n') };
  } finally {
    console.log = log;
    console.error = error;
  }
}

test('mainAll は全箇所が揃っていれば 0 を返す', () => {
  withRoot({}, (root) => {
    const { code, output } = runAll(root);
    assert.equal(code, 0, output);
  });
});

test('mainAll は法令 md が 0 件なら落ちる', () => {
  withRoot({ laws: [] }, (root) => {
    const { code, output } = runAll(root);
    assert.equal(code, 1);
    assert.match(output, /法令ファイルが 0 件/);
    assert.match(output, /移動・改名されていないか/);
  });
});

test('mainAll は publishers.ts が無ければ落ちる', () => {
  // 発行元名を読めないまま走らせると、出典節以外の全箇所が黙って緑になる。
  withRoot({ publishers: null }, (root) => {
    const { code, output } = runAll(root);
    assert.equal(code, 1);
    assert.match(output, /publishers\.ts が無い/);
  });
});

test('mainAll は index.astro が無ければ落ちる', () => {
  withRoot({ highlights: null }, (root) => {
    const { code, output } = runAll(root);
    assert.equal(code, 1);
    assert.match(output, /index\.astro が無い/);
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

test('--root の CLI は、ずれがあれば exit 1 で終わる', () => {
  // **`mainAll` のプロセス exit code を通す唯一の経路。** これが無いと
  // `return 1` を `return 0` に変える 1 文字の退行を恒久テストで固定できない。
  withRoot({ laws: [law({ officialTitles: ['基本方針(改訂)'] })] }, (root) => {
    const res = runCli('--root', root);
    assert.equal(res.status, 1, res.stdout + res.stderr);
    assert.match(res.stderr, /officialExplanations\[\]\.title に無い/);
  });
});

test('--root の CLI は、揃っていれば exit 0 で終わる', () => {
  withRoot({}, (root) => {
    const res = runCli('--root', root);
    assert.equal(res.status, 0, res.stdout + res.stderr);
  });
});

test('--root にディレクトリを渡さなければ落ちる', () => {
  const res = runCli('--root');
  assert.equal(res.status, 1);
  assert.match(res.stderr, /ディレクトリを指定してください/);
});

test('引数なしの CLI は全箇所を検査し、何を見たかを要約行に出す', () => {
  // **CI が走らせるのはこの経路だけ。** 引数ありの分岐しか見ていないと、
  // 三項を `main(argv[2])` に戻す退行が全テスト緑のまま通る。
  const res = runCli();
  assert.equal(res.status, 0, res.stdout + res.stderr);
  for (const part of ['法令', 'summary', '本文', 'src', 'Highlights']) {
    assert.match(res.stdout, new RegExp(part), `要約行に ${part} が無い`);
  }
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

    // **`--root` で渡す。** 複製したスクリプトからは ROOT が別の場所を指すので、
    // 引数なしや glob では「発行元名を読めない」という別の理由で 1 になり、
    // 入口の判定が働いたのかどうかが区別できない。
    withRoot({ laws: [law({ officialTitles: ['基本方針(改訂)'] })] }, (root) => {
      for (const entry of [path.join(spaced, 'check.mjs'), linked]) {
        const res = spawnSync(process.execPath, [entry, '--root', root], { encoding: 'utf8' });
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

test('リポジトリ全体が全箇所で一致している(CI が走らせる経路)', () => {
  // `main(DEFAULT_PATTERN)` を見るだけだと、CLI 既定が `mainAll()` になった後は
  // 「CI が実際に走らせる経路」を誰も見ていない状態になる。
  const { code, output } = runAll(ROOT);
  assert.equal(code, 0, output);
  assert.match(output, new RegExp(`法令 ${lawFiles().length} ファイル`));
});

test('リポジトリの法令ファイルは全件が一致している', () => {
  const count = lawFiles().length;
  assert.ok(count > 0, 'src/content/laws/ に md が無い');
  const { code, output } = runMain();
  assert.equal(code, 0, output);
  assert.match(output, new RegExp(`${count} ファイル`));
});

/** 実データの例外 15 件。内訳は 出典節 3 / summary 2 / `src` 側 10。 */
const EXPECTED_MARKS = [
  'src/content/laws/bullying-prevention-act.md [html]: いじめの重大事態の調査に関するガイドライン(令和6年8月改訂版)',
  'src/content/laws/bullying-prevention-act.md [yaml]: いじめの防止等のための基本的な方針',
  'src/content/laws/copyright-act.md [html]: 改正著作権法第35条運用指針(令和3(2021)年度版)',
  'src/content/laws/copyright-act.md [html]: 授業目的公衆送信補償金制度',
  'src/content/laws/personal-information-protection-act.md [yaml]: 教育データの利活用に係る留意事項',
  'src/data/changelog.ts [line]: いじめの重大事態の調査に関するガイドライン',
  'src/data/changelog.ts [line]: 学校における労働安全衛生管理体制の整備のために(第3版)',
  'src/data/changelog.ts [line]: 会計年度任用職員制度の運用に係る事務処理マニュアル',
  'src/data/changelog.ts [line]: 地方公務員 両立支援パスポート',
  'src/pages/guides/childcare-work-balance.astro [line]: 地方公務員 両立支援パスポート',
  'src/pages/guides/index.astro [line]: 学校における労働安全衛生管理体制の整備のために(第3版)',
  'src/pages/guides/index.astro [line]: 地方公務員 両立支援パスポート',
  'src/pages/guides/index.astro [line]: 会計年度任用職員制度の運用に係る事務処理マニュアル',
  'src/pages/guides/non-regular-teachers.astro [line]: 会計年度任用職員制度の運用に係る事務処理マニュアル',
  'src/pages/guides/occupational-safety-health.astro [line]: 学校における労働安全衛生管理体制の整備のために(第3版)',
];

test('body-only マークは 3 構文とも数え、増えたら意識的に足す', () => {
  // マークは例外そのものなので、静かに増える経路を塞ぐ。腐敗と孤児は検査側が
  // 見ているが、「正しく足された 1 件」は検査を通ってしまい、CLAUDE.md の
  // 件数だけが黙って古くなる。**3 構文すべてを走査する** — HTML コメントだけを
  // 数えていると、`// body-only:` と `# body-only:` が対象外のまま増える。
  const marks = [];
  const files = [
    ...lawFiles().map((f) => path.join(LAWS_DIR, f)),
    ...collectProseFiles(ROOT),
  ].sort();
  for (const file of files) {
    const text = fs.readFileSync(file, 'utf8');
    for (const syntax of ['html', 'yaml', 'line']) {
      for (const name of extractMarks(text, syntax)) {
        marks.push(`${path.relative(ROOT, file)} [${syntax}]: ${name}`);
      }
    }
  }
  assert.deepEqual(marks, EXPECTED_MARKS);
});

// ---------------------------------------------------------------------------
// 配線 — 呼ばれなければガードは存在しないのと同じ
// ---------------------------------------------------------------------------

const pkg = JSON.parse(readRoot('package.json'));
const buildWorkflow = readRoot('.github/workflows/build.yml');

test('npm script check:sources が、引数なしで検査スクリプトを呼ぶ', () => {
  // **引数の有無まで見る。** glob 引数が 1 つ付くだけで CLI は「法令 md だけを見る
  // 弱い方」に落ちるが、`match` で書いていると配線テストは緑のまま通る。
  assert.equal(pkg.scripts['check:sources'], 'node scripts/check-source-titles.mjs');
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
