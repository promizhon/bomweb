from fastapi import APIRouter, Request, Depends
from fastapi.templating import Jinja2Templates
from fastapi.responses import RedirectResponse, JSONResponse
from database_config import APP_MODE, get_db
from sqlalchemy.orm import Session
from sqlalchemy import select

# Modello per permessi utente-tema
from sqlalchemy import Column, Integer, String
from database_config import Base

router = APIRouter()
templates = Jinja2Templates(directory="templates")

class UtenteUtentiPermessi(Base):
    __tablename__ = "utente_utenti_permessi"
    utente_id = Column(Integer, primary_key=True)
    tema = Column(String(32))

@router.get("/impostazioni")
async def impostazioni(request: Request):
    session_cookie = request.cookies.get("session")
    username = None
    if session_cookie:
        try:
            import json
            session_data = json.loads(session_cookie)
            username = session_data.get("login")
        except Exception:
            username = None
    if not username:
        return RedirectResponse("/login")
    return templates.TemplateResponse("impostazioni.html", {"request": request, "username": username, "app_mode": APP_MODE})

@router.get("/impostazioni/api/tema")
async def get_tema_utente(request: Request, db: Session = Depends(get_db)):
    session_cookie = request.cookies.get("session")
    import json
    if not session_cookie:
        return JSONResponse({"tema": "light"})
    user_id = json.loads(session_cookie).get("id")
    if not user_id:
        return JSONResponse({"tema": "light"})
    row = db.query(UtenteUtentiPermessi).filter_by(utente_id=user_id).first()
    return JSONResponse({"tema": row.tema if row and row.tema else "light"})

@router.post("/impostazioni/api/tema")
async def set_tema_utente(request: Request, db: Session = Depends(get_db)):
    session_cookie = request.cookies.get("session")
    import json
    if not session_cookie:
        return JSONResponse({"ok": False})
    user_id = json.loads(session_cookie).get("id")
    if not user_id:
        return JSONResponse({"ok": False})
    data = await request.json()
    tema = data.get("tema")
    if not tema:
        return JSONResponse({"ok": False})
    row = db.query(UtenteUtentiPermessi).filter_by(utente_id=user_id).first()
    if not row:
        row = UtenteUtentiPermessi(utente_id=user_id, tema=tema)
        db.add(row)
    else:
        row.tema = tema
    db.commit()
    return JSONResponse({"ok": True})
