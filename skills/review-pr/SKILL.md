# Review a Pull Request

Every PR gets a review before it is considered complete. This skill
defines who reviews, what they judge, what verdict they return, and what happens
next.

Run this after the PR is open — for a bug fix, after step 9 of
`skills/fix-bug/SKILL.md` and before the merge gates in step 10.

## Claude is the reviewer

Claude reviews inline, in the orchestrating session. No subagent. A fresh subagent
was measured at 1-3 minutes per round on a three-file docs diff, almost all of it
cold-start reading rather than judgement, and the user found the loop too slow.

Independence comes from the split of labour, not from a separate process: in this
repo Codex writes the repository code, so Claude reading that diff is already a
second pair of eyes. For a change Claude authored itself — Webflow work, docs, a
fallback implementation — the review is weaker and Claude should say so in the
verdict, but it still runs.

The review reads only:

- the PR diff (`gh pr diff <pr>`) — read it fresh, as text, not from memory of
  writing or delegating it
- the task description and acceptance criteria
- the final CI result, already settled (see **Wait for CI first**)
- every skill file that directly applies to the change: a skill applies when the diff
  touches code it governs or edits the skill itself; read `src/` and `tests/` around
  the diff as needed, and `README.md` / `AGENTS.md` when the diff changes a convention
  they describe

Judge only the axes under **What the reviewer judges** the diff can actually reach.
On a repeat round, do not re-raise a finding that was accepted and fixed or rejected
with a reason.

The Codex report's `VALIDATION` block is evidence, not a review pass. Do not treat a
Codex self-check, or your own reasoning while delegating, as having reviewed the
diff.

## Wait for CI first

Do not review while CI is pending. A pending check counts as not passing, so an
early review returns `CHANGES_REQUIRED` for a check that would have gone green a
minute later — and that costs a whole extra round.

After pushing, block on CI:

```bash
gh pr checks <pr> --watch --fail-fast
```

Review begins only after `gate` has settled on the head commit. Then review against
that settled result. If `gate` is red, do not review at all. Route the failure like a
`CHANGES_REQUIRED` finding — the fix goes back through the handoff, gets pushed, and
CI runs again — and only start the review once there is a green commit to judge.

## Review tiers

Use the CI `classify` route from `gh run view` / the `classify` job log, or classify
the committed diff locally:

```bash
git diff --name-only main...HEAD | node scripts/ci/classify-paths.mjs
```

- **Full (`runtime`)** — `src/**`, `tests/**`, build config, dependencies, Playwright
  config, or `dist/**` with source. Run the full process below: wait for `gate`, judge
  every applicable axis, and allow up to three rounds. Bug-fix gates still apply.
  Claude performs browser and responsive verification where the diff reaches them.
- **Workflow (`workflow`)** — `AGENTS.md`, `CLAUDE.md`, `skills/**`, `.github/**`, or
  `scripts/ci/**`. Run one focused mandatory review after `gate` is green. Check
  internal consistency between the agent files and skills, explicit ownership for
  every step, that Codex is never told to exceed its sandbox, fail-closed CI routing,
  and the model policy. Do not browser-test unless runtime files are also present.
  Workflow instructions are operational code: a wrong instruction ships a wrong
  process.
- **Docs quick (`docs`)** — substantive prose. After the `docs` check is green,
  Claude performs one diff review for accuracy against the code described, links, and
  scope. A finding goes back through the handoff or, if Claude authored the change,
  is fixed directly and re-pushed. There is no formal three-round loop.
- **Trivial docs** — typo- or formatting-only Markdown with no meaning change. Claude
  edits directly under `CLAUDE.md`'s existing trivial-edit rule, self-reviews the
  diff, posts a review comment with tier `trivial`, and merges when `gate` is green.
  There is no Codex handoff or multi-round loop.

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
- **Do not fix anything during full or workflow review.** Findings go back through
  the loop below. For docs, follow the tier rule above.

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

The reviewer returns exactly one of `PASS`, `CHANGES_REQUIRED`, or `BLOCKED`.
File findings use `path:line — problem — fix`. A blocker with no file location uses
`N/A — blocker — <required input>` (for example missing acceptance criteria,
credentials, or a user decision).

Post it on the PR before doing anything else with the verdict:

```bash
gh pr comment <pr> --body "$(cat <<'EOF'
## Review — <PASS|CHANGES_REQUIRED|BLOCKED> @ <head sha>

- Tier: <full|workflow|docs|trivial>
- Axes judged: ...
- CI: gate <result>, jobs run: <list>
- Findings: <none | path:line — problem — fix | N/A — blocker — required input, one per line>
- Authorship: <Codex | Claude — independence weaker>
EOF
)"
```

The comment is the record that a review happened. Inline review is only prose in a
session; without this it is easy to skip on a small PR and impossible to audit later.
A merge with no review comment on the head commit is a contract violation, not a
shortcut.

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
  Codex by **resuming the original handoff session** with
  `node scripts/codex/run-handoff.mjs --resume <thread_id> --model gpt-5.6-sol --sandbox workspace-write --prompt "<all findings>"`
  (see `skills/codex-handoff/SKILL.md` **Fix rounds**), naming the same branch. Codex
  fixes and runs the applicable build/routing self-validation; Claude runs
  `npm run test:e2e` when applicable, reviews the diff, commits, and pushes. Codex
  cannot commit, push, or run the e2e suite in its sandbox.
- **Webflow finding** → Claude makes the Webflow change directly, then revalidates
  the integrated result.

Return all findings from one round to Codex together in one resume message, never one
at a time. Then review again — same inputs, updated diff, prior findings noted.

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
- the exact decision or input required, written as
  `N/A — blocker — <required input>`

Never merge a blocked PR.

## Merging

A posted `PASS` comment on the PR's head commit plus green `gate` authorizes Claude
to merge:

```bash
gh pr merge <pr> --squash --delete-branch
```

Confirm it landed with `gh pr view <pr> --json state,mergedAt` before cleaning up —
a `CLOSED` PR with no `mergedAt` did not merge, and its branch must not be deleted.

A bug fix must additionally pass every gate in `skills/fix-bug/SKILL.md` step 10 — a
regression spec that fails on `main` and passes on the branch, a small diff confined
to `src/`, `tests/`, and the rebuilt bundle, acceptance criteria that came from the
user, every criterion covered by an automated check, and a root cause inside this
repo. Those gates are all-or-nothing and a `PASS` here does not replace any of them.

Never merge on `CHANGES_REQUIRED` or `BLOCKED`, past a red or pending check, or past
a failed bug-fix gate. In those cases report the verdict and the PR link and hand it
to the user.

`main` has no branch protection, so nothing on GitHub enforces any of this. It is
self-enforced.

## Publishing is separate

Merging a PR does not ship to the live site — publishing from Webflow does. Claude
may publish to the `webflow.io` staging subdomain to verify Webflow changes on the
published page, and records that in the PR. Publishing to a custom domain still
requires the task to ask for it.
