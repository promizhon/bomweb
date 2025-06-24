let table; // Questa variabile globale 'table' verrà usata per l'API di DataTables
let editModeEnabled = false;
let visibleColumnsState = [];
let columnsConfig = [];
let lastRTCValues = null;
let columnViewMode = 'autosize'; // Modalità di visualizzazione colonne: 'autosize' o 'fixedwrap'
let cellTooltipSingleton = null;
let cellTooltipListenersAdded = false;

// Funzione di utilità per la gestione degli errori
function handleError(error, message = 'Si è verificato un errore') {
    console.error(message, error);
    // Considera di mostrare un messaggio più user-friendly all'utente
    // $('#loading-indicator').hide();
    // $('#gestione-gs-table').show();
}

// Funzione di utilità per la gestione delle risposte AJAX
function handleAjaxError(xhr, status, error) {
    const errorMessage = xhr.responseJSON?.message || error || 'Errore sconosciuto';
    handleError(new Error(errorMessage), 'Errore nella richiesta AJAX');
}

// Funzione di utilità per ottenere i filtri attivi
function getActiveFilters() {
    const filters = {};
    if (!window.table) return filters; // Usa window.table per l'API DataTables

    const globalSearch = window.table.search();
    if (globalSearch) filters['global_search'] = globalSearch;

    window.table.columns().every(function () {
        const column = this;
        const colName = column.settings()[0].aoColumns[column.index()].data;
        const colValue = column.search();
        const colRegex = colValue ? colValue.startsWith('^') && colValue.endsWith('$') : false;
        if (colValue) filters[colName] = { value: colValue, regex: colRegex };
    });

    return filters;
}

function setupOrdiniServiziPage() {
    console.log('Setup pagina Ordini Servizi...');
    const content = document.getElementById('main-content');
    if (!content) {
        console.error('Elemento #main-content non trovato.');
        return;
    }

    const tabButtons = document.querySelectorAll('#serviziTab .tab-btn');
    tabButtons.forEach(button => {
        button.addEventListener('click', function () {
            const tabName = this.dataset.tab;
            caricaTabServizi(tabName, this);
        });
    });

    const activeTab = document.querySelector('#serviziTab .tab-btn.active');
    if (activeTab) {
        caricaTabServizi(activeTab.dataset.tab, activeTab);
    }
}

function caricaTabServizi(tabName, btn) {
    console.log('Caricamento tab:', tabName);
    if (btn) {
        document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
    }

    const contentArea = document.getElementById('servizi-content-area');
    if (!contentArea) {
        console.error('Elemento #servizi-content-area non trovato.');
        return;
    }

    // Mostra un indicatore di caricamento se disponibile
    const loadingIndicator = document.getElementById('loading-indicator');
    if (loadingIndicator) loadingIndicator.style.display = 'block';

    const url = tabName === 'ge' ? '/ordini_servizi/ge' : `/ordini_servizi/${tabName}`;

    fetch(url)
        .then(response => {
            if (!response.ok) throw new Error(`Errore di rete: ${response.status}`);
            return response.text();
        })
        .then(html => {
            contentArea.innerHTML = html;
            if (tabName === 'ge') {
                initializeGestioneGSControls();
            }
        })
        .catch(error => {
            console.error('Errore nel caricamento del tab:', error);
            contentArea.innerHTML = `<p class="text-danger">Impossibile caricare il contenuto del tab: ${error.message}</p>`;
        })
        .finally(() => {
            if (loadingIndicator) loadingIndicator.style.display = 'none';
        });
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', setupOrdiniServiziPage);
} else {
    setupOrdiniServiziPage();
}

function updateColumnVisibility() {
    if (window.table && visibleColumnsState.length > 0) {
        window.table.columns().every(function (idx) {
            window.table.column(idx).visible(visibleColumnsState.includes(idx));
        });
    }
}

function saveColumnVisibility() {
    if (window.table) {
        visibleColumnsState = window.table.columns().indexes().filter(idx => window.table.column(idx).visible()).toArray();
    }
}

function updateEditModeState(enabled) {
    editModeEnabled = enabled;
    const tableElement = $('#gestione-gs-table');
    if (enabled) {
        tableElement.addClass('edit-mode-active');
    } else {
        tableElement.removeClass('edit-mode-active');
    }
}

function initializeToggle() {
    const toggleEditMode = document.getElementById('toggle-edit-mode');
    if (toggleEditMode) {
        // Rimuovi eventuali listener precedenti per evitare duplicazioni
        const newToggle = toggleEditMode.cloneNode(true);
        toggleEditMode.parentNode.replaceChild(newToggle, toggleEditMode);
        
        newToggle.addEventListener('change', function () {
            updateEditModeState(this.checked);
        });
        newToggle.checked = editModeEnabled;
        updateEditModeState(editModeEnabled); // Sincronizza lo stato iniziale
    }
}

