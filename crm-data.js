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
  var TEMPLATES = [
    // LEADS
    { id: "lead_primeiro", categoria: "Leads", titulo: "Primeiro contato",
      corpo: "Oi, {{primeiroNome}}! Tudo bem? 😊\nAqui é a Gabi, do Inglês sem Roteiro. Vi que você demonstrou interesse nas nossas aulas.\nMe conta: o que te motivou a querer voltar a estudar inglês agora?" },
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

  // ── METAS DO CICLO (Config digita 1x — spec 13; demo fixo) ────
  var METAS = { matriculas: 8, renovacoes: 6, cicloInicio: "2026-07-01", cicloLabel: "3.2026" };

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
  function savePessoas(list) {
    try { localStorage.setItem(PESSOAS_KEY, JSON.stringify(list)); } catch (e) {}
  }
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
    var unit = UNITS.filter(function (u) { return u.id === cfg.turmaId; })[0];
    var turmaLabel = unit ? (unit.nivel + " · " + unit.turma) : (cfg.turmaLabel || "");
    var n = parseInt(cfg.parcelas, 10) || 3;
    return mutate(id, function (p) {
      p.status = "aluna";
      p.estagio = "matriculado";
      p.turma = turmaLabel;
      p.professora = unit ? unit.teacher : "";
      p.formatos = (p.formatos || []).concat(["grupo"]);
      p.desde = iso(today());
      var fimIdx = Math.min(n - 1, MESES_COBRANCA.length - 1);
      p.contratos = p.contratos || [];
      // valor total: informado, ou calculado (parcela × nº de parcelas) pro LTV
      var moedaC = cfg.moeda || p.moeda || "R$";
      var totalCalc = cfg.valorTotal || (cfg.valorParcela ? fmtMoney(moedaC, parseMoney(cfg.valorParcela) * n) : "");
      p.contratos.unshift({
        tipo: cfg.tipo || "Matrícula", ciclos: cfg.ciclos || "1 Ciclo " + METAS.cicloLabel,
        moeda: moedaC, valorTotal: totalCalc,
        parcelaValor: cfg.valorParcela || "", parcelas: n, vencDia: cfg.vencDia || 10,
        fim: MESES_COBRANCA[fimIdx].key + "-28",
        meses: mkMeses(0, cfg.valorParcela || "", n)
      });
      pushHist(p, "matricula", "Matriculada · " + turmaLabel + " · contrato " + (cfg.tipo || "Matrícula") + " criado (" + n + " parcelas)");
      pushHist(p, "onboarding", "Onboarding criado: D0 boas-vindas · D+2 confirma 1ª aula · D+7 check-in · D+30 pagamento + NPS");
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
  function ocupacaoTurmas() {
    var pessoas = loadPessoas();
    return UNITS.map(function (u) {
      var label = u.nivel + " · " + u.turma;
      var ocup = pessoas.filter(function (p) {
        return (p.status === "aluna") && p.turma === label;
      }).length;
      return { id: u.id, nivel: u.nivel, turma: u.turma, teacher: u.teacher, cycle: u.cycle,
        projeto: u.projeto, notebook: u.notebook, label: label,
        capacidade: CAPACIDADE_PADRAO, ocupadas: ocup, vagas: CAPACIDADE_PADRAO - ocup };
    });
  }

  // ══════════════════════════════════════════════════════════════
  //  MOTOR DE FILAS — spec 3.1 (R1–R5, R12; R6–R11 aguardam fontes)
  //  perfil: 'gestora' | 'comercial' | 'operacao'
  // ══════════════════════════════════════════════════════════════
  var PERFIS = [
    { id: "gestora", label: "👑 Gestora", regras: null }, // null = todas
    { id: "comercial", label: "🎯 Comercial", regras: ["R1", "R2", "R5", "R12"] },
    { id: "operacao", label: "🗂 Operação", regras: ["R3", "R4"] }
  ];
  function filaParaHoje(perfilId) {
    var itens = [];
    var pessoas = loadPessoas();
    var key = mesAtualKey();

    pessoas.forEach(function (p) {
      // R1 — follow-up de lead vence hoje/venceu
      if (p.status === "lead" && p.estagio !== "perdido" && p.estagio !== "incompleta" && p.proximoFollowup) {
        var d = parseISO(p.proximoFollowup);
        if (d && daysBetween(d, today()) >= 0) {
          itens.push({ regra: "R1", urg: 1, icon: "✈️", pessoaId: p.id, nome: p.nome,
            motivo: "Follow-up " + (daysBetween(d, today()) === 0 ? "vence hoje" : "venceu há " + daysBetween(d, today()) + "d"),
            acao: "Mensagem do estágio", tpl: "lead_followup" });
        }
      }
      // R2 — inscrição incompleta > 24h
      if (p.status === "lead" && p.estagio === "incompleta") {
        var e = parseISO(p.entrouEm);
        if (e && daysBetween(e, today()) >= 1) {
          itens.push({ regra: "R2", urg: 2, icon: "📝", pessoaId: p.id, nome: p.nome,
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
              itens.push({ regra: "R3", urg: 0, icon: "⚠️", pessoaId: p.id, nome: p.nome,
                motivo: "Parcela de " + mes.label + " atrasada (" + mes.valor + " · venceu dia " + venc + ")",
                acao: "Cobrar atraso", tpl: "pag_atraso" });
            } else if (venc - hoje <= 3) {
              itens.push({ regra: "R4", urg: 3, icon: "🔔", pessoaId: p.id, nome: p.nome,
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
          itens.push({ regra: "R5", urg: 4, icon: "🔄", pessoaId: p.id, nome: p.nome,
            motivo: "Contrato termina em " + dias + "d — abrir renovação",
            acao: "Conversa de renovação", tpl: "renov_abrir" });
        }
      }
      // R12 — ex-aluna "momento errado" completou 6 meses
      if (p.status === "ex-aluna" && p.motivoPerda === "Momento errado" && p.saidaEm) {
        var m6 = daysBetween(parseISO(p.saidaEm), today());
        if (m6 >= 180) {
          itens.push({ regra: "R12", urg: 5, icon: "💬", pessoaId: p.id, nome: p.nome,
            motivo: "Saiu há " + Math.floor(m6 / 30) + " meses (momento errado) — hora de reativar",
            acao: "Reativar", tpl: "renov_abrir" });
        }
      }
    });

    // filtro por perfil
    var perfil = PERFIS.filter(function (pf) { return pf.id === perfilId; })[0];
    if (perfil && perfil.regras) itens = itens.filter(function (i) { return perfil.regras.indexOf(i.regra) >= 0; });

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
    var ini = parseISO(METAS.cicloInicio);
    var matriculas = pessoas.filter(function (p) {
      return (p.status === "aluna" || p.status === "mvs") && p.desde && parseISO(p.desde) >= ini;
    }).length;
    var renovadas = pessoas.filter(function (p) { return p.renovacao === "renovada"; }).length;
    return { matriculas: matriculas, metaMatriculas: METAS.matriculas,
      renovacoes: renovadas, metaRenovacoes: METAS.renovacoes, ciclo: METAS.cicloLabel };
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

  function resetDemo() {
    localStorage.removeItem(SEED_FLAG);
    localStorage.removeItem(PESSOAS_KEY);
    localStorage.removeItem("isr_fila_adiados");
    ensureSeed();
  }

  // ── API PÚBLICA ───────────────────────────────────────────────
  window.ISRCRM = {
    // constantes
    STAGES: STAGES, TABS: TABS, CANAIS: CANAIS, TEMPLATES: TEMPLATES,
    MOTIVOS_PERDA: MOTIVOS_PERDA, STATUS_META: STATUS_META, PERFIS: PERFIS,
    MESES_COBRANCA: MESES_COBRANCA, COBRANCA_STATUS_META: COBRANCA_STATUS_META,
    RENOV_ESTAGIOS: RENOV_ESTAGIOS, UNITS: UNITS, METAS: METAS,
    // pessoas
    getPessoas: loadPessoas, getPessoa: getPessoa,
    // compat CRM
    getLeads: getLeads, getLead: getLead, leadsForTab: leadsForTab, tabCounts: tabCounts,
    stageById: function (id) { return STAGES.filter(function (s) { return s.id === id; })[0] || null; },
    get REATIVACAO() { return reativacao(); },
    recipients: recipients,
    templatesByCategoria: function (cat) { return TEMPLATES.filter(function (t) { return !cat || t.categoria === cat; }); },
    categorias: function () { var seen = {}, out = []; TEMPLATES.forEach(function (t) { if (!seen[t.categoria]) { seen[t.categoria] = 1; out.push(t.categoria); } }); return out; },
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
