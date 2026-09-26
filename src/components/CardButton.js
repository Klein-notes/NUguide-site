// src/components/CardButton.js
import { resolveAsset, resolveCardThumb, resolveCardMedium } from '../core/dataLoader.js';
import { renderCardFace } from './CardFace.js';

const INFO_ICON_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"></circle><line x1="12" y1="11" x2="12" y2="16"></line><circle cx="12" cy="7.5" r="0.6" fill="currentColor" stroke="none"></circle></svg>';

/**
 * Renders one card thumbnail button.
 * @param {Object} card
 * @param {Object} maps
 * @param {Map} maps.rarityMap - id -> rarity object
 * @param {Map} [maps.elementMap] - id -> element object (for the top-left badge)
 * @param {Map} [maps.classMap] - id -> class/定位 object (for the top-right badge)
 * @param {Object} [opts]
 * @param {boolean} [opts.selected]
 * @param {boolean} [opts.disabled] - dims the card with a 30% black overlay
 *   and blocks onClick (e.g. a card already in the team being edited) —
 *   onInfoClick still works, so it's still possible to look the card up.
 * @param {boolean} [opts.thumbnail] - use the 240px-wide thumbnail image
 *   instead of the full-resolution original (see resolveCardThumb) —
 *   for every caller EXCEPT 卡片資料庫's own grid, where cards can render
 *   considerably larger than 240px on a wide screen.
 * @param {(card:Object) => void} [opts.onClick]
 * @param {(card:Object) => void} [opts.onInfoClick] - when set, shows a small
 *   info button in the bottom-right corner on hover (same size as the
 *   定位 badge) that opens the 卡片資訊 modal instead of triggering
 *   onClick — for pickers where clicking the card itself selects it, so
 *   there needs to be a separate way to inspect a card before choosing it.
 */
export function renderCardButton(card, maps, opts = {}) {
  const { rarityMap, elementMap, classMap } = maps;
  const rarity = rarityMap.get(card.rarityId);
  const element = elementMap ? elementMap.get(card.elementId) : null;
  const cls = classMap ? classMap.get(card.classId) : null;

  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'card-btn' + (opts.selected ? ' selected' : '') + (opts.disabled ? ' disabled' : '');
  btn.setAttribute('aria-label', card.name + (opts.disabled ? '（已在隊伍中）' : ''));
  btn.dataset.cardId = card.id;
  if (opts.disabled) btn.setAttribute('aria-disabled', 'true');

  // 卡片資料庫's own grid (opts.thumbnail/opts.compact both false) gets
  // srcset instead of always the full original (2026-09-07) — its cells
  // range from ~120px up to considerably larger on a wide screen with
  // few results, so a single fixed size (thumb or full) would either
  // look soft when stretched or over-download when small. sizes is an
  // approximation (CSS grid auto-fill's actual per-card width isn't
  // something a static sizes string can express exactly), tuned to the
  // grid's own minmax(120px,...) baseline.
  const useResponsive = !opts.thumbnail;
  const face = renderCardFace({
    imageSrc: opts.thumbnail ? resolveCardThumb(card.image) : resolveAsset(card.image),
    imageSrcset: useResponsive
      ? `${resolveCardThumb(card.image)} 240w, ${resolveCardMedium(card.image)} 480w, ${resolveAsset(card.image)} 800w`
      : undefined,
    imageSizes: useResponsive ? '(max-width: 480px) 45vw, 260px' : undefined,
    imageAlt: card.name,
    rarity,
    element,
    cls,
    imageZoom: card.imageZoom,
    imageOffsetX: card.imageOffsetX,
    imageOffsetY: card.imageOffsetY,
  });
  btn.appendChild(face);

  if (opts.disabled) {
    const overlay = document.createElement('div');
    overlay.className = 'card-btn-disabled-overlay';
    btn.appendChild(overlay);
  }
  // 小標籤 (2026-09-27)：卡片上緣正中間（屬性、定位兩個徽章之間），目前
  // 用在同章鎖卡——例如「7-1」代表這張卡已經被 7-1 的隊伍用掉。只負責
  // 顯示，能不能點照樣由 opts.disabled / opts.onClick 決定。
  if (opts.tag) {
    const tag = document.createElement('div');
    tag.className = 'card-btn-tag';
    tag.textContent = opts.tag;
    btn.appendChild(tag);
  }

  if (opts.onInfoClick) {
    // A <button> can't legally nest inside another <button>, so this is a
    // span with button semantics bolted on — real button elements led to
    // broken/unpredictable click handling once nested in Chrome/Safari.
    const infoBtn = document.createElement('span');
    infoBtn.className = 'card-info-btn';
    infoBtn.setAttribute('role', 'button');
    infoBtn.setAttribute('tabindex', '0');
    infoBtn.setAttribute('aria-label', `查看「${card.name}」的卡片資訊`);
    infoBtn.innerHTML = INFO_ICON_SVG;
    infoBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      opts.onInfoClick(card);
    });
    infoBtn.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        e.stopPropagation();
        opts.onInfoClick(card);
      }
    });
    btn.appendChild(infoBtn);
  }

  if (opts.onClick && !opts.disabled) btn.addEventListener('click', () => opts.onClick(card));
  return btn;
}
