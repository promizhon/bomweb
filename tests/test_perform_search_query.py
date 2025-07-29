import pytest
from ordini_materiale_articoli import _perform_search_query
from models.zucchetti_articoli import Zucchetti_Articoli
from unittest.mock import MagicMock

class DummyQuery:
    def __init__(self):
        self.filters = []
    def filter(self, *args, **kwargs):
        self.filters.append((args, kwargs))
        return self
    def filter_by(self, **kwargs):
        self.filters.append(((), kwargs))
        return self

class DummySession:
    def query(self, model):
        return DummyQuery()

class DummyArticolo:
    KAIDGUID = 'id'
    KACODRIC = 'codice'
    ARCODART = 'codicenet'
    ARDESART = 'descrizione'
    DataAcquisto = '2023-01-01'


def test_perform_search_query_filters():
    db = DummySession()
    query = _perform_search_query(db, codice='A', codicenet='B', descrizione='C D', year='2023')
    assert len(query.filters) == 5
    assert 'EXTRACT' in str(query.filters[0][0][0])

