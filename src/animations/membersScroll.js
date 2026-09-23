import { gsap, ScrollTrigger } from "../lib/gsap.js";

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
      let startWidths;
      const captureRowWidths = () => {
        gsap.set(rows, { clearProps: "width" });
        startWidths = rows.map((row) => row.getBoundingClientRect().width);
        gsap.set(rows, { width: (index) => startWidths[index] });
      };
      captureRowWidths();

      const timeline = gsap.timeline({
        scrollTrigger: {
          trigger: section,
          start: "top top",
          end: "bottom bottom",
          scrub: true,
          invalidateOnRefresh: true,
          onRefreshInit: captureRowWidths,
        },
      });
      timeline.to(list, {
        y: () => -(Math.max(0, list.scrollHeight - wrap.clientHeight)),
        ease: "none",
        duration: 1,
      }, 0);
      timeline.to(rows, {
        width: () => wrap.clientWidth,
        ease: "none",
        duration: 1,
      }, 0);
      const instance = {
        destroy() {
          timeline.scrollTrigger?.kill();
          timeline.kill();
          gsap.set([list, ...rows], { clearProps: "transform,width" });
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
