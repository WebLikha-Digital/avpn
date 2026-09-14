/**
 * Plain-button tabs for the ecosystem section.
 *
 * Webflow contract:
 *   [data-tabs-init]   component root
 *   [data-tabs-tab]    buttons whose values match panel values
 *   [data-tabs-panel] panels
 *
 * Roles, ids, visibility, and state attributes are written here because the
 * embed must remain independent of Webflow's generated class names.
 */
export function initEcosystemTabs() {
  document.querySelectorAll("[data-tabs-init]").forEach((root) => {
    const firstTab = root.querySelector("[data-tabs-tab]");
    const list = firstTab?.parentElement;
    const tabs = [...root.querySelectorAll("[data-tabs-tab]")];
    const panels = [...root.querySelectorAll("[data-tabs-panel]")];

    if (!list || !tabs.length || !panels.length) return;

    root._ecosystemTabsInstance?.destroy();
    list.setAttribute("role", "tablist");

    tabs.forEach((tab, index) => {
      const tabId = tab.id || `ecosystem-tab-${index + 1}`;
      const panel = panels.find(
        (candidate) => candidate.dataset.tabsPanel === tab.dataset.tabsTab,
      );

      tab.id = tabId;
      tab.setAttribute("role", "tab");
      tab.setAttribute(
        "aria-controls",
        panel?.id || `ecosystem-panel-${tab.dataset.tabsTab || index + 1}`,
      );

      if (panel) {
        panel.id = panel.id || tab.getAttribute("aria-controls");
        panel.setAttribute("role", "tabpanel");
        panel.setAttribute("aria-labelledby", tabId);
      }
    });

    const activate = (tab, announce = true) => {
      const id = tab.dataset.tabsTab;

      tabs.forEach((candidate) => {
        const active = candidate === tab;

        candidate.setAttribute("aria-selected", String(active));
        if (active) candidate.setAttribute("data-tabs-state", "active");
        else candidate.removeAttribute("data-tabs-state");
        candidate.tabIndex = active ? 0 : -1;
      });

      panels.forEach((panel) => {
        const active = panel.dataset.tabsPanel === id;

        panel.hidden = !active;
        if (active) panel.setAttribute("data-tabs-state", "active");
        else panel.removeAttribute("data-tabs-state");
      });

      if (announce) {
        root.dispatchEvent(
          new CustomEvent("ecosystemtabs:change", {
            bubbles: true,
            detail: { id },
          }),
        );
      }
    };

    const onClick = (event) => activate(event.currentTarget);
    const onKeyDown = (event) => {
      if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) {
        return;
      }

      event.preventDefault();
      const current = tabs.indexOf(event.currentTarget);
      const next = event.key === "Home"
        ? 0
        : event.key === "End"
          ? tabs.length - 1
          : (current + (event.key === "ArrowRight" ? 1 : -1) + tabs.length) % tabs.length;

      tabs[next].focus();
      activate(tabs[next]);
    };

    tabs.forEach((tab) => {
      tab.addEventListener("click", onClick);
      tab.addEventListener("keydown", onKeyDown);
    });

    root._ecosystemTabsInstance = {
      destroy() {
        tabs.forEach((tab) => {
          tab.removeEventListener("click", onClick);
          tab.removeEventListener("keydown", onKeyDown);
        });
      },
    };

    activate(
      tabs.find((tab) => tab.hasAttribute("data-tabs-default")) || tabs[0],
      false,
    );
  });
}
