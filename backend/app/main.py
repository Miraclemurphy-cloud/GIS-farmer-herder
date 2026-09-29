from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api import alerts, analytics, auth, feeds, geo, incidents, stream, uploads
from app.core.config import get_settings

app = FastAPI(title="Benue–Plateau Conflict Monitoring API", version="0.1.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=[o.strip() for o in get_settings().cors_origins.split(",")],
    allow_credentials=True, allow_methods=["*"], allow_headers=["*"],
)
for r in (auth, incidents, uploads, analytics, geo, alerts, feeds, stream):
    app.include_router(r.router)


@app.get("/api/health")
def health():
    return {"ok": True}
