from sqlalchemy import Column, Integer, String, DateTime
from datetime import datetime
from database_config import Base

class CarrefourLog(Base):
    __tablename__ = 'carrefour_log'

    id = Column(Integer, primary_key=True, autoincrement=True)
    utente = Column(String(50))
    campo_old = Column(String(255))
    campo_new = Column(String(255))
    data = Column(DateTime, default=datetime.utcnow)
    id_tabella = Column(Integer)
    colonna = Column(String(255))
