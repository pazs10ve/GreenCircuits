import { Redis } from "ioredis"
import { afterAll, beforeAll, describe, expect, it } from "vitest"
import { templateDefinition } from "@greencircuits/contracts/strategy"
import { createDb } from "@greencircuits/db"
import { buildApp } from "../src/app"
import { loadEnv } from "../src/env"
import { SESSION_COOKIE } from "../src/lib/session"
import { ALERTS_CHANGED } from "../src/modules/me"

/**
 * Integration tests: the real app against a migrated, seeded database and
 * Valkey (DATABASE_URL and VALKEY_URL, the local stack by default). Users
 * created here are deleted afterwards. With LAB_E2E=1 a Python worker must be
 * consuming the backtests queue, and the backtest is followed to its result.
 */

const env = loadEnv({ ...process.env, NODE_ENV: "test" })
const db = createDb(env.DATABASE_URL, 4)
const valkey = new Redis(env.VALKEY_URL, { maxRetriesPerRequest: 2 })
let app: Awaited<ReturnType<typeof buildApp>>
const createdUsers = new Set<string>()

type Method = "GET" | "POST" | "PUT" | "PATCH" | "DELETE"

/** A browser's cookie jar, reduced to the one cookie the API sets. */
class Visitor {
  cookie: string | null = null
  id: string | null = null

  async call(method: Method, url: string, body?: unknown) {
    const res = await app.inject({ method, url, payload: body as object | undefined, headers: this.cookie ? { cookie: this.cookie } : {} })
    const setCookie = ([] as string[]).concat(res.headers["set-cookie"] ?? []).find((c) => c.startsWith(`${SESSION_COOKIE}=`))
    if (setCookie) this.cookie = setCookie.split(";")[0]!
    return res
  }

  async signIn() {
    const res = await this.call("GET", "/v1/me")
    this.id = res.json().id
    createdUsers.add(this.id!)
    return this.id!
  }
}

async function instrumentId(slug: string): Promise<number> {
  const res = await app.inject({ method: "GET", url: `/v1/instruments/${slug}` })
  return res.json().id
}

beforeAll(async () => {
  app = await buildApp({ db, valkey, env })
})

afterAll(async () => {
  if (createdUsers.size) await db.deleteFrom("app.users").where("id", "in", [...createdUsers]).execute()
  await app.close()
  await db.destroy()
  valkey.disconnect()
})

describe("reference data", () => {
  it("is healthy", async () => {
    const res = await app.inject({ method: "GET", url: "/health" })
    expect(res.statusCode).toBe(200)
    expect(res.json()).toMatchObject({ status: "ok", db: { ok: true }, valkey: { ok: true } })
  })

  it("finds a company by the start of its symbol", async () => {
    const res = await app.inject({ method: "GET", url: "/v1/instruments?q=relia" })
    expect(res.json().items[0]).toMatchObject({ symbol: "RELIANCE", kind: "EQUITY", slug: "reliance" })
  })

  it("serves consistent daily bars, oldest first", async () => {
    const id = await instrumentId("reliance")
    const { candles } = (await app.inject({ method: "GET", url: `/v1/instruments/${id}/candles?sessions=120` })).json()
    expect(candles).toHaveLength(120)
    for (const [k, c] of candles.entries()) {
      expect(c.low).toBeLessThanOrEqual(Math.min(c.open, c.close))
      expect(c.high).toBeGreaterThanOrEqual(Math.max(c.open, c.close))
      if (k > 0) expect(c.time).toBeGreaterThan(candles[k - 1].time)
    }
  })

  it("answers quotes live, or from the last close when the feed is off", async () => {
    const id = await instrumentId("reliance")
    const body = (await app.inject({ method: "GET", url: `/v1/quotes?ids=1,${id}` })).json()
    expect(["SIMULATED", "EOD"]).toContain(body.source)
    expect(body.quotes.map((q: { id: number }) => q.id).sort((a: number, b: number) => a - b)).toEqual([1, id])
  })

  it("rejects bad input with a 400", async () => {
    const res = await app.inject({ method: "GET", url: "/v1/instruments/abc/candles" })
    expect(res.statusCode).toBe(400)
    expect(res.json().error).toBe("bad_request")
  })

  it("builds a company page from the database", async () => {
    const res = await app.inject({ method: "GET", url: "/v1/companies/reliance" })
    expect(res.statusCode).toBe(200)
    const body = res.json()
    expect(body.instrument.symbol).toBe("RELIANCE")
    expect(body.peers.length).toBeGreaterThan(0)
    expect(body.experiments).toHaveLength(2)
    expect((await app.inject({ method: "GET", url: "/v1/companies/no-such-company" })).statusCode).toBe(404)
  })

  it("has the day's context, IPOs, bonds and the yield curve", async () => {
    const today = (await app.inject({ method: "GET", url: "/v1/market/today" })).json()
    expect(today.ranges.length).toBeGreaterThan(40)
    expect(today.experiments).toHaveLength(3)
    expect((await app.inject({ method: "GET", url: "/v1/ipos" })).json().items.length).toBeGreaterThan(0)
    expect((await app.inject({ method: "GET", url: "/v1/bonds" })).json().items.length).toBeGreaterThan(0)
    expect((await app.inject({ method: "GET", url: "/v1/yield-curve" })).json().curves[0].points.length).toBeGreaterThan(3)
  })
})

