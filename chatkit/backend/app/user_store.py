"""Persistent per-user model usage and billing data."""

from __future__ import annotations

from datetime import datetime, timezone
from contextlib import contextmanager
import fcntl
import json
import os
from pathlib import Path
from tempfile import NamedTemporaryFile
from threading import Lock
from typing import Any


DEFAULT_USER_PATH = Path(__file__).resolve().parents[3] / "data" / "chatkit-user.json"
LONG_CONTEXT_TOKEN_THRESHOLD = int(os.getenv("OPENAI_LONG_CONTEXT_THRESHOLD", "200000"))
MILLION = 1_000_000
_PROCESS_LOCK = Lock()


def _number(name: str, default: float = 0.0) -> float:
    return float(os.getenv(name, str(default)))


class UserUsageStore:
    def __init__(self, path: Path | None = None) -> None:
        self.path = Path(path or os.getenv("CHATKIT_USER_PATH", str(DEFAULT_USER_PATH)))
        self.lock_path = self.path.with_suffix(self.path.suffix + ".lock")

    def record(self, email: str, model: str, usage: Any) -> None:
        email = email.strip().casefold()
        input_tokens = _nonnegative_int(getattr(usage, "input_tokens", 0))
        cached_tokens = min(
            _nonnegative_int(
                getattr(
                    getattr(usage, "input_tokens_details", None),
                    "cached_tokens",
                    0,
                )
            ),
            input_tokens,
        )
        output_tokens = _nonnegative_int(getattr(usage, "output_tokens", 0))
        uncached_tokens = input_tokens - cached_tokens
        context = (
            "long_context"
            if input_tokens > LONG_CONTEXT_TOKEN_THRESHOLD
            else "short_context"
        )

        with _PROCESS_LOCK, self._file_lock():
            data = self._load()
            month_key = datetime.now(timezone.utc).strftime("%Y-%m")
            month = data.setdefault("months", {}).setdefault(
                month_key,
                {"billing": 0.0, "accounts": {}},
            )
            account = month["accounts"].setdefault(
                email,
                {"billing": 0.0, "models": {}},
            )
            model_data = account["models"].setdefault(
                model,
                {
                    "tokens": {
                        "short_context": _token_counts(),
                        "long_context": _token_counts(),
                        "total": 0,
                    },
                    "costs": {
                        "short_context": _cost_counts(),
                        "long_context": _cost_counts(),
                        "total": 0.0,
                    },
                },
            )

            token_counts = model_data["tokens"][context]
            token_counts["input_cached"] += cached_tokens
            token_counts["input_uncached"] += uncached_tokens
            token_counts["output"] += output_tokens
            model_data["tokens"]["total"] = sum(
                sum(model_data["tokens"][bucket].values())
                for bucket in ("short_context", "long_context")
            )
            _recalculate_model_costs(model_data)

            account["billing"] = _account_costs(account) * _number("OPENAI_BILLING_FACTOR", 1.0)
            month["billing"] = sum(item["billing"] for item in month["accounts"].values())
            self._persist(data)

    def monthly_billing(self) -> float:
        month_key = datetime.now(timezone.utc).strftime("%Y-%m")
        with _PROCESS_LOCK, self._file_lock():
            month = self._load().get("months", {}).get(month_key, {})
            try:
                return max(float(month.get("billing", 0.0)), 0.0)
            except (AttributeError, TypeError, ValueError):
                return 0.0

    def usage_snapshot(self, email: str) -> dict[str, Any]:
        month_key = datetime.now(timezone.utc).strftime("%Y-%m")
        with _PROCESS_LOCK, self._file_lock():
            months = self._load().get("months", {})
            current_month = months.get(month_key, {})
            account = current_month.get("accounts", {}).get(email.strip().casefold(), {})
            monthly_tokens = []
            for key, month in sorted(months.items()):
                account_data = month.get("accounts", {}).get(email.strip().casefold(), {})
                total_tokens = sum(
                    model_data.get("tokens", {}).get("total", 0)
                    for model_data in account_data.get("models", {}).values()
                )
                monthly_tokens.append({
                    "month": key,
                    "tokens": max(int(total_tokens), 0),
                    "billing": _safe_float(account_data.get("billing")),
                })

            current_billing = _safe_float(current_month.get("billing"))
            billing_limit = _number("OPENAI_BILLING_LIMIT", -1.0)
            billing_percentage = (
                max(current_billing / billing_limit * 100, 0.0)
                if billing_limit > 0
                else 0.0
            )
            return {
                "month": month_key,
                "billing": current_billing,
                "billing_limit": billing_limit if billing_limit >= 0 else None,
                "billing_percentage": billing_percentage,
                "billing_currency": os.getenv("OPENAI_BILLING_CURRENCY", "USD").strip() or "USD",
                "tokens": monthly_tokens,
                "current_user_tokens": max(
                    sum(
                        model_data.get("tokens", {}).get("total", 0)
                        for model_data in account.get("models", {}).values()
                    ),
                    0,
                ),
            }

    def billing_limit_exceeded(self) -> bool:
        limit = _number("OPENAI_BILLING_LIMIT", -1.0)
        return limit >= 0 and self.monthly_billing() > limit

    @contextmanager
    def _file_lock(self):
        self.path.parent.mkdir(parents=True, exist_ok=True)
        with self.lock_path.open("a+", encoding="utf-8") as lock_file:
            self.lock_path.chmod(0o600)
            fcntl.flock(lock_file.fileno(), fcntl.LOCK_EX)
            try:
                yield
            finally:
                fcntl.flock(lock_file.fileno(), fcntl.LOCK_UN)

    def _load(self) -> dict[str, Any]:
        if not self.path.is_file():
            return {"months": {}}
        try:
            contents = self.path.read_text(encoding="utf-8").strip()
            if not contents:
                return {"months": {}}
            data = json.loads(contents)
            return data if isinstance(data, dict) else {"months": {}}
        except (OSError, json.JSONDecodeError, ValueError) as error:
            raise RuntimeError(f"Unable to load user usage store at {self.path}") from error

    def _persist(self, data: dict[str, Any]) -> None:
        self.path.parent.mkdir(parents=True, exist_ok=True)
        self.path.parent.chmod(0o700)
        temporary_path: Path | None = None
        try:
            with NamedTemporaryFile(
                mode="w",
                encoding="utf-8",
                dir=self.path.parent,
                prefix=f".{self.path.name}.",
                delete=False,
            ) as temporary_file:
                temporary_path = Path(temporary_file.name)
                json.dump(data, temporary_file, ensure_ascii=True, separators=(",", ":"))
                temporary_file.flush()
                os.fsync(temporary_file.fileno())
            temporary_path.chmod(0o600)
            temporary_path.replace(self.path)
            temporary_path = None
            self.path.chmod(0o600)
            directory_fd = os.open(self.path.parent, os.O_RDONLY | os.O_DIRECTORY)
            try:
                os.fsync(directory_fd)
            finally:
                os.close(directory_fd)
        finally:
            if temporary_path is not None:
                temporary_path.unlink(missing_ok=True)


