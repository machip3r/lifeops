'use client';

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { useRouter } from 'next/navigation';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { useAuth } from '@/contexts/auth-context';
import { navigationGuardRuntime } from '@/lib/navigation-guard-listener';

type LeaveGuardCopy = {
  title: string;
  description: string;
};

type PendingLeave =
  | { kind: 'href'; href: string }
  | { kind: 'sign-out' }
  | { kind: 'back'; delta: number };

type LeaveDialogState = LeaveGuardCopy & { pending: PendingLeave };

const NavigationGuardContext = createContext(false);

/**
 * While `active`, in-app navigation, sign-out, back, and tab close ask for confirmation.
 * The guard lives in the dashboard layout so the dialog stays up if a route starts to change.
 */
export function useNavigationBlock(active: boolean, copy: LeaveGuardCopy) {
  const insideGuard = useContext(NavigationGuardContext);
  const guardCopy = useMemo(
    () => (active ? { title: copy.title, description: copy.description } : null),
    [active, copy.title, copy.description],
  );

  useEffect(() => {
    if (!insideGuard) return;
    navigationGuardRuntime.copy = guardCopy;
    navigationGuardRuntime.active = guardCopy != null;
    if (guardCopy) {
      navigationGuardRuntime.path = `${window.location.pathname}${window.location.search}`;
    }
    return () => {
      if (navigationGuardRuntime.copy === guardCopy) {
        navigationGuardRuntime.copy = null;
        navigationGuardRuntime.active = false;
      }
    };
  }, [guardCopy, insideGuard]);

  if (!insideGuard) {
    throw new Error('useNavigationBlock must be used within NavigationGuardProvider');
  }
}

export function NavigationGuardProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const { signOut } = useAuth();
  const bypassRef = useRef(false);
  const dialogRef = useRef<PendingLeave | null>(null);
  const [dialog, setDialog] = useState<LeaveDialogState | null>(null);

  const closeDialog = () => {
    dialogRef.current = null;
    setDialog(null);
  };

  const confirmLeave = () => {
    const pending = dialog?.pending;
    closeDialog();
    if (!pending) return;
    if (pending.kind === 'href') {
      router.push(pending.href);
      return;
    }
    if (pending.kind === 'sign-out') {
      void signOut();
      return;
    }
    bypassRef.current = true;
    navigationGuardRuntime.bypass = true;
    window.history.go(pending.delta);
  };

  useEffect(() => {
    const openLeaveDialog = (pending: PendingLeave) => {
      const copy = navigationGuardRuntime.copy;
      if (!copy || dialogRef.current) return;
      dialogRef.current = pending;
      setDialog({ ...copy, pending });
    };

    navigationGuardRuntime.onBack = () => {
      openLeaveDialog({ kind: 'back', delta: -1 });
    };

    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      if (!navigationGuardRuntime.copy || bypassRef.current) return;
      event.preventDefault();
      event.returnValue = '';
    };

    const onClick = (event: MouseEvent) => {
      if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) {
        return;
      }
      const target = event.target;
      if (!(target instanceof Element)) return;

      const signOutButton = target.closest('[data-nav-guard="sign-out"]');
      const anchor = target.closest('a[href]');
      const link =
        anchor instanceof HTMLAnchorElement &&
        anchor.target !== '_blank' &&
        !anchor.hasAttribute('download')
          ? anchor
          : null;

      let href: string | null = null;
      if (link) {
        const url = new URL(link.href, window.location.href);
        if (url.origin !== window.location.origin) return;
        if (url.pathname === window.location.pathname && url.search === window.location.search) {
          return;
        }
        href = `${url.pathname}${url.search}${url.hash}`;
      }

      if (!signOutButton && !href) return;
      if (!navigationGuardRuntime.copy && !dialogRef.current) return;

      event.preventDefault();
      if (signOutButton) event.stopPropagation();
      if (dialogRef.current) return;

      if (signOutButton) {
        openLeaveDialog({ kind: 'sign-out' });
        return;
      }
      if (href) openLeaveDialog({ kind: 'href', href });
    };

    const onNavigate = (event: Event) => {
      const navEvent = event as Event & {
        navigationType?: string;
        canPreventDefault?: boolean;
      };
      if (navEvent.navigationType !== 'traverse') return;
      if (bypassRef.current) {
        bypassRef.current = false;
        return;
      }
      if (!navigationGuardRuntime.copy && !dialogRef.current) return;
      if (navEvent.canPreventDefault === false || navEvent.cancelable === false) return;
      event.preventDefault();
      openLeaveDialog({ kind: 'back', delta: -1 });
    };

    window.addEventListener('beforeunload', onBeforeUnload);
    document.addEventListener('click', onClick, true);
    const navigation = (window as Window & { navigation?: EventTarget }).navigation;
    navigation?.addEventListener('navigate', onNavigate);

    return () => {
      navigationGuardRuntime.onBack = null;
      window.removeEventListener('beforeunload', onBeforeUnload);
      document.removeEventListener('click', onClick, true);
      navigation?.removeEventListener('navigate', onNavigate);
    };
  }, []);

  return (
    <NavigationGuardContext.Provider value={true}>
      {children}
      <ConfirmDialog
        open={dialog != null}
        elevated
        title={dialog?.title ?? 'Importación en curso'}
        description={
          dialog?.description ??
          'Hay una importación en proceso. Si cambias de página o haces otra acción, no vas a ver el resultado.'
        }
        confirmLabel="Salir de todas formas"
        cancelLabel="Seguir aquí"
        confirmVariant="destructive"
        onConfirm={confirmLeave}
        onCancel={closeDialog}
      />
    </NavigationGuardContext.Provider>
  );
}
