/* ════════════════════════════════════════════════════════════════
   ISR — conferência de contraste
   ----------------------------------------------------------------
   Mexer em cor em massa pode deixar texto ilegível, e isso não
   aparece numa lista de arquivos alterados. Este script mede o
   contraste de cada texto da tela contra o fundo em que ele está, de
   verdade: sobe na árvore até achar o fundo que vale, como o olho faz.

   Serve para comparar antes e depois de uma mudança de cor, e aponta
   só o que PIOROU — não o que já era ruim antes, que é outra
   conversa.

   O mínimo é 4,5:1, que é o que a norma pede para texto corrido.

   Uso:
     node verificar-contraste.js antes.json      (com as cores antigas)
     node verificar-contraste.js depois.json     (com as novas)
     node verificar-contraste.js --diff antes.json depois.json

   Precisa do servidor local em pé:
     setsid http-server -p 8899 -s .
   ════════════════════════════════════════════════════════════════ */
const { chromium } = require('playwright'); const PREP = require('./testes/preparar.js'); const fs = require('fs'), path = require('path');
const PKG = process.env.ISR_CDN || (__dirname + '/testes/node_modules');
const MAP = { 'react@18.3.1/umd/react.development.js': 'react/umd/react.development.js', 'react-dom@18.3.1/umd/react-dom.development.js': 'react-dom/umd/react-dom.development.js', 'react@18.3.1/umd/react.production.min.js': 'react/umd/react.production.min.js', 'react-dom@18.3.1/umd/react-dom.production.min.js': 'react-dom/umd/react-dom.production.min.js' };

const TELAS = fs.readdirSync('.')
  .filter(f => /\.dc\.html$/.test(f))
  .filter(f => !/Gestao v3|Gestao v4|Gestao v5|Student Portal/.test(f))
  .filter(f => fs.readFileSync(f, 'utf8').indexOf('_ds/ingles-sem-roteiro') >= 0)
  .sort();

if (process.argv[2] === '--diff') {
  const a = JSON.parse(fs.readFileSync(process.argv[3], 'utf8'));
  const b = JSON.parse(fs.readFileSync(process.argv[4], 'utf8'));
  let piorou = [], melhorou = 0, igual = 0;
  Object.keys(a).forEach(tela => {
    (a[tela] || []).forEach((item, i) => {
      const dep = (b[tela] || [])[i];
      if (!dep || dep.txt !== item.txt) return;
      if (dep.r < item.r - 0.05) {
        // só conta como problema se cruzou para baixo do mínimo legível
        if (dep.r < 4.5 && item.r >= 4.5) piorou.push({ tela, ...dep, antes: item.r });
      } else if (dep.r > item.r + 0.05) melhorou++;
      else igual++;
    });
  });
  console.log('textos conferidos: ' + (piorou.length + melhorou + igual));
  console.log('  melhoraram: ' + melhorou + ' · iguais: ' + igual);
  console.log('  PASSARAM A FICAR ABAIXO DE 4,5:1: ' + piorou.length);
  piorou.sort((x, y) => x.r - y.r).slice(0, 25).forEach(x => {
    console.log('   ' + x.r.toFixed(2) + ':1 (era ' + x.antes.toFixed(2) + ')  ' + x.fg + ' sobre ' + x.bg
      + '  ·  ' + x.tela.replace('ISR - ', '').replace(' v3.dc.html', '')
      + '  ·  "' + x.txt.slice(0, 40) + '"');
  });
  process.exit(0);
}

(async () => {
  const b = await chromium.launch({ executablePath: PREP.acharChromium() });
  const ctx = await b.newContext({ viewport: { width: 1280, height: 1400 } });
  await ctx.route('**/unpkg.com/**', r => { const u = r.request().url(); for (const k of Object.keys(MAP)) if (u.indexOf(k) >= 0) return r.fulfill({ body: fs.readFileSync(path.join(PKG, MAP[k])), contentType: 'application/javascript' }); return r.abort(); });
  await ctx.route('**/script.google.com/**', r => r.abort());
  await ctx.route('**/fonts.googleapis.com/**', r => r.abort());
  await ctx.addInitScript(() => { try {
    localStorage.setItem('isr_exemplo_v1', '1');
    localStorage.setItem('isr_gestao_user', JSON.stringify({ nome: 'Gabi', perfil: 'gestora', papeis: ['gestora'] }));
  } catch (e) {} });
  const p = await ctx.newPage();
  const out = {};
  for (const tela of TELAS) {
    await p.goto('http://localhost:8899/' + encodeURIComponent(tela));
    await p.waitForTimeout(3000);
    out[tela] = await p.evaluate(() => {
      const lum = (c) => {
        const m = c.match(/\d+(\.\d+)?/g) || [0, 0, 0];
        const f = v => { v = +v / 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
        return 0.2126 * f(m[0]) + 0.7152 * f(m[1]) + 0.0722 * f(m[2]);
      };
      // o fundo efetivo: sobe na árvore até achar um que não seja transparente
      const fundo = (el) => {
        let e = el;
        while (e) {
          const bg = getComputedStyle(e).backgroundColor;
          if (bg && bg !== 'rgba(0, 0, 0, 0)' && bg !== 'transparent') return bg;
          e = e.parentElement;
        }
        return 'rgb(255, 255, 255)';
      };
      const m = document.querySelector('main');
      if (!m) return [];
      return [...m.querySelectorAll('*')]
        .filter(e => {
          const t = [...e.childNodes].filter(n => n.nodeType === 3)
            .map(n => n.textContent.trim()).join(' ').trim();
          return t.length > 1;
        })
        .map(e => {
          const t = [...e.childNodes].filter(n => n.nodeType === 3)
            .map(n => n.textContent.trim()).join(' ').trim();
          const fg = getComputedStyle(e).color, bg = fundo(e);
          const l1 = lum(fg), l2 = lum(bg);
          const r = (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
          return { txt: t.slice(0, 60), fg, bg, r };
        });
    });
    process.stdout.write('.');
  }
  console.log('');
  fs.writeFileSync(process.argv[2], JSON.stringify(out));
  const n = Object.keys(out).reduce((t, k) => t + out[k].length, 0);
  console.log(n + ' textos medidos → ' + process.argv[2]);
  await b.close();
})().catch(e => { console.error('FATAL', String(e).slice(0, 400)); process.exit(2); });
