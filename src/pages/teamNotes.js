// src/pages/teamNotes.js
// 隊伍筆記 — same underlying team data and interaction pattern as
// myTeamsOverview.js (頁籤 → 隊伍頭像預覽 → 展開細節), just a different
// slice of stages (archived ones only) and a lighter panel: an enemy
// row up top (icon+name, no 查看攻略 recommended-team detail), no team
// name field, no link out to a full guide page. See stageAdmin.js's
// 過往關卡 checkbox for how a stage ends up on this page instead of
// 我的隊伍總覽.
import { loadJSON, DataSources, toMap } from '../core/dataLoader.js';
import { mountNavbar, mountFooter } from '../components/Navbar.js';
import { getAllTeamsGrouped, deleteTeam } from '../core/store.js';
import { renderTeamCard } from '../components/TeamCard.js';
import { sanitizeNoteHtml } from '../core/sanitizeNote.js';
import { renderEnemyChip } from '../components/EnemyPortrait.js';
import { openTeamEditor } from '../components/TeamEditor.js';
import { confirmDialog } from '../components/Modal.js';
import { showToast } from '../core/toast.js';

// Same conversion as stagesList.js's own hexToRgba.
function hexToRgba(hex, opacityPercent) {
  const h = (hex || '#3a3650').replace('#', '');
  const r = parseInt(h.substring(0, 2), 16) || 0;
  const g = parseInt(h.substring(2, 4), 16) || 0;
  const b = parseInt(h.substring(4, 6), 16) || 0;
  const a = Math.max(0, Math.min(100, opacityPercent ?? 100)) / 100;
  return `rgba(${r}, ${g}, ${b}, ${a})`;
}
// Same "text before the first space" rule used across stageAdmin.js /
// stageAppearanceAdmin.js / stagesList.js.
function seriesOf(chapter) {
  const idx = (chapter || '').indexOf(' ');
  return idx === -1 ? (chapter || '') : chapter.slice(0, idx);
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
  mountNavbar('team-notes.html');
  mountFooter();

  const [stages, cards, rarities, classes, elements, siteSettings] = await Promise.all([
    loadJSON(DataSources.stages),
    loadJSON(DataSources.cards),
    loadJSON(DataSources.rarities),
    loadJSON(DataSources.classes),
    loadJSON(DataSources.elements),
    loadJSON(DataSources.siteSettings).catch(() => null),
  ]);
  if (siteSettings && siteSettings.teamNotesDescription) {
    const descEl = document.getElementById('team-notes-description');
    if (descEl) descEl.innerHTML = siteSettings.teamNotesDescription;
  }
  const stageMap = toMap(stages);
  const cardMap = toMap(cards);
  const cardMaps = { rarityMap: toMap(rarities), classMap: toMap(classes), elementMap: toMap(elements) };
  const pastStyle = (siteSettings && siteSettings.pastSectionStyle) || {};
  const root = document.getElementById('notes-root');

  const openStageByChapter = new Map();
  const openTeamDetail = new Set();

  async function refresh() {
    const grouped = await getAllTeamsGrouped();
    root.innerHTML = '';

    const filterHost = document.getElementById('notes-filter');
    if (filterHost) {
      filterHost.innerHTML = '';
      const allSeries = [...new Set(stages.filter((s) => !s.hidden && s.archived).map((s) => seriesOf(s.chapter)))];
      renderSeriesFilter(filterHost, allSeries, selectedSeries, (s) => { selectedSeries = s; refresh(); });
    }

    const teamByStageId = new Map();
    for (const entry of grouped) {
      const stage = stageMap.get(entry.stageId);
      // The mirror image of myTeamsOverview.js's own filter — only
      // 過往關卡 (archived), and 隱藏 still wins if somehow both are set
      // (see stageAdmin.js's 過往關卡 checkbox note on priority).
      if (!stage || stage.hidden || !stage.archived) continue;
      // 系列篩選 (2026-09-07)
      if (selectedSeries && seriesOf(stage.chapter) !== selectedSeries) continue;
      if (entry.teams && entry.teams[0]) teamByStageId.set(entry.stageId, entry.teams[0]);
    }

    if (teamByStageId.size === 0) {
      // Blank, no placeholder box/text — same as myTeamsSection.js's
      // own empty state (2026-09-06 request).
      return;
    }

    const chaptersWithTeams = new Set();
    for (const stageId of teamByStageId.keys()) {
      chaptersWithTeams.add(stageMap.get(stageId).chapter);
    }
    const chapterOrder = [];
    const seenChapters = new Set();
    for (const s of stages) {
      if (chaptersWithTeams.has(s.chapter) && !seenChapters.has(s.chapter)) {
        seenChapters.add(s.chapter);
        chapterOrder.push(s.chapter);
      }
    }

    const rowsByChapter = new Map();
    for (const chapter of chapterOrder) {
      const chapterStages = stages
        .filter((s) => s.chapter === chapter && !s.hidden && s.archived)
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

    const TAB_COL_WIDTH = '104px';

    for (const chapter of chapterOrder) {
      const rows = rowsByChapter.get(chapter);

      const chapterEl = document.createElement('div');
      chapterEl.className = 'chapter-group';
      const titleEl = document.createElement('div');
      titleEl.className = 'chapter-title';
      titleEl.textContent = chapter;
      // 整頁都是「過往」內容，章節標題一律套用「過往關卡外觀」的樣式
      // (2026-09-07)，不是主要區域那組金色固定樣式；系列標題顏色設定
      // 有值就蓋過下面這個統一色。
      if (pastStyle.chapterTitleColor) {
        const seriesColors = pastStyle.seriesTitleColors || {};
        titleEl.style.color = seriesColors[seriesOf(chapter)] || pastStyle.chapterTitleColor;
      }
      if (pastStyle.chapterTitleFontSize) titleEl.style.fontSize = `${pastStyle.chapterTitleFontSize}px`;
      chapterEl.appendChild(titleEl);

      const activeStageId = openStageByChapter.get(chapter) || null;

      for (const row of rows) {
        const boxEl = document.createElement('div');
        boxEl.className = 'mt-chapter-box';
        // 整頁共用同一組「過往關卡外觀」外框樣式（2026-09-07），不分章
        // 節各自上色——呼應「過往的忘卻遺跡＋過往的檢定所，一起換色」
        // 那個決定,跟「我的隊伍總覽」用的是不同資料（那邊是每章節各自
        // 顏色的 chapterStyles）。
        if (pastStyle.boxBgColor) boxEl.style.setProperty('--chapter-box-bg', hexToRgba(pastStyle.boxBgColor, pastStyle.boxBgOpacity));
        if (pastStyle.boxBorderColor) boxEl.style.setProperty('--chapter-box-border', hexToRgba(pastStyle.boxBorderColor, pastStyle.boxBorderOpacity));

        const gridTemplate = Array.from({ length: row.length }, () => TAB_COL_WIDTH).join(' ');

        const rowEl = document.createElement('div');
        rowEl.className = 'mt-tab-row';
        rowEl.style.gridTemplateColumns = gridTemplate;
        row.forEach((s, i) => {
          const cell = document.createElement('div');
          cell.className = 'mt-tab-cell';

          if (i > 0) {
            const prevActive = row[i - 1].id === activeStageId;
            const thisActive = s.id === activeStageId;
            if (!prevActive && !thisActive) cell.classList.add('sep-left');
          }

          if (!teamByStageId.has(s.id)) {
            cell.appendChild(Object.assign(document.createElement('span'), {
              className: 'mt-tab-disabled',
              textContent: s.order,
            }));
          } else {
            if (activeStageId === s.id) cell.classList.add('active');
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'mt-tab';
            btn.textContent = s.order;
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
        // 「隊伍筆記」自己獨立的可調整設定 (2026-09-08) — 跟「我的隊伍
        // 總覽」是完全分開的欄位，不共用數值，各自在後台獨立調整。
        if (siteSettings && siteSettings.teamNotesTabPaddingY != null) {
          wrapEl.style.paddingTop = `${siteSettings.teamNotesTabPaddingY}px`;
          wrapEl.style.paddingBottom = `${siteSettings.teamNotesTabPaddingY}px`;
        }

        // No 查看攻略 link on this page at all (unlike myTeamsOverview.js)
        // — this whole page is explicitly for stages that don't have
        // (or don't need) a full guide, so .mt-tab-toprow only ever
        // holds the tab strip, nothing pushed to the right of it.
        const topRow = document.createElement('div');
        topRow.className = 'mt-tab-toprow';
        const scrollEl = document.createElement('div');
        scrollEl.className = 'mt-tab-scroll';
        scrollEl.appendChild(rowEl);
        topRow.appendChild(scrollEl);
        wrapEl.appendChild(topRow);
        boxEl.appendChild(wrapEl);

        // 展開狀態要對應到「還真的有隊伍」的關卡，見 myTeamsOverview.js
        // 同一處的說明 (2026-09-08 bug 修正)。
        const rowHasActiveStage = row.some((s) => s.id === activeStageId) && teamByStageId.has(activeStageId);
        if (rowHasActiveStage) {
          const activeStage = row.find((s) => s.id === activeStageId);
          const team = teamByStageId.get(activeStageId);
          const panel = document.createElement('div');
          panel.className = 'mt-tab-panel';

          // Enemy row — icon + name only (see .tn-enemy-row in
          // components.css, which hides renderEnemyChip's own note
          // text and shrinks the portrait to roughly the team card's
          // own avatar size), then a divider so it doesn't visually
          // fuse with the team card below it.
          if (activeStage.enemies && activeStage.enemies.length) {
            const enemyRow = document.createElement('div');
            enemyRow.className = 'tn-enemy-row';
            for (const enemy of activeStage.enemies) {
              enemyRow.appendChild(renderEnemyChip(enemy, cardMaps.elementMap));
            }
            panel.appendChild(enemyRow);
            const divider = document.createElement('div');
            divider.className = 'tn-enemy-divider';
            panel.appendChild(divider);
          }

          const isDetailOpen = openTeamDetail.has(activeStageId);

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

          // No 隊伍名稱 field shown here (per explicit request — this
          // page is "just record the team", not name it) — straight to
          // the note (筆記內文) and the 修改/刪除 actions.
          if (isDetailOpen) {
            const detail = document.createElement('div');
            detail.className = 'mt-team-detail';

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
    const stage = stageMap.get(stageId);
    if (stage && openStageByChapter.get(stage.chapter) === stageId) {
      openStageByChapter.set(stage.chapter, null);
    }
    openTeamDetail.delete(stageId);
    showToast('已刪除隊伍');
    refresh();
  }

  await refresh();
}

init();
