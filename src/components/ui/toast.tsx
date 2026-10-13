"use client"

import * as React from "react"
import { Toast } from "@base-ui/react/toast"
import { XIcon } from "lucide-react"

import { cn } from "@/lib/utils"

// One manager for the page: the functions useToast hands out never change, so an effect may list them.
const toastManager = Toast.createToastManager()
const toasts = {
  success: (title: string, description?: string) => toastManager.add({ title, description, type: "success" }),
  error: (title: string, description?: string) => toastManager.add({ title, description, type: "error", priority: "high" }),
}

// Base UI Toast instead of sonner: sonner injects a <style> element at run
// time, which the nonce-based style-src-elem policy blocks.
function ToastProvider({ children, closeLabel, regionLabel }: { children: React.ReactNode; closeLabel: string; regionLabel: string }) {
  return (
    <Toast.Provider toastManager={toastManager}>
      {children}
      <Toast.Portal>
        <Toast.Viewport aria-label={regionLabel} className="fixed right-4 bottom-4 z-50 flex w-[min(24rem,calc(100vw-2rem))] flex-col gap-2 outline-none">
          <ToastList closeLabel={closeLabel} />
        </Toast.Viewport>
      </Toast.Portal>
    </Toast.Provider>
  )
}

function ToastList({ closeLabel }: { closeLabel: string }) {
  const { toasts } = Toast.useToastManager()
  return toasts.map((toast) => (
    <Toast.Root
      key={toast.id}
      toast={toast}
      className={cn(
        "rounded-lg border bg-popover text-sm text-popover-foreground shadow-md transition-opacity duration-150 data-ending-style:opacity-0 data-starting-style:opacity-0",
        toast.type === "error" && "border-destructive"
      )}
    >
      <Toast.Content className="flex items-start gap-3 p-3">
        <div className="min-w-0 flex-1">
          <Toast.Title className="font-medium wrap-anywhere" />
          <Toast.Description className="text-muted-foreground" />
        </div>
        <Toast.Close
          aria-label={closeLabel}
          className="-m-1 inline-flex size-7 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-accent-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
        >
          <XIcon className="size-4" aria-hidden />
        </Toast.Close>
      </Toast.Content>
    </Toast.Root>
  ))
}

function useToast() {
  return toasts
}

export { ToastProvider, useToast }
