export function initTextFitToWidth(root) {
  initTextFitToWidth._cleanup?.();

  const scope = root || document;
  const elements = [...scope.querySelectorAll("[data-fit-width]")];
  if (!elements.length) {
    initTextFitToWidth._cleanup = null;
    return () => {};
  }

  const groups = new Map();
  elements.forEach((el) => {
    const parent = el.parentElement;
    if (!parent) return;
    el.style.whiteSpace = "nowrap";
    if (!groups.has(parent)) groups.set(parent, []);
    groups.get(parent).push(el);
  });

  function availableWidth(parent) {
    const cs = getComputedStyle(parent);
    return parent.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
  }

  function textWidth(el) {
    const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    let left = Infinity;
    let right = -Infinity;
    let node;

    while ((node = walker.nextNode())) {
      if (!node.nodeValue.trim()) continue;
      const range = document.createRange();
      range.selectNodeContents(node);
      [...range.getClientRects()].forEach((rect) => {
        left = Math.min(left, rect.left);
        right = Math.max(right, rect.right);
      });
    }

    return right > left ? right - left : 0;
  }

  function fit(el, available) {
    if (available <= 0) return;
    let size = parseFloat(getComputedStyle(el).fontSize) || 16;
    for (let i = 0; i < 5; i++) {
      const width = textWidth(el);
      if (width <= 0) break;
      const ratio = available / width;
      if (Math.abs(ratio - 1) < 0.002) break;
      size *= ratio;
      el.style.fontSize = size + "px";
    }
  }

  function refit() {
    groups.forEach((els, parent) => {
      const available = availableWidth(parent);
      els.forEach((el) => fit(el, available));
    });
  }

  let frame = null;
  function schedule() {
    if (frame) return;
    frame = requestAnimationFrame(() => {
      frame = null;
      refit();
    });
  }

  let active = true;
  let ro;
  if (window.ResizeObserver) {
    ro = new ResizeObserver(schedule);
    groups.forEach((els, parent) => ro.observe(parent));
  }
  window.addEventListener("resize", schedule);

  refit();
  if (document.fonts && document.fonts.ready) {
    document.fonts.ready.then(() => {
      if (active) refit();
    });
  }

  const cleanup = () => {
    if (!active) return;
    active = false;
    if (frame) cancelAnimationFrame(frame);
    if (ro) ro.disconnect();
    window.removeEventListener("resize", schedule);
    elements.forEach((el) => {
      el.style.whiteSpace = "";
      el.style.fontSize = "";
    });
    if (initTextFitToWidth._cleanup === cleanup) {
      initTextFitToWidth._cleanup = null;
    }
  };

  initTextFitToWidth._cleanup = cleanup;
  return cleanup;
}
