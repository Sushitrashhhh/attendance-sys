from dataclasses import dataclass
from typing import List, Optional, Tuple, Dict, Any
import numpy as np
import cv2

from app.cv.detector import FaceDetector, DetectedFace
from app.cv.embedder import FaceEmbedder
from app.cv.liveness import LivenessDetector, LivenessResult
from app.cv.preprocessing import (
    align_face_112x112,
    assess_image_quality,
    decode_image_bytes,
    decode_base64_image,
)
from app.config import get_settings


@dataclass
class EnrollmentResult:
    success: bool
    message: str
    embedding: Optional[List[float]] = None
    face_bbox: Optional[Tuple[int, int, int, int]] = None
    quality_metrics: Optional[Dict[str, Any]] = None


@dataclass
class FrameFaceResult:
    bbox: Tuple[int, int, int, int]
    detector_confidence: float
    landmarks: np.ndarray
    aligned_crop: np.ndarray
    embedding: List[float]
    liveness: LivenessResult


class FaceRecognitionPipeline:
    """
    Unified CV pipeline handling detection, alignment, embedding, and anti-spoofing.
    Thread-safe and reused across API routes and services.
    """

    def __init__(self):
        settings = get_settings()
        self.detector = FaceDetector(conf_threshold=0.55)
        self.embedder = FaceEmbedder()
        self.liveness_detector = LivenessDetector(threshold=settings.liveness_threshold)

    def process_enrollment_image(self, img_bgr: np.ndarray) -> EnrollmentResult:
        """
        Full enrollment pipeline:
        1. Validate single face & presence
        2. Validate illumination, sharpness, and quality
        3. Align to 112x112 canonical ArcFace reference
        4. Generate L2-normalized 512-D embedding
        """
        valid_face, face_msg, detected_face = self.detector.validate_single_face_for_enrollment(img_bgr)
        if not valid_face or detected_face is None:
            return EnrollmentResult(success=False, message=face_msg)

        # Quality check on the cropped face region
        x, y, w, h = detected_face.bbox
        face_crop = img_bgr[y : y + h, x : x + w]
        valid_quality, quality_msg, metrics = assess_image_quality(face_crop)
        if not valid_quality:
            return EnrollmentResult(
                success=False,
                message=quality_msg,
                quality_metrics=metrics,
            )

        # 5-point affine alignment
        aligned = align_face_112x112(img_bgr, detected_face.landmarks)

        # Generate 512-D embedding
        embedding = self.embedder.embed_to_list(aligned)

        return EnrollmentResult(
            success=True,
            message="Face enrolled successfully.",
            embedding=embedding,
            face_bbox=detected_face.bbox,
            quality_metrics=metrics,
        )

    def process_frame_for_recognition(
        self, img_bgr: np.ndarray, max_faces: int = 5
    ) -> List[FrameFaceResult]:
        """
        Process incoming webcam frame:
        Detects faces, evaluates liveness, aligns, and extracts 512-D embeddings.
        """
        detected_faces = self.detector.detect(img_bgr)
        results: List[FrameFaceResult] = []

        for face in detected_faces[:max_faces]:
            x, y, w, h = face.bbox
            face_crop = img_bgr[y : y + h, x : x + w]
            if face_crop.size == 0 or w < 20 or h < 20:
                continue

            # Anti-spoofing verification
            liveness = self.liveness_detector.verify_liveness(face_crop, face.landmarks)

            # 5-point alignment & 512-D embedding
            aligned = align_face_112x112(img_bgr, face.landmarks)
            embedding = self.embedder.embed_to_list(aligned)

            results.append(
                FrameFaceResult(
                    bbox=face.bbox,
                    detector_confidence=face.confidence,
                    landmarks=face.landmarks,
                    aligned_crop=aligned,
                    embedding=embedding,
                    liveness=liveness,
                )
            )

        return results


# Global singleton instance
_pipeline: Optional[FaceRecognitionPipeline] = None


def get_pipeline() -> FaceRecognitionPipeline:
    global _pipeline
    if _pipeline is None:
        _pipeline = FaceRecognitionPipeline()
    return _pipeline
