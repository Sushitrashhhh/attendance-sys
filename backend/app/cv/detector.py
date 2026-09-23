import os
from dataclasses import dataclass
from typing import List, Optional, Tuple
import cv2
import numpy as np

# Path to YuNet ONNX model
DEFAULT_YUNET_PATH = os.path.abspath(
    os.path.join(os.path.dirname(__file__), "..", "..", "..", "models", "face_detection_yunet_2023mar.onnx")
)


@dataclass
class DetectedFace:
    bbox: Tuple[int, int, int, int]  # x, y, w, h
    confidence: float
    landmarks: np.ndarray  # 5 landmarks: [[x1, y1], [x2, y2], [x3, y3], [x4, y4], [x5, y5]]


class FaceDetector:
    """Real-time face detector using OpenCV's native YuNet DNN model."""

    def __init__(
        self,
        model_path: str = DEFAULT_YUNET_PATH,
        conf_threshold: float = 0.6,
        nms_threshold: float = 0.3,
        top_k: int = 5000,
    ):
        self.model_path = model_path
        self.conf_threshold = conf_threshold
        self.nms_threshold = nms_threshold
        self.top_k = top_k
        self._detector: Optional[cv2.FaceDetectorYN] = None
        self._input_size: Tuple[int, int] = (320, 320)
        self._init_detector()

    def _init_detector(self) -> None:
        if not os.path.exists(self.model_path):
            raise FileNotFoundError(
                f"YuNet model not found at {self.model_path}. Please run download script."
            )
        self._detector = cv2.FaceDetectorYN.create(
            model=self.model_path,
            config="",
            input_size=self._input_size,
            score_threshold=self.conf_threshold,
            nms_threshold=self.nms_threshold,
            top_k=self.top_k,
        )

    def detect(self, img: np.ndarray) -> List[DetectedFace]:
        """
        Detect faces in a BGR image.
        Returns list of DetectedFace objects.
        """
        if img is None or img.size == 0:
            return []

        h, w = img.shape[:2]
        if (w, h) != self._input_size:
            self._input_size = (w, h)
            self._detector.setInputSize((w, h))

        faces = self._detector.detect(img)
        detected: List[DetectedFace] = []

        if faces[1] is None:
            return []

        for face in faces[1]:
            # YuNet output format: [x1, y1, w, h, x_re, y_re, x_le, y_le, x_nt, y_nt, x_rcm, y_rcm, x_lcm, y_lcm, score]
            x, y, fw, fh = int(face[0]), int(face[1]), int(face[2]), int(face[3])
            score = float(face[-1])

            # Extract 5 landmarks: right eye, left eye, nose, right mouth, left mouth
            landmarks = np.array([
                [face[4], face[5]],   # Right eye
                [face[6], face[7]],   # Left eye
                [face[8], face[9]],   # Nose tip
                [face[10], face[11]], # Right mouth
                [face[12], face[13]]  # Left mouth
            ], dtype=np.float32)

            # Clamp bounding box coordinates to image boundaries
            x = max(0, x)
            y = max(0, y)
            fw = min(w - x, fw)
            fh = min(h - y, fh)

            if fw > 10 and fh > 10:
                detected.append(DetectedFace(
                    bbox=(x, y, fw, fh),
                    confidence=round(score, 4),
                    landmarks=landmarks,
                ))

        return detected

    def validate_single_face_for_enrollment(
        self, img: np.ndarray, min_face_size: int = 60
    ) -> Tuple[bool, str, Optional[DetectedFace]]:
        """
        Strict validation for student registration:
        1. Exactly one face visible
        2. Minimum face size constraint
        3. Good detection confidence
        """
        faces = self.detect(img)
        if len(faces) == 0:
            return False, "No face detected. Please face the camera directly.", None
        if len(faces) > 1:
            return False, "Multiple faces detected. Please ensure only one person is in frame.", None

        face = faces[0]
        w, h = face.bbox[2], face.bbox[3]
        if w < min_face_size or h < min_face_size:
            return False, "Face is too far away. Please move closer to the camera.", None

        if face.confidence < 0.70:
            return False, "Low detection confidence. Ensure good lighting and face the camera.", None

        return True, "Valid single face detected.", face
