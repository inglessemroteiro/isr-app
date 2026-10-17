// Fotografa a cor computada de cada elemento de cada tela. Serve para
// provar que trocar hexadecimal por token não muda pixel nenhum: a
// mesma foto, antes e depois.
//
//   node cores-snapshot.js antes.json
//   node cores-snapshot.js depois.json
//   node cores-snapshot.js --diff antes.json depois.json
const { chromium } = require('playwright'); const fs = require('fs'), path = require('path');
const PKG = process.env.ISR_CDN || (__dirname + '/cdnpkg/node_modules');
const MAP = { 'react@18.3.1/umd/react.development.js': 'react/umd/react.development.js', 'react-dom@18.3.1/umd/react-dom.development.js': 'react-dom/umd/react-dom.development.js', 'react@18.3.1/umd/react.production.min.js': 'react/umd/react.production.min.js', 'react-dom@18.3.1/umd/react-dom.production.min.js': 'react-dom/umd/react-dom.production.min.js' };

const TELAS = fs.readdirSync('.')
  .filter(f => /\.dc\.html$/.test(f))
  .filter(f => !/Gestao v3|Gestao v4|Gestao v5|Student Portal/.test(f))
  .filter(f => fs.readFileSync(f, 'utf8').indexOf('_ds/ingles-sem-roteiro') >= 0)
  .sort();

if (process.argv[2] === '--diff') {
  const a = JSON.parse(fs.readFileSync(process.argv[3], 'utf8'));
  const b = JSON.parse(fs.readFileSync(process.argv[4], 'utf8'));
  let iguais = 0, difs = [];
  Object.keys(a).forEach(tela => {
    if (!b[tela]) { difs.push(tela + ': desapareceu da segunda foto'); return; }
    if (a[tela].n !== b[tela].n) {
      difs.push(tela + ': número de elementos mudou (' + a[tela].n + ' → ' + b[tela].n + ')');
      return;
    }
    const d = a[tela].cores.filter((c, i) => c !== b[tela].cores[i]);
    if (d.length) {
      difs.push(tela + ': ' + d.length + ' elemento(s) com cor diferente · ex. '
        + d.slice(0, 3).join(' | ') + '  →  '
        + b[tela].cores.filter((c, i) => a[tela].cores[i] !== c).slice(0, 3).join(' | '));
    } else iguais++;
  });
  console.log(iguais + ' tela(s) idênticas, ' + difs.length + ' com diferença');
  difs.forEach(x => console.log('  ' + x));
  process.exit(difs.length ? 1 : 0);
}

(async () => {
  const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
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
    try {
      await p.goto('http://localhost:8899/' + encodeURIComponent(tela));
      await p.waitForTimeout(3000);
      const r = await p.evaluate(() => {
        const m = document.querySelector('main');
        if (!m) return { n: 0, cores: [] };
        const els = [m].concat([...m.querySelectorAll('*')]);
        return { n: els.length, cores: els.map(e => {
          const cs = getComputedStyle(e);
          return cs.color + '/' + cs.backgroundColor + '/' + cs.borderTopColor
            + '/' + cs.borderLeftColor + '/' + cs.boxShadow.slice(0, 40);
        }) };
      });
      out[tela] = r;
      process.stdout.write('.');
    } catch (e) {
      out[tela] = { n: -1, cores: [], erro: String(e).slice(0, 80) };
      process.stdout.write('x');
    }
  }
  console.log('');
  fs.writeFileSync(process.argv[2], JSON.stringify(out));
  const tot = Object.keys(out).reduce((t, k) => t + out[k].n, 0);
  console.log(TELAS.length + ' telas, ' + tot + ' elementos fotografados → ' + process.argv[2]);
  await b.close();
})().catch(e => { console.error('FATAL', String(e).slice(0, 400)); process.exit(2); });
