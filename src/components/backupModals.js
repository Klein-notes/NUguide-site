// src/components/backupModals.js
// Custom-styled confirm dialogs for the 匯出/匯入備份 buttons on
// myTeamsOverview.js — built with openModal() instead of the browser's
// plain window.confirm/confirmDialog, since these need either multi-line
// styled explanatory text (匯入) or just to look consistent with every
// other modal on the page (匯出).
import { openModal } from './Modal.js';

/**
 * "確定匯出？" confirmation before downloadTeamsBackup() runs.
 * @returns {Promise<boolean>}
 */
export function confirmExportDialog() {
  return new Promise((resolve) => {
    const body = document.createElement('div');

    const msg = document.createElement('p');
    msg.textContent = '確定匯出？';
    body.appendChild(msg);
    // 常用卡片也在備份裡 (2026-11-08)
    const note = document.createElement('p');
    note.className = 'backup-modal-note';
    note.textContent = '備份檔會包含所有隊伍和常用卡片。';
    body.appendChild(note);

    const footer = document.createElement('div');
    footer.className = 'modal-footer';
    const cancelBtn = document.createElement('button');
    cancelBtn.type = 'button';
    cancelBtn.className = 'btn';
    cancelBtn.textContent = '取消';
    const confirmBtn = document.createElement('button');
    confirmBtn.type = 'button';
    confirmBtn.className = 'btn btn-primary';
    confirmBtn.textContent = '確定';
    footer.append(cancelBtn, confirmBtn);
    body.appendChild(footer);

    let settled = false;
    const { close, box } = openModal({
      title: '匯出隊伍紀錄',
      body,
      onClose: () => { if (!settled) resolve(false); },
    });
    box.classList.add('modal-backup'); // 窄視窗，電腦跟手機一樣寬
    cancelBtn.addEventListener('click', () => { settled = true; close(); resolve(false); });
    confirmBtn.addEventListener('click', () => { settled = true; close(); resolve(true); });
  });
}

/**
 * Replaces the old confirm()-based "確定=合併／取消=覆蓋" prompt (that
 * mapping wasn't readable from the button labels at all). Explains 加入
 * 檔案 vs 覆蓋檔案 as separate, clearly-labeled buttons instead.
 * @returns {Promise<'merge'|'replace'|null>} null if cancelled
 */
export function confirmImportModeDialog() {
  return new Promise((resolve) => {
    const body = document.createElement('div');

    const mergeTitle = document.createElement('h3');
    mergeTitle.className = 'backup-modal-title';
    mergeTitle.textContent = '【加入檔案】';
    body.appendChild(mergeTitle);

    const mergeDesc = document.createElement('p');
    mergeDesc.textContent = '適合「這台瀏覽器」跟「備份檔案」記錄的關卡不一樣的時候。';
    body.appendChild(mergeDesc);

    const mergeNote = document.createElement('p');
    mergeNote.className = 'backup-modal-note';
    mergeNote.textContent = '（例如A瀏覽器記錄了 45、50兩關，B 瀏覽器記錄了8-1、8-2兩關\n——這時在A 瀏覽器加入B 瀏覽器匯出的檔案，\nA瀏覽器最後會同時保留兩邊的紀錄，變成A＋B完整清單。）';
    body.appendChild(mergeNote);

    const replaceTitle = document.createElement('h3');
    replaceTitle.className = 'backup-modal-title';
    replaceTitle.textContent = '【覆蓋檔案】';
    body.appendChild(replaceTitle);

    const replaceDesc = document.createElement('p');
    replaceDesc.textContent = '不管這台瀏覽器原本記錄過什麼，一律清空，只留下匯入檔案的內容。';
    body.appendChild(replaceDesc);

    const replaceNote = document.createElement('p');
    replaceNote.className = 'backup-modal-note';
    replaceNote.textContent = '（如果A、B兩邊瀏覽器記錄的關卡不一樣時，在A瀏覽器中，匯入B瀏覽器的檔案，則A的紀錄會被清空，只剩下Ｂ瀏覽器的紀錄。）';
    body.appendChild(replaceNote);

    // 常用卡片不管選哪一種都只合併 (2026-11-08)
    const favTitle = document.createElement('h3');
    favTitle.className = 'backup-modal-title';
    favTitle.textContent = '【常用卡片】';
    body.appendChild(favTitle);
    const favDesc = document.createElement('p');
    favDesc.textContent = '不管選哪一種，都只會補上這個瀏覽器還沒有的卡，不會刪掉原本的；合併後超過 20 張時，會讓你選要刪掉哪幾張。';
    body.appendChild(favDesc);

    const footer = document.createElement('div');
    footer.className = 'modal-footer';
    const cancelBtn = document.createElement('button');
    cancelBtn.type = 'button';
    cancelBtn.className = 'btn';
    cancelBtn.textContent = '取消';
    const replaceBtn = document.createElement('button');
    replaceBtn.type = 'button';
    replaceBtn.className = 'btn btn-secondary';
    replaceBtn.textContent = '覆蓋檔案';
    const mergeBtn = document.createElement('button');
    mergeBtn.type = 'button';
    mergeBtn.className = 'btn btn-primary';
    mergeBtn.textContent = '加入檔案';
    footer.append(cancelBtn, replaceBtn, mergeBtn);
    body.appendChild(footer);

    let settled = false;
    const { close, box } = openModal({
      title: '匯入備份',
      body,
      onClose: () => { if (!settled) resolve(null); },
    });
    box.classList.add('modal-backup'); // 窄視窗，電腦跟手機一樣寬
    cancelBtn.addEventListener('click', () => { settled = true; close(); resolve(null); });
    replaceBtn.addEventListener('click', () => { settled = true; close(); resolve('replace'); });
    mergeBtn.addEventListener('click', () => { settled = true; close(); resolve('merge'); });
  });
}
