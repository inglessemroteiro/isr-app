# Lógica do handoff × o que o app já tem

Resposta ao passo 0 do `00 LEIA PRIMEIRO` e ao prompt do `02 Lógica do
sistema`: para cada papel, entidade, regra e evento, se **já existe**,
**existe diferente** ou **FALTA**. Nada foi editado.

Lido: `00 LEIA PRIMEIRO`, `01 Tokens e padrões`, `02 Lógica do sistema`
e os treze arquivos do Painel do professor (00 a 12). **Não recebi**
`gestao/01 Miles e loja` nem a pasta `aluna/`.

---

## 1. Papéis e permissões

| Item do handoff | Estado | O que o app faz hoje |
|---|---|---|
| Coordenação vê tudo | **já existe** | perfil `gestora` |
| Comercial: central, alunas, matrícula, turmas sem plano/chamadas/financeiro, renovação, agenda | **existe diferente** | a Carla também vê Acompanhamento, Cobrança, Marketing e Importar |
| Admin/Financeiro: central, alunas, turmas sem plano, chamadas, financeiro, folha, Miles & loja, agenda | **existe diferente** | a Érika vê também o Painel do professor, Gravações e Clubes |
| **Professora vê só o Painel do professor** | **existe diferente** | ela vê Agenda, Painel, Acompanhamento, Turmas & Projetos, Gravações e Clubes |
| Seletor "vendo como" só para a coordenação, sem mudar o autor do que se grava | **já existe** | `gestaoVisao()` filtra tela, `gestaoUser()` assina gravação |
| Abas da turma por papel (Renovação e Financeiro fora da professora) | **FALTA** | a lista de abas é fixa: Visão geral, Alunas, Plano das aulas, Chamadas, Materiais, Renovação e vagas — a mesma para todo mundo. Não há aba **Projeto** e não há aba **Financeiro** |
| Substituta com acesso temporário no dia da aula | **FALTA** | não existe substituição no sistema |

## 2. Entidades

| Entidade | Estado | Observação |
|---|---|---|
| Aluna (nome, nível, formato, status, turma, objetivo, miles) | **existe diferente** | tudo existe menos **objetivo da particular**, que é o campo que o desenho de Particulares mostra em destaque |
| Professora (nome, bio, papel) | **existe diferente** | nome e papéis sim; **foto e bio** não |
| Turma (nome, nível, ciclo, horário, professora, projeto, capacidade, alunas) | **existe diferente** | falta **formato durante a aula (digital/papel)** |
| Sessão (nº, data, título, status, link dos slides) | **existe diferente** | nº, data e título vêm do syllabus; **status (a vir / ao vivo / dada) e link dos slides FALTAM** |
| Plano da sessão (base do syllabus + ajustes por turma + rascunho/publicado) | **já existe** | é o que foi feito nos PRs #288 e #300, incluindo copy-on-write por turma |
| Ajuste do plano **por aluna** (particular) | **FALTA** | o plano é por turma; não há plano por aluna |
| Resposta no caderno (texto/áudio/foto, atualizada em, comentários) | **existe diferente** | o caderno guarda texto por aula e aluna; **áudio, foto e comentário da professora FALTAM** |
| Homework (status aberto / entregue / atrasado, prazo) | **existe diferente** | o texto do homework existe no plano; **não há entrega nem status por aluna** |
| Chamada (P/A/F/J, tópico, data real, salva por/em, conta na folha) | **já existe** | o tópico foi acrescentado no PR #292 |
| Substituição | **FALTA** | — |
| Clube (nome, descrição, nível, formato, local/link, vagas, 4 encontros, bio, status, inscritas, lista de espera, material, é novo) | **existe diferente** | tem nome, professora, formato, dia, hora, duração, vagas, local, descrição e status. **FALTAM: nível, os 4 encontros com data e tema, bio, material, lista de espera e a marca "novo"** |
| Review Vault | **já existe** | cofre de palavras com repetição espaçada |
| Miles (extrato, recompensa, resgate) | **existe diferente** | o app é mais completo que o handoff: catálogo em três níveis, limites por mês e por ciclo, FLIN, passe livre. O saldo já é a soma do extrato |
| Swap & sell | **FALTA** | — |
| Perfil social (scraps, depoimentos, atributos) | **FALTA** | — |

## 3. Regras de negócio

