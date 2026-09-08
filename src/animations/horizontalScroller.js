import { gsap, ScrollTrigger } from "../lib/gsap.js";

// Below this width the band is left alone: the viewport keeps its natural
// height, nothing is pinned, and the panels stack however Webflow's mobile
// breakpoint lays them out. Overridable per instance with
// [data-hscroll-min-width].
const DEFAULT_MIN_WIDTH = 768;

// Fired on window after a width change has rebuilt every band. Components that
// live inside one rebuild on it.
export const HSCROLL_REBUILT = "hscroll:rebuilt";

/**
 * A horizontal scroll band inside an otherwise vertical page.
 *
 * The band is a real horizontal scroll container, not a translated track. The
 * outer element is given a height equal to the track's horizontal overflow, a
 * `position: sticky` child holds a viewport-sized window over the track, and
 * every frame the viewport's `scrollLeft` is set to how far the page has
 * scrolled into the band. Vertical distance in, horizontal distance out, 1:1.
 *
 * Why a real scroller rather than `gsap.to(track, { x: -distance })` with
 * `containerAnimation`: a genuine scroll position means anything inside the
 * band is driven by an ordinary ScrollTrigger with `scroller` pointed at the
 * viewport and `horizontal: true` — including `pin`, which `containerAnimation`
 * cannot do. That is what lets [data-rotary-wheel-init] park the band and run a
 * nested sequence before horizontal motion resumes. Use `horizontalScrollerFor`
 * to find the scroller from a component nested inside one.
 *
 * The smoothing is Locomotive's, not ours. Lenis already eases `window.scrollY`,
 * so this reads an eased number and passes it straight through; adding a second
 * lerp here would just make the band lag the rest of the page.
 *
 * Webflow contract:
 *   [data-hscroll-init]       outer element — its height is written by JS
 *   [data-hscroll-viewport]   sticky window over the track (see CSS below)
 *   [data-hscroll-track]      flex row of panels, wider than the viewport
 *
 * These three rules have to exist in CSS — they are structural, not styling,
 * and the Designer can't express `sticky` + `max-content` cleanly:
 *
 *   [data-hscroll-viewport] { position: sticky; top: 0; height: 100vh;
 *                             overflow: hidden; }
 *   [data-hscroll-track]    { display: flex; flex-wrap: nowrap;
 *                             width: max-content; height: 100%; }
 *
 * `overflow: hidden` rather than `auto` is deliberate. An element with hidden
 * overflow is still scrollable programmatically, so `scrollLeft` and
 * ScrollTrigger both work — but a trackpad swipe can no longer scroll it
 * directly, which would desync it from the page position that is supposed to be
 * its only input.
 *
 * While the band is active it carries [data-hscroll-active] so CSS can key the
 * desktop-only layout off the same signal the script uses.
 */
export function initHorizontalScroller() {
  document.querySelectorAll("[data-hscroll-init]").forEach((wrap) => {
    // Idempotent re-init: unhook the previous ticker and refresh handlers and
    // put the element back on its CSS-defined height before measuring again.
    teardown(wrap);

    const viewport = wrap.querySelector("[data-hscroll-viewport]");
    const track = wrap.querySelector("[data-hscroll-track]");
    if (!viewport || !track) return;

    const minWidth =
      Number.parseFloat(wrap.dataset.hscrollMinWidth) || DEFAULT_MIN_WIDTH;
    if (window.innerWidth < minWidth) return;

    // Distance the track overflows its window, and where in the document the
    // band begins. Both are re-read on every refresh: panel widths depend on
    // fonts and images, and `start` moves whenever anything above the band
    // changes height.
    let distance = 0;
    let start = 0;

    const measure = () => {
      // Order matters. `teardown` blanks the inline height, so on a rebuild the
      // band contributes nothing to the page until this runs — on a tall band
      // that collapses the document by thousands of pixels, and the browser
      // clamps `window.scrollY` to the shorter page. A position read taken in
      // that state is measured against the clamped offset, and the wrong
      // `start` survives the height being restored a line later. Growing the
      // page back first is safe (a taller document never clamps scroll), so
      // the height goes on before anything positional is read.
      //
      // `distance` is independent of the wrap's own height, so it can be read
      // either side of that.
      distance = Math.max(0, track.scrollWidth - viewport.clientWidth);
      // The band owns exactly as much page as it needs to travel, plus the one
      // viewport height its sticky child occupies while it is parked.
      wrap.style.height = `${distance + viewport.offsetHeight}px`;
      // getBoundingClientRect + scrollY rather than offsetTop, which is
      // relative to the offset parent and silently wrong as soon as an ancestor
      // is positioned.
      start = wrap.getBoundingClientRect().top + window.scrollY;
    };

    // Written on ScrollTrigger's refreshInit, which runs before any trigger
    // measures, so every other component on the page measures against the
    // final document height instead of one refresh behind it.
    const onRefreshInit = () => measure();

    let lastLeft = -1;
    const render = () => {
      const left = Math.min(distance, Math.max(0, window.scrollY - start));
      // Rounded and compared before writing: sub-pixel churn would fire a
      // scroll event on the viewport every frame, and every ScrollTrigger
      // bound to it would recompute for nothing.
      const next = Math.round(left);
      if (next === lastLeft) return;
      lastLeft = next;
      viewport.scrollLeft = next;
    };

    measure();
    ScrollTrigger.addEventListener("refreshInit", onRefreshInit);
    // Prioritized, so this callback sits at the head of the ticker queue and
    // always writes `scrollLeft` before ScrollTrigger reads it. Without the
    // flag the order silently inverts on a rebuild: `teardown` removes this
    // callback and init re-adds it at the tail, behind ScrollTrigger's own
    // ticker listener, which was registered once and never moves. Everything
    // pinned to this scroller then renders from the previous frame's
    // `scrollLeft` — measured as `WT` on every frame after a resize where a
    // fresh load gives `TW`, which reads as a few-pixel shimmy while the page
    // is moving and disappears the moment it stops.
    gsap.ticker.add(render, false, true);
    wrap.setAttribute("data-hscroll-active", "");

    wrap._horizontalScroller = { viewport, track, render, onRefreshInit };
    render();
  });

  watchResize();
}

