from sqlalchemy import Column, String, DateTime
from database_config import Base
from datetime import datetime

class Utente(Base):
    __tablename__ = "utente_utenti"

    login = Column(String(50), primary_key=True, index=True)
    password = Column(String(100))
    ultima_registrazione = Column(DateTime, default=datetime.utcnow)