def _token_counts() -> dict[str, int]:
    return {"input_cached": 0, "input_uncached": 0, "output": 0}


def _nonnegative_int(value: Any) -> int:
    try:
        return max(int(value or 0), 0)
    except (TypeError, ValueError, OverflowError):
        return 0


def _safe_float(value: Any) -> float:
    try:
        return max(float(value or 0), 0.0)
    except (TypeError, ValueError, OverflowError):
        return 0.0


def _cost_counts() -> dict[str, float]:
    return {"input_cached": 0.0, "input_uncached": 0.0, "output": 0.0}


def _rates(context: str) -> dict[str, float]:
    prefix = "OPENAI_COST_LONG" if context == "long_context" else "OPENAI_COST_SHORT"
    return {
        "input_cached": _number(f"{prefix}_INPUT_CACHED"),
        "input_uncached": _number(f"{prefix}_INPUT_UNCACHED"),
        "output": _number(f"{prefix}_OUTPUT"),
    }


def _recalculate_model_costs(model_data: dict[str, Any]) -> None:
    total_cost = 0.0
    for context in ("short_context", "long_context"):
        token_counts = model_data["tokens"][context]
        cost_counts = model_data["costs"][context]
        rates = _rates(context)
        for token_type in ("input_cached", "input_uncached", "output"):
            cost_counts[token_type] = (
                token_counts[token_type] * rates[token_type] / MILLION
            )
        context_cost = sum(cost_counts.values())
        total_cost += context_cost
    model_data["costs"]["total"] = total_cost


def _account_costs(account: dict[str, Any]) -> float:
    return sum(model["costs"]["total"] for model in account["models"].values())