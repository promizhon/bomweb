from fastapi import APIRouter, Request, Depends
from fastapi.templating import Jinja2Templates
from database_config import APP_MODE

router = APIRouter()
templates = Jinja2Templates(directory="templates")

@router.get("/protocolli", include_in_schema=False)
async def protocolli_page(request: Request):
    session_cookie = request.cookies.get("session")
    username = None
    if session_cookie:
        try:
            import json
            session_data = json.loads(session_cookie)
            username = session_data.get("login")
        except Exception:
            username = None
    return templates.TemplateResponse("protocolli.html", {"request": request, "username": username, "app_mode": APP_MODE}) 