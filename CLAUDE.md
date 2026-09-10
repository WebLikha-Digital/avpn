# Claude Code notes — AVPN (Webflow + Weblikha)

This repo holds animation JS for the AVPN site, built in Webflow by Weblikha. Webflow
owns layout/content (no CMS in use); this repo only owns custom motion code Webflow's
Designer can't do natively. See `README.md` for the build/structure overview.

## Agent roles

Claude orchestrates; Codex implements repository code.

```
Claude: classify → branch → handoff → Webflow → PR → review → merge
Codex:  inspect repo → code → test → commit → push → report back
```

**Claude owns** Webflow Designer and Webflow MCP work, page structure, classes,
attributes, variables, components, embeds, visual and responsive QA in Webflow, task
classification and acceptance criteria, and the Git lifecycle around the branch —
creating it, opening the PR, running the review, merging, and cleaning up.

**Codex owns** repository code: JavaScript, GSAP logic, repo CSS, utilities, tests,
build config, refactors, and bug fixes in repo code — plus the commit and push on the
branch Claude created.

Claude does not make competing edits to files Codex is implementing. If the Codex CLI
is unavailable or fails to run, Claude implements the change directly and says so in
the PR body — the delegation rule is not a reason to leave work undone.

## Task routing

Classify before implementing.

- **Webflow-only** — layout, sections, classes, variables, attributes, Designer
  breakpoints, content, components. Claude does it directly.
- **Code-only** — GSAP behavior, JS bugs, animation lifecycle, refactors, tests,
  build config, repo CSS. Claude hands off to Codex.
- **Mixed** — Claude does the Webflow half, hands the repo half to Codex, then
  validates the integrated result end to end.

When it is unclear which side a change belongs to, prefer Webflow for
layout/content/style and repo code for behavior Webflow cannot do natively.

## Approval

After classifying a task, state the classification and the acceptance criteria, then
stop for the user's OK. Once approved, the rest of the chain — branch, handoff,
Webflow work, PR, review — runs without further check-ins.

## Skills

Before doing work related to animations, builds, Webflow embedding, delegation, or PR
review, check `skills/` for a relevant `SKILL.md` and follow it. Start with
`skills/README.md` for the index and conventions.

- Bug reported → `skills/fix-bug/SKILL.md`
- Handing repo work to Codex → `skills/codex-handoff/SKILL.md`
- Reviewing a PR → `skills/review-pr/SKILL.md`

## Git

Feature-branch workflow. Never make feature commits directly on `main`.

For every feature, fix, refactor, or maintenance task:

1. Start from `main`.
2. Pull the latest changes from `origin/main`.
3. Create a branch from `main`.
4. Prefix the branch by kind: `feat/` new features, `fix/` bug fixes,
   `refactor/` code restructuring, `chore/` maintenance.
5. Keep the branch focused on one logical change.
6. Define the acceptance criteria and get the user's OK (see **Approval**).
7. Route the work: Webflow to Claude, repository code to Codex via
   `skills/codex-handoff/SKILL.md`.
8. Review the resulting diff; strip debug, temporary, and unrelated changes.
9. Open a pull request targeting `main`.
10. Run the automated review in `skills/review-pr/SKILL.md`.
11. Never merge the PR — the user reviews and merges it. The one exception is a
    bug fix that passes every auto-merge gate in `skills/fix-bug/SKILL.md`.
12. After the PR is merged: switch back to `main`, pull the latest
    `origin/main`, delete the local branch, and delete the remote branch if it
    was not deleted automatically.

If `main` already has uncommitted changes, branch first and carry those changes
into the new branch before committing.

If a feature branch already has commits for the task at hand, keep using it
rather than opening another branch for the same logical change.

- Never add a `Co-authored-by` trailer (or any co-author attribution) to commits.
- Pushing a feature branch and opening its PR needs no separate approval; pushing
  to `main` itself is never done.
- `main` has no branch protection. Nothing on GitHub enforces the merge gates — they
  are self-enforced, so never merge past a red or pending check.
- Publishing the Webflow site is a separate act from merging a PR. Never publish
  unless the task explicitly asks for it.

### Bug fixes

Bug fixes use `fix/` branches and follow `skills/fix-bug/SKILL.md`. The short form:

- Restate actual vs. expected behavior, reproduction steps, and acceptance criteria
  before writing code.
- Reproduce or confirm the bug before changing anything.
- Open a draft PR early so the PR is the running record of the fix.
- Keep the branch to the one bug — no unrelated refactors or cleanup.
- Decide whether the defect is in Webflow, repo code, or both, and route accordingly.
- Run the repo's real checks (`npm run build`, `npm run test:e2e`, plus browser and
  responsive checks) and report only checks that actually ran.
- The fix is not done until it meets the acceptance criteria; never hide or skip a
  failing test.
- Review the diff and strip debug code before committing.
- Preserve any unrelated uncommitted changes already in the working tree — never
  discard them, and never fold them into the fix commit.
- For a scroll-driven or animated bug, sample per animation frame during real
  continuous motion. Reading a settled position passes on a broken pin.
- A bug fix may merge its own PR only when it passes every gate in the skill —
  green CI, a regression spec that fails on `main` and passes on the branch, a
  small diff confined to `src/`, `tests/`, and the rebuilt bundle, and acceptance
  criteria that came from the user. Any gate failing means hand the PR off for
  review.
