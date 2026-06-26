#!/usr/bin/env python3
"""
Skrypt tworzący pierwszego superadmina.
Użycie:  python3 seed.py
"""
import asyncio, asyncpg, bcrypt, os
from dotenv import load_dotenv

load_dotenv()
DB_URL = os.getenv("DATABASE_URL", "postgresql://chess:chess_pass@localhost:5432/chess_db")

async def main():
    print("=== Tworzenie superadmina ===")
    email    = input("Email: ").strip()
    password = input("Hasło: ").strip()

    if len(password) < 8:
        print("❌  Hasło musi mieć min. 8 znaków.")
        return

    hashed = bcrypt.hashpw(password.encode(), bcrypt.gensalt()).decode()
    conn = await asyncpg.connect(DB_URL)
    try:
        await conn.execute(
            "INSERT INTO users (email, password_hash, role) VALUES ($1,$2,'superadmin') "
            "ON CONFLICT (email) DO UPDATE SET password_hash=$2, role='superadmin'",
            email, hashed
        )
        print(f"✅  Superadmin '{email}' gotowy.")
    finally:
        await conn.close()

asyncio.run(main())
