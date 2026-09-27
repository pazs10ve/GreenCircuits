"use client"

import { Field, FieldDescription, FieldLabel } from "@/components/ui/field"
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { Panel } from "@/components/shell/page-header"
import type { Check } from "@/lib/lab/validate"
import { cn } from "@/lib/utils"

/** Hides the browser's number spinners; the fields are typed into, not clicked. */
export const NO_SPIN = "[appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"

export function readNumber(e: React.ChangeEvent<HTMLInputElement>): number {
  return e.target.value === "" ? Number.NaN : e.target.valueAsNumber
}

/** Numbered builder section with an issue count in the header. */
export function BuilderSection({
  id,
  step,
  title,
  description,
  issues,
  actions,
  children,
}: {
  id: string
  step: number
  title: string
  description?: string
  issues?: { errors: Check[]; warnings: Check[] }
  actions?: React.ReactNode
  children: React.ReactNode
}) {
  const errors = issues?.errors.length ?? 0
  const warnings = issues?.warnings.length ?? 0
  return (
    <div id={id} className="scroll-mt-16">
      <Panel
        title={
          <span className="flex items-center gap-2">
            <span className="num flex size-5 shrink-0 items-center justify-center rounded-full border text-[10px] font-semibold text-muted-foreground">
              {step}
            </span>
            {title}
          </span>
        }
        description={description}
        actions={
          <>
            {errors > 0 && <span className="num text-[11px] font-medium text-destructive">{errors === 1 ? "1 error" : `${errors} errors`}</span>}
            {errors === 0 && warnings > 0 && <span className="num text-[11px] font-medium text-warning">{warnings === 1 ? "1 warning" : `${warnings} warnings`}</span>}
            {actions}
          </>
        }
        bodyClassName="p-4"
      >
        {children}
      </Panel>
    </div>
  )
}

export function NumberField({
  id,
  label,
  value,
  onChange,
  prefix,
  suffix,
  step = 1,
  min,
  max,
  hint,
  disabled,
  invalid,
  className,
}: {
  id: string
  label: React.ReactNode
  value: number
  onChange: (value: number) => void
  prefix?: React.ReactNode
  suffix?: React.ReactNode
  step?: number
  min?: number
  max?: number
  hint?: React.ReactNode
  disabled?: boolean
  invalid?: boolean
  className?: string
}) {
  return (
    <Field className={cn("gap-1.5", className)} data-disabled={disabled || undefined}>
      <FieldLabel htmlFor={id} className="text-[11px] text-muted-foreground">
        {label}
      </FieldLabel>
      <InputGroup>
        {prefix && <InputGroupAddon>{prefix}</InputGroupAddon>}
        <InputGroupInput
          id={id}
          type="number"
          inputMode="decimal"
          value={Number.isFinite(value) ? value : ""}
          onChange={(e) => onChange(readNumber(e))}
          step={step}
          min={min}
          max={max}
          disabled={disabled}
          aria-invalid={invalid || !Number.isFinite(value) || undefined}
          className={cn("num", NO_SPIN)}
        />
        {suffix && <InputGroupAddon align="inline-end">{suffix}</InputGroupAddon>}
      </InputGroup>
      {hint && <FieldDescription className="text-[11px]">{hint}</FieldDescription>}
    </Field>
  )
}

/** A switch with a label, and optional controls that apply when it is on. */
export function ToggleRow({
  id,
  label,
  description,
  checked,
  onCheckedChange,
  children,
  className,
}: {
  id: string
  label: React.ReactNode
  description?: React.ReactNode
  checked: boolean
  onCheckedChange: (on: boolean) => void
  children?: React.ReactNode
  className?: string
}) {
  return (
    <div className={cn("flex flex-wrap items-center gap-x-3 gap-y-2 rounded-md border bg-background/40 px-3 py-2", className)}>
      <div className="flex min-w-0 flex-1 items-center gap-2.5">
        <Switch id={id} checked={checked} onCheckedChange={onCheckedChange} />
        <div className="min-w-0">
          <Label htmlFor={id} className="text-xs">
            {label}
          </Label>
          {description && <p className="mt-0.5 text-[11px] text-muted-foreground">{description}</p>}
        </div>
      </div>
      {children && <div className={cn("flex items-center gap-2", !checked && "opacity-50")}>{children}</div>}
    </div>
  )
}

/** Compact numeric input for inline use inside rows (rule parameters, leg lots). */
export function InlineNumber({
  value,
  onChange,
  label,
  className,
  step = 1,
  min,
  suffix,
  disabled,
}: {
  value: number
  onChange: (v: number) => void
  label: string
  className?: string
  step?: number
  min?: number
  suffix?: string
  disabled?: boolean
}) {
  return (
    <InputGroup className={cn("h-7 w-20", className)}>
      <InputGroupInput
        type="number"
        inputMode="decimal"
        aria-label={label}
        value={Number.isFinite(value) ? value : ""}
        onChange={(e) => onChange(readNumber(e))}
        step={step}
        min={min}
        disabled={disabled}
        aria-invalid={!Number.isFinite(value) || undefined}
        className={cn("num px-1.5 text-right", NO_SPIN)}
      />
      {suffix && (
        <InputGroupAddon align="inline-end" className="pr-1.5 text-[11px]">
          {suffix}
        </InputGroupAddon>
      )}
    </InputGroup>
  )
}
