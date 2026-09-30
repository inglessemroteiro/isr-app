#!/usr/bin/env node
// Renderiza um vídeo a partir de um plano de edição (JSON).
//
// O plano é a decisão criativa: o que cortar, o que escrever na tela, onde
// dar zoom, que som entra e qual trilha toca. Quem escreve o plano é o editor
// (o Claude, na skill editar-video, ou uma pessoa). Este arquivo só executa,
// chamando o ffmpeg. Ele não decide nada.
//
// Uso:
//   node video/editar.js trabalho/<nome>/plano.json            renderiza
//   node video/editar.js trabalho/<nome>/plano.json --rapido   prévia em baixa resolução, bem mais rápida
//   node video/editar.js trabalho/<nome>/plano.json --so-ass   só gera o arquivo de legendas, sem renderizar
//
// O formato do plano está documentado em video/README.md e o exemplo
// completo em video/exemplos/plano-exemplo.json.
"use strict";
var fs = require("fs");
var path = require("path");
var cp = require("child_process");

var PASTA_VIDEO = __dirname;
var PASTA_FONTES = path.join(PASTA_VIDEO, "biblioteca", "fontes");
var PASTA_SFX = path.join(PASTA_VIDEO, "biblioteca", "sfx");
var PASTA_TRILHAS = path.join(PASTA_VIDEO, "biblioteca", "trilhas");
var FPS = 30;

// Cores da marca (Inglês sem Roteiro)
var CORES = {
  branco: "#ffffff", preto: "#000000",
  teal: "#164951", tealClaro: "#348a8e", coral: "#fc9082", creme: "#f2ebe3", verde: "#9ec970", marrom: "#8a7465"
};

// ---------------------------------------------------------------- utilidades

function falhar(msg) { console.error("\n✗ " + msg + "\n"); process.exit(1); }
function aviso(msg) { console.error("  ! " + msg); }
function num(v, padrao) { return (typeof v === "number" && isFinite(v)) ? v : padrao; }
function fmt(t) { return (Math.round(t * 100) / 100).toFixed(2); }

function corAss(hex, alfa) {
  // "#rrggbb" → "&HAABBGGRR"
  if (!hex) hex = "#ffffff";
  if (CORES[hex]) hex = CORES[hex];
  var h = hex.replace("#", "");
  if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
  var a = Math.round(num(alfa, 0) * 255).toString(16).padStart(2, "0");
  return "&H" + (a + h.slice(4, 6) + h.slice(2, 4) + h.slice(0, 2)).toUpperCase();
}

function rodar(args, rotulo, cwd) {
  var r = cp.spawnSync("ffmpeg", ["-hide_banner", "-loglevel", "error", "-stats", "-y"].concat(args), { stdio: ["ignore", "inherit", "pipe"], cwd: cwd, maxBuffer: 64 * 1024 * 1024 });
  var err = String(r.stderr || "");
  // o -stats escreve o progresso no stderr; só mostramos quando dá erro
  if (r.status !== 0) {
    console.error(err.split("\n").filter(function (l) { return !/^frame=|^size=/.test(l); }).slice(-40).join("\n"));
    falhar(rotulo + " falhou (ffmpeg saiu com " + r.status + ")");
  }
}

function sondar(arquivo) {
  var r = cp.spawnSync("ffprobe", ["-v", "error", "-print_format", "json", "-show_streams", "-show_format", arquivo], { encoding: "utf8" });
  if (r.status !== 0) falhar("não consegui ler " + arquivo + "\n" + r.stderr);
  var j = JSON.parse(r.stdout);
  var v = (j.streams || []).filter(function (s) { return s.codec_type === "video"; })[0];
  var a = (j.streams || []).filter(function (s) { return s.codec_type === "audio"; })[0];
  var fpsTxt = v && (v.avg_frame_rate || v.r_frame_rate) || "30/1";
  var fpsP = fpsTxt.split("/");
  var rot = 0;
  if (v && v.side_data_list) v.side_data_list.forEach(function (sd) { if (sd.rotation) rot = Number(sd.rotation); });
  if (v && v.tags && v.tags.rotate) rot = Number(v.tags.rotate);
  var w = v ? v.width : 0, h = v ? v.height : 0;
  if (Math.abs(rot) === 90 || Math.abs(rot) === 270) { var tmp = w; w = h; h = tmp; }
  return {
    duracao: Number(j.format && j.format.duration || (v && v.duration) || (a && a.duration) || 0),
    largura: w, altura: h,
    fps: fpsP.length === 2 ? Number(fpsP[0]) / Number(fpsP[1]) : Number(fpsTxt),
    temVideo: !!v, temAudio: !!a
  };
}

