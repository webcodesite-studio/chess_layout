-- ♟ Turniej Szachowy — schemat PostgreSQL
-- Uruchom: psql -U chess -d chess_db -f schema.sql

-- ─── UŻYTKOWNICY ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS users (
    id            SERIAL PRIMARY KEY,
    email         VARCHAR(255) UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    role          VARCHAR(20) NOT NULL DEFAULT 'teacher'
                  CHECK (role IN ('teacher', 'superadmin')),
    created_at    TIMESTAMPTZ DEFAULT NOW()
);

-- ─── UCZESTNICY ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS participants (
    id         SERIAL PRIMARY KEY,
    imie       VARCHAR(100) NOT NULL,
    klasa      VARCHAR(20)  NOT NULL,
    created_at TIMESTAMPTZ  DEFAULT NOW()
);

-- ─── PARY ────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS pairs (
    id           SERIAL PRIMARY KEY,
    round_number INTEGER      NOT NULL,
    white_id     INTEGER      NOT NULL REFERENCES participants(id) ON DELETE CASCADE,
    black_id     INTEGER               REFERENCES participants(id) ON DELETE CASCADE,
    result       VARCHAR(20)  NOT NULL DEFAULT '',
    created_at   TIMESTAMPTZ  DEFAULT NOW()
);

-- ─── INDEKSY ─────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_pairs_round ON pairs(round_number);
CREATE INDEX IF NOT EXISTS idx_pairs_white ON pairs(white_id);
CREATE INDEX IF NOT EXISTS idx_pairs_black ON pairs(black_id);
