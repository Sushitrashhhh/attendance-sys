import numpy as np
import cv2
import pytest

from app.cv.detector import FaceDetector, DEFAULT_YUNET_PATH
from app.cv.embedder import FaceEmbedder, DEFAULT_ARCFACE_PATH
from app.cv.liveness import LivenessDetector
from app.cv.preprocessing import (
    align_face_112x112,
    assess_image_quality,
    ARCFACE_REFERENCE_PTS,
)


def test_face_detector_init():
    detector = FaceDetector(model_path=DEFAULT_YUNET_PATH)
    assert detector is not None
    blank = np.zeros((320, 320, 3), dtype=np.uint8)
    faces = detector.detect(blank)
    assert len(faces) == 0


def test_face_embedder():
    embedder = FaceEmbedder(model_path=DEFAULT_ARCFACE_PATH)
    dummy_face = np.random.randint(50, 200, (112, 112, 3), dtype=np.uint8)
    embedding = embedder.embed(dummy_face)
    assert embedding.shape == (512,)
    # Norm must be 1.0 within floating point precision
    assert np.isclose(np.linalg.norm(embedding), 1.0, atol=1e-4)


def test_face_alignment():
    dummy_img = np.zeros((200, 200, 3), dtype=np.uint8)
    dummy_landmarks = np.array([
        [70, 70],
        [130, 70],
        [100, 100],
        [80, 140],
        [120, 140],
    ], dtype=np.float32)
    aligned = align_face_112x112(dummy_img, dummy_landmarks)
    assert aligned.shape == (112, 112, 3)


def test_image_quality_check():
    dark_img = np.zeros((100, 100, 3), dtype=np.uint8)
    ok, msg, metrics = assess_image_quality(dark_img)
    assert ok is False
    assert "too dark" in msg.lower()

    # Sharp textured image
    sharp_img = np.random.randint(60, 180, (100, 100, 3), dtype=np.uint8)
    ok, msg, metrics = assess_image_quality(sharp_img)
    assert metrics["mean_brightness"] > 40


def test_liveness_detector_spoof_detection():
    detector = LivenessDetector(threshold=0.70)
    # A tiny or completely blank image should fail liveness check
    blank = np.zeros((40, 40, 3), dtype=np.uint8)
    res = detector.verify_liveness(blank)
    assert res.is_live is False
    assert res.score < 0.70
