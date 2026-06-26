#!/usr/bin/env bash
# ♟ TURNIEJ SZACHOWY — Skrypt instalacyjny VPS
# Testowany na Ubuntu 22.04 / 24.04
# Uruchom jako root: bash install.sh

set -e
CHESS_DIR="/opt/chess"
DB_NAME="chess_db"
DB_USER="chess"
DB_PASS=""   # zostanie wygenerowane automatycznie

# ─── KOLORY ──────────────────────────────────────────────────────────────────
GREEN='\033[0;32m'; YELLOW='\033[1;33m'; RED='\033[0;31m'; NC='\033[0m'
ok()   { echo -e "${GREEN}✔ $*${NC}"; }
info() { echo -e "${YELLOW}▸ $*${NC}"; }
err()  { echo -e "${RED}✘ $*${NC}"; exit 1; }

[[ $EUID -ne 0 ]] && err "Uruchom jako root (sudo bash install.sh)"

# ─── 1. PAKIETY SYSTEMOWE ────────────────────────────────────────────────────
info "Aktualizacja pakietów..."
apt-get update -qq
apt-get install -y -qq \
    postgresql postgresql-contrib \
    python3 python3-pip python3-venv \
    nodejs npm \
    curl git \
    > /dev/null
ok "Pakiety zainstalowane"

# ─── 2. UŻYTKOWNIK SYSTEMOWY ─────────────────────────────────────────────────
if ! id -u chess &>/dev/null; then
    useradd -m -s /bin/bash chess
    ok "Użytkownik 'chess' utworzony"
else
    ok "Użytkownik 'chess' już istnieje"
fi

# ─── 3. POSTGRESQL ───────────────────────────────────────────────────────────
info "Konfiguracja PostgreSQL..."
systemctl enable --now postgresql

# Wygeneruj hasło
DB_PASS=$(tr -dc 'A-Za-z0-9!@#%^&*' </dev/urandom | head -c 24)

sudo -u postgres psql -c "
  DO \$\$
  BEGIN
    IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname='${DB_USER}') THEN
      CREATE USER ${DB_USER} WITH PASSWORD '${DB_PASS}';
    ELSE
      ALTER USER ${DB_USER} WITH PASSWORD '${DB_PASS}';
    END IF;
  END
  \$\$;
"
sudo -u postgres psql -c "CREATE DATABASE ${DB_NAME} OWNER ${DB_USER};" 2>/dev/null || \
sudo -u postgres psql -c "ALTER DATABASE ${DB_NAME} OWNER TO ${DB_USER};"

ok "Baza danych '${DB_NAME}' gotowa"

# ─── 4. SCHEMAT BAZY ─────────────────────────────────────────────────────────
info "Tworzenie tabel..."
sudo -u postgres psql -d "${DB_NAME}" -f "$(dirname "$0")/schema.sql"
ok "Schemat zastosowany"

# ─── 5. STRUKTURA KATALOGÓW ──────────────────────────────────────────────────
mkdir -p "${CHESS_DIR}"/{backend,frontend}
chown -R chess:chess "${CHESS_DIR}"

# ─── 6. BACKEND ──────────────────────────────────────────────────────────────
info "Instalacja backendu Python..."
cp -r backend/* "${CHESS_DIR}/backend/"

python3 -m venv "${CHESS_DIR}/venv"
"${CHESS_DIR}/venv/bin/pip" install -q --upgrade pip
"${CHESS_DIR}/venv/bin/pip" install -q -r "${CHESS_DIR}/backend/requirements.txt"

# Generuj JWT_SECRET
JWT_SECRET=$(tr -dc 'A-Za-z0-9!@#%^&*' </dev/urandom | head -c 48)

cat > "${CHESS_DIR}/backend/.env" <<EOF
DATABASE_URL=postgresql://${DB_USER}:${DB_PASS}@localhost:5432/${DB_NAME}
JWT_SECRET=${JWT_SECRET}
EOF
chown chess:chess "${CHESS_DIR}/backend/.env"
chmod 600 "${CHESS_DIR}/backend/.env"

ok "Backend skonfigurowany"

# ─── 7. FRONTEND ─────────────────────────────────────────────────────────────
info "Budowanie frontendu React..."
cp -r frontend/* "${CHESS_DIR}/frontend/"

# Pobierz publiczny IP
PUBLIC_IP=$(curl -s ifconfig.me || echo "TWOJ_IP")

cat > "${CHESS_DIR}/frontend/.env" <<EOF
VITE_API_URL=http://${PUBLIC_IP}:8000
EOF

cd "${CHESS_DIR}/frontend"
npm install --silent
npm run build --silent
chown -R chess:chess "${CHESS_DIR}/frontend"

ok "Frontend zbudowany"

# ─── 8. SYSTEMD ──────────────────────────────────────────────────────────────
info "Konfiguracja usług systemd..."
cp "$(dirname "$0")/chess-backend.service"  /etc/systemd/system/
cp "$(dirname "$0")/chess-frontend.service" /etc/systemd/system/

systemctl daemon-reload
systemctl enable --now chess-backend chess-frontend

ok "Usługi uruchomione"

# ─── 9. FIREWALL (opcjonalnie) ───────────────────────────────────────────────
if command -v ufw &>/dev/null; then
    ufw allow 3000/tcp comment "Chess frontend" 2>/dev/null || true
    ufw allow 8000/tcp comment "Chess backend"  2>/dev/null || true
    ok "Firewall (ufw) skonfigurowany"
fi

# ─── 10. SUPERADMIN ──────────────────────────────────────────────────────────
info "Tworzenie konta superadmina..."
cd "${CHESS_DIR}"
sudo -u chess "${CHESS_DIR}/venv/bin/python3" scripts/seed.py

# ─── PODSUMOWANIE ────────────────────────────────────────────────────────────
echo ""
echo -e "${GREEN}════════════════════════════════════════════════════${NC}"
echo -e "${GREEN}  ♟  Turniej Szachowy zainstalowany pomyślnie!${NC}"
echo -e "${GREEN}════════════════════════════════════════════════════${NC}"
echo ""
echo -e "  Frontend:  ${YELLOW}http://${PUBLIC_IP}:3000${NC}"
echo -e "  Backend:   ${YELLOW}http://${PUBLIC_IP}:8000/docs${NC}  (Swagger UI)"
echo ""
echo -e "  Logi:  journalctl -u chess-backend -f"
echo -e "         journalctl -u chess-frontend -f"
echo ""
echo -e "${YELLOW}  Hasło DB zapisane w: ${CHESS_DIR}/backend/.env${NC}"
echo ""