// Os três protótipos da tela da professora abrem, navegam e contêm
// os 13 blocos do trabalho dela.
//
// Não testa o sistema: testa os rascunhos de rascunhos/, que servem
// para a escolha do arranjo. O que ele garante é o que a Gabi vai
// mandar para as professoras: que dá para clicar em tudo, em todos os
// modelos, sem tela em branco e sem erro de JavaScript.
"use strict";
const { acharChromium, placar } = require("./preparar");

const PORTA = process.env.ISR_PORTA || "8899";
const url = (m) => "http://localhost:" + PORTA + "/rascunhos/professora-modelo-" + m + ".html";
const MODELOS = ["a", "b", "c"];

// O que cada modelo tem de conter, em texto que aparece na tela.
// É a lista de O-QUE-A-PROFESSORA-PRECISA.md § 9. A comparação é sem
// caixa, porque innerText devolve o texto já com text-transform
// aplicado e vários rótulos da tela são maiúsculas por CSS.
const BLOCOS = [
  ["1 · hoje", "a agenda de hoje"],
  ["2 · aula ao vivo", "escrevendo"],
  ["3 · slides e caderno da aula", "editor de blocos"],
  ["4 · chamada", "tópico da aula"],
  ["5 · plano da sessão", "o roteiro"],
  ["6 · cadernos fora da aula", "por corrigir"],
  ["7 · a turma", "renovação"],
  ["8 · clubes", "lista de espera"],
  ["9 · particulares", "aula particular"],
  ["10 · gravações", "sem link"],
  ["11 · minhas horas", "aulas que contaram"],
  ["12 · substituição", "enviar o pedido"],
  ["13 · pulso da aluna", "como ela está indo"]
];

(async () => {
  const { chromium } = require("playwright");
  const browser = await chromium.launch({ executablePath: acharChromium(),
    args: ["--no-sandbox"] });
  const P = placar();
  const ok = (nome, cond, extra) => P.T(nome, cond, extra);

  for (const m of MODELOS) {
    const page = await browser.newPage();
    const erros = [];
    page.on("pageerror", (e) => erros.push(String(e.message || e)));
    // "Failed to load resource" não é erro de JavaScript: o Chromium
    // pede /favicon.ico por conta própria e a primeira página do
    // navegador recebe o 404.
    page.on("console", (c) => {
      const t = c.text();
      if (c.type() === "error" && !/Failed to load resource/.test(t)) erros.push(t);
    });

    await page.goto(url(m), { waitUntil: "networkidle" });

    const titulo = await page.title();
    ok(`modelo ${m} · abre`, /Modelo/.test(titulo), titulo);

    const nItens = await page.locator("#menu .item").count();
    ok(`modelo ${m} · menu com itens`, nItens >= 2, nItens + " itens");

    // ── a varredura ──────────────────────────────────────────
    // Para cada item do menu: o item, cada aba de dentro dele, e cada
    // cartão (turma, clube, particular) com as abas de dentro do
    // cartão. Sempre voltando ao ponto de partida, porque clicar numa
    // aba troca a tela e o cartão da tela anterior deixa de existir.
    const textos = [];
    let telas = 0, vazias = 0;
    const colher = async () => {
      const t = (await page.locator("#corpo").innerText()).trim();
      telas++;
      if (t.length < 40) vazias++;
      textos.push(t.toLowerCase());
    };
    const cartoes = async (voltar) => {
      const n = await page.locator("#corpo .cartaoTurma").count();
      for (let k = 0; k < n; k++) {
        await voltar();
        const c = page.locator("#corpo .cartaoTurma").nth(k);
        if (!(await c.count())) continue;
        await c.click();
        await colher();
        const nA = await page.locator("#corpo .aba").count();
        for (let j = 0; j < nA; j++) {
          const a = page.locator("#corpo .aba").nth(j);
          if (!(await a.count())) break;
          await a.click();
          await colher();
        }
      }
      if (n) await voltar();
    };
    const varrer = async () => {
      const itens = await page.locator("#menu .item").count();
      for (let i = 0; i < itens; i++) {
        const noItem = async () => { await page.locator("#menu .item").nth(i).click(); };
        await noItem();
        await colher();
        await cartoes(noItem);
        const nA = await page.locator("#corpo .aba").count();
        for (let j = 0; j < nA; j++) {
          const naAba = async () => {
            await noItem();
            const a = page.locator("#corpo .aba").nth(j);
            if (await a.count()) await a.click();
          };
          await naAba();
          await colher();
          await cartoes(naAba);
        }
      }
    };

    // a primeira varredura com a aula fechada, a segunda com ela aberta
    await varrer();
    const abrir = page.locator('[data-aula="abrir"]').first();
    if (await abrir.count()) await abrir.click();
    await varrer();

    // e a ficha da aluna. Ela não está no menu de nenhum modelo: abre
    // pelo nome na chamada, pela fila ou pelo caderno. O teste procura
    // essa porta percorrendo as telas, porque é assim que a professora
    // chega nela.
    let abriuPulso = false;
    const itensM = await page.locator("#menu .item").count();
    for (let i = 0; i < itensM && !abriuPulso; i++) {
      await page.locator("#menu .item").nth(i).click();
      const telasDoItem = [null];
      const nA = await page.locator("#corpo .aba").count();
      for (let j = 0; j < nA; j++) telasDoItem.push(j);
      for (const j of telasDoItem) {
        if (abriuPulso) break;
        await page.locator("#menu .item").nth(i).click();
        if (j !== null) {
          const a = page.locator("#corpo .aba").nth(j);
          if (await a.count()) await a.click();
        }
        const porta = page.locator('#corpo [data-ir*="pulso"]').first();
        if (await porta.count()) {
          await porta.click();
          await colher();
          abriuPulso = true;
        }
      }
    }
    ok(`modelo ${m} · a ficha da aluna tem porta`, abriuPulso, "nenhum link para o pulso");

    ok(`modelo ${m} · nenhuma tela em branco`, vazias === 0,
      telas + " telas vistas, " + vazias + " em branco");

    const tudo = textos.join("\n");
    BLOCOS.forEach(function (par) {
      ok(`modelo ${m} · bloco ${par[0]}`, tudo.indexOf(par[1]) >= 0, "procurei: " + par[1]);
    });

    ok(`modelo ${m} · sem erro de JavaScript`, erros.length === 0, erros.slice(0, 3).join(" | "));
    await page.close();
  }

  // os três carregam os MESMOS dados e os MESMOS blocos: é o que faz a
  // comparação ser sobre arrumação, e não sobre desenho
  const page = await browser.newPage();
  const fontes = {};
  for (const m of MODELOS) {
    await page.goto(url(m), { waitUntil: "networkidle" });
    fontes[m] = await page.evaluate(
      "Array.from(document.querySelectorAll('script[src]')).map(function(s){return s.getAttribute('src');}).join(',')");
  }
  ok("os três carregam os mesmos dados e blocos",
    fontes.a === fontes.b && fontes.b === fontes.c, JSON.stringify(fontes));
  await page.close();

  await browser.close();
  P.fim();
})();
