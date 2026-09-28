import { sql } from "kysely"
import { z } from "zod"
import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod"
import { cached } from "../lib/cache"
import { istToday } from "../lib/dates"

/** A scheme as the list and detail pages show it. */
export interface SchemeRow {
  code: number
  name: string
  amc: string
  assetClass: string
  category: string
  nav: number | null
  navDate: string | null
  launchedOn: string | null
  y1: number | null
  y3: number | null
  y5: number | null
  y10: number | null
}

const schemeColumns = [
  "code",
  "name",
  "amc",
  "asset_class",
  "category",
  "nav",
  sql<string | null>`nav_date::text`.as("nav_date"),
  sql<string | null>`launched_on::text`.as("launched_on"),
  "return_1y_pct",
  "cagr_3y_pct",
  "cagr_5y_pct",
  "cagr_10y_pct",
] as const

function toRow(r: {
  code: number
  name: string
  amc: string
  asset_class: string
  category: string
  nav: number | null
  nav_date: string | null
  launched_on: string | null
  return_1y_pct: number | null
  cagr_3y_pct: number | null
  cagr_5y_pct: number | null
  cagr_10y_pct: number | null
}): SchemeRow {
  return {
    code: r.code,
    name: r.name,
    amc: r.amc,
    assetClass: r.asset_class,
    category: r.category,
    nav: r.nav,
    navDate: r.nav_date,
    launchedOn: r.launched_on,
    y1: r.return_1y_pct,
    y3: r.cagr_3y_pct,
    y5: r.cagr_5y_pct,
    y10: r.cagr_10y_pct,
  }
}

export const fundRoutes: FastifyPluginAsyncZod = async (app) => {
  // Every category with how many schemes it has and their median returns, for the list page's sidebar.
  app.get(
    "/funds/mutual/categories",
    { schema: { tags: ["funds"], summary: "Mutual fund categories, with how many schemes each has and their median returns" } },
    async (_req, reply) => {
      reply.header("cache-control", "public, max-age=300")
      return cached(app.valkey, `gc:funds:categories:${istToday()}`, 900, async () => {
        const rows = await sql<{ asset_class: string; category: string; schemes: number; y1: number | null; y3: number | null; y5: number | null }>`
          SELECT asset_class, category, count(*)::int AS schemes,
                 percentile_cont(0.5) WITHIN GROUP (ORDER BY return_1y_pct) AS y1,
                 percentile_cont(0.5) WITHIN GROUP (ORDER BY cagr_3y_pct) AS y3,
                 percentile_cont(0.5) WITHIN GROUP (ORDER BY cagr_5y_pct) AS y5
          FROM mf.scheme GROUP BY asset_class, category`.execute(app.db)
        return {
          categories: rows.rows.map((r) => ({ assetClass: r.asset_class, category: r.category, schemes: r.schemes, y1: r.y1, y3: r.y3, y5: r.y5 })),
        }
      })
    },
  )

  // One category's schemes with their returns.
  app.get(
    "/funds/mutual",
    {
      schema: {
        tags: ["funds"],
        summary: "The direct growth plans in one category, with their NAV and returns",
        querystring: z.object({ category: z.string().min(1).max(60) }),
      },
    },
    async (req, reply) => {
      reply.header("cache-control", "public, max-age=300")
      const { category } = req.query
      return cached(app.valkey, `gc:funds:list:${category}:${istToday()}`, 900, async () => {
        const rows = await app.db.selectFrom("mf.scheme").select(schemeColumns).where("category", "=", category).orderBy("name").execute()
        return { schemes: rows.map(toRow) }
      })
    },
  )

  // A scheme and its whole NAV history.
  app.get(
    "/funds/mutual/:code",
    {
      schema: {
        tags: ["funds"],
        summary: "A scheme with its NAV history, oldest first",
        params: z.object({ code: z.coerce.number().int().positive() }),
      },
    },
    async (req, reply) => {
      const data = await cached(app.valkey, `gc:funds:scheme:${req.params.code}:${istToday()}`, 900, async () => {
        const scheme = await app.db.selectFrom("mf.scheme").select(schemeColumns).where("code", "=", req.params.code).executeTakeFirst()
        if (!scheme) return null
        const history = await sql<{ d: string; nav: number }>`
          SELECT nav_date::text AS d, nav FROM mf.nav WHERE scheme_code = ${req.params.code} ORDER BY nav_date`.execute(app.db)
        return { scheme: toRow(scheme), history: history.rows.map((r) => [r.d, r.nav] as [string, number]) }
      })
      if (!data) return reply.code(404).send({ error: "not_found" })
      reply.header("cache-control", "public, max-age=300")
      return data
    },
  )

  // The NAV each ETF last published, to set its price against.
  app.get("/funds/listed", { schema: { tags: ["funds"], summary: "The latest NAV of each listed ETF" } }, async (_req, reply) => {
    reply.header("cache-control", "public, max-age=300")
    return cached(app.valkey, `gc:funds:listed:${istToday()}`, 900, async () => {
      const rows = await sql<{ id: number; nav: number | null; nav_date: string | null }>`
        SELECT id, (attrs->>'nav')::float8 AS nav, attrs->>'navDate' AS nav_date FROM ref.instrument WHERE attrs ? 'nav'`.execute(app.db)
      return { navs: rows.rows.map((r) => ({ id: r.id, nav: r.nav, navDate: r.nav_date })) }
    })
  })
}
