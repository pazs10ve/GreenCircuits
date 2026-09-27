# alerts

The real-time alert engine. It keeps active price and day-change alerts in memory and checks them against every tick published on `gc:ticks`. When the API announces a change on `gc:alerts:changed`, it reloads.

Each alert fires exactly once. A conditional update claims it:

```sql
UPDATE ... WHERE version = $v AND status = 'ACTIVE' AND <cooldown elapsed> RETURNING
```

The trigger, the notification and the delivery rows are written in the same transaction. In-app notifications are delivered. Email and Telegram deliveries are recorded as skipped until accounts can be verified.

```bash
pnpm --filter @greencircuits/alerts dev   # health on port 4011
```
