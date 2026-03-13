from datetime import datetime

from pydantic import BaseModel, Field


class StationSearchResponse(BaseModel):
    station_id: str
    brand: str | None
    name: str | None
    address: str
    city: str
    postal_code: str
    fuel_type: str
    price: float = Field(..., examples=[1.689])
    distance_km: float | None = Field(default=None, examples=[2.4])
    updated_at: datetime
