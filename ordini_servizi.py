import json
import traceback
from fastapi import APIRouter, Depends, Request, HTTPException, Query
from fastapi.responses import JSONResponse, StreamingResponse
from fastapi.templating import Jinja2Templates
from sqlalchemy.orm import Session
from sqlalchemy import text, inspect # Mantenuto per potenziale uso futuro o altre route
from database_config import get_db
from urllib.parse import unquote # Mantenuto per potenziale uso futuro
import pandas as pd # Mantenuto per potenziale uso futuro
import io # Mantenuto per potenziale uso futuro
from datetime import datetime # Mantenuto per potenziale uso futuro
from typing import Dict, List, Any, Optional # Mantenuto per potenziale uso futuro

router = APIRouter()
templates = Jinja2Templates(directory="templates")

# La costante TABLE_NAME è stata rimossa poiché specifica della logica GE.
# Le classi FilterManager, QueryBuilder, DataManager sono state spostate in ordini_servizi_ge.py
# Tutte le route relative a /ordini_servizi/ge e /api/servizi/ge/ sono state spostate.

@router.get("/ordini_servizi", include_in_schema=False)
async def ordini_servizi_page(request: Request):
    """
    Pagina principale per gli ordini di servizi.
    Questa route è stata mantenuta da ordini_servizi.py originale.
    """
    # Assumendo che l'username per il template venga ancora da qui
    username = request.cookies.get("session")
    return templates.TemplateResponse("ordini_servizi.html", {"request": request, "username": username})

# Se ci fossero altre route o logiche non relative a "gestione gs" (GE)
# originariamente in ordini_servizi.py, andrebbero mantenute qui.
# Al momento, solo la route principale "/ordini_servizi" è rimasta.

# Esempio di come potrebbe essere un'altra ipotetica route non-GE:
# @router.get("/api/servizi/altre_statistiche")
# async def get_altre_statistiche_servizi(db: Session = Depends(get_db)):
#     try:
#         # Logica per recuperare altre statistiche
#         query = text("SELECT COUNT(*) FROM un_altra_tabella_servizi")
#         count = db.execute(query).scalar_one_or_none()
#         return {"total_other_services": count or 0}
#     except Exception as e:
#         traceback.print_exc()
#         raise HTTPException(status_code=500, detail="Errore nel recuperare altre statistiche.")

# Nota: Se questo file dovesse diventare completamente vuoto (a parte gli import e il router),
# e la route "/ordini_servizi" fosse gestita altrove o non più necessaria da questo specifico router,
# si potrebbe considerare di rimuovere l'inclusione di questo router in main.py.
# Per ora, lo mantengo con la route base.
