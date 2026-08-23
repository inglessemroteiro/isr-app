// Verificador de linguagem das telas.
//
// A regra do produto é linguagem de sistema: direta, factual, sem
// metáfora, sem tom de conversa e sem frase de venda. Ela já foi
// aplicada em varredura manual mais de uma vez — e voltou a escapar em
// texto novo. Este verificador roda no CI e reprova o texto de
// interface que usa os padrões proibidos, para a correção não depender
// de alguém reparar.
//
// O que ele lê: o texto visível das telas (.dc.html), os atributos
// placeholder/title e as strings do script que viram rótulo ou
// mensagem. O que ele ignora: comentários de código, os modelos de
// mensagem de WhatsApp (voz da escola falando com a aluna, não
// interface) e nomes próprios.
//
// Uso: node verificar-linguagem.js
const fs = require("fs");
const path = require("path");

var PROIBIDOS = [
  { re: /\bo combinado\b/i, por: "diga o limite em número (ex. \"Remarcações no mês: 0 de 1\")" },
  { re: /\ba gente\b/i, por: "use \"a escola\" ou a voz do sistema" },
  { re: /\bd[áa] para\b|\bd[áa] pra\b|\bdeu para\b/i, por: "use \"é possível\" ou reescreva sem a expressão" },
  { re: /\bpra\b/i, por: "\"para\"" },
  { re: /\bde verdade\b|\bde mentira\b|\bde f[áa]brica\b/i, por: "descreva o estado real do dado" },
  { re: /\baqui em cima\b|\baqui embaixo\b|\bl[áa] embaixo\b|\bali dentro\b|\bpor l[áa]\b/i, por: "nomeie a tela ou o campo" },
  { re: /\bsozinh[oa]\b/i, por: "\"automaticamente\"" },
  { re: /\bn[ãa]o rola\b|\bbora\b|\buhul\b|\bpoxa\b|\bpelo amor\b/i, por: "linguagem neutra" },
  { re: /\bcom carinho\b|\bque alegria\b|\bfinalmente\b|\bdestravar\b/i, por: "linguagem neutra" },
  { re: /\bnum lugar s[óo]\b|\btudo aqui\b|\bcom um clique\b/i, por: "descreva a função, sem promessa" },
  { re: /\bsem medo\b|\bse voc[êe] quiser\b|\bfique tranquil/i, por: "linguagem neutra" },
  { re: /!(?!important)/, por: "sem exclamação em texto de interface" }
];

// trechos que o verificador não avalia
var IGNORAR_ARQUIVOS = [
  "ISR - Mensagens WhatsApp.dc.html", // a tela é feita de modelos de mensagem
  "Brainstorm", "Arquitetura", "Design System", "Estratégia", "Journey",
  "Home Redesenhada", "Home v", "Implementacao", "Login (Magic Link)",
  "Visão Geral (Launcher)", "Tela de Aula", "Flin (IA)", "Comunidade",
  "Onboarding.dc.html", "Notificações & Renovação", "Aulas.dc.html",
  "Importar Caderno", "App (Conectado)", "App-Conectado", "Certificado.dc.html"
];

function ignorado(arquivo) {
  // o disco pode guardar o nome em forma decomposta ("Estrate\u0301gia"):
  // sem normalizar, a lista de exceções não casa
  var n = arquivo.normalize("NFC");
  return IGNORAR_ARQUIVOS.some(function (x) { return n.indexOf(x.normalize("NFC")) >= 0; });
}

// texto visível: sem <script>, <style> e comentários HTML
function textoVisivel(html) {
  var t = html
    .replace(/<script[\s\S]*?<\/script>/g, " ")
    .replace(/<style[\s\S]*?<\/style>/g, " ")
    .replace(/<!--[\s\S]*?-->/g, " ");
  var atributos = [];
  var re = /(placeholder|title)="([^"]*)"/g, m;
  while ((m = re.exec(t))) atributos.push(m[2]);
  var corpo = t.replace(/<[^>]+>/g, "\n");
  return atributos.join("\n") + "\n" + corpo;
}

