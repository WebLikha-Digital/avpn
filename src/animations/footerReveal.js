import { gsap, ScrollTrigger } from "../lib/gsap.js";

gsap.registerPlugin(ScrollTrigger);

export function initFooterReveal() {
  document.querySelectorAll("[data-footer-reveal]").forEach((root) => {
    root._footerReveal?.destroy();

    const inner = root.querySelector("[data-footer-reveal-inner]");
    if (!inner) return;

    const reducedMotion = window.matchMedia?.(
      "(prefers-reduced-motion: reduce)",
    ).matches;

    gsap.set(inner, { yPercent: reducedMotion ? 0 : -50 });

    if (reducedMotion) {
      root._footerReveal = {
        root,
        inner,
        trigger: null,
        destroy() {
          gsap.set(inner, { clearProps: "transform" });
          root._footerReveal = null;
        },
      };
      return;
    }

    const tween = gsap.to(inner, {
      yPercent: 0,
      ease: "none",
      scrollTrigger: {
        trigger: root,
        start: "top bottom",
        end: "bottom bottom",
        scrub: true,
        invalidateOnRefresh: true,
      },
    });

    root._footerReveal = {
      root,
      inner,
      tween,
      trigger: tween.scrollTrigger,
      destroy() {
        tween.scrollTrigger?.kill();
        tween.kill();
        gsap.set(inner, { clearProps: "transform" });
        root._footerReveal = null;
      },
    };
  });
}