function resolver(p, base) {
  if (!p) return null;
  if (path.isAbsolute(p)) return p;
  var cands = [path.resolve(base, p), path.resolve(PASTA_VIDEO, p), path.resolve(process.cwd(), p)];
  for (var i = 0; i < cands.length; i++) if (fs.existsSync(cands[i])) return cands[i];
  return path.resolve(base, p);
}

function escaparAss(s) {
  return String(s).replace(/\{/g, "(").replace(/\}/g, ")").replace(/\r?\n/g, "\\N");
}

function tempoAss(t) {
  if (t < 0) t = 0;
  var h = Math.floor(t / 3600), m = Math.floor((t % 3600) / 60), s = t % 60;
  return h + ":" + String(m).padStart(2, "0") + ":" + s.toFixed(2).padStart(5, "0");
}

// ---------------------------------------------------------------- argumentos

var argv = process.argv.slice(2);
var planoArg = argv.filter(function (a) { return a[0] !== "-"; })[0];
var RAPIDO = argv.indexOf("--rapido") >= 0;
var SO_ASS = argv.indexOf("--so-ass") >= 0;
var MANTER = argv.indexOf("--manter-temporarios") >= 0;
if (!planoArg) falhar("uso: node video/editar.js trabalho/<nome>/plano.json [--rapido] [--so-ass]");

var planoPath = path.resolve(planoArg);
if (!fs.existsSync(planoPath)) falhar("plano não encontrado: " + planoPath);
var plano;
try { plano = JSON.parse(fs.readFileSync(planoPath, "utf8")); } catch (e) { falhar("o plano não é um JSON válido: " + e.message); }
var pastaPlano = path.dirname(planoPath);
var pastaTrabalho = path.join(pastaPlano, "_render");
fs.mkdirSync(pastaTrabalho, { recursive: true });

// ---------------------------------------------------------------- entrada

var entrada = resolver(plano.entrada, pastaPlano);
if (!entrada || !fs.existsSync(entrada)) falhar("vídeo de entrada não encontrado: " + (plano.entrada || "(campo 'entrada' vazio)"));
var info = sondar(entrada);
if (!info.temVideo) falhar("o arquivo de entrada não tem vídeo: " + entrada);
console.log("Entrada: " + path.basename(entrada) + " · " + info.largura + "x" + info.altura + " · " + fmt(info.duracao) + "s · " + (info.temAudio ? "com áudio" : "SEM áudio"));

var saida = plano.saida ? (path.isAbsolute(plano.saida) ? plano.saida : path.resolve(PASTA_VIDEO, plano.saida)) : path.join(PASTA_VIDEO, "saida", path.basename(entrada).replace(/\.[^.]+$/, "") + "-editado.mp4");
if (RAPIDO) saida = saida.replace(/\.mp4$/i, "") + "-previa.mp4";
fs.mkdirSync(path.dirname(saida), { recursive: true });

// ---------------------------------------------------------------- geometria

var formatos = { "9:16": [1080, 1920], "1:1": [1080, 1080], "16:9": [1920, 1080], "4:5": [1080, 1350] };
var W, H;
if (plano.formato === "manter" || !plano.formato && info.largura) { W = info.largura - (info.largura % 2); H = info.altura - (info.altura % 2); }
else if (formatos[plano.formato]) { W = formatos[plano.formato][0]; H = formatos[plano.formato][1]; }
else falhar("formato desconhecido: " + plano.formato + " (use 9:16, 1:1, 16:9, 4:5 ou manter)");
if (RAPIDO) { W = Math.round(W / 2 / 2) * 2; H = Math.round(H / 2 / 2) * 2; }
var focoX = num(plano.foco_x, 0.5), focoY = num(plano.foco_y, 0.5);

// ---------------------------------------------------------------- cortes e linha do tempo

