// Quinto verificador: quanto das telas ainda escreve o componente à
// mão em vez de usar a classe.
//
// As classes de isr-componentes.css só entram num elemento que já
// declara todas as propriedades da classe — é essa regra que garante
// que a troca não muda pixel. O preço dela é que sobra uma lista: os
// elementos que não declaram alguma das propriedades e por isso
// ficaram de fora. Esta lista não é dívida inventada; cada item é um
// lugar onde a tela está diferente das outras sem querer. Um botão sem
// font-family, por exemplo, aparece na fonte do navegador e não na
// fonte da escola.
//
//   node verificar-componentes.js            resumo
//   node verificar-componentes.js --fora     a lista, com tela e trecho
const fs = require('fs');

const CLASSES = {
  'isr-botao': [
    ['font-family', ['inherit']],
    ['font-weight', ['600', 'var(--font-weight-semibold)']],
    ['border', ['none', '0', '0px']],
    ['border-radius', ['999px', '9999px', 'var(--radius-full)']],
    ['cursor', ['pointer']]
  ],
  'isr-cartao': [
    ['background', ['var(--color-neutral-0)']],
    ['border-radius', ['24px', '1.5rem', 'var(--radius-2xl)']]
  ],
  'isr-campo': [
    ['background', ['var(--color-button-secondary)']],
    ['border', ['0', 'none', '0px']],
    ['border-radius', ['12px', '0.75rem', 'var(--radius-lg)']],
    ['color', ['var(--color-primary-900)']],
    ['font-family', ['inherit']]
  ],
  'isr-selo': [
    ['border-radius', ['999px', '9999px', 'var(--radius-full)']],
    ['font-weight', ['600', 'var(--font-weight-semibold)']]
  ]
};
const CLASSE_DE = { botao: 'isr-botao', cartao: 'isr-cartao', campo: 'isr-campo', selo: 'isr-selo' };
const BRANCOS = ['var(--color-neutral-0)', '#fff', '#ffffff', 'white', 'var(--color-bg-primary)'];

function tags(s, nomes) {
  const out = [];
  for (let i = 0; i < s.length; i++) {
    if (s[i] !== '<') continue;
    const m = /^<([a-zA-Z][a-zA-Z0-9-]*)/.exec(s.slice(i, i + 24));
    if (!m || nomes.indexOf(m[1]) < 0) continue;
    let j = i + m[0].length, q = null;
    while (j < s.length) {
      const c = s[j];
      if (q) { if (c === q) q = null; }
      else if (c === '"' || c === "'") q = c;
      else if (c === '>') break;
      j++;
    }
    if (j >= s.length) continue;
    out.push({ nome: m[1], texto: s.slice(i, j + 1), linha: s.slice(0, i).split('\n').length });
    i = j;
  }
  return out;
}
const attr = (t, n) => { const m = new RegExp('\\s' + n + '="([^"]*)"').exec(t); return m ? m[1] : null; };
function propsDe(style) {
  const o = {};
  (style || '').split(';').forEach(d => {
    const i = d.indexOf(':');
    if (i > 0) o[d.slice(0, i).trim()] = d.slice(i + 1).trim();
  });
  return o;
}
function familia(nome, p) {
  if (nome === 'button') return 'botao';
  if (nome === 'input' || nome === 'select' || nome === 'textarea') return 'campo';
  if (nome === 'div' && BRANCOS.indexOf(p['background']) >= 0 && p['border-radius']) return 'cartao';
  if (nome === 'span' && /^9{3,4}px$/.test(p['border-radius'] || '')) return 'selo';
  return null;
}

const telas = fs.readdirSync('.').filter(f => /\.dc\.html$/.test(f))
  .filter(f => !/Gestao v3|Gestao v4|Gestao v5|Student Portal|Aluna v4/.test(f))
  .filter(f => fs.readFileSync(f, 'utf8').indexOf('_ds/ingles-sem-roteiro') >= 0).sort();

let comClasse = 0, fora = [], semFolha = [];
telas.forEach(f => {
  const s = fs.readFileSync(f, 'utf8');
  if (s.indexOf('isr-componentes.css') < 0) semFolha.push(f);
  const a = s.indexOf('<x-dc>'), b = s.indexOf('</x-dc>');
  const tpl = a >= 0 && b > a ? s.slice(a, b) : s;
  tags(tpl, ['button', 'input', 'select', 'textarea', 'div', 'span']).forEach(t => {
    const classes = (attr(t.texto, 'class') || '').split(/\s+/).filter(Boolean);
    // Um elemento convertido pode ter ficado sem style nenhum — a
    // classe cobria tudo que ele declarava. Então quem manda na
    // contagem é a classe, não o style.
    if (classes.some(c => /^isr-(botao|cartao|campo|selo)$/.test(c))) { comClasse++; return; }
    const style = attr(t.texto, 'style');
    if (!style) return;
    const p = propsDe(style);
    const fam = familia(t.nome, p);
    if (!fam) return;
    const falta = CLASSES[CLASSE_DE[fam]].filter(([q]) => p[q] === undefined).map(x => x[0]);
    fora.push({ tela: f, linha: t.linha, fam, falta, texto: t.texto.slice(0, 110) });
  });
});

const total = comClasse + fora.length;
console.log('componentes nas telas de gestão');
console.log('  com classe do componente: ' + comClasse + ' de ' + total
  + '  (' + Math.round(comClasse / total * 100) + '%)');
console.log('  escritos à mão:           ' + fora.length);
if (semFolha.length) {
  console.log('\nFALHA · telas sem a folha de componentes:');
  semFolha.forEach(f => console.log('    ' + f));
}

const porFalta = {};
fora.forEach(x => {
  const k = x.fam + ' sem ' + (x.falta.join(', ') || '(já tem tudo)');
  if (!porFalta[k]) porFalta[k] = [];
  porFalta[k].push(x);
});
console.log('\no que falta declarar em cada um:');
Object.keys(porFalta).sort((a, b) => porFalta[b].length - porFalta[a].length).forEach(k => {
  console.log('   ×' + String(porFalta[k].length).padStart(3) + '  ' + k);
  if (process.argv[2] === '--fora') {
    porFalta[k].forEach(x => console.log('          ' + x.tela + ':' + x.linha + '  ' + x.texto.replace(/\s+/g, ' ')));
  }
});
process.exit(semFolha.length ? 1 : 0);
