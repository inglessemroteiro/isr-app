// Passo 3 — trocar o estilo repetido pelas classes de componente de
// isr-componentes.css. Roda sem argumento para simular e com
// --escrever para aplicar; --motivos lista por que cada elemento
// ficou de fora. Serve para as telas que ainda vão ser feitas.
//
// A conversão é desenhada para não mudar um pixel, e a prova é
// estrutural, não estatística:
//
//   1. a classe só entra num elemento que JÁ declara todas as
//      propriedades da classe — assim a classe nunca introduz uma
//      propriedade que o elemento não tinha (um <button> sem
//      font-family declarada, por exemplo, renderiza com a fonte do
//      sistema, e a classe mudaria isso);
//   2. uma declaração só sai do style quando o valor dela é
//      equivalente ao da classe (999px e var(--radius-full) são a
//      mesma pílula; border:0 e border:none a mesma ausência de
//      borda);
//   3. o que não é equivalente FICA no style, e sobrepõe a classe,
//      porque style inline vence classe no CSS.
//
// Depois disso o style do elemento guarda só o que é daquele uso. A
// verificação de cores confirma: 0 elementos mudaram.
const fs = require('fs');
const BASE = __dirname + '/';

// ── o scanner de tags ──
// um [^>]* não serve: o template tem {{ a > b }} dentro de atributo.
// Este caminha pela string respeitando as aspas.
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
    out.push({ ini: i, fim: j + 1, nome: m[1], texto: s.slice(i, j + 1) });
    i = j;
  }
  return out;
}
function atributo(texto, nome) {
  const re = new RegExp('\\s' + nome + '="([^"]*)"');
  const m = re.exec(texto);
  return m ? { valor: m[1], ini: m.index, fim: m.index + m[0].length } : null;
}
function propsDe(style) {
  const o = [];
  style.split(';').forEach(d => {
    const i = d.indexOf(':');
    if (i < 0) { if (d.trim()) o.push([null, d]); return; }
    o.push([d.slice(0, i).trim(), d.slice(i + 1).trim()]);
  });
  return o.filter(x => x[0]);
}

