"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawn, spawnSync } = require("node:child_process");
const guard = require("../bash-frontmatter-guard.cjs");
const editGuard = require("../pre-edit-frontmatter-immutable.cjs");

// --- Edit 側ガードとの一致 ------------------------------------------------
//
// 本ガードは pre-edit-frontmatter-immutable.cjs を require しない(ディスパッチャの
// sha256 ピンは実行する 1 ファイルしか照合しないので、require した先は無検査で走る)。
// 代わりに複製した定義が Edit 側とずれていないことをここで固定する。

test("PROTECTED_KEYS と抽出の正規表現が Edit 側ガードと一致する", () => {
  // 実データや合成入力に差が出ない形の変更(桁数の下限など)も、定義の比較なら捕まる
  assert.deepEqual(guard.PROTECTED_KEYS, editGuard.PROTECTED_KEYS);
  for (const name of [
    "FRONTMATTER_RE",
    "URL_RE",
    "EGOV_ID_RE",
    "BOILERPLATE_URL_RE",
  ]) {
    assert.ok(guard[name] instanceof RegExp, name);
    assert.equal(guard[name].source, editGuard[name].source, name);
    assert.equal(guard[name].flags, editGuard[name].flags, name);
  }
});

test("保護値の抽出が実データ全件で Edit 側ガードと一致する", () => {
  // キーごとの正規表現は関数の中で組み立てているので、export の比較では固定できない。
  // 実データに両方をかけて出力を比べる。窓の取り方は控えと同じ(法令は frontmatter と全文、
  // ページは全文で保護キーなし)。
  const root = path.resolve(__dirname, "..", "..", "..");
  let compared = 0;
  const lawsDir = path.join(root, guard.LAWS_DIR);
  for (const name of fs.readdirSync(lawsDir)) {
    const text = fs.readFileSync(path.join(lawsDir, name), "utf8");
    const fm = editGuard.extractFrontmatter(text);
    assert.equal(guard.extractFrontmatter(text), fm, name);
    assert.deepEqual(
      guard.captureProtectedFields(fm ?? text, text),
      editGuard.captureProtectedFields(fm ?? text, text),
      name
    );
    compared++;
  }
  const pages = fs
    .readdirSync(path.join(root, guard.PAGES_DIR), { recursive: true })
    .filter((n) => n.endsWith(".astro"));
  for (const name of pages) {
    const text = fs.readFileSync(
      path.join(root, guard.PAGES_DIR, name),
      "utf8"
    );
    assert.deepEqual(
      guard.captureProtectedFields(text, text, { keys: false }),
      editGuard.captureProtectedFields(text, text, { keys: false }),
      name
    );
    compared++;
  }
  assert.ok(compared >= 30, `比較が ${compared} 件しかない`);

  // 実データに無い形(リスト形・値が空・全角空白のインデント・CRLF・値の前後の空白)も比べる。
  // 実データだけだと、前置きの `(?:-[ \t]*)?` を落とす変異が緑のまま通る。
  for (const fm of [
    "officialExplanations:\n  - title: 解説\n    url: https://example.org/x",
    "title:\norder: 5",
    "　title: 教育基本法\norder: 2",
    "order: 5\r\neGovUrl: 'https://laws.e-gov.go.jp/law/418AC0000000120'\r\n",
    // 値の前後の空白・空白だけの値・空の値(値の取り方は valueAfterColon の複製が決める)
    "title: a  b \t\norder:  \t\neGovUrl:\nurl:'x'",
    "https://law.edu-evidence.org/x https://schema.org/Thing 322AC0000000026",
  ]) {
    assert.deepEqual(
      guard.captureProtectedFields(fm),
      editGuard.captureProtectedFields(fm),
      JSON.stringify(fm)
    );
  }
});

test("require するのは node の組み込みだけ", () => {
  // 組み込み以外を require すると、その先はディスパッチャの sha256 照合を通らずに走る。
  const src = fs.readFileSync(
    path.join(__dirname, "..", "bash-frontmatter-guard.cjs"),
    "utf8"
  );
  const required = [...src.matchAll(/\brequire\s*\(\s*([^)]*)\)/g)].map((m) =>
    m[1].trim()
  );
  assert.ok(required.length > 0);
  for (const r of required) assert.match(r, /^"node:[a-z_/]+"$/);
});

