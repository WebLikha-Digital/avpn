# Claude–Codex Handoff Resolution

## Purpose

Use this document as the implementation brief for fixing the Claude-to-Codex workflow in this repository. The goal is to keep Codex available for code implementation while preventing blocked handoffs, abandoned background jobs, and late writes that overwrite work in progress.

Do not solve this by disabling Codex entirely or granting unrestricted filesystem access. Update the workflow contract so each agent owns only work it can complete reliably in the current environment.

## What happened

Three symptoms were observed during the same workflow:

1. Codex produced good implementation code but could not complete the required handoff. Its sandbox could not open the local port needed by the end-to-end suite, `.git` was read-only, and GitHub network access was unavailable. It therefore could not truthfully satisfy the instruction to test, commit, and push.
2. A later handoff returned only a background-task acknowledgement instead of a final result. Claude treated that as a failed or detached handoff and continued implementing the same files.
3. The background Codex task was still active. Roughly 20 minutes later it wrote its result into the shared checkout and overwrote Claude's work in progress. Codex's component was ultimately retained because it was the better implementation, but the uncontrolled late write made the workflow unsafe.

The second and third symptoms are likely two stages of one asynchronous execution: the launcher returned before the worker was finished, and the still-running worker later modified the shared working tree.

## Why it happened

The repository's current delegation contract assumes Codex behaves like a synchronous worker with full access to the repository and development environment:

- `CLAUDE.md` assigns Codex implementation, testing, committing, and pushing.
- `skills/codex-handoff/SKILL.md` requires Codex to run the build and end-to-end suite, review the diff, commit, and push before returning.

Neither the plugin nor the sandbox consistently provides those capabilities:

- **The delegation never went through the plugin's command.** `commands/rescue.md` defaults to foreground: "If neither flag is present, default to foreground." What actually ran was the Agent tool with `subagent_type: codex:codex-rescue`, which bypasses the slash command entirely and is background-only in Claude Code. `--wait` and `--fresh` are parsed by the slash command and never reach anything on that path, so adding them would not have prevented what happened.
- A background Agent-tool task shares the live checkout. Claude and Codex can therefore edit the same files concurrently, which is exactly the late-write race that occurred.
- The plugin runtime uses a non-interactive approval policy, so a blocked operation cannot be escalated during the handoff.
- Write tasks run in `workspace-write`. In that mode `.git` is read-only and the sandboxed shell has no network, so Git writes and remote pushes cannot be assumed.

### Measured sandbox limits

Probed directly in this repository with `codex exec --sandbox workspace-write`:

| Operation | Result |
| --- | --- |
| Write a file in the workspace | exit 0 |
| `git status` (read) | exit 0 |
| `git config --local` (write to `.git`) | exit 255 — `could not lock config file .git/config: Operation not permitted` |
| Bind `127.0.0.1:4199` | `EPERM` |
| `npm run build` | exit 0 |

The port result is the load-bearing one. Playwright's `webServer` binds `127.0.0.1:4174`, so **`npm run test:e2e` can never run inside Codex** — not as a matter of policy but of capability. Splitting "Codex authors tests, Claude runs them" is forced, not preferred.

`npm run build` needs no port and writes inside the workspace, so Codex *can* build. Only checks needing a port, a browser, or `.git` have to move to Claude.

This is a workflow contract failure, not a code-quality failure. The component that shipped demonstrates that Codex can be useful here; it just cannot safely own the entire Git and validation lifecycle through the current plugin.

OpenAI's documentation confirms that `workspace-write` protects `.git` and disables network access by default. Note this applies to the shell Codex spawns; the Codex process reaches its own model API regardless, so "no network" must not be read as "Codex cannot run." The docs also recommend worktrees for parallel tasks that should not interfere with one another:

