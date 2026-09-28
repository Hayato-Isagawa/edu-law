#!/usr/bin/env node
/**
 * PreToolUse / PostToolUse / PostToolUseFailure hook (Bash) — protected-value guard for Bash.
 *
 * pre-edit-frontmatter-immutable.cjs は Edit / Write / MultiEdit しか見ない。法令エントリの
 * `lastVerified` / `publishedAt` / 公式解説の `url` を python3 で書き換えたセッションがあり、
 * 確認が一度も出なかった。本ガードは同じ保護値(保護キー・URL 集合・e-Gov 法令 ID)を
 * Bash の側から見る。姉妹リポ edu-evidence の同名ガードからの移植。
 *
 * 網は 2 枚:
 *   - PreToolUse: コマンド文字列が書き換えの形なら ask(補助。取りこぼしも誤検知もある)
 *   - PreToolUse で全 worktree の保護値を控え、PostToolUse / PostToolUseFailure で
 *     比べて、変化を Claude(additionalContext)とユーザー(systemMessage)へ出す(本命)
 *
 * `~` 起点のセッションではこのリポの settings.json が読まれない。その経路では、ユーザー環境の
 * グローバルなディスパッチャがこのファイルを呼ぶ。require を組み込みに限っているのは、
 * ディスパッチャの sha256 ピンが実行する 1 ファイルしか照合しないため。
 *
 * 既知の限界:
 *   - Post が発火しない経路(権限拒否。ユーザーによる中断では PostToolUse は発火しない)では
 *     照合しない
 *   - Post が書き換えの完了前に走る経路(run_in_background・タイムアウトによる自動
 *     バックグラウンド化)では照合が空振りする。事前 ask だけが効く
 *   - 並列の tool call・別セッションの編集・git の切り替えによる変化も、その Bash の
 *     変化として出る(安全側の誤報)
 *   - `src/pages` の事前 ask は、このリポに向いたコマンド(リポ名を含む・cwd がこのリポの中)
 *     だけに出す。cwd が前の Bash の `cd` を反映するかは確かめていないので、取りこぼしうる
 *     (事後照合は拾う)
 *   - 事後なので取り消しはしない
 *   - 同じ Bash でこのガードが二重に走る(このリポの配線とユーザー環境のディスパッチャ)と、
 *     変化は Post ごとに 2 回出る。Pre だけが二重に走ると控えと印が残り、1 日より古くなると
 *     次の Pre が消す
 *   - 何が起きても exit 0。ディスパッチャ経由では exit 2 が全 Bash の停止になるため、
 *     失敗は systemMessage の警告で知らせる
 */

"use strict";

const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

// ここから抽出の関数までは pre-edit-frontmatter-immutable.cjs の複製(定義の理由は向こうの
// コメントにある)。一致はテストが実データ全件と合成入力で固定している。
const PROTECTED_KEYS = [
  "title",
  "order",
  "eGovUrl",
  "url",
  "lastVerified",
  "publishedAt",
  "retrievedAt",
];

