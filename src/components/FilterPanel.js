// src/components/FilterPanel.js
import { loadJSON, resolveAsset } from '../core/dataLoader.js';
import { createEmptyFilterState, toggleFilterOption, countActiveFilters } from '../modules/cardFilter.js';
import { renderTagList } from './TagPicker.js';

/**
 * Builds a filter panel bound to filter-schema.json.
 * @param {HTMLElement} container
 * @param {(state: Object) => void} onChange - called with the new filter state whenever it changes
 * @returns {Promise<{ getState: () => Object, reset: () => void, schema: Array, cdRanges: Array }>}
 */
export async function mountFilterPanel(container, onChange) {
  const schema = await loadJSON('data/filter-schema.json');
  const sourcesCache = {};
  for (const group of schema) {
    // enemyOnly entries (e.g. 屬性 的「無屬性」— only meaningful when
    // tagging an enemy, not a card) never show up as a filter option
    // here. filterHidden (e.g. 稀有度 的 R/N — 2026-09-05, hidden from
    // this filter panel only) works the same way but independently,
    // so either flag alone is enough to exclude an option; the
    // underlying data row itself is untouched, so anything elsewhere
    // that maps card.rarityId → this same rarities.json entry (card
    // badges, etc.) still finds it and renders normally.
    sourcesCache[group.field] = (await loadJSON(group.source)).filter((o) => !o.enemyOnly && !o.filterHidden);
  }
  let state = createEmptyFilterState(schema);
  let countEl = null;
  let clearBtnEl = null;

  function updateHeader() {
    const active = countActiveFilters(state);
    countEl.textContent = active > 0 ? `已套用 ${active} 項篩選條件` : '尚未套用篩選條件';
    clearBtnEl.disabled = active === 0;
  }

  // Renders (or re-renders) just ONE group's own options into its own
  // small wrapper element — never touches any other group, and never
  // touches `container` itself. Container is the scrolling element
  // (.fg-sidebar has its own overflow-y:auto); the previous version
  // rebuilt the *entire* panel from scratch on every single click, which
  // wiped and recreated every group's DOM (including ones the click had
  // nothing to do with) — that churn was what made the list jump around
  // (to the top, to the bottom, depending on layout specifics), not
  // simply "scroll position reset to 0" as first assumed. Only replacing
  // the one group that actually changed means nothing above or below it
  // ever moves.
  function renderGroup(group, optionsWrap) {
    const options = sourcesCache[group.field];

    if (group.optionType === 'icon-multi') {
      // renderTagList manages its own per-category repainting internally
      // now (see TagPicker.js) — calling renderGroup again here would
      // wipe and rebuild every one of its sub-categories on every click,
      // exactly the whole-list churn this was meant to avoid. Toggling
      // here only needs to update state/footer/results; the tag button
      // that was actually clicked repaints itself.
      renderTagList(optionsWrap, options, {
        isActive: (option) => (state[group.field] || []).includes(option.id),
        onToggle: (option) => {
          state = toggleFilterOption(state, group.field, option.id);
          updateHeader();
          onChange(state);
        },
      });
      return;
    }

    optionsWrap.innerHTML = '';
    for (const option of options) {
      let el;

      if (group.optionType === 'badge') {
        el = document.createElement('button');
        el.type = 'button';
        el.className = 'opt-badge';
        el.textContent = option.label;
      } else if (group.optionType === 'range') {
        el = document.createElement('button');
        el.type = 'button';
        el.className = 'opt-range';
        el.textContent = option.label;
      } else if (group.optionType === 'avatar') {
        el = document.createElement('button');
        el.type = 'button';
        el.className = 'opt-avatar';
        el.title = option.name;
        el.setAttribute('aria-label', option.name);
        const img = document.createElement('img');
        img.src = resolveAsset(option.icon);
        img.alt = option.name;
        img.draggable = false;
        el.appendChild(img);
      } else {
        // icon (class / element single-value)
        el = document.createElement('button');
        el.type = 'button';
        el.className = 'opt-icon';
        el.title = option.label;
        el.setAttribute('aria-label', option.label);
        const img = document.createElement('img');
        img.src = resolveAsset(option.icon);
        img.alt = option.label;
        img.draggable = false;
        el.appendChild(img);
      }

      // Reflects this one button's own active/inactive look without
      // touching any other element — toggling one option never affects
      // its siblings' state (toggleFilterOption only adds/removes this
      // option's own id), so there's nothing to rebuild.
      const paintActive = (isActive) => {
        el.classList.toggle('active', isActive);
        el.setAttribute('aria-pressed', String(isActive));
        if (group.optionType === 'badge') {
          el.style.background = isActive ? option.color : '';
          el.style.borderColor = isActive ? option.color : '';
          el.style.color = isActive ? '#14131f' : '';
        }
      };
      paintActive((state[group.field] || []).includes(option.id));

      el.addEventListener('click', () => {
        state = toggleFilterOption(state, group.field, option.id);
        paintActive((state[group.field] || []).includes(option.id));
        updateHeader();
        onChange(state);
      });
      optionsWrap.appendChild(el);
    }
  }

  // Full rebuild — only used once on mount, and on "重設"/reset, where
  // starting the whole panel fresh is actually correct.
  function renderAll() {
    container.innerHTML = '';

    // Direct child of `container` (.fg-sidebar) — not nested inside
    // .filter-panel/.fg-sidebar-body — specifically so it has no
    // ancestor padding to fight against. Sits in its normal spot above
    // 稀有度 until scrolling would carry it out of view, then sticks to
    // the top of .fg-sidebar instead of scrolling away, so it's
    // reachable no matter how far down the filter list you've scrolled.
    const header = document.createElement('div');
    header.className = 'filter-panel-header';
    countEl = document.createElement('span');
    countEl.className = 'filter-count';
    clearBtnEl = document.createElement('button');
    clearBtnEl.type = 'button';
    clearBtnEl.className = 'btn btn-sm btn-secondary';
    clearBtnEl.textContent = '重設';
    clearBtnEl.addEventListener('click', () => {
      state = createEmptyFilterState(schema);
      renderAll();
      onChange(state);
    });
    header.append(countEl, clearBtnEl);
    container.appendChild(header);
    updateHeader();

    const body = document.createElement('div');
    body.className = 'fg-sidebar-body';
    const panel = document.createElement('div');
    panel.className = 'filter-panel';
    body.appendChild(panel);
    container.appendChild(body);

    for (const group of schema) {
      const wrap = document.createElement('div');
      wrap.className = 'filter-group';
      // Per-field class (e.g. filter-group-elementId) — lets CSS target
      // just one group's options (see 屬性 icon size in components.css)
      // without touching 定位, which shares the same .opt-icon markup.
      wrap.classList.add(`filter-group-${group.field}`);

      const label = document.createElement('div');
      label.className = 'filter-group-label';
      label.textContent = group.label;
      wrap.appendChild(label);

      const optionsWrap = document.createElement('div');
      optionsWrap.className = 'filter-options';
      wrap.appendChild(optionsWrap);
      panel.appendChild(wrap);

      renderGroup(group, optionsWrap);
    }
  }

  renderAll();

  // 目前選了哪些條件的文字（例如「SSR、普攻、CD 3」），給觸控裝置收合
  // 篩選時的摘要列用 (2026-09-27, FilterBar.js)。CD 只有數字，前面補上
  // 「CD」才看得懂。
  function getActiveLabels() {
    const out = [];
    for (const group of schema) {
      for (const id of state[group.field] || []) {
        const o = (sourcesCache[group.field] || []).find((x) => x.id === id);
        if (!o) continue;
        const text = o.label || o.name || '';
        out.push(/^\d+$/.test(text) ? `${group.label} ${text}` : text);
      }
    }
    return out;
  }

  return {
    getState: () => state,
    getActiveLabels,
    getActiveCount: () => countActiveFilters(state),
    reset: () => { state = createEmptyFilterState(schema); renderAll(); onChange(state); },
    schema,
    cdRanges: sourcesCache.cd,
  };
}
