// src/components/TeamCard.js
import { resolveCardThumb } from '../core/dataLoader.js';
import { renderCardFace, BORDER_CLASS_BY_RARITY } from './CardFace.js';
import { sanitizeNoteHtml } from '../core/sanitizeNote.js';

// Reference size CardFace is measured against before being scaled down —
// matches the 200/260 aspect ratio used everywhere else (.card-btn,
// .card-preview-box), so badge sizes / gradient / rarity text all keep
// the exact same proportions as the full-size card, just shrunk down.
const STAGE_W = 200;
const STAGE_H = 260;

/**
 * @param {Object} team - { name, note, members: [cardId|null, ...] }
 * @param {Map} cardMap - id -> card object
 * @param {Object} [opts]
 * @param {Array<{label:string, className:string, onClick:Function}>} [opts.actions]
 * @param {boolean} [opts.showNote]
 * @param {boolean} [opts.showName] - default true. Set false for a
 *   collapsed/preview rendering that should show only the member avatars
 *   (used by 我的隊伍總覽's collapsed team rows).
 * @param {{rarityMap?:Map, elementMap?:Map, classMap?:Map}} [opts.maps] - pass
 *   these to show the same 屬性/定位/稀有度 badges CardFace shows everywhere
 *   else (卡片資料庫、後台卡片管理…). Omitted maps just render without that badge.
 */
export function renderTeamCard(team, cardMap, opts = {}) {
  const { rarityMap, elementMap, classMap } = opts.maps || {};

  const el = document.createElement('div');
  el.className = 'team-card' + (opts.official ? ' team-card-official' : '');

  if (opts.showName !== false) {
    const head = document.createElement('div');
    head.className = 'team-card-head';
    const name = document.createElement('div');
    name.className = 'team-card-name';
    name.textContent = team.name;
    head.appendChild(name);

    // 推薦隊伍 (opts.official) only — 備註 here is always a plain video
    // URL (admin's own field is a plain <input>, not the rich-text note
    // editor players use), so it becomes a "觀看影片" link in the header
    // row instead of printed out as text (2026-09-06 request). Player's
    // own saved teams elsewhere keep their note exactly as before — see
    // the showNote block below, now scoped to !opts.official.
    if (opts.official && team.note) {
      const videoLink = document.createElement('a');
      videoLink.href = team.note;
      videoLink.target = '_blank';
      videoLink.rel = 'noopener noreferrer';
      videoLink.className = 'team-card-video-link';
      videoLink.textContent = '觀看影片 →';
      head.appendChild(videoLink);
    }
    el.appendChild(head);
  }

  if (opts.showNote !== false && !opts.official && team.note) {
    const note = document.createElement('div');
    note.className = 'team-card-note';
    // team.note is HTML (the 備註 editor supports selecting text and
    // applying one of the site's accent colors to it). 2026-09-26：原本
    // 認為只會經過玩家自己的瀏覽器所以直接顯示，但「匯入備份」可以匯入
    // 別人給的檔案，所以一律先過濾（見 sanitizeNote.js），外觀不變。
    note.innerHTML = sanitizeNoteHtml(team.note);
    el.appendChild(note);
  }

  const members = document.createElement('div');
  members.className = 'team-card-members';
  for (const cardId of team.members) {
    const card = cardId ? cardMap.get(cardId) : null;
    if (card) {
      const wrap = document.createElement('div');
      wrap.className = 'mini-avatar';

      const stage = document.createElement('div');
      stage.className = 'mini-avatar-stage';
      stage.style.width = `${STAGE_W}px`;
      stage.style.height = `${STAGE_H}px`;

      const rarity = rarityMap ? rarityMap.get(card.rarityId) : null;
      const face = renderCardFace({
        imageSrc: resolveCardThumb(card.image),
        imageAlt: card.name,
        rarity,
        element: elementMap ? elementMap.get(card.elementId) : null,
        cls: classMap ? classMap.get(card.classId) : null,
        imageZoom: card.imageZoom,
        imageOffsetX: card.imageOffsetX,
        imageOffsetY: card.imageOffsetY,
      });
      stage.appendChild(face);
      wrap.appendChild(stage);

      // The rarity border drawn *inside* the scaled stage (see CardFace.js)
      // is suppressed at this size (.mini-avatar-stage .card-face-border
      // in components.css) — its CSS-mask technique loses crisp edges on
      // the right/bottom once rendered at full size and then shrunk by
      // transform:scale. Redrawn here instead, directly at the avatar's
      // own real 80×104 size, so it's never scaled and can't lose a sliver.
      const borderClass = rarity && BORDER_CLASS_BY_RARITY[rarity.id];
      if (borderClass) {
        const border = document.createElement('div');
        border.className = `mini-avatar-border ${borderClass}`;
        wrap.appendChild(border);
      }

      members.appendChild(wrap);
    } else {
      const wrap = document.createElement('div');
      wrap.className = 'mini-avatar-empty';
      wrap.textContent = '—';
      members.appendChild(wrap);
    }
  }
  el.appendChild(members);

  if (opts.actions && opts.actions.length) {
    const footer = document.createElement('div');
    footer.className = 'team-card-footer';
    for (const action of opts.actions) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = action.className || 'btn btn-sm';
      btn.textContent = action.label;
      btn.addEventListener('click', () => action.onClick(team));
      footer.appendChild(btn);
    }
    el.appendChild(footer);
  }

  return el;
}
