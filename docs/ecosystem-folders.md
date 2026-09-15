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

The future Webflow build needs the same namespaced attributes, the two folder
roots, the cream folder SVG/panel artwork, the publication links, and the
page-style CSS mirror. Webflow owns the classes, copy, links, and responsive
layout; this repository owns only the attribute-driven interaction and bundle.
