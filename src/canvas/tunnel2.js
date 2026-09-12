import {
  Color,
  DoubleSide,
  Euler,
  Fog,
  LinearFilter,
  LinearMipmapLinearFilter,
  Group,
  Mesh,
  MeshBasicMaterial,
  PerspectiveCamera,
  PlaneGeometry,
  SRGBColorSpace,
  Scene,
  TextureLoader,
  Timer,
  Vector3,
  WebGLRenderer,
} from "three";

/**
 * Variant of the tunnel where the corridor is *solid* imagery rather than a
 * wireframe with scattered slabs: every cell on the floor, ceiling and both
 * walls carries a picture, separated only by thin gaps that read as bright
 * seams, and the far end dissolves into a white haze the camera flies toward.
 *
 * Kept alongside `tunnel.js` rather than replacing it — the two are different
 * looks, not versions of one.
 *
 * DOM contract (all set in the Webflow Designer):
 *   [data-tunnel2-init]    the mount — an empty div with an explicit size in CSS.
 *   [data-tunnel2-images]  optional, inside the mount: a container of <img> tags
 *                          that acts as the texture manifest. Webflow owns these
 *                          assets; the script reads each img's `currentSrc` so it
 *                          inherits whatever srcset variant the browser picked.
 *                          With no images the corridor renders as empty haze, so
 *                          the component can ship before the art does.
 *
 * Tunables (data attributes on the mount, so each Webflow instance can be
 * adjusted independently):
 *   data-tunnel2-width         corridor width in world units. On a mount wider
 *                              than the corridor's own aspect this is widened
 *                              automatically so the walls stay outside the
 *                              frustum                          (default 24)
 *   data-tunnel2-height        corridor height in world units  (default 15)
 *   data-tunnel2-cols          floor/ceiling panels across     (default 1)
 *   data-tunnel2-rows          wall tiles stacked              (default 1)
 *   data-tunnel2-bg            background color, or `transparent` (default)
 *   data-tunnel2-haze          color the corridor fades into   (default #ffffff)
 *   data-tunnel2-fog-near      distance where the haze starts  (default 12)
 *   data-tunnel2-fog-far       distance where it's total       (default 78)
 *   data-tunnel2-image-opacity tile opacity                    (default 1)
 *   data-tunnel2-gap           seam width in world units       (default 0.35)
 *   data-tunnel2-depth-fill    panel length as a share of the segment, so the
 *                              rest reads as a white gap        (default 0.72)
 *   data-tunnel2-fill-rate     chance a surface gets a panel — 1 keeps the
 *                              layout regular: one image per surface (default 1)
 *   data-tunnel2-inset         how far panels float in off the corridor
 *                              surface, applied consistently to all panels
 *                                                               (default 1.4)
 *   data-tunnel2-speed         world units per second          (default 3.5)
 *   data-tunnel2-fov           camera field of view            (default 50)
 */

// Corridor depth is fixed geometry, not a design tunable — changing it changes
// what the tunnel *is*, not how it's tuned.
const SEG_DEPTH = 6;
const SEG_COUNT = 12;

const CAMERA_LERP = 0.06;
const FADE_LERP = 0.06;

const DEFAULTS = {
  width: 24,
  height: 15,
  cols: 1,
  rows: 1,
  bg: "transparent",
  haze: "#ffffff",
  fogNear: 12,
  fogFar: 78,
  imageOpacity: 1,
  gap: 0.35,
  depthFill: 0.72,
  fillRate: 1,
  inset: 1.4,
  speed: 3.5,
  fov: 50,
};

/** Reads a data attribute off the mount, falling back to the default. */
function readVars(container) {
  const str = (name, fallback) => {
    const v = container.getAttribute(name)?.trim();
    return v || fallback;
  };
  const num = (name, fallback) => {
    const v = parseFloat(container.getAttribute(name));
    return Number.isFinite(v) ? v : fallback;
  };
  const int = (name, fallback) => {
    const v = Math.round(num(name, fallback));
    return v >= 1 ? v : fallback;
  };

  return {
    width: num("data-tunnel2-width", DEFAULTS.width),
    height: num("data-tunnel2-height", DEFAULTS.height),
    cols: int("data-tunnel2-cols", DEFAULTS.cols),
    rows: int("data-tunnel2-rows", DEFAULTS.rows),
    bg: str("data-tunnel2-bg", DEFAULTS.bg),
    haze: str("data-tunnel2-haze", DEFAULTS.haze),
    fogNear: num("data-tunnel2-fog-near", DEFAULTS.fogNear),
    fogFar: num("data-tunnel2-fog-far", DEFAULTS.fogFar),
    imageOpacity: num("data-tunnel2-image-opacity", DEFAULTS.imageOpacity),
    gap: num("data-tunnel2-gap", DEFAULTS.gap),
    depthFill: num("data-tunnel2-depth-fill", DEFAULTS.depthFill),
    fillRate: num("data-tunnel2-fill-rate", DEFAULTS.fillRate),
    inset: num("data-tunnel2-inset", DEFAULTS.inset),
    speed: num("data-tunnel2-speed", DEFAULTS.speed),
    fov: num("data-tunnel2-fov", DEFAULTS.fov),
  };
}

