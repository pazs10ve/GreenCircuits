# stream

The uWebSockets.js gateway, at `/v1/stream`. A client sends `{ "op": "sub", "ids": [...] }` and gets a snapshot back. After that, it gets one frame per ingestor flush from `gc:ticks`, holding only the instruments that changed. Frames are compact JSON arrays ([ADR 0004](../../docs/adr/0004-json-quote-frames.md)).

A slow client doesn't hold anyone else up. When a socket's buffer passes 256 KB, the gateway stops writing to it and remembers which instruments it missed. When the socket drains, it sends their latest quotes. Browser connections must come from an origin listed in `WEB_ORIGINS`. Clients that send no `Origin` header, such as load-test tools, are let through.

```bash
pnpm --filter @greencircuits/stream dev   # port 4001
```

uWebSockets.js is installed from GitHub (v20.71.0), which ships prebuilt binaries for current Node versions.
