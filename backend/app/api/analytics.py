"""
api/analytics.py — Query analytics endpoints for the officer dashboard.

Strictly queries the real `query_logs` database table.
Zero fake/mock data: returns empty lists and zeros when no logs exist.

Endpoints:
  GET /api/v1/analytics              — Unified analytics payload (metrics, top-5 queries, district distribution, daily volume, modality counts)
  GET /api/v1/analytics/top-queries  — Most asked queries (LIMIT 5-50)
  GET /api/v1/analytics/by-region    — Query count per district/region
  GET /api/v1/analytics/daily-volume — Daily query volume
  GET /api/v1/analytics/performance  — Latencies, cache hit rate, modality breakdown
"""
import logging
from datetime import datetime, timedelta, timezone
from typing import List, Optional

from fastapi import APIRouter, Depends, Query, HTTPException, Security, status
from fastapi.security import APIKeyHeader
from sqlalchemy import func, select, desc, cast, Date, Integer
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models.query_log import QueryLog
from app.schemas.query import (
    TopQuery, RegionStats, DailyVolume, PerformanceStats,
    UnifiedAnalyticsResponse, TopQueryItem, DistrictDistributionItem,
    DailyVolumeItem, ModalityCounts,
)
from app.config import settings

logger = logging.getLogger(__name__)

api_key_header = APIKeyHeader(name="X-Admin-Key", auto_error=False)


async def verify_admin_access(
    admin_key: Optional[str] = Security(api_key_header),
) -> None:
    """
    Verifies officer authorization for analytics endpoints.
    - If settings.admin_api_key is set: requires header 'X-Admin-Key' to match.
    - If in production without key configured: denies access for safety.
    - In local development mode without key: permits open read-only access.
    """
    configured_key = settings.admin_api_key
    if configured_key:
        if not admin_key or admin_key != configured_key:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Unauthorized: Valid 'X-Admin-Key' header required for analytics access.",
                headers={"WWW-Authenticate": "ApiKey"},
            )
    elif settings.is_production:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Analytics disabled: ADMIN_API_KEY must be configured in production environment.",
        )


router = APIRouter(
    prefix="/api/v1/analytics",
    tags=["Analytics"],
    dependencies=[Depends(verify_admin_access)],
)


# ── Unified Analytics Route (Primary Endpoint for Dashboard) ──────────────────

@router.get(
    "",
    response_model=UnifiedAnalyticsResponse,
    summary="Unified analytics metrics for Officer Dashboard",
)
@router.get(
    "/",
    response_model=UnifiedAnalyticsResponse,
    include_in_schema=False,
)
async def get_unified_analytics(
    db: AsyncSession = Depends(get_db),
) -> UnifiedAnalyticsResponse:
    """
    Returns real aggregated metrics from the QueryLog table.
    If QueryLog has 0 records, returns empty lists and 0 values with zero mock data.
    """
    # 1. Total queries count
    total_res = await db.execute(select(func.count(QueryLog.id)))
    total_queries: int = total_res.scalar() or 0

    if total_queries == 0:
        return UnifiedAnalyticsResponse(
            total_queries=0,
            avg_latency=0.0,
            avg_latency_ms=0.0,
            top_queries=[],
            district_distribution=[],
            daily_volume=[],
            modality_counts=ModalityCounts(text=0, voice=0, image=0),
        )

    # 2. Average latency
    latency_res = await db.execute(select(func.avg(QueryLog.response_time_ms)))
    avg_latency_ms_raw = latency_res.scalar() or 0.0
    avg_latency_ms = round(float(avg_latency_ms_raw), 1)
    avg_latency_sec = round(avg_latency_ms / 1000.0, 2)

    # 3. Top 5 queries (grouped by question_english or question_original)
    query_col = func.coalesce(QueryLog.question_english, QueryLog.question_original)
    top_res = await db.execute(
        select(
            query_col.label("query"),
            func.count(QueryLog.id).label("count"),
        )
        .where(query_col.isnot(None))
        .where(query_col != "")
        .group_by(query_col)
        .order_by(desc("count"))
        .limit(5)
    )
    top_queries = [
        TopQueryItem(query=row.query, count=row.count)
        for row in top_res.all()
    ]

    # 4. District distribution with exact district names and percentages
    dist_res = await db.execute(
        select(
            QueryLog.region.label("district"),
            func.count(QueryLog.id).label("count"),
        )
        .where(QueryLog.region.isnot(None))
        .where(QueryLog.region != "")
        .group_by(QueryLog.region)
        .order_by(desc("count"))
    )
    dist_rows = dist_res.all()
    district_distribution = [
        DistrictDistributionItem(
            district=row.district,
            count=row.count,
            percentage=round((row.count / total_queries) * 100.0, 1),
        )
        for row in dist_rows
    ]

    # 5. Daily volume for the last 30 days
    cutoff = datetime.now(timezone.utc) - timedelta(days=30)
    daily_res = await db.execute(
        select(
            func.date(QueryLog.created_at).label("date"),
            func.count(QueryLog.id).label("count"),
        )
        .where(QueryLog.created_at >= cutoff)
        .group_by("date")
        .order_by("date")
    )
    daily_volume = [
        DailyVolumeItem(date=str(row.date), count=row.count)
        for row in daily_res.all()
    ]

    # 6. Modality counts (voice vs text vs image)
    modality_res = await db.execute(
        select(
            func.count(QueryLog.id).filter(QueryLog.input_mode == "text").label("text_count"),
            func.count(QueryLog.id).filter(QueryLog.input_mode == "voice").label("voice_count"),
            func.count(QueryLog.id).filter(QueryLog.input_mode == "image").label("image_count"),
        )
    )
    m_row = modality_res.one()
    modality_counts = ModalityCounts(
        text=m_row.text_count or 0,
        voice=m_row.voice_count or 0,
        image=m_row.image_count or 0,
    )

    return UnifiedAnalyticsResponse(
        total_queries=total_queries,
        avg_latency=avg_latency_sec,
        avg_latency_ms=avg_latency_ms,
        top_queries=top_queries,
        district_distribution=district_distribution,
        daily_volume=daily_volume,
        modality_counts=modality_counts,
    )


