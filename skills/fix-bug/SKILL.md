# Fix a Bug

Use this whenever a bug is reported against this repo's animation code, the local
preview, or the behaviour of the bundle running on the Webflow site. It is the
detailed procedure behind the short Git rules in `AGENTS.md` / `CLAUDE.md`.

Do not start editing code before step 4. The point of this skill is that the branch,
the acceptance criteria, and the PR exist before the fix does.

## Context for this repo

- No CMS and no framework: the deliverable is `dist/animations.min.js`, pasted into
  Webflow custom code. A "bug" is almost always visual or scroll-driven behaviour,
  so browser verification matters more than unit assertions here.
- There is no linter and no type checker configured. Do not invent one, and do not
  claim a lint or type-check step ran. The real checks are listed under
  [Checks](#checks).
- Some bugs live in Webflow (markup, classes, custom attributes), not in this repo.
  If the root cause is in the Designer, say so and stop — an unrelated JS patch that
  papers over a Webflow structure problem is not a fix.

## Procedure

### 1. Understand and restate the bug

Before touching git, write a short summary back to the user covering:

- **Actual behaviour** — what happens now, on which page/component/breakpoint.
- **Expected behaviour** — what should happen instead.
- **Reproduction steps** — URL or local route, viewport, scroll position, browser.
- **Acceptance criteria** — the concrete, checkable conditions that make this fixed.

Ask for the missing pieces if the report is thin. The acceptance criteria are the
contract for the rest of the workflow: everything later is measured against them.

### 2. Prepare a clean `main`

```bash
git status --porcelain    # must be empty, or see below
git checkout main
git pull origin main
```

If the working tree has unrelated uncommitted changes, **preserve them**. Do not
stash-and-forget, reset, or check out over them. Create the branch from the current
state so the changes are carried along, tell the user those changes are present, and
keep them out of the bug-fix commit (stage only the files you touched for the fix).

### 3. Branch

```bash
git checkout -b fix/<short-kebab-description>
```

Name it after the symptom, not the guessed cause: `fix/mobile-header-overflow`,
`fix/tunnel-canvas-resize-blur`. One bug per branch.

### 4. Open a draft PR early

Push the empty branch and open a draft PR so it becomes the running record:

```bash
git push -u origin fix/<branch>
gh pr create --draft --base main --title "fix: <summary>" --body "<problem + acceptance criteria>"
```

Seed the body with the step 1 summary. If `gh` is unavailable or unauthenticated,
skip this and open the PR at step 8 instead — note in the final report that the PR
was opened late.

### 5. Reproduce, then find the root cause

Reproduce the bug before changing code. Verification of a fix is meaningless without
a before state.

- `npm run dev` for the local Vite preview (`index.html`).
- `npm run webflow` to serve the bundle to the live Webflow page from
  `localhost:4173` — use this when the bug only appears with real Webflow markup.
- Use browser tooling to inspect the failing element, console errors, and computed
  layout at the reported breakpoint.

State the root cause explicitly before writing the fix. "Changing this line made the
symptom go away" is not a root cause.

### 6. Implement the smallest fix

Touch only what the root cause requires. No opportunistic renames, reformatting,
dependency bumps, or refactors — those belong on their own `refactor/` or `chore/`
branch. Follow the existing component conventions in
`skills/webflow-animation-embed/SKILL.md` and `skills/threejs-canvas/SKILL.md`.

### 7. Checks

Run every check that is relevant to what changed, and report exactly which ones you
ran. `.github/workflows/ci.yml` runs the build and the local e2e suite on every PR —
run them locally too rather than waiting on CI, but CI's result is the one that gates
an auto-merge.

| Check | Command | When |
| --- | --- | --- |
| Build | `npm run build` | Always — the bundle is the deliverable. |
| E2E (local) | `npm run test:e2e` | Always for animation/behaviour changes. |
| E2E (live site) | `npm run test:e2e:live` | When the bug was reported on the published site. |
| Headed debugging | `npm run test:e2e:headed` / `npm run test:e2e:ui` | While diagnosing a failing spec. |
| Browser check | manual, via `npm run dev` or `npm run webflow` | Always for visual/scroll bugs. |
| Responsive check | manual, at the breakpoints named in the report | Whenever layout or breakpoints are involved. |

Add or extend a Playwright spec in `tests/` when the bug is reproducible headlessly.
A spec that **fails on `main` and passes on the branch** is the only objective proof
the fix works, and it is a hard requirement for auto-merge (see step 10). Write the
spec before the fix, watch it fail, then fix. Record both results.

Then check the result against the step 1 acceptance criteria, one by one. If any
criterion fails, go back to step 5. Do not report the task as complete, and do not
skip, delete, or `test.skip` a failing test to make the suite green.

### 8. Review the diff, then commit

```bash
git diff main...HEAD
```

Remove anything accidental: stray `console.log`, commented-out experiments, debug
colours or outlines, temporary tunables, unrelated file changes, `test-results/`
artifacts.

```bash
git commit -m "fix: <imperative summary>"
git push
```

Conventional Commit, `fix:` type. Never add a `Co-authored-by` trailer.

### 9. Update the PR and mark it ready

Rewrite the PR body to be the full record:

- **Problem** — actual vs. expected behaviour.
- **Root cause** — the real one.
- **Solution** — what changed and why this is the minimal fix.
- **Files changed.**
- **Testing performed** — the exact commands and manual checks that ran, and their
  results. Never list a check that did not run.
- **Verification against acceptance criteria** — each criterion, met or not.
- **Screenshots / recordings** for visual fixes.
- **Caveats** — known limitations, deferred work, anything the reviewer must know.

Mark the PR ready for review (`gh pr ready`).

### 10. Merge or hand off

A bug fix may merge itself **only** when every one of these gates passes. They are
all-or-nothing: one failure means hand off. Never argue a gate away, and never merge
because the fix "looks obviously right".

| # | Gate | How to verify |
| --- | --- | --- |
| 1 | CI is green on the PR | `gh pr checks <pr> --required` — GitHub's status, not your own test run. |
| 2 | A regression spec fails on `main` and passes on the branch | Both results recorded in the PR, from step 7. |
| 3 | The diff touches only `src/` and `tests/` | `git diff --name-only main...HEAD`. Any change to `package.json`, `vite.config.js`, either Playwright config, `.github/`, `dist/`, `skills/`, or `docs/` disqualifies. |
| 4 | The diff is at most 50 changed lines | `git diff --shortstat main...HEAD`. |
| 5 | The acceptance criteria came from the user | Criteria you inferred yourself do not count — ask the user to confirm them, or hand off. |
| 6 | Every acceptance criterion is met by an automated check | If any criterion can only be confirmed by eye, hand off. |
| 7 | The root cause is in this repo | Anything rooted in Webflow markup, styling, or hosting always hands off. |

Rationale, so these are not treated as red tape: gates 1 and 2 are the only checks in
this workflow that are not self-attested. Gate 6 exists because most bugs in this repo
are visual, and "I looked at it and it seemed fixed" is not evidence. Gates 3, 4 and 5
keep the blast radius small and stop a mis-framed problem statement from auto-shipping.

**If all gates pass:**

```bash
gh pr merge <pr> --squash --delete-branch
```

Then report what merged, which gates passed, and the CI run link.

**If any gate fails:** mark the PR ready, stop, and report the PR link plus exactly
which gate failed and why. Do not merge, and never push to `main` directly.

When in doubt, hand off. An unnecessary review costs the user a minute; a bad
auto-merge ships to the live Webflow site.

### 11. After the merge

```bash
git checkout main
git pull origin main
git branch -d fix/<branch>
git push origin --delete fix/<branch>   # if not deleted automatically
git status --porcelain                  # confirm clean
```

## Never

- Work directly on `main`, or push to `main`.
- Say something was tested when it was not, or report a check that did not run.
- Leave a failing test hidden, skipped, or deleted.
- Mix unrelated changes into the bug-fix PR.
- Commit debug code.
- Rewrite or discard the user's existing uncommitted changes.
- Bypass a repo convention without saying, in the PR, which one and why.
