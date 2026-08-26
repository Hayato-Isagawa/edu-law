#!/usr/bin/env node
// 公式解説の書名は、1 つの法令ページの中に独立して 2 箇所書かれている —
// frontmatter の `officialExplanations[].title`(`src/pages/laws/[slug].astro` が
// `発行元『title』` の形で描画する)と、本文末尾の `## 出典` 節(md に直接書いてある)。
// 片方だけ直すと静かにずれ、`astro check` も e2e も週次 link-check も通って本番に出る。
// 事故の経緯と設計判断は CLAUDE.md「書名一致ガード」。
//
// ここでは出典節の『』と「」を frontmatter の `title` と突き合わせる。
// `officialExplanations` に載らない名前(本文限りの資料・制度名)は、同じ節の
// `<!-- body-only: 書名 -->` で明示する。allowlist を別ファイルに持たないのは、
// 書名を消したときにマークだけが残る経路を作らないため — frontmatter に在る書名を
// 指すマーク(昇格後の消し忘れ)も、どの引用とも一致しないマーク(消し忘れの残骸)も赤にする。
//
// 逆方向(frontmatter → 出典節)は見ない。出典節は frontmatter の全件を挙げるとは
// 限らないため。被覆の内訳は CLAUDE.md 側にまとめてある。
//
// 使い方: node scripts/check-source-titles.mjs [glob]

