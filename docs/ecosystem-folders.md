# Ecosystem folders

The sandbox ecosystem section uses `[data-folders-init]` to coordinate two
publication decks. Each direct child `[data-deck-init="learn|voice"]` owns one
folder and its links. The folder shell is `[data-deck-folder]`; its panel,
count, metadata, viewport, track, cards, hint, and collapse control are marked
with `[data-deck-panel]`, `[data-deck-count]`, `[data-deck-meta]`,
`[data-deck-viewport]`, `[data-deck-track]`, `[data-deck-card]`,
`[data-deck-hint]`, and `[data-deck-collapse]` respectively.

The group writes `data-folders-state="stacked|expanding|expanded|collapsing"`
and `data-folders-active`. A deck writes `data-deck-state="stacked|expanding|
expanded|collapsing"`. Stacked cards are absolute and fanned; expansion uses
GSAP Flip to move them into a flex row, then a ticker translates the row modulo
one original set width. Clones are decorative and marked `[data-deck-clone]`.

Tunables live on the deck root: `--deck-fan` controls the maximum stacked
rotation (degrees), and `--deck-speed` controls marquee speed in pixels per
second. The default speed is 60. A reduced-motion preference skips Flip and
the ticker and leaves the expanded viewport natively horizontally scrollable.
Resize relayout is debounced and only responds to width changes.

Folder intros use the existing `data-split="heading"` masked line reveal. On
every completed collapse, the group dispatches a bubbling
`ecosystemfolders:collapsed` event with the collapsed deck id in `detail.id`.
`splitReveal.js` listens once per group and replays the reveal for each visible
folder intro after both decks have returned to the stacked layout.

## Drag

In the expanded state, the viewport owns a proxy `Draggable` with `type: "x"`
and inertia enabled. Drag deltas update the same wrapped `deck.offset` used by
the marquee ticker, so the row has no edges or snap points. `--deck-speed`
continues to control autoplay; pressing pauses autoplay through the inertia
throw, then playback resumes when the throw settles. A movement of four pixels
or more suppresses the link click that follows the drag. Reduced-motion users
do not receive a Draggable or inertia and keep the native horizontal scroller.

The future Webflow build needs the same namespaced attributes, the two folder
roots, the cream folder SVG/panel artwork, the publication links, and the
page-style CSS mirror. Webflow owns the classes, copy, links, and responsive
layout; this repository owns only the attribute-driven interaction and bundle.
