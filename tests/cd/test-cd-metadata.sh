#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "$0")/../.." && pwd -P)"
cd "$repo_root"
rendered="$(mktemp)"
expected_images="$(mktemp)"
actual_images="$(mktemp)"
trap 'rm -f "$rendered" "$expected_images" "$actual_images"' EXIT

kubectl kustomize k8s/base >"$rendered"

for label in app.kubernetes.io/part-of:\ travelon app.kubernetes.io/managed-by:\ travelon-cd; do
  grep -Fq "$label" "$rendered" || {
    echo "missing CD lifecycle label: $label" >&2
    exit 1
  }
done

awk -F '\t' 'NF == 3 && $1 !~ /^#/ { print "travelon-" $1 }' ops/cd/images.tsv | sort -u >"$expected_images"
while read -r image; do
  grep -Eq "image: ghcr.io/qzlabq/${image}:latest" "$rendered" || {
    echo "image manifest entry is absent from Kustomize output: $image" >&2
    exit 1
  }
done <"$expected_images"

sed -nE 's#^[[:space:]]*(- )?image: ghcr\.io/qzlabq/(travelon-[a-z0-9-]+):latest$#\2#p' "$rendered" | sort -u >"$actual_images"
diff -u "$expected_images" "$actual_images"

while IFS=$'\t' read -r api_version kind name; do
  [[ -z "$api_version" || "$api_version" == \#* ]] && continue
  [[ "$name" =~ ^[a-z0-9]([-a-z0-9]*[a-z0-9])?$ ]] || exit 1
  case "$api_version:$kind" in
    apps/v1:Deployment|v1:Service|networking.k8s.io/v1:Ingress) ;;
    *) echo "retired resource kind is not safe: $api_version $kind" >&2; exit 1 ;;
  esac
  if grep -Eq "name: ${name}$" "$rendered"; then
    echo "retired resource is still declared by Kustomize: $kind/$name" >&2
    exit 1
  fi
done < ops/cd/retired-resources.tsv

# kubectl expects every prune allowlist entry as group/version/kind. Core API
# resources therefore use the explicit "core" group instead of v1/Kind.
for deploy_script in ops/runner/travelon-deploy-k3s scripts/deploy-k3s.sh; do
  grep -Fq -- '--prune-allowlist=core/v1/Service' "$deploy_script" || {
    echo "missing core/v1/Service prune allowlist in $deploy_script" >&2
    exit 1
  }
  grep -Fq -- '--prune-allowlist=core/v1/ConfigMap' "$deploy_script" || {
    echo "missing core/v1/ConfigMap prune allowlist in $deploy_script" >&2
    exit 1
  }
  if grep -Eq -- '--prune-allowlist=v1/(Service|ConfigMap)' "$deploy_script"; then
    echo "invalid two-part core resource prune allowlist in $deploy_script" >&2
    exit 1
  fi
done

echo "CD metadata checks passed"
