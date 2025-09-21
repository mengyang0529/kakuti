#!/bin/bash
set -euo pipefail

# --- 1. Configuration ---
PROJECT_ID="zenn-ai-agent-hackathon-471021"
REPOSITORY="kakuti-backend"
IMAGE_NAME="backend"
SERVICE_NAME="kakuti-api"
REGION="asia-northeast1"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"

IMAGE_TAG="manual-$(date +%Y%m%d-%H%M%S)"
IMAGE_URL="${REGION}-docker.pkg.dev/${PROJECT_ID}/${REPOSITORY}/${IMAGE_NAME}:${IMAGE_TAG}"

echo ">>> Using image: ${IMAGE_URL}"

# --- 2. Build image (linux/amd64) ---
echo ">>> Step 1: Building Docker image..."
docker build \
  --platform linux/amd64 \
  -f "${REPO_ROOT}/backend/Dockerfile" \
  -t "${IMAGE_URL}" \
  "${REPO_ROOT}/backend"

# --- 3. Push image ---
echo ">>> Step 2: Pushing image to Artifact Registry..."
gcloud auth configure-docker "${REGION}-docker.pkg.dev"
docker push "${IMAGE_URL}"

# --- 4. Deploy service ---
echo ">>> Step 3: Deploying to Cloud Run..."
gcloud run deploy "${SERVICE_NAME}" \
  --image "${IMAGE_URL}" \
  --project "${PROJECT_ID}" \
  --region "${REGION}" \
  --allow-unauthenticated \
  --memory=2Gi \
  --timeout=300 \
  --set-env-vars "^|^REQUIRE_API_KEY=true|GEMINI_REQUEST_TIMEOUT=30|DOCMIND_DB=/tmp/docmind.db|LLM_PROVIDER=gemini|HF_HOME=/tmp|ALLOWED_ORIGINS=https://mengyang0529.github.io,http://localhost:5173,https://kakuti.xyz" \
  --set-secrets "API_KEY=kakuti-api-key:latest"

echo ">>> Deployment complete!"
