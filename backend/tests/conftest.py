import os
import sys
import pytest
from fastapi.testclient import TestClient

# Ensure backend directory is on sys.path
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from app.main import app
from app.db.database import get_db


class MockDB:
    """Mock DB session for testing API endpoints when live database is unavailable."""
    def execute(self, statement):
        class ScalarResult:
            def scalar(self):
                stmt_str = str(statement).lower()
                if "vector" in stmt_str:
                    return "vector"
                return 1
        return ScalarResult()

    def close(self):
        pass


@pytest.fixture
def mock_db_session():
    mock = MockDB()
    yield mock


@pytest.fixture
def client(mock_db_session):
    def override_get_db():
        yield mock_db_session

    app.dependency_overrides[get_db] = override_get_db
    with TestClient(app) as test_client:
        yield test_client
    app.dependency_overrides.clear()
