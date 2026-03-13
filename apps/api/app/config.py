from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8")

    app_name: str = "Fuel Finder API"
    database_url: str = (
        "postgresql+psycopg://postgres:postgres@localhost:5432/fuel_finder"
    )
    fuel_data_url: str = (
        "https://data.economie.gouv.fr/api/explore/v2.1/catalog/datasets/"
        "prix-des-carburants-en-france-flux-instantane-v2/exports/json"
    )
    default_search_radius_km: int = 10
    default_search_limit: int = 50
    fuel_cache_ttl_seconds: int = 900
    cors_origins: str = "http://127.0.0.1:5173,http://localhost:5173"

    @property
    def cors_origin_list(self) -> list[str]:
        return [origin.strip() for origin in self.cors_origins.split(",") if origin.strip()]

    @property
    def cors_origin_regex(self) -> str:
        return r"https?://(localhost|127\.0\.0\.1)(:\d+)?$"


settings = Settings()
