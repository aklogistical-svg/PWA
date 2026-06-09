// archives.js - Module Archives
import { db } from '../db.js';
import { creerNotification, creerModal } from '../ui.js';

export const ArchivesModule = {
    currentTab: 'create',

    render(container) {
        container.innerHTML = `
            <div class="card">
                <h3>Archives des années scolaires</h3>
                <div class="tabs" style="display:flex; gap:0.5rem; margin-bottom:1rem;">
                    <button class="tab-btn" data-tab="create">📦 Créer une archive</button>
                    <button class="tab-btn" data-tab="list">📋 Archives existantes</button>
                </div>
                <div id="archives-content"></div>
            </div>
        `;

        const self = this;
        container.querySelectorAll('.tab-btn').forEach(btn => {
            btn.addEventListener('click', function() {
                self.currentTab = this.dataset.tab;
                self.renderTabContent();
            });
        });
        const activeBtn = container.querySelector(`.tab-btn[data-tab="${this.currentTab}"]`);
        if (activeBtn) activeBtn.style.background = 'var(--secondary)';
        this.renderTabContent();
    },

    renderTabContent() {
        const contentDiv = document.getElementById('archives-content');
        if (!contentDiv) return;
        contentDiv.innerHTML = '';
        document.querySelectorAll('.tab-btn').forEach(b => b.style.background = '');
        const btn = document.querySelector(`.tab-btn[data-tab="${this.currentTab}"]`);
        if (btn) btn.style.background = 'var(--secondary)';

        if (this.currentTab === 'create') this.renderCreateArchive(contentDiv);
        else this.renderArchiveList(contentDiv);
    },

    // ==================== CRÉER UNE ARCHIVE ====================
    renderCreateArchive(container) {
        const annees = db.exec('SELECT id, libelle FROM annees_scolaires ORDER BY date_debut DESC', { rowMode: 'object' });
        if (!annees.length) {
            container.innerHTML = '<p>Aucune année scolaire trouvée.</p>';
            return;
        }

        let options = annees.map(a => `<option value="${a.id}">${a.libelle}</option>`).join('');
        container.innerHTML = `
            <h4>Archiver une année scolaire</h4>
            <p>Cette opération crée un snapshot complet et figé de toutes les données de l'année sélectionnée (élèves, notes, moyennes, sanctions) et le conserve pour consultation ultérieure.</p>
            <label>Choisir l'année à archiver :</label>
            <select id="archive-annee-select">${options}</select>
            <button id="create-archive-btn" style="margin-top:1rem;">📦 Archiver maintenant</button>
            <div id="archive-status"></div>
        `;

        document.getElementById('create-archive-btn').addEventListener('click', () => {
            const anneeId = parseInt(document.getElementById('archive-annee-select').value);
            this.creerArchive(anneeId);
        });
    },

    async creerArchive(anneeId) {
        const annee = db.selectObject('SELECT libelle FROM annees_scolaires WHERE id = ?', [anneeId]);
        if (!annee) return;

        // Vérifier si déjà archivée (doublon)
        const existe = db.selectObject('SELECT id FROM archives_annees WHERE id_annee_scolaire = ?', [anneeId]);
        if (existe) {
            creerNotification('Cette année a déjà une archive. Supprimez l\'existante pour la recréer.', 'error');
            return;
        }

        creerNotification('Création de l\'archive en cours…', 'info');

        try {
            // Rassembler toutes les données de l'année
            const data = {
                annee: annee.libelle,
                date_archivage: new Date().toISOString(),
                classes: [],
                eleves: [],
                matieres: [],
                notes: [],
                dispenses: [],
                sanctions: [],
                // Nous allons stocker des résumés plutôt que la totalité pour éviter un JSON énorme
                // Mais nous pouvons aussi stocker un snapshot complet en blob
            };

            // Récupérer les classes de l'année
            const classes = db.exec('SELECT * FROM classes WHERE id_annee_scolaire = ?', { rowMode: 'object' }, [anneeId]);
            // Élèves inscrits cette année-là
            const inscriptions = db.exec(
                `SELECT i.id_eleve, i.id_classe FROM inscriptions i WHERE i.id_annee_scolaire = ?`,
                { rowMode: 'object' }, [anneeId]
            );
            const eleveIds = [...new Set(inscriptions.map(i => i.id_eleve))];
            const eleves = eleveIds.length ? db.exec(`SELECT * FROM eleves WHERE id IN (${eleveIds.map(()=>'?').join(',')})`, { rowMode: 'object' }, eleveIds) : [];
            // Matières de l'année (via matieres_niveaux)
            const matieresNiveaux = db.exec('SELECT * FROM matieres_niveaux WHERE annee_scolaire_id = ?', { rowMode: 'object' }, [anneeId]);
            const matieresIds = [...new Set(matieresNiveaux.map(mn => mn.matiere_id))];
            const matieres = matieresIds.length ? db.exec(`SELECT * FROM matieres WHERE id IN (${matieresIds.map(()=>'?').join(',')})`, { rowMode: 'object' }, matieresIds) : [];
            // Notes, dispenses, sanctions de l'année (tous les trimestres liés à cette année)
            const trimestres = db.exec('SELECT id FROM trimestres WHERE id_annee_scolaire = ?', { rowMode: 'object' }, [anneeId]);
            const trimestreIds = trimestres.map(t => t.id);
            let notes = [], dispenses = [], sanctions = [];
            if (trimestreIds.length) {
                notes = db.exec(`SELECT * FROM notes WHERE trimestre_id IN (${trimestreIds.map(()=>'?').join(',')})`, { rowMode: 'object' }, trimestreIds);
                dispenses = db.exec(`SELECT * FROM dispenses WHERE trimestre_id IN (${trimestreIds.map(()=>'?').join(',')})`, { rowMode: 'object' }, trimestreIds);
                sanctions = db.exec(`SELECT * FROM sanctions WHERE trimestre_id IN (${trimestreIds.map(()=>'?').join(',')})`, { rowMode: 'object' }, trimestreIds);
            }

            // Construire un objet JSON de synthèse (plus léger) ou stocker tout
            const archiveData = {
                annee: annee.libelle,
                date_archivage: new Date().toISOString(),
                statistiques: {
                    nb_classes: classes.length,
                    nb_eleves: eleves.length,
                    nb_matieres: matieres.length,
                    nb_notes: notes.length,
                    nb_sanctions: sanctions.length,
                },
                // Option : on peut stocker les données brutes dans un champ "snapshot_complet" en JSON stringifié
                snapshot_complet: JSON.stringify({
                    classes, eleves, inscriptions, matieres_niveaux: matieresNiveaux, matieres, trimestres,
                    notes, dispenses, sanctions
                })
            };

            const jsonStr = JSON.stringify(archiveData);

            // Insérer dans archives_annees
            db.exec('INSERT INTO archives_annees(id_annee_scolaire, date_archivage, snapshot_db_blob) VALUES(?,?,?)',
                [anneeId, new Date().toISOString(), jsonStr]);

            creerNotification(`Archive de l'année ${annee.libelle} créée avec succès.`, 'success');
            // Option : proposer de purger les données de l'année ? Non, on garde tout.
        } catch (err) {
            creerNotification('Erreur : ' + err.message, 'error');
        }
    },

    // ==================== LISTE DES ARCHIVES ====================
    renderArchiveList(container) {
        const archives = db.exec(
            `SELECT a.id, a.id_annee_scolaire, a.date_archivage, an.libelle
             FROM archives_annees a
             JOIN annees_scolaires an ON a.id_annee_scolaire = an.id
             ORDER BY a.date_archivage DESC`,
            { rowMode: 'object' }
        );

        if (!archives.length) {
            container.innerHTML = '<p>Aucune archive trouvée.</p>';
            return;
        }

        let html = `<h4>Archives disponibles</h4>
            <table style="width:100%; border-collapse:collapse;">
                <thead><tr><th>Année scolaire</th><th>Date d'archivage</th><th>Actions</th></tr></thead>
                <tbody>`;
        archives.forEach(a => {
            html += `<tr>
                <td>${a.libelle}</td>
                <td>${a.date_archivage?.substring(0,10) || ''}</td>
                <td>
                    <button class="view-archive" data-id="${a.id}">📖 Consulter</button>
                    <button class="delete-archive" data-id="${a.id}">🗑️ Supprimer</button>
                </td>
            </tr>`;
        });
        html += `</tbody></table>`;
        container.innerHTML = html;

        container.querySelectorAll('.view-archive').forEach(btn => {
            btn.addEventListener('click', () => this.consulterArchive(parseInt(btn.dataset.id)));
        });
        container.querySelectorAll('.delete-archive').forEach(btn => {
            btn.addEventListener('click', () => this.supprimerArchive(parseInt(btn.dataset.id)));
        });
    },

    consulterArchive(archiveId) {
        const archive = db.selectObject(
            `SELECT a.snapshot_db_blob, an.libelle FROM archives_annees a
             JOIN annees_scolaires an ON a.id_annee_scolaire = an.id
             WHERE a.id = ?`, [archiveId]
        );
        if (!archive || !archive.snapshot_db_blob) {
            creerNotification('Archive corrompue ou vide.', 'error');
            return;
        }

        let data;
        try {
            data = JSON.parse(archive.snapshot_db_blob);
        } catch {
            creerNotification('Format d\'archive invalide.', 'error');
            return;
        }

        // Afficher un résumé
        let contenu = `<h4>Archive : ${data.annee || archive.libelle}</h4>`;
        contenu += `<p>Date d'archivage : ${data.date_archivage?.substring(0,10) || 'inconnue'}</p>`;
        contenu += `<p>Statistiques : ${data.statistiques?.nb_eleves || 0} élèves, ${data.statistiques?.nb_classes || 0} classes, ${data.statistiques?.nb_notes || 0} notes, ${data.statistiques?.nb_sanctions || 0} sanctions.</p>`;

        // Bouton pour afficher plus de détails (comme la liste des classes, etc.) - simplifié
        contenu += `<button id="show-archive-detail" data-archiveid="${archiveId}">Afficher le détail complet (JSON)</button>`;
        contenu += `<pre id="archive-detail" style="display:none; max-height:300px; overflow:auto; background:#f5f5f5; padding:1rem;"></pre>`;

        creerModal({
            titre: 'Consultation de l\'archive',
            contenu,
            onConfirm: () => {} // juste fermer
        });

        document.getElementById('show-archive-detail').addEventListener('click', function() {
            const pre = document.getElementById('archive-detail');
            pre.textContent = JSON.stringify(data, null, 2);
            pre.style.display = 'block';
            this.style.display = 'none';
        });
    },

    supprimerArchive(archiveId) {
        creerModal({
            titre: 'Confirmation',
            contenu: 'Supprimer définitivement cette archive ? (Les données originales ne seront pas affectées.)',
            onConfirm: () => {
                db.exec('DELETE FROM archives_annees WHERE id = ?', [archiveId]);
                creerNotification('Archive supprimée.', 'success');
                this.renderTabContent();
            }
        });
    }
};