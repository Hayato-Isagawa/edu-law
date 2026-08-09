'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const path = require('node:path');
const {
  run,
  extractFrontmatter,
  captureProtectedFields,
  diffMaps,
  PROTECTED_KEYS,
  TARGET_PATH_RE,
} = require('../pre-edit-frontmatter-immutable.cjs');

const LAW_PATH = 'src/content/laws/basic-act-on-education.md';

const edit = (oldStr, newStr, filePath = LAW_PATH) =>
  JSON.stringify({
    tool_name: 'Edit',
    tool_input: { file_path: filePath, old_string: oldStr, new_string: newStr },
  });

const reasonOf = (out) => {
  assert.ok(out.stdout, 'expected the hook to emit stdout');
  return JSON.parse(out.stdout).hookSpecificOutput.permissionDecisionReason;
};

// --- 保護キーの集合 -------------------------------------------------------
//
// 期待値はここに直書きする。実装の PROTECTED_KEYS を for で回して
// 「各キーが発火する」だけを見ると、キーを削ったときにループが短くなるだけで
// 緑のまま通る(2026-08-09 に姉妹リポで実測したトートロジー)。

const EXPECTED_KEYS = [
  'title',
  'order',
  'eGovUrl',
  'url',
  'lastVerified',
  'publishedAt',
  'retrievedAt',
];

test('PROTECTED_KEYS: 実装の集合がテスト側の期待と一致する', () => {
  assert.deepEqual(PROTECTED_KEYS, EXPECTED_KEYS);
});

// 各キーが実際に発火することも、テスト側の表から回す。
const KEY_CASES = [
  { key: 'title', before: 'title: 教育基本法', after: 'title: 教育基本方' },
  { key: 'order', before: 'order: 11', after: 'order: 1' },
  {
    key: 'eGovUrl',
    before: 'eGovUrl: https://laws.e-gov.go.jp/law/418AC0000000120/',
    after: 'eGovUrl: https://laws.e-gov.go.jp/law/418AC0000000121/',
  },
  {
    key: 'url',
    before: '    url: https://www.mext.go.jp/b_menu/kihon/index.htm',
    after: '    url: https://www.mext.go.jp/b_menu/kihon/index2.htm',
  },
  { key: 'lastVerified', before: 'lastVerified: "2026-05-28"', after: 'lastVerified: "2026-08-09"' },
  { key: 'publishedAt', before: '    publishedAt: "2022-12-06"', after: '    publishedAt: "2022-12-16"' },
  { key: 'retrievedAt', before: '    retrievedAt: "2026-05-28"', after: '    retrievedAt: "2026-08-09"' },
];

test('KEY_CASES: 期待キーが網羅されている', () => {
  assert.deepEqual(KEY_CASES.map(c => c.key), EXPECTED_KEYS);
});

for (const { key, before, after } of KEY_CASES) {
  test(`Edit: ${key} の変更で ask が出る`, () => {
    const reason = reasonOf(run(edit(before, after)));
    // buildReason は `  <key>:` の形で出す。`url` が `urls (inspected chunk)`
    // に巻き込まれて偽陽性にならないよう行頭アンカーで見る。
    assert.match(reason, new RegExp(`^  ${key}:$`, 'm'));
  });
}

// --- フェンス無しペイロード ----------------------------------------------
//
// 実際の Edit は `---` を含まない断片で来る。姉妹リポ edu-evidence 版は
// extractFrontmatter が null を返すとそのまま [] を返しており、
// **普通の Edit がすべて素通り**していた(2026-08-09 に発覚・修正済み)。
// 移植元に edu-watch 版を選んだ理由そのものなので、回帰テストを置く。

test('フェンス無し: lastVerified の 1 行 Edit で発火する', () => {
  const out = run(edit('lastVerified: "2026-05-28"', 'lastVerified: "2026-08-09"'));
  assert.equal(out.exitCode, 0);
  assert.match(reasonOf(out), /^  lastVerified:$/m);
});

