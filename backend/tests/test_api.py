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


def test_manual_mark_export_report_lifecycle():
    """Manual mark -> duplicate refused -> search/export/report/absent -> undo -> edit -> cleanup."""
    from app.db.database import get_db_context
    from app.repositories.student_repo import StudentRepository

    roll = "TEST_MANUAL_9999"
    rng = np.random.default_rng(7)
    vec = rng.standard_normal(512).astype(np.float32)
    vec /= np.linalg.norm(vec)

    with get_db_context() as db:
        repo = StudentRepository(db)
        old = repo.get_by_roll_number(roll)
        if old:
            repo.delete(old.id)
        sid = repo.create(name="Manual Mark Test", roll_number=roll, branch="QA", semester=1,
                          embedding=[float(x) for x in vec]).id

    try:
        absent = client.get("/api/attendance/absent-today").json()
        assert any(s["id"] == sid for s in absent)

        res = client.post("/api/attendance/mark", json={"student_id": sid})
        assert res.status_code == 200, res.text
        record = res.json()
        assert record["method"] == "manual"
        assert client.post("/api/attendance/mark", json={"student_id": sid}).status_code == 409

        absent = client.get("/api/attendance/absent-today").json()
        assert not any(s["id"] == sid for s in absent)

        listed = client.get("/api/attendance", params={"search": roll}).json()
        assert listed["total"] == 1 and listed["items"][0]["id"] == record["id"]

        csv_text = client.get("/api/attendance/export", params={"search": roll}).content.decode("utf-8-sig")
        assert csv_text.splitlines()[0].startswith("Date,Time,Lecture,Roll Number")
        assert roll in csv_text and "manual" in csv_text

        report = {r["student_id"]: r for r in client.get("/api/analytics/students").json()}
        assert report[sid]["present_days"] == 1 and report[sid]["percentage"] == 100.0

        anomalies = client.get("/api/analytics/anomalies").json()
        assert not any(a["student_id"] == sid for a in anomalies), "manual marks must not be flagged"

        assert client.delete(f"/api/attendance/{record['id']}").status_code == 200
        assert client.delete(f"/api/attendance/{record['id']}").status_code == 404

        edited = client.put(f"/api/students/{sid}", json={"name": "Renamed Student", "semester": 3})
        assert edited.status_code == 200
        assert edited.json()["name"] == "Renamed Student" and edited.json()["semester"] == 3
        assert edited.json()["roll_number"] == roll
    finally:
        client.delete(f"/api/students/{sid}")


def test_websocket_replies_to_every_frame():
    """Frames sent faster than the rate limit must be delayed, not dropped (dropping stalls the client)."""
    b64 = encode_image_to_base64(np.zeros((120, 160, 3), dtype=np.uint8))
    with client.websocket_connect("/ws/live-attendance") as ws:
        for _ in range(3):
            ws.send_json({"image": b64, "auto_mark": False})
            assert ws.receive_json()["faces"] == []
