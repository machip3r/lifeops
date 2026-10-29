"use client";

import { useEffect, type RefObject } from "react";
import { navigationGuardRuntime } from "@/lib/navigation-guard-listener";

/**
 * While `active` (a delete, save or import is running) the user can't leave or cancel it:
 * closing / reloading the tab warns, back and in-app links are cancelled, and focus stays in
 * `containerRef` (Escape and Tab do nothing). Mouse clicks are stopped by the caller's
 * full-screen backdrop.
 */
export function useBusyLock(active: boolean, containerRef: RefObject<HTMLElement | null>) {
  useEffect(() => {
    if (!active) return;
    const container = containerRef.current;
    const inside = (node: unknown) => node instanceof Node && container != null && container.contains(node);
    if (!inside(document.activeElement)) container?.focus({ preventScroll: true });

    navigationGuardRuntime.locked += 1;
    navigationGuardRuntime.lockPath = `${window.location.pathname}${window.location.search}`;

    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape" && event.key !== "Tab") return;
      // A dialog stacked on top keeps its own keys
      const focus = document.activeElement;
      if (focus && focus !== document.body && !inside(focus)) return;
      event.preventDefault();
      event.stopPropagation();
      container?.focus({ preventScroll: true });
    };
    const onNavigate = (event: Event) => {
      const nav = event as Event & { navigationType?: string };
      if (nav.navigationType === "traverse" && event.cancelable) event.preventDefault();
    };

    const navigation = (window as Window & { navigation?: EventTarget }).navigation;
    window.addEventListener("beforeunload", onBeforeUnload);
    window.addEventListener("keydown", onKeyDown, true);
    navigation?.addEventListener("navigate", onNavigate);
    return () => {
      navigationGuardRuntime.locked = Math.max(0, navigationGuardRuntime.locked - 1);
      window.removeEventListener("beforeunload", onBeforeUnload);
      window.removeEventListener("keydown", onKeyDown, true);
      navigation?.removeEventListener("navigate", onNavigate);
    };
  }, [active, containerRef]);
}