describe("anonymous accounts", () => {
  it("doesn't create an account just to read", async () => {
    const visitor = new Visitor()
    const res = await visitor.call("GET", "/v1/me/watchlists")
    expect(res.json()).toEqual({ lists: [] })
    expect(visitor.cookie).toBeNull()
  })

  it("keeps a visitor on the same account", async () => {
    const visitor = new Visitor()
    const id = await visitor.signIn()
    const again = await visitor.call("GET", "/v1/me")
    expect(again.json().id).toBe(id)
    expect(again.headers["set-cookie"]).toBeUndefined()
  })

  it("ignores unsigned and forged cookies", async () => {
    const visitor = new Visitor()
    const id = await visitor.signIn()
    const value = decodeURIComponent(visitor.cookie!.slice(SESSION_COOKIE.length + 1))
    const forged = value.replace(/^./, (c) => (c === "a" ? "b" : "a"))
    for (const cookie of [`${SESSION_COOKIE}=${id}`, `${SESSION_COOKIE}=${encodeURIComponent(forged)}`]) {
      const res = await app.inject({ method: "GET", url: "/v1/me/alerts", headers: { cookie } })
      expect(res.json()).toEqual({ alerts: [] })
    }
  })
})

describe("your data", () => {
  it("replaces watchlists and drops unknown instruments", async () => {
    const visitor = new Visitor()
    await visitor.signIn()
    const [reliance, hdfc] = [await instrumentId("reliance"), await instrumentId("hdfcbank")]
    const put = await visitor.call("PUT", "/v1/me/watchlists", {
      lists: [
        { name: "Core", ids: [reliance, 999_999, reliance] },
        { name: "Banks", ids: [hdfc] },
      ],
    })
    expect(put.statusCode).toBe(200)
    const { lists } = (await visitor.call("GET", "/v1/me/watchlists")).json()
    expect(lists.map((l: { name: string; ids: number[] }) => [l.name, l.ids])).toEqual([
      ["Core", [reliance]],
      ["Banks", [hdfc]],
    ])
    const duplicate = await visitor.call("PUT", "/v1/me/watchlists", { lists: [{ name: "Core", ids: [] }, { name: "core", ids: [] }] })
    expect(duplicate.statusCode).toBe(400)
  })

  it("creates, pauses and deletes an alert, telling the alert engine each time", async () => {
    const visitor = new Visitor()
    const userId = await visitor.signIn()
    const subscriber = valkey.duplicate()
    await subscriber.subscribe(ALERTS_CHANGED)
    let announcements = 0
    subscriber.on("message", (_channel, message) => {
      if (message === userId) announcements += 1
    })

    const reliance = await instrumentId("reliance")
    const created = await visitor.call("POST", "/v1/me/alerts", { instrumentId: reliance, condition: "PRICE_ABOVE", value: 1500, channels: ["IN_APP"] })
    expect(created.statusCode).toBe(201)
    const alert = created.json().alert
    expect(alert).toMatchObject({ instrumentId: reliance, condition: "PRICE_ABOVE", value: 1500, status: "ACTIVE", repeat: false })

    const paused = await visitor.call("PATCH", `/v1/me/alerts/${alert.id}`, { status: "PAUSED" })
    expect(paused.json().alert.status).toBe("PAUSED")
    expect((await visitor.call("DELETE", `/v1/me/alerts/${alert.id}`)).statusCode).toBe(204)
    expect((await visitor.call("GET", "/v1/me/alerts")).json()).toEqual({ alerts: [] })

    // Someone else's alert is invisible.
    const stranger = new Visitor()
    await stranger.signIn()
    expect((await stranger.call("PATCH", `/v1/me/alerts/${alert.id}`, { status: "ACTIVE" })).statusCode).toBe(404)

    await expect.poll(() => announcements, { timeout: 2000 }).toBe(3)
    subscriber.disconnect()
  })

  it("imports holdings", async () => {
    const visitor = new Visitor()
    await visitor.signIn()
    const reliance = await instrumentId("reliance")
    const res = await visitor.call("PUT", "/v1/me/portfolio", { holdings: [{ instrumentId: reliance, qty: 10, avgPrice: 1300 }] })
    expect(res.json().holdings).toEqual([{ instrumentId: reliance, qty: 10, avgPrice: 1300 }])
  })
})

