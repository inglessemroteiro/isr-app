# `02 Lógica do sistema` conferido contra o app

O que o arquivo de lógica descreve, linha por linha, comparado com o que
o sistema já tem hoje. Nada foi editado para escrever isto.

Três respostas: **já existe** · **existe diferente** (e em quê) ·
**FALTA** (não há nada, e construir exige cadastro novo).

---

## 1. Papéis e permissões

| Item | Situação | Onde / o que falta |
|---|---|---|
| Coordenação vê tudo | já existe | `perfilDosPapeis` → `gestora` |
| Comercial (Carla) | já existe | papel `comercial`, menu recortado em `isr-shell.js` |
| Admin/Financeiro (Érika) | já existe | papel `operacao` |
| Professora vê só o Painel | já existe | `soProfessora()` + guarda em `guardGestao` |
| Aluna vê só o app dela | já existe | `acessoPorEmail` + `aluna.html` |
| "Vendo como" só para coordenação | já existe | `gestaoVisao()`; o autor salvo continua sendo o real |
| Abas da turma por papel | **existe diferente** | hoje a professora vê 5 abas (Visão geral, Alunas, Plano, Chamadas, Materiais). **Projeto não aparece para ela**, e a tabela do 02 diz que deve aparecer. Carla vê 3, Érika não tem recorte próprio — ela vê o mesmo da gestora |
| Substituta com acesso temporário | **FALTA** | não existe substituição no sistema |

---

## 2. Entidades

| Entidade | Situação | O que falta no registro |
|---|---|---|
| Aluna | **existe diferente** | tem nome, foto, nível, status, turma, saldo. **Falta**: `formato` (grupo / particular / híbrida) como campo — hoje "particular" é inferido de outros campos — e `objetivo` da particular |
| Professora | já existe | ficha de Equipe com nome, papéis; foto e bio só a aluna tem |
| Turma | **existe diferente** | tem nome, nível, ciclo, horário, professora, projeto, capacidade, alunas. **Falta**: `formato durante a aula` (digital / papel) |
| Sessão | **existe diferente** | número, título e plano existem; o `status` (a vir / ao vivo / dada) é derivado da chamada e da aula ao vivo, não é campo. A **data** da sessão só existe depois que a chamada diz qual sessão foi. `link dos slides`: acabei de criar o campo |
| Plano da sessão | já existe | base do syllabus + ajustes por turma + rascunho/publicado, tudo em `planoDaTurma` / `salvarPlano` / `publicarPlano`. **Falta** o ajuste **por aluna** (particular) |
| Resposta no caderno | **existe diferente** | texto e comentários da professora por tarefa existem (feitos ontem). **Falta** áudio e foto |
| Homework | **existe diferente** | o texto está na turma (`tarefaCasa`) e no plano; a entrega está na chamada (`tarefas[alunaId]`). **Falta** o status de três estados (aberto / entregue / atrasado) e o prazo |
| Chamada | já existe | P/A/F/J, tópico, data real, quem salvou, quando, e conta-na-folha |
| Substituição | **FALTA** | entidade inteira |
| Clube | **existe diferente** | tem nome, descrição, professora, formato, local/link, horário, duração, vagas, encontros, status, inscritas, espera. **Faltam 3 campos**: `nível`, `bio` da professora e `é novo` (a tag "New") |
| Review Vault | já existe | `palavrasDaAluna`, revisão espaçada |
| Miles · extrato | já existe | e o saldo **é** a soma do extrato, como o arquivo exige — `moedasDe` recalcula, não guarda |
| Miles · recompensa | **existe diferente** | o catálogo é uma lista fixa no código (`MOEDAS_RESGATES`), sem estoque nem visível, e a escola não edita |
| Miles · resgate | **existe diferente** | resgatar existe (`resgatarRecompensa`). **Faltam** cancelar o resgate (com devolução) e o ajuste manual com motivo |
| Anúncio (Swap & sell) | **FALTA** | entidade inteira |
| Perfil social (scraps, depoimentos) | **FALTA** | entidade inteira |

---

## 3. Regras de negócio