test('フェンス無し: eGovUrl の法令 ID 1 文字違いで発火する', () => {
  const reason = reasonOf(run(edit(
    'eGovUrl: https://laws.e-gov.go.jp/law/322AC0000000026/',
    'eGovUrl: https://laws.e-gov.go.jp/law/322AC0000000025/',
  )));
  assert.match(reason, /^  eGovUrl:$/m);
  assert.match(reason, /322AC0000000026/);
  assert.match(reason, /322AC0000000025/);
});

test('フェンスあり: 従来どおり frontmatter ブロックを見る', () => {
  const oldS = '---\ntitle: 教育基本法\norder: 11\n---\n\n本文。';
  const newS = '---\ntitle: 教育基本法\norder: 12\n---\n\n本文。';
  assert.match(reasonOf(run(edit(oldS, newS))), /^  order:$/m);
});

// --- URL 多重集合 ---------------------------------------------------------

test('officialExplanations の url 差し替えで urls も報告される', () => {
  const oldS = [
    '---',
    'officialExplanations:',
    '  - publisher: mext',
    '    url: https://www.mext.go.jp/a.htm',
    '---',
  ].join('\n') + '\n';
  const newS = oldS.replace('www.mext.go.jp/a.htm', 'www.mhlw.go.jp/b.htm');
  const reason = reasonOf(run(edit(oldS, newS)));
  assert.match(reason, /^  urls \(inspected chunk\):$/m);
});

// 比較は 2 系統ある。__urls__ はソートした多重集合(集合が同じなら黙る)、
// キー別の値は文書順の配列(並びが変われば鳴る)。officialExplanations の
// 並べ替えは title↔url の対応が崩れる典型なので、鳴る側で正しい。
test('URL の並べ替え: url キーは発火し、__urls__ は差分を出さない', () => {
  const oldS = '  - url: https://a.go.jp/1\n  - url: https://a.go.jp/2';
  const newS = '  - url: https://a.go.jp/2\n  - url: https://a.go.jp/1';
  const reason = reasonOf(run(edit(oldS, newS)));
  assert.match(reason, /^  url:$/m);
  assert.doesNotMatch(reason, /^  urls \(inspected chunk\):$/m);
});

test('本文リンクの差し替えでも発火する(このサイトでは本文 URL も商品)', () => {
  const out = run(edit(
    '詳細は[生徒指導提要](https://www.mext.go.jp/content/a.pdf)を参照。',
    '詳細は[生徒指導提要](https://www.mext.go.jp/content/b.pdf)を参照。',
  ));
  assert.match(reasonOf(out), /^  urls \(inspected chunk\):$/m);
});

// チャンクが `---` で始まると extractFrontmatter が閉じフェンス以降を捨てるため、
// 検査窓を frontmatter に狭めると**ファイル先頭から書き直す形の Edit でだけ**
// 本文リンクの監視が外れる。モデルが法令エントリを丸ごと書き直す場面がまさに
// この形なので、いちばん守りたいときに外れることになる(2026-08-09 に実測)。
test('フェンス込みチャンクでも本文リンクの差し替えで発火する', () => {
  const body = (u) => `---\ntitle: 学校教育法\n---\n\n詳細は[提要](${u})を参照。`;
  const out = run(edit(body('https://www.mext.go.jp/a.pdf'), body('https://www.mext.go.jp/b.pdf')));
  assert.match(reasonOf(out), /^  urls \(inspected chunk\):$/m);
});

test('フェンス込みチャンクで本文だけ推敲しても発火しない', () => {
  const out = run(edit(
    '---\ntitle: 学校教育法\n---\n\n本文 https://a.go.jp/1 参照。',
    '---\ntitle: 学校教育法\n---\n\n本文 https://a.go.jp/1 を参照。',
  ));
  assert.ok(!out.stdout);
});

