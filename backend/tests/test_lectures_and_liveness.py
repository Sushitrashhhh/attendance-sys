from datetime import datetime, time, timedelta
from types import SimpleNamespace

import numpy as np
import pytest
from fastapi.testclient import TestClient

from app.cv.preprocessing import yaw_ratio
from app.main import app
from app.schemas.recognition import RecognitionResult, RecognitionStudentInfo
from app.services.attendance_rules import FAILED_CHECKS_TO_FLAG, attendance_outlook, in_class, lecture_status
from app.services.live_session import ACTIONS, CHALLENGE_SECONDS, TURN_THRESHOLD, LiveSession
from app.services.recognition_service import Identified

client = TestClient(app)


# ---------- pure rules ----------

def test_lecture_status_and_class_membership():
    lec = SimpleNamespace(start_time=time(10, 0), late_after_minutes=10, branch="CSE", semester=5)
    assert lecture_status(lec, datetime(2026, 9, 28, 10, 10)) == "present"  # exactly at the cutoff
    assert lecture_status(lec, datetime(2026, 9, 28, 10, 11)) == "late"
    assert lecture_status(None, datetime(2026, 9, 28, 23, 0)) == "present"

    assert in_class(SimpleNamespace(branch=" cse ", semester=5), lec)
    assert not in_class(SimpleNamespace(branch="ECE", semester=5), lec)
    assert not in_class(SimpleNamespace(branch="CSE", semester=3), lec)
    assert in_class(SimpleNamespace(branch="ECE", semester=3), None)


def test_attendance_outlook_at_75_percent():
    assert attendance_outlook(0, 0) is None
    assert attendance_outlook(3, 4) == {"can_miss": 0}  # exactly 75%
    assert attendance_outlook(4, 4) == {"can_miss": 1}  # 4/5 = 80%, 4/6 would be 66%
    assert attendance_outlook(6, 6) == {"can_miss": 2}  # 6/8 = 75%
    assert attendance_outlook(2, 4) == {"must_attend": 4}  # 6/8 = 75%, 5/7 = 71%
    assert attendance_outlook(0, 1) == {"must_attend": 3}  # 3/4
    for present in range(0, 30):  # brute-force cross-check
        for total in range(max(present, 1), 30):
            out = attendance_outlook(present, total)
            if "can_miss" in out:
                k = out["can_miss"]
                assert 100 * present >= 75 * (total + k) and 100 * present < 75 * (total + k + 1)
            else:
                n = out["must_attend"]
                assert 100 * (present + n) >= 75 * (total + n) and 100 * (present + n - 1) < 75 * (total + n - 1)


def test_yaw_ratio_direction_and_photo_invariance():
    frontal = np.array([[40, 50], [70, 50], [55, 65], [44, 80], [66, 80]], dtype=np.float32)
    assert abs(yaw_ratio(frontal)) < 1e-6
    # Subject turns to their left -> nose moves to image-right in an unmirrored frame
    turned = frontal.copy()
    turned[2, 0] += 8
    assert yaw_ratio(turned) * ACTIONS["turn_left"] >= TURN_THRESHOLD
    # A flat photo rotated about the vertical axis just compresses x: the ratio doesn't change
    photo_rotated = frontal.copy()
    photo_rotated[:, 0] = 55 + (photo_rotated[:, 0] - 55) * np.cos(np.radians(50))
    assert abs(yaw_ratio(photo_rotated)) < 1e-6


# ---------- head-turn challenge state machine (no DB, fake clock) ----------

class FakeService:
    def __init__(self):
        self.marked = []
        self.failed = []

    def record_failed_check(self, db, student_id, lecture):
        self.failed.append(student_id)

    def blocked_reason(self, db, student, lecture):
        return "ALREADY_MARKED" if student.id in self.marked else None

    def mark(self, db, ident, lecture):
        self.marked.append(ident.student.id)
        ident.result.attendance = "MARKED"
        ident.result.attendance_status = "present"


def face(status="MATCH", yaw=0.0, bbox=(100, 100, 80, 80), sid=7):
    student = SimpleNamespace(id=sid, name="Asha", roll_number="R7") if status == "MATCH" else None
    info = RecognitionStudentInfo(id=sid, name="Asha", roll_number="R7") if student else None
    result = RecognitionResult(status=status, student=info, confidence=0.8 if student else 0.3,
                               liveness_score=0.9, bbox=list(bbox))
    return Identified(result=result, student=student, embedding=[0.0] * 512, yaw=yaw)


