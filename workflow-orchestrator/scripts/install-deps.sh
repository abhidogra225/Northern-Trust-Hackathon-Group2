#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

echo "Installing orchestrator dependencies..."
npm install --prefix "${ROOT_DIR}/orchestrator"

echo "Installing frontend dependencies..."
npm install --prefix "${ROOT_DIR}/frontend"

echo "Installing mock service dependencies..."
npm install --prefix "${ROOT_DIR}/services/payment-service"
npm install --prefix "${ROOT_DIR}/services/inventory-service"
npm install --prefix "${ROOT_DIR}/services/shipping-service"
npm install --prefix "${ROOT_DIR}/services/notification-service"

echo "All dependencies installed."
