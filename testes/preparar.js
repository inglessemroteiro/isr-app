// O que toda suíte de tela precisa antes de abrir a primeira página.
//
// Duas coisas que davam trabalho a cada suíte nova, e que mudavam de
// lugar sozinhas quando a máquina era recriada:
//
// 1. onde está o Chromium. O caminho tem o número da versão dentro
//    ("chromium-1243/chrome-linux64/chrome"), e esse número muda. Aqui
//    ele é procurado, não escrito à mão;
// 2. o React. As telas .dc.html carregam React de um CDN, e o ambiente
//    de teste não alcança CDN nenhum. As rotas abaixo respondem com a
//    cópia que está em testes/node_modules.
const fs = require("fs");
const path = require("path");

function acharChromium() {
  if (process.env.ISR_CHROMIUM) return process.env.ISR_CHROMIUM;
  var base = process.env.PLAYWRIGHT_BROWSERS_PATH || "/opt/pw-browsers";
  var achados = [];
  var pastas = [];
  try { pastas = fs.readdirSync(base); } catch (e) { return ""; }
  pastas.filter(function (d) { return /^chromium/.test(d); }).forEach(function (d) {
    ["chrome-linux64/chrome", "chrome-linux/chrome"].forEach(function (sufixo) {
      var p = path.join(base, d, sufixo);
      if (fs.existsSync(p)) achados.push(p);
    });
  });
  // a versão mais nova por último na ordem alfabética não serve
  // (chromium-999 > chromium-1243), então ordena pelo número
  achados.sort(function (a, b) {
    var na = parseInt((a.match(/chromium[^0-9]*(\d+)/) || [])[1] || "0", 10);
    var nb = parseInt((b.match(/chromium[^0-9]*(\d+)/) || [])[1] || "0", 10);
    return nb - na;
  });
  return achados[0] || "";
}

var REACT = {
  "react@18.3.1/umd/react.development.js": "react/umd/react.development.js",
  "react-dom@18.3.1/umd/react-dom.development.js": "react-dom/umd/react-dom.development.js",
  "react@18.3.1/umd/react.production.min.js": "react/umd/react.production.min.js",
  "react-dom@18.3.1/umd/react-dom.production.min.js": "react-dom/umd/react-dom.production.min.js"
};

// Sobe o contexto já com as rotas presas e o exemplo ligado.
async function novoContexto(navegador, opcoes) {
  opcoes = opcoes || {};
  var pacotes = process.env.ISR_CDN || path.join(__dirname, "node_modules");
  var ctx = await navegador.newContext(opcoes.contexto || {});
  await ctx.route("**/unpkg.com/**", function (rota) {
    var url = rota.request().url();
    var chaves = Object.keys(REACT);
    for (var i = 0; i < chaves.length; i++) {
      if (url.indexOf(chaves[i]) >= 0) {
        return rota.fulfill({ body: fs.readFileSync(path.join(pacotes, REACT[chaves[i]])),
          contentType: "application/javascript" });
      }
    }
    return rota.abort();
  });
  // o Apps Script e as fontes não existem no teste, e esperar por eles
  // atrasava cada página em segundos
  await ctx.route("**/script.google.com/**", function (r) { return r.abort(); });
  await ctx.route("**/fonts.googleapis.com/**", function (r) { return r.abort(); });
  var quem = opcoes.gestao || null;
  await ctx.addInitScript(function (cfg) {
    try {
      localStorage.setItem("isr_exemplo_v1", "1");
      if (cfg && cfg.lang) localStorage.setItem("isr_painel_lang", cfg.lang);
      // só na primeira carga: o script roda a cada navegação, e
      // reescrever aqui desfaz uma troca de usuária feita no meio
      if (cfg && cfg.gestao && !localStorage.getItem("isr_gestao_user")) {
        localStorage.setItem("isr_gestao_user", JSON.stringify(cfg.gestao));
        localStorage.setItem("isr_gestao_token", "teste");
      }
    } catch (e) {}
  }, { gestao: quem, lang: opcoes.lang || "pt" });
  return ctx;
}

function endereco(arquivo) {
  var porta = process.env.ISR_PORTA || "8899";
  return "http://localhost:" + porta + "/" + encodeURIComponent(arquivo);
}

// o placar das suítes, igual em todas
function placar() {
  var ok = 0, mau = 0;
  return {
    T: function (nome, cond, extra) {
      if (cond) { ok++; console.log("  ok   " + nome); }
      else {
        mau++;
        console.log("  FALHA " + nome
          + (extra !== undefined ? "  → " + JSON.stringify(extra).slice(0, 340) : ""));
      }
    },
    fim: function () {
      console.log("\n" + ok + " ok, " + mau + " falhas");
      process.exit(mau ? 1 : 0);
    }
  };
}

module.exports = { acharChromium: acharChromium, novoContexto: novoContexto,
  endereco: endereco, placar: placar };
