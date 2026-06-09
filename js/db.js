// db.js - Connexion SQLite + OPFS + migrations
//import sqlite3InitModule from 'https://cdn.jsdelivr.net/npm/@sqlite.org/sqlite-wasm@3.48.0/+esm';
import sqlite3InitModule from './vendor/sqlite3.mjs';
export let db = null;
let sqlite3 = null;

const DB_VERSION = 1;

export async function initDatabase() {
    if (db) return db;

    // Initialiser le module SQLite
    sqlite3 = await sqlite3InitModule();

    // Ouvrir ou créer la base dans OPFS
    db = new sqlite3.oo1.OpfsDb('/gestionscolaire.db');
    
    db.exec('PRAGMA foreign_keys = ON');
    
    // Création de la table méta
    db.exec(`CREATE TABLE IF NOT EXISTS meta (
        cle TEXT PRIMARY KEY,
        valeur TEXT
    )`);

    const row = db.selectObject('SELECT valeur FROM meta WHERE cle = ?', ['version']);
    const versionActuelle = row ? parseInt(row.valeur, 10) : 0;

    if (versionActuelle < 1) {
        await migrateV1();
    }

    db.exec('INSERT OR REPLACE INTO meta(cle, valeur) VALUES(?, ?)', ['version', DB_VERSION.toString()]);
    console.log('Base de données initialisée (version ' + DB_VERSION + ')');
    return db;
}

