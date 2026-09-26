export const THEME_COOKIE = 'formline_theme'
export const THEMES = ['system', 'light', 'dark'] as const
export type Theme = (typeof THEMES)[number]

export function parseTheme(value: string | undefined): Theme {
  return THEMES.includes(value as Theme) ? (value as Theme) : 'system'
}

/** The class on <html>: none for System, so the colour-scheme media query decides without a flash. */
export function themeClassName(theme: Theme): string | undefined {
  return theme === 'system' ? undefined : theme
}
