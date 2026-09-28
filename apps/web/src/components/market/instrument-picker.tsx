"use client"

import { useState } from "react"
import { Plus } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { COMMODITIES, CURRENCIES, INDICES } from "@greencircuits/market/catalog"
import type { Instrument } from "@greencircuits/market/types"
import { searchCompanies } from "@/lib/search"
import { LiveChange } from "./price"

const OTHERS: { heading: string; items: Instrument[] }[] = [
  { heading: "Indices", items: INDICES },
  { heading: "Commodities", items: COMMODITIES },
  { heading: "Currencies", items: CURRENCIES },
]

/** Searchable instrument picker in a popover. */
export function InstrumentPicker({
  onSelect,
  exclude = [],
  trigger,
  placeholder = "Search symbol or company…",
  align = "end",
  stocksOnly = false,
}: {
  onSelect: (inst: Instrument) => void
  exclude?: number[]
  trigger?: React.ReactNode
  placeholder?: string
  align?: "start" | "center" | "end"
  /** Companies alone, for a holding or anything else that only a stock can be. */
  stocksOnly?: boolean
}) {
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState("")
  const groups = [{ heading: "Stocks", items: searchCompanies(search, { exclude }) }, ...(stocksOnly ? [] : OTHERS)]
  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next)
        if (!next) setSearch("")
      }}
    >
      <PopoverTrigger asChild>
        {trigger ?? (
          <Button size="lg">
            <Plus /> Add instrument
          </Button>
        )}
      </PopoverTrigger>
      <PopoverContent align={align} className="w-80 p-0">
        <Command>
          <CommandInput value={search} onValueChange={setSearch} placeholder={placeholder} />
          <CommandList className="max-h-80">
            <CommandEmpty>No match.</CommandEmpty>
            {groups.map((g) => {
              const items = g.items.filter((i) => !exclude.includes(i.id))
              if (items.length === 0) return null
              return (
                <CommandGroup key={g.heading} heading={g.heading}>
                  {items.map((inst) => (
                    <CommandItem
                      key={inst.id}
                      value={`${inst.symbol} ${inst.name}`}
                      onSelect={() => {
                        onSelect(inst)
                        setOpen(false)
                      }}
                    >
                      <span className="w-24 shrink-0 truncate font-medium">{inst.symbol}</span>
                      <span className="flex-1 truncate text-muted-foreground">{inst.name}</span>
                      <LiveChange id={inst.id} showAbsolute={false} className="text-[11px]" />
                    </CommandItem>
                  ))}
                </CommandGroup>
              )
            })}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}
