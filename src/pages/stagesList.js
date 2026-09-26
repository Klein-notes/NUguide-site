// src/pages/stagesList.js
import { loadJSON, DataSources } from '../core/dataLoader.js';
import { mountNavbar, mountFooter } from '../components/Navbar.js';

// Converts a #rrggbb + 0-100 opacity into rgba(...) — used for the
// button border color, since CSS itself has no "hex + separate opacity
// %" syntax; this is computed once per page load, not live-measured.
function hexToRgba(hex, opacityPercent) {
  const h = (hex || '#3a3650').replace('#', '');
  const r = parseInt(h.substring(0, 2), 16) || 0;
  const g = parseInt(h.substring(2, 4), 16) || 0;
  const b = parseInt(h.substring(4, 6), 16) || 0;
  const a = Math.max(0, Math.min(100, opacityPercent ?? 100)) / 100;
  return `rgba(${r}, ${g}, ${b}, ${a})`;
}

// Same "text before the first space" rule as stageAdmin.js's own
// splitChapter/stageAppearanceAdmin.js's seriesOf — safe for the same
// reason: every chapter string is guaranteed "系列 季" (one space) by
// the admin's 系列/季 split fields.
function seriesOf(chapter) {
  const idx = (chapter || '').indexOf(' ');
  return idx === -1 ? (chapter || '') : chapter.slice(0, idx);
}

// Applies one chapter's 章節外觀 (2026-09-07: now supports an optional
// gradient background and/or gradient border, for a metallic look, on
// top of the original flat color+opacity) directly as inline style —
// not through a CSS custom property this time (see stagesList.js's own
// hard-won divider lesson: a class-based rule silently not matching in
// production, for reasons that were never fully pinned down, is exactly
// what inline style sidesteps entirely). Shared shape/logic duplicated
// across stagesList.js/myTeamsOverview.js/teamNotes.js, same as
// hexToRgba/seriesOf already are.
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
  // 背景漸層套用透明度 (2026-09-08 bug 修正) — 之前漸層模式下這個
  // 欄位完全沒作用，改成每個顏色都套用同一個透明度數值。
  el.style.background = cs.bgGradientEnabled
    ? `linear-gradient(${cs.bgGradientAngle ?? 135}deg, ${gradientStops((cs.bgGradientColors || ['#4a4a3a', '#1a1a14']).map((c) => hexToRgba(c, cs.bgOpacity)), cs.bgGradientPositions)})`
    : (cs.bgColor ? hexToRgba(cs.bgColor, cs.bgOpacity) : '');
  if (cs.borderWidth != null) el.style.borderWidth = `${cs.borderWidth}px`;
  if (cs.borderGradientEnabled) {
    el.style.borderStyle = 'solid';
    el.style.borderImage = `linear-gradient(${cs.borderGradientAngle ?? 135}deg, ${gradientStops(cs.borderGradientColors || ['#e8d9a0', '#8a7140'], cs.borderGradientPositions)}) 1`;
    // 外框漸層時底色裁切一起變直角 (2026-09-08) — border-image 這個
    // CSS 屬性本身不支援圓角，只有邊框變直角、底色裁切還是圓角的話
    // 兩者對不起來會很奇怪，乾脆一起變直角。
    el.style.borderRadius = '0';
  } else if (cs.borderColor) {
    el.style.borderStyle = 'solid';
    el.style.borderColor = hexToRgba(cs.borderColor, cs.borderOpacity);
    el.style.borderRadius = '';
  }
}

const FONT_VAR_BY_KEY = {
  display: 'var(--font-display)',
  body: 'var(--font-body)',
  mono: 'var(--font-mono)',
};

// 按鈕外觀 used to be one setting shared by the whole page; each chapter
// now has its own (2026-09-07, see 後台 → 章節外觀). This is the same
// look that global default used to be — the fallback for any chapter
// that hasn't been individually customized yet, so it doesn't suddenly
// look unstyled/plain the moment 網站設定's old shared setting stopped
// applying.
const DEFAULT_BUTTON_STYLE = {
  fontFamily: 'display', fontSize: 15, paddingY: 12, paddingX: 6, borderRadius: 8,
  gradientEnabled: true, gradientAngle: 180, gradientColors: ['#211f30', '#2a2740'],
  bgColor: '#211f30', borderColor: '#3a3650', borderOpacity: 100, borderWidth: 1,
  dividerWidth: 1, dividerGradientEnabled: false, dividerColors: ['#c9a45c', '#c9a45c'],
  textColor: '#ece9f7',
};

