from fastapi import APIRouter, Request
from fastapi.templating import Jinja2Templates
from fastapi.responses import RedirectResponse

router = APIRouter()
templates = Jinja2Templates(directory="templates")

@router.get("/impostazioni")
async def impostazioni(request: Request):
    username = request.cookies.get("session")
    if not username:
        return RedirectResponse("/login")
    return templates.TemplateResponse("impostazioni.html", {"request": request, "username": username})
