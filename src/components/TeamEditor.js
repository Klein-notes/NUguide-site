// src/components/TeamEditor.js
import { openModal, confirmDialog } from './Modal.js';
import { openCardPicker, openTeamPicker } from './CardPicker.js';
import { renderCardButton } from './CardButton.js';
import { loadJSON, DataSources } from '../core/dataLoader.js';
import { saveTeam, getAllTeamsGrouped, TEAM_MEMBER_SLOTS } from '../core/store.js';
import { computeChapterLock } from '../modules/chapterLock.js';
import { showToast } from '../core/toast.js';
import { sanitizeNoteHtml } from '../core/sanitizeNote.js';

// Same three accent colors used site-wide (Quill's swatches in the admin
// editors, badges, etc.) — kept to this fixed set rather than a full
// color picker so it stays a small native contenteditable + a couple of
// buttons, no external library needed on the public site for this.
const NOTE_COLOR_SWATCHES = ['#c9a45c', '#4fc8b0', '#e2604f'];

/**
 * Opens the team editor modal for a stage. Resolves with the saved team,
 * or null if the user cancelled.
 * @param {string} stageId
 * @param {Object|null} existingTeam - pass null to create a new team
 */
export function openTeamEditor(stageId, existingTeam = null) {
  return new Promise(async (resolve) => {
    const [cards, rarities, elements, classes, stages, grouped] = await Promise.all([
      loadJSON(DataSources.cards),
      loadJSON(DataSources.rarities),
      loadJSON(DataSources.elements),
      loadJSON(DataSources.classes),
      loadJSON(DataSources.stages),
      getAllTeamsGrouped(),
    ]);
    // 同章鎖卡 (2026-09-27, 見 chapterLock.js)：同一章其他關卡第 1 組用過
    // 的卡。選卡時不放進卡池、另外縮小顯示；這一隊裡如果已經有這種卡
    // （功能上線前記的），那一格標上關卡編號提醒，不自動拿掉。
    const { lockedCards, groups: usedGroups } = computeChapterLock(stageId, stages, grouped);
    const cardMap = new Map(cards.map((c) => [c.id, c]));
    // Same maps CardButton/CardGrid use everywhere else, so a slot here
    // (屬性/定位/稀有度 badges, same proportions) looks identical to the
    // card as it appears in 卡片資料庫 or the card picker grid below it.
    const cardMaps = {
      rarityMap: new Map(rarities.map((r) => [r.id, r])),
      elementMap: new Map(elements.map((e) => [e.id, e])),
      classMap: new Map(classes.map((c) => [c.id, c])),
    };

    let members = existingTeam
      ? [...existingTeam.members]
      : Array(TEAM_MEMBER_SLOTS).fill(null);
    while (members.length < TEAM_MEMBER_SLOTS) members.push(null);

    // Snapshot right here — after padding, before any UI-driven edits —
    // so isDirty() below compares apples to apples (same array length,
    // same starting values) regardless of whether this is a new or
    // existing team.
    const initialName = existingTeam ? existingTeam.name : '';
    const initialNote = existingTeam ? existingTeam.note || '' : '';
    const initialMembers = [...members];

    const body = document.createElement('div');

    const nameField = document.createElement('div');
    nameField.className = 'form-field';
    nameField.innerHTML = '<label for="team-name-input">隊伍名稱</label>';
    const nameInput = document.createElement('input');
    nameInput.type = 'text';
    nameInput.id = 'team-name-input';
    nameInput.maxLength = 30;
    nameInput.value = existingTeam ? existingTeam.name : '';
    nameInput.placeholder = '例如：高分隊';
    nameField.appendChild(nameInput);

    const noteField = document.createElement('div');
    noteField.className = 'form-field';
    noteField.innerHTML = '<label>備註</label>';

    const noteToolbar = document.createElement('div');
    noteToolbar.className = 'note-editor-toolbar';
    const noteEditor = document.createElement('div');
    noteEditor.className = 'note-editor';
    noteEditor.contentEditable = 'true';
    noteEditor.setAttribute('data-placeholder', '例如：第三回合保留大招。');
    // 載入舊備註時一樣先過濾（sanitizeNote.js）——放進可編輯區域時，
    // 匯入檔案裡被塞的程式碼一樣會執行。
    noteEditor.innerHTML = existingTeam ? sanitizeNoteHtml(existingTeam.note || '') : '';
    // 「有沒有改過」要跟放進編輯區之後的內容比，不是跟原始字串比——
    // 過濾（以及瀏覽器本身）可能會把寫法整理過，例如顏色格式，內容其實
    // 沒變，直接比原始字串會誤判成有修改、關閉時多跳一次確認。
    const initialNoteRendered = noteEditor.innerHTML;
    // Paste as plain text only — see admin-src/modules/richTextEditor.js's
    // Quill matcher for the fuller explanation; same fix, contenteditable
    // version (2026-09-06 request, applies to every one of these color
    // note editors across both site and admin).
    noteEditor.addEventListener('paste', (e) => {
      e.preventDefault();
      const text = (e.clipboardData || window.clipboardData).getData('text/plain');
      document.execCommand('insertText', false, text);
    });

    function applyNoteColor(color) {
      noteEditor.focus();
      document.execCommand('styleWithCSS', false, true);
      document.execCommand('foreColor', false, color);
    }
    for (const color of NOTE_COLOR_SWATCHES) {
      const swatch = document.createElement('button');
      swatch.type = 'button';
      swatch.className = 'note-color-swatch';
      swatch.style.backgroundColor = color;
      swatch.setAttribute('aria-label', `套用文字顏色 ${color}`);
      // mousedown (not click) + preventDefault so the current text
      // selection in noteEditor survives the button press — a click
      // handler fires after the selection has already collapsed on blur.
      swatch.addEventListener('mousedown', (e) => { e.preventDefault(); applyNoteColor(color); });
      noteToolbar.appendChild(swatch);
    }
    const resetSwatch = document.createElement('button');
    resetSwatch.type = 'button';
    resetSwatch.className = 'note-color-swatch note-color-reset';
    resetSwatch.textContent = 'A';
    resetSwatch.setAttribute('aria-label', '清除文字顏色');
    resetSwatch.addEventListener('mousedown', (e) => {
      e.preventDefault();
      noteEditor.focus();
      document.execCommand('removeFormat');
    });
    noteToolbar.appendChild(resetSwatch);

    const noteHint = document.createElement('div');
    noteHint.className = 'form-hint';
    noteHint.textContent = '選取文字後點顏色即可上色；換行會保留原本的排版。';
    noteField.append(noteToolbar, noteEditor, noteHint);

    const slotsLabel = document.createElement('div');
    slotsLabel.className = 'form-field';
    slotsLabel.innerHTML = '<label>隊員</label>';
    // 連續選取整隊 (2026-09-09) — 點一次可以連續選好幾張，不用逐格重
    // 開視窗；下面單獨重選/左右移動某一格的功能還在，兩種都可以用。
    const bulkPickBtn = document.createElement('button');
    bulkPickBtn.type = 'button';
    bulkPickBtn.className = 'btn btn-sm btn-secondary';
    bulkPickBtn.style.marginBottom = '8px';
    bulkPickBtn.textContent = '選擇隊伍';
    bulkPickBtn.addEventListener('click', async () => {
      const result = await openTeamPicker(members, { lockedCards, usedGroups });
      members = result;
      renderSlots();
    });
    slotsLabel.appendChild(bulkPickBtn);
    const slots = document.createElement('div');
    slots.className = 'team-slots';
    slotsLabel.appendChild(slots);

    body.append(nameField, noteField, slotsLabel);

    function moveMember(index, direction) {
      const target = index + direction;
      if (target < 0 || target >= members.length) return;
      [members[index], members[target]] = [members[target], members[index]];
      renderSlots();
    }

    function renderSlots() {
      slots.innerHTML = '';
      members.forEach((cardId, index) => {
        const card = cardId ? cardMap.get(cardId) : null;
        const slotWrap = document.createElement('div');
        slotWrap.className = 'team-slot-btn';

        if (card) {
          const btn = renderCardButton(card, cardMaps, {
            thumbnail: true,
            tag: lockedCards.get(card.id) || null,
            onClick: async () => {
              const chosen = await openCardPicker({ excludeIds: members.filter((id, i) => id && i !== index), lockedCards, usedGroups });
              if (chosen) {
                members[index] = chosen.id;
                renderSlots();
              }
            },
          });
          btn.style.width = '100%';
          slotWrap.appendChild(btn);

          // Swap this card's position with its left/right neighbor —
          // stages here often care about which slot a card sits in
          // (positioning matters), so this saves re-picking cards from
          // scratch just to reorder them.
          const moveRow = document.createElement('div');
          moveRow.className = 'team-slot-move-row';
          const leftBtn = document.createElement('button');
          leftBtn.type = 'button';
          leftBtn.className = 'btn btn-sm btn-secondary';
          leftBtn.textContent = '◀';
          leftBtn.disabled = index === 0;
          leftBtn.setAttribute('aria-label', `將隊員 ${index + 1} 往左移`);
          leftBtn.addEventListener('click', () => moveMember(index, -1));
          const rightBtn = document.createElement('button');
          rightBtn.type = 'button';
          rightBtn.className = 'btn btn-sm btn-secondary';
          rightBtn.textContent = '▶';
          rightBtn.disabled = index === members.length - 1;
          rightBtn.setAttribute('aria-label', `將隊員 ${index + 1} 往右移`);
          rightBtn.addEventListener('click', () => moveMember(index, 1));
          moveRow.append(leftBtn, rightBtn);
          slotWrap.appendChild(moveRow);

          const removeBtn = document.createElement('button');
          removeBtn.type = 'button';
          removeBtn.className = 'btn btn-sm btn-secondary btn-block';
          removeBtn.style.marginTop = '4px';
          removeBtn.textContent = '移除';
          removeBtn.addEventListener('click', () => {
            members[index] = null;
            renderSlots();
          });
          slotWrap.appendChild(removeBtn);
        } else {
          const btn = document.createElement('button');
          btn.type = 'button';
          btn.className = 'card-empty-slot';
          btn.setAttribute('aria-label', `選擇第 ${index + 1} 位隊員`);
          btn.textContent = '+';
          btn.addEventListener('click', async () => {
            const chosen = await openCardPicker({ excludeIds: members.filter(Boolean), lockedCards, usedGroups });
            if (chosen) {
              members[index] = chosen.id;
              renderSlots();
            }
          });
          slotWrap.appendChild(btn);
        }

        const label = document.createElement('div');
        label.className = 'team-slot-label';
        label.textContent = `隊員 ${index + 1}`;
        slotWrap.appendChild(label);

        slots.appendChild(slotWrap);
      });
    }
    renderSlots();

    // Confirms before discarding any unsaved edit — covers all three
    // ways this modal could otherwise close silently (Esc, clicking the
    // dark overlay, the × button) plus the 取消 button itself, since
    // that's just as easy to hit by mistake as the other three.
    function isDirty() {
      return nameInput.value !== initialName
        || noteEditor.innerHTML !== initialNoteRendered
        || JSON.stringify(members) !== JSON.stringify(initialMembers);
    }
    function confirmDiscard() {
      return !isDirty() || confirmDialog('放棄這次修改嗎？尚未儲存的內容會遺失。');
    }

    const footer = document.createElement('div');
    footer.className = 'modal-footer';
    const cancelBtn = document.createElement('button');
    cancelBtn.type = 'button';
    cancelBtn.className = 'btn';
    cancelBtn.textContent = '取消';
    const saveBtn = document.createElement('button');
    saveBtn.type = 'button';
    saveBtn.className = 'btn btn-primary';
    saveBtn.textContent = '儲存';
    footer.append(cancelBtn, saveBtn);
    body.appendChild(footer);

    let settled = false;
    const { close } = openModal({
      title: existingTeam ? '修改隊伍' : '新增隊伍',
      body,
      wide: true,
      canClose: confirmDiscard,
      onClose: () => { if (!settled) resolve(null); },
    });

    cancelBtn.addEventListener('click', () => {
      if (!confirmDiscard()) return;
      settled = true; close(); resolve(null);
    });

    saveBtn.addEventListener('click', async () => {
      if (!nameInput.value.trim()) {
        showToast('請輸入隊伍名稱', { type: 'error' });
        nameInput.focus();
        return;
      }
      try {
        const saved = await saveTeam(stageId, {
          localId: existingTeam ? existingTeam.localId : undefined,
          name: nameInput.value,
          note: noteEditor.innerHTML,
          members,
        });
        settled = true;
        close();
        showToast('隊伍已儲存');
        resolve(saved);
      } catch (err) {
        showToast(err.message || '儲存失敗', { type: 'error' });
      }
    });
  });
}
