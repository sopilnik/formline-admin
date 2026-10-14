'use client'

import { useEffect } from 'react'

// How long the replacement of a removed control may take to appear (a refreshed page, a finished request) before the
// focus goes to the heading of the part of the page around it instead.
const REPLACEMENT_WAIT_MS = 4000
const CANDIDATES = 'a[href], button, input, select, textarea, [tabindex]'

/** What the keeper knows of the control that last held the focus inside the main area. */
type Held = { control: HTMLElement; key: string | null; ancestors: Element[]; path: string }

const shown = (element: Element): boolean => element.getClientRects().length > 0

function takesFocus(element: Element): element is HTMLElement {
  if (!(element instanceof HTMLElement) || element.tabIndex < 0 || !shown(element)) return false
  return !element.hasAttribute('disabled') && element.getAttribute('aria-hidden') !== 'true' && (element as HTMLInputElement).type !== 'hidden'
}

/** The element itself when it takes the focus, or the first element inside it that does. */
function firstFocusable(element: Element): HTMLElement | null {
  if (takesFocus(element)) return element
  return [...element.querySelectorAll(CANDIDATES)].find(takesFocus) ?? null
}

/** The control that took a removed one's place: the first that carries its `data-focus-key`, or sits inside a holder of it. */
function replacement(main: HTMLElement, key: string): HTMLElement | null {
  for (const holder of main.querySelectorAll(`[data-focus-key="${CSS.escape(key)}"]`)) {
    const found = firstFocusable(holder)
    if (found) return found
  }
  return null
}

/** The first heading of the nearest part of the page, around the removed control, that is still there. */
function headingNear(ancestors: Element[]): HTMLElement | null {
  for (const ancestor of ancestors) {
    if (!ancestor.isConnected) continue
    const heading = [...ancestor.querySelectorAll<HTMLElement>('h1, h2, h3')].find(shown)
    if (heading) return heading
  }
  return null
}

function ancestorsOf(control: HTMLElement, main: HTMLElement): Element[] {
  const ancestors: Element[] = []
  for (let element = control.parentElement; element; element = element.parentElement) {
    ancestors.push(element)
    if (element === main) break
  }
  return ancestors
}

/**
 * Keeps the keyboard's place when an action removes or replaces the control that held the focus, which would leave the
 * focus on the page body (WCAG 2.2, 2.4.3): the focus goes to the control that took its place — one that carries the same
 * `data-focus-key` — or, when none appears, to the heading of the part of the page around it. A dialog or a menu opened
 * from a control counts as that control's, so closing one after its action works the same way. A new page, a click
 * elsewhere and a focus the person moved themselves are left alone.
 */
export function FocusKeeper() {
  useEffect(() => {
    const main = document.getElementById('main')
    if (!main) return

    let held: Held | null = null
    let lostAt: number | null = null
    let timer: ReturnType<typeof setTimeout> | undefined

    const remember = (event: FocusEvent): void => {
      const control = event.target
      if (!(control instanceof HTMLElement) || control === main || !main.contains(control)) return
      held = { control, key: control.closest('[data-focus-key]')?.getAttribute('data-focus-key') ?? null, ancestors: ancestorsOf(control, main), path: location.pathname }
      lostAt = null
    }

    const restore = (): void => {
      if (!held || held.control.isConnected) return
      if (document.activeElement && document.activeElement !== document.body) return
      if (location.pathname !== held.path) {
        held = null
        return
      }

      const found = held.key ? replacement(main, held.key) : null
      lostAt ??= Date.now()
      if (!found && held.key && Date.now() - lostAt < REPLACEMENT_WAIT_MS) {
        clearTimeout(timer)
        timer = setTimeout(restore, REPLACEMENT_WAIT_MS)
        return
      }

      const target = found ?? headingNear(held.ancestors)
      held = null
      if (!target) return
      if (!target.hasAttribute('tabindex') && target.tabIndex < 0) target.tabIndex = -1
      target.focus()
    }

    // A click into nothing leaves the control in place and the focus on the body: the place is given up, so a later redraw
    // that removes the control does not move the focus on its own. Looked at a moment later, once a removal has shown.
    const letGo = (event: FocusEvent): void => {
      if (event.relatedTarget || !held || held.control !== event.target) return
      const left = held
      setTimeout(() => {
        if (held === left && left.control.isConnected && document.activeElement === document.body) held = null
      })
    }

    // The removal may happen inside the main area or in a dialog or a menu's own layer, so the whole body is watched.
    const observer = new MutationObserver(restore)
    observer.observe(document.body, { childList: true, subtree: true })
    document.addEventListener('focusin', remember)
    document.addEventListener('focusout', letGo)
    return () => {
      observer.disconnect()
      document.removeEventListener('focusin', remember)
      document.removeEventListener('focusout', letGo)
      clearTimeout(timer)
    }
  }, [])

  return null
}
