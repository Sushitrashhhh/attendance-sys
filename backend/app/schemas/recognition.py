from typing import Optional, List, Dict, Any
from pydantic import BaseModel, Field


class RecognitionStudentInfo(BaseModel):
    id: int
    name: str
    roll_number: str
    branch: Optional[str] = None
    semester: Optional[int] = None


class RecognitionResult(BaseModel):
    status: str = Field(
        ...,
        description="MATCH | UNKNOWN | NO_FACE | MULTIPLE_FACES | LIVENESS_FAILED | ERROR",
    )
    student: Optional[RecognitionStudentInfo] = None
    confidence: float = Field(0.0, description="Cosine similarity score [0, 1]")
    liveness_score: float = Field(0.0, description="Liveness anti-spoofing score [0, 1]")
    attendance: Optional[str] = Field(
        None, description="MARKED | ALREADY_MARKED | NOT_APPLICABLE"
    )
    message: Optional[str] = None
    bbox: Optional[List[int]] = Field(None, description="[x, y, w, h]")


class LiveFrameRecognitionResult(BaseModel):
    faces: List[RecognitionResult] = []
    fps: Optional[float] = None
