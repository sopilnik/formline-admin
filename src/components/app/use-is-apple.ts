import { useSyncExternalStore } from 'react'

// The platform does not change while the page is open: there is nothing to subscribe to.
const noSubscription = () => () => {}

/** An Apple device, whose shortcuts read ⌘ instead of Ctrl; the newer user-agent data first, the older platform string after. */
function isApple(): boolean {
  const data = (navigator as Navigator & { userAgentData?: { platform: string } }).userAgentData

  return /mac|iphone|ipad/i.test(data?.platform ?? navigator.platform)
}

/** Whether the device is an Apple one; false on the server and in the first render, so hydration matches. */
export function useIsApple(): boolean {
  return useSyncExternalStore(noSubscription, isApple, () => false)
}
