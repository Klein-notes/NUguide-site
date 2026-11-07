// src/components/FavoriteCardsImportDialog.js
//
// 常用卡片匯入超過上限 (2026-11-08)：匯入備份後，本瀏覽器的常用卡片和檔案裡的
// 合併起來超過上限（玩家 20 張），跳這個視窗讓玩家刪到上限以內。
//   - 卡片跟卡片資料庫一樣直接排在一起；同一種的放一起，同一種裡照卡片編號排
//       兩邊都有 → 不加底色
//       只有本瀏覽器有 → 蓋一層水藍色
//       只有檔案有   → 蓋一層橘黃色
//   - 只能「刪掉」：點卡片＝標成要刪（變暗＋右上角紅色刪除標記），再點一次取消
//   - 「確定變更」：刪到上限以內才能按；「不匯入最愛」：常用卡片維持本瀏覽器原本的
//   - 不放打勾、選項或卡片旁的按鈕，所有變化都在卡片上
import { openModal } from './Modal.js';
import { renderCardButton } from './CardButton.js';
import { loadJSON, DataSources } from '../core/dataLoader.js';

const KIND_ORDER = { both: 0, local: 1, file: 2 };

/**
 * @param {{ localIds: string[], fileIds: string[], max: number }} opts
 * @returns {Promise<string[]|null>} 留下的卡片 id（照原本的順序：本瀏覽器的在前、
 *   檔案新加的在後）；按「不匯入最愛」＝ null
 */
export function openFavoriteCardsOverflow({ localIds, fileIds, max }) {
  return new Promise(async (resolve) => {
    const [cards, rarities, elements, classes] = await Promise.all([
      loadJSON(DataSources.cards),
      loadJSON(DataSources.rarities),
      loadJSON(DataSources.elements),
      loadJSON(DataSources.classes),
    ]);
    const cardMap = new Map(cards.map((c) => [c.id, c]));
    const maps = {
      rarityMap: new Map(rarities.map((r) => [r.id, r])),
      elementMap: new Map(elements.map((e) => [e.id, e])),
      classMap: new Map(classes.map((c) => [c.id, c])),
    };
    const localSet = new Set(localIds);
    const fileSet = new Set(fileIds);
    const merged = [...localIds, ...fileIds.filter((id) => !localSet.has(id))].filter((id) => cardMap.has(id));
    const kindOf = (id) => (localSet.has(id) && fileSet.has(id) ? 'both' : localSet.has(id) ? 'local' : 'file');
    const sorted = merged.slice().sort((a, b) =>
      (KIND_ORDER[kindOf(a)] - KIND_ORDER[kindOf(b)]) || a.localeCompare(b, 'en', { numeric: true }));
    const removed = new Set();

    const body = document.createElement('div');
    body.className = 'fci-body';

    const head = document.createElement('div');
    head.className = 'fci-head';
    const status = document.createElement('p');
    status.className = 'fci-status';
    const legend = document.createElement('p');
    legend.className = 'fci-legend';
    legend.innerHTML = '<span class="fci-legend-local">本瀏覽器存取的卡片</span><span class="fci-legend-file">新匯入 json 檔案的卡片</span>';
    head.append(status, legend);

    const scroller = document.createElement('div');
    scroller.className = 'fci-scroll';
    const grid = document.createElement('div');
    grid.className = 'fci-grid';
    scroller.appendChild(grid);

    for (const id of sorted) {
      const kind = kindOf(id);
      const btn = renderCardButton(cardMap.get(id), maps, { thumbnail: true });
      btn.classList.add('fci-card', `is-${kind}`);
      const tint = document.createElement('span');
      tint.className = 'fci-tint';
      const mark = document.createElement('span');
      mark.className = 'fci-del-mark';
      mark.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="11"/><path d="M8 8l8 8M16 8l-8 8"/></svg>';
      btn.append(tint, mark);
      btn.addEventListener('click', () => {
        if (removed.has(id)) removed.delete(id);
        else removed.add(id);
        btn.classList.toggle('is-removed', removed.has(id));
        btn.setAttribute('aria-pressed', String(removed.has(id)));
        update();
      });
      grid.appendChild(btn);
    }

    const footer = document.createElement('div');
    footer.className = 'modal-footer fci-footer';
    const skipBtn = document.createElement('button');
    skipBtn.type = 'button';
    skipBtn.className = 'btn';
    skipBtn.textContent = '不匯入最愛';
    const okBtn = document.createElement('button');
    okBtn.type = 'button';
    okBtn.className = 'btn btn-primary';
    okBtn.textContent = '確定變更';
    footer.append(skipBtn, okBtn);

    body.append(head, scroller, footer);

    // 電腦版張數放在標題列最右邊；手機版放在標題下面（CSS 切換顯示哪一個）
    const headStatus = document.createElement('span');
    headStatus.className = 'fci-status fci-status--header';
    status.classList.add('fci-status--body');
    function update() {
      const count = merged.length - removed.size;
      const over = count - max;
      for (const el of [status, headStatus]) {
        el.textContent = over > 0 ? `目前 ${count} 張，還要刪掉 ${over} 張` : `目前 ${count} 張`;
        el.classList.toggle('is-over', over > 0);
      }
      okBtn.disabled = over > 0;
    }
    update();

    const { close, box } = openModal({
      title: `常用卡片超過 ${max} 張`,
      body,
      canClose: () => false, // 只能用下面兩顆按鈕決定
    });
    box.classList.add('modal-fci');
    box.querySelector('.modal-header h2').after(headStatus);
    skipBtn.addEventListener('click', () => { close(); resolve(null); });
    okBtn.addEventListener('click', () => { close(); resolve(merged.filter((id) => !removed.has(id))); });
  });
}
