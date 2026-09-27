// src/components/Navbar.js
import { loadJSON, DataSources } from '../core/dataLoader.js';

// short：觸控裝置（手機、平板）顯示的短名稱 (2026-09-27)，讓五個選單
// 排得進一行；電腦照舊顯示完整名稱。切換由 components.css 決定。
const LINKS = [
  { href: 'index.html', label: '首頁' },
  { href: 'stages.html', label: '關卡攻略', short: '攻略' },
  { href: 'cards.html', label: '卡片資料庫', short: '卡片' },
  { href: 'my-teams.html', label: '我的隊伍' },
  { href: 'team-notes.html', label: '隊伍筆記', short: '筆記' },
];

const DEFAULT_SITE_TITLE = '新世界狂歡 | 關卡攻略筆記';

/**
 * Resolves the site title set on the admin's 網站設定 page, falling back
 * to the hardcoded default if the file is missing or the fetch fails —
 * so no caller needs its own try/catch around this. Cached by loadJSON,
 * so calling this from multiple pages/components costs one fetch total.
 */
export async function getSiteTitle() {
  try {
    const settings = await loadJSON(DataSources.siteSettings);
    return (settings && settings.siteTitle) || DEFAULT_SITE_TITLE;
  } catch {
    return DEFAULT_SITE_TITLE;
  }
}

export function renderNavbar(current) {
  const nav = document.createElement('div');
  nav.className = 'navbar';
  const inner = document.createElement('div');
  inner.className = 'navbar-inner';

  const brand = document.createElement('a');
  brand.href = 'index.html';
  brand.className = 'navbar-brand';
  brand.style.textDecoration = 'none';

  // Kept as its own element (not a bare text node) so the async update
  // below can target it by id without touching the "玩家攻略站" subtitle
  // next to it.
  const titleSpan = document.createElement('span');
  titleSpan.id = 'navbar-brand-title';
  titleSpan.textContent = DEFAULT_SITE_TITLE;
  const subtitleSpan = document.createElement('span');
  subtitleSpan.className = 'navbar-brand-sub';
  subtitleSpan.textContent = '玩家攻略站';
  brand.append(titleSpan, subtitleSpan);

  const links = document.createElement('div');
  links.className = 'navbar-links';
  for (const link of LINKS) {
    const a = document.createElement('a');
    a.href = link.href;
    if (link.short) {
      const full = document.createElement('span');
      full.className = 'nav-label-full';
      full.textContent = link.label;
      const short = document.createElement('span');
      short.className = 'nav-label-short';
      short.textContent = link.short;
      a.append(full, short);
      a.setAttribute('aria-label', link.label);
    } else {
      a.textContent = link.label;
    }
    if (link.href === current) a.classList.add('active');
    links.appendChild(a);
  }

  inner.append(brand, links);
  nav.appendChild(inner);
  return nav;
}

// 全站星空背景 (2026-09-11) — 只有純靜態的小星星（沒有會呼吸發光的那
// 幾顆，那個效果留給首頁自己專用），每頁呼叫 mountNavbar() 時順便掛上
// 去，不用每個頁面各自加。全部星星畫在同一個 div 的 box-shadow 清單
// 裡，不是一堆 DOM 元素，也完全沒有動畫，只畫一次、不會重繪，成本
// 幾乎可以忽略。首頁自己已經有一份更豐富的版本（含呼吸發光星星），
// 這裡偵測到首頁那份存在就跳過，不會疊加兩層。
function mountStaticStarfield() {
  if (document.getElementById('home-starfield')) return;
  if (document.querySelector('.site-starfield')) return;
  const field = document.createElement('div');
  field.className = 'site-starfield';
  const dots = [];
  for (let i = 0; i < 120; i++) {
    const x = Math.random() * 100;
    const y = Math.random() * 100;
    const alpha = 0.25 + Math.random() * 0.45;
    dots.push(`calc(${x}vw) calc(${y}vh) 0 rgba(255,255,255,${alpha.toFixed(2)})`);
  }
  const dotsLayer = document.createElement('div');
  dotsLayer.style.position = 'absolute';
  dotsLayer.style.width = '1px';
  dotsLayer.style.height = '1px';
  dotsLayer.style.boxShadow = dots.join(',');
  field.appendChild(dotsLayer);
  document.body.insertBefore(field, document.body.firstChild);
}

export function mountNavbar(current) {
  const host = document.getElementById('navbar-host');
  if (!host) return;
  const nav = renderNavbar(current);
  host.replaceWith(nav);
  mountStaticStarfield();
  // 導覽列的實際高度 → CSS 變數 --navbar-h，讓卡片資料庫的篩選列能
  // 剛好固定在導覽列正下方（導覽列高度會隨螢幕寬度、換行而變）。
  const setNavH = () => document.documentElement.style.setProperty('--navbar-h', nav.offsetHeight + 'px');
  setNavH();
  if (window.ResizeObserver) new ResizeObserver(setNavH).observe(nav);

  // Same siteTitle field the homepage's <h1> uses (edited from the
  // admin's 網站設定 page) — applied here too so the navbar brand, the
  // browser tab title, and the homepage heading always show the same
  // text. Fetched after the navbar is already on screen so a slow/
  // missing settings file never blocks or breaks the page; the
  // hardcoded text is the fallback everywhere.
  //
  // The tab-title part matters even on pages that never set
  // document.title themselves (stages.html/cards.html/my-teams.html —
  // their <title> is static HTML that always ends with the literal
  // default "流光秘境攻略"): this patches that trailing default to the
  // real site title. Pages that DO set their own document.title
  // dynamically (stage-detail.html) now call getSiteTitle() themselves
  // instead of hardcoding the default, so whichever of the two finishes
  // last still lands on the same correct value — no ordering race.
  getSiteTitle().then((siteTitle) => {
    const titleEl = document.getElementById('navbar-brand-title');
    if (titleEl) titleEl.textContent = siteTitle;
    if (document.title.endsWith(DEFAULT_SITE_TITLE)) {
      document.title = document.title.slice(0, -DEFAULT_SITE_TITLE.length) + siteTitle;
    }
  });
}

export function mountFooter() {
  const host = document.getElementById('footer-host');
  if (!host) return;
  const footer = document.createElement('div');
  footer.className = 'site-footer';
  footer.innerHTML = '<div class="container">攻略內容由站主維護 · 隊伍紀錄僅儲存於你的瀏覽器</div>';
  host.replaceWith(footer);
}
