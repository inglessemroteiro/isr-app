// Os dados dos três protótipos da tela da professora.
//
// São INVENTADOS, e os mesmos nos três — é o que torna a comparação
// honesta: o que muda de um modelo para o outro é a arrumação, não o
// conteúdo. Nenhum nome aqui é de aluna de verdade.
//
// O conteúdo cobre os 13 blocos da lista fechada em
// O-QUE-A-PROFESSORA-PRECISA.md, seção 9, inclusive o que já existe no
// sistema hoje: o caderno ao vivo, as correções e o abrir/encerrar da
// aula.
//
// Este arquivo não entra no sistema. Só os três rascunhos o carregam.
window.ISR_MODELO = (function () {
  "use strict";

  var ALUNAS = {
    basics: ["Marina Teste", "Camila Teste", "Beatriz Teste", "Rafael Teste", "Juliana Teste"],
    essentials: ["Amanda Teste", "Pedro Teste", "Carol Teste", "Victoria Teste",
      "Aline Teste", "Fernanda Teste", "Marcela Teste"],
    speaking: ["Ana Teste", "Bianca Teste", "Daniel Teste", "Helena Teste",
      "Igor Teste", "Lara Teste"]
  };

  // ── O ROTEIRO DA SESSÃO ──────────────────────────────────────
  // Seis fases, minutos por etapa, e a pergunta que faz a etapa virar
  // tarefa no caderno da aluna. É o desenho do plano da turma.
  var ROTEIRO_HOJE = [
    { fase: "abrir", min: 5, titulo: "Warm-up: o que você comeu no último Natal?", pergunta: "" },
    { fase: "ouvir", min: 10, titulo: "Áudio: a receita da avó da Marcela", pergunta: "" },
    { fase: "praticar", min: 15, titulo: "Pares: descrever os passos em ordem",
      pergunta: "Write the three first steps of your family recipe, in order." },
    { fase: "produzir", min: 15, titulo: "Cada uma conta a receita da família",
      pergunta: "Tell us your family recipe. Use at least three words from today." },
    { fase: "corrigir", min: 10, titulo: "Erros que apareceram, no quadro", pergunta: "" },
    { fase: "fechar", min: 5, titulo: "O que levo desta aula",
      pergunta: "One sentence: what will you cook, and when?" }
  ];

  var TURMAS = [
    {
      id: "basics", nivel: "Basics (A1)", quando: "seg 7h", dia: "segunda",
      projeto: "Our End of Year Dishes", sessao: 4, sessoes: 10,
      modalidade: "online", alunas: ALUNAS.basics,
      programa: "Basics · ciclo 2026.2",
      material: "drive.google.com/…/caderno-basics",
      links: [
        { label: "Caderno da turma", link: "drive.google.com/…/caderno-basics" },
        { label: "Pasta do ciclo", link: "drive.google.com/…/basics-2026-2" },
        { label: "Guia do professor", link: "drive.google.com/…/guia-basics" },
        { label: "Sala online", link: "" }
      ],
      renovacao: { sim: 3, nao: 1, semResposta: 1 },
      aulas: [
        { data: "2026-11-23", curto: "23 nov", s: 5, titulo: "Talking about plans",
          estado: "agendada", hora: "7h", roteiro: [], palavras: [], starters: [],
          topico: "", tarefa: "", entregues: [], presencas: {}, gravacao: "", slides: "" },
        { data: "2026-11-16", curto: "hoje", s: 4, titulo: "Our End of Year Dishes",
          estado: "hoje", hora: "7h",
          objetivo: "A aluna conta a receita que a família dela repete todo fim de ano, e aprende a descrever passos em ordem.",
          roteiro: ROTEIRO_HOJE,
          palavras: ["leftovers", "to stir", "on low heat", "a pinch of"],
          starters: ["First, you…", "After that, I…", "It takes about…"],
          topico: "Receitas de família: passos em ordem",
          tarefa: "Gravar um áudio de 1 minuto descrevendo a receita da sua família, usando pelo menos três palavras da aula.",
          entregues: ["Marina Teste", "Camila Teste", "Juliana Teste"],
          presencas: { "Beatriz Teste": "F" },
          gravacao: "", slides: "docs.google.com/presentation/d/…/basics-s4" },
        { data: "2026-11-09", curto: "9 nov", s: 3, titulo: "Weekend stories",
          estado: "dada", topico: "Passado simples: o fim de semana",
          roteiro: [], palavras: ["last weekend", "I went", "we stayed"], starters: [],
          tarefa: "Escrever cinco frases no passado sobre o seu fim de semana.",
          entregues: ALUNAS.basics.slice(), presencas: {}, gravacao: "", slides: "" },
        { data: "2026-11-02", curto: "2 nov", s: 2, titulo: "Where I live",
          estado: "dada", topico: "Descrever a casa e o bairro",
          roteiro: [], palavras: [], starters: [],
          tarefa: "Mandar uma foto da sua rua e descrevê-la em três frases.",
          entregues: ALUNAS.basics.slice(0, 4), presencas: { "Rafael Teste": "F" },
          gravacao: "drive.google.com/…/basics-2-nov", slides: "" }
      ]
    },
    {
      id: "essentials", nivel: "Essentials (A2)", quando: "ter 13h", dia: "terça",
      projeto: "Traditions", sessao: 4, sessoes: 10,
      modalidade: "online", alunas: ALUNAS.essentials,
      programa: "Essentials · ciclo 2026.2",
      material: "drive.google.com/…/caderno-essentials",
      links: [
        { label: "Caderno da turma", link: "drive.google.com/…/caderno-essentials" },
        { label: "Pasta do ciclo", link: "drive.google.com/…/essentials-2026-2" },
        { label: "Guia do professor", link: "" },
        { label: "Sala online", link: "meet.google.com/…" }
      ],
      renovacao: { sim: 5, nao: 0, semResposta: 2 },
      aulas: [
        { data: "2026-11-17", curto: "amanhã", s: 4, titulo: "Family traditions",
          estado: "agendada", hora: "13h",
          objetivo: "A aluna explica uma tradição da família e compara com a de uma colega.",
          roteiro: ROTEIRO_HOJE.slice(0, 4),
          palavras: ["to gather", "every year", "it is a tradition"],
          starters: ["In my family, we…", "Unlike us, they…"],
          topico: "", tarefa: "", entregues: [], presencas: {}, gravacao: "", slides: "" },
        { data: "2026-11-10", curto: "10 nov", s: 3, titulo: "Holidays around the world",
          estado: "dada", topico: "Feriados e datas",
          roteiro: [], palavras: [], starters: [],
          tarefa: "Trazer uma foto de um feriado e contar o que acontece nele.",
          entregues: ALUNAS.essentials.slice(0, 6), presencas: { "Pedro Teste": "F" },
          gravacao: "drive.google.com/…/essentials-10-nov", slides: "" }
      ]
    },
    {
      id: "speaking", nivel: "Speaking (B1)", quando: "qua 8h", dia: "quarta",
      projeto: "Current Affairs", sessao: 3, sessoes: 10,
      modalidade: "presencial", local: "Rua das Laranjeiras, 120",
      alunas: ALUNAS.speaking,
      programa: "Speaking · ciclo 2026.2",
      material: "drive.google.com/…/caderno-speaking",
      links: [
        { label: "Caderno da turma", link: "drive.google.com/…/caderno-speaking" },
        { label: "Pasta do ciclo", link: "" },
        { label: "Guia do professor", link: "drive.google.com/…/guia-speaking" },
        { label: "Endereço", link: "Rua das Laranjeiras, 120" }
      ],
      renovacao: { sim: 4, nao: 1, semResposta: 1 },
      aulas: [
        { data: "2026-11-18", curto: "qua 18", s: 4, titulo: "Reading the news",
          estado: "agendada", hora: "8h", roteiro: [], palavras: [], starters: [],
          topico: "", tarefa: "", entregues: [], presencas: {}, gravacao: "", slides: "" },
        { data: "2026-11-11", curto: "11 nov", s: 3, titulo: "What is happening",
          estado: "dada", topico: "Notícia da semana",
          roteiro: [], palavras: [], starters: [],
          tarefa: "Trazer uma notícia da semana e resumi-la em 5 frases.",
          entregues: ALUNAS.speaking.slice(), presencas: {},
          gravacao: "drive.google.com/…/speaking-11-nov", slides: "" }
      ]
    }
  ];

  // ── A AULA AO VIVO ───────────────────────────────────────────
  // O estado por aluna é o que o sistema já calcula hoje:
  // escrevendo (escreveu nos últimos 90 s), terminou, sem escrever,
  // não começou. As respostas são por tarefa — as três etapas da
  // sessão de hoje que têm pergunta.
  var VIVO = {
    aberta: false,         // "Começar aula" liga isto
    minutos: 0,
    alunas: [
      { nome: "Marina Teste", estado: "escrevendo",
        respostas: ["First, you boil the milk on low heat.",
          "My grandmother makes rice pudding every December. It takes about two hours.", ""],
        comentarios: [[], [{ texto: "\"every December\" está certo. Tente \"she makes\" no lugar de \"makes\".", quem: "Bárbara" }], []] },
      { nome: "Camila Teste", estado: "terminou",
        respostas: ["First, I cut the onions. After that, I fry them.",
          "We cook feijoada. My father stirs it for one hour.",
          "I will cook it on Sunday with my sister."],
        comentarios: [[], [], []] },
      { nome: "Beatriz Teste", estado: "nao_comecou",
        respostas: ["", "", ""], comentarios: [[], [], []] },
      { nome: "Rafael Teste", estado: "sem_escrever",
        respostas: ["First, you need a pinch of salt.", "", ""],
        comentarios: [[{ texto: "Boa. Agora escreva o segundo passo.", quem: "Bárbara" }], [], []] },
      { nome: "Juliana Teste", estado: "escrevendo",
        respostas: ["First, we buy the fish.", "Every year we eat fish on the 24th. My mother", ""],
        comentarios: [[], [], []] }
    ]
  };

  var ESTADO_VIVO = {
    escrevendo: { label: "escrevendo", cor: "#348a8e" },
    terminou: { label: "terminou", cor: "#3d6b22" },
    sem_escrever: { label: "sem escrever", cor: "#7a5c00" },
    nao_comecou: { label: "não começou", cor: "#b8ada0" }
  };

  // ── O CADERNO FORA DA AULA ───────────────────────────────────
  // O que falta hoje: a professora lendo o que foi entregue depois de
  // a aula fechar. Uma entrada por aluna e por aula.
  var CADERNO = [
    { aluna: "Marina Teste", turma: "basics", aulaCurto: "9 nov", sessao: 3,
      titulo: "Weekend stories", quando: "entregue 10 nov, 21h04", corrigido: true,
      respostas: [
        { pergunta: "Write five sentences about last weekend.",
          texto: "Last weekend I went to my mother house. We stayed there all day. I cooked rice. My sister came with her dog. On Sunday I studied English.",
          comentario: "Falta o apóstrofo: \"my mother's house\". O resto está ótimo." }
      ] },
    { aluna: "Camila Teste", turma: "basics", aulaCurto: "9 nov", sessao: 3,
      titulo: "Weekend stories", quando: "entregue 10 nov, 08h12", corrigido: false,
      respostas: [
        { pergunta: "Write five sentences about last weekend.",
          texto: "I worked on saturday. On sunday I go to the beach with my friends. The water was cold. We eat pastel. I arrive home at night.",
          comentario: "" }
      ] },
    { aluna: "Juliana Teste", turma: "basics", aulaCurto: "9 nov", sessao: 3,
      titulo: "Weekend stories", quando: "entregue 11 nov, 23h40", corrigido: false,
      respostas: [
        { pergunta: "Write five sentences about last weekend.",
          texto: "My weekend was calm. I watched two movies. I didn't go out. I talked with my grandmother by phone. She is 90 years old.",
          comentario: "" }
      ] },
    { aluna: "Amanda Teste", turma: "essentials", aulaCurto: "10 nov", sessao: 3,
      titulo: "Holidays around the world", quando: "entregue 11 nov, 19h55", corrigido: false,
      respostas: [
        { pergunta: "Tell us about a holiday in your family.",
          texto: "In Brazil we celebrate Festa Junina in June. We dance and eat canjica. My aunt makes the best one. Last year it rained and we danced anyway.",
          comentario: "" }
      ] },
    { aluna: "Ana Teste", turma: "speaking", aulaCurto: "11 nov", sessao: 3,
      titulo: "What is happening", quando: "entregue 12 nov, 07h30", corrigido: true,
      respostas: [
        { pergunta: "Summarise one news story in five sentences.",
          texto: "A new law about remote work was approved this week. Companies will have to pay for the internet of the employee. Unions say it is not enough. The law starts in January. I think it will change a lot of contracts.",
          comentario: "Muito bom. \"the employee's internet\" soa mais natural." }
      ] }
  ];

  // ── OS CLUBES ────────────────────────────────────────────────
  var CLUBES = [
    {
      id: "movie", nome: "Movie Lovers", emoji: "🎬", quando: "quinta 20h",
      fuso: "Europa/Amsterdã", nivel: "A partir do A2", inscritas: 8, vagas: 8,
      preco: "€ 30", bio: "Um filme por encontro, escolhido pelo grupo.",
      espera: ["Victoria Teste", "Igor Teste"],
      membros: ["Marina Teste", "Camila Teste", "Ana Teste", "Bianca Teste",
        "Daniel Teste", "Helena Teste", "Lara Teste", "Amanda Teste"],
      materiais: [{ titulo: "Roteiro de perguntas", link: "drive.google.com/…/movie-perguntas" }],
      encontros: [
        { curto: "19 nov", tema: "Cinema Paradiso", estado: "chamada pendente" },
        { curto: "26 nov", tema: "", estado: "sem tema" },
        { curto: "12 nov", tema: "Aquarius", estado: "6 presentes" },
        { curto: "5 nov", tema: "Bacurau", estado: "7 presentes" }
      ],
      forum: [
        { quem: "Marina Teste", quando: "ontem", texto: "Assisti de novo e chorei na mesma cena.",
          respostas: [{ quem: "Bárbara", quando: "ontem", texto: "Qual cena? Traz para quinta." }] },
        { quem: "Ana Teste", quando: "há 3 dias", texto: "Alguém tem legenda em inglês?", respostas: [] }
      ]
    },
    {
      id: "work", nome: "English at Work", emoji: "💼", quando: "terça 19h",
      fuso: "Europa/Amsterdã", nivel: "A partir do B1", inscritas: 6, vagas: 8,
      preco: "€ 30", bio: "Reunião, e-mail e entrevista.",
      espera: [],
      membros: ["Pedro Teste", "Carol Teste", "Aline Teste", "Fernanda Teste",
        "Marcela Teste", "Rafael Teste"],
      materiais: [],
      encontros: [
        { curto: "17 nov", tema: "Standing meetings", estado: "sem chamada" },
        { curto: "24 nov", tema: "", estado: "sem tema" },
        { curto: "10 nov", tema: "Cold e-mails", estado: "5 presentes" }
      ],
      forum: []
    }
  ];

  // ── PARTICULARES ─────────────────────────────────────────────
  var PARTICULARES = [
    { nome: "Larissa Teste", quando: "qui 18h", programa: "Entrevista em inglês · 8 sessões",
      sessao: 5, sessoes: 8, proxima: "19 nov",
      titulo: "Sessão 5 · Tell me about yourself",
      objetivo: "A aluna responde à pergunta de abertura em 90 segundos, sem ler.",
      palavras: ["background", "to be in charge of", "a turning point"],
      tarefa: "Gravar a resposta de 90 segundos e mandar no caderno." },
    { nome: "Otávio Teste", quando: "sex 7h", programa: "Inglês para reuniões · 12 sessões",
      sessao: 9, sessoes: 12, proxima: "20 nov",
      titulo: "Sessão 9 · Interrupting politely",
      objetivo: "A aluna interrompe e devolve a palavra sem travar.",
      palavras: ["sorry to jump in", "to circle back", "go ahead"],
      tarefa: "" }
  ];

  // ── A SEMANA ─────────────────────────────────────────────────
  var SEMANA = [
    { curto: "qua 11", turma: "speaking", data: "2026-11-11", rotulo: "Speaking B1", passada: true },
    { curto: "qui 12", turma: "movie", rotulo: "Movie Lovers", passada: true, clube: true },
    { curto: "hoje", turma: "basics", data: "2026-11-16", rotulo: "Basics A1", hoje: true },
    { curto: "ter 17", turma: "essentials", data: "2026-11-17", rotulo: "Essentials A2" },
    { curto: "qua 18", turma: "speaking", data: "2026-11-18", rotulo: "Speaking B1" }
  ];

  // a agenda de hoje, na ordem do relógio
  var AGENDA_HOJE = [
    { hora: "07h", texto: "Basics (A1) · seg 7h", estado: "agora", turma: "basics", data: "2026-11-16" },
    { hora: "12h", texto: "Larissa Teste · particular", estado: "depois", particular: "Larissa Teste" },
    { hora: "20h", texto: "Movie Lovers · Cinema Paradiso", estado: "depois", clube: "movie" }
  ];

  // a fila: quem precisa de atenção, com o motivo
  var FILA = [
    { nome: "Beatriz Teste", motivo: "Faltou nas duas últimas aulas de Basics.", acao: "Abrir a ficha" },
    { nome: "Rafael Teste", motivo: "Parou de entregar a tarefa há três sessões.", acao: "Abrir a ficha" },
    { nome: "Pedro Teste", motivo: "Avaliação caiu de 4 para 2 no último pulso.", acao: "Abrir a ficha" }
  ];

  // ── GRAVAÇÕES ────────────────────────────────────────────────
  var GRAVACOES = [
    { turma: "Speaking (B1)", curto: "11 nov", sessao: 3, titulo: "What is happening",
      link: "drive.google.com/…/speaking-11-nov" },
    { turma: "Essentials (A2)", curto: "10 nov", sessao: 3, titulo: "Holidays around the world",
      link: "drive.google.com/…/essentials-10-nov" },
    { turma: "Basics (A1)", curto: "9 nov", sessao: 3, titulo: "Weekend stories", link: "" },
    { turma: "Basics (A1)", curto: "2 nov", sessao: 2, titulo: "Where I live",
      link: "drive.google.com/…/basics-2-nov" }
  ];

  // ── AS AULAS DO MÊS ──────────────────────────────────────────
  // Quais aulas contaram, quais não, e por quê.
  //
  // Sem valor por aula e sem total: o protótipo mostra a CONTAGEM e a
  // razão de cada aula ter entrado ou não, que é o que a professora
  // precisa para agir. Quanto ela recebe é assunto do contrato dela
  // com a escola, não desta tela.
  //
  // As somas saem das linhas, e não de um campo à parte: número
  // escrito à mão ao lado da lista é número que desencontra.
  var HORAS = {
    mes: "novembro de 2026",
    fechamento: "O mês fecha no dia 30. Até lá, chamada corrigida volta a contar.",
    linhas: [
      { curto: "2 nov", turma: "Basics (A1)", estado: "contou", porque: "" },
      { curto: "9 nov", turma: "Basics (A1)", estado: "contou", porque: "" },
      { curto: "10 nov", turma: "Essentials (A2)", estado: "contou", porque: "" },
      { curto: "11 nov", turma: "Speaking (B1)", estado: "contou", porque: "" },
      { curto: "12 nov", turma: "Movie Lovers", estado: "contou", porque: "" },
      { curto: "3 nov", turma: "Essentials (A2)", estado: "não contou",
        porque: "Chamada salva sem tópico da aula. Escreva o tópico para a aula entrar." },
      { curto: "4 nov", turma: "Speaking (B1)", estado: "não contou",
        porque: "Chamada reaberta e não salva de novo. Salve para a aula voltar a contar." },
      { curto: "5 nov", turma: "Movie Lovers", estado: "contou", porque: "" },
      { curto: "16 nov", turma: "Basics (A1)", estado: "hoje",
        porque: "Entra quando a chamada for salva com tópico." }
    ]
  };

  // ── SUBSTITUIÇÕES ────────────────────────────────────────────
  var SUB_MOTIVOS = ["doença", "viagem", "imprevisto", "consulta", "outro"];
  var SUBSTITUICOES = [
    { curto: "4 nov", turma: "Speaking (B1)", motivo: "consulta",
      estado: "coberta por Carla", cor: "#3d6b22" }
  ];

  // ── PULSO ────────────────────────────────────────────────────
  // Nota de 1 a 5 e um comentário, por aluna. Existe no sistema
  // (registrarPulso) e hoje só a gestão alcança.
  var PULSOS = {
    "Marina Teste": { nota: 4, quando: "há 2 semanas", comentario: "Solta no grupo, trava no passado." },
    "Camila Teste": { nota: 5, quando: "há 2 semanas", comentario: "Puxa a turma." },
    "Beatriz Teste": { nota: 2, quando: "há 5 semanas", comentario: "Faltou muito, voltou perdida." },
    "Rafael Teste": { nota: 3, quando: "há 3 semanas", comentario: "" },
    "Juliana Teste": { nota: 4, quando: "há 2 semanas", comentario: "" }
  };

  // ── ENTREGAS DO PROJETO ──────────────────────────────────────
  var PROJETO = {
    basics: { nome: "Our End of Year Dishes", entregues: ["Marina Teste", "Camila Teste"] },
    essentials: { nome: "Traditions", entregues: ["Amanda Teste", "Carol Teste", "Aline Teste"] },
    speaking: { nome: "Current Affairs", entregues: ["Ana Teste", "Bianca Teste", "Daniel Teste", "Lara Teste"] }
  };

  var APOIO = [
    { texto: "Revisar aula · Basics sessão 3", estado: "respondido", cor: "#3d6b22" },
    { texto: "Planejar aula · Speaking sessão 5", estado: "na fila", cor: "#7a5c00" }
  ];

  // ── ACESSO ───────────────────────────────────────────────────
  function turma(id) {
    return TURMAS.filter(function (t) { return t.id === id; })[0] || TURMAS[0];
  }
  function aula(turmaId, data) {
    var t = turma(turmaId);
    return (t.aulas || []).filter(function (a) { return a.data === data; })[0] || t.aulas[0];
  }
  function clube(id) {
    return CLUBES.filter(function (c) { return c.id === id; })[0] || CLUBES[0];
  }
  function particular(nome) {
    return PARTICULARES.filter(function (p) { return p.nome === nome; })[0] || PARTICULARES[0];
  }
  function aulaDeHoje() { return { turma: "basics", data: "2026-11-16" }; }

  function aulasDadas() {
    var out = [];
    TURMAS.forEach(function (t) {
      (t.aulas || []).forEach(function (a) {
        if (a.estado === "agendada") return;
        out.push({ turma: t, aula: a });
      });
    });
    return out.sort(function (x, y) { return x.aula.data < y.aula.data ? 1 : -1; });
  }
  function semGravacao() {
    return aulasDadas().filter(function (x) { return !x.aula.gravacao; });
  }
  function semTarefa() {
    var out = [];
    TURMAS.forEach(function (t) {
      (t.aulas || []).forEach(function (a) {
        if (!a.tarefa && (a.estado === "hoje" || a.estado === "agendada")) {
          out.push({ turma: t, aula: a });
        }
      });
    });
    return out;
  }
  function porCorrigir() {
    return CADERNO.filter(function (c) { return !c.corrigido; });
  }
  function clubesSemData() {
    var out = [];
    CLUBES.forEach(function (c) {
      var n = (c.encontros || []).filter(function (e) { return !e.tema; }).length;
      if (n) out.push({ clube: c, n: n });
    });
    return out;
  }

  return {
    TURMAS: TURMAS, CLUBES: CLUBES, SEMANA: SEMANA, VIVO: VIVO,
    ESTADO_VIVO: ESTADO_VIVO, CADERNO: CADERNO, PARTICULARES: PARTICULARES,
    AGENDA_HOJE: AGENDA_HOJE, FILA: FILA, GRAVACOES: GRAVACOES, HORAS: HORAS,
    SUBSTITUICOES: SUBSTITUICOES, SUB_MOTIVOS: SUB_MOTIVOS, PULSOS: PULSOS,
    PROJETO: PROJETO, APOIO: APOIO,
    turma: turma, aula: aula, clube: clube, particular: particular,
    aulaDeHoje: aulaDeHoje, aulasDadas: aulasDadas, semGravacao: semGravacao,
    semTarefa: semTarefa, porCorrigir: porCorrigir, clubesSemData: clubesSemData
  };
})();