async function migrateV1() {
    console.log('Création du schéma initial…');
    
    // Années scolaires
    db.exec(`CREATE TABLE IF NOT EXISTS annees_scolaires (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        libelle TEXT NOT NULL,
        date_debut TEXT,
        date_fin TEXT,
        est_active INTEGER DEFAULT 0,
        created_at TEXT DEFAULT (datetime('now','localtime')),
        updated_at TEXT DEFAULT (datetime('now','localtime'))
    )`);

    // Classes
    db.exec(`CREATE TABLE IF NOT EXISTS classes (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        nom TEXT NOT NULL,
        niveau INTEGER NOT NULL,
        id_annee_scolaire INTEGER REFERENCES annees_scolaires(id),
        created_at TEXT DEFAULT (datetime('now','localtime')),
        updated_at TEXT DEFAULT (datetime('now','localtime'))
    )`);

    // Élèves
    db.exec(`CREATE TABLE IF NOT EXISTS eleves (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        matricule TEXT UNIQUE,
        nom TEXT NOT NULL,
        prenom TEXT NOT NULL,
        date_naissance TEXT,
        adresse TEXT,
        telephone TEXT,
        email TEXT,
        tuteur TEXT,
        photo BLOB,
        statut TEXT DEFAULT 'actif',
        date_inscription TEXT DEFAULT (date('now','localtime')),
        created_at TEXT DEFAULT (datetime('now','localtime')),
        updated_at TEXT DEFAULT (datetime('now','localtime'))
    )`);

    // Inscriptions (élève dans une classe pour une année)
    db.exec(`CREATE TABLE IF NOT EXISTS inscriptions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        id_eleve INTEGER NOT NULL REFERENCES eleves(id),
        id_classe INTEGER NOT NULL REFERENCES classes(id),
        id_annee_scolaire INTEGER NOT NULL REFERENCES annees_scolaires(id),
        created_at TEXT DEFAULT (datetime('now','localtime'))
    )`);

    // Enseignants
    db.exec(`CREATE TABLE IF NOT EXISTS enseignants (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        matricule TEXT UNIQUE,
        nom TEXT NOT NULL,
        prenom TEXT NOT NULL,
        specialite TEXT,
        telephone TEXT,
        email TEXT,
        statut TEXT DEFAULT 'actif',
        created_at TEXT DEFAULT (datetime('now','localtime')),
        updated_at TEXT DEFAULT (datetime('now','localtime'))
    )`);

    // Matières
    db.exec(`CREATE TABLE IF NOT EXISTS matieres (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        code TEXT UNIQUE NOT NULL,
        nom TEXT NOT NULL,
        description TEXT
    )`);

    // Matières par niveau (pour une année scolaire)
    db.exec(`CREATE TABLE IF NOT EXISTS matieres_niveaux (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        matiere_id INTEGER NOT NULL REFERENCES matieres(id),
        niveau INTEGER NOT NULL,
        annee_scolaire_id INTEGER NOT NULL REFERENCES annees_scolaires(id),
        coefficient_defaut REAL NOT NULL DEFAULT 1,
        coefficient_devoir REAL NOT NULL DEFAULT 1,
        coefficient_composition REAL NOT NULL DEFAULT 1,
        UNIQUE(matiere_id, niveau, annee_scolaire_id)
    )`);

    // Spécificité matière/classe (optionnelle)
    db.exec(`CREATE TABLE IF NOT EXISTS matieres_classes (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        classe_id INTEGER NOT NULL REFERENCES classes(id),
        matiere_id INTEGER NOT NULL REFERENCES matieres(id),
        trimestre_id INTEGER REFERENCES trimestres(id),
        coefficient REAL,
        coefficient_devoir REAL,
        coefficient_composition REAL,
        UNIQUE(classe_id, matiere_id, trimestre_id)
    )`);

    // Trimestres
    db.exec(`CREATE TABLE IF NOT EXISTS trimestres (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        libelle TEXT NOT NULL,
        id_annee_scolaire INTEGER NOT NULL REFERENCES annees_scolaires(id),
        date_debut TEXT,
        date_fin TEXT,
        est_actif INTEGER DEFAULT 0,
        ordre INTEGER NOT NULL,
        created_at TEXT DEFAULT (datetime('now','localtime'))
    )`);

    // Enseignements (prof, classe, matière, trimestre)
    db.exec(`CREATE TABLE IF NOT EXISTS enseignements (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        enseignant_id INTEGER NOT NULL REFERENCES enseignants(id),
        classe_id INTEGER NOT NULL REFERENCES classes(id),
        matiere_id INTEGER NOT NULL REFERENCES matieres(id),
        trimestre_id INTEGER NOT NULL REFERENCES trimestres(id),
        UNIQUE(enseignant_id, classe_id, matiere_id, trimestre_id)
    )`);

    // Notes (devoirs et composition)
    db.exec(`CREATE TABLE IF NOT EXISTS notes (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        eleve_id INTEGER NOT NULL REFERENCES eleves(id),
        matiere_id INTEGER NOT NULL REFERENCES matieres(id),
        trimestre_id INTEGER NOT NULL REFERENCES trimestres(id),
        type_epreuve TEXT NOT NULL CHECK(type_epreuve IN ('devoir1','devoir2','devoir3','composition')),
        note REAL,
        date_saisie TEXT DEFAULT (date('now','localtime'))
    )`);

    // Dispenses
    db.exec(`CREATE TABLE IF NOT EXISTS dispenses (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        eleve_id INTEGER NOT NULL REFERENCES eleves(id),
        matiere_id INTEGER NOT NULL REFERENCES matieres(id),
        trimestre_id INTEGER NOT NULL REFERENCES trimestres(id),
        motif TEXT,
        UNIQUE(eleve_id, matiere_id, trimestre_id)
    )`);

    // Sanctions (retards, absences, indiscipline)
    db.exec(`CREATE TABLE IF NOT EXISTS sanctions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        eleve_id INTEGER NOT NULL REFERENCES eleves(id),
        trimestre_id INTEGER NOT NULL REFERENCES trimestres(id),
        type_sanction TEXT NOT NULL CHECK(type_sanction IN ('retard','absence','indiscipline')),
        points_retires REAL NOT NULL DEFAULT 0,
        commentaire TEXT,
        date_sanction TEXT DEFAULT (date('now','localtime'))
    )`);

    // Règles de promotion
    db.exec(`CREATE TABLE IF NOT EXISTS regles_promotion (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        id_annee_scolaire INTEGER NOT NULL REFERENCES annees_scolaires(id),
        moyenne_minimale REAL NOT NULL,
        regle_json TEXT
    )`);

    // Archives des années
    db.exec(`CREATE TABLE IF NOT EXISTS archives_annees (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        id_annee_scolaire INTEGER NOT NULL REFERENCES annees_scolaires(id),
        date_archivage TEXT DEFAULT (datetime('now','localtime')),
        snapshot_db_blob BLOB
    )`);

    // Paramètres généraux
    db.exec(`CREATE TABLE IF NOT EXISTS parametres (
        cle TEXT PRIMARY KEY,
        valeur TEXT
    )`);

    console.log('Schéma V1 créé avec succès.');
}