// Applies a 關卡按鈕外觀-shaped style object as CSS custom properties on
// `el` — the actual visual rules (.so-btn/.so-row) live in components.css
// and read these vars, with sane fallbacks baked in via CSS's own
// var(--x, fallback) syntax. Shared between the main button style and
// 過往關卡's own independent one — same shape, just applied to a
// different element, so whichever one is nearer in the DOM wins for any
// .so-btn inside it.
function applyButtonStyle(el, style) {
  const s = style || {};
  el.style.setProperty('--so-btn-font', FONT_VAR_BY_KEY[s.fontFamily] || FONT_VAR_BY_KEY.display);
  if (s.fontSize) el.style.setProperty('--so-btn-font-size', `${s.fontSize}px`);
  if (s.paddingY != null) el.style.setProperty('--so-btn-pad-y', `${s.paddingY}px`);
  if (s.paddingX != null) el.style.setProperty('--so-btn-pad-x', `${s.paddingX}px`);
  if (s.borderRadius != null) el.style.setProperty('--so-btn-radius', `${s.borderRadius}px`);
  if (s.borderWidth != null) el.style.setProperty('--so-btn-border-width', `${s.borderWidth}px`);
  el.style.setProperty('--so-btn-border-color', hexToRgba(s.borderColor, s.borderOpacity));
  if (s.textColor) el.style.setProperty('--so-btn-text', s.textColor);
  el.style.setProperty('--so-divider-width', `${s.dividerWidth ?? 1}px`);
  const dividerColors = s.dividerColors && s.dividerColors.length ? s.dividerColors : [s.dividerColor || 'var(--accent-gold)', s.dividerColor || 'var(--accent-gold)'];
  el.style.setProperty('--so-divider-start', dividerColors[0]);
  el.style.setProperty('--so-divider-end', s.dividerGradientEnabled ? dividerColors[1] : dividerColors[0]);
  if (s.gradientEnabled) {
    const stops = (s.gradientColors && s.gradientColors.length ? s.gradientColors : ['#211f30', '#2a2740']).join(', ');
    el.style.setProperty('--so-btn-bg', `linear-gradient(${s.gradientAngle ?? 180}deg, ${stops})`);
  } else if (s.bgColor) {
    el.style.setProperty('--so-btn-bg', s.bgColor);
  }
}

// Groups a flat stage list by chapter (preserving first-appearance
// order), sorted by 排序編號 within each — shared by both the main
// section and 過往關卡.
function groupByChapter(stageList) {
  const chapters = [];
  const chapterIndex = new Map();
  for (const stage of stageList) {
    if (!chapterIndex.has(stage.chapter)) {
      chapterIndex.set(stage.chapter, { chapter: stage.chapter, stages: [] });
      chapters.push(chapterIndex.get(stage.chapter));
    }
    chapterIndex.get(stage.chapter).stages.push(stage);
  }
  for (const group of chapters) {
    group.stages.sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));
  }
  return chapters;
}

// 系列顯示順序可自訂 (2026-09-08, 後台「章節外觀」→「系列順序」) —
// 章節群組本來的排列順序，是照 stages.json 資料裡出現的先後，換季、
// 新增系列的時候常常會跟你想要的顯示順序對不上。這裡把「哪個系列排
// 在前面」抽出來另外排序，系列內部（同系列不同季）的相對順序不受
// 影響，還是照原本的樣子，只有整個系列區塊會被搬動。沒被設定過的
// 系列排在所有已排序系列的後面，維持原本出現的順序。
function sortBySeriesOrder(items, seriesOrder, chapterOf) {
  if (!seriesOrder || !seriesOrder.length) return items;
  const rank = new Map(seriesOrder.map((s, i) => [s, i]));
  return [...items].sort((a, b) => {
    const ra = rank.has(seriesOf(chapterOf(a))) ? rank.get(seriesOf(chapterOf(a))) : Infinity;
    const rb = rank.has(seriesOf(chapterOf(b))) ? rank.get(seriesOf(chapterOf(b))) : Infinity;
    return ra - rb;
  });
}

