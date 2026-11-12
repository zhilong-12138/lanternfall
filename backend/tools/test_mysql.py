"""Run the API suite against a separate local Docker MySQL test database."""
import os
import subprocess
import sys
from pathlib import Path
from sqlalchemy.engine import make_url
from app.config import Settings

root = Path(__file__).resolve().parents[1]
subprocess.run([
    "docker", "compose", "exec", "-T", "mysql", "sh", "-c",
    'MYSQL_PWD="$MYSQL_ROOT_PASSWORD" mysql -uroot -e "CREATE DATABASE IF NOT EXISTS lanternfall_test CHARACTER SET utf8mb4 COLLATE utf8mb4_bin; '
    "GRANT ALL PRIVILEGES ON lanternfall_test.* TO 'lanternfall'@'%';\"",
], cwd=root, check=True)
url = make_url(Settings().database_url).set(database="lanternfall_test")
env = dict(os.environ, TEST_DATABASE_URL=url.render_as_string(hide_password=False))
raise SystemExit(subprocess.call([sys.executable, "-m", "pytest", "-q"], cwd=root, env=env))
