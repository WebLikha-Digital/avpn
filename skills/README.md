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
- **Codex** doesn't have a native skills mechanism, so `AGENTS.md` at the repo root
  points it here and tells it to read the relevant `SKILL.md` before doing related
  work.

## Current skills

- `webflow-animation-embed/` — how to build the animation bundle and wire it into
  Webflow's custom code embeds; also the canonical `init<Component>()` code
  convention (GSAP-based DOM/scroll animation).
- `threejs-canvas/` — same conventions, adapted for WebGL/canvas components
  (render loop lifecycle, GPU resource disposal, resize/visibility handling).
- `codex-handoff/` — how Claude hands repository code work to Codex, what the handoff
  must contain, and the report Codex returns.
- `review-pr/` — the automated PR review: independent reviewer, verdicts, the
  CHANGES_REQUIRED loop and its cap, and what may merge itself.
- `fix-bug/` — the workflow to follow when a bug is reported: acceptance criteria,
  `fix/` branch, early draft PR, reproduce-then-fix, the checks this repo actually
  has, and the post-merge cleanup.