var cortes = Array.isArray(plano.cortes) && plano.cortes.length ? plano.cortes : [{ ini: 0, fim: info.duracao }];
var segmentos = [];
var acumulado = 0;
var arquivosExtras = {}; // outros clipes usados nos cortes (b-roll) → índice de input
cortes.forEach(function (c, i) {
  var arq = c.arquivo ? resolver(c.arquivo, pastaPlano) : null;
  var infoSeg = info;
  if (arq) {
    if (!fs.existsSync(arq)) falhar("corte " + (i + 1) + ": arquivo não encontrado: " + c.arquivo);
    if (!arquivosExtras[arq]) arquivosExtras[arq] = { info: sondar(arq) };
    infoSeg = arquivosExtras[arq].info;
  }
  var ini = num(c.ini, 0), fim = num(c.fim, infoSeg.duracao);
  if (fim > infoSeg.duracao + 0.05) { aviso("corte " + (i + 1) + ": fim " + fmt(fim) + "s passa da duração (" + fmt(infoSeg.duracao) + "s); ajustado"); fim = infoSeg.duracao; }
  if (fim - ini < 0.05) falhar("corte " + (i + 1) + ": trecho vazio (" + ini + " → " + fim + ")");
  var vel = num(c.velocidade, 1);
  if (vel <= 0) falhar("corte " + (i + 1) + ": velocidade precisa ser maior que zero");
  var durSaida = (fim - ini) / vel;
  segmentos.push({ ini: ini, fim: fim, vel: vel, zoom: num(c.zoom, 1), mudo: !!c.mudo, arquivo: arq, inicioSaida: acumulado, durSaida: durSaida, principal: !arq });
  acumulado += durSaida;
});
var DUR = acumulado;
var tempoOriginal = plano.tempos !== "saida";

// t no vídeo original → t no vídeo final (null se caiu num corte)
function mapT(t) {
  if (!tempoOriginal) return t;
  for (var i = 0; i < segmentos.length; i++) {
    var s = segmentos[i];
    if (!s.principal) continue;
    var ultimo = i === segmentos.length - 1;
    if (t >= s.ini && (t < s.fim || (ultimo && t <= s.fim + 0.001))) return s.inicioSaida + (t - s.ini) / s.vel;
  }
  return null;
}
// intervalo no original → pedaços no final (pode virar mais de um, se atravessa um corte)
function mapIntervalo(a, b) {
  if (!tempoOriginal) return (b > a) ? [{ ini: a, fim: Math.min(b, DUR) }] : [];
  var out = [];
  segmentos.forEach(function (s) {
    if (!s.principal) return;
    var lo = Math.max(a, s.ini), hi = Math.min(b, s.fim);
    if (hi - lo > 0.02) out.push({ ini: s.inicioSaida + (lo - s.ini) / s.vel, fim: s.inicioSaida + (hi - s.ini) / s.vel });
  });
  return out;
}

console.log("Cortes: " + segmentos.length + " trecho(s) → " + fmt(DUR) + "s no final (" + fmt(info.duracao) + "s no original)");

// ---------------------------------------------------------------- legendas (ASS)

var leg = plano.legendas || {};
var estiloLeg = leg.estilo || "palavra";
var tamLeg = Math.round(H * num(leg.tamanho, 0.036));
var corDestaque = leg.cor_destaque || CORES.coral;
var corTexto = leg.cor || CORES.branco;
var corContorno = leg.cor_contorno || CORES.preto;
var maiusculas = !!leg.maiusculas;
var margens = { L: Math.round(W * 0.07), R: Math.round(W * 0.07) };
var posLeg = leg.posicao || "baixo";
var margemVLeg = { baixo: Math.round(H * 0.30), centro: 0, cima: Math.round(H * 0.16) }[posLeg];
if (margemVLeg === undefined) falhar("legendas.posicao desconhecida: " + posLeg);
var alinLeg = { baixo: 2, centro: 5, cima: 8 }[posLeg];

var tamTit = Math.round(H * 0.044);
var linhasAss = [];
var estilos = [];
function estilo(nome, fonte, tam, cor, contorno, fundo, borda, espessura, sombra, alin, mv) {
  estilos.push("Style: " + nome + "," + fonte + "," + tam + "," + corAss(cor) + "," + corAss(corDestaque) + "," + corAss(contorno) + "," + fundo + ",-1,0,0,0,100,100,0,0," + borda + "," + espessura + "," + sombra + "," + alin + "," + margens.L + "," + margens.R + "," + mv + ",1");
}
var FONTE = leg.fonte || "Poppins ExtraBold";
estilo("Legenda", FONTE, tamLeg, corTexto, corContorno, corAss(CORES.preto, 0.5), 1, Math.max(2, Math.round(tamLeg * 0.09)), Math.max(1, Math.round(tamLeg * 0.04)), alinLeg, margemVLeg);
estilo("Limpo", FONTE, tamTit, CORES.branco, CORES.preto, corAss(CORES.preto, 0.5), 1, Math.round(tamTit * 0.1), Math.round(tamTit * 0.05), 8, Math.round(H * 0.12));
estilo("Caixa", FONTE, tamTit, CORES.creme, CORES.teal, corAss(CORES.teal), 3, Math.round(tamTit * 0.32), 0, 8, Math.round(H * 0.12));
estilo("Destaque", FONTE, Math.round(tamTit * 1.15), CORES.coral, CORES.teal, corAss(CORES.teal, 0.5), 1, Math.round(tamTit * 0.12), Math.round(tamTit * 0.05), 8, Math.round(H * 0.12));

