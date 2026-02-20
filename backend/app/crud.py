from datetime import UTC, datetime

from sqlalchemy import desc, select
from sqlalchemy.orm import Session

from app import models, schemas
from app.llm_service import categorize_domain


def ensure_user_exists(db: Session, user_id: int) -> models.User:
    user = db.get(models.User, user_id)
    if user:
        return user
    user = models.User(id=user_id)
    db.add(user)
    db.flush()
    return user


def _get_or_create_domain_category(db: Session, domain: str) -> str:
    cached = db.get(models.DomainCategory, domain)
    if cached:
        return cached.category
    category = categorize_domain(domain)
    record = models.DomainCategory(domain=domain, category=category)
    db.add(record)
    db.flush()
    return category


def save_browsing_events(db: Session, user_id: int, events: list[schemas.BrowsingEventIn]) -> tuple[int, int]:
    ensure_user_exists(db, user_id)
    stored = 0
    categorized = 0

    try:
        for event in events:
            category = _get_or_create_domain_category(db, event.domain)
            categorized += 1
            db_event = models.BrowsingEvent(
                user_id=user_id,
                domain=event.domain,
                start_time=event.start_time.astimezone(UTC),
                duration=event.duration_seconds,
                category=category,
            )
            db.add(db_event)
            stored += 1

        db.commit()
    except Exception:
        db.rollback()
        raise

    return stored, categorized

def upsert_preferences(db: Session, payload: schemas.PreferencesPayload) -> models.Preference:
    ensure_user_exists(db, payload.user_id)
    stmt = select(models.Preference).where(models.Preference.user_id == payload.user_id)
    existing = db.scalar(stmt)
    if existing:
        existing.focus_sites = payload.focus_sites
        existing.blocked_sites = payload.blocked_sites
        existing.time_limits = payload.time_limits
        db.commit()
        db.refresh(existing)
        return existing

    pref = models.Preference(
        user_id=payload.user_id,
        focus_sites=payload.focus_sites,
        blocked_sites=payload.blocked_sites,
        time_limits=payload.time_limits,
    )
    db.add(pref)
    db.commit()
    db.refresh(pref)
    return pref


def get_preferences(db: Session, user_id: int) -> models.Preference:
    ensure_user_exists(db, user_id)
    stmt = select(models.Preference).where(models.Preference.user_id == user_id)
    pref = db.scalar(stmt)
    if pref:
        return pref
    pref = models.Preference(user_id=user_id, focus_sites=[], blocked_sites=[], time_limits={})
    db.add(pref)
    db.commit()
    db.refresh(pref)
    return pref


def save_weekly_insight(db: Session, user_id: int, week_start: datetime, summary: dict, tips: list[str]) -> models.WeeklyInsight:
    ensure_user_exists(db, user_id)

    def serialize(obj):
        if isinstance(obj, datetime):
            return obj.isoformat()
        if isinstance(obj, dict):
            return {k: serialize(v) for k, v in obj.items()}
        if isinstance(obj, list):
            return [serialize(i) for i in obj]
        return obj

    insight = models.WeeklyInsight(
        user_id=user_id,
        week_start=week_start,
        raw_summary=serialize(summary),
        insights_text="\n".join(tips),
    )
    db.add(insight)
    db.commit()
    db.refresh(insight)
    return insight


def get_latest_weekly_insight(db: Session, user_id: int, week_start: datetime) -> models.WeeklyInsight | None:
    stmt = (
        select(models.WeeklyInsight)
        .where(models.WeeklyInsight.user_id == user_id)
        .where(models.WeeklyInsight.week_start == week_start)
        .order_by(desc(models.WeeklyInsight.created_at))
    )
    return db.scalar(stmt)

