#!/usr/bin/env bash
set -euo pipefail

tag="${1:-ci}"
[[ "$tag" =~ ^[a-z0-9][a-z0-9._-]{0,127}$ ]] || {
  echo "invalid image tag: $tag" >&2
  exit 2
}

manifest="ops/cd/images.tsv"
[[ -r "$manifest" ]] || {
  echo "missing image manifest: $manifest" >&2
  exit 3
}

while IFS=$'\t' read -r name context dockerfile; do
  [[ -z "$name" || "$name" == \#* ]] && continue
  [[ "$name" =~ ^[a-z0-9-]+$ && "$context" != /* && "$dockerfile" != /* && "$context" != *..* && "$dockerfile" != *..* ]] || {
    echo "invalid image manifest entry: $name" >&2
    exit 4
  }
  [[ -f "$dockerfile" && -d "$context" ]] || {
    echo "missing build input for $name" >&2
    exit 5
  }
  docker build --pull --file "$dockerfile" --tag "travelon-${name}:${tag}" "$context"
done < "$manifest"
