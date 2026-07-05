#!/bin/bash
# PLAN B na zdjęcia: gdy pliki na Google Drive NIE są publiczne ("każdy z linkiem"),
# endpoint /api/photo nie pobierze ich bez auth. Ten skrypt pobiera zdjęcia przez gog
# (w kontenerze openclaw, ma auth Drive) i wrzuca do photo-cache aplikacji na hoście —
# serwer znajdzie je jako cache-hit bez żadnych zmian w kodzie.
#
# Użycie (z Maca): ./scripts/sync-photos.sh
# Wymaga: aplikacja wdrożona na VPS, AIRTABLE_API_KEY w env kontenera openclaw.
# UWAGA: nie montujemy wolumenów do kontenera openclaw (recreate = pułapka hooks-proxy),
# dlatego docker exec + docker cp, nie wspólny mount.
set -euo pipefail

VPS="root@100.93.232.123"
KEY="$HOME/.ssh/id_ed25519"
CACHE="/docker/zapytania-app/photo-cache"
OC="openclaw-jb6z-openclaw-1"

ssh -i "$KEY" "$VPS" bash -s <<'REMOTE'
set -euo pipefail
CACHE="/docker/zapytania-app/photo-cache"
OC="openclaw-jb6z-openclaw-1"
mkdir -p "$CACHE"

# Lista recId + driveId z Airtable (rekordy widoczne w aplikacji, z linkiem Drive)
docker exec "$OC" sh -c 'node -e "
const AK=process.env.AIRTABLE_API_KEY, BASE=\"app5NIUbshNL31ylr\", TABLE=\"Cennik 2026\";
(async()=>{
  let offset=\"\", out=[];
  do {
    const u=\`https://api.airtable.com/v0/\${BASE}/\${encodeURIComponent(TABLE)}?filterByFormula=\${encodeURIComponent(\"{Widoczność w aplikacji}=TRUE()\")}&pageSize=100\`+(offset?\`&offset=\${offset}\`:\"\");
    const r=await fetch(u,{headers:{Authorization:\`Bearer \${AK}\`}}); const j=await r.json();
    for(const rec of j.records||[]){
      const m=String(rec.fields[\"Zdjęcie główne\"]||\"\").match(/[-\\w]{25,}/);
      if(m) out.push(rec.id+\" \"+m[0]);
    }
    offset=j.offset||\"\";
  } while(offset);
  console.log(out.join(\"\\n\"));
})();
"' | while read -r REC DRIVE; do
  [ -z "$REC" ] && continue
  if [ -f "$CACHE/$REC.jpg" ]; then echo "skip $REC (już w cache)"; continue; fi
  echo "pobieram $REC <- drive:$DRIVE"
  docker exec "$OC" sh -c "gog -a t.szwecki@impresariatkoncertowy.pl --client impresariat drive download $DRIVE --out /tmp/ph_$REC --force" || { echo "  FAIL $REC"; continue; }
  docker cp "$OC:/tmp/ph_$REC" "$CACHE/$REC.jpg"
  docker exec "$OC" rm -f "/tmp/ph_$REC"
  echo image/jpeg > "$CACHE/$REC.meta"
done
echo "Sync zakończony: $(ls "$CACHE" | grep -c '\.jpg$' || true) zdjęć w cache."
REMOTE
