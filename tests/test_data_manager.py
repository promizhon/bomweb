import sys
import os
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

import pytest
from ordini_servizi import DataManager, FilterManager
from unittest.mock import MagicMock
from sqlalchemy.orm import declarative_base

class DummySession:
    def __init__(self):
        self.bind = object()  # qualsiasi oggetto diverso da None

    def execute(self, query, params=None):
        class Result:
            def scalar(self):
                return 10
            def fetchall(self):
                return [MagicMock(_mapping={"ID": 1, "col1": "a"}), MagicMock(_mapping={"ID": 2, "col1": "b"})]
        return Result()

    def commit(self):
        pass


def test_get_total_records(monkeypatch):
    # Mocka _get_column_names per evitare l'ispezione reale
    monkeypatch.setattr(FilterManager, "_get_column_names", lambda self: ["ID", "col1"])
    db = DummySession()
    manager = DataManager(db, 'dummy_table')
    result = manager.get_total_records()
    assert isinstance(result, int)
    assert result == 10

def test_get_filtered_data(monkeypatch):
    monkeypatch.setattr(FilterManager, "_get_column_names", lambda self: ["ID", "col1"])
    db = DummySession()
    manager = DataManager(db, 'dummy_table')
    params = {
        "draw": 1,
        "start": 0,
        "length": 2,
        "search": {"value": ""},
        "order": [{"column": 0, "dir": "asc"}],
        "columns": [{"search": {"value": ""}}, {"search": {"value": ""}}]
    }
    result = manager.get_filtered_data(params)
    assert isinstance(result, dict)
    assert "data" in result
    assert isinstance(result["data"], list)

def test_get_export_data(monkeypatch):
    monkeypatch.setattr(FilterManager, "_get_column_names", lambda self: ["ID", "col1"])
    db = DummySession()
    manager = DataManager(db, 'dummy_table')
    result = manager.get_export_data(month="", global_search="", column_filters="")
    assert isinstance(result, list)
    assert all(isinstance(row, dict) for row in result)

def test_get_filtered_data_error(monkeypatch):
    monkeypatch.setattr(FilterManager, "_get_column_names", lambda self: ["ID", "col1"])
    db = DummySession()
    manager = DataManager(db, 'dummy_table')
    # Forza un errore nel metodo execute
    db.execute = lambda *a, **kw: (_ for _ in ()).throw(Exception("Errore finto"))
    params = {
        "draw": 1,
        "start": 0,
        "length": 2,
        "search": {"value": ""},
        "order": [{"column": 0, "dir": "asc"}],
        "columns": [{"search": {"value": ""}}, {"search": {"value": ""}}]
    }
    result = manager.get_filtered_data(params)
    assert "error" in result 
