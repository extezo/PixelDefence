"""Сервер игры: раздаёт файлы (без кеширования) и хранит таблицу лидеров в SQLite.

Запуск: ~/.local/bin/uv run --no-project --python 3.12 python serve.py [порт]

API:
  POST /api/register    {"nick"}                       -> {"nick", "token"}
  POST /api/score       {"nick", "token", "wave", "seed"} -> {"rank", "best"}
  GET  /api/leaderboard                                 -> {"top": [{"nick", "wave", "date"}]}
"""

import datetime
import functools
import hashlib
import http.server
import json
import os
import pathlib
import re
import secrets
import sqlite3
import sys
import time
import urllib.parse

ROOT = pathlib.Path(__file__).parent
# TD_DB — другой файл базы (для проверок, чтобы не трогать настоящую таблицу).
DB_PATH = pathlib.Path(os.environ.get("TD_DB") or ROOT / "data" / "leaderboard.sqlite")
# Папки, которые нельзя отдавать как статику: там база с хешами токенов и служебные файлы.
PRIVATE = ("/data", "/.claude", "/.git", "/serve.py")
NICK_RE = re.compile(r"^[A-Za-zА-Яа-яЁё0-9_\-]{3,16}$")
MAX_BODY = 1024
TOP_SIZE = 20


def db():
    DB_PATH.parent.mkdir(exist_ok=True)
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    conn.executescript(
        """
        CREATE TABLE IF NOT EXISTS players (
          key TEXT PRIMARY KEY,
          nick TEXT NOT NULL,
          token_hash TEXT NOT NULL,
          created INTEGER NOT NULL
        );
        CREATE TABLE IF NOT EXISTS scores (
          id INTEGER PRIMARY KEY,
          key TEXT NOT NULL REFERENCES players(key),
          wave INTEGER NOT NULL,
          seed INTEGER NOT NULL,
          created INTEGER NOT NULL
        );
        CREATE INDEX IF NOT EXISTS scores_wave ON scores(wave DESC);
        """
    )
    # Миграция старых баз: жар партии и дата вызова дня (NULL — обычная партия).
    columns = {r["name"] for r in conn.execute("PRAGMA table_info(scores)")}
    if "heat" not in columns:
        conn.execute("ALTER TABLE scores ADD COLUMN heat INTEGER NOT NULL DEFAULT 0")
    if "day" not in columns:
        conn.execute("ALTER TABLE scores ADD COLUMN day TEXT")
    return conn


# Ключ ника без учёта регистра. COLLATE NOCASE в SQLite сворачивает только латиницу,
# поэтому «Тест» и «ТЕСТ» различались бы — нормализуем в Python.
def nick_key(nick):
    return nick.casefold().replace("ё", "е")


def hash_token(token):
    return hashlib.sha256(token.encode()).hexdigest()


# Лучший результат каждого игрока в таблице: больше волн, при равенстве — больше жара, затем раньше.
# Таблица — общая (day IS NULL) или конкретного вызова дня (day = дата).
BEST_SQL = """
    SELECT key, nick, wave, heat, date FROM (
      SELECT s.key AS key, p.nick AS nick, s.wave AS wave, s.heat AS heat, s.created AS date,
        ROW_NUMBER() OVER (PARTITION BY s.key ORDER BY s.wave DESC, s.heat DESC, s.created ASC) AS rn
      FROM scores s JOIN players p ON p.key = s.key
      WHERE s.day IS ?
    )
    WHERE rn = 1
    ORDER BY wave DESC, heat DESC, date ASC
"""
DAY_RE = re.compile(r"^\d{4}-\d{2}-\d{2}$")
MAX_HEAT = 50


# Вызов дня принимается только за вчера, сегодня и завтра (UTC) — с запасом на часовые пояса.
def valid_day(day):
    if not isinstance(day, str) or not DAY_RE.match(day):
        return False
    today = datetime.datetime.now(datetime.timezone.utc).date()
    try:
        return abs((datetime.date.fromisoformat(day) - today).days) <= 1
    except ValueError:
        return False


class ApiError(Exception):
    def __init__(self, status, message):
        super().__init__(message)
        self.status = status


