import { DrawSVGPlugin, SplitText, gsap, ScrollTrigger } from "../lib/gsap.js";
import { bandContext } from "./horizontalScroller.js";

const LINE_REVEAL_DURATION = 0.8;
const PIN_DURATION = 0.6;
const IMAGE_DURATION = 0.8;
const PILL_DURATION = 0.8;
const TEXT_DURATION = 0.8;
const CONTENT_DURATION = 0.8;
const LINE_EASE = "power2.out";
const PIN_EASE = "expo.out";
const IMAGE_EASE = "expo.out";
// Same feel as the rest of the site: contentReveal rises on power4.inOut,
// splitReveal lines on the "smooth" CustomEase from src/lib/gsap.js.
const CONTENT_EASE = "power4.inOut";
const TEXT_EASE = "smooth";

const STEP_OFFSETS = {
  pin: 0,
  image: 0.15,
  pill: 0.5,
  heading: 0.6,
  date: 0.7,
  desc: 0.8,
  button: 0.9,
};

/**
 * The Signature Events band owns one clock for its line and cards. The line's
 * single-path budget is the revealed lead plus the live horizontal scroll
 * position; the same budget decides when each card's one-shot timeline starts.
 */
export function initSignatureEvents() {
  document.querySelectorAll("[data-sig-events]").forEach((section) => {
    teardown(section);

    const viewport = section.querySelector("[data-hscroll-viewport]");
    const line = section.querySelector("[data-sig-events-line]");
    const path = line?.querySelector("[data-sig-events-line-path]");
    if (!viewport || !line || !path) return;
    if (!line.closest("[data-hscroll-track]")) {
      console.warn("[signatureEvents] line must be inside [data-hscroll-track]");
      return;
    }

    const cards = [...section.querySelectorAll(".sig-events_card")];
    const reducedMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;
    const instance = {
      viewport,
      line,
      path,
      cards: [],
      cardTriggers: [],
      active: false,
      reveal: 0,
      pin: null,
      render: null,
      measure: null,
      trigger: null,
      measurements: { scale: 1, screenPathLength: 0, leadPx: 0, curvePx: 0, maxBudget: 0 },
    };
    section._signatureEvents = instance;

    // Read the band context so this module only treats an active horizontal
    // scroller as the source of horizontal distance. Cards still initialize on
    // the small breakpoint, where horizontalScroller deliberately opts out.
    const band = bandContext(section);
    instance.band = band;

    measureLine(instance);
    instance.measure = () => measureLine(instance);

    if (reducedMotion) {
      setReducedMotionState(instance, cards);
      return;
    }

    const small = isLineHidden(line);
    instance.cards = cards.map((card) => buildCard(card, small));
    measureLine(instance);

    if (!small) {
      gsap.registerPlugin(DrawSVGPlugin);
      gsap.set(path, { drawSVG: "0%" });

      instance.pin = { value: 0 };
      instance.render = () => render(instance);
      gsap.ticker.add(instance.render, false, true);

      instance.trigger = ScrollTrigger.create({
        trigger: section,
        start: "top top",
        once: true,
        onEnter: () => {
          instance.active = true;
          instance.pinTween = gsap.to(instance.pin, {
            value: 1,
            duration: LINE_REVEAL_DURATION,
            ease: LINE_EASE,
            onUpdate: instance.render,
          });
        },
        onRefresh: instance.measure,
      });
    } else {
      // The line and pins are display:none on small. Each card gets its own
      // window trigger because there is no horizontal budget to drive it.
      instance.cardTriggers = instance.cards.map((card) => ScrollTrigger.create({
        trigger: card.card,
        start: "top 80%",
        once: true,
        onEnter: () => playCard(card),
      }));
    }

    if (small) {
      gsap.set(path, { drawSVG: "100%" });
    }
  });
}

