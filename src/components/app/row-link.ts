// A row's main link (an order number, a name, a subject) is a real link stretched over its row or card:
// underlined on hover and focus, no click handler on the row. The row carries `group/row relative`; the caller adds the
// weight. A plain module, so server components can read it as well.
export const ROW_LINK = 'underline decoration-border-strong underline-offset-3 group-hover/row:decoration-current focus-visible:decoration-current after:absolute after:inset-0'
