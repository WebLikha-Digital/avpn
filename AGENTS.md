# Agent notes — AVPN (Webflow + Weblikha)

This repo holds animation JS for the AVPN site, built in Webflow by Weblikha. Webflow
owns layout/content (no CMS in use); this repo only owns custom motion code Webflow's
Designer can't do natively. See `README.md` for the build/structure overview.

## Your role

Claude orchestrates this project and owns everything on the Webflow side. You own
repository code.

```
Claude: classify → branch → delegate → wait → validate → commit → push → PR
Codex:  inspect → implement → add tests → report
```

You implement changes to JavaScript, GSAP logic, repo CSS, utilities, tests, build
config, refactors, and bug fixes in repository code. You never change anything in
Webflow — if a task cannot be solved in repo code, report that Webflow work is
required rather than working around it.

**You do not touch Git.** Your sandbox mounts `.git` read-only, so writes fail with
`could not lock config file .git/config: Operation not permitted`. Do not create a
branch, commit, push, or open a PR. Leave your work uncommitted in the working tree
and report it; Claude reviews the diff, runs the remaining checks, and takes it from
there.

Claude sends work through `skills/codex-handoff/SKILL.md`. That handoff carries the
task, acceptance criteria, branch name, and the report format to return. Follow it.

## Models

Claude Opus is the orchestrator, planner, reviewer, and merger. Every Codex task
uses `gpt-5.6-luna`. The sandbox sets the boundary: a task that modifies repository
files uses the workspace-write sandbox; read-only, non-intensive inspection, summaries,
inventory, and log triage use the read-only sandbox. A read-only task never expands
into file changes: if it finds a mutation is needed, recommend it so Claude can start
a fresh workspace-write task or resume the branch's existing session.

## Skills

Before doing work related to animations, builds, or Webflow embedding, check
`skills/` for a relevant `SKILL.md` and follow it. Start with `skills/README.md` for
the index and conventions.

When a bug is reported, follow `skills/fix-bug/SKILL.md`.

## Validation

Run `npm run build` whenever a change touches `src/**`, `package.json`,
`vite.config.js`, or `dist/**`. Run `npm run test:routing` whenever it touches
`scripts/ci/**`, and `npm run test:codex-handoff` whenever it touches
`scripts/codex/**`. These work in your sandbox. Write or update regression specs, but do
not run `npm run test:e2e`: Playwright starts a local server and binding a port fails
with `EPERM`. Claude runs the suite.

Never run `npm run test:e2e:live` either; it points at the live Webflow site and is
only run deliberately, by a human.

Never claim a check passed unless it ran. If a check cannot run, say why.

Codex self-validation is evidence for Claude's review, never merge authorization.

### Browser preview (future)

If browser preview is ever enabled for Codex, it must be read-only and load this
checkout's built `dist/animations.min.js`, not the published bundle. Animation
measurements must use a visible foreground browser because a backgrounded tab freezes
`requestAnimationFrame`.

## Git

Claude prepares the branch before handing work to you and owns every Git operation
after it. You work in the tree you are given.

If no task branch exists yet, stop and report that the implementation needs one —
do not create one.

After implementing:

1. Review your own diff.
2. Remove debug and temporary code.
3. Return control to Claude with the report from the handoff skill.

Keep the change to one logical unit. Preserve any unrelated uncommitted changes
already in the working tree — never discard them.

- Never write to `.git`: no branch, no commit, no push, no PR.
- Never continue working in the background after you have returned a result. A late
  write into a shared checkout overwrites whatever Claude did in the meantime.

### Bug fixes

Bug fixes use `fix/` branches and follow `skills/fix-bug/SKILL.md`. The short form:

- Reproduce or confirm the bug before changing anything.
- Keep the branch to the one bug — no unrelated refactors or cleanup.
- Add a regression test whenever the bug can be reproduced in automation. It should
  fail against the broken behavior and pass after the fix — Claude confirms both, since
  you cannot run the suite.
- Run `npm run build` and report only checks that actually ran.
- The fix is not done until it meets the acceptance criteria; never hide or skip a
  failing test.
- For a scroll-driven or animated bug, sample per animation frame during real
  continuous motion. Reading a settled position passes on a broken pin.

### GSAP and scroll-driven work

- Clean up created animations, ScrollTriggers, listeners, and observers.
- Guard against duplicate initialization.
- Account for responsive lifecycle behavior across breakpoints.
- Verify behavior during continuous motion, not only at settled positions.
