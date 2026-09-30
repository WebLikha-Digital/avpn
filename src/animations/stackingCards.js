import { gsap, ScrollTrigger } from "../lib/gsap.js";

const RESIZE_DEBOUNCE = 250;
const ROTATE_FALLBACK = [0, 4, -4];
const X_FALLBACK = ["0em"];
const Y_FALLBACK = ["0em"];

/**
 * Osmo's Stacking Sticky Cards (Bounce), wired to the repository lifecycle.
 *
 * Contract:
 *   [data-stacking-cards-init]                    section/configuration scope
 *   [data-stacking-cards-{desktop,tablet,mobile}] tier enable toggles
 *   [data-stacking-cards-{tier}-{rotate,x,y}]     comma-separated card values
 *   [data-stacking-card]                          sticky trigger card
 *   [data-stacking-card-target]                   transformed card surface
 */
export function initStackingCards() {
  const sections = [...document.querySelectorAll("[data-stacking-cards-init]")];
  if (!sections.length) return;
  sections.forEach(teardown);

  const tier = getViewportTier();
  sections.forEach((section, sectionIndex) => buildSection(section, sectionIndex, tier));

  installResizeListener();
}

function buildSection(section, sectionIndex, tier) {
  if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;

  const enabledAttribute = `data-stacking-cards-${tier}`;
  if (section.getAttribute(enabledAttribute) !== "true") return;

  const cards = [...section.querySelectorAll("[data-stacking-card]")];
  if (!cards.length) return;

  const stickyTop = parseFloat(getComputedStyle(cards[0]).top) || 0;
  const attributeBase = `data-stacking-cards-${tier}`;
  const rotateValues = parseValues(section, `${attributeBase}-rotate`, ROTATE_FALLBACK, true);
  const xValues = parseValues(section, `${attributeBase}-x`, X_FALLBACK);
  const yValues = parseValues(section, `${attributeBase}-y`, Y_FALLBACK);
  const instance = { tweens: [], triggers: [], bounceTimelines: [] };
  section._stackingCardsInstance = instance;

  cards.forEach((card, index) => {
    const target = card.querySelector("[data-stacking-card-target]");
    if (!target) return;

    // Upstream z-index ordering, unchanged.
    gsap.set(target, {
      rotate: 0,
      x: 0,
      y: 0,
      scale: 1,
      zIndex: cards.length - index,
    });

    const tween = gsap.to(target, {
      rotate: rotateValues[index % rotateValues.length],
      x: xValues[index % xValues.length],
      y: yValues[index % yValues.length],
      ease: "power1.in",
      overwrite: "auto",
      scrollTrigger: {
        trigger: card,
        start: "top 75%",
        end: `top-=${stickyTop} top`,
        scrub: true,
      },
    });
    instance.tweens.push(tween);

    const trigger = ScrollTrigger.create({
      trigger: card,
      start: `top-=${stickyTop} top`,
      onEnter: () => {
        const width = target.offsetWidth;
        const height = target.offsetHeight;
        if (!width || !height) return;

        const stretchPx = 1.5 * parseFloat(getComputedStyle(target).fontSize);
        const bounce = gsap.timeline()
          .to(target, {
            scaleX: (width + stretchPx) / width,
            scaleY: (height - stretchPx * 0.33) / height,
            duration: 0.1,
            ease: "power1.out",
          })
          .to(target, {
            scaleX: 1,
            scaleY: 1,
            duration: 1,
            ease: "elastic.out(1, 0.3)",
          });
        instance.bounceTimelines.push(bounce);
      },
    });
    instance.triggers.push(trigger);
  });
}

function teardown(section) {
  const instance = section._stackingCardsInstance;
  if (instance) {
    instance.triggers.forEach((trigger) => trigger.kill());
    instance.tweens.forEach((tween) => {
      tween.scrollTrigger?.kill();
      tween.kill();
    });
    instance.bounceTimelines.forEach((timeline) => timeline.kill());
    section._stackingCardsInstance = null;
  }

  section.querySelectorAll("[data-stacking-card-target]").forEach((target) => {
    gsap.set(target, { clearProps: "all" });
  });
}

function parseValues(section, attribute, fallback, numbers = false) {
  const raw = section.getAttribute(attribute);
  if (!raw) return fallback;

  const values = raw.split(",").map((value) => {
    const trimmed = value.trim();
    return numbers ? parseFloat(trimmed) : trimmed;
  }).filter((value) => numbers ? Number.isFinite(value) : value);

  return values.length ? values : fallback;
}

function getViewportTier() {
  if (window.innerWidth > 991) return "desktop";
  if (window.innerWidth >= 768) return "tablet";
  return "mobile";
}

function installResizeListener() {
  initStackingCards._resize?.remove();

  let lastWidth = window.innerWidth;
  let timer;
  const onResize = () => {
    if (window.innerWidth === lastWidth) return;
    lastWidth = window.innerWidth;

    clearTimeout(timer);
    timer = setTimeout(() => {
      if (getViewportTier() !== initStackingCards._tier) {
        initStackingCards();
      }
    }, RESIZE_DEBOUNCE);
  };

  window.addEventListener("resize", onResize);
  initStackingCards._tier = getViewportTier();
  initStackingCards._resize = {
    remove() {
      clearTimeout(timer);
      window.removeEventListener("resize", onResize);
    },
  };
}