// Renders one chapter's title + button grid (the row-break splitting,
// per stageAdmin.js's 另起一排 checkbox, is entirely admin-controlled,
// no auto-wrap logic here) — used for both a normal chapter box and a
// chapter listed inside 過往關卡.
// @param {string} [titleColorOverride] - 過往關卡 only (2026-09-07) —
//   per-系列 title color from 網站設定 → 過往關卡外觀 → 系列標題顏色,
//   set directly as inline style since it overrides whatever the
//   section-wide --past-chapter-title-color otherwise applies.
// @param {string} [seriesNoteHtml] - 系列說明 (2026-09-27)：後台「章節外觀」
//   → 系列說明，依「系列」存（不是依章節），換季不用重寫。只有現役區會傳，
//   過往關卡區不顯示。內容是空的（或只有空白）就整塊不出現。
function renderChapterGroup(group, titleColorOverride, seriesNoteHtml) {
  const groupEl = document.createElement('div');
  groupEl.className = 'chapter-group';
  const title = document.createElement('div');
  title.className = 'chapter-title';
  title.textContent = group.chapter;
  if (titleColorOverride) title.style.color = titleColorOverride;
  groupEl.appendChild(title);

  const gridEl = document.createElement('div');
  gridEl.className = 'so-grid';

  const rows = [];
  let currentRow = [];
  for (const stage of group.stages) {
    if (stage.rowBreak && currentRow.length > 0) {
      rows.push(currentRow);
      currentRow = [];
    }
    currentRow.push(stage);
  }
  if (currentRow.length) rows.push(currentRow);

  for (const row of rows) {
    const rowEl = document.createElement('div');
    rowEl.className = 'so-row';
    for (const stage of row) {
      const link = document.createElement('a');
      link.className = 'so-btn';
      link.href = `stage-detail.html?id=${encodeURIComponent(stage.id)}`;
      link.textContent = stage.order;
      rowEl.appendChild(link);
    }
    gridEl.appendChild(rowEl);
  }

  groupEl.appendChild(gridEl);

  // 系列說明：固定在方框最底下（所有按鈕排之後），左右置中；底色框寬度
  // 跟著文字長度，最寬到按鈕區左右兩端為止，字多了自動換行。
  if (seriesNoteHtml && seriesNoteHtml.replace(/<[^>]*>|&nbsp;|\s/g, '')) {
    const note = document.createElement('div');
    note.className = 'chapter-series-note';
    note.innerHTML = seriesNoteHtml;
    groupEl.appendChild(note);
  }
  return groupEl;
}

