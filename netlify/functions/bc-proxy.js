// Proxy for Book Club app — fetches HTML and patches for mobile iframe embed.
// Changes applied:
//   • <base href> so root-relative URLs resolve against the Book Club domain
//   • Mobile CSS: sidebar becomes a slide-in drawer (not hidden) + full-width layout
//   • Injected JS: backdrop to close drawer, auto-navigate to current session by date
//   • Removes service-worker registration

const BC_URL = 'https://app.inglessemroteiro.com.br/';

exports.handler = async () => {
  const headers = {
    'Content-Type': 'text/html; charset=utf-8',
    'Access-Control-Allow-Origin': '*',
    'Cache-Control': 'public, max-age=300',
  };

  try {
    const res = await fetch(BC_URL, { redirect: 'follow' });
    if (!res.ok) throw new Error('upstream ' + res.status);
    let html = await res.text();

    // 1. Base href
    html = html.replace('<head>', '<head>\n<base href="' + BC_URL + '">');

    // 2. Mobile CSS — sidebar becomes a slide-in drawer triggered by Sessions button
    const mobileCSS = `
<style id="isr-embed-overrides">
@media (max-width: 520px) {
  /* ── Layout ── */
  .main        { margin-left: 0 !important; padding: 20px 0 80px !important; }
  .main-inner  { padding: 0 18px !important; max-width: 100% !important; }
  .topbar      { position: relative !important; top: auto !important; left: auto !important; right: auto !important; }
  .layout      { margin-top: 0 !important; }
  .arrow-prev  { left: 6px !important; }
  .arrow-next  { right: 6px !important; }
  .slide-wrapper { min-height: 60vh !important; }
  .closing-cards { grid-template-columns: 1fr !important; }

  /* ── Sidebar: hidden off-screen, slides in when .drawer-open ── */
  .sidebar {
    position: fixed !important;
    top: 0 !important; bottom: 0 !important;
    left: -105% !important;
    width: 82% !important; max-width: 300px !important;
    z-index: 500 !important;
    transition: left 0.28s cubic-bezier(0.32,0.72,0,1) !important;
    box-shadow: 4px 0 24px rgba(0,0,0,0.18) !important;
    overflow-y: auto !important;
  }
  .sidebar.drawer-open {
    left: 0 !important;
  }

  /* ── Backdrop ── */
  #bc-drawer-backdrop {
    display: none;
    position: fixed; inset: 0;
    background: rgba(0,0,0,0.38);
    z-index: 499;
    animation: bcFadeIn 0.2s ease;
  }
  #bc-drawer-backdrop.visible { display: block; }
  @keyframes bcFadeIn { from { opacity:0; } to { opacity:1; } }
}
</style>`;
    html = html.replace('</head>', mobileCSS + '\n</head>');

    // 3. Injected JS — drawer toggle + auto-navigate to current session
    const injectedJS = `
<div id="bc-drawer-backdrop"></div>
<script>
(function(){
  // ── Drawer: intercept any click that shows/hides .sidebar ──────
  // The Sessions button does sidebar.style.display = 'block' or similar.
  // We override that by watching for display changes via MutationObserver
  // and toggling our own class instead.
  function openDrawer() {
    var s = document.querySelector('.sidebar');
    var b = document.getElementById('bc-drawer-backdrop');
    if (s) s.classList.add('drawer-open');
    if (b) b.classList.add('visible');
  }
  function closeDrawer() {
    var s = document.querySelector('.sidebar');
    var b = document.getElementById('bc-drawer-backdrop');
    if (s) { s.classList.remove('drawer-open'); s.style.display = ''; }
    if (b) b.classList.remove('visible');
  }

  // Backdrop click closes drawer
  document.getElementById('bc-drawer-backdrop').addEventListener('click', closeDrawer);

  // Watch for the Sessions button — it's the topbar button with "Sessions" text
  // Intercept its click and open our drawer instead
  document.addEventListener('click', function(e) {
    var btn = e.target.closest('.topbar-book-btn, [onclick*="sidebar"], [onclick*="Sidebar"]');
    if (btn) {
      e.preventDefault(); e.stopPropagation();
      var s = document.querySelector('.sidebar');
      if (s && s.classList.contains('drawer-open')) closeDrawer();
      else openDrawer();
      return;
    }
    // Clicking a sidebar item closes drawer on mobile
    var sItem = e.target.closest('.sidebar-item');
    if (sItem) { setTimeout(closeDrawer, 180); }
  }, true);

  // Also intercept direct style.display changes on .sidebar
  var sidebar = document.querySelector('.sidebar');
  if (sidebar) {
    var origDisplay = Object.getOwnPropertyDescriptor(CSSStyleDeclaration.prototype, 'display');
    // Simpler: use MutationObserver on style attribute
    var obs = new MutationObserver(function(muts) {
      muts.forEach(function(m) {
        if (m.attributeName === 'style') {
          var s = m.target;
          if (s.style.display === 'block' || s.style.display === 'flex') {
            s.style.display = '';
            openDrawer();
          } else if (s.style.display === 'none' && s.classList.contains('drawer-open')) {
            s.style.display = '';
            closeDrawer();
          }
        }
      });
    });
    obs.observe(sidebar, { attributes: true });
  }

  // ── Auto-navigate to current session ──────────────────────────
  // Sessions have date chips like "Thursday, May 7" — find the one
  // closest to today and click it.
  function autoSelectSession() {
    var items = document.querySelectorAll('.sidebar-item:not(.locked)');
    if (!items.length) return;

    var today = new Date();
    today.setHours(0, 0, 0, 0);
    var best = null, bestDiff = Infinity;

    items.forEach(function(item) {
      // Try to find a date string inside the item (chip or data attribute)
      var dateText = (item.querySelector('.s-chip, .si-chapter, [data-date]') || item).textContent;
      var parsed = new Date(dateText);
      if (!isNaN(parsed)) {
        var diff = Math.abs(parsed - today);
        if (diff < bestDiff) { bestDiff = diff; best = item; }
      }
    });

    // If no date parsing worked, just click the last unlocked item
    // (most recent session available)
    var target = best || items[items.length - 1];
    if (target) target.click();
  }

  // Run after the page JS has built the sidebar
  window.addEventListener('load', function() {
    setTimeout(autoSelectSession, 300);
  });
})();
<\/script>`;
    html = html.replace('</body>', injectedJS + '\n</body>');

    // 4. Remove service-worker registration
    html = html.replace(
      /if\s*\(\s*'serviceWorker'\s*in\s*navigator\s*\)\s*\{[\s\S]*?\.catch\(console\.error\);\s*\}/,
      '/* service worker disabled in embed mode */'
    );

    return { statusCode: 200, headers, body: html };
  } catch (err) {
    console.error('bc-proxy error:', err);
    return {
      statusCode: 502,
      headers: { 'Content-Type': 'text/html' },
      body: '<p style="font-family:sans-serif;padding:24px;color:#555">Não foi possível carregar o Book Club agora. <a href="https://app.inglessemroteiro.com.br/" target="_blank">Abrir em nova aba →</a></p>',
    };
  }
};
