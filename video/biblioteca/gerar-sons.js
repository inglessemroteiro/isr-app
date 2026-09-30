#!/usr/bin/env node
// Gera a biblioteca de sons do editor: efeitos sonoros curtos (sfx/) e
// trilhas de fundo (trilhas/), tudo sintetizado pelo próprio ffmpeg.
//
// Por que sintetizar em vez de baixar: nenhum arquivo aqui tem dono. Pode
// ir para qualquer reel, de qualquer conta, sem pedir licença a ninguém.
// A Gabi pode (e deve) colocar músicas melhores em trilhas/ — o catálogo
// trilhas.json diz ao editor o clima de cada uma.
//
// Uso: node video/biblioteca/gerar-sons.js [--forcar]
"use strict";
var fs = require("fs");
var path = require("path");
var cp = require("child_process");

var raiz = __dirname;
var forcar = process.argv.indexOf("--forcar") >= 0;
var SR = 48000;

function ffmpeg(args) {
  var r = cp.spawnSync("ffmpeg", ["-hide_banner", "-loglevel", "error", "-y"].concat(args), { stdio: "inherit" });
  if (r.status !== 0) throw new Error("ffmpeg falhou: " + args.join(" "));
}

// ---------- efeitos sonoros ----------
// Cada efeito: expressão do aevalsrc (t em segundos) + duração + filtros extras.
var sfx = {
  // estalo curto, para texto que aparece / bolinha de ênfase
  pop:  { d: 0.18, e: "0.9*sin(2*PI*(500+1500*exp(-t*60))*t)*exp(-t*30)" },
  // sopro de ar, para transição / texto que entra deslizando
  whoosh: { d: 0.6, src: "anoisesrc=c=pink:r=" + SR + ":a=0.8:d=0.6", f: "highpass=f=500,lowpass=f=7000,afade=t=in:d=0.22,afade=t=out:st=0.28:d=0.32,volume=1.6" },
  // sininho, para acerto / ponto positivo
  ding: { d: 1.0, e: "0.55*(sin(2*PI*1318.5*t)+0.4*sin(2*PI*2637*t)+0.15*sin(2*PI*3951*t))*exp(-t*3.5)" },
  // pancada grave, para revelação / frase de impacto
  boom: { d: 0.9, e: "0.95*sin(2*PI*(42+110*exp(-t*22))*t)*exp(-t*4.5)" },
  // clique seco, para troca de item em lista
  click: { d: 0.06, src: "anoisesrc=c=white:r=" + SR + ":a=0.9:d=0.06", f: "highpass=f=1500,afade=t=out:st=0.005:d=0.05" },
  // buzina de erro (duas batidas), para 'errado' / 'não é assim'
  erro: { d: 0.42, e: "0.45*(2*gte(sin(2*PI*110*t),0)-1)*(lt(mod(t,0.21),0.16))*exp(-mod(t,0.21)*8)" },
  // subida de tensão, para antes da revelação
  subir: { d: 1.2, e: "0.5*sin(2*PI*(180*t+(700-180)*t*t/(2*1.2)))*min(1,t/1.2)*(1-0.5*exp(-8*(1.2-t)))" },
  // duas notas para cima, para 'acertou' / 'assim sim'
  acerto: { d: 0.7, e: "if(lt(t,0.14),0.6*sin(2*PI*523.25*t)*exp(-t*3),0.6*sin(2*PI*783.99*t)*exp(-(t-0.14)*4))" },
  // teclado digitando, para texto que aparece letra por letra
  digitar: { d: 0.6, e: "(random(0)-0.5)*lt(mod(t,0.085),0.012)*0.8", f: "highpass=f=1200" },
  // notificação de celular, para 'chegou mensagem'
  notificacao: { d: 0.36, e: "0.5*sin(2*PI*880*t)*lt(mod(t,0.18),0.11)*exp(-mod(t,0.18)*14)" },
  // 'tum' macio de coração/pulso, para momento emocional
  pulso: { d: 0.5, e: "0.7*sin(2*PI*70*t)*exp(-t*9)+0.5*sin(2*PI*70*(t-0.18))*exp(-(t-0.18)*9)*gte(t,0.18)" },
  // brilho, para palavra-chave / insight
  brilho: { d: 0.9, e: "0.35*(sin(2*PI*2093*t)+sin(2*PI*2637*t)*gte(t,0.08)+sin(2*PI*3136*t)*gte(t,0.16))*exp(-t*4)" }
};

// ---------- trilhas ----------
// Loops de 32 s, estéreo. Expressões periódicas em 32 s para o loop fechar.
function acorde(t, ciclo, dur, raizes) {
  // raizes: 4 frequências (uma por acorde). Devolve soma de tríade maior/menor por índice.
  var c = "floor(mod(" + t + "," + ciclo + ")/" + dur + ")";
  function sel(vals) {
    return "if(eq(" + c + ",0)," + vals[0] + ",if(eq(" + c + ",1)," + vals[1] + ",if(eq(" + c + ",2)," + vals[2] + "," + vals[3] + ")))";
  }
  return { c: c, sel: sel };
}

