from datetime import datetime
from typing import List, Optional
from pydantic import BaseModel, Field, ConfigDict, field_validator


class StudentBase(BaseModel):
    name: str = Field(..., min_length=2, max_length=120, description="Full name of student")
    roll_number: str = Field(..., min_length=1, max_length=50, description="Unique institutional roll number")
    branch: str = Field(..., min_length=2, max_length=100, description="Academic department/branch")
    semester: int = Field(..., ge=1, le=12, description="Current academic semester (1-12)")


class StudentCreate(StudentBase):
    # Optional precomputed embedding for direct vector insertion if generated client-side/test
    embedding: Optional[List[float]] = Field(
        default=None,
        description="512-dimensional ArcFace embedding vector (optional if registering with images)",
    )

    @field_validator("embedding")
    @classmethod
    def validate_embedding_dim(cls, v: Optional[List[float]]) -> Optional[List[float]]:
        if v is not None and len(v) != 512:
            raise ValueError(f"Embedding must be exactly 512 dimensions, received {len(v)}")
        return v


class StudentRead(StudentBase):
    model_config = ConfigDict(from_attributes=True)

    id: int
    active: bool
    created_at: datetime
    updated_at: datetime

    # Note: Biometric embedding is strictly omitted from StudentRead for privacy & security


class StudentListResponse(BaseModel):
    total: int
    items: List[StudentRead]
