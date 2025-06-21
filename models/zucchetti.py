from sqlalchemy import Column, String, Integer, Float
from database_config import Base

class Zucchetti_Articoli(Base):
    __tablename__ = 'zucchetti_articoli'

    KAIDGUID = Column(String, primary_key=True)
    KACODRIC = Column(String)
    ARCODART = Column(String)
    ARDESART = Column(String)
    DataAcquisto = Column(String)  # Change to String to match VARCHAR type
    GiacenzaTorino = Column(Float)
    GiacenzaMilano = Column(Float)
    GiacenzaGenova = Column(Float)
    GiacenzaBologna = Column(Float)
    GiacenzaRoma = Column(Float)
    Importo = Column(Float)  # Nuova colonna per l'importo