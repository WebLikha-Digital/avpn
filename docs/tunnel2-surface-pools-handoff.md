# Tunnel 2 — per-surface image pools (handoff)

Implementation brief for restricting each manifest image to one corridor surface
in `src/canvas/tunnel2.js`. Written for whoever picks the build up (Conductor,
Codex, or Claude). Classification: **mixed** — a Webflow attribute pass (Claude,
first) and a repo code change (Codex or Conductor, second).

Suggested branch: `feat/tunnel2-surface-pools`.

## Order of work

1. **Webflow first (Claude).** Add `data-tunnel2-surface` to each of the 24 image
   elements in the hero's `[data-tunnel2-images]` manifest on the AVPN Webflow site.
   Values follow the Figma frame names: `Left 1-6` → `left`, `Right 1-6` → `right`,
   `Top 1-6` → `top`, `Bottom 1-6` → `bottom`. No structural change. Do not publish.
2. **Repo code (this brief).**
3. **Verify on the Webflow page**, not on `index.html` — see **Validation**.

## Task

Implement the repository code changes required for:

Letting each image in the `[data-tunnel2-images]` manifest declare which corridor
surface it belongs to — left wall, right wall, ceiling, or floor — so the tunnel only
ever places it on that surface. Within a surface the images still shuffle and
recycle exactly as they do today.

Do not modify Webflow. Claude owns all Webflow Designer and Webflow MCP changes.

## Why

The client supplied 24 hero images composed for specific positions: six for the
left wall, six for the right wall, six for the ceiling ("Top" in the Figma file), six
for the floor ("Bottom"). Portrait images are meant for the walls and landscape
images for floor/ceiling. Today the component draws from one flat pool, so a portrait
image can land on a floor tile and be centre-cropped down to a strip.

## Expected behavior

Current behavior:

- `collectSources()` reads every `<img>` in the manifest into one `urls` array.
- `preload()` turns that into one `pool` of textures.
- `nextEntry()` (around `src/canvas/tunnel2.js:324-337`) walks a single shuffled
  bag over the whole pool. `addTile()` calls `nextEntry()` for every tile regardless
  of which surface it is building.

Expected behavior:

- Each `<img>` may carry `data-tunnel2-surface` with one of `left`, `right`, `top`,
  `bottom`.
- The component keeps four shuffled bags — one per surface — and each surface's
  `addTile()` call draws only from its own bag.
- An image with no `data-tunnel2-surface`, or with an unrecognised value, is
  treated as **unassigned** and goes into every surface's bag. This keeps the
  current `index.html` demo and any existing Webflow manifest working unchanged.
- If a surface ends up with an empty bag (no images tagged for it and no unassigned
  images), that surface renders no tiles rather than crashing or borrowing from
  another surface. `addTile()` already early-returns on an empty pool; keep that
  shape.
- Shuffle semantics per bag stay the same as today: walk the bag in shuffled order,
  refill when empty, so neighbours on the same surface stay distinct.

### Surface → geometry mapping

Verified against the `populate()` calls in `src/canvas/tunnel2.js`:

| Surface | `addTile()` call | Position / rotation |
| --- | --- | --- |
| `bottom` (floor) | ~line 384 | `y = -halfH + inset`, `Euler(-PI/2, 0, 0)` |
| `top` (ceiling) | ~line 394 | `y = +halfH - inset`, `Euler(PI/2, 0, 0)` |
| `left` wall | ~line 408 | `x = -halfW + inset`, `Euler(0, PI/2, 0)` |
| `right` wall | ~line 418 | `x = +halfW - inset`, `Euler(0, -PI/2, 0)` |

Re-check these before wiring; do not assume the order from the comment above.

## Acceptance criteria

The task is complete only when:

Verified on `https://avpn-25-26.webflow.io/` with the local bundle
(`npm run webflow`, page loads `animations.min.js` from `localhost:4173`):

- On the hero tunnel, the six `left` images only ever appear on the left wall, the
  six `right` images only on the right wall, the six `top` images only on the
  ceiling, the six `bottom` images only on the floor. Checked during continuous
  motion across several recycle cycles, not on one settled frame.
- Within a surface the six images still shuffle; no image repeats on adjacent
  segments of the same surface while five others are unused.
- Portrait images on the walls and landscape images on floor/ceiling render with
  their intended framing — no image is cut to a strip by a wrong-surface crop.
- The hero still mounts one canvas, recycles, responds to resize, pauses off-screen,
  renders a static frame under `prefers-reduced-motion`, and recovers from WebGL
  context loss — same as before the change.
- Responsive: the above holds on desktop, tablet, and mobile viewports of the
  Webflow page.

Verified in the repo:

- `npm run build` succeeds.
- An image with no `data-tunnel2-surface` (or an unrecognised value) can still land
  on any surface, so a manifest without tags behaves exactly as today.
