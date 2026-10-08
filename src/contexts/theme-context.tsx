'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useSyncExternalStore,
  type ReactNode,
} from 'react';

export type Theme = 'light' | 'dark';

const STORAGE_KEY = 'lifeops-theme';
const THEME_EVENT = 'lifeops-theme-change';

type ThemeContextValue = {
  theme: Theme;
  setTheme: (theme: Theme) => void;
  toggleTheme: () => void;
};

const ThemeContext = createContext<ThemeContextValue | undefined>(undefined);

function parseTheme(value: string | null): Theme {
  return value === 'light' || value === 'dark' ? value : 'dark';
}

function applyThemeClass(theme: Theme) {
  const root = document.documentElement;
  root.classList.toggle('dark', theme === 'dark');
  root.style.colorScheme = theme;
}

function subscribe(onStoreChange: () => void) {
  const onStorage = (event: StorageEvent) => {
    if (event.key === STORAGE_KEY) onStoreChange();
  };
  window.addEventListener('storage', onStorage);
  window.addEventListener(THEME_EVENT, onStoreChange);
  return () => {
    window.removeEventListener('storage', onStorage);
    window.removeEventListener(THEME_EVENT, onStoreChange);
  };
}

function getSnapshot(): Theme {
  return parseTheme(window.localStorage.getItem(STORAGE_KEY));
}

function getServerSnapshot(): Theme {
  return 'dark';
}

function writeTheme(next: Theme) {
  window.localStorage.setItem(STORAGE_KEY, next);
  applyThemeClass(next);
  window.dispatchEvent(new Event(THEME_EVENT));
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const theme = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  useEffect(() => {
    applyThemeClass(theme);
  }, [theme]);

  const setTheme = useCallback((next: Theme) => {
    writeTheme(next);
  }, []);

  const toggleTheme = useCallback(() => {
    writeTheme(getSnapshot() === 'dark' ? 'light' : 'dark');
  }, []);

  return (
    <ThemeContext.Provider value={{ theme, setTheme, toggleTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) {
    throw new Error('useTheme must be used within ThemeProvider');
  }
  return ctx;
}

/** Inline before paint — keep in sync with STORAGE_KEY / default dark. */
export const themeInitScript = `(function(){try{var t=localStorage.getItem('${STORAGE_KEY}');if(t!=='light'&&t!=='dark')t='dark';var r=document.documentElement;r.classList.toggle('dark',t==='dark');r.style.colorScheme=t;}catch(e){document.documentElement.classList.add('dark');}})();`;
