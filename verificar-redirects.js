// Nenhuma regra forçada pode cobrir um arquivo que existe.
//
// Por que isto é um verificador e não uma observação: no Netlify, uma
// regra de redirecionamento com `force = true` vale POR CIMA do arquivo
// que está no endereço. Uma regra assim apontada para `/aluna.html`
// tirou o PORTÃO DE LOGIN do ar sem erro nenhum — a raiz do site manda
// todo mundo para lá, e a pessoa caía na tela da aluna, vazia. Ninguém
// conseguia entrar, e os links de criar e redefinir senha eram
// engolidos: chegavam numa tela que não sabe o que fazer com o token.
//
// O estrago não aparece em teste de navegador, porque o servidor local
// não aplica as regras do Netlify. Aparece só em produção, e como uma
// página em branco. Daí este conferidor: ele lê o netlify.toml e, para
// cada regra forçada, confere se existe arquivo no caminho de origem.
//
// Redirecionar um endereço que NÃO tem arquivo é o uso normal e passa.
// Redirecionar um que tem, sem `force`, também passa: o arquivo vence e
// a regra só vale se ele desaparecer.
const fs = require('fs');
const path = require('path');

const RAIZ = __dirname;
const TOML = path.join(RAIZ, 'netlify.toml');

if (!fs.existsSync(TOML)) {
  console.log('netlify.toml não encontrado — nada a conferir.');
  process.exit(0);
}

const texto = fs.readFileSync(TOML, 'utf8');

// As regras são blocos [[redirects]] com from/to/force. Basta ler linha
// a linha: o arquivo é escrito à mão e sempre nesse formato.
const regras = [];
let atual = null;
texto.split('\n').forEach((linha, i) => {
  const l = linha.trim();
  if (l === '[[redirects]]') { atual = { linha: i + 1 }; regras.push(atual); return; }
  if (l.startsWith('[') && l !== '[[redirects]]') { atual = null; return; }
  if (!atual) return;
  const m = l.match(/^(from|to|status|force)\s*=\s*(.+)$/);
  if (!m) return;
  let v = m[2].trim().replace(/^"(.*)"$/, '$1');
  atual[m[1]] = m[1] === 'force' ? v === 'true' : v;
});

// o caminho de origem pode vir com %20 ou com espaço: as duas formas
// chegam ao servidor, e as regras da casa trazem as duas
function arquivoDe(from) {
  if (!from || from.indexOf(':') >= 0 || from.indexOf('*') >= 0) return '';
  let p = from.split('?')[0].replace(/^\//, '');
  let candidatos = [p];
  try { candidatos.push(decodeURIComponent(p)); } catch (e) {}
  for (const c of candidatos) {
    if (!c) continue;
    const abs = path.join(RAIZ, c);
    if (fs.existsSync(abs) && fs.statSync(abs).isFile()) return c;
  }
  return '';
}

const problemas = [];
regras.forEach(r => {
  if (!r.force || !r.from) return;
  const arq = arquivoDe(r.from);
  if (arq) problemas.push({ linha: r.linha, from: r.from, to: r.to || '', arquivo: arq });
});

console.log('Redirecionamentos: ' + regras.length + ' regras, '
  + regras.filter(r => r.force).length + ' forçadas.');

if (!problemas.length) {
  console.log('Nenhuma regra forçada cobre arquivo existente.');
  process.exit(0);
}

problemas.forEach(p => {
  console.log('  × linha ' + p.linha + ': a regra forçada ' + p.from + ' → ' + p.to);
  console.log('    cobre o arquivo "' + p.arquivo + '", que existe e deixa de ser servido.');
  console.log('    Tire o force, ou mude o endereço de origem para um que não tenha arquivo.');
});
process.exit(1);
