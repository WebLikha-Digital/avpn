function accordionRoots(root) {
  const roots = [];
  if (root instanceof Element && root.matches("[data-accordion-css-init]")) {
    roots.push(root);
  }
  roots.push(...root.querySelectorAll?.("[data-accordion-css-init]") || []);
  return roots.filter((accordion) => !accordion.closest("[data-nav-init]") || accordion === root);
}

function initAccordionRoot(accordion) {
  accordion._accordionInstance?.destroy();

  const closeSiblings = accordion.getAttribute("data-accordion-close-siblings") === "true";
  const syncAria = () => {
    accordion.querySelectorAll("[data-accordion-toggle]").forEach((toggle) => {
      const item = toggle.closest("[data-accordion-status]");
      toggle.setAttribute(
        "aria-expanded",
        String(item?.getAttribute("data-accordion-status") === "active"),
      );
    });
  };
  const onClick = (event) => {
    const toggle = event.target.closest?.("[data-accordion-toggle]");
    if (!toggle || !accordion.contains(toggle)) return;

    if (toggle.matches('a[href="#"]')) event.preventDefault();

    const item = toggle.closest("[data-accordion-status]");
    if (!item) return;
    const opening = item.getAttribute("data-accordion-status") !== "active";
    if (opening && closeSiblings) {
      accordion.querySelectorAll('[data-accordion-status="active"]').forEach((sibling) => {
        if (sibling !== item) sibling.setAttribute("data-accordion-status", "not-active");
      });
    }
    item.setAttribute("data-accordion-status", opening ? "active" : "not-active");
    syncAria();
  };

  accordion.addEventListener("click", onClick);
  syncAria();
  const instance = {
    syncAria,
    destroy() {
      accordion.removeEventListener("click", onClick);
      if (accordion._accordionInstance === instance) delete accordion._accordionInstance;
    },
  };
  accordion._accordionInstance = instance;
  return instance;
}

export function initAccordion(root = document) {
  root._accordionInstance?.destroy();
  const instances = accordionRoots(root).map(initAccordionRoot);
  const instance = {
    syncAria() {
      instances.forEach((item) => item.syncAria());
    },
    destroy() {
      instances.forEach((item) => item.destroy());
      if (root._accordionInstance === instance) delete root._accordionInstance;
    },
  };
  root._accordionInstance = instance;
  return instance;
}
