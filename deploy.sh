#!/bin/bash
# Deploy aplikacji "Generator zapytań" na VPS (Faza D).
# Wzorzec transportu z generator-ofert/make-offer.sh.
set -euo pipefail

VPS="root@100.93.232.123"
KEY="$HOME/.ssh/id_ed25519"
SRC="$(cd "$(dirname "$0")" && pwd)"
DST="/docker/zapytania-app"

echo "== 1. Kopiowanie plików na VPS ($DST) =="
ssh -i "$KEY" "$VPS" "mkdir -p $DST/photo-cache"
scp -i "$KEY" -r \
  "$SRC/server.mjs" "$SRC/lib" "$SRC/data" "$SRC/public" "$SRC/Dockerfile" \
  "$VPS:$DST/"

echo "== 2. Przypomnienie o env =="
cat <<'EOT'
W /docker/openclaw-jb6z/.env muszą być:
  AIRTABLE_API_KEY=...           (zwykle już jest)
  INQUIRY_SHARED_TOKEN=...       (openssl rand -hex 24; ta sama wartość w env n8n)
Serwis "zapytania" wklejony do /docker/openclaw-jb6z/docker-compose.yml
(patrz docker-compose.snippet.yml).
EOT

echo "== 3. Build + start =="
ssh -i "$KEY" "$VPS" "cd /docker/openclaw-jb6z && docker compose up -d --build zapytania"

echo "== 4. Smoke test =="
ssh -i "$KEY" "$VPS" "sleep 2 && curl -s -o /dev/null -w 'HTTP %{http_code}\n' http://localhost:8095/api/artists"

echo "GOTOWE. Pamiętaj: jeśli ruszałeś serwis openclaw -> docker compose restart hooks-proxy (+ weryfikacja check-hooks-proxy.sh)."
