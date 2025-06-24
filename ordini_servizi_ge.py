import traceback
from fastapi import APIRouter, Depends, Request, HTTPException, Query
from fastapi.responses import JSONResponse, StreamingResponse
from fastapi.templating import Jinja2Templates
from sqlalchemy.orm import Session
from sqlalchemy import text, inspect
from database_config import get_db
from urllib.parse import unquote
import pandas as pd
import io
from datetime import datetime
from typing import Dict, List, Any, Optional
import json

# Import per il logging
from models.carrefour_log import CarrefourLog
from models.utente import UtenteRuoliPermessi, Utente

router = APIRouter()
templates = Jinja2Templates(directory="templates")
TABLE_NAME = "carrefour_contabilizzazione_originale" # Come da conferma, questa è la tabella di riferimento

class FilterManager:
    def __init__(self, db: Session, table_name: str):
        self.db = db
        self.table_name = table_name
        self.column_names = self._get_column_names()

    def _get_column_names(self) -> List[str]:
        inspector = inspect(self.db.bind)
        return [col['name'] for col in inspector.get_columns(self.table_name)]

    def build_where_clause(self,
                          month_filter: Optional[str] = None,
                          search_value: Optional[str] = None,
                          column_searches: Optional[Dict[str, Any]] = None) -> tuple:
        where_clauses = []
        query_params = {}

        if month_filter and month_filter.strip().upper() != 'TUTTO':
            # Assumendo che MesePresentazione sia una colonna valida per TABLE_NAME
            where_clauses.append('UPPER(TRIM(`MesePresentazione`)) = :month_filter')
            query_params['month_filter'] = month_filter.strip().upper()

        if search_value:
            search_clauses = [f'UPPER(TRIM(CAST(`{col}` AS CHAR))) LIKE :search_value'
                            for col in self.column_names]
            where_clauses.append(f"({' OR '.join(search_clauses)})")
            query_params['search_value'] = f'%{search_value.upper()}%'

        if column_searches:
            for col_name, search_obj in column_searches.items():
                if col_name not in self.column_names:
                    continue

                val = search_obj.get('value') if isinstance(search_obj, dict) else search_obj
                is_regex = search_obj.get('regex', False) if isinstance(search_obj, dict) else False

                if not val:
                    continue

                param_name = f'col_filter_{col_name}'
                if is_regex and val.startswith('^') and val.endswith('$'):
                    exact_val = val[1:-1]
                    where_clauses.append(f'UPPER(TRIM(CAST(`{col_name}` AS CHAR))) = :{param_name}')
                    query_params[param_name] = exact_val.upper()
                else:
                    where_clauses.append(f'UPPER(TRIM(CAST(`{col_name}` AS CHAR))) LIKE :{param_name}')
                    query_params[param_name] = f'%{val.upper()}%'

        where_sql = " WHERE " + " AND ".join(where_clauses) if where_clauses else ""
        # Rimosso print per pulizia codice produzione
        # print(f"Generated WHERE clause: {where_sql}")
        # print(f"Query parameters: {query_params}")
        return where_sql, query_params

class QueryBuilder:
    def __init__(self, table_name: str):
        self.table_name = table_name
        self.base_query = f"SELECT * FROM `{self.table_name}`"

    def _build_where_clause(self, where_sql: str) -> str:
        return f"{self.base_query}{where_sql}"

    def build_count_query(self, where_sql: str) -> text:
        return text(f"SELECT COUNT(*) FROM `{self.table_name}`{where_sql}")

    def build_data_query(self, where_sql: str, order_column: str, order_dir: str,
                        limit: int, offset: int) -> text:
        base = self._build_where_clause(where_sql)
        if limit == -1: # Gestione per "tutti i record"
            return text(f"{base} ORDER BY `{order_column}` {order_dir}")
        else:
            return text(f"{base} ORDER BY `{order_column}` {order_dir} LIMIT :limit OFFSET :offset")

    def build_export_query(self, where_sql: str) -> text:
        return text(self._build_where_clause(where_sql))

    def build_unique_values_query(self, column: str, where_sql: str) -> text:
        return text(f"""
            SELECT DISTINCT
                CASE
                    WHEN `{column}` IS NULL THEN NULL
                    WHEN `{column}` = '' THEN NULL
                    ELSE UPPER(TRIM(CAST(`{column}` AS CHAR)))
                END as value
            FROM `{self.table_name}`
            {where_sql}
            HAVING value IS NOT NULL
            ORDER BY value
            LIMIT 200
        """) # Limite per performance

