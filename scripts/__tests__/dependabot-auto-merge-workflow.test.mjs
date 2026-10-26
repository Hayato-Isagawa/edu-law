// dependabot-auto-merge.yml の job の if: を固定する。
//
// この行には zizmor の bot-conditions を抑止するコメントが付いている。抑止は同じ行の条件を
// 書き換えても残るので、作成者(user.login)の判定を消して actor だけに戻しても zizmor は
// 何も出さない(1.31.1 で実測)。なのでここで行ごと固定する。

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const WORKFLOW = path.join(
  HERE,
  "..",
  "..",
  ".github",
  "workflows",
  "dependabot-auto-merge.yml"
);

test("job の if: が、作成者・head のリポ・actor の 3 条件と理由つきの抑止を持つ", () => {
  assert.match(
    fs.readFileSync(WORKFLOW, "utf8"),
    /^ {4}if: github\.event\.pull_request\.user\.login == 'dependabot\[bot\]' && github\.repository == github\.event\.pull_request\.head\.repo\.full_name && github\.actor == 'dependabot\[bot\]' # zizmor: ignore\[bot-conditions\] \S.*$/m,
    "Dependabot の判定(作成者・head のリポ・actor)と、actor を残す理由つきの抑止が無い"
  );
});
