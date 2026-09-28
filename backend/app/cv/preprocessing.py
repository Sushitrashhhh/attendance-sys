import base64
import io
import cv2
import numpy as np
from typing import Tuple, Optional, List

# Standard ArcFace 112x112 canonical 5-point facial reference coordinates
ARCFACE_REFERENCE_PTS = np.array([
    [38.2946, 51.6963],  # Right eye
    [73.5318, 51.5014],  # Left eye
    [56.0252, 71.7366],  # Nose tip
    [41.5493, 92.3655],  # Right mouth corner
    [70.7299, 92.2041]   # Left mouth corner
], dtype=np.float32)


def decode_image_bytes(image_data: bytes) -> np.ndarray:
    """Decode raw image bytes (JPEG, PNG, etc.) to BGR OpenCV image."""
    nparr = np.frombuffer(image_data, np.uint8)
    img = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
    if img is None:
        raise ValueError("Failed to decode image bytes into a valid image.")
    return img


def decode_base64_image(base64_str: str) -> np.ndarray:
    """Decode a base64 encoded image string (with or without data:image prefix)."""
    if "," in base64_str:
        base64_str = base64_str.split(",", 1)[1]
    image_bytes = base64.b64decode(base64_str)
    return decode_image_bytes(image_bytes)


def encode_image_to_base64(img: np.ndarray, format: str = ".jpg") -> str:
    """Encode an OpenCV BGR image to base64 string."""
    success, buffer = cv2.imencode(format, img)
    if not success:
        raise ValueError("Failed to encode image to buffer.")
    return base64.b64encode(buffer).decode("utf-8")


def align_face_112x112(img: np.ndarray, landmarks: np.ndarray) -> np.ndarray:
    """
    Align face using 5 facial landmarks to standard 112x112 ArcFace format
    using similarity transform (estimateAffinePartial2D).
    landmarks: (5, 2) array [right_eye, left_eye, nose, right_mouth, left_mouth].
    """
    src_pts = landmarks.astype(np.float32)
    # Estimate similarity transform matrix (rotation, uniform scale, translation)
    transform_matrix, _ = cv2.estimateAffinePartial2D(src_pts, ARCFACE_REFERENCE_PTS)
    
    if transform_matrix is None:
        # Fallback to affine transform using first 3 points (eyes and nose)
        transform_matrix = cv2.getAffineTransform(src_pts[:3], ARCFACE_REFERENCE_PTS[:3])

    aligned = cv2.warpAffine(
        img,
        transform_matrix,
        (112, 112),
        flags=cv2.INTER_LINEAR,
        borderMode=cv2.BORDER_REFLECT_101,
    )
    return aligned


def yaw_ratio(landmarks: np.ndarray) -> float:
    """
    Horizontal head turn from the 5 YuNet landmarks: horizontal offset of the nose tip from the
    eye midpoint, measured in inter-eye distances. ~0 when facing the camera.
    Positive = nose toward image-right, i.e. the subject turning to THEIR left in an unmirrored frame.
    A flat photo rotated in front of the camera keeps this ratio constant (both distances shrink
    together), so it can only change for a real 3D head.
    """
    right_eye, left_eye, nose = landmarks[0], landmarks[1], landmarks[2]
    eye_dist = float(np.hypot(*(left_eye - right_eye)))
    if eye_dist < 1e-3:
        return 0.0
    return float((nose[0] - (right_eye[0] + left_eye[0]) / 2.0) / eye_dist)


def assess_image_quality(img: np.ndarray, min_brightness: float = 40.0, max_brightness: float = 230.0, min_laplacian_var: float = 30.0) -> Tuple[bool, str, dict]:
    """
    Validate quality of an enrollment / recognition face image:
    1. Illumination / Brightness
    2. Blur (Laplacian variance)
    """
    gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
    mean_brightness = float(np.mean(gray))
    laplacian_var = float(cv2.Laplacian(gray, cv2.CV_64F).var())

    metrics = {
        "mean_brightness": round(mean_brightness, 2),
        "laplacian_variance": round(laplacian_var, 2),
    }

    if mean_brightness < min_brightness:
        return False, "Image is too dark. Ensure adequate lighting.", metrics
    if mean_brightness > max_brightness:
        return False, "Image is overexposed. Reduce direct glare.", metrics
    if laplacian_var < min_laplacian_var:
        return False, "Image is blurry. Please hold steady.", metrics

    return True, "Quality acceptable", metrics
