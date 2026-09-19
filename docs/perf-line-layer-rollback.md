# Scroll-drawn background lines: compositor layer change and rollback

On 2026-09-19 a site-wide animation performance audit found that the two
scroll-drawn lines that sit *behind* their section — `.ecosystem_line` and
`.impact-collab_line` — repaint the whole section on every scrub frame. This
page records the Webflow state before the fix, the exact change, the numbers
that justify it, and how to roll it back.

## Checkpoint

A manual Webflow backup exists from before any change:

- **Name:** `checkpoint save - 8/19 - before fps improvements`
- **Created:** 2026-09-19, 7:11:32 pm (Designer time) · 32 pages · 1101 styles ·
  5118 elements
- **Where:** Site settings → Backups (or Designer → Backups panel)

Restoring that backup reverts *every* Webflow change made after it, not only
the one below. Prefer the targeted rollback further down unless the site as a
whole has to go back.

The last publish before the change was 2026-09-19T09:59:22Z; Webflow also
created an automatic backup at that publish.

## Why

`src/animations/drawPathScroll.js` scrubs `stroke-dasharray` on the line's
`<path>` every scroll frame. The line's wrapper is `position: absolute` with
`z-index: -1`, so the SVG has no compositor layer of its own and shares the
section's. Each dasharray write invalidates the section: the cards, images and
text above the line repaint on every frame.

Measured on `https://avpn-25-26.webflow.io/` (Chrome, 1440×900, 120 Hz
display, CPU throttled 4×, scripted scroll at ~470 px/s through each section,
rAF frame durations sampled in-page):

| Section | Before | After `will-change: transform` on the wrapper |
| --- | --- | --- |
| Ecosystem (`.ecosystem_line`, 1425×1006 px) | avg 12.3–12.6 ms, max 34 ms, ~20 % of frames > 17 ms | avg 8.3–8.5 ms, max 18 ms, 0–4 frames > 17 ms |
| ImpactCollab (`.impact-collab_line`, 1425×832 px) | avg 12.7–12.8 ms, max 26 ms, 31–33 frames > 17 ms | avg 8.4–8.7 ms, max 17–18 ms, 1 frame > 17 ms |

Isolation checks that pin the cause on the line, not its neighbours:

- Removing the `drop-shadow` filter on the folder-deck panel SVGs: no change.
- Hiding the deck-panel SVGs: no change.
- Hiding the line SVG: 8.3 ms avg, 0 frames > 17 ms.
- `will-change: transform` on the line SVG or its wrapper: same result as
  hiding it.

The trace for the ecosystem pass showed `Paint` ×2054 in 3 s and `GPUTask`
up to 29.5 ms, consistent with a full-section repaint per frame.

**Do not apply this blanket to every drawn line.** The same declaration on
`.sig-events_line` (5257×900 px) and `.prog-overview_path` (1425×5940 px)
made their sections slightly *worse* (8.6 → 9.8 ms and 8.4 → 9.1 ms): those
SVGs are too large to promote cheaply and they do not sit behind their
sections, so they have no repaint problem to solve. Only the two `z-index: -1`
lines benefit.

## State before the change (what "rolled back" means)

Webflow site `6a962b118007b0241d50a7a2`, Home page `6a962b148007b0241d50a84c`.
Both lines are Webflow classes (not embed CSS). Properties read from the
Designer API on 2026-09-19 before editing:

`.ecosystem_line` (style id `c6a9f158-b213-1049-b486-c27b1ce06850`)

| Breakpoint | Properties |
| --- | --- |
| base / main | `position: absolute; left: 0px; top: 0px; z-index: -1; width: 100%; height: 100%; pointer-events: none` |
| small | `display: none` |

`.impact-collab_line` (style id `6410613d-ea53-1376-3b92-9065e6c23a74`)

| Breakpoint | Properties |
| --- | --- |
| base / main | `position: absolute; left: 0px; top: 0px; z-index: -1; width: 100%; height: 100%; pointer-events: none` |
| small | `display: none` |

Neither class has `will-change`, `contain`, `transform`, or `isolation` set on
any breakpoint or pseudo state.

Markup, unchanged by this work, for reference:

```html
<div aria-hidden="true" data-draw-scroll-wrap="" data-draw-scroll-start="clamp(top 70%)"
     data-draw-scroll-end="clamp(bottom 50%)" class="ecosystem_line">
  <svg viewBox="0 0 1440 1200" width="100%" preserveAspectRatio="none" data-draw-scroll-desktop="">…</svg>
</div>

<div aria-hidden="true" data-draw-scroll-wrap="" data-draw-scroll-start="clamp(top 70%)"
     data-draw-scroll-end="clamp(bottom 50%)" class="impact-collab_line">
  <svg viewBox="0 0 1440 832" width="100%" height="100%" preserveAspectRatio="none" …>…</svg>
</div>
```

Repository mirror (`index.html`, line 145 at `ffd0c98`):

```css
.impact-collab_line{position:absolute;inset:0;z-index:-1;width:100%;height:100%;pointer-events:none}
```

`.ecosystem_line` has no rule in `index.html`; it is a Webflow class only.

## The change

Add one declaration to the **base** breakpoint of each class. Nothing else
moves — no markup, no attributes, no other breakpoints, no repo JS.

| Class | Add |
| --- | --- |
| `.ecosystem_line` | `will-change: transform` |
| `.impact-collab_line` | `will-change: transform` |

Preferred route: `data_style_tool › update_style` on each class with
`properties: [{ property_name: "will-change", property_value: "transform" }]`.
If the Designer API rejects `will-change` as a property name, the fallback is
one rule in the Home page's `.page-style` embed
(element `c6d0cc06-0915-0498-4245-49fde0e61865`):

```css
.ecosystem_line,.impact-collab_line{will-change:transform} /* own compositor layer: the scrubbed stroke-dasharray no longer repaints the section above it */
```

`index.html` mirrors whichever route was taken. The API accepted `will-change`, so the class route was used (2026-09-19).

## Rollback

Targeted (undoes only this change):

1. Webflow — `data_style_tool › update_style` for `ecosystem_line` and
   `impact-collab_line` with `remove_properties: ["will-change"]`, or in the
   Designer select each class, open the Style panel, and clear
   `will-change` from the base breakpoint. If the embed fallback was used
   instead, delete the one-line rule from the `.page-style` embed.
2. Publish to `avpn-25-26.webflow.io`.
3. Repository — revert the `index.html` mirror line and merge.

Full (everything after the checkpoint):

1. Site settings → Backups → `checkpoint save - 8/19 - before fps improvements`
   → Restore.
2. Publish to `avpn-25-26.webflow.io`.

## Verifying either direction

Scripted, in the page console on the published staging page with DevTools CPU
throttling at 4×; scroll each section top-to-bottom over ~3 s and sample
`requestAnimationFrame` deltas. Pass: average ≤ 9 ms and no more than a
handful of frames over 17 ms for Ecosystem and ImpactCollab; Signature Events,
Programmes Overview, Members and Markets unchanged from their baseline
(avg 8.3–8.6 ms).
