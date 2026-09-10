# Codex Handoff

How Claude hands repository code work to Codex, and what Codex returns.

Use this whenever a task is code-only, or when the repository half of a mixed task is
ready to implement. Claude classifies the task, gets the user's OK, creates the
branch, does any Webflow work first, and only then writes the handoff below.

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
- Do not open or merge the PR.
- Do not push directly to `main`.

For GSAP or scroll-driven work:

- clean up created animations, ScrollTriggers, listeners, and observers correctly
- avoid duplicate initialization
- account for responsive lifecycle behavior
- test behavior during continuous motion, not only at settled positions

## Validation

Run all applicable repository checks.

At minimum:

```bash
npm run build
npm run test:e2e
```

`npm run test:e2e` needs browsers installed once per machine —
`npm run test:e2e:install` — so run that first if Playwright reports a missing
browser.

Do not run `npm run test:e2e:live`. It targets the live Webflow site and is only run
deliberately, by a human.

Also run any targeted tests relevant to the change.

For browser-facing animation changes, verify the behavior in the browser when the
available environment allows it.

Never claim a check passed unless it actually ran.

If a required check cannot run, report why.

## Git behavior

Work on the task branch named above.

If that branch does not exist, stop and report that the implementation needs a task
branch rather than creating an unrelated workflow.

After implementation:

1. review the diff
2. remove debug or temporary code
3. commit the focused change using a conventional commit
4. push the task branch
5. return control to Claude

Claude opens the PR. Do not merge.

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

### GIT

Branch:
Commit: (`none` if nothing was committed)
Push status:
Working tree: (`clean`, or what is left uncommitted and why)

---

## Reading the report

**`DONE`** — verify the claims rather than trusting them. Check the diff yourself,
confirm the commit is on the branch and pushed, and confirm every `PASS` line is a
check that plausibly ran. Then open the PR and run `skills/review-pr/SKILL.md`.

**`NEEDS_WEBFLOW_CHANGE`** — Codex found the fix belongs on the Webflow side, or that
code cannot proceed until Webflow changes. Make the Webflow change, then re-hand off
with the new state described in **Relevant context**. Read the `GIT` block: it says
whether anything was committed or left in the working tree.

**`BLOCKED`** — Codex could not proceed. If the blocker is missing information or an
ambiguous criterion, resolve it and re-hand off. If it needs the user's judgment,
credentials, or infrastructure you do not have, stop and hand the whole task to the
user with the blocker and what has already been verified.

Any `FAIL` or unexplained `NOT RUN` in `VALIDATION`, or any `FAIL` in
`ACCEPTANCE CRITERIA`, means the task is not done regardless of the `STATUS` line.
Send it back.
