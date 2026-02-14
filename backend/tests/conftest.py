import os
import sys
from pathlib import Path

# Ensure FastAPI app settings load in a predictable way during tests.
# IMPORTANT: these must be set before importing any app modules that import Settings.
os.environ.setdefault("ENV", "test")
os.environ.setdefault("DEBUG", "false")
os.environ.setdefault("APP_NAME", "Loja Platform API (tests)")
os.environ.setdefault("JWT_SECRET_KEY", "test-secret")
os.environ.setdefault("JWT_ALGORITHM", "HS256")
os.environ.setdefault("ACCESS_TOKEN_EXPIRE_MINUTES", "60")

# The production engine/session are overridden in tests, but Settings requires DATABASE_URL.
os.environ.setdefault("DATABASE_URL", "sqlite+pysqlite:///./_unused_tests.db")

# Ensure `backend/` is on sys.path so imports like `from app...` work
# regardless of how pytest is invoked.
BACKEND_ROOT = Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))


import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool


@pytest.fixture(scope="session")
def test_engine():
    # Single in-memory SQLite database shared across sessions/threads.
    engine = create_engine(
        "sqlite+pysqlite:///:memory:",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
        future=True,
    )

    # Import models to register mappers before create_all.
    from app.db.base import Base
    import app.models  # noqa: F401

    Base.metadata.create_all(bind=engine)
    return engine


@pytest.fixture()
def db_session(test_engine):
    from app.db.base import Base

    # Hard reset between tests to avoid state leakage across suites.
    Base.metadata.drop_all(bind=test_engine)
    Base.metadata.create_all(bind=test_engine)

    TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=test_engine, future=True)
    db = TestingSessionLocal()
    try:
        yield db
    finally:
        db.close()


@pytest.fixture()
def client(test_engine):
    from app.main import app
    from app.core.deps import get_db

    TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=test_engine, future=True)

    def override_get_db():
        db = TestingSessionLocal()
        try:
            yield db
        finally:
            db.close()

    app.dependency_overrides[get_db] = override_get_db
    with TestClient(app) as c:
        yield c
    app.dependency_overrides.clear()
