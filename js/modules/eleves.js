// eleves.js - Module Élèves
import { db } from '../db.js';
import { creerNotification, creerModal } from '../ui.js';

export const ElevesModule = {
    currentAnneeId: null, // sera déterminé lors du rendu

    async render(container) {
        // Déterminer l'année active
        const active = db.selectObject('SELECT id FROM annees_scolaires WHERE est_active = 1');
        this.currentAnneeId = active ? active.id : (db.selectObject('SELECT id FROM annees_scolaires ORDER BY date_debut DESC LIMIT 1') || {}).id;

        container.innerHTML = `
            <div class="card">
                <h3>Gestion des élèves</h3>
                <div style="display: flex; gap: 1rem; margin-bottom: 1rem; flex-wrap: wrap;">
                    <input type="text" id="search-eleves" placeholder="Rechercher (nom, prénom, matricule)..." style="flex: 1;">
                    <button id="add-eleve-btn">+ Nouvel élève</button>
                </div>
                <div id="eleves-table-container"></div>
            </div>
        `;

        this.renderList();

        document.getElementById('search-eleves').addEventListener('input', () => this.renderList());
        document.getElementById('add-eleve-btn').addEventListener('click', () => this.showForm());
    },

    renderList() {
        const searchTerm = document.getElementById('search-eleves').value.trim().toLowerCase();
        const container = document.getElementById('eleves-table-container');
        if (!container) return;

        // Récupération des élèves avec leur classe actuelle (inscription dans l'année active)
        const query = `
            SELECT e.id, e.matricule, e.nom, e.prenom, e.date_naissance, e.telephone, e.statut,
                   c.nom AS classe_nom
            FROM eleves e
            LEFT JOIN inscriptions i ON e.id = i.id_eleve AND i.id_annee_scolaire = ?
            LEFT JOIN classes c ON i.id_classe = c.id
            ORDER BY e.nom, e.prenom
        `;
        const eleves = db.exec(query, { rowMode: 'object' }, [this.currentAnneeId]);

        const filtered = searchTerm
            ? eleves.filter(e =>
                (e.nom && e.nom.toLowerCase().includes(searchTerm)) ||
                (e.prenom && e.prenom.toLowerCase().includes(searchTerm)) ||
                (e.matricule && e.matricule.toLowerCase().includes(searchTerm))
              )
            : eleves;

        let html = `
            <table style="width:100%; border-collapse: collapse;">
                <thead>
                    <tr>
                        <th>Matricule</th>
                        <th>Nom</th>
                        <th>Prénom</th>
                        <th>Classe</th>
                        <th>Statut</th>
                        <th>Actions</th>
                    </tr>
                </thead>
                <tbody>
        `;

        filtered.forEach(e => {
            html += `
                <tr>
                    <td>${e.matricule || '-'}</td>
                    <td>${e.nom}</td>
                    <td>${e.prenom}</td>
                    <td>${e.classe_nom || '<i>Non inscrit</i>'}</td>
                    <td>${e.statut === 'actif' ? '✅ Actif' : '⏸️ Inactif'}</td>
                    <td>
                        <button class="edit-eleve" data-id="${e.id}">Modifier</button>
                        <button class="inscrire-eleve" data-id="${e.id}">Inscrire</button>
                        <button class="delete-eleve" data-id="${e.id}">Supprimer</button>
                    </td>
                </tr>
            `;
        });

        html += `</tbody></table>`;
        container.innerHTML = html;

        // Attacher les événements
        container.querySelectorAll('.edit-eleve').forEach(btn =>
            btn.addEventListener('click', () => this.showForm(parseInt(btn.dataset.id)))
        );
        container.querySelectorAll('.inscrire-eleve').forEach(btn =>
            btn.addEventListener('click', () => this.showInscriptionForm(parseInt(btn.dataset.id)))
        );
        container.querySelectorAll('.delete-eleve').forEach(btn =>
            btn.addEventListener('click', () => this.deleteEleve(parseInt(btn.dataset.id)))
        );
    },

    async showForm(id = null) {
        let eleve = {
            matricule: '',
            nom: '',
            prenom: '',
            date_naissance: '',
            adresse: '',
            telephone: '',
            email: '',
            tuteur: '',
            statut: 'actif',
            photo: null
        };

        if (id) {
            const row = db.selectObject('SELECT * FROM eleves WHERE id = ?', [id]);
            if (row) {
                eleve = row;
            }
        }

        // Construire le contenu du formulaire
        const contenu = `
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 0.5rem 1rem;">
                <div>
                    <label>Matricule</label>
                    <input id="eleve-matricule" value="${eleve.matricule || ''}">
                </div>
                <div>
                    <label>Nom *</label>
                    <input id="eleve-nom" value="${eleve.nom}" required>
                </div>
                <div>
                    <label>Prénom *</label>
                    <input id="eleve-prenom" value="${eleve.prenom}" required>
                </div>
                <div>
                    <label>Date naissance</label>
                    <input type="date" id="eleve-naissance" value="${eleve.date_naissance || ''}">
                </div>
                <div>
                    <label>Adresse</label>
                    <input id="eleve-adresse" value="${eleve.adresse || ''}">
                </div>
                <div>
                    <label>Téléphone</label>
                    <input id="eleve-telephone" value="${eleve.telephone || ''}">
                </div>
                <div>
                    <label>Email</label>
                    <input type="email" id="eleve-email" value="${eleve.email || ''}">
                </div>
                <div>
                    <label>Tuteur</label>
                    <input id="eleve-tuteur" value="${eleve.tuteur || ''}">
                </div>
                <div>
                    <label>Statut</label>
                    <select id="eleve-statut">
                        <option value="actif" ${eleve.statut === 'actif' ? 'selected' : ''}>Actif</option>
                        <option value="inactif" ${eleve.statut === 'inactif' ? 'selected' : ''}>Inactif</option>
                    </select>
                </div>
                <div>
                    <label>Photo</label>
                    <input type="file" id="eleve-photo" accept="image/*">
                    ${eleve.photo ? '<p>Photo existante</p>' : ''}
                </div>
            </div>
        `;

        creerModal({
            titre: id ? 'Modifier l\'élève' : 'Nouvel élève',
            contenu,
            onConfirm: async () => {
                const matricule = document.getElementById('eleve-matricule').value.trim();
                const nom = document.getElementById('eleve-nom').value.trim();
                const prenom = document.getElementById('eleve-prenom').value.trim();
                if (!nom || !prenom) {
                    creerNotification('Nom et prénom obligatoires', 'error');
                    return;
                }

                const naissance = document.getElementById('eleve-naissance').value;
                const adresse = document.getElementById('eleve-adresse').value.trim();
                const telephone = document.getElementById('eleve-telephone').value.trim();
                const email = document.getElementById('eleve-email').value.trim();
                const tuteur = document.getElementById('eleve-tuteur').value.trim();
                const statut = document.getElementById('eleve-statut').value;

                let photoBlob = null;
                const photoInput = document.getElementById('eleve-photo');
                if (photoInput.files.length > 0) {
                    const file = photoInput.files[0];
                    const buffer = await file.arrayBuffer();
                    photoBlob = new Uint8Array(buffer);
                }

                if (id) {
                    // Mise à jour (si nouvelle photo fournie, on la met à jour, sinon on garde l'ancienne)
                    if (photoBlob) {
                        db.exec(`UPDATE eleves SET matricule=?, nom=?, prenom=?, date_naissance=?, adresse=?, telephone=?, email=?, tuteur=?, statut=?, photo=? WHERE id=?`,
                            [matricule, nom, prenom, naissance, adresse, telephone, email, tuteur, statut, photoBlob, id]);
                    } else {
                        db.exec(`UPDATE eleves SET matricule=?, nom=?, prenom=?, date_naissance=?, adresse=?, telephone=?, email=?, tuteur=?, statut=? WHERE id=?`,
                            [matricule, nom, prenom, naissance, adresse, telephone, email, tuteur, statut, id]);
                    }
                } else {
                    // Nouvel élève
                    db.exec(`INSERT INTO eleves(matricule, nom, prenom, date_naissance, adresse, telephone, email, tuteur, statut, photo)
                             VALUES(?,?,?,?,?,?,?,?,?,?)`,
                        [matricule, nom, prenom, naissance, adresse, telephone, email, tuteur, statut, photoBlob]);
                }

                creerNotification('Élève enregistré', 'success');
                this.renderList();
            }
        });
    },

    async showInscriptionForm(eleveId) {
        // Récupérer l'élève
        const eleve = db.selectObject('SELECT nom, prenom FROM eleves WHERE id = ?', [eleveId]);
        if (!eleve) return;

        // Classes disponibles pour l'année active
        const classes = db.exec('SELECT id, nom FROM classes WHERE id_annee_scolaire = ? ORDER BY nom', { rowMode: 'object' }, [this.currentAnneeId]);

        // Inscription actuelle
        const current = db.selectObject(
            'SELECT id_classe FROM inscriptions WHERE id_eleve = ? AND id_annee_scolaire = ?',
            [eleveId, this.currentAnneeId]
        );
        const currentClasseId = current ? current.id_classe : null;

        let options = classes.map(c => `<option value="${c.id}" ${c.id === currentClasseId ? 'selected' : ''}>${c.nom}</option>`).join('');
        options = `<option value="">-- Aucune --</option>` + options;

        creerModal({
            titre: `Inscrire ${eleve.prenom} ${eleve.nom}`,
            contenu: `
                <p>Choisissez la classe pour l'année scolaire active :</p>
                <select id="inscrire-classe">${options}</select>
            `,
            onConfirm: () => {
                const classeId = document.getElementById('inscrire-classe').value;
                // Supprimer l'inscription existante pour cette année
                db.exec('DELETE FROM inscriptions WHERE id_eleve = ? AND id_annee_scolaire = ?', [eleveId, this.currentAnneeId]);
                if (classeId) {
                    db.exec('INSERT INTO inscriptions(id_eleve, id_classe, id_annee_scolaire) VALUES(?,?,?)',
                        [eleveId, parseInt(classeId), this.currentAnneeId]);
                }
                creerNotification('Inscription mise à jour', 'success');
                this.renderList();
            }
        });
    },

    deleteEleve(id) {
        // Vérifier les dépendances
        const notes = db.selectObject('SELECT COUNT(*) as cnt FROM notes WHERE eleve_id = ?', [id]);
        const sanctions = db.selectObject('SELECT COUNT(*) as cnt FROM sanctions WHERE eleve_id = ?', [id]);
        const inscriptions = db.selectObject('SELECT COUNT(*) as cnt FROM inscriptions WHERE id_eleve = ?', [id]);

        let message = 'Supprimer cet élève ?';
        if ((notes && notes.cnt > 0) || (sanctions && sanctions.cnt > 0) || (inscriptions && inscriptions.cnt > 0)) {
            message += ' Des notes, sanctions ou inscriptions existent et seront également supprimées.';
        }

        creerModal({
            titre: 'Confirmation',
            contenu: message,
            onConfirm: () => {
                // Supprimer d'abord les dépendances
                db.exec('DELETE FROM inscriptions WHERE id_eleve = ?', [id]);
                db.exec('DELETE FROM notes WHERE eleve_id = ?', [id]);
                db.exec('DELETE FROM sanctions WHERE eleve_id = ?', [id]);
                db.exec('DELETE FROM dispenses WHERE eleve_id = ?', [id]);
                db.exec('DELETE FROM eleves WHERE id = ?', [id]);
                creerNotification('Élève supprimé', 'success');
                this.renderList();
            }
        });
    }
};