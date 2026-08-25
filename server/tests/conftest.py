import os
import sys
from pathlib import Path

import pymysql
import pytest

# 让 tests/ 能 import server/ 下的 app.py（无包结构，手动置路径）
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

TEST_DB = "minidesk_inbox_test"
ORIGIN = "https://todolist.pages.dev"


def _mysql_kwargs() -> dict:
    return {
        "host": os.environ.get("MINIDESK_TEST_MYSQL_HOST", "127.0.0.1"),
        "port": int(os.environ.get("MINIDESK_TEST_MYSQL_PORT", "3306")),
        "user": os.environ.get("MINIDESK_TEST_MYSQL_USER", "root"),
        "password": os.environ.get("MINIDESK_TEST_MYSQL_PASSWORD", ""),
        "autocommit": True,
        "charset": "utf8mb4",
    }


@pytest.fixture(scope="session")
def _schema():
    with pymysql.connect(**_mysql_kwargs()) as conn, conn.cursor() as cursor:
        cursor.execute(f"DROP DATABASE IF EXISTS {TEST_DB}")
        cursor.execute(f"CREATE DATABASE {TEST_DB} CHARACTER SET utf8mb4 COLLATE utf8mb4_bin")
    schema_sql = (Path(__file__).resolve().parent.parent / "schema.sql").read_text(encoding="utf-8")
    with pymysql.connect(**{**_mysql_kwargs(), "database": TEST_DB}) as conn, conn.cursor() as cursor:
        cursor.execute(schema_sql)
    yield
    with pymysql.connect(**_mysql_kwargs()) as conn, conn.cursor() as cursor:
        cursor.execute(f"DROP DATABASE IF EXISTS {TEST_DB}")


@pytest.fixture
def db(_schema):
    """每个测试一张空表；直接暴露连接供测试种数据。"""
    conn = pymysql.connect(**{**_mysql_kwargs(), "database": TEST_DB})
    with conn.cursor() as cursor:
        cursor.execute("TRUNCATE TABLE inbox_items")
    yield conn
    conn.close()


@pytest.fixture
def client(db, monkeypatch):
    for key, value in {
        "MYSQL_HOST": os.environ.get("MINIDESK_TEST_MYSQL_HOST", "127.0.0.1"),
        "MYSQL_PORT": os.environ.get("MINIDESK_TEST_MYSQL_PORT", "3306"),
        "MYSQL_USER": os.environ.get("MINIDESK_TEST_MYSQL_USER", "root"),
        "MYSQL_PASSWORD": os.environ.get("MINIDESK_TEST_MYSQL_PASSWORD", ""),
        "MYSQL_DB": TEST_DB,
        "ALLOWED_ORIGINS": f"{ORIGIN},http://localhost:5173",
    }.items():
        monkeypatch.setenv(key, value)
    from app import create_app

    application = create_app()
    application.config["TESTING"] = True
    return application.test_client()
