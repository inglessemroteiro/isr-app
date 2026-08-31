// Verificador das páginas do desafio. Roda no GitHub a cada publicação
// (e localmente com: node verificar-desafio.js).
//
// Confere que toda página datada (DDMMAA.html) e o modelo carregam o
// contrato que liga a página ao sistema: a trava de login, a identidade
// automática e o registro da semana (streak, ranking e miles). Sem isso,
// a semana publicada volta a pedir digitação e não conta a sequência.
var fs = require("fs");

var REGRAS = [
  ["trava de login", '<script src="isr-trava.js">'],
  ["dados do sistema", "crm-data.js"],
  ["identidade e registro", "isr-desafio.js"],
  ["campo de nome", 'data-f="nome"'],
  ["campo de e-mail", 'data-f="email"'],
  ["caixa do áudio", 'data-f="audio_enviado"'],
  ["registro da semana no sistema", "ISRDesafio.registrar"]
];

// O nome pode vir com sufixo do download — "310826 (1).html" é a mesma
// página semanal e precisa das mesmas travas. Exigindo o nome exato, uma
// cópia sem trava de login passava pelo verificador sem ninguém ver.
var arquivos = fs.readdirSync(".").filter(function (f) { return /^\d{6}\b.*\.html$/.test(f); });
if (fs.existsSync("desafio-modelo.html")) arquivos.push("desafio-modelo.html");

var erros = 0;
arquivos.forEach(function (f) {
  var s = fs.readFileSync(f, "utf8");
  REGRAS.forEach(function (r) {
    if (s.indexOf(r[1]) < 0) {
      console.log("ERRO em " + f + ": falta " + r[0] + " (" + r[1] + ")");
      erros++;
    }
  });
});

console.log(arquivos.length + " página(s) conferida(s)"
  + (erros ? " · " + erros + " problema(s) — a página publicada perdeu parte do modelo" : " · tudo certo"));
process.exit(erros ? 1 : 0);
