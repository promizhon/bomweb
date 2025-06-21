from fastapi import APIRouter, Request, Form, Depends, Response, HTTPException
from fastapi.templating import Jinja2Templates
from starlette.responses import RedirectResponse
from sqlalchemy.orm import Session
from database_config import get_db
from models.utente import Utente
from uuid import uuid4

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

    response.set_cookie(key="session", value=username, max_age=60*60*24*30)  # ✅ cookie coerente
    return response

@router.get("/logout")
async def logout():
    response = RedirectResponse(url="/login", status_code=302)
    response.delete_cookie("session")
    return response
