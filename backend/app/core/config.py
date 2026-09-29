from functools import lru_cache
from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict

ROOT = Path(__file__).resolve().parents[3]


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=ROOT / ".env", env_file_encoding="utf-8", extra="ignore")

    database_url: str = "postgresql+psycopg://gis:gis@localhost:5433/gis"
    redis_url: str = "redis://localhost:6380/0"
    jwt_secret: str = "change-me"
    jwt_ttl_minutes: int = 60 * 12
    phone_enc_key: str = ""
    admin_email: str = "admin@example.org"
    admin_password: str = "change-me-too"
    cors_origins: str = "http://localhost:3000"

    acled_email: str = ""
    acled_password: str = ""
    firms_map_key: str = ""

    sms_provider: str = "console"
    at_username: str = "sandbox"
    at_api_key: str = ""
    at_sender_id: str = ""
    # Shared secret in the inbound-SMS callback URL: /api/sms/inbound?token=...
    sms_webhook_token: str = ""

    # Calibrated 2-week probability for a ~36 km² cell; the base rate is ~0.5%, so 0.05 ≈ 10× average risk.
    risk_alert_threshold: float = 0.05
    incident_alert_radius_km: float = 15.0
    sms_rate_per_minute: int = 60

    data_dir: Path = ROOT / "data"
    models_dir: Path = ROOT / "models"


@lru_cache
def get_settings() -> Settings:
    return Settings()
