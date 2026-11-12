from pydantic import model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")
    environment: str = "development"
    database_url: str = "mysql+pymysql://lanternfall@127.0.0.1:33306/lanternfall?charset=utf8mb4"
    wechat_app_id: str = ""
    wechat_app_secret: str = ""
    allow_dev_login: bool = False
    session_ttl_seconds: int = 604800
    db_auto_create: bool | None = None

    @model_validator(mode="after")
    def validate_production(self):
        if self.session_ttl_seconds < 60:
            raise ValueError("session TTL must be at least 60 seconds")
        if self.environment == "production":
            if self.allow_dev_login:
                raise ValueError("development login is forbidden in production")
            if not self.wechat_app_id or not self.wechat_app_secret:
                raise ValueError("production requires WeChat credentials")
        if self.db_auto_create is None:
            self.db_auto_create = self.environment != "production"
        return self