| Regra | Situação |
|---|---|
| O plano vem do syllabus, a professora publica, e só o publicado vai para o caderno | já existe |
| As atividades abrem quando a aula começa e fecham quando termina | já existe (feito ontem) |
| O homework abre quando a aula termina | **FALTA** — o homework não está preso ao fim da aula |
| Tirar uma etapa vale só para aquela turma | já existe |
| Sessões passadas ficam só leitura | **FALTA** — hoje a professora edita qualquer sessão |
| Aviso de homework anterior não entregue no topo do caderno | **FALTA** |
| Particular usa o mesmo syllabus, com pular e reordenar por aluna | **FALTA** |
| Aluna híbrida: a particular revisa a sessão do grupo | **FALTA** |
| Notas da professora sobre a aluna, só a equipe vê | já existe |
| Tópico obrigatório para salvar a chamada | já existe |
| Só a chamada salva conta na folha | já existe |
| Editar uma chamada salva tira a aula da folha | já existe |
| A aula da substituta conta na folha dela | **FALTA** |
| 2 faltas seguidas geram alerta | **FALTA** — a fila pedagógica hoje tem três sinais, e nenhum é falta |
| Presença mínima de 75% com aviso para a aluna | **existe diferente** — `FREQUENCIA_MINIMA = 75` existe no cálculo; o aviso na tela da aluna não |
| Substituição pedida pela professora e atribuída pela coordenação | **FALTA** |
| Aviso de WhatsApp com menos de 24h | **FALTA** |
| Clube: 4 encontros por ciclo | já existe |
| Plano inclui 2 clubes, o 3º custa €50 | **existe diferente** — há `pagos` por clube, mas a regra dos dois inclusos não está escrita em lugar nenhum |
| 2 faltas tiram a aluna do clube e chamam a 1ª da espera | **FALTA** |
| Só clube publicado aparece no catálogo | já existe |
| Tag "New" em clube recém-publicado | **FALTA** (é o campo `é novo`) |
| Só rascunho pode ser apagado; publicado só despublica, e só sem inscritas | **existe diferente** — a tela permite remover; a trava não está no dado |
| Para publicar, exigir nome, descrição, nível, horário, 4 datas, vagas e local/link | **existe diferente** — hoje exige nome e, se presencial, endereço |
| Tabela de miles por ação | **existe diferente** — as regras existem em `MOEDAS_REGRAS`, com nomes próprios; "entrar na aula ao vivo", "responder no fórum com áudio" e "aceitar depoimento" não existem |
| Resgate desconta na hora, confere saldo e estoque | **existe diferente** — confere saldo; não há estoque |
| Cancelar resgate devolve miles e estoque | **FALTA** |
| Ajuste manual com motivo obrigatório e visível para a aluna | **FALTA** |
| Só Gabi e Érika mexem em miles, recompensas e anúncios | **FALTA** — não há esse recorte |
| Swap & sell inteiro | **FALTA** |

---

## 4. Eventos entre os apps

| Evento | Situação |
|---|---|
| Publicar o plano → caderno da aluna | já existe |
| Começar/encerrar a aula → caderno abre e fecha | já existe (o homework ainda não abre) |
| Aluna escreve → Respostas ao vivo | já existe |
| Professora comenta → caderno da aluna | já existe |
| Salvar o link dos slides → "Class slides" no caderno | **FALTA a tela** — o campo existe desde hoje, a tela do 03 e o cartão no caderno não |
| Salvar a chamada → folha, contagem do Hoje, presença da aluna, alertas | **existe diferente** — folha, contagem e presença sim; alertas não |
| Pedir substituição → coordenação (+ WhatsApp) | **FALTA** |
| Atribuir substituta → painel dela e folha | **FALTA** |
| Editar/publicar clube → catálogo da aluna | já existe |
| Anexar material ao clube → "reference material" | já existe |
| Aluna entra/sai do clube → Inscritas | já existe |
| Resgatar recompensa → Resgates para entregar · extrato | **existe diferente** — o resgate é registrado; a lista "para entregar" não existe |
| Cancelar resgate → app da aluna | **FALTA** |
| Ajustar miles → saldo e notificação | **FALTA** |
| Criar/editar/ocultar recompensa → School rewards | **FALTA** |
| Editar/ocultar/apagar anúncio ↔ Swap & sell | **FALTA** |
| Ações que dão miles → extrato, saldo, Saldos | **existe diferente** — as que existem, sim |

---

## O que isto significa para a ordem das telas

As telas **00, 04, 05, 06, 07, 08, 10** usam só o que já existe. Dá para
refazer a interface delas agora, sem cadastro novo.

As telas **01 (Hoje), 09 (Projeto), 11 (Particulares) e 12 (Clubes)**
pedem dado que não existe:

- **01 Hoje** — "Agenda de hoje" e "Fila pedagógica" existem; **pedidos
  de substituição** e **diários pendentes** não. Reuniões pedagógicas
  também não.
- **09 Projeto** — a entrega por aluna não existe; só o projeto da turma.
- **11 Particulares** — falta `objetivo` da aluna e o plano por aluna
  (pular e reordenar sessões).
- **12 Clubes** — faltam `nível`, `bio` e `é novo`.

Para essas quatro, ou eu construo o cadastro que falta (e aí não é só
interface), ou a tela sai sem o bloco e com o lugar marcado. Decisão sua,
uma de cada vez.
