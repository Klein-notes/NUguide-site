// src/core/visitCounter.js
//
// 瀏覽統計 (2026-10-01)。用免費、免註冊的 Hits Counter (hitscounter.dev)
// 記數，後台「瀏覽統計」頁讀出來看。
//
// 算的是「裝置（瀏覽器）」不是「次數」：同一台裝置一天內不管開幾次、逛
// 幾頁，同一個項目只記 1 次——記過的項目寫在這台裝置的 localStorage，
// 隔天（台灣時間）重新開始。不會在網址加任何追蹤碼，也不存任何個人資料，
// 只有「今天記過哪些項目」這張清單留在玩家自己的瀏覽器裡。
//
// 記哪些項目（後台 visitStatsAdmin.js 用一樣的名稱讀）：
//   site/day        每台裝置每天 1 次 → 每日訪客
//   site/new        每台裝置第一次來時 1 次 → 累計訪客、每日新訪客
//   page/<頁面>     每台裝置每天每種頁面 1 次 → 各頁人數
//   stage/<關卡id>  每台裝置每天每一關 1 次 → 各關人數
//   src/<來源>      每台裝置每天 1 次，記當天第一次進站的來源
//   region/<地區>   每台裝置每天 1 次，用瀏覽器的「時區設定」判斷地區
//                   （不用 IP、不送出任何位置資料）
//
// 不記的情況：
//   - 不是正式網站（github.io）——本機測試、後台預覽都不算
//   - 這個瀏覽器打開過「網址?nocount=1」（站主自己），「?nocount=0」取消
export const COUNTER_NS = 'https://nuguide-stats.invalid/v1/';
const HIT_API = 'https://hitscounter.dev/api/hit';
const TZ = 'Asia/Taipei';
const STORE_KEY = 'nuguideVisits';
const NOCOUNT_KEY = 'nuguideNoCount';

function readStore() {
  try { return JSON.parse(localStorage.getItem(STORE_KEY)) || {}; } catch { return {}; }
}
function writeStore(s) {
  try { localStorage.setItem(STORE_KEY, JSON.stringify(s)); } catch { /* 無痕模式等存不了就算了 */ }
}
function todayInTaipei() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: TZ }).format(new Date()); // 2026-10-01
}

