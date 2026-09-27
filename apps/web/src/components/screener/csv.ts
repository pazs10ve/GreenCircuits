import type { FieldDef, LiveRow } from "./fields"

function cell(value: string | number | null): string {
  if (value == null) return ""
  const text = String(value)
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text
}

/** Raw numbers (no grouping or currency symbols) so spreadsheets read them as numbers. */
export function screenToCsv(rows: LiveRow[], fields: FieldDef[]): string {
  const header = ["Symbol", "Name", ...fields.map((f) => (f.unit === "text" ? f.label : `${f.label} (${f.unit})`))]
  const lines = rows.map((r) => {
    const values = fields.map((f) => {
      const v = f.get(r)
      if (typeof v === "number") return Number(v.toFixed(Math.max(2, f.decimals)))
      return v
    })
    return [r.symbol, r.name, ...values].map(cell).join(",")
  })
  return [header.map(cell).join(","), ...lines].join("\r\n")
}

/** Save text as a file via a temporary Blob URL. The BOM lets Excel read ₹ and other UTF-8 text. */
export function downloadCsv(csv: string, filename: string) {
  const blob = new Blob(["﻿", csv], { type: "text/csv;charset=utf-8" })
  const url = URL.createObjectURL(blob)
  const a = document.createElement("a")
  a.href = url
  a.download = filename
  a.rel = "noopener"
  document.body.appendChild(a)
  a.click()
  a.remove()
  // Give the browser a moment to start the download before releasing the URL.
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