// URL の切り出し境界。緩めると本文の句読点や括弧の差し替えで鳴り始める。
test('URL の切り出し: markdown リンクの閉じ括弧・引用符で止まる', () => {
  const m = captureProtectedFields('[提要](https://a.go.jp/1)。 <https://b.go.jp/2> "https://c.go.jp/3"');
  assert.deepEqual(m.get('__urls__'), ['https://a.go.jp/1', 'https://b.go.jp/2', 'https://c.go.jp/3']);
});

test('URL の切り出し: 直前に文字が続くものは URL として扱わない', () => {
  assert.equal(captureProtectedFields('xhttps://a.go.jp/1').get('__urls__'), undefined);
});

test('URL の切り出し: スキームだけの文字列は拾わない', () => {
  assert.equal(captureProtectedFields('https:// と書いただけ').get('__urls__'), undefined);
});

test('本文の句読点だけを直しても発火しない', () => {
  const out = run(edit(
    '詳細は[提要](https://a.go.jp/1)。次に',
    '詳細は[提要](https://a.go.jp/1)、次に',
  ));
  assert.ok(!out.stdout);
});

test('重複 URL の 1 本削除で発火する(集合ではなく多重集合)', () => {
  const out = run(edit(
    '  - url: https://a.go.jp/1\n  - url: https://a.go.jp/1',
    '  - url: https://a.go.jp/1',
  ));
  assert.match(reasonOf(out), /^  urls \(inspected chunk\):$/m);
});

// --- 誤検知しないこと -----------------------------------------------------

test('本文のみの編集では発火しない', () => {
  const out = run(edit('学校現場でよく参照される。', '学校現場でとくによく参照される。'));
  assert.equal(out.exitCode, 0);
  assert.ok(!out.stdout);
});

test('summary の変更では発火しない(保護対象外)', () => {
  const out = run(edit(
    '---\ntitle: 教育基本法\nsummary: 古い要約\n---\n',
    '---\ntitle: 教育基本法\nsummary: 新しい要約\n---\n',
  ));
  assert.ok(!out.stdout);
});

test('tags の変更では発火しない(保護対象外)', () => {
  const out = run(edit('tags: []', 'tags: ["生徒指導"]'));
  assert.ok(!out.stdout);
});

// キー正規表現が「何を拾わないか」も固定する。ここが緩むと、
// 本文の `URL:` や `subtitle:` を保護キーとして拾い、鳴りすぎるガードになる。
// 鳴りすぎるガードは ask を空押しさせるので、見逃しと同じくらい危険。

test('subtitle の変更では発火しない(title の前方一致で拾わない)', () => {
  assert.ok(!run(edit('subtitle: 旧', 'subtitle: 新')).stdout);
  assert.ok(!run(edit('  eGovUrlMemo: a', '  eGovUrlMemo: b')).stdout);
});

test('本文中の大文字キー(Title: / URL:)は拾わない', () => {
  assert.ok(!run(edit('> Title: 旧タイトル', '> Title: 新タイトル')).stdout);
  assert.ok(!run(edit('URL: /a', 'URL: /b')).stdout);
});

test('値が空のキーは拾わない', () => {
  const m = captureProtectedFields('title:\norder: 1');
  assert.equal(m.get('title'), undefined);
  assert.deepEqual(m.get('order'), ['1']);
});

test('前後の引用符だけを剥がす(値の途中の引用符は残す)', () => {
  const m = captureProtectedFields('title: "教育基本法"\norder: 1\nlastVerified: 教育"基本"法');
  assert.deepEqual(m.get('title'), ['教育基本法']);
  assert.deepEqual(m.get('lastVerified'), ['教育"基本"法']);
});

test('引用符の有無だけの変更では発火しない', () => {
  assert.ok(!run(edit('lastVerified: "2026-05-28"', "lastVerified: '2026-05-28'")).stdout);
});

// 値を連結して比較すると ['a','b'] と ['a,b'] が同一視される。
test('値の個数が変わる編集を、連結して見逃さない', () => {
  assert.match(reasonOf(run(edit('title: a\ntitle: b', 'title: a,b'))), /^  title:$/m);
});

