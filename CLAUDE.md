# Claude Code notes — AVPN (Webflow + Weblikha)

This repo holds animation JS for the AVPN site, built in Webflow by Weblikha. Webflow
owns layout/content (no CMS in use); this repo only owns custom motion code Webflow's
Designer can't do natively. See `README.md` for the build/structure overview.

## Agent roles

Claude orchestrates; Codex implements repository code.

```
Claude: classify → branch → delegate → wait → validate → commit → push → PR
Codex:  inspect → implement → add tests → report
```

**Claude owns** Webflow Designer and Webflow MCP work, page structure, classes,
attributes, variables, components, embeds, visual and responsive QA in Webflow, task
classification and acceptance criteria, the whole Git lifecycle — branch, commit,
push, PR, review, merge, cleanup — and every check Codex cannot run.

**Codex owns** writing repository code: JavaScript, GSAP logic, repo CSS, utilities,
tests, build config, refactors, and bug fixes in repo code. It reports; it does not
commit, push, or open a PR.

### What Codex cannot do here

Measured in this repo with `codex exec --sandbox workspace-write`: writing a
workspace file and `npm run build` both succeed, but `git config --local` fails with
`could not lock config file .git/config: Operation not permitted`, and binding
`127.0.0.1:4199` fails with `EPERM`.

Playwright binds a port, so **`npm run test:e2e` can never run inside Codex.** The
split is forced by capability, not preference. Never write a handoff that tells Codex
to commit, push, or run the end-to-end suite — it cannot comply, and saying so invites
a false report.

### Delegating

Delegate one way only, from the prepared branch, through the supervised launcher:

```bash
node scripts/codex/run-handoff.mjs --model gpt-5.6-sol --sandbox workspace-write --timeout-seconds 540 --prompt "<scoped task>"
```

Use the nine-minute override for small foreground tasks so the command ends before
Bash's 10-minute ceiling. A real handoff has taken 13 minutes, so use the launcher's
30-minute default with `run_in_background: true` when the task may exceed 10 minutes.
In either mode, run one launcher invocation only; never combine Git preparation,
review, a fix round, polling, or log following into the same shell.

The root cause of the observed zero-event stall was `codex exec` reading a non-TTY
stdin and waiting for EOF. The launcher closes Codex's stdin, streams JSONL, and
permits one turn. Exit zero plus `turn.completed` is success; timeout, missing or
failed terminal state, and a terminal event followed by a process that does not exit
are failures.

After a non-zero launcher result, confirm it terminated the Codex process group
before inspecting partial edits. Do not implement fallback work in the same shell.

**Never delegate through the Agent tool** (`subagent_type: codex:codex-rescue`) **or
the `/codex:rescue` command.** The Agent tool is background-only in Claude Code,
silently drops `--wait` and `--fresh`, and keeps writing to the shared checkout
minutes after the handoff appears to have returned — overwriting whatever Claude did
in the meantime. That is not hypothetical; it is what happened. The Codex plugin stays
installed for ad-hoc use by a person, but nothing in this workflow goes through it.

Claude does not edit delegated files while the process is alive. If a run has to be
abandoned, kill it and confirm no `codex` process is still running against this
checkout before taking over.

**Fallback.** If `codex exec` is missing, unauthenticated, or reaches a terminal
failure — `turn.failed`, `error`, or a non-zero exit — Claude implements the change
directly and says so in the PR body. Delegation is not a reason to leave work undone.

Start the fallback only once the process has actually exited. While a run is alive,
wait for it; if it must be abandoned, kill it and confirm no `codex` process survives
first. Editing the delegated files alongside a live run is what produced the overwrite
this contract exists to prevent.

See `docs/claude-codex-handoff-resolution.md` for how this contract was arrived at.

### Models

Claude Opus orchestrates, plans, reviews, and merges. Every Codex task that modifies
repository files runs on `gpt-5.6-sol` with `--sandbox workspace-write`. Read-only,
non-intensive Codex tasks — inspection, summaries, inventory, log triage — may run on
`gpt-5.6-luna` with `--sandbox read-only`; the read-only sandbox is what enforces the
boundary. A Luna task never expands into a repository mutation: if it finds files need
to change, it ends with a recommendation and Claude starts a fresh Sol task or resumes
the branch's existing Sol session. Fix rounds use a new launcher invocation with
`--resume <thread_id>`; the launcher supplies Codex's different resume syntax. See
`skills/codex-handoff/SKILL.md`.

## Task routing

Classify before implementing.

- **Webflow-only** — layout, sections, classes, variables, attributes, Designer
  breakpoints, content, components. Claude does it directly.
- **Code-only** — GSAP behavior, JS bugs, animation lifecycle, refactors, tests,
  build config, repo CSS. Claude hands off to Codex, unless it is **trivial** (below).
- **Mixed** — Claude does the Webflow half, hands the repo half to Codex, then
  validates the integrated result end to end.
- **Trivial** — a mechanical repo edit Claude makes directly, without Codex. See
  **When Codex does not run**.

