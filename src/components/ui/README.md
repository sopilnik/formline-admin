# UI primitives

These files come from the shadcn/ui CLI (style `base-nova`, on Base UI) and were adapted for this panel: focus is one
solid `outline-ring` outline instead of the translucent ring, and checked controls use the `selected` token instead of
`primary`, which stays for primary buttons and links (spec §11; `tests/unit/ui-rules.test.ts` keeps it that way).
The checkbox also draws its indeterminate state (a minus sign) in the `selected` colours, and the toggle marks its
pressed state with them.
`toast.tsx` is written for Base UI's Toast, because sonner injects a `<style>` element the Content Security Policy
blocks. `cn` comes from `@/lib/utils`, not the `cn` package the CLI imports by default. The primitives keep the CLI's
double-quote style so they stay diffable against `shadcn add`, and the lint style rules exclude this directory.
shadcn/ui and Base UI are MIT licensed, lucide-react is ISC licensed.
