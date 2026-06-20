import * as React from 'react';
import { Sun, Moon, Monitor } from 'lucide-react';
import { Button } from '../ui/button';
import { getTheme, setTheme, watchSystemTheme, type Theme } from '../../lib/theme';

const ORDER: Theme[] = ['light', 'dark', 'system'];
const ICON: Record<Theme, React.ComponentType<{ className?: string }>> = {
  light: Sun,
  dark: Moon,
  system: Monitor,
};
const LABEL: Record<Theme, string> = {
  light: 'Light theme',
  dark: 'Dark theme',
  system: 'System theme',
};

// Topbar theme switch (FR-3/FR-4): cycles light → dark → system; applies via
// a single data-theme flip, persists the choice, and tracks the OS while "system".
export function ThemeToggle() {
  const [theme, setLocal] = React.useState<Theme>(() => getTheme());

  React.useEffect(() => watchSystemTheme(() => setLocal(getTheme())), []);

  const cycle = () => {
    const next = ORDER[(ORDER.indexOf(theme) + 1) % ORDER.length]!;
    setTheme(next);
    setLocal(next);
  };

  const Icon = ICON[theme];
  return (
    <Button
      variant="ghost"
      size="icon"
      onClick={cycle}
      aria-label={`${LABEL[theme]} (click to change)`}
      title={LABEL[theme]}
    >
      <Icon />
    </Button>
  );
}
