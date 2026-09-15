# Ecosystem slider

The ecosystem radial slider is initialized from [data-radial-slider-init].
The injected [data-radial-slider-proxy] remains the rotation target used by
the controls, keyboard navigation, and card-centering logic.

## Index and autoplay

An optional [data-radial-slider-index] element inside the slider root is updated
on every render as a zero-padded `current/total` readout, such as `01/19`.
Both values count the original cards; generated clones are excluded.

After the slider is revealed, autoplay advances one card every
`AUTOPLAY_INTERVAL` milliseconds (4000 by default). It pauses while the root is
hovered or focused, while its tab panel is hidden, and while the document is
hidden. Manual navigation restarts the full interval. Users with
`prefers-reduced-motion: reduce` do not get autoplay.

## Drag

Drag and swipe are on (ENABLE_DRAG in src/animations/ecosystemSlider.js).
To turn them off, set the flag to false, run npm run build, and redeploy
dist/animations.min.js. The Webflow embed keeps the
[data-radial-slider-drag-status] grab/grabbing cursor rules either way.

## Card hover

Hover styling lives in the page-style embed, not in JS. It scales the thumb
image, deepens the card shadow, and underlines the title. It never sets the
card's transform or opacity, because the slider writes rotation inline and the
reveal animates opacity/y. The rules are scoped to
[data-radial-slider-drag-status="grab"], so nothing changes while a drag is in
progress (the slider sets the status to "grabbing" on press).