function buildCard(card, small) {
  const pin = card.querySelector("[data-sig-events-pin]");
  const image = card.querySelector(".signature-events_image");
  const pill = card.querySelector("[data-sig-events-pill]");
  const heading = card.querySelector("[data-sig-events-heading]");
  const date = card.querySelector("[data-sig-events-date]");
  const desc = card.querySelector("[data-sig-events-desc]");
  const button = card.querySelector("[data-button]");
  const entry = { card, pin, timeline: null, splits: [], lineTweens: [], played: false, pinCentreX: 0 };
  // autoSplit rebuilds the .line elements when fonts settle or the width
  // changes, which would strand a parked state and any tween targets on the
  // old nodes. Park (or settle) the fresh lines in onSplit instead, and let
  // the timeline start the line tween against whatever lines exist then.
  const makeSplit = (target) => SplitText.create(target, {
    type: "lines",
    mask: "lines",
    autoSplit: true,
    linesClass: "line",
    onSplit(self) {
      gsap.set(self.lines, { yPercent: entry.played ? 0 : 120 });
    },
  });
  const headingSplit = heading ? makeSplit(heading) : null;
  const dateSplit = date ? makeSplit(date) : null;
  entry.splits = [headingSplit, dateSplit].filter(Boolean);

  if (pin) gsap.set(pin, { clearProps: "transform,opacity" });
  if (image) gsap.set(image, { clearProps: "clipPath" });
  gsap.set([pill, heading, date, desc, button].filter(Boolean), {
    clearProps: "transform,opacity",
  });

  if (!small && pin) {
    gsap.set(pin, {
      scale: 0.4,
      autoAlpha: 0,
      transformOrigin: "50% 100%",
    });
  }
  if (image) gsap.set(image, { clipPath: "inset(100% 0% 0% 0%)" });
  gsap.set([pill, desc, button].filter(Boolean), { y: "2em", autoAlpha: 0 });
  gsap.set([heading, date].filter(Boolean), { autoAlpha: 1 });

  const timeline = gsap.timeline({ paused: true });
  if (!small && pin) {
    timeline.to(pin, {
      scale: 1,
      autoAlpha: 1,
      duration: PIN_DURATION,
      ease: PIN_EASE,
    }, STEP_OFFSETS.pin);
  }
  if (image) {
    timeline.to(image, {
      clipPath: "inset(0% 0% 0% 0%)",
      duration: IMAGE_DURATION,
      ease: IMAGE_EASE,
    }, STEP_OFFSETS.image);
  }
  if (pill) {
    timeline.to(pill, {
      y: 0,
      autoAlpha: 1,
      duration: PILL_DURATION,
      ease: CONTENT_EASE,
    }, STEP_OFFSETS.pill);
  }
  const revealLines = (split) => () => {
    entry.lineTweens.push(gsap.to(split.lines, {
      yPercent: 0,
      duration: TEXT_DURATION,
      ease: TEXT_EASE,
      stagger: 0.08,
    }));
  };
  if (headingSplit) timeline.call(revealLines(headingSplit), null, STEP_OFFSETS.heading);
  if (dateSplit) timeline.call(revealLines(dateSplit), null, STEP_OFFSETS.date);
  if (desc) {
    timeline.to(desc, {
      y: 0,
      autoAlpha: 1,
      duration: CONTENT_DURATION,
      ease: CONTENT_EASE,
    }, STEP_OFFSETS.desc);
  }
  if (button) {
    timeline.to(button, {
      y: 0,
      autoAlpha: 1,
      duration: CONTENT_DURATION,
      ease: CONTENT_EASE,
    }, STEP_OFFSETS.button);
  }

  entry.timeline = timeline;
  return entry;
}