// --- fixture ------------------------------------------------------------

const BODY = [
  "---",
  "title: 教育基本法",
  "order: 11",
  "eGovUrl: https://laws.e-gov.go.jp/law/418AC0000000120",
  "lastVerified: 2026-09-01",
  "officialExplanations:",
  "  - title: 解説",
  "    url: https://www.mext.go.jp/a",
  "---",
  "",
  "本文 https://www.mext.go.jp/b 322AC0000000026",
  "title: 本文の中の見出し",
  "",
].join("\n");
const PAGE = [
  "---",
  "const meta = {",
  '  title: "ガイド",',
  "};",
  "---",
  '<a href="https://laws.e-gov.go.jp/law/322AC0000000026">学校教育法</a>',
  '<a href="https://law.edu-evidence.org/laws">一覧</a>',
  "",
].join("\n");
const X = "src/content/laws/x.md";
const P = "src/pages/guides/g.astro";

function git(cwd, ...args) {
  const res = spawnSync(
    "git",
    [
      "-c",
      "user.name=t",
      "-c",
      "user.email=t@example.com",
      "-c",
      "commit.gpgsign=false",
      ...args,
    ],
    { cwd, encoding: "utf8" }
  );
  assert.equal(res.status, 0, res.stderr);
  return res.stdout;
}

// 1 回の実行で git リポを 20 個以上作るので、終わったら消す
const tmpDirs = [];
const tmp = (prefix) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  tmpDirs.push(dir);
  return dir;
};
test.after(() => {
  for (const dir of tmpDirs) fs.rmSync(dir, { recursive: true, force: true });
});

/** 法令 2 本と下層のページ 1 本がある git リポと、未作成の状態置き場 */
function makeRepo() {
  const root = tmp("bash-fm-repo-");
  fs.mkdirSync(path.join(root, guard.LAWS_DIR), { recursive: true });
  fs.mkdirSync(path.join(root, path.dirname(P)), { recursive: true });
  fs.writeFileSync(path.join(root, X), BODY);
  fs.writeFileSync(path.join(root, "src/content/laws/y.md"), BODY);
  fs.writeFileSync(path.join(root, P), PAGE);
  git(root, "init", "-q");
  git(root, "add", ".");
  git(root, "commit", "-q", "-m", "init");
  const stateDir = path.join(tmp("bash-fm-state-"), "guard");
  return { root, stateDir };
}

// cwd に null を渡すとペイロードから cwd を省く
const call = (ctx, event, command, toolUseId = "toolu_01", cwd = ctx.root) =>
  guard.run(
    JSON.stringify({
      hook_event_name: event,
      session_id: "sess-1",
      tool_use_id: toolUseId,
      tool_name: "Bash",
      tool_input: { command },
      ...(cwd === null ? {} : { cwd }),
    }),
    { root: ctx.root, stateDir: ctx.stateDir }
  );

const parsed = (out) => (out.stdout ? JSON.parse(out.stdout) : {});
const decisionOf = (out) => parsed(out).hookSpecificOutput?.permissionDecision;

// --- PreToolUse: 事前 ask(コマンド文字列の補助の網) --------------------

test("Pre: コンテンツへの sed -i は ask", () => {
  const ctx = makeRepo();
  for (const cmd of [
    `sed -i '' 's/lastVerified: 2026-09-01/lastVerified: 2026-09-09/' ${X}`,
    `sed -E -i.bak 's/a/b/' src/content/laws/y.md`,
    `perl -pi -e 's/5/9/' ${X}`,
  ]) {
    assert.equal(decisionOf(call(ctx, "PreToolUse", cmd)), "ask", cmd);
  }
});

