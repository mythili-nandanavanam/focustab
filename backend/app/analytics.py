from collections import Counter, defaultdict
from datetime import UTC, datetime, time, timedelta

from sqlalchemy import select
from sqlalchemy.orm import Session

from app import models

FOCUS_CATEGORIES = {"Work", "Learning"}
DISTRACTION_CATEGORIES = {"Social Media", "Entertainment", "Shopping"}

JUNK_DOMAINS = {
    "newtab", "localhost", "127.0.0.1", "[::]", "0.0.0.0",
    "extensions", "chrome", "about", "veepn.com"
}

def _is_junk_domain(domain: str) -> bool:
    if not domain:
        return True
    d = domain.lower()
    if d in JUNK_DOMAINS:
        return True
    if d.startswith("192.168.") or d.startswith("10."):
        return True
    # pure IP addresses
    if all(p.isdigit() for p in d.split(".")):
        return True
    return False

def day_bounds_utc(target_day: datetime | None = None) -> tuple[datetime, datetime]:
    now = target_day or datetime.now(UTC)
    start = datetime.combine(now.date(), time.min, tzinfo=UTC)
    end = start + timedelta(days=1)
    return start, end


def week_bounds_utc(target_day: datetime | None = None) -> tuple[datetime, datetime]:
    now = target_day or datetime.now(UTC)
    start = datetime.combine((now - timedelta(days=now.weekday())).date(), time.min, tzinfo=UTC)
    end = start + timedelta(days=7)
    return start, end


def compute_analytics(db: Session, user_id: int, period_start: datetime, period_end: datetime) -> dict:
    stmt = (
        select(models.BrowsingEvent)
        .where(models.BrowsingEvent.user_id == user_id)
        .where(models.BrowsingEvent.start_time >= period_start)
        .where(models.BrowsingEvent.start_time < period_end)
    )
    events = list(db.scalars(stmt))
    events = [e for e in events if not _is_junk_domain(e.domain)]  # ← add this

    domain_time: dict[str, int] = defaultdict(int)
    category_time: dict[str, int] = defaultdict(int)
    hourly_time: dict[int, int] = defaultdict(int)
    switch_counter: Counter[datetime] = Counter()

    for event in events:
        domain_time[event.domain] += event.duration
        category_time[event.category] += event.duration
        hourly_time[event.start_time.hour] += event.duration
        hour_bucket = event.start_time.replace(minute=0, second=0, microsecond=0)
        switch_counter[hour_bucket] += 1

    total_focus = float(sum(category_time.get(cat, 0) for cat in FOCUS_CATEGORIES))
    total_distraction = float(sum(category_time.get(cat, 0) for cat in DISTRACTION_CATEGORIES))
    total_sessions = len(events)
    avg_session = (sum(event.duration for event in events) / total_sessions) if total_sessions else 0.0
    hours_in_period = max((period_end - period_start).total_seconds() / 3600.0, 1.0)

    # Count actual tab switches: events where domain changed from previous event
    sorted_events = sorted(events, key=lambda e: e.start_time)
    switches = 0
    for i in range(1, len(sorted_events)):
        if sorted_events[i].domain != sorted_events[i-1].domain:
            switches += 1

    tab_switch_frequency = switches / hours_in_period

    peak_hours = sorted(
        [{"hour": hour, "duration_seconds": duration} for hour, duration in hourly_time.items()],
        key=lambda item: item["duration_seconds"],
        reverse=True,
    )[:5]

    ratio_base = total_focus + total_distraction
    focus_ratio = (total_focus / ratio_base) if ratio_base else 0.0
    distraction_ratio = (total_distraction / ratio_base) if ratio_base else 0.0

    return {
        "period_start": period_start,
        "period_end": period_end,
        "total_time_per_domain": dict(sorted(domain_time.items(), key=lambda item: item[1], reverse=True)),
        "total_time_per_category": dict(sorted(category_time.items(), key=lambda item: item[1], reverse=True)),
        "average_session_duration": round(avg_session, 2),
        "focus_vs_distraction_ratio": {
            "focus": round(focus_ratio, 4),
            "distraction": round(distraction_ratio, 4),
        },
        "peak_usage_hours": peak_hours,
        "tab_switch_frequency_per_hour": round(tab_switch_frequency, 3),
        "total_events": total_sessions,
    }