function render(instance) {
  if (!instance.active) return;

  const { leadPx, curvePx, maxBudget, screenPathLength } = instance.measurements;
  const budget = leadPx * instance.pin.value + instance.viewport.scrollLeft;
  // The horizontal run is already measured in screen pixels, so keep its tip
  // 1:1 with the budget. Only remap the curve's remaining budget onto its
  // remaining arc length; when the whole path is reachable, no remap is needed.
  let drawnPx;
  if (budget <= curvePx) {
    drawnPx = budget;
  } else if (maxBudget >= screenPathLength) {
    drawnPx = Math.min(budget, screenPathLength);
  } else {
    drawnPx = curvePx + (budget - curvePx) / Math.max(1, maxBudget - curvePx)
      * (screenPathLength - curvePx);
  }
  drawnPx = clamp(drawnPx, 0, screenPathLength);
  const progress = screenPathLength
    ? clamp(drawnPx / screenPathLength, 0, 1)
    : 0;
  gsap.set(instance.path, { drawSVG: `${progress * 100}%` });

  instance.cards.forEach((card) => {
    if (!card.played && budget >= card.pinCentreX) playCard(card);
  });
}

function measureLine(instance) {
  const lineRect = instance.line.getBoundingClientRect();
  // The non-scaling stroke makes DrawSVG's screen-space length the viewBox
  // length multiplied by the uniform SVG scale. The lead is authored in the
  // same viewBox units, so convert it with that scale before sharing one
  // budget between the path and cards.
  const scale = Math.abs(instance.path.getScreenCTM()?.a || 1);
  const screenPathLength = instance.path.getTotalLength() * scale;
  const lead = Number.parseFloat(instance.line.dataset.sigEventsLineLead) || 0;
  const curve = Number.parseFloat(instance.line.dataset.sigEventsLineCurve) || 0;
  const leadPx = lead * scale;
  const curvePx = curve * scale;
  // The horizontal scroller can reach only the lead plus its overflow. The
  // curve remap below uses this endpoint so the one path settles at scroll end.
  const maxBudget = leadPx + Math.max(
    0,
    instance.viewport.scrollWidth - instance.viewport.clientWidth,
  );
  instance.measurements = {
    scale,
    screenPathLength,
    leadPx,
    curvePx,
    maxBudget,
  };
  instance.cards?.forEach((card) => {
    if (!card.pin) return;
    const pinRect = card.pin.getBoundingClientRect();
    // The line block is inside the same scrolling track as the pin. Its rect
    // moves with the pin, so subtracting the two rects already yields the
    // stable content coordinate; adding scrollLeft would double-count it.
    card.pinCentreX = pinRect.left + pinRect.width / 2 - lineRect.left;
  });
}

function setReducedMotionState(instance, cards) {
  gsap.set(instance.path, { drawSVG: "100%" });
  cards.forEach((card) => {
    const pin = card.querySelector("[data-sig-events-pin]");
    const image = card.querySelector(".signature-events_image");
    const content = card.querySelectorAll(
      "[data-sig-events-pill], [data-sig-events-heading], [data-sig-events-date], [data-sig-events-desc], [data-button]",
    );
    if (pin) gsap.set(pin, { clearProps: "transform,opacity" });
    if (image) gsap.set(image, { clearProps: "clipPath" });
    gsap.set(content, { clearProps: "transform,opacity" });
  });
}

function isLineHidden(line) {
  return getComputedStyle(line).display === "none";
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function teardown(section) {
  const previous = section._signatureEvents;
  if (!previous) return;

  previous.trigger?.kill();
  previous.cardTriggers?.forEach((trigger) => trigger.kill());
  previous.pinTween?.kill();
  if (previous.render) gsap.ticker.remove(previous.render);
  previous.cards?.forEach((card) => {
    card.timeline?.kill();
    card.lineTweens?.forEach((tween) => tween.kill());
    card.splits?.forEach((split) => split.revert());
    gsap.set(card.card, { clearProps: "all" });
  });
  if (previous.path) gsap.set(previous.path, { clearProps: "all" });
  section._signatureEvents = null;
}

function playCard(card) {
  if (card.played) return;
  card.played = true;
  card.timeline.play(0);
}
