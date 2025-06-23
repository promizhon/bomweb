# AGGIORNAMENTO main.py per supportare i 3 tipi di chat

from fastapi import FastAPI, Request, Depends
from fastapi.templating import Jinja2Templates
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import RedirectResponse, JSONResponse
from sqlalchemy.orm import Session
from sqlalchemy import text
from datetime import datetime, timedelta, date
import json

from database_config import init_db, APP_MODE, get_db
from ordini_materiale_articoli import router as materiali_router
from impostazioni import router as impostazioni_router
from ordini_servizi import router as servizi_router
# Importa il nuovo router per ordini_servizi_ge
from ordini_servizi_ge import router as servizi_ge_router
from auth import router as auth_router
from fastapi.responses import FileResponse
from typing import Optional
import pandas as pd
import tempfile
import os

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

templates = Jinja2Templates(directory="templates")
app.mount("/static", StaticFiles(directory="static"), name="static")

init_db()

@app.middleware("http")
async def aggiorna_accesso_middleware(request: Request, call_next):
    return await call_next(request)

app.include_router(materiali_router)
app.include_router(impostazioni_router)
app.include_router(auth_router)
app.include_router(servizi_router)
# Includi il nuovo router nell'applicazione
app.include_router(servizi_ge_router)

@app.get("/")
async def index(request: Request, db: Session = Depends(get_db)):
    session_cookie = request.cookies.get("session")
    username = None
    if session_cookie:
        try:
            session_data = json.loads(session_cookie)
            username = session_data.get("login")
        except Exception:
            username = None
    if not username:
        return RedirectResponse(url="/login")
    tre_minuti_fa = datetime.now() - timedelta(minutes=3)
    query = text("""
        SELECT login FROM utente_utenti 
        WHERE ultima_registrazione IS NOT NULL 
        AND ultima_registrazione >= :limite
        ORDER BY login
    """)
    utenti = db.execute(query, {"limite": tre_minuti_fa}).mappings().all()
    return templates.TemplateResponse("main.html", {
        "request": request,
        "is_local": APP_MODE == "LOCAL",
        "utenti_connessi": utenti,
        "username": username,
        "app_mode": APP_MODE  # Passa la modalità al template
    })


@app.get("/chat/messages/public")
async def get_messaggi_pubblici(db: Session = Depends(get_db)):
    today = date.today().isoformat()
    query = text("""
        SELECT id, mittente, messaggio, data, 
               DATE_FORMAT(data, '%H:%i') as ora
        FROM utenti_chat 
        WHERE tipo = 'pubblico' AND DATE(data) = :today
        ORDER BY data ASC, id ASC
    """)
    messages = db.execute(query, {"today": today}).mappings().all()

    formatted = []
    for msg in messages:
        d = msg['data']
        d_str = d.strftime('%d/%m') if isinstance(d, datetime) else datetime.strptime(d, '%Y-%m-%d').strftime('%d/%m')
        formatted.append({
            "id": msg["id"],
            "user": msg["mittente"],
            "chat": msg["messaggio"],
            "date": d_str,
            "time": msg.get("ora", "")
        })
    return JSONResponse(formatted)

@app.post("/chat/send/public")
async def invia_messaggio_pubblico(request: Request, db: Session = Depends(get_db)):
    try:
        data = await request.json()
        messaggio = data.get("message", "")
        user = request.cookies.get("session", "Anonimo")
        now = datetime.now()

        db.execute(text("""
            INSERT INTO utenti_chat (mittente, tipo, messaggio, data)
            VALUES (:user, 'pubblico', :messaggio, :data)
        """), {"user": user, "messaggio": messaggio, "data": now})
        db.commit()

        return JSONResponse({"status": "ok"})
    except Exception as e:
        return JSONResponse({"error": str(e)}, status_code=500)

@app.delete("/chat/delete/{id}")
async def delete_message(id: int, request: Request, db: Session = Depends(get_db)):
    user = request.cookies.get("session", "")
    msg = db.execute(text("SELECT mittente FROM utenti_chat WHERE id = :id"), {"id": id}).fetchone()
    if msg and msg[0] == user:
        db.execute(text("DELETE FROM utenti_chat WHERE id = :id"), {"id": id})
        db.commit()
        return JSONResponse({"deleted": True})
    return JSONResponse({"deleted": False}, status_code=403)

