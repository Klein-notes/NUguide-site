// src/core/store.js
// All player-owned data (their own teams) lives only in this browser's
// LocalStorage. The API is Promise-based on purpose: if this ever needs to
// move to IndexedDB for larger data, callers do not need to change.

const KEY = 'myTeams';
const MEMBER_SLOTS = 5;

function readAll() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch (err) {
    console.error('讀取本機隊伍資料失敗，將視為無資料處理。', err);
    return {};
  }
}

function writeAll(data) {
  try {
    localStorage.setItem(KEY, JSON.stringify(data));
    return true;
  } catch (err) {
    console.error('寫入本機隊伍資料失敗（可能是瀏覽器儲存空間已滿）。', err);
    return false;
  }
}

function uuid() {
  if (crypto.randomUUID) return crypto.randomUUID();
  return 'team_' + Date.now() + '_' + Math.random().toString(16).slice(2);
}

function normalizeMembers(members = []) {
  const arr = members.slice(0, MEMBER_SLOTS);
  while (arr.length < MEMBER_SLOTS) arr.push(null);
  return arr;
}

/** Get every team the player has saved for one stage. */
export async function getTeams(stageId) {
  const all = readAll();
  return all[stageId] ? all[stageId] : [];
}

/** Get every team across every stage, as { stageId, teams[] } entries. */
export async function getAllTeamsGrouped() {
  const all = readAll();
  return Object.keys(all)
    .filter((stageId) => Array.isArray(all[stageId]) && all[stageId].length > 0)
    .map((stageId) => ({ stageId, teams: all[stageId] }));
}

export async function saveTeam(stageId, team) {
  const all = readAll();
  const list = all[stageId] ? all[stageId] : [];
  const normalized = {
    localId: team.localId || uuid(),
    name: (team.name || '未命名隊伍').trim() || '未命名隊伍',
    note: team.note || '',
    members: normalizeMembers(team.members),
  };
  const idx = list.findIndex((t) => t.localId === normalized.localId);
  if (idx >= 0) list[idx] = normalized;
  else list.push(normalized);
  all[stageId] = list;
  const ok = writeAll(all);
  if (!ok) throw new Error('儲存失敗，請確認瀏覽器儲存空間是否已滿。');
  return normalized;
}

export async function deleteTeam(stageId, localId) {
  const all = readAll();
  if (!all[stageId]) return;
  all[stageId] = all[stageId].filter((t) => t.localId !== localId);
  if (all[stageId].length === 0) delete all[stageId];
  writeAll(all);
}

export async function duplicateTeam(stageId, localId) {
  const all = readAll();
  const list = all[stageId] || [];
  const source = list.find((t) => t.localId === localId);
  if (!source) throw new Error('找不到要複製的隊伍。');
  const copy = {
    ...source,
    localId: uuid(),
    name: source.name + ' (複製)',
  };
  list.push(copy);
  all[stageId] = list;
  writeAll(all);
  return copy;
}

export async function exportTeams(stageId = null) {
  const all = readAll();
  const payload = stageId ? { [stageId]: all[stageId] || [] } : all;
  return {
    exportedAt: new Date().toISOString(),
    scope: stageId || 'all',
    data: payload,
    // 常用卡片 (2026-11-08)：只有整份備份才帶
    ...(stageId ? {} : { favoriteCards: readFavoriteCards() }),
  };
}

/**
 * Import a previously exported backup.
 * mode: 'merge' (add/overwrite matching localIds, keep the rest) or
 *       'replace' (wipe target scope then write the imported data).
 */
export async function importTeams(payload, mode = 'merge', { resolveFavoriteCards } = {}) {
  if (!payload || typeof payload !== 'object' || !payload.data) {
    throw new Error('檔案格式不正確，無法匯入。');
  }
  // 常用卡片 (2026-11-08)：不管「加入」或「覆蓋」都只合併——本瀏覽器原本的
  // 在前，檔案裡本瀏覽器沒有的接在後面，不會刪掉也不會清空。合併後超過上限
  // 就先問玩家（resolveFavoriteCards 回傳留下的 id；回傳 null＝「不匯入最愛」，
  // 常用卡片維持原本的）。舊備份檔沒有 favoriteCards＝常用卡片不動。
  // 先問完才開始寫入，視窗開著時關掉分頁，什麼都不會寫進去。
  let nextFavorites = null;
  if (Array.isArray(payload.favoriteCards)) {
    const local = readFavoriteCards();
    const localSet = new Set(local);
    const fileIds = [...new Set(payload.favoriteCards.filter((id) => typeof id === 'string'))];
    const merged = [...local, ...fileIds.filter((id) => !localSet.has(id))];
    if (merged.length > MAX_FAVORITE_CARDS && resolveFavoriteCards) {
      const kept = await resolveFavoriteCards({ localIds: local, fileIds, max: MAX_FAVORITE_CARDS });
      nextFavorites = kept ? kept.slice(0, MAX_FAVORITE_CARDS) : null;
    } else {
      nextFavorites = merged.slice(0, MAX_FAVORITE_CARDS);
    }
  }
  // 覆蓋檔案 (2026-11-08)：照匯入視窗的說明，原本的隊伍紀錄全部清空，
  // 只留下檔案裡的內容（以前只換掉檔案裡有的關卡，其他關卡會留著）
  const all = mode === 'replace' ? {} : readAll();
  for (const [stageId, teams] of Object.entries(payload.data)) {
    if (!Array.isArray(teams)) continue;
    if (mode === 'replace') {
      all[stageId] = teams.map((t) => ({ ...t, members: normalizeMembers(t.members) }));
      continue;
    }
    const existing = all[stageId] || [];
    for (const incoming of teams) {
      const norm = { ...incoming, members: normalizeMembers(incoming.members) };
      const idx = existing.findIndex((t) => t.localId === norm.localId);
      if (idx >= 0) existing[idx] = norm;
      else existing.push(norm);
    }
    all[stageId] = existing;
  }
  const ok = writeAll(all);
  if (!ok) throw new Error('匯入失敗，請確認瀏覽器儲存空間是否已滿。');
  if (nextFavorites) writeFavoriteCards(nextFavorites);
  return true;
}

// ---- 常用卡片 (2026-11-08) ----
// 玩家自己挑的卡（卡片 id，照挑選時的卡片順序），「編輯整隊」「選擇卡片」
// 視窗會把這些卡排在最上面。跟隊伍一樣只存在這個瀏覽器。
const FAV_KEY = 'favoriteCards';
export const MAX_FAVORITE_CARDS = 20;

function readFavoriteCards() {
  try {
    const raw = JSON.parse(localStorage.getItem(FAV_KEY));
    return Array.isArray(raw) ? raw.filter((id) => typeof id === 'string') : [];
  } catch {
    return [];
  }
}
function writeFavoriteCards(ids) {
  try {
    localStorage.setItem(FAV_KEY, JSON.stringify(ids.slice(0, MAX_FAVORITE_CARDS)));
    return true;
  } catch (err) {
    console.error('寫入常用卡片失敗（可能是瀏覽器儲存空間已滿）。', err);
    return false;
  }
}
export async function getFavoriteCards() {
  return readFavoriteCards();
}
export async function setFavoriteCards(ids) {
  if (!writeFavoriteCards(ids)) throw new Error('儲存失敗，請確認瀏覽器儲存空間是否已滿。');
  return true;
}

export const TEAM_MEMBER_SLOTS = MEMBER_SLOTS;
export const MAX_TEAMS_PER_STAGE = 2;
