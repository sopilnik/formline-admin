const BROWSERS: [RegExp, string][] = [
  [/Edg\//, 'Edge'], [/OPR\//, 'Opera'], [/Firefox\//, 'Firefox'], [/Chrome\//, 'Chrome'], [/Safari\//, 'Safari'],
]
const SYSTEMS: [RegExp, string][] = [
  [/iPhone|iPad|iPod/, 'iOS'], [/Android/, 'Android'], [/CrOS/, 'ChromeOS'], [/Mac OS X|Macintosh/, 'macOS'],
  [/Windows/, 'Windows'], [/Linux/, 'Linux'],
]

const pick = (ua: string, list: [RegExp, string][], fallback: string): string =>
  list.find(([pattern]) => pattern.test(ua))?.[1] ?? fallback

/** "Chrome, Linux": enough to recognize a device in a session list or a sign-in letter, and the same in every language. */
export function summarizeUserAgent(ua: string | null): string | null {
  if (!ua) return null
  return `${pick(ua, BROWSERS, 'Browser')}, ${pick(ua, SYSTEMS, 'unknown system')}`
}
