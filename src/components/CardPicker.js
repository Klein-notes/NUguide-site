// src/components/CardPicker.js
import { openModal } from './Modal.js';
import { mountFilterPanel } from './FilterPanel.js';
import { renderCardGrid } from './CardGrid.js';
import { renderCardButton } from './CardButton.js';
import { showCardInfoModal } from './CardInfoModal.js';
import { loadJSON, DataSources, toMap } from '../core/dataLoader.js';
import { filterCards } from '../modules/cardFilter.js';
import { sortCardsByOrder } from '../modules/cardSort.js';

// 同章鎖卡 (2026-09-27)：忘卻遺跡同一章其他關卡的第 1 組隊伍用過的卡。
//   lockedCards：Map，cardId → 關卡編號（例如「7-1」）——這些卡不放進卡池。
//   usedGroups：同章其他每一關的第 1 組，[{ label, members:[5 格], origMembers? }]
//     ——在「已使用」區照站位整隊顯示（沒放卡的位置畫空格），隨時看得到用過
//     哪些卡。有 origMembers（原本存的 5 格）時，跟原本不一樣的卡會在右下角標紅點。
// 後台選版主/推薦隊伍時兩個都不傳，畫面跟以前一樣。
// ui（只有「選擇隊伍」可編輯時才傳）：{ armed:{g,i}|null, target:{g,i}|null,
//   onCard(g,i), onEmpty(g,i) }——g 是 usedGroups 的索引。
function renderUsedStrip(usedGroups, cardMap, cardMaps, ui = null) {
  if (!usedGroups || !usedGroups.length) return null;
  const strip = document.createElement('div');
  strip.className = 'used-strip' + (ui ? ' is-editable' : '');
  usedGroups.forEach((g, gi) => {
    const group = document.createElement('div');
    group.className = 'used-strip-group';
    const name = document.createElement('span');
    name.className = 'used-strip-label';
    name.textContent = g.label;
    group.appendChild(name);
    g.members.forEach((cardId, i) => {
      const card = cardId ? cardMap.get(cardId) : null;
      const cell = document.createElement('div');
      cell.className = card ? 'used-strip-card' : 'used-strip-empty';
      if (card) {
        cell.title = card.name;
        const changed = g.origMembers && cardId !== g.origMembers[i];
        const btnOpts = { thumbnail: true };
        if (ui) btnOpts.onClick = () => ui.onCard(gi, i);
        cell.appendChild(renderCardButton(card, cardMaps, btnOpts));
        if (changed) {
          cell.classList.add('is-changed');
          const dot = document.createElement('span');
          dot.className = 'used-strip-dot';
          cell.appendChild(dot);
        }
        if (ui && ui.armed && ui.armed.g === gi && ui.armed.i === i) {
          cell.classList.add('is-armed');
          const hint = document.createElement('span');
          hint.className = 'used-strip-armed-hint';
          hint.textContent = '點擊退回';
          cell.appendChild(hint);
        }
      } else if (ui) {
        cell.classList.add('is-clickable');
        if (ui.target && ui.target.g === gi && ui.target.i === i) cell.classList.add('is-target');
        cell.addEventListener('click', () => ui.onEmpty(gi, i));
      }
      if (ui) cell.dataset.slot = `${gi}:${i}`;
      group.appendChild(cell);
    });
    strip.appendChild(group);
  });
  return strip;
}
const withoutLocked = (list, lockedCards) => (lockedCards && lockedCards.size ? list.filter((c) => !lockedCards.has(c.id)) : list);

/**
 * Opens the card picker modal and resolves with the chosen card, or null
 * if the player closes it without picking one.
 * @param {Object} [opts]
 * @param {string[]} [opts.excludeIds] - card ids to show dimmed and
 *   unclickable — e.g. the OTHER cards already in the team being built,
 *   so the same card can't be picked twice into one team. Omit (or leave
 *   the slot currently being edited out of the list) to allow it.
 * @param {Map<string,string>} [opts.lockedCards] - 同章鎖卡，見 renderUsedStrip
 * @param {Array} [opts.usedGroups] - 同章鎖卡，見 renderUsedStrip
 * @returns {Promise<Object|null>}
 */
