import pytest
from fastapi.testclient import TestClient
from ordini_materiale_articoli import router, get_db
from fastapi import FastAPI, Depends
from ordini_servizi import router as servizi_router
from ordini_servizi_ge import router as servizi_ge_router

app = FastAPI()
app.include_router(router)
app.include_router(servizi_router)
app.include_router(servizi_ge_router)

class DummyQuery:
    def __init__(self):
        self.filters = []
    def filter(self, *args, **kwargs):
        return self
    def filter_by(self, **kwargs):
        return self
    def order_by(self, *args, **kwargs):
        return self
    def offset(self, x):
        return self
    def limit(self, x):
        return self
    def all(self):

        class Item:
            KAIDGUID = '1'
            KACODRIC = 'A'
            ARCODART = 'B'
            ARDESART = 'C'
            GiacenzaTorino = 1
            GiacenzaMilano = 2
            GiacenzaGenova = 3
            GiacenzaBologna = 4
            GiacenzaRoma = 5
            Importo = 10
            Sconto = 0

        return [Item()]
    def count(self):
        return 1
    def scalar(self):
        return 1

class DummySession:
    def query(self, *args, **kwargs):
        return DummyQuery()

def override_get_db():
    yield DummySession()

app.dependency_overrides[get_db] = override_get_db

def test_api_materiali_search():
    client = TestClient(app)
    payload = {
        "draw": 1,
        "start": 0,
        "length": 1,
        "codice": "A",
        "codicenet": "B",
        "descrizione": "C",
        "year": "2023",
        "order": []
    }
    response = client.post("/api/materiali/search", json=payload)
    assert response.status_code == 200
    data = response.json()
    assert "data" in data
    assert isinstance(data["data"], list)
    assert data["data"][0]["Importo"] == 9.0


def test_get_servizi_months():
    client = TestClient(app)
    response = client.get("/api/servizi/ge/months")
    assert response.status_code == 200
    months = response.json()
    assert isinstance(months, list)
    assert len(months) == 13
    assert "TUTTO" in months
