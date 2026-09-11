import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { PassThrough } from "node:stream";
import test from "node:test";

import {
  buildCodexArgs,
  parseArgs,
  superviseCommand,
} from "./run-handoff.mjs";

function capture() {
  const stream = new PassThrough();
  let output = "";
  stream.on("data", (chunk) => {
    output += chunk.toString();
  });
  return { stream, read: () => output };
}

function nodeCommand(source) {
  return [process.execPath, ["-e", source]];
}

test("builds an initial codex exec command", () => {
  assert.deepEqual(
    buildCodexArgs({ model: "gpt-5.6-luna", sandbox: "workspace-write", prompt: "implement" }),
    ["exec", "-m", "gpt-5.6-luna", "--sandbox", "workspace-write", "--json", "implement"],
  );
});

test("builds a resumed command with config sandbox syntax", () => {
  assert.deepEqual(
    buildCodexArgs({
      model: "gpt-5.6-luna",
      sandbox: "workspace-write",
      resume: "thread-id",
      prompt: "fix all findings",
    }),
    [
      "exec", "resume", "thread-id", "-m", "gpt-5.6-luna", "-c",
      'sandbox_mode="workspace-write"', "--json", "fix all findings",
    ],
  );
});

test("parses safe defaults and rejects an unsupported sandbox", () => {
  assert.deepEqual(parseArgs(["--prompt", "inspect"]), {
    model: "gpt-5.6-luna",
    sandbox: "workspace-write",
    timeoutMs: 1800000,
    exitGraceMs: 10000,
    prompt: "inspect",
  });
  assert.throws(
    () => parseArgs(["--sandbox", "danger-full-access", "--prompt", "x"]),
    /read-only or workspace-write/,
  );
});

test("passes a completed turn through and exits successfully", async () => {
  const stdout = capture();
  const stderr = capture();
  const [command, args] = nodeCommand(
    'console.log(JSON.stringify({type:"thread.started",thread_id:"t"}));' +
      'console.log(JSON.stringify({type:"turn.completed"}));',
  );
  const result = await superviseCommand(command, args, {
    stdout: stdout.stream, stderr: stderr.stream, timeoutMs: 1000, exitGraceMs: 100,
  });

  assert.equal(result.exitCode, 0);
  assert.equal(result.terminalEvent, "turn.completed");
  assert.match(stdout.read(), /turn\.completed/);
  assert.equal(stderr.read(), "");
});

test("closes Codex stdin when the supervisor stdin remains open", async () => {
  const moduleUrl = new URL("./run-handoff.mjs", import.meta.url).href;
  const fakeCodex = `
    process.stdin.resume();
    process.stdin.once("end", () => {
      console.log(JSON.stringify({ type: "turn.completed" }));
    });
  `;
  const harness = `
    import { superviseCommand } from ${JSON.stringify(moduleUrl)};
    const result = await superviseCommand(
      process.execPath,
      ["-e", ${JSON.stringify(fakeCodex)}],
      { timeoutMs: 2000, exitGraceMs: 100 },
    );
    console.log("RESULT=" + JSON.stringify(result));
    process.exitCode = result.exitCode;
  `;
  const supervisor = spawn(
    process.execPath,
    ["--input-type=module", "-e", harness],
    { stdio: ["pipe", "pipe", "pipe"] },
  );
  let stdout = "";
  let stderr = "";
  supervisor.stdout.on("data", (chunk) => { stdout += chunk; });
  supervisor.stderr.on("data", (chunk) => { stderr += chunk; });

  const started = Date.now();
  const exitCode = await new Promise((resolve, reject) => {
    const testTimeout = setTimeout(() => {
      supervisor.kill("SIGKILL");
      reject(new Error("supervisor did not complete with an open stdin pipe"));
    }, 3000);
    supervisor.once("error", reject);
    supervisor.once("close", (code) => {
      clearTimeout(testTimeout);
      resolve(code);
    });
  });
  supervisor.stdin.destroy();

  assert.equal(exitCode, 0, stderr);
  assert.ok(Date.now() - started < 1000);
  assert.match(stdout, /"terminalEvent":"turn.completed"/);
});

test("fails when Codex exits without a terminal event", async () => {
  const stderr = capture();
  const [command, args] = nodeCommand('console.log(JSON.stringify({type:"turn.started"}));');
  const result = await superviseCommand(command, args, {
    stdout: capture().stream, stderr: stderr.stream, timeoutMs: 1000, exitGraceMs: 100,
  });

  assert.equal(result.exitCode, 126);
  assert.equal(result.terminalEvent, undefined);
  assert.match(stderr.read(), /without a terminal JSON event/);
});

test("fails a turn.failed event even when the child exits zero", async () => {
  const [command, args] = nodeCommand('console.log(JSON.stringify({type:"turn.failed"}));');
  const result = await superviseCommand(command, args, {
    stdout: capture().stream, stderr: capture().stream, timeoutMs: 1000, exitGraceMs: 100,
  });

  assert.equal(result.exitCode, 1);
  assert.equal(result.terminalEvent, "turn.failed");
});

test("terminates a process that hangs after turn.completed", async () => {
  const stderr = capture();
  const [command, args] = nodeCommand(
    'console.log(JSON.stringify({type:"turn.completed"}));setInterval(()=>{},1000);',
  );
  const started = Date.now();
  const result = await superviseCommand(command, args, {
    stdout: capture().stream, stderr: stderr.stream, timeoutMs: 2000, exitGraceMs: 100,
  });

  assert.equal(result.exitCode, 125);
  assert.equal(result.terminalEvent, "turn.completed");
  assert.ok(Date.now() - started < 1500);
  assert.match(stderr.read(), /received turn\.completed but Codex did not exit/);
});

test("terminates descendants that inherit pipes after the parent exits", async () => {
  const [command, args] = nodeCommand(`
    const { spawn } = require("node:child_process");
    const worker = spawn(process.execPath, ["-e", "setInterval(()=>{},1000)"], {
      stdio: ["ignore", "inherit", "inherit"],
    });
    worker.unref();
    console.log(JSON.stringify({ type: "turn.completed" }));
  `);
  const started = Date.now();
  const result = await superviseCommand(command, args, {
    stdout: capture().stream, stderr: capture().stream, timeoutMs: 2000, exitGraceMs: 100,
  });

  assert.equal(result.exitCode, 0);
  assert.equal(result.terminalEvent, "turn.completed");
  assert.ok(Date.now() - started < 1500);
});

test("terminates a stalled process at the overall timeout", async () => {
  const stderr = capture();
  const [command, args] = nodeCommand("setInterval(()=>{},1000);");
  const started = Date.now();
  const result = await superviseCommand(command, args, {
    stdout: capture().stream, stderr: stderr.stream, timeoutMs: 100, exitGraceMs: 100,
  });

  assert.equal(result.exitCode, 124);
  assert.equal(result.terminalEvent, undefined);
  assert.ok(Date.now() - started < 1500);
  assert.match(stderr.read(), /exceeded 0s timeout/);
});
