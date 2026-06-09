// ui.js - composants UI réutilisables
export function creerNotification(message, type = 'info') {
    const area = document.getElementById('notification-area');
    const div = document.createElement('div');
    div.className = 'notification ' + type;
    div.textContent = message;
    area.appendChild(div);
    setTimeout(() => {
        div.remove();
    }, 4000);
}

export function creerModal({ titre, contenu, onConfirm, onCancel, confirmText = 'OK', cancelText = 'Annuler' }) {
    // Supprime un éventuel modal existant
    const existant = document.querySelector('.modal-overlay');
    if (existant) existant.remove();

    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.5);display:flex;justify-content:center;align-items:center;z-index:1000;';

    const box = document.createElement('div');
    box.className = 'modal-box';
    box.style.cssText = 'background:white;border-radius:8px;padding:1.5rem;min-width:300px;max-width:90%;';
    box.innerHTML = `
        <h3>${titre}</h3>
        <div>${contenu}</div>
        <div style="margin-top:1rem;display:flex;gap:0.5rem;justify-content:flex-end;">
            <button class="btn-cancel">${cancelText}</button>
            <button class="btn-confirm">${confirmText}</button>
        </div>
    `;
    overlay.appendChild(box);
    document.body.appendChild(overlay);

    box.querySelector('.btn-cancel').addEventListener('click', () => {
        overlay.remove();
        if (onCancel) onCancel();
    });
    box.querySelector('.btn-confirm').addEventListener('click', () => {
        overlay.remove();
        if (onConfirm) onConfirm();
    });
}

// Fonction pour construire une table simple à partir de données
export function construireTable(colonnes, lignes, container) {
    const table = document.createElement('table');
    table.style.width = '100%';
    table.style.borderCollapse = 'collapse';
    const thead = document.createElement('thead');
    const trHead = document.createElement('tr');
    colonnes.forEach(col => {
        const th = document.createElement('th');
        th.textContent = col;
        trHead.appendChild(th);
    });
    thead.appendChild(trHead);
    table.appendChild(thead);

    const tbody = document.createElement('tbody');
    lignes.forEach(ligne => {
        const tr = document.createElement('tr');
        ligne.forEach(cell => {
            const td = document.createElement('td');
            td.textContent = cell;
            tr.appendChild(td);
        });
        tbody.appendChild(tr);
    });
    table.appendChild(tbody);
    container.innerHTML = '';
    container.appendChild(table);
}