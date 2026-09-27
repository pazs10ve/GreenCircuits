# web

The GreenCircuits web app: Next.js 16 (App Router), React 19 and Tailwind CSS 4.

## Modes

The server picks a mode on each request ([ADR 0003](../../docs/adr/0003-live-and-demo-modes.md)):

- **Live** needs `API_URL` and `NEXT_PUBLIC_STREAM_URL` set, and the API answering. Pages render from the API, which is proxied at `/api/v1`. Quotes stream from the WebSocket gateway, and your watchlists, alerts and holdings sync to your anonymous account.
- **Demo** is everything else. The market simulator runs in a Web Worker, research data comes from the shared generators, and your data stays in localStorage.

## Run it

```bash
pnpm install                                   # from the repo root
cp apps/web/.env.example apps/web/.env.local   # for live mode; skip it for demo mode
pnpm --filter web dev                          # http://localhost:3000
```

## Design

The look is a morning paper crossed with a quiet everyday tool, light by default:

- Newsreader for headlines and large figures, Public Sans for the interface, Source Code Pro for code.
- Warm paper and ink colours, with one blue accent for links and actions. Green and red only ever mean price direction, and appear sparingly.
- Each page opens with a sentence saying what happened, then shows the evidence: SVG charts and tables with tabular figures.
- The masthead's "Demo market" marker is the one place that says prices are simulated, instead of a badge on every panel.

## Layout

```
src/
├── app/(app)/        Today, company and index pages, and the pages below still in the first design
├── components/
│   ├── shell/        masthead, navigation, search, footer, alert watcher
│   ├── today/        the daily brief's sections
│   ├── company/      company and index page sections
│   ├── editorial/    sections and experiment cards
│   ├── viz/          SVG line charts and small multiples
│   ├── market/       prices and changes
│   └── ui/           shadcn/ui primitives (Radix)
├── lib/
│   ├── data/         data access: the API first, the generators as the fallback
│   ├── stream/       live and demo quote sources, the Web Worker, hooks
│   └── stores/       persisted client state and its sync to the API
└── hooks/
```

The lab, screener, F&O, portfolio, watchlists, alerts and settings pages, and their component folders, are still in the first design and are next to be redone.

## Conventions

- Numbers are formatted with `@greencircuits/market/format`: en-IN digit grouping, ₹, lakh and crore, a real minus sign, and IST times.
- Every figure gets the `num` class, so its digits line up and don't shift as prices tick.
- Components that read many live quotes use `useQuoteReader()`. It starts from the server's opening snapshot, so server and client markup match.
- Persisted stores use `skipHydration`. `StoreHydration` loads them after mount and, in live mode, starts the sync.