class Clock:
    t = 1000.0

    def __call__(self):
        return self.t


def new_session():
    clock = Clock()
    return LiveSession(service=FakeService(), clock=clock, rng=__import__("random").Random(1)), clock


def step(session, *faces, challenge=True):
    return session.step(None, list(faces), auto_mark=True, lecture=None, challenge=challenge)


def test_challenge_must_be_completed_in_the_requested_direction():
    session, _ = new_session()
    [r] = step(session, face())
    assert r.attendance == "CHALLENGE" and r.challenge in ACTIONS
    sign = ACTIONS[r.challenge]

    # Turning the wrong way does nothing; the turned face isn't recognised but is followed by position
    [r] = step(session, face(status="UNKNOWN", yaw=-sign * 0.3, bbox=(110, 100, 80, 80)))
    assert r.attendance == "CHALLENGE" and r.student.name == "Asha"
    assert session.service.marked == []

    [r] = step(session, face(status="UNKNOWN", yaw=sign * 0.3, bbox=(115, 102, 80, 80)))
    assert r.attendance == "MARKED" and r.challenge is None
    assert session.service.marked == [7]

    [r] = step(session, face())
    assert r.attendance == "ALREADY_MARKED"


def test_photo_never_passes_and_times_out_then_retries():
    session, clock = new_session()
    step(session, face())
    for _ in range(5):  # a photo: recognised, but yaw stays ~0
        clock.t += 1
        [r] = step(session, face(yaw=0.01))
        assert r.attendance == "CHALLENGE"
    clock.t += CHALLENGE_SECONDS
    [r] = step(session, face())
    assert r.attendance == "CHALLENGE_FAILED"
    assert session.service.marked == []
    assert session.service.failed == [7], "a timed-out challenge is recorded exactly once"
    clock.t += 5
    [r] = step(session, face())
    assert r.attendance == "CHALLENGE"


def test_far_away_face_is_not_confused_with_the_challenged_one():
    session, _ = new_session()
    [r] = step(session, face())
    sign = ACTIONS[r.challenge]
    [r] = step(session, face(status="UNKNOWN", yaw=sign * 0.4, bbox=(400, 100, 80, 80)))
    assert r.status == "UNKNOWN" and r.attendance is None
    assert session.service.marked == []


def test_challenge_can_be_switched_off():
    session, _ = new_session()
    [r] = step(session, face(), challenge=False)
    assert r.attendance == "MARKED"


# ---------- lectures, late marking and learned faces (Neon DB) ----------

def _unit(seed):
    v = np.random.default_rng(seed).standard_normal(512).astype(np.float32)
    return [float(x) for x in v / np.linalg.norm(v)]


