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