class DataManager:
    def __init__(self, db: Session, table_name: str):
        self.db = db
        self.table_name = table_name
        self.filter_manager = FilterManager(db, table_name)
        self.query_builder = QueryBuilder(table_name)

    def get_total_records(self) -> int:
        query = text(f"SELECT COUNT(*) FROM `{self.table_name}`")
        result = self.db.execute(query).scalar()
        return result if result is not None else 0


    def get_filtered_data(self, params: Dict[str, Any]) -> Dict[str, Any]:
        try:
            draw = params.get('draw', 1)
            start = int(params.get('start', 0))
            length = int(params.get('length', 10))
            search_value = params.get('search', {}).get('value')
            order_column_index = int(params.get('order', [{}])[0].get('column', 0))
            order_dir = params.get('order', [{}])[0].get('dir', 'asc')
            month_filter = params.get('month_filter', '').strip()
            rtc_filter = params.get('rtc_filter', '').strip() # Specifico per questo contesto?

            column_names = self.filter_manager.column_names
            if not column_names: # Caso tabella vuota o non esistente
                 return {
                    "draw": draw, "recordsTotal": 0, "recordsFiltered": 0, "data": [],
                    "error": "Impossibile recuperare i nomi delle colonne."
                }
            order_column_name = column_names[order_column_index] if order_column_index < len(column_names) else column_names[0]


            column_searches = {
                column_names[i]: params['columns'][i]['search']
                for i in range(len(column_names))
                if params.get('columns') and \
                   i < len(params['columns']) and \
                   params['columns'][i].get('search', {}).get('value')
            }

            if rtc_filter: # Assumendo che 'RTC' sia una colonna valida
                column_searches['RTC'] = {'value': rtc_filter, 'regex': True} # o come deve essere gestito

            where_sql, query_params = self.filter_manager.build_where_clause(
                month_filter=month_filter,
                search_value=search_value,
                column_searches=column_searches
            )

            total_records = self.get_total_records()
            count_query = self.query_builder.build_count_query(where_sql)
            records_filtered_result = self.db.execute(count_query, query_params).scalar()
            records_filtered = records_filtered_result if records_filtered_result is not None else 0


            data_query = self.query_builder.build_data_query(
                where_sql, order_column_name, order_dir, length, start
            )

            final_params = {**query_params}
            if length != -1: # Solo se length non è -1 (tutti i record)
                final_params['limit'] = length
                final_params['offset'] = start

            result = self.db.execute(data_query, final_params).fetchall()
            data = [dict(row._mapping) for row in result]

            return {
                "draw": draw,
                "recordsTotal": total_records,
                "recordsFiltered": records_filtered,
                "data": data,
            }
        except Exception as e:
            # print("!!! ERROR IN get_filtered_data !!!") # Usare un logger in produzione
            traceback.print_exc()
            return {
                "draw": params.get('draw', 1), "recordsTotal": 0, "recordsFiltered": 0, "data": [],
                "error": f"Errore Interno del Server: {str(e)}" # Non esporre dettagli dell'errore in produzione
            }

    def get_export_data(self, month: str, global_search: str, column_filters: str) -> List[Dict[str, Any]]:
        try:
            column_searches = {}
            if column_filters:
                try:
                    filters_dict = json.loads(unquote(column_filters))
                    column_searches = {
                        col: val for col, val in filters_dict.items()
                        if col in self.filter_manager.column_names and val # Valida colonna e valore
                    }
                except json.JSONDecodeError:
                    # print("Errore nel decodificare i filtri per colonna JSON.") # Usare logger
                    pass # Non bloccare l'esportazione per filtri malformati, ma loggare

            where_sql, query_params = self.filter_manager.build_where_clause(
                month_filter=month,
                search_value=global_search,
                column_searches=column_searches
            )

            query = self.query_builder.build_export_query(where_sql)
            result = self.db.execute(query, query_params).fetchall()
            return [dict(row._mapping) for row in result]
        except Exception as e:
            # print("!!! ERROR IN get_export_data !!!") # Usare logger
            traceback.print_exc()
            raise HTTPException(status_code=500, detail="Errore durante la preparazione dei dati per l'esportazione.")


# Routes spostate da ordini_servizi.py
@router.get("/ordini_servizi/ge", include_in_schema=False)
async def get_gestione_gs_tab(request: Request):
    # Assicurarsi che il template "ordini_servizi_ge.html" esista e sia corretto
    return templates.TemplateResponse("ordini_servizi_ge.html", {"request": request})