def test_lecture_attendance_late_marking_and_learning():
    from app.db.database import get_db_context
    from app.db.models import Lecture
    from app.repositories.student_repo import StudentRepository
    from app.services.recognition_service import get_recognition_service, LEARN_KEEP_PER_STUDENT

    now = datetime.now()
    if now.time() < time(0, 31) or now.time() > time(23, 57):
        pytest.skip("needs a lecture window that doesn't cross midnight")

    with get_db_context() as db:
        repo = StudentRepository(db)
        for roll in ("TEST_LEC_1", "TEST_LEC_2"):
            if (old := repo.get_by_roll_number(roll)):
                repo.delete(old.id)
        s1 = repo.create(name="Lecture Test", roll_number="TEST_LEC_1", branch="QA Branch", semester=2, embedding=_unit(1)).id
        s2 = repo.create(name="Other Class", roll_number="TEST_LEC_2", branch="Elsewhere", semester=2, embedding=_unit(2)).id

    lecture_ids = []
    try:
        base = {"branch": "qa branch", "semester": 2, "weekday": now.weekday(), "end_time": "23:59:00"}
        late_lec = client.post("/api/lectures", json={**base, "subject": "Started 30 min ago",
                               "start_time": (now - timedelta(minutes=30)).strftime("%H:%M:%S"), "late_after_minutes": 10}).json()
        ontime_lec = client.post("/api/lectures", json={**base, "subject": "Just started",
                                 "start_time": (now - timedelta(minutes=1)).strftime("%H:%M:%S"), "late_after_minutes": 60}).json()
        lecture_ids = [late_lec["id"], ontime_lec["id"]]
        bad = client.post("/api/lectures", json={**base, "subject": "Backwards", "start_time": "23:59:00", "end_time": "10:00:00"})
        assert bad.status_code == 422

        # The live session caches the lecture across frames/sessions; a commit must not break it
        live = LiveSession(service=FakeService())
        with get_db_context() as db:
            live._lecture_for(db, late_lec["id"])
            db.commit()
        cached = live._lecture_for(None, late_lec["id"])  # served from cache, no DB
        assert cached.subject == "Started 30 min ago" and cached.late_after_minutes == 10

        # Class restriction
        assert client.post("/api/attendance/mark", json={"student_id": s2, "lecture_id": late_lec["id"]}).status_code == 400
        absent = client.get("/api/attendance/absent-today", params={"lecture_id": late_lec["id"]}).json()
        assert [s["id"] for s in absent if s["id"] in (s1, s2)] == [s1]

        # Late vs on time, one record per lecture, plus a separate whole-day record
        r_late = client.post("/api/attendance/mark", json={"student_id": s1, "lecture_id": late_lec["id"]}).json()
        r_ok = client.post("/api/attendance/mark", json={"student_id": s1, "lecture_id": ontime_lec["id"]}).json()
        assert r_late["status"] == "late" and r_late["lecture_subject"] == "Started 30 min ago"
        assert r_ok["status"] == "present"
        assert client.post("/api/attendance/mark", json={"student_id": s1, "lecture_id": late_lec["id"]}).status_code == 409
        assert client.post("/api/attendance/mark", json={"student_id": s1}).status_code == 200

        ov = client.get("/api/analytics/overview", params={"lecture_id": late_lec["id"]}).json()
        assert ov["present_today"] == 1 and ov["late_today"] == 1
        report = {r["student_id"]: r for r in client.get("/api/analytics/students", params={"lecture_id": late_lec["id"]}).json()}
        assert s2 not in report and report[s1]["late_days"] == 1 and report[s1]["percentage"] == 100.0
        whole_day = {r["student_id"]: r for r in client.get("/api/analytics/students").json()}
        assert whole_day[s1]["present_days"] == 1, "three records on one date are one attended day"
        listed = client.get("/api/attendance", params={"lecture_id": ontime_lec["id"]}).json()
        assert listed["total"] == 1

        # Adaptive recognition: a learned sample is matched even though it differs from enrollment
        service = get_recognition_service()
        learned = _unit(3)
        with get_db_context() as db:
            student = StudentRepository(db).get_by_id(s1)
            ident = Identified(RecognitionResult(status="MATCH", confidence=0.8), student=student, embedding=learned)
            assert service.learn(db, ident)
            too_close = Identified(RecognitionResult(status="MATCH", confidence=0.8), student=student,
                                   embedding=learned, runner_up=0.75)
            assert not service.learn(db, too_close), "ambiguous matches must not be learned"
            match = StudentRepository(db).match(learned)
            assert match[0].id == s1 and match[1] > 0.99
            for i in range(LEARN_KEEP_PER_STUDENT + 2):
                StudentRepository(db).add_face_sample(s1, _unit(10 + i), 0.8, keep=LEARN_KEEP_PER_STUDENT)
        assert client.get(f"/api/students/{s1}").json()["learned_samples"] == LEARN_KEEP_PER_STUDENT
        assert client.delete(f"/api/students/{s1}/face-samples").json()["removed"] == LEARN_KEEP_PER_STUDENT
        assert client.get(f"/api/students/{s1}").json()["learned_samples"] == 0

        me = client.get("/api/analytics/self-check/TEST_LEC_1").json()
        subjects = {x["subject"]: x for x in me["subjects"]}
        assert subjects["Started 30 min ago"]["percentage"] == 100.0 and subjects["Started 30 min ago"]["late_days"] == 1
        assert set(subjects) == {"Started 30 min ago", "Just started"}

        assert client.delete(f"/api/lectures/{ontime_lec['id']}").status_code == 200
        assert all(lec["id"] != ontime_lec["id"] for lec in client.get("/api/lectures").json())
    finally:
        client.delete(f"/api/students/{s1}")
        client.delete(f"/api/students/{s2}")
        with get_db_context() as db:
            for lid in lecture_ids:
                if (lec := db.get(Lecture, lid)):
                    db.delete(lec)
            db.commit()


