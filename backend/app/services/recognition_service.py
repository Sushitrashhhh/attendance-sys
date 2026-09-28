import logging
from dataclasses import dataclass
from datetime import date, datetime
from typing import List, Optional
import numpy as np
from sqlalchemy.orm import Session

from app.config import get_settings
from app.cv.pipeline import get_pipeline
from app.db.models import Lecture, Student
from app.repositories.student_repo import StudentRepository
from app.repositories.attendance_repo import AttendanceRepository
from app.schemas.recognition import RecognitionResult, RecognitionStudentInfo
from app.services.attendance_rules import in_class, lecture_status

logger = logging.getLogger("attendance.recognition")

# Adaptive recognition: after a confident live check-in, keep that embedding as an extra
# reference so recognition follows gradual appearance changes. Guard rails against learning
# the wrong face: clearly above threshold, clearly better than any other student, not a
# near-duplicate of what we already have, and a bounded number of samples per student.
LEARN_MIN_ABOVE_THRESHOLD = 0.07
LEARN_MIN_GAP_TO_RUNNER_UP = 0.10
LEARN_MAX_SIMILARITY = 0.95
LEARN_KEEP_PER_STUDENT = 10


@dataclass
class Identified:
    """One detected face: the public result plus what marking/learning needs internally."""

    result: RecognitionResult
    student: Optional[Student] = None
    embedding: Optional[List[float]] = None
    runner_up: float = 0.0
    yaw: float = 0.0


class RecognitionService:
    """
    Business logic layer for facial recognition, anti-spoofing verification,
    lecture-aware attendance marking and adaptive learning.
    """

    def __init__(self):
        self.settings = get_settings()
        self.pipeline = get_pipeline()

    def identify_faces(self, db: Session, img_bgr: np.ndarray, max_faces: int = 4) -> List[Identified]:
        """Detect, embed, liveness-check and match every face. Never marks attendance."""
        student_repo = StudentRepository(db)
        threshold = self.settings.recognition_threshold
        identified: List[Identified] = []

        for face in self.pipeline.process_frame_for_recognition(img_bgr, max_faces=max_faces):
            bbox = [int(v) for v in face.bbox]
            liveness = face.liveness.score
            match = student_repo.match(face.embedding)

            if not match:
                identified.append(Identified(
                    RecognitionResult(status="UNKNOWN", liveness_score=liveness, bbox=bbox,
                                      message="No enrolled students in database."),
                    yaw=face.yaw,
                ))
                continue

            student, similarity, runner_up = match
            similarity = round(float(similarity), 4)
            logger.info(
                "[RECOG] roll=%s similarity=%.4f runner_up=%.4f liveness=%.4f is_live=%s yaw=%.2f",
                student.roll_number, similarity, runner_up, liveness, face.liveness.is_live, face.yaw,
            )

            if similarity < threshold:
                identified.append(Identified(
                    RecognitionResult(
                        status="UNKNOWN", confidence=similarity, liveness_score=liveness, bbox=bbox,
                        message=f"Unknown face (highest similarity {similarity} below threshold {threshold}).",
                    ),
                    yaw=face.yaw,
                ))
                continue

            info = RecognitionStudentInfo(
                id=student.id, name=student.name, roll_number=student.roll_number,
                branch=student.branch, semester=student.semester,
            )
            live = face.liveness.is_live
            identified.append(Identified(
                RecognitionResult(
                    status="MATCH" if live else "LIVENESS_FAILED",
                    student=info,
                    confidence=similarity,
                    liveness_score=liveness,
                    message=None if live else f"Liveness verification failed: {face.liveness.reason}",
                    bbox=bbox,
                ),
                student=student,
                embedding=face.embedding,
                runner_up=runner_up,
                yaw=face.yaw,
            ))
        return identified

    def blocked_reason(self, db: Session, student: Student, lecture: Optional[Lecture]) -> Optional[str]:
        """Why this student can't be marked right now (NOT_IN_CLASS / ALREADY_MARKED), or None."""
        if not in_class(student, lecture):
            return "NOT_IN_CLASS"
        existing = AttendanceRepository(db).get_by_student_and_date(
            student.id, date.today(), lecture.id if lecture else None
        )
        return "ALREADY_MARKED" if existing else None

    def mark(self, db: Session, ident: Identified, lecture: Optional[Lecture]) -> None:
        """Mark a MATCH present/late and record the outcome on ident.result. Learns the face on a new mark."""
        result = ident.result
        blocked = self.blocked_reason(db, ident.student, lecture)
        if blocked:
            result.attendance = blocked
            return

        record, outcome = AttendanceRepository(db).mark_attendance(
            student_id=ident.student.id,
            confidence=result.confidence,
            liveness_score=result.liveness_score,
            status=lecture_status(lecture, datetime.now()),
            lecture_id=lecture.id if lecture else None,
        )
        result.attendance = "MARKED" if outcome == "marked" else "ALREADY_MARKED"
        result.attendance_status = record.status
        if outcome == "marked":
            self.learn(db, ident)

    def record_failed_check(self, db: Session, student_id: int, lecture: Optional[Lecture]) -> None:
        """A head-turn challenge timed out; enough of these in a day gets the student flagged."""
        AttendanceRepository(db).record_failed_check(student_id, lecture.id if lecture else None)
        logger.info("[CHALLENGE] student_id=%s failed the head-turn check", student_id)

    def learn(self, db: Session, ident: Identified) -> bool:
        """Store this check-in's embedding as an extra reference if it is safe to do so."""
        similarity = ident.result.confidence
        if (
            ident.embedding is None
            or similarity < self.settings.recognition_threshold + LEARN_MIN_ABOVE_THRESHOLD
            or similarity > LEARN_MAX_SIMILARITY
            or similarity - ident.runner_up < LEARN_MIN_GAP_TO_RUNNER_UP
        ):
            return False
        StudentRepository(db).add_face_sample(
            ident.student.id, ident.embedding, similarity, keep=LEARN_KEEP_PER_STUDENT
        )
        logger.info("[LEARN] roll=%s learned a new face sample (similarity=%.4f)", ident.student.roll_number, similarity)
        return True

    def recognize_single_image(
        self,
        db: Session,
        img_bgr: np.ndarray,
        auto_mark: bool = True,
        lecture: Optional[Lecture] = None,
    ) -> RecognitionResult:
        """
        Evaluate a single image (e.g. POST /api/recognition/test). Exactly one face is required.
        Marks attendance directly: the head-turn challenge needs a live stream (see LiveSession).
        """
        faces = self.identify_faces(db, img_bgr, max_faces=5)
        if not faces:
            return RecognitionResult(status="NO_FACE", message="No face detected in image.")
        if len(faces) > 1:
            return RecognitionResult(
                status="MULTIPLE_FACES",
                message=f"Multiple faces detected ({len(faces)}). Please ensure only one person is in frame.",
            )

        ident = faces[0]
        if ident.result.status == "MATCH":
            if auto_mark:
                self.mark(db, ident, lecture)
            else:
                ident.result.attendance = "NOT_APPLICABLE"
            ident.result.message = f"Recognized as {ident.student.name} ({ident.student.roll_number})."
        return ident.result


_recognition_service: Optional[RecognitionService] = None


def get_recognition_service() -> RecognitionService:
    global _recognition_service
    if _recognition_service is None:
        _recognition_service = RecognitionService()
    return _recognition_service
