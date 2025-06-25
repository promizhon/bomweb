import re
from pathlib import Path

def test_set_columns_autosize_loads_widths():
    js_path = Path(__file__).resolve().parents[1] / 'static' / 'js' / 'ordini_servizi_ge.js'
    content = js_path.read_text(encoding='utf-8')
    pattern = re.compile(r"function\s+setColumnsAutosize\([^)]*\)\s*\{[\s\S]*?loadColumnWidths\(", re.S)
    assert pattern.search(content), "loadColumnWidths deve essere richiamato in setColumnsAutosize"

def test_set_columns_autosize_conditional_load():
    js_path = Path(__file__).resolve().parents[1] / 'static' / 'js' / 'ordini_servizi_ge.js'
    content = js_path.read_text(encoding='utf-8')
    pattern = re.compile(r"function\s+setColumnsAutosize\([^)]*\)\s*\{[\s\S]*?if\s*\(\s*localStorage\.getItem\(COLUMN_WIDTHS_KEY\)\s*\)\s*\{[\s\S]*?loadColumnWidths\(", re.S)
    assert pattern.search(content), "loadColumnWidths deve essere chiamato solo se esistono larghezze salvate"
