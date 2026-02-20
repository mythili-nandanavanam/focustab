from datetime import datetime

from pydantic import BaseModel, Field, field_validator


ALLOWED_CATEGORIES = {"Work", "Social Media", "Entertainment", "Learning", "Shopping", "Other"}


class BrowsingEventIn(BaseModel):
    domain: str = Field(min_length=1, max_length=255)
    start_time: datetime
    duration_seconds: int = Field(ge=1, le=86400)

    @field_validator("domain")
    @classmethod
    def normalize_domain(cls, value: str) -> str:
        return value.lower().strip()


class TrackRequest(BaseModel):
    user_id: int = Field(default=1, ge=1)
    events: list[BrowsingEventIn] = Field(default_factory=list)


class TrackResponse(BaseModel):
    stored_events: int
    categories_applied: int


class PreferencesPayload(BaseModel):
    user_id: int = Field(default=1, ge=1)
    focus_sites: list[str] = Field(default_factory=list)
    blocked_sites: list[str] = Field(default_factory=list)
    time_limits: dict[str, int] = Field(default_factory=dict)

    @field_validator("focus_sites", "blocked_sites")
    @classmethod
    def normalize_domain_list(cls, values: list[str]) -> list[str]:
        return sorted({item.lower().strip() for item in values if item and item.strip()})

    @field_validator("time_limits")
    @classmethod
    def validate_limits(cls, limits: dict[str, int]) -> dict[str, int]:
        normalized: dict[str, int] = {}
        for domain, seconds in limits.items():
            if not isinstance(seconds, int) or seconds < 60:
                raise ValueError("time_limits values must be integer seconds >= 60")
            normalized[domain.lower().strip()] = seconds
        return normalized


class PreferencesResponse(BaseModel):
    user_id: int
    focus_sites: list[str]
    blocked_sites: list[str]
    time_limits: dict[str, int]


class AnalyticsResponse(BaseModel):
    period_start: datetime
    period_end: datetime
    total_time_per_domain: dict[str, int]
    total_time_per_category: dict[str, int]
    average_session_duration: float
    focus_vs_distraction_ratio: dict[str, float]
    peak_usage_hours: list[dict]
    tab_switch_frequency_per_hour: float
    total_events: int


class InsightResponse(BaseModel):
    week_start: datetime
    generated_at: datetime
    insights: list[str]

