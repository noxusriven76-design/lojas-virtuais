from __future__ import annotations

import json
import os
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path
from urllib.error import URLError, HTTPError
from urllib.request import urlopen


def _check_health(url: str) -> tuple[bool, str]:
    try:
        with urlopen(url, timeout=5) as response:  # nosec - local health probe
            if response.status == 200:
                return True, "health ok"
            return False, f"health status={response.status}"
    except HTTPError as exc:
        return False, f"health http_error={exc.code}"
    except URLError as exc:
        return False, f"health url_error={exc.reason}"
    except Exception as exc:  # pragma: no cover
        return False, f"health error={exc}"


def _latest_backup_age_hours(backups_root: Path) -> tuple[bool, str]:
    if not backups_root.exists():
        return False, "backup root not found"
    dirs = [p for p in backups_root.iterdir() if p.is_dir() and p.name.startswith("phase8_")]
    if not dirs:
        return False, "no phase8 backup found"
    latest = max(dirs, key=lambda p: p.stat().st_mtime)
    mtime = datetime.fromtimestamp(latest.stat().st_mtime, tz=timezone.utc)
    age = datetime.now(timezone.utc) - mtime
    max_age = timedelta(hours=24)
    if age <= max_age:
        return True, f"latest_backup={latest.name} age_hours={age.total_seconds() / 3600:.2f}"
    return False, f"stale_backup={latest.name} age_hours={age.total_seconds() / 3600:.2f}"


def main() -> int:
    health_url = os.getenv("OPS_HEALTH_URL", "http://localhost:8000/health")
    backups_root = Path(os.getenv("OPS_BACKUPS_DIR", "backups"))
    output_path = Path(os.getenv("OPS_PROBE_OUTPUT", "backups/ops_monitor_probe.json"))

    checks = []
    ok_health, msg_health = _check_health(health_url)
    checks.append({"check": "api_health", "ok": ok_health, "message": msg_health})

    ok_backup, msg_backup = _latest_backup_age_hours(backups_root)
    checks.append({"check": "backup_freshness", "ok": ok_backup, "message": msg_backup})

    all_ok = all(item["ok"] for item in checks)
    payload = {
        "date": datetime.now(timezone.utc).isoformat(),
        "result": "ok" if all_ok else "alert",
        "checks": checks,
    }
    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text(json.dumps(payload, ensure_ascii=True, indent=2), encoding="utf-8")
    print(json.dumps(payload, ensure_ascii=True))
    return 0 if all_ok else 2


if __name__ == "__main__":
    raise SystemExit(main())
