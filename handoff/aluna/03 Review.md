# Review

> **Prompt para colar no Claude Code:**
> Leia `00 LEIA PRIMEIRO.md` e depois este arquivo inteiro. Implemente só a tela **Review** do app da aluna. Siga as regras de dados reais do 00. Antes de editar, me mostre o plano (mapeamento dos dados reais e o que falta). Espere eu aprovar. Depois de editar, rode a verificação do fim deste arquivo e me mostre o resultado.

## Layout
### Review
Coluna central com `max-width 720px`.
- **Intro:** hero escuro (`radius 32px`) "today's review · about 5 min" + "Ready for today's words?" + botão coral.
- **Em andamento:** barra de passos no topo + ✕ para pausar. Os passos são:
  - flashcards (cartão de 240px de altura que vira ao clicar; botões Not yet / Almost / Yes!);
  - montar frases (chips para pôr em ordem);
  - listening (▶ coral, 🐢 slower, múltipla escolha, transcrição depois de responder);
  - speaking (gravar + 🔊 resposta modelo).
- **Fim:** "✓ done for today · +15 miles", "See you tomorrow.", botão "See my words →".
- **My words:** contadores do vault, palavras agrupadas por aula, "my own words" (formulário com palavra, significado e exemplo) e "how review works".

## Dados reais desta tela
Mapeie cada item para a fonte que já existe no app. Se não existir, marque **FALTA** no plano e pare; não invente.

- Palavras e frases do Review Vault da aluna (das aulas + próprias)
- Progresso diário e sequência
- Itens de listening e speaking por sessão

## Verificação (rodar depois de implementar)
- [ ] Nenhum nome, número ou texto fictício do protótipo aparece na tela (Marianne, Tutor Dave, Priscila, Book Club, 1.240 miles etc.).
- [ ] A tela abre sem erro com uma usuária real que tenha dados e com uma sem dados (estado vazio).
- [ ] Terminar a revisão dá +15 miles uma única vez por dia.
- [ ] A palavra adicionada em "my own words" aparece no Review.
- [ ] O sistema de verificação e transposição de dados que já existe continua rodando e passando como antes.
