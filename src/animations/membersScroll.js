import { gsap, ScrollTrigger } from "../lib/gsap.js";

// Horizontal travel is relative to each instance's visible list wrap. The
// falloff keeps the staircase readable: the first row travels farthest and
// the twelfth still travels roughly 12% of the wrap width.
const SHIFT_X_RATIO = 0.35;
const FALLOFF = 0.06;

export function initMembersScroll() {
  initMembersScroll._mm?.revert();
  const sections = [...document.querySelectorAll("[data-members-init]")];
  sections.forEach((section) => section._membersScrollInstance?.destroy());

  const mm = gsap.matchMedia();
  initMembersScroll._mm = mm;
  mm.add("(min-width: 992px)", () => {
    sections.forEach((section) => {
      const list = section.querySelector("[data-members-list]");
      const wrap = section.querySelector("[data-members-list-wrap]");
      if (!list || !wrap) return;
      const rows = [...list.querySelectorAll(":scope > [data-accordion-status]")];

      gsap.set(list, { y: 0 });
      gsap.set(rows, { x: 0 });
      const timeline = gsap.timeline({
        scrollTrigger: {
          trigger: section,
          start: "top top",
          end: "bottom bottom",
          scrub: true,
          invalidateOnRefresh: true,
        },
      });
      timeline.to(list, {
        y: () => -(Math.max(0, list.scrollHeight - wrap.clientHeight)),
        ease: "none",
        duration: 1,
      }, 0);
      rows.forEach((row, index) => {
        timeline.to(row, {
          x: () => -(wrap.clientWidth * SHIFT_X_RATIO * (1 - index * FALLOFF)),
          ease: "none",
          duration: 1,
        }, 0);
      });
      const instance = {
        destroy() {
          timeline.scrollTrigger?.kill();
          timeline.kill();
          gsap.set([list, ...rows], { clearProps: "transform" });
          if (section._membersScrollInstance === instance) delete section._membersScrollInstance;
        },
      };
      section._membersScrollInstance = instance;
    });
    queueMicrotask(() => ScrollTrigger.refresh());
    return () => {
      sections.forEach((section) => section._membersScrollInstance?.destroy());
    };
  });
}
