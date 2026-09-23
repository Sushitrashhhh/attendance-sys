from dataclasses import dataclass
from typing import Dict, Any, Optional
import cv2
import numpy as np


@dataclass
class LivenessResult:
    is_live: bool
    score: float
    reason: str
    metrics: Dict[str, Any]


class LivenessDetector:
    """
    Practical MVP-level Anti-Spoofing and Liveness Detection Engine.
    
    LIMITATION NOTICE:
    This engine utilizes multi-factor heuristic and statistical texture analysis
    (frequency distribution, YCrCb skin chrominance clustering, and reflectance variance)
    designed to catch typical presentation attacks (printed photographs and standard screen replay).
    It is not a substitute for certified ISO/IEC 30107-3 deep neural networks (e.g. MiniFASNet),
    but is structured behind a modular interface allowing seamless drop-in upgrades.
    """

    def __init__(self, threshold: float = 0.70):
        self.threshold = threshold

    def verify_liveness(
        self,
        face_crop: np.ndarray,
        landmarks: Optional[np.ndarray] = None,
    ) -> LivenessResult:
        """
        Evaluate presentation attack signals on an aligned or cropped face.
        Returns LivenessResult with is_live boolean, normalized score [0, 1], and explanation.
        """
        if face_crop is None or face_crop.size == 0:
            return LivenessResult(
                is_live=False,
                score=0.0,
                reason="Invalid or empty face crop for liveness verification.",
                metrics={},
            )

        h, w = face_crop.shape[:2]
        if h < 30 or w < 30:
            return LivenessResult(
                is_live=False,
                score=0.2,
                reason="Face resolution too small for reliable liveness verification.",
                metrics={"height": h, "width": w},
            )

        # 1. Texture & High-Frequency Analysis (Blur / Moiré detection)
        gray = cv2.cvtColor(face_crop, cv2.COLOR_BGR2GRAY)
        laplacian_var = float(cv2.Laplacian(gray, cv2.CV_64F).var())

        # Score component 1: Texture sharpness.
        # JPEG-compressed webcam frames at quality 0.85 typically produce laplacian_var 50-250
        # for real live faces. The baseline is lowered accordingly.
        if laplacian_var < 20.0:
            texture_score = max(0.1, laplacian_var / 20.0 * 0.3)
        elif laplacian_var > 1500.0:
            # Possible moiré pattern or harsh digital screen grain
            texture_score = max(0.25, 1.0 - (laplacian_var - 1500.0) / 2500.0)
        else:
            # Soft sigmoid-like ramp: reaches 0.8 at laplacian_var=300, 1.0 at 600+
            texture_score = min(1.0, 0.45 + (min(laplacian_var, 600.0) / 600.0) * 0.55)

        # 2. Skin Chrominance Clustering (YCrCb analysis)
        # Real human skin exhibits a well-defined ellipsoid in Cr-Cb space.
        # Broadened ranges (Cr: 115-180, Cb: 65-135) cover darker/South-Asian skin tones
        # in addition to the standard fair-skin window.
        ycrcb = cv2.cvtColor(face_crop, cv2.COLOR_BGR2YCrCb)
        _, cr, cb = cv2.split(ycrcb)

        # Broad skin mask: covers fair to dark skin tones
        skin_mask = (cr >= 115) & (cr <= 180) & (cb >= 65) & (cb <= 135)
        skin_pixel_ratio = float(np.count_nonzero(skin_mask)) / float(face_crop.shape[0] * face_crop.shape[1])

        # Digital displays and printed paper shift chromaticity outside natural skin gamut.
        # Target ratio ~0.35 for a face-cropped region.
        chroma_score = min(1.0, skin_pixel_ratio / 0.35) if skin_pixel_ratio > 0.10 else max(0.1, skin_pixel_ratio * 3.0)

        # 3. Dynamic Range / Illumination Gradient
        # Real 3D human faces have subtle luminance gradients across the nose bridge and cheekbones.
        # 2D prints under flat ambient light exhibit lower variance.
        y_channel = ycrcb[:, :, 0]
        y_std = float(np.std(y_channel))
        # y_std on real webcam faces typically ranges from 18-60; base at 25
        gradient_score = min(1.0, max(0.25, y_std / 28.0))

        # 4. Composite Liveness Score (Weighted fusion)
        composite_score = (
            0.40 * texture_score +
            0.35 * chroma_score +
            0.25 * gradient_score
        )
        composite_score = round(float(np.clip(composite_score, 0.0, 1.0)), 4)

        metrics = {
            "laplacian_variance": round(laplacian_var, 2),
            "texture_score": round(texture_score, 4),
            "skin_chrominance_ratio": round(skin_pixel_ratio, 4),
            "chroma_score": round(chroma_score, 4),
            "luminance_std": round(y_std, 2),
            "gradient_score": round(gradient_score, 4),
            "composite_score": composite_score,
            "threshold": self.threshold,
        }

        # Decision rule against configured threshold
        if composite_score >= self.threshold:
            return LivenessResult(
                is_live=True,
                score=composite_score,
                reason="Live subject verified successfully.",
                metrics=metrics,
            )
        else:
            if texture_score < 0.4:
                reason = "Potential spoof: abnormal surface texture or blur detected."
            elif chroma_score < 0.4:
                reason = "Potential spoof: unnatural chromatic reflectance (possible screen or print)."
            else:
                reason = "Liveness confidence below required security threshold."

            return LivenessResult(
                is_live=False,
                score=composite_score,
                reason=reason,
                metrics=metrics,
            )
