from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    mongodb_uri: str = "mongodb://localhost:27017"
    mongodb_db: str = "turismo"
    allowed_origins: str = "http://localhost:3000"
    whatsapp_provider: str = "console"
    whatsapp_access_token: str = ""
    whatsapp_phone_number_id: str = ""
    whatsapp_graph_version: str = "v23.0"

    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8")

    @property
    def cors_origins(self) -> list[str]:
        return [origin.strip() for origin in self.allowed_origins.split(",") if origin.strip()]


settings = Settings()