- [Agent approvals and security](https://learn.chatgpt.com/docs/agent-approvals-security)
- [Git worktrees](https://learn.chatgpt.com/docs/environments/git-worktrees)
- [Subagents](https://learn.chatgpt.com/docs/agent-configuration/subagents)

## Required workflow change

Replace the current ownership model with this one:

```text
Claude: branch -> delegate -> wait/join -> validate -> commit -> push -> PR
Codex:  inspect -> implement -> add/update tests -> report
```

### Execution: Claude runs Codex in the terminal

Claude launches Codex as a foreground, non-interactive terminal process. This is the
only delegation path. The Codex plugin stays installed for ad-hoc human use, but no
part of this workflow goes through it:

```bash
codex exec \
  --sandbox workspace-write \
  --json \
  "Implement the scoped change. Do not create branches, commit, push, or open a PR. Report changed files and checks actually run."
```

`codex exec` is designed for automated workflows. With `--json`, it emits a JSONL
event stream that distinguishes `turn.completed`, `turn.failed`, and `error`. Claude
must keep the process attached and treat only process exit plus a terminal event as
completion. A `thread.started` or `turn.started` event is only acknowledgement that
work began.

This is safer than Claude driving the interactive Codex TUI through simulated
keystrokes. The TUI introduces terminal-rendering, input, and approval-prompt state
that is harder to automate reliably. Use the TUI for a person-controlled session;
use `codex exec` for Claude-controlled delegation.

The terminal approach fixes lifecycle visibility, but it does not grant extra
permissions. `workspace-write` allows Codex to edit project files while retaining
the normal sandbox boundaries. Claude must still own Git operations and rerun any
checks that require capabilities unavailable inside the Codex process.

[Official Codex non-interactive-mode documentation](https://learn.chatgpt.com/docs/non-interactive-mode)

### Claude owns

- Synchronizing `main` and creating or selecting the task branch.
- Starting the Codex handoff in foreground/wait mode.
- Tracking the task until it reaches a terminal state.
- Cancelling and confirming termination before taking over a timed-out or failed task.
- Reviewing the returned diff.
- Running every check Codex cannot: the end-to-end suite (it binds a port), browser and responsive verification, and anything touching `.git`.
- Committing, pushing, and opening or updating the pull request.
- Reporting checks that actually ran and any environmental limitations.

### Codex owns

- Inspecting the scoped files and repository instructions.
- Implementing the requested change.
- Adding or updating tests that can be authored within the workspace.
- Running the checks its sandbox permits — `npm run build` works — without claiming blocked checks passed.
- Returning a concise summary of changed files, checks run, failures, and remaining validation.

### Codex must not own through this plugin

- Branch creation or other writes to `.git`.
- Commits, pushes, or pull-request creation.
- Final acceptance of a change when the required browser or end-to-end checks cannot run.
- Background writes to a checkout that Claude is also editing.

## Handoff rules

1. **Delegate only with `codex exec`.** Never through the Agent tool
   (`subagent_type: codex:codex-rescue`) and never through `/codex:rescue`. The Agent
   tool is background-only in Claude Code, silently drops `--wait` and `--fresh`, and
   keeps writing to the shared checkout after the handoff appears to have returned —
   that is what caused the incident above. The plugin remains installed but is not
   part of this workflow.
2. Run it in the foreground, from the branch or isolated worktree Claude prepared:

   ```bash
   codex exec --sandbox workspace-write --json "<scoped task>"
   ```

3. Keep the process attached. Do not background it with `&`, do not detach it, and do
   not start fallback work while it is alive.
4. Treat only process exit accompanied by `turn.completed`, `turn.failed` or `error`
   as a terminal result. `thread.started`, `turn.started` and other progress events
   are acknowledgements that work began, nothing more.
5. If a run has to be abandoned, kill the process and confirm no `codex` process is
   still running against this checkout before Claude edits the delegated files. An
   attached run can only orphan if the terminal dies, but check rather than assume.
6. Never let Claude and Codex write to the same checkout at once. Use an isolated Git
   worktree when concurrent work is genuinely needed.
7. Keep every handoff narrowly scoped. Name the files or component boundary, the
   expected behavior, the tests to add, and the files that must not change.
8. Treat Codex's check results as evidence, not acceptance. Claude reruns anything
   that needs a port, a browser, or `.git`.

## Changes to make in this repository

Update `CLAUDE.md` and `skills/codex-handoff/SKILL.md` so they consistently express the ownership model above.

At minimum:

- Ban spawning `codex-rescue` through the Agent tool, and say why: background-only, flags ignored, shared checkout.
- Remove commit, push, and pull-request duties from the Codex handoff.
- Make foreground `codex exec --json` the only path for handoffs that can modify files.
- Remove the plugin rescue command from the documented workflow entirely.
- Define a task-start acknowledgement as a non-terminal response.
- Require confirming no Codex process is live before Claude takes over delegated files.
- State that Claude performs final validation and Git operations.
- Preserve Claude's own fallback implementation path, but permit it only after Codex has reached a terminal state or has been killed and confirmed stopped.
- Preserve the repository's branch naming, focused-change, conventional-commit, and no-merge rules.
- For bug fixes, preserve all requirements in `skills/fix-bug/SKILL.md`; only reassign who executes each step.

Do not edit plugin cache files under the user's home directory as the repository-level solution. Those files can be replaced by plugin updates and are not portable project configuration.

## Recommended handoff template

Use a prompt with this shape:

```text
Implement <single scoped change> on the branch and working tree already prepared by Claude.

Scope:
- Expected behavior: <behavior>
- Allowed files: <paths>
- Do not change: <paths or unrelated behavior>
- Tests to add or update: <tests>
- Acceptance criteria: <criteria>

Do not create branches, commit, push, or open a PR. Run only checks available in
your environment. Return changed files, checks actually run, failures or blockers,
and any validation Claude still needs to perform. Do not continue in the background
after returning a result.
```

## Optional environment improvements

These can improve the integration, but they do not replace the workflow changes:

- Enable network access for `workspace-write` only if the security policy permits it. This can resolve package or GitHub connectivity but does not make `.git` writable.
- Run every write task in an isolated Git worktree and return a patch for review.
- Expose the worker's actual working directory, sandbox, approval, and network capabilities in its result.

Avoid using unrestricted access as the primary fix. It increases risk without resolving the asynchronous lifecycle and shared-checkout race.

## Acceptance criteria for the workflow fix

The revised workflow is complete when all of the following are true:

- Claude can hand a scoped implementation to Codex and receive either a final result or an explicit terminal failure.
- Every handoff runs as an attached `codex exec --json` process and exposes a terminal JSON event.
- Claude never treats a task-start acknowledgement as a completed handoff.
- Claude does not edit delegated files while the Codex task is still active.
- A failed or timed-out handoff is killed and confirmed stopped before fallback work begins.
- Codex is not instructed to perform Git writes that its sandbox prevents.
- Claude runs final required checks and owns commit, push, and PR operations.
- A simulated slow handoff cannot overwrite Claude's later work, because every handoff is attached and no fallback begins until the process has exited.
- The bug-fix workflow still records actual versus expected behavior, reproduction, acceptance criteria, real checks, and PR status without claiming checks that did not run.

## Validation scenario

After updating the instructions, test the contract with a harmless documentation-only handoff that deliberately takes long enough to observe its state:

1. Claude creates a task branch.
2. Claude launches `codex exec --sandbox workspace-write --json` in the foreground and delegates one named file.
3. Confirm Claude observes progress events and waits for process exit plus a terminal event.
4. While the process is active, confirm Claude does not edit the delegated file.
5. Repeat once with process termination; confirm Codex is stopped before Claude edits.
6. Claude reviews the diff, runs the required checks, commits, pushes, and opens the PR.

### What has already been run

#### Contract tests

| Test | Method | Result |
| --- | --- | --- |
| T1 termination barrier | kill an attached codex exec mid-run | exit 143, no surviving 'codex exec' process |
| T2 terminal states | force turn.failed via an invalid model; kill a run | turn.completed, turn.failed and error all observed; a killed run emits NO terminal event and leaves turn.started as its last line, exit 143 |
| T3 full handoff | this edit | see below |
| T4 fallback trigger | env PATH=/nonexistent codex exec | exit 127, 'No such file or directory' |
| Sandbox: .git write | git config --local | exit 255, could not lock config file |
| Sandbox: port bind | node net.listen 127.0.0.1:4199 | EPERM |
| Sandbox: build | npm run build | exit 0 |
| T5 no late write | watch for any codex process appearing for 20 min after exit | running |
| Rule 1 enforcement | Agent call with subagent_type codex:codex-rescue | denied by a PreToolUse hook |

A killed run is distinguished from a live one by a non-zero exit plus the absence of a terminal event.

T5 was first written to hash the delegated file and failed at 60s — on an edit Claude
made itself, not a late write from Codex. Hashing a file that the tester keeps editing
measures the tester. The probe now watches for a `codex` process appearing after the
run exits, which no amount of Claude's own activity can trip.

Rule 1 is the only rule a test cannot cover, because it is an instruction to Claude
rather than a property of the environment — and an instruction of exactly that kind is
what failed the first time. It is therefore backed by a `PreToolUse` hook on `Agent`
that denies any call whose `subagent_type` matches `codex-rescue`, with the reason and
the correct command in the denial message.

That hook lives in `.claude/settings.local.json`, which is gitignored. **It protects
this machine only.** A teammate cloning the repo gets the prose rule and no guard. Move
the hook to `.claude/settings.json` if that matters.

Every step of the validation scenario below has now been exercised except the
isolated-worktree path, which is only needed if concurrent work is ever required.

If this scenario cannot be completed reliably, keep Codex limited to read-only review
or patch suggestions until `codex exec` provides trustworthy lifecycle control or
isolated worktrees.