@router.get("/api/servizi/ge/columns")
async def get_gestione_gs_columns(request: Request, db: Session = Depends(get_db)):
    try:
        # Leggi il cookie di sessione come JSON
        session_cookie = request.cookies.get("session")
        if not session_cookie:
            return JSONResponse(status_code=401, content={"error": "Utente non autenticato"})
        try:
            session_data = json.loads(session_cookie)
            user_id = session_data.get("id")
            ruolo_id = session_data.get("ruolo_id")
        except Exception:
            return JSONResponse(status_code=401, content={"error": "Sessione non valida"})
        if not user_id:
            return JSONResponse(status_code=401, content={"error": "ID utente mancante nella sessione"})
        utente = db.query(Utente).filter_by(id=user_id).first()
        if not utente:
            return JSONResponse(status_code=404, content={"error": "Utente non trovato"})
        if not ruolo_id:
            return JSONResponse(status_code=400, content={"error": "Ruolo non trovato per l'utente"})
        permessi = db.query(UtenteRuoliPermessi).filter_by(ruolo_id=ruolo_id).first()
        colonne_nascoste = []
        if permessi and permessi.colonne_ordini_servizio_ge:
            colonne_nascoste = [c.strip() for c in permessi.colonne_ordini_servizio_ge.split(',') if c.strip()]
        filter_manager = FilterManager(db, TABLE_NAME)
        columns = filter_manager.column_names
        if not columns:
            return JSONResponse([])
        columns_out = [
            {"field": col, "title": col.replace('_', ' ').title(), "visible": col not in colonne_nascoste}
            for col in columns
        ]
        return JSONResponse(columns_out)
    except Exception as e:
        import sys
        import traceback
        exc_type, exc_value, exc_tb = sys.exc_info()
        tb_str = ''.join(traceback.format_exception(exc_type, exc_value, exc_tb))
        print("[DEBUG ERRORE /api/servizi/ge/columns]\n", tb_str)
        raise HTTPException(status_code=500, detail=f"Errore nel recupero delle colonne: {str(e)}\nTRACEBACK:\n{tb_str}")

@router.get("/api/servizi/ge/months")
async def get_presentation_months():
    # Questa route sembra generica, ma la lascio qui come da piano
    months = [
        "GENNAIO", "FEBBRAIO", "MARZO", "APRILE", "MAGGIO", "GIUGNO",
        "LUGLIO", "AGOSTO", "SETTEMBRE", "OTTOBRE", "NOVEMBRE", "DICEMBRE",
        "TUTTO"
    ]
    return JSONResponse(months)

@router.post("/api/servizi/ge/data")
async def get_gestione_gs_data(request: Request, db: Session = Depends(get_db)):
    try:
        params = await request.json()
    except json.JSONDecodeError:
        raise HTTPException(status_code=400, detail="Payload JSON malformato.")
    data_manager = DataManager(db, TABLE_NAME)
    return data_manager.get_filtered_data(params) # La gestione errori è interna

