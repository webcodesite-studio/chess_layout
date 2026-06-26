# ♟ Turniej Szachowy — Wdrożenie na VPS

## Struktura projektu

```
app/
├── backend/
│   ├── main.py            ← FastAPI (cały serwer API)
│   ├── requirements.txt   ← zależności Pythona
│   └── .env.example       ← szablon konfiguracji
├── frontend/
│   ├── App.jsx            ← główny komponent React (bez Supabase)
│   ├── src/main.jsx       ← entry point
│   ├── index.html
│   ├── vite.config.js
│   ├── package.json
│   ├── serve.js           ← serwer Node.js dla build
│   └── .env.example
└── scripts/
    ├── schema.sql              ← schemat PostgreSQL
    ├── seed.py                 ← tworzy superadmina
    ├── install.sh              ← instalacja jedną komendą
    ├── chess-backend.service   ← systemd: FastAPI
    └── chess-frontend.service  ← systemd: Node.js
```

---

## Instalacja jedną komendą (Ubuntu 22.04/24.04)

```bash
# Skopiuj cały katalog chess-vps na serwer:
scp -r app/ root@TWOJ_IP:/root/

# Zaloguj się i uruchom:
ssh root@TWOJ_IP
cd /root/app/scripts
bash install.sh
```

Skrypt automatycznie:
- Instaluje PostgreSQL, Python 3, Node.js
- Tworzy bazę danych i użytkownika z losowym hasłem
- Zakłada tabele (schema.sql)
- Instaluje backend w virtualenv
- Buduje frontend React (Vite)
- Rejestruje i uruchamia dwie usługi systemd
- Pyta o e-mail i hasło pierwszego superadmina

---

## Ręczna instalacja krok po kroku

### 1. PostgreSQL

```bash
sudo apt install postgresql
sudo -u postgres psql
```

```sql
CREATE USER chess WITH PASSWORD 'twoje_haslo';
CREATE DATABASE chess_db OWNER chess;
\q
```

```bash
psql -U chess -d chess_db -f scripts/schema.sql
```

### 2. Backend (FastAPI)

```bash
cd backend
cp .env.example .env
# Edytuj .env — wpisz DATABASE_URL i JWT_SECRET

python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt

# Utwórz superadmina:
python3 ../scripts/seed.py

# Uruchom dev:
uvicorn main:app --reload --port 8000

# Swagger UI dostępny na: http://localhost:8000/docs
```

### 3. Frontend (React + Vite)

```bash
cd frontend
cp .env.example .env
# Edytuj .env — wpisz VITE_API_URL=http://TWOJ_IP:8000

npm install
npm run build      # tworzy katalog dist/
node serve.js      # serwuje na porcie 3000
```

---

## Zarządzanie usługami

```bash
# Status
systemctl status chess-backend
systemctl status chess-frontend

# Logi na żywo
journalctl -u chess-backend  -f
journalctl -u chess-frontend -f

# Restart po zmianach
systemctl restart chess-backend
systemctl restart chess-frontend
```

---

## Dodawanie użytkowników

Tylko superadmin może tworzyć konta przez API:

```bash
curl -X POST http://TWOJ_IP:8000/users \
  -H "Authorization: Bearer TWOJ_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"email":"nauczyciel@szkola.pl","password":"haslo123","role":"teacher"}'
```

Role: `teacher` (dodaje uczestników, generuje pary, wpisuje wyniki) / `superadmin` (reset turnieju, zarządzanie kontami).

---

## Role użytkowników

| Akcja                    | gość | teacher | superadmin |
|--------------------------|------|---------|------------|
| Podgląd par i wyników    | ✔    | ✔       | ✔          |
| Dodawanie uczestników    | —    | ✔       | ✔          |
| Generowanie par          | —    | ✔       | ✔          |
| Wpisywanie wyników       | —    | ✔       | ✔          |
| Usuwanie uczestników     | —    | —       | ✔          |
| Reset turnieju           | —    | —       | ✔          |
| Zarządzanie kontami      | —    | —       | ✔          |

---

## Swagger UI (dokumentacja API)

Po uruchomieniu backendu dostępna pod:
```
http://TWOJ_IP:8000/docs
```

---

## Licencja / License

PL: Ten projekt jest udostępniony na podstawie **Licencji Użytkowania Ograniczonego** wyłącznie do celów edukacyjnych. Jest on przeznaczony do wyłącznego użytku przez **XII Liceum Ogólnokształcące im. Henryka Sienkiewicza w Warszawie**. Wykorzystanie komercyjne jest zabronione. Szczegóły znajdują się w pliku [LICENSE](LICENSE).

EN: This project is released under a **Limited Use License** for educational purposes. It is strictly for the use of **XII Liceum Ogólnokształcące im. Henryka Sienkiewicza in Warsaw**. Commercial use is prohibited. Please refer to the [LICENSE](LICENSE) file for details.