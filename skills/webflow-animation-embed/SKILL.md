# Webflow Animation Embed

Use this when adding, changing, or shipping animation code from this repo into the
AVPN Webflow site.

## Context

- Webflow owns layout, styling, and native Interactions. This repo only owns JS for
  motion that Webflow's Designer can't express (scroll-driven sequences, custom
  easing/staggers, draggable/inertia sliders, anything needing GSAP).
- No CMS is in play — every page is static in Webflow, so there's no templating step
  between this repo and the live site.
- Each animated component is tagged in the Webflow Designer with a namespaced
  `data-<component>-*` attribute set (Element Settings → custom attributes). No
  Webflow classes or IDs are required by the script.

## Component convention

Every non-trivial animation is one self-contained `init<Component>()` function, not
a small helper module. Follow this shape:

1. **Global setup at module scope, once.** `gsap.registerPlugin(...)` and any
   `CustomEase.create(...)` calls go at the top of the file, outside any function —
   they're side effects that only need to run once, not per init call.

2. **One function drives every instance on the page.**
   `document.querySelectorAll('[data-<component>-init]').forEach(container => {...})`
   inside `init<Component>()` — never assume a singleton. This is also what makes
   the function safely re-callable (e.g. from a resize handler).

3. **Idempotent re-init guard, first thing inside the loop.** Before building
   anything, tear down previous state: kill old tweens/draggables stored on the
   element (`container._xyzInstance?.kill()`), disconnect old observers,
   `clearProps` on transformed elements, remove generated clones. State lives on
   the DOM node itself (`container._camelCasedProp`), not a module-level `Map` —
   this keeps multiple instances independent and colocates cleanup with setup.

4. **Early-return on missing markup**, not thrown errors —
   `if (!requiredChild) return;` so one broken instance doesn't break the page.

5. **Tunables come from CSS custom properties on the container** (e.g.
   `--slider-curve`), not hardcoded JS constants, wherever whoever owns the
   Designer/CSS should be able to adjust behavior without touching this repo.

6. **The entire DOM contract is namespaced `data-<component>-*` attributes** — init
   hook, sub-elements, controls, status flags. Never rely on Webflow-generated
   class names; they change whenever someone edits the Designer.

7. **Resize handling, if needed, is self-deduping.** Stash the debounced listener
   on the init function itself (e.g. `initX._resize`), remove the old one before
   adding a new one, and only fire on actual width change (ignore mobile
   viewport-height jitter from URL bar show/hide).

8. **Accessibility is set programmatically** (ARIA roles/labels/`aria-current`)
   since Webflow's Designer doesn't give a clean way to author these — set them in
   the same pass that builds the component.

9. **Define, then invoke.** The full function body comes first; the only call site
   is a single `document.addEventListener('DOMContentLoaded', () => init<Component>())`
   at the bottom of the file. Don't invoke inline where it's defined — keep
   declaration and execution visually separate so the file reads top-to-bottom as
   spec-then-run.

10. **Prioritize a ticker callback that something else reads.** If a component writes
    per-frame state that a ScrollTrigger then reads — the horizontal band writing
    `viewport.scrollLeft` for the triggers scoped to it is the case in this repo — add
    it with the prioritize flag:

    ```js
    gsap.ticker.add(render, false, true);
    ```

    Plain `gsap.ticker.add(render)` appends to the tail of the queue. That is fine on
    first load, but a re-init removes the callback and re-adds it *behind* ScrollTrigger's
    own ticker listener, which is registered once and never moves. The read then happens
    before the write and every dependent trigger runs one frame stale — invisible while
    the page is still, a few-pixel shimmy while it scrolls. Anything that re-initializes
    on resize is exposed to this.

## Steps

1. Add or edit a component file in `src/animations/`, following the convention
   above, keyed off its own `data-<component>-init` attribute.
2. Wire it up in `src/index.js` (import + call its init function on
   `DOMContentLoaded`, or let the component call itself if it's self-invoking).
3. Add a preview block with the matching `data-*` attributes to `index.html`,
   then `npm run dev` for a fast local preview with HMR; `npm run build` for the
   final bundle.
4. Commit the updated `dist/animations.min.js` — it's the deliverable, not an
   artifact to gitignore.
5. Wire the bundle into Webflow — see "Local dev against Webflow" below.
6. In the Webflow Designer, add the matching `data-<component>-*` attributes to
   whichever elements make up that component, then Publish.

## Local dev against Webflow

`npm run webflow` rebuilds `dist/` on save and serves it at
`http://localhost:4173/animations.min.js`. The AVPN site's footer custom code
already points there, so the loop is: save → refresh the published page.

Publish **once** after the script tag is added; after that, JS changes need no
republish. Custom code doesn't run in the Designer canvas, so test against
`avpn-25-26.webflow.io`, not Designer preview.

Two traps worth knowing:

- **Don't serve `dist/` with `npm run dev`.** Vite's dev server rewrites JS under
  the project root — the bundle comes back ~3.4MB of transformed modules instead
  of the 638KB that ships. `npm run webflow` serves it statically instead.
- **Safari blocks this; Chrome and Firefox don't.** An `https://` page loading
  `http://localhost` is allowed only because localhost is a potentially-trustworthy
  origin, and Safari doesn't grant that exemption.

For production, register a hosted script with an SRI hash against a versioned CDN
URL. That's why dev uses freeform footer code instead: Webflow's registered-script
API requires the hash, which would change on every rebuild.

## Constraints

- Keep it lean: one file per component, no framework, no build step beyond esbuild.
- Don't rely on Webflow-generated class names — data attributes are the stable
  contract between Webflow and this repo.
- Prefer state on the DOM node over module-level state, so components stay
  independently re-initializable.
