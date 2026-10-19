# Lógica do handoff × o que o app já tem

Resposta ao passo 0 do `00 LEIA PRIMEIRO` e ao prompt do `02 Lógica do
sistema`: para cada papel, entidade, regra e evento, se **já existe**,
**existe diferente** ou **FALTA**. Nada foi editado.

Lido: `00 LEIA PRIMEIRO`, `01 Tokens e padrões`, `02 Lógica do sistema`,
`00 Moldura do painel`, `01 Hoje`, `02 Em aula · Respostas ao vivo`,
`03 Em aula · Slides`, `12 Clubes`. **Não recebi** os arquivos 04 a 11
(Minhas turmas, Página da turma: Visão geral, Alunas, Plano das aulas,
Chamadas, Projeto, Materiais, Particulares) nem `gestao/01 Miles e loja`
e a pasta `aluna/`.

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

## 6. O que falta decidir antes de implementar

1. **A professora vê só o Painel?** O handoff diz que sim. Hoje ela vê
   seis itens de menu. Isso muda o menu dela de uma vez.
2. **Os arquivos 04 a 11.** Sem eles não dá para fazer Minhas turmas, a
   Página da turma nem Particulares no desenho novo.
3. **Dois blocos novos e grandes:** *Em aula* (respostas ao vivo +
   slides) depende de caderno ao vivo, estado da aula e comentário por
   tarefa; *Substituições* depende de uma entidade que não existe. Cada
   um é um trabalho em si, não um ajuste de tela.
4. **Clubes** precisa de seis campos novos antes de a tela existir:
   nível, os 4 encontros, bio, material, lista de espera e a marca
   "novo".

## 7. Ordem que eu proponho

| # | Tela | Por que primeiro |
|---|---|---|
| 1 | Moldura (00) | as outras encaixam dentro dela, e é o que põe a aba na URL |
| 2 | Hoje (01) | o hero em quatro estados já está feito; falta Agenda de hoje, Projeto, Turmas atribuídas e Substituições |
| 3 | Clubes (12) | é uma tela só, e os campos que faltam são de cadastro |
| 4 | Em aula · Slides (03) | um campo por sessão, e abre o caminho do caderno |
| 5 | Em aula · Respostas ao vivo (02) | a mais pesada: depende de leitura ao vivo do caderno |

Substituições entra junto com Hoje ou depois, conforme você quiser.
