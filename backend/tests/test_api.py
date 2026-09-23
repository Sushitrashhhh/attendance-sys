import pytest
from fastapi.testclient import TestClient
from app.main import app
from app.cv.preprocessing import encode_image_to_base64
import numpy as np

client = TestClient(app)


def test_health_endpoint():
    response = client.get("/health")
    assert response.status_code == 200
    data = response.json()
    assert "status" in data
    assert "database" in data
    assert data["database"] == "connected"


def test_list_students_api():
    response = client.get("/api/students")
    assert response.status_code == 200
    data = response.json()
    assert "total" in data
    assert "items" in data
    assert isinstance(data["items"], list)


def test_attendance_endpoints():
    res1 = client.get("/api/attendance")
    assert res1.status_code == 200
    assert "total" in res1.json()

    res2 = client.get("/api/attendance/today")
    assert res2.status_code == 200
    assert isinstance(res2.json(), list)


def test_analytics_endpoints():
    res_ov = client.get("/api/analytics/overview")
    assert res_ov.status_code == 200
    data = res_ov.json()
    assert "total_students" in data
    assert "present_today" in data
    assert "attendance_rate" in data

    res_tr = client.get("/api/analytics/trends?days=7")
    assert res_tr.status_code == 200
    assert len(res_tr.json()) == 7

    res_an = client.get("/api/analytics/anomalies")
    assert res_an.status_code == 200
    assert isinstance(res_an.json(), list)


def test_recognition_no_face():
    # Test recognition on a black image (no face)
    blank = np.zeros((200, 200, 3), dtype=np.uint8)
    b64 = encode_image_to_base64(blank)
    res = client.post(
        "/api/recognition/test-json",
        json={"image_base64": b64, "auto_mark": False},
    )
    assert res.status_code == 200
    data = res.json()
    assert data["status"] == "NO_FACE"
