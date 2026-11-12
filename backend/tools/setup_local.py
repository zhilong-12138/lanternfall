"""Create local MySQL credentials without committing passwords or overwriting config."""
import secrets
from pathlib import Path

target = Path(__file__).resolve().parents[1] / ".env"
if target.exists():
    print("Existing backend/.env preserved.")
else:
    password, root_password = secrets.token_hex(24), secrets.token_hex(24)
    target.write_text(
        "ENVIRONMENT=development\nMYSQL_DATABASE=lanternfall\nMYSQL_USER=lanternfall\nMYSQL_PORT=33306\n"
        f"MYSQL_PASSWORD={password}\nMYSQL_ROOT_PASSWORD={root_password}\n"
        f"DATABASE_URL=mysql+pymysql://lanternfall:{password}@127.0.0.1:33306/lanternfall?charset=utf8mb4\n"
        "WECHAT_APP_ID=\nWECHAT_APP_SECRET=\nALLOW_DEV_LOGIN=false\nSESSION_TTL_SECONDS=604800\nDB_AUTO_CREATE=false\n"
    )
    target.chmod(0o600)
    print("Created backend/.env with random MySQL credentials (file mode 0600).")
