# stream

uWebSockets.js gateway. Authenticates sockets with a short-lived JWT, keeps each client's subscriptions, conflates quotes per plan (250 ms paid, 1 s free) and sends Protobuf delta frames defined in `packages/contracts/proto/tick.proto`.

Phase 2. See §7.1–7.2 of `docs/blueprint.html`.
