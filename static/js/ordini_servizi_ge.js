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
                visible: true,
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
                visible: true,
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

    // Utility: esportazione CSV/Excel
    function setupExportButtons(table) {
        const exportDiv = document.getElementById('tabulator-export-btns');
        if (!exportDiv) return;
        exportDiv.innerHTML = '';
        const csvBtn = document.createElement('button');
        csvBtn.className = 'btn btn-outline-primary me-2';
        csvBtn.textContent = 'Esporta CSV';
        csvBtn.onclick = () => table.download('csv', 'ordini_servizi.csv');
        const xlsxBtn = document.createElement('button');
        xlsxBtn.className = 'btn btn-outline-success';
        xlsxBtn.textContent = 'Esporta Excel';
        xlsxBtn.onclick = () => table.download('xlsx', 'ordini_servizi.xlsx');
        exportDiv.appendChild(csvBtn);
        exportDiv.appendChild(xlsxBtn);
    }

    // Utility: setup toggle edit mode
    function setupEditToggle(table) {
        const toggle = document.getElementById('toggle-edit-mode');
        if (!toggle) return;
        toggle.addEventListener('change', function () {
            editModeEnabled = this.checked;
            table.setOptions({
                cellEdited: editModeEnabled ? onCellEdit : null
            });
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

        // Spazio per pulsanti azione custom
        columnsConfig.push({
            title: 'Azioni',
            field: 'actions',
            hozAlign: 'center',
            headerSort: false,
            formatter: function () {
                // Placeholder: aggiungi qui i pulsanti custom
                return '<button class="btn btn-sm btn-danger">Elimina</button>';
            },
            cellClick: function (e, cell) {
                // Gestisci azione custom (es. elimina)
                // Esempio: conferma e rimuovi riga
                if (confirm('Eliminare questa riga?')) {
                    cell.getRow().delete();
                }
            }
        });

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
