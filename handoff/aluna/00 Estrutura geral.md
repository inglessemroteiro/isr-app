# Estrutura geral (sidebar, cabeçalho, mobile)

> **Prompt para colar no Claude Code:**
> Leia `00 LEIA PRIMEIRO.md` e depois este arquivo inteiro. Implemente só a tela **Estrutura geral (sidebar, cabeçalho, mobile)** do app da aluna. Siga as regras de dados reais do 00. Antes de editar, me mostre o plano (mapeamento dos dados reais e o que falta). Espere eu aprovar. Depois de editar, rode a verificação do fim deste arquivo e me mostre o resultado.

## O que é
A moldura de todas as telas da aluna. Faça esta primeiro; as outras telas encaixam dentro dela.

## Layout

**Desktop (≥ 900px):** sidebar fixa à esquerda + conteúdo principal.
- Sidebar: `240px`, fundo `#164951`, texto branco, `padding 22px 16px`, `position: sticky; height: 100vh`. De cima para baixo:
  1. logo branco;
  2. avatar de 44px com nome e "Nível · formato" (clique abre o perfil);
  3. navegação agrupada;
  4. no fim, o cartão "isr miles" (fundo `rgba(255,255,255,.08)`, `radius 16px`, número 22px/800; clique abre a loja);
  5. "Log out".
- Navegação, com rótulos de grupo de 11px/700 em `#fc9082`:
  - (sem rótulo) Home
  - **study**: Notebook, Review
  - **community**: Clubs, Profile
  - **me**: Progress, Shop, Account
  - Item: `padding 9px 12px`, `radius 12px`, 14px/600. O ativo tem fundo `rgba(255,255,255,.12)`. Badge opcional à direita em `#fc9082`.

**Mobile (< 900px):** sem sidebar. Barra inferior com 4 abas: Home ⌂, Study ✎, Community ◎, Me ◉. No topo, uma pill com o saldo de miles.

**Cabeçalho do conteúdo:** eyebrow 12px/700 `#6b5749` + título h1 800, `letter-spacing -0.035em`. À direita ficam a busca (só no desktop), o seletor EN/PT e o sino de notificações (40px, com contador coral).

**Subabas:** quando o grupo tem mais de uma tela (ex.: Notebook | Review), aparece uma barra de pills logo abaixo do título. A barra tem fundo `#fff`, `padding 6px` e `radius 999px`; a pill ativa tem fundo `#164951` e texto branco.

**Conteúdo:** fundo da página `#f2ebe3`, coluna com `gap 22px`, cartões brancos com `radius 24px` e `padding 22px 24px`. As linhas de cartões usam `display:flex; flex-wrap:wrap; gap:22px`, com cada cartão em `flex:1 1 280–320px; min-width:0`.

## Dados reais desta tela
Mapeie cada item para a fonte que já existe no app. Se não existir, marque **FALTA** no plano e pare; não invente.

- Nome, foto, nível e formato da aluna logada
- Saldo de miles e sequência de dias (cartão "isr miles")
- Contadores de badge por item do menu (se existirem)
- Notificações não lidas
- Preferência de idioma EN/PT

## Verificação (rodar depois de implementar)
- [ ] Nenhum nome, número ou texto fictício do protótipo aparece na tela (Marianne, Tutor Dave, Priscila, Book Club, 1.240 miles etc.).
- [ ] A tela abre sem erro com uma usuária real que tenha dados e com uma sem dados (estado vazio).
- [ ] No desktop aparece a sidebar; abaixo de 900px aparece a barra inferior com 4 abas.
- [ ] O saldo no cartão "isr miles" é o mesmo da tela Shop.
- [ ] Trocar EN/PT muda os rótulos e a escolha fica salva.
- [ ] O sistema de verificação e transposição de dados que já existe continua rodando e passando como antes.
