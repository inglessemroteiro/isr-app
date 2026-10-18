// Sexto verificador: chave de armazenamento usada e nunca declarada.
//
// Veio de um defeito de verdade. O PR que tirou o Mural apagou a
// declaração `var AVISOS_KEY = "isr_avisos_v1";` e deixou os três
// usos dela. Os dois acessos estavam dentro de try/catch, então o
// ReferenceError era engolido: a lista devolvia vazio, a gravação não
// gravava, e nada acusava. Todo aviso que o sistema escreveu desde
// então foi descartado em silêncio — nove lugares diferentes, por
// dias, sem uma linha de erro.
//
// Tirar um pedaço de tela é o tipo de corte que deixa esse rastro: a
// tela some, as constantes que só ela usava somem, e sobra um uso
// perdido no meio de um try.
//
// O alvo é estreito de propósito. Mirar em todo nome em caixa alta dá
// 104 achados, quase todos `window.ISRCRM` e `ISRPaginacao.PADRAO` —
// e verificador que acusa o que não existe deixa de ser lido. As
// chaves de armazenamento deste projeto se chamam todas NOME_KEY, e é
// exatamente onde o descuido é silencioso: o acesso a localStorage
// vive dentro de try/catch.
//
//   node verificar-nomes.js
const fs = require('fs');

const arquivos = fs.readdirSync('.')
  .filter(f => /\.(js|dc\.html)$/.test(f))
  .filter(f => !/^verificar-/.test(f))
  .sort();

let achados = [];
arquivos.forEach(arq => {
  const bruto = fs.readFileSync(arq, 'utf8');
  let s = bruto;
  // Em tela .dc.html só o script importa: o template tem {{ vals }},
  // que não são variáveis de JavaScript.
  if (/\.dc\.html$/.test(arq)) {
    const a = s.indexOf('data-dc-script');
    if (a < 0) return;
    s = s.slice(a);
  }
  // fora comentários e textos, para não caçar nome dentro de frase
  const limpo = s
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/(^|[^:])\/\/[^\n]*/g, '$1 ')
    .replace(/"(?:[^"\\]|\\.)*"/g, '""')
    .replace(/'(?:[^'\\]|\\.)*'/g, "''")
    .replace(/`(?:[^`\\]|\\.)*`/g, '``');

  const usadas = {};
  // o \B antes do nome descarta acesso a propriedade (obj.NOME_KEY),
  // que é declarado em outro lugar e não é desta conta
  (limpo.match(/(^|[^.\w])([A-Z][A-Z0-9]*(?:_[A-Z0-9]+)*_KEY)\b/g) || []).forEach(m => {
    const nome = m.match(/([A-Z][A-Z0-9_]*_KEY)/)[1];
    usadas[nome] = (usadas[nome] || 0) + 1;
  });

  Object.keys(usadas).forEach(nome => {
    const decl = new RegExp('(var|let|const)\\s+' + nome + '\\s*=|\\b' + nome + '\\s*:');
    if (decl.test(limpo)) return;
    const linhas = [];
    bruto.split('\n').forEach((ln, i) => {
      if (new RegExp('(^|[^.\\w])' + nome + '\\b').test(ln)) linhas.push(i + 1);
    });
    achados.push({ arq, nome, usos: usadas[nome], linhas: linhas.slice(0, 5) });
  });
});

if (!achados.length) {
  console.log('Nomes: ' + arquivos.length
    + ' arquivos verificados, nenhuma chave de armazenamento usada sem declaração.');
  process.exit(0);
}
console.log('CHAVES USADAS E NUNCA DECLARADAS · ' + achados.length + '\n');
console.log('Chave sem declaração no próprio arquivo é ReferenceError em');
console.log('tempo de execução. Como o acesso a localStorage vive dentro de');
console.log('try/catch, ele não aparece: a função devolve vazio, a gravação');
console.log('não grava, e nada acusa.\n');
achados.forEach(a => {
  console.log('  ' + a.arq + '  ' + a.nome + '  (' + a.usos
    + (a.usos === 1 ? ' uso' : ' usos') + ', linha' + (a.linhas.length > 1 ? 's ' : ' ')
    + a.linhas.join(', ') + ')');
});
process.exit(1);