// ── as classes, e as grafias equivalentes de cada valor ──
const CLASSES = {
  'isr-botao': [
    ['font-family', ['inherit']],
    ['font-weight', ['600', 'var(--font-weight-semibold)']],
    ['border', ['none', '0', '0px']],
    ['border-radius', ['999px', '9999px', 'var(--radius-full)']],
    ['cursor', ['pointer']]
  ],
  'isr-botao--escuro': [
    ['background', ['var(--color-primary-900)']],
    ['color', ['var(--color-neutral-0)']],
    ['box-shadow', ['0 3px 0 var(--color-primary-950)']]
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
const BRANCOS = ['var(--color-neutral-0)', '#fff', '#ffffff', 'white', 'var(--color-bg-primary)'];

// a que família pertence o elemento
function familia(t, props) {
  const p = {}; props.forEach(([k, v]) => { p[k] = v; });
  if (t.nome === 'button') return 'botao';
  if (t.nome === 'input' || t.nome === 'select' || t.nome === 'textarea') return 'campo';
  if (t.nome === 'div' && BRANCOS.indexOf(p['background']) >= 0 && p['border-radius']) return 'cartao';
  if (t.nome === 'span' && /^9{3,4}px$/.test(p['border-radius'] || '')) return 'selo';
  return null;
}
const CLASSE_DE = { botao: 'isr-botao', cartao: 'isr-cartao', campo: 'isr-campo', selo: 'isr-selo' };

const relatorio = { convertidos: 0, jaConvertidos: 0, pulados: 0, declaracoesRemovidas: 0, porFamilia: {}, motivos: {} };
function conta(fam, chave) {
  if (!relatorio.porFamilia[fam]) relatorio.porFamilia[fam] = { convertidos: 0, pulados: 0, removidas: 0 };
  relatorio.porFamilia[fam][chave]++;
}

function converterTela(arquivo, escrever) {
  let s = fs.readFileSync(BASE + arquivo, 'utf8');
  const a = s.indexOf('<x-dc>'), b = s.indexOf('</x-dc>');
  if (a < 0 || b < 0) return;
  const antes = s.slice(0, a), tpl = s.slice(a, b), depois = s.slice(b);

  const achados = tags(tpl, ['button', 'input', 'select', 'textarea', 'div', 'span']);
  // de trás para frente, para os índices não andarem
  let novo = tpl;
  for (let i = achados.length - 1; i >= 0; i--) {
    const t = achados[i];
    const at = atributo(t.texto, 'style');
    if (!at) continue;
    const props = propsDe(at.valor);
    const fam = familia(t, props);
    if (!fam) continue;

    // Já convertido: a classe está lá. Sem isto uma segunda rodada
    // contaria os 718 convertidos como "deixados de fora", o que
    // assusta quem rodar depois numa tela nova.
    const cls = atributo(t.texto, 'class');
    if (cls && cls.valor.split(/\s+/).indexOf(CLASSE_DE[fam]) >= 0) {
      relatorio.jaConvertidos++; continue;
    }

    const decl = {}; props.forEach(([k, v]) => { decl[k] = v; });
    const aplicar = [];
    const base = CLASSES[CLASSE_DE[fam]];
    const temTudo = base.every(([p]) => decl[p] !== undefined);
    if (!temTudo) {
      conta(fam, 'pulados'); relatorio.pulados++;
      const falta = base.filter(([p]) => decl[p] === undefined).map(x => x[0]).join(',');
      relatorio.motivos[fam + ': sem ' + falta] = (relatorio.motivos[fam + ': sem ' + falta] || 0) + 1;
      continue;
    }
    aplicar.push(CLASSE_DE[fam]);
    // a variante escura só entra se os três valores batem exatamente:
    // dizer "escuro" e sobrepor o fundo por dentro seria mentir no nome
    if (fam === 'botao') {
      const v = CLASSES['isr-botao--escuro'];
      if (v.every(([p, ok]) => ok.indexOf(decl[p]) >= 0)) aplicar.push('isr-botao--escuro');
    }

    // o que sai do style
    const cobertas = {};
    aplicar.forEach(c => CLASSES[c].forEach(([p, ok]) => { if (ok.indexOf(decl[p]) >= 0) cobertas[p] = true; }));
    const resto = props.filter(([p]) => !cobertas[p]);
    const removidas = props.length - resto.length;
    relatorio.declaracoesRemovidas += removidas;
    relatorio.convertidos++;
    conta(fam, 'convertidos');
    relatorio.porFamilia[fam].removidas += removidas;

    // remonta a tag
    const classAt = atributo(t.texto, 'class');
    const classes = (classAt ? classAt.valor.split(/\s+/).filter(Boolean) : []).concat(aplicar);
    let texto = t.texto;
    const novoStyle = resto.map(([p, v]) => p + ': ' + v).join('; ');
    // substitui o style (ou remove se vazio)
    texto = texto.replace(/\sstyle="[^"]*"/, novoStyle ? ' style="' + novoStyle + '"' : '');
    if (classAt) texto = texto.replace(/\sclass="[^"]*"/, ' class="' + classes.join(' ') + '"');
    else texto = texto.replace(/^<([a-zA-Z][a-zA-Z0-9-]*)/, '<$1 class="' + classes.join(' ') + '"');

    novo = novo.slice(0, t.ini) + texto + novo.slice(t.fim);
  }

  s = antes + novo + depois;
  // Carrega a folha de componentes depois do último link do design
  // system — nem toda tela lista os quatro arquivos de token na mesma
  // ordem, e uma delas carrega styles.css em vez de tokens/web.css.
  // Ancorar num arquivo específico deixava a folha de fora ali, e o
  // verificador de forma pegou: o campo perdia o canto e a fonte.
  if (s.indexOf('isr-componentes.css') < 0) {
    const re = /<link rel="stylesheet" href="_ds\/[^"]*">/g;
    let m, ultimo = null;
    while ((m = re.exec(s))) ultimo = m;
    if (!ultimo) { console.log('SEM ÂNCORA DE CSS: ' + arquivo); return; }
    const corte = ultimo.index + ultimo[0].length;
    s = s.slice(0, corte) + '\n<link rel="stylesheet" href="isr-componentes.css">' + s.slice(corte);
  }
  if (escrever) fs.writeFileSync(BASE + arquivo, s);
}

const telas = fs.readdirSync(BASE).filter(f => /\.dc\.html$/.test(f))
  .filter(f => !/Gestao v3|Gestao v4|Gestao v5|Student Portal|Aluna v4/.test(f))
  .filter(f => fs.readFileSync(BASE + f, 'utf8').indexOf('_ds/ingles-sem-roteiro') >= 0).sort();

const escrever = process.argv[2] === '--escrever';
telas.forEach(f => converterTela(f, escrever));

console.log((escrever ? 'APLICADO' : 'simulação') + ' · ' + telas.length + ' telas\n');
console.log('elementos convertidos agora:          ' + relatorio.convertidos);
console.log('elementos que já tinham a classe:     ' + relatorio.jaConvertidos);
console.log('elementos deixados como estavam:    ' + relatorio.pulados);
console.log('declarações de style removidas:     ' + relatorio.declaracoesRemovidas + '\n');
Object.keys(relatorio.porFamilia).sort().forEach(f => {
  const d = relatorio.porFamilia[f];
  console.log('  ' + f.padEnd(8) + ' ' + String(d.convertidos).padStart(4) + ' com classe · '
    + String(d.pulados).padStart(3) + ' fora · ' + String(d.removidas).padStart(4) + ' declarações a menos');
});
if (process.argv.indexOf('--motivos') >= 0) {
  console.log('\npor que ficaram fora:');
  Object.keys(relatorio.motivos).sort((a, b) => relatorio.motivos[b] - relatorio.motivos[a])
    .forEach(k => console.log('   ×' + String(relatorio.motivos[k]).padStart(3) + '  ' + k));
}
