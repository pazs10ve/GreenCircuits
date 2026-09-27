import { randomUUID } from "node:crypto"
import { Redis } from "ioredis"
import { sql } from "kysely"
import { afterAll, beforeAll, describe, expect, it } from "vitest"
import { templateDefinition } from "@greencircuits/contracts/strategy"
import { createDb } from "@greencircuits/db"
import { buildApp } from "../src/app"
import { loadEnv } from "../src/env"
import { LEGACY_COOKIE, SESSION_COOKIE } from "../src/lib/session"
import { ALERTS_CHANGED } from "../src/modules/me"

/**
 * Integration tests: the real app against a migrated, seeded database and
 * Valkey (DATABASE_URL and VALKEY_URL, the local stack by default). Users
 * created here are deleted afterwards. With LAB_E2E=1 a Python worker must be
 * consuming the backtests queue, and the backtest is followed to its result.
 */

const env = loadEnv({ ...process.env, NODE_ENV: "test", AUTH_RATE_LIMIT_PER_MINUTE: "1000" })
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

  /** The first visit: an anonymous user and a session. */
  async start() {
    const res = await this.call("GET", "/v1/me")
    this.id = res.json().id
    createdUsers.add(this.id!)
    return this.id!
  }

  async signUp(email = newEmail(), password = PASSWORD, name?: string) {
    const res = await this.call("POST", "/v1/auth/signup", { email, password, name })
    if (res.statusCode === 201) {
      this.id = res.json().user.id
      createdUsers.add(this.id!)
    }
    return res
  }
}

const PASSWORD = "correct horse battery staple"
const newEmail = () => `test-${randomUUID()}@example.com`

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
    // Simulated, or real (delayed while NSE trades, closing prices otherwise) after `pnpm data:real`.
    expect(["SIMULATED", "DELAYED", "EOD"]).toContain(body.source)
    expect(["sample", "real"]).toContain(body.dataset)
    expect(body.quotes.map((q: { id: number }) => q.id).sort((a: number, b: number) => a - b)).toEqual([1, id])
  })

  it("has what the list pages draw: sparklines, 52-week ranges, history starts and index members", async () => {
    const body = (await app.inject({ method: "GET", url: "/v1/market/universe" })).json()
    const nifty = body.instruments.find((r: { id: number }) => r.id === 1)
    expect(nifty.spark).toHaveLength(30)
    expect(nifty.high52).toBeGreaterThanOrEqual(nifty.low52)
    expect(nifty.since).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    expect(body.members["1"].length).toBeGreaterThan(20)
    expect(Object.keys(body.eps).length).toBeGreaterThan(40)
  })

  it("has one screener row per stock", async () => {
    const { rows } = (await app.inject({ method: "GET", url: "/v1/screener/rows" })).json()
    expect(rows.length).toBeGreaterThan(40)
    expect(rows[0]).toMatchObject({ symbol: expect.any(String), sector: expect.any(String) })
    // Market value, largest first.
    expect(rows[0].mcapCr).toBeGreaterThanOrEqual(rows.at(-1).mcapCr ?? 0)
  })

  it("describes an index: its year, members and experiments", async () => {
    const res = await app.inject({ method: "GET", url: "/v1/market/overview/nifty-50" })
    expect(res.statusCode).toBe(200)
    const body = res.json()
    expect(body.high52).toBeGreaterThanOrEqual(body.low52)
    expect(body.members.length).toBeGreaterThan(20)
    expect(body.experiments).toHaveLength(2)
    // Stocks have company pages instead.
    expect((await app.inject({ method: "GET", url: "/v1/market/overview/reliance" })).statusCode).toBe(404)
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
    const id = await visitor.start()
    const again = await visitor.call("GET", "/v1/me")
    expect(again.json().id).toBe(id)
    expect(again.headers["set-cookie"]).toBeUndefined()
  })

  it("ignores unknown session tokens and forged cookies", async () => {
    const visitor = new Visitor()
    const id = await visitor.start()
    const token = decodeURIComponent(visitor.cookie!.slice(SESSION_COOKIE.length + 1))
    const forged = token.replace(/^./, (c) => (c === "a" ? "b" : "a"))
    for (const cookie of [`${SESSION_COOKIE}=${forged}`, `${LEGACY_COOKIE}=${id}`, `${LEGACY_COOKIE}=${encodeURIComponent(`${id}.forged`)}`]) {
      const res = await app.inject({ method: "GET", url: "/v1/me/alerts", headers: { cookie } })
      expect(res.json()).toEqual({ alerts: [] })
    }
  })

  it("moves a visitor with the old signed cookie onto a session", async () => {
    const { id } = await db.insertInto("app.users").values({ is_anonymous: true }).returning("id").executeTakeFirstOrThrow()
    createdUsers.add(id)
    const res = await app.inject({ method: "GET", url: "/v1/me", headers: { cookie: `${LEGACY_COOKIE}=${encodeURIComponent(app.signCookie(id))}` } })
    expect(res.json().id).toBe(id)
    const cookies = ([] as string[]).concat(res.headers["set-cookie"] ?? [])
    expect(cookies.some((c) => c.startsWith(`${SESSION_COOKIE}=`))).toBe(true)
    expect(cookies.some((c) => c.startsWith(`${LEGACY_COOKIE}=;`))).toBe(true)
  })
})

