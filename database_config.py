import os
import socket
from dotenv import load_dotenv

# Controlla se il file .env esiste
env_file = ".env"
if os.path.exists(env_file):
    load_dotenv()  # Carica le variabili da .env
    print("DEBUG - File .env trovato, variabili caricate.")
    APP_MODE = os.getenv("APP_MODE", "LOCAL")  # Se non definito, assume LOCAL
else:
    print("DEBUG - File .env NON trovato, forzando modalità REMOTE.")
    APP_MODE = "REMOTE"

# Configura il database in base all'ambiente
if APP_MODE == "LOCAL":
    SQLALCHEMY_DATABASE_URL = "mysql+pymysql://TestLocale:priviet78aA+-+@localhost:3306/gestprev"
else:
    SQLALCHEMY_DATABASE_URL = "mysql+pymysql://TestRemoto:priviet78aA+-+@192.168.1.99:3306/gestprev"

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