test("Pre: インタプリタの書き込み・tee・リダイレクト・mv/cp の宛先・git の復元は ask", () => {
  const ctx = makeRepo();
  for (const cmd of [
    `python3 -c "import pathlib; p=pathlib.Path('${X}'); p.write_text(p.read_text().replace('5','9'))"`,
    `python3 - <<'PY'\nwith open("${X}", "w") as f:\n    f.write("x")\nPY`,
    `node -e "require('fs').writeFileSync('${X}', 'x')"`,
    `ruby -e 'File.write("${X}", "x")'`,
    `echo x | tee ${X}`,
    `printf 'x' > ${X}`,
    `cat <<'EOF2' >> src/content/laws/y.md\nx\nEOF2`,
    `mv /tmp/x.md ${X}`,
    `cp -f /tmp/x.md src/content/laws/`,
    `git checkout origin/main -- ${X}`,
    `git restore --source=HEAD~1 src/content/laws/`,
  ]) {
    assert.equal(decisionOf(call(ctx, "PreToolUse", cmd)), "ask", cmd);
  }
});

test("Pre: 読むだけのコマンドと無関係なコマンドは ask しない", () => {
  const ctx = makeRepo();
  for (const cmd of [
    `grep -n lastVerified ${X}`,
    `sed -n '1,20p' ${X}`,
    `python3 -c "import pathlib; print(pathlib.Path('${X}').read_text()[:200])"`,
    `node -e "console.log(require('fs').readFileSync('${X}','utf8'))"`,
    `cp ${X} /tmp/backup.md`,
    `git diff -- src/content/laws/`,
    `grep -rl eGovUrl src/content/laws > /tmp/list.txt`,
    `npm run check:all`,
    `sed -i '' 's/a/b/' docs/notes.md`,
    // 書き換えの形とコンテンツのパスが別の区切り・別の書き込み先にある
    `git checkout -q main && grep -h "^eGovUrl" src/content/laws/*.md`,
    `sed -i '' s/a/b/ /tmp/p.html; grep -c x src/content/laws/y.md`,
    `git -C ~/edu-law checkout -b x && ls src/content/laws`,
    `python3 -c "import json,glob; json.dump([open(p).read() for p in glob.glob('src/content/laws/*.md')], open('/tmp/fm.json','w'))"`,
    `node -e "const fs=require('fs'); fs.writeFileSync('/tmp/l.txt', fs.readdirSync('src/content/laws').join())"`,
    `grep -n x ${X} 2>&1 | head`,
  ]) {
    assert.equal(decisionOf(call(ctx, "PreToolUse", cmd)), undefined, cmd);
  }
});

test("Pre: 判定の境界(引用符の中の改行・open の空白と mode・入れ子の write_text)", () => {
  for (const cmd of [
    // sed / perl の直後の空白の連続と、フラグの直前の 1 文字は改行でもよい
    `bash -c "sed x\n-i s/a/b/ ${X}"`,
    `bash -c "sed a sed\n\n-i s/a/b/ ${X}"`,
    `bash -c "perl x\n-pi -e s/a/b/ ${X}"`,
    `python3 -c "p='${X}'; open(p , 'w').write('x')"`,
    `python3 -c "open(p, mode='a')" ${X}`,
    // 書き込みでないモードの一致が、引用符の中の次の open( を飲み込まない
    `python3 -c "open(p, 'open(q, 'w')')" ${X}`,
    `python3 -c "import os; from pathlib import Path; Path(os.path.join('src/content/laws','y.md')).write_text('x')"`,
  ]) {
    assert.equal(guard.looksLikeContentWrite(cmd), true, cmd);
  }
  for (const cmd of [
    // フラグまでの間に改行を挟む(空白の連続の後)
    `bash -c "sed x\n\ny -i ${X}"`,
    `python3 -c "open( '/tmp/x' , 'w')" ${X}`,
    `python3 -c "open(p, 'r')" ${X}`,
  ]) {
    assert.equal(guard.looksLikeContentWrite(cmd), false, cmd);
  }
});