function escapeRegex(string) {
    return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function handleExport() {
    if (!window.table) {
        handleError(new Error('La tabella non è inizializzata.'), 'Errore Esportazione');
        return;
    }

    const selectedMonth = $('#month-filter').val();
    if (!selectedMonth) {
        handleError(new Error('Nessun mese selezionato.'), 'Errore Esportazione: Seleziona un mese prima di esportare');
        return;
    }

    const visibleColumns = [];
    window.table.columns().every(function (idx) {
        if (window.table.column(idx).visible()) {
            const columnData = window.table.settings()[0].aoColumns[idx].data;
            visibleColumns.push(columnData);
        }
    });

    const params = new URLSearchParams();
    params.append('month', selectedMonth);
    params.append('visible_columns', JSON.stringify(visibleColumns));

    const searchInput = document.getElementById('generic-search');
    if (searchInput && searchInput.value) {
        params.append('global_search', searchInput.value);
    }

    const columnFilters = {};
    const rtcFilter = document.getElementById('rtc-filter');
    if (rtcFilter && rtcFilter.value) {
        columnFilters['RTC'] = { value: rtcFilter.value, regex: false };
    }
    const activeFilters = getActiveFilters();
    for (const key in activeFilters) {
        if (key !== 'global_search' && activeFilters[key].value) { // Assicurati che il valore del filtro esista
            columnFilters[key] = activeFilters[key];
        }
    }
    if (Object.keys(columnFilters).length > 0) {
        params.append('column_filters', JSON.stringify(columnFilters));
    }

    const query = params.toString();
    window.location.href = `/api/servizi/ge/export?${query}`;
}

async function aggiornaFiltroRTC() {
    const mese = $('#month-filter').val();
    const ricerca = $('#generic-search').val();
    const rtcFilter = document.getElementById('rtc-filter');
    if (!rtcFilter) return;
    rtcFilter.disabled = true;
    rtcFilter.innerHTML = '<option value="" selected>Seleziona RTC...</option>';
    if (!mese) {
        rtcFilter.disabled = false; // Riabilita se il mese non è selezionato, anche se vuoto
        return;
    }
    try {
        const payload = {
            column: "RTC",
            month_filter: mese,
            search: { value: ricerca },
            columns: window.table ? window.table.settings()[0].aoColumns.map(() => ({ search: { value: '' } })) : []
        };
        const response = await fetch('/api/servizi/ge/unique_values', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        if (!response.ok) {
            throw new Error(`Errore HTTP: ${response.status}`);
        }
        let rtcValues = await response.json();
        rtcValues = Array.from(new Set(rtcValues)); // Rimuove duplicati
        rtcValues.forEach(rtc => rtcFilter.add(new Option(rtc, rtc)));
        rtcFilter.disabled = false; // Riabilita dopo il caricamento
    } catch (error) {
        console.error('Errore nel caricamento dei valori RTC:', error);
        rtcFilter.disabled = false; // Riabilita anche in caso di errore
    }
}

async function initializeDataTable() {
    console.log('[initializeDataTable] Inizio inizializzazione DataTable.');
    const selectedMonth = $('#month-filter').val();

    if (typeof $.fn.DataTable === 'undefined') {
        handleError(new Error('DataTables non è stato caricato.'), 'Errore Inizializzazione Tabella');
        return;
    }

    if (!selectedMonth) {
        console.log('[initializeDataTable] Nessun mese selezionato, inizializzazione tabella saltata.');
        // Potresti voler nascondere o mostrare un messaggio qui
        if (window.table) {
            window.table.clear().draw(); // Pulisce la tabella se era già inizializzata
        }
        return;
    }

    // Mostra l'indicatore di caricamento se esiste
    const loadingIndicator = document.getElementById('loading-indicator');
    if (loadingIndicator) loadingIndicator.style.display = 'block';
    const tableElement = $('#gestione-gs-table');
    if (tableElement.length) tableElement.hide(); // Nascondi la tabella durante il caricamento

    try {
        // Pulisci i contenitori dei controlli DataTables prima di reinizializzare
        $('#dt-length-container').empty();
        $('#dt-buttons-container').empty();
        $('#dt-filter-container').empty();

        const columnsResponse = await fetch('/api/servizi/ge/columns');
        if (!columnsResponse.ok) {
            throw new Error(`Errore nel recupero delle colonne: ${columnsResponse.status}`);
        }
        const columnsData = await columnsResponse.json();

        if (!Array.isArray(columnsData) || columnsData.length === 0) {
            console.warn('Nessuna colonna ricevuta dal server o formato non valido.');
            columnsConfig = []; // Assicura che sia un array vuoto se non ci sono colonne
        } else {
            columnsConfig = columnsData.map((col, idx) => ({
                data: col.field,
                title: col.title || col.field.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase()),
                className: col.field === 'id' ? 'editable' : 'editable', // Rendi tutte le colonne editabili per ora, o applica logica specifica
                visible: typeof col.visible === 'boolean' ? col.visible : (visibleColumnsState.length > 0 ? visibleColumnsState.includes(idx) : true)
            }));
        }

        // Distruggi la tabella DataTables esistente se presente
        if ($.fn.DataTable.isDataTable('#gestione-gs-table')) {
            console.log('[initializeDataTable] Distruzione tabella DataTables esistente.');
            $('#gestione-gs-table').DataTable().destroy();
            $('#gestione-gs-table thead').empty(); // Rimuovi header e footer vecchi
            $('#gestione-gs-table tfoot').empty();
            $('#gestione-gs-table tbody').empty(); // Pulisci anche il corpo della tabella
        }

        const headerRow = `<tr>${columnsConfig.map(c => `<th data-col-id="${c.data}">${c.title}</th>`).join('')}</tr>`;
        $('#gestione-gs-table thead').html(headerRow);
        // Non è necessario creare tfoot se non lo usi per filtri per colonna specifici

        window.table = $('#gestione-gs-table').DataTable({
            processing: true,
            serverSide: true,
            fixedHeader: true,
            deferRender: true,
            ajax: {
                url: '/api/servizi/ge/data',
                type: 'POST',
                contentType: 'application/json',
                data: function (d) {
                    const payload = {
                        ...d,
                        month_filter: $('#month-filter').val() || '',
                        rtc_filter: $('#rtc-filter').val() || ''
                    };
                    // console.log('AJAX request payload:', payload); // Rimosso per pulizia console
                    return JSON.stringify(payload);
                },
                error: handleAjaxError
            },
            columns: columnsConfig,
            dom: '<"dt-controls-temp d-none"lBf>rtip', // 'l' per length, 'B' per buttons, 'f' per filter, 'r' per processing, 't' per table, 'i' per info, 'p' per pagination
            lengthMenu: [[10, 25, 50, 100, 250, -1], [10, 25, 50, 100, 250, "Tutti"]],
            pageLength: 25,
            buttons: [
                {
                    extend: 'colvis',
                    text: 'Visibilità Colonne',
                    className: 'buttons-colvis',
                    // Non è necessario prefixButtons se non hai funzionalità specifiche lì
                }
            ],
            language: { url: "/static/i18n/Italian.json" },
            select: { style: 'single', selector: 'tr' }, // o 'os' per selezione multipla
            drawCallback: function (settings) {
                // console.log('DataTable redrawn (drawCallback).');
                // Non chiamare updateScrollHeader qui perché è già gestito dall'evento 'draw.dt' agganciato in initComplete
            },
            createdRow: function (row, data, dataIndex) {
                $(row).find('td').addClass('editable'); // Rendi tutte le celle editabili
                if (!editModeEnabled) {
                    $(row).find('td.editable').css('cursor', 'not-allowed');
                }
            },
            initComplete: function (settings, json) {
                console.log('[initializeDataTable/initComplete] DataTables initComplete eseguito.');
                const api = this.api();
                window.table = api; // Sovrascrive la variabile globale 'table' con l'istanza API di DataTables

                if (visibleColumnsState.length > 0) {
                    api.columns().every(function (idx) {
                        api.column(idx).visible(visibleColumnsState.includes(idx));
                    });
                }

                // Sposta i controlli DataTables nei contenitori designati
                $('.dataTables_length').appendTo('#dt-length-container');
                $('.dt-buttons').appendTo('#dt-buttons-container');
                $('.dataTables_filter').appendTo('#dt-filter-container');
                $('.dt-controls-temp').remove(); // Rimuovi il contenitore temporaneo

                $('#dt-filter-container input[type="search"]').attr('placeholder', 'Cerca nella tabella...');

                $('#close-filters-panel, .advanced-filters-overlay').off('click').on('click', function () {
                    $('#advanced-filters-panel').removeClass('show');
                    $('.advanced-filters-overlay').removeClass('show');
                });

                if (!$('#reset-filters-btn').length) {
                    const resetBtn = $('<button class="btn btn-warning mb-2 w-100" id="reset-filters-btn" type="button">Azzera tutti i filtri</button>');
                    $('.advanced-filters-header').after(resetBtn);
                    resetBtn.on('click', function () {
                        $('#generic-search').val('');
                        $('.column-filter').val('');
                        if (window.table) {
                            window.table.search('').columns().search('').draw();
                        }
                    });
                }

                const filtersContainer = $('#column-filters-container');
                filtersContainer.empty();
                api.columns().every(function () {
                    const column = this;
                    const columnData = column.settings()[0].aoColumns[column.index()].data;
                    const columnTitle = $(column.header()).text(); // Usa .text() per ottenere il titolo pulito

                    const filterDiv = $(`
                        <div class="filter-item">
                            <label for="filter-${columnData.replace(/\./g, '-')}">${columnTitle}</label> <!-- Sostituisci . con - per ID validi -->
                            <div class="input-group">
                                <input type="text" 
                                       class="form-control column-filter" 
                                       id="filter-${columnData.replace(/\./g, '-')}" 
                                       data-column-name="${columnData}">
                                <div class="dropdown-menu"></div>
                            </div>
                        </div>
                    `);
                    filtersContainer.append(filterDiv);
                    const filterInput = filterDiv.find('.column-filter');
                    const dropdownMenu = filterDiv.find('.dropdown-menu');
                    let allValues = [];
                    let lastMonth = '';
                    let lastFilters = '';

                    function fetchAndShowDropdown(searchText = '') {
                        const colName = filterInput.data('column-name'); // Usa data-column-name
                        const month = $('#month-filter').val() || '';
                        const currentFilters = {}; // Costruisci i filtri attuali per la richiesta
                        $('.column-filter').each(function() {
                            const $input = $(this);
                            const col = $input.data('column-name');
                            const val = $input.val();
                            if (val && col !== colName) { // Escludi il filtro della colonna corrente
                                currentFilters[col] = { value: val, regex: false }; // Semplificato per ora
                            }
                        });
                        const globalSearchVal = $('#generic-search').val();
                        if (globalSearchVal) {
                            currentFilters['global_search'] = { value: globalSearchVal, regex: false};
                        }

                        const filtersStr = encodeURIComponent(JSON.stringify(currentFilters));

                        if (allValues.length > 0 && lastMonth === month && lastFilters === filtersStr && !searchText) {
                            showDropdown(allValues, dropdownMenu, filterInput, column, searchText);
                            return;
                        }
                        filterInput.data('loading', true);
                        dropdownMenu.empty().append('<li><span class="dropdown-item">Caricamento...</span></li>');
                        dropdownMenu.addClass('show');
                        $.ajax({
                            url: `/api/servizi/ge/unique_values`,
                            method: 'GET',
                            data: { column: colName, month: month, filters: filtersStr },
                            success: function (values) {
                                allValues = values || [];
                                lastMonth = month;
                                lastFilters = filtersStr;
                                showDropdown(allValues, dropdownMenu, filterInput, column, searchText);
                            },
                            error: function () {
                                dropdownMenu.empty().append('<li><span class="dropdown-item text-danger">Errore caricamento</span></li>');
                                dropdownMenu.addClass('show');
                            },
                            complete: function () { filterInput.data('loading', false); }
                        });
                    }

                    function showDropdown(values, dropdownMenu, filterInput, column, searchText) {
                        dropdownMenu.empty();
                        const currentSearchText = (searchText || '').toLowerCase().trim();
                        const filteredValues = values.filter(v => {
                            const lowerCaseV = (v || '').toString().toLowerCase().trim();
                            return lowerCaseV.includes(currentSearchText);
                        });
                        if (filteredValues.length === 0) {
                            dropdownMenu.append('<li><span class="dropdown-item">Nessun risultato</span></li>');
                        } else {
                            filteredValues.forEach(value => {
                                const item = $('<li><span class="dropdown-item"></span></li>');
                                item.find('span').text(value);
                                item.on('click', function () {
                                    filterInput.val(value);
                                    column.search('^' + escapeRegex(value) + '$', true, false).draw(); // Ricerca esatta
                                    dropdownMenu.removeClass('show');
                                });
                                dropdownMenu.append(item);
                            });
                        }
                        dropdownMenu.addClass('show');
                    }

                    filterInput.on('focus', function () { fetchAndShowDropdown(this.value); });
                    filterInput.on('blur', function () { setTimeout(() => { dropdownMenu.removeClass('show'); }, 200); });
                    filterInput.on('click', function (e) { fetchAndShowDropdown(this.value); });
                    filterInput.on('keyup', function (e) {
                        if (e.key === 'Enter') {
                            column.search('^' + escapeRegex(this.value) + '$', true, false).draw();
                            dropdownMenu.removeClass('show');
                        } else if (!this.value) {
                            column.search('').draw();
                            dropdownMenu.removeClass('show');
                        } else {
                            fetchAndShowDropdown(this.value);
                        }
                    });
                });

                // Aggancia l'evento draw.dt all'API di DataTables per aggiornare lo scroll orizzontale
                if (api && typeof api.on === 'function') {
                    console.log('[initializeDataTable/initComplete] Agganciando evento draw.dt a DataTables API (api) per scroll.');
                    api.on('draw.dt', function() {
                        console.log('[initializeDataTable/initComplete] Evento draw.dt di DataTables scatenato (per scroll).');
                        const scrollHeaderJQ = $('.table-scroll-header'); 
                        const tableWrapperJQ = $('.table-wrapper-fix');
                        const gestioneGsTableJQ = $('#gestione-gs-table');
                        if(gestioneGsTableJQ.length && gestioneGsTableJQ[0] && scrollHeaderJQ.length && tableWrapperJQ.length){
                            const tableElement = gestioneGsTableJQ[0];
                            const tableWidth = gestioneGsTableJQ.outerWidth(); // Larghezza visibile dell'elemento tabella
                            const scrollWidth = tableElement.scrollWidth; // Larghezza totale del contenuto scrollabile
                            console.log('[draw.dt - scrollHandler] Valori: table.outerWidth():', tableWidth, '| tableElement.scrollWidth:', scrollWidth);
                            $('.table-scroll-header-inner').css('width', scrollWidth + 'px');
                            if (scrollWidth > tableWidth && tableWidth > 0) {
                                console.log('[draw.dt - scrollHandler] -> Mostrando scrollHeader.');
                                scrollHeaderJQ.css('display', 'block');
                            } else {
                                console.log('[draw.dt - scrollHandler] -> Nascondendo scrollHeader.');
                                scrollHeaderJQ.css('display', 'none');
                            }
                        }
                    });
                } else {
                    console.error('[initializeDataTable/initComplete] ERRORE: API DataTables (api) non è valida o manca il metodo .on() per agganciare draw.dt per lo scroll.');
                }

                // Applica la visibilità di default delle colonne in base al backend
                // Questo deve usare l'istanza 'api' o 'window.table' corretta
                window.table.columns().every(function (idx) { 
                    const colDef = columnsConfig[idx];
                    if (typeof colDef.visible === 'boolean') {
                        window.table.column(idx).visible(colDef.visible);
                    }
                });

                // Chiamata finale per assicurare che lo stato iniziale sia corretto
                if (typeof syncHorizontalScroll === 'function') {
                    syncHorizontalScroll(); // Assicura che syncHorizontalScroll sia chiamata dopo che la tabella è completamente pronta
                }
            }
        });

        // Evento per aggiornare il conteggio dei record (già presente e sembra corretto)
        $('#gestione-gs-table').on('draw.dt', function () {
            const info = $(this).DataTable().page.info(); // Usa $(this).DataTable() per ottenere l'istanza API corretta
            const countText = `Vista da ${info.start + 1} a ${info.end} di ${info.recordsDisplay} elementi (filtrati da ${info.recordsTotal} totali)`;
            $('#record-count').text(countText);
        });

        $('#gestione-gs-table').off('click', 'td.editable').on('click', 'td.editable', function () {
            if (!editModeEnabled) {
                const cell = window.table.cell(this); // Usa window.table (API)
                const originalBg = cell.node().style.backgroundColor;
                cell.node().style.backgroundColor = '#ffebee';
                setTimeout(() => cell.node().style.backgroundColor = originalBg, 1000);
                return;
            }

            const cell = window.table.cell(this); // Usa window.table (API)
            const column = cell.index().column;
            const row = cell.index().row;
            const data = cell.data();
            const rowData = window.table.row(row).data(); // Usa window.table (API)
            const columnName = window.table.settings()[0].aoColumns[column].data; // Usa window.table (API)

            const input = $('<input>')
                .attr('type', 'text')
                .addClass('form-control form-control-sm')
                .val(data)
                .css({ 'width': '100%', 'height': '100%', 'border': '1px solid #ddd', 'padding': '0.25rem', 'box-sizing': 'border-box', 'background-color': '#fff' });

            $(cell.node()).css('position', 'relative');
            input.on('click', function (e) { e.stopPropagation(); });

            input.off('blur keypress').on('blur keypress', function (e) {
                if (e.type === 'keypress' && e.which !== 13) return;
                const newValue = $(this).val();
                if (newValue === data) {
                    $(cell.node()).empty().text(data);
                    return;
                }
                fetch('/api/servizi/ge/update', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ pk: rowData.ID, field: columnName, value: newValue })
                })
                .then(response => {
                    if (!response.ok) throw new Error('Errore nella risposta del server');
                    return response.json();
                })
                .then(result => {
                    if (result.status === 'success') {
                        $(cell.node()).empty();
                        cell.data(newValue).draw(false); // Usa draw(false) per non resettare la paginazione
                    } else {
                        throw new Error(result.message || 'Errore durante l\'aggiornamento');
                    }
                })
                .catch(error => {
                    console.error('Errore:', error);
                    $(cell.node()).empty();
                    cell.data(data).draw(false); // Ripristina e ridisegna senza resettare la paginazione
                    if (error.message !== 'Errore nella risposta del server') {
                        alert(error.message);
                    }
                });
            });
            $(cell.node()).html(input);
            input.focus();
        });
    } catch (error) {
        handleError(error, 'Errore durante il caricamento della tabella');
    } finally {
        // Nascondi l'indicatore di caricamento se esiste
        const loadingIndicator = document.getElementById('loading-indicator');
        if (loadingIndicator) loadingIndicator.style.display = 'none';
        const tableElement = $('#gestione-gs-table');
        if (tableElement.length) tableElement.show(); // Mostra la tabella
    }
}

