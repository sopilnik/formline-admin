// The order number is a real link stretched over its row or card (spec §8.2): underlined on hover and
// focus, no click handler on the row. A plain module, so server components can read it as well.
export const ORDER_LINK = 'font-semibold underline decoration-border-strong underline-offset-3 group-hover/row:decoration-current focus-visible:decoration-current after:absolute after:inset-0'
