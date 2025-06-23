from sqlalchemy import Column, String, DateTime, Integer, Text
from database_config import Base
from datetime import datetime

class Utente(Base):
    __tablename__ = "utente_utenti"

    id = Column(Integer, primary_key=True, autoincrement=True)
    login = Column(String(50), index=True)
    password = Column(String(100))
    ultima_registrazione = Column(DateTime, default=datetime.utcnow)
    ruolo_id = Column(Integer)

class UtenteRuoliPermessi(Base):
    __tablename__ = "utente_ruoli_permessi"

    ruolo_id = Column(Integer, primary_key=True)
    colonne_ordini_servizio_ge = Column(Text)