function syncHorizontalScroll() {
    const tableWrapper = $('.table-wrapper-fix');
    const scrollHeader = $('.table-scroll-header');
    const tablejQuery = $('#gestione-gs-table'); // Riferimento jQuery all'elemento tabella
    
    if (!tableWrapper.length) {
        console.error('[syncHorizontalScroll] Elemento .table-wrapper-fix non trovato.');
        return;
    }
    if (!scrollHeader.length) {
        console.error('[syncHorizontalScroll] Elemento .table-scroll-header non trovato.');
        return;
    }
    if (!tablejQuery.length) {
        console.error('[syncHorizontalScroll] Elemento #gestione-gs-table non trovato.');
        return;
    }
    
    // Funzione per aggiornare la visibilità e larghezza dello scroll header
    // Questa funzione ora è definita qui e può essere chiamata da diversi posti.
    window.updateCustomScrollHeader = function() { // Esponila globalmente o passala come callback se preferisci
        if (!tablejQuery.length || !tablejQuery[0]) { 
            console.error('[updateCustomScrollHeader] Elemento DOM della tabella #gestione-gs-table non trovato tramite jQuery.');
            return;
        }
        const tableElement = tablejQuery[0]; 
        const tableOuterWidth = tablejQuery.outerWidth(); 
        const tableScrollWidth = tableElement.scrollWidth; 
        
        console.log('[updateCustomScrollHeader] --- ESEGUITA ---');
        console.log('[updateCustomScrollHeader] Valori: tablejQuery.outerWidth():', tableOuterWidth, '| tableElement.scrollWidth:', tableScrollWidth);
        
        $('.table-scroll-header-inner').css('width', tableScrollWidth + 'px');
        
        if (tableScrollWidth > tableOuterWidth && tableOuterWidth > 0) { 
            console.log('[updateCustomScrollHeader] -> Mostrando scrollHeader.');
            scrollHeader.css('display', 'block');
        } else {
            console.log('[updateCustomScrollHeader] -> Nascondendo scrollHeader (scrollWidth <= tableWidth o tableWidth == 0).');
            scrollHeader.css('display', 'none');
        }
    }
    
    console.log('[syncHorizontalScroll] Event listener per window resize aggiunto.');
    $(window).on('resize', window.updateCustomScrollHeader);
    
    console.log('[syncHorizontalScroll] Event listener per tableWrapper scroll aggiunto.');
    tableWrapper.on('scroll', function() {
        scrollHeader.scrollLeft($(this).scrollLeft());
    });
    
    console.log('[syncHorizontalScroll] Event listener per scrollHeader scroll aggiunto.');
    scrollHeader.on('scroll', function() {
        tableWrapper.scrollLeft($(this).scrollLeft());
    });
        
    console.log('[syncHorizontalScroll] Chiamata iniziale a updateCustomScrollHeader (dopo 100ms).');
    setTimeout(window.updateCustomScrollHeader, 100); 
}

