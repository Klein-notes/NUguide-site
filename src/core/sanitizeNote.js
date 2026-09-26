// src/core/sanitizeNote.js
//
// 隊伍備註的安全過濾 (2026-09-26)。備註是 HTML（備註編輯器可以幫選取
// 的文字上色、換行），平常只經過玩家自己的瀏覽器，但「匯入備份」可以
// 匯入別人給的檔案——檔案裡的備註如果被塞了程式碼（例如
// <img src=x onerror=...>），直接用 innerHTML 顯示就會在網站上執行。
//
// 這裡只留下備註編輯器本來就會產生的東西，其他一律拿掉：
//   - 標籤：段落、換行、文字樣式、清單、標題、連結這類純排版用的標籤
//     （不在清單內的：script/style 這類整段刪除，其他只拆掉外殼、保留
//     裡面的文字）。清單放寬一點，是為了 09-06「貼上只貼純文字」修正
//     之前就存在的舊備註——那時貼上的內容可能帶著清單、標題等排版，
//     這些都保留，顯示才不會變。
//   - 屬性：style 只留顏色/底色/粗細/斜體/底線/字級，而且值裡不能有
//     url( 之類會去載入外部東西的寫法；<font color>；連結只留 http/https
//     的 href（一律新分頁開）。其他屬性（onerror、onclick、class…）全部拿掉
//
// 用 DOMParser 解析：解析出來的文件是「不會執行」的，裡面的圖片不會
// 載入、事件不會觸發，過濾完才放進畫面。
const ALLOWED_TAGS = new Set(['DIV', 'P', 'BR', 'SPAN', 'FONT', 'B', 'STRONG', 'I', 'EM', 'U', 'S', 'STRIKE', 'SUB', 'SUP', 'SMALL', 'MARK',
  'UL', 'OL', 'LI', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'BLOCKQUOTE', 'PRE', 'CODE', 'HR', 'A']);
const ALLOWED_STYLES = ['color', 'background-color', 'font-weight', 'font-style', 'text-decoration', 'text-decoration-line', 'font-size', 'text-align'];
const UNSAFE_CSS_VALUE = /url\s*\(|expression|javascript:|\\|@import/i;
const DROP_WITH_CONTENT = new Set(['SCRIPT', 'STYLE', 'IFRAME', 'OBJECT', 'EMBED', 'TEMPLATE', 'NOSCRIPT', 'SVG', 'MATH', 'TEXTAREA', 'SELECT', 'TITLE', 'HEAD']);
const COLOR_RE = /^(#[0-9a-f]{3,8}|rgba?\(\s*[\d.]+%?\s*,\s*[\d.]+%?\s*,\s*[\d.]+%?\s*(,\s*[\d.]+%?\s*)?\)|[a-z]{3,20})$/i;

function cleanNode(node) {
  for (const child of [...node.childNodes]) {
    if (child.nodeType === Node.TEXT_NODE) continue;
    if (child.nodeType !== Node.ELEMENT_NODE) { child.remove(); continue; } // 註解等
    const tag = child.tagName.toUpperCase();
    if (DROP_WITH_CONTENT.has(tag)) { child.remove(); continue; }
    cleanNode(child);
    if (!ALLOWED_TAGS.has(tag)) { child.replaceWith(...child.childNodes); continue; }
    const kept = [];
    for (const prop of ALLOWED_STYLES) {
      const v = child.style ? child.style.getPropertyValue(prop) : '';
      if (v && !UNSAFE_CSS_VALUE.test(v)) kept.push([prop, v]);
    }
    const fontColor = tag === 'FONT' ? (child.getAttribute('color') || '').trim() : '';
    const href = tag === 'A' ? (child.getAttribute('href') || '').trim() : '';
    for (const attr of [...child.attributes]) child.removeAttribute(attr.name);
    for (const [prop, v] of kept) child.style.setProperty(prop, v);
    if (fontColor && COLOR_RE.test(fontColor)) child.setAttribute('color', fontColor);
    if (tag === 'A' && /^https?:\/\//i.test(href)) {
      child.setAttribute('href', href);
      child.setAttribute('target', '_blank');
      child.setAttribute('rel', 'noopener noreferrer');
    }
  }
}

/** 回傳過濾後、可以安全放進 innerHTML 的備註 HTML。 */
export function sanitizeNoteHtml(html) {
  if (!html) return '';
  const doc = new DOMParser().parseFromString(`<body>${html}</body>`, 'text/html');
  cleanNode(doc.body);
  return doc.body.innerHTML;
}
