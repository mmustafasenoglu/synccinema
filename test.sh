#!/bin/bash
# SyncCinema Test Script
# Kullanım: ./test.sh

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

PASS=0
FAIL=0

check() {
  if [ $1 -eq 0 ]; then
    echo -e "${GREEN}✓${NC} $2"
    PASS=$((PASS+1))
  else
    echo -e "${RED}✗${NC} $2"
    FAIL=$((FAIL+1))
  fi
}

echo "========================================="
echo "  SyncCinema Test"
echo "========================================="
echo ""

# 1. Docker container'lar çalışıyor mu?
echo -e "${YELLOW}[Docker]${NC}"
docker ps --format "{{.Names}}" | grep -q "synccinema_frontend" && check 0 "Frontend container çalışıyor" || check 1 "Frontend container yok"
docker ps --format "{{.Names}}" | grep -q "synccinema_backend" && check 0 "Backend container çalışıyor" || check 1 "Backend container yok"
echo ""

# 2. Portlar açık mı?
echo -e "${YELLOW}[Portlar]${NC}"
curl -s -o /dev/null -w "%{http_code}" http://localhost:8050 | grep -q "200\|304" && check 0 "Frontend (8050) yanıt veriyor" || check 1 "Frontend (8050) yanıt vermiyor"
curl -s -o /dev/null -w "%{http_code}" http://localhost:3001 | grep -q "200\|404" && check 0 "Backend (3001) yanıt veriyor" || check 1 "Backend (3001) yanıt vermiyor"
echo ""

# 3. COOP/COEP header'ları (ffmpeg.wasm için gerekli)
echo -e "${YELLOW}[COOP/COEP Headers]${NC}"
COOP=$(curl -sI http://localhost:8050 | grep -i "cross-origin-opener-policy")
COEP=$(curl -sI http://localhost:8050 | grep -i "cross-origin-embedder-policy")
[ -n "$COOP" ] && check 0 "COOP header var" || check 1 "COOP header yok"
[ -n "$COEP" ] && check 0 "COEP header var" || check 1 "COEP header yok"
echo ""

# 4. Frontend HTML yüklenebiliyor mu?
echo -e "${YELLOW}[Frontend]${NC}"
HTML=$(curl -s http://localhost:8050)
echo "$HTML" | grep -q "<div id=\"root\">" && check 0 "React root div var" || check 1 "React root div yok"
echo "$HTML" | grep -qi "script\|module" && check 0 "Vite build yüklendi" || check 1 "Vite build bulunamadı"
echo ""

# 5. Socket.io polling çalışıyor mu?
echo -e "${YELLOW}[Socket.io]${NC}"
SOCKETIO=$(curl -s "http://localhost:3001/socket.io/?EIO=4&transport=polling" 2>&1)
echo "$SOCKETIO" | grep -q "sid" && check 0 "Socket.io polling çalışıyor" || check 1 "Socket.io polling çalışmıyor"
echo ""

# 6. Backend health check
echo -e "${YELLOW}[Backend Health]${NC}"
BACKEND_CODE=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:3001/)
[ "$BACKEND_CODE" = "200" ] || [ "$BACKEND_CODE" = "404" ] && check 0 "Backend健康" || check 1 "Backend健康 değil ($BACKEND_CODE)"
echo ""

# Sonuç
echo "========================================="
echo -e "Sonuç: ${GREEN}$PASS pass${NC}, ${RED}$FAIL fail${NC}"
echo "========================================="

if [ $FAIL -gt 0 ]; then
  echo -e "${YELLOW}Sorun var! Container loglarını kontrol et:${NC}"
  echo "  docker logs synccinema_backend"
  echo "  docker logs synccinema_frontend"
fi