import { globSync, readFileSync, realpathSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const DEFAULT_PATTERN = 'src/content/laws/*.md';

/** frontmatter と本文を分ける。 */
const FRONTMATTER = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/;

/** `## 出典` 節の見出し。節は次の見出し行(または EOF)で終わる。 */
const SOURCES_HEADING = /^##[ \t]+出典[ \t]*$/;
const ANY_HEADING = /^#{1,6}[ \t]/;

/**
 * 見た目が同じ書名を同じ文字列として扱う。
 * このリポの運用は「PDF 表紙の逐語を書き写す」で、macOS 経由の貼り付けは NFD を作りうる。
 * 正規化しないと、1 文字も違わない 2 つの書名を並べたエラーが出て原因に辿り着けない。
 */
const norm = (s) => s.normalize('NFC');

/**
 * YAML のプレーン / 引用符付きスカラーを読む。
 * 実データはどれも裸書きだが、引用符や行末コメントが付いた版が「別の書名」に見えると、
 * 壊れていない側を指すエラーが出る。**読めない形は黙って値に混ぜず例外にする。**
 */
function parseScalar(raw) {
  const v = raw.trim();

  if (v.startsWith('"') || v.startsWith("'")) {
    const quote = v[0];
    const end = v.indexOf(quote, 1);
    if (end === -1) throw new Error('officialExplanations[].title の引用符が閉じていない');
    // エスケープを解釈しないので、閉じ引用符の後ろに値が続く形は読めない。
    const rest = v.slice(end + 1).trim();
    if (rest !== '' && !rest.startsWith('#')) {
      throw new Error('officialExplanations[].title の引用符を解釈できない');
    }
    return v.slice(1, end);
  }

  // プレーンスカラーでは「空白 + #」から先が YAML のコメント。
  const comment = v.search(/\s#/);
  return (comment === -1 ? v : v.slice(0, comment)).trim();
}

/**
 * frontmatter から `officialExplanations[].title` を取り出す。
 *
 * YAML パーサを入れずに済ませているのは、依存を増やさないためではなく
 * (js-yaml は推移的に入っている)、**解析に失敗したときに黙って 0 件を返さない**
 * ようにするため。エントリ数と title 数が合わなければ例外にする。
 * 合わない = 構造が想定と変わった、なので、そのまま照合すると
 * 「frontmatter に無い書名」が大量に出るか、逆に検査が素通りする。
 */
function parseOfficialTitles(frontmatter) {
  const lines = frontmatter.split(/\r?\n/);
  const start = lines.findIndex((l) => /^officialExplanations:[ \t]*$/.test(l));
  if (start === -1) throw new Error('frontmatter に officialExplanations: が無い');

  const block = [];
  for (const line of lines.slice(start + 1)) {
    if (line.trim() === '') continue;
    if (/^\S/.test(line)) break; // インデントが戻ったら別のキー
    block.push(line);
  }

  const entries = block.filter((l) => /^[ \t]+-[ \t]/.test(l)).length;
  const titles = [];
  for (const line of block) {
    const m = line.match(/^[ \t]+(?:-[ \t]+)?title:[ \t]*(.*)$/);
    if (!m) continue;
    const value = m[1].trim();
    // ブロックスカラー(`|` / `>`)や空値は、この行だけ読んでも書名にならない。
    // 黙って空文字を持ち回ると全件不一致になるので、ここで止める。
    if (value === '' || value.startsWith('|') || value.startsWith('>')) {
      throw new Error('officialExplanations[].title を 1 行で読み取れない');
    }
    titles.push(norm(parseScalar(value)));
  }

  if (entries === 0) throw new Error('officialExplanations にエントリが無い');
  if (entries !== titles.length) {
    throw new Error(
      `officialExplanations の解析に失敗(エントリ ${entries} 件 / title ${titles.length} 件)`,
    );
  }
  return titles;
}

/** `## 出典` 節の本文を返す。節が 1 つでなければ理由を返す。 */
function extractSourcesSection(body) {
  const lines = body.split(/\r?\n/);
  const found = [];
  lines.forEach((line, i) => {
    if (SOURCES_HEADING.test(line)) found.push(i);
  });
  if (found.length === 0) return { error: '## 出典 節が無い' };
  if (found.length > 1) return { error: `## 出典 節が ${found.length} 個ある` };

  const out = [];
  for (const line of lines.slice(found[0] + 1)) {
    if (ANY_HEADING.test(line)) break;
    out.push(line);
  }
  return { text: out.join('\n') };
}

const OPENERS = { '『': '』', '「': '」' };
const CLOSERS = { '』': '『', '」': '「' };

/**
 * 引用された名前を、いちばん外側の括弧だけ拾う。
 *
 * **「」も見る。** 児童虐待防止法の出典節は関係省庁連名通知の名前を「」で引用しており、
 * それは `officialExplanations` にも載っている。『』だけを見ていると、この 1 件は
 * frontmatter をどう改名しても無反応で、このガードが防ぐはずの欠陥がそのまま通る。
 *
 * **入れ子は両向きに出る。** `『「子ども虐待対応の手引き」の一部改正…』` も
 * `「保護者、学校関係者、地域の皆さまへ 『児童虐待の根絶に向けて』」` も実在する。
 * 内側を先に取り除く方式だと後者が `「保護者、学校関係者、地域の皆さまへ 」` に潰れ、
 * **原文のどこにも無い名前**を報告してしまう(しかもマーク側は末尾空白を書けないので、
 * 指示どおりに直しても赤が消えない)。深さを数えて外側だけを取る。
 */
function extractQuotedNames(text) {
  const names = [];
  const stack = [];
  let start = -1;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (OPENERS[ch]) {
      if (stack.length === 0) start = i;
      stack.push(ch);
      continue;
    }
    if (!CLOSERS[ch]) continue;
    // 対応しない閉じ括弧は、引用ではない用法(「〜」内の記号など)として読み飛ばす。
    if (stack.length === 0 || stack[stack.length - 1] !== CLOSERS[ch]) continue;
    stack.pop();
    if (stack.length === 0) {
      const display = text.slice(start, i + 1);
      names.push({ name: norm(display.slice(1, -1).trim()), display });
    }
  }

  return { names, unclosed: stack.length > 0 };
}

/** 1 ファイルを検査する。`quoted` は出典節に出た名前(重複込み)。 */
export function inspect(label, source) {
  const fm = source.match(FRONTMATTER);
  if (!fm) return { problems: [`${label}: frontmatter を読み取れない`], quoted: [] };

  let official;
  try {
    official = parseOfficialTitles(fm[1]);
  } catch (e) {
    return { problems: [`${label}: ${e.message}`], quoted: [] };
  }

  const section = extractSourcesSection(fm[2]);
  if (section.error) return { problems: [`${label}: ${section.error}`], quoted: [] };

  const marks = [...section.text.matchAll(/<!--[ \t]*body-only:[ \t]*([\s\S]*?)[ \t]*-->/g)].map(
    (m) => norm(m[1]),
  );
  // マークの中身は引用ではない。除いておかないと、括弧を含む書名を指すマークが
  // 自分自身を「未説明の引用」として呼び戻し、消せない赤になる。
  const { names: quoted, unclosed } = extractQuotedNames(
    section.text.replace(/<!--[\s\S]*?-->/g, ''),
  );

  const officialSet = new Set(official);
  const markSet = new Set(marks);
  const quotedNames = quoted.map((q) => q.name);
  const problems = [];

  // 節の書式は `発行元『書名』` で固定。1 件も無いのは、書式が変わったか
  // 節ごと消えたかのどちらかで、いずれも検査が素通りする状態そのもの。
  if (quoted.length === 0) {
    problems.push(`${label}: ## 出典 節に引用された名前が 1 件も無い(書式は 発行元『書名』)`);
  }

  // 閉じ括弧の欠落は、その書名を丸ごと検査の外へ出す。黙って減らさない。
  if (unclosed) {
    problems.push(`${label}: ## 出典 節に閉じていない括弧がある(その書名は照合できない)`);
  }

  for (const { name, display } of quoted) {
    if (officialSet.has(name) || markSet.has(name)) continue;
    problems.push(
      `${label}: 出典節の${display}が frontmatter の officialExplanations[].title に無い` +
        ` — 表記を揃えるか、frontmatter に載せない名前なら同じ節に <!-- body-only: ${name} --> を置く`,
    );
  }

  for (const mark of marks) {
    if (officialSet.has(mark)) {
      problems.push(
        `${label}: body-only マーク「${mark}」が frontmatter に在る書名を指している` +
          ' — officialExplanations に昇格済みならマークを外す',
      );
      continue;
    }
    if (!quotedNames.includes(mark)) {
      problems.push(`${label}: body-only マーク「${mark}」に対応する引用が出典節に無い(消し忘れ)`);
    }
  }

  return { problems, quoted: quotedNames };
}

export function main(pattern = DEFAULT_PATTERN) {
  const files = (
    path.isAbsolute(pattern)
      ? globSync(pattern)
      : globSync(pattern, { cwd: ROOT }).map((f) => path.resolve(ROOT, f))
  ).sort();

  if (files.length === 0) {
    console.error(`[check-source-titles] 対象ファイルが 0 件: ${pattern}`);
    console.error('[check-source-titles] 法令ファイルが移動・改名されていないか確認してください。');
    return 1;
  }

  const problems = [];
  let quotedTotal = 0;
  for (const file of files) {
    const label = path.relative(ROOT, file) || path.basename(file);
    const result = inspect(label, readFileSync(file, 'utf8'));
    problems.push(...result.problems);
    quotedTotal += result.quoted.length;
  }

  if (problems.length) {
    for (const p of problems) console.error(`[check-source-titles] ${p}`);
    console.error(`[check-source-titles] ${problems.length} 件のずれ(${files.length} ファイル)`);
    return 1;
  }

  console.log(
    `[check-source-titles] ${files.length} ファイル / 出典節の引用 ${quotedTotal} 件 — ずれなし`,
  );
  return 0;
}

// `file://${process.argv[1]}` と素朴に比べると、パスに空白や非 ASCII があるとき、
// あるいは symlink 越しに起動したときだけ永久に偽になり、**出力ゼロの exit 0** で
// 終わる。CI のパスは安全だが、静かに no-op になる経路を残さないので符号化と
// realpath を通してから比べる。`argv[1]` は `node -e` から import したときは
// 未定義なので、先に確かめる(このモジュールは `inspect` / `main` を export する)。
const entry = process.argv[1];
if (entry && import.meta.url === pathToFileURL(realpathSync(entry)).href) {
  process.exitCode = main(process.argv[2]);
}