/**
 * The scroll container a nested component should hand ScrollTrigger, or null if
 * the element isn't inside an active band. Components inside a band pair this
 * with `horizontal: true` and `start`/`end` written in horizontal terms
 * ("left right", "right left").
 */
export function horizontalScrollerFor(element) {
  const wrap = element.closest("[data-hscroll-init][data-hscroll-active]");
  return wrap?._horizontalScroller?.viewport ?? null;
}

/**
 * ScrollTrigger vars that redirect a nested component onto its band, or null
 * when the element isn't inside one. Spread it last into a scrollTrigger
 * config; outside a band it contributes nothing, so behaviour on the rest of
 * the site is unchanged.
 *
 *   const band = bandContext(wrap);
 *   scrollTrigger: { trigger, start, end, scrub: true, ...band }
 *
 * Start/end strings still have to be written in the matching axis — a vertical
 * "top center" inside a band will never resolve, because the panel never moves
 * vertically. Components pick their own default per axis.
 */
export function bandContext(element) {
  const scroller = horizontalScrollerFor(element);
  return scroller ? { scroller, horizontal: true } : null;
}

function teardown(wrap) {
  const previous = wrap._horizontalScroller;
  if (!previous) return;

  gsap.ticker.remove(previous.render);
  ScrollTrigger.removeEventListener("refreshInit", previous.onRefreshInit);
  previous.viewport.scrollLeft = 0;
  wrap.style.height = "";
  wrap.removeAttribute("data-hscroll-active");
  wrap._horizontalScroller = null;
}

// Width-only, and stashed on the function so repeated init calls never stack
// listeners. Mobile browsers fire resize on every URL-bar show/hide; rebuilding
// the band mid-scroll because the viewport got 60px taller would be visible.
function watchResize() {
  if (initHorizontalScroller._resize) {
    window.removeEventListener("resize", initHorizontalScroller._resize);
  }

  let lastWidth = window.innerWidth;
  let timer;

  const onResize = () => {
    if (window.innerWidth === lastWidth) return;
    lastWidth = window.innerWidth;
    // The layout has already changed, and the ticker keeps writing scrollLeft
    // every frame. Refreshing now re-measures each band and every trigger bound
    // to one — including the pins inside them, which otherwise hold offsets
    // from the old width for the whole debounce and drag their pinned element
    // visibly out of place. The full teardown/re-init below stays debounced;
    // this only re-measures what is already built.
    ScrollTrigger.refresh();
    clearTimeout(timer);
    timer = setTimeout(() => {
      initHorizontalScroller();
      // Anything pinned inside a band has just had its scroller torn down and
      // rebuilt, and below [data-hscroll-min-width] there is no band left to
      // pin against at all. Nested components listen for this and rebuild
      // themselves, so the dependency stays one-way.
      window.dispatchEvent(new CustomEvent(HSCROLL_REBUILT));
      ScrollTrigger.refresh();
    }, 200);
  };

  initHorizontalScroller._resize = onResize;
  window.addEventListener("resize", onResize);
}
