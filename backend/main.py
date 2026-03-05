from fastapi import FastAPI, Query
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import sqlite3
from datetime import date, timedelta
from typing import Optional
import os

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

DB_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), "habits.db")


def get_db():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    return conn


def init_db():
    conn = get_db()
    conn.executescript("""
        CREATE TABLE IF NOT EXISTS habits (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            status TEXT NOT NULL DEFAULT 'active',
            created_at TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS completions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            habit_id INTEGER NOT NULL,
            date TEXT NOT NULL,
            FOREIGN KEY (habit_id) REFERENCES habits(id),
            UNIQUE (habit_id, date)
        );
    """)
    conn.commit()
    conn.close()


init_db()


def calculate_streaks(habit_id: int, conn) -> tuple:
    rows = conn.execute(
        "SELECT date FROM completions WHERE habit_id = ? ORDER BY date",
        (habit_id,),
    ).fetchall()

    if not rows:
        return 0, 0

    completion_dates = set(row["date"] for row in rows)
    today = date.today()

    # Current streak: consecutive days ending today or yesterday
    current_streak = 0
    check_date = today
    if today.isoformat() not in completion_dates:
        check_date = today - timedelta(days=1)

    while check_date.isoformat() in completion_dates:
        current_streak += 1
        check_date -= timedelta(days=1)

    # Longest streak: max consecutive run across all history
    sorted_dates = sorted(completion_dates)
    longest = 1 if sorted_dates else 0
    current_run = 1

    for i in range(1, len(sorted_dates)):
        prev = date.fromisoformat(sorted_dates[i - 1])
        curr = date.fromisoformat(sorted_dates[i])
        if (curr - prev).days == 1:
            current_run += 1
            if current_run > longest:
                longest = current_run
        else:
            current_run = 1

    return current_streak, max(longest, current_streak)


def get_heatmap(habit_id: int, conn) -> list:
    today = date.today()
    result = []
    for i in range(83, -1, -1):
        d = today - timedelta(days=i)
        row = conn.execute(
            "SELECT 1 FROM completions WHERE habit_id = ? AND date = ?",
            (habit_id, d.isoformat()),
        ).fetchone()
        result.append({"date": d.isoformat(), "completed": row is not None})
    return result


def build_habit_response(habit, conn):
    current_streak, longest_streak = calculate_streaks(habit["id"], conn)
    today = date.today().isoformat()
    completed_today = (
        conn.execute(
            "SELECT 1 FROM completions WHERE habit_id = ? AND date = ?",
            (habit["id"], today),
        ).fetchone()
        is not None
    )
    return {
        "id": habit["id"],
        "name": habit["name"],
        "status": habit["status"],
        "current_streak": current_streak,
        "longest_streak": longest_streak,
        "completed_today": completed_today,
        "heatmap": get_heatmap(habit["id"], conn),
    }


class HabitCreate(BaseModel):
    name: str


@app.get("/habits")
def list_habits():
    conn = get_db()
    habits = conn.execute(
        "SELECT * FROM habits WHERE status = 'active' ORDER BY id"
    ).fetchall()
    result = [build_habit_response(h, conn) for h in habits]
    conn.close()
    return result


@app.post("/habits", status_code=201)
def create_habit(body: HabitCreate):
    conn = get_db()
    cur = conn.execute(
        "INSERT INTO habits (name, status, created_at) VALUES (?, 'active', ?)",
        (body.name, date.today().isoformat()),
    )
    conn.commit()
    habit = conn.execute(
        "SELECT * FROM habits WHERE id = ?", (cur.lastrowid,)
    ).fetchone()
    result = build_habit_response(habit, conn)
    conn.close()
    return result


@app.get("/habits/archived")
def list_archived():
    conn = get_db()
    habits = conn.execute(
        "SELECT * FROM habits WHERE status = 'archived' ORDER BY id"
    ).fetchall()
    result = [build_habit_response(h, conn) for h in habits]
    conn.close()
    return result


@app.patch("/habits/{habit_id}/archive")
def archive_habit(habit_id: int):
    conn = get_db()
    conn.execute(
        "UPDATE habits SET status = 'archived' WHERE id = ? AND status = 'active'",
        (habit_id,),
    )
    conn.commit()
    conn.close()
    return {"ok": True}


@app.patch("/habits/{habit_id}/unarchive")
def unarchive_habit(habit_id: int):
    conn = get_db()
    conn.execute(
        "UPDATE habits SET status = 'active' WHERE id = ? AND status = 'archived'",
        (habit_id,),
    )
    conn.commit()
    conn.close()
    return {"ok": True}


@app.delete("/habits/{habit_id}")
def delete_habit(habit_id: int):
    conn = get_db()
    conn.execute("DELETE FROM completions WHERE habit_id = ?", (habit_id,))
    conn.execute("DELETE FROM habits WHERE id = ?", (habit_id,))
    conn.commit()
    conn.close()
    return {"ok": True}


@app.post("/habits/{habit_id}/complete")
def toggle_complete(
    habit_id: int,
    date_override: Optional[str] = Query(None, alias="date"),
):
    completion_date = date_override if date_override else date.today().isoformat()
    conn = get_db()
    existing = conn.execute(
        "SELECT id FROM completions WHERE habit_id = ? AND date = ?",
        (habit_id, completion_date),
    ).fetchone()

    if existing:
        conn.execute(
            "DELETE FROM completions WHERE habit_id = ? AND date = ?",
            (habit_id, completion_date),
        )
        completed = False
    else:
        conn.execute(
            "INSERT INTO completions (habit_id, date) VALUES (?, ?)",
            (habit_id, completion_date),
        )
        completed = True

    conn.commit()
    conn.close()
    return {"completed": completed, "date": completion_date}


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=3001)