# ── Granular Analytics Endpoints ──────────────────────────────────────────────

@router.get(
    "/top-queries",
    response_model=List[TopQuery],
    summary="Most frequently asked questions",
)
async def get_top_queries(
    limit: int = Query(default=10, ge=1, le=50),
    db: AsyncSession = Depends(get_db),
) -> List[TopQuery]:
    """Returns the top N most-asked questions from real query logs."""
    query_col = func.coalesce(QueryLog.question_english, QueryLog.question_original)
    result = await db.execute(
        select(
            query_col.label("query"),
            func.count(QueryLog.id).label("count"),
        )
        .where(query_col.isnot(None))
        .where(query_col != "")
        .group_by(query_col)
        .order_by(desc("count"))
        .limit(limit)
    )
    rows = result.all()
    return [TopQuery(query=row.query, count=row.count) for row in rows]


@router.get(
    "/by-region",
    response_model=List[RegionStats],
    summary="Query count per district/region",
)
async def get_by_region(
    db: AsyncSession = Depends(get_db),
) -> List[RegionStats]:
    """Returns real query counts grouped by farmer's region."""
    result = await db.execute(
        select(
            QueryLog.region,
            func.count(QueryLog.id).label("count"),
        )
        .where(QueryLog.region.isnot(None))
        .where(QueryLog.region != "")
        .group_by(QueryLog.region)
        .order_by(desc("count"))
    )
    rows = result.all()
    return [RegionStats(region=row.region, count=row.count) for row in rows]


@router.get(
    "/daily-volume",
    response_model=List[DailyVolume],
    summary="Daily query volume for the last N days",
)
async def get_daily_volume(
    days: int = Query(default=30, ge=1, le=365),
    db: AsyncSession = Depends(get_db),
) -> List[DailyVolume]:
    """Returns real query counts per day for the last N days."""
    cutoff = datetime.now(timezone.utc) - timedelta(days=days)

    result = await db.execute(
        select(
            func.date(QueryLog.created_at).label("date"),
            func.count(QueryLog.id).label("count"),
        )
        .where(QueryLog.created_at >= cutoff)
        .group_by("date")
        .order_by("date")
    )
    rows = result.all()
    return [
        DailyVolume(date=str(row.date), count=row.count)
        for row in rows
    ]


@router.get(
    "/performance",
    response_model=PerformanceStats,
    summary="System performance statistics",
)
async def get_performance_stats(
    db: AsyncSession = Depends(get_db),
) -> PerformanceStats:
    """Returns real average response times, cache hit rate, and query breakdown."""
    result = await db.execute(
        select(
            func.count(QueryLog.id).label("total"),
            func.avg(QueryLog.response_time_ms).label("avg_response"),
            func.avg(QueryLog.retrieval_time_ms).label("avg_retrieval"),
            func.avg(QueryLog.llm_time_ms).label("avg_llm"),
            func.sum(
                cast(QueryLog.from_cache, Integer)
            ).label("cache_hits"),
            func.count(QueryLog.id).filter(
                QueryLog.input_mode == "voice"
            ).label("voice_count"),
            func.count(QueryLog.id).filter(
                QueryLog.input_mode == "text"
            ).label("text_count"),
            func.count(QueryLog.id).filter(
                QueryLog.input_mode == "image"
            ).label("image_count"),
        )
    )
    row = result.one()

    total = row.total or 0
    cache_hits = row.cache_hits or 0

    return PerformanceStats(
        avg_response_time_ms=round(row.avg_response, 1) if row.avg_response else None,
        avg_retrieval_time_ms=round(row.avg_retrieval, 1) if row.avg_retrieval else None,
        avg_llm_time_ms=round(row.avg_llm, 1) if row.avg_llm else None,
        cache_hit_rate=round(cache_hits / total, 4) if total > 0 else 0.0,
        total_queries=total,
        voice_queries=row.voice_count or 0,
        text_queries=row.text_count or 0,
        image_queries=row.image_count or 0,
    )