async function initializeGestioneGSControls() {
    console.log('TEST: initializeGestioneGSControls CHIAMATA ORA!');
    console.log('Inizializzazione controlli GS...');
    
    // Inizializza la tabella. La variabile globale 'table' (DataTables API) sarà impostata qui.
    await initializeDataTable(); 
    
    // Sincronizza lo scroll orizzontale. Ora può usare l'API di DataTables se necessario.
    syncHorizontalScroll();

    const monthFilter = document.getElementById('month-filter');
    if (!monthFilter) {
        console.log('Month filter non trovato');
        return;
    }

    initializeToggle();
    addColumnViewModeButton();

    if (monthFilter.options.length <= 1) {
        try {
            const response = await fetch('/api/servizi/ge/months');
            const months = await response.json();
            if (monthFilter.options.length <= 1) {
                months.forEach(m => monthFilter.add(new Option(m, m)));
            }
        } catch (error) {
            console.error('Errore nel caricamento dei mesi:', error);
        }
    }

    $('#month-filter').off('change').on('change', async function () {
        const selectedMonth = $(this).val();
        console.log('Month filter changed. Selected month:', selectedMonth);

        // Mostra l'indicatore di caricamento se esiste
        const loadingIndicator = document.getElementById('loading-indicator');
        if (loadingIndicator) loadingIndicator.style.display = 'block';
        const tableElement = $('#gestione-gs-table');
        if (tableElement.length) tableElement.hide();

        if (!selectedMonth) {
            console.log('No month selected. Clearing table if exists.');
            if ($.fn.DataTable.isDataTable('#gestione-gs-table') && window.table) {
                window.table.clear().draw();
            }
            if (loadingIndicator) loadingIndicator.style.display = 'none';
            if (tableElement.length) tableElement.show();
            return;
        }

        if ($.fn.DataTable.isDataTable('#gestione-gs-table') && window.table) {
            console.log('DataTable already initialized. Reloading data.');
            // L'evento 'draw.dt' gestirà l'aggiornamento dello scroll header
            window.table.ajax.reload(() => {
                if (loadingIndicator) loadingIndicator.style.display = 'none';
                if (tableElement.length) tableElement.show();
            });
        } else {
            console.log('DataTable not initialized. Initializing table.');
            await initializeDataTable(); // Questo ora gestirà anche l'aggiornamento dello scroll header tramite initComplete/draw.dt
        }
        aggiornaFiltroRTC();
    });

    $('#generic-search').off('keyup').on('keyup', function (e) {
        if (e.key === 'Enter' || this.value === '') {
            if (window.table) { // Usa window.table (API)
                window.table.search(this.value).draw();
                aggiornaFiltroRTC();
            }
        }
    });

    $('#advanced-filters-btn').off('click').on('click', function () {
        $('#advanced-filters-panel').addClass('show');
        $('.advanced-filters-overlay').addClass('show');
    });

    $('#close-filters-panel, .advanced-filters-overlay').off('click').on('click', function () {
        $('#advanced-filters-panel').removeClass('show');
        $('.advanced-filters-overlay').removeClass('show');
    });

    $('#rtc-filter').off('change').on('change', function () {
        if (window.table) { // Usa window.table (API)
            window.table.ajax.reload();
        }
    });

    // Rimosso: if (!$.fn.DataTable.isDataTable('#gestione-gs-table')) { await initializeDataTable(); }
    // perché initializeDataTable() è già chiamata all'inizio di initializeGestioneGSControls.

    $('#exportBtn').off('click').on('click', handleExport);
}

