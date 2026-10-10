import localFont from 'next/font/local'

// The panel's two typefaces, shared by the root layout and the root error page (which replaces the layout). Inter carries
// Latin and Cyrillic in one file; Space Grotesk is Latin only (src/fonts/README.md).
export const inter = localFont({
  src: '../fonts/InterVariable-latin-cyrillic.woff2',
  weight: '100 900',
  variable: '--font-inter',
  display: 'swap',
})

export const spaceGrotesk = localFont({
  src: [
    { path: '../fonts/SpaceGrotesk-Regular-latin.woff2', weight: '400' },
    { path: '../fonts/SpaceGrotesk-Bold-latin.woff2', weight: '700' },
  ],
  variable: '--font-space-grotesk',
  display: 'swap',
})
