// src/modules/chapterLock.js
//
// 同章鎖卡 (2026-09-27)。忘卻遺跡的規則：同一章（例如第 7 章的 7-1、
// 7-2、7-3，或同一季的 SP-1～SP-4）裡，一張卡只能用在其中一關。所以
// 記錄某一關的隊伍時，同章「其他關卡」的第 1 組隊伍用過的卡都不能選。
//
// 規則（跟站主確認過的）：
//   - 只套用在系列是「忘卻遺跡」的關卡；其他系列（包括魔法檢定所的 SP）
//     都不受限制。
//   - 「同一章」＝ 同一個 chapter 字串（系列＋季）＋ 編號「 - 」前面那段
//     相同，例如「7 - 1」「7 - 3」都是 7；「SP - 1」「SP - 4」都是 SP。
//   - 只看每一關的第 1 組隊伍（第 2 組當備案，不鎖）。
//   - 過往關卡、隱藏的關卡不算在同一章裡，也不會被鎖——換季後舊的 SP-1
//     移到過往、新的 SP-2 改名成 SP-1 時，兩者不會互相卡住。
//   - 換季不另外處理：舊隊伍還掛在關卡上就照樣鎖，玩家自己把卡拿下來。
const LOCK_SERIES = '忘卻遺跡';

function seriesOf(chapter) {
  const idx = (chapter || '').indexOf(' ');
  return idx === -1 ? (chapter || '') : chapter.slice(0, idx);
}
function chapterNo(order) {
  const idx = (order || '').indexOf(' - ');
  return (idx === -1 ? (order || '') : order.slice(0, idx)).trim();
}
/** 「7 - 1」→「7-1」，顯示用 */
export function shortOrder(order) {
  return (order || '').replace(/\s+/g, '');
}

/**
 * @param {string} stageId - 正在記錄隊伍的這一關
 * @param {Array} stages - stages.json
 * @param {Array<{stageId:string, teams:Array}>} grouped - store.js getAllTeamsGrouped() 的結果
 * @returns {{ lockedCards: Map<string,string>, groups: Array<{label:string, members:(string|null)[]}> }}
 *   lockedCards：cardId → 用掉它的關卡編號（例如「7-1」）。
 *   groups：同章其他每一關（照關卡順序），各自第 1 組的 5 個站位，沒放卡
 *   的位置是 null；那一關還沒記隊伍的話 5 格都是 null。
 *   不適用（不是忘卻遺跡、過往、隱藏…）時兩個都是空的。
 */
export function computeChapterLock(stageId, stages, grouped) {
  const locked = new Map();
  const groups = [];
  const empty = { lockedCards: locked, groups };
  const stage = stages.find((s) => s.id === stageId);
  if (!stage || stage.archived || stage.hidden || seriesOf(stage.chapter) !== LOCK_SERIES) return empty;
  const no = chapterNo(stage.order);
  if (!no) return empty;
  const teamsByStage = new Map(grouped.map((g) => [g.stageId, g.teams]));
  const siblings = stages
    .filter((s) => s.id !== stageId && !s.archived && !s.hidden && s.chapter === stage.chapter && chapterNo(s.order) === no)
    .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));
  for (const s of siblings) {
    const first = (teamsByStage.get(s.id) || [])[0];
    const members = [0, 1, 2, 3, 4].map((i) => (first && first.members && first.members[i]) || null);
    groups.push({ label: shortOrder(s.order), members });
    for (const cardId of members) {
      if (cardId && !locked.has(cardId)) locked.set(cardId, shortOrder(s.order));
    }
  }
  return { lockedCards: locked, groups };
}