test("Pre: 長いコマンドでも判定が線形時間で終わる", () => {
  // settings.json の `timeout: 5`(秒)を超えると kill され、ask が出ない。
  // 正規表現の量指定子が重なると、sed + 空白 40k 字で 2.8 秒(2 乗)、
  // open( + 空白 2k 字で 4.3 秒(3 乗)かかっていた。
  // 3 乗の形は 64k 字だと数十分かかり、赤にならずに固まる。先に小さい入力で落とす
  const small = `python3 -c 'open(${" ".repeat(2048)}x)' ${X}`;
  const s0 = process.hrtime.bigint();
  guard.looksLikeContentWrite(small);
  const smallMs = Number(process.hrtime.bigint() - s0) / 1e6;
  assert.ok(
    smallMs < 500,
    `open( + 空白 2k 字に ${smallMs.toFixed(0)}ms かかった`
  );

  const n = 64 * 1024;
  const starts = [
    "sed ",
    "perl ",
    "python3 -c 'open(",
    "python3 -c 'x.write_text(",
    "python3 -c '",
    "node -e 'writeFileSync(",
    "tee ",
    "echo >",
    "git -C ",
    "mv ",
    "cat <<A\n",
  ];
  const fills = [" ", "\t", "a", ".", "(", "-", "'", "a(", "-i", "\n"];
  const slow = [];
  for (const start of starts) {
    for (const fill of fills) {
      const run = fill.repeat(Math.ceil(n / fill.length));
      for (const cmd of [`${start}${run} ${X}`, `${start} ${X} ${run}`]) {
        const t0 = process.hrtime.bigint();
        guard.looksLikeContentWrite(cmd);
        const ms = Number(process.hrtime.bigint() - t0) / 1e6;
        if (ms >= 500)
          slow.push(
            `${JSON.stringify(start)} × ${JSON.stringify(fill)}: ${ms.toFixed(0)}ms`
          );
      }
    }
  }
  const k = 16 * 1024;
  for (const [label, cmd] of [
    ["70k 字 + リダイレクト", `echo ${" ".repeat(70000)} > ${X}`],
    // 入れ子の受け手を 1 つずつ後ろへ辿ると 2 乗になる
    [
      "入れ子の write_text",
      `python3 -c '${"(".repeat(k)}p${").write_text()".repeat(k)}' ${X}`,
    ],
  ]) {
    const t0 = process.hrtime.bigint();
    guard.looksLikeContentWrite(cmd);
    const ms = Number(process.hrtime.bigint() - t0) / 1e6;
    if (ms >= 500) slow.push(`${label}: ${ms.toFixed(0)}ms`);
  }
  assert.deepEqual(slow, []);
});

// --- 事後照合: 書き方に依存しない本命の網 --------------------------------

/** Pre → (Bash の実行を模して) mutate → Post の順に走らせ、Post の出力を返す */
function roundTrip(
  ctx,
  mutate,
  { event = "PostToolUse", command = "true" } = {}
) {
  call(ctx, "PreToolUse", command);
  mutate();
  return parsed(call(ctx, event, command));
}

const rewrite = (ctx, rel, from, to) => {
  const p = path.join(ctx.root, rel);
  fs.writeFileSync(p, fs.readFileSync(p, "utf8").replace(from, to));
};

test("Post: 保護キーの変化を Claude とユーザーの両方へ出す", () => {
  const ctx = makeRepo();
  const out = roundTrip(ctx, () =>
    rewrite(ctx, X, "lastVerified: 2026-09-01", "lastVerified: 2026-09-09")
  );
  const context = out.hookSpecificOutput?.additionalContext ?? "";
  assert.equal(out.hookSpecificOutput?.hookEventName, "PostToolUse");
  assert.match(context, /laws\/x\.md/);
  assert.match(context, /lastVerified/);
  assert.match(context, /2026-09-01/);
  assert.match(context, /2026-09-09/);
  assert.match(out.systemMessage ?? "", /lastVerified/);

  const removed = roundTrip(ctx, () =>
    rewrite(
      ctx,
      X,
      "eGovUrl: https://laws.e-gov.go.jp/law/418AC0000000120\n",
      ""
    )
  );
  assert.match(
    removed.hookSpecificOutput?.additionalContext ?? "",
    /eGovUrl:\n\s+before: https:\/\/laws\.e-gov\.go\.jp\/law\/418AC0000000120\n\s+after:  ∅/
  );
});

