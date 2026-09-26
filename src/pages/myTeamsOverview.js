// src/pages/myTeamsOverview.js
import { loadJSON, DataSources, toMap } from '../core/dataLoader.js';
import { mountNavbar, mountFooter } from '../components/Navbar.js';
import { getAllTeamsGrouped, deleteTeam } from '../core/store.js';
import { renderTeamCard } from '../components/TeamCard.js';
import { sanitizeNoteHtml } from '../core/sanitizeNote.js';
import { openTeamEditor } from '../components/TeamEditor.js';
import { confirmDialog } from '../components/Modal.js';
import { showToast } from '../core/toast.js';
import { downloadTeamsBackup, promptImportTeamsBackup } from '../modules/teamBackup.js';
import { confirmExportDialog, confirmImportModeDialog } from '../components/backupModals.js';

// Same conversion as stagesList.js's own hexToRgba — kept as a small
// local copy rather than a shared import, since this is the only place
// in this file that needs it (2026-09-07, 章節外觀 applied here too).
function hexToRgba(hex, opacityPercent) {
  const h = (hex || '#3a3650').replace('#', '');
  const r = parseInt(h.substring(0, 2), 16) || 0;
  const g = parseInt(h.substring(2, 4), 16) || 0;
  const b = parseInt(h.substring(4, 6), 16) || 0;
  const a = Math.max(0, Math.min(100, opacityPercent ?? 100)) / 100;
  return `rgba(${r}, ${g}, ${b}, ${a})`;
}
// Same "text before the first space" rule used across the admin pages
// and stagesList.js.
function seriesOf(chapter) {
  const idx = (chapter || '').indexOf(' ');
  return idx === -1 ? (chapter || '') : chapter.slice(0, idx);
}
// 系列顯示順序可自訂 (2026-09-08) — 同一套邏輯，跟 stagesList.js 一樣。
function sortBySeriesOrder(items, seriesOrder, chapterOf) {
  if (!seriesOrder || !seriesOrder.length) return items;
  const rank = new Map(seriesOrder.map((s, i) => [s, i]));
  return [...items].sort((a, b) => {
    const ra = rank.has(seriesOf(chapterOf(a))) ? rank.get(seriesOf(chapterOf(a))) : Infinity;
    const rb = rank.has(seriesOf(chapterOf(b))) ? rank.get(seriesOf(chapterOf(b))) : Infinity;
    return ra - rb;
  });
}
// Applies one chapter's 章節外觀 — same shared shape/logic as
// stagesList.js's own applyChapterStyle (2026-09-07, gradient bg/border
// support for a metallic look, set directly as inline style rather
// than through a CSS custom property).
// 每個顏色點各自的位置 (2026-09-08) — 沒有 positions 陣列，或長度跟
// colors 對不上時（舊資料），退回平均分配。
function gradientStops(colors, positions) {
  if (!positions || positions.length !== colors.length) {
    return colors.map((c, i) => `${c} ${colors.length === 1 ? 0 : Math.round((i / (colors.length - 1)) * 100)}%`).join(', ');
  }
  return colors.map((c, i) => `${c} ${positions[i]}%`).join(', ');
}
function applyChapterStyle(el, cs) {
  if (!cs) return;
  el.style.background = cs.bgGradientEnabled
    ? `linear-gradient(${cs.bgGradientAngle ?? 135}deg, ${gradientStops((cs.bgGradientColors || ['#4a4a3a', '#1a1a14']).map((c) => hexToRgba(c, cs.bgOpacity)), cs.bgGradientPositions)})`
    : (cs.bgColor ? hexToRgba(cs.bgColor, cs.bgOpacity) : '');
  if (cs.borderWidth != null) el.style.borderWidth = `${cs.borderWidth}px`;
  if (cs.borderGradientEnabled) {
    el.style.borderStyle = 'solid';
    el.style.borderImage = `linear-gradient(${cs.borderGradientAngle ?? 135}deg, ${gradientStops(cs.borderGradientColors || ['#e8d9a0', '#8a7140'], cs.borderGradientPositions)}) 1`;
    el.style.borderRadius = '0';
  } else if (cs.borderColor) {
    el.style.borderStyle = 'solid';
    el.style.borderColor = hexToRgba(cs.borderColor, cs.borderOpacity);
    el.style.borderRadius = '';
  }
}
// 系列篩選 chips (2026-09-07) — same small widget as stagesList.js's own.
function renderSeriesFilter(container, allSeries, selected, onSelect) {
  if (allSeries.length < 2) return;
  const bar = document.createElement('div');
  bar.className = 'series-filter';
  const allBtn = document.createElement('button');
  allBtn.type = 'button';
  allBtn.className = 'series-filter-btn' + (!selected ? ' active' : '');
  allBtn.textContent = '全部';
  allBtn.addEventListener('click', () => onSelect(null));
  bar.appendChild(allBtn);
  for (const s of allSeries) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'series-filter-btn' + (selected === s ? ' active' : '');
    btn.textContent = s;
    btn.addEventListener('click', () => onSelect(s));
    bar.appendChild(btn);
  }
  container.appendChild(bar);
}
let selectedSeries = null;

