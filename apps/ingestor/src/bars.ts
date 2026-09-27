import type { Quote } from "@greencircuits/market/types"

export interface Bar {
  instrumentId: number
  /** Bar open time, Unix ms, on a minute boundary. */
  minute: number
  open: number
  high: number
  low: number
  close: number
  volume: number
}

interface Forming extends Bar {
  /** The day's cumulative volume when the bar opened. */
  volumeAtOpen: number
}

/**
 * Builds 1-minute bars from the quote stream. Quotes carry the day's
 * cumulative volume, so a bar's volume is the difference across the minute.
 */
export class BarAggregator {
  private forming = new Map<number, Forming>()
  private completed: Bar[] = []

  update(quotes: Quote[]): void {
    for (const q of quotes) {
      const minute = Math.floor(q.ts / 60_000) * 60_000
      const bar = this.forming.get(q.id)
      if (!bar || bar.minute !== minute) {
        if (bar) this.completed.push(strip(bar))
        this.forming.set(q.id, {
          instrumentId: q.id,
          minute,
          open: q.ltp,
          high: q.ltp,
          low: q.ltp,
          close: q.ltp,
          volume: 0,
          volumeAtOpen: bar ? bar.volumeAtOpen + bar.volume : q.volume,
        })
        continue
      }
      bar.high = Math.max(bar.high, q.ltp)
      bar.low = Math.min(bar.low, q.ltp)
      bar.close = q.ltp
      bar.volume = Math.max(0, q.volume - bar.volumeAtOpen)
    }
  }

  /** Completed bars since the last drain, plus the bars still forming (written as they stand). */
  drain(): Bar[] {
    const out = [...this.completed, ...[...this.forming.values()].map(strip)]
    this.completed = []
    return out
  }
}

function strip(b: Forming): Bar {
  return { instrumentId: b.instrumentId, minute: b.minute, open: b.open, high: b.high, low: b.low, close: b.close, volume: b.volume }
}
