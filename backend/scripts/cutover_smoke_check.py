from __future__ import annotations

import argparse
import json
import urllib.error
import urllib.request


def _get(url: str, timeout: float) -> tuple[int, str]:
    req = urllib.request.Request(url, method="GET")
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            body = resp.read(300).decode("utf-8", errors="ignore")
            return int(resp.status), body
    except urllib.error.HTTPError as exc:
        body = exc.read(300).decode("utf-8", errors="ignore")
        return int(exc.code), body


def run(base_url: str, store_slug: str, timeout: float) -> int:
    base = base_url.rstrip("/")
    checks = [
        (f"{base}/health", 200),
        (f"{base}/api/v1/public/{store_slug}/categories", 200),
        (f"{base}/api/v1/public/{store_slug}/products?limit=1", 200),
        (f"{base}/site/{store_slug}", 200),
    ]

    failed = []
    for url, expected in checks:
        status, body = _get(url, timeout=timeout)
        ok = status == expected
        print(json.dumps({"url": url, "expected": expected, "status": status, "ok": ok}))
        if not ok:
            failed.append({"url": url, "expected": expected, "status": status, "body": body})

    if failed:
        print(json.dumps({"result": "failed", "failures": failed}, ensure_ascii=False))
        return 2
    print(json.dumps({"result": "ok", "store_slug": store_slug}, ensure_ascii=False))
    return 0


def main() -> None:
    parser = argparse.ArgumentParser(description="Smoke check for phased cutover by store")
    parser.add_argument("--base-url", default="http://localhost:8000")
    parser.add_argument("--store-slug", required=True)
    parser.add_argument("--timeout", type=float, default=5.0)
    args = parser.parse_args()
    raise SystemExit(run(base_url=args.base_url, store_slug=args.store_slug, timeout=args.timeout))


if __name__ == "__main__":
    main()
