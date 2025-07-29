# from flask import render_template
import pandas as pd
from datetime import datetime
import os
from sqlalchemy import extract, func
from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import JSONResponse, FileResponse
from sqlalchemy.orm import Session
from pydantic import BaseModel
from database_config import get_db, APP_MODE
from models.zucchetti_articoli import Zucchetti_Articoli
from typing import Optional, List
from fastapi.templating import Jinja2Templates
import json

router = APIRouter()
templates = Jinja2Templates(directory="templates")

class SearchRequest(BaseModel):
    draw: int
    start: int
    length: int
    codice: Optional[str] = None
    codicenet: Optional[str] = None
    descrizione: Optional[str] = None
    year: Optional[str] = None

def _perform_search_query(
    db: Session,
    codice: Optional[str] = None,
    codicenet: Optional[str] = None,
    descrizione: Optional[str] = None,
    year: Optional[str] = None
):
    """Esegue la query di ricerca con i filtri forniti."""
    query = db.query(Zucchetti_Articoli)
    if year and year.lower() != 'all':
        query = query.filter(extract('year', Zucchetti_Articoli.DataAcquisto) == int(year))
    if codice:
        query = query.filter(Zucchetti_Articoli.KACODRIC.ilike(f"%{codice}%"))
    if codicenet:
        query = query.filter(Zucchetti_Articoli.ARCODART.ilike(f"%{codicenet}%"))
    if descrizione:
        search_words = descrizione.split()
        for word in search_words:
            query = query.filter(Zucchetti_Articoli.ARDESART.ilike(f"%{word}%"))
    return query

@router.post("/api/materiali/search")
async def get_data(request: Request, db: Session = Depends(get_db)):
    try:
        req_json = await request.json()

        has_filters = any([
            req_json.get("codice"),
            req_json.get("codicenet"),
            req_json.get("descrizione"),
            req_json.get("year") and req_json.get("year").lower() != 'all'
        ])

        total_records = db.query(func.count(Zucchetti_Articoli.KAIDGUID)).scalar()

        if not has_filters and not req_json.get("order"):
            return {
                "draw": req_json.get("draw", 0),
                "recordsTotal": total_records,
                "recordsFiltered": 0,
                "data": [],
            }

        # Ricostruisci la query con i filtri
        query = _perform_search_query(
            db,
            codice=req_json.get("codice"),
            codicenet=req_json.get("codicenet"),
            descrizione=req_json.get("descrizione"),
            year=req_json.get("year")
        )

        # === ORDINAMENTO ===
        column_map = {
            2: Zucchetti_Articoli.KACODRIC,
            3: Zucchetti_Articoli.ARCODART,
            4: Zucchetti_Articoli.ARDESART,
            5: Zucchetti_Articoli.GiacenzaTorino,
            6: Zucchetti_Articoli.GiacenzaMilano,
            7: Zucchetti_Articoli.GiacenzaGenova,
            8: Zucchetti_Articoli.GiacenzaBologna,
            9: Zucchetti_Articoli.GiacenzaRoma,
            10: Zucchetti_Articoli.Importo
        }

        order = req_json.get("order", [])
        if order:
            for rule in order:
                col_idx = int(rule.get("column", -1))
                order_dir = rule.get("dir", "asc")
                if col_idx in column_map:
                    col = column_map[col_idx]
                    query = query.order_by(col.asc() if order_dir == "asc" else col.desc())
        else:
            # Ordinamento di default se l'utente non ha fatto clic su nessuna intestazione
            query = query.order_by(
                Zucchetti_Articoli.GiacenzaTorino.desc(),
                Zucchetti_Articoli.GiacenzaMilano.desc(),
                Zucchetti_Articoli.GiacenzaGenova.desc(),
                Zucchetti_Articoli.GiacenzaBologna.desc(),
                Zucchetti_Articoli.GiacenzaRoma.desc()
            )

        total_filtered = query.count()
        items = query.offset(req_json.get("start", 0)).limit(req_json.get("length", 10)).all()

        data = [{
            'id': str(item.KAIDGUID),
            'codice': item.KACODRIC or '',
            'codicenet': item.ARCODART or '',
            'descrizione': item.ARDESART or '',
            'Qta Torino': round(float(item.GiacenzaTorino or 0), 2),
            'Qta Milano': round(float(item.GiacenzaMilano or 0), 2),
            'Qta Genova': round(float(item.GiacenzaGenova or 0), 2),
            'Qta Bologna': round(float(item.GiacenzaBologna or 0), 2),
            'Qta Roma': round(float(item.GiacenzaRoma or 0), 2),
            'Importo': round(
                float(item.Importo or 0)
                * (1 - float(getattr(item, 'Sconto', 0) or 0) / 100),
                2
            )
        } for item in items]

        return {
            "draw": req_json.get("draw", 0),
            "recordsTotal": total_records,
            "recordsFiltered": total_filtered,
            "data": data,
        }

    except Exception as e:
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))


from fastapi.responses import FileResponse
from datetime import datetime
import os
import pandas as pd

