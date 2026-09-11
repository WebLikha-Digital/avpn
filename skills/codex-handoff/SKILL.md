# Codex Handoff

How Claude hands repository code work to Codex, and what Codex returns.

Use this whenever a task is code-only, or when the repository half of a mixed task is
ready to implement. Claude classifies the task, gets the user's OK, creates the
branch, does any Webflow work first, and only then writes the handoff below.

## How to launch it

One path, from the prepared branch:

```bash
codex exec -m gpt-5.6-sol --sandbox workspace-write --json "<the handoff below>"
```

Claude Opus is the orchestrator, planner, reviewer, and merger. Every task that
modifies repository files runs on Sol. Read-only, non-intensive inspection, summaries,
inventory, and log triage may instead run as:

```bash
codex exec -m gpt-5.6-luna --sandbox read-only --json "<question>"
```

The read-only sandbox enforces the boundary. A Luna task must not expand into a
repository mutation; if it finds changes are needed, it ends with a recommendation
and Claude starts a fresh Sol task or resumes the branch's existing Sol session.

Run it through the Bash tool. Keep it attached by default. If the run may exceed the
Bash tool's 10-minute ceiling — a new component, a refactor across files, anything
with tests to write — launch the same command with `run_in_background: true` instead
and wait for the completion notification. That is a Bash background job, not the
Agent tool; the Agent-tool ban below still stands.

Only process exit together with `turn.completed`, `turn.failed` or `error` is a
result; `thread.started` and `turn.started` mean work began, nothing more.

Keep the `thread_id` from the `thread.started` event. It is the session id for
**Fix rounds** below.

## Fix rounds

When the review returns `CHANGES_REQUIRED` on repository code, do not send a fresh
handoff — Codex would rebuild its understanding of the branch from nothing. Resume
the session that wrote the code:

```bash
codex exec resume <thread_id> -m gpt-5.6-sol -c 'sandbox_mode="workspace-write"' --json "<all findings from the round, plus: fix these on the current branch, run the applicable self-validation, report in the same structure>"
```

`codex exec resume` takes the sandbox through `-c sandbox_mode`, not `--sandbox`.

Same rules as the first run: attached (or `run_in_background` if long), no repo edits
while it is alive, same **Return to Claude** structure back. Resume only for the same
branch and task; a different task gets a fresh `codex exec`.

While a background run is alive: no edits to repository files, no `git` writes, no
`npm run build`. Webflow Designer and MCP work may continue — it does not touch the
checkout. Before touching files after a run ends, confirm no `codex` process
survives (`pgrep -fl codex`).

Do not hand off at all for a trivial edit — see **When Codex does not run** in
`CLAUDE.md`.

**Never delegate through the Agent tool** (`subagent_type: codex:codex-rescue`) **or
the `/codex:rescue` command.** The Agent tool is background-only in Claude Code, its
`--wait` and `--fresh` flags are silently ignored there, and it keeps writing to the
shared checkout after the handoff appears to have returned — overwriting whatever
Claude does in the meantime. That is not hypothetical; it is what went wrong and
produced `docs/claude-codex-handoff-resolution.md`. The plugin stays installed for
ad-hoc use by a person; no handoff goes through it.

Do not start a second writer against the same checkout. If a run must be abandoned,
kill it and confirm no `codex` process survives before editing the delegated files.

## What Codex cannot do here

Measured with `codex exec --sandbox workspace-write` in this repository:

| Operation | Result |
| --- | --- |
| Write a workspace file | exit 0 |
| `npm run build` | exit 0 |
| `git status` | exit 0 |
| `git config --local` | exit 255, `could not lock config file .git/config: Operation not permitted` |
| Bind `127.0.0.1:4199` | `EPERM` |

Playwright's `webServer` binds a port, so `npm run test:e2e` cannot run inside Codex
at all. Do not ask for it. Do not ask for a commit, a push, or a PR either — `.git` is
read-only. Asking for something the sandbox forbids invites a report that claims it
happened.

Codex writes the code and tests, self-reviews its full working-tree diff, and runs
`npm run build` when the change touches `src/**`, `package.json`, `vite.config.js`, or
`dist/**`. It runs `npm run test:routing` when the change touches `scripts/ci/**`.
Claude runs the browser suite and owns Git. Codex self-validation is evidence for
Claude's review, never merge authorization.

### Browser preview (future)

If browser preview is ever enabled for Codex, it must be read-only and load the
branch's built `dist/animations.min.js` from this checkout, not the published bundle.
Animation measurements require a visible foreground browser because a backgrounded
tab freezes `requestAnimationFrame`.

## Before handing off

Four things must be true, or the handoff is premature:

1. The task is classified as code-only or the repo half of a mixed task
   (`CLAUDE.md`, **Task routing**).
2. The acceptance criteria exist and the user has approved them.
3. The task branch exists and is checked out. Codex works on the branch you made; it
   will stop rather than create one.
4. For a bug fix, the draft PR and empty commit from
   `skills/fix-bug/SKILL.md` step 4 exist before handoff. For other work, the draft PR
   may be opened after the first push.

