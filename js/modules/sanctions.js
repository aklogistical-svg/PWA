// sanctions.js - Module Sanctions (retards, absences, indiscipline)
import { db } from '../db.js';
import { creerNotification, creerModal } from '../ui.js';

export const SanctionsModule = {
    currentAnneeId: null,
    currentClasseId: null,
    currentTrimestreId: null,

    async render(container) {
        const active = db.selectObject('SELECT id FROM annees_scolaires WHERE est_active = 1');
        this.currentAnneeId = active ? active.id : (db.selectObject('SELECT id FROM annees_scolaires ORDER BY date_debut DESC LIMIT 1') || {}).id;

        const classes = db.exec('SELECT id, nom FROM classes WHERE id_annee_scolaire = ? ORDER BY nom', { rowMode: 'object' }, [this.currentAnneeId]);
        const trimestres = db.exec('SELECT id, libelle FROM trimestres WHERE id_annee_scolaire = ? ORDER BY ordre', { rowMode: 'object' }, [this.currentAnneeId]);

        const optionsClasse = classes.map(c => `<option value="${c.id}">${c.nom}</option>`).join('');
        const optionsTrimestre = trimestres.map(t => `<option value="${t.id}">${t.libelle}</option>`).join('');

        container.innerHTML = `
            <div class="card">
                <h3>Gestion des sanctions</h3>
                <div style="display: flex; gap: 1rem; flex-wrap: wrap; align-items: center; margin-bottom: 1rem;">
                    <div>
                        <label>Classe</label>
                        <select id="sanction-classe-select">${optionsClasse}</select>
                    </div>
                    <div>
                        <label>Trimestre</label>
                        <select id="sanction-trimestre-select">${optionsTrimestre}</select>
                    </div>
                    <button id="load-sanctions-btn">Charger</button>
                </div>
                <div id="sanctions-table-container"></div>
            </div>
        `;

        document.getElementById('load-sanctions-btn').addEventListener('click', () => {
            this.currentClasseId = parseInt(document.getElementById('sanction-classe-select').value);
            this.currentTrimestreId = parseInt(document.getElementById('sanction-trimestre-select').value);
            this.loadSanctionsList();
        });

        // Charger automatiquement si des valeurs existent
        if (classes.length > 0 && trimestres.length > 0) {
            document.getElementById('sanction-classe-select').value = this.currentClasseId || classes[0].id;
            document.getElementById('sanction-trimestre-select').value = this.currentTrimestreId || trimestres[0].id;
            document.getElementById('load-sanctions-btn').click();
        }
    },

    loadSanctionsList() {
        const container = document.getElementById('sanctions-table-container');
        if (!container) return;

        const classeId = this.currentClasseId;
        const trimestreId = this.currentTrimestreId;

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

        // Récupérer toutes les sanctions pour ces élèves et ce trimestre
        const eleveIds = eleves.map(e => e.id);
        const placeholders = eleveIds.map(() => '?').join(',');
        const sanctions = db.exec(
            `SELECT s.id, s.eleve_id, s.type_sanction, s.points_retires, s.commentaire
             FROM sanctions s
             WHERE s.trimestre_id = ? AND s.eleve_id IN (${placeholders})
             ORDER BY s.eleve_id, s.type_sanction`,
            { rowMode: 'object' },
            [trimestreId, ...eleveIds]
        );

        // Regrouper par élève
        const sanctionsByEleve = {};
        eleves.forEach(e => { sanctionsByEleve[e.id] = []; });
        sanctions.forEach(s => {
            if (sanctionsByEleve[s.eleve_id]) {
                sanctionsByEleve[s.eleve_id].push(s);
            }
        });

        let html = `<table style="width:100%; border-collapse: collapse;">
            <thead>
                <tr>
                    <th>Élève</th>
                    <th>Sanctions</th>
                    <th>Total points</th>
                    <th>Actions</th>
                </tr>
            </thead>
            <tbody>`;

        eleves.forEach(e => {
            const listeSanctions = sanctionsByEleve[e.id];
            let total = 0;
            if (listeSanctions.length > 0) {
                total = listeSanctions.reduce((sum, s) => sum + s.points_retires, 0);
            }

            const sanctionsHtml = listeSanctions.map(s => 
                `<span style="display: inline-block; background: #f0f0f0; padding: 0.2rem 0.5rem; margin: 0.1rem; border-radius: 4px;">
                    ${s.type_sanction}: ${s.points_retires} pts ${s.commentaire ? '('+s.commentaire+')' : ''}
                    <button class="edit-sanction" data-id="${s.id}" style="margin-left:4px; font-size:0.8rem;">✏️</button>
                    <button class="delete-sanction" data-id="${s.id}" style="margin-left:2px; font-size:0.8rem;">🗑️</button>
                </span>`
            ).join('') || '<i>Aucune sanction</i>';

            html += `<tr>
                <td>${e.nom} ${e.prenom}</td>
                <td>${sanctionsHtml}</td>
                <td style="font-weight: bold; color: red;">${total}</td>
                <td><button class="add-sanction-btn" data-eleve="${e.id}" data-nom="${e.nom} ${e.prenom}">+ Ajouter</button></td>
            </tr>`;
        });

        html += `</tbody></table>`;
        container.innerHTML = html;

        // Attacher les événements
        container.querySelectorAll('.add-sanction-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const eleveId = parseInt(btn.dataset.eleve);
                const nom = btn.dataset.nom;
                this.showSanctionForm(eleveId, nom);
            });
        });

        container.querySelectorAll('.edit-sanction').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const id = parseInt(btn.dataset.id);
                const sanction = sanctions.find(s => s.id === id);
                if (sanction) {
                    const eleve = eleves.find(el => el.id === sanction.eleve_id);
                    const nom = eleve ? `${eleve.nom} ${eleve.prenom}` : '';
                    this.showSanctionForm(sanction.eleve_id, nom, sanction);
                }
            });
        });

        container.querySelectorAll('.delete-sanction').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const id = parseInt(btn.dataset.id);
                this.deleteSanction(id);
            });
        });
    },

    showSanctionForm(eleveId, nomEleve, existingSanction = null) {
        const isEdit = existingSanction !== null;
        const types = ['retard', 'absence', 'indiscipline'];
        let typeSelect = '';
        types.forEach(t => {
            const selected = existingSanction && existingSanction.type_sanction === t ? 'selected' : '';
            typeSelect += `<option value="${t}" ${selected}>${t.charAt(0).toUpperCase() + t.slice(1)}</option>`;
        });

        creerModal({
            titre: isEdit ? 'Modifier la sanction' : `Sanction pour ${nomEleve}`,
            contenu: `
                <label>Type de sanction</label>
                <select id="sanction-type">${typeSelect}</select>
                <label>Points retirés</label>
                <input type="number" step="0.5" id="sanction-points" value="${existingSanction ? existingSanction.points_retires : 0}" required>
                <label>Commentaire</label>
                <input id="sanction-commentaire" value="${existingSanction ? existingSanction.commentaire || '' : ''}">
            `,
            onConfirm: () => {
                const type = document.getElementById('sanction-type').value;
                const points = parseFloat(document.getElementById('sanction-points').value);
                if (isNaN(points) || points < 0) {
                    creerNotification('Points invalides', 'error');
                    return;
                }
                const commentaire = document.getElementById('sanction-commentaire').value.trim();

                if (isEdit) {
                    db.exec('UPDATE sanctions SET type_sanction=?, points_retires=?, commentaire=? WHERE id=?',
                        [type, points, commentaire, existingSanction.id]);
                } else {
                    db.exec('INSERT INTO sanctions(eleve_id, trimestre_id, type_sanction, points_retires, commentaire) VALUES(?,?,?,?,?)',
                        [eleveId, this.currentTrimestreId, type, points, commentaire]);
                }
                creerNotification(isEdit ? 'Sanction modifiée' : 'Sanction ajoutée', 'success');
                this.loadSanctionsList(); // Rafraîchir la liste
            }
        });
    },

    deleteSanction(id) {
        creerModal({
            titre: 'Confirmation',
            contenu: 'Supprimer cette sanction ?',
            onConfirm: () => {
                db.exec('DELETE FROM sanctions WHERE id = ?', [id]);
                creerNotification('Sanction supprimée', 'success');
                this.loadSanctionsList();
            }
        });
    }
};