@router.post("/api/servizi/ge/update")
async def update_gestione_gs_data(request: Request, db: Session = Depends(get_db)):
    try:
        data = await request.json()
    except json.JSONDecodeError:
        raise HTTPException(status_code=400, detail="Payload JSON malformato per l'aggiornamento.")

    pk = data.get('pk')
    field = data.get('field')
    value = data.get('value') # value può essere None, '', 0 etc. quindi non check 'not value'

    if pk is None or field is None: # Manca pk o field
        raise HTTPException(status_code=400, detail="Parametri 'pk' e 'field' sono obbligatori.")

    filter_manager = FilterManager(db, TABLE_NAME) # Per validare 'field'
    if field not in filter_manager.column_names:
        raise HTTPException(status_code=400, detail=f"Campo '{field}' non valido.")

    # --- Inizio implementazione logging ---
    campo_old = None
    try:
        # 1. Recuperare il valore attuale del campo (campo_old)
        # Assumendo che la tabella abbia una colonna 'ID' come chiave primaria
        select_query = text(f"SELECT `{field}` FROM `{TABLE_NAME}` WHERE ID = :pk")
        result_old = db.execute(select_query, {'pk': pk}).fetchone()

        if result_old is None:
            raise HTTPException(status_code=404, detail="Record non trovato per il recupero del valore originale.")

        # Gestione del caso in cui il campo sia di tipo binario o non facilmente serializzabile
        try:
            campo_old = str(result_old[0]) if result_old[0] is not None else None
        except Exception:
            campo_old = "[Valore non rappresentabile come stringa]"

    except HTTPException:
        raise # Rilancia le HTTPException già gestite (es. 404)
    except Exception as e:
        traceback.print_exc()
        # Errore durante il recupero del vecchio valore, non procedere con l'update se il logging è critico
        raise HTTPException(status_code=500, detail=f"Errore nel recupero del valore originale per il logging: {str(e)}")
    # --- Fine recupero campo_old ---

    try:
        update_query = text(f"""
            UPDATE `{TABLE_NAME}`
            SET `{field}` = :value
            WHERE ID = :pk
        """) # Assumendo ID come chiave primaria

        query_params = {'value': value, 'pk': pk}

        result = db.execute(update_query, query_params)

        if result.rowcount == 0:
            # Questo potrebbe accadere se il record viene eliminato tra la lettura di campo_old e l'update.
            # O se pk non esiste (ma dovrebbe essere stato gestito dal check precedente)
            db.rollback() # Annulla qualsiasi modifica potenziale
            raise HTTPException(status_code=404, detail="Record non trovato durante l'aggiornamento o nessuna riga modificata.")

        # --- Inizio scrittura log ---
        try:
            utente_session = request.cookies.get("session") # Da verificare se è l'identificativo corretto
            if not utente_session:
                utente_session = "UtenteNonIdentificato" # Fallback o gestione errore

            log_entry = CarrefourLog(
                utente=utente_session,
                campo_old=str(campo_old) if campo_old is not None else None, # Assicura sia stringa o None
                campo_new=str(value) if value is not None else None,       # Assicura sia stringa o None
                data=datetime.utcnow(),
                id_tabella=pk,
                colonna=field
            )
            db.add(log_entry)
            db.commit() # Commit sia dell'update che del log
            return JSONResponse({"status": "success", "message": "Record aggiornato e loggato con successo."})

        except Exception as log_e:
            traceback.print_exc()
            db.rollback() # Annulla l'update se il logging fallisce
            raise HTTPException(status_code=500, detail=f"Record aggiornato, ma errore durante il logging: {str(log_e)}. Modifiche annullate.")
        # --- Fine scrittura log ---

    except HTTPException:
        db.rollback() # Assicura rollback se HTTPException è stata sollevata prima del commit del log
        raise
    except Exception as e:
        db.rollback()
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"Errore durante l'aggiornamento del record: {str(e)}")


@router.get("/api/servizi/ge/export")
async def export_gestione_gs_data(
    month: str = Query(''),
    global_search: str = Query(''),
    column_filters: str = Query(''), # JSON string dei filtri per colonna
    db: Session = Depends(get_db)
):
    try:
        data_manager = DataManager(db, TABLE_NAME)
        rows = data_manager.get_export_data(month, global_search, column_filters)

        if not rows:
            # Non è un errore, semplicemente non ci sono dati per i filtri
            return JSONResponse(status_code=204) # No Content
            # raise HTTPException(status_code=404, detail="Nessun dato trovato per l'esportazione con i filtri applicati.")

        df = pd.DataFrame(rows)
        output = io.BytesIO()

        with pd.ExcelWriter(output, engine='xlsxwriter') as writer:
            df.to_excel(writer, index=False, sheet_name="Dati")
            workbook = writer.book
            worksheet = writer.sheets["Dati"]

            header_format = workbook.add_format({
                'bold': True, 'bg_color': '#F7DC6F', 'border': 1
            })

            for col_num, df_col_name in enumerate(df.columns.values): # Usa df.columns per consistenza
                worksheet.write(0, col_num, df_col_name, header_format)

            for i, column in enumerate(df.columns):
                column_data = df[column].astype(str)
                max_len = max(column_data.map(len).max(), len(column)) + 2
                worksheet.set_column(i, i, max_len)

        output.seek(0)
        filename = f"gestione_servizi_{datetime.now().strftime('%Y-%m-%d_%H-%M-%S')}.xlsx"
        return StreamingResponse(
            output,
            media_type='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            headers={"Content-Disposition": f"attachment; filename={filename}"}
        )
    except Exception as e:
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"Errore durante l'esportazione dei dati: {str(e)}")

