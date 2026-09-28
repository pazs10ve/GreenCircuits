"use client"

import { useState } from "react"
import { Tabs as TabsPrimitive } from "radix-ui"

export interface PageTab {
  id: string
  label: string
  content: React.ReactNode
}

/**
 * A page's views as tabs under its header: one thing at a time, the rest a
 * click away. The open tab is kept in the address (?tab=…), so a view can be
 * linked to, and switching doesn't go back to the server. With a single view
 * there is nothing to switch between, and no tabs.
 */
export function PageTabs({ tabs, initial, label }: { tabs: PageTab[]; initial?: string; label: string }) {
  const first = tabs[0]!.id
  const [value, setValue] = useState(initial && tabs.some((t) => t.id === initial) ? initial : first)
  if (tabs.length === 1) return <div className="mt-5">{tabs[0]!.content}</div>

  const change = (next: string) => {
    setValue(next)
    const url = new URL(window.location.href)
    if (next === first) url.searchParams.delete("tab")
    else url.searchParams.set("tab", next)
    window.history.replaceState(window.history.state, "", url)
  }
  return (
    <TabsPrimitive.Root value={value} onValueChange={change} className="mt-4">
      <TabsPrimitive.List aria-label={label} className="no-scrollbar flex overflow-x-auto border-b border-rule max-sm:-mx-(--gutter) max-sm:px-(--gutter)">
        {tabs.map((t) => (
          <TabsPrimitive.Trigger
            key={t.id}
            value={t.id}
            className="-mb-px flex h-11 shrink-0 items-center border-b-2 border-transparent px-3 text-sm font-medium whitespace-nowrap text-ink-3 transition-colors outline-none first:pl-0 hover:text-ink focus-visible:text-ink focus-visible:underline data-[state=active]:border-ink data-[state=active]:font-semibold data-[state=active]:text-ink"
          >
            {t.label}
          </TabsPrimitive.Trigger>
        ))}
      </TabsPrimitive.List>
      {tabs.map((t) => (
        <TabsPrimitive.Content key={t.id} value={t.id} className="mt-5 outline-none">
          {t.content}
        </TabsPrimitive.Content>
      ))}
    </TabsPrimitive.Root>
  )
}