function quebrar(palavras, maxChars) {
  // quebra em linhas (no máximo 3), sem partir palavra
  var linhas = [[]], atual = 0;
  palavras.forEach(function (p) {
    var len = p.txt.length;
    if (atual > 0 && atual + 1 + len > maxChars) { linhas.push([]); atual = 0; }
    linhas[linhas.length - 1].push(p);
    atual += (atual > 0 ? 1 : 0) + len;
  });
  return linhas;
}

var totalLegendas = 0, totalLinhasLeg = 0, legendasCaidas = 0;
var frases = Array.isArray(leg.frases) ? leg.frases : [];
if (estiloLeg !== "nenhum" && frases.length) {
  var maxChars = Math.max(10, Math.floor((W - margens.L - margens.R) / (tamLeg * 0.56)));
  var destaques = {};
  frases.forEach(function (f) {
    var ws = Array.isArray(f.palavras) && f.palavras.length ? f.palavras : String(f.texto || "").split(/\s+/).filter(Boolean).map(function (w, i, arr) {
      var dur = (num(f.fim, 0) - num(f.ini, 0)) / arr.length; return { w: w, ini: num(f.ini, 0) + i * dur, fim: num(f.ini, 0) + (i + 1) * dur };
    });
    var desta = (f.destaque || []).map(function (d) { return String(d).toLowerCase().replace(/[.,!?;:]/g, ""); });
    var ps = ws.map(function (w) {
      var limpo = String(w.w).trim();
      var forte = desta.indexOf(limpo.toLowerCase().replace(/[.,!?;:]/g, "")) >= 0;
      var txt = (maiusculas || forte) ? limpo.toUpperCase() : limpo;
      return { txt: escaparAss(txt), ini: num(w.ini, f.ini), fim: num(w.fim, f.fim), forte: forte };
    });
    if (!ps.length) return;
    var fIni = num(f.ini, ps[0].ini), fFim = num(f.fim, ps[ps.length - 1].fim);
    var linhas = quebrar(ps, maxChars);
    if (linhas.length > 3) aviso("legenda com " + linhas.length + " linhas (\"" + ps.slice(0, 4).map(function (p) { return p.txt; }).join(" ") + "…\") — quebre a frase no plano");
    totalLegendas++;

    function texto(ativo) {
      return linhas.map(function (linha) {
        return linha.map(function (p) {
          var idx = ps.indexOf(p);
          var cor = p.forte ? corDestaque : corTexto;
          if (idx === ativo) return "{\\1c" + corAss(corDestaque) + "\\fscx104\\fscy104\\t(0,80,\\fscx112\\fscy112)}" + p.txt + "{\\1c" + corAss(corTexto) + "\\fscx100\\fscy100}";
          return p.forte ? "{\\1c" + corAss(cor) + "}" + p.txt + "{\\1c" + corAss(corTexto) + "}" : p.txt;
        }).join(" ");
      }).join("\\N");
    }

    if (estiloLeg === "frase") {
      mapIntervalo(fIni, fFim).forEach(function (iv) {
        linhasAss.push("Dialogue: 0," + tempoAss(iv.ini) + "," + tempoAss(iv.fim) + ",Legenda,,0,0,0,,{\\fad(100,60)}" + texto(-1));
        totalLinhasLeg++;
      });
      return;
    }
    // estilo "palavra": a frase inteira fica na tela; a palavra falada acende
    var janelas = [];
    ps.forEach(function (p, i) {
      var a = i === 0 ? Math.min(fIni, p.ini) : p.ini;
      var b = i + 1 < ps.length ? ps[i + 1].ini : Math.max(fFim, p.fim);
      if (b - a < 0.04 && janelas.length) { janelas[janelas.length - 1].fim = b; return; }
      janelas.push({ ini: a, fim: b, ativo: i });
    });
    janelas.forEach(function (j) {
      var pedacos = mapIntervalo(j.ini, j.fim);
      if (!pedacos.length) legendasCaidas++;
      pedacos.forEach(function (iv) {
        linhasAss.push("Dialogue: 0," + tempoAss(iv.ini) + "," + tempoAss(iv.fim) + ",Legenda,,0,0,0,," + texto(j.ativo));
        totalLinhasLeg++;
      });
    });
  });
}

// ---------------------------------------------------------------- textos na tela

