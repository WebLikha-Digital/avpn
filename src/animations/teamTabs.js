/**
 * Team section tabs and the collapsible AVPN team category group.
 *
 * The markup owns the labels and layout. This module owns the accessible tab
 * state, panel visibility, and the small amount of state needed by the CSS
 * collapse.
 */
export function initTeamTabs() {
  document.querySelectorAll("[data-team-init]").forEach((root, rootIndex) => {
    root._teamTabsInstance?.destroy();

    const tabs = [...root.querySelectorAll("[data-team-tab]")];
    const panels = [...root.querySelectorAll("[data-team-panel]")];
    const group = root.querySelector("[data-team-group]");
    const toggle = group?.querySelector("[data-team-toggle]");
    const subtabs = group?.querySelector("[data-team-subtabs]");

    if (!tabs.length || !panels.length) return;

    const tabLists = [...root.querySelectorAll('[role="tablist"]')];
    const tabIdPrefix = `team-${rootIndex + 1}`;

    tabLists.forEach((list) => {
      list.setAttribute("role", "tablist");
    });

    tabs.forEach((tab, index) => {
      const id = tab.dataset.teamTab;
      const panel = panels.find((candidate) => candidate.dataset.teamPanel === id);
      const tabId = tab.id || `${tabIdPrefix}-tab-${id || index + 1}`;
      const panelId = panel?.id || `${tabIdPrefix}-panel-${id || index + 1}`;

      tab.id = tabId;
      tab.setAttribute("role", "tab");
      tab.setAttribute("aria-controls", panelId);
      if (panel) {
        panel.id = panelId;
        panel.setAttribute("role", "tabpanel");
        panel.setAttribute("aria-labelledby", tabId);
        panel.tabIndex = -1;
      }
    });

    const tabsForList = (list) => tabs.filter((tab) => tab.closest('[role="tablist"]') === list);
    // Category tabs live inside the collapsible list; the markup's `is-sub`
    // class is styling only, so the structure is the state we read.
    const isSubtab = (tab) => Boolean(subtabs && subtabs.contains(tab));

    const setOpen = (open) => {
      if (!group || !toggle || !subtabs) return;
      group.dataset.teamOpen = String(open);
      toggle.setAttribute("aria-expanded", String(open));
      subtabs.inert = !open;
    };

    const activate = (tab, announce = true) => {
      if (!tab || !tabs.includes(tab)) return;
      const id = tab.dataset.teamTab;
      const alreadyActive = panels.some(
        (panel) => panel.dataset.teamPanel === id && panel.dataset.teamActive === "true",
      );

      if (isSubtab(tab)) setOpen(true);
      if (id === "board") setOpen(false);

      tabs.forEach((candidate) => {
        const active = candidate === tab;
        candidate.setAttribute("aria-selected", String(active));
        candidate.tabIndex = active ? 0 : -1;
      });

      panels.forEach((panel) => {
        const active = panel.dataset.teamPanel === id;
        panel.dataset.teamActive = String(active);
        panel.hidden = !active;
      });

      if (announce && !alreadyActive) {
        root.dispatchEvent(
          new CustomEvent("teamtabs:change", { bubbles: true, detail: { id } }),
        );
      }
    };

    const onTabClick = (event) => activate(event.currentTarget);
    const onTabKeyDown = (event) => {
      if (!["ArrowUp", "ArrowDown", "Home", "End"].includes(event.key)) return;

      const list = event.currentTarget.closest('[role="tablist"]');
      const listTabs = list ? tabsForList(list) : [];
      const current = listTabs.indexOf(event.currentTarget);
      if (!listTabs.length || current < 0) return;

      event.preventDefault();
      const next = event.key === "Home"
        ? 0
        : event.key === "End"
          ? listTabs.length - 1
          : (current + (event.key === "ArrowDown" ? 1 : -1) + listTabs.length) % listTabs.length;

      listTabs[next].focus();
      activate(listTabs[next]);
    };
    const onToggle = () => {
      if (!group || !toggle) return;
      const open = group.dataset.teamOpen === "true";
      if (open) {
        setOpen(false);
        return;
      }

      setOpen(true);
      const selectedSubtab = tabs.find(
        (tab) => isSubtab(tab) && tab.getAttribute("aria-selected") === "true",
      );
      activate(selectedSubtab || tabs.find(isSubtab));
    };

    tabs.forEach((tab) => {
      tab.addEventListener("click", onTabClick);
      tab.addEventListener("keydown", onTabKeyDown);
    });
    toggle?.addEventListener("click", onToggle);

    root._teamTabsInstance = {
      destroy() {
        tabs.forEach((tab) => {
          tab.removeEventListener("click", onTabClick);
          tab.removeEventListener("keydown", onTabKeyDown);
        });
        toggle?.removeEventListener("click", onToggle);
        root._teamTabsInstance = null;
      },
    };

    activate(tabs.find((tab) => tab.dataset.teamTab === "board") || tabs[0], false);
    setOpen(group?.dataset.teamOpen === "true");
  });
}
