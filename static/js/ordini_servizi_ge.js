let table; // Questa variabile globale 'table' verrà usata per l'API di DataTables
let editModeEnabled = false;
let visibleColumnsState = [];
let columnsConfig = [];
let lastRTCValues = null;
let columnViewMode = 'fixedwrap'; // Modalità di visualizzazione colonne: 'autosize' o 'fixedwrap'
let cellTooltipSingleton = null;
let cellTooltipListenersAdded = false;

// Variabile globale per tracciare la posizione di scroll orizzontale
window.lastTableScrollLeft = 0;

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
        if (window.table) {
            window.table.clear().draw();
        }
        return;
    }

    const loadingIndicator = document.getElementById('loading-indicator');
    if (loadingIndicator) loadingIndicator.style.display = 'block';
    const tableElement = $('#gestione-gs-table');
    if (tableElement.length) tableElement.hide();

    try {
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
            columnsConfig = [];
        } else {
            columnsConfig = columnsData.map((col, idx) => ({
                data: col.field,
                title: col.title || col.field.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase()),
                className: col.field === 'id' ? 'editable' : 'editable',
                visible: typeof col.visible === 'boolean' ? col.visible : (visibleColumnsState.length > 0 ? visibleColumnsState.includes(idx) : true)
            }));
        }

        if ($.fn.DataTable.isDataTable('#gestione-gs-table')) {
            console.log('[initializeDataTable] Distruzione tabella DataTables esistente.');
            $('#gestione-gs-table').DataTable().destroy();
            $('#gestione-gs-table thead').empty();
            $('#gestione-gs-table tfoot').empty();
            $('#gestione-gs-table tbody').empty();
        }

        const headerRow = `<tr>${columnsConfig.map(c => `<th data-col-id="${c.data}">${c.title}</th>`).join('')}</tr>`;
        $('#gestione-gs-table thead').html(headerRow);

        window.table = $('#gestione-gs-table').DataTable({
            processing: true,
            serverSide: true,
            fixedHeader: false,
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
                    return JSON.stringify(payload);
                },
                error: handleAjaxError
            },
            columns: columnsConfig,
            dom: '<"dt-controls-temp d-none"lBf>rtip',
            lengthMenu: [[10, 25, 50, 100, 250, -1], [10, 25, 50, 100, 250, "Tutti"]],
            pageLength: 25,
            buttons: [
                {
                    extend: 'colvis',
                    text: 'Visibilità Colonne',
                    className: 'buttons-colvis',
                }
            ],
            language: { url: "/static/i18n/Italian.json" },
            select: { style: 'single', selector: 'tr' },
            drawCallback: function (settings) {
            },
            createdRow: function (row, data, dataIndex) {
                $(row).find('td').addClass('editable');
                if (!editModeEnabled) {
                    $(row).find('td.editable').css('cursor', 'not-allowed');
                }
            },
            initComplete: function (settings, json) {
                console.log('[initializeDataTable/initComplete] DataTables initComplete eseguito.');
                const api = this.api();
                window.table = api;

                if (visibleColumnsState.length > 0) {
                    api.columns().every(function (idx) {
                        api.column(idx).visible(visibleColumnsState.includes(idx));
                    });
                }

                $('.dataTables_length').appendTo('#dt-length-container');
                $('.dt-buttons').appendTo('#dt-buttons-container');
                $('.dataTables_filter').appendTo('#dt-filter-container');
                $('.dt-controls-temp').remove();

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
                    const columnTitle = $(column.header()).text();

                    const filterDiv = $(`
                        <div class="filter-item">
                            <label for="filter-${columnData.replace(/\./g, '-')}">${columnTitle}</label>
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
                        const colName = filterInput.data('column-name');
                        const month = $('#month-filter').val() || '';
                        const currentFilters = {};
                        $('.column-filter').each(function () {
                            const $input = $(this);
                            const col = $input.data('column-name');
                            const val = $input.val();
                            if (val && col !== colName) {
                                currentFilters[col] = { value: val, regex: false };
                            }
                        });
                        const globalSearchVal = $('#generic-search').val();
                        if (globalSearchVal) {
                            currentFilters['global_search'] = { value: globalSearchVal, regex: false };
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
                                    column.search('^' + escapeRegex(value) + '$', true, false).draw();
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

                if (api && typeof api.on === 'function') {
                    console.log('[initializeDataTable/initComplete] Agganciando evento draw.dt a DataTables API (api) per scroll.');
                    api.off('draw.dt.scrollHeader');
                    api.on('draw.dt.scrollHeader', function () {
                        // console.log('[initializeDataTable/initComplete] Evento draw.dt di DataTables scatenato (per scroll).');
                        if (typeof window.updateCustomScrollHeader === 'function') {
                            window.updateCustomScrollHeader();
                        }
                    });
                } else {
                    console.error('[initializeDataTable/initComplete] ERRORE: API DataTables (api) non è valida o manca il metodo .on() per agganciare draw.dt per lo scroll.');
                }

                window.table.columns().every(function (idx) {
                    const colDef = columnsConfig[idx];
                    if (typeof colDef.visible === 'boolean') {
                        window.table.column(idx).visible(colDef.visible);
                    }
                });

                if (typeof syncHorizontalScroll === 'function') {
                    syncHorizontalScroll();
                }
            }
        });

        $('#gestione-gs-table').off('draw.dt.recordCount').on('draw.dt.recordCount', function () {
            const info = $(this).DataTable().page.info();
            const countText = `Vista da ${info.start + 1} a ${info.end} di ${info.recordsDisplay} elementi (filtrati da ${info.recordsTotal} totali)`;
            $('#record-count').text(countText);
        });

        $('#gestione-gs-table').off('click', 'td.editable').on('click', 'td.editable', function () {
            if (!editModeEnabled) {
                const cell = window.table.cell(this);
                const originalBg = cell.node().style.backgroundColor;
                cell.node().style.backgroundColor = '#ffebee';
                setTimeout(() => cell.node().style.backgroundColor = originalBg, 1000);
                return;
            }

            const cell = window.table.cell(this);
            const column = cell.index().column;
            const row = cell.index().row;
            const data = cell.data();
            const rowData = window.table.row(row).data();
            const columnName = window.table.settings()[0].aoColumns[column].data;

            let editor;
            if (columnViewMode === 'autosize') {
                editor = $('<textarea>')
                    .addClass('form-control form-control-sm autosize-editor')
                    .val(data)
                    .css({
                        'width': '100%',
                        'min-height': '2.2em',
                        'height': 'auto',
                        'border': '1px solid #ddd',
                        'padding': '0.25rem',
                        'box-sizing': 'border-box',
                        'background-color': '#fff',
                        'resize': 'vertical',
                        'overflow-y': 'auto',
                        'white-space': 'pre-wrap',
                        'font-family': 'inherit',
                        'font-size': 'inherit'
                    });
                // Adatta l'altezza al contenuto
                setTimeout(() => {
                    editor[0].style.height = 'auto';
                    editor[0].style.height = editor[0].scrollHeight + 'px';
                }, 0);
                editor.on('input', function () {
                    this.style.height = 'auto';
                    this.style.height = this.scrollHeight + 'px';
                });
            } else {
                editor = $('<input>')
                    .attr('type', 'text')
                    .addClass('form-control form-control-sm')
                    .val(data)
                    .css({ 'width': '100%', 'height': '100%', 'border': '1px solid #ddd', 'padding': '0.25rem', 'box-sizing': 'border-box', 'background-color': '#fff' });
            }

            $(cell.node()).css('position', 'relative');
            editor.on('click', function (e) { e.stopPropagation(); });

            editor.off('blur keypress').on('blur keypress', function (e) {
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
                            cell.data(newValue).draw(false);
                        } else {
                            throw new Error(result.message || 'Errore durante l\'aggiornamento');
                        }
                    })
                    .catch(error => {
                        console.error('Errore:', error);
                        $(cell.node()).empty();
                        cell.data(data).draw(false);
                        if (error.message !== 'Errore nella risposta del server') {
                            alert(error.message);
                        }
                    });
            });
            $(cell.node()).html(editor);
            editor.focus();
        });
    } catch (error) {
        handleError(error, 'Errore durante il caricamento della tabella');
    } finally {
        const loadingIndicator = document.getElementById('loading-indicator');
        if (loadingIndicator) loadingIndicator.style.display = 'none';
        const tableElement = $('#gestione-gs-table');
        if (tableElement.length) tableElement.show();
    }
}

function syncHorizontalScroll() {
    const tableWrapper = $('.table-wrapper-fix');
    const scrollHeader = $('.table-scroll-header');
    const tablejQuery = $('#gestione-gs-table');

    if (!tableWrapper.length) {
        // console.error('[syncHorizontalScroll] Elemento .table-wrapper-fix non trovato.');
        return;
    }
    if (!scrollHeader.length) {
        // console.error('[syncHorizontalScroll] Elemento .table-scroll-header non trovato.');
        return;
    }
    if (!tablejQuery.length) {
        // console.error('[syncHorizontalScroll] Elemento #gestione-gs-table non trovato.');
        return;
    }

    window.updateCustomScrollHeader = function () {
        if (!tablejQuery.length || !tablejQuery[0] || !tableWrapper.length || !scrollHeader.length) {
            return;
        }
        const tableElement = tablejQuery[0];
        const wrapperWidth = tableWrapper.outerWidth();
        const tableScrollWidth = tableElement.scrollWidth;

        // console.log('[updateCustomScrollHeader] Valori: wrapperWidth:', wrapperWidth, '| tableScrollWidth:', tableScrollWidth);

        scrollHeader.find('.table-scroll-header-inner').css('width', tableScrollWidth + 'px');

        if (tableScrollWidth > wrapperWidth && wrapperWidth > 0) {
            scrollHeader.css('display', 'block');
        } else {
            scrollHeader.css('display', 'none');
        }
    }

    $(window).off('resize.customScroll').on('resize.customScroll', window.updateCustomScrollHeader);
    tableWrapper.off('scroll.customScroll').on('scroll.customScroll', function () {
        if (scrollHeader.length) scrollHeader.scrollLeft($(this).scrollLeft());
    });
    scrollHeader.off('scroll.customScroll').on('scroll.customScroll', function () {
        if (tableWrapper.length) tableWrapper.scrollLeft($(this).scrollLeft());
    });

    setTimeout(window.updateCustomScrollHeader, 150); // Aumentato leggermente il timeout
}

async function initializeGestioneGSControls() {
    console.log('Inizializzazione controlli GS...');

    await initializeDataTable();
    syncHorizontalScroll();

    const monthFilter = document.getElementById('month-filter');
    if (!monthFilter) {
        console.log('Month filter non trovato');
        return;
    }

    initializeToggle();
    // addColumnViewModeButton è chiamato in afterDataTableInit per assicurare che window.table esista

    if (monthFilter.options.length <= 1) {
        try {
            const response = await fetch('/api/servizi/ge/months');
            if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
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
        const loadingIndicator = document.getElementById('loading-indicator');
        const tableElement = $('#gestione-gs-table');

        if (loadingIndicator) loadingIndicator.style.display = 'block';
        if (tableElement.length) tableElement.hide();

        if (!selectedMonth) {
            if (window.table) {
                window.table.clear().draw();
            }
            if (loadingIndicator) loadingIndicator.style.display = 'none';
            if (tableElement.length) tableElement.show();
            // window.updateCustomScrollHeader(); // Chiamato da draw event
            return;
        }

        if ($.fn.DataTable.isDataTable('#gestione-gs-table') && window.table) {
            window.table.ajax.reload(() => {
                if (loadingIndicator) loadingIndicator.style.display = 'none';
                if (tableElement.length) tableElement.show();
                // window.updateCustomScrollHeader(); // Chiamato da draw event
            });
        } else {
            await initializeDataTable();
        }
        aggiornaFiltroRTC();
    });

    $('#generic-search').off('keyup').on('keyup', function (e) {
        if (e.key === 'Enter' || this.value === '') {
            if (window.table) {
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
        if (window.table) {
            window.table.ajax.reload();
        }
    });

    $('#exportBtn').off('click').on('click', handleExport);
}

function patchRicercaSoloInvio() {
    var $input = $('#dt-filter-container input[type="search"]');
    if ($input.length) {
        $input.off('input keyup');
        $input.on('keyup', function (e) {
            if (e.key === 'Enter') {
                if (window.table) {
                    window.table.search(this.value).draw();
                }
            }
        });
    }
}

$(document).off('init.dt.gestioneGS').on('init.dt.gestioneGS', function (e, settings) {
    if (settings.nTable && settings.nTable.id === 'gestione-gs-table') {
        console.log('[document/init.dt.gestioneGS] Evento init.dt per #gestione-gs-table scatenato.');
        patchRicercaSoloInvio();
        afterDataTableInit();
    }
});

// Listener per aggiornare la variabile ogni volta che l'utente scrolla orizzontalmente
$(document).on('scroll', '.table-wrapper-fix', function () {
    window.lastTableScrollLeft = $(this).scrollLeft();
});

$(document).off('draw.dt.gestioneGS').on('draw.dt.gestioneGS', function (e, settings) {
    if (settings.nTable && settings.nTable.id === 'gestione-gs-table') {
        const $wrapper = $(settings.nTable).closest('.dataTables_wrapper');
        $wrapper.find('.dataTables_info').hide();
        $wrapper.find('.dataTables_info:last-of-type').show();

        const $paginate = $wrapper.find('.dataTables_paginate');
        const $tableWrapperFix = $('.table-wrapper-fix');
        if ($paginate.length && $tableWrapperFix.length && !$tableWrapperFix.find('.dataTables_paginate').length) {
            $tableWrapperFix.append($paginate); // Sposta solo se non già presente
        }

        applyColumnViewMode('#gestione-gs-table', true);
        // Ripristina sempre la posizione di scroll orizzontale salvata
        if ($tableWrapperFix.length) {
            setTimeout(function () { $tableWrapperFix.scrollLeft(window.lastTableScrollLeft || 0); }, 30);
        }

        const switchInput = document.getElementById('toggle-column-view-mode');
        if (switchInput) {
            switchInput.checked = (columnViewMode === 'fixedwrap');
            const label = switchInput.parentElement.querySelector('label');
            if (label) {
                label.textContent = columnViewMode === 'fixedwrap' ? 'Colonne tutte uguali' : 'Colonne autosize';
            }
        }
        // window.updateCustomScrollHeader(); // Chiamato dall'handler specifico dell'istanza DataTables su draw.dt.scrollHeader
    }
});

document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') {
        const rtcFilter = document.getElementById('rtc-filter');
        if (rtcFilter) {
            rtcFilter.value = '';
            $(rtcFilter).trigger('change');
        }
        const searchInput = document.getElementById('generic-search');
        if (searchInput) {
            searchInput.value = '';
            if (window.table) { window.table.search('').draw(); }
        }
        document.querySelectorAll('.column-filter').forEach(input => {
            $(input).val('').trigger('keyup');
        });
        $('#advanced-filters-panel').removeClass('show');
        $('.advanced-filters-overlay').removeClass('show');
    }
});

const COLUMN_WIDTHS_KEY = 'gsTableColWidths';

function saveColumnWidths(tableSelector) {
    const tableEl = document.querySelector(tableSelector);
    if (!tableEl || !window.table) return;
    const widths = {};
    $(tableEl).find('thead th').each(function () {
        const th = $(this);
        const colId = th.attr('data-col-id');
        if (colId) widths[colId] = th.css('width'); // Salva la larghezza CSS effettiva
    });
    localStorage.setItem(COLUMN_WIDTHS_KEY, JSON.stringify(widths));
}

function loadColumnWidths(tableSelector) {
    const tableEl = document.querySelector(tableSelector);
    if (!tableEl || !window.table) return;
    const widths = JSON.parse(localStorage.getItem(COLUMN_WIDTHS_KEY) || '{}');
    if (!widths || typeof widths !== 'object') return;

    let requiresAdjust = false;
    window.table.columns().every(function (colIdx) {
        const column = this;
        const colData = column.settings()[0].aoColumns[colIdx].data;
        const th = $(column.header());
        if (widths[colData]) {
            th.css('width', widths[colData]);
            th.css('min-width', widths[colData]);
            requiresAdjust = true;
        }
    });
    if (requiresAdjust) {
        window.table.columns.adjust();
    }
}

function enableColumnResize(tableSelector) {
    const tableEl = document.querySelector(tableSelector);
    if (!tableEl || !window.table) return;

    $(tableEl).find('thead th .col-resizer').remove();

    $(tableEl).find('thead th').each(function () {
        const th = this;
        const colId = $(th).attr('data-col-id');
        if (!colId || $(th).hasClass('no-resize')) return; // Aggiunta classe 'no-resize' per colonne non ridimensionabili

        $(th).css('position', 'relative');
        const resizer = $('<div>').addClass('col-resizer').css({
            position: 'absolute',
            top: 0,
            right: '-3px',
            width: '6px',
            height: '100%',
            cursor: 'col-resize',
            userSelect: 'none',
            zIndex: 10
        }).appendTo(th);

        let startX, startWidth;
        const onMouseMove = (e2) => {
            e2.preventDefault();
            let newWidth = Math.max(40, startWidth + (e2.pageX - startX));
            $(th).css('width', newWidth + 'px');
            $(th).css('min-width', newWidth + 'px');
        };

        const onMouseUp = () => {
            $(document).off('mousemove', onMouseMove);
            $(document).off('mouseup', onMouseUp);
            $('body').css('cursor', '');
            $(tableEl).removeClass('resizing-columns');

            // Salva e ripristina le larghezze senza forzare DataTables
            saveColumnWidths(tableSelector);
            if (window.table) {
                // window.table.columns.adjust(); // Evitato per mantenere la larghezza impostata
                loadColumnWidths(tableSelector);
            }
        };

        resizer.on('mousedown', function (e) {
            e.preventDefault();
            e.stopPropagation();
            startX = e.pageX;
            startWidth = $(th).outerWidth(); // Usa outerWidth per una misurazione più precisa
            $('body').css('cursor', 'col-resize');
            $(tableEl).addClass('resizing-columns');
            $(document).on('mousemove', onMouseMove);
            $(document).on('mouseup', onMouseUp);
        });
    });
}

function setColumnsAutosize(tableSelector, preventDraw = false) {
    const tableEl = document.querySelector(tableSelector);
    if (!tableEl || !window.table) return;
    $(tableEl).addClass('autosize-mode');
    $(tableEl).find('thead th').each(function () {
        $(this).css('width', '');
        $(this).css('min-width', '');
    });
    if (window.table) {
        if (preventDraw) {
            window.table.columns.adjust();
        } else {
            window.table.columns.adjust().draw(false);
        }
    }
    if (localStorage.getItem(COLUMN_WIDTHS_KEY)) {
        loadColumnWidths(tableSelector); // Ripristina eventuali larghezze personalizzate anche in autosize
    }
}

function setColumnsFixedWrap(tableSelector, preventDraw = false) {
    const tableEl = document.querySelector(tableSelector);
    if (!tableEl || !window.table) return;
    $(tableEl).removeClass('autosize-mode');
    const fixedWidth = '150px';
    $(tableEl).find('thead th').each(function () {
        $(this).css('width', fixedWidth);
        $(this).css('min-width', fixedWidth);
    });
    if (window.table) {
        if (preventDraw) {
            window.table.columns.adjust();
        } else {
            window.table.columns.adjust().draw(false);
        }
    }
    if (localStorage.getItem(COLUMN_WIDTHS_KEY)) {
        loadColumnWidths(tableSelector); // Ripristina eventuali larghezze personalizzate
    }
}

function applyColumnViewMode(tableSelector, preventDraw = false) {
    const tableEl = document.querySelector(tableSelector);
    if (!tableEl) return;

    const tableWrapper = $(tableEl).closest('.dataTables_scrollBody, .table-wrapper-fix').first();
    // Salva la posizione di scroll solo se diversa da zero
    const prevScrollLeft = tableWrapper.length ? tableWrapper.scrollLeft() : null;

    if (columnViewMode === 'autosize') {
        setColumnsAutosize(tableSelector, preventDraw);
    } else {
        setColumnsFixedWrap(tableSelector, preventDraw);
    }

    // Ripristina la posizione di scroll solo se era diversa da zero
    if (tableWrapper.length && prevScrollLeft && prevScrollLeft > 0) {
        setTimeout(() => { tableWrapper.scrollLeft(prevScrollLeft); }, 50);
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

    const $editModeToggleParent = $('#toggle-edit-mode').parent();
    if ($editModeToggleParent.length) {
        $editModeToggleParent.after($switch);
    } else {
        $('#dt-buttons-container').before($switch);
    }

    const toggleInput = $switch.find('input');
    const toggleLabel = $switch.find('label');

    toggleInput.prop('checked', columnViewMode === 'fixedwrap');
    toggleLabel.text(columnViewMode === 'fixedwrap' ? 'Colonne tutte uguali' : 'Colonne autosize');

    toggleInput.on('change', function () {
        columnViewMode = this.checked ? 'fixedwrap' : 'autosize';
        toggleLabel.text(this.checked ? 'Colonne tutte uguali' : 'Colonne autosize');
        applyColumnViewMode('#gestione-gs-table', false);
    });
}

function afterDataTableInit() {
    console.log('[afterDataTableInit] Chiamata.');
    enableColumnResize('#gestione-gs-table');
    loadColumnWidths('#gestione-gs-table');
    applyColumnViewMode('#gestione-gs-table', true);
    addColumnViewModeButton();
    setTimeout(window.updateCustomScrollHeader, 200); // Leggero ritardo per sicurezza
}