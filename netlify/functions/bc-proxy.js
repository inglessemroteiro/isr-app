// Proxy for Book Club app — fetches the HTML and patches it so it can
// be embedded as an iframe srcdoc without cross-origin issues.
// Changes applied:
//   • <base href> so root-relative URLs resolve against the Book Club domain
//   • Mobile-responsive CSS: hides sidebar below 500 px, removes fixed topbar
//   • Removes service-worker registration (fails in srcdoc context anyway)

const BC_URL = 'https://app.inglessemroteiro.com.br/';

exports.handler = async () => {
  const headers = {
    'Content-Type': 'text/html; charset=utf-8',
    'Access-Control-Allow-Origin': '*',
    // Cache for 5 minutes so repeated opens are fast
    'Cache-Control': 'public, max-age=300',
  };

  try {
    const res = await fetch(BC_URL, { redirect: 'follow' });
    if (!res.ok) throw new Error('upstream ' + res.status);
    let html = await res.text();

    // 1. Base href — makes root-relative paths (/.netlify/functions/…, /sw.js) resolve correctly
    html = html.replace('<head>', '<head>\n<base href="' + BC_URL + '">');

    // 2. Mobile-responsive CSS — hides sidebar, collapses layout for narrow iframe
    const mobileCSS = `
<style id="isr-embed-overrides">
/* ── Mobile overrides when embedded in ISR app ── */
@media (max-width: 520px) {
  /* Remove sidebar — no room on phone */
  .sidebar { display: none !important; }
  /* Main fills full width */
  .main { margin-left: 0 !important; padding: 20px 0 80px !important; }
  .main-inner { padding: 0 18px !important; max-width: 100% !important; }
  /* Topbar: no fixed positioning, acts as a normal block */
  .topbar { position: relative !important; top: auto !important;
            left: auto !important; right: auto !important; }
  /* Layout starts just below topbar */
  .layout { margin-top: 0 !important; }
  /* Arrow nav */
  .arrow-prev { left: 6px !important; }
  .arrow-next { right: 6px !important; }
  /* Slide wrapper */
  .slide-wrapper { min-height: 60vh !important; }
  /* Closing cards single column */
  .closing-cards { grid-template-columns: 1fr !important; }
}
</style>`;
    html = html.replace('</head>', mobileCSS + '\n</head>');

    // 3. Remove service-worker registration (fails silently in srcdoc, but avoids console errors)
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
