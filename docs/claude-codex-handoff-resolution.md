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

### Preferred execution: Claude runs Codex in the terminal

The preferred integration is for Claude to launch Codex as a foreground,
non-interactive terminal process instead of relying on the plugin's detached rescue
task:

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

1. **Never spawn `codex-rescue` through the Agent tool.** It is background-only there, its `--wait` and `--fresh` flags are not honored, and it writes to the shared checkout after the handoff appears to have returned. This is the single rule that would have prevented the incident above. Delegate through `codex exec` in a Bash call, or through the `/codex:rescue` slash command.
2. Before starting any handoff, sweep for live jobs with `/codex:status`. An attached `codex exec` says nothing about a previously detached task still running against the same checkout.
3. Prefer a foreground `codex exec --sandbox workspace-write --json` process for an implementation handoff. Run it from the branch or isolated worktree prepared by Claude.
4. Keep the terminal process attached. Do not launch it with shell backgrounding, detach it, or continue to the fallback implementation while it is active.
5. Treat only process exit accompanied by `turn.completed`, `turn.failed`, or `error` as a terminal result. `thread.started`, `turn.started`, and other progress events are non-terminal.
6. If the existing plugin must be used instead, invoke it with explicit wait and fresh-task semantics:

   ```text
   /codex:rescue --wait --fresh <scoped task>
   ```

7. A plugin message that only says a task started is not completion. Claude must wait for the final task result or query its status.
8. If a plugin task does not return normally, run `/codex:status` before editing any delegated file.
9. If the plugin task is still active, either continue waiting or run `/codex:cancel <task-id>`.
10. After cancellation, confirm the process or plugin task is terminal before Claude edits the same files.
11. Do not allow Claude and Codex to write to the same checkout concurrently. Prefer an isolated Git worktree when concurrent work is necessary.
12. Keep every handoff narrowly scoped. Name the files or component boundary, expected behavior, tests to add, and files that must not be changed.
13. Treat Codex's check results as evidence, not final acceptance. Claude remains responsible for required validation in the environment that has the necessary browser, port, Git, and network access.

## Changes to make in this repository

Update `CLAUDE.md` and `skills/codex-handoff/SKILL.md` so they consistently express the ownership model above.

At minimum:

- Ban spawning `codex-rescue` through the Agent tool, and say why: background-only, flags ignored, shared checkout.
- Remove commit, push, and pull-request duties from the Codex handoff.
- Make foreground `codex exec --json` the default for handoffs that can modify files.
- Retain the plugin rescue command only as a fallback and require `--wait --fresh` when it is used.
- Define a task-start acknowledgement as a non-terminal response.
- Add the status/cancel/confirm barrier before Claude takes over delegated files.
- State that Claude performs final validation and Git operations.
- Preserve the existing fallback path, but permit fallback only after Codex has reached a terminal state or has been cancelled and confirmed stopped.
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
- Change the plugin so it honors the configured approval policy and forwards approval requests instead of forcing a non-interactive policy.
- Make foreground execution the default and require an explicit flag for background work.
- Add a reliable wait/join operation that cannot return a task-start acknowledgement as success.
- Run every background write task in an isolated Git worktree and return a patch or commit for review.
- Expose the worker's actual working directory, sandbox, approval, and network capabilities in its result.

Avoid using unrestricted access as the primary fix. It increases risk without resolving the asynchronous lifecycle and shared-checkout race.

## Acceptance criteria for the workflow fix

The revised workflow is complete when all of the following are true:

- Claude can hand a scoped implementation to Codex and receive either a final result or an explicit terminal failure.
- The preferred handoff runs as an attached `codex exec --json` process and exposes a terminal JSON event.
- Claude never treats a task-start acknowledgement as a completed handoff.
- Claude does not edit delegated files while the Codex task is still active.
- A failed or timed-out handoff is cancelled and confirmed stopped before fallback work begins.
- Codex is not instructed to perform Git writes that its sandbox prevents.
- Claude runs final required checks and owns commit, push, and PR operations.
- A simulated slow handoff cannot overwrite Claude's later work, because no handoff starts while `/codex:status` shows a live job against the same checkout.
- The bug-fix workflow still records actual versus expected behavior, reproduction, acceptance criteria, real checks, and PR status without claiming checks that did not run.

## Validation scenario

After updating the instructions, test the contract with a harmless documentation-only handoff that deliberately takes long enough to observe its state:

1. Claude creates a task branch.
2. Claude launches `codex exec --sandbox workspace-write --json` in the foreground and delegates one named file.
3. Confirm Claude observes progress events and waits for process exit plus a terminal event.
4. While the process is active, confirm Claude does not edit the delegated file.
5. Repeat once with process termination; confirm Codex is stopped before Claude edits.
6. If the plugin remains supported, repeat with `/codex:rescue --wait --fresh` and verify the status/cancel barrier.
7. Claude reviews the diff, runs the required checks, commits, pushes, and opens the PR.

### What has already been run

Steps 2 and 3 are done. Three foreground `codex exec --sandbox <mode> --json` runs were
executed against this checkout. Each stayed attached, streamed
`thread.started` → `turn.started` → `item.*`, and ended on `turn.completed` with the
process exiting. The capability results are in **Measured sandbox limits** above.

Still to exercise: the cancellation barrier (step 5) and the plugin path with
`/codex:rescue --wait --fresh` (step 6).

If this scenario cannot be completed reliably, keep Codex limited to read-only review or patch suggestions until the plugin provides trustworthy task lifecycle control or isolated worktrees.
