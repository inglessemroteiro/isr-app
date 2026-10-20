# Painel do professor › Hoje

> **Prompt para colar no Claude Code:**
> Leia `00 LEIA PRIMEIRO.md`, depois `gestao/painel-professor/00 Moldura do painel.md`, depois este arquivo inteiro. Implemente só a subpágina **Hoje** do Painel do professor. Siga as regras de dados reais do 00. Antes de editar, me mostre o plano (mapeamento dos dados reais e o que falta). Espere eu aprovar. Depois de editar, rode a verificação do fim deste arquivo e me mostre o resultado.

**Onde fica:** aba Hoje (a primeira, abre por padrão).

Arquivo atual no app: `ISR - Painel v3.dc.html`, aba Hoje. A sidebar, o "vendo como" e as abas Hoje / Minhas turmas / Particulares / Clubes **já existem e continuam**.

## Layout · aba Hoje (de cima para baixo)

Coluna única com `gap: 20px`. Os blocos 2 a 4 são linhas `display:flex; flex-wrap:wrap; gap:20px`. Cada cartão nessas linhas usa `flex: 1 1 320px; min-width: 0`.

### 1. Hero: uma única ação principal (substitui o hero atual E o bloco amarelo "Aulas sem chamada")
Cartão escuro com `background #164951`, texto `#fff`, `border-radius 24px`, `padding 24px`, coluna com `gap 16px`.
- Eyebrow: 12px, peso 700, cor `#fc9082`.
- Título: 28px, peso 800, `letter-spacing -0.035em`.
- Pills de status: 12px, peso 800, `padding 6px 12px`, `radius 999px`, texto `#164951`. Fundo `#9ec970` quando está ok e `#fdf3d6` quando falta algo.
- Botão principal: fundo `#fc9082`, texto `#164951`, 15px, peso 800, `padding 13px 22px`, `radius 999px`, `box-shadow 0 3px 0 #d9675a`.
- Botões secundários: fundo `rgba(255,255,255,.12)`, texto `#fff`, 14px, peso 800, `padding 12px 18px`.

**O conteúdo do hero segue a primeira regra verdadeira desta lista (só um estado por vez):**

| # | Condição | Eyebrow | Título | Botão principal | Secundários |
|---|---|---|---|---|---|
| A | Aula acontecendo agora ou ainda hoje | `próxima aula · hoje HH:MM · <turma>` | `Session N · <tema>` | ▶ Começar aula | Ver plano · Fazer chamada |
| B | Existem aulas que já aconteceram sem chamada | `N aulas sem chamada` (a contagem vai no eyebrow) | `Faça a chamada de DD/MM · <turma>` (a mais antiga) | Fazer chamada | Ver todas (abre a lista) |
| C | Próxima aula dentro de 7 dias | `próxima aula · <dia> HH:MM` | `Session N · <tema>` | Ver plano | Preparar slides |
| D | Nada disso | `sem aula marcada` | `Nenhuma aula nos próximos 7 dias` | — | Chamada de outra data |

O bloco amarelo "Aulas sem chamada" **deixa de existir** como cartão separado e passa a ser o estado B do hero. Com isso, "17 aulas sem chamada" aparece em um só lugar.

### 2. Linha "agora": Agenda de hoje | Fila pedagógica
Os dois cartões são brancos: `background #fff`, `radius 24px`, `padding 20px 22px`, coluna com `gap 12px`.
- **Agenda de hoje · <dia dd mmm>**: título 16px, peso 800. Cada linha tem `padding 10px 0` e `border-bottom 1px solid #f2ebe3`, com o horário em negrito (min-width 48px), a descrição (14px) e uma pill de status (11px, peso 800). A linha toda é clicável. Se o dia estiver vazio, mostre "Nada na agenda hoje.".
- **Fila pedagógica · N**: cada item tem emoji, título como link (`#348a8e`, sublinhado), motivo (13px, `#1d5a63`) e botão de ação escuro (`#164951`, radius 999px). Se a fila estiver vazia, mostre "Nenhuma pendência pedagógica." **Não inclua** a frase explicativa longa.

### 3. Rótulo "seu mês" + linha
Rótulo: 13px, peso 700, cor `#6b5749`, minúsculas, `margin-top 8px`.
- **Entregas do mês · <mês>**: métricas lado a lado, cada uma com `flex 1 1 110px`. O número é 24px, peso 800, `letter-spacing -0.03em`; a legenda é 12px, peso 700, `#6b5749`. Use `#a3392c` no número só quando ele indicar problema (ex.: aulas sem chamada > 0). **Não inclua** o parágrafo explicativo embaixo.
- **Projeto <nome> · entregas**: valor `x/y` à direita; barra de 10px com fundo `#f2ebe3` e preenchimento `#9ec970`; embaixo, "Faltam: nomes" (13px).
- **Turmas atribuídas**: lista com o nome em negrito e `N/M vagas →` em `#348a8e`. Clicar abre a turma.

### 4. Rótulo "substituições" + cartão
Botão "Pedir substituição". Ao clicar, o formulário abre no próprio cartão com: aula (pills), motivo (pills), observação (campo de texto) e o aviso `#fde4df` quando faltar menos de 24h. Abaixo vem a lista dos pedidos, cada um com seu status.

### Topo da página (já existe, só ajustar)
O botão "+ Aula extra" fica à direita do título. As abas usam pills com `radius 999px`: a ativa tem fundo `#164951` e texto branco; as inativas não têm fundo.

## Dados reais desta tela
Mapeie cada item para a fonte que já existe no app. Se não existir, marque **FALTA** no plano e pare; não invente.

- Próxima aula da professora (turma, sessão, tema, horário, link) para os estados A e C
- Aulas já realizadas sem chamada: contagem, data da mais antiga e turma (estado B)
- Status do preparo da aula: plano, slides e link (pills do hero)
- Agenda de hoje: horário, descrição e status de cada item
- Fila pedagógica: faltas, avaliação baixa, tarefa não entregue (título, motivo, ação)
- Entregas do mês: aulas com chamada, aulas sem chamada, alunas nas turmas, clubes
- Projeto atual: entregas feitas / total e nomes de quem falta
- Turmas atribuídas: nome e vagas ocupadas / total
- Pedidos de substituição da professora e seus status

## Verificação (rodar depois de implementar)
- [ ] Nenhum nome, número ou texto fictício do protótipo aparece na tela (Marianne, Tutor Dave, Priscila, Book Club, 1.240 miles etc.).
- [ ] A tela abre sem erro com uma usuária real que tenha dados e com uma sem dados (estado vazio).
- [ ] Com a Gabriela Brotero (sem aula nos próximos 7 dias e 17 aulas sem chamada), o hero aparece no estado B ("Faça a chamada de 04/08").
- [ ] O bloco amarelo "Aulas sem chamada" não aparece mais como cartão separado.
- [ ] Com uma professora que tem aula hoje, o hero aparece no estado A, com "Começar aula".
- [ ] Os números de Entregas do mês batem com a tabela/planilha atual.
- [ ] O sistema de verificação e transposição de dados que já existe continua rodando e passando como antes.
Shell cwd was reset to /home/user/isr-app
