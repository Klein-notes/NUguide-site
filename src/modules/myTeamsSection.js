// src/modules/myTeamsSection.js
import { getTeams, deleteTeam, MAX_TEAMS_PER_STAGE } from '../core/store.js';
// 編輯隊伍的程式（編輯視窗、選卡、篩選…一整串）改成用到時才載入
// (2026-09-27)：原本頁面一打開就要先把這一串全部下載完，攻略內容的
// 資料才開始下載，手機上明顯變慢。頁面顯示完、瀏覽器閒下來時先在
// 背景預先載入，第一次按「新增／修改」時通常已經載好了。
const loadTeamEditor = () => import('../components/TeamEditor.js');
const openTeamEditor = (...args) => loadTeamEditor().then((m) => m.openTeamEditor(...args));
(window.requestIdleCallback || ((fn) => setTimeout(fn, 1500)))(() => { loadTeamEditor().catch(() => {}); });
import { renderTeamCard } from '../components/TeamCard.js';
import { confirmDialog } from '../components/Modal.js';
import { showToast } from '../core/toast.js';

/**
 * @param {HTMLElement} container
 * @param {string} stageId
 * @param {Map} cardMap
 * @param {{rarityMap?:Map, elementMap?:Map, classMap?:Map}} [maps] - passed
 *   through to TeamCard/TeamEditor so the card face shows the same
 *   屬性/定位/稀有度 badges as everywhere else on the site.
 */
export async function renderMyTeamsSection(container, stageId, cardMap, maps) {
  async function refresh() {
    const teams = await getTeams(stageId);
    container.innerHTML = '';

    // The "+ 新增隊伍" button lives outside this module (in stage-detail.html
    // / stageDetail.js), so it's looked up by its known id here rather than
    // threading a reference through — same pattern as elsewhere on this page.
    const addBtn = document.getElementById('add-team-btn');
    if (addBtn) {
      const atCap = teams.length >= MAX_TEAMS_PER_STAGE;
      addBtn.disabled = atCap;
      addBtn.title = atCap ? `每個關卡最多只能建立 ${MAX_TEAMS_PER_STAGE} 組隊伍` : '';
    }

    if (teams.length === 0) {
      // Just leave it blank — per explicit request, no dashed
      // placeholder box/text when there's nothing recorded yet
      // (2026-09-06). The "+ 新增隊伍" button above is already the
      // call to action; an empty-state box under it was redundant.
    } else {
      for (const team of teams) {
        container.appendChild(renderTeamCard(team, cardMap, {
          maps,
          actions: [
            { label: '修改', className: 'btn btn-sm', onClick: () => handleEdit(team) },
            { label: '刪除', className: 'btn btn-sm btn-danger', onClick: () => handleDelete(team) },
          ],
        }));
      }
    }
  }

  async function handleAdd() {
    const teams = await getTeams(stageId);
    if (teams.length >= MAX_TEAMS_PER_STAGE) {
      showToast(`每個關卡最多只能建立 ${MAX_TEAMS_PER_STAGE} 組隊伍`, { type: 'error' });
      return;
    }
    await openTeamEditor(stageId, null);
    refresh();
  }

  async function handleEdit(team) {
    await openTeamEditor(stageId, team);
    refresh();
  }

  async function handleDelete(team) {
    if (!confirmDialog(`確定要刪除「${team.name}」嗎？此動作無法復原。`)) return;
    await deleteTeam(stageId, team.localId);
    showToast('已刪除隊伍');
    refresh();
  }

  await refresh();
  return { refresh, handleAdd };
}
