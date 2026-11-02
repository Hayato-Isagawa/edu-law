// zizmor.yml の、検査を黙って無効にできる設定のうち、下の 5 つを固定する(環境変数での offline 指定や、
// 設定を書く step と action の間に挟む step などは見ていない)。
//
// どれも変わっても workflow は緑のまま検査だけが効かなくなる。advanced-security が true なら
// 指摘があっても job は落ちず、config: が外れればリポに置いた設定が CI に効き、collect: が既定に
// 戻れば .gitignore に書いた workflow が検査から外れる。continue-on-error や if: は job を落とさない。

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

test("step にも job にも continue-on-error と if: が無い", () => {
  const job = doc().jobs.zizmor;
  for (const target of [job, ...job.steps]) {
    assert.equal(Object.hasOwn(target, "continue-on-error"), false);
    assert.equal(Object.hasOwn(target, "if"), false);
  }
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
