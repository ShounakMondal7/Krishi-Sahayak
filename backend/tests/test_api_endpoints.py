import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.services.rate_limiter import query_rate_limiter


@pytest.fixture
def client():
    """Provides a TestClient within the application lifespan context."""
    query_rate_limiter.reset()
    with TestClient(app) as c:
        yield c


def test_root_endpoint(client):
    """Validates the root redirect/info endpoint."""
    response = client.get("/")
    assert response.status_code == 200
    data = response.json()
    assert "name" in data
    assert "version" in data
    assert data["docs"] == "/docs"


def test_health_endpoint(client):
    """Validates system health probe endpoint."""
    response = client.get("/health")
    assert response.status_code == 200
    data = response.json()
    assert "status" in data
    assert "chroma_documents" in data
    assert "db" in data
    assert data["status"] in ("ok", "degraded")


def test_analytics_endpoint(client):
    """Validates analytics unified response structure."""
    response = client.get("/api/v1/analytics")
    # In development mode without admin key configured, this should return 200
    assert response.status_code == 200
    data = response.json()
    assert "total_queries" in data
    assert "top_queries" in data
    assert "district_distribution" in data
    assert "modality_counts" in data


def test_query_validation_error(client):
    """Validates that malformed query requests are rejected with HTTP 422."""
    response = client.post(
        "/api/v1/query",
        json={"question": "", "language": "ml"},  # Question too short
    )
    assert response.status_code == 422


def test_query_successful_flow(client):
    """Validates end-to-end query endpoint with grounded answer."""
    response = client.post(
        "/api/v1/query",
        json={
            "question": "What is the organic control for rice brown planthopper?",
            "language": "en",
            "region": "Palakkad",
        },
    )
    assert response.status_code == 200
    data = response.json()
    assert "answer" in data
    assert "sources" in data
    assert "response_time_ms" in data
    assert len(data["answer"]) > 0