// 當天第一次進站的來源：先看是哪個 App 的內建瀏覽器，再看從哪個網站點過來
function detectSource() {
  const ua = navigator.userAgent || '';
  if (/\bLine\//i.test(ua)) return 'line';
  if (/Plurk/i.test(ua)) return 'plurk';
  if (/FBAN|FBAV|FB_IAB/.test(ua)) return 'facebook';
  if (/Instagram/i.test(ua)) return 'instagram';
  if (/Discord/i.test(ua)) return 'discord';
  if (/Threads|Barcelona/i.test(ua)) return 'threads';
  let host = '';
  try { host = document.referrer ? new URL(document.referrer).hostname : ''; } catch { host = ''; }
  if (!host) return 'direct';
  if (host === location.hostname) return 'direct';
  if (/(^|\.)plurk\.com$/.test(host)) return 'plurk';
  if (/(^|\.)google\./.test(host)) return 'google';
  if (/(^|\.)bing\.com$/.test(host)) return 'bing';
  if (/(^|\.)(facebook|fb)\.com$/.test(host)) return 'facebook';
  if (/(^|\.)instagram\.com$/.test(host)) return 'instagram';
  if (/(^|\.)(x|twitter)\.com$|^t\.co$/.test(host)) return 'x';
  if (/(^|\.)discord(app)?\.com$/.test(host)) return 'discord';
  if (/(^|\.)line\.me$/.test(host)) return 'line';
  if (/(^|\.)threads\.net$/.test(host)) return 'threads';
  if (/(^|\.)gamer\.com\.tw$/.test(host)) return 'bahamut';
  return 'other';
}

// 地區：用瀏覽器的時區設定判斷（例如 Asia/Taipei → 台灣），不需要 IP。
// 手動改過時區、或人在國外沒換時區的會被歸錯，只能當大概的參考。
const REGION_BY_TZ = {
  'Asia/Taipei': 'tw',
  'Asia/Hong_Kong': 'hk',
  'Asia/Macau': 'mo',
  'Asia/Shanghai': 'cn', 'Asia/Chongqing': 'cn', 'Asia/Chungking': 'cn', 'Asia/Harbin': 'cn', 'Asia/Urumqi': 'cn', 'PRC': 'cn',
  'Asia/Tokyo': 'jp', 'Japan': 'jp',
  'Asia/Seoul': 'kr',
  'Asia/Singapore': 'sg',
  'Asia/Kuala_Lumpur': 'my', 'Asia/Kuching': 'my',
};
function detectRegion() {
  let tz = '';
  try { tz = Intl.DateTimeFormat().resolvedOptions().timeZone || ''; } catch { tz = ''; }
  if (REGION_BY_TZ[tz]) return REGION_BY_TZ[tz];
  if (tz.startsWith('America/')) return 'americas';
  if (tz.startsWith('Europe/')) return 'europe';
  if (tz.startsWith('Australia/') || tz.startsWith('Pacific/Auckland')) return 'oceania';
  if (tz.startsWith('Asia/')) return 'asia-other';
  return 'other';
}

function hit(key) {
  const url = `${HIT_API}?url=${encodeURIComponent(COUNTER_NS + key)}&tz=${encodeURIComponent(TZ)}&output=json`;
  return fetch(url, { mode: 'cors', credentials: 'omit', keepalive: true }).then((r) => r.ok);
}

/**
 * 每一頁打開時呼叫一次（Navbar.js 的 mountNavbar 裡）。不會擋住頁面，
 * 失敗（例如計數服務掛了）就安靜跳過，下次再試。
 * @param {string} current - 頁面檔名，例如 'cards.html'
 */
export function trackVisit(current) {
  try {
    const params = new URLSearchParams(location.search);
    if (params.get('nocount') === '1' || params.get('nocount') === '0') {
      try {
        if (params.get('nocount') === '1') localStorage.setItem(NOCOUNT_KEY, '1');
        else localStorage.removeItem(NOCOUNT_KEY);
      } catch { /* ignore */ }
      import('./toast.js').then(({ showToast }) => showToast(params.get('nocount') === '1'
        ? '這個瀏覽器之後不會計入瀏覽統計'
        : '這個瀏覽器已恢復計入瀏覽統計'));
    }
    if (!/\.github\.io$/.test(location.hostname)) return;
    try { if (localStorage.getItem(NOCOUNT_KEY) === '1') return; } catch { /* ignore */ }

    const page = (location.pathname.split('/').pop() || 'index.html').replace(/\.html$/, '') || 'index';
    const store = readStore();
    const today = todayInTaipei();
    if (store.day !== today) { store.day = today; store.seen = {}; }
    store.seen = store.seen || {};

    // 每個項目在「今天記過的清單」裡用的名字；來源不管是哪一種，一天只記
    // 一次（當天第一次進站的來源），所以共用 'src'
    const markOf = (key) => (key.startsWith('src/') ? 'src' : key.startsWith('region/') ? 'region' : key);
    const keys = ['site/day', `src/${detectSource()}`, `region/${detectRegion()}`, `page/${page}`];
    if (page === 'stage-detail') {
      const id = params.get('id');
      if (id) keys.push(`stage/${id}`);
    }
    if (!store.ever) keys.push('site/new');

    for (const key of keys) {
      const mark = markOf(key);
      if (key !== 'site/new' && store.seen[mark]) continue;
      hit(key).then((ok) => {
        if (!ok) return;
        const s = readStore();
        if (s.day !== today) { s.day = today; s.seen = {}; }
        s.seen = s.seen || {};
        if (key === 'site/new') s.ever = true;
        else s.seen[mark] = true;
        writeStore(s);
      }).catch(() => {});
    }
  } catch { /* 統計失敗不能影響網站本身 */ }
}
