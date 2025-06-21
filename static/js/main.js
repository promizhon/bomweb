document.addEventListener("DOMContentLoaded", function () {
  // === LOGICA SIDEBAR COLLASSABILE ===
  const body = document.body;
  const sidebar = document.querySelector('.sidebar');
  const SIDEBAR_COLLAPSED_KEY = 'sidebarCollapsed';

  const applySidebarState = () => {
    if (localStorage.getItem(SIDEBAR_COLLAPSED_KEY) === 'true' && window.innerWidth > 992) {
      body.classList.add('sidebar-collapsed');
    } else {
      body.classList.remove('sidebar-collapsed');
    }
  };

  applySidebarState();
  window.addEventListener('resize', applySidebarState);

  // La gestione del pin-toggle è delegata al body per funzionare anche con caricamenti AJAX
  document.body.addEventListener('click', (e) => {
    const pinToggle = e.target.closest('.sidebar-pin-toggle');
    if (pinToggle) {
      e.preventDefault();
      e.stopPropagation();
      body.classList.toggle('sidebar-collapsed');
      localStorage.setItem(SIDEBAR_COLLAPSED_KEY, body.classList.contains('sidebar-collapsed'));
    }
  });

  console.log("main.js caricato e inizializzato.");

  // === NAVIGAZIONE DINAMICA GLOBALE ===
  const mainContent = document.getElementById('main-content');

  const updateActiveMenu = (path) => {
    let bestMatch = null;
    let bestMatchLength = 0;

    // Trova il link del menu che corrisponde meglio al percorso attuale (longest prefix match)
    document.querySelectorAll('a.menu-item').forEach(link => {
      const linkPath = link.getAttribute('href');
      if (path.startsWith(linkPath) && linkPath.length > bestMatchLength) {
        bestMatch = link;
        bestMatchLength = linkPath.length;
      }
    });

    // Applica la classe 'active' solo al link migliore e rimuovila dagli altri
    document.querySelectorAll('a.menu-item').forEach(link => {
      if (link === bestMatch) {
        link.classList.add('active');
      } else {
        link.classList.remove('active');
      }
    });
  };

  const loadPage = (url, push = true) => {
    fetch(url)
      .then(response => {
        if (!response.ok) throw new Error(`Errore HTTP: ${response.status}`);
        return response.text();
      })
      .then(html => {
        const parser = new DOMParser();
        const doc = parser.parseFromString(html, 'text/html');

        const newContentEl = doc.getElementById('main-content');
        const newTitle = doc.querySelector('title')?.innerText;

        if (!newContentEl || newTitle === undefined) {
          throw new Error("Contenuto della pagina non valido o non trovato.");
        }

        // Rimuovi gli script esistenti prima di aggiornare il contenuto
        document.querySelectorAll('script[data-page-script]').forEach(script => script.remove());

        mainContent.innerHTML = newContentEl.innerHTML;
        document.title = newTitle;

        // Carica gli script nell'ordine corretto
        const loadScripts = async () => {
          // 1. Carica gli script specifici per la pagina
          if (url.includes('ordini_servizi')) {
            await new Promise((resolve, reject) => {
              const script = document.createElement('script');
              script.src = '/static/js/ordini_servizi.js';
              script.setAttribute('data-page-script', 'true');
              script.onload = () => {
                // Forza l'inizializzazione dopo il caricamento dello script
                if (typeof setupOrdiniServiziPage === 'function') {
                  setupOrdiniServiziPage();
                }
                resolve();
              };
              script.onerror = reject;
              document.body.appendChild(script);
            });
          }
          if (url.includes('ordini_materiale')) {
            await new Promise((resolve, reject) => {
              const script = document.createElement('script');
              script.src = '/static/js/materiali.js';
              script.setAttribute('data-page-script', 'true');
              script.onload = () => {
                // Forza l'inizializzazione dopo il caricamento dello script
                if (typeof setupMaterialiPage === 'function') {
                  setupMaterialiPage();
                }
                resolve();
              };
              script.onerror = reject;
              document.body.appendChild(script);
            });
          }

          // 2. Carica gli script inclusi nel contenuto
          const contentScripts = Array.from(newContentEl.querySelectorAll("script"));
          for (const oldScript of contentScripts) {
            await new Promise((resolve, reject) => {
              const newScript = document.createElement("script");
              Array.from(oldScript.attributes).forEach(attr => newScript.setAttribute(attr.name, attr.value));
              newScript.textContent = oldScript.textContent;
              newScript.setAttribute('data-page-script', 'true');
              newScript.onload = resolve;
              newScript.onerror = reject;
              document.body.appendChild(newScript);
            });
          }
        };

        loadScripts().then(() => {
          updateActiveMenu(url);
          if (push) history.pushState({ url }, '', url);
        }).catch(error => {
          console.error('Errore nel caricamento degli script:', error);
          alert('Errore nel caricamento della pagina. Ricarica la pagina manualmente.');
        });
      })
      .catch(error => {
        alert(`Errore nel caricamento della pagina: ${error.message}`);
      });
  };


  document.body.addEventListener('click', e => {
    const link = e.target.closest('a.menu-item');

    if (link && !e.metaKey && !e.ctrlKey) {
      e.preventDefault();
      const url = link.getAttribute('href');

      // Invece di usare AJAX, facciamo un refresh completo
      window.location.href = url;
    }
  });

  // Carica la pagina iniziale
  updateActiveMenu(location.pathname);

  // === LOGICA CHAT (invariata) ===
  const initChat = () => {
    const formPub = document.getElementById("chat-form");
    const inputPub = document.getElementById("chat-input");
    let lastMessages = [];

    function createMessageHTML({ date, time, user, chat }) {
      return `
        <div style="margin-bottom: 5px; font-size: 0.9rem;">
          <span style="color: #666;">${date} ${time} - </span>
          <strong style="color: #BDD70F;">${user}</strong>: 
          <span>${chat}</span>
        </div>
      `;
    }

    function loadMessages() {
      fetch("/chat/messages/public")
        .then(res => res.json())
        .then(data => {
          const boxPub = document.getElementById("chat-messages");
          if (!boxPub) return;
          if (JSON.stringify(data) !== JSON.stringify(lastMessages)) {
            boxPub.innerHTML = data.map(createMessageHTML).join('');
            boxPub.scrollTop = boxPub.scrollHeight;
            lastMessages = data;
          }
        });
    }

    if (formPub) {
      formPub.addEventListener("submit", e => {
        e.preventDefault();
        const msg = inputPub.value.trim();
        if (!msg) return;
        fetch("/chat/send/public", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ message: msg })
        }).then(() => {
          inputPub.value = "";
          loadMessages();
        });
      });
      // setInterval(loadMessages, 3000);
      loadMessages();
    }
  };

  // Inizializza la chat se presente nella pagina iniziale
  if (document.getElementById('chat-form')) {
    initChat();
  }

  // === PING KEEP ALIVE ===
  //  setInterval(() => {
  //    fetch("/ping").catch(err => console.warn("Ping fallito:", err));
  //   }, 30000);

  // === GESTIONE TABS INTERNI CHAT ===
  const tabs = document.querySelectorAll(".chat-tab");
  const panes = document.querySelectorAll(".chat-pane");

  tabs.forEach(tab => {
    tab.addEventListener("click", function () {
      const target = tab.getAttribute("data-tab");

      tabs.forEach(t => t.classList.remove("active"));
      tab.classList.add("active");

      panes.forEach(pane => {
        pane.style.display = (pane.id === "chat-pane-" + target) ? "flex" : "none";
      });
    });
  });

  // === CHAT PUBBLICA ===
  const formPub = document.getElementById("chat-form");
  const inputPub = document.getElementById("chat-input");
  const boxPub = document.getElementById("chat-messages");
  let lastMessages = [];

  function createMessageHTML({ date, time, user, chat }) {
    return `
      <div style="margin-bottom: 5px; font-size: 0.9rem;">
        <span style="color: #666;">${date} ${time} - </span>
        <strong style="color: #BDD70F;">${user}</strong>: 
        <span>${chat}</span>
      </div>
    `;
  }

  function loadMessages() {
    fetch("/chat/messages/public")
      .then(res => res.json())
      .then(data => {
        const boxPub = document.getElementById("chat-messages");
        if (!boxPub) return;
        if (JSON.stringify(data) !== JSON.stringify(lastMessages)) {
          boxPub.innerHTML = data.map(createMessageHTML).join('');
          boxPub.scrollTop = boxPub.scrollHeight;
          lastMessages = data;
        }
      });
  }

  formPub?.addEventListener("submit", e => {
    e.preventDefault();
    const msg = inputPub.value.trim();
    if (!msg) return;

    fetch("/chat/send/public", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: msg })
    }).then(() => {
      inputPub.value = "";
      loadMessages();
    });
  });

  // setInterval(loadMessages, 3000);
  loadMessages();

  // === CHAT GRUPPO ===
  const formGruppo = document.getElementById("chat-form-gruppo");
  const inputGruppo = document.getElementById("chat-input-gruppo");
  const boxGruppo = document.getElementById("chat-messages-gruppo");

  let lastGruppo = [];
  let gruppoId = null;

  fetch("/api/mio-id")
    .then(res => res.json())
    .then(data => gruppoId = data.id);

  function createMessageGruppo({ date, time, user, chat }) {
    return `
      <div style="margin-bottom: 5px; font-size: 0.9rem;">
        <span style="color: #666;">${date} ${time} - </span>
        <strong style="color: #f39c12;">${user}</strong>: 
        <span>${chat}</span>
      </div>
    `;
  }

  function loadMessaggiGruppo() {
    fetch("/chat/messages/gruppo")
      .then(res => res.json())
      .then(data => {
        if (JSON.stringify(data) !== JSON.stringify(lastGruppo)) {
          boxGruppo.innerHTML = data.map(createMessageGruppo).join('');
          boxGruppo.scrollTop = boxGruppo.scrollHeight;
          lastGruppo = data;
        }
      });
  }

  formGruppo?.addEventListener("submit", e => {
    e.preventDefault();
    const msg = inputGruppo.value.trim();
    if (!msg || gruppoId === null) return;

    fetch("/chat/send/gruppo", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: msg, gruppo: gruppoId })
    }).then(() => {
      inputGruppo.value = "";
      loadMessaggiGruppo();
    });
  });

  // setInterval(loadMessaggiGruppo, 3000);
  loadMessaggiGruppo();

  // === UTENTI ONLINE ===
  function updateOnlineUsers() {
    fetch("/api/utenti-online")
      .then(res => res.json())
      .then(users => {
        const list = document.getElementById("online-users");
        if (!list) return;
        list.innerHTML = users.map(login => `
          <li style="padding: 0.6rem; margin-bottom: 0.4rem; background: var(--bg-primary); border-radius: 10px; display: flex; align-items: center; gap: 0.8rem; border: 1px solid #BDD70F;">
            <div style="width: 30px; height: 30px; background: #BDD70F; border-radius: 50%; display: flex; align-items: center; justify-content: center; color: black;">
              ${login[0].toUpperCase()}
            </div>
            <span style="font-weight: 500;">${login}</span>
            <span style="margin-left: auto; width: 6px; height: 6px; background: #2ecc71; border-radius: 50%;"></span>
          </li>
        `).join('');
      });
  }

  // setInterval(updateOnlineUsers, 10000);
  updateOnlineUsers();


});
