# Painel do professor › Moldura (abas e navegação)

> **Prompt para colar no Claude Code:**
> Leia `00 LEIA PRIMEIRO.md`, depois `gestao/painel-professor/00 Moldura do painel.md`, depois este arquivo inteiro. Implemente só a subpágina **Moldura (abas e navegação)** do Painel do professor. Siga as regras de dados reais do 00. Antes de editar, me mostre o plano (mapeamento dos dados reais e o que falta). Espere eu aprovar. Depois de editar, rode a verificação do fim deste arquivo e me mostre o resultado.

**Onde fica:** item "Painel do professor" da sidebar. Faça esta primeiro; as outras subpáginas encaixam dentro dela.

## Mapa das subpáginas
```
Painel do professor
├── Hoje ............................ 01
│   └── Em aula (abre ao clicar "Começar aula")
│       ├── Respostas ao vivo ....... 02
│       └── Slides .................. 03
├── Minhas turmas (lista) ........... 04
│   └── Página da turma
│       ├── Visão geral ............. 05
│       ├── Alunas .................. 06
│       ├── Plano das aulas ......... 07
│       ├── Chamadas ................ 08
│       ├── Projeto ................. 09
│       └── Materiais ............... 10
├── Particulares .................... 11
└── Clubes .......................... 12
```

## Layout
- **Cabeçalho da página:** eyebrow "painel do professor" (12px/700 `#6b5749`) + título com o nome da professora (h1 800, `letter-spacing -0.035em`). O botão "+ Aula extra" fica à direita.
- **Abas principais:** Hoje · Minhas turmas · Particulares · Clubes. São pills numa linha com `gap 6px` e rolagem horizontal no mobile. A ativa tem fundo `#164951` e texto branco; as inativas têm fundo `#fff`. Padding `9px 16px`, 14px/700, radius 999px.
- **Modo "em aula":** quando a professora toca em "Começar aula", as abas principais dão lugar a uma barra com:
  - à esquerda, a pill branca "← Hoje";
  - ao lado, o texto "em aula · <turma>" (13px/700 `#6b5749`);
  - à direita, as pills "Respostas ao vivo" e "Slides".
- **Página da turma:** abre por cima da lista de Minhas turmas e tem:
  - o botão "← Minhas turmas" no topo;
  - uma linha meta com nível, horário e professora;
  - o título com o nome da turma (28px/800);
  - abas sublinhadas (14px/800, linha de 3px `#fc9082` na ativa, borda inferior `#e6dccf`).
  A professora vê as abas Visão geral, Alunas, Plano das aulas, Chamadas, Projeto e Materiais. Renovação e Financeiro **não aparecem** para ela.
- **Mobile:** as abas rolam na horizontal e os cartões viram uma coluna (`flex-wrap`).

## Regras
- A subpágina aberta fica na URL (ex.: `?tab=turmas&turma=<id>&sub=plano`). Assim, voltar e recarregar mantêm o lugar.
- Coordenação (Gabi) vendo como professora: usa o mesmo seletor "vendo como" que já existe.

## Dados reais desta subpágina
Mapeie cada item para a fonte que já existe no app. Se não existir, marque **FALTA** no plano e pare; não invente.

- Professora logada (nome, papel)
- Lista de turmas, particulares e clubes atribuídos (só para decidir quais abas mostram contagem)
- Permissões por papel (quais abas da Página da turma aparecem)

## Verificação (rodar depois de implementar)
- [ ] Nenhum nome, número ou texto fictício do protótipo aparece (Dave, Priscila, Traditions, SEG 19h etc.).
- [ ] A subpágina abre sem erro com uma professora que tem dados e com uma sem dados (estado vazio).
- [ ] A professora só vê as próprias turmas, alunas e clubes.
- [ ] As 4 abas aparecem e trocam sem recarregar a página.
- [ ] Recarregar a página mantém a aba e a subaba abertas.
- [ ] Renovação e Financeiro não aparecem para professora.
- [ ] O sistema de verificação e transposição de dados que já existe continua rodando e passando como antes.
@@@@@@@@@@
# Painel do professor › Minhas turmas

> **Prompt para colar no Claude Code:**
> Leia `00 LEIA PRIMEIRO.md`, depois `gestao/painel-professor/00 Moldura do painel.md`, depois este arquivo inteiro. Implemente só a subpágina **Minhas turmas** do Painel do professor. Siga as regras de dados reais do 00. Antes de editar, me mostre o plano (mapeamento dos dados reais e o que falta). Espere eu aprovar. Depois de editar, rode a verificação do fim deste arquivo e me mostre o resultado.

**Onde fica:** aba "Minhas turmas".

## Layout
Grade de cartões (`repeat(auto-fill,minmax(300px,1fr))`, gap 16px). Um cartão por turma da professora. Cada cartão é branco (radius 24px, overflow hidden) e a área inteira é clicável:
- **faixa no topo** com a cor do nível (`padding 10px 18px`, 12px/800): "<nível> · <nome do nível>" à esquerda e o projeto do ciclo à direita;
- **corpo** (`padding 16px 18px`, gap 8px):
  - nome da turma (18px/800);
  - "horário · x/y vagas" (13px `#1d5a63`);
  - caixa `#f5f5f0` com "esta semana · **Session N · tema**";
  - link "Abrir turma →" (13px/800 `#348a8e`).

Sem turmas: "Você ainda não tem turmas neste ciclo."

## Regras
- Clicar abre a Página da turma na aba Visão geral.
- As cores do nível são as mesmas usadas em Turmas na gestão.

## Dados reais desta subpágina
Mapeie cada item para a fonte que já existe no app. Se não existir, marque **FALTA** no plano e pare; não invente.

- Turmas atribuídas à professora: nome, nível, horário, projeto, vagas ocupadas/total
- Sessão desta semana por turma

## Verificação (rodar depois de implementar)
- [ ] Nenhum nome, número ou texto fictício do protótipo aparece (Dave, Priscila, Traditions, SEG 19h etc.).
- [ ] A subpágina abre sem erro com uma professora que tem dados e com uma sem dados (estado vazio).
- [ ] A professora só vê as próprias turmas, alunas e clubes.
- [ ] Só aparecem as turmas da professora logada.
- [ ] A ocupação bate com a da tabela/página Turmas da coordenação.
- [ ] O sistema de verificação e transposição de dados que já existe continua rodando e passando como antes.
Shell cwd was reset to /home/user/isr-app
