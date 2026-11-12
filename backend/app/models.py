from sqlalchemy import JSON, Double, ForeignKey, Integer, String, UniqueConstraint
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column


class Base(DeclarativeBase):
    pass


class User(Base):
    __tablename__ = "users"
    __table_args__ = (UniqueConstraint("appid", "openid"),)
    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    appid: Mapped[str] = mapped_column(String(128).with_variant(String(128, collation="utf8mb4_bin"), "mysql"))
    openid: Mapped[str] = mapped_column(String(128).with_variant(String(128, collation="utf8mb4_bin"), "mysql"))


class LoginSession(Base):
    __tablename__ = "login_sessions"
    token_hash: Mapped[str] = mapped_column(String(64), primary_key=True)
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id"), index=True)
    expires_at: Mapped[float] = mapped_column(Double)


class Save(Base):
    __tablename__ = "saves"
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id"), primary_key=True)
    revision: Mapped[int] = mapped_column(Integer, default=0)
    payload: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    updated_at: Mapped[float] = mapped_column(Double, default=0)
    settled_at: Mapped[float] = mapped_column(Double, default=0)


class Snapshot(Base):
    __tablename__ = "save_snapshots"
    __table_args__ = (UniqueConstraint("user_id", "revision"),)
    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id"), index=True)
    revision: Mapped[int] = mapped_column(Integer)
    payload: Mapped[dict] = mapped_column(JSON)
    created_at: Mapped[float] = mapped_column(Double)


class Operation(Base):
    __tablename__ = "save_operations"
    __table_args__ = (UniqueConstraint("user_id", "request_id"),)
    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id"), index=True)
    request_id: Mapped[str] = mapped_column(String(64))
    request_hash: Mapped[str] = mapped_column(String(64))
    response: Mapped[dict] = mapped_column(JSON)
    created_at: Mapped[float] = mapped_column(Double)