function patchRicercaSoloInvio() {
    var $input = $('#dt-filter-container input[type="search"]');
    if ($input.length) {
        $input.off('input keyup'); // Rimuovi handler precedenti
        $input.on('keyup', function (e) {
            if (e.key === 'Enter') {
                if (window.table) {
                    window.table.search(this.value).draw();
                }
            }
        });
    }
}

$(document).on('init.dt', function(e, settings) {
    if (settings.nTable && settings.nTable.id === 'gestione-gs-table') {
        console.log('[document/init.dt] Evento init.dt per #gestione-gs-table scatenato.');
        patchRicercaSoloInvio();
        afterDataTableInit(); // Chiamata qui per assicurare che la tabella sia pronta
    }
});

$(document).on('draw.dt', function(e, settings) {
    if (settings.nTable && settings.nTable.id === 'gestione-gs-table') {
        // La logica per lo scrollbar è ora dentro initComplete e si auto-aggiorna con draw.dt
        // La logica per il conteggio record è già in table.on('draw', ...)
        // La logica per applyColumnViewMode è già qui

        // Rimuovo i log duplicati o non necessari da qui per pulizia
        // console.debug('[TOOLTIP DEBUG] Numero di <td> nella tabella:', $(settings.nTable).find('td').length);

        // Gestione info DataTables (già presente e sembra ok)
        const $wrapper = $(settings.nTable).closest('.dataTables_wrapper');
        $wrapper.find('.dataTables_info').hide();
        $wrapper.find('.dataTables_info:last-of-type').show(); 

        // Gestione paginazione (già presente)
        const $paginate = $wrapper.find('.dataTables_paginate');
        const $scrollWrapper = $('.table-wrapper-fix'); // Assicurati che questo sia il contenitore corretto
        if ($paginate.length && $scrollWrapper.length) {
            $scrollWrapper.append($paginate); // Questo sposta la paginazione sotto la tabella scrollabile
        }

        // Gestione modalità colonne (già presente)
        applyColumnViewMode('#gestione-gs-table');
        const switchInput = document.getElementById('toggle-column-view-mode');
        if (switchInput) {
            switchInput.checked = (columnViewMode === 'fixedwrap');
            const label = switchInput.parentElement.querySelector('label');
            if (label) {
                label.textContent = columnViewMode === 'fixedwrap' ? 'Colonne tutte uguali' : 'Colonne autosize';
            }
        }
    }
});