| Regra | Estado |
|---|---|
| O plano vem do syllabus, a professora publica, só o publicado aparece no caderno | **já existe** |
| Tirar etapa vale só para a turma; o syllabus base não muda | **já existe** |
| As atividades abrem quando a aula começa e fecham quando termina | **FALTA** — não há estado de aula ao vivo |
| O homework abre quando a aula termina | **FALTA** |
| Sessão passada fica só leitura para a professora | **FALTA** |
| Aviso de homework anterior não entregue no topo do caderno | **FALTA** |
| Particular usa o syllabus do nível, com pular e reordenar por aluna | **FALTA** |
| Notas da professora sobre a aluna, só a equipe vê | **já existe** |
| Tópico obrigatório para salvar a chamada | **existe diferente** — o campo existe, mas salvar sem ele é permitido |
| Só chamada salva conta na folha | **já existe** |
| Editar chamada salva tira a aula da folha até salvar de novo | **FALTA** |
| Aula da substituta conta na folha dela | **FALTA** |
| 2 faltas seguidas geram alerta | **existe diferente** — a fila tem "falta recente"; não é a regra de duas seguidas |
| Presença mínima de 75% com aviso para a aluna | **já existe** |
| Substituição pedida pela professora, atribuída pela coordenação, aviso por WhatsApp abaixo de 24h | **FALTA** |
| Clube: 4 encontros por ciclo | **FALTA** |
| Plano inclui 2 clubes, o 3º custa €50 | **FALTA** |
| 2 faltas tiram do clube e a vaga vai para a lista de espera | **FALTA** |
| Só clube publicado aparece no catálogo | **já existe** |
| Tag "New" no clube recém-publicado | **FALTA** |
| Só rascunho pode ser apagado; publicado só despublica sem inscritas | **FALTA** |
| Para publicar, exigir nome, descrição, nível, horário, 4 datas, vagas e local/link | **FALTA** |
| Tabela de miles por ação (+25, +15, +20, +5) | **FALTA** — o extrato existe, os gatilhos automáticos não |
| Resgate desconta na hora, confere saldo e estoque | **já existe** |
| Cancelar resgate devolve miles e estoque | **FALTA** |
| Ajuste manual com motivo obrigatório e visível | **existe diferente** — o lançamento tem motivo; não é obrigatório |
| Só Gabi e Érika mexem em miles, recompensas e anúncios | **existe diferente** — hoje é por perfil de tela, não por regra escrita |

## 4. Eventos entre os apps

| Evento | Estado |
|---|---|
| Publicar o plano → caderno da aluna | **já existe** |
| Começar/encerrar aula → abre e fecha o caderno, abre o homework | **FALTA** |
| Aluna escreve → Respostas ao vivo | **FALTA** |
| Comentário da professora → caderno | **FALTA** |
| Link dos slides → "Class slides" no caderno | **FALTA** |
| Salvar chamada → folha, contagem do Hoje, presença, alertas | **já existe** |
| Pedir substituição → coordenação | **FALTA** |
| Atribuir substituta → painel dela e folha | **FALTA** |
| Editar/publicar clube → catálogo da aluna | **existe diferente** — publicar já leva ao catálogo; nível, encontros e material não existem para levar |
| Anexar material ao clube → "reference material" | **FALTA** |
| Aluna entra/sai do clube → Inscritas | **já existe** |
| Resgatar recompensa → resgates para entregar | **já existe** |
| Cancelar resgate → miles voltam | **FALTA** |
| Ajustar miles → saldo e notificação | **existe diferente** — ajusta o saldo, não notifica |
| Criar/editar/ocultar recompensa → loja da aluna | **já existe** |
| Swap & sell, nos dois sentidos | **FALTA** |
| Ações que dão miles → extrato e saldo | **existe diferente** — lançamento à mão, sem gatilho |

## 5. Design

O `01 Tokens e padrões` bate com o design system que está no app: as
cores são as mesmas e já estão em tokens (`--color-primary-900` =
`#164951`, `--color-button-primary` = `#fc9082`, e assim por diante), a
fonte é Inter, os raios e as pills de 999px são os mesmos.

Três diferenças, e a segunda é a que mais aparece na tela:

1. **A sombra sólida dos botões.** O handoff pede `0 4px 0` com cor
   própria (`#0e3339` nos escuros, `#d9675a` nos corais), subir 3px no
   hover e afundar 2px no clique. O app tem a sombra, mas não o
   movimento.
2. **Os nomes das etapas do roteiro.** O desenho que você mandou mostra
   `warm-up · listen · learn · practice`. O guia do professor e o
   sistema usam as seis fases da ISR: Warm-up · Minds On · Language
   Focus · Hands On · Share Out · Wrap-up. **Mantive as seis**, porque
   são as do material de verdade — mas isso significa que a tela nunca
   vai ficar igual a esse desenho, e é uma escolha sua, não minha.
3. **O menu.** O desenho mostra "Pessoas" e "Folha de professores"; o
   app diz "Alunas" e "Folha", porque você pediu assim. Mantive o que
   você pediu.

## 6. Tela a tela

