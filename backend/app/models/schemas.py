"""Pydantic schemas for request/response validation."""

from __future__ import annotations
from datetime import datetime, date
from typing import Optional, Any
from uuid import UUID
from pydantic import BaseModel, Field


# ──────────────────────────────────────────────
# Ingest
# ──────────────────────────────────────────────

class LLMEventIn(BaseModel):
    customer_id: str = Field(min_length=1, max_length=512)
    feature: str = Field(min_length=1, max_length=512)
    run_id: Optional[str] = Field(default=None, max_length=128)
    event_id: str = Field(min_length=1, max_length=64)
    model: str = Field(min_length=1, max_length=512)
    provider: str = Field(default="unknown", max_length=64)
    input_tokens: int = Field(ge=0, le=100_000_000)
    output_tokens: int = Field(ge=0, le=100_000_000)
    cache_read_tokens: int = Field(default=0, ge=0, le=100_000_000)
    cache_write_tokens: int = Field(default=0, ge=0, le=100_000_000)
    cost_usd: float = Field(default=0.0, ge=0, le=100_000)
    occurred_at: datetime
    metadata: dict[str, Any] = {}


class BatchIngestRequest(BaseModel):
    events: list[LLMEventIn]


# ──────────────────────────────────────────────
# Projects
# ──────────────────────────────────────────────

class ProjectCreate(BaseModel):
    name: str


class ProjectOut(BaseModel):
    id: UUID
    name: str
    api_key: str
    created_at: datetime


# ──────────────────────────────────────────────
# Customers
# ──────────────────────────────────────────────

class CustomerRow(BaseModel):
    customer_id: str
    total_cost: float
    call_count: int
    mrr: Optional[float] = None
    margin: Optional[float] = None
    plan: Optional[str] = None
    alert_status: str = "ok"  # "ok" | "watch" | "risk"


class CustomerDetail(BaseModel):
    customer_id: str
    total_cost: float
    call_count: int
    mrr: Optional[float] = None
    margin: Optional[float] = None
    plan: Optional[str] = None
    cost_by_feature: list[dict]
    cost_by_day: list[dict]
    recent_calls: list[dict]


# ──────────────────────────────────────────────
# Features
# ──────────────────────────────────────────────

class FeatureRow(BaseModel):
    feature: str
    total_cost: float
    call_count: int
    avg_cost_per_call: float
    pct_of_bill: float


# ──────────────────────────────────────────────
# Summary
# ──────────────────────────────────────────────

class SummaryOut(BaseModel):
    total_cost_mtd: float
    projected_month_end: float
    pct_change_vs_last_month: Optional[float]
    customers_at_risk: int
    top_cost_driver_feature: Optional[str]
    total_customers: int


class TrendPoint(BaseModel):
    date: date
    cost: float
    calls: int


class TrendOut(BaseModel):
    points: list[TrendPoint]
    total_cost: float
    total_calls: int


# ──────────────────────────────────────────────
# Pricing calculator
# ──────────────────────────────────────────────

class TierAnalysis(BaseModel):
    tier_name: str
    customer_count: int
    median_calls: float
    median_cogs: float
    p90_calls: float
    p90_cogs: float
    p99_cogs: float
    break_even_price: float
    recommended_price: float
    current_price: Optional[float]
    margin_at_median: float
    margin_at_p90: float
    margin_at_p99: float
    usage_cap_recommendation: Optional[int]


class PricingCalculatorOut(BaseModel):
    target_margin: float
    tiers: list[TierAnalysis]


# ──────────────────────────────────────────────
# Alerts
# ──────────────────────────────────────────────

class AlertConfigCreate(BaseModel):
    alert_type: str  # "margin_threshold" | "feature_spend" | "bill_forecast"
    threshold: float
    channel: str    # "email" | "slack"
    destination: str


class AlertConfigOut(BaseModel):
    id: UUID
    alert_type: str
    threshold: float
    channel: str
    destination: str
    last_fired_at: Optional[datetime]
    enabled: bool


# ──────────────────────────────────────────────
# Stripe
# ──────────────────────────────────────────────

class StripeCustomerMap(BaseModel):
    customer_id: str       # SDK user_id
    stripe_customer: str   # Stripe customer ID
    current_mrr_usd: Optional[float]
    plan_name: Optional[str]
