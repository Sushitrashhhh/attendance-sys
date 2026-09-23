"""
Utility script to download pretrained ONNX models for face detection (YuNet)
and biometric feature extraction (ArcFace ResNet-50).
"""

import os
import sys
import urllib.request

MODELS_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "models"))

MODEL_SOURCES = {
    "face_detection_yunet_2023mar.onnx": {
        "url": "https://github.com/opencv/opencv_zoo/raw/main/models/face_detection_yunet/face_detection_yunet_2023mar.onnx",
        "description": "YuNet Face Detector (OpenCV Zoo)",
        "size_mb": 0.23,
    },
    "w600k_r50.onnx": {
        "url": "https://huggingface.co/public-data/insightface/resolve/main/models/buffalo_l/w600k_r50.onnx",
        "description": "ArcFace ResNet-50 512-D Feature Extractor (InsightFace Buffalo_L)",
        "size_mb": 166.3,
    },
}


def download_progress(count, block_size, total_size):
    percent = int(count * block_size * 100 / total_size) if total_size > 0 else 0
    downloaded_mb = (count * block_size) / (1024 * 1024)
    total_mb = total_size / (1024 * 1024) if total_size > 0 else 0
    sys.stdout.write(f"\rDownloading... {percent}% ({downloaded_mb:.1f}MB / {total_mb:.1f}MB)")
    sys.stdout.flush()


def download_models():
    os.makedirs(MODELS_DIR, exist_ok=True)
    print(f"Ensuring model weights in: {MODELS_DIR}")

    for filename, info in MODEL_SOURCES.items():
        target_path = os.path.join(MODELS_DIR, filename)
        if os.path.exists(target_path):
            size_mb = os.path.getsize(target_path) / (1024 * 1024)
            print(f"[OK] {filename} already exists ({size_mb:.1f}MB) - skipping.")
            continue

        print(f"\n[FETCH] Downloading {info['description']} ({info['size_mb']}MB)...")
        print(f"URL: {info['url']}")
        try:
            urllib.request.urlretrieve(info["url"], target_path, reporthook=download_progress)
            print(f"\n[DONE] Saved to {target_path}")
        except Exception as e:
            print(f"\n[ERROR] Failed to download {filename}: {e}")
            print(f"Please manually download the model file and place it at:\n  {target_path}")


if __name__ == "__main__":
    download_models()
