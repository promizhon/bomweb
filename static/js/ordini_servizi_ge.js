// ordini_servizi_ge.js
// Sostituisce DataTables con Tabulator per la tabella #gestione-gs-table
// Funzionalità: filtri per colonna, esportazione, responsive, editing inline, caricamento AJAX, colonne dinamiche, spazio pulsanti azione
// Stile coerente con ordini_servizi_ge.css

// Assicurati di includere Tabulator CSS/JS nel template HTML prima di questo file!
// Esempio:
// <link href="https://unpkg.com/tabulator-tables@5.5.2/dist/css/tabulator_bootstrap5.min.css" rel="stylesheet">
// <script src="https://unpkg.com/tabulator-tables@5.5.2/dist/js/tabulator.min.js"></script>

console.log('ordini_servizi_ge.js caricato');

(function () {
    if (!document.getElementById('gestione-gs-table')) return;

    let tabulatorTable = null;
    let columnsConfig = [];
    let editModeEnabled = false;
    let currentParams = {};
    let visibleColumnsState = [];

    // Utility: mostra messaggi di errore
    function showError(msg) {
        alert(msg);
    }

    // Utility: recupera colonne dinamiche dal backend
    async function fetchColumns() {
        const res = await fetch('/api/servizi/ge/columns');
        if (!res.ok) throw new Error('Errore nel recupero colonne');
        const columns = await res.json();
        // Se è un array di stringhe, mappa manualmente senza headerFilter
        if (Array.isArray(columns) && typeof columns[0] === 'string') {
            return columns.map(col => ({
                title: col.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase()),
                field: col,
                sorter: 'string',
                editor: col.toLowerCase() === 'id' ? false : 'input',
                visible: visibleColumnsState.length === 0 ? true : visibleColumnsState.includes(col),
                headerSort: true,
                cssClass: col.toLowerCase() === 'id' ? '' : 'editable'
            }));
        }
        // Altrimenti, rimuovi headerFilter come già fatto
        return columns.map(col => {
            const c = { ...col };
            delete c.headerFilter;
            delete c.headerFilterPlaceholder;
            return {
                title: c.title || c.field.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase()),
                field: c.field,
                sorter: 'string',
                editor: c.field.toLowerCase() === 'id' ? false : 'input',
                visible: visibleColumnsState.length === 0 ? true : visibleColumnsState.includes(c.field),
                headerSort: true,
                cssClass: c.field.toLowerCase() === 'id' ? '' : 'editable'
            };
        });
    }

    // Utility: recupera dati via AJAX (POST, come DataTables)
    async function fetchData(params) {
        const res = await fetch('/api/servizi/ge/data', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(params)
        });
        if (!res.ok) throw new Error('Errore nel caricamento dati');
        const data = await res.json();
        const arr = data.data || data;
        console.log('Record ricevuti dal backend:', Array.isArray(arr) ? arr.length : 0, arr);
        // Tabulator si aspetta un array di oggetti
        return arr;
    }

    // Utility: aggiorna una cella (inline edit)
    async function updateCell(pk, field, value) {
        const res = await fetch('/api/servizi/ge/update', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ pk, field, value })
        });
        if (!res.ok) throw new Error('Errore aggiornamento cella');
        const result = await res.json();
        if (result.status !== 'success') throw new Error(result.message || 'Errore update');
        return true;
    }

    // Utility: esportazione CSV/Excel tramite backend
    function setupExportButtons(table) {
        const exportDiv = document.getElementById('tabulator-export-btns');
        if (!exportDiv) return;
        exportDiv.innerHTML = '';

        async function handleExport() {
            const month = document.getElementById('month-filter')?.value || '';
            const searchVal = document.getElementById('generic-search')?.value || '';

            if (!month) {
                showError('Seleziona un mese prima di esportare');
                return;
            }

            const filters = {};
            const rtcVal = document.getElementById('rtc-filter')?.value;
            if (rtcVal) filters['RTC'] = { value: rtcVal, regex: false };
            if (table && typeof table.getHeaderFilters === 'function') {
                table.getHeaderFilters().forEach(f => {
                    if (f.value) filters[f.field] = { value: f.value, regex: false };
                });
            }

            const params = new URLSearchParams();
            params.append('month', month);
            if (searchVal) params.append('global_search', searchVal);
            if (Object.keys(filters).length > 0) {
                params.append('column_filters', JSON.stringify(filters));
            }

            try {
                const response = await fetch(`/api/servizi/ge/export?${params.toString()}`);
                if (!response.ok) throw new Error('Errore durante l\'esportazione');

                const blob = await response.blob();
                let filename = 'export.xlsx';
                const disposition = response.headers.get('Content-Disposition');
                if (disposition && disposition.includes('filename=')) {
                    filename = disposition.split('filename=')[1].replace(/\"/g, '');
                }

                const url = window.URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = filename;
                document.body.appendChild(a);
                a.click();
                a.remove();
                window.URL.revokeObjectURL(url);
            } catch (err) {
                showError(err.message || 'Errore esportazione');
            }
        }

        const csvBtn = document.createElement('button');
        csvBtn.className = 'btn btn-outline-primary me-2';
        csvBtn.textContent = 'Esporta CSV';
        csvBtn.onclick = handleExport;

        const xlsxBtn = document.createElement('button');
        xlsxBtn.className = 'btn btn-outline-success';
        xlsxBtn.textContent = 'Esporta Excel';
        xlsxBtn.onclick = handleExport;

        exportDiv.appendChild(csvBtn);
        exportDiv.appendChild(xlsxBtn);
    }

    // Utility: setup toggle edit mode
    function setupEditToggle(table) {
        const toggle = document.getElementById('toggle-edit-mode');
        if (!toggle) return;
        toggle.addEventListener('change', function () {
            editModeEnabled = this.checked;
table.getColumns().forEach(col => {
    const def = col.getDefinition();
    const canEdit = def.editor !== false && def.editor !== undefined;
    col.updateDefinition({ editable: editModeEnabled && canEdit });
});

table.setOptions({
    cellEdited: editModeEnabled ? onCellEdit : null
});
});

// fuori da quel blocco, definisci le nuove funzioni:

function applyVisibleColumnsState(table) {
    if (!visibleColumnsState.length) {
        visibleColumnsState = table
            .getColumns()
            .map(c => c.getField())
            .filter(f => f !== 'actions');
        return;
    }
    table.getColumns().forEach(col => {
        const field = col.getField();
        if (visibleColumnsState.includes(field)) {
            col.show();
        } else {
            col.hide();
        }
    });
}

function setupColumnVisibilityControls(table) {
    const menu = document.getElementById('column-toggle-menu');
    if (!menu) return;
    menu.innerHTML = '';

    table.getColumns().forEach(col => {
        const field = col.getField();
        if (field === 'actions') return;
        const li = document.createElement('li');
        const div = document.createElement('div');
        div.className = 'form-check';
        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.className = 'form-check-input';
        checkbox.id = `toggle-col-${field}`;
        checkbox.checked = col.isVisible();
        checkbox.addEventListener('change', function () {
            const column = table.getColumn(field);
            if (!column) return;
            if (this.checked) {
                column.show();
                if (!visibleColumnsState.includes(field)) visibleColumnsState.push(field);
            } else {
                column.hide();
                visibleColumnsState = visibleColumnsState.filter(f => f !== field);
            }
        });
        if (col.isVisible() && !visibleColumnsState.includes(field)) {
            visibleColumnsState.push(field);
        }
        const label = document.createElement('label');
        label.className = 'form-check-label';
        label.htmlFor = checkbox.id;
        label.textContent = col.getDefinition().title;
        div.appendChild(checkbox);
        div.appendChild(label);
        li.appendChild(div);
        menu.appendChild(li);
    });
}


    // Callback: cella editata
    async function onCellEdit(cell) {
        if (!editModeEnabled) return false;
        const row = cell.getRow().getData();
        const field = cell.getField();
        const value = cell.getValue();
        try {
            await updateCell(row.ID, field, value);
        } catch (e) {
            showError(e.message);
            cell.restoreOldValue();
        }
    }

    function getParams() {
        const monthFilter = document.getElementById('month-filter');
        const rtcFilter = document.getElementById('rtc-filter');
        const searchInput = document.getElementById('generic-search');
        return {
            month_filter: monthFilter ? monthFilter.value : '',
            rtc_filter: rtcFilter ? rtcFilter.value : '',
            search: { value: searchInput ? searchInput.value : '' }
        };
    }

    async function refreshRTCFilter(params) {
        const rtcFilter = document.getElementById('rtc-filter');
        if (!rtcFilter) return;
        rtcFilter.disabled = true;
        rtcFilter.innerHTML = '<option value="" selected>Seleziona RTC...</option>';
        if (!params.month_filter) return;
        try {
            const payload = {
                month_filter: params.month_filter,
                search: { value: params.search ? params.search.value : '' },
                columns: []
            };
            const response = await fetch('/api/servizi/ge/unique_values', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
            let rtcValues = await response.json();
            rtcValues = Array.from(new Set(rtcValues));
            rtcValues.forEach(rtc => {
                const opt = document.createElement('option');
                opt.value = rtc;
                opt.textContent = rtc;
                rtcFilter.appendChild(opt);
            });
            if (rtcValues.length > 0) rtcFilter.disabled = false;
        } catch (error) {
            console.error('Errore nel caricamento dei valori RTC:', error);
        }
    }

    async function loadOrUpdateTable() {
        const params = getParams();
        if (!params.month_filter) return; // richiede mese selezionato
        currentParams = params;
        if (!tabulatorTable) {
            await initTabulator(params);
        } else {
            await tabulatorTable.setData('/api/servizi/ge/data', params);
        }
        refreshRTCFilter(params);
    }

    function setupEventListeners() {
        const monthFilter = document.getElementById('month-filter');
        const rtcFilter = document.getElementById('rtc-filter');
        const searchInput = document.getElementById('generic-search');
        if (monthFilter) {
            monthFilter.addEventListener('change', loadOrUpdateTable);
        }
        if (rtcFilter) {
            rtcFilter.disabled = true;
            rtcFilter.addEventListener('change', loadOrUpdateTable);
        }
        if (searchInput) {
            searchInput.addEventListener('keyup', function(e) {
                if (e.key === 'Enter' || this.value === '') {
                    loadOrUpdateTable();
                }
            });
        }
    }

    // Popola dinamicamente il select dei mesi
    async function populateMonthFilter() {
        const monthFilter = document.getElementById('month-filter');
        if (!monthFilter) {
            console.log('month-filter non trovato');
            return;
        }
        try {
            const res = await fetch('/api/servizi/ge/months');
            if (!res.ok) throw new Error('Errore nel recupero mesi');
            const months = await res.json();
            console.log('Mesi ricevuti dal backend:', months);
            monthFilter.innerHTML = '<option value="" selected>Seleziona un mese...</option>';
            months.forEach(m => {
                const opt = document.createElement('option');
                opt.value = m;
                opt.textContent = m;
                monthFilter.appendChild(opt);
            });
            console.log('Select mesi popolato con', months.length, 'opzioni');
            if (window.jQuery && jQuery.fn.selectpicker) {
                jQuery('#month-filter').selectpicker({ dropupAuto: false });
            }
        } catch (e) {
            showError('Impossibile caricare i mesi: ' + e.message);
            console.error('Errore durante il popolamento dei mesi:', e);
        }
    }

    // Inizializza Tabulator
    async function initTabulator(params) {
        try {
            columnsConfig = await fetchColumns();
        } catch (e) {
            showError(e.message);
            return;
        }

        // In questa versione il bottone "Elimina" viene omesso.
        // Se necessario si potrà aggiungere un formatter personalizzato per
        // gestire altre azioni senza mostrare il pulsante di eliminazione.

        // Parametri di ricerca/filtri
        if (!params) params = getParams();

        tabulatorTable = new Tabulator('#gestione-gs-table', {
            ajaxURL: '/api/servizi/ge/data',
            ajaxConfig: 'POST',
            ajaxContentType: 'json',
            ajaxParams: params,
            ajaxResponse: function(url, params, response) {
                // Adatta la risposta del backend (DataTables) al formato Tabulator
                return response.data || [];
            },

            layout: 'fitDataTable',
            responsiveLayout: false,
            columns: columnsConfig,
            columnDefaults: { headerFilter: false },
            headerFilterPlaceholder: "",
            initialHeaderFilter: [],
            placeholder: 'Nessun dato disponibile',
            movableColumns: true,
            resizableRows: true,
            pagination: 'local',
            paginationSize: 25,
            paginationSizeSelector: [10, 25, 50, 100, 250, true],
            locale: true,
            langs: {
                'it-it': {
                    'columns': {},
                    'ajax': { 'loading': 'Caricamento...', 'error': 'Errore caricamento' },
                    'pagination': { 'first': 'Primo', 'first_title': 'Primo', 'last': 'Ultimo', 'last_title': 'Ultimo', 'prev': 'Prec.', 'prev_title': 'Prec.', 'next': 'Succ.', 'next_title': 'Succ.' },
                    'headerFilters': { 'default': '' }
                }
            },
            cellEdited: editModeEnabled ? onCellEdit : null,
            rowClick: function (e, row) {
                row.toggleSelect();
            },
            rowSelected: function (row) {
                const el = row.getElement();
                if (el) el.classList.add('table-row-selected');
            },
            rowDeselected: function (row) {
                const el = row.getElement();
                if (el) el.classList.remove('table-row-selected');
            },
            tableBuilt: function() {
                // Forza la rimozione dei filtri header
                this.getColumns().forEach(col => {
                    col.updateDefinition({ headerFilter: false });
                });
                const tab = document.querySelector('#gestione-gs-table .tabulator-table');
                if(tab) tab.classList.add('table', 'table-striped', 'table-hover', 'table-bordered', 'align-middle', 'mb-0');
            },
        });
        // PATCH: Forza la rimozione dei filtri header anche dopo l'inizializzazione (compatibilità versioni vecchie)
        setTimeout(() => {
            tabulatorTable.getColumns().forEach(col => {
                col.updateDefinition({ headerFilter: false });
            });
            tabulatorTable.redraw(true);
            console.log('DEBUG: Colonne Tabulator dopo patch headerFilter:', tabulatorTable.getColumnDefinitions());
        }, 100);

        tabulatorTable.on('dataLoaded', function () {
            refreshRTCFilter(currentParams);
        });

        // Setup esportazione
        setupExportButtons(tabulatorTable);
        // Setup toggle edit mode
        setupEditToggle(tabulatorTable);
        // Applica visibilità colonne e controlli
        applyVisibleColumnsState(tabulatorTable);
        setupColumnVisibilityControls(tabulatorTable);
    }

    // Inizializza solo se presente la tabella
    function avviaGestioneGS() {
        const tabellaPresente = !!document.getElementById('gestione-gs-table');
        console.log('Inizializzazione Gestione GS, tabella presente:', tabellaPresente);
        if (tabellaPresente) {
            let exportDiv = document.getElementById('tabulator-export-btns');
            if (!exportDiv) {
                exportDiv = document.createElement('div');
                exportDiv.id = 'tabulator-export-btns';
                exportDiv.className = 'mb-2';
                document.getElementById('gestione-gs-table').parentNode.insertBefore(exportDiv, document.getElementById('gestione-gs-table'));
            }
            console.log('Chiamo populateMonthFilter()');
            populateMonthFilter().then(() => {
                setupEventListeners();
            });
        } else {
            console.log('Tabella gestione-gs-table NON trovata, script non inizializzato');
        }
    }

    // Esegui subito (funziona anche su caricamento dinamico)
    avviaGestioneGS();
})(); 