export function openCardPicker(opts = {}) {
  const excludeIds = new Set(opts.excludeIds || []);
  const lockedCards = opts.lockedCards || null;
  const usedGroups = opts.usedGroups || null;
  return new Promise(async (resolve) => {
    const [cardsRaw, rarities, classes, elements, characters, tags] = await Promise.all([
      loadJSON(DataSources.cards),
      loadJSON(DataSources.rarities),
      loadJSON(DataSources.classes),
      loadJSON(DataSources.elements),
      loadJSON(DataSources.characters),
      loadJSON(DataSources.tags),
    ]);
    const cards = sortCardsByOrder(cardsRaw);
    const rarityMap = toMap(rarities);
    const classMap = toMap(classes);
    const elementMap = toMap(elements);
    const cardMaps = { rarityMap, classMap, elementMap };
    // For the hover info button's 卡片資訊 modal — same shape CardInfoModal
    // expects everywhere else it's used.
    const infoMaps = { rarityMap, classMap, elementMap, characterMap: toMap(characters), tagMap: toMap(tags) };

    const body = document.createElement('div');
    const layout = document.createElement('div');
    layout.className = 'filter-grid-layout';
    const filterHost = document.createElement('div');
    filterHost.className = 'fg-sidebar';
    const gridCol = document.createElement('div');
    const gridHost = document.createElement('div');
    const usedStrip = renderUsedStrip(usedGroups, toMap(cards), cardMaps);
    if (usedStrip) gridCol.appendChild(usedStrip);
    gridCol.appendChild(gridHost);
    layout.append(filterHost, gridCol);
    body.appendChild(layout);

    let settled = false;
    const { close } = openModal({
      title: '選擇卡片',
      body,
      wide: true,
      onClose: () => { if (!settled) resolve(null); },
    });

    function pickCard(card) {
      settled = true;
      close();
      resolve(card);
    }

    const gridOpts = {
      onCardClick: pickCard,
      onInfoClick: (card) => showCardInfoModal(card, infoMaps),
      isDisabled: (card) => excludeIds.has(card.id),
      compact: true,
      emptyTitle: '沒有符合條件的卡片',
      emptyBody: '試著取消一些篩選條件，範圍會重新放寬。',
    };

    const panel = await mountFilterPanel(filterHost, (state) => {
      const filtered = filterCards(cards, state, panel.schema, panel.cdRanges);
      renderCardGrid(gridHost, withoutLocked(filtered, lockedCards), cardMaps, gridOpts);
    });

    renderCardGrid(gridHost, withoutLocked(cards, lockedCards), cardMaps, gridOpts);
  });
}

/**
 * Opens a "build the whole team in one sitting" picker (2026-09-09) —
 * unlike openCardPicker (resolves once, on the FIRST click, then closes),
 * this stays open across multiple picks: click a card in the grid and it
 * fills the next empty slot, live, no separate "confirm" step — same
 * feel as the game's own team-select screen. A row of 5 slots at the top
 * shows the live state (empty slots show just their number; filled ones
 * show the card's thumbnail); each filled slot also gets a small "移到
 * 第__位" dropdown that re-INSERTS the card at the chosen position
 * (shifting the cards in between, not a plain two-way swap) rather than
 * requiring drag-and-drop, which doesn't behave well on touch without a
 * lot of extra plumbing this didn't seem to need. Resolves with the
 * final 5-slot array (some entries possibly null) whenever the modal is
 * closed — there's no separate "確定" button, closing the modal (✕ or
 * clicking outside) IS confirming, matching every other close-to-commit
 * flow already used elsewhere on this site (2026-09-09, shared by 我的
 * 隊伍/推薦隊伍/版主的隊伍 — one component, so all three stay in sync
 * automatically instead of three separate copies that could drift).
 * @param {(string|null)[]} [initialMembers] - up to 5 card ids, already
 *   in the team (or already-empty slots) when the picker opens.
 * @returns {Promise<(string|null)[]>} always 5 entries, unfilled slots are null.
 */
