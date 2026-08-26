#!/usr/bin/env node
// 公式解説の書名は、正本(`src/content/laws/*.md` の frontmatter `officialExplanations[].title`)
// のほかに **4 箇所へ独立に写されている** — 本文末尾の `## 出典` 節、frontmatter の `summary`、
// トップの Highlights(`src/pages/index.astro`)、場面データと更新履歴(`src/data/*.ts`)。
// 片方だけ直すと静かにずれ、`astro check` も e2e も週次 link-check も通って本番に出る。
// 2026-08-25 の #190 / #191(出典節)と 2026-08-26 の #194(残り 3 箇所・drift 11 件)が実例。
// 事故の経緯と設計判断は CLAUDE.md「書名一致ガード」。
//
// **書名の同定は「発行元名プレフィックス」で行う。** `発行元『書名』` / `発行元「書名」` の形
// (外側括弧の直前が `src/data/publishers.ts` の `PUBLISHER_LABELS` の値)だけを書名として照合する。
// 括弧引用を全部拾う方式にすると、UI ラベル・ページ名・法令名・プレースホルダまで対象になって
// 例外が 40 件超必要になり、しかも `法令` / `学校安全` のように**普通名詞と衝突する正本**が
// 直せない赤を生む(`法令` は児童福祉法の公式解説の書名で、散文にも頻出する)。
// 逆に括弧を無視した全文走査は、同じ短い書名のせいで偶然一致が 160 件出て使えない。
//
// **例外は同じファイルの中でマークする。** 正本に載らない名前(本文限りの資料・ガイド固有の
// 資料・散文中の短縮形)は `body-only:` で明示する。構文だけ言語に合わせる — md 本文は
// `<!-- body-only: 書名 -->`、YAML は行末の `# body-only: 書名`、JS / TS と `.astro` の
// frontmatter は `// body-only: 書名`。allowlist を別ファイルに持たないのは、書名を消したときに
// マークだけが残る経路を作らないため — 正本に在る書名を指すマーク(昇格後の消し忘れ)も、
// どの引用とも一致しないマーク(消し忘れの残骸)も赤にする。
//
// **走査はソーステキストで行う。** `src/data/*.ts` を `import()` して実行時の文字列を読む案は
// 採らない。エクスポートから到達しない `const` に書名を移すとガードの対象から静かに消えるうえ、
// Node の型ストリップと「`src/data/*.ts` が Astro 専用 import を持たないこと」に依存する。
//
// `## 出典` 節だけは従来どおり**全引用**を照合する。書式が `発行元『書名』(取得日: …)` で
// 固定されているので、より強い規則を維持できる。
//
// 使い方:
//   node scripts/check-source-titles.mjs            # 全箇所(CI が走らせるのはこれ)
//   node scripts/check-source-titles.mjs --root DIR # 全箇所を DIR 起点で(テスト用)
//   node scripts/check-source-titles.mjs <glob>     # 法令 md だけ(テスト用)

import { globSync, readFileSync, readdirSync, realpathSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const DEFAULT_PATTERN = 'src/content/laws/*.md';
const LAWS_DIR = path.join('src', 'content', 'laws');
const SRC_DIR = 'src';
const HIGHLIGHTS_FILE = path.join('src', 'pages', 'index.astro');
const PUBLISHERS_FILE = path.join('src', 'data', 'publishers.ts');

/**
 * 走査しない拡張子。**列挙するのは「見ない側」で、知らない拡張子は既定で走査する。**
 * 逆(走査する拡張子を列挙する)にすると、`.tsx` を新設して書名を置いたときに誰も見ない。
 * 安全側の既定を選んでいるので、ここを増やすことだけが検査を狭める操作になる。
 */
const NON_PROSE_EXTENSIONS = ['.css'];

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

/** 空白の有無だけが違うのかを診断に出すための比較用。**判定には使わない。** */
const collapse = (s) => s.replace(/[\s　]+/g, '');

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

/**
 * frontmatter から `summary` の生の行を取り出す。
 * **1 行のスカラーとして読めない形(ブロックスカラー・空値・キーごと欠落)は例外にする。**
 * `parseOfficialTitles` と同じ規律。ここを緩めると `summary: >-` に変えるだけで
 * この検査が黙って 0 件になる(マークを持たない法令ファイルは緑で通り抜ける)。
 */
function parseSummaryLine(frontmatter) {
  const line = frontmatter.split(/\r?\n/).find((l) => /^summary:/.test(l));
  if (line === undefined) throw new Error('frontmatter に summary: が無い');
  const value = line.replace(/^summary:[ \t]*/, '').trim();
  if (value === '' || value.startsWith('|') || value.startsWith('>')) {
    throw new Error('summary を 1 行で読み取れない');
  }
  return line;
}

/** `## 出典` 節と、その外側の本文に分ける。節が 1 つでなければ理由を返す。 */
function splitBody(body) {
  const lines = body.split(/\r?\n/);
  const found = [];
  lines.forEach((line, i) => {
    if (SOURCES_HEADING.test(line)) found.push(i);
  });
  if (found.length === 0) return { error: '## 出典 節が無い' };
  if (found.length > 1) return { error: `## 出典 節が ${found.length} 個ある` };

  const section = [];
  let end = lines.length;
  for (let i = found[0] + 1; i < lines.length; i++) {
    if (ANY_HEADING.test(lines[i])) {
      end = i;
      break;
    }
    section.push(lines[i]);
  }
  return {
    section: section.join('\n'),
    outside: [...lines.slice(0, found[0]), ...lines.slice(end)].join('\n'),
  };
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
 *
 * `start` は開き括弧の位置。発行元名プレフィックスの判定に使う。
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
      names.push({ name: norm(display.slice(1, -1).trim()), display, start });
    }
  }

  return { names, unclosed: stack.length > 0 };
}

