from typing import Optional, Dict, Any
from pydantic import BaseModel, Field


class HealthResponse(BaseModel):
    status: str = Field(..., description="Overall service status (healthy, degraded, error)")
    database: str = Field(..., description="Database connectivity status (connected, disconnected, unconfigured)")
    version: str = Field("1.0.0", description="API version")
    environment: str = Field(..., description="Application environment")
    details: Optional[Dict[str, Any]] = Field(default=None, description="Optional diagnostic details")