@router.get("/ordini_materiale/export")
async def export_data(
    db: Session = Depends(get_db),
    year: Optional[str] = None,
    codice: Optional[str] = None,
    codicenet: Optional[str] = None,
    descrizione: Optional[str] = None
):
    try:
        query = _perform_search_query(db, codice, codicenet, descrizione, year)
        items = query.all()

        data = [{
            'id': str(item.KAIDGUID),
            'codice': item.KACODRIC or '',
            'codicenet': item.ARCODART or '',
            'descrizione': item.ARDESART or '',
            'Qta Torino': round(float(item.GiacenzaTorino or 0), 2),
            'Qta Milano': round(float(item.GiacenzaMilano or 0), 2),
            'Qta Genova': round(float(item.GiacenzaGenova or 0), 2),
            'Qta Bologna': round(float(item.GiacenzaBologna or 0), 2),
            'Qta Roma': round(float(item.GiacenzaRoma or 0), 2),
            'Importo': round(
                float(item.Importo or 0)
                * (1 - float(getattr(item, 'Sconto', 0) or 0) / 100),
                2
            )
        } for item in items]

        df = pd.DataFrame(data)

        filename = f"ordini_materiale_{datetime.now().strftime('%Y-%m-%d_%H-%M-%S')}.xlsx"
        filepath = f"static/exports/{filename}"
        os.makedirs(os.path.dirname(filepath), exist_ok=True)

        with pd.ExcelWriter(filepath, engine='xlsxwriter') as writer:
            df.to_excel(writer, index=False, sheet_name="Materiali")
            workbook = writer.book
            worksheet = writer.sheets["Materiali"]

            # Formattazione header
            header_format = workbook.add_format({
                'bold': True,
                'bg_color': '#DDEBF7',
                'border': 1
            })
            
            # Formattazione numeri con due decimali
            number_format = workbook.add_format({
                'num_format': '#,##0.00'
            })

            # Formattazione valuta
            currency_format = workbook.add_format({
                'num_format': '€ #,##0.00'
            })

            for col_num, value in enumerate(df.columns.values):
                worksheet.write(0, col_num, value, header_format)
                # Applica la formattazione numerica alle colonne quantità
                if value in ['Qta Torino', 'Qta Milano', 'Qta Genova', 'Qta Bologna', 'Qta Roma']:
                    worksheet.set_column(col_num, col_num, None, number_format)
                # Applica la formattazione valuta alla colonna Importo
                elif value == 'Importo':
                    worksheet.set_column(col_num, col_num, None, currency_format)

            # Larghezza colonne auto
            for i, column in enumerate(df.columns):
                max_len = max(df[column].astype(str).map(len).max(), len(column)) + 2
                worksheet.set_column(i, i, max_len)

        return FileResponse(filepath, filename=filename)
    except Exception as e:
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/materiali")
async def pagina_materiali(request: Request):
    session_cookie = request.cookies.get("session")
    username = None
    if session_cookie:
        try:
            session_data = json.loads(session_cookie)
            username = session_data.get("login")
        except Exception:
            username = None
    if not username:
        from fastapi.responses import RedirectResponse
        return RedirectResponse("/login")
    return templates.TemplateResponse("materiali.html", {"request": request, "username": username, "app_mode": APP_MODE})

@router.get("/ordini_materiale")
async def ordini_materiale(request: Request, db: Session = Depends(get_db)):
    session_cookie = request.cookies.get("session")
    username = None
    if session_cookie:
        try:
            session_data = json.loads(session_cookie)
            username = session_data.get("login")
        except Exception:
            username = None
    if not username:
        from fastapi.responses import RedirectResponse
        return RedirectResponse("/login")
    return templates.TemplateResponse("ordini_materiale.html", {"request": request, "username": username, "app_mode": APP_MODE})

@router.get("/ordini_materiale/articoli")
async def materiali_articoli(request: Request, db: Session = Depends(get_db)):
    session_cookie = request.cookies.get("session")
    username = None
    if session_cookie:
        try:
            session_data = json.loads(session_cookie)
            username = session_data.get("login")
        except Exception:
            username = None
    if not username:
        from fastapi.responses import RedirectResponse
        return RedirectResponse("/login")
    return templates.TemplateResponse("ordini_materiale_articoli.html", {"request": request, "username": username, "app_mode": APP_MODE})

@router.get("/ordini_materiale/nuovo_ordine")
async def materiali_nuovo_ordine(request: Request, db: Session = Depends(get_db)):
    session_cookie = request.cookies.get("session")
    username = None
    if session_cookie:
        try:
            session_data = json.loads(session_cookie)
            username = session_data.get("login")
        except Exception:
            username = None
    if not username:
        from fastapi.responses import RedirectResponse
        return RedirectResponse("/login")
    return templates.TemplateResponse("ordini_materiale_nuovo_ordine.html", {"request": request, "username": username, "app_mode": APP_MODE})

@router.get("/ordini_materiale/ricerca_ordine")
async def materiali_ricerca_ordine(request: Request, db: Session = Depends(get_db)):
    session_cookie = request.cookies.get("session")
    username = None
    if session_cookie:
        try:
            session_data = json.loads(session_cookie)
            username = session_data.get("login")
        except Exception:
            username = None
    if not username:
        from fastapi.responses import RedirectResponse
        return RedirectResponse("/login")
    return templates.TemplateResponse("ordini_materiale_ricerca_ordine.html", {"request": request, "username": username, "app_mode": APP_MODE})
