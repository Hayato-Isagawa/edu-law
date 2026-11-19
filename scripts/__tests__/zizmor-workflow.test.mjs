// zizmor.yml の、検査を黙って無効にできる設定を固定する。どれが崩れても workflow は緑のまま検査だけが効かなく
// なる — advanced-security が true なら指摘があっても job は落ちず、config: が外れればリポに置いた設定が CI に効き、
// collect: が既定に戻れば .gitignore に書いた workflow が検査から外れ、env の ZIZMOR_OFFLINE は online の audit を
// 飛ばし、continue-on-error や if: は job を落とさない。「workflow 全体が決まった形」のテストで全体を固定する。
// uses: は形(SHA で pin した同じ action)だけを見て SHA の中身は見ないので、同じ action の古い SHA や fork にある
// 別の SHA への差し替えは通る。手元の yaml と GitHub の runner とで読みが食い違いうる書き方(行区切りに使われうる文字・
// 未知のタグ・`%YAML` など)は、比べる前に落とす(workflow-yaml.mjs の ambiguousYaml)。その判定を全部の workflow に
// 当てるテストと、判定そのものを確かめる fixture のテストも、このファイルの末尾に置く。

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  ambiguousYaml,
  mergeKeyPaths,
  parseWorkflow,
} from "./workflow-yaml.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const WORKFLOW = path.join(
  HERE,
  "..",
  "..",
  ".github",
  "workflows",
  "zizmor.yml"
);

// マージキー(`<<:`)は GitHub Actions が展開しないので、展開せずに読み、使っていること自体を下で落とす
const source = () => fs.readFileSync(WORKFLOW, "utf8");
const doc = () => parseWorkflow(source());
const steps = () => doc().jobs.zizmor.steps;
const actionIndex = () => {
  const i = steps().findIndex((s) =>
    String(s.uses ?? "").startsWith("zizmorcore/zizmor-action@")
  );
  assert.notEqual(i, -1, "zizmor-action の step が無い");
  return i;
};

test("zizmor-action の with: は advanced-security: false・CI 用の config・collect: all の 3 つだけ", () => {
  assert.deepEqual(steps()[actionIndex()].with, {
    "advanced-security": false,
    config: "${{ runner.temp }}/zizmor-ci.yml",
    collect: "all",
  });
});

test("CI 用の設定(rules: {})を、zizmor-action より前の step で書く", () => {
  const i = steps().findIndex((s) => s.name === "Write the CI zizmor config");
  assert.notEqual(i, -1, "設定を書く step が無い");
  assert.ok(i < actionIndex(), "設定を書く step が zizmor-action より後にある");
  assert.deepEqual(steps()[i], {
    name: "Write the CI zizmor config",
    run: `printf 'rules: {}\\n' > "$RUNNER_TEMP/zizmor-ci.yml"\n`,
  });
});

test("workflow 全体が決まった形(env・continue-on-error・if・defaults も checkout の中身も足せない)", () => {
  assert.deepEqual(ambiguousYaml(source()), []);
  // uses: は SHA で pin した同じ action であることだけを見て、比べる前に名前に置き換える(Dependabot が上げるため)
  const wf = doc();
  for (const step of wf?.jobs?.zizmor?.steps ?? []) {
    if (typeof step?.uses !== "string") continue;
    const m =
      /^(actions\/checkout|zizmorcore\/zizmor-action)@[0-9a-f]{40}$/.exec(
        step.uses
      );
    if (m) step.uses = `<${m[1]}>`;
  }
  assert.deepEqual(wf, {
    name: "zizmor",
    on: {
      pull_request: { branches: ["main"], paths: [".github/**"] },
      schedule: [{ cron: "17 0 * * 1" }],
      workflow_dispatch: null,
    },
    concurrency: {
      group: "zizmor-${{ github.ref }}",
      "cancel-in-progress": true,
    },
    permissions: { contents: "read" },
    jobs: {
      zizmor: {
        name: "zizmor",
        "runs-on": "ubuntu-latest",
        "timeout-minutes": 10,
        steps: [
          {
            name: "Checkout",
            uses: "<actions/checkout>",
            with: { "persist-credentials": false },
          },
          {
            name: "Write the CI zizmor config",
            run: `printf 'rules: {}\\n' > "$RUNNER_TEMP/zizmor-ci.yml"\n`,
          },
          {
            name: "Run zizmor",
            uses: "<zizmorcore/zizmor-action>",
            with: {
              "advanced-security": false,
              config: "${{ runner.temp }}/zizmor-ci.yml",
              collect: "all",
            },
          },
        ],
      },
    },
  });
});

