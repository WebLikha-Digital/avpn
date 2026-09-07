# Agent notes — AVPN (Webflow + Weblikha)

This repo holds animation JS for the AVPN site, built in Webflow by Weblikha. Webflow
owns layout/content (no CMS in use); this repo only owns custom motion code Webflow's
Designer can't do natively. See `README.md` for the build/structure overview.

## Skills

Before doing work related to animations, builds, or Webflow embedding, check
`skills/` for a relevant `SKILL.md` and follow it. Start with `skills/README.md` for
the index and conventions.

## Git

Feature-branch workflow. Never commit feature work directly to `main`.

Before starting a feature or fix:

1. Make sure `main` is up to date (`git fetch origin && git pull`).
2. Create a branch from `main`.
3. Prefix the branch by kind: `feat/` new features, `fix/` bug fixes,
   `refactor/` code restructuring, `chore/` maintenance.
4. Keep one branch to one logical change.
5. Commit with conventional commit messages.
6. Push the branch to origin.
7. Open a pull request targeting `main`.
8. Never merge the PR — the user reviews and merges it.

If `main` already has uncommitted changes, branch first and carry those changes
into the branch before committing.

- Never add a `Co-authored-by` trailer (or any co-author attribution) to commits.
- Pushing a feature branch and opening its PR needs no separate approval; pushing
  to `main` itself is never done.
