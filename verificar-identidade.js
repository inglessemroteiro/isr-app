/* ════════════════════════════════════════════════════════════════
   ISR — verificador de identidade visual
   ----------------------------------------------------------------
   As telas carregam os tokens do design system há meses e não usavam
   nenhum: toda cor era um hexadecimal escrito à mão. Mudar o verde da
   marca no design system não mudava nada no sistema.

   Este verificador existe para que isso não volte. A regra é simples:

     cor que tem token no design system se escreve var(--color-…),
     não em hexadecimal.

   Cor que NÃO tem token continua em hexadecimal, e ele lista quais
   são — essa lista é o trabalho que falta no design system, não um
   erro de quem escreveu a tela.

   Uso: node verificar-identidade.js
        node verificar-identidade.js --fora     (lista as sem token)
   ════════════════════════════════════════════════════════════════ */
const fs = require("fs");

var DS = "_ds/ingles-sem-roteiro-design-system-a7985fe4-209b-4350-a2f2-0670d3c36040/";

// As telas da aluna têm paleta própria (fundo escuro) e não carregam os
// tokens: var(--color-…) ali não resolveria. Os arquivos do Claude
// Design são referência, não tela.
function conferivel(arquivo) {
  if (!/\.dc\.html$/.test(arquivo)) return false;
  if (/Gestao v3|Gestao v4|Gestao v5|Student Portal/.test(arquivo)) return false;
  try {
    return fs.readFileSync(arquivo, "utf8").indexOf("_ds/ingles-sem-roteiro") >= 0;
  } catch (e) { return false; }
}

function coresDoSistema() {
  var css = fs.readFileSync(DS + "tokens/colors.css", "utf8");
  var porCor = {};
  css.replace(/(--color-[a-z0-9-]+):\s*(#[0-9a-fA-F]{3,8})\b/g, function (m, nome, cor) {
    var k = cor.toLowerCase();
    if (!porCor[k]) porCor[k] = [];
    porCor[k].push(nome);
    return m;
  });
  if (porCor["#ffffff"]) porCor["#fff"] = porCor["#ffffff"];
  return porCor;
}

var TOKENS = coresDoSistema();
var arquivos = fs.readdirSync(".").filter(conferivel).sort();
var erros = 0;
var semToken = {};

arquivos.forEach(function (f) {
  var s = fs.readFileSync(f, "utf8");
  var re = /#[0-9a-fA-F]{3,8}\b/g, m;
  while ((m = re.exec(s))) {
    var cor = m[0].toLowerCase();
    // o verde do WhatsApp é cor de outra marca: não entra na paleta
    if (cor === "#25d366" || cor === "#1a9e4b" || cor === "#0b3d1f") continue;
    if (TOKENS[cor]) {
      var linha = s.slice(0, m.index).split("\n").length;
      console.log(f + ":" + linha + " · " + cor + " → var(" + TOKENS[cor][0] + ")");
      erros++;
    } else {
      if (!semToken[cor]) semToken[cor] = 0;
      semToken[cor]++;
    }
  }
});

var fora = Object.keys(semToken).sort(function (a, b) { return semToken[b] - semToken[a]; });

if (process.argv.indexOf("--fora") >= 0) {
  console.log("\nCores em uso que ainda não têm token no design system:");
  fora.forEach(function (c) {
    console.log("  " + c + "  ·  " + semToken[c] + (semToken[c] === 1 ? " uso" : " usos"));
  });
}

console.log("Identidade: " + arquivos.length + " telas verificadas, "
  + (erros ? erros + " cor(es) em hexadecimal que têm token" : "nenhuma cor da paleta escrita à mão")
  + " · " + fora.length + " cores ainda sem token no design system.");
process.exit(erros ? 1 : 0);
