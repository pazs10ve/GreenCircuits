import type { PeerRow } from "@/components/company/peers"
import { EQUITIES, marketCapCr } from "@greencircuits/market/catalog"
import { fiftyTwoWeek, returnsOver } from "@greencircuits/market/history"
import { getFundamentals } from "@greencircuits/market/fundamentals"
import { upcomingEvents, type MarketEvent } from "@greencircuits/market/reference"
import { companyProfile, type CompanyProfile } from "@greencircuits/market/research/company"
import { sipAgainstIndex, sipVsDip, type Experiment } from "@greencircuits/market/research/experiments"
import type { Instrument } from "@greencircuits/market/types"
import { istNoon } from "./api"
import { liveGet } from "./market"

export interface CompanyData {
  profile: CompanyProfile
  high52: number
  experiments: Experiment[]
  peers: PeerRow[]
  events: MarketEvent[]
  source: "api" | "demo"
}

interface ApiCompany extends Omit<CompanyData, "events" | "source"> {
  events: (Omit<MarketEvent, "date"> & { date: string })[]
}

/** A company page's data: from the API (Postgres), or the demo generators when no backend is running. */
export async function getCompany(inst: Instrument): Promise<CompanyData> {
  const api = await liveGet<ApiCompany>(`/v1/companies/${inst.slug}`, { revalidate: 60 })
  if (api) return { ...api, events: api.events.map((e) => ({ ...e, date: istNoon(e.date) })), source: "api" }

  const peers = EQUITIES.filter((e) => e.sector === inst.sector)
    .sort((a, b) => marketCapCr(b, b.prevClose) - marketCapCr(a, a.prevClose))
    .slice(0, 6)
    .map((p) => {
      const f = getFundamentals(p)
      return { id: p.id, slug: p.slug, name: p.name, mcapCr: marketCapCr(p, p.prevClose), pe: f.pe, roe: f.roe, growth: f.profitCagr3y, return1y: returnsOver(p, 250) }
    })
  return {
    profile: companyProfile(inst),
    high52: fiftyTwoWeek(inst).high,
    experiments: [sipAgainstIndex(inst), sipVsDip(inst, { years: 5, dip: 0.2 })],
    peers,
    events: upcomingEvents().filter((e) => e.instrumentId === inst.id),
    source: "demo",
  }
}
