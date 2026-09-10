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

The installed Claude Codex plugin does not consistently provide those capabilities:

- Complex rescue tasks may be started in the background unless foreground waiting is explicitly requested.
- The plugin runtime uses a non-interactive approval policy, so a blocked operation cannot be escalated during the handoff.
- Write tasks run in `workspace-write`. In that mode, `.git` remains protected and network access is off by default, so Git writes and remote pushes cannot be assumed.
- A background task shares the live checkout unless separately isolated. Claude and Codex can therefore edit the same files concurrently.

This is a workflow contract failure, not a code-quality failure. The component that shipped demonstrates that Codex can be useful here; it just cannot safely own the entire Git and validation lifecycle through the current plugin.

OpenAI's documentation confirms that `workspace-write` protects `.git` and disables network access by default. It also recommends worktrees for parallel tasks that should not interfere with one another:

- [Agent approvals and security](https://learn.chatgpt.com/docs/agent-approvals-security)
- [Git worktrees](https://learn.chatgpt.com/docs/environments/git-worktrees)
- [Subagents](https://learn.chatgpt.com/docs/agent-configuration/subagents)

## Required workflow change

Replace the current ownership model with this one:

```text
Claude: branch -> delegate -> wait/join -> validate -> commit -> push -> PR
Codex:  inspect -> implement -> add/update tests -> report
```

### Claude owns

- Synchronizing `main` and creating or selecting the task branch.
- Starting the Codex handoff in foreground/wait mode.
- Tracking the task until it reaches a terminal state.
- Cancelling and confirming termination before taking over a timed-out or failed task.
- Reviewing the returned diff.
- Running the repository's real build, browser, responsive, and end-to-end checks.
- Committing, pushing, and opening or updating the pull request.
- Reporting checks that actually ran and any environmental limitations.

### Codex owns

- Inspecting the scoped files and repository instructions.
- Implementing the requested change.
- Adding or updating tests that can be authored within the workspace.
- Running checks that the environment permits, without claiming blocked checks passed.
- Returning a concise summary of changed files, checks run, failures, and remaining validation.

### Codex must not own through this plugin

- Branch creation or other writes to `.git`.
- Commits, pushes, or pull-request creation.
- Final acceptance of a change when the required browser or end-to-end checks cannot run.
- Background writes to a checkout that Claude is also editing.

## Handoff rules

1. For an implementation handoff, invoke Codex with explicit wait and fresh-task semantics. With the currently installed plugin, use:

   ```text
   /codex:rescue --wait --fresh <scoped task>
   ```

2. A message that only says a task started is not completion. Claude must wait for the final task result or query its status.
3. If the task does not return normally, run `/codex:status` before editing any delegated file.
4. If the task is still active, either continue waiting or run `/codex:cancel <task-id>`.
5. After cancellation, confirm the task is terminal before Claude edits the same files.
6. Do not allow Claude and a background Codex task to write to the same checkout concurrently.
7. Keep every handoff narrowly scoped. Name the files or component boundary, expected behavior, tests to add, and files that must not be changed.
8. Treat Codex's check results as evidence, not final acceptance. Claude remains responsible for required validation in the environment that has the necessary browser, port, Git, and network access.

## Changes to make in this repository

Update `CLAUDE.md` and `skills/codex-handoff/SKILL.md` so they consistently express the ownership model above.

At minimum:

- Remove commit, push, and pull-request duties from the Codex handoff.
- Make foreground waiting the default for all handoffs that can modify files.
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
- Claude never treats a task-start acknowledgement as a completed handoff.
- Claude does not edit delegated files while the Codex task is still active.
- A failed or timed-out handoff is cancelled and confirmed stopped before fallback work begins.
- Codex is not instructed to perform Git writes that its sandbox prevents.
- Claude runs final required checks and owns commit, push, and PR operations.
- A simulated slow handoff cannot overwrite Claude's later work.
- The bug-fix workflow still records actual versus expected behavior, reproduction, acceptance criteria, real checks, and PR status without claiming checks that did not run.

## Validation scenario

After updating the instructions, test the contract with a harmless documentation-only handoff that deliberately takes long enough to observe its state:

1. Claude creates a task branch.
2. Claude delegates one named file with `--wait --fresh`.
3. Confirm Claude receives a final result rather than only a task ID.
4. While the task is active, confirm Claude does not edit the delegated file.
5. Repeat once with cancellation; confirm status is terminal before Claude edits.
6. Claude reviews the diff, commits, pushes, and opens the PR.

If this scenario cannot be completed reliably, keep Codex limited to read-only review or patch suggestions until the plugin provides trustworthy task lifecycle control or isolated worktrees.
