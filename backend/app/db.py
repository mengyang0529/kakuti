import os
import sqlite3
from contextlib import contextmanager
from typing import Any, Iterable
from loguru import logger

from .config import settings

# Import PostgreSQL module conditionally
if settings.DB_TYPE == "postgresql":
    from . import db_postgres

if settings.DB_TYPE == "sqlite" and settings.DB_DIR:
    os.makedirs(settings.DB_DIR, exist_ok=True)


def dict_factory(cursor: sqlite3.Cursor, row: tuple) -> dict:
    d = {}
    for idx, col in enumerate(cursor.description):
        d[col[0]] = row[idx]
    return d


def connect() -> sqlite3.Connection:
    con = sqlite3.connect(settings.DB_PATH, check_same_thread=False)
    con.row_factory = dict_factory
    # Basic pragmas
    con.execute("PRAGMA foreign_keys = ON;")
    con.execute("PRAGMA foreign_keys = ON;")
    con.execute("PRAGMA busy_timeout=5000;")
    if settings.DB_AUTOVACUUM_FULL:
        try:
            con.execute("PRAGMA auto_vacuum=FULL;")
        except Exception:
            pass
    try:
        con.execute("PRAGMA journal_mode=WAL;")
    except Exception:
        pass
    # Try load sqlite-vec if enabled
    if settings.SQLITE_VEC_ENABLE:
        try:
            con.enable_load_extension(True)
            con.execute("SELECT load_extension('sqlite-vec')")
            logger.info("sqlite-vec extension loaded")
        except Exception as e:
            logger.warning(f"Failed to load sqlite-vec: {e}")
            # degrade to Python path by disabling
            settings.SQLITE_VEC_ENABLE = False
    return con


CONN = connect() if settings.DB_TYPE == "sqlite" else None


def executescript(sql: str):
    if CONN is None:
        raise RuntimeError("SQLite connection not initialized; executescript called in non-sqlite mode")
    CONN.executescript(sql)


def execute(sql: str, params: Iterable[Any] | None = None):
    if CONN is None:
        raise RuntimeError("SQLite connection not initialized; execute called in non-sqlite mode")
    cur = CONN.execute(sql, params or [])
    return cur


def query_all(sql: str, params: Iterable[Any] | None = None) -> list[dict]:
    return list(execute(sql, params).fetchall())


def query_one(sql: str, params: Iterable[Any] | None = None) -> dict | None:
    cur = execute(sql, params)
    return cur.fetchone()


@contextmanager
def transaction():
    if settings.DB_TYPE == "postgresql":
        # Use PostgreSQL transaction
        with db_postgres.transaction() as conn:
            yield conn
    else:
        # Use SQLite transaction
        try:
            CONN.execute("BEGIN")
            yield
            CONN.execute("COMMIT")
        except Exception as e:
            # Check if it's a "cannot start a transaction within a transaction" error
            if "cannot start a transaction within a transaction" in str(e).lower():
                # If we're already in a transaction, just yield without starting a new one
                yield
            else:
                # For other errors, try to rollback and re-raise
                try:
                    CONN.execute("ROLLBACK")
                except:
                    pass
                raise e


# Database abstraction functions
def db_execute(sql: str, params: Iterable[Any] | None = None):
    """Execute SQL with database abstraction."""
    if settings.DB_TYPE == "postgresql":
        return db_postgres.execute(sql, params)
    else:
        return execute(sql, params)


def db_query_all(sql: str, params: Iterable[Any] | None = None) -> list[dict]:
    """Query all with database abstraction."""
    if settings.DB_TYPE == "postgresql":
        return db_postgres.query_all(sql, params)
    else:
        return query_all(sql, params)


def db_query_one(sql: str, params: Iterable[Any] | None = None) -> dict | None:
    """Query one with database abstraction."""
    if settings.DB_TYPE == "postgresql":
        return db_postgres.query_one(sql, params)
    else:
        return query_one(sql, params)


def db_executescript(sql: str):
    """Execute script with database abstraction."""
    if settings.DB_TYPE == "postgresql":
        return db_postgres.executescript(sql)
    else:
        return executescript(sql)
