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
    { id: "contrato", label: "Contrato / matrícula", short: "Contrato", color: "#348a8e", bg: "rgba(52,138,142,0.14)" },
    { id: "matriculado", label: "Matriculada", short: "Matriculados", color: "#5a9e4b", bg: "rgba(90,158,75,0.16)" },
    { id: "perdido", label: "Perdido", short: "Perdidos", color: "#9b8b7e", bg: "rgba(155,139,126,0.16)" }
  ];

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

  var CANAIS = ["Instagram", "Formulário", "Indicação", "Site", "WhatsApp", "Anúncio", "Social Selling", "Aplicação"];

  // Motivos de perda (CRM + Renovações usam a mesma lista — spec 6/8)
  var MOTIVOS_PERDA = ["Preço", "Horário", "Sumiu", "Concorrente", "Momento errado", "Outro"];

  var STATUS_META = {
    lead:      { label: "Lead",      color: "#e07856", bg: "rgba(224,120,86,0.14)" },
    aluna:     { label: "Aluna",     color: "#5a9e4b", bg: "rgba(90,158,75,0.16)" },
    pausada:   { label: "Pausada",   color: "#d4a574", bg: "rgba(212,165,116,0.16)" },
    "ex-aluna":{ label: "Ex-aluna",  color: "#9b8b7e", bg: "rgba(155,139,126,0.16)" },
    mvs:       { label: "MVS",       color: "#6b5b95", bg: "rgba(107,91,149,0.14)" }
  };

  // ── DATAS ─────────────────────────────────────────────────────
  function today() { var d = new Date(); d.setHours(0, 0, 0, 0); return d; }
  function iso(d) { return d.toISOString().slice(0, 10); }
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
    { id: "aluno_faltou", categoria: "Alunos", titulo: "Sentimos sua falta",
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
    { id: "mvs_upsell", categoria: "MVS", titulo: "Convite pra experimentar grupo",
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
  var CAPACIDADE_PADRAO = 10;
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
      projeto: "My Timeline", notebook: "ON-SPE_Student_Notebook_My_Timeline_26_2" }
  ];

  // ── TURMAS EDITÁVEIS ──────────────────────────────────────────
  var TURMAS_KEY = "isr_turmas_v1";
  function turmasLista() {
    try { var st = JSON.parse(localStorage.getItem(TURMAS_KEY)); if (st && st.length) return st; } catch (e) {}
    return UNITS.map(function (u) { return Object.assign({ capacidade: CAPACIDADE_PADRAO }, u); });
  }
  function turmasSave(list) { try { localStorage.setItem(TURMAS_KEY, JSON.stringify(list)); } catch (e) {} agendarSync(); }
  function addTurma(dados) {
    var list = turmasLista();
    list.push({ id: "t" + Date.now(), nivel: dados.nivel || "", turma: dados.turma || "",
      teacher: dados.teacher || "", cycle: dados.cycle || metasAtuais().cicloLabel,
      projeto: dados.projeto || "", notebook: dados.notebook || "",
      capacidade: parseInt(dados.capacidade, 10) || CAPACIDADE_PADRAO });
    turmasSave(list); return list;
  }
  function updateTurma(id, patch) {
    var list = turmasLista();
    for (var i = 0; i < list.length; i++) if (list[i].id === id) { Object.assign(list[i], patch); break; }
    turmasSave(list); return list;
  }
  function removeTurma(id) {
    var list = turmasLista().filter(function (t) { return t.id !== id; });
    turmasSave(list); return list;
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
  function mkMeses(pagos, valor, n) {
    return MESES_COBRANCA.slice(0, n).map(function (m, i) {
      return { key: m.key, label: m.label, valor: valor, pago: i < pagos };
    });
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
  function ensureSeed() {
    if (localStorage.getItem(SEED_FLAG)) return;
    localStorage.setItem(PESSOAS_KEY, JSON.stringify(seedPessoas()));
    localStorage.setItem(SEED_FLAG, "1");
  }
  function loadPessoas() {
    ensureSeed();
    try { return JSON.parse(localStorage.getItem(PESSOAS_KEY)) || []; }
    catch (e) { return []; }
  }
  function savePessoasLocal(list) {
    try { localStorage.setItem(PESSOAS_KEY, JSON.stringify(list)); } catch (e) {}
  }
  function savePessoas(list) { savePessoasLocal(list); agendarSync(); }
  function getPessoa(id) { return loadPessoas().filter(function (p) { return p.id === id; })[0] || null; }
  function mutate(id, fn) {
    var list = loadPessoas();
    for (var i = 0; i < list.length; i++) if (list[i].id === id) { fn(list[i]); break; }
    savePessoas(list);
    return list;
  }
  // historico é append-only — toda escrita relevante passa por aqui
  function pushHist(p, tipo, texto, quem) {
    p.historico = p.historico || [];
    p.historico.push({ data: iso(today()), tipo: tipo, texto: texto, quem: quem || "" });
  }
  function addHistory(id, tipo, texto, quem) { return mutate(id, function (p) { pushHist(p, tipo, texto, quem); }); }

  // ── AÇÕES (spec: todo dado nasce de uma ação) ─────────────────
  function updateLead(id, patch) { return mutate(id, function (p) { Object.assign(p, patch); }); }
  function setStage(id, stageId) {
    var st = STAGES.filter(function (s) { return s.id === stageId; })[0];
    return mutate(id, function (p) { p.estagio = stageId; pushHist(p, "estagio", "Estágio → " + (st ? st.label : stageId)); });
  }
  function setFollowup(id, isoStr, label) {
    return mutate(id, function (p) { p.proximoFollowup = isoStr; pushHist(p, "followup", "Follow-up agendado" + (label ? " · " + label : "")); });
  }
  function addNote(id, texto) { return addHistory(id, "nota", texto); }
  function registrarContato(id, detalhe) { return addHistory(id, "contato", "Registrado contato" + (detalhe ? " · " + detalhe : "")); }
  function marcarPerdido(id, motivo) {
    return mutate(id, function (p) {
      p.estagio = "perdido"; p.motivoPerda = motivo || "Outro"; p.saidaEm = iso(today());
      if (p.status === "aluna") p.status = "ex-aluna";
      pushHist(p, "perdido", "Marcado perdido · motivo: " + (motivo || "Outro"));
    });
  }
  function deleteLead(id) {
    var list = loadPessoas().filter(function (p) { return p.id !== id; });
    savePessoas(list);
    return list;
  }
  // Novo lead manual (spec 1.1: o registro nasce no primeiro contato)
  function novaPessoa(dados) {
    var list = loadPessoas();
    var p = {
      id: "p" + Date.now(),
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
  function matricular(id, cfg) {
    var particular = cfg.turmaId === "particular";
    var unit = turmasLista().filter(function (u) { return u.id === cfg.turmaId; })[0];
    var turmaLabel = particular ? "Particular" : (unit ? (unit.nivel + " · " + unit.turma) : (cfg.turmaLabel || ""));
    var n = parseInt(cfg.parcelas, 10) || 3;
    return mutate(id, function (p) {
      p.status = "aluna";
      p.estagio = "matriculado";
      p.turma = turmaLabel;
      p.professora = unit ? unit.teacher : "";
      p.formatos = (p.formatos || []).concat([particular ? "particular" : "grupo"]);
      if (particular) {
        p.particular = { inicio: cfg.inicioEm || iso(today()),
          aulas: parseInt(cfg.aulasContratadas, 10) || 0, feitas: 0 };
      }
      p.desde = iso(today());
      var fimIdx = Math.min(n - 1, MESES_COBRANCA.length - 1);
      p.contratos = p.contratos || [];
      // valor total: informado, ou calculado (parcela × nº de parcelas) pro LTV
      var moedaC = cfg.moeda || p.moeda || "R$";
      var totalCalc = cfg.valorTotal || (cfg.valorParcela ? fmtMoney(moedaC, parseMoney(cfg.valorParcela) * n) : "");
      p.contratos.unshift({
        tipo: cfg.tipo || "Matrícula", ciclos: cfg.ciclos || "1 Ciclo " + metasAtuais().cicloLabel,
        moeda: moedaC, valorTotal: totalCalc,
        parcelaValor: cfg.valorParcela || "", parcelas: n, vencDia: cfg.vencDia || 10,
        fim: MESES_COBRANCA[fimIdx].key + "-28",
        meses: mkMeses(0, cfg.valorParcela || "", n)
      });
      if (cfg.sinalValor) {
        p.contratos[p.contratos.length - 1].sinal = { valor: cfg.sinalValor, recebido: !!cfg.sinalRecebido };
        pushHist(p, "pagamento", "Sinal de " + cfg.sinalValor + (cfg.sinalRecebido ? " recebido" : " combinado (aguardando comprovante)"));
      }
      p.onboarding = [
        { id: "d0", label: "Boas-vindas enviadas", data: addDays(0), feito: false },
        { id: "d2", label: "Confirmou a 1ª aula", data: addDays(2), feito: false },
        { id: "d7", label: "Check-in da 1ª semana", data: addDays(7), feito: false },
        { id: "d30", label: "1º pagamento ok + NPS", data: addDays(30), feito: false }
      ];
      pushHist(p, "matricula", "Matriculada · " + turmaLabel + " · contrato " + (cfg.tipo || "Matrícula") + " criado (" + n + " parcelas)");
      pushHist(p, "onboarding", "Onboarding criado (4 checkpoints: boas-vindas, 1ª aula, 1ª semana, 1º pagamento)");
    });
  }

  // ── COMPAT: visão "leads" (CRM) sobre Pessoas ─────────────────
  function toLeadShape(p) {
    return {
      id: p.id, nome: p.nome, telefone: p.whatsapp, email: p.email,
      canal: (p.origem && p.origem.canal) || "—",
      origemDetalhe: (p.origem && p.origem.detalhe) || "",
      veioDe: (p.origem && p.origem.veioDe) || "",
      entrouPor: (p.origem && p.origem.entrouPor) || "",
      entrouEm: p.entrouEm, turma: p.turma, nivel: p.nivel,
      horarios: p.horarios, querComecar: p.querComecar,
      estagio: p.estagio, badge: p.badge || "",
      proximoFollowup: p.proximoFollowup || "",
      historico: p.historico || [], status: p.status, motivoPerda: p.motivoPerda || ""
    };
  }
  function getLeads() { return loadPessoas().map(toLeadShape); }
  function getLead(id) { var p = getPessoa(id); return p ? toLeadShape(p) : null; }

  function isParaHojeLead(l) {
    if (l.estagio === "perdido" || l.estagio === "matriculado") return false;
    if (l.estagio === "incompleta") return true;
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
    return {
      id: p.id, nome: p.nome, telefone: p.whatsapp,
      tipo: c.tipo, ciclos: c.ciclos, moeda: c.moeda,
      valorTotal: c.valorTotal, parcelaValor: c.parcelaValor,
      parcelas: c.parcelas, vencDia: c.vencDia, meses: c.meses || [],
      obs: p.obsCobranca || "", fim: c.fim || ""
    };
  }
  function getCobranca() {
    return loadPessoas()
      .filter(function (p) { return (p.status === "aluna" || p.status === "mvs") && contratoVigente(p) && (contratoVigente(p).meses || []).length; })
      .map(toCobrancaShape);
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
  function setParcelaPaga(pessoaId, mesKey, pago) {
    return mutate(pessoaId, function (p) {
      var c = contratoVigente(p);
      if (!c) return;
      (c.meses || []).forEach(function (m) {
        if (m.key === mesKey) {
          m.pago = pago;
          pushHist(p, "pagamento", "Parcela de " + m.label + " marcada " + (pago ? "PAGA" : "pendente") + " (" + m.valor + ")");
        }
      });
    });
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
        if (!m.pago && out[m.key]) out[m.key][c.moeda] += parseMoney(m.valor || c.parcelaValor);
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
  function ltv(p) {
    var tot = { "R$": 0, "€": 0 };
    (p.contratos || []).forEach(function (c) { tot[c.moeda || "R$"] += parseMoney(c.valorTotal || ""); });
    var parts = [];
    if (tot["R$"]) parts.push(fmtMoney("R$", tot["R$"]));
    if (tot["€"]) parts.push(fmtMoney("€", tot["€"]));
    return parts.join(" + ") || "—";
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
      var r = { pessoaId: p.id, nome: p.nome, data: p.reuniao.data, hora: p.reuniao.hora || "",
        feita: !!p.reuniao.feita, virouAluna: p.status === "aluna" };
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

  // ── PAINEL DE ALUNAS ──────────────────────────────────────────
  // Todo mundo que já é aluna, com os sinais que dizem se ela está
  // bem ou se precisa de você. É a base do acompanhamento: sem isso
  // o único jeito de saber como alguém está é abrindo perfil por perfil.
  var RISCOS = {
    inadimplente: { label: "Pagamento atrasado", cor: "#cf6b5c", peso: 40 },
    faltando:     { label: "Faltando",           cor: "#e07856", peso: 30 },
    sem_contato:  { label: "Sem contato",        cor: "#d4a574", peso: 20 },
    onboarding:   { label: "Onboarding parado",  cor: "#9c6f56", peso: 25 },
    renovacao:    { label: "Renovação chegando", cor: "#6b5b95", peso: 15 }
  };
  function alunasPainel() {
    var hoje = iso(today());
    return loadPessoas()
      .filter(function (p) { return p.status === "aluna" || p.status === "mvs"; })
      .map(function (p) {
        var c = contratoVigente(p) || {};
        var meses = c.meses || [];
        var dia = parseInt(c.vencDia, 10); if (isNaN(dia)) dia = 10;
        var atrasadas = meses.filter(function (m) {
          var venc = m.key + "-" + (dia < 10 ? "0" : "") + dia;
          return !m.pago && venc < hoje;
        });
        var pagas = meses.filter(function (m) { return m.pago; }).length;
        var faltas = faltasDe(p.id);
        var ob = p.onboarding || [];
        var obFeitos = ob.filter(function (x) { return x.feito; }).length;
        var obAtrasado = ob.filter(function (x) { return !x.feito && x.data < hoje; }).length;
        var ultimo = (p.historico && p.historico.length)
          ? p.historico[p.historico.length - 1] : null;
        var diasSemContato = ultimo ? daysBetween(parseISO(ultimo.data), today()) : 999;
        var fimContrato = c.fim || "";
        var diasPraRenovar = fimContrato ? daysBetween(today(), parseISO(fimContrato)) : null;

        var riscos = [];
        if (atrasadas.length) riscos.push("inadimplente");
        if (faltas >= 2) riscos.push("faltando");
        if (obAtrasado > 0) riscos.push("onboarding");
        if (diasSemContato > 30) riscos.push("sem_contato");
        if (diasPraRenovar !== null && diasPraRenovar >= 0 && diasPraRenovar <= 30) riscos.push("renovacao");

        var score = riscos.reduce(function (a, r) { return a + RISCOS[r].peso; }, 0);
        return {
          id: p.id, nome: p.nome, turma: p.turma || "—", professora: p.professora || "—",
          nivel: p.nivel || "", status: p.status, whatsapp: p.whatsapp || "",
          moeda: c.moeda || p.moeda || "R$", parcelaValor: c.parcelaValor || "",
          parcelasPagas: pagas, parcelasTotal: meses.length,
          atrasadas: atrasadas.length,
          faltas: faltas,
          onboardingFeitos: obFeitos, onboardingTotal: ob.length,
          diasSemContato: diasSemContato,
          proximoCheckin: p.proximoCheckin || "",
          fimContrato: fimContrato, diasPraRenovar: diasPraRenovar,
          moedas: moedasDe(p.id).total,
          desde: p.desde || "",
          riscos: riscos, score: score,
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
  function tarefasLista() { try { return JSON.parse(localStorage.getItem(TAREFAS_KEY)) || []; } catch (e) { return []; } }
  function tarefasSave(l) { try { localStorage.setItem(TAREFAS_KEY, JSON.stringify(l)); } catch (e) {} agendarSync(); }
  function addTarefa(dados) {
    var l = tarefasLista();
    l.push({ id: "tf" + Date.now(), titulo: (dados.titulo || "").trim(), dono: dados.dono || "Gabi",
      prazo: dados.prazo || "", feita: false, criadaEm: iso(today()), por: dados.por || "" });
    l.sort(function (a, b) { return (a.prazo || "9999") < (b.prazo || "9999") ? -1 : 1; });
    tarefasSave(l); return l;
  }
  function setTarefaFeita(id, feita) {
    var l = tarefasLista();
    l.forEach(function (tf) { if (tf.id === id) { tf.feita = !!feita; tf.feitaEm = feita ? iso(today()) : ""; } });
    tarefasSave(l); return l;
  }
  function removeTarefa(id) { var l = tarefasLista().filter(function (tf) { return tf.id !== id; }); tarefasSave(l); return l; }

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
  function agendarReuniao(id, dataIso, hora) {
    return mutate(id, function (p) {
      p.reuniao = { data: dataIso, hora: hora || "", feita: false };
      pushHist(p, "reuniao", "Reunião agendada para " + ddmm(dataIso) + (hora ? " às " + hora : ""));
    });
  }
  function marcarReuniaoFeita(id) {
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
    var key = mesAtualKey();

    pessoas.forEach(function (p) {
      // R1 — follow-up de lead vence hoje/venceu
      if (p.status === "lead" && p.estagio !== "perdido" && p.estagio !== "incompleta" && p.proximoFollowup) {
        var d = parseISO(p.proximoFollowup);
        if (d && daysBetween(d, today()) >= 0) {
          itens.push({ regra: "R1", dono: "Carla", urg: 1, icon: "", cor: "#348a8e", pessoaId: p.id, nome: p.nome,
            motivo: "Follow-up " + (daysBetween(d, today()) === 0 ? "vence hoje" : "venceu há " + daysBetween(d, today()) + "d"),
            acao: "Mensagem do estágio", tpl: "lead_followup" });
        }
      }
      // R2 — inscrição incompleta > 24h
      if (p.status === "lead" && p.estagio === "incompleta") {
        var e = parseISO(p.entrouEm);
        if (e && daysBetween(e, today()) >= 1) {
          itens.push({ regra: "R2", dono: "Carla", urg: 2, icon: "", cor: "#9c6f56", pessoaId: p.id, nome: p.nome,
            motivo: "Inscrição incompleta há " + daysBetween(e, today()) + "d" + (p.badge ? " · " + p.badge.toLowerCase() : ""),
            acao: "Mensagem de inscrição", tpl: "lead_incompleta" });
        }
      }
      // R3/R4 — parcelas (alunas)
      var c = contratoVigente(p);
      if ((p.status === "aluna" || p.status === "mvs") && c && c.vencDia !== "auto") {
        var mes = (c.meses || []).filter(function (m) { return m.key === key; })[0];
        if (mes && !mes.pago) {
          var hoje = new Date().getDate(), venc = parseInt(c.vencDia, 10);
          if (!isNaN(venc)) {
            if (hoje > venc) {
              itens.push({ regra: "R3", dono: "Érika", urg: 0, icon: "", cor: "#e07856", pessoaId: p.id, nome: p.nome,
                motivo: "Parcela de " + mes.label + " atrasada (" + mes.valor + " · venceu dia " + venc + ")",
                acao: "Cobrar atraso", tpl: "pag_atraso" });
            } else if (venc - hoje <= 3) {
              itens.push({ regra: "R4", dono: "Érika", urg: 3, icon: "", cor: "#d4a574", pessoaId: p.id, nome: p.nome,
                motivo: "Parcela vence em " + (venc - hoje) + "d (" + mes.valor + ")",
                acao: "Enviar lembrete", tpl: "pag_lembrete" });
            }
          }
        }
      }
      // R5 — contrato termina em ≤45 dias (e renovação ainda aberta)
      if (p.status === "aluna" && c && c.fim && p.renovacao !== "renovada" && p.renovacao !== "nao_renovou") {
        var dias = daysBetween(today(), parseISO(c.fim));
        if (dias >= 0 && dias <= 45) {
          itens.push({ regra: "R5", dono: "Carla", urg: 4, icon: "", cor: "#6b5b95", pessoaId: p.id, nome: p.nome,
            motivo: "Contrato termina em " + dias + "d — abrir renovação",
            acao: "Conversa de renovação", tpl: "renov_abrir" });
        }
      }
      // R10 — checkpoint de onboarding pendente e vencido
      if ((p.status === "aluna" || p.status === "mvs") && p.onboarding) {
        var cpV = p.onboarding.filter(function (c) { return !c.feito && parseISO(c.data) && daysBetween(parseISO(c.data), today()) >= 0; })[0];
        if (cpV) {
          itens.push({ regra: "R10", dono: "Érika", urg: 2, icon: "", cor: "#9ec970", pessoaId: p.id, nome: p.nome,
            motivo: "Onboarding pendente: " + cpV.label,
            acao: "Mensagem do checkpoint", tpl: cpV.id === "d2" ? "onb_confirma1a" : "onb_sessao" });
        }
      }
      // RC — check-in agendado para hoje/vencido
      if (p.status === "aluna" && p.proximoCheckin) {
        var dc = parseISO(p.proximoCheckin);
        if (dc && daysBetween(dc, today()) >= 0) {
          itens.push({ regra: "RC", dono: "Gabi", urg: 2, icon: "", cor: "#2a9d8f", pessoaId: p.id, nome: p.nome,
            motivo: "Check-in agendado " + (daysBetween(dc, today()) === 0 ? "para hoje" : "· venceu " + ddmm(p.proximoCheckin)),
            acao: "Fazer check-in", tpl: "checkin_mensal" });
        }
      }
      // R12 — ex-aluna "momento errado" completou 6 meses
      if (p.status === "ex-aluna" && p.motivoPerda === "Momento errado" && p.saidaEm) {
        var m6 = daysBetween(parseISO(p.saidaEm), today());
        if (m6 >= 180) {
          itens.push({ regra: "R12", dono: "Carla", urg: 5, icon: "", cor: "#b8ada0", pessoaId: p.id, nome: p.nome,
            motivo: "Saiu há " + Math.floor(m6 / 30) + " meses (momento errado) — hora de reativar",
            acao: "Reativar", tpl: "renov_abrir" });
        }
      }
    });

    // RT — pendências com prazo pra hoje ou vencido
    tarefasLista().forEach(function (tf) {
      if (tf.feita || !tf.prazo) return;
      var dp = parseISO(tf.prazo);
      if (!dp || daysBetween(dp, today()) < 0) return;
      itens.push({ regra: "RT", dono: tf.dono || "Gabi", urg: 1, icon: "", cor: "#9c6f56",
        pessoaId: "t:" + tf.id, tarefaId: tf.id, nome: tf.titulo,
        motivo: "Pendência " + (daysBetween(dp, today()) === 0 ? "para hoje" : "venceu " + ddmm(tf.prazo)),
        acao: "Concluir", tpl: "" });
    });

    // filtro por perfil
    var perfil = PERFIS.filter(function (pf) { return pf.id === perfilId; })[0];
    if (perfil && perfil.regras) itens = itens.filter(function (i) { return perfil.regras.indexOf(i.regra) >= 0; });
    var donoPorPerfil = { comercial: "Carla", operacao: "Érika" };
    var donoRT = donoPorPerfil[perfilId] || (perfilId === "professora" ? donoNome : null);
    if (donoRT) {
      itens = itens.filter(function (i) { return i.regra !== "RT" || i.dono === donoRT; });
    }

    // adiados hoje ficam fora (adiar = some da fila até amanhã)
    var adiadosRaw = localStorage.getItem("isr_fila_adiados") || "{}";
    var adiados = {}; try { adiados = JSON.parse(adiadosRaw); } catch (e) {}
    var hojeIso = iso(today());
    itens = itens.filter(function (i) { return adiados[i.regra + ":" + i.pessoaId] !== hojeIso; });

    itens.sort(function (a, b) { return a.urg - b.urg; });
    return itens;
  }
  function adiarItem(regra, pessoaId) {
    var adiados = {}; try { adiados = JSON.parse(localStorage.getItem("isr_fila_adiados") || "{}"); } catch (e) {}
    adiados[regra + ":" + pessoaId] = iso(today());
    localStorage.setItem("isr_fila_adiados", JSON.stringify(adiados));
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
    { nome: "Professoras (estimativa mensal)", moeda: "R$", valor: 3200, categoria: "equipe" },
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
  function custosTotais(key) {
    var k = key || mesAtualKey();
    var t = { "R$": 0, "€": 0 };
    custosDoMes(k).concat(equipeCustosMensais(k)).forEach(function (c) { t[c.moeda] += c.valor; });
    return t;
  }

  // Projeção 90 dias, mês a mês e por moeda:
  //   esperado = parcelas do mês (pagas + a receber) · custos = fixos
  //   resultado = esperado − custos · saldo = acumulado
  function caixaDetalheMes(key) {
    var entradas = [];
    loadPessoas().forEach(function (p) {
      (p.contratos || []).forEach(function (c) {
        (c.meses || []).forEach(function (m) {
          if (m.key === key && m.valor)
            entradas.push({ pessoaId: p.id, nome: p.nome, moeda: p.moeda || "R$",
              valor: m.valor, valorNum: parseMoney(m.valor), pago: !!m.pago });
        });
      });
    });
    entradas.sort(function (a, b) { return (a.pago === b.pago) ? (b.valorNum - a.valorNum) : (a.pago ? -1 : 1); });
    var saidas = custosLista().concat(equipeCustosMensais()).map(function (c) {
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
  function parseExtrato(texto) {
    var out = [];
    (texto || "").split("\n").forEach(function (linha) {
      var l = linha.trim();
      if (!l) return;
      var data = (l.match(/(\d{2}\/\d{2}\/\d{4})/) || [])[1] || "";
      var moneyTokens = l.match(/-?\d{1,3}(?:\.\d{3})*,\d{2}|-?\d+\.\d{2}|-?\d+,\d{2}/g);
      if (!moneyTokens || !moneyTokens.length) return;
      var raw = moneyTokens[moneyTokens.length - 1];
      var v = parseMoney(raw);
      if (raw.indexOf("-") === 0) v = -Math.abs(v);
      var desc = l.replace(data, "").replace(raw, "").replace(/^[;|,\s]+|[;|,\s]+$/g, "").trim();
      out.push({ data: data, descricao: desc || "(sem descrição)", valor: v });
    });
    return out;
  }

  // Conciliação: para cada CRÉDITO do extrato, procura parcela em aberto
  // com o mesmo valor (±0,60) na mesma moeda; nome na descrição desempata.
  function sugerirConciliacao(transacoes, moeda) {
    var abertas = [];
    getCobranca().forEach(function (c) {
      if (c.moeda !== moeda) return;
      (c.meses || []).forEach(function (m) {
        if (!m.pago) abertas.push({ pessoaId: c.id, nome: c.nome, mesKey: m.key, mesLabel: m.label, valor: parseMoney(m.valor || c.parcelaValor) });
      });
    });
    var usadas = {};
    var sugestoes = [], semMatch = [];
    transacoes.forEach(function (t) {
      if (t.valor <= 0) { semMatch.push({ trans: t, tipo: "saida" }); return; }
      var cands = abertas.filter(function (a) {
        return !usadas[a.pessoaId + a.mesKey] && Math.abs(a.valor - t.valor) <= 0.6;
      });
      if (!cands.length) { semMatch.push({ trans: t, tipo: "sem_match" }); return; }
      var desc = (t.descricao || "").toLowerCase();
      cands.sort(function (a, b) {
        var an = desc.indexOf(firstName(a.nome).toLowerCase()) >= 0 ? 0 : 1;
        var bn = desc.indexOf(firstName(b.nome).toLowerCase()) >= 0 ? 0 : 1;
        if (an !== bn) return an - bn;
        return a.mesKey < b.mesKey ? -1 : 1;
      });
      var alvo = cands[0];
      usadas[alvo.pessoaId + alvo.mesKey] = true;
      sugestoes.push({ trans: t, pessoaId: alvo.pessoaId, nome: alvo.nome, mesKey: alvo.mesKey, mesLabel: alvo.mesLabel, valor: alvo.valor });
    });
    return { sugestoes: sugestoes, semMatch: semMatch };
  }
  function conciliar(pessoaId, mesKey, descricao) {
    setParcelaPaga(pessoaId, mesKey, true);
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
  function recipients() {
    return loadPessoas().map(function (p) {
      var c = contratoVigente(p);
      var venc = c && c.vencDia !== undefined && c.vencDia !== "auto" ? "dia " + c.vencDia : (c && c.vencDia === "auto" ? "auto" : "");
      return { id: p.id, nome: p.nome, telefone: p.whatsapp, tipo: p.status === "lead" ? "lead" : (STATUS_META[p.status] ? STATUS_META[p.status].label.toLowerCase() : p.status),
        turma: p.turma || "", nivel: p.nivel || "", horarios: p.horarios || "",
        valor: c ? c.parcelaValor : "", vencimento: venc, link: p.linkPagamento || "" };
    });
  }

  // ── REATIVAÇÃO (compat CRM) ───────────────────────────────────
  function reativacao() {
    return loadPessoas().filter(function (p) { return p.status === "ex-aluna"; }).map(function (p) {
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
  function enviarSync() {
    var url = backendUrl();
    if (!url) return;
    var payload = {
      pessoas: loadPessoas(), custos: custosLista(), templates: tplStore(),
      turmas: turmasLista(), eventos: eventosLista(), chamadas: chamadasAll(),
      tarefas: tarefasLista(), feriados: feriadosLista(), metas: metasAtuais(), moedas: moedasAjustesAll(),
      equipe: equipeLista(), calc: calcParams(),
      lancamentos: lancamentosLista(), cambio: taxaCambio(),
      atualizadoEm: new Date().toISOString(), por: (gestaoUser() || {}).email || ""
    };
    try {
      fetch(url, { method: "POST", headers: { "Content-Type": "text/plain;charset=utf-8" },
        body: JSON.stringify({ action: "sistemaSave", data: payload }) }).catch(function () {});
    } catch (e) {}
  }
  function carregarDoBackend(cb) {
    var url = backendUrl();
    if (!url) { if (cb) cb(false); return; }
    try {
      fetch(url + (url.indexOf("?") >= 0 ? "&" : "?") + "action=sistemaLoad")
        .then(function (r) { return r.json(); })
        .then(function (d) {
          if (d && d.ok && d.data) {
            if (d.data.pessoas && d.data.pessoas.length) savePessoasLocal(d.data.pessoas);
            if (d.data.custos && d.data.custos.length) custosSaveLocal(d.data.custos);
            if (d.data.templates) tplSaveLocal(d.data.templates);
            if (d.data.turmas && d.data.turmas.length) { try { localStorage.setItem(TURMAS_KEY, JSON.stringify(d.data.turmas)); } catch (e) {} }
            if (d.data.eventos) { try { localStorage.setItem(EVENTOS_KEY, JSON.stringify(d.data.eventos)); } catch (e) {} }
            if (d.data.chamadas) { try { localStorage.setItem(CHAMADAS_KEY, JSON.stringify(d.data.chamadas)); } catch (e) {} }
            if (d.data.tarefas) { try { localStorage.setItem(TAREFAS_KEY, JSON.stringify(d.data.tarefas)); } catch (e) {} }
            if (d.data.feriados) { try { localStorage.setItem(FERIADOS_KEY, JSON.stringify(d.data.feriados)); } catch (e) {} }
            if (d.data.metas) { try { localStorage.setItem(METAS_KEY, JSON.stringify(d.data.metas)); } catch (e) {} }
            if (d.data.moedas) { try { localStorage.setItem(MOEDAS_KEY, JSON.stringify(d.data.moedas)); } catch (e) {} }
            if (d.data.equipe) { try { localStorage.setItem(EQUIPE_KEY, JSON.stringify(d.data.equipe)); } catch (e) {} }
            if (d.data.calc) { try { localStorage.setItem(CALC_KEY, JSON.stringify(d.data.calc)); } catch (e) {} }
            if (d.data.lancamentos) { try { localStorage.setItem(LANC_KEY, JSON.stringify(d.data.lancamentos)); } catch (e) {} }
            if (d.data.cambio) { try { localStorage.setItem(CAMBIO_KEY, String(d.data.cambio)); } catch (e) {} }
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

  // ao abrir qualquer tela: puxa a base compartilhada + cadastros novos (silencioso)
  try { setTimeout(function () { carregarDoBackend(function () { processarCadastrosPendentes(); }); }, 50); } catch (e) {}

  // ── ACESSO À GESTÃO (v1 — fechadura por e-mail) ───────────────
  // O acesso definitivo virá do magic link com papel validado no
  // Apps Script; por enquanto: allowlist de e-mails + sessão local.
  var GESTAO_EMAILS = {
    "gabisouza.prof@gmail.com": { perfil: "gestora", nome: "Gabi" },
    "erikainglessemroteiro@gmail.com": { perfil: "operacao", nome: "Érika" },
    "comercial.inglessemroteiro@gmail.com": { perfil: "comercial", nome: "Carla" },
    "carlaoliveiraprof35@gmail.com": { perfil: "comercial", nome: "Carla" }
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
  function equipeLista() { try { return JSON.parse(localStorage.getItem(EQUIPE_KEY)) || []; } catch (e) { return []; } }
  function equipeSave(l) { try { localStorage.setItem(EQUIPE_KEY, JSON.stringify(l)); } catch (e) {} agendarSync(); }
  function addEquipe(dados) {
    var l = equipeLista();
    l.push({ id: "eq" + Date.now(), nome: (dados.nome || "").trim(), email: (dados.email || "").trim().toLowerCase(),
      papeis: dados.papeis || [], valorTipo: dados.valorTipo || "", valor: parseFloat(dados.valor) || 0,
      moeda: dados.moeda || "R$" });
    equipeSave(l); return l;
  }
  function updateEquipe(id, patch) {
    var l = equipeLista();
    l.forEach(function (m) { if (m.id === id) Object.assign(m, patch); });
    equipeSave(l); return l;
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
      var protegidas = ["ISR - Central", "ISR - CRM", "ISR - Mensagens", "ISR - Cobran", "ISR - Caixa", "ISR - Perfil", "ISR - Turmas", "ISR - Turma.", "ISR - Alunas", "ISR - Marketing", "ISR - Agenda", "ISR - Painel do Professor", "ISR - Equipe", "ISR - Calculadora"];
      var ehGestao = protegidas.some(function (p) { return path.indexOf(p) >= 0; });
      if (ehGestao && !gestaoUser()) window.location.replace("gestao.html");
    } catch (e) {}
  })();

  // ── AULAS EXTRAS / EVENTOS ────────────────────────────────────
  var EVENTOS_KEY = "isr_eventos_v1";
  function eventosLista() {
    try { return JSON.parse(localStorage.getItem(EVENTOS_KEY)) || []; } catch (e) { return []; }
  }
  function eventosSave(l) { try { localStorage.setItem(EVENTOS_KEY, JSON.stringify(l)); } catch (e) {} agendarSync(); }
  function addEvento(dados) {
    var l = eventosLista();
    l.push({ id: "ev" + Date.now(), titulo: dados.titulo, data: dados.data, hora: dados.hora || "",
      responsavel: dados.responsavel || "", tipo: "aula_extra" });
    l.sort(function (a, b) { return (a.data + a.hora) < (b.data + b.hora) ? -1 : 1; });
    eventosSave(l); return l;
  }
  function removeEvento(id) { var l = eventosLista().filter(function (e) { return e.id !== id; }); eventosSave(l); return l; }

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
  function salvarChamada(turmaLabel, dataIso, presencas, por) {
    var m = chamadasAll();
    var key = turmaLabel + "|" + dataIso;
    var antes = (m[key] && m[key].presencas) || {};
    m[key] = { turma: turmaLabel, data: dataIso, presencas: presencas,
      salvoEm: new Date().toISOString(), por: por || "" };
    chamadasSaveLocal(m);
    agendarSync();
    // falta/justificada nova vai pra linha do tempo (re-salvar não duplica)
    Object.keys(presencas).forEach(function (pid) {
      var agora = estadoPresenca(presencas[pid]), antesE = estadoPresenca(antes[pid]);
      if (agora === antesE) return;
      if (agora === "falta") {
        mutate(pid, function (p) { pushHist(p, "falta", "Faltou na aula de " + ddmm(dataIso) + " · " + turmaLabel); });
      } else if (agora === "justificada") {
        mutate(pid, function (p) { pushHist(p, "falta", "Ausência justificada na aula de " + ddmm(dataIso) + " · " + turmaLabel); });
      }
    });
    return m[key];
  }
  function faltasDe(pessoaId) {
    var m = chamadasAll(), n = 0;
    Object.keys(m).forEach(function (k) {
      if (m[k].presencas && estadoPresenca(m[k].presencas[pessoaId]) === "falta") n++;
    });
    return n;
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
  function alunasDaTurma(turmaLabel) {
    return loadPessoas().filter(function (p) { return p.status === "aluna" && p.turma === turmaLabel; });
  }
  function chamadasDaTurma(turmaLabel) {
    var m = chamadasAll(), out = [];
    Object.keys(m).forEach(function (k) { if (m[k].turma === turmaLabel) out.push(m[k]); });
    out.sort(function (a, b) { return a.data < b.data ? 1 : -1; });
    return out;
  }

  // ── MOEDAS DA ALUNA (calculadas dos dados + ajustes manuais) ──
  var MOEDAS_KEY = "isr_moedas_v1"; // só os ajustes manuais; o resto é derivado
  var MOEDAS_REGRAS = { presenca: 10, atraso: 5, parcelaPaga: 15, onboardingCompleto: 30 };
  // grupos de bônus do design original (Moedas ISR) — a equipe aplica pelo Perfil
  var MOEDAS_BONUS = [
    { grupo: "Aulas", cor: "#2a9d8f", itens: [
      { label: "Presença em aula", valor: 10, auto: true },
      { label: "Tarefa entregue no prazo", valor: 8 },
      { label: "Presença em aula extra", valor: 15 },
      { label: "Book club semanal", valor: 20 }] },
    { grupo: "Comunidade", cor: "#e07856", itens: [
      { label: "Completou o desafio da semana", valor: 10 },
      { label: "Melhor resposta do desafio", valor: 10 },
      { label: "Respondeu um colega", valor: 5 },
      { label: "Compartilhou post da ISR", valor: 5 }] },
    { grupo: "Indicações", cor: "#9c6f56", itens: [
      { label: "Indicou um amigo", valor: 20 },
      { label: "Trouxe convidado pra apresentação", valor: 60 },
      { label: "Indicação virou matrícula", valor: 200 }] }
  ];
  // lojinha de resgates do design original
  var MOEDAS_RESGATES = [
    { id: "rg1", nome: "Escolhe o tema da próxima aula", cat: "aula", custo: 80 },
    { id: "rg2", nome: "Caderno de atividades personalizado", cat: "material", custo: 120 },
    { id: "rg3", nome: "30 min de bate-papo com a Gabi", cat: "mentoria", custo: 200 },
    { id: "rg4", nome: "Traz um convidado pra aula regular", cat: "comunidade", custo: 250 },
    { id: "rg5", nome: "Nomeia um colega (+20 bônus)", cat: "comunidade", custo: 300 },
    { id: "rg6", nome: "Featured no Instagram da escola", cat: "reconhecimento", custo: 350 },
    { id: "rg7", nome: "Carta de recomendação em inglês", cat: "carreira", custo: 400 },
    { id: "rg8", nome: "€10 de desconto na mensalidade", cat: "desconto", custo: 600 },
    { id: "rg9", nome: "Sessão de preparação pra entrevista", cat: "carreira", custo: 900 },
    { id: "rg10", nome: "1 mês no grupo VIP de conversação", cat: "topo", custo: 1200, vip: true }
  ];
  function resgatarRecompensa(pessoaId, resgateId) {
    var r = MOEDAS_RESGATES.filter(function (x) { return x.id === resgateId; })[0];
    var p = getPessoa(pessoaId);
    if (!r || !p) return { ok: false };
    var saldo = moedasDe(pessoaId).total;
    if (saldo < r.custo) return { ok: false, faltam: r.custo - saldo };
    addMoedas(pessoaId, -r.custo, "Resgate: " + r.nome);
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
    }
    (moedasAjustesAll()[pessoaId] || []).forEach(function (a) {
      extrato.push({ em: a.em, label: a.motivo || (a.valor > 0 ? "Bônus da escola" : "Resgate"), valor: a.valor });
    });
    extrato.sort(function (a, b) { return (b.em || "0000") < (a.em || "0000") ? -1 : 1; });
    var total = extrato.reduce(function (acc, e) { return acc + e.valor; }, 0);
    return { total: total, extrato: extrato };
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
    { id: "sinal",      label: "Sinais de matrícula",  cor: "#9ec970" },
    { id: "extra",      label: "Aulas extras",         cor: "#d4a574" },
    { id: "outra",      label: "Outras receitas",      cor: "#b8ada0" }
  ];
  var CAT_SAIDA = [
    { id: "equipe",      label: "Equipe",           cor: "#348a8e" },
    { id: "ferramentas", label: "Ferramentas",      cor: "#6b5b95" },
    { id: "marketing",   label: "Marketing",        cor: "#e07856" },
    { id: "impostos",    label: "Impostos e taxas", cor: "#9c6f56" },
    { id: "outros",      label: "Outros",           cor: "#b8ada0" }
  ];
  function catMeta(lista, id) {
    for (var i = 0; i < lista.length; i++) if (lista[i].id === id) return lista[i];
    return lista[lista.length - 1];
  }

  // ── LANÇAMENTOS AVULSOS ───────────────────────────────────────
  // O que o mês teve de específico: o notebook novo, a contadora,
  // um workshop avulso. É o que faltava pra "para onde foi" deixar
  // de ser sempre a mesma lista de custos fixos.
  var LANC_KEY = "isr_lancamentos_v1";
  function lancamentosLista() {
    try { var l = JSON.parse(localStorage.getItem(LANC_KEY)); if (l && l.length) return l; } catch (e) {}
    return [];
  }
  function lancamentosSave(l) { try { localStorage.setItem(LANC_KEY, JSON.stringify(l)); } catch (e) {} agendarSync(); }
  function addLancamento(dados) {
    var l = lancamentosLista();
    l.push({ id: "lc" + Date.now() + Math.floor(Math.random() * 1000),
      data: dados.data || iso(today()),
      tipo: dados.tipo === "entrada" ? "entrada" : "saida",
      categoria: dados.categoria || (dados.tipo === "entrada" ? "outra" : "outros"),
      descricao: dados.descricao || "Lançamento",
      moeda: dados.moeda || "R$",
      valor: typeof dados.valor === "number" ? dados.valor : parseMoney(dados.valor) });
    lancamentosSave(l);
    return l;
  }
  function removeLancamento(id) {
    lancamentosSave(lancamentosLista().filter(function (x) { return x.id !== id; }));
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
      (p.contratos || []).forEach(function (c) {
        var moeda = c.moeda || p.moeda || "R$";
        (c.meses || []).forEach(function (m) {
          if (m.key !== key || !m.valor) return;
          var dia = parseInt(c.vencDia, 10); if (isNaN(dia)) dia = 10;
          var venc = key + "-" + (dia < 10 ? "0" : "") + dia;
          entradas.push({ pessoaId: p.id, nome: p.nome,
            categoria: catPessoa,
            detalhe: p.turma || (c.tipo || ""),
            moeda: moeda, valor: parseMoney(m.valor), valorLabel: m.valor,
            pago: !!m.pago, venc: venc, atrasada: !m.pago && venc < hoje });
        });
        if (c.sinal && c.sinal.valor && (p.desde || "").slice(0, 7) === key) {
          entradas.push({ pessoaId: p.id, nome: p.nome, categoria: "sinal",
            detalhe: "Sinal de matrícula", moeda: moeda,
            valor: parseMoney(c.sinal.valor), valorLabel: c.sinal.valor,
            pago: !!c.sinal.recebido, venc: p.desde,
            atrasada: !c.sinal.recebido && p.desde < hoje });
        }
      });
    });

    var lancs = lancamentosDoMes(key);
    lancs.filter(function (l) { return l.tipo === "entrada"; }).forEach(function (l) {
      entradas.push({ pessoaId: "", nome: l.descricao, categoria: l.categoria || "outra",
        detalhe: "Lançamento", moeda: l.moeda, valor: l.valor,
        valorLabel: fmtMoney(l.moeda, l.valor), pago: true, venc: l.data,
        atrasada: false, lancId: l.id });
    });

    var saidas = custosDoMes(key).map(function (c) {
      return { nome: c.nome, categoria: c.categoria || "outros", moeda: c.moeda, valor: c.valor, fixo: true };
    }).concat(equipeCustosMensais(key).map(function (c) {
      return { nome: c.nome, categoria: "equipe", moeda: c.moeda, valor: c.valor, fixo: true };
    })).concat(lancs.filter(function (l) { return l.tipo === "saida"; }).map(function (l) {
      return { nome: l.descricao, categoria: l.categoria || "outros", moeda: l.moeda,
        valor: l.valor, fixo: false, data: l.data, lancId: l.id };
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
      porCatEntrada: porCatEntrada, porCatSaida: porCatSaida,
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
      top(f.porCatSaida, CAT_SAIDA),
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
      obs: "Defasado: €40/aula é preço de particular BR. Proposta pra contratos novos: €200–220/mês" },
    { id: "dupla_eur", nome: "Aula em dupla EUR (por pessoa)", moeda: "€", ciclo: 330,
      descAvista: 5, descParcelado: 0, desc2Ciclos: 5, descRenovacao: 5, maxParcelas: 3,
      obs: "Mesmo nível CEFR + mesma agenda. Se uma sai, a outra migra pra particular ou repõe a dupla" },
    { id: "dupla_brl", nome: "Aula em dupla BRL (por pessoa)", moeda: "R$", ciclo: 1950,
      descAvista: 5, descParcelado: 0, desc2Ciclos: 5, descRenovacao: 5, maxParcelas: 8,
      obs: "Mesmas regras da dupla EUR" },
    { id: "addon_eur", nome: "Add-on particular quinzenal (EUR)", moeda: "€", ciclo: 240,
      descAvista: 5, descParcelado: 0, desc2Ciclos: 5, descRenovacao: 5, maxParcelas: 4,
      obs: "2 aulas 1:1 por mês pra quem já está no grupo. Sobe junto se o particular for reajustado" },
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
    { titulo: "Piloto Sem Roteiro de bônus", detalhe: "€27 / R$157 de valor percebido, custo perto de zero — é assíncrono" },
    { titulo: "Fechar 2 ciclos", detalhe: "Desconto adicional já previsto na tabela + preço congelado na renovação" },
    { titulo: "Desconto por indicação", detalhe: "Vale só quando a indicada se matricula — é o desconto que se paga sozinho" },
    { titulo: "1 sessão de interview coaching", detalhe: "Máximo 1 por contrato — custa hora da Gabi" },
    { titulo: "Só então: desconto em dinheiro", detalhe: "Nunca abaixo do piso" }
  ];

  var PRECOS_KEY = "isr_precos_v1";
  function precosLista() {
    try { var l = JSON.parse(localStorage.getItem(PRECOS_KEY)); if (l && l.length) return l; } catch (e) {}
    return PRECOS_PADRAO.map(function (p) { return Object.assign({}, p); });
  }
  function precosSave(list) { try { localStorage.setItem(PRECOS_KEY, JSON.stringify(list)); } catch (e) {} agendarSync(); }
  function updatePreco(id, patch) {
    var l = precosLista();
    l.forEach(function (p) { if (p.id === id) Object.assign(p, patch); });
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

    var maxParcelas = avista ? 1 : p.maxParcelas * ciclos;
    var parcelas = avista ? 1 : Math.max(1, parseInt(cfg.parcelas, 10) || 1);

    var total = cfg.totalProposto != null && cfg.totalProposto !== ""
      ? (typeof cfg.totalProposto === "number" ? cfg.totalProposto : parseMoney(cfg.totalProposto))
      : tabela;
    var descDado = tabela > 0 ? Math.round((1 - total / tabela) * 1000) / 10 : 0;

    var mensal = total / (CICLO_MESES * ciclos);
    var eurMes = p.moeda === "€" ? mensal : mensal / taxaCambio();
    var alvo = ticketAlvo();

    var alertas = [];
    if (parcelas > maxParcelas)
      alertas.push("Você pediu " + parcelas + " parcelas, mas o máximo pra este produto é " + maxParcelas + ".");
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
      valorParcela: parcelas > 0 ? total / parcelas : total,
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
    novaPessoa: novaPessoa,
    // cobrança
    getCobranca: getCobranca, cobrancaStatus: cobrancaStatus, cobrancaResumo: cobrancaResumo,
    setParcelaPaga: setParcelaPaga, entradasPrevistas: entradasPrevistas,
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
    agendaItens: agendaItens, gcalLink: gcalLink,
    getChamada: getChamada, salvarChamada: salvarChamada, faltasDe: faltasDe, alunasDaTurma: alunasDaTurma,
    chamadasDaTurma: chamadasDaTurma,
    moedasDe: moedasDe, addMoedas: addMoedas, MOEDAS_REGRAS: MOEDAS_REGRAS,
    MOEDAS_BONUS: MOEDAS_BONUS, MOEDAS_RESGATES: MOEDAS_RESGATES, resgatarRecompensa: resgatarRecompensa,
    equipeLista: equipeLista, addEquipe: addEquipe, updateEquipe: updateEquipe, removeEquipe: removeEquipe,
    equipeCustosMensais: equipeCustosMensais,
    calcParams: calcParams, setCalcParams: setCalcParams,
    rsvpEvento: rsvpEvento, solicitarCorrecao: solicitarCorrecao,
    estadoPresenca: estadoPresenca,
    tarefasLista: tarefasLista, addTarefa: addTarefa, setTarefaFeita: setTarefaFeita, removeTarefa: removeTarefa,
    feriadosLista: feriadosLista, addFeriado: addFeriado, removeFeriado: removeFeriado, ehFeriado: ehFeriado,
    agendarReuniao: agendarReuniao, marcarReuniaoFeita: marcarReuniaoFeita,
    registrarAulaParticular: registrarAulaParticular, updateParticular: updateParticular,
    renegociarContrato: renegociarContrato, setSinalRecebido: setSinalRecebido,
    caixaDetalheMes: caixaDetalheMes, processarCadastrosPendentes: processarCadastrosPendentes,
    // caixa
    get CUSTOS_FIXOS() { return custosLista(); }, custosTotais: custosTotais, projecaoCaixa: projecaoCaixa,
    addCusto: addCusto, removeCusto: removeCusto, updateCusto: updateCusto,
    custosDoMes: custosDoMes, vigenteNoMes: vigenteNoMes,
    // financeiro
    CAT_ENTRADA: CAT_ENTRADA, CAT_SAIDA: CAT_SAIDA, catMeta: catMeta,
    financeiroMes: financeiroMes, financeiroSerie: financeiroSerie, previsaoMes: previsaoMes,
    mesesFinanceiro: mesesFinanceiro, mesOffset: mesOffset,
    lancamentosLista: lancamentosLista, addLancamento: addLancamento,
    removeLancamento: removeLancamento, lancamentosDoMes: lancamentosDoMes,
    metaDoMes: metaDoMes, setMetaMes: setMetaMes, setMetaPadrao: setMetaPadrao,
    taxaCambio: taxaCambio, setTaxaCambio: setTaxaCambio, emReais: emReais,
    ticketMedio: ticketMedio, taxaConversao: taxaConversao,
    resumoFinanceiroTexto: resumoFinanceiroTexto, reunioesResumo: reunioesResumo,
    alunasPainel: alunasPainel, RISCOS: RISCOS,
    // preços e negociação
    CICLO_MESES: CICLO_MESES, ESCADA_CONCESSOES: ESCADA_CONCESSOES,
    precosLista: precosLista, getPreco: getPreco, updatePreco: updatePreco,
    ticketAlvo: ticketAlvo, setTicketAlvo: setTicketAlvo,
    calcularProposta: calcularProposta, calcularPacote: calcularPacote,
    backendUrl: backendUrl, setBackendUrl: setBackendUrl, carregarDoBackend: carregarDoBackend, enviarSync: enviarSync,
    parseExtrato: parseExtrato, sugerirConciliacao: sugerirConciliacao, conciliar: conciliar,
    // perfil
    ltv: ltv, contratoVigente: contratoVigente, tempoDesde: tempoDesde, mesAno: mesAno,
    // util
    firstName: firstName, fillTemplate: fillTemplate, waLink: waLink, waNumber: waNumber,
    relativeDays: relativeDays, isStale: isStale, ddmm: ddmm,
    followupPresets: function () { return [
      { label: "Amanhã", iso: addDays(1) }, { label: "Em 3 dias", iso: addDays(3) }, { label: "Próx. semana", iso: addDays(7) }]; },
    resetDemo: resetDemo
  };
})();
