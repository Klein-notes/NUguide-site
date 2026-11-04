// src/pages/stageDetail.js
import { loadJSON, DataSources, toMap } from '../core/dataLoader.js';
import { mountNavbar, mountFooter, getSiteTitle } from '../components/Navbar.js';
import { renderTeamCard } from '../components/TeamCard.js';
import { renderEnemyChip } from '../components/EnemyPortrait.js';
import { renderMyTeamsSection } from '../modules/myTeamsSection.js';

function getStageIdFromUrl() {
  const params = new URLSearchParams(window.location.search);
  return params.get('id');
}

async function init() {
  mountNavbar('stages.html');
  mountFooter();

  const stageId = getStageIdFromUrl();
  const root = document.getElementById('stage-root');

  if (!stageId) {
    root.innerHTML = '<div class="empty-state"><h3>找不到關卡</h3><p>網址缺少關卡代碼，請從關卡列表重新進入。</p></div>';
    return;
  }

  const [stages, stageTeams, cards, elements, rarities, classes, siteSettings] = await Promise.all([
    loadJSON(DataSources.stages),
    loadJSON(DataSources.stageTeams),
    loadJSON(DataSources.cards),
    loadJSON(DataSources.elements),
    loadJSON(DataSources.rarities),
    loadJSON(DataSources.classes),
    loadJSON(DataSources.siteSettings).catch(() => null),
  ]);

  const stage = stages.find((s) => s.id === stageId);
  // A hidden stage behaves exactly like a deleted one from here — same
  // message, whether you got here via a direct link, a bookmark, or a
  // stale link someone shared before it was hidden. Its data isn't
  // actually gone (see myTeamsOverview.js, which still shows a
  // player's own saved team records for it), this page just won't open.
  if (!stage || stage.hidden) {
    root.innerHTML = '<div class="empty-state"><h3>找不到這個關卡</h3><p>可能已被移除，請回到關卡列表重新選擇。</p></div>';
    return;
  }

  const cardMap = toMap(cards);
  const elementMap = toMap(elements);
  const rarityMap = toMap(rarities);
  const classMap = toMap(classes);
  const cardMaps = { rarityMap, elementMap, classMap };
  const officialTeams = (stageTeams.find((t) => t.stageId === stageId) || {}).teams || [];

  document.title = `${stage.chapter} ${stage.order} | ${await getSiteTitle()}`;

  // Header is a dropdown, not static text — 標題 doesn't exist anymore
  // (章節 already names things; see the earlier discussion), and this
  // doubles as a quick way to jump straight to another stage without
  // going back to 關卡攻略's own button grid. Grouped by chapter via
  // <optgroup> so a long list still reads in sections.
  //
  // 2026-11-04：只列當季（非隱藏、非過往）關卡，順序跟「關卡攻略」頁一樣
  // ——章節先照後台「章節外觀 → 系列順序」排（沒排過的系列在後面），同
  // 系列照資料先後，章節內照關卡編號小到大。正在看過往關卡時，額外在最
  // 後放這一關所在章節的過往關卡（標「過往」），其他過往章節不放。
  function groupStages(list) {
    const order = [];
    const map = new Map();
    for (const s of list) {
      if (!map.has(s.chapter)) { map.set(s.chapter, []); order.push(s.chapter); }
      map.get(s.chapter).push(s);
    }
    for (const arr of map.values()) arr.sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));
    return { order, map };
  }
  const seriesOrder = (siteSettings && siteSettings.seriesOrder) || [];
  const seriesRank = new Map(seriesOrder.map((s, i) => [s, i]));
  const seriesOfChapter = (chapter) => {
    const idx = (chapter || '').indexOf(' ');
    return idx === -1 ? (chapter || '') : chapter.slice(0, idx);
  };
  const rankOf = (chapter) => (seriesRank.has(seriesOfChapter(chapter)) ? seriesRank.get(seriesOfChapter(chapter)) : Infinity);
  const active = groupStages(stages.filter((s) => !s.hidden && !s.archived));
  // 穩定排序：同系列的章節維持原本的先後
  const chapterOrder = active.order.map((c, i) => ({ c, i }))
    .sort((a, b) => (rankOf(a.c) - rankOf(b.c)) || (a.i - b.i))
    .map((x) => x.c);
  const optionHtml = (s) => `<option value="${s.id}" ${s.id === stage.id ? 'selected' : ''}>${s.order}</option>`;
  let optionsHtml = chapterOrder.map((chapter) => `
    <optgroup label="${chapter}">
      ${active.map.get(chapter).map(optionHtml).join('')}
    </optgroup>
  `).join('');
  if (stage.archived) {
    const pastOfChapter = groupStages(stages.filter((s) => !s.hidden && s.archived && s.chapter === stage.chapter));
    optionsHtml += `
    <optgroup label="過往・${stage.chapter}">
      ${(pastOfChapter.map.get(stage.chapter) || []).map(optionHtml).join('')}
    </optgroup>
  `;
  }

  document.getElementById('stage-header').innerHTML = `
    <div class="page-eyebrow">${stage.chapter}</div>
    <div class="stage-switcher-wrap">
      <span class="stage-switcher-label" aria-hidden="true">${stage.chapter} · ${stage.order}</span>
      <select class="stage-switcher" id="stage-switcher" aria-label="切換關卡">${optionsHtml}</select>
    </div>
  `;
  document.getElementById('stage-switcher').addEventListener('change', (e) => {
    window.location.href = `stage-detail.html?id=${encodeURIComponent(e.target.value)}`;
  });

  // Enemies
  const enemyList = document.getElementById('enemy-list');
  enemyList.innerHTML = '';
  if (stage.enemies && stage.enemies.length) {
    for (const enemy of stage.enemies) {
      enemyList.appendChild(renderEnemyChip(enemy, elementMap));
    }
  } else {
    enemyList.innerHTML = '<p class="guide-preview">尚未提供敵人資訊。</p>';
  }

  // Guide (rich text HTML from admin editor)
  document.getElementById('guide-content').innerHTML = stage.guide || '<p>尚未撰寫攻略。</p>';

  // Round table (回合表) — a real <table>, entirely separate from the
  // rich-text guide content above (see stageAdmin.js's roundTable field).
  // Only rendered when the stage actually has rows; a stage that never
  // used this feature just doesn't show a table at all.
  const roundTable = stage.roundTable || [];
  if (roundTable.length > 0) {
    const table = document.createElement('table');
    table.className = 'rt-table';
    for (const row of roundTable) {
      const tr = document.createElement('tr');
      const td1 = document.createElement('td');
      td1.innerHTML = row.col1 || '';
      const td2 = document.createElement('td');
      td2.innerHTML = row.col2 || '';
      tr.append(td1, td2);
      table.appendChild(tr);
    }
    document.getElementById('guide-content').insertAdjacentElement('afterend', table);
  }

  // Official teams
  const officialWrap = document.getElementById('official-teams');
  if (officialTeams.length) {
    officialWrap.innerHTML = '';
    for (const team of officialTeams) {
      officialWrap.appendChild(renderTeamCard(team, cardMap, { showNote: true, maps: cardMaps, official: true }));
    }
  } else {
    officialWrap.innerHTML = '<p class="guide-preview">尚未提供參考隊伍。</p>';
  }

  // My teams
  const myTeamsHost = document.getElementById('my-teams-list');
  const { handleAdd } = await renderMyTeamsSection(myTeamsHost, stageId, cardMap, cardMaps);
  document.getElementById('add-team-btn').addEventListener('click', handleAdd);
}

init();