describe("backtests", () => {
  it("rejects a date range that ends before it starts", async () => {
    const visitor = new Visitor()
    const res = await visitor.call("POST", "/v1/me/backtests", {
      name: "Backwards",
      definition: templateDefinition("sip-vs-index", 1),
      from: "2025-01-01",
      to: "2024-01-01",
    })
    expect(res.statusCode).toBe(400)
  })

  it(
    "queues a run, and (with a worker) produces results that are cached for an identical request",
    async () => {
      const visitor = new Visitor()
      await visitor.signIn()
      const reliance = await instrumentId("reliance")
      // Four years ending a month ago, so the window always sits inside the seeded history.
      const to = new Date(Date.now() - 30 * 86_400_000)
      const from = new Date(to.getTime() - 4 * 365 * 86_400_000)
      const iso = (d: Date) => d.toISOString().slice(0, 10)
      const request = { name: "RSI dip on Reliance", definition: templateDefinition("rsi-dip", reliance), from: iso(from), to: iso(to) }

      const queued = await visitor.call("POST", "/v1/me/backtests", request)
      expect(queued.statusCode).toBe(202)
      const { runId } = queued.json()
      const status = (await visitor.call("GET", `/v1/me/backtests/${runId}`)).json()
      expect(["QUEUED", "RUNNING", "SUCCEEDED"]).toContain(status.run.status)

      // Runs are private.
      const stranger = new Visitor()
      await stranger.signIn()
      expect((await stranger.call("GET", `/v1/me/backtests/${runId}`)).statusCode).toBe(404)

      if (!process.env.LAB_E2E) return

      await expect
        .poll(async () => (await visitor.call("GET", `/v1/me/backtests/${runId}`)).json().run.status, { timeout: 60_000, interval: 500 })
        .toBe("SUCCEEDED")
      const done = (await visitor.call("GET", `/v1/me/backtests/${runId}`)).json()
      expect(done.result.metrics).toMatchObject({ cagr: expect.any(Number), max_drawdown: expect.any(Number), trades: expect.any(Number) })
      expect(done.result.equity_sample.length).toBeGreaterThan(100)
      expect(done.trades.length).toBe(done.result.metrics.trades)

      const again = await visitor.call("POST", "/v1/me/backtests", request)
      expect(again.statusCode).toBe(200)
      expect(again.json()).toEqual({ runId, status: "SUCCEEDED", cached: true })
    },
    90_000,
  )
})
