document.addEventListener('DOMContentLoaded', function () {
    // Gestione tab (per ora solo uno, ma struttura pronta per espansione)
    const tabBtn = document.getElementById('crea-protocollo-tab');
    const contentArea = document.getElementById('protocolli-content-area');
    if (tabBtn) {
        tabBtn.addEventListener('click', function () {
            // In futuro: carica dinamicamente altri tab
        });
    }
}); 