def api_register(body):
    nick = str(body.get("nick", "")).strip()
    if not NICK_RE.match(nick):
        raise ApiError(400, "Ник: 3–16 символов — буквы, цифры, _ и -")
    token = secrets.token_hex(16)
    with db() as conn:
        try:
            conn.execute(
                "INSERT INTO players (key, nick, token_hash, created) VALUES (?, ?, ?, ?)",
                (nick_key(nick), nick, hash_token(token), int(time.time())),
            )
        except sqlite3.IntegrityError:
            raise ApiError(409, "Этот ник уже занят") from None
    return {"nick": nick, "token": token}


def api_score(body):
    nick, token = str(body.get("nick", "")), str(body.get("token", ""))
    wave, seed = body.get("wave"), body.get("seed")
    heat, day = body.get("heat", 0), body.get("daily")
    if not isinstance(wave, int) or not 0 <= wave <= 10_000 or not isinstance(seed, int):
        raise ApiError(400, "Некорректный результат")
    if not isinstance(heat, int) or not 0 <= heat <= MAX_HEAT:
        raise ApiError(400, "Некорректный жар")
    if day is not None and not valid_day(day):
        raise ApiError(400, "Вызов дня уже закончился")
    with db() as conn:
        key = nick_key(nick)
        row = conn.execute("SELECT token_hash FROM players WHERE key = ?", (key,)).fetchone()
        if not row or not secrets.compare_digest(row["token_hash"], hash_token(token)):
            raise ApiError(403, "Неверный ник или ключ")
        conn.execute(
            "INSERT INTO scores (key, wave, seed, created, heat, day) VALUES (?, ?, ?, ?, ?, ?)",
            (key, wave, seed, int(time.time()), heat, day),
        )
        board = conn.execute(BEST_SQL, (day,)).fetchall()
    rank = next(i + 1 for i, r in enumerate(board) if r["key"] == key)
    return {"rank": rank, "best": board[rank - 1]["wave"]}


def api_leaderboard(query):
    day = (urllib.parse.parse_qs(query).get("daily") or [None])[0]
    if day is not None and not DAY_RE.match(day):
        raise ApiError(400, "Некорректная дата")
    with db() as conn:
        rows = conn.execute(BEST_SQL + " LIMIT ?", (day, TOP_SIZE)).fetchall()
    return {"top": [{"nick": r["nick"], "wave": r["wave"], "heat": r["heat"], "date": r["date"]} for r in rows]}


class Handler(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header("Cache-Control", "no-store")
        super().end_headers()

    def send_json(self, status, data):
        payload = json.dumps(data, ensure_ascii=False).encode()
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(payload)))
        self.end_headers()
        self.wfile.write(payload)

    def run_api(self, fn, *args):
        try:
            self.send_json(200, fn(*args))
        except ApiError as e:
            self.send_json(e.status, {"error": str(e)})

    def do_GET(self):
        path = self.path.split("?")[0]
        if path == "/api/leaderboard":
            return self.run_api(api_leaderboard, self.path.partition("?")[2])
        if path.startswith("/api/"):
            return self.send_json(404, {"error": "Нет такого метода"})
        if any(path == p or path.startswith(p + "/") for p in PRIVATE):
            return self.send_error(404)
        return super().do_GET()

    def do_HEAD(self):
        path = self.path.split("?")[0]
        if any(path == p or path.startswith(p + "/") for p in PRIVATE):
            return self.send_error(404)
        return super().do_HEAD()

    def do_POST(self):
        routes = {"/api/register": api_register, "/api/score": api_score}
        fn = routes.get(self.path.split("?")[0])
        if not fn:
            return self.send_json(404, {"error": "Нет такого метода"})
        length = int(self.headers.get("Content-Length") or 0)
        if length > MAX_BODY:
            return self.send_json(413, {"error": "Слишком большой запрос"})
        try:
            body = json.loads(self.rfile.read(length) or b"{}")
            if not isinstance(body, dict):
                raise ValueError
        except ValueError:
            return self.send_json(400, {"error": "Ожидается JSON"})
        return self.run_api(fn, body)


def main():
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8000
    db().close()
    handler = functools.partial(Handler, directory=str(ROOT))
    with http.server.ThreadingHTTPServer(("", port), handler) as httpd:
        print(f"Игра: http://localhost:{port}")
        httpd.serve_forever()


if __name__ == "__main__":
    main()