/**
 * Collects texture URLs from the manifest, waiting on any <img> that hasn't
 * resolved its srcset yet. The manifest is hidden (but never `display: none` —
 * that would stop Webflow's lazy-loaded images from ever picking a source).
 */
function collectSources(imgBox, done) {
  if (!imgBox) {
    done([]);
    return;
  }

  imgBox.setAttribute("aria-hidden", "true");
  imgBox.style.cssText =
    "position:absolute;width:1px;height:1px;overflow:hidden;opacity:0;pointer-events:none;";

  const imgs = Array.from(imgBox.querySelectorAll("img"));
  if (!imgs.length) {
    done([]);
    return;
  }

  const sources = new Array(imgs.length);
  let pending = imgs.length;
  const settle = (img, index) => {
    // Reading img.src turns an empty src attribute into the current page URL.
    const url = img.currentSrc || img.getAttribute("src")?.trim() || "";
    if (url) {
      const surface = img
        .getAttribute("data-tunnel2-surface")
        ?.trim()
        .toLowerCase();
      sources[index] = {
        url,
        surface: ["left", "right", "top", "bottom"].includes(surface)
          ? surface
          : null,
      };
    }
    if (--pending === 0) done(sources.filter(Boolean));
  };

  imgs.forEach((img, index) => {
    img.loading = "eager";
    if (img.complete || img.currentSrc) {
      settle(img, index);
    } else {
      const onSettle = () => {
        img.removeEventListener("load", onSettle);
        img.removeEventListener("error", onSettle);
        settle(img, index);
      };
      img.addEventListener("load", onSettle);
      img.addEventListener("error", onSettle);
    }
  });
}

/**
 * Crops a texture to fill a tile rather than stretching to it: shrinks the UV
 * window to the tile's aspect and centres it — the texture equivalent of CSS
 * `object-fit: cover`. Source images can then be any shape or mix of shapes.
 *
 * Returns a clone, because repeat/offset live on the texture and the two tile
 * orientations need different ones. Clones share their `source`, so three
 * uploads the pixels once and refcounts them.
 */
function coverFit(tex, targetAspect) {
  const fitted = tex.clone();
  const img = tex.image;
  const imgAspect = img && img.height ? img.width / img.height : 1;

  if (imgAspect > targetAspect) {
    fitted.repeat.set(targetAspect / imgAspect, 1); // too wide — crop the sides
  } else {
    fitted.repeat.set(1, imgAspect / targetAspect); // too tall — crop top/bottom
  }
  fitted.offset.set((1 - fitted.repeat.x) / 2, (1 - fitted.repeat.y) / 2);
  fitted.needsUpdate = true;
  return fitted;
}

/** Frees a pool built by preload(). */
function disposePool(pool) {
  pool.forEach((entry) => {
    entry.source.dispose();
  });
}

/**
 * Loads every URL, skipping any that fail. Tile-specific UV crops are created
 * later from the final panel dimensions so inset adjustments stay proportional.
 */
function preload(sources, vars, done) {
  if (!sources.length) {
    done([]);
    return;
  }

  const loader = new TextureLoader();
  loader.setCrossOrigin("anonymous"); // WebGL refuses cross-origin textures without it
  const cellW = vars.width / vars.cols;
  const cellH = vars.height / vars.rows;
  const tileDepth = SEG_DEPTH * vars.depthFill;
  // Walls run with the corridor and floor/ceiling run across it.
  const pool = new Array(sources.length);
  let pending = sources.length;

  const settle = () => {
    if (--pending > 0) return;
    done(
      pool.filter(Boolean)
    );
  };

  sources.forEach(({ url, surface }, i) => {
    loader.load(
      url,
      (tex) => {
        tex.colorSpace = SRGBColorSpace;
        tex.minFilter = LinearFilter;
        pool[i] = { source: tex, url, surface };
        settle();
      },
      undefined,
      settle
    );
  });
}

