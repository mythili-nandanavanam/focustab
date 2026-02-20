from sqlalchemy import JSON, DateTime, ForeignKey, Integer, String, Text, UniqueConstraint, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class User(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    created_at: Mapped[DateTime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    browsing_events: Mapped[list["BrowsingEvent"]] = relationship(back_populates="user", cascade="all, delete-orphan")
    preferences: Mapped["Preference"] = relationship(back_populates="user", uselist=False, cascade="all, delete-orphan")
    insights: Mapped[list["WeeklyInsight"]] = relationship(back_populates="user", cascade="all, delete-orphan")


class BrowsingEvent(Base):
    __tablename__ = "browsing_events"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True, nullable=False)
    domain: Mapped[str] = mapped_column(String(255), index=True, nullable=False)
    start_time: Mapped[DateTime] = mapped_column(DateTime(timezone=True), index=True, nullable=False)
    duration: Mapped[int] = mapped_column(Integer, nullable=False)
    category: Mapped[str] = mapped_column(String(80), nullable=False, default="Other")

    user: Mapped["User"] = relationship(back_populates="browsing_events")


class DomainCategory(Base):
    __tablename__ = "domain_categories"

    domain: Mapped[str] = mapped_column(String(255), primary_key=True)
    category: Mapped[str] = mapped_column(String(80), nullable=False)
    created_at: Mapped[DateTime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at: Mapped[DateTime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False)


class Preference(Base):
    __tablename__ = "preferences"
    __table_args__ = (UniqueConstraint("user_id", name="uq_preferences_user_id"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    focus_sites: Mapped[list[str]] = mapped_column(JSON, nullable=False, default=list)
    blocked_sites: Mapped[list[str]] = mapped_column(JSON, nullable=False, default=list)
    time_limits: Mapped[dict[str, int]] = mapped_column(JSON, nullable=False, default=dict)
    updated_at: Mapped[DateTime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False)

    user: Mapped["User"] = relationship(back_populates="preferences")


class WeeklyInsight(Base):
    __tablename__ = "weekly_insights"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True, nullable=False)
    week_start: Mapped[DateTime] = mapped_column(DateTime(timezone=True), nullable=False, index=True)
    raw_summary: Mapped[dict] = mapped_column(JSON, nullable=False, default=dict)
    insights_text: Mapped[str] = mapped_column(Text, nullable=False)
    created_at: Mapped[DateTime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    user: Mapped["User"] = relationship(back_populates="insights")
