// Os dados dos três protótipos da tela da professora.
//
// São INVENTADOS, e os mesmos nos três — é o que torna a comparação
// honesta: o que muda de um modelo para o outro é a arrumação, não o
// conteúdo. Nenhum nome aqui é de aluna de verdade.
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

  var TURMAS = [
    {
      id: "basics", nivel: "Basics (A1)", quando: "seg 7h", dia: "segunda",
      projeto: "Our End of Year Dishes", sessao: 4, sessoes: 10,
      modalidade: "online", alunas: ALUNAS.basics,
      material: "drive.google.com/…/caderno-basics",
      aulas: [
        { data: "2026-11-23", curto: "23 nov", s: 5, titulo: "Talking about plans",
          estado: "agendada" },
        { data: "2026-11-16", curto: "hoje", s: 4, titulo: "Our End of Year Dishes",
          estado: "hoje", hora: "7h",
          objetivo: "A aluna conta a receita que a família dela repete todo fim de ano, e aprende a descrever passos em ordem.",
          palavras: ["leftovers", "to stir", "on low heat", "a pinch of"],
          topico: "Receitas de família: passos em ordem",
          tarefa: "Gravar um áudio de 1 minuto descrevendo a receita da sua família, usando pelo menos três palavras da aula.",
          entregues: ["Marina Teste", "Camila Teste", "Juliana Teste"],
          presencas: { "Beatriz Teste": "F" },
          gravacao: "" },
        { data: "2026-11-09", curto: "9 nov", s: 3, titulo: "Weekend stories",
          estado: "dada", topico: "Passado simples: o fim de semana",
          tarefa: "Escrever cinco frases no passado sobre o seu fim de semana.",
          entregues: ALUNAS.basics.slice(), presencas: {}, gravacao: "" },
        { data: "2026-11-02", curto: "2 nov", s: 2, titulo: "Where I live",
          estado: "dada", topico: "Descrever a casa e o bairro",
          tarefa: "Mandar uma foto da sua rua e descrevê-la em três frases.",
          entregues: ALUNAS.basics.slice(0, 4), presencas: { "Rafael Teste": "F" },
          gravacao: "drive.google.com/…/basics-2-nov" }
      ]
    },
    {
      id: "essentials", nivel: "Essentials (A2)", quando: "ter 13h", dia: "terça",
      projeto: "Traditions", sessao: 4, sessoes: 10,
      modalidade: "online", alunas: ALUNAS.essentials,
      material: "drive.google.com/…/caderno-essentials",
      aulas: [
        { data: "2026-11-17", curto: "amanhã", s: 4, titulo: "Family traditions",
          estado: "agendada", hora: "13h",
          objetivo: "A aluna explica uma tradição da família e compara com a de uma colega.",
          palavras: ["to gather", "every year", "it is a tradition"],
          topico: "", tarefa: "", entregues: [], presencas: {}, gravacao: "" },
        { data: "2026-11-10", curto: "10 nov", s: 3, titulo: "Holidays around the world",
          estado: "dada", topico: "Feriados e datas",
          tarefa: "Trazer uma foto de um feriado e contar o que acontece nele.",
          entregues: ALUNAS.essentials.slice(0, 6), presencas: { "Pedro Teste": "F" },
          gravacao: "drive.google.com/…/essentials-10-nov" }
      ]
    },
    {
      id: "speaking", nivel: "Speaking (B1)", quando: "qua 8h", dia: "quarta",
      projeto: "Current Affairs", sessao: 3, sessoes: 10,
      modalidade: "presencial", local: "Rua das Laranjeiras, 120",
      alunas: ALUNAS.speaking,
      material: "drive.google.com/…/caderno-speaking",
      aulas: [
        { data: "2026-11-18", curto: "qua 18", s: 4, titulo: "Reading the news",
          estado: "agendada", hora: "8h" },
        { data: "2026-11-11", curto: "11 nov", s: 3, titulo: "What is happening",
          estado: "dada", topico: "Notícia da semana",
          tarefa: "Trazer uma notícia da semana e resumi-la em 5 frases.",
          entregues: ALUNAS.speaking.slice(), presencas: {},
          gravacao: "drive.google.com/…/speaking-11-nov" }
      ]
    }
  ];

  var CLUBES = [
    {
      id: "movie", nome: "Movie Lovers", emoji: "🎬", quando: "quinta 20h",
      nivel: "A partir do A2", inscritas: 8, vagas: 8,
      encontros: [
        { curto: "19 nov", tema: "Cinema Paradiso", estado: "chamada pendente" },
        { curto: "26 nov", tema: "Central do Brasil", estado: "não marcado" },
        { curto: "12 nov", tema: "Aquarius", estado: "6 presentes" },
        { curto: "5 nov", tema: "Bacurau", estado: "7 presentes" }
      ],
      forum: [
        { quem: "Marina Teste", quando: "ontem", texto: "Assisti de novo e chorei na mesma cena." },
        { quem: "Ana Teste", quando: "há 3 dias", texto: "Alguém tem legenda em inglês?" }
      ]
    }
  ];

  // a semana da professora, em ordem
  var SEMANA = [
    { curto: "qua 11", turma: "speaking", rotulo: "Speaking B1", passada: true },
    { curto: "qui 12", turma: "movie", rotulo: "Movie Lovers", passada: true, clube: true },
    { curto: "hoje", turma: "basics", rotulo: "Basics A1", hoje: true },
    { curto: "ter 17", turma: "essentials", rotulo: "Essentials A2" },
    { curto: "qua 18", turma: "speaking", rotulo: "Speaking B1" }
  ];

  function turma(id) {
    return TURMAS.filter(function (t) { return t.id === id; })[0] || TURMAS[0];
  }
  function aula(turmaId, data) {
    var t = turma(turmaId);
    return (t.aulas || []).filter(function (a) { return a.data === data; })[0] || t.aulas[0];
  }
  function aulaDeHoje() { return { turma: "basics", data: "2026-11-16" }; }

  // todas as aulas já dadas, de todas as turmas, mais recentes primeiro
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

  return { TURMAS: TURMAS, CLUBES: CLUBES, SEMANA: SEMANA,
    turma: turma, aula: aula, aulaDeHoje: aulaDeHoje,
    aulasDadas: aulasDadas, semGravacao: semGravacao, semTarefa: semTarefa };
})();