| # | Tela | Quanto já existe | O que falta nela |
|---|---|---|---|
| 00 | Moldura | abas Hoje · Minhas turmas · Particulares · Clubes, "vendo como", cabeçalho | a aba na URL (`?tab=…&turma=…&sub=…`), o modo "em aula" na barra, e as abas da Página da turma por papel |
| 01 | Hoje | o hero em quatro estados (A–D), a fila pedagógica, Entregas do mês | **Agenda de hoje** (hoje é "próximas aulas · 7 dias"), **Projeto · entregas**, **Turmas atribuídas**, **Substituições** |
| 02 | Em aula · Respostas ao vivo | nada | tudo: estado da aula, resposta da aluna ao vivo, comentário por tarefa |
| 03 | Em aula · Slides | nada | link do Google Slides por sessão, validação do domínio, miniaturas a partir do roteiro |
| 04 | Minhas turmas | a lista das turmas da professora com nível, horário, ocupação e a sessão da semana | a faixa de cor por nível (não há tabela de cor de nível no app) |
| 05 | Turma · Visão geral | nome, nível, ciclo, horário, professora, projeto, ocupação | **"Editar turma" só para a coordenação** (hoje a página é de gestão inteira) e o cartão de **substituto** |
| 06 | Turma · Alunas | lista da turma, nome clicável, quem saiu | alerta de **2 faltas seguidas** (há "falta recente", que é outra regra) e de **homework atrasado** (não existe entrega) |
| 07 | Turma · Plano das aulas | faixa de sessões, ajustar, incluir/tirar etapa, reordenar, atividade própria com selo "sua", perguntas do caderno, palavras, homework, publicar | **sessão passada só leitura**, "x **de 60** min", formato da turma (digital/papel), **gerar worksheet** e **ver como aluna**. As pills de etapa são as seis da ISR, não as cinco do protótipo |
| 08 | Turma · Chamadas | semanas, dias, aulas do dia, P/A/F/J, tópico, data real, chamada retroativa, conta na folha | **tópico obrigatório** para salvar e **editar chamada salva tira a aula da folha** até salvar de novo |
| 09 | Turma · Projeto | o nome do projeto do ciclo | **as entregas por aluna** — o app não registra quem entregou o projeto, então o "7/10" e o "Faltam: nomes" não têm de onde sair |
| 10 | Turma · Materiais | os materiais da turma com link, status e edição | **apoio pedagógico** (tipos de pedido, pedido e status) |
| 11 | Particulares | as alunas particulares da professora e as notas da professora | **objetivo da aluna**, **pular e reordenar sessões por aluna**, **plano ajustado por aluna**, a caixa da aluna híbrida e a etapa *review* |
| 12 | Clubes | cartões, publicado/rascunho, inscritas, catálogo da aluna | nível, os 4 encontros, bio, material, lista de espera, marca "novo", e as regras de publicar/despublicar/apagar |

## 7. O que falta decidir antes de implementar

1. **A professora vê só o Painel?** O handoff diz que sim. Hoje ela vê
   seis itens de menu. Isso muda o menu dela de uma vez.
2. **A Página da turma é uma só ou duas?** Hoje `ISR - Turma v3` é a
   página de gestão, com Renovação e vagas para todo mundo. O handoff
   quer a mesma página mostrando abas diferentes por papel, com
   Projeto e Financeiro, que não existem. Dá para fazer das duas
   formas; a de uma página só é menos código e menos chance de as duas
   divergirem.
3. **Quatro entidades novas**, e cada uma é um trabalho em si, não um
   ajuste de tela: **substituição**, **estado da aula ao vivo** (com a
   resposta da aluna chegando e o comentário da professora), **entrega
   do projeto por aluna** e **entrega do homework por aluna**. As
   telas 01, 02, 05, 06 e 09 dependem delas.
4. **Clubes** precisa de seis campos novos antes de a tela existir:
   nível, os 4 encontros, bio, material, lista de espera e a marca
   "novo".

## 8. Ordem que eu proponho

| # | Tela | Por que nesta posição |
|---|---|---|
| 1 | Moldura (00) | as outras encaixam dentro dela, põe a aba na URL e resolve as abas por papel, que o 05 e o 06 cobram |
| 2 | Chamadas (08) | duas regras pequenas e de consequência direta na folha: tópico obrigatório e editar tira da folha |
| 3 | Minhas turmas (04) + Visão geral (05) + Alunas (06) | as três são leitura; o que falta é a cor do nível e o recorte por papel |
| 4 | Hoje (01) | o hero já está feito; Agenda de hoje e Turmas atribuídas saem do que existe. Projeto e Substituições esperam as entidades |
| 5 | Plano das aulas (07) | está quase todo pronto: faltam só leitura em sessão passada, "de 60 min" e os dois links do rodapé |
| 6 | Materiais (10) | uma lista que já existe mais o apoio pedagógico |
| 7 | Clubes (12) | os campos que faltam são de cadastro |
| 8 | Particulares (11) | depende de plano por aluna, que é estrutura nova |
| 9 | Em aula · Slides (03) | um campo por sessão, e abre o caminho do caderno |
| 10 | Em aula · Respostas ao vivo (02) | a mais pesada: depende de leitura ao vivo do caderno |

Substituição e entrega do projeto entram antes das telas que as usam
(01, 05 e 09). Projeto (09) é meia tela depois que a entrega existir.
