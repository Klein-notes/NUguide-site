// src/modules/favoriteCardsTab.js
//
// 常用卡片 (2026-11-08)：「我的隊伍」頁上方多一排「我的隊伍｜常用卡片」頁籤。
// 常用卡片頁：列出玩家挑的卡＋「選取卡片」按鈕；選取視窗照後台「我的最愛」
// （篩選只有稀有度／屬性／角色、高度固定、預留捲軸、選到的卡蓋半透明），
// 按「確定」就存進這個瀏覽器（沒有發布），最多 MAX_FAVORITE_CARDS 張。
// 「編輯整隊」「選擇卡片」視窗會把這些卡排在最上面（CardPicker.js）。
import { loadJSON, DataSources, toMap } from '../core/dataLoader.js';
import { sortCardsByOrder } from './cardSort.js';
import { renderCardGrid } from '../components/CardGrid.js';
import { openModal } from '../components/Modal.js';
import { mountFilterPanel } from '../components/FilterPanel.js';
import { createFilterBar } from '../components/FilterBar.js';
import { filterCards } from './cardFilter.js';
import { getFavoriteCards, setFavoriteCards, MAX_FAVORITE_CARDS } from '../core/store.js';
import { showToast } from '../core/toast.js';

const PICKER_FIELDS = ['rarityId', 'elementId', 'characterId'];
const TEAMS_PARTS = ['overview-filter', 'overview-root'];

/** 選取視窗。確定＝回傳選好的 id（照卡片原本順序）；取消＝null。 */
function openFavoriteCardPicker(cards, cardMaps, initialIds) {
  return new Promise(async (resolve) => {
    const selected = new Set(initialIds);
    const body = document.createElement('div');
    const layout = document.createElement('div');
    layout.className = 'filter-grid-layout';
    const filterHost = document.createElement('div');
    filterHost.className = 'fg-sidebar';
    const gridCol = document.createElement('div');
    const gridHost = document.createElement('div');
    const favHost = document.createElement('div');
    favHost.className = 'fav-section';
    favHost.hidden = true;
    gridCol.append(favHost, gridHost);
    layout.append(filterHost, gridCol);
    const bar = createFilterBar(filterHost);
    bar.el.classList.add('fbar--modal-top');
    body.append(bar.el, layout);

    let settled = false;
    const { close, box } = openModal({
      title: `選取卡片（最多 ${MAX_FAVORITE_CARDS} 張）`,
      body,
      wide: true,
      onClose: () => { if (!settled) resolve(null); },
    });
    box.classList.add('modal-picker', 'fc-picker-box');

    // 右上角：已選 N / 20＋取消／確定（× 拿掉，用取消）
    const head = box.querySelector('.modal-header');
    const closeX = head.querySelector('.modal-close');
    closeX.style.display = 'none';
    const actions = document.createElement('div');
    actions.className = 'fc-picker-actions';
    const countEl = document.createElement('span');
    countEl.className = 'fc-picker-count';
    const cancelBtn = document.createElement('button');
    cancelBtn.type = 'button';
    cancelBtn.className = 'btn btn-sm btn-secondary';
    cancelBtn.textContent = '取消';
    const okBtn = document.createElement('button');
    okBtn.type = 'button';
    okBtn.className = 'btn btn-sm btn-primary';
    okBtn.textContent = '確定';
    actions.append(countEl, cancelBtn, okBtn);
    head.insertBefore(actions, closeX);

    function updateCount() {
      countEl.innerHTML = `已選 <b>${selected.size}</b> / ${MAX_FAVORITE_CARDS}`;
    }
    updateCount();
    cancelBtn.addEventListener('click', () => { settled = true; close(); resolve(null); });
    okBtn.addEventListener('click', () => {
      settled = true;
      close();
      resolve(cards.filter((c) => selected.has(c.id)).map((c) => c.id));
    });

    function markSelected(btn, on) {
      const old = btn.querySelector(':scope > .card-btn-disabled-overlay');
      if (on && !old) {
        const overlay = document.createElement('div');
        overlay.className = 'card-btn-disabled-overlay';
        btn.appendChild(overlay);
      } else if (!on && old) {
        old.remove();
      }
      btn.setAttribute('aria-pressed', on ? 'true' : 'false');
    }
    // 選到的卡馬上移到最上面（照卡片原本順序），下面「其他卡片」分隔線；
    // 再點一次取消就回到原本的位置。一樣跟著篩選條件。
    function toggle(card) {
      if (selected.has(card.id)) selected.delete(card.id);
      else if (selected.size >= MAX_FAVORITE_CARDS) return; // 滿了，點不下去
      else selected.add(card.id);
      updateCount();
      const scroller = box.querySelector('.modal-body');
      const top = scroller.scrollTop;
      renderGrid(lastList);
      scroller.scrollTop = top;
    }
    let lastList = cards;
    const gridOpts = {
      onCardClick: toggle,
      compact: true,
      emptyTitle: '沒有符合條件的卡片',
      emptyBody: '試著取消一些篩選條件，範圍會重新放寬。',
    };
    function renderGrid(list) {
      lastList = list;
      const picked = list.filter((c) => selected.has(c.id));
      const rest = list.filter((c) => !selected.has(c.id));
      favHost.innerHTML = '';
      favHost.hidden = picked.length === 0;
      if (picked.length) {
        const pickedGrid = document.createElement('div');
        renderCardGrid(pickedGrid, picked, cardMaps, gridOpts);
        favHost.appendChild(pickedGrid);
        if (rest.length) {
          const divider = document.createElement('div');
          divider.className = 'fav-section-divider';
          divider.textContent = '其他卡片';
          favHost.appendChild(divider);
        }
      }
      if (picked.length && !rest.length) gridHost.innerHTML = '';
      else renderCardGrid(gridHost, rest, cardMaps, gridOpts);
      gridCol.querySelectorAll('.card-btn[data-card-id]').forEach((btn) => {
        markSelected(btn, selected.has(btn.dataset.cardId));
      });
    }
    const panel = await mountFilterPanel(filterHost, (state) => {
      renderGrid(filterCards(cards, state, panel.schema, panel.cdRanges));
      bar.update(panel);
    }, { fields: PICKER_FIELDS });
    renderGrid(cards);
    bar.update(panel);
  });
}