test('保護フィールドの「追加」も差分として報告する', () => {
  const reason = reasonOf(run(edit(
    '  - publisher: mext\n    url: https://a.go.jp/1',
    '  - publisher: mext\n    url: https://a.go.jp/1\n  - publisher: mhlw\n    url: https://b.go.jp/2',
  )));
  assert.match(reason, /^  url:$/m);
});

test('保護フィールドの純粋な削除・挿入でも発火する', () => {
  assert.match(reasonOf(run(edit('lastVerified: "2026-05-28"', ''))), /^  lastVerified:$/m);
  assert.match(reasonOf(run(edit('', 'lastVerified: "2026-08-09"'))), /^  lastVerified:$/m);
});

// --- 対象パス -------------------------------------------------------------

test('TARGET_PATH_RE: laws 配下にマッチする', () => {
  assert.match('src/content/laws/school-education-act.md', TARGET_PATH_RE);
  assert.match('/Users/H/edu-law/src/content/laws/school-education-act.md', TARGET_PATH_RE);
  assert.match('src/content/laws/x.mdx', TARGET_PATH_RE);
  // 大文字小文字を無視する。macOS の既定 FS は case-insensitive なので、
  // 同じファイルが別表記で届いても対象から外れない
  assert.match('SRC/CONTENT/LAWS/X.MD', TARGET_PATH_RE);
});

test('TARGET_PATH_RE: パス境界を無視して部分一致しない', () => {
  assert.doesNotMatch('xsrc/content/laws/x.md', TARGET_PATH_RE);
});

test('TARGET_PATH_RE: laws 以外は対象外', () => {
  assert.doesNotMatch('docs/decisions/0023-visual-regression-testing.md', TARGET_PATH_RE);
  assert.doesNotMatch('src/content/guides/x.md', TARGET_PATH_RE);
  assert.doesNotMatch('src/content/laws/sub/x.md', TARGET_PATH_RE);
  assert.doesNotMatch('src/content/laws/x.ts', TARGET_PATH_RE);
  assert.doesNotMatch('src/content/laws/x.md.bak', TARGET_PATH_RE);
  assert.doesNotMatch('other/src/content/lawsuits/x.md', TARGET_PATH_RE);
});

test('対象外パスなら保護キーが変わっても素通りする', () => {
  const out = run(edit('lastVerified: "2026-05-28"', 'lastVerified: "2026-08-09"', 'docs/x.md'));
  assert.ok(!out.stdout);
});

// --- 理由文 ---------------------------------------------------------------
//
// 理由文は ask の場で人間が読む唯一の情報。ここが壊れると、
// ガードは「鳴るが何も伝えない」状態になり、空押しを育てる。

test('理由文にファイルパスが入る', () => {
  assert.match(reasonOf(run(edit('order: 11', 'order: 12'))), /src\/content\/laws\/basic-act-on-education\.md/);
});

test('片側が空のときは ∅ を出す', () => {
  const reason = reasonOf(run(edit('lastVerified: "2026-05-28"', '')));
  assert.match(reason, /before: 2026-05-28/);
  assert.match(reason, /after: {2}∅/);
});

test('複数値は区切って並べる', () => {
  const reason = reasonOf(run(edit('title: a\ntitle: b', 'title: a\ntitle: c')));
  assert.match(reason, /before: a \| b/);
  assert.match(reason, /after: {2}a \| c/);
});

// 素朴な先頭切り詰めは、この repo の実データで before/after を同一に見せる。
// mext の content URL には 57 文字目まで一致する 3 本組が実在する。
test('長い URL でも差分の箇所が理由文に残る', () => {
  const base = 'https://www.mext.go.jp/content/20260423-mxt_syoto01-000028144_0';
  const reason = reasonOf(run(edit(`    url: ${base}1.pdf`, `    url: ${base}2.pdf`)));
  const before = reason.match(/before: (.+)/)[1];
  const after = reason.match(/after: {2}(.+)/)[1];
  assert.notEqual(before, after, '理由文の before と after が同一では確認しようがない');
});

