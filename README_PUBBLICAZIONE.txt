GESTIONE SRL – FILE DEFINITIVI

File da pubblicare tutti nella stessa cartella del repository GitHub:
- index.html
- styles.css
- app.js
- manifest.json
- sw.js
- icon.svg

PUBBLICAZIONE CON GITHUB PAGES
1. Apri il repository GitHub che vuoi usare.
2. Crea una nuova cartella, ad esempio: Gestione_SRL_WebApp
3. Carica dentro la cartella tutti i 6 file sopra elencati.
4. Se vuoi pubblicare direttamente da quella cartella con GitHub Pages, il metodo più semplice è usare una cartella /docs alla radice del repository e inserire lì i file, oppure creare un repository dedicato e mettere i file alla radice.
5. Vai in Settings > Pages.
6. In Build and deployment scegli "Deploy from a branch".
7. Branch: main.
8. Folder: /(root) se i file sono alla radice, oppure /docs se li hai messi nella cartella docs.
9. Premi Save.
10. Attendi la pubblicazione e apri l'indirizzo GitHub Pages mostrato nella stessa schermata.

IMPORTANTE
GitHub Pages non permette di scegliere una sottocartella arbitraria nel menu Pages: sono normalmente disponibili root o /docs. Se nel repository attuale vuoi mantenere più app, la soluzione più ordinata è:
- lasciare i file esistenti nelle loro cartelle;
- creare /docs/srl/ con i file dell'app SRL;
- creare /docs/index.html come pagina indice, oppure pubblicare l'intero /docs e aprire /srl/ nell'URL.

DATI
I movimenti vengono salvati nel localStorage del browser del dispositivo. Non sono sincronizzati online. Usa periodicamente "Esporta backup".
