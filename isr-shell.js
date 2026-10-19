/* ════════════════════════════════════════════════════════════════
   ISR — coluna lateral (desenho novo)
   ----------------------------------------------------------------
   A barra de cima (isr-nav.js) continua valendo nas telas que ainda
   não foram trazidas para o desenho novo. Esta é a coluna da
   esquerda do projeto do Claude Design: os mesmos destinos, a mesma
   regra de perfil, em outro formato.

   Uma tela adota o desenho novo trocando um arquivo pelo outro:

     <script src="./isr-nav.js"></script>     →  antes
     <script src="./isr-shell.js"></script>   →  depois

   A coluna se injeta sozinha e empurra o conteúdo da página para a
   direita, então a tela não precisa saber que ela existe. No celular
   vira gaveta, aberta por um botão no topo — a mesma solução da
   barra, porque a equipe trabalha no telefone.

   O que ela mostra, de real: o número de itens na fila de hoje, as
   aulas sem chamada e as parcelas atrasadas, cada um ao lado do seu
   destino. São contas que a pessoa faria abrindo três telas.
   ════════════════════════════════════════════════════════════════ */
(function () {
  "use strict";
  try { if (window.self !== window.top) return; } catch (e) { return; }

  var real = null;
  try { real = JSON.parse(localStorage.getItem("isr_gestao_user")) || null; } catch (e) {}
  if (!real) return;
  // user é a identidade de VISÃO: com "ver como" ligado, é a pessoa
  // por cujos olhos a gestora está olhando. Quem grava continua sendo
  // a de verdade, que o crm-data resolve em gestaoUser().
  function visao() {
    try { return (window.ISRCRM && window.ISRCRM.gestaoVisao && window.ISRCRM.gestaoVisao()) || real; }
    catch (e) { return real; }
  }
  // o shell carrega ANTES do crm-data, então aqui ainda não há
  // ISRCRM: a identidade de visão só pode ser resolvida na hora de
  // desenhar. Sem isso o "ver como" trocava o conteúdo das telas e
  // deixava o menu e o nome na barra como estavam.
  var user = real;

  var LARGURA = 252;
  var ESTREITO = 860;
  // A coluna é desenhada em Inter. Em Helvetica não existe peso 600: o
  // navegador sobe para o negrito cheio, e vinte linhas em negrito deixam
  // a coluna pesada. A fonte vem da página quando ela já a carrega; se não
  // carregar, a coluna busca sozinha e cai em Helvetica se não chegar.
  var FONTE = "Inter,'Helvetica Neue',Helvetica,sans-serif";
  // ── a escala de peso das telas do desenho novo ──────────────
  // Em Inter, 700 e 800 em texto pequeno sobre fundo claro cansam a
  // leitura: a tela inteira pede atenção ao mesmo tempo. A regra é uma
  // só — o tamanho hierarquiza, o peso apenas destaca:
  //
  //   800  o título da tela, e nada mais
  //   700  nome de pessoa, título de bloco e número grande
  //   600  valor de sinal, botão, etiqueta, rótulo
  //   500  item do menu
  //   400  texto corrido e ícone
  function garantirFonte() {
    try {
      if (!document.querySelector('link[href*="family=Inter"]')) {
        var l = document.createElement("link");
        l.rel = "stylesheet";
        l.href = "https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap";
        document.head.appendChild(l);
      }
      // <strong> e <b> nascem em 700 no navegador, e 700 em texto de 13px
      // é exatamente o que fica grosso demais para ler. Na escala desta
      // casa, destaque dentro de texto é 600.
      if (!document.getElementById("isr-escala-peso")) {
        var e = document.createElement("style");
        e.id = "isr-escala-peso";
        e.textContent = "strong,b{font-weight:600}";
        document.head.appendChild(e);
      }
    } catch (err) {}
  }

  // ── a base da escola, em qualquer aparelho ────────────────────
  // Mesmo motivo da barra de cima: o endereço da base fica gravado no
  // aparelho, e nenhuma tela puxa do servidor sozinha. Sem isto, quem
  // abre o sistema num computador novo vê tudo zerado.
  var puxandoBase = false;
  function conectarEPuxar() {
    try {
      if (!window.ISRCRM || !window.ISRCRM.conectarPadrao) return;
      window.ISRCRM.conectarPadrao();
      if (!window.ISRCRM.baseVazia() || !window.ISRCRM.backendUrl()) return;
      puxandoBase = true;
      window.ISRCRM.carregarDoBackend(function (ok) {
        puxandoBase = false;
        if (ok) { try { window.dispatchEvent(new Event("isr-dados")); } catch (e) {} }
        try { pintarBase(); } catch (e) {}
      });
    } catch (e) { puxandoBase = false; }
  }

  // ── os destinos ───────────────────────────────────────────────
  // Agrupados em cinco seções, como no desenho v4. Vinte itens numa
  // coluna lisa viram uma lista para ler inteira toda vez; com
  // título em cima de cada grupo, a pessoa pula direto para o pedaço
  // do dia em que está.
  var ITENS = [
    // A Central é de quem cuida da escola. No v5 a professora nem
    // aparece nela: a casa dela é o Painel do professor, que é onde a
    // fila pedagógica e as aulas sem chamada passaram a morar.
    { id: "central", sec: "hoje", icone: "⌂", label: "Central", href: "ISR - Central v3.dc.html", perfis: ["gestora", "operacao", "comercial"] },
    { id: "agenda", sec: "hoje", icone: "◷", label: "Agenda", href: "ISR - Agenda v3.dc.html", perfis: null },

    // "Alunas e vendas" é a seção de quem vende e administra. A
    // professora não entra: o trabalho dela é a seção pedagógico, e as
    // alunas dela estão dentro das turmas dela. Com ela fora deste
    // item, a seção inteira some do menu da professora.
    { id: "alunas", sec: "alunas e vendas", icone: "◉", label: "Alunas", href: "ISR - Alunas v3.dc.html", perfis: ["gestora", "comercial", "operacao"] },
    { id: "crm", sec: "alunas e vendas", icone: "◎", label: "CRM · Funil", href: "ISR - CRM v3.dc.html", perfis: ["gestora", "comercial", "operacao"] },
    { id: "mensagens", sec: "alunas e vendas", icone: "✉︎", label: "Mensagens", href: "ISR - Mensagens v3.dc.html", perfis: ["gestora", "comercial", "operacao"] },
    { id: "matricula", sec: "alunas e vendas", icone: "+", label: "Matrícula", href: "ISR - Matrícula v3.dc.html", perfis: ["gestora", "comercial"] },
    { id: "mciclo", sec: "alunas e vendas", icone: "▤", label: "Matrículas do ciclo", href: "ISR - Matriculas ciclo v3.dc.html", perfis: ["gestora", "comercial"] },
    { id: "calc", sec: "alunas e vendas", icone: "±", label: "Calculadora de preços", href: "ISR - Calculadora v3.dc.html", perfis: ["gestora", "comercial"] },

    { id: "cobranca", sec: "financeiro", icone: "€", label: "Contas a receber", href: "ISR - Cobrança v3.dc.html", perfis: ["gestora", "operacao", "comercial"] },
    { id: "caixa", sec: "financeiro", icone: "⇅", label: "Caixa", href: "ISR - Caixa v3.dc.html", perfis: ["gestora", "operacao"] },
    { id: "folha", sec: "financeiro", icone: "≡", label: "Folha", href: "ISR - Folha v3.dc.html", perfis: ["gestora"] },

    // A ordem é a que a escola desenhou: o painel primeiro, depois o
    // acompanhamento das alunas, as turmas, as gravações e os clubes.
    { id: "professor", sec: "pedagógico", icone: "✎", label: "Painel do professor", href: "ISR - Painel v3.dc.html", perfis: ["gestora", "professora", "extra", "shadow", "operacao"] },
    { id: "acomp", sec: "pedagógico", icone: "○", label: "Acompanhamento", href: "ISR - Acompanhamento v3.dc.html", perfis: ["gestora", "comercial", "professora", "operacao"] },
    { id: "turmas", sec: "pedagógico", icone: "▦", label: "Turmas & Projetos", href: "ISR - Turmas v3.dc.html", perfis: ["gestora", "comercial", "professora", "operacao"] },
    // O link da aula gravada sempre se colou dentro da chamada. O que
    // não havia era onde VER o conjunto: quais aulas têm gravação e
    // quais ficaram sem. Sem a lista, descobrir que a aula de três
    // semanas atrás não foi publicada dependia de a aluna reclamar.
    { id: "gravacoes", sec: "pedagógico", icone: "▷", label: "Gravações", href: "ISR - Gravacoes v3.dc.html", perfis: ["gestora", "professora", "operacao"] },
    { id: "clubes", sec: "pedagógico", icone: "◉", label: "Clubes", href: "ISR - Clubes v3.dc.html", perfis: ["gestora", "professora", "operacao"] },

    { id: "marketing", sec: "escola", icone: "◈", label: "Marketing", href: "ISR - Marketing v3.dc.html", perfis: ["gestora", "comercial"] },
    { id: "equipe", sec: "escola", icone: "◍", label: "Equipe", href: "ISR - Equipe v3.dc.html", perfis: ["gestora"] },
    { id: "dados", sec: "escola", icone: "▣", label: "Dados", href: "ISR - Dados v3.dc.html", perfis: ["gestora"] },
    { id: "importar", sec: "escola", icone: "↧", label: "Importar", href: "ISR - Importar v3.dc.html", perfis: ["gestora", "comercial", "operacao"] },
    { id: "conexao", sec: "escola", icone: "⟳", label: "Conexão", href: "gestao.html?config", perfis: ["gestora"] }
  ];
  var SECOES = ["hoje", "alunas e vendas", "financeiro", "pedagógico", "escola"];

  function visivel(item) {
    if (!item.perfis) return true;
    if (item.perfis.indexOf(user.perfil) >= 0) return true;
    var papeis = user.papeis || [];
    for (var i = 0; i < papeis.length; i++) if (item.perfis.indexOf(papeis[i]) >= 0) return true;
    return false;
  }

  var path = "";
  try { path = decodeURIComponent(window.location.pathname || ""); } catch (e) {}
  function ativo(item) {
    var base = item.href.split("?")[0].replace(".dc.html", "").replace(".html", "");
    return base.length > 3 && path.indexOf(base) >= 0;
  }

  // ── os números ao lado do destino ─────────────────────────────
  // Só o que é contagem de pendência: um número que não exige ação
  // vira enfeite e tira a força dos que exigem.
  function contagens() {
    var c = {};
    try {
      var C = window.ISRCRM;
      if (!C) return c;
      var perfil = user.perfil || "gestora";
      var fila = C.filaParaHoje ? C.filaParaHoje(perfil, user.nome) : [];
      if (fila.length) c.central = fila.length;
      var vePelaEscola = perfil === "gestora" || perfil === "operacao";
      var pend = C.chamadasPendentesPorProfessora ? C.chamadasPendentesPorProfessora() : [];
      var minhas = pend.filter(function (g) {
        return g.professora && (vePelaEscola || g.professora === user.nome);
      }).reduce(function (t, g) { return t + g.n; }, 0);
      if (minhas) c.professor = minhas;
      if (vePelaEscola || perfil === "comercial") {
        var cob = C.cobrancaResumo ? C.cobrancaResumo() : null;
        if (cob && cob.atrasadas) c.cobranca = cob.atrasadas;
      }
    } catch (e) {}
    return c;
  }

  function render() {
    if (document.getElementById("isr-shell")) return;
    if (!document.body) return;
    garantirFonte();
    user = visao();

    var nums = contagens();
    var estreito = window.innerWidth <= ESTREITO;

    var fundo = document.createElement("div");
    fundo.id = "isr-shell-fundo";
    fundo.style.cssText = "display:none;position:fixed;inset:0;background:rgba(22,73,81,.45);z-index:9997;";
    fundo.onclick = function () { fechar(); };

    var aside = document.createElement("aside");
    aside.id = "isr-shell";
    aside.style.cssText = "position:fixed;left:0;top:0;width:" + LARGURA + "px;height:100vh;"
      + "background:#164951;color:#fff;padding:22px 14px;box-sizing:border-box;z-index:9998;"
      // Só a lista de destinos rola. O rodapé — sincronização, versão
      // e sair — fica preso embaixo: com o menu agrupado a coluna
      // passou de 1.100px e, rolando tudo junto, o "sair" e o aviso
      // de sincronização sumiam de qualquer tela de notebook.
      + "display:flex;flex-direction:column;gap:16px;overflow:hidden;"
      + "font-family:" + FONTE + ";";

    var logo = document.createElement("img");
    logo.src = "assets/ISR_logo_white.png";
    logo.alt = "Inglês sem Roteiro";
    logo.style.cssText = "height:30px;width:auto;object-fit:contain;object-position:left;align-self:flex-start;flex:none;";
    aside.appendChild(logo);

    var vendoComo = null;
    try { vendoComo = window.ISRCRM && window.ISRCRM.verComo ? window.ISRCRM.verComo() : null; } catch (e) {}

    var quem = document.createElement("div");
    quem.style.cssText = "flex:none;font-size:12px;line-height:1.4;color:rgba(255,255,255,0.75);";
    var qn = document.createElement("div");
    qn.textContent = user.nome;
    qn.style.cssText = "font-size:14px;font-weight:600;color:#fff;";
    var qp = document.createElement("div");
    qp.textContent = PERFIL_LABEL[user.perfil] || user.perfil || "";
    quem.appendChild(qn); quem.appendChild(qp);
    aside.appendChild(quem);

    // ── ver como ────────────────────────────────────────────────
    // Só a gestora, e marcado o tempo todo: olhar pelos olhos de
    // outra pessoa sem perceber é pior do que não poder olhar.
    var opcoes = [];
    try { opcoes = (window.ISRCRM && window.ISRCRM.verComoOpcoes ? window.ISRCRM.verComoOpcoes() : []) || []; } catch (e) {}
    if (real.perfil === "gestora" && opcoes.length) {
      var vc = document.createElement("div");
      vc.id = "isr-shell-vercomo";
      vc.style.cssText = "flex:none;display:flex;flex-direction:column;gap:6px;"
        + (vendoComo ? "background:#9c6f56;margin:0 -6px;padding:8px 8px 10px;border-radius:14px;" : "");
      var vt = document.createElement("div");
      vt.textContent = vendoComo ? "vendo como" : "ver como";
      vt.style.cssText = "font-size:11px;font-weight:600;letter-spacing:.04em;"
        + (vendoComo ? "color:#ffe6d8;" : "color:#fc9082;") + "padding:0 4px;";
      vc.appendChild(vt);
      var chips = document.createElement("div");
      chips.style.cssText = "display:flex;flex-wrap:wrap;gap:5px;";
      var trocar = function (alvo) {
        try { window.ISRCRM.setVerComo(alvo); } catch (e) {}
        window.location.reload();
      };
      var chip = function (rotulo, sub, ligado, aoClicar) {
        var b = document.createElement("button");
        b.type = "button";
        b.style.cssText = "border:0;cursor:pointer;font-family:inherit;text-align:left;"
          + "border-radius:10px;padding:6px 9px;line-height:1.25;"
          + (ligado ? "background:#fff;color:#164951;" : "background:rgba(255,255,255,0.10);color:#fff;");
        var l1 = document.createElement("div");
        l1.textContent = rotulo;
        l1.style.cssText = "font-size:12px;font-weight:600;";
        b.appendChild(l1);
        if (sub) {
          var l2 = document.createElement("div");
          l2.textContent = sub;
          l2.style.cssText = "font-size:10px;opacity:.75;";
          b.appendChild(l2);
        }
        b.onclick = aoClicar;
        return b;
      };
      chips.appendChild(chip(real.nome, PERFIL_LABEL[real.perfil] || real.perfil, !vendoComo,
        function () { trocar(null); }));
      opcoes.forEach(function (o) {
        chips.appendChild(chip(o.nome, PERFIL_LABEL[o.perfil] || o.perfil,
          !!vendoComo && vendoComo.nome === o.nome, function () { trocar(o); }));
      });
      vc.appendChild(chips);
      if (vendoComo) {
        var aviso = document.createElement("div");
        aviso.textContent = "Você vê o que " + vendoComo.nome + " vê. O que você gravar continua no seu nome.";
        aviso.style.cssText = "font-size:10.5px;line-height:1.4;color:#ffe6d8;padding:0 4px;";
        vc.appendChild(aviso);
      }
      aside.appendChild(vc);
    }

    var nav = document.createElement("nav");
    nav.style.cssText = "display:flex;flex-direction:column;gap:12px;flex:1;min-height:0;overflow-y:auto;";
    SECOES.forEach(function (sec) {
      var doGrupo = ITENS.filter(function (it) { return it.sec === sec; }).filter(visivel);
      if (!doGrupo.length) return;
      var bloco = document.createElement("div");
      bloco.style.cssText = "display:flex;flex-direction:column;gap:2px;";
      var tit = document.createElement("div");
      tit.textContent = sec;
      tit.style.cssText = "font-size:11px;font-weight:600;color:#fc9082;padding:2px 12px;";
      bloco.appendChild(tit);
      doGrupo.forEach(function (it) {
        var on = ativo(it);
        var a = document.createElement("a");
        a.href = encodeURI(it.href);
        a.style.cssText = "display:flex;gap:10px;align-items:center;padding:9px 12px;border-radius:12px;"
          + "font-size:14px;font-weight:500;text-decoration:none;color:#fff;"
          + (on ? "background:rgba(255,255,255,0.14);" : "");
        var ic = document.createElement("span");
        ic.textContent = it.icone;
        // O ícone não herda o peso do rótulo: a 600, vinte glifos
        // geométricos em coluna pesam mais que os vinte nomes ao lado
        // deles, e a coluna inteira fica carregada.
        ic.style.cssText = "width:18px;text-align:center;flex:none;font-weight:400;opacity:.7;";
        var lb = document.createElement("span");
        lb.textContent = it.label;
        lb.style.cssText = "flex:1;min-width:0;";
        a.appendChild(ic); a.appendChild(lb);
        if (nums[it.id]) {
          var bd = document.createElement("span");
          bd.textContent = String(nums[it.id]);
          bd.style.cssText = "flex:none;font-size:11px;font-weight:700;color:#fc9082;";
          a.appendChild(bd);
        }
        a.onmouseenter = function () { if (!on) a.style.background = "rgba(255,255,255,0.08)"; };
        a.onmouseleave = function () { if (!on) a.style.background = "transparent"; };
        bloco.appendChild(a);
      });
      nav.appendChild(bloco);
    });
    aside.appendChild(nav);

    // ── rodapé: sincronização, versão e saída ───────────────────
    var pe = document.createElement("div");
    pe.style.cssText = "flex:none;display:flex;flex-direction:column;gap:8px;padding-top:10px;border-top:1px solid rgba(255,255,255,0.12);";

    var sync = document.createElement("span");
    sync.id = "isr-shell-sync";
    sync.style.cssText = "display:inline-flex;align-items:center;gap:7px;font-size:11px;padding:5px 9px;border-radius:999px;align-self:flex-start;";
    var pino = document.createElement("span");
    pino.style.cssText = "width:7px;height:7px;border-radius:50%;flex:none;";
    var txt = document.createElement("span");
    sync.appendChild(pino); sync.appendChild(txt);
    function pintarSync(st) {
      var s = (st && st.status) || "local";
      var mapa = {
        ok: { cor: "#9ec970", label: "sincronizado", fundo: "rgba(158,201,112,0.16)" },
        sincronizando: { cor: "#d4a574", label: "sincronizando", fundo: "rgba(212,165,116,0.18)" },
        erro: { cor: "#f4a099", label: "falha ao sincronizar", fundo: "rgba(244,160,153,0.2)" },
        local: { cor: "#b8ada0", label: "só neste aparelho", fundo: "rgba(255,255,255,0.1)" }
      };
      var m = mapa[s] || mapa.local;
      pino.style.background = m.cor;
      txt.textContent = m.label;
      txt.style.color = m.cor;
      sync.style.background = m.fundo;
      sync.title = s === "erro"
        ? "A última tentativa de sincronizar falhou. Suas alterações estão salvas neste aparelho e serão reenviadas."
        : (s === "local" ? "Sem banco central configurado: os dados ficam só neste aparelho."
                         : "Última sincronização: " + (st && st.em ? new Date(st.em).toLocaleString("pt-BR") : ""));
    }
    try { pintarSync(window.ISRCRM && window.ISRCRM.syncEstado ? window.ISRCRM.syncEstado() : null); }
    catch (e) { pintarSync(null); }
    window.addEventListener("isr-sync", function (e) { pintarSync(e.detail); });
    pe.appendChild(sync);

    var linha = document.createElement("div");
    linha.style.cssText = "display:flex;align-items:center;gap:8px;";
    var V = window.ISR_VERSAO || { numero: "?", data: "", nota: "" };
    var ver = document.createElement("button");
    ver.textContent = "v" + V.numero;
    ver.title = "Versão publicada: " + V.numero + (V.data ? " · " + V.data : "")
      + (V.nota ? "\n" + V.nota : "")
      + "\n\nToque para descartar a cópia guardada pelo navegador e recarregar.";
    ver.style.cssText = "border:1px solid rgba(255,255,255,0.16);background:transparent;color:rgba(255,255,255,0.5);"
      + "font-size:10px;font-family:inherit;padding:4px 9px;border-radius:999px;cursor:pointer;";
    ver.onclick = function () {
      ver.textContent = "atualizando";
      var passos = [];
      if (navigator.serviceWorker && navigator.serviceWorker.getRegistrations)
        passos.push(navigator.serviceWorker.getRegistrations().then(function (rs) {
          return Promise.all(rs.map(function (r) { return r.unregister(); }));
        }).catch(function () {}));
      if (window.caches && caches.keys)
        passos.push(caches.keys().then(function (ks) {
          return Promise.all(ks.map(function (k) { return caches.delete(k); }));
        }).catch(function () {}));
      Promise.all(passos).then(function () {
        location.href = location.pathname + "?v=" + Date.now();
      });
    };
    var sair = document.createElement("button");
    sair.textContent = "sair";
    sair.style.cssText = "border:1px solid rgba(255,255,255,0.25);background:transparent;color:rgba(255,255,255,0.7);"
      + "font-size:10.5px;font-weight:600;padding:4px 11px;border-radius:999px;cursor:pointer;font-family:inherit;";
    sair.onclick = function () {
      // pelo sairGestao, e não na mão: além da sessão, ele apaga o
      // token do Identity. Apagar só a sessão deixaria o token do
      // aparelho válido para quem viesse depois
      try { window.ISRCRM.sairGestao(); }
      catch (e) { try { localStorage.removeItem("isr_gestao_user"); } catch (e2) {} }
      window.location.href = "gestao.html";
    };
    linha.appendChild(ver); linha.appendChild(sair);
    pe.appendChild(linha);
    aside.appendChild(pe);

    // ── topo do celular ─────────────────────────────────────────
    var topo = document.createElement("div");
    topo.id = "isr-shell-topo";
    topo.style.cssText = "display:none;position:sticky;top:0;z-index:9996;background:#164951;"
      + "padding:10px 14px;align-items:center;justify-content:space-between;gap:10px;"
      + "font-family:" + FONTE + ";";
    var burger = document.createElement("button");
    burger.textContent = "☰";
    burger.setAttribute("aria-label", "Abrir o menu");
    burger.style.cssText = "border:0;background:rgba(255,255,255,0.12);color:#fff;font-size:17px;"
      + "width:42px;height:42px;border-radius:13px;cursor:pointer;font-family:inherit;";
    burger.onclick = function (ev) { ev.stopPropagation(); abrir(); };
    var marca = document.createElement("img");
    marca.src = "assets/ISR_logo_white.png";
    marca.alt = "ISR";
    marca.style.cssText = "height:24px;width:auto;";
    var nomeTopo = document.createElement("span");
    nomeTopo.textContent = user.nome;
    nomeTopo.style.cssText = "font-size:12px;font-weight:600;color:rgba(255,255,255,0.8);";
    topo.appendChild(burger); topo.appendChild(marca); topo.appendChild(nomeTopo);

    function abrir() {
      aside.style.transform = "translateX(0)";
      fundo.style.display = "block";
    }
    function fechar() {
      if (window.innerWidth <= ESTREITO) aside.style.transform = "translateX(-100%)";
      fundo.style.display = "none";
    }
    document.addEventListener("keydown", function (e) { if (e.key === "Escape") fechar(); });

    function medir() {
      var pequeno = window.innerWidth <= ESTREITO;
      topo.style.display = pequeno ? "flex" : "none";
      aside.style.transition = "transform .18s ease";
      aside.style.transform = pequeno ? "translateX(-100%)" : "translateX(0)";
      document.body.style.paddingLeft = pequeno ? "0" : LARGURA + "px";
      if (!pequeno) fundo.style.display = "none";
    }
    window.addEventListener("resize", medir);

    document.body.insertBefore(fundo, document.body.firstChild);
    document.body.insertBefore(aside, document.body.firstChild);
    document.body.insertBefore(topo, document.body.firstChild);
    medir();
    conectarEPuxar();
    pintarBase();
  }

  var PERFIL_LABEL = { gestora: "Gestora", comercial: "Comercial", operacao: "Operação",
    professora: "Professora", extra: "Aula extra", shadow: "Shadow" };

  // ── aviso de base vazia ───────────────────────────────────────
  // Uma tela em branco por falta de conexão parece uma escola vazia.
  function pintarBase() {
    var velha = document.getElementById("isr-shell-base");
    if (velha) velha.remove();
    var vazia = true;
    try { vazia = window.ISRCRM && window.ISRCRM.baseVazia && window.ISRCRM.baseVazia(); }
    catch (e) { vazia = false; }
    if (!vazia || !document.body) return;
    var faixa = document.createElement("div");
    faixa.id = "isr-shell-base";
    faixa.style.cssText = "background:#fdece9;border-bottom:1px solid #f2c9c1;color:#a4483a;"
      + "font-size:12px;font-family:" + FONTE + ";padding:10px 16px;"
      + "display:flex;align-items:center;gap:10px;flex-wrap:wrap;";
    var txt = document.createElement("span");
    txt.textContent = puxandoBase
      ? "Buscando os dados da escola neste aparelho…"
      : "Este aparelho não tem os dados da escola. Os números abaixo estão zerados por isso, não porque a escola esteja vazia.";
    faixa.appendChild(txt);
    if (!puxandoBase) {
      var bt = document.createElement("button");
      bt.textContent = "Tentar de novo";
      bt.style.cssText = "border:1px solid #e0a79c;background:#fff;color:#a4483a;font-size:11px;"
        + "font-weight:600;font-family:inherit;padding:5px 12px;border-radius:999px;cursor:pointer;";
      bt.onclick = function () {
        bt.disabled = true; txt.textContent = "Buscando os dados da escola neste aparelho…";
        try {
          window.ISRCRM.conectarPadrao();
          window.ISRCRM.carregarDoBackend(function (ok) {
            if (ok) { try { window.dispatchEvent(new Event("isr-dados")); } catch (e) {} }
            pintarBase();
          });
        } catch (e) { pintarBase(); }
      };
      faixa.appendChild(bt);
    }
    var topo = document.getElementById("isr-shell-topo");
    if (topo && topo.parentNode) topo.parentNode.insertBefore(faixa, topo.nextSibling);
    else document.body.insertBefore(faixa, document.body.firstChild);
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", render);
  else render();
})();