/**
 * 例外マークの 3 構文。`body-only:` という語は 1 つに揃え、コメントの書き方だけ言語に合わせる。
 * 意味は全箇所で同じ —「この名前は `officialExplanations[].title` と突き合わせない」。
 */
const MARK_SYNTAX = {
  html: /<!--[ \t]*body-only:[ \t]*([\s\S]*?)[ \t]*-->/g,
  line: /\/\/[ \t]*body-only:[ \t]*(.*?)[ \t]*$/gm,
  yaml: /#[ \t]*body-only:[ \t]*(.*?)[ \t]*$/gm,
};

/** マークの中身を集める。 */
export function extractMarks(text, syntax) {
  return [...text.matchAll(new RegExp(MARK_SYNTAX[syntax]))].map((m) => norm(m[1]));
}

/**
 * マークを取り除いた本文を返す。
 * 除いておかないと、括弧を含む書名を指すマークが自分自身を「未説明の引用」として
 * 呼び戻し、消せない赤になる。**除くのはマークだけ**で、`//` コメント一般は触らない
 * (`https://` を含む文字列を巻き込むため)。
 */
const stripMarks = (text, syntax) => text.replace(new RegExp(MARK_SYNTAX[syntax]), '');

/**
 * `src/data/publishers.ts` の `PUBLISHER_LABELS` から発行元名を読む。
 * 発行元を足したら書名として認識される範囲も自動で広がるよう、写しを持たない。
 * `other`(= その他)は発行元名ではないので除く。**0 件なら例外** — 読めないまま走らせると
 * 発行元名プレフィックスに一致する引用が 1 件も無くなり、出典節以外の全箇所が緑になる。
 */
export function parsePublisherLabels(source) {
  const labels = [];
  for (const m of source.matchAll(/^\s*([A-Za-z0-9_-]+):\s*"([^"]*)"/gm)) {
    if (m[1] === 'other') continue;
    labels.push(norm(m[2]));
  }
  if (labels.length === 0) throw new Error('PUBLISHER_LABELS から発行元名を読み取れない');
  return labels;
}

/** 発行元名が直前に置かれた引用だけを返す(= このリポで書名を書くときの形)。 */
function citations(text, publishers) {
  const { names, unclosed } = extractQuotedNames(text);
  const cited = [];
  for (const q of names) {
    const publisher = publishers.find((p) => text.slice(q.start - p.length, q.start) === p);
    if (publisher !== undefined) cited.push({ ...q, publisher });
  }
  return { cited, unclosed };
}

/** 不一致が空白だけのときに、そう言う。目で 1 個の空白を探させない。 */
function mismatchHint(name, official) {
  const c = collapse(name);
  return official.some((t) => collapse(t) === c) ? '(空白だけが違う)' : '';
}

/**
 * 引用の集合を正本と突き合わせる共通部分。
 * `quoted` は照合対象の引用、`marks` は同じ範囲で有効な例外マーク。
 */
