"use client"

import { useState } from "react"
import { Download, Monitor, Moon, Sun, Trash2, Volume2 } from "lucide-react"
import { useTheme } from "next-themes"
import { toast } from "sonner"
import { Panel } from "@/components/shell/page-header"
import { Segmented } from "@/components/market/segmented"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Field, FieldContent, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Switch } from "@/components/ui/switch"
import { useHydrated } from "@/hooks/use-hydrated"
import { usePreferences, type Preferences } from "@/lib/stores/preferences"

const EXPERIENCE: { value: Preferences["experience"]; label: string }[] = [
  { value: "learning", label: "Learning the basics" },
  { value: "investor", label: "Long-term investor" },
  { value: "trader", label: "Active trader" },
  { value: "quant", label: "Systematic or quant" },
]

function Row({ id, title, description, children }: { id: string; title: string; description: string; children: React.ReactNode }) {
  return (
    <Field orientation="horizontal" className="items-center justify-between gap-6 px-4 py-3.5">
      <FieldContent>
        <FieldLabel htmlFor={id}>{title}</FieldLabel>
        <FieldDescription>{description}</FieldDescription>
      </FieldContent>
      {children}
    </Field>
  )
}

export function SettingsView() {
  const prefs = usePreferences()
  const { theme, setTheme } = useTheme()
  const hydrated = useHydrated()

  return (
    <div className="flex flex-col gap-4 pb-8">
      <ProfilePanel key={hydrated ? `${prefs.displayName}|${prefs.email}|${prefs.experience}` : "ssr"} />

      <Panel title="Appearance and behaviour">
        <div className="divide-y divide-border/60">
          <Field orientation="horizontal" className="items-center justify-between gap-6 px-4 py-3.5">
            <FieldContent>
              <FieldLabel>Theme</FieldLabel>
              <FieldDescription>Dark suits long sessions; light is easier in daylight.</FieldDescription>
            </FieldContent>
            <Segmented
              value={hydrated ? (theme ?? "system") : "system"}
              onChange={setTheme}
              options={[
                { value: "light", label: <span className="flex items-center gap-1"><Sun className="size-3" /> Light</span> },
                { value: "dark", label: <span className="flex items-center gap-1"><Moon className="size-3" /> Dark</span> },
                { value: "system", label: <span className="flex items-center gap-1"><Monitor className="size-3" /> System</span> },
              ]}
              aria-label="Theme"
            />
          </Field>
          <Row id="pref-flash" title="Flash prices when they change" description="A brief green or red tint on every tick. Off if you prefer calm screens.">
            <Switch id="pref-flash" checked={prefs.flashPrices} onCheckedChange={(v) => prefs.set({ flashPrices: v })} />
          </Row>
          <Row id="pref-sound" title="Play a sound when an alert triggers" description="A short tone alongside the notification.">
            <div className="flex items-center gap-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  try {
                    const ctx = new AudioContext()
                    const osc = ctx.createOscillator()
                    const gain = ctx.createGain()
                    osc.frequency.value = 880
                    gain.gain.setValueAtTime(0.08, ctx.currentTime)
                    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.25)
                    osc.connect(gain).connect(ctx.destination)
                    osc.start()
                    osc.stop(ctx.currentTime + 0.25)
                  } catch {
                    toast("Your browser blocked audio")
                  }
                }}
              >
                <Volume2 /> Test
              </Button>
              <Switch id="pref-sound" checked={prefs.alertSound} onCheckedChange={(v) => prefs.set({ alertSound: v })} />
            </div>
          </Row>
        </div>
      </Panel>

      <Panel title="Notifications" description="Delivery by email and Telegram starts once accounts are enabled">
        <div className="divide-y divide-border/60">
          <Row id="pref-brief" title="Pre-market brief" description="Global cues, GIFT Nifty, results and IPOs for the day, at 08:45 IST on trading days.">
            <Switch id="pref-brief" checked={prefs.premarketBrief} onCheckedChange={(v) => prefs.set({ premarketBrief: v })} />
          </Row>
          <Row id="pref-weekly" title="Weekly portfolio summary" description="Performance against the Nifty and upcoming events for your holdings, Sundays at 18:00 IST.">
            <Switch id="pref-weekly" checked={prefs.weeklySummary} onCheckedChange={(v) => prefs.set({ weeklySummary: v })} />
          </Row>
          <Field orientation="horizontal" className="items-center justify-between gap-6 px-4 py-3.5">
            <FieldContent>
              <FieldLabel>Telegram</FieldLabel>
              <FieldDescription>Alerts from the GreenCircuits bot. Linking needs an account.</FieldDescription>
            </FieldContent>
            <span className="text-[11px] text-muted-foreground">Not linked</span>
          </Field>
        </div>
      </Panel>

      <DataPanel />
    </div>
  )
}

