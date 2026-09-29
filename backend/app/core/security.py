import hashlib
from datetime import datetime, timedelta, timezone

import bcrypt
import jwt
from cryptography.fernet import Fernet
from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.core.db import get_db
from app.models import AuditLog, Role, User

oauth2 = OAuth2PasswordBearer(tokenUrl="/api/auth/login", auto_error=False)

ROLE_RANK = {Role.viewer: 0, Role.field_agent: 1, Role.analyst: 2, Role.admin: 3}


def hash_password(pw: str) -> str:
    return bcrypt.hashpw(pw.encode(), bcrypt.gensalt()).decode()


def verify_password(pw: str, hashed: str) -> bool:
    return bcrypt.checkpw(pw.encode(), hashed.encode())


def create_token(user: User) -> str:
    s = get_settings()
    exp = datetime.now(timezone.utc) + timedelta(minutes=s.jwt_ttl_minutes)
    return jwt.encode({"sub": str(user.id), "role": user.role, "exp": exp}, s.jwt_secret, algorithm="HS256")


def current_user(token: str | None = Depends(oauth2), db: Session = Depends(get_db)) -> User:
    if not token:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Not authenticated")
    try:
        payload = jwt.decode(token, get_settings().jwt_secret, algorithms=["HS256"])
    except jwt.PyJWTError:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid token")
    user = db.get(User, int(payload["sub"]))
    if not user or not user.active:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Inactive user")
    return user


def require(min_role: Role):
    def dep(user: User = Depends(current_user)) -> User:
        if ROLE_RANK[Role(user.role)] < ROLE_RANK[min_role]:
            raise HTTPException(status.HTTP_403_FORBIDDEN, f"Requires {min_role} role")
        return user

    return dep


def audit(db: Session, user: User | None, action: str, entity: str, entity_id=None, **detail) -> None:
    db.add(AuditLog(user_id=user.id if user else None, action=action, entity=entity,
                    entity_id=str(entity_id) if entity_id is not None else None, detail=detail))


# --- Subscriber phone protection (NDPA 2023: minimise + protect) ---

def _fernet() -> Fernet:
    key = get_settings().phone_enc_key
    if not key:
        # Derive a stable dev key from the JWT secret so dev works without setup.
        import base64
        key = base64.urlsafe_b64encode(hashlib.sha256(get_settings().jwt_secret.encode()).digest()).decode()
    return Fernet(key.encode())


def normalize_phone(phone: str) -> str:
    digits = "".join(c for c in phone if c.isdigit())
    if digits.startswith("0") and len(digits) == 11:
        digits = "234" + digits[1:]
    return "+" + digits


def encrypt_phone(phone: str) -> str:
    return _fernet().encrypt(phone.encode()).decode()


def decrypt_phone(token: str) -> str:
    return _fernet().decrypt(token.encode()).decode()


def phone_hash(phone: str) -> str:
    return hashlib.sha256((get_settings().jwt_secret + normalize_phone(phone)).encode()).hexdigest()
