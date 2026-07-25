/* ════════════════════════════════════════════════════════════════
   ISR — barra de navegação unificada
   ----------------------------------------------------------------
   Injetada em todas as telas (gestão, painel do professor e app),
   pra tudo parecer UM app só. Aparece apenas para a equipe logada
   na gestão (isr_gestao_user).

   A navegação é organizada pelas áreas da escola, não por telas
   soltas — cada área abre um menu com as telas dela:

     Hoje        → Central · Agenda
     Comercial   → CRM · Mensagens · Calculadora · Marketing
     Financeiro  → Cobrança · Caixa
     Pedagógico  → Acompanhamento · Programa · Alunas · Turmas · Painel · App
     Escola      → Equipe · Conexão

   Cada tela declara quais perfis a enxergam; uma área só aparece
   se sobrar pelo menos uma tela nela.
   ════════════════════════════════════════════════════════════════ */
(function () {
  "use strict";
  if (window.top !== window.self) return; // miniaturas do launcher ficam de fora

  var user = null;
  try { user = JSON.parse(localStorage.getItem("isr_gestao_user")) || null; } catch (e) {}
  if (!user) return;

  var AREAS = [
    {
      id: "hoje", label: "Hoje", cor: "#9ec970",
      itens: [
        { label: "Central", desc: "Pendências consolidadas por prioridade", href: "ISR - Central.dc.html", perfis: null },
        { label: "Agenda", desc: "Compromissos operacionais, comerciais e pedagógicos", href: "ISR - Agenda.dc.html", perfis: null }
      ]
    },
    {
      id: "comercial", label: "Comercial", cor: "#e07856",
      itens: [
        { label: "CRM", desc: "Funil de leads, do contato à matrícula", href: "ISR - CRM (Funil de Leads).dc.html", perfis: ["gestora", "comercial"] },
        { label: "Mensagens", desc: "Mensagens padronizadas por etapa", href: "ISR - Mensagens WhatsApp.dc.html", perfis: ["gestora", "comercial", "operacao"] },
        { label: "Calculadora", desc: "Precificação e simulação comercial", href: "ISR - Calculadora.dc.html", perfis: ["gestora", "comercial"] },
        { label: "Marketing", desc: "Origem dos leads, conversão e metas", href: "ISR - Marketing.dc.html", perfis: ["gestora", "comercial"] }
      ]
    },
    {
      id: "financeiro", label: "Financeiro", cor: "#d4a574",
      itens: [
        { label: "Cobrança", desc: "Recebíveis por situação e ações de cobrança", href: "ISR - Cobrança.dc.html", perfis: ["gestora", "operacao", "comercial"] },
        { label: "Caixa", desc: "Demonstrativo financeiro mensal", href: "ISR - Caixa.dc.html", perfis: ["gestora"] }
      ]
    },
    {
      id: "pedagogico", label: "Pedagógico", cor: "#348a8e",
      itens: [
        { label: "Acompanhamento", desc: "Priorização e registro de contatos", href: "ISR - Acompanhamento.dc.html", perfis: ["gestora", "comercial", "professora"] },
        { label: "Programa no WhatsApp", desc: "Controle semanal do programa assíncrono", href: "ISR - Programa.dc.html", perfis: ["gestora", "professora"] },
        { label: "Alunas", desc: "Matrículas ativas e indicadores por aluna", href: "ISR - Alunas.dc.html", perfis: ["gestora", "comercial", "professora", "operacao"] },
        { label: "Turmas e projetos", desc: "Turmas, particulares, projetos e materiais", href: "ISR - Turmas e Projetos.dc.html", perfis: ["gestora", "comercial", "professora"] },
        { label: "Painel do Professor", desc: "Aulas da semana e registro de frequência", href: "ISR - Painel do Professor.dc.html", perfis: ["gestora", "professora"] },
        { label: "App da aluna", desc: "Visualização da interface da aluna", href: "ISR - Aluna.dc.html", perfis: null }
      ]
    },
    {
      id: "escola", label: "Escola", cor: "#9c6f56",
      itens: [
        { label: "Equipe", desc: "Integrantes, papéis, acessos e remuneração", href: "ISR - Equipe.dc.html", perfis: ["gestora"] },
        { label: "Conexão", desc: "Configuração da base de dados central", href: "gestao.html?config", perfis: ["gestora"] },
        { label: "Dados", desc: "Cópias de segurança, exportação e retenção", href: "ISR%20-%20Dados.dc.html", perfis: ["gestora"] }
      ]
    }
  ];

  var path = "";
  try { path = decodeURIComponent(window.location.pathname || ""); } catch (e) {}

  function visivel(item) {
    if (!item.perfis) return true;
    if (item.perfis.indexOf(user.perfil) >= 0) return true;
    var papeis = user.papeis || [];
    for (var i = 0; i < papeis.length; i++)
      if (item.perfis.indexOf(papeis[i]) >= 0) return true;
    return false;
  }

  function ativa(item) {
    var base = item.href.split("?")[0].replace(".dc.html", "").replace(".html", "");
    return base.length > 3 && path.indexOf(base) >= 0;
  }

  // só as áreas que sobraram algo pra esta pessoa
  var areas = AREAS.map(function (a) {
    var itens = a.itens.filter(visivel);
    return { id: a.id, label: a.label, cor: a.cor, itens: itens };
  }).filter(function (a) { return a.itens.length > 0; });

  var areaAtual = null, telaAtual = null;
  areas.forEach(function (a) {
    a.itens.forEach(function (it) {
      if (ativa(it) && !telaAtual) { areaAtual = a; telaAtual = it; }
    });
  });

  var aberto = null; // id da área com o menu aberto

  function link(item, cor) {
    var a = document.createElement("a");
    a.href = encodeURI(item.href);
    var on = telaAtual === item;
    a.style.cssText = "display:block;text-decoration:none;padding:9px 12px;border-radius:8px;border-left:3px solid " +
      (on ? cor : "transparent") + ";" + (on ? "background:#f6eee4;" : "");
    var t = document.createElement("div");
    t.textContent = item.label;
    t.style.cssText = "font-size:13px;font-weight:700;color:#164951;";
    var d = document.createElement("div");
    d.textContent = item.desc;
    d.style.cssText = "font-size:11px;color:#8a7c6b;margin-top:2px;line-height:1.35;";
    a.appendChild(t); a.appendChild(d);
    a.onmouseenter = function () { if (!on) a.style.background = "#f9f4ec"; };
    a.onmouseleave = function () { if (!on) a.style.background = "transparent"; };
    return a;
  }

  function render() {
    if (document.getElementById("isr-nav")) return;

    var bar = document.createElement("nav");
    bar.id = "isr-nav";
    bar.style.cssText = "position:sticky;top:0;z-index:9999;display:flex;align-items:center;gap:3px;background:#0f333a;padding:8px 14px;box-shadow:0 2px 10px rgba(0,0,0,0.25);font-family:'Helvetica Neue','Helvetica',sans-serif;";

    var marca = document.createElement("a");
    marca.textContent = "ISR";
    marca.href = encodeURI("ISR - Central.dc.html");
    marca.style.cssText = "flex:none;text-decoration:none;font-size:12px;font-weight:700;letter-spacing:2px;color:#9ec970;margin-right:12px;";
    bar.appendChild(marca);

    // ── botão de menu (celular) ─────────────────────────────────
    var btnMenu = document.createElement("button");
    btnMenu.id = "isr-nav-burger";
    btnMenu.textContent = (areaAtual ? areaAtual.label : "Menu") + "  ▾";
    btnMenu.style.cssText = "display:none;flex:none;border:0;background:rgba(255,255,255,0.12);color:#fff;font-size:12px;font-weight:700;padding:7px 13px;border-radius:999px;cursor:pointer;font-family:inherit;";
    bar.appendChild(btnMenu);

    // ── áreas (desktop) ─────────────────────────────────────────
    var grupos = document.createElement("div");
    grupos.id = "isr-nav-areas";
    grupos.style.cssText = "display:flex;align-items:center;gap:3px;";

    areas.forEach(function (a) {
      var wrap = document.createElement("div");
      wrap.style.cssText = "position:relative;flex:none;";

      var b = document.createElement("button");
      b.textContent = a.label;
      var on = areaAtual === a;
      b.style.cssText = "border:0;background:" + (on ? "rgba(255,255,255,0.14)" : "transparent") +
        ";color:" + (on ? "#fff" : "rgba(255,255,255,0.72)") +
        ";font-size:12px;font-weight:700;padding:7px 12px;border-radius:999px;cursor:pointer;white-space:nowrap;font-family:inherit;";

      var painel = document.createElement("div");
      painel.className = "isr-nav-painel";
      painel.style.cssText = "display:none;position:absolute;top:calc(100% + 8px);left:0;min-width:250px;background:#fdfbf8;border:1px solid #eee3d6;border-radius:12px;box-shadow:0 10px 30px rgba(15,51,58,0.22);padding:6px;";

      var titulo = document.createElement("div");
      titulo.textContent = a.label;
      titulo.style.cssText = "font-size:10px;font-weight:700;letter-spacing:1.4px;text-transform:uppercase;color:" + a.cor + ";padding:8px 12px 6px;";
      painel.appendChild(titulo);
      a.itens.forEach(function (it) { painel.appendChild(link(it, a.cor)); });

      b.onclick = function (ev) {
        ev.stopPropagation();
        var jaAberto = aberto === a.id;
        fechar();
        if (!jaAberto) { aberto = a.id; painel.style.display = "block"; }
      };
      wrap.appendChild(b);
      wrap.appendChild(painel);
      grupos.appendChild(wrap);

      a._fechar = function () { painel.style.display = "none"; };
      // indicador da área ativa
      if (on) {
        var risco = document.createElement("span");
        risco.style.cssText = "position:absolute;left:12px;right:12px;bottom:-1px;height:2px;border-radius:2px;background:" + a.cor + ";";
        wrap.appendChild(risco);
      }
    });
    bar.appendChild(grupos);

    var spacer = document.createElement("span");
    spacer.style.cssText = "flex:1;min-width:8px;";
    bar.appendChild(spacer);

    // ── estado da sincronização ──────────────────────────────────
    // Sem isto, uma falha de sincronização é silenciosa: você continua
    // trabalhando achando que salvou.
    var sync = document.createElement("span");
    sync.id = "isr-nav-sync";
    sync.style.cssText = "flex:none;display:inline-flex;align-items:center;gap:6px;font-size:11px;padding:5px 11px;border-radius:999px;margin-right:8px;cursor:default;";
    var pino = document.createElement("span");
    pino.style.cssText = "width:7px;height:7px;border-radius:50%;flex:none;";
    var txt = document.createElement("span");
    sync.appendChild(pino); sync.appendChild(txt);

    function pintarSync(st) {
      var s = (st && st.status) || "local";
      var mapa = {
        ok: { cor: "#9ec970", label: "sincronizado", fundo: "rgba(158,201,112,0.14)" },
        sincronizando: { cor: "#d4a574", label: "sincronizando", fundo: "rgba(212,165,116,0.16)" },
        erro: { cor: "#f4a099", label: "falha ao sincronizar", fundo: "rgba(244,160,153,0.18)" },
        local: { cor: "#b8ada0", label: "só neste aparelho", fundo: "rgba(255,255,255,0.08)" }
      };
      var m = mapa[s] || mapa.local;
      pino.style.background = m.cor;
      txt.textContent = m.label;
      txt.style.color = m.cor;
      sync.style.background = m.fundo;
      var quando = st && st.em ? new Date(st.em).toLocaleString("pt-BR") : "";
      sync.title = s === "erro"
        ? "A última tentativa de sincronizar falhou. Suas alterações estão salvas neste aparelho e serão reenviadas."
        : (s === "local" ? "Sem banco central configurado: os dados ficam só neste aparelho."
                         : "Última sincronização: " + quando +
                           (st.conflitos ? " · " + st.conflitos + " registro(s) mesclado(s)" : ""));
    }
    try { pintarSync(window.ISRCRM && window.ISRCRM.syncEstado ? window.ISRCRM.syncEstado() : null); }
    catch (e) { pintarSync(null); }
    window.addEventListener("isr-sync", function (e) { pintarSync(e.detail); });
    bar.appendChild(sync);

    // ── versão publicada ─────────────────────────────────────────
    // Toca para forçar a atualização: o navegador do celular às vezes
    // segura a versão antiga mesmo depois de uma publicação nova.
    var ver = document.createElement("button");
    ver.id = "isr-nav-versao";
    var V = window.ISR_VERSAO || { numero: "?", data: "", nota: "" };
    ver.textContent = "v" + V.numero;
    ver.title = "Versão publicada: " + V.numero + (V.data ? " · " + V.data : "")
      + (V.nota ? "\n" + V.nota : "")
      + "\n\nToque para descartar a cópia guardada pelo navegador e recarregar.";
    ver.style.cssText = "flex:none;border:1px solid rgba(255,255,255,0.14);background:transparent;"
      + "color:rgba(255,255,255,0.45);font-size:10px;font-family:inherit;padding:4px 9px;"
      + "border-radius:999px;margin-right:8px;cursor:pointer;white-space:nowrap;";
    ver.onclick = function () {
      ver.textContent = "atualizando";
      var passos = [];
      if (navigator.serviceWorker && navigator.serviceWorker.getRegistrations) {
        passos.push(navigator.serviceWorker.getRegistrations().then(function (rs) {
          return Promise.all(rs.map(function (r) { return r.unregister(); }));
        }).catch(function () {}));
      }
      if (window.caches && caches.keys) {
        passos.push(caches.keys().then(function (ks) {
          return Promise.all(ks.map(function (k) { return caches.delete(k); }));
        }).catch(function () {}));
      }
      Promise.all(passos).then(function () {
        // a query quebra o cache do próprio endereço
        var u = location.href.split("#")[0];
        location.replace(u + (u.indexOf("?") >= 0 ? "&" : "?") + "_v=" + Date.now());
      });
    };
    bar.appendChild(ver);

    var quem = document.createElement("span");
    quem.id = "isr-nav-quem";
    quem.textContent = user.nome;
    quem.style.cssText = "flex:none;font-size:11px;color:rgba(255,255,255,0.55);margin-right:8px;white-space:nowrap;";
    bar.appendChild(quem);

    var sair = document.createElement("button");
    sair.textContent = "sair";
    sair.style.cssText = "flex:none;border:1px solid rgba(255,255,255,0.25);background:transparent;color:rgba(255,255,255,0.7);font-size:10.5px;font-weight:600;padding:5px 11px;border-radius:999px;cursor:pointer;font-family:inherit;";
    sair.onclick = function () {
      localStorage.removeItem("isr_gestao_user");
      window.location.href = "gestao.html";
    };
    bar.appendChild(sair);

    // ── gaveta do celular: todas as áreas de uma vez ────────────
    var gaveta = document.createElement("div");
    gaveta.id = "isr-nav-gaveta";
    gaveta.style.cssText = "display:none;position:sticky;top:44px;z-index:9998;background:#fdfbf8;border-bottom:1px solid #eee3d6;box-shadow:0 10px 24px rgba(15,51,58,0.18);padding:8px 10px 12px;max-height:70vh;overflow-y:auto;font-family:'Helvetica Neue','Helvetica',sans-serif;";
    areas.forEach(function (a) {
      var t = document.createElement("div");
      t.textContent = a.label;
      t.style.cssText = "font-size:10px;font-weight:700;letter-spacing:1.4px;text-transform:uppercase;color:" + a.cor + ";padding:10px 12px 4px;";
      gaveta.appendChild(t);
      a.itens.forEach(function (it) { gaveta.appendChild(link(it, a.cor)); });
    });

    btnMenu.onclick = function (ev) {
      ev.stopPropagation();
      var abrindo = gaveta.style.display === "none";
      fechar();
      gaveta.style.display = abrindo ? "block" : "none";
      btnMenu.textContent = (areaAtual ? areaAtual.label : "Menu") + (abrindo ? "  ▴" : "  ▾");
    };

    function fechar() {
      aberto = null;
      areas.forEach(function (a) { if (a._fechar) a._fechar(); });
      gaveta.style.display = "none";
      btnMenu.textContent = (areaAtual ? areaAtual.label : "Menu") + "  ▾";
    }
    document.addEventListener("click", fechar);
    document.addEventListener("keydown", function (e) { if (e.key === "Escape") fechar(); });

    var css = document.createElement("style");
    css.textContent =
      "@media (max-width: 860px){" +
      "#isr-nav-areas{display:none !important;}" +
      "#isr-nav-burger{display:block !important;}" +
      "#isr-nav-quem{display:none;}" +
      "#isr-nav-sync span:last-child{display:none;}" +
      "#isr-nav-versao{padding:4px 7px;margin-right:4px;font-size:9px;}" +
      "#isr-nav-sync{padding:6px;margin-right:4px;}" +
      "}";
    document.head.appendChild(css);

    document.body.insertBefore(gaveta, document.body.firstChild);
    document.body.insertBefore(bar, document.body.firstChild);
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", render);
  else render();
})();
