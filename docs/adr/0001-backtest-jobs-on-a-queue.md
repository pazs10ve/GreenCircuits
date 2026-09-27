# 1. Backtest jobs are dispatched through a queue

- Date: 2026-09-27
- Status: accepted

## Context

Backtests are CPU-heavy, taking from under a second to a few minutes. The Node API receives the request, but the Python strategy engine does the work. Bursts are expected, around 50 runs within a few minutes at peak.

An earlier draft used the `lab.backtest_run` table as the queue, with workers claiming rows through `FOR UPDATE SKIP LOCKED` and a sweeper requeuing runs whose heartbeat went stale.

## Decision

Dispatch goes through a BullMQ queue named `backtests` on Valkey.

1. The API inserts the `lab.backtest_run` row, then adds a job whose id is the run id and whose payload is only that id.
2. Python workers consume the queue with BullMQ's official Python client and update the row as they go: RUNNING, progress, then SUCCEEDED or FAILED.
3. Paid plans enqueue with a higher priority (a lower number). *Update, 2026-09-27: the project has no paid plans, so every run gets the same priority.*

`lab.backtest_run` remains the durable record of inputs, status, timings, attempts and results. It is no longer the dispatch mechanism.

## Consequences

- Priorities, retries with backoff, stalled-job recovery and progress events come from BullMQ, replacing hand-written SQL and a sweeper.
- Alert deliveries and backtests share one queue technology.
- Using the run id as the job id makes enqueueing idempotent, so an API retry cannot queue the same run twice.
- Queue state now lives in Valkey, so Valkey runs with append-only persistence. If a job is still lost, a reconciler re-enqueues runs that are QUEUED in Postgres with no job in Valkey. The row insert and the enqueue are two writes, and the reconciler is what makes that safe.
