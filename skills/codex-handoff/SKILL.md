# Codex Handoff

How Claude hands repository code work to Codex, and what Codex returns.

Use this whenever a task is code-only, or when the repository half of a mixed task is
ready to implement. Claude classifies the task, gets the user's OK, creates the
branch, does any Webflow work first, and only then writes the handoff below.

## How to launch it

**Never spawn `codex-rescue` through the Agent tool.** It is background-only there,
its `--wait` and `--fresh` flags are silently ignored, and it keeps writing to the
shared checkout after the handoff appears to have returned — overwriting whatever
Claude does in the meantime. That is not hypothetical; it is what went wrong and
produced `docs/claude-codex-handoff-resolution.md`.

Preferred, from the prepared branch:

```bash
codex exec --sandbox workspace-write --json "<the handoff below>"
```

Keep the process attached. Only process exit together with `turn.completed`,
`turn.failed` or `error` is a result; `thread.started` and `turn.started` mean work
began, nothing more. The fallback is `/codex:rescue --wait --fresh <scoped task>`.

Check `/codex:status` first. If a job is already live against this checkout, wait for
it or `/codex:cancel <job-id>` and confirm it stopped — do not start a second writer.

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

Codex writes the code and the tests. Claude runs the suite and owns Git.

## Before handing off

Three things must be true, or the handoff is premature:

1. The task is classified as code-only or the repo half of a mixed task
   (`CLAUDE.md`, **Task routing**).
2. The acceptance criteria exist and the user has approved them.
3. The task branch exists and is checked out. Codex works on the branch you made; it
   will stop rather than create one.

If Webflow markup, classes, or attributes need to change for the code to have
something to bind to, make those changes first and describe them in **Relevant
context**. Codex cannot see Webflow.

If the Codex CLI is unavailable or fails, implement the change yourself and note that
in the PR body. Do not leave the task unstarted.

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

Run this, and report its real result:

```bash
npm run build
```

Do **not** attempt `npm run test:e2e`. Playwright binds a local port and your sandbox
refuses with `EPERM`, so it cannot run here. Write or update the specs; Claude runs
them. Never run `npm run test:e2e:live` — it targets the live Webflow site and is only
run deliberately, by a human.

Never claim a check passed unless it actually ran. If something cannot run, say so and
name the limitation.

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
