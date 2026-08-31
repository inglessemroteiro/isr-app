// Verificador de jargão nas telas.
//
// Companheiro do verificar-linguagem.js. Aquele pega o tom errado —
// conversa, venda, exclamação. Este pega o oposto: o texto de relatório
// corporativo que descreve a tela em vez de nomear o que ela faz, e o
// vocabulário interno que só quem construiu o sistema entende.
//
// A regra: rótulo é nome, não descrição. "Disponível", não "Para
// operar". E nada de código de requisito, sigla de processo ou termo de
// contabilidade onde existe a palavra que todo mundo usa.
//
// Uso: node verificar-jargao.js
const fs = require("fs");

var PROIBIDOS = [
  // vocabulário de departamento no lugar do nome da tela
  { re: /\bGest[ãa]o de (Receb[íi]veis|Relacionamento|Alunas)\b/i,
    por: "diga o que a tela mostra, não o nome do departamento" },
  { re: /\bVis[ãa]o Geral de\b|\bAn[áa]lise de Origem\b|\bPrecifica[çc][ãa]o e Simula[çc][ãa]o\b/i,
    por: "comece pelo que a pessoa vê ou faz na tela" },
  { re: /\bReposit[óo]rio de\b|\bPainel Docente\b|\bCadastro de Alunas Ativas\b/i,
    por: "use o nome comum da coisa" },
  // código interno vazando
  { re: /\((R\d+)\)/, por: "código de requisito não aparece na interface" },
  // contabilês onde existe palavra corrente
  { re: /\badimpl[êe]ncia\b/i, por: "\"pagamento em dia\"" },
  { re: /\bprecedência\b/i, por: "\"substitui\" ou \"vale no lugar de\"" },
  { re: /\bcad[êe]ncia\b/i, por: "\"frequência\" ou \"intervalo\"" },
  { re: /\bticket-alvo\b|\bticket m[ée]dio-alvo\b/i, por: "\"preço-alvo\"" },
  { re: /\bequival[êe]ncia mensal proporcional\b/i, por: "\"quanto fica por mês\"" },
  { re: /\bcarga semanal\b/i, por: "\"contatos por semana\"" },
  { re: /\bdesfecho\b/i, por: "\"resultado\" ou \"o que aconteceu\"" }
];

// A abertura da tela é um nome, não uma legenda. Corrigir o relatório
// corporativo levou ao extremo oposto — "Quem falar com quem, e quando",
// "Tudo que está marcado", "As suas aulas" —, que é tom de conversa com
// outra roupa. O primeiro <strong> do cabeçalho tem que ser o nome da
// tela ou do objeto que ela mostra.
var ABERTURA_RUIM = /^(quem|quanto|onde|de onde|tudo|o que|como|por que|as suas|os seus|a sua|o seu)\b/i;
function conferirAbertura(html, arquivo) {
  var m = html.match(/<strong>([^<]{3,70})<\/strong>/);
  if (!m) return 0;
  var t = m[1].replace(/\s+/g, " ").trim().replace(/\.$/, "");
  if (/\{\{/.test(t)) return 0;                       // val do template, não texto fixo
  if (!ABERTURA_RUIM.test(t) && !/\?$/.test(t)) return 0;
  console.log(arquivo + " · abertura \"" + t + "\" → comece pelo nome da tela"
    + " (\"Cobrança\", \"Alunas ativas\"), não por uma frase sobre ela");
  return 1;
}

// as mesmas exceções do verificador de linguagem: rascunho, protótipo e
// as telas que falam com a aluna em vez de descrever o sistema
var IGNORAR = [
  "ISR - Mensagens WhatsApp.dc.html",
  "Brainstorm", "Arquitetura", "Design System", "Estratégia", "Journey",
  "Home Redesenhada", "Home v", "Implementacao", "Login (Magic Link)",
  "Visão Geral (Launcher)", "Tela de Aula", "Flin (IA)", "Comunidade",
  "Onboarding.dc.html", "Notificações & Renovação", "Aulas.dc.html",
  "Importar Caderno", "App (Conectado)", "App-Conectado", "Certificado.dc.html"
];
function ignorado(arquivo) {
  var n = arquivo.normalize("NFC");
  return IGNORAR.some(function (x) { return n.indexOf(x.normalize("NFC")) >= 0; });
}

function textoVisivel(html) {
  var t = html
    .replace(/<script[\s\S]*?<\/script>/g, " ")
    .replace(/<style[\s\S]*?<\/style>/g, " ")
    .replace(/<!--[\s\S]*?-->/g, " ");
  var atributos = [];
  var re = /(placeholder|title)="([^"]*)"/g, m;
  while ((m = re.exec(t))) atributos.push(m[2]);
  return t.replace(/<[^>]*>/g, " ") + " " + atributos.join(" ");
}

var arquivos = fs.readdirSync(".").filter(function (f) {
  return /\.dc\.html$/.test(f) && !ignorado(f);
});

var erros = 0;
arquivos.forEach(function (f) {
  var html = fs.readFileSync(f, "utf8");
  var texto = textoVisivel(html);
  erros += conferirAbertura(html, f);
  PROIBIDOS.forEach(function (p) {
    var m = texto.match(p.re);
    if (!m) return;
    var i = texto.indexOf(m[0]);
    console.log(f + " · \"" + m[0] + "\" → " + p.por);
    console.log("   " + texto.slice(Math.max(0, i - 40), i + 70).replace(/\s+/g, " ").trim());
    erros++;
  });
});

console.log("Jargão: " + arquivos.length + " arquivos verificados, "
  + (erros ? erros + " ocorrência(s)" : "nenhum padrão proibido") + ".");
process.exit(erros ? 1 : 0);
