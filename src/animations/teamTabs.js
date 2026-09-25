import { gsap, ScrollTrigger } from "../lib/gsap.js";

const REVEAL_DURATION = 0.45;
const REVEAL_EASE = "power2.out";
const REVEAL_STAGGER = 0.04;
const ENTRY_REVEAL_STAGGER = 0.06;
const REVEAL_DISTANCE = 12;

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
    let revealTween = null;
    let revealRows = [];
    let entryTrigger = null;
    let entryRows = [];
    let entryPending = false;

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

    const clearReveal = () => {
      revealTween?.kill();
      revealTween = null;
      if (revealRows.length) gsap.set(revealRows, { clearProps: "opacity,transform" });
      revealRows = [];
    };

    const cancelEntryReveal = () => {
      entryTrigger?.kill();
      entryTrigger = null;
      if (entryRows.length) gsap.set(entryRows, { clearProps: "opacity,transform" });
      entryRows = [];
      entryPending = false;
    };

    const revealPanel = (panel, stagger = REVEAL_STAGGER) => {
      if (!panel) return;
      const rows = [...panel.querySelectorAll("[data-team-list] [data-team-row]")];
      revealRows = rows;
      if (!rows.length || window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
        if (rows.length) gsap.set(rows, { clearProps: "opacity,transform" });
        revealRows = [];
        return;
      }

      revealTween = gsap.fromTo(
        rows,
        { opacity: 0, y: REVEAL_DISTANCE },
        {
          opacity: 1,
          y: 0,
          duration: REVEAL_DURATION,
          ease: REVEAL_EASE,
          stagger: { each: Math.min(stagger, 0.55 / rows.length) },
          clearProps: "opacity,transform",
          onComplete: () => {
            revealTween = null;
            revealRows = [];
          },
        },
      );
    };

    const activate = (tab, announce = true) => {
      if (!tab || !tabs.includes(tab)) return;
      const id = tab.dataset.teamTab;
      const alreadyActive = panels.some(
        (panel) => panel.dataset.teamPanel === id && panel.dataset.teamActive === "true",
      );

      if (isSubtab(tab)) setOpen(true);
      if (id === "board") setOpen(false);
      if (announce && entryPending) cancelEntryReveal();
      if (alreadyActive && announce) return;

      clearReveal();

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

      if (!alreadyActive && announce) revealPanel(panels.find((panel) => panel.dataset.teamPanel === id));
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
        cancelEntryReveal();
        clearReveal();
        tabs.forEach((tab) => {
          tab.removeEventListener("click", onTabClick);
          tab.removeEventListener("keydown", onTabKeyDown);
        });
        toggle?.removeEventListener("click", onToggle);
        root._teamTabsInstance = null;
      },
    };

    const initialTab = tabs.find((tab) => tab.dataset.teamTab === "board") || tabs[0];
    activate(initialTab, false);
    setOpen(group?.dataset.teamOpen === "true");

    const activePanel = panels.find((panel) => panel.dataset.teamActive === "true");
    const activeList = activePanel?.querySelector("[data-team-list]");
    const reducedMotion = window.matchMedia?.(
      "(prefers-reduced-motion: reduce)",
    ).matches;

    if (!reducedMotion && activePanel && activeList) {
      entryRows = [...activePanel.querySelectorAll("[data-team-list] [data-team-row]")];
      if (entryRows.length) {
        gsap.set(entryRows, { opacity: 0, y: REVEAL_DISTANCE });
        entryPending = true;
        entryTrigger = ScrollTrigger.create({
          trigger: activeList,
          start: "clamp(top 80%)",
          once: true,
          onEnter: () => {
            entryPending = false;
            entryRows = [];
            revealPanel(activePanel, ENTRY_REVEAL_STAGGER);
          },
        });
      }
    }
  });
}
