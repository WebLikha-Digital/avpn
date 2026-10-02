import { lockScroll } from "../lib/scrollLock.js";

const OPEN_EVENT = "video-lightbox-open";
const CLOSE_EVENT = "video-lightbox-close";

function embedSource(src) {
  try {
    const url = new URL(src, window.location.href);
    const host = url.hostname.toLowerCase().replace(/^www\./, "");
    let id;
    if (host === "youtube.com" || host === "m.youtube.com") {
      if (url.pathname === "/watch") id = url.searchParams.get("v");
      else if (url.pathname.startsWith("/embed/")) id = url.pathname.split("/")[2];
    } else if (host === "youtu.be") {
      id = url.pathname.slice(1).split("/")[0];
    }
    if (id) {
      const params = new URLSearchParams({
        autoplay: "1",
        rel: "0",
        enablejsapi: "1",
        playsinline: "1",
        origin: window.location.origin,
      });
      return { type: "youtube", src: `https://www.youtube-nocookie.com/embed/${id}?${params}` };
    }
    if (host === "vimeo.com" || host === "player.vimeo.com") {
      const match = url.pathname.match(/\/(?:video\/)?(\d+)/);
      if (match) return { type: "vimeo", src: `https://player.vimeo.com/video/${match[1]}?autoplay=1&api=1` };
    }
  } catch (_) {
    // Invalid URLs fall through to the native video player.
  }
  return { type: "video", src };
}

function createPlayer(src) {
  const embed = embedSource(src);
  if (embed.type !== "video") {
    const iframe = document.createElement("iframe");
    iframe.src = embed.src;
    iframe.dataset.videoLightboxPlayerType = embed.type;
    iframe.setAttribute("allow", "autoplay; fullscreen; picture-in-picture");
    iframe.setAttribute("allowfullscreen", "");
    return iframe;
  }
  const video = document.createElement("video");
  video.controls = true;
  video.autoplay = false;
  video.playsInline = true;
  video.src = embed.src;
  video.dataset.videoLightboxPlayerType = embed.type;
  return video;
}

function postCommand(player, message) {
  player?.contentWindow?.postMessage(JSON.stringify(message), "*");
}

function controlPlayer(player, action) {
  if (!player) return;
  const type = player.dataset.videoLightboxPlayerType;
  if (type === "youtube") {
    postCommand(player, { event: "command", func: action === "pause" ? "pauseVideo" : "playVideo", args: "" });
  } else if (type === "vimeo") {
    postCommand(player, { method: action });
  } else if (action === "pause") {
    player.pause();
  } else {
    const result = player.play();
    result?.catch?.(() => {});
  }
}

function parseMessage(data) {
  if (typeof data !== "string") return data;
  try { return JSON.parse(data); } catch (_) { return null; }
}

function ownerFor(trigger) {
  let ancestor = trigger.parentElement;
  while (ancestor) {
    const lightbox = ancestor.querySelector("[data-video-lightbox]");
    if (lightbox) return lightbox;
    ancestor = ancestor.parentElement;
  }
  return document.querySelector("[data-video-lightbox]");
}

function notify(name, lightbox) {
  document.dispatchEvent(new CustomEvent(name, { detail: { lightbox } }));
}