If Webflow markup, classes, or attributes need to change for the code to have
something to bind to, make those changes first and describe them in **Relevant
context**. Codex cannot see Webflow.

If `codex exec` is missing, unauthenticated, or reaches a terminal failure —
`turn.failed`, `error`, or a non-zero exit — implement the change yourself and note
that in the PR body. Do not leave the task unstarted.

Begin only after the process has exited. If a run has to be abandoned, kill it and
confirm no `codex` process survives before touching the delegated files.

## Handoff template

Fill this in and send it as the task. Delete bracketed placeholders; do not send a
placeholder through.

---

## Task

Implement the repository code changes required for:

[Concise description of the requested change]

Branch: `[branch name — already created and checked out]`

Do not modify Webflow. Claude owns all Webflow Designer and Webflow MCP changes.

## Expected behavior

Current behavior:
[What happens now]

Expected behavior:
[What should happen after the change]

## Acceptance criteria

The task is complete only when:

- [criterion 1]
- [criterion 2]
- [criterion 3]
- Existing related behavior continues to work.
- No unrelated refactors or cleanup are included.

## Relevant context

Project:
AVPN animation repository used by the Webflow site.

Relevant implementation details:

- [relevant component / animation / section]
- [relevant selectors or data attributes]
- [relevant files if already known]
- [important Webflow-side assumptions supplied by Claude, including any Webflow
  changes already made for this task]

Inspect the repository yourself before making changes. Do not assume the suggested
files are the only files involved.

Follow the repository's `AGENTS.md`, `README.md`, and applicable `skills/`
instructions.

## Constraints

- Repository code only.
- Do not make Webflow changes.
- Do not change Webflow structure to work around a code problem.
- Keep the diff focused on this task.
- Preserve existing architecture and conventions unless changing them is required
  for correctness.
- Preserve unrelated uncommitted changes.
- Do not add debug code to the final implementation.
- Do not add `Co-authored-by` or other co-author attribution.
- Do not create branches, commit, push, or open a PR.
- Do not continue working in the background after returning a result.

For GSAP or scroll-driven work:

- clean up created animations, ScrollTriggers, listeners, and observers correctly
- avoid duplicate initialization
- account for responsive lifecycle behavior
- test behavior during continuous motion, not only at settled positions

## Validation

Run the checks applicable to the changed paths, and report their real results:

```bash
npm run build          # src/**, package.json, vite.config.js, or dist/**
npm run test:routing   # scripts/ci/**
```

Do **not** attempt `npm run test:e2e`. Playwright binds a local port and your sandbox
refuses with `EPERM`, so it cannot run here. Write or update the specs; Claude runs
them. Never run `npm run test:e2e:live` — it targets the live Webflow site and is only
run deliberately, by a human.

Never claim a check passed unless it actually ran. If something cannot run, say so and
name the limitation. Codex self-validation is evidence for Claude's review, never
merge authorization.

## Git behavior

Do not touch Git. `.git` is read-only in your sandbox — `git status` works, writes do
not. Do not create a branch, commit, push, or open a PR.

Claude has already prepared the branch named above. Leave your work uncommitted in the
working tree and report what you changed. Claude reviews the diff, runs the remaining
checks, commits and pushes.

## Return to Claude

Return a concise implementation report in this exact structure:

### STATUS

`DONE`, `BLOCKED`, or `NEEDS_WEBFLOW_CHANGE`

### CHANGES

- files changed
- concise explanation of the implementation

### VALIDATION

- command/check: PASS | FAIL | NOT RUN
- command/check: PASS | FAIL | NOT RUN

### ACCEPTANCE CRITERIA

- criterion: PASS | FAIL

### WEBFLOW REQUIREMENTS

List any Webflow-side changes Claude must make.

Write `None` if no Webflow changes are required.

### RISKS / NOTES

Only include relevant implementation risks, assumptions, or follow-up concerns.

### HANDBACK

Files left modified in the working tree:
Anything intentionally left unfinished:
Validation Claude still needs to run:

---

## Reading the report

**`DONE`** — verify the claims rather than trusting them. Read the diff yourself, and
treat any `PASS` line as a claim to check, not a result to accept. Then run the suite,
commit, push, open the PR, and run `skills/review-pr/SKILL.md`. Codex's specs have
arrived failing before now; it cannot run them.

**`NEEDS_WEBFLOW_CHANGE`** — Codex found the fix belongs on the Webflow side, or that
code cannot proceed until Webflow changes. Make the Webflow change, then re-hand off
with the new state described in **Relevant context**. Read the `HANDBACK` block: it
says what is sitting in the working tree.

**`BLOCKED`** — Codex could not proceed. If the blocker is missing information or an
ambiguous criterion, resolve it and re-hand off. If it needs the user's judgment,
credentials, or infrastructure you do not have, stop and hand the whole task to the
user with the blocker and what has already been verified.

Any `FAIL` or unexplained `NOT RUN` in `VALIDATION`, or any `FAIL` in
`ACCEPTANCE CRITERIA`, means the task is not done regardless of the `STATUS` line.
Send it back.
