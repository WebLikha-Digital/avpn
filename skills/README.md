# Skills

Reusable, repo-specific instructions for coding agents working on this project
(Claude Code and Codex both read this folder — see wiring below).

## Convention

Each skill is a folder with a `SKILL.md`:

```
skills/
  <skill-name>/
    SKILL.md      required — what it's for, when to use it, the steps
    *             optional supporting files (templates, scripts, references)
```

`SKILL.md` should stay plain markdown with no tool-specific frontmatter beyond a
short description line, so it reads the same whether it's loaded by Claude Code's
Skill tool or pulled in by Codex via AGENTS.md.

## Wiring

- **Claude Code** discovers skills via `.claude/skills`, which is a symlink to this
  folder — add a skill here and it's automatically available, no duplication.
- **Codex** has its own skills and subagent mechanisms, but this repo does not use
  them: `AGENTS.md` at the repo root points Codex here and tells it to read the
  relevant `SKILL.md` before doing related work, so both agents follow one copy.

## Current skills

- `webflow-animation-embed/` — how to build the animation bundle and wire it into
  Webflow's custom code embeds; also the canonical `init<Component>()` code
  convention (GSAP-based DOM/scroll animation).
- `threejs-canvas/` — same conventions, adapted for WebGL/canvas components
  (render loop lifecycle, GPU resource disposal, resize/visibility handling).
- `codex-handoff/` — how Claude launches the correct Codex model through the supervised
  foreground runner, hands off repository work, and reads the report Codex returns.
- `review-pr/` — the risk-tiered PR review Claude runs inline after CI settles: what
  it reads, the verdict posted on the PR, fix rounds, and merge authorization.
- `fix-bug/` — the owner-tagged bug workflow: acceptance criteria, `fix/` branch,
  early draft PR, reproduce-then-fix, validation, review, and cleanup.