function matchAgainst(label, where, quoted, marks, official) {
  const officialSet = new Set(official);
  const markSet = new Set(marks);
  const quotedNames = quoted.map((q) => q.name);
  const problems = [];

  for (const { name, display } of quoted) {
    if (officialSet.has(name) || markSet.has(name)) continue;
    problems.push(
      `${label}: ${where}の${display}が officialExplanations[].title に無い` +
        `${mismatchHint(name, official)}` +
        ` — 表記を揃えるか、正本に載せない名前なら body-only マーク(${name})を同じ範囲に置く`,
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
      problems.push(
        `${label}: body-only マーク「${mark}」に対応する引用が${where}に無い(消し忘れ)`,
      );
    }
  }

  return problems;
}

/**
 * 法令 md 1 ファイルを検査する。見るのは 3 範囲 — `## 出典` 節(全引用)、frontmatter の
 * `summary`、本文の出典節の外(後ろ 2 つは発行元名付きの引用だけ)。照合先は**そのファイル
 * 自身の** `officialExplanations`(他法令の書名を引きたいならマークで明示する)。
 * `quoted` は出典節に出た名前(重複込み)。
 */
export function inspect(label, source, publishers) {
  const fm = source.match(FRONTMATTER);
  if (!fm) return { problems: [`${label}: frontmatter を読み取れない`], quoted: [] };

  let official;
  let summaryLine;
  try {
    official = parseOfficialTitles(fm[1]);
    summaryLine = parseSummaryLine(fm[1]);
  } catch (e) {
    return { problems: [`${label}: ${e.message}`], quoted: [] };
  }

  const body = splitBody(fm[2]);
  if (body.error) return { problems: [`${label}: ${body.error}`], quoted: [] };

  const marks = extractMarks(body.section, 'html');
  const { names: quoted, unclosed } = extractQuotedNames(stripMarks(body.section, 'html'));
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

  problems.push(...matchAgainst(label, '出典節', quoted, marks, official));

  // --- frontmatter の summary: 発行元名付きの引用だけ ------------------------
  const summaryMarks = extractMarks(summaryLine, 'yaml');
  const summary = citations(stripMarks(summaryLine, 'yaml'), publishers);
  if (summary.unclosed) {
    problems.push(`${label}: summary に閉じていない括弧がある(その書名は照合できない)`);
  }
  problems.push(...matchAgainst(label, 'summary', summary.cited, summaryMarks, official));

  // --- 本文(出典節の外): 発行元名付きの引用だけ -----------------------------
  const outsideMarks = extractMarks(body.outside, 'html');
  const outside = citations(stripMarks(body.outside, 'html'), publishers);
  if (outside.unclosed && outside.cited.length > 0) {
    problems.push(`${label}: 本文に閉じていない括弧がある(その書名は照合できない)`);
  }
  problems.push(...matchAgainst(label, '本文', outside.cited, outsideMarks, official));

  return { problems, quoted: quotedNames };
}

/**
 * 法令 md 以外のファイル(`.astro` / `.ts` / …)を検査する。
 * 発行元名付きの引用だけを、**全法令の正本**と突き合わせる。
 */
export function inspectProse(label, source, official, publishers) {
  const marks = extractMarks(source, 'line');
  const { cited, unclosed } = citations(stripMarks(source, 'line'), publishers);
  const problems = [];
  // 散文では対応しない括弧が普通に出る(かぎ括弧を記号として使う等)ので、
  // 書名の引用が 1 件でもあるファイルに限って報告する。
  if (unclosed && cited.length > 0) {
    problems.push(`${label}: 閉じていない括弧がある(その書名は照合できない)`);
  }
  problems.push(...matchAgainst(label, '本文', cited, marks, official));
  return { problems, cited: cited.length };
}

/**
 * `src/` 配下で走査するファイルを集める(法令 md は別扱いなので除く)。
 * 拡張子は**見ない側だけを列挙**しているので、新しい拡張子は既定で走査に入る。
 */
export function collectProseFiles(root) {
  const out = [];
  const lawsDir = path.join(root, LAWS_DIR);
  const walk = (dir) => {
    for (const entry of readdirSync(dir, { withFileTypes: true }).sort((a, b) =>
      a.name < b.name ? -1 : 1,
    )) {
      const p = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (p !== lawsDir) walk(p);
        continue;
      }
      if (NON_PROSE_EXTENSIONS.includes(path.extname(entry.name))) continue;
      out.push(p);
    }
  };
  walk(path.join(root, SRC_DIR));
  return out;
}

/**
 * `src/pages/index.astro` の Highlights を読む。
 * ここだけは括弧引用ではなく**構造**で書名を持っているので、キーから直接取る。
 * **読めない形は黙って 0 件にせず例外にする** — 配列名の rename・`as const` の除去・
 * 空配列・`title` の欠落は、どれも「検査対象が無い」と見分けが付かない。
 */
