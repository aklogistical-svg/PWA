// exportimport.js - Module Export / Import
import { db } from '../db.js';
import { creerNotification, creerModal } from '../ui.js';

export const ExportImportModule = {
    currentAnneeId: null,
    currentTab: 'export',

    async render(container) {
        const active = db.selectObject('SELECT id FROM annees_scolaires WHERE est_active = 1');
        this.currentAnneeId = active ? active.id : (db.selectObject('SELECT id FROM annees_scolaires ORDER BY date_debut DESC LIMIT 1') || {}).id;

        container.innerHTML = `
            <div class="card">
                <h3>Export / Import</h3>
                <div class="tabs" style="display:flex; gap:0.5rem; margin-bottom:1rem;">
                    <button class="tab-btn" data-tab="export">📤 Export</button>
                    <button class="tab-btn" data-tab="import">📥 Import</button>
                    <button class="tab-btn" data-tab="backup">💾 Sauvegarde BD</button>
                    <button class="tab-btn" data-tab="restore">🔄 Restauration BD</button>
                </div>
                <div id="exportimport-content"></div>
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
        const contentDiv = document.getElementById('exportimport-content');
        if (!contentDiv) return;
        contentDiv.innerHTML = '';
        document.querySelectorAll('.tab-btn').forEach(b => b.style.background = '');
        const btn = document.querySelector(`.tab-btn[data-tab="${this.currentTab}"]`);
        if (btn) btn.style.background = 'var(--secondary)';

        switch (this.currentTab) {
            case 'export': this.renderExport(contentDiv); break;
            case 'import': this.renderImport(contentDiv); break;
            case 'backup': this.renderBackup(contentDiv); break;
            case 'restore': this.renderRestore(contentDiv); break;
        }
    },

    // ==================== EXPORT ====================
    renderExport(container) {
        container.innerHTML = `
            <h4>Export de données</h4>
            <div style="margin-bottom:1rem;">
                <label>Type de données :</label>
                <select id="export-type">
                    <option value="eleves">Liste des élèves</option>
                    <option value="notes">Notes par trimestre</option>
                    <option value="resultats">Résultats (moyennes)</option>
                </select>
            </div>
            <div id="export-options"></div>
            <button id="execute-export" style="margin-top:1rem;">📤 Exporter en CSV</button>
        `;

        const typeSelect = document.getElementById('export-type');
        const optionsDiv = document.getElementById('export-options');
        typeSelect.addEventListener('change', () => this.updateExportOptions(typeSelect.value, optionsDiv));
        this.updateExportOptions(typeSelect.value, optionsDiv);

        document.getElementById('execute-export').addEventListener('click', () => this.executeExport());
    },

    updateExportOptions(type, container) {
        if (type === 'eleves') {
            container.innerHTML = ''; // pas d'options supplémentaires
        } else if (type === 'notes' || type === 'resultats') {
            const classes = db.exec('SELECT id, nom FROM classes WHERE id_annee_scolaire = ? ORDER BY nom', { rowMode: 'object' }, [this.currentAnneeId]);
            const trimestres = db.exec('SELECT id, libelle FROM trimestres WHERE id_annee_scolaire = ? ORDER BY ordre', { rowMode: 'object' }, [this.currentAnneeId]);
            const optionsClasse = classes.map(c => `<option value="${c.id}">${c.nom}</option>`).join('');
            const optionsTrim = trimestres.map(t => `<option value="${t.id}">${t.libelle}</option>`).join('');
            container.innerHTML = `
                <label>Classe</label>
                <select id="export-classe">${optionsClasse}</select>
                <label>Trimestre</label>
                <select id="export-trimestre">${optionsTrim}</select>
            `;
        }
    },

    executeExport() {
        const type = document.getElementById('export-type').value;
        let csvContent = '';
        let filename = '';

        if (type === 'eleves') {
            // Export de la liste des élèves avec classe actuelle
            const eleves = db.exec(`
                SELECT e.matricule, e.nom, e.prenom, e.date_naissance, e.telephone, e.email, e.tuteur, c.nom AS classe
                FROM eleves e
                LEFT JOIN inscriptions i ON e.id = i.id_eleve AND i.id_annee_scolaire = ?
                LEFT JOIN classes c ON i.id_classe = c.id
                ORDER BY e.nom, e.prenom
            `, { rowMode: 'object' }, [this.currentAnneeId]);
            if (!eleves.length) {
                creerNotification('Aucun élève à exporter.', 'error');
                return;
            }
            csvContent = this.arrayToCSV(eleves, ['matricule', 'nom', 'prenom', 'date_naissance', 'telephone', 'email', 'tuteur', 'classe']);
            filename = `eleves_${new Date().toISOString().slice(0,10)}.csv`;
        } else if (type === 'notes' || type === 'resultats') {
            const classeId = parseInt(document.getElementById('export-classe')?.value);
            const trimestreId = parseInt(document.getElementById('export-trimestre')?.value);
            if (!classeId || !trimestreId) {
                creerNotification('Veuillez sélectionner classe et trimestre.', 'error');
                return;
            }
            if (type === 'notes') {
                // Export des notes brutes
                const notes = db.exec(`
                    SELECT e.nom, e.prenom, m.nom AS matiere, n.type_epreuve, n.note
                    FROM notes n
                    JOIN eleves e ON n.eleve_id = e.id
                    JOIN matieres m ON n.matiere_id = m.id
                    JOIN inscriptions i ON e.id = i.id_eleve AND i.id_annee_scolaire = ?
                    WHERE i.id_classe = ? AND n.trimestre_id = ?
                    ORDER BY e.nom, e.prenom, m.nom, n.type_epreuve
                `, { rowMode: 'object' }, [this.currentAnneeId, classeId, trimestreId]);
                if (!notes.length) {
                    creerNotification('Aucune note trouvée.', 'error');
                    return;
                }
                csvContent = this.arrayToCSV(notes, ['nom', 'prenom', 'matiere', 'type_epreuve', 'note']);
                filename = `notes_${new Date().toISOString().slice(0,10)}.csv`;
            } else {
                // Résultats : utiliser la fonction de calcul du module rapports pour générer CSV
                // On va importer dynamiquement la fonction (elle est dans RapportsModule)
                import('./rapports.js').then(module => {
                    const resultats = module.RapportsModule.getResultatsClasse(classeId, this.currentAnneeId, trimestreId);
                    const elevesMap = {};
                    db.exec('SELECT id, nom, prenom FROM eleves', { rowMode: 'object' }).forEach(e => { elevesMap[e.id] = e; });
                    const data = resultats.map(r => ({
                        nom: elevesMap[r.id]?.nom || '',
                        prenom: elevesMap[r.id]?.prenom || '',
                        moyenne: r.moyenneFinale?.toFixed(2) || ''
                    }));
                    const csv = this.arrayToCSV(data, ['nom', 'prenom', 'moyenne']);
                    this.downloadCSV(csv, `resultats_${new Date().toISOString().slice(0,10)}.csv`);
                });
                return;
            }
        }

        if (csvContent) {
            this.downloadCSV(csvContent, filename);
            creerNotification('Export CSV réussi', 'success');
        }
    },

    downloadCSV(csv, filename) {
        const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' }); // BOM pour Excel
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    },

    arrayToCSV(data, columns) {
        const header = columns.join(',');
        const rows = data.map(row => {
            return columns.map(col => {
                let val = row[col] !== undefined ? row[col] : '';
                // Échapper les guillemets et entourer de guillemets si besoin
                if (typeof val === 'string' && (val.includes(',') || val.includes('"'))) {
                    val = '"' + val.replace(/"/g, '""') + '"';
                }
                return val;
            }).join(',');
        });
        return header + '\n' + rows.join('\n');
    },

    // ==================== IMPORT ====================
    renderImport(container) {
        container.innerHTML = `
            <h4>Import de données CSV</h4>
            <div style="margin-bottom:1rem;">
                <label>Type d'import :</label>
                <select id="import-type">
                    <option value="eleves">Élèves</option>
                    <option value="notes">Notes</option>
                </select>
            </div>
            <div>
                <input type="file" id="import-file" accept=".csv">
            </div>
            <div id="import-mapping" style="margin-top:1rem;"></div>
            <button id="execute-import" style="margin-top:1rem;" disabled>📥 Importer</button>
        `;

        document.getElementById('import-type').addEventListener('change', () => this.prepareImport());
        document.getElementById('import-file').addEventListener('change', (e) => this.readCSVFile(e.target.files[0]));
    },

    readCSVFile(file) {
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (e) => {
            const text = e.target.result;
            const lines = text.split('\n').filter(l => l.trim() !== '');
            if (lines.length < 2) {
                creerNotification('Fichier CSV vide ou invalide.', 'error');
                return;
            }
            const headers = this.parseCSVLine(lines[0]);
            const data = [];
            for (let i = 1; i < Math.min(lines.length, 6); i++) { // 5 premières lignes pour aperçu
                data.push(this.parseCSVLine(lines[i]));
            }
            this.importHeaders = headers;
            this.importDataPreview = data;
            this.showImportMapping(headers, data);
        };
        reader.readAsText(file, 'UTF-8');
    },

    parseCSVLine(line) {
        const result = [];
        let current = '';
        let inQuotes = false;
        for (let ch of line) {
            if (inQuotes) {
                if (ch === '"') {
                    inQuotes = false;
                } else {
                    current += ch;
                }
            } else {
                if (ch === '"') {
                    inQuotes = true;
                } else if (ch === ',') {
                    result.push(current.trim());
                    current = '';
                } else {
                    current += ch;
                }
            }
        }
        result.push(current.trim());
        return result;
    },

    showImportMapping(headers, previewData) {
        const mappingDiv = document.getElementById('import-mapping');
        const type = document.getElementById('import-type').value;
        let mappingHtml = '<p>Aperçu des données :</p><table border="1"><tr>';
        headers.forEach(h => mappingHtml += `<th>${h}</th>`);
        mappingHtml += '</tr>';
        previewData.forEach(row => {
            mappingHtml += '<tr>';
            row.forEach(cell => mappingHtml += `<td>${cell || ''}</td>`);
            mappingHtml += '</tr>';
        });
        mappingHtml += '</table>';

        // Correspondance des colonnes
        if (type === 'eleves') {
            mappingHtml += `<p>Associer les colonnes :</p>`;
            const fields = ['nom', 'prenom', 'matricule', 'date_naissance', 'telephone', 'email', 'tuteur'];
            fields.forEach(f => {
                mappingHtml += `<label>${f}</label> <select class="map-select" data-field="${f}"><option value="">-- Ignorer --</option>`;
                headers.forEach(h => mappingHtml += `<option value="${h}">${h}</option>`);
                mappingHtml += `</select> `;
            });
        } else if (type === 'notes') {
            // Pour l'import de notes, il faudra sélectionner classe/trimestre et mapper colonnes : eleve_id (ou nom+prenom), matiere_id, type_epreuve, note
            const classes = db.exec('SELECT id, nom FROM classes WHERE id_annee_scolaire = ?', { rowMode: 'object' }, [this.currentAnneeId]);
            const trimestres = db.exec('SELECT id, libelle FROM trimestres WHERE id_annee_scolaire = ?', { rowMode: 'object' }, [this.currentAnneeId]);
            mappingHtml += `
                <label>Classe cible</label>
                <select id="import-classe">${classes.map(c => `<option value="${c.id}">${c.nom}</option>`).join('')}</select>
                <label>Trimestre cible</label>
                <select id="import-trimestre">${trimestres.map(t => `<option value="${t.id}">${t.libelle}</option>`).join('')}</select>
                <p>Mapping :</p>
                <label>Nom élève</label> <select class="map-select" data-field="nom"><option value="">--</option>${headers.map(h => `<option value="${h}">${h}</option>`).join('')}</select>
                <label>Prénom élève</label> <select class="map-select" data-field="prenom"><option value="">--</option>${headers.map(h => `<option value="${h}">${h}</option>`).join('')}</select>
                <label>Matière (nom)</label> <select class="map-select" data-field="matiere"><option value="">--</option>${headers.map(h => `<option value="${h}">${h}</option>`).join('')}</select>
                <label>Type d'épreuve</label> <select class="map-select" data-field="type_epreuve"><option value="">--</option>${headers.map(h => `<option value="${h}">${h}</option>`).join('')}</select>
                <label>Note</label> <select class="map-select" data-field="note"><option value="">--</option>${headers.map(h => `<option value="${h}">${h}</option>`).join('')}</select>
            `;
        }
        mappingDiv.innerHTML = mappingHtml;

        document.getElementById('execute-import').disabled = false;
        document.getElementById('execute-import').addEventListener('click', () => this.executeImport());
    },

    async executeImport() {
        const type = document.getElementById('import-type').value;
        const fileInput = document.getElementById('import-file');
        if (!fileInput.files.length) {
            creerNotification('Aucun fichier choisi.', 'error');
            return;
        }
        const file = fileInput.files[0];
        const reader = new FileReader();
        reader.onload = async (e) => {
            const text = e.target.result;
            const lines = text.split('\n').filter(l => l.trim() !== '');
            if (lines.length < 2) {
                creerNotification('Fichier vide.', 'error');
                return;
            }
            const headers = this.parseCSVLine(lines[0]);
            const rows = [];
            for (let i = 1; i < lines.length; i++) {
                const row = this.parseCSVLine(lines[i]);
                if (row.length > 0) rows.push(row);
            }

            if (type === 'eleves') {
                // Récupérer le mapping
                const mapping = {};
                document.querySelectorAll('.map-select').forEach(sel => {
                    if (sel.value) mapping[sel.dataset.field] = headers.indexOf(sel.value);
                });
                if (!mapping.nom || !mapping.prenom) {
                    creerNotification('Nom et Prénom obligatoires.', 'error');
                    return;
                }
                let count = 0;
                db.exec('BEGIN TRANSACTION');
                for (let row of rows) {
                    const nom = row[mapping.nom]?.trim();
                    const prenom = row[mapping.prenom]?.trim();
                    if (!nom || !prenom) continue;
                    const matricule = mapping.matricule >= 0 ? row[mapping.matricule]?.trim() : '';
                    const date_naissance = mapping.date_naissance >= 0 ? row[mapping.date_naissance]?.trim() : '';
                    const telephone = mapping.telephone >= 0 ? row[mapping.telephone]?.trim() : '';
                    const email = mapping.email >= 0 ? row[mapping.email]?.trim() : '';
                    const tuteur = mapping.tuteur >= 0 ? row[mapping.tuteur]?.trim() : '';
                    // Vérifier si l'élève existe déjà (par matricule ou nom+prenom)
                    const exist = db.selectObject('SELECT id FROM eleves WHERE matricule = ? OR (nom = ? AND prenom = ?)', [matricule, nom, prenom]);
                    if (!exist) {
                        db.exec('INSERT INTO eleves(matricule, nom, prenom, date_naissance, telephone, email, tuteur) VALUES(?,?,?,?,?,?,?)',
                            [matricule, nom, prenom, date_naissance, telephone, email, tuteur]);
                        count++;
                    }
                }
                db.exec('COMMIT');
                creerNotification(`${count} élèves importés.`, 'success');
            } else if (type === 'notes') {
                const mapping = {};
                document.querySelectorAll('.map-select').forEach(sel => {
                    if (sel.value) mapping[sel.dataset.field] = headers.indexOf(sel.value);
                });
                const classeId = parseInt(document.getElementById('import-classe').value);
                const trimestreId = parseInt(document.getElementById('import-trimestre').value);
                if (!mapping.note) {
                    creerNotification('Colonne Note obligatoire.', 'error');
                    return;
                }
                // Résoudre les élèves par nom+prenom
                // Pour les matières, par nom
                const elevesMap = {};
                db.exec('SELECT id, nom, prenom FROM eleves', { rowMode: 'object' }).forEach(e => {
                    elevesMap[`${e.nom.toUpperCase()}_${e.prenom.toUpperCase()}`] = e.id;
                });
                const matieresMap = {};
                db.exec('SELECT id, nom FROM matieres', { rowMode: 'object' }).forEach(m => {
                    matieresMap[m.nom.toUpperCase()] = m.id;
                });
                let count = 0;
                db.exec('BEGIN TRANSACTION');
                for (let row of rows) {
                    const nom = mapping.nom >= 0 ? row[mapping.nom]?.trim() : '';
                    const prenom = mapping.prenom >= 0 ? row[mapping.prenom]?.trim() : '';
                    const matiereNom = mapping.matiere >= 0 ? row[mapping.matiere]?.trim() : '';
                    const typeEpreuve = mapping.type_epreuve >= 0 ? row[mapping.type_epreuve]?.trim().toLowerCase() : '';
                    const note = mapping.note >= 0 ? parseFloat(row[mapping.note]) : NaN;

                    if (!nom || !prenom || isNaN(note)) continue;
                    const eleveKey = `${nom.toUpperCase()}_${prenom.toUpperCase()}`;
                    const eleveId = elevesMap[eleveKey];
                    if (!eleveId) continue;
                    const matiereId = matieresMap[matiereNom ? matiereNom.toUpperCase() : ''] || null;
                    if (!matiereId) continue;
                    // Valider type_epreuve
                    const validTypes = ['devoir1', 'devoir2', 'devoir3', 'composition'];
                    const type = validTypes.includes(typeEpreuve) ? typeEpreuve : 'devoir1';
                    // Vérifier que l'élève est bien dans la classe cible
                    const inscrit = db.selectObject('SELECT id FROM inscriptions WHERE id_eleve=? AND id_classe=? AND id_annee_scolaire=?', [eleveId, classeId, this.currentAnneeId]);
                    if (!inscrit) continue;
                    // Supprimer éventuellement la note existante pour ce type, matière, trimestre
                    db.exec('DELETE FROM notes WHERE eleve_id=? AND matiere_id=? AND trimestre_id=? AND type_epreuve=?',
                        [eleveId, matiereId, trimestreId, type]);
                    db.exec('INSERT INTO notes(eleve_id, matiere_id, trimestre_id, type_epreuve, note) VALUES(?,?,?,?,?)',
                        [eleveId, matiereId, trimestreId, type, note]);
                    count++;
                }
                db.exec('COMMIT');
                creerNotification(`${count} notes importées.`, 'success');
            }
        };
        reader.readAsText(file, 'UTF-8');
    },

    // ==================== SAUVEGARDE BD (fichier .db) ====================
    renderBackup(container) {
        container.innerHTML = `
            <h4>Sauvegarde de la base de données</h4>
            <p>Cliquez pour télécharger une copie complète de la base de données SQLite.</p>
            <button id="backup-btn">💾 Télécharger la sauvegarde (fichier .db)</button>
        `;
        document.getElementById('backup-btn').addEventListener('click', () => this.sauvegarderBase());
    },

    async sauvegarderBase() {
        try {
            // Exporter le fichier OPFS vers un Blob
            const opfsRoot = await navigator.storage.getDirectory();
            let fileHandle;
            try {
                fileHandle = await opfsRoot.getFileHandle('gestionscolaire.db');
            } catch {
                creerNotification('Base de données introuvable.', 'error');
                return;
            }
            const file = await fileHandle.getFile();
            const blob = new Blob([await file.arrayBuffer()], { type: 'application/octet-stream' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `sauvegarde_gestionscolaire_${new Date().toISOString().slice(0,10)}.db`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
            creerNotification('Sauvegarde téléchargée avec succès', 'success');
        } catch (err) {
            creerNotification('Erreur lors de la sauvegarde : ' + err.message, 'error');
        }
    },

    // ==================== RESTAURATION BD ====================
    renderRestore(container) {
        container.innerHTML = `
            <h4>Restaurer une sauvegarde</h4>
            <p style="color:red;">⚠️ Cette opération remplacera toutes les données actuelles. Assurez-vous d'avoir une sauvegarde récente.</p>
            <input type="file" id="restore-file" accept=".db">
            <button id="restore-btn" disabled>🔄 Restaurer</button>
        `;
        document.getElementById('restore-file').addEventListener('change', (e) => {
            document.getElementById('restore-btn').disabled = !e.target.files.length;
        });
        document.getElementById('restore-btn').addEventListener('click', () => this.restaurerBase());
    },

    async restaurerBase() {
        const fileInput = document.getElementById('restore-file');
        if (!fileInput.files.length) return;
        const file = fileInput.files[0];
        if (!file.name.endsWith('.db')) {
            creerNotification('Veuillez sélectionner un fichier .db valide.', 'error');
            return;
        }

        creerModal({
            titre: 'Confirmation',
            contenu: 'Toutes les données actuelles seront remplacées. Continuer ?',
            onConfirm: async () => {
                try {
                    const arrayBuffer = await file.arrayBuffer();
                    // Vérifier l'en-tête SQLite
                    const header = new TextDecoder().decode(arrayBuffer.slice(0, 15));
                    if (!header.startsWith('SQLite format 3')) {
                        creerNotification('Fichier SQLite invalide.', 'error');
                        return;
                    }
                    // Écraser le fichier OPFS
                    const opfsRoot = await navigator.storage.getDirectory();
                    const fileHandle = await opfsRoot.getFileHandle('gestionscolaire.db', { create: true });
                    const writable = await fileHandle.createWritable();
                    await writable.write(arrayBuffer);
                    await writable.close();
                    // Fermer la connexion actuelle
                    if (db) {
                        db.close();
                        // Réinitialiser la variable db pour la prochaine utilisation
                        // On va forcer le rechargement de la page
                    }
                    creerNotification('Base restaurée. Redémarrage de l\'application nécessaire.', 'success');
                    setTimeout(() => location.reload(), 1500);
                } catch (err) {
                    creerNotification('Erreur : ' + err.message, 'error');
                }
            }
        });
    }
};