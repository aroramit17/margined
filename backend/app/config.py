from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    # Empty defaults let the API boot before Supabase is configured; every
    # DB-touching route fails soft (get_db raises, handlers catch).
    supabase_url: str = ""
    supabase_service_role_key: str = ""
    supabase_anon_key: str = ""

    stripe_secret_key: str = ""
    stripe_webhook_secret: str = ""
    stripe_billing_webhook_secret: str = ""
    stripe_client_id: str = ""
    stripe_price_starter: str = ""
    stripe_price_growth: str = ""

    frontend_url: str = "https://trymargined.vercel.app"

    resend_api_key: str = ""

    cors_origins: str = "http://localhost:5173,https://app.trymargined.com"

    @property
    def cors_origins_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",")]


settings = Settings()
