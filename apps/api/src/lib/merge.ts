import type { Db } from "@greencircuits/db"

/**
 * Signing in from a browser that has been used anonymously moves what was
 * made there into the account, then deletes the anonymous user:
 *
 * - watchlists with the same name are combined; others are added after the account's;
 * - alerts and notifications move as they are;
 * - holdings move only if the account has none (two portfolios would count shares twice);
 * - tests move, and a strategy whose name the account already uses gets " (2)".
 */
export async function mergeInto(db: Db, fromId: string, toId: string): Promise<void> {
  if (fromId === toId) return
  await db.transaction().execute(async (trx) => {
    // Watchlists.
    const theirs = await trx.selectFrom("app.watchlist").select(["id", "name", "position"]).where("user_id", "=", toId).execute()
    const byName = new Map(theirs.map((w) => [w.name.toLowerCase(), w]))
    let position = theirs.reduce((max, w) => Math.max(max, w.position + 1), 0)
    const lists = await trx.selectFrom("app.watchlist").select(["id", "name"]).where("user_id", "=", fromId).orderBy("position").execute()
    for (const list of lists) {
      const same = byName.get(list.name.toLowerCase())
      if (!same) {
        await trx.updateTable("app.watchlist").set({ user_id: toId, position: position++ }).where("id", "=", list.id).execute()
        continue
      }
      const have = await trx.selectFrom("app.watchlist_item").select("instrument_id").where("watchlist_id", "=", same.id).execute()
      const known = new Set(have.map((r) => r.instrument_id))
      const items = await trx.selectFrom("app.watchlist_item").select("instrument_id").where("watchlist_id", "=", list.id).orderBy("position").execute()
      const add = items.map((r) => r.instrument_id).filter((id) => !known.has(id)).slice(0, Math.max(0, 200 - known.size))
      if (add.length) {
        await trx
          .insertInto("app.watchlist_item")
          .values(add.map((instrument_id, i) => ({ watchlist_id: same.id, instrument_id, position: known.size + i })))
          .execute()
      }
      await trx.deleteFrom("app.watchlist").where("id", "=", list.id).execute()
    }

    // Alerts and notifications.
    await trx.updateTable("app.alert").set({ user_id: toId }).where("user_id", "=", fromId).execute()
    await trx.updateTable("app.notification").set({ user_id: toId }).where("user_id", "=", fromId).execute()

    // Holdings.
    const accountHasHoldings = await trx
      .selectFrom("app.portfolio as p")
      .innerJoin("app.portfolio_txn as t", "t.portfolio_id", "p.id")
      .select("p.id")
      .where("p.user_id", "=", toId)
      .limit(1)
      .executeTakeFirst()
    if (!accountHasHoldings) {
      const browserHasHoldings = await trx
        .selectFrom("app.portfolio as p")
        .innerJoin("app.portfolio_txn as t", "t.portfolio_id", "p.id")
        .select("p.id")
        .where("p.user_id", "=", fromId)
        .limit(1)
        .executeTakeFirst()
      if (browserHasHoldings) {
        await trx.deleteFrom("app.portfolio").where("user_id", "=", toId).execute()
        await trx.updateTable("app.portfolio").set({ user_id: toId }).where("user_id", "=", fromId).execute()
      }
    }

    // Tests.
    const names = new Set((await trx.selectFrom("lab.strategy").select("name").where("user_id", "=", toId).execute()).map((r) => r.name.toLowerCase()))
    for (const s of await trx.selectFrom("lab.strategy").select(["id", "name"]).where("user_id", "=", fromId).execute()) {
      let name = s.name
      for (let n = 2; names.has(name.toLowerCase()); n++) name = `${s.name} (${n})`
      names.add(name.toLowerCase())
      await trx.updateTable("lab.strategy").set({ user_id: toId, name }).where("id", "=", s.id).execute()
    }
    await trx.updateTable("lab.backtest_run").set({ user_id: toId }).where("user_id", "=", fromId).execute()

    // Whatever is left (sessions, an empty portfolio) goes with the anonymous user.
    await trx.deleteFrom("app.users").where("id", "=", fromId).where("is_anonymous", "=", true).execute()
  })
}
