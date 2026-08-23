#!/usr/bin/env bash
# deploy.sh — build, push, and deploy the warehouse ERP to production
# Usage: ./deploy.sh [--frontend-only | --backend-only | --skip-push]
set -euo pipefail

REMOTE_HOST="warehouse"
REMOTE_DIR="~/ware-house"
GIT_REMOTE="organization"
BRANCH="main"

FRONTEND_ONLY=false
BACKEND_ONLY=false
SKIP_PUSH=false

for arg in "$@"; do
  case $arg in
    --frontend-only) FRONTEND_ONLY=true ;;
    --backend-only)  BACKEND_ONLY=true ;;
    --skip-push)     SKIP_PUSH=true ;;
  esac
done

echo "=== 1. TypeScript check ==="
docker compose exec frontend node_modules/.bin/tsc --noEmit
echo "    ✓ TS clean"

echo "=== 2. Django check ==="
docker compose exec backend python manage.py check
echo "    ✓ Django healthy"

echo "=== 3. Git push ==="
if [ "$SKIP_PUSH" = false ]; then
  git push "$GIT_REMOTE" "$BRANCH"
  echo "    ✓ Pushed to $GIT_REMOTE/$BRANCH"
else
  echo "    skipped (--skip-push)"
fi

echo "=== 4. Pull & rebuild on server ==="
if [ "$FRONTEND_ONLY" = true ]; then
  SERVICES="frontend"
elif [ "$BACKEND_ONLY" = true ]; then
  SERVICES="backend"
else
  SERVICES=""
fi

ssh "$REMOTE_HOST" "
  set -e
  cd $REMOTE_DIR
  git pull origin $BRANCH
  docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d --build $SERVICES
  echo '    ✓ Production updated'
"

echo ""
echo "=== Deploy complete ==="
