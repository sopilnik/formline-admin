# Fonts

Served to the browser through `next/font/local` (`app/layout.tsx`):

- `InterVariable-latin-cyrillic.woff2` — Inter 4.1 (`web/InterVariable.woff2` of the upstream release), one subset
  with Latin and Cyrillic, variable weight and optical size axes, every OpenType feature kept (tabular figures
  included). Russian text and Russian headings use it.
- `SpaceGrotesk-Regular-latin.woff2`, `SpaceGrotesk-Bold-latin.woff2` — the Formline store's Latin subsets of Space
  Grotesk, used for English headings, the Formline name and figures. Space Grotesk has no Cyrillic.

Licenses: `Inter-OFL.txt` and `SpaceGrotesk-OFL.txt`, both SIL Open Font License 1.1.

Regenerate the Inter subset with `pyftsubset`:

    pyftsubset InterVariable.woff2 --flavor=woff2 --layout-features='*' \
      --output-file=InterVariable-latin-cyrillic.woff2 \
      --unicodes='U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+0301,U+0304,U+0308,U+0329,U+0400-045F,U+0490-0491,U+04B0-04B1,U+2000-206F,U+20AC,U+2116,U+2122,U+2191,U+2193,U+2212,U+2215,U+FEFF,U+FFFD'
