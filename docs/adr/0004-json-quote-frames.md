# 4. Quote frames are JSON arrays for now, not Protobuf

- Date: 2026-09-27
- Status: accepted

## Context

The blueprint planned Protobuf delta frames for live quotes (`packages/contracts/proto/tick.proto`). Protobuf means code generation on both sides and a decoder in the browser bundle. It also makes frames unreadable in the browser's network tab while the gateway is still being built.

Measured on the running gateway with all 66 demo instruments subscribed:

- the opening snapshot is 3.4 KB;
- update frames are about 1.9 KB, carrying around 30 changed quotes;
- frames go out 4 times a second, about 7 KB/s per client.

## Decision

The gateway sends JSON frames. Each quote is a positional array rather than an object:

```json
{ "t": "q", "q": [[1, 25182.4, 25090.15, 25201.9, 25061.3, 25114.2, 0, 1790000000000]] }
```

The fields are id, last price, open, high, low, previous close, volume and time. Prices are rounded to 4 decimal places, which is enough for currency ticks and removes float noise. Leaving out the field names already captures most of what Protobuf would save for this shape.

## Consequences

- Frames can be read in DevTools, and the browser needs no decoder.
- At 1,000 connected clients, 7 KB/s each comes to about 7 MB/s (roughly 58 Mbit/s) out of the gateway. That is the first thing a load test at the target scale will press on. The next steps, in order:
  1. turn on permessage-deflate (uWebSockets.js's shared compressor), since repeated number arrays compress well;
  2. subscribe clients only to the instruments on screen;
  3. if bandwidth is still the limit, switch to `tick.proto`.
- The frame shape is already positional, so switching to Protobuf later touches only `toWire`, `fromWire` and the gateway.