// --- 探索コスト -----------------------------------------------------------
//
// settings.json の `timeout: 5` を超えるとプロセスが kill され、stdout が
// 出ない = ガードが黙って素通りする。ここが唯一の fail-open 経路なので、
// 空白の多い入力で二次的に膨らむ書き方に戻っていないかを見る。
test('空白の多い入力でも探索が線形にとどまる', () => {
  const started = process.hrtime.bigint();
  captureProtectedFields(' '.repeat(256 * 1024));
  const ms = Number(process.hrtime.bigint() - started) / 1e6;
  assert.ok(ms < 1000, `256KB の空白に ${ms.toFixed(0)}ms かかった(二次挙動の疑い)`);
});

// --- MultiEdit / 入力の頑健性 --------------------------------------------

test('MultiEdit: 1 件でも保護キーが変われば発火する', () => {
  const out = run(JSON.stringify({
    tool_name: 'MultiEdit',
    tool_input: {
      file_path: LAW_PATH,
      edits: [
        { old_string: '本文の typo', new_string: '本文の typo 修正' },
        { old_string: 'order: 11', new_string: 'order: 3' },
      ],
    },
  }));
  assert.match(reasonOf(out), /^  order:$/m);
});

// 保護変更を末尾にだけ置くと「最後の 1 件しか見ない」実装を見逃す。両端を置く。
test('MultiEdit: 保護変更が 1 件目にあっても発火する', () => {
  const out = run(JSON.stringify({
    tool_name: 'MultiEdit',
    tool_input: {
      file_path: LAW_PATH,
      edits: [
        { old_string: 'order: 11', new_string: 'order: 3' },
        { old_string: '本文の typo', new_string: '本文の typo 修正' },
      ],
    },
  }));
  assert.match(reasonOf(out), /^  order:$/m);
});

test('MultiEdit: すべて本文なら発火しない', () => {
  const out = run(JSON.stringify({
    tool_name: 'MultiEdit',
    tool_input: {
      file_path: LAW_PATH,
      edits: [{ old_string: '本文 a', new_string: '本文 b' }],
    },
  }));
  assert.ok(!out.stdout);
});

test('Edit 以外のツールは無視する', () => {
  assert.ok(!run(JSON.stringify({ tool_name: 'Bash', tool_input: {} })).stdout);
  assert.ok(!run(JSON.stringify({
    tool_name: 'Write',
    tool_input: { file_path: LAW_PATH, content: 'order: 1' },
  })).stdout);
});

test('壊れた入力でも落ちない', () => {
  assert.equal(run('not json').exitCode, 0);
  assert.equal(run('').exitCode, 0);
  assert.equal(run({}).exitCode, 0);
});

// --- 補助関数 -------------------------------------------------------------

test('extractFrontmatter: フェンスがあれば中身、無ければ null', () => {
  assert.equal(extractFrontmatter('---\norder: 1\n---\n本文'), 'order: 1');
  assert.equal(extractFrontmatter('order: 1'), null);
  assert.equal(extractFrontmatter(''), null);
});

test('captureProtectedFields: ネストした title/url をリストとして拾う', () => {
  const fm = [
    'title: 学校教育法',
    'officialExplanations:',
    '  - publisher: mext',
    '    title: 生徒指導提要(改訂版)',
    '    url: https://www.mext.go.jp/content/a.pdf',
  ].join('\n');
  const m = captureProtectedFields(fm);
  assert.deepEqual(m.get('title'), ['学校教育法', '生徒指導提要(改訂版)']);
  assert.deepEqual(m.get('url'), ['https://www.mext.go.jp/content/a.pdf']);
});

test('diffMaps: 片側にしか無いキーも差分になる', () => {
  const before = new Map([['order', ['1']]]);
  const after = new Map();
  assert.deepEqual(diffMaps(before, after), [{ key: 'order', before: ['1'], after: [] }]);
});

