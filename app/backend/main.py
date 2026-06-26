"""
♟ Turniej Szachowy — Backend API
FastAPI + PostgreSQL + JWT

Endpointy zgodne z tym czego wymaga App.jsx (zastępstwo Supabase)
"""

from fastapi import FastAPI, Depends, HTTPException, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from pydantic import BaseModel
from typing import Optional
import asyncpg
import bcrypt
import jwt
import os
from datetime import datetime, timedelta
from contextlib import asynccontextmanager

# ─── CONFIG ──────────────────────────────────────────────────────────────────
DB_URL    = os.getenv("DATABASE_URL", "postgresql://chess:chess_pass@localhost:5432/chess_db")
JWT_SECRET = os.getenv("JWT_SECRET", "zmien-ten-sekret-na-vps")
JWT_ALGO   = "HS256"
JWT_EXPIRE = 60 * 24  # minuty → 1 dzień

# ─── LIFESPAN ────────────────────────────────────────────────────────────────
pool: asyncpg.Pool = None

@asynccontextmanager
async def lifespan(app: FastAPI):
    global pool
    pool = await asyncpg.create_pool(DB_URL, min_size=2, max_size=10)
    yield
    await pool.close()

app = FastAPI(title="Turniej Szachowy API", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],   # w produkcji wpisz domenę
    allow_methods=["*"],
    allow_headers=["*"],
)

security = HTTPBearer(auto_error=False)

# ─── JWT HELPERS ─────────────────────────────────────────────────────────────
def create_token(user_id: int, email: str, role: str) -> str:
    payload = {
        "sub": str(user_id),
        "email": email,
        "role": role,
        "exp": datetime.utcnow() + timedelta(minutes=JWT_EXPIRE),
    }
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGO)

def decode_token(token: str) -> dict:
    try:
        return jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGO])
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Token wygasł")
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="Nieprawidłowy token")

async def get_current_user(creds: HTTPAuthorizationCredentials = Depends(security)):
    if not creds:
        raise HTTPException(status_code=401, detail="Brak tokenu")
    return decode_token(creds.credentials)

async def require_teacher(user=Depends(get_current_user)):
    if user["role"] not in ("teacher", "superadmin"):
        raise HTTPException(status_code=403, detail="Brak uprawnień")
    return user

async def require_superadmin(user=Depends(get_current_user)):
    if user["role"] != "superadmin":
        raise HTTPException(status_code=403, detail="Tylko superadmin")
    return user

# ─── SCHEMAS ─────────────────────────────────────────────────────────────────
class LoginRequest(BaseModel):
    email: str
    password: str

class ParticipantCreate(BaseModel):
    imie: str
    klasa: str

class PairCreate(BaseModel):
    round_number: int
    white_id: int
    black_id: Optional[int] = None
    result: str = ""

class PairsInsert(BaseModel):
    pairs: list[PairCreate]

class ResultUpdate(BaseModel):
    result: str

class UserCreate(BaseModel):
    email: str
    password: str
    role: str = "teacher"  # teacher | superadmin

# ─── AUTH ────────────────────────────────────────────────────────────────────
@app.post("/auth/login")
async def login(body: LoginRequest):
    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            "SELECT id, email, password_hash, role FROM users WHERE email = $1",
            body.email
        )
    if not row:
        raise HTTPException(status_code=401, detail="Nieprawidłowy email lub hasło")
    if not bcrypt.checkpw(body.password.encode(), row["password_hash"].encode()):
        raise HTTPException(status_code=401, detail="Nieprawidłowy email lub hasło")

    token = create_token(row["id"], row["email"], row["role"])
    return {
        "access_token": token,
        "user": {"id": row["id"], "email": row["email"]},
        "role": row["role"],
    }

@app.get("/auth/me")
async def me(user=Depends(get_current_user)):
    return user

@app.post("/auth/logout")
async def logout():
    # JWT jest bezstanowy — klient po prostu usuwa token
    return {"ok": True}

# ─── USERS (tylko superadmin) ────────────────────────────────────────────────
@app.post("/users", status_code=201)
async def create_user(body: UserCreate, _=Depends(require_superadmin)):
    hashed = bcrypt.hashpw(body.password.encode(), bcrypt.gensalt()).decode()
    async with pool.acquire() as conn:
        try:
            row = await conn.fetchrow(
                "INSERT INTO users (email, password_hash, role) VALUES ($1,$2,$3) RETURNING id, email, role",
                body.email, hashed, body.role
            )
        except asyncpg.UniqueViolationError:
            raise HTTPException(status_code=409, detail="Email już istnieje")
    return dict(row)

@app.get("/users")
async def list_users(_=Depends(require_superadmin)):
    async with pool.acquire() as conn:
        rows = await conn.fetch("SELECT id, email, role FROM users ORDER BY email")
    return [dict(r) for r in rows]

@app.delete("/users/{user_id}", status_code=204)
async def delete_user(user_id: int, _=Depends(require_superadmin)):
    async with pool.acquire() as conn:
        await conn.execute("DELETE FROM users WHERE id = $1", user_id)

# ─── PARTICIPANTS ────────────────────────────────────────────────────────────
@app.get("/participants")
async def get_participants():
    async with pool.acquire() as conn:
        rows = await conn.fetch("SELECT * FROM participants ORDER BY imie")
    return [dict(r) for r in rows]

@app.post("/participants", status_code=201)
async def add_participant(body: ParticipantCreate, _=Depends(require_teacher)):
    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            "INSERT INTO participants (imie, klasa) VALUES ($1,$2) RETURNING *",
            body.imie, body.klasa
        )
    return dict(row)

@app.delete("/participants/{pid}", status_code=204)
async def delete_participant(pid: int, _=Depends(require_superadmin)):
    async with pool.acquire() as conn:
        await conn.execute("DELETE FROM participants WHERE id = $1", pid)

@app.delete("/participants", status_code=204)
async def delete_all_participants(_=Depends(require_superadmin)):
    async with pool.acquire() as conn:
        await conn.execute("DELETE FROM participants")

# ─── PAIRS ───────────────────────────────────────────────────────────────────
@app.get("/pairs")
async def get_pairs():
    async with pool.acquire() as conn:
        rows = await conn.fetch("SELECT * FROM pairs ORDER BY round_number, id")
    return [dict(r) for r in rows]

@app.post("/pairs", status_code=201)
async def insert_pairs(body: PairsInsert, _=Depends(require_teacher)):
    async with pool.acquire() as conn:
        inserted = []
        for p in body.pairs:
            row = await conn.fetchrow(
                """INSERT INTO pairs (round_number, white_id, black_id, result)
                   VALUES ($1,$2,$3,$4) RETURNING *""",
                p.round_number, p.white_id, p.black_id, p.result
            )
            inserted.append(dict(row))
    return inserted

@app.patch("/pairs/{pair_id}")
async def update_pair_result(pair_id: int, body: ResultUpdate, _=Depends(require_teacher)):
    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            "UPDATE pairs SET result=$1 WHERE id=$2 RETURNING *",
            body.result, pair_id
        )
    if not row:
        raise HTTPException(status_code=404, detail="Para nie istnieje")
    return dict(row)

@app.delete("/pairs", status_code=204)
async def delete_all_pairs(_=Depends(require_superadmin)):
    async with pool.acquire() as conn:
        await conn.execute("DELETE FROM pairs")

# ─── HEALTH ──────────────────────────────────────────────────────────────────
@app.get("/health")
async def health():
    return {"status": "ok"}
