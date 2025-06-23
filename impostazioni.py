from fastapi import APIRouter, Request
from fastapi.templating import Jinja2Templates
from fastapi.responses import RedirectResponse
from database_config import APP_MODE

router = APIRouter()
templates = Jinja2Templates(directory="templates")

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
