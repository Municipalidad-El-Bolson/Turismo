from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    mongodb_uri: str = "mongodb://localhost:27017"
    mongodb_db: str = "turismo"
    allowed_origins: str = "http://localhost:3000"
    whatsapp_access_token: str = ""
    whatsapp_phone_number_id: str = ""
    whatsapp_template_name: str = "recordatorio_carga"
    whatsapp_allowed_template_names: str = "recordatorio_carga,carga_incompleta,aviso_administrativo"
    whatsapp_template_language: str = "es_AR"
    whatsapp_api_version: str = "v20.0"
    whatsapp_utility_message_cost_ars: float = 37.68

    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    @property
    def cors_origins(self) -> list[str]:
        return [origin.strip() for origin in self.allowed_origins.split(",") if origin.strip()]

    @property
    def allowed_whatsapp_templates(self) -> set[str]:
        return {
            template.strip()
            for template in self.whatsapp_allowed_template_names.split(",")
            if template.strip()
        }


settings = Settings()