function ProfilePanel() {
  const prefs = usePreferences()
  const [name, setName] = useState(prefs.displayName)
  const [email, setEmail] = useState(prefs.email)
  const [experience, setExperience] = useState(prefs.experience)
  const emailValid = email === "" || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
  const dirty = name !== prefs.displayName || email !== prefs.email || experience !== prefs.experience

  return (
    <Panel title="Profile" description="Shown in the sidebar and used to tailor defaults">
      <form
        className="p-4"
        onSubmit={(e) => {
          e.preventDefault()
          if (!emailValid || !name.trim()) return
          prefs.set({ displayName: name.trim(), email: email.trim(), experience })
          toast.success("Profile saved in this browser")
        }}
      >
        <FieldGroup className="grid gap-4 md:grid-cols-2">
          <Field>
            <FieldLabel htmlFor="profile-name">Display name</FieldLabel>
            <Input id="profile-name" value={name} onChange={(e) => setName(e.target.value)} maxLength={40} autoComplete="name" />
          </Field>
          <Field>
            <FieldLabel htmlFor="profile-email">Email</FieldLabel>
            <Input
              id="profile-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              aria-invalid={!emailValid}
              autoComplete="email"
            />
            <FieldDescription>For alert emails once accounts are enabled.</FieldDescription>
          </Field>
          <Field>
            <FieldLabel htmlFor="profile-experience">How you use markets</FieldLabel>
            <Select value={experience} onValueChange={(v) => setExperience(v as Preferences["experience"])}>
              <SelectTrigger id="profile-experience" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {EXPERIENCE.map((x) => (
                  <SelectItem key={x.value} value={x.value}>
                    {x.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
        </FieldGroup>
        <div className="mt-4 flex justify-end">
          <Button type="submit" disabled={!dirty || !emailValid || !name.trim()}>
            Save profile
          </Button>
        </div>
      </form>
    </Panel>
  )
}

const KEYS = ["gc.watchlists", "gc.alerts", "gc.preferences", "gc.portfolio", "gc.paper", "gc.journal"]

function DataPanel() {
  const [open, setOpen] = useState(false)

  const exportData = () => {
    const data: Record<string, unknown> = {}
    try {
      for (const key of KEYS) {
        const raw = window.localStorage.getItem(key)
        if (raw) data[key] = JSON.parse(raw)
      }
    } catch {
      toast.error("Couldn't read this browser's storage")
      return
    }
    const blob = new Blob([JSON.stringify({ exportedAt: new Date().toISOString(), data }, null, 2)], { type: "application/json" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = `greencircuits-export-${new Date().toISOString().slice(0, 10)}.json`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <Panel title="Your data" description="Everything you create in the demo stays in this browser">
      <div className="divide-y divide-border/60">
        <Field orientation="horizontal" className="items-center justify-between gap-6 px-4 py-3.5">
          <FieldContent>
            <FieldLabel>Export</FieldLabel>
            <FieldDescription>Watchlists, alerts, portfolio, paper trades, journal and preferences as JSON.</FieldDescription>
          </FieldContent>
          <Button variant="outline" onClick={exportData}>
            <Download /> Export
          </Button>
        </Field>
        <Field orientation="horizontal" className="items-center justify-between gap-6 px-4 py-3.5">
          <FieldContent>
            <FieldLabel>Reset the demo</FieldLabel>
            <FieldDescription>Clears everything above from this browser and restores the samples.</FieldDescription>
          </FieldContent>
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button variant="destructive">
                <Trash2 /> Reset
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-sm">
              <DialogHeader>
                <DialogTitle>Reset the demo?</DialogTitle>
                <DialogDescription>Your watchlists, alerts, portfolio, paper trades, journal and preferences will be deleted from this browser.</DialogDescription>
              </DialogHeader>
              <DialogFooter>
                <DialogClose asChild>
                  <Button variant="ghost">Cancel</Button>
                </DialogClose>
                <Button
                  variant="destructive"
                  onClick={() => {
                    try {
                      for (const key of KEYS) window.localStorage.removeItem(key)
                    } catch {
                      // Nothing stored.
                    }
                    window.location.reload()
                  }}
                >
                  Reset everything
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </Field>
      </div>
    </Panel>
  )
}