async function renderFavoriteTab(root, data) {
  const { cards, cardMaps } = data;
  const known = new Set(cards.map((c) => c.id));
  const ids = (await getFavoriteCards()).filter((id) => known.has(id));

  root.innerHTML = '';
  const toolbar = document.createElement('div');
  toolbar.className = 'fc-toolbar';
  const hint = document.createElement('p');
  hint.className = 'fc-hint';
  hint.textContent = `已選 ${ids.length} / ${MAX_FAVORITE_CARDS} 張`;
  // 按鈕在左上，張數緊接在按鈕右邊（電腦、手機一樣）
  const pickBtn = document.createElement('button');
  pickBtn.type = 'button';
  pickBtn.className = 'btn btn-secondary btn-sm';
  pickBtn.textContent = '選取卡片';
  toolbar.append(pickBtn, hint);
  root.appendChild(toolbar);

  const listHost = document.createElement('div');
  listHost.className = 'fc-list'; // 電腦一排 5 張
  root.appendChild(listHost);
  const set = new Set(ids);
  const list = cards.filter((c) => set.has(c.id));
  if (!list.length) {
    const empty = document.createElement('div');
    empty.className = 'fc-empty';
    empty.textContent = '目前沒有常用卡片';
    listHost.appendChild(empty);
  } else {
    renderCardGrid(listHost, list, cardMaps, { compact: true });
  }

  pickBtn.addEventListener('click', async () => {
    const result = await openFavoriteCardPicker(cards, cardMaps, ids);
    if (!result) return;
    try {
      await setFavoriteCards(result);
      showToast('常用卡片已儲存');
    } catch (err) {
      showToast(err.message || '儲存失敗', { type: 'error' });
    }
    renderFavoriteTab(root, data);
  });
}

/** 「我的隊伍｜常用卡片」頁籤。網址加 #favorites 會直接打開常用卡片。 */
export async function mountFavoriteCardsTab() {
  const tabsHost = document.getElementById('mt-view-tabs');
  const favRoot = document.getElementById('fav-cards-root');
  if (!tabsHost || !favRoot) return;

  let data = null;
  async function loadData() {
    if (data) return data;
    const [cardsRaw, rarities, classes, elements] = await Promise.all([
      loadJSON(DataSources.cards),
      loadJSON(DataSources.rarities),
      loadJSON(DataSources.classes),
      loadJSON(DataSources.elements),
    ]);
    data = {
      cards: sortCardsByOrder(cardsRaw),
      cardMaps: { rarityMap: toMap(rarities), classMap: toMap(classes), elementMap: toMap(elements) },
    };
    return data;
  }

  const bar = document.createElement('div');
  // 連在一起的選單列，選到的那格換底色 (2026-11-08)
  bar.className = 'mt-view-tabs';
  bar.setAttribute('role', 'tablist');
  const views = [['teams', '我的隊伍'], ['favorites', '常用卡片']];
  const btns = {};
  for (const [key, label] of views) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'mt-view-tab';
    btn.setAttribute('role', 'tab');
    btn.textContent = label;
    btn.addEventListener('click', () => show(key));
    btns[key] = btn;
    bar.appendChild(btn);
  }
  tabsHost.appendChild(bar);

  async function show(key) {
    for (const [k] of views) {
      btns[k].classList.toggle('active', k === key);
      btns[k].setAttribute('aria-selected', String(k === key));
    }
    const fav = key === 'favorites';
    for (const id of TEAMS_PARTS) {
      const el = document.getElementById(id);
      if (el) el.hidden = fav;
    }
    favRoot.hidden = !fav;
    history.replaceState(null, '', fav ? '#favorites' : location.pathname + location.search);
    if (fav) renderFavoriteTab(favRoot, await loadData());
  }
  window.addEventListener('nuguide:favorites-changed', async () => {
    if (!favRoot.hidden) renderFavoriteTab(favRoot, await loadData());
  });
  show(location.hash === '#favorites' ? 'favorites' : 'teams');
}
