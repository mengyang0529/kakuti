#!/bin/bash

# --- 1. Configuration ---
export PROJECT_ID="kakuti"
export SERVICE_NAME="kakuti-api"
export PROD_API_KEY="rNL1UakRBj/CvrRiDx1oZEdpMlxqwC592UzsHuBpd9A="

# Generate a unique tag based on the current timestamp (e.g., 20250919-141500)
export IMAGE_TAG=$(date +%Y%m%d-%H%M%S)
export IMAGE_URL="gcr.io/${PROJECT_ID}/${SERVICE_NAME}:${IMAGE_TAG}"

echo ">>> Using unique image URL: ${IMAGE_URL}"

# --- 2. Build Image for the Correct Platform ---
echo ">>> Step 1: Building Docker image for Cloud Run (amd64)..."
docker build --platform linux/amd64 -t $IMAGE_URL .

# --- 3. Push Image ---
echo ">>> Step 2: Pushing image to GCR..."
gcloud auth configure-docker
docker push $IMAGE_URL

# --- 4. Deploy Service ---
echo ">>> Step 3: Deploying to Cloud Run..."
gcloud run deploy ${SERVICE_NAME} \
  --image ${IMAGE_URL} \
  --project ${PROJECT_ID} \
  --region asia-northeast1 \
  --allow-unauthenticated \
  --memory=2Gi \
  --set-env-vars="^##^REQUIRE_API_KEY=true##API_KEY=${PROD_API_KEY}##DOCMIND_DB=/tmp/docmind.db##LLM_PROVIDER=gemini##HF_HOME=/tmp" \
  --set-secrets="GEMINI_API_KEY=Kakuti-Secret:latest"

echo ">>> Deployment complete!"