from fastapi import APIRouter, Depends, HTTPException
from fastapi.security import OAuth2PasswordRequestForm
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.db import get_db
from app.core.security import audit, create_token, current_user, hash_password, require, verify_password
from app.models import Role, User

router = APIRouter(prefix="/api/auth", tags=["auth"])


class UserOut(BaseModel):
    id: int
    email: str
    name: str
    role: str
    active: bool

    model_config = {"from_attributes": True}


class UserIn(BaseModel):
    email: str
    name: str = ""
    password: str
    role: Role = Role.viewer


@router.post("/login")
def login(form: OAuth2PasswordRequestForm = Depends(), db: Session = Depends(get_db)):
    user = db.scalar(select(User).where(User.email == form.username.lower()))
    if not user or not user.active or not verify_password(form.password, user.password_hash):
        raise HTTPException(401, "Incorrect email or password")
    audit(db, user, "login", "user", user.id)
    db.commit()
    return {"access_token": create_token(user), "token_type": "bearer", "user": UserOut.model_validate(user)}


@router.get("/me", response_model=UserOut)
def me(user: User = Depends(current_user)):
    return user


@router.get("/users", response_model=list[UserOut])
def list_users(db: Session = Depends(get_db), _=Depends(require(Role.admin))):
    return db.scalars(select(User).order_by(User.id)).all()


@router.post("/users", response_model=UserOut)
def create_user(body: UserIn, db: Session = Depends(get_db), admin: User = Depends(require(Role.admin))):
    if db.scalar(select(User).where(User.email == body.email.lower())):
        raise HTTPException(409, "Email already registered")
    u = User(email=body.email.lower(), name=body.name, password_hash=hash_password(body.password), role=body.role)
    db.add(u)
    db.flush()
    audit(db, admin, "create", "user", u.id, role=body.role)
    db.commit()
    return u
