import os
import psycopg2
import psycopg2.extras
from contextlib import contextmanager
from typing import Any, Iterable, Optional
from loguru import logger

from .config import settings


def get_connection_string() -> str:
    """Get PostgreSQL connection string from settings."""
    return (
        f"host={settings.POSTGRES_HOST} "
        f"port={settings.POSTGRES_PORT} "
        f"dbname={settings.POSTGRES_DB} "
        f"user={settings.POSTGRES_USER} "
        f"password={settings.POSTGRES_PASSWORD}"
    )


def connect() -> psycopg2.extensions.connection:
    """Create a new PostgreSQL connection."""
    try:
        conn = psycopg2.connect(
            get_connection_string(),
            cursor_factory=psycopg2.extras.RealDictCursor
        )
        conn.autocommit = False
        return conn
    except Exception as e:
        logger.error(f"Failed to connect to PostgreSQL: {e}")
        raise


# Global connection pool (simple implementation)
_connection_pool = []
_pool_size = 10


def get_connection() -> psycopg2.extensions.connection:
    """Get a connection from the pool or create a new one."""
    if _connection_pool:
        conn = _connection_pool.pop()
        # Check if connection is still alive
        try:
            with conn.cursor() as cur:
                cur.execute("SELECT 1")
            return conn
        except:
            # Connection is dead, create a new one
            pass
    
    return connect()


def return_connection(conn: psycopg2.extensions.connection):
    """Return a connection to the pool."""
    if len(_connection_pool) < _pool_size:
        _connection_pool.append(conn)
    else:
        conn.close()


def executescript(sql: str):
    """Execute a SQL script."""
    conn = get_connection()
    try:
        with conn.cursor() as cur:
            cur.execute(sql)
        conn.commit()
    except Exception as e:
        conn.rollback()
        raise e
    finally:
        return_connection(conn)


def execute(sql: str, params: Iterable[Any] | None = None) -> psycopg2.extras.RealDictCursor:
    """Execute a SQL statement and return cursor."""
    conn = get_connection()
    try:
        cur = conn.cursor()
        cur.execute(sql, params or [])
        return cur
    except Exception as e:
        conn.rollback()
        return_connection(conn)
        raise e


def query_all(sql: str, params: Iterable[Any] | None = None) -> list[dict]:
    """Execute a query and return all results."""
    conn = get_connection()
    try:
        with conn.cursor() as cur:
            cur.execute(sql, params or [])
            results = cur.fetchall()
            return [dict(row) for row in results]
    except Exception as e:
        conn.rollback()
        raise e
    finally:
        return_connection(conn)


def query_one(sql: str, params: Iterable[Any] | None = None) -> dict | None:
    """Execute a query and return one result."""
    conn = get_connection()
    try:
        with conn.cursor() as cur:
            cur.execute(sql, params or [])
            result = cur.fetchone()
            return dict(result) if result else None
    except Exception as e:
        conn.rollback()
        raise e
    finally:
        return_connection(conn)


@contextmanager
def transaction():
    """Context manager for database transactions."""
    conn = get_connection()
    try:
        yield conn
        conn.commit()
    except Exception as e:
        conn.rollback()
        logger.error(f"Transaction failed: {e}")
        raise e
    finally:
        return_connection(conn)


def execute_with_connection(conn: psycopg2.extensions.connection, sql: str, params: Iterable[Any] | None = None):
    """Execute SQL with an existing connection (for use within transactions)."""
    with conn.cursor() as cur:
        cur.execute(sql, params or [])
        return cur


def query_all_with_connection(conn: psycopg2.extensions.connection, sql: str, params: Iterable[Any] | None = None) -> list[dict]:
    """Query all with an existing connection."""
    with conn.cursor() as cur:
        cur.execute(sql, params or [])
        results = cur.fetchall()
        return [dict(row) for row in results]


def query_one_with_connection(conn: psycopg2.extensions.connection, sql: str, params: Iterable[Any] | None = None) -> dict | None:
    """Query one with an existing connection."""
    with conn.cursor() as cur:
        cur.execute(sql, params or [])
        result = cur.fetchone()
        return dict(result) if result else None