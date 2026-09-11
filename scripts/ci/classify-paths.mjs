import { appendFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";

const RUNTIME_FILES = new Set([
  "package.json",
  "package-lock.json",
  "vite.config.js",
  "playwright.config.js",
  "playwright.live.config.js",
  "index.html",
  "scripts/dev-webflow.mjs",
]);

const WORKFLOW_FILES = new Set([
  "AGENTS.md",
  "CLAUDE.md",
  ".markdownlint-cli2.jsonc",
]);

const DOCS_FILES = new Set([".gitignore", ".mcp.json"]);
const DIST_SOURCE_FILES = new Set([
  "package.json",
  "package-lock.json",
  "vite.config.js",
]);

function isUnder(path, directory) {
  return path.startsWith(`${directory}/`);
}

function isNoise(path) {
  return path === ".DS_Store" || path.endsWith("/.DS_Store");
}

export function classifyPaths(files) {
  const paths = files.map((file) => file.trim()).filter(Boolean);
  const hasDist = paths.some((file) => isUnder(file, "dist"));
  const hasDistSource = paths.some(
    (file) => isUnder(file, "src") || DIST_SOURCE_FILES.has(file),
  );
  const dist_orphan = hasDist && !hasDistSource;

  let runtime = false;
  let workflow = false;
  let docs = false;
  const reasons = [];

  for (const file of paths) {
    if (
      isUnder(file, "src") ||
      isUnder(file, "tests") ||
      isUnder(file, "dist") ||
      RUNTIME_FILES.has(file)
    ) {
      runtime = true;
      continue;
    }

    if (
      WORKFLOW_FILES.has(file) ||
      isUnder(file, "skills") ||
      isUnder(file, ".claude") ||
      isUnder(file, ".github") ||
      isUnder(file, "scripts/codex") ||
      isUnder(file, "scripts/ci")
    ) {
      workflow = true;
      continue;
    }

    if (
      file.endsWith(".md") ||
      DOCS_FILES.has(file) ||
      isNoise(file) ||
      isUnder(file, ".conductor")
    ) {
      docs = true;
      continue;
    }

    runtime = true;
    reasons.push(`unknown path fails closed: ${file}`);
  }

  if (paths.length === 0) {
    docs = true;
    reasons.push("nothing changed");
  }

  let route;
  if (dist_orphan) {
    route = "dist-orphan";
    reasons.unshift("dist changed without a corresponding source change");
  } else if (runtime) {
    route = "runtime";
    reasons.unshift("runtime-affecting files changed");
  } else if (workflow) {
    route = "workflow";
    reasons.unshift("workflow instructions or CI tooling changed");
  } else {
    route = "docs";
    if (paths.length > 0) reasons.unshift("documentation or ignored metadata changed");
  }

  return { route, reasons, runtime, workflow, docs, dist_orphan };
}

async function readCliFiles() {
  if (process.argv.length > 2) return process.argv.slice(2);
  if (process.stdin.isTTY) return [];

  let input = "";
  process.stdin.setEncoding("utf8");
  for await (const chunk of process.stdin) input += chunk;
  return input.split(/\r?\n/);
}

async function main() {
  const result = classifyPaths(await readCliFiles());
  const output = [
    `route=${result.route}`,
    `runtime=${result.runtime}`,
    `workflow=${result.workflow}`,
    `docs=${result.docs}`,
    `dist_orphan=${result.dist_orphan}`,
    `reasons=${result.reasons.join("; ")}`,
  ].join("\n") + "\n";

  if (process.env.GITHUB_OUTPUT) {
    await appendFile(process.env.GITHUB_OUTPUT, output);
  } else {
    process.stdout.write(output);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
