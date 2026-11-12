import copy
import hashlib
import json
import math
import secrets
import time
import uuid
from contextlib import asynccontextmanager

import httpx
from fastapi import Depends, FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy import create_engine, delete, select, update
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from .config import Settings
from .models import Base, LoginSession, Operation, Save, Snapshot, User
from .schemas import Login, Mutation, Payload, RestoreSave, WriteSave


async def exchange_wechat(code: str, settings: Settings) -> tuple[str, str]:
    if settings.allow_dev_login and code.startswith("dev:"):
        if not 1 <= len(code[4:]) <= 80:
            raise HTTPException(400, "invalid development identity")
        return "local-development", "dev-" + hashlib.sha256(code.encode()).hexdigest()
    if not settings.wechat_app_id or not settings.wechat_app_secret:
        raise HTTPException(503, "WeChat credentials are not configured")
    try:
        async with httpx.AsyncClient(timeout=10) as client:
            response = await client.get("https://api.weixin.qq.com/sns/jscode2session", params={
                "appid": settings.wechat_app_id, "secret": settings.wechat_app_secret,
                "js_code": code, "grant_type": "authorization_code",
            })
            response.raise_for_status()
            data = response.json()
    except (httpx.HTTPError, ValueError):
        raise HTTPException(502, "WeChat login service unavailable") from None
    if data.get("errcode") or not isinstance(data.get("openid"), str) or not data["openid"]:
        raise HTTPException(401, "WeChat login rejected; obtain a new code")
    return settings.wechat_app_id, data["openid"]