test("トリガーは pull_request・週 1 回の schedule・workflow_dispatch", () => {
  const on = doc().on;
  assert.deepEqual(Object.keys(on), [
    "pull_request",
    "schedule",
    "workflow_dispatch",
  ]);
  assert.deepEqual(on.schedule, [{ cron: "17 0 * * 1" }]);
});

// 判定は workflow-yaml.mjs の mergeKeyPaths。yaml が展開する形(`!!merge`・`%YAML 1.1`)と、
// キーをエイリアスで書いた形も拾う
test("zizmor.yml がマージキーを使っていない", () => {
  assert.deepEqual(
    mergeKeyPaths(source()),
    [],
    "zizmor.yml がマージキーを使っている"
  );
});

test("全部の workflow が、手元の yaml と GitHub で読みが食い違いうる書き方を使っていない", () => {
  // workflow のテストごとに判定を足す形だと、テストが読んでいるのに判定を当てない workflow が残るので、ここで全部に当てる
  const dir = path.dirname(WORKFLOW);
  const files = fs
    .readdirSync(dir)
    .filter((n) => /\.ya?ml$/.test(n))
    .sort();
  assert.ok(files.length > 0, ".github/workflows/ に workflow が 1 本も無い");
  for (const f of files)
    assert.deepEqual(
      ambiguousYaml(fs.readFileSync(path.join(dir, f), "utf8")),
      [],
      f
    );
});

test("fixture: ambiguousYaml は区切り文字・yaml のエラーと警告・タグ・ディレクティブを拾い、ふつうの書き方は拾わない", () => {
  // 実ファイルでは「何も無い」ことしか見えず、判定が no-op に落ちても緑のまま通るので、書き方ごとに発火を見る
  const base = "name: x\non:\n  push:\n    branches: [main]\n";
  assert.deepEqual(ambiguousYaml(base), [], "ふつうの書き方");
  assert.deepEqual(
    ambiguousYaml(base.replace(/\n/g, "\r\n")),
    [],
    "ファイル全体の CRLF"
  );
  assert.deepEqual(
    ambiguousYaml(`a: "q"\nb: 'r'\nc: {d: [1, 2]}\ne: &x 1\nf: *x\n`),
    [],
    "引用符・フロー形・アンカー"
  );
  for (const [label, src] of [
    ["単独の CR", "# c\rname: x\n"],
    ["U+0085", "# c\u0085name: x\n"],
    ["U+2028", "# c\u2028name: x\n"],
    ["U+2029", "# c\u2029name: x\n"],
    ["未知のディレクティブ", "%FOO bar\n---\nname: x\n"],
    ["キーの重複", "name: x\nname: y\n"],
    ["スカラーの未知のタグ", "name: !foo x\n"],
    ["マップの未知のタグ", "jobs: !foo {a: 1}\n"],
    ["引用符付きの値の型のタグ", 'timeout-minutes: !!int "5"\n'],
    ["警告の出ない既知のタグ", "name: !!timestamp 2001-12-14\n"],
    ["!!str", "name: !!str x\n"],
    ["警告の出ないマップのタグ", "jobs: !!map {a: 1}\n"],
    ["!!set", "a: !!set {x, y}\n"],
    ["非特定タグ !", "a: ! 5\n"],
    ["キーの位置のタグ", "!!str k: 1\n"],
    ["列のタグ", "a: !!seq [1]\n"],
    ["%YAML 1.2", "%YAML 1.2\n---\nname: x\n"],
    ["%YAML 1.1", "%YAML 1.1\n---\nname: x\n"],
    ["%TAG", "%TAG !e! tag:example.com,2000:\n---\nname: x\n"],
    [
      "%TAG で !! を差し替える",
      "%TAG !! tag:example.com,2000:\n---\nname: x\n",
    ],
  ]) {
    assert.notDeepEqual(ambiguousYaml(src), [], label);
  }
});
