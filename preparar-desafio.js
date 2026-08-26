// Prepara a página semanal do desafio depois do download do design.
//
// Uso:  node preparar-desafio.js 240826.html
//
// O download do editor vem embrulhado: o HTML da página fica guardado
// dentro de um arquivo maior, os três <script> do sistema viram
// endereços internos do editor (um código com traços) e as fontes viram
// arquivos que só existem lá dentro. Publicado assim, o resultado é uma
// página que abre sem pedir login e não registra a resposta de ninguém —
// foi o que aconteceu com a semana 240826.
//
// Este script desembrulha e devolve a página pronta para publicar:
//   • recupera o HTML de dentro do embrulho;
//   • repõe isr-trava.js, crm-data.js e isr-desafio.js;
//   • troca as fontes internas pelo endereço público do Google Fonts.
//
// O conteúdo da semana (textos, áudios, telas) não é tocado. Depois de
// rodar, confira com: node verificar-desafio.js
var fs = require("fs");

var SCRIPTS = '<script src="isr-trava.js"></script>\n'
  + '<script src="./crm-data.js"></script>\n'
  + '<script src="./isr-desafio.js"></script>';
var FONTES = '<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap" rel="stylesheet">';
var UUID = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";

function desembrulhar(texto) {
  var i = texto.indexOf('"<!DOCTYPE html>');
  if (i < 0) return { html: texto, embrulhado: false };
  // o HTML está guardado como texto dentro do arquivo; ler daqui até o
  // fim do trecho devolve o documento como ele era
  var fim = i + 1, esc = false;
  for (; fim < texto.length; fim++) {
    var c = texto[fim];
    if (esc) { esc = false; continue; }
    if (c === "\\") { esc = true; continue; }
    if (c === '"') break;
  }
  return { html: JSON.parse(texto.slice(i, fim + 1)), embrulhado: true };
}

function preparar(html) {
  var mudou = [];

  // 1. os três scripts do sistema, no lugar dos endereços do editor
  var scriptsInternos = new RegExp('<script src="' + UUID + '"></script>\\s*', "g");
  if (scriptsInternos.test(html)) {
    html = html.replace(scriptsInternos, "");
    mudou.push("endereços internos do editor removidos");
  }
  if (html.indexOf("isr-trava.js") < 0) {
    html = html.replace(/(<meta name="viewport"[^>]*>\s*)/, "$1" + SCRIPTS + "\n");
    mudou.push("scripts do sistema repostos");
  }

  // 2. fontes: o arquivo interno não existe fora do editor
  var fontesInternas = new RegExp('@font-face\\s*\\{[^}]*' + UUID + '[^}]*\\}\\s*', "g");
  if (fontesInternas.test(html)) {
    html = html.replace(fontesInternas, "");
    mudou.push("fontes internas removidas");
  }
  if (html.indexOf("fonts.googleapis.com/css") < 0) {
    html = html.replace("</title>", "</title>\n" + FONTES);
    mudou.push("Google Fonts reposto");
  }

  return { html: html, mudou: mudou };
}

module.exports = { desembrulhar: desembrulhar, preparar: preparar };

if (require.main !== module) return;

var arq = process.argv[2];
if (!arq) {
  console.log("Uso: node preparar-desafio.js DDMMAA.html");
  process.exit(2);
}
if (!fs.existsSync(arq)) {
  console.log("Arquivo não encontrado: " + arq);
  process.exit(2);
}

var bruto = fs.readFileSync(arq, "utf8");
var d = desembrulhar(bruto);
var r = preparar(d.html);
var passos = (d.embrulhado ? ["HTML recuperado de dentro do embrulho"] : []).concat(r.mudou);

if (!passos.length) {
  console.log(arq + ": já estava pronto, nada a fazer.");
  process.exit(0);
}
fs.writeFileSync(arq, r.html, "utf8");
console.log(arq + ": " + passos.join(" · "));
console.log("Confira agora com: node verificar-desafio.js");
