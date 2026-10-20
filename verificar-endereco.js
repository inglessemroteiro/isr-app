// Nenhum documento que a equipe recebe pode mandar para o Book Club.
//
// Por que isto é um verificador e não uma observação: há dois endereços
// parecidos, e um deles não é este sistema.
//
//   inglessemroteiro.netlify.app   → o sistema da escola
//   app.inglessemroteiro.com.br    → o Book Club, outro app
//
// O segundo aparece de propósito no código: `netlify/functions/bc-proxy.js`
// o busca de fora, e `bookclubUrl()` em crm-data.js o guarda como padrão.
// São usos legítimos. O que não pode é um documento de instruções mandar
// uma professora para lá: não existe `/gestao.html` naquele host, e foi
// exatamente isso que o ACESSO-DA-EQUIPE.md fez — as professoras abriram
// o endereço e não acharam o sistema.
//
// O erro não aparece em teste de navegador nem em build: é um link num
// arquivo de texto. Aparece quando alguém tenta entrar e não consegue.
const fs = require('fs');
const path = require('path');

const RAIZ = __dirname;
const BOOKCLUB = 'app.inglessemroteiro.com.br';

// Onde o Book Club pode ser citado: é o endereço dele, e estes arquivos
// existem para falar com ele.
const PODEM_CITAR = ['netlify/functions/bc-proxy.js', 'crm-data.js', 'verificar-endereco.js'];

// Documentos que alguém da escola lê e segue.
function docs(dir, achados) {
  fs.readdirSync(dir, { withFileTypes: true }).forEach(function (e) {
    if (e.name === 'node_modules' || e.name === '.git' || e.name === '_ds') return;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) return docs(p, achados);
    if (/\.md$/i.test(e.name)) achados.push(p);
  });
  return achados;
}

let falhas = 0;
docs(RAIZ, []).forEach(function (p) {
  const rel = path.relative(RAIZ, p);
  if (PODEM_CITAR.indexOf(rel) >= 0) return;
  const linhas = fs.readFileSync(p, 'utf8').split('\n');
  linhas.forEach(function (l, i) {
    if (l.indexOf(BOOKCLUB) < 0) return;
    // citar para dizer que NÃO é o sistema é o uso certo
    if (/Book Club|não é|nao e|outro app/i.test(l)) return;
    console.log('FALHA ' + rel + ':' + (i + 1));
    console.log('      manda para o Book Club: ' + l.trim().slice(0, 90));
    falhas++;
  });
});

// E o documento da equipe precisa ter um endereço, qualquer que seja.
const ACESSO = path.join(RAIZ, 'ACESSO-DA-EQUIPE.md');
if (fs.existsSync(ACESSO)) {
  const t = fs.readFileSync(ACESSO, 'utf8');
  const links = t.match(/https:\/\/[a-zA-Z0-9.-]+\/gestao\.html/g) || [];
  if (!links.length) {
    console.log('FALHA ACESSO-DA-EQUIPE.md não tem endereço de entrada nenhum.');
    falhas++;
  } else if (new Set(links).size > 1) {
    console.log('FALHA ACESSO-DA-EQUIPE.md dá mais de um endereço: ' + [...new Set(links)].join(', '));
    falhas++;
  } else {
    console.log('endereço da equipe: ' + links[0]);
  }
}

console.log(falhas ? '\n' + falhas + ' falha(s).' : 'nenhum documento manda a equipe para o Book Club.');
process.exit(falhas ? 1 : 0);
