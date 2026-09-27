# contracts

The contracts every service agrees on: Zod schemas for the REST API (published as OpenAPI) and the Protobuf wire format for live quotes in [`proto/tick.proto`](proto/tick.proto). The tick schema is what lets the gateway or ingestor be rewritten in another language without touching the rest.
