"""A polite HTTP client for free data sources: a browser-like user agent, a pause between
requests to the same host, retries with backoff on 429 and 5xx, and a disk cache so a
rerun on the same day doesn't fetch anything twice.

These sources are unofficial and for personal use. Keep the pace slow.
"""

from __future__ import annotations

import hashlib
import json
import time
from pathlib import Path
from typing import Any
from urllib.parse import urlparse

import httpx

USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36"
#: The repository's data/ folder (ignored by git): raw responses, one file per URL per day.
CACHE_DIR = Path(__file__).resolve().parents[4] / "data" / "cache"


class Fetcher:
    def __init__(self, min_interval: float = 0.6, refresh: bool = False) -> None:
        self.client = httpx.Client(
            headers={"User-Agent": USER_AGENT, "Accept": "application/json, text/csv, */*"},
            timeout=30,
            follow_redirects=True,
        )
        self.min_interval = min_interval
        self.refresh = refresh
        self._last: dict[str, float] = {}

    def _cache_path(self, url: str, day: str) -> Path:
        digest = hashlib.sha256(url.encode()).hexdigest()[:24]
        return CACHE_DIR / day / f"{urlparse(url).hostname}-{digest}"

    def _wait(self, host: str) -> None:
        gap = time.monotonic() - self._last.get(host, 0)
        if gap < self.min_interval:
            time.sleep(self.min_interval - gap)
        self._last[host] = time.monotonic()

    def text(self, url: str, day: str, headers: dict[str, str] | None = None) -> str:
        """The body of a GET, from the cache for `day` when there, else fetched (with retries)."""
        path = self._cache_path(url, day)
        if path.exists() and not self.refresh:
            return path.read_text(encoding="utf-8")
        host = urlparse(url).hostname or ""
        for attempt in range(4):
            self._wait(host)
            res = self.client.get(url, headers=headers)
            if res.status_code == 200:
                path.parent.mkdir(parents=True, exist_ok=True)
                path.write_text(res.text, encoding="utf-8")
                return res.text
            if res.status_code in (429, 500, 502, 503, 504):
                time.sleep(2 ** (attempt + 1))
                continue
            res.raise_for_status()
        raise RuntimeError(f"{url} kept failing")

    def json(self, url: str, day: str, headers: dict[str, str] | None = None) -> Any:
        return json.loads(self.text(url, day, headers))
