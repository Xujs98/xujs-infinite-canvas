#!/usr/bin/env bash

set -Eeuo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
IMAGE="${DOCKER_IMAGE:-qq1371446705/julong-canvas}"
PLATFORMS="${DOCKER_PLATFORMS:-linux/amd64,linux/arm64}"
TAG="${1:-$(tr -d '[:space:]' < "${ROOT_DIR}/VERSION")}"

if [[ -z "${TAG}" ]]; then
    echo "镜像标签不能为空" >&2
    exit 1
fi

if ! docker info >/dev/null 2>&1; then
    echo "Docker 未运行，请先启动 Docker Desktop 或 Docker Engine" >&2
    exit 1
fi

if ! docker buildx inspect >/dev/null 2>&1; then
    docker buildx create --name julong-canvas-builder --use
fi

tags=(--tag "${IMAGE}:${TAG}")
if [[ "${PUBLISH_LATEST:-true}" == "true" ]]; then
    tags+=(--tag "${IMAGE}:latest")
fi

echo "构建并推送 ${IMAGE}:${TAG}"
echo "目标架构：${PLATFORMS}"

docker buildx build \
    --platform "${PLATFORMS}" \
    "${tags[@]}" \
    --push \
    "${ROOT_DIR}"

docker buildx imagetools inspect "${IMAGE}:${TAG}"