describe("accounts", () => {
  it("keeps what a visitor made when they sign up", async () => {
    const visitor = new Visitor()
    const anonymousId = await visitor.start()
    const before = visitor.cookie
    const reliance = await instrumentId("reliance")
    await visitor.call("PUT", "/v1/me/watchlists", { lists: [{ name: "Core", ids: [reliance] }] })

    const email = newEmail()
    const res = await visitor.signUp(email, PASSWORD, "Asha")
    expect(res.statusCode).toBe(201)
    expect(res.json().user).toMatchObject({ id: anonymousId, anonymous: false, email, name: "Asha", preferences: { style: "both", sectors: [] } })
    // A new session token, so the one from before signing up is useless.
    expect(visitor.cookie).not.toBe(before)
    expect((await app.inject({ method: "GET", url: "/v1/me/watchlists", headers: { cookie: before! } })).json()).toEqual({ lists: [] })
    expect((await visitor.call("GET", "/v1/me/watchlists")).json().lists[0]).toMatchObject({ name: "Core", ids: [reliance] })
  })

  it("refuses weak passwords and emails already in use", async () => {
    expect((await new Visitor().signUp(newEmail(), "password1")).json().error).toBe("weak_password")
    const email = newEmail()
    expect((await new Visitor().signUp(email)).statusCode).toBe(201)
    expect((await new Visitor().signUp(email.toUpperCase())).json().error).toBe("email_taken")
  })

  it("signs in and out, with one answer for any wrong email or password", async () => {
    const email = newEmail()
    const owner = new Visitor()
    await owner.signUp(email)
    await owner.call("POST", "/v1/auth/logout")

    const other = new Visitor()
    const wrongPassword = await other.call("POST", "/v1/auth/login", { email, password: "not the password" })
    const unknownEmail = await other.call("POST", "/v1/auth/login", { email: newEmail(), password: PASSWORD })
    expect([wrongPassword.statusCode, unknownEmail.statusCode]).toEqual([401, 401])
    expect(wrongPassword.json().message).toBe(unknownEmail.json().message)

    const res = await other.call("POST", "/v1/auth/login", { email, password: PASSWORD })
    expect(res.statusCode).toBe(200)
    expect(res.json().user).toMatchObject({ id: owner.id, anonymous: false })
    const session = other.cookie
    expect((await other.call("POST", "/v1/auth/logout")).statusCode).toBe(204)
    // The signed-out token no longer reaches the account.
    const after = await app.inject({ method: "GET", url: "/v1/me", headers: { cookie: session! } })
    createdUsers.add(after.json().id)
    expect(after.json().id).not.toBe(owner.id)
  })

  it("merges what was made in an anonymous browser into the account on sign-in", async () => {
    const [reliance, hdfc] = [await instrumentId("reliance"), await instrumentId("hdfcbank")]
    const email = newEmail()
    const account = new Visitor()
    await account.signUp(email)
    await account.call("PUT", "/v1/me/watchlists", { lists: [{ name: "Core", ids: [reliance] }] })

    const browser = new Visitor()
    const anonymousId = await browser.start()
    await browser.call("PUT", "/v1/me/watchlists", {
      lists: [
        { name: "core", ids: [hdfc, reliance] },
        { name: "Banks", ids: [hdfc] },
      ],
    })
    await browser.call("POST", "/v1/me/alerts", { instrumentId: hdfc, condition: "PRICE_BELOW", value: 900, channels: ["IN_APP"] })

    expect((await browser.call("POST", "/v1/auth/login", { email, password: PASSWORD })).statusCode).toBe(200)
    const { lists } = (await browser.call("GET", "/v1/me/watchlists")).json()
    expect(lists.map((l: { name: string; ids: number[] }) => [l.name, l.ids])).toEqual([
      ["Core", [reliance, hdfc]],
      ["Banks", [hdfc]],
    ])
    expect((await browser.call("GET", "/v1/me/alerts")).json().alerts).toHaveLength(1)
    expect(await db.selectFrom("app.users").select("id").where("id", "=", anonymousId).executeTakeFirst()).toBeUndefined()
  })

  it("locks an email after five wrong passwords", async () => {
    const email = newEmail()
    await new Visitor().signUp(email)
    const attacker = new Visitor()
    for (let i = 0; i < 5; i++) await attacker.call("POST", "/v1/auth/login", { email, password: `guess ${i}` })
    const res = await attacker.call("POST", "/v1/auth/login", { email, password: PASSWORD })
    expect(res.statusCode).toBe(429)
    expect(res.json().error).toBe("locked")
  })

  it("changes the password and signs out every other session", async () => {
    const email = newEmail()
    const laptop = new Visitor()
    await laptop.signUp(email)
    const phone = new Visitor()
    await phone.call("POST", "/v1/auth/login", { email, password: PASSWORD })

    expect((await laptop.call("POST", "/v1/me/password", { current: "wrong", next: "a brand new password" })).statusCode).toBe(403)
    expect((await laptop.call("POST", "/v1/me/password", { current: PASSWORD, next: "a brand new password" })).statusCode).toBe(204)
    expect((await laptop.call("GET", "/v1/me")).json()).toMatchObject({ id: laptop.id, anonymous: false })
    const phoneNow = await phone.call("GET", "/v1/me")
    createdUsers.add(phoneNow.json().id)
    expect(phoneNow.json().id).not.toBe(laptop.id)
    expect((await new Visitor().call("POST", "/v1/auth/login", { email, password: "a brand new password" })).statusCode).toBe(200)
  })

  it("saves feed preferences and exports everything", async () => {
    const visitor = new Visitor()
    await visitor.signUp(newEmail(), PASSWORD, "Ravi")
    const patched = await visitor.call("PATCH", "/v1/me", { preferences: { style: "long_term", sectors: ["IT", "Energy"] } })
    expect(patched.json().preferences).toEqual({ style: "long_term", sectors: ["IT", "Energy"] })
    expect((await visitor.call("PATCH", "/v1/me", { preferences: { style: "gambling" } })).statusCode).toBe(400)

    const res = await visitor.call("GET", "/v1/me/export")
    expect(res.headers["content-disposition"]).toMatch(/attachment; filename="greencircuits-/)
    expect(res.json()).toMatchObject({ user: { name: "Ravi", preferences: { style: "long_term" } }, watchlists: [], alerts: [] })
  })

  it("deletes an account only with its password", async () => {
    const email = newEmail()
    const visitor = new Visitor()
    await visitor.signUp(email)
    expect((await visitor.call("DELETE", "/v1/me", { password: "wrong" })).statusCode).toBe(403)
    expect((await visitor.call("DELETE", "/v1/me", { password: PASSWORD })).statusCode).toBe(204)
    expect((await new Visitor().call("POST", "/v1/auth/login", { email, password: PASSWORD })).statusCode).toBe(401)
  })
})

describe("your data", () => {
  it("replaces watchlists and drops unknown instruments", async () => {
    const visitor = new Visitor()
    await visitor.start()
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
    const userId = await visitor.start()
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
    await stranger.start()
    expect((await stranger.call("PATCH", `/v1/me/alerts/${alert.id}`, { status: "ACTIVE" })).statusCode).toBe(404)

    await expect.poll(() => announcements, { timeout: 2000 }).toBe(3)
    subscriber.disconnect()
  })

  it("doesn't hand back the newest notification to a poll that has seen it", async () => {
    const visitor = new Visitor()
    const userId = await visitor.start()
    // Postgres keeps microseconds; the poll's cursor is a JavaScript date, to the millisecond.
    await sql`INSERT INTO app.notification (user_id, kind, title, body, created_at)
              VALUES (${userId}, 'ALERT', 'Test', 'Test', '2026-09-27T18:41:49.561234Z')`.execute(db)
    const first = (await visitor.call("GET", "/v1/me/notifications")).json().notifications
    expect(first).toHaveLength(1)
    const after = new Date(first[0].created_at).toISOString()
    expect((await visitor.call("GET", `/v1/me/notifications?after=${encodeURIComponent(after)}`)).json().notifications).toEqual([])
  })

  it("builds a feed from what the visitor follows", async () => {
    const visitor = new Visitor()
    expect((await visitor.call("GET", "/v1/me/feed")).json()).toEqual({ items: [], following: 0 })
    await visitor.start()
    const [reliance, tcs] = [await instrumentId("reliance"), await instrumentId("tcs")]
    await visitor.call("PUT", "/v1/me/watchlists", { lists: [{ name: "Core", ids: [reliance] }] })
    await visitor.call("PUT", "/v1/me/portfolio", { holdings: [{ instrumentId: tcs, qty: 5, avgPrice: 3000 }] })

    const feed = (await visitor.call("GET", "/v1/me/feed")).json()
    expect(feed.following).toBe(2)
    // "are up" while the market trades, "ended up … on Friday" after the close.
    expect(feed.items[0]).toMatchObject({ kind: "portfolio", href: "/portfolio", title: expect.stringMatching(/^Your holdings (are|ended) (up|down) /) })
    for (const item of feed.items) expect(item).toMatchObject({ id: expect.any(String), title: expect.any(String), score: expect.any(Number) })
  })

  it("imports holdings", async () => {
    const visitor = new Visitor()
    await visitor.start()
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
      await visitor.start()
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
      await stranger.start()
      expect((await stranger.call("GET", `/v1/me/backtests/${runId}`)).statusCode).toBe(404)
      expect((await stranger.call("DELETE", `/v1/me/backtests/${runId}`)).statusCode).toBe(404)

      // The list says what each test was, so it can be described without opening it.
      const { runs } = (await visitor.call("GET", "/v1/me/backtests")).json()
      expect(runs[0]).toMatchObject({ id: runId, name: request.name, definition: { type: "rules", universe: [reliance] } })

      if (!process.env.LAB_E2E) return

      await expect
        .poll(async () => (await visitor.call("GET", `/v1/me/backtests/${runId}`)).json().run.status, { timeout: 60_000, interval: 500 })
        .toBe("SUCCEEDED")
      const done = (await visitor.call("GET", `/v1/me/backtests/${runId}`)).json()
      expect(done.result.metrics).toMatchObject({ cagr: expect.any(Number), max_drawdown: expect.any(Number), trades: expect.any(Number) })
      expect(done.result.equity_sample.length).toBeGreaterThan(100)
      expect(done.trades.length).toBe(done.result.metrics.trades)

      expect(done.result.metrics.alternative).toMatchObject({ kind: "buy_and_hold", cagr: expect.any(Number), in_sample: expect.any(Object) })
      expect(done.result.equity_sample[0]).toMatchObject({ t: expect.any(Number), v: expect.any(Number), a: expect.any(Number), dd: 0 })

      const again = await visitor.call("POST", "/v1/me/backtests", request)
      expect(again.statusCode).toBe(200)
      expect(again.json()).toEqual({ runId, status: "SUCCEEDED", cached: true })

      expect((await visitor.call("DELETE", `/v1/me/backtests/${runId}`)).statusCode).toBe(204)
      expect((await visitor.call("GET", `/v1/me/backtests/${runId}`)).statusCode).toBe(404)
    },
    90_000,
  )
})