test("Post: 保護キー以外の変更だけなら何も出さず、控えも残さない", () => {
  const ctx = makeRepo();
  const out = roundTrip(ctx, () => rewrite(ctx, X, "本文 ", "本文だけ "));
  assert.deepEqual(out, {});
  // 保護キーは frontmatter の中だけ(Edit 側の Write 判定と同じ)。本文の `title:` 形の行は見ない
  const inBody = roundTrip(ctx, () =>
    rewrite(ctx, X, "title: 本文の中の見出し", "title: 本文の見出し")
  );
  assert.deepEqual(inBody, {});
  assert.deepEqual(fs.readdirSync(ctx.stateDir), []);
});

test("PostToolUseFailure: 失敗したコマンドの途中の書き換えも出す", () => {
  const ctx = makeRepo();
  const out = roundTrip(
    ctx,
    () => rewrite(ctx, X, "law/418AC0000000120", "law/418AC0000000121"),
    { event: "PostToolUseFailure" }
  );
  assert.equal(out.hookSpecificOutput?.hookEventName, "PostToolUseFailure");
  assert.match(out.hookSpecificOutput?.additionalContext ?? "", /eGovUrl/);
});

test("Post: worktree の中の書き換えと、既存 worktree の新規ファイルも出す", () => {
  const ctx = makeRepo();
  const wt = path.join(ctx.root, ".claude", "worktrees", "w1");
  git(ctx.root, "worktree", "add", "-q", wt, "-b", "w1");
  const out = roundTrip(ctx, () => {
    rewrite(
      { root: wt },
      X,
      "lastVerified: 2026-09-01",
      "lastVerified: 2026-09-07"
    );
    fs.writeFileSync(
      path.join(wt, "src/content/laws/new.md"),
      "---\ntitle: n\neGovUrl: https://example.org/n\n---\n"
    );
  });
  const context = out.hookSpecificOutput?.additionalContext ?? "";
  assert.match(
    context,
    /worktrees\/w1\/src\/content\/laws\/x\.md lastVerified/
  );
  assert.match(context, /worktrees\/w1\/src\/content\/laws\/new\.md eGovUrl/);
});

test("Post: Bash で作った worktree のファイルは変化に数えず、同時の本物の変化は出す", () => {
  // メインは `.claude/worktrees/*` の接頭辞でもある。前方一致で帰属を決めると、新しい
  // worktree の全ファイルがメインの新規ファイルに化け、本物の変化が切り詰めの外に落ちる
  const ctx = makeRepo();
  const out = roundTrip(ctx, () => {
    git(
      ctx.root,
      "worktree",
      "add",
      "-q",
      path.join(ctx.root, ".claude/worktrees/new"),
      "-b",
      "new"
    );
    rewrite(ctx, X, "lastVerified: 2026-09-01", "lastVerified: 2026-09-08");
  });
  const context = out.hookSpecificOutput?.additionalContext ?? "";
  assert.match(
    context,
    /^\[bash-frontmatter-guard\] 1 protected frontmatter value\(s\) changed in 1 file\(s\)/
  );
  assert.match(context, /^  src\/content\/laws\/x\.md lastVerified:$/m);
  assert.doesNotMatch(context, /worktrees\/new/);
});

test("Post: ページの e-Gov URL・法令 ID の書き換えを出し、自サイト URL だけの変化は出さない", () => {
  const ctx = makeRepo();
  const out = roundTrip(ctx, () =>
    rewrite(ctx, P, "322AC0000000026", "322AC0000000027")
  );
  const context = out.hookSpecificOutput?.additionalContext ?? "";
  assert.match(context, /src\/pages\/guides\/g\.astro __urls__/);
  assert.match(context, /src\/pages\/guides\/g\.astro __egovIds__/);

  const own = roundTrip(ctx, () =>
    rewrite(ctx, P, "law.edu-evidence.org/laws", "law.edu-evidence.org/guides")
  );
  assert.deepEqual(own, {});

  // .astro の `---` の中は JS で `title:` がデータとして出てくる。保護キーは法令にだけ当てる
  const jsTitle = roundTrip(ctx, () =>
    rewrite(ctx, P, 'title: "ガイド"', 'title: "手引き"')
  );
  assert.deepEqual(jsTitle, {});
});