export function parseHighlights(source) {
  const head = source.indexOf('const highlights = [');
  if (head === -1) throw new Error('const highlights = [ が見つからない');
  const open = source.indexOf('[', head);
  const close = source.indexOf('\n] as const;', open);
  if (close === -1) throw new Error('highlights 配列の閉じ(] as const;)が見つからない');

  // 入れ子のオブジェクトでエントリが途中で切れないよう、深さを数えて取る。
  const block = source.slice(open + 1, close);
  const entries = [];
  let depth = 0;
  let start = -1;
  for (let i = 0; i < block.length; i++) {
    if (block[i] === '{') {
      if (depth === 0) start = i;
      depth++;
    } else if (block[i] === '}') {
      depth--;
      if (depth === 0) entries.push(block.slice(start, i + 1));
      if (depth < 0) throw new Error('highlights 配列の括弧が対応していない');
    }
  }
  if (depth !== 0) throw new Error('highlights 配列の括弧が対応していない');
  if (entries.length === 0) throw new Error('highlights にエントリが無い');

  // prettier は長い値を次の行へ折るので、キーと値の間に改行が入る形も読む。
  const field = (entry, key) => {
    const m = entry.match(new RegExp(`\\b${key}:\\s*(?:\\n\\s*)?("(?:[^"\\\\]|\\\\.)*")`));
    if (!m) throw new Error(`highlights のエントリから ${key} を読み取れない`);
    return norm(JSON.parse(m[1]));
  };

  return entries.map((entry) => ({ title: field(entry, 'title'), href: field(entry, 'href') }));
}

/**
 * Highlights と laws collection の突き合わせ。
 *
 * ADR 0009 の第三基準(代表解説の起点は `officialExplanations[0]`、laws collection を SSoT とする)
 * と ADR 0026(全法令を 1 件ずつ覆う)を機械化する。**件数の一致は検査しない** — 被覆の検査
 * (重複なし・全法令・実在する法令)から論理的に含意されるので、件数だけが単独で赤になる
 * 入力を作れず、変異試験でこの層を分離できない。
 */
export function inspectHighlights(label, source, lawsBySlug) {
  let entries;
  try {
    entries = parseHighlights(source);
  } catch (e) {
    return [`${label}: ${e.message}`];
  }

  const problems = [];
  const seen = new Set();
  for (const { title, href } of entries) {
    const m = href.match(/^\/laws\/([^/]+)\/$/);
    if (!m) {
      problems.push(`${label}: href が /laws/<slug>/ の形ではない(${href})`);
      continue;
    }
    const slug = m[1];
    if (seen.has(slug)) problems.push(`${label}: 同じ法令を 2 回 highlight している(${slug})`);
    seen.add(slug);

    const titles = lawsBySlug.get(slug);
    if (!titles) {
      problems.push(`${label}: 存在しない法令を指している(${slug})`);
      continue;
    }
    if (title !== titles[0]) {
      problems.push(
        `${label}: ${slug} の highlight が officialExplanations[0] と違う` +
          `${mismatchHint(title, titles)} — 「${title}」/ 正本「${titles[0]}」` +
          ' — 代表解説を変えるなら officialExplanations の並び順を先に変える(ADR 0009 第三基準)',
      );
    }
  }

  for (const slug of lawsBySlug.keys()) {
    if (!seen.has(slug)) problems.push(`${label}: ${slug} が highlight に出ていない(ADR 0026)`);
  }

  return problems;
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

  const loaded = loadPublishers(ROOT);
  if (loaded.error) return fail(loaded.error);

  const problems = [];
  let quotedTotal = 0;
  for (const file of files) {
    const label = path.relative(ROOT, file) || path.basename(file);
    const result = inspect(label, readFileSync(file, 'utf8'), loaded.publishers);
    problems.push(...result.problems);
    quotedTotal += result.quoted.length;
  }

  return report(problems, `${files.length} ファイル / 出典節の引用 ${quotedTotal} 件`);
}

function report(problems, summary) {
  if (problems.length) {
    for (const p of problems) console.error(`[check-source-titles] ${p}`);
    console.error(`[check-source-titles] ${problems.length} 件のずれ`);
    return 1;
  }
  console.log(`[check-source-titles] ${summary} — ずれなし`);
  return 0;
}

function isFile(p) {
  try {
    return statSync(p).isFile();
  } catch {
    return false;
  }
}

