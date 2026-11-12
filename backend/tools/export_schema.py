"""Run from backend after changing app.schemas, then commit the generated schema."""
import json
from pathlib import Path
from app.schemas import Payload

target = Path(__file__).resolve().parents[2] / "wechat-client/src/services/save-schema.json"
target.write_text(json.dumps(Payload.model_json_schema(), ensure_ascii=False, indent=2) + "\n")
print(target)