@app.get("/api/utenti-online")
async def utenti_online_api(db: Session = Depends(get_db)):
    tre_minuti_fa = datetime.now() - timedelta(minutes=3)
    query = text("""
        SELECT login FROM utente_utenti 
        WHERE ultima_registrazione IS NOT NULL 
        AND ultima_registrazione >= :limite
        ORDER BY login
    """)
    utenti = db.execute(query, {"limite": tre_minuti_fa}).mappings().all()
    return JSONResponse([u["login"] for u in utenti])

@app.get("/ping")
async def ping(request: Request, db: Session = Depends(get_db)):
    username = request.cookies.get("session")
    if username:
        db.execute(
            text("UPDATE utente_utenti SET ultima_registrazione = :now WHERE login = :login"),
            {"now": datetime.now(), "login": username}
        )
        db.commit()
    return JSONResponse({"status": "ok"})

@app.get("/chat/messages/gruppo")
async def chat_messaggi_gruppo(request: Request, db: Session = Depends(get_db)):
    username = request.cookies.get("session")
    if not username:
        return JSONResponse([])

    # Ottieni il ruolo dell'utente (che useremo come gruppo)
    row = db.execute(text("SELECT ruolo_id FROM utente_utenti WHERE login = :login"), {"login": username}).fetchone()
    if not row:
        return JSONResponse([])

    ruolo_id = row[0]
    today = date.today().isoformat()

    # Amministratori (es: ruolo_id = 1 o 2) → vedono tutto
    if ruolo_id in (1, 2):
        query = text("""
            SELECT mittente, gruppo, messaggio, data, 
                   DATE_FORMAT(data, '%H:%i') as ora 
            FROM utenti_chat
            WHERE tipo = 'gruppo' AND DATE(data) = :oggi
            ORDER BY data ASC
        """)
        results = db.execute(query, {"oggi": today}).mappings().all()
    else:
        # Altri utenti → solo messaggi del loro gruppo (ruolo)
        query = text("""
            SELECT mittente, gruppo, messaggio, data,
                   DATE_FORMAT(data, '%H:%i') as ora 
            FROM utenti_chat
            WHERE tipo = 'gruppo' AND gruppo = :gruppo AND DATE(data) = :oggi
            ORDER BY data ASC
        """)
        results = db.execute(query, {"gruppo": str(ruolo_id), "oggi": today}).mappings().all()

    messaggi = []
    for r in results:
        d = r["data"]
        messaggi.append({
            "user": r["mittente"],
            "gruppo": r["gruppo"],
            "chat": r["messaggio"],
            "date": d.strftime('%d/%m') if isinstance(d, datetime) else "",
            "time": r.get("ora", "")
        })

    return JSONResponse(messaggi)

@app.post("/chat/send/gruppo")
async def invia_messaggio_gruppo(request: Request, db: Session = Depends(get_db)):
    try:
        username = request.cookies.get("session", "")
        data = await request.json()
        messaggio = data.get("message", "")

        # Recupera il ruolo/gruppo corretto dell'utente
        row = db.execute(text("SELECT ruolo_id FROM utente_utenti WHERE login = :login"), {"login": username}).fetchone()
        if not row:
            return JSONResponse({"error": "Ruolo non trovato"}, status_code=400)

        gruppo = str(row[0])
        now = datetime.now()

        query = text("""
            INSERT INTO utenti_chat (mittente, destinatario, gruppo, tipo, messaggio, data)
            VALUES (:mittente, NULL, :gruppo, 'gruppo', :messaggio, :data)
        """)
        db.execute(query, {
            "mittente": username,
            "gruppo": gruppo,
            "messaggio": messaggio,
            "data": now
        })
        db.commit()
        return JSONResponse({"status": "ok"})

    except Exception as e:
        print("[ERRORE chat/send/gruppo]", e)
        return JSONResponse({"error": str(e)}, status_code=500)


@app.get("/api/mio-id")
async def get_mio_id(request: Request, db: Session = Depends(get_db)):
    username = request.cookies.get("session")
    result = db.execute(text("SELECT id FROM utente_utenti WHERE login = :login"), {"login": username}).fetchone()
    if result:
        return {"id": result[0]}
    return {"id": None}