export function openTeamPicker(initialMembers = [], opts = {}) {
  const usedGroups = opts.usedGroups || null; // 同章鎖卡，見 renderUsedStrip
  // 可編輯模式 (2026-09-27, 前台 TeamEditor 才開)：
  //   - 空格（上排或「已使用」區）點一下發光＝指定下一張放這格，再點取消；
  //     發光時點卡池的卡就放進那一格，放完發光結束。沒發光就照舊放上排
  //     第一個空格。
  //   - 「已使用」區的卡防誤觸：第 1 下只標記「準備退回」，同一張再點
  //     一下才退回卡池；點其他任何地方就取消標記。上排維持點一下就退回。
  //   - 改的是 usedGroups[].members 本身（呼叫端傳進來的草稿），鎖卡清單
  //     跟著即時重算——從別關退回的卡馬上可以選。
  // 後台不傳 editableGroups，行為跟以前完全一樣。
  const editable = !!(opts.editableGroups && usedGroups);
  const fixedLocked = opts.lockedCards || null;
  function currentLocked() {
    if (!editable) return fixedLocked;
    const m = new Map();
    for (const g of usedGroups) for (const id of g.members) if (id && !m.has(id)) m.set(id, g.label);
    return m;
  }
  return new Promise(async (resolve) => {
    const [cardsRaw, rarities, classes, elements, characters, tags] = await Promise.all([
      loadJSON(DataSources.cards),
      loadJSON(DataSources.rarities),
      loadJSON(DataSources.classes),
      loadJSON(DataSources.elements),
      loadJSON(DataSources.characters),
      loadJSON(DataSources.tags),
    ]);
    const cards = sortCardsByOrder(cardsRaw);
    const cardMap = toMap(cards);
    const rarityMap = toMap(rarities);
    const classMap = toMap(classes);
    const elementMap = toMap(elements);
    const cardMaps = { rarityMap, classMap, elementMap };
    const infoMaps = { rarityMap, classMap, elementMap, characterMap: toMap(characters), tagMap: toMap(tags) };

    let members = [0, 1, 2, 3, 4].map((i) => initialMembers[i] || null);

    const body = document.createElement('div');
    const slotRow = document.createElement('div');
    slotRow.className = 'tp-slot-row';
    body.appendChild(slotRow);
    // 「同章已使用」放在上面固定的那一條裡、5 個格子下方，捲動卡池時一直看得到
    // 可編輯時每次重畫；g = -1 代表上排目前這一組
    let armed = null;
    let target = null;
    const sameSlot = (a, g, i) => a && a.g === g && a.i === i;
    const ui = editable ? {
      get armed() { return armed; },
      get target() { return target; },
      onCard(g, i) {
        if (sameSlot(armed, g, i)) {
          usedGroups[g].members[i] = null;
          armed = null;
          refreshAll();
        } else {
          armed = { g, i };
          renderSlots();
        }
      },
      onEmpty(g, i) {
        armed = null;
        target = sameSlot(target, g, i) ? null : { g, i };
        renderSlots();
      },
    } : null;

    const layout = document.createElement('div');
    layout.className = 'filter-grid-layout';
    const filterHost = document.createElement('div');
    filterHost.className = 'fg-sidebar';
    const gridCol = document.createElement('div');
    const gridHost = document.createElement('div');
    gridCol.appendChild(gridHost);
    layout.append(filterHost, gridCol);
    body.appendChild(layout);

    const { close } = openModal({
      title: '選擇隊伍（點卡片依序加入，關閉視窗即完成）',
      body,
      wide: true,
      onClose: () => resolve(members),
    });

    // 「準備退回」的標記：點到標記那張以外的任何地方就取消。用 capture
    // 在各個按鈕自己的處理之前先清掉，同一張的第 2 下則保留給它處理。
    if (editable) {
      body.addEventListener('click', (e) => {
        if (!armed) return;
        const cell = e.target.closest('[data-slot]');
        if (cell && cell.dataset.slot === `${armed.g}:${armed.i}`) return;
        armed = null;
        renderSlots();
      }, true);
    }

    function renderSlots() {
      // 發光的格子如果已經被別的方式放了卡（例如用「第 N 位」選單重排），
      // 就不再指定它，避免下一張卡蓋掉原本的卡
      if (target && (target.g === -1 ? members[target.i] : usedGroups[target.g].members[target.i])) target = null;
      slotRow.innerHTML = '';
      members.forEach((cardId, idx) => {
        const slot = document.createElement('div');
        slot.className = 'tp-slot';
        const card = cardId ? cardMap.get(cardId) : null;
        if (card) {
          // 跟卡片資料庫/選卡格子同一顆元件，才會有一樣的裁切定位
          // (imageZoom/imageOffsetX/imageOffsetY)、稀有度邊框、屬性/
          // 定位徽章、SSR 字樣——不要自己另外刻一份簡化版
          // (2026-09-09 修正：原本這裡是純 <img>，跟卡片本體長得不一樣)。
          // 點卡片本身 = 直接把這張移除，空出這一格（不用另外找刪除按鈕）。
          const cardBtn = renderCardButton(card, cardMaps, {
            thumbnail: true,
            onClick: () => { members[idx] = null; refreshAll(); },
          });
          cardBtn.title = '點一下移除這張卡';
          slot.appendChild(cardBtn);

          const select = document.createElement('select');
          select.className = 'tp-slot-select';
          for (let i = 0; i < 5; i++) {
            const opt = document.createElement('option');
            opt.value = i;
            opt.textContent = `第 ${i + 1} 位`;
            if (i === idx) opt.selected = true;
            select.appendChild(opt);
          }
          select.addEventListener('click', (e) => e.stopPropagation());
          select.addEventListener('change', () => {
            const to = Number(select.value);
            if (to === idx) return;
            // 插入式重排：把這張抽出來，其他卡往中間補，再插進目標位置
            // （不是單純跟目標位置兩兩互換）——2026-09-09 確認過的邏輯。
            const moved = members[idx];
            members.splice(idx, 1);
            members.splice(to, 0, moved);
            renderSlots();
          });
          slot.appendChild(select);
        } else {
          const empty = document.createElement('div');
          empty.className = 'tp-slot-empty';
          if (editable) {
            empty.classList.add('is-clickable');
            if (sameSlot(target, -1, idx)) empty.classList.add('is-target');
            empty.addEventListener('click', () => ui.onEmpty(-1, idx));
          }
          const num = document.createElement('span');
          num.className = 'tp-slot-num';
          num.textContent = idx + 1;
          empty.appendChild(num);
          slot.appendChild(empty);
        }
        slotRow.appendChild(slot);
      });
      const usedStrip = renderUsedStrip(usedGroups, cardMap, cardMaps, ui);
      if (usedStrip) slotRow.appendChild(usedStrip);
    }

    function refreshAll() { renderSlots(); renderGrid(); }

    function pickCard(card) {
      if (target) {
        // 發光的格子：放進那一格，發光結束
        if (target.g === -1) members[target.i] = card.id;
        else usedGroups[target.g].members[target.i] = card.id;
        target = null;
        refreshAll();
        return;
      }
      const emptyIdx = members.findIndex((m) => !m);
      if (emptyIdx === -1) return; // 五格都滿了，點下去不會有反應
      members[emptyIdx] = card.id;
      refreshAll();
    }

    let lastFiltered = cards;
    function renderGrid() {
      renderCardGrid(gridHost, withoutLocked(lastFiltered, currentLocked()), cardMaps, {
        onCardClick: pickCard,
        onInfoClick: (card) => showCardInfoModal(card, infoMaps),
        isDisabled: (card) => members.includes(card.id),
        compact: true,
        emptyTitle: '沒有符合條件的卡片',
        emptyBody: '試著取消一些篩選條件，範圍會重新放寬。',
      });
    }

    const panel = await mountFilterPanel(filterHost, (state) => {
      lastFiltered = filterCards(cards, state, panel.schema, panel.cdRanges);
      renderGrid();
    });

    renderSlots();
    renderGrid();
  });
}
