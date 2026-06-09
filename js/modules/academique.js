// academique.js - Module Académique
import { db } from '../db.js';
import { creerNotification, creerModal } from '../ui.js';

export const AcademiqueModule = {
    currentTab: 'annees', // onglet interne
    render(container) {
        container.innerHTML = `
            <div class="card">
                <div class="tabs" style="display:flex; gap:0.5rem; margin-bottom:1rem;">
                    <button class="tab-btn" data-tab="annees">Années scolaires</button>
                    <button class="tab-btn" data-tab="classes">Classes</button>
                    <button class="tab-btn" data-tab="matieres">Matières & coefficients</button>
                    <button class="tab-btn" data-tab="trimestres">Trimestres</button>
                </div>
                <div id="acad-content"></div>
            </div>
        `;

        const self = this;
        // Gestion des onglets
        container.querySelectorAll('.tab-btn').forEach(btn => {
            btn.addEventListener('click', function() {
                self.currentTab = this.dataset.tab;
                self.renderTabContent();
            });
        });

        // Onglet actif par défaut
        const activeBtn = container.querySelector(`.tab-btn[data-tab="${this.currentTab}"]`);
        if (activeBtn) activeBtn.style.background = 'var(--secondary)';
        this.renderTabContent();
    },

    renderTabContent() {
        const contentDiv = document.getElementById('acad-content');
        if (!contentDiv) return;
        contentDiv.innerHTML = '';
        // Mettre en évidence le bouton actif
        document.querySelectorAll('.tab-btn').forEach(b => b.style.background = '');
        const btn = document.querySelector(`.tab-btn[data-tab="${this.currentTab}"]`);
        if (btn) btn.style.background = 'var(--secondary)';

        switch (this.currentTab) {
            case 'annees': this.renderAnnees(contentDiv); break;
            case 'classes': this.renderClasses(contentDiv); break;
            case 'matieres': this.renderMatieres(contentDiv); break;
            case 'trimestres': this.renderTrimestres(contentDiv); break;
        }
    },

    // ==================== ANNÉES SCOLAIRES ====================
    async renderAnnees(container) {
        const annees = db.exec('SELECT * FROM annees_scolaires ORDER BY date_debut DESC', { rowMode: 'object' });
        let html = `<h3>Années scolaires</h3>
            <button id="add-annee-btn">+ Nouvelle année</button>
            <table style="width:100%; margin-top:1rem;">
                <thead><tr><th>Libellé</th><th>Début</th><th>Fin</th><th>Active</th><th>Actions</th></tr></thead>
                <tbody>`;
        annees.forEach(a => {
            html += `<tr>
                <td>${a.libelle}</td>
                <td>${a.date_debut || ''}</td>
                <td>${a.date_fin || ''}</td>
                <td>${a.est_active ? '✅' : ''}</td>
                <td>
                    <button class="edit-annee" data-id="${a.id}">Modifier</button>
                    ${!a.est_active ? `<button class="delete-annee" data-id="${a.id}">Supprimer</button>` : ''}
                </td>
            </tr>`;
        });
        html += `</tbody></table>`;
        container.innerHTML = html;

        // Événements
        document.getElementById('add-annee-btn').addEventListener('click', () => this.showAnneeForm());
        container.querySelectorAll('.edit-annee').forEach(btn => {
            btn.addEventListener('click', () => this.showAnneeForm(parseInt(btn.dataset.id)));
        });
        container.querySelectorAll('.delete-annee').forEach(btn => {
            btn.addEventListener('click', () => this.deleteAnnee(parseInt(btn.dataset.id)));
        });
    },

    showAnneeForm(id = null) {
        let annee = { libelle: '', date_debut: '', date_fin: '', est_active: 0 };
        if (id) {
            annee = db.selectObject('SELECT * FROM annees_scolaires WHERE id = ?', [id]);
        }
        creerModal({
            titre: id ? 'Modifier l\'année' : 'Nouvelle année scolaire',
            contenu: `
                <label>Libellé</label>
                <input id="annee-libelle" value="${annee.libelle}" required>
                <label>Date début</label>
                <input type="date" id="annee-debut" value="${annee.date_debut || ''}">
                <label>Date fin</label>
                <input type="date" id="annee-fin" value="${annee.date_fin || ''}">
                <label>Active</label>
                <input type="checkbox" id="annee-active" ${annee.est_active ? 'checked' : ''}>
            `,
            onConfirm: () => {
                const libelle = document.getElementById('annee-libelle').value.trim();
                if (!libelle) { creerNotification('Libellé obligatoire', 'error'); return; }
                const date_debut = document.getElementById('annee-debut').value;
                const date_fin = document.getElementById('annee-fin').value;
                const est_active = document.getElementById('annee-active').checked ? 1 : 0;

                if (id) {
                    // Mise à jour
                    db.exec(`UPDATE annees_scolaires SET libelle=?, date_debut=?, date_fin=?, est_active=? WHERE id=?`,
                        [libelle, date_debut, date_fin, est_active, id]);
                } else {
                    // Insertion
                    db.exec(`INSERT INTO annees_scolaires(libelle, date_debut, date_fin, est_active) VALUES(?,?,?,?)`,
                        [libelle, date_debut, date_fin, est_active]);
                    // Si active, désactiver les autres
                    if (est_active) this.desactiverAutresAnnees(db.lastInsertId);
                }
                creerNotification('Année enregistrée', 'success');
                this.renderTabContent(); // rafraîchir
            }
        });
    },

    desactiverAutresAnnees(exceptId) {
        db.exec('UPDATE annees_scolaires SET est_active = 0 WHERE id != ?', [exceptId]);
    },

    async deleteAnnee(id) {
        // Vérifier qu'il n'y a pas de données liées
        const count = db.selectObject('SELECT COUNT(*) as cnt FROM classes WHERE id_annee_scolaire = ?', [id]);
        if (count && count.cnt > 0) {
            creerNotification('Impossible de supprimer une année avec des classes.', 'error');
            return;
        }
        creerModal({
            titre: 'Confirmation',
            contenu: 'Supprimer cette année scolaire ?',
            onConfirm: () => {
                db.exec('DELETE FROM annees_scolaires WHERE id = ?', [id]);
                creerNotification('Année supprimée', 'success');
                this.renderTabContent();
            }
        });
    },

    // ==================== CLASSES ====================
    async renderClasses(container) {
        // Choix de l'année scolaire active ou non
        const annees = db.exec('SELECT id, libelle, est_active FROM annees_scolaires ORDER BY est_active DESC, date_debut DESC', { rowMode: 'object' });
        if (!annees.length) {
            container.innerHTML = '<p>Aucune année scolaire. Veuillez d\'abord créer une année.</p>';
            return;
        }
        const activeAnnee = annees.find(a => a.est_active === 1) || annees[0];
        let html = `<h3>Classes pour l'année : 
            <select id="classe-annee-select">`;
        annees.forEach(a => {
            html += `<option value="${a.id}" ${a.id === activeAnnee.id ? 'selected' : ''}>${a.libelle}</option>`;
        });
        html += `</select></h3>
            <button id="add-classe-btn">+ Nouvelle classe</button>
            <table style="width:100%; margin-top:1rem;">
                <thead><tr><th>Nom</th><th>Niveau</th><th>Actions</th></tr></thead>
                <tbody id="classe-tbody"></tbody>
            </table>`;
        container.innerHTML = html;

        const anneeSelect = document.getElementById('classe-annee-select');
        const tbody = document.getElementById('classe-tbody');

        const loadClasses = () => {
            const anneeId = parseInt(anneeSelect.value);
            const classes = db.exec('SELECT * FROM classes WHERE id_annee_scolaire = ? ORDER BY niveau, nom', { rowMode: 'object' }, [anneeId]);
            tbody.innerHTML = '';
            classes.forEach(c => {
                const tr = document.createElement('tr');
                tr.innerHTML = `
                    <td>${c.nom}</td>
                    <td>${c.niveau}</td>
                    <td>
                        <button class="edit-classe" data-id="${c.id}">Modifier</button>
                        <button class="delete-classe" data-id="${c.id}">Supprimer</button>
                    </td>`;
                tbody.appendChild(tr);
            });
            // Réattacher les événements
            tbody.querySelectorAll('.edit-classe').forEach(b => b.addEventListener('click', () => this.showClasseForm(parseInt(b.dataset.id))));
            tbody.querySelectorAll('.delete-classe').forEach(b => b.addEventListener('click', () => this.deleteClasse(parseInt(b.dataset.id))));
        };

        anneeSelect.addEventListener('change', loadClasses);
        document.getElementById('add-classe-btn').addEventListener('click', () => this.showClasseForm(null, parseInt(anneeSelect.value)));
        loadClasses();
    },

    showClasseForm(id = null, anneeId = null) {
        let classe = { nom: '', niveau: '', id_annee_scolaire: anneeId };
        if (id) {
            classe = db.selectObject('SELECT * FROM classes WHERE id = ?', [id]);
        }
        if (!classe.id_annee_scolaire && anneeId) classe.id_annee_scolaire = anneeId;
        const annees = db.exec('SELECT id, libelle FROM annees_scolaires', { rowMode: 'object' });
        creerModal({
            titre: id ? 'Modifier la classe' : 'Nouvelle classe',
            contenu: `
                <label>Nom</label>
                <input id="classe-nom" value="${classe.nom}" required>
                <label>Niveau (6,5,4,3,2,1,0)</label>
                <input type="number" id="classe-niveau" value="${classe.niveau}" required>
                <label>Année scolaire</label>
                <select id="classe-annee">
                    ${annees.map(a => `<option value="${a.id}" ${a.id === classe.id_annee_scolaire ? 'selected' : ''}>${a.libelle}</option>`).join('')}
                </select>
            `,
            onConfirm: () => {
                const nom = document.getElementById('classe-nom').value.trim();
                const niveau = parseInt(document.getElementById('classe-niveau').value);
                const annee = parseInt(document.getElementById('classe-annee').value);
                if (!nom || isNaN(niveau)) {
                    creerNotification('Nom et niveau requis', 'error'); return;
                }
                if (id) {
                    db.exec('UPDATE classes SET nom=?, niveau=?, id_annee_scolaire=? WHERE id=?', [nom, niveau, annee, id]);
                } else {
                    db.exec('INSERT INTO classes(nom, niveau, id_annee_scolaire) VALUES(?,?,?)', [nom, niveau, annee]);
                }
                creerNotification('Classe enregistrée', 'success');
                this.renderTabContent();
            }
        });
    },

    deleteClasse(id) {
        // Vérifier inscriptions
        const count = db.selectObject('SELECT COUNT(*) as cnt FROM inscriptions WHERE id_classe = ?', [id]);
        if (count && count.cnt > 0) {
            creerNotification('Des élèves sont inscrits dans cette classe.', 'error');
            return;
        }
        creerModal({
            titre: 'Confirmation',
            contenu: 'Supprimer cette classe ?',
            onConfirm: () => {
                db.exec('DELETE FROM classes WHERE id = ?', [id]);
                creerNotification('Classe supprimée', 'success');
                this.renderTabContent();
            }
        });
    },

    // ==================== MATIÈRES & COEFFICIENTS ====================
    async renderMatieres(container) {
        // Gestion des matières globales et des coefficients par niveau (année sélectionnée)
        const annees = db.exec('SELECT id, libelle FROM annees_scolaires ORDER BY est_active DESC, date_debut DESC', { rowMode: 'object' });
        if (!annees.length) {
            container.innerHTML = '<p>Créez d\'abord une année scolaire.</p>';
            return;
        }
        const anneeActive = annees.find(a => a.est_active === 1) || annees[0];
        let html = `<h3>Matières et coefficients pour l'année :
            <select id="matiere-annee-select">`;
        annees.forEach(a => html += `<option value="${a.id}" ${a.id === anneeActive.id ? 'selected' : ''}>${a.libelle}</option>`);
        html += `</select></h3>
            <div style="display:flex; gap:1rem; margin-bottom:1rem;">
                <div style="flex:1;">
                    <h4>Matières disponibles</h4>
                    <button id="add-matiere-btn">+ Nouvelle matière</button>
                    <ul id="matieres-liste" style="list-style:none; padding:0;"></ul>
                </div>
                <div style="flex:2;">
                    <h4>Configuration par niveau</h4>
                    <div id="matiere-config"></div>
                </div>
            </div>`;
        container.innerHTML = html;

        const anneeSelect = document.getElementById('matiere-annee-select');
        const matieresListe = document.getElementById('matieres-liste');
        const matiereConfig = document.getElementById('matiere-config');

        const loadMatieres = () => {
            const matieres = db.exec('SELECT * FROM matieres ORDER BY code', { rowMode: 'object' });
            matieresListe.innerHTML = '';
            matieres.forEach(m => {
                const li = document.createElement('li');
                li.style.cssText = 'padding:0.5rem; cursor:pointer; border-bottom:1px solid #ddd;';
                li.innerHTML = `${m.nom} (${m.code})`;
                li.addEventListener('click', () => this.loadMatiereConfig(m, parseInt(anneeSelect.value), matiereConfig));
                matieresListe.appendChild(li);
            });
        };

        document.getElementById('add-matiere-btn').addEventListener('click', () => this.showMatiereForm());
        anneeSelect.addEventListener('change', () => {
            // Réafficher la config si une matière est sélectionnée
            matiereConfig.innerHTML = '<p>Sélectionnez une matière pour configurer les coefficients par niveau.</p>';
        });
        loadMatieres();
    },

    showMatiereForm(id = null) {
        let matiere = { code: '', nom: '', description: '' };
        if (id) {
            matiere = db.selectObject('SELECT * FROM matieres WHERE id = ?', [id]);
        }
        creerModal({
            titre: id ? 'Modifier la matière' : 'Nouvelle matière',
            contenu: `
                <label>Code</label>
                <input id="matiere-code" value="${matiere.code}" required>
                <label>Nom</label>
                <input id="matiere-nom" value="${matiere.nom}" required>
                <label>Description</label>
                <textarea id="matiere-desc">${matiere.description || ''}</textarea>
            `,
            onConfirm: () => {
                const code = document.getElementById('matiere-code').value.trim();
                const nom = document.getElementById('matiere-nom').value.trim();
                const desc = document.getElementById('matiere-desc').value.trim();
                if (!code || !nom) { creerNotification('Code et nom obligatoires', 'error'); return; }
                if (id) {
                    db.exec('UPDATE matieres SET code=?, nom=?, description=? WHERE id=?', [code, nom, desc, id]);
                } else {
                    db.exec('INSERT INTO matieres(code, nom, description) VALUES(?,?,?)', [code, nom, desc]);
                }
                creerNotification('Matière enregistrée', 'success');
                this.renderTabContent();
            }
        });
    },

    loadMatiereConfig(matiere, anneeId, container) {
        container.innerHTML = `<h4>${matiere.nom} - Coefficients par niveau (Année ${anneeId})</h4>`;
        const niveaux = [6,5,4,3,2,1,0]; // on peut récupérer dynamiquement depuis les classes
        const configs = db.exec('SELECT * FROM matieres_niveaux WHERE matiere_id = ? AND annee_scolaire_id = ?', { rowMode: 'object' }, [matiere.id, anneeId]);
        let formHtml = '';
        niveaux.forEach(niv => {
            const cfg = configs.find(c => c.niveau === niv);
            const coefDef = cfg ? cfg.coefficient_defaut : 1;
            const coefDev = cfg ? cfg.coefficient_devoir : 1;
            const coefComp = cfg ? cfg.coefficient_composition : 1;
            formHtml += `
                <div style="margin-bottom:0.5rem; border:1px solid #eee; padding:0.5rem;">
                    <strong>Niveau ${niv}</strong>
                    <label>Coef. matière</label>
                    <input type="number" step="0.1" class="coef-defaut" data-niveau="${niv}" value="${coefDef}">
                    <label>Coef. devoirs</label>
                    <input type="number" step="0.1" class="coef-devoir" data-niveau="${niv}" value="${coefDev}">
                    <label>Coef. composition</label>
                    <input type="number" step="0.1" class="coef-composition" data-niveau="${niv}" value="${coefComp}">
                </div>`;
        });
        formHtml += `<button id="save-matiere-coefs">Enregistrer</button>`;
        container.innerHTML += formHtml;

        document.getElementById('save-matiere-coefs').addEventListener('click', () => {
            const inputs = container.querySelectorAll('input');
            const data = {};
            inputs.forEach(inp => {
                const niveau = parseInt(inp.dataset.niveau);
                if (!data[niveau]) data[niveau] = {};
                if (inp.classList.contains('coef-defaut')) data[niveau].coef_defaut = parseFloat(inp.value) || 0;
                if (inp.classList.contains('coef-devoir')) data[niveau].coef_devoir = parseFloat(inp.value) || 0;
                if (inp.classList.contains('coef-composition')) data[niveau].coef_composition = parseFloat(inp.value) || 0;
            });
            // Sauvegarder
            for (let [niv, coefs] of Object.entries(data)) {
                const exist = db.selectObject('SELECT id FROM matieres_niveaux WHERE matiere_id=? AND niveau=? AND annee_scolaire_id=?',
                    [matiere.id, parseInt(niv), anneeId]);
                if (exist) {
                    db.exec('UPDATE matieres_niveaux SET coefficient_defaut=?, coefficient_devoir=?, coefficient_composition=? WHERE id=?',
                        [coefs.coef_defaut, coefs.coef_devoir, coefs.coef_composition, exist.id]);
                } else {
                    db.exec('INSERT INTO matieres_niveaux(matiere_id, niveau, annee_scolaire_id, coefficient_defaut, coefficient_devoir, coefficient_composition) VALUES(?,?,?,?,?,?)',
                        [matiere.id, parseInt(niv), anneeId, coefs.coef_defaut, coefs.coef_devoir, coefs.coef_composition]);
                }
            }
            creerNotification('Coefficients sauvegardés', 'success');
        });
    },

    // ==================== TRIMESTRES ====================
    async renderTrimestres(container) {
        const annees = db.exec('SELECT id, libelle, est_active FROM annees_scolaires ORDER BY est_active DESC', { rowMode: 'object' });
        if (!annees.length) {
            container.innerHTML = '<p>Aucune année scolaire.</p>';
            return;
        }
        const anneeActive = annees.find(a => a.est_active === 1) || annees[0];
        let html = `<h3>Trimestres pour l'année :
            <select id="trim-annee-select">`;
        annees.forEach(a => html += `<option value="${a.id}" ${a.id === anneeActive.id ? 'selected' : ''}>${a.libelle}</option>`);
        html += `</select></h3>
            <button id="add-trimestre-btn">+ Nouveau trimestre</button>
            <table style="width:100%; margin-top:1rem;">
                <thead><tr><th>Libellé</th><th>Ordre</th><th>Début</th><th>Fin</th><th>Actif</th><th>Actions</th></tr></thead>
                <tbody id="trim-tbody"></tbody>
            </table>`;
        container.innerHTML = html;

        const anneeSelect = document.getElementById('trim-annee-select');
        const tbody = document.getElementById('trim-tbody');

        const loadTrimestres = () => {
            const anneeId = parseInt(anneeSelect.value);
            const trimestres = db.exec('SELECT * FROM trimestres WHERE id_annee_scolaire = ? ORDER BY ordre', { rowMode: 'object' }, [anneeId]);
            tbody.innerHTML = '';
            trimestres.forEach(t => {
                const tr = document.createElement('tr');
                tr.innerHTML = `
                    <td>${t.libelle}</td>
                    <td>${t.ordre}</td>
                    <td>${t.date_debut || ''}</td>
                    <td>${t.date_fin || ''}</td>
                    <td>${t.est_actif ? '✅' : ''}</td>
                    <td>
                        <button class="edit-trimestre" data-id="${t.id}">Modifier</button>
                        <button class="delete-trimestre" data-id="${t.id}">Supprimer</button>
                    </td>`;
                tbody.appendChild(tr);
            });
            tbody.querySelectorAll('.edit-trimestre').forEach(b => b.addEventListener('click', () => this.showTrimestreForm(parseInt(b.dataset.id))));
            tbody.querySelectorAll('.delete-trimestre').forEach(b => b.addEventListener('click', () => this.deleteTrimestre(parseInt(b.dataset.id))));
        };

        anneeSelect.addEventListener('change', loadTrimestres);
        document.getElementById('add-trimestre-btn').addEventListener('click', () => this.showTrimestreForm(null, parseInt(anneeSelect.value)));
        loadTrimestres();
    },

    showTrimestreForm(id = null, anneeId = null) {
        let trimestre = { libelle: '', ordre: '', date_debut: '', date_fin: '', est_actif: 0, id_annee_scolaire: anneeId };
        if (id) {
            trimestre = db.selectObject('SELECT * FROM trimestres WHERE id = ?', [id]);
        }
        const annees = db.exec('SELECT id, libelle FROM annees_scolaires', { rowMode: 'object' });
        creerModal({
            titre: id ? 'Modifier le trimestre' : 'Nouveau trimestre',
            contenu: `
                <label>Libellé</label>
                <input id="trim-libelle" value="${trimestre.libelle}" required>
                <label>Ordre</label>
                <input type="number" id="trim-ordre" value="${trimestre.ordre}" required>
                <label>Date début</label>
                <input type="date" id="trim-debut" value="${trimestre.date_debut || ''}">
                <label>Date fin</label>
                <input type="date" id="trim-fin" value="${trimestre.date_fin || ''}">
                <label>Actif</label>
                <input type="checkbox" id="trim-actif" ${trimestre.est_actif ? 'checked' : ''}>
                <label>Année</label>
                <select id="trim-annee">
                    ${annees.map(a => `<option value="${a.id}" ${a.id === trimestre.id_annee_scolaire ? 'selected' : ''}>${a.libelle}</option>`).join('')}
                </select>
            `,
            onConfirm: () => {
                const libelle = document.getElementById('trim-libelle').value.trim();
                const ordre = parseInt(document.getElementById('trim-ordre').value);
                const debut = document.getElementById('trim-debut').value;
                const fin = document.getElementById('trim-fin').value;
                const actif = document.getElementById('trim-actif').checked ? 1 : 0;
                const annee = parseInt(document.getElementById('trim-annee').value);
                if (!libelle || isNaN(ordre)) { creerNotification('Libellé et ordre requis', 'error'); return; }
                if (id) {
                    db.exec('UPDATE trimestres SET libelle=?, ordre=?, date_debut=?, date_fin=?, est_actif=?, id_annee_scolaire=? WHERE id=?',
                        [libelle, ordre, debut, fin, actif, annee, id]);
                } else {
                    db.exec('INSERT INTO trimestres(libelle, ordre, date_debut, date_fin, est_actif, id_annee_scolaire) VALUES(?,?,?,?,?,?)',
                        [libelle, ordre, debut, fin, actif, annee]);
                }
                creerNotification('Trimestre enregistré', 'success');
                this.renderTabContent();
            }
        });
    },

    deleteTrimestre(id) {
        creerModal({
            titre: 'Confirmation',
            contenu: 'Supprimer ce trimestre ?',
            onConfirm: () => {
                db.exec('DELETE FROM trimestres WHERE id = ?', [id]);
                creerNotification('Trimestre supprimé', 'success');
                this.renderTabContent();
            }
        });
    }
};