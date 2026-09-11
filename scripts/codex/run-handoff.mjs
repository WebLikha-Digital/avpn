import { spawn } from "node:child_process";
import process from "node:process";
import { pathToFileURL } from "node:url";

const DEFAULT_TIMEOUT_MS = 30 * 60 * 1000;
const DEFAULT_EXIT_GRACE_MS = 10 * 1000;
const TERMINAL_EVENTS = new Set(["turn.completed", "turn.failed", "error"]);

function positiveNumber(value, flag) {
  const number = Number(value);
  if (!Number.isFinite(number) || number <= 0) {
    throw new Error(`${flag} must be a positive number`);
  }
  return number;
}

export function parseArgs(argv) {
  const options = {
    model: "gpt-5.6-luna",
    sandbox: "workspace-write",
    timeoutMs: DEFAULT_TIMEOUT_MS,
    exitGraceMs: DEFAULT_EXIT_GRACE_MS,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const flag = argv[index];
    const value = argv[index + 1];

    if (flag === "--model" && value) {
      options.model = value;
      index += 1;
    } else if (flag === "--sandbox" && value) {
      options.sandbox = value;
      index += 1;
    } else if (flag === "--resume" && value) {
      options.resume = value;
      index += 1;
    } else if (flag === "--prompt" && value) {
      options.prompt = value;
      index += 1;
    } else if (flag === "--timeout-seconds" && value) {
      options.timeoutMs = positiveNumber(value, flag) * 1000;
      index += 1;
    } else if (flag === "--exit-grace-seconds" && value) {
      options.exitGraceMs = positiveNumber(value, flag) * 1000;
      index += 1;
    } else {
      throw new Error(`unknown or incomplete argument: ${flag}`);
    }
  }

  if (!options.prompt) throw new Error("--prompt is required");
  if (!new Set(["read-only", "workspace-write"]).has(options.sandbox)) {
    throw new Error("--sandbox must be read-only or workspace-write");
  }
  return options;
}

export function buildCodexArgs({ model, sandbox, resume, prompt }) {
  if (resume) {
    return [
      "exec",
      "resume",
      resume,
      "-m",
      model,
      "-c",
      `sandbox_mode=\"${sandbox}\"`,
      "--json",
      prompt,
    ];
  }
  return ["exec", "-m", model, "--sandbox", sandbox, "--json", prompt];
}

function signalProcessGroup(child, signal) {
  if (!child.pid) return;
  try {
    if (process.platform === "win32") child.kill(signal);
    else process.kill(-child.pid, signal);
  } catch (error) {
    if (error.code !== "ESRCH") throw error;
  }
}

export function superviseCommand(command, args, options = {}) {
  const {
    cwd = process.cwd(),
    env = process.env,
    stdout = process.stdout,
    stderr = process.stderr,
    timeoutMs = DEFAULT_TIMEOUT_MS,
    exitGraceMs = DEFAULT_EXIT_GRACE_MS,
  } = options;

  return new Promise((resolve) => {
    const child = spawn(command, args, {
      cwd,
      env,
      detached: process.platform !== "win32",
      // `codex exec` reads piped stdin until EOF. In Claude's non-TTY shell an
      // inherited, still-open stdin can therefore block before any JSON event.
      stdio: ["ignore", "pipe", "pipe"],
    });

    let buffer = "";
    let terminalEvent;
    let stopReason;
    let forceTimer;
    let exitGraceTimer;
    let settled = false;

    const requestStop = (reason) => {
      if (stopReason) return;
      stopReason = reason;
      stderr.write(`[codex-handoff] ${reason}; terminating process group\n`);
      signalProcessGroup(child, "SIGTERM");
      forceTimer = setTimeout(() => {
        stderr.write("[codex-handoff] process group ignored SIGTERM; sending SIGKILL\n");
        signalProcessGroup(child, "SIGKILL");
      }, Math.min(exitGraceMs, 2000));
    };

    const observeLine = (line) => {
      if (!line.trim()) return;
      try {
        const event = JSON.parse(line);
        if (TERMINAL_EVENTS.has(event.type) && !terminalEvent) {
          terminalEvent = event.type;
          exitGraceTimer = setTimeout(
            () => requestStop(`received ${event.type} but Codex did not exit`),
            exitGraceMs,
          );
        }
      } catch {
        // Preserve non-JSON diagnostics without treating them as lifecycle events.
      }
    };

    child.stdout.on("data", (chunk) => {
      stdout.write(chunk);
      buffer += chunk.toString();
      const lines = buffer.split(/\r?\n/);
      buffer = lines.pop() ?? "";
      for (const line of lines) observeLine(line);
    });
    child.stderr.on("data", (chunk) => stderr.write(chunk));

    const timeout = setTimeout(
      () => requestStop(`exceeded ${Math.round(timeoutMs / 1000)}s timeout`),
      timeoutMs,
    );
    const onSigint = () => requestStop("supervisor received SIGINT");
    const onSigterm = () => requestStop("supervisor received SIGTERM");
    process.once("SIGINT", onSigint);
    process.once("SIGTERM", onSigterm);

    const cleanUp = () => {
      clearTimeout(timeout);
      clearTimeout(exitGraceTimer);
      clearTimeout(forceTimer);
      process.off("SIGINT", onSigint);
      process.off("SIGTERM", onSigterm);
    };

    child.on("error", (error) => {
      if (settled) return;
      settled = true;
      cleanUp();
      stderr.write(`[codex-handoff] failed to start Codex: ${error.message}\n`);
      resolve({ exitCode: 127, terminalEvent, stopReason: "spawn failed" });
    });

    child.on("exit", (code, signal) => {
      // The group leader has exited, so SIGKILL now targets only descendants that
      // could otherwise keep inherited output pipes open.
      signalProcessGroup(child, "SIGKILL");
    });

    child.on("close", (code, signal) => {
      if (settled) return;
      settled = true;
      cleanUp();
      if (buffer) observeLine(buffer);

      let exitCode = code ?? 1;
      if (stopReason?.startsWith("exceeded")) exitCode = 124;
      else if (stopReason) exitCode = 125;
      else if (!terminalEvent) {
        exitCode = 126;
        stderr.write("[codex-handoff] Codex exited without a terminal JSON event\n");
      } else if (terminalEvent !== "turn.completed") {
        exitCode = exitCode || 1;
      } else if (exitCode !== 0) {
        stderr.write(
          `[codex-handoff] Codex emitted turn.completed but exited ${exitCode}${signal ? ` (${signal})` : ""}\n`,
        );
      }

      resolve({ exitCode, terminalEvent, stopReason, signal });
    });
  });
}

async function main() {
  try {
    const options = parseArgs(process.argv.slice(2));
    const result = await superviseCommand(
      "codex",
      buildCodexArgs(options),
      options,
    );
    process.exitCode = result.exitCode;
  } catch (error) {
    process.stderr.write(`[codex-handoff] ${error.message}\n`);
    process.exitCode = 2;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
