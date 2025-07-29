(function () {
    console.log('materiali.js caricato ed eseguito.');

    function waitForDataTablesAndInit() {
        if (typeof $ === 'undefined' || !$.fn.DataTable) {
            setTimeout(waitForDataTablesAndInit, 100);
            return;
        }
        initMaterialiDataTable();
    }

    function caricaTabMateriale(tabName, btn) {
        if (btn) {
            document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
        }

        const url = `/ordini_materiale/${tabName}`;
        const contentArea = document.getElementById('materiale-content');
        if (!contentArea) {
            console.error('Elemento #materiale-content non trovato.');
            return;
        }

        fetch(url)
            .then(response => {
                if (!response.ok) throw new Error('Errore di rete');
                return response.text();
            })
            .then(html => {
                contentArea.innerHTML = html;
                if (tabName === 'articoli') {
                    waitForDataTablesAndInit();
                }
            })
            .catch(error => {
                console.error('Errore nel caricamento del tab:', error);
                contentArea.innerHTML = '<p class="text-danger">Impossibile caricare il contenuto del tab.</p>';
            });
    }

    function initMaterialiDataTable() {
        if (typeof $ === 'undefined' || !$.fn.DataTable) {
            console.error('jQuery o DataTables non sono caricati.');
            return;
        }
        if ($.fn.DataTable.isDataTable('#ordiniTable')) {
            $('#ordiniTable').DataTable().destroy();
        }

        // Variabile di stato per bloccare il primo caricamento
        let ricercaEseguita = false;

        console.log('Inizializzazione DataTables...');
        const table = $('#ordiniTable').DataTable({
            searching: false,
            responsive: true,
            processing: true,
            serverSide: true,
            pageLength: 25,
            lengthMenu: [[10, 25, 50, 100, -1], [10, 25, 50, 100, "Tutti"]],
            ajax: {
                url: '/api/materiali/search',
                type: 'POST',
                contentType: 'application/json',
                data: function (d) {
                    d.codice = $('#codice').val()?.trim() || '';
                    d.codicenet = $('#codicenet').val()?.trim() || '';
                    d.descrizione = $('#descrizione').val()?.trim() || '';
                    d.year = $('#year').val() || '';
                    d.ricercaEseguita = ricercaEseguita;
                    return JSON.stringify(d);
                },
                dataSrc: function (json) {
                    // Se non è stata eseguita una ricerca, mostra tabella vuota
                    if (!ricercaEseguita) {
                        return [];
                    }
                    return json.data;
                }
            },
            columns: [
                { data: null, defaultContent: '', orderable: false, className: 'dtr-control' },
                { data: 'id', visible: false },
                { data: 'codice' },
                { data: 'codicenet' },
                { data: 'descrizione' },
                {
                    data: 'Qta Torino',
                    render: function (data) {
                        const value = parseFloat(data);
                        if (isNaN(value) || value === 0) return '';
                        let cls = '';
                        if (value < 0) cls = 'giacenza-negativa';
                        return `<span class=\"${cls}\">${value.toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>`;
                    }
                },
                {
                    data: 'Qta Milano',
                    render: function (data) {
                        const value = parseFloat(data);
                        if (isNaN(value) || value === 0) return '';
                        let cls = '';
                        if (value < 0) cls = 'giacenza-negativa';
                        return `<span class=\"${cls}\">${value.toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>`;
                    }
                },
                {
                    data: 'Qta Genova',
                    render: function (data) {
                        const value = parseFloat(data);
                        if (isNaN(value) || value === 0) return '';
                        let cls = '';
                        if (value < 0) cls = 'giacenza-negativa';
                        return `<span class=\"${cls}\">${value.toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>`;
                    }
                },
                {
                    data: 'Qta Bologna',
                    render: function (data) {
                        const value = parseFloat(data);
                        if (isNaN(value) || value === 0) return '';
                        let cls = '';
                        if (value < 0) cls = 'giacenza-negativa';
                        return `<span class=\"${cls}\">${value.toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>`;
                    }
                },
                {
                    data: 'Qta Roma',
                    render: function (data) {
                        const value = parseFloat(data);
                        if (isNaN(value) || value === 0) return '';
                        let cls = '';
                        if (value < 0) cls = 'giacenza-negativa';
                        return `<span class=\"${cls}\">${value.toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>`;
                    }
                },
                {
                    data: 'Importo',
                    render: function (data) {
                        return parseFloat(data).toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2, style: 'currency', currency: 'EUR' });
                    }
                }
            ],
            language: {
                "sEmptyTable": "Nessun dato presente nella tabella",
                "sInfo": "Vista da _START_ a _END_ di _TOTAL_ elementi",
                "sInfoEmpty": "Vista da 0 a 0 di 0 elementi",
                "sInfoFiltered": "(filtrati da _MAX_ elementi totali)",
                "sInfoPostFix": "",
                "sInfoThousands": ".",
                "sLengthMenu": "Visualizza _MENU_ elementi",
                "sLoadingRecords": "Caricamento...",
                "sProcessing": "Elaborazione...",
                "sSearch": "Cerca:",
                "sZeroRecords": "La ricerca non ha portato alcun risultato.",
                "oPaginate": {
                    "sFirst": "Inizio",
                    "sPrevious": "Precedente",
                    "sNext": "Successivo",
                    "sLast": "Fine"
                },
                "oAria": {
                    "sSortAscending": ": attiva per ordinare la colonna in ordine crescente",
                    "sSortDescending": ": attiva per ordinare la colonna in ordine decrescente"
                }
            }
        });

        let searchTimeout;
        $('#search-filters').on('keyup change', 'input, select', function () {
            ricercaEseguita = true;
            clearTimeout(searchTimeout);
            searchTimeout = setTimeout(() => {
                table.ajax.reload();
            }, 400);
        });

        $('#exportBtn').on('click', function () {
            const params = new URLSearchParams({
                year: $('#year').val() || '',
                codice: $('#codice').val() || '',
                codicenet: $('#codicenet').val() || '',
                descrizione: $('#descrizione').val() || ''
            });
            window.location.href = `/ordini_materiale/export?${params.toString()}`;
        });
    }

    function setupMaterialiPage() {
        const content = document.getElementById('main-content');
        if (!content || content.querySelector('.tabs')) {
            return;
        }

        content.innerHTML = `
            <h2>Gestione Ordini Materiale</h2>
            <div class="tabs mb-3">
              <button class="tab-btn btn btn-outline-secondary active" data-tab="articoli">Articoli</button>
              <button class="tab-btn btn btn-outline-secondary" data-tab="nuovo_ordine">Nuovo Ordine</button>
              <button class="tab-btn btn btn-outline-secondary" data-tab="ricerca_ordine">Ricerca Ordine</button>
            </div>
            <div id="materiale-content"></div>
        `;

        content.querySelector('.tabs').addEventListener('click', e => {
            if (e.target.matches('.tab-btn')) {
                const tabName = e.target.getAttribute('data-tab');
                caricaTabMateriale(tabName, e.target);
            }
        });

        caricaTabMateriale('articoli', content.querySelector('.tab-btn.active'));
    }

    setupMaterialiPage();

})();
