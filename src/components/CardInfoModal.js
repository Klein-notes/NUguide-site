// src/components/CardInfoModal.js
// The "卡片資訊" detail modal — factored out of cardsPage.js so
// CardPicker.js (選擇卡片) can open the exact same modal from its new
// hover info button, instead of drifting into its own copy over time.
import { resolveAsset, resolveCardThumb } from '../core/dataLoader.js';
import { renderCardCrop } from './CardFace.js';
import { openModal } from './Modal.js';

/**
 * @param {Object} card
 * @param {Object} maps
 * @param {Map} maps.rarityMap
 * @param {Map} [maps.classMap]
 * @param {Map} [maps.elementMap]
 * @param {Map} [maps.characterMap]
 * @param {Map} [maps.tagMap]
 */
export function showCardInfoModal(card, maps) {
  const { rarityMap, classMap, elementMap, characterMap, tagMap } = maps;
  const rarity = rarityMap ? rarityMap.get(card.rarityId) : null;
  const cls = classMap ? classMap.get(card.classId) : null;
  const elem = elementMap ? elementMap.get(card.elementId) : null;
  const char = characterMap ? characterMap.get(card.characterId) : null;
  const cardTags = tagMap ? (card.tags || []).map((id) => tagMap.get(id)).filter(Boolean) : [];

  const body = document.createElement('div');
  body.className = 'card-info-modal-body';
  body.addEventListener('contextmenu', (e) => e.preventDefault());
  const wrap = document.createElement('div');
  // align-items:flex-start is the fix here — flex's default (stretch)
  // was forcing the fixed-size thumbnail to stretch to match whatever
  // height the info column ended up at (varies with how long the 必殺技
  // description is), which is what was distorting its aspect ratio.
  wrap.style.cssText = 'display:flex; gap:20px; flex-wrap:wrap; align-items:flex-start;';

  // Cropped thumbnail — same crop math + rarity border as every other
  // card, just without the badges/gradient/rarity-text overlay (that
  // info is shown as plain text/icons in the column next to it instead).
  const thumbBox = document.createElement('div');
  thumbBox.className = 'card-preview-box';
  thumbBox.appendChild(renderCardCrop({
    imageSrc: resolveCardThumb(card.image),
    imageAlt: card.name,
    rarity,
    imageZoom: card.imageZoom,
    imageOffsetX: card.imageOffsetX,
    imageOffsetY: card.imageOffsetY,
  }));

  const infoCol = document.createElement('div');
  infoCol.style.cssText = 'flex:1; min-width:220px;';

  const titleRow = document.createElement('div');
  titleRow.style.cssText = 'display:flex; align-items:baseline; gap:8px; margin-bottom:4px; font-family:var(--font-mono); font-weight:700;';
  titleRow.innerHTML = `
    <span style="color:${rarity ? rarity.color : 'var(--text)'};">${rarity ? rarity.label : ''}</span>
    <span style="color:var(--text-dim); font-family:var(--font-body); font-weight:400; font-size:0.9rem;">${char ? char.name : ''}</span>
  `;

  const h2 = document.createElement('h2');
  h2.style.marginBottom = '12px';
  h2.textContent = card.name;

  const metaRow = document.createElement('div');
  metaRow.className = 'card-info-meta';
  if (cls) metaRow.innerHTML += `<img class="card-info-icon" src="${resolveAsset(cls.icon)}" alt="${cls.label}" title="定位：${cls.label}" draggable="false">`;
  if (elem) metaRow.innerHTML += `<img class="card-info-icon" src="${resolveAsset(elem.icon)}" alt="${elem.label}" title="屬性：${elem.label}" draggable="false">`;
  metaRow.innerHTML += `<span class="card-info-cd">CD：${card.cd}</span>`;

  const ultimateWrap = document.createElement('div');
  ultimateWrap.style.marginBottom = '16px';
  const ultimateLabel = document.createElement('div');
  ultimateLabel.className = 'ultimate-skill-label';
  ultimateLabel.textContent = '必殺技 Lv3';
  const ultimateDesc = document.createElement('div');
  ultimateDesc.className = 'ultimate-skill-desc';
  ultimateDesc.innerHTML = card.ultimateSkill && card.ultimateSkill.trim() ? card.ultimateSkill : '空白。';
  ultimateWrap.append(ultimateLabel, ultimateDesc);

  const tagRow = document.createElement('div');
  tagRow.className = 'tag-row';
  tagRow.innerHTML = cardTags.map((t) => `<span class="tag-pill"><img src="${resolveAsset(t.icon)}" alt="">${t.label}</span>`).join('') || '<span class="guide-preview">尚未設定技能標籤</span>';

  infoCol.append(titleRow, h2, metaRow, ultimateWrap, tagRow);

  // 作品標註 (2026-11-04) — 有填才顯示，接在卡片圖片正下方、置中；後台輸入
  // 的換行照樣顯示（white-space:pre-line），空行變成段落間距，一行太長
  // 也會自動折行，
  // 寬度跟圖片一樣（160px）。沒填的卡片完全不經過這段，排版跟原本一模一樣。
  // 有填時圖片和標註包成一欄：這欄才是 wrap（flex）的直接子層，所以置中
  // 用的 margin:0 auto 要設在這欄上——寬度夠時（電腦）右邊的資訊欄
  // flex:1 會先吃掉多的空間，這欄照舊靠左；窄到換行時（手機）這欄自己
  // 一行、置中，跟原本圖片單獨置中的位置一樣。
  const workNote = (card.workNote || '').trim();
  if (workNote) {
    const thumbCol = document.createElement('div');
    thumbCol.style.cssText = 'display:flex; flex-direction:column; align-items:center; flex:0 0 auto; width:160px; margin:0 auto;';
    const note = document.createElement('div');
    note.className = 'card-info-work-note';
    note.style.cssText = 'width:100%; box-sizing:border-box; padding:10px; border-radius:var(--radius-sm); background:#2a2740; color:#b9b2d8; font-size:0.78rem; line-height:1.45; text-align:center; overflow-wrap:anywhere;';
    // 空行 = 分段：段落之間固定空 8px（比整整一行小），段落內的換行照原樣
    workNote.split(/\n\s*\n/).forEach((para, i) => {
      const p = document.createElement('div');
      p.style.whiteSpace = 'pre-line';
      if (i > 0) p.style.marginTop = '8px';
      p.textContent = para.trim();
      note.appendChild(p);
    });
    thumbCol.append(thumbBox, note);
    wrap.append(thumbCol, infoCol);
  } else {
    wrap.append(thumbBox, infoCol);
  }
  body.appendChild(wrap);

  openModal({ title: '卡片資訊', body });
}
