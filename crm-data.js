/* ════════════════════════════════════════════════════════════════
   ISR CRM — camada de dados compartilhada
   ----------------------------------------------------------------
   Usada pelas telas:
     • ISR - CRM (Funil de Leads).dc.html
     • ISR - Mensagens WhatsApp.dc.html

   Por enquanto os dados vivem no localStorage do navegador (persistem
   de verdade entre sessões, dá pra clicar e testar tudo). Quando quiser
   ligar na planilha compartilhada, é só trocar as 4 funções marcadas
   com  ►► BACKEND  por chamadas ao Apps Script (ver apps-script-crm.js).
   ════════════════════════════════════════════════════════════════ */
(function () {
  "use strict";

  var LEADS_KEY = "isr_crm_leads";
  var TPL_KEY = "isr_crm_templates";
  var SEED_FLAG = "isr_crm_seeded_v1";

  // ── ESTÁGIOS DO FUNIL ─────────────────────────────────────────
  // ordem = ordem no funil. cor = usada nos badges/dropdown.
  var STAGES = [
    { id: "incompleta", label: "Inscrição incompleta", short: "Incompletas", color: "#d4a574", bg: "rgba(212,165,116,0.16)" },
    { id: "a_contatar", label: "A contatar", short: "A contatar", color: "#e07856", bg: "rgba(224,120,86,0.14)" },
    { id: "em_conversa", label: "Em conversa", short: "Em conversa", color: "#2a9d8f", bg: "rgba(42,157,143,0.14)" },
    { id: "reuniao", label: "Reunião marcada", short: "Reunião", color: "#6b5b95", bg: "rgba(107,91,149,0.14)" },
    { id: "contrato", label: "Contrato / matrícula", short: "Contrato", color: "#348a8e", bg: "rgba(52,138,142,0.14)" },
    { id: "matriculado", label: "Matriculado", short: "Matriculados", color: "#5a9e4b", bg: "rgba(90,158,75,0.16)" },
    { id: "perdido", label: "Perdido", short: "Perdidos", color: "#9b8b7e", bg: "rgba(155,139,126,0.16)" }
  ];

  // Abas do topo (na ordem da referência). "para_hoje" é uma visão
  // inteligente (não é estágio); as demais filtram por estágio.
  var TABS = [
    { id: "para_hoje", label: "Para hoje", smart: true },
    { id: "a_contatar", label: "A contatar", stage: "a_contatar" },
    { id: "em_conversa", label: "Em conversa", stage: "em_conversa" },
    { id: "reuniao", label: "Reunião", stage: "reuniao" },
    { id: "contrato", label: "Contrato", stage: "contrato" },
    { id: "incompletas", label: "Incompletas", stage: "incompleta" },
    { id: "matriculados", label: "Matriculados", stage: "matriculado" },
    { id: "perdidos", label: "Perdidos", stage: "perdido" }
  ];

  var CANAIS = ["Instagram", "Formulário", "Indicação", "Site", "WhatsApp", "Anúncio"];

  // ── HELPERS DE DATA ───────────────────────────────────────────
  function today() { var d = new Date(); d.setHours(0, 0, 0, 0); return d; }
  function iso(d) { return d.toISOString().slice(0, 10); }
  function parseISO(s) { if (!s) return null; var p = s.slice(0, 10).split("-"); return new Date(+p[0], +p[1] - 1, +p[2]); }
  function daysBetween(a, b) { return Math.round((b - a) / 86400000); }

  function relativeDays(isoStr) {
    var d = parseISO(isoStr); if (!d) return "—";
    var n = daysBetween(d, today());
    if (n <= 0) return "Hoje";
    if (n === 1) return "Ontem";
    if (n < 30) return n + " dias";
    var m = Math.floor(n / 30); return m + (m === 1 ? " mês" : " meses");
  }
  // sinal de urgência: leads parados há muito tempo
  function isStale(isoStr) { var d = parseISO(isoStr); return d ? daysBetween(d, today()) >= 14 : false; }
  function ddmm(isoStr) { var d = parseISO(isoStr); if (!d) return ""; var p = function (n) { return (n < 10 ? "0" : "") + n; }; return p(d.getDate()) + "/" + p(d.getMonth() + 1); }

  // ── TELEFONE / WHATSAPP ───────────────────────────────────────
  // normaliza para o formato do wa.me (só dígitos, com DDI). Assume
  // Brasil (55) quando o número não traz DDI.
  function waNumber(phone) {
    var d = (phone || "").replace(/\D/g, "");
    if (!d) return "";
    if (d.length <= 11) d = "55" + d; // sem DDI → assume Brasil
    return d;
  }
  function waLink(phone, text) {
    var n = waNumber(phone);
    var base = n ? "https://wa.me/" + n : "https://wa.me/";
    return base + "?text=" + encodeURIComponent(text || "");
  }

  // ── MODELOS DE MENSAGEM (mensagens prontas) ───────────────────
  // Variáveis: {{nome}} {{primeiroNome}} {{turma}} {{nivel}} {{horario}}
  //            {{valor}} {{vencimento}} {{link}} {{data}} {{hora}}
  // [DESTACADO] = trecho que você completa à mão antes de enviar.
  var TEMPLATES = [
    // ── LEADS ──
    { id: "lead_primeiro", categoria: "Leads", titulo: "Primeiro contato", tag: "",
      corpo: "Oi, {{primeiroNome}}! Tudo bem? 😊\nAqui é a Gabi, do Inglês sem Roteiro. Vi que você demonstrou interesse nas nossas aulas.\nMe conta: o que te motivou a querer voltar a estudar inglês agora?" },
    { id: "lead_followup", categoria: "Leads", titulo: "Follow-up (sumiu)", tag: "",
      corpo: "Oi, {{primeiroNome}}! Passando pra saber se você ainda tem interesse em conversar sobre as aulas de inglês.\nÀs vezes a rotina corre e essas coisas ficam pra depois — se ainda fizer sentido pra você, me manda um horário melhor e a gente marca com calma. 🙌" },
    { id: "lead_incompleta", categoria: "Leads", titulo: "Inscrição incompleta", tag: "",
      corpo: "Oi, {{primeiroNome}}! Vi que você começou sua inscrição no Inglês sem Roteiro mas parou no meio do caminho.\nFicou alguma dúvida? Posso te ajudar a finalizar em 2 minutinhos por aqui mesmo. 💬" },
    { id: "lead_reuniao", categoria: "Leads", titulo: "Confirmar conversa de matrícula", tag: "",
      corpo: "Oi, {{primeiroNome}}! Confirmando nossa conversa: [DESTACADO: dia e horário].\nVai ser rapidinho — quero entender seu nível e seus objetivos pra te indicar a melhor turma. Te mando o link aqui um pouquinho antes. 💛" },
    { id: "lead_indicacao", categoria: "Leads", titulo: "Indicação — crédito liberado", tag: "",
      corpo: "Oi, {{primeiroNome}}! Que alegria — você foi indicada por [DESTACADO: quem indicou] pro Inglês sem Roteiro. 🥰\nComo indicação de aluna, você já tem uma condição especial. Bora marcar uma conversa rápida pra eu te explicar como funciona?" },

    // ── PAGAMENTO ──
    { id: "pag_lembrete", categoria: "Pagamento", titulo: "Lembrete (antes do vencimento)", tag: "",
      corpo: "Oi, {{primeiroNome}}! Passando só pra lembrar com carinho que a mensalidade do Inglês sem Roteiro vence em {{vencimento}}. 🗓️\nQualquer dúvida sobre o pagamento, é só me chamar por aqui. 💛" },
    { id: "pag_atraso", categoria: "Pagamento", titulo: "Pagamento em atraso", tag: "",
      corpo: "Oi, {{primeiroNome}}! Tudo bem? 😊\nVi aqui que a mensalidade ({{vencimento}}) ainda está em aberto. Deve ter passado despercebido no corre do dia a dia — acontece!\nSegue o link pra regularizar quando puder: {{link}}\nSe precisar de qualquer coisa, estou por aqui. 🙏" },
    { id: "pag_confirmado", categoria: "Pagamento", titulo: "Pagamento confirmado", tag: "",
      corpo: "Oi, {{primeiroNome}}! Recebemos seu pagamento — tudo certo por aqui. ✅\nObrigada e bons estudos! Qualquer coisa, é só chamar. 💛" },
    { id: "pag_link", categoria: "Pagamento", titulo: "Enviar link de pagamento", tag: "",
      corpo: "Oi, {{primeiroNome}}! Segue o link pra garantir sua vaga no Inglês sem Roteiro:\n{{link}}\nValor: {{valor}}. Assim que cair, já te confirmo por aqui. 🙌" },

    // ── ALUNOS ──
    { id: "aluno_boasvindas", categoria: "Alunos", titulo: "Boas-vindas (matrícula nova)", tag: "",
      corpo: "Oiê, {{primeiroNome}}! Seja MUITO bem-vinda ao Inglês sem Roteiro! 🎉\nSua turma é a {{turma}} ({{horario}}). Em breve você recebe o acesso à sua área do aluno com tudo o que precisa.\nQualquer dúvida, é só me chamar por aqui. Bora aprender inglês de verdade! 💛" },
    { id: "aluno_faltou", categoria: "Alunos", titulo: "Sentimos sua falta", tag: "",
      corpo: "Oi, {{primeiroNome}}! Senti sua falta na última aula da {{turma}}. 🥺\nTá tudo bem? Se precisar remarcar algo ou estiver com alguma dificuldade, me conta — a gente dá um jeito juntas. 💪" },
    { id: "aluno_renovacao", categoria: "Alunos", titulo: "Renovação de ciclo", tag: "",
      corpo: "Oi, {{primeiroNome}}! Seu ciclo no Inglês sem Roteiro está chegando ao fim e eu adoraria seguir com você na próxima etapa. 🚀\nQuer que eu já reserve sua vaga na continuação da {{turma}}?" },

    // ── CHECK-IN ──
    { id: "checkin_mensal", categoria: "Check-in", titulo: "Check-in mensal", tag: "",
      corpo: "Oi, {{primeiroNome}}! Passando pro nosso check-in. 😊\nComo você tem se sentido com o inglês esse mês? Tem algo que está fluindo bem e algo que está travando?\nQuero entender pra te ajudar a evoluir do seu jeito. 💛" },
    { id: "checkin_agendar", categoria: "Check-in", titulo: "Agendar conversa de acompanhamento", tag: "",
      corpo: "Oi, {{primeiroNome}}! Que tal marcarmos uma conversa rápida de acompanhamento pra ver como está sua evolução?\nTe funciona [DESTACADO: sugerir 2 horários]? É rapidinho, uns 15 minutinhos. 🗓️" },

    // ── ONBOARDING ──
    { id: "onb_sessao", categoria: "Onboarding", titulo: "Convite sessão de boas-vindas", tag: "",
      corpo: "Oi, {{primeiroNome}}! Antes da sua primeira aula, temos uma sessão de boas-vindas ao vivo — é onde a gente conhece seu nível e te explica como tudo funciona.\nA sua está marcada para [DESTACADO: data e hora]. Te mando o link por aqui. Até lá! 💛" }
  ];

  function firstName(nome) { return (nome || "").trim().split(/\s+/)[0] || ""; }

  // Preenche variáveis de um modelo a partir dos dados da pessoa.
  // Variáveis sem dado viram [DESTACADO: nome-da-variavel] pra você
  // completar à mão (nada é enviado com "undefined").
  function fillTemplate(corpo, data) {
    data = data || {};
    var map = {
      nome: data.nome || "",
      primeiroNome: firstName(data.nome) || "",
      turma: data.turma || "",
      nivel: data.nivel || "",
      horario: data.horario || data.horarios || "",
      valor: data.valor || "",
      vencimento: data.vencimento || "",
      link: data.link || "",
      data: data.data || "",
      hora: data.hora || ""
    };
    return (corpo || "").replace(/\{\{\s*(\w+)\s*\}\}/g, function (m, k) {
      var v = map[k];
      if (v === undefined || v === null || v === "") return "[DESTACADO: " + k + "]";
      return v;
    });
  }

  // ── DADOS SEMENTE (demo) ──────────────────────────────────────
  function seedLeads() {
    var t = today();
    var dOffset = function (days) { var d = new Date(t); d.setDate(d.getDate() - days); return iso(d); };
    var dFuture = function (days) { var d = new Date(t); d.setDate(d.getDate() + days); return iso(d); };
    return [
      {
        id: "l1", nome: "Bianca Ramos", telefone: "+55 11 98812-4477", email: "bianca.ramos@email.com",
        canal: "Instagram", origemDetalhe: "ig · social · carol-matriculas-trafego", veioDe: "instagram.com", entrouPor: "/",
        entrouEm: dOffset(0), turma: "", nivel: "Básico", horarios: "Seg-sex de tarde",
        querComecar: "Imediatamente ou no próximo mês", estagio: "incompleta", badge: "Parou no passo 4",
        proximoFollowup: dOffset(0),
        historico: [{ data: dOffset(0), tipo: "criado", texto: "Lead criado · começou inscrição pelo Instagram" }]
      },
      {
        id: "l2", nome: "Aline Costa", telefone: "+55 11 99640-2231", email: "aline.costa@email.com",
        canal: "Instagram", origemDetalhe: "ig · social · carol-matriculas-trafego", veioDe: "instagram.com", entrouPor: "/",
        entrouEm: dOffset(15), turma: "A2 · Seg 19h", nivel: "Básico", horarios: "Seg-sex de tarde",
        querComecar: "Imediatamente ou no próximo mês", estagio: "a_contatar", badge: "Imediata",
        proximoFollowup: dOffset(0),
        historico: [
          { data: dOffset(15), tipo: "criado", texto: "Lead criado · Vi um anúncio no Instagram" },
          { data: dOffset(4), tipo: "estagio", texto: "Estágio → Reunião marcada" },
          { data: dOffset(1), tipo: "estagio", texto: "Estágio → A contatar" }
        ]
      },
      {
        id: "l3", nome: "Pedro Francelino", telefone: "+55 11 97555-8090", email: "pedro.f@email.com",
        canal: "Formulário", origemDetalhe: "form · site · captacao-organica", veioDe: "inglessemroteiro.com", entrouPor: "/comecar",
        entrouEm: dOffset(84), turma: "B1 · Seg 20h", nivel: "Intermediário", horarios: "Noite",
        querComecar: "Sem pressa", estagio: "a_contatar", badge: "Daqui",
        proximoFollowup: dOffset(2),
        historico: [{ data: dOffset(84), tipo: "criado", texto: "Lead criado · preencheu formulário no site" }]
      },
      {
        id: "l4", nome: "Victoria Figueiredo", telefone: "+55 11 96423-6119", email: "victoria.fig@email.com",
        canal: "Site", origemDetalhe: "site · matricula-direta", veioDe: "inglessemroteiro.com", entrouPor: "/matricula",
        entrouEm: dOffset(1), turma: "", nivel: "Básico", horarios: "Qui 18h",
        querComecar: "Imediatamente", estagio: "reuniao", badge: "Conversa agendada",
        proximoFollowup: dFuture(1),
        historico: [
          { data: dOffset(1), tipo: "criado", texto: "Lead criado · matrícula do site" },
          { data: dOffset(1), tipo: "reuniao", texto: "Agendou conversa de matrícula (Qui 18:00)" }
        ]
      },
      {
        id: "l5", nome: "Marina Alves", telefone: "+55 21 98123-4567", email: "marina.alves@email.com",
        canal: "Indicação", origemDetalhe: "indicacao · aluna-julia", veioDe: "whatsapp", entrouPor: "-",
        entrouEm: dOffset(3), turma: "", nivel: "Básico", horarios: "Manhã",
        querComecar: "Próximo mês", estagio: "em_conversa", badge: "",
        proximoFollowup: dFuture(2),
        historico: [
          { data: dOffset(3), tipo: "criado", texto: "Lead criado · indicada pela Julia" },
          { data: dOffset(2), tipo: "contato", texto: "Registrado contato · respondeu no WhatsApp" }
        ]
      },
      {
        id: "l6", nome: "Rafael Nunes", telefone: "+55 11 91234-9988", email: "rafa.nunes@email.com",
        canal: "Anúncio", origemDetalhe: "ig · ads · matriculas-trafego", veioDe: "instagram.com", entrouPor: "/lp",
        entrouEm: dOffset(40), turma: "", nivel: "Básico", horarios: "—",
        querComecar: "—", estagio: "perdido", badge: "",
        proximoFollowup: "",
        historico: [
          { data: dOffset(40), tipo: "criado", texto: "Lead criado · anúncio Instagram" },
          { data: dOffset(20), tipo: "perdido", texto: "Marcado perdido · sem resposta após 3 tentativas" }
        ]
      },
      {
        id: "l7", nome: "Camila Ferreira", telefone: "+55 31 99876-1122", email: "camila.f@email.com",
        canal: "Instagram", origemDetalhe: "ig · social · organico", veioDe: "instagram.com", entrouPor: "/",
        entrouEm: dOffset(6), turma: "A1 · Qua 19h", nivel: "Básico", horarios: "Noite",
        querComecar: "Imediatamente", estagio: "contrato", badge: "Enviado link",
        proximoFollowup: dOffset(0),
        historico: [
          { data: dOffset(6), tipo: "criado", texto: "Lead criado pelo Instagram" },
          { data: dOffset(2), tipo: "reuniao", texto: "Estágio → Reunião marcada" },
          { data: dOffset(0), tipo: "estagio", texto: "Estágio → Contrato · link de pagamento enviado" }
        ]
      }
    ];
  }

  // Alunas ativas (demo) — usadas nas mensagens de Pagamento / Check-in.
  // Quando ligar na planilha, isto vem da aba "1. Alunos".
  var ALUNOS_DEMO = [
    { id: "a1", nome: "Larissa Menezes", telefone: "+55 11 98701-3322", turma: "A2 · Seg 19h", nivel: "Básico", horarios: "Seg 19h", valor: "R$ 320", vencimento: "10/08", link: "https://pay.inglessemroteiro.com/larissa" },
    { id: "a2", nome: "Thiago Barros", telefone: "+55 21 99655-8841", turma: "B1 · Qua 20h", nivel: "Intermediário", horarios: "Qua 20h", valor: "R$ 320", vencimento: "05/08", link: "https://pay.inglessemroteiro.com/thiago" },
    { id: "a3", nome: "Patrícia Gomes", telefone: "+55 31 98123-7788", turma: "A1 · Ter 18h", nivel: "Básico", horarios: "Ter 18h", valor: "R$ 290", vencimento: "28/07", link: "https://pay.inglessemroteiro.com/patricia" }
  ];

  // Lista unificada de destinatários (leads + alunas) pra tela de mensagens.
  function recipients() {
    var leads = loadLeads().map(function (l) {
      return { id: "lead:" + l.id, nome: l.nome, telefone: l.telefone, tipo: "lead",
        turma: l.turma || "", nivel: l.nivel || "", horarios: l.horarios || "", valor: "", vencimento: "", link: "" };
    });
    var alunas = ALUNOS_DEMO.map(function (a) {
      return { id: "aluno:" + a.id, nome: a.nome, telefone: a.telefone, tipo: "aluno",
        turma: a.turma, nivel: a.nivel, horarios: a.horarios, valor: a.valor, vencimento: a.vencimento, link: a.link };
    });
    return leads.concat(alunas);
  }

  // Ex-alunas recuperáveis (seção Reativação)
  var REATIVACAO = [
    { nome: "Juliana Prado", telefone: "+55 11 98444-2210", motivo: "Pausou no fim do ciclo 2025.2", ultimaTurma: "B1 · Ter 19h" },
    { nome: "Fernanda Lima", telefone: "+55 11 99321-0654", motivo: "Trancou por mudança de trabalho", ultimaTurma: "A2 · Qui 20h" }
  ];

  // ────────────────────────────────────────────────────────────
  //  ►► BACKEND: troque estas 2 funções por chamadas ao Apps Script
  //     quando quiser usar a planilha compartilhada.
  //     (ver apps-script-crm.js: getLeads / saveLeads)
  // ────────────────────────────────────────────────────────────
  function loadLeads() {
    ensureSeed();
    try { return JSON.parse(localStorage.getItem(LEADS_KEY)) || []; }
    catch (e) { return []; }
  }
  function saveLeads(leads) {
    try { localStorage.setItem(LEADS_KEY, JSON.stringify(leads)); } catch (e) {}
  }
  // ────────────────────────────────────────────────────────────

  function ensureSeed() {
    if (localStorage.getItem(SEED_FLAG)) return;
    localStorage.setItem(LEADS_KEY, JSON.stringify(seedLeads()));
    localStorage.setItem(SEED_FLAG, "1");
  }

  // ── OPERAÇÕES ─────────────────────────────────────────────────
  function getLeads() { return loadLeads(); }
  function getLead(id) { return loadLeads().filter(function (l) { return l.id === id; })[0] || null; }

  function updateLead(id, patch) {
    var leads = loadLeads();
    for (var i = 0; i < leads.length; i++) {
      if (leads[i].id === id) { Object.assign(leads[i], patch); break; }
    }
    saveLeads(leads);
    return leads;
  }

  function addHistory(id, tipo, texto) {
    var leads = loadLeads();
    for (var i = 0; i < leads.length; i++) {
      if (leads[i].id === id) {
        leads[i].historico = leads[i].historico || [];
        leads[i].historico.push({ data: iso(today()), tipo: tipo, texto: texto });
        break;
      }
    }
    saveLeads(leads);
    return leads;
  }

  function setStage(id, stageId) {
    var st = STAGES.filter(function (s) { return s.id === stageId; })[0];
    var leads = loadLeads();
    for (var i = 0; i < leads.length; i++) {
      if (leads[i].id === id) {
        leads[i].estagio = stageId;
        leads[i].historico = leads[i].historico || [];
        leads[i].historico.push({ data: iso(today()), tipo: "estagio", texto: "Estágio → " + (st ? st.label : stageId) });
        break;
      }
    }
    saveLeads(leads);
    return leads;
  }

  function setFollowup(id, isoStr, label) {
    var leads = loadLeads();
    for (var i = 0; i < leads.length; i++) {
      if (leads[i].id === id) {
        leads[i].proximoFollowup = isoStr;
        leads[i].historico = leads[i].historico || [];
        leads[i].historico.push({ data: iso(today()), tipo: "followup", texto: "Follow-up agendado" + (label ? " · " + label : "") });
        break;
      }
    }
    saveLeads(leads);
    return leads;
  }

  function addNote(id, texto) { return addHistory(id, "nota", texto); }
  function registrarContato(id) { return addHistory(id, "contato", "Registrado contato"); }
  function markLost(id) { return setStage(id, "perdido"); }
  function deleteLead(id) {
    var leads = loadLeads().filter(function (l) { return l.id !== id; });
    saveLeads(leads);
    return leads;
  }

  function addLead(lead) {
    var leads = loadLeads();
    lead.id = "l" + Date.now();
    lead.entrouEm = lead.entrouEm || iso(today());
    lead.historico = lead.historico || [{ data: iso(today()), tipo: "criado", texto: "Lead criado" }];
    leads.unshift(lead);
    saveLeads(leads);
    return leads;
  }

  // Datas rápidas pros botões de follow-up
  function followupPresets() {
    var t = today();
    var add = function (n) { var d = new Date(t); d.setDate(d.getDate() + n); return iso(d); };
    return [
      { label: "Amanhã", iso: add(1) },
      { label: "Em 3 dias", iso: add(3) },
      { label: "Próx. semana", iso: add(7) }
    ];
  }

  // "Para hoje": follow-up vencido/hoje, ou inscrição incompleta, ou
  // reunião marcada pra hoje. Ignora leads perdidos/matriculados.
  function isParaHoje(lead) {
    if (lead.estagio === "perdido" || lead.estagio === "matriculado") return false;
    if (lead.estagio === "incompleta") return true;
    if (lead.proximoFollowup) {
      var d = parseISO(lead.proximoFollowup);
      if (d && daysBetween(d, today()) >= 0) return true; // hoje ou vencido
    }
    return false;
  }

  function leadsForTab(tabId) {
    var leads = loadLeads();
    var tab = TABS.filter(function (t) { return t.id === tabId; })[0];
    if (!tab) return leads;
    if (tab.smart) return leads.filter(isParaHoje);
    return leads.filter(function (l) { return l.estagio === tab.stage; });
  }

  function tabCounts() {
    var counts = {};
    TABS.forEach(function (t) { counts[t.id] = leadsForTab(t.id).length; });
    return counts;
  }

  function resetDemo() {
    localStorage.removeItem(SEED_FLAG);
    localStorage.removeItem(LEADS_KEY);
    ensureSeed();
  }

  // ── API PÚBLICA ───────────────────────────────────────────────
  window.ISRCRM = {
    STAGES: STAGES, TABS: TABS, CANAIS: CANAIS, TEMPLATES: TEMPLATES, REATIVACAO: REATIVACAO,
    // leitura
    getLeads: getLeads, getLead: getLead, leadsForTab: leadsForTab, tabCounts: tabCounts,
    stageById: function (id) { return STAGES.filter(function (s) { return s.id === id; })[0] || null; },
    recipients: recipients, ALUNOS_DEMO: ALUNOS_DEMO,
    templatesByCategoria: function (cat) { return TEMPLATES.filter(function (t) { return !cat || t.categoria === cat; }); },
    categorias: function () { var seen = {}; var out = []; TEMPLATES.forEach(function (t) { if (!seen[t.categoria]) { seen[t.categoria] = 1; out.push(t.categoria); } }); return out; },
    // escrita
    updateLead: updateLead, setStage: setStage, setFollowup: setFollowup, addNote: addNote,
    registrarContato: registrarContato, markLost: markLost, deleteLead: deleteLead, addLead: addLead, addHistory: addHistory,
    // util
    firstName: firstName, fillTemplate: fillTemplate, waLink: waLink, waNumber: waNumber,
    relativeDays: relativeDays, isStale: isStale, ddmm: ddmm, followupPresets: followupPresets,
    resetDemo: resetDemo
  };
})();