/** 発行元名の一覧を読む。読めなければ理由を返す(黙って空にしない)。 */
function loadPublishers(root) {
  const file = path.join(root, PUBLISHERS_FILE);
  if (!isFile(file)) return { error: `${PUBLISHERS_FILE} が無い(発行元名を読めない)` };
  try {
    return { publishers: parsePublisherLabels(readFileSync(file, 'utf8')) };
  } catch (e) {
    return { error: `${PUBLISHERS_FILE}: ${e.message}` };
  }
}

const fail = (message) => {
  console.error(`[check-source-titles] ${message}`);
  return 1;
};

/**
 * 全箇所を検査する。CI が走らせるのはこちら。
 *
 * **0 件ガードを 3 本置いている。** 実リポでは他の検査が代わりに赤くするが、それに頼ると
 * (1) フィクスチャ root では緑になりうる (2)「法令ファイルが移動・改名されていないか」という
 * 診断が無関係な赤に埋もれて原因に辿り着けない。
 */
export function mainAll(root = ROOT) {
  const rel = (p) => path.relative(root, p) || path.basename(p);

  const lawFiles = globSync(path.join(LAWS_DIR, '*.md'), { cwd: root })
    .map((f) => path.resolve(root, f))
    .sort();
  if (lawFiles.length === 0) {
    fail(`法令ファイルが 0 件: ${path.join(LAWS_DIR, '*.md')}`);
    return fail('法令ファイルが移動・改名されていないか確認してください。');
  }

  const loaded = loadPublishers(root);
  if (loaded.error) return fail(loaded.error);

  const problems = [];
  const lawsBySlug = new Map();
  const officialAll = new Set();
  let quotedTotal = 0;
  for (const file of lawFiles) {
    const source = readFileSync(file, 'utf8');
    const result = inspect(rel(file), source, loaded.publishers);
    problems.push(...result.problems);
    quotedTotal += result.quoted.length;

    const fm = source.match(FRONTMATTER);
    if (!fm) continue;
    try {
      const titles = parseOfficialTitles(fm[1]);
      lawsBySlug.set(path.basename(file, '.md'), titles);
      titles.forEach((t) => officialAll.add(t));
    } catch {
      // 解析できないことは inspect() が既に赤にしている。二重に報告しない。
    }
  }

  const proseFiles = collectProseFiles(root);
  if (proseFiles.length === 0) return fail(`${SRC_DIR}/ に走査対象のファイルが 0 件`);
  const official = [...officialAll];
  let citedTotal = 0;
  for (const file of proseFiles) {
    const result = inspectProse(rel(file), readFileSync(file, 'utf8'), official, loaded.publishers);
    problems.push(...result.problems);
    citedTotal += result.cited;
  }

  const highlights = path.join(root, HIGHLIGHTS_FILE);
  if (!isFile(highlights)) return fail(`${HIGHLIGHTS_FILE} が無い(Highlights を検査できない)`);
  problems.push(...inspectHighlights(HIGHLIGHTS_FILE, readFileSync(highlights, 'utf8'), lawsBySlug));

  return report(
    problems,
    `法令 ${lawFiles.length} ファイル(出典節の引用 ${quotedTotal} 件 + summary + 本文) / ` +
      `${SRC_DIR} ${proseFiles.length} ファイル(発行元名付きの引用 ${citedTotal} 件) / ` +
      `${HIGHLIGHTS_FILE} の Highlights`,
  );
}

// `file://${process.argv[1]}` と素朴に比べると、パスに空白や非 ASCII があるとき、
// あるいは symlink 越しに起動したときだけ永久に偽になり、**出力ゼロの exit 0** で
// 終わる。CI のパスは安全だが、静かに no-op になる経路を残さないので符号化と
// realpath を通してから比べる。`argv[1]` は `node -e` から import したときは
// 未定義なので、先に確かめる(このモジュールは検査関数を export する)。
//
// **`--root` を持たせているのは、`mainAll` のプロセス exit code を通す経路を作るため。**
// 引数なしでしか `mainAll` を呼べないと、フィクスチャに対して赤を出せず、
// `return 1` を `return 0` に変える 1 文字の退行を恒久テストで固定できない。
const entry = process.argv[1];
if (entry && import.meta.url === pathToFileURL(realpathSync(entry)).href) {
  const argv = process.argv.slice(2);
  if (argv[0] === '--root') {
    process.exitCode = argv[1] ? mainAll(argv[1]) : fail('--root にディレクトリを指定してください。');
  } else if (argv.length > 0) {
    process.exitCode = main(argv[0]);
  } else {
    process.exitCode = mainAll();
  }
}
