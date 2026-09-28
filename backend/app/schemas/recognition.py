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
        None,
        description="MARKED | ALREADY_MARKED | NOT_IN_CLASS | CHALLENGE | CHALLENGE_FAILED | NOT_APPLICABLE",
    )
    attendance_status: Optional[str] = Field(None, description="present | late, once marked")
    challenge: Optional[str] = Field(None, description="turn_left | turn_right while a head-turn check is pending")
    message: Optional[str] = None
    bbox: Optional[List[int]] = Field(None, description="[x, y, w, h]")
