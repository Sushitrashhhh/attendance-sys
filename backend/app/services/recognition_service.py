import logging
from typing import List, Optional
import numpy as np
from sqlalchemy.orm import Session

from app.config import get_settings
from app.cv.pipeline import get_pipeline
from app.repositories.student_repo import StudentRepository
from app.repositories.attendance_repo import AttendanceRepository
from app.schemas.recognition import RecognitionResult, RecognitionStudentInfo

logger = logging.getLogger("attendance.recognition")


class RecognitionService:
    """
    Business logic layer for facial recognition, anti-spoofing verification,
    and automatic attendance triggering.
    """

    def __init__(self):
        self.settings = get_settings()
        self.pipeline = get_pipeline()

    def recognize_single_image(
        self,
        db: Session,
        img_bgr: np.ndarray,
        auto_mark: bool = True,
    ) -> RecognitionResult:
        """
        Evaluate a single image (e.g. from POST /api/recognition/test):
        1. Detect faces
        2. Validate face count (0 -> NO_FACE, >1 -> MULTIPLE_FACES)
        3. Extract 512-D embedding and verify liveness
        4. Match via pgvector in Neon
        5. Trigger idempotent attendance if confidence >= threshold
        """
        frame_faces = self.pipeline.process_frame_for_recognition(img_bgr, max_faces=5)

        if len(frame_faces) == 0:
            return RecognitionResult(
                status="NO_FACE",
                confidence=0.0,
                liveness_score=0.0,
                message="No face detected in image.",
            )

        if len(frame_faces) > 1:
            return RecognitionResult(
                status="MULTIPLE_FACES",
                confidence=0.0,
                liveness_score=0.0,
                message=f"Multiple faces detected ({len(frame_faces)}). Please ensure only one person is in frame.",
            )

        face = frame_faces[0]
        liveness_score = face.liveness.score
        bbox_list = [int(v) for v in face.bbox]

        # Query Neon pgvector for nearest neighbor
        student_repo = StudentRepository(db)
        match_result = student_repo.find_nearest(face.embedding)

        if not match_result:
            return RecognitionResult(
                status="UNKNOWN",
                confidence=0.0,
                liveness_score=liveness_score,
                message="No enrolled students in database.",
                bbox=bbox_list,
            )

        student, similarity = match_result
        similarity = round(float(similarity), 4)
        logger.info(
            "[RECOG] name=%s roll=%s similarity=%.4f liveness_score=%.4f liveness_is_live=%s threshold_recog=%.2f threshold_liveness=%.2f",
            student.name, student.roll_number, similarity, liveness_score,
            face.liveness.is_live, self.settings.recognition_threshold, self.settings.liveness_threshold,
        )

        if similarity < self.settings.recognition_threshold:
            return RecognitionResult(
                status="UNKNOWN",
                confidence=similarity,
                liveness_score=liveness_score,
                message=f"Unknown face (highest similarity {similarity} below threshold {self.settings.recognition_threshold}).",
                bbox=bbox_list,
            )

        # Matched student candidate: verify liveness
        student_info = RecognitionStudentInfo(
            id=student.id,
            name=student.name,
            roll_number=student.roll_number,
            branch=student.branch,
            semester=student.semester,
        )

        if not face.liveness.is_live:
            return RecognitionResult(
                status="LIVENESS_FAILED",
                student=student_info,
                confidence=similarity,
                liveness_score=liveness_score,
                message=f"Liveness verification failed: {face.liveness.reason}",
                bbox=bbox_list,
            )

        # Mark attendance if requested
        attendance_status = "NOT_APPLICABLE"
        if auto_mark:
            att_repo = AttendanceRepository(db)
            _, mark_res = att_repo.mark_attendance(
                student_id=student.id,
                confidence=similarity,
                liveness_score=liveness_score,
                status="present",
            )
            attendance_status = "MARKED" if mark_res == "marked" else "ALREADY_MARKED"

        return RecognitionResult(
            status="MATCH",
            student=student_info,
            confidence=similarity,
            liveness_score=liveness_score,
            attendance=attendance_status,
            message=f"Recognized as {student.name} ({student.roll_number}).",
            bbox=bbox_list,
        )

    def recognize_frame(
        self,
        db: Session,
        img_bgr: np.ndarray,
        auto_mark: bool = True,
        max_faces: int = 4,
    ) -> List[RecognitionResult]:
        """
        Process incoming live video stream frame with multiple face detection & recognition.
        """
        frame_faces = self.pipeline.process_frame_for_recognition(img_bgr, max_faces=max_faces)
        results: List[RecognitionResult] = []

        if not frame_faces:
            return []

        student_repo = StudentRepository(db)
        att_repo = AttendanceRepository(db) if auto_mark else None

        for face in frame_faces:
            bbox_list = [int(v) for v in face.bbox]
            liveness_score = face.liveness.score

            match_result = student_repo.find_nearest(face.embedding)
            if not match_result:
                results.append(
                    RecognitionResult(
                        status="UNKNOWN",
                        confidence=0.0,
                        liveness_score=liveness_score,
                        bbox=bbox_list,
                    )
                )
                continue

            student, similarity = match_result
            similarity = round(float(similarity), 4)
            logger.info(
                "[FRAME] name=%s roll=%s similarity=%.4f liveness_score=%.4f is_live=%s",
                student.name, student.roll_number, similarity, liveness_score, face.liveness.is_live,
            )

            if similarity < self.settings.recognition_threshold:
                results.append(
                    RecognitionResult(
                        status="UNKNOWN",
                        confidence=similarity,
                        liveness_score=liveness_score,
                        bbox=bbox_list,
                    )
                )
                continue

            student_info = RecognitionStudentInfo(
                id=student.id,
                name=student.name,
                roll_number=student.roll_number,
                branch=student.branch,
                semester=student.semester,
            )

            if not face.liveness.is_live:
                results.append(
                    RecognitionResult(
                        status="LIVENESS_FAILED",
                        student=student_info,
                        confidence=similarity,
                        liveness_score=liveness_score,
                        message=face.liveness.reason,
                        bbox=bbox_list,
                    )
                )
                continue

            attendance_status = "NOT_APPLICABLE"
            if att_repo:
                _, mark_res = att_repo.mark_attendance(
                    student_id=student.id,
                    confidence=similarity,
                    liveness_score=liveness_score,
                    status="present",
                )
                attendance_status = "MARKED" if mark_res == "marked" else "ALREADY_MARKED"

            results.append(
                RecognitionResult(
                    status="MATCH",
                    student=student_info,
                    confidence=similarity,
                    liveness_score=liveness_score,
                    attendance=attendance_status,
                    bbox=bbox_list,
                )
            )

        return results


_recognition_service: Optional[RecognitionService] = None


def get_recognition_service() -> RecognitionService:
    global _recognition_service
    if _recognition_service is None:
        _recognition_service = RecognitionService()
    return _recognition_service
