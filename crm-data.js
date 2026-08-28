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
    faturamento: { "R$": 16000, "€": 1400 }, faturamentoMes: {} };
  var METAS_KEY = "isr_metas_v1";
  function metasAtuais() {
    try { var m = JSON.parse(localStorage.getItem(METAS_KEY)); if (m) return Object.assign({}, METAS_PADRAO, m); } catch (e) {}
    return METAS_PADRAO;
  }
  function setMetas(patch) {
    var m = {}; try { m = JSON.parse(localStorage.getItem(METAS_KEY)) || {}; } catch (e) {}
    Object.assign(m, patch);
    try { localStorage.setItem(METAS_KEY, JSON.stringify(m)); } catch (e) {}
    agendarSync();
    return metasAtuais();
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
      semanas: 8, diaFeedback: 5, moeda: "€", preco: "27,00",
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

  function pushHist(p, tipo, texto, quem) {
    p.historico = p.historico || [];
    p.historico.push({ data: iso(today()), tipo: tipo, texto: texto, quem: quem || "" });
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
        + (cfg.desde ? " · entrada retroativa em " + ddmm(cfg.desde) : ""));
      pushHist(p, "onboarding", "Onboarding criado (4 checkpoints: boas-vindas, 1ª aula, 1ª semana, 1º pagamento)");
      // Matrícula nova é notícia para duas pessoas: quem faz a integração
      // precisa começar, e a gestão precisa saber que entrou aluna.
      if (!retro) {
        var quem = (gestaoUser() || {}).nome || "";
        var ondeQuando = turmaLabel + (unit && unit.teacher ? " · com " + unit.teacher : "");
        equipeLista().forEach(function (m) {
          if (m.nome === quem) return; // quem fez a matrícula já sabe
          if ((m.papeis || []).indexOf("operacao") >= 0)
            avisar(m.nome, "Matrícula nova: " + p.nome + " · " + ondeQuando
              + ". Comece a integração dos primeiros 30 dias.", "matricula");
          else if ((m.papeis || []).indexOf("gestora") >= 0)
            avisar(m.nome, "Matrícula nova: " + p.nome + " · " + ondeQuando + ".", "matricula");
        });
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
        avisar(dono, (pessoa ? pessoa.nome : "Uma aluna") + " avaliou a última aula em "
          + achou.nota + "/5: “" + comentario + "”", "acompanhamento");
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
    var add = function (id, detalhe) {
      var m = sinalMeta(id);
      if (m) out.push({ id: id, label: m.label, cor: m.cor, peso: m.peso, dono: m.dono,
        acao: m.acao, tpl: m.tpl, tipo: m.tipo, urg: m.urg, naCentral: m.naCentral,
        risco: m.risco, toque: m.toque, detalhe: detalhe || m.label });
    };
    if (s.atrasadasN) {
      var pri = s.atrasadas[0];
      add("parcela_atrasada", s.atrasadasN === 1
        ? "Parcela de " + pri.label + " atrasada (" + (pri.valor || "") + ")"
        : s.atrasadasN + " parcelas atrasadas (desde " + pri.label + ")");
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
      add("falta_recente", s.faltas + (s.faltas === 1 ? " ausência no ciclo" : " ausências no ciclo"));
    if (s.pulso && s.pulso.nota <= LIMIARES.avaliacaoBaixa)
      add("avaliacao_baixa", "Avaliação " + s.pulso.nota + "/5 · " + pulsoMeta(s.pulso.nota).label);
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
          + " dias em: " + travado[0].label);
      else
        add("onboarding_pendente", "Integração pendente: " + s.onboardingAtrasado[0].label);
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
    if (s.checkinVencido) add("checkin_agendado", "Check-in agendado para " + ddmm(p.proximoCheckin));
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
  // O acompanhamento é um produto à parte, com preço próprio. A maioria
  // de quem participa não está em turma nenhuma — e quem está em turma
  // pode participar também. As duas coisas são independentes.
  var PROGRAMA_PRECO_PADRAO = { moeda: "€", valor: "27,00" };

  function addPrograma(dados) {
    var l = programasLista();
    var p = { id: "pg" + Date.now(), nome: dados.nome || "Programa Sem Roteiro",
      inicio: dados.inicio || iso(today()),
      semanas: parseInt(dados.semanas, 10) || 8,
      diaFeedback: dados.diaFeedback || 5, // sexta
      moeda: dados.moeda || PROGRAMA_PRECO_PADRAO.moeda,
      preco: dados.preco || PROGRAMA_PRECO_PADRAO.valor,
      missoes: dados.missoes || MISSOES_PILOTO.slice(),
      participantes: dados.participantes || [], progresso: {}, respostas: {} };
    l.push(p); programasSave(l); return p;
  }
  function setPrecoPrograma(programaId, moeda, valor) {
    var l = programasLista();
    l.forEach(function (pg) {
      if (pg.id !== programaId) return;
      if (moeda) pg.moeda = moeda;
      if (valor) pg.preco = valor;
      carimbar(pg);
    });
    programasSave(l); return l;
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
        moeda: pg.moeda || PROGRAMA_PRECO_PADRAO.moeda,
        preco: pg.preco || PROGRAMA_PRECO_PADRAO.valor,
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

    var moeda = cfg.moeda || pg.moeda || PROGRAMA_PRECO_PADRAO.moeda;
    var valorTxt = cfg.valor || pg.preco || PROGRAMA_PRECO_PADRAO.valor;
    if (!/[R$€]/.test(String(valorTxt))) valorTxt = fmtMoney(moeda, parseMoney(valorTxt));
    var desde = cfg.desde || iso(today());
    var pago = !!cfg.pago;

    addParticipante(pg.id, pessoaId);

    mutate(pessoaId, function (p) {
      p.programa = { id: pg.id, nome: pg.nome, moeda: moeda, valor: valorTxt,
        desde: desde, pago: pago, por: (gestaoUser() || {}).nome || "" };
      // Ser aluna de turma manda no status; quem só faz o acompanhamento
      // ganha um status próprio para não sumir do sistema nem virar aluna.
      if (p.status !== "aluna" && p.status !== "mvs" && p.status !== "pausada") {
        p.status = "programa";
        p.estagio = "matriculado";
        if (!p.desde) p.desde = desde;
      }
      concluirReuniaoPelaMatricula(p);
      pushHist(p, "matricula", "Entrou no " + pg.nome + " · " + valorTxt
        + (pago ? " (pago)" : " (a receber)"));
    });

    if (pago) registrarPagamentoPrograma(pessoaId, desde);

    var dono = donoDaIntegracao();
    avisar(dono, "Acompanhamento: " + pessoa.nome + " entrou no " + pg.nome
      + ". Envie o desafio da semana e adicione ao grupo.", "programa");
    addTarefa({ titulo: "Entrada no acompanhamento · " + pessoa.nome,
      detalhe: "Adicionar ao grupo do WhatsApp e enviar o desafio da semana atual."
        + (pago ? "" : " Pagamento de " + valorTxt + " ainda não confirmado."),
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
      pushHist(p, "pagamento", "Acompanhamento " + p.programa.valor
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
    var r = matricular(id, cfg || {});
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
      // quem pediu fica sabendo — senão a pessoa fica perguntando "já saiu?"
      if (virouFeita && tf.por && tf.por !== tf.dono)
        avisar(tf.por, tf.dono + " concluiu: " + tf.titulo, "tarefa");
    });
    tarefasSave(l); return l;
  }

  // ── AVISOS ────────────────────────────────────────────────────
  // Recado interno de uma pessoa da equipe pra outra. Fica na
  // Central de quem recebeu até ser lido.
  // ── MURAL DA EQUIPE ───────────────────────────────────────────
  // Mensagens por assunto, visíveis para toda a equipe. Não é conversa
  // em tempo real: viaja pela sincronização do banco central (até ~5
  // minutos para chegar nos outros aparelhos). Serve para aviso e
  // registro — e qualquer mensagem pode virar pendência com dono.
  var MURAL_KEY = "isr_mural_v1";
  var ASSUNTOS_MURAL = ["Geral", "Pedagógico", "Comercial", "Operação"];
  function muralRaw() {
    try { return JSON.parse(localStorage.getItem(MURAL_KEY)) || []; } catch (e) { return []; }
  }
  function muralLista() {
    return muralRaw().filter(function (m) { return !(m && m.apagada); });
  }
  function muralSaveRaw(l) { carimbarLista(l); try { localStorage.setItem(MURAL_KEY, JSON.stringify(l)); } catch (e) {} agendarSync(); }
  function muralPost(texto, assunto, autor) {
    var t = (texto || "").trim();
    if (!t) return null;
    var l = muralRaw();
    var m = { id: "mu" + Date.now() + Math.floor(Math.random() * 1000),
      texto: t.slice(0, 2000),
      assunto: ASSUNTOS_MURAL.indexOf(assunto) >= 0 ? assunto : "Geral",
      autor: autor || "", em: new Date().toISOString() };
    l.unshift(m);
    muralSaveRaw(l.slice(0, 500)); // as 500 mais recentes bastam
    return m;
  }
  // remover vira lápide: só filtrar da lista faria o sync devolver a
  // mensagem no puxe seguinte (mesma regra de pessoas e turmas)
  function muralRemover(id) {
    muralSaveRaw(muralRaw().map(function (m) {
      return m.id === id ? { id: m.id, apagada: true, _v: Date.now() } : m;
    }));
  }

  var AVISOS_KEY = "isr_avisos_v1";
  function avisosLista() {
    try { return JSON.parse(localStorage.getItem(AVISOS_KEY)) || []; } catch (e) { return []; }
  }
  function avisosSave(l) { carimbarLista(l); try { localStorage.setItem(AVISOS_KEY, JSON.stringify(l)); } catch (e) {} agendarSync(); }
  function avisar(para, texto, tipo) {
    if (!para || !texto) return null;
    var l = avisosLista();
    var a = { id: "av" + Date.now() + Math.floor(Math.random() * 1000), para: para,
      texto: texto, tipo: tipo || "geral", data: iso(today()), lido: false };
    l.push(a); avisosSave(l); return a;
  }
  function avisosDe(nome) {
    return avisosLista().filter(function (a) { return a.para === nome && !a.lido; })
      .sort(function (a, b) { return a.data < b.data ? 1 : -1; });
  }
  function marcarAvisoLido(id) {
    var l = avisosLista();
    l.forEach(function (a) { if (a.id === id) a.lido = true; });
    avisosSave(l); return l;
  }
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
    if (dono && dono !== ((gestaoUser() || {}).nome || "")) {
      avisar(dono, "Conversa de matrícula marcada: " + (pes ? pes.nome : "") + " · "
        + ddmm(dataIso) + (hora ? " às " + hora : ""), "reuniao");
    }
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
              acao: "Mensagem do estágio", tpl: "lead_followup" });
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
            motivo: sn.detalhe, acao: sn.acao, tpl: sn.tpl, toque: sn.toque || "" });
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
            acao: "Reativar", tpl: "renov_abrir" });
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
          href: "ISR%20-%20Pagamentos.dc.html",
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
        href: tf.pessoaId ? "ISR%20-%20Perfil.dc.html?id=" + tf.pessoaId : (tf.tela || ""),
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

    itens.sort(function (a, b) { return a.urg - b.urg; });
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
    var horizonte = MESES_COBRANCA.slice(0, 3); // mês corrente + 2
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
      return { key: m.key, label: m.label,
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
  function colunaPorTitulo(cels, termos) {
    for (var i = 0; i < cels.length; i++) {
      var s = semAcento(cels[i]);
      for (var j = 0; j < termos.length; j++) {
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
          "omschrijving", "naam", "counterparty", "customer", "merchant", "name", "payer"]),
        valor: colunaPorTitulo(cab, COL_VALOR),
        tipo: colunaPorTitulo(cab, ["tipo do lancamento", "tipo de lancamento", "d/c", "transaction type"]),
        moeda: colunaPorTitulo(cab, ["moeda", "currency"]),
        // o id que o gateway dá à transação é a identidade dela: é o que
        // permite importar o mesmo extrato duas vezes sem duplicar nada
        id: colunaPorTitulo(cab, ["transacao", "id"])
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
          linhas.push({ dt: dt, bruto: bruto,
            desc: col.desc >= 0 ? (c[col.desc] || "").trim() : "",
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
          var d = x.dt.match(/(\d{2})[\/-](\d{2})[\/-](\d{2,4})/);
          var data = d ? (d[1] + "/" + d[2] + "/" + (d[3].length === 2 ? "20" + d[3] : d[3])) : x.dt;
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
  var CONTAS_PROPRIAS_KEY = "isr_contas_proprias_v1";
  function contasProprias() {
    try { return JSON.parse(localStorage.getItem(CONTAS_PROPRIAS_KEY)) || []; } catch (e) { return []; }
  }
  function addContaPropria(nome) {
    var s = semAcento(nome || "").trim();
    if (!s || s.length < 3) return contasProprias();
    var l = contasProprias();
    if (l.indexOf(s) < 0) {
      l.push(s);
      try { localStorage.setItem(CONTAS_PROPRIAS_KEY, JSON.stringify(l)); } catch (e) {}
      agendarSync();
    }
    return l;
  }
  function removerContaPropria(nome) {
    var s = semAcento(nome || "").trim();
    var l = contasProprias().filter(function (n) { return n !== s; });
    try { localStorage.setItem(CONTAS_PROPRIAS_KEY, JSON.stringify(l)); } catch (e) {}
    agendarSync();
    return l;
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

  function ehContaPropria(descricao) {
    var d = semAcento(descricao || "");
    return contasProprias().some(function (n) { return n.length >= 3 && d.indexOf(n) >= 0; });
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

  function sugerirConciliacao(transacoes, moeda, contaAtual) {
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
    var internas = [];
    transacoes = transacoes.filter(function (t) {
      var outra = contaDaDescricao(t.descricao, contaAtual);
      if (outra) {
        internas.push(Object.assign({}, t, { deConta: outra.id, deContaNome: outra.nome }));
        return false;
      }
      if (t.interna || ehContaPropria(t.descricao)) { internas.push(t); return false; }
      return true;
    });
    // todas as parcelas em aberto — inclusive de contrato encerrado, que é
    // como chega o pagamento retroativo do Asaas
    var abertas = parcelasAbertasTodas(moeda);
    var equipe = equipeLista().map(function (x) { return x.nome; });
    var usadas = {};
    var chaveAberta = function (a) { return a.pessoaId + "|" + a.mesKey + "|" + a.contratoIdx; };
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
      if (!pes) { restam.push(t); return; }
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
          nome: pes.nome, email: e, recorrente: recorrente });
        return;
      }
      cands.sort(function (a, b) {
        var dv = Math.abs(a.valor - t.valor) - Math.abs(b.valor - t.valor);
        if (dv) return dv;
        if (a.encerrada !== b.encerrada) return a.encerrada ? 1 : -1;
        return a.mesKey < b.mesKey ? -1 : 1;
      });
      var alvo = cands[0];
      usadas[chaveAberta(alvo)] = true;
      sugestoes.push({ trans: t, pessoaId: alvo.pessoaId, nome: alvo.nome,
        mesKey: alvo.mesKey, mesLabel: alvo.mesLabel, valor: alvo.valor,
        diferenca: Math.round((t.valor - alvo.valor) * 100) / 100,
        porEmail: true, email: e,
        contratoIdx: alvo.contratoIdx, encerrada: alvo.encerrada });
    });
    transacoes = restam;

    // ── 1ª passada: valor bate ────────────────────────────────
    transacoes.forEach(function (t) {
      if (t.valor <= 0) { semMatch.push({ trans: t, tipo: "saida" }); return; }
      var cands = abertas.filter(function (a) {
        return !usadas[chaveAberta(a)] && Math.abs(a.valor - t.valor) <= 0.6;
      });
      if (!cands.length) { pendentes.push(t); return; }
      var desc = (t.descricao || "").toLowerCase();
      cands.sort(function (a, b) {
        var an = desc.indexOf(firstName(a.nome).toLowerCase()) >= 0 ? 0 : 1;
        var bn = desc.indexOf(firstName(b.nome).toLowerCase()) >= 0 ? 0 : 1;
        if (an !== bn) return an - bn;
        // contrato vigente ganha do encerrado quando os dois cabem
        if (a.encerrada !== b.encerrada) return a.encerrada ? 1 : -1;
        return a.mesKey < b.mesKey ? -1 : 1;
      });
      var alvo = cands[0];
      usadas[chaveAberta(alvo)] = true;
      sugestoes.push({ trans: t, pessoaId: alvo.pessoaId, nome: alvo.nome,
        mesKey: alvo.mesKey, mesLabel: alvo.mesLabel, valor: alvo.valor, diferenca: 0,
        contratoIdx: alvo.contratoIdx, encerrada: alvo.encerrada });
    });

    // ── 2ª passada: o nome bate, o valor não ──────────────────
    // Gateway desconta taxa, aluna paga a mais ou a menos, banco arredonda.
    // Achar pelo nome e MOSTRAR a diferença é melhor do que dizer "sem
    // correspondência" e deixar a pessoa procurar na mão.
    pendentes.forEach(function (t) {
      var desc = semAcento(t.descricao || "");
      var cands = abertas.filter(function (a) {
        if (usadas[chaveAberta(a)]) return false;
        var partes = semAcento(a.nome).split(/\s+/).filter(function (x) { return x.length >= 4; });
        if (!partes.length) return false;
        // pelo menos duas partes do nome, ou o primeiro nome se for único
        var achou = partes.filter(function (x) { return desc.indexOf(x) >= 0; }).length;
        return achou >= Math.min(2, partes.length);
      });
      if (!cands.length) { semMatch.push({ trans: t, tipo: "sem_match" }); return; }
      cands.sort(function (a, b) {
        var dv = Math.abs(a.valor - t.valor) - Math.abs(b.valor - t.valor);
        if (dv) return dv;
        return a.encerrada === b.encerrada ? 0 : (a.encerrada ? 1 : -1);
      });
      var alvo = cands[0];
      usadas[chaveAberta(alvo)] = true;
      sugestoes.push({ trans: t, pessoaId: alvo.pessoaId, nome: alvo.nome,
        mesKey: alvo.mesKey, mesLabel: alvo.mesLabel, valor: alvo.valor,
        diferenca: Math.round((t.valor - alvo.valor) * 100) / 100, porNome: true,
        contratoIdx: alvo.contratoIdx, encerrada: alvo.encerrada });
    });

    // ── saídas: quem é da equipe já sai categorizada ──────────
    semMatch.forEach(function (x) {
      if (x.tipo !== "saida") return;
      var desc = semAcento(x.trans.descricao || "");
      var quem = equipe.filter(function (n) {
        var partes = semAcento(n).split(/\s+/).filter(function (p) { return p.length >= 4; });
        return partes.length && partes.filter(function (p) { return desc.indexOf(p) >= 0; }).length
          >= Math.min(2, partes.length);
      })[0];
      if (quem) { x.categoria = "equipe"; x.pessoaEquipe = quem; }
      else if (/taxa|tarifa|mensageria|notificacao|boleto|pix/.test(desc)) x.categoria = "impostos";
      else x.categoria = "outros";
    });

    return { sugestoes: sugestoes, semMatch: semMatch,
      jaRegistradas: jaRegistradas, internas: internas,
      porNome: sugestoes.filter(function (s) { return s.porNome; }).length,
      porEmail: sugestoes.filter(function (s) { return s.porEmail; }).length,
      semParcela: semMatch.filter(function (s) { return s.tipo === "sem_parcela"; }).length };
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
              if (trans.valor) m.valorRecebido = trans.valor;
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
  var syncTimer = null;
  function agendarSync() {
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
    "isr_avisos_v1", "isr_mural_v1", "isr_assinatura_cfg_v1", "isr_cadencia_v1", "isr_categorias_saida_v1", "isr_extrato_reg_v1", "isr_orcamento_v1",
    "isr_resgates_v1", "isr_folha_paga_v1", "isr_comissao_faixas_v1", "isr_metas_periodo_v1",
    "isr_link_pagamento_v1", "isr_flin_url_v1", "isr_minutos_aula_v1", "isr_acessos_v1",
    "isr_contas_proprias_v1", "isr_jotform_v1", "isr_jotform_base_v1", "isr_gravadas_v1",
    "isr_booking_v1", "isr_systeme_v1", "isr_furos_ok_v1", "isr_bookclub_v1",
    "isr_bookclub_aula_v1"];

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
    if (!d[PESSOAS_KEY]) return { ok: false, erro: "O arquivo não contém o cadastro de pessoas." };
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
      // "esta pessoa foi apagada" para os outros aparelhos
      pessoas: loadPessoasRaw(), custos: custosLista(), templates: tplStore(),
      // turmas vai CRU (com as lápides): sem isto a marca de "apagada"
      // não subia ao banco e o puxe seguinte devolvia a turma
      turmas: turmasRaw(), eventos: eventosLista(), chamadas: chamadasAll(),
      // tarefas vai CRU (com as lápides das pendências removidas)
      tarefas: tarefasRaw(), feriados: feriadosLista(), metas: metasAtuais(), moedas: moedasAjustesAll(),
      equipe: equipeLista(), calc: calcParams(),
      lancamentos: lancamentosRaw(), cambio: taxaCambio(), contas: contasLista(),
      toques: toquesLista(), pulsos: pulsosLista(), precos: precosLista(),
      // programas vai CRU (com as lápides): é o sync que espalha o
      // "esta turma foi apagada" para os outros aparelhos
      programas: programasRaw(), avisos: avisosLista(),
      // mural vai CRU (com as lápides das mensagens removidas)
      mural: muralRaw(),
      // configurações que o app da aluna lê: sem elas no payload, o grupo
      // da assinatura e o Book Club nunca chegavam ao aparelho da aluna
      assinaturaCfg: assinaturaCfg(), bookclub: bookclubUrl(), bookclubAula: bookclubAula(),
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
    grava(TAREFAS_KEY, d.tarefas); grava(FERIADOS_KEY, d.feriados); grava(METAS_KEY, d.metas);
    grava(MOEDAS_KEY, d.moedas); grava(EQUIPE_KEY, d.equipe); grava(CALC_KEY, d.calc);
    grava(LANC_KEY, d.lancamentos); grava(TOQUES_KEY, d.toques); grava(PULSOS_KEY, d.pulsos);
    grava(PRECOS_KEY, d.precos); grava(PROGRAMAS_KEY, d.programas); grava(AVISOS_KEY, d.avisos);
    grava(MURAL_KEY, d.mural); grava(CONTAS_KEY, d.contas);
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
      avisos: lista("avisos"),
      mural: lista("mural"),
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
    fetch(url + (url.indexOf("?") >= 0 ? "&" : "?") + "action=sistemaLoad")
      .then(function (r) { return r.json(); })
      .then(function (d) {
        var m = mesclarComRemoto(d && d.ok ? d.data : null);
        aplicarRemoto(m.data);            // o local já fica com o resultado da mesclagem
        return fetch(url, { method: "POST", headers: { "Content-Type": "text/plain;charset=utf-8" },
          body: JSON.stringify({ action: "sistemaSave", data: m.data }) })
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
    try {
      fetch(url + (url.indexOf("?") >= 0 ? "&" : "?") + "action=sistemaLoad")
        .then(function (r) { return r.json(); })
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
            ["custos", "templates", "metas", "calc", "cambio",
             "assinaturaCfg", "bookclub", "bookclubAula"].forEach(function (k) {
              if (d.data[k] !== undefined && d.data[k] !== null) resultado[k] = d.data[k];
            });
            aplicarRemoto(resultado);
            try { localStorage.setItem("isr_sync_em", d.data.atualizadoEm || ""); } catch (e) {}
            if (cb) cb(true);
          } else if (cb) cb(false);
        }).catch(function () { if (cb) cb(false); });
    } catch (e) { if (cb) cb(false); }
  }
  function processarCadastrosPendentes(cb) {
    var url = backendUrl();
    if (!url) { if (cb) cb(0); return; }
    try {
      fetch(url + (url.indexOf("?") >= 0 ? "&" : "?") + "action=cadastrosPendentes")
        .then(function (r) { return r.json(); })
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
            try {
              fetch(url, { method: "POST", headers: { "Content-Type": "text/plain;charset=utf-8" },
                body: JSON.stringify({ action: "cadastroProcessado", id: c.id }) }).catch(function () {});
            } catch (e) {}
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
      fetch(url + (url.indexOf("?") >= 0 ? "&" : "?") + "action=atividadesPendentes")
        .then(function (r) { return r.json(); })
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
            try {
              fetch(url, { method: "POST", headers: { "Content-Type": "text/plain;charset=utf-8" },
                body: JSON.stringify({ action: "atividadeProcessada", id: a.id }) }).catch(function () {});
            } catch (e) {}
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
      fetch(url + (url.indexOf("?") >= 0 ? "&" : "?") + "action=assinaturasPendentes")
        .then(function (r) { return r.json(); })
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
                encerrarAssinatura(pes.id, "Cancelou no systeme", true);
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
            try {
              fetch(url, { method: "POST", headers: { "Content-Type": "text/plain;charset=utf-8" },
                body: JSON.stringify({ action: "assinaturaProcessada", id: ev.id }) }).catch(function () {});
            } catch (e) {}
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
  function equipeLista() {
    try {
      var l = JSON.parse(localStorage.getItem(EQUIPE_KEY));
      if (l) return l;
    } catch (e) {}
    return EQUIPE_PADRAO.map(function (m) { return Object.assign({}, m, { papeis: m.papeis.slice() }); });
  }
  function equipeSave(l) { carimbarLista(l); try { localStorage.setItem(EQUIPE_KEY, JSON.stringify(l)); } catch (e) {} agendarSync(); }
  function addEquipe(dados) {
    var l = equipeLista();
    l.push({ id: "eq" + Date.now(), nome: (dados.nome || "").trim(), email: (dados.email || "").trim().toLowerCase(),
      papeis: dados.papeis || [], valorTipo: dados.valorTipo || "", valor: parseFloat(dados.valor) || 0,
      moeda: dados.moeda || "R$" });
    equipeSave(l); return l;
  }
  function updateEquipe(id, patch) {
    var l = equipeLista();
    var antes = l.filter(function (m) { return m.id === id; })[0];
    var nomeAntigo = antes ? antes.nome : "";
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
  function removeEquipe(id) { var l = equipeLista().filter(function (m) { return m.id !== id; }); equipeSave(l); return l; }
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
  function liberarGestao(email) {
    var e = (email || "").toLowerCase().trim();
    var m = GESTAO_EMAILS[e];
    var eq = equipeLista().filter(function (x) { return x.email === e; })[0];
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
  function sairGestao() { localStorage.removeItem("isr_gestao_user"); }

  // Guard automático: telas de gestão redirecionam pro portão se não
  // houver sessão. Iframes (miniaturas do launcher) ficam de fora.
  (function guardGestao() {
    try {
      if (window.top !== window.self) return;
      var path = decodeURIComponent(window.location.pathname || "");
      var protegidas = ["ISR - Central", "ISR - CRM", "ISR - Mensagens", "ISR - Cobran", "ISR - Caixa", "ISR - Perfil", "ISR - Turmas", "ISR - Turma.", "ISR - Alunas", "ISR - Acompanhamento", "ISR - Programa", "ISR - Marketing", "ISR - Agenda", "ISR - Painel do Professor", "ISR - Equipe", "ISR - Calculadora"];
      var ehGestao = protegidas.some(function (p) { return path.indexOf(p) >= 0; });
      if (ehGestao && !gestaoUser()) window.location.replace("gestao.html");
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
  function salvarChamada(turmaLabel, dataIso, presencas, por, tarefas) {
    var m = chamadasAll();
    var key = turmaLabel + "|" + dataIso;
    var antes = (m[key] && m[key].presencas) || {};
    m[key] = { turma: turmaLabel, data: dataIso, presencas: presencas,
      tarefas: tarefas || {},
      salvoEm: new Date().toISOString(), por: por || "" };
    chamadasSaveLocal(m);
    agendarSync();
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
          pushHist(p, "contato", "Aula particular dada em " + ddmm(dataIso) + " (" + p.particular.feitas + tot + ")");
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
  function registrarAulaParticular(id) {
    return mutate(id, function (p) {
      p.particular = p.particular || { inicio: p.desde || iso(today()), aulas: 0, feitas: 0 };
      p.particular.feitas = (p.particular.feitas || 0) + 1;
      var tot = p.particular.aulas ? " de " + p.particular.aulas : "";
      pushHist(p, "contato", "Aula particular dada (" + p.particular.feitas + tot + ")");
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
  var CADENCIAS = [
    { id: "semanal", label: "Semanal", dias: 7 },
    { id: "quinzenal", label: "Quinzenal", dias: 14 },
    { id: "mensal", label: "Mensal", dias: 28 }
  ];

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

    var novas = [], d = new Date(d0), guarda = 0;
    while (novas.length < quantas && guarda < 400) {
      guarda++;
      var dataIso = iso(d);
      if (!ehFeriado(dataIso) && !jaMarcadas[dataIso]) {
        novas.push({ id: "ap" + Date.now() + "_" + novas.length,
          data: dataIso, hora: hora, estado: "marcada", remarcacoes: [] });
        jaMarcadas[dataIso] = true;
        d.setDate(d.getDate() + cad.dias);
      } else {
        // feriado (ou dia já ocupado) empurra pela mesma cadência,
        // preservando o dia da semana combinado
        d.setDate(d.getDate() + cad.dias);
      }
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
    // a professora precisa saber que a aula dela mudou de dia
    var prof = (pes.particular && pes.particular.professora) || pes.professora || "";
    if (prof) {
      avisar(prof, "Aula particular de " + pes.nome + " remarcada: "
        + ddmm(dataAntiga) + " → " + ddmm(novaData)
        + (novaHora ? " às " + novaHora : "")
        + (excedeu ? " · " + noMes + "ª remarcação no mês (limite: "
            + LIMITE_REMARCACAO_MES + ")" : ""), "aula");
    }
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
      var prof = p.particular.professora || p.professora || "";
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
  function aulasDadasNoMes(turmaLabel, mesKey) {
    var m = chamadasAll(), n = 0, comTarefa = 0;
    Object.keys(m).forEach(function (k) {
      var ch = m[k];
      if (ch.turma !== turmaLabel || mesDe(ch.data) !== mesKey) return;
      n++;
      if (ch.tarefas && Object.keys(ch.tarefas).length) comTarefa++;
    });
    return { aulas: n, comTarefa: comTarefa,
      pctTarefa: n ? Math.round((comTarefa / n) * 100) : null };
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
  function particularesNoMes(professora, mesKey) {
    var n = 0, alunas = [];
    loadPessoas().forEach(function (p) {
      if (professora && (p.particular ? p.particular.professora : p.professora) !== professora
          && p.professora !== professora) return;
      (p.historico || []).forEach(function (h) {
        if (mesDe(h.data) !== mesKey) return;
        if (String(h.texto || "").indexOf("Aula particular dada") !== 0) return;
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
      if (p.status !== "aluna") return;
      var prof = (p.particular && p.particular.professora) || p.professora;
      if (professora && prof !== professora) return;
      if (!p.particular && !/particular/i.test(p.turma || "")) return;
      var c = contratoVigente(p);
      if (!c) return;
      var m = (c.meses || []).filter(function (x) { return x.key === mesKey; })[0];
      if (!m || !m.valor) return;
      alunas++;
      total += emMoedaDaFolha(parseMoney(m.valor), c.moeda || p.moeda || "R$", cfg);
    });
    return { valor: total, alunas: alunas };
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
        var dadas = aulasDadasNoMes(label, mes);
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

    var total = parteTurma + vPart + vExtras;
    var inadimplentes = turmas.reduce(function (s, x) { return s + x.inadimplentes; }, 0);

    return {
      nome: nome, mes: mes, moeda: moeda, cfg: cfg,
      fixo: fixo, turmas: turmas, somaTurmas: somaTurmas,
      turmasComMovimento: comMovimento.length,
      turmasParadas: turmas.length - comMovimento.length,
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

  // As vendas de um mês: quem virou cliente naquele mês.
  function vendasDoMes(mesKey, porQuem) {
    var mes = mesKey || mesAtualKey();
    return loadPessoas().filter(function (p) {
      if (p.status === "lead") return false;
      if (mesDe(p.desde) !== mes) return false;
      if (porQuem && (p.vendidoPor || p.professora) !== porQuem) return false;
      return true;
    }).map(function (p) {
      var c = contratoVigente(p) || {};
      var meses = c.meses || [];
      var total = meses.reduce(function (s, m) { return s + parseMoney(m.valor); }, 0);
      if (!total && p.programa) total = parseMoney(p.programa.valor);
      return { id: p.id, nome: p.nome, contrato: total,
        parcelas: meses.length || 1,
        primeiroMes: meses.length ? meses[0].key : mes,
        moeda: c.moeda || (p.programa ? p.programa.moeda : "R$") };
    });
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
    // olha 12 meses para trás procurando vendas cujas parcelas alcançam o mês
    for (var i = 0; i < 12; i++) {
      var d = new Date(); d.setMonth(d.getMonth() - i);
      var mv = d.getFullYear() + "-" + ("0" + (d.getMonth() + 1)).slice(-2);
      var fech = comissaoComercial(mv, porQuem);
      fech.vendas.forEach(function (v) {
        var p = getPessoa(v.id);
        var c = p ? contratoVigente(p) : null;
        if (!c) return;
        var parcela = (c.meses || []).filter(function (m) { return m.key === mes; })[0];
        if (!parcela) return;
        var qual = (c.meses || []).map(function (m) { return m.key; }).indexOf(mes) + 1;
        var linha = { nome: v.nome, mesVenda: mv, contrato: v.contrato,
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
        onde: t ? "ISR - Turma.dc.html" : "ISR - Perfil.dc.html",
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
        onde: "ISR - Equipe.dc.html", ondeLabel: "Cadastrar",
        nome: s.nome });
    });

    // valor combinado sem forma de pagamento: o número está lá e não paga
    // ninguém. Acontecia por um bug do formulário, e o dado ficou.
    equipeLista().forEach(function (m) {
      if (!(m.valor > 0) || m.valorTipo) return;
      out.push({ tipo: "remuneracao_incompleta", urg: 1, chave: "remuneracao_incompleta|" + m.nome,
        titulo: m.nome + " tem " + fmtMoney(m.moeda || "R$", m.valor) + " no cadastro sem forma de pagamento",
        detalhe: "Sem escolher \u201ccomo recebe\u201d, o valor não entra na folha",
        onde: "ISR - Equipe.dc.html", ondeLabel: "Corrigir",
        nome: m.nome });
    });

    // turma que não fecha o mínimo: decisão de juntar ou encerrar.
    // Abre a página da própria turma, com as alunas e os dados à vista.
    turmasAbaixoDoMinimo().forEach(function (u) {
      out.push({ tipo: "turma_abaixo_minimo", urg: 2, chave: "turma_abaixo_minimo|" + u.id,
        titulo: u.label + " com " + u.alunas
          + (u.alunas === 1 ? " aluna" : " alunas"),
        detalhe: "Faltam " + u.faltam + " para o mínimo de " + MINIMO_TURMA,
        onde: "ISR - Turma.dc.html", ondeLabel: "Abrir a turma",
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
        onde: "ISR - Perfil.dc.html", ondeLabel: "Abrir",
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
    return { mes: mes, linhas: linhas, total: total, receitaTurmas: receita,
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
  function gravacoesParaAluna(pessoaId) {
    var p = getPessoa(pessoaId);
    if (!p) return { extras: [], turma: [] };
    var todas = gravacoesLista().filter(function (g) { return !!g.link; });
    var extras = todas.filter(function (g) { return g.tipo === "extra"; });
    var daTurma = p.turma
      ? todas.filter(function (g) { return g.tipo === "turma" && g.turma === p.turma; })
      : [];
    var ordena = function (a, b) { return a.data < b.data ? 1 : -1; };
    return { extras: extras.sort(ordena), turma: daTurma.sort(ordena) };
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

  // A lista do que a pessoa tem contratado agora, produto a produto.
  // ── ASSINATURA (produto recorrente: Book Club, desafios, plantão) ──
  function ativarAssinatura(pessoaId, cfg) {
    return mutate(pessoaId, function (p) {
      p.assinatura = { inicio: iso(today()), valor: (cfg && cfg.valor) || "",
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

    var asn = p.assinatura;
    out.push({ id: "assinatura", nome: "Assinatura",
      contratado: assinaturaAtiva(p),
      detalhe: assinaturaAtiva(p)
        ? ("desde " + ddmm(asn.inicio)
          + (asn.valor ? " \u00b7 " + asn.valor + "/m\u00eas" : "")
          + (assinaturaNoAviso(p) ? " \u00b7 CANCELADA \u00b7 acesso at\u00e9 " + ddmm(asn.ate) : "")
          + (asn.pedidoCancelamento && !asn.encerrada
              ? " \u00b7 PEDIU CANCELAMENTO em " + ddmm(asn.pedidoCancelamento) : ""))
        : "",
      pago: null });

    var pr = p.programa;
    out.push({ id: "programa", nome: "Acompanhamento",
      contratado: !!(pr && !pr.encerrado),
      detalhe: pr && !pr.encerrado
        ? pr.nome + " · " + pr.valor
          + (pr.desde ? " · desde " + ddmm(pr.desde) : "")
        : "",
      pago: pr && !pr.encerrado ? !!pr.pago : null });

    return out;
  }
  function alunasDaTurma(turmaLabel) {
    return loadPessoas().filter(function (p) { return p.status === "aluna" && p.turma === turmaLabel; });
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
    var alunas = alunasDaTurma(turmaLabel);
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
      var dono = ["Gabi", "Érika", "Carla"].indexOf(pessoa.professora) >= 0 ? pessoa.professora : "Gabi";
      avisar(dono, pessoa.nome + " respondeu ao desafio da semana " + semana + ". Falta a devolutiva.", "programa");
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
        if (d.getDay() === alvo && !ehFeriado(iso(d))) {
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
    "isr_toques_v1", "isr_pulsos_v1", "isr_programas_v1", "isr_avisos_v1", "isr_mural_v1",
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
      tipo: dados.tipo === "entrada" ? "entrada" : "saida",
      categoria: dados.categoria || (dados.tipo === "entrada" ? "outra" : "outros"),
      descricao: dados.descricao || "Lançamento",
      moeda: dados.moeda || "R$",
      // link da fatura ou comprovante (arquivo no Drive) — abre direto do Caixa
      fatura: (dados.fatura || "").trim(),
      // por onde o dinheiro entrou ou saiu (Asaas, Stripe, Wise, bunq)
      conta: (dados.conta || "").trim(),
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
          entradas.push({ pessoaId: p.id, nome: p.nome,
            categoria: catPessoa,
            detalhe: p.turma || (c.tipo || ""),
            moeda: moeda, valor: parseMoney(m.valor), valorLabel: m.valor,
            pago: !!m.pago, venc: venc, atrasada: !m.pago && venc < hoje,
            conta: m.conta || "" });
        });
        if (c.sinal && c.sinal.valor && !c.sinal.cancelada && (p.desde || "").slice(0, 7) === key
            && !futuroDeQuemSaiu(c.sinal.recebido, p.desde)) {
          entradas.push({ pessoaId: p.id, nome: p.nome, categoria: "sinal",
            detalhe: "Sinal de matrícula", moeda: moeda,
            valor: parseMoney(c.sinal.valor), valorLabel: c.sinal.valor,
            pago: !!c.sinal.recebido, venc: p.desde,
            atrasada: !c.sinal.recebido && p.desde < hoje });
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
          // cobrança automática: passou o dia, entrou. Não existe
          // "atrasada" aqui — ou já rodou, ou ainda vai rodar.
          pago: venc <= hoje, venc: venc, atrasada: false, recorrente: true });
      });
    });

    var lancs = lancamentosDoMes(key);
    lancs.filter(function (l) { return l.tipo === "entrada"; }).forEach(function (l) {
      entradas.push({ pessoaId: "", nome: l.descricao, categoria: l.categoria || "outra",
        detalhe: "Lançamento", moeda: l.moeda, valor: l.valor,
        valorLabel: fmtMoney(l.moeda, l.valor), pago: true, venc: l.data,
        atrasada: false, lancId: l.id, conta: l.conta || "" });
    });

    var saidas = custosDoMes(key).map(function (c) {
      return { nome: c.nome, categoria: c.categoria || "outros", moeda: c.moeda, valor: c.valor, fixo: true };
    }).concat(folhaNoCaixa(key)).concat(lancs.filter(function (l) { return l.tipo === "saida"; }).map(function (l) {
      return { nome: l.descricao, categoria: l.categoria || "outros", moeda: l.moeda,
        valor: l.valor, fixo: false, data: l.data, lancId: l.id, fatura: l.fatura || "",
        conta: l.conta || "" };
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
    entradas.forEach(function (e) {
      if (e.pago) { recebido[e.moeda] += e.valor; acumula(porCatEntrada, e.categoria, e.moeda, e.valor); }
      else if (e.atrasada) atrasado[e.moeda] += e.valor;
      else aReceber[e.moeda] += e.valor;
    });
    saidas.forEach(function (s) { saiu[s.moeda] += s.valor; acumula(porCatSaida, s.categoria, s.moeda, s.valor); });

    var meta = metaDoMes(key);
    var faturado = { "R$": recebido["R$"], "€": recebido["€"] };
    var previsto = { "R$": recebido["R$"] + aReceber["R$"] + atrasado["R$"],
                     "€": recebido["€"] + aReceber["€"] + atrasado["€"] };
    var pct = function (a, b) { return b > 0 ? Math.round(100 * a / b) : (a > 0 ? 100 : 0); };

    return {
      key: key, entradas: entradas, saidas: saidas,
      porCatEntrada: porCatEntrada, porCatSaida: porCatSaida, porConta: porConta,
      recebido: recebido, aReceber: aReceber, atrasado: atrasado, saiu: saiu,
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
        resultado: emReais(recebido) - emReais(saiu) }
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

    f.linhas.forEach(function (l) {
      out.push({ nome: l.nome + " · aulas do mês", categoria: "equipe",
        moeda: moeda, valor: Math.round(l.total * 100) / 100,
        fixo: true, calculado: true, origem: "folha" });
    });
    (f.fixos || []).forEach(function (x) {
      out.push({ nome: x.nome + " · valor mensal", categoria: "equipe",
        moeda: moeda, valor: Math.round(x.total * 100) / 100,
        fixo: true, calculado: true, origem: "folha_fixo" });
    });

    // Comissão segue a parcela: só sai o que a aluna já pagou.
    var com = comissaoAPagar(k);
    if (com && com.total > 0) {
      out.push({ nome: (comercialDaEquipe() || "Comercial") + " · comissão",
        categoria: "equipe", moeda: moeda,
        valor: Math.round(com.total * 100) / 100,
        fixo: true, calculado: true, origem: "comissao" });
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

    // ── despesa realizada: o que os extratos confirmaram ──
    // lançamentos (cada um nasceu de uma linha de extrato ou de digitação
    // consciente) + folha quitada com o valor que de fato saiu
    var real = {};
    lancamentosDoMes(k).filter(function (l) { return l.tipo === "saida"; })
      .forEach(function (l) {
        var cat = l.categoria || "outros";
        real[cat] = (real[cat] || 0) + umReal(l.valor, l.moeda);
      });
    var fp = folhaPagaAll();
    Object.keys(fp).forEach(function (ch) {
      var pg = fp[ch];
      if (pg.mes === k && pg.valor > 0) real.equipe = (real.equipe || 0) + pg.valor;
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
    var add = function (id, titulo, ok, esperado, obtido, detalhe) {
      checks.push({ id: id, titulo: titulo, ok: ok,
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

    var falhas = checks.filter(function (c) { return !c.ok; });
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
    setParcelaPaga: setParcelaPaga, entradasPrevistas: entradasPrevistas,
    MES_NOMES: MES_NOMES, mesSeguinte: mesSeguinte, mesAnterior: mesAnterior,
    parseMoney: parseMoney, fmtMoney: fmtMoney, mesAtualKey: mesAtualKey,
    // renovações
    renovacoes: renovacoes, setRenovacao: setRenovacao, taxaRenovacao: taxaRenovacao,
    // fila + metas
    filaParaHoje: filaParaHoje, adiarItem: adiarItem, progressoMetas: progressoMetas,
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
    getChamada: getChamada, salvarChamada: salvarChamada, faltasDe: faltasDe, presencasDe: presencasDe, alunasDaTurma: alunasDaTurma,
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
    contasProprias: contasProprias, addContaPropria: addContaPropria,
    removerContaPropria: removerContaPropria, ehContaPropria: ehContaPropria,
    orcamentoDoMes: orcamentoDoMes, setOrcamento: setOrcamento,
    lerAlunasTurmas: lerAlunasTurmas, aplicarAlunasTurmas: aplicarAlunasTurmas,
    lerLeads: lerLeads, aplicarLeads: aplicarLeads,
    jotformKey: jotformKey, setJotformKey: setJotformKey,
    jotformBase: jotformBase, setJotformBase: setJotformBase, jotformOutraBase: jotformOutraBase,
    gravadasUrl: gravadasUrl, setGravadasUrl: setGravadasUrl,
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
    mesesFinanceiro: mesesFinanceiro, mesOffset: mesOffset,
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
    assinaturaAtiva: assinaturaAtiva, pedirCancelamentoAssinatura: pedirCancelamentoAssinatura,
    updatePerfilAluna: updatePerfilAluna,
    assinaturaCfg: assinaturaCfg, setAssinaturaCfg: setAssinaturaCfg,
    contasLista: contasLista, contaMeta: contaMeta, contaLabel: contaLabel,
    contaDaDescricao: contaDaDescricao, emailDaTransacao: emailDaTransacao,
    addConta: addConta, removeConta: removeConta,
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
    avisosDe: avisosDe, avisar: avisar, marcarAvisoLido: marcarAvisoLido, avisosLista: avisosLista,
    muralLista: muralLista, muralPost: muralPost, muralRemover: muralRemover,
    ASSUNTOS_MURAL: ASSUNTOS_MURAL,
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
    aulasDadasNoMes: aulasDadasNoMes, frequenciaDaTurma: frequenciaDaTurma,
    particularesNoMes: particularesNoMes, extrasNoMes: extrasNoMes,
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
    registrarAcessoAluna: registrarAcessoAluna, acessoDaAluna: acessoDaAluna, usoDoApp: usoDoApp,
    horasDaAluna: horasDaAluna, minutosDaAula: minutosDaAula, setMinutosDaAula: setMinutosDaAula,
    aulasPorCiclo: aulasPorCiclo, setAulasPorCiclo: setAulasPorCiclo,
    diarioDaTurma: diarioDaTurma,
    MINIMO_TURMA: MINIMO_TURMA, turmasAbaixoDoMinimo: turmasAbaixoDoMinimo,
    progressoCiclo: progressoCiclo,
    contratarParticular: contratarParticular, encerrarParticular: encerrarParticular,
    CADENCIAS_PARTICULAR: CADENCIAS, LIMITE_REMARCACAO_MES: LIMITE_REMARCACAO_MES,
    agendaParticular: agendaParticular, agendarSerieParticular: agendarSerieParticular,
    remarcarAulaParticular: remarcarAulaParticular, cancelarAulaParticular: cancelarAulaParticular,
    removerAulaParticular: removerAulaParticular, remarcacoesNoMes: remarcacoesNoMes,
    proximaAulaParticular: proximaAulaParticular, marcarAulaParticularFeita: marcarAulaParticularFeita,
    aulasParticularesAgendadas: aulasParticularesAgendadas,
    setParticularPago: setParticularPago, produtosDe: produtosDe,
    PROGRAMA_PRECO_PADRAO: PROGRAMA_PRECO_PADRAO, setPrecoPrograma: setPrecoPrograma,
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
    syncEstado: syncEstado, mesclarLista: mesclarLista, mesclarMapa: mesclarMapa, carimbar: carimbar,
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