document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') {
        const rtcFilter = document.getElementById('rtc-filter');
        if (rtcFilter) {
            rtcFilter.value = '';
            rtcFilter.dispatchEvent(new Event('change'));
        }
        const searchInput = document.getElementById('generic-search');
        if (searchInput) {
            searchInput.value = '';
        }
        if (window.table) {
            window.table.search('').columns().search('').draw();
        }
        document.querySelectorAll('.column-filter').forEach(input => input.value = '');
        $('#advanced-filters-panel').removeClass('show');
        $('.advanced-filters-overlay').removeClass('show');
    }
});

const COLUMN_WIDTHS_KEY = 'gsTableColWidths';

function saveColumnWidths(tableSelector) {
    const tableEl = document.querySelector(tableSelector);
    if (!tableEl) return;
    const thEls = tableEl.querySelectorAll('thead th');
    const widths = {};
    thEls.forEach(th => {
        const colId = th.getAttribute('data-col-id');
        if (colId) widths[colId] = th.offsetWidth;
    });
    localStorage.setItem(COLUMN_WIDTHS_KEY, JSON.stringify(widths));
}

function loadColumnWidths(tableSelector) {
    const tableEl = document.querySelector(tableSelector);
    if (!tableEl) return;
    const widths = JSON.parse(localStorage.getItem(COLUMN_WIDTHS_KEY) || '{}');
    if (!widths || typeof widths !== 'object') return;
    const thEls = tableEl.querySelectorAll('thead th');
    Object.entries(widths).forEach(([colId, width]) => {
        const th = Array.from(thEls).find(th => th.getAttribute('data-col-id') === colId);
        if (!th) return;
        const colIdx = Array.from(th.parentNode.children).indexOf(th);
        if (colIdx !== -1) {
            // Applica solo a th, DataTables gestirà le celle del corpo
            th.style.width = width + 'px';
            th.style.minWidth = width + 'px';
            th.style.maxWidth = width + 'px';
        }
    });
}

