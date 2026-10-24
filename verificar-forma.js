// Fotografa a FORMA computada de cada elemento de cada tela: a caixa,
// o canto, a borda, o espaçamento interno, a tipografia e a sombra.
//
// O verificador de cores prova que trocar hexadecimal por token não
// muda cor. Não prova nada sobre forma — e trocar estilo repetido por
// classe de componente mexe em borda, canto, fonte e peso. Este é o
// instrumento desse passo: a mesma foto da forma, antes e depois.
//
//   node verificar-forma.js antes.json
//   node verificar-forma.js depois.json
//   node verificar-forma.js --diff antes.json depois.json
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
  let iguais = 0, difs = [];
  Object.keys(a).forEach(tela => {
    if (!b[tela]) { difs.push(tela + ': desapareceu da segunda foto'); return; }
    if (a[tela].n !== b[tela].n) {
      difs.push(tela + ': número de elementos mudou (' + a[tela].n + ' → ' + b[tela].n + ')');
      return;
    }
    const idx = a[tela].formas.map((f, i) => i).filter(i => a[tela].formas[i] !== b[tela].formas[i]);
    if (idx.length) {
      difs.push(tela + ': ' + idx.length + ' elemento(s) com forma diferente');
      idx.slice(0, 4).forEach(i => difs.push('      ' + a[tela].formas[i]
        + '\n        →  ' + b[tela].formas[i]));
    } else iguais++;
  });
  console.log(iguais + ' tela(s) idênticas, ' + difs.filter(d => /:\s\d+ elemento|desapareceu|número/.test(d)).length + ' com diferença');
  difs.forEach(x => console.log('  ' + x));
  process.exit(difs.length ? 1 : 0);
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
    try {
      await p.goto('http://localhost:8899/' + encodeURIComponent(tela));
      await p.waitForTimeout(3000);
      const r = await p.evaluate(() => {
        const m = document.querySelector('main');
        if (!m) return { n: 0, formas: [] };
        const els = [m].concat([...m.querySelectorAll('*')]);
        const r2 = v => Math.round(v * 2) / 2;   // meio pixel: o arredondamento do navegador
        // Um canto maior que a metade do lado menor vira pílula, e o
        // navegador desenha a mesma pílula para 999px e para 9999px.
        // Registrar o número cru faria o verificador acusar diferença
        // onde não há nenhuma na tela, e um instrumento que acusa o
        // que não existe não serve para o passo seguinte.
        const canto = (v, b) => {
          const px = parseFloat(v);
          if (!isFinite(px) || /%/.test(v)) return v;
          return px >= Math.min(b.width, b.height) / 2 && px > 0 ? 'pílula' : v;
        };
        return { n: els.length, formas: els.map(e => {
          const cs = getComputedStyle(e), b = e.getBoundingClientRect();
          return e.tagName.toLowerCase()
            + ' caixa=' + [r2(b.width), r2(b.height)].join('×')
            + ' canto=' + [cs.borderTopLeftRadius, cs.borderTopRightRadius,
                           cs.borderBottomRightRadius, cs.borderBottomLeftRadius]
                          .map(v => canto(v, b)).join('/')
            + ' borda=' + cs.borderTopWidth + ' ' + cs.borderTopStyle
                        + '|' + cs.borderLeftWidth + ' ' + cs.borderLeftStyle
            + ' dentro=' + [cs.paddingTop, cs.paddingRight, cs.paddingBottom, cs.paddingLeft].join('/')
            + ' fonte=' + cs.fontFamily.split(',')[0].replace(/"/g, '')
                        + ' ' + cs.fontSize + ' ' + cs.fontWeight
            + ' cursor=' + cs.cursor
            + ' sombra=' + cs.boxShadow.slice(0, 48);
        }) };
      });
      out[tela] = r;
      process.stdout.write('.');
    } catch (e) {
      out[tela] = { n: -1, formas: [], erro: String(e).slice(0, 80) };
      process.stdout.write('x');
    }
  }
  console.log('');
  fs.writeFileSync(process.argv[2], JSON.stringify(out));
  const tot = Object.keys(out).reduce((t, k) => t + out[k].n, 0);
  console.log(TELAS.length + ' telas, ' + tot + ' elementos fotografados → ' + process.argv[2]);
  await b.close();
})().catch(e => { console.error('FATAL', String(e).slice(0, 400)); process.exit(2); });