test("Post: 法令の本文の URL・法令 ID の書き換えも出す(控えは frontmatter だけでなく全文)", () => {
  const ctx = makeRepo();
  const out = roundTrip(ctx, () => {
    rewrite(ctx, X, "mext.go.jp/b", "mext.go.jp/c");
    rewrite(
      ctx,
      X,
      "本文 https://www.mext.go.jp/c 322AC0000000026",
      "本文 https://www.mext.go.jp/c 322AC0000000027"
    );
  });
  const context = out.hookSpecificOutput?.additionalContext ?? "";
  assert.match(context, /laws\/x\.md __urls__/);
  assert.match(context, /laws\/x\.md __egovIds__/);
});

test("Pre: src/pages への書き換えは、このリポに向いたときだけ ask する", () => {
  // src/pages を持つリポはほかにもあり、ディスパッチャ経由では全セッションの Bash を見る
  const ctx = makeRepo();
  const other = tmp("bash-fm-other-");
  const pageEdit = `sed -i '' 's/a/b/' ${P}`;
  assert.equal(
    decisionOf(call(ctx, "PreToolUse", pageEdit)),
    "ask",
    "cwd がリポ"
  );
  assert.equal(
    decisionOf(call(ctx, "PreToolUse", pageEdit, "toolu_02", other)),
    undefined,
    "cwd が別リポ"
  );
  assert.equal(
    decisionOf(
      call(ctx, "PreToolUse", `cd ~/edu-law && ${pageEdit}`, "toolu_03", other)
    ),
    "ask",
    "リポ名を含む"
  );
  assert.equal(
    decisionOf(call(ctx, "PreToolUse", pageEdit, "toolu_04", null)),
    "ask",
    "cwd が無い"
  );
  assert.equal(
    decisionOf(
      call(ctx, "PreToolUse", pageEdit, "toolu_06", path.join(other, "gone"))
    ),
    "ask",
    "cwd を解決できない"
  );
  // 法令は絞らない(このリポにしか無い)
  assert.equal(
    decisionOf(
      call(ctx, "PreToolUse", `sed -i '' 's/a/b/' ${X}`, "toolu_05", other)
    ),
    "ask",
    "法令"
  );
  // ディレクトリ単位の書き換えも拾う(拡張子を見ない)
  for (const cmd of [
    "git checkout origin/main -- src/pages",
    "git restore src/pages/guides",
    `cp -R /tmp/x src/pages/`,
  ]) {
    assert.equal(decisionOf(call(ctx, "PreToolUse", cmd)), "ask", cmd);
  }
});

test("settings.json が Bash の 3 イベントにこのガードを配線している", () => {
  // 配線が消えるとガード全体が黙って無効になるが、他のどのテストも赤にならない
  const settings = JSON.parse(
    fs.readFileSync(path.join(__dirname, "..", "..", "settings.json"), "utf8")
  );
  for (const event of ["PreToolUse", "PostToolUse", "PostToolUseFailure"]) {
    const wired = (settings.hooks?.[event] ?? []).some(
      (group) =>
        group.matcher === "Bash" &&
        (group.hooks ?? []).some(
          (h) =>
            h.type === "command" &&
            h.timeout === 5 &&
            h.async !== true &&
            h.command ===
              'node "$CLAUDE_PROJECT_DIR"/.claude/hooks/bash-frontmatter-guard.cjs'
        )
    );
    assert.ok(wired, event);
    // 全フックを止める設定があると、配線が残っていても何も走らない
    assert.notEqual(settings.disableAllHooks, true);
  }
});

// --- 照合できないときは無音にしない --------------------------------------

test("Post: Pre の控えが無ければ、照合できなかったことを両方へ出す", () => {
  const ctx = makeRepo();
  for (const event of ["PostToolUse", "PostToolUseFailure"]) {
    const out = parsed(call(ctx, event, "true", "toolu_never_pre"));
    assert.match(out.systemMessage ?? "", /not verified/, event);
    assert.match(
      out.hookSpecificOutput?.additionalContext ?? "",
      /not verified/,
      event
    );
  }
});

