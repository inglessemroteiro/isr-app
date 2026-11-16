# O que a professora precisa ter no sistema para conseguir trabalhar

Levantamento feito em 16/11/2026 sobre o código do app (v2026.11.13-g), para
responder a uma pergunta de produto: **quais tarefas a professora executa, e
quais delas o sistema atende hoje.**

O método: pesquisa externa para montar a lista de tarefas, e leitura do código
para dizer, de cada tarefa, **onde ela mora hoje** ou **que ela não existe**.
Nada aqui é opinião sobre o que seria bonito. Cada linha aponta para um arquivo.

---

## 1. O que a pesquisa externa diz

Não há estudo que descreva, tarefa por tarefa, o dia de uma professora de
idiomas online. O que existe sustenta três conclusões úteis para o desenho:

**O trabalho se divide em antes, durante e depois da aula.** Um artigo de gestão
de tempo para professores de ESL lista, fora da aula: planejar, corrigir,
registrar presença, e falar com aluna ou responsável
([European Science](https://europeanscience.org/index.php/4/article/download/1223/1177/2365)).
Guias de LMS repetem o mesmo núcleo — chamada, notas, plano de aula e
comunicação
([Edsby](https://www.edsby.com/complete-guide-to-choosing-the-best-lms-for-k12/commentary/)).

**O trabalho administrativo tira tempo do pedagógico.** Nos países da OCDE, a
média é de ~2,7 h semanais em tarefas administrativas
([OECD](https://www.oecd.org/content/dam/oecd/en/publications/reports/2021/01/not-enough-hours-in-the-day_4ebd6b3d/15990b42-en.pdf)).
Um estudo associa carga administrativa maior a menos tempo de planejamento e de
devolutiva à aluna
([ResearchGate](https://www.researchgate.net/publication/331160236_Teachers'_administrative_workload_crowding_out_instructional_activities)).
Um estudo de uso de tempo em Queensland chega ao mesmo ponto
([QUT](https://research.qut.edu.au/ttpatw/wp-content/uploads/sites/398/2025/04/Time-Use-Time-Poverty-and-Teachers-Work-Preliminary-Report-on-Phase-3.pdf)).

**Ferramenta digital pode aumentar o trabalho em vez de reduzir.** É o achado de
um levantamento de 2026 com professores do ensino fundamental
([ISA Publisher](https://isapublisher.com/wp-content/uploads/2026/03/Teachers-Administrative-Challenges-in-the-Digital-Age.pdf)).
Ensinar online, em particular, acrescenta carga
([ScienceDirect](https://www.sciencedirect.com/science/article/pii/S0346251X22001002)).

Consequência de desenho: **o critério não é quantas telas o sistema tem, é
quantos passos cada tarefa custa.** Uma tarefa que o sistema cobre, mas que mora
numa tela que a professora não alcança, conta como não coberta.

---

## 2. O limite de navegação, que explica quase tudo

O app tem uma trava explícita em `crm-data.js:7549`:

```js
var TELAS_DA_PROFESSORA = ["ISR - Painel", "ISR - Turma ", "ISR - Perfil"];
```

Quem só dá aula — `professora`, `extra`, `shadow`, sem papel de gestão
(`crm-data.js:7555`) — é redirecionada ao Painel se tentar abrir qualquer outra
tela de gestão. E no menu (`isr-shell.js:141`) ela tem **um item**: "Painel do
professor".

Fora dessa trava ficam, entre outras, estas telas, todas `gestora`/`operacao`:

| Tela | Linha | Quem vê |
|---|---|---|
| Gravações | `isr-shell.js:152` | gestora, operação |
| Turmas & Projetos | `isr-shell.js:143` | gestora, comercial, operação |
| Programas | `isr-shell.js:147` | gestora, operação |
| Acompanhamento | `isr-shell.js:142` | gestora, comercial, operação |
| Clubes | `isr-shell.js:155` | gestora, operação, comercial |
| Folha | `isr-shell.js:137` | gestora |

Ou seja: **tudo o que a professora precisa tem de caber no Painel, na página da
Turma, no Perfil da aluna — ou não existe para ela.** É esta a régua do resto
do documento.

---

## 3. Antes da aula · preparar

| # | A tarefa | Onde está hoje |
|---|---|---|
| 1 | Ler o plano da sessão: roteiro por etapas, minutos de cada uma, qual etapa vira tarefa no caderno | **Existe** · `ISR - Turma v3.dc.html:423` (aba "plano") |
| 2 | Editar esse plano: acrescentar atividade, reordenar, apagar, mudar minutos, marcar quais etapas entram na aula | **Existe** · `ISR - Turma v3.dc.html:433-500` |
| 3 | Escrever as palavras da sessão e os começos de frase que a aluna recebe | **Existe** · `ISR - Turma v3.dc.html:508-553` |
| 4 | Escrever a tarefa de casa da sessão | **Existe** · `ISR - Turma v3.dc.html:554` (`peHwRef`) |
| 5 | Ver o plano com os olhos da aluna antes de publicar | **Existe** · `ISR - Turma v3.dc.html:590` |
| 6 | Escolher o programa que a turma segue | **Existe** · `ISR - Turma v3.dc.html:262` |
| 7 | Abrir os materiais da turma (caderno, drive, links) | **Existe** · `ISR - Turma v3.dc.html:630` e aba materiais do Painel |
| 8 | Pedir apoio pedagógico: revisar aula, planejar aula, revisar material | **Existe** · `ISR - Turma v3.dc.html:666` |
| 9 | Guardar e abrir o link dos slides daquela sessão | **Existe, mas só dentro da aula** · `ISR - Painel v3.dc.html:167` — a aba Slides aparece depois de "Começar aula". Preparar slides é trabalho de antes. |
| 10 | Escrever o conteúdo da aula em blocos (texto, lista, tabela, imagem, vídeo, colunas, tarefa), ler o Guia do Professor, baixar PDF, apresentar em tela cheia | **Existe, solto** · `ISR - Tela de Aula (Editor Colaborativo).dc.html` — tela completa, com editor de blocos (linha 405), guia do prof (linha 329) e modo apresentação (linha 397). **Nenhum link do Painel ou da Turma leva a ela.** |

**Problema de desenho em 1–8:** todas essas tarefas moram na página da Turma, que
não está no menu dela. O único caminho é um link de texto no cabeçalho da turma
dentro do Painel (`ISR - Painel v3.dc.html:231`). Uma professora que não clique
nesse link nunca chega ao plano, às palavras, à tarefa de casa, ao projeto nem
aos materiais.

---

## 4. Durante a aula · conduzir

| # | A tarefa | Onde está hoje |
|---|---|---|
| 11 | Abrir a aula / abrir o caderno das alunas | **Existe, em dois lugares** · hero de Hoje e a barra em cima da chamada, para qualquer data (`ISR - Painel v3.dc.html:1117`; `crm-data.js:12448`) |
| 12 | Encerrar a aula, e reabri-la se precisar | **Existe** · `crm-data.js:12460`; botão em `ISR - Painel v3.dc.html:85` |
| 13 | **Ver, ao vivo, o que cada aluna está escrevendo** — grade de cartões, prévia do texto, progresso, e quatro estados: escrevendo (últimos 90 s), terminou, sem escrever, não começou | **Existe** · `ISR - Painel v3.dc.html:111-128`; estados em `crm-data.js:12643` |
| 14 | Filtrar a grade por estado, para achar quem travou | **Existe** · `ISR - Painel v3.dc.html:99` |
| 15 | Abrir uma aluna e ler as respostas, tarefa por tarefa | **Existe** · `ISR - Painel v3.dc.html:129-165` |
| 16 | **Comentar uma resposta** — o comentário fica preso à tarefa e aparece no caderno dela | **Existe** · `ISR - Painel v3.dc.html:152`; `crm-data.js:12622` |
| 17 | Apresentar os slides da sessão | **Existe** · aba Slides dentro da aula (`ISR - Painel v3.dc.html:167`) |
| 18 | Chamada: presente, atraso, falta, justificada | **Existe** · `ISR - Painel v3.dc.html:1253` |
| 19 | Todas presentes / todas faltas de uma vez | **Existe** · `ISR - Painel v3.dc.html:1243` |
| 20 | Marcar a entrega da tarefa de cada aluna | **Existe** · `ISR - Painel v3.dc.html:1251` |
| 21 | Dizer qual sessão foi dada e escrever o tópico da aula (sem tópico a aula não entra na folha) | **Existe** · `ISR - Painel v3.dc.html:1320-1336` |
| 22 | Ver o diário: a grade de todas as aulas × alunas, com frequência | **Existe** · `ISR - Painel v3.dc.html:1265` |
| 23 | Dar chamada de aula extra, incluindo aluna de outra turma na mão | **Existe** · `ISR - Painel v3.dc.html:1187` |
| 24 | Saber onde está no roteiro: qual etapa, quanto tempo falta | **FALTA.** Os minutos de cada etapa existem no plano (`pe.min`), mas nada marca a etapa corrente durante a aula. |
| 25 | Conduzir a aula numa interface só | **FALTA.** Hoje a aula está repartida em três arquivos: o ao vivo e os slides no Painel, o conteúdo da aula em `ISR - Tela de Aula`, o roteiro e a tarefa de casa na Turma. |

---

## 5. Depois da aula · fechar e corrigir

| # | A tarefa | Onde está hoje |
|---|---|---|
| 26 | Corrigir uma presença marcada errado, numa chamada já salva | **Existe**, com trava de dois passos e histórico de quem mexeu · `ISR - Painel v3.dc.html:1216` e `:1363` |
| 27 | Guardar o link da gravação daquela aula | **Existe** · campo na chamada (`ISR - Painel v3.dc.html:1345`) |
| 28 | **Ler a tarefa de casa depois da aula** | **FALTA — é o buraco que você viu.** Ver abaixo. |
| 29 | **Ver a lista das gravações, e quais aulas estão sem** | **FALTA para ela.** A tela existe (`ISR - Gravacoes v3.dc.html`) e é `gestora`/`operacao`; a trava de `crm-data.js:7549` a devolve ao Painel. |
| 30 | Ver quem entregou o projeto do ciclo, e marcar a entrega | **Existe** · `ISR - Turma v3.dc.html:596` (aba projeto) |
| 31 | Registrar como a aluna está indo — nota e comentário | **FALTA para ela.** `registrarPulso` (`crm-data.js:2052`) só aparece em `ISR - Acompanhamento v3.dc.html`, que ela não alcança. É o registro que ela, de todas as pessoas da escola, é a mais indicada para fazer. |
| 32 | Pedir substituição de uma aula, com motivo | **Existe** · `ISR - Painel v3.dc.html:970-1010`; `crm-data.js:12759` |

### 28 · "as profs não conseguem acessar as tarefas de casa"

Isto é verdade, e a causa é precisa.

- `respostasDaAula(turmaLabel, dataIso, nTarefas)` (`crm-data.js:12643`) devolve as
  respostas de todas as alunas de **uma** aula, numa **data**. É chamada em um
  único lugar: `ISR - Painel v3.dc.html:2553`, dentro de `vivoVals`, que só roda
  quando `this.state.emAula` existe — isto é, **enquanto a aula está aberta**.
- `cadernoDaAluna(pessoaId, nDias)` (`crm-data.js:12670`) devolve o caderno
  inteiro de uma aluna, aula por aula. É chamada em um único lugar:
  `ISR - Aluna v4.dc.html:2197` — **o app da própria aluna**.

Resultado: a professora marca "entregou" na chamada sem poder ler o que foi
entregue, e o comentário dela em uma resposta só é possível enquanto a aula
corre. Fechada a aula, o texto da aluna fica guardado e sem leitora.

O dado existe. A tela não.

---

## 6. O mês dela · o que entrega e o que recebe

| # | A tarefa | Onde está hoje |
|---|---|---|
| 33 | Ver o que entregou no mês: aulas com chamada, aulas sem chamada, alunas, clubes | **Existe** · `ISR - Painel v3.dc.html:920` |
| 34 | Ver a pilha de aulas sem chamada e resolvê-la | **Existe** · hero e cartão de Hoje |
| 35 | **Ver as próprias horas e o próprio pagamento** | **FALTA.** `pagamentoProfessora(nome, mesKey)` (`crm-data.js:9374`) e `folhaPagamento(mesKey)` (`crm-data.js:9800`) existem, e aparecem só em `ISR - Folha v3.dc.html` e `ISR - Equipe v3.dc.html`, ambas `gestora`. |
| 36 | **Entender por que uma aula não contou** | **FALTA**, junto com 35. As regras existem e são do conhecimento dela: chamada sem tópico não entra; chamada reaberta sai da folha até ser salva de novo (`ISR - Painel v3.dc.html:1205`). A tela diz isso da aula aberta, mas não existe lugar que mostre o mês fechado. |

O ponto 35 é o que mais pesa na relação de trabalho: a professora não vê quantas
aulas contaram nem quanto vai receber, e é ela que cumpre a regra que decide isso.

---

## 7. O resto do trabalho dela, que não é turma

| # | A tarefa | Onde está hoje |
|---|---|---|
| 37 | Clube: escrever a página, o nível, o dia, a hora e o fuso de quem conduz | **Existe** · aba clubes do Painel (`ISR - Painel v3.dc.html:572`) |
| 38 | Clube: marcar as datas dos encontros com tema | **Existe** · `ISR - Painel v3.dc.html:640` |
| 39 | Clube: inscritas, lista de espera, tirar e promover | **Existe** · `ISR - Painel v3.dc.html:693` |
| 40 | Clube: chamada de cada encontro | **Existe** · `ISR - Painel v3.dc.html:755` |
| 41 | Clube: manter o fórum vivo — deixar a pergunta, responder, apagar | **Existe** · `ISR - Painel v3.dc.html:793` |
| 42 | Clube: material do encontro | **Existe** · `ISR - Painel v3.dc.html:830` |
| 43 | Particular: ver a aluna, o programa que ela segue, a sequência e a sessão desta aula | **Existe** · `ISR - Painel v3.dc.html:318-460` |
| 44 | Ver a ficha de uma aluna pelo nome | **Existe** · `ISR - Perfil v3.dc.html`, aberto pelo nome na chamada |
| 45 | Ver a fila do dia: quem faltou, quem parou de entregar, quem precisa de contato | **Existe** · `ISR - Painel v3.dc.html:902` |
| 46 | Renovação: quem continua no ciclo seguinte | **Existe** · `ISR - Turma v3.dc.html:696` |

---

## 8. Resumo: a conta

**Existe e ela alcança — 34 tarefas.** O sistema cobre quase todo o trabalho.

**Existe e ela não alcança — 4 tarefas**, por causa de `TELAS_DA_PROFESSORA`:
gravações (29), pulso da aluna (31), horas e pagamento (35, 36).

**Existe e está solto — 2:** o editor da aula (10), a que nenhum link leva, e os
slides (9), que só abrem depois de a aula começar.

**Não existe — 3:** ler a tarefa de casa fora da aula (28), a etapa corrente do
roteiro durante a aula (24), e uma interface única da aula (25).

O diagnóstico não é falta de funcionalidade. É **arranjo**: o trabalho dela está
repartido entre três arquivos, e três coisas que ela precisa estão atrás de uma
trava de perfil feita para proteger o financeiro da escola.

É sobre esse arranjo que os três modelos decidem.

---

## 9. O que os três modelos têm de conter

Lista fechada, usada como contrato dos protótipos em `rascunhos/`. Todos os três
contêm **os mesmos 13 blocos**; o que muda entre eles é onde cada bloco mora e
quantos passos custa chegar nele.

1. Hoje: a próxima ação, a agenda do dia, a fila
2. A aula ao vivo: abrir, grade de quem escreve, aluna aberta, comentário, encerrar
3. Slides e o conteúdo da aula (o editor de blocos e o guia do prof)
4. Chamada: presenças, entrega, sessão, tópico, gravação, histórico, diário
5. O plano da sessão: roteiro, minutos, palavras, começos de frase, tarefa de casa
6. **Cadernos e tarefas de casa fora da aula** (hoje inexistente)
7. A turma: visão geral, alunas, projeto, materiais, renovação
8. Clubes: página, inscritas e espera, encontros e chamada, fórum, material
9. Particulares: aluna, programa, sessão
10. **Gravações: a lista, e quais aulas estão sem** (hoje fora do alcance dela)
11. **Minhas horas: o que contou no mês e por quê** (hoje fora do alcance dela)
12. Substituição: pedir, com motivo
13. **Pulso da aluna: nota e comentário** (hoje fora do alcance dela)