When it is unclear which side a change belongs to, prefer Webflow for
layout/content/style and repo code for behavior Webflow cannot do natively.

### When Codex does not run

A delegated run is a full inspect-implement-validate cycle — measured at ~10
minutes for a real component, of which only seconds are process start-up. Do not pay
that for a change that has no behavior in it. Claude edits directly when **all** of
these hold:

- at most two files, plus the rebuilt bundle
- no new logic — no new branch, loop, listener, timeline, ScrollTrigger, or
  three.js object; no change to what an existing one does
- the whole diff can be written from the task description alone, without reading
  around it to understand the code

Typical trivial edits: a tunable default or constant, a selector or attribute name,
docs, a typo or wording fix in `skills/`, `CLAUDE.md`, or `AGENTS.md`, a CI YAML
value with no logic in it, config values, dependency pins, a rebuilt `dist/`.

Workflow instructions — `AGENTS.md`, `CLAUDE.md`, `skills/**`, `.github/**`,
`scripts/ci/**` — are operational code, not prose. A trivial edit to them skips the
handoff, never the focused workflow review in `skills/review-pr/SKILL.md`
**Review tiers**. A change that adds or alters a rule, a step, an owner, or a CI
condition is not trivial.

Everything else goes to Codex: new components or behavior, GSAP or three.js logic,
lifecycle and cleanup, tests, refactors, bug fixes that need a root cause, build
config that has logic in it. If unsure whether an edit is trivial, it is not.

A trivial edit still gets a branch, a PR, CI, an inline review, and a merge per
**Git** — only the handoff is skipped. Say in the PR body that Claude implemented it
directly and why.

## Approval

After classifying a task, state the classification and the acceptance criteria, then
stop for the user's OK. Once approved, the rest of the chain — branch, handoff,
Webflow work, PR, review, merge, cleanup — runs without further check-ins.

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
   `skills/codex-handoff/SKILL.md`. For a bug fix, the draft PR from
   `skills/fix-bug/SKILL.md` step 4 exists before the handoff; for other work it may
   be opened after the first push.
8. Review the returned diff, then run the checks Codex could not — `npm run test:e2e`
   plus browser and responsive verification. Strip debug, temporary, and unrelated
   changes, then commit and push.
9. Open a pull request targeting `main`.
10. Review the PR inline per `skills/review-pr/SKILL.md`, at the tier the CI
    `classify` route selects, after `gate` settles, and post the verdict on the PR
    with `gh pr comment <pr> --body` — the review is not done until that comment
    exists.
11. Merge the PR yourself once the posted review says `PASS` and the `gate` check
    is green on the PR's head commit (`gh pr merge <pr> --squash --delete-branch`). No review
    comment on the head commit means no merge. A bug fix must
    additionally pass every gate in `skills/fix-bug/SKILL.md`. A `CHANGES_REQUIRED`
    or `BLOCKED` verdict, a red or pending check, or a failed bug-fix gate means
    hand the PR to the user instead — never merge past one.
12. After the merge: confirm it landed (`gh pr view <pr> --json state,mergedAt`),
    switch back to `main`, pull the latest `origin/main`, delete the local branch,
    and delete the remote branch if it was not deleted automatically. A `CLOSED`
    PR is not a merged PR — never clean up a branch whose PR did not merge.

If `main` already has uncommitted changes, branch first and carry those changes
into the new branch before committing.

If a feature branch already has commits for the task at hand, keep using it
rather than opening another branch for the same logical change.

- Never add a `Co-authored-by` trailer (or any co-author attribution) to commits.
- Pushing a feature branch and opening its PR needs no separate approval; pushing
  to `main` itself is never done.
- "CI is green" means the `gate` job of the `CI` workflow passed on the head commit.
  One workflow runs on every PR; its `classify` job routes the changed paths
  (`scripts/ci/classify-paths.mjs`) and `gate` fails if any job the route requires
  did not succeed. Routes: `runtime` (`src/**`, `tests/**`, `dist/**` with source,
  `package.json`, lockfile, Vite and Playwright config) runs `build` and `e2e` in
  parallel; `workflow` (`AGENTS.md`, `CLAUDE.md`, `skills/**`, `.github/**`,
  `scripts/ci/**`) runs `docs` and `workflow` (routing tests + actionlint); `docs`
  (other Markdown) runs `docs` only; `dist-orphan` (`dist/**` without a source
  change) always fails. Unknown paths route `runtime`. A skipped job is not a pass:
  `gate` treats a skipped required job as a failure. Check locally with
  `git diff --name-only main...HEAD | node scripts/ci/classify-paths.mjs`.
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
- A bug fix merges only when it passes every gate in the skill on top of the
  general `PASS` + green CI rule — a regression spec that fails on `main` and
  passes on the branch, a small diff confined to `src/`, `tests/`, and the rebuilt
  bundle, and acceptance criteria that came from the user. Any gate failing means
  hand the PR to the user.
