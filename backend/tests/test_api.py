import copy
import json
import os
import subprocess
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import func, select
from sqlalchemy.orm import Session
from sqlalchemy import create_engine
from sqlalchemy.engine import make_url

from app.config import Settings
from app.main import create_app
from app.models import Base, Operation, Snapshot, User
from app.schemas import Payload


@pytest.fixture
def payload():
    root = Path(__file__).resolve().parents[2]
    return json.loads(subprocess.check_output(["node", "wechat-client/tests/fixture.cjs"], cwd=root))


@pytest.fixture
def api(tmp_path):
    now = [100000.0]
    database_url = os.environ.get("TEST_DATABASE_URL", f"sqlite:///{tmp_path}/test.db")
    if os.environ.get("TEST_DATABASE_URL"):
        assert make_url(database_url).database.endswith("_test"), "Tests require a separate *_test database"
        engine = create_engine(database_url)
        Base.metadata.drop_all(engine)
        engine.dispose()
    config = Settings(database_url=database_url, allow_dev_login=True, db_auto_create=True, _env_file=None)
    app = create_app(config, clock=lambda: now[0])
    with TestClient(app) as client:
        yield client, now, app


def login(client, user="alice"):
    response = client.post("/api/v1/auth/wechat", json={"code": "dev:" + user})
    assert response.status_code == 200
    return {"Authorization": "Bearer " + response.json()["token"]}


def write(client, headers, payload, revision=0, request_id="operation-00000001"):
    return client.put("/api/v1/save", headers=headers, json={"request_id": request_id, "revision": revision, "payload": payload})


def test_wechat_identity_and_no_cross_user_reads(api, payload):
    client, _, _ = api
    alice = login(client)
    assert write(client, alice, payload).status_code == 200
    assert client.get("/api/v1/save", headers=login(client)).json()["revision"] == 1
    assert client.get("/api/v1/save", headers=login(client, "bob")).json()["payload"] is None
    assert client.get("/api/v1/save").status_code == 401
    invalid = copy.deepcopy(payload)
    invalid["openid"] = "other"
    assert write(client, alice, invalid, revision=1).status_code == 422


def test_atomic_revision_and_request_replay(api, payload):
    client, _, app = api
    headers = login(client)
    response = write(client, headers, payload)
    assert response.status_code == 200
    assert write(client, headers, payload).json() == response.json()
    changed = copy.deepcopy(payload)
    changed["player"]["embers"] = 20
    assert write(client, headers, changed).status_code == 409
    assert write(client, headers, changed, request_id="operation-00000002").status_code == 409
    assert client.get("/api/v1/save", headers=headers).json()["payload"]["player"]["embers"] == 0
    with Session(app.state.engine) as db:
        assert db.scalar(select(func.count()).select_from(Operation)) == 1
        assert db.scalar(select(func.count()).select_from(Snapshot)) == 1


def test_two_concurrent_writes_only_one_wins(api, payload):
    client, _, _ = api
    headers = login(client)
    with ThreadPoolExecutor(max_workers=2) as pool:
        results = list(pool.map(lambda i: write(client, headers, payload, request_id=f"concurrent-save-{i}"), [1, 2]))
    assert sorted(response.status_code for response in results) == [200, 409]
    assert client.get("/api/v1/save", headers=headers).json()["revision"] == 1


def test_offline_rewards_use_server_clock_cap_and_are_idempotent(api, payload):
    client, now, _ = api
    headers = login(client)
    player = payload["player"]
    player["run"]["time"] = 100
    player["rate"] = {"silver": 100, "xp": 100}
    player["lastSeen"] = 1  # untrusted phone timestamp has no effect
    assert write(client, headers, payload).status_code == 200
    now[0] += 86400
    command = {"request_id": "claim-operation-0001", "revision": 1}
    result = client.post("/api/v1/offline/claim", headers=headers, json=command)
    assert result.status_code == 200
    body = result.json()
    assert body["reward"]["seconds"] == 14400
    assert body["reward"]["silver"] == 7200
    assert body["payload"]["player"]["run"]["silver"] == 7200
    assert body["payload"]["player"]["pendingCards"] == 3
    assert client.post("/api/v1/offline/claim", headers=headers, json=command).json() == body
    result2 = client.post("/api/v1/offline/claim", headers=headers, json={"request_id": "claim-operation-0002", "revision": 2})
    assert result2.json()["reward"]["silver"] == 0
    assert client.post("/api/v1/offline/claim", headers=headers, json={"request_id": "claim-operation-0003", "revision": 1}).status_code == 409


