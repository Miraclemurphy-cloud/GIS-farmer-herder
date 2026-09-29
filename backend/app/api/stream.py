"""Server-sent events for the live dashboard feed. EventSource cannot send headers, so the
JWT is passed as ?token=."""
import asyncio

from fastapi import APIRouter, Depends, Query
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session

from app.core.db import get_db
from app.core.events import subscribe
from app.core.security import current_user

router = APIRouter(prefix="/api", tags=["stream"])


@router.get("/stream")
async def stream(token: str = Query(...), db: Session = Depends(get_db)):
    current_user(token, db)  # raises 401 if invalid

    async def gen():
        yield "retry: 5000\n\n"
        events = subscribe()
        while True:
            try:
                msg = await asyncio.wait_for(anext(events), timeout=25)
                yield f"data: {msg}\n\n"
            except asyncio.TimeoutError:
                yield ": keepalive\n\n"

    return StreamingResponse(gen(), media_type="text/event-stream",
                             headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"})
