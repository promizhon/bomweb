import os
from dotenv import load_dotenv

# Carica SEMPRE il file .env
load_dotenv()

import os

# Leggi e normalizza la modalità applicativa
APP_MODE = os.getenv("APP_MODE", "LOCAL").strip().upper()

# Mappa modalità → variabile d'ambiente corrispondente
db_url_env_map = {
    "LOCAL": "SQLALCHEMY_DATABASE_URL_LOCAL",
    "REMOTO": "SQLALCHEMY_DATABASE_URL_REMOTO",
    "CASA": "SQLALCHEMY_DATABASE_URL_CASA",
    "META": "SQLALCHEMY_DATABASE_URL_META",
}

# Recupera la variabile d'ambiente corretta
env_var_name = db_url_env_map.get(APP_MODE)

if not env_var_name:
    raise RuntimeError(f"APP_MODE non valido: {APP_MODE}")

SQLALCHEMY_DATABASE_URL = os.getenv(env_var_name)

if not SQLALCHEMY_DATABASE_URL:
    raise RuntimeError(f"La variabile {env_var_name} non è definita nel file .env!")



# Setup SQLAlchemy
from sqlalchemy import create_engine
from sqlalchemy.orm import declarative_base
from sqlalchemy.orm import sessionmaker

engine = create_engine(SQLALCHEMY_DATABASE_URL)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()

def init_db():
    """Crea tutte le tabelle nel database."""
    Base.metadata.create_all(bind=engine)

def get_db():
    """Fornisce una sessione del database."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

# Debug
print(f"Modalità attiva: {APP_MODE}")  # Opzionale, per debug

__all__ = ['Base', 'engine', 'SessionLocal', 'init_db', 'get_db', 'APP_MODE']
