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
- There is no JavaScript linter and no type checker configured (only a markdown
  lint for docs). Do not invent one, and do not
  claim a lint or type-check step ran. The real checks are listed under
  [Checks](#7-checks).
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

GitHub refuses a PR with nothing in it (`No commits between main and fix/...`), so give
the branch an empty commit to hang the PR on:

```bash
git commit --allow-empty -m "chore: open <branch> for <summary>"
git push -u origin fix/<branch>
gh pr create --draft --base main --title "fix: <summary>" --body "<problem + acceptance criteria>"
```

Seed the body with the step 1 summary. The empty commit gets absorbed when the PR is
squash-merged, so it costs nothing in history.

If `gh` is unavailable or unauthenticated, skip this and open the PR at step 8 instead —
note in the final report that the PR was opened late.

### 5. Reproduce, then find the root cause

Reproduce the bug before changing code. Verification of a fix is meaningless without
a before state.

- `npm run dev` for the local Vite preview (`index.html`).
- `npm run webflow` to serve the bundle to the live Webflow page from
  `localhost:4173` — use this when the bug only appears with real Webflow markup.
- Use browser tooling to inspect the failing element, console errors, and computed
  layout at the reported breakpoint.

Two traps worth knowing before you spend an hour on either:

- **`index.html` is a playground, not the site.** It carries one band and one wheel;
  the published page carries two bands and three wheels, with different markup. Confirm
  a reported bug against the published page before concluding anything about it.
- **A backgrounded browser tab cannot measure animation.** `requestAnimationFrame` is
  frozen there, so `gsap.ticker` never runs, every rAF-driven read returns a stale or
  zero value, and an rAF-awaiting call hangs until it times out. This rules out the
  Chrome MCP tab, which runs backgrounded — check `document.visibilityState` if a
  measurement looks impossibly clean. Playwright's own browser is fine.

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
| E2E (live site) | `npm run test:e2e:live` | When the bug was reported on the published site — which is most of them. |
| Headed debugging | `npm run test:e2e:headed` / `npm run test:e2e:ui` | While diagnosing a failing spec. |
| Browser check | manual, via `npm run dev` or `npm run webflow` | Always for visual/scroll bugs. |
| Responsive check | manual, at the breakpoints named in the report | Whenever layout or breakpoints are involved. |

A live spec must fulfil the bundle from `dist/` itself:

```js
await page.route("**/animations.min.js", (route) =>
  route.fulfill({ path: BUNDLE_PATH, contentType: "application/javascript" }));
```

The published page's footer tag points at `http://localhost:4173/animations.min.js`, and
Chrome blocks that from an `https://` page as a private-network request — `Permission was
denied for this request to access the 'loopback' address space`. A profile that has been
granted the permission loads it fine, which makes this look like it works right up until
it runs somewhere clean. `tests/live/foreword.spec.js` and
`tests/live/programmesHighlights.spec.js` both use the `page.route` form. Run
`npm run test:e2e:live` normally: its global setup calls Vite's `build()` API before
the browser starts, and the config does not start a server or bind port 4173. Every live
spec must still fulfil the bundle route from `dist/` itself.

Add or extend a Playwright spec in `tests/` when the bug is reproducible headlessly.
A spec that **fails on `main` and passes on the branch** is the only objective proof
the fix works, and it is a hard requirement for auto-merge (see step 10). Write the
spec before the fix, watch it fail, then fix. Record both results.

#### Motion bugs need per-frame samples

For anything scroll-driven or animated, **sampling settled positions is not evidence.**
Scroll somewhere, wait, read the value back, and a broken pin reads perfect — the
ticker and the trigger converge the instant motion stops. The symptom exists only
while the page is moving.

This is not hypothetical: it is how a wheel-pin bug on this site was twice reported
fixed when it was not. Settled sampling showed 0px drift in every condition; per-frame
sampling during a continuous scroll showed 14px.

So for a motion bug, drive real continuous motion and read on every frame:

```js
await page.evaluate(() => {
  window.__frames = [];
  const el = document.querySelector("<selector>");
  const tick = () => {
    window.__frames.push({ y: window.scrollY, left: el.getBoundingClientRect().left });
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
});

await page.mouse.move(600, 450);
for (let i = 0; i < 55; i += 1) {
  await page.mouse.wheel(0, 60);
  await page.waitForTimeout(40);
}
```

Then assert on the spread across the frames that fall inside the range you care about,
not on a single reading. `page.mouse.wheel` rather than `window.scrollTo`, because the
bug may only appear under real scroll input.

When the order of per-frame work is in question, log it. Pushing a marker into an array
from each callback and grouping by frame is enough to show, for instance, a write and a
read swapping places after a rebuild.

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

Run `npm run build` and stage `dist/animations.min.js` alongside the source. Every
commit in this repo's history ships the rebuilt bundle with the change that caused it —
the bundle is the deliverable, and a source commit without it leaves the site on the
old code.

```bash
npm run build
git add src/... tests/... dist/animations.min.js
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

Then run the review in `skills/review-pr/SKILL.md`. Claude reviews inline, reading
the PR diff fresh against the acceptance criteria and CI — not from memory of
this workflow's reasoning. A `CHANGES_REQUIRED` verdict goes back through the fix loop; a
`BLOCKED` verdict hands off to the user. Only a `PASS` reaches the gates below, and a
`PASS` on its own still does not authorize a merge — every gate must pass too.

### 10. Merge or hand off

A bug fix may merge itself **only** when every one of these gates passes. They are
all-or-nothing: one failure means hand off. Never argue a gate away, and never merge
because the fix "looks obviously right".

| # | Gate | How to verify |
| --- | --- | --- |
| 1 | CI is green on the PR | `gh pr checks <pr>` — GitHub's status, not your own test run. `main` has no branch protection, so nothing enforces this gate for you: check it, and never merge past a red or pending run. |
| 2 | A regression spec fails on `main` and passes on the branch | Both results recorded in the PR, from step 7. |
| 3 | The diff touches only `src/`, `tests/`, and `dist/animations.min.js` | `git diff --name-only main...HEAD`. `dist/` is allowed *only* as the rebuilt output of the source change in the same diff — never hand-edited. Any change to `package.json`, `vite.config.js`, either Playwright config, `.github/`, `skills/`, or `docs/` disqualifies. |
| 4 | The diff is at most 50 changed lines, excluding `dist/` | `git diff --shortstat main...HEAD -- src tests`. The bundle is one minified line and would swamp the count. |
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

Confirm it actually merged first. A `CLOSED` PR with no `mergedAt` did not, and its
branch stays.

```bash
gh pr view <pr> --json state,mergedAt    # state MERGED, mergedAt non-null
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
