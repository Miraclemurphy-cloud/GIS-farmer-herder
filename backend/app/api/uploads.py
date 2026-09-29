from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.db import get_db
from app.core.events import publish
from app.core.security import audit, require
from app.models import IncidentSource, Role, Upload, User
from app.services.incidents import Located, create_incident
from app.services.uploads import parse_date, read_records, validate

router = APIRouter(prefix="/api/uploads", tags=["uploads"])
MAX_BYTES = 5 * 1024 * 1024


class CommitIn(BaseModel):
    include_duplicates: bool = False


def summary(u: Upload, with_rows: bool = False) -> dict:
    d = {"id": u.id, "filename": u.filename, "format": u.fmt, "rows_total": u.rows_total,
         "rows_valid": u.rows_valid, "rows_committed": u.rows_committed, "committed": u.committed,
         "created_at": u.created_at,
         "duplicates": sum(1 for r in u.preview if r.get("duplicate_of"))}
    if with_rows:
        d["rows"] = u.preview
        d["errors"] = u.errors
    return d


@router.get("")
def list_uploads(db: Session = Depends(get_db), _: User = Depends(require(Role.field_agent))):
    return [summary(u) for u in db.scalars(select(Upload).order_by(Upload.id.desc()).limit(50))]


@router.post("", status_code=201)
async def upload(file: UploadFile = File(...), db: Session = Depends(get_db),
                 user: User = Depends(require(Role.field_agent))):
    content = await file.read()
    if len(content) > MAX_BYTES:
        raise HTTPException(413, "File too large (max 5 MB)")
    try:
        fmt, records = read_records(file.filename or "upload", content)
        rows, errors = validate(db, records)
    except Exception as e:  # malformed CSV/JSON/XML → user-facing message
        raise HTTPException(422, f"Could not read file: {e}")
    u = Upload(filename=file.filename or "upload", fmt=fmt, rows_total=len(rows),
               rows_valid=sum(r["valid"] for r in rows), errors=errors, preview=rows, created_by=user.id)
    db.add(u)
    db.flush()
    audit(db, user, "upload", "upload", u.id, rows=len(rows))
    db.commit()
    return summary(u, with_rows=True)


@router.get("/{upload_id}")
def get_upload(upload_id: int, db: Session = Depends(get_db), _: User = Depends(require(Role.field_agent))):
    u = db.get(Upload, upload_id)
    if not u:
        raise HTTPException(404)
    return summary(u, with_rows=True)


@router.post("/{upload_id}/commit")
def commit(upload_id: int, body: CommitIn, db: Session = Depends(get_db),
           user: User = Depends(require(Role.field_agent))):
    u = db.get(Upload, upload_id)
    if not u:
        raise HTTPException(404)
    if u.committed:
        raise HTTPException(409, "Upload already committed")
    n = 0
    for r in u.preview:
        if not r["valid"] or (r.get("duplicate_of") and not body.include_duplicates):
            continue
        create_incident(
            db, lat=r["lat"], lon=r["lon"], occurred_at=parse_date(r["occurred_at"]), user=user, emit=False,
            located=Located(r["state"], r["lga_id"], r["lga"]), type=r["type"], cause=r.get("cause"),
            fatalities=r["fatalities"], injured=r["injured"], displaced=r["displaced"],
            location_name=r.get("location_name") or "", notes=r.get("notes") or "",
            source=IncidentSource.upload, upload_id=u.id,
        )
        n += 1
    u.committed, u.rows_committed = True, n
    audit(db, user, "commit", "upload", u.id, rows=n)
    db.commit()
    publish("upload_committed", {"upload_id": u.id, "rows": n})
    return summary(u)
