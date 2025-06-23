from fastapi import APIRouter, Request, Form, Depends, Response, HTTPException
from fastapi.templating import Jinja2Templates
from starlette.responses import RedirectResponse
from sqlalchemy.orm import Session
from database_config import get_db
from models.utente import Utente
from uuid import uuid4
import json

router = APIRouter()
templates = Jinja2Templates(directory="templates")

@router.get("/login")
async def login_page(request: Request):
    return templates.TemplateResponse("login.html", {"request": request, "error": None})

@router.post("/login")
async def login(
    request: Request,
    response: Response,
    username: str = Form(...),
    password: str = Form(...),
    db: Session = Depends(get_db)
):
    username = username.lower()  # ✅ forza lowercase per coerenza

    user = db.query(Utente).filter_by(login=username).first()
    if not user:
        return templates.TemplateResponse(
            "login.html", 
            {
                "request": request, 
                "error": "Username non trovato",
                "username": username
            }
        )
    
    if str(user.password) != str(password):
        return templates.TemplateResponse(
            "login.html", 
            {
                "request": request, 
                "error": "Password non corretta",
                "username": username
            }
        )

    response = RedirectResponse(url=f"/?_={uuid4()}", status_code=302)

    # Salva nel cookie un JSON con login, ruolo_id e id (se disponibile)
    session_data = {"login": user.login, "ruolo_id": user.ruolo_id}
    if hasattr(user, "id"):
        session_data["id"] = user.id
    response.set_cookie(key="session", value=json.dumps(session_data), max_age=60*60*24*30)
    return response

@router.get("/logout")
async def logout():
    response = RedirectResponse(url="/login", status_code=302)
    response.delete_cookie("session")
    return response
