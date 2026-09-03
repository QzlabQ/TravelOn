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

echo "CD metadata checks passed"
