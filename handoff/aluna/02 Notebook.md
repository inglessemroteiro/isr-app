# Notebook

> **Prompt para colar no Claude Code:**
> Leia `00 LEIA PRIMEIRO.md` e depois este arquivo inteiro. Implemente só a tela **Notebook** do app da aluna. Siga as regras de dados reais do 00. Antes de editar, me mostre o plano (mapeamento dos dados reais e o que falta). Espere eu aprovar. Depois de editar, rode a verificação do fim deste arquivo e me mostre o resultado.

## Layout
### Notebook (caderno da aula)
- **Faixa de sessões:** pills roláveis na horizontal, `min-width 92px`, `radius 16px`, com "S4 · 14 Oct" e o status. A sessão atual tem borda de 2px.
- **Sessão atual:**
  - pill "live now / starts 19:00";
  - hero escuro "🎯 today you will…" com o objetivo em 24px/800;
  - cartões "Class slides" e "Class recording";
  - cartões de apoio (words / sentence starters) com pills coloridas;
  - aviso 🔒 "Class activities open at 19:00" enquanto a aula não começou;
  - tarefas, uma por cartão: passo, enunciado 17px/700, textarea (`#f5f5f0`, `radius 14px`), botões ● Record e + Photo;
  - durante a aula, área para enviar foto e o botão "Add 5 words to my Review Vault" (+20 miles);
  - cartão de homework com borda colorida conforme o status.
- **Sessão passada:** pill "✓ class done · read only", hero com os botões Slides e "▶ Watch recording", "my answers in class" em modo leitura, homework (com textarea e botão "Send to …" se ainda estiver aberto) e as palavras da aula.
- **Bloqueio:** se o homework anterior não foi entregue, aparece uma faixa `#fdf3d6` no topo com o link para ele.

## Dados reais desta tela
Mapeie cada item para a fonte que já existe no app. Se não existir, marque **FALTA** no plano e pare; não invente.

- Sessões do projeto: número, data, status
- Objetivo, palavras, sentence starters e tarefas da sessão (vêm do plano do professor)
- Respostas da aluna por tarefa (salvas automaticamente)
- Status ao vivo da aula (começou ou não)
- Homework: texto, status, prazo
- Slides e gravação da sessão

## Verificação (rodar depois de implementar)
- [ ] Nenhum nome, número ou texto fictício do protótipo aparece na tela (Marianne, Tutor Dave, Priscila, Book Club, 1.240 miles etc.).
- [ ] A tela abre sem erro com uma usuária real que tenha dados e com uma sem dados (estado vazio).
- [ ] As tarefas mostradas são as que o professor publicou para aquela turma.
- [ ] A resposta digitada continua lá depois de recarregar a página.
- [ ] As atividades da aula só abrem quando a aula começa.
- [ ] O sistema de verificação e transposição de dados que já existe continua rodando e passando como antes.
