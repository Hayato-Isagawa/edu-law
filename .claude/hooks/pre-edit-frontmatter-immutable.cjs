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
const TARGET_PATH_RE = /(?:^|\/)src\/content\/laws\/[^/]+\.(md|mdx)$/i;
const URL_RE = /\bhttps?:\/\/[^\s)>"']+/gi;

function extractFrontmatter(s) {
  if (!s) return null;
  const m = s.match(FRONTMATTER_RE);
  return m ? m[1] : null;
}

function captureProtectedFields(fm) {
  if (!fm) return new Map();
  const map = new Map();
  for (const key of PROTECTED_KEYS) {
    const re = new RegExp(`^\\s*-?\\s*${key}:\\s*(.+?)\\s*$`, 'gm');
    const values = [...fm.matchAll(re)].map(m => m[1].replace(/^["']|["']$/g, ''));
    if (values.length) map.set(key, values);
  }
  // URLs in the inspected chunk (officialExplanations list, eGovUrl, 本文リンク)
  const urls = (fm.match(URL_RE) || []).map(x => x.trim());
  if (urls.length) map.set('__urls__', urls.sort());
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

function evaluatePair(oldStr, newStr) {
  // Edit chunks usually don't include the `---` delimiters; fall back to the
  // whole chunk so single-line frontmatter edits ("lastVerified: ...") still
  // get inspected. Path filter (TARGET_PATH_RE) keeps body-text false
  // positives unlikely.
  const beforeFm = extractFrontmatter(oldStr) ?? (oldStr ?? '');
  const afterFm = extractFrontmatter(newStr) ?? (newStr ?? '');
  if (!beforeFm && !afterFm) return [];
  return diffMaps(captureProtectedFields(beforeFm), captureProtectedFields(afterFm));
}

function evaluatePayload(toolName, toolInput) {
  if (toolName === 'Edit') {
    return evaluatePair(toolInput?.old_string ?? '', toolInput?.new_string ?? '');
  }
  if (toolName === 'MultiEdit') {
    const edits = Array.isArray(toolInput?.edits) ? toolInput.edits : [];
    const merged = [];
    for (const e of edits) {
      merged.push(...evaluatePair(e?.old_string ?? '', e?.new_string ?? ''));
    }
    return merged;
  }
  return [];
}

function fmtVal(arr) {
  if (!arr.length) return '∅';
  return arr.map(v => (v.length > 60 ? v.slice(0, 57) + '...' : v)).join(' | ');
}

function buildReason(diffs, filePath) {
  const lines = [`[frontmatter-immutable] Protected fields changed in ${filePath}:`];
  for (const d of diffs) {
    const label = d.key === '__urls__' ? 'urls (inspected chunk)' : d.key;
    lines.push(`  ${label}:`);
    lines.push(`    before: ${fmtVal(d.before)}`);
    lines.push(`    after:  ${fmtVal(d.after)}`);
  }
  lines.push('');
  lines.push('法令エントリの frontmatter は読者に見せる事実そのもの(e-Gov の法令 ID・');
  lines.push('公式解説 URL・確認日)。e-Gov の ID は 1 文字違っても別の実在法令を指し、');
  lines.push('link-check は 200 を返すため気づけない。原典で引き直してから適用すること。');
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
  if (!['Edit', 'MultiEdit'].includes(toolName)) return { exitCode: 0 };

  const toolInput = input?.tool_input || {};
  const filePath = String(toolInput?.file_path || '');
  if (!TARGET_PATH_RE.test(filePath)) return { exitCode: 0 };

  const diffs = evaluatePayload(toolName, toolInput);
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
  TARGET_PATH_RE,
};

if (require.main === module) {
  let data = '';
  process.stdin.setEncoding('utf8');
  process.stdin.on('data', c => { data += c; });
  process.stdin.on('end', () => {
    const out = run(data);
    if (out.stdout) process.stdout.write(out.stdout);
    if (out.stderr) process.stderr.write(out.stderr.endsWith('\n') ? out.stderr : out.stderr + '\n');
    process.exit(Number.isInteger(out.exitCode) ? out.exitCode : 0);
  });
}