// Só o CONTEÚDO das strings literais interessa: fora delas o que existe
// é código (onde "!" é negação, não exclamação). Uma string só entra na
// conta quando parece uma frase em português — tem espaço, palavra de
// três letras e não é seletor, URL, cor ou nome de arquivo.
function pareceFrase(s) {
  if (!/\s/.test(s)) return false;
  if (!/[A-Za-zÀ-ú]{3}/.test(s)) return false;
  if (/^[#.\/]|https?:|\.dc\.html|\.js$|^[\d\s.,%:-]+$/.test(s)) return false;
  if (/^(flex|grid|none|solid|bold|center|1px|2px|inherit|pointer)\b/.test(s)) return false;
  if (/[{}<>]|=>|\bfunction\b|px |rgba?\(/.test(s)) return false;
  // resto de código capturado por aspas desbalanceadas não é frase
  if (/[;()]|&&|\|\||==|\breturn\b|\bvar\b|\bconst\b|\bif\b\s|\bthis\./.test(s)) return false;
  return true;
}

// saldo de parênteses fora de string: diz se a chamada continua na
// linha seguinte
function saldoParenteses(linha) {
  var n = 0, aspa = null;
  for (var i = 0; i < linha.length; i++) {
    var c = linha[i];
    if (aspa) { if (c === "\\") i++; else if (c === aspa) aspa = null; continue; }
    if (c === "\"" || c === "'") { aspa = c; continue; }
    if (c === "(") n++;
    if (c === ")") n--;
  }
  return n;
}

function literaisDe(codigo) {
  var out = [], naMensagem = false, saldo = 0;
  codigo.split("\n").forEach(function (linha) {
    if (/^\s*(\/\/|\*|\/\*)/.test(linha)) return;
    // mensagem endereçada à aluna não é interface: é a voz da escola.
    // Ela costuma quebrar em várias linhas — o bloco inteiro sai da conta.
    if (naMensagem) {
      saldo += saldoParenteses(linha);
      if (saldo <= 0) naMensagem = false;
      return;
    }
    if (/waLink\(|wa\.me|corpo:|gcalLink\(/.test(linha)) {
      saldo = saldoParenteses(linha.slice(linha.search(/waLink\(|gcalLink\(|corpo:/)));
      if (saldo > 0) naMensagem = true;
      return;
    }
    var re = /"((?:[^"\\]|\\.)*)"|'((?:[^'\\]|\\.)*)'/g, m;
    while ((m = re.exec(linha))) {
      var s = (m[1] !== undefined ? m[1] : m[2]);
      if (pareceFrase(s)) out.push(s);
    }
  });
  return out.join("\n");
}

function stringsDoScript(html) {
  var m = html.match(/<script type="text\/x-dc"[^>]*>([\s\S]*?)<\/script>/);
  return m ? literaisDe(m[1]) : "";
}

// crm-data e isr-nav: as strings de rótulo e mensagem, sem os modelos
// de WhatsApp (voz da escola falando com a aluna, não interface)
function stringsDeDados(js) {
  var semTemplates = js.replace(/var TEMPLATES[\s\S]*?\n  \];/, " ")
    .replace(/corpo:\s*"(?:[^"\\]|\\.)*"/g, " ");
  return literaisDe(semTemplates);
}

function achados(nome, conteudo) {
  var out = [];
  conteudo.split("\n").forEach(function (linha, i) {
    var limpa = linha.trim();
    if (!limpa) return;
    PROIBIDOS.forEach(function (p) {
      var m = limpa.match(p.re);
      if (!m) return;
      // exclamação só conta dentro de texto, não em código
      if (p.re.source.indexOf("important") >= 0 && /[=<>&|]/.test(limpa.slice(Math.max(0, limpa.indexOf("!") - 1), limpa.indexOf("!") + 2))) return;
      out.push({ arquivo: nome, linha: i + 1, trecho: limpa.slice(0, 110), achou: m[0], por: p.por });
    });
  });
  return out;
}

var raiz = __dirname;
var alvos = fs.readdirSync(raiz).filter(function (f) {
  return (/\.dc\.html$/.test(f) && !ignorado(f)) || f === "crm-data.js" || f === "isr-nav.js";
});

var problemas = [];
alvos.forEach(function (f) {
  var conteudo = fs.readFileSync(path.join(raiz, f), "utf8");
  if (/\.dc\.html$/.test(f)) {
    problemas = problemas.concat(achados(f, textoVisivel(conteudo)));
    problemas = problemas.concat(achados(f, stringsDoScript(conteudo)));
  } else {
    problemas = problemas.concat(achados(f, stringsDeDados(conteudo)));
  }
});

if (!problemas.length) {
  console.log("Linguagem: " + alvos.length + " arquivos verificados, nenhum padrão proibido.");
  process.exit(0);
}
console.log("Linguagem: " + problemas.length + " ocorrência(s) a corrigir.\n");
problemas.forEach(function (p) {
  console.log(p.arquivo + " · \"" + p.achou + "\" → " + p.por);
  console.log("   " + p.trecho + "\n");
});
process.exit(1);
