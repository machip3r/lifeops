/**
 * Registers a popstate listener as soon as this module loads on the client,
 * before Next.js attaches its own listener in an effect. Browsers that still
 * emit popstate can then stay on the page while an import is running.
 */

export const navigationGuardRuntime = {
  active: false,
  path: '',
  bypass: false,
  installed: false,
  copy: null as { title: string; description: string } | null,
  onBack: null as null | (() => void),
};

export function installNavigationGuardListener(): void {
  if (typeof window === 'undefined') return;
  if (navigationGuardRuntime.installed) return;
  navigationGuardRuntime.installed = true;

  window.addEventListener('popstate', (event) => {
    const runtime = navigationGuardRuntime;
    if (runtime.bypass) {
      runtime.bypass = false;
      return;
    }
    if (!runtime.active || !runtime.onBack) return;
    const here = `${window.location.pathname}${window.location.search}`;
    if (!runtime.path || here === runtime.path) return;
    event.stopImmediatePropagation();
    History.prototype.pushState.call(window.history, window.history.state, '', runtime.path);
    runtime.onBack();
  });
}
