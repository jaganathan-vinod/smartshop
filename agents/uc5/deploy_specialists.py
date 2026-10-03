import json
import os
import sys
from pathlib import Path

import vertexai
from vertexai import agent_engines

ROOT = Path(__file__).resolve().parent
SRC = ROOT / "src"
sys.path.insert(0, str(SRC))

from smartshop.serve import (  # noqa: E402
    delivery_a2a,
    insights_a2a,
    inventory_a2a,
    marketing_a2a,
    standards_a2a,
)

PROJECT = "project-fd286af4-b340-4967-86b"
LOCATION = "us-central1"
BUCKET = "gs://smartshop-marketing"

SPECIALISTS = (
    ("delivery", delivery_a2a, ("MAPS_API_KEY",)),
    ("insights", insights_a2a, ()),
    ("inventory", inventory_a2a, ()),
    ("standards", standards_a2a, ("DRIVE_FOLDER_ID",)),
    ("marketing", marketing_a2a, ("MARKETING_GCS_BUCKET",)),
)


def _env_file() -> dict[str, str]:
    values: dict[str, str] = {}
    for line in (ROOT / ".env").read_text().splitlines():
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        if value.strip():
            values[key] = value.strip()
    return values


def _specialist_env(source: dict[str, str], keys: tuple[str, ...]) -> dict[str, str]:
    env = {"AGENT_MODEL": source.get("AGENT_MODEL", "gemini-2.5-flash")}
    for key in keys:
        if key not in source:
            raise SystemExit(f"missing {key} in agents/uc5/.env")
        env[key] = source[key]
    return env


def main() -> None:
    selected = set(sys.argv[1:])
    source = _env_file()
    # Package folders must be tar members named smartshop, delivery, and so on,
    # so the engine can import them.
    os.chdir(SRC)
    vertexai.init(project=PROJECT, location=LOCATION, staging_bucket=BUCKET)
    engines: dict[str, str] = {}
    for name, factory, keys in SPECIALISTS:
        if selected and name not in selected:
            continue
        remote = agent_engines.create(
            agent_engine=factory(),
            requirements=str(ROOT / "requirements.txt"),
            extra_packages=[
                "smartshop",
                "delivery",
                "insights",
                "inventory",
                "standards",
                "marketing",
            ],
            display_name=f"SmartShop {name}",
            description=f"SmartShop {name} specialist, called over A2A.",
            env_vars=_specialist_env(source, keys),
            gcs_dir_name=f"smartshop-uc5-{name}",
        )
        engine_id = remote.resource_name.rsplit("/", 1)[-1]
        engines[name] = engine_id
        print(f"{name} {remote.resource_name}", flush=True)
        (ROOT / f"engine-{name}.json").write_text(json.dumps({name: engine_id}) + "\n")


if __name__ == "__main__":
    main()
