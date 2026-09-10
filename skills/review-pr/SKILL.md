# Review a Pull Request

Every PR gets an automated review before it is considered complete. This skill
defines who reviews, what they judge, what verdict they return, and what happens
next.

Run this after the PR is open — for a bug fix, after step 9 of
`skills/fix-bug/SKILL.md` and before the merge gates in step 10.

## The reviewer must be a separate pass

An agent cannot review its own work. Whoever implemented the change — Codex on a
handoff, or Claude on Webflow work — has already decided the change is correct, and
re-reading it in the same context produces agreement, not review.

So the review runs in a **fresh subagent** (`caveman:cavecrew-reviewer`, or
`general-purpose` if that is not installed) which is given only:

- the PR diff (`gh pr diff <pr>`)
- the task description and acceptance criteria
- the CI status (`gh pr checks <pr>`)
- pointers to `AGENTS.md`, `README.md`, and the relevant `skills/`

Tell it which axes under **What the reviewer judges** the diff can actually reach, so
it does not sweep the ones the change cannot touch. On a repeat round, also list the
prior round's findings and which were accepted or rejected, with the reason — the
reviewer starts cold every time and will otherwise re-raise a settled point.

Do not paste the implementation transcript, the Codex report's reasoning, or your own
argument for why the change is right. The reviewer reads the diff and judges it. A
Codex self-check in its `VALIDATION` block is evidence, not a review pass, and does
not substitute for this.

## What the reviewer does not do

The review is a reading pass, not a second CI run. Keeping it that way is what makes
it cheap enough to run on every PR and to repeat after a fix.

- **Do not build or run the test suite.** CI already did, on the same commit, in a
  clean environment. Read `gh pr checks <pr>`; a red or pending check is a finding on
  its own. A local run duplicates ~30-60s of work and proves less than CI does.
- **Do not check out `main` to verify a regression test fails there.** That evidence
  belongs in the PR body, put there by whoever wrote the fix
  (`skills/fix-bug/SKILL.md` requires it). Its *absence* is the finding — say so
  rather than going and producing it.
- **Do not re-derive measurements the PR already reports.** Judge whether the number
  answers the criterion and whether the method behind it is sound. If a claim looks
  wrong or unfalsifiable, that is a finding; reproducing it is not the reviewer's job.
- **Do not fix anything.** Findings go back through the loop below.

Reading the diff, the files it touches, and the conventions around them is the work.
Everything above is someone else's.

## What the reviewer judges

Judge what the diff actually touches. Every axis below costs a read, so skip the ones
the change cannot reach — a CSS-only diff has no lifecycle surface, and a test-only
diff has no responsive behavior.

Always:

- the diff against the stated task and acceptance criteria
- correctness and regression risk
- scope — anything in the diff that the task did not ask for
- repository architecture and project conventions (`init<Component>()`, the skill
  files, existing patterns in `src/`)
- code quality and maintainability
- whether the reported validation actually covers the criteria, and whether any check
  was claimed rather than run

Where the diff reaches them:

- animation lifecycle and cleanup: ScrollTriggers, listeners, observers, duplicate
  initialization, responsive teardown
- responsive behavior
- browser behavior
- accessibility — including `prefers-reduced-motion`
- performance
- Webflow integration and embedding constraints

## Verdicts

The reviewer returns exactly one of `PASS`, `CHANGES_REQUIRED`, or `BLOCKED`, with
findings as `path:line — problem — fix`.

### PASS

Only when all of these hold:

- no blocking findings remain
- CI checks pass, per `gh pr checks <pr>` — pending counts as not passing
- applicable tests pass
- every acceptance criterion is satisfied
- the diff is limited to the intended scope
- no debug or temporary code remains

### CHANGES_REQUIRED

Something concrete must change. Route each finding by ownership:

- **repository code finding** → Claude turns it into a fix request and sends it to
  Codex via `skills/codex-handoff/SKILL.md`, naming the same branch. Codex fixes,
  reruns checks, commits, pushes.
- **Webflow finding** → Claude makes the Webflow change directly, then revalidates
  the integrated result.

Then run a fresh review — a new subagent, same inputs, updated diff.

**Cap the loop at three review rounds.** If round three does not return `PASS`, stop
and return `BLOCKED`. A finding that survives three attempts is a design problem, not
an implementation slip, and it belongs with the user.

### BLOCKED

Use it when proceeding safely needs user judgment, missing requirements,
unavailable credentials, inaccessible infrastructure, ambiguous acceptance criteria,
a dependency the agents cannot resolve, or a third failed review round.

Hand the PR to the user with:

- the PR link
- what is blocked
- what has already been verified
- the exact decision or input required

Never merge a blocked PR.

## Merging

**A `PASS` does not authorize a merge.** The user reviews and merges.

The one exception is a bug fix that passes every auto-merge gate in
`skills/fix-bug/SKILL.md` step 10 — green CI, a regression spec that fails on `main`
and passes on the branch, a small diff confined to `src/`, `tests/`, and the rebuilt
bundle, acceptance criteria that came from the user, every criterion covered by an
automated check, and a root cause inside this repo. Those gates are all-or-nothing
and a `PASS` here does not replace any of them; it is an additional requirement on
top.

`feat/`, `refactor/`, and `chore/` PRs never merge themselves, however clean the
review is. Report the verdict and the PR link, and stop.

`main` has no branch protection, so nothing on GitHub enforces any of this. Never
merge past a red or pending check.

## Publishing is separate

Merging a PR does not ship to the live site — publishing from Webflow does. Never
publish unless the task explicitly asks for it.
