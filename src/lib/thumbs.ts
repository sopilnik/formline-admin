/** The small copy of a poster or an upload that the lists show: cut to fill 120 × 170 px, WebP at quality 75. */
export const THUMB = { width: 120, height: 170, quality: 75 } as const

/** The address of an image's small copy: a template poster's file under /posters/thumb/, an upload's own with ?size=thumb. */
export function thumbSrc(src: string): string {
  if (src.startsWith('/posters/')) {
    return `/posters/thumb/${src.slice('/posters/'.length)}`
  }

  return `${src}?size=thumb`
}
