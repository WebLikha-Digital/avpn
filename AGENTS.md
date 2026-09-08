# Agent notes — AVPN (Webflow + Weblikha)

This repo holds animation JS for the AVPN site, built in Webflow by Weblikha. Webflow
owns layout/content (no CMS in use); this repo only owns custom motion code Webflow's
Designer can't do natively. See `README.md` for the build/structure overview.

## Skills

Before doing work related to animations, builds, or Webflow embedding, check
`skills/` for a relevant `SKILL.md` and follow it. Start with `skills/README.md` for
the index and conventions.

When a bug is reported, follow `skills/fix-bug/SKILL.md`.

## Git

Feature-branch workflow. Never make feature commits directly on `main`.

For every feature, fix, refactor, or maintenance task:

1. Start from `main`.
2. Pull the latest changes from `origin/main`.
3. Create a branch from `main`.
4. Prefix the branch by kind: `feat/` new features, `fix/` bug fixes,
   `refactor/` code restructuring, `chore/` maintenance.
5. Keep the branch focused on one logical change.
6. Make and review the changes.
7. Commit with a clear conventional commit message.
8. Push the branch to origin.
9. Open a pull request targeting `main`.
10. Never merge the PR — the user reviews and merges it. The one exception is a
    bug fix that passes every auto-merge gate in `skills/fix-bug/SKILL.md`.
11. After the PR is merged: switch back to `main`, pull the latest
    `origin/main`, delete the local branch, and delete the remote branch if it
    was not deleted automatically.

If `main` already has uncommitted changes, branch first and carry those changes
into the new branch before committing.

If a feature branch already has commits for the task at hand, keep using it
rather than opening another branch for the same logical change.

- Never add a `Co-authored-by` trailer (or any co-author attribution) to commits.
- Pushing a feature branch and opening its PR needs no separate approval; pushing
  to `main` itself is never done.

### Bug fixes

Bug fixes use `fix/` branches and follow `skills/fix-bug/SKILL.md`. The short form:

- Restate actual vs. expected behavior, reproduction steps, and acceptance criteria
  before writing code.
- Reproduce or confirm the bug before changing anything.
- Open a draft PR early so the PR is the running record of the fix.
- Keep the branch to the one bug — no unrelated refactors or cleanup.
- Run the repo's real checks (`npm run build`, `npm run test:e2e`, plus browser and
  responsive checks) and report only checks that actually ran.
- The fix is not done until it meets the acceptance criteria; never hide or skip a
  failing test.
- Review the diff and strip debug code before committing.
- Preserve any unrelated uncommitted changes already in the working tree — never
  discard them, and never fold them into the fix commit.
- A bug fix may merge its own PR only when it passes every gate in the skill —
  green CI, a regression spec that fails on `main` and passes on the branch, a
  small diff confined to `src/` and `tests/`, and acceptance criteria that came
  from the user. Any gate failing means hand the PR off for review.
