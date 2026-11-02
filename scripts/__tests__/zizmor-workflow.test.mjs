// zizmor.yml の、検査を黙って無効にできる設定を固定する。どれが崩れても workflow は緑のまま検査だけが効かなく
// なる — advanced-security が true なら指摘があっても job は落ちず、config: が外れればリポに置いた設定が CI に効き、
// collect: が既定に戻れば .gitignore に書いた workflow が検査から外れ、env の ZIZMOR_OFFLINE は online の audit を
// 飛ばし、continue-on-error や if: は job を落とさない。「workflow 全体が決まった形」のテストで全体を固定する。
// uses: は形(SHA で pin した同じ action)だけを見て SHA の中身は見ないので、同じ action の古い SHA や fork にある
// 別の SHA への差し替えは通る。行区切りに使われうる単独の CR・U+0085・U+2028・U+2029 は、yaml と GitHub で読みが
// 食い違うので、ファイルに置くこと自体を落とす。

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import YAML from "yaml";

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
const doc = () => YAML.parse(source(), { merge: false });
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
  assert.doesNotMatch(
    source().replace(/\r\n/g, "\n"),
    /[\r\u0085\u2028\u2029]/,
    "行区切りに使われうる文字がある"
  );
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

// 判定は ci-summary-workflow.test.mjs の mergeKeyPaths と同じ。yaml が展開する形
// (`!!merge`・`%YAML 1.1`)と、キーをエイリアスで書いた形も拾う
const isMergeKey = (key) =>
  YAML.isScalar(key) &&
  (key.value === "<<" ||
    (typeof key.value === "symbol" && key.value.description === "<<") ||
    key.tag === "tag:yaml.org,2002:merge");

test("zizmor.yml がマージキーを使っていない", () => {
  const parsed = YAML.parseDocument(source(), { merge: false });
  let found = 0;
  YAML.visit(parsed, {
    Pair(_, pair) {
      const key = YAML.isAlias(pair.key) ? pair.key.resolve(parsed) : pair.key;
      if (isMergeKey(key)) found++;
    },
  });
  assert.equal(found, 0, "zizmor.yml がマージキーを使っている");
});
