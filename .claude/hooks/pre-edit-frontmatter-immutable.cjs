#!/usr/bin/env node
/**
 * PreToolUse hook (Edit | MultiEdit) — frontmatter immutable guard for edu-law.
 *
 * Blocks silent edits to high-stakes frontmatter fields in
 * src/content/laws/*.md (the 12 law entries).
 *
 * このサイトは自前の法解釈をせず「公式解説への入口」だけを提供する。
 * つまり **URL と識別子そのものが商品**で、e-Gov の法令 ID は不透明:
 *
 *   418AC0000000120 教育基本法 / 322AC0000000026 学校教育法
 *
 * 1 文字違えば別の実在法令を指し、それでも 200 が返る。link-check(lychee)も
 * astro check も e2e も vrt も、この誤りを構造的に検出できない。
 * lastVerified も同様で、黙って日付が進むと stale-check が
 * 「再確認していないものを確認済み」と報告する。
 *
 * Protected fields (any value change → permissionDecision="ask"):
 *   - title                 (法令名。officialExplanations[].title も同じキーで拾う)
 *   - order                 (一覧の並び。1〜12)
 *   - eGovUrl               (法令 ID を含む e-Gov URL)
 *   - url                   (officialExplanations[].url)
 *   - lastVerified          (鮮度管理の基準日)
 *   - publishedAt           (公式解説の公表日)
 *   - retrievedAt           (取得日。公共データ利用規約の明記義務)
 *
 * Plus: any URL set change in the inspected chunk. officialExplanations は
 * YAML リストなので、URL は多重集合として比較する。
 *
 * Backed by DELEGATE-52 (arxiv 2604.15597) — sparse silent corruption
 * (Claude 4.6 Opus 26.9% rate) most often targets numeric/URL frontmatter.
 */

'use strict';

const PROTECTED_KEYS = [
  'title',
  'order',
  'eGovUrl',
  'url',
  'lastVerified',
  'publishedAt',
  'retrievedAt',
];

