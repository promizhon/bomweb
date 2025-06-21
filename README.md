# bomweb

Gestione ordini materiali e servizi per ufficio tramite FastAPI e SQLAlchemy.

## Descrizione
Applicazione web per la gestione di ordini materiali e servizi, con interfaccia moderna, esportazione dati e autenticazione utenti.

## Requisiti
- Python 3.10+
- MySQL (o altro database compatibile)
- pip

## Installazione
1. Clona la repository:
   ```
   git clone <URL_DEL_REPO>
   cd bomweb
   ```
2. Installa le dipendenze:
   ```
   pip install -r requirements.txt
   ```
3. Imposta le variabili d'ambiente `DB_USER`, `DB_PASSWORD` e `DB_HOST` (opzionale
   `DB_NAME`) nel tuo ambiente o nel file `.env`.

## Avvio
Lancia il server FastAPI:
```
uvicorn main:app --reload
```
Accedi a [http://localhost:8000](http://localhost:8000) per usare l'applicazione.

## Testing
Per eseguire i test automatici:
```
python -m pytest
```

## Contribuire
- Apri una issue per segnalare bug o proporre miglioramenti.
- Invia una pull request per nuove funzionalità o fix.

---
Per domande o supporto, contatta il maintainer. 