var textos = Array.isArray(plano.textos) ? plano.textos : [];
var totalTextos = 0;
function marcarEnfase(txt, corBase) {
  // *palavra* vira coral
  return txt.replace(/\*([^*]+)\*/g, "{\\1c" + corAss(CORES.coral) + "}$1{\\1c" + corAss(corBase) + "}");
}
textos.forEach(function (tx, i) {
  if (!tx.texto) return;
  var est = { caixa: "Caixa", limpo: "Limpo", destaque: "Destaque" }[tx.estilo || "caixa"];
  if (!est) falhar("textos[" + i + "].estilo desconhecido: " + tx.estilo);
  var corBase = { Caixa: CORES.creme, Limpo: CORES.branco, Destaque: CORES.coral }[est];
  var pos = tx.posicao || "cima";
  var an, x, y;
  if (typeof pos === "object") { an = 5; x = Math.round(num(pos.x, 0.5) * W); y = Math.round(num(pos.y, 0.5) * H); }
  else if (pos === "cima") { an = 8; x = W / 2; y = Math.round(H * 0.12); }
  else if (pos === "centro") { an = 5; x = W / 2; y = H / 2; }
  else if (pos === "baixo") { an = 2; x = W / 2; y = H - Math.round(H * 0.30); }
  else falhar("textos[" + i + "].posicao desconhecida: " + JSON.stringify(pos));
  var tam = num(tx.tamanho, 1);
  var base = "\\an" + an + (tam !== 1 ? "\\fs" + Math.round((est === "Destaque" ? tamTit * 1.15 : tamTit) * tam) : "");
  var corpo = marcarEnfase(escaparAss(tx.texto), corBase);
  var anim = tx.animacao || "pop";
  var pedacos = mapIntervalo(num(tx.ini, 0), num(tx.fim, num(tx.ini, 0) + 3));
  if (!pedacos.length) { aviso("textos[" + i + "] \"" + tx.texto + "\" cai inteiro num trecho cortado; não aparece"); return; }
  totalTextos++;
  pedacos.forEach(function (iv, k) {
    var primeiro = k === 0;
    var tags;
    if (!primeiro || anim === "nenhuma") tags = "{" + base + "\\pos(" + x + "," + y + ")}";
    else if (anim === "pop") tags = "{" + base + "\\pos(" + x + "," + y + ")\\fad(0,120)\\fscx30\\fscy30\\t(0,150,\\fscx106\\fscy106)\\t(150,240,\\fscx100\\fscy100)}";
    else if (anim === "subir") tags = "{" + base + "\\move(" + x + "," + (y + Math.round(H * 0.03)) + "," + x + "," + y + ",0,220)\\fad(160,120)}";
    else if (anim === "fade") tags = "{" + base + "\\pos(" + x + "," + y + ")\\fad(220,220)}";
    else if (anim === "digitar") {
      // uma linha por letra que aparece
      var puro = escaparAss(tx.texto).replace(/\*/g, "");
      var passo = 0.045, t = iv.ini;
      for (var c = 1; c < puro.length; c++) {
        if (t + passo >= iv.fim) break;
        linhasAss.push("Dialogue: 1," + tempoAss(t) + "," + tempoAss(t + passo) + "," + est + ",,0,0,0,,{" + base + "\\pos(" + x + "," + y + ")}" + puro.slice(0, c) + "▌");
        t += passo;
      }
      linhasAss.push("Dialogue: 1," + tempoAss(t) + "," + tempoAss(iv.fim) + "," + est + ",,0,0,0,,{" + base + "\\pos(" + x + "," + y + ")\\fad(0,120)}" + corpo);
      return;
    }
    else falhar("textos[" + i + "].animacao desconhecida: " + anim + " (use pop, subir, fade, digitar ou nenhuma)");
    linhasAss.push("Dialogue: 1," + tempoAss(iv.ini) + "," + tempoAss(iv.fim) + "," + est + ",,0,0,0,," + tags + corpo);
  });
});

var ass = [
  "[Script Info]", "ScriptType: v4.00+", "PlayResX: " + W, "PlayResY: " + H, "WrapStyle: 2", "ScaledBorderAndShadow: yes", "",
  "[V4+ Styles]",
  "Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding"
].concat(estilos).concat(["", "[Events]", "Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text"]).concat(linhasAss).join("\n") + "\n";
var assPath = path.join(pastaTrabalho, "legendas.ass");
fs.writeFileSync(assPath, ass);
// fontes ao lado do .ass, para o caminho não precisar de escape no filtro
var fontesLocal = path.join(pastaTrabalho, "fontes");
fs.mkdirSync(fontesLocal, { recursive: true });
fs.readdirSync(PASTA_FONTES).forEach(function (f) { if (/\.(ttf|otf)$/i.test(f)) fs.copyFileSync(path.join(PASTA_FONTES, f), path.join(fontesLocal, f)); });
console.log("Legendas: " + totalLegendas + " frase(s), " + totalLinhasLeg + " linha(s) de legenda · Textos: " + totalTextos + (legendasCaidas ? " · " + legendasCaidas + " janela(s) de legenda caíram em cortes" : ""));
if (SO_ASS) { console.log("Arquivo de legendas: " + assPath); process.exit(0); }

