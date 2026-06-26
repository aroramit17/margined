from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.routes import ingest, projects, customers, features, summary, calculator, alerts, stripe_routes


@asynccontextmanager
async def lifespan(app: FastAPI):
    yield


app = FastAPI(
    title="Margined API",
    description="LLM unit economics for AI SaaS founders",
    version="0.1.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # tightened in production via env var
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Public — SDK-facing
app.include_router(ingest.router, prefix="/ingest", tags=["ingest"])

# Private — dashboard
app.include_router(projects.router, prefix="/projects", tags=["projects"])
app.include_router(customers.router, prefix="/projects", tags=["customers"])
app.include_router(features.router, prefix="/projects", tags=["features"])
app.include_router(summary.router, prefix="/projects", tags=["summary"])
app.include_router(calculator.router, prefix="/projects", tags=["calculator"])
app.include_router(alerts.router, prefix="/projects", tags=["alerts"])
app.include_router(stripe_routes.router, prefix="/stripe", tags=["stripe"])


@app.get("/health")
def health():
    return {"status": "ok"}
