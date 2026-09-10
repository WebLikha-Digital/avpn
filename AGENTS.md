# Agent notes — AVPN (Webflow + Weblikha)

This repo holds animation JS for the AVPN site, built in Webflow by Weblikha. Webflow
owns layout/content (no CMS in use); this repo only owns custom motion code Webflow's
Designer can't do natively. See `README.md` for the build/structure overview.

## Your role

Claude orchestrates this project and owns everything on the Webflow side. You own
repository code.

```
Claude: classify → branch → handoff → Webflow → PR → review → merge
Codex:  inspect repo → code → test → commit → push → report back
```

You implement changes to JavaScript, GSAP logic, repo CSS, utilities, tests, build
config, refactors, and bug fixes in repository code. You commit and push the branch
Claude created. You do not open, review, or merge the pull request, and you never
change anything in Webflow — if a task cannot be solved in repo code, report that
Webflow work is required rather than working around it.

Claude sends work through `skills/codex-handoff/SKILL.md`. That handoff carries the
task, acceptance criteria, branch name, and the report format to return. Follow it.

## Skills

Before doing work related to animations, builds, or Webflow embedding, check
`skills/` for a relevant `SKILL.md` and follow it. Start with `skills/README.md` for
the index and conventions.

When a bug is reported, follow `skills/fix-bug/SKILL.md`.

## Validation

Run the checks that actually apply to the change, at minimum:

```bash
npm run build
npm run test:e2e
```

`npm run test:e2e` needs browsers installed once per machine:
`npm run test:e2e:install`.

Never run `npm run test:e2e:live` — it points at the live Webflow site and is only
run deliberately, by a human.

Never claim a check passed unless it ran. If a required check cannot run, say why.

## Git

Feature-branch workflow. Never make feature commits directly on `main`.

Claude creates the branch before handing work to you. Work on that branch.

If no task branch exists yet, stop and report that the implementation needs one —
do not create a branch or invent a workflow of your own.

Branch prefixes by kind: `feat/` new features, `fix/` bug fixes, `refactor/` code
restructuring, `chore/` maintenance.

After implementing:

1. Review the diff.
2. Remove debug and temporary code.
3. Commit the focused change with a clear conventional commit message.
4. Push the task branch to origin.
5. Return control to Claude with the report from the handoff skill.

Keep the branch to one logical change. Preserve any unrelated uncommitted changes
already in the working tree — never discard them, and never fold them into the
commit.

- Never add a `Co-authored-by` trailer (or any co-author attribution) to commits.
- Never push to `main`.
- Never open or merge the pull request.

### Bug fixes

Bug fixes use `fix/` branches and follow `skills/fix-bug/SKILL.md`. The short form:

- Reproduce or confirm the bug before changing anything.
- Keep the branch to the one bug — no unrelated refactors or cleanup.
- Add a regression test whenever the bug can be reproduced in automation. It should
  fail against the broken behavior and pass after the fix.
- Run the repo's real checks and report only checks that actually ran.
- The fix is not done until it meets the acceptance criteria; never hide or skip a
  failing test.
- For a scroll-driven or animated bug, sample per animation frame during real
  continuous motion. Reading a settled position passes on a broken pin.

### GSAP and scroll-driven work

- Clean up created animations, ScrollTriggers, listeners, and observers.
- Guard against duplicate initialization.
- Account for responsive lifecycle behavior across breakpoints.
- Verify behavior during continuous motion, not only at settled positions.
