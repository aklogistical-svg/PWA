// app.js - Initialisation et routage
import { initDatabase } from './db.js';
import { creerNotification } from './ui.js';
import { AcademiqueModule } from './modules/academique.js';
import { ElevesModule } from './modules/eleves.js';
import { EnseignantsModule } from './modules/enseignants.js';
import { NotesModule } from './modules/notes.js';
import { SanctionsModule } from './modules/sanctions.js';
import { RapportsModule } from './modules/rapports.js';
import { ExportImportModule } from './modules/exportimport.js';
import { ArchivesModule } from './modules/archives.js';

async function initialiserApp() {
    try {
        await initDatabase();
        creerNotification('Base de données prête', 'success');
    } catch (err) {
        creerNotification('Erreur initialisation DB: ' + err.message, 'error');
        console.error(err);
        return;
    }

    function router() {
        const hash = location.hash.substring(2) || 'eleves';
        const content = document.getElementById('app-content');
        content.innerHTML = '';

        document.querySelectorAll('nav a').forEach(a => a.classList.remove('active'));
        const lien = document.querySelector(`nav a[href="#/${hash}"]`);
        if (lien) lien.classList.add('active');

        switch (hash) {
            case 'academique':
                AcademiqueModule.render(content);
                break;
            case 'eleves':
                ElevesModule.render(content);
                break;
            case 'enseignants':
                EnseignantsModule.render(content);
                break;
            case 'notes':
                NotesModule.render(content);
                break;
            case 'sanctions':
                SanctionsModule.render(content);
                break;
            case 'rapports':
                RapportsModule.render(content);
                break;
            case 'export':
                ExportImportModule.render(content);
                break;
            case 'archives':
                ArchivesModule.render(content);
                break;
            default:
                content.innerHTML = `<div class="card"><h2>Page inconnue</h2></div>`;
        }
    }

    window.addEventListener('hashchange', router);
    router();
    
    document.getElementById('menu-toggle').addEventListener('click', () => {
    document.getElementById('main-nav').classList.toggle('active');
    });

   if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('/sw.js')
    .then(reg => console.log('Service Worker enregistré', reg.scope))
    .catch(err => console.warn('Échec enregistrement SW', err));
   }
}

initialiserApp();