// ---------------------------------------------------------------- animações de câmera (zoompan)

var animacoes = Array.isArray(plano.animacoes) ? plano.animacoes : [];
var termosZoom = [], termosX = [], termosY = [];
var totalAnim = 0;
animacoes.forEach(function (an, i) {
  var tipo = an.tipo || "zoom";
  var pedacos = mapIntervalo(num(an.ini, 0), num(an.fim, num(an.ini, 0) + 1));
  if (!pedacos.length) { aviso("animacoes[" + i + "] (" + tipo + ") cai num trecho cortado; ignorada"); return; }
  totalAnim++;
  pedacos.forEach(function (iv) {
    var a = fmt(iv.ini), b = fmt(iv.fim);
    var dentro = "between(T," + a + "," + b + ")";
    if (tipo === "zoom" || tipo === "punch") {
      var f = num(an.fator, 1.15);
      var ein = Math.max(0.001, num(an.entrada, tipo === "punch" ? 0.06 : 0.25));
      var eout = num(an.saida, tipo === "punch" ? 0 : 0.25);
      var rampa = "min(1,(T-" + a + ")/" + ein + ")" + (eout > 0 ? "*min(1,(" + b + "-T)/" + eout + ")" : "");
      termosZoom.push("if(" + dentro + "," + fmt(f - 1) + "*" + rampa + ",0)");
    } else if (tipo === "zoom_lento") {
      var f2 = num(an.fator, 1.12);
      termosZoom.push("if(" + dentro + "," + fmt(f2 - 1) + "*(T-" + a + ")/" + fmt(Math.max(0.01, iv.fim - iv.ini)) + ",0)");
    } else if (tipo === "tremor") {
      var amp = Math.round(num(an.forca, 1) * W * 0.012);
      termosZoom.push("if(" + dentro + ",0.04,0)");
      termosX.push("if(" + dentro + ",(random(0)-0.5)*" + amp + ",0)");
      termosY.push("if(" + dentro + ",(random(1)-0.5)*" + amp + ",0)");
    } else falhar("animacoes[" + i + "].tipo desconhecido: " + tipo + " (use zoom, punch, zoom_lento ou tremor)");
  });
});
var filtroZoom = null;
if (termosZoom.length) {
  var T = "(in/" + FPS + ")";
  var z = "(1+" + termosZoom.join("+").split("T").join(T) + ")";
  var jx = termosX.length ? "+" + termosX.join("+").split("T").join(T) : "";
  var jy = termosY.length ? "+" + termosY.join("+").split("T").join(T) : "";
  filtroZoom = "zoompan=z='" + z + "':x='iw/2-(iw/zoom/2)" + jx + "':y='ih/2-(ih/zoom/2)" + jy + "':d=1:s=" + W + "x" + H + ":fps=" + FPS;
}
console.log("Animações: " + totalAnim);

// ---------------------------------------------------------------- passo 1: cortar e enquadrar

var passo1 = path.join(pastaTrabalho, "cortado.mp4");
var inputs = ["-i", entrada];
var nInputs = 1;
var idxArquivo = {}; idxArquivo[entrada] = 0;
Object.keys(arquivosExtras).forEach(function (arq) { idxArquivo[arq] = nInputs++; inputs.push("-i", arq); });
var precisaSilencio = segmentos.some(function (s) { return s.principal ? !info.temAudio : !arquivosExtras[s.arquivo].info.temAudio; }) || segmentos.some(function (s) { return s.mudo; });
var idxSil = -1;
if (precisaSilencio) { idxSil = nInputs++; inputs.push("-f", "lavfi", "-i", "anullsrc=r=48000:cl=stereo"); }