@pytest.mark.parametrize("change", ["unknown_hero", "locked_hero", "bad_card", "bad_item", "unknown_version", "negative", "extra"])
def test_corrupt_saves_rejected(api, payload, change):
    client, _, _ = api
    headers = login(client)
    p = payload["player"]
    if change == "unknown_hero":
        p["run"]["party"][0] = "unknown"
    elif change == "locked_hero":
        p["run"]["party"][0] = "apothecary"
    elif change == "bad_card":
        p["run"]["cards"]["p_dmg"] = 4
    elif change == "bad_item":
        p["run"]["gear"]["warden"] = {"weapon": {"slot": "trinket", "g": 2, "pow": 4, "name": "bad"}}
    elif change == "unknown_version":
        payload["schema_version"] = 2
    elif change == "negative":
        p["run"]["silver"] = -1
    else:
        p["admin"] = True
    assert write(client, headers, payload).status_code == 422


def test_expired_session_and_new_login_keep_save(api, payload):
    client, now, _ = api
    headers = login(client)
    assert write(client, headers, payload).status_code == 200
    now[0] += 604801
    assert client.get("/api/v1/save", headers=headers).status_code == 401
    assert client.get("/api/v1/save", headers=login(client)).json()["revision"] == 1


def test_last_ten_snapshots_and_payload_size_limit(api, payload):
    client, _, app = api
    headers = login(client)
    for i in range(13):
        assert write(client, headers, payload, revision=i, request_id=f"history-operation-{i:04}").status_code == 200
    with Session(app.state.engine) as db:
        assert db.scalar(select(func.count()).select_from(Snapshot)) == 10
    response = client.put("/api/v1/save", headers=headers, content=b"x" * (256 * 1024 + 1))
    assert response.status_code == 413


def test_production_refuses_development_login():
    with pytest.raises(ValueError):
        Settings(environment="production", allow_dev_login=True, _env_file=None)


def test_frontend_schema_matches_backend():
    schema = Path(__file__).resolve().parents[2] / "wechat-client/src/services/save-schema.json"
    assert json.loads(schema.read_text()) == Payload.model_json_schema()


def test_concurrent_first_login_creates_one_identity(api):
    client, _, _ = api
    with ThreadPoolExecutor(max_workers=2) as pool:
        headers = list(pool.map(lambda _: login(client, "new-user"), [1, 2]))
    saves = [client.get("/api/v1/save", headers=h).json() for h in headers]
    assert saves[0]["revision"] == saves[1]["revision"] == 0


def test_no_credentials_does_not_invent_a_wechat_identity(tmp_path):
    config = Settings(database_url=f"sqlite:///{tmp_path}/prod.db", allow_dev_login=False,
                      wechat_app_id="", wechat_app_secret="", _env_file=None)
    with TestClient(create_app(config)) as client:
        assert client.post("/api/v1/auth/wechat", json={"code": "dev:alice"}).status_code == 503


def test_restore_is_scoped_revisioned_and_idempotent(api, payload):
    client, _, _ = api
    headers = login(client)
    assert write(client, headers, payload).status_code == 200
    changed = copy.deepcopy(payload)
    changed["player"]["embers"] = 50
    assert write(client, headers, changed, revision=1, request_id="second-save-operation").status_code == 200
    history = client.get("/api/v1/save/history", headers=headers).json()["items"]
    assert [item["revision"] for item in history] == [2, 1]
    command = {"request_id": "restore-operation-01", "revision": 2, "source_revision": 1}
    response = client.post("/api/v1/save/restore", headers=headers, json=command)
    assert response.status_code == 200
    assert response.json()["revision"] == 3
    assert response.json()["payload"]["player"]["embers"] == 0
    assert client.post("/api/v1/save/restore", headers=headers, json=command).json() == response.json()
    assert client.get("/api/v1/save/history", headers=login(client, "bob")).json()["items"] == []


def test_same_concurrent_command_has_one_effect(api, payload):
    client, _, _ = api
    headers = login(client)
    with ThreadPoolExecutor(max_workers=2) as pool:
        results = list(pool.map(lambda _: write(client, headers, payload), [1, 2]))
    assert [r.status_code for r in results] == [200, 200]
    assert results[0].json() == results[1].json()
    assert client.get("/api/v1/save", headers=headers).json()["revision"] == 1


def test_wechat_identity_is_case_sensitive(api):
    _, _, app = api
    with Session(app.state.engine) as db:
        db.add_all([User(id="case-user-one", appid="case-app", openid="CaseSensitive"),
                    User(id="case-user-two", appid="case-app", openid="casesensitive")])
        db.commit()
        assert db.scalar(select(User).where(User.appid == "case-app", User.openid == "CaseSensitive")).id == "case-user-one"
        assert db.scalar(select(User).where(User.appid == "case-app", User.openid == "casesensitive")).id == "case-user-two"


def test_server_timestamp_keeps_fractional_precision(api, payload):
    client, now, _ = api
    now[0] = 1800000000.123456
    headers = login(client)
    assert write(client, headers, payload).status_code == 200
    assert abs(client.get("/api/v1/save", headers=headers).json()["updated_at"] - now[0]) < 0.00001