// --- CLI 配線 -------------------------------------------------------------
//
// フックは本番では子プロセスとして起動され、stdout と exit code だけが
// Claude Code に届く。run() の戻り値しか見ないテストは、
// `process.stdout.write(out.stdout)` を消しても `process.exit` を潰しても緑になる
// (2026-08-09 に姉妹リポで実測)。ここだけは実際に spawn する。

const HOOK = path.join(__dirname, '..', 'pre-edit-frontmatter-immutable.cjs');
const runCli = (payload) => spawnSync(process.execPath, [HOOK], { input: payload, encoding: 'utf8' });

test('CLI: 保護フィールドの変更で permissionDecision を stdout に出す', () => {
  const res = runCli(edit('lastVerified: "2026-05-28"', 'lastVerified: "2026-08-09"'));
  assert.equal(res.status, 0);
  const parsed = JSON.parse(res.stdout);
  assert.equal(parsed.hookSpecificOutput.hookEventName, 'PreToolUse');
  assert.equal(parsed.hookSpecificOutput.permissionDecision, 'ask');
  assert.match(parsed.hookSpecificOutput.permissionDecisionReason, /^  lastVerified:$/m);
});

test('CLI: 理由は stderr にも出る', () => {
  const res = runCli(edit('order: 11', 'order: 12'));
  assert.match(res.stderr, /frontmatter-immutable/);
});

test('CLI: 変更が無ければ何も出さずに 0 で終わる', () => {
  const res = runCli(edit('本文をすこし直した', '本文をもうすこし直した'));
  assert.equal(res.status, 0);
  assert.equal(res.stdout.trim(), '');
});

test('CLI: 壊れた入力でも 0 で終わる', () => {
  assert.equal(runCli('{not json').status, 0);
  assert.equal(runCli('').status, 0);
});

test('CLI: 前後に空白のある JSON でも読む', () => {
  const res = runCli('\n  ' + edit('order: 11', 'order: 12') + '\n');
  assert.match(JSON.parse(res.stdout).hookSpecificOutput.permissionDecisionReason, /^  order:$/m);
});

// --- settings.json への登録 ------------------------------------------------
//
// ここまでのテストはフックの**中身**しか見ていない。settings.json から
// PreToolUse ブロックを丸ごと消してもすべて緑のまま通る。実際にこのファミリーでは
// 2026-08-09 に「matcher の書き間違いで 3 本のガードが数週間死んでいた」事故が
// あったので、刺さっていること自体を固定する。

const SETTINGS = path.join(__dirname, '..', '..', 'settings.json');

test('settings.json: PreToolUse に Edit|MultiEdit で登録されている', () => {
  const settings = JSON.parse(require('node:fs').readFileSync(SETTINGS, 'utf8'));
  const blocks = settings.hooks?.PreToolUse ?? [];
  const entry = blocks
    .filter(b => b.matcher === 'Edit|MultiEdit')
    .flatMap(b => b.hooks ?? [])
    .find(h => h.command?.includes('pre-edit-frontmatter-immutable.cjs'));
  assert.ok(entry, 'PreToolUse に matcher "Edit|MultiEdit" のこのフックが見つからない');
  assert.equal(entry.type, 'command');
  assert.match(entry.command, /^node "\$CLAUDE_PROJECT_DIR"\/\.claude\/hooks\//);
});

test('settings.json: 既存の branch-guard の登録を壊していない', () => {
  const settings = JSON.parse(require('node:fs').readFileSync(SETTINGS, 'utf8'));
  const found = (settings.hooks?.PreToolUse ?? [])
    .filter(b => b.matcher === 'Edit|Write|MultiEdit')
    .flatMap(b => b.hooks ?? [])
    .some(h => h.command?.includes('branch-guard.sh'));
  assert.ok(found, 'branch-guard.sh の登録が失われている');
});
