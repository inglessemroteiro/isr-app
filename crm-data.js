/* ════════════════════════════════════════════════════════════════
   ISR — Sistema da Escola · camada de dados (v3)
   ----------------------------------------------------------------
   Implementa a ESPECIFICACAO-v3.md, Parte 1.3:

   • PESSOA ÚNICA: lead, aluna, pausada, ex-aluna e MVS são a mesma
     pessoa mudando de status. Chave: WhatsApp normalizado.
   • Todo dado nasce de uma ação; ações gravam no `historico`
     (append-only) — a timeline única do Perfil.
   • € e R$ nunca se somam.
   • MOTOR DE FILAS (Parte 3.1): filaParaHoje(perfil) gera os itens
     "Para hoje" pelas regras R1–R5 e R12. R6–R11 entram quando a
     presença (app) e as atas estiverem conectadas.

   Dados demo no localStorage. Reais: apps-script-integracoes.js.
   Telas consomem SÓ as funções expostas em window.ISRCRM.
   ════════════════════════════════════════════════════════════════ */
(function () {
  "use strict";

  var PESSOAS_KEY = "isr_pessoas_v3";
  var SEED_FLAG = "isr_seed_v3";

  // ── ESTÁGIOS DO FUNIL (leads) ─────────────────────────────────
  var STAGES = [
    { id: "incompleta", label: "Inscrição incompleta", short: "Incompletas", color: "#d4a574", bg: "rgba(212,165,116,0.16)" },
    { id: "a_contatar", label: "A contatar", short: "A contatar", color: "#e07856", bg: "rgba(224,120,86,0.14)" },
    { id: "em_conversa", label: "Em conversa", short: "Em conversa", color: "#2a9d8f", bg: "rgba(42,157,143,0.14)" },
    { id: "reuniao", label: "Reunião marcada", short: "Reunião", color: "#6b5b95", bg: "rgba(107,91,149,0.14)" },
    { id: "contrato", label: "Proposta enviada", short: "Proposta", color: "#348a8e", bg: "rgba(52,138,142,0.14)" },
    { id: "matriculado", label: "Fechado · matriculada", short: "Fechados", color: "#5a9e4b", bg: "rgba(90,158,75,0.16)" },
    { id: "perdido", label: "Perdido", short: "Perdidos", color: "#9b8b7e", bg: "rgba(155,139,126,0.16)" }
  ];

  var TABS = [
    { id: "para_hoje", label: "Para hoje", smart: true },
    { id: "a_contatar", label: "A contatar", stage: "a_contatar" },
    { id: "em_conversa", label: "Em conversa", stage: "em_conversa" },
    { id: "reuniao", label: "Reunião", stage: "reuniao" },
    { id: "contrato", label: "Proposta", stage: "contrato" },
    { id: "incompletas", label: "Incompletas", stage: "incompleta" },
    { id: "matriculados", label: "Fechados", stage: "matriculado" },
    { id: "perdidos", label: "Perdidos", stage: "perdido" }
  ];

  var CANAIS = ["Instagram", "Formulário", "Indicação", "Site", "WhatsApp", "Anúncio", "Social Selling", "Aplicação"];

  // Motivos de perda (CRM + Renovações usam a mesma lista — spec 6/8)
  var MOTIVOS_PERDA = ["Preço", "Horário", "Sumiu", "Concorrente", "Momento errado", "Outro"];

  var STATUS_META = {
    lead:      { label: "Lead",      color: "#e07856", bg: "rgba(224,120,86,0.14)" },
    aluna:     { label: "Aluna",     color: "#5a9e4b", bg: "rgba(90,158,75,0.16)" },
    pausada:   { label: "Pausada",   color: "#d4a574", bg: "rgba(212,165,116,0.16)" },
    "ex-aluna":{ label: "Ex-aluna",  color: "#9b8b7e", bg: "rgba(155,139,126,0.16)" },
    mvs:       { label: "MVS",       color: "#6b5b95", bg: "rgba(107,91,149,0.14)" },
    programa:  { label: "Acompanhamento", color: "#e07856", bg: "rgba(224,120,86,0.14)" }
  };

  // ── DATAS ─────────────────────────────────────────────────────
  function today() { var d = new Date(); d.setHours(0, 0, 0, 0); return d; }
  // A data é a do RELÓGIO DA PESSOA, não a de Greenwich. toISOString()
  // converte para UTC: meia-noite na Holanda (UTC+2) ainda é "ontem" em
  // UTC, e todas as datas nasciam um dia atrás por lá — era o app da
  // aluna dizendo "Próxima aula: Ontem".
  function iso(d) {
    var p = function (n) { return (n < 10 ? "0" : "") + n; };
    return d.getFullYear() + "-" + p(d.getMonth() + 1) + "-" + p(d.getDate());
  }
  function parseISO(s) { if (!s) return null; var p = s.slice(0, 10).split("-"); return new Date(+p[0], +p[1] - 1, +p[2]); }
  function daysBetween(a, b) { return Math.round((b - a) / 86400000); }
  function addDays(n) { var d = new Date(today()); d.setDate(d.getDate() + n); return iso(d); }

  function relativeDays(isoStr) {
    var d = parseISO(isoStr); if (!d) return "—";
    var n = daysBetween(d, today());
    if (n <= 0) return "Hoje";
    if (n === 1) return "Ontem";
    if (n < 30) return n + " dias";
    var m = Math.floor(n / 30); return m + (m === 1 ? " mês" : " meses");
  }
  function isStale(isoStr) { var d = parseISO(isoStr); return d ? daysBetween(d, today()) >= 14 : false; }
  function ddmm(isoStr) { var d = parseISO(isoStr); if (!d) return ""; var p = function (n) { return (n < 10 ? "0" : "") + n; }; return p(d.getDate()) + "/" + p(d.getMonth() + 1); }
  function mesAno(isoStr) {
    var d = parseISO(isoStr); if (!d) return "";
    var meses = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
    return meses[d.getMonth()] + "/" + d.getFullYear();
  }
  function tempoDesde(isoStr) {
    var d = parseISO(isoStr); if (!d) return "";
    var meses = Math.floor(daysBetween(d, today()) / 30);
    if (meses < 1) return "menos de 1 mês";
    if (meses < 12) return meses + (meses === 1 ? " mês" : " meses");
    var anos = Math.floor(meses / 12), resto = meses % 12;
    return anos + (anos === 1 ? " ano" : " anos") + (resto ? " e " + resto + (resto === 1 ? " mês" : " meses") : "");
  }

  // ── WHATSAPP / DINHEIRO ───────────────────────────────────────
  function waNumber(phone) {
    var d = (phone || "").replace(/\D/g, "");
    if (!d) return "";
    if (d.length <= 11) d = "55" + d;
    return d;
  }
  function waLink(phone, text) {
    var n = waNumber(phone);
    return (n ? "https://wa.me/" + n : "https://wa.me/") + "?text=" + encodeURIComponent(text || "");
  }
  function parseMoney(str) {
    if (!str) return 0;
    var s = str.toString().replace(/[^\d,\.]/g, "");
    if (s.indexOf(",") >= 0) s = s.replace(/\./g, "").replace(",", ".");
    var v = parseFloat(s);
    return isNaN(v) ? 0 : v;
  }
  function fmtMoney(moeda, v) {
    var s = v.toFixed(2).replace(".", ",").replace(/\B(?=(\d{3})+(?!\d))/g, ".");
    return (moeda === "€" ? "€ " : "R$ ") + s;
  }
  function firstName(nome) { return (nome || "").trim().split(/\s+/)[0] || ""; }

  // ── MODELOS DE MENSAGEM ───────────────────────────────────────
  // Variáveis: {{nome}} {{primeiroNome}} {{turma}} {{nivel}} {{horario}}
  //            {{valor}} {{vencimento}} {{link}}
  var BASE_TEMPLATES = [
    // LEADS
    { id: "lead_primeiro", categoria: "Leads", titulo: "Primeiro contato",
      corpo: "Oi, {{primeiroNome}}! Tudo bem? 😊\nAqui é a Gabi, do Inglês sem Roteiro. Vi que você demonstrou interesse nas nossas aulas.\nMe conta: o que te motivou a querer voltar a estudar inglês agora?" },
    { id: "lead_cadastro", categoria: "Leads", titulo: "Link de cadastro + sinal",
      corpo: "Oi, {{primeiroNome}}! Que alegria que voc\u00ea vai entrar pro Ingl\u00eas sem Roteiro. \ud83d\udc9b\nPra garantir sua vaga sem pagar tudo de uma vez: preenche seu cadastro nesse link e envia o comprovante do sinal por l\u00e1 mesmo \u2014 o resto a gente combina em parcelas.\n[DESTACADO: link de cadastro \u2014 copie no CRM]\nQualquer d\u00favida me chama aqui!" },
    { id: "lead_followup", categoria: "Leads", titulo: "Follow-up (sumiu)",
      corpo: "Oi, {{primeiroNome}}! Passando pra saber se você ainda tem interesse em conversar sobre as aulas de inglês.\nÀs vezes a rotina corre e essas coisas ficam pra depois — se ainda fizer sentido pra você, me manda um horário melhor e a gente marca com calma. 🙌" },
    { id: "lead_incompleta", categoria: "Leads", titulo: "Inscrição incompleta",
      corpo: "Oi, {{primeiroNome}}! Vi que você começou sua inscrição no Inglês sem Roteiro mas parou no meio do caminho.\nFicou alguma dúvida? Posso te ajudar a finalizar em 2 minutinhos por aqui mesmo. 💬" },
    { id: "lead_reuniao", categoria: "Leads", titulo: "Confirmar conversa de matrícula",
      corpo: "Oi, {{primeiroNome}}! Confirmando nossa conversa: [DESTACADO: dia e horário].\nVai ser rapidinho — quero entender seu nível e seus objetivos pra te indicar a melhor turma. Te mando o link aqui um pouquinho antes. 💛" },
    { id: "lead_indicacao", categoria: "Leads", titulo: "Indicação — crédito liberado",
      corpo: "Oi, {{primeiroNome}}! Que alegria — você foi indicada por [DESTACADO: quem indicou] pro Inglês sem Roteiro. 🥰\nComo indicação de aluna, você já tem uma condição especial. Bora marcar uma conversa rápida pra eu te explicar como funciona?" },
    { id: "lead_falta1", categoria: "Leads", titulo: "Falta de resposta — 1ª tentativa (24/48h)", tag: "Carla",
      corpo: "Oi, {{primeiroNome}}! Tudo bem? 😊\nTe mandei uma mensagem esses dias sobre as aulas de inglês e imagino que a semana esteja corrida.\nAinda faz sentido pra você a gente conversar? É rapidinho, prometo!" },
    { id: "lead_falta2", categoria: "Leads", titulo: "Falta de resposta — 2ª tentativa", tag: "Carla",
      corpo: "Oi, {{primeiroNome}}! Passando de novo por aqui. 🙋‍♀️\nSe o inglês continua nos seus planos, me fala qual o melhor horário pra você que eu me organizo por aqui.\nE se agora não for o momento, sem problema nenhum — só me avisa que eu paro de te encher. 😄" },
    { id: "lead_falta3", categoria: "Leads", titulo: "Falta de resposta — última mensagem", tag: "Carla",
      corpo: "Oi, {{primeiroNome}}! Essa é minha última mensagem, prometo. 💛\nVou deixar seu contato guardado aqui — se em algum momento o inglês voltar pra sua lista, é só me chamar que a gente retoma de onde parou.\nTe desejo uma ótima semana!" },
    { id: "lead_confirma_dia", categoria: "Leads", titulo: "Confirmação de reunião (no dia)", tag: "Carla",
      corpo: "Oi, {{primeiroNome}}! Passando pra confirmar nossa conversa de hoje: [DESTACADO: horário]. 🗓️\nTe mando o link do Meet aqui uns minutinhos antes. Até já! 💛" },
    // PAGAMENTO
    { id: "pag_lembrete", categoria: "Pagamento", titulo: "Lembrete (antes do vencimento)", tag: "Érika",
      corpo: "Oi, {{primeiroNome}}! Passando só pra lembrar com carinho que a mensalidade do Inglês sem Roteiro vence em {{vencimento}}. 🗓️\nQualquer dúvida sobre o pagamento, é só me chamar por aqui. 💛" },
    { id: "pag_atraso", categoria: "Pagamento", titulo: "Pagamento em atraso", tag: "Érika",
      corpo: "Oi, {{primeiroNome}}! Tudo bem? 😊\nVi aqui que a mensalidade ({{vencimento}}) ainda está em aberto. Deve ter passado despercebido no corre do dia a dia — acontece!\nSegue o link pra regularizar quando puder: {{link}}\nSe precisar de qualquer coisa, estou por aqui. 🙏" },
    { id: "pag_confirmado", categoria: "Pagamento", titulo: "Pagamento confirmado", tag: "Érika",
      corpo: "Oi, {{primeiroNome}}! Recebemos seu pagamento — tudo certo por aqui. ✅\nObrigada e bons estudos! Qualquer coisa, é só chamar. 💛" },
    { id: "pag_link", categoria: "Pagamento", titulo: "Enviar link de pagamento",
      corpo: "Oi, {{primeiroNome}}! Segue o link pra garantir sua vaga no Inglês sem Roteiro:\n{{link}}\nValor: {{valor}}. Assim que cair, já te confirmo por aqui. 🙌" },
    // ALUNOS
    { id: "aluno_boasvindas", categoria: "Alunos", titulo: "Boas-vindas (matrícula nova)",
      corpo: "Oiê, {{primeiroNome}}! Seja MUITO bem-vinda ao Inglês sem Roteiro! 🎉\nSua turma é a {{turma}} ({{horario}}). Em breve você recebe o acesso à sua área da aluna com tudo o que precisa.\nQualquer dúvida, é só me chamar por aqui. Bora aprender inglês de verdade! 💛" },
    { id: "aluno_faltou", categoria: "Alunos", titulo: "Contato após ausência",
      corpo: "Oi, {{primeiroNome}}! Senti sua falta na última aula da {{turma}}. 🥺\nTá tudo bem? Se precisar remarcar algo ou estiver com alguma dificuldade, me conta — a gente dá um jeito juntas. 💪" },
    // CHECK-IN
    { id: "checkin_mensal", categoria: "Check-in", titulo: "Check-in mensal",
      corpo: "Oi, {{primeiroNome}}! Passando pro nosso check-in. 😊\nComo você tem se sentido com o inglês esse mês? Tem algo que está fluindo bem e algo que está travando?\nQuero entender pra te ajudar a evoluir do seu jeito. 💛" },
    { id: "checkin_agendar", categoria: "Check-in", titulo: "Agendar conversa de acompanhamento",
      corpo: "Oi, {{primeiroNome}}! Que tal marcarmos uma conversa rápida de acompanhamento pra ver como está sua evolução?\nTe funciona [DESTACADO: sugerir 2 horários]? É rapidinho, uns 15 minutinhos. 🗓️" },
    // ONBOARDING
    { id: "onb_sessao", categoria: "Onboarding", titulo: "Convite sessão de boas-vindas", tag: "Érika",
      corpo: "Oi, {{primeiroNome}}! Antes da sua primeira aula, temos uma sessão de boas-vindas ao vivo — é onde a gente conhece seu nível e te explica como tudo funciona.\nA sua está marcada para [DESTACADO: data e hora]. Te mando o link por aqui. Até lá! 💛" },
    { id: "onb_confirma1a", categoria: "Onboarding", titulo: "Confirmar 1ª aula (D+2)", tag: "Érika",
      corpo: "Oi, {{primeiroNome}}! Sua primeira aula na {{turma}} está chegando! 🎉\nSó confirma pra mim que está tudo certo pra você participar? Qualquer dúvida com o link ou material, me chama." },
    // RENOVAÇÃO (v3)
    { id: "renov_abrir", categoria: "Renovação", titulo: "Abrir conversa de renovação (45d)", tag: "Carla",
      corpo: "Oi, {{primeiroNome}}! Seu ciclo no Inglês sem Roteiro está entrando na reta final e eu adoraria seguir com você na próxima etapa. 🚀\nQue tal conversarmos sobre a continuação da {{turma}}? Me diz um horário bom pra você essa semana. 💛" },
    { id: "renov_proposta", categoria: "Renovação", titulo: "Proposta de renovação", tag: "Carla",
      corpo: "Oi, {{primeiroNome}}! Como conversamos, segue a proposta pra sua renovação:\n[DESTACADO: ciclos, valor e condições]\nQualquer ajuste que precisar, me fala — quero que faça sentido pra você. 😊" },
    { id: "renov_lembrete", categoria: "Renovação", titulo: "Lembrete de decisão", tag: "Carla",
      corpo: "Oi, {{primeiroNome}}! Passando só pra saber se você teve um tempinho pra pensar na proposta de renovação.\nSua vaga na {{turma}} fica reservada até [DESTACADO: data limite]. Qualquer dúvida, estou aqui! 💛" },
    { id: "renov_bemvinda", categoria: "Renovação", titulo: "Boas-vindas ao novo ciclo",
      corpo: "{{primeiroNome}}, que alegria seguir com você mais um ciclo! 🎉\nSua vaga na {{turma}} está garantida. O novo projeto do ciclo vem aí — te conto tudo na primeira aula. Bora! 💪" },
    // MVS (v3)
    { id: "mvs_bemvinda", categoria: "MVS", titulo: "Boas-vindas ao MVS",
      corpo: "Oi, {{primeiroNome}}! Seja bem-vinda ao MVS! 🎉\nVocê vai receber as situações da semana por aqui. Faça no seu ritmo — o objetivo é destravar, não ser perfeita. Qualquer dúvida, me chama! 💛" },
    { id: "mvs_checkin", categoria: "MVS", titulo: "Check-in semanal MVS",
      corpo: "Oi, {{primeiroNome}}! Como foi com a situação dessa semana? 😊\nMe manda um áudio contando como se saiu — pode ser em inglês ou português, do jeito que sair. O importante é praticar!" },
    { id: "mvs_upsell", categoria: "MVS", titulo: "Convite para aula em grupo",
      corpo: "Oi, {{primeiroNome}}! Você está indo tão bem no MVS que queria te fazer um convite: que tal experimentar uma aula em grupo, sem compromisso?\nTem turma de {{nivel}} com vaga aberta — acho que você ia amar a energia. Topa? 💛" }
  ];

  // ── MODELOS EDITÁVEIS ─────────────────────────────────────────
  // A Gabi pode ajustar qualquer modelo e criar novos; ajustes ficam
  // em localStorage (overrides por id + extras). O texto padrão nunca
  // se perde: "Restaurar padrão" remove o override.
  var TPL_STORE_KEY = "isr_templates_v1";
  function tplStore() {
    try { return JSON.parse(localStorage.getItem(TPL_STORE_KEY)) || { overrides: {}, extras: [] }; }
    catch (e) { return { overrides: {}, extras: [] }; }
  }
  function tplSaveLocal(st) { try { localStorage.setItem(TPL_STORE_KEY, JSON.stringify(st)); } catch (e) {} }
  function tplSave(st) { tplSaveLocal(st); agendarSync(); }
  function templatesMerged() {
    var st = tplStore();
    var base = BASE_TEMPLATES.map(function (t) {
      var o = st.overrides[t.id];
      return o ? Object.assign({}, t, { titulo: o.titulo || t.titulo, corpo: o.corpo || t.corpo, editado: true }) : t;
    });
    return base.concat(st.extras || []);
  }
  function salvarModelo(id, titulo, corpo) {
    var st = tplStore();
    var extra = (st.extras || []).filter(function (e) { return e.id === id; })[0];
    if (extra) { extra.titulo = titulo; extra.corpo = corpo; }
    else st.overrides[id] = { titulo: titulo, corpo: corpo };
    tplSave(st);
  }
  function novoModelo(categoria, titulo, corpo) {
    var st = tplStore();
    st.extras = st.extras || [];
    st.extras.push({ id: "tpl" + Date.now(), categoria: categoria, titulo: titulo, corpo: corpo, tag: "meu" });
    tplSave(st);
  }
  function excluirModelo(id) {
    var st = tplStore();
    st.extras = (st.extras || []).filter(function (e) { return e.id !== id; });
    tplSave(st);
  }
  function restaurarModelo(id) {
    var st = tplStore();
    delete st.overrides[id];
    tplSave(st);
  }
  function ehModeloCustom(id) { return (tplStore().extras || []).some(function (e) { return e.id === id; }); }

  function fillTemplate(corpo, data) {
    data = data || {};
    var map = {
      nome: data.nome || "", primeiroNome: firstName(data.nome) || "",
      turma: data.turma || "", nivel: data.nivel || "",
      horario: data.horario || data.horarios || "",
      valor: data.valor || "", vencimento: data.vencimento || "", link: data.link || "",
      data: data.data || "", hora: data.hora || ""
    };
    return (corpo || "").replace(/\{\{\s*(\w+)\s*\}\}/g, function (m, k) {
      var v = map[k];
      if (v === undefined || v === null || v === "") return "[DESTACADO: " + k + "]";
      return v;
    });
  }

  // ── MESES DE COBRANÇA (ciclo corrente) ────────────────────────
  var MESES_COBRANCA = [
    { key: "2026-07", label: "Julho" }, { key: "2026-08", label: "Agosto" },
    { key: "2026-09", label: "Setembro" }, { key: "2026-10", label: "Outubro" },
    { key: "2026-11", label: "Novembro" }, { key: "2026-12", label: "Dezembro" },
    { key: "2027-01", label: "Janeiro" }
  ];
  function mesAtualKey() {
    var d = new Date(); var p = function (n) { return (n < 10 ? "0" : "") + n; };
    return d.getFullYear() + "-" + p(d.getMonth() + 1);
  }

  var COBRANCA_STATUS_META = {
    atrasada:    { label: "Atrasada",       color: "#cf6b5c", bg: "rgba(207,107,92,0.14)" },
    vence_breve: { label: "Vence em breve", color: "#c98a3a", bg: "rgba(212,165,116,0.18)" },
    em_dia:      { label: "Em dia",         color: "#2a9d8f", bg: "rgba(42,157,143,0.14)" },
    paga_mes:    { label: "Paga este mês",  color: "#5a9e4b", bg: "rgba(90,158,75,0.16)" },
    quitada:     { label: "Quitada",        color: "#348a8e", bg: "rgba(52,138,142,0.14)" },
    auto:        { label: "Auto matrícula", color: "#6b5b95", bg: "rgba(107,91,149,0.14)" }
  };

  // ── PEDAGÓGICO — units of study (demo, estrutura da planilha) ──
  // as turmas da ISR são pequenas de propósito: 2 a 5 alunas.
  var CAPACIDADE_PADRAO = 5;
  var UNITS = [
    { id: "t1", nivel: "First Steps (A0)", turma: "WED 14h BR | 19h NL", teacher: "Carla", cycle: "2.2026",
      projeto: "My People Map", notebook: "[ON-FIR][Student_Notebook] My_People_Map_26.2" },
    { id: "t2", nivel: "Basics (A1)", turma: "MON 7h BR | 12h NL", teacher: "Gabi", cycle: "2.2026",
      projeto: "The Poetry Project", notebook: "[ON-BAS][MON-7BR|12NL][Students Notebook] The_Poetry_Project_26_2" },
    { id: "t3", nivel: "Basics (A1)", turma: "TUE 13h BR | 18h NL", teacher: "Carla", cycle: "2.2026",
      projeto: "My People Map", notebook: "[ON-BAS][Student_Notebook] My_People_Map_26.2" },
    { id: "t4", nivel: "Essentials (A2)", turma: "MON 13h BR | 18h NL", teacher: "Gabi", cycle: "2.2026",
      projeto: "My Timeline", notebook: "" },
    { id: "t5", nivel: "Essentials (A2)", turma: "TUE 8h BR | 13h NL", teacher: "Adrielly", cycle: "2.2026",
      projeto: "The Poetry Project", notebook: "[Student-Notebook][ON-ESS-TUE 8BR|13NL]" },
    { id: "t6", nivel: "Speaking (B1)", turma: "PRESENCIAL MON 9h NL", teacher: "Gabi", cycle: "2.2026",
      projeto: "The Culture Map", notebook: "[PRES-SPE][Teacher's Guide] DH001 - Our Sessions" },
    { id: "t7", nivel: "Speaking (B1)", turma: "WED 8h BR | 13h NL", teacher: "Ricky", cycle: "2.2026",
      projeto: "The Poetry Project", notebook: "[ON-SPE][WED-8BR|13NL][Student Notebook] The_Poetry_Project_26.2" },
    { id: "t8", nivel: "Speaking (B1)", turma: "FRI 6h BR | 11h NL", teacher: "Gabi", cycle: "2.2026",
      projeto: "My Timeline", notebook: "ON-SPE_Student_Notebook_My_Timeline_26_2" },
    { id: "t9", nivel: "Essentials (A2)", turma: "THU 11h BR | 16h NL", teacher: "Carla", cycle: "2.2026",
      projeto: "The Culture Map", notebook: "" },
    { id: "t10", nivel: "Basics (A1)", turma: "WED 14h BR | 19h NL", teacher: "Adrielly", cycle: "2.2026",
      projeto: "My Timeline", notebook: "" }
  ];

  // ── TURMAS EDITÁVEIS ──────────────────────────────────────────
  var TURMAS_KEY = "isr_turmas_v1";
  // A lista crua guarda também as lápides (turmas apagadas): remover da
  // lista fazia a mesclagem do sync devolver a turma no puxe seguinte.
  function turmasRaw() {
    // Lista vazia gravada é uma escolha ("apaguei tudo"), não ausência de
    // dado. Só volta ao exemplo quem nunca gravou nada.
    try { var st = JSON.parse(localStorage.getItem(TURMAS_KEY)); if (st) return st; } catch (e) {}
    return UNITS.map(function (u) { return Object.assign({ capacidade: CAPACIDADE_PADRAO }, u); });
  }
  function turmasLista() {
    return turmasRaw().filter(function (t) { return !(t && t.apagado); });
  }
  function turmasSave(list) {
    carimbarLista(list);
    // devolve as lápides ao gravar: um save comum não ressuscita turma
    var vivas = {};
    (list || []).forEach(function (t) { if (t && t.id) vivas[t.id] = true; });
    var lapides = turmasRaw().filter(function (t) { return t && t.apagado && !vivas[t.id]; });
    try { localStorage.setItem(TURMAS_KEY, JSON.stringify((list || []).concat(lapides))); } catch (e) {}
    agendarSync();
  }
  // O id era só Date.now(): duas turmas criadas no mesmo milissegundo (a
  // importação cria várias de uma vez) ficavam com o MESMO id, e editar
  // uma mexia na outra. O contador desempata.
  var turmaSeq = 0;
  function novoTurmaId() { return "t" + Date.now() + "-" + (turmaSeq++); }
  function addTurma(dados) {
    var list = turmasLista();
    list.push({ id: novoTurmaId(), nivel: dados.nivel || "", turma: dados.turma || "",
      teacher: dados.teacher || "", cycle: dados.cycle || metasAtuais().cicloLabel,
      projeto: dados.projeto || "", notebook: dados.notebook || "",
      capacidade: parseInt(dados.capacidade, 10) || CAPACIDADE_PADRAO });
    turmasSave(list); return list;
  }
  function updateTurma(id, patch) {
    var list = turmasLista();
    for (var i = 0; i < list.length; i++) if (list[i].id === id) { Object.assign(list[i], patch); carimbar(list[i]); break; }
    turmasSave(list); return list;
  }
  function removeTurma(id) {
    // a turma vira lápide para o apagamento valer em todos os aparelhos.
    // Alunas da turma ficam "sem turma" — mas só se nenhuma outra turma
    // viva tiver o mesmo rótulo (turmas duplicadas compartilham o rótulo,
    // e apagar a cópia não pode desligar as alunas da que fica).
    var alvo = turmasLista().filter(function (t) { return t.id === id; })[0];
    if (!alvo) return turmasLista();
    var raw = turmasRaw().map(function (t) {
      return t.id === id ? { id: t.id, apagado: iso(today()), _v: Date.now() } : t;
    });
    try { localStorage.setItem(TURMAS_KEY, JSON.stringify(raw)); } catch (e) {}
    agendarSync();
    var rotulo = alvo.nivel + " · " + alvo.turma;
    var aindaExiste = turmasLista().some(function (t) {
      return (t.nivel + " · " + t.turma) === rotulo;
    });
    if (!aindaExiste) {
      loadPessoas().forEach(function (p) {
        if (p.turma !== rotulo) return;
        mutate(p.id, function (x) {
          x.turma = "";
          pushHist(x, "estagio", "Turma " + rotulo + " excluída — aluna ficou sem turma");
        });
      });
    }
    return turmasLista();
  }

  // ── METAS DO CICLO (Config digita 1x — spec 13; demo fixo) ────
  var METAS_PADRAO = { matriculas: 8, renovacoes: 6, cicloInicio: "2026-07-01", cicloLabel: "3.2026",
    faturamento: { "R$": 16000, "€": 1400 }, faturamentoMes: {},
    // fim do ciclo e meta mensal de matrícula: sem os dois não dá para
    // dizer se o ritmo de hoje chega no número combinado
    cicloFim: "", matriculasMes: 0 };
  var METAS_KEY = "isr_metas_v1";
  function metasAtuais() {
    try { var m = JSON.parse(localStorage.getItem(METAS_KEY)); if (m) return Object.assign({}, METAS_PADRAO, m); } catch (e) {}
    return METAS_PADRAO;
  }
  function setMetas(patch) {
    var m = {}; try { m = JSON.parse(localStorage.getItem(METAS_KEY)) || {}; } catch (e) {}
    Object.assign(m, patch);
    try { localStorage.setItem(METAS_KEY, JSON.stringify(m)); } catch (e) {}
    janelasCache = null;
    agendarSync();
    return metasAtuais();
  }

  // Em qual ciclo cai uma data. No período de matrículas o contrato é
  // fechado semanas antes da primeira aula, então quem matricula precisa
  // ler na tela em qual ciclo a aluna entrou — sem abrir o calendário.
  function cicloDaData(iso) {
    var M = metasAtuais();
    var label = M.cicloLabel || "";
    var ini = M.cicloInicio || "";
    var fim = M.cicloFim || "";
    if (!iso) return { quando: "atual", ciclo: label, label: "Ciclo " + label };
    if (ini && iso < ini) return { quando: "anterior", ciclo: label,
      label: "Antes do ciclo " + label };
    if (fim && iso > fim) return { quando: "proximo", ciclo: label,
      label: "Ciclo seguinte — o " + label + " termina em " + ddmm(fim) };
    return { quando: "atual", ciclo: label, label: "Ciclo " + label };
  }

  // ── A JANELA DO CICLO ─────────────────────────────────────────
  //
  // A escola vende ciclo, mas a agenda gerava aula pelo dia da semana
  // escrito no nome da turma — "TUE 13h" virava terça-feira para
  // sempre. Quando o ciclo acabava, a agenda continuava inventando
  // aula toda semana e a escola continuava pedindo chamada de aula
  // que não existiu. Daqui em diante a aula só existe dentro da
  // janela: do início do ciclo ao fim dele.
  //
  // Sem data de fim gravada nada muda — é o estado "sem_fim", e a
  // Central avisa. Isso evita que a agenda de quem ainda não
  // configurou o ciclo esvazie de uma hora para outra.
  // ── OS TRÊS CALENDÁRIOS ───────────────────────────────────────
  //
  // A escola tinha um ciclo só, e isso estava errado: as turmas
  // online, a turma presencial e as alunas particulares começam e
  // terminam em datas diferentes. Com uma janela só, a agenda
  // inventava aula presencial em semana sem aula presencial, e a
  // conferência de chamada cobrava aula que não houve.
  //
  // O ciclo das turmas online continua onde sempre esteve (nas
  // metas), para nada quebrar em quem ainda não configurou os
  // outros. Os outros dois ficam na lista de ciclos, marcados com
  // tipo e com "atual".
  // A aula particular NÃO entra aqui. Cada uma depende da aluna: ela é
  // marcada numa data, dentro do contrato daquela pessoa, e não existe
  // um começo e um fim que valham para todas. Calendário de escola
  // para aula particular não é só inútil — é perigoso, porque
  // descartaria da conferência aula que aconteceu fora dele.
  var TIPOS_CICLO = [
    { id: "online", nome: "Turmas online" },
    { id: "presencial", nome: "Turma presencial" }
  ];
  // "particular" continua sendo um id reconhecido para que um ciclo
  // gravado antes desta decisão não seja lido como se fosse online.
  var TIPOS_CICLO_IDS = ["online", "presencial", "particular"];
  function tipoCicloValido(t) {
    return TIPOS_CICLO_IDS.indexOf(t) >= 0 ? t : "online";
  }
  // De que calendário é esta turma. O nome da turma é o que a escola
  // escreve, e "PRESENCIAL" está escrito nele.
  function tipoDaTurma(u) {
    return /PRESENCIAL/i.test((u && (u.turma || u.label)) || "") ? "presencial" : "online";
  }
  // O ciclo em vigor de um tipo. Para "online" é o das metas; para os
  // outros, a linha marcada como atual na lista.
  function cicloAtualDe(tipo) {
    tipo = tipoCicloValido(tipo);
    if (tipo === "online") {
      var M = metasAtuais();
      return { label: M.cicloLabel || "", inicio: M.cicloInicio || "",
        fim: M.cicloFim || "", tipo: "online" };
    }
    var c = ciclosLista().filter(function (x) {
      return x.atual && tipoCicloValido(x.tipo) === tipo;
    })[0];
    return { label: (c && c.label) || "", inicio: (c && c.inicio) || "",
      fim: (c && c.fim) || "", tipo: tipo };
  }

  function cicloJanela(tipo) {
    tipo = tipoCicloValido(tipo);
    var c = cicloAtualDe(tipo);
    var hoje = iso(today());
    var ini = c.inicio;
    var fim = c.fim;
    // presencial e particular sem nada configurado não existem ainda, e
    // dizer isso é diferente de dizer "sem data de fim". O online segue
    // como sempre: sem fim gravado é "sem_fim", e a Central avisa.
    var estado = (tipo !== "online" && !ini && !fim) ? "sem_ciclo"
      : !fim ? "sem_fim"
      : (hoje > fim ? "terminado"
      : (ini && hoje < ini ? "por_comecar" : "aberto"));
    var dFim = fim ? parseISO(fim) : null;
    var dIni = ini ? parseISO(ini) : null;
    return {
      tipo: tipo, tipoNome: (TIPOS_CICLO.filter(function (x) { return x.id === tipo; })[0] || {}).nome || "",
      label: c.label, inicio: ini, fim: fim, estado: estado,
      diasAteOFim: dFim ? daysBetween(today(), dFim) : null,
      // entre um ciclo e outro há férias, e nesses dias a agenda fica
      // vazia de propósito. Sem este número as telas não conseguem
      // dizer por quê
      diasAteOInicio: dIni ? daysBetween(today(), dIni) : null
    };
  }

  // ── OS CICLOS JÁ FECHADOS ─────────────────────────────────────
  //
  // O sistema tinha UM ciclo, não uma lista. Abrir o 4.2026 apagava
  // o 3.2026, e com ele a resposta para "quais aulas deveriam ter
  // acontecido entre julho e outubro". Isso é registro acadêmico: a
  // escola guarda por anos, e é dele que sai a frequência do
  // certificado. Um campo que se sobrescreve não serve.
  //
  // Agora cada ciclo fechado vira uma linha guardada. A lista anda
  // junto no sync, então vale em qualquer aparelho e é carimbada no
  // backup da planilha.
  var CICLOS_KEY = "isr_ciclos_v1";
  function ciclosLista() {
    try { return JSON.parse(localStorage.getItem(CICLOS_KEY)) || []; } catch (e) { return []; }
  }
  function ciclosSalvar(l) {
    try { localStorage.setItem(CICLOS_KEY, JSON.stringify(l || [])); } catch (e) {}
    janelasCache = null;
    agendarSync();
  }
  // O ciclo de agora mais todos os que já fecharam, do mais novo para
  // o mais antigo. É a memória completa da escola.
  // tipo opcional: sem ele vêm os três calendários juntos, que é o que
  // a frequência e o arquivo de cinco anos precisam.
  function ciclosTodos(tipo) {
    var M = metasAtuais();
    var fora = ciclosLista().slice().map(function (c) {
      return Object.assign({}, c, { tipo: tipoCicloValido(c.tipo) });
    });
    if (M.cicloLabel && M.cicloInicio) {
      fora = fora.filter(function (c) { return !(c.tipo === "online" && c.label === M.cicloLabel); });
      fora.push({ label: M.cicloLabel, inicio: M.cicloInicio, fim: M.cicloFim || "",
        tipo: "online", atual: true });
    }
    if (tipo) fora = fora.filter(function (c) { return c.tipo === tipoCicloValido(tipo); });
    return fora.sort(function (a, b) { return a.inicio < b.inicio ? 1 : -1; });
  }

  // Há aula nesta data? É o filtro que a agenda consulta.
  //
  // Vale para QUALQUER ciclo, não só o de agora: uma aula de setembro
  // continua tendo existido depois que outubro começa, senão a
  // chamada retroativa e a frequência do ciclo passado sumiriam.
  // Entre um ciclo e outro não há aula — é o intervalo.
  var janelasCache = null;
  function janelasDeAula(tipo) {
    if (!janelasCache) {
      janelasCache = {};
      ciclosTodos().filter(function (c) { return c.inicio; }).forEach(function (c) {
        (janelasCache[c.tipo] = janelasCache[c.tipo] || []).push({ ini: c.inicio, fim: c.fim || "" });
      });
    }
    if (!tipo) {
      // o calendário geral é a união dos calendários DE ESCOLA. Um
      // ciclo "particular" gravado antes de a decisão mudar não entra:
      // ele diria que há aula numa semana em que não há, e a agenda
      // geraria aula de turma nela.
      var tudo = [];
      TIPOS_CICLO.forEach(function (t) { tudo = tudo.concat(janelasCache[t.id] || []); });
      return tudo;
    }
    return janelasCache[tipoCicloValido(tipo)] || [];
  }
  // tipo: "online" ou "presencial". Quem não configurou o
  // calendário daquele tipo cai no calendário geral — é o que mantém a
  // agenda de quem nunca mexeu nisso exatamente como estava.
  function temAulaEm(data, tipo) {
    if (!data) return false;
    var js = tipo ? janelasDeAula(tipo) : [];
    if (!js.length) js = janelasDeAula();
    // nenhum ciclo configurado: nada muda, como antes
    if (!js.length) return true;
    for (var i = 0; i < js.length; i++) {
      if (data < js[i].ini) continue;
      if (js[i].fim && data > js[i].fim) continue;
      return true;
    }
    return false;
  }

  // Abrir o próximo ciclo: nome, início e fim de uma vez. Enquanto o
  // próximo não for aberto a agenda fica sem aula, e é por isso que
  // isto precisa de um lugar na tela — não de um campo escondido.
  function abrirCiclo(cfg) {
    cfg = cfg || {};
    var dia = /^\d{4}-\d{2}-\d{2}$/;
    var label = String(cfg.label || "").trim();
    if (!label || !dia.test(cfg.inicio || "") || !dia.test(cfg.fim || "")) return false;
    if (cfg.fim < cfg.inicio) return false;
    var tipo = tipoCicloValido(cfg.tipo);
    // o presencial e o particular têm calendário próprio: ficam na
    // lista, um "atual" por tipo, sem tocar nas metas (que são do
    // calendário das turmas online)
    if (tipo !== "online") return abrirCicloDeTipo(tipo, label, cfg.inicio, cfg.fim);
    var antes = metasAtuais();
    // o ciclo que estava valendo vira registro antes de ser trocado —
    // é o que impede a troca de apagar a história
    //
    // Duas limpezas, as duas aprendidas numa sequência real: corrigir
    // as datas do ciclo que acabou e só depois abrir o próximo. Nela,
    // o nome do ciclo atual chega trocado, e sem cuidado sobra lixo.
    var guardados = ciclosLista()
      // um ciclo que volta a ser o atual deixa de ser registro
      // fechado: senão ficariam dois, com datas diferentes
      .filter(function (c) { return c.label !== label; });
    var mexeu = guardados.length !== ciclosLista().length;
    if (antes.cicloLabel && antes.cicloInicio && antes.cicloLabel !== label) {
      guardados = guardados.filter(function (c) { return c.label !== antes.cicloLabel; });
      guardados.push({ label: antes.cicloLabel, inicio: antes.cicloInicio,
        fim: antes.cicloFim || "", fechadoEm: new Date().toISOString() });
      mexeu = true;
    }
    if (mexeu) ciclosSalvar(guardados);
    var patch = { cicloLabel: label, cicloInicio: cfg.inicio, cicloFim: cfg.fim };
    if (cfg.meta != null && cfg.meta !== "") patch.matriculas = parseInt(cfg.meta, 10) || 0;
    setMetas(patch);
    janelasCache = null;
    // a equipe precisa saber que a agenda mudou de janela
    try {
    } catch (e) {}
    return true;
  }

  // O mesmo para o presencial e o particular. A diferença é só onde o
  // ciclo em vigor mora: nas metas, no caso das turmas online; na
  // lista, com atual: true, nos outros dois. As regras são iguais —
  // o que estava valendo vira registro fechado, e um nome que volta
  // a valer deixa de ter uma linha fechada com o mesmo nome.
  function abrirCicloDeTipo(tipo, label, inicio, fim) {
    var antes = cicloAtualDe(tipo);
    var l = ciclosLista().filter(function (c) {
      if (tipoCicloValido(c.tipo) !== tipo) return true;
      // a linha do nome que está sendo gravado sai: ela vira a atual
      if (c.label === label) return false;
      // a que estava valendo deixa de ser a atual e fica como registro
      if (c.atual) {
        c.atual = false;
        c.fechadoEm = new Date().toISOString();
      }
      return true;
    });
    l.push({ label: label, inicio: inicio, fim: fim, tipo: tipo, atual: true });
    ciclosSalvar(l);
    janelasCache = null;
    try {
      var nome = (TIPOS_CICLO.filter(function (x) { return x.id === tipo; })[0] || {}).nome || tipo;
    } catch (e) {}
    return true;
  }

  // ══════════════════════════════════════════════════════════════
  //  SEED — Pessoa única (dados FICTÍCIOS; estrutura = spec 1.3)
  // ══════════════════════════════════════════════════════════════
  // As parcelas começam no mês informado — por padrão, o mês corrente.
  // Antes a lista era fixa a partir de julho/2026, então uma matrícula
  // feita em novembro nascia com três parcelas vencidas no passado e a
  // receita caía nos meses errados do Caixa.
  function mkMeses(pagos, valor, n, inicioKey) {
    var chave = inicioKey || mesAtualKey();
    var out = [];
    for (var i = 0; i < n; i++) {
      var pr = chave.split("-");
      var mesIdx = parseInt(pr[1], 10) - 1;
      out.push({ key: chave, label: MES_NOMES[mesIdx], valor: valor, pago: i < pagos });
      chave = mesSeguinte(chave).key;
    }
    return out;
  }

  function seedPessoas() {
    var d = addDays;
    return [
      // ── LEADS ──
      { id: "p1", nome: "Bianca Ramos", whatsapp: "+55 11 98812-4477", email: "bianca.ramos@email.com", moeda: "R$",
        status: "lead", estagio: "incompleta", badge: "Parou no passo 4",
        origem: { canal: "Instagram", detalhe: "ig · social · carol-matriculas-trafego", veioDe: "instagram.com", entrouPor: "/" },
        formatos: [], turma: "", professora: "", nivel: "Básico", horarios: "Seg-sex de tarde", querComecar: "Imediatamente",
        entrouEm: d(-1), desde: "", proximoFollowup: "", contratos: [], documentos: [],
        historico: [{ data: d(-1), tipo: "criado", texto: "Lead criado · começou inscrição pelo Instagram" }] },
      { id: "p2", nome: "Aline Costa", whatsapp: "+55 11 99640-2231", email: "aline.costa@email.com", moeda: "R$",
        status: "lead", estagio: "a_contatar", badge: "Imediata",
        origem: { canal: "Instagram", detalhe: "ig · social · carol-matriculas-trafego", veioDe: "instagram.com", entrouPor: "/" },
        formatos: [], turma: "", professora: "", nivel: "Básico", horarios: "Seg-sex de tarde", querComecar: "Imediatamente ou no próximo mês",
        entrouEm: d(-15), desde: "", proximoFollowup: d(0), contratos: [], documentos: [],
        historico: [
          { data: d(-15), tipo: "criado", texto: "Lead criado · Vi um anúncio no Instagram" },
          { data: d(-4), tipo: "estagio", texto: "Estágio → Reunião marcada" },
          { data: d(-1), tipo: "estagio", texto: "Estágio → A contatar" }] },
      { id: "p3", nome: "Pedro Francelino", whatsapp: "+55 11 97555-8090", email: "pedro.f@email.com", moeda: "R$",
        status: "lead", estagio: "a_contatar", badge: "",
        origem: { canal: "Formulário", detalhe: "form · site · captacao-organica", veioDe: "inglessemroteiro.com", entrouPor: "/comecar" },
        formatos: [], turma: "", professora: "", nivel: "Intermediário", horarios: "Noite", querComecar: "Sem pressa",
        entrouEm: d(-84), desde: "", proximoFollowup: d(-2), contratos: [], documentos: [],
        historico: [{ data: d(-84), tipo: "criado", texto: "Lead criado · preencheu formulário no site" }] },
      { id: "p4", nome: "Victoria Figueiredo", whatsapp: "+55 11 96423-6119", email: "victoria.fig@email.com", moeda: "R$",
        status: "lead", estagio: "reuniao", badge: "Conversa agendada",
        reuniao: { data: addDays(2), hora: "18:00", feita: false },
        origem: { canal: "Site", detalhe: "site · matricula-direta", veioDe: "inglessemroteiro.com", entrouPor: "/matricula" },
        formatos: [], turma: "", professora: "", nivel: "Básico", horarios: "Qui 18h", querComecar: "Imediatamente",
        entrouEm: d(-1), desde: "", proximoFollowup: d(1), contratos: [], documentos: [],
        historico: [
          { data: d(-1), tipo: "criado", texto: "Lead criado · matrícula do site" },
          { data: d(-1), tipo: "reuniao", texto: "Agendou conversa de matrícula (Qui 18:00)" }] },
      { id: "p5", nome: "Marina Alves", whatsapp: "+55 21 98123-4567", email: "marina.alves@email.com", moeda: "R$",
        status: "lead", estagio: "em_conversa", badge: "",
        origem: { canal: "Indicação", detalhe: "indicacao · aluna-julia", veioDe: "whatsapp", entrouPor: "-" },
        formatos: [], turma: "", professora: "", nivel: "Básico", horarios: "Manhã", querComecar: "Próximo mês",
        entrouEm: d(-3), desde: "", proximoFollowup: d(2), contratos: [], documentos: [],
        historico: [
          { data: d(-3), tipo: "criado", texto: "Lead criado · indicada pela Julia" },
          { data: d(-2), tipo: "contato", texto: "Registrado contato · respondeu no WhatsApp" }] },
      { id: "p6", nome: "Rafael Nunes", whatsapp: "+55 11 91234-9988", email: "rafa.nunes@email.com", moeda: "R$",
        status: "lead", estagio: "perdido", badge: "", motivoPerda: "Sumiu", saidaEm: d(-20),
        origem: { canal: "Anúncio", detalhe: "ig · ads · matriculas-trafego", veioDe: "instagram.com", entrouPor: "/lp" },
        formatos: [], turma: "", professora: "", nivel: "Básico", horarios: "—", querComecar: "—",
        entrouEm: d(-40), desde: "", proximoFollowup: "", contratos: [], documentos: [],
        historico: [
          { data: d(-40), tipo: "criado", texto: "Lead criado · anúncio Instagram" },
          { data: d(-20), tipo: "perdido", texto: "Marcado perdido · motivo: Sumiu" }] },
      { id: "p7", nome: "Camila Ferreira", whatsapp: "+55 31 99876-1122", email: "camila.f@email.com", moeda: "R$",
        status: "lead", estagio: "contrato", badge: "Enviado link",
        origem: { canal: "Instagram", detalhe: "ig · social · organico", veioDe: "instagram.com", entrouPor: "/" },
        formatos: [], turma: "Basics (A1) · TUE 13h BR | 18h NL", professora: "Carla", nivel: "Básico", horarios: "Noite", querComecar: "Imediatamente",
        entrouEm: d(-6), desde: "", proximoFollowup: d(0), contratos: [], documentos: [],
        historico: [
          { data: d(-6), tipo: "criado", texto: "Lead criado pelo Instagram" },
          { data: d(-2), tipo: "reuniao", texto: "Estágio → Reunião marcada" },
          { data: d(0), tipo: "estagio", texto: "Estágio → Contrato · link de pagamento enviado" }] },

      // ── ALUNAS (com contrato = estrutura da Planilha Renovações) ──
      { id: "p8", nome: "Amanda Ferraz", whatsapp: "+55 11 98801-2233", email: "amanda.ferraz@email.com", moeda: "R$",
        status: "aluna", estagio: "matriculado", badge: "",
        origem: { canal: "Instagram", detalhe: "ig · social · ciclo-1", veioDe: "instagram.com", entrouPor: "/" },
        formatos: ["grupo"], turma: "Essentials (A2) · TUE 8h BR | 13h NL", professora: "Adrielly", nivel: "Pré-intermediário",
        horarios: "TUE 8h BR", querComecar: "", entrouEm: "2025-02-10", desde: "2025-03-01", proximoFollowup: "",
        contratos: [{ tipo: "Renovação", ciclos: "2 Ciclos 3.2026 e 4.2026", moeda: "R$", valorTotal: "R$ 2.760,00",
          parcelaValor: "R$ 345,00", parcelas: 8, vencDia: 10, fim: addDays(28), meses: mkMeses(1, "R$ 345,00", 8) }],
        documentos: [{ nome: "Contrato assinado 3.2026", link: "https://drive.google.com/" }],
        historico: [
          { data: "2025-02-10", tipo: "criado", texto: "1º contato · Instagram (ciclo 1)" },
          { data: "2025-03-01", tipo: "matricula", texto: "Matriculada · Essentials (A2)" },
          { data: "2026-06-24", tipo: "renovacao", texto: "Renovou · 2 ciclos (3.2026 e 4.2026)" },
          { data: d(-13), tipo: "pagamento", texto: "Parcela de Julho paga (Asaas)" }] },
      { id: "p9", nome: "Ana Beatriz Luz", whatsapp: "+31 6 4455-8899", email: "anabia.luz@email.com", moeda: "€",
        status: "aluna", estagio: "matriculado", badge: "",
        origem: { canal: "Indicação", detalhe: "indicacao · aluna-fernanda", veioDe: "whatsapp", entrouPor: "-" },
        formatos: ["grupo"], turma: "Speaking (B1) · WED 8h BR | 13h NL", professora: "Ricky", nivel: "Intermediário",
        horarios: "WED 13h NL", querComecar: "", entrouEm: "2026-06-01", desde: "2026-07-01", proximoFollowup: "",
        contratos: [{ tipo: "Renovação", ciclos: "2 Ciclos 3.2026 e 4.2026", moeda: "€", valorTotal: "€ 750,00",
          parcelaValor: "€ 125,00", parcelas: 6, vencDia: 10, fim: "2027-01-10", meses: mkMeses(1, "€ 125,00", 6) }],
        documentos: [],
        historico: [
          { data: "2026-06-01", tipo: "criado", texto: "1º contato · indicação" },
          { data: "2026-07-01", tipo: "matricula", texto: "Matriculada · Speaking (B1)" },
          { data: "2026-07-10", tipo: "pagamento", texto: "Sinal de €50 pago; 1ª parcela cheia em agosto" }] },
      { id: "p10", nome: "Fernanda Souto", whatsapp: "+55 21 99911-7788", email: "fe.souto@email.com", moeda: "R$",
        status: "aluna", estagio: "matriculado", badge: "",
        origem: { canal: "Site", detalhe: "site · matricula-direta", veioDe: "inglessemroteiro.com", entrouPor: "/matricula" },
        formatos: ["grupo"], turma: "Basics (A1) · MON 7h BR | 12h NL", professora: "Gabi", nivel: "Básico",
        horarios: "MON 7h BR", querComecar: "", entrouEm: "2026-06-20", desde: "2026-07-01", proximoFollowup: "",
        contratos: [{ tipo: "Matrícula", ciclos: "1 Ciclo 3.2026", moeda: "R$", valorTotal: "R$ 1.491,00",
          parcelaValor: "R$ 497,00", parcelas: 3, vencDia: 6, fim: "2026-10-06", meses: mkMeses(0, "R$ 497,00", 3) }],
        documentos: [],
        historico: [
          { data: "2026-06-20", tipo: "criado", texto: "1º contato · site" },
          { data: "2026-07-01", tipo: "matricula", texto: "Matriculada · Basics (A1)" }] },
      { id: "p11", nome: "Juliana Prates", whatsapp: "+31 6 8123-4567", email: "ju.prates@email.com", moeda: "€",
        status: "aluna", estagio: "matriculado", badge: "",
        origem: { canal: "Instagram", detalhe: "ig · social · organico", veioDe: "instagram.com", entrouPor: "/" },
        formatos: ["grupo"], turma: "Essentials (A2) · MON 13h BR | 18h NL", professora: "Gabi", nivel: "Pré-intermediário",
        horarios: "MON 18h NL", querComecar: "", entrouEm: "2025-08-15", desde: "2025-09-01", proximoFollowup: "",
        contratos: [{ tipo: "Renovação", ciclos: "2 Ciclos 3.2026 e 4.2026", moeda: "€", valorTotal: "€ 555,10",
          parcelaValor: "€ 79,30", parcelas: 7, vencDia: 26, fim: "2027-01-26", meses: mkMeses(1, "€ 79,30", 7) }],
        documentos: [],
        historico: [
          { data: "2025-08-15", tipo: "criado", texto: "1º contato · Instagram" },
          { data: "2025-09-01", tipo: "matricula", texto: "Matriculada · Essentials (A2)" },
          { data: "2026-06-30", tipo: "renovacao", texto: "Renovou · 2 ciclos" }] },
      { id: "p12", nome: "Marcela Nunes", whatsapp: "+55 31 98444-5566", email: "marcela.nunes@email.com", moeda: "R$",
        status: "aluna", estagio: "matriculado", badge: "",
        origem: { canal: "Aplicação", detalhe: "form · aplicacao", veioDe: "inglessemroteiro.com", entrouPor: "/aplicacao" },
        formatos: ["particular"], turma: "Particular · TUE 10h", professora: "Gabi", nivel: "Pré-intermediário",
        horarios: "TUE 10h", querComecar: "", entrouEm: "2025-11-10", desde: "2025-12-01", proximoFollowup: "",
        contratos: [{ tipo: "Continuidade", ciclos: "1 Ciclo 3.2026", moeda: "R$", valorTotal: "R$ 1.040,00",
          parcelaValor: "R$ 130,00", parcelas: 7, vencDia: 20, fim: addDays(38), meses: mkMeses(2, "R$ 130,00", 7) }],
        documentos: [],
        historico: [
          { data: "2025-11-10", tipo: "criado", texto: "1º contato · aplicação" },
          { data: "2025-12-01", tipo: "matricula", texto: "Matriculada · particular" }] },
      { id: "p13", nome: "Beatriz Ohana", whatsapp: "+55 11 97654-1100", email: "bia.ohana@email.com", moeda: "€",
        status: "aluna", estagio: "matriculado", badge: "",
        origem: { canal: "Site", detalhe: "site · auto-matricula", veioDe: "inglessemroteiro.com", entrouPor: "/vitrine" },
        formatos: ["grupo"], turma: "First Steps (A0) · WED 14h BR | 19h NL", professora: "Carla", nivel: "Iniciante",
        horarios: "WED 19h NL", querComecar: "", entrouEm: "2026-04-25", desde: "2026-04-27", proximoFollowup: "",
        contratos: [{ tipo: "Matrícula", ciclos: "1 Ciclo 3.2026", moeda: "€", valorTotal: "€ 255,00",
          parcelaValor: "€ 85,00", parcelas: 3, vencDia: "auto", fim: "2026-09-30", meses: mkMeses(3, "€ 85,00", 3) }],
        documentos: [],
        historico: [
          { data: "2026-04-25", tipo: "criado", texto: "Auto matrícula pelo site" },
          { data: "2026-04-27", tipo: "matricula", texto: "Matriculada · First Steps (A0)" }] },

      // ── MVS ──
      { id: "p14", nome: "Carol Duarte", whatsapp: "+55 11 99222-3311", email: "carol.duarte@email.com", moeda: "R$",
        status: "mvs", estagio: "matriculado", badge: "MVS",
        origem: { canal: "Instagram", detalhe: "ig · social · mvs-lancamento", veioDe: "instagram.com", entrouPor: "/mvs" },
        formatos: ["mvs"], turma: "MVS · autoguiado", professora: "", nivel: "Básico",
        horarios: "", querComecar: "", entrouEm: "2026-06-15", desde: "2026-06-15", proximoFollowup: "",
        contratos: [{ tipo: "MVS", ciclos: "MVS 26.2", moeda: "R$", valorTotal: "R$ 297,00",
          parcelaValor: "R$ 297,00", parcelas: 1, vencDia: "auto", fim: "2026-09-15", meses: mkMeses(1, "R$ 297,00", 1) }],
        documentos: [],
        historico: [
          { data: "2026-06-15", tipo: "matricula", texto: "Entrou no MVS (lançamento)" },
          { data: "2026-07-10", tipo: "contato", texto: "Check-in semanal · situação 3 concluída" }] },

      // ── EX-ALUNAS (recuperáveis — R12) ──
      { id: "p15", nome: "Juliana Prado", whatsapp: "+55 11 98444-2210", email: "ju.prado@email.com", moeda: "R$",
        status: "ex-aluna", estagio: "perdido", badge: "", motivoPerda: "Momento errado", saidaEm: "2026-01-15",
        origem: { canal: "Instagram", detalhe: "ig · social · ciclo-2025", veioDe: "instagram.com", entrouPor: "/" },
        formatos: ["grupo"], turma: "Speaking (B1) · antiga TER 19h", professora: "Gabi", nivel: "Intermediário",
        horarios: "", querComecar: "", entrouEm: "2025-01-20", desde: "2025-02-01", proximoFollowup: "",
        contratos: [{ tipo: "Matrícula", ciclos: "2 Ciclos 2025", moeda: "R$", valorTotal: "R$ 2.982,00",
          parcelaValor: "R$ 497,00", parcelas: 6, vencDia: 10, fim: "2025-12-20", meses: [] }],
        documentos: [],
        historico: [
          { data: "2025-02-01", tipo: "matricula", texto: "Matriculada · Speaking (B1)" },
          { data: "2026-01-15", tipo: "perdido", texto: "Pausou no fim do ciclo 2025.2 · motivo: Momento errado" }] },
      { id: "p16", nome: "Fernanda Lima", whatsapp: "+55 11 99321-0654", email: "fe.lima@email.com", moeda: "R$",
        status: "ex-aluna", estagio: "perdido", badge: "", motivoPerda: "Momento errado", saidaEm: "2026-01-05",
        origem: { canal: "Formulário", detalhe: "form · site", veioDe: "inglessemroteiro.com", entrouPor: "/comecar" },
        formatos: ["grupo"], turma: "Essentials (A2) · antiga QUI 20h", professora: "Carla", nivel: "Pré-intermediário",
        horarios: "", querComecar: "", entrouEm: "2024-08-10", desde: "2024-09-01", proximoFollowup: "",
        contratos: [{ tipo: "Matrícula", ciclos: "3 Ciclos 2024-2025", moeda: "R$", valorTotal: "R$ 4.473,00",
          parcelaValor: "R$ 497,00", parcelas: 9, vencDia: 5, fim: "2025-12-28", meses: [] }],
        documentos: [],
        historico: [
          { data: "2024-09-01", tipo: "matricula", texto: "Matriculada · Essentials (A2)" },
          { data: "2026-01-05", tipo: "perdido", texto: "Trancou por mudança de trabalho · motivo: Momento errado" }] }
    ];
  }

  // ── STORE ─────────────────────────────────────────────────────
  // O exemplo existia para ninguém abrir uma tela vazia sem entender nada.
  // A escola já está com os dados reais dentro: a partir daqui o app nasce
  // vazio, e o exemplo só entra se alguém pedir. Quem já tem dado não é
  // afetado — a marca de semeadura continua onde está.
  var EXEMPLO_KEY = "isr_exemplo_v1";
  function exemploLigado() {
    try { return localStorage.getItem(EXEMPLO_KEY) === "1"; } catch (e) { return false; }
  }
  function carregarExemplo() {
    try {
      criarBackup("antes de carregar o exemplo");
      localStorage.setItem(EXEMPLO_KEY, "1");
      localStorage.removeItem(SEED_FLAG);
      localStorage.removeItem(PESSOAS_KEY);
      localStorage.removeItem(TURMAS_KEY);
    } catch (e) {}
    ensureSeed();
    agendarSync();
    return { ok: true };
  }

  function ensureSeed() {
    // navegador que nega storage (iframe muito restrito) não pode derrubar
    // a página inteira — sem storage, simplesmente não há o que semear
    try {
      if (localStorage.getItem(SEED_FLAG)) return;
      // Num aparelho novo, o sync pode ter baixado os dados ANTES do
      // primeiro getPessoas. Semear "[]" aqui apagaria o que acabou de
      // chegar — se já há dados, só se carimba que não é para semear.
      var ja = localStorage.getItem(PESSOAS_KEY);
      if (ja && ja.length > 2) { localStorage.setItem(SEED_FLAG, "1"); return; }
    } catch (e) { return; }
    if (!exemploLigado()) {
      // nasce vazio, mas marcado: sem isto o exemplo voltaria a cada visita
      try {
        localStorage.setItem(SEED_FLAG, "1");
        localStorage.setItem(PESSOAS_KEY, "[]");
        localStorage.setItem(TURMAS_KEY, "[]");
      } catch (e) {}
      return;
    }
    var lista = seedPessoas();
    completarTurmasDemo(lista);
    localStorage.setItem(PESSOAS_KEY, JSON.stringify(lista));
    localStorage.setItem(SEED_FLAG, "1");
    semearProgramaDemo(lista);
    semearChamadasDemo(lista);
    semearAulaExtraDemo(lista);
    semearClubesDemo(lista);
    semearContatosDemo(lista);
  }

  // As turmas da ISR têm de 3 a 5 alunas e a mensalidade é R$ 497. Com uma
  // aluna por turma o exemplo mentia: a folha de pagamento dava mais que a
  // receita e toda turma nascia abaixo do mínimo. Aqui as turmas do exemplo
  // ficam do tamanho real.
  function completarTurmasDemo(lista) {
    var NOMES = [
      "Beatriz Camargo", "Larissa Pinto", "Helena Rocha", "Manuela Dias",
      "Rafaela Antunes", "Isadora Mendes", "Bruna Tavares", "Letícia Barros",
      "Clarice Monteiro", "Sofia Queiroz", "Nina Vasques", "Alice Bento",
      "Olívia Castro", "Laura Pimentel", "Cecília Braga", "Elisa Fontes",
      "Antonia Rangel", "Maitê Cordeiro", "Doralice Prado", "Iara Menezes",
      "Vitória Sampaio", "Heloísa Ferraz", "Malu Andrade", "Joana Peixoto",
      "Aurora Lins", "Ester Vilela", "Bianca Toledo", "Sara Nogueira"
    ];
    // A escola tem turmas de 2 a 4 e mensalidades bem diferentes entre si:
    // quem renovou por mais ciclos paga parcela maior, e parte paga em euro.
    // O exemplo copia essa forma para os números da folha fazerem sentido.
    var OCUPACAO = [2, 3, 2, 3, 3, 3, 4, 2, 4, 4];
    var VALORES = [
      { m: "R$", v: "R$ 345,00",   total: "R$ 2.760,00" },
      { m: "R$", v: "R$ 497,00",   total: "R$ 1.491,00" },
      { m: "€",  v: "€ 125,00",    total: "€ 375,00" },
      { m: "R$", v: "R$ 682,33",   total: "R$ 4.386,41" },
      { m: "€",  v: "€ 85,00",     total: "€ 255,00" },
      { m: "R$", v: "R$ 450,00",   total: "R$ 4.050,00" },
      { m: "€",  v: "€ 79,30",     total: "€ 555,10" },
      { m: "R$", v: "R$ 511,43",   total: "R$ 3.068,58" },
      { m: "R$", v: "R$ 1.128,57", total: "R$ 7.900,00" },
      { m: "€",  v: "€ 175,00",    total: "€ 700,00" },
      { m: "R$", v: "R$ 130,00",   total: "R$ 1.040,00" },
      { m: "€",  v: "€ 75,00",     total: "€ 525,00" }
    ];
    var k = 0, iTurma = 0, iValor = 0;

    // só as turmas do próprio exemplo. Uma turma criada depois — inclusive
    // pelos testes — não ganha alunas fictícias.
    UNITS.forEach(function (u) {
      var label = u.nivel + " · " + u.turma;
      var tem = lista.filter(function (p) {
        return p.status === "aluna" && p.turma === label;
      }).length;
      var alvo = OCUPACAO[iTurma % OCUPACAO.length];
      iTurma += 1;
      while (tem < alvo && k < NOMES.length) {
        var nome = NOMES[k]; k += 1; tem += 1;
        var val = VALORES[iValor % VALORES.length]; iValor += 1;
        lista.push({
          id: "pd" + k, nome: nome,
          whatsapp: "+55 11 97000-" + String(1000 + k).slice(-4),
          email: nome.toLowerCase().split(" ")[0] + "@exemplo.com", moeda: val.m,
          status: "aluna", estagio: "matriculado", badge: "",
          origem: { canal: "Indicação", detalhe: "", veioDe: "", entrouPor: "" },
          formatos: ["grupo"], turma: label, professora: u.teacher,
          nivel: u.nivel, horarios: u.turma, querComecar: "",
          entrouEm: addDays(-120 - k), desde: addDays(-100 - k),
          proximoFollowup: "",
          contratos: [{ tipo: "Matrícula", ciclos: "Ciclo " + (u.cycle || "2.2026"),
            moeda: val.m, valorTotal: val.total, parcelaValor: val.v,
            parcelas: 3, vencDia: 10, fim: addDays(60),
            meses: mkMeses(1, val.v, 3) }],
          documentos: [],
          historico: [{ data: addDays(-100 - k), tipo: "matricula",
            texto: "Matriculada · " + u.nivel }]
        });
      }
    });
  }

  // Sem programa e sem chamada, a área da aluna abre vazia e não dá para
  // ver o que ela faz. O exemplo abaixo é fictício, como o resto do seed.
  function semearProgramaDemo(lista) {
    try {
      if ((JSON.parse(localStorage.getItem("isr_programas_v1")) || []).length) return;
    } catch (e) {}
    // O acompanhamento é vendido à parte: quase todo mundo aqui não está
    // em turma nenhuma. O exemplo reflete isso — quatro só do programa e
    // uma aluna de turma que também comprou.
    var d = today(); d.setDate(d.getDate() - 21); // começou há três semanas
    var inicio = iso(d);
    var soPrograma = [
      { nome: "Renata Aguiar", whatsapp: "+55 11 96000-0001", email: "renata@exemplo.com" },
      { nome: "Tatiane Melo",  whatsapp: "+55 21 96000-0002", email: "tatiane@exemplo.com" },
      { nome: "Vanessa Coelho", whatsapp: "+55 31 96000-0003", email: "vanessa@exemplo.com" },
      { nome: "Priscila Nunes", whatsapp: "+55 41 96000-0004", email: "priscila@exemplo.com" }
    ];
    var pg = { id: "pgDemo", nome: "Programa Sem Roteiro", inicio: inicio,
      semanas: 8, diaFeedback: 5,
      missoes: MISSOES_PILOTO.slice(),
      participantes: [], progresso: {}, respostas: {},
      missoesEnviadas: { 1: inicio, 2: inicio, 3: iso(today()) },
      participacao: {} };

    soPrograma.forEach(function (x, i) {
      var id = "pp" + (i + 1);
      lista.push({ id: id, nome: x.nome, whatsapp: x.whatsapp, email: x.email,
        status: "programa", estagio: "matriculado", desde: inicio,
        origem: { canal: "Instagram", detalhe: "ig · acompanhamento", entrouPor: "/acompanhamento" },
        formatos: ["programa"], turma: "", professora: "", nivel: "",
        contratos: [], historico: [{ data: inicio, tipo: "matricula",
          texto: "Entrou no Programa Sem Roteiro · € 27,00 (pago)" }],
        programa: { id: pg.id, nome: pg.nome, moeda: "€", valor: "€ 27,00",
          desde: inicio, pago: true, por: "Gabi" } });
      pg.participantes.push(id);
    });

    // a exceção: uma aluna de turma que também faz o acompanhamento
    var aluna = lista.filter(function (p) { return p.status === "aluna"; })[0];
    if (aluna) {
      aluna.programa = { id: pg.id, nome: pg.nome, moeda: "€", valor: "€ 27,00",
        desde: inicio, pago: true, por: "Gabi" };
      pg.participantes.push(aluna.id);
    }

    pg.participantes.forEach(function (id, i) {
      for (var s = 1; s <= 2; s++) {
        if (i > 2 && s === 2) continue; // nem todo mundo responde tudo
        pg.progresso[id + "|" + s] = { audio: inicio, feedback: inicio };
        pg.respostas[id + "|" + s] = { texto: "Resposta da semana " + s + ".", em: inicio };
      }
      pg.participacao[id] = i < 3 ? 2 : 1;
    });

    try {
      localStorage.setItem("isr_programas_v1", JSON.stringify([pg]));
      localStorage.setItem(PESSOAS_KEY, JSON.stringify(lista));
    } catch (e) {}
  }

  // Sem uma aula extra marcada, o bloco de confirmar presença nunca
  // aparece no app da aluna e não dá para ver que ele existe.
  function semearAulaExtraDemo(lista) {
    try {
      if ((JSON.parse(localStorage.getItem("isr_eventos_v1")) || []).length) return;
    } catch (e) {}
    var d = today(); d.setDate(d.getDate() + 5);
    var alunas = lista.filter(function (p) { return p.status === "aluna"; }).slice(0, 6);
    var ev = { id: "evDemo", titulo: "Movie Club", data: iso(d), hora: "20:00",
      tipo: "aula_extra", responsavel: "Gabi", professora: "Gabi",
      duracao: 90, local: "Zoom", vagas: 12,
      descricao: "Assistimos a um curta e conversamos sobre ele em inglês.",
      turmaAlvo: "", rsvps: {}, manuais: alunas.map(function (p) { return p.id; }),
      criadoEm: iso(today()) };
    try { localStorage.setItem("isr_eventos_v1", JSON.stringify([ev])); } catch (e) {}
  }

  // Clubes de exemplo, com uma aluna em três deles: é a situação que
  // a tela existe para resolver — o terceiro clube é pago, e quem
  // está devendo tem que aparecer.
  function semearClubesDemo(lista) {
    try {
      if ((JSON.parse(localStorage.getItem(CLUBES_KEY)) || []).length) return;
    } catch (e) {}
    var alunas = lista.filter(function (p) { return p.status === "aluna"; });
    if (!alunas.length) return;
    var base = [
      { id: "clBook", nome: "Book Club", professora: "Carla", formato: "online",
        dia: "quinta", hora: "20:00", duracao: "60 min", vagas: 8, status: "publicado",
        descricao: "Um livro por ciclo, um capítulo por encontro." },
      { id: "clMovie", nome: "Movie Lovers", professora: "Gabi", formato: "online",
        dia: "quarta", hora: "20:30", duracao: "90 min", vagas: 10, status: "publicado",
        descricao: "Um filme por mês, conversa na semana seguinte." },
      { id: "clChef", nome: "Chef Traditions", professora: "Adrielly", formato: "presencial",
        dia: "sábado", hora: "10:00", duracao: "120 min", vagas: 6, status: "publicado",
        local: "Den Haag · a combinar",
        descricao: "Cozinhar e conversar. Receita de casa de cada uma." },
      { id: "clDutch", nome: "Dutch Life Talk", professora: "Érika", formato: "online",
        dia: "segunda", hora: "19:30", duracao: "60 min", vagas: 10, status: "rascunho",
        descricao: "A vida na Holanda, em inglês." }
    ];
    var agora = Date.now();
    var dd = function (n) {
      var d = today(); d.setDate(d.getDate() + n);
      return ("0" + d.getDate()).slice(-2) + "/" + ("0" + (d.getMonth() + 1)).slice(-2);
    };
    var TEMAS = {
      clBook: ["Capítulos 1 e 2", "Capítulos 3 e 4", "Capítulos 5 e 6", "O final, e o que faríamos diferente"],
      clMovie: ["O filme do mês", "As cenas que ficaram", "Um curta curto", "A escolha do próximo mês"],
      clChef: ["Receita de casa de cada uma", "Mercado e ingredientes", "Cozinhar junto", "A mesa, e a conversa"],
      clDutch: ["Morar fora", "Trabalho e burocracia", "Amizade na Holanda", "O que levamos de volta"]
    };
    var MATS = {
      clBook: [{ label: "O livro do ciclo", link: "" }, { label: "Lista de palavras", link: "" }],
      clMovie: [{ label: "Lista dos filmes", link: "" }],
      clChef: [{ label: "As receitas", link: "" }],
      clDutch: []
    };
    base.forEach(function (c, k) {
      c.membros = []; c.espera = []; c.entrou = {}; c.pagos = {};
      c.link = "";
      c.materiais = MATS[c.id] || [];
      c.encontros = (TEMAS[c.id] || []).map(function (t, i) {
        return { quando: dd(3 + i * 7 + k), tema: t };
      });
      c.vagas = c.vagas || 0;
    });
    // as três primeiras alunas entram em dois clubes; a primeira entra
    // num terceiro e fica devendo
    alunas.slice(0, 5).forEach(function (p, i) {
      var quais = [base[i % 3], base[(i + 1) % 3]];
      if (i === 0) quais.push(base[2]);
      quais.forEach(function (c, j) {
        if (c.membros.indexOf(p.id) >= 0) return;
        if (c.vagas && c.membros.length >= c.vagas) { c.espera.push(p.id); return; }
        c.membros.push(p.id);
        c.entrou[p.id] = new Date(agora + i * 86400000 + j * 1000).toISOString();
      });
    });
    try { localStorage.setItem(CLUBES_KEY, JSON.stringify(base)); } catch (e) {}
  }

  // Sem contatos registrados, a agenda do comercial abre zerada e não dá
  // para ver a distribuição do trabalho.
  function semearContatosDemo(lista) {
    try {
      if ((JSON.parse(localStorage.getItem("isr_toques_v1")) || []).length) return;
    } catch (e) {}
    var alvos = lista.filter(function (p) {
      return p.status === "lead" || p.status === "aluna";
    }).slice(0, 8);
    if (!alvos.length) return;
    var quem = ["Carla", "Carla", "Gabi", "Carla", "Érika", "Gabi"];
    var out = [];
    alvos.forEach(function (p, i) {
      // dois contatos por pessoa, espalhados em dias úteis das últimas semanas
      [3 + i * 2, 11 + i].forEach(function (atras, k) {
        var d = today(); d.setDate(d.getDate() - atras);
        if (d.getDay() === 0) d.setDate(d.getDate() - 2);
        if (d.getDay() === 6) d.setDate(d.getDate() - 1);
        out.push({ id: "tq" + i + "" + k, pessoaId: p.id, data: iso(d),
          tipo: k === 0 ? "whatsapp" : "followup",
          nota: "", por: quem[(i + k) % quem.length] });
      });
    });
    try { localStorage.setItem("isr_toques_v1", JSON.stringify(out)); } catch (e) {}
  }

  function semearChamadasDemo(lista) {
    try {
      if (Object.keys(JSON.parse(localStorage.getItem("isr_chamadas_v1")) || {}).length) return;
    } catch (e) {}
    var mapa = {};
    var porTurma = {};
    lista.forEach(function (p) {
      if (p.status !== "aluna" || !p.turma) return;
      (porTurma[p.turma] = porTurma[p.turma] || []).push(p);
    });
    Object.keys(porTurma).forEach(function (turma) {
      for (var semana = 1; semana <= 4; semana++) {
        var d = today(); d.setDate(d.getDate() - semana * 7);
        var data = iso(d);
        var presencas = {};
        porTurma[turma].forEach(function (p, i) {
          presencas[p.id] = (semana === 2 && i === 1) ? "falta" : "presente";
        });
        mapa[turma + "|" + data] = { turma: turma, data: data, presencas: presencas,
          tarefas: {}, salvoEm: data };
      }
    });
    try { localStorage.setItem("isr_chamadas_v1", JSON.stringify(mapa)); } catch (e) {}
  }
  // A lista crua guarda também as lápides (pessoas apagadas). Apagar não
  // pode ser só remover: a mesclagem do sync SOMA registros e o banco
  // devolvia a pessoa no puxe seguinte. A lápide guarda SÓ o id (os dados
  // da pessoa somem de verdade), viaja pelo sync com carimbo novo, vence
  // a cópia viva nos outros aparelhos e some das telas em todos eles.
  function loadPessoasRaw() {
    ensureSeed();
    try { return JSON.parse(localStorage.getItem(PESSOAS_KEY)) || []; }
    catch (e) { return []; }
  }
  function loadPessoas() {
    return loadPessoasRaw().filter(function (p) { return !(p && p.apagado); });
  }
  function savePessoasLocal(list) {
    // quem salva recebeu a lista sem as lápides — devolvê-las aqui é o
    // que impede um save comum de ressuscitar a pessoa apagada
    var vivos = {};
    (list || []).forEach(function (p) { if (p && p.id) vivos[p.id] = true; });
    var lapides = loadPessoasRaw().filter(function (p) { return p && p.apagado && !vivos[p.id]; });
    try { localStorage.setItem(PESSOAS_KEY, JSON.stringify((list || []).concat(lapides))); } catch (e) {}
  }
  function savePessoas(list) { savePessoasLocal(list); agendarSync(); }
  function getPessoa(id) { return loadPessoas().filter(function (p) { return p.id === id; })[0] || null; }
  function mutate(id, fn) {
    var list = loadPessoas();
    for (var i = 0; i < list.length; i++) if (list[i].id === id) { fn(list[i]); carimbar(list[i]); break; }
    savePessoas(list);
    return list;
  }
  // Carimbo de versão: é o que permite mesclar edições de duas pessoas
  // sem uma apagar a outra. Todo registro alterado leva a hora da alteração.
  function carimbar(reg) {
    if (reg && typeof reg === "object") reg._v = Date.now();
    return reg;
  }
  function carimbarLista(lista) {
    (lista || []).forEach(function (r) { if (r && !r._v) r._v = Date.now(); });
    return lista;
  }
  // historico é append-only — toda escrita relevante passa por aqui
  // Quem cuida da integração: quem tem o papel de operação, ou a gestora.
  function donoDaIntegracao() {
    var eq = equipeLista();
    var op = eq.filter(function (m) { return (m.papeis || []).indexOf("operacao") >= 0; })[0];
    if (op) return op.nome;
    var g = eq.filter(function (m) { return (m.papeis || []).indexOf("gestora") >= 0; })[0];
    return g ? g.nome : "Gabi";
  }

  // A data é o dia em que a coisa aconteceu, não o dia em que foi
  // digitada. Sem poder informá-la, uma aula de agosto registrada em
  // setembro entrava como aula de setembro — e era paga no mês errado.
  function pushHist(p, tipo, texto, quem, data) {
    p.historico = p.historico || [];
    p.historico.push({ data: data || iso(today()), tipo: tipo, texto: texto, quem: quem || "" });
  }
  function addHistory(id, tipo, texto, quem) { return mutate(id, function (p) { pushHist(p, tipo, texto, quem); }); }

  // ── AÇÕES (spec: todo dado nasce de uma ação) ─────────────────
  function updateLead(id, patch) { return mutate(id, function (p) { Object.assign(p, patch); }); }
  // Rede de segurança: "matriculado" é consequência de matricular(), não um
  // rótulo que se escolhe. Marcar só o estágio deixava a pessoa aparecendo
  // como matriculada sem contrato, sem turma e fora do cadastro de Alunas.
  function setStage(id, stageId) {
    if (stageId === "matriculado") {
      var atual = getPessoa(id);
      var jaVendido = atual && (atual.status === "aluna" || atual.status === "mvs"
        || atual.status === "programa" || atual.status === "pausada");
      if (!jaVendido) {
        if (typeof console !== "undefined" && console.warn) {
          console.warn("ISR: matrícula depende de turma e contrato — use matricular().");
        }
        return loadPessoas();
      }
    }
    var st = STAGES.filter(function (s) { return s.id === stageId; })[0];
    return mutate(id, function (p) { p.estagio = stageId; pushHist(p, "estagio", "Estágio → " + (st ? st.label : stageId)); });
  }
  function setFollowup(id, isoStr, label) {
    return mutate(id, function (p) { p.proximoFollowup = isoStr; pushHist(p, "followup", "Follow-up agendado" + (label ? " · " + label : "")); });
  }
  function addNote(id, texto) { return addHistory(id, "nota", texto); }
  // registra um toque de verdade — é o toque que zera o "sem contato há
  // N dias" e silencia o aviso de ausências (só o histórico não contava)
  function registrarContato(id, detalhe) { return registrarToque(id, "checkin", detalhe || ""); }
  function marcarPerdido(id, motivo) {
    return mutate(id, function (p) {
      p.estagio = "perdido"; p.motivoPerda = motivo || "Outro"; p.saidaEm = iso(today());
      if (p.status === "aluna") p.status = "ex-aluna";
      // quem tinha contrato (importado do controle de pagamento, por
      // exemplo) não pode continuar gerando parcela a vencer
      var hojeIso = iso(today());
      var canceladas = 0;
      (p.contratos || []).forEach(function (c) {
        var dia = parseInt(c.vencDia, 10); if (isNaN(dia)) dia = 10;
        (c.meses || []).forEach(function (m) {
          if (m.pago || m.cancelada) return;
          var venc = m.key + "-" + (dia < 10 ? "0" : "") + dia;
          if (venc < hojeIso) return;   // vencida continua sendo dívida
          m.cancelada = true; canceladas++;
        });
      });
      pushHist(p, "perdido", "Marcado perdido · motivo: " + (motivo || "Outro")
        + (canceladas ? " · " + canceladas
          + (canceladas === 1 ? " parcela a vencer cancelada" : " parcelas a vencer canceladas") : ""));
    });
  }
  function lapidePessoa(id) { return { id: id, apagado: iso(today()), _v: Date.now() }; }
  function deleteLead(id) {
    // a pessoa vira lápide (só o id) para o apagamento valer em todos os
    // aparelhos — remover da lista fazia o sync devolvê-la no puxe
    var list = loadPessoasRaw().map(function (p) { return p.id === id ? lapidePessoa(id) : p; });
    try { localStorage.setItem(PESSOAS_KEY, JSON.stringify(list)); } catch (e) {}
    agendarSync();
    return loadPessoas();
  }
  // Novo lead manual (spec 1.1: o registro nasce no primeiro contato)
  // Date.now() sozinho repetia o id quando a importação criava várias
  // pessoas no mesmo milissegundo — e aí editar uma mexia na outra.
  var pessoaSeq = 0;
  function novaPessoaId() { return "p" + Date.now() + "-" + (pessoaSeq++); }
  function novaPessoa(dados) {
    var list = loadPessoas();
    var p = {
      id: novaPessoaId(),
      nome: (dados.nome || "").trim(),
      whatsapp: (dados.whatsapp || "").trim(),
      email: (dados.email || "").trim(),
      moeda: dados.moeda || "R$",
      status: "lead", estagio: "a_contatar", badge: "",
      origem: { canal: dados.canal || "WhatsApp", detalhe: "cadastro manual", veioDe: "-", entrouPor: "-" },
      formatos: [], turma: "", professora: "",
      nivel: dados.nivel || "", horarios: dados.horarios || "",
      querComecar: dados.querComecar || "",
      entrouEm: iso(today()), desde: "", proximoFollowup: "",
      contratos: [], documentos: [],
      historico: [{ data: iso(today()), tipo: "criado", texto: "Lead criado manualmente" + (dados.canal ? " · canal: " + dados.canal : "") }]
    };
    list.unshift(p);
    savePessoas(list);
    return p;
  }

  function setOnboardingFeito(id, cpId, feito) {
    return mutate(id, function (p) {
      (p.onboarding || []).forEach(function (c) {
        if (c.id === cpId) {
          c.feito = feito;
          if (feito) pushHist(p, "onboarding", "Onboarding concluído: " + c.label);
        }
      });
    });
  }
  function setProximoCheckin(id, isoStr) {
    return mutate(id, function (p) {
      p.proximoCheckin = isoStr;
      pushHist(p, "checkin", "Próximo check-in agendado para " + ddmm(isoStr));
    });
  }
  function registrarCheckinFeito(id) {
    return mutate(id, function (p) {
      p.proximoCheckin = "";
      pushHist(p, "checkin", "Check-in realizado");
    });
  }

  function addDocumento(id, nome, link) {
    return mutate(id, function (p) {
      p.documentos = p.documentos || [];
      p.documentos.push({ nome: nome, link: link });
      pushHist(p, "documento", "Documento adicionado · " + nome);
    });
  }

  // Transição lead→aluna (spec 6): zero recadastro.
  // cfg: { turmaId, tipo, ciclos, moeda, valorParcela, parcelas, vencDia }
  // ── CONDIÇÕES COMBINADAS (antes da matrícula) ────────────────
  // A negociação fecha antes do pagamento entrar. Guardar as condições
  // aqui evita redigitar tudo na matrícula e permite ver, no funil,
  // quanto já está combinado mas ainda não virou contrato.
  function salvarProposta(id, cfg) {
    return mutate(id, function (p) {
      var moeda = (cfg && cfg.moeda) || p.moeda || "R$";
      var val = function (v) { return v && !/[R$€]/.test(String(v)) ? fmtMoney(moeda, parseMoney(v)) : (v || ""); };
      var n = parseInt(cfg && cfg.parcelas, 10) || 3;
      p.proposta = {
        moeda: moeda,
        valorParcela: val(cfg && cfg.valorParcela),
        parcelas: n,
        vencDia: parseInt(cfg && cfg.vencDia, 10) || 10,
        sinalValor: val(cfg && cfg.sinalValor),
        sinalRecebido: !!(cfg && cfg.sinalRecebido),
        turmaId: (cfg && cfg.turmaId) || "",
        em: iso(today()), por: ((gestaoUser() || {}).nome || "")
      };
      p.moeda = moeda;
      var total = fmtMoney(moeda, parseMoney(p.proposta.valorParcela) * n);
      pushHist(p, "pagamento", "Condições combinadas · " + n + " × "
        + (p.proposta.valorParcela || "—") + " = " + total
        + " · vencimento dia " + p.proposta.vencDia
        + (p.proposta.sinalValor
            ? " · sinal de " + p.proposta.sinalValor
              + (p.proposta.sinalRecebido ? " recebido" : " ainda não recebido")
            : ""));
    });
  }
  function propostaDe(id) { var p = getPessoa(id); return (p && p.proposta) || null; }
  function resumoProposta(pr) {
    if (!pr || !pr.valorParcela) return "";
    var n = parseInt(pr.parcelas, 10) || 3;
    var total = fmtMoney(pr.moeda || "R$", parseMoney(pr.valorParcela) * n);
    return n + " × " + pr.valorParcela + " = " + total + " · vencimento dia " + pr.vencDia
      + (pr.sinalValor ? " · sinal de " + pr.sinalValor
          + (pr.sinalRecebido ? " recebido" : " ainda não recebido") : "");
  }

  // A matrícula encerra a conversa de matrícula pendente. Sem isto, a
  // conversa de quem fechou ficava aberta no funil ("passou da data")
  // e nunca contava na conversão.
  function concluirReuniaoPelaMatricula(p) {
    if (p.reuniao && !p.reuniao.feita) {
      p.reuniao.feita = true;
      pushHist(p, "reuniao", "Conversa de matrícula concluída — virou matrícula");
    }
  }

  function matricular(id, cfg) {
    // condições já combinadas valem como padrão: o que não vier no
    // formulário da matrícula é herdado da proposta, sem redigitar
    var pAtual = getPessoa(id);
    var pr = (pAtual && pAtual.proposta) || null;
    if (pr) {
      cfg = cfg || {};
      if (!cfg.moeda) cfg.moeda = pr.moeda;
      if (!cfg.valorParcela) cfg.valorParcela = pr.valorParcela;
      if (!cfg.parcelas) cfg.parcelas = pr.parcelas;
      if (!cfg.vencDia) cfg.vencDia = pr.vencDia;
      if (!cfg.sinalValor) { cfg.sinalValor = pr.sinalValor; cfg.sinalRecebido = pr.sinalRecebido; }
      if (!cfg.turmaId) cfg.turmaId = pr.turmaId;
    }
    // valores digitados sem símbolo ("497,00") são normalizados com a moeda
    // escolhida, para que parcela e sinal saiam iguais no resto do sistema
    var moedaCfg = cfg.moeda || "R$";
    ["valorParcela", "sinalValor", "valorTotal"].forEach(function (campo) {
      var v = cfg[campo];
      if (v && !/[R$€]/.test(String(v))) cfg[campo] = fmtMoney(moedaCfg, parseMoney(v));
    });
    var particular = cfg.turmaId === "particular";
    var unit = turmasLista().filter(function (u) { return u.id === cfg.turmaId; })[0];
    var turmaLabel = particular ? "Particular" : (unit ? (unit.nivel + " · " + unit.turma) : (cfg.turmaLabel || ""));
    var n = parseInt(cfg.parcelas, 10) || 3;
    return mutate(id, function (p) {
      p.status = "aluna";
      p.estagio = "matriculado";
      concluirReuniaoPelaMatricula(p);
      p.turma = turmaLabel;
      p.professora = unit ? unit.teacher : "";
      p.formatos = (p.formatos || []).concat([particular ? "particular" : "grupo"]);
      if (particular) {
        p.particular = { inicio: cfg.inicioEm || iso(today()),
          aulas: parseInt(cfg.aulasContratadas, 10) || 0, feitas: 0 };
      }
      // Matrícula retroativa: ao importar uma base, a aluna entrou lá atrás.
      // Sem isto, todo mundo importado vira "matriculada hoje" e cai no
      // segmento de primeiro ciclo, com as parcelas nascendo no mês errado.
      p.desde = cfg.desde || iso(today());
      p.contratos = p.contratos || [];
      // o ciclo começa no mês da matrícula, não numa data fixa do calendário.
      // Se o dia de vencimento do mês corrente já passou, a primeira parcela
      // vai para o mês seguinte — ninguém cobra uma parcela já vencida.
      var inicioKey = cfg.inicioKey;
      if (!inicioKey) {
        // numa matrícula retroativa o ciclo começa no mês de entrada
        if (cfg.desde) {
          inicioKey = cfg.desde.slice(0, 7);
        } else {
          inicioKey = mesAtualKey();
          var diaVenc = parseInt(cfg.vencDia, 10);
          if (!isNaN(diaVenc) && today().getDate() > diaVenc) inicioKey = mesSeguinte(inicioKey).key;
        }
      }
      var jaPagas = parseInt(cfg.parcelasPagas, 10);
      if (isNaN(jaPagas) || jaPagas < 0) jaPagas = 0;
      if (jaPagas > n) jaPagas = n;
      var mesesNovos = mkMeses(jaPagas, cfg.valorParcela || "", n, inicioKey);
      // valor total: informado, ou calculado (parcela × nº de parcelas) pro LTV
      var moedaC = cfg.moeda || p.moeda || "R$";
      var totalCalc = cfg.valorTotal || (cfg.valorParcela ? fmtMoney(moedaC, parseMoney(cfg.valorParcela) * n) : "");
      p.contratos.unshift({
        tipo: cfg.tipo || "Matrícula", ciclos: cfg.ciclos || "1 Ciclo " + metasAtuais().cicloLabel,
        // O dia em que o contrato foi fechado. A comissão precisa dele:
        // sem isso a venda era datada por p.desde, a entrada da pessoa na
        // escola — e uma renovação, que mantém a entrada original, não
        // contava como venda em mês nenhum. Numa matrícula retroativa a
        // venda é do mês da entrada; numa matrícula cujas aulas só
        // começam mais para a frente, o contrato foi fechado hoje — a
        // data de início não pode datar um fechamento no futuro.
        fechadoEm: cfg.fechadoEm
          || ((cfg.desde && cfg.desde < iso(today())) ? cfg.desde : iso(today())),
        moeda: moedaC, valorTotal: totalCalc,
        parcelaValor: cfg.valorParcela || "", parcelas: n, vencDia: cfg.vencDia || 10,
        fim: mesesNovos[mesesNovos.length - 1].key + "-28",
        meses: mesesNovos
      });
      if (cfg.sinalValor) {
        p.contratos[p.contratos.length - 1].sinal = { valor: cfg.sinalValor, recebido: !!cfg.sinalRecebido };
        pushHist(p, "pagamento", "Sinal de " + cfg.sinalValor + (cfg.sinalRecebido ? " recebido" : " combinado (aguardando comprovante)"));
      }
      // A integração conta a partir da entrada. Numa matrícula retroativa as
      // etapas já vencidas entram concluídas: cobrar boas-vindas de quem está
      // na escola há seis meses só polui a fila da equipe.
      var base = parseISO(p.desde) || today();
      // Numa matrícula cujas aulas começam mais para a frente, a integração
      // conta de hoje: boas-vindas e confirmação da primeira aula são do dia
      // do fechamento, não de um mês depois.
      if (base > today()) base = today();
      var desloca = function (dias) {
        var d = new Date(base); d.setDate(d.getDate() + dias); return iso(d);
      };
      var retro = !!cfg.desde && daysBetween(base, today()) > 0;
      p.onboarding = [
        { id: "d0", label: "Boas-vindas enviadas", data: desloca(0) },
        { id: "d2", label: "Confirmou a 1ª aula", data: desloca(2) },
        { id: "d7", label: "Check-in da 1ª semana", data: desloca(7) },
        { id: "d30", label: "1º pagamento ok + NPS", data: desloca(30) }
      ].map(function (c) {
        c.feito = retro && c.data < iso(today());
        return c;
      });
      pushHist(p, "matricula", "Matriculada · " + turmaLabel + " · contrato " + (cfg.tipo || "Matrícula")
        + " criado (" + n + " parcelas" + (jaPagas ? ", " + jaPagas + " já paga(s)" : "") + ")"
        + (cfg.desde
            ? (retro ? " · entrada retroativa em " + ddmm(cfg.desde)
                     : " · aulas a partir de " + ddmm(cfg.desde))
            : ""));
      pushHist(p, "onboarding", "Onboarding criado (4 checkpoints: boas-vindas, 1ª aula, 1ª semana, 1º pagamento)");
      // Matrícula nova é notícia para duas pessoas: quem faz a integração
      // precisa começar, e a gestão precisa saber que entrou aluna.
      if (!retro) {
        var quem = (gestaoUser() || {}).nome || "";
        var ondeQuando = turmaLabel + (unit && unit.teacher ? " · com " + unit.teacher : "");
        // A equipe fica sabendo pela tarefa de integração criada
        // abaixo e pelo histórico da aluna. O aviso avulso dependia do
        // Mural, que saiu no corte do v5.
        addTarefa({
          titulo: "Integração de " + p.nome,
          detalhe: ondeQuando + " · boas-vindas, confirmação da 1ª aula, check-in da 1ª semana e 1º pagamento",
          dono: donoDaIntegracao(),
          prazo: p.onboarding[0].data,
          por: quem
        });
      }
    });
  }

  // ── COMPAT: visão "leads" (CRM) sobre Pessoas ─────────────────
  function toLeadShape(p) {
    return {
      id: p.id, nome: p.nome, telefone: p.whatsapp, whatsapp: p.whatsapp, email: p.email,
      reuniao: p.reuniao || null,
      canal: (p.origem && p.origem.canal) || "—",
      origemDetalhe: (p.origem && p.origem.detalhe) || "",
      veioDe: (p.origem && p.origem.veioDe) || "",
      entrouPor: (p.origem && p.origem.entrouPor) || "",
      entrouEm: p.entrouEm, turma: p.turma, nivel: p.nivel,
      horarios: p.horarios, querComecar: p.querComecar,
      estagio: p.estagio, badge: p.badge || "",
      proximoFollowup: p.proximoFollowup || "",
      inscricao: p.inscricao || [],
      historico: p.historico || [], status: p.status, motivoPerda: p.motivoPerda || ""
    };
  }
  function getLeads() { return loadPessoas().map(toLeadShape); }
  function getLead(id) { var p = getPessoa(id); return p ? toLeadShape(p) : null; }

  function isParaHojeLead(l) {
    if (l.estagio === "perdido" || l.estagio === "matriculado") return false;
    // Inscrição incompleta fica estacionada na aba própria: só volta ao
    // Para hoje se alguém marcar um follow-up de propósito.
    if (l.proximoFollowup) {
      var d = parseISO(l.proximoFollowup);
      if (d && daysBetween(d, today()) >= 0) return true;
    }
    return false;
  }
  function leadsForTab(tabId) {
    var leads = getLeads();
    var tab = TABS.filter(function (t) { return t.id === tabId; })[0];
    if (!tab) return leads;
    if (tab.smart) return leads.filter(isParaHojeLead);
    return leads.filter(function (l) { return l.estagio === tab.stage; });
  }
  function tabCounts() {
    var counts = {};
    TABS.forEach(function (t) { counts[t.id] = leadsForTab(t.id).length; });
    return counts;
  }

  // ── COMPAT: visão "cobrança" sobre Pessoas (contrato vigente) ──
  function contratoVigente(p) { return (p.contratos && p.contratos[0]) || null; }
  function toCobrancaShape(p) {
    var c = contratoVigente(p);
    // Renovar não perdoa dívida: o que ficou em aberto no ciclo anterior
    // continua a cobrar junto do ciclo novo. Sem isto a parcela some da
    // tela no dia em que a renovação é registrada.
    var atrasHerdado = [];
    (p.contratos || []).forEach(function (cx, idx) {
      if (idx === 0) return;
      (cx.meses || []).forEach(function (m) {
        if (!m.pago && !m.cancelada) atrasHerdado.push(Object.assign({}, m, { anterior: true, contratoIdx: idx }));
      });
    });
    var meses = atrasHerdado.concat((c.meses || []).map(function (m) {
      return Object.assign({}, m, { anterior: false, contratoIdx: 0 });
    }));
    return {
      id: p.id, nome: p.nome, telefone: p.whatsapp,
      tipo: c.tipo, ciclos: c.ciclos, moeda: c.moeda,
      valorTotal: c.valorTotal, parcelaValor: c.parcelaValor,
      parcelas: c.parcelas, vencDia: c.vencDia, meses: meses,
      herdadas: atrasHerdado.length,
      obs: p.obsCobranca || "", fim: c.fim || ""
    };
  }
  function getCobranca() {
    return loadPessoas()
      .filter(function (p) { return (p.status === "aluna" || p.status === "mvs") && contratoVigente(p) && (contratoVigente(p).meses || []).length; })
      .map(toCobrancaShape);
  }
  // Aluna ativa sem contrato ou sem parcelas não entra na cobrança — mas
  // sumir da tela em silêncio esconde exatamente o furo que precisa de
  // ação. A lista existe para a tela do Financeiro apontá-las.
  function alunasSemPlano() {
    return loadPessoas().filter(function (p) {
      if (p.status !== "aluna" && p.status !== "mvs") return false;
      if (assinaturaAtiva(p)) return false; // assinatura \u00e9 recorr\u00eancia pr\u00f3pria
      var c = contratoVigente(p);
      return !c || !(c.meses || []).length;
    }).map(function (p) { return { id: p.id, nome: p.nome, turma: p.turma || "" }; });
  }
  function cobrancaStatus(c) {
    var meses = c.meses || [];
    if (meses.length && meses.every(function (m) { return m.pago; })) return "quitada";
    if (c.vencDia === "auto") return "auto";
    var key = mesAtualKey();
    var mes = meses.filter(function (m) { return m.key === key; })[0];
    if (!mes) return "em_dia";
    if (mes.pago) return "paga_mes";
    var hoje = new Date().getDate();
    var d = parseInt(c.vencDia, 10);
    if (isNaN(d)) return "em_dia";
    if (hoje > d) return "atrasada";
    if (d - hoje <= 5) return "vence_breve";
    return "em_dia";
  }
  // Grade de parcelas: mesma escrita no Perfil e na Cobrança (spec 5/8)
  // A parcela pode estar num contrato que já não é o vigente: quem renovou
  // com parcela em aberto continua devendo, e a marcação precisa chegar lá.
  // contratoIdx vem da grade (parcelasAbertas); sem ele, vale o vigente.
  function setParcelaPaga(pessoaId, mesKey, pago, contratoIdx) {
    return mutate(pessoaId, function (p) {
      var cs = p.contratos || [];
      var idx = contratoIdx === undefined || contratoIdx === null ? null : parseInt(contratoIdx, 10);
      // sem índice: o contrato mais antigo que ainda tem esse mês em aberto
      if (idx === null) {
        idx = 0;
        for (var i = cs.length - 1; i >= 0; i--) {
          var achou = (cs[i].meses || []).filter(function (m) { return m.key === mesKey && !m.pago; })[0];
          if (achou) { idx = i; break; }
        }
      }
      var c = cs[idx];
      if (!c) return;
      var deAntes = idx > 0 ? " · ciclo anterior" : "";
      (c.meses || []).forEach(function (m) {
        if (m.key === mesKey) {
          m.pago = pago;
          pushHist(p, "pagamento", "Parcela de " + m.label + " marcada " + (pago ? "PAGA" : "pendente") + " (" + m.valor + ")" + deAntes);
        }
      });
    });
  }

  // Nem todo contrato tem parcela igual. Uma renovação pode combinar seis
  // parcelas de R$ 515 com a primeira dividida em sinal de R$ 200 e saldo
  // de R$ 315 — e até aqui não havia como registrar isso: o valor da
  // parcela vinha do contrato e valia para todas. Quem fechava um acordo
  // assim não conseguia corrigir na tela, e a cobrança saía errada.
  function setParcelaValor(pessoaId, mesKey, valor, contratoIdx) {
    return mutate(pessoaId, function (p) {
      var cs = p.contratos || [];
      var idx = contratoIdx === undefined || contratoIdx === null ? 0 : parseInt(contratoIdx, 10);
      var c = cs[idx];
      if (!c) return;
      var moeda = c.moeda || p.moeda || "R$";
      var novo = /[R$€]/.test(String(valor)) ? String(valor) : fmtMoney(moeda, parseMoney(valor));
      (c.meses || []).forEach(function (m) {
        if (m.key !== mesKey) return;
        var antes = m.valor;
        m.valor = novo;
        // o valor combinado com a pessoa mudou: o total do contrato deixa
        // de ser parcela × número de parcelas e passa a ser a soma real
        pushHist(p, "contrato", "Parcela de " + m.label + ": " + antes + " → " + novo);
      });
      c.valorTotal = fmtMoney(moeda, somaDoContrato(c));
    });
  }

  // O total de um contrato é a soma das parcelas, não a multiplicação —
  // basta uma parcela diferente para os dois números se separarem. O sinal
  // soma sempre: ele é dinheiro que a pessoa paga. O que a marca "abatido"
  // diz é que a parcela correspondente já foi reduzida no mesmo valor —
  // seis parcelas de R$ 515 com sinal de R$ 200 abatido viram
  // R$ 200 + R$ 315 + cinco de R$ 515, e o total continua R$ 3.090.
  function somaDoContrato(c) {
    var t = (c.meses || []).reduce(function (s, m) {
      return s + (m.cancelada ? 0 : parseMoney(m.valor));
    }, 0);
    if (c.sinal && c.sinal.valor && !c.sinal.cancelada) t += parseMoney(c.sinal.valor);
    return t;
  }

  // O sinal ganhou data e ganhou a pergunta que faltava: ele é um valor a
  // mais ou é a primeira parte de uma parcela? Sem isso, o contrato de
  // R$ 3.090 pago com sinal de R$ 200 aparecia como R$ 3.290.
  function setSinal(pessoaId, dados, contratoIdx) {
    return mutate(pessoaId, function (p) {
      var cs = p.contratos || [];
      var idx = contratoIdx === undefined || contratoIdx === null ? 0 : parseInt(contratoIdx, 10);
      var c = cs[idx];
      if (!c) return;
      var moeda = c.moeda || p.moeda || "R$";
      c.sinal = c.sinal || {};
      if (dados.valor !== undefined) {
        c.sinal.valor = /[R$€]/.test(String(dados.valor)) ? String(dados.valor)
          : fmtMoney(moeda, parseMoney(dados.valor));
      }
      if (dados.venc !== undefined) c.sinal.venc = dados.venc;
      if (dados.recebido !== undefined) c.sinal.recebido = !!dados.recebido;
      if (dados.abatido !== undefined) c.sinal.abatido = !!dados.abatido;
      c.valorTotal = fmtMoney(moeda, somaDoContrato(c));
      pushHist(p, "contrato", "Sinal: " + (c.sinal.valor || "—")
        + (c.sinal.venc ? " · vence " + c.sinal.venc.split("-").reverse().join("/") : "")
        + (c.sinal.abatido ? " · abate a primeira parcela" : " · valor à parte"));
    });
  }

  // Toda parcela em aberto da pessoa, em qualquer contrato. É o que a
  // escola tem a receber dela — não só o que está no contrato vigente.
  function parcelasAbertas(pessoaOuId) {
    var p = typeof pessoaOuId === "string" ? getPessoa(pessoaOuId) : pessoaOuId;
    if (!p) return [];
    var hoje = mesAtualKey();
    var out = [];
    (p.contratos || []).forEach(function (c, idx) {
      (c.meses || []).forEach(function (m) {
        if (m.pago || m.cancelada) return; // cancelada no encerramento não é dívida
        out.push({ key: m.key, label: m.label, valor: m.valor,
          contratoIdx: idx, anterior: idx > 0,
          moeda: c.moeda || "R$",
          vencida: m.key <= hoje });
      });
    });
    return out.sort(function (a, b) { return a.key < b.key ? -1 : 1; });
  }

  // Só o que ficou para trás de contratos já encerrados.
  function pendenciaAnterior(pessoaOuId) {
    var abertas = parcelasAbertas(pessoaOuId).filter(function (m) { return m.anterior; });
    var porMoeda = {};
    abertas.forEach(function (m) {
      porMoeda[m.moeda] = (porMoeda[m.moeda] || 0) + parseMoney(m.valor);
    });
    return { parcelas: abertas, n: abertas.length,
      totais: Object.keys(porMoeda).map(function (k) { return { moeda: k, valor: fmtMoney(k, porMoeda[k]) }; }) };
  }
  function cobrancaResumo() {
    var key = mesAtualKey();
    var out = { atrasadas: 0, receber: { "R$": 0, "€": 0 }, recebido: { "R$": 0, "€": 0 } };
    getCobranca().forEach(function (c) {
      var mes = (c.meses || []).filter(function (m) { return m.key === key; })[0];
      if (!mes) return;
      var v = parseMoney(mes.valor || c.parcelaValor);
      if (mes.pago) out.recebido[c.moeda] += v; else out.receber[c.moeda] += v;
      if (cobrancaStatus(c) === "atrasada") out.atrasadas++;
    });
    return out;
  }
  // Entradas previstas dos próximos meses (base do Caixa — spec 9)
  function entradasPrevistas() {
    var out = {};
    MESES_COBRANCA.forEach(function (m) { out[m.key] = { label: m.label, "R$": 0, "€": 0 }; });
    getCobranca().forEach(function (c) {
      (c.meses || []).forEach(function (m) {
        if (!m.pago && !m.cancelada && out[m.key]) out[m.key][c.moeda] += parseMoney(m.valor || c.parcelaValor);
      });
    });
    return out;
  }

  // ── RENOVAÇÕES (spec 8 · aba Renovações + R5) ─────────────────
  var RENOV_ESTAGIOS = [
    { id: "a_abordar", label: "A abordar", color: "#e07856" },
    { id: "em_conversa", label: "Em conversa", color: "#2a9d8f" },
    { id: "proposta", label: "Proposta enviada", color: "#6b5b95" },
    { id: "renovada", label: "Renovada ✓", color: "#5a9e4b" },
    { id: "nao_renovou", label: "Não renovou", color: "#9b8b7e" }
  ];
  function renovacoes() {
    return loadPessoas()
      .filter(function (p) {
        if (p.status !== "aluna") return false;
        var c = contratoVigente(p);
        if (!c || !c.fim) return false;
        var dias = daysBetween(today(), parseISO(c.fim));
        return dias <= 45 || p.renovacao; // janela de 45 dias (validar com a Carla — spec 16.8)
      })
      .map(function (p) {
        var c = contratoVigente(p);
        return { pessoa: p, diasRestantes: daysBetween(today(), parseISO(c.fim)), estagio: p.renovacao || "a_abordar" };
      })
      .sort(function (a, b) { return a.diasRestantes - b.diasRestantes; });
  }
  function setRenovacao(id, estagioId, motivo) {
    var est = RENOV_ESTAGIOS.filter(function (e) { return e.id === estagioId; })[0];
    return mutate(id, function (p) {
      p.renovacao = estagioId;
      if (estagioId === "nao_renovou") { p.motivoPerda = motivo || "Outro"; }
      pushHist(p, "renovacao", "Renovação → " + (est ? est.label : estagioId) + (motivo ? " · motivo: " + motivo : ""));
    });
  }
  function taxaRenovacao() {
    var todas = loadPessoas().filter(function (p) { return p.renovacao === "renovada" || p.renovacao === "nao_renovou"; });
    var renovadas = todas.filter(function (p) { return p.renovacao === "renovada"; }).length;
    return { renovadas: renovadas, fechadas: todas.length, taxa: todas.length ? Math.round(100 * renovadas / todas.length) : null };
  }

  // ── LTV (oculto no perfil Comercial — spec 5) ─────────────────
  function fmtTotais(tot) {
    var parts = [];
    if (tot["R$"]) parts.push(fmtMoney("R$", tot["R$"]));
    if (tot["€"]) parts.push(fmtMoney("€", tot["€"]));
    return parts.join(" + ") || "—";
  }
  // LTV = o que a pessoa DE FATO pagou: parcelas pagas, sinal recebido,
  // particulares e acompanhamento pagos, mais acertos finais e menos
  // devoluções. Não é o valor contratado — quem sai no meio do ciclo
  // (pagou uma aula e saiu) carrega o número verdadeiro sem ajuste
  // manual. O contratado continua disponível em ltvContratado.
  function ltv(p) {
    var tot = { "R$": 0, "€": 0 };
    (p.contratos || []).forEach(function (c) {
      var moeda = c.moeda || "R$";
      (c.meses || []).forEach(function (m) {
        if (m.pago && !m.cancelada) tot[moeda] += parseMoney(m.valor || c.parcelaValor || "");
      });
      if (c.sinal && c.sinal.recebido) tot[moeda] += parseMoney(c.sinal.valor || "");
      (c.acertos || []).forEach(function (a) {
        tot[moeda] += (a.tipo === "devolucao" ? -1 : 1) * parseMoney(a.valor || "");
      });
    });
    if (p.particular && p.particular.pago && p.particular.valor)
      tot[p.moeda || "R$"] += parseMoney(p.particular.valor);
    if (p.programa && p.programa.pago && p.programa.valor)
      tot[p.programa.moeda || "€"] += parseMoney(p.programa.valor);
    return fmtTotais(tot);
  }
  function ltvContratado(p) {
    var tot = { "R$": 0, "€": 0 };
    (p.contratos || []).forEach(function (c) { tot[c.moeda || "R$"] += parseMoney(c.valorTotal || ""); });
    return fmtTotais(tot);
  }

  // ── OCUPAÇÃO / VAGAS (spec 10: ninguém digita) ────────────────
  // Quantas conversas de matrícula estão marcadas — o número que diz se o
  // comercial está com agenda cheia ou vazia, antes de virar matrícula.
  function reunioesResumo(nDias) {
    var n = nDias || 30;
    var hoje = iso(today()), limite = addDays(n);
    var marcadas = [], feitas = [], vencidas = [];
    loadPessoas().forEach(function (p) {
      if (!p.reuniao || !p.reuniao.data) return;
      // Quem já virou aluna (turma, programa ou assinatura) tem a conversa
      // resolvida por definição — mesmo que ninguém tenha apertado "feita".
      // Sem isto, a matrícula da Carla ficava para sempre em "passou da
      // data" e nunca contava na conversão.
      var virou = p.status !== "lead";
      // Lead perdido encerra a conversa junto: não vira "feita", mas
      // também não fica cobrando para sempre.
      if (!virou && p.estagio === "perdido" && !p.reuniao.feita) return;
      var r = { pessoaId: p.id, nome: p.nome, data: p.reuniao.data, hora: p.reuniao.hora || "",
        feita: !!p.reuniao.feita || virou, virouAluna: virou };
      if (r.feita) { if (r.data >= addDays(-n)) feitas.push(r); }
      else if (r.data < hoje) vencidas.push(r);
      else if (r.data <= limite) marcadas.push(r);
    });
    var ord = function (a, b) { return a.data < b.data ? -1 : 1; };
    marcadas.sort(ord); vencidas.sort(ord); feitas.sort(function (a, b) { return b.data < a.data ? -1 : 1; });
    var converteu = feitas.filter(function (r) { return r.virouAluna; }).length;
    return { dias: n, marcadas: marcadas, feitas: feitas, vencidas: vencidas,
      converteu: converteu,
      taxa: feitas.length ? Math.round(100 * converteu / feitas.length) : 0 };
  }

  // ══════════════════════════════════════════════════════════════
  //  ACOMPANHAMENTO — o que acontece no WhatsApp vira dado
  //  ------------------------------------------------------------
  //  Tudo com a aluna acontece no WhatsApp e nada fica registrado.
  //  A 80 alunas "acho que falei com ela" para de funcionar. Aqui
  //  são duas coisas separadas:
  //    TOQUE  → você falou com ela (fato, 1 clique)
  //    PULSO  → como ela sente que está indo (a percepção dela)
  //  O pulso é o número de saúde da escola: é o que mais prevê
  //  renovação e é o único que a aluna responde, não a gente.
  // ══════════════════════════════════════════════════════════════
  var TOQUE_TIPOS = [
    { id: "checkin",   label: "Acompanhamento",  cor: "#2a9d8f", desc: "Conversa sobre o progresso da aluna" },
    { id: "feedback",  label: "Devolutiva",      cor: "#6b5b95", desc: "Retorno sobre tarefa ou áudio" },
    { id: "elogio",    label: "Reconhecimento",  cor: "#9ec970", desc: "Registro de avanço" },
    { id: "falta",     label: "Ausência",        cor: "#e07856", desc: "Contato após falta" },
    { id: "cobranca",  label: "Cobrança",        cor: "#cf6b5c", desc: "Assunto financeiro" },
    { id: "renovacao", label: "Renovação",       cor: "#d4a574", desc: "Conversa sobre o próximo ciclo" },
    { id: "outro",     label: "Outro",           cor: "#9c6f56", desc: "" }
  ];
  var TOQUES_KEY = "isr_toques_v1";
  var PULSOS_KEY = "isr_pulsos_v1";

  function toquesLista() {
    try { var l = JSON.parse(localStorage.getItem(TOQUES_KEY)); if (l && l.length) return l; } catch (e) {}
    return [];
  }
  function toquesSave(l) { carimbarLista(l); try { localStorage.setItem(TOQUES_KEY, JSON.stringify(l)); } catch (e) {} agendarSync(); }
  function registrarToque(pessoaId, tipo, nota, por) {
    var l = toquesLista();
    var t = { id: "tq" + Date.now() + Math.floor(Math.random() * 1000), pessoaId: pessoaId,
      data: (typeof por === "object" && por && por.data) || iso(today()),
      tipo: tipo || "checkin", nota: nota || "",
      por: (typeof por === "object" && por ? por.por : por) || ((gestaoUser() || {}).nome || "") };
    l.push(t); toquesSave(l);
    var meta = TOQUE_TIPOS.filter(function (x) { return x.id === t.tipo; })[0];
    addHistory(pessoaId, "contato", (meta ? meta.label : "Contato") + " por WhatsApp" + (nota ? " · " + nota : ""), t.por);
    return t;
  }
  function toquesDe(pessoaId) {
    return toquesLista().filter(function (t) { return t.pessoaId === pessoaId; })
      .sort(function (a, b) { return a.data < b.data ? 1 : -1; });
  }
  function ultimoToque(pessoaId) { return toquesDe(pessoaId)[0] || null; }
  function diasSemToque(pessoaId) {
    var u = ultimoToque(pessoaId);
    return u ? daysBetween(parseISO(u.data), today()) : null;
  }

  // Pulso: 1 a 5, respondido pela aluna (você transcreve o que ela disse).
  var PULSO_META = [
    { nota: 1, label: "Muita dificuldade",     cor: "#cf6b5c" },
    { nota: 2, label: "Com dificuldade",       cor: "#e07856" },
    { nota: 3, label: "Progresso lento",       cor: "#d4a574" },
    { nota: 4, label: "Progresso consistente", cor: "#2a9d8f" },
    { nota: 5, label: "Progresso excelente",   cor: "#5a9e4b" }
  ];
  function pulsosLista() {
    try { var l = JSON.parse(localStorage.getItem(PULSOS_KEY)); if (l && l.length) return l; } catch (e) {}
    return [];
  }
  function pulsosSave(l) { carimbarLista(l); try { localStorage.setItem(PULSOS_KEY, JSON.stringify(l)); } catch (e) {} agendarSync(); }
  function registrarPulso(pessoaId, nota, comentario, por) {
    var n = parseInt(nota, 10);
    if (!(n >= 1 && n <= 5)) return null;
    var l = pulsosLista();
    var p = { id: "pl" + Date.now() + Math.floor(Math.random() * 1000), pessoaId: pessoaId,
      data: (typeof por === "object" && por && por.data) || iso(today()),
      nota: n, comentario: comentario || "",
      por: (typeof por === "object" && por ? por.por : por) || ((gestaoUser() || {}).nome || "") };
    l.push(p); pulsosSave(l);
    var m = PULSO_META.filter(function (x) { return x.nota === n; })[0];
    addHistory(pessoaId, "nota", "Avaliação de progresso: " + n + "/5 · " + m.label + (comentario ? " — " + comentario : ""), p.por);
    return p;
  }
  // A aluna dá a nota primeiro e só depois escreve, se quiser. Isto
  // completa o mesmo registro em vez de criar uma segunda avaliação.
  function comentarPulso(pulsoId, comentario) {
    var l = pulsosLista(), achou = null;
    l.forEach(function (x) {
      if (x.id !== pulsoId) return;
      x.comentario = comentario || "";
      achou = x;
    });
    if (!achou) return null;
    pulsosSave(l);
    if (comentario) {
      var m = PULSO_META.filter(function (x) { return x.nota === achou.nota; })[0] || {};
      addHistory(achou.pessoaId, "nota",
        "Comentário da avaliação " + achou.nota + "/5" + (m.label ? " · " + m.label : "")
        + " — " + comentario, achou.por);
      // Nota baixa com relato vira pendência de quem acompanha a turma.
      if (achou.nota <= 2) {
        var pessoa = getPessoa(achou.pessoaId);
        var dono = pessoa && ["Gabi", "Érika", "Carla"].indexOf(pessoa.professora) >= 0
          ? pessoa.professora : "Gabi";
        addTarefa({ titulo: "Falar com " + (pessoa ? pessoa.nome : "a aluna") + " sobre a última aula",
          detalhe: "Avaliação " + achou.nota + "/5 — “" + comentario + "”",
          dono: dono, prazo: iso(today()), por: pessoa ? pessoa.nome : "" });
      }
    }
    return achou;
  }
  function pulsosDe(pessoaId) {
    return pulsosLista().filter(function (p) { return p.pessoaId === pessoaId; })
      .sort(function (a, b) { return a.data < b.data ? 1 : -1; });
  }
  function ultimoPulso(pessoaId) { return pulsosDe(pessoaId)[0] || null; }
  function tendenciaPulso(pessoaId) {
    var l = pulsosDe(pessoaId);
    if (l.length < 2) return 0;
    return l[0].nota - l[1].nota;
  }
  function pulsoMeta(nota) {
    return PULSO_META.filter(function (x) { return x.nota === nota; })[0] || PULSO_META[2];
  }

  // ══════════════════════════════════════════════════════════════
  //  SINAIS — a fonte única da verdade sobre a situação de cada pessoa
  //  ------------------------------------------------------------
  //  Antes, três telas calculavam a mesma coisa por conta própria:
  //  a Central ("o que fazer hoje"), o Acompanhamento ("com quem
  //  falar") e as Alunas ("como cada uma está"). A mesma parcela
  //  vencida tinha três nomes e três pesos, e o limiar de renovação
  //  era 45 dias numa tela e 30 nas outras.
  //
  //  Agora o catálogo abaixo define UMA vez o nome, a cor, o peso, o
  //  limiar e a ação de cada sinal. As três telas são recortes dele:
  //  a Central mostra os sinais acionáveis hoje, o Acompanhamento os
  //  de relacionamento, e as Alunas todos, como retrato da situação.
  //  Os campos "risco" e "toque" preservam os nomes que as telas já
  //  usavam, para que o histórico e os filtros continuem válidos.
  // ══════════════════════════════════════════════════════════════
  var SINAIS = [
    { id: "parcela_atrasada", label: "Pagamento atrasado", cor: "#cf6b5c", peso: 50,
      dono: "Érika", acao: "Cobrar atraso", tpl: "pag_atraso", tipo: "cobranca",
      risco: "inadimplente", toque: "atrasada", naCentral: true, urg: 0 },
    { id: "falta_recente", label: "Ausências recentes", cor: "#e07856", peso: 45,
      dono: "Gabi", acao: "Registrar contato", tpl: "checkin_mensal", tipo: "falta",
      risco: "faltando", toque: "faltou", naCentral: true, urg: 1 },
    { id: "avaliacao_baixa", label: "Dificuldade relatada", cor: "#cf6b5c", peso: 45,
      dono: "Gabi", acao: "Registrar contato", tpl: "checkin_mensal", tipo: "checkin",
      risco: "travada", toque: "pulso_baixo", naCentral: true, urg: 1 },
    { id: "avaliacao_caiu", label: "Avaliação em queda", cor: "#e07856", peso: 40,
      dono: "Gabi", acao: "Registrar contato", tpl: "checkin_mensal", tipo: "checkin",
      risco: "", toque: "pulso_caiu", naCentral: false, urg: 2 },
    { id: "parcela_a_vencer", label: "Parcela a vencer", cor: "#d4a574", peso: 18,
      dono: "Érika", acao: "Enviar lembrete", tpl: "pag_lembrete", tipo: "cobranca",
      risco: "", toque: "", naCentral: true, urg: 3 },
    { id: "onboarding_pendente", label: "Integração pendente", cor: "#9c6f56", peso: 35,
      dono: "Érika", acao: "Mensagem do checkpoint", tpl: "onb_sessao", tipo: "checkin",
      risco: "onboarding", toque: "onboarding", naCentral: true, urg: 2 },
    { id: "onboarding_travado", label: "Integração travada", cor: "#cf6b5c", peso: 48,
      dono: "Érika", acao: "Mensagem do checkpoint", tpl: "onb_sessao", tipo: "checkin",
      risco: "onboarding_travado", toque: "onboarding_travado", naCentral: true, urg: 0 },
    { id: "contrato_novo", label: "Início de contrato", cor: "#9ec970", peso: 32,
      dono: "Gabi", acao: "Registrar contato", tpl: "checkin_mensal", tipo: "checkin",
      risco: "", toque: "nova", naCentral: false, urg: 3 },
    { id: "renovacao_aberta", label: "Renovação próxima", cor: "#6b5b95", peso: 30,
      dono: "Carla", acao: "Conversa de renovação", tpl: "renov_abrir", tipo: "renovacao",
      risco: "renovacao", toque: "renovacao", naCentral: true, urg: 4 },
    { id: "sem_avaliacao", label: "Sem avaliação registrada", cor: "#d4a574", peso: 25,
      dono: "Gabi", acao: "Registrar contato", tpl: "checkin_mensal", tipo: "checkin",
      risco: "", toque: "sem_pulso", naCentral: false, urg: 4 },
    { id: "sem_contato", label: "Sem contato recente", cor: "#d4a574", peso: 20,
      dono: "Gabi", acao: "Registrar contato", tpl: "checkin_mensal", tipo: "checkin",
      risco: "sem_contato", toque: "sumida", naCentral: false, urg: 4 },
    { id: "checkin_agendado", label: "Check-in agendado", cor: "#2a9d8f", peso: 22,
      dono: "Gabi", acao: "Fazer check-in", tpl: "checkin_mensal", tipo: "checkin",
      risco: "", toque: "", naCentral: true, urg: 2 },
    { id: "evolucao_positiva", label: "Evolução positiva", cor: "#9ec970", peso: 8,
      dono: "Gabi", acao: "Registrar reconhecimento", tpl: "checkin_mensal", tipo: "elogio",
      risco: "", toque: "indo_bem", naCentral: false, urg: 6 }
  ];
  // Limiares, definidos uma vez só.
  var LIMIARES = {
    faltas: 2,          // ausências no ciclo que acendem o sinal
    avaliacaoBaixa: 2,  // nota de 1 a 5
    avaliacaoAlta: 4,
    diasSemContato: 21, // era 21 no acompanhamento e 30 nas alunas
    diasRenovacao: 45,  // era 45 na central e 30 nas outras duas
    diasContratoNovo: 42,
    diasParcelaAVencer: 3
  };
  function sinalMeta(id) { return SINAIS.filter(function (s) { return s.id === id; })[0] || null; }
  // Intervalo da cadência sem recorrer a sinaisDe — evita recursão, já que
  // é sinaisDe quem chama isto enquanto ainda está montando a lista.
  function intervaloCadenciaDe(p, s, sinaisParciais) {
    var seg = segmentoDe(p, s, sinaisParciais || []);
    return cadenciaConfig()[seg];
  }

  // Situação de uma pessoa: os fatos crus, calculados uma vez.
  function situacaoDe(p) {
    var hoje = iso(today());
    var c = contratoVigente(p) || {};
    var dia = parseInt(c.vencDia, 10); if (isNaN(dia)) dia = 10;
    var meses = c.meses || [];
    var atrasadas = meses.filter(function (m) {
      return !m.pago && (m.key + "-" + (dia < 10 ? "0" : "") + dia) < hoje;
    });
    var mesAtual = meses.filter(function (m) { return m.key === mesAtualKey(); })[0];
    var diasProxVenc = null;
    if (mesAtual && !mesAtual.pago && c.vencDia !== "auto" && !isNaN(parseInt(c.vencDia, 10))) {
      var d = parseInt(c.vencDia, 10) - today().getDate();
      if (d >= 0) diasProxVenc = d;
    }
    var ob = p.onboarding || [];
    var dToque = diasSemToque(p.id);
    var ultimo = (p.historico && p.historico.length) ? p.historico[p.historico.length - 1] : null;
    return {
      contrato: c, meses: meses,
      atrasadas: atrasadas, atrasadasN: atrasadas.length,
      mesAtual: mesAtual, diasProxVenc: diasProxVenc,
      parcelasPagas: meses.filter(function (m) { return m.pago; }).length,
      faltas: faltasDe(p.id),
      ultimaFaltaEm: ultimaFaltaDe(p.id),
      ultimoToqueEm: (ultimoToque(p.id) || {}).data || null,
      onboarding: ob,
      onboardingFeitos: ob.filter(function (x) { return x.feito; }).length,
      // pendente é "para hoje ou já passou" — a Central usava esse critério
      // e as Alunas exigiam data estritamente passada, então um checkpoint
      // marcado para hoje aparecia numa tela e sumia na outra
      onboardingAtrasado: ob.filter(function (x) { return !x.feito && x.data <= hoje; }),
      pulso: ultimoPulso(p.id), tendencia: tendenciaPulso(p.id),
      diasSemToque: dToque,
      diasSemContato: dToque !== null ? dToque
        : (ultimo ? daysBetween(parseISO(ultimo.data), today()) : 999),
      diasDeCasa: p.desde ? daysBetween(parseISO(p.desde), today()) : 999,
      diasPraRenovar: c.fim ? daysBetween(today(), parseISO(c.fim)) : null,
      checkinVencido: p.proximoCheckin && parseISO(p.proximoCheckin)
        && daysBetween(parseISO(p.proximoCheckin), today()) >= 0
    };
  }

  // Os sinais acesos para uma pessoa, com o detalhe que explica cada um.
  function sinaisDe(p, sit) {
    var s = sit || situacaoDe(p);
    var out = [];
    // DESDE QUANDO o sinal está aceso. A fila mostrava o que fazer e
    // não há quanto tempo espera: um follow-up de hoje e um de duas
    // semanas atrás tinham exatamente a mesma cara, e o antigo é o
    // que custa caro. Só entra data que existe de verdade — sinal sem
    // data não ganha uma inventada.
    var add = function (id, detalhe, desde) {
      var m = sinalMeta(id);
      if (m) out.push({ id: id, label: m.label, cor: m.cor, peso: m.peso, dono: m.dono,
        acao: m.acao, tpl: m.tpl, tipo: m.tipo, urg: m.urg, naCentral: m.naCentral,
        risco: m.risco, toque: m.toque, detalhe: detalhe || m.label,
        desde: desde || "" });
    };
    var diaVenc = parseInt((s.contrato || {}).vencDia, 10);
    if (isNaN(diaVenc)) diaVenc = 10;
    var vencDe = function (mes) {
      return mes && mes.key ? mes.key + "-" + (diaVenc < 10 ? "0" : "") + diaVenc : "";
    };
    if (s.atrasadasN) {
      var pri = s.atrasadas[0];
      add("parcela_atrasada", s.atrasadasN === 1
        ? "Parcela de " + pri.label + " atrasada (" + (pri.valor || "") + ")"
        : s.atrasadasN + " parcelas atrasadas (desde " + pri.label + ")",
        vencDe(pri));
    } else if (s.diasProxVenc !== null && s.diasProxVenc <= LIMIARES.diasParcelaAVencer) {
      add("parcela_a_vencer", s.diasProxVenc === 0
        ? "Parcela vence hoje (" + (s.mesAtual.valor || "") + ")"
        : "Parcela vence em " + s.diasProxVenc + (s.diasProxVenc === 1 ? " dia" : " dias")
          + " (" + (s.mesAtual.valor || "") + ")");
    }
    // o aviso de ausências sai da tela quando um contato é registrado
    // depois da última falta — e volta se houver falta nova
    var faltaSemContato = s.faltas >= LIMIARES.faltas
      && (!s.ultimoToqueEm || !s.ultimaFaltaEm || s.ultimoToqueEm < s.ultimaFaltaEm);
    if (faltaSemContato)
      add("falta_recente", s.faltas + (s.faltas === 1 ? " ausência no ciclo" : " ausências no ciclo"),
        s.ultimaFaltaEm || "");
    if (s.pulso && s.pulso.nota <= LIMIARES.avaliacaoBaixa)
      add("avaliacao_baixa", "Avaliação " + s.pulso.nota + "/5 · " + pulsoMeta(s.pulso.nota).label,
        s.pulso.data || "");
    if (s.tendencia < 0)
      add("avaliacao_caiu", "Avaliação caiu " + Math.abs(s.tendencia)
        + (Math.abs(s.tendencia) === 1 ? " ponto" : " pontos"));
    // A integração é o portão: aluna que já teve aula sem ela concluída
    // está estudando sem ninguém ter conferido se ela entrou de verdade.
    if (s.onboardingAtrasado.length) {
      var travado = s.onboardingAtrasado.filter(function (c) {
        return daysBetween(parseISO(c.data), today()) >= 7;
      });
      if (travado.length)
        add("onboarding_travado", "Integração parada há " + daysBetween(parseISO(travado[0].data), today())
          + " dias em: " + travado[0].label, travado[0].data || "");
      else
        add("onboarding_pendente", "Integração pendente: " + s.onboardingAtrasado[0].label,
          s.onboardingAtrasado[0].data || "");
    }
    if (s.diasDeCasa <= LIMIARES.diasContratoNovo)
      add("contrato_novo", "Entrou há " + s.diasDeCasa + (s.diasDeCasa === 1 ? " dia" : " dias"));
    if (s.diasPraRenovar !== null && s.diasPraRenovar >= 0 && s.diasPraRenovar <= LIMIARES.diasRenovacao)
      add("renovacao_aberta", "Contrato termina em " + s.diasPraRenovar
        + (s.diasPraRenovar === 1 ? " dia" : " dias"));
    if (!s.pulso) add("sem_avaliacao", "Nenhuma avaliação de progresso registrada");
    // o intervalo vem da cadência do segmento, não de um número fixo:
    // aluna nova cobra em 7 dias, aluna estável em 30
    var intervalo = intervaloCadenciaDe(p, s, out);
    if (s.diasSemToque === null || s.diasSemToque > intervalo)
      add("sem_contato", s.diasSemToque === null ? "Nenhum contato registrado"
        : "Sem contato há " + s.diasSemToque + " dias · a cadência pede a cada " + intervalo);
    if (s.checkinVencido) add("checkin_agendado", "Check-in agendado para " + ddmm(p.proximoCheckin),
      p.proximoCheckin || "");
    if (!out.length && s.pulso && s.pulso.nota >= LIMIARES.avaliacaoAlta)
      add("evolucao_positiva", "Avaliação " + s.pulso.nota + "/5 · " + pulsoMeta(s.pulso.nota).label);
    return out.sort(function (a, b) { return b.peso - a.peso; });
  }

  // ══════════════════════════════════════════════════════════════
  //  CADÊNCIA DE CONTATO
  //  ------------------------------------------------------------
  //  Um intervalo só para todo mundo não funciona: aluna nova precisa
  //  de contato semanal, aluna estável de dois anos não. Um número
  //  único ou é frouxo para quem precisa, ou sufocante para quem não.
  //
  //  Cada aluna cai num segmento pela situação dela, e cada segmento
  //  tem seu intervalo. Assim a conta de quantos contatos por semana
  //  a escola precisa dar passa a ser previsível — que é o que permite
  //  crescer sem perder o atendimento de perto.
  // ══════════════════════════════════════════════════════════════
  var CADENCIA_KEY = "isr_cadencia_v1";
  var SEGMENTOS = [
    { id: "em_risco", label: "Em risco", dias: 7, cor: "#cf6b5c", ordem: 1,
      desc: "Pagamento atrasado, ausências ou dificuldade relatada. Enquanto durar, contato semanal." },
    { id: "nova", label: "Primeiro ciclo", dias: 7, cor: "#9ec970", ordem: 2,
      desc: "Primeiros 42 dias de contrato. Contato semanal." },
    { id: "programa", label: "No programa", dias: 7, cor: "#348a8e", ordem: 3,
      desc: "Participa de um programa no WhatsApp, que já pressupõe devolutiva semanal." },
    { id: "renovacao", label: "Perto de renovar", dias: 14, cor: "#6b5b95", ordem: 4,
      desc: "Ciclo próximo do fim. Contato frequente até a renovação." },
    { id: "estavel", label: "Estável", dias: 30, cor: "#8a7c6b", ordem: 5,
      desc: "Em dia, presente e com boa avaliação. Contato mensal." }
  ];
  function cadenciaConfig() {
    var base = {};
    SEGMENTOS.forEach(function (s) { base[s.id] = s.dias; });
    try {
      var m = JSON.parse(localStorage.getItem(CADENCIA_KEY));
      if (m) Object.keys(m).forEach(function (k) {
        var n = parseInt(m[k], 10);
        if (base[k] !== undefined && !isNaN(n) && n > 0) base[k] = n;
      });
    } catch (e) {}
    return base;
  }
  function setCadencia(segmentoId, dias) {
    var m = {}; try { m = JSON.parse(localStorage.getItem(CADENCIA_KEY)) || {}; } catch (e) {}
    var n = parseInt(dias, 10);
    if (!isNaN(n) && n > 0) m[segmentoId] = n;
    try { localStorage.setItem(CADENCIA_KEY, JSON.stringify(m)); } catch (e) {}
    agendarSync();
    return cadenciaConfig();
  }
  function segmentoMeta(id) { return SEGMENTOS.filter(function (s) { return s.id === id; })[0] || SEGMENTOS[4]; }
  // A pessoa está em vários segmentos ao mesmo tempo; vale o mais exigente.
  var SINAIS_DE_RISCO = ["parcela_atrasada", "falta_recente", "avaliacao_baixa", "avaliacao_caiu"];
  function segmentoDe(p, sit, sinais) {
    var s = sit || situacaoDe(p);
    var sn = sinais || sinaisDe(p, s);
    if (sn.some(function (x) { return SINAIS_DE_RISCO.indexOf(x.id) >= 0; })) return "em_risco";
    if (s.diasDeCasa <= LIMIARES.diasContratoNovo) return "nova";
    var noPrograma = programasLista().some(function (pr) {
      return !pr.encerrado && (pr.participantes || []).indexOf(p.id) >= 0;
    });
    if (noPrograma) return "programa";
    if (s.diasPraRenovar !== null && s.diasPraRenovar >= 0 && s.diasPraRenovar <= LIMIARES.diasRenovacao)
      return "renovacao";
    return "estavel";
  }
  function cadenciaDe(p, sit, sinais) {
    var s = sit || situacaoDe(p);
    var segId = segmentoDe(p, s, sinais);
    var meta = segmentoMeta(segId);
    var intervalo = cadenciaConfig()[segId];
    var d = s.diasSemToque;
    var nunca = d === null;
    var atraso = nunca ? null : d - intervalo;
    return {
      segmento: segId, label: meta.label, cor: meta.cor, desc: meta.desc,
      intervalo: intervalo, diasSemContato: d, nuncaContatada: nunca,
      vencido: nunca || d > intervalo,
      diasDeAtraso: atraso !== null && atraso > 0 ? atraso : 0,
      diasAteOProximo: nunca ? 0 : Math.max(0, intervalo - d)
    };
  }
  // Quantos contatos por semana a escola precisa dar para manter a cadência.
  function cargaDeContato() {
    var cfg = cadenciaConfig();
    var porSeg = {}, total = 0, vencidas = 0, semanal = 0;
    SEGMENTOS.forEach(function (s) {
      porSeg[s.id] = { id: s.id, label: s.label, cor: s.cor, desc: s.desc,
        intervalo: cfg[s.id], alunas: 0, vencidas: 0, porSemana: 0 };
    });
    loadPessoas().forEach(function (p) {
      if (p.status !== "aluna" && p.status !== "mvs") return;
      var c = cadenciaDe(p);
      var r = porSeg[c.segmento];
      r.alunas++; total++;
      if (c.vencido) { r.vencidas++; vencidas++; }
      r.porSemana += 7 / c.intervalo;
    });
    SEGMENTOS.forEach(function (s) {
      porSeg[s.id].porSemana = Math.round(porSeg[s.id].porSemana * 10) / 10;
      semanal += porSeg[s.id].porSemana;
    });
    return { segmentos: SEGMENTOS.map(function (s) { return porSeg[s.id]; }),
      total: total, vencidas: vencidas,
      porSemana: Math.round(semanal * 10) / 10,
      porDiaUtil: Math.round(semanal / 5 * 10) / 10 };
  }

  // ── FILA DE ACOMPANHAMENTO ────────────────────────────────────
  // Recorte de relacionamento dos sinais. A 80 alunas, um contato por
  // aluna por ciclo dá ~7 por semana — é conta que cabe no dia.
  var MOTIVOS_TOQUE = (function () {
    var m = {};
    SINAIS.forEach(function (s) {
      if (s.toque) m[s.toque] = { label: s.label, peso: s.peso, tipo: s.tipo, cor: s.cor, sinal: s.id };
    });
    return m;
  })();
  // ── SATISFAÇÃO E DESENVOLVIMENTO ──────────────────────────────
  //
  // São as duas coisas que a escola acompanha. Satisfação vem da nota que a
  // aluna dá à aula; desenvolvimento vem de estar presente, entregar tarefa
  // e andar no ciclo. Com 100 alunas não dá para ler tudo: a fila usa estes
  // dois eixos para dizer quem precisa de atenção primeiro.
  function satisfacaoDe(pessoaId) {
    var ps = pulsosDe(pessoaId).slice().sort(function (a, b) { return a.data < b.data ? 1 : -1; });
    if (!ps.length) return { media: null, n: 0, ultima: null, tendencia: 0, nivel: "sem" };
    var recentes = ps.slice(0, 3);
    var media = recentes.reduce(function (s, x) { return s + x.nota; }, 0) / recentes.length;
    var antes = ps.slice(3, 6);
    var mediaAntes = antes.length
      ? antes.reduce(function (s, x) { return s + x.nota; }, 0) / antes.length : null;
    var tend = mediaAntes === null ? 0 : (media > mediaAntes + 0.3 ? 1 : (media < mediaAntes - 0.3 ? -1 : 0));
    var nivel = media >= 4 ? "alta" : (media >= 3 ? "media" : "baixa");
    return { media: Math.round(media * 10) / 10, n: ps.length, ultima: ps[0],
      tendencia: tend, nivel: nivel };
  }

  function desenvolvimentoDe(pessoaId) {
    var j = jornadaDaAluna(pessoaId);
    var tc = tarefasDeCasa(pessoaId);
    var pc = progressoCiclo(pessoaId);
    var freq = j.frequencia === null ? null : j.frequencia;
    var tar = tc.cobradas ? tc.pct : null;
    // o índice é a média do que existe; o que não foi medido não pesa
    var partes = [freq, tar].filter(function (x) { return x !== null; });
    var indice = partes.length
      ? Math.round(partes.reduce(function (s, x) { return s + x; }, 0) / partes.length) : null;
    var nivel = indice === null ? "sem" : (indice >= 85 ? "alto" : (indice >= 70 ? "medio" : "baixo"));
    return { frequencia: freq, tarefas: tar, aulas: j.aulas, faltas: j.faltas,
      cicloFeitas: pc.feitas, cicloTotal: pc.total, cicloPct: pc.pct,
      indice: indice, nivel: nivel };
  }

  // ══════════════════════════════════════════════════════════════
  //  ALERTAS E PENDÊNCIAS
  //
  //  A Central abria com quatro cartões de área — Comercial, Gestão,
  //  Pedagógico, Marketing — e quem trabalha não trabalha por área:
  //  trabalha pelo que está parado. Estas duas funções separam as duas
  //  naturezas do que espera alguém.
  //
  //  ALERTA é coisa errada com nome: uma aluna faltando, uma cobrança
  //  que não passou, uma turma que não fecha. Tem pessoa, tem urgência,
  //  e alguém precisa decidir.
  //
  //  PENDÊNCIA é rotina não feita: chamada não lançada, extrato não
  //  conciliado, cadastro por arrumar. Não tem urgência de hoje, mas
  //  enquanto não for feita todo número da escola fica pela metade.
  // ══════════════════════════════════════════════════════════════
  // ══════════════════════════════════════════════════════════════
  //  O QUE A ESCOLA TEM
  //
  //  Quanto o mês gerou e quanto está parado na conta são perguntas
  //  diferentes, e o sistema só respondia a primeira — mal. O resultado
  //  é fluxo: o que entrou menos o que saiu naquele mês. O saldo é
  //  estoque: o que ficou, somando tudo que veio antes.
  //
  //  A terceira pergunta é a que interessa a quem passou três anos sem
  //  conseguir guardar nada: a reserva está subindo? Para isso é preciso
  //  o saldo de cada fechamento, e o sistema nunca guardou nenhum. Daqui
  //  em diante guarda, e a curva aparece sozinha.
  // ══════════════════════════════════════════════════════════════
  var SALDOS_KEY = "isr_saldos_v1";

  function saldosAll() {
    try { return JSON.parse(localStorage.getItem(SALDOS_KEY)) || {}; } catch (e) { return {}; }
  }
  function saldosSave(o) {
    try { localStorage.setItem(SALDOS_KEY, JSON.stringify(o)); } catch (e) {}
    agendarSync();
    return o;
  }
  // Um registro por mês: o saldo de cada conta no último dia. Guardar por
  // conta, e não só o total, é o que permite conferir com o banco depois —
  // e separar o que está guardado do que está para gastar.
  function registrarSaldo(mesKey, contaId, valor, quando) {
    var k = mesKey || mesAtualKey();
    var o = saldosAll();
    o[k] = o[k] || { mes: k, contas: {}, em: "" };
    o[k].contas[contaId] = { valor: typeof valor === "number" ? valor : parseMoney(valor),
      em: quando || iso(today()) };
    o[k].em = quando || iso(today());
    carimbar(o[k]);
    saldosSave(o);
    return o[k];
  }
  function esquecerSaldo(mesKey, contaId) {
    var o = saldosAll();
    if (o[mesKey] && o[mesKey].contas) delete o[mesKey].contas[contaId];
    saldosSave(o);
    return o[mesKey] || null;
  }
  // conta marcada como reserva não é caixa para operar: é o que foi
  // guardado de propósito, e some do total do dia a dia
  function ehReserva(contaId) {
    var c = contaMeta(contaId);
    return !!(c && c.reserva);
  }
  function saldoDoMes(mesKey) {
    var k = mesKey || mesAtualKey();
    var reg = saldosAll()[k];
    var out = { mes: k, registrado: !!reg, em: reg ? reg.em : "",
      operar: { "R$": 0, "€": 0 }, reserva: { "R$": 0, "€": 0 },
      total: { "R$": 0, "€": 0 }, contas: [],
      // zerados desde já: mês sem registro devolve o mesmo formato, e quem
      // lê distingue "não anotei" de "está zerado" pelo campo registrado
      totalReais: 0, operarReais: 0, reservaReais: 0 };
    if (!reg) return out;
    contasLista().forEach(function (c) {
      var s = reg.contas[c.id];
      if (!s) return;
      var m = c.moeda || "R$";
      var onde = c.reserva ? out.reserva : out.operar;
      onde[m] += s.valor;
      out.total[m] += s.valor;
      out.contas.push({ id: c.id, nome: c.nome, moeda: m, valor: s.valor,
        reserva: !!c.reserva, em: s.em });
    });
    out.totalReais = emReais(out.total);
    out.operarReais = emReais(out.operar);
    out.reservaReais = emReais(out.reserva);
    return out;
  }
  // A curva: os últimos meses com saldo registrado, do mais antigo para o
  // mais novo, com quanto o mês gerou ao lado. É a resposta para "estou
  // construindo alguma coisa?" — que um mês sozinho nunca dá.
  function serieDoCaixa(quantos) {
    var n = quantos || 12;
    var todos = saldosAll();
    var chaves = Object.keys(todos).filter(function (k) { return /^\d{4}-\d{2}$/.test(k); }).sort();
    chaves = chaves.slice(-n);
    var ant = null;
    return chaves.map(function (k) {
      var s = saldoDoMes(k);
      var f = financeiroMes(k);
      var variou = ant === null ? null : Math.round((s.totalReais - ant) * 100) / 100;
      ant = s.totalReais;
      return { mes: k, label: mesLabelDe(k),
        total: s.totalReais, operar: s.operarReais, reserva: s.reservaReais,
        gerou: Math.round(f.totalReais.resultado * 100) / 100,
        variou: variou };
    });
  }
  // Meta de reserva: quanto a escola quer ter guardado. A meta de
  // faturamento diz quanto entra e não diz nada sobre sobrar.
  function metaReserva() {
    var m = metasAtuais();
    return m.reserva || { "R$": 0, "€": 0 };
  }
  function setMetaReserva(moeda, valor) {
    var r = Object.assign({}, metasAtuais().reserva || {});
    r[moeda] = typeof valor === "number" ? valor : parseMoney(valor);
    return setMetas({ reserva: r });
  }

  var ALERTA_PESO = {
    cobranca_falhou: 100, atraso: 90, falta: 80, onboarding_travado: 70,
    chamada_pendente: 65,
    avaliacao_baixa: 60, avaliacao_caiu: 50, turma_vazia: 40
  };
  function alertasDaEscola() {
    var out = [];
    var perfil = function (id) { return "ISR - Perfil v3.dc.html?id=" + id; };

    // ── quem está sumindo ou insatisfeita ──
    var interessa = { falta_recente: "falta", avaliacao_baixa: "avaliacao_baixa",
      avaliacao_caiu: "avaliacao_caiu", onboarding_travado: "onboarding_travado" };
    filaAcompanhamento().forEach(function (f) {
      (f.sinais || []).forEach(function (s) {
        var tipo = interessa[s.id];
        if (!tipo) return;
        out.push({ id: tipo + "|" + f.pessoaId, tipo: tipo, area: "pedagogico",
          quem: f.nome, pessoaId: f.pessoaId, href: perfil(f.pessoaId),
          texto: s.label || s.toque || "", peso: ALERTA_PESO[tipo] || 10 });
      });
    });

    // ── dinheiro que não entrou ──
    loadPessoas().forEach(function (p) {
      if (assinaturaFalhando(p)) {
        out.push({ id: "cobranca_falhou|" + p.id, tipo: "cobranca_falhou", area: "financeiro",
          quem: p.nome, pessoaId: p.id, href: perfil(p.id),
          texto: "Cobrança da assinatura não passou em " + ddmm(p.assinatura.falhou),
          peso: ALERTA_PESO.cobranca_falhou });
      }
    });
    var hoje = iso(today());
    getCobranca().forEach(function (cb) {
      var dia = parseInt(cb.vencDia, 10);
      if (isNaN(dia)) dia = 10;
      var vencidas = (cb.meses || []).filter(function (m) {
        if (m.pago || m.cancelada || !m.valor) return false;
        var venc = m.key + "-" + (dia < 10 ? "0" : "") + dia;
        return venc < hoje;
      });
      if (!vencidas.length) return;
      var soma = vencidas.reduce(function (s, m) { return s + parseMoney(m.valor); }, 0);
      out.push({ id: "atraso|" + cb.id, tipo: "atraso", area: "financeiro",
        quem: cb.nome, pessoaId: cb.id, href: perfil(cb.id),
        texto: vencidas.length + (vencidas.length === 1 ? " parcela vencida" : " parcelas vencidas")
          + " · " + fmtMoney(cb.moeda || "R$", soma),
        peso: ALERTA_PESO.atraso });
    });

    // ── aula que aconteceu e ficou sem chamada ──
    // Uma por professora, e não uma por aula: quatro aulas atrasadas da
    // mesma pessoa são um assunto só, e quatro linhas empurrariam o resto
    // da fila para fora da tela.
    chamadasPendentesPorProfessora().forEach(function (g) {
      if (!g.professora) return;
      out.push({ id: "chamada|" + g.professora, tipo: "chamada_pendente", area: "pedagogico",
        quem: g.professora, professora: g.professora,
        href: "ISR - Painel v3.dc.html?prof=" + encodeURIComponent(g.professora),
        texto: g.n + (g.n === 1 ? " aula sem chamada" : " aulas sem chamada")
          + " · desde " + ddmm(g.maisAntiga),
        peso: ALERTA_PESO.chamada_pendente });
    });

    // ── turma que não fecha ──
    turmasAbaixoDoMinimo().forEach(function (t) {
      out.push({ id: "turma_vazia|" + t.id, tipo: "turma_vazia", area: "pedagogico",
        quem: t.label, href: "ISR - Turmas v3.dc.html",
        texto: t.alunas + (t.alunas === 1 ? " aluna" : " alunas")
          + " · faltam " + t.faltam + " para o mínimo",
        peso: ALERTA_PESO.turma_vazia });
    });

    return out.sort(function (a, b) { return b.peso - a.peso || a.quem.localeCompare(b.quem); });
  }

  // Rotina esperando. Cada uma diz o tamanho do que falta e leva para
  // a tela onde se resolve.
  function pendenciasDaEscola() {
    var out = [], k = mesAtualKey();

    var fin = financeiroMes(k).totalReais;
    if ((fin.presumido || 0) >= 0.01) {
      out.push({ id: "conciliar", area: "financeiro", titulo: "Conciliar o extrato do mês",
        texto: fmtMoney("R$", fin.presumido) + " ainda não apareceu em conta nenhuma",
        href: "ISR - Caixa v3.dc.html" });
    }

    // turma com aula dada e chamada em branco: sete dias sem registro
    var atrasadas = [];
    turmasLista().forEach(function (u) {
      var label = u.nivel + " · " + u.turma;
      var ultima = chamadasDaTurma(label)[0];
      var dias = ultima && ultima.data ? daysBetween(parseISO(ultima.data), today()) : null;
      if (dias === null || dias > 7) atrasadas.push(label);
    });
    if (atrasadas.length) {
      out.push({ id: "chamada", area: "pedagogico", titulo: "Lançar chamada",
        texto: atrasadas.length + (atrasadas.length === 1 ? " turma sem registro" : " turmas sem registro")
          + " há mais de uma semana: " + atrasadas.slice(0, 3).join(", ")
          + (atrasadas.length > 3 ? "…" : ""),
        href: "ISR - Painel v3.dc.html" });
    }

    var aud = auditoriaDados();
    if (aud.seguras) {
      out.push({ id: "revisao", area: "config", titulo: "Corrigir dados repetidos",
        texto: aud.seguras + (aud.seguras === 1 ? " problema pode" : " problemas podem")
          + " ser corrigido de uma vez",
        href: "ISR - Caixa v3.dc.html" });
    }

    var semPlano = alunasSemPlano();
    if (semPlano.length) {
      out.push({ id: "sem_plano", area: "alunas", titulo: "Completar plano de aluna",
        texto: semPlano.length + (semPlano.length === 1 ? " aluna sem" : " alunas sem")
          + " turma, valor ou parcelas: " + semPlano.slice(0, 3).map(function (a) { return firstName(a.nome); }).join(", "),
        href: "ISR - Alunas v3.dc.html" });
    }

    return out;
  }

  function filaAcompanhamento() {
    return loadPessoas()
      .filter(function (p) { return p.status === "aluna" || p.status === "mvs"; })
      .map(function (p) {
        var s = situacaoDe(p);
        var todos = sinaisDe(p, s);
        var visiveis = todos.filter(function (x) { return x.toque && !estaAdiado(x.id, p.id); });
        var motivos = visiveis.map(function (x) { return x.toque; });
        var peso = visiveis.reduce(function (a, x) { return a + x.peso; }, 0);
        // quem já foi contatada esta semana sai da fila — não se cobra duas vezes
        var tocadaEstaSemana = s.diasSemToque !== null && s.diasSemToque <= 6;
        return {
          pessoaId: p.id, nome: p.nome, turma: p.turma || "", whatsapp: p.whatsapp || "",
          professora: p.professora || "",
          motivos: motivos, sinais: visiveis, peso: peso, tocadaEstaSemana: tocadaEstaSemana,
          diasSemToque: s.diasSemToque, ultimoToque: ultimoToque(p.id),
          pulso: s.pulso, tendencia: s.tendencia, faltas: s.faltas, atrasadas: s.atrasadasN,
          diasDeCasa: s.diasDeCasa, diasPraRenovar: s.diasPraRenovar,
          satisfacao: satisfacaoDe(p.id), desenvolvimento: desenvolvimentoDe(p.id),
          tipoSugerido: visiveis.length ? visiveis[0].tipo : "checkin"
        };
      })
      .sort(function (a, b) {
        if (a.tocadaEstaSemana !== b.tocadaEstaSemana) return a.tocadaEstaSemana ? 1 : -1;
        return b.peso - a.peso || a.nome.localeCompare(b.nome);
      });
  }

  // ══════════════════════════════════════════════════════════════
  //  PROGRAMA — turma no WhatsApp, uma missão por semana
  //  ------------------------------------------------------------
  //  Três coisas por aluna por semana, e nenhuma delas dá pra
  //  lembrar de cabeça na semana 4 com 30 pessoas:
  //    enviei a missão · ela mandou o áudio · devolvi o feedback
  //  O terceiro é o que ela pagou pra ter. É o que não pode furar.
  // ══════════════════════════════════════════════════════════════
  var MISSOES_PILOTO = [
    "Me apresentar", "Pedir num café", "Fazer compras", "Pegar o transporte público",
    "Marcar um horário", "Pegar uma encomenda", "Resolver quando algo dá errado",
    "Um dia inteiro lá fora"
  ];
  // Por aluna, só duas coisas: ela respondeu, e a devolutiva já foi enviada.
  // O envio da missão é uma ação de turma — fica em programa.missoesEnviadas.
  var ETAPAS_SEMANA = [
    { id: "audio",    label: "Respondeu",         curto: "resposta",   cor: "#9ec970" },
    { id: "feedback", label: "Devolutiva enviada", curto: "devolutiva", cor: "#fc9082" }
  ];
  var PROGRAMAS_KEY = "isr_programas_v1";
  // A lista crua guarda também as lápides (turmas apagadas). Apagar de
  // verdade não pode ser só remover daqui: a mesclagem do sync SOMA
  // registros, e o banco devolveria a turma no puxe seguinte. A lápide
  // (campo "apagado", com carimbo novo) viaja pelo sync, vence a cópia
  // viva nos outros aparelhos e some das telas em todos eles.
  function programasRaw() {
    ensureSeed(); // o exemplo do programa nasce junto com o das pessoas
    try { var l = JSON.parse(localStorage.getItem(PROGRAMAS_KEY)); if (l && l.length) return l; } catch (e) {}
    return [];
  }
  function programasLista() {
    return programasRaw().filter(function (p) { return !(p && p.apagado); });
  }
  function programasSave(l) {
    carimbarLista(l);
    // quem salva recebeu a lista sem as lápides — devolvê-las aqui é o
    // que impede um save qualquer de ressuscitar a turma apagada
    var vivos = {};
    (l || []).forEach(function (p) { if (p && p.id) vivos[p.id] = true; });
    var lapides = programasRaw().filter(function (p) { return p && p.apagado && !vivos[p.id]; });
    try { localStorage.setItem(PROGRAMAS_KEY, JSON.stringify((l || []).concat(lapides))); } catch (e) {}
    agendarSync();
  }
  function apagarPrograma(id) {
    var l = programasRaw(), achou = false;
    l.forEach(function (p) { if (p && p.id === id) { p.apagado = iso(today()); carimbar(p); achou = true; } });
    if (!achou) return false;
    try { localStorage.setItem(PROGRAMAS_KEY, JSON.stringify(l)); } catch (e) {}
    agendarSync();
    return true;
  }
  // O acompanhamento era um produto vendido à parte, por € 27 ao mês.
  // A escola deixou de vender: o que ficou é o desafio da semana, que
  // roda para quem já é aluna e não é cobrado. Por isso o programa não
  // tem mais preço — os registros antigos guardam o valor que foi pago
  // na época, e continuam aparecendo no Caixa e no perfil.

  function addPrograma(dados) {
    var l = programasLista();
    var p = { id: "pg" + Date.now(), nome: dados.nome || "Programa Sem Roteiro",
      inicio: dados.inicio || iso(today()),
      semanas: parseInt(dados.semanas, 10) || 8,
      diaFeedback: dados.diaFeedback || 5, // sexta
      missoes: dados.missoes || MISSOES_PILOTO.slice(),
      participantes: dados.participantes || [], progresso: {}, respostas: {} };
    l.push(p); programasSave(l); return p;
  }
  function getPrograma(id) {
    var l = programasLista();
    return (id ? l.filter(function (p) { return p.id === id; })[0] : l[0]) || null;
  }
  function updatePrograma(id, patch) {
    var l = programasLista();
    l.forEach(function (p) { if (p.id === id) { Object.assign(p, patch); carimbar(p); } });
    programasSave(l); return l;
  }
  // Uma turma do acompanhamento termina, mas o que aconteceu nela fica.
  function encerrarPrograma(id) {
    var l = programasLista();
    l.forEach(function (p) { if (p.id === id) { p.encerrada = iso(today()); carimbar(p); } });
    programasSave(l); return l;
  }
  function reabrirPrograma(id) {
    var l = programasLista();
    l.forEach(function (p) { if (p.id === id) { delete p.encerrada; carimbar(p); } });
    programasSave(l); return l;
  }
  function programasAbertos() {
    return programasLista().filter(function (p) { return !p.encerrada; });
  }
  // Resumo de cada turma, para a lista de escolha.
  function resumoProgramas() {
    return programasLista().map(function (pg) {
      var semana = semanaDoPrograma(pg);
      return { id: pg.id, nome: pg.nome, semanas: pg.semanas, semana: semana,
        participantes: (pg.participantes || []).length,
        inicio: pg.inicio, encerrada: pg.encerrada || "",
        terminou: !!pg.encerrada || semana >= pg.semanas };
    }).sort(function (a, b) {
      if (!!a.encerrada !== !!b.encerrada) return a.encerrada ? 1 : -1;
      return a.inicio < b.inicio ? 1 : -1;
    });
  }

  function removePrograma(id) {
    programasSave(programasLista().filter(function (p) { return p.id !== id; }));
  }
  function addParticipante(programaId, pessoaId) {
    var l = programasLista();
    l.forEach(function (p) {
      if (p.id === programaId && p.participantes.indexOf(pessoaId) < 0) { p.participantes.push(pessoaId); carimbar(p); }
    });
    programasSave(l); return l;
  }
  function removeParticipante(programaId, pessoaId) {
    var l = programasLista();
    l.forEach(function (p) {
      if (p.id === programaId) p.participantes = p.participantes.filter(function (x) { return x !== pessoaId; });
    });
    programasSave(l); return l;
  }
  // ── MATRÍCULA NO ACOMPANHAMENTO (produto separado da turma) ──
  //
  // Quem entra aqui normalmente não é aluna de turma: comprou só o
  // acompanhamento. Quem é aluna de turma também pode entrar — as duas
  // matrículas convivem, cada uma com o seu contrato e o seu dinheiro.
  function matricularNoPrograma(pessoaId, cfg) {
    cfg = cfg || {};
    var pg = getPrograma(cfg.programaId);
    if (!pg) return null;
    var pessoa = getPessoa(pessoaId);
    if (!pessoa) return null;

    var desde = cfg.desde || iso(today());

    addParticipante(pg.id, pessoaId);

    mutate(pessoaId, function (p) {
      p.programa = { id: pg.id, nome: pg.nome,
        desde: desde, por: (gestaoUser() || {}).nome || "" };
      // Ser aluna de turma manda no status; quem só faz o acompanhamento
      // ganha um status próprio para não sumir do sistema nem virar aluna.
      if (p.status !== "aluna" && p.status !== "mvs" && p.status !== "pausada") {
        p.status = "programa";
        p.estagio = "matriculado";
        if (!p.desde) p.desde = desde;
      }
      concluirReuniaoPelaMatricula(p);
      pushHist(p, "matricula", "Entrou no " + pg.nome);
    });


    var dono = donoDaIntegracao();
    addTarefa({ titulo: "Entrada no acompanhamento · " + pessoa.nome,
      detalhe: "Adicionar ao grupo do WhatsApp e enviar o desafio da semana atual.",
      dono: dono, prazo: iso(today()), por: (gestaoUser() || {}).nome || "" });

    return getPessoa(pessoaId);
  }

  // O dinheiro do acompanhamento entra no Caixa na categoria própria.
  function registrarPagamentoPrograma(pessoaId, dataIso) {
    var p = getPessoa(pessoaId);
    if (!p || !p.programa) return;
    addLancamento({ data: dataIso || iso(today()), tipo: "entrada",
      categoria: "programa",
      descricao: p.programa.nome + " · " + p.nome,
      moeda: p.programa.moeda, valor: p.programa.valor });
  }

  function setProgramaPago(pessoaId, pago, dataIso) {
    var antes = getPessoa(pessoaId);
    var jaEra = !!(antes && antes.programa && antes.programa.pago);
    mutate(pessoaId, function (p) {
      if (!p.programa) return;
      p.programa.pago = !!pago;
      pushHist(p, "pagamento", "Acompanhamento"
        + (p.programa.valor ? " " + p.programa.valor : "")
        + (pago ? " recebido" : " marcado como pendente"));
    });
    // dataIso: quando o pagamento veio do extrato, a receita entra no mês
    // em que o dinheiro de fato caiu
    if (pago && !jaEra) registrarPagamentoPrograma(pessoaId, dataIso);
    return getPessoa(pessoaId);
  }

  // Quem está no acompanhamento (o programa no WhatsApp) com pagamento
  // pendente — para o extrato oferecer como destino da conciliação.
  function pagamentosPendentesPrograma(moeda) {
    return loadPessoas().filter(function (p) {
      return p.programa && !p.programa.pago && !p.programa.encerrado
        && (p.programa.moeda || "R$") === moeda;
    }).map(function (p) {
      return { pessoaId: p.id, nome: p.nome,
        programaNome: p.programa.nome || "Acompanhamento",
        valor: parseMoney(p.programa.valor), moeda: p.programa.moeda || "R$" };
    });
  }

  function sairDoPrograma(pessoaId, motivo) {
    var p = getPessoa(pessoaId);
    if (!p || !p.programa) return null;
    removeParticipante(p.programa.id, pessoaId);
    mutate(pessoaId, function (pp) {
      pp.programa.encerrado = iso(today());
      pp.programa.motivo = motivo || "";
      // Quem era só do acompanhamento sai como ex-aluna; quem é de turma
      // continua sendo aluna de turma, só deixa o acompanhamento.
      if (pp.status === "programa") {
        pp.status = "ex-aluna";
        pp.estagio = "perdido";
        pp.saidaEm = iso(today());
        pp.motivoPerda = motivo || "Saiu do acompanhamento";
      }
      pushHist(pp, "perdido", "Saiu do " + pp.programa.nome
        + (motivo ? " · " + motivo : ""));
    });
    return getPessoa(pessoaId);
  }

  // Quem está no programa, com o que a equipe precisa ver de cada uma.
  function participantesPrograma(programaId) {
    var pg = getPrograma(programaId);
    if (!pg) return [];
    return (pg.participantes || []).map(function (id) {
      var p = getPessoa(id);
      if (!p) return null;
      var m = p.programa || {};
      return { id: id, nome: p.nome, status: p.status,
        ehAlunaTambem: p.status === "aluna" || p.status === "mvs" || p.status === "pausada",
        turma: p.turma || "", soPrograma: p.status === "programa",
        valor: m.valor || "", moeda: m.moeda || pg.moeda, pago: !!m.pago,
        desde: m.desde || "", semRegistro: !p.programa };
    }).filter(Boolean);
  }

  // Quanto o programa faturou e quanto ainda há a receber.
  function receitaPrograma(programaId) {
    var lista = participantesPrograma(programaId);
    var pagos = {}, aReceber = {};
    lista.forEach(function (x) {
      if (!x.valor) return;
      var alvo = x.pago ? pagos : aReceber;
      alvo[x.moeda] = (alvo[x.moeda] || 0) + parseMoney(x.valor);
    });
    var fmt = function (o) {
      return Object.keys(o).map(function (k) { return fmtMoney(k, o[k]); }).join(" · ");
    };
    return { total: lista.length,
      nPagos: lista.filter(function (x) { return x.pago; }).length,
      nAReceber: lista.filter(function (x) { return !x.pago && x.valor; }).length,
      semRegistro: lista.filter(function (x) { return x.semRegistro; }).length,
      recebido: fmt(pagos) || "—", aReceber: fmt(aReceber) || "—" };
  }

  // chave: pessoaId|semana → { missao, audio, feedback }
  function marcarEtapa(programaId, pessoaId, semana, etapa, valor) {
    var l = programasLista();
    l.forEach(function (p) {
      if (p.id !== programaId) return;
      p.progresso = p.progresso || {};
      var k = pessoaId + "|" + semana;
      p.progresso[k] = p.progresso[k] || {};
      if (valor) p.progresso[k][etapa] = iso(today());
      else delete p.progresso[k][etapa];
      carimbar(p);
    });
    programasSave(l); return l;
  }
  // Missão da semana: enviada ao grupo, uma marca por semana.
  function marcarMissaoSemana(programaId, semana, valor) {
    var l = programasLista();
    l.forEach(function (p) {
      if (p.id !== programaId) return;
      p.missoesEnviadas = p.missoesEnviadas || {};
      if (valor) p.missoesEnviadas[semana] = iso(today());
      else delete p.missoesEnviadas[semana];
      carimbar(p);
    });
    programasSave(l); return l;
  }
  function missaoEnviada(programa, semana) {
    return !!((programa.missoesEnviadas || {})[semana]);
  }
  // Moedas do programa: responder a missão vale moedas; participar do
  // grupo também. Quem somar mais no fim ganha a aula particular.
  var MOEDAS_PROGRAMA = { resposta: 20, participacao: 10 };
  function moedasDoPrograma(programa, pessoaId) {
    var n = 0;
    for (var s = 1; s <= programa.semanas; s++) {
      if (etapaFeita(programa, pessoaId, s, "audio")) n += MOEDAS_PROGRAMA.resposta;
    }
    n += ((programa.participacao || {})[pessoaId] || 0) * MOEDAS_PROGRAMA.participacao;
    return n;
  }
  // Participação no grupo: você soma um ponto quando alguém interage.
  function somarParticipacao(programaId, pessoaId, delta) {
    var l = programasLista();
    l.forEach(function (p) {
      if (p.id !== programaId) return;
      p.participacao = p.participacao || {};
      p.participacao[pessoaId] = Math.max(0, (p.participacao[pessoaId] || 0) + (delta || 1));
      carimbar(p);
    });
    programasSave(l); return l;
  }
  function rankingPrograma(programaId) {
    var p = getPrograma(programaId);
    if (!p) return [];
    return p.participantes.map(function (pid) {
      var pessoa = getPessoa(pid) || { nome: "(removida)" };
      var respostas = 0;
      for (var s = 1; s <= p.semanas; s++) if (etapaFeita(p, pid, s, "audio")) respostas++;
      return { pessoaId: pid, nome: pessoa.nome, respostas: respostas,
        participacao: (p.participacao || {})[pid] || 0,
        moedas: moedasDoPrograma(p, pid) };
    }).sort(function (a, b) { return b.moedas - a.moedas || a.nome.localeCompare(b.nome); })
      .map(function (x, i) { return Object.assign({ posicao: i + 1 }, x); });
  }

  function etapaFeita(programa, pessoaId, semana, etapa) {
    var k = pessoaId + "|" + semana;
    return !!((programa.progresso || {})[k] || {})[etapa];
  }
  // Semana corrente do programa (1 a N; 0 = ainda não começou)
  function semanaAtualPrograma(programa) {
    if (!programa || !programa.inicio) return 0;
    var d = daysBetween(parseISO(programa.inicio), today());
    if (d < 0) return 0;
    return Math.min(programa.semanas, Math.floor(d / 7) + 1);
  }
  // O que está pendente AGORA: por aluna, o que falta até a semana corrente.
  function pendenciasPrograma(programaId) {
    var p = getPrograma(programaId);
    if (!p) return { semanaAtual: 0, linhas: [], feedbacksDevendo: 0, semAudio: 0 };
    var sem = semanaAtualPrograma(p);
    var feedbacksDevendo = 0, semAudio = 0;
    var linhas = p.participantes.map(function (pid) {
      var pessoa = getPessoa(pid) || { nome: "(removida)", whatsapp: "" };
      var faltando = [];
      for (var s = 1; s <= sem; s++) {
        if (!missaoEnviada(p, s)) continue; // missão ainda não foi ao grupo
        var a = etapaFeita(p, pid, s, "audio");
        var f = etapaFeita(p, pid, s, "feedback");
        if (!a) faltando.push({ semana: s, etapa: "audio" });
        else if (!f) faltando.push({ semana: s, etapa: "feedback" });
      }
      var devendoFeedback = faltando.filter(function (x) { return x.etapa === "feedback"; }).length;
      var semAud = faltando.filter(function (x) { return x.etapa === "audio"; }).length;
      feedbacksDevendo += devendoFeedback;
      if (semAud) semAudio++;
      // entregou nas últimas 2 semanas? quem some duas seguidas some de vez
      var recentes = 0;
      for (var s2 = Math.max(1, sem - 1); s2 <= sem; s2++) if (etapaFeita(p, pid, s2, "audio")) recentes++;
      return {
        pessoaId: pid, nome: pessoa.nome, whatsapp: pessoa.whatsapp || "",
        faltando: faltando, devendoFeedback: devendoFeedback, semAudio: semAud,
        sumindo: sem >= 2 && recentes === 0,
        entregues: (function () { var n = 0; for (var i = 1; i <= p.semanas; i++) if (etapaFeita(p, pid, i, "audio")) n++; return n; })()
      };
    }).sort(function (a, b) {
      return (b.devendoFeedback - a.devendoFeedback) || (b.sumindo - a.sumindo) || a.nome.localeCompare(b.nome);
    });
    var respSemana = p.participantes.filter(function (pid) {
      return sem >= 1 && etapaFeita(p, pid, sem, "audio");
    }).length;
    return { semanaAtual: sem, linhas: linhas,
      feedbacksDevendo: feedbacksDevendo, semAudio: semAudio,
      missaoDaSemanaEnviada: sem >= 1 && missaoEnviada(p, sem),
      responderamNaSemana: respSemana, totalParticipantes: p.participantes.length,
      missaoDaSemana: sem >= 1 ? (p.missoes[sem - 1] || "") : "" };
  }

  // ══════════════════════════════════════════════════════════════
  //  SAÍDA E RENOVAÇÃO
  //  ------------------------------------------------------------
  //  Antes, quem não renovava simplesmente sumia da lista: não havia
  //  como responder "quantas perdi neste ciclo e por quê". Toda saída
  //  passa a ter tipo, motivo e data — e a renovação vira um evento
  //  registrado, não um contrato novo aparecendo do nada.
  // ══════════════════════════════════════════════════════════════
  var TIPOS_SAIDA = [
    { id: "pausou",   label: "Pausou",             cor: "#d4a574", reativavel: true,
      desc: "Pausa temporária, com previsão de retorno" },
    { id: "saiu",     label: "Saiu",               cor: "#cf6b5c", reativavel: true,
      desc: "Encerrou sem previsão de retorno" },
    { id: "concluiu", label: "Concluiu o objetivo", cor: "#5a9e4b", reativavel: false,
      desc: "Objetivo atingido" }
  ];
  var MOTIVOS_SAIDA = [
    "Financeiro", "Horário incompatível", "Falta de tempo", "Não sentiu evolução",
    "Mudou de objetivo", "Mudança de país ou cidade", "Insatisfação com a aula",
    "Motivo pessoal", "Outro"
  ];
  function encerrarMatricula(id, cfg) {
    var r = mutate(id, function (p) {
      var tipo = (cfg && cfg.tipo) || "saiu";
      var meta = TIPOS_SAIDA.filter(function (x) { return x.id === tipo; })[0] || TIPOS_SAIDA[1];
      p.statusAnterior = p.status;
      p.estagioAnterior = p.estagio;
      p.status = "ex-aluna";
      p.estagio = "perdido";
      p.motivoPerda = (cfg && cfg.motivo) || "Outro";
      p.saidaEm = (cfg && cfg.data) || iso(today());
      p.saida = {
        data: (cfg && cfg.data) || iso(today()),
        tipo: tipo,
        motivo: (cfg && cfg.motivo) || "Outro",
        detalhe: (cfg && cfg.detalhe) || "",
        reativavel: cfg && cfg.reativavel !== undefined ? !!cfg.reativavel : meta.reativavel,
        turma: p.turma || "", por: ((gestaoUser() || {}).nome || "")
      };
      pushHist(p, "estagio", meta.label + " · " + p.saida.motivo
        + (p.saida.detalhe ? " — " + p.saida.detalhe : ""));

      // ── acerto final ──────────────────────────────────────────
      // Parcelas em aberto: o padrão para quem sai é cancelar (ninguém
      // mais cobra); "manter" preserva as VENCIDAS para cobrança de quem
      // saiu devendo. As futuras são sempre canceladas — não existe
      // cobrar mês que a pessoa não vai cursar.
      var manterVencidas = cfg && cfg.parcelasAbertas === "manter";
      var canceladas = 0;
      (p.contratos || []).forEach(function (c) {
        (c.meses || []).forEach(function (m) {
          if (m.pago || m.cancelada) return;
          if (manterVencidas && m.key <= mesAtualKey()) return;
          m.cancelada = true; canceladas++;
        });
      });
      if (canceladas) pushHist(p, "pagamento", canceladas
        + (canceladas === 1 ? " parcela em aberto cancelada" : " parcelas em aberto canceladas")
        + " no encerramento");

      // Valor do acerto (pro-rata de quem saiu no começo) e devolução:
      // entram no contrato — o LTV soma o acerto e desconta a devolução.
      var c0 = contratoVigente(p);
      if (!c0 && (cfg && (cfg.acertoValor || cfg.devolucaoValor))) {
        c0 = { tipo: "Acerto", moeda: p.moeda || "€", meses: [] };
        p.contratos = p.contratos || []; p.contratos.unshift(c0);
      }
      if (cfg && cfg.acertoValor && parseMoney(cfg.acertoValor) > 0) {
        c0.acertos = c0.acertos || [];
        c0.acertos.push({ tipo: "acerto", valor: cfg.acertoValor, em: iso(today()) });
        pushHist(p, "pagamento", "Acerto final de " + fmtMoney(c0.moeda || "R$", parseMoney(cfg.acertoValor)) + " recebido no encerramento");
      }
      if (cfg && cfg.devolucaoValor && parseMoney(cfg.devolucaoValor) > 0) {
        c0.acertos = c0.acertos || [];
        c0.acertos.push({ tipo: "devolucao", valor: cfg.devolucaoValor, em: iso(today()) });
        pushHist(p, "pagamento", "Devolução de " + fmtMoney(c0.moeda || "R$", parseMoney(cfg.devolucaoValor)) + " registrada no encerramento");
      }
    });
    // acerto e devolução também entram no Caixa como lançamentos
    var p2 = getPessoa(id);
    var moeda = (contratoVigente(p2) || {}).moeda || p2.moeda || "€";
    if (cfg && cfg.acertoValor && parseMoney(cfg.acertoValor) > 0)
      addLancamento({ tipo: "entrada", categoria: "acerto final",
        descricao: "Acerto final · " + p2.nome, moeda: moeda, valor: cfg.acertoValor });
    if (cfg && cfg.devolucaoValor && parseMoney(cfg.devolucaoValor) > 0)
      addLancamento({ tipo: "saida", categoria: "devolução",
        descricao: "Devolução · " + p2.nome, moeda: moeda, valor: cfg.devolucaoValor });
    return r;
  }
  // Acertos avulsos e correção: registrar um acerto/devolução fora do
  // fluxo de encerramento (ou depois dele) e remover um registrado
  // errado — a remoção também tira o lançamento correspondente do Caixa.
  function registrarAcerto(pessoaId, tipo, valor) {
    var v = parseMoney(valor);
    if (!(v > 0)) return false;
    var ehDev = tipo === "devolucao";
    mutate(pessoaId, function (p) {
      var c = contratoVigente(p);
      if (!c) {
        c = { tipo: "Acerto", moeda: p.moeda || "€", meses: [] };
        p.contratos = p.contratos || []; p.contratos.unshift(c);
      }
      c.acertos = c.acertos || [];
      c.acertos.push({ tipo: ehDev ? "devolucao" : "acerto", valor: valor, em: iso(today()) });
      pushHist(p, "pagamento", (ehDev ? "Devolução de " : "Acerto de ")
        + fmtMoney(c.moeda || "R$", v) + (ehDev ? " registrada" : " recebido"));
    });
    var p2 = getPessoa(pessoaId);
    var moeda = (contratoVigente(p2) || {}).moeda || p2.moeda || "€";
    addLancamento({ tipo: ehDev ? "saida" : "entrada",
      categoria: ehDev ? "devolução" : "acerto final",
      descricao: (ehDev ? "Devolução · " : "Acerto final · ") + p2.nome,
      moeda: moeda, valor: valor });
    return true;
  }
  function removerAcerto(pessoaId, contratoIdx, acertoIdx) {
    var removido = null, nome = "";
    mutate(pessoaId, function (p) {
      var c = (p.contratos || [])[parseInt(contratoIdx, 10) || 0];
      if (!c || !c.acertos || !c.acertos[acertoIdx]) return;
      removido = c.acertos.splice(acertoIdx, 1)[0];
      nome = p.nome;
      pushHist(p, "pagamento", (removido.tipo === "devolucao" ? "Devolução" : "Acerto")
        + " de " + removido.valor + " removido (correção)");
    });
    if (!removido) return false;
    // o lançamento que nasceu junto sai do Caixa (o primeiro que casar)
    var alvo = (removido.tipo === "devolucao" ? "Devolução · " : "Acerto final · ") + nome;
    var v = parseMoney(removido.valor);
    var l = lancamentosLista();
    for (var i = 0; i < l.length; i++) {
      if (l[i].descricao === alvo && Math.abs((l[i].valor || 0) - v) < 0.005) {
        removeLancamento(l[i].id); break;
      }
    }
    return true;
  }

  function reabrirMatricula(id) {
    return mutate(id, function (p) {
      if (p.status !== "ex-aluna") return;
      p.status = p.statusAnterior || "aluna";
      p.estagio = p.estagioAnterior || "matriculado";
      delete p.statusAnterior; delete p.estagioAnterior;
      delete p.motivoPerda; delete p.saidaEm;
      pushHist(p, "estagio", "Matrícula reaberta"
        + (p.saida ? " · havia " + (p.saida.tipo === "pausou" ? "pausado" : "saído") + " em " + ddmm(p.saida.data) : ""));
      delete p.saida;
    });
  }
  // Renovação: novo contrato no lugar do anterior, com o registro do evento.
  function renovarMatricula(id, cfg) {
    var anterior = null;
    var p0 = getPessoa(id) || {};
    if ((p0.contratos || []).length) anterior = p0.contratos[0];
    var fimAnterior = anterior && anterior.fim ? anterior.fim.slice(0, 7) : "";
    // renovar não é rematricular: turma, professora e formatos continuam os mesmos
    var turmaAntes = p0.turma || "", profAntes = p0.professora || "";
    var formatosAntes = (p0.formatos || []).slice();
    var desdeAntes = p0.desde || "";
    // renovar é fechar um contrato hoje. Sem isto, um cfg.desde herdado
    // dataria a venda pela entrada da aluna e a comissão sumiria de novo
    var cfgR = Object.assign({}, cfg || {});
    if (!cfgR.fechadoEm) cfgR.fechadoEm = iso(today());
    var r = matricular(id, cfgR);
    mutate(id, function (p) {
      var c = contratoVigente(p);
      if (!c) return;
      c.renovacao = true;
      if (!(cfg && cfg.turmaId)) {
        p.turma = turmaAntes; p.professora = profAntes;
        p.formatos = formatosAntes; p.desde = desdeAntes;
      }
      // O ciclo novo começa depois do anterior — mas nunca no passado.
      // Renovação registrada com atraso criava parcelas já vencidas.
      if ((c.meses || []).length) {
        var k = mesAnterior(primeiroMesDoCiclo(fimAnterior, c.vencDia)).key;
        c.meses = c.meses.map(function (m) {
          var prox = mesSeguinte(k); k = prox.key;
          return { key: prox.key, label: prox.label, valor: m.valor, pago: false };
        });
        c.fim = c.meses[c.meses.length - 1].key + "-28";
      }
      // O que ficou em aberto no ciclo anterior continua devido. Fica
      // registrado no contrato novo para a equipe ver de onde vem.
      var pend = pendenciaAnterior(p);
      if (pend.n) {
        c.pendenciaAnterior = { parcelas: pend.n,
          totais: pend.totais.map(function (x) { return x.moeda + " " + x.valor; }).join(" · ") };
      }
      pushHist(p, "renovacao", "Contrato renovado"
        + (c.meses && c.meses.length ? " · " + c.meses[0].label + " a " + c.meses[c.meses.length - 1].label : "")
        + (pend.n ? " · " + pend.n + " parcela(s) do ciclo anterior seguem em aberto" : ""));
    });
    var depois = pendenciaAnterior(id);
    if (depois.n) {
      var pf = getPessoa(id) || {};
      addTarefa({ titulo: "Cobrar o que ficou do ciclo anterior · " + (pf.nome || ""),
        detalhe: depois.n + " parcela(s) em aberto · "
          + depois.totais.map(function (x) { return x.valor; }).join(" · ")
          + ". A renovação foi registrada e a cobrança continua.",
        dono: donoDaIntegracao ? donoDaIntegracao() : "Gabi",
        prazo: iso(today()), por: (gestaoUser() || {}).nome || "" });
    }
    return r;
  }

  // O que a tela precisa mostrar ANTES de confirmar a renovação.
  function resumoRenovacao(id) {
    var p = getPessoa(id);
    if (!p) return null;
    var c = contratoVigente(p);
    var abertas = parcelasAbertas(p);
    var fim = c && c.fim ? c.fim.slice(0, 7) : "";
    var mesHoje = mesAtualKey();
    var inicioKey = primeiroMesDoCiclo(fim, c ? c.vencDia : null);
    var prox = { key: inicioKey, label: mesSeguinte(mesAnterior(inicioKey).key).label };
    var porMoeda = {};
    abertas.forEach(function (m) { porMoeda[m.moeda] = (porMoeda[m.moeda] || 0) + parseMoney(m.valor); });
    return {
      abertas: abertas, n: abertas.length,
      totais: Object.keys(porMoeda).map(function (k) { return { moeda: k, valor: fmtMoney(k, porMoeda[k]) }; }),
      vencidas: abertas.filter(function (m) { return m.vencida; }).length,
      fimAtual: fim, inicioNovo: prox.key, inicioNovoLabel: prox.label,
      atrasada: !!(fim && fim < mesHoje)
    };
  }

  // Taxa de renovação: de todos os contratos que terminaram no período,
  // quantos tiveram continuidade. É a pergunta central de retenção.
  function retencao(nMeses) {
    var n = nMeses || 6;
    var limite = addDays(-30 * n), hoje = iso(today());
    var terminados = [], renovados = [], perdidos = [], pendentes = [];
    loadPessoas().forEach(function (p) {
      var cs = p.contratos || [];
      cs.forEach(function (c, i) {
        if (!c.fim || c.fim > hoje || c.fim < limite) return;
        var reg = { pessoaId: p.id, nome: p.nome, fim: c.fim, turma: c.turma || p.turma || "" };
        terminados.push(reg);
        // houve contrato criado depois deste? (contratos entram com unshift)
        if (i > 0) { renovados.push(reg); return; }
        // sem contrato novo: ou ela ainda está ativa e a decisão não veio,
        // ou ela saiu de fato. Só o segundo caso conta como perda.
        if (p.status === "aluna" || p.status === "mvs") { pendentes.push(reg); return; }
        reg.saida = p.saida || null;
        perdidos.push(reg);
      });
    });
    var decididos = renovados.length + perdidos.length;
    return { meses: n, terminados: terminados.length,
      renovados: renovados.length, perdidos: perdidos.length,
      pendentes: pendentes.length, decididos: decididos,
      taxa: decididos ? Math.round(100 * renovados.length / decididos) : null,
      listaPerdidos: perdidos, listaPendentes: pendentes };
  }
  // Por que a gente perde aluna: motivos agregados no período.
  function saidasResumo(nMeses) {
    var n = nMeses || 12;
    var limite = addDays(-30 * n);
    var porMotivo = {}, porTipo = {}, total = 0;
    loadPessoas().forEach(function (p) {
      if (!p.saida || p.saida.data < limite) return;
      total++;
      porMotivo[p.saida.motivo] = (porMotivo[p.saida.motivo] || 0) + 1;
      porTipo[p.saida.tipo] = (porTipo[p.saida.tipo] || 0) + 1;
    });
    return { meses: n, total: total,
      motivos: Object.keys(porMotivo).map(function (k) { return { motivo: k, n: porMotivo[k] }; })
        .sort(function (a, b) { return b.n - a.n; }),
      tipos: TIPOS_SAIDA.map(function (t2) { return { tipo: t2.id, label: t2.label, cor: t2.cor, n: porTipo[t2.id] || 0 }; }) };
  }
  function exAlunas() {
    return loadPessoas().filter(function (p) { return p.status === "ex-aluna" && p.saida; })
      .map(function (p) {
        var meta = TIPOS_SAIDA.filter(function (x) { return x.id === p.saida.tipo; })[0] || TIPOS_SAIDA[1];
        return { id: p.id, nome: p.nome, whatsapp: p.whatsapp || "",
          turma: p.saida.turma, data: p.saida.data, tipo: p.saida.tipo,
          tipoLabel: meta.label, cor: meta.cor, motivo: p.saida.motivo,
          detalhe: p.saida.detalhe, reativavel: p.saida.reativavel,
          diasFora: daysBetween(parseISO(p.saida.data), today()) };
      }).sort(function (a, b) { return a.data < b.data ? 1 : -1; });
  }

  // ══════════════════════════════════════════════════════════════
  //  CARTEIRA POR PROFESSORA
  //  ------------------------------------------------------------
  //  Chegar a 80 alunas sem perder o atendimento de perto depende de
  //  saber quem cuida de quem, e quando alguém passou do que aguenta.
  // ══════════════════════════════════════════════════════════════
  var CAPACIDADE_KEY = "isr_capacidade_v1";
  // quantas alunas uma professora aguenta acompanhar — não confundir com o
  // tamanho da turma, que é outra coisa (CAPACIDADE_PADRAO, lá em cima).
  var CARTEIRA_PADRAO = 25;
  function capacidades() {
    try { return JSON.parse(localStorage.getItem(CAPACIDADE_KEY)) || {}; } catch (e) { return {}; }
  }
  function setCapacidade(nome, n) {
    var m = capacidades();
    var v = parseInt(n, 10);
    if (!isNaN(v) && v > 0) m[nome] = v; else delete m[nome];
    try { localStorage.setItem(CAPACIDADE_KEY, JSON.stringify(m)); } catch (e) {}
    agendarSync();
    return m;
  }
  // A professora de uma aluna pode estar no cadastro dela ou só na turma
  // (importações antigas deixavam o campo da pessoa vazio). Quem tem
  // turma com professora TEM professora — senão a Central acusava "sem
  // professora" para aluna cuja turma é da Carla.
  function professoraEfetiva(p) {
    if (p.professora) return p.professora;
    if (!p.turma || p.turma === "Particular") return "";
    var u = turmasLista().filter(function (x) {
      return (x.nivel + " · " + x.turma) === p.turma;
    })[0];
    return (u && u.teacher) || "";
  }

  // Quem pode ser responsável por aula: professoras de turma e as de
  // aulas extras. Shadow acompanha aulas, mas não responde por elas.
  function professorasDeAula() {
    return equipeLista().filter(function (m) {
      var pp = m.papeis || [];
      return pp.indexOf("professora") >= 0 || pp.indexOf("extra") >= 0;
    }).map(function (m) { return m.nome; });
  }
  // Quem aparece no Painel do Professor: docentes de qualquer tipo —
  // turma fixa, só aulas extras ou shadow.
  function equipeDocente() {
    return equipeLista().filter(function (m) {
      var pp = m.papeis || [];
      return pp.indexOf("professora") >= 0 || pp.indexOf("extra") >= 0 || pp.indexOf("shadow") >= 0;
    }).map(function (m) { return m.nome; });
  }

  function carteiraProfessoras() {
    var caps = capacidades();
    var ativas = loadPessoas().filter(function (p) { return p.status === "aluna" || p.status === "mvs"; });
    var porProf = {};
    var nomes = [];
    equipeLista().forEach(function (m) {
      if ((m.papeis || []).indexOf("professora") < 0) return;
      nomes.push(m.nome);
      porProf[m.nome] = [];
    });
    ativas.forEach(function (p) {
      var n = professoraEfetiva(p);
      if (!n) return;
      if (!porProf[n]) { porProf[n] = []; nomes.push(n); }
      porProf[n].push(p);
    });
    var semProfessora = ativas.filter(function (p) { return !professoraEfetiva(p); });
    var linhas = nomes.map(function (n) {
      var alunas = porProf[n] || [];
      var cap = caps[n] || CARTEIRA_PADRAO;
      var turmas = [];
      alunas.forEach(function (p) { if (p.turma && turmas.indexOf(p.turma) < 0) turmas.push(p.turma); });
      // quanto contato por semana essa carteira exige
      var porSemana = 0, foraDaCadencia = 0, emRisco = 0;
      alunas.forEach(function (p) {
        var c = cadenciaDe(p);
        porSemana += 7 / c.intervalo;
        if (c.vencido) foraDaCadencia++;
        if (c.segmento === "em_risco") emRisco++;
      });
      var pct = cap > 0 ? Math.round(100 * alunas.length / cap) : 0;
      return {
        nome: n, alunas: alunas.length, capacidade: cap, pct: pct,
        acima: alunas.length > cap,
        vagas: Math.max(0, cap - alunas.length),
        turmas: turmas.length, listaTurmas: turmas,
        contatosPorSemana: Math.round(porSemana * 10) / 10,
        foraDaCadencia: foraDaCadencia, emRisco: emRisco,
        nomes: alunas.map(function (p) { return p.nome; }).sort()
      };
    }).sort(function (a, b) { return b.pct - a.pct || a.nome.localeCompare(b.nome); });
    var total = ativas.length;
    var capTotal = linhas.reduce(function (a, l) { return a + l.capacidade; }, 0);
    return { linhas: linhas, total: total, capacidadeTotal: capTotal,
      vagasTotais: Math.max(0, capTotal - total),
      semProfessora: semProfessora.map(function (p) { return { id: p.id, nome: p.nome, turma: p.turma || "—" }; }),
      acimaDoLimite: linhas.filter(function (l) { return l.acima; }).length };
  }

  // ── PAINEL DE ALUNAS ──────────────────────────────────────────
  // Todo mundo que já é aluna, com os sinais que dizem se ela está
  // bem ou se precisa de você. É a base do acompanhamento: sem isso
  // o único jeito de saber como alguém está é abrindo perfil por perfil.
  var RISCOS = (function () {
    // "onboarding_travado" é um risco próprio: aparece nas Alunas como
    // situação, não só como pendência da fila
    var m = {};
    SINAIS.forEach(function (s) {
      if (s.risco) m[s.risco] = { label: s.label, cor: s.cor, peso: s.peso, sinal: s.id };
    });
    return m;
  })();
  // Retrato da situação de cada aluna. Diferente da Central e do
  // Acompanhamento, aqui nada é escondido por adiamento: esta tela é
  // consulta, não fila de trabalho.
  function alunasPainel() {
    return loadPessoas()
      .filter(function (p) { return p.status === "aluna" || p.status === "mvs"; })
      .map(function (p) {
        var s = situacaoDe(p);
        var todos = sinaisDe(p, s);
        var c = s.contrato;
        var riscos = todos.filter(function (x) { return x.risco; }).map(function (x) { return x.risco; });
        var score = todos.filter(function (x) { return x.risco; })
          .reduce(function (a, x) { return a + x.peso; }, 0);
        return {
          id: p.id, nome: p.nome, turma: p.turma || "—", professora: p.professora || "—",
          nivel: p.nivel || "", status: p.status, whatsapp: p.whatsapp || "",
          moeda: c.moeda || p.moeda || "R$", parcelaValor: c.parcelaValor || "",
          parcelasPagas: s.parcelasPagas, parcelasTotal: s.meses.length,
          atrasadas: s.atrasadasN,
          faltas: s.faltas,
          onboardingFeitos: s.onboardingFeitos, onboardingTotal: s.onboarding.length,
          diasSemContato: s.diasSemContato,
          proximoCheckin: p.proximoCheckin || "",
          fimContrato: c.fim || "", diasPraRenovar: s.diasPraRenovar,
          moedas: moedasDe(p.id).total,
          tarefas: tarefasDe(p.id, 4),
          pulso: s.pulso ? s.pulso.nota : null,
          pulsoLabel: s.pulso ? pulsoMeta(s.pulso.nota).label : "",
          pulsoCor: s.pulso ? pulsoMeta(s.pulso.nota).cor : "#b8ada0",
          tendenciaPulso: s.tendencia,
          desde: p.desde || "", tags: (p.tags || []).slice(),
          sinais: todos, riscos: riscos, score: score,
          saudavel: riscos.length === 0
        };
      })
      .sort(function (a, b) { return b.score - a.score || a.nome.localeCompare(b.nome); });
  }

  function ocupacaoTurmas() {
    var pessoas = loadPessoas();
    return turmasLista().map(function (u) {
      var label = u.nivel + " · " + u.turma;
      var cap = u.capacidade || CAPACIDADE_PADRAO;
      var ocup = pessoas.filter(function (p) {
        return (p.status === "aluna") && p.turma === label;
      }).length;
      return { id: u.id, nivel: u.nivel, turma: u.turma, teacher: u.teacher, cycle: u.cycle,
        projeto: u.projeto, notebook: u.notebook, label: label,
        // Como a turma trabalha DURANTE a aula: no caderno do app, ou
        // no papel. Não é o mesmo que ser online ou presencial — há
        // turma online com aluna que prefere escrever à mão, e turma
        // presencial em que todas levam o celular. É por este campo
        // que a professora sabe se precisa imprimir.
        formato: u.formato === "papel" ? "papel" : "digital",
        capacidade: cap, ocupadas: ocup, vagas: cap - ocup };
    });
  }

  // ══════════════════════════════════════════════════════════════
  //  MOTOR DE FILAS — spec 3.1 (R1–R5, R12; R6–R11 aguardam fontes)
  //  perfil: 'gestora' | 'comercial' | 'operacao'
  // ══════════════════════════════════════════════════════════════
  // ── PENDÊNCIAS (tarefas da equipe — Gabi distribui, cada uma vê a sua) ──
  var TAREFAS_KEY = "isr_tarefas_v1";
  // Pendência removida vira lápide: a mesclagem do sync soma listas por
  // id — sem a lápide, o puxe seguinte devolvia a pendência à tela
  function tarefasRaw() { try { return JSON.parse(localStorage.getItem(TAREFAS_KEY)) || []; } catch (e) { return []; } }
  function tarefasLista() { return tarefasRaw().filter(function (tf) { return !(tf && tf.apagada); }); }
  function tarefasSave(l) {
    var lapides = tarefasRaw().filter(function (tf) { return tf && tf.apagada; });
    carimbarLista(l);
    try { localStorage.setItem(TAREFAS_KEY, JSON.stringify(l.concat(lapides))); } catch (e) {}
    agendarSync();
  }
  function addTarefa(dados) {
    var l = tarefasLista();
    l.push({ id: "tf" + Date.now(), titulo: (dados.titulo || "").trim(), dono: dados.dono || "Gabi",
      detalhe: (dados.detalhe || "").trim(),
      // destino: a pendência pode apontar para a pessoa (abre o Perfil)
      // ou para a tela onde ela se resolve
      pessoaId: dados.pessoaId || "", tela: dados.tela || "",
      prazo: dados.prazo || "", feita: false, criadaEm: iso(today()), por: dados.por || "" });
    l.sort(function (a, b) { return (a.prazo || "9999") < (b.prazo || "9999") ? -1 : 1; });
    tarefasSave(l); return l;
  }
  function setTarefaFeita(id, feita) {
    var l = tarefasLista();
    l.forEach(function (tf) {
      if (tf.id !== id) return;
      carimbar(tf);
      var virouFeita = !!feita && !tf.feita;
      tf.feita = !!feita; tf.feitaEm = feita ? iso(today()) : "";
      // quem pediu vê a tarefa marcada como feita na própria lista
    });
    tarefasSave(l); return l;
  }

  // ── AVISOS ────────────────────────────────────────────────────
  // Recado interno de uma pessoa da equipe pra outra. Fica na
  // Central de quem recebeu até ser lido.
  // Mensagens por assunto, visíveis para toda a equipe. Não é conversa
  // em tempo real: viaja pela sincronização do banco central (até ~5
  // minutos para chegar nos outros aparelhos). Serve para aviso e
  // registro — e qualquer mensagem pode virar pendência com dono.
  function removeTarefa(id) {
    var l = tarefasRaw().map(function (tf) {
      return tf.id === id ? { id: tf.id, apagada: iso(today()), _v: Date.now() } : tf;
    });
    try { localStorage.setItem(TAREFAS_KEY, JSON.stringify(l)); } catch (e) {}
    agendarSync();
    return tarefasLista();
  }

  // ── FERIADOS DA ESCOLA (a agenda pula as aulas nesses dias) ────
  var FERIADOS_KEY = "isr_feriados_v1";
  function feriadosLista() { try { return JSON.parse(localStorage.getItem(FERIADOS_KEY)) || []; } catch (e) { return []; } }
  function addFeriado(dataIso, nome, fimIso) {
    var l = feriadosLista();
    l.push({ id: "fer" + Date.now(), data: dataIso, fim: fimIso || dataIso, nome: nome || "Feriado" });
    l.sort(function (a, b) { return a.data < b.data ? -1 : 1; });
    try { localStorage.setItem(FERIADOS_KEY, JSON.stringify(l)); } catch (e) {}
    agendarSync(); return l;
  }
  function removeFeriado(id) {
    var l = feriadosLista().filter(function (f) { return f.id !== id; });
    try { localStorage.setItem(FERIADOS_KEY, JSON.stringify(l)); } catch (e) {}
    agendarSync(); return l;
  }
  function ehFeriado(dataIso) {
    return feriadosLista().filter(function (f) {
      return dataIso >= f.data && dataIso <= (f.fim || f.data);
    }).length > 0;
  }

  // ── REUNIÕES DO COMERCIAL (calendário da Carla) ────────────────
  function agendarReuniao(id, dataIso, hora, cfg) {
    var pes = getPessoa(id);
    var dono = (cfg && cfg.dono) || donoComercial();
    mutate(id, function (p) {
      p.reuniao = { data: dataIso, hora: hora || "", feita: false,
        dono: dono, duracao: (cfg && parseInt(cfg.duracao, 10)) || 45 };
      pushHist(p, "reuniao", "Reunião agendada para " + ddmm(dataIso) + (hora ? " às " + hora : "")
        + (dono ? " · " + dono : ""));
    });
    // A reunião vira compromisso de alguém: sem tarefa, ela só existe na
    // ficha do lead e não aparece na Central de quem precisa conduzi-la.
    addTarefa({
      titulo: "Conversa de matrícula: " + (pes ? pes.nome : ""),
      detalhe: "Reunião marcada para " + ddmm(dataIso) + (hora ? " às " + hora : "")
        + (pes && pes.email ? " · " + pes.email : ""),
      dono: dono, prazo: dataIso,
      por: (gestaoUser() || {}).nome || ""
    });
    return loadPessoas();
  }
  // A escola vive em dois fusos: Carla e a maioria das leads no Brasil,
  // Gabi na Holanda. A hora da conversa é marcada no horário de Brasília;
  // aqui a mesma hora sai nos dois fusos, calculada pelo relógio real de
  // cada lugar (horário de verão incluído).
  function fusoOffsetMin(tz, date) {
    var f = new Intl.DateTimeFormat("en-US", { timeZone: tz, hour12: false,
      year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" });
    var parts = {};
    f.formatToParts(date).forEach(function (x) { parts[x.type] = x.value; });
    var asUTC = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour % 24, parts.minute);
    return (asUTC - date.getTime()) / 60000;
  }
  function horaBRNL(dataIso, horaBR) {
    if (!dataIso || !horaBR) return "";
    try {
      var m = /^(\d{1,2}):?(\d{2})?/.exec(horaBR);
      if (!m) return horaBR;
      var pd = dataIso.split("-").map(Number);
      var base = Date.UTC(pd[0], pd[1] - 1, pd[2], parseInt(m[1], 10), m[2] ? parseInt(m[2], 10) : 0);
      var t = base;
      for (var i = 0; i < 2; i++) t = base - fusoOffsetMin("America/Sao_Paulo", new Date(t)) * 60000;
      var fmt = function (tz) { return new Intl.DateTimeFormat("pt-BR", { timeZone: tz,
        hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date(t)); };
      return fmt("America/Sao_Paulo") + " no Brasil (" + fmt("Europe/Amsterdam") + " na Holanda)";
    } catch (e) { return horaBR; }
  }

  function donoComercial() {
    var c = equipeLista().filter(function (m) { return (m.papeis || []).indexOf("comercial") >= 0; })[0];
    return c ? c.nome : "Carla";
  }
  // Convite do Google Agenda com a lead entre os convidados: é o convite
  // dela que faz a reunião existir na agenda das duas.
  function gcalReuniao(pessoaId) {
    var p = getPessoa(pessoaId);
    if (!p || !p.reuniao) return "";
    var r = p.reuniao;
    var d = (r.data || "").replace(/-/g, "");
    // "14:30" precisa virar T143000 — o parse antigo grudava hora e
    // minuto num número só e o link saía inválido para horas quebradas
    var hm = /^(\d{1,2}):?(\d{2})?/.exec(r.hora || "");
    var p2 = function (n) { return (n < 10 ? "0" : "") + n; };
    var ini, fim;
    if (hm) {
      var hh = parseInt(hm[1], 10), mn = hm[2] ? parseInt(hm[2], 10) : 0;
      var dur = parseInt(r.duracao, 10) || 45;
      var fimMin = hh * 60 + mn + dur;
      ini = d + "T" + p2(hh) + p2(mn) + "00";
      fim = d + "T" + p2(Math.floor(fimMin / 60) % 24) + p2(fimMin % 60) + "00";
    } else { ini = d; fim = d; }
    var det = ["Conversa de matrícula · Inglês sem Roteiro",
      p.whatsapp ? "WhatsApp: " + p.whatsapp : "",
      p.turma ? "Turma de interesse: " + p.turma : "",
      p.nivel ? "Nível: " + p.nivel : ""].filter(Boolean).join("\n");
    return "https://calendar.google.com/calendar/render?action=TEMPLATE"
      + "&text=" + encodeURIComponent("Conversa de matrícula · " + p.nome)
      + "&dates=" + ini + "/" + fim
      + "&ctz=America/Sao_Paulo"
      + "&details=" + encodeURIComponent(det)
      + (p.email ? "&add=" + encodeURIComponent(p.email) : "");
  }
  function marcarReuniaoFeita(id) {
    var pes = getPessoa(id);
    // a tarefa da reunião se encerra junto: ela cumpriu o papel
    if (pes) {
      tarefasLista().forEach(function (tf) {
        if (!tf.feita && tf.titulo === "Conversa de matrícula: " + pes.nome) setTarefaFeita(tf.id, true);
      });
    }
    return mutate(id, function (p) {
      if (p.reuniao) p.reuniao.feita = true;
      pushHist(p, "reuniao", "Reunião realizada");
    });
  }

  var PERFIS = [
    { id: "gestora", label: "Gestora", regras: null }, // null = todas
    { id: "comercial", label: "Comercial", regras: ["R1", "R2", "R5", "R12", "RT"] },
    { id: "operacao", label: "Operação", regras: ["R3", "R4", "R10", "RT"] },
    { id: "professora", label: "Professora", regras: ["RT"] }
  ];
  // Há quanto tempo o item espera. Três dias é o limiar em que a
  // escola passa a perder a conversa: parcela atrasada que ninguém
  // tocou, aluna que faltou e ninguém procurou. Item sem data não
  // inventa idade — devolve null, e a tela não mostra nada.
  var FILA_VELHO_DIAS = 3;
  function idadeNaFila(item) {
    var d = item && item.desde ? parseISO(item.desde) : null;
    if (!d) return { dias: null, label: "", velho: false };
    var n = daysBetween(d, today());
    if (n < 0) return { dias: 0, label: "hoje", velho: false };
    return { dias: n,
      label: n === 0 ? "hoje" : n === 1 ? "há 1 dia" : "há " + n + " dias",
      velho: n >= FILA_VELHO_DIAS };
  }

  function filaParaHoje(perfilId, donoNome) {
    var itens = [];
    var pessoas = loadPessoas();

    pessoas.forEach(function (p) {
      // ── leads: o funil tem regras próprias, que não são sinais de aluna ──
      if (p.status === "lead" && p.estagio !== "perdido") {
        if (p.estagio !== "incompleta" && p.proximoFollowup) {
          var d = parseISO(p.proximoFollowup);
          if (d && daysBetween(d, today()) >= 0) {
            itens.push({ regra: "R1", sinal: "followup_lead", dono: "Carla", urg: 1, icon: "", cor: "#348a8e",
              pessoaId: p.id, nome: p.nome,
              motivo: "Follow-up " + (daysBetween(d, today()) === 0 ? "vence hoje" : "venceu há " + daysBetween(d, today()) + "d"),
              acao: "Mensagem do estágio", tpl: "lead_followup",
              desde: p.proximoFollowup || "" });
          }
        }
        // Inscrição incompleta não entra na fila: o estágio é um
        // estacionamento deliberado, não uma pendência do dia.
      }

      // ── alunas: os sinais do catálogo único, filtrados pelos acionáveis ──
      if (p.status === "aluna" || p.status === "mvs") {
        var mapaRegra = { parcela_atrasada: "R3", parcela_a_vencer: "R4", renovacao_aberta: "R5",
          onboarding_pendente: "R10", checkin_agendado: "RC", falta_recente: "R6",
          avaliacao_baixa: "R7" };
        sinaisDe(p).forEach(function (sn) {
          if (!sn.naCentral) return;
          itens.push({ regra: mapaRegra[sn.id] || sn.id, sinal: sn.id, dono: sn.dono, urg: sn.urg,
            icon: "", cor: sn.cor, pessoaId: p.id, nome: p.nome,
            motivo: sn.detalhe, acao: sn.acao, tpl: sn.tpl, toque: sn.toque || "",
            desde: sn.desde || "" });
        });
      }

      // ── ex-aluna reativável que completou 6 meses ──
      if (p.status === "ex-aluna" && p.saidaEm && !(p.saida && p.saida.reativavel === false)) {
        var m6 = daysBetween(parseISO(p.saidaEm), today());
        if (m6 >= 180) {
          itens.push({ regra: "R12", sinal: "reativar", dono: "Carla", urg: 5, icon: "", cor: "#b8ada0",
            pessoaId: p.id, nome: p.nome,
            motivo: "Saiu há " + Math.floor(m6 / 30) + " meses"
              + (p.motivoPerda ? " (" + p.motivoPerda.toLowerCase() + ")" : "") + " · elegível para reativação",
            // a espera começa quando ela ficou elegível (6 meses depois
            // da saída), não no dia em que saiu
            acao: "Reativar", tpl: "renov_abrir",
            desde: p.saidaEm ? somaDias(p.saidaEm, 180) : "" });
        }
      }
    });

    // ── folha da equipe: a equipe recebe todo dia 15 ──
    // Do dia do pagamento em diante, folha ainda não quitada vira item da
    // fila do financeiro, com link direto para a folha. O mês cobrado é o
    // do trabalho: com mesesDepois=1, em agosto paga-se a folha de julho.
    var cfgFolha = configPagamento();
    if (today().getDate() >= (cfgFolha.diaPagamento || 15)) {
      var dAlvo = today(); dAlvo.setDate(1);
      dAlvo.setMonth(dAlvo.getMonth() - (cfgFolha.mesesDepois || 0));
      var kAlvo = dAlvo.getFullYear() + "-" + ("0" + (dAlvo.getMonth() + 1)).slice(-2);
      var fpMes = folhaPagamento(kAlvo);
      var fpPend = fpMes.linhas.concat(fpMes.fixos || [])
        .filter(function (x) { return !pagamentoFeito(x.nome, fpMes.mes); });
      if (fpPend.length) {
        itens.push({ regra: "R4", sinal: "folha_dia15", dono: "Érika", urg: 1, icon: "", cor: "#9c6f56",
          pessoaId: "folha:" + fpMes.mes, nome: "Folha da equipe",
          motivo: "Pagamento da equipe: dia " + (cfgFolha.diaPagamento || 15) + " · " + fpPend.length
            + (fpPend.length === 1 ? " pagamento pendente" : " pagamentos pendentes")
            + " da folha de " + fpMes.mes.slice(5, 7) + "/" + fpMes.mes.slice(0, 4) + " ("
            + fpPend.map(function (x) { return firstName(x.nome); }).slice(0, 4).join(", ") + ")",
          href: "ISR%20-%20Folha%20v3.dc.html",
          acao: "Abrir a folha", tpl: "" });
      }
    }

    // pendências: sem prazo, entra na fila da pessoa desde a criação —
    // pendência mandada para alguém tem que aparecer, não esperar data;
    // com prazo, entra no dia (ou vencida)
    tarefasLista().forEach(function (tf) {
      if (tf.feita) return;
      var motivo;
      if (!tf.prazo) {
        motivo = "Pendência" + (tf.por ? " de " + tf.por : "")
          + (tf.detalhe ? " · " + tf.detalhe : "");
      } else {
        var dp = parseISO(tf.prazo);
        if (!dp || daysBetween(dp, today()) < 0) return;
        motivo = "Pendência " + (daysBetween(dp, today()) === 0 ? "para hoje" : "venceu " + ddmm(tf.prazo))
          + (tf.detalhe ? " · " + tf.detalhe : "");
      }
      itens.push({ regra: "RT", sinal: "pendencia_equipe", dono: tf.dono || "Gabi", urg: tf.prazo ? 1 : 3,
        icon: "", cor: "#9c6f56",
        pessoaId: "t:" + tf.id, tarefaId: tf.id, nome: tf.titulo,
        motivo: motivo.slice(0, 160),
        href: tf.pessoaId ? "ISR%20-%20Perfil%20v3.dc.html?id=" + tf.pessoaId : (tf.tela || ""),
        acao: "Concluir", tpl: "" });
    });

    // filtro por perfil
    var perfil = PERFIS.filter(function (pf) { return pf.id === perfilId; })[0];
    if (perfil && perfil.regras) itens = itens.filter(function (i) { return perfil.regras.indexOf(i.regra) >= 0; });
    // o dono das pendências vem da EQUIPE real (quem tem o papel), não de
    // nome fixo — e o casamento tolera nome completo ("Érika Lazaro"
    // combina com "Érika"), senão a pendência some da fila da pessoa
    var donoEquipe = function (papel) {
      var m = equipeLista().filter(function (x) { return (x.papeis || []).indexOf(papel) >= 0; })[0];
      return m ? m.nome : null;
    };
    var donoRT = perfilId === "comercial" ? (donoEquipe("comercial") || "Carla")
      : (perfilId === "operacao" ? (donoEquipe("operacao") || "Érika")
        : (perfilId === "professora" ? donoNome : null));
    var mesmoNome = function (a, b) {
      var sa = semAcento(a || "").split(/\s+/)[0], sb = semAcento(b || "").split(/\s+/)[0];
      return !!sa && sa === sb;
    };
    if (donoRT) {
      itens = itens.filter(function (i) { return i.regra !== "RT" || mesmoNome(i.dono, donoRT); });
    }

    // adiar hoje tira da fila até amanhã — e vale também no Acompanhamento
    itens = itens.filter(function (i) { return !estaAdiado(i.sinal || i.regra, i.pessoaId); });

    // Urgência primeiro, idade depois. Ordenar só por idade — como no
    // desenho, onde a fila de exemplo é toda do mesmo tipo — põe uma
    // reativação elegível há 104 dias em cima de uma parcela que
    // venceu hoje. Dentro da mesma urgência, o que espera há mais
    // tempo vem antes: é o que a escola perde se continuar esperando.
    itens.sort(function (a, b) {
      if (a.urg !== b.urg) return a.urg - b.urg;
      var da = idadeNaFila(a).dias, db = idadeNaFila(b).dias;
      if (da === null && db === null) return 0;
      if (da === null) return 1;
      if (db === null) return -1;
      return db - da;
    });
    return itens;
  }
  // Adiar é uma decisão sobre o sinal, não sobre a tela: some da Central
  // e do Acompanhamento até amanhã. Nas Alunas continua visível, porque
  // lá é retrato da situação, não fila de trabalho.
  var ADIADOS_KEY = "isr_fila_adiados";
  function adiadosMapa() {
    try { return JSON.parse(localStorage.getItem(ADIADOS_KEY) || "{}"); } catch (e) { return {}; }
  }
  function adiarItem(sinalOuRegra, pessoaId) {
    var adiados = adiadosMapa();
    adiados[sinalOuRegra + ":" + pessoaId] = iso(today());
    localStorage.setItem(ADIADOS_KEY, JSON.stringify(adiados));
  }
  function estaAdiado(sinalOuRegra, pessoaId) {
    return adiadosMapa()[sinalOuRegra + ":" + pessoaId] === iso(today());
  }

  // ── METAS DO CICLO ────────────────────────────────────────────
  // ══════════════════════════════════════════════════════════════
  //  MATRÍCULAS DO CICLO
  //  ------------------------------------------------------------
  //  "Queremos 35 alunas no ciclo novo" é uma frase que só vira
  //  gestão quando dá para responder, a qualquer dia: quantas já
  //  entraram, de onde vieram, para que turma foram, quanto cada uma
  //  fechou — e se o ritmo de hoje chega em 35 até o fim.
  //
  //  Tudo isso já estava no cadastro, espalhado: a origem na entrada
  //  do lead, o nível na turma, o valor no contrato. Aqui vira uma
  //  leitura só.
  // ══════════════════════════════════════════════════════════════
  function nivelDaTurma(turmaLabel) {
    if (!turmaLabel) return "";
    if (/particular/i.test(turmaLabel)) return "Particular";
    var u = turmasLista().filter(function (t) {
      return (t.nivel + " · " + t.turma) === turmaLabel || t.turma === turmaLabel;
    })[0];
    if (u) return u.nivel;
    // turma escrita à mão costuma vir como "Nível · horário"
    var partes = String(turmaLabel).split(" · ");
    return partes[0] || turmaLabel;
  }

  function matriculasDoCiclo(cfg) {
    cfg = cfg || {};
    var M = metasAtuais();
    var inicio = cfg.inicio || M.cicloInicio;
    var fim = cfg.fim || M.cicloFim || "";
    var hoje = iso(today());
    var dIni = parseISO(inicio) || today();
    var dFim = fim ? (parseISO(fim) || null) : null;

    var dentro = function (d) {
      if (!d) return false;
      if (d < inicio) return false;
      if (fim && d > fim) return false;
      return true;
    };

    var linhas = [];
    loadPessoas().forEach(function (p) {
      if (p.status !== "aluna" && p.status !== "mvs") return;
      // O ciclo se conta pelo dia em que o contrato foi FECHADO, não pelo
      // dia em que as aulas começam. A campanha de matrícula de 28/09 a
      // 23/10 fecha contratos cujas aulas só começam em 27/10 — contando
      // pela data de início, a tela mostraria zero durante a campanha
      // inteira, justo quando ela precisa ser acompanhada.
      var lista = p.contratos || [];
      var iOriginal = lista.length - 1;
      var original = lista[iOriginal];
      if (!original) return;
      if (!dentro(fechamentoDoContrato(p, iOriginal))) return;
      // renovação não é aluna nova: o contrato novo é de quem já estava
      var c = contratoVigente(p);
      var moeda = (c && c.moeda) || p.moeda || "R$";
      var pacote = c ? parseMoney(c.valorTotal) : 0;
      var mensal = c ? parseMoney(c.parcelaValor) : 0;
      var o = p.origem || {};
      linhas.push({
        id: p.id, nome: p.nome,
        entrouEm: p.entrouEm || "", desde: fechamentoDoContrato(p, iOriginal),
        // o dia em que as aulas começam, que quase nunca é o do fechamento
        inicioAulas: p.desde || "",
        // quanto tempo o CRM levou entre conhecer a pessoa e matricular
        diasAteFechar: (p.entrouEm && fechamentoDoContrato(p, iOriginal))
          ? Math.max(0, daysBetween(parseISO(p.entrouEm),
              parseISO(fechamentoDoContrato(p, iOriginal)))) : null,
        canal: o.canal || "—", detalhe: o.detalhe || "",
        turma: p.turma || "—", nivel: nivelDaTurma(p.turma),
        professora: p.professora || "",
        moeda: moeda, pacote: pacote, mensalidade: mensal,
        parcelas: c ? (c.parcelas || (c.meses || []).length) : 0,
        vendidoPor: p.vendidoPor || p.professora || "",
        status: p.status
      });
    });
    linhas.sort(function (a, b) { return a.desde < b.desde ? 1 : -1; });

    var zero = function () { return { "R$": 0, "€": 0 }; };
    var soma = function (acc, moeda, v) { if (acc[moeda] === undefined) acc[moeda] = 0; acc[moeda] += v; };

    var contratado = zero(), mensalidades = zero();
    var canais = {}, niveis = {}, turmas = {}, meses = {};
    linhas.forEach(function (l) {
      soma(contratado, l.moeda, l.pacote);
      soma(mensalidades, l.moeda, l.mensalidade);
      if (!canais[l.canal]) canais[l.canal] = { canal: l.canal, n: 0, valor: zero() };
      canais[l.canal].n++; soma(canais[l.canal].valor, l.moeda, l.pacote);
      var nv = l.nivel || "—";
      if (!niveis[nv]) niveis[nv] = { nivel: nv, n: 0 };
      niveis[nv].n++;
      if (!turmas[l.turma]) turmas[l.turma] = { turma: l.turma, n: 0 };
      turmas[l.turma].n++;
      var k = (l.desde || "").slice(0, 7);
      if (k) {
        if (!meses[k]) meses[k] = { key: k, label: mesLabelDe(k), n: 0, valor: zero() };
        meses[k].n++; soma(meses[k].valor, l.moeda, l.pacote);
      }
    });
    var ordena = function (obj) {
      return Object.keys(obj).map(function (k) { return obj[k]; })
        .sort(function (a, b) { return b.n - a.n; });
    };

    // ── o ritmo ──
    // Dias corridos desde o começo do ciclo e até o fim: é o que
    // transforma "faltam 31" em "faltam 31 em 9 semanas".
    var meta = parseInt(cfg.meta, 10) || M.matriculas || 0;
    var feitas = linhas.length;
    var faltam = Math.max(0, meta - feitas);
    var diasCorridos = Math.max(1, daysBetween(dIni, today()) + 1);
    var diasRestantes = dFim ? Math.max(0, daysBetween(today(), dFim)) : null;
    var porSemana = feitas / (diasCorridos / 7);
    var precisaPorSemana = (diasRestantes && faltam)
      ? faltam / Math.max(1, diasRestantes / 7) : null;
    var projecao = diasRestantes !== null
      ? Math.round(feitas + porSemana * (diasRestantes / 7)) : null;

    var metaMes = parseInt(M.matriculasMes, 10) || 0;
    if (!metaMes && dFim && meta) {
      // sem meta mensal combinada, a do ciclo dividida pelos meses dele
      var nMeses = Math.max(1, Math.round(daysBetween(dIni, dFim) / 30));
      metaMes = Math.ceil(meta / nMeses);
    }

    return {
      ciclo: M.cicloLabel, inicio: inicio, fim: fim,
      meta: meta, metaMes: metaMes,
      feitas: feitas, faltam: faltam,
      pct: meta ? Math.round((feitas / meta) * 100) : null,
      linhas: linhas,
      porCanal: ordena(canais), porNivel: ordena(niveis), porTurma: ordena(turmas),
      porMes: Object.keys(meses).sort().map(function (k) {
        var m = meses[k];
        m.meta = metaMes;
        m.bateu = metaMes ? m.n >= metaMes : null;
        return m;
      }),
      contratado: contratado, mensalidades: mensalidades,
      metaFaturamento: M.faturamento || zero(),
      diasCorridos: diasCorridos, diasRestantes: diasRestantes,
      porSemana: Math.round(porSemana * 10) / 10,
      precisaPorSemana: precisaPorSemana === null ? null : Math.round(precisaPorSemana * 10) / 10,
      projecao: projecao,
      // sem data de fim não há como projetar nada: a tela precisa saber
      semFim: !fim
    };
  }

  function progressoMetas() {
    var pessoas = loadPessoas();
    var M = metasAtuais();
    var ini = parseISO(M.cicloInicio);
    var matriculas = pessoas.filter(function (p) {
      return (p.status === "aluna" || p.status === "mvs") && p.desde && parseISO(p.desde) >= ini;
    }).length;
    var renovadas = pessoas.filter(function (p) { return p.renovacao === "renovada"; }).length;
    return { matriculas: matriculas, metaMatriculas: M.matriculas,
      renovacoes: renovadas, metaRenovacoes: M.renovacoes, ciclo: M.cicloLabel };
  }

  // ══════════════════════════════════════════════════════════════
  //  CAIXA (spec 9) — custos, projeção e conciliação de extrato
  //  Custos DEMO espelhando os comprovantes reais (Circle, BeConfident,
  //  DAS, tarifas Sicredi, GoCardless). Os oficiais virão do ISR
  //  Financeiro quando a Gabi conectar.
  // ══════════════════════════════════════════════════════════════
  var BASE_CUSTOS = [
    { nome: "Agência de tráfego", moeda: "R$", valor: 2800, categoria: "marketing" },
    { nome: "Circle (comunidade · US$ 99)", moeda: "R$", valor: 610, categoria: "ferramentas" },
    { nome: "BeConfident (IA de idiomas)", moeda: "R$", valor: 398, categoria: "ferramentas" },
    { nome: "Impostos (DAS)", moeda: "R$", valor: 81, categoria: "impostos" },
    { nome: "Tarifas bancárias (Sicredi)", moeda: "R$", valor: 29, categoria: "impostos" },
    { nome: "GoCardless (taxas de cobrança)", moeda: "€", valor: 36, categoria: "impostos" },
    { nome: "Assinaturas EU", moeda: "€", valor: 30, categoria: "ferramentas" }
  ];
  var CUSTOS_KEY = "isr_custos_v1";
  function custosLista() {
    try {
      var st = JSON.parse(localStorage.getItem(CUSTOS_KEY));
      if (st && st.length) return st;
    } catch (e) {}
    return BASE_CUSTOS.map(function (c) { return Object.assign({}, c); });
  }
  function custosSaveLocal(list) { try { localStorage.setItem(CUSTOS_KEY, JSON.stringify(list)); } catch (e) {} }
  function custosSave(list) { custosSaveLocal(list); agendarSync(); }
  function addCusto(nome, moeda, valor, categoria, inicio, fim) {
    var list = custosLista();
    list.push({ nome: nome, moeda: moeda, valor: valor, categoria: categoria || "outros",
      inicio: inicio || "", fim: fim || "" });
    custosSave(list);
  }
  // Vigência: um custo só conta nos meses em que a escola realmente pagou.
  // Sem início nem fim, vale sempre (é o caso da maioria).
  function vigenteNoMes(item, key) {
    if (item.inicio && key < item.inicio.slice(0, 7)) return false;
    if (item.fim && key > item.fim.slice(0, 7)) return false;
    return true;
  }
  function custosDoMes(key) {
    return custosLista().filter(function (c) { return vigenteNoMes(c, key); });
  }
  function updateCusto(idx, patch) {
    var list = custosLista();
    if (list[idx]) { Object.assign(list[idx], patch); custosSave(list); }
    return list;
  }
  function removeCusto(idx) {
    var list = custosLista();
    list.splice(idx, 1);
    custosSave(list);
  }
  // Tudo que sai no mês: os custos digitados mais a folha calculada.
  // Antes só somava os digitados, e a folha — o maior custo da escola —
  // ficava de fora de qualquer projeção.
  function custosTotais(key) {
    var k = key || mesAtualKey();
    var t = { "R$": 0, "€": 0 };
    custosDoMes(k).concat(folhaNoCaixa(k)).forEach(function (c) {
      if (t[c.moeda] === undefined) t[c.moeda] = 0;
      t[c.moeda] += c.valor;
    });
    return t;
  }

  // Projeção 90 dias, mês a mês e por moeda:
  //   esperado = parcelas do mês (pagas + a receber) · custos = fixos
  //   resultado = esperado − custos · saldo = acumulado
  function caixaDetalheMes(key) {
    var entradas = [];
    loadPessoas().forEach(function (p) {
      (p.contratos || []).forEach(function (c) {
        // a moeda é do contrato: uma aluna pode ter fechado em euro e ter
        // o cadastro em real. Somar pelo cadastro põe dinheiro no balde errado.
        var moeda = c.moeda || p.moeda || "R$";
        (c.meses || []).forEach(function (m) {
          if (m.key === key && m.valor)
            entradas.push({ pessoaId: p.id, nome: p.nome, moeda: moeda,
              valor: m.valor, valorNum: parseMoney(m.valor), pago: !!m.pago });
        });
      });
    });
    entradas.sort(function (a, b) { return (a.pago === b.pago) ? (b.valorNum - a.valorNum) : (a.pago ? -1 : 1); });
    // custosDoMes, não custosLista: custo com início e fim não vale em
    // todo mês. E a folha calculada entra aqui como saída.
    var saidas = custosDoMes(key).concat(folhaNoCaixa(key)).map(function (c) {
      return { nome: c.nome, moeda: c.moeda, valor: c.valor };
    });
    var tot = function (list, moeda, f) {
      return list.filter(function (x) { return x.moeda === moeda; })
        .reduce(function (a, x) { return a + f(x); }, 0);
    };
    return {
      entradas: entradas, saidas: saidas,
      recebidoBRL: tot(entradas, "R$", function (e) { return e.pago ? e.valorNum : 0; }),
      recebidoEUR: tot(entradas, "€", function (e) { return e.pago ? e.valorNum : 0; }),
      aReceberBRL: tot(entradas, "R$", function (e) { return e.pago ? 0 : e.valorNum; }),
      aReceberEUR: tot(entradas, "€", function (e) { return e.pago ? 0 : e.valorNum; }),
      saiuBRL: tot(saidas, "R$", function (s) { return s.valor; }),
      saiuEUR: tot(saidas, "€", function (s) { return s.valor; })
    };
  }

  function projecaoCaixa() {
    // Mês corrente + 2, contados da data de hoje. Antes eram os três
    // primeiros de MESES_COBRANCA, uma lista fixa que começa em julho:
    // a projeção mostrava julho, agosto e setembro em qualquer mês do
    // ano. Ninguém viu porque nenhuma tela usava esta função.
    var horizonte = mesesFinanceiro(0, 2).map(function (m) {
      return { key: m.key, label: m.label, curto: m.curto };
    });
    var custos = custosTotais();
    void custos;
    var recebidoPorMes = {}, previstoPorMes = {};
    horizonte.forEach(function (m) {
      recebidoPorMes[m.key] = { "R$": 0, "€": 0 };
      previstoPorMes[m.key] = { "R$": 0, "€": 0 };
    });
    getCobranca().forEach(function (c) {
      (c.meses || []).forEach(function (m) {
        if (!recebidoPorMes[m.key]) return;
        var v = parseMoney(m.valor || c.parcelaValor);
        if (m.pago) recebidoPorMes[m.key][c.moeda] += v;
        else previstoPorMes[m.key][c.moeda] += v;
      });
    });
    var saldo = { "R$": 0, "€": 0 };
    return horizonte.map(function (m) {
      var esperado = {
        "R$": recebidoPorMes[m.key]["R$"] + previstoPorMes[m.key]["R$"],
        "€": recebidoPorMes[m.key]["€"] + previstoPorMes[m.key]["€"]
      };
      var cst = custosTotais(m.key);
      var resultado = { "R$": esperado["R$"] - cst["R$"], "€": esperado["€"] - cst["€"] };
      saldo["R$"] += resultado["R$"]; saldo["€"] += resultado["€"];
      return { key: m.key, label: m.label, curto: m.curto,
        recebido: recebidoPorMes[m.key], previsto: previstoPorMes[m.key],
        esperado: esperado, custos: { "R$": cst["R$"], "€": cst["€"] },
        resultado: resultado, saldoAcumulado: { "R$": saldo["R$"], "€": saldo["€"] } };
    });
  }

  // Parser de extrato (v1: uma transação por linha, colada do banco):
  // "dd/mm/aaaa ; descrição ; valor" — valor negativo = saída.
  // Aceita 1.234,56 e 1234.56.
  // Um extrato exportado é uma TABELA, não uma frase. Quando há linha de
  // títulos, ler por coluna é certo; caçar números na linha é chute. O do
  // Asaas, por exemplo, tem id da transação (1925765296), valor (864.32) e
  // saldo (1628.98) na mesma linha — e usa ponto decimal.
  // A ordem dos termos é a ordem de preferência, e ela precisa ganhar da
  // ordem das colunas: o extrato do bunq tem "Counterparty" (o IBAN) antes
  // de "Name" e "Description", e varrendo coluna a coluna a descrição de
  // toda transação virava um número de conta sem dono.
  function colunaPorTitulo(cels, termos) {
    for (var j = 0; j < termos.length; j++) {
      for (var i = 0; i < cels.length; i++) {
        var s = semAcento(cels[i]);
        if (s === termos[j] || s.indexOf(termos[j]) === 0) return i;
      }
    }
    return -1;
  }

  // "864.32" é oitocentos e sessenta e quatro no Asaas e oitocentos e
  // sessenta e quatro mil na planilha brasileira. Quem decide é o arquivo
  // inteiro, não a célula.
  function detectarDecimal(valores) {
    var comVirgula = 0, comPonto = 0;
    valores.forEach(function (v) {
      var s = String(v).trim();
      if (/,\d{1,2}$/.test(s)) comVirgula++;
      else if (/\.\d{1,2}$/.test(s)) comPonto++;
    });
    return comVirgula >= comPonto ? "," : ".";
  }
  function parseNumero(str, decimal) {
    if (str === undefined || str === null) return NaN;
    var s = String(str).trim().replace(/\s/g, "");
    if (!s) return NaN;
    var neg = s.indexOf("-") >= 0 || /^\(.*\)$/.test(s);
    s = s.replace(/[^\d,\.]/g, "");
    if (!s) return NaN;
    if (decimal === ",") s = s.replace(/\./g, "").replace(",", ".");
    else s = s.replace(/,/g, "");
    var v = parseFloat(s);
    if (isNaN(v)) return NaN;
    return neg ? -Math.abs(v) : v;
  }

  // As planilhas da escola têm células com TEXTO LONGO e quebras de linha
  // dentro (a história da pessoa, a frase real). Copiado, isso vira aspas
  // com \n no meio — e um leitor ingênuo transforma cada pedaço numa
  // "linha" da planilha. Era assim que "€ 90 a 130 mensais…" virava lead.
  // Aqui, quebra de linha dentro de aspas vira espaço; o resto fica.
  function normalizarPlanilha(texto) {
    var s = String(texto || "").replace(/\r/g, "");
    var out = "", dentro = false;
    for (var i = 0; i < s.length; i++) {
      var ch = s[i];
      if (ch === '"') {
        if (dentro && s[i + 1] === '"') { out += '"'; i++; continue; }
        dentro = !dentro; continue;
      }
      if (ch === "\n" && dentro) { out += " "; continue; }
      out += ch;
    }
    // aspa desbalanceada não pode engolir a planilha inteira numa linha só:
    // nesse caso, melhor ler como sempre foi
    if (dentro) return s;
    return out;
  }

  // Divide uma linha de arquivo exportado respeitando aspas: no CSV do
  // Wise, "Sent money to X, Y" é UMA célula, não duas.
  function separarExtratoLinha(l, delim) {
    if (delim === "\t") return l.split("\t");
    var out = [], cur = "", dentro = false;
    for (var i = 0; i < l.length; i++) {
      var ch = l[i];
      if (ch === '"') {
        if (dentro && l[i + 1] === '"') { cur += '"'; i++; }
        else dentro = !dentro;
      } else if (ch === delim && !dentro) { out.push(cur); cur = ""; }
      else cur += ch;
    }
    out.push(cur);
    return out;
  }

  function parseExtrato(texto) {
    var cru = String(texto || "").split("\n");

    // ── caminho 1: tabela com linha de títulos ────────────────
    // Cada banco fala uma língua e o arquivo é o mesmo: colunas com
    // título. Asaas em português (Data/Valor), Wise e Stripe em inglês
    // (Date ou Created / Amount), bunq em holandês (Datum/Bedrag).
    // Colado é tab; arquivo .csv é vírgula ou ponto e vírgula.
    var COL_DATA = ["data", "date", "datum", "created", "criado"];
    var COL_VALOR = ["valor", "amount", "bedrag", "bruto"];
    var iCab = -1, cab = null, delim = "\t";
    var DELIMS = ["\t", ";", ","];
    var temAlgum = function (linha, termos) {
      for (var t = 0; t < termos.length; t++) if (linha.indexOf(termos[t]) >= 0) return true;
      return false;
    };
    for (var i = 0; i < Math.min(cru.length, 15) && iCab < 0; i++) {
      var s = semAcento(cru[i]);
      if (!(temAlgum(s, COL_DATA) && temAlgum(s, COL_VALOR))) continue;
      for (var di = 0; di < DELIMS.length; di++) {
        var cels = separarExtratoLinha(cru[i], DELIMS[di]);
        if (cels.length >= 3) { iCab = i; cab = cels; delim = DELIMS[di]; break; }
      }
    }

    if (iCab >= 0) {
      var col = {
        data: colunaPorTitulo(cab, COL_DATA),
        // "quem pagou" tem nome diferente em cada banco: descrição no
        // Asaas, omschrijving/naam no bunq, customer no Stripe
        desc: colunaPorTitulo(cab, ["descricao", "historico", "descrição", "description",
          "omschrijving", "customer", "merchant", "payer"]),
        // o nome de quem mandou ou recebeu vem em coluna separada no bunq, e
        // muitas vezes é a única coisa que identifica a pessoa: a descrição
        // vem vazia e sobra o IBAN
        nome: colunaPorTitulo(cab, ["name", "naam", "counterparty"]),
        valor: colunaPorTitulo(cab, COL_VALOR),
        tipo: colunaPorTitulo(cab, ["tipo do lancamento", "tipo de lancamento", "d/c", "transaction type"]),
        moeda: colunaPorTitulo(cab, ["moeda", "currency"]),
        // o id que o gateway dá à transação é a identidade dela: é o que
        // permite importar o mesmo extrato duas vezes sem duplicar nada
        id: colunaPorTitulo(cab, ["transacao", "id"]),
        // O relatório do Stripe traz o e-mail de quem pagou numa coluna
        // própria. É o dado que casa com a aluna sem depender de nome
        // escrito igual nem de valor exato — e estava sendo descartado.
        email: colunaPorTitulo(cab, ["customer email", "e-mail do cliente", "email", "e-mail"]),
        // Cobrança que falhou aparece no mesmo relatório da que foi paga.
        // Sem olhar o status, a tentativa recusada entra como receita.
        status: colunaPorTitulo(cab, ["status", "situacao"])
      };
      if (col.valor >= 0) {
        var MOEDA_COD = { brl: "R$", eur: "€", "r$": "R$", "€": "€" };
        var linhas = [];
        cru.slice(iCab + 1).forEach(function (ln) {
          var c = separarExtratoLinha(ln, delim);
          var bruto = (c[col.valor] || "").trim();
          var dt = (c[col.data] || "").trim();
          // "Saldo Inicial" e "Saldo Final" não são transações
          if (!dt || !bruto) return;
          if (!/\d{2}[\/-]\d{2}/.test(dt)) return;
          // nome e descrição juntos, sem repetir: no bunq um dos dois quase
          // sempre está vazio, e é o outro que diz de quem é a linha
          var partes = [];
          if (col.nome >= 0 && (c[col.nome] || "").trim()) partes.push((c[col.nome] || "").trim());
          if (col.desc >= 0 && (c[col.desc] || "").trim()) partes.push((c[col.desc] || "").trim());
          var junta = partes.length === 2 && semAcento(partes[1]).indexOf(semAcento(partes[0])) === 0
            ? partes[1] : partes.join(" · ");
          // o e-mail vai junto da descrição: é por ele que a primeira
          // passada da conciliação encontra a aluna
          var mail = col.email >= 0 ? (c[col.email] || "").trim() : "";
          if (mail && junta.indexOf(mail) < 0) junta = (junta ? junta + " · " : "") + mail;
          // cobrança recusada, estornada ou pendente não é dinheiro que
          // entrou: fica fora do extrato lido
          var st = col.status >= 0 ? semAcento(c[col.status] || "") : "";
          if (/^(failed|refunded|canceled|cancelled|requires_|pending|incomplete|expirad|falh|recusad|estornad)/.test(st)) return;
          linhas.push({ dt: dt, bruto: bruto,
            desc: junta,
            tipo: col.tipo >= 0 ? semAcento(c[col.tipo] || "") : "",
            moeda: col.moeda >= 0 ? semAcento(c[col.moeda] || "") : "",
            idExterno: col.id >= 0 ? (c[col.id] || "").trim() : "" });
        });
        var dec = detectarDecimal(linhas.map(function (x) { return x.bruto; }));
        return linhas.map(function (x) {
          var v = parseNumero(x.bruto, dec);
          if (isNaN(v)) v = 0;
          // a coluna Crédito/Débito manda no sinal quando existe
          // ("debit"/"credit" cobre débito/crédito e DEBIT/CREDIT)
          if (x.tipo.indexOf("debit") >= 0) v = -Math.abs(v);
          else if (x.tipo.indexOf("credit") >= 0) v = Math.abs(v);
          // O bunq escreve 2026-08-01. Sem tratar o ano na frente, a busca
          // achava "26-08-01" no meio da string e lia 26 de agosto de 2001:
          // toda linha do bunq entrava em outro ano, e nunca casava com o mês.
          var iso = x.dt.match(/(\d{4})-(\d{2})-(\d{2})/);
          var d = iso ? null : x.dt.match(/(\d{2})[\/-](\d{2})[\/-](\d{2,4})/);
          var data = iso ? (iso[3] + "/" + iso[2] + "/" + iso[1])
            : (d ? (d[1] + "/" + d[2] + "/" + (d[3].length === 2 ? "20" + d[3] : d[3])) : x.dt);
          // Converter real em euro dentro da própria conta não é receita
          // nem despesa: o dinheiro continua da escola, só trocou de moeda.
          var interna = /^(converted|convers[aã]o)\b/i.test(x.desc);
          return { data: data, descricao: x.desc || "(sem descrição)", valor: v,
            colunaSaldo: false, ambiguo: false, deTabela: true,
            moeda: MOEDA_COD[x.moeda] || "", interna: interna,
            idExterno: x.idExterno || "" };
        });
      }
    }

    // ── caminho 2: texto solto, um lançamento por linha ───────
    var soltas = [];
    cru.forEach(function (linha) {
      var l = linha.trim();
      if (!l) return;
      var m = l.match(/(\d{2})\/(\d{2})\/(\d{4})/)
           || l.match(/(\d{2})\/(\d{2})\/(\d{2})(?!\d)/)
           || l.match(/(\d{4})-(\d{2})-(\d{2})/);
      var data = "";
      if (m) {
        if (m[0].indexOf("-") >= 0) data = m[3] + "/" + m[2] + "/" + m[1];
        else data = m[1] + "/" + m[2] + "/" + (m[3].length === 2 ? "20" + m[3] : m[3]);
      }
      var tokens = l.match(/-?\(?\d{1,3}(?:\.\d{3})*,\d{2}\)?|-?\(?\d+\.\d{2}\)?|-?\(?\d+,\d{2}\)?/g);
      if (!tokens || !tokens.length) return;
      soltas.push({ l: l, data: data, dataBruta: m ? m[0] : "", tokens: tokens });
    });
    if (!soltas.length) return [];

    // Muitos extratos trazem o saldo na última coluna. Pegar o último
    // número faria o app registrar o saldo como se fosse a transação. Se
    // o último número varia de uma linha para a outra exatamente pelo
    // valor do anterior, é saldo — e o valor é o penúltimo.
    var usaPenultimo = false, decidiu = false;
    var comDois = soltas.filter(function (x) { return x.tokens.length >= 2; });
    if (comDois.length >= 2) {
      var acertos = 0, testes = 0;
      for (var k = 1; k < comDois.length; k++) {
        var antes = parseMoney(comDois[k - 1].tokens[comDois[k - 1].tokens.length - 1]);
        var agora = parseMoney(comDois[k].tokens[comDois[k].tokens.length - 1]);
        var mov = parseMoney(comDois[k].tokens[comDois[k].tokens.length - 2]);
        if (!mov) continue;
        testes++;
        if (Math.abs(Math.abs(agora - antes) - Math.abs(mov)) < 0.02) acertos++;
      }
      usaPenultimo = testes >= 2 && acertos >= Math.ceil(testes * 0.7);
      decidiu = testes >= 2;
    }

    return soltas.map(function (x) {
      var idx = (usaPenultimo && x.tokens.length >= 2) ? x.tokens.length - 2 : x.tokens.length - 1;
      var raw = x.tokens[idx];
      var v = parseMoney(raw);
      var negativo = raw.indexOf("-") === 0 || raw.indexOf("(") === 0
        || /\bD\b\s*$/.test(x.l) || /d[ée]bito|pagamento para|pago para|saque|tarifa/i.test(x.l);
      v = negativo ? -Math.abs(v) : Math.abs(v);
      var desc = x.l.replace(x.dataBruta, "");
      x.tokens.forEach(function (tk) { desc = desc.replace(tk, ""); });
      desc = desc.replace(/^[;|,\s]+|[;|,\s]+$/g, "").replace(/\s{2,}/g, " ").trim();
      // Com poucas linhas não dá para saber se o último número é saldo ou
      // transação. Em vez de escolher em silêncio, a linha vai marcada.
      var ambiguo = x.tokens.length >= 2 && !decidiu;
      return { data: x.data, descricao: desc || "(sem descrição)", valor: v,
        colunaSaldo: usaPenultimo, ambiguo: ambiguo, deTabela: false,
        outrosValores: ambiguo ? x.tokens.map(function (tk) { return parseMoney(tk); }) : null };
    });
  }

  // Conciliação: para cada CRÉDITO do extrato, procura parcela em aberto
  // com o mesmo valor (±0,60) na mesma moeda; nome na descrição desempata.
  // ── REGISTRO DO EXTRATO ───────────────────────────────────────
  //
  // Num sistema financeiro, importar é idempotente: cada transação externa
  // tem uma identidade, e processá-la duas vezes não cria nada duas vezes.
  // Sem isto, colar o mesmo extrato de novo sugeria conciliar tudo de novo
  // e deixava lançar a mesma despesa duas vezes — o jeito mais fácil de
  // perder a confiança nos números.
  // ── CONTAS PRÓPRIAS ───────────────────────────────────────────
  //
  // "GF Education" é a empresa dela na Holanda; mandar dinheiro para lá
  // não é despesa — é o mesmo dinheiro trocando de bolso. A escola marca
  // uma vez quem é "conta própria" e o extrato passa a reconhecer sozinho.
  // Conta própria não é uma coisa só. Dinheiro indo de uma empresa da
  // escola para outra continua sendo da escola. Dinheiro indo para a
  // conta pessoal da dona saiu da escola — não é despesa, mas é
  // retirada, e precisa aparecer.
  //
  // Guardado como {nome, tipo}. A lista antiga era só de nomes: ela é
  // lida do mesmo jeito e o tipo é deduzido do nome até alguém dizer.
  var CONTAS_PROPRIAS_KEY = "isr_contas_proprias_v1";
  function pareceEmpresa(nome) {
    return /\bltda\b|\bme\b|\bmei\b|eireli|\bs\.?a\b|\bllc\b|\binc\b|education|comercio|servicos|holding|company/
      .test(semAcento(nome || ""));
  }
  function contasProprias() {
    var bruto = [];
    try { bruto = JSON.parse(localStorage.getItem(CONTAS_PROPRIAS_KEY)) || []; } catch (e) { bruto = []; }
    return bruto.map(function (x) {
      if (typeof x === "string") return { nome: x, tipo: pareceEmpresa(x) ? "empresa" : "pessoal" };
      return { nome: x.nome, tipo: x.tipo === "pessoal" ? "pessoal" : "empresa" };
    }).filter(function (x) { return x.nome; });
  }
  function contasPropriasSalvar(l) {
    try { localStorage.setItem(CONTAS_PROPRIAS_KEY, JSON.stringify(l)); } catch (e) {}
    agendarSync();
    return l;
  }
  function addContaPropria(nome, tipo) {
    var s = semAcento(nome || "").trim();
    if (!s || s.length < 3) return contasProprias();
    var t = tipo === "pessoal" ? "pessoal" : (tipo === "empresa" ? "empresa"
      : (pareceEmpresa(s) ? "empresa" : "pessoal"));
    var l = contasProprias();
    var achada = l.filter(function (x) { return x.nome === s; })[0];
    if (achada) { achada.tipo = t; return contasPropriasSalvar(l); }
    l.push({ nome: s, tipo: t });
    return contasPropriasSalvar(l);
  }
  function removerContaPropria(nome) {
    var s = semAcento(nome || "").trim();
    return contasPropriasSalvar(contasProprias().filter(function (x) { return x.nome !== s; }));
  }
  // "empresa", "pessoal" ou "" quando a descrição não é de conta sua.
  function tipoDaContaPropria(descricao) {
    var d = semAcento(descricao || "");
    var achada = contasProprias().filter(function (x) {
      return x.nome.length >= 3 && d.indexOf(x.nome) >= 0;
    })[0];
    return achada ? achada.tipo : "";
  }
  // O Stripe põe o e-mail de quem pagou na descrição da cobrança
  // ("Subscription payment for offers: #3315658 [ISR] Aulas em Grupo -
  // PARCELADO - maria@gmail.com"). O e-mail é o identificador mais
  // confiável que existe aqui: nome vem abreviado ou com o sobrenome do
  // marido, valor muda com a taxa do gateway — e-mail não muda.
  //
  // A exigência de ponto e domínio no fim descarta o e-mail cortado por
  // um export ("maria@gm..."): melhor não reconhecer do que reconhecer
  // a pessoa errada.
  function emailDaTransacao(t) {
    if (!t) return "";
    var direto = String(t.email || "").trim().toLowerCase();
    if (direto.indexOf("@") > 0) return direto;
    var m = String(t.descricao || "").match(/[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/i);
    return m ? m[0].toLowerCase() : "";
  }

  // Parte do extrato chega sem nome nenhum: a linha traz só o número da
  // conta que mandou o dinheiro ("NL29BUNQ2193982112"). Cadastrar isso
  // como aluna criaria uma pessoa chamada NL29BUNQ2193982112; ignorar
  // faria o mesmo número voltar todo mês.
  //
  // O caminho é dizer uma vez de quem é a conta. A partir daí o número
  // identifica a pessoa como um e-mail identificaria.
  var IDENT_KEY = "isr_ident_extrato_v1";
  function identDaTransacao(t) {
    var d = String((t && t.descricao) || "").trim();
    var iban = d.match(/\b[A-Z]{2}\d{2}[A-Z0-9]{8,26}\b/i);
    if (iban) return iban[0].toUpperCase();
    // uma descrição que é só número (conta, agência, id do banco)
    var so = d.replace(/[\s.\/-]/g, "");
    if (so.length >= 8 && /^\d+$/.test(so)) return so;
    return "";
  }
  // A descrição não tem nome de gente: é número de conta, sem letra que
  // forme palavra. Serve para a tela não oferecer "cadastrar" um IBAN.
  function ehSoIdentificador(descricao) {
    var d = String(descricao || "").trim();
    if (!d) return false;
    if (!identDaTransacao({ descricao: d })) return false;
    return !/[A-Za-zÀ-ú]{4,}/.test(d.replace(/\b[A-Z]{2}\d{2}[A-Z0-9]{8,26}\b/gi, " "));
  }
  // A descrição do extrato não é nome de gente. Isso precisava ser uma
  // pergunta com resposta boa: o único filtro era IBAN, e linhas como
  // "bunq Payday 2026-08-19 EUR" e "Cashback" passavam — viraram alunas
  // no cadastro, com ficha, cobrança e tudo.
  //
  // O teste é positivo, não uma lista de proibidos: para ser nome de
  // pessoa, a descrição não pode ter número, não pode ser termo de
  // banco, e precisa de pelo menos uma palavra de verdade.
  var TERMOS_NAO_PESSOA = [
    // o que o banco faz
    "payday", "cashback", "invoice", "fee", "fees", "interest", "payout",
    "refund", "chargeback", "settlement", "adjustment", "reversal",
    "taxa", "taxas", "tarifa", "juros", "rendimento", "saldo", "estorno",
    "reembolso", "devolucao", "mensalidade", "anuidade", "iof", "imposto",
    "transferencia", "transfer", "pagamento", "payment", "deposito", "saque",
    "pix", "ted", "doc", "boleto", "cobranca", "recebida", "enviada",
    "conversao", "converted", "conversion", "cambio", "exchange",
    "subscription", "assinatura", "credito", "debito", "lancamento",
    // de quem ele vem
    "bunq", "stripe", "wise", "transferwise", "gocardless", "asaas",
    "paypal", "revolut", "nubank", "mercado pago", "mercadopago", "pagseguro",
    "banco", "bank", "caixa economica", "sicredi", "itau", "bradesco",
    "santander", "inter", "c6", "klarna", "adyen", "hotmart", "kiwify",
    "eduzz", "systeme", "greenn"
  ];
  function pareceNomeDePessoa(descricao) {
    var d = String(descricao || "").trim();
    if (d.length < 3) return false;
    // número dentro do texto quase nunca é nome: é data, valor, conta,
    // CNPJ ou id de transação
    if (/\d/.test(d)) return false;
    // endereço de site e descritor de cartão ("ANTHROPIC* CLAUDE SUB"):
    // nome de gente não tem .com nem asterisco
    if (/\.(com|net|org|io|co|br|nl|pt|es|de|uk)\b/i.test(d)) return false;
    if (d.indexOf("*") >= 0) return false;
    var s = semAcento(d);
    for (var i = 0; i < TERMOS_NAO_PESSOA.length; i++) {
      var t = TERMOS_NAO_PESSOA[i];
      if (t.indexOf(" ") >= 0 ? s.indexOf(t) >= 0
                              : new RegExp("\\b" + t + "\\b").test(s)) return false;
    }
    // sobrou pelo menos uma palavra com cara de nome
    return /[A-Za-zÀ-ú]{3,}/.test(d);
  }

  // Quem já entrou no cadastro vindo de uma linha de extrato. Não dá
  // para desfazer o que foi criado antes deste filtro existir, mas dá
  // para encontrar e oferecer a remoção: são pessoas sem contato, sem
  // contrato e com nome que nenhum filtro de hoje aceitaria.
  function pessoasQueParecemExtrato() {
    return loadPessoas().filter(function (p) {
      if (pareceNomeDePessoa(p.nome)) return false;
      if (p.email || p.whatsapp) return false;
      if ((p.contratos || []).length) return false;
      return true;
    }).map(function (p) {
      return { id: p.id, nome: p.nome, status: p.status,
        entrouEm: p.entrouEm || p.desde || "",
        canal: (p.origem && p.origem.canal) || "" };
    });
  }
  function removerPessoasQueParecemExtrato() {
    var lista = pessoasQueParecemExtrato();
    if (!lista.length) return { removidas: 0 };
    criarBackup("antes de remover linhas de extrato viradas pessoa");
    var ids = {};
    lista.forEach(function (x) { ids[x.id] = true; });
    var restam = loadPessoas().filter(function (p) { return !ids[p.id]; });
    savePessoas(restam);
    return { removidas: lista.length, nomes: lista.map(function (x) { return x.nome; }) };
  }

  // ══════════════════════════════════════════════════════════════
  //  MATRÍCULA ANUNCIADA NO SLACK
  //  ------------------------------------------------------------
  //  A Carla anuncia cada matrícula nova no canal #admin, num bloco
  //  com sempre os mesmos campos. Esse bloco é o contrato combinado:
  //  nome, contato, turma, horário, início, pacote, forma de pagamento
  //  e sinal. Redigitar tudo no sistema é o trabalho que some aqui.
  //
  //  O texto é colado, lido e MOSTRADO antes de virar dado. Quem
  //  confere é a Gabi, não o leitor: onde a mensagem é ambígua — a
  //  moeda, principalmente — a linha vem com aviso em vez de palpite.
  // ══════════════════════════════════════════════════════════════
  var SLACK_CABECALHO = /\[\s*nova\s+matr[ií]cula\s*[-–—:]?\s*([^\]]*)\]/i;

  function slackCampo(bloco, nomes) {
    for (var i = 0; i < nomes.length; i++) {
      var re = new RegExp("(?:^|\\n)[\\s•·*\\-]*" + nomes[i] + "\\s*:?\\s*\\**\\s*([^\\n]+)", "i");
      var m = bloco.match(re);
      if (m && m[1]) {
        var v = m[1].replace(/\*/g, "").trim();
        if (v) return v;
      }
    }
    return "";
  }
  // o Slack embrulha link e e-mail: <mailto:x@y|x@y>, <tel:+31|+31 6>
  function slackLimpo(txt) {
    return String(txt || "")
      .replace(/<mailto:([^|>]+)(\|[^>]*)?>/gi, "$1")
      .replace(/<tel:([^|>]+)(\|([^>]*))?>/gi, function (t, a, b, c) { return c || a; })
      .replace(/<https?:\/\/[^|>]+(\|[^>]*)?>/gi, "");
  }

  // "3 X 497,00" · "3 X 85 euros" · "Á vista 255 euros" · "4x R$ 741,25"
  function slackPagamento(txt) {
    var s = slackLimpo(txt);
    var out = { parcelas: 0, valor: 0, moeda: "", avista: false, bruto: s };
    if (/\ba\s*vista\b|\bà\s*vista\b|\bá\s*vista\b/i.test(semAcento(s))) { out.avista = true; out.parcelas = 1; }
    var m = s.match(/(\d+)\s*[xX]\s*(?:R\$|€|EUR|BRL)?\s*([\d.]+(?:,\d{2})?)/);
    if (m) { out.parcelas = parseInt(m[1], 10) || 0; out.valor = parseMoney(m[2]); }
    else {
      var v = s.match(/([\d.]+(?:,\d{2})?)/);
      if (v) out.valor = parseMoney(v[1]);
    }
    if (/€|\beur\b|\beuros?\b/i.test(s)) out.moeda = "€";
    else if (/R\$|\breais?\b|\bbrl\b/i.test(s)) out.moeda = "R$";
    return out;
  }

  function slackData(txt, hoje) {
    var s = String(txt || "").trim();
    var m = s.match(/(\d{1,2})\s*\/\s*(\d{1,2})(?:\s*\/\s*(\d{2,4}))?/);
    if (!m) return "";
    var dia = ("0" + m[1]).slice(-2), mes = ("0" + m[2]).slice(-2);
    var ano = m[3] ? (m[3].length === 2 ? "20" + m[3] : m[3])
      : String((hoje || today()).getFullYear());
    return ano + "-" + mes + "-" + dia;
  }

  function slackDiaVenc(bloco) {
    var s = semAcento(bloco);
    var m = s.match(/vencimento[^\n]*?dia\s*(\d{1,2})/i)
         || s.match(/melhor data para pagamento[^\n]*?dia\s*(\d{1,2})/i)
         || s.match(/pagamento[^\n]*?todo\s*dia\s*(\d{1,2})/i);
    return m ? parseInt(m[1], 10) : 0;
  }

  function lerMatriculasSlack(texto) {
    var t = String(texto || "");
    if (!t.trim()) return { ok: false, linhas: [], erro: "Cole as mensagens do canal antes de ler." };
    // cada bloco começa num cabeçalho [NOVA MATRÍCULA - ...]
    var partes = t.split(/(?=\[\s*NOVA\s+MATR[IÍ]CULA)/i).filter(function (x) {
      return SLACK_CABECALHO.test(x);
    });
    if (!partes.length) return { ok: false, linhas: [],
      erro: "Nenhuma mensagem de matrícula encontrada. Copie as mensagens que começam com [NOVA MATRÍCULA." };

    var hoje = today();
    var linhas = partes.map(function (bruto) {
      var bloco = slackLimpo(bruto);
      var apelido = (bloco.match(SLACK_CABECALHO) || [])[1] || "";
      var nome = slackCampo(bloco, ["nome completo", "nome"]) || apelido.trim();
      var email = slackCampo(bloco, ["e-?mail", "email", "endereco eletronico"]);
      if (!email) {
        var em = bloco.match(/[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/i);
        email = em ? em[0] : "";
      }
      var pag = slackPagamento(slackCampo(bloco, ["forma de pagamento", "pagamento"]));
      var turma = slackCampo(bloco, ["turma"]);
      var horario = slackCampo(bloco, ["hor[aá]rio"]);
      var inicio = slackData(slackCampo(bloco, ["data de in[ií]cio", "in[ií]cio"]), hoje);
      var pacote = slackCampo(bloco, ["pacote"]);
      var sinalM = bloco.match(/sinal[^\n]*?([\d.]+(?:,\d{2})?)/i);
      var s = semAcento(bloco);
      var tipo = /automatricula|auto matricula/.test(s) ? "automatrícula"
        : (/matricula tradicional/.test(s) ? "tradicional" : "");

      var avisos = [];
      if (!nome) avisos.push("sem nome");
      if (!email) avisos.push("sem e-mail");
      if (!pag.valor) avisos.push("forma de pagamento não reconhecida");
      // a moeda é o campo que mais engana: "3 X 85" pode ser euro ou real,
      // e errar aqui põe o valor errado no Caixa pelo ciclo inteiro
      if (pag.valor && !pag.moeda) avisos.push("moeda não informada na mensagem");
      if (!turma) avisos.push("sem turma");
      if (!inicio) avisos.push("sem data de início");

      var jaExiste = (email ? pessoaPorContato(email, "") : null) || pessoaPorNome(nome);
      return {
        nome: nome, email: email,
        whatsapp: slackCampo(bloco, ["telefone", "celular", "cel", "tel", "whatsapp"]),
        endereco: slackCampo(bloco, ["endere[cç]o", "end", "rua"]),
        cpf: slackCampo(bloco, ["cpf"]), rg: slackCampo(bloco, ["rg"]),
        turma: turma, nivel: turma, horario: horario,
        inicio: inicio, pacote: pacote,
        parcelas: pag.parcelas, valorParcela: pag.valor, moeda: pag.moeda,
        avista: pag.avista, pagamentoBruto: pag.bruto,
        sinal: sinalM ? parseMoney(sinalM[1]) : 0,
        vencDia: slackDiaVenc(bloco), tipo: tipo,
        jaExiste: !!jaExiste, pessoaId: jaExiste ? jaExiste.id : "",
        avisos: avisos, bloco: bloco.trim().slice(0, 600)
      };
    });

    return { ok: true, linhas: linhas,
      comAviso: linhas.filter(function (l) { return l.avisos.length; }).length,
      jaNoSistema: linhas.filter(function (l) { return l.jaExiste; }).length };
  }

  // Aplica o que foi conferido. Quem já está no sistema não é duplicado:
  // recebe os dados que faltavam. Linha sem nome ou sem valor não entra.
  function aplicarMatriculasSlack(leitura, opcoes) {
    if (!leitura || !leitura.ok) return { ok: false };
    opcoes = opcoes || {};
    var criadas = 0, atualizadas = 0, puladas = 0, semContrato = 0;
    leitura.linhas.forEach(function (l) {
      if (opcoes.somenteSemAviso && l.avisos.length) { puladas++; return; }
      if (!l.nome) { puladas++; return; }
      var moeda = l.moeda || opcoes.moedaPadrao || "R$";
      var p = l.pessoaId ? getPessoa(l.pessoaId) : null;
      if (!p) {
        p = novaPessoa({ nome: l.nome, email: l.email, whatsapp: l.whatsapp,
          moeda: moeda, canal: "Slack · #admin" });
        criadas++;
      } else {
        mutate(p.id, function (x) {
          if (l.email && !x.email) x.email = l.email;
          if (l.whatsapp && !x.whatsapp) x.whatsapp = l.whatsapp;
        });
        atualizadas++;
      }
      // endereço e documento entram na ficha, que é onde o contrato os lê
      if (l.cpf || l.rg || l.endereco) {
        mutate(p.id, function (x) {
          x.docs = x.docs || {};
          if (l.cpf && !x.docs.cpf) x.docs.cpf = l.cpf;
          if (l.rg && !x.docs.rg) x.docs.rg = l.rg;
          if (l.endereco && !x.docs.logradouro) x.docs.logradouro = l.endereco;
        });
      }
      if (!l.valorParcela || !l.parcelas) { semContrato++; return; }
      // já tem contrato: a matrícula do Slack não cria um segundo
      var atual = getPessoa(p.id);
      if ((atual.contratos || []).length) { semContrato++; return; }
      // O contrato foi fechado antes de as aulas começarem. Se elas ainda
      // não começaram, o fechamento é hoje; se já começaram, foi até lá.
      // Datar o fechamento pelo início das aulas jogaria a matrícula para
      // o ciclo seguinte.
      var hojeIso = iso(today());
      var fechado = (l.inicio && l.inicio < hojeIso) ? l.inicio : hojeIso;
      matricular(p.id, {
        parcelas: l.parcelas, valorParcela: fmtMoney(moeda, l.valorParcela),
        moeda: moeda, vencDia: l.vencDia || 10,
        turmaLabel: l.turma, fechadoEm: fechado,
        desde: l.inicio || undefined,
        inicioKey: l.inicio ? l.inicio.slice(0, 7) : undefined,
        sinalValor: l.sinal ? fmtMoney(moeda, l.sinal) : "",
        tipo: l.tipo === "automatrícula" ? "Automatrícula" : "Matrícula"
      });
      if (l.horario || l.pacote) {
        mutate(p.id, function (x) {
          x.historico = x.historico || [];
          pushHist(x, "matricula", "Do canal #admin: " + [l.turma, l.horario, l.pacote]
            .filter(Boolean).join(" · "));
        });
      }
    });
    return { ok: true, criadas: criadas, atualizadas: atualizadas,
      puladas: puladas, semContrato: semContrato };
  }

  function identsAll() {
    try { return JSON.parse(localStorage.getItem(IDENT_KEY)) || {}; } catch (e) { return {}; }
  }
  function donoDoIdentificador(ident) {
    if (!ident) return null;
    var r = identsAll()[String(ident).toUpperCase()];
    return r && r.pessoaId ? (getPessoa(r.pessoaId) || null) : null;
  }
  function lembrarIdentificador(ident, pessoaId) {
    var k = String(ident || "").toUpperCase();
    if (!k || !pessoaId) return null;
    var all = identsAll();
    all[k] = { pessoaId: pessoaId, em: iso(today()) };
    try { localStorage.setItem(IDENT_KEY, JSON.stringify(all)); } catch (e) {}
    agendarSync();
    return all;
  }
  function esquecerIdentificador(ident) {
    var all = identsAll();
    delete all[String(ident || "").toUpperCase()];
    try { localStorage.setItem(IDENT_KEY, JSON.stringify(all)); } catch (e) {}
    agendarSync();
    return all;
  }

  // O repasse aparece duas vezes, uma em cada extrato: sai do Stripe
  // como "STRIPE PAYOUT (€ -143,51)" e entra no bunq como um crédito de
  // € 143,51 vindo de um IBAN que não diz nada ("NL41CITI…"). São o
  // mesmo dinheiro. Sem cruzar os dois, o crédito do banco vira receita
  // nova e o mês fecha com dinheiro que não existe.
  //
  // Cada repasse visto num extrato fica guardado; ao analisar o outro
  // extrato, o crédito de mesmo valor e data próxima é reconhecido.
  var REPASSES_KEY = "isr_repasses_v1";
  function repassesAll() {
    try { return JSON.parse(localStorage.getItem(REPASSES_KEY)) || {}; } catch (e) { return {}; }
  }
  function registrarRepasse(t, conta, moeda) {
    if (!t || !conta) return null;
    var all = repassesAll();
    all[chaveTransacao(t)] = { conta: conta, valor: Math.abs(t.valor || 0),
      moeda: moeda || t.moeda || "", data: dataDoExtrato(t), em: iso(today()) };
    try { localStorage.setItem(REPASSES_KEY, JSON.stringify(all)); } catch (e) {}
    return all;
  }
  function dataDoExtrato(t) {
    var d = String((t && t.data) || "").match(/(\d{2})\/(\d{2})\/(\d{4})/);
    return d ? (d[3] + "-" + d[2] + "-" + d[1]) : "";
  }
  // Crédito que corresponde a um repasse já visto no extrato da outra
  // conta. A janela de dias existe porque o dinheiro sai num dia e cai no
  // banco no outro.
  // Um crédito com nome de gente na descrição NÃO entra aqui, mesmo que
  // o valor bata: seria tirar da fila o pagamento de uma aluna. O repasse
  // chega sem nome — um IBAN, "STRIPE PAYOUT", nada.
  function repasseCasando(t, contaAtual, moeda, usados) {
    if (!t || (t.valor || 0) <= 0) return null;
    if (!ehSoIdentificador(t.descricao) && !linhaDeSistema(t.descricao)) return null;
    var quando = dataDoExtrato(t);
    var all = repassesAll(), achado = null;
    Object.keys(all).forEach(function (k) {
      if (achado) return;
      var r = all[k];
      if (r.conta === contaAtual) return;
      // um repasse casa com uma linha só
      if (usados && usados[k]) return;
      if (moeda && r.moeda && r.moeda !== moeda) return;
      if (Math.abs(r.valor - t.valor) > 0.02) return;
      if (quando && r.data) {
        var dias = Math.abs(new Date(quando) - new Date(r.data)) / 86400000;
        if (dias > 7) return;
      }
      achado = r;
      if (usados) usados[k] = true;
    });
    return achado;
  }

  function ehContaPropria(descricao) {
    var d = semAcento(descricao || "");
    return contasProprias().some(function (x) { return x.nome.length >= 3 && d.indexOf(x.nome) >= 0; });
  }
  // O extrato do gateway vem cheio de linhas que não são despesa da
  // escola, e perguntar sobre cada uma enche a tela de decisão que não
  // existe:
  //
  //   "STRIPE PAYOUT"                        o repasse para o banco — é o
  //                                          mesmo dinheiro que chega no
  //                                          bunq, contar aqui seria contar
  //                                          duas vezes
  //   "Minimum balance held from a payout"   saldo que a Stripe segura na
  //                                          conta; continua sendo dela
  //   "Billing - Usage Fee"                  essa sim é despesa: a taxa de
  //                                          uso do gateway
  //
  // Só vale para débito: um crédito com essas palavras é outra coisa.
  function linhaDeSistema(descricao) {
    var d = semAcento(descricao || "");
    if (!d) return "";
    if (/minimum balance|balance held|saldo minimo|reserva|reserve/.test(d)) return "retencao";
    if (/payout|repasse ao banco|transfer to bank/.test(d)) return "repasse";
    if (/usage fee|application fee|billing|invoice fee|stripe fee/.test(d)) return "taxa";
    return "";
  }
  // Repasse de uma conta da escola para outra: no extrato do bunq, o
  // dinheiro do Stripe chega como "STRIPE PAYMENTS". Devolve a conta de
  // origem quando reconhece — nunca a própria conta do extrato, senão
  // toda linha do bunq viraria transferência do bunq.
  function contaDaDescricao(descricao, contaAtual) {
    var d = semAcento(descricao || "");
    if (!d) return null;
    var achada = null;
    contasLista().forEach(function (c) {
      if (achada || c.id === contaAtual) return;
      var termos = (c.apelidos && c.apelidos.length ? c.apelidos : [c.nome])
        .map(function (x) { return semAcento(x); })
        .filter(function (x) { return x.length >= 3; });
      if (termos.some(function (t) { return d.indexOf(t) >= 0; })) achada = c;
    });
    return achada;
  }

  var EXTRATO_REG_KEY = "isr_extrato_reg_v1";
  function extratoRegAll() {
    try { return JSON.parse(localStorage.getItem(EXTRATO_REG_KEY)) || {}; } catch (e) { return {}; }
  }
  function chaveTransacao(t) {
    // o id do gateway quando existe; senão, data + valor + começo da descrição
    if (t.idExterno) return "id:" + t.idExterno;
    return (t.data || "?") + "|" + (t.valor === undefined ? "?" : t.valor.toFixed(2))
      + "|" + semAcento(t.descricao || "").slice(0, 40);
  }
  function transacaoRegistrada(t) {
    return extratoRegAll()[chaveTransacao(t)] || null;
  }
  // Tira uma transação do registro: ela volta a aparecer na próxima
  // análise. É o que permite refazer uma conciliação feita errado sem
  // apagar o mês inteiro.
  function esquecerTransacao(t) {
    var reg = extratoRegAll();
    delete reg[chaveTransacao(t)];
    try { localStorage.setItem(EXTRATO_REG_KEY, JSON.stringify(reg)); } catch (e) {}
    agendarSync();
    return reg;
  }
  function registrarTransacao(t, uso) {
    var reg = extratoRegAll();
    reg[chaveTransacao(t)] = { em: iso(today()), uso: uso || "" };
    try { localStorage.setItem(EXTRATO_REG_KEY, JSON.stringify(reg)); } catch (e) {}
    agendarSync();
  }

  // Toda parcela não paga, de qualquer pessoa e qualquer contrato — não só
  // o vigente. O Asaas paga retroativo: dinheiro de aluna que já encerrou
  // chega depois do contrato acabar, e a parcela dela ainda existe.
  function parcelasAbertasTodas(moeda) {
    var out = [];
    loadPessoas().forEach(function (p) {
      var vigente = contratoVigente(p);
      var ativa = (p.status === "aluna" || p.status === "mvs");
      (p.contratos || []).forEach(function (c, ci) {
        if ((c.moeda || p.moeda || "R$") !== moeda) return;
        (c.meses || []).forEach(function (m) {
          // cancelada no encerramento não é dívida: não pode aparecer
          // como candidata na conciliação do extrato
          if (m.pago || m.cancelada) return;
          var v = parseMoney(m.valor || c.parcelaValor);
          if (!v) return;
          out.push({ pessoaId: p.id, nome: p.nome, mesKey: m.key, mesLabel: m.label,
            valor: v, contratoIdx: ci, encerrada: !(ativa && c === vigente) });
        });
      });
    });
    return out;
  }

  // Parcela que alguém marcou como paga na mão e que nunca foi vista no
  // banco. Quando o pagamento dela aparece no extrato, essa linha é a
  // CONFIRMAÇÃO da parcela — não um pagamento novo. Sem isto, a
  // conciliação ia procurar uma parcela em aberto, achava a do mês
  // seguinte e a aluna acabava com dois meses pagos por um pagamento só.
  function parcelasPagasSemExtrato(moeda) {
    var out = [];
    loadPessoas().forEach(function (p) {
      (p.contratos || []).forEach(function (c, ci) {
        if (moeda && (c.moeda || p.moeda || "R$") !== moeda) return;
        (c.meses || []).forEach(function (m) {
          if (!m.pago || m.pagoEm || m.idExterno) return;
          var v = parseMoney(m.valor || c.parcelaValor);
          if (!v) return;
          out.push({ pessoaId: p.id, nome: p.nome, mesKey: m.key, mesLabel: m.label,
            valor: v, contratoIdx: ci, moeda: c.moeda || p.moeda || "R$" });
        });
      });
    });
    return out;
  }
  // O que existe no contrato de uma pessoa, para a tela explicar por que
  // não achou parcela em aberto em vez de só dizer que não achou.
  function situacaoDasParcelas(pessoaId, mesKey, moeda) {
    var p = getPessoa(pessoaId);
    if (!p) return null;
    var r = { abertasNaMoeda: 0, abertasOutraMoeda: 0, moedasOutras: [],
      pagasNoMes: 0, temContrato: !!(p.contratos || []).length };
    (p.contratos || []).forEach(function (c) {
      var m = c.moeda || p.moeda || "R$";
      (c.meses || []).forEach(function (x) {
        if (x.cancelada || !parseMoney(x.valor || c.parcelaValor)) return;
        if (x.pago) {
          if (mesKey && x.key === mesKey) r.pagasNoMes++;
          return;
        }
        if (m === moeda) r.abertasNaMoeda++;
        else {
          r.abertasOutraMoeda++;
          if (r.moedasOutras.indexOf(m) < 0) r.moedasOutras.push(m);
        }
      });
    });
    return r;
  }

  // "Bonfim" no cadastro e "BOMFIM" no extrato são a mesma pessoa;
  // "Giovana" e "Giovanna" também. Uma letra de diferença não pode
  // custar o reconhecimento — mas só em palavras longas o bastante para
  // a semelhança significar alguma coisa.
  function quaseIgual(a, b) {
    if (a === b) return true;
    if (a.length < 5 || b.length < 5) return false;
    if (Math.abs(a.length - b.length) > 1) return false;
    var i = 0, j = 0, dif = 0;
    while (i < a.length && j < b.length) {
      if (a.charAt(i) === b.charAt(j)) { i++; j++; continue; }
      if (++dif > 1) return false;
      if (a.length > b.length) i++;
      else if (a.length < b.length) j++;
      else { i++; j++; }
    }
    if (i < a.length || j < b.length) dif++;
    return dif <= 1;
  }
  // Quantas partes do nome aparecem na descrição, aceitando a letra
  // trocada. Devolve o número, para quem chama decidir o quanto basta.
  function partesNaDescricao(nome, descricao) {
    var desc = semAcento(descricao);
    var palavras = desc.split(/[^a-z0-9]+/).filter(function (w) { return w.length >= 3; });
    return semAcento(nome).split(/\s+/)
      .filter(function (x) { return x.length >= 4; })
      .filter(function (p) {
        if (desc.indexOf(p) >= 0) return true;
        return palavras.some(function (w) { return quaseIgual(w, p); });
      }).length;
  }

  // O extrato do Stripe vem com as duas moedas na mesma busca: aluna
  // brasileira cobrada em real, europeia em euro. Analisar tudo contra as
  // parcelas de UMA moeda comparava valores de mundos diferentes — e os
  // pagamentos da outra moeda simplesmente não casavam com ninguém.
  // Aqui cada moeda roda a sua análise e os resultados se juntam.
  function sugerirConciliacao(transacoes, moeda, contaAtual) {
    var lista = transacoes || [];
    var moedas = [];
    lista.forEach(function (t) {
      var m = t.moeda || moeda;
      if (moedas.indexOf(m) < 0) moedas.push(m);
    });
    if (moedas.length <= 1) return conciliarUmaMoeda(lista, moedas[0] || moeda, contaAtual);
    var partes = moedas.map(function (m) {
      return conciliarUmaMoeda(lista.filter(function (t) { return (t.moeda || moeda) === m; }),
        m, contaAtual);
    });
    var junta = function (campo) {
      return partes.reduce(function (acc, x) { return acc.concat(x[campo] || []); }, []);
    };
    var soma = function (campo) {
      return partes.reduce(function (acc, x) { return acc + (x[campo] || 0); }, 0);
    };
    return { sugestoes: junta("sugestoes"), semMatch: junta("semMatch"),
      jaRegistradas: junta("jaRegistradas"), internas: junta("internas"),
      semValor: junta("semValor"), retiradasDetectadas: junta("retiradasDetectadas"),
      porNome: soma("porNome"), porEmail: soma("porEmail"), semParcela: soma("semParcela"),
      moedasDaBusca: moedas };
  }

  function conciliarUmaMoeda(transacoes, moeda, contaAtual) {
    // o que já foi processado numa análise anterior sai da fila
    var jaRegistradas = [];
    transacoes = transacoes.filter(function (t) {
      var reg = transacaoRegistrada(t);
      if (reg) { jaRegistradas.push({ trans: t, uso: reg.uso, em: reg.em }); return false; }
      return true;
    });
    // troca de moeda e transferência para conta própria (a empresa dela,
    // ela mesma) não são receita nem despesa — saem da fila antes de
    // qualquer sugestão
    var internas = [], semValor = [], repassesUsados = {};
    transacoes = transacoes.filter(function (t) {
      // linha de € 0,00 não move dinheiro e não tem decisão a tomar
      if (Math.abs(t.valor || 0) < 0.005) { semValor.push(t); return false; }
      var outra = contaDaDescricao(t.descricao, contaAtual);
      if (outra) {
        internas.push(Object.assign({}, t, { deConta: outra.id, deContaNome: outra.nome }));
        return false;
      }
      // conta própria: entre as empresas da escola o dinheiro continua
      // dentro; para a conta pessoal ele saiu, e isso é retirada
      var tipoProprio = tipoDaContaPropria(t.descricao);
      if (t.interna || tipoProprio) {
        internas.push(Object.assign({}, t, { contaPropria: tipoProprio || "empresa" }));
        return false;
      }
      // repasse do gateway para o banco e saldo retido por ele: dinheiro
      // que continua sendo da escola, não despesa. O saldo retido volta
      // depois como crédito ("released after a payout") e também não é
      // receita — por isso a regra vale nos dois sentidos.
      var sis = linhaDeSistema(t.descricao);
      if (sis === "retencao" || (sis === "repasse" && (t.valor || 0) < 0)) {
        if (sis === "repasse") registrarRepasse(t, contaAtual, moeda);
        internas.push(Object.assign({}, t, { sistema: sis }));
        return false;
      }
      // o outro lado do repasse: crédito de mesmo valor que já saiu do
      // gateway, chegando aqui com um IBAN no lugar do nome
      var vindo = repasseCasando(t, contaAtual, moeda, repassesUsados);
      if (vindo) {
        internas.push(Object.assign({}, t, { sistema: "repasse", deConta: vindo.conta,
          deContaNome: contaLabel(vindo.conta) }));
        return false;
      }
      return true;
    });
    // todas as parcelas em aberto — inclusive de contrato encerrado, que é
    // como chega o pagamento retroativo do Asaas
    var abertas = parcelasAbertasTodas(moeda);
    // A aluna brasileira tem contrato em real e paga pelo Stripe, que
    // cobra em euro. A parcela dela existe, só está na outra moeda — e
    // ficava fora da conciliação inteira. Aqui ela entra convertida pelo
    // câmbio configurado, guardando o valor de face original.
    var outraMoeda = moeda === "€" ? "R$" : "€";
    var cambio = taxaCambio() || 0;
    if (cambio > 0) {
      parcelasAbertasTodas(outraMoeda).forEach(function (a) {
        var convertido = outraMoeda === "R$" ? a.valor / cambio : a.valor * cambio;
        abertas.push(Object.assign({}, a, {
          valor: Math.round(convertido * 100) / 100,
          convertida: true, moedaOriginal: outraMoeda, valorOriginal: a.valor }));
      });
    }
    // Convertida nunca bate no centavo: o câmbio do dia não é o
    // configurado e o gateway ainda desconta a taxa. A folga é maior
    // para ela, e só para ela.
    var cabeNoValor = function (a, t) {
      var folga = a.convertida ? Math.max(3, a.valor * 0.15) : 0.6;
      return Math.abs(a.valor - t.valor) <= folga;
    };
    // A data do pagamento é um sinal forte e estava sendo ignorada: quem
    // paga em 20/08 está quitando o que já venceu, não a parcela de
    // setembro. Entre candidatas de mesmo peso, as já vencidas na data do
    // pagamento vêm primeiro, da mais antiga para a mais nova; as que
    // ainda vão vencer ficam por último.
    var mesDaTransacao = function (t) {
      var d = String((t && t.data) || "").match(/(\d{2})\/(\d{2})\/(\d{4})/);
      return d ? d[3] + "-" + d[2] : "";
    };
    var porProximidade = function (t) {
      var mesT = mesDaTransacao(t);
      return function (a, b) {
        if (mesT) {
          var fa = a.mesKey > mesT ? 1 : 0, fb = b.mesKey > mesT ? 1 : 0;
          if (fa !== fb) return fa - fb;
        }
        return a.mesKey < b.mesKey ? -1 : (a.mesKey > b.mesKey ? 1 : 0);
      };
    };
    var equipe = equipeLista().map(function (x) { return x.nome; });
    var usadas = {};
    var chaveAberta = function (a) { return a.pessoaId + "|" + a.mesKey + "|" + a.contratoIdx; };
    // A escolha pode cair num mês mais novo do que o mais antigo em
    // aberto — porque o valor bate nele e não no outro, ou porque o
    // antigo é de contrato encerrado. Quando isso acontece, a linha
    // precisa dizer, senão parece erro: pagamento de agosto casando com
    // setembro sem explicação.
    // Quem está nomeado na linha, quando o nome é forte o bastante (duas
    // partes). Sem isto, "Beatryz Cordeiro" casava com a parcela de "Ana
    // Beatriz" — um primeiro nome parecido bastava, e a parcela ia para a
    // pessoa errada. Com dono definido, só as parcelas dele concorrem.
    var donoDaLinha = function (t) {
      var melhor = null, placar = 0;
      loadPessoas().forEach(function (p) {
        var n = partesNaDescricao(p.nome, t.descricao);
        if (n >= 2 && n > placar) { placar = n; melhor = p; }
      });
      return melhor;
    };
    var anteriorEmAberto = function (alvo) {
      var antes = abertas.filter(function (a) {
        return a.pessoaId === alvo.pessoaId && a.mesKey < alvo.mesKey
          && !usadas[chaveAberta(a)];
      }).sort(function (a, b) { return a.mesKey < b.mesKey ? -1 : 1; })[0];
      return antes ? { mesKey: antes.mesKey, mesLabel: antes.mesLabel, valor: antes.valor } : null;
    };
    // O mês sugerido é posterior ao mês do pagamento e não sobrou nada
    // atrás: quer dizer que o mês do pagamento já está quitado e esta
    // linha adianta o próximo. Dizer isso evita a leitura de erro —
    // "paguei em agosto, por que casou com setembro?".
    // A parcela do mês do pagamento já está marcada como paga e nunca foi
    // vista no banco: esta linha é a prova dela. A tolerância de valor é
    // maior aqui porque o gateway desconta a taxa — € 82,01 no extrato é
    // a parcela de € 85,00.
    var pagasSem = parcelasPagasSemExtrato(moeda);
    var confirmacaoPara = function (pessoaId, t) {
      var mesT = mesDaTransacao(t);
      if (!mesT) return null;
      return pagasSem.filter(function (a) {
        if (a.pessoaId !== pessoaId || usadas[chaveAberta(a)]) return false;
        if (a.mesKey !== mesT) return false;
        return Math.abs(a.valor - t.valor) <= Math.max(0.6, a.valor * 0.15);
      })[0] || null;
    };
    var comoConfirmacao = function (t, alvo, extra) {
      usadas[chaveAberta(alvo)] = true;
      sugestoes.push(Object.assign({ trans: t, pessoaId: alvo.pessoaId, nome: alvo.nome,
        mesKey: alvo.mesKey, mesLabel: alvo.mesLabel, valor: alvo.valor,
        diferenca: Math.round((t.valor - alvo.valor) * 100) / 100,
        confirmacao: true, contratoIdx: alvo.contratoIdx, encerrada: false }, extra || {}));
    };
    var adiantaMes = function (alvo, t) {
      var mesT = mesDaTransacao(t);
      return (mesT && alvo.mesKey > mesT) ? mesT : "";
    };
    var sugestoes = [], semMatch = [], pendentes = [];

    // ── 0ª passada: o e-mail bate ─────────────────────────────
    // Antes de tentar por valor ou por nome: se a linha traz o e-mail de
    // uma aluna cadastrada, é ela. O valor pode estar diferente (taxa do
    // gateway) e o nome pode nem aparecer.
    var idPorEmail = {};
    loadPessoas().forEach(function (p) {
      var e = String(p.email || "").trim().toLowerCase();
      if (e) idPorEmail[e] = p;
    });
    var restam = [];
    transacoes.forEach(function (t) {
      if (t.valor <= 0) { restam.push(t); return; }
      var e = emailDaTransacao(t);
      var pes = e ? idPorEmail[e] : null;
      var ident = "";
      // sem e-mail na linha, vale o número de conta que você já apontou
      // numa conciliação anterior
      if (!pes) {
        ident = identDaTransacao(t);
        pes = ident ? donoDoIdentificador(ident) : null;
        if (!pes) ident = "";
      }
      if (!pes) { restam.push(t); return; }
      // antes de procurar parcela em aberto: a do mês do pagamento pode
      // já estar marcada como paga na mão, e então esta linha é a prova
      // dela, não um pagamento novo
      var conf0 = confirmacaoPara(pes.id, t);
      if (conf0) {
        comoConfirmacao(t, conf0, { porEmail: !!e, email: e || ident, porIdent: ident || undefined });
        return;
      }
      var cands = abertas.filter(function (a) {
        return a.pessoaId === pes.id && !usadas[chaveAberta(a)];
      });
      if (!cands.length) {
        // reconhecida, mas sem parcela em aberto: costuma ser assinatura
        // ou acompanhamento, que não têm parcela. Dizer de quem é o
        // dinheiro já resolve metade do problema.
        // assinatura e acompanhamento já entram no Caixa como cobrança
        // automática: conciliar de novo contaria o mesmo dinheiro duas
        // vezes. Aqui a linha só precisa ser conferida.
        var recorrente = assinaturaAtiva(pes) ? "assinatura"
          : ((pes.programa && !pes.programa.encerrado) ? "acompanhamento" : "");
        semMatch.push({ trans: t, tipo: "sem_parcela", pessoaId: pes.id,
          nome: pes.nome, email: e || ident, recorrente: recorrente,
          situacao: situacaoDasParcelas(pes.id, mesDaTransacao(t), moeda) });
        return;
      }
      var perto = porProximidade(t);
      cands.sort(function (a, b) {
        var dv = Math.abs(a.valor - t.valor) - Math.abs(b.valor - t.valor);
        if (dv) return dv;
        // o que já venceu na data do pagamento vem antes, mesmo estando
        // num contrato encerrado: quem paga em agosto está quitando
        // agosto, não adiantando setembro do contrato novo
        var pp = perto(a, b);
        if (pp) return pp;
        return a.encerrada === b.encerrada ? 0 : (a.encerrada ? 1 : -1);
      });
      var alvo = cands[0];
      usadas[chaveAberta(alvo)] = true;
      sugestoes.push({ trans: t, pessoaId: alvo.pessoaId, nome: alvo.nome,
        mesKey: alvo.mesKey, mesLabel: alvo.mesLabel, valor: alvo.valor,
        diferenca: alvo.convertida ? 0 : Math.round((t.valor - alvo.valor) * 100) / 100,
        porEmail: !!e, email: e || ident, porIdent: ident || undefined,
        anterior: anteriorEmAberto(alvo), adianta: adiantaMes(alvo, t),
        convertida: alvo.convertida, valorOriginal: alvo.valorOriginal,
        moedaOriginal: alvo.moedaOriginal,
        contratoIdx: alvo.contratoIdx, encerrada: alvo.encerrada });
    });
    transacoes = restam;

    // ── 1ª passada: valor bate ────────────────────────────────
    // Quem tem o nome na linha escolhe primeiro. Sem isto, um crédito que
    // só bate por valor levava a parcela de quem seria reconhecido pelo
    // nome logo depois — e a pessoa certa acabava recebendo o mês errado,
    // o que sobrou.
    var temNomeNaLinha = function (t) {
      var d = (t.descricao || "").toLowerCase();
      return abertas.some(function (a) {
        return cabeNoValor(a, t) && d.indexOf(firstName(a.nome).toLowerCase()) >= 0;
      });
    };
    // ── 0b: linha com nome forte, parcela do mês já marcada na mão ──
    // Mesmo caso da passada acima, para quem é reconhecido pelo nome e
    // não pelo e-mail. Vem antes da busca por valor: senão o pagamento
    // dela ia parar na parcela em aberto do mês seguinte.
    var restamB = [];
    transacoes.forEach(function (t) {
      if (t.valor <= 0) { restamB.push(t); return; }
      var dono0 = donoDaLinha(t);
      var conf = dono0 ? confirmacaoPara(dono0.id, t) : null;
      // O nome do gateway pode não ser o nome do cadastro — "Fernanda
      // Alves" no cartão e "Fernanda Chalita" na ficha. Com o mês e o
      // valor batendo numa parcela já marcada como paga, o primeiro nome
      // basta, desde que só uma pessoa se encaixe: duas candidatas viram
      // dúvida, e dúvida não pode virar baixa.
      if (!conf) {
        var mesT = mesDaTransacao(t);
        var desc = semAcento(t.descricao || "");
        var possiveis = mesT ? pagasSem.filter(function (a) {
          if (usadas[chaveAberta(a)] || a.mesKey !== mesT) return false;
          if (Math.abs(a.valor - t.valor) > Math.max(0.6, a.valor * 0.15)) return false;
          var pn = semAcento(firstName(a.nome));
          return pn.length >= 4 && desc.indexOf(pn) >= 0;
        }) : [];
        if (possiveis.length === 1) conf = possiveis[0];
      }
      if (conf) comoConfirmacao(t, conf, { porNome: true });
      else restamB.push(t);
    });
    transacoes = restamB;

    var comNome = [], semNome = [];
    transacoes.forEach(function (t) {
      if (t.valor <= 0) { semMatch.push({ trans: t, tipo: "saida" }); return; }
      (temNomeNaLinha(t) ? comNome : semNome).push(t);
    });

    comNome.concat(semNome).forEach(function (t) {
      var descLinha = (t.descricao || "").toLowerCase();
      var cands = abertas.filter(function (a) {
        if (usadas[chaveAberta(a)] || !cabeNoValor(a, t)) return false;
        // Parcela convertida só entra quando a linha diz o nome dela. A
        // folga do câmbio é larga: por valor sozinho, um pagamento em
        // euro casaria com quase qualquer parcela em real.
        if (a.convertida && descLinha.indexOf(firstName(a.nome).toLowerCase()) < 0) return false;
        return true;
      });
      if (!cands.length) { pendentes.push(t); return; }
      var desc = (t.descricao || "").toLowerCase();
      var perto1 = porProximidade(t);
      cands.sort(function (a, b) {
        var an = desc.indexOf(firstName(a.nome).toLowerCase()) >= 0 ? 0 : 1;
        var bn = desc.indexOf(firstName(b.nome).toLowerCase()) >= 0 ? 0 : 1;
        if (an !== bn) return an - bn;
        // a parcela já vencida na data do pagamento vem antes; contrato
        // vigente só decide quando as duas estão do mesmo lado da data
        var pp1 = perto1(a, b);
        if (pp1) return pp1;
        return a.encerrada === b.encerrada ? 0 : (a.encerrada ? 1 : -1);
      });
      var alvo = cands[0];
      usadas[chaveAberta(alvo)] = true;
      sugestoes.push({ trans: t, pessoaId: alvo.pessoaId, nome: alvo.nome,
        mesKey: alvo.mesKey, mesLabel: alvo.mesLabel, valor: alvo.valor, diferenca: 0,
        anterior: anteriorEmAberto(alvo), adianta: adiantaMes(alvo, t),
        convertida: alvo.convertida, valorOriginal: alvo.valorOriginal,
        moedaOriginal: alvo.moedaOriginal,
        // a cobrança recorrente do gateway não traz o nome de quem pagou,
        // só o nome da oferta: dizer isso é melhor do que deixar a linha
        // sem explicação
        assinatura: /subscription payment|assinatura|recurring/.test(desc) || undefined,
        contratoIdx: alvo.contratoIdx, encerrada: alvo.encerrada });
    });

    // ── 2ª passada: o nome bate, o valor não ──────────────────
    // Gateway desconta taxa, aluna paga a mais ou a menos, banco arredonda.
    // Achar pelo nome e MOSTRAR a diferença é melhor do que dizer "sem
    // correspondência" e deixar a pessoa procurar na mão.
    pendentes.forEach(function (t) {
      var desc = semAcento(t.descricao || "");
      // a linha nomeia alguém da base: só as parcelas dela concorrem
      var dono = donoDaLinha(t);
      var cands = abertas.filter(function (a) {
        if (usadas[chaveAberta(a)]) return false;
        if (dono) return a.pessoaId === dono.id;
        var partes = semAcento(a.nome).split(/\s+/).filter(function (x) { return x.length >= 4; });
        if (!partes.length) return false;
        // pelo menos duas partes do nome, ou o primeiro nome se for único
        return partesNaDescricao(a.nome, t.descricao) >= Math.min(2, partes.length);
      });
      if (!cands.length) { semMatch.push({ trans: t, tipo: "sem_match" }); return; }
      var perto2 = porProximidade(t);
      cands.sort(function (a, b) {
        var dv = Math.abs(a.valor - t.valor) - Math.abs(b.valor - t.valor);
        if (dv) return dv;
        var pp2 = perto2(a, b);
        if (pp2) return pp2;
        return a.encerrada === b.encerrada ? 0 : (a.encerrada ? 1 : -1);
      });
      var alvo = cands[0];
      usadas[chaveAberta(alvo)] = true;
      sugestoes.push({ trans: t, pessoaId: alvo.pessoaId, nome: alvo.nome,
        mesKey: alvo.mesKey, mesLabel: alvo.mesLabel, valor: alvo.valor,
        diferenca: alvo.convertida ? 0 : Math.round((t.valor - alvo.valor) * 100) / 100,
        porNome: true,
        anterior: anteriorEmAberto(alvo), adianta: adiantaMes(alvo, t),
        convertida: alvo.convertida, valorOriginal: alvo.valorOriginal,
        moedaOriginal: alvo.moedaOriginal,
        contratoIdx: alvo.contratoIdx, encerrada: alvo.encerrada });
    });

    // ── quem foi reconhecido pelo nome mas não tem parcela ────
    // Assinante não tem parcela nenhuma: a linha dela caía em "nome não
    // aparece na descrição", que além de inútil era falso — o nome está
    // na descrição, o que não existe é parcela. Dizendo de quem é, a
    // tela consegue oferecer a cobrança do mês como destino.
    semMatch.forEach(function (x) {
      if (x.tipo !== "sem_match" || (x.trans.valor || 0) <= 0) return;
      var pes = loadPessoas().filter(function (p) {
        var partes = semAcento(p.nome).split(/\s+/).filter(function (w) { return w.length >= 4; });
        return partes.length
          && partesNaDescricao(p.nome, x.trans.descricao) >= Math.min(2, partes.length);
      })[0];
      if (!pes) return;
      x.tipo = "sem_parcela";
      x.pessoaId = pes.id;
      x.nome = pes.nome;
      x.email = String(pes.email || "").trim().toLowerCase();
      x.recorrente = assinaturaAtiva(pes) ? "assinatura"
        : ((pes.programa && !pes.programa.encerrado) ? "acompanhamento" : "");
      x.situacao = situacaoDasParcelas(pes.id, mesDaTransacao(x.trans), moeda);
    });

    // ── saídas: quem é da equipe já sai categorizada ──────────
    semMatch.forEach(function (x) {
      if (x.tipo !== "saida") return;
      var desc = semAcento(x.trans.descricao || "");
      var quem = equipe.filter(function (n) {
        var partes = semAcento(n).split(/\s+/).filter(function (p) { return p.length >= 4; });
        return partes.length
          && partesNaDescricao(n, x.trans.descricao) >= Math.min(2, partes.length);
      })[0];
      if (quem) { x.categoria = "equipe"; x.pessoaEquipe = quem; }
      else if (linhaDeSistema(x.trans.descricao) === "taxa") {
        x.categoria = "impostos"; x.taxaGateway = true;
      }
      else if (/taxa|tarifa|mensageria|notificacao|boleto|pix/.test(desc)) x.categoria = "impostos";
      else x.categoria = "outros";
    });

    // saída para conta pessoal já reconhecida: sai da fila como interna,
    // mas continua sendo dinheiro que deixou a escola. A tela oferece
    // lançar como retirada — sem isso ela sumia de vez.
    var retiradasDetectadas = internas.filter(function (x) {
      return x.contaPropria === "pessoal" && (x.valor || 0) < 0;
    });

    return { sugestoes: sugestoes, semMatch: semMatch,
      jaRegistradas: jaRegistradas, internas: internas, semValor: semValor,
      retiradasDetectadas: retiradasDetectadas,
      porNome: sugestoes.filter(function (s) { return s.porNome; }).length,
      porEmail: sugestoes.filter(function (s) { return s.porEmail; }).length,
      semParcela: semMatch.filter(function (s) { return s.tipo === "sem_parcela"; }).length };
  }

  // Crédito de alguém que ainda não está na base. Virar "recebimento
  // avulso" resolve o dinheiro e perde a pessoa: no mês seguinte a linha
  // dela volta igual. Aqui a aluna nasce do próprio extrato, com o
  // pagamento no nome dela e a pendência de completar o plano.
  function novaAlunaDoExtrato(nome, trans, conta) {
    var limpo = String(nome || "").trim().slice(0, 60);
    if (!limpo) return null;
    var quando = "";
    var d = String((trans && trans.data) || "").split("/");
    if (d.length === 3) quando = d[2] + "-" + d[1] + "-" + d[0];
    if (!/^\d{4}-\d{2}-\d{2}$/.test(quando)) quando = iso(today());
    var moeda = (trans && trans.moeda) || "R$";
    var valor = Math.abs((trans && trans.valor) || 0);

    var p = novaPessoa({ nome: limpo, moeda: moeda, canal: "Extrato bancário" });
    mutate(p.id, function (x) {
      x.status = "aluna";
      x.estagio = "matriculado";
      x.desde = quando;
      pushHist(x, "pagamento", "Pagamento de " + fmtMoney(moeda, valor)
        + " reconhecido no extrato \u00b7 cadastro criado a partir dele");
    });
    addLancamento({ tipo: "entrada", categoria: "outra",
      descricao: limpo + " \u00b7 pagamento sem plano cadastrado",
      moeda: moeda, valor: valor, conta: conta || "", data: quando });
    addTarefa({ titulo: "Completar o plano de " + limpo,
      detalhe: "Entrou pelo extrato com " + fmtMoney(moeda, valor)
        + ". Falta turma, valor da parcela e n\u00famero de parcelas para a cobran\u00e7a passar a existir.",
      dono: donoDaIntegracao(), por: "Caixa" });
    if (trans) registrarTransacao(trans, "aluna criada pelo extrato");
    return p;
  }

  // Quem paga por assinatura não tem parcela nenhuma: o pagamento dela
  // chega no extrato e não existe linha para dar baixa. Aqui estão as
  // cobranças recorrentes vivas no mês, para a conciliação poder
  // oferecê-las como destino.
  function recorrentesDoMes(key, moeda) {
    var k = key || mesAtualKey();
    var out = [];
    loadPessoas().forEach(function (p) {
      [{ obj: p.assinatura, qual: "assinatura", rotulo: "Assinatura",
         fim: p.assinatura && p.assinatura.encerrada },
       { obj: p.programa, qual: "programa",
         rotulo: (p.programa && p.programa.nome) || "Acompanhamento",
         fim: p.programa && p.programa.encerrado }].forEach(function (r) {
        var o = r.obj;
        if (!o || !o.valor) return;
        var m = o.moeda || p.moeda || "€";
        if (moeda && m !== moeda) return;
        var ini = String(o.inicio || o.desde || "").slice(0, 10);
        if (!ini || ini.slice(0, 7) > k) return;
        if (r.fim && String(r.fim).slice(0, 7) < k) return;
        out.push({ pessoaId: p.id, nome: p.nome, qual: r.qual, rotulo: r.rotulo,
          mesKey: k, valor: parseMoney(o.valor), moeda: m,
          confirmado: !!(o.confirmados && o.confirmados[k]) });
      });
    });
    return out.sort(function (a, b) { return a.nome < b.nome ? -1 : 1; });
  }

  // Pagamento que não corresponde a parcela nenhuma: à vista, um extra,
  // um acerto. Antes, a única saída era "recebimento avulso", que perde
  // a dona do dinheiro. Aqui o pagamento entra no nome dela, com o
  // registro na ficha — mesmo que ela não tenha contrato.
  function registrarPagamentoDePessoa(pessoaId, trans, conta, rotulo) {
    var p = getPessoa(pessoaId);
    if (!p) return null;
    var quando = "";
    var d = String((trans && trans.data) || "").split("/");
    if (d.length === 3) quando = d[2] + "-" + d[1] + "-" + d[0];
    if (!/^\d{4}-\d{2}-\d{2}$/.test(quando)) quando = iso(today());
    var moeda = (trans && trans.moeda) || p.moeda || "R$";
    var valor = Math.abs((trans && trans.valor) || 0);
    addLancamento({ tipo: "entrada",
      categoria: p.status === "mvs" ? "mvs" : "outra",
      descricao: p.nome + (rotulo ? " · " + rotulo : " · pagamento"),
      moeda: moeda, valor: valor, conta: conta || "", data: quando,
      pessoaId: p.id });
    addHistory(pessoaId, "pagamento", "Pagamento de " + fmtMoney(moeda, valor)
      + " reconhecido no extrato" + (rotulo ? " · " + rotulo : ""));
    if (trans) registrarTransacao(trans, "pagamento de " + p.nome);
    return p;
  }

  function conciliar(pessoaId, mesKey, descricao, trans, contratoIdx, conta) {
    setParcelaPaga(pessoaId, mesKey, true, contratoIdx);
    // A parcela guarda o que de fato aconteceu no banco: quando caiu e
    // quanto caiu. O valor de face segue sendo o combinado; a diferença é
    // taxa do gateway e vive nas linhas de débito do próprio extrato.
    if (trans) {
      mutate(pessoaId, function (p) {
        (p.contratos || []).forEach(function (c, ci) {
          if (contratoIdx !== undefined && contratoIdx !== null && ci !== parseInt(contratoIdx, 10)) return;
          (c.meses || []).forEach(function (m) {
            if (m.key === mesKey && m.pago) {
              if (trans.data) m.pagoEm = trans.data.split("/").reverse().join("-");
              // quanto e em que moeda caiu de fato: uma mensalidade em real
              // que entra em euro pelo Stripe só é contada certo com os dois
              if (trans.valor) m.valorRecebido = trans.valor;
              if (trans.moeda) m.moedaRecebida = trans.moeda;
              if (trans.idExterno) m.idExterno = trans.idExterno;
              // por onde o dinheiro caiu: é o que permite conferir a
              // parcela com o extrato certo depois
              if (conta || trans.conta) m.conta = conta || trans.conta;
            }
          });
        });
      });
      registrarTransacao(trans, "parcela de " + mesKey
        + (conta || trans.conta ? " \u00b7 " + contaLabel(conta || trans.conta) : ""));
      // a linha vinha s\u00f3 com o n\u00famero da conta: agora esse n\u00famero tem
      // dono e as pr\u00f3ximas dele j\u00e1 chegam identificadas
      var ident = identDaTransacao(trans);
      if (ident && ehSoIdentificador(trans.descricao)) lembrarIdentificador(ident, pessoaId);
    }
    // a cobran\u00e7a do m\u00eas tinha falhado e o dinheiro apareceu no extrato:
    // o m\u00eas deixa de estar em atraso
    var pago = getPessoa(pessoaId);
    if (pago && pago.assinatura && pago.assinatura.falhou
        && pago.assinatura.falhou.slice(0, 7) === String(mesKey || "").slice(0, 7)) {
      registrarPagamentoAssinatura(pessoaId);
    }
    addHistory(pessoaId, "pagamento", "Pagamento conciliado com o extrato" + (descricao ? " · " + descricao.slice(0, 60) : ""));
  }

  // ── MARKETING ─────────────────────────────────────────────────
  function leadStatsByCanal() {
    var by = {};
    loadPessoas().forEach(function (p) {
      var c = (p.origem && p.origem.canal) || "—";
      if (!by[c]) by[c] = { canal: c, total: 0, matriculados: 0, perdidos: 0, ativos: 0 };
      by[c].total++;
      if (p.status === "aluna" || p.status === "mvs") by[c].matriculados++;
      else if (p.estagio === "perdido") by[c].perdidos++;
      else by[c].ativos++;
    });
    return Object.keys(by).map(function (k) {
      var s = by[k];
      var fechados = s.matriculados + s.perdidos;
      s.conversao = fechados > 0 ? Math.round(100 * s.matriculados / fechados) : null;
      return s;
    }).sort(function (a, b) { return b.total - a.total; });
  }
  function statsMotivosPerda() {
    var by = {};
    MOTIVOS_PERDA.forEach(function (m) { by[m] = 0; });
    loadPessoas().forEach(function (p) { if (p.motivoPerda) by[p.motivoPerda] = (by[p.motivoPerda] || 0) + 1; });
    return Object.keys(by).map(function (k) { return { motivo: k, total: by[k] }; })
      .filter(function (x) { return x.total > 0; })
      .sort(function (a, b) { return b.total - a.total; });
  }

  // ── DESTINATÁRIOS (tela Mensagens) ────────────────────────────
  // ── LINK DE PAGAMENTO ─────────────────────────────────────────
  //
  // Cobrar sem o link é mandar a pessoa procurar como pagar. O link mora
  // em dois lugares: um padrão da escola (o do Asaas, do GoCardless, do
  // que for) e o de cada aluna, quando ela tem uma assinatura própria. O
  // da aluna sempre ganha.
  //
  // O padrão aceita marcas que são trocadas na hora de montar a mensagem:
  //   {nome}  {valor}  {mes}
  // Isso serve para gerador de cobrança que aceita parâmetros na URL.
  var LINK_PAG_KEY = "isr_link_pagamento_v1";

  function linkPagamentoPadrao() {
    try { return localStorage.getItem(LINK_PAG_KEY) || ""; } catch (e) { return ""; }
  }
  function setLinkPagamentoPadrao(url) {
    try { localStorage.setItem(LINK_PAG_KEY, (url || "").trim()); } catch (e) {}
    agendarSync();
    return linkPagamentoPadrao();
  }
  function setLinkPagamento(pessoaId, url) {
    return mutate(pessoaId, function (p) {
      var antes = p.linkPagamento || "";
      p.linkPagamento = (url || "").trim();
      if (p.linkPagamento !== antes) {
        pushHist(p, "pagamento", p.linkPagamento
          ? "Link de pagamento cadastrado" : "Link de pagamento removido");
      }
    });
  }

  function linkDePagamento(pessoaOuId, opts) {
    var p = typeof pessoaOuId === "string" ? getPessoa(pessoaOuId) : pessoaOuId;
    if (!p) return "";
    opts = opts || {};
    var url = (p.linkPagamento || "").trim();
    var proprio = !!url;
    if (!url) url = linkPagamentoPadrao();
    if (!url) return "";
    var c = contratoVigente(p);
    var valor = opts.valor || (c ? c.parcelaValor : "") || "";
    var mes = opts.mes || mesAtualKey();
    url = url
      .replace(/\{nome\}/g, encodeURIComponent(p.nome || ""))
      .replace(/\{valor\}/g, encodeURIComponent(String(parseMoney(valor) || "")))
      .replace(/\{mes\}/g, encodeURIComponent(mes));
    void proprio;
    return url;
  }

  // Quem ainda não tem como pagar. Cobrar essas pessoas manda elas
  // procurarem o caminho sozinhas.
  function alunasSemLinkDePagamento() {
    if (linkPagamentoPadrao()) return [];
    return loadPessoas().filter(function (p) {
      return p.status === "aluna" && !(p.linkPagamento || "").trim()
        && parcelasAbertas(p.id).length > 0;
    }).map(function (p) { return { id: p.id, nome: p.nome }; });
  }

  function recipients() {
    return loadPessoas().map(function (p) {
      var c = contratoVigente(p);
      var venc = c && c.vencDia !== undefined && c.vencDia !== "auto" ? "dia " + c.vencDia : (c && c.vencDia === "auto" ? "auto" : "");
      return { id: p.id, nome: p.nome, telefone: p.whatsapp, tipo: p.status === "lead" ? "lead" : (STATUS_META[p.status] ? STATUS_META[p.status].label.toLowerCase() : p.status),
        turma: p.turma || "", nivel: p.nivel || "", horarios: p.horarios || "",
        valor: c ? c.parcelaValor : "", vencimento: venc,
        link: linkDePagamento(p) };
    });
  }

  // ── REATIVAÇÃO (compat CRM) ───────────────────────────────────
  function reativacao() {
    return loadPessoas().filter(function (p) {
      // quem concluiu o objetivo não entra em reativação
      return p.status === "ex-aluna" && !(p.saida && p.saida.reativavel === false);
    }).map(function (p) {
      return { id: p.id, nome: p.nome, telefone: p.whatsapp,
        motivo: (p.historico || []).filter(function (h) { return h.tipo === "perdido"; }).map(function (h) { return h.texto; })[0] || p.motivoPerda,
        ultimaTurma: p.turma };
    });
  }

  // ══════════════════════════════════════════════════════════════
  //  BANCO CENTRAL (aposentando as planilhas · fase 1)
  //  Com a URL do Apps Script configurada no portão de acesso, todo
  //  dado (pessoas, custos, modelos) é salvo num banco compartilhado
  //  — a mesma base pra Gabi, Érika e Carla, em qualquer aparelho.
  //  Sem URL, roda local (demo). Ver apps-script-sistema.js.
  // ══════════════════════════════════════════════════════════════
  var BACKEND_KEY = "isr_backend_url";
  function backendUrl() { try { return localStorage.getItem(BACKEND_KEY) || ""; } catch (e) { return ""; } }
  function setBackendUrl(u) {
    try { u ? localStorage.setItem(BACKEND_KEY, u.trim()) : localStorage.removeItem(BACKEND_KEY); } catch (e) {}
  }
  // O endereço da base ficava só no aparelho de quem o digitou. Quem
  // entrasse de outro navegador — a Érika no computador dela, qualquer
  // uma no celular — caía num sistema vazio: nenhuma aluna, nenhuma
  // turma, nenhum aviso do que tinha acontecido. Agora o endereço vem
  // no código, igual ao app da aluna. O que estiver gravado no aparelho
  // continua valendo por cima, para poder apontar uma cópia de teste.
  var CONEXAO_PADRAO = "https://script.google.com/macros/s/AKfycbxZeKxCvROSNSsT-rhcbHEZ7dAW_JlF3n21N7vp_SA5ByMEPcRIzRnbMmP62DV267M0/exec";
  function conexaoPadrao() { return CONEXAO_PADRAO; }
  function conectarPadrao() {
    // dado de exemplo nunca fala com a base real: quem está treinando na
    // demonstração não pode gravar por cima da escola
    if (exemploLigado()) return "";
    var atual = backendUrl();
    if (atual) return atual;
    setBackendUrl(CONEXAO_PADRAO);
    return CONEXAO_PADRAO;
  }
  // Aparelho novo: a base local está vazia e nada, em nenhuma tela,
  // puxa do servidor por conta própria — o sync só sobe, e só depois de
  // alguém editar alguma coisa. Sem esta pergunta a pessoa entra e vê
  // zero em tudo.
  function baseVazia() {
    try {
      var p = JSON.parse(localStorage.getItem(PESSOAS_KEY) || "[]");
      var t = JSON.parse(localStorage.getItem(TURMAS_KEY) || "[]");
      return (!p || !p.length) && (!t || !t.length);
    } catch (e) { return true; }
  }
  // ── FALAR COM A BASE ──────────────────────────────────────────
  //
  // Durante muito tempo o navegador falou com o Apps Script direto, e
  // o endereço do Web App está logo acima, em texto puro, num arquivo
  // que qualquer pessoa abre. Quem lesse o JavaScript do site lia e
  // escrevia a escola inteira, sem passar por portão nenhum.
  //
  // Agora o pedido vai para a função base do Netlify, que confere o
  // token da pessoa e só então fala com o Apps Script, com um endereço
  // e uma chave que ficam no servidor.
  //
  // REDE, enquanto o caminho novo não estiver provado em produção: se
  // a função não responder — porque a pessoa ainda não tem conta no
  // Identity, porque a variável não foi configurada, porque deu erro —
  // cai no caminho direto de antes, e a escola continua funcionando.
  // Isto sai daqui no passo seguinte, junto com o endereço acima.
  var baseDiretaAvisada = false;
  // action: a ação do Apps Script. corpo: os campos a mais do pedido —
  // { data: … } numa escrita de sistema, { id: … } ao marcar algo como
  // processado. Sem corpo, é leitura.
  function chamarBase(action, corpo) {
    var url = backendUrl();
    var direto = function () {
      if (!url) return Promise.reject(new Error("sem base"));
      if (!baseDiretaAvisada) {
        baseDiretaAvisada = true;
        try { console.warn("ISR: falando com a base pelo caminho antigo (sem token)."); } catch (e) {}
      }
      if (corpo === undefined) {
        return fetch(url + (url.indexOf("?") >= 0 ? "&" : "?") + "action=" + action)
          .then(function (r) { return r.json(); });
      }
      var b = Object.assign({ action: action }, corpo);
      return fetch(url, { method: "POST", headers: { "Content-Type": "text/plain;charset=utf-8" },
        body: JSON.stringify(b) }).then(function (r) { return r.json(); });
    };
    // dado de exemplo nunca sai do aparelho
    if (exemploLigado()) return Promise.reject(new Error("exemplo"));
    return chamarFuncao("base", { body: Object.assign({ action: action }, corpo || {}) })
      .then(function (r) {
        if (!r.ok) throw new Error("funcao " + r.status);
        return r.json();
      })
      .catch(function () { return direto(); });
  }

  var syncTimer = null;
  function agendarSync() {
    // Toda gravação passa por aqui, com banco central ou sem ele. É o
    // único lugar que já quer dizer "algo mudou", então é daqui que sai
    // o aviso para as telas abertas se redesenharem. Cinco telas
    // escutavam "isr-dados" e ninguém o disparava: a Agenda, a Central,
    // os Clubes, as Turmas e as Matrículas do ciclo ficavam velhas até
    // alguém recarregar.
    try { window.dispatchEvent(new CustomEvent("isr-dados")); } catch (e) {}
    if (!backendUrl()) return;
    clearTimeout(syncTimer);
    syncTimer = setTimeout(enviarSync, 1500); // agrupa edições em sequência
  }
  // ══════════════════════════════════════════════════════════════
  //  SINCRONIZAÇÃO COM MESCLAGEM
  //  ------------------------------------------------------------
  //  Antes: cada navegador enviava o banco inteiro e o último a salvar
  //  apagava o trabalho do outro, sem aviso. Agora, antes de gravar, o
  //  sistema lê o estado do servidor e mescla registro a registro:
  //  para cada id, vence a versão mais recente. Ninguém perde trabalho
  //  por ter salvo primeiro.
  // ══════════════════════════════════════════════════════════════
  var SYNC_ESTADO_KEY = "isr_sync_estado";
  function syncEstado() {
    try { return JSON.parse(localStorage.getItem(SYNC_ESTADO_KEY)) || { status: "local" }; }
    catch (e) { return { status: "local" }; }
  }
  function setSyncEstado(st) {
    try { localStorage.setItem(SYNC_ESTADO_KEY, JSON.stringify(st)); } catch (e) {}
    try { window.dispatchEvent(new CustomEvent("isr-sync", { detail: st })); } catch (e) {}
    return st;
  }

  // Mescla duas listas de registros por id. Vence o _v mais alto.
  // Sem _v, o registro remoto é considerado antigo (o local acabou de ser escrito).
  function mesclarLista(local, remoto, campoId) {
    var id = campoId || "id";
    var mapa = {}, ordem = [], conflitos = 0;
    (remoto || []).forEach(function (r) {
      if (!r || !r[id]) return;
      mapa[r[id]] = r; ordem.push(r[id]);
    });
    (local || []).forEach(function (l) {
      if (!l || !l[id]) return;
      var r = mapa[l[id]];
      if (!r) { mapa[l[id]] = l; ordem.push(l[id]); return; }
      var vl = l._v || 0, vr = r._v || 0;
      if (vl !== vr) conflitos++;
      mapa[l[id]] = vl >= vr ? l : r;
    });
    return { lista: ordem.map(function (k) { return mapa[k]; }), conflitos: conflitos };
  }
  // Mapas (chamadas, progresso) mesclam por chave: quem tem valor vence,
  // e havendo os dois, o mais recente.
  function mesclarMapa(local, remoto) {
    var out = Object.assign({}, remoto || {});
    Object.keys(local || {}).forEach(function (k) {
      var l = local[k], r = out[k];
      if (!r) { out[k] = l; return; }
      var vl = (l && l.salvoEm) || (l && l._v) || 0;
      var vr = (r && r.salvoEm) || (r && r._v) || 0;
      out[k] = String(vl) >= String(vr) ? l : r;
    });
    return out;
  }

  // ══════════════════════════════════════════════════════════════
  //  VERSÃO DO BANCO, BACKUP E EXPORTAÇÃO
  //  ------------------------------------------------------------
  //  Antes de entrar dado real é preciso poder voltar atrás. O banco
  //  passa a ter versão declarada, cópias automáticas antes de toda
  //  operação de risco, e exportação para arquivo.
  // ══════════════════════════════════════════════════════════════
  var ESQUEMA_VERSAO = 4;
  var ESQUEMA_KEY = "isr_esquema_versao";
  var BACKUP_KEY = "isr_backups_v1";
  var MAX_BACKUPS = 5;

  function esquemaVersao() {
    try { return parseInt(localStorage.getItem(ESQUEMA_KEY), 10) || 0; } catch (e) { return 0; }
  }
  function setEsquemaVersao(v) {
    try { localStorage.setItem(ESQUEMA_KEY, String(v)); } catch (e) {}
  }

  var CHAVES_DADOS = [PESSOAS_KEY, "isr_templates_v1", "isr_custos_v1", "isr_turmas_v1",
    "isr_eventos_v1", "isr_chamadas_v1", "isr_tarefas_v1", "isr_feriados_v1", "isr_metas_v1",
    "isr_moedas_v1", "isr_equipe_v1", "isr_calc_v1", "isr_lancamentos_v1", "isr_cambio_v1",
    "isr_precos_v1", "isr_ticket_alvo_v1", "isr_toques_v1", "isr_pulsos_v1", "isr_programas_v1",
    "isr_avisos_v1", "isr_assinatura_cfg_v1", "isr_cadencia_v1", "isr_categorias_saida_v1", "isr_extrato_reg_v1", "isr_orcamento_v1",
    "isr_resgates_v1", "isr_folha_paga_v1", "isr_comissao_faixas_v1", "isr_metas_periodo_v1",
    "isr_link_pagamento_v1", "isr_flin_url_v1", "isr_minutos_aula_v1", "isr_acessos_v1",
    "isr_contas_proprias_v1", "isr_jotform_v1", "isr_jotform_base_v1", "isr_gravadas_v1",
    "isr_booking_v1", "isr_systeme_v1", "isr_furos_ok_v1", "isr_bookclub_v1",
    // os ciclos fechados são o arquivo de cinco anos, e os clubes
    // guardam quem está em qual: nenhum dos dois pode ficar de fora
    // de uma cópia que se chama "contém tudo"
    // o caderno e o cofre de palavras são escritos pela aluna, no
    // aparelho dela, e não existem em nenhuma outra chave: cópia que os
    // deixa de fora não é cópia de tudo
    "isr_bookclub_aula_v1", "isr_ciclos_v1", "isr_clubes_v1",
    "isr_caderno_v1", "isr_palavras_v1",
    // o syllabus é o trabalho pedagógico do ciclo e o plano é o que a
    // professora ajustou nele: perder isso é perder o planejamento
    "isr_syllabus_v1", "isr_planos_v1", "isr_materiais_v1"];

  function snapshotDados() {
    var d = { _versao: ESQUEMA_VERSAO, _em: new Date().toISOString() };
    CHAVES_DADOS.forEach(function (k) {
      try { var v = localStorage.getItem(k); if (v !== null) d[k] = v; } catch (e) {}
    });
    return d;
  }
  function backupsLista() {
    try { return JSON.parse(localStorage.getItem(BACKUP_KEY)) || []; } catch (e) { return []; }
  }
  // Cópia antes de toda operação que pode destruir dado. Guarda as cinco
  // últimas: mais que isso não cabe no armazenamento do navegador.
  function criarBackup(motivo) {
    var l = backupsLista();
    l.unshift({ id: "bk" + Date.now(), em: new Date().toISOString(),
      motivo: motivo || "manual", dados: snapshotDados() });
    l = l.slice(0, MAX_BACKUPS);
    try { localStorage.setItem(BACKUP_KEY, JSON.stringify(l)); }
    catch (e) {
      // sem espaço: guarda só o mais recente
      try { localStorage.setItem(BACKUP_KEY, JSON.stringify(l.slice(0, 1))); } catch (e2) {}
    }
    return l[0];
  }
  function restaurarBackup(id) {
    var bk = backupsLista().filter(function (b) { return b.id === id; })[0];
    if (!bk) return { restaurado: false, motivo: "nao_encontrado" };
    criarBackup("antes de restaurar");
    CHAVES_DADOS.forEach(function (k) {
      try {
        if (bk.dados[k] !== undefined) localStorage.setItem(k, bk.dados[k]);
        else localStorage.removeItem(k);
      } catch (e) {}
    });
    agendarSync();
    return { restaurado: true, em: bk.em, motivo: bk.motivo };
  }
  function apagarBackup(id) {
    var l = backupsLista().filter(function (b) { return b.id !== id; });
    try { localStorage.setItem(BACKUP_KEY, JSON.stringify(l)); } catch (e) {}
    return l;
  }

  // Exportação: o dado é da escola, não do navegador.
  function exportarTudo() {
    return JSON.stringify(snapshotDados(), null, 2);
  }
  function importarTudo(texto) {
    var d;
    try { d = JSON.parse(texto); } catch (e) { return { ok: false, erro: "Arquivo não é um JSON válido." }; }
    if (!d || typeof d !== "object") return { ok: false, erro: "Arquivo vazio ou em formato inesperado." };
    if (!d[PESSOAS_KEY]) return { ok: false, erro: "O arquivo não contém o cadastro de alunas." };
    criarBackup("antes de importar arquivo");
    var n = 0;
    CHAVES_DADOS.forEach(function (k) {
      if (d[k] === undefined) return;
      try { localStorage.setItem(k, d[k]); n++; } catch (e) {}
    });
    setEsquemaVersao(parseInt(d._versao, 10) || ESQUEMA_VERSAO);
    agendarSync();
    var pessoas = 0;
    try { pessoas = (JSON.parse(d[PESSOAS_KEY]) || []).length; } catch (e) {}
    return { ok: true, blocos: n, pessoas: pessoas, versao: d._versao || null, em: d._em || "" };
  }

  // Exportação de uma pessoa — o que o GDPR chama de portabilidade.
  function exportarPessoa(id) {
    var p = getPessoa(id);
    if (!p) return null;
    return JSON.stringify({
      pessoa: p,
      contatos: toquesLista().filter(function (x) { return x.pessoaId === id; }),
      avaliacoes: pulsosLista().filter(function (x) { return x.pessoaId === id; }),
      presencas: (function () {
        var m = chamadasAll(), out = [];
        Object.keys(m).forEach(function (k) {
          if (m[k].presencas && m[k].presencas[id] !== undefined)
            out.push({ turma: m[k].turma, data: m[k].data, estado: estadoPresenca(m[k].presencas[id]) });
        });
        return out;
      })(),
      moedas: moedasDe(id),
      exportadoEm: new Date().toISOString()
    }, null, 2);
  }
  // Exclusão a pedido da pessoa: apaga o cadastro e tudo que aponta para ela.
  function apagarPessoa(id, motivo) {
    var p = getPessoa(id);
    if (!p) return { apagado: false };
    criarBackup("antes de apagar " + p.nome);
    // vira lápide (só o id): os dados somem, e o sync espalha o
    // apagamento em vez de ressuscitar a pessoa nos outros aparelhos
    deleteLead(id);
    toquesSave(toquesLista().filter(function (x) { return x.pessoaId !== id; }));
    pulsosSave(pulsosLista().filter(function (x) { return x.pessoaId !== id; }));
    var m = chamadasAll();
    Object.keys(m).forEach(function (k) {
      if (m[k].presencas) delete m[k].presencas[id];
      if (m[k].tarefas) delete m[k].tarefas[id];
    });
    chamadasSaveLocal(m);
    programasSave(programasLista().map(function (pr) {
      pr.participantes = (pr.participantes || []).filter(function (x) { return x !== id; });
      if (pr.progresso) delete pr.progresso[id];
      if (pr.moedas) delete pr.moedas[id];
      return pr;
    }));
    eventosSave(eventosLista().map(function (e) {
      if (e.rsvps) delete e.rsvps[id];
      e.manuais = (e.manuais || []).filter(function (x) { return x !== id; });
      return e;
    }));
    return { apagado: true, nome: p.nome, motivo: motivo || "" };
  }

  // ── DUPLICADAS ────────────────────────────────────────────────
  // Dois aparelhos que criaram a mesma pessoa (importação no computador
  // E no celular antes de conectar, p. ex.) geram dois registros com ids
  // diferentes — e a mesclagem do sync, que trabalha por id, soma os
  // dois. Aqui a escola junta as cópias: tudo vira um registro só e a
  // cópia vira lápide (some em todos os aparelhos).
  function pontosDeRegistro(p) {
    return (p.contratos || []).length * 100 + (p.historico || []).length
      + (p.turma ? 10 : 0) + (p.email ? 2 : 0) + (p.whatsapp ? 2 : 0)
      + (p.status === "aluna" || p.status === "mvs" ? 50 : 0);
  }
  // nomes "parecidos": todas as palavras do nome mais curto aparecem no
  // mais comprido (mínimo 2 palavras) — pega "Ana Souza" × "Ana Paula
  // Souza", sem casar nomes de uma palavra só
  function nomesParecem(a, b) {
    var pa = semAcento(a || "").split(/\s+/).filter(Boolean);
    var pb = semAcento(b || "").split(/\s+/).filter(Boolean);
    if (pa.length < 2 || pb.length < 2) return false;
    var curto = pa.length <= pb.length ? pa : pb;
    var longo = pa.length <= pb.length ? pb : pa;
    return curto.every(function (w) { return longo.indexOf(w) >= 0; });
  }
  function pessoasDuplicadas() {
    var vivos = loadPessoas();
    var grupos = {};
    vivos.forEach(function (p) {
      var chaves = [];
      if (p.nome) chaves.push("n:" + semAcento(p.nome) + "|mesmo nome");
      if (p.email) chaves.push("e:" + String(p.email).toLowerCase().trim() + "|mesmo e-mail");
      var f = p.whatsapp ? chaveFone(p.whatsapp) : "";
      if (f) chaves.push("f:" + f + "|mesmo telefone");
      chaves.forEach(function (k) { (grupos[k] = grupos[k] || []).push(p); });
    });
    var pares = {};
    var registrar = function (a, b, motivo) {
      if (a.id === b.id) return;
      var par = [a, b].sort(function (x, y) { return pontosDeRegistro(y) - pontosDeRegistro(x); });
      var k = [par[0].id, par[1].id].join("|");
      if (!pares[k]) pares[k] = { manter: par[0], apagar: par[1], motivo: motivo };
    };
    Object.keys(grupos).forEach(function (k) {
      var g = grupos[k], motivo = k.split("|")[1];
      for (var i = 0; i < g.length; i++) for (var j = i + 1; j < g.length; j++)
        registrar(g[i], g[j], motivo);
    });
    // segunda passada: nome curto dentro do nome completo (importação em
    // dois aparelhos raramente escreve o nome exatamente igual)
    for (var i = 0; i < vivos.length; i++) for (var j = i + 1; j < vivos.length; j++) {
      if (nomesParecem(vivos[i].nome, vivos[j].nome)) registrar(vivos[i], vivos[j], "nomes parecidos");
    }
    return Object.keys(pares).map(function (k) { return pares[k]; });
  }
  // ── ATUALIZAR CONTATOS ────────────────────────────────────────
  // Cola-se as colunas Nome + E-mail (e WhatsApp, se houver) direto da
  // planilha. Diferente da importação de leads — que só preenche campo
  // vazio — aqui o e-mail da planilha VALE: quem tinha um antigo é
  // atualizado, com o valor anterior guardado na linha do tempo.
  function lerAtualizacaoContatos(texto) {
    var linhas = String(texto || "").split(/\r?\n/).map(function (l) { return l.trim(); }).filter(Boolean);
    var out = [];
    linhas.forEach(function (linha) {
      var celulas = linha.split(/\t|\s{3,}| \| /).map(function (c) {
        return c.replace(/&#13;|\r/g, "").trim();
      }).filter(Boolean);
      if (!celulas.length) return;
      var nome = celulas[0];
      if (!nome || /^nome$/i.test(nome) || nome.indexOf("@") >= 0) return; // cabeçalho/linha torta
      // o e-mail é a primeira célula com @; célula com dois e-mails
      // ("a@x / b@y") fica com o primeiro
      var email = "";
      celulas.slice(1).forEach(function (c) {
        if (email || c.indexOf("@") < 0) return;
        email = c.split(/[\s\/,;]+/).filter(function (t) { return t.indexOf("@") > 0; })[0] || "";
      });
      email = email.toLowerCase();
      var fone = "";
      celulas.slice(1).forEach(function (c) {
        if (fone || c.indexOf("@") >= 0) return;
        if ((c.match(/\d/g) || []).length >= 8) fone = c;
      });
      if (!email && !fone) { out.push({ nome: nome, acao: "sem-contato" }); return; }
      // o nome da planilha pode ter apelido ou anotação depois de " - "
      var nomeLimpo = nome.split(" - ")[0].split(" (")[0].trim();
      var pes = pessoaPorNome(nomeLimpo) || pessoaPorNome(nome)
        || pessoaPorContato(email, fone)
        || pessoaPorNomeParecido(nomeLimpo) || pessoaPorNomeParecido(nome);
      if (!pes) { out.push({ nome: nome, email: email, acao: "nao-encontrada" }); return; }
      var emailAtual = String(pes.email || "").toLowerCase().trim();
      var mudaEmail = email && emailAtual !== email;
      var mudaFone = fone && chaveFone(fone) !== chaveFone(pes.whatsapp || "");
      out.push({ nome: nome, pessoaId: pes.id, nomeSistema: pes.nome,
        email: email, fone: fone, emailAtual: pes.email || "",
        mudaEmail: mudaEmail, mudaFone: mudaFone,
        acao: (mudaEmail || mudaFone) ? "atualizar" : "igual" });
    });
    if (!out.length) return { ok: false, linhas: [],
      erro: "Nenhuma linha com nome encontrada. Cole as colunas Nome e E-mail da planilha." };
    return { ok: true, linhas: out };
  }
  function aplicarAtualizacaoContatos(leitura) {
    if (!leitura || !leitura.ok) return { ok: false };
    var atualizadas = 0;
    (leitura.linhas || []).forEach(function (l) {
      if (l.acao !== "atualizar") return;
      mutate(l.pessoaId, function (x) {
        if (l.mudaEmail) {
          pushHist(x, "contato", "E-mail atualizado pela planilha"
            + (x.email ? " · era " + x.email : ""));
          x.email = l.email;
        }
        if (l.mudaFone) {
          pushHist(x, "contato", "WhatsApp atualizado pela planilha"
            + (x.whatsapp ? " · era " + x.whatsapp : ""));
          x.whatsapp = l.fone;
        }
      });
      atualizadas++;
    });
    return { ok: true, atualizadas: atualizadas };
  }

  // mescla todos os pares detectados de uma vez; pares cuja cópia já
  // virou lápide numa mesclagem anterior são pulados
  function mesclarTodasDuplicadas() {
    var feitos = 0;
    pessoasDuplicadas().forEach(function (par) {
      if (mesclarPessoas(par.manter.id, par.apagar.id)) feitos++;
    });
    return feitos;
  }
  function mesclarPessoas(manterId, apagarId) {
    var alvo = getPessoa(manterId), dup = getPessoa(apagarId);
    if (!alvo || !dup || manterId === apagarId) return false;
    criarBackup("antes de mesclar " + dup.nome + " em " + alvo.nome);
    mutate(manterId, function (x) {
      // escalares: preenche só o que falta no registro que fica
      ["email", "whatsapp", "nivel", "turma", "professora", "moeda", "canal"].forEach(function (c) {
        if (!x[c] && dup[c]) x[c] = dup[c];
      });
      if ((!x.contratos || !x.contratos.length) && (dup.contratos || []).length) x.contratos = dup.contratos;
      if (!x.origem && dup.origem) x.origem = dup.origem;
      if ((!x.inscricao || !x.inscricao.length) && (dup.inscricao || []).length) x.inscricao = dup.inscricao;
      x.documentos = (x.documentos || []).concat(dup.documentos || []);
      x.tags = (x.tags || []).concat((dup.tags || []).filter(function (t) {
        return (x.tags || []).indexOf(t) < 0; }));
      // a linha do tempo da cópia não se perde: entra na do registro que fica
      var ja = {};
      (x.historico || []).forEach(function (h) { ja[h.data + "|" + h.texto] = 1; });
      (dup.historico || []).forEach(function (h) {
        if (!ja[h.data + "|" + h.texto]) (x.historico = x.historico || []).push(h);
      });
      (x.historico || []).sort(function (a, b) { return String(a.data) < String(b.data) ? -1 : 1; });
      pushHist(x, "contato", "Registro duplicado mesclado (era \"" + dup.nome + "\")");
    });
    // tudo que apontava para a cópia passa a apontar para quem fica
    toquesSave(toquesLista().map(function (t) {
      if (t.pessoaId === apagarId) { t.pessoaId = manterId; carimbar(t); } return t; }));
    pulsosSave(pulsosLista().map(function (t) {
      if (t.pessoaId === apagarId) { t.pessoaId = manterId; carimbar(t); } return t; }));
    var m = chamadasAll();
    Object.keys(m).forEach(function (k) {
      ["presencas", "tarefas"].forEach(function (campo) {
        var mapa = m[k][campo];
        if (mapa && mapa[apagarId] !== undefined) {
          if (mapa[manterId] === undefined) mapa[manterId] = mapa[apagarId];
          delete mapa[apagarId];
        }
      });
    });
    chamadasSaveLocal(m);
    var moedas = moedasAjustesAll();
    if (moedas[apagarId]) {
      moedas[manterId] = (moedas[manterId] || []).concat(moedas[apagarId]);
      delete moedas[apagarId];
      try { localStorage.setItem(MOEDAS_KEY, JSON.stringify(moedas)); } catch (e) {}
    }
    programasSave(programasLista().map(function (pr) {
      var tinha = (pr.participantes || []).indexOf(apagarId) >= 0;
      pr.participantes = (pr.participantes || []).filter(function (x) { return x !== apagarId; });
      if (tinha && pr.participantes.indexOf(manterId) < 0) pr.participantes.push(manterId);
      ["progresso", "respostas", "moedas"].forEach(function (campo) {
        var mapa = pr[campo];
        if (!mapa) return;
        Object.keys(mapa).forEach(function (k) {
          if (k.indexOf(apagarId) !== 0) return;
          var novo = k.replace(apagarId, manterId);
          if (mapa[novo] === undefined) mapa[novo] = mapa[k];
          delete mapa[k];
        });
      });
      if (tinha) carimbar(pr);
      return pr;
    }));
    eventosSave(eventosLista().map(function (e) {
      if (e.rsvps && e.rsvps[apagarId] !== undefined) {
        if (e.rsvps[manterId] === undefined) e.rsvps[manterId] = e.rsvps[apagarId];
        delete e.rsvps[apagarId]; carimbar(e);
      }
      if ((e.manuais || []).indexOf(apagarId) >= 0) {
        e.manuais = e.manuais.filter(function (x) { return x !== apagarId; });
        if (e.manuais.indexOf(manterId) < 0) e.manuais.push(manterId);
        carimbar(e);
      }
      return e;
    }));
    // por fim a cópia vira lápide — some em todos os aparelhos
    deleteLead(apagarId);
    return true;
  }

  function payloadLocal() {
    return {
      // pessoas vai CRU (com as lápides): é o sync que espalha o
      // "esta aluna foi apagada" para os outros aparelhos
      pessoas: loadPessoasRaw(), custos: custosLista(), templates: tplStore(),
      // turmas vai CRU (com as lápides): sem isto a marca de "apagada"
      // não subia ao banco e o puxe seguinte devolvia a turma
      turmas: turmasRaw(), eventos: eventosLista(), chamadas: chamadasAll(),
      clubes: clubesRaw(),
      // tarefas vai CRU (com as lápides das pendências removidas)
      tarefas: tarefasRaw(), feriados: feriadosLista(), metas: metasAtuais(), moedas: moedasAjustesAll(),
      // os ciclos já fechados: registro acadêmico, vai junto
      ciclos: ciclosLista(),
      // equipe vai CRUA (com as lápides): sem isto a marca de "saiu da
      // equipe" não subia ao banco e o puxe seguinte devolvia a pessoa
      equipe: equipeRaw(), calc: calcParams(),
      lancamentos: lancamentosRaw(), cambio: taxaCambio(), contas: contasLista(),
      toques: toquesLista(), pulsos: pulsosLista(), precos: precosLista(),
      // programas vai CRU (com as lápides): é o sync que espalha o
      // "esta turma foi apagada" para os outros aparelhos
      programas: programasRaw(),
      // configurações que o app da aluna lê: sem elas no payload, o grupo
      // da assinatura e o Book Club nunca chegavam ao aparelho da aluna
      assinaturaCfg: assinaturaCfg(), bookclub: bookclubUrl(), bookclubAula: bookclubAula(),
      // o que a aluna escreve no aparelho dela: sem isto no payload, a
      // nota da aula e o cofre de palavras morriam ao trocar de celular
      caderno: cadernoAll(), palavras: palavrasAll(),
      // a aula ao vivo é um fato compartilhado: a professora abre no
      // aparelho dela e o caderno de cinco alunas tem de abrir junto
      aulasVivas: aulasVivasAll(),
      // o que o desenho novo trouxe: a substituição é combinada entre
      // duas pessoas e tem de chegar nos dois aparelhos; a entrega do
      // projeto e a sequência da particular são registro da aluna
      substituicoes: subsRaw(), reunioes: reunioesRaw(),
      projetoEntregas: projEntregasAll(), sequencias: seqAll(),
      // a chamada do clube vale a mesma coisa: é ela que diz quem faltou
      clubeChamadas: clubeChamadasAll(),
      // o syllabus é da escola e o plano é da turma: os dois precisam
      // chegar ao aparelho da professora que vai dar a aula
      syllabus: syllabusAll(), planos: planosAll(), materiais: materiaisAll(),
      atualizadoEm: new Date().toISOString(), por: (gestaoUser() || {}).email || ""
    };
  }

  function aplicarRemoto(d) {
    if (!d) return;
    if (d.pessoas) savePessoasLocal(d.pessoas);
    if (d.custos) custosSaveLocal(d.custos);
    if (d.templates) tplSaveLocal(d.templates);
    var grava = function (k, v) { if (v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} } };
    grava(TURMAS_KEY, d.turmas); grava(EVENTOS_KEY, d.eventos); grava(CHAMADAS_KEY, d.chamadas);
    grava(CLUBES_KEY, d.clubes);
    grava(TAREFAS_KEY, d.tarefas); grava(FERIADOS_KEY, d.feriados); grava(METAS_KEY, d.metas);
    grava(MOEDAS_KEY, d.moedas); grava(EQUIPE_KEY, d.equipe); grava(CALC_KEY, d.calc);
    grava(LANC_KEY, d.lancamentos); grava(TOQUES_KEY, d.toques); grava(PULSOS_KEY, d.pulsos);
    grava(PRECOS_KEY, d.precos); grava(PROGRAMAS_KEY, d.programas);
    grava(CONTAS_KEY, d.contas);
    grava(CADERNO_KEY, d.caderno); grava(PALAVRAS_KEY, d.palavras);
    grava(AULA_VIVA_KEY, d.aulasVivas);
    grava(SUBS_KEY, d.substituicoes); grava(REUNIOES_KEY, d.reunioes);
    grava(PROJ_KEY, d.projetoEntregas); grava(SEQ_KEY, d.sequencias);
    grava(CLUBE_CHAMADAS_KEY, d.clubeChamadas);
    grava(SYLLABUS_KEY, d.syllabus); grava(PLANOS_KEY, d.planos);
    grava(MATERIAIS_KEY, d.materiais);
    if (d.ciclos) { try { localStorage.setItem(CICLOS_KEY, JSON.stringify(d.ciclos)); } catch (e) {} janelasCache = null; }
    if (d.assinaturaCfg) { try { localStorage.setItem(ASSIN_CFG_KEY, JSON.stringify(d.assinaturaCfg)); } catch (e) {} }
    if (d.bookclub) { try { localStorage.setItem(BOOKCLUB_KEY, String(d.bookclub)); } catch (e) {} }
    if (d.bookclubAula) { try { localStorage.setItem("isr_bookclub_aula_v1", JSON.stringify(d.bookclubAula)); } catch (e) {} }
    if (d.cambio) { try { localStorage.setItem(CAMBIO_KEY, String(d.cambio)); } catch (e) {} }
  }

  // Lê o servidor, mescla com o local e devolve o resultado da mesclagem.
  function mesclarComRemoto(remoto) {
    var local = payloadLocal();
    if (!remoto) return { data: local, conflitos: 0 };
    var conflitos = 0;
    var lista = function (campo, idCampo) {
      var r = mesclarLista(local[campo], remoto[campo], idCampo);
      conflitos += r.conflitos;
      return r.lista;
    };
    var data = {
      pessoas: lista("pessoas"),
      custos: local.custos,               // lista curta e sem id: última edição vale
      templates: local.templates,
      turmas: lista("turmas"),
      clubes: lista("clubes"),
      eventos: lista("eventos"),
      chamadas: mesclarMapa(local.chamadas, remoto.chamadas),
      tarefas: lista("tarefas"),
      feriados: lista("feriados"),
      metas: local.metas,
      moedas: mesclarMapa(local.moedas, remoto.moedas),
      equipe: lista("equipe"),
      calc: local.calc,
      lancamentos: lista("lancamentos"),
      contas: lista("contas"),
      toques: lista("toques"),
      pulsos: lista("pulsos"),
      precos: lista("precos"),
      programas: lista("programas"),
      // o caderno é um registro por aula de cada aluna, então mescla
      // nota a nota; o cofre de palavras é uma lista por aluna, e vale
      // inteiro — é dela, e ela escreve num aparelho de cada vez
      caderno: mesclarMapa(local.caderno, remoto.caderno),
      aulasVivas: mesclarMapa(local.aulasVivas, remoto.aulasVivas),
      // substituição e reunião têm id próprio e mesclam como lista; a
      // entrega do projeto e a sequência da aluna são mapas
      substituicoes: lista("substituicoes"),
      reunioes: lista("reunioes"),
      projetoEntregas: mesclarMapa(local.projetoEntregas, remoto.projetoEntregas),
      sequencias: mesclarMapa(local.sequencias, remoto.sequencias),
      clubeChamadas: mesclarMapa(local.clubeChamadas, remoto.clubeChamadas),
      palavras: mesclarMapa(local.palavras, remoto.palavras),
      // o syllabus tem id por sessão e mescla como lista; o plano é um
      // mapa turma|sessão, e cada aula tem a sua professora
      syllabus: lista("syllabus"),
      planos: mesclarMapa(local.planos, remoto.planos),
      materiais: mesclarMapa(local.materiais, remoto.materiais),
      assinaturaCfg: local.assinaturaCfg, bookclub: local.bookclub, bookclubAula: local.bookclubAula,
      cambio: local.cambio,
      atualizadoEm: new Date().toISOString(),
      por: (gestaoUser() || {}).email || ""
    };
    return { data: data, conflitos: conflitos };
  }

  var syncEmCurso = false;
  function enviarSync() {
    var url = backendUrl();
    if (!url) { setSyncEstado({ status: "local", em: new Date().toISOString() }); return; }
    if (syncEmCurso) { agendarSync(); return; }
    syncEmCurso = true;
    setSyncEstado({ status: "sincronizando" });
    chamarBase("sistemaLoad")
      .then(function (d) {
        var m = mesclarComRemoto(d && d.ok ? d.data : null);
        aplicarRemoto(m.data);            // o local já fica com o resultado da mesclagem
        return chamarBase("sistemaSave", { data: m.data })
          .then(function () {
            setSyncEstado({ status: "ok", em: m.data.atualizadoEm, conflitos: m.conflitos });
          });
      })
      .catch(function () {
        setSyncEstado({ status: "erro", em: new Date().toISOString() });
      })
      .then(function () { syncEmCurso = false; });
  }
  function carregarDoBackend(cb) {
    var url = backendUrl();
    if (!url) { if (cb) cb(false); return; }
    // puxar também é sincronizar: sem carimbar o estado, a espera e a
    // falha aconteciam sem aparecer em lugar nenhum
    setSyncEstado({ status: "sincronizando" });
    var carimbar = function (ok, em) {
      setSyncEstado(ok ? { status: "ok", em: em || new Date().toISOString() }
                       : { status: "erro", em: new Date().toISOString() });
      if (cb) cb(ok);
    };
    try {
      chamarBase("sistemaLoad")
        .then(function (d) {
          if (d && d.ok && d.data) {
            // PUXAR NUNCA SUBSTITUI: mescla registro a registro, igual ao
            // envio. Substituir apagava edição local feita segundos antes
            // — os links digitados nas turmas sumiam ao trocar de tela,
            // porque a tela nova puxava o servidor (ainda sem os links)
            // por cima do que acabara de ser salvo aqui.
            var m = mesclarComRemoto(d.data);
            var resultado = m.data;
            // Campos sem id (custos, modelos, metas, calculadora, câmbio)
            // não têm carimbo por registro: no puxe, vale o servidor —
            // é o que garante que um aparelho novo receba tudo.
            ["custos", "templates", "metas", "calc", "cambio", "ciclos",
             "assinaturaCfg", "bookclub", "bookclubAula"].forEach(function (k) {
              if (d.data[k] !== undefined && d.data[k] !== null) resultado[k] = d.data[k];
            });
            aplicarRemoto(resultado);
            try { localStorage.setItem("isr_sync_em", d.data.atualizadoEm || ""); } catch (e) {}
            carimbar(true, d.data.atualizadoEm);
          } else carimbar(false);
        }).catch(function () { carimbar(false); });
    } catch (e) { carimbar(false); }
  }
  function processarCadastrosPendentes(cb) {
    var url = backendUrl();
    if (!url) { if (cb) cb(0); return; }
    try {
      chamarBase("cadastrosPendentes")
        .then(function (d) {
          if (!d || !d.ok || !d.itens || !d.itens.length) { if (cb) cb(0); return; }
          var novos = 0;
          d.itens.forEach(function (c) {
            var existe = loadPessoas().filter(function (p) {
              return (c.whatsapp && p.whatsapp === c.whatsapp) || (c.email && p.email && p.email === c.email);
            })[0];
            if (!existe) {
              var p = novaPessoa({ nome: c.nome, whatsapp: c.whatsapp, email: c.email, canal: "Cadastro online" });
              mutate(p.id, function (pp) {
                pp.origem = { canal: "Cadastro online", detalhe: "link de cadastro", veioDe: "-", entrouPor: "link" };
                if (c.turmaInteresse) pp.turmaInteresse = c.turmaInteresse;
                pp.badge = c.comprovante ? "sinal enviado" : "cadastro online";
                if (c.comprovante) {
                  pp.documentos = pp.documentos || [];
                  pp.documentos.push({ nome: "Comprovante do sinal" + (c.sinal ? " (" + c.sinal + ")" : ""), link: c.comprovante });
                }
                pushHist(pp, "criado", "Cadastro online recebido" + (c.sinal ? " · sinal: " + c.sinal : "") + (c.comprovante ? " · comprovante anexado" : ""));
              });
              novos++;
            }
            try { chamarBase("cadastroProcessado", { id: c.id }).catch(function () {}); }
            catch (e) {}
          });
          if (cb) cb(novos);
        }).catch(function () { if (cb) cb(0); });
    } catch (e) { if (cb) cb(0); }
  }

  // ── ATIVIDADES DO DESAFIO (Zapier → banco central → programa) ──
  //
  // O Zapier grava cada resposta do desafio na aba "Atividades
  // recebidas" do banco. Aqui o sistema puxa, encontra a aluna pelo
  // nome (com variações), garante que ela participa do programa ativo
  // e registra a resposta na semana certa. Nome que não casa vira
  // pendência para resolver à mão — nada se perde em silêncio.
  function resumoAtividade(c) {
    c = c || {};
    var pecas = [];
    if (c.mais_dificil) pecas.push("Mais difícil: " + c.mais_dificil);
    var RUB = [["rubrica_1_fala_continua", "fala contínua"], ["rubrica_2_estrutura", "estrutura"],
      ["rubrica_3_preparacao", "preparação"], ["rubrica_4_dirigida", "dirigida"]];
    var rub = RUB.map(function (r) { return c[r[0]] ? r[1] + " " + c[r[0]] : ""; })
      .filter(Boolean).join(", ");
    if (rub) pecas.push("Rubricas: " + rub);
    if (c.video_escolhido) pecas.push("Vídeo: " + c.video_escolhido);
    if (c.categorias) pecas.push("Categorias: " + c.categorias);
    if (c.frases_coletadas) pecas.push("Frases coletadas: " + c.frases_coletadas);
    if (c.frases_adaptadas) pecas.push("Frases adaptadas: " + c.frases_adaptadas);
    if (c.testes_feitos) pecas.push("Testes: " + c.testes_feitos);
    if (c.para_o_grupo) pecas.push("Para o grupo: " + c.para_o_grupo);
    return (pecas.join(" · ") || "Atividade recebida").slice(0, 900);
  }
  function processarAtividadesPendentes(cb) {
    var url = backendUrl();
    if (!url) { if (cb) cb(0); return; }
    try {
      chamarBase("atividadesPendentes")
        .then(function (d) {
          if (!d || !d.ok || !d.itens || !d.itens.length) { if (cb) cb(0); return; }
          var novos = 0;
          d.itens.forEach(function (a) {
            // e-mail primeiro (é único e exato); nome é a reserva
            var c = a.campos || {};
            var pes = pessoaPorContato(c.email, c.whatsapp)
              || pessoaPorNome(a.nome) || pessoaPorNomeParecido(a.nome);
            if (pes) {
              var ativos = programasLista().filter(function (x) { return !x.encerrado; });
              var pg = ativos.filter(function (x) {
                return (x.participantes || []).indexOf(pes.id) >= 0; })[0] || ativos[0];
              var semana = parseInt(a.semana, 10) || 1;
              if (pg) {
                if ((pg.participantes || []).indexOf(pes.id) < 0) addParticipante(pg.id, pes.id);
                responderMissao(pg.id, pes.id, semana, resumoAtividade(a.campos));
              } else {
                mutate(pes.id, function (x) {
                  pushHist(x, "contato", "Atividade da semana " + semana + " recebida: "
                    + resumoAtividade(a.campos).slice(0, 300));
                });
              }
              novos++;
            } else {
              addTarefa({ titulo: "Atividade recebida de \"" + a.nome + "\" — pessoa não encontrada",
                detalhe: "Semana " + (a.semana || "?") + " · confira o nome e registre no programa",
                dono: "Gabi", por: "sistema" });
            }
            try { chamarBase("atividadeProcessada", { id: a.id }).catch(function () {}); }
            catch (e) {}
          });
          if (cb) cb(novos);
        }).catch(function () { if (cb) cb(0); });
    } catch (e) { if (cb) cb(0); }
  }

  // Assinaturas vindas do systeme pelo Zapier. A planilha é a caixa de
  // entrada; aqui o evento vira ação: assinou ativa (criando a pessoa se
  // ela ainda não existe), cancelou encerra. O mesmo motor da lista
  // colada na Agenda — que continua valendo como conferência.
  function processarAssinaturasPendentes(cb) {
    var url = backendUrl();
    if (!url) { if (cb) cb(0); return; }
    try {
      chamarBase("assinaturasPendentes")
        .then(function (d) {
          if (!d || !d.ok || !d.itens || !d.itens.length) { if (cb) cb(0); return; }
          var mexeu = 0;
          d.itens.forEach(function (ev) {
            var email = String(ev.email || "").trim().toLowerCase();
            if (!email) return;
            var pes = loadPessoas().filter(function (x) {
              return (x.email || "").trim().toLowerCase() === email;
            })[0];
            if (ev.evento === "cancelou") {
              if (pes && pes.assinatura && !pes.assinatura.encerrada) {
                var ateEv = String(ev.ate || "").slice(0, 10);
                encerrarAssinatura(pes.id, "Cancelou no systeme", true,
                  /^\d{4}-\d{2}-\d{2}$/.test(ateEv) ? ateEv : undefined);
                mexeu++;
              }
            } else if (ev.evento === "falhou") {
              if (pes && pes.assinatura) {
                registrarFalhaAssinatura(pes.id, ev.ate || ev.recebidoEm);
                mexeu++;
              }
            } else if (ev.evento === "pagou") {
              if (pes && assinaturaFalhando(pes)) {
                registrarPagamentoAssinatura(pes.id);
                mexeu++;
              }
            } else {
              if (!pes) {
                pes = novaPessoa({ nome: ev.nome || email.split("@")[0], email: email,
                  origem: "Assinatura" });
              }
              if (!assinaturaAtiva(pes)) {
                ativarAssinatura(pes.id, { valor: ev.valor || "27", moeda: ev.moeda || "\u20ac" });
                mexeu++;
                // o convite do Netlify continua sendo um passo humano
                // enquanto o Zap não cuidar dele
                addTarefa({ titulo: "Convidar " + (pes.nome || email) + " no Netlify",
                  detalhe: email + " · assinou pelo systeme e precisa do acesso ao app",
                  dono: "Gabi", por: "sistema" });
              }
            }
            try { chamarBase("assinaturaProcessada", { id: ev.id }).catch(function () {}); }
            catch (e) {}
          });
          if (cb) cb(mexeu);
        }).catch(function () { if (cb) cb(0); });
    } catch (e) { if (cb) cb(0); }
  }

  // ao abrir qualquer tela: puxa a base compartilhada + cadastros novos
  // (silencioso). E enquanto a tela fica aberta, repete a cada 5 minutos —
  // inscrição que chega pelo link de cadastro entra sozinha no funil.
  // Quando algo novo chega, o evento "isr-dados-novos" avisa a tela
  // aberta para se redesenhar.
  function puxarNovidades() {
    carregarDoBackend(function () {
      processarCadastrosPendentes(function (n1) {
        processarAtividadesPendentes(function (n2) {
          processarAssinaturasPendentes(function (n3) {
            var novos = (n1 || 0) + (n2 || 0) + (n3 || 0);
            if (novos > 0) {
              try { window.dispatchEvent(new CustomEvent("isr-dados-novos", { detail: { novos: novos } })); } catch (e) {}
            }
          });
        });
      });
    });
  }
  try { setTimeout(puxarNovidades, 50); } catch (e) {}
  try { setInterval(puxarNovidades, 5 * 60 * 1000); } catch (e) {}
  // O aparelho que TEM os dados precisa subi-los ao menos uma vez — antes,
  // só uma edição disparava o envio, e um celular recém-conectado que
  // ninguém editava nunca alimentava o banco central. O envio mescla com
  // o remoto antes de gravar, então rodar sempre é seguro.
  try { setTimeout(function () { if (backendUrl()) agendarSync(); }, 1000); } catch (e) {}

  // ── ACESSO À GESTÃO (v1 — fechadura por e-mail) ───────────────
  // O acesso definitivo virá do magic link com papel validado no
  // Apps Script; por enquanto: allowlist de e-mails + sessão local.
  // Fundadora: acesso total, independente do cadastro de Equipe.
  // Todo o resto do time entra pela tela Equipe.
  var GESTAO_EMAILS = {
    "gabisouza.prof@gmail.com": { perfil: "gestora", nome: "Gabi", fundadora: true }
  };
  function gestaoUser() {
    try { return JSON.parse(localStorage.getItem("isr_gestao_user")) || null; } catch (e) { return null; }
  }

  // ── VER COMO ──────────────────────────────────────────────────
  //
  // Quem cuida da escola precisa conseguir olhar o sistema pelos
  // olhos de quem trabalha nela: a fila da Carla, o painel da
  // professora, o menu que cada uma vê. Isso existia no seletor de
  // perfil da Central antiga e se perdeu no porte.
  //
  // Duas regras, e a segunda é a que importa:
  //
  // 1. só a gestora liga. Ver como outra pessoa nunca dá acesso a
  //    nada — a gestora já vê tudo —, então isto só estreita a
  //    visão, nunca alarga;
  // 2. **gestaoUser() continua devolvendo a pessoa de verdade.** É
  //    dela que saem os "por" de toda gravação: chamada, pendência,
  //    toque, pendência. Se o ver como entrasse aqui, a Gabi
  //    olhando como Carla gravaria chamada assinada pela Carla, e o
  //    arquivo de cinco anos passaria a mentir. Quem filtra tela usa
  //    gestaoVisao(); quem grava usa gestaoUser().
  var VER_COMO_KEY = "isr_ver_como_v1";
  function verComo() {
    var u = gestaoUser();
    if (!u || u.perfil !== "gestora") return null;
    try {
      var v = JSON.parse(localStorage.getItem(VER_COMO_KEY));
      if (!v || !v.nome || v.nome === u.nome) return null;
      return v;
    } catch (e) { return null; }
  }
  function setVerComo(v) {
    var u = gestaoUser();
    if (!u || u.perfil !== "gestora") return null;
    try {
      if (!v || !v.nome || v.nome === u.nome) localStorage.removeItem(VER_COMO_KEY);
      else localStorage.setItem(VER_COMO_KEY, JSON.stringify(
        { nome: v.nome, perfil: v.perfil || "professora", papeis: v.papeis || [v.perfil || "professora"] }));
    } catch (e) {}
    return verComo();
  }
  // A identidade que as telas usam para FILTRAR e para decidir o que
  // mostrar. Nunca para gravar.
  function gestaoVisao() { return verComo() || gestaoUser(); }

  // ── O RECORTE DE QUEM ESTÁ OLHANDO ────────────────────────────
  //
  // Quatro telas respeitavam o "ver como" e cinco não: Alunas, Turmas,
  // Acompanhamento, Clubes e Gravações mostravam a escola inteira para
  // qualquer perfil, inclusive para a professora. Uma professora via
  // todas as alunas da escola.
  //
  // Esta é a resposta única: devolve o NOME da professora quando quem
  // olha é professora, e "" quando quem olha vê a escola toda. Cada
  // tela filtra pelo que já tem — a turma tem `teacher`, a aluna tem
  // `professora`, o clube tem `professora`.
  //
  // Vale repetir o que o guard já diz: isto roda no navegador e não é
  // proteção. É o recorte do trabalho de cada uma — o que impede a
  // professora de abrir uma tela e achar que a escola inteira é
  // responsabilidade dela.
  function professoraDaVisao() {
    var v = gestaoVisao();
    if (!v) return "";
    var papeis = (v.papeis || []).slice();
    if (v.perfil) papeis.push(v.perfil);
    var ensina = papeis.indexOf("professora") >= 0 || papeis.indexOf("extra") >= 0
      || papeis.indexOf("shadow") >= 0;
    // quem também é gestora, operação ou comercial vê a escola toda,
    // mesmo dando aula: é o caso da Gabi e da Carla
    var vêTudo = papeis.indexOf("gestora") >= 0 || papeis.indexOf("operacao") >= 0
      || papeis.indexOf("comercial") >= 0;
    return ensina && !vêTudo ? (v.nome || "") : "";
  }
  // Quem a gestora pode escolher ver: a equipe cadastrada, sem ela.
  function verComoOpcoes() {
    var u = gestaoUser();
    if (!u || u.perfil !== "gestora") return [];
    return (equipeLista() || []).filter(function (m) {
      return m.nome && m.nome !== u.nome && (m.papeis || []).length;
    }).map(function (m) {
      var papeis = (m.papeis || []).filter(function (x) { return x !== "prestadora"; });
      return { nome: m.nome, perfil: papeis[0] || "professora", papeis: papeis };
    }).filter(function (m) { return m.papeis.length; });
  }
  var CALC_KEY = "isr_calc_v1";
  var CALC_PADRAO = { grupoBRL: 497, grupoEUR: 125, partBRL: 800, partEUR: 200,
    descAvistaMax: 10, sinalPct: 20, parcelas: [3, 6, 8] };
  function calcParams() {
    try { var c = JSON.parse(localStorage.getItem(CALC_KEY)); if (c) return Object.assign({}, CALC_PADRAO, c); } catch (e) {}
    return CALC_PADRAO;
  }
  function setCalcParams(patch) {
    var c = {}; try { c = JSON.parse(localStorage.getItem(CALC_KEY)) || {}; } catch (e) {}
    Object.assign(c, patch);
    try { localStorage.setItem(CALC_KEY, JSON.stringify(c)); } catch (e) {}
    agendarSync(); return calcParams();
  }

  var EQUIPE_KEY = "isr_equipe_v1";
  // A escola tem uma fundadora (Gabi). As demais entram pelo cadastro de
  // Equipe, já com papéis e acesso — sem isso ninguém consegue entrar.
  var EQUIPE_PADRAO = [
    { id: "eqGabi", nome: "Gabi", email: "gabisouza.prof@gmail.com",
      papeis: ["gestora", "professora"], fundadora: true, valorTipo: "", valor: 0, moeda: "R$" },
    { id: "eqCarla", nome: "Carla", email: "comercial.inglessemroteiro@gmail.com",
      papeis: ["comercial", "professora"], valorTipo: "", valor: 0, moeda: "R$" },
    { id: "eqErika", nome: "Érika", email: "erikainglessemroteiro@gmail.com",
      papeis: ["operacao"], valorTipo: "", valor: 0, moeda: "R$" },
    { id: "eqAdrielly", nome: "Adrielly", email: "",
      papeis: ["professora"], valorTipo: "", valor: 0, moeda: "R$" },
    { id: "eqRicky", nome: "Ricky", email: "",
      papeis: ["professora"], valorTipo: "", valor: 0, moeda: "R$" }
  ];
  // A lista crua guarda também as lápides (quem saiu da equipe).
  function equipeRaw() {
    try {
      var l = JSON.parse(localStorage.getItem(EQUIPE_KEY));
      if (l) return l;
    } catch (e) {}
    return EQUIPE_PADRAO.map(function (m) { return Object.assign({}, m, { papeis: m.papeis.slice() }); });
  }
  function equipeLista() {
    return equipeRaw().filter(function (m) { return !(m && m.apagado); });
  }
  function equipeSave(l) {
    carimbarLista(l);
    // quem salva recebeu a lista sem as lápides — devolvê-las aqui é o
    // que impede um save qualquer de ressuscitar quem saiu
    var vivos = {};
    (l || []).forEach(function (m) { if (m && m.id) vivos[m.id] = true; });
    var lapides = equipeRaw().filter(function (m) { return m && m.apagado && !vivos[m.id]; });
    try { localStorage.setItem(EQUIPE_KEY, JSON.stringify((l || []).concat(lapides))); } catch (e) {}
    agendarSync();
  }
  // O id era só o relógio, e duas pessoas cadastradas no mesmo
  // milissegundo — a importação faz isso — ficavam com o MESMO id: a
  // segunda sobrescrevia a primeira em qualquer edição. O sufixo
  // aleatório separa as duas.
  function novoIdEquipe() {
    var l = equipeLista();
    var id;
    do {
      id = "eq" + Date.now() + "-" + Math.random().toString(36).slice(2, 7);
    } while (l.some(function (m) { return m.id === id; }));
    return id;
  }
  function addEquipe(dados) {
    var l = equipeLista();
    l.push({ id: novoIdEquipe(), nome: (dados.nome || "").trim(), email: (dados.email || "").trim().toLowerCase(),
      papeis: dados.papeis || [], valorTipo: dados.valorTipo || "", valor: parseFloat(dados.valor) || 0,
      moeda: dados.moeda || "R$",
      // quem entra agora não herda a pilha de aulas sem chamada de
      // quem estava na turma antes
      desde: dados.desde || iso(today()) });
    equipeSave(l); return l;
  }
  function updateEquipe(id, patch) {
    var l = equipeLista();
    var antes = l.filter(function (m) { return m.id === id; })[0];
    var nomeAntigo = antes ? antes.nome : "";
    // o e-mail entra na ficha como a pessoa digitou; guardar cru deixava
    // maiúscula e espaço na chave de acesso
    if (patch && typeof patch.email === "string") patch.email = patch.email.trim().toLowerCase();
    l.forEach(function (m) { if (m.id === id) { Object.assign(m, patch); carimbar(m); } });
    equipeSave(l);
    // o nome da pessoa é a chave que liga turma, aluna, tarefa e reunião a ela.
    // Trocar o nome sem levar isso junto quebra a folha de pagamento e a agenda.
    if (patch && patch.nome && nomeAntigo && patch.nome !== nomeAntigo) {
      renomearNaEquipe(nomeAntigo, patch.nome);
    }
    return l;
  }

  // Troca o nome de uma pessoa da equipe em tudo que aponta para ela.
  function renomearNaEquipe(de, para) {
    if (!de || !para || de === para) return;

    var turmas = turmasLista(), mexeuTurma = false;
    turmas.forEach(function (u) { if (u.teacher === de) { u.teacher = para; mexeuTurma = true; } });
    if (mexeuTurma) turmasSave(turmas);

    var pessoas = loadPessoas(), mexeuPessoa = false;
    pessoas.forEach(function (p) {
      if (p.professora === de) { p.professora = para; mexeuPessoa = true; }
      if (p.reuniao && p.reuniao.dono === de) { p.reuniao.dono = para; mexeuPessoa = true; }
      (p.historico || []).forEach(function (h) {
        if (h.por === de) { h.por = para; mexeuPessoa = true; }
      });
    });
    if (mexeuPessoa) savePessoas(pessoas);

    var tarefas = tarefasLista(), mexeuTarefa = false;
    tarefas.forEach(function (x) { if (x.dono === de) { x.dono = para; mexeuTarefa = true; } });
    if (mexeuTarefa) tarefasSave(tarefas);

    // a carteira é indexada pelo nome
    var caps = capacidades();
    if (caps[de] !== undefined) {
      caps[para] = caps[de]; delete caps[de];
      try { localStorage.setItem(CAPACIDADE_KEY, JSON.stringify(caps)); } catch (e) {}
    }
    agendarSync();
  }
  // Tirar da lista e salvar NÃO apaga: a mesclagem do sync soma
  // registros, e o banco devolvia a pessoa no puxe seguinte — era por
  // isso que remover alguém da equipe "não funcionava". Turmas, alunas
  // e programas já têm lápide pela mesma razão; a equipe ficou de fora.
  // A lápide viaja pelo sync, vence a cópia viva nos outros aparelhos e
  // some das telas em todos eles.
  function removeEquipe(id) {
    var l = equipeRaw(), achou = false;
    l.forEach(function (m) {
      if (m && m.id === id) { m.apagado = iso(today()); carimbar(m); achou = true; }
    });
    if (!achou) return equipeLista();
    try { localStorage.setItem(EQUIPE_KEY, JSON.stringify(l)); } catch (e) {}
    agendarSync();
    return equipeLista();
  }
  function equipeCustosMensais(key) {
    var k = key || mesAtualKey();
    return equipeLista()
      .filter(function (m) { return m.valorTipo === "mensal" && m.valor > 0 && vigenteNoMes(m, k); })
      .map(function (m) { return { nome: m.nome + " (equipe)", moeda: m.moeda || "R$", valor: m.valor }; });
  }

  function perfilDosPapeis(papeis) {
    if (papeis.indexOf("gestora") >= 0) return "gestora";
    if (papeis.indexOf("comercial") >= 0) return "comercial";
    if (papeis.indexOf("operacao") >= 0) return "operacao";
    if (papeis.indexOf("professora") >= 0) return "professora";
    if (papeis.indexOf("extra") >= 0) return "extra";
    if (papeis.indexOf("shadow") >= 0) return "shadow";
    return null;
  }
  // O e-mail é a chave que liga a pessoa autenticada ao cadastro da
  // Equipe, e ela estava sendo comparada crua: o que a pessoa digita
  // passa por toLowerCase, mas o que está gravado na ficha não. Um
  // "Comercial.InglesSemRoteiro@gmail.com" cadastrado com maiúscula —
  // ou com um espaço colado no fim, que é o que o teclado do celular
  // faz — nunca casava, e a pessoa ouvia que não está na equipe da
  // escola. E-mail não distingue maiúscula de minúscula; a comparação
  // também não pode.
  function mesmoEmail(a, b) {
    return String(a || "").trim().toLowerCase() === String(b || "").trim().toLowerCase();
  }
  function liberarGestao(email) {
    var e = (email || "").toLowerCase().trim();
    var m = GESTAO_EMAILS[e];
    var eq = equipeLista().filter(function (x) { return mesmoEmail(x.email, e); })[0];
    var u = null;
    if (m) {
      var papeis = [m.perfil];
      if (eq) (eq.papeis || []).forEach(function (pp) { if (papeis.indexOf(pp) < 0) papeis.push(pp); });
      u = { email: e, perfil: m.perfil, nome: m.nome, papeis: papeis };
    } else if (eq) {
      var perfil = perfilDosPapeis(eq.papeis || []);
      if (!perfil) return null; // prestadora pura não tem acesso ao sistema
      u = { email: e, perfil: perfil, nome: eq.nome, papeis: eq.papeis || [] };
    } else return null;
    localStorage.setItem("isr_gestao_user", JSON.stringify(u));
    return u;
  }
  // POR QUE este e-mail não entrou.
  //
  // A tela dizia sempre a mesma frase — "não está no cadastro de
  // Equipe" —, e ela é falsa em dois dos três casos: a pessoa pode
  // estar no cadastro sem nenhuma função que dê acesso, e pode estar
  // cadastrada como aluna. Mandar a escola procurar no lugar errado
  // custa uma tarde de cada lado.
  //
  // Devolve: { caso, nome, papeis }
  //   "sem_funcao"  está na Equipe, mas nenhum papel abre o sistema
  //   "e_aluna"     o e-mail está na ficha de uma aluna
  //   "fora"        o e-mail não está em lugar nenhum
  function motivoSemAcesso(email) {
    var e = String(email || "").trim().toLowerCase();
    var eq = equipeLista().filter(function (x) { return mesmoEmail(x.email, e); })[0];
    if (eq) {
      return { caso: "sem_funcao", nome: eq.nome || "", papeis: (eq.papeis || []).slice() };
    }
    var pes = loadPessoas().filter(function (x) { return mesmoEmail(x.email, e); })[0];
    if (pes) return { caso: "e_aluna", nome: pes.nome || "", papeis: [] };
    return { caso: "fora", nome: "", papeis: [] };
  }
  function sairGestao() {
    localStorage.removeItem("isr_gestao_user");
    // o "ver como" não pode sobreviver à troca de pessoa: quem entrar
    // depois abriria o sistema já olhando pelos olhos de outra
    try { localStorage.removeItem(VER_COMO_KEY); } catch (e) {}
    guardarTokenGestao(null);
  }

  // ── O TOKEN DA EQUIPE ─────────────────────────────────────────
  //
  // Quem diz que a pessoa é quem diz ser é o Netlify Identity, não
  // esta tela. O que ele devolve no login fica guardado aqui, e é o
  // que vai no cabeçalho das chamadas às funções — é assim que o
  // servidor confere sem acreditar no navegador.
  //
  // O token vale cerca de uma hora. Junto vem um refresh_token, que
  // serve para pedir outro sem fazer a pessoa digitar a senha de novo;
  // sem ele, a equipe cairia do sistema de hora em hora.
  var TOKEN_KEY = "isr_gestao_token";
  function guardarTokenGestao(tokens) {
    try {
      if (!tokens || !tokens.access_token) { localStorage.removeItem(TOKEN_KEY); return; }
      localStorage.setItem(TOKEN_KEY, JSON.stringify({
        access: tokens.access_token,
        refresh: tokens.refresh_token || "",
        // o expires_in vem em segundos; guardamos o instante, que é o
        // que dá para comparar depois sem saber quando foi emitido
        vence: Date.now() + ((tokens.expires_in || 3600) * 1000)
      }));
    } catch (e) {}
  }
  function tokenGestaoGuardado() {
    try { return JSON.parse(localStorage.getItem(TOKEN_KEY)) || null; } catch (e) { return null; }
  }
  // Devolve um token válido, renovando se estiver perto de vencer.
  // Sem conta criada ainda (transição), devolve vazio e quem chamar
  // decide o que fazer.
  function tokenGestao() {
    var t = tokenGestaoGuardado();
    if (!t || !t.access) return Promise.resolve("");
    // um minuto de folga: token que vence no meio da chamada é erro
    if (t.vence - Date.now() > 60000) return Promise.resolve(t.access);
    if (!t.refresh) { guardarTokenGestao(null); return Promise.resolve(""); }
    return fetch(window.location.origin + "/.netlify/identity/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: "grant_type=refresh_token&refresh_token=" + encodeURIComponent(t.refresh)
    }).then(function (r) { return r.ok ? r.json() : null; })
      .then(function (d) {
        if (!d || !d.access_token) { guardarTokenGestao(null); return ""; }
        guardarTokenGestao(d);
        return d.access_token;
      })
      .catch(function () { return ""; });
  }
  // Chamada a uma função do Netlify já com o token da pessoa.
  function chamarFuncao(nome, opcoes) {
    var o = opcoes || {};
    return tokenGestao().then(function (tk) {
      var h = Object.assign({ "Content-Type": "application/json" }, o.headers || {});
      if (tk) h.Authorization = "Bearer " + tk;
      return fetch("/.netlify/functions/" + nome, {
        method: o.method || "POST",
        headers: h,
        body: o.body ? (typeof o.body === "string" ? o.body : JSON.stringify(o.body)) : undefined
      });
    });
  }

  // Guard automático: telas de gestão redirecionam pro portão se não
  // houver sessão. Iframes (miniaturas do launcher) ficam de fora.
  //
  // ATENÇÃO, para não confundir uma coisa com a outra: isto evita que
  // alguém caia numa tela de gestão por engano — um link mandado no
  // grupo errado, uma aluna seguindo um endereço. NÃO é proteção: roda
  // no navegador e qualquer pessoa contorna. O que protege de verdade é
  // o servidor, e isso é trabalho à parte.
  //
  // A lista era escrita à mão e ficava para trás a cada tela nova: as
  // telas v3 do Painel e da Matrícula nasceram fora dela. Agora a regra
  // é a inversa — toda tela "ISR - ..." é de gestão, menos as que a
  // aluna precisa abrir.
  // As telas da ÁREA DA ALUNA. Tudo o que começa com "ISR - " e não
  // está aqui é tela de gestão, e o portão manda para o gestao.html.
  var ABERTAS = ["ISR - Aluna.", "ISR - Aluna v4.", "ISR - Certificado", "ISR - Login",
                 "ISR - Comunidade", "ISR - Tela de Aula", "ISR - Aulas."];
  function telaDeGestao(path) {
    if (path.indexOf("ISR - ") < 0) return false;
    return !ABERTAS.some(function (a) { return path.indexOf(a) >= 0; });
  }
  // As telas que a professora alcança. O trabalho dela é o Painel; a
  // página da turma é onde o plano, a chamada e os materiais daquela
  // turma moram, e o perfil é o que o nome da aluna abre.
  var TELAS_DA_PROFESSORA = ["ISR - Painel", "ISR - Turma ", "ISR - Perfil"];
  // Quem só dá aula: ensina e não cuida da escola. A Gabi e a Carla
  // dão aula e cuidam, então não entram aqui.
  // Quem está logada de verdade, não a lente: a gestora olhando "como
  // a professora" continua entrando em tudo. Usar a visão aqui prendia
  // a gestora no Painel no momento em que ela ligava o ver como.
  function soProfessora() {
    var v = gestaoUser();
    if (!v) return false;
    var papeis = (v.papeis || []).slice();
    if (v.perfil) papeis.push(v.perfil);
    var ensina = papeis.indexOf("professora") >= 0 || papeis.indexOf("extra") >= 0
      || papeis.indexOf("shadow") >= 0;
    var cuida = papeis.indexOf("gestora") >= 0 || papeis.indexOf("operacao") >= 0
      || papeis.indexOf("comercial") >= 0;
    return ensina && !cuida;
  }
  (function guardGestao() {
    try {
      if (window.top !== window.self) return;
      var path = decodeURIComponent(window.location.pathname || "");
      if (!telaDeGestao(path)) return;
      if (!gestaoUser()) { window.location.replace("gestao.html"); return; }
      // O menu da professora tem um item só, mas menu escondido não é
      // porta trancada: o endereço de uma tela de gestão continua
      // funcionando se alguém o digitar ou se ele vier num link antigo.
      // Aqui ela volta para o Painel em vez de abrir a escola inteira.
      //
      // Vale o mesmo aviso do guard acima: isto roda no navegador e é
      // recorte de trabalho, não proteção. O que protege é o servidor.
      if (soProfessora() && !TELAS_DA_PROFESSORA.some(function (t) { return path.indexOf(t) >= 0; })) {
        window.location.replace("ISR%20-%20Painel%20v3.dc.html");
      }
    } catch (e) {}
  })();

  // ── AULAS EXTRAS / EVENTOS ────────────────────────────────────
  var EVENTOS_KEY = "isr_eventos_v1";
  function eventosLista() {
    try { return JSON.parse(localStorage.getItem(EVENTOS_KEY)) || []; } catch (e) { return []; }
  }
  function eventosSave(l) { carimbarLista(l); try { localStorage.setItem(EVENTOS_KEY, JSON.stringify(l)); } catch (e) {} agendarSync(); }
  function addEvento(dados) {
    var l = eventosLista();
    var ev = { id: "ev" + Date.now(), titulo: dados.titulo, data: dados.data, hora: dados.hora || "",
      responsavel: dados.responsavel || "", tipo: "aula_extra",
      duracao: parseInt(dados.duracao, 10) || 60,
      local: dados.local || "", link: dados.link || "", descricao: dados.descricao || "",
      vagas: parseInt(dados.vagas, 10) || 0,
      turmaAlvo: dados.turmaAlvo || "",
      rsvps: {}, manuais: [] };
    l.push(ev);
    l.sort(function (a, b) { return (a.data + a.hora) < (b.data + b.hora) ? -1 : 1; });
    eventosSave(l); return ev;
  }
  function removeEvento(id) { var l = eventosLista().filter(function (e) { return e.id !== id; }); eventosSave(l); return l; }
  function getEvento(id) { return eventosLista().filter(function (e) { return e.id === id; })[0] || null; }
  function updateEvento(id, patch) {
    var l = eventosLista();
    l.forEach(function (e) {
      if (e.id !== id) return;
      Object.keys(patch || {}).forEach(function (k) { if (patch[k] !== "" && patch[k] !== undefined) e[k] = patch[k]; });
      carimbar(e);
    });
    eventosSave(l); return getEvento(id);
  }

  // ── AULA EXTRA ────────────────────────────────────────────────
  // Uma aula extra não é uma turma: não tem matrícula, não tem
  // mensalidade. Quem vai é quem confirma. A chamada dela existe
  // por um motivo só — contar as horas de aula que a professora deu.
  function aulaExtraLabel(ev) { return "Aula extra · " + (ev ? ev.titulo : ""); }
  // Quem enxerga o convite: a turma alvo, ou todas as alunas ativas.
  function convidadasAulaExtra(ev) {
    if (!ev) return [];
    return loadPessoas().filter(function (p) {
      if (p.status !== "aluna" && p.status !== "mvs") return false;
      return !ev.turmaAlvo || p.turma === ev.turmaAlvo;
    });
  }
  function confirmadasAulaExtra(ev) {
    if (!ev) return [];
    var r = ev.rsvps || {};
    return convidadasAulaExtra(ev).filter(function (p) { return r[p.id] === true; });
  }
  // A lista da chamada: quem confirmou mais quem a professora incluiu na hora.
  function listaChamadaExtra(eventoId) {
    var ev = getEvento(eventoId);
    if (!ev) return [];
    var vistos = {}, out = [];
    confirmadasAulaExtra(ev).forEach(function (p) { vistos[p.id] = 1; out.push(p); });
    (ev.manuais || []).forEach(function (pid) {
      if (vistos[pid]) return;
      var p = getPessoa(pid);
      if (p) { vistos[pid] = 1; out.push(p); }
    });
    return out;
  }
  function addAlunaNaAulaExtra(eventoId, pessoaId) {
    var l = eventosLista();
    l.forEach(function (e) {
      if (e.id !== eventoId) return;
      e.manuais = e.manuais || [];
      if (e.manuais.indexOf(pessoaId) < 0) e.manuais.push(pessoaId);
      carimbar(e);
    });
    eventosSave(l); return listaChamadaExtra(eventoId);
  }
  function removeAlunaDaAulaExtra(eventoId, pessoaId) {
    var l = eventosLista();
    l.forEach(function (e) {
      if (e.id !== eventoId) return;
      e.manuais = (e.manuais || []).filter(function (x) { return x !== pessoaId; });
      if (e.rsvps) delete e.rsvps[pessoaId];
      carimbar(e);
    });
    eventosSave(l); return listaChamadaExtra(eventoId);
  }
  // Horas de aula dadas: só conta aula extra com chamada salva.
  function horasAulaExtra(professora, nMeses) {
    var limite = addDays(-30 * (nMeses || 12)), total = 0, lista = [];
    eventosLista().forEach(function (e) {
      if (e.data < limite) return;
      if (professora && e.responsavel !== professora) return;
      var ch = getChamada(aulaExtraLabel(e), e.data);
      if (!ch) return;
      var presentes = Object.keys(ch.presencas || {}).filter(function (k) {
        var st = estadoPresenca(ch.presencas[k]);
        return st === "presente" || st === "atraso";
      }).length;
      var h = (parseInt(e.duracao, 10) || 60) / 60;
      total += h;
      lista.push({ id: e.id, titulo: e.titulo, data: e.data, horas: h,
        professora: e.responsavel, presentes: presentes });
    });
    lista.sort(function (a, b) { return a.data < b.data ? 1 : -1; });
    return { horas: Math.round(total * 10) / 10, aulas: lista.length, lista: lista };
  }
  // Link do Google Agenda com duração e local reais do evento.
  function gcalLinkEvento(ev) {
    if (!ev) return "";
    var d = (ev.data || "").replace(/-/g, "");
    var h = parseInt((ev.hora || "").replace(/\D/g, ""), 10);
    var p2 = function (n) { return (n < 10 ? "0" : "") + n; };
    var ini, fim;
    if (!isNaN(h)) {
      var dur = parseInt(ev.duracao, 10) || 60;
      var fimH = h + Math.floor(dur / 60), fimM = dur % 60;
      ini = d + "T" + p2(h) + "0000";
      fim = d + "T" + p2(fimH) + p2(fimM) + "00";
    } else { ini = d; fim = d; }
    var det = [ev.descricao, ev.responsavel ? "Professora: " + ev.responsavel : "", "Inglês sem Roteiro"]
      .filter(Boolean).join("\n");
    return "https://calendar.google.com/calendar/render?action=TEMPLATE&text="
      + encodeURIComponent("Aula extra · " + ev.titulo)
      + "&dates=" + ini + "/" + fim
      + "&details=" + encodeURIComponent(det)
      + (ev.local ? "&location=" + encodeURIComponent(ev.local) : "");
  }
  function textoAulaExtra(ev) {
    if (!ev) return "";
    return "Aula extra: " + ev.titulo + "\n"
      + "Data: " + ddmm(ev.data) + (ev.hora ? " às " + ev.hora : "") + "\n"
      + "Duração: " + (parseInt(ev.duracao, 10) || 60) + " minutos\n"
      + (ev.local ? "Local: " + ev.local + "\n" : "")
      + (ev.responsavel ? "Professora: " + ev.responsavel + "\n" : "")
      + (ev.descricao ? "\n" + ev.descricao + "\n" : "")
      + "\nConfirme a presença na sua área de aluna.";
  }
  // O sistema não envia e-mail: monta a mensagem e abre o cliente de
  // e-mail com tudo preenchido. O envio é sempre um ato da pessoa.
  function mailtoAulaExtra(ev, destinatarios, assuntoAlt, corpoAlt) {
    if (!ev) return "";
    var emails = (destinatarios || []).map(function (p) { return typeof p === "string" ? p : p.email; })
      .filter(Boolean);
    var assunto = assuntoAlt || ("Aula extra · " + ev.titulo + " · " + ddmm(ev.data));
    var corpo = (corpoAlt || textoAulaExtra(ev)) + "\n\nAdicionar ao Google Agenda:\n" + gcalLinkEvento(ev);
    return "mailto:" + (emails.length === 1 ? emails[0] : "")
      + "?" + (emails.length > 1 ? "bcc=" + encodeURIComponent(emails.join(",")) + "&" : "")
      + "subject=" + encodeURIComponent(assunto)
      + "&body=" + encodeURIComponent(corpo);
  }
  // Aulas extras que a aluna pode ver, da mais próxima em diante.
  function aulasExtraDaAluna(pessoaId) {
    var p = getPessoa(pessoaId);
    if (!p) return [];
    var hoje = iso(today());
    return eventosLista().filter(function (e) {
      if (e.data < hoje) return false;
      if (e.turmaAlvo && e.turmaAlvo !== p.turma) return false;
      return true;
    }).map(function (e) {
      var r = (e.rsvps || {})[pessoaId];
      var confirmadas = confirmadasAulaExtra(e).length;
      return { id: e.id, titulo: e.titulo, data: e.data, hora: e.hora,
        duracao: parseInt(e.duracao, 10) || 60, local: e.local || "",
        descricao: e.descricao || "", professora: e.responsavel || "",
        confirmou: r === true, recusou: r === false, respondeu: r !== undefined,
        confirmadas: confirmadas, vagas: parseInt(e.vagas, 10) || 0,
        lotada: !!e.vagas && confirmadas >= e.vagas && r !== true,
        gcal: gcalLinkEvento(e), evento: e };
    });
  }

  // ── CHAMADA (presenças por turma e dia — Painel do Professor) ──
  var CHAMADAS_KEY = "isr_chamadas_v1";
  function chamadasAll() {
    try { return JSON.parse(localStorage.getItem(CHAMADAS_KEY)) || {}; } catch (e) { return {}; }
  }
  function chamadasSaveLocal(m) { try { localStorage.setItem(CHAMADAS_KEY, JSON.stringify(m)); } catch (e) {} }
  function getChamada(turmaLabel, dataIso) { return chamadasAll()[turmaLabel + "|" + dataIso] || null; }
  // estados: presente · atraso · falta · justificada (true/false = legado)
  function estadoPresenca(v) {
    if (v === true) return "presente";
    if (v === false) return "falta";
    return v || "presente";
  }
  // ── O QUE VALIDA UMA AULA ─────────────────────────────────────
  //
  // Chamada marcada não era prova de que a aula aconteceu: dava para
  // salvar presença de uma aula que não houve. O desenho novo pede
  // duas coisas para a aula contar — a chamada E o tópico da lição —,
  // e trata dois casos que existiam na vida e não no sistema:
  //
  //   no-show: ninguém apareceu. A aula conta, e a professora grava a
  //            explicação no link da aula;
  //   data real: a aula foi dada em outro dia (remarcada). A chamada
  //            é da aula, a data real é de quando ela aconteceu.
  function chamadaValidada(ch) {
    if (!ch || !ch.salvoEm) return false;
    // reaberta para correção não conta até ser salva de novo: enquanto
    // a professora mexe, a aula não é a que a folha vai pagar
    if (ch.emEdicao) return false;
    return !!ch.noshow || !!String(ch.topico || "").trim();
  }
  // Reabrir uma chamada salva. Enquanto estiver aberta, a aula sai da
  // folha — e volta quando for salva de novo. Sem isto, uma chamada
  // meio corrigida continuava contando como se estivesse fechada, e a
  // folha do mês pagava por um registro que ninguém terminou.
  function reabrirChamada(turmaLabel, dataIso, por) {
    var m = chamadasAll();
    var k = turmaLabel + "|" + dataIso;
    var ch = m[k];
    if (!ch || !ch.salvoEm || ch.emEdicao) return false;
    ch.emEdicao = true;
    ch.hist = (ch.hist || []).concat([{ por: por || "", em: new Date().toISOString(),
      o: "chamada reaberta para correção" }]);
    carimbar(ch);
    chamadasSaveLocal(m);
    agendarSync();
    return true;
  }
  // o estado de uma aula, do ponto de vista da folha e do painel
  function chamadaEstado(turmaLabel, dataIso) {
    var hoje = iso(today());
    var ch = getChamada(turmaLabel, dataIso);
    if (!ch || !ch.salvoEm) {
      return dataIso > hoje ? "agendada" : "pendente";
    }
    if (ch.emEdicao) return "em_edicao";
    if (ch.noshow) return "no-show";
    return String(ch.topico || "").trim() ? "validada" : "sem_topico";
  }
  var CHAMADA_ESTADOS = {
    validada: { label: "validada", bg: "#e8f5dd", fg: "#3d6b22" },
    sem_topico: { label: "falta o tópico", bg: "#fdf3d6", fg: "#7a5c00" },
    em_edicao: { label: "em correção", bg: "#fdf3d6", fg: "#7a5c00" },
    pendente: { label: "diário pendente", bg: "#fde4df", fg: "#a3392c" },
    "no-show": { label: "no-show gravado", bg: "#e5f2f6", fg: "#1d5a63" },
    agendada: { label: "agendada", bg: "#f2ebe3", fg: "#8a7465" }
  };

  function salvarChamada(turmaLabel, dataIso, presencas, por, tarefas, extra) {
    extra = extra || {};
    var m = chamadasAll();
    var key = turmaLabel + "|" + dataIso;
    var velha = m[key] || null;
    var antes = (velha && velha.presencas) || {};
    // Uma chamada salva pode ser corrigida — a professora marcou falta em
    // quem chegou atrasada, a gestão conferiu depois. Quem corrigiu e
    // quando fica registrado, senão a correção some sem rastro.
    var jaExistia = !!(velha && velha.salvoEm);
    var quemAntes = (velha && (velha.criadaPor || velha.por)) || "";
    var mudancas = 0;
    Object.keys(presencas).forEach(function (pid) {
      if (estadoPresenca(presencas[pid]) !== estadoPresenca(antes[pid])) mudancas++;
    });
    // ── o histórico desta chamada ─────────────────────────────
    // Os campos de cima guardam só a ÚLTIMA correção: quem corrigiu
    // e quando. Duas correções seguidas e a primeira some. Para uma
    // chamada que a escola guarda por cinco anos, e que a professora
    // e a gestão mexem alternadamente, isso não basta — "quem mudou
    // o quê" precisa ser a lista inteira.
    var agora = new Date().toISOString();
    var hist = (velha && velha.hist) ? velha.hist.slice() : [];
    // chamada gravada antes do histórico existir não começa vazia: o
    // que já está registrado nela vira a primeira linha
    if (!hist.length && velha && velha.criadaEm) {
      hist.push({ por: velha.criadaPor || velha.por || "", em: velha.criadaEm, o: "chamada salva" });
      if (velha.corrigidaEm) {
        hist.push({ por: velha.corrigidaPor || "", em: velha.corrigidaEm,
          o: "chamada corrigida" });
      }
    }
    // o tópico e o no-show entram no histórico como qualquer mudança:
    // é por eles que a aula passa a contar na folha
    var topicoNovo = ("topico" in extra)
      ? String(extra.topico || "").trim() : String((velha && velha.topico) || "");
    var noshowNovo = ("noshow" in extra) ? !!extra.noshow : !!(velha && velha.noshow);
    // Qual sessão do ciclo foi dada. É isto que liga a aula ao plano:
    // sem o número, o caderno da aluna não tem como saber quais
    // atividades ela viveu — a chamada só guardava o tópico escrito à
    // mão, que não casa com nada.
    var sessaoNova = ("sessao" in extra)
      ? (parseInt(extra.sessao, 10) || 0) : (parseInt(velha && velha.sessao, 10) || 0);
    var mudouSessao = jaExistia && sessaoNova !== (parseInt(velha && velha.sessao, 10) || 0);
    var mudouTopico = jaExistia && topicoNovo !== String((velha && velha.topico) || "");
    var mudouNoshow = jaExistia && noshowNovo !== !!(velha && velha.noshow);
    hist.push({ por: por || "", em: agora,
      o: !jaExistia ? (noshowNovo ? "no-show gravado" : "chamada salva")
        : mudouNoshow ? (noshowNovo ? "no-show gravado" : "no-show desfeito")
        : mudancas ? mudancas + (mudancas === 1 ? " presença alterada" : " presenças alteradas")
          + (mudouTopico ? " · tópico alterado" : "")
          + (mudouSessao ? " · sessão alterada" : "")
        : mudouTopico ? "tópico alterado" + (mudouSessao ? " · sessão alterada" : "")
        : mudouSessao ? "sessão alterada"
        : "regravada sem mudança" });
    // uma chamada reaberta muitas vezes não pode crescer sem fim: a
    // primeira linha é a que conta a origem, as últimas é que dizem o
    // que mudou agora
    if (hist.length > 20) hist = [hist[0]].concat(hist.slice(-19));

    m[key] = { turma: turmaLabel, data: dataIso, presencas: presencas,
      tarefas: tarefas || {},
      // o que valida a aula
      topico: topicoNovo,
      noshow: noshowNovo,
      // qual sessão do plano foi dada (0 = a professora não disse)
      sessao: sessaoNova,
      // só existe quando a aula foi dada em outro dia
      dataReal: ("dataReal" in extra)
        ? String(extra.dataReal || "") : ((velha && velha.dataReal) || ""),
      salvoEm: agora, por: por || "", emEdicao: false,
      criadaEm: (velha && velha.criadaEm) || agora,
      criadaPor: quemAntes || por || "",
      correcoes: (velha && velha.correcoes || 0) + (jaExistia && mudancas ? 1 : 0),
      corrigidaEm: jaExistia && mudancas ? agora : (velha && velha.corrigidaEm) || "",
      corrigidaPor: jaExistia && mudancas ? (por || "") : (velha && velha.corrigidaPor) || "",
      hist: hist };
    chamadasSaveLocal(m);
    agendarSync();
    // Corrigir a chamada de outra pessoa sem registro é mexer no
    // trabalho dela às escondidas. Quem mudou o quê fica no hist acima,
    // e o Painel mostra isso em "Histórico desta chamada" — é mais do
    // que o aviso dizia, e num lugar onde se vai olhar.
    var ehParticular = turmaLabel.indexOf("Particular") === 0;
    // falta/justificada nova vai pra linha do tempo (re-salvar não duplica)
    Object.keys(presencas).forEach(function (pid) {
      var agora = estadoPresenca(presencas[pid]), antesE = estadoPresenca(antes[pid]);
      if (agora !== antesE) {
        if (agora === "falta") {
          mutate(pid, function (p) { pushHist(p, "falta", "Faltou na aula de " + ddmm(dataIso) + " · " + turmaLabel); });
        } else if (agora === "justificada") {
          mutate(pid, function (p) { pushHist(p, "falta", "Ausência justificada na aula de " + ddmm(dataIso) + " · " + turmaLabel); });
        }
      }
      // chamada de aula particular mantém o pacote em dia: presença nova
      // conta uma aula dada; corrigir para falta devolve a aula ao pacote.
      // (estadoPresenca(undefined) vale "presente" — por isso o "in")
      if (ehParticular) {
        var dava = (pid in antes) && ["presente", "atraso"].indexOf(estadoPresenca(antes[pid])) >= 0;
        var da = ["presente", "atraso"].indexOf(agora) >= 0;
        if (da && !dava) mutate(pid, function (p) {
          p.particular = p.particular || { inicio: p.desde || iso(today()), aulas: 0, feitas: 0 };
          p.particular.feitas = (p.particular.feitas || 0) + 1;
          var tot = p.particular.aulas ? " de " + p.particular.aulas : "";
          pushHist(p, "contato", "Aula particular dada em " + ddmm(dataIso) + " (" + p.particular.feitas + tot + ")",
            "", dataIso);
        });
        if (!da && dava) mutate(pid, function (p) {
          if (p.particular) p.particular.feitas = Math.max(0, (p.particular.feitas || 0) - 1);
        });
        // a aula marcada na série sai de "marcada" quando a chamada
        // acontece — é a chamada que diz se a aula existiu
        if (da !== dava) marcarAulaParticularFeita(pid, dataIso, da);
      }
    });
    return m[key];
  }
  // Tarefa: só "fez / não fez", marcado na chamada. O trabalho e a correção
  // continuam no caderno — aqui é sinal de engajamento, não canal paralelo.
  function tarefasDe(pessoaId, nUltimas) {
    var m = chamadasAll();
    var regs = Object.keys(m).map(function (k) { return m[k]; })
      .filter(function (c) { return c.tarefas && c.tarefas[pessoaId] !== undefined; })
      .sort(function (a, b) { return a.data < b.data ? 1 : -1; });
    if (nUltimas) regs = regs.slice(0, nUltimas);
    var fez = regs.filter(function (c) { return !!c.tarefas[pessoaId]; }).length;
    return { total: regs.length, fez: fez, naoFez: regs.length - fez,
      pct: regs.length ? Math.round(100 * fez / regs.length) : null };
  }

  function faltasDe(pessoaId) {
    var m = chamadasAll(), n = 0;
    Object.keys(m).forEach(function (k) {
      if (m[k].presencas && estadoPresenca(m[k].presencas[pessoaId]) === "falta") n++;
    });
    return n;
  }
  // Toda chamada em que a pessoa aparece, mais recente primeiro — é o
  // que a ficha mostra para a equipe acompanhar faltas e fazer contato
  function presencasDe(pessoaId) {
    var m = chamadasAll(), out = [];
    Object.keys(m).forEach(function (k) {
      var ch = m[k];
      if (!ch.presencas || !(pessoaId in ch.presencas)) return;
      out.push({ data: ch.data, turma: ch.turma || "", estado: estadoPresenca(ch.presencas[pessoaId]) });
    });
    (eventosLista ? eventosLista() : []).forEach(function (e) {
      var lista = e.chamada && e.chamada.presencas;
      if (!lista || !(pessoaId in lista)) return;
      out.push({ data: e.data, turma: "Aula extra · " + e.titulo, estado: estadoPresenca(lista[pessoaId]) });
    });
    out.sort(function (a, b) { return a.data < b.data ? 1 : -1; });
    return out;
  }
  // ── O PROGRESSO DE UMA ALUNA ──────────────────────────────────
  //
  // A aluna via aula, material e miles, mas nunca a resposta para
  // "como eu estou indo?". Os números para isso já existiam, cada um
  // num canto: a chamada sabe a frequência, a chamada sabe a tarefa,
  // a turma sabe o projeto, o cadastro sabe o nível. Aqui eles viram
  // uma coisa só.
  //
  // Frequência conta presença e atraso como presença, e ignora a
  // ausência justificada: justificar existe exatamente para não
  // pesar contra ela.
  var NIVEIS = ["First Steps (A0)", "Basics (A1)", "Essentials (A2)",
                "Speaking (B1)", "Advanced (B2)"];
  var FREQUENCIA_MINIMA = 75;
  function nivelSeguinte(nivel) {
    var i = NIVEIS.indexOf(String(nivel || "").trim());
    return i >= 0 && i < NIVEIS.length - 1 ? NIVEIS[i + 1] : "";
  }
  function progressoDaAluna(pessoaId) {
    var p = getPessoa(pessoaId);
    if (!p) return null;
    var jan = cicloJanela ? cicloJanela(tipoDaTurma({ turma: p.turma })) : null;
    var desde = (jan && jan.inicio) || "";

    // frequência
    var todas = presencasDe(pessoaId);
    var doCiclo = desde ? todas.filter(function (x) { return x.data >= desde; }) : todas;
    var contam = doCiclo.filter(function (x) { return x.estado !== "justificada"; });
    var presentes = contam.filter(function (x) {
      return x.estado === "presente" || x.estado === "atraso"; }).length;
    var pct = contam.length ? Math.round(100 * presentes / contam.length) : null;

    // tarefas: a chamada registra quem fez
    var m = chamadasAll(), feitas = 0, pedidas = 0;
    Object.keys(m).forEach(function (k) {
      var ch = m[k];
      if (!ch || !ch.data || (desde && ch.data < desde)) return;
      if (!ch.presencas || !(pessoaId in ch.presencas)) return;
      var t = ch.tarefas || {};
      if (!Object.keys(t).length) return;
      pedidas++;
      if (t[pessoaId]) feitas++;
    });

    // o projeto de agora e os que já passaram
    var turmas = turmasLista() || [];
    var rotulo = function (u) { return u.nivel + " · " + u.turma; };
    var turma = turmas.filter(function (u) { return rotulo(u) === p.turma; })[0];
    // Os projetos que já passaram saem das turmas em que ela teve
    // chamada: é o único registro de onde ela esteve, e é verdade.
    var vistos = {}, passados = [];
    if (turma && turma.projeto) vistos[turma.projeto] = true;
    todas.forEach(function (x) {
      var u = turmas.filter(function (z) { return rotulo(z) === x.turma; })[0];
      if (!u || !u.projeto || vistos[u.projeto]) return;
      vistos[u.projeto] = true;
      passados.push({ projeto: u.projeto, turma: u.nivel, ciclo: u.cycle || "", quando: x.data });
    });

    return {
      nome: p.nome,
      // o nível do curso é o da turma ("Essentials (A2)"); o campo do
      // cadastro guarda outra coisa — "Básico", "Intermediário" —, que
      // é como a escola conversa, não o degrau do caminho
      nivel: (turma && turma.nivel) || p.nivel || "",
      nivelCadastro: p.nivel || "",
      proximoNivel: nivelSeguinte((turma && turma.nivel) || ""),
      turma: p.turma || "",
      projeto: (turma && turma.projeto) || "",
      ciclo: (turma && turma.cycle) || (jan && jan.label) || "",
      presenca: { pct: pct, presentes: presentes, total: contam.length,
        minimo: FREQUENCIA_MINIMA,
        ok: pct === null ? null : pct >= FREQUENCIA_MINIMA,
        justificadas: doCiclo.length - contam.length },
      // a linha do tempo da presença, da mais antiga para a mais nova
      aulas: doCiclo.slice().reverse().map(function (x) {
        return { data: x.data, estado: x.estado, turma: x.turma }; }),
      tarefas: { feitas: feitas, pedidas: pedidas },
      projetosPassados: passados
    };
  }

  function ultimaFaltaDe(pessoaId) {
    var m = chamadasAll(), ultima = null;
    Object.keys(m).forEach(function (k) {
      if (m[k].presencas && estadoPresenca(m[k].presencas[pessoaId]) === "falta"
          && m[k].data && (!ultima || m[k].data > ultima)) ultima = m[k].data;
    });
    return ultima;
  }
  // ── METAS DE PERÍODO ──────────────────────────────────────────
  //
  // A meta do ciclo não dá conta: o ciclo 2026.3 se distribui em dois
  // meses, e cada mês tem um alvo próprio — agosto é matricular 5 na turma
  // nova de Den Haag, setembro é vender 20 acompanhamentos. Aqui cada meta
  // tem título, alvo, período e um tipo que diz o que o sistema conta.
  var METAS_PERIODO_KEY = "isr_metas_periodo_v1";
  var TIPOS_META = {
    matricula: { label: "Matrículas em turma", conta: true },
    programa:  { label: "Vendas do acompanhamento", conta: true },
    particular:{ label: "Aulas particulares contratadas", conta: true },
    receita:   { label: "Receita fechada", conta: true, dinheiro: true },
    livre:     { label: "Outra coisa (conto eu)", conta: false }
  };

  function metasPeriodoAll() {
    try { return JSON.parse(localStorage.getItem(METAS_PERIODO_KEY)) || []; } catch (e) { return []; }
  }
  function metasPeriodoSave(l) {
    carimbarLista(l);
    try { localStorage.setItem(METAS_PERIODO_KEY, JSON.stringify(l)); } catch (e) {}
    agendarSync();
  }
  function addMetaPeriodo(dados) {
    var l = metasPeriodoAll();
    l.push({ id: "mp" + Date.now(), titulo: (dados.titulo || "").trim(),
      alvo: parseFloat(dados.alvo) || 0, tipo: dados.tipo || "livre",
      periodo: dados.periodo || mesAtualKey(),
      escopo: dados.escopo || "mes",           // "mes" ou "ciclo"
      feito: parseFloat(dados.feito) || 0, criadaEm: iso(today()) });
    metasPeriodoSave(l); return l;
  }
  function updateMetaPeriodo(id, patch) {
    var l = metasPeriodoAll();
    l.forEach(function (m) { if (m.id === id) Object.assign(m, patch); });
    metasPeriodoSave(l); return l;
  }
  function removeMetaPeriodo(id) {
    var l = metasPeriodoAll().filter(function (m) { return m.id !== id; });
    metasPeriodoSave(l); return l;
  }

  // Quanto já foi feito de uma meta. O que o sistema sabe contar, ele conta;
  // o resto fica no contador manual.
  function progressoMeta(meta) {
    if (!meta) return 0;
    var tipo = TIPOS_META[meta.tipo] || TIPOS_META.livre;
    if (!tipo.conta) return meta.feito || 0;

    var noPeriodo = function (isoStr) {
      if (!isoStr) return false;
      if (meta.escopo === "ciclo") return true;   // o ciclo é acompanhado pelo conjunto
      return mesDe(isoStr) === meta.periodo;
    };

    var n = 0;
    loadPessoas().forEach(function (p) {
      if (meta.tipo === "matricula") {
        if ((p.status === "aluna" || p.status === "mvs") && p.turma && noPeriodo(p.desde)) n++;
      } else if (meta.tipo === "programa") {
        if (p.programa && noPeriodo(p.programa.desde)) n++;
      } else if (meta.tipo === "particular") {
        if (p.particular && noPeriodo(p.particular.inicio)) n++;
      } else if (meta.tipo === "receita") {
        if (!noPeriodo(p.desde)) return;
        var c = contratoVigente(p);
        if (c) n += emMoedaDaFolha(parseMoney(c.valorTotal), c.moeda || "R$", configPagamento());
      }
    });
    return n;
  }

  function metasDoPeriodo(periodoKey) {
    var chave = periodoKey || mesAtualKey();
    return metasPeriodoAll()
      .filter(function (m) { return m.periodo === chave; })
      .map(function (m) {
        var feito = progressoMeta(m);
        var tipo = TIPOS_META[m.tipo] || TIPOS_META.livre;
        return Object.assign({}, m, {
          feito: feito, tipoLabel: tipo.label, automatica: tipo.conta,
          dinheiro: !!tipo.dinheiro,
          pct: m.alvo > 0 ? Math.min(100, Math.round((feito / m.alvo) * 100)) : 0,
          batida: m.alvo > 0 && feito >= m.alvo,
          falta: Math.max(0, m.alvo - feito)
        });
      });
  }

  // ── RENEGOCIAÇÃO ──────────────────────────────────────────────
  //
  // Quando alguém atrasa e volta a negociar, a conta é sempre a mesma:
  // o que ficou em aberto mais o que ela está contratando agora, dividido
  // num número de parcelas que caiba no ciclo. Ciclo de 3 meses aceita até
  // 4 parcelas; de 6 meses, até 7 — uma a mais que os meses, porque a
  // primeira costuma sair na assinatura.
  var PARCELAS_MAX = { 3: 4, 6: 7 };

  function maxParcelasDoCiclo(mesesCiclo) {
    var n = parseInt(mesesCiclo, 10);
    if (PARCELAS_MAX[n]) return PARCELAS_MAX[n];
    if (!n || n < 1) return 4;
    return n + 1;
  }

  function simularRenegociacao(pessoaOuId, cfg) {
    var p = typeof pessoaOuId === "string" ? getPessoa(pessoaOuId) : pessoaOuId;
    if (!p) return null;
    var opc = cfg || {};
    var moeda = (contratoVigente(p) || {}).moeda || p.moeda || "R$";

    // parcelasAbertas devolve o valor formatado; aqui a conta é numérica
    var abertas = parcelasAbertas(p).map(function (x) {
      return Object.assign({}, x, { bruto: parseMoney(x.valor) });
    });
    var emAberto = abertas.reduce(function (s, x) { return s + x.bruto; }, 0);
    var novo = parseMoney(opc.novoCiclo || 0);
    var desconto = parseMoney(opc.desconto || 0);
    var total = Math.max(0, emAberto + novo - desconto);

    var meses = parseInt(opc.mesesCiclo, 10) || 3;
    var max = maxParcelasDoCiclo(meses);
    var opcoes = [];
    for (var n = 1; n <= max; n++) {
      opcoes.push({ n: n, valor: total / n,
        label: n + "x de " + fmtMoney(moeda, total / n) });
    }

    return { moeda: moeda, emAberto: emAberto, nAbertas: abertas.length,
      abertas: abertas, novoCiclo: novo, desconto: desconto, total: total,
      mesesCiclo: meses, maxParcelas: max, opcoes: opcoes,
      escolhida: opc.parcelas ? opcoes.filter(function (o) { return o.n === parseInt(opc.parcelas, 10); })[0] : null };
  }

  // Fecha o acordo: apaga as parcelas em aberto e cria as novas.
  function aplicarRenegociacao(id, cfg) {
    var sim = simularRenegociacao(id, cfg);
    if (!sim || !sim.total) return null;
    var n = parseInt(cfg.parcelas, 10) || sim.maxParcelas;
    var valor = fmtMoney(sim.moeda, sim.total / n);

    return mutate(id, function (p) {
      // tira o que estava em aberto de todos os contratos
      (p.contratos || []).forEach(function (c) {
        c.meses = (c.meses || []).filter(function (m) { return m.pago; });
      });
      var c = contratoVigente(p);
      if (!c) return;
      var venc = parseInt(cfg.vencDia, 10) || c.vencDia || 10;
      var inicio = cfg.primeiroMes || mesSeguinte(mesAtualKey()).key;
      c.parcelaValor = valor;
      c.parcelas = n;
      c.vencDia = venc;
      c.meses = (c.meses || []).concat(mkMeses(0, valor, n, inicio));
      pushHist(p, "renovacao",
        "Renegociado · " + fmtMoney(sim.moeda, sim.emAberto) + " em aberto"
        + (sim.novoCiclo ? " + " + fmtMoney(sim.moeda, sim.novoCiclo) + " do novo ciclo" : "")
        + (sim.desconto ? " − " + fmtMoney(sim.moeda, sim.desconto) + " de desconto" : "")
        + " = " + fmtMoney(sim.moeda, sim.total) + " em " + n + "x de " + valor
        + (cfg.motivo ? " · " + cfg.motivo : ""));
    });
  }

  function renegociarContrato(id, cfg) {
    return mutate(id, function (p) {
      var c = contratoVigente(p);
      if (!c || !cfg.novoValor) return;
      var alteradas = 0;
      (c.meses || []).forEach(function (m) { if (!m.pago) { m.valor = cfg.novoValor; alteradas++; } });
      c.parcelaValor = cfg.novoValor;
      if (cfg.vencDia) c.vencDia = parseInt(cfg.vencDia, 10) || c.vencDia;
      pushHist(p, "renovacao", "Contrato renegociado · " + alteradas + " parcela(s) em aberto agora " + cfg.novoValor + (cfg.motivo ? " · " + cfg.motivo : ""));
    });
  }
  // ── EDIÇÃO DEPOIS DA MATRÍCULA ────────────────────────────────
  // Gente muda de turma, pede outro dia de vencimento e o telefone vem
  // com erro de digitação. Sem isto, o único caminho era refazer tudo.

  // Contrato: tipo, ciclos, valor, dia de vencimento e nº de parcelas.
  // Parcelas já pagas nunca são mexidas — só as em aberto.
  function atualizarContrato(id, patch) {
    return mutate(id, function (p) {
      var c = contratoVigente(p);
      if (!c) return;
      var mudou = [];

      if (patch.tipo && patch.tipo !== c.tipo) { mudou.push("tipo → " + patch.tipo); c.tipo = patch.tipo; }
      if (patch.ciclos && patch.ciclos !== c.ciclos) { mudou.push("ciclos → " + patch.ciclos); c.ciclos = patch.ciclos; }
      if (patch.moeda && patch.moeda !== c.moeda) { mudou.push("moeda → " + patch.moeda); c.moeda = patch.moeda; }

      if (patch.vencDia !== undefined && patch.vencDia !== "" && String(patch.vencDia) !== String(c.vencDia)) {
        var d = patch.vencDia === "auto" ? "auto" : (parseInt(patch.vencDia, 10) || 10);
        mudou.push("vencimento → " + (d === "auto" ? "automático" : "dia " + d));
        c.vencDia = d;
      }

      if (patch.parcelaValor && patch.parcelaValor !== c.parcelaValor) {
        var alteradas = 0;
        (c.meses || []).forEach(function (m) { if (!m.pago) { m.valor = patch.parcelaValor; alteradas++; } });
        mudou.push("parcela → " + patch.parcelaValor + " (" + alteradas + " em aberto)");
        c.parcelaValor = patch.parcelaValor;
      }

      // início do ciclo: desloca TODAS as parcelas para começarem no mês
      // escolhido (mantendo valores e o que já está pago) — é o caminho
      // para matrícula registrada com atraso, cujas mensalidades são
      // retroativas e nasceram no mês errado
      if (patch.inicioMes && /^\d{4}-\d{2}$/.test(patch.inicioMes)) {
        var ms0 = c.meses || [];
        if (ms0.length && ms0[0].key !== patch.inicioMes) {
          var y0 = parseInt(patch.inicioMes.slice(0, 4), 10);
          var mo0 = parseInt(patch.inicioMes.slice(5, 7), 10);
          var cursor = (mo0 === 1 ? (y0 - 1) : y0) + "-" + ("0" + (mo0 === 1 ? 12 : mo0 - 1)).slice(-2);
          ms0.forEach(function (m) {
            var prox = mesSeguinte(cursor);
            m.key = prox.key; m.label = prox.label; cursor = prox.key;
          });
          c.inicio = patch.inicioMes + "-01";
          c.fim = ms0[ms0.length - 1].key + "-28";
          mudou.push("início → " + patch.inicioMes);
        }
      }

      // nº de parcelas: acrescenta no fim ou remove as últimas ainda em aberto
      var nNovo = parseInt(patch.parcelas, 10);
      if (nNovo > 0 && nNovo !== (c.meses || []).length) {
        var meses = c.meses || [];
        var pagas = meses.filter(function (m) { return m.pago; }).length;
        if (nNovo < pagas) nNovo = pagas; // não dá pra apagar parcela já paga
        if (nNovo > meses.length) {
          var ultimo = meses.length ? meses[meses.length - 1].key : mesAtualKey();
          for (var i = meses.length; i < nNovo; i++) {
            var prox = mesSeguinte(ultimo);
            meses.push({ key: prox.key, label: prox.label, valor: c.parcelaValor || "", pago: false });
            ultimo = prox.key;
          }
        } else {
          meses = meses.slice(0, nNovo);
        }
        c.meses = meses;
        c.parcelas = nNovo;
        if (meses.length) c.fim = meses[meses.length - 1].key + "-28";
        mudou.push("parcelas → " + nNovo);
      }

      if (patch.fim && patch.fim !== c.fim) { mudou.push("término → " + ddmm(patch.fim)); c.fim = patch.fim; }

      if (mudou.length) pushHist(p, "renovacao", "Contrato editado · " + mudou.join(" · "));
    });
  }
  // Em que mês a primeira parcela de um ciclo deve cair.
  // Duas regras somadas: nunca antes do fim do ciclo anterior, e nunca
  // num mês cujo dia de vencimento já passou (senão nasce vencida).
  function primeiroMesDoCiclo(fimAnteriorKey, vencDia) {
    var base = mesAtualKey();
    var d = parseInt(vencDia, 10);
    if (!isNaN(d) && today().getDate() > d) base = mesSeguinte(base).key;
    if (fimAnteriorKey) {
      var depois = mesSeguinte(fimAnteriorKey).key;
      if (depois > base) base = depois;
    }
    return base;
  }
  function mesAnterior(key) {
    var pr = key.split("-");
    var d = new Date(parseInt(pr[0], 10), parseInt(pr[1], 10) - 2, 1);
    var p2 = function (n) { return (n < 10 ? "0" : "") + n; };
    return { key: d.getFullYear() + "-" + p2(d.getMonth() + 1), label: MES_NOMES[d.getMonth()] };
  }
  function mesSeguinte(key) {
    var pr = key.split("-");
    var d = new Date(parseInt(pr[0], 10), parseInt(pr[1], 10), 1); // mês seguinte
    var p2 = function (n) { return (n < 10 ? "0" : "") + n; };
    return { key: d.getFullYear() + "-" + p2(d.getMonth() + 1), label: MES_NOMES[d.getMonth()] };
  }

  // Troca de turma: atualiza professora e registra na linha do tempo.
  // Põe ou tira a pessoa de uma turma pelo rótulo. É o que a página da
  // Turma usa: lá se pensa "quem está nesta turma", não "qual é a turma
  // desta pessoa".
  function setTurmaDaPessoa(id, turmaLabel, professora) {
    return mutate(id, function (p) {
      var antes = p.turma || "—";
      p.turma = turmaLabel || "";
      p.professora = turmaLabel ? (professora || p.professora || "") : "";
      if (p.turma !== antes) {
        pushHist(p, "estagio", turmaLabel
          ? "Turma alterada · de " + antes + " para " + p.turma
          : "Saiu da turma " + antes);
      }
    });
  }

  function mudarTurma(id, turmaId) {
    return mutate(id, function (p) {
      var antes = p.turma || "—";
      if (turmaId === "particular") {
        p.turma = "Particular";
        p.professora = p.professora || "";
        if (!p.particular) p.particular = { inicio: iso(today()), aulas: 0, feitas: 0 };
      } else {
        var u = turmasLista().filter(function (x) { return x.id === turmaId; })[0];
        if (!u) return;
        p.turma = u.nivel + " · " + u.turma;
        p.professora = u.teacher || "";
        p.nivel = p.nivel || u.nivel;
      }
      if (p.turma !== antes) pushHist(p, "estagio", "Turma alterada · de " + antes + " para " + p.turma);
    });
  }

  // Dados cadastrais, com registro do que mudou.
  // Documento e endereço entram porque o contrato precisa deles. São
  // dados sensíveis: saem no exportarPessoa e somem no apagarPessoa.
  var CAMPOS_CADASTRO = { nome: "nome", whatsapp: "WhatsApp", email: "e-mail",
    nivel: "nível", professora: "professora",
    cpf: "CPF", rg: "RG", nascimento: "data de nascimento",
    cep: "CEP", logradouro: "logradouro", numero: "número",
    complemento: "complemento", bairro: "bairro",
    cidade: "cidade", uf: "estado", pais: "país" };
  var CAMPOS_DOCUMENTO = ["cpf", "rg", "nascimento"];
  var CAMPOS_ENDERECO = ["cep", "logradouro", "numero", "complemento", "bairro", "cidade", "uf", "pais"];

  // Endereço numa linha só, para contrato e etiqueta.
  function enderecoDe(pessoaOuId) {
    var p = typeof pessoaOuId === "string" ? getPessoa(pessoaOuId) : pessoaOuId;
    if (!p) return "";
    var rua = [p.logradouro, p.numero].filter(Boolean).join(", ");
    if (p.complemento) rua = rua ? rua + " · " + p.complemento : p.complemento;
    var cidade = [p.cidade, p.uf].filter(Boolean).join("/");
    return [rua, p.bairro, cidade, p.cep, p.pais].filter(Boolean).join(" · ");
  }
  // O que ainda falta para fechar um contrato no nome dela.
  function cadastroIncompleto(pessoaOuId) {
    var p = typeof pessoaOuId === "string" ? getPessoa(pessoaOuId) : pessoaOuId;
    if (!p) return [];
    var falta = [];
    if (!p.cpf) falta.push("CPF");
    if (!p.logradouro || !p.cidade) falta.push("endereço");
    return falta;
  }
  // ── TAGS ──────────────────────────────────────────────────────
  // Rótulo livre por pessoa. Serve pro que a estrutura fixa não cobre:
  // "mãe de aluno", "quer certificado", "indicou 2", "prova em março".
  var TAGS_SUGERIDAS = ["Indicou alguém", "Quer certificado", "Prepara prova",
    "Mudança de país", "Trabalho", "Viagem", "Retorno", "VIP"];
  function addTag(id, tag) {
    var t2 = String(tag || "").trim();
    if (!t2) return null;
    return mutate(id, function (p) {
      p.tags = p.tags || [];
      if (p.tags.indexOf(t2) < 0) p.tags.push(t2);
    });
  }
  function removeTag(id, tag) {
    return mutate(id, function (p) {
      p.tags = (p.tags || []).filter(function (x) { return x !== tag; });
    });
  }
  function todasAsTags() {
    var s = {};
    loadPessoas().forEach(function (p) { (p.tags || []).forEach(function (x) { s[x] = (s[x] || 0) + 1; }); });
    return Object.keys(s).sort().map(function (x) { return { tag: x, n: s[x] }; });
  }

  function atualizarCadastro(id, patch) {
    return mutate(id, function (p) {
      var mudou = [];
      Object.keys(CAMPOS_CADASTRO).forEach(function (k) {
        if (patch[k] === undefined) return;
        var v = String(patch[k]).trim();
        if (!v || v === p[k]) return;
        mudou.push(CAMPOS_CADASTRO[k]);
        p[k] = v;
      });
      if (mudou.length) pushHist(p, "nota", "Cadastro atualizado · " + mudou.join(", "));
    });
  }

  // Onboarding: a data de cada etapa passa a ser editável.
  function setOnboardingData(id, cpId, dataIso) {
    return mutate(id, function (p) {
      (p.onboarding || []).forEach(function (cp) {
        if (cp.id === cpId) cp.data = dataIso;
      });
    });
  }

  function setSinalRecebido(id, recebido) {
    return mutate(id, function (p) {
      var c = contratoVigente(p);
      if (!c || !c.sinal) return;
      c.sinal.recebido = !!recebido;
      if (recebido) pushHist(p, "pagamento", "Sinal de " + c.sinal.valor + " recebido");
    });
  }
  // dataIso é o dia da aula. Aula dada em agosto e registrada em setembro
  // é aula de agosto: é o mês dela que manda na folha da professora.
  function registrarAulaParticular(id, dataIso) {
    var dia = dataIso || iso(today());
    return mutate(id, function (p) {
      p.particular = p.particular || { inicio: p.desde || iso(today()), aulas: 0, feitas: 0 };
      p.particular.feitas = (p.particular.feitas || 0) + 1;
      var tot = p.particular.aulas ? " de " + p.particular.aulas : "";
      pushHist(p, "contato", "Aula particular dada em " + ddmm(dia)
        + " (" + p.particular.feitas + tot + ")", "", dia);
    });
  }
  function updateParticular(id, patch) {
    return mutate(id, function (p) {
      p.particular = Object.assign(p.particular || { inicio: p.desde || iso(today()), aulas: 0, feitas: 0 }, patch);
    });
  }

  // ── O QUE CADA PESSOA CONTRATOU ───────────────────────────────
  //
  // Uma aluna pode ter turma, pacote de aulas particulares e o
  // acompanhamento ao mesmo tempo, ou só um deles. Cada coisa tem o seu
  // preço e o seu dinheiro. Isto reúne os três num lugar só, para dar
  // para acrescentar e tirar sem refazer a matrícula.

  // Pacote de aulas particulares como produto: tem quantidade e valor.
  function contratarParticular(id, cfg) {
    cfg = cfg || {};
    var pessoa = getPessoa(id);
    if (!pessoa) return null;
    var moeda = cfg.moeda || pessoa.moeda || "R$";
    var valorTxt = cfg.valor || "";
    if (valorTxt && !/[R$€]/.test(String(valorTxt))) valorTxt = fmtMoney(moeda, parseMoney(valorTxt));
    var nAulas = parseInt(cfg.aulas, 10) || 0;

    mutate(id, function (p) {
      var antes = p.particular || {};
      p.particular = { inicio: cfg.desde || antes.inicio || iso(today()),
        aulas: nAulas || antes.aulas || 0,
        feitas: antes.feitas || 0,
        valor: valorTxt || antes.valor || "",
        moeda: moeda, pago: cfg.pago !== undefined ? !!cfg.pago : !!antes.pago,
        professora: cfg.professora || antes.professora || p.professora || "" };
      pushHist(p, "matricula", "Pacote de aulas particulares · "
        + p.particular.aulas + " aula(s)"
        + (p.particular.valor ? " · " + p.particular.valor : "")
        + (p.particular.pago ? " (pago)" : " (a receber)"));
    });

    if (cfg.pago && valorTxt) registrarPagamentoParticular(id);
    return getPessoa(id);
  }

  // ── AGENDA DAS AULAS PARTICULARES ─────────────────────────────
  //
  // O pacote dizia quantas aulas foram contratadas e quantas já foram
  // dadas, mas não QUANDO cada uma acontece: a aula particular não tinha
  // data em lugar nenhum, não entrava na agenda e remarcação não deixava
  // rastro. A série resolve isso: marca as N aulas de uma vez, na
  // cadência combinada, e cada aula guarda o próprio histórico.
  //
  // Remarcação tem limite de uma por mês. O sistema não bloqueia — abrir
  // exceção é decisão da escola —, apenas contabiliza e sinaliza.
  var LIMITE_REMARCACAO_MES = 1;
  // "dias" é o intervalo até a próxima aula. Duas vezes por semana não
  // cabe num intervalo só: alternando 3 e 4 dias, os dois dias da semana
  // combinados ficam de pé (segunda e quinta seguem segunda e quinta),
  // o que um intervalo médio não faria.
  var CADENCIAS = [
    { id: "semanal", label: "Semanal", dias: 7 },
    { id: "2x_semana", label: "2× por semana", dias: 7, passos: [3, 4] },
    { id: "quinzenal", label: "Quinzenal", dias: 14 },
    { id: "mensal", label: "Mensal", dias: 28 }
  ];

  // O combinado de uma aluna particular, num objeto só: quantas aulas
  // foram contratadas, quantas já aconteceram, quando começam, em que dia
  // e hora, de quanto em quanto tempo. Estava tudo no dado e em lugar
  // nenhum na tela — a chamada mostrava só o nome, e quem olhava não
  // sabia se aquela aluna tinha aula naquele dia.
  var DIA_SEMANA_LONGO = ["domingo", "segunda", "terça", "quarta", "quinta", "sexta", "sábado"];
  function resumoParticular(pessoaId) {
    var p = getPessoa(pessoaId);
    if (!p) return null;
    var part = p.particular || {};
    var agenda = agendaParticular(pessoaId);
    var vivas = agenda.filter(function (a) { return a.estado !== "cancelada"; });
    var marcadas = vivas.filter(function (a) { return a.estado === "marcada"; });
    var hoje = iso(today());
    var futuras = marcadas.filter(function (a) { return a.data >= hoje; });
    var atrasadas = marcadas.filter(function (a) { return a.data < hoje; });
    var cad = CADENCIAS.filter(function (c) { return c.id === part.cadencia; })[0] || null;
    var primeira = vivas[0] || null;
    var hora = part.hora || (primeira && primeira.hora) || "";
    // o dia da semana vem da série, que é o combinado de verdade
    var dias = {};
    vivas.forEach(function (a) {
      var d = parseISO(a.data); if (d) dias[d.getDay()] = true;
    });
    var diasLabel = Object.keys(dias).sort()
      .map(function (k) { return DIA_SEMANA_LONGO[parseInt(k, 10)]; }).join(" e ");
    var contratadas = part.aulas || 0;
    var feitas = part.feitas || 0;
    return {
      id: p.id, nome: p.nome, professora: professoraDaParticular(p),
      contratadas: contratadas, feitas: feitas,
      restam: contratadas ? Math.max(0, contratadas - feitas) : null,
      marcadas: marcadas.length, agendadas: vivas.length,
      cadencia: cad ? cad.id : "", cadenciaLabel: cad ? cad.label : "",
      hora: hora, diaSemana: diasLabel,
      contratadoEm: p.desde || part.inicio || "",
      inicio: primeira ? primeira.data : "",
      fim: vivas.length ? vivas[vivas.length - 1].data : "",
      proxima: futuras[0] || null,
      atrasadas: atrasadas.length,
      semAgenda: vivas.length === 0
    };
  }
  function resumosParticulares(professora) {
    return loadPessoas()
      .filter(function (p) {
        return ehAlunaParticular(p)
          && (!professora || professoraDaParticular(p) === professora);
      })
      .map(function (p) { return resumoParticular(p.id); })
      .sort(function (a, b) {
        // quem tem aula marcada primeiro; sem agenda, no fim
        var ka = a.proxima ? a.proxima.data : "9999";
        var kb = b.proxima ? b.proxima.data : "9999";
        return ka === kb ? (a.nome < b.nome ? -1 : 1) : (ka < kb ? -1 : 1);
      });
  }

  function agendaParticular(pessoaId) {
    var p = getPessoa(pessoaId);
    var lista = (p && p.particular && p.particular.agenda) || [];
    return lista.slice().sort(function (a, b) {
      return (a.data + (a.hora || "")) < (b.data + (b.hora || "")) ? -1 : 1;
    });
  }

  // Marca N aulas de uma vez, na cadência escolhida. Feriado não vira
  // aula: a data pula para a ocorrência seguinte e a série segue dali,
  // sem perder aula nem encavalar duas no mesmo dia.
  function agendarSerieParticular(pessoaId, cfg) {
    cfg = cfg || {};
    var quantas = parseInt(cfg.quantidade, 10) || 0;
    var cad = CADENCIAS.filter(function (c) { return c.id === cfg.cadencia; })[0] || CADENCIAS[0];
    var d0 = parseISO(cfg.inicio || "");
    if (!quantas || !d0) return { ok: false, erro: "Informe a data da primeira aula e a quantidade." };
    var hora = (cfg.hora || "").trim();
    var pes = getPessoa(pessoaId);
    if (!pes) return { ok: false, erro: "Aluna não encontrada." };

    var jaMarcadas = {};
    agendaParticular(pessoaId).forEach(function (a) {
      if (a.estado === "marcada") jaMarcadas[a.data] = true;
    });

    var novas = [], d = new Date(d0), guarda = 0, passo = 0;
    var avancar = function () {
      var n = cad.passos ? cad.passos[passo++ % cad.passos.length] : cad.dias;
      d.setDate(d.getDate() + n);
    };
    while (novas.length < quantas && guarda < 400) {
      guarda++;
      var dataIso = iso(d);
      if (!ehFeriado(dataIso) && !jaMarcadas[dataIso]) {
        novas.push({ id: "ap" + Date.now() + "_" + novas.length,
          data: dataIso, hora: hora, estado: "marcada", remarcacoes: [] });
        jaMarcadas[dataIso] = true;
      }
      // feriado (ou dia já ocupado) empurra pela mesma cadência,
      // preservando o dia da semana combinado
      avancar();
    }

    mutate(pessoaId, function (p) {
      p.particular = p.particular || { inicio: p.desde || iso(today()), aulas: 0, feitas: 0 };
      p.particular.agenda = (p.particular.agenda || []).concat(novas);
      p.particular.cadencia = cad.id;
      if (hora) p.particular.hora = hora;
      // o total contratado acompanha o que foi marcado, quando ninguém
      // tinha registrado quantidade antes
      if (!p.particular.aulas) p.particular.aulas = novas.length;
      pushHist(p, "matricula", novas.length + " aulas particulares agendadas · "
        + cad.label.toLowerCase() + " · " + ddmm(novas[0].data)
        + " a " + ddmm(novas[novas.length - 1].data)
        + (hora ? " · " + hora : ""));
    });
    return { ok: true, marcadas: novas.length,
      primeira: novas[0].data, ultima: novas[novas.length - 1].data };
  }

  function remarcacoesNoMes(pessoaId, mesKey) {
    var mes = mesKey || mesAtualKey();
    var n = 0;
    agendaParticular(pessoaId).forEach(function (a) {
      (a.remarcacoes || []).forEach(function (r) {
        if ((r.em || "").slice(0, 7) === mes) n++;
      });
    });
    return n;
  }

  // Remarcar guarda a data antiga: a aula não "muda de lugar" em
  // silêncio, ela fica marcada como remarcada e o mês registra o uso.
  function remarcarAulaParticular(pessoaId, aulaId, novaData, novaHora, motivo) {
    var pes = getPessoa(pessoaId);
    if (!pes) return { ok: false, erro: "Aluna não encontrada." };
    if (!novaData) return { ok: false, erro: "Escolha a nova data." };
    var alvo = agendaParticular(pessoaId).filter(function (a) { return a.id === aulaId; })[0];
    if (!alvo) return { ok: false, erro: "Aula não encontrada." };
    if (alvo.estado === "feita") return { ok: false, erro: "Aula já realizada." };

    var mesDaRemarcacao = iso(today()).slice(0, 7);
    var antesNoMes = remarcacoesNoMes(pessoaId, mesDaRemarcacao);
    var dataAntiga = alvo.data, horaAntiga = alvo.hora || "";

    mutate(pessoaId, function (p) {
      (p.particular.agenda || []).forEach(function (a) {
        if (a.id !== aulaId) return;
        a.remarcacoes = (a.remarcacoes || []).concat([{
          de: dataAntiga, deHora: horaAntiga, para: novaData, paraHora: novaHora || horaAntiga,
          em: iso(today()), motivo: (motivo || "").trim() }]);
        a.data = novaData;
        if (novaHora) a.hora = novaHora;
        a.estado = "marcada";
      });
      pushHist(p, "contato", "Aula particular remarcada · " + ddmm(dataAntiga)
        + " → " + ddmm(novaData) + (novaHora ? " às " + novaHora : "")
        + (motivo ? " · " + motivo : ""));
    });

    var noMes = antesNoMes + 1;
    var excedeu = noMes > LIMITE_REMARCACAO_MES;
    // A remarcação fica na linha do tempo da aluna (pushHist acima) e a
    // Agenda passa a mostrar a aula no dia novo, que é onde a professora
    // olha o dia dela. O limite excedido aparece para quem remarca, no
    // Perfil, que é quem pode decidir sobre ele.
    return { ok: true, noMes: noMes, limite: LIMITE_REMARCACAO_MES, excedeu: excedeu,
      de: dataAntiga, para: novaData };
  }

  function cancelarAulaParticular(pessoaId, aulaId, motivo) {
    var alvo = agendaParticular(pessoaId).filter(function (a) { return a.id === aulaId; })[0];
    if (!alvo) return { ok: false, erro: "Aula não encontrada." };
    mutate(pessoaId, function (p) {
      (p.particular.agenda || []).forEach(function (a) {
        if (a.id === aulaId) { a.estado = "cancelada"; a.canceladaEm = iso(today());
          a.motivoCancelamento = (motivo || "").trim(); }
      });
      pushHist(p, "contato", "Aula particular de " + ddmm(alvo.data) + " cancelada"
        + (motivo ? " · " + motivo : ""));
    });
    return { ok: true };
  }

  function removerAulaParticular(pessoaId, aulaId) {
    mutate(pessoaId, function (p) {
      if (!p.particular) return;
      p.particular.agenda = (p.particular.agenda || []).filter(function (a) { return a.id !== aulaId; });
    });
    return agendaParticular(pessoaId);
  }

  // A chamada é a fonte da verdade: dar a aula marca a data como feita.
  function marcarAulaParticularFeita(pessoaId, dataIso, feita) {
    mutate(pessoaId, function (p) {
      if (!p.particular || !p.particular.agenda) return;
      p.particular.agenda.forEach(function (a) {
        if (a.data !== dataIso || a.estado === "cancelada") return;
        a.estado = feita === false ? "marcada" : "feita";
      });
    });
  }

  // ── CHAMADA QUE FICOU PARA TRÁS ───────────────────────────────
  //
  // A aula acontece; a chamada é o registro de que aconteceu. Sem ela a
  // frequência da aluna fica errada, o pacote da particular não anda e a
  // folha da professora não conta a aula. Nada disso aparecia em lugar
  // nenhum: a aula simplesmente passava.
  //
  // Aqui ficam as aulas que já aconteceram e continuam sem chamada
  // salva — de turma, particular e extra, na mesma lista.
  // Qual ciclo está sendo conferido agora. Durante o ciclo, ele
  // mesmo. No intervalo entre dois, o que acabou de fechar — é dele
  // que as chamadas ainda faltam, e é dele que sai o certificado.
  function cicloDeAuditoria(tipo) {
    var hoje = iso(today());
    var todos = ciclosTodos(tipo).filter(function (c) { return c.inicio; });
    var dentro = todos.filter(function (c) {
      return c.inicio <= hoje && (!c.fim || hoje <= c.fim);
    })[0];
    if (dentro) return dentro;
    // ciclosTodos já vem do mais novo para o mais antigo
    return todos.filter(function (c) { return c.fim && c.fim < hoje; })[0] || null;
  }

  // A janela da conferência era de 21 dias corridos. Isso faz da
  // chamada um lembrete, não um registro: a aula de 22 dias atrás
  // sumia da lista sem nunca ter sido lançada, e a frequência do
  // ciclo ficava furada em silêncio. Agora a conferência é do CICLO
  // inteiro — que é a unidade que a escola fecha e arquiva.
  var JANELA_CHAMADA_DIAS = 21;

  // "Dá aula na escola desde": a data em que a pessoa entrou. Serve
  // para não atribuir a ela aula que aconteceu antes — quem assume uma
  // turma não assume o passado dela.
  //
  // Sem a data preenchida, o comportamento é o de antes (nada é
  // cortado): é a escola que sabe quando cada uma entrou, e inventar
  // uma data seria esconder pendência de verdade. Quem entra na equipe
  // a partir de agora nasce com a data de hoje, que é o caso novo.
  function entradaNaEquipe(nome) {
    if (!nome) return "";
    var m = equipeLista().filter(function (x) { return x.nome === nome; })[0];
    return (m && m.desde) || "";
  }
  function antesDeEntrar(nome, dataIso) {
    var d = entradaNaEquipe(nome);
    return !!d && !!dataIso && dataIso < d;
  }
  function chamadasPendentes(professora, dias) {
    var hoje = iso(today());
    var n, desde;
    if (dias) {
      n = dias; desde = addDays(-n);
    } else {
      // Três calendários, três ciclos a conferir. A varredura começa
      // no mais antigo deles e vai até hoje; cada aula depois é
      // descartada pela janela do SEU calendário, não pela desta
      // varredura — senão a aula presencial de uma semana que não
      // existe para as turmas online entraria na conta.
      // Só os ciclos que CONTÊM hoje. Quando nenhum contém — porque o
      // ciclo novo ainda não foi cadastrado, que é o caso da virada —,
      // cair no último ciclo fechado fazia a varredura voltar meses: a
      // professora abria o painel e via 143 aulas de julho, de um ciclo
      // que já encerrou. Sem ciclo aberto, vale a janela curta.
      var hojeIso = iso(today());
      var inicios = TIPOS_CICLO.map(function (t) { return cicloDeAuditoria(t.id); })
        .filter(function (c) {
          return c && c.inicio && c.inicio <= hojeIso && (!c.fim || hojeIso <= c.fim);
        })
        .map(function (c) { return c.inicio; })
        .sort();
      if (inicios.length) {
        desde = inicios[0];
        n = Math.max(1, daysBetween(parseISO(desde), today()) + 1);
      } else {
        n = JANELA_CHAMADA_DIAS; desde = addDays(-n);
      }
    }
    var out = [];

    // turmas: a agenda sabe em que dias elas caem
    var porId = {};
    turmasLista().forEach(function (u) { porId[u.id] = u; });
    agendaItens(n, desde).forEach(function (it) {
      if (it.tipo !== "aula" || it.data >= hoje) return;
      var u = porId[it.turmaId];
      if (!u) return;
      if (professora && (u.teacher || "") !== professora) return;
      // A aula é atribuída a quem está na turma HOJE, e quem assumiu a
      // turma agora herdava toda a pilha dela desde agosto — aulas que
      // essa pessoa nunca deu. A data de entrada da professora corta
      // isso: antes dela, a aula não é dela.
      if (antesDeEntrar(u.teacher, it.data)) return;
      var label = u.nivel + " · " + u.turma;
      if (getChamada(label, it.data)) return;
      // turma sem aluna não tem chamada a fazer
      if (!alunasDaTurma(label).length) return;
      out.push({ tipo: "turma", label: label, data: it.data, hora: it.hora || "",
        professora: u.teacher || "", quem: label,
        alunas: alunasDaTurma(label).length, turmaId: u.id });
    });

    // particulares: a série diz quando cada aula foi marcada
    aulasParticularesAgendadas(desde, hoje, professora).forEach(function (a) {
      if (a.data >= hoje || a.estado === "feita") return;
      // Nenhuma janela de escola filtra aula particular. Cada uma
      // depende da aluna — é marcada numa data, dentro do contrato
      // dela — e a aula existe porque alguém a marcou, não porque um
      // calendário a gerou. Filtrar aqui só esconderia aula que
      // aconteceu.
      var label = "Particular · " + a.nome;
      if (getChamada(label, a.data)) return;
      out.push({ tipo: "particular", label: label, data: a.data, hora: a.hora || "",
        professora: a.professora || "", quem: a.nome, alunas: 1, pessoaId: a.pessoaId });
    });

    // aulas extras
    eventosLista().forEach(function (e) {
      if (!e.data || e.data >= hoje || e.data < desde) return;
      var prof = e.responsavel || e.professora || "";
      if (professora && prof !== professora) return;
      var label = aulaExtraLabel(e);
      if (getChamada(label, e.data)) return;
      out.push({ tipo: "extra", label: label, data: e.data, hora: e.hora || "",
        professora: prof, quem: e.titulo || "Aula extra", alunas: 0, eventoId: e.id });
    });

    out.sort(function (a, b) { return a.data < b.data ? -1 : 1; });
    return out;
  }

  // As chamadas que já foram salvas. Existiam apenas dentro de cada turma,
  // então corrigir uma exigia saber de cabeça em que turma e em que dia ela
  // foi feita. Aqui elas vêm em ordem de data, com quem salvou e quantas
  // presenças, prontas para reabrir.
  function chamadasFeitas(professora, dias) {
    var n = dias || 30;
    var desde = addDays(-n), hoje = iso(today());
    var porLabel = {};
    turmasLista().forEach(function (u) { porLabel[u.nivel + " · " + u.turma] = u; });
    var pessoas = loadPessoas();
    var eventos = eventosLista();
    var m = chamadasAll(), out = [];
    Object.keys(m).forEach(function (k) {
      var c = m[k];
      if (!c || !c.data || c.data < desde || c.data > hoje) return;
      var label = c.turma || "";
      var tipo = "turma", prof = "", turmaId = "", pessoaId = "", eventoId = "";
      var u = porLabel[label];
      if (u) { prof = u.teacher || ""; turmaId = u.id; }
      else if (label.indexOf("Particular") === 0) {
        tipo = "particular";
        var nome = label.split("·").slice(1).join("·").trim();
        var pp = pessoas.filter(function (x) { return x.nome === nome; })[0];
        if (pp) { pessoaId = pp.id; prof = professoraDaParticular(pp) || ""; }
      } else {
        tipo = "extra";
        var ev = eventos.filter(function (e) { return aulaExtraLabel(e) === label; })[0];
        if (ev) { eventoId = ev.id; prof = ev.responsavel || ev.professora || ""; }
      }
      if (professora && prof !== professora) return;
      var pres = 0, falt = 0, just = 0, atr = 0;
      Object.keys(c.presencas || {}).forEach(function (pid) {
        var e = estadoPresenca(c.presencas[pid]);
        if (e === "falta") falt++;
        else if (e === "justificada") just++;
        else if (e === "atraso") atr++;
        else pres++;
      });
      out.push({ turma: label, data: c.data, tipo: tipo, professora: prof,
        turmaId: turmaId, pessoaId: pessoaId, eventoId: eventoId,
        por: c.por || "", salvoEm: c.salvoEm || "",
        criadaPor: c.criadaPor || c.por || "",
        corrigida: !!c.corrigidaEm, corrigidaPor: c.corrigidaPor || "",
        correcoes: c.correcoes || 0, hist: c.hist || [],
        presentes: pres + atr, faltas: falt, justificadas: just, atrasos: atr,
        total: pres + atr + falt + just });
    });
    out.sort(function (a, b) { return a.data < b.data ? 1 : -1; });
    return out;
  }

  // Quem mexeu nesta chamada, em ordem. A linha de cima é a origem.
  function chamadaHistorico(turmaLabel, dataIso) {
    var c = getChamada(turmaLabel, dataIso);
    if (!c) return [];
    if (c.hist && c.hist.length) return c.hist.slice();
    // chamada gravada antes do histórico existir: o que dá para
    // reconstruir do que está nela
    var fora = [];
    if (c.criadaEm) fora.push({ por: c.criadaPor || c.por || "", em: c.criadaEm, o: "chamada salva" });
    if (c.corrigidaEm) fora.push({ por: c.corrigidaPor || "", em: c.corrigidaEm, o: "chamada corrigida" });
    return fora;
  }

  // O mesmo, agrupado por professora: é assim que o lembrete sai.
  function chamadasPendentesPorProfessora(dias) {
    var todas = chamadasPendentes("", dias);
    var mapa = {};
    todas.forEach(function (c) {
      var k = c.professora || "";
      if (!mapa[k]) mapa[k] = { professora: k, aulas: [], n: 0, maisAntiga: c.data };
      mapa[k].aulas.push(c);
      mapa[k].n++;
      if (c.data < mapa[k].maisAntiga) mapa[k].maisAntiga = c.data;
    });
    return Object.keys(mapa).map(function (k) { return mapa[k]; })
      .sort(function (a, b) { return b.n - a.n; });
  }

  // ── PRESENÇA PARA TODOS, NAS AULAS SEM CHAMADA ────────────────
  //
  // A escola ficou meses sem lançar chamada e juntou uma pilha. Fazer
  // uma a uma é o certo quando a professora lembra quem faltou; não é
  // viável para o acúmulo, e a alternativa real não é "fazer com
  // calma", é não fazer — e sem chamada a aluna não tem presença nem
  // falta, e a frequência do certificado sai menor do que a real.
  //
  // Então: dar presença a todas, de uma vez, com duas travas. A
  // primeira é que isto só escreve onde NÃO existe chamada — nada
  // que a professora lançou é tocado. A segunda é o simular: antes de
  // gravar, a tela mostra quantas aulas e quantas alunas, porque isto
  // vai para o arquivo de cinco anos.
  //
  // A aula extra fica de fora: ela não tem lista de alunas, e inventar
  // presença sem saber quem estava lá é inventar registro.
  function presencaParaTodos(opcoes) {
    opcoes = opcoes || {};
    var simular = !!opcoes.simular;
    var por = opcoes.por || (gestaoUser() || {}).nome || "";
    var pendentes = chamadasPendentes(opcoes.professora || "", opcoes.dias)
      .filter(function (c) { return c.tipo !== "extra"; })
      .filter(function (c) { return !opcoes.tipo || c.tipo === opcoes.tipo; })
      .filter(function (c) { return !opcoes.ate || c.data <= opcoes.ate; });

    var aulas = 0, presencas = 0, semAluna = 0, extras = 0, porProfessora = {};
    chamadasPendentes(opcoes.professora || "", opcoes.dias).forEach(function (c) {
      if (c.tipo === "extra") extras++;
    });

    pendentes.forEach(function (c) {
      var ids = [];
      if (c.tipo === "turma") {
        ids = alunasDaTurma(c.label, c.data).map(function (a) { return a.id; });
      } else if (c.tipo === "particular" && c.pessoaId) {
        ids = [c.pessoaId];
      }
      if (!ids.length) { semAluna++; return; }
      aulas++; presencas += ids.length;
      var k = c.professora || "sem professora";
      porProfessora[k] = (porProfessora[k] || 0) + 1;
      if (simular) return;
      var mapa = {};
      ids.forEach(function (id) { mapa[id] = "presente"; });
      salvarChamada(c.label, c.data, mapa, por);
    });

    var resumo = { aulas: aulas, presencas: presencas, semAluna: semAluna,
      extras: extras, simulado: simular,
      porProfessora: Object.keys(porProfessora).sort().map(function (k) {
        return { professora: k, n: porProfessora[k] };
      }) };
    // o lote é uma alteração grande no registro, e a
    // equipe tem que poder ver que foi feita, por quem e quando
    if (!simular && aulas) {
      try {
      } catch (e) {}
    }
    return resumo;
  }

  function proximaAulaParticular(pessoaId) {
    var hoje = iso(today());
    return agendaParticular(pessoaId).filter(function (a) {
      return a.estado === "marcada" && a.data >= hoje;
    })[0] || null;
  }

  // Aulas particulares marcadas de todas as alunas, para a agenda da
  // escola e para o painel da professora.
  function aulasParticularesAgendadas(deIso, ateIso, professora) {
    var out = [];
    loadPessoas().forEach(function (p) {
      if (!p.particular || !p.particular.agenda) return;
      var prof = professoraDaParticular(p);
      if (professora && prof && prof !== professora) return;
      p.particular.agenda.forEach(function (a) {
        if (a.estado === "cancelada") return;
        if (deIso && a.data < deIso) return;
        if (ateIso && a.data > ateIso) return;
        out.push({ pessoaId: p.id, nome: p.nome, aulaId: a.id, data: a.data,
          hora: a.hora || "", estado: a.estado, professora: prof,
          remarcada: (a.remarcacoes || []).length > 0 });
      });
    });
    out.sort(function (a, b) { return (a.data + (a.hora || "")) < (b.data + (b.hora || "")) ? -1 : 1; });
    return out;
  }

  // A chamada das particulares era uma aula por vez: escolher a aluna,
  // escolher o dia, marcar, salvar, escolher a próxima. Quem dá dez aulas
  // particulares na semana percorria dez vezes esse caminho — e não fazia.
  // Aqui vem a semana inteira em uma lista, cada aula com o que já foi
  // marcado, para resolver tudo de uma vez.
  function particularesDaSemana(professora, deIso, ateIso) {
    var de = deIso || addDays(-7), ate = ateIso || iso(today());
    return aulasParticularesAgendadas(de, ate, professora).map(function (a) {
      var label = "Particular · " + a.nome;
      var ch = getChamada(label, a.data);
      var estado = "";
      if (ch && ch.presencas && (a.pessoaId in ch.presencas))
        estado = estadoPresenca(ch.presencas[a.pessoaId]);
      var r = resumoParticular(a.pessoaId) || {};
      return { pessoaId: a.pessoaId, nome: a.nome, data: a.data, hora: a.hora || "",
        professora: a.professora || "", label: label,
        estado: estado, feita: !!estado, remarcada: !!a.remarcada,
        feitas: r.feitas || 0, contratadas: r.contratadas || 0 };
    });
  }
  // Marcar uma aula da lista sem abrir a chamada dela: a presença de uma
  // particular é uma informação só, e salvarChamada continua sendo quem
  // conta a aula no pacote e escreve no histórico da aluna.
  function marcarAulaParticular(pessoaId, dataIso, estado, por) {
    var p = getPessoa(pessoaId);
    if (!p || !dataIso) return null;
    var label = "Particular · " + p.nome;
    var ch = getChamada(label, dataIso);
    var pres = {};
    if (ch && ch.presencas) Object.keys(ch.presencas).forEach(function (k) { pres[k] = ch.presencas[k]; });
    pres[pessoaId] = estado;
    return salvarChamada(label, dataIso, pres, por || "");
  }

  function registrarPagamentoParticular(id) {
    var p = getPessoa(id);
    if (!p || !p.particular || !p.particular.valor) return;
    addLancamento({ data: iso(today()), tipo: "entrada", categoria: "particular",
      descricao: "Pacote de aulas particulares · " + p.nome,
      moeda: p.particular.moeda || "R$", valor: p.particular.valor });
  }

  function setParticularPago(id, pago) {
    var antes = getPessoa(id);
    var jaEra = !!(antes && antes.particular && antes.particular.pago);
    mutate(id, function (p) {
      if (!p.particular) return;
      p.particular.pago = !!pago;
      pushHist(p, "pagamento", "Pacote de aulas particulares "
        + (p.particular.valor || "") + (pago ? " recebido" : " marcado como pendente"));
    });
    if (pago && !jaEra) registrarPagamentoParticular(id);
    return getPessoa(id);
  }

  function encerrarParticular(id, motivo) {
    return mutate(id, function (p) {
      if (!p.particular) return;
      pushHist(p, "perdido", "Pacote de aulas particulares encerrado"
        + (motivo ? " · " + motivo : ""));
      delete p.particular;
    });
  }

  // ── PAGAMENTO DA EQUIPE ───────────────────────────────────────
  //
  // O modelo antigo pagava por hora de aula: R$ 85 valia igual numa
  // turma de 2 e numa de 5, então a professora não tinha participação
  // no que a escola mais precisa — encher e segurar turma. Aqui ela
  // ganha uma fatia da turma dela, com piso para nunca receber menos
  // do que receberia por hora.
  var PAGAMENTO_KEY = "isr_pagamento_v1";
  var PAGAMENTO_PADRAO = {
    moeda: "R$",
    fixo: 200,             // reunião semanal + as aulas extras incluídas
    pctBase: 25,           // % da receita da turma
    pctMeta: 30,           // % quando as metas do ciclo estão em dia
    pisoAula: 85,          // piso por aula dada na turma
    aulaParticular: 85,    // por aula particular dada
    aulaExtraAlem: 85,     // por aula extra além da cota
    extrasIncluidas: 2,    // aulas extras já pagas pelo fixo
    metaFrequencia: 85,    // % de presença no ciclo
    metaTarefas: 80,       // % das chamadas do mês com tarefa marcada
    tetoPct: 32,           // teto: a professora nunca custa mais que isto da receita das turmas dela
    cambioEur: 6.20,       // quantos R$ vale 1 €, para a folha em R$
    diaPagamento: 15,      // dia em que a folha é paga (a equipe recebe dia 15)
    mesesDepois: 1         // o trabalho de um mês é pago no mês seguinte
  };

  // ── QUEM JÁ FOI PAGO ──────────────────────────────────────────
  //
  // A folha diz quanto é devido; isto diz o que já saiu. São coisas
  // diferentes: a professora trabalha num mês e recebe no seguinte.
  var FOLHA_PAGA_KEY = "isr_folha_paga_v1";

  function folhaPagaAll() {
    try { return JSON.parse(localStorage.getItem(FOLHA_PAGA_KEY)) || {}; } catch (e) { return {}; }
  }
  function chavePagamento(nome, mesKey) { return mesKey + "|" + nome; }

  function pagamentoFeito(nome, mesKey) {
    return folhaPagaAll()[chavePagamento(nome, mesKey || mesAtualKey())] || null;
  }
  function marcarPagamentoFeito(nome, mesKey, dados) {
    var m = folhaPagaAll();
    var k = chavePagamento(nome, mesKey || mesAtualKey());
    m[k] = { nome: nome, mes: mesKey || mesAtualKey(),
      valor: (dados && dados.valor) || 0,
      // de onde saiu de fato. Sem isto, folha marcada na mão e folha vista
      // no extrato ficam indistinguíveis — e a segunda é a única que prova
      // quanto e em que moeda a escola pagou.
      moeda: (dados && dados.moeda) || "",
      conta: (dados && dados.conta) || "",
      idExterno: (dados && dados.idExterno) || "",
      em: (dados && dados.em) || iso(today()),
      obs: (dados && dados.obs) || "" };
    try { localStorage.setItem(FOLHA_PAGA_KEY, JSON.stringify(m)); } catch (e) {}
    agendarSync();
    return m[k];
  }
  function desmarcarPagamento(nome, mesKey) {
    var m = folhaPagaAll();
    delete m[chavePagamento(nome, mesKey || mesAtualKey())];
    try { localStorage.setItem(FOLHA_PAGA_KEY, JSON.stringify(m)); } catch (e) {}
    agendarSync();
  }

  // Quando a folha de um mês é paga: dia X, N meses depois do trabalho.
  function vencimentoDaFolha(mesKey, cfgAlt) {
    var cfg = Object.assign(configPagamento(), cfgAlt || {});
    var ano = parseInt((mesKey || mesAtualKey()).slice(0, 4), 10);
    var mes = parseInt((mesKey || mesAtualKey()).slice(5, 7), 10) - 1;
    var d = new Date(ano, mes + (cfg.mesesDepois || 0), cfg.diaPagamento || 5, 12, 0, 0);
    return iso(d);
  }

  // Parte das mensalidades é em euro. Sem converter, € 125 e R$ 125 entravam
  // na mesma soma e a fatia da professora saía errada. Toda conta de
  // pagamento passa por aqui antes de somar.
  function emMoedaDaFolha(valor, moeda, cfg) {
    var c = cfg || configPagamento();
    if (moeda === "€" && (c.moeda || "R$") !== "€") return valor * (c.cambioEur || 1);
    if (moeda !== "€" && (c.moeda || "R$") === "€") return valor / (c.cambioEur || 1);
    return valor;
  }

  function configPagamento() {
    var base = {};
    Object.keys(PAGAMENTO_PADRAO).forEach(function (k) { base[k] = PAGAMENTO_PADRAO[k]; });
    try {
      var g = JSON.parse(localStorage.getItem(PAGAMENTO_KEY));
      if (g) Object.keys(g).forEach(function (k) { if (k in base) base[k] = g[k]; });
    } catch (e) {}
    return base;
  }
  function setConfigPagamento(patch) {
    var cfg = configPagamento();
    Object.keys(patch || {}).forEach(function (k) {
      if (!(k in cfg)) return;
      var v = k === "moeda" ? patch[k] : parseFloat(String(patch[k]).replace(",", "."));
      if (k === "moeda") { cfg[k] = v; return; }
      if (!isNaN(v) && v >= 0) cfg[k] = v;
    });
    try { localStorage.setItem(PAGAMENTO_KEY, JSON.stringify(cfg)); } catch (e) {}
    agendarSync();
    return cfg;
  }

  function mesDe(isoStr) { return (isoStr || "").slice(0, 7); }

  // Aulas dadas de uma turma no mês: uma chamada salva é uma aula dada.
  // Conta as aulas que a folha vai pagar.
  //
  // Fica de fora só a chamada REABERTA para correção: enquanto a
  // professora mexe, a aula não é a que a folha paga, e volta assim que
  // for salva de novo.
  //
  // Chamada antiga sem tópico CONTINUA contando. O tópico passou a ser
  // obrigatório ao salvar, então daqui para a frente não nasce chamada
  // sem ele — mas aplicar a regra para trás cortaria a folha de meses
  // que já foram trabalhados e já foram pagos, por uma exigência que
  // não existia quando aquelas aulas foram dadas. A tela continua
  // dizendo "falta o tópico" em cada uma delas.
  // semSubstituta: tira da conta as aulas que outra pessoa cobriu.
  // A folha da professora da turma usa esta forma; a conta da escola,
  // a forma cheia. Com nenhuma substituição registrada — que é o caso
  // de todo mês já fechado —, as duas dão o mesmo número.
  function aulasDadasNoMes(turmaLabel, mesKey, semSubstituta) {
    var m = chamadasAll(), n = 0, comTarefa = 0, cobertas = 0;
    Object.keys(m).forEach(function (k) {
      var ch = m[k];
      if (ch.turma !== turmaLabel || mesDe(ch.data) !== mesKey) return;
      if (ch.emEdicao) return;
      if (substitutaDaAula(turmaLabel, ch.data)) {
        cobertas++;
        if (semSubstituta) return;
      }
      n++;
      if (ch.tarefas && Object.keys(ch.tarefas).length) comTarefa++;
    });
    return { aulas: n, comTarefa: comTarefa, cobertas: cobertas,
      pctTarefa: n ? Math.round((comTarefa / n) * 100) : null };
  }
  // As aulas que esta pessoa cobriu no mês, como substituta. Elas não
  // estão em turma nenhuma dela — é por aqui que entram na folha.
  function aulasCobertasNoMes(nome, mesKey) {
    var n = String(nome || "");
    var m = chamadasAll();
    var out = [];
    substituicoesLista().forEach(function (s) {
      if (s.cobre !== n || s.status !== "atribuida") return;
      if (mesDe(s.data) !== mesKey) return;
      var ch = m[s.turma + "|" + s.data];
      // só conta a aula que aconteceu e foi registrada: é a mesma
      // régua das outras aulas da folha
      if (!ch || ch.emEdicao) return;
      out.push({ turma: s.turma, data: s.data, noLugarDe: s.pedidoPor });
    });
    return { aulas: out.length, lista: out };
  }

  // Frequência da turma no ciclo corrente (últimos CICLO_MESES meses).
  function frequenciaDaTurma(turmaLabel, nMeses) {
    var limite = addDays(-30 * (nMeses || CICLO_MESES));
    var m = chamadasAll(), presentes = 0, marcas = 0;
    Object.keys(m).forEach(function (k) {
      var ch = m[k];
      if (ch.turma !== turmaLabel || ch.data < limite) return;
      Object.keys(ch.presencas || {}).forEach(function (pid) {
        marcas++;
        var st = estadoPresenca(ch.presencas[pid]);
        if (st === "presente" || st === "atraso") presentes++;
      });
    });
    return { marcas: marcas, presentes: presentes,
      pct: marcas ? Math.round((presentes / marcas) * 100) : null };
  }

  // Aulas particulares dadas por uma professora no mês, pela linha do tempo.
  // O dia da aula. Os registros feitos antes de a data ser gravada trazem
  // o dia dentro do texto ("Aula particular dada em 12/08"), enquanto o
  // carimbo é o dia da digitação — é o texto que vale, senão a aula de
  // agosto registrada em setembro continuaria sendo paga em setembro.
  function diaDaAulaParticular(h) {
    var carimbo = h.data || "";
    var m = String(h.texto || "").match(/dada em (\d{2})\/(\d{2})/);
    if (!m) return carimbo;
    var ano = parseInt((carimbo || iso(today())).slice(0, 4), 10);
    var tenta = ano + "-" + m[2] + "-" + m[1];
    // aula de dezembro digitada em janeiro: o ano do carimbo é o seguinte
    if (carimbo && tenta > carimbo) {
      var antes = (ano - 1) + "-" + m[2] + "-" + m[1];
      if (daysBetween(parseISO(antes), parseISO(carimbo)) < 200) return antes;
    }
    return tenta;
  }
  function ehAulaParticular(h) {
    return String(h.texto || "").indexOf("Aula particular dada") === 0;
  }
  // De quem é esta aluna particular. A resposta estava escrita de quatro
  // jeitos diferentes pelo sistema, e cada tela lia um campo: a ficha
  // gravava em particular.professora, o painel do professor perguntava
  // por p.professora, e o resultado era que toda professora via as
  // particulares de todo mundo na chamada.
  function professoraDaParticular(p) {
    if (!p) return "";
    return (p.particular && p.particular.professora) || p.professora || "";
  }
  function ehAlunaParticular(p) {
    return !!p && p.status === "aluna"
      && (!!p.particular || /particular/i.test(p.turma || ""));
  }
  function particularesNoMes(professora, mesKey) {
    var n = 0, alunas = [];
    loadPessoas().forEach(function (p) {
      if (professora && professoraDaParticular(p) !== professora) return;
      (p.historico || []).forEach(function (h) {
        if (!ehAulaParticular(h)) return;
        if (mesDe(diaDaAulaParticular(h)) !== mesKey) return;
        n++;
        if (alunas.indexOf(p.nome) < 0) alunas.push(p.nome);
      });
    });
    return { aulas: n, alunas: alunas };
  }

  // O que as alunas particulares dessa professora pagam no mês. Existe
  // por um motivo de conta: o pagamento por aula particular entra no total
  // da professora, mas a mensalidade dela nunca entrava na receita. A
  // porcentagem "folha sobre receita" saía inflada, porque numerador e
  // denominador vinham de bases diferentes.
  function receitaParticularesNoMes(professora, mesKey) {
    var cfg = configPagamento();
    var total = 0, alunas = 0;
    loadPessoas().forEach(function (p) {
      if (!ehAlunaParticular(p)) return;
      if (professora && professoraDaParticular(p) !== professora) return;
      var c = contratoVigente(p);
      if (!c) return;
      var m = (c.meses || []).filter(function (x) { return x.key === mesKey; })[0];
      if (!m || !m.valor) return;
      alunas++;
      total += emMoedaDaFolha(parseMoney(m.valor), c.moeda || p.moeda || "R$", cfg);
    });
    return { valor: total, alunas: alunas };
  }

  // Aluna particular sem professora no cadastro. A aula dela é contada
  // pelo nome de quem deu — sem esse nome, a aula não entra na folha de
  // ninguém: o trabalho acontece e o pagamento não é calculado. Some da
  // tela em vez de aparecer como erro, que foi o que aconteceu.
  function particularesSemProfessora(mesKey) {
    var mes = mesKey || mesAtualKey();
    var out = [];
    loadPessoas().forEach(function (p) {
      if (!ehAlunaParticular(p)) return;
      if (professoraDaParticular(p)) return;
      var dadas = (p.historico || []).filter(function (h) {
        return ehAulaParticular(h) && mesDe(diaDaAulaParticular(h)) === mes;
      }).length;
      out.push({ id: p.id, nome: p.nome, aulas: dadas });
    });
    return out;
  }

  // Aulas extras dadas por uma professora no mês.
  function extrasNoMes(professora, mesKey) {
    var lista = eventosLista().filter(function (e) {
      return mesDe(e.data) === mesKey
        && (!professora || e.responsavel === professora || e.professora === professora);
    });
    return { dadas: lista.length,
      titulos: lista.map(function (e) { return e.titulo; }) };
  }

  // ── O FECHAMENTO DE UMA PROFESSORA NUM MÊS ────────────────────
  function pagamentoProfessora(nome, mesKey, cfgAlt) {
    var cfg = Object.assign(configPagamento(), cfgAlt || {});
    var mes = mesKey || mesAtualKey();
    var moeda = cfg.moeda || "R$";

    var turmas = turmasLista().filter(function (u) { return u.teacher === nome; })
      .map(function (u) {
        var label = u.nivel + " · " + u.turma;
        var alunas = alunasDaTurma(label);
        // a receita da turma é o que as alunas ativas pagam por mês.
        // Parte das mensalidades é em euro: cada uma é convertida antes de
        // entrar na soma, e o bruto por moeda fica guardado para a tela.
        var bruto = { "R$": 0, "€": 0 };
        var receita = alunas.reduce(function (soma, a) {
          var c = contratoVigente(a);
          if (!c) return soma;
          var v = parseMoney(c.parcelaValor);
          var m = c.moeda || a.moeda || "R$";
          if (bruto[m] === undefined) bruto[m] = 0;
          bruto[m] += v;
          return soma + emMoedaDaFolha(v, m, cfg);
        }, 0);
        var temEuro = bruto["€"] > 0 && bruto["R$"] > 0;
        // quem está com parcela em aberto. A fatia da professora não muda
        // por causa disso: a base é a matrícula ativa, não o que entrou.
        var devendo = alunas.filter(function (a) { return parcelasAbertas(a).length > 0; });
        var dadas = aulasDadasNoMes(label, mes, true);
        var freq = frequenciaDaTurma(label);
        var freqOk = freq.pct !== null && freq.pct >= cfg.metaFrequencia;
        var tarefaOk = dadas.pctTarefa !== null && dadas.pctTarefa >= cfg.metaTarefas;
        var metaOk = freqOk && tarefaOk;
        var pct = metaOk ? cfg.pctMeta : cfg.pctBase;
        var porFatia = receita * pct / 100;
        var porPiso = dadas.aulas * cfg.pisoAula;
        var valor = Math.max(porFatia, porPiso);
        return { label: label, nivel: u.nivel, horario: u.turma,
          alunas: alunas.length, receita: receita,
          bruto: bruto, moedaMista: temEuro,
          inadimplentes: devendo.length,
          abaixoDoMinimo: alunas.length < MINIMO_TURMA,
          faltamAlunas: Math.max(0, MINIMO_TURMA - alunas.length),
          aulas: dadas.aulas, pctTarefa: dadas.pctTarefa,
          frequencia: freq.pct, freqOk: freqOk, tarefaOk: tarefaOk, metaOk: metaOk,
          pct: pct, porFatia: porFatia, porPiso: porPiso,
          pisoAplicado: porPiso > porFatia, valor: valor };
      });

    var part = particularesNoMes(nome, mes);
    var extras = extrasNoMes(nome, mes);
    var excedente = Math.max(0, extras.dadas - cfg.extrasIncluidas);

    var somaTurmas = turmas.reduce(function (s, x) { return s + x.valor; }, 0);
    var vPart = part.aulas * cfg.aulaParticular;
    var vExtras = excedente * cfg.aulaExtraAlem;
    // O fixo cobre a reunião semanal e as aulas extras incluídas. Quem tem
    // turma só no cadastro — sem aluna e sem aula dada no mês — não fez esse
    // trabalho, então não recebe o fixo por ela.
    var comMovimento = turmas.filter(function (t) { return t.alunas > 0 || t.aulas > 0; });
    var fixo = comMovimento.length ? cfg.fixo : 0;

    var receitaTotal = turmas.reduce(function (s, x) { return s + x.receita; }, 0);
    // O teto continua sobre a receita de turma — particular e extra são
    // serviço à parte. Mas a porcentagem exibida compara o total pago com
    // toda a receita que essa professora gerou, senão não é comparação.
    var receitaPart = receitaParticularesNoMes(nome, mes);

    // TETO: o piso protege a professora, o teto protege a escola. Sem ele, quem
    // tem uma turma só levava o fixo inteiro em cima de pouca receita — 35% de
    // uma turma de 4, contra 30% de quem tem duas. O teto vale sobre a parte de
    // turma (fixo + fatia); particular e extra são serviço à parte e ficam fora.
    var parteTurma = fixo + somaTurmas;
    var teto = receitaTotal * (cfg.tetoPct || 100) / 100;
    var tetoAplicado = receitaTotal > 0 && parteTurma > teto;
    var cortePeloTeto = tetoAplicado ? parteTurma - teto : 0;
    if (tetoAplicado) parteTurma = teto;

    // AS AULAS COBERTAS COMO SUBSTITUTA
    //
    // Não entram em turma nenhuma dela, e por isso ficam fora da fatia
    // e do teto: é aula avulsa, paga pelo piso. A professora que
    // faltou perdeu essa aula na conta dela — as duas pontas batem.
    var cobertas = aulasCobertasNoMes(nome, mes);
    var vCobertas = cobertas.aulas * cfg.pisoAula;

    var total = parteTurma + vPart + vExtras + vCobertas;
    var inadimplentes = turmas.reduce(function (s, x) { return s + x.inadimplentes; }, 0);

    return {
      nome: nome, mes: mes, moeda: moeda, cfg: cfg,
      fixo: fixo, turmas: turmas, somaTurmas: somaTurmas,
      turmasComMovimento: comMovimento.length,
      turmasParadas: turmas.length - comMovimento.length,
      cobertas: { aulas: cobertas.aulas, lista: cobertas.lista, valor: vCobertas,
        porAula: cfg.pisoAula },
      particulares: { aulas: part.aulas, alunas: part.alunas, valor: vPart,
        receita: receitaPart.valor, nAlunas: receitaPart.alunas },
      extras: { dadas: extras.dadas, incluidas: cfg.extrasIncluidas,
        excedente: excedente, valor: vExtras, titulos: extras.titulos },
      total: total,
      receitaTurmas: receitaTotal, receitaParticulares: receitaPart.valor,
      receitaGerada: receitaTotal + receitaPart.valor,
      inadimplentes: inadimplentes,
      tetoAplicado: tetoAplicado, teto: teto, cortePeloTeto: cortePeloTeto,
      parteTurma: parteTurma,
      turmasAbaixoDoMinimo: turmas.filter(function (x) { return x.abaixoDoMinimo; }).length,
      pctDaReceita: (receitaTotal + receitaPart.valor)
        ? Math.round((total / (receitaTotal + receitaPart.valor)) * 1000) / 10 : null,
      fmt: function (v) { return fmtMoney(moeda, v); }
    };
  }

  // ── COMISSÃO DO COMERCIAL ─────────────────────────────────────
  //
  // A regra vem da planilha da Gabi, conferida caso a caso:
  //   comissão de cada venda = (contrato total × %) ÷ nº de parcelas,
  //   lançada nos meses em que as parcelas correm.
  // A % depende de quantas vendas a pessoa fechou no mês, e a partir
  // de 8 vendas entra bônus.
  // A faixa de comissão sobe conforme o valor fechado em contrato no mês.
  // Os degraus abaixo são um ponto de partida — a Gabi ajusta na tela, e a
  // lista editada manda. Cada degrau vale a partir de "de" até o próximo.
  var COMISSAO_FAIXAS_KEY = "isr_comissao_faixas_v1";
  var COMISSAO_FAIXAS_PADRAO = [
    { de: 0,     pct: 1,   bonus: 0,   situacao: "Fora da meta" },
    { de: 5000,  pct: 2,   bonus: 0,   situacao: "Abaixo" },
    { de: 10000, pct: 2.5, bonus: 0,   situacao: "Desejado" },
    { de: 15000, pct: 3,   bonus: 0,   situacao: "Over" },
    { de: 20000, pct: 4,   bonus: 200, situacao: "Over" },
    { de: 30000, pct: 5,   bonus: 500, situacao: "Over" }
  ];
  // O fixo do comercial vem do cadastro da Equipe (valor mensal), como o
  // de todo mundo — constante escondida aqui pagava R$ 1.200 em dobro com
  // o cadastro e aparecia até num mês sem venda nenhuma.
  var COMERCIAL_FIXO = 0;
  var META_POR_VENDA = 3500;

  function faixasComissao() {
    try {
      var l = JSON.parse(localStorage.getItem(COMISSAO_FAIXAS_KEY));
      if (l && l.length) return l.slice().sort(function (a, b) { return a.de - b.de; });
    } catch (e) {}
    return COMISSAO_FAIXAS_PADRAO.map(function (f) { return Object.assign({}, f); });
  }
  function setFaixasComissao(lista) {
    var limpa = (lista || [])
      .map(function (f) {
        return { de: parseMoney(f.de) || 0, pct: parseFloat(f.pct) || 0,
          bonus: parseMoney(f.bonus) || 0, situacao: (f.situacao || "").trim() };
      })
      .filter(function (f) { return f.pct > 0 || f.de > 0; })
      .sort(function (a, b) { return a.de - b.de; });
    try { localStorage.setItem(COMISSAO_FAIXAS_KEY, JSON.stringify(limpa)); } catch (e) {}
    agendarSync();
    return limpa;
  }

  // A faixa vem do valor fechado no mês, não do número de vendas.
  function faixaComissao(valorContratos) {
    var v = parseMoney(valorContratos) || 0;
    if (v <= 0) return { de: 0, pct: 0, situacao: "Sem venda", bonus: 0, valor: 0 };
    var faixas = faixasComissao();
    var escolhida = faixas[0];
    faixas.forEach(function (f) { if (v >= f.de) escolhida = f; });
    var idx = faixas.indexOf(escolhida);
    var prox = faixas[idx + 1] || null;
    return { de: escolhida.de, pct: escolhida.pct,
      situacao: escolhida.situacao || "", bonus: escolhida.bonus || 0,
      valor: v, proxima: prox,
      faltaProxima: prox ? Math.max(0, prox.de - v) : null };
  }

  // Quando um contrato foi fechado. Contratos criados antes do campo
  // fechadoEm não têm a data gravada: a matrícula original vale pela
  // entrada da pessoa, e cada renovação pela marca que deixou no
  // histórico. Sem esta reconstrução, todo contrato antigo seria datado
  // pela entrada e as renovações passadas sumiriam da comissão.
  function fechamentoDoContrato(p, idx) {
    var lista = p.contratos || [];
    var c = lista[idx] || {};
    if (c.fechadoEm) return c.fechadoEm;
    if (!c.renovacao) return p.desde || "";
    var marcas = (p.historico || [])
      .filter(function (h) { return /^Contrato renovado/.test(h.texto || ""); })
      .map(function (h) { return h.data; })
      .sort();
    // contratos vêm do mais novo para o mais antigo; as marcas, ao
    // contrário — a renovação mais nova é a última do histórico
    return marcas[marcas.length - 1 - idx] || p.desde || "";
  }

  // As vendas de um mês: os contratos fechados naquele mês. Uma
  // renovação é uma venda como outra qualquer — foi trabalho de fechar,
  // e as parcelas dela correm igual.
  function vendasDoMes(mesKey, porQuem) {
    var mes = mesKey || mesAtualKey();
    var out = [];
    loadPessoas().forEach(function (p) {
      if (p.status === "lead") return;
      if (porQuem && (p.vendidoPor || p.professora) !== porQuem) return;
      (p.contratos || []).forEach(function (c, idx) {
        if (mesDe(fechamentoDoContrato(p, idx)) !== mes) return;
        var meses = c.meses || [];
        var total = meses.reduce(function (s, m) { return s + parseMoney(m.valor); }, 0);
        if (c.sinal && c.sinal.valor && !c.sinal.cancelada) total += parseMoney(c.sinal.valor);
        if (!total && p.programa) total = parseMoney(p.programa.valor);
        out.push({ id: p.id, nome: p.nome, contrato: total,
          contratoIdx: idx, renovacao: !!c.renovacao,
          parcelas: meses.length || 1,
          primeiroMes: meses.length ? meses[0].key : mes,
          moeda: c.moeda || (p.programa ? p.programa.moeda : "R$") });
      });
    });
    return out;
  }

  // O fechamento do comercial num mês: fixo, comissão e bônus.
  function comissaoComercial(mesKey, porQuem) {
    var mes = mesKey || mesAtualKey();
    var vendas = vendasDoMes(mes, porQuem);
    var meta = META_POR_VENDA * Math.max(1, vendas.length);

    // Contrato em euro vira a moeda da folha antes de qualquer conta.
    // A faixa depende do total fechado no mês, então vem depois da soma.
    var cfgP = configPagamento();
    var convertidas = vendas.map(function (v) {
      return Object.assign({}, v, { contratoOriginal: v.contrato,
        contrato: emMoedaDaFolha(v.contrato, v.moeda, cfgP) });
    });
    var faturado = convertidas.reduce(function (s, x) { return s + x.contrato; }, 0);
    var faixa = faixaComissao(faturado);

    // cada venda gera uma comissão que se espalha nas parcelas dela
    var detalhe = convertidas.map(function (v) {
      var comissao = v.contrato * faixa.pct / 100;
      return Object.assign({}, v, { pct: faixa.pct, comissao: comissao,
        porParcela: v.parcelas ? comissao / v.parcelas : comissao });
    });
    var comissaoTotal = detalhe.reduce(function (s, x) { return s + x.comissao; }, 0);

    // sem venda no mês, não há comissão nem bônus de faixa a pagar
    var bonus = vendas.length ? faixa.bonus : 0;
    return { mes: mes, quem: porQuem || "", vendas: detalhe, nVendas: vendas.length,
      situacao: vendas.length ? faixa.situacao : "Sem venda", pct: faixa.pct, bonus: bonus,
      fixo: COMERCIAL_FIXO, comissao: comissaoTotal,
      total: COMERCIAL_FIXO + comissaoTotal + bonus,
      faturamento: faturado, metaFaturamento: meta,
      faixaDe: faixa.de, proximaFaixa: faixa.proxima, faltaProxima: faixa.faltaProxima,
      cac: faturado ? Math.round(((COMERCIAL_FIXO + comissaoTotal + bonus) / faturado) * 1000) / 10 : null };
  }

  // O que sai de comissão num mês, contando as vendas de meses anteriores
  // cujas parcelas ainda correm — é assim que a planilha paga.
  function comissaoAPagar(mesKey, porQuem) {
    var mes = mesKey || mesAtualKey();
    var liberadas = [], aguardando = [];
    // olha 12 meses para trás procurando vendas cujas parcelas alcançam o
    // mês. A contagem parte do mês perguntado, não de hoje: ancorada em
    // hoje, o fechamento de um mês antigo perdia as vendas que o
    // originaram assim que o calendário andava
    var ancora = parseISO(mes + "-01") || today();
    for (var i = 0; i < 12; i++) {
      var d = new Date(ancora); d.setMonth(d.getMonth() - i);
      var mv = d.getFullYear() + "-" + ("0" + (d.getMonth() + 1)).slice(-2);
      var fech = comissaoComercial(mv, porQuem);
      fech.vendas.forEach(function (v) {
        var p = getPessoa(v.id);
        // a comissão corre nas parcelas DAQUELE contrato. Olhar sempre o
        // contrato vigente fazia a venda antiga ser paga pelas parcelas
        // do ciclo novo, e o ciclo antigo não pagava nada
        var c = p && (p.contratos || [])[v.contratoIdx];
        if (!c) return;
        var parcela = (c.meses || []).filter(function (m) { return m.key === mes; })[0];
        if (!parcela) return;
        var qual = (c.meses || []).map(function (m) { return m.key; }).indexOf(mes) + 1;
        var linha = { nome: v.nome, mesVenda: mv, contrato: v.contrato,
          renovacao: !!v.renovacao,
          parcelas: v.parcelas, parcelaN: qual, pct: v.pct,
          paga: !!parcela.pago, valor: v.porParcela };
        // a comissão acompanha a parcela: só entra quando a aluna paga
        if (parcela.pago) liberadas.push(linha); else aguardando.push(linha);
      });
    }
    return { mes: mes, linhas: liberadas, aguardando: aguardando,
      total: liberadas.reduce(function (s, x) { return s + x.valor; }, 0),
      totalAguardando: aguardando.reduce(function (s, x) { return s + x.valor; }, 0) };
  }

  // ── QUEM DÁ AULA SEM ESTAR NA EQUIPE ──────────────────────────
  //
  // A Equipe é o cadastro das pessoas. A turma guarda só o nome de quem
  // dá a aula. Quando alguém é escrito na turma sem passar pelo cadastro,
  // aparece na folha de pagamento e em lugar nenhum mais: não tem e-mail,
  // não tem acesso, não tem carteira, não tem remuneração combinada.
  // A folha não pode esconder essa pessoa — ela deu aula e tem a receber —
  // mas também não pode fingir que está tudo certo.
  function professorasSemCadastro() {
    var cadastradas = {};
    equipeLista().forEach(function (m) { cadastradas[m.nome] = true; });
    var achadas = {};
    turmasLista().forEach(function (u) {
      if (!u.teacher || cadastradas[u.teacher]) return;
      achadas[u.teacher] = achadas[u.teacher] || { nome: u.teacher, turmas: [], alunas: 0 };
      achadas[u.teacher].turmas.push(u.nivel + " · " + u.turma);
    });
    loadPessoas().forEach(function (p) {
      if (!p.professora || cadastradas[p.professora]) return;
      achadas[p.professora] = achadas[p.professora] || { nome: p.professora, turmas: [], alunas: 0 };
      if (p.status === "aluna") achadas[p.professora].alunas++;
    });
    return Object.keys(achadas).map(function (k) { return achadas[k]; })
      .sort(function (a, b) { return a.nome < b.nome ? -1 : 1; });
  }

  // Cadastra na Equipe alguém que já dá aula. É o atalho para resolver o
  // aviso sem ter que redigitar o nome e correr o risco de errar — o nome
  // é a chave que liga turma, aluna e folha.
  function cadastrarProfessora(nome, extra) {
    var n = (nome || "").trim();
    if (!n) return null;
    var ja = equipeLista().filter(function (m) { return m.nome === n; })[0];
    if (ja) return ja;
    addEquipe(Object.assign({ nome: n, email: "", papeis: ["professora"],
      valorTipo: "", valor: 0, moeda: configPagamento().moeda }, extra || {}));
    return equipeLista().filter(function (m) { return m.nome === n; })[0];
  }

  // ── FUROS DE CADASTRO ─────────────────────────────────────────
  //
  // Coisas que ninguém vai procurar mas que travam dinheiro ou deixam
  // aluna sem dono. Cada uma é um afazer da gestora: tem o que fazer e
  // onde fazer, não é só um número numa tela de relatório.
  // "Ciente" esconde a pendência de vez: nem toda pendência tem solução
  // imediata (uma turma com 2 alunas pode ser decisão consciente de
  // mantê-la). A escolha vale em todos os aparelhos — entra no backup e
  // na sincronização como os demais dados.
  var FUROS_OK_KEY = "isr_furos_ok_v1";
  function furosCientes() {
    try { return JSON.parse(localStorage.getItem(FUROS_OK_KEY)) || {}; } catch (e) { return {}; }
  }
  function marcarFuroCiente(chave) {
    if (!chave) return;
    var m = furosCientes();
    m[chave] = iso(today());
    try { localStorage.setItem(FUROS_OK_KEY, JSON.stringify(m)); } catch (e) {}
    agendarSync();
  }

  function furosDeCadastro() {
    var out = [];

    // aluna sem professora: ninguém acompanha, ninguém dá chamada por ela
    // O botão precisa levar à TURMA dela (é lá que se atribui professora) —
    // por isso resolve o id da turma pelo nome; id de pessoa na página da
    // turma abria a turma errada. Sem turma, o caminho é o perfil.
    carteiraProfessoras().semProfessora.forEach(function (a) {
      var temTurma = a.turma && a.turma !== "—";
      var t = temTurma
        ? ocupacaoTurmas().filter(function (x) { return x.label === a.turma; })[0]
        : null;
      out.push({ tipo: "aluna_sem_professora", urg: 1, chave: "aluna_sem_professora|" + a.id,
        titulo: a.nome + " está sem professora",
        detalhe: temTurma
          ? "Turma " + a.turma + " sem professora atribuída"
          : "Sem turma e sem professora",
        onde: t ? "ISR - Turma v3.dc.html" : "ISR - Perfil v3.dc.html",
        ondeLabel: t ? "Abrir a turma" : "Abrir o perfil",
        turmaId: t ? t.id : "",
        pessoaId: a.id });
    });

    // quem dá aula sem cadastro: o pagamento fica retido
    var folha = folhaPagamento();
    (folha.semCadastro || []).forEach(function (s) {
      out.push({ tipo: "professora_sem_cadastro", urg: 1, chave: "professora_sem_cadastro|" + s.nome,
        titulo: s.nome + " dá aula e não está na equipe",
        detalhe: s.aPagar
          ? fmtMoney(configPagamento().moeda, s.aPagar) + " retidos até o cadastro"
          : "Sem cadastro, sem acesso e sem remuneração combinada",
        onde: "ISR - Equipe v3.dc.html", ondeLabel: "Cadastrar",
        nome: s.nome });
    });

    // valor combinado sem forma de pagamento: o número está lá e não paga
    // ninguém. Acontecia por um bug do formulário, e o dado ficou.
    equipeLista().forEach(function (m) {
      if (!(m.valor > 0) || m.valorTipo) return;
      out.push({ tipo: "remuneracao_incompleta", urg: 1, chave: "remuneracao_incompleta|" + m.nome,
        titulo: m.nome + " tem " + fmtMoney(m.moeda || "R$", m.valor) + " no cadastro sem forma de pagamento",
        detalhe: "Sem escolher \u201ccomo recebe\u201d, o valor não entra na folha",
        onde: "ISR - Equipe v3.dc.html", ondeLabel: "Corrigir",
        nome: m.nome });
    });

    // turma que não fecha o mínimo: decisão de juntar ou encerrar.
    // Abre a página da própria turma, com as alunas e os dados à vista.
    turmasAbaixoDoMinimo().forEach(function (u) {
      out.push({ tipo: "turma_abaixo_minimo", urg: 2, chave: "turma_abaixo_minimo|" + u.id,
        titulo: u.label + " com " + u.alunas
          + (u.alunas === 1 ? " aluna" : " alunas"),
        detalhe: "Faltam " + u.faltam + " para o mínimo de " + MINIMO_TURMA,
        onde: "ISR - Turma v3.dc.html", ondeLabel: "Abrir a turma",
        turmaId: u.id });
    });

    // contrato vencendo sem renovação aberta
    loadPessoas().forEach(function (p) {
      if (p.status !== "aluna") return;
      var c = contratoVigente(p);
      if (!c || !c.fim) return;
      var dias = daysBetween(today(), parseISO(c.fim));
      if (dias < 0 || dias > 45) return;
      if (p.renovacao && p.renovacao !== "a_abordar") return;
      // direto no perfil da pessoa, onde a renovação é conduzida
      out.push({ tipo: "renovacao_parada", urg: 2, chave: "renovacao_parada|" + p.id,
        titulo: p.nome + " termina o ciclo em " + dias + " dias",
        detalhe: "Conversa de renovação ainda não começou",
        onde: "ISR - Perfil v3.dc.html", ondeLabel: "Abrir",
        pessoaId: p.id });
    });

    var cientes = furosCientes();
    return out.filter(function (f) { return !cientes[f.chave]; })
      .sort(function (a, b) { return a.urg - b.urg; });
  }

  // Todas as professoras do mês, com o total da folha.
  function folhaPagamento(mesKey) {
    var mes = mesKey || mesAtualKey();
    var nomes = [];
    equipeLista().forEach(function (m) {
      if ((m.papeis || []).indexOf("professora") >= 0 && nomes.indexOf(m.nome) < 0) nomes.push(m.nome);
    });
    turmasLista().forEach(function (u) {
      if (u.teacher && nomes.indexOf(u.teacher) < 0) nomes.push(u.teacher);
    });
    // quem não tem nada a receber não é linha da folha. Turma parada no
    // cadastro não põe ninguém aqui.
    // Folha é de gente da equipe. Nome escrito numa turma não é cadastro:
    // não tem e-mail, acesso, carteira nem remuneração combinada. O cálculo
    // dessa pessoa continua sendo feito — o trabalho existiu e o valor não
    // pode se perder — mas fica retido fora da folha até alguém cadastrar.
    var cadastradas = {};
    equipeLista().forEach(function (m) { cadastradas[m.nome] = true; });
    var todas = nomes.map(function (n) { return pagamentoProfessora(n, mes); })
      .filter(function (x) { return x.total > 0; })
      .map(function (x) { x.cadastrada = !!cadastradas[x.nome]; return x; });
    var linhas = todas.filter(function (x) { return x.cadastrada; });
    var retidas = todas.filter(function (x) { return !x.cadastrada; });
    var total = linhas.reduce(function (s, x) { return s + x.total; }, 0);
    // Duas receitas, com nomes diferentes de propósito: a das turmas é a
    // base do rateio; a gerada é tudo que a professora traz, e é contra ela
    // que se compara o que ela recebe.
    var receita = linhas.reduce(function (s, x) { return s + x.receitaTurmas; }, 0);
    var receitaGerada = linhas.reduce(function (s, x) { return s + x.receitaGerada; }, 0);
    // quem tem valor mensal no cadastro da Equipe — operação, prestadoras —
    // também é folha do mês, mesmo sem turma nenhuma.
    var fixos = equipeLista()
      .filter(function (m) { return m.valorTipo === "mensal" && m.valor > 0 && vigenteNoMes(m, mes); })
      .map(function (m) {
        var papel = (m.papeis || []).filter(function (x) { return x !== "professora"; })[0]
          || (m.papeis || [])[0] || "equipe";
        return { nome: m.nome, papel: papel, moeda: m.moeda || "R$", bruto: m.valor,
          total: emMoedaDaFolha(m.valor, m.moeda || "R$", configPagamento()) };
      });
    var totalFixos = fixos.reduce(function (s, x) { return s + x.total; }, 0);

    var pagas = linhas.concat(fixos).filter(function (x) { return !!pagamentoFeito(x.nome, mes); });
    var totalPago = pagas.reduce(function (s, x) { return s + x.total; }, 0);
    var porNome = {};
    retidas.forEach(function (x) { porNome[x.nome] = x.total; });
    var semCadastro = professorasSemCadastro().map(function (s) {
      s.aPagar = porNome[s.nome] || 0;
      return s;
    });
    var totalRetido = retidas.reduce(function (s, x) { return s + x.total; }, 0);
    var particularSemProf = particularesSemProfessora(mes);
    return { mes: mes, linhas: linhas, total: total, receitaTurmas: receita,
      particularesSemProfessora: particularSemProf,
      nParticularesSemProfessora: particularSemProf.length,
      receitaGerada: receitaGerada,
      semCadastro: semCadastro, nSemCadastro: semCadastro.length,
      retidas: retidas, totalRetido: totalRetido,
      fixos: fixos, totalFixos: totalFixos, totalComFixos: total + totalFixos,
      vencimento: vencimentoDaFolha(mes),
      nPagas: pagas.length, nPagaveis: linhas.length + fixos.length,
      totalPago: totalPago, totalAberto: (total + totalFixos) - totalPago,
      pctDaReceita: receitaGerada ? Math.round((total / receitaGerada) * 1000) / 10 : null,
      moeda: configPagamento().moeda };
  }

  // ── AGENDA DO COMERCIAL ───────────────────────────────────────
  //
  // Quatro coisas acontecem no comercial e ficam espalhadas: leads que
  // entram, contatos feitos, reuniões e matrículas. Aqui elas viram uma
  // linha do tempo só, para dar para ver a distribuição do trabalho —
  // em que dias houve movimento e em que dias não houve nada.
  var DIA_CURTO = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"];

  function agendaComercial(nDias) {
    var n = nDias || 30;
    var inicio = addDays(-(n - 1));
    var hoje = iso(today());
    var mapa = {};
    for (var i = 0; i < n; i++) {
      var dia = addDays(-(n - 1) + i);
      var d = parseISO(dia);
      mapa[dia] = { data: dia, diaSemana: DIA_CURTO[d.getDay()],
        fimDeSemana: d.getDay() === 0 || d.getDay() === 6,
        entradas: [], contatos: [], reunioes: [], matriculas: [] };
    }
    var dentro = function (x) { return x && x >= inicio && x <= hoje && mapa[x]; };

    loadPessoas().forEach(function (p) {
      if (dentro(p.entrouEm)) mapa[p.entrouEm].entradas.push({ id: p.id, nome: p.nome,
        canal: (p.origem || {}).canal || "" });
      // matrícula: a data de entrada de quem virou cliente
      if (dentro(p.desde) && p.status !== "lead")
        mapa[p.desde].matriculas.push({ id: p.id, nome: p.nome, turma: p.turma || "" });
      var r = p.reuniao;
      if (r && dentro(r.data)) mapa[r.data].reunioes.push({ id: p.id, nome: p.nome,
        hora: r.hora || "", dono: r.dono || "", feita: !!r.feita });
    });

    toquesLista().forEach(function (x) {
      if (!dentro(x.data)) return;
      var pe = getPessoa(x.pessoaId);
      mapa[x.data].contatos.push({ id: x.pessoaId, nome: pe ? pe.nome : "(removida)",
        por: x.por || "", tipo: x.tipo || "contato" });
    });

    var dias = Object.keys(mapa).sort().map(function (k) {
      var d = mapa[k];
      d.total = d.entradas.length + d.contatos.length + d.reunioes.length + d.matriculas.length;
      return d;
    });

    var totais = { entradas: 0, contatos: 0, reunioes: 0, matriculas: 0 };
    var porPessoa = {}, porDiaSemana = [0, 0, 0, 0, 0, 0, 0];
    dias.forEach(function (d) {
      totais.entradas += d.entradas.length;
      totais.contatos += d.contatos.length;
      totais.reunioes += d.reunioes.length;
      totais.matriculas += d.matriculas.length;
      porDiaSemana[DIA_CURTO.indexOf(d.diaSemana)] += d.total;
      d.contatos.forEach(function (c) {
        var nome = c.por || "sem responsável";
        porPessoa[nome] = porPessoa[nome] || { nome: nome, contatos: 0, reunioes: 0 };
        porPessoa[nome].contatos++;
      });
      d.reunioes.forEach(function (r) {
        var nome = r.dono || "sem responsável";
        porPessoa[nome] = porPessoa[nome] || { nome: nome, contatos: 0, reunioes: 0 };
        porPessoa[nome].reunioes++;
      });
    });

    var uteis = dias.filter(function (d) { return !d.fimDeSemana; });
    var vazios = uteis.filter(function (d) { return d.total === 0; });
    var pico = dias.reduce(function (a, b) { return b.total > a.total ? b : a; }, dias[0] || { total: 0 });

    return {
      dias: dias, totais: totais,
      diasUteis: uteis.length, diasSemNada: vazios.length,
      porDiaUtil: uteis.length ? Math.round((totais.contatos / uteis.length) * 10) / 10 : 0,
      porPessoa: Object.keys(porPessoa).map(function (k) { return porPessoa[k]; })
        .sort(function (a, b) { return (b.contatos + b.reunioes) - (a.contatos + a.reunioes); }),
      porDiaSemana: DIA_CURTO.map(function (lbl, i) { return { dia: lbl, n: porDiaSemana[i] }; }),
      pico: pico,
      // Conversão só faz sentido sobre a mesma gente: de quem entrou no
      // período, quantas já fecharam. Comparar com o total de matrículas
      // dava mais de 100%, porque muita gente que fechou entrou antes.
      conversao: (function () {
        var entraram = loadPessoas().filter(function (p) {
          return dentro(p.entrouEm);
        });
        if (!entraram.length) return null;
        var fecharam = entraram.filter(function (p) { return p.status !== "lead"; });
        return Math.round((fecharam.length / entraram.length) * 100);
      })(),
      coorte: (function () {
        var entraram = loadPessoas().filter(function (p) { return dentro(p.entrouEm); });
        return { entraram: entraram.length,
          fecharam: entraram.filter(function (p) { return p.status !== "lead"; }).length };
      })()
    };
  }

  // ── GRAVAÇÕES DAS AULAS ───────────────────────────────────────
  //
  // Duas regras de acesso, e elas não são a mesma: a gravação de aula
  // extra é da escola inteira; a gravação de uma aula de turma é só de
  // quem está naquela turma.
  var GRAVACOES_KEY = "isr_gravacoes_v1";

  function gravacoesLista() {
    try { return JSON.parse(localStorage.getItem(GRAVACOES_KEY)) || []; } catch (e) { return []; }
  }
  function gravacoesSave(l) {
    carimbarLista(l);
    try { localStorage.setItem(GRAVACOES_KEY, JSON.stringify(l)); } catch (e) {}
    agendarSync();
  }
  function addGravacao(dados) {
    var l = gravacoesLista();
    var g = { id: "gr" + Date.now(),
      tipo: dados.tipo === "extra" ? "extra" : "turma",
      turma: dados.turma || "",         // rótulo da turma, quando tipo=turma
      eventoId: dados.eventoId || "",   // id do evento, quando tipo=extra
      titulo: dados.titulo || "Aula gravada",
      data: dados.data || iso(today()),
      link: dados.link || "",
      por: (gestaoUser() || {}).nome || "" };
    l.push(g); gravacoesSave(l); return g;
  }
  function removeGravacao(id) {
    gravacoesSave(gravacoesLista().filter(function (g) { return g.id !== id; }));
  }
  function gravacaoDaAula(turmaLabel, dataIso) {
    return gravacoesLista().filter(function (g) {
      return g.tipo === "turma" && g.turma === turmaLabel && g.data === dataIso;
    })[0] || null;
  }
  // Salva ou atualiza a gravação de uma aula da turma numa data.
  function setGravacaoDaAula(turmaLabel, dataIso, link, titulo) {
    var l = gravacoesLista();
    var achou = false;
    l.forEach(function (g) {
      if (g.tipo !== "turma" || g.turma !== turmaLabel || g.data !== dataIso) return;
      achou = true;
      g.link = link || "";
      if (titulo) g.titulo = titulo;
      carimbar(g);
    });
    if (!achou && link) {
      gravacoesSave(l);
      return addGravacao({ tipo: "turma", turma: turmaLabel, data: dataIso,
        link: link, titulo: titulo || "Aula de " + ddmm(dataIso) });
    }
    if (achou && !link) l = l.filter(function (g) {
      return !(g.tipo === "turma" && g.turma === turmaLabel && g.data === dataIso);
    });
    gravacoesSave(l);
    return gravacaoDaAula(turmaLabel, dataIso);
  }

  // O que esta pessoa pode assistir: as extras são de todo mundo; as da
  // turma, só se ela estiver nela.
  // As gravações que a aluna pode ver. Duas regras, e as duas foram
  // apontadas pela escola:
  //
  // 1. SÃO AS AULAS DELA, NÃO AS DA TURMA EM QUE ELA ESTÁ HOJE. Servir
  //    pela turma atual fazia quem trocou de turma perder as gravações
  //    das aulas que assistiu e ganhar as de aulas que nunca teve. A
  //    chamada é quem sabe: a aula é dela se ela aparece na chamada.
  //    É o mesmo casamento que o caderno já faz.
  //
  // 2. O ACESSO É DURANTE O PERÍODO DE AULAS. Quem saiu da escola não
  //    continua com a biblioteca aberta — nem as gravações da turma
  //    nem as extras. Enquanto é aluna, vê; deixou de ser, não vê.
  function gravacoesParaAluna(pessoaId) {
    var p = getPessoa(pessoaId);
    var vazio = { extras: [], turma: [], semAcesso: true };
    if (!p) return vazio;
    if (p.status !== "aluna" && p.status !== "mvs") return vazio;
    var todas = gravacoesLista().filter(function (g) { return !!g.link; });
    // as datas em que ela esteve na chamada, por turma
    var minhas = {};
    var cham = chamadasAll();
    Object.keys(cham).forEach(function (k) {
      var ch = cham[k];
      if (!ch || !ch.data || !ch.presencas) return;
      if (!(pessoaId in ch.presencas)) return;
      minhas[ch.turma + "|" + ch.data] = true;
    });
    var daTurma = todas.filter(function (g) {
      return g.tipo === "turma" && minhas[g.turma + "|" + g.data];
    });
    var ordena = function (a, b) { return a.data < b.data ? 1 : -1; };
    return { extras: todas.filter(function (g) { return g.tipo === "extra"; }).sort(ordena),
      turma: daTurma.sort(ordena), semAcesso: false };
  }

  // ── TAREFA DE CASA ────────────────────────────────────────────
  // A professora marca fez/não fez na chamada. Isto conta o resultado.
  function tarefasDeCasa(pessoaId, desdeIso) {
    var entregues = 0, cobradas = 0;
    var cham = chamadasAll();
    Object.keys(cham).forEach(function (k) {
      var ch = cham[k];
      if (!ch.tarefas || !(pessoaId in ch.tarefas)) return;
      if (desdeIso && ch.data < desdeIso) return;
      cobradas++;
      if (ch.tarefas[pessoaId] === true) entregues++;
    });
    return { entregues: entregues, cobradas: cobradas,
      pct: cobradas ? Math.round((entregues / cobradas) * 100) : null };
  }

  // ── AULAS DO CICLO ────────────────────────────────────────────
  //
  // O ciclo tem um número fixo de aulas. Contar "mês 2 de 3" não diz
  // nada para a aluna; contar "aula 6 de 10" diz — e faz falta pesar.
  var AULAS_POR_CICLO_PADRAO = 10;
  var AULAS_CICLO_KEY = "isr_aulas_ciclo_v1";

  // ── TAMANHO MÍNIMO DA TURMA ───────────────────────────────────
  //
  // Abaixo de 3 alunas a turma não se paga: o custo da professora é o
  // mesmo e a receita cai. A regra vale para abrir e para manter.
  var MINIMO_TURMA = 3;

  function turmasAbaixoDoMinimo() {
    return turmasLista().map(function (u) {
      var label = u.nivel + " · " + u.turma;
      var n = alunasDaTurma(label).length;
      return { id: u.id, label: label, nivel: u.nivel, horario: u.turma,
        professora: u.teacher, alunas: n, faltam: Math.max(0, MINIMO_TURMA - n) };
    }).filter(function (x) { return x.alunas < MINIMO_TURMA; });
  }

  function aulasPorCiclo() {
    try {
      var n = parseInt(localStorage.getItem(AULAS_CICLO_KEY), 10);
      if (!isNaN(n) && n > 0) return n;
    } catch (e) {}
    return AULAS_POR_CICLO_PADRAO;
  }
  function setAulasPorCiclo(n) {
    var v = parseInt(n, 10);
    if (isNaN(v) || v < 1) return aulasPorCiclo();
    try { localStorage.setItem(AULAS_CICLO_KEY, String(v)); } catch (e) {}
    agendarSync();
    return v;
  }

  // Quantas aulas ela já fez no ciclo vigente e quantas faltam.
  // ── TRAJETÓRIA DE NÍVEIS ──────────────────────────────────────
  //
  // Quem estuda há dois anos vê o ciclo corrente e mais nada. O caminho
  // A1 → A2 → B1 é o que dá a sensação de ter avançado.
  function historicoDeNiveis(pessoaId) {
    var p = getPessoa(pessoaId);
    if (!p) return [];
    var out = [];
    (p.historico || []).forEach(function (h) {
      var m = /n[íi]vel[^A-Za-zÀ-ú]*(?:de\s+)?(.+?)\s+para\s+(.+?)\.?$/i.exec(h.texto || "");
      if (m) out.push({ data: h.data, de: m[1].trim(), para: m[2].trim() });
    });
    var etapas = [];
    if (out.length) {
      etapas.push({ nivel: out[0].de, desde: p.desde || "", ate: out[0].data, atual: false });
      out.forEach(function (x, i) {
        etapas.push({ nivel: x.para, desde: x.data,
          ate: out[i + 1] ? out[i + 1].data : "", atual: !out[i + 1] });
      });
    } else if (p.nivel) {
      etapas.push({ nivel: p.nivel, desde: p.desde || "", ate: "", atual: true });
    }
    return etapas;
  }

  // ── ACESSO DAS ALUNAS AO APP ──────────────────────────────────
  //
  // Antes de mexer em tela, medir: se ninguém abre o app, o problema não é
  // o card de avaliação. Guarda só a data do último acesso e a contagem.
  var ACESSOS_KEY = "isr_acessos_v1";
  function acessosAll() {
    try { return JSON.parse(localStorage.getItem(ACESSOS_KEY)) || {}; } catch (e) { return {}; }
  }
  function registrarAcessoAluna(pessoaId) {
    if (!pessoaId) return null;
    var m = acessosAll();
    var hoje = iso(today());
    var r = m[pessoaId] || { n: 0, primeiro: hoje, ultimo: "" , dias: [] };
    if (r.ultimo !== hoje) {
      r.n += 1;
      r.dias = (r.dias || []).concat([hoje]).slice(-90);
    }
    r.ultimo = hoje;
    m[pessoaId] = r;
    try { localStorage.setItem(ACESSOS_KEY, JSON.stringify(m)); } catch (e) {}
    return r;
  }
  function acessoDaAluna(pessoaId) {
    var r = acessosAll()[pessoaId];
    if (!r) return { nunca: true, n: 0, ultimo: "", diasSemAbrir: null };
    var d = parseISO(r.ultimo);
    return { nunca: false, n: r.n, ultimo: r.ultimo, primeiro: r.primeiro,
      diasSemAbrir: d ? daysBetween(d, today()) : null };
  }

  // ── O PERFIL QUE A ALUNA ESCREVE ──────────────────────────────
  //
  // Foto, bio, links e aniversário não são dados da escola: são dela.
  // A escola não os tem nem deveria digitá-los, e por isso quem grava é
  // o app dela.
  //
  // Isto é um caminho estreito de propósito. A alternativa seria expor
  // o mutate e deixar o app da aluna escrever qualquer campo do
  // cadastro — nome, turma, contrato. Um app que roda no aparelho de
  // outra pessoa não ganha a chave do cadastro inteiro; ganha a porta
  // dos quatro campos que são dela.
  var PERFIL_LIMITES = { bio: 400, link: 200, links: 4 };
  function salvarPerfilDaAluna(pessoaId, dados) {
    var p = getPessoa(pessoaId);
    if (!p) return { ok: false, erro: "Aluna não encontrada." };
    dados = dados || {};
    var out = {};
    if ("bio" in dados) {
      out.bio = String(dados.bio || "").trim().slice(0, PERFIL_LIMITES.bio);
    }
    if ("foto" in dados) {
      var foto = String(dados.foto || "").trim();
      // Só endereço de imagem na web. Link que não é http não carrega, e
      // dado embutido (data:) cresce o cadastro sem limite e viaja em
      // todo sync.
      if (foto && !/^https:\/\//i.test(foto)) {
        return { ok: false, erro: "O endereço da foto precisa começar com https://" };
      }
      out.foto = foto;
    }
    if ("aniversario" in dados) {
      var a = String(dados.aniversario || "").trim();
      // dia e mês, sem ano: a comunidade comemora, não precisa da idade
      if (a && !/^\d{2}-\d{2}$/.test(a)) {
        return { ok: false, erro: "O aniversário é dia e mês, no formato DD-MM." };
      }
      if (a) {
        var dia = parseInt(a.slice(0, 2), 10), mes = parseInt(a.slice(3, 5), 10);
        if (mes < 1 || mes > 12 || dia < 1 || dia > 31) {
          return { ok: false, erro: "Esse dia e mês não existem." };
        }
      }
      out.aniversario = a;
    }
    if ("links" in dados) {
      var ruim = null;
      var links = (dados.links || []).map(function (l) {
        return { label: String((l && l.label) || "").trim().slice(0, 40),
          url: String((l && l.url) || "").trim().slice(0, PERFIL_LIMITES.link) };
      }).filter(function (l) { return l.url; });
      links.forEach(function (l) {
        if (!/^https:\/\//i.test(l.url)) ruim = l.url;
      });
      if (ruim) return { ok: false, erro: "Cada link precisa começar com https:// — veja " + ruim };
      out.links = links.slice(0, PERFIL_LIMITES.links);
    }
    mutate(pessoaId, function (pp) {
      Object.keys(out).forEach(function (k) { pp[k] = out[k]; });
    });
    agendarSync();
    return { ok: true, perfil: perfilDaAluna(pessoaId) };
  }
  function perfilDaAluna(pessoaId) {
    var p = getPessoa(pessoaId) || {};
    return { foto: p.foto || "", bio: p.bio || "",
      aniversario: p.aniversario || "", links: (p.links || []).slice(0, PERFIL_LIMITES.links),
      limites: PERFIL_LIMITES };
  }

  // ── CONVIDAR A ALUNA PARA O APP ───────────────────────────────
  //
  // O convite vai para o e-mail da MATRÍCULA, e isso é estrutural, não
  // uma recomendação: esta função não aceita um endereço digitado. Ela
  // recebe o id da aluna e manda para o e-mail que está na ficha dela.
  // Um campo livre aqui seria a porta para convidar qualquer um, e o
  // acesso ao app é o acesso aos dados dela.
  //
  // Quem convida é a gestora logada: o navegador manda o token do
  // Netlify Identity, e a função do Netlify valida. A chave do Zapier
  // continua existindo para a automação do systeme, e não passa pelo
  // navegador de ninguém.
  function convidarAluna(pessoaId) {
    var p = getPessoa(pessoaId);
    if (!p) return Promise.resolve({ ok: false, erro: "Aluna não encontrada." });
    if (p.status !== "aluna" && p.status !== "mvs") {
      return Promise.resolve({ ok: false,
        erro: "O convite é para quem já é aluna. " + firstName(p.nome)
          + " ainda está como " + (p.status || "lead") + "." });
    }
    var email = String(p.email || "").trim().toLowerCase();
    if (!email || email.indexOf("@") < 1) {
      return Promise.resolve({ ok: false,
        erro: "A ficha de " + firstName(p.nome) + " não tem e-mail. "
          + "O convite vai para o e-mail da matrícula, então ele precisa estar no cadastro." });
    }
    return chamarFuncao("convidar-aluna", { body: { email: email } })
      .then(function (r) { return r.json().catch(function () { return {}; }); })
      .then(function (d) {
        if (!d || !d.ok) {
          return { ok: false, erro: (d && d.erro) || "O convite não saiu.", email: email };
        }
        // fica na ficha: quem olhar depois precisa saber que já foi, e
        // quando, para não convidar a mesma pessoa toda semana
        mutate(pessoaId, function (pp) {
          pp.convidadaEm = iso(today());
          pp.convidadaPara = email;
        });
        agendarSync();
        return { ok: true, email: email, jaTinhaConta: !!d.jaTinhaConta };
      })
      .catch(function (e) {
        return { ok: false, erro: "Não foi possível falar com o servidor: " + String(e && e.message || e) };
      });
  }
  // ── O CONVITE DA EQUIPE ───────────────────────────────────────
  //
  // Até aqui, pôr uma professora no sistema era duas tarefas em dois
  // lugares: cadastrar na tela Equipe e convidar à mão no painel do
  // Netlify. Quem esquecia a segunda metade tinha uma pessoa cadastrada
  // que não conseguia entrar — e a tela de entrada dizia só que o
  // e-mail não estava no cadastro, o que mandava procurar no lugar
  // errado.
  //
  // O convite é o MESMO do lado das alunas: a função do Netlify manda o
  // e-mail do Identity. O que muda é quem pode receber — aqui, quem
  // está na Equipe com uma função que abre o sistema. Convidar uma
  // prestadora sem função criaria uma conta que a porta recusa.
  function convidarEquipe(membroId) {
    var m = equipeLista().filter(function (x) { return x.id === membroId; })[0];
    if (!m) return Promise.resolve({ ok: false, erro: "Pessoa não encontrada na Equipe." });
    var perfil = perfilDosPapeis(m.papeis || []);
    if (!perfil) {
      return Promise.resolve({ ok: false,
        erro: "Nenhuma função de " + firstName(m.nome) + " abre o sistema. "
          + "Marque professora, comercial, operação, aulas extras ou shadow antes de convidar." });
    }
    var email = String(m.email || "").trim().toLowerCase();
    if (!email || email.indexOf("@") < 1) {
      return Promise.resolve({ ok: false,
        erro: "A ficha de " + firstName(m.nome) + " não tem e-mail. "
          + "O convite vai para ele, então ele precisa estar no cadastro." });
    }
    return chamarFuncao("convidar-aluna", { body: { email: email } })
      .then(function (r) { return r.json().catch(function () { return {}; }); })
      .then(function (d) {
        if (!d || !d.ok) {
          return { ok: false, erro: (d && d.erro) || "O convite não saiu.", email: email };
        }
        updateEquipe(membroId, { convidadaEm: iso(today()), convidadaPara: email });
        return { ok: true, email: email, jaTinhaConta: !!d.jaTinhaConta };
      })
      .catch(function (e) {
        return { ok: false, erro: "Não foi possível falar com o servidor: " + String(e && e.message || e) };
      });
  }
  function conviteDaEquipe(membroId) {
    var m = equipeLista().filter(function (x) { return x.id === membroId; })[0] || {};
    return { em: m.convidadaEm || "", para: m.convidadaPara || "",
      email: String(m.email || "").trim(),
      podeEntrar: !!perfilDosPapeis(m.papeis || []) };
  }

  function conviteDaAluna(pessoaId) {
    var p = getPessoa(pessoaId) || {};
    return { em: p.convidadaEm || "", para: p.convidadaPara || "",
      email: String(p.email || "").trim() };
  }

  // ── O PLANO DE AULA ───────────────────────────────────────────
  //
  // Duas camadas, e a separação entre elas é o ponto.
  //
  // O SYLLABUS é da escola: por nível e por ciclo, as sessões do
  // projeto, cada uma com objetivo, etapas, palavras e homework. É o
  // que a Gabi escreve nos guias do professor, e é igual para todas as
  // turmas daquele nível.
  //
  // O PLANO é da turma: começa como a sessão do syllabus e a
  // professora ajusta — tira uma etapa que não cabe, muda o tempo,
  // reordena, acrescenta a dela. Depois marca pronta e publica, e só
  // então a aula aparece no caderno das alunas.
  //
  // O plano só passa a existir no armazenamento quando a professora
  // mexe nele (cópia na primeira edição). Enquanto ela não mexe, a
  // tela lê o syllabus direto: assim uma correção no syllabus alcança
  // as turmas que ainda não ajustaram nada, e NÃO desfaz o ajuste de
  // quem já mexeu — que seria apagar o trabalho dela.
  //
  // As fases são as da ISR, tiradas dos guias, não as de um protótipo:
  // todo guia organiza a sessão em Warm-up, Minds On, Language Focus,
  // Hands On, Share Out e Wrap-up, e a reflexão roda sempre no
  // Wrap-up.
  var FASES = [
    { id: "warmup", label: "Warm-up", min: 10 },
    { id: "mindson", label: "Minds On", min: 10 },
    { id: "language", label: "Language Focus", min: 12 },
    { id: "handson", label: "Hands On", min: 15 },
    { id: "shareout", label: "Share Out", min: 10 },
    { id: "wrapup", label: "Wrap-up", min: 5 }
  ];
  // A cor de cada fase. O desenho tem cinco fases (warm-up, listen,
  // learn, practice, mission) e a ISR tem seis — as dos guias da
  // escola, que é o que as professoras usam. Ficam as seis, com as
  // cores do desenho distribuídas pela mesma lógica: abertura em
  // areia, escuta em azul, língua em amarelo, mão na massa em verde,
  // apresentação em verde claro e fechamento em coral.
  var FASE_CORES = {
    warmup: "var(--color-button-secondary)",
    mindson: "var(--color-primary-50)",
    language: "var(--color-warning-light)",
    handson: "var(--color-secondary-100)",
    shareout: "var(--color-secondary-100)",
    wrapup: "var(--color-error-light)"
  };
  function faseCor(id) { return FASE_CORES[id] || "var(--color-button-secondary)"; }

  // ── A COR DO NÍVEL ───────────────────────────────────────────
  //
  // Mora aqui porque o arquivo 04 do handoff exige que a faixa do
  // cartão da turma, no painel, tenha a MESMA cor da tela de Turmas da
  // coordenação. Eram dois mapas, cada tela com o seu, e já tinham
  // divergido: no painel o A1 era bege, na página da turma era o A0.
  //
  // Nenhuma é #f2ebe3: esse é o fundo da página, e a faixa pintada
  // com ele simplesmente não aparecia — era o caso do First Steps.
  // Do quente ao frio, na ordem dos níveis: a faixa vira uma régua, e
  // quem tem seis turmas na tela acha a que procura sem ler o rótulo.
  var CORES_NIVEL = [
    ["A0", "FIRST STEPS", "var(--color-error-light)"],
    ["A1", "BASICS", "var(--color-warning-light)"],
    ["A2", "ESSENTIALS", "var(--color-secondary-100)"],
    ["B1", "SPEAKING", "var(--color-primary-50)"],
    ["B2", "ADVANCED", "var(--color-primary-100)"]
  ];
  function corDoNivel(nivel) {
    var n = String(nivel || "").toUpperCase();
    for (var i = 0; i < CORES_NIVEL.length; i++) {
      if (n.indexOf(CORES_NIVEL[i][0]) >= 0 || n.indexOf(CORES_NIVEL[i][1]) >= 0) {
        return CORES_NIVEL[i][2];
      }
    }
    return "var(--color-tertiary-50)";
  }
  function fasesDoPlano() {
    return FASES.map(function (f) { return Object.assign({ cor: faseCor(f.id) }, f); });
  }
  function faseLabel(id) {
    var f = FASES.filter(function (x) { return x.id === id; })[0];
    return f ? f.label : String(id || "");
  }
  var SYLLABUS_KEY = "isr_syllabus_v1";
  var PLANOS_KEY = "isr_planos_v1";
  // ── OS MATERIAIS DO CICLO ─────────────────────────────────────
  //
  // O syllabus do ciclo e o guia de cada nível são documentos, e é
  // neles que o trabalho pedagógico de verdade mora. O sistema não os
  // copia para dentro: ele guarda a PORTA para cada um, por ciclo e
  // por nível, e a tela do plano abre a porta certa.
  //
  // Copiar o texto dos guias para cá seria criar uma segunda versão
  // que envelhece sozinha. A professora precisa do guia inteiro, e o
  // guia inteiro é o documento.
  var MATERIAIS_KEY = "isr_materiais_v1";
  function materiaisAll() {
    try { return JSON.parse(localStorage.getItem(MATERIAIS_KEY)) || {}; } catch (e) { return {}; }
  }
  function materiaisSave(m) {
    try { localStorage.setItem(MATERIAIS_KEY, JSON.stringify(m)); } catch (e) {}
    agendarSync();
  }
  // O ciclo da turma não é sempre o ciclo das metas: na virada, as
  // turmas continuam marcadas com o ciclo anterior por um tempo. Então
  // a busca é pelo ciclo pedido e, se ele não tem material guardado,
  // pelo ciclo que a escola está dando agora — que é o guia que a
  // professora quer abrir. Sem essa volta, o link que a Gabi acabou de
  // cadastrar não aparecia em turma nenhuma.
  function materiaisDoCiclo(ciclo) {
    var m = materiaisAll();
    var atual = metasAtuais().cicloLabel;
    var c = ciclo || atual;
    var r = m[c];
    var de = c;
    if (!r || (!r.syllabus && !Object.keys(r.guias || {}).length)) {
      if (m[atual]) { r = m[atual]; de = atual; }
    }
    r = r || {};
    return { ciclo: c, de: de, syllabus: r.syllabus || "", guias: r.guias || {} };
  }
  function guiaDoNivel(nivel, ciclo) {
    return materiaisDoCiclo(ciclo).guias[nivel] || "";
  }
  // Só https: um link que não é https não abre, e aqui ele vira botão.
  function salvarMateriais(ciclo, dados) {
    var c = String(ciclo || metasAtuais().cicloLabel || "").trim();
    if (!c) return { ok: false, erro: "Diga de que ciclo são os materiais." };
    dados = dados || {};
    var limpa = function (u) {
      var v = String(u || "").trim().slice(0, 300);
      if (!v) return "";
      return /^https:\/\//i.test(v) ? v : null;
    };
    var m = materiaisAll();
    var r = m[c] || { guias: {} };
    if ("syllabus" in dados) {
      var s = limpa(dados.syllabus);
      if (s === null) return { ok: false, erro: "O link do syllabus precisa começar com https://" };
      r.syllabus = s;
    }
    if (dados.guias) {
      r.guias = r.guias || {};
      var ruim = "";
      Object.keys(dados.guias).forEach(function (n) {
        var g = limpa(dados.guias[n]);
        if (g === null) { ruim = n; return; }
        if (g) r.guias[n] = g; else delete r.guias[n];
      });
      if (ruim) return { ok: false, erro: "O link do guia de " + ruim + " precisa começar com https://" };
    }
    r._v = Date.now();
    m[c] = r;
    materiaisSave(m);
    return { ok: true, materiais: materiaisDoCiclo(c) };
  }
  var PLANO_LIMITES = { titulo: 120, objetivo: 400, etapa: 200, homework: 600,
    palavras: 40, etapas: 20, min: 180 };

  function syllabusAll() {
    try { return JSON.parse(localStorage.getItem(SYLLABUS_KEY)) || []; } catch (e) { return []; }
  }
  function syllabusSave(l) {
    carimbarLista(l);
    try { localStorage.setItem(SYLLABUS_KEY, JSON.stringify(l)); } catch (e) {}
    agendarSync();
  }
  // As sessões de um nível num ciclo, em ordem.
  // ── O SYLLABUS DO TRADITIONS 2026.4 ──────────────────────────
  //
  // Isto não é dado de exemplo: é o syllabus de verdade da escola,
  // transcrito dos guias do professor. Ele entra uma vez, e só onde o
  // nível ainda não tem sessão nenhuma — depois disso a escola manda,
  // e nada aqui sobrescreve o que ela escreveu.
  //
  // A semeadura usa o ciclo que as TURMAS carregam, não um rótulo
  // escrito aqui: na virada as turmas ficam com o ciclo anterior por
  // um tempo, e um rótulo fixo não alcançaria nenhuma delas.
  var FASE_SEED = { w: "warmup", m: "mindson", l: "language", h: "handson",
    s: "shareout", r: "wrapup" };
  var SYLLABUS_2026_4 = {
    // ── BASICS (A1) ──
    // Transcrito inteiro: título, objetivo, as seis fases com o tempo
    // que o guia dá a cada uma (eles variam por sessão — a 6 e a 8 dão
    // 20 minutos ao Hands On, a 10 dá 25 ao Share Out), as palavras e o
    // homework.
    "A1": {
      projeto: "Traditions",
      sessoes: [
        [1, "Introductions and Our End of Year Dishes",
          "By the end of this session every student has, in her notebook, the one page she will build on for the rest of the cycle.",
          [["w", "Introductions: each student says her name, where she is from and where she lives now", 10],
           ["m", "The photographs are displayed; each student names her own dish and the person who makes it", 10],
           ["l", "This is…, makes with the third-person -s, the frequency phrase, and the possessives my / her / his", 10],
           ["h", "Each student sets up her two notebook pages and writes one sentence on each", 15],
           ["s", "Each student gives her name and presents her dish and its maker", 10],
           ["r", "Reflection in Portuguese; homework given", 5]],
          "have (I have two sisters), is, my, her, his",
          "Ask a relative which dish reminds them of the end of the year and bring a photo."],
        [2, "Meet My Family",
          "By the end of this session every student has her family written on her page and can ask three questions about another student's relative and answer three about her own.",
          [["w", "Each student shows the photograph she brought and names the dish and its maker", 10],
           ["m", "The family words are given and written on the page; you then question one student's page", 15],
           ["l", "Does she…? and Where does he live?, with the answers", 15],
           ["h", "Pair interview: three questions each way, written down", 10],
           ["s", "Two pairs repeat their exchange for the group", 5],
           ["r", "Reflection in Portuguese; homework given", 5]],
          "Does she…?, Where does he live?, He lives…, She doesn't…",
          "Send a voice message presenting one family member."],
        [3, "The Story Behind the Dish",
          "By the end of this session every student can join two ideas with and or then: My grandmother makes pavê every Christmas, and my mother helps her.",
          [["w", "A guessing round: you describe one of the group's dishes and they say which it is", 10],
           ["m", "Each student produces the sentence with the third-person -s", 10],
           ["l", "A substitution table, then the connectors and and then", 15],
           ["h", "She writes two joined sentences, and two questions for the relative", 15],
           ["s", "Each student reads her joined sentence aloud", 5],
           ["r", "Reflection in Portuguese; homework given", 5]],
          "makes, cooks, every Christmas, and, then",
          "Ask the person how they learned the recipe."],
        [4, "Inside a Recipe",
          "By the end of this session every student can name the main ingredients of her dish and read a quantity aloud: 200 grams of sugar, a spoon of salt, some milk.",
          [["w", "Each student says her Session 3 sentence; then names one thing that goes into her dish", 10],
           ["m", "The illustrated recipe is read and the ingredients are underlined", 10],
           ["l", "200 grams of sugar, a spoon of salt, some milk", 15],
           ["h", "Each student writes the ingredient list of her own dish", 15],
           ["s", "Each student reads three lines of her list aloud", 5],
           ["r", "Reflection in Portuguese; homework given", 5]],
          "200 grams, a cup of, a spoon of, some",
          "Photograph the ingredients of your dish."],
        [5, "Cups, Grams and Spoons",
          "By the end of this session every student can find the instruction verbs in a short recipe and ask about a quantity: Mix the flour and the sugar. How much sugar? How many eggs?",
          [["w", "The blank quantities are filled in from the homework photograph; the ingredient words are checked", 10],
           ["m", "Two versions of the same recipe, side by side; the students find the verbs", 10],
           ["l", "The imperative, and How much against How many", 15],
           ["h", "A group round: each student asks about other students' lists", 15],
           ["s", "Each student reads one line she took from someone else's list", 5],
           ["r", "Reflection in Portuguese; homework given", 5]],
          "mix, add, put, cut, bake, How many…?, How much…?",
          "Read the instructions on one food package and copy two verbs."],
        [6, "Our Family Recipe",
          "By the end of this session every student has, written on her page, the ingredient list and three steps of her family recipe. This is the first of the two deliverables of the cycle.",
          [["w", "The verbs from Session 5 are checked; the homework verbs are added", 10],
           ["m", "You draft three steps of one student's recipe in front of the group", 10],
           ["l", "First and Then, and the imperative on the page", 10],
           ["h", "Each student writes her own three steps, then reads them to a partner", 20],
           ["s", "Two students read all three steps to the group", 5],
           ["r", "Reflection in Portuguese; homework given", 5]],
          "First…, Then…, imperatives",
          "Finish the ingredient list at home."],
        [7, "Hello, 2027",
          "By the end of this session every student can state three wishes for 2027 and ask another student whether she wants the same.",
          [["w", "The remaining students read their recipes; the recipe is then closed", 10],
           ["m", "Images of common resolutions; the group gets the words it needs", 10],
           ["l", "I want to…, I'd like to…, and Do you want to…?", 15],
           ["h", "A group round of questions, then each student writes her three wishes", 15],
           ["s", "Each student reads one of her own wishes and one of someone else's", 5],
           ["r", "Reflection in Portuguese; homework given", 5]],
          "I want to…, I'd like to…",
          "Write the wishes on a note and put it somewhere visible."],
        [8, "My 2027 List",
          "By the end of this session every student has a list of three to five things she wants to do in 2027, written on a New Year card, and can read it aloud. This is the second of the two deliverables of the cycle.",
          [["w", "Real New Year cards are read aloud; each student reads her Session 7 wishes", 10],
           ["m", "A real list and a real card, side by side", 10],
           ["l", "The three shapes of a list line; Happy New Year! and I hope you…", 10],
           ["h", "Each student writes her list onto a card and reads it to herself", 20],
           ["s", "Each student reads her card aloud, timed", 5],
           ["r", "Reflection in Portuguese; homework given", 5]],
          "I want to…, I'd like to…, Happy New Year!, I hope…",
          "Send the card to the real person, if you wish."],
        [9, "Making It Happen",
          "By the end of this session every item on every student's list carries a month, a place and a person: I want to travel to Brazil in July, with my sister.",
          [["w", "Each student reads her card; the twelve months are checked", 10],
           ["m", "The same wish written twice, vague and concrete", 10],
           ["l", "in March, to Brazil, with my sister, and I'm going to start in…", 15],
           ["h", "Each student adds the detail to every line of her list, then reads two lines to a partner", 15],
           ["s", "Each student reads one finished item with all three parts in it", 5],
           ["r", "The readiness check for Session 10; homework given", 5]],
          "in March, next year, with my…, I'm going to start in…",
          "Tell one person at home about your list and when you will start."],
        [10, "The Traditions Showcase",
          "Each student presents her family dish, its ingredients and three wishes for 2027, and answers one prepared question.",
          [["w", "The group is brought back into English after the break", 10],
           ["m", "Each listener writes the one question she will ask, and whom she will ask", 5],
           ["l", "The running order of the turn, written up and left visible", 5],
           ["h", "Timed rehearsal in pairs, twice through", 10],
           ["s", "The showcase: each student presents and answers one question", 25],
           ["r", "Self-assessment against the ISR scale; reflection in Portuguese", 5]],
          "This is my…, She makes…, I'd like to…",
          "Share the photo of the finished dish with the group."]
      ]
    },

    // ── ESSENTIALS (A2) ──
    // Título, objetivo, palavras e homework do syllabus da escola. As
    // seis fases entram com o tempo padrão da ISR; os tempos por sessão
    // do guia do A2 entram na próxima rodada.
    "A2": {
      projeto: "Traditions",
      sessoes: [
        [1, "Our End of Year Dishes",
          "Sharing how the family celebrates the end of the year, in a round of short descriptions.", [],
          "We usually…, every year, on Christmas Eve",
          "Ask a relative which dish reminds them of the end of the year and bring a photo."],
        [2, "Meet My Family",
          "Asking and answering past simple questions about a family memory.", [],
          "past simple regular and irregular, Did she…?, When did you…?, didn't",
          "Write three sentences about that memory."],
        [3, "The Story Behind the Dish",
          "Telling the story of a family dish as a simple sequence of points.", [],
          "past simple, and, but, because, then, so",
          "Ask the person how they learned the recipe and take notes."],
        [4, "Inside a Recipe",
          "Identifying imperatives and sequencers in a model recipe. The rule about dictionaries, translators and AI is stated here and applies from today.", [],
          "first, then, next, after that, finally",
          "Find a recipe in English for a dish you know and bring it."],
        [5, "Cups, Grams and Spoons",
          "By the end of this session the student can say a recipe's quantities out loud, ask and answer how much, how many and how long about a dish, and write the ingredient list of her own recipe with a number and a unit on every line.", [],
          "cups, tablespoons, grams, How much…?, How many…?, How long…?",
          "Read three packages in a Dutch supermarket and note the measurements."],
        [6, "Our Family Recipe",
          "Writing a family recipe with ingredients, quantities and steps. This is the first of the two deliverables of the cycle.", [],
          "imperatives with sequencers",
          "Photograph the ingredients or the preparation."],
        [7, "Hello, 2027",
          "Talking about plans and wishes for 2027.", [],
          "going to, want to, would like to, hope to",
          "Write the resolutions on a note and place it somewhere visible."],
        [8, "My 2027 List",
          "Writing a list of five things I am going to do in 2027, each with a reason or a time. This is the second of the two deliverables of the cycle.", [],
          "going to for plans, will for promises, because, in March, by June",
          "Send the card to the real person, if you wish."],
        [9, "Making It Happen",
          "Explaining the first step of each plan and naming what could stop it.", [],
          "first, then, after that, I'm going to start by + -ing, but, because",
          "Take the first step of one item and be ready to say what happened."],
        [10, "The Traditions Showcase",
          "Presenting the family story, the recipe and the resolutions for 2027, and answering two prepared questions.", [],
          "past simple, imperatives, going to",
          "Share the photo of the finished dish with the group."]
      ]
    },

    // ── A2/B1 TRANSITION ──
    // A tabela deste grupo no syllabus da escola traz "Outcome (A2)" e
    // "Stretch towards B1" em vez de gramática e homework: é um grupo de
    // A2 puxado para B1, avaliado pelos descritores de A2. O objetivo
    // vem do guia do professor; onde o guia não traz a frase, vale o
    // Outcome com o Stretch. O homework é o do A2, por ser o mesmo
    // projeto no mesmo ciclo — a escola troca quando quiser.
    "A2/B1": {
      projeto: "Traditions",
      sessoes: [
        [1, "Our End of Year Dishes",
          "By the end of this session every student can say, in four sentences, what her family eats and does at the end of the year. Stretch towards B1: say why that dish matters to the family.", [],
          "",
          "Ask a relative which dish reminds them of the end of the year and bring a photo."],
        [2, "Meet My Family",
          "By the end of this session every student can ask and answer past simple questions about one remembered occasion. Stretch towards B1: past continuous for the background, and one follow-up question after each answer.", [],
          "past simple with and, but, because, Did she…?",
          "Write three sentences about that memory."],
        [3, "The Story Behind the Dish",
          "By the end of this session every student can see the story as a sequence of points and report it to the group. Stretch towards B1: mark the chronological sequence and close with a comment.", [],
          "",
          "Ask the person how they learned the recipe and take notes."],
        [4, "Inside a Recipe",
          "By the end of this session every student can see that a recipe has parts, and can find the imperatives and the sequencers in one. The rule about dictionaries, translators and AI is stated here and applies from today to the end of the cycle. Stretch towards B1: find the tips as well, and the time clauses that carry them (until, as soon as).", [],
          "imperatives, first, then, next, after that, finally",
          "Find a recipe in English for a dish you know and bring it."],
        [5, "Cups, Grams and Spoons",
          "By the end of this session every student can say a recipe's quantities out loud, ask and answer how much, how many and how long about a dish, and write the ingredient list of her own recipe with a number and a unit on every line. Stretch towards B1: explain the substitution of one ingredient.", [],
          "How much…?, How many…?, How long…?",
          "Read three packages in a Dutch supermarket and note the measurements."],
        [6, "Our Family Recipe",
          "Each student writes her family recipe in full: the ingredients, the quantities and the steps. Stretch towards B1: add two tips introduced by make sure you… This is the first of the two deliverables of the cycle.", [],
          "imperatives with time clauses",
          "Photograph the ingredients or the preparation."],
        [7, "Hello, 2027",
          "By the end of this session every student can say what she is going to do and what she would like to do next year. Stretch towards B1: contrast going to, will and the present continuous by function.", [],
          "going to, want to, would like to, hope to",
          "Write the resolutions on a note and place it somewhere visible."],
        [8, "My 2027 List",
          "By the end of this session every student has turned last week's wishes into a list of five things she is going to do in 2027, each carrying a reason or a time. Stretch towards B1: add the first concrete step to each item. This is the second of the two deliverables of the cycle.", [],
          "going to, will, because, in March, by June",
          "Send the card to the real person, if you wish."],
        [9, "Making It Happen",
          "By the end of this session every student can say what the first step of a plan is and name one thing that could stop it. Stretch towards B1: say what she will do if that happens, with if for the obstacle.", [],
          "first, then, after that, I'm going to start by + -ing, if",
          "Take the first step of one item and be ready to say what happened."],
        [10, "The Traditions Showcase",
          "Each student presents the story, the recipe and three resolutions, with photos, and answers prepared questions from the audience. Stretch towards B1: sequence marked in the story, tips in the recipe, future forms chosen by function.", [],
          "",
          "Share the photo of the finished dish with the group."]
      ]
    },

    // ── SPEAKING GROUP (B1) ──
    "B1": {
      projeto: "Traditions",
      sessoes: [
        [1, "Our End of Year Dishes",
          "Describing family traditions and the people who keep them alive, in a round of short accounts.", [],
          "used to, still, every year",
          "Ask a relative which dish reminds them of the end of the year and bring a photo."],
        [2, "Meet My Family",
          "By the end of this session every student can narrate one remembered occasion, keeping apart what was going on and what happened: We were all in the kitchen and my grandmother was making the pavê when my uncle arrived with the wrong dessert.", [],
          "past simple and past continuous",
          "Write the first version of the memory."],
        [3, "The Story Behind the Dish",
          "By the end of this session every student can tell the story of how the dish reached her family in a clear order, using when, while, after that and eventually. She also leaves with four questions written in English to ask the person who makes it.", [],
          "when, while, after that, eventually",
          "Ask the person how they learned the recipe and take notes."],
        [4, "Inside a Recipe",
          "By the end of this session every student can find the tips in a commented recipe, state what each tip is for, and write three tips of her own using make sure you, until, as soon as and otherwise.", [],
          "make sure you…, until, as soon as, otherwise",
          "Find a commented recipe in English and bring one tip."],
        [5, "Cups, Grams and Spoons",
          "By the end of this session every student can take the main points out of a short article on the origin of a dish, say which measuring system a recipe uses, and ask for the quantity she needs: This recipe is in cups. How much is a cup in grams?", [],
          "US, UK and metric units, approximately",
          "Read three packages in a Dutch supermarket and note the measurements."],
        [6, "Our Family Recipe",
          "By the end of this session every student has written her commented family recipe in full: the name of the dish, the ingredients with quantities, the steps as imperatives with time clauses, and three tips. This is the first of the two deliverables of the cycle.", [],
          "imperatives with time clauses",
          "Photograph the ingredients or the preparation."],
        [7, "Hello, 2027",
          "By the end of this session every student can say three things about 2027 and choose the right future form for each one: I'm going to look for a new job for a plan already made, I'll probably travel in July for something still undecided, and I'm starting the course in March for an arrangement already fixed.", [],
          "going to, will and present continuous, plan to, decide to",
          "Write the resolutions on a note and place it somewhere visible."],
        [8, "My 2027 List",
          "By the end of this session every student has a written list of five items for 2027, each one carrying a reason, a timeframe and a first step. This is the second of the two deliverables of the cycle.", [],
          "going to, will and present continuous by function, the first thing I need to do is…",
          "Put the list somewhere you will see it every day."],
        [9, "Making It Happen",
          "By the end of this session every student can plan one item of her list in three steps, name the obstacle that could stop it, and say what she will do if that happens: I'm going to start by calling the school. If they have no places in March, I'll apply for September.", [],
          "first conditional (If I…, I'll…), in case, I'm going to start by + -ing",
          "Take the first step of one item and bring the result to the showcase."],
        [10, "The Traditions Showcase",
          "Presenting the story, the commented recipe and the resolutions to an international audience, and answering the group's follow-up questions.", [],
          "narrative tenses, future forms by function",
          "Share the photo of the finished dish with the group."]
      ]
    }
  };
  // Qual tabela vale para o nível da turma. Os nomes da escola são
  // "Essentials (A2)", "Basics (A1)", "Speaking (B1)" — o casamento é
  // pelo código do nível, que é o que não muda.
  function tabelaDoNivel(nivel) {
    var n = String(nivel || "").toUpperCase();
    if (n.indexOf("A2/B1") >= 0) return SYLLABUS_2026_4["A2/B1"];
    if (n.indexOf("A2") >= 0 || n.indexOf("ESSENTIALS") >= 0) return SYLLABUS_2026_4["A2"];
    if (n.indexOf("A1") >= 0 || n.indexOf("BASICS") >= 0) return SYLLABUS_2026_4["A1"];
    if (n.indexOf("B1") >= 0 || n.indexOf("SPEAKING") >= 0) return SYLLABUS_2026_4["B1"];
    return null;
  }
  var SEMEADO_KEY = "isr_syllabus_semeado_v1";
  function semearSyllabus() {
    var feito = {};
    try { feito = JSON.parse(localStorage.getItem(SEMEADO_KEY)) || {}; } catch (e) {}
    var mudou = false;
    turmasLista().forEach(function (u) {
      if (!u.nivel || !u.cycle) return;
      var k = u.nivel + "|" + u.cycle;
      if (feito[k]) return;
      // nunca por cima do que a escola já escreveu
      if (syllabusDoNivel(u.nivel, u.cycle).length) { feito[k] = "ja tinha"; mudou = true; return; }
      var tab = tabelaDoNivel(u.nivel);
      if (!tab) return;
      tab.sessoes.forEach(function (sx) {
        var etapas = (sx[3] || []).map(function (e) {
          return { fase: FASE_SEED[e[0]] || "handson", titulo: e[1], min: e[2],
            pergunta: e[3] || "" };
        });
        salvarSessaoSyllabus({ nivel: u.nivel, ciclo: u.cycle, n: sx[0],
          projeto: tab.projeto, titulo: sx[1] || "", objetivo: sx[2] || "",
          etapas: etapas, palavras: sx[4] || "", homework: sx[5] || "" });
      });
      feito[k] = iso(today());
      mudou = true;
    });
    if (mudou) { try { localStorage.setItem(SEMEADO_KEY, JSON.stringify(feito)); } catch (e) {} }
    return feito;
  }

  function syllabusDoNivel(nivel, ciclo) {
    var c = ciclo || metasAtuais().cicloLabel;
    return syllabusAll()
      .filter(function (s) { return s && !s.apagado && s.nivel === nivel && s.ciclo === c; })
      .sort(function (a, b) { return (a.n || 0) - (b.n || 0); });
  }
  function limpaEtapas(lista) {
    return (lista || []).slice(0, PLANO_LIMITES.etapas).map(function (e, i) {
      var min = parseInt(e && e.min, 10);
      return {
        id: (e && e.id) || ("et" + i + "-" + Date.now()),
        fase: (e && e.fase) || FASES[0].id,
        titulo: String((e && e.titulo) || "").trim().slice(0, PLANO_LIMITES.etapa),
        min: isFinite(min) && min > 0 ? Math.min(min, PLANO_LIMITES.min) : 10,
        // a pergunta que a aluna responde no caderno; vazia = etapa sem tarefa
        pergunta: String((e && e.pergunta) || "").trim().slice(0, PLANO_LIMITES.etapa),
        on: (e && e.on) !== false,
        minha: !!(e && e.minha)
      };
    });
  }
  function limpaPalavras(v) {
    var l = Array.isArray(v) ? v : String(v || "").split(",");
    var vistas = {}, out = [];
    l.forEach(function (p) {
      var w = String(p || "").trim().slice(0, 80);
      var k = w.toLowerCase();
      if (!w || vistas[k]) return;
      vistas[k] = true; out.push(w);
    });
    return out.slice(0, PLANO_LIMITES.palavras);
  }
  function salvarSessaoSyllabus(dados) {
    dados = dados || {};
    var nivel = String(dados.nivel || "").trim();
    var n = parseInt(dados.n, 10);
    if (!nivel) return { ok: false, erro: "Diga o nível da sessão." };
    if (!isFinite(n) || n < 1) return { ok: false, erro: "A sessão precisa de um número." };
    var ciclo = String(dados.ciclo || metasAtuais().cicloLabel || "").trim();
    var l = syllabusAll().filter(function (s) { return s && !s.apagado; });
    var reg = dados.id ? l.filter(function (s) { return s.id === dados.id; })[0] : null;
    if (!reg) {
      reg = l.filter(function (s) {
        return s.nivel === nivel && s.ciclo === ciclo && s.n === n;
      })[0];
    }
    var campos = {
      nivel: nivel, ciclo: ciclo, n: n,
      projeto: String(dados.projeto || "").trim().slice(0, PLANO_LIMITES.titulo),
      titulo: String(dados.titulo || "").trim().slice(0, PLANO_LIMITES.titulo),
      objetivo: String(dados.objetivo || "").trim().slice(0, PLANO_LIMITES.objetivo),
      homework: String(dados.homework || "").trim().slice(0, PLANO_LIMITES.homework),
      guia: String(dados.guia || "").trim().slice(0, 300),
      slides: String(dados.slides || "").trim().slice(0, 300),
      palavras: limpaPalavras(dados.palavras),
      etapas: limpaEtapas(dados.etapas && dados.etapas.length ? dados.etapas
        : FASES.map(function (f) { return { fase: f.id, titulo: "", min: f.min }; }))
    };
    if (reg) Object.keys(campos).forEach(function (k) { reg[k] = campos[k]; });
    else { reg = Object.assign({ id: "sy" + Date.now() + "-" + l.length }, campos); l.push(reg); }
    syllabusSave(l);
    return { ok: true, sessao: reg };
  }
  function apagarSessaoSyllabus(id) {
    var l = syllabusAll(), achou = false;
    l.forEach(function (s) { if (s && s.id === id) { s.apagado = iso(today()); carimbar(s); achou = true; } });
    if (!achou) return { ok: false };
    try { localStorage.setItem(SYLLABUS_KEY, JSON.stringify(l)); } catch (e) {}
    agendarSync();
    return { ok: true };
  }

  function planosAll() {
    try { return JSON.parse(localStorage.getItem(PLANOS_KEY)) || {}; } catch (e) { return {}; }
  }
  function planosSave(m) {
    try { localStorage.setItem(PLANOS_KEY, JSON.stringify(m)); } catch (e) {}
    agendarSync();
  }
  function planoChave(turmaId, n) { return turmaId + "|" + n; }
  // O plano de uma sessão numa turma: o que a professora gravou, ou a
  // sessão do syllabus enquanto ela não gravou nada.
  function planoDaTurma(turmaId, n) {
    var t = (turmasLista().filter(function (x) { return x.id === turmaId; })[0]) || null;
    if (!t) return null;
    var sess = syllabusDoNivel(t.nivel, t.cycle).filter(function (s) { return s.n === n; })[0] || null;
    var meu = planosAll()[planoChave(turmaId, n)] || null;
    if (!sess && !meu) return null;
    var base = sess || {};
    return {
      turma: turmaId, n: n,
      titulo: base.titulo || "", objetivo: base.objetivo || "",
      projeto: base.projeto || t.projeto || "",
      // o guia é do NÍVEL, não da sessão: é um documento só para as dez
      // sessões, e repeti-lo por sessão era convidar dez links
      // diferentes para o mesmo guia
      guia: base.guia || guiaDoNivel(t.nivel, t.cycle),
      // Os slides são da SESSÃO: cada aula tem o seu deck. Vêm do
      // syllabus do nível e a turma pode trocar o link — há turma que
      // usa uma cópia própria do deck.
      slides: (meu && meu.slides !== undefined) ? meu.slides : (base.slides || ""),
      syllabusDoCiclo: materiaisDoCiclo(t.cycle).syllabus,
      doSyllabus: !!sess, tocado: !!meu,
      etapas: limpaEtapas(meu ? meu.etapas : base.etapas),
      palavras: limpaPalavras(meu && meu.palavras !== undefined ? meu.palavras : base.palavras),
      homework: meu && meu.homework !== undefined ? meu.homework : (base.homework || ""),
      estado: (meu && meu.estado) || "rascunho",
      publicadoEm: (meu && meu.publicadoEm) || ""
    };
  }
  // Todas as sessões da turma, para a tira de cima.
  // O syllabus de verdade entra na primeira vez que alguém abre o
  // plano de uma turma. Ali as turmas já existem, que é o que a
  // semeadura precisa para saber nível e ciclo — e é idempotente, então
  // chamar a cada abertura não custa nem repete.
  var semeou = false;
  function garantirSyllabus() {
    if (semeou) return;
    semeou = true;
    try { semearSyllabus(); } catch (e) {}
  }
  function planoSessoes(turmaId) {
    garantirSyllabus();
    var t = (turmasLista().filter(function (x) { return x.id === turmaId; })[0]) || null;
    if (!t) return [];
    var nums = {};
    syllabusDoNivel(t.nivel, t.cycle).forEach(function (s) { nums[s.n] = true; });
    var m = planosAll();
    Object.keys(m).forEach(function (k) {
      var p = k.split("|");
      if (p[0] === turmaId) nums[parseInt(p[1], 10)] = true;
    });
    return Object.keys(nums).map(function (k) { return parseInt(k, 10); })
      .filter(function (n) { return isFinite(n); })
      .sort(function (a, b) { return a - b; })
      .map(function (n) { return planoDaTurma(turmaId, n); })
      .filter(Boolean);
  }
  // A data em que esta sessão foi dada: a da chamada que disse qual
  // sessão foi. Sessão que ainda não aconteceu não tem data — e
  // projetar uma a partir do horário da turma seria chutar por cima de
  // feriado e remarcação. Quando não há, a faixa não mostra data.
  function dataDaSessao(turmaLabel, n) {
    var alvo = parseInt(n, 10) || 0;
    if (!alvo || !turmaLabel) return "";
    var m = chamadasAll();
    var datas = [];
    Object.keys(m).forEach(function (k) {
      var ch = m[k];
      if (!ch || ch.turma !== turmaLabel) return;
      if ((parseInt(ch.sessao, 10) || 0) !== alvo) return;
      if (ch.data) datas.push(ch.data);
    });
    datas.sort();
    return datas[0] || "";
  }

  // A semana de cada sessão da turma.
  //
  // Sessão já dada tem data de verdade, a da chamada. Para as que
  // ainda não aconteceram, a tela do desenho mostra "sem. 19 out" — a
  // SEMANA, não o dia. É por isso que projetar aqui é honesto: as
  // próximas datas de aula desta turma saem do mesmo caminho que a
  // agenda usa, pulando feriado e semana sem aula; e o rótulo diz
  // "semana de", que é o que a conta garante.
  function datasDasSessoes(turmaId) {
    var t = turmasLista().filter(function (x) { return x.id === turmaId; })[0];
    if (!t) return {};
    var label = t.nivel + " · " + t.turma;
    var out = {};
    var dadas = {};
    var m = chamadasAll();
    Object.keys(m).forEach(function (k) {
      var ch = m[k];
      if (!ch || ch.turma !== label) return;
      var n = parseInt(ch.sessao, 10) || 0;
      if (n && (!dadas[n] || ch.data < dadas[n])) dadas[n] = ch.data;
    });
    Object.keys(dadas).forEach(function (n) {
      out[n] = { data: dadas[n], dada: true };
    });
    // as que faltam, na ordem, nos próximos dias de aula da turma
    var mm = (t.turma || "").toUpperCase().match(/\b(MON|TUE|WED|THU|FRI|SAT|SUN|SEG|TER|QUA|QUI|SEX)\b/);
    if (!mm) return out;
    var alvo = DIAS_SEMANA[mm[1]];
    var pendentes = (syllabusDoNivel(t.nivel, t.cycle) || [])
      .map(function (x) { return x.n; })
      .filter(function (n) { return !dadas[n]; })
      .sort(function (a2, b2) { return a2 - b2; });
    var d = new Date(today());
    var i = 0;
    var passos = 0;
    while (pendentes.length && passos < 400) {
      passos++;
      if (d.getDay() === alvo && !ehFeriado(iso(d)) && temAulaEm(iso(d), tipoDaTurma(t))) {
        out[pendentes.shift()] = { data: iso(d), dada: false };
      }
      d.setDate(d.getDate() + 1);
      i++;
    }
    return out;
  }

  // Grava o plano da turma. Na primeira gravação copia a sessão do
  // syllabus inteira: a partir daí o plano é dela.
  function salvarPlano(turmaId, n, patch) {
    var atual = planoDaTurma(turmaId, n);
    if (!atual) return { ok: false, erro: "Sessão não encontrada." };
    var m = planosAll();
    var k = planoChave(turmaId, n);
    var base = m[k] || { turma: turmaId, n: n, etapas: atual.etapas,
      palavras: atual.palavras, homework: atual.homework,
      slides: atual.slides, estado: atual.estado };
    patch = patch || {};
    if (patch.etapas !== undefined) base.etapas = limpaEtapas(patch.etapas);
    if (patch.palavras !== undefined) base.palavras = limpaPalavras(patch.palavras);
    if (patch.homework !== undefined) {
      base.homework = String(patch.homework || "").trim().slice(0, PLANO_LIMITES.homework);
    }
    if (patch.slides !== undefined) {
      var sl = String(patch.slides || "").trim().slice(0, 300);
      // Link que não começa com https:// não abre: o navegador o trata
      // como caminho dentro do sistema e a professora cai num 404 no
      // meio da aula. Melhor recusar na hora de salvar.
      if (sl && sl.indexOf("https://") !== 0) {
        return { ok: false, erro: "O link dos slides precisa começar com https://" };
      }
      base.slides = sl;
    }
    if (patch.estado !== undefined) base.estado = patch.estado;
    if (patch.publicadoEm !== undefined) base.publicadoEm = patch.publicadoEm;
    base._v = Date.now();
    m[k] = base;
    planosSave(m);
    return { ok: true, plano: planoDaTurma(turmaId, n) };
  }
  function etapasDoPlano(turmaId, n) {
    var p = planoDaTurma(turmaId, n);
    return p ? p.etapas.slice() : null;
  }
  function addEtapaPlano(turmaId, n, dados) {
    var l = etapasDoPlano(turmaId, n);
    if (!l) return { ok: false, erro: "Sessão não encontrada." };
    dados = dados || {};
    if (!String(dados.titulo || "").trim()) return { ok: false, erro: "Escreva o que é a atividade." };
    if (l.length >= PLANO_LIMITES.etapas) {
      return { ok: false, erro: "O roteiro já tem " + PLANO_LIMITES.etapas + " etapas." };
    }
    l.push({ id: "et" + Date.now(), fase: dados.fase || FASES[0].id,
      titulo: dados.titulo, min: dados.min, pergunta: dados.pergunta || "",
      on: true, minha: true });
    return salvarPlano(turmaId, n, { etapas: l });
  }
  function removerEtapaPlano(turmaId, n, etapaId) {
    var l = etapasDoPlano(turmaId, n);
    if (!l) return { ok: false };
    var alvo = l.filter(function (e) { return e.id === etapaId; })[0];
    // etapa do syllabus não se apaga: desmarca-se. Apagar daria à
    // professora o poder de sumir com o que a escola planejou, e o
    // desmarcar já resolve o caso dela ("não cabe nesta turma").
    if (!alvo || !alvo.minha) return { ok: false, erro: "Etapa do syllabus se desmarca, não se apaga." };
    return salvarPlano(turmaId, n, { etapas: l.filter(function (e) { return e.id !== etapaId; }) });
  }
  function alternarEtapaPlano(turmaId, n, etapaId) {
    var l = etapasDoPlano(turmaId, n);
    if (!l) return { ok: false };
    l.forEach(function (e) { if (e.id === etapaId) e.on = !e.on; });
    return salvarPlano(turmaId, n, { etapas: l });
  }
  function moverEtapaPlano(turmaId, n, etapaId, dir) {
    var l = etapasDoPlano(turmaId, n);
    if (!l) return { ok: false };
    var i = -1;
    l.forEach(function (e, k) { if (e.id === etapaId) i = k; });
    var j = i + (dir < 0 ? -1 : 1);
    if (i < 0 || j < 0 || j >= l.length) return { ok: false };
    var tmp = l[i]; l[i] = l[j]; l[j] = tmp;
    return salvarPlano(turmaId, n, { etapas: l });
  }
  function marcarPlanoPronto(turmaId, n, pronto) {
    var p = planoDaTurma(turmaId, n);
    if (!p) return { ok: false };
    if (p.estado === "publicada" && !pronto) return { ok: false, erro: "A aula já está publicada." };
    return salvarPlano(turmaId, n, { estado: pronto ? "pronta" : "rascunho" });
  }
  function publicarPlano(turmaId, n) {
    var p = planoDaTurma(turmaId, n);
    if (!p) return { ok: false, erro: "Sessão não encontrada." };
    var vivas = p.etapas.filter(function (e) { return e.on; });
    if (!vivas.length) return { ok: false, erro: "O roteiro está vazio: nenhuma etapa marcada." };
    return salvarPlano(turmaId, n, { estado: "publicada", publicadoEm: new Date().toISOString() });
  }
  // O plano PUBLICADO de uma aula, pelo nome da turma e pelo número da
  // sessão que a chamada guardou. É por aqui que o caderno da aluna
  // chega ao que a professora planejou — e só se estiver publicado:
  // rascunho é trabalho em andamento e não é para ser lido.
  function planoPublicadoDaAula(turmaLabel, sessao) {
    var n = parseInt(sessao, 10) || 0;
    if (!n || !turmaLabel) return null;
    var t = turmasLista().filter(function (x) {
      return (x.nivel + " · " + x.turma) === turmaLabel;
    })[0];
    if (!t) return null;
    var p = planoDaTurma(t.id, n);
    if (!p || p.estado !== "publicada") return null;
    return {
      n: p.n, titulo: p.titulo, objetivo: p.objetivo, homework: p.homework,
      palavras: p.palavras, slides: p.slides || "",
      // só o que ficou marcado: etapa desmarcada não aconteceu na aula
      atividades: p.etapas.filter(function (e) { return e.on; }).map(function (e) {
        return { fase: faseLabel(e.fase), titulo: e.titulo, min: e.min,
          pergunta: e.pergunta };
      })
    };
  }
  // Quanto tempo o roteiro ocupa — só o que está marcado.
  function minutosDoPlano(plano) {
    return (plano && plano.etapas || []).filter(function (e) { return e.on; })
      .reduce(function (s, e) { return s + (e.min || 0); }, 0);
  }

  // ── O CADERNO DA ALUNA ────────────────────────────────────────
  //
  // O caderno do desenho é o plano da aula com as atividades e as
  // respostas. O plano não existe ainda, e inventá-lo aqui seria
  // construir o mais difícil pela metade.
  //
  // Mas metade do caderno não depende do plano: é o REGISTRO das aulas
  // dela. O tópico de cada aula já está na chamada — é ele que valida a
  // aula para a folha —, a tarefa de casa está na turma, a entrega está
  // na chamada e a gravação tem consulta própria. Falta só o que ela
  // escreve.
  //
  // Então é isto: uma linha por aula dela, com o que foi dado, se ela
  // estava, se entregou a tarefa, a gravação, e a nota dela. Quando o
  // plano chegar, cada linha ganha as atividades — a estrutura cabe.
  var CADERNO_KEY = "isr_caderno_v1";
  var NOTA_LIMITE = 2000;
  function cadernoAll() {
    try { return JSON.parse(localStorage.getItem(CADERNO_KEY)) || {}; } catch (e) { return {}; }
  }
  function cadernoChave(pessoaId, turmaLabel, dataIso) {
    return pessoaId + "|" + turmaLabel + "|" + dataIso;
  }
  function notaDaAula(pessoaId, turmaLabel, dataIso) {
    var r = cadernoAll()[cadernoChave(pessoaId, turmaLabel, dataIso)];
    return r ? (r.texto || "") : "";
  }
  function salvarNotaDaAula(pessoaId, turmaLabel, dataIso, texto) {
    if (!pessoaId || !turmaLabel || !dataIso) return { ok: false, erro: "Aula não identificada." };
    var m = cadernoAll();
    var k = cadernoChave(pessoaId, turmaLabel, dataIso);
    var t = String(texto || "").trim().slice(0, NOTA_LIMITE);
    if (t) m[k] = { texto: t, em: new Date().toISOString(), _v: Date.now() };
    else delete m[k];
    try { localStorage.setItem(CADERNO_KEY, JSON.stringify(m)); } catch (e) {}
    agendarSync();
    return { ok: true, texto: t };
  }
  // ══════════════════════════════════════════════════════════════
  //  A AULA AO VIVO
  //  ------------------------------------------------------------
  //  A professora abre a aula, e aí o caderno das alunas aceita
  //  resposta. Enquanto a aula corre, o que elas escrevem aparece no
  //  painel dela; quando a aula termina, as atividades fecham e o
  //  homework abre.
  //
  //  Por que o estado é gravado e não fica só na tela: a aula é a
  //  mesma para a professora e para cinco alunas, em cinco aparelhos.
  //  "Começou" tem de ser um fato do banco, senão cada tela acredita
  //  numa coisa — e a aluna que recarrega a página perde o acesso ao
  //  caderno no meio da aula.
  // ══════════════════════════════════════════════════════════════
  var AULA_VIVA_KEY = "isr_aula_viva_v1";
  function aulasVivasAll() {
    try { return JSON.parse(localStorage.getItem(AULA_VIVA_KEY)) || {}; } catch (e) { return {}; }
  }
  function aulasVivasSave(m) {
    try { localStorage.setItem(AULA_VIVA_KEY, JSON.stringify(m)); } catch (e) {}
    agendarSync();
  }
  function aulaVivaChave(turmaLabel, dataIso) { return turmaLabel + "|" + dataIso; }
  // "nao_comecou" · "ao_vivo" · "encerrada"
  function aulaViva(turmaLabel, dataIso) {
    var r = aulasVivasAll()[aulaVivaChave(turmaLabel, dataIso)] || null;
    if (!r || !r.inicio) return { estado: "nao_comecou", inicio: "", fim: "", minutos: 0 };
    if (r.fim) return { estado: "encerrada", inicio: r.inicio, fim: r.fim, minutos: 0, por: r.por || "" };
    var min = Math.max(0, Math.round((Date.now() - new Date(r.inicio).getTime()) / 60000));
    return { estado: "ao_vivo", inicio: r.inicio, fim: "", minutos: min, por: r.por || "" };
  }
  function iniciarAula(turmaLabel, dataIso, por) {
    if (!turmaLabel || !dataIso) return { ok: false, erro: "Aula não identificada." };
    var m = aulasVivasAll();
    var k = aulaVivaChave(turmaLabel, dataIso);
    m[k] = { turma: turmaLabel, data: dataIso, inicio: new Date().toISOString(),
      fim: "", por: por || "", _v: Date.now() };
    aulasVivasSave(m);
    return { ok: true, aula: aulaViva(turmaLabel, dataIso) };
  }
  function encerrarAula(turmaLabel, dataIso, por) {
    var m = aulasVivasAll();
    var k = aulaVivaChave(turmaLabel, dataIso);
    if (!m[k] || !m[k].inicio) return { ok: false, erro: "Esta aula não foi aberta." };
    m[k].fim = new Date().toISOString();
    m[k].fechouPor = por || "";
    m[k]._v = Date.now();
    aulasVivasSave(m);
    return { ok: true, aula: aulaViva(turmaLabel, dataIso) };
  }
  // Reabrir: a professora encerrou sem querer, ou a aula continuou.
  function reabrirAula(turmaLabel, dataIso, por) {
    var m = aulasVivasAll();
    var k = aulaVivaChave(turmaLabel, dataIso);
    if (!m[k] || !m[k].inicio) return iniciarAula(turmaLabel, dataIso, por);
    m[k].fim = "";
    m[k]._v = Date.now();
    aulasVivasSave(m);
    return { ok: true, aula: aulaViva(turmaLabel, dataIso) };
  }

  // As tarefas que a aluna responde nesta aula: as etapas marcadas do
  // plano publicado que trazem pergunta.
  //
  // Painel e caderno precisam da MESMA lista, na mesma ordem — a
  // resposta é guardada pela posição. Se cada tela filtrasse por conta
  // própria, a resposta da tarefa 2 apareceria na 3 no dia em que
  // alguém mudasse um filtro.
  function tarefasDaAula(turmaLabel, dataIso) {
    var ch = getChamada(turmaLabel, dataIso);
    var sessao = ch && ch.sessao ? ch.sessao : 0;
    var plano = sessao ? planoPublicadoDaAula(turmaLabel, sessao) : null;
    if (!plano) return [];
    return (plano.atividades || []).filter(function (a) {
      return a && String(a.pergunta || "").trim();
    });
  }

  // ── A NOTA DA EQUIPE SOBRE A ALUNA ────────────────────────────
  //
  // O que a professora entende da aluna e precisa lembrar na próxima
  // aula: o que funciona, o que trava, o que tentar. Fica na ficha e
  // só a equipe vê — não aparece em lugar nenhum do app da aluna.
  //
  // É diferente da nota da AULA, que a aluna escreve no caderno dela,
  // e do histórico, que é a linha do tempo de fatos.
  function salvarNotaDaEquipe(pessoaId, texto) {
    if (!getPessoa(pessoaId)) return { ok: false, erro: "Aluna não encontrada." };
    var t = String(texto || "").trim().slice(0, 2000);
    mutate(pessoaId, function (p) { p.notaEquipe = t; });
    agendarSync();
    return { ok: true, nota: t };
  }
  function notaDaEquipe(pessoaId) {
    var p = getPessoa(pessoaId);
    return (p && p.notaEquipe) || "";
  }

  // A aula que está aberta para esta aluna agora: a turma dela, hoje.
  // Só hoje — o caderno de ontem é registro, não aula em curso.
  function aulaVivaDaAluna(pessoaId) {
    var p = getPessoa(pessoaId);
    if (!p || !p.turma) return null;
    var hoje = addDays(0);
    var v = aulaViva(p.turma, hoje);
    if (v.estado === "nao_comecou") return null;
    return { turma: p.turma, data: hoje, estado: v.estado, minutos: v.minutos };
  }

  // ── AS RESPOSTAS DO CADERNO, POR TAREFA ───────────────────────
  //
  // O caderno guardava um texto livre por aula. As tarefas do plano
  // publicado são perguntas numeradas, e é por elas que a aluna
  // responde e a professora comenta — uma resposta por tarefa, com a
  // hora da última letra, que é o que diz quem está escrevendo agora.
  var RESPOSTA_LIMITE = 4000;
  function registroDoCaderno(pessoaId, turmaLabel, dataIso) {
    return cadernoAll()[cadernoChave(pessoaId, turmaLabel, dataIso)] || null;
  }
  function respostasDaAluna(pessoaId, turmaLabel, dataIso) {
    var r = registroDoCaderno(pessoaId, turmaLabel, dataIso);
    return { respostas: (r && r.respostas) || {}, comentarios: (r && r.comentarios) || {} };
  }
  function salvarResposta(pessoaId, turmaLabel, dataIso, i, texto) {
    if (!pessoaId || !turmaLabel || !dataIso) return { ok: false, erro: "Aula não identificada." };
    var viva = aulaViva(turmaLabel, dataIso);
    if (viva.estado !== "ao_vivo") {
      return { ok: false, fechado: true,
        erro: viva.estado === "encerrada"
          ? "Esta aula foi encerrada. O caderno dela está fechado."
          : "A professora ainda não abriu o caderno desta aula." };
    }
    var m = cadernoAll();
    var k = cadernoChave(pessoaId, turmaLabel, dataIso);
    var reg = m[k] || {};
    reg.respostas = reg.respostas || {};
    var t = String(texto || "").slice(0, RESPOSTA_LIMITE);
    reg.respostas[String(i)] = { t: t, em: new Date().toISOString() };
    reg.em = new Date().toISOString();
    reg._v = Date.now();
    m[k] = reg;
    try { localStorage.setItem(CADERNO_KEY, JSON.stringify(m)); } catch (e) {}
    agendarSync();
    return { ok: true };
  }
  // O comentário da professora numa resposta. Aparece no caderno da
  // aluna, preso à tarefa — não é recado solto.
  function comentarResposta(pessoaId, turmaLabel, dataIso, i, texto, por) {
    var t = String(texto || "").trim().slice(0, 600);
    if (!t) return { ok: false, erro: "Escreva o comentário." };
    var m = cadernoAll();
    var k = cadernoChave(pessoaId, turmaLabel, dataIso);
    var reg = m[k] || {};
    reg.comentarios = reg.comentarios || {};
    var lista = reg.comentarios[String(i)] || [];
    lista.push({ por: por || "", texto: t, em: new Date().toISOString() });
    reg.comentarios[String(i)] = lista.slice(-10);
    reg._v = Date.now();
    m[k] = reg;
    try { localStorage.setItem(CADERNO_KEY, JSON.stringify(m)); } catch (e) {}
    agendarSync();
    return { ok: true, comentarios: lista };
  }
  // O que a professora vê enquanto a aula corre: uma linha por aluna,
  // com o que ela escreveu em cada tarefa e há quanto tempo.
  //   escrevendo — mexeu nos últimos 90 segundos
  //   terminou   — respondeu todas as tarefas
  //   aguardando — está na aula e ainda não escreveu
  function respostasDaAula(turmaLabel, dataIso, nTarefas) {
    var alunas = alunasDaTurma(turmaLabel, dataIso) || [];
    var total = parseInt(nTarefas, 10) || 0;
    var agora = Date.now();
    return alunas.map(function (p) {
      var r = respostasDaAluna(p.id, turmaLabel, dataIso);
      var respostas = [];
      var feitas = 0, ultima = 0;
      for (var i = 0; i < Math.max(total, Object.keys(r.respostas).length); i++) {
        var x = r.respostas[String(i)] || null;
        var txt = x ? String(x.t || "") : "";
        if (txt.trim()) feitas++;
        if (x && x.em) ultima = Math.max(ultima, new Date(x.em).getTime());
        respostas.push({ i: i, texto: txt, em: (x && x.em) || "",
          comentarios: (r.comentarios[String(i)] || []) });
      }
      var escrevendo = ultima && (agora - ultima) < 90000;
      return { id: p.id, nome: p.nome, respostas: respostas,
        feitas: feitas, total: total,
        ultimaEm: ultima ? new Date(ultima).toISOString() : "",
        estado: escrevendo ? "escrevendo" : (total && feitas >= total ? "terminou"
          : (feitas ? "aguardando" : "nao_comecou")) };
    });
  }

  // As aulas dela: as chamadas da turma dela em que ela aparece. É a
  // chamada que diz que a aula aconteceu e que ela estava lá.
  function cadernoDaAluna(pessoaId, nDias) {
    var p = getPessoa(pessoaId);
    if (!p) return [];
    var desde = addDays(-(nDias || 180));
    var m = chamadasAll();
    var grav = gravacoesLista().filter(function (g) { return !!g.link; });
    var out = [];
    Object.keys(m).forEach(function (k) {
      var ch = m[k];
      if (!ch || !ch.data || ch.data < desde) return;
      if (!ch.presencas || !(pessoaId in ch.presencas)) return;
      var g = grav.filter(function (x) {
        return x.tipo === "turma" && x.turma === ch.turma && x.data === ch.data;
      })[0];
      var est = estadoPresenca(ch.presencas[pessoaId]);
      // o plano daquela sessão, se a professora disse qual foi e já
      // publicou. Sem isso a linha é só o registro; com isso ela traz
      // as atividades que a aula teve.
      var plano = planoPublicadoDaAula(ch.turma, ch.sessao);
      out.push({
        turma: ch.turma, data: ch.data,
        topico: ch.topico || "",
        sessao: parseInt(ch.sessao, 10) || 0,
        tituloSessao: plano ? plano.titulo : "",
        objetivo: plano ? plano.objetivo : "",
        atividades: plano ? plano.atividades : [],
        palavrasDaAula: plano ? plano.palavras : [],
        presenca: est,
        // a tarefa só entra quando a professora cobrou: sem marca na
        // chamada, dizer "não entregou" seria acusar sem pergunta
        tarefaCobrada: !!(ch.tarefas && (pessoaId in ch.tarefas)),
        tarefaEntregue: !!(ch.tarefas && ch.tarefas[pessoaId] === true),
        gravacao: g ? g.link : "",
        nota: notaDaAula(pessoaId, ch.turma, ch.data)
      });
    });
    return out.sort(function (a, b) { return a.data < b.data ? 1 : -1; });
  }

  // ══════════════════════════════════════════════════════════════
  //  O QUE O DESENHO PEDE E O SISTEMA NÃO TINHA
  //  ------------------------------------------------------------
  //  Cinco cadastros que as telas do handoff precisam e que não
  //  existiam: substituição, reunião pedagógica, entrega do projeto
  //  por aluna, a sequência da aluna particular e três campos do
  //  clube.
  //
  //  Eles entram aqui, na camada de dados, antes das telas — porque
  //  tela que inventa o próprio dado é tela que mente quando alguém
  //  abre em outro aparelho.
  // ══════════════════════════════════════════════════════════════

  // ── SUBSTITUIÇÃO ──────────────────────────────────────────────
  //
  // A professora pede, a coordenação atribui quem cobre. O pedido é
  // de uma AULA — turma e data —, não da pessoa: é a aula que precisa
  // de alguém na frente dela.
  //
  // Por que a hora entra no registro: a regra das 24 horas é sobre o
  // começo da aula, e sem a hora um pedido feito às 23h para a aula
  // das 7h da manhã seguinte pareceria ter oito horas de antecedência
  // quando tem oito.
  var SUBS_KEY = "isr_substituicoes_v1";
  var SUBS_MOTIVOS = [
    { id: "doenca", label: "Doença" },
    { id: "imprevisto", label: "Imprevisto pessoal" },
    { id: "viagem", label: "Viagem" },
    { id: "compromisso", label: "Compromisso marcado" },
    { id: "outro", label: "Outro" }
  ];
  function subsRaw() {
    try { return JSON.parse(localStorage.getItem(SUBS_KEY)) || []; } catch (e) { return []; }
  }
  function subsSalvar(l) {
    try { localStorage.setItem(SUBS_KEY, JSON.stringify(l || [])); } catch (e) {}
    agendarSync();
  }
  function substituicoesLista() {
    return subsRaw().filter(function (s) { return s && s.id && !s.apagado; });
  }
  // Quantas horas faltam para a aula. Sem hora na aula, conta o começo
  // do dia — é o palpite que erra para o lado seguro.
  function horasAteAula(dataIso, hora) {
    var h = String(hora || "").match(/^(\d{1,2})[:h]?(\d{2})?/);
    var d = new Date((dataIso || "") + "T"
      + (h ? ("0" + h[1]).slice(-2) + ":" + (h[2] || "00") : "00:00") + ":00");
    if (isNaN(d.getTime())) return 999;
    return (d.getTime() - Date.now()) / 3600000;
  }
  function pedirSubstituicao(dados) {
    dados = dados || {};
    var turma = String(dados.turma || "").trim();
    var data = String(dados.data || "").trim();
    if (!turma || !data) return { ok: false, erro: "Diga qual aula precisa de substituta." };
    if (!String(dados.motivo || "").trim()) return { ok: false, erro: "Escolha o motivo." };
    var l = subsRaw();
    // Pedir duas vezes a mesma aula não cria dois pedidos: a
    // coordenação veria a mesma aula duas vezes na lista e poderia
    // atribuir duas pessoas para a mesma hora.
    var jaTem = l.filter(function (s) {
      return !s.apagado && s.turma === turma && s.data === data
        && s.status !== "cancelada" && s.status !== "recusada";
    })[0];
    if (jaTem) return { ok: false, erro: "Esta aula já tem um pedido de substituição.", id: jaTem.id };
    var horas = horasAteAula(data, dados.hora);
    var reg = {
      id: "sb" + Date.now() + "-" + Math.random().toString(36).slice(2, 7),
      turma: turma, data: data, hora: String(dados.hora || "").trim(),
      pedidoPor: String(dados.por || "").trim(),
      motivo: String(dados.motivo || "").trim(),
      observacao: String(dados.observacao || "").trim().slice(0, 600),
      cobre: "", status: "pedida",
      // guardado no pedido, e não recalculado depois: o que importa é
      // se era em cima da hora QUANDO foi pedido
      urgente: horas < 24,
      pedidoEm: new Date().toISOString(), _v: Date.now()
    };
    l.push(reg);
    subsSalvar(l);
    return { ok: true, id: reg.id, urgente: reg.urgente };
  }
  function atribuirSubstituta(id, quemCobre, por) {
    var nome = String(quemCobre || "").trim();
    if (!nome) return { ok: false, erro: "Diga quem cobre a aula." };
    if (equipeDocente().indexOf(nome) < 0) {
      return { ok: false, erro: nome + " não está na equipe como quem dá aula." };
    }
    var l = subsRaw();
    var s = l.filter(function (x) { return x.id === id; })[0];
    if (!s) return { ok: false, erro: "Pedido não encontrado." };
    if (nome === s.pedidoPor) {
      return { ok: false, erro: "Quem pediu a substituição não pode cobrir a própria aula." };
    }
    s.cobre = nome; s.status = "atribuida";
    s.atribuidoPor = String(por || ""); s.atribuidoEm = new Date().toISOString();
    s._v = Date.now();
    subsSalvar(l);
    return { ok: true, substituicao: s };
  }
  function cancelarSubstituicao(id, por) {
    var l = subsRaw();
    var s = l.filter(function (x) { return x.id === id; })[0];
    if (!s) return { ok: false, erro: "Pedido não encontrado." };
    s.status = "cancelada"; s.canceladoPor = String(por || "");
    s.canceladoEm = new Date().toISOString(); s._v = Date.now();
    subsSalvar(l);
    return { ok: true };
  }
  function substituicoesDaProfessora(nome) {
    var n = String(nome || "");
    return substituicoesLista().filter(function (s) {
      return s.pedidoPor === n || s.cobre === n;
    }).sort(function (a, b) { return a.data < b.data ? 1 : -1; });
  }
  function substituicoesDaTurma(turmaLabel) {
    return substituicoesLista().filter(function (s) { return s.turma === turmaLabel; })
      .sort(function (a, b) { return a.data < b.data ? 1 : -1; });
  }
  function substituicoesAbertas() {
    return substituicoesLista().filter(function (s) { return s.status === "pedida"; })
      .sort(function (a, b) { return a.data < b.data ? -1 : 1; });
  }
  // Quem de fato deu esta aula. É o que a folha precisa saber: a aula
  // da substituta conta na folha DELA, não na de quem faltou.
  function substitutaDaAula(turmaLabel, dataIso) {
    var s = substituicoesLista().filter(function (x) {
      return x.turma === turmaLabel && x.data === dataIso && x.status === "atribuida";
    })[0];
    return s ? s.cobre : "";
  }

  // ── REUNIÃO PEDAGÓGICA ────────────────────────────────────────
  //
  // Não é a "reunião" do funil, que é conversa de matrícula com uma
  // lead. Esta é o encontro pedagógico da equipe, e é dele que sai o
  // "2 de 4 reuniões" do mês no painel da professora.
  var REUNIOES_KEY = "isr_reunioes_ped_v1";
  function reunioesRaw() {
    try { return JSON.parse(localStorage.getItem(REUNIOES_KEY)) || []; } catch (e) { return []; }
  }
  function reunioesSalvar(l) {
    try { localStorage.setItem(REUNIOES_KEY, JSON.stringify(l || [])); } catch (e) {}
    agendarSync();
  }
  function reunioesPedagogicas() {
    return reunioesRaw().filter(function (r) { return r && r.id && !r.apagado; })
      .sort(function (a, b) { return a.data < b.data ? 1 : -1; });
  }
  function salvarReuniaoPedagogica(dados) {
    dados = dados || {};
    if (!String(dados.data || "").trim()) return { ok: false, erro: "A reunião precisa de data." };
    var l = reunioesRaw();
    var r = dados.id ? l.filter(function (x) { return x.id === dados.id; })[0] : null;
    if (!r) {
      r = { id: "rp" + Date.now() + "-" + Math.random().toString(36).slice(2, 7) };
      l.push(r);
    }
    r.data = String(dados.data).trim();
    r.hora = String(dados.hora || "").trim();
    r.tema = String(dados.tema || "").trim().slice(0, 200);
    r.participantes = (dados.participantes || []).slice();
    r.presentes = (dados.presentes || r.presentes || []).slice();
    r._v = Date.now();
    reunioesSalvar(l);
    return { ok: true, id: r.id };
  }
  function removerReuniaoPedagogica(id) {
    var l = reunioesRaw();
    var r = l.filter(function (x) { return x.id === id; })[0];
    if (!r) return { ok: false, erro: "Reunião não encontrada." };
    r.apagado = true; r._v = Date.now();
    reunioesSalvar(l);
    return { ok: true };
  }
  // "2 de 4": as reuniões do mês em que esta professora estava
  // convocada, e em quantas ela esteve.
  function reunioesDoMes(nome, mes) {
    var m = String(mes || "").slice(0, 7);
    var n = String(nome || "");
    var doMes = reunioesPedagogicas().filter(function (r) {
      return String(r.data || "").slice(0, 7) === m
        && (!(r.participantes || []).length || (r.participantes || []).indexOf(n) >= 0);
    });
    var feitas = doMes.filter(function (r) { return (r.presentes || []).indexOf(n) >= 0; });
    return { total: doMes.length, feitas: feitas.length, lista: doMes };
  }

  // ── A ENTREGA DO PROJETO, POR ALUNA ───────────────────────────
  //
  // O projeto do ciclo já existia na turma, como nome. O que faltava
  // era quem entregou — e é disso que a barra "7 de 10" e o "Faltam:"
  // do desenho são feitos.
  var PROJ_KEY = "isr_projeto_entregas_v1";
  function projEntregasAll() {
    try { return JSON.parse(localStorage.getItem(PROJ_KEY)) || {}; } catch (e) { return {}; }
  }
  function projChave(turmaLabel, pessoaId) { return turmaLabel + "|" + pessoaId; }
  function marcarEntregaProjeto(turmaLabel, pessoaId, entregue, por) {
    if (!turmaLabel || !pessoaId) return { ok: false, erro: "Aluna ou turma não identificada." };
    var m = projEntregasAll();
    var k = projChave(turmaLabel, pessoaId);
    if (entregue) {
      m[k] = { turma: turmaLabel, pessoaId: pessoaId, entregue: true,
        em: iso(today()), por: String(por || ""), _v: Date.now() };
    } else {
      // desmarcar não apaga a linha: o registro guarda que foi
      // desmarcado, e por quem, senão a correção some sem rastro
      m[k] = { turma: turmaLabel, pessoaId: pessoaId, entregue: false,
        em: iso(today()), por: String(por || ""), _v: Date.now() };
    }
    try { localStorage.setItem(PROJ_KEY, JSON.stringify(m)); } catch (e) {}
    agendarSync();
    return { ok: true };
  }
  function entregasDoProjeto(turmaLabel) {
    var t = turmasLista().filter(function (x) {
      return (x.nivel + " · " + x.turma) === turmaLabel;
    })[0];
    var alunas = alunasDaTurma(turmaLabel) || [];
    var m = projEntregasAll();
    var linhas = alunas.map(function (p) {
      var r = m[projChave(turmaLabel, p.id)] || null;
      return { id: p.id, nome: p.nome, entregue: !!(r && r.entregue),
        em: (r && r.entregue) ? r.em : "" };
    });
    var feitas = linhas.filter(function (x) { return x.entregue; }).length;
    return {
      projeto: (t && t.projeto) || "",
      temProjeto: !!(t && t.projeto),
      feitas: feitas, total: linhas.length,
      pct: linhas.length ? Math.round((feitas / linhas.length) * 100) : 0,
      faltam: linhas.filter(function (x) { return !x.entregue; }).map(function (x) { return x.nome; }),
      linhas: linhas
    };
  }

  // ── A SEQUÊNCIA DA ALUNA PARTICULAR ───────────────────────────
  //
  // A particular usa o syllabus do nível dela, mas não na marcha da
  // turma: a professora pula o que a aluna já sabe e troca a ordem
  // conforme o que ela precisa agora. A sequência é DELA.
  //
  // Guardamos só o que foge do syllabus — a ordem trocada e as
  // sessões puladas. Assim, sessão nova no syllabus entra sozinha na
  // sequência de quem ainda não chegou lá.
  var SEQ_KEY = "isr_sequencia_aluna_v1";
  function seqAll() {
    try { return JSON.parse(localStorage.getItem(SEQ_KEY)) || {}; } catch (e) { return {}; }
  }
  function seqSalvar(m) {
    try { localStorage.setItem(SEQ_KEY, JSON.stringify(m)); } catch (e) {}
    agendarSync();
  }
  // O nível da aluna particular, para achar o syllabus dela.
  // O syllabus é por nível E por ciclo. Pegar o nível e esquecer o
  // ciclo devolvia lista vazia para toda aluna cuja turma não está no
  // ciclo escrito nas metas — que é a maioria assim que um ciclo vira.
  function nivelDaAluna(p) {
    if (!p) return { nivel: "", ciclo: "" };
    var t = turmasLista().filter(function (x) {
      return (x.nivel + " · " + x.turma) === p.turma;
    })[0];
    var nivel = p.nivel || (t ? t.nivel : "");
    // A particular pura não tem turma de grupo, e o ciclo das metas é
    // o da escola, não o do nível dela. O syllabus é por nível E por
    // ciclo: sem casar os dois, a sequência vinha vazia e a tela dizia
    // que o nível não tem syllabus quando ele tem.
    var ciclo = (t && t.cycle) || "";
    if (!ciclo && nivel) {
      var doNivel = turmasLista().filter(function (x) { return x.nivel === nivel; })[0];
      if (doNivel) ciclo = doNivel.cycle || "";
    }
    if (!ciclo) ciclo = metasAtuais().cicloLabel || "";
    return { nivel: nivel, ciclo: ciclo };
  }
  // ── O PROGRAMA DA ALUNA PARTICULAR ────────────────────────────
  //
  // A particular segue o MESMO programa das turmas de grupo: o
  // syllabus de um nível, num ciclo. O que muda é a marcha, que é
  // dela.
  //
  // Qual programa ela segue é escolha da professora, e por isso é
  // campo da FICHA dela, não da aula: a sequência inteira — o que já
  // foi dado, o que foi pulado, a ordem trocada — pendura nesse
  // programa. Guardá-lo na aula faria cada aula poder apontar para
  // uma trilha diferente, e a sequência perderia o sentido.
  //
  // Sem escolha, vale o nível da ficha (ou o da turma de grupo, para
  // quem é híbrida): é o que a escola já sabe sobre ela.
  function programasDisponiveis() {
    // sem isto a lista vem vazia para quem nunca abriu o plano de uma
    // turma: o syllabus da escola só entra em cena na primeira leitura
    garantirSyllabus();
    var vistos = {};
    var out = [];
    syllabusAll().forEach(function (sx) {
      if (!sx || sx.apagado || !sx.nivel) return;
      var k = sx.nivel + "|" + (sx.ciclo || "");
      if (vistos[k]) { vistos[k].sessoes++; return; }
      vistos[k] = { nivel: sx.nivel, ciclo: sx.ciclo || "", sessoes: 1 };
      out.push(vistos[k]);
    });
    return out.sort(function (a2, b2) {
      return (a2.nivel + a2.ciclo).localeCompare(b2.nivel + b2.ciclo);
    });
  }
  // Nome distinto de propósito: "programaDaAluna" já existe e é o
  // desafio de semanas do app da aluna. São duas coisas diferentes, e
  // o nome repetido fazia uma apagar a outra.
  function programaDeEstudo(pessoaId) {
    var p = getPessoa(pessoaId);
    if (!p) return { nivel: "", ciclo: "", escolhido: false };
    if (p.programa && p.programa.nivel) {
      return { nivel: p.programa.nivel, ciclo: p.programa.ciclo || "", escolhido: true };
    }
    var nc = nivelDaAluna(p);
    return { nivel: nc.nivel, ciclo: nc.ciclo, escolhido: false };
  }
  // Trocar de programa zera a marcha dela: os números das sessões são
  // de um programa, e "pulei a 3" não quer dizer nada na trilha nova.
  function salvarProgramaDeEstudo(pessoaId, nivel, ciclo) {
    if (!getPessoa(pessoaId)) return { ok: false, erro: "Aluna não encontrada." };
    var n = String(nivel || "").trim();
    if (!n) return { ok: false, erro: "Escolha o programa." };
    var antes = programaDeEstudo(pessoaId);
    mutate(pessoaId, function (p) { p.programa = { nivel: n, ciclo: String(ciclo || "") }; });
    if (antes.nivel !== n || antes.ciclo !== String(ciclo || "")) {
      var m = seqAll();
      if (m[pessoaId]) { m[pessoaId] = { ordem: [], puladas: [], _v: Date.now() }; seqSalvar(m); }
    }
    agendarSync();
    return { ok: true, programa: { nivel: n, ciclo: String(ciclo || "") } };
  }

  function sequenciaDaAluna(pessoaId) {
    var p = getPessoa(pessoaId);
    if (!p) return { nivel: "", sessoes: [], atual: null };
    garantirSyllabus();
    var nc = programaDeEstudo(pessoaId);
    var nivel = nc.nivel;
    var base = syllabusDoNivel(nivel, nc.ciclo) || [];
    var cfg = seqAll()[pessoaId] || { ordem: [], puladas: [] };
    var puladas = {};
    (cfg.puladas || []).forEach(function (n) { puladas[n] = true; });
    // a ordem guardada primeiro, e o que o syllabus tem depois dela
    var vistos = {};
    var ordem = [];
    (cfg.ordem || []).forEach(function (n) {
      if (base.some(function (s) { return s.n === n; }) && !vistos[n]) { vistos[n] = true; ordem.push(n); }
    });
    base.forEach(function (s) { if (!vistos[s.n]) { vistos[s.n] = true; ordem.push(s.n); } });

    // as aulas dela que já aconteceram: é a chamada da particular que
    // diz qual sessão foi dada
    var label = "Particular · " + p.nome;
    var dadas = {};
    var m = chamadasAll();
    Object.keys(m).forEach(function (k) {
      var ch = m[k];
      if (!ch || ch.turma !== label) return;
      var n = parseInt(ch.sessao, 10) || 0;
      if (n) dadas[n] = ch.data;
    });

    var achouAtual = false;
    var sessoes = ordem.map(function (n) {
      var s = base.filter(function (x) { return x.n === n; })[0] || { n: n, titulo: "" };
      var pulada = !!puladas[n];
      var dada = !!dadas[n];
      var atual = false;
      if (!dada && !pulada && !achouAtual) { atual = true; achouAtual = true; }
      return { n: n, titulo: s.titulo || "", objetivo: s.objetivo || "",
        pulada: pulada, dada: dada, data: dadas[n] || "", atual: atual,
        estado: pulada ? "pulada" : dada ? "dada" : atual ? "esta aula" : "a vir" };
    });
    return { nivel: nivel, ciclo: nc.ciclo, programaEscolhido: nc.escolhido,
      sessoes: sessoes,
      atual: sessoes.filter(function (x) { return x.atual; })[0] || null };
  }
  function pularSessaoDaAluna(pessoaId, n, pular) {
    var num = parseInt(n, 10) || 0;
    if (!pessoaId || !num) return { ok: false, erro: "Sessão não identificada." };
    var m = seqAll();
    var cfg = m[pessoaId] || { ordem: [], puladas: [] };
    var l = (cfg.puladas || []).filter(function (x) { return x !== num; });
    if (pular) l.push(num);
    cfg.puladas = l; cfg._v = Date.now();
    m[pessoaId] = cfg; seqSalvar(m);
    return { ok: true };
  }
  function moverSessaoDaAluna(pessoaId, n, direcao) {
    var num = parseInt(n, 10) || 0;
    var seq = sequenciaDaAluna(pessoaId);
    var ordem = seq.sessoes.map(function (s) { return s.n; });
    var i = ordem.indexOf(num);
    var j = i + (direcao === "cima" ? -1 : 1);
    if (i < 0 || j < 0 || j >= ordem.length) return { ok: false, erro: "A sessão já está no fim da fila." };
    ordem[i] = ordem[j]; ordem[j] = num;
    var m = seqAll();
    var cfg = m[pessoaId] || { ordem: [], puladas: [] };
    cfg.ordem = ordem; cfg._v = Date.now();
    m[pessoaId] = cfg; seqSalvar(m);
    return { ok: true };
  }
  // O objetivo da aluna particular: a frase que diz para que ela está
  // aprendendo inglês. Fica na ficha dela, e é a primeira coisa que a
  // professora lê antes da aula.
  function salvarObjetivoDaAluna(pessoaId, texto) {
    if (!getPessoa(pessoaId)) return { ok: false, erro: "Aluna não encontrada." };
    var t = String(texto || "").trim().slice(0, 300);
    mutate(pessoaId, function (p) { p.objetivo = t; });
    agendarSync();
    return { ok: true, objetivo: t };
  }
  function objetivoDaAluna(pessoaId) {
    var p = getPessoa(pessoaId);
    return (p && p.objetivo) || "";
  }

  // ── DUAS FALTAS SEGUIDAS ──────────────────────────────────────
  //
  // Não é cadastro novo: sai das chamadas que já existem. Duas faltas
  // em sequência nas últimas aulas da turma é o sinal que a escola
  // combinou acompanhar, e aparece na aba Alunas e na fila.
  function faltasSeguidas(pessoaId, turmaLabel) {
    var m = chamadasAll();
    var minhas = [];
    Object.keys(m).forEach(function (k) {
      var ch = m[k];
      if (!ch || !ch.data || ch.turma !== turmaLabel) return;
      // aula marcada para depois de hoje não diz nada sobre presença:
      // contá-la quebrava a sequência de faltas com uma aula futura
      if (ch.data > iso(today())) return;
      if (!ch.presencas || !(pessoaId in ch.presencas)) return;
      minhas.push({ data: ch.data, est: estadoPresenca(ch.presencas[pessoaId]) });
    });
    minhas.sort(function (a, b) { return a.data < b.data ? 1 : -1; });
    var n = 0;
    for (var i = 0; i < minhas.length; i++) {
      if (minhas[i].est === "falta") n++;
      else break;
    }
    return { seguidas: n, alerta: n >= 2, desde: n ? minhas[n - 1].data : "" };
  }
  function alunasComFaltasSeguidas(turmaLabel) {
    return (alunasDaTurma(turmaLabel) || []).map(function (p) {
      var f = faltasSeguidas(p.id, turmaLabel);
      return { id: p.id, nome: p.nome, seguidas: f.seguidas, desde: f.desde };
    }).filter(function (x) { return x.seguidas >= 2; });
  }

  // ── O COFRE DE PALAVRAS ───────────────────────────────────────
  //
  // No desenho as palavras vêm do caderno da aula. Sem plano não há de
  // onde puxá-las — mas o cofre não precisa disso para servir: a aluna
  // guarda a palavra que ouviu na aula, e o cofre a traz de volta.
  //
  // A revisão é espaçada, que é o que faz "Review" ser Review e não uma
  // lista: cada acerto afasta a próxima revisão (1, 3, 7, 14, 30, 60
  // dias) e um erro volta para amanhã. Palavra que a aluna já sabe para
  // de aparecer; a que escapa, volta.
  var PALAVRAS_KEY = "isr_palavras_v1";
  var INTERVALOS = [1, 3, 7, 14, 30, 60];
  function palavrasAll() {
    try { return JSON.parse(localStorage.getItem(PALAVRAS_KEY)) || {}; } catch (e) { return {}; }
  }
  function palavrasSave(m) {
    try { localStorage.setItem(PALAVRAS_KEY, JSON.stringify(m)); } catch (e) {}
    agendarSync();
  }
  function palavrasDaAluna(pessoaId) {
    return (palavrasAll()[pessoaId] || []).slice()
      .sort(function (a, b) { return a.em < b.em ? 1 : -1; });
  }
  function salvarPalavra(pessoaId, dados) {
    var p = getPessoa(pessoaId);
    if (!p) return { ok: false, erro: "Aluna não encontrada." };
    dados = dados || {};
    var palavra = String(dados.palavra || "").trim().slice(0, 80);
    if (!palavra) return { ok: false, erro: "Escreva a palavra." };
    var m = palavrasAll();
    var l = (m[pessoaId] || []).slice();
    var id = dados.id || "";
    var reg = id ? l.filter(function (x) { return x.id === id; })[0] : null;
    // mesma palavra duas vezes é a mesma palavra: edita, não duplica
    if (!reg) {
      var igual = l.filter(function (x) {
        return x.palavra.toLowerCase() === palavra.toLowerCase();
      })[0];
      if (igual) reg = igual;
    }
    var campos = {
      palavra: palavra,
      traducao: String(dados.traducao || "").trim().slice(0, 120),
      exemplo: String(dados.exemplo || "").trim().slice(0, 240),
      daAula: String(dados.daAula || "").trim().slice(0, 120)
    };
    if (reg) {
      Object.keys(campos).forEach(function (k) { reg[k] = campos[k]; });
      reg._v = Date.now();
    } else {
      reg = Object.assign({
        id: "pv" + Date.now() + "-" + l.length,
        em: iso(today()), acertos: 0, erros: 0,
        nivel: 0, proxima: iso(today()), _v: Date.now()
      }, campos);
      l.push(reg);
    }
    m[pessoaId] = l;
    palavrasSave(m);
    return { ok: true, palavra: reg };
  }
  // As palavras que a professora pôs na sessão entram no cofre da
  // aluna, marcadas com a aula de onde vieram. É isto que o desenho
  // quer dizer com "palavras · vão para o Review".
  //
  // Duas cautelas. A primeira: palavra que ela JÁ TEM não é tocada —
  // se ela escreveu a própria tradução, reescrever por cima com a da
  // escola apagaria o trabalho dela. A segunda: isto roda ao abrir o
  // Review, o que é escrever numa leitura; é idempotente de propósito
  // (nada muda da segunda vez em diante) e devolve quantas entraram,
  // para a tela poder dizer o que aconteceu em vez de o cofre crescer
  // sozinho sem explicação.
  function sincronizarPalavrasDaAula(pessoaId, nDias) {
    var p = getPessoa(pessoaId);
    if (!p) return { ok: false, novas: 0 };
    var tenho = {};
    palavrasDaAluna(pessoaId).forEach(function (w) {
      tenho[String(w.palavra || "").toLowerCase()] = true;
    });
    var novas = 0;
    cadernoDaAluna(pessoaId, nDias || 180).forEach(function (c) {
      (c.palavrasDaAula || []).forEach(function (w) {
        var k = String(w || "").trim().toLowerCase();
        if (!k || tenho[k]) return;
        var r = salvarPalavra(pessoaId, { palavra: w,
          daAula: ddmm(c.data) + " · " + (c.tituloSessao || c.turma) });
        if (r && r.ok) { tenho[k] = true; novas++; }
      });
    });
    return { ok: true, novas: novas };
  }
  function removerPalavra(pessoaId, id) {
    var m = palavrasAll();
    m[pessoaId] = (m[pessoaId] || []).filter(function (x) { return x.id !== id; });
    palavrasSave(m);
    return { ok: true };
  }
  // Acertou: sobe um degrau e a próxima revisão se afasta. Errou: volta
  // ao primeiro degrau e aparece amanhã.
  //
  // `nivel` é quantos acertos seguidos a palavra tem, de 0 a seis — não o
  // índice do intervalo. Palavra nova tem nivel 0 e vence hoje; o primeiro
  // acerto a leva a 1, e o primeiro degrau da escada é 1 dia, não 3. Ler
  // nivel como índice adianta a escada inteira em um passo.
  function revisarPalavra(pessoaId, id, acertou) {
    var m = palavrasAll();
    var l = (m[pessoaId] || []).slice();
    var reg = l.filter(function (x) { return x.id === id; })[0];
    if (!reg) return { ok: false };
    if (acertou) {
      reg.acertos = (reg.acertos || 0) + 1;
      reg.nivel = Math.min(INTERVALOS.length, (reg.nivel || 0) + 1);
    } else {
      reg.erros = (reg.erros || 0) + 1;
      reg.nivel = 0;
    }
    reg.proxima = addDays(INTERVALOS[Math.max(0, reg.nivel - 1)]);
    reg.revisadaEm = iso(today());
    reg._v = Date.now();
    m[pessoaId] = l;
    palavrasSave(m);
    return { ok: true, palavra: reg, proxima: reg.proxima };
  }
  function revisaoDeHoje(pessoaId) {
    var hoje = iso(today());
    var todas = palavrasDaAluna(pessoaId);
    var devidas = todas.filter(function (x) { return (x.proxima || hoje) <= hoje; });
    var sabidas = todas.filter(function (x) { return (x.nivel || 0) >= INTERVALOS.length; });
    return { devidas: devidas, total: todas.length, sabidas: sabidas.length,
      degraus: INTERVALOS.length };
  }

  function usoDoApp(nDias) {
    var janela = nDias || 30;
    var corte = addDays(-janela);
    var m = acessosAll();
    var alunas = loadPessoas().filter(function (p) {
      return p.status === "aluna" || p.status === "mvs" || p.status === "programa";
    });
    var abriram = alunas.filter(function (p) {
      var r = m[p.id];
      return r && r.ultimo >= corte;
    });
    var nunca = alunas.filter(function (p) { return !m[p.id]; });
    return { dias: janela, total: alunas.length, abriram: abriram.length,
      nunca: nunca.length, pct: alunas.length ? Math.round((abriram.length / alunas.length) * 100) : 0,
      nomesNunca: nunca.map(function (p) { return p.nome; }).slice(0, 20) };
  }

  // ── HORAS PARA O CERTIFICADO ──────────────────────────────────
  //
  // O certificado diz horas, não aulas. A aluna precisa saber quantas já
  // tem e quantas terá no fim do ciclo — senão o certificado é uma surpresa
  // no fim. Conta aula de turma, aula extra com presença e aula particular.
  var MINUTOS_AULA_KEY = "isr_minutos_aula_v1";
  var MINUTOS_AULA_PADRAO = 60;

  function minutosDaAula() {
    try {
      var n = parseInt(localStorage.getItem(MINUTOS_AULA_KEY), 10);
      if (!isNaN(n) && n > 0) return n;
    } catch (e) {}
    return MINUTOS_AULA_PADRAO;
  }
  function setMinutosDaAula(n) {
    var v = parseInt(n, 10);
    if (isNaN(v) || v < 1) return minutosDaAula();
    try { localStorage.setItem(MINUTOS_AULA_KEY, String(v)); } catch (e) {}
    agendarSync();
    return v;
  }

  function horasDaAluna(pessoaId) {
    var p = getPessoa(pessoaId);
    if (!p) return null;
    var minAula = minutosDaAula();
    var arred = function (min) { return Math.round((min / 60) * 10) / 10; };

    // aulas de turma com presença (atraso conta: ela esteve na aula)
    var min = 0, minCiclo = 0;
    var pc = progressoCiclo(pessoaId) || { desde: "" };
    var cham = chamadasAll();
    Object.keys(cham).forEach(function (k) {
      var ch = cham[k];
      if (!ch.presencas || !(pessoaId in ch.presencas)) return;
      // chamada de particular já vira "aula dada" no pacote — contar aqui
      // somaria a mesma aula duas vezes
      if ((ch.turma || "").indexOf("Particular") === 0) return;
      var est = estadoPresenca(ch.presencas[pessoaId]);
      if (est !== "presente" && est !== "atraso") return;
      min += minAula;
      if (!pc.desde || ch.data >= pc.desde) minCiclo += minAula;
    });

    // aulas extras: a duração é a do evento
    var minExtra = 0;
    (eventosLista ? eventosLista() : []).forEach(function (e) {
      var lista = (e.chamada && e.chamada.presencas) || null;
      if (!lista || !(pessoaId in lista)) return;
      var est = estadoPresenca(lista[pessoaId]);
      if (est !== "presente" && est !== "atraso") return;
      minExtra += parseInt(e.duracao, 10) || 60;
    });

    // aulas particulares dadas
    var minPart = 0;
    if (p.particular) minPart = (parseInt(p.particular.feitas, 10) || 0) * minAula;

    var totalMin = min + minExtra + minPart;
    var faltamCiclo = Math.max(0, (pc.total || 0) - (pc.feitas || 0));
    return {
      minutosAula: minAula,
      horasTurma: arred(min), horasExtras: arred(minExtra), horasParticulares: arred(minPart),
      horasTotais: arred(totalMin),
      horasNoCiclo: arred(minCiclo),
      horasDoCicloCompleto: arred((pc.total || 0) * minAula),
      faltamHoras: arred(faltamCiclo * minAula),
      nivel: p.nivel || "", turma: p.turma || "",
      desde: p.desde || "",
      // o que sai no certificado quando o ciclo fechar
      certificado: {
        horas: arred(totalMin + faltamCiclo * minAula),
        nivel: p.nivel || "", pronto: faltamCiclo === 0
      }
    };
  }

  function progressoCiclo(pessoaId) {
    var p = getPessoa(pessoaId);
    if (!p) return null;
    var total = aulasPorCiclo();
    var c = contratoVigente(p);
    // o ciclo começa no primeiro mês do contrato vigente; sem contrato,
    // vale desde quando ela entrou
    var desde = c && (c.meses || []).length ? c.meses[0].key + "-01" : (p.desde || "");
    var feitas = 0, faltou = 0;
    var cham = chamadasAll();
    Object.keys(cham).forEach(function (k) {
      var ch = cham[k];
      if (!ch.presencas || !(pessoaId in ch.presencas)) return;
      if (desde && ch.data < desde) return;
      var est = estadoPresenca(ch.presencas[pessoaId]);
      if (est === "presente" || est === "atraso") feitas++;
      else faltou++;
    });
    var dadas = feitas + faltou;
    if (dadas > total) total = dadas;
    return { feitas: feitas, faltou: faltou, dadas: dadas, total: total,
      restam: Math.max(0, total - dadas),
      pct: total ? Math.round((dadas / total) * 100) : 0,
      desde: desde };
  }

  // ── O CERTIFICADO, NUM LUGAR SÓ ───────────────────────────────
  //
  // O documento diz nível, carga horária, período e frequência. Esses
  // quatro números saíam de contas espalhadas, e a frequência saía de
  // uma conta que punha a ausência avisada contra a aluna — enquanto o
  // app dizia a ela que ausência avisada não conta. Dizer um número à
  // aluna e imprimir outro no documento é o defeito a não ter.
  //
  // Aqui a conta é uma só, e é a mesma que a aluna lê no app: presença
  // do curso inteiro, com a ausência avisada fora do total.
  function certificadoDaAluna(pessoaId) {
    var p = getPessoa(pessoaId);
    if (!p) return null;
    var h = horasDaAluna(pessoaId) || {};
    var pc = progressoCiclo(pessoaId) || { restam: 0, dadas: 0, total: 0 };

    var todas = presencasDe(pessoaId);
    var contam = todas.filter(function (x) { return x.estado !== "justificada"; });
    var presentes = contam.filter(function (x) {
      return x.estado === "presente" || x.estado === "atraso"; }).length;
    var pct = contam.length ? Math.round(100 * presentes / contam.length) : null;

    // o nível do curso é o da turma; o campo do cadastro guarda como a
    // escola conversa ("Básico"), que não é o degrau do caminho
    var turmas = turmasLista() || [];
    var turma = turmas.filter(function (u) {
      return u.nivel + " · " + u.turma === p.turma; })[0];
    var nivel = (turma && turma.nivel) || p.nivel || "";

    var frequenciaOk = pct !== null && pct >= FREQUENCIA_MINIMA;
    var cicloFechado = pc.restam === 0 && pc.dadas > 0;
    var pronto = frequenciaOk && cicloFechado;

    // o que falta é dito na ordem em que a aluna pode agir
    var falta = "";
    if (!contam.length) falta = "Nenhuma aula com chamada ainda. O certificado sai quando o ciclo fechar.";
    else if (!frequenciaOk) falta = "A sua presença está em " + pct + "%, e o certificado pede "
      + FREQUENCIA_MINIMA + "%.";
    else if (!cicloFechado) falta = pc.restam === 1
      ? "Falta a última aula do ciclo."
      : "Faltam " + pc.restam + " aulas para o ciclo fechar.";

    return {
      nome: p.nome, nivel: nivel,
      horas: h.horasTotais || 0,
      horasNoFimDoCiclo: Math.round(((h.horasTotais || 0) + (h.faltamHoras || 0)) * 10) / 10,
      presentes: presentes, aulas: contam.length,
      justificadas: todas.length - contam.length,
      frequencia: pct, minimo: FREQUENCIA_MINIMA, frequenciaOk: frequenciaOk,
      desde: p.desde || "", ultima: todas[0] ? todas[0].data : "",
      aulasQueFaltam: pc.restam, cicloFechado: cicloFechado,
      pronto: pronto, falta: falta
    };
  }

  // A lista do que a pessoa tem contratado agora, produto a produto.
  // ── ASSINATURA (produto recorrente: Book Club, desafios, plantão) ──
  function ativarAssinatura(pessoaId, cfg) {
    // quando a assinatura \u00e9 reconhecida pelo extrato, o in\u00edcio \u00e9 o dia do
    // pagamento \u2014 \u00e9 ele que define o dia da cobran\u00e7a nos meses seguintes
    var ini = String((cfg && cfg.inicio) || "").slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(ini)) ini = iso(today());
    return mutate(pessoaId, function (p) {
      p.assinatura = { inicio: ini, valor: (cfg && cfg.valor) || "",
        moeda: (cfg && cfg.moeda) || "\u20ac" };
      if (p.status === "lead") { p.status = "aluna"; p.estagio = "matriculado"; }
      concluirReuniaoPelaMatricula(p);
      pushHist(p, "estagio", "Assinatura ativada"
        + (p.assinatura.valor ? " \u00b7 " + p.assinatura.valor + "/m\u00eas" : ""));
    });
  }
  // Encerrar aqui NÃO para a cobrança: quem cobra é o systeme (pelo
  // Stripe). Quando o encerramento nasce na gestão, fica a pendência de
  // parar a cobrança lá — senão a aluna sai da escola e continua sendo
  // debitada todo mês. Quando a notícia vem do próprio gateway
  // (jaParouNoGateway), não há o que fazer: já parou.
  // Cancelar não é perder o acesso na hora: no systeme, a assinatura
  // vale até o fim do período já pago, e só então o acesso cai. Esta é a
  // data desse fim — a próxima data de cobrança que não vai acontecer.
  function fimDoCicloPago(asn, apartirDe) {
    var ini = String((asn && asn.inicio) || "").slice(0, 10);
    if (!ini) return "";
    var dia = parseInt(ini.slice(8, 10), 10) || 1;
    if (dia > 28) dia = 28;
    var base = parseISO(apartirDe || iso(today())) || today();
    var alvo = new Date(base.getFullYear(), base.getMonth(), dia);
    if (alvo <= base) alvo = new Date(base.getFullYear(), base.getMonth() + 1, dia);
    return iso(alvo);
  }
  function encerrarAssinatura(pessoaId, motivo, jaParouNoGateway, ateIso) {
    var p0 = getPessoa(pessoaId);
    if (p0 && p0.assinatura && p0.assinatura.encerrada) return p0;  // já encerrada
    var r = mutate(pessoaId, function (p) {
      if (!p.assinatura) return;
      // "encerrada" é a data do cancelamento — é o que faz a cobrança
      // parar de contar no Caixa. "ate" é o último dia de acesso, já que
      // o período foi pago; passar "agora" tira o acesso no mesmo dia.
      p.assinatura.encerrada = iso(today());
      p.assinatura.ate = ateIso === "agora" ? ""
        : (ateIso || fimDoCicloPago(p.assinatura));
      pushHist(p, "estagio", "Assinatura cancelada" + (motivo ? " \u00b7 " + motivo : "")
        + (p.assinatura.ate && p.assinatura.ate > iso(today())
            ? " \u00b7 acesso at\u00e9 " + ddmm(p.assinatura.ate) : ""));
    });
    if (p0 && p0.assinatura && !jaParouNoGateway) {
      addTarefa({ titulo: "Parar a cobrança de " + p0.nome + " no systeme",
        detalhe: "A assinatura foi encerrada no sistema. Enquanto não for cancelada no systeme, o cartão dela continua sendo debitado.",
        dono: donoDaIntegracao(), por: "Caixa" });
    }
    return r;
  }
  // A cobrança automática pode falhar: cartão vencido, limite, Klarna
  // recusada. O systeme fica tentando de novo e a assinatura entra em
  // "vencida". Enquanto isso, aquele mês NÃO entrou — e o Caixa não pode
  // contar como se tivesse entrado.
  function registrarFalhaAssinatura(pessoaId, dataIso) {
    var p0 = getPessoa(pessoaId);
    if (!p0 || !p0.assinatura) return null;
    var quando = String(dataIso || "").slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(quando)) quando = iso(today());
    if (p0.assinatura.falhou === quando) return p0;
    var r = mutate(pessoaId, function (p) {
      p.assinatura.falhou = quando;
      pushHist(p, "pagamento", "Cobran\u00e7a da assinatura n\u00e3o passou \u00b7 " + ddmm(quando));
    });
    addTarefa({ titulo: "Cobran\u00e7a de " + p0.nome + " n\u00e3o passou",
      detalhe: "A assinatura dela est\u00e1 vencida no systeme. Falar com ela antes de o systeme desistir e cancelar.",
      dono: donoDaIntegracao(), por: "sistema" });
    return r;
  }
  // A cobrança voltou a passar: o mês deixa de estar em aberto.
  function registrarPagamentoAssinatura(pessoaId) {
    var p0 = getPessoa(pessoaId);
    if (!p0 || !p0.assinatura || !p0.assinatura.falhou) return p0;
    return mutate(pessoaId, function (p) {
      delete p.assinatura.falhou;
      pushHist(p, "pagamento", "Cobran\u00e7a da assinatura voltou a passar");
    });
  }
  // A cobrança automática entra no Caixa porque o dia passou, não porque
  // alguém viu o dinheiro. Quando a linha aparece no extrato e você marca
  // como conferida, aquele mês deixa de ser presunção.
  function confirmarRecorrente(pessoaId, mesKey, qual, trans) {
    var campo = qual === "programa" ? "programa" : "assinatura";
    var k = String(mesKey || "").slice(0, 7);
    if (!/^\d{4}-\d{2}$/.test(k)) return null;
    return mutate(pessoaId, function (p) {
      if (!p[campo]) return;
      if (!p[campo].confirmados) p[campo].confirmados = {};
      p[campo].confirmados[k] = { em: iso(today()),
        valor: trans && trans.valor ? Math.abs(trans.valor) : undefined };
    });
  }
  function assinaturaFalhando(p) {
    return !!(p && p.assinatura && p.assinatura.falhou && !p.assinatura.encerrada);
  }

  // Ativa é quem não cancelou — e também quem cancelou mas ainda está
  // dentro do que pagou. Cortar o acesso no dia do pedido seria tirar
  // dela um período que já foi cobrado.
  function assinaturaAtiva(p) {
    if (!p || !p.assinatura) return false;
    if (!p.assinatura.encerrada) return true;
    return !!(p.assinatura.ate && p.assinatura.ate >= iso(today()));
  }
  // Cancelada, mas ainda usando o período pago.
  function assinaturaNoAviso(p) {
    return !!(p && p.assinatura && p.assinatura.encerrada && assinaturaAtiva(p));
  }
  // O cancelamento pelo app N\u00c3O encerra sozinho: registra o pedido e
  // cria a pend\u00eancia para a gest\u00e3o confirmar com a aluna.
  function pedirCancelamentoAssinatura(pessoaId) {
    var p0 = getPessoa(pessoaId);
    if (!p0 || !assinaturaAtiva(p0)) return false;
    if (p0.assinatura.pedidoCancelamento) return true; // j\u00e1 pedido
    mutate(pessoaId, function (p) {
      p.assinatura.pedidoCancelamento = iso(today());
      pushHist(p, "contato", "Pediu o cancelamento da assinatura pelo app");
    });
    addTarefa({ titulo: "Cancelamento de assinatura: " + p0.nome,
      detalhe: "Pedido feito pelo app. Confirmar com a aluna e encerrar a assinatura no perfil dela.",
      dono: donoDaIntegracao(), por: "app da aluna" });
    return true;
  }
  // nome, foto e bio: a pr\u00f3pria aluna edita no app dela
  function updatePerfilAluna(pessoaId, patch) {
    return mutate(pessoaId, function (p) {
      if (patch.nome && patch.nome.trim() && patch.nome.trim() !== p.nome) {
        pushHist(p, "contato", "Nome atualizado pela aluna no app \u00b7 era " + p.nome);
        p.nome = patch.nome.trim();
      }
      if (patch.foto !== undefined) p.foto = (patch.foto || "").trim().slice(0, 500);
      if (patch.bio !== undefined) p.bio = (patch.bio || "").trim().slice(0, 300);
    });
  }
  // o que o app da assinante mostra \u00e9 configurado pela gest\u00e3o (Agenda)
  var ASSIN_CFG_KEY = "isr_assinatura_cfg_v1";
  var ASSIN_CFG_PADRAO = { grupoWhats: "", bannerAtivo: false, bannerTexto: "", bannerLink: "",
    // o cartão "Desafio da semana" do app aponta para cá — a gestão
    // troca toda segunda pelo link da semana (ex. /170826)
    desafioLink: "",
    // arte do post da semana: vira a capa do app da aluna. Em branco, a
    // capa mostra o número da semana no lugar da imagem.
    semanaCapa: "",
    // cancelamento da assinatura: quando preenchido, o botão no app leva
    // ao portal de pagamento (systeme); em branco, vale o pedido interno
    cancelLink: "",
    // WhatsApp de contato da escola: é o que aparece para quem tenta
    // entrar no app sem acesso ativo (assinatura cancelada, ex-aluna)
    whatsEscola: "" };
  function assinaturaCfg() {
    try { return Object.assign({}, ASSIN_CFG_PADRAO,
      JSON.parse(localStorage.getItem(ASSIN_CFG_KEY) || "{}")); }
    catch (e) { return Object.assign({}, ASSIN_CFG_PADRAO); }
  }
  function setAssinaturaCfg(patch) {
    var cfg = Object.assign(assinaturaCfg(), patch || {});
    try { localStorage.setItem(ASSIN_CFG_KEY, JSON.stringify(cfg)); } catch (e) {}
    agendarSync(); return cfg;
  }
  function assinantesAtivas() {
    return loadPessoas().filter(function (p) { return assinaturaAtiva(p); });
  }

  // ── ACESSO AO APP DA ALUNA ────────────────────────────────────
  // O acesso segue o produto contratado, não o rótulo da ficha: quem
  // cancela a assinatura no systeme continua com status "aluna", e sem
  // esta verificação continuaria entrando no app depois de sair.
  function acessoLiberado(p) {
    if (!p || p.status === "ex-aluna") return false;
    if (["aluna", "mvs", "pausada", "programa"].indexOf(p.status) < 0) return false;
    if (p.turma) return true;
    return produtosDe(p.id).some(function (x) { return x.contratado; });
  }
  // Três desfechos para um e-mail que acabou de fazer login:
  // liberado (abre o app) · encerrado (já teve acesso e não tem mais) ·
  // desconhecido (e-mail que não existe na base).
  function acessoPorEmail(email) {
    var e = String(email || "").trim().toLowerCase();
    if (!e) return { situacao: "desconhecido", pessoa: null };
    var achadas = loadPessoas().filter(function (x) {
      return (x.email || "").trim().toLowerCase() === e;
    });
    if (!achadas.length) return { situacao: "desconhecido", pessoa: null };
    var ativa = achadas.filter(acessoLiberado)[0];
    if (ativa) return { situacao: "liberado", pessoa: ativa };
    return { situacao: "encerrado", pessoa: achadas[0] };
  }
  // Número da escola para quem precisa falar com alguém. Sem número
  // cadastrado o link abre o WhatsApp sem destinatário — por isso a
  // tela só mostra o botão quando há número.
  function whatsappEscola() { return (assinaturaCfg().whatsEscola || "").trim(); }
  function linkWhatsappEscola(texto) {
    var n = whatsappEscola();
    return n ? waLink(n, texto || "") : "";
  }
  // Lista colada (quem já está no desafio): uma pessoa por linha, no
  // formato "Nome email" / "Nome <email>" / "Nome, email" ou só o e-mail.
  // A leitura devolve a prévia; nada muda antes do aplicar.
  function lerListaAssinantes(texto) {
    var out = [], vistos = {};
    String(texto || "").split(/\n/).forEach(function (linha) {
      var l = linha.trim();
      if (!l) return;
      var emails = l.match(/[^\s,;<>"']+@[^\s,;<>"']+\.[^\s,;<>"']+/g) || [];
      if (!emails.length) { out.push({ linha: l, email: "", nome: l, acao: "sem-email" }); return; }
      emails.forEach(function (em) {
        var email = em.toLowerCase();
        if (vistos[email]) return;
        vistos[email] = 1;
        var nome = emails.length === 1
          ? l.replace(em, "").replace(/[<>,;"']/g, " ").replace(/\s+/g, " ").trim()
          : "";
        var p = loadPessoas().filter(function (x) {
          return (x.email || "").trim().toLowerCase() === email;
        })[0];
        if (p && assinaturaAtiva(p)) out.push({ email: email, nome: p.nome, id: p.id, acao: "ja-assinante" });
        else if (p) out.push({ email: email, nome: p.nome, id: p.id, acao: "ativar" });
        else out.push({ email: email, nome: nome || email.split("@")[0], acao: "criar" });
      });
    });
    // Quem é assinante aqui e não está na lista colada saiu do systeme:
    // a lista é a fonte da verdade do que está pago. Só entra na conta
    // quando a lista tem gente — colar vazio não encerra ninguém.
    if (out.filter(function (x) { return x.email; }).length) {
      assinantesAtivas().forEach(function (p) {
        var em = (p.email || "").trim().toLowerCase();
        if (em && vistos[em]) return;
        // quem já cancelou some da lista do systeme mas continua com
        // acesso até o fim do que pagou: não é uma saída nova
        if (p.assinatura && p.assinatura.encerrada) return;
        out.push({ email: em, nome: p.nome, id: p.id, acao: "encerrar" });
      });
    }
    return out;
  }
  // Aplica a lista da semana: cria e ativa quem entrou, deixa quem
  // continua exatamente como está (não reativa, para o convite do
  // Netlify não sair de novo) e encerra quem saiu do systeme.
  function aplicarListaAssinantes(itens, cfg) {
    var valor = (cfg && cfg.valor) || "27";
    var moeda = (cfg && cfg.moeda) || "€";
    var criados = 0, ativados = 0, encerrados = 0, mantidos = 0;
    (itens || []).forEach(function (it) {
      if (it.acao === "ativar") { ativarAssinatura(it.id, { valor: valor, moeda: moeda }); ativados++; }
      else if (it.acao === "criar") {
        var p = novaPessoa({ nome: it.nome, email: it.email, origem: "Assinatura" });
        ativarAssinatura(p.id, { valor: valor, moeda: moeda });
        criados++;
      } else if (it.acao === "encerrar" && cfg && cfg.encerrarAusentes) {
        encerrarAssinatura(it.id, "Fora da lista do systeme", true);
        encerrados++;
      } else if (it.acao === "ja-assinante") mantidos++;
    });
    return { criados: criados, ativados: ativados, encerrados: encerrados,
      mantidos: mantidos, novos: criados + ativados,
      // compatível com quem só lia o número
      valueOf: function () { return criados + ativados; } };
  }

  function produtosDe(pessoaId) {
    var p = getPessoa(pessoaId);
    if (!p) return [];
    var out = [];
    var c = contratoVigente(p);

    out.push({ id: "turma", nome: "Turma em grupo",
      contratado: !!(p.turma && p.turma.indexOf("Particular") !== 0 && c),
      detalhe: p.turma && c
        ? p.turma + " · " + (c.parcelaValor || "—")
          + (c.vencDia === "auto" ? " · cobrança automática" : " · vence dia " + c.vencDia)
        : "",
      pago: null });

    var pa = p.particular;
    out.push({ id: "particular", nome: "Aulas particulares",
      contratado: !!pa,
      detalhe: pa
        ? (pa.aulas ? pa.aulas + (pa.aulas === 1 ? " aula" : " aulas") : "sem número definido")
          + " · " + (pa.feitas || 0) + " dada(s)"
          + (pa.valor ? " · " + pa.valor : "")
        : "",
      pago: pa ? !!pa.pago : null });

    // A assinatura de € 27 do acompanhamento deixou de ser vendida. O
    // cartão só aparece para quem ainda tem uma ativa, e só para encerrar
    // — sem isso, não haveria como fechar as que restaram.
    var asn = p.assinatura;
    if (assinaturaAtiva(p)) out.push({ id: "assinatura", nome: "Assinatura",
      contratado: true, semVenda: true,
      detalhe: ("desde " + ddmm(asn.inicio)
          + (asn.valor ? " \u00b7 " + asn.valor + "/m\u00eas" : "")
          + (assinaturaNoAviso(p) ? " \u00b7 CANCELADA \u00b7 acesso at\u00e9 " + ddmm(asn.ate) : "")
          + (assinaturaFalhando(p) ? " \u00b7 COBRAN\u00c7A N\u00c3O PASSOU em " + ddmm(asn.falhou) : "")
          + (asn.pedidoCancelamento && !asn.encerrada
              ? " \u00b7 PEDIU CANCELAMENTO em " + ddmm(asn.pedidoCancelamento) : "")),
      pago: null });

    var pr = p.programa;
    out.push({ id: "programa", nome: "Desafio da semana",
      contratado: !!(pr && !pr.encerrado),
      detalhe: pr && !pr.encerrado
        ? pr.nome + (pr.valor ? " · " + pr.valor : "")
          + (pr.desde ? " · desde " + ddmm(pr.desde) : "")
        : "",
      pago: null });

    return out;
  }
  // Quem está na turma. Com uma data, quem ainda não começou fica de
  // fora: a matrícula do ciclo seguinte é fechada semanas antes da
  // primeira aula, e sem este corte a aluna entrava na chamada do ciclo
  // que está correndo — levando falta de aula que ela não tinha.
  function alunasDaTurma(turmaLabel, ateIso) {
    return loadPessoas().filter(function (p) {
      if (p.status !== "aluna" || p.turma !== turmaLabel) return false;
      if (ateIso && p.desde && p.desde > ateIso) return false;
      return true;
    });
  }
  // As que já estão matriculadas e ainda não começaram, para a tela dizer
  // que elas existem em vez de simplesmente não mostrá-las.
  function alunasQueVaoComecar(turmaLabel, ateIso) {
    var limite = ateIso || iso(today());
    return loadPessoas().filter(function (p) {
      return p.status === "aluna" && p.turma === turmaLabel
        && p.desde && p.desde > limite;
    }).map(function (p) {
      return { id: p.id, nome: p.nome, desde: p.desde };
    }).sort(function (a, b) { return a.desde < b.desde ? -1 : 1; });
  }
  // A data da primeira aula de quem já está na lista. É o que decide a
  // partir de quando a aluna aparece na chamada e em qual ciclo a matrícula
  // conta. Não mexe nas parcelas: o contrato tem edição própria no Perfil.
  function setInicioDasAulas(id, novoIso) {
    if (!novoIso || !/^\d{4}-\d{2}-\d{2}$/.test(String(novoIso))) return false;
    var mudou = false;
    mutate(id, function (p) {
      var antes = p.desde || "";
      if (antes === novoIso) return;
      p.desde = novoIso;
      mudou = true;
      pushHist(p, "matricula", "Início das aulas "
        + (antes ? "mudou de " + ddmm(antes) + " para " : "definido em ") + ddmm(novoIso));
    });
    agendarSync();
    return mudou;
  }
  // Em lote: no período de matrículas a turma nova toda começa no mesmo dia,
  // e são dezenas de alunas. Uma por uma no perfil não é caminho.
  function setInicioDasAulasEmLote(ids, novoIso) {
    var n = 0;
    (ids || []).forEach(function (id) { if (setInicioDasAulas(id, novoIso)) n++; });
    return n;
  }
  function chamadasDaTurma(turmaLabel) {
    var m = chamadasAll(), out = [];
    Object.keys(m).forEach(function (k) { if (m[k].turma === turmaLabel) out.push(m[k]); });
    out.sort(function (a, b) { return a.data < b.data ? 1 : -1; });
    return out;
  }

  // ── DIÁRIO DE CLASSE ──────────────────────────────────────────
  //
  // O diário é a grade de sempre: alunas nas linhas, aulas nas colunas,
  // uma letra por célula. A professora vê o ciclo inteiro de uma vez —
  // quem está sumindo, quem entrega tarefa — em vez de uma lista solta
  // do dia. A coluna da aula escolhida é a que se preenche.
  function diarioDaTurma(turmaLabel, dataAtualIso, nAulas) {
    var limite = nAulas || aulasPorCiclo();
    // o diário é do ciclo que está correndo: quem começa depois não tem
    // linha nele, e a coluna da aula de hoje não pede presença dela
    var alunas = alunasDaTurma(turmaLabel, dataAtualIso || iso(today()));
    var salvas = chamadasDaTurma(turmaLabel);           // mais recente primeiro

    var datas = salvas.map(function (c) { return c.data; });
    if (dataAtualIso && datas.indexOf(dataAtualIso) < 0) datas.push(dataAtualIso);
    datas.sort();                                      // cronológico
    if (datas.length > limite) datas = datas.slice(datas.length - limite);

    var porData = {};
    salvas.forEach(function (c) { porData[c.data] = c; });

    // o ciclo tem um número fixo de aulas. A grade mostra as dez desde o
    // começo — as que já aconteceram com data, as que faltam só numeradas.
    var aulas = datas.map(function (d, i) {
      var c = porData[d];
      return { data: d, label: ddmm(d), n: i + 1,
        salva: !!c, atual: d === dataAtualIso, futura: false };
    });
    for (var i = aulas.length; i < limite; i++) {
      aulas.push({ data: "", label: (i + 1) + "ª", n: i + 1,
        salva: false, atual: false, futura: true });
    }

    var linhas = alunas.map(function (p) {
      var celulas = aulas.map(function (a) {
        var c = a.data ? porData[a.data] : null;
        var estado = c ? estadoPresenca((c.presencas || {})[p.id]) : null;
        var tar = c && c.tarefas ? c.tarefas[p.id] : undefined;
        return { data: a.data, estado: estado, tarefa: tar,
          atual: !!a.data && a.data === dataAtualIso,
          futura: a.futura, registrada: !!c };
      });
      var contadas = celulas.filter(function (x) { return x.registrada; });
      var presentes = contadas.filter(function (x) {
        return x.estado === "presente" || x.estado === "atraso";
      }).length;
      return { id: p.id, nome: p.nome, celulas: celulas,
        aulas: contadas.length, presentes: presentes,
        faltas: contadas.filter(function (x) { return x.estado === "falta"; }).length,
        frequencia: contadas.length ? Math.round((presentes / contadas.length) * 100) : null };
    });

    return { turma: turmaLabel, aulas: aulas, linhas: linhas,
      total: limite, dadas: datas.filter(function (d) { return porData[d]; }).length };
  }

  // ── MOEDAS DA ALUNA (calculadas dos dados + ajustes manuais) ──
  var MOEDAS_KEY = "isr_moedas_v1"; // só os ajustes manuais; o resto é derivado
  var MOEDAS_REGRAS = { presenca: 10, atraso: 5, parcelaPaga: 15, onboardingCompleto: 30,
    avaliouAula: 5, renovouCiclo: 100 };
  var MOEDAS_VALIDADE_DIAS = 365;
  function somaDias(isoStr, n) {
    var d = parseISO(isoStr);
    if (!d) return "";
    var x = new Date(d); x.setDate(x.getDate() + n);
    return iso(x);
  }
  // grupos de bônus do design original (Moedas ISR) — a equipe aplica pelo Perfil
  var MOEDAS_BONUS = [
    { grupo: "Aulas", cor: "#2a9d8f", itens: [
      { label: "Presença em aula", valor: 10, auto: true },
      { label: "Tarefa entregue no prazo", valor: 8 },
      { label: "Presença em aula extra", valor: 15 },
      { label: "Book club semanal", valor: 20 }] },
    // sem "Comunidade" no nome nem ação que dependa de um espaço que a
    // escola ainda não tem: o desafio vive dentro do próprio app
    { grupo: "Desafios e divulgação", cor: "#e07856", itens: [
      { label: "Completou o desafio da semana", valor: 10 },
      { label: "Melhor resposta do desafio", valor: 10 },
      { label: "Compartilhou post da ISR", valor: 5 }] },
    { grupo: "Indicações", cor: "#9c6f56", itens: [
      { label: "Indicou um amigo", valor: 20 },
      { label: "Trouxe convidado para a apresentação", valor: 60 },
      { label: "Indicação virou matrícula", valor: 200 }] }
  ];
  // ISR Miles — o nome vem da metáfora de viagem da marca.
  // Catálogo de resgate: cada prêmio tem categoria e custo em miles.
  var MOEDAS_NOME = "ISR Miles";
  var MOEDAS_CATS = {
    aula: "Aula", material: "Material", mentoria: "Mentoria",
    comunidade: "Comunidade", reconhecimento: "Reconhecimento",
    carreira: "Carreira", desconto: "Desconto", flin: "FLIN", programa: "Acompanhamento"
  };
  // Catálogo em três níveis. Cada prêmio pode ter três limites além do
  // preço: vagas por mês (o que é escasso não se precifica para fora),
  // limite por ciclo e tempo mínimo de casa.
  var MOEDAS_NIVEIS = {
    facil:  { label: "Fácil",  ordem: 1, cor: "#5a9e4b" },
    medio:  { label: "Médio",  ordem: 2, cor: "#348a8e" },
    dificil:{ label: "Difícil", ordem: 3, cor: "#6b5b95" }
  };
  var MOEDAS_RESGATES = [
    // ── fácil: primeiras semanas ──
    { id: "flin", nome: "Acesso à prática com IA", cat: "flin", nivel: "facil",
      custo: 20, flin: "sempre", umaVez: true,
      detalhe: "Acesso permanente à prática com IA. Não conta hora de aula." },
    { id: "rg1", nome: "Escolhe o tema de uma aula extra", cat: "aula", nivel: "facil", custo: 80 },
    { id: "rg11", nome: "Abono de 1 falta", cat: "aula", nivel: "facil",
      custo: 120, porCiclo: 1,
      detalhe: "Uma ausência do ciclo deixa de contar na sua frequência." },

    // ── médio: dentro do ciclo ──
    { id: "rg2", nome: "Caderno de atividades personalizado", cat: "material", nivel: "medio", custo: 180 },
    { id: "rg12", nome: "Feedback em vídeo da professora", cat: "mentoria", nivel: "medio",
      custo: 250, vagasMes: 4,
      detalhe: "Vídeo com a avaliação do seu progresso e os próximos pontos a treinar." },
    { id: "rg13", nome: "Workshop exclusivo do mês", cat: "comunidade", nivel: "medio",
      custo: 300, vagasMes: 12, minimoMes: 4,
      detalhe: "Encontro ao vivo só para quem resgatou. Acontece com no mínimo 4 inscritas." },

    // ── difícil: quem já tem estrada na escola ──
    { id: "rg14", nome: "Um ciclo do acompanhamento no WhatsApp", cat: "programa", nivel: "dificil",
      custo: 450, minCiclos: 2,
      detalhe: "Programa de desafios semanais, sem custo, a partir do segundo ciclo." },
    { id: "rg8", nome: "€10 de desconto na mensalidade", cat: "desconto", nivel: "dificil",
      custo: 500, minCiclos: 3,
      detalhe: "Disponível a partir do terceiro ciclo." },
    { id: "rg3", nome: "30 min de conversa 1:1 com a Gabi", cat: "mentoria", nivel: "dificil",
      custo: 500, vagasMes: 4 },
    { id: "rg7", nome: "Carta de recomendação em inglês", cat: "carreira", nivel: "dificil",
      custo: 600, minCiclos: 2,
      detalhe: "Disponível a partir do segundo ciclo." }
  ];

  // ── LIMITES DE RESGATE ────────────────────────────────────────
  var RESGATES_KEY = "isr_resgates_v1";
  function resgatesAll() {
    try { return JSON.parse(localStorage.getItem(RESGATES_KEY)) || []; } catch (e) { return []; }
  }
  function resgatesSave(l) {
    try { localStorage.setItem(RESGATES_KEY, JSON.stringify(l)); } catch (e) {}
    agendarSync();
  }
  function ciclosDe(pessoaOuId) {
    var p = typeof pessoaOuId === "string" ? getPessoa(pessoaOuId) : pessoaOuId;
    if (!p) return 0;
    return (p.contratos || []).length || (p.status === "aluna" ? 1 : 0);
  }
  // O que impede este resgate agora. Null quer dizer que pode.
  function bloqueioDoResgate(pessoaId, r) {
    var hoje = iso(today());
    var mes = hoje.slice(0, 7);
    var todos = resgatesAll();
    if (r.umaVez && todos.some(function (x) { return x.pessoaId === pessoaId && x.resgateId === r.id; }))
      return { motivo: "ja", texto: "Já resgatado." };
    if (r.minCiclos && ciclosDe(pessoaId) < r.minCiclos)
      return { motivo: "ciclos", texto: "A partir do " + r.minCiclos + "º ciclo na escola." };
    if (r.porCiclo) {
      var pc = progressoCiclo(pessoaId) || { desde: "" };
      var noCiclo = todos.filter(function (x) {
        return x.pessoaId === pessoaId && x.resgateId === r.id && (!pc.desde || x.em >= pc.desde);
      }).length;
      if (noCiclo >= r.porCiclo)
        return { motivo: "ciclo", texto: "Limite de um por ciclo. Disponível no próximo ciclo." };
    }
    if (r.vagasMes) {
      var noMes = todos.filter(function (x) {
        return x.resgateId === r.id && (x.em || "").slice(0, 7) === mes;
      }).length;
      if (noMes >= r.vagasMes)
        return { motivo: "vagas", texto: "Vagas do mês esgotadas. Novas vagas no dia 1." };
    }
    return null;
  }
  function vagasDoMes(resgateId) {
    var r = MOEDAS_RESGATES.filter(function (x) { return x.id === resgateId; })[0];
    if (!r || !r.vagasMes) return null;
    var mes = iso(today()).slice(0, 7);
    var usadas = resgatesAll().filter(function (x) {
      return x.resgateId === resgateId && (x.em || "").slice(0, 7) === mes;
    }).length;
    return { usadas: usadas, total: r.vagasMes, restam: Math.max(0, r.vagasMes - usadas),
      minimo: r.minimoMes || 0, atingiuMinimo: !r.minimoMes || usadas >= r.minimoMes };
  }

  // ── FLIN ──────────────────────────────────────────────────────
  //
  // O FLIN é a prática com IA. Ele já está nos custos fixos da escola,
  // então não faz sentido cobrar caro nem por período: o desbloqueio é
  // permanente e barato, só para dar um motivo de estrear a conta de
  // miles. Não conta hora de aula — o certificado é de aula com
  // professora. O link mora em um lugar só; se a ferramenta mudar de
  // endereço, muda aqui.
  // O Book Club tem app próprio (hoje no Netlify da escola). O endereço
  // fica configurável, com o atual como padrão — a aluna ganha o atalho
  // nos materiais sem ninguém precisar configurar nada.
  // ── OS CLUBES ─────────────────────────────────────────────────
  //
  // Clube é encontro de conversa por tema, fora da aula: Book Club,
  // Movie Lovers, Chef Traditions. A escola vendia um só (o Book
  // Club, com um link solto na configuração) e agora oferece vários.
  //
  // A regra comercial é o que exige modelo de verdade: **os dois
  // primeiros clubes de cada aluna vêm no plano; do terceiro em
  // diante ela paga**. Quem decide quais dois são os incluídos é a
  // ordem de entrada — por isso cada entrada fica carimbada. Sem o
  // carimbo, entrar num quarto clube poderia tornar pago um clube
  // em que ela está desde o começo.
  //
  // Vaga é limitada, então existe lista de espera: quem sai libera a
  // vaga e a primeira da espera entra no lugar.
  // Duas entradas no mesmo milissegundo empatavam, e o desempate
  // caía no nome do clube: a aluna entrava no terceiro e o sistema
  // cobrava o segundo. A ordem de entrada decide quem é pago, então
  // ela não pode empatar.
  var ultimoCarimboClube = "";
  function carimboDeEntrada() {
    var t = new Date().toISOString();
    if (t <= ultimoCarimboClube) t = new Date(Date.parse(ultimoCarimboClube) + 1).toISOString();
    ultimoCarimboClube = t;
    return t;
  }

  var CLUBES_KEY = "isr_clubes_v1";
  var CLUBES_INCLUIDOS = 2;
  function clubesRaw() {
    try { return JSON.parse(localStorage.getItem(CLUBES_KEY)) || []; } catch (e) { return []; }
  }
  function clubesSalvar(l) {
    carimbarLista(l);
    try { localStorage.setItem(CLUBES_KEY, JSON.stringify(l || [])); } catch (e) {}
    agendarSync();
    return clubesLista();
  }
  function clubeNormal(c) {
    return {
      id: c.id, nome: c.nome || "", professora: c.professora || "",
      formato: c.formato === "presencial" ? "presencial" : "online",
      dia: c.dia || "", hora: c.hora || "", duracao: c.duracao || "",
      local: c.local || "", link: c.link || "",
      vagas: Math.max(0, parseInt(c.vagas, 10) || 0),
      status: c.status === "publicado" ? "publicado" : "rascunho",
      descricao: c.descricao || "",
      // O nível diz para quem o clube é, e sem ele a aluna de A1 via
      // na lista um clube de B2 que não ia conseguir acompanhar.
      nivel: c.nivel || "todos",
      // A bio aparece no cartão que a aluna vê: quem vai estar lá na
      // frente é metade da decisão de entrar num clube.
      bio: c.bio || "",
      // "New" não é um campo que alguém marca e esquece de desmarcar:
      // é a data em que o clube foi publicado.
      publicadoEm: c.publicadoEm || "",
      materiais: c.materiais || [], encontros: c.encontros || [],
      membros: c.membros || [], espera: c.espera || [],
      entrou: c.entrou || {}, pagos: c.pagos || {},
      _v: c._v
    };
  }
  function clubesLista() {
    return clubesRaw().filter(function (c) { return c && c.id && !c.apagado; }).map(clubeNormal);
  }
  function getClube(id) {
    return clubesLista().filter(function (c) { return c.id === id; })[0] || null;
  }
  // O que um clube precisa ter para ser publicado. Rascunho pode
  // estar pela metade — é para isso que rascunho existe —, mas o que
  // a aluna vê no catálogo não pode estar sem horário ou sem onde é.
  // Devolve CÓDIGOS, não frases: a tela do professor fala português ou
  // inglês conforme quem está logado, e uma frase pronta em português
  // vinda daqui aparecia em inglês no meio do resto traduzido.
  // FALTA_ROTULOS tem as palavras, para quem precisa escrever a frase.
  var FALTA_ROTULOS = { nome: "nome", descricao: "descrição", nivel: "nível",
    horario: "horário", encontros: "as 4 datas dos encontros", vagas: "vagas",
    endereco: "o endereço", link: "o link" };
  function faltaParaPublicar(c) {
    var falta = [];
    if (!String(c.nome || "").trim()) falta.push("nome");
    if (!String(c.descricao || "").trim()) falta.push("descricao");
    if (!String(c.nivel || "").trim()) falta.push("nivel");
    if (!String(c.dia || "").trim() || !String(c.hora || "").trim()) falta.push("horario");
    if ((c.encontros || []).filter(function (e) { return e && e.data; }).length < 4) {
      falta.push("encontros");
    }
    if (!(parseInt(c.vagas, 10) > 0)) falta.push("vagas");
    if (c.formato === "presencial" ? !String(c.local || "").trim() : !String(c.link || "").trim()) {
      falta.push(c.formato === "presencial" ? "endereco" : "link");
    }
    return falta;
  }
  function clubeSalvar(cfg) {
    cfg = cfg || {};
    // Numa edição parcial — salvar só os encontros, só a bio — o nome
    // não vem no pacote. Exigi-lo aí fazia a gravação falhar calada
    // para quem só queria mudar um campo.
    var atual = cfg.id ? getClube(cfg.id) : null;
    var nome = String(cfg.nome !== undefined ? cfg.nome : (atual && atual.nome) || "").trim();
    if (!nome) return { ok: false, erro: "O clube precisa de um nome." };
    if (cfg.formato === "presencial" && !String(cfg.local || "").trim()) {
      return { ok: false, erro: "Clube presencial precisa de endereço." };
    }
    var l = clubesRaw();
    var i = -1;
    if (cfg.id) l.forEach(function (c, k) { if (c.id === cfg.id) i = k; });
    if (i < 0) {
      var novo = clubeNormal(Object.assign({ id: "cl" + Date.now() + Math.floor(Math.random() * 1000) }, cfg));
      novo.nome = nome;
      l.push(novo);
    } else {
      l[i] = clubeNormal(Object.assign({}, l[i], cfg, { id: l[i].id, nome: nome }));
    }
    clubesSalvar(l);
    return { ok: true, id: i < 0 ? l[l.length - 1].id : cfg.id };
  }
  // Publicar e despublicar, com as travas do handoff.
  //
  // Clube publicado é o que a aluna vê no catálogo. Por isso publicar
  // exige o cadastro inteiro, e despublicar com gente inscrita é tirar
  // da frente delas um clube em que já entraram — some do catálogo, e
  // elas ficam com uma inscrição para lugar nenhum.
  function clubePublicar(id) {
    var c = getClube(id);
    if (!c) return { ok: false, erro: "Clube não encontrado." };
    var falta = faltaParaPublicar(c);
    if (falta.length) {
      return { ok: false, erro: "Falta " + falta.map(function (k) {
        return FALTA_ROTULOS[k] || k; }).join(", ") + " para publicar." };
    }
    var l = clubesRaw();
    var reg = l.filter(function (x) { return x.id === id; })[0];
    reg.status = "publicado";
    if (!reg.publicadoEm) reg.publicadoEm = iso(today());
    reg._v = Date.now();
    clubesSalvar(l);
    return { ok: true };
  }
  function clubeDespublicar(id) {
    var c = getClube(id);
    if (!c) return { ok: false, erro: "Clube não encontrado." };
    if ((c.membros || []).length) {
      return { ok: false,
        erro: "Este clube tem " + c.membros.length
          + (c.membros.length === 1 ? " inscrita" : " inscritas")
          + ". Despublicar tiraria do catálogo um clube em que elas já entraram." };
    }
    var l = clubesRaw();
    var reg = l.filter(function (x) { return x.id === id; })[0];
    reg.status = "rascunho"; reg._v = Date.now();
    clubesSalvar(l);
    return { ok: true };
  }
  // "New" por três semanas depois de publicado.
  function clubeEhNovo(c) {
    if (!c || c.status !== "publicado" || !c.publicadoEm) return false;
    return daysBetween(parseISO(c.publicadoEm), today()) <= 21;
  }
  // Apagar é só para rascunho: clube publicado já foi visto por
  // alguém, e apagar o que foi anunciado some com o registro.
  function clubeRemover(id) {
    var c = getClube(id);
    if (c && c.status === "publicado") {
      return { ok: false,
        erro: "Clube publicado não se apaga. Despublique primeiro — e isso só é possível sem inscritas." };
    }
    var l = clubesRaw().map(function (c2) {
      return c2.id === id ? { id: c2.id, apagado: iso(today()), _v: Date.now() } : c2;
    });
    try { localStorage.setItem(CLUBES_KEY, JSON.stringify(l)); } catch (e) {}
    agendarSync();
    return { ok: true, clubes: clubesLista() };
  }

  // Os clubes de uma aluna, na ordem em que ela entrou, já dizendo
  // qual vem no plano e qual é pago.
  function clubesDaAluna(pessoaId) {
    if (!pessoaId) return [];
    return clubesLista()
      .filter(function (c) { return c.membros.indexOf(pessoaId) >= 0; })
      .sort(function (a, b) {
        var ea = a.entrou[pessoaId] || "", eb = b.entrou[pessoaId] || "";
        return ea < eb ? -1 : ea > eb ? 1 : (a.nome < b.nome ? -1 : 1);
      })
      .map(function (c, i) {
        var incluido = i < CLUBES_INCLUIDOS;
        return { id: c.id, nome: c.nome, professora: c.professora,
          formato: c.formato, dia: c.dia, hora: c.hora, local: c.local,
          ordem: i + 1,
          plano: incluido ? "incluido" : (c.pagos[pessoaId] ? "pago" : "pendente"),
          pagoEm: c.pagos[pessoaId] || "" };
      });
  }
  function clubeVagasLivres(c) {
    return c.vagas ? Math.max(0, c.vagas - c.membros.length) : null;
  }
  // Entrar: vira membro se há vaga, senão entra na espera. Do
  // terceiro clube em diante a entrada nasce pendente de pagamento —
  // a aluna participa, e a cobrança aparece para a gestão.
  function clubeEntrar(clubeId, pessoaId, opcoes) {
    opcoes = opcoes || {};
    var l = clubesRaw(), i = -1;
    l.forEach(function (c, k) { if (c.id === clubeId) i = k; });
    if (i < 0) return { ok: false, erro: "Clube não encontrado." };
    var c = clubeNormal(l[i]);
    if (c.membros.indexOf(pessoaId) >= 0) return { ok: true, jaEra: true };
    var livres = clubeVagasLivres(c);
    if (livres === 0 && !opcoes.forcar) {
      if (c.espera.indexOf(pessoaId) < 0) c.espera.push(pessoaId);
      l[i] = c; clubesSalvar(l);
      return { ok: true, espera: true, posicao: c.espera.indexOf(pessoaId) + 1 };
    }
    c.espera = c.espera.filter(function (x) { return x !== pessoaId; });
    c.membros.push(pessoaId);
    c.entrou[pessoaId] = carimboDeEntrada();
    l[i] = c; clubesSalvar(l);
    var depois = clubesDaAluna(pessoaId).filter(function (x) { return x.id === clubeId; })[0];
    return { ok: true, plano: depois ? depois.plano : "incluido",
      ordem: depois ? depois.ordem : 1 };
  }
  // Sair libera a vaga, e a primeira da espera entra no lugar.
  function clubeSair(clubeId, pessoaId) {
    var l = clubesRaw(), i = -1;
    l.forEach(function (c, k) { if (c.id === clubeId) i = k; });
    if (i < 0) return { ok: false, erro: "Clube não encontrado." };
    var c = clubeNormal(l[i]);
    c.membros = c.membros.filter(function (x) { return x !== pessoaId; });
    c.espera = c.espera.filter(function (x) { return x !== pessoaId; });
    delete c.entrou[pessoaId];
    delete c.pagos[pessoaId];
    var entrou = null;
    if (c.espera.length && clubeVagasLivres(c) !== 0) {
      entrou = c.espera.shift();
      c.membros.push(entrou);
      c.entrou[entrou] = carimboDeEntrada();
    }
    l[i] = c; clubesSalvar(l);
    return { ok: true, promovida: entrou };
  }
  function clubePagamentoFeito(clubeId, pessoaId, quando) {
    var l = clubesRaw(), i = -1;
    l.forEach(function (c, k) { if (c.id === clubeId) i = k; });
    if (i < 0) return { ok: false };
    var c = clubeNormal(l[i]);
    c.pagos[pessoaId] = quando || iso(today());
    l[i] = c; clubesSalvar(l);
    return { ok: true };
  }
  // O que a gestão precisa ver de uma vez: quanto, quantos e quem
  // está devendo o terceiro clube.
  // O que a aluna vê: os clubes dela e os que ela ainda pode entrar.
  // Só clube publicado aparece no catálogo — rascunho é da equipe.
  function clubesParaAluna(pessoaId) {
    var meus = clubesDaAluna(pessoaId);
    var dentro = {};
    meus.forEach(function (c) { dentro[c.id] = true; });
    var completo = clubesLista();
    var porId = {};
    completo.forEach(function (c) { porId[c.id] = c; });
    var abertos = completo.filter(function (c) {
      return c.status === "publicado" && !dentro[c.id];
    }).map(function (c) {
      var livres = clubeVagasLivres(c);
      return {
        id: c.id, nome: c.nome, professora: c.professora, formato: c.formato,
        dia: c.dia, hora: c.hora, duracao: c.duracao, local: c.local, link: c.link,
        descricao: c.descricao, materiais: c.materiais, encontros: c.encontros,
        vagas: c.vagas, livres: livres, lotado: livres === 0,
        naEspera: c.espera.indexOf(pessoaId) >= 0,
        posicaoEspera: c.espera.indexOf(pessoaId) + 1,
        // entrar neste seria o enésimo clube dela
        seria: meus.length + 1,
        cobra: meus.length + 1 > CLUBES_INCLUIDOS
      };
    });
    return {
      meus: meus.map(function (c) {
        var cl = porId[c.id] || {};
        return Object.assign({}, c, {
          duracao: cl.duracao || "", local: cl.local || "", link: cl.link || "",
          descricao: cl.descricao || "", materiais: cl.materiais || [],
          encontros: cl.encontros || [], vagas: cl.vagas || 0
        });
      }),
      abertos: abertos,
      incluidos: CLUBES_INCLUIDOS,
      usados: meus.length
    };
  }

  function clubesResumo() {
    var cs = clubesLista();
    var publicados = cs.filter(function (c) { return c.status === "publicado"; });
    var pessoas = {};
    var pendentes = [];
    cs.forEach(function (c) {
      c.membros.forEach(function (pid) { pessoas[pid] = true; });
    });
    Object.keys(pessoas).forEach(function (pid) {
      clubesDaAluna(pid).forEach(function (x) {
        if (x.plano !== "pendente") return;
        var p = getPessoa(pid);
        pendentes.push({ pessoaId: pid, nome: (p && p.nome) || pid,
          clubeId: x.id, clube: x.nome, ordem: x.ordem });
      });
    });
    pendentes.sort(function (a, b) { return a.nome < b.nome ? -1 : 1; });
    return {
      clubes: cs.length, publicados: publicados.length,
      rascunhos: cs.length - publicados.length,
      alunas: Object.keys(pessoas).length,
      inscricoes: cs.reduce(function (t, c) { return t + c.membros.length; }, 0),
      espera: cs.reduce(function (t, c) { return t + c.espera.length; }, 0),
      vagas: cs.reduce(function (t, c) {
        var v = clubeVagasLivres(c); return t + (v === null ? 0 : v); }, 0),
      pendentes: pendentes
    };
  }

  // ── A CHAMADA DOS ENCONTROS DE CLUBE ─────────────────────────
  //
  // Clube não é turma: não entra na folha, não tem ciclo e não tem
  // tópico obrigatório. Por isso não cabe em `chamadasLista()`, que
  // existe para validar aula de turma. Aqui a chamada serve a uma
  // coisa só: a regra de que duas faltas seguidas abrem a vaga para a
  // primeira da lista de espera.
  //
  // Guardada por clube e por número do encontro (1 a 4), porque o
  // encontro é a unidade que a professora vê na tela — a data pode
  // mudar depois de marcada, e a chamada não deve se perder com ela.
  var CLUBE_CHAMADAS_KEY = "isr_clube_chamadas_v1";
  function clubeChamadasAll() {
    try { return JSON.parse(localStorage.getItem(CLUBE_CHAMADAS_KEY)) || {}; }
    catch (e) { return {}; }
  }
  function clubeChamadasSalvar(m) {
    try { localStorage.setItem(CLUBE_CHAMADAS_KEY, JSON.stringify(m || {})); } catch (e) {}
    agendarSync();
  }
  function chaveEncontro(clubeId, n) { return clubeId + "|" + (parseInt(n, 10) || 0); }
  // { presencas: { pessoaId: "P"|"F" }, data, _v }
  function chamadaDoEncontro(clubeId, n) {
    return clubeChamadasAll()[chaveEncontro(clubeId, n)] || null;
  }
  function salvarChamadaDoClube(clubeId, n, presencas) {
    var c = getClube(clubeId);
    if (!c) return { ok: false, erro: "Clube não encontrado." };
    var num = parseInt(n, 10) || 0;
    if (num < 1) return { ok: false, erro: "Diga de qual encontro é a chamada." };
    var limpo = {};
    (c.membros || []).forEach(function (pid) {
      limpo[pid] = (presencas || {})[pid] === "F" ? "F" : "P";
    });
    var m = clubeChamadasAll();
    var enc = (c.encontros || [])[num - 1] || {};
    m[chaveEncontro(clubeId, num)] = { presencas: limpo,
      data: enc.data || iso(today()), _v: Date.now() };
    clubeChamadasSalvar(m);
    return { ok: true, encontro: num };
  }
  // O próximo encontro é o primeiro com data de hoje em diante que
  // ainda não tem chamada. Sem data em nenhum, não há próximo.
  function proximoEncontroDoClube(c) {
    if (!c) return null;
    var hoje = iso(today());
    var achado = null;
    (c.encontros || []).forEach(function (e, i) {
      if (achado || !e || !e.data) return;
      if (e.data < hoje) return;
      if (chamadaDoEncontro(c.id, i + 1)) return;
      achado = { n: i + 1, data: e.data, hora: e.hora || c.hora || "", tema: e.tema || "" };
    });
    return achado;
  }
  // Duas faltas seguidas, contando só os encontros que já tiveram
  // chamada: é a regra do clube, e é a professora que decide tirar.
  function faltasSeguidasNoClube(clubeId, pessoaId) {
    var c = getClube(clubeId);
    if (!c) return 0;
    var seguidas = 0;
    (c.encontros || []).forEach(function (e, i) {
      var ch = chamadaDoEncontro(clubeId, i + 1);
      if (!ch || !ch.presencas || ch.presencas[pessoaId] === undefined) return;
      if (ch.presencas[pessoaId] === "F") seguidas++; else seguidas = 0;
    });
    return seguidas;
  }

  var BOOKCLUB_KEY = "isr_bookclub_v1";
  function bookclubUrl() {
    try { return localStorage.getItem(BOOKCLUB_KEY) || "https://app.inglessemroteiro.com.br"; }
    catch (e) { return "https://app.inglessemroteiro.com.br"; }
  }
  function setBookclubUrl(url) {
    try { localStorage.setItem(BOOKCLUB_KEY, (url || "").trim()); } catch (e) {}
    agendarSync();
    return bookclubUrl();
  }

  // O Book Club tem uma aula fixa semanal. Os campos são editáveis na
  // Agenda; o app da aluna mostra o encontro com o link de entrar.
  var BOOKCLUB_AULA_KEY = "isr_bookclub_aula_v1";
  var BOOKCLUB_AULA_PADRAO = { dia: "Quinta-feira", horaBR: "07:00", horaNL: "12:00",
    titulo: "Book Club", link: "", descricao: "" };
  function bookclubAula() {
    try {
      var v = JSON.parse(localStorage.getItem(BOOKCLUB_AULA_KEY));
      return v ? Object.assign({}, BOOKCLUB_AULA_PADRAO, v) : Object.assign({}, BOOKCLUB_AULA_PADRAO);
    } catch (e) { return Object.assign({}, BOOKCLUB_AULA_PADRAO); }
  }
  function setBookclubAula(patch) {
    var atual = bookclubAula();
    Object.keys(patch || {}).forEach(function (k) {
      if (patch[k] !== undefined) atual[k] = patch[k];
    });
    try { localStorage.setItem(BOOKCLUB_AULA_KEY, JSON.stringify(atual)); } catch (e) {}
    agendarSync();
    return atual;
  }

  var FLIN_KEY = "isr_flin_url_v1";
  var FLIN_URL_PADRAO = "";

  function flinUrl() {
    try { return localStorage.getItem(FLIN_KEY) || FLIN_URL_PADRAO; } catch (e) { return FLIN_URL_PADRAO; }
  }
  function setFlinUrl(url) {
    try { localStorage.setItem(FLIN_KEY, (url || "").trim()); } catch (e) {}
    agendarSync();
    return flinUrl();
  }

  // dias pode ser um número (acesso por período) ou "sempre" (permanente).
  function liberarFlin(pessoaId, dias) {
    var permanente = dias === "sempre" || dias === true;
    var n = permanente ? 0 : (parseInt(dias, 10) || 7);
    return mutate(pessoaId, function (p) {
      var hoje = today();
      if (permanente) {
        p.flin = { desde: (p.flin && p.flin.desde) || iso(hoje), ate: "", sempre: true };
        pushHist(p, "moedas", "FLIN desbloqueado · acesso permanente");
        return;
      }
      if (p.flin && p.flin.sempre) return; // já é permanente, não regride
      // renovar antes de vencer soma no que resta, não recomeça
      var fim = p.flin && p.flin.ate ? parseISO(p.flin.ate) : null;
      var base = fim && fim > hoje ? fim : hoje;
      var novo = new Date(base); novo.setDate(novo.getDate() + n);
      p.flin = { desde: (p.flin && p.flin.desde) || iso(hoje), ate: iso(novo) };
      pushHist(p, "moedas", "FLIN liberado por " + n + " dias · até " + ddmm(iso(novo)));
    });
  }

  function flinDaAluna(pessoaId) {
    var p = getPessoa(pessoaId);
    var url = flinUrl();
    if (!p || !p.flin) {
      return { ativo: false, permanente: false, temLink: !!url, url: url, diasRestantes: 0, ate: "" };
    }
    if (p.flin.sempre) {
      return { ativo: true, permanente: true, temLink: !!url, url: url,
        diasRestantes: null, ate: "", desde: p.flin.desde };
    }
    if (!p.flin.ate) {
      return { ativo: false, permanente: false, temLink: !!url, url: url, diasRestantes: 0, ate: "" };
    }
    var fim = parseISO(p.flin.ate);
    var dias = fim ? daysBetween(today(), fim) : -1;
    return { ativo: dias >= 0, permanente: false, temLink: !!url, url: url,
      diasRestantes: Math.max(0, dias), ate: p.flin.ate, desde: p.flin.desde };
  }

  function resgatarRecompensa(pessoaId, resgateId) {
    var r = MOEDAS_RESGATES.filter(function (x) { return x.id === resgateId; })[0];
    var p = getPessoa(pessoaId);
    if (!r || !p) return { ok: false };
    var saldo = moedasDe(pessoaId).total;
    if (saldo < r.custo) return { ok: false, faltam: r.custo - saldo };
    var bloqueio = bloqueioDoResgate(pessoaId, r);
    if (bloqueio) return { ok: false, bloqueio: bloqueio };

    addMoedas(pessoaId, -r.custo, "Resgate: " + r.nome);
    var reg = resgatesAll();
    reg.push({ id: "rs" + Date.now(), pessoaId: pessoaId, nome: p.nome,
      resgateId: r.id, premio: r.nome, custo: r.custo, em: iso(today()) });
    resgatesSave(reg);

    // o FLIN é liberado na hora: não precisa de ninguém entregar nada
    if (r.flin) {
      liberarFlin(pessoaId, r.flin);
      return { ok: true, flin: flinDaAluna(pessoaId) };
    }
    // o passe livre é aplicado pelo sistema, não entregue à mão
    if (r.id === "rg11") {
      mutate(pessoaId, function (x) {
        x.passesLivres = (x.passesLivres || 0) + 1;
        pushHist(x, "moedas", "Passe livre resgatado · uma falta do ciclo deixa de contar");
      });
      return { ok: true, passe: true };
    }
    addTarefa({ titulo: "Entregar resgate · " + r.nome + " · " + p.nome,
      dono: "Gabi", prazo: iso(today()), por: p.nome });
    return { ok: true };
  }
  function moedasAjustesAll() {
    try { return JSON.parse(localStorage.getItem(MOEDAS_KEY)) || {}; } catch (e) { return {}; }
  }
  function addMoedas(pessoaId, valor, motivo) {
    var m = moedasAjustesAll();
    m[pessoaId] = m[pessoaId] || [];
    m[pessoaId].push({ id: "mo" + Date.now(), valor: parseInt(valor, 10) || 0, motivo: motivo || "", em: iso(today()) });
    try { localStorage.setItem(MOEDAS_KEY, JSON.stringify(m)); } catch (e) {}
    agendarSync();
    mutate(pessoaId, function (p) {
      var v = parseInt(valor, 10) || 0;
      pushHist(p, "contato", "Moedas: " + (v > 0 ? "+" : "") + v + (motivo ? " · " + motivo : ""));
    });
  }
  function moedasDe(pessoaId) {
    var extrato = [];
    var cham = chamadasAll();
    Object.keys(cham).forEach(function (k) {
      var ch = cham[k];
      if (!ch.presencas || !(pessoaId in ch.presencas)) return;
      var est = estadoPresenca(ch.presencas[pessoaId]);
      var turmaCurta = (ch.turma || "").split(" · ")[0];
      if (est === "presente") extrato.push({ em: ch.data, label: "Presença · " + turmaCurta, valor: MOEDAS_REGRAS.presenca });
      else if (est === "atraso") extrato.push({ em: ch.data, label: "Presença (atraso) · " + turmaCurta, valor: MOEDAS_REGRAS.atraso });
    });
    var p = getPessoa(pessoaId);
    if (p) {
      (p.contratos || []).forEach(function (c) {
        (c.meses || []).forEach(function (m) {
          if (m.pago) extrato.push({ em: "", label: "Parcela de " + m.label + " paga em dia", valor: MOEDAS_REGRAS.parcelaPaga });
        });
      });
      if (p.onboarding && p.onboarding.length && p.onboarding.every(function (c) { return c.feito; }))
        extrato.push({ em: "", label: "Onboarding completo", valor: MOEDAS_REGRAS.onboardingCompleto });
      // Avaliar a aula é o dado que mais falta na escola: hoje nenhuma
      // aluna avalia. Só conta a avaliação que a própria aluna registrou
      // (a professora também pode lançar pulso, e isso não é dela).
      pulsosDe(pessoaId).forEach(function (pl) {
        if (pl.por !== p.nome) return;
        extrato.push({ em: pl.data, label: "Avaliou a aula", valor: MOEDAS_REGRAS.avaliouAula });
      });
      // Renovar o ciclo é o comportamento mais valioso para a escola e
      // era o único que não valia nada.
      (p.contratos || []).forEach(function (c) {
        if ((c.tipo || "") !== "Renovação") return;
        var h = (p.historico || []).filter(function (x) {
          return x.tipo === "renovacao" && /^Renovou/.test(x.texto || "");
        })[0] || {};
        extrato.push({ em: h.data || "", label: "Renovou o ciclo" + (c.ciclos ? " · " + c.ciclos : ""),
          valor: MOEDAS_REGRAS.renovouCiclo });
      });
    }
    programasLista().forEach(function (pg) {
      if ((pg.participantes || []).indexOf(pessoaId) < 0) return;
      for (var s = 1; s <= pg.semanas; s++) {
        if (!etapaFeita(pg, pessoaId, s, "audio")) continue;
        var r = ((pg.respostas || {})[pessoaId + "|" + s]) || {};
        extrato.push({ em: r.em || "", label: "Desafio da semana " + s + " respondido",
          valor: MOEDAS_PROGRAMA.resposta });
      }
      var part = (pg.participacao || {})[pessoaId] || 0;
      if (part) extrato.push({ em: "", label: "Participação no grupo (" + part + ")",
        valor: part * MOEDAS_PROGRAMA.participacao });
    });
    (moedasAjustesAll()[pessoaId] || []).forEach(function (a) {
      extrato.push({ em: a.em, label: a.motivo || (a.valor > 0 ? "Bônus da escola" : "Resgate"), valor: a.valor });
    });
    extrato.sort(function (a, b) { return (b.em || "0000") < (a.em || "0000") ? -1 : 1; });

    // ── validade de 12 meses ──────────────────────────────────
    // Sem validade o saldo cresce para sempre e vira passivo. Expiram os
    // mais antigos primeiro; o que não tem data nunca expira, porque não
    // dá para saber quando foi ganho.
    var corte = addDays(-MOEDAS_VALIDADE_DIAS);
    var avisoDe = addDays(-MOEDAS_VALIDADE_DIAS + 30);
    var expirados = 0, aExpirar = 0, proximaData = "";
    extrato.forEach(function (e) {
      if (e.valor <= 0 || !e.em) return;
      if (e.em < corte) { expirados += e.valor; e.expirado = true; }
      else if (e.em < avisoDe) {
        aExpirar += e.valor;
        var venceEm = somaDias(e.em, MOEDAS_VALIDADE_DIAS);
        if (!proximaData || venceEm < proximaData) proximaData = venceEm;
      }
    });
    var bruto = extrato.reduce(function (acc, e) { return acc + e.valor; }, 0);
    var total = bruto - expirados;
    return { total: total, bruto: bruto, expirados: expirados,
      aExpirar: aExpirar, expiramEm: proximaData,
      validadeDias: MOEDAS_VALIDADE_DIAS,
      extrato: extrato.filter(function (e) { return !e.expirado; }),
      extratoCompleto: extrato };
  }

  // ── RSVP DE AULAS EXTRAS (aluna confirma presença) ────────────
  function rsvpEvento(eventoId, pessoaId, vai) {
    var l = eventosLista();
    l.forEach(function (e) {
      if (e.id === eventoId) { e.rsvps = e.rsvps || {}; e.rsvps[pessoaId] = !!vai; }
    });
    eventosSave(l); return l;
  }

  // ── ALUNA PEDE CORREÇÃO DE TAREFA (vira pendência da equipe) ──
  function solicitarCorrecao(pessoaId, texto) {
    var p = getPessoa(pessoaId);
    if (!p) return;
    var dono = ["Gabi", "Érika", "Carla"].indexOf(p.professora) >= 0 ? p.professora : "Gabi";
    addTarefa({ titulo: "Corrigir tarefa · " + p.nome + (texto ? " — " + texto : ""),
      dono: dono, prazo: iso(today()), por: p.nome });
    mutate(pessoaId, function (pp) {
      pushHist(pp, "contato", "Pediu correção de tarefa" + (texto ? " · " + texto : ""));
    });
  }

  // ── O QUE A ALUNA VÊ DO PRÓPRIO PERCURSO ─────────────────────
  //
  // Até aqui o app da aluna só mostrava o que a escola sabia dela:
  // próxima aula, parcelas, materiais. Nada do que ela mesma fez.
  // As funções abaixo devolvem o percurso dela e as ações que
  // dependem dela — é isso que dá o que fazer entre uma aula e outra.

  // Em que semana do programa estamos hoje (1 .. semanas).
  function semanaDoPrograma(programa, dataIso) {
    if (!programa) return 0;
    var ini = parseISO(programa.inicio);
    var ref = dataIso ? (parseISO(dataIso) || today()) : today();
    if (!ini) return 1;
    var s = Math.floor(daysBetween(ini, ref) / 7) + 1;
    if (s < 1) s = 1;
    if (s > programa.semanas) s = programa.semanas;
    return s;
  }

  function respostaDaSemana(programa, pessoaId, semana) {
    var k = pessoaId + "|" + semana;
    return ((programa.respostas || {})[k]) || null;
  }

  // A aluna responde a missão da semana pelo próprio app. Isso marca a
  // etapa "audio" — a mesma marca que a professora usa na tela Programa —
  // guarda o texto e avisa quem acompanha a turma.
  function responderMissao(programaId, pessoaId, semana, texto) {
    var l = programasLista();
    var achou = null;
    l.forEach(function (pg) {
      if (pg.id !== programaId) return;
      pg.respostas = pg.respostas || {};
      pg.respostas[pessoaId + "|" + semana] = { texto: texto || "", em: iso(today()) };
      pg.progresso = pg.progresso || {};
      var k = pessoaId + "|" + semana;
      pg.progresso[k] = pg.progresso[k] || {};
      pg.progresso[k].audio = iso(today());
      carimbar(pg); achou = pg;
    });
    if (!achou) return null;
    programasSave(l);
    var pessoa = getPessoa(pessoaId);
    if (pessoa) {
      mutate(pessoaId, function (pp) {
        pushHist(pp, "contato", "Respondeu ao desafio da semana " + semana);
      });
    }
    return achou;
  }

  // Tudo o que a aluna precisa saber do programa dela, num objeto só.
  function programaDaAluna(pessoaId) {
    var pg = programasLista().filter(function (x) {
      return (x.participantes || []).indexOf(pessoaId) >= 0;
    })[0];
    if (!pg) return null;
    var semana = semanaDoPrograma(pg);
    var respostas = 0;
    for (var s = 1; s <= pg.semanas; s++) if (etapaFeita(pg, pessoaId, s, "audio")) respostas++;
    var pos = rankingPrograma(pg.id).filter(function (r) { return r.pessoaId === pessoaId; })[0];
    return {
      programa: pg, id: pg.id, nome: pg.nome,
      semana: semana, semanas: pg.semanas,
      missao: (pg.missoes || [])[semana - 1] || "",
      enviada: missaoEnviada(pg, semana),
      respondeu: etapaFeita(pg, pessoaId, semana, "audio"),
      devolutiva: etapaFeita(pg, pessoaId, semana, "feedback"),
      resposta: respostaDaSemana(pg, pessoaId, semana),
      respostas: respostas,
      posicao: pos ? pos.posicao : 0,
      participantes: (pg.participantes || []).length,
      moedas: moedasDoPrograma(pg, pessoaId)
    };
  }

  // A trilha do desafio: uma entrada por semana, com o que foi
  // respondido — alimenta o streak e a jornada no app da aluna
  function trilhaDesafio(pessoaId) {
    var pg = programasLista().filter(function (x) {
      return (x.participantes || []).indexOf(pessoaId) >= 0;
    })[0];
    if (!pg) return null;
    var atual = semanaDoPrograma(pg);
    var semanas = [];
    for (var s = 1; s <= pg.semanas; s++)
      semanas.push({ semana: s, feita: etapaFeita(pg, pessoaId, s, "audio"), atual: s === atual });
    // sequência: semanas respondidas em linha, contando de trás para
    // frente — a semana atual em aberto não quebra a sequência
    var streak = 0;
    for (var i = atual; i >= 1; i--) {
      if (semanas[i - 1].feita) streak++;
      else if (i === atual) continue;
      else break;
    }
    return { semanas: semanas, semanaAtual: atual, total: pg.semanas, streak: streak };
  }

  // A última aula em que ela esteve presente e ainda não avaliou.
  function aulaAAvaliar(pessoaId) {
    var cham = chamadasAll();
    var minhas = [];
    Object.keys(cham).forEach(function (k) {
      var ch = cham[k];
      if (!ch.presencas || !(pessoaId in ch.presencas)) return;
      var est = estadoPresenca(ch.presencas[pessoaId]);
      if (est !== "presente" && est !== "atraso") return;
      minhas.push(ch);
    });
    if (!minhas.length) return null;
    minhas.sort(function (a, b) { return a.data < b.data ? 1 : -1; });
    var ultima = minhas[0];
    var jaAvaliou = pulsosDe(pessoaId).some(function (x) { return x.data >= ultima.data; });
    if (jaAvaliou) return null;
    return { data: ultima.data, turma: ultima.turma || "" };
  }

  // Frequência, sequência de presenças e tempo de casa.
  function jornadaDaAluna(pessoaId) {
    var cham = chamadasAll();
    var minhas = [];
    Object.keys(cham).forEach(function (k) {
      var ch = cham[k];
      if (!ch.presencas || !(pessoaId in ch.presencas)) return;
      minhas.push({ data: ch.data, estado: estadoPresenca(ch.presencas[pessoaId]) });
    });
    minhas.sort(function (a, b) { return a.data < b.data ? 1 : -1; });
    var presentes = minhas.filter(function (x) { return x.estado === "presente" || x.estado === "atraso"; }).length;
    var faltas = minhas.filter(function (x) { return x.estado === "falta"; }).length;
    var sequencia = 0;
    for (var i = 0; i < minhas.length; i++) {
      if (minhas[i].estado === "falta") break;
      sequencia++;
    }
    var p = getPessoa(pessoaId) || {};
    var meses = p.desde ? Math.max(1, Math.round(daysBetween(parseISO(p.desde), today()) / 30)) : 0;
    return {
      aulas: minhas.length, presentes: presentes, faltas: faltas,
      frequencia: minhas.length ? Math.round((presentes / minhas.length) * 100) : 0,
      sequencia: sequencia, meses: meses, desde: p.desde || "",
      ultima: minhas[0] ? minhas[0].data : ""
    };
  }

  // O que ela já pode resgatar e quanto falta para a próxima recompensa.
  function recompensasDaAluna(pessoaId) {
    var saldo = moedasDe(pessoaId).total;
    // Prêmio fechado por regra (tempo de casa, vagas, um por ciclo) sai da
    // conta: não adianta dizer "faltam 315 miles" para algo que miles
    // nenhum destrava hoje.
    var ordenados = MOEDAS_RESGATES.slice()
      .filter(function (r) { return !bloqueioDoResgate(pessoaId, r); })
      .sort(function (a, b) { return a.custo - b.custo; });
    var disponiveis = ordenados.filter(function (r) { return saldo >= r.custo; });
    var bloqueados = ordenados.filter(function (r) { return saldo < r.custo; });
    var prox = bloqueados[0] || null;
    var base = disponiveis.length ? disponiveis[disponiveis.length - 1].custo : 0;
    var pct = 0;
    if (prox) {
      var faixa = prox.custo - base;
      pct = faixa > 0 ? Math.round(Math.min(100, Math.max(0, ((saldo - base) / faixa) * 100))) : 100;
    }
    return { saldo: saldo, disponiveis: disponiveis, bloqueados: bloqueados,
      proxima: prox, faltam: prox ? prox.custo - saldo : 0, pct: prox ? pct : 100 };
  }

  // O catálogo como a aluna o vê: em três níveis, com o motivo de cada
  // prêmio estar fora de alcance. Saldo curto e regra fechada são coisas
  // diferentes — "faltam 80 miles" e "a partir do 2º ciclo" não podem
  // aparecer com a mesma cara.
  function catalogoDaAluna(pessoaId) {
    var m = moedasDe(pessoaId);
    var saldo = m.total;
    var niveis = Object.keys(MOEDAS_NIVEIS).map(function (k) {
      var n = MOEDAS_NIVEIS[k];
      return { id: k, label: n.label, ordem: n.ordem, cor: n.cor, itens: [] };
    }).sort(function (a, b) { return a.ordem - b.ordem; });
    var porId = {};
    niveis.forEach(function (n) { porId[n.id] = n; });

    MOEDAS_RESGATES.slice().sort(function (a, b) { return a.custo - b.custo; })
      .forEach(function (r) {
        var grupo = porId[r.nivel] || porId.facil;
        var bloqueio = bloqueioDoResgate(pessoaId, r);
        var vagas = vagasDoMes(r.id);
        var faltam = Math.max(0, r.custo - saldo);
        grupo.itens.push({
          id: r.id, nome: r.nome, custo: r.custo, cat: MOEDAS_CATS[r.cat] || "",
          detalhe: r.detalhe || "", nivel: grupo.id,
          pode: !bloqueio && faltam === 0,
          faltam: faltam,
          pct: r.custo ? Math.round(Math.min(100, (saldo / r.custo) * 100)) : 100,
          bloqueio: bloqueio, vagas: vagas
        });
      });
    return { saldo: saldo, niveis: niveis.filter(function (n) { return n.itens.length; }),
      aExpirar: m.aExpirar, expiramEm: m.expiramEm, validadeDias: m.validadeDias };
  }

  // ── AGENDA DA ESCOLA (próximos N dias, filtrável) ─────────────
  var DIAS_SEMANA = { MON: 1, TUE: 2, WED: 3, THU: 4, FRI: 5, SAT: 6, SUN: 0,
    SEG: 1, TER: 2, QUA: 3, QUI: 4, SEX: 5 };
  function agendaItens(nDias, inicioIso) {
    nDias = nDias || 14;
    var itens = [];
    var t0 = inicioIso ? (parseISO(inicioIso) || today()) : today();
    function dentro(isoStr) {
      var d = parseISO(isoStr); if (!d) return false;
      var dif = daysBetween(t0, d);
      return dif >= 0 && dif < nDias;
    }
    turmasLista().forEach(function (u) {
      var m = (u.turma || "").toUpperCase().match(/\b(MON|TUE|WED|THU|FRI|SAT|SUN|SEG|TER|QUA|QUI|SEX)\b/);
      if (!m) return;
      var alvo = DIAS_SEMANA[m[1]];
      var hora = ((u.turma || "").match(/(\d{1,2})H/i) || [])[1];
      for (var i = 0; i < nDias; i++) {
        var d = new Date(t0); d.setDate(d.getDate() + i);
        // fora da janela do ciclo não há aula: é o que impede a agenda
        // de inventar terça-feira para sempre depois do ciclo acabar
        // o calendário é o do tipo da turma: a presencial começa e
        // termina em datas próprias, e usar a janela das online punha
        // aula presencial em semana sem aula presencial
        if (d.getDay() === alvo && !ehFeriado(iso(d)) && temAulaEm(iso(d), tipoDaTurma(u))) {
          itens.push({ data: iso(d), hora: hora ? (hora + "h") : "", tipo: "aula", turmaId: u.id,
            titulo: "Aula · " + u.nivel + " (" + u.turma + ")", responsavel: u.teacher || "" });
        }
      }
    });
    feriadosLista().forEach(function (f) {
      var dIni = parseISO(f.data), dFim = parseISO(f.fim || f.data);
      if (!dIni || !dFim) return;
      for (var fd = new Date(dIni); fd <= dFim; fd.setDate(fd.getDate() + 1)) {
        if (dentro(iso(fd)))
          itens.push({ data: iso(fd), hora: "", tipo: "feriado",
            titulo: "Feriado · " + f.nome + " (sem aulas)", responsavel: "" });
      }
    });
    tarefasLista().forEach(function (tf) {
      if (!tf.feita && tf.prazo && dentro(tf.prazo))
        itens.push({ data: tf.prazo, hora: "", tipo: "tarefa", tarefaId: tf.id,
          titulo: "Pendência · " + tf.titulo, responsavel: tf.dono || "" });
    });
    loadPessoas().forEach(function (p) {
      if (p.proximoCheckin && dentro(p.proximoCheckin))
        itens.push({ data: p.proximoCheckin, hora: "", tipo: "checkin",
          titulo: "Check-in · " + p.nome, pessoaId: p.id, responsavel: "Gabi" });
      if (p.proximoFollowup && p.status === "lead" && p.estagio !== "perdido" && dentro(p.proximoFollowup))
        itens.push({ data: p.proximoFollowup, hora: "", tipo: "followup",
          titulo: "Follow-up · " + p.nome, pessoaId: p.id, responsavel: "Carla" });
      (p.onboarding || []).forEach(function (c) {
        if (!c.feito && dentro(c.data))
          itens.push({ data: c.data, hora: "", tipo: "onboarding",
            titulo: "Onboarding · " + p.nome + " · " + c.label, pessoaId: p.id, responsavel: "Érika" });
      });
      var ct = contratoVigente(p);
      if (p.status === "aluna" && ct && ct.fim && dentro(ct.fim))
        itens.push({ data: ct.fim, hora: "", tipo: "renovacao",
          titulo: "Fim de contrato · " + p.nome, pessoaId: p.id, responsavel: "Carla" });
      if (p.reuniao && p.reuniao.data && dentro(p.reuniao.data) && p.status === "lead")
        itens.push({ data: p.reuniao.data, hora: p.reuniao.hora || "", pessoaId: p.id,
          tipo: p.reuniao.feita ? "reuniao_feita" : "reuniao",
          titulo: (p.reuniao.feita ? "Reunião feita · " : "Reunião · ") + p.nome, responsavel: "Carla" });
      if (p.desde && dentro(p.desde) && (p.status === "aluna" || p.status === "mvs"))
        itens.push({ data: p.desde, hora: "", tipo: "matricula", pessoaId: p.id,
          titulo: "Matrícula · " + p.nome, responsavel: "Carla" });
    });
    // aulas particulares marcadas: a agenda da escola só via turma e
    // aula extra, então a aula particular não existia para ninguém
    aulasParticularesAgendadas().forEach(function (ap) {
      if (!dentro(ap.data) || ap.estado === "feita") return;
      itens.push({ data: ap.data, hora: ap.hora, tipo: "particular",
        titulo: "Particular · " + ap.nome + (ap.remarcada ? " · remarcada" : ""),
        pessoaId: ap.pessoaId, aulaId: ap.aulaId, responsavel: ap.professora || "" });
    });
    eventosLista().forEach(function (e) {
      if (dentro(e.data)) {
        var rsvps = Object.keys(e.rsvps || {}).filter(function (k) { return e.rsvps[k]; }).length;
        itens.push({ data: e.data, hora: e.hora, tipo: "aula_extra",
          titulo: "Aula extra · " + e.titulo + (rsvps ? " · " + rsvps + (rsvps === 1 ? " confirmada" : " confirmadas") : ""),
          responsavel: e.responsavel, eventoId: e.id });
      }
    });
    itens.sort(function (a, b) { return (a.data + (a.hora || "")) < (b.data + (b.hora || "")) ? -1 : 1; });
    return itens;
  }

  function gcalLink(titulo, dataIso, horaStr, detalhes) {
    var d = (dataIso || "").replace(/-/g, "");
    var h = parseInt((horaStr || "").replace(/\D/g, ""), 10);
    var ini, fim;
    if (!isNaN(h)) {
      var p2 = function (n) { return (n < 10 ? "0" : "") + n; };
      ini = d + "T" + p2(h) + "0000"; fim = d + "T" + p2(h + 1) + "0000";
    } else { ini = d; fim = d; }
    return "https://calendar.google.com/calendar/render?action=TEMPLATE&text=" + encodeURIComponent(titulo) +
      "&dates=" + ini + "/" + fim + "&details=" + encodeURIComponent(detalhes || "Inglês sem Roteiro");
  }

  // ── COMEÇAR DO ZERO ───────────────────────────────────────────
  //
  // O app nasce com um exemplo dentro para ninguém ver tela vazia e não
  // entender nada. Na hora de pôr os dados reais, esse exemplo atrapalha:
  // some misturado com o que é verdade. Aqui ele é apagado de uma vez.
  //
  // Duas profundidades, porque o que a escola configurou (equipe, regras
  // de pagamento, faixas de comissão, modelos de mensagem) custou tempo e
  // não é exemplo. Antes de qualquer coisa, uma cópia de segurança.
  var CHAVES_CONTEUDO = [
    PESSOAS_KEY, "isr_fila_adiados", "isr_turmas_v1", "isr_eventos_v1",
    "isr_chamadas_v1", "isr_tarefas_v1", "isr_moedas_v1", "isr_lancamentos_v1",
    "isr_toques_v1", "isr_pulsos_v1", "isr_programas_v1", "isr_avisos_v1",
    "isr_custos_v1", "isr_resgates_v1", "isr_folha_paga_v1", "isr_acessos_v1",
    "isr_extrato_reg_v1", "isr_orcamento_v1"
  ];
  var CHAVES_CONFIG = [
    "isr_equipe_v1", "isr_templates_v1", "isr_metas_v1", "isr_calc_v1",
    "isr_cambio_v1", "isr_precos_v1", "isr_ticket_alvo_v1", "isr_cadencia_v1",
    "isr_categorias_saida_v1", "isr_feriados_v1", "isr_comissao_faixas_v1",
    "isr_metas_periodo_v1", "isr_minutos_aula_v1", "isr_pagamento_v1",
    "isr_capacidade_v1", "isr_flin_url_v1", "isr_contas_proprias_v1",
    "isr_jotform_v1", "isr_jotform_base_v1", "isr_gravadas_v1", "isr_booking_v1", "isr_systeme_v1",
    "isr_furos_ok_v1", "isr_bookclub_v1", "isr_bookclub_aula_v1"
  ];

  function comecarDoZero(opts) {
    opts = opts || {};
    criarBackup(opts.tudo ? "antes de apagar tudo" : "antes de limpar o exemplo");

    CHAVES_CONTEUDO.forEach(function (k) {
      try { localStorage.removeItem(k); } catch (e) {}
    });
    if (opts.tudo) {
      CHAVES_CONFIG.forEach(function (k) {
        try { localStorage.removeItem(k); } catch (e) {}
      });
    }
    // A marca de semeadura fica gravada mesmo com tudo vazio: sem ela o
    // exemplo volta sozinho no próximo carregamento da página.
    try {
      localStorage.setItem(SEED_FLAG, "1");
      localStorage.setItem(PESSOAS_KEY, "[]");
      localStorage.setItem("isr_turmas_v1", "[]");
      // Apagar tudo não pode apagar quem entra no sistema: sem a fundadora
      // ninguém consegue abrir o app de novo.
      if (opts.tudo) {
        var eu = gestaoUser() || {};
        localStorage.setItem("isr_equipe_v1", JSON.stringify([
          { id: "eqGabi", nome: eu.nome || "Gabi",
            email: eu.email || "gabisouza.prof@gmail.com",
            papeis: ["gestora", "professora"], fundadora: true,
            valorTipo: "", valor: 0, moeda: "R$" }
        ]));
      }
    } catch (e) {}
    agendarSync();
    return { ok: true, tudo: !!opts.tudo };
  }

  // Quanto tem de exemplo dentro hoje. Serve para a tela dizer o que vai
  // sumir antes de a pessoa clicar.
  function oQueTemDentro() {
    var pessoas = loadPessoas();
    return {
      pessoas: pessoas.length,
      alunas: pessoas.filter(function (p) { return p.status === "aluna"; }).length,
      leads: pessoas.filter(function (p) { return p.status === "lead"; }).length,
      turmas: turmasLista().length,
      equipe: equipeLista().length,
      custos: custosLista().length,
      chamadas: Object.keys(chamadasAll()).length,
      tarefas: tarefasLista().length
    };
  }

  function resetDemo() {
    localStorage.removeItem(SEED_FLAG);
    localStorage.removeItem(PESSOAS_KEY);
    localStorage.removeItem("isr_fila_adiados");
    localStorage.removeItem(TURMAS_KEY);
    localStorage.removeItem(EVENTOS_KEY);
    localStorage.removeItem(CHAMADAS_KEY);
    localStorage.removeItem(TAREFAS_KEY);
    localStorage.removeItem(FERIADOS_KEY);
    localStorage.removeItem(METAS_KEY);
    localStorage.removeItem(MOEDAS_KEY);
    localStorage.removeItem(EQUIPE_KEY);
    localStorage.removeItem(CALC_KEY);
    localStorage.removeItem(CUSTOS_KEY);
    ensureSeed();
  }

  // ══════════════════════════════════════════════════════════════
  //  FINANCEIRO — o mês inteiro: de onde entrou, para onde foi,
  //  se bateu a meta e o que ainda se espera.
  //
  //  Três leituras que NUNCA se misturam num número só:
  //    realizado  → o que de fato entrou e saiu (regime de caixa)
  //    a receber  → contratos ativos que ainda vão cair
  //    em risco   → parcela vencida e não paga
  //  E dois pisos de referência: ponto de equilíbrio (= tudo que
  //  sai no mês) e meta de faturamento (o que a Gabi definiu).
  // ══════════════════════════════════════════════════════════════
  var CAT_ENTRADA = [
    { id: "grupo",      label: "Turmas em grupo",      cor: "#348a8e" },
    { id: "particular", label: "Aulas particulares",   cor: "#6b5b95" },
    { id: "mvs",        label: "MVS · autoguiado",     cor: "#2a9d8f" },
    { id: "programa",   label: "Acompanhamento",       cor: "#e07856" },
    { id: "assinatura", label: "Assinatura",           cor: "#c98a2e" },
    { id: "sinal",      label: "Sinais de matrícula",  cor: "#9ec970" },
    { id: "extra",      label: "Aulas extras",         cor: "#d4a574" },
    { id: "outra",      label: "Outras receitas",      cor: "#b8ada0" }
  ];
  // As cinco de fábrica cobrem o começo, mas cada escola tem as suas —
  // aluguel, contabilidade, material. Categorias criadas ficam guardadas
  // e aparecem em toda a tela do Caixa.
  var CAT_SAIDA_PADRAO = [
    { id: "equipe",      label: "Equipe",           cor: "#348a8e" },
    { id: "ferramentas", label: "Ferramentas",      cor: "#6b5b95" },
    { id: "marketing",   label: "Marketing",        cor: "#e07856" },
    { id: "impostos",    label: "Impostos e taxas", cor: "#9c6f56" },
    { id: "outros",      label: "Outros",           cor: "#b8ada0" }
  ];
  // ── CONTAS DO CAIXA ───────────────────────────────────────────
  //
  // O dinheiro da escola chega em quatro lugares diferentes — Asaas,
  // Stripe, Wise e bunq — e o Caixa somava tudo num balaio só. Sem saber
  // por onde entrou, não dá para conferir com o extrato de cada banco
  // nem responder "quanto tem em cada conta".
  //
  // A lista vem preenchida com as quatro; quem usa menos apaga, quem usa
  // outra acrescenta.
  var CONTAS_KEY = "isr_contas_v1";
  // Os apelidos são como a conta aparece no extrato DAS OUTRAS. O
  // repasse do Stripe cai no bunq descrito como "STRIPE PAYMENTS UK": se
  // o sistema não reconhecer, conta o mesmo dinheiro duas vezes — uma no
  // Stripe, quando a aluna pagou, e outra no bunq, quando o repasse caiu.
  var CONTAS_PADRAO = [
    { id: "asaas",  nome: "Asaas",  moeda: "R$", apelidos: ["asaas"] },
    { id: "stripe", nome: "Stripe", moeda: "\u20ac", apelidos: ["stripe"] },
    { id: "wise",   nome: "Wise",   moeda: "\u20ac", apelidos: ["wise", "transferwise"] },
    { id: "bunq",   nome: "bunq",   moeda: "\u20ac", apelidos: ["bunq"] }
  ];
  function contasLista() {
    try {
      var g = JSON.parse(localStorage.getItem(CONTAS_KEY));
      if (g && g.length) return g;
    } catch (e) {}
    return CONTAS_PADRAO.slice();
  }
  function contasSave(l) {
    try { localStorage.setItem(CONTAS_KEY, JSON.stringify(l)); } catch (e) {}
    agendarSync();
    return l;
  }
  function contaMeta(id) {
    var l = contasLista();
    for (var i = 0; i < l.length; i++) if (l[i].id === id) return l[i];
    return null;
  }
  function contaLabel(id) {
    var c = contaMeta(id);
    return c ? c.nome : "";
  }
  function addConta(nome, moeda) {
    var limpo = (nome || "").trim();
    if (!limpo) return null;
    var id = slugCategoria(limpo);
    if (!id || contaMeta(id)) return null;
    var l = contasLista();
    l.push({ id: id, nome: limpo, moeda: moeda === "\u20ac" ? "\u20ac" : "R$",
      apelidos: [semAcento(limpo)] });
    contasSave(l);
    return l[l.length - 1];
  }
  function removeConta(id) {
    // conta com movimento não some: os lançamentos ficariam sem origem
    var emUso = lancamentosLista().some(function (l) { return l.conta === id; });
    if (emUso) return { removida: false, motivo: "em_uso" };
    contasSave(contasLista().filter(function (c) { return c.id !== id; }));
    return { removida: true };
  }
  // Poupança não é caixa para operar. Marcada como reserva, a conta sai do
  // total do dia a dia e entra no que a escola conseguiu guardar.
  function setContaReserva(id, sim) {
    var l = contasLista();
    l.forEach(function (c) { if (c.id === id) c.reserva = !!sim; });
    contasSave(l);
    return contaMeta(id);
  }

  var CAT_EXTRA_KEY = "isr_categorias_saida_v1";
  var CORES_CATEGORIA = ["#5a9e4b", "#c98060", "#7b8fa8", "#a4785f", "#5e8f8f",
    "#8f6f9e", "#b0722c", "#7a9e6b", "#9e6b7a", "#6b7a9e"];
  function catSaidaExtras() {
    try { return JSON.parse(localStorage.getItem(CAT_EXTRA_KEY)) || []; } catch (e) { return []; }
  }
  function catsSaida() { return CAT_SAIDA_PADRAO.concat(catSaidaExtras()); }
  function slugCategoria(nome) {
    return (nome || "").toLowerCase().trim()
      .normalize ? (nome || "").toLowerCase().trim().normalize("NFD").replace(/[\u0300-\u036f]/g, "")
        .replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "")
      : (nome || "").toLowerCase().replace(/[^a-z0-9]+/g, "_");
  }
  function addCategoriaSaida(nome) {
    var limpo = (nome || "").trim();
    if (!limpo) return null;
    var id = slugCategoria(limpo);
    if (!id) return null;
    if (catsSaida().some(function (c) { return c.id === id; })) return null;
    var extras = catSaidaExtras();
    extras.push({ id: id, label: limpo, cor: CORES_CATEGORIA[extras.length % CORES_CATEGORIA.length], criada: true });
    try { localStorage.setItem(CAT_EXTRA_KEY, JSON.stringify(extras)); } catch (e) {}
    agendarSync();
    return extras[extras.length - 1];
  }
  function removeCategoriaSaida(id) {
    // categoria em uso não some: os lançamentos ficariam órfãos
    var emUso = custosLista().some(function (c) { return c.categoria === id; })
      || lancamentosLista().some(function (l) { return l.categoria === id; });
    if (emUso) return { removida: false, motivo: "em_uso" };
    var extras = catSaidaExtras().filter(function (c) { return c.id !== id; });
    try { localStorage.setItem(CAT_EXTRA_KEY, JSON.stringify(extras)); } catch (e) {}
    agendarSync();
    return { removida: true };
  }
  // mantém o nome antigo para quem já consome a lista
  var CAT_SAIDA = CAT_SAIDA_PADRAO;
  function catMeta(lista, id) {
    for (var i = 0; i < lista.length; i++) if (lista[i].id === id) return lista[i];
    return lista[lista.length - 1];
  }

  // ── LANÇAMENTOS AVULSOS ───────────────────────────────────────
  // O que o mês teve de específico: o notebook novo, a contadora,
  // um workshop avulso. É o que faltava pra "para onde foi" deixar
  // de ser sempre a mesma lista de custos fixos.
  var LANC_KEY = "isr_lancamentos_v1";
  // Lançamento apagado vira lápide {id, apagado, _v}: o merge do sync soma
  // listas por id, então um filtro simples ressuscitava o item no próximo
  // puxe — apagar uma receita no Caixa "não pegava".
  function lancamentosRaw() {
    try { return JSON.parse(localStorage.getItem(LANC_KEY)) || []; } catch (e) { return []; }
  }
  function lancamentosLista() {
    return lancamentosRaw().filter(function (l) { return !(l && l.apagado); });
  }
  function lancamentosSave(l) {
    var lapides = lancamentosRaw().filter(function (x) { return x && x.apagado; });
    carimbarLista(l);
    try { localStorage.setItem(LANC_KEY, JSON.stringify(l.concat(lapides))); } catch (e) {}
    agendarSync();
  }
  function addLancamento(dados) {
    var l = lancamentosLista();
    l.push({ id: "lc" + Date.now() + Math.floor(Math.random() * 1000),
      data: dados.data || iso(today()),
      // "retirada" é dinheiro saindo para conta da própria dona: não é
      // despesa da escola, não muda o lucro, mas saiu do caixa e precisa
      // ser visto
      tipo: dados.tipo === "entrada" ? "entrada"
        : (dados.tipo === "retirada" ? "retirada" : "saida"),
      categoria: dados.categoria || (dados.tipo === "entrada" ? "outra" : "outros"),
      descricao: dados.descricao || "Lançamento",
      moeda: dados.moeda || "R$",
      // link da fatura ou comprovante (arquivo no Drive) — abre direto do Caixa
      fatura: (dados.fatura || "").trim(),
      // por onde o dinheiro entrou ou saiu (Asaas, Stripe, Wise, bunq)
      conta: (dados.conta || "").trim(),
      // de quem é este dinheiro, quando é de alguém: pagamento à vista
      // não tem parcela, mas tem dona
      pessoaId: (dados.pessoaId || "").trim(),
      valor: typeof dados.valor === "number" ? dados.valor : parseMoney(dados.valor) });
    lancamentosSave(l);
    return l;
  }
  function removeLancamento(id) {
    var l = lancamentosRaw().map(function (x) {
      return x.id === id ? { id: x.id, apagado: iso(today()), _v: Date.now() } : x;
    });
    try { localStorage.setItem(LANC_KEY, JSON.stringify(l)); } catch (e) {}
    agendarSync();
    return lancamentosLista();
  }
  // Editar um lançamento sem apagar e redigitar: categoria errada e valor
  // errado são os dois jeitos mais comuns de um número contar dobrado.
  function updateLancamento(id, patch) {
    var l = lancamentosLista();
    for (var i = 0; i < l.length; i++) {
      if (l[i].id !== id) continue;
      if (patch.descricao !== undefined && patch.descricao !== "") l[i].descricao = patch.descricao;
      if (patch.categoria !== undefined && patch.categoria !== "") l[i].categoria = patch.categoria;
      if (patch.data !== undefined && patch.data !== "") l[i].data = patch.data;
      if (patch.moeda !== undefined && patch.moeda !== "") l[i].moeda = patch.moeda;
      if (patch.fatura !== undefined && patch.fatura !== "") l[i].fatura = patch.fatura.trim();
      if (patch.conta !== undefined && patch.conta !== "") l[i].conta = patch.conta;
      if (patch.valor !== undefined && patch.valor !== "") {
        var v = typeof patch.valor === "number" ? patch.valor : parseMoney(patch.valor);
        if (v) l[i].valor = v;
      }
      carimbar(l[i]);
      break;
    }
    lancamentosSave(l);
    return l;
  }
  function lancamentosDoMes(key) {
    return lancamentosLista().filter(function (l) { return (l.data || "").slice(0, 7) === key; });
  }

  // ── CÂMBIO (só pra ter UMA leitura do todo; nunca some sozinho) ─
  var CAMBIO_KEY = "isr_cambio_v1";
  function taxaCambio() {
    try { var v = parseFloat(localStorage.getItem(CAMBIO_KEY)); if (v > 0) return v; } catch (e) {}
    return 6.2;
  }
  function setTaxaCambio(v) {
    var n = typeof v === "number" ? v : parseFloat(String(v).replace(",", "."));
    if (n > 0) { try { localStorage.setItem(CAMBIO_KEY, String(n)); } catch (e) {} agendarSync(); }
    return taxaCambio();
  }
  function emReais(por) { return (por["R$"] || 0) + (por["€"] || 0) * taxaCambio(); }

  // ── META DE FATURAMENTO ───────────────────────────────────────
  function metaDoMes(key) {
    var m = metasAtuais();
    var base = m.faturamento || { "R$": 0, "€": 0 };
    var ov = (m.faturamentoMes || {})[key] || {};
    return { "R$": ov["R$"] != null ? ov["R$"] : (base["R$"] || 0),
             "€":  ov["€"]  != null ? ov["€"]  : (base["€"]  || 0) };
  }
  function setMetaMes(key, moeda, valor) {
    var m = metasAtuais();
    var mm = Object.assign({}, m.faturamentoMes || {});
    mm[key] = Object.assign({}, mm[key] || {});
    mm[key][moeda] = typeof valor === "number" ? valor : parseMoney(valor);
    return setMetas({ faturamentoMes: mm });
  }
  function setMetaPadrao(moeda, valor) {
    var f = Object.assign({}, metasAtuais().faturamento || {});
    f[moeda] = typeof valor === "number" ? valor : parseMoney(valor);
    return setMetas({ faturamento: f });
  }

  // ── MESES EM TORNO DE HOJE (não uma lista fixa) ───────────────
  var MES_NOMES = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
    "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];
  function mesOffset(n) {
    var d = new Date(); d.setDate(1); d.setMonth(d.getMonth() + n);
    var p = function (x) { return (x < 10 ? "0" : "") + x; };
    return { key: d.getFullYear() + "-" + p(d.getMonth() + 1),
      label: MES_NOMES[d.getMonth()] + " de " + d.getFullYear(),
      curto: MES_NOMES[d.getMonth()].slice(0, 3) + "/" + String(d.getFullYear()).slice(2),
      offset: n };
  }
  // "2026-08" → "Agosto"
  function mesLabelDe(key) {
    var m = parseInt(String(key || "").slice(5, 7), 10);
    return (m >= 1 && m <= 12) ? MES_NOMES[m - 1] : String(key || "");
  }
  function mesesFinanceiro(back, fwd) {
    var out = [];
    for (var i = -Math.abs(back); i <= Math.abs(fwd); i++) out.push(mesOffset(i));
    return out;
  }

  // ── O MÊS INTEIRO ─────────────────────────────────────────────
  function financeiroMes(key) {
    var hoje = iso(today());
    var entradas = [];

    loadPessoas().forEach(function (p) {
      // a categoria vem do que a pessoa é, não do contrato
      var ehParticular = !!p.particular || /^particular/i.test(p.turma || "");
      var catPessoa = p.status === "mvs" ? "mvs" : (ehParticular ? "particular" : "grupo");
      // Quem saiu não gera receita futura. O que já venceu continua
      // valendo (quem saiu devendo ainda deve); o que ainda ia vencer
      // não é receita de ninguém. Vale para toda forma de saída —
      // encerramento, lead perdido ou registro antigo sem marcação.
      var ativa = ["aluna", "mvs", "pausada", "programa"].indexOf(p.status) >= 0
        && p.estagio !== "perdido";
      var futuroDeQuemSaiu = function (pago, venc) { return !ativa && !pago && venc >= hoje; };
      (p.contratos || []).forEach(function (c) {
        var moeda = c.moeda || p.moeda || "R$";
        (c.meses || []).forEach(function (m) {
          if (m.key !== key || !m.valor) return;
          // Parcela cancelada no encerramento não é receita: ninguém
          // vai cobrar quem saiu por um mês que ela não vai cursar.
          // Sem isto, quem cancelou continuava aparecendo a receber.
          if (m.cancelada && !m.pago) return;
          var dia = parseInt(c.vencDia, 10); if (isNaN(dia)) dia = 10;
          var venc = key + "-" + (dia < 10 ? "0" : "") + dia;
          if (futuroDeQuemSaiu(m.pago, venc)) return;
          // O combinado e o que caiu na conta são coisas diferentes. O
          // gateway desconta a taxa dele e, no Stripe, ainda converte a
          // mensalidade em real para euro. Enquanto ninguém conciliou, o
          // combinado é a melhor estimativa que existe. Depois de
          // conciliada, manda o extrato: contar o valor de face de uma
          // parcela que caiu menor é contar dinheiro que a escola não tem.
          var vFace = parseMoney(m.valor), vReal = vFace, mReal = moeda, taxa = 0;
          if (m.pago && m.valorRecebido > 0) {
            vReal = m.valorRecebido;
            mReal = m.moedaRecebida || moeda;
            // só dá para chamar de taxa o que sumiu dentro da mesma moeda;
            // entre moedas a diferença é câmbio do gateway, não taxa
            if (mReal === moeda) taxa = Math.max(0, vFace - vReal);
          }
          entradas.push({ pessoaId: p.id, nome: p.nome,
            categoria: catPessoa,
            detalhe: p.turma || (c.tipo || ""),
            moeda: mReal, valor: vReal, valorLabel: fmtMoney(mReal, vReal),
            combinado: vFace, moedaCombinada: moeda, taxa: taxa,
            pago: !!m.pago, venc: venc, atrasada: !m.pago && venc < hoje,
            // "pago" e "visto no extrato" são coisas diferentes. Só a
            // conciliação escreve pagoEm/idExterno: marcar na mão não
            // prova que o dinheiro caiu.
            confirmado: !!(m.pagoEm || m.idExterno),
            conta: m.conta || "" });
        });
        // O sinal tem data própria: o combinado pode ser recebê-lo num mês
        // e a primeira parcela no seguinte. Sem isso ele caía sempre no mês
        // da matrícula, mesmo vencendo depois.
        var sinalVenc = (c.sinal && c.sinal.venc) || p.desde;
        if (c.sinal && c.sinal.valor && !c.sinal.cancelada && (sinalVenc || "").slice(0, 7) === key
            && !futuroDeQuemSaiu(c.sinal.recebido, sinalVenc)) {
          entradas.push({ pessoaId: p.id, nome: p.nome, categoria: "sinal",
            detalhe: c.sinal.abatido ? "Sinal · primeira parte da parcela" : "Sinal de matrícula",
            moeda: moeda,
            valor: parseMoney(c.sinal.valor), valorLabel: c.sinal.valor,
            pago: !!c.sinal.recebido, venc: sinalVenc,
            confirmado: !!c.sinal.conciliado,
            atrasada: !c.sinal.recebido && sinalVenc < hoje });
        }
      });

      // ── RECORRENTES: assinatura e acompanhamento ──────────────
      // Não têm parcela em contrato — a cobrança se repete todo mês
      // enquanto o produto vale. Sem isto, a receita recorrente da
      // escola não aparecia no Caixa: o resultado do mês ignorava
      // tudo que entra pelo systeme.
      [{ obj: p.assinatura, cat: "assinatura", rotulo: "Assinatura",
         fim: p.assinatura && p.assinatura.encerrada },
       { obj: p.programa, cat: "programa",
         rotulo: (p.programa && p.programa.nome) || "Acompanhamento",
         fim: p.programa && p.programa.encerrado }].forEach(function (r) {
        var o = r.obj;
        if (!o || !o.valor) return;
        var ini = String(o.inicio || o.desde || "").slice(0, 10);
        if (!ini || ini.slice(0, 7) > key) return;
        // o mês do encerramento ainda conta: quando a pessoa cancela, a
        // cobrança daquele ciclo já tinha acontecido
        if (r.fim && String(r.fim).slice(0, 7) < key) return;
        // dia da cobrança = dia em que começou (limitado para não cair
        // num dia que o mês não tem)
        var dia = parseInt(ini.slice(8, 10), 10) || 1;
        if (dia > 28) dia = 28;
        var venc = key + "-" + (dia < 10 ? "0" : "") + dia;
        if (futuroDeQuemSaiu(venc <= hoje, venc)) return;
        entradas.push({ pessoaId: p.id, nome: p.nome, categoria: r.cat,
          detalhe: r.rotulo + " · cobrança automática",
          moeda: o.moeda || p.moeda || "€",
          valor: parseMoney(o.valor), valorLabel: o.valor,
          // cobrança automática: passou o dia, entrou — a não ser que o
          // gateway tenha avisado que ela não passou naquele mês
          pago: venc <= hoje && !(o.falhou && o.falhou.slice(0, 7) === key),
          venc: venc,
          atrasada: !!(o.falhou && o.falhou.slice(0, 7) === key && venc <= hoje),
          // presumida por natureza: o dia passou e ninguém avisou que
          // falhou. Vira confirmada quando a linha aparece no extrato e
          // você marca como conferida.
          confirmado: !!(o.confirmados && o.confirmados[key]),
          recorrente: true });
      });
    });

    var lancs = lancamentosDoMes(key);
    // Retirada para conta própria não é despesa da escola — não muda o
    // lucro — mas é dinheiro que saiu da conta. Some do resultado e
    // aparece com nome próprio.
    var retiradas = { "R$": 0, "€": 0 };
    lancs.filter(function (l) { return l.tipo === "retirada"; }).forEach(function (l) {
      retiradas[l.moeda] = (retiradas[l.moeda] || 0) + l.valor;
    });
    lancs.filter(function (l) { return l.tipo === "entrada"; }).forEach(function (l) {
      entradas.push({ pessoaId: l.pessoaId || "", nome: l.descricao, categoria: l.categoria || "outra",
        detalhe: "Lançamento", moeda: l.moeda, valor: l.valor,
        valorLabel: fmtMoney(l.moeda, l.valor), pago: true, venc: l.data,
        atrasada: false, lancId: l.id, conta: l.conta || "",
        // lançamento com conta veio do extrato ou foi copiado dele
        confirmado: !!l.conta });
    });

    // A despesa tem o mesmo problema da receita: custo fixo e folha entram
    // calculados, sem ninguém ter visto o dinheiro sair. Só o lançamento
    // com conta e a folha já quitada têm linha de banco atrás.
    var saidas = custosDoMes(key).map(function (c) {
      return { nome: c.nome, categoria: c.categoria || "outros", moeda: c.moeda,
        valor: c.valor, fixo: true, confirmado: false };
    }).concat(folhaNoCaixa(key).map(function (x) {
      // a mesma régua da receita: "conferido" é ter linha de banco atrás.
      // Marcar a folha como paga na tela de Pagamentos registra a intenção,
      // não o extrato — e antes isso já contava como conferido, deixando a
      // despesa mais provada que a receita sem nenhum motivo.
      return Object.assign({}, x, { confirmado: !!x.vistoNoExtrato });
    })).concat(lancs.filter(function (l) { return l.tipo === "saida"; }).map(function (l) {
      return { nome: l.descricao, categoria: l.categoria || "outros", moeda: l.moeda,
        valor: l.valor, fixo: false, data: l.data, lancId: l.id, fatura: l.fatura || "",
        conta: l.conta || "", confirmado: !!l.conta };
    }));

    // ordena: atrasada primeiro (é o que precisa de ação), depois em aberto, depois pago
    entradas.sort(function (a, b) {
      var peso = function (e) { return e.atrasada ? 0 : (e.pago ? 2 : 1); };
      return peso(a) - peso(b) || b.valor - a.valor;
    });
    saidas.sort(function (a, b) { return b.valor - a.valor; });

    var zero = function () { return { "R$": 0, "€": 0 }; };
    var recebido = zero(), aReceber = zero(), atrasado = zero(), saiu = zero();
    var porCatEntrada = {}, porCatSaida = {};
    var acumula = function (mapa, cat, moeda, v) {
      if (!mapa[cat]) mapa[cat] = zero();
      mapa[cat][moeda] += v;
    };
    // por onde o dinheiro passou: uma linha por conta, com o que entrou
    // e o que saiu de cada uma. É o que permite conferir com o extrato
    // de cada banco, em vez de somar quatro contas num número só.
    var porConta = {};
    var naConta = function (id) {
      var k = id || "sem_conta";
      if (!porConta[k]) porConta[k] = { id: k, entrou: zero(), saiu: zero() };
      return porConta[k];
    };
    entradas.forEach(function (e) { if (e.pago) naConta(e.conta).entrou[e.moeda] += e.valor; });
    saidas.forEach(function (x) { naConta(x.conta).saiu[x.moeda] += x.valor; });
    // Quanto do que está contado como recebido tem uma linha de banco
    // atrás. O resto é presunção: parcela marcada na mão e cobrança
    // automática que ninguém conferiu. Somar os dois num número só é o
    // que faz o mês fechar com lucro que não existe.
    var confirmado = zero(), presumido = zero();
    // o que o gateway ficou pelo caminho: a diferença entre o combinado e o
    // que caiu, nas parcelas já conciliadas. Não é despesa lançada — já está
    // descontada da entrada —, é o custo de receber, que ninguém via.
    var taxasGateway = zero();
    entradas.forEach(function (e) {
      if (e.pago) {
        recebido[e.moeda] += e.valor; acumula(porCatEntrada, e.categoria, e.moeda, e.valor);
        if (e.taxa > 0) taxasGateway[e.moeda] += e.taxa;
        if (e.confirmado) confirmado[e.moeda] += e.valor;
        else presumido[e.moeda] += e.valor;
      }
      else if (e.atrasada) atrasado[e.moeda] += e.valor;
      else aReceber[e.moeda] += e.valor;
    });
    var saiuConfirmado = zero(), saiuPresumido = zero();
    saidas.forEach(function (s) {
      saiu[s.moeda] += s.valor; acumula(porCatSaida, s.categoria, s.moeda, s.valor);
      if (s.confirmado) saiuConfirmado[s.moeda] += s.valor;
      else saiuPresumido[s.moeda] += s.valor;
    });

    var meta = metaDoMes(key);
    var faturado = { "R$": recebido["R$"], "€": recebido["€"] };
    var previsto = { "R$": recebido["R$"] + aReceber["R$"] + atrasado["R$"],
                     "€": recebido["€"] + aReceber["€"] + atrasado["€"] };
    var pct = function (a, b) { return b > 0 ? Math.round(100 * a / b) : (a > 0 ? 100 : 0); };

    return {
      key: key, entradas: entradas, saidas: saidas,
      porCatEntrada: porCatEntrada, porCatSaida: porCatSaida, porConta: porConta,
      recebido: recebido, aReceber: aReceber, atrasado: atrasado, saiu: saiu,
      confirmado: confirmado, presumido: presumido,
      saiuConfirmado: saiuConfirmado, saiuPresumido: saiuPresumido,
      retiradas: retiradas, taxasGateway: taxasGateway,
      previsto: previsto,
      // sobra de verdade (o que entrou menos o que saiu) e sobra se tudo cair
      resultado: { "R$": recebido["R$"] - saiu["R$"], "€": recebido["€"] - saiu["€"] },
      resultadoPrevisto: { "R$": previsto["R$"] - saiu["R$"], "€": previsto["€"] - saiu["€"] },
      // ponto de equilíbrio = tudo que sai. Abaixo disso o mês dá prejuízo.
      pontoEquilibrio: { "R$": saiu["R$"], "€": saiu["€"] },
      meta: meta,
      pctMeta: { "R$": pct(faturado["R$"], meta["R$"]), "€": pct(faturado["€"], meta["€"]) },
      faltaMeta: { "R$": Math.max(0, meta["R$"] - faturado["R$"]), "€": Math.max(0, meta["€"] - faturado["€"]) },
      pctEquilibrio: pct(emReais(recebido), emReais(saiu)),
      totalReais: { recebido: emReais(recebido), aReceber: emReais(aReceber),
        atrasado: emReais(atrasado), saiu: emReais(saiu), meta: emReais(meta),
        confirmado: emReais(confirmado), presumido: emReais(presumido),
        saiuConfirmado: emReais(saiuConfirmado), saiuPresumido: emReais(saiuPresumido),
        retiradas: emReais(retiradas), taxasGateway: emReais(taxasGateway),
        resultado: emReais(recebido) - emReais(saiu),
        // O número que não pode enganar: só o dinheiro que entrou de
        // verdade, menos TUDO que a escola já sabe que paga no mês —
        // inclusive a folha e o custo fixo que ainda não passaram pelo
        // banco. Errar para menos é seguro; errar para mais vira decisão
        // tomada com dinheiro que não existe.
        resultadoPrudente: emReais(confirmado) - emReais(saiu),
        // o mês contando só o que passou pelo banco, dos dois lados: é o
        // número que pode ser conferido linha por linha no extrato
        resultadoConfirmado: emReais(confirmado) - emReais(saiuConfirmado) }
    };
  }

  // ── A FOLHA COMO SAÍDA DO CAIXA ───────────────────────────────
  //
  // O maior custo da escola é o pagamento de quem dá aula, e ele é
  // calculado — não é um número que alguém digita. Enquanto o Caixa só
  // somava custos digitados à mão, o resultado do mês era o resultado de
  // um chute. Aqui a folha entra como saída automática, linha por linha,
  // na moeda da folha.
  //
  // Cuidado com dupla contagem: folhaPagamento().fixos já traz quem tem
  // valor mensal no cadastro da Equipe, que é exatamente o que
  // equipeCustosMensais() devolvia. Quem chama esta função não deve somar
  // as duas coisas.
  function folhaNoCaixa(key) {
    var k = key || mesAtualKey();
    var cfg = configPagamento();
    var moeda = cfg.moeda || "R$";
    var f = folhaPagamento(k);
    var out = [];

    // A folha é calculada numa moeda só, mas não é paga numa moeda só:
    // quem recebe em euro sai de uma conta em euro. Lançar tudo em real
    // inflava a saída em real e escondia a saída em euro — o cadastro da
    // Equipe já guarda a moeda de cada pessoa, e é ela que manda aqui.
    var equipe = equipeLista();
    var moedaDe = function (nome) {
      var m = equipe.filter(function (x) { return x.nome === nome; })[0];
      return (m && m.moeda) || moeda;
    };
    var converter = function (valor, para) {
      if (para === moeda) return valor;
      var c = cfg.cambioEur || 0;
      if (!c) return valor;
      return para === "€" ? valor / c : valor * c;
    };
    // quando a folha já sabe o valor combinado na moeda da pessoa — é o caso
    // de quem tem valor mensal —, usa-se ele; converter de ida e volta só
    // acrescentaria centavo de arredondamento
    var linha = function (nome, sufixo, total, origem, pessoa, bruto) {
      var m = moedaDe(nome);
      var v = (bruto !== undefined && bruto !== null) ? bruto : converter(total, m);
      // Se a folha dessa pessoa já foi vista saindo no extrato, é o extrato
      // que manda: o cadastro diz quanto era para pagar, o banco diz quanto
      // foi pago. Enquanto ninguém viu no extrato, o cadastro é estimativa.
      var pg = pagamentoFeito(nome, k);
      var doBanco = !!(pg && pg.valor > 0 && (pg.conta || pg.idExterno));
      if (doBanco) { v = pg.valor; if (pg.moeda) m = pg.moeda; }
      return { nome: nome + sufixo, categoria: "equipe", moeda: m,
        valor: Math.round(v * 100) / 100,
        vistoNoExtrato: doBanco,
        combinado: Math.round(((bruto !== undefined && bruto !== null) ? bruto
                                                                      : converter(total, moedaDe(nome))) * 100) / 100,
        moedaCombinada: moedaDe(nome),
        // o valor na moeda em que a folha foi calculada, para conferir a conta
        calculadoEm: moeda, valorCalculado: Math.round(total * 100) / 100,
        // o nome puro, para saber depois se essa folha já foi vista
        // saindo no extrato
        pessoa: pessoa === undefined ? nome : pessoa,
        fixo: true, calculado: true, origem: origem };
    };

    f.linhas.forEach(function (l) { out.push(linha(l.nome, " · aulas do mês", l.total, "folha")); });
    (f.fixos || []).forEach(function (x) {
      out.push(linha(x.nome, " · valor mensal", x.total, "folha_fixo", undefined,
        (x.moeda || moeda) === moedaDe(x.nome) ? x.bruto : undefined));
    });

    // Comissão segue a parcela: só sai o que a aluna já pagou.
    var com = comissaoAPagar(k);
    if (com && com.total > 0) {
      var quem = comercialDaEquipe() || "Comercial";
      out.push(linha(quem, " · comissão", com.total, "comissao", null));
    }
    return out;
  }

  function comercialDaEquipe() {
    var c = equipeLista().filter(function (m) {
      return (m.papeis || []).indexOf("comercial") >= 0;
    })[0];
    return c ? c.nome : "";
  }

  // ══════════════════════════════════════════════════════════════
  //  IMPORTAR O CONTROLE DE PAGAMENTO
  //
  //  A planilha é a fonte da verdade hoje. Redigitar 36 contratos é
  //  trabalho e é erro. Aqui a planilha é colada, lida e MOSTRADA antes
  //  de virar dado — quem confere é a Gabi, não o parser. Nada é
  //  aplicado sem ela ver o que o sistema entendeu.
  //
  //  Formato esperado (o que sai ao copiar do Google Sheets):
  //    Nome · Tipo · Quantos ciclos · Valor Total - Real ·
  //    Valor Total - Euro · Quantidade de parcelas · Data de Vencimento ·
  //    Valor da parcela · 1° Pag / Julho · 2° Agosto · 3° Setembro · ...
  // ══════════════════════════════════════════════════════════════

  var MES_POR_NOME = {
    janeiro: 0, fevereiro: 1, marco: 2, abril: 3, maio: 4, junho: 5,
    julho: 6, agosto: 7, setembro: 8, outubro: 9, novembro: 10, dezembro: 11
  };

  function semAcento(s) {
    return String(s || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
  }

  // Uma célula pode ser um valor, uma data, "quitou", ou as três coisas
  // juntas ("€ 292,33 10/07/2026"). Devolve o que der para aproveitar.
  function lerCelula(txt) {
    var s = String(txt == null ? "" : txt).trim();
    if (!s) return { vazia: true };
    var out = { bruto: s };
    if (/quit/i.test(s)) out.quitou = true;
    var data = s.match(/(\d{2})\/(\d{2})\/(\d{4})/);
    if (data) out.data = data[3] + "-" + data[2] + "-" + data[1];
    // A data sai da frente antes de procurar dinheiro. Sem isto,
    // "02/07/2026" virava um pagamento de R$ 2 e "08/07/2026 pelo Assas"
    // virava R$ 8 — erro silencioso e do tipo que ninguém confere.
    var semData = s.replace(/\d{1,2}\/\d{1,2}\/\d{2,4}/g, " ")
                   .replace(/\bdia\b/gi, " ");
    // valor: pega o primeiro número com cara de dinheiro
    var v = semData.match(/(?:R\$|€)?\s*(\d{1,3}(?:\.\d{3})*,\d{2}|\d+,\d{2}|\d+[.,]?\d*)/);
    if (v) {
      var n = parseMoney(v[1]);
      if (n > 0) out.valor = n;
    }
    if (/€/.test(s)) out.moeda = "€";
    else if (/R\$/.test(s)) out.moeda = "R$";
    return out;
  }

  function separarLinha(linha) {
    if (linha.indexOf("\t") >= 0) return linha.split("\t");
    if (linha.indexOf(";") >= 0) return linha.split(";");
    return linha.split(",");
  }

  // Descobre a que mês/ano cada coluna de pagamento se refere. O cabeçalho
  // traz o nome do mês ("2° Agosto"); o ano vem do mês de referência e vira
  // o seguinte quando a sequência dá a volta (Dezembro → Janeiro).
  function mesesDasColunas(cabecalho, anoBase) {
    var cols = [];
    var ano = anoBase, ultimo = -1;
    cabecalho.forEach(function (h, i) {
      var s = semAcento(h);
      if (!/\d+\s*[°ºo]/.test(s) && !/pagamento/.test(s)) return;
      var mes = -1;
      Object.keys(MES_POR_NOME).forEach(function (nome) {
        if (s.indexOf(nome) >= 0) mes = MES_POR_NOME[nome];
      });
      if (mes < 0) {
        // "8° Pagamento" sem nome de mês: segue o anterior
        if (ultimo < 0) return;
        mes = (ultimo + 1) % 12;
        if (mes === 0) ano++;
      } else if (ultimo >= 0 && mes < ultimo) {
        ano++;
      }
      ultimo = mes;
      cols.push({ idx: i, mes: mes, ano: ano,
        key: ano + "-" + (mes + 1 < 10 ? "0" : "") + (mes + 1),
        label: MES_NOMES[mes] });
    });
    return cols;
  }

  function acharColuna(cabecalho, termos) {
    for (var i = 0; i < cabecalho.length; i++) {
      var s = semAcento(cabecalho[i]);
      for (var j = 0; j < termos.length; j++) {
        if (s.indexOf(termos[j]) >= 0) return i;
      }
    }
    return -1;
  }

  // Lê o texto colado e devolve o que ENTENDEU, sem gravar nada.
  function lerControlePagamento(texto, opts) {
    opts = opts || {};
    var linhas = normalizarPlanilha(texto).split("\n").filter(function (l) { return l.trim(); });
    if (!linhas.length) return { ok: false, erro: "Nada foi colado.", linhas: [] };

    // acha o cabeçalho: a primeira linha que fala de nome e de parcela
    var iCab = -1;
    for (var i = 0; i < Math.min(linhas.length, 8); i++) {
      var s = semAcento(linhas[i]);
      if (s.indexOf("nome") >= 0 && (s.indexOf("parcela") >= 0 || s.indexOf("tipo") >= 0)) { iCab = i; break; }
    }
    if (iCab < 0) return { ok: false, linhas: [],
      erro: "Linha de títulos não encontrada. Copie a planilha inteira, incluindo a linha com Nome, Tipo e Valor da parcela." };

    var cab = separarLinha(linhas[iCab]);
    var col = {
      nome: acharColuna(cab, ["nome"]),
      tipo: acharColuna(cab, ["tipo"]),
      ciclos: acharColuna(cab, ["quantos ciclos", "ciclos"]),
      totalReal: acharColuna(cab, ["valor total - real", "total - real", "total real"]),
      totalEuro: acharColuna(cab, ["valor total - euro", "total - euro", "total euro"]),
      nParcelas: acharColuna(cab, ["quantidade de parcelas", "qtd parcelas", "parcelas"]),
      venc: acharColuna(cab, ["data de vencimento", "vencimento"]),
      parcela: acharColuna(cab, ["valor da parcela", "valor parcela"])
    };
    if (col.nome < 0) return { ok: false, linhas: [], erro: "Coluna Nome não encontrada." };

    var anoBase = opts.ano || today().getFullYear();
    var colsMes = mesesDasColunas(cab, anoBase);

    var out = [], ignoradas = 0;
    linhas.slice(iCab + 1).forEach(function (linha) {
      var c = separarLinha(linha);
      var nome = (c[col.nome] || "").trim();
      if (!nome) { ignoradas++; return; }

      // Aviso é o que impede de aplicar: sem isso o contrato fica errado.
      // Nota é observação — a planilha diz uma coisa e o cálculo dá outra,
      // mas dá para importar. Misturar os dois faz metade das linhas
      // parecer problema e a pessoa desiste de conferir.
      var avisos = [], notas = [];
      var tipo = col.tipo >= 0 ? (c[col.tipo] || "").trim() : "";
      var totalReal = col.totalReal >= 0 ? lerCelula(c[col.totalReal]) : { vazia: true };
      var totalEuro = col.totalEuro >= 0 ? lerCelula(c[col.totalEuro]) : { vazia: true };
      var parcela = col.parcela >= 0 ? lerCelula(c[col.parcela]) : { vazia: true };

      // a moeda vem de qual coluna de total está preenchida, e a célula
      // da parcela confirma
      var moeda = totalEuro.valor ? "€" : (totalReal.valor ? "R$" : (parcela.moeda || "R$"));
      var total = totalEuro.valor || totalReal.valor || 0;

      var vencCel = col.venc >= 0 ? String(c[col.venc] || "").trim() : "";
      var vencDia = parseInt((vencCel.match(/^\s*(\d{1,2})\s*$/) || [])[1], 10);
      var autoMatricula = /auto\s*matricula/i.test(vencCel);
      if (isNaN(vencDia)) vencDia = 0;

      var nParcelas = col.nParcelas >= 0 ? parseInt(c[col.nParcelas], 10) : 0;
      if (isNaN(nParcelas)) nParcelas = 0;

      // as colunas de mês
      var meses = [], quitouEm = -1;
      colsMes.forEach(function (cm, ordem) {
        var cel = lerCelula(c[cm.idx]);
        if (cel.quitou) { if (quitouEm < 0) quitouEm = ordem; return; }
        if (cel.vazia) return;
        meses.push({ key: cm.key, label: cm.label,
          valor: fmtMoney(moeda, cel.valor || parcela.valor || 0),
          bruto: cel.valor || parcela.valor || 0,
          pago: !!cel.data,          // data na célula = pagamento feito
          pagoEm: cel.data || "",
          origem: cel.bruto });
        if (!cel.valor && !parcela.valor) avisos.push("Sem valor em " + cm.label);
        if (cel.valor && parcela.valor && cel.valor !== parcela.valor)
          notas.push(cm.label + " tem " + fmtMoney(moeda, cel.valor)
            + ", diferente da parcela de " + fmtMoney(moeda, parcela.valor));
      });

      if (!meses.length) avisos.push("Nenhuma parcela reconhecida");
      if (!total && !parcela.valor) avisos.push("Sem valor total nem valor de parcela");
      // O "quitou" ocupa uma coluna: quem tem 7 parcelas e quitou na 8ª
      // bate com uma planilha que declara 8. Isso não é divergência.
      var colunasUsadas = meses.length + (quitouEm >= 0 ? 1 : 0);
      if (nParcelas && meses.length && nParcelas !== colunasUsadas) {
        notas.push("A planilha diz " + nParcelas + " parcelas e eu li " + meses.length
          + (quitouEm >= 0 ? ", com quitação antes do fim" : ""));
      }

      // A planilha da Gabi tem uma coluna sem título depois do nome, com
      // anotações soltas: "particular" e o nível ("a2"). Célula com
      // exatamente isso é informação, não ruído — e vale mais que chute.
      var formatoExplicito = false, nivelAnotado = "";
      c.forEach(function (cel) {
        var s = semAcento(cel);
        if (s === "particular") formatoExplicito = true;
        else if (/^(a[0-2]|b[12]|c[12])$/.test(s)) nivelAnotado = cel.trim().toUpperCase();
        else if (/^(first steps|basics|essentials|speaking|advanced)/.test(s)) nivelAnotado = cel.trim();
      });

      var jaExiste = pessoaPorNome(nome);
      var formato = "grupo";
      if (formatoExplicito) {
        formato = "particular";
      } else if (jaExiste) {
        formato = (jaExiste.particular || /particular/i.test(jaExiste.turma || ""))
          ? "particular" : "grupo";
      }

      out.push({
        nome: nome, tipo: tipo || "Matrícula",
        formato: formato, formatoChutado: !jaExiste && !formatoExplicito,
        nivel: nivelAnotado,
        turma: jaExiste ? (jaExiste.turma || "") : "",
        ciclos: col.ciclos >= 0 ? (c[col.ciclos] || "").trim() : "",
        moeda: moeda,
        valorTotal: total ? fmtMoney(moeda, total) : "",
        parcelaValor: parcela.valor ? fmtMoney(moeda, parcela.valor) : "",
        parcelas: meses.length || nParcelas,
        vencDia: vencDia, autoMatricula: autoMatricula,
        quitou: quitouEm >= 0,
        meses: meses,
        aReceber: meses.filter(function (m) { return !m.pago; })
          .reduce(function (s, m) { return s + m.bruto; }, 0),
        recebido: meses.filter(function (m) { return m.pago; })
          .reduce(function (s, m) { return s + m.bruto; }, 0),
        avisos: avisos, notas: notas,
        existe: !!jaExiste
      });
    });

    // o que a escola vai receber, por mês e por moeda
    var porMes = {};
    out.forEach(function (l) {
      l.meses.forEach(function (m) {
        porMes[m.key] = porMes[m.key] || { key: m.key, label: m.label, "R$": 0, "€": 0, n: 0 };
        if (!m.pago) { porMes[m.key][l.moeda] += m.bruto; porMes[m.key].n++; }
      });
    });
    var meses = Object.keys(porMes).sort().map(function (k) { return porMes[k]; });

    return { ok: true, linhas: out, ignoradas: ignoradas,
      colunasMes: colsMes.map(function (c) { return c.label + "/" + c.ano; }),
      comAviso: out.filter(function (l) { return l.avisos.length; }).length,
      novas: out.filter(function (l) { return !l.existe; }).length,
      porMes: meses,
      totalAReceber: { "R$": out.filter(function (l) { return l.moeda === "R$"; })
          .reduce(function (s, l) { return s + l.aReceber; }, 0),
        "€": out.filter(function (l) { return l.moeda === "€"; })
          .reduce(function (s, l) { return s + l.aReceber; }, 0) } };
  }

  function pessoaPorNome(nome) {
    var alvo = semAcento(nome);
    return loadPessoas().filter(function (p) { return semAcento(p.nome) === alvo; })[0] || null;
  }

  // O systeme.io junta os contatos do Jotform — a mesma pessoa chega duas
  // vezes, às vezes com o nome escrito diferente em cada fonte. O e-mail e
  // o WhatsApp não mudam: são eles que dizem se a pessoa já está aqui.
  // Telefone compara pelos últimos 8 dígitos, porque o mesmo número
  // aparece com e sem +55, com e sem o 9 na frente.
  function chaveFone(s) {
    var d = String(s || "").replace(/\D/g, "");
    return d.length >= 8 ? d.slice(-8) : "";
  }
  // "Debora Staidel" no sistema e "Débora Staidel Silva" no formulário
  // são a mesma pessoa. Casa quando as palavras do nome mais curto estão
  // todas no mais comprido — e SÓ quando existe uma única candidata;
  // qualquer ambiguidade e ninguém é casado.
  function pessoaPorNomeParecido(nome) {
    var alvo = semAcento(nome).split(/\s+/).filter(Boolean);
    if (alvo.length < 2) return null;
    var cand = loadPessoas().filter(function (p) {
      var w = semAcento(p.nome).split(/\s+/).filter(Boolean);
      if (w.length < 2) return false;
      var curto = alvo.length <= w.length ? alvo : w;
      var comprido = alvo.length <= w.length ? w : alvo;
      return curto.every(function (x) { return comprido.indexOf(x) >= 0; });
    });
    return cand.length === 1 ? cand[0] : null;
  }

  function pessoaPorContato(email, whatsapp) {
    var e = String(email || "").trim().toLowerCase();
    var f = chaveFone(whatsapp);
    if (!e && !f) return null;
    return loadPessoas().filter(function (p) {
      if (e && String(p.email || "").trim().toLowerCase() === e) return true;
      if (f && chaveFone(p.whatsapp) === f) return true;
      return false;
    })[0] || null;
  }

  // Só depois de a Gabi olhar o preview. Cria quem não existe e substitui
  // o contrato vigente de quem existe — a planilha é a fonte da verdade.
  function aplicarControlePagamento(leitura, opts) {
    opts = opts || {};
    if (!leitura || !leitura.ok) return { ok: false };
    var criadas = 0, atualizadas = 0, puladas = 0;

    leitura.linhas.forEach(function (l) {
      if (opts.somenteSemAviso && l.avisos.length) { puladas++; return; }
      if (!l.meses.length) { puladas++; return; }

      var contrato = {
        tipo: l.tipo, ciclos: l.ciclos, moeda: l.moeda,
        valorTotal: l.valorTotal, parcelaValor: l.parcelaValor,
        parcelas: l.meses.length, vencDia: l.vencDia || 10,
        fim: l.meses[l.meses.length - 1].key + "-28",
        meses: l.meses.map(function (m) {
          return { key: m.key, label: m.label, valor: m.valor, pago: m.pago };
        })
      };

      var particular = l.formato === "particular";
      var p = pessoaPorNome(l.nome);
      if (!p) {
        p = novaPessoa({ nome: l.nome, moeda: l.moeda, status: "aluna",
          estagio: "matriculado", origem: { canal: "Importação" } });
        criadas++;
      } else {
        atualizadas++;
      }
      mutate(p.id, function (x) {
        x.status = "aluna";
        x.estagio = "matriculado";
        x.moeda = l.moeda;
        if (l.nivel) x.nivel = l.nivel;
        // Turma ou particular muda quem acompanha, como a professora é paga
        // e onde a aluna aparece. Não é detalhe de cadastro.
        x.formatos = [particular ? "particular" : "grupo"];
        if (particular) {
          x.particular = x.particular || { inicio: iso(today()), aulas: 0, feitas: 0 };
          if (!/particular/i.test(x.turma || "")) x.turma = "Particular";
        } else {
          delete x.particular;
          if (/^particular/i.test(x.turma || "")) x.turma = "";
        }
        x.contratos = x.contratos || [];
        // substitui o contrato vigente em vez de empilhar mais um
        var iVig = -1;
        x.contratos.forEach(function (c, i) { if (contratoAtivo(c)) iVig = i; });
        if (iVig >= 0) x.contratos[iVig] = contrato;
        else x.contratos.push(contrato);
        pushHist(x, "pagamento", "Contrato importado do Controle de Pagamento · "
          + contrato.parcelas + "x de " + contrato.parcelaValor);
      });
    });

    return { ok: true, criadas: criadas, atualizadas: atualizadas, puladas: puladas };
  }

  function contratoAtivo(c) {
    if (!c) return false;
    if (!c.fim) return true;
    return c.fim >= iso(today());
  }

  // ── IMPORTAR ALUNAS E TURMAS ──────────────────────────────────
  //
  // Mesma regra do Controle de Pagamento: colar, ler, MOSTRAR, e só gravar
  // depois que a pessoa confere. As colunas são achadas pelo título, na
  // ordem que estiverem: Nome (obrigatória), Turma, Nível, Professora,
  // Horário, WhatsApp/Telefone, E-mail.
  function lerAlunasTurmas(texto) {
    var linhas = normalizarPlanilha(texto).split("\n").filter(function (l) { return l.trim(); });
    if (!linhas.length) return { ok: false, erro: "Nada foi colado.", linhas: [] };

    var iCab = -1, cab = null;
    for (var i = 0; i < Math.min(linhas.length, 8); i++) {
      var s = semAcento(linhas[i]);
      if (s.indexOf("nome") >= 0) { iCab = i; cab = separarLinha(linhas[i]); break; }
    }
    if (iCab < 0) return { ok: false, linhas: [],
      erro: "Linha de títulos não encontrada. É obrigatória a coluna Nome." };

    // colar o Controle de Pagamento aqui não é erro da pessoa — é o mesmo
    // arquivo. A resposta certa é apontar a aba, não reclamar de coluna.
    var sCab = semAcento(cab.join(" "));
    if (sCab.indexOf("valor da parcela") >= 0 || sCab.indexOf("quantos ciclos") >= 0
        || sCab.indexOf("data de vencimento") >= 0) {
      return { ok: false, linhas: [], controleDePagamento: true,
        erro: "Esta é a planilha do Controle de Pagamento — importe pela aba ao lado, que cria as alunas e registra as anotações de \u201cparticular\u201d e de nível." };
    }

    var col = {
      nome: acharColuna(cab, ["nome"]),
      turma: acharColuna(cab, ["turma", "grupo"]),
      nivel: acharColuna(cab, ["nivel", "nível"]),
      professora: acharColuna(cab, ["professora", "professor", "teacher"]),
      horario: acharColuna(cab, ["horario", "horário", "dia e hora"]),
      whatsapp: acharColuna(cab, ["whatsapp", "telefone", "celular", "fone"]),
      email: acharColuna(cab, ["email", "e-mail"])
    };
    if (col.nome < 0) return { ok: false, linhas: [], erro: "Coluna Nome não encontrada." };

    var pega = function (c, idx) { return idx >= 0 ? (c[idx] || "").trim() : ""; };
    var equipe = {};
    equipeLista().forEach(function (m) { equipe[semAcento(m.nome)] = m.nome; });

    var out = [], turmasNovas = {}, ignoradas = 0;
    linhas.slice(iCab + 1).forEach(function (linha) {
      var c = separarLinha(linha);
      var nome = pega(c, col.nome);
      if (!nome) { ignoradas++; return; }
      var avisos = [];
      var turma = pega(c, col.turma);
      var nivel = pega(c, col.nivel);
      var professora = pega(c, col.professora);
      var horario = pega(c, col.horario);

      // O rótulo de turma do sistema é "Nível · Horário". Um código curto
      // na coluna Turma (BAS-SEG-12NL) é apelido interno da planilha, não
      // rótulo: se o nível e o horário existem, o rótulo sai deles — senão
      // a aluna e a turma nasceriam com nomes diferentes e nunca se
      // encontrariam.
      var codigo = "";
      var label = turma;
      if (label && label.indexOf("·") < 0) {
        codigo = label;
        if (nivel && horario) label = nivel + " · " + horario;
        else if (horario) label = codigo + " · " + horario;
      } else if (!label && nivel && horario) {
        label = nivel + " · " + horario;
      }

      // Particular não é turma: é aula individual, com outra rotina e
      // outro pagamento. Vira aluna particular, não turma de grupo.
      var ehParticular = /particular/i.test(nivel) || /^part(\b|-)/i.test(codigo);

      var profOficial = professora ? (equipe[semAcento(professora)] || "") : "";
      if (professora && !profOficial)
        avisos.push(professora + " não está no cadastro da equipe");

      var existe = pessoaPorNome(nome);
      if (ehParticular) {
        label = "";
      } else if (label) {
        var jaTem = turmasLista().some(function (u) {
          return (u.nivel + " · " + u.turma) === label;
        });
        if (!jaTem && !turmasNovas[label])
          turmasNovas[label] = { label: label, nivel: nivel || label.split(" · ")[0],
            horario: horario || label.split(" · ")[1] || "",
            professora: profOficial || professora || "", alunas: 0 };
        if (turmasNovas[label]) turmasNovas[label].alunas++;
      } else {
        avisos.push("Sem turma — fica cadastrada, mas fora de qualquer turma");
      }

      out.push({ nome: nome, turma: label, nivel: ehParticular ? "" : nivel,
        codigo: codigo, particular: ehParticular, horario: horario,
        professora: profOficial || professora,
        whatsapp: pega(c, col.whatsapp), email: pega(c, col.email),
        existe: !!existe, avisos: avisos });
    });

    return { ok: true, linhas: out, ignoradas: ignoradas,
      novas: out.filter(function (l) { return !l.existe; }).length,
      comAviso: out.filter(function (l) { return l.avisos.length; }).length,
      particulares: out.filter(function (l) { return l.particular; }).length,
      turmasNovas: Object.keys(turmasNovas).map(function (k) { return turmasNovas[k]; }) };
  }

  function aplicarAlunasTurmas(leitura) {
    if (!leitura || !leitura.ok) return { ok: false };
    var criadas = 0, atualizadas = 0, turmasCriadas = 0;

    // primeiro as turmas, para as alunas terem onde entrar
    leitura.turmasNovas.forEach(function (tn) {
      var ja = turmasLista().some(function (u) {
        return (u.nivel + " · " + u.turma) === tn.label;
      });
      if (ja) return;
      addTurma({ nivel: tn.nivel, turma: tn.horario, teacher: tn.professora || "",
        capacidade: 5 });
      turmasCriadas++;
    });

    leitura.linhas.forEach(function (l) {
      var p = pessoaPorNome(l.nome);
      if (!p) {
        p = novaPessoa({ nome: l.nome, whatsapp: l.whatsapp, email: l.email,
          moeda: "R$", status: "aluna", estagio: "matriculado",
          origem: { canal: "Importação" } });
        criadas++;
      } else {
        atualizadas++;
      }
      mutate(p.id, function (x) {
        x.status = "aluna";
        x.estagio = "matriculado";
        if (l.whatsapp) x.whatsapp = l.whatsapp;
        if (l.email) x.email = l.email;
        if (l.nivel) x.nivel = l.nivel;
        if (l.particular) {
          // quem também está numa turma de grupo não sai dela: a aula
          // particular é um pacote a mais, não uma troca
          if (!x.turma) x.turma = "Particular";
          if (l.professora) x.professora = l.professora;
          if ((x.formatos || []).indexOf("particular") < 0)
            x.formatos = (x.formatos || []).concat(["particular"]);
          if (!x.particular) x.particular = { inicio: iso(today()), aulas: 0, feitas: 0 };
          if (l.horario) x.particular.horario = l.horario;
        }
      });
      if (!l.particular && l.turma) setTurmaDaPessoa(p.id, l.turma, l.professora || "");
    });

    // Arruma o que importações com defeito deixaram para trás: turmas com
    // o mesmo id (editar uma mexia na outra) e rótulos duplicados. As que
    // sobrarem vazias são listadas para a pessoa decidir — apagar turma
    // não é coisa que se faça sozinho.
    var lista = turmasLista(), vistos = {}, ids = {}, limpa = [], mudou = false;
    lista.forEach(function (u) {
      var lb = u.nivel + " · " + u.turma;
      if (vistos[lb]) { mudou = true; return; }
      vistos[lb] = true;
      if (ids[u.id]) { u.id = novoTurmaId(); mudou = true; }
      ids[u.id] = true;
      limpa.push(u);
    });
    if (mudou) turmasSave(limpa);

    var vazias = turmasLista().filter(function (u) {
      return alunasDaTurma(u.nivel + " · " + u.turma).length === 0;
    }).map(function (u) { return { id: u.id, label: u.nivel + " · " + u.turma }; });

    return { ok: true, criadas: criadas, atualizadas: atualizadas,
      turmasCriadas: turmasCriadas,
      particulares: leitura.linhas.filter(function (l) { return l.particular; }).length,
      turmasVazias: vazias };
  }

  // ── IMPORTAR LEADS ────────────────────────────────────────────
  //
  // O funil não começa no app: começa em planilha, formulário, caderno.
  // Importar leads é a mesma regra dos outros: ler, mostrar, e só gravar
  // depois que a pessoa confere. Quem já é aluna nunca vira lead de novo.
  function lerLeads(texto) {
    var linhas = normalizarPlanilha(texto).split("\n")
      .filter(function (l) { return l.trim(); });
    if (!linhas.length) return { ok: false, linhas: [], erro: "Cole a lista antes de ler." };

    var iCab = -1, cab = null;
    for (var i = 0; i < Math.min(linhas.length, 5); i++) {
      var s = semAcento(linhas[i]);
      if (s.indexOf("nome") >= 0) { iCab = i; cab = separarLinha(linhas[i]); break; }
    }
    if (iCab < 0) return { ok: false, linhas: [],
      erro: "Linha de títulos não encontrada. É obrigatória a coluna Nome." };

    var sCab = semAcento(cab.join(" "));
    if (sCab.indexOf("valor da parcela") >= 0 || sCab.indexOf("quantos ciclos") >= 0
        || sCab.indexOf("data de vencimento") >= 0) {
      return { ok: false, linhas: [], controleDePagamento: true,
        erro: "Esta é a planilha do Controle de Pagamento — importe pela aba correspondente, que cria as alunas com contrato." };
    }
    if (sCab.indexOf("professora") >= 0 && sCab.indexOf("turma") >= 0) {
      return { ok: false, linhas: [], listaDeAlunas: true,
        erro: "Esta parece a lista de alunas e turmas — importe pela aba Alunas e turmas. Leads são contatos ainda não matriculados." };
    }

    var col = {
      nome: acharColuna(cab, ["nome"]),
      whatsapp: acharColuna(cab, ["whatsapp", "telefone", "celular", "fone"]),
      email: acharColuna(cab, ["email", "e-mail"]),
      // na planilha da escola a coluna de origem se chama Funil
      canal: acharColuna(cab, ["canal", "origem", "fonte", "veio", "funil"]),
      estagio: acharColuna(cab, ["estagio", "estágio", "etapa", "status", "situacao", "situação"]),
      nivel: acharColuna(cab, ["nivel", "nível"]),
      objetivo: acharColuna(cab, ["objetivo"]),
      objecao: acharColuna(cab, ["objecao principal", "objeção principal", "objecao"]),
      nota: acharColuna(cab, ["nota", "observacao", "observação", "obs", "comentario", "comentário"]),
      desde: acharColuna(cab, ["desde", "data de entrada", "data", "quando", "entrou"])
    };
    if (col.nome < 0) return { ok: false, linhas: [], erro: "Coluna Nome não encontrada." };

    var pega = function (c, idx) { return idx >= 0 ? (c[idx] || "").trim() : ""; };
    // o vocabulário do funil da escola: Acompanhar, Ganho, Contato
    // Realizado, Call/Reunião Agendada, Em negociação, Lead, Perdido
    var mapEstagio = function (s) {
      s = semAcento(s);
      if (!s) return "";
      if (s.indexOf("incomplet") >= 0) return "incompleta";
      if (s.indexOf("negocia") >= 0 || s.indexOf("proposta") >= 0 || s.indexOf("contrato") >= 0) return "contrato";
      if (s.indexOf("conversa") >= 0 || s.indexOf("acompanhar") >= 0
        || s.indexOf("contato realizado") >= 0 || s === "contato") return "em_conversa";
      if (s.indexOf("reuniao") >= 0 || s.indexOf("call") >= 0 || s.indexOf("agendad") >= 0) return "reuniao";
      if (s.indexOf("matricul") >= 0 || s.indexOf("fechad") >= 0 || s.indexOf("fechou") >= 0
        || s.indexOf("ganho") >= 0 || s.indexOf("ganha") >= 0) return "matriculado";
      if (s.indexOf("perdid") >= 0 || s.indexOf("desist") >= 0 || s.indexOf("sumiu") >= 0) return "perdido";
      if (s.indexOf("contatar") >= 0 || s.indexOf("novo") >= 0 || s.indexOf("nova") >= 0
        || s === "lead") return "a_contatar";
      return "";
    };
    var canalOficial = function (s) {
      if (!s) return "";
      var alvo = semAcento(s);
      var oficial = CANAIS.filter(function (c) { return semAcento(c) === alvo; })[0];
      return oficial || s;
    };
    var estagioLabel = function (id) {
      var st = STAGES.filter(function (x) { return x.id === id; })[0];
      return st ? st.label : "";
    };

    var out = [], ignoradas = 0;
    linhas.slice(iCab + 1).forEach(function (linha) {
      var c = separarLinha(linha);
      var nome = pega(c, col.nome);
      if (!nome) { ignoradas++; return; }
      var avisos = [], notas = [];
      var whatsapp = pega(c, col.whatsapp), email = pega(c, col.email);

      // Na planilha real o telefone às vezes está na coluna do e-mail e
      // vice-versa. O conteúdo diz o que a célula é, não o título dela.
      var pareceEmail = function (s) { return /@/.test(s || ""); };
      var pareceFone = function (s) {
        return !!s && !/@/.test(s) && (s.replace(/\D/g, "").length >= 8);
      };
      if (pareceEmail(whatsapp) && !pareceEmail(email)) {
        var guardado = email; email = whatsapp;
        whatsapp = pareceFone(guardado) ? guardado : "";
      } else if (pareceFone(email) && !whatsapp) {
        whatsapp = email; email = "";
      }

      // O nome pode vir escrito diferente em cada fonte (Jotform,
      // systeme.io, planilha). E-mail e WhatsApp são a identidade real:
      // se batem com alguém, é a mesma pessoa — atualiza, não duplica.
      var existe = pessoaPorNome(nome) || pessoaPorContato(email, whatsapp)
        || pessoaPorNomeParecido(nome);
      var jaAluna = !!existe && existe.status !== "lead";
      if (existe && semAcento(existe.nome) !== semAcento(nome) && !jaAluna)
        notas.push("Mesmo contato de “" + existe.nome + "” — atualiza essa pessoa, não cria outra");

      var estagio = mapEstagio(pega(c, col.estagio));
      var estagioBruto = pega(c, col.estagio);

      // "€ 90 a 130 mensais…" e "#ERROR!" não são pessoas. Linha cujo
      // nome não parece nome veio quebrada da planilha — fica de fora.
      if (/^[#€$\d(+]|^R\$/.test(nome) || nome.length > 60)
        avisos.push("Isso não parece um nome — a linha veio quebrada da planilha e não entra");

      if (jaAluna) {
        avisos.push("Já está no sistema como "
          + ((STATUS_META[existe.status] || {}).label || existe.status)
          + " — não volta a ser lead");
        if ((email && !existe.email) || (whatsapp && !existe.whatsapp))
          notas.push("O contato que veio aqui completa o cadastro dela");
      }
      else if (estagio === "matriculado")
        avisos.push("Diz que fechou (Ganho) — matrícula não entra por aqui; use o Controle de Pagamento ou a lista de alunas");
      if (estagioBruto && !estagio && !jaAluna)
        notas.push("Não entendi o estágio “" + estagioBruto + "” — entra como A contatar");
      if (!whatsapp && !email && !jaAluna)
        notas.push("Sem WhatsApp nem e-mail — entra, mas fica sem canal de contato");

      // "05/02" sem ano é deste ano; o formulário exporta "2026-04-27 18:55"
      var desde = "";
      var bruto = pega(c, col.desde);
      var d = bruto.match(/(\d{4})-(\d{2})-(\d{2})/);
      if (d) desde = d[1] + "-" + d[2] + "-" + d[3];
      else {
        d = bruto.match(/(\d{2})\/(\d{2})(?:\/(\d{2,4}))?/);
        if (d) desde = (d[3] ? (d[3].length === 2 ? "20" + d[3] : d[3]) : String(new Date().getFullYear()))
          + "-" + d[2] + "-" + d[1];
      }

      // objetivo, objeção e observações são história da pessoa: tudo vira
      // linha do tempo, nada se perde
      var pedacosNota = [pega(c, col.objetivo),
        pega(c, col.objecao) ? "Objeção: " + pega(c, col.objecao) : "",
        pega(c, col.nota)].filter(Boolean);

      out.push({ nome: nome, whatsapp: whatsapp, email: email,
        canal: canalOficial(pega(c, col.canal)),
        estagio: (estagio && estagio !== "matriculado") ? estagio : "a_contatar",
        estagioLabel: estagioLabel((estagio && estagio !== "matriculado") ? estagio : "a_contatar"),
        nivel: pega(c, col.nivel), nota: pedacosNota.join(" · "), desde: desde,
        existe: !!existe, jaAluna: jaAluna, avisos: avisos, notas: notas });
    });

    return { ok: true, linhas: out, ignoradas: ignoradas,
      novas: out.filter(function (l) { return !l.existe; }).length,
      jaAlunas: out.filter(function (l) { return l.jaAluna; }).length,
      comAviso: out.filter(function (l) { return l.avisos.length; }).length };
  }

  // ── JOTFORM ───────────────────────────────────────────────────
  //
  // Os funis de inscrição moram no Jotform. Com a chave de API da escola,
  // o app busca as inscrições direto — sem exportar, sem colar. A resposta
  // do Jotform vira as mesmas linhas do importador de leads: mesmo preview,
  // mesmas regras, mesma proteção de quem já é aluna.
  // Aulas extras gravadas, acesso de todas as alunas (a pasta geral).
  // As gravações POR TURMA vivem na própria turma (campo gravadas).
  var GRAVADAS_KEY = "isr_gravadas_v1";
  function gravadasUrl() {
    try { return localStorage.getItem(GRAVADAS_KEY) || ""; } catch (e) { return ""; }
  }
  function setGravadasUrl(u) {
    try { localStorage.setItem(GRAVADAS_KEY, (u || "").trim()); } catch (e) {}
    agendarSync();
    return gravadasUrl();
  }

  // Página de horários (booking page do Google Agenda) de quem faz as
  // conversas de matrícula. O sistema não consegue LER os horários vagos
  // dela — o Google não abre isso por API — mas consegue levar a pessoa
  // direto para a página, que mostra os horários e agenda sozinha.
  var BOOKING_KEY = "isr_booking_v1";
  function bookingUrl() {
    try { return localStorage.getItem(BOOKING_KEY) || ""; } catch (e) { return ""; }
  }
  function setBookingUrl(u) {
    try { localStorage.setItem(BOOKING_KEY, (u || "").trim()); } catch (e) {}
    agendarSync();
    return bookingUrl();
  }

  // systeme.io: o navegador não pode falar direto com a API (CORS); a
  // Conexão (Apps Script) busca os contatos e devolve. A chave fica no
  // app, e vai junto de cada chamada.
  var SYSTEME_KEY = "isr_systeme_v1";
  function systemeKey() {
    try { return localStorage.getItem(SYSTEME_KEY) || ""; } catch (e) { return ""; }
  }
  function setSystemeKey(k) {
    try { localStorage.setItem(SYSTEME_KEY, (k || "").trim()); } catch (e) {}
    agendarSync();
    return systemeKey();
  }

  // Contatos do systeme viram as mesmas linhas do importador de leads.
  function lerLeadsDoSysteme(items) {
    var linhas = ["Nome\tWhatsApp\tE-mail\tCanal\tEstágio\tNível\tObservação\tData"];
    (items || []).forEach(function (c) {
      var campos = {};
      (c.fields || []).forEach(function (f) { campos[f.slug] = (f.value || "").toString().trim(); });
      var nome = [campos.first_name, campos.surname].filter(Boolean).join(" ").trim();
      if (!nome && c.email) nome = c.email.split("@")[0];
      if (!nome) return;
      var tags = (c.tags || []).map(function (tg) { return tg.name; }).filter(Boolean).join(", ");
      linhas.push([nome, campos.phone_number || "", c.email || "", "systeme.io", "",
        "", (tags ? "tags do systeme: " + tags : "").replace(/[\t\r\n]+/g, " "),
        (c.registered_at || "").slice(0, 10)].join("\t"));
    });
    if (linhas.length === 1) return { ok: false, linhas: [],
      erro: "Resposta do systeme sem contatos com nome ou e-mail." };
    return lerLeads(linhas.join("\n"));
  }

  var JOTFORM_KEY = "isr_jotform_v1";
  function jotformKey() {
    try { return localStorage.getItem(JOTFORM_KEY) || ""; } catch (e) { return ""; }
  }
  function setJotformKey(k) {
    try { localStorage.setItem(JOTFORM_KEY, (k || "").trim()); } catch (e) {}
    agendarSync();
    return jotformKey();
  }

  // O Jotform tem dois endereços de API: o comum e o europeu. Conta
  // guardada nos servidores da Europa só responde no europeu — no comum a
  // chave volta como inválida. A tela tenta um endereço e, se a resposta
  // vier com erro, tenta o outro; o que funcionou fica guardado aqui para
  // as próximas buscas.
  var JOTFORM_BASE_KEY = "isr_jotform_base_v1";
  var JOTFORM_BASES = ["https://api.jotform.com", "https://eu-api.jotform.com"];
  function jotformBase() {
    try {
      var b = localStorage.getItem(JOTFORM_BASE_KEY) || "";
      return JOTFORM_BASES.indexOf(b) >= 0 ? b : JOTFORM_BASES[0];
    } catch (e) { return JOTFORM_BASES[0]; }
  }
  function setJotformBase(b) {
    try { localStorage.setItem(JOTFORM_BASE_KEY, b || ""); } catch (e) {}
    agendarSync();
    return jotformBase();
  }
  function jotformOutraBase(b) {
    return b === JOTFORM_BASES[0] ? JOTFORM_BASES[1] : JOTFORM_BASES[0];
  }

  // Recebe o array `content` de /form/{id}/submissions e devolve a mesma
  // leitura do lerLeads — montando as linhas e reaproveitando toda a
  // inteligência de lá (estágio, telefone × e-mail, quem já é aluna).
  function lerLeadsDoJotform(submissions, canalOuTitulo) {
    var linhas = ["Nome\tWhatsApp\tE-mail\tCanal\tEstágio\tNível\tObservação\tData"];
    (submissions || []).forEach(function (s) {
      var nome = "", email = "", fone = "", nivel = "", canal = "", nota = [];
      var ans = s.answers || {};
      Object.keys(ans).forEach(function (k) {
        var a = ans[k] || {};
        var rotulo = semAcento(a.text || a.name || "");
        var v = a.answer;
        if (v === undefined || v === null || v === "") return;
        // nome completo e telefone chegam como objeto {first,last}/{area,phone}
        if (typeof v === "object") {
          v = Object.keys(v).map(function (x) { return v[x]; })
            .filter(function (x) { return x && typeof x === "string"; }).join(" ");
        }
        v = String(v).replace(/[\t\r\n]+/g, " ").trim();
        if (!v) return;
        if (a.type === "control_fullname" || (rotulo.indexOf("nome") >= 0 && !nome)) {
          if (!nome) nome = v;
        } else if (a.type === "control_email" || rotulo.indexOf("mail") >= 0
          || (/@/.test(v) && v.indexOf(" ") < 0)) {
          if (!email) email = v;
        } else if (a.type === "control_phone" || rotulo.indexOf("telefone") >= 0
          || rotulo.indexOf("whatsapp") >= 0 || rotulo.indexOf("celular") >= 0) {
          if (!fone) fone = v;
        } else if (rotulo.indexOf("nivel") >= 0) {
          nivel = v;
        } else if (rotulo.indexOf("conheceu") >= 0 || rotulo.indexOf("como soube") >= 0) {
          // "Como você nos conheceu" é o canal do lead, não uma observação
          canal = v;
        } else {
          // Consentimento e termos não são história da pessoa — poluíam a
          // ficha ("Estou ciente que o contato será via e-mail…").
          var pergunta = String(a.text || a.name || "").replace(/[\t\r\n]+/g, " ").trim();
          var BOILER = /estou ciente|li e aceito|concordo|termos|pol[ií]tica de privacidade|autorizo/i;
          if (BOILER.test(v) || BOILER.test(pergunta)) return;
          if (a.type === "control_textarea") {
            // o texto livre é a história da pessoa — vale por si
            nota.push(v);
          } else {
            // todo o resto (objetivo, horário, faixa de investimento…)
            // entra com a pergunta junto — sem a pergunta, "Sim" e
            // "€ 51 a 90 mensais" não dizem nada
            nota.push(pergunta ? pergunta + ": " + v : v);
          }
        }
      });
      if (!nome) return;
      linhas.push([nome, fone, email, canal || canalOuTitulo || "Aplicação", "", nivel,
        nota.join(" · ").slice(0, 800), (s.created_at || "").slice(0, 10)].join("\t"));
    });
    if (linhas.length === 1) return { ok: false, linhas: [],
      erro: "Resposta do Jotform sem inscrições com nome. Verifique o formulário selecionado." };
    return lerLeads(linhas.join("\n"));
  }

  function aplicarLeads(leitura) {
    if (!leitura || !leitura.ok) return { ok: false };
    var criados = 0, atualizados = 0, pulados = 0;
    var contatosCompletados = 0;
    leitura.linhas.forEach(function (l) {
      // Aluna não volta a ser lead — mas o e-mail e o WhatsApp que vieram
      // na inscrição completam o cadastro dela quando o campo está vazio.
      // É o que deixa a lista de e-mails inteira sem digitação manual.
      if (l.jaAluna) {
        var alvo = pessoaPorNome(l.nome) || pessoaPorContato(l.email, l.whatsapp)
          || pessoaPorNomeParecido(l.nome);
        if (alvo && ((l.email && !alvo.email) || (l.whatsapp && !alvo.whatsapp))) {
          mutate(alvo.id, function (x) {
            if (l.email && !x.email) x.email = l.email;
            if (l.whatsapp && !x.whatsapp) x.whatsapp = l.whatsapp;
          });
          contatosCompletados++;
        }
        pulados++;
        return;
      }
      if (l.avisos.length) { pulados++; return; }
      var p = pessoaPorNome(l.nome) || pessoaPorContato(l.email, l.whatsapp)
        || pessoaPorNomeParecido(l.nome);
      if (!p) {
        p = novaPessoa({ nome: l.nome, whatsapp: l.whatsapp, email: l.email,
          canal: l.canal || "Importação" });
        criados++;
      } else {
        atualizados++;
      }
      mutate(p.id, function (x) {
        // só preenche o que está vazio: importar não apaga o que a escola
        // já sabe sobre a pessoa
        if (l.whatsapp && !x.whatsapp) x.whatsapp = l.whatsapp;
        if (l.email && !x.email) x.email = l.email;
        if (l.nivel && !x.nivel) x.nivel = l.nivel;
        if (l.canal && (!x.origem || !x.origem.canal || x.origem.canal === "WhatsApp"))
          x.origem = Object.assign({}, x.origem, { canal: l.canal, detalhe: "importação de leads" });
        // a data da planilha/inscrição é QUANDO O LEAD ENTROU — é o
        // "Entrou" do CRM (entrouEm), não a data de matrícula (desde)
        if (l.desde) x.entrouEm = l.desde;
        if (l.estagio && l.estagio !== "a_contatar") x.estagio = l.estagio;
        // A ficha vira um bloco estruturado no perfil (pergunta a
        // pergunta), não um muro de texto na linha do tempo. Reimportar a
        // mesma ficha não repete o registro.
        if (l.nota) {
          var pecas = l.nota.split(" · ").map(function (t) { return t.trim(); }).filter(Boolean);
          if (pecas.join("\u0001") !== (x.inscricao || []).join("\u0001")) {
            x.inscricao = pecas;
            pushHist(x, "contato", "Ficha da inscrição importada · " + pecas.length
              + (pecas.length === 1 ? " resposta" : " respostas"));
          }
        }
      });
    });
    return { ok: true, criados: criados, atualizados: atualizados, pulados: pulados,
      contatosCompletados: contatosCompletados };
  }

  // ── O QUE A ESCOLA VAI RECEBER ────────────────────────────────
  //
  // A pergunta é simples e não tinha resposta em lugar nenhum: quanto
  // entra em cada um dos próximos meses, e de quem.
  function previsaoRecebimento(nMeses) {
    var n = nMeses || 12;
    var chave = mesAtualKey();
    var ordem = [];
    for (var i = 0; i < n; i++) { ordem.push(chave); chave = mesSeguinte(chave).key; }
    var dentro = {};
    ordem.forEach(function (k) { dentro[k] = true; });

    var porMes = {};
    ordem.forEach(function (k) {
      porMes[k] = { key: k, label: MES_NOMES[parseInt(k.slice(5, 7), 10) - 1],
        ano: k.slice(0, 4), pessoas: [],
        recebido: { "R$": 0, "€": 0 }, aReceber: { "R$": 0, "€": 0 },
        atrasado: { "R$": 0, "€": 0 } };
    });

    var hoje = iso(today());
    loadPessoas().forEach(function (p) {
      (p.contratos || []).forEach(function (c) {
        var moeda = c.moeda || p.moeda || "R$";
        var dia = parseInt(c.vencDia, 10); if (isNaN(dia)) dia = 10;
        (c.meses || []).forEach(function (m) {
          if (!dentro[m.key] || !m.valor) return;
          var v = parseMoney(m.valor);
          var venc = m.key + "-" + (dia < 10 ? "0" : "") + dia;
          var estado = m.pago ? "recebido" : (venc < hoje ? "atrasado" : "aReceber");
          porMes[m.key][estado][moeda] += v;
          porMes[m.key].pessoas.push({ id: p.id, nome: p.nome, moeda: moeda,
            valor: v, valorLabel: m.valor, estado: estado, venc: venc });
        });
      });
    });

    var lista = ordem.map(function (k) {
      var m = porMes[k];
      m.pessoas.sort(function (a, b) { return b.valor - a.valor; });
      m.totalReais = emReais(m.recebido) + emReais(m.aReceber) + emReais(m.atrasado);
      m.previstoReais = emReais(m.aReceber) + emReais(m.atrasado);
      m.n = m.pessoas.length;
      return m;
    });
    var acumulado = 0;
    lista.forEach(function (m) { acumulado += m.previstoReais; m.acumuladoReais = acumulado; });

    return { meses: lista,
      totalPrevistoReais: acumulado,
      totalReais: lista.reduce(function (s, m) { return s + m.totalReais; }, 0) };
  }

  // ── ORÇAMENTO: PREVISTO × REALIZADO ───────────────────────────
  //
  // A pergunta de quem gere: quanto eu ESPERO receber e gastar neste mês,
  // e quanto de fato aconteceu. O previsto nasce calculado (contratos para
  // a receita, custos fixos + folha para a despesa) e pode ser ajustado à
  // mão, linha a linha — o ajuste vale só para aquele mês. O realizado vem
  // do que os extratos confirmaram: parcelas conciliadas, folha quitada e
  // despesas lançadas. Tudo consolidado em reais, porque comparar previsto
  // com realizado em duas moedas separadas não compara nada.
  var ORCAMENTO_KEY = "isr_orcamento_v1";
  function orcamentoAll() {
    try { return JSON.parse(localStorage.getItem(ORCAMENTO_KEY)) || {}; } catch (e) { return {}; }
  }
  function setOrcamento(mesKey, id, valor) {
    var o = orcamentoAll();
    var k = mesKey || mesAtualKey();
    o[k] = o[k] || {};
    var v = parseFloat(valor);
    if (valor === null || valor === "" || isNaN(v)) delete o[k][id];
    else o[k][id] = v;
    try { localStorage.setItem(ORCAMENTO_KEY, JSON.stringify(o)); } catch (e) {}
    agendarSync();
    return o[k];
  }

  function orcamentoDoMes(key) {
    var k = key || mesAtualKey();
    var fin = financeiroMes(k);
    var ov = orcamentoAll()[k] || {};
    var cambio = configPagamento().cambioEur || 0;
    var umReal = function (valor, moeda) { return moeda === "€" ? valor * cambio : valor; };

    // ── receita ──
    var recPrevCalc = emReais(fin.previsto);
    var recReal = emReais(fin.recebido);

    // ── despesa prevista por categoria: custos fixos + folha ──
    var prev = {};
    custosDoMes(k).forEach(function (c) {
      var cat = c.categoria || "outros";
      prev[cat] = (prev[cat] || 0) + umReal(c.valor, c.moeda);
    });
    folhaNoCaixa(k).forEach(function (c) {
      prev.equipe = (prev.equipe || 0) + umReal(c.valor, c.moeda);
    });

    // ── despesa realizada ──
    // Contava só lançamento e folha quitada, enquanto a receita realizada
    // contava tudo que entrou. Com duas réguas diferentes, o quadro dava
    // despesa zero e resultado igual à receita, contradizendo o topo da
    // tela. Agora sai da mesma lista que o resultado do mês usa — custo
    // fixo, folha e lançamento — para que as duas contas fechem.
    var real = {};
    fin.saidas.forEach(function (s) {
      var cat = s.categoria || "outros";
      real[cat] = (real[cat] || 0) + umReal(s.valor, s.moeda);
    });

    var linhas = [{
      id: "receita", label: "Receitas", entrada: true,
      previsto: ov.receita !== undefined ? ov.receita : recPrevCalc,
      calculado: recPrevCalc, definido: ov.receita !== undefined,
      realizado: recReal
    }];
    catsSaida().forEach(function (cat) {
      var ovId = "cat_" + cat.id;
      var pCalc = prev[cat.id] || 0;
      var r = real[cat.id] || 0;
      var p = ov[ovId] !== undefined ? ov[ovId] : pCalc;
      if (!p && !r && ov[ovId] === undefined) return; // categoria sem nada não é linha
      linhas.push({ id: ovId, label: cat.label, cor: cat.cor, entrada: false,
        previsto: p, calculado: pCalc, definido: ov[ovId] !== undefined,
        realizado: r });
    });

    var prevDespesa = linhas.filter(function (l) { return !l.entrada; })
      .reduce(function (s, l) { return s + l.previsto; }, 0);
    var realDespesa = linhas.filter(function (l) { return !l.entrada; })
      .reduce(function (s, l) { return s + l.realizado; }, 0);
    var prevReceita = linhas[0].previsto;

    return { mes: k, linhas: linhas, cambio: cambio,
      prevReceita: prevReceita, realReceita: recReal,
      prevDespesa: prevDespesa, realDespesa: realDespesa,
      resultadoPrevisto: prevReceita - prevDespesa,
      resultadoRealizado: recReal - realDespesa };
  }

  // Receita contada duas vezes no mesmo mês. São duas formas:
  //
  //   a mesma pessoa com assinatura E acompanhamento do mesmo valor —
  //   o produto foi cadastrado duas vezes e cobra dobrado no Caixa;
  //
  //   dois lançamentos de mesmo valor no mês — o mesmo dinheiro digitado
  //   e depois lançado a partir do extrato.
  //
  // Nenhuma das duas o sistema pode desfazer por conta própria: dois
  // pagamentos iguais no mesmo mês existem. Ele aponta, quem decide é
  // quem conhece o caso.
  function duplicidadesDeReceita(key) {
    var k = key || mesAtualKey();
    var fin = financeiroMes(k);
    var recorrentes = [], lancamentos = [];
    var porPessoa = {};
    fin.entradas.forEach(function (e) {
      if (!e.recorrente || !e.pessoaId) return;
      var kk = e.pessoaId + "|" + e.moeda + "|" + e.valor.toFixed(2);
      (porPessoa[kk] = porPessoa[kk] || []).push(e);
    });
    Object.keys(porPessoa).forEach(function (kk) {
      var l = porPessoa[kk];
      if (l.length < 2) return;
      recorrentes.push({ pessoaId: l[0].pessoaId, nome: l[0].nome, moeda: l[0].moeda,
        valor: l[0].valor, quantas: l.length,
        produtos: l.map(function (x) { return x.categoria; }) });
    });
    var porValor = {};
    fin.entradas.forEach(function (e) {
      if (!e.lancId) return;
      var kk = e.moeda + "|" + e.valor.toFixed(2);
      (porValor[kk] = porValor[kk] || []).push(e);
    });
    Object.keys(porValor).forEach(function (kk) {
      var l = porValor[kk];
      if (l.length < 2) return;
      lancamentos.push({ moeda: l[0].moeda, valor: l[0].valor, quantas: l.length,
        nomes: l.map(function (x) { return x.nome; }),
        ids: l.map(function (x) { return x.lancId; }) });
    });
    return { recorrentes: recorrentes, lancamentos: lancamentos,
      total: recorrentes.length + lancamentos.length };
  }

  // ══════════════════════════════════════════════════════════════
  //  AUDITORIA DOS DADOS
  //
  //  A conferência diz que um número não fecha. Isto vai atrás do
  //  MOTIVO, em toda a base, e conserta o que dá para consertar sem
  //  perguntar. O que sobra vem agrupado por tipo, com a evidência —
  //  não uma linha de cada vez.
  //
  //  A régua para "corrigir sozinho": só quando existe evidência no
  //  próprio dado de qual dos dois lados é o certo. Onde a evidência
  //  não decide, o problema é listado e fica esperando — inventar o
  //  dado da escola é pior do que apontar o conflito.
  // ══════════════════════════════════════════════════════════════
  function auditoriaDados() {
    var problemas = [];
    var pessoas = loadPessoas();
    var mesesOlhados = mesesFinanceiro(3, 1).map(function (m) { return m.key; });

    // 1. A mesma pessoa com assinatura E acompanhamento do mesmo valor.
    //    Cobra dobrado no Caixa todo mês. Fica o produto que já foi
    //    visto no extrato; se nenhum foi, fica o que mais gente tem —
    //    produto coletivo é o real, o solitário é o cadastro repetido.
    var quantosTem = { assinatura: 0, programa: 0 };
    pessoas.forEach(function (p) {
      if (p.assinatura && p.assinatura.valor && !p.assinatura.encerrada) quantosTem.assinatura++;
      if (p.programa && p.programa.valor && !p.programa.encerrado) quantosTem.programa++;
    });
    pessoas.forEach(function (p) {
      var a = p.assinatura, g = p.programa;
      if (!a || !g || !a.valor || !g.valor) return;
      if (a.encerrada || g.encerrado) return;
      if (Math.abs(parseMoney(a.valor) - parseMoney(g.valor)) > 0.01) return;
      if ((a.moeda || p.moeda) !== (g.moeda || p.moeda)) return;
      var confA = Object.keys(a.confirmados || {}).length;
      var confG = Object.keys(g.confirmados || {}).length;
      var remover = "";
      if (confA && !confG) remover = "programa";
      else if (confG && !confA) remover = "assinatura";
      else if (!confA && !confG)
        remover = quantosTem.programa > quantosTem.assinatura ? "assinatura" : "programa";
      problemas.push({
        id: "dup_rec|" + p.id, tipo: "recorrente_duplicado", gravidade: "alta",
        pessoaId: p.id, nome: p.nome, alvo: remover,
        titulo: p.nome + " tem duas cobranças recorrentes de "
          + fmtMoney(a.moeda || p.moeda || "€", parseMoney(a.valor)),
        detalhe: "Assinatura e " + (g.nome || "Acompanhamento")
          + " com o mesmo valor: o Caixa conta os dois todo mês."
          + (remover
              ? " " + (confA || confG
                  ? "O extrato confirma " + (remover === "assinatura" ? (g.nome || "o acompanhamento") : "a assinatura")
                    + ", então o outro sai."
                  : "Nenhum dos dois foi visto no extrato; "
                    + quantosTem[remover === "assinatura" ? "programa" : "assinatura"]
                    + " pessoas têm o que fica e este é o repetido.")
              : ""),
        seguro: !!remover && !(confA && confG),
        rotuloCorrecao: remover === "assinatura" ? "Remover a assinatura"
          : (remover === "programa" ? "Remover o acompanhamento" : "")
      });
    });

    // 2. Dois lançamentos de entrada iguais no mesmo mês: o mesmo
    //    dinheiro digitado à mão e depois lançado do extrato. Fica o do
    //    extrato — ele tem conta e prova; o digitado sai.
    mesesOlhados.forEach(function (k) {
      var porValor = {};
      lancamentosDoMes(k).forEach(function (l) {
        if (l.tipo !== "entrada") return;
        var kk = l.moeda + "|" + Number(l.valor).toFixed(2);
        (porValor[kk] = porValor[kk] || []).push(l);
      });
      Object.keys(porValor).forEach(function (kk) {
        var l = porValor[kk];
        if (l.length < 2) return;
        var comConta = l.filter(function (x) { return !!x.conta; });
        var semConta = l.filter(function (x) { return !x.conta; });
        problemas.push({
          id: "dup_lanc|" + k + "|" + kk, tipo: "lancamento_duplicado", gravidade: "alta",
          alvo: (comConta.length && semConta.length) ? semConta[0].id : "",
          titulo: l.length + " lançamentos de " + fmtMoney(l[0].moeda, l[0].valor)
            + " em " + mesLabelDe(k),
          detalhe: l.map(function (x) { return x.descricao; }).join(" · ")
            + ". " + (comConta.length && semConta.length
                ? "Um veio do extrato e o outro foi digitado: o digitado sai."
                : "Nenhum tem conta de origem: confira qual é o repetido."),
          seguro: !!(comConta.length && semConta.length),
          rotuloCorrecao: "Remover o lançamento digitado"
        });
      });
    });

    // Contrato em real com cobrança em euro NÃO é problema: é o desenho
    // da escola, aluna brasileira pagando pelo gateway europeu. Quem
    // resolve isso é a conciliação, que converte pelo câmbio — não uma
    // pendência para alguém arrumar.

    // 3. Duas fichas para a mesma pessoa: mesmo e-mail, ou nome igual.
    //    Juntar cadastro é risco (histórico, contrato, acesso): aqui só
    //    aponta, com os dois nomes.
    var porEmail = {}, porNome = {};
    pessoas.forEach(function (p) {
      var e = String(p.email || "").trim().toLowerCase();
      if (e) (porEmail[e] = porEmail[e] || []).push(p);
      var n = semAcento(p.nome || "");
      if (n) (porNome[n] = porNome[n] || []).push(p);
    });
    var jaVisto = {};
    [porEmail, porNome].forEach(function (mapa, idx) {
      Object.keys(mapa).forEach(function (k) {
        var l = mapa[k];
        if (l.length < 2) return;
        var chave = l.map(function (x) { return x.id; }).sort().join("+");
        if (jaVisto[chave]) return;
        jaVisto[chave] = 1;
        problemas.push({
          id: "dup_pessoa|" + chave, tipo: "pessoa_duplicada", gravidade: "media",
          pessoaId: l[0].id, nome: l[0].nome,
          titulo: l.length + " fichas para " + l[0].nome,
          detalhe: (idx === 0 ? "Mesmo e-mail: " : "Mesmo nome: ")
            + l.map(function (x) { return x.nome + " (" + (x.status || "sem status") + ")"; }).join(" · ")
            + ". Cada ficha cobra por conta, então a receita pode estar contada duas vezes.",
          seguro: false, rotuloCorrecao: ""
        });
      });
    });

    // 5. Parcela marcada como paga que nunca apareceu em conta nenhuma.
    //    Não é erro por si — é o que sustenta o "presumido" do Caixa.
    //    Vem agrupado por mês, para virar uma tarefa e não trinta.
    var porMes = {};
    mesesOlhados.forEach(function (k) {
      var l = parcelasPagasSemExtrato().filter(function (a) { return a.mesKey === k; });
      if (l.length) porMes[k] = l;
    });
    Object.keys(porMes).forEach(function (k) {
      var l = porMes[k];
      var total = {};
      l.forEach(function (a) { total[a.moeda] = (total[a.moeda] || 0) + a.valor; });
      problemas.push({
        id: "sem_extrato|" + k, tipo: "pago_sem_extrato", gravidade: "media",
        titulo: l.length + " parcelas de " + mesLabelDe(k) + " marcadas como pagas sem linha de banco",
        detalhe: Object.keys(total).map(function (m) { return fmtMoney(m, total[m]); }).join(" + ")
          + " · " + unicos(l.map(function (a) { return firstName(a.nome); })).slice(0, 8).join(", ")
          + ". Importe o extrato do mês: cada uma que aparecer vira confirmada.",
        seguro: false, rotuloCorrecao: ""
      });
    });

    var seguros = problemas.filter(function (x) { return x.seguro; });
    return { problemas: problemas, total: problemas.length,
      seguras: seguros.length, revisar: problemas.length - seguros.length };
  }

  // Aplica UMA correção. Só as marcadas como seguras têm o que aplicar:
  // as outras dependem de informação que só a escola tem.
  function aplicarCorrecao(prob) {
    if (!prob || !prob.seguro) return { ok: false, msg: "Esta correção depende de uma decisão sua." };
    if (prob.tipo === "recorrente_duplicado") {
      var p0 = getPessoa(prob.pessoaId);
      if (!p0) return { ok: false, msg: "Ficha não encontrada." };
      var qual = prob.alvo;
      mutate(prob.pessoaId, function (p) {
        var nome = qual === "assinatura" ? "Assinatura" : ((p.programa && p.programa.nome) || "Acompanhamento");
        if (qual === "assinatura") delete p.assinatura; else delete p.programa;
        pushHist(p, "estagio", nome + " removida · cobrança repetida do mesmo valor");
      });
      return { ok: true, msg: "Cobrança repetida de " + p0.nome + " removida." };
    }
    if (prob.tipo === "lancamento_duplicado") {
      if (!prob.alvo) return { ok: false, msg: "Sem lançamento identificado para remover." };
      removeLancamento(prob.alvo);
      return { ok: true, msg: "Lançamento repetido removido." };
    }
    return { ok: false, msg: "Correção desconhecida." };
  }

  // Todas as seguras de uma vez: é o que transforma trinta decisões em
  // um clique.
  function aplicarCorrecoesSeguras() {
    var feitas = 0, msgs = [];
    auditoriaDados().problemas.forEach(function (prob) {
      if (!prob.seguro) return;
      var r = aplicarCorrecao(prob);
      if (r.ok) { feitas++; msgs.push(r.msg); }
    });
    return { feitas: feitas, msgs: msgs };
  }

  // ── CONFERÊNCIA FINANCEIRA ────────────────────────────────────
  //
  // Um número na tela não vale nada se ninguém sabe de onde ele veio.
  // Isto refaz as contas por caminhos diferentes e compara. Se duas
  // contas do mesmo dinheiro não batem, aparece aqui — em vez de a
  // pessoa descobrir meses depois, ou nunca.
  //
  // Cada verificação diz o que comparou, não só "ok". Confiança se
  // constrói mostrando a conta, não afirmando que está certa.
  function conferenciaFinanceira(key) {
    var k = key || mesAtualKey();
    var cfg = configPagamento();
    var moeda = cfg.moeda || "R$";
    var fin = financeiroMes(k);
    var folha = folhaPagamento(k);
    var checks = [];
    var cent = function (v) { return Math.round(v * 100); };
    // "info" é estado do trabalho, não erro de dado: aparece na lista com
    // o número, mas não reprova o mês. Conciliação que ainda não foi feita
    // não é inconsistência.
    var add = function (id, titulo, ok, esperado, obtido, detalhe, info) {
      checks.push({ id: id, titulo: titulo, ok: ok, info: !!info,
        esperado: esperado, obtido: obtido, detalhe: detalhe || "" });
    };

    // 1. Toda parcela tem mês e valor. Sem os dois ela não é cobrável
    //    nem entra no Caixa — some sem avisar.
    var semDado = [];
    loadPessoas().forEach(function (p) {
      (p.contratos || []).forEach(function (c) {
        (c.meses || []).forEach(function (m) {
          if (!m.key || !m.valor) semDado.push(p.nome);
        });
      });
    });
    add("parcelas_completas", "Toda parcela tem mês e valor",
      semDado.length === 0, "0 incompletas", semDado.length + " incompletas",
      semDado.length ? "Sem mês ou sem valor: " + unicos(semDado).join(", ") : "");

    // 2. O que o Caixa diz que entra no mês é a soma das parcelas do mês.
    var somaEntradas = { "R$": 0, "€": 0 };
    fin.entradas.forEach(function (e) {
      if (somaEntradas[e.moeda] === undefined) somaEntradas[e.moeda] = 0;
      somaEntradas[e.moeda] += e.valor;
    });
    var declarado = { "R$": fin.recebido["R$"] + fin.aReceber["R$"] + fin.atrasado["R$"],
                      "€": fin.recebido["€"] + fin.aReceber["€"] + fin.atrasado["€"] };
    var entradaBate = cent(somaEntradas["R$"]) === cent(declarado["R$"])
      && cent(somaEntradas["€"]) === cent(declarado["€"]);
    add("entradas_fecham", "Recebido + a receber + atrasado = todas as entradas",
      entradaBate,
      fmtMoney("R$", somaEntradas["R$"]) + " e " + fmtMoney("€", somaEntradas["€"]),
      fmtMoney("R$", declarado["R$"]) + " e " + fmtMoney("€", declarado["€"]));

    // 3. Nada de moedas somadas entre si. Cada entrada tem uma moeda só e
    //    ela é a do contrato.
    var moedaErrada = [];
    loadPessoas().forEach(function (p) {
      (p.contratos || []).forEach(function (c) {
        if (c.moeda && p.moeda && c.moeda !== p.moeda) moedaErrada.push(p.nome);
      });
    });
    add("moeda_coerente", "Contrato e cadastro na mesma moeda",
      moedaErrada.length === 0, "0 divergências",
      moedaErrada.length + " divergências",
      moedaErrada.length
        ? "Vale a moeda do contrato: " + unicos(moedaErrada).join(", ")
        : "Euro convertido a " + fmtMoney("R$", cfg.cambioEur) + " só na hora de somar tudo");

    // 4. O total da folha é a soma das linhas dela.
    var somaLinhas = folha.linhas.reduce(function (s, x) { return s + x.total; }, 0)
      + (folha.fixos || []).reduce(function (s, x) { return s + x.total; }, 0);
    add("folha_fecha", "O total da folha é a soma das linhas",
      cent(somaLinhas) === cent(folha.totalComFixos),
      fmtMoney(moeda, somaLinhas), fmtMoney(moeda, folha.totalComFixos));

    // 5. A folha do mês aparece no Caixa como saída, pelo mesmo valor.
    var naSaida = fin.saidas.filter(function (s) { return s.origem === "folha" || s.origem === "folha_fixo"; })
      .reduce(function (s, x) { return s + x.valor; }, 0);
    add("folha_no_caixa", "A folha entra no Caixa como despesa",
      cent(naSaida) === cent(folha.totalComFixos),
      fmtMoney(moeda, folha.totalComFixos), fmtMoney(moeda, naSaida),
      "O maior custo da escola é calculado, não digitado");

    // 6. A comissão também.
    var com = comissaoAPagar(k);
    var comNoCaixa = fin.saidas.filter(function (s) { return s.origem === "comissao"; })
      .reduce(function (s, x) { return s + x.valor; }, 0);
    add("comissao_no_caixa", "A comissão liberada entra no Caixa",
      cent(comNoCaixa) === cent(com.total),
      fmtMoney(moeda, com.total), fmtMoney(moeda, comNoCaixa),
      com.totalAguardando
        ? fmtMoney(moeda, com.totalAguardando) + " ainda aguardam a aluna pagar"
        : "");

    // 7. Custo digitado à mão que repete a folha é dinheiro contado duas
    //    vezes. Acontece com quem lançava "Professoras" como custo fixo.
    var duplicados = custosDoMes(k).filter(function (c) {
      return (c.categoria === "equipe") || /profess|equipe|folha/i.test(c.nome || "");
    });
    // lançamento avulso com nome de gente da folha é a mesma dupla contagem
    // por outra porta (um Pix do extrato lançado como despesa, por exemplo)
    var nomesFolha = folha.linhas.map(function (l) { return semAcento(l.nome); })
      .concat((folha.fixos || []).map(function (x) { return semAcento(x.nome); }));
    var lancDuplicados = lancamentosDoMes(k).filter(function (l) {
      if (l.tipo !== "saida") return false;
      var d = semAcento(l.descricao || "");
      return l.categoria === "equipe" || nomesFolha.some(function (n) {
        var partes = n.split(/\s+/).filter(function (p) { return p.length >= 4; });
        return partes.length && partes.filter(function (p) { return d.indexOf(p) >= 0; }).length
          >= Math.min(2, partes.length);
      });
    });
    var todosDuplicados = duplicados.map(function (c) { return c.nome; })
      .concat(lancDuplicados.map(function (l) { return l.descricao; }));
    add("sem_duplicidade", "Nenhum custo digitado repete a folha",
      todosDuplicados.length === 0, "0 suspeitos", todosDuplicados.length + " suspeitos",
      todosDuplicados.length
        ? "A folha já é calculada. Remova em Caixa: " + todosDuplicados.join(", ")
        : "");

    // 7b. Custo fixo digitado que também foi lançado a partir do extrato:
    //     o mesmo gasto entra duas vezes e o mês fecha pior do que é.
    //     Só o custo fixo entra aqui — a folha já é o item 7.
    var lancSaidaMes = lancamentosDoMes(k).filter(function (l) { return l.tipo === "saida"; });
    var fixoDobrado = custosDoMes(k).filter(function (c) {
      if (c.categoria === "equipe") return false;
      return lancSaidaMes.some(function (l) {
        return l.moeda === c.moeda && Math.abs(l.valor - c.valor) <= 0.02;
      });
    }).map(function (c) { return c.nome + " (" + fmtMoney(c.moeda, c.valor) + ")"; });
    add("custo_fixo_sem_dobra", "Nenhum custo fixo repete um lançamento do extrato",
      fixoDobrado.length === 0, "0 suspeitos", fixoDobrado.length + " suspeitos",
      fixoDobrado.length
        ? "Mesmo valor digitado como custo fixo e lançado do extrato: " + fixoDobrado.join(", ")
          + ". Mantenha um dos dois."
        : "");

    // 7b-bis. As duas contas do mês têm que fechar entre si. O topo da tela
    //     diz "entrou menos saiu"; o quadro Previsto × Realizado refaz a
    //     mesma conta por categoria. Se divergirem, uma das duas está
    //     medindo com régua diferente — foi o que aconteceu quando a
    //     despesa realizada contava só o que já tinha saído do banco e a
    //     receita realizada contava tudo. Quem lê não tem como saber qual
    //     acreditar, então a divergência precisa aparecer aqui.
    var orcCoer = orcamentoDoMes(k);
    var difReceita = Math.abs(orcCoer.realReceita - fin.totalReais.recebido);
    var difDespesa = Math.abs(orcCoer.realDespesa - fin.totalReais.saiu);
    var fecha = cent(difReceita) <= 1 && cent(difDespesa) <= 1;
    add("orcamento_fecha_com_o_mes", "O quadro por categoria fecha com o resultado do mês",
      fecha, "as duas contas batem", "as contas divergem",
      fecha ? "Receita e despesa realizadas somam o mesmo dos dois lados da tela"
        : "O resultado do mês usa " + fmtMoney("R$", fin.totalReais.recebido) + " de entrada e "
          + fmtMoney("R$", fin.totalReais.saiu) + " de saída; o quadro por categoria usa "
          + fmtMoney("R$", orcCoer.realReceita) + " e " + fmtMoney("R$", orcCoer.realDespesa)
          + ". Alguma despesa não está caindo em categoria nenhuma.",
      true);

    // 7c. Quanto do mês pode ser conferido no banco. Com tudo passando
    //     pelas contas, o que não tem linha de extrato atrás é estimativa
    //     — e estimativa somada a dinheiro real produz resultado que
    //     ninguém consegue auditar.
    var foraDoExtrato = fin.totalReais.presumido + fin.totalReais.saiuPresumido;
    add("mes_tem_extrato", "Todo o movimento do mês tem extrato atrás",
      cent(foraDoExtrato) === 0,
      "0 fora do extrato", fmtMoney("R$", foraDoExtrato) + " fora do extrato",
      cent(foraDoExtrato) === 0
        ? "Entrada e despesa conferidas linha a linha"
        : fmtMoney("R$", fin.totalReais.presumido) + " de entrada e "
          + fmtMoney("R$", fin.totalReais.saiuPresumido) + " de despesa entram por cadastro. "
          + "Pelo extrato, o mês fecha em "
          + (fin.totalReais.resultadoConfirmado >= 0 ? "lucro de " : "prejuízo de ")
          + fmtMoney("R$", Math.abs(fin.totalReais.resultadoConfirmado)) + ".",
      true);

    // 7d. Receita contada duas vezes: a mesma pessoa com dois produtos
    //     recorrentes do mesmo valor, ou o mesmo valor lançado duas vezes
    //     no mês. Infla o resultado sem ninguém perceber.
    var dup = duplicidadesDeReceita(k);
    var textoDup = dup.recorrentes.map(function (d) {
      return d.nome + " (" + fmtMoney(d.moeda, d.valor) + " em "
        + d.quantas + " cobranças recorrentes)";
    }).concat(dup.lancamentos.map(function (d) {
      return d.quantas + " lançamentos de " + fmtMoney(d.moeda, d.valor)
        + ": " + d.nomes.join(" e ");
    }));
    add("receita_sem_duplicidade", "Nenhuma receita contada duas vezes no mês",
      dup.total === 0, "0 suspeitas", dup.total + " suspeitas",
      textoDup.length
        ? textoDup.join(" · ") + ". Confira se são dois pagamentos ou o mesmo contado duas vezes."
        : "");

    // 8. Aluna ativa sem contrato é receita que ninguém vai cobrar.
    var semContrato = loadPessoas().filter(function (p) {
      return p.status === "aluna" && !contratoVigente(p);
    });
    add("alunas_com_contrato", "Toda aluna ativa tem contrato vigente",
      semContrato.length === 0, "0 sem contrato",
      semContrato.length + " sem contrato",
      semContrato.length
        ? unicos(semContrato.map(function (p) { return p.nome; })).join(", ")
        : "");

    // 9. O que a Cobrança mostra em aberto é o que o Caixa espera receber.
    //    A comparação é sobre a mesma população — as alunas que a tela de
    //    Cobrança lista — e por dois caminhos diferentes: a ficha de
    //    cobrança de um lado, o Caixa do outro.
    var naCobranca = getCobranca();
    var idsCobranca = {};
    var abertoCobranca = { "R$": 0, "€": 0 };
    naCobranca.forEach(function (cb) {
      idsCobranca[cb.id] = 1;
      var m = cb.moeda || "R$";
      (cb.meses || []).forEach(function (x) {
        if (x.key === k && !x.pago && !x.cancelada && x.valor) {
          if (abertoCobranca[m] === undefined) abertoCobranca[m] = 0;
          abertoCobranca[m] += parseMoney(x.valor);
        }
      });
    });
    // sinal, lançamento avulso e cobrança automática (assinatura,
    // acompanhamento) não passam pela tela de Cobrança
    var abertoCaixa = { "R$": 0, "€": 0 };
    fin.entradas.forEach(function (e) {
      if (e.pago || e.recorrente || e.lancId || e.categoria === "sinal") return;
      if (!e.pessoaId || !idsCobranca[e.pessoaId]) return;
      if (abertoCaixa[e.moeda] === undefined) abertoCaixa[e.moeda] = 0;
      abertoCaixa[e.moeda] += e.valor;
    });
    add("cobranca_bate_caixa", "O que está em aberto é o mesmo nas duas telas",
      cent(abertoCobranca["R$"]) === cent(abertoCaixa["R$"])
        && cent(abertoCobranca["\u20ac"]) === cent(abertoCaixa["\u20ac"]),
      fmtMoney("R$", abertoCobranca["R$"]) + " e " + fmtMoney("\u20ac", abertoCobranca["\u20ac"]),
      fmtMoney("R$", abertoCaixa["R$"]) + " e " + fmtMoney("\u20ac", abertoCaixa["\u20ac"]));

    // 9b. Parcela a vencer de quem já saiu não é receita — e some do
    //     Caixa. Se sobrar alguma marcada assim, é dado a arrumar.
    var fantasmas = [];
    loadPessoas().forEach(function (p) {
      var ativa = ["aluna", "mvs", "pausada", "programa"].indexOf(p.status) >= 0
        && p.estagio !== "perdido";
      if (ativa) return;
      (p.contratos || []).forEach(function (c) {
        var dia = parseInt(c.vencDia, 10); if (isNaN(dia)) dia = 10;
        (c.meses || []).forEach(function (m) {
          if (m.pago || m.cancelada || !m.valor || m.key !== k) return;
          var venc = m.key + "-" + (dia < 10 ? "0" : "") + dia;
          if (venc >= iso(today())) fantasmas.push(p.nome);
        });
      });
    });
    add("saida_sem_cobranca", "Ninguém que saiu está gerando parcela a vencer",
      fantasmas.length === 0, "0 pessoas", fantasmas.length + " pessoas",
      fantasmas.length
        ? "Fora do Caixa, mas ainda marcadas na ficha: " + unicos(fantasmas).join(", ")
        : "");

    // 10. O resultado é entrada menos saída, sem atalho.
    var res = { "R$": fin.recebido["R$"] - fin.saiu["R$"],
                "€": fin.recebido["€"] - fin.saiu["€"] };
    add("resultado_fecha", "Resultado = o que entrou menos o que saiu",
      cent(res["R$"]) === cent(fin.resultado["R$"])
        && cent(res["€"]) === cent(fin.resultado["€"]),
      fmtMoney("R$", res["R$"]) + " e " + fmtMoney("€", res["€"]),
      fmtMoney("R$", fin.resultado["R$"]) + " e " + fmtMoney("€", fin.resultado["€"]));

    var falhas = checks.filter(function (c) { return !c.ok && !c.info; });
    return { mes: k, checks: checks, total: checks.length,
      passaram: checks.length - falhas.length, falhas: falhas,
      ok: falhas.length === 0 };
  }

  function unicos(l) {
    var vis = {}, out = [];
    l.forEach(function (x) { if (!vis[x]) { vis[x] = 1; out.push(x); } });
    return out;
  }

  // ── EXPECTATIVA, EM CAMADAS DE CONFIANÇA ──────────────────────
  // Somar tudo num número só é o jeito mais fácil de se enganar.
  function taxaConversao() {
    var ps = loadPessoas();
    var virou = ps.filter(function (p) { return p.status === "aluna" || p.estagio === "matriculado"; }).length;
    return ps.length > 0 ? virou / ps.length : 0.3;
  }
  function ticketMedio(moeda) {
    var vals = [];
    loadPessoas().forEach(function (p) {
      var c = contratoVigente(p);
      if (c && (c.moeda || p.moeda) === moeda && c.parcelaValor) vals.push(parseMoney(c.parcelaValor));
    });
    if (!vals.length) return 0;
    return vals.reduce(function (a, b) { return a + b; }, 0) / vals.length;
  }
  function previsaoMes(key) {
    var f = financeiroMes(key);
    var futuro = key >= mesAtualKey();
    var leadsAtivos = loadPessoas().filter(function (p) {
      return p.status === "lead" && p.estagio !== "perdido" && p.estagio !== "matriculado";
    }).length;
    var conv = taxaConversao();
    var pipeline = { "R$": 0, "€": 0 };
    if (futuro) {
      pipeline["R$"] = Math.round(leadsAtivos * conv * ticketMedio("R$"));
      pipeline["€"] = Math.round(leadsAtivos * conv * ticketMedio("€"));
    }
    return {
      confirmado: f.recebido,     // já caiu na conta
      contratado: f.aReceber,     // contrato ativo, ainda não venceu
      emRisco: f.atrasado,        // venceu e não pagou
      pipeline: pipeline,         // negociações em aberto × conversão histórica
      leadsAtivos: leadsAtivos, conversao: Math.round(conv * 100),
      otimista: { "R$": f.previsto["R$"] + pipeline["R$"], "€": f.previsto["€"] + pipeline["€"] },
      conservador: { "R$": f.recebido["R$"] + f.aReceber["R$"], "€": f.recebido["€"] + f.aReceber["€"] }
    };
  }

  // ── SÉRIE (passado + futuro) pro gráfico e pra tendência ──────
  function financeiroSerie(back, fwd) {
    return mesesFinanceiro(back, fwd).map(function (m) {
      var f = financeiroMes(m.key);
      return { key: m.key, label: m.label, curto: m.curto, offset: m.offset,
        recebido: f.recebido, aReceber: f.aReceber, atrasado: f.atrasado,
        saiu: f.saiu, resultado: f.resultado, meta: f.meta,
        recebidoReais: emReais(f.recebido), saiuReais: emReais(f.saiu),
        previstoReais: emReais(f.previsto), metaReais: emReais(f.meta),
        resultadoReais: emReais(f.recebido) - emReais(f.saiu) };
    });
  }

  // ── RESUMO PRONTO PRA ATA DA REUNIÃO DE TERÇA ─────────────────
  function resumoFinanceiroTexto(key) {
    var f = financeiroMes(key);
    var pv = previsaoMes(key);
    var mes = mesesFinanceiro(12, 12).filter(function (m) { return m.key === key; })[0];
    var lin = function (rot, por) {
      var partes = [];
      if (por["R$"]) partes.push(fmtMoney("R$", por["R$"]));
      if (por["€"]) partes.push(fmtMoney("€", por["€"]));
      return rot + ": " + (partes.join(" + ") || "—");
    };
    var top = function (mapa, cats) {
      return Object.keys(mapa).map(function (id) {
        return "  · " + catMeta(cats, id).label + " — " + lin("", mapa[id]).replace(": ", "");
      }).join("\n");
    };
    return [
      "FINANCEIRO · " + (mes ? mes.label : key),
      "",
      lin("Entrou", f.recebido),
      top(f.porCatEntrada, CAT_ENTRADA),
      "",
      lin("Saiu", f.saiu),
      top(f.porCatSaida, catsSaida()),
      "",
      lin("Sobrou", f.resultado),
      lin("Ainda a receber", f.aReceber),
      lin("Atrasado (em risco)", f.atrasado),
      "",
      "Meta do mês: " + lin("", f.meta).replace(": ", "") +
        " · atingido " + f.pctMeta["R$"] + "% em R$ / " + f.pctMeta["€"] + "% em €",
      "Ponto de equilíbrio: " + lin("", f.pontoEquilibrio).replace(": ", ""),
      "Pipeline: " + pv.leadsAtivos + " negociações abertas · conversão histórica " + pv.conversao + "%"
    ].join("\n");
  }

  // ══════════════════════════════════════════════════════════════
  //  TABELA DE PREÇOS E NEGOCIAÇÃO
  //  ------------------------------------------------------------
  //  A escola vende CICLO (3 meses), não mensalidade. Tudo aqui é
  //  o preço do ciclo; o "por mês" é só referência de comparação.
  //  Origem: planilha "calculadora de negociação ISR 2.0".
  // ══════════════════════════════════════════════════════════════
  var CICLO_MESES = 3;
  // Regra da escola: até 4× no ciclo de 3 meses, até 7× no de 6.
  var MAX_PARCELAS_POR_CICLO = { 1: 4, 2: 7 };
  var PRECOS_PADRAO = [
    { id: "grupo_brl", nome: "Turma online (grupo) BRL", moeda: "R$", ciclo: 1495,
      descAvista: 10, descParcelado: 5, desc2Ciclos: 5, descRenovacao: 5, maxParcelas: 4, obs: "" },
    { id: "grupo_eur", nome: "Turma online (grupo) EUR", moeda: "€", ciclo: 255,
      descAvista: 10, descParcelado: 5, desc2Ciclos: 5, descRenovacao: 0, maxParcelas: 3,
      obs: "€85/mês vigente neste ciclo · sobe pra €89/mês (€267/ciclo) no próximo" },
    { id: "presencial_dh", nome: "Turma presencial Den Haag", moeda: "€", ciclo: 375,
      descAvista: 10, descParcelado: 5, desc2Ciclos: 5, descRenovacao: 5, maxParcelas: 3, obs: "" },
    { id: "part_brl", nome: "Particular online (BRL)", moeda: "R$", ciclo: 2940,
      descAvista: 10, descParcelado: 5, desc2Ciclos: 5, descRenovacao: 5, maxParcelas: 8, obs: "" },
    { id: "part_eur", nome: "Particular EUR", moeda: "€", ciclo: 480,
      descAvista: 10, descParcelado: 5, desc2Ciclos: 5, descRenovacao: 5, maxParcelas: 3,
      obs: "Defasado: €40/aula é preço de particular BR. Proposta para contratos novos: €200–220/mês" },
    { id: "dupla_eur", nome: "Aula em dupla EUR (por pessoa)", moeda: "€", ciclo: 330,
      descAvista: 5, descParcelado: 0, desc2Ciclos: 5, descRenovacao: 5, maxParcelas: 3,
      obs: "Mesmo nível CEFR + mesma agenda. Se uma sai, a outra migra para particular ou repõe a dupla" },
    { id: "dupla_brl", nome: "Aula em dupla BRL (por pessoa)", moeda: "R$", ciclo: 1950,
      descAvista: 5, descParcelado: 0, desc2Ciclos: 5, descRenovacao: 5, maxParcelas: 8,
      obs: "Mesmas regras da dupla EUR" },
    { id: "addon_eur", nome: "Add-on particular quinzenal (EUR)", moeda: "€", ciclo: 240,
      descAvista: 5, descParcelado: 0, desc2Ciclos: 5, descRenovacao: 5, maxParcelas: 4,
      obs: "2 aulas 1:1 por mês para quem já está no grupo. Sobe junto se o particular for reajustado" },
    { id: "addon_brl", nome: "Add-on particular quinzenal (BRL)", moeda: "R$", ciclo: 1470,
      descAvista: 5, descParcelado: 0, desc2Ciclos: 5, descRenovacao: 5, maxParcelas: 4,
      obs: "Mesma lógica do add-on EUR" },
    { id: "bookclub", nome: "Book Club avulso", moeda: "R$", ciclo: 197,
      descAvista: 0, descParcelado: 0, desc2Ciclos: 0, descRenovacao: 0, maxParcelas: 1, obs: "Assinatura" },
    { id: "piloto_eur", nome: "Piloto Sem Roteiro (EUR)", moeda: "€", ciclo: 27,
      descAvista: 0, descParcelado: 0, desc2Ciclos: 0, descRenovacao: 0, maxParcelas: 1, obs: "Preço fixo, sem negociação" },
    { id: "piloto_brl", nome: "Piloto Sem Roteiro (BRL)", moeda: "R$", ciclo: 157,
      descAvista: 0, descParcelado: 0, desc2Ciclos: 0, descRenovacao: 0, maxParcelas: 1, obs: "Preço fixo, sem negociação" }
  ];
  // O que oferecer ANTES de mexer no preço — nesta ordem.
  var ESCADA_CONCESSOES = [
    { titulo: "Piloto Sem Roteiro de bônus", detalhe: "€27 / R$157 de valor de tabela; custo operacional baixo (assíncrono)" },
    { titulo: "Fechar 2 ciclos", detalhe: "Desconto adicional já previsto na tabela + preço congelado na renovação" },
    { titulo: "Desconto por indicação", detalhe: "Vale apenas quando a indicada se matricula" },
    { titulo: "1 sessão de interview coaching", detalhe: "Máximo 1 por contrato — custa hora da Gabi" },
    { titulo: "Só então: desconto em dinheiro", detalhe: "Nunca abaixo do piso" }
  ];

  var PRECOS_KEY = "isr_precos_v1";
  function precosLista() {
    try { var l = JSON.parse(localStorage.getItem(PRECOS_KEY)); if (l && l.length) return l; } catch (e) {}
    return PRECOS_PADRAO.map(function (p) { return Object.assign({}, p); });
  }
  function precosSave(list) { carimbarLista(list); try { localStorage.setItem(PRECOS_KEY, JSON.stringify(list)); } catch (e) {} agendarSync(); }
  function updatePreco(id, patch) {
    var l = precosLista();
    l.forEach(function (p) { if (p.id === id) { Object.assign(p, patch); carimbar(p); } });
    precosSave(l); return l;
  }
  function getPreco(id) { return precosLista().filter(function (p) { return p.id === id; })[0] || null; }

  var TICKET_KEY = "isr_ticket_alvo_v1";
  function ticketAlvo() {
    try { var v = parseFloat(localStorage.getItem(TICKET_KEY)); if (v > 0) return v; } catch (e) {}
    return 89; // € por mês
  }
  function setTicketAlvo(v) {
    var n = typeof v === "number" ? v : parseFloat(String(v).replace(",", "."));
    if (n > 0) { try { localStorage.setItem(TICKET_KEY, String(n)); } catch (e) {} agendarSync(); }
    return ticketAlvo();
  }

  // cfg: { produtoId, fonte: "nova"|"renovacao", ciclos: 1|2,
  //        forma: "avista"|"parcelado", parcelas, totalProposto }
  function calcularProposta(cfg) {
    var p = getPreco(cfg.produtoId);
    if (!p) return null;
    var ciclos = parseInt(cfg.ciclos, 10) === 2 ? 2 : 1;
    var avista = cfg.forma === "avista";
    var tabela = p.ciclo * ciclos;

    // teto de desconto: renovação tem teto próprio; 2 ciclos somam o adicional
    var tetoBase = cfg.fonte === "renovacao" ? p.descRenovacao
                                             : (avista ? p.descAvista : p.descParcelado);
    var descMax = tetoBase + (ciclos === 2 ? p.desc2Ciclos : 0);
    var piso = Math.round(tabela * (1 - descMax / 100) * 100) / 100;

    // O parcelamento é regra do ciclo, não do produto: até 4× no ciclo de
    // 3 meses e até 7× no de 6 meses.
    var maxParcelas = avista ? 1 : (MAX_PARCELAS_POR_CICLO[ciclos] || 4);
    var parcelas = avista ? 1 : Math.max(1, parseInt(cfg.parcelas, 10) || 1);

    var total = cfg.totalProposto != null && cfg.totalProposto !== ""
      ? (typeof cfg.totalProposto === "number" ? cfg.totalProposto : parseMoney(cfg.totalProposto))
      : tabela;
    var descDado = tabela > 0 ? Math.round((1 - total / tabela) * 1000) / 10 : 0;

    // Sinal: entra na assinatura e sai do que vai ser parcelado.
    var sinal = cfg.sinal != null && cfg.sinal !== ""
      ? (typeof cfg.sinal === "number" ? cfg.sinal : parseMoney(cfg.sinal)) : 0;
    if (sinal < 0) sinal = 0;
    if (sinal > total) sinal = total;
    var aParcelar = Math.max(0, total - sinal);

    var mensal = total / (CICLO_MESES * ciclos);
    var eurMes = p.moeda === "€" ? mensal : mensal / taxaCambio();
    var alvo = ticketAlvo();

    var alertas = [];
    if (parcelas > maxParcelas)
      alertas.push(parcelas + " parcelas passa do limite: o ciclo de " + (CICLO_MESES * ciclos)
        + " meses aceita até " + maxParcelas + ".");
    if (sinal > 0 && sinal >= total)
      alertas.push("O sinal cobre o valor inteiro. Registre como pagamento à vista.");
    if (descDado > descMax + 0.05)
      alertas.push("Desconto de " + descDado.toFixed(1) + "% passa do teto de " + descMax + "% — precisa de aprovação da Gabi.");
    if (descDado < -0.05)
      alertas.push("O valor proposto está acima da tabela. Confirme se é isso mesmo.");
    if (eurMes < alvo * 0.85)
      alertas.push("Equivale a € " + Math.round(eurMes) + "/mês, abaixo do ticket alvo de € " + alvo + "/mês.");

    var podeFechar = total >= piso - 0.01 && parcelas <= maxParcelas;
    return {
      produto: p, moeda: p.moeda, ciclos: ciclos, avista: avista,
      tabela: tabela, descMax: descMax, piso: piso,
      total: total, descDado: descDado,
      parcelas: parcelas, maxParcelas: maxParcelas,
      sinal: sinal, aParcelar: aParcelar,
      valorParcela: parcelas > 0 ? aParcelar / parcelas : aParcelar,
      mensal: mensal, eurMes: eurMes, ticketAlvo: alvo,
      podeFechar: podeFechar,
      decisao: podeFechar ? "Pode fechar" : "Precisa de aprovação da Gabi",
      contrato: descDado > 0.05 ? "Valor negociado → contrato sempre"
                                : "Tabela cheia → fluxo normal",
      alertas: alertas
    };
  }

  // Pacote: 2+ produtos da MESMA moeda. O preço do pacote já é o piso —
  // abaixo dele não existe margem de negociação, só aprovação.
  function calcularPacote(itens, ciclos, descPacote, parcelas) {
    var lista = (itens || []).map(getPreco).filter(Boolean);
    if (lista.length < 2) return null;
    var moedas = {};
    lista.forEach(function (p) { moedas[p.moeda] = true; });
    if (Object.keys(moedas).length > 1)
      return { erro: "Não misture R$ e € no mesmo pacote." };
    var moeda = lista[0].moeda;
    var c = parseInt(ciclos, 10) === 2 ? 2 : 1;
    var soma = lista.reduce(function (a, p) { return a + p.ciclo; }, 0) * c;
    var desc = parseFloat(descPacote) || 0;
    var preco = Math.round(soma * (1 - desc / 100) * 100) / 100;
    var n = Math.max(1, parseInt(parcelas, 10) || 1);
    var maxP = Math.min.apply(null, lista.map(function (p) { return p.maxParcelas; })) * c;
    var mensal = preco / (CICLO_MESES * c);
    return {
      itens: lista, moeda: moeda, ciclos: c, soma: soma, desconto: desc,
      preco: preco, parcelas: n, maxParcelas: maxP,
      valorParcela: preco / n, mensal: mensal,
      eurMes: moeda === "€" ? mensal : mensal / taxaCambio(),
      ticketAlvo: ticketAlvo(),
      excedeParcelas: n > maxP
    };
  }

  // ── CONSERTO DE IDS DUPLICADOS ────────────────────────────────
  //
  // Antes do contador, pessoas e turmas criadas no mesmo milissegundo
  // (como numa importação) nasciam com o MESMO id — e editar uma mexia
  // na outra: era o "cliquei no Sergio e mudou a Stefane". Quem já tem
  // dados com esse defeito é consertado aqui, uma vez, ao abrir o app.
  function consertarIdsDuplicados() {
    try {
      var pessoas = JSON.parse(localStorage.getItem(PESSOAS_KEY)) || [];
      var vistos = {}, mudou = false;
      pessoas.forEach(function (p) {
        if (p && p.id && vistos[p.id]) { p.id = novaPessoaId(); mudou = true; }
        if (p && p.id) vistos[p.id] = true;
      });
      if (mudou) savePessoas(pessoas);

      var turmas = JSON.parse(localStorage.getItem(TURMAS_KEY)) || [];
      var vistosT = {}, mudouT = false;
      turmas.forEach(function (u) {
        if (u && u.id && vistosT[u.id]) { u.id = novoTurmaId(); mudouT = true; }
        if (u && u.id) vistosT[u.id] = true;
      });
      if (mudouT) turmasSave(turmas);
    } catch (e) {}
  }
  consertarIdsDuplicados();

  // ── API PÚBLICA ───────────────────────────────────────────────
  window.ISRCRM = {
    // constantes
    STAGES: STAGES, TABS: TABS, CANAIS: CANAIS, get TEMPLATES() { return templatesMerged(); },
    MOTIVOS_PERDA: MOTIVOS_PERDA, STATUS_META: STATUS_META, PERFIS: PERFIS,
    MESES_COBRANCA: MESES_COBRANCA, COBRANCA_STATUS_META: COBRANCA_STATUS_META,
    RENOV_ESTAGIOS: RENOV_ESTAGIOS, get UNITS() { return turmasLista(); }, get METAS() { return metasAtuais(); }, setMetas: setMetas,
    // pessoas
    getPessoas: loadPessoas, getPessoa: getPessoa,
    // compat CRM
    getLeads: getLeads, getLead: getLead, leadsForTab: leadsForTab, tabCounts: tabCounts,
    stageById: function (id) { return STAGES.filter(function (s) { return s.id === id; })[0] || null; },
    get REATIVACAO() { return reativacao(); },
    recipients: recipients,
    templatesByCategoria: function (cat) { return templatesMerged().filter(function (t) { return !cat || t.categoria === cat; }); },
    salvarModelo: salvarModelo, novoModelo: novoModelo, excluirModelo: excluirModelo,
    restaurarModelo: restaurarModelo, ehModeloCustom: ehModeloCustom,
    gestaoUser: gestaoUser, liberarGestao: liberarGestao, sairGestao: sairGestao,
    motivoSemAcesso: motivoSemAcesso,
    convidarEquipe: convidarEquipe, conviteDaEquipe: conviteDaEquipe,
    gestaoVisao: gestaoVisao, professoraDaVisao: professoraDaVisao,
    soProfessora: soProfessora,
    verComo: verComo, setVerComo: setVerComo,
    verComoOpcoes: verComoOpcoes,
    guardarTokenGestao: guardarTokenGestao, tokenGestao: tokenGestao,
    temTokenGestao: function () { return !!tokenGestaoGuardado(); }, chamarFuncao: chamarFuncao,
    categorias: function () { var seen = {}, out = []; templatesMerged().forEach(function (t) { if (!seen[t.categoria]) { seen[t.categoria] = 1; out.push(t.categoria); } }); return out; },
    // ações
    updateLead: updateLead, setStage: setStage, setFollowup: setFollowup, addNote: addNote,
    registrarContato: registrarContato, marcarPerdido: marcarPerdido, markLost: function (id) { return marcarPerdido(id, "Outro"); },
    deleteLead: deleteLead, addHistory: addHistory, addDocumento: addDocumento, matricular: matricular,
    salvarProposta: salvarProposta, propostaDe: propostaDe, resumoProposta: resumoProposta,
    novaPessoa: novaPessoa,
    // cobrança
    getCobranca: getCobranca, alunasSemPlano: alunasSemPlano,
    cobrancaStatus: cobrancaStatus, cobrancaResumo: cobrancaResumo,
    setParcelaPaga: setParcelaPaga, setParcelaValor: setParcelaValor,
    setSinal: setSinal, somaDoContrato: somaDoContrato, entradasPrevistas: entradasPrevistas,
    MES_NOMES: MES_NOMES, mesSeguinte: mesSeguinte, mesAnterior: mesAnterior,
    parseMoney: parseMoney, fmtMoney: fmtMoney, mesAtualKey: mesAtualKey,
    // renovações
    renovacoes: renovacoes, setRenovacao: setRenovacao, taxaRenovacao: taxaRenovacao,
    // fila + metas
    filaParaHoje: filaParaHoje, idadeNaFila: idadeNaFila,
    adiarItem: adiarItem, progressoMetas: progressoMetas,
    matriculasDoCiclo: matriculasDoCiclo, metasAtuais: metasAtuais, cicloDaData: cicloDaData,
    cicloJanela: cicloJanela, temAulaEm: temAulaEm, abrirCiclo: abrirCiclo,
    ciclosLista: ciclosLista, ciclosTodos: ciclosTodos, cicloDeAuditoria: cicloDeAuditoria,
    TIPOS_CICLO: TIPOS_CICLO, cicloAtualDe: cicloAtualDe, tipoDaTurma: tipoDaTurma,
    presencaParaTodos: presencaParaTodos,
    // pedagógico / marketing
    ocupacaoTurmas: ocupacaoTurmas, leadStatsByCanal: leadStatsByCanal, statsMotivosPerda: statsMotivosPerda,
    turmasLista: turmasLista, addTurma: addTurma, updateTurma: updateTurma, removeTurma: removeTurma,
    setOnboardingFeito: setOnboardingFeito, setProximoCheckin: setProximoCheckin, registrarCheckinFeito: registrarCheckinFeito,
    eventosLista: eventosLista, addEvento: addEvento, removeEvento: removeEvento,
    getEvento: getEvento, updateEvento: updateEvento,
    aulaExtraLabel: aulaExtraLabel, convidadasAulaExtra: convidadasAulaExtra,
    confirmadasAulaExtra: confirmadasAulaExtra, listaChamadaExtra: listaChamadaExtra,
    addAlunaNaAulaExtra: addAlunaNaAulaExtra, removeAlunaDaAulaExtra: removeAlunaDaAulaExtra,
    horasAulaExtra: horasAulaExtra, gcalLinkEvento: gcalLinkEvento,
    textoAulaExtra: textoAulaExtra, mailtoAulaExtra: mailtoAulaExtra,
    aulasExtraDaAluna: aulasExtraDaAluna,
    agendaItens: agendaItens, gcalLink: gcalLink,
    getChamada: getChamada, salvarChamada: salvarChamada, faltasDe: faltasDe, presencasDe: presencasDe, progressoDaAluna: progressoDaAluna, NIVEIS: NIVEIS, alunasDaTurma: alunasDaTurma, alunasQueVaoComecar: alunasQueVaoComecar,
    setInicioDasAulas: setInicioDasAulas, setInicioDasAulasEmLote: setInicioDasAulasEmLote,
    chamadasDaTurma: chamadasDaTurma,
    semanaDoPrograma: semanaDoPrograma, respostaDaSemana: respostaDaSemana,
    responderMissao: responderMissao, programaDaAluna: programaDaAluna,
    trilhaDesafio: trilhaDesafio,
    aulaAAvaliar: aulaAAvaliar, jornadaDaAluna: jornadaDaAluna,
    recompensasDaAluna: recompensasDaAluna, catalogoDaAluna: catalogoDaAluna,
    moedasDe: moedasDe, addMoedas: addMoedas, MOEDAS_REGRAS: MOEDAS_REGRAS,
    MOEDAS_NIVEIS: MOEDAS_NIVEIS, bloqueioDoResgate: bloqueioDoResgate,
    vagasDoMes: vagasDoMes, resgatesAll: resgatesAll,
    MOEDAS_BONUS: MOEDAS_BONUS, MOEDAS_RESGATES: MOEDAS_RESGATES, resgatarRecompensa: resgatarRecompensa,
    equipeLista: equipeLista, addEquipe: addEquipe, updateEquipe: updateEquipe, removeEquipe: removeEquipe,
    entradaNaEquipe: entradaNaEquipe,
    professorasSemCadastro: professorasSemCadastro, cadastrarProfessora: cadastrarProfessora,
    receitaParticularesNoMes: receitaParticularesNoMes,
    furosDeCadastro: furosDeCadastro, marcarFuroCiente: marcarFuroCiente,
    processarAtividadesPendentes: processarAtividadesPendentes,
    processarAssinaturasPendentes: processarAssinaturasPendentes,
    folhaNoCaixa: folhaNoCaixa, comercialDaEquipe: comercialDaEquipe,
    conferenciaFinanceira: conferenciaFinanceira,
    lerControlePagamento: lerControlePagamento,
    aplicarControlePagamento: aplicarControlePagamento,
    previsaoRecebimento: previsaoRecebimento, pessoaPorNome: pessoaPorNome,
    comecarDoZero: comecarDoZero, oQueTemDentro: oQueTemDentro,
    carregarExemplo: carregarExemplo, exemploLigado: exemploLigado,
    linkDePagamento: linkDePagamento, setLinkPagamento: setLinkPagamento,
    linkPagamentoPadrao: linkPagamentoPadrao, setLinkPagamentoPadrao: setLinkPagamentoPadrao,
    alunasSemLinkDePagamento: alunasSemLinkDePagamento,
    registrarTransacao: registrarTransacao, transacaoRegistrada: transacaoRegistrada,
    esquecerTransacao: esquecerTransacao,
    contasProprias: contasProprias, addContaPropria: addContaPropria,
    removerContaPropria: removerContaPropria, ehContaPropria: ehContaPropria,
    orcamentoDoMes: orcamentoDoMes, setOrcamento: setOrcamento,
    lerAlunasTurmas: lerAlunasTurmas, aplicarAlunasTurmas: aplicarAlunasTurmas,
    lerLeads: lerLeads, aplicarLeads: aplicarLeads,
    jotformKey: jotformKey, setJotformKey: setJotformKey,
    jotformBase: jotformBase, setJotformBase: setJotformBase, jotformOutraBase: jotformOutraBase,
    gravadasUrl: gravadasUrl, setGravadasUrl: setGravadasUrl,
    clubesLista: clubesLista, getClube: getClube, clubeSalvar: clubeSalvar,
    clubeRemover: clubeRemover, clubesDaAluna: clubesDaAluna, clubeEntrar: clubeEntrar,
    clubeSair: clubeSair, clubePagamentoFeito: clubePagamentoFeito,
    clubesResumo: clubesResumo, clubeVagasLivres: clubeVagasLivres,
    clubesParaAluna: clubesParaAluna,
    CLUBES_INCLUIDOS: CLUBES_INCLUIDOS,
    bookclubUrl: bookclubUrl, setBookclubUrl: setBookclubUrl,
    bookclubAula: bookclubAula, setBookclubAula: setBookclubAula,
    bookingUrl: bookingUrl, setBookingUrl: setBookingUrl,
    systemeKey: systemeKey, setSystemeKey: setSystemeKey,
    lerLeadsDoSysteme: lerLeadsDoSysteme,
    dataIso: iso, hojeIso: function () { return iso(new Date()); },
    lerLeadsDoJotform: lerLeadsDoJotform,
    renomearNaEquipe: renomearNaEquipe,
    equipeCustosMensais: equipeCustosMensais,
    calcParams: calcParams, setCalcParams: setCalcParams,
    rsvpEvento: rsvpEvento, solicitarCorrecao: solicitarCorrecao,
    chamadasAll: chamadasAll, estadoPresenca: estadoPresenca,
    tarefasLista: tarefasLista, addTarefa: addTarefa, setTarefaFeita: setTarefaFeita, removeTarefa: removeTarefa,
    feriadosLista: feriadosLista, addFeriado: addFeriado, removeFeriado: removeFeriado, ehFeriado: ehFeriado,
    agendarReuniao: agendarReuniao, gcalReuniao: gcalReuniao, horaBRNL: horaBRNL, donoComercial: donoComercial, marcarReuniaoFeita: marcarReuniaoFeita,
    registrarAulaParticular: registrarAulaParticular, updateParticular: updateParticular,
    TIPOS_META: TIPOS_META, metasDoPeriodo: metasDoPeriodo, metasPeriodoAll: metasPeriodoAll,
    addMetaPeriodo: addMetaPeriodo, updateMetaPeriodo: updateMetaPeriodo,
    removeMetaPeriodo: removeMetaPeriodo, progressoMeta: progressoMeta,
    setTurmaDaPessoa: setTurmaDaPessoa,
    renegociarContrato: renegociarContrato, setSinalRecebido: setSinalRecebido,
    faixasComissao: faixasComissao, setFaixasComissao: setFaixasComissao,
    simularRenegociacao: simularRenegociacao, aplicarRenegociacao: aplicarRenegociacao,
    maxParcelasDoCiclo: maxParcelasDoCiclo,
    caixaDetalheMes: caixaDetalheMes, processarCadastrosPendentes: processarCadastrosPendentes,
    // caixa
    get CUSTOS_FIXOS() { return custosLista(); }, custosTotais: custosTotais, projecaoCaixa: projecaoCaixa,
    addCusto: addCusto, removeCusto: removeCusto, updateCusto: updateCusto,
    custosDoMes: custosDoMes, vigenteNoMes: vigenteNoMes,
    // financeiro
    CAT_ENTRADA: CAT_ENTRADA, CAT_SAIDA: CAT_SAIDA, catMeta: catMeta,
    catsSaida: catsSaida, addCategoriaSaida: addCategoriaSaida,
    removeCategoriaSaida: removeCategoriaSaida,
    financeiroMes: financeiroMes, financeiroSerie: financeiroSerie, previsaoMes: previsaoMes,
    mesesFinanceiro: mesesFinanceiro, mesOffset: mesOffset, mesLabelDe: mesLabelDe,
    lancamentosLista: lancamentosLista, addLancamento: addLancamento,
    removeLancamento: removeLancamento, updateLancamento: updateLancamento,
    lancamentosDoMes: lancamentosDoMes,
    metaDoMes: metaDoMes, setMetaMes: setMetaMes, setMetaPadrao: setMetaPadrao,
    taxaCambio: taxaCambio, setTaxaCambio: setTaxaCambio, emReais: emReais,
    ticketMedio: ticketMedio, taxaConversao: taxaConversao,
    resumoFinanceiroTexto: resumoFinanceiroTexto, reunioesResumo: reunioesResumo,
    alunasPainel: alunasPainel, RISCOS: RISCOS, tarefasDe: tarefasDe,
    // saída e renovação
    TIPOS_SAIDA: TIPOS_SAIDA, MOTIVOS_SAIDA: MOTIVOS_SAIDA,
    encerrarMatricula: encerrarMatricula, reabrirMatricula: reabrirMatricula,
    registrarAcerto: registrarAcerto, removerAcerto: removerAcerto,
    // assinatura
    ativarAssinatura: ativarAssinatura, encerrarAssinatura: encerrarAssinatura,
    assinaturaNoAviso: assinaturaNoAviso, fimDoCicloPago: fimDoCicloPago,
    registrarFalhaAssinatura: registrarFalhaAssinatura,
    confirmarRecorrente: confirmarRecorrente,
    registrarPagamentoAssinatura: registrarPagamentoAssinatura,
    assinaturaFalhando: assinaturaFalhando,
    assinaturaAtiva: assinaturaAtiva, pedirCancelamentoAssinatura: pedirCancelamentoAssinatura,
    updatePerfilAluna: updatePerfilAluna,
    assinaturaCfg: assinaturaCfg, setAssinaturaCfg: setAssinaturaCfg,
    contasLista: contasLista, contaMeta: contaMeta, contaLabel: contaLabel,
    tipoDaContaPropria: tipoDaContaPropria, pareceEmpresa: pareceEmpresa,
    contaDaDescricao: contaDaDescricao, emailDaTransacao: emailDaTransacao,
    linhaDeSistema: linhaDeSistema, identDaTransacao: identDaTransacao,
    registrarRepasse: registrarRepasse, repasseCasando: repasseCasando,
    ehSoIdentificador: ehSoIdentificador, donoDoIdentificador: donoDoIdentificador,
    pareceNomeDePessoa: pareceNomeDePessoa,
    lerMatriculasSlack: lerMatriculasSlack, aplicarMatriculasSlack: aplicarMatriculasSlack,
    pessoasQueParecemExtrato: pessoasQueParecemExtrato,
    removerPessoasQueParecemExtrato: removerPessoasQueParecemExtrato,
    lembrarIdentificador: lembrarIdentificador, esquecerIdentificador: esquecerIdentificador,
    partesNaDescricao: partesNaDescricao, novaAlunaDoExtrato: novaAlunaDoExtrato,
    addConta: addConta, removeConta: removeConta, setContaReserva: setContaReserva,
    acessoLiberado: acessoLiberado, acessoPorEmail: acessoPorEmail,
    whatsappEscola: whatsappEscola, linkWhatsappEscola: linkWhatsappEscola,
    assinantesAtivas: assinantesAtivas,
    lerListaAssinantes: lerListaAssinantes, aplicarListaAssinantes: aplicarListaAssinantes,
    renovarMatricula: renovarMatricula, retencao: retencao,
    saidasResumo: saidasResumo, exAlunas: exAlunas,
    // edição depois da matrícula
    atualizarContrato: atualizarContrato, mudarTurma: mudarTurma,
    atualizarCadastro: atualizarCadastro, setOnboardingData: setOnboardingData,
    // avisos internos

    // programa no WhatsApp
    MISSOES_PILOTO: MISSOES_PILOTO, ETAPAS_SEMANA: ETAPAS_SEMANA,
    programasLista: programasLista, addPrograma: addPrograma, getPrograma: getPrograma,
    updatePrograma: updatePrograma, removePrograma: removePrograma,
    addParticipante: addParticipante, removeParticipante: removeParticipante,
    marcarEtapa: marcarEtapa, etapaFeita: etapaFeita,
    marcarMissaoSemana: marcarMissaoSemana, missaoEnviada: missaoEnviada,
    CAMPOS_DOCUMENTO: CAMPOS_DOCUMENTO, CAMPOS_ENDERECO: CAMPOS_ENDERECO,
    enderecoDe: enderecoDe, cadastroIncompleto: cadastroIncompleto,
    faixaComissao: faixaComissao,
    vendasDoMes: vendasDoMes, comissaoComercial: comissaoComercial,
    comissaoAPagar: comissaoAPagar,
    configPagamento: configPagamento, setConfigPagamento: setConfigPagamento,
    pagamentoFeito: pagamentoFeito, marcarPagamentoFeito: marcarPagamentoFeito,
    desmarcarPagamento: desmarcarPagamento, vencimentoDaFolha: vencimentoDaFolha,
    emMoedaDaFolha: emMoedaDaFolha,
    pagamentoProfessora: pagamentoProfessora, folhaPagamento: folhaPagamento,
    aulasDadasNoMes: aulasDadasNoMes, aulasCobertasNoMes: aulasCobertasNoMes, frequenciaDaTurma: frequenciaDaTurma,
    particularesNoMes: particularesNoMes, extrasNoMes: extrasNoMes,
    particularesSemProfessora: particularesSemProfessora,
    professoraDaParticular: professoraDaParticular, ehAlunaParticular: ehAlunaParticular,
    fechamentoDoContrato: fechamentoDoContrato,
    encerrarPrograma: encerrarPrograma, reabrirPrograma: reabrirPrograma,
    apagarPrograma: apagarPrograma,
    programasAbertos: programasAbertos, resumoProgramas: resumoProgramas,
    agendaComercial: agendaComercial,
    comentarPulso: comentarPulso,
    gravacoesLista: gravacoesLista, addGravacao: addGravacao, removeGravacao: removeGravacao,
    gravacaoDaAula: gravacaoDaAula, setGravacaoDaAula: setGravacaoDaAula,
    gravacoesParaAluna: gravacoesParaAluna, tarefasDeCasa: tarefasDeCasa,
    flinUrl: flinUrl, setFlinUrl: setFlinUrl, flinDaAluna: flinDaAluna, liberarFlin: liberarFlin,
    historicoDeNiveis: historicoDeNiveis,
    registrarAcessoAluna: registrarAcessoAluna,
    salvarPerfilDaAluna: salvarPerfilDaAluna, perfilDaAluna: perfilDaAluna,
    cadernoDaAluna: cadernoDaAluna, notaDaAula: notaDaAula, salvarNotaDaAula: salvarNotaDaAula,
    convidarAluna: convidarAluna, conviteDaAluna: conviteDaAluna,
    materiaisDoCiclo: materiaisDoCiclo, guiaDoNivel: guiaDoNivel,
    salvarMateriais: salvarMateriais,
    fasesDoPlano: fasesDoPlano, faseCor: faseCor, faseLabel: faseLabel,
    CORES_NIVEL: CORES_NIVEL, corDoNivel: corDoNivel,
    syllabusDoNivel: syllabusDoNivel, salvarSessaoSyllabus: salvarSessaoSyllabus,
    semearSyllabus: semearSyllabus,
    apagarSessaoSyllabus: apagarSessaoSyllabus,
    planoDaTurma: planoDaTurma, planoSessoes: planoSessoes, salvarPlano: salvarPlano,
    addEtapaPlano: addEtapaPlano, removerEtapaPlano: removerEtapaPlano,
    alternarEtapaPlano: alternarEtapaPlano, moverEtapaPlano: moverEtapaPlano,
    marcarPlanoPronto: marcarPlanoPronto, publicarPlano: publicarPlano,
    minutosDoPlano: minutosDoPlano, PLANO_LIMITES: PLANO_LIMITES,
    planoPublicadoDaAula: planoPublicadoDaAula,
    sincronizarPalavrasDaAula: sincronizarPalavrasDaAula,
    palavrasDaAluna: palavrasDaAluna, salvarPalavra: salvarPalavra, removerPalavra: removerPalavra,
    revisarPalavra: revisarPalavra, revisaoDeHoje: revisaoDeHoje, acessoDaAluna: acessoDaAluna, usoDoApp: usoDoApp,
    horasDaAluna: horasDaAluna, minutosDaAula: minutosDaAula, setMinutosDaAula: setMinutosDaAula,
    aulasPorCiclo: aulasPorCiclo, setAulasPorCiclo: setAulasPorCiclo,
    diarioDaTurma: diarioDaTurma,
    MINIMO_TURMA: MINIMO_TURMA, turmasAbaixoDoMinimo: turmasAbaixoDoMinimo,
    progressoCiclo: progressoCiclo, certificadoDaAluna: certificadoDaAluna,
    contratarParticular: contratarParticular, encerrarParticular: encerrarParticular,
    CADENCIAS_PARTICULAR: CADENCIAS, LIMITE_REMARCACAO_MES: LIMITE_REMARCACAO_MES,
    agendaParticular: agendaParticular, agendarSerieParticular: agendarSerieParticular,
    remarcarAulaParticular: remarcarAulaParticular, cancelarAulaParticular: cancelarAulaParticular,
    removerAulaParticular: removerAulaParticular, remarcacoesNoMes: remarcacoesNoMes,
    proximaAulaParticular: proximaAulaParticular, marcarAulaParticularFeita: marcarAulaParticularFeita,
    aulasParticularesAgendadas: aulasParticularesAgendadas,
    chamadasPendentes: chamadasPendentes, chamadasFeitas: chamadasFeitas,
    chamadaHistorico: chamadaHistorico,
    chamadaValidada: chamadaValidada, chamadaEstado: chamadaEstado,
    reabrirChamada: reabrirChamada,
    aulaViva: aulaViva, iniciarAula: iniciarAula, encerrarAula: encerrarAula,
    reabrirAula: reabrirAula, respostasDaAluna: respostasDaAluna,
    salvarResposta: salvarResposta, comentarResposta: comentarResposta,
    substituicoesLista: substituicoesLista, pedirSubstituicao: pedirSubstituicao,
    atribuirSubstituta: atribuirSubstituta, cancelarSubstituicao: cancelarSubstituicao,
    substituicoesDaProfessora: substituicoesDaProfessora,
    substituicoesDaTurma: substituicoesDaTurma, substituicoesAbertas: substituicoesAbertas,
    substitutaDaAula: substitutaDaAula, SUBS_MOTIVOS: SUBS_MOTIVOS,
    reunioesPedagogicas: reunioesPedagogicas, salvarReuniaoPedagogica: salvarReuniaoPedagogica,
    removerReuniaoPedagogica: removerReuniaoPedagogica, reunioesDoMes: reunioesDoMes,
    entregasDoProjeto: entregasDoProjeto, marcarEntregaProjeto: marcarEntregaProjeto,
    sequenciaDaAluna: sequenciaDaAluna, pularSessaoDaAluna: pularSessaoDaAluna,
    programasDisponiveis: programasDisponiveis, programaDeEstudo: programaDeEstudo,
    salvarProgramaDeEstudo: salvarProgramaDeEstudo,
    moverSessaoDaAluna: moverSessaoDaAluna,
    salvarObjetivoDaAluna: salvarObjetivoDaAluna, objetivoDaAluna: objetivoDaAluna,
    salvarNotaDaEquipe: salvarNotaDaEquipe, notaDaEquipe: notaDaEquipe,
    faltasSeguidas: faltasSeguidas, alunasComFaltasSeguidas: alunasComFaltasSeguidas,
    clubePublicar: clubePublicar, clubeDespublicar: clubeDespublicar,
    clubeEhNovo: clubeEhNovo, faltaParaPublicar: faltaParaPublicar,
    FALTA_ROTULOS: FALTA_ROTULOS,
    chamadaDoEncontro: chamadaDoEncontro, salvarChamadaDoClube: salvarChamadaDoClube,
    proximoEncontroDoClube: proximoEncontroDoClube,
    faltasSeguidasNoClube: faltasSeguidasNoClube,
    respostasDaAula: respostasDaAula, tarefasDaAula: tarefasDaAula,
    dataDaSessao: dataDaSessao, datasDasSessoes: datasDasSessoes,
    aulaVivaDaAluna: aulaVivaDaAluna,
    CHAMADA_ESTADOS: CHAMADA_ESTADOS,
    particularesDaSemana: particularesDaSemana, marcarAulaParticular: marcarAulaParticular,
    resumoParticular: resumoParticular, resumosParticulares: resumosParticulares,
    chamadasPendentesPorProfessora: chamadasPendentesPorProfessora,
    setParticularPago: setParticularPago, produtosDe: produtosDe,
    matricularNoPrograma: matricularNoPrograma, sairDoPrograma: sairDoPrograma,
    setProgramaPago: setProgramaPago, participantesPrograma: participantesPrograma,
    pagamentosPendentesPrograma: pagamentosPendentesPrograma,
    receitaPrograma: receitaPrograma,
    MOEDAS_NOME: MOEDAS_NOME, MOEDAS_CATS: MOEDAS_CATS,
    parcelasAbertas: parcelasAbertas, pendenciaAnterior: pendenciaAnterior,
    resumoRenovacao: resumoRenovacao,
    MOEDAS_PROGRAMA: MOEDAS_PROGRAMA, moedasDoPrograma: moedasDoPrograma,
    somarParticipacao: somarParticipacao, rankingPrograma: rankingPrograma,
    // tags
    TAGS_SUGERIDAS: TAGS_SUGERIDAS, addTag: addTag, removeTag: removeTag, todasAsTags: todasAsTags,
    semanaAtualPrograma: semanaAtualPrograma, pendenciasPrograma: pendenciasPrograma,
    // acompanhamento
    satisfacaoDe: satisfacaoDe, desenvolvimentoDe: desenvolvimentoDe,
    TOQUE_TIPOS: TOQUE_TIPOS, PULSO_META: PULSO_META, MOTIVOS_TOQUE: MOTIVOS_TOQUE,
    registrarToque: registrarToque, toquesDe: toquesDe, ultimoToque: ultimoToque,
    toquesLista: toquesLista, diasSemToque: diasSemToque,
    registrarPulso: registrarPulso, pulsosDe: pulsosDe, ultimoPulso: ultimoPulso,
    pulsosLista: pulsosLista, tendenciaPulso: tendenciaPulso, pulsoMeta: pulsoMeta,
    filaAcompanhamento: filaAcompanhamento,
    alertasDaEscola: alertasDaEscola, pendenciasDaEscola: pendenciasDaEscola,
    registrarSaldo: registrarSaldo, esquecerSaldo: esquecerSaldo,
    saldoDoMes: saldoDoMes, serieDoCaixa: serieDoCaixa, ehReserva: ehReserva,
    metaReserva: metaReserva, setMetaReserva: setMetaReserva,
    carteiraProfessoras: carteiraProfessoras, professoraEfetiva: professoraEfetiva,
    professorasDeAula: professorasDeAula, equipeDocente: equipeDocente,
    capacidades: capacidades, setCapacidade: setCapacidade,
    ESQUEMA_VERSAO: ESQUEMA_VERSAO, esquemaVersao: esquemaVersao, setEsquemaVersao: setEsquemaVersao,
    criarBackup: criarBackup, backupsLista: backupsLista, restaurarBackup: restaurarBackup,
    apagarBackup: apagarBackup, exportarTudo: exportarTudo, importarTudo: importarTudo,
    exportarPessoa: exportarPessoa, apagarPessoa: apagarPessoa,
    pessoasDuplicadas: pessoasDuplicadas, mesclarPessoas: mesclarPessoas,
    mesclarTodasDuplicadas: mesclarTodasDuplicadas,
    lerAtualizacaoContatos: lerAtualizacaoContatos,
    aplicarAtualizacaoContatos: aplicarAtualizacaoContatos,
    SINAIS: SINAIS, LIMIARES: LIMIARES, sinalMeta: sinalMeta,
    SEGMENTOS: SEGMENTOS, segmentoMeta: segmentoMeta, segmentoDe: segmentoDe,
    cadenciaConfig: cadenciaConfig, setCadencia: setCadencia,
    cadenciaDe: cadenciaDe, cargaDeContato: cargaDeContato,
    situacaoDe: situacaoDe, sinaisDe: sinaisDe, estaAdiado: estaAdiado,
    // preços e negociação
    CICLO_MESES: CICLO_MESES, ESCADA_CONCESSOES: ESCADA_CONCESSOES,
    precosLista: precosLista, getPreco: getPreco, updatePreco: updatePreco,
    ticketAlvo: ticketAlvo, setTicketAlvo: setTicketAlvo,
    calcularProposta: calcularProposta, calcularPacote: calcularPacote,
    backendUrl: backendUrl, setBackendUrl: setBackendUrl, carregarDoBackend: carregarDoBackend, enviarSync: enviarSync,
    conexaoPadrao: conexaoPadrao, conectarPadrao: conectarPadrao, baseVazia: baseVazia,
    syncEstado: syncEstado, mesclarLista: mesclarLista, mesclarMapa: mesclarMapa, carimbar: carimbar,
    recorrentesDoMes: recorrentesDoMes,
    registrarPagamentoDePessoa: registrarPagamentoDePessoa,
    parcelasPagasSemExtrato: parcelasPagasSemExtrato,
    situacaoDasParcelas: situacaoDasParcelas,
    duplicidadesDeReceita: duplicidadesDeReceita,
    auditoriaDados: auditoriaDados, aplicarCorrecao: aplicarCorrecao,
    aplicarCorrecoesSeguras: aplicarCorrecoesSeguras,
    parseExtrato: parseExtrato, sugerirConciliacao: sugerirConciliacao, conciliar: conciliar,
    parcelasAbertasTodas: parcelasAbertasTodas,
    // perfil
    ltv: ltv, ltvContratado: ltvContratado,
    contratoVigente: contratoVigente, tempoDesde: tempoDesde, mesAno: mesAno,
    // util
    firstName: firstName, fillTemplate: fillTemplate, waLink: waLink, waNumber: waNumber,
    relativeDays: relativeDays, isStale: isStale, ddmm: ddmm,
    followupPresets: function () { return [
      { label: "Amanhã", iso: addDays(1) }, { label: "Em 3 dias", iso: addDays(3) }, { label: "Próx. semana", iso: addDays(7) }]; },
    resetDemo: resetDemo
  };
})();
