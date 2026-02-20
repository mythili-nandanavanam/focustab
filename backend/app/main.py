from datetime import UTC, datetime
from typing import Annotated

from fastapi import Depends, FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session

from app import crud, models, schemas
from app.analytics import compute_analytics, day_bounds_utc, week_bounds_utc
from app.database import Base, engine, get_db
from app.llm_service import generate_productivity_insights


app = FastAPI(
    title="FOCUSTAB API",
    version="1.0.0",
    description="AI Enhanced Tab Time Tracker backend API.",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/")
def root():
    return {"message": "FocusTab backend running"}


@app.on_event("startup")
def startup() -> None:
    # Lightweight local migration strategy: create missing tables.
    Base.metadata.create_all(bind=engine)


DbSession = Annotated[Session, Depends(get_db)]


@app.get("/health")
def healthcheck() -> dict:
    """Liveness endpoint for local validation and uptime checks."""
    return {"status": "ok", "timestamp": datetime.now(UTC).isoformat()}


@app.post("/track", response_model=schemas.TrackResponse, tags=["Tracking"])
def track_events(payload: schemas.TrackRequest | list[schemas.BrowsingEventIn], db: DbSession) -> schemas.TrackResponse:
    """
    Store browsing events.

    Accepts either:
    - object payload `{ "user_id": 1, "events": [...] }`
    - raw list payload `[ ...events ]` (defaults to user 1)
    """
    if isinstance(payload, list):
        user_id = 1
        events = payload
    else:
        user_id = payload.user_id
        events = payload.events

    if not events:
        raise HTTPException(status_code=400, detail="events list cannot be empty")

    stored, categorized = crud.save_browsing_events(db, user_id=user_id, events=events)
    return schemas.TrackResponse(stored_events=stored, categories_applied=categorized)


@app.get("/analytics/daily", response_model=schemas.AnalyticsResponse, tags=["Analytics"])
def daily_analytics(
    db: DbSession,
    user_id: int = Query(default=1, ge=1),
    date: str | None = Query(default=None, description="Optional date in YYYY-MM-DD format (UTC)"),
) -> schemas.AnalyticsResponse:
    """Return daily analytics for a user."""
    target = None
    if date:
        try:
            target = datetime.strptime(date, "%Y-%m-%d").replace(tzinfo=UTC)
        except ValueError as exc:
            raise HTTPException(status_code=400, detail="Invalid date format. Use YYYY-MM-DD") from exc
    period_start, period_end = day_bounds_utc(target)
    data = compute_analytics(db, user_id=user_id, period_start=period_start, period_end=period_end)
    return schemas.AnalyticsResponse(**data)


@app.get("/analytics/weekly", response_model=schemas.AnalyticsResponse, tags=["Analytics"])
def weekly_analytics(
    db: DbSession,
    user_id: int = Query(default=1, ge=1),
    week_of: str | None = Query(default=None, description="Any date in target week, format YYYY-MM-DD (UTC)"),
) -> schemas.AnalyticsResponse:
    """Return weekly analytics for a user."""
    target = None
    if week_of:
        try:
            target = datetime.strptime(week_of, "%Y-%m-%d").replace(tzinfo=UTC)
        except ValueError as exc:
            raise HTTPException(status_code=400, detail="Invalid week_of format. Use YYYY-MM-DD") from exc
    period_start, period_end = week_bounds_utc(target)
    data = compute_analytics(db, user_id=user_id, period_start=period_start, period_end=period_end)
    return schemas.AnalyticsResponse(**data)


@app.post("/preferences", response_model=schemas.PreferencesResponse, tags=["Preferences"])
def set_preferences(payload: schemas.PreferencesPayload, db: DbSession) -> schemas.PreferencesResponse:
    """Create or update user preferences for focus sites, blocked sites, and limits."""
    pref = crud.upsert_preferences(db, payload)
    return schemas.PreferencesResponse(
        user_id=pref.user_id,
        focus_sites=pref.focus_sites,
        blocked_sites=pref.blocked_sites,
        time_limits=pref.time_limits,
    )


@app.get("/preferences", response_model=schemas.PreferencesResponse, tags=["Preferences"])
def get_preferences(db: DbSession, user_id: int = Query(default=1, ge=1)) -> schemas.PreferencesResponse:
    """Fetch user preferences."""
    pref = crud.get_preferences(db, user_id)
    return schemas.PreferencesResponse(
        user_id=pref.user_id,
        focus_sites=pref.focus_sites,
        blocked_sites=pref.blocked_sites,
        time_limits=pref.time_limits,
    )


@app.get("/insights/weekly", response_model=schemas.InsightResponse, tags=["Insights"])
def weekly_insights(
    db: DbSession,
    user_id: int = Query(default=1, ge=1),
    force_regenerate: bool = Query(default=False),
) -> schemas.InsightResponse:
    """
    Generate or fetch weekly AI productivity insights.
    Saves generated insights in the database.
    """
    week_start, week_end = week_bounds_utc()

    if not force_regenerate:
        existing = crud.get_latest_weekly_insight(db, user_id=user_id, week_start=week_start)
        if existing:
            tips = [line.strip() for line in existing.insights_text.splitlines() if line.strip()]
            return schemas.InsightResponse(
                week_start=existing.week_start,
                generated_at=existing.created_at,
                insights=tips,
            )

    weekly_summary = compute_analytics(db, user_id=user_id, period_start=week_start, period_end=week_end)
    tips = generate_productivity_insights(weekly_summary)
    # generate_productivity_insights already has a deterministic fallback,
    # so if we still don't have 3, something is critically wrong
    if len(tips) < 1:
        raise HTTPException(status_code=500, detail="Failed to generate insights")

    saved = crud.save_weekly_insight(db, user_id=user_id, week_start=week_start, summary=weekly_summary, tips=tips)
    return schemas.InsightResponse(week_start=saved.week_start, generated_at=saved.created_at, insights=tips)

