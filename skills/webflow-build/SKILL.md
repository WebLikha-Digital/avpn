# Webflow Build

How Claude builds or edits a section in the AVPN Webflow site (Designer or MCP).
Use it for every Webflow-only task and the Webflow half of a mixed task, before
`skills/webflow-animation-embed/SKILL.md` covers the code that binds to it.

Figma is the reference for layout, content, and structure. It is **not** the source
of colour, type, or spacing values — the site's design system is.

## Rules

1. **Spacing comes from the `Spacing` variable collection.** Pick the nearest
   `space/N` (8/12/16/24/32/40/48/64px, fluid) or `section-space/*`
   (`none`, `small`, `main`, `large`, `page-top`) to the Figma measurement. Never
   copy a Figma pixel value into a class or an embed. The one exception is an
   **absolute element** — a positioned overlay, decor line, arc, hub, or canvas whose
   offset is geometry, not rhythm (e.g. `.markets_line { top: -97.5px }`,
   `.testimonials_orbit`); those keep exact values, in the section's `*-css` embed.
2. **Colours come from the `primitives` collection** (`Brand/Primary/*`,
   `Brand/Secondary/*`, `Brand/Neutral/*`, `Colors/*`, `Opacity/*`) as much as
   possible. Match the Figma swatch to the nearest variable; if no variable is close
   (e.g. the Figma "Decor/Line" `#D9D1B4`), use the raw value only on that element
   and say so in the PR. Never bake a hex into a class when a variable exists.
3. **Type uses the font system, not per-class font properties.** A text class gets
   its family, size, weight, line-height, and letter-spacing by setting the
   `Text Style` collection mode (`Display`, `H1`–`H6`, `Text Large`, `Text Small`,
   base) — the only type decision a class makes is *which mode*. Do not set
   `font-family`, `font-size`, `font-weight`, or `line-height` on a class unless the
   mode cannot express it; then bind the property to a `Typography` variable
   (`font/primary-family`, `font/secondary-family`, `font/*-bold`,
   `font-size/text-*`, `line-height/*`), never a literal.
4. **No margins on heading or paragraph elements.** The gap between a heading and
   its subheading or body lives on the wrapper (`row-gap` / `grid-row-gap` bound to a
   `space/N` variable, or a `margin-bottom` utility). Text classes carry no margins.
5. **Embeds keep only what the Designer cannot express** — custom properties,
   `calc()`/`min()`/`max()`, attribute states, `nth-child`, media queries, canvas
   fallbacks. Inside an embed, reference variables by CSS name
   (`var(--_spacing---space--4-24px)`, `var(--_typography---font-size--text-main)`,
   `var(--_primitives---brand--primary--navy-main)`), not by value. Never put the
   same declaration on a class and in the embed.
6. **Structure follows the site's Client-First pattern**: `section_<name>` >
   `padding-global` > `container-*` > `<name>_*` classes; combo classes `is-*` for
   variants; state in `data-*` attributes, never in class names the JS reads.

## Doing it through the MCP

- Read the collections first: `data_variable_tool > get_variables` on `primitives`
  (`collection-0220e3ad-eb86-03ea-3026-8a5979301dd2`), `Typography`
  (`collection-3c6a4911-12c4-e415-7fe0-514cefa2d46d`), and `Spacing`
  (`collection-c72929d1-2acf-47e4-e3f9-d477c4baae7c`). `Text Style` is
  `collection-555670fb-9781-897d-63fe-bd3e23b3e015`; its modes are listed by
  `get_variable_collections`.
- Bind with `variable_as_value: "<variable id>"` in `create_style` / `update_style`,
  and set type with `set_style_variable_mode { style_name, variable_collection_id:
  <Text Style>, mode_id }`. Reference classes that already do it right:
  `ecosystem_heading` (H3 mode, no margins), `sig-events_card-desc` (Text Large mode
  + `font-size` variable), `section_testimonials` (`section-space/main` padding).
- The WHTML builder's `css` parameter only takes literals. Use it for layout
  (display, position, flex, sizes) and then rebind colour, type, and spacing with
  `update_style` before publishing — or create the classes with `create_style` and
  variables first and reference them from the markup.
- Verify on the published staging page (`avpn-25-26.webflow.io`), not the canvas:
  computed `font-size`/`line-height` should match the mode, and `getComputedStyle`
  colours should resolve to variable values.

## Review

A Webflow-only change still gets an inline self-review against these six rules
before the PR that mirrors it into `index.html` is opened. A class with a literal
colour, a literal font property, a Figma pixel margin, or a margin on a text element
is a finding.