test("二重に走った Pre / Post では、どちらの Post も照合して警告しない", () => {
  // このリポの配線とユーザー環境のディスパッチャの両方が同じ Bash でこのガードを走らせる
  // 経路がある。1 本目の Post が控えを消すと、2 本目が「not verified」と誤って警告していた
  const ctx = makeRepo();
  for (const [i, event] of ["PostToolUse", "PostToolUseFailure"].entries()) {
    call(ctx, "PreToolUse", "true");
    call(ctx, "PreToolUse", "true");
    rewrite(ctx, X, /lastVerified: [\d-]+/, `lastVerified: 2026-09-1${i}`);
    for (const n of [1, 2]) {
      const out = parsed(call(ctx, event, "true"));
      assert.doesNotMatch(
        out.systemMessage ?? "",
        /not verified|could not verify/,
        `${event} #${n}`
      );
      assert.match(
        out.hookSpecificOutput?.additionalContext ?? "",
        /lastVerified/,
        `${event} #${n}`
      );
    }
    assert.deepEqual(fs.readdirSync(ctx.stateDir), [], event);
  }
});

test("Pre が 1 本で Post が 2 本なら、2 本目は照合できなかったことを出す", () => {
  const ctx = makeRepo();
  call(ctx, "PreToolUse", "true");
  assert.doesNotMatch(
    parsed(call(ctx, "PostToolUse", "true")).systemMessage ?? "",
    /not verified/
  );
  assert.match(
    parsed(call(ctx, "PostToolUse", "true")).systemMessage ?? "",
    /not verified/
  );
});

test("同時に走る 2 本の Post も、どちらも照合して控えと印を残さない", async () => {
  // 印を unlink で取ると、同時の 2 本がどちらも成功して同じ印を取り、控えが残る(APFS で実測)
  const ctx = makeRepo();
  const script = [
    "const [guardPath, root, stateDir, at] = process.argv.slice(1);",
    "let d = '';",
    "process.stdin.on('data', (c) => (d += c)).on('end', () => {",
    "  while (Date.now() < Number(at));",
    "  const out = require(guardPath).run(d, { root, stateDir });",
    "  process.stdout.write(out.stdout || '');",
    "});",
  ].join("\n");
  const input = JSON.stringify({
    hook_event_name: "PostToolUse",
    session_id: "sess-1",
    tool_use_id: "toolu_01",
    tool_name: "Bash",
    tool_input: { command: "true" },
    cwd: ctx.root,
  });
  const guardPath = path.join(__dirname, "..", "bash-frontmatter-guard.cjs");
  const post = (at) =>
    new Promise((resolve) => {
      const child = spawn(
        process.execPath,
        ["-e", script, guardPath, ctx.root, ctx.stateDir, String(at)],
        { stdio: ["pipe", "pipe", "inherit"] }
      );
      let out = "";
      child.stdout.on("data", (c) => (out += c));
      child.on("close", () => resolve(out));
      child.stdin.end(input);
    });
  const problems = [];
  // 60 回: 順序の変異(控えを読む前に印を取る・控えの unlink の ENOENT を許さない)は確率的にしか
  // 表に出ず、反復 1 回あたりの率は変異と実行環境で大きく変わる。20 回では取りこぼす実行があり、
  // 60 回では手元で測ったすべての実行で赤になった(2026-09-28。単独実行で約 13 秒)
  for (let i = 0; i < 60; i++) {
    call(ctx, "PreToolUse", "true");
    call(ctx, "PreToolUse", "true");
    const at = Date.now() + 150;
    const outs = await Promise.all([post(at), post(at)]);
    for (const out of outs)
      if (/not verified|could not verify/.test(out))
        problems.push(`${i}: ${out}`);
    const left = fs.readdirSync(ctx.stateDir);
    if (left.length) problems.push(`${i}: ${left.join(", ")}`);
    for (const name of left) fs.rmSync(path.join(ctx.stateDir, name));
  }
  assert.deepEqual(problems, []);
});

test("Pre: tool_use_id が不正な形なら控えを取らずに警告する", () => {
  const ctx = makeRepo();
  const out = parsed(call(ctx, "PreToolUse", "true", "../../etc/x"));
  assert.match(out.systemMessage ?? "", /malformed/);
  assert.equal(fs.existsSync(ctx.stateDir), false);
});

