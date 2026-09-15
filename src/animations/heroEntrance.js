import { gsap, ScrollTrigger } from "../lib/gsap.js";

const REVEAL_EASE = "power4.inOut";

export function initHeroEntrance() {
  document.querySelectorAll("[data-hero-entrance]").forEach((container) => {
    container._heroEntranceInstance?.kill();

    const targets = [...document.querySelectorAll("[data-preloader-target]")];
    const reveals = [...document.querySelectorAll("[data-preloader-reveal]")];
    const media = [...document.querySelectorAll("[data-preloader-media]")];
    const instance = { timeline: null, completed: false, kill: () => {} };
    container._heroEntranceInstance = instance;

    const complete = () => {
      if (instance.completed) return;
      instance.completed = true;
      gsap.set(targets, { opacity: 1, y: 0 });
      gsap.set(reveals, { opacity: 1, y: 0 });
      gsap.set(media, { opacity: 1 });
      document.documentElement.classList.remove("is-hero-entering");
      ScrollTrigger.refresh();
      window.dispatchEvent(new CustomEvent("hero-entrance:complete"));
    };

    // Set the inline starting state before the head gate can be removed.
    gsap.set(targets, { opacity: 0, y: "2em" });
    gsap.set(reveals, { opacity: 0, y: "2em" });
    gsap.set(media, { opacity: 0 });

    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduced) {
      complete();
      return;
    }

    const timeline = gsap.timeline({ paused: true, onComplete: complete });
    timeline.fromTo(targets, { opacity: 0, y: "2em" },
      { opacity: 1, y: 0, duration: 1, ease: REVEAL_EASE }, 0);
    reveals.forEach((element, index) => {
      timeline.fromTo(element, { opacity: 0, y: "2em" },
        { opacity: 1, y: 0, duration: 0.8, ease: REVEAL_EASE }, 0.85 + index * 0.1);
    });
    timeline.to(media, { opacity: 1, duration: 1.2, ease: "sine.out" }, 0.85);
    instance.timeline = timeline;

    let entranceFrame;
    const start = () => timeline.play();
    entranceFrame = requestAnimationFrame(start);

    instance.kill = () => {
      cancelAnimationFrame(entranceFrame);
      timeline.kill();
      gsap.killTweensOf([...targets, ...reveals, ...media]);
      if (container._heroEntranceInstance === instance) {
        container._heroEntranceInstance = undefined;
      }
    };
  });
}
