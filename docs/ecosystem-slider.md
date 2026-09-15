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

## Re-enable drag

Set ENABLE_DRAG to true in src/animations/ecosystemSlider.js, run
npm run build, and redeploy dist/animations.min.js. The Webflow embed keeps
the [data-radial-slider-drag-status] grab/grabbing cursor rules, so no
Webflow-side change is needed.

## Cursor marquee DOM contract

The ecosystem section carries [data-cursor-marquee-init] and contains one
[data-cursor-marquee-status] element. Its descendant
[data-cursor-marquee-text-target] elements receive the text from the
data-cursor-marquee-text attribute on hovered cards. The status is idle
outside the section, not-active over other section content, and active over
a matching card. The cursor is pointer-events-free and fixed-positioned, so it
can overlay cards without changing hit-testing.