@router.get("/api/servizi/ge/unique_values")
async def get_unique_column_values(
    column: str,
    month: str = Query(''),
    filters: str = Query(''), # JSON string dei filtri globali e per colonna
    db: Session = Depends(get_db)
):
    try:
        data_manager = DataManager(db, TABLE_NAME)
        filter_manager = data_manager.filter_manager # alias
        query_builder = QueryBuilder(TABLE_NAME) # alias

        if column not in filter_manager.column_names:
            raise HTTPException(status_code=400, detail=f"Colonna non valida: {column}")

        column_searches = {}
        search_value = None # Filtro globale
        if filters and filters != '{}': # Evita parsing di stringa vuota o {}
            try:
                filters_dict = json.loads(unquote(filters))
                # Filtri specifici per colonna, escludendo quello per cui si cercano valori unici
                # e il filtro globale 'search_value' che viene gestito a parte.
                column_searches = {
                    col: val for col, val_obj in filters_dict.items()
                    if col in filter_manager.column_names and col != column and \
                       (val := val_obj.get('value') if isinstance(val_obj, dict) else val_obj) # Prende il valore
                }
                search_value = filters_dict.get('search', {}).get('value') # Filtro globale da DataTables
            except json.JSONDecodeError:
                raise HTTPException(status_code=400, detail="Formato filtri JSON non valido.")

        where_sql, query_params = filter_manager.build_where_clause(
            month_filter=month,
            search_value=search_value,
            column_searches=column_searches
        )

        query = query_builder.build_unique_values_query(column, where_sql)
        result = db.execute(query, query_params).fetchall()

        values = []
        seen = set() # Per evitare duplicati post-elaborazione (es. trim)
        for row in result:
            val = row[0] # value è il nome aliasato nella query
            if val is not None:
                try:
                    # Converte in stringa e trima, se non è già stringa
                    s_val = str(val).strip()
                    if s_val and s_val not in seen: # Non vuoto e non già visto
                        values.append(s_val)
                        seen.add(s_val)
                except Exception:
                    # Ignora valori che non possono essere convertiti o processati
                    continue
        return JSONResponse(sorted(list(values))) # Ordina i risultati finali

    except HTTPException:
        raise
    except Exception as e:
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"Errore nel recupero dei valori unici: {str(e)}")


@router.post("/api/servizi/ge/unique_values") # Spesso usato per RTC o filtri complessi
async def post_unique_column_values(request: Request, db: Session = Depends(get_db)):
    # Questa route era specifica per 'RTC' nel codice originale, la generalizzo leggermente
    # o si potrebbe dedicare a un campo specifico se necessario.
    # Per ora, assumo che il client invii il nome della colonna nel payload.
    try:
        params = await request.json()
        column_to_filter = params.get("column") # Il client deve specificare su quale colonna
        if not column_to_filter:
            raise HTTPException(status_code=400, detail="Il parametro 'column' è richiesto nel payload.")

    except json.JSONDecodeError:
        raise HTTPException(status_code=400, detail="Payload JSON malformato.")

    data_manager = DataManager(db, TABLE_NAME)
    filter_manager = data_manager.filter_manager
    query_builder = QueryBuilder(TABLE_NAME)

    if column_to_filter not in filter_manager.column_names:
        raise HTTPException(status_code=400, detail=f"Colonna '{column_to_filter}' non valida.")

    month_filter = params.get('month_filter', '').strip()
    search_value = params.get('search', {}).get('value') # Filtro globale DataTables

    column_searches = {}
    if params.get('columns'): # Filtri specifici per colonna da DataTables
        column_names = filter_manager.column_names # Nomi attuali dal DB
        for i, col_param in enumerate(params['columns']):
            if i < len(column_names) and col_param.get('search', {}).get('value'):
                # Non applicare il filtro della colonna per cui stiamo cercando i valori unici
                if column_names[i] != column_to_filter:
                     column_searches[column_names[i]] = col_param['search']

    where_sql, query_params = filter_manager.build_where_clause(
        month_filter=month_filter,
        search_value=search_value,
        column_searches=column_searches
    )

    try:
        query = query_builder.build_unique_values_query(column_to_filter, where_sql)
        result = db.execute(query, query_params).fetchall()

        values = []
        seen = set()
        for row in result:
            val = row[0]
            if val is not None:
                try:
                    s_val = str(val).strip()
                    if s_val and s_val not in seen:
                        values.append(s_val)
                        seen.add(s_val)
                except Exception:
                    continue

        return JSONResponse(sorted(list(values)))

    except Exception as e:
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"Errore nel recupero dei valori unici (POST): {str(e)}")

# Eventuali altre funzioni o classi di utilità specifiche per ordini_servizi_ge possono essere aggiunte qui.
# Ad esempio, se ci fossero funzioni helper che erano in ordini_servizi.py ma usate solo da queste route.
