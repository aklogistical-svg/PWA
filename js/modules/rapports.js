// rapports.js - Module Rapports & Résultats
import { db } from '../db.js';
import { creerNotification, creerModal } from '../ui.js';

export const RapportsModule = {
    currentAnneeId: null,

    async render(container) {
        const active = db.selectObject('SELECT id FROM annees_scolaires WHERE est_active = 1');
        this.currentAnneeId = active ? active.id : (db.selectObject('SELECT id FROM annees_scolaires ORDER BY date_debut DESC LIMIT 1') || {}).id;

        container.innerHTML = `
            <div class="card">
                <h3>Rapports & Résultats</h3>
                <div style="display: flex; gap: 1rem; flex-wrap: wrap; margin-bottom: 1rem;">
                    <div>
                        <label>Année scolaire</label>
                        <select id="rapport-annee-select"></select>
                    </div>
                    <div id="rapport-classe-container">
                        <label>Classe</label>
                        <select id="rapport-classe-select"><option value="">-- Choisir --</option></select>
                    </div>
                    <div id="rapport-trimestre-container">
                        <label>Trimestre</label>
                        <select id="rapport-trimestre-select"><option value="">-- Tous --</option></select>
                    </div>
                </div>
                <div id="rapport-buttons" style="margin-bottom: 1rem;">
                    <button id="btn-bulletin-classe">📋 Bulletin de classe</button>
                    <button id="btn-bulletin-eleve">👤 Bulletin individuel</button>
                    <button id="btn-stats">📊 Statistiques</button>
                </div>
                <div id="rapport-content"></div>
            </div>
        `;

        this.populateSelects();
        this.attachEvents();
    },

    populateSelects() {
        // Charger les années scolaires
        const annees = db.exec('SELECT id, libelle FROM annees_scolaires ORDER BY date_debut DESC', { rowMode: 'object' });
        const anneeSelect = document.getElementById('rapport-annee-select');
        anneeSelect.innerHTML = annees.map(a => `<option value="${a.id}" ${a.id === this.currentAnneeId ? 'selected' : ''}>${a.libelle}</option>`).join('');
        this.currentAnneeId = parseInt(anneeSelect.value);

        // Classes de l'année sélectionnée
        this.loadClasses();
        // Trimestres
        this.loadTrimestres();

        anneeSelect.addEventListener('change', () => {
            this.currentAnneeId = parseInt(anneeSelect.value);
            this.loadClasses();
            this.loadTrimestres();
        });
    },

    loadClasses() {
        const classes = db.exec('SELECT id, nom FROM classes WHERE id_annee_scolaire = ? ORDER BY nom', { rowMode: 'object' }, [this.currentAnneeId]);
        const classeSelect = document.getElementById('rapport-classe-select');
        classeSelect.innerHTML = '<option value="">-- Choisir --</option>' + classes.map(c => `<option value="${c.id}">${c.nom}</option>`).join('');
    },

    loadTrimestres() {
        const trimestres = db.exec('SELECT id, libelle FROM trimestres WHERE id_annee_scolaire = ? ORDER BY ordre', { rowMode: 'object' }, [this.currentAnneeId]);
        const trimSelect = document.getElementById('rapport-trimestre-select');
        trimSelect.innerHTML = '<option value="">-- Tous --</option>' + trimestres.map(t => `<option value="${t.id}">${t.libelle}</option>`).join('');
    },

    attachEvents() {
        document.getElementById('btn-bulletin-classe').addEventListener('click', () => this.afficherBulletinClasse());
        document.getElementById('btn-bulletin-eleve').addEventListener('click', () => this.afficherBulletinEleve());
        document.getElementById('btn-stats').addEventListener('click', () => this.afficherStatistiques());
    },

    // ==================== BULLETIN DE CLASSE ====================
    afficherBulletinClasse() {
        const classeId = parseInt(document.getElementById('rapport-classe-select').value);
        const trimestreId = document.getElementById('rapport-trimestre-select').value ? parseInt(document.getElementById('rapport-trimestre-select').value) : null;

        if (!classeId) {
            creerNotification('Veuillez choisir une classe.', 'error');
            return;
        }

        const anneeId = this.currentAnneeId;
        const classe = db.selectObject('SELECT nom, niveau FROM classes WHERE id = ?', [classeId]);
        if (!classe) return;

        // Élèves de la classe pour l'année
        const eleves = db.exec(
            `SELECT e.id, e.nom, e.prenom FROM eleves e
             JOIN inscriptions i ON e.id = i.id_eleve
             WHERE i.id_classe = ? AND i.id_annee_scolaire = ? AND e.statut = 'actif'
             ORDER BY e.nom, e.prenom`,
            { rowMode: 'object' },
            [classeId, anneeId]
        );
        if (eleves.length === 0) {
            document.getElementById('rapport-content').innerHTML = '<p>Aucun élève dans cette classe.</p>';
            return;
        }

        // Matières du niveau pour l'année
        const matieres = db.exec(
            `SELECT m.id, m.nom, mn.coefficient_defaut, mn.coefficient_devoir, mn.coefficient_composition
             FROM matieres_niveaux mn
             JOIN matieres m ON mn.matiere_id = m.id
             WHERE mn.niveau = ? AND mn.annee_scolaire_id = ?
             ORDER BY m.nom`,
            { rowMode: 'object' },
            [classe.niveau, anneeId]
        );
        if (matieres.length === 0) {
            document.getElementById('rapport-content').innerHTML = '<p>Aucune matière configurée pour ce niveau.</p>';
            return;
        }

        // Récupérer les notes pour ces élèves, matières, trimestre(s)
        let trimestreIds;
        if (trimestreId) {
            trimestreIds = [trimestreId];
        } else {
            const allTrim = db.exec('SELECT id FROM trimestres WHERE id_annee_scolaire = ?', { rowMode: 'object' }, [anneeId]);
            trimestreIds = allTrim.map(t => t.id);
        }
        const placeholdersTrim = trimestreIds.map(() => '?').join(',');
        const eleveIds = eleves.map(e => e.id);
        const placeholdersEleve = eleveIds.map(() => '?').join(',');
        const placeholdersMat = matieres.map(m => m.id).map(() => '?').join(',');

        const notes = db.exec(
            `SELECT n.eleve_id, n.matiere_id, n.trimestre_id, n.type_epreuve, n.note
             FROM notes n
             WHERE n.trimestre_id IN (${placeholdersTrim}) AND n.eleve_id IN (${placeholdersEleve}) AND n.matiere_id IN (${placeholdersMat})`,
            { rowMode: 'object' },
            [...trimestreIds, ...eleveIds, ...matieres.map(m => m.id)]
        );

        // Dispenses
        const dispenses = db.exec(
            `SELECT eleve_id, matiere_id FROM dispenses WHERE trimestre_id IN (${placeholdersTrim})`,
            { rowMode: 'object' },
            trimestreIds
        );
        const dispenseSet = new Set();
        dispenses.forEach(d => dispenseSet.add(`${d.eleve_id}_${d.matiere_id}`));

        // Sanctions
        const sanctions = db.exec(
            `SELECT eleve_id, SUM(points_retires) as total FROM sanctions WHERE trimestre_id IN (${placeholdersTrim}) AND eleve_id IN (${placeholdersEleve}) GROUP BY eleve_id`,
            { rowMode: 'object' },
            [...trimestreIds, ...eleveIds]
        );
        const sanctionMap = {};
        sanctions.forEach(s => { sanctionMap[s.eleve_id] = s.total; });

        // Calcul pour chaque élève
        const resultats = eleves.map(e => {
            let totalPondere = 0;
            let totalCoeff = 0;
            const moyMatieres = [];

            matieres.forEach(m => {
                if (dispenseSet.has(`${e.id}_${m.id}`)) {
                    moyMatieres.push({ nom: m.nom, moyenne: 'Disp', coefficient: m.coefficient_defaut });
                    return;
                }
                const devNotes = [];
                for (let i = 1; i <= 3; i++) {
                    const noteObj = notes.find(n => n.eleve_id === e.id && n.matiere_id === m.id && n.type_epreuve === `devoir${i}`);
                    if (noteObj && noteObj.note !== null && !isNaN(noteObj.note)) devNotes.push(noteObj.note);
                }
                const compObj = notes.find(n => n.eleve_id === e.id && n.matiere_id === m.id && n.type_epreuve === 'composition');
                let compNote = compObj ? compObj.note : null;

                if (devNotes.length === 0 && compNote === null) {
                    moyMatieres.push({ nom: m.nom, moyenne: '-', coefficient: m.coefficient_defaut });
                    return;
                }

                const cd = m.coefficient_devoir || 1;
                const cc = m.coefficient_composition || 1;
                let moyMatiere = 0;
                let diviseur = 0;
                if (devNotes.length > 0) {
                    moyMatiere += cd * (devNotes.reduce((a,b)=>a+b,0) / devNotes.length);
                    diviseur += cd;
                }
                if (compNote !== null && !isNaN(compNote)) {
                    moyMatiere += cc * compNote;
                    diviseur += cc;
                }
                if (diviseur > 0) moyMatiere = moyMatiere / diviseur;

                moyMatieres.push({ nom: m.nom, moyenne: moyMatiere.toFixed(2), coefficient: m.coefficient_defaut });
                totalPondere += moyMatiere * m.coefficient_defaut;
                totalCoeff += m.coefficient_defaut;
            });

            const moyenneBrute = totalCoeff > 0 ? totalPondere / totalCoeff : null;
            const penalite = sanctionMap[e.id] || 0;
            const moyenneFinale = totalCoeff > 0 ? (totalPondere - penalite) / totalCoeff : null;

            return {
                id: e.id,
                nom: `${e.prenom} ${e.nom}`,
                moyMatieres,
                moyenneBrute,
                penalite,
                moyenneFinale
            };
        });

        // Construction du tableau HTML
        let html = `<h4>Bulletin de la classe ${classe.nom} - ${trimestreId ? db.selectObject('SELECT libelle FROM trimestres WHERE id=?',[trimestreId]).libelle : 'Année'}</h4>`;
        html += '<div style="overflow-x:auto;"><table border="1" style="border-collapse:collapse; min-width:100%;"><thead><tr><th>Élève</th>';
        matieres.forEach(m => html += `<th>${m.nom} (${m.coefficient_defaut})</th>`);
        html += '<th>Moy. brute</th><th>Sanctions</th><th>Moy. finale</th></tr></thead><tbody>';

        resultats.forEach(r => {
            html += `<tr><td><a href="#" class="lien-eleve" data-id="${r.id}">${r.nom}</a></td>`;
            r.moyMatieres.forEach(mm => {
                html += `<td>${mm.moyenne}</td>`;
            });
            html += `<td>${r.moyenneBrute !== null ? r.moyenneBrute.toFixed(2) : '-'}</td>`;
            html += `<td>${r.penalite.toFixed(1)}</td>`;
            html += `<td style="font-weight:bold; color:${r.moyenneFinale !== null && r.moyenneFinale >= 10 ? 'green' : 'red'}">${r.moyenneFinale !== null ? r.moyenneFinale.toFixed(2) : '-'}</td>`;
            html += '</tr>';
        });
        html += '</tbody></table></div>';
        html += '<button id="imprimer-classe" style="margin-top:1rem;">🖨️ Imprimer</button>';
        document.getElementById('rapport-content').innerHTML = html;

        // Ajouter événement pour le lien élève -> bulletin individuel
        document.querySelectorAll('.lien-eleve').forEach(lien => {
            lien.addEventListener('click', (e) => {
                e.preventDefault();
                const eleveId = parseInt(lien.dataset.id);
                this.afficherBulletinEleve(eleveId);
            });
        });

        document.getElementById('imprimer-classe').addEventListener('click', () => window.print());
    },

    // ==================== BULLETIN INDIVIDUEL ====================
    afficherBulletinEleve(eleveIdParam) {
        const classeId = parseInt(document.getElementById('rapport-classe-select').value);
        const trimestreId = document.getElementById('rapport-trimestre-select').value ? parseInt(document.getElementById('rapport-trimestre-select').value) : null;

        if (!classeId) {
            creerNotification('Veuillez choisir une classe.', 'error');
            return;
        }

        const anneeId = this.currentAnneeId;

        // Si aucun élève spécifique, on demande de choisir
        if (!eleveIdParam) {
            const eleves = db.exec(
                `SELECT e.id, e.nom, e.prenom FROM eleves e
                 JOIN inscriptions i ON e.id = i.id_eleve
                 WHERE i.id_classe = ? AND i.id_annee_scolaire = ? AND e.statut = 'actif'
                 ORDER BY e.nom, e.prenom`,
                { rowMode: 'object' },
                [classeId, anneeId]
            );
            if (!eleves.length) {
                creerNotification('Aucun élève dans cette classe.', 'error');
                return;
            }
            let options = eleves.map(e => `<option value="${e.id}">${e.prenom} ${e.nom}</option>`).join('');
            creerModal({
                titre: 'Choisir un élève',
                contenu: `<select id="choix-eleve">${options}</select>`,
                onConfirm: () => {
                    const id = parseInt(document.getElementById('choix-eleve').value);
                    this.afficherBulletinEleve(id);
                }
            });
            return;
        }

        // Récupérer infos élève
        const eleve = db.selectObject('SELECT nom, prenom, matricule, date_naissance FROM eleves WHERE id = ?', [eleveIdParam]);
        if (!eleve) return;

        const classe = db.selectObject('SELECT nom, niveau FROM classes WHERE id = ?', [classeId]);

        // Matières du niveau
        const matieres = db.exec(
            `SELECT m.id, m.nom, mn.coefficient_defaut, mn.coefficient_devoir, mn.coefficient_composition
             FROM matieres_niveaux mn
             JOIN matieres m ON mn.matiere_id = m.id
             WHERE mn.niveau = ? AND mn.annee_scolaire_id = ?
             ORDER BY m.nom`,
            { rowMode: 'object' },
            [classe.niveau, anneeId]
        );

        // Trimestres à traiter
        let trimestreIds;
        if (trimestreId) {
            trimestreIds = [trimestreId];
        } else {
            const allTrim = db.exec('SELECT id FROM trimestres WHERE id_annee_scolaire = ?', { rowMode: 'object' }, [anneeId]);
            trimestreIds = allTrim.map(t => t.id);
        }

        const placeholdersTrim = trimestreIds.map(() => '?').join(',');
        const notes = db.exec(
            `SELECT n.matiere_id, n.trimestre_id, n.type_epreuve, n.note
             FROM notes n
             WHERE n.eleve_id = ? AND n.trimestre_id IN (${placeholdersTrim}) AND n.matiere_id IN (${matieres.map(m => m.id).map(() => '?').join(',')})`,
            { rowMode: 'object' },
            [eleveIdParam, ...trimestreIds, ...matieres.map(m => m.id)]
        );

        // Dispenses
        const dispenses = db.exec(
            `SELECT matiere_id FROM dispenses WHERE eleve_id = ? AND trimestre_id IN (${placeholdersTrim})`,
            { rowMode: 'object' },
            [eleveIdParam, ...trimestreIds]
        );
        const dispenseSet = new Set(dispenses.map(d => d.matiere_id));

        // Sanctions
        const sanctions = db.exec(
            `SELECT SUM(points_retires) as total FROM sanctions WHERE eleve_id = ? AND trimestre_id IN (${placeholdersTrim})`,
            { rowMode: 'object' },
            [eleveIdParam, ...trimestreIds]
        );
        const penalite = sanctions[0]?.total || 0;

        // Construction du bulletin
        let html = `<div style="text-align:center; margin-bottom:1rem;">
            <h4>BULLETIN DE NOTES</h4>
            <p>${eleve.prenom} ${eleve.nom} (${eleve.matricule || ''})</p>
            <p>Classe : ${classe.nom} - ${trimestreId ? db.selectObject('SELECT libelle FROM trimestres WHERE id=?',[trimestreId]).libelle : 'Année'}</p>
            <p>Année scolaire : ${db.selectObject('SELECT libelle FROM annees_scolaires WHERE id=?',[anneeId]).libelle}</p>
        </div>`;

        html += '<table border="1" style="border-collapse:collapse; width:100%;"><thead><tr><th>Matière</th><th>Coef.</th><th>Notes</th><th>Moyenne</th><th>Dispense</th></tr></thead><tbody>';

        let totalPondere = 0;
        let totalCoeff = 0;

        matieres.forEach(m => {
            const dispense = dispenseSet.has(m.id);
            if (dispense) {
                html += `<tr><td>${m.nom}</td><td>${m.coefficient_defaut}</td><td colspan="3">Dispensé(e)</td></tr>`;
                return;
            }

            const devNotes = [];
            for (let i = 1; i <= 3; i++) {
                const noteObj = notes.find(n => n.matiere_id === m.id && n.type_epreuve === `devoir${i}`);
                if (noteObj && noteObj.note !== null) devNotes.push(noteObj.note);
            }
            const compObj = notes.find(n => n.matiere_id === m.id && n.type_epreuve === 'composition');
            let compNote = compObj ? compObj.note : null;

            if (devNotes.length === 0 && compNote === null) {
                html += `<tr><td>${m.nom}</td><td>${m.coefficient_defaut}</td><td>-</td><td>-</td><td></td></tr>`;
                return;
            }

            const cd = m.coefficient_devoir || 1;
            const cc = m.coefficient_composition || 1;
            let moyMatiere = 0;
            let diviseur = 0;
            let notesStr = '';
            if (devNotes.length > 0) {
                notesStr += 'Devoirs: ' + devNotes.join(', ') + ' ';
                const moyDev = devNotes.reduce((a,b)=>a+b,0) / devNotes.length;
                moyMatiere += cd * moyDev;
                diviseur += cd;
            }
            if (compNote !== null && !isNaN(compNote)) {
                notesStr += 'Comp: ' + compNote;
                moyMatiere += cc * compNote;
                diviseur += cc;
            }
            if (diviseur > 0) moyMatiere = moyMatiere / diviseur;

            html += `<tr>
                <td>${m.nom}</td>
                <td>${m.coefficient_defaut}</td>
                <td>${notesStr}</td>
                <td>${moyMatiere.toFixed(2)}</td>
                <td></td>
            </tr>`;
            totalPondere += moyMatiere * m.coefficient_defaut;
            totalCoeff += m.coefficient_defaut;
        });

        const moyenneBrute = totalCoeff > 0 ? totalPondere / totalCoeff : null;
        const moyenneFinale = totalCoeff > 0 ? (totalPondere - penalite) / totalCoeff : null;

        html += '</tbody></table>';

        html += `<div style="margin-top:1rem;">
            <p>Total des coefficients : ${totalCoeff}</p>
            <p>Moyenne brute : ${moyenneBrute !== null ? moyenneBrute.toFixed(2) : '-'}</p>
            <p>Sanctions : -${penalite.toFixed(1)} points</p>
            <p><strong>Moyenne générale : ${moyenneFinale !== null ? moyenneFinale.toFixed(2) + ' / 20' : '-'}</strong></p>
        </div>`;

        html += '<button onclick="window.print()" style="margin-top:1rem;">🖨️ Imprimer</button>';

        document.getElementById('rapport-content').innerHTML = html;
    },

    // ==================== STATISTIQUES ====================
    afficherStatistiques() {
        const classeId = parseInt(document.getElementById('rapport-classe-select').value);
        const trimestreId = document.getElementById('rapport-trimestre-select').value ? parseInt(document.getElementById('rapport-trimestre-select').value) : null;
        if (!classeId) {
            creerNotification('Veuillez choisir une classe.', 'error');
            return;
        }

        // Récupérer les données de bulletin de classe pour cette classe et trimestre
        // Réutilisons la logique du bulletin mais pour statistiques
        const anneeId = this.currentAnneeId;
        const classe = db.selectObject('SELECT nom, niveau FROM classes WHERE id = ?', [classeId]);
        const eleves = db.exec(
            `SELECT e.id FROM eleves e JOIN inscriptions i ON e.id = i.id_eleve
             WHERE i.id_classe = ? AND i.id_annee_scolaire = ? AND e.statut = 'actif'`,
            { rowMode: 'object' },
            [classeId, anneeId]
        );

        if (eleves.length === 0) {
            document.getElementById('rapport-content').innerHTML = '<p>Aucun élève.</p>';
            return;
        }

        // Calcul des moyennes finales (similaire à la fonction précédente mais plus condensé)
        // On va construire un tableau des moyennes pour graphique simple ou stats.
        // Pour simplifier, on va afficher : nombre d'élèves, moyenne de la classe, minimum, maximum, taux de réussite (>=10).
        // On pourrait utiliser une logique partagée, mais évitons de dupliquer.

        // Appelons une fonction interne pour obtenir les resultats
        const resultats = this.getResultatsClasse(classeId, anneeId, trimestreId);
        if (!resultats.length) {
            document.getElementById('rapport-content').innerHTML = '<p>Pas de données.</p>';
            return;
        }

        const finales = resultats.map(r => r.moyenneFinale).filter(v => v !== null);
        const nb = finales.length;
        const moyenneClasse = nb > 0 ? finales.reduce((a,b)=>a+b,0) / nb : 0;
        const min = nb > 0 ? Math.min(...finales) : 0;
        const max = nb > 0 ? Math.max(...finales) : 0;
        const reussite = finales.filter(v => v >= 10).length;

        let html = `<h4>Statistiques - ${classe.nom} (${trimestreId ? 'Trimestre' : 'Année'})</h4>`;
        html += `<p>Nombre d'élèves : ${eleves.length}</p>`;
        html += `<p>Moyenne de la classe : ${moyenneClasse.toFixed(2)} / 20</p>`;
        html += `<p>Note la plus basse : ${min.toFixed(2)}</p>`;
        html += `<p>Note la plus haute : ${max.toFixed(2)}</p>`;
        html += `<p>Taux de réussite (≥10) : ${reussite} / ${eleves.length} (${(reussite/eleves.length*100).toFixed(1)}%)</p>`;
        // Optionnel : répartition par tranche, etc.

        document.getElementById('rapport-content').innerHTML = html;
    },

    // Fonction utilitaire pour récupérer les résultats d'une classe
    getResultatsClasse(classeId, anneeId, trimestreId) {
        const classe = db.selectObject('SELECT niveau FROM classes WHERE id = ?', [classeId]);
        const eleves = db.exec(
            `SELECT e.id FROM eleves e JOIN inscriptions i ON e.id = i.id_eleve
             WHERE i.id_classe = ? AND i.id_annee_scolaire = ? AND e.statut = 'actif'`,
            { rowMode: 'object' },
            [classeId, anneeId]
        );
        if (!eleves.length || !classe) return [];

        const matieres = db.exec(
            `SELECT m.id, m.nom, mn.coefficient_defaut, mn.coefficient_devoir, mn.coefficient_composition
             FROM matieres_niveaux mn JOIN matieres m ON mn.matiere_id = m.id
             WHERE mn.niveau = ? AND mn.annee_scolaire_id = ?`,
            { rowMode: 'object' },
            [classe.niveau, anneeId]
        );
        if (!matieres.length) return [];

        let trimestreIds;
        if (trimestreId) trimestreIds = [trimestreId];
        else {
            const allTrim = db.exec('SELECT id FROM trimestres WHERE id_annee_scolaire = ?', { rowMode: 'object' }, [anneeId]);
            trimestreIds = allTrim.map(t => t.id);
        }
        const eleveIds = eleves.map(e => e.id);
        const matiereIds = matieres.map(m => m.id);

        const notes = db.exec(`SELECT n.eleve_id, n.matiere_id, n.type_epreuve, n.note FROM notes n WHERE n.trimestre_id IN (${trimestreIds.map(()=>'?').join(',')}) AND n.eleve_id IN (${eleveIds.map(()=>'?').join(',')}) AND n.matiere_id IN (${matiereIds.map(()=>'?').join(',')})`, { rowMode: 'object' }, [...trimestreIds, ...eleveIds, ...matiereIds]);
        const dispenses = db.exec(`SELECT eleve_id, matiere_id FROM dispenses WHERE trimestre_id IN (${trimestreIds.map(()=>'?').join(',')})`, { rowMode: 'object' }, trimestreIds);
        const sanctions = db.exec(`SELECT eleve_id, SUM(points_retires) as total FROM sanctions WHERE trimestre_id IN (${trimestreIds.map(()=>'?').join(',')}) AND eleve_id IN (${eleveIds.map(()=>'?').join(',')}) GROUP BY eleve_id`, { rowMode: 'object' }, [...trimestreIds, ...eleveIds]);

        const dispenseMap = new Map(); // clé "eleveId_matiereId"
        dispenses.forEach(d => dispenseMap.set(`${d.eleve_id}_${d.matiere_id}`, true));
        const sanctionMap = {};
        sanctions.forEach(s => sanctionMap[s.eleve_id] = s.total);

        return eleves.map(e => {
            let totalPondere = 0, totalCoeff = 0;
            matieres.forEach(m => {
                if (dispenseMap.has(`${e.id}_${m.id}`)) return;
                const devNotes = [];
                for (let i = 1; i <= 3; i++) {
                    const n = notes.find(no => no.eleve_id === e.id && no.matiere_id === m.id && no.type_epreuve === `devoir${i}`);
                    if (n && n.note !== null) devNotes.push(n.note);
                }
                const comp = notes.find(n => n.eleve_id === e.id && n.matiere_id === m.id && n.type_epreuve === 'composition');
                let compNote = comp ? comp.note : null;
                if (devNotes.length === 0 && (compNote === null || isNaN(compNote))) return;
                const cd = m.coefficient_devoir || 1, cc = m.coefficient_composition || 1;
                let moy = 0, div = 0;
                if (devNotes.length > 0) { moy += cd * (devNotes.reduce((a,b)=>a+b,0)/devNotes.length); div += cd; }
                if (compNote !== null && !isNaN(compNote)) { moy += cc * compNote; div += cc; }
                if (div > 0) moy /= div;
                totalPondere += moy * m.coefficient_defaut;
                totalCoeff += m.coefficient_defaut;
            });
            const penalite = sanctionMap[e.id] || 0;
            const moyenneFinale = totalCoeff > 0 ? (totalPondere - penalite) / totalCoeff : null;
            return { id: e.id, moyenneFinale };
        }).filter(r => r.moyenneFinale !== null);
    }
};