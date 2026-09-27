"use client"

import { useState } from "react"
import { ChevronsUpDown } from "lucide-react"
import { getInstrument } from "@greencircuits/market/catalog"
import type { Instrument } from "@greencircuits/market/types"
import { Button } from "@/components/ui/button"
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { cn } from "@/lib/utils"

export interface PickerGroup {
  heading: string
  items: Instrument[]
  /** Right-hand detail, e.g. the lot size. */
  detail?: (inst: Instrument) => string
  /** Label shown for the selected item, e.g. "NIFTY 50 FUT". */
  label?: (inst: Instrument) => string
}

/** Searchable instrument selector: a button that opens a command list in a popover. */
export function InstrumentPicker({
  id,
  value,
  onChange,
  groups,
  placeholder = "Search symbol or company",
  className,
  invalid,
}: {
  id?: string
  value: number | undefined
  onChange: (id: number) => void
  groups: PickerGroup[]
  placeholder?: string
  className?: string
  invalid?: boolean
}) {
  const [open, setOpen] = useState(false)
  const selected = value != null ? getInstrument(value) : undefined
  const group = selected ? groups.find((g) => g.items.some((i) => i.id === selected.id)) : undefined
  const label = selected ? (group?.label?.(selected) ?? selected.symbol) : undefined

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          id={id}
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          aria-invalid={invalid}
          className={cn("h-8 w-full justify-between gap-2 px-2.5 font-normal", className)}
        >
          {selected ? (
            <span className="flex min-w-0 items-baseline gap-2">
              <span className="font-semibold">{label}</span>
              <span className="truncate text-[11px] text-muted-foreground">{selected.name}</span>
            </span>
          ) : (
            <span className="text-muted-foreground">{placeholder}</span>
          )}
          <ChevronsUpDown className="size-3.5 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-(--radix-popover-trigger-width) min-w-72 p-0">
        <Command>
          <CommandInput placeholder={placeholder} />
          <CommandList className="scrollbar-thin max-h-72">
            <CommandEmpty>No match. Search by symbol or company name.</CommandEmpty>
            {groups.map((g) => (
              <CommandGroup key={g.heading} heading={g.heading}>
                {g.items.map((inst) => (
                  <CommandItem
                    key={inst.id}
                    value={`${inst.symbol} ${inst.name} ${g.heading}`}
                    data-checked={inst.id === value}
                    onSelect={() => {
                      onChange(inst.id)
                      setOpen(false)
                    }}
                  >
                    <span className="w-28 shrink-0 truncate font-medium">{g.label?.(inst) ?? inst.symbol}</span>
                    <span className="min-w-0 flex-1 truncate text-muted-foreground">{inst.name}</span>
                    {g.detail && <span className="num shrink-0 text-[11px] text-muted-foreground">{g.detail(inst)}</span>}
                  </CommandItem>
                ))}
              </CommandGroup>
            ))}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}