def test_excused_absence_failed_check_flag_and_self_check():
    from datetime import date
    from app.db.database import get_db_context
    from app.repositories.attendance_repo import AttendanceRepository
    from app.repositories.student_repo import StudentRepository

    with get_db_context() as db:
        repo = StudentRepository(db)
        for roll in ("TEST_EXC_1", "TEST_EXC_2"):
            if (old := repo.get_by_roll_number(roll)):
                repo.delete(old.id)
        here = repo.create(name="Here Today", roll_number="TEST_EXC_1", branch="QA", semester=1, embedding=_unit(21)).id
        away = repo.create(name="Sick Today", roll_number="TEST_EXC_2", branch="QA", semester=1, embedding=_unit(22)).id
    today = date.today().isoformat()

    try:
        assert client.post("/api/attendance/mark", json={"student_id": here}).status_code == 200  # makes today a class day
        before = {r["student_id"]: r for r in client.get("/api/analytics/students").json()}
        assert before[away]["percentage"] == 0.0 and before[away]["total_days"] == 1
        ov_before = client.get("/api/analytics/overview").json()

        bad = client.post("/api/excusals", json={"student_id": away, "date_from": today, "date_to": "2000-01-01", "reason": "Flu"})
        assert bad.status_code == 422
        exc = client.post("/api/excusals", json={"student_id": away, "date_from": today, "date_to": today, "reason": "Medical: flu"})
        assert exc.status_code == 201, exc.text

        after = {r["student_id"]: r for r in client.get("/api/analytics/students").json()}
        assert after[away]["excused_days"] == 1 and after[away]["total_days"] == 0 and after[away]["percentage"] is None
        assert after[here]["excused_days"] == 0 and after[here]["percentage"] == 100.0
        absent_ids = [s["id"] for s in client.get("/api/attendance/absent-today").json()]
        assert away not in absent_ids
        ov = client.get("/api/analytics/overview").json()
        assert ov["excused_today"] == ov_before["excused_today"] + 1
        assert ov["absent_today"] == ov_before["absent_today"] - 1
        assert [e["reason"] for e in client.get("/api/excusals", params={"student_id": away}).json()] == ["Medical: flu"]

        # Repeated failed head-turns become a flag; dismissing clears it
        with get_db_context() as db:
            for _ in range(FAILED_CHECKS_TO_FLAG - 1):
                AttendanceRepository(db).record_failed_check(here, None)
        flagged = lambda: [a for a in client.get("/api/analytics/anomalies").json()  # noqa: E731
                           if a["type"] == "REPEATED_FAILED_CHECKS" and a["student_id"] == here]
        assert flagged() == [], "below the threshold nothing is flagged"
        with get_db_context() as db:
            AttendanceRepository(db).record_failed_check(here, None)
        [flag] = flagged()
        assert flag["value"] == FAILED_CHECKS_TO_FLAG and flag["record_id"] is None and flag["date"] == today
        assert "never checked in on camera" in flag["reason"]  # only a manual mark exists
        assert client.delete("/api/analytics/failed-checks", params={"student_id": here, "date": today}).json()["removed"] == FAILED_CHECKS_TO_FLAG
        assert flagged() == []

        # Self-check by roll number (case-insensitive)
        me = client.get("/api/analytics/self-check/test_exc_1").json()
        assert me["student"]["name"] == "Here Today" and me["target"] == 75
        assert me["overall"]["percentage"] == 100.0 and me["overall"]["outlook"] == {"can_miss": 0}
        assert len(me["recent"]) == 1 and me["recent"][0]["method"] == "manual"
        assert client.get("/api/analytics/self-check/NOPE_404").status_code == 404

        assert client.delete(f"/api/excusals/{exc.json()['id']}").status_code == 200
        assert client.get("/api/analytics/students").json() and \
            {r["student_id"]: r for r in client.get("/api/analytics/students").json()}[away]["percentage"] == 0.0
    finally:
        client.delete(f"/api/students/{here}")
        client.delete(f"/api/students/{away}")
