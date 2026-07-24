/* ════════════════════════════════════════════════════════════════
   ISR — barra de navegação unificada
   ----------------------------------------------------------------
   Injetada em todas as telas (gestão, painel do professor e app),
   pra tudo parecer UM app só. Aparece apenas para a equipe logada
   na gestão (isr_gestao_user) e respeita o perfil:
     gestora   → tudo
     comercial → Central · CRM · Mensagens · Renovações · Turmas · Marketing
     operacao  → Central · Mensagens · Cobrança
   ════════════════════════════════════════════════════════════════ */
(function () {
  "use strict";
  if (window.top !== window.self) return; // miniaturas do launcher ficam de fora

  var user = null;
  try { user = JSON.parse(localStorage.getItem("isr_gestao_user")) || null; } catch (e) {}
  if (!user) return;

  var ITENS = [
    { id: "central", label: "Central", href: "ISR - Central.dc.html", perfis: null },
    { id: "agenda", label: "Agenda", href: "ISR - Agenda.dc.html", perfis: null },
    { id: "crm", label: "CRM", href: "ISR - CRM (Funil de Leads).dc.html", perfis: ["gestora", "comercial"] },
    { id: "mensagens", label: "Mensagens", href: "ISR - Mensagens WhatsApp.dc.html", perfis: null },
    { id: "cobranca", label: "Cobrança", href: "ISR - Cobrança.dc.html", perfis: ["gestora", "operacao", "comercial"] },
    { id: "caixa", label: "Caixa", href: "ISR - Caixa.dc.html", perfis: ["gestora"] },
    { id: "turmas", label: "Turmas", href: "ISR - Turmas e Projetos.dc.html", perfis: ["gestora", "comercial"] },
    { id: "marketing", label: "Marketing", href: "ISR - Marketing.dc.html", perfis: ["gestora", "comercial"] },
    { id: "professor", label: "Professor", href: "ISR - Painel do Professor.dc.html", perfis: ["gestora"] },
    { id: "aluna", label: "App da aluna", href: "ISR - Aluna.dc.html", perfis: null }
  ];

  var path = "";
  try { path = decodeURIComponent(window.location.pathname || ""); } catch (e) {}

  function ativa(item) {
    var base = item.href.replace(".dc.html", "").replace(".html", "");
    return path.indexOf(base) >= 0;
  }

  function render() {
    if (document.getElementById("isr-nav")) return;
    var bar = document.createElement("nav");
    bar.id = "isr-nav";
    bar.style.cssText = "position:sticky;top:0;z-index:9999;display:flex;align-items:center;gap:2px;overflow-x:auto;background:#0f333a;padding:7px 14px;box-shadow:0 2px 10px rgba(0,0,0,0.25);font-family:'Helvetica Neue','Helvetica',sans-serif;-webkit-overflow-scrolling:touch;";

    var marca = document.createElement("span");
    marca.textContent = "ISR";
    marca.style.cssText = "flex:none;font-size:12px;font-weight:700;letter-spacing:2px;color:#9ec970;margin-right:10px;";
    bar.appendChild(marca);

    ITENS.forEach(function (item) {
      if (item.perfis && item.perfis.indexOf(user.perfil) < 0) return;
      var a = document.createElement("a");
      a.textContent = item.label;
      a.href = encodeURI(item.href);
      var on = ativa(item);
      a.style.cssText = "flex:none;text-decoration:none;font-size:11.5px;font-weight:700;padding:6px 11px;border-radius:999px;white-space:nowrap;" +
        (on ? "background:#9ec970;color:#0f333a;" : "color:rgba(255,255,255,0.78);");
      bar.appendChild(a);
    });

    var spacer = document.createElement("span");
    spacer.style.cssText = "flex:1;min-width:8px;";
    bar.appendChild(spacer);

    var quem = document.createElement("span");
    quem.textContent = user.nome;
    quem.style.cssText = "flex:none;font-size:11px;color:rgba(255,255,255,0.55);margin-right:6px;";
    bar.appendChild(quem);

    var sair = document.createElement("button");
    sair.textContent = "sair";
    sair.style.cssText = "flex:none;border:1px solid rgba(255,255,255,0.25);background:transparent;color:rgba(255,255,255,0.7);font-size:10.5px;font-weight:600;padding:5px 11px;border-radius:999px;cursor:pointer;";
    sair.onclick = function () {
      localStorage.removeItem("isr_gestao_user");
      window.location.href = "gestao.html";
    };
    bar.appendChild(sair);

    document.body.insertBefore(bar, document.body.firstChild);
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", render);
  else render();
})();
