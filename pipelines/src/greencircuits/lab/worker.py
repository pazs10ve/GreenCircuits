"""BullMQ consumer for the "backtests" queue.

    uv run python -m greencircuits.lab.worker

Each job carries only a run id; the engine reads everything else from
Postgres (docs/adr/0001). Several workers can run side by side: claiming the
run row is atomic, so a job delivered twice is only run once.
"""

from __future__ import annotations

import asyncio
import json
import os
import signal
import socket
import threading
from datetime import UTC, datetime
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

from bullmq import Worker

from .engine import execute

DATABASE_URL = os.environ.get(
    "DATABASE_URL", "postgres://greencircuits:greencircuits@localhost:55432/greencircuits"
)
VALKEY_URL = os.environ.get("VALKEY_URL", "redis://localhost:6380")
CONCURRENCY = int(os.environ.get("BACKTEST_CONCURRENCY", "2"))
WORKER_ID = f"{socket.gethostname()}:{os.getpid()}"
HEALTH_PORT = int(os.environ.get("PORT", "4020"))
STATS = {"done": 0, "failed": 0}


def log(msg: str, **extra: object) -> None:
    print(
        json.dumps({"t": datetime.now(UTC).isoformat(), "svc": "lab-worker", "msg": msg, **extra}), flush=True
    )


async def process(job, token):
    run_id = job.data["runId"]
    started = asyncio.get_running_loop().time()
    try:
        status = await asyncio.to_thread(execute, DATABASE_URL, run_id, WORKER_ID)
    except Exception as err:
        STATS["failed"] += 1
        log("run failed", run=run_id, error=str(err))
        raise
    STATS["done"] += 1
    log(
        "run finished",
        run=run_id,
        status=status,
        seconds=round(asyncio.get_running_loop().time() - started, 2),
    )
    return {"runId": run_id, "status": status}


class Health(BaseHTTPRequestHandler):
    def do_GET(self) -> None:
        ok = self.path == "/health"
        body = json.dumps({"status": "ok", "worker": WORKER_ID, **STATS}).encode() if ok else b""
        self.send_response(200 if ok else 404)
        self.send_header("content-type", "application/json")
        self.end_headers()
        self.wfile.write(body)

    def log_message(self, *_: object) -> None:
        pass


async def main() -> None:
    worker = Worker("backtests", process, {"connection": VALKEY_URL, "concurrency": CONCURRENCY})
    health = ThreadingHTTPServer(("127.0.0.1", HEALTH_PORT), Health)
    threading.Thread(target=health.serve_forever, daemon=True).start()
    log("started", worker=WORKER_ID, concurrency=CONCURRENCY, health_port=HEALTH_PORT)
    stop = asyncio.Event()
    loop = asyncio.get_running_loop()
    for sig in (signal.SIGINT, signal.SIGTERM):
        try:
            loop.add_signal_handler(sig, stop.set)
        except NotImplementedError:  # Windows: no loop signal handlers
            signal.signal(sig, lambda *_: loop.call_soon_threadsafe(stop.set))
    await stop.wait()
    log("stopping")
    health.shutdown()
    await worker.close()


if __name__ == "__main__":
    asyncio.run(main())
