// src/components/FilterBar.js
//
// 觸控裝置（手機、平板）的收合式篩選 (2026-09-27)。
// 電腦（有滑鼠游標）完全不受影響：這條列預設帶 hidden 屬性，只有
// components.css 裡「沒有滑鼠、用手指點」的 media query 才會把它顯示
// 出來；後台沒有那段 CSS，所以後台一律看不到、也不會搬動篩選欄。
//
// 顯示時：
//   - 原本的篩選欄（.fg-sidebar）搬進這條列下方的下拉區，平常收起來，
//     卡片直接接在這條列下面。
//   - 「篩選」點一下往下展開（蓋在卡片上、自己可以捲動），再點一下收回。
//   - 有選條件時：按鈕變成「篩選（N）」金色字，左邊多一顆「清空」；
//     平板寬度（>600px）另外多一行小字列出選了什麼，最多兩行。
const TOUCH_QUERY = '(hover: none) and (pointer: coarse)';

/**
 * @param {HTMLElement} sidebar - mountFilterPanel 掛上去的那個 .fg-sidebar
 * @param {Object} [opts]
 * @param {string} [opts.noteHtml] - 列左邊的小字說明（卡片資料庫用）；不傳的話
 *   條件摘要改放在按鈕左邊同一行
 * @returns {{ el: HTMLElement, update: (panel:Object) => void, setNote: (html:string) => void }}
 */
export function createFilterBar(sidebar, opts = {}) {
  const bar = document.createElement('div');
  bar.className = 'fbar';
  bar.hidden = true;

  const row = document.createElement('div');
  row.className = 'fbar-row';
  const summary = document.createElement('div');
  summary.className = 'fbar-summary';
  summary.hidden = true;
  const note = document.createElement('div');
  note.className = 'fbar-note';
  if (opts.noteHtml) note.innerHTML = opts.noteHtml;
  const clearBtn = document.createElement('button');
  clearBtn.type = 'button';
  clearBtn.className = 'fbar-btn fbar-clear';
  clearBtn.textContent = '清空';
  clearBtn.hidden = true;
  const toggleBtn = document.createElement('button');
  toggleBtn.type = 'button';
  toggleBtn.className = 'fbar-btn fbar-toggle';
  toggleBtn.textContent = '篩選';
  toggleBtn.setAttribute('aria-expanded', 'false');
  row.append(note, clearBtn, toggleBtn);

  const drop = document.createElement('div');
  drop.className = 'fbar-drop';

  // 沒有說明文字（選卡視窗）時，條件摘要直接放在按鈕左邊同一行
  if (opts.noteHtml === undefined) {
    note.remove();
    row.insertBefore(summary, clearBtn);
    bar.append(row, drop);
  } else {
    bar.append(row, summary, drop);
  }

  const home = { parent: null, next: null };
  let panelRef = null;
  const mql = window.matchMedia(TOUCH_QUERY);
  const isShown = () => bar.isConnected && getComputedStyle(bar).display !== 'none';

  // 篩選欄放在哪裡：觸控模式搬進下拉區，否則放回原位。
  function place() {
    if (isShown()) {
      if (sidebar.parentNode !== drop) {
        home.parent = sidebar.parentNode;
        home.next = sidebar.nextSibling;
        drop.appendChild(sidebar);
      }
    } else if (sidebar.parentNode === drop && home.parent) {
      home.parent.insertBefore(sidebar, home.next);
      setOpen(false);
    }
  }
  mql.addEventListener('change', place);

  function fitDrop() {
    // 展開時最多到畫面（或選卡視窗）底部，面板自己捲動
    const box = bar.closest('.modal-body');
    const bottom = box ? box.getBoundingClientRect().bottom : window.innerHeight;
    drop.style.maxHeight = Math.max(160, Math.floor(bottom - bar.getBoundingClientRect().bottom - 8)) + 'px';
  }
  function setOpen(open) {
    bar.classList.toggle('is-open', open);
    toggleBtn.setAttribute('aria-expanded', String(open));
    if (open) fitDrop();
  }
  toggleBtn.addEventListener('click', () => {
    place();
    setOpen(!bar.classList.contains('is-open'));
  });
  clearBtn.addEventListener('click', () => { if (panelRef) panelRef.reset(); });
  window.addEventListener('resize', () => { if (bar.classList.contains('is-open')) fitDrop(); });

  function update(panel) {
    panelRef = panel;
    const n = panel.getActiveCount();
    toggleBtn.textContent = n > 0 ? `篩選（${n}）` : '篩選';
    toggleBtn.classList.toggle('is-active', n > 0);
    clearBtn.hidden = n === 0;
    const labels = panel.getActiveLabels();
    summary.textContent = labels.join('、');
    summary.hidden = labels.length === 0;
    // 第一次有畫面時才判斷得出是不是觸控模式（要等列放進頁面、套上 CSS）
    requestAnimationFrame(place);
  }

  return {
    el: bar,
    update,
    setNote: (html) => { note.innerHTML = html; },
  };
}
