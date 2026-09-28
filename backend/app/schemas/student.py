from datetime import datetime
from typing import List, Optional
from pydantic import BaseModel, Field, ConfigDict


class StudentBase(BaseModel):
    name: str = Field(..., min_length=2, max_length=120, description="Full name of student")
    roll_number: str = Field(..., min_length=1, max_length=50, description="Unique institutional roll number")
    branch: str = Field(..., min_length=2, max_length=100, description="Academic department/branch")
    semester: int = Field(..., ge=1, le=12, description="Current academic semester (1-12)")


class StudentUpdate(BaseModel):
    name: Optional[str] = Field(None, min_length=2, max_length=120)
    roll_number: Optional[str] = Field(None, min_length=1, max_length=50)
    branch: Optional[str] = Field(None, min_length=2, max_length=100)
    semester: Optional[int] = Field(None, ge=1, le=12)


class StudentRead(StudentBase):
    model_config = ConfigDict(from_attributes=True)

    id: int
    active: bool
    learned_samples: int = 0  # extra face references learned from live check-ins
    created_at: datetime
    updated_at: datetime

    # Note: Biometric embedding is strictly omitted from StudentRead for privacy & security


class StudentListResponse(BaseModel):
    total: int
    items: List[StudentRead]
