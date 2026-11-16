// A moldura compartilhada dos três protótipos: o estado, o repintar e
// um ouvinte só para toda a interação.
//
// Cada modelo entrega duas funções — o menu e o corpo — e nada mais.
// É assim que a comparação fica sobre a ARRUMAÇÃO: os blocos são os
// mesmos, os dados são os mesmos, a mecânica é a mesma.
//
// Este arquivo não entra no sistema. Só os três rascunhos o carregam.
window.ISR_SHELL = (function () {
  "use strict";
  var D = window.ISR_MODELO;
  var B = window.ISR_BLOCOS;

  function esc(s) { return B.esc(s); }

  function iniciar(cfg) {
    var est = Object.assign({}, cfg.inicial || {});
    var elMenu = document.getElementById("menu");
    var elCorpo = document.getElementById("corpo");

    function ir(patch) {
      Object.assign(est, patch);
      pintar();
      window.scrollTo(0, 0);
    }

    function pintar() {
      // menu
      var grupos = cfg.menu(est);
      var h = [];
      grupos.forEach(function (g) {
        if (g.titulo) h.push('<div class="grupo">' + esc(g.titulo) + "</div>");
        (g.itens || []).forEach(function (it) {
          h.push('<button class="item' + (it.on ? " on" : "") + '" '
            + B.ir(it.vai) + "><span>" + esc(it.label) + "</span>"
            + (it.pino ? '<span class="pino">' + esc(it.pino) + "</span>" : "") + "</button>");
        });
      });
      elMenu.innerHTML = h.join("");

      // corpo
      var c = cfg.render(est);
      elCorpo.innerHTML = '<div class="olho">' + esc(c.olho || "") + "</div>"
        + "<h1>" + esc(c.titulo || "") + "</h1>"
        + (c.sub ? '<div class="sub1">' + esc(c.sub) + "</div>" : "")
        + (c.abas || "")
        + c.html;
    }

    // ── um ouvinte para tudo ───────────────────────────────────
    document.addEventListener("click", function (ev) {
      var el;

      el = ev.target.closest("[data-ir]");
      if (el) {
        ev.preventDefault();
        try { ir(JSON.parse(el.getAttribute("data-ir"))); } catch (e) {}
        return;
      }

      // abrir / encerrar a aula
      el = ev.target.closest("[data-aula]");
      if (el) {
        var q = el.getAttribute("data-aula");
        D.VIVO.aberta = q === "abrir";
        D.VIVO.minutos = q === "abrir" ? 12 : 0;
        ir(q === "abrir" ? { tela: cfg.telaDaAula || "aulaViva" } : {});
        return;
      }

      // presença
      el = ev.target.closest("[data-pres]");
      if (el) {
        var p = el.getAttribute("data-pres").split("|");
        var a = D.aula(est.turma || "basics", est.data || "2026-11-16");
        if (p[1] === "P") delete a.presencas[p[0]]; else a.presencas[p[0]] = p[1];
        pintar();
        return;
      }

      // entrega da tarefa
      el = ev.target.closest("[data-tar]");
      if (el) {
        var n = el.getAttribute("data-tar");
        var a2 = D.aula(est.turma || "basics", est.data || "2026-11-16");
        a2.entregues = a2.entregues || [];
        var i = a2.entregues.indexOf(n);
        if (i >= 0) a2.entregues.splice(i, 1); else a2.entregues.push(n);
        pintar();
        return;
      }

      // entrega do projeto
      el = ev.target.closest("[data-proj]");
      if (el) {
        var pr = el.getAttribute("data-proj").split("|");
        var lst = D.PROJETO[pr[0]].entregues;
        var j = lst.indexOf(pr[1]);
        if (j >= 0) lst.splice(j, 1); else lst.push(pr[1]);
        pintar();
        return;
      }

      // abrir uma aluna no caderno ao vivo
      el = ev.target.closest("[data-vivo]");
      if (el) { ir({ vivoAluna: el.getAttribute("data-vivo") || "" }); return; }

      // filtro do caderno ao vivo
      el = ev.target.closest("[data-filtro]");
      if (el) { ir({ vivoFiltro: el.getAttribute("data-filtro"), vivoAluna: "" }); return; }

      // comentar uma resposta ao vivo
      el = ev.target.closest("[data-com]");
      if (el) {
        var cm = el.getAttribute("data-com").split("|");
        var campo = document.getElementById("cm" + cm[1]);
        var txt = campo && campo.value.trim();
        if (txt) {
          var al = D.VIVO.alunas.filter(function (x) { return x.nome === cm[0]; })[0];
          if (al) al.comentarios[+cm[1]].push({ texto: txt, quem: "Bárbara" });
          pintar();
        }
        return;
      }

      // corrigir uma tarefa de casa entregue
      el = ev.target.closest("[data-corrigir]");
      if (el) {
        var co = el.getAttribute("data-corrigir").split("|");
        var caixa = el.parentNode.querySelector("input");
        var t2 = caixa && caixa.value.trim();
        if (t2) {
          var lista = est.cadFiltro === "corrigidas"
            ? D.CADERNO.filter(function (c) { return c.corrigido; })
            : est.cadFiltro === "todas" ? D.CADERNO
            : D.CADERNO.filter(function (c) { return !c.corrigido; });
          var entrada = lista[+co[0]];
          if (entrada) {
            entrada.respostas[+co[1]].comentario = t2;
            entrada.corrigido = entrada.respostas.every(function (r) { return r.comentario; });
          }
          pintar();
        }
        return;
      }

      // o caderno da aluna aberto ou fechado para a tarefa de casa.
      // É esta chave que torna a tarefa de casa possível: hoje o
      // caderno só aceita escrita com a aula aberta.
      el = ev.target.closest("[data-hw]");
      if (el) {
        var dt = el.getAttribute("data-hw");
        var au = D.aula(est.turma || "basics", dt);
        au.cadernoHw = au.cadernoHw || { aberto: false, ate: "" };
        au.cadernoHw.aberto = !au.cadernoHw.aberto;
        if (au.cadernoHw.aberto && !au.cadernoHw.ate) au.cadernoHw.ate = "2026-11-23";
        pintar();
        return;
      }
    });

    pintar();
    return { ir: ir, est: est, pintar: pintar };
  }

  // a faixa de topo, igual nos três
  function faixa(letra, ideia) {
    var outros = ["a", "b", "c"].filter(function (x) { return x !== letra.toLowerCase(); });
    return '<div class="faixa"><b>Modelo ' + esc(letra) + "</b> · " + esc(ideia)
      + " — protótipo para escolher, com dados inventados"
      + outros.map(function (x) {
        return ' <a href="professora-modelo-' + x + '.html">ver o modelo ' + x.toUpperCase() + " →</a>"; }).join("")
      + "</div>";
  }

  return { iniciar: iniciar, faixa: faixa };
})();