- A surface with no eligible images renders no tiles and does not throw.
- The texture pool is still loaded once per instance; per-surface bags hold indices
  or references into that pool, not duplicate textures.
- `disposePool()` still frees every texture on teardown (no leak from the new
  bookkeeping).
- `docs/tunnel2.md` documents the new `data-tunnel2-surface` attribute in the
  Webflow setup section and the attribute table, including the unassigned fallback.
- A Playwright spec in `tests/animations.spec.js` covers the assignment as the CI
  regression gate (it must fail on `main` and pass on the branch). This is the
  automated guard only, not the acceptance test — the Webflow checks above are.
- Existing related behavior continues to work (cover-fit crop, fill-rate, inset,
  recycling, reduced motion, context loss recovery).
- No unrelated refactors or cleanup are included.

`index.html` is a sandbox, not the product. Updating its demo manifest with tagged
SVGs is optional and only useful if the Playwright spec needs a tagged fixture; it is
not a verification target.

## Relevant context

Project: AVPN animation repository used by the Webflow site.

Relevant implementation details:

- Component: `src/canvas/tunnel2.js`, mounted from `[data-tunnel2-init]`.
- Manifest: `[data-tunnel2-images]` container of `<img>` tags inside the mount.
  `collectSources()` is the only place that reads the manifest; it currently
  returns a bare `urls` array. It needs to return the surface alongside each URL
  (e.g. `{ url, surface }`) and `preload()` needs to carry that through to the
  pool entries.
- `preload()` skips URLs that fail to load, so surface tagging must survive the
  filter — attach the surface to the entry, not to a parallel array by index.
- `nextEntry()` and `bag` are the single shuffle. Make them per-surface (a small
  factory that returns a `next()` closure over one bag is the least invasive shape).
- `addTile(group, position, rotation, w, h)` takes no surface argument today. Add
  one (or pass the `next` function) so the four calls in `populate()` can select
  their bag.
- The 24 real images live in the Figma file "AVPN Assets (Copy)", frame "Header":
  frames named `Left 1-6`, `Right 1-6`, `Top 1-6`, `Bottom 1-6`. `Left`/`Right` are
  800x1200 portrait; `Top`/`Bottom` are 1200x800 landscape.
- Webflow side (Claude, before the code work — see **Order of work**): the 24
  image elements in the hero manifest carry `data-tunnel2-surface`. The code binds
  to that attribute; nothing else on the Webflow side changes.

Inspect the repository yourself before making changes. Do not assume the suggested
files are the only files involved.

Follow the repository's `AGENTS.md`, `README.md`, and applicable `skills/`
instructions.

## Constraints

- Repository code only.
- Do not make Webflow changes.
- Do not change Webflow structure to work around a code problem.
- Keep the diff focused on this task.
- Preserve existing architecture and conventions unless changing them is required
  for correctness.
- Preserve unrelated uncommitted changes.
- Do not add debug code to the final implementation.
- Do not add `Co-authored-by` or other co-author attribution.
- Do not create branches, commit, push, or open a PR (if running under Codex).
- Do not change `src/canvas/tunnel.js`; that is the separate wireframe variant.

For GSAP or scroll-driven work:

- clean up created animations, ScrollTriggers, listeners, and observers correctly
- avoid duplicate initialization
- account for responsive lifecycle behavior
- test behavior during continuous motion, not only at settled positions

## Validation

Run and report the real result:

```bash
npm run build
```

`npm run test:e2e` binds a local port and cannot run inside the Codex sandbox
(`EPERM`). If you are Codex, write or update the spec and report it as `NOT RUN`;
Claude runs it. If you are Conductor or Claude with a real shell, run it and report
the result.

The acceptance test is on the Webflow page, not `index.html`:

```bash
npm run webflow   # serves dist/animations.min.js at http://localhost:4173
```

Then open `https://avpn-25-26.webflow.io/` — the page is wired to load the bundle
from `localhost:4173` — and check every item under **Acceptance criteria → Verified
on the Webflow page**, sampling during continuous motion. Repeat at desktop, tablet,
and mobile widths. Whoever has a real browser (Claude or Conductor) runs this; Codex
cannot.

Never run `npm run test:e2e:live`; it targets the live Webflow site and is only run
deliberately by a human.

Never claim a check passed unless it actually ran.

## Return

Report in this structure:

### STATUS

`DONE`, `BLOCKED`, or `NEEDS_WEBFLOW_CHANGE`

### CHANGES

- files changed
- concise explanation of the implementation

### VALIDATION

- `npm run build`: PASS | FAIL | NOT RUN
- `npm run test:e2e`: PASS | FAIL | NOT RUN

### ACCEPTANCE CRITERIA

- one line per criterion above: PASS | FAIL

### WEBFLOW REQUIREMENTS

Expected `None` — the `data-tunnel2-surface` attributes are already on the 24 hero
manifest images. Note anything else the code turns out to need.

### RISKS / NOTES
