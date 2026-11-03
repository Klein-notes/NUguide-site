// src/core/tagGroups.js
// Display order + Chinese labels for tags.json's "group" field. Shared by
// genericTaxonomyAdmin.js (Tag 管理 sidebar list) and fieldSelectors.js
// (the 技能 Tag 可複選 picker used when editing a stage's 推薦能力), so
// both places group/order tags identically instead of drifting apart.
export const TAG_GROUP_ORDER = [
  'damage',
  'self_dmg_up',
  'enemy_dmg_up',
  'survival',
  'control',
  'immune',
  'mechanic',
];

export const TAG_GROUP_LABELS = {
  damage: '傷害類型',
  self_dmg_up: '我方增傷',
  enemy_dmg_up: '敵方增傷',
  survival: '生存/治療',
  control: '異常/控制',
  immune: '免疫能力',
  mechanic: '機制/特殊',
};

// The 我方增傷 group specifically reads better as two aligned rows — 我方
// (team-wide) variants on top, 自身 (this card only) variants below, same
// damage-type lined up in the same column — rather than one flat grid.
// Matched purely by stripping the "我方"/"自身" prefix and pairing on
// whatever's left ("必殺傷害增加", "普攻傷害增加", …), so adding a new
// paired tag later just works without touching this function.
export const SELF_TEAM_SPLIT_GROUP = 'self_dmg_up';

// 生存/治療 group: the "-CD" series (labels ending in "-CD") should
// always sit on their own row below the rest of that group's tags,
// rather than just naturally wrapping there whenever the window happens
// to be narrow enough.
export const CD_SPLIT_GROUP = 'survival';

// Character-count "weight" used to cluster same-length labels together
// within a group (2026-09-12) — purely cosmetic tidiness for the fixed
// 2-column grid: a run of 2-character labels pairs up two-per-row, and
// a run of longer labels that need the full row sit together instead of
// alternating unpredictably with short ones. An ASCII character counts
// as half a unit, matching TagPicker.js's own visualLength() (kept as a
// separate copy here rather than imported, since TagPicker.js already
// imports *from* this file — importing back the other way would create
// a circular import).
function visualLength(label) {
  let len = 0;
  for (const ch of label) len += /[\x00-\xFF]/.test(ch) ? 0.5 : 1;
  return len;
}

// Stable sort by visual length, ascending — same-length labels keep
// their original relative sortOrder, so this only ever clusters, never
// reshuffles within a length.
function sortByLength(items) {
  return items
    .map((item, index) => ({ item, index }))
    .sort((a, b) => visualLength(a.item.label) - visualLength(b.item.label) || a.index - b.index)
    .map((entry) => entry.item);
}

/**
 * @param {Array<{label:string}>} items - already sorted (by sortOrder)
 * @returns {{ mainRow: Array<Object>, cdRow: Array<Object> }}
 */
export function splitCdRow(items) {
  const mainRow = [];
  const cdRow = [];
  for (const item of items) {
    if (item.label.endsWith('-CD')) cdRow.push(item);
    else mainRow.push(item);
  }
  return { mainRow, cdRow };
}

/**
 * @param {Array<{label:string}>} items - already sorted (by sortOrder)
 * @returns {{ teamRow: Array<Object|null>, ownRow: Array<Object|null>, leftover: Array<Object> }}
 *   teamRow[i] and ownRow[i] are the same damage-type paired up; either
 *   can be null (rendered as an empty placeholder) if only one side has
 *   a tag for that type. Anything not prefixed 我方/自身 lands in leftover.
 */
export function splitTeamOwnRows(items) {
  const teamBySuffix = new Map();
  const ownBySuffix = new Map();
  const leftover = [];
  for (const item of items) {
    if (item.label.startsWith('我方')) teamBySuffix.set(item.label.slice(2), item);
    else if (item.label.startsWith('自身')) ownBySuffix.set(item.label.slice(2), item);
    else leftover.push(item);
  }
  const suffixOrder = [];
  for (const suffix of teamBySuffix.keys()) if (!suffixOrder.includes(suffix)) suffixOrder.push(suffix);
  for (const suffix of ownBySuffix.keys()) if (!suffixOrder.includes(suffix)) suffixOrder.push(suffix);

  const teamRow = suffixOrder.map((s) => teamBySuffix.get(s) || null);
  const ownRow = suffixOrder.map((s) => ownBySuffix.get(s) || null);
  return { teamRow, ownRow, leftover };
}

/**
 * Groups a flat list of tags (or any items with a `.group` field) into
 * TAG_GROUP_ORDER's buckets, each already sorted by sortOrder. Items
 * whose group isn't in TAG_GROUP_ORDER land in a trailing "其他" bucket
 * instead of silently disappearing — matters for tags created before
 * this grouping existed, or with a typo'd group value.
 * @param {Array<{group?:string, sortOrder?:number}>} items
 * @returns {Array<{groupId:string, label:string, items:Array}>}
 */
export function groupTags(items) {
  const byGroup = new Map();
  for (const item of items) {
    const key = item.group && TAG_GROUP_LABELS[item.group] ? item.group : '__other__';
    if (!byGroup.has(key)) byGroup.set(key, []);
    byGroup.get(key).push(item);
  }
  const result = [];
  for (const groupId of TAG_GROUP_ORDER) {
    if (byGroup.has(groupId)) {
      // self_dmg_up/survival have their own row-pairing logic further
      // downstream (splitTeamOwnRows/splitCdRow in TagPicker.js) that
      // depends on this array's incoming order to decide column
      // alignment — clustering by length here would scramble that, so
      // only the plain groups get the cosmetic length-based reorder.
      const groupItems = groupId === SELF_TEAM_SPLIT_GROUP || groupId === CD_SPLIT_GROUP
        ? byGroup.get(groupId)
        : sortByLength(byGroup.get(groupId));
      result.push({ groupId, label: TAG_GROUP_LABELS[groupId], items: groupItems });
    }
  }
  if (byGroup.has('__other__')) {
    result.push({ groupId: '__other__', label: '其他', items: sortByLength(byGroup.get('__other__')) });
  }
  return result;
}