// 系列篩選 chips (2026-09-07) — reused identically on 我的隊伍總覽/隊伍
// 筆記 (each file keeps its own small copy, same as hexToRgba/seriesOf
// already are, rather than a shared cross-page module).
function renderSeriesFilter(container, allSeries, selected, onSelect) {
  if (allSeries.length < 2) return; // nothing meaningful to filter
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
  mountNavbar('stages.html');
  mountFooter();

  const [stages, siteSettings] = await Promise.all([
    loadJSON(DataSources.stages),
    loadJSON(DataSources.siteSettings).catch(() => null),
  ]);
  if (siteSettings && siteSettings.stagesDescription) {
    const descEl = document.getElementById('stages-description');
    if (descEl) descEl.innerHTML = siteSettings.stagesDescription;
  }

  const filterHost = document.getElementById('stage-list-filter');
  const allSeries = [...new Set(stages.filter((s) => !s.hidden).map((s) => seriesOf(s.chapter)))];

  function render() {
    if (filterHost) {
      filterHost.innerHTML = '';
      renderSeriesFilter(filterHost, allSeries, selectedSeries, (s) => { selectedSeries = s; render(); });
    }

    // Hidden stages don't show up here at all, same as before. Among the
    // rest, 過往關卡 (archived) stages are split into their own section
    // further down the page (2026-09-06) instead of sitting mixed in with
    // their chapter's other stages — see stageAdmin.js's 過往關卡
    // checkbox. 系列篩選 (2026-09-07) narrows both groups the same way.
    const bySeries = (s) => !selectedSeries || seriesOf(s.chapter) === selectedSeries;
    const activeStages = stages.filter((s) => !s.hidden && !s.archived && bySeries(s));
    const pastStages = stages.filter((s) => !s.hidden && s.archived && bySeries(s));

    const root = document.getElementById('stage-list-root');
    root.innerHTML = '';
    root.className = 'so-wrap';

    if (activeStages.length === 0 && pastStages.length === 0) {
      root.innerHTML = '<div class="empty-state"><h3>目前還沒有關卡資料</h3><p>請由站主於後台新增關卡。</p></div>';
      return;
    }

    // Per-chapter box color + button style (2026-09-07: 按鈕外觀 used to
    // be one setting shared by the whole page — now each chapter has
    // its own, set in 後台 → 章節外觀). A chapter with no entry there
    // just falls back to .chapter-group's own plain default (box) /
    // applyButtonStyle's own {} default (buttons).
    const chapterStyles = (siteSettings && siteSettings.chapterStyles) || {};
    const seriesOrder = (siteSettings && siteSettings.seriesOrder) || [];
    for (const group of sortBySeriesOrder(groupByChapter(activeStages), seriesOrder, (g) => g.chapter)) {
      const seriesNotes = (siteSettings && siteSettings.seriesNotes) || {};
      const groupEl = renderChapterGroup(group, null, seriesNotes[seriesOf(group.chapter)]);
      const cs = chapterStyles[group.chapter];
      if (cs) applyChapterStyle(groupEl, cs);
      applyButtonStyle(groupEl, (cs && cs.buttonStyle) || DEFAULT_BUTTON_STYLE);
      root.appendChild(groupEl);
    }

    if (pastStages.length) {
      const pastStyle = (siteSettings && siteSettings.pastSectionStyle) || {};

      // Every visual property set directly as inline style here, not via
      // a CSS class + custom property (2026-09-07) — after this element
      // specifically refused to pick up its own class's rule in
      // production for reasons that couldn't be pinned down even with
      // matched DevTools evidence, inline style removes components.css
      // as a dependency entirely: inline style always wins regardless of
      // what is or isn't loaded/matching in any external stylesheet.
      const divider = document.createElement('div');
      divider.style.height = `${pastStyle.dividerWidth ?? 1}px`;
      divider.style.backgroundColor = pastStyle.dividerColor || '#c9a45c';
      divider.style.margin = '30px 0';
      divider.style.maxWidth = '640px';
      root.appendChild(divider);

      const heading = document.createElement('div');
      heading.className = 'stage-past-heading';
      heading.textContent = '過往關卡';
      root.appendChild(heading);

      const pastSection = document.createElement('div');
      pastSection.className = 'stage-past-section';
      if (pastStyle.boxBgColor) pastSection.style.setProperty('--past-box-bg', hexToRgba(pastStyle.boxBgColor, pastStyle.boxBgOpacity));
      if (pastStyle.boxBorderColor) pastSection.style.setProperty('--past-box-border', hexToRgba(pastStyle.boxBorderColor, pastStyle.boxBorderOpacity));
      if (pastStyle.chapterTitleColor) pastSection.style.setProperty('--past-chapter-title-color', pastStyle.chapterTitleColor);
      if (pastStyle.chapterTitleFontSize) pastSection.style.setProperty('--past-chapter-title-size', `${pastStyle.chapterTitleFontSize}px`);
      // Button appearance scoped to just this section — see the
      // components.css comment on .stage-past-section for why setting
      // the SAME --so-btn-*/--so-divider-* vars here (instead of on the
      // page root like the main section above) is enough on its own.
      applyButtonStyle(pastSection, pastStyle.buttonStyle);

      for (const group of sortBySeriesOrder(groupByChapter(pastStages), seriesOrder, (g) => g.chapter)) {
        const seriesColors = pastStyle.seriesTitleColors || {};
        const titleColorOverride = seriesColors[seriesOf(group.chapter)];
        pastSection.appendChild(renderChapterGroup(group, titleColorOverride));
      }
      root.appendChild(pastSection);
    }
  }

  render();
}

init();
