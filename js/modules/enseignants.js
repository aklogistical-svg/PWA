// enseignants.js - Module Enseignants
import { db } from '../db.js';
import { creerNotification, creerModal } from '../ui.js';

export const EnseignantsModule = {
    currentAnneeId: null,

    async render(container) {
        // Déterminer l'année active
        const active = db.selectObject('SELECT id FROM annees_scolaires WHERE est_active = 1');
        this.currentAnneeId = active ? active.id : (db.selectObject('SELECT id FROM annees_scolaires ORDER BY date_debut DESC LIMIT 1') || {}).id;

        container.innerHTML = `
            <div class="card">
                <h3>Gestion des enseignants</h3>
                <div style="display: flex; gap: 1rem; margin-bottom: 1rem; flex-wrap: wrap;">
                    <input type="text" id="search-enseignants" placeholder="Rechercher (nom, prénom, matricule)..." style="flex: 1;">
                    <button id="add-enseignant-btn">+ Nouvel enseignant</button>
                </div>
                <div id="enseignants-table-container"></div>
            </div>
            <div class="card" id="enseignements-section" style="display: none;">
                <h4>Enseignements de <span id="enseignant-nom"></span></h4>
                <button id="back-to-list-btn">← Retour à la liste</button>
                <div id="enseignements-container"></div>
            </div>
        `;

        this.renderList();
        document.getElementById('search-enseignants').addEventListener('input', () => this.renderList());
        document.getElementById('add-enseignant-btn').addEventListener('click', () => this.showEnseignantForm());
        document.getElementById('back-to-list-btn').addEventListener('click', () => this.toggleView(false));
    },

    toggleView(showEnseignements, enseignantId = null) {
        document.getElementById('enseignants-table-container').closest('.card').style.display = showEnseignements ? 'none' : 'block';
        document.getElementById('enseignements-section').style.display = showEnseignements ? 'block' : 'none';
        if (showEnseignements && enseignantId) {
            this.loadEnseignements(enseignantId);
        }
    },

    renderList() {
        const searchTerm = document.getElementById('search-enseignants').value.trim().toLowerCase();
        const container = document.getElementById('enseignants-table-container');
        if (!container) return;

        const enseignants = db.exec(
            'SELECT id, matricule, nom, prenom, specialite, telephone, email, statut FROM enseignants ORDER BY nom, prenom',
            { rowMode: 'object' }
        );

        const filtered = searchTerm
            ? enseignants.filter(ens =>
                (ens.nom && ens.nom.toLowerCase().includes(searchTerm)) ||
                (ens.prenom && ens.prenom.toLowerCase().includes(searchTerm)) ||
                (ens.matricule && ens.matricule.toLowerCase().includes(searchTerm))
              )
            : enseignants;

        let html = `
            <table style="width:100%; border-collapse: collapse;">
                <thead>
                    <tr>
                        <th>Matricule</th>
                        <th>Nom</th>
                        <th>Prénom</th>
                        <th>Spécialité</th>
                        <th>Statut</th>
                        <th>Actions</th>
                    </tr>
                </thead>
                <tbody>
        `;

        filtered.forEach(ens => {
            html += `
                <tr>
                    <td>${ens.matricule || '-'}</td>
                    <td>${ens.nom}</td>
                    <td>${ens.prenom}</td>
                    <td>${ens.specialite || '-'}</td>
                    <td>${ens.statut === 'actif' ? '✅ Actif' : '⏸️ Inactif'}</td>
                    <td>
                        <button class="edit-enseignant" data-id="${ens.id}">Modifier</button>
                        <button class="manage-enseignements" data-id="${ens.id}">Enseignements</button>
                        <button class="delete-enseignant" data-id="${ens.id}">Supprimer</button>
                    </td>
                </tr>
            `;
        });

        html += `</tbody></table>`;
        container.innerHTML = html;

        container.querySelectorAll('.edit-enseignant').forEach(btn =>
            btn.addEventListener('click', () => this.showEnseignantForm(parseInt(btn.dataset.id)))
        );
        container.querySelectorAll('.manage-enseignements').forEach(btn =>
            btn.addEventListener('click', () => {
                const id = parseInt(btn.dataset.id);
                this.toggleView(true, id);
            })
        );
        container.querySelectorAll('.delete-enseignant').forEach(btn =>
            btn.addEventListener('click', () => this.deleteEnseignant(parseInt(btn.dataset.id)))
        );
    },

    showEnseignantForm(id = null) {
        let enseignant = {
            matricule: '',
            nom: '',
            prenom: '',
            specialite: '',
            telephone: '',
            email: '',
            statut: 'actif'
        };
        if (id) {
            const row = db.selectObject('SELECT * FROM enseignants WHERE id = ?', [id]);
            if (row) enseignant = row;
        }

        creerModal({
            titre: id ? 'Modifier l\'enseignant' : 'Nouvel enseignant',
            contenu: `
                <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 0.5rem 1rem;">
                    <div>
                        <label>Matricule</label>
                        <input id="ens-matricule" value="${enseignant.matricule || ''}">
                    </div>
                    <div>
                        <label>Nom *</label>
                        <input id="ens-nom" value="${enseignant.nom}" required>
                    </div>
                    <div>
                        <label>Prénom *</label>
                        <input id="ens-prenom" value="${enseignant.prenom}" required>
                    </div>
                    <div>
                        <label>Spécialité</label>
                        <input id="ens-specialite" value="${enseignant.specialite || ''}">
                    </div>
                    <div>
                        <label>Téléphone</label>
                        <input id="ens-telephone" value="${enseignant.telephone || ''}">
                    </div>
                    <div>
                        <label>Email</label>
                        <input id="ens-email" value="${enseignant.email || ''}">
                    </div>
                    <div>
                        <label>Statut</label>
                        <select id="ens-statut">
                            <option value="actif" ${enseignant.statut === 'actif' ? 'selected' : ''}>Actif</option>
                            <option value="inactif" ${enseignant.statut === 'inactif' ? 'selected' : ''}>Inactif</option>
                        </select>
                    </div>
                </div>
            `,
            onConfirm: () => {
                const matricule = document.getElementById('ens-matricule').value.trim();
                const nom = document.getElementById('ens-nom').value.trim();
                const prenom = document.getElementById('ens-prenom').value.trim();
                if (!nom || !prenom) {
                    creerNotification('Nom et prénom obligatoires', 'error');
                    return;
                }
                const specialite = document.getElementById('ens-specialite').value.trim();
                const telephone = document.getElementById('ens-telephone').value.trim();
                const email = document.getElementById('ens-email').value.trim();
                const statut = document.getElementById('ens-statut').value;

                if (id) {
                    db.exec(
                        `UPDATE enseignants SET matricule=?, nom=?, prenom=?, specialite=?, telephone=?, email=?, statut=? WHERE id=?`,
                        [matricule, nom, prenom, specialite, telephone, email, statut, id]
                    );
                } else {
                    db.exec(
                        `INSERT INTO enseignants(matricule, nom, prenom, specialite, telephone, email, statut) VALUES(?,?,?,?,?,?,?)`,
                        [matricule, nom, prenom, specialite, telephone, email, statut]
                    );
                }
                creerNotification('Enseignant enregistré', 'success');
                this.renderList();
            }
        });
    },

    deleteEnseignant(id) {
        // Vérifier s'il a des enseignements
        const ensCount = db.selectObject('SELECT COUNT(*) as cnt FROM enseignements WHERE enseignant_id = ?', [id]);
        let message = 'Supprimer cet enseignant ?';
        if (ensCount && ensCount.cnt > 0) {
            message += ` (${ensCount.cnt} assignation(s) seront également supprimées)`;
        }
        creerModal({
            titre: 'Confirmation',
            contenu: message,
            onConfirm: () => {
                db.exec('DELETE FROM enseignements WHERE enseignant_id = ?', [id]);
                db.exec('DELETE FROM enseignants WHERE id = ?', [id]);
                creerNotification('Enseignant supprimé', 'success');
                this.renderList();
                // Si la vue enseignements était visible, la cacher
                document.getElementById('enseignements-section').style.display = 'none';
            }
        });
    },

    // ==================== ENSEIGNEMENTS ====================
    loadEnseignements(enseignantId) {
        const enseignant = db.selectObject('SELECT nom, prenom FROM enseignants WHERE id = ?', [enseignantId]);
        if (!enseignant) return;
        document.getElementById('enseignant-nom').textContent = `${enseignant.prenom} ${enseignant.nom}`;

        const container = document.getElementById('enseignements-container');
        // Récupérer tous les enseignements de cet enseignant pour l'année active
        const enseignements = db.exec(
            `SELECT ens.id, m.nom AS matiere, c.nom AS classe, t.libelle AS trimestre
             FROM enseignements ens
             JOIN matieres m ON ens.matiere_id = m.id
             JOIN classes c ON ens.classe_id = c.id
             JOIN trimestres t ON ens.trimestre_id = t.id
             WHERE ens.enseignant_id = ? AND t.id_annee_scolaire = ?
             ORDER BY t.ordre, c.nom, m.nom`,
            { rowMode: 'object' },
            [enseignantId, this.currentAnneeId]
        );

        let html = '';
        if (enseignements.length === 0) {
            html = '<p>Aucune assignation pour cette année scolaire.</p>';
        } else {
            html = `
                <table style="width:100%; border-collapse: collapse;">
                    <thead>
                        <tr><th>Classe</th><th>Matière</th><th>Trimestre</th><th>Action</th></tr>
                    </thead>
                    <tbody>
            `;
            enseignements.forEach(e => {
                html += `
                    <tr>
                        <td>${e.classe}</td>
                        <td>${e.matiere}</td>
                        <td>${e.trimestre}</td>
                        <td><button class="del-enseignement" data-id="${e.id}">Supprimer</button></td>
                    </tr>
                `;
            });
            html += `</tbody></table>`;
        }

        html += `<button id="add-enseignement-btn" style="margin-top:1rem;">+ Ajouter une assignation</button>`;
        container.innerHTML = html;

        container.querySelectorAll('.del-enseignement').forEach(btn =>
            btn.addEventListener('click', () => this.deleteEnseignement(parseInt(btn.dataset.id), enseignantId))
        );
        document.getElementById('add-enseignement-btn').addEventListener('click', () => this.showAssignationForm(enseignantId));
    },

    showAssignationForm(enseignantId) {
        // Récupérer les classes de l'année active
        const classes = db.exec('SELECT id, nom FROM classes WHERE id_annee_scolaire = ? ORDER BY nom', { rowMode: 'object' }, [this.currentAnneeId]);
        // Matières
        const matieres = db.exec('SELECT id, nom FROM matieres ORDER BY nom', { rowMode: 'object' });
        // Trimestres de l'année active
        const trimestres = db.exec('SELECT id, libelle FROM trimestres WHERE id_annee_scolaire = ? ORDER BY ordre', { rowMode: 'object' }, [this.currentAnneeId]);

        if (!classes.length || !matieres.length || !trimestres.length) {
            creerNotification('Vérifiez que classes, matières et trimestres existent pour cette année', 'error');
            return;
        }

        creerModal({
            titre: 'Assigner un enseignement',
            contenu: `
                <label>Classe *</label>
                <select id="assign-classe">
                    ${classes.map(c => `<option value="${c.id}">${c.nom}</option>`).join('')}
                </select>
                <label>Matière *</label>
                <select id="assign-matiere">
                    ${matieres.map(m => `<option value="${m.id}">${m.nom}</option>`).join('')}
                </select>
                <label>Trimestre *</label>
                <select id="assign-trimestre">
                    ${trimestres.map(t => `<option value="${t.id}">${t.libelle}</option>`).join('')}
                </select>
            `,
            onConfirm: () => {
                const classeId = parseInt(document.getElementById('assign-classe').value);
                const matiereId = parseInt(document.getElementById('assign-matiere').value);
                const trimestreId = parseInt(document.getElementById('assign-trimestre').value);

                // Vérifier l'unicité (enseignant, classe, matière, trimestre)
                const exists = db.selectObject(
                    'SELECT id FROM enseignements WHERE enseignant_id=? AND classe_id=? AND matiere_id=? AND trimestre_id=?',
                    [enseignantId, classeId, matiereId, trimestreId]
                );
                if (exists) {
                    creerNotification('Cet enseignement existe déjà.', 'error');
                    return;
                }

                db.exec(
                    'INSERT INTO enseignements(enseignant_id, classe_id, matiere_id, trimestre_id) VALUES(?,?,?,?)',
                    [enseignantId, classeId, matiereId, trimestreId]
                );
                creerNotification('Assignation ajoutée', 'success');
                this.loadEnseignements(enseignantId);
            }
        });
    },

    deleteEnseignement(id, enseignantId) {
        creerModal({
            titre: 'Confirmation',
            contenu: 'Supprimer cette assignation ?',
            onConfirm: () => {
                db.exec('DELETE FROM enseignements WHERE id = ?', [id]);
                creerNotification('Assignation supprimée', 'success');
                this.loadEnseignements(enseignantId);
            }
        });
    }
};