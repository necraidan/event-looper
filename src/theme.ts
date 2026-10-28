import { useEffect, useState } from 'react';

export const THEMES = [
  { id: 'arcade', dark: true },
  { id: 'metro', dark: false },
  { id: 'blueprint', dark: true },
  { id: 'brutalist', dark: false },
  { id: 'rpg', dark: true },
] as const;

export type ThemeId = (typeof THEMES)[number]['id'];

const STORAGE_KEY = 'event-looper:theme';

function storedTheme(): ThemeId {
  try {
    const value = localStorage.getItem(STORAGE_KEY);
    const theme = THEMES.find((t) => t.id === value);
    if (theme) return theme.id;
  } catch {
    // Storage may be unavailable (private mode…): use the default theme.
  }
  return 'brutalist';
}

export function useTheme() {
  const [theme, setTheme] = useState<ThemeId>(storedTheme);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    try {
      localStorage.setItem(STORAGE_KEY, theme);
    } catch {
      // Ignore: the choice just won't be remembered.
    }
  }, [theme]);

  const dark = THEMES.find((t) => t.id === theme)?.dark ?? true;
  return { theme, setTheme, dark };
}
