import os
from typing import List, Optional, Union
import numpy as np
import onnxruntime as ort

DEFAULT_ARCFACE_PATH = os.path.abspath(
    os.path.join(os.path.dirname(__file__), "..", "..", "..", "models", "w600k_r50.onnx")
)


class FaceEmbedder:
    """
    ArcFace (ResNet-50) ONNX face feature extractor.
    Generates 512-dimensional L2-normalized biometric embeddings.
    """

    def __init__(self, model_path: str = DEFAULT_ARCFACE_PATH):
        self.model_path = model_path
        self._session: Optional[ort.InferenceSession] = None
        self._input_name: Optional[str] = None
        self._output_name: Optional[str] = None
        self._init_session()

    def _init_session(self) -> None:
        if not os.path.exists(self.model_path):
            raise FileNotFoundError(
                f"ArcFace model not found at {self.model_path}. Model download required."
            )
        opts = ort.SessionOptions()
        opts.inter_op_num_threads = 2
        opts.intra_op_num_threads = 2
        opts.graph_optimization_level = ort.GraphOptimizationLevel.ORT_ENABLE_ALL

        self._session = ort.InferenceSession(
            self.model_path,
            sess_options=opts,
            providers=["CPUExecutionProvider"],
        )
        self._input_name = self._session.get_inputs()[0].name
        self._output_name = self._session.get_outputs()[0].name

    def preprocess(self, aligned_bgr_112: np.ndarray) -> np.ndarray:
        """
        Preprocess 112x112 aligned BGR image for InsightFace ArcFace:
        - Convert uint8 to float32
        - Standardize: (pixel - 127.5) / 127.5
        - Transpose from HWC (112, 112, 3) to CHW (3, 112, 112)
        - Add batch dimension -> (1, 3, 112, 112)
        """
        if aligned_bgr_112.shape[:2] != (112, 112):
            import cv2
            aligned_bgr_112 = cv2.resize(aligned_bgr_112, (112, 112), interpolation=cv2.INTER_LINEAR)

        blob = aligned_bgr_112.astype(np.float32)
        blob = (blob - 127.5) / 127.5
        # HWC to CHW
        blob = np.transpose(blob, (2, 0, 1))
        # Add batch dim
        blob = np.expand_dims(blob, axis=0)
        return blob

    def embed(self, aligned_bgr_112: np.ndarray) -> np.ndarray:
        """
        Extract 512-D L2-normalized embedding for a single aligned face.
        Returns: 1D numpy array of shape (512,), float32.
        """
        blob = self.preprocess(aligned_bgr_112)
        raw_output = self._session.run([self._output_name], {self._input_name: blob})[0]
        embedding = raw_output[0]  # shape (512,)

        # Strict L2-normalization for cosine distance
        norm = np.linalg.norm(embedding)
        if norm > 1e-6:
            embedding = embedding / norm
        else:
            embedding = np.zeros_like(embedding)

        return embedding.astype(np.float32)

    def embed_to_list(self, aligned_bgr_112: np.ndarray) -> List[float]:
        """Extract embedding and return as Python float list for DB/pgvector insertion."""
        return [float(x) for x in self.embed(aligned_bgr_112)]
