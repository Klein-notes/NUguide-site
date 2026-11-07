// src/modules/teamBackup.js
import { exportTeams, importTeams } from '../core/store.js';
import { showToast } from '../core/toast.js';
import { openFavoriteCardsOverflow } from '../components/FavoriteCardsImportDialog.js';

export async function downloadTeamsBackup(stageId = null) {
  const payload = await exportTeams(stageId);
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  const stamp = new Date().toISOString().slice(0, 10);
  a.href = url;
  a.download = stageId ? `my-teams-${stageId}-${stamp}.json` : `my-teams-backup-${stamp}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

/**
 * Opens a native file picker and imports the chosen backup.
 * @param {'merge'|'replace'} mode
 * @returns {Promise<boolean>} whether an import happened
 */
export function promptImportTeamsBackup(mode = 'merge') {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'application/json';
    input.addEventListener('change', async () => {
      const file = input.files[0];
      if (!file) { resolve(false); return; }
      try {
        const text = await file.text();
        const payload = JSON.parse(text);
        await importTeams(payload, mode, { resolveFavoriteCards: openFavoriteCardsOverflow });
        showToast('隊伍資料已匯入');
        window.dispatchEvent(new Event('nuguide:favorites-changed')); // 常用卡片頁籤重畫
        resolve(true);
      } catch (err) {
        showToast(err.message || '匯入失敗，檔案格式可能不正確。', { type: 'error' });
        resolve(false);
      }
    });
    input.click();
  });
}