const FRONTMATTER_RE = /^---\s*\n([\s\S]*?)\n---\s*(?:\n|$)/;
const LAW_PATH_RE = /(?:^|\/)src\/content\/laws\/[^/]+\.(md|mdx)$/i;
// ガイドページにも e-Gov リンクが 18 箇所(12 種の ID)直書きされている。
// コンテンツコレクションの外なので、パスを分けて拾う。
const PAGE_PATH_RE = /(?:^|\/)src\/pages\/.+\.astro$/i;
const URL_RE = /\bhttps?:\/\/[^\s)>"']+/gi;
// e-Gov の法令 ID を URL とは別に単独で拾う。
// `418AC0000000120` の下 1 桁だけを書き換える Edit は、チャンクに `https://` を
// 含まないので URL 集合にも `eGovUrl:` の行にも現れず、素通りしていた(実測)。
// **最も小さく最も危険な編集**なので、ID そのものを見る。
// 形は「元号年 3 桁 + 種別英字 + 番号」(322AC0000000026 / 321CONSTITUTION)。
// このパターンを src/ 全体に当てると 75 件マッチし、すべて実在の法令 ID だった
// (誤検出ゼロ)。
const EGOV_ID_RE = /\b\d{3}[A-Z][A-Z0-9]{6,}\b/g;
// 自サイトへのリンクと JSON-LD の語彙 URL は「公式解説への入口」ではないので外す。
// ガイドページには両者が 24 本あり、含めると本題と無関係な差分で鳴る。
const BOILERPLATE_URL_RE = /^https?:\/\/(?:[a-z0-9-]+\.)*(?:edu-evidence\.org|schema\.org)(?:[/:?#]|$)/i;

// .astro は `---` の中身が JS で、`title:` がデータとして何度も出てくる。
// 保護キーの抽出は法令エントリ(YAML frontmatter)だけに適用し、
// ページ側は URL の集合だけを見る。
function targetKind(filePath) {
  if (LAW_PATH_RE.test(filePath)) return 'law';
  if (PAGE_PATH_RE.test(filePath)) return 'page';
  return null;
}

function extractFrontmatter(s) {
  if (!s) return null;
  const m = s.match(FRONTMATTER_RE);
  return m ? m[1] : null;
}

// 保護キーは frontmatter の窓から、URL は編集断片の全体から拾う。
// 窓を分けているのは、チャンクが `---` で始まるときに extractFrontmatter が
// 閉じフェンス以降を捨てるため。同じ窓を使うと**ファイル先頭から書き直す形の
// Edit でだけ本文リンクの監視が外れる**(実測済み)。このサイトでは本文の
// 公式解説リンクも frontmatter の URL と同じく商品なので、そこは全体で見る。
function captureProtectedFields(fm, chunk = fm, { keys = true } = {}) {
  if (!fm && !chunk) return new Map();
  const map = new Map();
  for (const key of keys ? PROTECTED_KEYS : []) {
    // 前置きを `[ \t]*(?:-[ \t]*)?` にしてある。移植元の `\s*-?\s*` は
    // **隣り合う 2 つの `*` が空白を分け合える**ため探索が O(N²) に落ちる。
    // 実測(7 キー分を走査、16KB の空白):
    //   \s*-?\s*        2,969ms
    //   [ \t]*-?[ \t]*  2,833ms  ← \s を [ \t] に変えるだけでは直らない
    //   [ \t]*(?:-[ \t]*)?  0.5ms
    // `-` を伴う場合だけ 2 つ目の空白列を許すと分割の曖昧さが消えて線形になる。
    // 実データの抽出結果は 3 変種とも一致する(laws 12 + pages 20 = 32 ファイル
    // × 保護キー 7 本 × 2 窓 = 448 比較で差分 0)。合成入力では 2 種類だけ差が出て、
    // **どちらも `[ \t]` 版の方が正しい**:
    //   1. **値が空のキー**。`\s` は改行を跨げるので、`\s` 版は `title:` の値として
    //      **次の行をまるごと**拾う。空のまま次の行を編集すると before/after が変わり、
    //      **無関係な ask が出る**(`__tests__` の「値が空のキーは拾わない」が固定している)。
    //   2. `\s` に含まれて `[ \t]` に含まれない非改行文字(全角空白・NBSP・垂直タブ・
    //      フォームフィード)でインデントした行。YAML から見るとキー名自体が別物
    //      (`　title`)なので、拾う方が誤り。
    //
    // 詰めておく理由: settings.json の `timeout: 5` を超えるとプロセスが kill され、
    // stdout が出ない = ガードが黙って素通りする。ここが唯一の fail-open 経路。
    const re = new RegExp(`^[ \\t]*(?:-[ \\t]*)?${key}:[ \\t]*(.+?)[ \\t]*$`, 'gm');
    const values = [...(fm || '').matchAll(re)].map(m => m[1].replace(/^["']|["']$/g, ''));
    if (values.length) map.set(key, values);
  }
  const urls = ((chunk || '').match(URL_RE) || [])
    .map(x => x.trim())
    .filter(u => !BOILERPLATE_URL_RE.test(u));
  if (urls.length) map.set('__urls__', urls.sort());

  const ids = (chunk || '').match(EGOV_ID_RE) || [];
  if (ids.length) map.set('__egovIds__', [...ids].sort());
  return map;
}

function diffMaps(beforeM, afterM) {
  const allKeys = new Set([...beforeM.keys(), ...afterM.keys()]);
  const diffs = [];
  for (const key of allKeys) {
    const before = beforeM.get(key) ?? [];
    const after = afterM.get(key) ?? [];
    if (JSON.stringify(before) !== JSON.stringify(after)) {
      diffs.push({ key, before, after });
    }
  }
  return diffs;
}

function evaluatePair(oldStr, newStr, opts = {}) {
  // Edit chunks usually don't include the `---` delimiters; fall back to the
  // whole chunk so single-line frontmatter edits ("lastVerified: ...") still
  // get inspected. The path filter keeps body-text false positives unlikely.
  const before = oldStr ?? '';
  const after = newStr ?? '';
  if (!before && !after) return [];
  const beforeFm = extractFrontmatter(before) ?? before;
  const afterFm = extractFrontmatter(after) ?? after;
  return diffMaps(
    captureProtectedFields(beforeFm, before, opts),
    captureProtectedFields(afterFm, after, opts),
  );
}

// Write は差分ではなくファイル全体が届く。比較対象はディスク上の現物。
// 読めない理由で挙動を分ける:
//   ファイルが無い   → 新規作成。比較対象が無いので通す
//   それ以外の失敗   → 検証できない。通さずに確認を出す(fail-safe)
function evaluateWrite(filePath, content, opts) {
  let current;
  try {
    current = require('node:fs').readFileSync(filePath, 'utf8');
  } catch (err) {
    if (err && err.code === 'ENOENT') return [];
    return [{ key: '__unreadable__', before: [String(err && err.code) || 'read error'], after: [] }];
  }
  return evaluatePair(current, content ?? '', opts);
}

function evaluatePayload(toolName, toolInput, opts = {}) {
  if (toolName === 'Edit') {
    return evaluatePair(toolInput?.old_string ?? '', toolInput?.new_string ?? '', opts);
  }
  if (toolName === 'Write') {
    return evaluateWrite(String(toolInput?.file_path || ''), toolInput?.content ?? '', opts);
  }
  if (toolName === 'MultiEdit') {
    const edits = Array.isArray(toolInput?.edits) ? toolInput.edits : [];
    const merged = [];
    for (const e of edits) {
      merged.push(...evaluatePair(e?.old_string ?? '', e?.new_string ?? '', opts));
    }
    return merged;
  }
  return [];
}

// 先頭 57 文字で切る素朴な実装は、この repo の実データで破綻する。
// 本文中の実 URL 50 本のうち 21 本が 60 文字超で、しかも 57 文字目まで
// 完全一致する 3 本組が実在する:
//   .../20260423-mxt_syoto01-000028144_01.pdf / _02.pdf / _03.pdf
// 差し替えると before/after が同一文字列として表示され、
// **何を確認すればよいか分からない ask** になる(= 空押しを育てる)。
// 実値は 100 文字前後までが大半だが、こども家庭庁の資産 URL は 174 文字ある
// (2026-08-29 実測。それ以前の src 全体の最長は 105 文字)。100 文字までは丸ごと出す。
// それを超えるときだけ中央を省略し、末尾を必ず残す。
const MAX_SHOWN = 100;
const HEAD = 60;
const TAIL = 30;

function fmtVal(arr) {
  if (!arr.length) return '∅';
  return arr
    .map(v => (v.length > MAX_SHOWN ? `${v.slice(0, HEAD)}…${v.slice(-TAIL)}` : v))
    .join(' | ');
}

const LABELS = {
  __urls__: 'urls (inspected chunk)',
  __egovIds__: 'e-Gov law IDs',
  __unreadable__: 'current file could not be read (error code)',
};

function buildReason(diffs, filePath) {
  const lines = [`[frontmatter-immutable] Protected fields changed in ${filePath}:`];
  for (const d of diffs) {
    lines.push(`  ${LABELS[d.key] ?? d.key}:`);
    lines.push(`    before: ${fmtVal(d.before)}`);
    lines.push(`    after:  ${fmtVal(d.after)}`);
  }
  lines.push('');
  lines.push('法令エントリの frontmatter とページ内の公式リンクは、読者に見せる事実');
  lines.push('そのもの(e-Gov の法令 ID・公式解説 URL・確認日)。e-Gov の ID は 1 文字');
  lines.push('違っても別の実在法令を指し、link-check は 200 を返すため気づけない。');
  lines.push('原典で引き直してから適用すること。');
  return lines.join('\n');
}

function run(inputOrRaw, _options = {}) {
  let input;
  try {
    input = typeof inputOrRaw === 'string'
      ? (inputOrRaw.trim() ? JSON.parse(inputOrRaw) : {})
      : (inputOrRaw || {});
  } catch {
    return { exitCode: 0 };
  }

  const toolName = String(input?.tool_name || '');
  if (!['Edit', 'Write', 'MultiEdit'].includes(toolName)) return { exitCode: 0 };

  const toolInput = input?.tool_input || {};
  const filePath = String(toolInput?.file_path || '');
  const kind = targetKind(filePath);
  if (!kind) return { exitCode: 0 };

  const diffs = evaluatePayload(toolName, toolInput, { keys: kind === 'law' });
  if (!diffs.length) return { exitCode: 0 };

  const reason = buildReason(diffs, filePath);
  const stdout = JSON.stringify({
    hookSpecificOutput: {
      hookEventName: 'PreToolUse',
      permissionDecision: 'ask',
      permissionDecisionReason: reason,
    },
  });

  return { exitCode: 0, stdout, stderr: reason };
}

module.exports = {
  run,
  extractFrontmatter,
  captureProtectedFields,
  diffMaps,
  PROTECTED_KEYS,
  LAW_PATH_RE,
  PAGE_PATH_RE,
  targetKind,
};

if (require.main === module) {
  let data = '';
  process.stdin.setEncoding('utf8');
  process.stdin.on('data', c => { data += c; });
  process.stdin.on('end', () => {
    const out = run(data);
    if (out.stdout) process.stdout.write(out.stdout);
    if (out.stderr) process.stderr.write(out.stderr.endsWith('\n') ? out.stderr : out.stderr + '\n');
    // **`process.exit()` にしないこと。** stdout がパイプのとき write は非同期なので、
    // 直後に exit すると書き残しが捨てられ、判定 JSON がちょうど 65536B
    // (パイプバッファ)で切れる。切れた JSON は誰もエラーにせず、
    // ディスパッチャは「判定ではない付随出力」として捨てて exit 0 =
    // **ask が無音で消える**。exitCode を置くだけにして、Node に flush させる。
    process.exitCode = Number.isInteger(out.exitCode) ? out.exitCode : 0;
  });
}