/**
 * A hero mount is far wider than it is tall, and a corridor narrower than the
 * frustum lets the view spill past the near edge of the wall panels — white
 * wedges in the corners. Widen the corridor to the mount when that happens,
 * before anything measures off `width`.
 */
function fitWidthToMount(container, vars) {
  const r = container.getBoundingClientRect();
  const aspect = r.height > 0 ? r.width / r.height : 1;
  vars.width = Math.max(vars.width, vars.height * aspect);
}

/** Builds one instance. Returns a handle with a `destroy()` for teardown. */
function setupInstance(container, pool, vars) {
  const { cols: COLS, rows: ROWS, gap: GAP } = vars;
  const corridorW = vars.width;
  const corridorH = vars.height;
  const cellW = corridorW / COLS;
  const cellH = corridorH / ROWS;
  const tileDepth = SEG_DEPTH * vars.depthFill;
  const halfW = corridorW / 2;
  const halfH = corridorH / 2;
  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const haze = new Color(vars.haze);

  const canvas = document.createElement("canvas");
  canvas.style.cssText = "display:block;width:100%;height:100%";
  canvas.setAttribute("aria-hidden", "true");
  container.appendChild(canvas);

  const measure = () => {
    const r = container.getBoundingClientRect();
    return { w: Math.max(1, r.width), h: Math.max(1, r.height) };
  };
  let dim = measure();

  const scene = new Scene();
  // Test-only read-only hook: exposes the scene so specs can inspect tile
  // metadata without changing rendering behaviour.
  container.__tunnel2 = { scene };
  if (vars.bg !== "transparent" && vars.bg !== "none") {
    scene.background = new Color(vars.bg);
  }
  // The haze is the whole look: tiles wash out with distance instead of
  // shrinking to a visible hole at the vanishing point.
  scene.fog = new Fog(haze, vars.fogNear, vars.fogFar);

  const camera = new PerspectiveCamera(vars.fov, dim.w / dim.h, 0.1, 1000);
  camera.position.set(0, 0, 0);

  const renderer = new WebGLRenderer({ canvas, antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(dim.w, dim.h, false);

  // Keep source images sharp when they are viewed at an angle and/or reduced
  // by perspective. Each tile gets its own UV crop below, while the source
  // texture owns the filtering settings shared by those lightweight clones.
  const anisotropy = renderer.capabilities.getMaxAnisotropy();
  pool.forEach(({ source }) => {
    source.anisotropy = anisotropy;
    source.minFilter = LinearMipmapLinearFilter;
    source.magFilter = LinearFilter;
    source.needsUpdate = true;
  });

  // Cap at the far end of the fog, riding along with the camera. Without it the
  // corridor ends in whatever is behind the canvas; with it, it ends in light.
  const endCap = new Mesh(
    new PlaneGeometry(1, 1),
    new MeshBasicMaterial({ color: haze, fog: false })
  );
  const sizeEndCap = () => {
    const dist = vars.fogFar;
    const h = 2 * Math.tan((camera.fov * Math.PI) / 360) * dist;
    endCap.scale.set(h * camera.aspect * 1.2, h * 1.2, 1);
  };
  sizeEndCap();
  endCap.renderOrder = -1; // behind the tiles, which blend rather than occlude
  scene.add(endCap);

  /* ---------- geometry ---------- */

  const surfaces = ["left", "right", "top", "bottom"];
  const surfacePools = Object.fromEntries(
    surfaces.map((surface) => [surface, []]),
  );
  pool.forEach((entry, index) => {
    if (entry.surface) {
      surfacePools[entry.surface].push(index);
    } else {
      surfaces.forEach((surface) => surfacePools[surface].push(index));
    }
  });
  const surfaceCursors = Object.fromEntries(
    surfaces.map((surface) => [surface, 0]),
  );
  const nextEntry = (surface) => {
    const indices = surfacePools[surface];
    if (!indices.length) return null;
    const cursor = surfaceCursors[surface];
    const entry = pool[indices[cursor]];
    surfaceCursors[surface] = (cursor + 1) % indices.length;
    return entry;
  };

  function addTile(group, surface, position, rotation, w, h) {
    const entry = nextEntry(surface);
    if (!entry) return;
    const tileW = Math.max(0.1, w - GAP);
    const tileH = Math.max(0.1, h - GAP);
    const material = new MeshBasicMaterial({
      // Fit against the final geometry, not a generic floor/wall ratio. This
      // keeps every source image proportional even when the inset changes the
      // panel size.
      map: coverFit(entry.source, tileW / tileH),
      transparent: true,
      opacity: reduce ? vars.imageOpacity : 0,
      side: DoubleSide,
    });
    material.userData.fadeIn = !reduce;

    const mesh = new Mesh(new PlaneGeometry(tileW, tileH), material);
    mesh.position.copy(position);
    mesh.rotation.copy(rotation);
    mesh.name = "tile";
    mesh.userData.surface = surface;
    mesh.userData.sourceIndex = pool.indexOf(entry);
    mesh.userData.url = entry.url;
    group.add(mesh);
  }

  // One panel per surface per segment, shorter than the segment so the corridor
  // breathes white between panels, and floated off the surface so the walls
  // step in and out instead of reading as flat boxes.
  //
  // The inset also needs to be removed from the panel's edge-to-edge span. If
  // it is not, a floor panel still reaches into the wall's old edge after both
  // panels move toward the centre of the corridor, which makes the images
  // overlap at the four long corners.
  function populate(group) {
    const zc = -SEG_DEPTH / 2;
    // Use one inset for every panel in a segment. Randomising this per tile
    // makes the corner seams vary and breaks the visual alignment of the room.
    const inset = () => vars.inset;
    const takes = () => Math.random() < vars.fillRate;
    const insetSpan = (size, amount) =>
      Math.max(GAP + 0.1, size - amount * 2);

    for (let i = 0; i < COLS; i++) {
      const x = -halfW + i * cellW + cellW / 2;
      if (takes()) {
        const edgeInset = inset();
        addTile(
          group,
          "bottom",
          new Vector3(x, -halfH + edgeInset, zc),
          new Euler(-Math.PI / 2, 0, 0),
          insetSpan(cellW, edgeInset),
          tileDepth + GAP
        );
      }
      if (takes()) {
        const edgeInset = inset();
        addTile(
          group,
          "top",
          new Vector3(x, halfH - edgeInset, zc),
          new Euler(Math.PI / 2, 0, 0),
          insetSpan(cellW, edgeInset),
          tileDepth + GAP
        );
      }
    }

    for (let i = 0; i < ROWS; i++) {
      const y = -halfH + i * cellH + cellH / 2;
      if (takes()) {
        const edgeInset = inset();
        addTile(
          group,
          "left",
          new Vector3(-halfW + edgeInset, y, zc),
          new Euler(0, Math.PI / 2, 0),
          tileDepth + GAP,
          insetSpan(cellH, edgeInset)
        );
      }
      if (takes()) {
        const edgeInset = inset();
        addTile(
          group,
          "right",
          new Vector3(halfW - edgeInset, y, zc),
          new Euler(0, -Math.PI / 2, 0),
          tileDepth + GAP,
          insetSpan(cellH, edgeInset)
        );
      }
    }
  }

  function clearTiles(group) {
    group.children
      .filter((o) => o.name === "tile")
      .forEach((o) => {
        group.remove(o);
        o.geometry.dispose();
        o.material.map?.dispose();
        o.material.dispose();
      });
  }

  function buildSegment(z) {
    const group = new Group();
    group.position.z = z;
    populate(group);
    return group;
  }

  const segments = [];
  for (let i = 0; i < SEG_COUNT; i++) {
    const seg = buildSegment(-i * SEG_DEPTH);
    scene.add(seg);
    segments.push(seg);
  }

  /* ---------- loop ---------- */

  // Timer over Clock (deprecated): connect() uses the Page Visibility API so a
  // backgrounded tab reports a zero delta instead of one huge catch-up frame.
  const timer = new Timer();
  timer.connect(document);

  let travel = 0;
  let visible = true;
  let contextLost = false;

  const tick = (timestamp) => {
    container._tunnel2Raf = requestAnimationFrame(tick);
    timer.update(timestamp);
    // Still clamped: page visibility doesn't cover scrolling off-screen, or a
    // long first frame while the GPU warms up.
    const dt = Math.min(timer.getDelta(), 0.1);
    if (!visible || contextLost) return;

    travel += vars.speed * dt;
    camera.position.z += (-travel - camera.position.z) * CAMERA_LERP;
    const camZ = camera.position.z;
    endCap.position.z = camZ - vars.fogFar;

    segments.forEach((seg) => {
      // Recycle any segment the camera has passed to the far end of the tunnel.
      if (seg.position.z > camZ + SEG_DEPTH) {
        const min = segments.reduce((m, o) => Math.min(m, o.position.z), 0);
        seg.position.z = min - SEG_DEPTH;
        clearTiles(seg);
        populate(seg);
      }

      seg.children.forEach((o) => {
        if (o.name !== "tile" || !o.material.userData.fadeIn) return;
        const mat = o.material;
        mat.opacity += (vars.imageOpacity - mat.opacity) * FADE_LERP;
        if (mat.opacity > vars.imageOpacity - 0.005) {
          mat.opacity = vars.imageOpacity;
          mat.userData.fadeIn = false;
        }
      });
    });

    renderer.render(scene, camera);
  };

  const renderOnce = () => renderer.render(scene, camera);

  if (reduce) {
    endCap.position.z = -vars.fogFar;
    renderOnce(); // decorative motion — one static frame instead of a loop
  } else {
    timer.reset(); // discard time spent loading textures
    tick();
  }

  /* ---------- responsive + visibility ---------- */

  const resize = () => {
    dim = measure();
    camera.aspect = dim.w / dim.h;
    camera.updateProjectionMatrix();
    renderer.setSize(dim.w, dim.h, false);
    sizeEndCap();
    if (reduce) renderOnce();
  };

  const resizeObserver = new ResizeObserver(resize);
  resizeObserver.observe(container);

  // Canvases are the most expensive thing on the page — don't render offscreen.
  const intersectionObserver = new IntersectionObserver(
    (entries) => {
      visible = entries[0].isIntersecting;
      timer.reset(); // don't let time spent hidden jump the camera forward
    },
    { threshold: 0 }
  );
  intersectionObserver.observe(container);

  const onContextLost = (e) => {
    e.preventDefault();
    contextLost = true;
  };
  // A lost context leaves a permanently blank canvas unless the scene is rebuilt.
  // Textures are reloaded rather than reused: they come back from the HTTP cache,
  // and it keeps pool ownership simple — an instance always frees its own pool.
  const onContextRestored = () => {
    contextLost = false;
    destroy();
    container._tunnel2 = null;
    container._tunnel2Gen = (container._tunnel2Gen || 0) + 1;
    mount(container);
  };
  canvas.addEventListener("webglcontextlost", onContextLost);
  canvas.addEventListener("webglcontextrestored", onContextRestored);

  /* ---------- teardown ---------- */

  function destroy() {
    cancelAnimationFrame(container._tunnel2Raf);
    container._tunnel2Raf = null;
    timer.dispose(); // detaches the document visibilitychange listener
    resizeObserver.disconnect();
    intersectionObserver.disconnect();
    canvas.removeEventListener("webglcontextlost", onContextLost);
    canvas.removeEventListener("webglcontextrestored", onContextRestored);

    segments.forEach((seg) => {
      clearTiles(seg);
      scene.remove(seg);
    });
    segments.length = 0;
    scene.remove(endCap);
    endCap.geometry.dispose();
    endCap.material.dispose();
    disposePool(pool);
    renderer.dispose();
    canvas.remove();
    container.__tunnel2 = null;
  }

  return { destroy, scene };
}

/**
 * Loads one container's textures, then mounts an instance on it. Split from
 * initTunnel2 so the WebGL context-restore path can reuse it for a single
 * element without touching every other tunnel on the page.
 */
function mount(container) {
  const gen = container._tunnel2Gen;
  const vars = readVars(container);
  fitWidthToMount(container, vars);
  // Loading is async, so a later init can overtake this one. The generation
  // token lets the newest call win and older ones bow out.
  const stale = () => !container.isConnected || container._tunnel2Gen !== gen;

  // Webflow can leave an empty placeholder image block beside the authored
  // manifest. Use the first block that actually contains an image source.
  const imgBox = Array.from(
    container.querySelectorAll("[data-tunnel2-images]")
  ).find((box) =>
    Array.from(box.querySelectorAll("img")).some(
      (img) => img.currentSrc || img.getAttribute("src")?.trim()
    )
  );

  collectSources(imgBox, (urls) => {
    if (stale()) return;
    preload(urls, vars, (pool) => {
      if (stale()) {
        disposePool(pool);
        return;
      }
      container._tunnel2 = setupInstance(container, pool, vars);
    });
  });
}

/**
 * Mounts the solid-image tunnel on every [data-tunnel2-init] element.
 * Safe to call more than once — each instance tears itself down first.
 */
export function initTunnel2() {
  document.querySelectorAll("[data-tunnel2-init]").forEach((container) => {
    container._tunnel2?.destroy();
    container._tunnel2 = null;
    container._tunnel2Gen = (container._tunnel2Gen || 0) + 1;
    mount(container);
  });
}
