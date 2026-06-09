// notes.js - Module Notes (saisie, calcul, dispenses)
import { db } from '../db.js';
import { creerNotification, creerModal } from '../ui.js';

export const NotesModule = {
    currentAnneeId: null,
    currentClasseId: null,
    currentTrimestreId: null,

    async render(container) {
        // Année active
        const active = db.selectObject('SELECT id FROM annees_scolaires WHERE est_active = 1');
        this.currentAnneeId = active ? active.id : (db.selectObject('SELECT id FROM annees_scolaires ORDER BY date_debut DESC LIMIT 1') || {}).id;

        // Classes de l'année
        const classes = db.exec('SELECT id, nom FROM classes WHERE id_annee_scolaire = ? ORDER BY nom', { rowMode: 'object' }, [this.currentAnneeId]);
        // Trimestres de l'année
        const trimestres = db.exec('SELECT id, libelle FROM trimestres WHERE id_annee_scolaire = ? ORDER BY ordre', { rowMode: 'object' }, [this.currentAnneeId]);

        const optionsClasse = classes.map(c => `<option value="${c.id}">${c.nom}</option>`).join('');
        const optionsTrimestre = trimestres.map(t => `<option value="${t.id}">${t.libelle}</option>`).join('');

        container.innerHTML = `
            <div class="card">
                <h3>Saisie des notes</h3>
                <div style="display: flex; gap: 1rem; flex-wrap: wrap; align-items: center; margin-bottom: 1rem;">
                    <div>
                        <label>Classe</label>
                        <select id="notes-classe-select">${optionsClasse}</select>
                    </div>
                    <div>
                        <label>Trimestre</label>
                        <select id="notes-trimestre-select">${optionsTrimestre}</select>
                    </div>
                    <button id="load-notes-btn">Charger</button>
                </div>
                <div id="notes-table-container" style="overflow-x: auto;"></div>
                <div id="moyennes-generales" style="margin-top: 1rem;"></div>
            </div>
        `;

        document.getElementById('load-notes-btn').addEventListener('click', () => {
            this.currentClasseId = parseInt(document.getElementById('notes-classe-select').value);
            this.currentTrimestreId = parseInt(document.getElementById('notes-trimestre-select').value);
            this.loadNotesGrid();
        });

        // Charger automatiquement si des valeurs existent (premier affichage)
        if (classes.length > 0 && trimestres.length > 0) {
            document.getElementById('notes-classe-select').value = this.currentClasseId || classes[0].id;
            document.getElementById('notes-trimestre-select').value = this.currentTrimestreId || trimestres[0].id;
            // Déclencher un premier chargement
            document.getElementById('load-notes-btn').click();
        }
    },

    // ==================== CHARGEMENT DU TABLEAU ====================
    async loadNotesGrid() {
        const container = document.getElementById('notes-table-container');
        const moyennesDiv = document.getElementById('moyennes-generales');
        if (!container) return;
        container.innerHTML = '<p>Chargement…</p>';
        moyennesDiv.innerHTML = '';

        const classeId = this.currentClasseId;
        const trimestreId = this.currentTrimestreId;

        // Récupérer le niveau de la classe
        const classe = db.selectObject('SELECT niveau FROM classes WHERE id = ?', [classeId]);
        if (!classe) {
            container.innerHTML = '<p>Classe introuvable.</p>';
            return;
        }
        const niveau = classe.niveau;

        // Élèves inscrits dans cette classe pour l'année active
        const eleves = db.exec(
            `SELECT e.id, e.nom, e.prenom FROM eleves e
             JOIN inscriptions i ON e.id = i.id_eleve
             WHERE i.id_classe = ? AND i.id_annee_scolaire = ? AND e.statut = 'actif'
             ORDER BY e.nom, e.prenom`,
            { rowMode: 'object' },
            [classeId, this.currentAnneeId]
        );

        if (eleves.length === 0) {
            container.innerHTML = '<p>Aucun élève inscrit dans cette classe.</p>';
            return;
        }

        // Matières pour ce niveau et cette année (via matieres_niveaux)
        const matieres = db.exec(
            `SELECT mn.matiere_id AS id, m.nom, mn.coefficient_defaut, mn.coefficient_devoir, mn.coefficient_composition
             FROM matieres_niveaux mn
             JOIN matieres m ON mn.matiere_id = m.id
             WHERE mn.niveau = ? AND mn.annee_scolaire_id = ?
             ORDER BY m.nom`,
            { rowMode: 'object' },
            [niveau, this.currentAnneeId]
        );

        if (matieres.length === 0) {
            container.innerHTML = '<p>Aucune matière paramétrée pour ce niveau. Veuillez configurer les matières dans le module Académique.</p>';
            return;
        }

        // Récupérer toutes les notes existantes pour ces élèves, matières, trimestre
        const notesExistantes = db.exec(
            `SELECT eleve_id, matiere_id, type_epreuve, note FROM notes
             WHERE trimestre_id = ? AND eleve_id IN (${eleves.map(e => e.id).join(',')})
             ORDER BY eleve_id, matiere_id`,
            { rowMode: 'object' },
            [trimestreId]
        );

        // Dispenses pour ces élèves, matières, trimestre
        const dispenses = db.exec(
            `SELECT eleve_id, matiere_id FROM dispenses WHERE trimestre_id = ?`,
            { rowMode: 'object' },
            [trimestreId]
        );
        const dispenseSet = new Set();
        dispenses.forEach(d => dispenseSet.add(`${d.eleve_id}_${d.matiere_id}`));

        // Construire le tableau
        // En-têtes : Élève, puis pour chaque matière : D1, D2, D3, Comp, Moy, Disp? (ou une case à cocher séparée)
        let html = '<table style="border-collapse: collapse; min-width: 100%;"><thead><tr><th>Élève</th>';
        matieres.forEach(m => {
            html += `<th colspan="4">${m.nom} (coef ${m.coefficient_defaut})</th>`;
        });
        html += '<th>Moy. Gén.</th></tr><tr><th></th>'; // sous-en-têtes
        matieres.forEach(m => {
            html += `<th>D1</th><th>D2</th><th>D3</th><th>Comp</th>`;
        });
        html += '<th></th></tr></thead><tbody>';

        // Pour stocker les données modifiables, on utilise un tableau d'objets
        const gridData = [];

        for (let e of eleves) {
            const row = { eleveId: e.id, nom: `${e.nom} ${e.prenom}`, matieres: {} };
            html += `<tr><td>${e.nom} ${e.prenom}</td>`;

            for (let m of matieres) {
                const keyBase = `m_${m.id}`;
                // Récupérer les notes existantes
                const d1 = notesExistantes.find(n => n.eleve_id === e.id && n.matiere_id === m.id && n.type_epreuve === 'devoir1');
                const d2 = notesExistantes.find(n => n.eleve_id === e.id && n.matiere_id === m.id && n.type_epreuve === 'devoir2');
                const d3 = notesExistantes.find(n => n.eleve_id === e.id && n.matiere_id === m.id && n.type_epreuve === 'devoir3');
                const comp = notesExistantes.find(n => n.eleve_id === e.id && n.matiere_id === m.id && n.type_epreuve === 'composition');
                const isDispense = dispenseSet.has(`${e.id}_${m.id}`);

                row.matieres[m.id] = {
                    d1: d1 ? d1.note : '',
                    d2: d2 ? d2.note : '',
                    d3: d3 ? d3.note : '',
                    comp: comp ? comp.note : '',
                    dispense: isDispense,
                    coefficient: m.coefficient_defaut,
                    coefDevoir: m.coefficient_devoir,
                    coefComp: m.coefficient_composition
                };

                // Attributs data pour les inputs
                html += `
                    <td><input type="number" step="0.01" class="note-input" data-eleve="${e.id}" data-matiere="${m.id}" data-type="devoir1" value="${d1 ? d1.note : ''}" ${isDispense ? 'disabled' : ''}></td>
                    <td><input type="number" step="0.01" class="note-input" data-eleve="${e.id}" data-matiere="${m.id}" data-type="devoir2" value="${d2 ? d2.note : ''}" ${isDispense ? 'disabled' : ''}></td>
                    <td><input type="number" step="0.01" class="note-input" data-eleve="${e.id}" data-matiere="${m.id}" data-type="devoir3" value="${d3 ? d3.note : ''}" ${isDispense ? 'disabled' : ''}></td>
                    <td><input type="number" step="0.01" class="note-input" data-eleve="${e.id}" data-matiere="${m.id}" data-type="composition" value="${comp ? comp.note : ''}" ${isDispense ? 'disabled' : ''}></td>
                `;
            }
            // Moyenne générale (sera calculée plus bas)
            html += `<td class="moy-gen" data-eleve="${e.id}">-</td></tr>`;
            gridData.push(row);
        }
        html += '</tbody></table>';
        html += '<button id="save-notes-btn" style="margin-top:1rem;">💾 Enregistrer les modifications</button>';
        html += '<button id="toggle-dispenses-btn" style="margin-top:1rem; margin-left:1rem;">📋 Gérer les dispenses</button>';
        container.innerHTML = html;

        // Stocker les données pour calculs et sauvegarde
        this.gridData = gridData;
        this.matieres = matieres;
        this.trimestreId = trimestreId;
        this.classeId = classeId;

        // Événements : recalculer les moyennes à chaque changement de note
        container.querySelectorAll('.note-input').forEach(input => {
            input.addEventListener('input', () => this.recalcAll());
        });

        document.getElementById('save-notes-btn').addEventListener('click', () => this.saveNotes());
        document.getElementById('toggle-dispenses-btn').addEventListener('click', () => this.toggleDispenses());

        // Calcul initial
        this.recalcAll();
    },

    // ==================== CALCUL DES MOYENNES ====================
    recalcAll() {
        if (!this.gridData || !this.matieres) return;

        // Mettre à jour les valeurs depuis les inputs
        const inputs = document.querySelectorAll('.note-input');
        inputs.forEach(inp => {
            const eleveId = parseInt(inp.dataset.eleve);
            const matiereId = parseInt(inp.dataset.matiere);
            const type = inp.dataset.type;
            const value = inp.value.trim() === '' ? null : parseFloat(inp.value);
            const row = this.gridData.find(r => r.eleveId === eleveId);
            if (row && row.matieres[matiereId]) {
                row.matieres[matiereId][type] = value;
            }
        });

        // Recalculer pour chaque élève
        this.gridData.forEach(row => {
            let totalPondere = 0;
            let totalCoefficients = 0;

            for (let matiereId in row.matieres) {
                const m = row.matieres[matiereId];
                if (m.dispense) continue;

                // Calcul moyenne matière
                const devNotes = [m.d1, m.d2, m.d3].filter(n => n !== null && n !== '' && !isNaN(n));
                const compNote = (m.comp !== null && m.comp !== '' && !isNaN(m.comp)) ? m.comp : null;

                if (devNotes.length === 0 && compNote === null) {
                    // aucune note, on ignore cette matière
                    continue;
                }

                const cd = m.coefDevoir || 1;
                const cc = m.coefComp || 1;
                let moyenneMatiere = 0;
                let diviseur = 0;
                if (devNotes.length > 0) {
                    const moyDev = devNotes.reduce((a, b) => a + b, 0) / devNotes.length;
                    moyenneMatiere += cd * moyDev;
                    diviseur += cd;
                }
                if (compNote !== null) {
                    moyenneMatiere += cc * compNote;
                    diviseur += cc;
                }
                if (diviseur > 0) {
                    moyenneMatiere = moyenneMatiere / diviseur;
                } else {
                    continue; // pas de notes valides
                }

                // Appliquer le coefficient de la matière
                totalPondere += moyenneMatiere * m.coefficient;
                totalCoefficients += m.coefficient;
            }

            const moyenneGenerale = totalCoefficients > 0 ? (totalPondere / totalCoefficients) : null;
            const td = document.querySelector(`td.moy-gen[data-eleve="${row.eleveId}"]`);
            if (td) {
                td.textContent = moyenneGenerale !== null ? moyenneGenerale.toFixed(2) : '-';
            }
        });
    },

    // ==================== GESTION DES DISPENSES ====================
    toggleDispenses() {
        // Afficher une modale avec la liste des élèves et matières pour cocher/décocher dispenses
        if (!this.gridData) return;

        const eleves = this.gridData.map(r => ({ id: r.eleveId, nom: r.nom }));
        const matieres = this.matieres;

        let contenu = '<div style="max-height: 400px; overflow-y: auto;"><table><thead><tr><th>Élève</th>';
        matieres.forEach(m => contenu += `<th>${m.nom}</th>`);
        contenu += '</tr></thead><tbody>';

        this.gridData.forEach(row => {
            contenu += `<tr><td>${row.nom}</td>`;
            matieres.forEach(m => {
                const isChecked = row.matieres[m.id]?.dispense ? 'checked' : '';
                contenu += `<td><input type="checkbox" class="dispense-check" data-eleve="${row.eleveId}" data-matiere="${m.id}" ${isChecked}></td>`;
            });
            contenu += '</tr>';
        });
        contenu += '</tbody></table></div>';

        creerModal({
            titre: 'Gérer les dispenses (matières non comptées)',
            contenu,
            onConfirm: () => {
                // Mettre à jour les dispenses dans gridData
                const checks = document.querySelectorAll('.dispense-check');
                checks.forEach(chk => {
                    const eleveId = parseInt(chk.dataset.eleve);
                    const matiereId = parseInt(chk.dataset.matiere);
                    const row = this.gridData.find(r => r.eleveId === eleveId);
                    if (row && row.matieres[matiereId]) {
                        row.matieres[matiereId].dispense = chk.checked;
                    }
                });
                // Mettre à jour l'interface (désactiver/activer les inputs correspondants)
                this.updateInputsDisableState();
                // Sauvegarder les dispenses en base
                this.saveDispenses();
                // Recalculer
                this.recalcAll();
            }
        });
    },

    updateInputsDisableState() {
        this.gridData.forEach(row => {
            for (let matiereId in row.matieres) {
                const m = row.matieres[matiereId];
                const inputs = document.querySelectorAll(`input[data-eleve="${row.eleveId}"][data-matiere="${matiereId}"]`);
                inputs.forEach(inp => inp.disabled = m.dispense);
            }
        });
    },

    saveDispenses() {
        if (!this.trimestreId) return;
        // Supprimer toutes les dispenses pour ce trimestre, puis réinsérer
        db.exec('DELETE FROM dispenses WHERE trimestre_id = ?', [this.trimestreId]);
        const stmt = db.prepare('INSERT INTO dispenses(eleve_id, matiere_id, trimestre_id) VALUES(?,?,?)');
        this.gridData.forEach(row => {
            for (let matiereId in row.matieres) {
                if (row.matieres[matiereId].dispense) {
                    stmt.bind([row.eleveId, parseInt(matiereId), this.trimestreId]);
                    stmt.stepReset();
                }
            }
        });
        stmt.finalize();
        creerNotification('Dispenses enregistrées', 'success');
    },

    // ==================== SAUVEGARDE DES NOTES ====================
    saveNotes() {
        if (!this.trimestreId) return;
        // Supprimer toutes les notes pour ce trimestre et ces élèves/matières (pour éviter les doublons)
        const eleveIds = this.gridData.map(r => r.eleveId);
        const matiereIds = this.matieres.map(m => m.id);
        if (eleveIds.length === 0 || matiereIds.length === 0) return;

        const placeholders = eleveIds.map(() => '?').join(',');
        const placeholdersMat = matiereIds.map(() => '?').join(',');
        db.exec(`DELETE FROM notes WHERE trimestre_id = ? AND eleve_id IN (${placeholders}) AND matiere_id IN (${placeholdersMat})`,
            [this.trimestreId, ...eleveIds, ...matiereIds]);

        // Insérer les nouvelles notes
        const stmt = db.prepare('INSERT INTO notes(eleve_id, matiere_id, trimestre_id, type_epreuve, note) VALUES(?,?,?,?,?)');
        for (let row of this.gridData) {
            for (let matiereId in row.matieres) {
                const m = row.matieres[matiereId];
                const types = [
                    { type: 'devoir1', value: m.d1 },
                    { type: 'devoir2', value: m.d2 },
                    { type: 'devoir3', value: m.d3 },
                    { type: 'composition', value: m.comp }
                ];
                for (let t of types) {
                    if (t.value !== null && t.value !== '' && !isNaN(t.value)) {
                        stmt.bind([row.eleveId, parseInt(matiereId), this.trimestreId, t.type, parseFloat(t.value)]);
                        stmt.stepReset();
                    }
                }
            }
        }
        stmt.finalize();
        creerNotification('Notes enregistrées avec succès', 'success');
    }
};