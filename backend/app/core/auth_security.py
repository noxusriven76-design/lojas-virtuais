from __future__ import annotations

from collections import defaultdict, deque
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
import re
import threading

from app.core.config import settings


PASSWORD_UPPER_RE = re.compile(r"[A-Z]")
PASSWORD_LOWER_RE = re.compile(r"[a-z]")
PASSWORD_DIGIT_RE = re.compile(r"\d")
PASSWORD_SYMBOL_RE = re.compile(r"[^A-Za-z0-9]")


def validate_password_policy(password: str) -> tuple[bool, str | None]:
    value = str(password or "")
    if len(value) < settings.admin_password_min_length:
        return False, f"Password must have at least {settings.admin_password_min_length} characters"
    if not PASSWORD_UPPER_RE.search(value):
        return False, "Password must include at least one uppercase letter"
    if not PASSWORD_LOWER_RE.search(value):
        return False, "Password must include at least one lowercase letter"
    if not PASSWORD_DIGIT_RE.search(value):
        return False, "Password must include at least one number"
    if not PASSWORD_SYMBOL_RE.search(value):
        return False, "Password must include at least one symbol"
    return True, None


def is_password_expired(password_changed_at: datetime | None) -> bool:
    max_age_days = int(settings.admin_password_max_age_days or 0)
    if max_age_days <= 0:
        return False
    if password_changed_at is None:
        return True
    limit = datetime.now(timezone.utc) - timedelta(days=max_age_days)
    return password_changed_at.astimezone(timezone.utc) < limit


@dataclass
class RateLimitResult:
    allowed: bool
    retry_after_seconds: int = 0


class LoginRateLimiter:
    def __init__(self) -> None:
        self._events: dict[str, deque[datetime]] = defaultdict(deque)
        self._lock = threading.Lock()

    def check(self, key: str) -> RateLimitResult:
        window_seconds = max(1, int(settings.admin_login_rate_limit_window_seconds))
        max_attempts = max(1, int(settings.admin_login_rate_limit_max_attempts))
        now = datetime.now(timezone.utc)
        window_start = now - timedelta(seconds=window_seconds)

        with self._lock:
            queue = self._events[key]
            while queue and queue[0] < window_start:
                queue.popleft()

            if len(queue) >= max_attempts:
                oldest = queue[0]
                retry_after = int((oldest + timedelta(seconds=window_seconds) - now).total_seconds())
                return RateLimitResult(allowed=False, retry_after_seconds=max(1, retry_after))

            queue.append(now)
            return RateLimitResult(allowed=True)


login_rate_limiter = LoginRateLimiter()

