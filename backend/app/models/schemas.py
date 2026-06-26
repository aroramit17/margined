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
    customer_id: str
    feature: str
    run_id: Optional[str] = None
    model: str
    provider: str
    input_tokens: int = Field(ge=0)
    output_tokens: int = Field(ge=0)
    cost_usd: float = Field(ge=0)
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
