// Keep this in sync with the Webflow combo-class breakpoint split.
const HERO_VIDEO_BREAKPOINT = 767;
const HERO_VIDEO_QUERY = `.hero_bg .hero-bg_video`;

function hideVideo(state) {
  const { video, sources } = state;
  sources.forEach((source) => source.remove());
  video.pause();
  video.removeAttribute("src");
  video.load();
  state.visible = false;
}

function showVideo(state) {
  const { video, sources } = state;
  sources.forEach((source) => video.appendChild(source));
  video.load();
  state.visible = true;

  try {
    const play = video.play();
    if (play) play.catch(() => {});
  } catch {
    // Browsers may reject autoplay synchronously in some environments.
  }
}

function restoreVideo(state) {
  state.sources.forEach((source) => state.video.appendChild(source));
  state.video.load();
  state.visible = true;
}

export function initHeroVideoGate() {
  const roots = [...document.querySelectorAll(".hero_bg")].filter((root) =>
    root.querySelector(HERO_VIDEO_QUERY),
  );
  if (!roots.length) return;

  const instances = roots.map((root) => {
    root._heroVideoGateInstance?.destroy();

    const mediaQuery = window.matchMedia(`(max-width: ${HERO_VIDEO_BREAKPOINT}px)`);
    const states = [...root.querySelectorAll(HERO_VIDEO_QUERY)]
      .map((wrapper) => ({
        wrapper,
        video: wrapper.querySelector("video"),
        sources: [],
        visible: false,
      }))
      .filter((state) => state.video)
      .map((state) => ({
        ...state,
        sources: [...state.video.querySelectorAll("source")],
      }));

    const sync = () => {
      states.forEach((state) => {
        const visible = getComputedStyle(state.wrapper).display !== "none";
        if (visible === state.visible) return;
        if (visible) showVideo(state);
        else hideVideo(state);
      });
    };

    // Seed the state before syncing so boot handles hidden videos only.
    states.forEach((state) => {
      state.visible = getComputedStyle(state.wrapper).display !== "none";
      if (!state.visible) hideVideo(state);
    });
    mediaQuery.addEventListener("change", sync);

    const instance = {
      destroy() {
        mediaQuery.removeEventListener("change", sync);
        states.forEach(restoreVideo);
        if (root._heroVideoGateInstance === instance) {
          root._heroVideoGateInstance = undefined;
        }
      },
    };
    root._heroVideoGateInstance = instance;
    return instance;
  });

  return { destroy: () => instances.forEach((instance) => instance.destroy()) };
}
