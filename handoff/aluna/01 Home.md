# Home

> **Prompt para colar no Claude Code:**
> Leia `00 LEIA PRIMEIRO.md` e depois este arquivo inteiro. Implemente só a tela **Home** do app da aluna. Siga as regras de dados reais do 00. Antes de editar, me mostre o plano (mapeamento dos dados reais e o que falta). Espere eu aprovar. Depois de editar, rode a verificação do fim deste arquivo e me mostre o resultado.

## Layout
### Home ("Olá, Marianne!")
1. **Hero da próxima aula** (fundo `#164951`, `radius 24px`, `padding 26px 28px`): eyebrow coral, título 24px/800 "Projeto · Session N", linha "professor · dia hora · plataforma". À direita, o CTA coral "Join live room" e o link sublinhado "Open my notebook".
2. **This week**: título 18px/800 e contador "x of y done" à direita. Barra de progresso de 8px (`#9ec970` sobre `#f2ebe3`). Depois, uma lista de tarefas da semana (aula ao vivo, homework, revisão do dia, encontro de clube). Cada linha tem uma bolinha de 34px (✓ verde quando feita), título 15px/800, subtítulo 13px e uma pill de status à direita. A linha inteira leva à tela correspondente.
3. **Linha de 3 cartões:** "my progress" (nível + metas "I can…" em barras segmentadas) · "School feed" (avatar com inicial, nome, quando e texto) · "last class recording" (ícone ▷, título, duração).

## Dados reais desta tela
Mapeie cada item para a fonte que já existe no app. Se não existir, marque **FALTA** no plano e pare; não invente.

- Próxima aula: projeto, sessão, professor, dia, hora, plataforma, link
- Itens da semana: aula, homework, revisão do dia, encontros de clube, com status de cada um
- Progresso: nível e metas "I can…" com status
- Mural da escola: autor, quando, texto
- Última gravação: título, duração, link

## Verificação (rodar depois de implementar)
- [ ] Nenhum nome, número ou texto fictício do protótipo aparece na tela (Marianne, Tutor Dave, Priscila, Book Club, 1.240 miles etc.).
- [ ] A tela abre sem erro com uma usuária real que tenha dados e com uma sem dados (estado vazio).
- [ ] Se não houver aula na semana, o hero mostra um estado vazio em vez de dados fictícios.
- [ ] "x of y done" bate com os itens marcados como feitos.
- [ ] O sistema de verificação e transposição de dados que já existe continua rodando e passando como antes.