test("Pre: 状態置き場が他人に開いている・symlink なら控えを取らずに警告する", () => {
  const loose = makeRepo();
  fs.mkdirSync(loose.stateDir, { mode: 0o755 });
  fs.chmodSync(loose.stateDir, 0o755);
  assert.match(
    parsed(call(loose, "PreToolUse", "true")).systemMessage ?? "",
    /accessible by others/
  );
  assert.deepEqual(fs.readdirSync(loose.stateDir), []);

  const linked = makeRepo();
  const target = tmp("bash-fm-target-");
  fs.symlinkSync(target, linked.stateDir);
  assert.match(
    parsed(call(linked, "PreToolUse", "true")).systemMessage ?? "",
    /not a directory/
  );
  assert.deepEqual(fs.readdirSync(target), []);
});

test("Pre: 1 日より古い控えの残骸を消す(権限拒否では Post が発火しない)", () => {
  const ctx = makeRepo();
  const age = (id, ms) => {
    const at = new Date(Date.now() - ms);
    for (const name of [`sess-1-${id}.json`, `sess-1-${id}.t0`])
      fs.utimesSync(path.join(ctx.stateDir, name), at, at);
  };
  call(ctx, "PreToolUse", "true", "toolu_old");
  age("toolu_old", 25 * 60 * 60 * 1000);
  call(ctx, "PreToolUse", "true", "toolu_recent");
  age("toolu_recent", 23 * 60 * 60 * 1000);
  call(ctx, "PreToolUse", "true", "toolu_new");
  assert.deepEqual(fs.readdirSync(ctx.stateDir).sort(), [
    "sess-1-toolu_new.json",
    "sess-1-toolu_new.t0",
    "sess-1-toolu_recent.json",
    "sess-1-toolu_recent.t0",
  ]);
});

// --- 時間予算と CLI 配線 --------------------------------------------------
//
// settings.json の `timeout: 5`(秒)を超えると kill され、stdout が出ない = 素通りする。
// Pre と Post はそれぞれ全 worktree の全コンテンツを読むので、実データで測る。

test("実データの控えが 500ms に収まる", () => {
  const root = path.resolve(__dirname, "..", "..", "..");
  const started = process.hrtime.bigint();
  const { snapshot } = guard.takeSnapshot(root);
  const ms = Number(process.hrtime.bigint() - started) / 1e6;
  // 法令 12 + ページ 20(2026-09-27)。worktree があれば増える
  assert.ok(Object.keys(snapshot.files).length >= 30);
  assert.ok(ms < 500, `控えに ${ms.toFixed(0)}ms かかった`);

  // 抽出の正規表現が二次挙動に戻ると、空白 32KB で数秒かかる(Edit 側ガードの実測)
  const t0 = process.hrtime.bigint();
  guard.captureProtectedFields(" ".repeat(32 * 1024));
  const ws = Number(process.hrtime.bigint() - t0) / 1e6;
  assert.ok(ws < 500, `32KB の空白に ${ws.toFixed(0)}ms かかった`);
  const t1 = process.hrtime.bigint();
  guard.captureProtectedFields(`url: a${" ".repeat(32 * 1024)}b`);
  const inLine = Number(process.hrtime.bigint() - t1) / 1e6;
  assert.ok(
    inLine < 500,
    `値の中の 32KB の空白に ${inLine.toFixed(0)}ms かかった`
  );
});

const HOOK = path.join(__dirname, "..", "bash-frontmatter-guard.cjs");
const runCli = (payload) =>
  spawnSync(process.execPath, [HOOK], { input: payload, encoding: "utf8" });

test("CLI: 書き換えの形の Bash で ask を stdout に出し、壊れた入力でも 0 で終わる", () => {
  const res = runCli(
    JSON.stringify({
      hook_event_name: "PreToolUse",
      tool_name: "Bash",
      tool_input: { command: `sed -i '' 's/5/9/' ${X}` },
    })
  );
  assert.equal(res.status, 0);
  assert.equal(
    JSON.parse(res.stdout).hookSpecificOutput.permissionDecision,
    "ask"
  );
  assert.equal(runCli("{not json").status, 0);
  assert.equal(runCli("").status, 0);
});
