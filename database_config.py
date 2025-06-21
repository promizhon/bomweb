import os
from dotenv import load_dotenv

# Controlla se il file .env esiste
env_file = ".env"
if os.path.exists(env_file):
    load_dotenv()
    print("DEBUG - File .env trovato, variabili caricate.")
    APP_MODE = os.getenv("APP_MODE", "LOCAL")
else:
    print("DEBUG - File .env NON trovato, forzando modalità REMOTE.")
    APP_MODE = "REMOTE"

# Credenziali database da variabili d'ambiente
DB_USER = os.getenv("DB_USER")
DB_PASSWORD = os.getenv("DB_PASSWORD")
DB_HOST = os.getenv("DB_HOST", "localhost")
DB_NAME = os.getenv("DB_NAME", "gestprev")

if not DB_USER or not DB_PASSWORD:
    raise RuntimeError("DB_USER e DB_PASSWORD devono essere impostate")

SQLALCHEMY_DATABASE_URL = f"mysql+pymysql://{DB_USER}:{DB_PASSWORD}@{DB_HOST}/{DB_NAME}"

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
