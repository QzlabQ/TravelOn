#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "$0")/../.." && pwd -P)"
cd "$repo_root"
rendered="$(mktemp)"
trap 'rm -f "$rendered"' EXIT

export DEPLOY_TAG=sha-1234567
export POSTGRES_HOST_PORT=127.0.0.1:55432
export RABBITMQ_HOST_PORT=127.0.0.1:55672
export RABBITMQ_MANAGEMENT_HOST_PORT=127.0.0.1:55673
export MONGO_HOST_PORT=127.0.0.1:57017
export DISCOVERY_HOST_PORT=127.0.0.1:58010
export GATEWAY_HOST_PORT=127.0.0.1:58082
export FRONT_HOST_PORT=80

docker compose \
  -f travel-api/docker-compose.yml \
  -f ops/cd/docker-compose.aliyun.yml \
  config --format json >"$rendered"

python3 - "$rendered" <<'PY'
import json
import sys

with open(sys.argv[1], encoding="utf-8") as config_file:
    services = json.load(config_file)["services"]

expected = {
    "postgres", "rabbitmq", "mongo", "discovery", "gateway",
    "travel-core-migration", "travel-core", "order", "user", "community",
    "ai-arrange-agent", "ai-arrange", "front",
}
assert set(services) == expected

for name, service in services.items():
    expected_restart = "no" if name == "travel-core-migration" else "unless-stopped"
    assert service.get("restart") == expected_restart, name
    for port in service.get("ports", []):
        if name == "front":
            assert int(port["target"]) == 80
            assert str(port["published"]) == "80"
        else:
            assert port.get("host_ip") == "127.0.0.1", name

expected_images = {
    name: f"travelon-{name}:sha-1234567"
    for name in expected - {"postgres", "rabbitmq", "mongo", "travel-core-migration", "front"}
}
expected_images["front"] = "travelon-ui:sha-1234567"
for name, image in expected_images.items():
    assert services[name]["image"] == image, name
PY

bash -n ops/runner/travelon-deploy-compose
grep -Fq "workflow_run.event == 'push'" .github/workflows/cd-aliyun.yml
grep -Fq "workflow_run.head_branch == 'main'" .github/workflows/cd-aliyun.yml
grep -Fxq \
  'travelon-runner ALL=(root) NOPASSWD: /usr/local/sbin/travelon-deploy-compose' \
  ops/runner/sudoers-aliyun

if grep -Rqs '^FROM jelastic/maven:' travel-api --include='Dockerfile*'; then
  echo "deprecated jelastic Maven image is still referenced" >&2
  exit 1
fi

echo "Aliyun Compose CD checks passed"