var fc = [];
segmentos.forEach(function (s, i) {
  var idx = s.principal ? 0 : idxArquivo[s.arquivo];
  var infoS = s.principal ? info : arquivosExtras[s.arquivo].info;
  var z = s.zoom;
  var esc = "scale=" + Math.round(W * z) + ":" + Math.round(H * z) + ":force_original_aspect_ratio=increase:flags=lanczos";
  var crop = "crop=" + W + ":" + H + ":(iw-" + W + ")*" + focoX + ":(ih-" + H + ")*" + focoY;
  var vel = s.vel !== 1 ? ",setpts=PTS/" + s.vel : "";
  fc.push("[" + idx + ":v]trim=" + fmt(s.ini) + ":" + fmt(s.fim) + ",setpts=PTS-STARTPTS" + vel + "," + esc + "," + crop + ",fps=" + FPS + ",setsar=1,format=yuv420p[v" + i + "]");
  var temA = infoS.temAudio && !s.mudo;
  if (temA) {
    var at = "";
    if (s.vel !== 1) { // atempo aceita 0.5–100 por instância; encadeia se precisar
      var v = s.vel; while (v > 2) { at += ",atempo=2"; v /= 2; } while (v < 0.5) { at += ",atempo=0.5"; v /= 0.5; } at += ",atempo=" + fmt(v);
    }
    fc.push("[" + idx + ":a]atrim=" + fmt(s.ini) + ":" + fmt(s.fim) + ",asetpts=PTS-STARTPTS" + at + ",aformat=sample_fmts=fltp:sample_rates=48000:channel_layouts=stereo[a" + i + "]");
  } else {
    fc.push("[" + idxSil + ":a]atrim=0:" + fmt(s.durSaida) + ",asetpts=PTS-STARTPTS,aformat=sample_fmts=fltp:sample_rates=48000:channel_layouts=stereo[a" + i + "]");
  }
});
var concatIn = segmentos.map(function (s, i) { return "[v" + i + "][a" + i + "]"; }).join("");
fc.push(concatIn + "concat=n=" + segmentos.length + ":v=1:a=1[vc][ac]");

var qualidade = RAPIDO ? ["-preset", "ultrafast", "-crf", "30"] : ["-preset", "fast", "-crf", "17"];
console.log("Passo 1/2: cortando e enquadrando (" + W + "x" + H + ")…");
rodar(inputs.concat(["-filter_complex", fc.join(";"), "-map", "[vc]", "-map", "[ac]", "-c:v", "libx264"], qualidade, ["-pix_fmt", "yuv420p", "-c:a", "pcm_s16le", "-f", "mov", passo1.replace(/\.mp4$/, ".mov")]), "passo 1 (cortes)");
passo1 = passo1.replace(/\.mp4$/, ".mov");

// ---------------------------------------------------------------- passo 2: legendas, zoom, som

var audio = plano.audio || {};
var inputs2 = ["-i", passo1];
var nInputs2 = 1;
var fc2 = [];
var cadeiaVoz = "[0:a]";
var vozFiltros = [];
if (audio.remover_ruido) vozFiltros.push("afftdn=nf=-25:nt=w");
if (audio.normalizar !== false) vozFiltros.push("loudnorm=I=-16:TP=-1.5:LRA=11", "aresample=48000");
if (num(audio.volume, 1) !== 1) vozFiltros.push("volume=" + num(audio.volume, 1));
fc2.push(cadeiaVoz + (vozFiltros.length ? vozFiltros.join(",") : "anull") + "[voz]");

var mixIn = ["[voz]"];
var totalSfx = 0, totalSfxCaidos = 0;

// trilha
var trilha = plano.trilha;
var trilhaNome = null;
if (trilha && (trilha.arquivo || trilha.clima)) {
  var arqT = null;
  if (trilha.arquivo) arqT = resolver(trilha.arquivo, pastaPlano);
  if ((!arqT || !fs.existsSync(arqT)) && trilha.arquivo && fs.existsSync(path.join(PASTA_TRILHAS, trilha.arquivo))) arqT = path.join(PASTA_TRILHAS, trilha.arquivo);
  if ((!arqT || !fs.existsSync(arqT)) && trilha.clima) {
    var cat = JSON.parse(fs.readFileSync(path.join(PASTA_TRILHAS, "..", "trilhas.json"), "utf8")).trilhas;
    var achada = cat.filter(function (t) { return t.clima === trilha.clima; })[0];
    if (achada) arqT = path.join(PASTA_TRILHAS, achada.arquivo);
  }
  if (!arqT || !fs.existsSync(arqT)) falhar("trilha não encontrada: " + JSON.stringify(trilha));
  trilhaNome = path.basename(arqT);
  var idxT = nInputs2++;
  inputs2.push("-stream_loop", "-1", "-i", arqT);
  var tIni = num(trilha.ini, 0), tFim = Math.min(DUR, num(trilha.fim, DUR));
  var fadeIn = num(trilha.fade_inicio, 1.0), fadeOut = num(trilha.fade_fim, 1.5);
  var durT = tFim - tIni;
  var cadeiaT = "[" + idxT + ":a]atrim=0:" + fmt(durT) + ",asetpts=PTS-STARTPTS,aformat=sample_fmts=fltp:sample_rates=48000:channel_layouts=stereo,loudnorm=I=-20:TP=-2:LRA=7,aresample=48000,volume=" + num(trilha.volume, 0.3) + ",afade=t=in:st=0:d=" + fmt(fadeIn) + ",afade=t=out:st=" + fmt(Math.max(0, durT - fadeOut)) + ":d=" + fmt(fadeOut) + (tIni > 0 ? ",adelay=" + Math.round(tIni * 1000) + ":all=1" : "") + "[mus]";
  fc2.push(cadeiaT);
  if (trilha.ducking !== false) {
    fc2[0] = fc2[0].replace("[voz]", "[vozpre]");
    fc2.push("[vozpre]asplit=2[voz][vozsc]");
    fc2.push("[mus][vozsc]sidechaincompress=threshold=" + num(trilha.ducking_limiar, 0.02) + ":ratio=" + num(trilha.ducking_razao, 8) + ":attack=30:release=" + num(trilha.ducking_solta, 600) + ":makeup=1[musd]");
    mixIn.push("[musd]");
  } else mixIn.push("[mus]");
}

