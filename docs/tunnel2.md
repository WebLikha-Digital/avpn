# Tunnel 2 — dev notes

An infinite solid-image corridor rendered with three.js. Every segment can
carry an image panel on the floor, ceiling, and both walls; there is no
wireframe layer. The component lives in `src/canvas/tunnel2.js` and initializes
from `[data-tunnel2-init]`.

This is a separate visual variant of [`tunnel.md`](tunnel.md). Do not change
`src/canvas/tunnel.js` when tuning this component.

## Webflow setup

The mount is an empty `div` with an explicit CSS size. Put the image manifest
inside it:

```html
<div class="hero_tunnel" data-tunnel2-init="true">
  <div data-tunnel2-images="true">
    <img src="..." data-tunnel2-surface="left" alt="">
    <img src="..." data-tunnel2-surface="right" alt="">
    <img src="..." data-tunnel2-surface="top" alt="">
    <img src="..." data-tunnel2-surface="bottom" alt="">
  </div>
</div>
```

The mount must be a `div`, not a `<canvas>`: the component creates and owns the
canvas, and needs to remove/rebuild it if WebGL context recovery is required.
The mount or an ancestor should be positioned so the hidden manifest has a
stable containing block.

The script hides the manifest itself and changes its images to eager loading.
Do not set `[data-tunnel2-images]` to `display: none`; that can prevent lazy
images from resolving a usable `currentSrc`.

Each manifest image may set `data-tunnel2-surface` to `left`, `right`, `top`, or
`bottom` (the value is trimmed and case-insensitive). Tagged images are used only
on that corridor surface. Images without the attribute or with an unrecognised
value are unassigned and are eligible for every surface. Each surface uses its
eligible images in manifest order and cycles `1 → 2 → … → N → 1` independently across
recycled segments. A surface with no eligible images simply has no tiles.

The live AVPN page is `https://avpn-25-26.webflow.io/`. Custom code does not run
inside the Webflow Designer canvas, so test on the published page or with the
local preview.

## Images and alignment

Images are cover-fitted to the final panel geometry. They keep their original
proportions and are cropped at the centre when the source and panel ratios do
not match; they are never stretched. Each tile calculates its own UV crop, so
the inset and configured grid dimensions cannot distort the image.

Texture color space is sRGB. Mipmaps and anisotropic filtering improve clarity
on panels receding into the tunnel. Final sharpness is still limited by the
resolution of the source asset: use sufficiently large Webflow images for
panels that appear near the camera.

The configured inset is applied consistently to all panels. A panel is also
shortened along its shared edge by the same inset, preserving a clean, aligned
corner seam and preventing floor/wall intersections. The configured `gap` is
then applied by the tile geometry on every edge. Apparent gaps become smaller
with distance because of perspective; that is expected. Uneven gaps at the
same corridor depth indicate a geometry or configuration problem.

## Tunable attributes

All attributes are optional. Invalid or missing values use the defaults below.

| Attribute | Default | Description |
|---|---:|---|
| `data-tunnel2-surface` (on manifest images) | unassigned | `left`, `right`, `top`, or `bottom`; tagged images stay on that surface. Missing or unrecognised values are eligible for every surface, in manifest order. |
| `data-tunnel2-width` | `24` | Corridor width in world units. It is automatically widened to match a wider mount. |
| `data-tunnel2-height` | `15` | Corridor height in world units. |
| `data-tunnel2-cols` | `1` | Floor and ceiling panels across each segment. |
| `data-tunnel2-rows` | `1` | Wall panels stacked vertically in each segment. |
| `data-tunnel2-bg` | `transparent` | Background color, or `none`/`transparent`. |
| `data-tunnel2-haze` | `#ffffff` | Fog and far-end cap color. |
| `data-tunnel2-fog-near` | `12` | Distance where the haze begins. |
| `data-tunnel2-fog-far` | `78` | Distance where the haze becomes total. |
| `data-tunnel2-image-opacity` | `1` | Final panel opacity. |
| `data-tunnel2-gap` | `0.35` | White seam on each panel edge, in world units. |
| `data-tunnel2-depth-fill` | `0.72` | Panel depth as a share of the six-unit segment. |
| `data-tunnel2-fill-rate` | `1` | Chance that each surface cell receives a panel, from `0` to `1`. |
| `data-tunnel2-inset` | `1.4` | Consistent distance panels float inward from the corridor surface. |
| `data-tunnel2-speed` | `3.5` | Camera travel speed in world units per second. |
| `data-tunnel2-fov` | `50` | Camera field of view. |

The tile meshes expose a test-only, read-only hook at `mount.__tunnel2.scene`.
Walk meshes named `tile` to inspect `userData.surface`, `userData.sourceIndex`
(the index in the shared loaded texture pool), and `userData.url`.

For a full, regular image room:

```html
<div data-tunnel2-init="true"
  data-tunnel2-cols="1"
  data-tunnel2-rows="1"
  data-tunnel2-fill-rate="1"
  data-tunnel2-gap="0.35"
  data-tunnel2-inset="1.4">
  <div data-tunnel2-images="true">
    <!-- Webflow image elements go here. -->
  </div>
</div>
```

Increasing `cols` or `rows` creates smaller panels. Keep `inset` modest when
using many small cells; the code enforces a minimum valid tile size, but a
large inset leaves very little artwork visible.

## Local development

The demo block is in `index.html` under the `data-tunnel2-init` attribute. It
uses inline SVG images so the component can be previewed without Webflow
assets.

```sh
npm run dev     # preview index.html
npm run build   # rebuild dist/animations.min.js
npm run webflow # serve the bundle for the published Webflow page
```

`npm run webflow` serves `dist/` at `http://localhost:4173/animations.min.js`.
Refresh the published AVPN page after saving source changes. No Webflow change
or republish is needed for JavaScript-only iteration once the footer script is
already wired.

## How it works

- Twelve six-unit segments form the infinite corridor.
- Each segment is populated with one panel per selected surface cell.
- Segments recycle behind the camera and receive a new image assignment.
- Images load once into a per-instance texture pool.
- Each panel receives a lightweight texture clone with a crop calculated from
  its final width and height.
- The far end uses a haze-colored cap and fog rather than a visible hard stop.
- Rendering pauses off-screen, responds to container resize, handles WebGL
  context restoration, disposes GPU resources on teardown, and renders one
  static frame for reduced-motion users.

## Troubleshooting

| Symptom | Likely cause |
|---|---|
| No images, only haze | The manifest is missing, empty, hidden with `display: none`, or its assets failed to load. |
| Images look stretched | Confirm the page is using the rebuilt `tunnel2.js` bundle; current code cover-fits against each tile’s final geometry. |
| Images look soft | Use higher-resolution source assets; confirm the browser is loading the intended `currentSrc`. Distant panels are also reduced by perspective and fog. |
| Corner gaps are uneven | Use a consistent `data-tunnel2-inset`; current code applies one inset to all panels in a segment and clears the shared edges. |
| Gaps look different at different depths | This is normal perspective projection. Compare panels at the same depth before treating it as a layout issue. |
| Nothing renders | The mount has no CSS height, WebGL is unavailable, or the authored mount is a `<canvas>` instead of a `div`. |
| Live page looks unchanged | Rebuild the bundle, make sure the Webflow footer points to the local/hosted bundle being tested, then refresh the published page. |