def create_app(settings=None, *, clock=time.time, exchange=exchange_wechat):
    settings = settings or Settings()
    engine = create_engine(settings.database_url, **(
        {"connect_args": {"check_same_thread": False, "timeout": 20}}
        if settings.database_url.startswith("sqlite") else {"pool_pre_ping": True}
    ))

    @asynccontextmanager
    async def lifespan(app):
        if settings.db_auto_create:
            Base.metadata.create_all(engine)
        yield
        engine.dispose()

    app = FastAPI(title="Lanternfall Save API", version="0.1.0", lifespan=lifespan)
    app.state.engine = engine
    # Only the local browser test harness needs CORS. WeChat wx.request does not.
    if settings.environment == "development":
        app.add_middleware(CORSMiddleware, allow_origins=["http://localhost:8080", "http://127.0.0.1:8080"],
                           allow_methods=["GET", "POST", "PUT"], allow_headers=["Authorization", "Content-Type"])

    @app.middleware("http")
    async def limit_body(request: Request, call_next):
        if request.method in {"POST", "PUT"}:
            from starlette.responses import JSONResponse
            body = bytearray()
            async for chunk in request.stream():
                body.extend(chunk)
                if len(body) > 256 * 1024:
                    return JSONResponse({"detail": "request too large"}, status_code=413)
            request._body = bytes(body)
        return await call_next(request)

    def database():
        with Session(engine) as session:
            yield session

    bearer = HTTPBearer(auto_error=False)

    def current_user(auth: HTTPAuthorizationCredentials | None = Depends(bearer), db: Session = Depends(database)):
        if not auth or auth.scheme.lower() != "bearer":
            raise HTTPException(401, "login required")
        row = db.get(LoginSession, hashlib.sha256(auth.credentials.encode()).hexdigest())
        if not row or row.expires_at <= clock():
            raise HTTPException(401, "session expired")
        return row.user_id

    def envelope(row):
        return {"revision": row.revision, "payload": row.payload,
                "updated_at": row.updated_at, "server_time": clock()}

    def previous(db, user_id, request_id, fingerprint):
        op = db.scalar(select(Operation).where(Operation.user_id == user_id, Operation.request_id == request_id))
        if op:
            if op.request_hash != fingerprint:
                raise HTTPException(409, "request_id reused with different content")
            return op.response
        return None

    def mutate(db, user_id, command, kind):
        body = command.model_dump(mode="json")
        fingerprint = hashlib.sha256((kind + json.dumps(body, sort_keys=True, separators=(",", ":"))).encode()).hexdigest()
        prior = previous(db, user_id, command.request_id, fingerprint)
        if prior is not None:
            return prior
        row = db.get(Save, user_id)
        if row.revision != command.revision:
            raise HTTPException(409, {"code": "save_conflict", "save": envelope(row)})
        now = clock()
        reward = None
        if kind == "write":
            payload = body["payload"]
            settled = now  # online saves refresh the presence baseline
        elif kind == "restore":
            snapshot = db.scalar(select(Snapshot).where(Snapshot.user_id == user_id, Snapshot.revision == command.source_revision))
            if not snapshot:
                raise HTTPException(404, "snapshot no longer available")
            payload = Payload.model_validate(snapshot.payload).model_dump(mode="json", exclude_none=True)
            settled = now
        else:
            payload = copy.deepcopy(row.payload)
            elapsed = max(0, min(14400, now - max(row.updated_at, row.settled_at)))
            reward = {"seconds": elapsed, "silver": 0, "xp": 0, "levels": 0}
            if payload and payload["player"]["run"] and elapsed >= 90:
                player = payload["player"]
                run = player["run"]
                total = max(60, run["time"])
                reward["silver"] = math.floor(player["rate"]["silver"] / total * elapsed * 0.5 + 0.5)
                reward["xp"] = player["rate"]["xp"] / total * elapsed * 0.35
                run["silver"] += reward["silver"]
                run["xp"] += reward["xp"]
                while run["level"] < 500:
                    need = math.floor(26 * 1.4 ** (run["level"] - 1) + 8 * (run["level"] - 1) + 0.5)
                    if run["xp"] < need:
                        break
                    run["xp"] -= need
                    run["level"] += 1
                    reward["levels"] += 1
                player["pendingCards"] = min(500, player.get("pendingCards", 0) + min(3, reward["levels"]))
                # Offline XP is not added to online earning rates: avoids compounding.
                payload = Payload.model_validate(payload).model_dump(mode="json", exclude_none=True)
            settled = now
        values = {"payload": payload, "revision": row.revision + 1,
                  "updated_at": now, "settled_at": settled}
        result = db.execute(update(Save).where(Save.user_id == user_id, Save.revision == command.revision).values(**values))
        if result.rowcount != 1:
            db.rollback()
            prior = previous(db, user_id, command.request_id, fingerprint)
            if prior is not None:
                return prior
            latest = db.get(Save, user_id)
            raise HTTPException(409, {"code": "save_conflict", "save": envelope(latest)})
        output = {"revision": values["revision"], "updated_at": now, "server_time": now}
        if kind != "write":
            output["payload"] = payload
        if reward is not None:
            output["reward"] = reward
        if payload is not None:
            db.add(Snapshot(id=str(uuid.uuid4()), user_id=user_id, revision=values["revision"], payload=payload, created_at=now))
            db.execute(delete(Snapshot).where(Snapshot.user_id == user_id, Snapshot.revision <= values["revision"] - 10))
        # Older replayed commands still fail the monotonic revision check after pruning.
        db.execute(delete(Operation).where(Operation.user_id == user_id, Operation.created_at < now - 7 * 86400))
        db.add(Operation(id=str(uuid.uuid4()), user_id=user_id, request_id=command.request_id,
                         request_hash=fingerprint, response=output, created_at=now))
        try:
            db.commit()
        except IntegrityError:
            db.rollback()
            prior = previous(db, user_id, command.request_id, fingerprint)
            if prior is not None:
                return prior
            raise HTTPException(409, "concurrent save; reload and retry") from None
        return output

    @app.get("/health")
    def health(db: Session = Depends(database)):
        db.execute(select(1))
        return {"status": "ok"}

    @app.post("/api/v1/auth/wechat")
    async def login(command: Login, db: Session = Depends(database)):
        appid, openid = await exchange(command.code, settings)
        user = db.scalar(select(User).where(User.appid == appid, User.openid == openid))
        if not user:
            user = User(id=str(uuid.uuid4()), appid=appid, openid=openid)
            try:
                db.add(user)
                db.flush()
                db.add(Save(user_id=user.id, revision=0, payload=None, updated_at=0, settled_at=clock()))
                db.commit()
            except IntegrityError:
                db.rollback()
                user = db.scalar(select(User).where(User.appid == appid, User.openid == openid))
        token = secrets.token_urlsafe(32)
        expires = clock() + settings.session_ttl_seconds
        db.execute(delete(LoginSession).where(LoginSession.user_id == user.id, LoginSession.expires_at < clock()))
        db.add(LoginSession(token_hash=hashlib.sha256(token.encode()).hexdigest(), user_id=user.id, expires_at=expires))
        db.commit()
        return {"token": token, "user_id": user.id, "expires_at": expires}

    @app.get("/api/v1/save")
    def read_save(user_id: str = Depends(current_user), db: Session = Depends(database)):
        return envelope(db.get(Save, user_id))

    @app.put("/api/v1/save")
    def write_save(command: WriteSave, user_id: str = Depends(current_user), db: Session = Depends(database)):
        return mutate(db, user_id, command, "write")

    @app.post("/api/v1/offline/claim")
    def claim(command: Mutation, user_id: str = Depends(current_user), db: Session = Depends(database)):
        return mutate(db, user_id, command, "claim")

    @app.get("/api/v1/save/history")
    def history(user_id: str = Depends(current_user), db: Session = Depends(database)):
        records = db.scalars(select(Snapshot).where(Snapshot.user_id == user_id).order_by(Snapshot.revision.desc()).limit(10)).all()
        return {"items": [{"revision": s.revision, "created_at": s.created_at,
                           "stage": (s.payload["player"].get("run") or {}).get("stage", 0),
                           "level": (s.payload["player"].get("run") or {}).get("level", 0)} for s in records]}

    @app.post("/api/v1/save/restore")
    def restore(command: RestoreSave, user_id: str = Depends(current_user), db: Session = Depends(database)):
        return mutate(db, user_id, command, "restore")

    return app


app = create_app()
