#!/usr/bin/env node
// Tira quadros do vídeo renderizado para o editor conferir o resultado com os
// próprios olhos: uma grade com um quadro a cada N segundos e, se pedido,
// quadros em instantes exatos (onde entra um texto, uma legenda, um zoom).
//
// Uso:
//   node video/revisar.js saida/meu-video.mp4                  grade a cada 2 s
//   node video/revisar.js saida/meu-video.mp4 --cada 1         grade a cada 1 s
//   node video/revisar.js saida/meu-video.mp4 --em 1.5,4,9.2   quadros nesses instantes
//   node video/revisar.js saida/meu-video.mp4 --plano trabalho/x/plano.json
//        quadros no início de cada texto e de cada animação do plano (tempos já convertidos)
//
// Os arquivos saem em <pasta do vídeo>/revisao-<nome>/.
"use strict";
var fs = require("fs");
var path = require("path");
var cp = require("child_process");

var argv = process.argv.slice(2);
var video = argv.filter(function (a) { return a[0] !== "-"; })[0];
function opc(nome, padrao) { var i = argv.indexOf(nome); return i >= 0 && argv[i + 1] !== undefined ? argv[i + 1] : padrao; }
if (!video || !fs.existsSync(video)) { console.error("uso: node video/revisar.js <video.mp4> [--cada s] [--em t1,t2] [--plano plano.json]"); process.exit(1); }
video = path.resolve(video);

var pasta = path.join(path.dirname(video), "revisao-" + path.basename(video).replace(/\.[^.]+$/, ""));
fs.mkdirSync(pasta, { recursive: true });
fs.readdirSync(pasta).forEach(function (f) { fs.unlinkSync(path.join(pasta, f)); });

var r = cp.spawnSync("ffprobe", ["-v", "error", "-show_entries", "format=duration:stream=width,height", "-of", "json", video], { encoding: "utf8" });
var j = JSON.parse(r.stdout);
var dur = Number(j.format.duration);
var vs = j.streams.filter(function (s) { return s.width; })[0];
var W = vs.width, H = vs.height;

function ffmpeg(args) {
  var x = cp.spawnSync("ffmpeg", ["-hide_banner", "-loglevel", "error", "-y"].concat(args), { stdio: "inherit" });
  if (x.status !== 0) { console.error("ffmpeg falhou"); process.exit(1); }
}

// grade
var cada = Number(opc("--cada", 2));
var n = Math.max(1, Math.floor(dur / cada));
var cols = Math.min(6, Math.max(2, Math.ceil(Math.sqrt(n * (H / W))))); // colunas ajustadas ao formato
var linhas = Math.ceil(n / cols);
var larguraCelula = Math.min(360, Math.floor(1800 / cols));
var grade = path.join(pasta, "grade.jpg");
ffmpeg(["-i", video, "-vf", "fps=1/" + cada + ",scale=" + larguraCelula + ":-2,drawtext=fontfile=" + path.join(__dirname, "biblioteca", "fontes", "Poppins-Bold.ttf") + ":text='%{pts\\:hms}':x=8:y=8:fontsize=22:fontcolor=white:box=1:boxcolor=black@0.6:boxborderw=6,tile=" + cols + "x" + linhas + ":padding=4:margin=4:color=0x222222", "-frames:v", "1", "-q:v", "3", grade]);
console.log("grade: " + grade + " (" + n + " quadros, um a cada " + cada + "s)");

// instantes
var instantes = [];
var em = opc("--em", null);
if (em) instantes = em.split(",").map(Number).filter(function (t) { return isFinite(t); });
var planoArg = opc("--plano", null);
if (planoArg) {
  var plano = JSON.parse(fs.readFileSync(planoArg, "utf8"));
  var resumoPath = path.join(path.dirname(planoArg), "resumo.json");
  // se os tempos do plano são do original, converte pela lista de cortes
  var cortes = Array.isArray(plano.cortes) && plano.cortes.length ? plano.cortes : null;
  function mapT(t) {
    if (!cortes || plano.tempos === "saida") return t;
    var acc = 0;
    for (var i = 0; i < cortes.length; i++) {
      var c = cortes[i], vel = c.velocidade || 1;
      if (!c.arquivo && t >= c.ini && t < c.fim) return acc + (t - c.ini) / vel;
      acc += (c.fim - c.ini) / vel;
    }
    return null;
  }
  (plano.textos || []).forEach(function (tx) { var t = mapT(tx.ini); if (t !== null) instantes.push(t + 0.35); });
  (plano.animacoes || []).forEach(function (an) { var t = mapT(an.ini); if (t !== null) instantes.push(t + 0.3); });
  void resumoPath;
}
instantes = instantes.filter(function (t, i, a) { return t >= 0 && t < dur && a.indexOf(t) === i; }).sort(function (a, b) { return a - b; });
instantes.forEach(function (t) {
  var nome = "quadro-" + t.toFixed(2).replace(".", "s") + ".jpg";
  ffmpeg(["-ss", String(t), "-i", video, "-frames:v", "1", "-vf", "scale=" + Math.min(W, 720) + ":-2", "-q:v", "3", path.join(pasta, nome)]);
  console.log("quadro em " + t.toFixed(2) + "s: " + path.join(pasta, nome));
});

// forma de onda do áudio final: mostra se a trilha abaixa quando a voz entra
var onda = path.join(pasta, "audio.png");
ffmpeg(["-i", video, "-filter_complex", "[0:a]showwavespic=s=1600x240:colors=0x348a8e|0xfc9082:split_channels=0[w]", "-map", "[w]", "-frames:v", "1", onda]);
console.log("áudio: " + onda);