async function init() {
  mountNavbar('my-teams.html');
  mountFooter();

  const [stages, cards, rarities, classes, elements, siteSettings] = await Promise.all([
    loadJSON(DataSources.stages),
    loadJSON(DataSources.cards),
    loadJSON(DataSources.rarities),
    loadJSON(DataSources.classes),
    loadJSON(DataSources.elements),
    loadJSON(DataSources.siteSettings).catch(() => null),
  ]);
  if (siteSettings && siteSettings.myTeamsDescription) {
    const descEl = document.getElementById('my-teams-description');
    if (descEl) descEl.innerHTML = siteSettings.myTeamsDescription;
  }
  const stageMap = toMap(stages);
  const cardMap = toMap(cards);
  const cardMaps = { rarityMap: toMap(rarities), classMap: toMap(classes), elementMap: toMap(elements) };
  const chapterStyles = (siteSettings && siteSettings.chapterStyles) || {};
  const root = document.getElementById('overview-root');

  // Which stage is currently "open" within each chapter — a Map keyed
  // by chapter name, one open stage at a time per chapter (opening a
  // new one in the same chapter auto-closes the previous one); a
  // different chapter's own open stage is unaffected.
  const openStageByChapter = new Map();
  // Independent of which stage/tab is open — per-stage flag for
  // whether that stage's single team has been clicked open to show
  // its full detail (name/note/修改/刪除). Selecting a tab only reveals
  // the collapsed avatar-row preview; the detail is a second, separate
  // click on that preview, same two-step interaction as the old
  // accordion version of this page.
  const openTeamDetail = new Set();

  async function refresh() {
    const grouped = await getAllTeamsGrouped();
    root.innerHTML = '';

    const filterHost = document.getElementById('overview-filter');
    if (filterHost) {
      filterHost.innerHTML = '';
      const allSeries = [...new Set(stages.filter((s) => !s.hidden).map((s) => seriesOf(s.chapter)))];
      renderSeriesFilter(filterHost, allSeries, selectedSeries, (s) => { selectedSeries = s; refresh(); });
    }

    // Only one team per stage now (MAX_TEAMS_PER_STAGE = 1 — see
    // store.js) — take that single team directly rather than an array.
    const teamByStageId = new Map();
    for (const entry of grouped) {
      const stage = stageMap.get(entry.stageId);
      // Stage data itself is gone (deleted from the admin), hidden, or
      // archived (moved to 隊伍筆記 — see teamNotes.js) — the player's
      // own saved record still exists in their browser, this page just
      // has nothing meaningful to show it under, same as everywhere
      // else this situation comes up on the site.
      if (!stage || stage.hidden || stage.archived) continue;
      // 系列篩選 (2026-09-07)
      if (selectedSeries && seriesOf(stage.chapter) !== selectedSeries) continue;
      if (entry.teams && entry.teams[0]) teamByStageId.set(entry.stageId, entry.teams[0]);
    }

    if (teamByStageId.size === 0) {
      root.innerHTML = `
        <div class="empty-state">
          <h3>還沒有任何隊伍紀錄</h3>
          <p>前往任一關卡的攻略頁面，建立你的第一組隊伍。</p>
          <a href="stages.html" class="btn btn-primary" style="margin-top:14px; display:inline-flex;">前往關卡列表</a>
        </div>`;
      return;
    }

    // Only chapters that actually have at least one saved team show up
    // here at all — a chapter the player has never touched doesn't
    // clutter this page just because it exists on the site.
    const chaptersWithTeams = new Set();
    for (const stageId of teamByStageId.keys()) {
      chaptersWithTeams.add(stageMap.get(stageId).chapter);
    }
    // Preserve stages.json's own chapter ordering, not alphabetical —
    // then re-sort by 系列順序 (2026-09-08, 後台「章節外觀」→「系列
    // 順序」) if the admin has set one, without disturbing the relative
    // order of chapters within the same series.
    const chapterOrder = [];
    const seenChapters = new Set();
    for (const s of stages) {
      if (chaptersWithTeams.has(s.chapter) && !seenChapters.has(s.chapter)) {
        seenChapters.add(s.chapter);
        chapterOrder.push(s.chapter);
      }
    }
    const seriesOrder = (siteSettings && siteSettings.seriesOrder) || [];
    const sortedChapterOrder = sortBySeriesOrder(chapterOrder, seriesOrder, (c) => c);

    // Group every chapter's stages into rows (same rowBreak rule as
    // 關卡攻略's own button grid) — one bordered box per row, not per
    // chapter, since 7-1 and 8-1/8-2/8-3 are visually separate boxes
    // even though both sit under the same "忘卻遺跡" title.
    const rowsByChapter = new Map();
    for (const chapter of sortedChapterOrder) {
      const chapterStages = stages
        .filter((s) => s.chapter === chapter && !s.hidden && !s.archived)
        .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));

      const rows = [];
      let currentRow = [];
      for (const s of chapterStages) {
        if (s.rowBreak && currentRow.length > 0) { rows.push(currentRow); currentRow = []; }
        currentRow.push(s);
      }
      if (currentRow.length) rows.push(currentRow);

      rowsByChapter.set(chapter, rows);
    }

    // Fixed width per tab column (px) — a tab's size never depends on
    // its own label length or how many stages share its row. 104px is
    // derived from the card-avatar row below (56px avatar + 8px gap =
    // 64px per card): 3 tabs should reach the same total width as 5
    // of those card slots (5×64=320px÷3≈104px), matching the ratio the
    // 2026-09-05 reference screenshots were resized to.
    const TAB_COL_WIDTH = '104px';

    for (const chapter of sortedChapterOrder) {
      const rows = rowsByChapter.get(chapter);

      const chapterEl = document.createElement('div');
      chapterEl.className = 'chapter-group';
      const titleEl = document.createElement('div');
      titleEl.className = 'chapter-title';
      titleEl.textContent = chapter;
      chapterEl.appendChild(titleEl);

      const activeStageId = openStageByChapter.get(chapter) || null;

      // One bordered box PER ROW (not one box for the whole chapter) —
      // 7-1 and 8-1/8-2/8-3 are visually separate boxes even though
      // they're both under the same "忘卻遺跡" title. Whichever row
      // contains the currently-open stage gets its "查看攻略" link and
      // the team panel appended inside that same row's own box; other
      // rows in the chapter are untouched by that.
      for (const row of rows) {
        const boxEl = document.createElement('div');
        boxEl.className = 'mt-chapter-box';
        // 章節外觀 (2026-09-07) — same chapterStyles data stagesList.js
        // uses, keyed by the exact chapter string; a chapter with no
        // entry there falls back to .mt-chapter-box's own default gold
        // border (see components.css).
        const cs = chapterStyles[chapter];
        if (cs) applyChapterStyle(boxEl, cs);

        // No more 'auto' separator tracks or gap — cells sit directly
        // edge-to-edge (see .mt-tab-row column-gap:0 in CSS). The '｜'
        // divider is drawn as a border-left on each cell instead of a
        // text glyph in its own track: a glyph carries its own font
        // whitespace that can't be squeezed to 0, but a border can —
        // which is what lets the active cell's background reach fully
        // flush against its neighbor with zero gap (see 'sep-left'
        // below, per the 對齊方式 reference).
        const gridTemplate = Array.from({ length: row.length }, () => TAB_COL_WIDTH).join(' ');

        const rowEl = document.createElement('div');
        rowEl.className = 'mt-tab-row';
        rowEl.style.gridTemplateColumns = gridTemplate;
        row.forEach((s, i) => {
          // The grid item is this cell (a plain div) — divs reliably
          // stretch to fill their CSS Grid column, unlike a <button>
          // (a replaced/form element, which does not always honor the
          // grid's stretch sizing). The active background/color live
          // on the CELL, not on the button/text inside it, so the
          // highlight always spans the full column width regardless
          // of how wide the label text itself is.
          const cell = document.createElement('div');
          cell.className = 'mt-tab-cell';

          // A divider only shows between two NEITHER of which is the
          // active one — once either neighbor is active, that shared
          // edge is exactly where the active background should sit
          // flush, so drawing a line there would cut straight through
          // its own highlight.
          if (i > 0) {
            const prevActive = row[i - 1].id === activeStageId;
            const thisActive = s.id === activeStageId;
            if (!prevActive && !thisActive) cell.classList.add('sep-left');
          }

          const cs = chapterStyles[chapter];
          if (!teamByStageId.has(s.id)) {
            const disabledSpan = document.createElement('span');
            disabledSpan.className = 'mt-tab-disabled';
            disabledSpan.textContent = s.order;
            // 章節外觀可自訂的字色 (2026-09-08) — 沒設定過的話用 CSS
            // 原本寫死的顏色，維持原樣不變。
            if (cs && cs.numberColorDisabled) disabledSpan.style.color = cs.numberColorDisabled;
            cell.appendChild(disabledSpan);
          } else {
            if (activeStageId === s.id) cell.classList.add('active');
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'mt-tab';
            btn.textContent = s.order;
            if (cs && cs.numberColor && activeStageId !== s.id) btn.style.color = cs.numberColor;
            btn.addEventListener('click', () => {
              openStageByChapter.set(chapter, activeStageId === s.id ? null : s.id);
              refresh();
            });
            cell.appendChild(btn);
          }
          rowEl.appendChild(cell);
        });

        const wrapEl = document.createElement('div');
        wrapEl.className = 'mt-tab-wrap';
        // 上下內距可自訂 (2026-09-08, 後台「網站設定」) — 沒設定過的
        // 話用 CSS 原本寫死的 8px，不會突然變樣子。左右內距(14px)維持
        // 固定，只有上下可以調。
        if (siteSettings && siteSettings.myTeamsTabPaddingY != null) {
          wrapEl.style.paddingTop = `${siteSettings.myTeamsTabPaddingY}px`;
          wrapEl.style.paddingBottom = `${siteSettings.myTeamsTabPaddingY}px`;
        }

        // Tabs and the "查看攻略" link share one line (see
        // .mt-tab-toprow) — the link is only added as a second flex
        // child when this row has the open stage, so on an inactive
        // row the tab grid just sits alone at the left with nothing
        // pushed to the right.
        const topRow = document.createElement('div');
        topRow.className = 'mt-tab-toprow';

        // Wrap the tab grid in its own horizontally-scrollable strip
        // (see .mt-tab-scroll) — on a narrow phone, 104px×N columns
        // can add up to more than the box's actual width, and
        // .mt-chapter-box uses overflow:hidden for its rounded
        // corners, which would otherwise silently CLIP the extra tabs
        // (invisible and unclickable) instead of squeezing or
        // wrapping them. This scroll strip is what turns that into
        // "swipe to see more" instead of "tab disappears".
        const scrollEl = document.createElement('div');
        scrollEl.className = 'mt-tab-scroll';
        scrollEl.appendChild(rowEl);
        topRow.appendChild(scrollEl);

        // 展開狀態要對應到「還真的有隊伍」的關卡，不能只看
        // activeStageId 本身還在不在 (2026-09-08 bug 修正) —— 剛把這
        // 一關的隊伍刪掉之後，openStageByChapter 還記得它是「展開中」
        // 的那一關，但 teamByStageId 已經沒有它的資料了，硬要照舊畫出
        // 隊伍面板會直接讀到 undefined 整個當掉，害同一個系列後面的
        // 章節都畫不出來。這裡多檢查一次還有沒有隊伍，沒有的話就當作
        // 沒有展開，跟這一關從來沒被點開過一樣。
        const rowHasActiveStage = row.some((s) => s.id === activeStageId) && teamByStageId.has(activeStageId);
        if (rowHasActiveStage) {
          const link = document.createElement('a');
          link.href = `stage-detail.html?id=${encodeURIComponent(activeStageId)}`;
          link.className = 'mt-tab-link';
          link.textContent = '查看攻略 →';
          topRow.appendChild(link);
        }
        wrapEl.appendChild(topRow);
        boxEl.appendChild(wrapEl);

        if (rowHasActiveStage) {
          const team = teamByStageId.get(activeStageId);
          const panel = document.createElement('div');
          panel.className = 'mt-tab-panel';

          const isDetailOpen = openTeamDetail.has(activeStageId);

          // Step 1 of the two-step reveal: a clickable avatar-only
          // preview (no name/note/buttons yet). Clicking it toggles the
          // detail below, same as the old accordion's team-row preview.
          const previewBtn = document.createElement('button');
          previewBtn.type = 'button';
          previewBtn.className = 'mt-team-preview-btn';
          previewBtn.setAttribute('aria-label', `${isDetailOpen ? '收合' : '展開'}隊伍內容`);
          previewBtn.appendChild(renderTeamCard(team, cardMap, { maps: cardMaps, showName: false, showNote: false }));
          previewBtn.addEventListener('click', () => {
            if (openTeamDetail.has(activeStageId)) openTeamDetail.delete(activeStageId);
            else openTeamDetail.add(activeStageId);
            refresh();
          });
          panel.appendChild(previewBtn);

          // Step 2: only once the preview above has been clicked open —
          // name, note, and the 修改/刪除 actions (複製 removed per
          // 2026-09-05 request, both here and in myTeamsSection.js).
          if (isDetailOpen) {
            const detail = document.createElement('div');
            detail.className = 'mt-team-detail';

            const name = document.createElement('div');
            name.className = 'team-card-name';
            name.style.marginBottom = '6px';
            name.textContent = team.name;
            detail.appendChild(name);

            if (team.note) {
              const note = document.createElement('div');
              note.className = 'team-card-note';
              note.innerHTML = sanitizeNoteHtml(team.note); // 過濾見 sanitizeNote.js
              detail.appendChild(note);
            }

            const footer = document.createElement('div');
            footer.className = 'team-card-footer';
            footer.style.marginTop = '10px';
            const actions = [
              { label: '修改', className: 'btn btn-sm', onClick: () => handleEdit(activeStageId, team) },
              { label: '刪除', className: 'btn btn-sm btn-danger', onClick: () => handleDelete(activeStageId, team) },
            ];
            for (const action of actions) {
              const btn = document.createElement('button');
              btn.type = 'button';
              btn.className = action.className;
              btn.textContent = action.label;
              btn.addEventListener('click', () => action.onClick());
              footer.appendChild(btn);
            }
            detail.appendChild(footer);
            panel.appendChild(detail);
          }

          boxEl.appendChild(panel);
        }

        chapterEl.appendChild(boxEl);
      }

      root.appendChild(chapterEl);
    }
  }

  async function handleEdit(stageId, team) {
    await openTeamEditor(stageId, team);
    refresh();
  }
  async function handleDelete(stageId, team) {
    if (!confirmDialog('確定要刪除這組隊伍嗎？此動作無法復原。')) return;
    await deleteTeam(stageId, team.localId);
    // 刪掉之後這一關不再有隊伍了，把「展開中」的狀態一起清掉，不要留著
    // 一個對應不到任何資料的殘留選取 (2026-09-08)。
    const stage = stageMap.get(stageId);
    if (stage && openStageByChapter.get(stage.chapter) === stageId) {
      openStageByChapter.set(stage.chapter, null);
    }
    openTeamDetail.delete(stageId);
    showToast('已刪除隊伍');
    refresh();
  }

  document.getElementById('export-btn').addEventListener('click', async () => {
    if (!(await confirmExportDialog())) return;
    downloadTeamsBackup();
  });
  document.getElementById('import-btn').addEventListener('click', async () => {
    const mode = await confirmImportModeDialog();
    if (!mode) return;
    const ok = await promptImportTeamsBackup(mode);
    if (ok) refresh();
  });

  await refresh();
}

init();
