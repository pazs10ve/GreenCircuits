# loadtest

k6 scenarios that prove the design targets, run from a second machine against the stack on a 4-vCPU VM:

| Scenario | Shape | Passes when |
|---|---|---|
| HTTP mix | 28 rps for 30 min, three 60 s bursts to 300 rps | p95 < 150 ms (< 30 ms cached), errors < 0.1% |
| WebSocket fan-out | 1,000 then 3,000 clients × 100 instruments | p95 tick lag < 1 s |
| Alerts | 50,000 active alerts under injected spikes | every alert delivered exactly once |
| Failover | kill the active ingestor mid-run | stream resumes within ~10 s |
| Backtest burst | 50 runs queued during the above | p95 queue wait < 3 min, other targets hold |

Results go in `RESULTS.md`. Phase 6.
