(function () {
    console.log('ordini_servizi.js caricato ed eseguito.');

    let table;
    let editModeEnabled = false;
    let visibleColumnsState = [];
    let columnsConfig = [];
    let lastRTCValues = null;

    // Funzione di utilità per la gestione degli errori
    function handleError(error, message = 'Si è verificato un errore') {
        alert(`${message}: ${error.message || error}`);
        $('#loading-indicator').hide();
        $('#gestione-gs-table').show();
    }

    // Funzione di utilità per la gestione delle risposte AJAX
    function handleAjaxError(xhr, status, error) {
        const errorMessage = xhr.responseJSON?.message || error || 'Errore sconosciuto';
        handleError(errorMessage, 'Errore nella richiesta');
    }

    // Funzione di utilità per la gestione dei filtri
    function getActiveFilters() {
        const filters = {};
        if (!table) return filters;

        const globalSearch = table.search();
        if (globalSearch) filters['global_search'] = globalSearch;

        table.columns().every(function () {
            const column = this;
            const colName = column.settings()[0].aoColumns[column.index()].data;
            const colValue = column.search();
            const colRegex = colValue.startsWith('^') && colValue.endsWith('$');
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

        // Inizializza i tab
        const tabButtons = document.querySelectorAll('#serviziTab .tab-btn');
        tabButtons.forEach(button => {
            button.addEventListener('click', function () {
                const tabName = this.dataset.tab;
                caricaTabServizi(tabName, this);
            });
        });

        // Carica il contenuto iniziale
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

        if (tabName === 'ge') {
            // Carica prima il contenuto del tab
            fetch('/ordini_servizi/ge')
                .then(response => {
                    if (!response.ok) throw new Error('Errore di rete');
                    return response.text();
                })
                .then(html => {
                    contentArea.innerHTML = html;
                    // Dopo aver caricato il contenuto, inizializza i controlli
                    initializeGestioneGSControls();
                })
                .catch(error => {
                    console.error('Errore nel caricamento del tab:', error);
                    contentArea.innerHTML = '<p class="text-danger">Impossibile caricare il contenuto del tab.</p>';
                });
        } else {
            // Per gli altri tab, carica il contenuto via AJAX
            fetch(`/ordini_servizi/${tabName}`)
                .then(response => {
                    if (!response.ok) throw new Error('Errore di rete');
                    return response.text();
                })
                .then(html => {
                    contentArea.innerHTML = html;
                })
                .catch(error => {
                    console.error('Errore nel caricamento del tab:', error);
                    contentArea.innerHTML = '<p class="text-danger">Impossibile caricare il contenuto del tab.</p>';
                });
        }
    }

    // Inizializza la pagina quando il documento è pronto
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', setupOrdiniServiziPage);
    } else {
        setupOrdiniServiziPage();
    }

    // Funzione di utilità per la gestione delle colonne
    function updateColumnVisibility() {
        if (table && visibleColumnsState.length > 0) {
            table.columns().every(function (idx) {
                table.column(idx).visible(visibleColumnsState.includes(idx));
            });
        }
    }

    function saveColumnVisibility() {
        if (table) {
            visibleColumnsState = table.columns().indexes().filter(idx => table.column(idx).visible()).toArray();
        }
    }

    function updateEditModeState(enabled) {
        editModeEnabled = enabled;
        const table = $('#gestione-gs-table');
        if (enabled) {
            table.addClass('edit-mode-active');
        } else {
            table.removeClass('edit-mode-active');
        }
    }

    function initializeToggle() {
        const toggleEditMode = document.getElementById('toggle-edit-mode');
        if (toggleEditMode) {
            toggleEditMode.removeEventListener('change', toggleEditMode._changeHandler);
            toggleEditMode._changeHandler = function () {
                updateEditModeState(this.checked);
            };
            toggleEditMode.addEventListener('change', toggleEditMode._changeHandler);
            toggleEditMode.checked = editModeEnabled;
            updateEditModeState(editModeEnabled);
        }
    }

    function escapeRegex(string) {
        return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    }

    function handleExport() {
        if (!table) {
            handleError('Tabella non inizializzata');
            return;
        }

        const selectedMonth = $('#month-filter').val();
        if (!selectedMonth) {
            handleError('Seleziona un mese prima di esportare');
            return;
        }

        const visibleColumns = [];
        table.columns().every(function (idx) {
            if (table.column(idx).visible()) {
                const columnData = table.settings()[0].aoColumns[idx].data;
                visibleColumns.push(columnData);
            }
        });

        const params = new URLSearchParams();
        params.append('month', selectedMonth);
        params.append('visible_columns', JSON.stringify(visibleColumns));

        // Ricerca generica
        const searchInput = document.getElementById('generic-search');
        if (searchInput && searchInput.value) {
            params.append('global_search', searchInput.value);
        }

        // Filtri per colonna
        const columnFilters = {};
        // Filtro RTC
        const rtcFilter = document.getElementById('rtc-filter');
        if (rtcFilter && rtcFilter.value) {
            columnFilters['RTC'] = { value: rtcFilter.value, regex: false };
        }
        // Altri filtri DataTables
        const activeFilters = getActiveFilters();
        for (const key in activeFilters) {
            if (key !== 'global_search') {
                columnFilters[key] = activeFilters[key];
            }
        }
        if (Object.keys(columnFilters).length > 0) {
            params.append('column_filters', JSON.stringify(columnFilters));
        }

        const query = params.toString();
        window.location.href = `/api/servizi/ge/export?${query}`;
    }

    // Funzione per popolare il filtro RTC
    async function aggiornaFiltroRTC() {
        const mese = $('#month-filter').val();
        const ricerca = $('#generic-search').val();
        const rtcFilter = document.getElementById('rtc-filter');
        if (!rtcFilter) return;
        rtcFilter.disabled = true;
        rtcFilter.innerHTML = '<option value="" selected>Seleziona RTC...</option>';
        if (!mese) return;
        try {
            // Richiedi solo i valori unici della colonna RTC
            const payload = {
                column: "RTC",
                month_filter: mese,
                search: { value: ricerca },
                columns: table ? table.settings()[0].aoColumns.map(() => ({ search: { value: '' } })) : []
            };
            const response = await fetch('/api/servizi/ge/unique_values', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
            let rtcValues = await response.json();
            rtcValues = Array.from(new Set(rtcValues));
            rtcValues.forEach(rtc => rtcFilter.add(new Option(rtc, rtc)));
            if (rtcValues.length > 0) {
                rtcFilter.disabled = false;
            } else {
                rtcFilter.value = '';
            }
        } catch (error) {
            console.error('Errore nel caricamento dei valori RTC:', error);
        }
    }

    async function initializeDataTable() {
        const selectedMonth = $('#month-filter').val();

        if (typeof $.fn.DataTable === 'undefined') {
            handleError('DataTables non è stato caricato');
            return;
        }

        if (!selectedMonth) {
            return;
        }

        try {
            $('#dt-length-container').empty();
            $('#dt-buttons-container').empty();
            $('#dt-filter-container').empty();

            columnsConfig = [];

            const columnsResponse = await fetch('/api/servizi/ge/columns');
            if (!columnsResponse.ok) {
                throw new Error(`Errore nel recupero delle colonne: ${columnsResponse.status}`);
            }

            const columns = await columnsResponse.json();

            if (!Array.isArray(columns)) {
                throw new Error('La risposta delle colonne non è un array valido');
            }

            if (columns.length === 0) {
                console.warn('Nessuna colonna ricevuta dal server');
            }

            columnsConfig = columns.map((col, idx) => {
                const field = col.field || col; // compatibilità con entrambi i formati
                const title = col.title || (typeof field === 'string' ? field.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase()) : '');
                return {
                    data: field,
                    title: title,
                    className: field === 'id' ? 'editable' : '',
                    visible: typeof col.visible === 'boolean' ? col.visible : (visibleColumnsState.length > 0 ? visibleColumnsState.includes(idx) : true)
                };
            });

            const headerRow = `<tr>${columnsConfig.map(c => `<th>${c.title}</th>`).join('')}</tr>`;
            $('#gestione-gs-table thead').html(headerRow);
            $('#gestione-gs-table tfoot').html('');

            table = $('#gestione-gs-table').DataTable({
                processing: true,
                serverSide: true,
                fixedHeader: true,
                deferRender: true,
                colReorder: true,
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
                        console.log('AJAX request payload:', payload);
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
                        prefixButtons: [
                            {
                                text: 'Seleziona tutto',
                                action: function (e, dt, node, config) {
                                    dt.columns().visible(true);
                                }
                            },
                            {
                                text: 'Deseleziona tutto',
                                action: function (e, dt, node, config) {
                                    dt.columns().visible(false);
                                }
                            }
                        ]
                    }
                ],
                language: { url: "/static/i18n/Italian.json" },
                select: { style: 'single', selector: 'tr' },
                drawCallback: function (settings) {
                    console.log('DataTable redrawn.');
                },
                createdRow: function (row, data) {
                    $(row).find('td:not(:first-child)').addClass('editable');
                    if (!editModeEnabled) {
                        $(row).find('td.editable').css('cursor', 'not-allowed');
                    }
                },
                initComplete: function () {
                    const api = this.api();
                    table = api;

                    if (visibleColumnsState.length > 0) {
                        api.columns().every(function (idx) {
                            api.column(idx).visible(visibleColumnsState.includes(idx));
                        });
                    }

                    const dtLength = $('.dataTables_length');
                    const dtButtons = $('.dt-buttons');
                    const dtFilter = $('.dataTables_filter');

                    dtLength.appendTo('#dt-length-container');
                    dtButtons.appendTo('#dt-buttons-container');
                    dtFilter.appendTo('#dt-filter-container');

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
                            // Svuota la ricerca globale
                            $('#generic-search').val('');
                            // Svuota tutti i campi di input dei filtri
                            $('.column-filter').val('');
                            // Resetta la tabella
                            api.search('').columns().search('').draw();
                        });
                    }

                    const filtersContainer = $('#column-filters-container');
                    filtersContainer.empty();

                    api.columns().every(function () {
                        const column = this;
                        const columnData = column.settings()[0].aoColumns[column.index()].data;
                        const columnTitle = column.header().textContent;

                        const filterDiv = $(`
                            <div class="filter-item">
                                <label for="filter-${columnData}">${columnTitle}</label>
                                <div class="input-group">
                                    <input type="text" 
                                           class="form-control column-filter" 
                                           id="filter-${columnData}" 
                                           data-column="${column.index()}">
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
                            const colName = column.settings()[0].aoColumns[column.index()].data;
                            const month = $('#month-filter').val() || '';
                            const filters = getActiveFilters();

                            delete filters[colName];
                            const filtersStr = encodeURIComponent(JSON.stringify(filters));

                            if (allValues.length > 0 && lastMonth === month && lastFilters === filtersStr) {
                                showDropdown(allValues, dropdownMenu, filterInput, column, searchText);
                                return;
                            }

                            filterInput.data('loading', true);
                            dropdownMenu.empty().append('<li><span class="dropdown-item">Caricamento...</span></li>');
                            dropdownMenu.addClass('show');

                            $.ajax({
                                url: `/api/servizi/ge/unique_values`,
                                method: 'GET',
                                data: {
                                    column: colName,
                                    month: month,
                                    filters: filtersStr
                                },
                                success: function (values) {
                                    allValues = values || [];
                                    lastMonth = month;
                                    lastFilters = filtersStr;
                                    showDropdown(allValues, dropdownMenu, filterInput, column, searchText);
                                },
                                error: function (xhr, status, error) {
                                    dropdownMenu.empty().append('<li><span class="dropdown-item text-danger">Errore nel caricamento dei valori</span></li>');
                                    dropdownMenu.addClass('show');
                                },
                                complete: function () {
                                    filterInput.data('loading', false);
                                }
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
                                        column.search(value).draw();
                                        dropdownMenu.removeClass('show');
                                    });
                                    dropdownMenu.append(item);
                                });
                            }
                            dropdownMenu.addClass('show');
                        }

                        filterInput.on('focus', function () {
                            fetchAndShowDropdown(this.value);
                        });

                        filterInput.on('blur', function () {
                            setTimeout(() => {
                                dropdownMenu.removeClass('show');
                            }, 200);
                        });

                        filterInput.on('click', function (e) {
                            fetchAndShowDropdown(this.value);
                        });
                        filterInput.on('keyup', function (e) {
                            if (!this.value) {
                                column.search('').draw();
                                dropdownMenu.removeClass('show');
                            } else {
                                fetchAndShowDropdown(this.value);
                            }
                        });
                    });

                    $('.filter-values').on('click', function (e) {
                        e.stopPropagation();
                    });

                    $('#loading-indicator').hide();
                    $('#gestione-gs-table').show();

                    api.on('select', function (e, dt, type, indexes) {
                        if (type === 'row') {
                            const rowData = api.rows(indexes).data().toArray();
                            const rowElement = api.row(indexes).node();
                        }
                    });

                    api.on('deselect', function (e, dt, type, indexes) {
                        if (type === 'row') {
                            const rowData = api.rows(indexes).data().toArray();
                            const rowElement = api.row(indexes).node();
                        }
                    });

                    // Applica la visibilità di default delle colonne in base al backend
                    table.columns().every(function (idx) {
                        const colDef = columnsConfig[idx];
                        if (typeof colDef.visible === 'boolean') {
                            table.column(idx).visible(colDef.visible);
                        }
                    });
                }
            });

            table.on('draw', function () {
                const info = table.page.info();
                const countText = `Vista da ${info.start + 1} a ${info.end} di ${info.recordsDisplay} elementi (filtrati da ${info.recordsTotal} totali)`;
                $('#record-count').text(countText);
            });

            $('#gestione-gs-table').off('click', 'td.editable').on('click', 'td.editable', function () {
                if (!editModeEnabled) {
                    const cell = table.cell(this);
                    const originalBg = cell.node().style.backgroundColor;
                    cell.node().style.backgroundColor = '#ffebee';
                    setTimeout(() => cell.node().style.backgroundColor = originalBg, 1000);
                    return;
                }

                const cell = table.cell(this);
                const column = cell.index().column;
                const row = cell.index().row;
                const data = cell.data();
                const rowData = table.row(row).data();
                const columnName = table.settings()[0].aoColumns[column].data;

                const input = $('<input>')
                    .attr('type', 'text')
                    .addClass('form-control form-control-sm')
                    .val(data)
                    .css({
                        'width': '100%',
                        'height': '100%',
                        'border': '1px solid #ddd',
                        'padding': '0.25rem',
                        'box-sizing': 'border-box',
                        'background-color': '#fff'
                    });

                // Assicuriamoci che la cella abbia position: relative
                $(cell.node()).css('position', 'relative');

                input.on('click', function (e) {
                    e.stopPropagation();
                });

                input.off('blur keypress').on('blur keypress', function (e) {
                    if (e.type === 'keypress' && e.which !== 13) return;

                    const newValue = $(this).val();
                    // Se il valore non è cambiato, chiudi l'input senza fare update e senza draw!
                    if (newValue === data) {
                        $(cell.node()).empty().text(data);
                        return;
                    }

                    // Solo se il valore è cambiato, fai la chiamata al server
                    fetch('/api/servizi/ge/update', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            pk: rowData.ID,
                            field: columnName,
                            value: newValue
                        })
                    })
                        .then(response => {
                            if (!response.ok) throw new Error('Errore nella risposta del server');
                            return response.json();
                        })
                        .then(result => {
                            if (result.status === 'success') {
                                $(cell.node()).empty();
                                cell.data(newValue).draw();
                            } else {
                                throw new Error(result.message || 'Errore durante l\'aggiornamento');
                            }
                        })
                        .catch(error => {
                            console.error('Errore:', error);
                            $(cell.node()).empty();
                            cell.data(data).draw();
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
        }
    }

    async function initializeGestioneGSControls() {
        console.log('Inizializzazione controlli GS...');
        const monthFilter = document.getElementById('month-filter');
        if (!monthFilter) {
            console.log('Month filter non trovato');
            return;
        }

        // Inizializza il toggle di modifica
        initializeToggle();

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

        $('#month-filter').off('change').on('change', function () {
            const selectedMonth = $(this).val();
            console.log('Month filter changed. Selected month:', selectedMonth);

            $('#gestione-gs-table').hide();
            $('#loading-indicator').show();

            if (!selectedMonth) {
                console.log('No month selected. Clearing table if exists.');
                if ($.fn.DataTable.isDataTable('#gestione-gs-table')) {
                    table.clear().draw();
                }
                $('#loading-indicator').hide();
                $('#gestione-gs-table').show();
                return;
            }

            if ($.fn.DataTable.isDataTable('#gestione-gs-table')) {
                console.log('DataTable already initialized. Reloading data.');
                table.ajax.reload(function () {
                    $('#loading-indicator').hide();
                    $('#gestione-gs-table').show();
                });
            } else {
                console.log('DataTable not initialized. Initializing table.');
                initializeDataTable();
            }
            aggiornaFiltroRTC();
        });

        $('#generic-search').off('keyup').on('keyup', function (e) {
            if (e.key === 'Enter' || this.value === '') {
                if ($.fn.DataTable.isDataTable('#gestione-gs-table')) {
                    $('#gestione-gs-table').DataTable().search(this.value).draw();
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
            if ($.fn.DataTable.isDataTable('#gestione-gs-table')) {
                $('#gestione-gs-table').DataTable().ajax.reload();
            }
        });

        // Inizializza la tabella se non è già inizializzata
        if (!$.fn.DataTable.isDataTable('#gestione-gs-table')) {
            await initializeDataTable();
        }

        // Collega il pulsante esporta excel
        $('#exportBtn').off('click').on('click', handleExport);
    }

    // Dopo l'inizializzazione della DataTable, blocca la ricerca in tempo reale e abilita solo su invio
    function patchRicercaSoloInvio() {
        // Trova il campo ricerca DataTables
        var $input = $('#dt-filter-container input[type="search"]');
        if ($input.length) {
            $input.off('input keyup');
            $input.on('keyup', function (e) {
                if (e.key === 'Enter') {
                    var table = $('#gestione-gs-table').DataTable();
                    table.search(this.value).draw();
                }
            });
        }
    }

    // Applica la patch dopo ogni init della tabella
    $(document).on('init.dt', function () {
        patchRicercaSoloInvio();
    });

    // Nascondi tutte le info, mostra solo quella DOPO la tabella (sotto)
    $(document).on('draw.dt', function () {
        $('.dataTables_info').hide();
        $('#gestione-gs-table').parent().nextAll('.dataTables_info').first().show();
    });

    // Listener globale per ESC: resetta tutti i filtri tranne il mese
    document.addEventListener('keydown', function (e) {
        if (e.key === 'Escape') {
            // Reset filtro RTC
            const rtcFilter = document.getElementById('rtc-filter');
            if (rtcFilter) {
                rtcFilter.value = '';
                rtcFilter.dispatchEvent(new Event('change'));
            }
            // Reset ricerca generica
            const searchInput = document.getElementById('generic-search');
            if (searchInput) {
                searchInput.value = '';
            }
            // Reset filtri DataTables (se presenti)
            if (window.$ && $.fn.DataTable && table) {
                table.search('').columns().search('').draw();
            }
            // Reset filtri avanzati custom (se presenti)
            document.querySelectorAll('.column-filter').forEach(input => input.value = '');
        }
    });
})();