function enableColumnResize(tableSelector) {
    const tableEl = document.querySelector(tableSelector);
    if (!tableEl) return;
    const thEls = tableEl.querySelectorAll('thead th');
    thEls.forEach((th) => {
        const colId = th.getAttribute('data-col-id');
        if (!colId || th.querySelector('.col-resizer')) return; // Evita di aggiungere più volte
        
        th.style.position = 'relative';
        const resizer = document.createElement('div');
        resizer.className = 'col-resizer';
        resizer.style.position = 'absolute';
        resizer.style.top = '0';
        resizer.style.right = '-3px'; // Posiziona leggermente fuori per facilitare il click
        resizer.style.width = '6px';
        resizer.style.height = '100%';
        resizer.style.cursor = 'col-resize';
        resizer.style.userSelect = 'none';
        resizer.style.zIndex = '10'; // Assicura che sia sopra altri elementi della cella
        th.appendChild(resizer);

        let startX, startWidth;
        const onMouseMove = (e2) => {
            const newWidth = Math.max(40, startWidth + (e2.pageX - startX));
            th.style.width = newWidth + 'px';
            th.style.minWidth = newWidth + 'px';
            th.style.maxWidth = newWidth + 'px';
        };

        const onMouseUp = () => {
            document.removeEventListener('mousemove', onMouseMove);
            document.removeEventListener('mouseup', onMouseUp);
            document.body.style.cursor = '';
            tableEl.classList.remove('resizing-columns');
            // tableEl.style.pointerEvents = ''; // Rimosso, causava problemi
            saveColumnWidths(tableSelector);
            if (window.table) {
                window.table.columns.adjust().draw(false); // Ridisegna senza resettare la paginazione
            }
        };

        resizer.addEventListener('mousedown', function (e) {
            e.preventDefault();
            e.stopPropagation();
            startX = e.pageX;
            startWidth = th.offsetWidth;
            document.body.style.cursor = 'col-resize';
            tableEl.classList.add('resizing-columns');
            // tableEl.style.pointerEvents = 'none'; // Rimosso, causava problemi
            document.addEventListener('mousemove', onMouseMove);
            document.addEventListener('mouseup', onMouseUp, { once: true });
        });
    });
}

function setColumnsAutosize(tableSelector) {
    const tableEl = document.querySelector(tableSelector);
    if (!tableEl) return;
    const thEls = tableEl.querySelectorAll('thead th');
    thEls.forEach(th => {
        th.style.width = ''; 
        th.style.minWidth = ''; 
        th.style.maxWidth = '';
    });
    // DataTables dovrebbe ridisegnare le colonne automaticamente, ma forziamo un aggiustamento
    if (window.table) {
        window.table.columns.adjust().draw(false);
    }
    // Non è necessario iterare sulle celle del corpo per resettare gli stili, DataTables lo gestisce
}

function setColumnsFixedWrap(tableSelector) {
    const tableEl = document.querySelector(tableSelector);
    if (!tableEl) return;
    const thEls = tableEl.querySelectorAll('thead th');
    thEls.forEach(th => {
        th.style.width = '150px'; 
        th.style.minWidth = '150px'; 
        th.style.maxWidth = '150px';
        // Per il wrapping, DataTables dovrebbe gestire questo tramite CSS sulla tabella o sulle celle
        // Ma se necessario, si può aggiungere qui:
        // th.style.whiteSpace = 'normal'; 
    });
    // Applica anche alle celle del corpo se necessario, ma DataTables dovrebbe farlo
    if (window.table) {
        window.table.columns.adjust().draw(false);
    }
}

function applyColumnViewMode(tableSelector) {
    const tableEl = document.querySelector(tableSelector);
    if (!tableEl) return;
    const tableWrapper = tableEl.closest('.dataTables_scrollBody') || tableEl.closest('.dataTables_wrapper') || tableEl.parentElement;
    const scrollLeft = tableWrapper ? tableWrapper.scrollLeft : 0;

    if (columnViewMode === 'autosize') {
        setColumnsAutosize(tableSelector);
    } else {
        setColumnsFixedWrap(tableSelector);
    }

    if (tableWrapper) {
        // Ripristina la posizione di scroll dopo un breve ritardo per permettere il ridisegno
        setTimeout(() => { tableWrapper.scrollLeft = scrollLeft; }, 0);
    }
}

