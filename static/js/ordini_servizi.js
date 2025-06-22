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

        const activeFilters = getActiveFilters();
        if (activeFilters.global_search) {
            params.append('global_search', activeFilters.global_search);
        }

        const columnFilters = {};
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

    async function aggiornaFiltroRTC() {
        const mese = $('#month-filter').val();
        const ricerca = $('#generic-search').val();
        const rtcFilter = document.getElementById('rtc-filter');
        if (!rtcFilter) return;
        rtcFilter.disabled = true;
        rtcFilter.innerHTML = '<option value="" selected>Seleziona RTC...</option>';
        if (!mese) return;
        try {
            const payload = {
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
            if (JSON.stringify(rtcValues) === JSON.stringify(lastRTCValues)) return;
            lastRTCValues = rtcValues;
            if (rtcValues && rtcValues.length > 0) {
                rtcValues.forEach(rtc => rtcFilter.add(new Option(rtc, rtc)));
                rtcFilter.disabled = false;
            } else {
                rtcFilter.value = '';
            }
        } catch (error) {
            console.error('Errore nel caricamento dei valori RTC:', error);
        }
    }

    // async function initializeDataTable() {
    //     ...
    //     // Tutto il codice DataTables COMMENTATO o RIMOSSO
    // }

    // Inizializzazione diretta della tabella principale all'avvio
    document.addEventListener('DOMContentLoaded', function () {
        // initializeDataTable(); // DISATTIVATO: ora la tabella viene gestita solo da Tabulator
        // Collega il pulsante esporta excel
        $('#exportBtn').off('click').on('click', handleExport);
        // Collega il filtro RTC
        $('#rtc-filter').off('change').on('change', aggiornaFiltroRTC);
        // Collega la ricerca generica
        $('#generic-search').off('keyup').on('keyup', function (e) {
            if (e.key === 'Enter' || this.value === '') {
                if (isDataTableInitialized('#gestione-gs-table')) {
                    $('#gestione-gs-table').DataTable().search(this.value).draw();
                    aggiornaFiltroRTC();
                }
            }
        });
        // Collega il filtro mese
        $('#month-filter').off('change').on('change', function () {
            // initializeDataTable(); // DISATTIVATO
            aggiornaFiltroRTC();
        });
        // Gestione click sui tab: tutti caricamento dinamico, solo l'icona pop-out apre pagina intera
        const tabButtons = document.querySelectorAll('#serviziTab .tab-btn');
        tabButtons.forEach(button => {
            button.addEventListener('click', function (e) {
                const tabName = this.dataset.tab;
                console.log('Tab cliccato:', tabName);
                // Caricamento dinamico per tutti i tab
                fetch(`/ordini_servizi/${tabName}`, {
                    headers: { 'X-Requested-With': 'XMLHttpRequest' }
                })
                    .then(response => {
                        if (!response.ok) throw new Error('Errore di rete');
                        return response.text();
                    })
                    .then(html => {
                        document.getElementById('servizi-content-area').innerHTML = html;
                        // Carica JS Tabulator e ordini_servizi_ge.js solo per il tab "ge"
                        if (tabName === 'ge') {
                            console.log('Tab Gestione GS selezionato');
                            if (!window.Tabulator) {
                                console.log('Tabulator non presente, lo carico...');
                                const tabulatorScript = document.createElement('script');
                                tabulatorScript.src = 'https://cdnjs.cloudflare.com/ajax/libs/tabulator/6.3.1/js/tabulator.min.js';
                                tabulatorScript.onload = () => {
                                    console.log('Tabulator caricato, ora carico ordini_servizi_ge.js');
                                    loadOrdiniServiziGEScript();
                                };
                                document.body.appendChild(tabulatorScript);
                            } else {
                                console.log('Tabulator già presente, carico subito ordini_servizi_ge.js');
                                loadOrdiniServiziGEScript();
                            }
                        }
                        function loadOrdiniServiziGEScript() {
                            // Rimuovi eventuali vecchi script
                            document.querySelectorAll('script[src*="ordini_servizi_ge.js"]').forEach(s => s.remove());
                            console.log('Carico ordini_servizi_ge.js (forzato)');
                            const script = document.createElement('script');
                            script.src = '/static/js/ordini_servizi_ge.js';
                            script.setAttribute('data-page-script', 'true');
                            document.body.appendChild(script);
                        }
                    })
                    .catch(error => {
                        document.getElementById('servizi-content-area').innerHTML = '<p class="text-danger">Impossibile caricare il contenuto del tab.</p>';
                    });
            });
        });
    });

    // Patch: funzione wrapper sicura per controllare se DataTables è inizializzato
    function isDataTableInitialized(selector) {
        return typeof $ !== 'undefined' && $.fn && $.fn.DataTable && typeof $.fn.DataTable.isDataTable === 'function' && $.fn.DataTable.isDataTable(selector);
    }
})();