var trilhas = {
  // pad suave, C – Am – F – G, para reel de conversa/emoção
  calma: (function () {
    var a = acorde("t", 16, 4, null);
    var raiz = a.sel([261.63, 220.00, 174.61, 196.00]);
    var terca = a.sel([329.63, 261.63, 220.00, 246.94]);
    var quinta = a.sel([392.00, 329.63, 261.63, 293.66]);
    var env = "min(1,mod(t,4)*1.5)*min(1,(4-mod(t,4))*1.5)";
    var vib = "(1+0.004*sin(2*PI*5.5*t))";
    var voz = "(sin(2*PI*" + raiz + "*t*" + vib + ")+0.8*sin(2*PI*" + terca + "*t)+0.7*sin(2*PI*" + quinta + "*t)+0.5*sin(2*PI*" + raiz + "*0.5*t))";
    return { e: "0.16*" + env + "*" + voz, f: "lowpass=f=1600,aecho=0.7:0.5:90|180:0.25|0.15,volume=1.2" };
  })(),
  // batida 108 bpm com baixo e pluck, para reel de lista/energia
  energia: (function () {
    var b = 60 / 108; // duração de um tempo
    var bar = b * 4;  // compasso
    var bloco = bar * 4; // 4 compassos = 8.89 s → 32 s não fecha exato; usamos ciclo 16 compassos ≈ 35.6 s cortado em 32 s com fade
    var a = acorde("t", bar * 4, bar, null);
    var baixo = a.sel([110.00, 87.31, 130.81, 98.00]);
    var kick = "0.9*sin(2*PI*(48+120*exp(-mod(t," + b + ")*32))*mod(t," + b + "))*exp(-mod(t," + b + ")*10)";
    var hat = "(random(0)-0.5)*lt(mod(t+" + (b / 2) + "," + b + "),0.03)*exp(-mod(t+" + (b / 2) + "," + b + ")*90)*0.5";
    var bass = "0.35*sin(2*PI*" + baixo + "*t)*lt(mod(t," + b + ")," + (b * 0.7) + ")*exp(-mod(t," + b + ")*3)";
    var pluck = "0.22*sin(2*PI*" + baixo + "*4*t)*exp(-mod(t," + (b / 2) + ")*14)*(gt(mod(t," + bar + ")," + b + "))";
    return { e: "(" + kick + "+" + hat + "+" + bass + "+" + pluck + ")", f: "lowpass=f=9000,acompressor=threshold=0.3:ratio=3:attack=5:release=80,volume=0.9" };
  })(),
  // arpejo pentatônico 96 bpm com pad ao fundo, para reel leve/didático
  leve: (function () {
    var s = 60 / 96 / 2; // colcheia
    var idx = "mod(floor(t/" + s + "),8)";
    function nota(seq) {
      var e = String(seq[7]);
      for (var i = 6; i >= 0; i--) e = "if(eq(" + idx + "," + i + ")," + seq[i] + "," + e + ")";
      return e;
    }
    var arp = nota([392.00, 440.00, 523.25, 587.33, 659.25, 587.33, 523.25, 440.00]);
    var env = "exp(-mod(t," + s + ")*7)";
    var pad = "0.08*(sin(2*PI*196*t)+0.6*sin(2*PI*293.66*t))*(0.8+0.2*sin(2*PI*0.125*t))";
    return { e: "0.3*(sin(2*PI*" + arp + "*t)+0.3*sin(2*PI*" + arp + "*2*t))*" + env + "+" + pad, f: "lowpass=f=5000,aecho=0.6:0.4:120:0.2,volume=1.0" };
  })(),
  // piano-pad em lá menor, lento, para reel de história/depoimento
  emocao: (function () {
    var a = acorde("t", 32, 8, null);
    var raiz = a.sel([220.00, 174.61, 261.63, 196.00]);
    var terca = a.sel([261.63, 220.00, 329.63, 246.94]);
    var quinta = a.sel([329.63, 261.63, 392.00, 293.66]);
    var env = "min(1,mod(t,8)*0.8)*min(1,(8-mod(t,8))*0.8)";
    var mel = "0.12*sin(2*PI*" + quinta + "*2*t)*exp(-mod(t,2)*1.2)";
    var voz = "(sin(2*PI*" + raiz + "*t)+0.7*sin(2*PI*" + terca + "*t)+0.6*sin(2*PI*" + quinta + "*t)+0.6*sin(2*PI*" + raiz + "*0.5*t))";
    return { e: "0.14*" + env + "*" + voz + "+" + mel, f: "lowpass=f=1400,aecho=0.7:0.55:110|230:0.3|0.2,volume=1.2" };
  })()
};

function gerarSfx() {
  var dir = path.join(raiz, "sfx");
  fs.mkdirSync(dir, { recursive: true });
  Object.keys(sfx).forEach(function (nome) {
    var s = sfx[nome];
    var alvo = path.join(dir, nome + ".wav");
    if (fs.existsSync(alvo) && !forcar) return;
    var src = s.src || ("aevalsrc=" + s.e.replace(/,/g, "\\,") + ":s=" + SR + ":d=" + s.d);
    var filtro = (s.f ? s.f + "," : "") + "alimiter=limit=0.95,aformat=sample_fmts=s16:channel_layouts=stereo";
    ffmpeg(["-f", "lavfi", "-i", src, "-af", filtro, "-t", String(s.d), alvo]);
    console.log("sfx/" + nome + ".wav");
  });
}

function gerarTrilhas() {
  var dir = path.join(raiz, "trilhas");
  fs.mkdirSync(dir, { recursive: true });
  Object.keys(trilhas).forEach(function (nome) {
    var s = trilhas[nome];
    var alvo = path.join(dir, nome + ".m4a");
    if (fs.existsSync(alvo) && !forcar) return;
    var src = "aevalsrc=" + s.e.replace(/,/g, "\\,") + ":s=" + SR + ":d=32";
    var filtro = s.f + ",alimiter=limit=0.9,aformat=sample_fmts=fltp:channel_layouts=stereo";
    ffmpeg(["-f", "lavfi", "-i", src, "-af", filtro, "-t", "32", "-c:a", "aac", "-b:a", "160k", alvo]);
    console.log("trilhas/" + nome + ".m4a");
  });
}

gerarSfx();
gerarTrilhas();
console.log("Biblioteca pronta em " + raiz);