function addColumnViewModeButton() {
    if ($('#toggle-column-view-mode').length) return;
    const switchHtml = `
        <div class="form-check form-switch d-inline-flex align-items-center ms-2" id="column-view-mode-switch-wrapper">
            <input class="form-check-input" type="checkbox" id="toggle-column-view-mode">
            <label class="form-check-label small ms-1" for="toggle-column-view-mode">Colonne autosize</label>
        </div>`;
    const $switch = $(switchHtml);
    const $editModeToggle = $('#toggle-edit-mode').parent();
    if ($editModeToggle.length) {
        $editModeToggle.after($switch);
    } else {
        // Fallback se il toggle di modifica non è presente
        $('#dt-buttons-container').before($switch);
    }
    
    const toggleInput = $switch.find('input');
    const toggleLabel = $switch.find('label');

    // Imposta lo stato iniziale dello switch in base a columnViewMode
    if (columnViewMode === 'fixedwrap') {
        toggleInput.prop('checked', true);
        toggleLabel.text('Colonne tutte uguali');
    } else {
        toggleInput.prop('checked', false);
        toggleLabel.text('Colonne autosize');
    }

    toggleInput.on('change', function () {
        if (this.checked) {
            columnViewMode = 'fixedwrap';
            toggleLabel.text('Colonne tutte uguali');
        } else {
            columnViewMode = 'autosize';
            toggleLabel.text('Colonne autosize');
        }
        applyColumnViewMode('#gestione-gs-table');
    });
}

function afterDataTableInit() {
    console.log('[afterDataTableInit] Chiamata.');
    // applyCellOverflowStyles('#gestione-gs-table'); // Funzione non definita, commentata
    enableColumnResize('#gestione-gs-table');
    // enableCellTooltip('#gestione-gs-table'); // Funzione non definita, commentata
    loadColumnWidths('#gestione-gs-table');
    applyColumnViewMode('#gestione-gs-table');
    addColumnViewModeButton();
}

// Evento init.dt di DataTables: viene chiamato una volta che la tabella è completamente inizializzata
$(document).on('init.dt', function(e, settings) {
    if (settings.nTable && settings.nTable.id === 'gestione-gs-table') {
        console.log('[document/init.dt] Evento init.dt per #gestione-gs-table scatenato.');
        patchRicercaSoloInvio();
        afterDataTableInit(); 
    }
});

// Evento draw.dt di DataTables: viene chiamato ad ogni ridisegno della tabella
$(document).on('draw.dt', function(e, settings) {
    if (settings.nTable && settings.nTable.id === 'gestione-gs-table') {
        // La logica per lo scrollbar è ora gestita DENTRO initComplete, agganciata all'evento draw.dt dell'API DataTables
        // Questo handler $(document).on('draw.dt'...) è per eventi jQuery generici, non specifici dell'istanza DataTables
        // Quindi, la logica di update dello scrollbar qui potrebbe essere ridondante o conflittuale se non gestita attentamente.
        // È meglio che updateScrollHeader sia chiamata dall'handler specifico dell'istanza DataTables.

        // Gestione info DataTables
        const $wrapper = $(settings.nTable).closest('.dataTables_wrapper');
        $wrapper.find('.dataTables_info').hide();
        $wrapper.find('.dataTables_info:last-of-type').show(); 

        // Gestione paginazione
        const $paginate = $wrapper.find('.dataTables_paginate');
        const $tableWrapperFix = $('.table-wrapper-fix'); // Usiamo la classe definita per il contenitore scrollabile
        if ($paginate.length && $tableWrapperFix.length) {
            // Invece di spostare la paginazione, assicuriamoci che sia visibile e stilizzata correttamente
            // $tableWrapperFix.append($paginate); // Questa riga è stata commentata perché potrebbe causare problemi di layout
        }

        // Gestione modalità colonne
        applyColumnViewMode('#gestione-gs-table'); // Assicura che la modalità colonne sia applicata dopo ogni disegno
        const switchInput = document.getElementById('toggle-column-view-mode');
        if (switchInput) {
            switchInput.checked = (columnViewMode === 'fixedwrap');
            const label = switchInput.parentElement.querySelector('label');
            if (label) {
                label.textContent = columnViewMode === 'fixedwrap' ? 'Colonne tutte uguali' : 'Colonne autosize';
            }
        }
    }
});

document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') {
        const rtcFilter = document.getElementById('rtc-filter');
        if (rtcFilter) {
            rtcFilter.value = '';
            // Disparare un evento 'change' per far reagire DataTables se necessario
            $(rtcFilter).trigger('change'); 
        }
        const searchInput = document.getElementById('generic-search');
        if (searchInput) {
            searchInput.value = '';
            // Disparare un evento 'keyup' o 'change' per far reagire DataTables se necessario
             if (window.table) { window.table.search('').draw(); } 
        }
        document.querySelectorAll('.column-filter').forEach(input => {
            $(input).val('').trigger('keyup'); // Simula un keyup per far scattare il filtro DataTables
        });
        $('#advanced-filters-panel').removeClass('show');
        $('.advanced-filters-overlay').removeClass('show');
        // Non è necessario ridisegnare esplicitamente la tabella qui se i filtri lo fanno già
    }
});