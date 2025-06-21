import json
import traceback
from fastapi import APIRouter, Depends, Request, HTTPException, Query
from fastapi.responses import JSONResponse, StreamingResponse
from fastapi.templating import Jinja2Templates
from sqlalchemy.orm import Session
from sqlalchemy import text, inspect
from models.carrefour_log import CarrefourLog
from database_config import get_db
from urllib.parse import unquote
import pandas as pd
import io
from datetime import datetime
from typing import Dict, List, Any, Optional

router = APIRouter()
templates = Jinja2Templates(directory="templates")
TABLE_NAME = "carrefour_contabilizzazione_originale"

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
        print(f"Generated WHERE clause: {where_sql}")
        print(f"Query parameters: {query_params}")
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
        if limit == -1:
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
        """)

class DataManager:
    def __init__(self, db: Session, table_name: str):
        self.db = db
        self.table_name = table_name
        self.filter_manager = FilterManager(db, table_name)
        self.query_builder = QueryBuilder(table_name)

    def get_total_records(self) -> int:
        query = text(f"SELECT COUNT(*) FROM `{self.table_name}`")
        return self.db.execute(query).scalar()

    def get_filtered_data(self, params: Dict[str, Any]) -> Dict[str, Any]:
        try:
            draw = params.get('draw', 1)
            # Forza nessun limite: restituisci tutti i record
            length = -1
            start = 0
            search_value = params.get('search', {}).get('value')
            order_column_index = params.get('order', [{}])[0].get('column', 0)
            order_dir = params.get('order', [{}])[0].get('dir', 'asc')
            month_filter = params.get('month_filter', '').strip()
            rtc_filter = params.get('rtc_filter', '').strip()

            column_names = self.filter_manager.column_names
            order_column_name = column_names[order_column_index] if order_column_index < len(column_names) else 'ID'

            column_searches = {
                column_names[i]: params['columns'][i]['search'] 
                for i in range(len(column_names))
                if params.get('columns') and params['columns'][i].get('search', {}).get('value')
            }

            if rtc_filter:
                column_searches['RTC'] = {'value': rtc_filter, 'regex': True}

            where_sql, query_params = self.filter_manager.build_where_clause(
                month_filter=month_filter,
                search_value=search_value,
                column_searches=column_searches
            )

            total_records = self.get_total_records()
            count_query = self.query_builder.build_count_query(where_sql)
            records_filtered = self.db.execute(count_query, query_params).scalar()

            data_query = self.query_builder.build_data_query(
                where_sql, order_column_name, order_dir, length, start
            )
            final_params = query_params
            result = self.db.execute(data_query, final_params).fetchall()
            data = [dict(row._mapping) for row in result]

            return {
                "draw": draw,
                "recordsTotal": total_records,
                "recordsFiltered": records_filtered,
                "data": data,
            }
        except Exception as e:
            print("!!! ERROR IN get_filtered_data !!!")
            traceback.print_exc()
            return {
                "draw": params.get('draw', 1),
                "recordsTotal": 0,
                "recordsFiltered": 0,
                "data": [],
                "error": f"Errore Interno del Server: {str(e)}"
            }

    def get_export_data(self, month: str, global_search: str, column_filters: str) -> List[Dict[str, Any]]:
        try:
            column_searches = {}
            if column_filters:
                try:
                    filters_dict = json.loads(unquote(column_filters))
                    column_searches = {
                        col: val for col, val in filters_dict.items()
                        if col in self.filter_manager.column_names and val
                    }
                except json.JSONDecodeError:
                    print("Errore nel decodificare i filtri per colonna JSON.")

            where_sql, query_params = self.filter_manager.build_where_clause(
                month_filter=month,
                search_value=global_search,
                column_searches=column_searches
            )

            query = self.query_builder.build_export_query(where_sql)
            result = self.db.execute(query, query_params).fetchall()
            return [dict(row._mapping) for row in result]
        except Exception as e:
            print("!!! ERROR IN get_export_data !!!")
            traceback.print_exc()
            raise HTTPException(status_code=500, detail=str(e))

@router.get("/ordini_servizi", include_in_schema=False)
async def ordini_servizi_page(request: Request):
    return templates.TemplateResponse("ordini_servizi.html", {"request": request, "username": request.cookies.get("session")})

@router.get("/ordini_servizi/ge", include_in_schema=False)
async def get_gestione_gs_tab(request: Request):
    return templates.TemplateResponse("ordini_servizi_ge.html", {"request": request})

@router.get("/api/servizi/ge/columns")
async def get_gestione_gs_columns(db: Session = Depends(get_db)):
    try:
        filter_manager = FilterManager(db, TABLE_NAME)
        columns = filter_manager.column_names
        if not columns:
            raise HTTPException(status_code=404, detail="Nessuna colonna trovata nella tabella")
        return JSONResponse(columns)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Errore nel recupero delle colonne: {str(e)}")

@router.get("/api/servizi/ge/months")
async def get_presentation_months():
    months = [
        "GENNAIO", "FEBBRAIO", "MARZO", "APRILE", "MAGGIO", "GIUGNO",
        "LUGLIO", "AGOSTO", "SETTEMBRE", "OTTOBRE", "NOVEMBRE", "DICEMBRE",
        "TUTTO"
    ]
    return JSONResponse(months)

@router.post("/api/servizi/ge/data")
async def get_gestione_gs_data(request: Request, db: Session = Depends(get_db)):
    params = await request.json()
    data_manager = DataManager(db, TABLE_NAME)
    return data_manager.get_filtered_data(params)

@router.post("/api/servizi/ge/update")
async def update_gestione_gs_data(request: Request, db: Session = Depends(get_db)):
    try:
        data = await request.json()
        print(f"DEBUG UPDATE - Dati ricevuti: {data}")  # Debug print
        
        query_params = {}
        pk = data.get('pk')
        field = data.get('field')
        value = data.get('value')

        print(f"DEBUG UPDATE - pk: {pk}, field: {field}, value: {value}")  # Debug print

        if not all([pk, field, value is not None]):
            print("DEBUG UPDATE - Parametri mancanti")
            return JSONResponse({"status": "error", "message": "Parametri mancanti"}, status_code=400)

        filter_manager = FilterManager(db, TABLE_NAME)
        columns = filter_manager.column_names
        print(f"DEBUG UPDATE - Colonne valide: {columns}")  # Debug print
        
        if field not in columns:
            print(f"DEBUG UPDATE - Campo non valido: {field}")
            return JSONResponse({"status": "error", "message": "Campo non valido"}, status_code=400)

        # Recupera il valore precedente per il log
        old_value_query = text(f"SELECT `{field}` FROM `{TABLE_NAME}` WHERE ID = :pk")
        old_value_result = db.execute(old_value_query, {'pk': pk}).fetchone()
        old_value = old_value_result[0] if old_value_result else None

        update_query = text(f"""
            UPDATE `{TABLE_NAME}`
            SET `{field}` = :value
            WHERE ID = :pk
        """)
        
        query_params = {
            'value': value,
            'pk': pk
        }
        
        print(f"DEBUG UPDATE - Query: {update_query}")
        print(f"DEBUG UPDATE - Parametri: {query_params}")
        
        result = db.execute(update_query, query_params)
        db.commit()

        # Inserisci voce di log solo se l'update ha avuto effetto
        if result.rowcount:
            log_entry = CarrefourLog(
                utente=request.cookies.get("session", ""),
                campo_old=str(old_value) if old_value is not None else None,
                campo_new=str(value),
                data=datetime.utcnow(),
                id_tabella=pk,
                colonna=field
            )
            db.add(log_entry)
            db.commit()
        
        if result.rowcount == 0:
            return JSONResponse({"status": "error", "message": "Record non trovato"}, status_code=404)
            
        return JSONResponse({"status": "success", "message": "Record aggiornato"})
        
    except Exception as e:
        print("!!! ERROR IN update_gestione_gs_data !!!")
        traceback.print_exc()
        return JSONResponse({"status": "error", "message": str(e)}, status_code=500)

@router.get("/api/servizi/ge/export")
async def export_gestione_gs_data(
    month: str = Query(''),
    global_search: str = Query(''),
    column_filters: str = Query(''),
    db: Session = Depends(get_db)
):
    try:
        data_manager = DataManager(db, TABLE_NAME)
        rows = data_manager.get_export_data(month, global_search, column_filters)

        if not rows:
            raise HTTPException(status_code=404, detail="Nessun dato trovato per l'esportazione con i filtri applicati.")

        df = pd.DataFrame(rows)
        output = io.BytesIO()
        
        with pd.ExcelWriter(output, engine='xlsxwriter') as writer:
            df.to_excel(writer, index=False, sheet_name="Dati")
            workbook = writer.book
            worksheet = writer.sheets["Dati"]

            header_format = workbook.add_format({
                'bold': True,
                'bg_color': '#F7DC6F',
                'border': 1
            })
            
            for col_num, value in enumerate(df.columns.values):
                worksheet.write(0, col_num, value, header_format)

            for i, column in enumerate(df.columns):
                max_len = max(df[column].astype(str).map(len).max(), len(column)) + 2
                worksheet.set_column(i, i, max_len)

        output.seek(0)
        return StreamingResponse(
            output,
            media_type='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            headers={"Content-Disposition": f"attachment; filename=gestione_servizi_{datetime.now().strftime('%Y-%m-%d_%H-%M-%S')}.xlsx"}
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/api/servizi/ge/unique_values")
async def get_unique_column_values(column: str, month: str = '', filters: str = '', db: Session = Depends(get_db)):
    try:
        data_manager = DataManager(db, TABLE_NAME)
        filter_manager = data_manager.filter_manager
        query_builder = QueryBuilder(TABLE_NAME)

        if column not in filter_manager.column_names:
            raise HTTPException(status_code=400, detail=f"Colonna non valida: {column}")

        column_searches = {}
        search_value = None
        if filters and filters != '{}':
            try:
                filters_dict = json.loads(unquote(filters))
                column_searches = {
                    col: val for col, val in filters_dict.items()
                    if col in filter_manager.column_names and val and col != 'global_search'
                }
                search_value = filters_dict.get('global_search')
            except json.JSONDecodeError:
                raise HTTPException(status_code=400, detail="Formato filtri non valido")

        try:
            where_sql, query_params = filter_manager.build_where_clause(
                month_filter=month,
                search_value=search_value,
                column_searches=column_searches
            )

            query = query_builder.build_unique_values_query(column, where_sql)
            result = db.execute(query, query_params).fetchall()
            
            values = []
            seen = set()
            for row in result:
                if row[0] is not None:
                    try:
                        if hasattr(row[0], 'isoformat'):
                            value = row[0].isoformat()
                        else:
                            value = str(row[0]).strip()
                        if value and value not in seen:
                            values.append(value)
                            seen.add(value)
                    except Exception:
                        continue

            return JSONResponse(values)

        except Exception as db_error:
            raise HTTPException(
                status_code=500,
                detail=f"Errore nell'esecuzione della query: {str(db_error)}"
            )

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Errore nel recupero dei valori unici: {str(e)}"
        )

@router.post("/api/servizi/ge/unique_values")
async def post_unique_column_values(request: Request, db: Session = Depends(get_db)):
    import traceback
    try:
        params = await request.json()
        print("[DEBUG] Parametri ricevuti per unique_values:", params)
        # Se params è una stringa, prova a fare il parsing
        if isinstance(params, str):
            import json
            try:
                params = json.loads(params)
                print("[DEBUG] Params dopo json.loads:", params)
            except Exception as e:
                print("[DEBUG] Errore nel parsing JSON:", e)
                raise HTTPException(status_code=400, detail="Payload non valido per unique_values")
        data_manager = DataManager(db, TABLE_NAME)
        filter_manager = data_manager.filter_manager
        query_builder = QueryBuilder(TABLE_NAME)

        # Estrai i filtri come fa get_filtered_data
        month_filter = params.get('month_filter', '').strip()
        search_value = params.get('search', {}).get('value')
        column_names = filter_manager.column_names
        print("[DEBUG] Colonne disponibili:", column_names)
        column_searches = {
            column_names[i]: params['columns'][i]['search']
            for i in range(len(column_names))
            if params.get('columns') and params['columns'][i].get('search', {}).get('value')
        }
        print("[DEBUG] column_searches:", column_searches)
        print("[DEBUG] search_value:", search_value)
        print("[DEBUG] month_filter:", month_filter)

        where_sql, query_params = filter_manager.build_where_clause(
            month_filter=month_filter,
            search_value=search_value,
            column_searches=column_searches
        )
        print("[DEBUG] where_sql:", where_sql)
        print("[DEBUG] query_params:", query_params)

        query = query_builder.build_unique_values_query('RTC', where_sql)
        print("[DEBUG] Query finale:", query)
        result = db.execute(query, query_params).fetchall()
        values = []
        seen = set()
        for row in result:
            if row[0] is not None:
                try:
                    value = str(row[0]).strip()
                    if value and value not in seen:
                        values.append(value)
                        seen.add(value)
                except Exception:
                    continue
        print("[DEBUG] Valori RTC unici trovati:", values)
        return JSONResponse(values)
    except Exception as e:
        print("!!! ERROR IN post_unique_column_values !!!")
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"Errore nel recupero dei valori unici: {str(e)}")
