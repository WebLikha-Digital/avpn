import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import test from "node:test";

import { classifyPaths } from "./classify-paths.mjs";

const cases = [
  ["docs/example.md only → docs", ["docs/example.md"], "docs"],
  ["README.md only → docs", ["README.md"], "docs"],
  ["AGENTS.md only → workflow", ["AGENTS.md"], "workflow"],
  ["CLAUDE.md only → workflow", ["CLAUDE.md"], "workflow"],
  ["skills/review-pr/SKILL.md only → workflow", ["skills/review-pr/SKILL.md"], "workflow"],
  [".github/workflows/ci.yml only → workflow", [".github/workflows/ci.yml"], "workflow"],
  ["scripts/ci/classify-paths.mjs only → workflow", ["scripts/ci/classify-paths.mjs"], "workflow"],
  ["src/example.js only → runtime", ["src/example.js"], "runtime"],
  ["tests/example.spec.js only → runtime", ["tests/example.spec.js"], "runtime"],
  ["package.json only → runtime", ["package.json"], "runtime"],
  ["package-lock.json only → runtime", ["package-lock.json"], "runtime"],
  ["vite.config.js only → runtime", ["vite.config.js"], "runtime"],
  ["playwright.config.js only → runtime", ["playwright.config.js"], "runtime"],
  ["dist/animations.min.js + src/example.js → runtime, dist_orphan=false", ["dist/animations.min.js", "src/example.js"], "runtime", false],
  ["dist/animations.min.js alone → dist-orphan", ["dist/animations.min.js"], "dist-orphan"],
  ["dist/animations.min.js + README.md → dist-orphan", ["dist/animations.min.js", "README.md"], "dist-orphan"],
  ["docs/example.md + src/example.js → runtime", ["docs/example.md", "src/example.js"], "runtime"],
  ["AGENTS.md + README.md → workflow", ["AGENTS.md", "README.md"], "workflow"],
  ["AGENTS.md + src/example.js → runtime", ["AGENTS.md", "src/example.js"], "runtime"],
  ["unknown foo/bar.txt → runtime", ["foo/bar.txt"], "runtime"],
  ["[] → docs", [], "docs"],
];

for (const [name, files, route, distOrphan] of cases) {
  test(name, () => {
    const result = classifyPaths(files);
    assert.equal(result.route, route);
    if (distOrphan !== undefined) {
      assert.equal(result.dist_orphan, distOrphan);
    }
  });
}

test("empty list reason says nothing changed", () => {
  assert.ok(classifyPaths([]).reasons.includes("nothing changed"));
});

test("CLI output contains GitHub Actions key=value lines", () => {
  const script = fileURLToPath(new URL("./classify-paths.mjs", import.meta.url));
  const result = spawnSync(process.execPath, [script, "AGENTS.md", "README.md"], {
    encoding: "utf8",
  });

  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /^route=workflow$/m);
  assert.match(result.stdout, /^runtime=false$/m);
  assert.match(result.stdout, /^workflow=true$/m);
  assert.match(result.stdout, /^docs=true$/m);
  assert.match(result.stdout, /^dist_orphan=false$/m);
});