function initVideoLightbox() {
  initVideoLightbox._destroy?.();
  const lightboxes = [...document.querySelectorAll("[data-video-lightbox]")];
  if (!lightboxes.length) return;

  let activeInstance = null;
  const instances = lightboxes.map((lightbox) => {
    const playerHost = lightbox.querySelector("[data-video-lightbox-player]");
    if (!playerHost) return null;
    const dialog = lightbox.querySelector("[data-video-lightbox-dialog]");
    const closeTargets = [...lightbox.querySelectorAll("[data-video-lightbox-close]")];
    const closeButton = lightbox.querySelector("button[data-video-lightbox-close]");
    const instance = {
      lightbox,
      playerHost,
      dialog,
      closeTargets,
      closeButton,
      player: null,
      src: null,
      trigger: null,
      desiredAction: "pause",
      unlockScroll: null,
      listeners: [],
      playerCleanup: null,
      watchPlayer() {
        this.playerCleanup?.();
        if (!this.player) return;
        const player = this.player;
        const resend = () => {
          if (player === this.player) controlPlayer(player, this.desiredAction);
        };
        const onLoad = () => {
          if (player.dataset.videoLightboxPlayerType === "youtube") {
            postCommand(player, { event: "listening" });
          }
          resend();
        };
        const onMessage = (event) => {
          if (event.source !== player.contentWindow || player !== this.player) return;
          const message = parseMessage(event.data);
          const state = message?.event === "infoDelivery" ? message.info?.playerState : null;
          const ready = message?.event === "onReady" || message?.event === "ready";
          const playing = state === 1 || state === 3 || message?.event === "play";
          if (ready || (this.desiredAction === "pause" && playing)) resend();
        };
        const onPlay = () => {
          if (player === this.player && this.desiredAction === "pause") player.pause();
        };
        player.addEventListener("load", onLoad);
        player.addEventListener("play", onPlay);
        window.addEventListener("message", onMessage);
        this.playerCleanup = () => {
          player.removeEventListener("load", onLoad);
          player.removeEventListener("play", onPlay);
          window.removeEventListener("message", onMessage);
        };
        onLoad();
      },
      open(trigger) {
        const src = trigger.getAttribute("data-video-lightbox-src");
        if (!src) return;
        if (activeInstance && activeInstance !== this) activeInstance.close(false);
        if (this.src !== src || !this.player) {
          this.desiredAction = "play";
          controlPlayer(this.player, "pause");
          this.playerCleanup?.();
          this.playerHost.replaceChildren();
          this.player = createPlayer(src);
          this.playerHost.append(this.player);
          this.src = src;
          this.watchPlayer();
          controlPlayer(this.player, "play");
        } else {
          this.desiredAction = "play";
          controlPlayer(this.player, "play");
        }
        this.trigger = trigger;
        this.lightbox.setAttribute("data-video-lightbox-status", "active");
        this.lightbox.setAttribute("aria-hidden", "false");
        this.unlockScroll ||= lockScroll({ className: "is-modal-open" });
        activeInstance = this;
        notify(OPEN_EVENT, this.lightbox);
        (this.closeButton || this.dialog)?.focus();
      },
      close(restoreFocus = true) {
        if (!this.trigger && this.lightbox.getAttribute("data-video-lightbox-status") !== "active") return;
        const trigger = this.trigger;
        this.desiredAction = "pause";
        controlPlayer(this.player, "pause");
        this.lightbox.setAttribute("data-video-lightbox-status", "not-active");
        this.lightbox.setAttribute("aria-hidden", "true");
        this.unlockScroll?.();
        this.unlockScroll = null;
        this.trigger = null;
        if (activeInstance === this) activeInstance = null;
        notify(CLOSE_EVENT, this.lightbox);
        if (restoreFocus) trigger?.focus();
      },
    };
    lightbox._videoLightboxInstance = instance;
    lightbox.setAttribute("aria-hidden", "true");
    lightbox.setAttribute("data-video-lightbox-status", "not-active");
    dialog?.setAttribute("tabindex", "-1");
    closeButton?.setAttribute("type", "button");
    document.querySelectorAll("[data-video-lightbox-trigger]").forEach((trigger) => {
      trigger.type = "button";
      trigger.setAttribute("aria-haspopup", "dialog");
    });
    return instance;
  }).filter(Boolean);

  const listen = (target, type, handler, options) => {
    target.addEventListener(type, handler, options);
    cleanup.push(() => target.removeEventListener(type, handler, options));
  };
  const cleanup = [];
  const onClick = (event) => {
    if (event.defaultPrevented) return;
    const trigger = event.target.closest?.("[data-video-lightbox-trigger]");
    if (trigger) {
      event.preventDefault();
      const lightbox = ownerFor(trigger);
      instances.find((instance) => instance.lightbox === lightbox)?.open(trigger);
      return;
    }
    const closeTarget = event.target.closest?.("[data-video-lightbox-close]");
    if (closeTarget) instances.find((instance) => instance.closeTargets.includes(closeTarget))?.close();
  };
  listen(document, "click", onClick);
  listen(document, "keydown", (event) => {
    if (event.key === "Escape") activeInstance?.close();
  });
  initVideoLightbox._destroy = () => {
    instances.forEach((instance) => {
      instance.close(false);
      instance.playerCleanup?.();
      instance.playerHost.replaceChildren();
      instance.player = null;
      instance.src = null;
      instance.listeners.forEach((remove) => remove());
      delete instance.lightbox._videoLightboxInstance;
    });
    cleanup.forEach((remove) => remove());
    initVideoLightbox._destroy = null;
  };
}

export { CLOSE_EVENT, OPEN_EVENT, initVideoLightbox };