// efeitos sonoros
var sfxs = Array.isArray(plano.efeitos_sonoros) ? plano.efeitos_sonoros : [];
sfxs.forEach(function (s, i) {
  var nome = s.nome || s.arquivo;
  if (!nome) return;
  var arq = resolver(nome, pastaPlano);
  if (!fs.existsSync(arq)) arq = path.join(PASTA_SFX, nome + (/\.\w+$/.test(nome) ? "" : ".wav"));
  if (!fs.existsSync(arq)) falhar("efeito sonoro não encontrado: " + nome + " (veja video/biblioteca/sfx.json)");
  var em = num(s.em, 0);
  if (s.alinhar === "fim") em -= sondar(arq).duracao;
  var t = mapT(em);
  if (t === null) { totalSfxCaidos++; return; }
  t += num(s.atraso, 0);
  if (t < 0) t = 0;
  var idx = nInputs2++;
  inputs2.push("-i", arq);
  fc2.push("[" + idx + ":a]aformat=sample_fmts=fltp:sample_rates=48000:channel_layouts=stereo,volume=" + num(s.volume, 0.5) + ",adelay=" + Math.round(t * 1000) + ":all=1[s" + i + "]");
  mixIn.push("[s" + i + "]");
  totalSfx++;
});
if (totalSfxCaidos) aviso(totalSfxCaidos + " efeito(s) sonoro(s) caíram em trechos cortados");

if (mixIn.length > 1) fc2.push(mixIn.join("") + "amix=inputs=" + mixIn.length + ":duration=first:dropout_transition=0:normalize=0,alimiter=limit=0.97[aout]");
else fc2.push("[voz]alimiter=limit=0.97[aout]");

var cadeiaV = "[0:v]" + (filtroZoom ? filtroZoom + "," : "") + "ass=legendas.ass:fontsdir=fontes,format=yuv420p[vout]";
fc2.push(cadeiaV);

console.log("Passo 2/2: legendas" + (filtroZoom ? ", zoom" : "") + ", " + totalSfx + " efeito(s)" + (trilhaNome ? ", trilha " + trilhaNome : "") + "…");
var q2 = RAPIDO ? ["-preset", "ultrafast", "-crf", "30"] : ["-preset", "medium", "-crf", "18"];
rodar(inputs2.concat(["-filter_complex", fc2.join(";"), "-map", "[vout]", "-map", "[aout]", "-c:v", "libx264"], q2, ["-pix_fmt", "yuv420p", "-r", String(FPS), "-c:a", "aac", "-b:a", "192k", "-movflags", "+faststart", "-t", fmt(DUR), saida]), "passo 2 (legendas e som)", pastaTrabalho);

var resumo = {
  entrada: entrada, saida: saida, previa: RAPIDO,
  duracao_original: Math.round(info.duracao * 100) / 100, duracao_final: Math.round(DUR * 100) / 100,
  formato: W + "x" + H, trechos: segmentos.length, frases_legenda: totalLegendas, textos: totalTextos,
  animacoes: totalAnim, efeitos_sonoros: totalSfx, trilha: trilhaNome, quando: new Date().toISOString()
};
fs.writeFileSync(path.join(pastaPlano, "resumo.json"), JSON.stringify(resumo, null, 2));
if (!MANTER) { try { fs.unlinkSync(passo1); } catch (e) {} }
console.log("\n✓ Pronto: " + saida + " (" + fmt(DUR) + "s)");
