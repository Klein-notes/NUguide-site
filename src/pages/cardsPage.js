// src/pages/cardsPage.js
import { loadJSON, DataSources, toMap } from '../core/dataLoader.js';
import { mountNavbar, mountFooter } from '../components/Navbar.js';
import { mountFilterPanel } from '../components/FilterPanel.js';
import { createFilterBar } from '../components/FilterBar.js';
import { renderCardGrid } from '../components/CardGrid.js';
import { showCardInfoModal } from '../components/CardInfoModal.js';
import { filterCards } from '../modules/cardFilter.js';
import { sortCardsByOrder } from '../modules/cardSort.js';

async function init() {
  mountNavbar('cards.html');
  mountFooter();

  const [cardsRaw, rarities, classes, elements, characters, tags, siteSettings] = await Promise.all([
    loadJSON(DataSources.cards),
    loadJSON(DataSources.rarities),
    loadJSON(DataSources.classes),
    loadJSON(DataSources.elements),
    loadJSON(DataSources.characters),
    loadJSON(DataSources.tags),
    loadJSON(DataSources.siteSettings).catch(() => null),
  ]);
  const descEl = document.getElementById('cards-description');
  if (siteSettings && siteSettings.cardsDescription && descEl) {
    descEl.innerHTML = siteSettings.cardsDescription;
  }
  const cards = sortCardsByOrder(cardsRaw);
  const rarityMap = toMap(rarities);
  const classMap = toMap(classes);
  const elementMap = toMap(elements);
  const characterMap = toMap(characters);
  const tagMap = toMap(tags);
  const cardMaps = { rarityMap, elementMap, classMap };
  const infoMaps = { rarityMap, classMap, elementMap, characterMap, tagMap };

  const filterHost = document.getElementById('filter-host');
  const gridHost = document.getElementById('card-grid-host');
  const totalLabel = document.getElementById('result-count');

  function showDetail(card) {
    showCardInfoModal(card, infoMaps);
  }

  function applyAndRender(state, schema, cdRanges) {
    const filtered = filterCards(cards, state, schema, cdRanges);
    totalLabel.textContent = `共 ${filtered.length} / ${cards.length} 張卡片`;
    renderCardGrid(gridHost, filtered, cardMaps, { onCardClick: showDetail });
  }

  // 觸控裝置的收合式篩選列（FilterBar.js）；左邊的小字沿用頁首說明。
  // 電腦上這條列不顯示，頁首照舊。
  const bar = createFilterBar(filterHost, { noteHtml: descEl ? descEl.innerHTML : '' });
  bar.el.classList.add('fbar--page');
  document.getElementById('filter-bar-host').replaceWith(bar.el);

  const panel = await mountFilterPanel(filterHost, (state) => {
    applyAndRender(state, panel.schema, panel.cdRanges);
    bar.update(panel);
  });
  applyAndRender(panel.getState(), panel.schema, panel.cdRanges);
  bar.update(panel);
}

init();


