import { getLocomotiveScroll } from "./locomotive.js";
import { ScrollTrigger } from "./gsap.js";

const key = `avpn-scroll:${location.href}`;
const navigation = performance.getEntriesByType("navigation")[0]?.type;
const canRestore = !location.hash && (navigation === "reload" || navigation === "back_forward");
let pending;

try {
  ScrollTrigger.clearScrollMemory("manual");
  if (canRestore) {
    pending = Number(sessionStorage.getItem(key));
    sessionStorage.removeItem(key);
  }
} catch {}

window.addEventListener("pagehide", () => {
  try { sessionStorage.setItem(key, String(window.scrollY)); } catch {}
});

export function prepareScrollRestoration() {
  if (!Number.isFinite(pending) || pending < 1) return null;

  return () => {
    if (window.scrollY !== 0) return;
    const scroll = getLocomotiveScroll()?.lenisInstance;
    scroll?.resize?.();
    const root = document.documentElement;
    const target = Math.min(pending, Math.max(0, root.scrollHeight - innerHeight));
    window.scrollTo(0, target);
    scroll?.scrollTo?.(target, { immediate: true, force: true });
  };
}