const FRONTMATTER_RE = /^---\s*\n([\s\S]*?)\n---\s*(?:\n|$)/;
const URL_RE = /\bhttps?:\/\/[^\s)>"']+/gi;
const EGOV_ID_RE = /\b\d{3}[A-Z][A-Z0-9]{6,}\b/g;
const BOILERPLATE_URL_RE =
  /^https?:\/\/(?:[a-z0-9-]+\.)*(?:edu-evidence\.org|schema\.org)(?:[/:?#]|$)/i;

function extractFrontmatter(s) {
  if (!s) return null;
  const m = s.match(FRONTMATTER_RE);
  return m ? m[1] : null;
}

function valueAfterColon(rest) {
  if (!rest) return null;
  const isBlank = (c) => c === " " || c === "\t";
  let i = 0;
  while (i < rest.length && isBlank(rest[i])) i++;
  if (i === rest.length) return rest[rest.length - 1];
  let j = rest.length;
  while (j > i && isBlank(rest[j - 1])) j--;
  return rest.slice(i, j);
}

function captureProtectedFields(fm, chunk = fm, { keys = true } = {}) {
  if (!fm && !chunk) return new Map();
  const map = new Map();
  for (const key of keys ? PROTECTED_KEYS : []) {
    const re = new RegExp(`^[ \\t]*(?:-[ \\t]*)?${key}:(.*)$`, "gm");
    const values = [];
    for (const m of (fm || "").matchAll(re)) {
      const v = valueAfterColon(m[1]);
      if (v !== null) values.push(v.replace(/^["']|["']$/g, ""));
    }
    if (values.length) map.set(key, values);
  }
  const urls = ((chunk || "").match(URL_RE) || [])
    .map((x) => x.trim())
    .filter((u) => !BOILERPLATE_URL_RE.test(u));
  if (urls.length) map.set("__urls__", urls.sort());

  const ids = (chunk || "").match(EGOV_ID_RE) || [];
  if (ids.length) map.set("__egovIds__", [...ids].sort());
  return map;
}

// 控えの対象。法令は Edit 側の LAW_PATH_RE と同じ(直下の .md / .mdx)、ページは再帰
const LAWS_DIR = "src/content/laws";
const LAW_FILE_RE = /\.(md|mdx)$/i;
const PAGES_DIR = "src/pages";
const PAGE_FILE_RE = /\.astro$/i;

// --- 事前 ask: コマンド文字列の補助の網 -----------------------------------
//
// 文字列の走査なので取りこぼしも誤検知も避けられない。取りこぼしは事後照合が拾う。
// 誤検知を抑えるため、対象のパスを含み、かつ書き換えの形をしているときだけ ask する。
// 拡張子は見ない — `git checkout -- src/pages` のようなディレクトリ単位の書き換えを拾うため。

const LAWS_PATH_RE = /\bsrc\/content\/laws\b/;
const PAGES_PATH_RE = /\bsrc\/pages\b/;
const CONTENT_PATH_RE = /\bsrc\/(?:content\/laws|pages)\b/;

// 引用符・空白・区切りを挟まずにコンテンツのパスへ続く 1 語
const CONTENT_WORD = String.raw`["']?[^\s"'|;&<>]*src\/(?:content\/laws|pages)`;

// インタプリタはパスを読むだけのことも多い。書き込み API の呼び出しがあり、その書き込み先が
// コンテンツ外の文字列リテラルと読めないときだけ書き換えの形とみなす。
const INTERPRETER_RE = /\b(?:python3?|node|ruby|deno|bun)\b/;
// 書き込み先が第 1 引数(open は第 2 引数が書き込みモードのときだけ。モードは 2 番目の捕獲)。
// 量指定子を隣り合わせない — 重なると長い空白で 2 乗・3 乗になり、5 秒のタイムアウトで ask が消える。
// open は先読みで捕獲し `open(` だけを消費する(モードの文字列の中にある次の open( を飲み込まない)。
const WRITE_TARGET_RES = [
  /\bopen\((?=([^,()]*),\s*(?:mode\s*=\s*)?["']([^"']*)["'])/g,
  /\b(?:writeFileSync|writeFile|appendFileSync|appendFile|createWriteStream)\(\s*([^,()]*)/g,
  /\bFile\.write\(\s*([^,()]*)/g,
];
// 書き込み先を字面から取れない API(移動・置換の宛先が第 2 引数)
const OPAQUE_WRITE_RE =
  /\b(?:os\.replace|os\.rename|shutil\.(?:move|copy\w*))\(/;

/**
 * write_text / write_bytes の受け手(書き込み先)。呼び出し位置から後ろ向きに切り出す。
 * 受け手が `)` で終わるなら対応する `(` まで戻り(入れ子も数える)、その前の名前を含める。
 * 対応が取れない・名前が無いときは受け手とみなさない。
 */
function writeTextReceivers(segment) {
  const calls = [...segment.matchAll(/\.write_(?:text|bytes)\(/g)];
  if (!calls.length) return [];
  // 閉じ括弧ごとの対応する開き括弧を 1 回の走査で求める(呼び出しごとに後ろへ辿ると、
  // 入れ子の受け手で 2 乗になる)
  const openOf = new Map();
  const stack = [];
  for (let k = 0; k < segment.length; k++) {
    if (segment[k] === "(") stack.push(k);
    else if (segment[k] === ")" && stack.length) openOf.set(k, stack.pop());
  }
  const receivers = [];
  for (const m of calls) {
    let j = m.index;
    if (segment[j - 1] === ")") {
      if (!openOf.has(j - 1)) continue;
      j = openOf.get(j - 1);
    }
    let start = j;
    while (start > 0 && /[\w.]/.test(segment[start - 1])) start--;
    if (start < j) receivers.push(segment.slice(start, m.index));
  }
  return receivers;
}

function interpreterMayWriteContent(segment) {
  if (OPAQUE_WRITE_RE.test(segment)) return true;
  const targets = writeTextReceivers(segment);
  for (const re of WRITE_TARGET_RES) {
    for (const m of segment.matchAll(re)) {
      if (m[2] !== undefined && !/[wax+]/.test(m[2])) continue;
      targets.push(m[1].trim());
    }
  }
  return targets.some(
    (target) => !(/["']/.test(target) && !CONTENT_PATH_RE.test(target))
  );
}

/**
 * 制御演算子(`;` `&&` `||` `|` `&` 改行)で区切る。引用符の中と heredoc の本文は
 * 区切らない — 区切ると `python3 -c "a; b"` や heredoc の Python が別の区切りに散り、
 * インタプリタと書き込み先の対応が切れる。`2>&1` / `&>` の `&` はリダイレクト。
 */
function splitSegments(command) {
  const segments = [];
  const heredocs = [];
  let cur = "";
  let quote = null;
  for (let i = 0; i < command.length; i++) {
    const c = command[i];
    if (quote) {
      cur += c;
      if (c === "\\" && quote === '"') cur += command[++i] ?? "";
      else if (c === quote) quote = null;
      continue;
    }
    if (c === "'" || c === '"') {
      quote = c;
      cur += c;
      continue;
    }
    if (c === "\\") {
      cur += c + (command[++i] ?? "");
      continue;
    }
    const doc = command.slice(i).match(/^<<-?[ \t]*(['"]?)([A-Za-z_]\w*)\1/);
    if (doc && command[i - 1] !== "<") {
      heredocs.push(doc[2]);
      cur += doc[0];
      i += doc[0].length - 1;
      continue;
    }
    if (c === "\n" && heredocs.length) {
      // 本文を区切りの一部として取り込み、終端行まで進める
      let rest = command.slice(i + 1);
      cur += "\n";
      while (heredocs.length && rest) {
        const nl = rest.indexOf("\n");
        const line = nl === -1 ? rest : rest.slice(0, nl);
        cur += line + "\n";
        rest = nl === -1 ? "" : rest.slice(nl + 1);
        if (line.replace(/^\t+/, "") === heredocs[0]) heredocs.shift();
      }
      i = command.length - rest.length - 1;
      segments.push(cur);
      cur = "";
      continue;
    }
    const redirectAmp =
      c === "&" && (command[i - 1] === ">" || command[i + 1] === ">");
    if ((c === ";" || c === "|" || c === "&" || c === "\n") && !redirectAmp) {
      if ((c === "&" || c === "|") && command[i + 1] === c) i++;
      segments.push(cur);
      cur = "";
      continue;
    }
    cur += c;
  }
  segments.push(cur);
  return segments.map((s) => s.trim()).filter(Boolean);
}

/**
 * `sed` / `perl` の in-place 編集。正規表現にすると
 * `/\bsed\s+(?:[^|;&\n]*\s)?(?:-[A-Za-z]*i|--in-place)/` で、`\s+` と `[^|;&\n]*` が重なり
 * 長い空白で 2 乗になる。同じ集合を 1 回の走査で判定する: コマンド名の後の空白の連続の
 * 末尾 p から見て、直前が空白のフラグ f があり、[p, f-1) に | ; & 改行を含まない。
 */
function hasInPlaceFlag(segment, name, allowLong) {
  const starts = [
    ...segment.matchAll(new RegExp(String.raw`\b${name}(?=\s)`, "g")),
  ];
  if (!starts.length) return false;
  const n = segment.length;
  const isSpace = (c) => /\s/.test(c);
  const isLetter = (c) => /[A-Za-z]/.test(c);
  // 後ろから: 英字の連続に i があるか / 次のフラグ / 次の区切り
  const hasI = new Uint8Array(n + 1);
  const nextFlag = new Int32Array(n + 1).fill(-1);
  const nextBarrier = new Int32Array(n + 1).fill(n);
  for (let k = n - 1; k >= 0; k--) {
    const c = segment[k];
    hasI[k] = isLetter(c) && (c === "i" || hasI[k + 1]) ? 1 : 0;
    const flag =
      c === "-" &&
      k > 0 &&
      isSpace(segment[k - 1]) &&
      (hasI[k + 1] === 1 || (allowLong && segment.startsWith("--in-place", k)));
    nextFlag[k] = flag ? k : nextFlag[k + 1];
    nextBarrier[k] = "|;&\n".includes(c) ? k : nextBarrier[k + 1];
  }
  for (const m of starts) {
    let p = m.index + name.length;
    while (p < n && isSpace(segment[p])) p++;
    const f = nextFlag[p];
    if (f !== -1 && nextBarrier[p] >= f - 1) return true;
  }
  return false;
}

const WRITE_FORMS = [
  new RegExp(String.raw`\btee\s+(?:-\S+\s+)*${CONTENT_WORD}`),
  new RegExp(String.raw`>>?\s*${CONTENT_WORD}`),
  /\bgit\s+(?:-C\s+\S+\s+)?(?:checkout|restore|apply)\b/,
];

const MOVE_COMMANDS = new Set(["mv", "cp", "rsync", "install", "ln"]);

/** mv / cp などの宛先(最後の非オプション引数)がコンテンツか */
function movesIntoContent(segment) {
  const words = segment.split(/\s+/).filter(Boolean);
  if (!MOVE_COMMANDS.has(words[0])) return false;
  const args = words.slice(1).filter((w) => !w.startsWith("-"));
  return CONTENT_PATH_RE.test(args[args.length - 1] || "");
}

/**
 * 区切りごとに見る。コマンド全体で「パスがある」「書き換えの形がある」を別々に探すと、
 * `git checkout main && grep … src/content/…` のような読むだけの組み合わせで ask になり、
 * 無人の routine が承認待ちで止まる。
 *
 * `pagesInScope` は `src/pages` だけを含む区切りで呼ぶ(遅延)。`src/pages` を持つリポは
 * ほかにもあり、ディスパッチャ経由では全セッションの Bash を見るので、このリポに向いた
 * コマンドのときだけ ask する。`src/content/laws` はこのリポにしか無いので絞らない。
 */
function looksLikeContentWrite(command, { pagesInScope = () => true } = {}) {
  if (!CONTENT_PATH_RE.test(command)) return false;
  let pagesOk;
  const targets = (seg) =>
    LAWS_PATH_RE.test(seg) ||
    (PAGES_PATH_RE.test(seg) && (pagesOk ??= Boolean(pagesInScope())));
  return splitSegments(command).some(
    (seg) =>
      CONTENT_PATH_RE.test(seg) &&
      (hasInPlaceFlag(seg, "sed", true) ||
        hasInPlaceFlag(seg, "perl", false) ||
        WRITE_FORMS.some((re) => re.test(seg)) ||
        (INTERPRETER_RE.test(seg) && interpreterMayWriteContent(seg)) ||
        movesIntoContent(seg)) &&
      targets(seg)
  );
}

function preAskReason(command) {
  return [
    "[bash-frontmatter-guard] This command may rewrite src/content/laws or src/pages.",
    "Protected values (law titles, e-Gov URLs and law IDs, official explanation URLs,",
    "verification dates) are confirmed on Edit / Write; a Bash rewrite skips that check.",
    "Prefer the Edit tool, or check the official source before approving.",
    "",
    `command: ${command.length > 300 ? command.slice(0, 297) + "..." : command}`,
  ].join("\n");
}

// --- 事後照合: Pre で保護キーを控え、Post / PostToolUseFailure で比べる --------
//
// 書き方(sed / python / スクリプト経由)に依存しない本命の網。事後なので取り消しは
// しない。書き換えを Claude とユーザーの両方に知らせる。

const DEFAULT_STATE_DIR = path.join(os.tmpdir(), "edu-law-fm-guard");
const ID_RE = /^[A-Za-z0-9_-]{1,128}$/;
const STALE_MS = 24 * 60 * 60 * 1000;
const MESSAGE_LIMIT = 9000;

/**
 * 照合する worktree の一覧。メインだけでなく `.claude/worktrees/*` などの
 * worktree の中の書き換えも拾う。git が失敗したらメインだけを見て警告する。
 */
function listWorktrees(root) {
  const res = spawnSync(
    "git",
    ["-C", root, "worktree", "list", "--porcelain"],
    {
      encoding: "utf8",
      timeout: 2000,
      env: {
        PATH: process.env.PATH || "",
        HOME: os.homedir(),
        GIT_OPTIONAL_LOCKS: "0",
      },
    }
  );
  if (res.status !== 0) {
    return {
      roots: [root],
      warning: `git worktree list failed (${res.error?.code || `status ${res.status}`}); checked ${root} only.`,
    };
  }
  const roots = [...res.stdout.matchAll(/^worktree (.+)$/gm)].map((m) => m[1]);
  return { roots: roots.length ? roots : [root] };
}

/** ページは再帰で集める(ガイドは src/pages/guides/ の下)。symlink は辿らない */
function listPages(dir) {
  const out = [];
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return out; // 消えた worktree・ページの無いブランチ
  }
  for (const e of entries) {
    const abs = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...listPages(abs));
    else if (e.isFile() && PAGE_FILE_RE.test(e.name)) out.push(abs);
  }
  return out;
}

const readText = (abs) => {
  try {
    return fs.readFileSync(abs, "utf8");
  } catch {
    return null;
  }
};

/**
 * 全 worktree の保護値。キーは絶対パス、値は { key: [values] }。窓の取り方は Edit 側の
 * Write 判定と同じ: 法令は frontmatter(無ければ全文)から保護キー、全文から URL と法令 ID。
 * ページは保護キーを見ず、全文から URL と法令 ID。
 */
function takeSnapshot(root) {
  const { roots, warning } = listWorktrees(root);
  const files = {};
  for (const wt of roots) {
    let laws = [];
    try {
      laws = fs.readdirSync(path.join(wt, LAWS_DIR));
    } catch {
      // 消えた worktree・法令の無いブランチ
    }
    for (const name of laws) {
      if (!LAW_FILE_RE.test(name)) continue;
      const abs = path.join(wt, LAWS_DIR, name);
      const text = readText(abs);
      if (text === null) continue;
      files[abs] = Object.fromEntries(
        captureProtectedFields(extractFrontmatter(text) ?? text, text)
      );
    }
    for (const abs of listPages(path.join(wt, PAGES_DIR))) {
      const text = readText(abs);
      if (text === null) continue;
      files[abs] = Object.fromEntries(
        captureProtectedFields(text, text, { keys: false })
      );
    }
  }
  return { snapshot: { worktrees: roots, files }, warning };
}

/** 変化の一覧。消えたファイルは値の変化ではないので数えない。既存 worktree の新規ファイルは数える */
function diffSnapshots(before, after) {
  const changes = [];
  for (const [abs, fields] of Object.entries(after.files)) {
    let prev = before.files[abs];
    if (!prev) {
      // 帰属は最長一致で決める。メインは `.claude/worktrees/*` の接頭辞でもあるので、
      // 前方一致だけだと、Bash で作った worktree の全ファイルがメインの新規ファイルに化ける
      const owner = after.worktrees
        .filter((wt) => abs.startsWith(wt + path.sep))
        .sort((a, b) => b.length - a.length)[0];
      if (!owner || !before.worktrees.includes(owner)) continue;
      prev = {};
    }
    for (const key of new Set([...Object.keys(prev), ...Object.keys(fields)])) {
      const b = prev[key] ?? [];
      const a = fields[key] ?? [];
      if (JSON.stringify(b) !== JSON.stringify(a))
        changes.push({ file: abs, key, before: b, after: a });
    }
  }
  return changes;
}

/** 自分だけが読み書きできるディレクトリであることを確かめる。満たさなければ throw */
function ensureStateDir(dir) {
  fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  const st = fs.lstatSync(dir);
  if (!st.isDirectory()) throw new Error(`${dir} is not a directory`);
  if (typeof process.getuid === "function" && st.uid !== process.getuid())
    throw new Error(`${dir} is owned by another user`);
  if (st.mode & 0o077) throw new Error(`${dir} is accessible by others`);
}

function removeStale(dir, now) {
  for (const name of fs.readdirSync(dir)) {
    const p = path.join(dir, name);
    try {
      if (now - fs.lstatSync(p).mtimeMs > STALE_MS) fs.unlinkSync(p);
    } catch {
      // 並行するセッションが先に消した
    }
  }
}

function snapshotPath(dir, input) {
  const session = String(input?.session_id ?? "");
  const toolUse = String(input?.tool_use_id ?? "");
  if (!ID_RE.test(session) || !ID_RE.test(toolUse)) return null;
  return path.join(dir, `${session}-${toolUse}.json`);
}

function saveSnapshot(dir, input, root, now) {
  const p = snapshotPath(dir, input);
  if (!p)
    return {
      warning:
        "session_id / tool_use_id missing or malformed; not snapshotted.",
    };
  ensureStateDir(dir);
  removeStale(dir, now);
  const { snapshot, warning } = takeSnapshot(root);
  const body = JSON.stringify(snapshot);
  const roots = snapshot.worktrees;
  try {
    fs.writeFileSync(p, body, { flag: "wx", mode: 0o600 });
  } catch (e) {
    if (e?.code !== "EEXIST") throw e;
    fs.unlinkSync(p);
    fs.writeFileSync(p, body, { flag: "wx", mode: 0o600 });
  }
  addTicket(p);
  return { warning, roots };
}

// --- 控えの印 ------------------------------------------------------------
//
// 同じ Bash でこのガードが二重に走る経路がある(このリポの配線とユーザー環境のディスパッチャ)。
// Pre は走るたびに印 `<控え>.t<k>` を 1 つ作り、Post は控えを読んでから印を 1 つ取る。
// 印が残っていれば控えは消さない(まだ読む Post がいる)。これが無いと 1 本目の Post が控えを
// 消し、2 本目が「not verified」と誤って警告する。
//
// 印は rename で取る。同じパスへの同時の unlink は APFS で両方とも成功を返す(実測)ので、
// unlink では取り合いの勝者が決まらない。rename は片方だけが成功する。

const TICKET_LIMIT = 16;

const ticketBase = (p) => p.slice(0, -".json".length);

function addTicket(p) {
  for (let k = 0; k < TICKET_LIMIT; k++) {
    try {
      fs.writeFileSync(`${ticketBase(p)}.t${k}`, "", {
        flag: "wx",
        mode: 0o600,
      });
      return;
    } catch (e) {
      if (e?.code !== "EEXIST") throw e;
    }
  }
}

/** まだ取られていない印のパス */
function openTickets(p) {
  const prefix = `${path.basename(ticketBase(p))}.t`;
  return fs
    .readdirSync(path.dirname(p))
    .filter((n) => n.startsWith(prefix) && /^\d+$/.test(n.slice(prefix.length)))
    .map((n) => path.join(path.dirname(p), n));
}

/** 印を 1 つ取る。取れる印が無ければ何もしない */
function takeTicket(p) {
  for (const t of openTickets(p)) {
    const taken = `${t}.c${process.pid}`;
    try {
      fs.renameSync(t, taken);
    } catch (e) {
      if (e?.code === "ENOENT") continue; // 別の Post が先に取った
      throw e;
    }
    fs.unlinkSync(taken);
    return;
  }
}

/**
 * 控えを読み、印を 1 つ取る。印が残っていなければ控えを消す。無ければ null。
 * 読んでから取るので、控えを消すのは最後に取った Post で、そのとき他の Post は読み終えている。
 * 最後の 2 本がどちらも「残り 0」を見ることはあるので、控えの unlink の ENOENT は許す。
 */
function loadSnapshot(dir, input) {
  const p = snapshotPath(dir, input);
  if (!p) return null;
  let body;
  try {
    if (!fs.lstatSync(p).isFile()) return null;
    body = fs.readFileSync(p, "utf8");
  } catch (e) {
    if (e?.code === "ENOENT") return null;
    throw e;
  }
  takeTicket(p);
  if (openTickets(p).length === 0) {
    try {
      fs.unlinkSync(p);
    } catch (e) {
      if (e?.code !== "ENOENT") throw e;
    }
  }
  return JSON.parse(body);
}

const fmtValues = (arr) =>
  arr.length
    ? arr.map((v) => (v.length > 60 ? v.slice(0, 57) + "..." : v)).join(" | ")
    : "∅";

function describeChanges(changes, root) {
  const shown = (file) => {
    const rel = path.relative(root, file);
    return rel.startsWith("..") ? file : rel;
  };
  // 件数とファイル一覧を先に出す。詳細が長くて切り詰められても、どこが変わったかは残る
  const files = [...new Set(changes.map((c) => shown(c.file)))];
  const lines = [
    `[bash-frontmatter-guard] ${changes.length} protected frontmatter value(s) changed in ${files.length} file(s) during this Bash command:`,
    `  ${files.join(", ")}`,
    "",
  ];
  for (const c of changes) {
    lines.push(`  ${shown(c.file)} ${c.key}:`);
    lines.push(`    before: ${fmtValues(c.before)}`);
    lines.push(`    after:  ${fmtValues(c.after)}`);
  }
  lines.push(
    "",
    "Edit / Write would have asked for confirmation. Check each value against the official",
    "source (e-Gov / the publishing ministry) and tell the user what changed.",
    "Changes from a parallel tool call, another session or a git checkout are reported here too."
  );
  return lines.join("\n");
}

const clip = (s) =>
  s.length > MESSAGE_LIMIT
    ? s.slice(0, MESSAGE_LIMIT - 20) + "\n...(truncated)"
    : s;

const warn = (s) => `[bash-frontmatter-guard] ${s}`;

/**
 * 出力は 1 つの JSON にまとめる(行を分けると全体がパース失敗になり ask ごと消える)。
 * Post では `additionalContext`(Claude へ。PostToolUseFailure が受け付ける唯一の
 * 判定フィールド)と `systemMessage`(ユーザーへ)に同じ文を載せる。
 */
function output(event, { ask, messages }) {
  const out = {};
  const text = clip(messages.join("\n\n"));
  if (event === "PreToolUse") {
    if (ask)
      out.hookSpecificOutput = {
        hookEventName: event,
        permissionDecision: "ask",
        permissionDecisionReason: ask,
      };
    if (text) out.systemMessage = text;
  } else if (text) {
    out.systemMessage = text;
    out.hookSpecificOutput = { hookEventName: event, additionalContext: text };
  }
  return Object.keys(out).length
    ? { exitCode: 0, stdout: JSON.stringify(out) }
    : { exitCode: 0 };
}

/**
 * `src/pages` への書き換えがこのリポに向いているか。コマンドがこのリポの worktree 名を含む・
 * cwd がこのリポのいずれかの worktree の中、のどちらか。判定できないときは向いているとみなす。
 */
function pagesInScope(command, cwd, root, known) {
  if (!root) return true;
  // 控えを取ったときの一覧があればそれを使う(git の起動を 1 回に抑え、hook の 5 秒に余裕を残す)
  const roots = known ?? listWorktrees(root).roots;
  const real = (p) => {
    try {
      return fs.realpathSync(p).toLowerCase();
    } catch {
      return String(p).toLowerCase();
    }
  };
  const names = new Set(["edu-law", ...roots.map((wt) => path.basename(wt))]);
  if ([...names].some((n) => command.includes(n))) return true;
  if (!cwd) return true;
  let here;
  try {
    here = fs.realpathSync(String(cwd)).toLowerCase();
  } catch {
    return true;
  }
  return roots.some((wt) => {
    const r = real(wt);
    return here === r || here.startsWith(r + path.sep);
  });
}

function run(inputOrRaw, options = {}) {
  let input;
  try {
    input =
      typeof inputOrRaw === "string"
        ? inputOrRaw.trim()
          ? JSON.parse(inputOrRaw)
          : {}
        : inputOrRaw || {};
  } catch {
    return { exitCode: 0 };
  }
  if (String(input?.tool_name || "") !== "Bash") return { exitCode: 0 };
  const event = String(input?.hook_event_name || "");
  if (!["PreToolUse", "PostToolUse", "PostToolUseFailure"].includes(event))
    return { exitCode: 0 };

  const command = String(input?.tool_input?.command || "");
  const stateDir = options.stateDir ?? DEFAULT_STATE_DIR;
  const now = options.now ?? Date.now();
  const messages = [];
  let root;
  try {
    root = fs.realpathSync(options.root ?? path.resolve(__dirname, "..", ".."));
  } catch (e) {
    messages.push(
      warn(`could not resolve the repository root (${e?.message || e}).`)
    );
  }

  if (event === "PreToolUse") {
    let roots;
    if (root) {
      try {
        const saved = saveSnapshot(stateDir, input, root, now);
        roots = saved.roots;
        if (saved.warning) messages.push(warn(saved.warning));
      } catch (e) {
        messages.push(
          warn(`could not snapshot protected keys (${e?.message || e}).`)
        );
      }
    }
    const ask = looksLikeContentWrite(command, {
      pagesInScope: () => pagesInScope(command, input?.cwd, root, roots),
    })
      ? preAskReason(command)
      : null;
    return output(event, { ask, messages });
  }

  if (root) {
    try {
      const before = loadSnapshot(stateDir, input);
      if (!before) {
        messages.push(
          warn(
            "no snapshot from PreToolUse; protected keys were not verified for this command."
          )
        );
      } else {
        const { snapshot: after, warning } = takeSnapshot(root);
        if (warning) messages.push(warn(warning));
        const changes = diffSnapshots(before, after);
        if (changes.length) messages.push(describeChanges(changes, root));
      }
    } catch (e) {
      messages.push(
        warn(`could not verify protected keys (${e?.message || e}).`)
      );
    }
  }
  return output(event, { messages });
}

module.exports = {
  run,
  PROTECTED_KEYS,
  FRONTMATTER_RE,
  URL_RE,
  EGOV_ID_RE,
  BOILERPLATE_URL_RE,
  LAWS_DIR,
  PAGES_DIR,
  extractFrontmatter,
  captureProtectedFields,
  looksLikeContentWrite,
  pagesInScope,
  takeSnapshot,
};

if (require.main === module) {
  let data = "";
  process.stdin.setEncoding("utf8");
  process.stdin.on("data", (c) => {
    data += c;
  });
  process.stdin.on("end", () => {
    let out;
    try {
      out = run(data);
    } catch (e) {
      // 何が起きても Bash を止めない(exit 2 は全 Bash の停止になる)。黙りもしない。
      out = {
        exitCode: 0,
        stdout: JSON.stringify({
          systemMessage: warn(
            `crashed; nothing was verified (${e?.message || e}).`
          ),
        }),
      };
    }
    if (out.stdout) process.stdout.write(out.stdout);
    // `process.exit()` にしない。stdout がパイプのとき書き残しが捨てられ、判定 JSON が
    // 64KiB で切れる(pre-edit-frontmatter-immutable.cjs の同じ箇所を参照)。
    process.exitCode = 0;
  });
}
