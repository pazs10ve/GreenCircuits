# alerts

Real-time alert engine. Keeps per-instrument threshold heaps in memory, fires each alert exactly once by claiming it with a conditional update in Postgres, and hands delivery to the notifier through BullMQ.

Phase 4. See §7.3 of `docs/blueprint.html`.
