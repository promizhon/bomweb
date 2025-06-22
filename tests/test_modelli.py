from datetime import datetime
from models.utente import Utente
from models.zucchetti import Zucchetti_Articoli
from models.carrefour_log import CarrefourLog


def test_utente_creation():
    user = Utente(login='test', password='pw')
    assert user.login == 'test'
    assert user.password == 'pw'


def test_zucchetti_articoli_creation():
    art = Zucchetti_Articoli(
        KAIDGUID='1',
        KACODRIC='A',
        ARCODART='B',
        ARDESART='C',
        DataAcquisto='2023-01-01',
        GiacenzaTorino=1.0,
        GiacenzaMilano=2.0,
        GiacenzaGenova=3.0,
        GiacenzaBologna=4.0,
        GiacenzaRoma=5.0,
        Importo=10.0
    )
    assert art.KAIDGUID == '1'
    assert art.KACODRIC == 'A'
    assert art.ARCODART == 'B'
    assert art.ARDESART == 'C'
    assert art.DataAcquisto == '2023-01-01'
    assert art.GiacenzaTorino == 1.0
    assert art.GiacenzaMilano == 2.0
    assert art.GiacenzaGenova == 3.0
    assert art.GiacenzaBologna == 4.0
    assert art.GiacenzaRoma == 5.0
    assert art.Importo == 10.0


def test_carrefour_log_creation():
    log = CarrefourLog(
        utente='tester',
        campo_old='old',
        campo_new='new',
        data=datetime(2024, 1, 1),
        id_tabella=1,
        colonna='col'
    )
    assert log.utente == 'tester'
    assert log.campo_old == 'old'
    assert log.campo_new == 'new'
    assert log.id_tabella == 1
    assert log.colonna == 'col'

